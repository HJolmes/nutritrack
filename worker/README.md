# NutriTrack Cloudflare AI Proxy

This Worker proxies NutriTrack AI requests to Anthropic so the real Anthropic API key is never shipped to the browser.

## Endpoints

- `GET  /health` – status JSON, no auth.
- `POST /v1/messages` – generic Anthropic Messages proxy (used by KI-Foto/Chat features). Body is JSON forwarded to `api.anthropic.com/v1/messages`.
- `POST /ai/messages` – configurable third-party AI provider proxy. Same Anthropic-style JSON body as `/v1/messages`, plus headers `x-ai-provider` (`openai`|`gemini`|`openrouter`|`mistral`|`deepseek`) and `x-ai-key` (the user's own provider key, supplied per request, never stored or logged). The Worker translates the request to the provider's format (OpenAI Chat Completions or Gemini `generateContent`) and returns the answer back in Anthropic schema (`{content:[{type:"text",text}]}`) so the client is unchanged. On provider error/limit (or image sent to a non-vision provider → `415`) the client transparently falls back to `/v1/messages` (Anthropic).
- `POST /decode-barcode` – live barcode decoder. Body is a raw JPEG (max 200 KB). Returns `{ ok: true, data: { code, found, source, ... } }`. Used by the Barcode-Tab (live frames on browsers without `BarcodeDetector`, and the 📸 photo button) in addition to the local WASM decoders.
- `POST /share` – speichert einen Share-Code (Rezept / Mahlzeit / Lebensmittel) in KV und gibt eine 7-Zeichen-Kurz-ID zurück. Body: `{"code":"<base64>"}` (max 256 KB Body, Code max 204.800 Zeichen). Antwort: `{ok:true,data:{id,short}}`. TTL: 1 Jahr. Kein Secret und kein Token erforderlich; ein Browser-Aufruf von fremder Origin wird abgelehnt.
- `POST /baby/sync` · `GET /baby/sync?since=<srev>` – Abgleich des Baby-Tagebuchs zwischen zwei Geräten einer Familie. Header `X-Baby-Room` trägt einen 32-stelligen Zufallsstring, den die PWA erzeugt; gespeichert wird unter `bd:<room>:<entryId>` (TTL 400 Tage). **Der Worker sieht nur `{id, rev, iv, ct}`** – `ct` ist AES-GCM-Chiffrat, dessen Schlüssel ausschließlich im Kopplungs-Code der beiden Geräte steckt und nie übertragen wird. Weder Einträge noch Tageszuordnung sind serverseitig lesbar, und Ernährungsdaten werden hier grundsätzlich nicht übertragen. Ein Push mit älterer `rev` als der gespeicherte Stand wird verworfen (`outdated`), sonst könnte ein nachzügelndes Gerät die neuere Fassung des anderen überschreiben. Der Cursor `srev` kommt von der Worker-Uhr, nicht vom Client – bei Uhrzeit-Versatz zwischen zwei Handys gingen sonst Einträge verloren. Kein Proxy-Token nötig, CORS auf die PWA-Origins beschränkt.
- `POST /shop/sync` · `GET /shop/sync?since=<srev>` – Abgleich des Einkaufszettels zwischen zwei Geräten. **Identische Mechanik wie `/baby/sync`** (gemeinsame Handler `handleSyncPush`/`handleSyncPull`), aber eigener Header `X-Shop-Room` und eigener KV-Präfix `sl:` — ein Zettel-Code gibt damit nicht das Baby-Tagebuch frei. Eigenes PBKDF2-Salt im Client (`nutritrack-shop|<room>`), also auch bei identischem Code verschiedene Schlüssel.
- `GET  /s/<id>` – schlägt die Kurz-ID in KV nach und antwortet mit einer Mini-HTML-Seite, die per `location.replace()` zu `https://hjolmes.github.io/nutritrack/#x=<code>` weiterleitet (Fragment-Redirect via Location-Header ist nicht zuverlässig in allen Browsern).

  **Decode pipeline (OSS only, no AI since #209):**
  1. Posts the JPEG to the OSS-Decoder microservice at `DECODER_URL` (OpenCV `BarcodeDetector` + pyzbar — see `decoder/`). A hit with a valid check digit returns immediately; `source` is passed through from the decoder (`opencv`/`pyzbar`, `opencv` if the decoder sends none). Free, ~30–150 ms warm.
  2. Otherwise returns `{ found: false, source: "opencv-miss" }` so the client can fall back to local decoders / manual entry.
  3. Without `DECODER_URL` the endpoint answers `500 worker_not_configured`. There is no Vision fallback any more (the former `ENABLE_VISION_FALLBACK` flag is gone and ignored if still set in the dashboard).

Weitere Endpunkte mit derselben Briefkasten-Mechanik wie `/shop/sync`: `POST|GET /partner/sync` (`X-Partner-Room`, Präfix `pm:`) und `POST|GET /plan/sync` (`X-Plan-Room`, Präfix `mp:`). Dazu `POST /workout` + `GET /workouts` (Apple-/Samsung-Health über Kurzbefehl/Tasker, `X-User-Token`), `POST /alexa/inbox` + `GET /alexa/inbox` + `POST /alexa/ack` (Alexa-Skill, `X-User-Token`), `POST /feedback` (legt ein GitHub-Issue an), `GET /fetch?u=` (Rezept-Import), `GET /off?u=` (OpenFoodFacts) und `GET /share/<id>`.

### Wer was braucht

Nur diese Endpunkte verlangen den Header `x-app-proxy-secret` (= `NUTRITRACK_PROXY_TOKEN`): `POST /v1/messages`, `POST /ai/messages`, `POST /decode-barcode`, `POST /feedback`, `GET /fetch`.

Ohne Secret laufen:
- `POST /share`, `GET /share/<id>`, `GET /s/<id>`, `GET /off`, `GET /health` – ohne jede Kennung.
- `/baby/sync`, `/shop/sync`, `/partner/sync`, `/plan/sync` – nur mit dem Raum-Header (24–64 Zeichen, von der PWA erzeugt).
- `/workout`, `/workouts`, `/alexa/*` – nur mit `X-User-Token` (24–64 Zeichen, von der PWA erzeugt). Kurzbefehl, Tasker und die Alexa-Lambda senden **keinen** `Origin`-Header; eine Origin-Pflicht würde sie brechen.

Der Worker prüft Raum und Token nur auf ihr Format, nicht gegen eine Nutzerliste. Die Origin-Prüfung (`ALLOWED_ORIGINS`) greift nur, wenn der Header mitkommt: Sie hält Aufrufe **fremder Webseiten im Browser** ab (Browser senden bei jedem Cross-Origin-POST `Origin`), aber keine Skripte – `curl` setzt jeden Origin. Sie ist kein Schutz des KV-Kontingents.

### Grenzen und Fehlerantworten

- Jede Body-Grenze gilt für die tatsächlich gelesenen Bytes, nicht nur für `Content-Length`: Ein chunked Upload ohne Längenangabe wird beim Überschreiten abgebrochen (`413`). Grenzen: `/v1` und `/ai` 4 MB, `/feedback` 1,5 MB, Sync-Push 512 KB, `/share` 256 KB, `/decode-barcode` 200 KB, `/alexa/*` 8 KB, `/workout` 4 KB.
- Ein JSON-Body, der kein Objekt ist (`null`, Array, Zahl), ergibt `400 invalid_json`.
- Jede unbehandelte Ausnahme (z. B. KV wirft, weil das Tageskontingent erschöpft ist) wird zu `500 internal_error` als JSON **mit** CORS-Headern, damit die App eine Meldung statt „Server nicht erreichbar" sieht.
- `/fetch` verfolgt Weiterleitungen selbst (höchstens 5) und prüft jedes Ziel: nur `http(s)`, keine Adress-Literale aus privaten, Loopback-, Link-local-, CGNAT- (100.64/10) oder Multicast-Netzen, bei IPv6 nur Global Unicast (2000::/3, ohne 6to4 und Teredo), keine Namen `localhost`, `*.localhost`, `*.local`, `*.internal` (auch mit Punkt am Ende). Namen, die per DNS auf private Adressen zeigen, erkennt der Worker nicht. Die Seite wird höchstens bis 2 MB gelesen.
- `/feedback` nimmt als Screenshot nur JPEG (Base64 beginnt mit `/9j/`); schlägt der Upload fehl, steht im öffentlichen Issue nur „upload threw", die echte Meldung im Worker-Log.
- Ein Abruf (`GET`) mit frei gewähltem Raum/Token kostet ein `list`, aber keinen Schreibzugriff mehr: Die Änderungsmarke wird nur nachgetragen, wenn das `list` Schlüssel gefunden hat (#260). Schreibende POSTs (`/share`, `/workout`, `/alexa/*`, Sync-Pushes) laufen weiter ohne App-Secret. Das KV-Kontingent schützt der Tarif Workers Paid (Entscheidung 2026-10-01), nicht der Code.

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

## KV-Storage für Share-Link-Shortener (seit v0.140)

Damit `POST /share` und `GET /s/<id>` funktionieren, braucht der Worker einen KV-Namespace mit Binding-Name `SHARE_KV`.

**Einmaliger Setup via Wrangler:**

```bash
wrangler kv namespace create nutritrack-shares
# → Output enthaelt eine ID, z.B.:
#   { binding = "SHARE_KV", id = "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d" }
```

Dann in `wrangler.toml` die `id` unter `[[kv_namespaces]]` ersetzen (`REPLACE_WITH_KV_NAMESPACE_ID`).

**Alternativ via Cloudflare Dashboard:**

1. `Workers & Pages` → `KV` → `Create namespace` → Name `nutritrack-shares`.
2. Worker auswählen → `Settings` → `Variables and Secrets` → `KV Namespace Bindings` → `Add binding`:
   - Variable name: `SHARE_KV`
   - KV namespace: `nutritrack-shares`

Health-Check `GET /health` zeigt `shareConfigured: true` wenn der Binding aktiv ist. Ist KV nicht konfiguriert, gibt der Worker `503 kv_not_configured` zurück und die PWA fällt automatisch auf is.gd / Originallink zurück.

Tarif: Workers Paid (seit 2026-10-01, #260). Das KV-Kontingent ist damit eine Kostenfrage statt einer harten Tagesgrenze; die Kosten je Vorgang stehen in der Cloudflare-Preisliste.

TTL pro Eintrag: 1 Jahr (`SHARE_TTL_SECONDS`). Löschung läuft automatisch.

Derselbe Namespace trägt seit v0.225 auch den Baby-Tagebuch-Sync (`bd:`-Präfix, `babySyncConfigured`) und seit v0.227 den Einkaufszettel (`sl:`-Präfix, `shopSyncConfigured`). Ein Push kostet je Record einen Write plus einen für die Änderungsmarke. Ein Abruf ohne Änderung kostet ein Read – außer in den 2 min nach einem Push und bei einem Briefkasten ohne Schlüssel und ohne Marke (noch leer, oder geleert und Marke abgelaufen); dann kommt ein `list` dazu.

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

Before deployment (runs in `.github/workflows/checks.yml`, Node 22, no npm, nothing leaves the machine):

```bash
node tools/worker-test.js
```

After deployment:

- `GET /health` should return a JSON status.
- A `POST /v1/messages` request without `x-app-proxy-secret` should return `401`.
- A request with the wrong token should return `401`.
- A valid request from `https://hjolmes.github.io` should reach Anthropic.
