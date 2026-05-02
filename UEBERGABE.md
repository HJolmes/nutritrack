# NutriTrack — Übergabe

> Erste Aktion jeder Session: diese Datei lesen. Sie ist die Single Source of Truth für den aktuellen Projekt-Stand. **Knapp halten** — siehe „Pflege" unten.

**Stand:** v0.152 (2026-05-02)

## URLs

- PWA: https://hjolmes.github.io/nutritrack/
- Worker: https://nutritrack-ai-proxy.h-jolmes.workers.dev
- Decoder: https://nutritrack-decoder-294137824893.europe-west1.run.app

## Architektur (aktueller Live-Stand)

- **Theme (v0.144):** Cream `#faf6f1`, Coral `#e96e3c`, Fraunces+Inter. Override-Block `/* BLOOM REDESIGN */` am Ende von `<style>`.
- **Screens:** `mainScreen` (Heute, Hero-kcal, 2×2-Mahlzeiten-Grid), `historyScreen`, `mealDetailScreen`, `statsScreen`, `moreScreen`. Bottom-Nav mit 5 Items, `switchTab(tab)` mappt via `data-tab`, `'stats'`→`'trends'`.
- **Datenkompatibilität:** Alte IDs (`tP/tC/tF`, `entries-<meal>` …) bleiben befüllt parallel zu neuen Grid-IDs (`kcal-<meal>`, `mealsTotal` …).
- **Feedback (v0.148/0.152):** Globaler FAB `#feedbackFab` (`bottom:84px;right:12px`, `z-index:400`) vor `</body>`, auf `setupScreen` versteckt. Modal `feedbackOv` (eigener `z-index:350`, sitzt über anderen Modalen). Layout: Type-Buttons → Textarea → Senden → ausklappbares `<details id="feedbackShotDetails">` mit „📸 Sichtbarer Ausschnitt" (lazy `html2canvas@1.4.1`, captured nur Viewport via `x/y/width/height`+`windowWidth/Height`) + „📁 Eigenes Foto…" (`#feedbackPhotoInput`, max 8 MB, JPEG 0.8/≤1200px in `attachFeedbackPhoto`). `attachFeedbackScreenshot` nutzt `foreignObjectRendering:false`, `imageTimeout:8000`, `ignoreElements`-Filter für `feedbackOv` und macht bei Fehler einen Auto-Retry mit `allowTaint:true`; Fehlertext geht in Toast (max 80 Zeichen) + `console.error('[feedback] …')`. Section-Marker: `// SECTION: FEEDBACK`.
- **Header (v0.149/0.151):** `mainScreen`/`statsScreen` ohne `📤 shareData` — nur `?` `📥` `⚙️`. Backup nur via Settings/Datensicherung, „Mehr"-Hub-Eintrag, OneDrive-Banner und Backup-Reminder. `historyScreen`/`mealDetailScreen`/`moreScreen` haben minimale Header. `mainScreen` zeigt zusätzlich rechts neben „Hej <Name>" einen kleinen klickbaren Versions-Tag `#appVersionTag` (öffnet `whatsNewOv`); Text kommt beim DOMContentLoaded aus `APP_VERSION`.
- **Kalorien-Ampel (v0.149):** `_kcalAmpel(goal,eaten,S)` vor `renderAll()` — ±10 % grün; darüber/darunter abhängig von Diät-Richtung (lose/gain/maintain), abgeleitet aus `S.goalWeight` vs `S.weight ±0.5`. `kcalTrendPill`-Klassen `balanced`/`over`.
- **KI-Tagesbewertung (v0.150):** `requestKIRating(ev)` baut Prompt mit Per-Mahlzeit-Makros (kcal · P · K · F), Gesamt-Makros und Makro-Zielen aus `getMacroTargets()`. Leere KI-Antwort → Toast + Button-Reset; `max_tokens=300`, model `claude-haiku-4-5`.
- **Mahlzeit-Detail (v0.151):** Nur noch `📋 Vorlage` als CTA im Body — `mdAdd`-Button entfernt. Stattdessen wird der zentrale `＋` der Bottom-Nav (`#cbMealDetail`) in `renderMealDetail` auf `openPicker('<meal>')` umgebogen, sodass er die geöffnete Mahlzeit als Kontext nutzt.
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

- v0.148 Feedback-Modal vor offenem anderen Modal (z-index), Viewport-Screenshot, „📁 Eigenes Foto…"
- v0.149 Kalorien-Ampel pro Diät-Richtung (lose/gain/maintain mit/ohne Zielgewicht)
- v0.150 KI-Tagesbewertung mit Makros + leere-Antwort-Toast
- v0.151 Versions-Tag im Heute-Header (klickbar → Was ist neu) + zentraler ＋ im Mahlzeit-Detail nutzt offene Mahlzeit, „+ Zutat"-Button entfernt
- v0.152 Feedback-Screenshot: Auto-Retry + genauerer Toast bei Fehler (Repro auf Android Chrome 147 / Edge wenn möglich)

## Versions-Historie (letzte 5)

| Version | PR | Was |
|---|---|---|
| v0.148 | — | Feedback: z-index über anderen Modals + Viewport-Screenshot + Layout (Senden direkt unter Textfeld, Screenshot ausklappbar, „📁 Eigenes Foto…") (#54, #56, #57) |
| v0.149 | — | Header ohne 📤 + Kalorien-Ampel ±10 %/diät-zielabhängig (#52, #53) |
| v0.150 | — | KI-Tagesbewertung mit Per-Mahlzeit-Makros + leere-Antwort-Handling (#55) |
| v0.151 | #65 | Versions-Tag im Heute-Header + zentraler ＋ im Mahlzeit-Detail mahlzeitenkontextsensitiv, „+ Zutat" entfernt (#62, #64) |
| v0.152 | — | Feedback-Screenshot robuster (foreignObject aus, Image-Timeout, Auto-Retry, genauerer Fehler-Toast) (#61) |

---

## Pflege (PFLICHT)

Diese Datei muss **knapp** bleiben — so viel wie nötig, so wenig wie möglich.

Bei jedem deployablen Merge:

1. `Stand` aktualisieren.
2. Architektur-Sektion **überschreiben statt anhängen** — sie beschreibt nur den aktuellen Live-Zustand, keine Änderungs-Chronik. Veraltete oder durch Folge-Versionen ersetzte Bullets entfernen.
3. Erledigte Live-Tests aus „Live-Test offen" streichen.
4. Versions-Historie auf die letzten **5 Einträge** kürzen.

Verboten in dieser Datei: pro-Version-Architektur-Beschreibungen, Wiederholungen aus `CLAUDE.md`/`AGENTS.md` (Versioning-Workflow, Git-Workflow, Datenschutz, Cross-Platform-Regel), Cost/Limits-Tabellen, Wunschlisten für Folge-Iterationen (gehören in GitHub-Issues).
