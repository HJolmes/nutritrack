# NutriTrack — App-Review v0.200 (2026-07-04)

Vollständiger Code- und Struktur-Review von `index.html` (6.541 Zeilen), `picker.js`, `sw.js`, `manifest.json`, `worker/`, `js/health-sync.js`. Gegliedert nach: kritische Bugs → funktionale Fehler → Struktur/UX → überflüssige & fehlende Funktionen → Umsetzungsplan in Iterationen.

---

## A. Kritische Bugs (sofort fixen)

### A1. `renderStreak()` existiert nicht — Fehler bei jedem Öffnen des Trends-Tabs
`renderStatsPanel()` ruft `renderStreak()` auf (`index.html:4827`), die Funktion ist aber **nirgends definiert** (Streak wird tatsächlich in `renderWeekBars()` berechnet). Folge: Bei jedem Wechsel auf „Trends" wirft die App einen ReferenceError, und die danach folgenden Aufrufe `renderOfflineQueuePanel()` und `checkGoalAchieved()` laufen **nie**. Das „📷 Offline-Fotos"-Panel auf dem Trends-Screen ist dadurch faktisch tot, der Zielerreichungs-Check läuft von dort nie.
**Fix:** Zeile 4827 streichen (Streak rendert `renderWeekBars` bereits).

### A2. App-Crash beim Zurückblättern über 90 Tage
`compressOldDays()` (`index.html:5158`) ersetzt Tage älter als 90 Tage durch `{_compressed:true, kcal, …}` — **ohne** `meals`-Objekt. `getDay()` (`:3043`) legt nur bei komplett fehlendem Tag ein frisches Objekt an; ein komprimierter Tag geht ungeprüft durch. `renderAll()` greift dann auf `day.meals.breakfast.concat(...)` zu → TypeError, der Heute-Screen rendert nicht mehr. Erreichbar über wiederholtes `‹` (changeDay). `applyRecurringMeals` hat den `_compressed`-Guard, `getDay`/`renderAll` nicht.
**Fix:** In `getDay()` komprimierte Tage erkennen und read-only behandeln (bzw. `renderAll` einen Kompakt-Zustand rendern lassen: „Tag archiviert · X kcal").

### A3. XSS-Härtung (v0.182) ist unvollständig
`esc()` existiert und wird im Picker und in den Ampel-Modalen benutzt — aber **nicht** in den Haupt-Render-Pfaden, die dieselben untrusted Namen (OpenFoodFacts, KI-Antworten, Share-Imports) per `innerHTML` ausgeben:

| Stelle | Zeile | Problem |
|---|---|---|
| `renderAll()` Eintragszeilen | ~3185 | `e.name` roh in innerHTML |
| `renderMealDetail()` Titel + Liste | ~6081, ~6107 | `e.name` roh |
| `renderEditBody()` | ~3552, ~3561 | `ing.name` roh **und** `value="'+e.name+'"` → Attribut-Injection schon bei einem `"` im Namen |
| `recEditRenderIng()` / `recEditSearch()` | ~3737, ~3771 | Namen roh |
| `openEntryMenu()` Kochanleitung | ~3695 | `ins` (importierbar via Share-Payload!) roh |
| `renderRecurManage()`, `openTemplateOv()`, Einkaufsliste | ~5376, ~5256, ~5423 | Namen roh |
| `pickerSendChat()` User-Bubble | picker.js:1308 | eigene Eingabe roh (Anzeige bricht bei `<`) |

Ein geteiltes Rezept mit `"><img src=x onerror=…>` im Zutatennamen wird beim Import zum stored XSS im Tagebuch.
**Fix:** Ein Audit über alle ~40 `innerHTML`-Zuweisungen; jede Interpolation von Namen/Freitext durch `esc()`; für `value="…"`-Attribute zusätzlich Escaping (deckt `esc()` mit `&quot;` bereits ab — nur konsequent anwenden).

### A4. Diktat per Halten koppelt Wörter (offenes Issue #154)
`_pickerVoiceStart` (picker.js:1357): `onresult` konkateniert bei jedem Event **alle** `ev.results` (final + interim) neu. Android Chrome liefert bei `continuous:true` finale Ergebnisse teils erneut, und der `onend`-Neustart (Zeile 1377) setzt `_pickerRecBase` auf den kompletten Feldinhalt — die neue Session liefert die letzten Finals dann noch einmal → Text verdoppelt sich fortlaufend.
**Fix:** Ab `ev.resultIndex` iterieren, finale Transkripte pro Session getrennt akkumulieren (`base + finals + interim`), beim Neustart nur echte Finals in die Basis übernehmen.

### A5. Statischer Versions-Tag hängt auf v0.198
`index.html:681`: `<button id="appVersionTag" …>v0.198</button>` — laut eigener Regel (CLAUDE.md: „alle Vorkommen, 2×") müsste hier v0.200 stehen. JS überschreibt zwar beim Boot, aber vor DOMContentLoaded ist kurz die falsche Version sichtbar und im Code irreführend. Zweites Vorkommen (`moreScreen`, Zeile 1002) ist korrekt.

---

## B. Funktionale Fehler & Datenqualität

1. **`getDay()` legt beim bloßen Anschauen Tage an.** Jedes Blättern (`changeDay`) erzeugt `S.days[datum]={meals:{…leer}}`. Folgen: Verlauf füllt sich mit „0 Posten · 0 kcal"-Zeilen, `S` wächst unnötig. Fix: leere Tage im Verlauf filtern oder erst bei Schreibzugriff persistieren.
2. **Proxy-Passwort-Gate blockiert die ganze App und validiert nichts.** `checkProxyPwGate` zeigt ein nicht wegklickbares Vollbild-Gate; `submitProxyPw` akzeptiert jeden String (hasht nur lokal). Ein Tippfehler fällt erst auf, wenn KI-Aufrufe später 401 liefern — ohne Hinweis auf die Ursache. Dabei funktioniert die App (Suche, DB, Tagebuch) komplett ohne KI. Fix: Gate um „Später / ohne KI nutzen" ergänzen + Passwort per Test-Request (z. B. `/v1/messages` mit 1-Token-Ping oder eigenem `/auth-check`) verifizieren.
3. **Erinnerungen & Fasten-Benachrichtigung feuern praktisch nie.** `scheduleReminders`/`requestFastNotification` nutzen `setTimeout` + `new Notification` — das läuft nur, solange die PWA offen ist; auf iOS/Android wird der Tab eingefroren. Das Feature verspricht mehr, als es hält. Optionen: (a) ehrlich beschriften („nur bei geöffneter App"), (b) via Service-Worker + Push-API (braucht Server-Push), (c) entfernen.
4. **`addWater` deckelt beim Tagesziel** (`Math.min(goal,…)`) — wer mehr trinkt, verliert die Info. Zählen und in der Anzeige `9 / 8` zulassen wäre korrekter.
5. **`lookupNutrients` liefert Zutaten in Zufallsreihenfolge.** Ergebnisse werden in Callback-Reihenfolge gepusht (DB-Treffer sofort, OFF/KI später) — die Liste entspricht nicht der Eingabereihenfolge. Fix: per Index in ein vorbelegtes Array schreiben.
6. **Löschen ohne Rückfrage:** `deleteEntry`, `recEditDelete` (ganzes Rezept!), `deleteTemplate`, `deleteRecurringRule`, `deleteExercise` löschen mit einem Tap; `_autosaveLoad` fragt dagegen per `confirm`. Einheitlich: Undo-Toast („Gelöscht — Rückgängig") oder Confirm.
7. **DB-Duplikate/Inkonsistenzen:** `Möhre` + `Karotte` doppelt, `Quark`/`Magerquark`/`Speisequark` überlappen, generischer `Käse` trägt exakt Gouda-Werte, `Cherrytomaten` mit Synonym `cherry` (kollidiert mit Kirsch-Suchen). Einmal durchputzen — die Lehre aus #127 (Kaffee/Cappuccino) war genau diese Klasse Fehler.
8. **Gewichts-Chart & Trend:** Trend vergleicht mit dem allerersten Log-Eintrag statt mit dem Zeitraum des Charts (14 Tage); Linienfarbe `#2d7d52` ist noch das alte Grün-Theme.
9. **Manifest-Farben veraltet:** `theme_color`/`background_color` = `#2d7d52` (alt-grün), App ist seit v0.144 Cream/Coral (`#e96e3c`, wie im `<meta name="theme-color">`). Android-Splash und Task-Switcher wirken fremd.
10. **Hilfe kaputt auf iOS:** `helpOv` lädt das PDF in einen `<iframe>` — iOS Safari/PWA rendert PDF-iframes nur als erste Seite ohne Scrollen. Auf der Hauptplattform iPhone ist die Hilfe damit unbrauchbar; offline gar nicht verfügbar (PDF nicht in `CORE_ASSETS`). Fix: Hilfe als HTML-Sektion (auch durchsuchbar), PDF nur als Download-Link.

---

## C. Aufbau, Struktur & UX

1. **Backup ist auf ≥5 Wege verteilt** — Autospeicher, Datei-Export/-Import, OneDrive(+Slots), `shareData` („Daten teilen / sichern" im Mehr-Hub), Backup-Reminder-Banner („Teilen 📤"), OneDrive-Banner („💾 Sichern"). `shareData` verhält sich dabei je nach Zustand dreifach unterschiedlich (OneDrive-Sync ↔ Share-Sheet ↔ Download). Das ist für Nutzer nicht vorhersagbar. **Vorschlag:** Ein „Datensicherung"-Screen als einziger Einstieg (Backup-Tab existiert schon — Banner/Hub-Einträge dorthin verlinken statt Direktaktionen), `shareData` in `backupNow()` mit klarer, sichtbarer Strategie-Anzeige umbenennen.
2. **Picker hat 8 Tabs** — davon überschneiden sich „✚ Eigenes" und „⚡ Quick" (fast identische Formulare, Unterschied nur speichern/nicht speichern) und „🔗 Link" dupliziert den kompletten Rezept-URL-Import, der als `recipeImportOv` (Bibliothek → 🔗) **noch einmal separat implementiert** ist — zwei Codepfade für dieselbe Funktion. **Vorschlag:** Quick als Checkbox „nur einmalig (nicht speichern)" in „Eigenes" integrieren; eine der beiden Link-Import-Implementierungen löschen und die verbleibende von beiden Einstiegen aufrufen. Ergebnis: 6 Tabs, ein Link-Import-Codepfad.
3. **Bibliothek-Navigation ist fragil:** „Mehr → Bibliothek" macht `openSettings(); setTimeout(settSetTab('bibliothek'),50)` — ein Race über Timeout, und die Bibliothek lebt als tab-loser Settings-Panel-Sonderfall. Sauberer: eigenes Overlay/Screen, `settSetTab` verliert den Sonderfall.
4. **CHANGELOG (~90 Versionen) + Lebensmittel-DB + alle Modals stecken in index.html** (386 KB). index.html ist network-first — jeder App-Start ohne Cache lädt das komplette Changelog seit v0.100 mit. **Vorschlag (architektur-konform, klassische Scripts):** `js/changelog.js` und `js/db.js` auslagern, in `CORE_ASSETS` aufnehmen (cache-first). index.html schrumpft um ~1.000 Zeilen, Updates werden kleiner.
5. **Blockierendes CDN-Script im `<head>`:** `<script src="https://unpkg.com/@zxing/library…">` lädt synchron vor dem ersten Paint; unpkg steht in der SW-SKIP-Liste (nie gecacht). Bei langsamem/ausgefallenem unpkg hängt der App-Start. Fix: `defer` + lokal hosten wie zxing-wasm (Muster existiert schon in `js/zxing/`).
6. **Legacy-Ballast:** versteckte Parallel-IDs (`entries-*`, `sub-*`, `pt`/`pFill`, `mmk*` — alle per CSS `display:none`), `S.apiKey`-Reste + `clearLegacyApiKey`, versteckter `stTabStats`-Button + trivialer `switchStatsTab`, `switchTab`-Alias `'stats'→'trends'`. Funktioniert, kostet aber bei jedem Feature Denk- und Renderarbeit. Nach der Auslagerung (C4) gezielt entfernen.
7. **5× duplizierte Bottom-Nav** (eine pro Screen) — jede Nav-Änderung muss 5× gemacht werden. Einmalig rendern (JS-generiert) oder bewusst so lassen und dokumentieren.
8. **`user-scalable=no` + `maximum-scale=1`** im Viewport: verhindert Zoom → Accessibility-Problem (iOS ignoriert es inzwischen, Android nicht).
9. **Buttons/Findbarkeit — was gut ist:** Bottom-Nav mit zentralem ＋, Chat als Default-Tab (v0.200), Mahlzeit-Detail-CTAs (Vorlage/Wiederholen/Als Rezept) und das Feedback-FAB sind stimmig platziert. Der ⚙️-Button ist aktuell **nur** im Verlauf-Header — entweder konsequent nirgends im Header (Weg über „Mehr") oder überall; aktuell wirkt es zufällig.
10. **Feedback-Screenshots liegen dauerhaft im Repo** (`feedback/screenshots/`, wächst monoton, enthält App-Zustände mit persönlichen Ernährungsdaten). Retention-Regel definieren (z. B. nach Issue-Close löschen) und sicherstellen, dass das Repo privat bleibt.

---

## D. Funktionen: überflüssig vs. fehlend

**Kandidaten „zu viel" (entfernen oder zusammenlegen):**
- „⚡ Quick"-Tab → in „Eigenes" integrieren (s. C2)
- Doppelter Link-Import (`ppanel-link` vs. `recipeImportOv`) → einer reicht (s. C2)
- Changelog-Anzeige komplett ab v0.100 in „Was ist neu" → auf letzte ~10 Versionen kürzen, Rest lazy
- Erinnerungen in jetziger Form (feuern nicht zuverlässig, s. B3) → ehrlich machen oder streichen

**Sinnvolle Lücken (Vorschläge — als GitHub-Issues `label:enhancement` anlegen, gemäß wuensche.md-Workflow):**
1. **Live-Suche im Picker** (Suche erst auf Button/Enter ist 2010er-UX; lokale Treffer können bei jedem Tastendruck rendern, online debounced)
2. **Undo statt Löschen-Confirm** (B6) — ein Toast-Pattern app-weit
3. **IndexedDB-Migration**: localStorage (5 MB) + Base64-Mahlzeitfotos + Tage-Objekte = absehbare Vollläufe (die 3-MB-Warnung existiert ja schon). IndexedDB für `days`/Fotos, localStorage nur für Settings
4. **Dark Mode** via `prefers-color-scheme` (Theme ist bereits sauber auf CSS-Variablen aufgebaut — geringer Aufwand)
5. **CSV-Export** (Tagebuch für Arzt/Ernährungsberatung)
6. **Makro-Trends in Stats** (aktuell nur kcal-Balken; P/K/F-Wochenverlauf wäre mit vorhandenen Daten trivial)

---

## E. Umsetzungsplan (Iterationen à „ein Topic", gemäß Workflow)

| # | Topic | Inhalt | Aufwand | Risiko |
|---|---|---|---|---|
| 1 | `topic:stability` | A1 (renderStreak), A2 (compressed-Days-Guard), A5 (Versions-Tag), B5 (lookupNutrients-Reihenfolge) | klein | minimal — reine Fixes |
| 2 | `topic:voice` | A4 / Issue #154: resultIndex-basiertes Transkript-Handling, Test iOS + Android | klein | mittel (Gerätetests nötig) |
| 3 | `topic:security` | A3: esc()-Audit über alle innerHTML-Stellen; Helper `entryRowHtml(e)` für die 3 duplizierten Eintragszeilen-Renderer (renderAll / renderMealDetail / editBody) | mittel | klein (rein additiv) |
| 4 | `topic:cleanup` | C4–C6: changelog.js + db.js auslagern (CORE_ASSETS!), unpkg-Script defer/lokal, Legacy-IDs & tote Pfade raus, DB-Duplikate (B7) bereinigen | mittel | mittel (SW-Cache-Pfade testen) |
| 5 | `topic:backup-ux` | C1: Backup-Einstiege konsolidieren, shareData entwirren; B2: Proxy-Gate mit „Später" + Validierung | mittel | klein |
| 6 | `topic:picker-ux` | C2: Quick→Eigenes, Link-Import deduplizieren; D1 Live-Suche | mittel | klein |
| 7 | `topic:help` | B10: HTML-Hilfe statt PDF-iframe; Manifest-Farben (B9); B3 Erinnerungen ehrlich machen | klein | minimal |
| 8 | `topic:storage` | D3 IndexedDB (größter Brocken, eigenes Migrations-Konzept + Backup-Kompatibilität) | groß | hoch — zuletzt, mit Autosave-Sicherheitsnetz |

Reihenfolge-Logik: erst crashes & Sicherheit (1–3), dann Substanz verschlanken (4) — das senkt die Kosten aller späteren Iterationen —, dann UX (5–7), Storage-Migration bewusst ans Ende.

Jede Iteration: Versions-Bump (APP_VERSION + sw.js + 2× Beta-Text), CHANGELOG nur bei nutzerwahrnehmbaren Punkten (1–3 sind teils still), Feature-Branch → PR → Merge, UEBERGABE.md aktualisieren.
