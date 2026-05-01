"""Local evaluator: iterate a folder of barcode images, report hit rate.

Usage:
    python decoder/eval.py decoder/test-assets/

Reads JPG/PNG/HEIC files (HEIC via Pillow + pillow-heif if installed),
runs the same pipeline as main.py, prints per-file results and a final
hit-rate summary. Use to validate the OpenCV+pyzbar pipeline against real
iPhone photos before deploying.
"""

from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np

from main import _decode_opencv, _decode_pyzbar, _valid_checksum

EXTS = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp", ".bmp"}


def _read_gray(path: Path) -> np.ndarray | None:
    if path.suffix.lower() in {".heic", ".heif"}:
        try:
            from PIL import Image
            import pillow_heif

            pillow_heif.register_heif_opener()
            img = Image.open(path).convert("L")
            return np.asarray(img, dtype=np.uint8)
        except Exception as e:
            print(f"  ! HEIC decode failed ({e}); install pillow-heif")
            return None
    img = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
    return img


def main(folder: str) -> int:
    root = Path(folder)
    if not root.is_dir():
        print(f"Not a directory: {folder}", file=sys.stderr)
        return 2

    files = sorted(p for p in root.iterdir() if p.suffix.lower() in EXTS)
    if not files:
        print(f"No images found in {folder}")
        return 1

    hits = 0
    for path in files:
        gray = _read_gray(path)
        if gray is None:
            print(f"{path.name}: SKIP (decode error)")
            continue

        result = _decode_opencv(gray) or _decode_pyzbar(gray)
        if result and _valid_checksum(result["value"]):
            hits += 1
            print(f"{path.name}: HIT  {result['value']:>14} via {result['source']}/{result['format']}")
        elif result:
            print(f"{path.name}: BAD  {result['value']!r} via {result['source']} (checksum failed)")
        else:
            print(f"{path.name}: MISS")

    print()
    print(f"Hit rate: {hits}/{len(files)} = {100 * hits / len(files):.1f}%")
    print("Target: >= 80%. Below that, add OpenCV Super-Resolution-DNN model.")
    return 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python decoder/eval.py <folder>", file=sys.stderr)
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
