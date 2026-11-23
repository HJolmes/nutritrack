# NutriTrack B 3.0 — vollständiger technischer Implementierungsplan

**Stand:** 23.11.2026  
**Basis:** `HJolmes/nutritrack`, `main` bei der Prüfung: `f14855b` / App v0.334  
**Zielbild:** beschlossene Variante B 3.0, [bestehendes Zielkonzept](nutritrack_zielkonzept_B3_vollstaendig.md)  
**Status:** **Verabschiedeter Implementierungsplan; als Dokumentation im Repository hinterlegt. Die Umsetzung im Anwendungscode steht noch aus.**

## 1. Ergebnis, das am Ende geliefert werden soll

Eine **mobile-first PWA** im bisherigen warmen Bloom-Stil mit fünfteiliger, konfigurierbarer Navigation und einem kontextabhängigen `+`. Auf der Startseite: **„Gerade wichtig“ → sechs konfigurierbare Schnellaktionen → kompakte Tageskarten**. Die doppelte Liste „Deine Bereiche“ entfällt. Über die eigenständigen Bereiche **Ernährung, Baby und Haushalt** sowie **Mehr → Alle Funktionen** bleiben **alle heutigen Funktionen vollständig erreichbar**. Die neue UI nutzt die bestehenden Geschäftsregeln, Daten und Integrationen; weder Kalorien- noch Baby-/Schlaf- oder Vorratslogik wird nebenbei neu geschrieben.

**Nicht verhandelbare Fertigstellungskriterien:**

1. Alle existierenden Aktionen besitzen einen funktionierenden, auffindbaren Einstieg und bestehen den jeweiligen Regressionstest.
2. Alte Daten, Fotos, Tagebücher, Rezepte, Backup-Dateien, Kopplungen, persönlichen Schnellknöpfe und Einstellungen bleiben ohne Datenverlust nutzbar.
3. Die bestehende `NTBaby.nextSide()`-Berechnung und Still-Stoppuhr bleiben unverändert fachlich maßgeblich; „Nächste Brust: links/rechts“ ist auf **Heute** und **Baby → Heute** sichtbar, unabhängig von „Gerade wichtig“.
4. Laufende Vorgänge lassen sich mit denselben vorhandenen Funktionen starten, stoppen, wechseln, nachtragen, bearbeiten und synchronisieren.
5. Neue intelligente Hinweise bleiben optional, nachvollziehbar und unaufdringlich. Keine neue Systembenachrichtigung ohne ausdrückliches Opt-in; keine medizinischen Schlussfolgerungen aus fehlenden Einträgen.
6. Der klassische UI-Weg bleibt bis zum erfolgreichen Abschluss jeder Domäne als funktionierender Fallback verfügbar. Keine Platzhalterseite ersetzt eine bestehende Funktion.
7. Auf 320–430 px, mit vergrößerter Schrift, Tastatur und Screenreader sind sämtliche wichtigsten Aktionen erreichbar. Service-Worker-Update und Offlinebetrieb sind geprüft.

## 2. Technische Ausgangslage – tatsächlich geprüft

Die App ist **statisch** (GitHub Pages): `index.html` ~530 KB plus `picker.js`, klassische Scripts unter `js/`, `manifest.json`, `sw.js`; **kein React, kein Bundler, keine Runtime-npm-Abhängigkeiten**. `index.html` enthält CSS und die zentralen Screens. Klicks werden über `js/actions.js` und `data-act` delegiert. `js/features.js` mit `NTFeat.list()` ist bereits die fachliche Quelle des Funktionskatalogs, `js/launch.js` enthält Startkurzbefehle/Startleistenaktionen, `js/dashboard.js` enthält bestehende Kachelanordnungen.

Wichtige Ist-Systeme:

- **Speicher:** `S`/`localStorage.nt_v6`; Lebensmittel/Rezepte in `nt_x`, Barcodes in `nt_bc`; Fotos in IndexedDB. Bestehende Einzel-Geräte-/Single-Tab-Sperre `js/single-tab.js`; Verdichtung historischer Daten; Offline-Queue.
- **Baby:** `js/baby.js` mit elf Eintragstypen, Still-Stoppuhr, Wechsel, nächster Brust, Schnellknöpfen und Sync; `js/baby-sleep.js` und `js/baby-sleep-plan.js`; `baby-week`, `baby-growth`, `baby-milestones`, `baby-meds`, `baby-midwife`.
- **Ernährung:** `picker.js` mit sieben bisherigen Methoden; `js/calc.js`, `js/fooddb*.js`, `js/restaurants.js`, `js/ampel.js`, `js/recurring.js`, `js/templates.js`.
- **Planung/Küche:** `js/cookbook.js`, `js/book-swaps.js`, `js/mealplan.js`, `js/shopping.js`, `js/pantry.js`.
- **Weitere Systeme:** `js/stats.js`, `js/health-sync.js`, `js/partner.js`, `js/sync-core.js`, `js/alexa-sync.js`, `js/onedrive.js`, `js/autosave.js`, `js/reminders.js`, `js/food-export.js`, `js/xlsx.js`, `js/tour.js`, `js/offline-queue.js`, Worker/Decoder.
- **Bestehende Checks:** `npm run check`, `npm run typecheck`, `npm test`, `npm run smoke`, `node tools/worker-test.js`, `node tools/ampel-test.js`, Workflows in `.github/workflows/checks.yml`.

**Vor Arbeitsbeginn:** `UEBERGABE.md`, `AGENTS.md`, `CLAUDE.md` und den dann aktuellen `main`-Stand erneut lesen. Die Übergabe nennt teilweise v0.330, obwohl `main` bei der Prüfung v0.334 ist; den Live-Stand daher nicht allein aus dem Übergabe-Dokument ableiten.

## 3. Ziel-Navigation und Informationsarchitektur

```text
HEUTE                         ERNÄHRUNG                      BABY
├─ Gerade wichtig             ├─ Heute / Mahlzeiten          ├─ Heute (mit Nächste Brust)
├─ 6 kleine Schnellaktionen   ├─ Lebensmittel erfassen       ├─ Schlaf (Tag/Nacht, Prognose)
├─ Baby-Kurzstatus            ├─ Wasser, Sport, Fasten       ├─ Verlauf (Tagebuch, Arztbericht)
├─ Ernährung-Kurzstatus       ├─ Verlauf / Trends / Gewicht  └─ Entwicklung
└─ Weitere Tageshinweise      ├─ Kochbuch / Vorlagen            ├─ Wachstum / WHO
                              ├─ Wochenplan / Wiederkehrend     ├─ U-Heft / Meilensteine
                              └─ Ernährung / Ampel             ├─ Medikamente / Gaben
                                                                 └─ Fragen Arzt/Hebamme

HAUSHALT                      MEHR / ALLE FUNKTIONEN
├─ Einkaufsliste              ├─ Suchbarer vollständiger Funktionskatalog
├─ Vorrat                    ├─ Individuelle Navigation / Schnellaktionen
├─ Wochenplan                ├─ Profil, Ziele, Ernährung, Erinnerungen, KI
├─ Rezepte / Was kochen?     ├─ Verbindungen, Partner, Alexa, Health/OneDrive
└─ Warnhinweise MHD          └─ Backup, Ex-/Import, Hilfe, Tour, Feedback
```

**Bottom-Navigation:** `Heute | frei | + | frei | frei`; anfänglich `Heute | Ernährung | + | Baby | Haushalt`. Die **drei äußeren Slots** dürfen auf andere Ziele wie Einkaufen, Vorrat, Wochenplan, Kochbuch, Verlauf oder Mehr umbelegt werden. „Mehr“ muss **auch dann** über das Profil-/Menüsymbol erreichbar bleiben, wenn es nicht in der Bottom-Leiste steht. Keine doppelten Ziele; deaktivierte Features lösen verständliche Fallbacks aus.

**Kontext-Plus:** Heute → übergreifender Erfassen-Wähler; Ernährung → bestehender `NTPicker`; Baby (auch Unterseiten) → elf Baby-Eintragstypen; Haushalt → Einkauf/Vorrat; Liste → direkt Artikel hinzufügen; Vorrat → direkt Vorratsartikel; Kochbuch → Rezepteditor/Import; Wochenplan → Planposition/Rezept/Notiz. Spezialbildschirme erben den Eigentümerbereich, nicht blind den vorherigen Tab.

## 4. Daten- und Komponentenarchitektur

**Minimal-invasive Ergänzung, keine Neuentwicklung der App:**

| Komponente (Arbeitsname) | Verantwortung | Bestehendes System nutzen |
|---|---|---|
| `js/ui-shell.js` (`NTUI`) | Bereichsrouter, Backstack, Bottom-Slots, aktiver Bereich, Fokus/Scroll | `index.html`, `js/actions.js`, bestehende `openOv`/`closeOv` |
| `js/ui-catalog.js` | Ein gemeinsames Ziel-/Aktionsregister; keine zweite unabhängige Featureliste | `NTFeat.list()`, `NTLaunch`, `NTActions.resolve()` |
| `js/ui-actions.js` | Kontext-Plus; zentraler Action-Dispatch; Deep-Links/Shortcut-Kompatibilität | `NTPicker`, `NTBaby`, `NTShop`, `NTPantry`, `NTPlan`, `NTBook` |
| `js/ui-home.js` | Tagesübersicht, kompaktes Baby-/Ernährungssignal, sechs Quickactions | `NTBaby`, `NTLaunch`, `NTStats`, bestehende Rendering-Pfade |
| `js/ui-priority.js` | Rein regelbasierte, testbare Priorisierung „Gerade wichtig“ | Bestehende Logs, konfigurierte Erinnerungen/Schlafprognosen |
| `js/ui-baby.js` | Neue vier Baby-Unterbereiche; vorhandene Widgets/Module integrieren | `NTBaby`, `NTBabySleep*`, `NTBabyWeek`, `NTGrowth`, `NTMile` usw. |
| `js/ui-nutrition.js` | Neue Bereiche/Ansichten, ohne Kopie des Pickers | `NTPicker`, `NTStats`, `NTRecur`, `NTTpl`, `NTHealth` |
| `js/ui-household.js` | Neue Bereichsübersicht und Unterseiten | `NTShop`, `NTPantry`, `NTPlan`, `NTBook` |
| `js/ui-reminder-rules.js` | Präferenzen + automatische Empfehlungen, klar getrennt von OS-Benachrichtigungen | `S.days`, `NTRemind`, `NTBabySleep` |
| `js/ui-settings.js` | Navigation, Quickactions, Benachrichtigungsarten, Lernmodus, klassische Ansicht | `S`/`saveS`, `NTFeat` |

**Wichtig für das Repository:** Alle neuen Module sind **klassische Scripts** mit `// @ts-check` und Namespace auf `window`, ohne Bundler. `index.html` nicht weiter mit Logik füllen. Neue Module in `sw.js` `CORE_ASSETS` aufnehmen; lokale `<script src>` mit passendem `?v=`. Bestehende Kopplungsgrenzen aus `tools/coupling-allow.json` beachten: neue Abhängigkeiten über kleine, gezielte Adapter statt immer größerem `index.html`-API-Kern. Rechenlogik bei Bedarf als reine, separat getestete Funktion in `js/calc.js`.

### Persistenzstrategie

- Neue Layoutpräferenzen **additiv** und versioniert (`S.ui` oder gleichwertiges, minimal großes Schema): `version`, `navSlots`, `homeActions`, `homeCards`, `priorityPreferences`, `mealReminderModes`, `lastSection`. Defaults für alte Bestände ohne Migration des fachlichen Zustands.
- **`S.babyQuick`, `S.launchBar`, `S.dashOrder`, `S.dashHidden` nicht überschreiben.** Die neuen sechs Home-Schnellaktionen sind eine **eigene** Auswahl, die auf dieselben bestehenden Aktions-IDs zeigt. Alte Schnellleiste/Kachelanordnung für Rückfall beibehalten. Bestehende Baby-Schnellknöpfe (bis zehn) bleiben unabhängig konfigurierbar.
- Benutzerbezogene Lernzustände möglichst **aus vorhandenen Einträgen** berechnen, nicht jede App-Interaktion dauerhaft protokollieren. Für Ausblenden/Stummschalten minimalen lokalen Zeitstempel speichern; keine Analytics-Übertragung, kein heimlicher Serverbedarf.
- Fachlogs/Synchronisationsmetadaten unverändert lassen (`S.babyLog`, `S.babyMeds`, `S.babyMiles`, `S.babyQs`, `S.shopList`, `S.pantry`, `S.mealPlan`, `S.links` usw.). UI-Einstellungen dürfen keine zusätzlichen Sync-Records in Fach-Töpfe schreiben.
- Vollständige Kompatibilität mit Backup, OneDrive, bisherigen lokalen Zuständen und gerätelokalen Fotos; Rückfall auf alte UI muss ohne Migration rückwärts funktionieren.
- **Recovery:** Schalter „Klassische Ansicht“ plus eine vorab definierte technische Notfall-Route (`?ui=classic`) implementieren, auch wenn die neue Shell selbst nicht startet.

## 5. Vollständige Funktionsmatrix: jede Alt-Funktion bekommt ein neues Zuhause

**Legende:** E = existierendes Fachmodul/Code bleibt maßgeblich; N = neue Darstellung/Navigation; T = konkrete Regression. Die Matrix ist **Pflicht-Checkliste**; vor Abschluss mit aus `NTFeat`, `NTLaunch`, `NTActions` und tatsächlichen HTML-Aktionen generierter Inventarliste abgleichen.

| ID | Zu erhaltene Funktion / Details | Neuer Einstieg | Bestehende Quelle | Abnahmetest |
|---|---|---|---|---|
| F01 | Einrichtung, Profil, Zielkalorien, Gewicht, Ernährungsziel, Kalorienbedarf | Mehr → Profil / Ziele; Ernährung → Einstellungen | `index.html`, `js/calc.js` | Zieländerung korrekt in Tagesbilanz |
| F02 | Tag wechseln, alte Tage und verdichtete Tage wieder öffnen | Ernährung → Verlauf; Heute → Datum | `index.html`, `js/calc.js` | Historie >90 Tage lesbar; heute unverändert |
| F03 | Mahlzeiten Frühstück/Mittag/Abend/Snack, Mengen, Nährwerte, Bearbeiten, Verschieben, Löschen | Ernährung → Heute; `+` | `index.html`, `picker.js` | jede Slot-Aktion, Makrosumme unverändert |
| F04 | Text-/Chat-Eintrag mit sicherer Voranalyse und KI-Fallback | Ernährung → + → Text | `picker.js` | sichere Erkennung, Unklarheiten rückfragen |
| F05 | Lebensmittelsuche, eigene Lebensmittel, zuletzt verwendet | Ernährung → + → Suchen / Zuletzt / Eigenes | `picker.js`, `js/fooddb*.js` | keine Einträge/Sortierung verloren |
| F06 | Barcode via Kamera/Decoder/OFF, lokale Cache-Treffer | Ernährung → + → Barcode | `picker.js`, ZXing, Worker/Decoder | Kamera, Berechtigung, Offline-Fallback |
| F07 | Foto-KI zur Mahlzeit, Bildverwaltung | Ernährung → + → Foto | `picker.js`, `js/idb-photos.js` | Bild-ID bleibt, keine Löschung bei Edit |
| F08 | Rezept-/Produktlink, Import-Parser | Ernährung → + → Link; Kochbuch → Import | `picker.js`, Worker | gleiche Import-Vorschau wie vorher |
| F09 | Lebensmittel-/Restaurant-Nährwerte DE, Datenbank, Fehlerkennzeichnung | Ernährung → Suche | `js/fooddb*.js`, `js/restaurants.js`, `js/calc.js` | Treffer und Grammanpassung korrekt |
| F10 | Ernährungsampel für Stillzeit, Schwangerschaft, Ernährungsform, Allergien | Ernährung → Mahlzeitdetails / Profil | `js/ampel.js`, `index.html` | identische Hinweise/Schutzlogik |
| F11 | Wiederkehrende Mahlzeiten, Pausieren, Vorlagen | Ernährung → Planung / Vorlagen | `js/recurring.js`, `js/templates.js` | Wiederholungen nicht doppelt gebucht |
| F12 | Kalorien, Makros, Wasser, Bewegung, Fasten, Tagesbilanz | Ernährung → Heute | `index.html`, `js/calc.js` | Referenzdaten = gleiche Werte |
| F13 | Wasserzähler, Glasgröße und Wasserziel, Trinkhinweise | Ernährung → Wasser; Home-Schnellaktion | `index.html`, `js/features.js` | `S.waterGoal` und Tageswert erhalten |
| F14 | Sport/Bewegung, MET, eigene Bibliothek, kcal-Abzug | Ernährung → Aktivität | `index.html`, `js/metdb.js` | MET/Netto-Bilanz konstant |
| F15 | Apple-/Samsung-Health-Import via Worker | Ernährung → Aktivität / Mehr → Integrationen | `js/health-sync.js` | mehrfaches Abholen ohne Dubletten |
| F16 | Fasten, Lauf/Ende, Erinnerung | Ernährung → Fasten; Gerade wichtig, wenn läuft | `index.html`, `js/reminders.js` | `nt_fast` unverändert, Ende nicht falsch |
| F17 | Gewicht, Gewichtsziel, Trend, 7-/14-/30-Tage-Daten, Wochenbericht, Streak | Ernährung → Verlauf / Trends | `js/stats.js` | Tages-/Wochen-/Gewichtsansichten stimmen |
| F18 | Kochbuch: Grundrezepte, eigene, Favoriten, Filter, Tags | Ernährung → Kochbuch; Haushalt → Rezepte | `js/cookbook.js`, `js/book-seed.js` | keine Rezept-ID/Markierung verloren |
| F19 | Rezepteditor, Foto-/Link-Import, Nährwerte, Portionen | Kochbuch → + / Details | `js/cookbook.js`, `picker.js` | Bearbeiten/Import und Portionen stabil |
| F20 | Kochmodus, Rezeptanpassung nach Profil, KI, Originalansicht | Kochbuch → Rezept | `js/book-swaps.js`, `js/cookbook.js` | „Original“/„angepasst“ konsistent |
| F21 | Rezepte kochen, Eintrag ins Tagebuch, Zutaten auf Einkaufszettel | Rezeptdetail / Kochmodus | `NTBook`, `NTPlan`, `NTShop` | Verknüpfungen durchgängig |
| F22 | Wochenplan: Tage, Slots, Notizen, Füllen, Portionen, Übernahme, Teilen | Haushalt → Wochenplan; Ernährung → Planung | `js/mealplan.js` | Auto-Füllung, Einkauf, Sync unverändert |
| F23 | Einkaufszettel: Kategorien, Mengen, Abhaken, Historie, Schnelleingabe | Haushalt → Einkauf / + | `js/shopping.js` | editieren, abhaken, wiederholen |
| F24 | Einkauf: Rezeptzutaten/Mengen zusammenführen, Kategorien lernen | Einkauf / Rezept / Plan | `js/shopping.js`, `js/calc.js` | Mengen/Herkunft nicht verfälschen |
| F25 | Vorrat: Lagerorte, Mengen/Mindestbestand, MHD/Verbrauchsdatum | Haushalt → Vorrat / + | `js/pantry.js` | Menge + MHD nach Edit identisch |
| F26 | Vorrat: Fotoauswertung, Scanner, Verbrauch, Undo, Historie | Haushalt → Vorrat | `js/pantry.js`, `js/idb-photos.js` | Korrektur/Undo, keine Doppelbuchung |
| F27 | Vorrat ↔ Einkauf ↔ Rezept: Mindestmengen, Nachfüllen, Kochen, „Was kochen?“ | Haushalt → Vorrat / Rezepte | `NTShop`, `NTPantry`, `NTBook` | Bestandsfluss unter allen Wegen |
| F28 | Baby: nächste Brust, letzte Mahlzeit, Start/Stop/Wechsel der Stoppuhr | Heute und Baby → Heute, dauerhaft | `js/baby.js`, `js/launch.js` | F28-Szenarien siehe Abschnitt 8 |
| F29 | Baby: alle 11 Eintragstypen, Datum, Zeit, Pflichtfelder, Bearbeiten/Löschen | Baby → + und Tagebuch | `js/baby.js` | jeder Typ erstellt/editiert/löscht |
| F30 | Baby: 10 persönliche Schnellknöpfe inkl. Seite/Timer/Nacht/Windel | Baby → Schnellknöpfe bearbeiten | `js/baby.js` | alle alten Konfigurationen identisch |
| F31 | Baby: Schlaf starten/stoppen, Nacht/Tag, über Mitternacht, historische Annahmen | Baby → Schlaf | `js/baby-sleep.js`, `js/baby.js` | echte/angenommene Zeiten getrennt |
| F32 | Baby: Schlafprognose, Tagesplan, Qualität, Prognose als Entwurf | Baby → Schlaf | `js/baby-sleep-plan.js` | Zukunft nie automatisch als Ist-Sleep |
| F33 | Baby: Tages-/7-/14-Tage-Verlauf, Beikost und Arztbericht | Baby → Verlauf | `js/baby-week.js` | Teilen/Kopieren und Summen stimmen |
| F34 | Baby: Wachstum Gewicht/Länge/Kopfumfang + WHO-Kurven | Baby → Entwicklung → Wachstum | `js/baby-growth.js`, `baby-growth-data.js` | Datums- und Perzentilwerte identisch |
| F35 | Baby: U-Untersuchungen, Termine, Impfungen, Meilensteine | Baby → Entwicklung → U-Heft | `js/baby-milestones.js` | bestehende Meilenstein-IDs beibehalten |
| F36 | Baby: Medikamente, Dosis/Gaben, vorhandene Abstandslogik | Baby → Entwicklung → Medizin | `js/baby-meds.js` | Gabeverlauf/Abstand wie bisher |
| F37 | Baby: Fragen an Arzt/Hebamme, Antworten, erledigte Fragen, Suche | Baby → Entwicklung → Fragen | `js/baby-midwife.js` | Empfänger/Status/Export erhalten |
| F38 | Baby: Stammdaten, An-/Ausschalten, Sync mit weiteren Personen | Mehr → Funktionen / Verbindungen | `js/features.js`, `js/baby.js`, `js/sync-core.js` | ausgeschaltetes Tagebuch bleibt erhalten |
| F39 | Verbindungen/Synchronisation: Baby, Einkauf, Vorrat, Plan | Mehr → Verbindungen (auch je Fachbereich) | `js/sync-core.js` + Module | Zwei-Geräte-Konflikte, Tombstones |
| F40 | Partner-Postfach, Mahlzeit senden, Import übernehmen | Mehr → Partner; Mahlzeitdetail | `js/partner.js` | Versand/Annahme nach wie vor möglich |
| F41 | Alexa: Familien-/Personen-Tokens, Baby/Einkauf/Ernährung/Sport/Wasser | Mehr → Alexa | `js/alexa-sync.js`, `alexa/` | gleiche Befehle, deduplizierter Import |
| F42 | OneDrive PKCE, Autosicherung, lokale Autosaves, Backup/Restore | Mehr → Backup & Daten | `js/onedrive.js`, `js/autosave.js` | Restore alt/neu, keine Tokenlöschung |
| F43 | Teilen per Link/Code, Import-Vorschau, iOS-Handoff | Mehr → Import/Teilen, Fachdetails | `index.html`, Worker | alle Payloadtypen funktionieren |
| F44 | Exporte: Excel, Lebensmittel, Berichte/Teilen | Mehr → Export; Bereichs-Verlauf | `js/food-export.js`, `js/xlsx.js` | Import/Export-Ergebnis geprüft |
| F45 | Erinnerungen: feste Zeiten, Wasser/Fasten/Vorrat | Mehr → Erinnerungen | `js/reminders.js`, `js/pantry.js` | bestehende Timer unabhängig von Lernen |
| F46 | KI: Anbieter, eigene Schlüssel, Vision, Prompts, Proxy | Mehr → KI & Datenschutz | `index.html`, Worker | keine Tokens im Log, kein Providerwechsel |
| F47 | Feedback: Bug/Wunsch, Screenshot, Hilfe, App-Tour, Changelog | Mehr → Hilfe & Feedback | `js/tour.js`, `js/changelog.js`, `index.html` | Feedback/Schritte erreichbar |
| F48 | PWA: Installieren, Updates, Offline, Manifest-Shortcuts, Single-Tab | Unverändert + Einstellungen/Info | `sw.js`, `manifest.json`, `js/single-tab.js` | Update, wieder online, zweiter Tab |
| F49 | Anpassung: Features an/aus, Kacheln, bisherige Schnellauswahl | Mehr → Funktionen / Ansicht | `js/features.js`, `dashboard.js`, `launch.js` | Altpräferenzen nicht überschreiben |
| F50 | Persistenz: lokale Fotos, Offline-Queue, historische Verdichtung, Tageswechsel | Querschnitt, keine sichtbare Verlustrisiko-Stelle | `js/idb-photos.js`, `offline-queue.js`, `calc.js` | Daten vor/nach Umbau byte-/semantisch verglichen |

**Bei jeder Zeile:** Code-Referenz verifizieren → Ziel-Einstieg implementieren → funktionalen Test schreiben → manuellen Mobile-Test dokumentieren → Haken erst setzen, wenn der Klick im neuen UI den **echten** alten Fachworkflow auslöst. Nicht bei einer Demo-Ansicht abhaken.

## 6. „Gerade wichtig“, Lernen und Schnellaktionen – implementierbare Regeln

### 6.1 Prioritäts-Engine

Eingabe: **aktueller Zeitpunkt**, lokale Tagesdaten, aktive Funktionen, laufende Vorgänge, fällige ausdrücklich konfigurierte Erinnerungen, Baby-Schlafprognose mit Qualitätsklasse, Haushalts-/Planungszustand, individuelle Unterdrückungen. Ausgabe: eine **sortierte Liste erklärbarer Hinweisobjekte** `{id,priority,source,title,detail,action,expiresAt,reason,kind}`. Höchstens **2 Karten**, davon eine prominent. Keine blanken Warnungen nur aufgrund fehlender Tracking-Einträge.

Reihenfolge:

1. **Laufende Aktion** (Still-Stoppuhr; laufender Schlaf/Fasten) → direkt bedienbarer Zustand „Beenden“ / „Seite wechseln“. Ein laufender Vorgang ist ein Status, kein Erinnerungsalgorithmus.
2. **Explizit vom Nutzer gesetzte Termine/Erinnerungen** zum passenden Zeitpunkt (ohne medizinische Dosierungsentscheidung).
3. **Zeitnahe, ausreichend begründete Prognose**, z. B. Schlaf; immer Label „Schätzung“ und Unsicherheit/Datengrundlage.
4. **Konfigurierbare Essens-/Wasser-/Plan-/Vorratshinweise** nur wenn relevant und nicht pausiert.
5. **Ruhiger Fallback**: sinnvoller Tagesstand oder „Alles erfasst, was du heute brauchst“; nie zwanghaft einen Hinweis erfinden.

Die permanente Baby-Kurzkarte mit **„Nächste Brust“** darf nicht mit diesen 2 Hinweiskarten konkurrieren; sie erscheint unabhängig davon, wenn Baby aktiviert ist.

### 6.2 Lernende Mahlzeiten-Erinnerungen

**Vier unabhängige Konfigurationen:** Frühstück / Mittag / Abend / Snack je `automatisch` (Standard), `immer`, `nie`; ergänzend Zeiten/Fenster, Snooze und optional nur **In-App-Hinweis** oder **Systembenachrichtigung**, letztere standardmäßig aus. Alte feste `S.reminders` existieren weiter und werden nie heimlich geändert. Konflikte klar erklären: Ein ausdrücklich aktivierter fester Timer wird nicht automatisch gelöscht, sondern auf Wunsch verknüpft/umgestellt.

**Deterministischer erster Algorithmus** (keine Blackbox):

- Betrachtung max. **28 letzter Kalendertage**, nur Tage, an denen überhaupt nennenswerte Ernährung getrackt wurde, um lange Pausen nicht als „Nie frühstücken“ zu deuten.
- Für automatisch mindestens **14 auswertbare Tage**; bei weniger Daten: **keine neuen Mahlzeiten-Pushes**, höchstens dezente In-App-Hilfe nach Nutzerinteraktion. Die Schwellen werden nach Nutzertest feinjustiert, nicht als medizinische Wahrheit verstanden.
- Wenn bei mindestens **12 von 14** auswertbaren Tagen eine Mahlzeit nicht vorkam, **keinen fehlenden Eintrag anmahnen**; vielmehr als „gewöhnlich nicht erfasst“ behandeln. Ist sie häufig vorhanden, Hinweis nur nahe der typischen (robusten medianen) Uhrzeit und nur, wenn bis dahin noch kein entsprechender Eintrag vorliegt.
- Tage ohne Eintrag sind **keine** definitive Aussage darüber, ob gegessen wurde; Oberfläche spricht von „nicht üblicherweise getrackt“, nie „du isst nie Frühstück“.
- `immer` ignoriert den Lernfilter, aber prüft vorhandenen Eintrag, Tageszeit und Snooze; `nie` unterdrückt alle **neu generierten** Hinweise dieses Mahlzeittyps. Überschreibbar, zurücksetzbar, mit Erklärung „Warum sehe ich das?“.
- Bei Krankheit, Urlaub, Arbeitszeitwechsel oder bewusster Änderung reagiert der rollierende Zeitraum; Nutzer kann Lernverhalten zurücksetzen. Keine stille Ernährungsbewertung, kein Schuld-/Druckton.

**Beispieltest:** 21 Tage jeweils Mittag + Abend erfasst, 0× Frühstück → am Morgen **kein Frühstückshinweis**, obwohl Frühstück fehlt. `immer` → Hinweis, `nie` → keiner; ein nachgetragenes Frühstück → nicht doppelt erinnern.

### 6.3 Konfigurierbare Aktionen und Navigation

- Startseite **sechs Plätze**; kleine Buttons direkt unter „Gerade wichtig“; Auswahl aus einem zentralen Register und eigene Reihenfolge. Bei deaktiviertem Modul ein nachvollziehbares Ersatz-/Aktivierungsangebot, keine tote Kachel.
- Bestehendes `S.launchBar` mit bisherigen App-Kurzbefehlen **unverändert lassen**; neue Home-Auswahl separate Persistenz. `manifest.json`-Kurzbefehle behalten ihre `?action=<id>`-Semantik.
- **10 vorhandene Baby-Schnellknöpfe** mit Nutzerkonfiguration **nicht** durch sechs Home-Aktionen begrenzen. Baby-Heute kann sie unter „Schnell erfassen“ alle anzeigen und bearbeiten.
- Sobald Stillen oder Schlaf läuft, dort direkt **Stoppen** anbieten, nicht einen zweiten Start auslösen. Schutz vor Doppelklick und Sync-Race.

## 7. Arbeitspakete: konkrete PR-Reihenfolge

**Größen:** S = klein, M = mittel, L = größer; Schätzungen dienen der Reihenfolge, nicht als Kalender- oder Fertigstellungszusage. **Jeder PR eigenständiger, nutzbarer, rückrollbarer Schritt**; genau ein klarer `topic:`-Bereich pro Iteration beachten.

| PR | Priorität / Größe | Konkrete Änderungen / Dateien (voraussichtlich) | Muss-Abnahme | Abhängigkeit |
|---|---|---|---|---|
| **00 – Bestandsaufnahme** | P0 / M | Aktionsregister aus `NTFeat`, `NTLaunch`, HTML, Namespace-Exports erfassen; F01–F50 als Test-Matrix; anonymisierte Fixture-Daten, Screens 320/390/430 | Alle heute vorhandenen Aktionen erfasst; Classic-Snapshot wiederherstellbar | keine |
| **01 – Design-Tokens** | P0 / M | CSS in `index.html`: Bloom-Farben/Schrift/Spacing, Touchflächen, Kontrast, Zoom, Statusfarben; unter neuem UI-Root kapseln | Altansicht optisch unverändert; WCAG-AA soweit anwendbar | 00 |
| **02 – Katalog/Router-Grundlage** | P0 / M | `js/ui-catalog.js`, `ui-shell.js`; `NTFeat` bleibt einzige Feature-Quelle, `NTActions` wird wiederverwendet | Kein `data-act` tot; alle Fallbacks sichtbar | 00 |
| **03 – Navigation & Back** | P0 / L | Shell: fünfteilige Leiste, 3 freie Slots, kein Doppelziel, aktive Unterseite, Zurück, Tastatur, „Mehr“ dauerhaft erreichbar | Slots nach Reload, Browser-Back, zweiter Tab | 01–02 |
| **04 – Kontext-Plus** | P0 / M | `js/ui-actions.js`; richtige Fach-Aktion in allen Kontexten, alte Dialoge weiterverwenden | Baby zeigt 11 Typen, Ernährung Picker, Haushalt Artikel/Vorrat | 03 |
| **05 – Neue Startseite** | P0 / L | `js/ui-home.js`; „Deine Bereiche“ entfernen; kompakte Baby-/Ernährungs-/Tageskarten | Nächste Brust und laufender Vorgang sichtbar, kein Inhalt verschluckt | 03–04 |
| **06 – Home-Schnellaktionen** | P0 / M | 6 freie Actions, Verwaltung/Sortierung, getrennt von `S.launchBar` und `S.babyQuick` | bestehende Kurzbefehl-IDs/Quick-Einstellungen identisch | 05 |
| **07 – Baby heute & Stillen** | P0 / L | `js/ui-baby.js`: Status, Brustvorschlag, Start/Stop/Wechsel, vergangene Mahlzeit, alle persönlichen Baby-Knöpfe | 10 Brust-Regressionen; Zweitgerät/Offline | 04–06 |
| **08 – Baby: 11 Dialogtypen & Tagebuch** | P0 / L | bestehende `NTBaby.openEntry`/`saveEntry` über `+`; Edit/Undo/Löschen, Sync; ggf. Dialogcontainer optisch modernisieren | alle Pflichtfelder, Nachtragen, Mitternacht, Back | 07 |
| **09 – Baby: Schlaf** | P0 / L | 24-h-Timeline, Erfasst/Angenommen/Prognose, Klartextqualität, Schlaffensteraktionen; **kein** zweiter Prognosealgorithmus | Schlafplan-Test; kein Zukunfts-Ist, Nacht/Tag korrigierbar | 08 |
| **10 – Baby: Verlauf/Entwicklung** | P0 / L | 7/14 Tage, Arztbericht, WHO, U-Heft, Meilensteine, Termine, Medikamente, Fragen | Arztbericht/WHO/Gaben/IDs/Sync wie alt | 08 |
| **11 – Home-Priorität** | P1 / M | reine Regel-Engine; max. 2 Hinweise, Begriffe und Gründe; Aktivitätsstatus getrennt | Laufendes Stillen vor Prognose; keine unbegründete Meldung | 07,09 |
| **12 – Lernende Erinnerungen** | P1 / L | 4× Auto/Immer/Nie, Lernschwellen, Snooze, manueller Timer-Dialog; `NTRemind` schützen | 21-Tage-ohne-Frühstück-Test; vorhandene Timer unverändert | 11 |
| **13 – Ernährung & Picker-Oberfläche** | P1 / L | Ernährung Heute, vier Mahlzeiten, alle 7 Picker-Wege, Bearbeiten/Verschieben, Ampeln; alte NTPicker-Routine | identische Nährwerte, Foto-ID, Barcode, Import | 04–05 |
| **14 – Ernährung: Verlauf & Aktivität** | P1 / L | Trends, Gewicht, Wochenbericht, Sport/MET/Health, Wasser, Fasten, Ziele | Makros/Sport/Wasser/Trends/Fasten gleich | 13 |
| **15 – Kochbuch** | P1 / L | Hauptlisten, Suche/Filter, Rezeptdetails, Editor, Kochmodus, Foto/Link, Anpassung/Original | alle Rezepttypen; neue/alte IDs; keine KI-Regressionsfehler | 13 |
| **16 – Wochenplan & Wiederkehrend** | P1 / L | Plan-Tage, Auto-Füllen, Rezepte, Notizen, Einkauf, Tagebuch, Shares, Vorlagen | AutoFill, Einkaufskette, wiederkehrende Tage identisch | 15 |
| **17 – Haushalt: Einkauf** | P1 / M | Einkauf als Hauptunterbereich; Kategorien, Eingabe, Menge, Rezeptlink, Teilen | Kreuztests Plan/Kochbuch/Einkauf; Sync | 04,16 |
| **18 – Haushalt: Vorrat** | P1 / L | Vorrat, Lagerorte, MHD, Scanner, Foto, Verbrauch/Undo, Kochideen, Einkaufskopplung | keine Mengenabweichung; Offline und Sync | 17 |
| **19 – Mehr & Einstellungen** | P1 / L | Suchbarer Vollkatalog, Profil/Ziele, KI-Anbieter, Navigation/Quick, Baby-Schalter, alte Feature-Kachelsteuerung, Hilfe, Tour, Feedback | F01–F50 über Mehr oder Bereich erreichbar | 02–18 |
| **20 – Daten & Integrationen** | P1 / L | OneDrive/Backups/Autosave/Excel, Link-Teilen/Import, Partner, Alexa, Health, Worker-Interfaces optisch erreichbar | Alt-Backup importiert; Schlüssel sicher; Sync/Token/Fotos | 19 |
| **21 – Stabilisierung** | P0 vor Rollout / L | `sw.js`, PWA, Performance, Accessibility, responsive Tests, Lokalisierung DE, visuelle Regression, Recovery-URL, Dokumentation | Gates in Abschnitten 8/9 grün; kein Hochrisikobug | 00–20 |
| **22 – Aktivierung & Cleanup** | P0 vor Abschluss / M | neue Oberfläche standardmäßig aktivieren, alte Ansicht noch als Fallback; erst danach verwaiste Präsentation entfernen | F01–F50 endgültig abgehakt; erneutes Backup/Restore erfolgreich | 21 |

**Reihenfolge nach Nutzwert:** PR 00–07 zuerst: Navigation/Startseite/Baby mit nächster Brust. PR 08–10 schließen den Baby-Bereich; PR 11–12 machen „Gerade wichtig“ intelligent. Danach Ernährung, Küche, Haushalt und Integrationen. Fachliche Änderungen an der Produktivlogik nur, wenn ein reproduzierbarer Alt-Fehler sie zwingend erfordert; sonst kein Scope-Creep.

### Wie ein PR aussieht (Definition of Done)

- [ ] Eine klar beschriebene Nutzerreise mit Vorher/Nachher-Screenshot, GitHub-Topic, veränderten Dateien und Risiko.
- [ ] Ein echter Einstieg über den neuen Screen **und** ein vorhandener funktionierender Fallback.
- [ ] Keine geänderte fachliche Berechnung, sofern nicht separat getestet/begründet; keine neue Dublette von APIs/Datenmodellen.
- [ ] Tests zu Happy Path, fehlender Historie, gespeicherten Altwerten, Offline/Online und zumindest einem Fehlerfall.
- [ ] Mobile Touch-Test und Bildschirmbreiten 320, 390, 430 px; Tastatur, Scroll, Modal, Rücknavigation, große Schrift.
- [ ] Keine Console Errors, keine unaufgelösten `data-act`-/Namespace-Referenzen.
- [ ] `node tools/bump.js`, versionsgleiches `APP_VERSION`/`sw.js`, `?v`, `CORE_ASSETS`, CHANGELOG bei sichtbarer Änderung.
- [ ] `npm ci && npm run check && npm run typecheck && npm test && npm run smoke`; bei Änderungen an Worker `node tools/worker-test.js`, für Ernährungsampeln `node tools/ampel-test.js`.
- [ ] `UEBERGABE.md` nach Änderung aktualisieren, datenschutzfreundliche Fixtures, Review und erfolgreicher PR-Check **vor Merge**.

## 8. Abnahme-Szenarien, die nicht verhandelbar sind

### A. Baby & Brustfolge

1. Letztes Stillen rechts → **links** auf Heute/Baby sichtbar und als Start vorbelegt; umgekehrt entsprechend.
2. `side='b', main='r'` → links vorgeschlagen; ohne `main` keine erfundene Hauptseite (alte eindeutige Seite bleibt relevant).
3. Eine dazwischen liegende Flasche, Beikost, Windel oder Pumpe ändert die Brustfolge nicht.
4. Start rechts trotz Vorschlag links → rechts korrekt protokolliert, danach links vorgeschlagen.
5. Laufender Timer bleibt beim Wechsel des Screens/Reopen aktiv; **Stopp** beendet genau diesen Eintrag.
6. **⇄ Wechsel** stoppt die aktuelle Seite, startet die andere, mit getrennten Dauern; doppelte Starts verhindern.
7. Zweitgerät führt Stopp aus → erstes Gerät merkt dies nach Sync, kein anderer Lauf wird gestoppt.
8. Nachtrag, Bearbeiten, Löschen und historisches Tagesdatum → `NTBaby.nextSide()` wird erneut berechnet.
9. Alle 11 Eintragstypen samt Pflichtfeldern, U-Heft-Daten und Medizin/Gaben bleiben editierbar.
10. `S.babyQuick` mit benutzerdefinierten Zeiten/Seiten und bis 10 Aktionen bleibt nach Update/Backup unverändert.

### B. Schlaf & Hinweise

11. Echte Schlafzeiten, aus Nachtversorgungen **angenommene** Zeiten und prognostizierte Zeiten sind im UI und Datenmodell klar getrennt; Prognosen werden niemals ohne Bestätigung gespeichert.
12. Über-Mitternacht-Schlaf läuft korrekt, Tag/Nacht-Flag bleibt manuell überschreibbar; fehlende Messwerte verursachen keinen erfundenen Tagesplan.
13. „Kein Frühstück“-Historie mit 21 auswertbaren Tagen: `automatisch` unterdrückt Frühstückshinweis; `immer` zeigt ihn, `nie` unterdrückt ihn; andere Mahlzeiten unabhängig.
14. Bereits erfasste Mahlzeit → keine zweite unnötige Erinnerung; Pausieren/Snooze wirkt, feste Alt-Timer bleiben funktionsfähig.
15. Wenn nichts fällig ist, bleibt „Gerade wichtig“ ruhig; medizinische Schlüsse aus einer nicht erfassten Windel/Mahlzeit werden nicht suggeriert.

### C. Querschnitt & Integrationen

16. Kontext-Plus in jedem Bereich öffnet **richtigen** Editor, auch nach Tabwechsel, Deep-Link und Browser-Back.
17. Neue Navigation und sechs Home-Favoriten bleiben nach Reload; keine doppelten Targets; „Mehr“ und Funktionen auch bei frei belegten Slots erreichbar.
18. Barcode, Foto und Link sind unter Ernährungs-`+` nutzbar; vorhandene Fotos bleiben gerätelokal zugeordnet.
19. Alle Rezept-/Plan-/Einkaufs-/Vorrats-Übergaben berechnen richtige Mengen und erzeugen keine Doppelbuchungen.
20. Bestehendes Backup vor Umbau → neue Version importieren → identische Tages-/Baby-/Küchenzahlen; neuer Export kann in klassischer UI gelesen werden, soweit vom alten Schema unterstützt.
21. Zwei Geräte: Baby, Plan, Einkauf und Vorrat syncen wie vorher; konkurrierende Bearbeitungen/Tombstones lösen keine Datenwiederauferstehung aus.
22. Offline am Folgetag: Baby/Ernährung erfassen, App neu öffnen, später online synchronisieren; keine verlorenen Einträge.
23. Android-PWA: Auf Startbildschirm, Shortcuts, Update, Offline und Zurück-Geste; Safari/iOS: Tastatur, Dateisicherung, Softkeyboard und Safe Areas.
24. Accessibility: 320 px, 200 % Zoom/vergrößerte Schrift, ausreichender Textkontrast, Touchgrößen, Screenreader-Namen, Fokus nach Modalschluss.
25. Alte App-Oberfläche ist bei fehlgeschlagener UI-Initialisierung erreichbar; vollständige fachliche Daten bleiben vorhanden.

## 9. Test- und Freigabe-Gates

| Gate | Zeitpunkt | Verlangte Nachweise |
|---|---|---|
| **G0 Baseline** | vor Code | anonymisierte Test-Backups, aktuelle Screens, F01–F50, klassischer Fallback |
| **G1 Shell** | nach PR 04 | Menü/Navigation/Plus/Back/Feature-Switches ohne kaputte Altwege |
| **G2 Baby** | nach PR 10 | alle 10 Brust-Szenarien, Baby 11 Typen, Schlaf, Entwicklung, Sync |
| **G3 Home** | nach PR 12 | keine aufdringlichen Hinweise, Mahlzeiten-Automat mit 21-Tage-Test, Vorrang laufender Aktivitäten |
| **G4 Vollständigkeit** | nach PR 20 | F01–F50 tatsächlich bedient, Ernährung/Haushalt/Integrationen ohne Platzhalter |
| **G5 Release** | nach PR 22 | alle automatischen Tests grün, reale Geräte, Datenabgleich, Offline, Backup-Restore, Rollbackprobe |

**Regression automatisieren:** Erweiterungen in `tools/test/*.test.js` für reine Regeln (Prioritäten/Lernen/Nächste-Brust-/Schlaf-Sonderfälle) und in `tools/smoke.js` für Navigation, Dialoge und gerenderte Einstiege. Nicht bloß Screenshots vergleichen; auch den tatsächlichen Zustandsübergang und Persistenz prüfen. `node tools/worker-test.js` nur bei Worker-Änderungen zusätzlich zur CI; die bestehende globale CI bleibt Pflicht.

**Datenschutz:** keine echten Baby-, Gesundheits- oder Ernährungsdaten in Test-Fixtures, Konsolenlogs, GitHub Issues/PRs oder Screenshots; keine APIs zur Analyse des Nutzungsverhaltens hinzufügen. Keine neuen systemweiten Pushes implizieren: `NTRemind` ist aktuell eine browser-/service-worker-gestützte **In-App-/aktive-Sitzung-Lösung**, keine garantierte Hintergrund-Push-Infrastruktur.

**Rollout/Reversibilität:** Feature Flag zunächst für Testmodus, dann optional per Einstellung; `?ui=classic` als Notfalleinstieg. Die Fachlogik bleibt stets ein gemeinsamer Pfad. Das Entfernen veralteten HTMLs erst **nach** F01–F50-Nachweis, Backup, zwei-Geräte- und Offlineprobe. Feature-Flags nicht als permanente Duplikation zweier App-Logiken verstehen.

## 10. Erste konkrete Arbeitsübergabe

Start mit **PR 00 → 01 → 02 → 03 → 04**. In PR 00: Script zum Auslesen der erreichbaren UI-Aktionen und geschützte Test-Fixtures; Abgleich mit dieser Funktionsmatrix. In PR 01: nur Design-Tokens und UI-Kapselung. In PR 02–04: ein zentraler Katalog, neue Bottom-Navigation und funktionsfähiges `+`, **zunächst mit den bestehenden echten Dialogen**. Erst danach die neue Startseite samt „Nächste Brust“ real anbinden. So ist sehr früh ein testbarer Zwischenstand vorhanden, ohne den Funktionsumfang zu gefährden.

**Nicht Teil dieses Auftrags:** neue KI-Funktionen, geänderte Kalorien-/Schlaf-Algorithmen, neue Datenquellen, medizinische Empfehlungen, serverseitige Nutzungsprofile, React-Migration oder neue Apps. Ziel ist der **vollständige UI-Umbau bei unveränderter Feature-Tiefe**, ergänzt um ausdrücklich beschlossene Prioritäts-/Personalisierungsfunktionen.

---

**Quellen im Repo:** `index.html`, `AGENTS.md`, `CLAUDE.md`, `UEBERGABE.md`, `package.json`, `.github/workflows/checks.yml`, `js/{actions,features,launch,dashboard,baby,baby-sleep,baby-sleep-plan,baby-week,baby-growth,baby-milestones,baby-meds,baby-midwife,reminders,mealplan,cookbook,shopping,pantry,stats,health-sync,sync-core,partner,alexa-sync,onedrive,autosave}.js`, `picker.js`, `sw.js`.  
**Grundsatz:** Alle Angaben sind ein Implementierungsplan, keine Aussage, dass die neue Ansicht bereits in `main` integriert wäre.

## 11. Verbindlicher Umsetzungsstand

Stand 23.11.2026, geprüftes `main`: `88eeb9846e8646270a1c6a7c155e10b18317112e`, App/SW 0.334. PR #361 enthält die beschlossenen Dokumente; noch kein B3-Anwendungscode. Diese Tabelle ergänzt die Arbeitspakete in Abschnitt 7; sie ist deren Status, kein zweiter Aufgabenplan. F01–F50 bleiben bis zum jeweils nachgewiesenen neuen Einstieg offen.

| Pakete | Status | Nachweis / nächster Schritt |
|---|---|---|
| 00 | In Prüfung | `tools/b3-inventory.js`, `docs/b3-baseline.json`, synthetische Fixture, Schutztests und Browser-Roundtrip; PR-Link folgt bei Erstellung |
| 01–22 | Offen | Reihenfolge und Abnahmen gemäß Abschnitt 7 |

**PR 00 / G0:** Das Inventar erfasst auch generiertes HTML, `tab.html`, Feature-Aktionen, Startkurzbefehle, Namespace-Exports und die 50 Zeilen der verbindlichen Matrix. Es ist ein Reichweiteninventar, keine Behauptung, dass alle Fachabläufe bereits getestet wurden. `npm test` prüft den Fortbestand seiner Einstiege/APIs. Der Snapshot bleibt unverändert; begründete Ablösungen benötigen später eine explizite, getestete Zuordnung.

**Daten und Referenzen:** `tools/fixtures/b3-state.js` erzeugt ausschließlich synthetische Bestände (21 Ernährungstage, elf Babytypen, zehn freie Babyknöpfe, Rezepte, Plan, Einkauf, Vorrat). `tools/b3-browser.js` prüft den echten Datei-Export/Import, Reload, elf Eintragsdialoge und erzeugt Classic-Referenzen bei 320/390/430 px. GitHub Actions bewahrt sie mit Testbackup als `b3-mobile-baseline` auf. Produktive Nutzerdaten werden nicht verwendet. Der unveränderte Ausgangsstand ist über obige Git-Revision wiederherstellbar; bis zur Shell bleibt die klassische Ansicht der einzige Produktivweg.

**Prüfungen:** `npm ci`, statische Prüfung, Typprüfung und 145 Node-Tests lokal erfolgreich. Lokaler Chromium-Start wird von der Ausführungsumgebung beim Socket-Aufruf blockiert; Browserprüfungen laufen in der vorhandenen GitHub-CI. Kein Merge vor erfolgreichem Browserjob. Reale Android-/iOS- und Zwei-Geräte-Prüfungen sind noch offen und werden hier nicht als erledigt markiert.

**Technischer Befund:** Ernährungstage liegen tatsächlich unter `S.days[datum].meals[slot]`, nicht direkt unter `S.days[datum][slot]`. Neue Ansichten/Lernregeln müssen die reale Struktur verwenden. Direkter Git-Netzwerkzugriff ist lokal nicht nutzbar; der Quellstand wurde über den GitHub-Connector geladen und anhand der originalen Blob-Hashes verifiziert. Veröffentlichung erfolgt über GitHub-Git-Objekte auf Feature-Branches, niemals direkt nach `main`.
