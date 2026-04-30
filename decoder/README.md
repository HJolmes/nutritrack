# NutriTrack OSS-Barcode-Decoder

Standalone HTTP service: takes a JPEG/PNG, returns a decoded EAN-13/EAN-8/
UPC-A/Code-128 barcode using **OpenCV** (CNN-based `BarcodeDetector`) chained
with **pyzbar** (ZBar) as a fallback. Designed to be the **primary** server-
side decode path for NutriTrack on iOS Safari, replacing per-frame Claude
Haiku Vision calls.

## Why this exists

iOS Safari has no `BarcodeDetector` API and every WASM-based decoder we
tried (zxing-wasm, zbar-wasm, zxing-js) failed unreliably across packaging
types. Until now we used Claude Vision as the only working server fallback —
expensive, data-intensive, and limited to barcodes with a readable plain-text
EAN line. This service replaces that path with a real strip-decoder.

## Endpoints

- `GET /health` — liveness JSON, no auth.
- `POST /decode` — body is raw image bytes (`Content-Type: image/jpeg` or
  `image/png`). Returns:

  ```json
  {
    "found": true,
    "code": "4011200296909",
    "format": "EAN13",
    "source": "opencv",
    "candidates": [...],
    "elapsed_ms": 47
  }
  ```

  `found: false` when neither decoder returned a value with a valid checksum.

## Local development

```bash
cd decoder
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# macOS: brew install zbar      # libzbar0 on Linux
uvicorn main:app --reload --port 8080
```

Smoke-test with a barcode photo:

```bash
curl -s -X POST --data-binary @test-assets/sample.jpg \
  -H 'Content-Type: image/jpeg' \
  http://localhost:8080/decode | jq
```

## Bulk evaluation against real photos

Drop iPhone photos into `decoder/test-assets/` (folder is git-ignored) and
run:

```bash
python decoder/eval.py decoder/test-assets/
```

The script reports per-file hit/miss and an overall hit rate. **Target: >= 80%**.
Below that, enable the OpenCV Super-Resolution-DNN model (see below).

## Docker / Cloud Run

```bash
docker build -t nutritrack-decoder .
docker run --rm -p 8080:8080 nutritrack-decoder
```

Deploy to Google Cloud Run:

```bash
gcloud run deploy nutritrack-decoder \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated \
  --max-instances 2 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 10s
```

`--max-instances 2` caps cost: even a worst-case traffic spike cannot exceed
two warm containers. The Cloud Run **Always-Free-Tier** (2M requests/month,
360k vCPU-seconds, 180k GiB-seconds RAM) covers NutriTrack's expected volume
by orders of magnitude.

After deploy, set the resulting URL on the Cloudflare Worker:

```bash
cd ../worker
wrangler secret put DECODER_URL   # value: https://nutritrack-decoder-xxxxx-ew.a.run.app
```

## Optional: Super-Resolution-DNN

For low-resolution / noisy frames, OpenCV's barcode detector can use a
super-resolution CNN (`sr.prototxt` + `sr.caffemodel`, ~2 MB total). Download
from the OpenCV contrib repo, COPY them into the image, then set
`OPENCV_SR_PROTOTXT=/app/sr.prototxt` and `OPENCV_SR_MODEL=/app/sr.caffemodel`
as Cloud Run env vars. `_new_opencv_detector()` in `main.py` picks them up
automatically. Only do this if `eval.py` reports a hit rate below 80%.
