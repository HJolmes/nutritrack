# NutriTrack — Übergabe

> Erste Aktion jeder Session: diese Datei lesen. Sie ist die Single Source of Truth für den aktuellen Projekt-Stand. **Knapp halten** — siehe „Pflege" unten.

**Stand:** v0.181 (2026-06-18)

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
- **Picker Chat (v0.175–v0.177):** Foto-Tab und Chat-Tab vollständig entkoppelt. Chat-Nachrichten mit aktivem Foto (`window._pickerPhotoB64`) gehen als Image-Content an `claude-sonnet-4-6`; ohne Foto `claude-haiku-4-5`. Reihenfolge: `pickerSendChat` → `pickerChatLocalSearch(msg)` (tokenisierte Fuzzy-Suche **nur** über Rezepte + Custom Foods, max 6 Treffer) → Treffer als Karten via `pickerChatAddLocal(i)`; bei 0 Treffern oder Klick auf „🤖 Stattdessen KI fragen" → `pickerChatKiFallback(msg)`. Rezept-Treffer landen direkt in der Mahlzeit + `closePicker()`; per100-Treffer setzen `pickerIngredients` und rendern die Zutaten-Liste. OFT-Anbindung im Chat ist raus. Lokale Suche funktioniert offline; KI-Fallback verlangt `isOnline`.
- **Picker Chat Fuzzy-Suche (v0.176/v0.177/v0.178):** `_pickerFold` (ä→a, ö→o, ü→u, ß→s) + `_pickerTok` (Stoppwörter: mit/und/von/der/die/das/im/in/zum/zur/an/am/auf/bei/zu/…) + `_pickerLev` (Levenshtein) + `_pickerScoreName`. **Alle** Query-Tokens müssen treffen (sonst Score 0) — kein „Joghurt Natur"-Treffer mehr für „Joghurt mit Früchten". Pro-Token-Score: === +5, startsWith +4, includes +3, Levenshtein ≤1 (Länge 5–7) bzw. ≤2 (Länge ≥8) +1–2 — kein Levenshtein unter Länge 5, sonst Distraktoren wie „kaffee"↔„waffel" (#117). Voller-Query-Substring zusätzlich +10. Rezepte werden um +10 geboostet vor Custom Foods (+6). Cache und eingebaute DB werden im Chat-Tab nicht durchsucht.
- **Layout-Fixes (v0.167):** bnav `margin:0 14px` → `margin:0 0` (horizontale Margins verursachten 14 px Rechtsversatz bei `position:fixed`+`left:50%`+`translateX(-50%)`). iOS PWA: `focusout`-Handler setzt `window.scrollTo(0,0)` nach Tastatur-Dismiss (nur `_isIos()&&_isPwaStandalone()`).
- **iOS Safe-Area-Top (v0.168):** `.hdr` und `#mealDetailScreen .md-head` erhalten `padding-top: calc(…px + env(safe-area-inset-top, 0px))` — Screen-Header-Buttons auf allen Screens unterhalb der iOS Status-Bar / Dynamic Island (#104).
- **Trends (v0.169):** `renderWeekBars()` schließt heutigen Tag aus avg/cnt aus. `requestWeekReport()` erkennt Zielrichtung (lose/gain/maintain) aus `S.goalWeight vs S.weight`, übergibt sie an den Prompt, Format auf Stichpunkte + Empfehlung für nächste Woche, Token-Limit 200→400 (#102 #103).
- **Picker Ing-Delete (v0.175):** `pickerRenderIngList`-Callbacks rendern nach `splice` neu (Helper `_pickerChatRebind` im Chat, lokale `rebindLink`-Closure im Link-Tab). Photo-Tab war via `pickerShowPhotoResult` schon ok. Vorher blieben gelöschte DOM-Zeilen sichtbar (#112).
- **Picker OFT (v0.170):** kcal-Fallback `P*4+K*4+F*9` in `pickerFetchOnline` und `lookupNutrients` wenn beide Energy-Felder fehlen (#96 #101). OFT im Chat-Tab seit v0.175 nicht mehr genutzt.
- **Picker Foto-Save (v0.179):** Settings-Toggle `S.savePickerPhotos` (Default off) unter „🗂 Daten → 📷 Picker-Fotos". Wenn an, ruft `_pickerSavePhotoIfWanted()` in `_pickerAdd` (vor `closePicker()`) auf — versucht zuerst `navigator.share({files:[File]})` (iOS Safari + Android Chrome unterstützen Files seit iOS 15 / Chrome 89), Fallback `<a download>` (Android: nach `Downloads/`; iOS PWA: nicht garantiert). Hinweis-Zeile `#pickerPhotoSaveHint` unter `pickerPrevWrap` zeigt Status und navigiert tippbar zu Einstellungen/Daten. Web-Capture (`<input capture>`) legt das Foto sonst weder auf iOS noch zuverlässig auf Android in die Galerie (#118).
- **KI-Fehler (v0.180):** `aiFriendlyError(raw)` direkt vor `callClaude()` übersetzt bekannte Transient-Fehler (Usage-/Spend-Limit, `429` Rate-Limit, `529`/Overload, Timeout) zentral in deutsche Nutzer-Hinweise; unbekannte Fehler bleiben unverändert. Gilt für **alle** KI-Aufrufer (Picker-Chat/Foto, Wochenbericht, Barcode-Fallback). Hinweis: das eigentliche Anthropic-Limit ist operativ (Konsole), nicht im Code (#121).
- **Wiederkehrende Mahlzeiten (v0.181):** Mahlzeit-Vorlagen (`S.mealTemplates`) haben optional `repeat:[Wochentage 0–6]`. `applyRecurringMeals()` (Hook ganz am Anfang von `renderAll()`) trägt passende Vorlagen am echten heutigen Tag einmalig in `tpl.meal` ein; `day._recur[id]` verhindert Doppel-/Wiedereintrag (an dem Tag gelöschte Einträge bleiben weg). Kein Backfill (`S.currentDate===today()`). Wochentag-Toggles in `openTemplateOv` via `toggleTemplateWeekday`; beim Aktivieren wird der heutige Tag als erledigt markiert (kein Sofort-Duplikat aus einer gerade gebauten Vorlage). Labels: `_recurLabel` („Werktags"/„Täglich"). (#122)
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

- v0.181 Wiederkehrende Mahlzeiten: Mahlzeit als Vorlage speichern → in „📋 Vorlage" Mo–Fr antippen → an einem Werktag (neuer Tag/Reload) trägt sich die Vorlage automatisch ein; Eintrag an einem Tag löschen → kommt an dem Tag nicht wieder; am Wochenende kein Auto-Eintrag (#122)
- v0.180 KI-Fehler: bei erschöpftem Limit/Überlastung zeigt der Picker-Chat (und Foto/Wochenbericht) einen deutschen Hinweis statt englischer Originalmeldung — schwer zu provozieren, ggf. Worker temporär einen 429/Limit-Fehler werfen lassen (#121)
- v0.157 Mahlzeit-Detail „💾 Als Rezept" — Rezept aus Mahlzeit erstellen, Editor öffnet zum Benennen (#75)
- v0.158 Sport-Sync: Worker-Endpoints `/workout` + `/workouts` deployen (`wrangler deploy` im `worker/`), in „Mehr → Sport-Sync" Token erzeugen, je eine iOS-Shortcut-Automation und ein Android-HTTP-Request-Shortcut bauen, echtes Workout durchspielen → in PWA muss „Apple"/„Samsung"-Badge erscheinen, Hero-kcal um den Wert reduziert sein
- v0.159 OneDrive Reconnect-Modal: Token ablaufen lassen (oder manuell `_odClearTokens()` in DevTools), dann sync triggern → `odReconnectOv` muss aufgehen; „Neu verbinden" startet PKCE-Flow neu
- v0.160 Mehr-Screen: Bibliothek-Row tippen → öffnet direkt Bibliothek (nicht allg. Einstellungen); Einstellungen hat keinen 📚-Tab mehr; Layout auf Android korrekt
- v0.162 Feedback-Screenshot: Picker/Overlay offen → Feedback → Screenshot → Bild zeigt aktiven Overlay, nicht mainScreen
- v0.163 Chat + Foto: Foto analysieren → Chat öffnet sich → Rückfrage stellen mit Foto-Kontext möglich
- v0.168 iOS: mealDetailScreen und alle anderen Screens — Buttons im Header tippbar trotz Dynamic Island / Status-Bar (#104)
- v0.169 Trends: Kcal-Durchschnitt ohne heutigen Tag; KI-Bericht mit Stichpunkten + Zielrichtung + Empfehlung (#102 #103)
- v0.170 Picker Chat: Curry / Dean & David → OFT findet mehr Produkte dank kcal-Macro-Fallback (#96 #101)
- v0.175 Picker Chat: „Joghurt mit Müsli" (eigenes Rezept) tippen → erscheint als Lokal-Treffer-Karte; ＋ trägt das Rezept direkt in die Mahlzeit ein. Unbekanntes Lebensmittel → KI-Fallback springt ein (#113)
- v0.175 Picker (Chat + Link): Zutat aus erkannter Liste löschen → DOM-Zeile verschwindet sofort (#112)
- v0.176 Picker Chat Fuzzy: „Jogurt mit Frucht" findet „Joghurt mit Früchten und Müsli"; „hänchen" findet „Hähnchenbrust"; Teil-Phrasen werden Wort-für-Wort gewichtet
- v0.177 Picker Chat: Suche nur in Rezepten + Custom Foods, Alle-Tokens-müssen-treffen → „Joghurt mit Früchten" liefert kein „Joghurt Natur" oder „Früchte gemischt" mehr
- v0.178 Picker Chat: „Waffel" findet nicht mehr „Kaffee mit Milch"; „Jogurt" findet weiter „Joghurt"; „Frucht" findet weiter „Früchten" (#117)
- v0.179 Picker Foto-Save: Toggle in Einstellungen → Daten aktivieren; Foto im Picker aufnehmen + Mahlzeit hinzufügen → System-Share-Sheet (iOS: „In Fotos sichern"; Android: Galerie/Download); Toggle aus → Hinweis-Link unter Foto zeigt Einstellungs-Verweis, kein Save (#118)

## Versions-Historie (letzte 5)

| Version | PR | Was |
|---|---|---|
| v0.177 | #116 | Picker Chat: nur eigene Sachen, alle Tokens müssen treffen |
| v0.178 | — | Picker Chat: strengere Fuzzy-Toleranz — kein „Kaffee mit Milch" bei „Waffel" (#117) |
| v0.179 | — | Picker Foto: optionales Sichern per Share-Sheet, Toggle in Einstellungen (#118) |
| v0.180 | — | KI-Fehler: freundliche deutsche Hinweise bei Limit/Überlastung statt englischer Rohmeldung (#121) |
| v0.181 | — | Wiederkehrende Mahlzeiten: Vorlagen mit Wochentag-Auswahl tragen sich automatisch ein (#122) |

---

## Pflege (PFLICHT)

Diese Datei muss **knapp** bleiben — so viel wie nötig, so wenig wie möglich.

Bei jedem deployablen Merge:

1. `Stand` aktualisieren.
2. Architektur-Sektion **überschreiben statt anhängen** — sie beschreibt nur den aktuellen Live-Zustand, keine Änderungs-Chronik. Veraltete oder durch Folge-Versionen ersetzte Bullets entfernen.
3. Erledigte Live-Tests aus „Live-Test offen" streichen.
4. Versions-Historie auf die letzten **5 Einträge** kürzen.

Verboten in dieser Datei: pro-Version-Architektur-Beschreibungen, Wiederholungen aus `CLAUDE.md`/`AGENTS.md` (Versioning-Workflow, Git-Workflow, Datenschutz, Cross-Platform-Regel), Cost/Limits-Tabellen, Wunschlisten für Folge-Iterationen (gehören in GitHub-Issues).
