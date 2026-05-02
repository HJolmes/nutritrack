# NutriTrack — Übergabe

> Erste Aktion jeder Session: diese Datei lesen. Sie ist die Single Source of Truth für den aktuellen Projekt-Stand. **Knapp halten** — siehe „Pflege" unten.

**Stand:** v0.146 (2026-05-02)

## URLs

- PWA: https://hjolmes.github.io/nutritrack/
- Worker: https://nutritrack-ai-proxy.h-jolmes.workers.dev
- Decoder: https://nutritrack-decoder-294137824893.europe-west1.run.app

## Architektur (aktueller Live-Stand)

- **Theme (v0.144):** Cream `#faf6f1`, Coral `#e96e3c`, Fraunces+Inter. Override-Block `/* BLOOM REDESIGN */` am Ende von `<style>`.
- **Screens:** `mainScreen` (Heute, Hero-kcal, 2×2-Mahlzeiten-Grid), `historyScreen`, `mealDetailScreen`, `statsScreen`, `moreScreen`. Bottom-Nav mit 5 Items, `switchTab(tab)` mappt via `data-tab`, `'stats'`→`'trends'`.
- **Datenkompatibilität:** Alte IDs (`tP/tC/tF`, `entries-<meal>` …) bleiben befüllt parallel zu neuen Grid-IDs (`kcal-<meal>`, `mealsTotal` …).
- **Feedback (v0.146):** Globaler FAB `#feedbackFab` (`bottom:84px;right:12px`, `z-index:400`) vor `</body>`, auf `setupScreen` versteckt. Modal `feedbackOv` → Bug/Wunsch + Beschreibung + optional Auto-Screenshot (lazy `html2canvas@1.4.1`, JPEG 0.8, ≤1200px). Section-Marker: `// SECTION: FEEDBACK`.
- **Share/Import:** Sender → `POST /share` (Worker, KV, 1y TTL) → `?s=<id>` auf PWA-Origin. Empfänger: Android öffnet PWA via `handle_links`; iOS-Safari (non-standalone) bekommt `iosSwitchOv`-Anleitung + Auto-Clipboard, User wechselt zur PWA und tippt 📥 (`openImportPaste()`). Legacy-URL-Formen `#x=`/`#r=`/`workers.dev/s/<id>` bleiben kompatibel.
- **Payload-Schema (base64-JSON):** `{t:'r'|'f'|'m', …}`.

## Worker-Endpoints

| Endpoint | Zweck |
|---|---|
| `GET /health` | Status + `codeVersion` |
| `POST /v1/messages` | Anthropic-Proxy (Token-Auth) |
| `POST /decode-barcode` | OSS-Decoder + optional Vision-Fallback |
| `POST /share` / `GET /share/<id>` | KV-Shortener |
| `GET /s/<id>` | Legacy-Redirect |
| `POST /feedback` | erstellt GitHub-Issue, optional Screenshot-Commit auf Branch `feedback-screenshots` |

**Bindings/Secrets:** `ANTHROPIC_API_KEY`, `NUTRITRACK_PROXY_TOKEN`, `DECODER_URL`, `SHARE_KV` (KV `873c9976307f4af087ff8205ba957b1c`), `GITHUB_TOKEN` (fine-grained PAT, `hjolmes/nutritrack`, Issues+Contents read+write), opt. `GITHUB_REPO`.

## Code-Suchpfade

`index.html`: `// SECTION: SHARE & IMPORT`, `// SECTION: FEEDBACK`, `_isIos()`, `_isPwaStandalone()`, `_checkSharedItemOnBoot()`, `_showIosBrowserToAppFlow()`, `openImportPaste()`, `openFeedback()`. Modale: `shareItemOv`, `importPasteOv`, `importConfirmOv`, `iosSwitchOv`, `feedbackOv`.

`worker/src/index.js`: `// ─── SHARE-LINK SHORTENER`, `// ─── FEEDBACK ENDPOINT`. Funktionen: `handleShareCreate/Lookup/Redirect`, `generateShareId` (Base58, 7 Zeichen), `handleFeedback`, `ensureFeedbackBranch`, `uploadFeedbackScreenshot`.

`manifest.json`: `handle_links: "preferred"`, `launch_handler.client_mode: "navigate-existing"`.

`sw.js`: SKIP-Liste enthält `workers.dev`, `is.gd`, `v.gd`, `unpkg.com`.

## Live-Test offen

- v0.142 Android Direct-PWA-Open (PWA-Reinstall ggf. nötig)
- v0.143 iOS-Safari-Handoff 3-Schritt-Flow
- v0.144 Bloom-Redesign in echter PWA
- v0.145/0.146 Feedback-Flow End-to-End (braucht Worker-Deploy mit `GITHUB_TOKEN`)

## Versions-Historie (letzte 5)

| Version | PR | Was |
|---|---|---|
| v0.142 | #43 | Kurzlink auf PWA-Origin → Android öffnet PWA direkt |
| v0.143 | #43 | iOS-Safari-Handoff via Zwischenablage |
| v0.144 | #45 | Bloom-Redesign + 5-Tab-Bottom-Nav + Mahlzeit-Detail |
| v0.145 | — | Feedback-Button (Header je Screen) + Worker `/feedback` |
| v0.146 | #48 | Feedback als globaler FAB statt Header-Buttons |

---

## Pflege (PFLICHT)

Diese Datei muss **knapp** bleiben — so viel wie nötig, so wenig wie möglich.

Bei jedem deployablen Merge:

1. `Stand` aktualisieren.
2. Architektur-Sektion **überschreiben statt anhängen** — sie beschreibt nur den aktuellen Live-Zustand, keine Änderungs-Chronik. Veraltete oder durch Folge-Versionen ersetzte Bullets entfernen.
3. Erledigte Live-Tests aus „Live-Test offen" streichen.
4. Versions-Historie auf die letzten **5 Einträge** kürzen.

Verboten in dieser Datei: pro-Version-Architektur-Beschreibungen, Wiederholungen aus `CLAUDE.md`/`AGENTS.md` (Versioning-Workflow, Git-Workflow, Datenschutz, Cross-Platform-Regel), Cost/Limits-Tabellen, Wunschlisten für Folge-Iterationen (gehören in GitHub-Issues).
