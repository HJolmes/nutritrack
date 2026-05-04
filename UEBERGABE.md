# NutriTrack — Übergabe

> Erste Aktion jeder Session: diese Datei lesen. Sie ist die Single Source of Truth für den aktuellen Projekt-Stand. **Knapp halten** — siehe „Pflege" unten.

**Stand:** v0.156 (2026-05-04)

## URLs

- PWA: https://hjolmes.github.io/nutritrack/
- Worker: https://nutritrack-ai-proxy.h-jolmes.workers.dev
- Decoder: https://nutritrack-decoder-294137824893.europe-west1.run.app

## Architektur (aktueller Live-Stand)

- **Theme (v0.144):** Cream `#faf6f1`, Coral `#e96e3c`, Fraunces+Inter. Override-Block `/* BLOOM REDESIGN */` am Ende von `<style>`.
- **Screens:** `mainScreen` (Heute, Hero-kcal, 2×2-Mahlzeiten-Grid), `historyScreen`, `mealDetailScreen`, `statsScreen`, `moreScreen`. Bottom-Nav mit 5 Items, `switchTab(tab)` mappt via `data-tab`, `'stats'`→`'trends'`.
- **Datenkompatibilität:** Alte IDs (`tP/tC/tF`, `entries-<meal>` …) bleiben befüllt parallel zu neuen Grid-IDs (`kcal-<meal>`, `mealsTotal` …).
- **Feedback (v0.154):** Globaler FAB `#feedbackFab` (`bottom:84px;right:12px`, `z-index:400`) vor `</body>`, auf `setupScreen` versteckt. Modal `feedbackOv` (eigener `z-index:350`, sitzt über anderen Modalen). Layout: Type-Buttons → Textarea → Senden → ausklappbares `<details id="feedbackShotDetails">` mit „📸 Screenshot" (lazy `html2canvas@1.4.1`, captured ganze Page — kein Viewport-Crop, weil das mit Bottom-Sheets unzuverlässig war) + „📁 Eigenes Foto…" (`#feedbackPhotoInput`, max 8 MB, JPEG 0.8/≤1200px in `attachFeedbackPhoto`). `attachFeedbackScreenshot` nutzt `scale:0.7`, `foreignObjectRendering:false`, `imageTimeout:8000`, `ignoreElements`-Filter für `feedbackOv`, Auto-Retry bei Fehler mit `allowTaint:true`; Fehlertext geht in Toast (max 80 Zeichen) + `console.error('[feedback] …')`. Section-Marker: `// SECTION: FEEDBACK`.
- **Header (v0.149/0.155):** `mainScreen`/`statsScreen` ohne `📤 shareData` und ohne `⚙️` — nur `?` `📥`. Backup nur via Settings/Datensicherung, „Mehr"-Hub-Eintrag, OneDrive-Banner und Backup-Reminder. `historyScreen`/`mealDetailScreen`/`moreScreen` haben minimale Header. `mainScreen` zeigt zusätzlich rechts neben „Hej <Name>" einen kleinen klickbaren Versions-Tag `#appVersionTag` (öffnet `whatsNewOv`); Text kommt beim DOMContentLoaded aus `APP_VERSION`.
- **Kalorien-Ampel (v0.149):** `_kcalAmpel(goal,eaten,S)` vor `renderAll()` — ±10 % grün; darüber/darunter abhängig von Diät-Richtung (lose/gain/maintain), abgeleitet aus `S.goalWeight` vs `S.weight ±0.5`. `kcalTrendPill`-Klassen `balanced`/`over`.
- **KI-Tagesbewertung (v0.150):** `requestKIRating(ev)` baut Prompt mit Per-Mahlzeit-Makros (kcal · P · K · F), Gesamt-Makros und Makro-Zielen aus `getMacroTargets()`. Leere KI-Antwort → Toast + Button-Reset; `max_tokens=300`, model `claude-haiku-4-5`.
- **Mahlzeit-Detail (v0.151):** Nur noch `📋 Vorlage` als CTA im Body — kein separater Zutat-Button. Der zentrale `＋` der Bottom-Nav (`#cbMealDetail`) wird in `renderMealDetail` auf `openPicker('<meal>')` umgebogen, sodass er die geöffnete Mahlzeit als Kontext nutzt.
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

`index.html`: `// SECTION: SHARE & IMPORT`, `// SECTION: FEEDBACK`, `_isIos()`, `_isPwaStandalone()`, `_checkSharedItemOnBoot()`, `_showIosBrowserToAppFlow()`, `openImportPaste()`, `openFeedback()`. Modale: `shareItemOv`, `importPasteOv`, `importConfirmOv`, `iosSwitchOv`, `feedbackOv`, `mealDetailScreen`.

`worker/src/index.js`: `// ─── SHARE-LINK SHORTENER`, `// ─── FEEDBACK ENDPOINT`. Funktionen: `handleShareCreate/Lookup/Redirect`, `generateShareId` (Base58, 7 Zeichen), `handleFeedback`, `ensureFeedbackBranch`, `uploadFeedbackScreenshot`.

`manifest.json`: `handle_links: "preferred"`, `launch_handler.client_mode: "navigate-existing"`.

`sw.js`: SKIP-Liste enthält `workers.dev`, `is.gd`, `v.gd`, `unpkg.com`.

## Live-Test offen

- v0.148 Feedback-Modal vor offenem anderen Modal (z-index), „📁 Eigenes Foto…"
- v0.149 Kalorien-Ampel pro Diät-Richtung (lose/gain/maintain mit/ohne Zielgewicht)
- v0.150 KI-Tagesbewertung mit Makros + leere-Antwort-Toast
- v0.154 Feedback-Screenshot wieder Full-Page (Viewport-Crop entfernt, Bottom-Sheets jetzt vollständig im Bild)
- v0.155 (revertiert) Mahlzeit-Detail als Bottom Sheet — zurückgedreht in v0.156
- v0.156 ⚙️ aus Hauptseite/Trends entfernt; „Was ist neu" zeigt komplette History (#70, #71)

## Versions-Historie (letzte 5)

| Version | PR | Was |
|---|---|---|
| v0.152 | #66 | Feedback-Screenshot robuster (foreignObject aus, Image-Timeout, Auto-Retry, genauerer Fehler-Toast) (#61) |
| v0.153 | #68 | Feedback-Screenshot: Versuch Bottom-Sheet-Modale per Pixel-Freeze zu erfassen (klappte nicht — siehe v0.154) (#67) |
| v0.154 | — | Feedback-Screenshot wieder Full-Page (Viewport-Crop entfernt, revertiert #56) (#67) |
| v0.155 | #73 | Mahlzeit-Detail → Bottom Sheet; ⚙️ entfernt; Was-ist-neu-History — Bottom Sheet in v0.156 revertiert |
| v0.156 | — | Revert Bottom Sheet (#72); ⚙️ entfernt + Was-ist-neu-History bleiben (#70, #71) |

---

## Pflege (PFLICHT)

Diese Datei muss **knapp** bleiben — so viel wie nötig, so wenig wie möglich.

Bei jedem deployablen Merge:

1. `Stand` aktualisieren.
2. Architektur-Sektion **überschreiben statt anhängen** — sie beschreibt nur den aktuellen Live-Zustand, keine Änderungs-Chronik. Veraltete oder durch Folge-Versionen ersetzte Bullets entfernen.
3. Erledigte Live-Tests aus „Live-Test offen" streichen.
4. Versions-Historie auf die letzten **5 Einträge** kürzen.

Verboten in dieser Datei: pro-Version-Architektur-Beschreibungen, Wiederholungen aus `CLAUDE.md`/`AGENTS.md` (Versioning-Workflow, Git-Workflow, Datenschutz, Cross-Platform-Regel), Cost/Limits-Tabellen, Wunschlisten für Folge-Iterationen (gehören in GitHub-Issues).
