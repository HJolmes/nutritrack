"""NutriTrack OSS-Barcode-Decoder.

Standalone HTTP service that takes a JPEG/PNG and returns a decoded
EAN/UPC/Code-128 barcode using OpenCV (CNN-based BarcodeDetector) with
pyzbar as a chained fallback. Deployed on Google Cloud Run, called by the
NutriTrack Cloudflare Worker before any LLM-Vision fallback.
"""

from __future__ import annotations

import io
import os
import re
import time
from typing import Optional

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pyzbar import pyzbar

app = FastAPI(title="NutriTrack OSS-Barcode-Decoder", version="1.0.0")

MAX_BYTES = 1024 * 1024  # 1 MB hard cap; live frames are ~50–200 KB.
SR_PROTO = os.environ.get("OPENCV_SR_PROTOTXT")  # optional super-resolution
SR_MODEL = os.environ.get("OPENCV_SR_MODEL")

_DIGITS_RE = re.compile(r"^\d+$")


def _valid_checksum(code: str) -> bool:
    """Mirrors worker/src/index.js isValidBarcodeChecksum exactly."""
    if not isinstance(code, str) or not _DIGITS_RE.match(code):
        return False
    if len(code) not in (8, 12, 13):
        return True  # Code-128/39 etc. — let through
    padded = ("0" + code) if len(code) == 12 else code
    if len(padded) == 13:
        s_odd = sum(int(padded[i]) for i in range(0, 12, 2))
        s_even = sum(int(padded[i]) for i in range(1, 12, 2))
        total = s_odd + s_even * 3
        expected = (10 - (total % 10)) % 10
        return expected == int(padded[12])
    if len(code) == 8:
        s = sum(int(code[i]) * (3 if i % 2 == 0 else 1) for i in range(7))
        expected = (10 - (s % 10)) % 10
        return expected == int(code[7])
    return True


def _new_opencv_detector():
    """OpenCV BarcodeDetector with optional Super-Resolution-DNN."""
    if SR_PROTO and SR_MODEL and os.path.exists(SR_PROTO) and os.path.exists(SR_MODEL):
        return cv2.barcode.BarcodeDetector(SR_PROTO, SR_MODEL)
    return cv2.barcode.BarcodeDetector()


_DETECTOR = _new_opencv_detector()


def _decode_opencv(gray: np.ndarray) -> Optional[dict]:
    try:
        ok, decoded, types, _points = _DETECTOR.detectAndDecodeWithType(gray)
    except Exception:
        return None
    if not ok or decoded is None:
        return None
    for value, fmt in zip(decoded, types or []):
        if value:
            return {"value": value, "format": fmt or "UNKNOWN", "source": "opencv"}
    return None


def _decode_pyzbar(gray: np.ndarray) -> Optional[dict]:
    try:
        results = pyzbar.decode(gray)
    except Exception:
        return None
    for r in results:
        try:
            value = r.data.decode("utf-8", errors="ignore")
        except Exception:
            value = ""
        if value:
            return {"value": value, "format": r.type or "UNKNOWN", "source": "pyzbar"}
    return None


def _load_gray(buffer: bytes) -> np.ndarray:
    arr = np.frombuffer(buffer, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise HTTPException(status_code=400, detail="invalid_image")
    return img


@app.get("/health")
def health():
    return {
        "service": "nutritrack-oss-decoder",
        "ok": True,
        "sr_loaded": bool(SR_PROTO and SR_MODEL and os.path.exists(SR_PROTO or "")),
    }


@app.post("/decode")
async def decode(request: Request):
    body = await request.body()
    if not body:
        raise HTTPException(status_code=400, detail="empty_body")
    if len(body) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="body_too_large")

    started = time.perf_counter()
    gray = _load_gray(body)

    candidates = []
    for decoder in (_decode_opencv, _decode_pyzbar):
        result = decoder(gray)
        if result is None:
            continue
        candidates.append(result)
        if _valid_checksum(result["value"]):
            elapsed = int((time.perf_counter() - started) * 1000)
            return JSONResponse(
                {
                    "found": True,
                    "code": result["value"],
                    "format": result["format"],
                    "source": result["source"],
                    "candidates": candidates,
                    "elapsed_ms": elapsed,
                }
            )

    elapsed = int((time.perf_counter() - started) * 1000)
    return JSONResponse(
        {
            "found": False,
            "code": None,
            "format": None,
            "source": None,
            "candidates": candidates,
            "elapsed_ms": elapsed,
        }
    )


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8080"))
    uvicorn.run(app, host="0.0.0.0", port=port)
