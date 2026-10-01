# NutriTrack — Übergabe

> Erste Aktion jeder Session: diese Datei lesen. Sie beschreibt den **aktuellen** Stand, nicht seine Geschichte — die steht in Git und in `js/changelog.js`. Der Stand vor der Kürzung (#258, 132 KB): `git show 0d69ba2:UEBERGABE.md`. Grenzen siehe „Pflege“, `tools/check.js` prüft sie.

**Stand:** v0.298 (2026-10-01) — PR #284 (gemergt): Sport-Namensfeld mit eigener Vorschlagsliste statt `<datalist>` (Android zeigte leere Kästchen über der Tastatur). Dauer im Namen („Bouldern 20 min“) wandert ins Feld Dauer, Bibliothek wird beim Öffnen bereinigt. v0.297 (#283) und PR #280 (v0.291–v0.296) sind gemergt. UPC-E (v0.292) und USDA-Daten bleiben (Entscheidung 2026-10-01). Geparkt: #165 Sport-Sync v2 (Android-Gerätetest), #262 Ampel Schwangerschaft/Ernährung (Quelle fehlt), #260 KV-Kontingent (Entscheidung offen).

## URLs

- PWA: https://hjolmes.github.io/nutritrack/
- Testabzug: https://nutritrack-preview.pages.dev/nutritrack/ (Cloudflare Pages, `.github/workflows/preview.yml`, nur Branches `claude/**`/`preview/**`)
- Worker: https://nutritrack-ai-proxy.h-jolmes.workers.dev
- Decoder: https://nutritrack-decoder-294137824893.europe-west1.run.app

## Architektur (aktueller Live-Stand)

- **Zustand und Speicher.** Der ganze App-Zustand ist ein Objekt `S` in `index.html`, gespeichert als JSON in `localStorage.nt_v6` (`loadS()` per flachem `Object.assign`, `saveS()` schreibt alles); Lebensmittel-Cache, eigene Lebensmittel und Rezepte liegen in `nt_x` (`saveX()`), Barcodes in `nt_bc`, Fotos gerätelokal in IndexedDB `nt-photos` (`NTPhotos`, Einträge tragen `mealPhotoId`, gelöscht nur über `delPhotoIfUnused`, nicht im Backup). Es arbeitet immer nur **ein** Fenster: `js/single-tab.js` (`NTTab`) holt vor dem Start den Web Lock `nutritrack-main` und startet dann `_bootApp()`, ein zweites Fenster wechselt auf `tab.html` („Hier weiterarbeiten“ übernimmt per `steal`), und `saveS`/`saveX`/`saveBarcodeCache` schreiben nur mit `NTTab.canWrite()`. Bei vollem Speicher gibt `saveS()` erst Caches frei (`_pruneFoodCache`/`_pruneBarcodeCache`, je max. 300), Tage älter als 90 Tage verdichtet `compressOldDays()` zu `_compressed`, `getDay()` öffnet sie bei Bedarf wieder (`reopenArchivedDay`). Diese und alle anderen reinen Rechnungen (Datum, Summen, Makro-Ziele, Kalorien-Ampel, Schwangerschaft, Sport-MET, Portionsgedächtnis, `mergeState` für `loadS`) stehen in `js/calc.js`, vor dem Inline-Block geladen, ohne Oberfläche und Speicherzugriff, getestet mit `npm test` (`tools/test/calc.test.js`). Backup über Mehr → 💾 (`backupNow()`), Autospeicher über `runAutosave()`: mit OneDrive 1×/Tag in einen Slot (`NTDrive.syncSlot`), sonst lokal in IndexedDB `nt-autosave` (`NTAutoSave`, max. 3); jeder Restore-Pfad setzt `S.goalStart` vor dem `Object.assign` zurück, damit ein alter Stand keinen fremden Zielstart erbt.
- **Mahlzeiten (`meals`).** Einträge stehen in `S.days[datum].{breakfast,lunch,dinner,snack}[]` mit `per100` und `amount` bzw. `ingredients`; `S.currentDate` folgt Mitternacht über `checkDayRollover()`, Mahlzeit-Detail über `openMealDetail()`. Der Picker (`picker.js`, globale Funktionen, Zustand in `window._picker*`) hat sieben Tabs: Chat liest einfache Eingaben ohne KI (`_pickerChatPreParse`, Mengen über `NTAlexa.parseAmount`, Direkteintrag nur bei eindeutigem `_pickerSureHit`), Foto, Barcode (lokale Decoder, Worker `/decode-barcode`), Link (JSON-LD → Microdata → KI, Abschluss `_pickerLinkFill`), Suche, Zuletzt, Eigenes; „＋ Zutat hinzufügen“ läuft über `_pickerAppendToEditEntry`. Nährwerte holt `lookupNutrients()`: lokale DB (`findInLocalDB`: Name → `DB_DEFAULT` → Synonym nur bei genau einem Eintrag → eindeutiger Namensanfang), dann Open Food Facts über `/off`, dann KI, sonst Schätzung; die DB ist `js/fooddb.js` (handgepflegt, mit `DB_DEFAULT`) plus `js/fooddb-usda.js` (erzeugt von `tools/build-fooddb.js`). Rezepte (`recipes` in `nt_x`, je Portion, `#libraryOv`), Vorlagen (`NTTpl`), Wiederkehrende (`NTRecur`, `S.recurringMeals`, `_recurMarks`, Pausen) und Teilen/Import (Payload `{t:'r'|'f'|'m'|'d'|'p'}`, `shareInputKind`/`startShareImport`, Worker `/share`) hängen alle an diesen Einträgen. Ampeln setzt `_checkAmpelWarn` am Eintrag: Stillzeit lokal (`NTAmpel.rate`, geprüft von `tools/ampel-test.js`), Schwangerschaft und Ernährung per KI.
- **Wochenplan (`plan`).** `js/mealplan.js` → `NTPlan`, Daten in `S.mealPlan[datum][slot][]` und `S.planApplied`; ein Eintrag ist Verweis `{r,p}`, mitgereister Abzug `{r:'',p,s}` oder Notiz `{x}`, entschieden an einer Stelle (`isNote`, `resolve`). „Füllen“ (`autoFill`) plant auf `S.goal` mit Slot-Anteilen `SLOT_BUDGET`, wählt aus den drei besten Kandidaten (Rezepte, dazu ganze Mahlzeiten aus 90 Tagen Tagebuch mit Aufschlag) und gleicht nur die neu gesetzten Portionen nach (`rebalance`). Neue Rezepte enden in `noteRecipeCreated()`, Dubletten prüft `similarRecipe()` vor jedem Anlegen. Geteilt wird je **Tag** als ein Sync-Record (`/plan/sync`, Grabsteine `S.planTomb`), der spätere Schreiber gewinnt den ganzen Tag; `toDiary`/`weekToShop` reden mit Tagebuch und Einkauf.
- **Einkauf (`shop`).** `js/shopping.js` → `NTShop`, Artikel in `S.shopList` (`{id,n,q,c,ic,d,rev,_sy,rc,pre}`), Grabsteine `S.shopTomb`, eigene Kategorien `S.shopCats` (synchron als Record `cat:<id>`), lokal und ohne Sync `S.shopRecent` und `S.shopCatMem` (nur `saveItem()` schreibt das Kategorie-Gedächtnis). `guess()` rät Kategorie und Symbol (Gedächtnis vor `CATALOG`, exakt → Wort → Wortteil), `splitQty()` trennt Menge und Name, Artikel sind namenseindeutig. Rezepte kommen über `addIngredients()` mit addierten Mengen (`mergeQty`) und Herkunft (`rc`, `pre`), immer in Gramm. Overlays werden erst geöffnet, dann gezeichnet (`render()` zeichnet nur offene).
- **Sport (`exercise`).** Einträge in `S.days[datum].exercise[]`, eigene Aktivitäten in `S.exerciseLibrary`; die Bilanz zieht ihre kcal ab. MET-Werte aus `js/metdb.js` (`NTMet`, 120 Aktivitäten), erzeugt von `tools/build-met.js` aus der PDF des 2024 Adult Compendium (Nutzung: Werte unverändert, Quelle im Sport-Dialog genannt). `Namensfeld: eigene Vorschlagsliste `#exSugg` (Rangfolge `suggestExercises` in `js/calc.js`, ▼ zeigt alle), kein `<datalist>`; eine Dauer im Namen löst `splitExerciseDuration` heraus, `openExerciseOv` bereinigt die Bibliothek (`cleanExerciseLibrary`). `findExercise`: Bibliothek mit MET → Tabelle → `estimateExercise` (KI, ohne KI 5 MET); Alexa rechnet über dieselbe Tabelle. Workouts aus Apple/Samsung Health holt `js/health-sync.js` (`NTHealth`) über `/workouts`; der Umbau auf Tageswerte ist #165.
- **Wasser (`water`).** Zähler `S.days[datum].water`, Ziel `S.waterGoal` (Dialog `waterGoalOv` an der Kachel, nicht in den Einstellungen; `saveSettings()` liest es bewusst nicht). In der Stillzeit schlägt `applyNursWaterGoal()` drei Gläser mehr vor. Alexa-Einwürfe zählen einmal je Einwurf (`day._alexaWater`), Erinnerungen laufen über `NTRemind`.
- **Fasten (`fast`) und Erinnerungen.** Ein laufendes Fasten steht außerhalb von `S` in `localStorage.nt_fast` (`{start,hours}`, `loadFast`/`saveFast`). `js/reminders.js` (`NTRemind`) hält genau einen Timer je Erinnerung (`S.reminders`) und einen fürs Fastenende, stellt sie bei `visibilitychange` und im 60-s-Takt neu und zeigt nur, was höchstens 15 Minuten zu spät ist (`LATE_MS`). Angezeigt wird ausschließlich über `NTRemind.notify()` (Service Worker, sonst Konstruktor); `NTRemind.hint()` nennt fehlende Berechtigung. Grenze: nur solange die App lebt.
- **Baby (`baby`).** `js/baby.js` → `NTBaby`, eingeschaltet über `S.babyOn` (unabhängig von Geschlecht und Stillzeit), Stammdaten `S.baby {name,birth,sex}`, Tagebuch `S.babyLog[datum][]` (Stillen, Flasche, Windel, Temperatur, Schlaf, Notiz, Beikost, Abpumpen, Medizin, Wachstum, Termin), dazu `S.babyQuick`, `S.babyMeds`, `S.babyMiles`, `S.babyQs`, `S.babyTomb`. Teilmodule: `baby-meds.js` (`NTBabyMed`), `baby-growth.js` mit erzeugten WHO-Daten (`NTGrowth`), `baby-week.js` (`NTBabyWeek`, Verlauf und Arzt-Bericht), `baby-milestones.js` (`NTMile`, U-Heft, IDs nie umnummerieren), `baby-midwife.js` (`NTMidwife`). Ein Schlaf bleibt an seinem Starttag gespeichert und wird nur für Anzeige und Summe über Mitternacht geteilt (`sleepSegments`), Tage laufen über `addDayKey()`. Alles reist im Baby-Topf des Sync-Kerns, Alexa-Einwürfe über `applyBaby()`/`NTMidwife.addExternal()` mit fester ID.
- **Vom Partner (`partner`).** `js/partner.js` → `NTPartner`: einseitige Sendungen statt Abgleich, ein Record = eine Sendung (Payload wie beim Teilen), eigener Raum, Salt `nutritrack-partner` und Endpunkt `/partner/sync`. Zustand `S.partner {on,room,key,me,peer,dev,…}`, Postfach `S.partnerIn` (gekappt durch `trimInbox()`, ausgehend max. `MAX_OUT_BYTES`). Neue Sendungen zeigen sich an der passenden Mahlzeit (`newForMeal`/`openForMeal`) und am 📬 der Kopfzeile; übernommen wird über die normale Import-Vorschau.
- **Sync-Kern und Verbindungen.** `js/sync-core.js` → `NTSync`: ein Code je Person in `S.links[]` (`room.key`, Schalter `share:{plan,shop,baby}`, Status je Topf), je Topf ein eigener AES-GCM-Schlüssel aus PBKDF2 mit Topf-Salt (`NTSync.crypto`, die einzige Krypto-Stelle), der Worker sieht nur `{id,rev,iv,ct}`. `NTSync.engine({topic,path,header,salt,records,apply})` übernimmt Transport, Quittungen (`_sy` = Raum → rev), Grabsteine und Takt; Abruf-Cursor laufen 120 s hinter der Serverzeit (`nextCursor`), eine ältere rev vom Server löst einen Re-Push aus (`healOlder`). Alexa (`js/alexa-sync.js`, `NTAlexa`) ist eine Einbahnstraße: Familien-Token für Baby/Einkauf, persönliches Token für Mahlzeit/Sport/Wasser, Abholen beim Start und bei `visibilitychange`, quittiert wird immer (Worker löscht), Dedup über `_alexaId`; Skill und Sprachmodell in `alexa/` (ein Freitext-Slot nie neben einem zweiten Slot, kein `fetch` in der Lambda). OneDrive (`js/onedrive.js`, `NTDrive`): PKCE, Tokens werden nur bei echten Auth-Fehlern gelöscht.
- **KI und Worker.** `callClaude()` wählt je Aufgabe einen Anbieter-Slot (Text: `nt_ai_provider`, Foto: `nt_ai_vision_provider`, Schlüssel verschlüsselt im Backup) und fällt sonst auf Anthropic über den Worker zurück; das Proxy-Passwort (`x-app-proxy-secret`) wird erst nach Prüfung gespeichert (`trySetProxySecret`, offline gemerkt und später `recheckProxySecret`). `worker/src/index.js` ist ein Router (`route()`) mit Body-Grenzen (`readBodyLimited`), SSRF-Schutz in `/fetch`, KV-Änderungsmarken `<präfix>#<raum>` gegen das `list`-Kontingent (`readMark`/`bumpMark`/`backfillMark`) und CORS-Headern, die aus `SYNC_POTS` abgeleitet werden. Er deployt beim Merge (`deploy-worker.yml`), der Barcode-Decoder auf Cloud Run ebenso (`deploy-decoder.yml`, `decoder/main.py`, gleiche Prüfziffer-Regel wie Worker und Client). Prüfung ohne Netz: `node tools/worker-test.js`.
- **PWA und Oberfläche.** `sw.js`: `index.html` network-first, alle `CORE_ASSETS` cache-first, nur eigene GET-Anfragen; jedes lokale Script trägt `?v=<APP_VERSION>` (`tools/bump.js`), Meldungen öffnen über `notificationclick`. `js/features.js` (`FEATURES`, `NTFeat`) ist das einzige Register der acht Kacheln und ihrer Aktionen; Sichtbarkeit hängt am Schalter, nie am Inhalt, und ein Menü schließt sich, bevor es ein anderes öffnet (alle `.ov` teilen `z-index:300`). Klicks laufen über `js/actions.js` (`data-act`, `data-args` als JSON, `data-bg-close`, `data-stop` in der Auffangphase), jede `innerHTML`-Ausgabe fremder Texte über `esc()`. Tastatur und Viewport (`_fixViewportChrome`, `body.kb-open`, `--kbh`/`--vvh`): neue bottom-fixe Elemente und scrollende Container gehören in diese Regeln, ein `.seb` in einer Flex-Zeile braucht `width:auto;margin-top:0`. Ausgeliefert wird der Quelltext ohne Build; Werkzeuge stehen nur als `devDependencies` in `package.json` (`npm ci`), geprüft von `tools/check.js`, `tools/smoke.js` und `npm run typecheck` (`tsc --noEmit` über jede Datei mit `// @ts-check`, Deklarationen in `types/globals.d.ts`, ausstehende Module in `TS_PENDING`).

## Worker-Endpoints

| Endpoint | Zweck |
|---|---|
| `GET /health` | Status + `codeVersion` |
| `POST /v1/messages` | Anthropic-Proxy (Token-Auth) |
| `POST /ai/messages` | Fremd-KI-Anbieter-Proxy (Format-Übersetzung) |
| `POST /decode-barcode` | OSS-Decoder (Cloud Run), ohne Vision-Fallback |
| `POST /share` / `GET /share/<id>` | KV-Shortener |
| `GET /s/<id>` | Legacy-Redirect |
| `POST /feedback` | erstellt GitHub-Issue, optional Screenshot-Commit |
| `POST /workout` / `GET /workouts?since=` | Workout-Ingest/-Polling |
| `POST /alexa/inbox` / `GET /alexa/inbox?since=` / `POST /alexa/ack` | Alexa-Einwurf: einwerfen, abholen, quittieren (löscht) |
| `POST /baby/sync` / `GET /baby/sync?since=` | Baby-Topf (E2E) |
| `POST /shop/sync` / `GET /shop/sync?since=` | Einkaufs-Topf (E2E) |
| `POST /partner/sync` / `GET /partner/sync?since=` | Partner-Postfach (E2E, ganze Sendungen) |
| `POST /plan/sync` / `GET /plan/sync?since=` | Wochenplan-Topf (E2E, ein Record je Tag) |
| `GET /off?u=` | OpenFoodFacts-Proxy |
| `GET /fetch?u=` | Rezept-Seiten-Proxy (Secret-gated, SSRF-Guards) |

**Bindings/Secrets:** `ANTHROPIC_API_KEY`, `NUTRITRACK_PROXY_TOKEN`, `DECODER_URL`, `SHARE_KV`, `GITHUB_TOKEN`, opt. `GITHUB_REPO`.

## Code-Suchpfade

`index.html`: `S`/`loadS()`/`saveS()`/`saveX()`, `_bootApp()` (Start, gerufen von `NTTab.start`), `getDay()`, `checkDayRollover()`, `findInLocalDB()`, `lookupNutrients()`, `renderAll()`, `openSettings(tab)`, `saveSettings()`, `openLibrary()`, `openMealDetail()`/`renderMealDetail()`, `backupNow()`, `runAutosave()`, `trySetProxySecret()`/`verifyProxySecret()`, `callClaude()`, `_checkAmpelWarn()`, `isNursing()`/`calcGoal()`, `loadFast()`/`startFast()`, `_fixViewportChrome()`, `esc()`; Sections `// SECTION: SHARE & IMPORT`, `// SECTION: FEEDBACK`, `// SECTION: HEALTH SYNC`, `// SECTION: NUTRIENT LOOKUP`.

`picker.js`: `openPicker`, `_pickerChatPreParse`/`_pickerSureHit`/`_pickerDbExact`, `_pickerLinkFill`, `pickerLinkDetect/Import/Add`, `_pickerAppendToEditEntry`, `_pickerGtinOk`, `pickerSaveOwn`, `_pickerVoiceStart`.

`js/`: `calc.js` (Rechenkern, globale Funktionen), `single-tab.js` (NTTab), `actions.js` (NTActions), `features.js` (NTFeat, `FEATURES`), `dashboard.js` (NTDash), `fooddb.js` (DB, `DB_DEFAULT`, DE_EN), `fooddb-usda.js` (DB_USDA, erzeugt), `metdb.js` (NTMet, erzeugt), `ampel.js` (NTAmpel), `changelog.js` (CHANGELOG — neue Einträge hier), `idb-photos.js` (NTPhotos), `sync-core.js` (NTSync), `baby*.js` (NTBaby, NTBabyMed, NTGrowth, NTBabyWeek, NTMile, NTMidwife), `shopping.js` (NTShop), `partner.js` (NTPartner), `alexa-sync.js` (NTAlexa), `mealplan.js` (NTPlan), `onedrive.js` (NTDrive), `autosave.js` (NTAutoSave), `recurring.js` (NTRecur), `stats.js` (NTStats), `reminders.js` (NTRemind), `templates.js` (NTTpl), `offline-queue.js` (NTQueue), `health-sync.js` (NTHealth), `zxing/` (Fremdcode). `tab.html`: Seite für ein zweites Fenster.

`tools/`: `check.js` (Konsistenz, Aufloesbarkeit, IDs, `DB_DEFAULT`, Abhängigkeiten, `@ts-check`, Reinheit von `calc.js`, Grenzen dieser Datei), `typecheck.js` (tsc, Inline-Blöcke nach `.typecheck/`), `test/calc.test.js` (`npm test`), `smoke.js` (Chromium, auch zweites Fenster), `bump.js`, `worker-test.js`, `ampel-test.js`, `build-fooddb.js`, `build-met.js`, `build-who-growth.js`.

`worker/src/index.js`: `route()`, `// ─── ALEXA-EINWURF`, `// ─── GETEILTE RÄUME` (`handleSyncPush`/`handleSyncPull`, `SYNC_POTS`), `// ─── SHARE-LINK SHORTENER`, `// ─── FEEDBACK ENDPOINT`, `// ─── HEALTH WORKOUT INGEST`, `isValidBarcodeChecksum`/`upcEToA`, `handleAiProvider`.

## Live-Test offen

- **Deploy (v0.292):** Nach dem Merge `GET /health` → `codeVersion:"v0.292-upce"`. Gegenprobe am Gerät: Share-Link, Zettel-Sync auf zwei Handys, Alexa-Einwurf, Rezept-Link mit Weiterleitung, Feedback mit Screenshot, KI-Foto und Chat. Ein UPC-E-Code (achtstellig, US-Ware) per 📸 Foto-Scan wird erkannt.
- **v0.291 Link-Quelle:** ＋ → 🔗 Link → Chefkoch-Link laden → über den Zutaten steht „Quelle: Rezeptdaten der Seite · Seite nennt … Portionen“.
- **v0.293 Lebensmittel-DB:** Alexa „ich habe 150 Gramm Reis gegessen“ → Reis gekocht (≈ 195 kcal, nicht ≈ 550); Chat-KI mit „Kaffee“ → schwarzer Kaffee; Rezept-Link mit „Salat“ oder „Bohnen“ → online/KI statt geratenem DB-Eintrag. Suche „Milch“ zeigt „Milch (1,5%)“ nur einmal.
- **v0.294 Ein Fenster** (Desktop-Browser mit zwei Tabs; Android PWA + Chrome-Tab): zweiter Tab zeigt „NutriTrack ist in einem anderen Fenster geöffnet“, „Hier weiterarbeiten“ → App dort, erster Tab zeigt den Hinweis; ersten Tab schließen, zweiter wartet → startet von selbst. Geteilten Link öffnen, während die App offen ist → nach „Hier weiterarbeiten“ kommt die Import-Vorschau. OneDrive verbinden, während ein zweiter Tab wartet → Verbindung gelingt.
- **v0.298 Sport-Vorschläge** (Android-PWA): 🏃 Sport eintragen → „jog“ tippen → Liste unter dem Feld mit „Joggen“, antippen setzt Namen und kcal; ▼ zeigt alle 120; Tippen außerhalb schließt. Über der Tastatur keine leeren Kästchen mehr. „Yoga 45 min“ tippen → Name „Yoga“, Dauer 45; alter Chip „Bouldern 20 min“ heißt danach „Bouldern“.

## Versions-Historie (letzte 5)

| Version | PR | Was |
|---|---|---|
| v0.294 | #280 | #261 nur ein Fenster (`NTTab`, `tab.html`); ohne Bump: #252 Werkzeuge per npm, #258 Übergabe ≤ 30 KB. |
| v0.295 | #280 | #254 Stufe 0: `tsc --noEmit` ohne Build, 20 Module + erster Inline-Block geprüft, CI-Job `typecheck`. |
| v0.296 | #280 | #255: 28 Funktionen unverändert nach `js/calc.js`, 38 Tests mit `node --test`, CI-Job `test`; Befund #281. |
| v0.297 | #283 | „📍 undefined“ im Changelog-Dialog behoben; Marktregel nur Deutschland. |
| v0.298 | #284 | Sport-Namensfeld: eigene Vorschlagsliste statt `<datalist>`, `suggestExercises` + Test; Dauer aus dem Namen (`splitExerciseDuration`, `cleanExerciseLibrary`). |

---

## Pflege (PFLICHT)

Diese Datei muss **knapp** bleiben — `node tools/check.js` prüft die Grenzen bei jedem PR, auch bei reinen Doku-PRs:

- ganze Datei ≤ **30 KB**, Abschnitt „Architektur“ ≤ **15 KB**, „Live-Test offen“ ≤ **12** Einträge;
- **keine** Versionsnummer `v0.xxx` im Abschnitt „Architektur“ (sie gehört in „Stand“ und die Historie).

Bei jedem deployablen Merge:

1. `Stand` aktualisieren.
2. Architektur **überschreiben statt anhängen**: zwölf Absätze (acht Funktionen aus `FEATURES` plus Zustand, Sync-Kern, KI/Worker, PWA), je höchstens fünf Sätze — was, wo, welche `S`-Felder, mit wem es redet. Keine Begründung, warum ein früherer Stand falsch war; die gehört als Kommentar in den Code.
3. Erledigte Live-Tests streichen. **Ein Live-Test, der älter als fünf Versionen ist, wird beim nächsten Merge Issue (Label `live-test` + `topic:*`) oder gestrichen.**
4. Versions-Historie auf die letzten **5 Einträge** kürzen.

Verboten in dieser Datei: Änderungs-Chronik, Wiederholungen aus `CLAUDE.md`/`AGENTS.md` (Versioning, Git-Workflow, Datenschutz), Cost/Limits-Tabellen, Wunschlisten (gehören in GitHub-Issues).
