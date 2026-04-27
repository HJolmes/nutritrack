# NutriTrack Cloudflare AI Proxy

This Worker proxies NutriTrack AI requests to Anthropic so the real Anthropic API key is never shipped to the browser.

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
9. Note the Worker URL, for example:
   - `https://nutritrack-ai-proxy.<your-subdomain>.workers.dev`
10. In `index.html`, set:
   - `AI_PROXY_URL` to `<Worker URL>/v1/messages`
   - `AI_PROXY_TOKEN` to the same value as `NUTRITRACK_PROXY_TOKEN`

## GitHub Setup

Do not commit `ANTHROPIC_API_KEY`, `NUTRITRACK_PROXY_TOKEN`, `.dev.vars`, exported backups, or local test data.

If you deploy the Worker manually through Cloudflare or local Wrangler, GitHub does not need these app secrets.

If you later want GitHub Actions to deploy the Worker:

1. Open `HJolmes/nutritrack` on GitHub.
2. Go to `Settings` -> `Secrets and variables` -> `Actions`.
3. Add `CLOUDFLARE_ACCOUNT_ID`.
4. Add `CLOUDFLARE_API_TOKEN` with Worker deploy permissions.
5. Keep `ANTHROPIC_API_KEY` and `NUTRITRACK_PROXY_TOKEN` in Cloudflare Worker secrets unless a CI workflow explicitly needs to manage them.

## Smoke Tests

After deployment:

- A `POST /v1/messages` request without `X-NutriTrack-Proxy-Token` should return `401`.
- A request with the wrong token should return `401`.
- A valid request from `https://hjolmes.github.io` should reach Anthropic.
