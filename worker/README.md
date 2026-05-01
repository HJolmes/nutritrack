# NutriTrack Cloudflare AI Proxy

This Worker proxies NutriTrack AI requests to Anthropic so the real Anthropic API key is never shipped to the browser.

## Endpoints

- `GET  /health` – status JSON, no auth.
- `POST /v1/messages` – generic Anthropic Messages proxy (used by KI-Foto/Chat features). Body is JSON forwarded to `api.anthropic.com/v1/messages`.
- `POST /decode-barcode` – live barcode decoder. Body is a raw JPEG (max 200 KB). Returns `{ ok: true, data: { code, found, source, ... } }`. Used by the Barcode-Tab to decode each frame on iPhones where local WASM decoders fail.

  **Decode pipeline (since v0.137):**
  1. **Primary path:** posts the JPEG to the OSS-Decoder microservice at `DECODER_URL` (OpenCV `BarcodeDetector` + pyzbar — see `decoder/`). Hit returns immediately with `source: "opencv"`. Free, ~30–150 ms warm.
  2. **Fallback (only when `ENABLE_VISION_FALLBACK=true`):** sends the frame to Claude Haiku 4.5 Vision. Returns `source: "anthropic"` on hit. Costs money — leave disabled in production unless OSS-Decoder hit rate is unacceptable.
  3. **Otherwise:** returns `{ found: false, source: "opencv-miss" }` so the client can fall back to local decoders / manual entry.

All POST endpoints require the `x-app-proxy-secret` header to match `NUTRITRACK_PROXY_TOKEN`.

## Cloudflare Setup

1. Open the Cloudflare Dashboard.
2. Go to `Workers & Pages`.
3. Create a Worker named `nutritrack-ai-proxy`.
4. Deploy the Worker from this `worker/` folder, or paste `src/index.js` into the Cloudflare editor.
5. Open the Worker settings.
6. Go to `Settings` -> `Variables and Secrets`.
7. Add a secret:
   - Name: `ANTHROPIC_API_KEY`
   - Value: your real Anthropic API key
8. Add a second secret:
   - Name: `NUTRITRACK_PROXY_TOKEN`
   - Value: a long random token, 32+ characters
8b. Add the OSS-Decoder URL as a secret:
   - Name: `DECODER_URL`
   - Value: the Cloud Run service URL from `decoder/README.md`, e.g. `https://nutritrack-decoder-xxxxx-ew.a.run.app`
9. Note the Worker URL, for example:
   - `https://nutritrack-ai-proxy.<your-subdomain>.workers.dev`
10. In `index.html`, set:
   - `PROJECT_AI_PROXY_URL` to `<Worker URL>/v1/messages`
   - `PROJECT_AI_PROXY_SECRET` to the same value as `NUTRITRACK_PROXY_TOKEN`

## GitHub Setup

Do not commit `ANTHROPIC_API_KEY`, `NUTRITRACK_PROXY_TOKEN`, `.dev.vars`, exported backups, or local test data.

If you deploy the Worker manually through Cloudflare or local Wrangler, GitHub does not need these app secrets.

If you later want GitHub Actions to deploy the Worker:

1. Open `HJolmes/nutritrack` on GitHub.
2. Go to `Settings` -> `Secrets and variables` -> `Actions`.
3. Add `CLOUDFLARE_ACCOUNT_ID`.
4. Add `CLOUDFLARE_API_TOKEN` with Worker deploy permissions.
5. Keep `ANTHROPIC_API_KEY` and `NUTRITRACK_PROXY_TOKEN` in Cloudflare Worker secrets unless a CI workflow explicitly needs to manage them.

The static GitHub Pages frontend has no build step. If you add one later, pass only public values to the browser build. The app token is visible to browser users and is not a strong secret.

## Local Token Generation

PowerShell:

```powershell
-join ((48..57 + 65..90 + 97..122) | Get-Random -Count 48 | ForEach-Object {[char]$_})
```

## Smoke Tests

After deployment:

- `GET /health` should return a JSON status.
- A `POST /v1/messages` request without `x-app-proxy-secret` should return `401`.
- A request with the wrong token should return `401`.
- A valid request from `https://hjolmes.github.io` should reach Anthropic.
