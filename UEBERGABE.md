# NutriTrack — Übergabe

> Erste Aktion jeder Session: diese Datei lesen. Sie ist die Single Source of Truth für den aktuellen Projekt-Stand. **Knapp halten** — siehe „Pflege" unten.

**Stand:** v0.164 (2026-05-04)

## URLs

- PWA: https://hjolmes.github.io/nutritrack/
- Worker: https://nutritrack-ai-proxy.h-jolmes.workers.dev
- Decoder: https://nutritrack-decoder-294137824893.europe-west1.run.app

## Architektur (aktueller Live-Stand)

- **Theme (v0.144):** Cream `#faf6f1`, Coral `#e96e3c`, Fraunces+Inter. Override-Block `/* BLOOM REDESIGN */` am Ende von `<style>`.
- **Screens:** `mainScreen` (Heute, Hero-kcal, 2×2-Mahlzeiten-Grid), `historyScreen`, `mealDetailScreen`, `statsScreen`, `moreScreen`. Bottom-Nav mit 5 Items, `switchTab(tab)` mappt via `data-tab`, `'stats'`→`'trends'`.
- **Datenkompatibilität:** Alte IDs (`tP/tC/tF`, `entries-<meal>` …) bleiben befüllt parallel zu neuen Grid-IDs (`kcal-<meal>`, `mealsTotal` …).
- **Feedback (v0.154/v0.162):** Globaler FAB `#feedbackFab` (`bottom:calc(84px + env(safe-area-inset-bottom,0));right:12px`, `z-index:400`) vor `</body>`, auf `setupScreen` versteckt. Modal `feedbackOv` (eigener `z-index:350`). `attachFeedbackScreenshot` friert alle `.ov.open`-Elemente (außer `feedbackOv`) vor dem Capture als `position:absolute` mit berechneten Pixel-Koordinaten ein und stellt sie danach zurück — damit werden offene Overlays korrekt erfasst (#87). `scale:0.7`, `foreignObjectRendering:false`, `imageTimeout:8000`, `ignoreElements`-Filter für `feedbackOv`, Auto-Retry mit `allowTaint:true`. Section-Marker: `// SECTION: FEEDBACK`.
- **Header (v0.149/0.155):** `mainScreen`/`statsScreen` ohne `📤 shareData` und ohne `⚙️` — nur `?` `📥`. Backup nur via Settings/Datensicherung, „Mehr"-Hub-Eintrag, OneDrive-Banner und Backup-Reminder. `historyScreen`/`mealDetailScreen`/`moreScreen` haben minimale Header. `mainScreen` zeigt zusätzlich rechts neben „Hej <Name>" einen kleinen klickbaren Versions-Tag `#appVersionTag` (öffnet `whatsNewOv`); Text kommt beim DOMContentLoaded aus `APP_VERSION`.
- **Kalorien-Ampel (v0.149):** `_kcalAmpel(goal,eaten,S)` vor `renderAll()` — ±10 % grün; darüber/darunter abhängig von Diät-Richtung (lose/gain/maintain), abgeleitet aus `S.goalWeight` vs `S.weight ±0.5`. `kcalTrendPill`-Klassen `balanced`/`over`.
- **Mehr-Screen (v0.160):** 📚 Bibliothek-Row navigiert direkt zu `settSetTab('bibliothek')` — kein Umweg durch Settings nötig. Bibliothek-Tab ist aus der Settings-Tab-Bar entfernt (nur noch über Mehr → 📚 erreichbar). `.lr-name`/`.lr-sub` mit `text-overflow:ellipsis`.
- **Safe-Area (v0.161):** `viewport-fit=cover` im Viewport-Meta; `.bnav` margin-bottom + `body` padding-bottom + `.fb-fab` bottom jeweils `calc(…px + env(safe-area-inset-bottom,0))` — Bottom-Nav auf iPhone (Home-Indikator) und Android (Gesten-Navigation) vollständig sichtbar.
- **Mahlzeit-Detail (v0.151/0.157):** CTAs im Body: `📋 Vorlage` (`#mdTpl` → `openTemplateOv`) + `💾 Als Rezept` (`#mdSaveRecipe` → `saveMealAsRecipe`, nur sichtbar wenn Einträge vorhanden). Der zentrale `＋` der Bottom-Nav (`#cbMealDetail`) wird in `renderMealDetail` auf `openPicker('<meal>')` umgebogen. `saveMealAsRecipe(meal)` flacht alle Einträge zu Zutaten ab (Recipe-Einträge anteilig nach `portions`, Single-Foods 1:1), persistiert das Rezept sofort in `recipes`, setzt `recEditOpenedFrom='mealDetail'` und öffnet `recEditOv` direkt zum Benennen. `recEditSave`/`recEditDelete` springen nur dann zurück in Settings, wenn `recEditOpenedFrom!=='mealDetail'`.
- **Share/Import:** Sender → `POST /share` (Worker, KV, 1y TTL) → `?s=<id>` auf PWA-Origin. Empfänger: Android öffnet PWA via `handle_links`; iOS-Safari (non-standalone) bekommt `iosSwitchOv`-Anleitung + Auto-Clipboard, User wechselt zur PWA und tippt 📥 (`openImportPaste()`). Legacy-URL-Formen `#x=`/`#r=`/`workers.dev/s/<id>` bleiben kompatibel.
- **Payload-Schema (base64-JSON):** `{t:'r'|'f'|'m', …}`.
- **OneDrive Reconnect (v0.159):** `_odGetToken()` unterscheidet Auth-Fehler (`invalid_grant`, `interaction_required`, `unauthorized_client`) von Netzwerkfehlern — nur bei echten Auth-Fehlern werden Tokens gelöscht + sofort `odReconnectOv`-Modal geöffnet (Bottom-Sheet, `.ov`-Klasse, `_odShowReconnect()`). Netzwerkfehler löschen Tokens nicht mehr.
- **OneDrive Autospeicher-Fix (v0.159):** Doppelte `_odAutoSync()`-Definition entfernt — die zweite Definition (rief `oneDriveSyncUp()` auf) überschrieb die erste (rief `oneDriveSyncSlot()` auf). Jetzt wird täglich korrekt ein Autospeicher-Slot gefüllt.
- **Picker Chat (v0.163/v0.164):** Nach Foto-Analyse wechselt der Picker automatisch in den Chat-Tab; Analyse-Zusammenfassung erscheint als erste KI-Nachricht. Chat-Nachrichten mit aktivem Foto (`window._pickerPhotoB64`) gehen als Image-Content an `claude-sonnet-4-6`; ohne Foto bleibt es bei `claude-haiku-4-5`. `pickerResetPhoto()` setzt Chat-Placeholder zurück. Chat-Tab sucht zuerst in OpenFoodFacts (`pickerChatOftSearch` → corsproxy → `cgi/search.pl`); Treffer erscheinen als wählbare Karten (`pickerChatAddOft(i)`); kein Treffer → KI-Fallback via `pickerChatKiFallback(msg)`; „🤖 Stattdessen KI fragen"-Link überspringt OFT.
- **Sport-Sync (v0.158):** Erstes ausgelagertes Modul `js/health-sync.js` (klassisches `<script>` vor `</body>`, exportiert `window.NTHealth`). User generiert in „Mehr → Sport-Sync" ein 32-Zeichen-Token (Base58-ish, `localStorage.nt_health_token`), trägt es in eine iOS-Shortcut-Automation („wenn Training endet") oder Android HTTP Request Shortcut ein. Automation POSTet `{id, source, type, start, kcal, durationSec?, distanceM?, hrAvg?}` mit Header `X-User-Token` an Worker `POST /workout` (KV-Key `wo:<token>:<id>`, TTL 60d). PWA pollt `GET /workouts?since=<lastpoll>` bei `DOMContentLoaded` (mit 800ms Delay) und `visibilitychange→visible`, dedupliziert via `_healthId`-Marker, hängt Workouts in `S.days[<localDate>].exercise[]` an (Schema bleibt kompatibel zur manuellen Erfassung) — die existierende `burned`-Subtraktion in `renderAll()` zieht die Kalorien automatisch vom Tagesziel ab. `renderExercise()` zeigt für `_source`-Einträge ein kleines „Apple"/„Samsung"-Badge.

## Worker-Endpoints

| Endpoint | Zweck |
|---|---|
| `GET /health` | Status + `codeVersion` |
| `POST /v1/messages` | Anthropic-Proxy (Token-Auth) |
| `POST /decode-barcode` | OSS-Decoder + optional Vision-Fallback |
| `POST /share` / `GET /share/<id>` | KV-Shortener |
| `GET /s/<id>` | Legacy-Redirect |
| `POST /feedback` | erstellt GitHub-Issue, optional Screenshot-Commit auf Branch `feedback-screenshots` |
| `POST /workout` | Apple/Samsung Workout-Ingest (Header `X-User-Token`, KV `wo:<token>:<id>`, 60d TTL) |
| `GET /workouts?since=<ms>` | Liste aller Workouts eines Tokens seit Timestamp (PWA-Polling) |

**Bindings/Secrets:** `ANTHROPIC_API_KEY`, `NUTRITRACK_PROXY_TOKEN`, `DECODER_URL`, `SHARE_KV` (KV `873c9976307f4af087ff8205ba957b1c`), `GITHUB_TOKEN` (fine-grained PAT, `hjolmes/nutritrack`, Issues+Contents read+write), opt. `GITHUB_REPO`.

## Code-Suchpfade

`index.html`: `// SECTION: SHARE & IMPORT`, `// SECTION: FEEDBACK`, `// SECTION: HEALTH SYNC`, `_isIos()`, `_isPwaStandalone()`, `_checkSharedItemOnBoot()`, `_showIosBrowserToAppFlow()`, `openImportPaste()`, `openFeedback()`, `openHealthSync()`. Modale: `shareItemOv`, `importPasteOv`, `importConfirmOv`, `iosSwitchOv`, `feedbackOv`, `healthSyncOv`, `mealDetailScreen`.

`js/health-sync.js`: `window.NTHealth` (`getToken/setToken/clearToken/generateToken/getWorkerBase/sync/onMutation/shortcutInstructions`). Append-Pfad: `_appendWorkout` → `S.days[<localDate>].exercise[]` mit `_healthId`/`_source`-Markern, dann `saveS()` + `renderAll()`.

`worker/src/index.js`: `// ─── SHARE-LINK SHORTENER`, `// ─── FEEDBACK ENDPOINT`, `// ─── HEALTH WORKOUT INGEST`. Funktionen: `handleShareCreate/Lookup/Redirect`, `generateShareId` (Base58, 7 Zeichen), `handleFeedback`, `ensureFeedbackBranch`, `uploadFeedbackScreenshot`, `handleWorkoutCreate`, `handleWorkoutList`, `sanitizeWorkout`, `readUserToken` (Token-Format `^[A-Za-z0-9_-]{24,64}$`).

`manifest.json`: `handle_links: "preferred"`, `launch_handler.client_mode: "navigate-existing"`.

`sw.js`: SKIP-Liste enthält `workers.dev`, `is.gd`, `v.gd`, `unpkg.com`.

## Live-Test offen

- v0.157 Mahlzeit-Detail „💾 Als Rezept" — Rezept aus Mahlzeit erstellen, Editor öffnet zum Benennen (#75)
- v0.158 Sport-Sync: Worker-Endpoints `/workout` + `/workouts` deployen (`wrangler deploy` im `worker/`), in „Mehr → Sport-Sync" Token erzeugen, je eine iOS-Shortcut-Automation und ein Android-HTTP-Request-Shortcut bauen, echtes Workout durchspielen → in PWA muss „Apple"/„Samsung"-Badge erscheinen, Hero-kcal um den Wert reduziert sein
- v0.159 OneDrive Reconnect-Modal: Token ablaufen lassen (oder manuell `_odClearTokens()` in DevTools), dann sync triggern → `odReconnectOv` muss aufgehen; „Neu verbinden" startet PKCE-Flow neu
- v0.160 Mehr-Screen: Bibliothek-Row tippen → öffnet direkt Bibliothek (nicht allg. Einstellungen); Einstellungen hat keinen 📚-Tab mehr; Layout auf Android korrekt
- v0.161 Safe-Area: iPhone + Android — bnav + ＋-Button vollständig über System-UI sichtbar; KI-Tagesreport-Button ist verschwunden
- v0.162 Feedback-Screenshot: Picker/Overlay offen → Feedback → Screenshot → Bild zeigt aktiven Overlay, nicht mainScreen
- v0.163 Chat + Foto: Foto analysieren → Chat öffnet sich → Rückfrage stellen mit Foto-Kontext möglich
- v0.164 OFT im Chat: „Dean & David Caesar Salat" eingeben → OFT-Karte erscheint; unbekanntes Lebensmittel → KI-Fallback

## Versions-Historie (letzte 5)

| Version | PR | Was |
|---|---|---|
| v0.160 | #90 | Bibliothek direkt aus Mehr-Tab (#84, #85); Layout-Fix moreScreen (#86) |
| v0.161 | #91 | KI-Tagesreport entfernt (#81); Safe-Area iOS + Android (#88) |
| v0.162 | #92 | Feedback-Screenshot zeigt aktiven Screen korrekt — fixed→absolute Freeze (#87) |
| v0.163 | #93 | Foto-Analyse öffnet Chat-Tab; Foto als Kontext in Chat-Nachrichten (#80) |
| v0.164 | #94 | OFT-Textsuche im Chat-Tab; Markenprodukte als Karten; KI-Fallback (#79) |

---

## Pflege (PFLICHT)

Diese Datei muss **knapp** bleiben — so viel wie nötig, so wenig wie möglich.

Bei jedem deployablen Merge:

1. `Stand` aktualisieren.
2. Architektur-Sektion **überschreiben statt anhängen** — sie beschreibt nur den aktuellen Live-Zustand, keine Änderungs-Chronik. Veraltete oder durch Folge-Versionen ersetzte Bullets entfernen.
3. Erledigte Live-Tests aus „Live-Test offen" streichen.
4. Versions-Historie auf die letzten **5 Einträge** kürzen.

Verboten in dieser Datei: pro-Version-Architektur-Beschreibungen, Wiederholungen aus `CLAUDE.md`/`AGENTS.md` (Versioning-Workflow, Git-Workflow, Datenschutz, Cross-Platform-Regel), Cost/Limits-Tabellen, Wunschlisten für Folge-Iterationen (gehören in GitHub-Issues).
