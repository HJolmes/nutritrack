# NutriTrack — Übergabe

> Erste Aktion jeder Session: diese Datei lesen. Sie ist die Single Source of Truth für den aktuellen Projekt-Stand. **Knapp halten** — siehe „Pflege" unten.

**Stand:** v0.223 (2026-07-27) — Branch `claude/ios-overscroll-fix-8a81kc` (iOS: kein Scroll-Rücksprung beim Überscrollen)

## URLs

- PWA: https://hjolmes.github.io/nutritrack/
- Worker: https://nutritrack-ai-proxy.h-jolmes.workers.dev
- Decoder: https://nutritrack-decoder-294137824893.europe-west1.run.app

## Architektur (aktueller Live-Stand)

- **Theme (v0.144):** Cream `#faf6f1`, Coral `#e96e3c`, Fraunces+Inter. Override-Block `/* BLOOM REDESIGN */` am Ende von `<style>`. `manifest.json` seit v0.207 ebenfalls Coral/Cream (Android-Splash).
- **Screens:** `mainScreen` (Heute, Hero-kcal, 2×2-Mahlzeiten-Grid), `historyScreen`, `mealDetailScreen`, `statsScreen`, `moreScreen`. Bottom-Nav mit 5 Items, `switchTab(tab)` mappt via `data-tab`, `'stats'`→`'trends'`.
- **Bottom-Nav (v0.220):** Pill-Nav `position:fixed` **ohne** `transform` (Zentrierung per `left/right`+`margin:auto`); `bottom` inkl. Safe-Area. iOS: `_fixViewportChrome()` nach Tastatur/visualViewport/Tab-Wechsel (#177).
- **Scroll/Überscroll (v0.223):** `_fixViewportChrome()` setzt die Scroll-Position **nie** auf 0 — es hängt an `visualViewport`-`scroll`/`resize`, die auch beim Überscrollen am Seitenende feuern; das alte `scrollTo(0,0)` warf die Seite dann an den Anfang (#183). Stattdessen Re-Anchor auf die *aktuelle* Position, und nur bei echtem Versatz (`visualViewport.offsetTop>1`); der `.bnav`-Reflow bleibt. Zusätzlich `_touchActive()` (touchstart/-end/-cancel, 400 ms Nachlauf, 8-s-Notbremse): während einer Geste greift der Fix nicht ein, sondern legt sich per `_fixRetry`-Timer hinter das Nachlauf-Fenster (nicht in den `touchend`-Handler — das letzte visualViewport-Event kommt erst kurz danach). CSS: `html,body{overscroll-behavior-y:none}` (kein Gummiband/Pull-to-Refresh), scrollende Container (`.s-card,.mod,.mbd,.rl,.chat-inp,.rec-results,.onb-slide`) `overscroll-behavior:contain`. **Neue scrollende Container in diese Regel aufnehmen.** `scrollTo(0,0)` in `switchTab()` bleibt gewollt.
- **Tastatur-Handling (v0.222):** `_isTextEntry()`/`_isKeyboardOpen()`; `_fixViewportChrome()` steigt bei offener Tastatur sofort aus (sein `scrollTo(0,0)` nahm sonst den iOS-Reveal-Scroll zurück → Feld hinter der Tastatur, #181). `visualViewport`-Resize/Scroll schreibt die erkannte Tastaturhöhe nach `_kbH`/`--kbh`; `body.kb-open` gilt **nur bei echtem Beleg** — Viewport geschrumpft (>120 px) **und** Textfeld fokussiert (`_syncKbState()`), nicht bei bloßer Touch-Fähigkeit (iPad am Magic Keyboard, Touch-Notebook). `_revealFocused()` holt das Feld per `scrollIntoView({block:'center'})` nach vorn — beim Aufgehen der Tastatur und via `focusin`-Timer (250/550 ms). CSS: `body.kb-open` blendet `.bnav`/`#feedbackFab` aus und hebt `.ov .mod` um `--kbh` an (`max-height:calc(88vh - var(--kbh))`). **Neue bottom-fixe Elemente immer in diese kb-open-Regeln aufnehmen.**
- **Mehr-Hub (v0.211):** `moreScreen` = zentrale Übersicht mit 4 Gruppen (Einstellungen / Meine Inhalte / Daten & Sync / App), 12 Einträge. Jeder Settings-Bereich deep-linkt via `openSettings(tab)` (Tab-Bar im `settOv` bleibt für schnellen Wechsel); `openBackupSettings()`=`openSettings('backup')`. **Bibliothek ist eigenes Overlay `#libraryOv`** (`openLibrary()`, kein Settings-Tab mehr); alle Subflows (Rezept-/Lebensmittel-Editor, `libAdd*`) schließen `libraryOv` explizit und kehren per `openLibrary()` zurück.
- **Ausgelagerte Daten-Module (v0.204):** `js/fooddb.js` (`window.DB`+`window.DE_EN`) und `js/changelog.js` (`window.CHANGELOG`) — klassische Scripts vor dem Hauptscript, in `CORE_ASSETS`. Neue CHANGELOG-Einträge gehören in `js/changelog.js`, nicht mehr in `index.html`. `@zxing/library` liegt lokal (`js/zxing/zxing-js.umd.min.js`, `defer`) statt synchron von unpkg.
- **Fotos in IndexedDB (v0.208):** `js/idb-photos.js` → `window.NTPhotos` (put/get/del, DB `nt-photos`). Einträge tragen `mealPhotoId` statt Base64 (`saveMealPhoto`); Anzeige lädt asynchron nach (`_mealPhotoImgHtml`/`_hydratePhotoImgs` via `img[data-phid]`, `renderMealDetail`-`mdPhoto` direkt per `NTPhotos.get`). Boot-Migration `_migratePhotosToIdb` (Flag `nt_photos_migrated`, löscht bei IDB-Fehler nichts); nach jedem Import/Restore ruft `_migratePhotosAfterImport()` sie erneut. `deleteEntry`/`compressOldDays` löschen IDB-Fotos best effort. Offline-Foto-Queue speichert `{phid,…}` statt Base64. Ohne IndexedDB: Fallback aufs alte `mealPhoto`-Feld. **Fotos sind gerätelokal, nicht Teil der Backups.**
- **Stabilität (v0.201):** `getDay()` behandelt komprimierte Alt-Tage (`_compressed`, aus `compressOldDays`) als read-only Leer-Tag → kein Crash beim Zurückblättern >90 Tage. `renderStreak()`-Geisteraufruf entfernt (Streak rendert `renderWeekBars`). `lookupNutrients` schreibt Ergebnisse per Index → Zutaten-Reihenfolge = Eingabe-Reihenfolge.
- **XSS-Härtung (v0.182/v0.203):** `esc()` (`index.html`) / `_esc()` (`picker.js`) jetzt **flächendeckend** in allen Render-Pfaden, die Namen/Freitexte aus untrusted Quellen (Share-Imports, OFF, KI, Nutzereingaben) per `innerHTML`/Attribut interpolieren — inkl. `value="…"`-Attribute (editName, OneDrive-Pfad), Kochanleitungen, Chat-User-Bubble, Barcode-Code. Bei neuen innerHTML-Stellen immer `esc()` verwenden.
- **Speicher-Resilienz (v0.215):** `saveS()` gibt bei `QuotaExceededError` stufenweise verzichtbaren localStorage frei und versucht erneut — **Nutzerdaten (`nt_v6`) haben Vorrang** vor Autosaves/Caches (Stufe 1: `nt_autosaves` löschen; Stufe 2: `foodCache`/`barcodeCache` auf `_pruneFoodCache`/`_pruneBarcodeCache` kappen + neu schreiben; erst dann Toast). `AUTOSAVE_MAX=3` (war 5). Caches sind hart begrenzt (`FOODCACHE_MAX`/`BARCODECACHE_MAX=300`, ältester Eintrag zuerst raus), Prune läuft proaktiv in `saveX()`/`saveBarcodeCache()`. Selbstheilend: nach SW-Update speichert ein volles Gerät beim nächsten `saveS()` wieder.
- **Backup (v0.205):** Ein Einstieg: Einstellungen → 💾 Backup. `backupNow()` (ex-`shareData`, keine Aufrufer mehr unter altem Namen) mit sichtbarer Strategie-Anzeige `#backupNowHint` (OneDrive → Share-Sheet → Datei-Download). Mehr-Hub-Eintrag, Backup-Reminder- und OneDrive-Banner öffnen alle `openBackupSettings()` (= `openSettings()`+`settSetTab('backup')`).
- **Proxy-Gate (v0.205):** `checkProxyPwGate` respektiert `nt_gate_skipped` („Später – App ohne KI nutzen", `skipProxyPwGate()`). `verifyProxySecret()` pingt den Worker mit 1 Token: 401/403 = falsches Passwort (Gate bleibt, rote Meldung), Netzwerkfehler = neutral. Erfolgreiches Setzen (Gate oder Settings) räumt `nt_gate_skipped` weg.
- **Picker (v0.206):** **7 Tabs** (Chat, Suche, Zuletzt, Foto, Barcode, Eigenes, Link). „Eigenes" hat Checkbox `#ownOnce` „Nur einmal eintragen" (Werte = Gesamtwerte der Portion, ehem. Quick-Tab — `pickerQuicktrack` gelöscht). **Ein** Link-Import-Codepfad: Picker-Link-Tab (`pickerLinkDetect/Import/Add`); `recipeImportOv`/`openRecipeImport`/`recipeImportDetect`/`recipeImportStart` gelöscht, Bibliothek-🔗 öffnet `openPicker(null,'link')`. `recipeImportExtractUrl` (index.html) bleibt — wird vom Link-Tab genutzt. **Live-Suche:** `pickerSearchLocalLive()` (oninput) rendert lokale Treffer sofort; Online weiterhin per Enter/Button.
- **Picker öffnet mit Chat (v0.200):** Bottom-Nav-＋ → `openPicker(null)` (Default `'chat'`); `libAddRecipe`/`libAddFood`/`pickerSaveOwn` übergeben `'search'`.
- **Diktat (v0.197–v0.210):** 🎙️ im Picker-Chat, Web Speech API de-DE. Kurz-Tap = Toggle, Halten ≥350 ms = Push-to-Talk. v0.210: Finals **pro Result-Index** gespeichert (`finals[i]=tr`, Re-Delivery überschreibt statt anhängt) + `_pickerDedupOverlap` (wortweiser Suffix/Präfix-Guard ≥2 Wörter) gegen iOS-Re-Finalisierung über Session-Neustarts (#154/#156).
- **Hilfe (v0.207):** `helpOv` = scrollbare HTML-Hilfe mit `<details>`-Themen + PDF-Download-Link; `openHelp()` = nur `openOv('helpOv')`. Kein PDF-iframe mehr (iOS zeigte nur Seite 1). Erinnerungen-Tab trägt Hinweiskasten „nur solange App geöffnet".
- **Trends (v0.207):** Gewichts-Chart in Coral (`#e96e3c`), Labels `#1f1a14`; Gewichts-Trend bezieht sich auf die letzten 14 Log-Einträge (Chart-Fenster) statt auf den allerersten.
- **DB-Hygiene (v0.204/v0.209):** `Karotte` gelöscht (Synonym bei `Möhre`), `Quark`-Synonyme entwirrt; v0.209: eigener `Ei`-Eintrag (roh, 143 kcal), `Rührei` ohne nacktes `ei`-Synonym (#166). Lehre aus #127 bleibt: bei „falsch erkanntem" Lebensmittel zuerst `findInLocalDB`/Synonyme prüfen.
- **Feedback (v0.154/v0.162):** FAB `#feedbackFab` → Worker `/feedback` → GitHub-Issue; friert offene Overlays für den Screenshot ein. Section-Marker `// SECTION: FEEDBACK`.
- **Header (v0.149/0.155):** `mainScreen`/`statsScreen` nur `?` `📥`; Versions-Tag `#appVersionTag` neben „Hej <Name>" (öffnet `whatsNewOv`, Text aus `APP_VERSION` beim Boot).
- **Kalorien-Ampel (v0.149):** `_kcalAmpel(goal,eaten,S)` — ±10 % grün, Richtung aus `S.goalWeight` vs `S.weight`.
- **Settings-Tabs (v0.187/v0.211):** `👤 Profil · 🎯 Ziele · 🥗 Ernährung · ⏰ Erinnerungen · 🤖 KI · 💾 Backup` (`stab-*`/`spanel-*`), Deep-Link via `openSettings(tab)`. Bibliothek-Panel existiert nicht mehr (eigenes `#libraryOv`).
- **Kalorienziel manuell (v0.221):** `S.goalManual` — manuell eingetragenes Ziel wird von `updateGoalFromET()` nicht mehr überschrieben (#178). „🧮 Kalorienbedarf berechnen" setzt den Merker zurück; Hinweistext unter dem Feld.
- **Safe-Area (v0.161/0.168):** `viewport-fit=cover`; bnav/body/fb-fab mit `env(safe-area-inset-bottom)`, Header mit `env(safe-area-inset-top)`.
- **Mahlzeit-Detail (v0.151/0.157/0.181):** CTAs `📋 Vorlage`, `💾 Als Rezept` (`saveMealAsRecipe`), `🔁 Wiederholen` (`openRecurCreate`); zentraler ＋ → `openPicker('<meal>')`.
- **Wiederkehrende Mahlzeiten (v0.181):** `S.recurringMeals[]`, `applyRecurringMeals(dateKey)` idempotent via `day._recurMarks`; Verwaltung Mehr → 🔁.
- **Share/Import:** Sender → `POST /share` (KV, 1y) → `?s=<id>`; iOS non-standalone → `iosSwitchOv` + 📥 `openImportPaste()`. Payload `{t:'r'|'f'|'m',…}`.
- **OneDrive (v0.159):** `_odGetToken()` löscht Tokens nur bei echten Auth-Fehlern (+ `odReconnectOv`); täglicher Autospeicher-Slot via `_odAutoSync`→`oneDriveSyncSlot`.
- **Picker Chat (v0.175–0.190):** Lokale Fuzzy-Suche (nur Rezepte+Custom Foods, alle Tokens müssen treffen, `_pickerDbHit` für DB-Exakt-Treffer) → KI-Fallback (`DEFAULT_CHAT_PROMPT`, `PROMPT_VERSION='7'`, Few-Shot, keine Sackgasse: kurze Eingaben gehen als Einzel-Lebensmittel an `lookupNutrients`).
- **Foto-Analyse (v0.191/v0.214):** `pickerAnalyze` skaliert auf 1280 px, `getFotoPrompt()` immer Default. `callClaude` erkennt Bilder (`content` mit `type:'image'`) und routet über eine eigene Kette: (1) eigener Vision-Slot mit Key → dessen API (Default Qwen/`qwen3-vl-plus`), (2) Foto-KI explizit auf Anthropic → `claude-sonnet-4-6`, (3) kein Vision-Key, aber Text-Anbieter aktiv und `vision:true` → dorthin durchreichen (bewahrt v0.212-DeepSeek-Verhalten), (4) sonst Anthropic. Fallback bei Fehler/leer immer Anthropic. Quellen-Badge direkt nach der Vision-Antwort eingefroren (nicht die lookupNutrients-Quelle).
- **KI-Anbieter (v0.193–v0.214):** Mehr → 🤖 KI: Fremd-Anbieter via Worker `POST /ai/messages`; `callClaude` = `_callAiProvider(provider,key,…)` → Fallback `_callAnthropic`; Badge `aiSourceBadgeHtml()` (`aiSourceText` strippt `(Alibaba)` → `Qwen`). **Zwei unabhängige Slots:** Text-Anbieter (`nt_ai_provider`/`nt_ai_key`, Default `deepseek`, aktiv via `hasCustomAiProvider`) und Foto-KI (`nt_ai_vision_provider`/`nt_ai_vision_key`, Default `qwen`, aktiv via `hasVisionAiProvider`). Ohne jeweiligen Key → Anthropic-Proxy. `_backupAiFields` nimmt jeden Slot nur mit eigenem Key ins Backup (`aiProvider`/`aiKeyEnc`, `aiVisionProvider`/`aiVisionKeyEnc`); Keys wandern AES-GCM-verschlüsselt (Schlüssel aus Proxy-Passwort) in alle Backups, `_importAiFields` stellt beide Slots in allen 4 Restore-Pfaden wieder her. Worker: Qwen = OpenAI-kompatibler DashScope-intl-Endpoint.
- **OFF via Worker (v0.192):** Alle OpenFoodFacts-Calls über `GET /off?u=…`, Rezept-Import über `GET /fetch?u=…`; `fetchT` mit harten Timeouts überall.
- **Barcode (v0.196):** `zxing-wasm` lokal (`js/zxing/`), Canvas→ImageData-Wrapper `window.ZXingWasm.readBarcodes`; zbar-wasm per esm.sh best effort; `@zxing/library` lokal als JS-Fallback.
- **Sport-Sync (v0.158):** `js/health-sync.js` (`window.NTHealth`), Token in iOS-Shortcut/Android-HTTP-Shortcut, Worker `POST /workout` / `GET /workouts`, Einträge in `S.days[*].exercise[]` mit `_healthId`/`_source`.

## Worker-Endpoints

| Endpoint | Zweck |
|---|---|
| `GET /health` | Status + `codeVersion` |
| `POST /v1/messages` | Anthropic-Proxy (Token-Auth) |
| `POST /ai/messages` | Fremd-KI-Anbieter-Proxy (Format-Übersetzung) |
| `POST /decode-barcode` | OSS-Decoder + optional Vision-Fallback |
| `POST /share` / `GET /share/<id>` | KV-Shortener |
| `GET /s/<id>` | Legacy-Redirect |
| `POST /feedback` | erstellt GitHub-Issue, optional Screenshot-Commit |
| `POST /workout` / `GET /workouts?since=` | Workout-Ingest/-Polling |
| `GET /off?u=` | OpenFoodFacts-Proxy |
| `GET /fetch?u=` | Rezept-Seiten-Proxy (Secret-gated, SSRF-Guards) |

**Bindings/Secrets:** `ANTHROPIC_API_KEY`, `NUTRITRACK_PROXY_TOKEN`, `DECODER_URL`, `SHARE_KV`, `GITHUB_TOKEN`, opt. `GITHUB_REPO`.

## Code-Suchpfade

`index.html`: `// SECTION: SHARE & IMPORT`, `// SECTION: FEEDBACK`, `// SECTION: HEALTH SYNC`, `openSettings(tab)`, `openLibrary()`, `openBackupSettings()`, `backupNow()`, `verifyProxySecret()`, `skipProxyPwGate()`, `_migratePhotosToIdb()`, `_hydratePhotoImgs()`, `openImportPaste()`, `openHelp()`. Modale: `libraryOv`, `shareItemOv`, `importPasteOv`, `importConfirmOv`, `iosSwitchOv`, `feedbackOv`, `healthSyncOv`, `helpOv`, `mealDetailScreen`.

`picker.js`: `pickerSearchLocalLive`, `pickerSaveOwn` (mit `ownOnce`), `_pickerVoiceStart`/`_pickerDedupOverlap` (Diktat inkl. Per-Index-Finals #156), `pickerLinkDetect/Import/Add`.

`js/`: `fooddb.js` (DB/DE_EN), `changelog.js` (CHANGELOG — neue Einträge hier!), `idb-photos.js` (NTPhotos), `health-sync.js` (NTHealth), `zxing/` (WASM + JS-Fallback lokal).

`worker/src/index.js`: `// ─── SHARE-LINK SHORTENER`, `// ─── FEEDBACK ENDPOINT`, `// ─── HEALTH WORKOUT INGEST`, `handleAiProvider`.

`sw.js`: `index.html` network-first, restliche `CORE_ASSETS` cache-first; `install` per `fetch({cache:'reload'})`+`put` (nicht `cache.add()`).

## Live-Test offen

- v0.223 Überscroll (#183, iPhone-PWA): Heute-Tab ganz nach unten scrollen → Ansicht bleibt unten, springt nicht mehr an den Anfang; am Seitenende ziehen → kein Gummiband über den Rand hinaus; in Overlays (Picker, Einstellungen, Hilfe) bis ans Listenende scrollen → Seite dahinter bewegt sich nicht; Bottom-Nav sitzt nach Scrollen, Tab-Wechsel und Tastatur-Schließen weiterhin unten (#177 unverändert); Android-Gegenprobe
- v0.222 Tastatur (#181, iPhone-PWA): Picker-Chat öffnen → in die Eingabe tippen → Feld bleibt über der Tastatur sichtbar, Bottom-Nav und 🐛-Knopf verschwinden solange; Gramm-Feld in Mahlzeit-Detail → Eintrag bearbeiten sowie im Picker ebenso sichtbar; Tastatur schließen → Nav/🐛 wieder da und Leiste sitzt unten (#177 unverändert); Android-Gegenprobe; Desktop-Browser und iPad mit Hardware-Tastatur: Nav bleibt beim Tippen sichtbar
- v0.221 Kalorienziel (#178): Mehr → Ziele → Ziel manuell ändern (nicht „Berechnen") → Speichern → App komplett schließen/neu öffnen → Ziel unverändert; Hinweis „Manuell gesetzt" sichtbar; danach „Berechnen" → Speichern → Neustart darf ET-/SS-Zuschlag wieder anwenden (wenn Schwangerschaft+ET aktiv)
- v0.220 Bottom-Nav (#177, iPhone PWA): Tastatur in einem Eingabefeld öffnen/schließen → Leiste bleibt unten; nach Scrollen und Tab-Wechsel (Heute↔Mehr) ebenfalls unten; kein „Schweben“ in Bildmitte
- v0.215 Speicher (echtes volles Gerät der Nutzerin): App auf v0.215 aktualisieren (Reload für SW-Update) → neuen Eintrag anlegen → wird gespeichert, kein „Speicher voll"-Toast mehr; DevTools/Anwendung → localStorage: `nt_autosaves` verschwindet bei Platzmangel, `nt_v6` vorhanden; Auto-Sicherungen zeigen max. 3 Stände; Such-/Barcode-Caches wachsen nicht über 300 Einträge
- v0.209 Ei (#166): Suche „Ei" → erster Treffer „Ei 🥚 143 kcal", dann „Ei (gekocht)", „Rührei" dahinter; Chat „2 Eier" → Zutat „Ei" (roh), nicht Rührei; „Rührei" weiterhin per Namen findbar
- v0.210 Diktat (#156, iPhone!): 🎙️ halten, 3 Sätze mit Pausen → keine Wortdopplung; kurzer Tap unverändert; vorbefülltes Feld bleibt Präfix; absichtliche Wiederholung („sehr sehr gut") bleibt erhalten
- v0.211 Mehr-Hub: Mehr zeigt 4 Gruppen/12 Einträge, jeder Settings-Eintrag öffnet den richtigen Tab; „Speichern ✓" aus Ziele-Tab erhält Profil-Daten; Bibliothek als eigenes Fenster: Rezept/Lebensmittel bearbeiten → speichern/löschen → zurück in der Bibliothek; Bibliothek-＋ öffnet Picker mit vorbefüllter Suche; 🔗/📥 funktionieren; Backup-Banner/-Reminder öffnen Backup-Tab; Hilfe-Texte nennen neue Pfade
- v0.214 Foto-KI/Qwen3-VL: **Worker deployen** (`wrangler deploy` in `worker/`), `GET /health` → `codeVersion:"v0.214-qwen-vision"`; Mehr → 🤖 KI zeigt Abschnitt „📷 Foto-KI" mit „Qwen (Alibaba) (Standard)" vorausgewählt, Hint nennt „Modell qwen3-vl-plus"; Qwen-Key (Alibaba Cloud Model Studio, intl.) eintragen → Foto senden → Badge „über Qwen · qwen3-vl-plus"; ohne Qwen-Key → Foto an Claude; Foto-KI explizit auf Anthropic → Claude; DeepSeek-Chat (Text) unverändert über DeepSeek; Vision-Key nur verschlüsselt im Backup
- v0.201 Stabilität: Trends-Tab öffnen → keine Konsolen-Fehler, Streak-Kachel zeigt Zahl, „📷 Offline-Fotos"-Panel erscheint bei Queue-Einträgen. Konsole: `S.days['2026-01-01']={_compressed:true,kcal:1800,water:4};saveS();` → dorthin blättern → leerer Tag statt Crash. Chat „Brot mit Käse und Schinken und Gurke" → Zutaten in genau dieser Reihenfolge
- v0.202 Diktat (Android + iPhone): 🎙️ halten, mehrere Sätze mit Pausen sprechen → fortlaufender Text **ohne** Wiederholungen; kurzer Tap wie bisher; bestehender Text bleibt als Präfix (#154)
- v0.203 XSS: Eigenes Lebensmittel `<img src=x onerror=alert(1)>` anlegen und eintragen → überall als Text, kein Alert; Name mit `"` → Bearbeiten-Dialog zeigt vollen Namen im Feld; `Müsli & Milch` nirgends doppelt-escaped
- v0.204 Auslagerung: App lädt normal, „Was ist neu" zeigt Historie, Suche findet DB-Einträge sofort, „Karotte" liefert Möhre; offline (nach SW-Update): Start + Suche + Changelog funktionieren; Netzwerk-Tab: kein unpkg-Request vor First Paint, Barcode-Fallback läuft
- v0.205 Backup/Gate: frisches Profil → Gate → „Später" → App nutzbar, Gate kommt nicht wieder; falsches Passwort (online) → „scheint falsch", Gate bleibt; richtiges → „geprüft ✓". Mehr → „Daten teilen / sichern" öffnet Backup-Tab; „💾 Jetzt sichern" zeigt Strategie-Hinweis
- v0.206 Picker: nur 7 Tabs; „Eigenes" ohne Häkchen → landet in Bibliothek; mit Häkchen → einmaliger Eintrag mit Gesamtwerten, nicht in Bibliothek; Bibliothek-🔗 öffnet Picker-Link-Tab; Suche: „ban" tippen → Banane sofort, Enter → 🌐-Treffer
- v0.207 Hilfe/Farben: iPhone-PWA: Hilfe scrollbar, Themen aufklappbar, offline verfügbar; Android-Splash Cream/Coral; Erinnerungen-Tab zeigt gelben Hinweis; Gewichtslinie koralle, Trend passt zum 14-Einträge-Fenster
- v0.208 Fotos: Eintrag → Foto hinzufügen → nach Reload noch da (DevTools → IndexedDB → nt-photos); `localStorage.nt_v6` wächst durch Fotos nicht mehr; Bestandsdaten: nach erstem Start Fotos sichtbar, `nt_photos_migrated` gesetzt, nt_v6 kleiner; Eintrag löschen → IDB-Key weg; Flugmodus-Foto → Queue ohne Base64, online „Jetzt analysieren" ok; Export-JSON ohne `data:image/`-Strings; altes Backup mit Base64-Fotos importieren → nach Neustart migriert
- v0.196 Barcode iPhone: Scanner sofort bereit, `ZXing-WASM` als Engine, offline lauffähig (#143)
- v0.158 Sport-Sync: echtes Workout via iOS-Shortcut/Android-Shortcut durchspielen → Badge + Hero-kcal reduziert

## Versions-Historie (letzte 5)

| Version | PR | Was |
|---|---|---|
| v0.218 | #176 | Diktat-Halten = Tap-Logik (kein continuous), Wortdopplung |
| v0.220 | #180 | Bottom-Nav fest am unteren Rand (#177) |
| v0.221 | #179 | Manuelles Kalorienziel bleibt nach Neustart (#178) |
| v0.222 | #182 | Eingabefelder bleiben bei offener Tastatur sichtbar (#181) |
| v0.223 | — | iOS: kein Scroll-Rücksprung beim Überscrollen (#183) |

---

## Pflege (PFLICHT)

Diese Datei muss **knapp** bleiben — so viel wie nötig, so wenig wie möglich.

Bei jedem deployablen Merge:

1. `Stand` aktualisieren.
2. Architektur-Sektion **überschreiben statt anhängen** — sie beschreibt nur den aktuellen Live-Zustand, keine Änderungs-Chronik. Veraltete oder durch Folge-Versionen ersetzte Bullets entfernen.
3. Erledigte Live-Tests aus „Live-Test offen" streichen.
4. Versions-Historie auf die letzten **5 Einträge** kürzen.

Verboten in dieser Datei: pro-Version-Architektur-Beschreibungen, Wiederholungen aus `CLAUDE.md`/`AGENTS.md` (Versioning-Workflow, Git-Workflow, Datenschutz, Cross-Platform-Regel), Cost/Limits-Tabellen, Wunschlisten für Folge-Iterationen (gehören in GitHub-Issues).
