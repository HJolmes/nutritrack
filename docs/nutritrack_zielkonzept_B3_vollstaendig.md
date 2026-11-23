# NutriTrack – finales UX- und Umsetzungskonzept B 3.0

**Stand:** 23. November 2026  
**Repository:** `HJolmes/nutritrack`, `main` zum Prüfzeitpunkt: `f14855b` (v0.334)  
**Status:** Verabschiedetes Zielkonzept und interaktiver Klickprototyp; als Dokumentation im Repository hinterlegt. **Noch keine Änderungen am Anwendungscode.**

## 1. Zielbild und nicht verhandelbare Leitlinien

NutriTrack bleibt eine vielseitige Alltags-App für **Ernährung, Baby, Haushalt und Planung**. Wir verändern die Informationsarchitektur, die Oberflächen und Einstiegspunkte, **nicht** die fachlichen Modelle, Berechnungen und vorhandenen Daten. Vorhandene Optionen dürfen durch das Redesign nicht verschwinden, ihre Reichweite wird in einer Funktionsmatrix nachgewiesen.

**Beschlossene Designentscheidungen:**

1. Die Startseite enthält **„Gerade wichtig“ → sechs kleine, konfigurierbare Schnellaktionen → kompakte Tagesübersicht**. Der doppelte Block „Deine Bereiche“ wird entfernt.
2. Die Bottom-Navigation hat fünf Positionen: **Heute** (fix), **Slot 2** (frei), **+** (fix), **Slot 4** (frei), **Slot 5** (frei). Standard: Heute | Ernährung | + | Baby | Haushalt. Auch Einkauf, Wochenplan, Kochbuch, Verlauf und Mehr sind auswählbar. Ein Ziel darf nicht doppelt vorkommen.
3. Das **+** ist ein Aktionsrouter, keine neue Datenlogik: Heute → bereichsübergreifender Erfassungsdialog; Ernährung → Lebensmittelpicker; Baby → **alle elf vorhandenen Baby-Eintragstypen**; Haushalt → Einkaufsliste/Vorrat, plus deren Unterseiten. Auf Spezialseiten folgt das + dem Besitzerbereich.
4. **Brustwechsel-Vorschlag, letzte Mahlzeit, Still-Stoppuhr, Seitenwechsel, laufender Schlaf und die vorhandenen Spezialfunktionen bleiben prominent erreichbar.**
5. Alle neuen Hinweise sind **erklärbar, abschaltbar und zurückhaltend**. Die Lernfunktion darf keine fehlenden Einträge als sicher ausgelassene Mahlzeiten interpretieren.
6. Das warme Bloom-Design bleibt, aber Lesbarkeit, Kontrast, Touchflächen, Zustandsdarstellung und mobile Navigation werden verbessert.

## 2. Informationsarchitektur und Klickpfade

| Ebene | Sichtbare Struktur | Erreichbare Alt-Funktionen |
|---|---|---|
| **Heute** | Gerade wichtig, Schnellaktionen, Baby-Kurzstatus (inkl. nächste Brust), Ernährung-Kurzstatus, auf Wunsch kleine Kontextkarten | Alle heute relevanten Einträge; Links in vollständige Bereiche |
| **Ernährung → Heute** | Kalorien/Makros, vier Mahlzeiten, Wasser, Sport, Fasten | Lebensmittel hinzufügen/bearbeiten, Text, Suche, Zuletzt, Foto, Barcode, eigenes Lebensmittel, Link; Tagesbilanz |
| **Ernährung → Planung/Rezepte/Verlauf** | Unterseiten oder Kontextlinks; keine sechs winzigen gleichrangigen Tabs | Wiederkehrende Mahlzeiten, Wochenplan, Kochbuch, Rezeptsuche/Filter, KI, Nährwerte, Trendansichten, Ex-/Import |
| **Baby → Heute** | Nächste Brust und letzte Mahlzeit, Still-Stoppuhr, Seite wechseln, Windel, Schlaf, Flasche, Tages-Tagebuch, Medizin-Hinweise | **Alle** bisherigen Erfassungen und Schnellknöpfe |
| **Baby → Schlaf** | 24-h-Zeitleiste mit Erfasst / Angenommen / Prognose, Schlaf starten/beenden, Nachtschlaf/Nickerchen | Historische Nachtannahme, Nachtfenster-Einstellungen, editierbare Prognoseübernahme |
| **Baby → Verlauf** | Tagebuch, 7-/14-Tage-Auswertung, Beikostübersicht, Arztbericht | Bearbeiten/Löschen, Wochenvergleich, Arztbericht teilen/kopieren |
| **Baby → Entwicklung** | Wachstum/WHO, U-Heft, Impf-/Arzttermine, Meilensteine, Fragen an Arzt/Hebamme, Medizin & Gaben | Alle bisherigen Baby-Unterseiten in der bisherigen fachlichen Tiefe |
| **Haushalt** | Einkauf, Vorrat, Wochenplan, optional Rezepte | Einkaufs- und Bestandsverwaltung, Lagerorte, Mindestbestände, MHD, Verbrauch, Fotos, Rezeptvorschläge, Verbindungen |
| **Mehr → Alle Funktionen** | Suchbare vollständige Funktionsliste und Einstellungen | Sport-/Health-Sync, Wasser/Fasten, Partner-Postfach, Alexa, Backup/Restore, Sync, Erinnerungen, Profile, Datenschutz, Sonderfunktionen |

**Regel:** Kein Feature benötigt einen Platz in der Bottom-Navigation, um noch erreichbar zu sein. „Mehr → Alle Funktionen“ ist die vollständige Rückfallebene, während die Hauptleiste nur Favoriten enthält. Aktivieren/Deaktivieren von Modulen (`S.babyOn`, `NTFeat`) bleibt erhalten und wird nicht durch „Ausblenden aus der Nav“ verändert.

### Navigation auf kleinen Displays

- Aktiver Bereich eindeutig hervorheben. + behält einen festen Platz und zeigt in seiner Beschriftung und für Screenreader den aktuellen Erfassungskontext.
- Die Navigation bleibt beim Öffnen eines Detailbildschirms konsistent. Zurück führt zum vorherigen Unterbildschirm, nicht blind zu „Heute“. Tiefe Dialogstapel vermeiden; den bestehenden Editor ggf. als fokussierte Vollbildansicht verwenden.
- Nach Neustart stehen die gewählten Slots wieder zur Verfügung. Ein deaktiviertes Modul darf nicht zu einem defekten Tab führen: Slot bei Bedarf mit verständlichem Hinweis bzw. Ersatz auf „Mehr“ umleiten.

## 3. Baby: ausdrücklich erhaltene Brustlogik

**Ist-Stand geprüft:** `js/baby.js` enthält `NTBaby.nextSide`, `runningFeed`, `startFeed`, `stopFeed`, `switchFeed`, `openEntry`, `quick`, `summary`, `feedLineHtml`. `nextSide()` ermittelt aus den Stilleinträgen bis zum gewählten Tag die letzte **maßgebliche** Seite. Bei `side='b'` wird ausschließlich `main='l'` oder `main='r'` zur Alternation verwendet. `startFeed()` verwendet die vorgeschlagene Seite, `switchFeed()` beendet die laufende Seite und startet die andere, `stopFeed()` errechnet die Dauer und synchronisiert den Eintrag.

**Die neue UI muss diese vorhandenen Funktionen aufrufen, nicht separat neu rechnen.**

### Sichtbarkeit

- **Immer auf Baby → Heute:** gut sichtbare Zeile/Karte **„Nächste Brust: Links/Rechts“**, mit Hinweis „Vorschlag aus letztem Stillen“ und Möglichkeit zum manuellen Übersteuern.
- **Auf Heute:** in der kompakten Baby-Tageskarte steht die vorgeschlagene Brust, daneben ein 1-Tipp-Start; optional die letzte Mahlzeit. Das ist kein Erinnerungshinweis und wird **nicht** aus „Gerade wichtig“ verdrängt.
- **Wenn Stillen läuft:** der Status rückt in „Gerade wichtig“ nach oben: **„Stillen links/rechts läuft“**, **„⇄ Seite wechseln“** und **„■ Stopp“**. Unveränderliche Aktivitätsdaten werden nicht durch personalisierte Erinnerungen verdeckt. Gleicher Status auf Baby → Heute.
- **Wenn keine geeignete Historie existiert:** „Noch kein Vorschlag“, statt eine erfundene Seite als Empfehlung zu zeigen. Beide Startseiten bleiben auswählbar.

### Verbindliche Sonderfälle

| Eingangsdaten | Erwartete Anzeige/Verhalten |
|---|---|
| Letztes relevantes Stillen rechts | **Nächste Brust: links**; 1-Tipp-Start links, rechts manuell möglich |
| Letztes relevantes Stillen links | **Nächste Brust: rechts** |
| Stillen auf „Beide“, Hauptseite rechts | **Nächste Brust: links** |
| Stillen auf „Beide“, Hauptseite nicht angegeben | Nicht als klare maßgebliche Seite interpretieren; zuvor bekannte eindeutige Seite und Historie unverändert behandeln |
| Flasche, Beikost oder Abpumpen nach dem letzten Stillen | **Brustfolge dadurch nicht verändern**; die „letzte Mahlzeit“ darf sich unabhängig davon ändern |
| Laufendes Stillen, Seite wechseln | Vorherige Seite mit erfasster Dauer **stoppen**, neue Seite **starten**; keine doppelten Stoppuhren |
| Laufendes Stillen bei Sync mit zweitem Gerät | Bestehende IDs/Revisionsnummern und `runningFeed`-Logik weiterverwenden; Stopp auf anderem Gerät darf keinen falschen Lauf beenden |
| Manuelles Nachtragen/Bearbeiten/Löschen | Vorschlag muss nach `saveS`/`Sync.schedule` neu berechnet werden; nicht aus einem im UI gecachten Seitentext ableiten |
| Anderer angezeigter Tagebuchtag | Vorschlag bleibt an den historischen Tag gebunden (kein Zukunfts-Leak) |

**Details beim Stilleintrag:** Seite „Links“, „Rechts“, „Beide“; bei „Beide“ **Hauptseite**; Dauer; Zeit; Notiz; Stoppuhr; Start/Stop/Wechsel; Nachtragen; Bearbeiten/Löschen; benutzerdefinierte Baby-Schnellknöpfe mit festen Seiten, Folgemöglichkeit und Timer. Die bestehende Seite-Alternation hat Vorrang gegenüber einem KI-Hinweis.

## 4. Vollständigkeit Baby: elf vorhandene Erfassungstypen

Im Code `js/baby.js` gibt es elf Typen. Sie sind **unverändert** über **Baby → +** erreichbar:

| Typ | Bisherige Felder / Regeln, die erhalten bleiben müssen | Neuer Einstieg |
|---|---|---|
| **Stillen** (`breast`) | Seite l/r/b; bei b Hauptseite; Min.; Startzeit, Lauf/Stop, Seitenwechsel, Notiz | Baby-Karte, Schnellaktion, + |
| **Flasche** (`bottle`) | ml (Pflicht); Muttermilch / Pre / Folgemilch; Zeitpunkt/Notiz | Baby → + → Flasche |
| **Windel** (`diaper`) | Pipi / Stuhl / Beides, bei Stuhl Farbe und Konsistenz, Zeitpunkt/Notiz | Schnellaktion, Baby → + |
| **Temperatur** (`temp`) | °C (Pflicht), Messort (rektal/Ohr/Stirn/Achsel), Fieberhinweis | Baby → + → Temperatur |
| **Schlaf** (`sleep`) | Von/bis, auch offenes Intervall, Nachtschlaf/Nickerchen/Auto, über Mitternacht, manuelle Korrektur | Schnellaktion; Baby → Schlaf; Baby → + |
| **Notiz** (`note`) | Freitext, Zeitpunkt, Bearbeiten/Löschen | Baby → + → Notiz |
| **Beikost** (`solid`) | Lebensmittel, Menge, „zum ersten Mal“, Reaktion, gespeicherte Vorschläge | Baby → +; Baby → Verlauf |
| **Abpumpen** (`pump`) | ml (Pflicht), Links/Rechts/Beide, Zeitpunkt | Baby → + → Abpumpen |
| **Medizin** (`med`) | Name, Dosis, Abstand, Bezug zur Medikamentenliste, Gabenprotokoll | Baby → +; Medizin & Gaben |
| **Messung** (`growth`) | Datum, Gewicht in g, Größe/Kopfumfang in cm, WHO-Auswertung | Baby → +; Entwicklung |
| **Termin** (`appt`) | Datum, Art (U, Impfung, Kinderarzt, Hebamme, andere), Titel, optional Uhrzeit | Baby → +; U-Heft |

**Weitere bereits bestehende Baby-Funktionen, die NICHT bloß „Extras“ sind:**

- `js/baby-week.js`: Wochenansicht für 7/14 Tage, Beikostübersicht, Arztbericht erzeugen, teilen, kopieren.
- `js/baby-growth.js` / `js/baby-growth-data.js`: WHO-Perzentilkurven, Gewicht, Größe, Kopfumfang.
- `js/baby-milestones.js`: altersbezogene Meilensteine, U-Untersuchungsfenster, Terminverwaltung.
- `js/baby-midwife.js`: Fragen an Arzt und Hebamme, Suche, Status und Antworten.
- `js/baby-meds.js`: Medikamenten-Stammliste, Gaben, Abstände und Hinweise.
- `js/baby.js` / `js/sync-core.js`: verschlüsselte Partnersynchronisierung, Eintrags-IDs, Löschmarken, Revisionen, Kopplung.
- `js/baby-sleep.js` / `js/baby-sleep-plan.js`: Prognose und Tages-Schlafübersicht, Nachtannahme aus Stillen/Wickeln, Nachtfenster einstellbar.
- `S.babyQuick`: bestehende freie Baby-Schnellknöpfe bis zu 10, Reihenfolge, Icons und vordefinierte Parameter.

**Wichtig:** Die 6 globalen Startseiten-Schnellaktionen und die **10 bestehenden Baby-Schnellknöpfe** sind zwei getrennte Ebenen. Der neue globale Konfigurator darf `S.babyQuick` nicht überschreiben oder entfernen. Möglich ist ein globaler Favorit, der gezielt auf einen vorhandenen Baby-Schnellknopf verweist.

## 5. Schlaf und Prognosen

- Ein gemeinsamer 24-h-Tagesüberblick zeigt drei **optisch und textlich** unterscheidbare Ebenen: **Erfasst** (wirklicher Tagebucheintrag), **Angenommen** (aus Nacht-Versorgungen rekonstruiert), **Prognose** (zukünftige Schätzung).
- Daten aus angenommenen Nächten bleiben Annahmen; sie werden niemals heimlich in `S.babyLog` als echter Schlaf geschrieben.
- „Aus Prognose Schlaf erfassen“ öffnet die bestehende editierbare `NTBaby.sleepFromPlan(...)`-Erfassung. Zeit/Typ sind vorbefüllt, werden bestätigt. **Kein zukünftiger Schlaf als bereits geschehen speicherbar.**
- Manueller Nacht-/Tagschlaf bleibt möglich; automatische Einordnung bleibt optional. Offene Schlafphasen, Tageswechsel, Änderungen und Offlinebetrieb werden getestet.
- Prognosen müssen ihre Datenqualität und Unsicherheit sichtbar machen; bei geringer Datengrundlage lieber „Noch zu ungenau“ als ein präzise wirkendes Versprechen.
- `S.babyNightWindow` samt Änderungsfunktion bleibt erreichbar unter **Baby → Schlaf → Einstellungen**. Lernende Erinnerungen dürfen dies nicht überschreiben.

## 6. „Gerade wichtig“: Auswahlregeln

Die Startseite zeigt **höchstens eine große Karte** plus darunter bis zu sechs frei belegbare Schnellaktionen. Laufende Aktivitäten werden unabhängig von ihrer Nutzungsfrequenz angezeigt.

| Rang | Anlass | Aktion / Schutz |
|---|---|---|
| P0 | Laufendes Stillen oder laufender Schlaf | Start-/Stoppstatus, Brust wechseln bzw. Aufwachen. **Nicht ausblendbar**, solange aktiv |
| P1 | Explizit festgelegte wichtige Termin-/Medizin-Hinweise | Bestehende Fälligkeitslogik verwenden; nicht aus Benachrichtigungsheuristiken medizinische Anweisungen ableiten |
| P2 | Bewusst aktivierte oder zuverlässig gelernte Mahlzeiten-Erinnerung | Nur im passenden Zeitfenster, höchstens einmal je Mahlzeit pro Tag, abwählbar |
| P3 | Baby-Schlafprognose mit ausreichender Datenbasis | Deutlich „Prognose“; kein automatisches Protokoll |
| P4 | Sonstige sinnvolle kontextuelle Aufgaben | Geplante Mahlzeiten, Vorrats-/Einkaufshinweise aus tatsächlichen Bestandseinträgen |
| P5 | Kein Anlass | „Nichts Dringendes“ mit hilfreichem Direktzugang, keine künstliche Warnung |

**Ein Hinweis kann durch „Warum sehe ich das?“ erklärt und für heute ausgeblendet werden** (außer ein laufender Vorgang). Regel „nicht wieder zeigen“ wird respektiert. Für die erste Version **keine neue KI-Anbindung**; regelbasiert und testbar, möglichst lokal. Bei deaktiviertem Baby-Tagebuch keine Baby-Karten.

### Mahlzeiten-Erinnerungen

Pro Kategorie **Frühstück, Mittag, Abendessen, Snacks** werden Modi gespeichert: „Automatisch lernen“ / „Immer erinnern“ / „Nie erinnern“. Zusätzlich können bestehende **zeitbasierte Erinnerungen** aus `js/reminders.js` weiter separat existieren und müssen in der UI als ausdrücklich konfigurierte Erinnerungen erkennbar bleiben. Nicht unbemerkt überschreiben.

**Automatik, vorgeschlagene V1-Regeln (parameterisierbar, kein empirisch validierter Schwellenwert):**

- 21 relevante, tatsächlich genutzte Ernährungstage als Rückblick; pro Mahlzeit Beobachtungshäufigkeit, typische Uhrzeit, Eintragsquote und jüngste Regelmäßigkeit. Beispielsweise **8 von 21** ist zunächst ein konfigurierbarer Testschnitt, kein Naturgesetz.
- Fehlendes Frühstück bei einer Person, die Mittag- und Abendessen regelmäßig protokolliert, führt **nicht** zu wiederholten Frühstückshinweisen. Eine komplette Nutzungspause ist **kein Beleg** für ausgelassene Mahlzeiten.
- Reagiert der Nutzer dreimal mit „Nicht relevant“, kann NutriTrack **fragen** „Frühstück künftig nicht mehr erinnern?“, aber nicht stillschweigend die manuelle Einstellung ändern.
- Einträge, nachgetragene Mahlzeiten, Urlaub/Feiertage und veränderte Gewohnheiten berücksichtigen. Typische Zeitfenster anhand Median und Streuung statt fixer universeller Uhrzeiten schätzen.
- Bei Datenmangel keine vermeintlich „intelligente“ Erinnerungsflut. „Immer“ setzt die Lernschwelle außer Kraft, „Nie“ ist absolut.
- In-App-Karte und Betriebssystem-Push strikt trennen; Push nur nach Einwilligung und soweit geräteseitig zuverlässig möglich. Keine verdeckte Datenübertragung für die Lernlogik.

## 7. Schnellaktionen und Kontext-Plus

### Standardbelegung der 6 Home-Aktionen

1. Stillen (**mit sichtbarer nächster Brust**; gedrückt → bestehende Start- oder Stop-Logik)
2. Windel
3. Schlaf starten/beenden
4. Essen erfassen
5. Einkaufszettel
6. Wochenplan

**Weitere auswählbare Favoriten:** Wasser, Sport, Foto-Mahlzeit, Barcode, Rezept, Vorrat, Beikost, Flasche, Medikamente, Brust links/rechts, Arzt-/Hebammenfrage, Wachstum, Statistik – soweit Module eingeschaltet. Nur passende Einstiege anbieten. Bestehende `NTLaunch.ACTIONS` als Kern des Action-Registers verwenden und für weitere Aktionen erweitern; keine doppelten unterschiedlichen Implementierungen derselben Handlung.

**Positionen:** globale sechs Plätze, sortierbar, optional weniger als sechs. Für die bisherigen `S.launchBar`-Einstellungen ist eine einmalige behutsame Migration sinnvoll, **ohne alte Daten zu löschen**. Auch Android-Manifest-App-Kurzbefehle und ihre `?action=...`-URLs müssen weiter funktionieren.

### Kontext-Plus vollständige Matrix

| Bildschirm | Drücken auf + | Erwartetes Ziel |
|---|---|---|
| Heute | „Was erfassen?“ | Ernährung, Baby, Haushalt, Wasser/Sport nach Aktivierung |
| Ernährung / Ernährung → Verlauf | Lebensmittel hinzufügen | Bestehenden NTPicker mit allen Methoden öffnen |
| Baby / Baby-Unterseite | Baby-Eintrag hinzufügen | Raster mit **11 Typen**, ausgewählten Typ direkt in `NTBaby.openEntry(type)` öffnen |
| Haushalt | Haushalt ergänzen | „Einkaufszettel“ oder „Vorrat“ |
| Einkaufsliste | Artikel hinzufügen | Direkter `NTShop`-Einstieg |
| Vorrat | Vorratsartikel hinzufügen | Direkter `NTPantry`-Einstieg |
| Wochenplan | Rezept oder Notiz planen | Vorhandene `NTPlan`-Aktion verwenden |
| Kochbuch | Rezept hinzufügen | Vorhandener Rezepteditor/Import |
| Verlauf / Mehr / Einstellungen | Bereichskontext oder übergreifender Wähler | Kein stillschweigend falscher Ernährungs-Picker |

## 8. Bestandsschutz: Funktionsregister über die Baby-Funktionen hinaus

| Modul / vorhandene Grundlage | Zu bewahrende Fähigkeiten | Neues Zuhause |
|---|---|---|
| Ernährung / `index.html`, `js/calc.js` | Zielkalorien, Makros, Mengen, Mahlzeiten, Tagesbilanz, Berechnungen | Ernährung → Heute / Verlauf |
| Picker / `index.html` | Chat/Text, Suche, Zuletzt, Foto-KI, Barcode, Eigenes, Link; Nachbearbeiten | Ernährung + und Home-Favorit |
| `js/recurring.js` | Wiederkehrende Mahlzeiten | Ernährung → Mahlzeiten / Einstellungen |
| `js/cookbook.js`, `js/book-swaps.js` | Kochbuch, Filter, Favoriten, Rezeptanpassungen, KI, Kochmodus, Import/Teilen | Ernährung → Kochbuch; Haushalt-Links |
| `js/mealplan.js` | Wochenplan, Tage/Slots, automatische Planung, Rezepte, Notizen, Teilen | Wochenplan / Haushalt |
| `js/shopping.js` | Einkaufskategorien, Artikel, Abhaken, Merkliste, Sync, Mengen | Haushalt → Einkaufen |
| `js/pantry.js` | Mengen, Lagerorte, Mindestbestand, MHD/Verbrauchsdatum, Verbrauchshistorie, Fotos, Rezeptideen, Sync | Haushalt → Vorrat |
| `js/restaurants.js` | Vorhandene Restaurant-/Lebensmittel-Funktionalität | Ernährung / Mehr → Alle Funktionen |
| `js/partner.js` | Partner-Postfach und geteilte Ernährung | Mehr → Verbindungen / Postfach |
| `js/health-sync.js` | Health/Sport-Sync und manuelle Bewegung | Ernährung → Aktivität / Mehr |
| `js/reminders.js` | Feste Erinnerungszeiten, Wasser-/Fasten-/Vorratshinweise | Einstellungen → Erinnerungen |
| `js/launch.js`, `manifest.json` | Schnellaktionen und PWA-Startkurzbefehle | Heute, konfigurierbare Schnellaktionen, App-Icon |
| `js/dashboard.js`, `js/features.js` | Ein-/Ausblenden, Module ein-/ausschalten, konfigurierbare Ansicht | Einstellungen → Funktionen / Startseite |
| `js/sync-core.js`, `js/onedrive.js`, `js/alexa-sync.js` | Sync, Backups/Verbindungen und externe Integrationen | Mehr → Daten & Verbindungen |
| `js/stats.js`, `js/food-export.js`, `js/xlsx.js` | Trends, Berichte und Exporte | Verlauf / Mehr → Export |
| Profil, Fasten, Wasser, Sport, KI | Bestehende Einstellungen, Ziele, Protokolle | Ernährung / Mehr → Alle Funktionen |

**Prüfprinzip:** Vor der Implementierung automatisch und manuell eine vollständige Übersicht der in `NTFeat`, `NTActions`, `NTLaunch` und HTML hinterlegten Aktionen erstellen. **Jede vorhandene Aktion benötigt nach der Umgestaltung einen getesteten Einstieg.** Ein neuer Screen darf einen bestehenden Screen nur ersetzen, wenn wirklich alle Funktionen portiert wurden. Andernfalls bleibt der bewährte Dialog zunächst erreichbar.

## 9. Architektur und Datenmigration

**Bevorzugte Architektur:** vorhandene Anwendungslogik beibehalten; neue „App Shell“, Nav-Konfiguration, Action-Router, Home-Prioritätsdienst und UI-Komponenten ergänzen. Fachmodule bleiben Eigentümer ihrer Daten. **Kein Big-Bang-Rewrite.**

- `S` behält seine Datenstruktur (`S.days`, `S.babyLog`, `S.babyMeds`, `S.babyQs`, `S.babyMiles`, `S.babyQuick`, `S.babyNightWindow`, Sync-Konfiguration etc.). Neue UI-Präferenzen werden **additiv** unter einem versionierten `S.ui` oder vergleichbar abgelegt.
- Einmaliger, idempotenter Import von `S.launchBar`, `S.dashOrder`, `S.dashHidden`; Originalwerte zunächst unverändert behalten, um Rückfall zu ermöglichen. Lokale Home-Nutzungshistorie nur, wenn erforderlich und transparent.
- Wenn zwei Geräte gekoppelt sind, darf eine rein lokale UI-Einstellung weder Fachlogs überschreiben noch ungefragt zwischen Personen synchronisiert werden. Synchronisierung der UI-Präferenzen ist ein eigener, expliziter Beschluss.
- Bestehende `saveS`/`Sync.schedule`-Pfade und Datums-/Zeitzonenlogik werden wiederverwendet. Keine parallelen Schreibwege für Stillen, Schlaf, Baby oder Haushalt.
- Im neuen Action-Router `NTBaby.startFeed`, `.switchFeed`, `.stopFeed`, `.openEntry`, `.toggleSleep`; `NTBaby.nextSide` für die Anzeige verwenden. Die UI darf keinen zweiten eigenen „Nächste Seite“-Algorithmus speichern.
- Lazy Loading und Event Listener prüfen; die große `index.html` nicht durch weitere unstrukturierte Inline-Logik aufblähen. Browser-Back, Fokus-Rückgabe, Dialog-Schließen, Tastatur und Offline-Status testbar halten.
- Bestehende Backups müssen **ohne Verlust importierbar** bleiben; vordem nicht bekannte UI-Schlüssel dürfen andere Versionen nicht beschädigen. Vor jeder produktiven Migration Testbackup und Rollback-Plan.

## 10. Umsetzungsphasen mit Abnahmetests

| Phase | Umfang | Erfolgskriterium / Muss-Test |
|---|---|---|
| **0 – Baseline** | Fachfunktionsinventar, Referenzscreens, vollständiges Testbackup, Feature-Flag | Alte App bleibt parallel testbar; jede vorhandene Aktion ist katalogisiert |
| **1 – Designsystem** | Typografie, Kontraste, Touchziele, Responsive-Komponenten | 320–430 px, größere Schrift und Tastatur ohne Überläufe; keine gesperrte Zoomfunktion |
| **2 – Navigation** | Fünfer-Bar, freie Slots, Backstack, Kontext-Plus | Jeder Slot behält seinen Wert; + in jedem Bereich öffnet **richtigen alten Editor** |
| **3 – Startseite** | Gerade wichtig, sechs Schnellaktionen, Baby-Kurzstatus | „Nächste Brust“ auf Startseite sichtbar, alle Quickactions eindeutig, keine doppelte „Deine Bereiche“-Liste |
| **4 – Baby** | Vier geordnete Unterbereiche; Status-/Still-Karte; bisherige elf Eintragstypen | Brustfolge, „Beide“+Hauptseite, Start/Stop/Wechsel, 7-/14-Tage-Arztbericht, Wachstum, U-Heft, Fragen, Gaben und Sync funktionieren |
| **5 – Schlaf** | 24-h-Ansicht, Annahmen, Prognosen, Schlaferfassung | Messung/Annahme/Prognose getrennt; keine Zukunftsprotokolle; Tag/Nacht manuell änderbar |
| **6 – Lernen** | Pro Mahlzeit Auto/Immer/Nie, Erklärbarkeit, Dismissal | Nie-Frühstücker wird automatisch nicht genervt; „Immer“ und „Nie“ gewinnen gegen Automatik; feste Erinnerungen bleiben erhalten |
| **7 – Restmodule** | Ernährung, Einkauf, Vorrat, Kochbuch, Sport/Health, Verbindungen, Exporte | Vollständige Funktionsmatrix abgearbeitet; kein Modul nur noch als leere Platzhalterseite |
| **8 – Rollout** | Regression, PWA-Offline, Android/IOS, Sync, Performance, Feature-Flag | Datenvergleich vorher/nachher, Rollback ohne Datenverlust, automatisierte Happy-Path- und Edge-Tests |

### Detaillierte Regression für die Brustfolge (Pflicht)

1. Letzter Still-Eintrag rechts → links vorgeschlagen.
2. Nutzer startet dennoch rechts → Aufzeichnung auf rechts, danach links vorgeschlagen.
3. Während rechts läuft → „Seite wechseln“ stoppt rechts und startet links, danach rechts vorgeschlagen.
4. Manuell „Beide“, Hauptseite links → rechts vorgeschlagen.
5. „Beide“ ohne Hauptseite → Historie wird nicht als eindeutige Seite verfälscht.
6. Windel/Flasche/Beikost/Abpumpen zwischen Stillvorgängen → Brustfolge unverändert.
7. Zweitgerät stoppt Lauf → UI aktualisiert, kein zweiter versehentlicher Stopp.
8. Bearbeiten/Löschen und Eintrag aus Vortag → Vorschlag aus korrigierter Historie.
9. App-Wiederherstellung, Offline, Mitternacht, Zeitumstellung → Zeit und Intervalle korrekt, keine Doppelbuchung.
10. Nutzer hat `S.babyQuick` individualisiert → alle persönlichen Knöpfe mit Seiten-/Timerparametern bleiben erhalten.

### Bedienbarkeit / Barrierefreiheit

Mindestens WCAG-AA-Textkontrast bei normalen Texten, sinnvollerweise 4,5:1; Bedienfelder 44×44 CSS-Pixel nach Möglichkeit; sichtbarer Fokus, echte Button-Beschriftungen, Screenreader-Labels für Seitenwechsel und +, kein ausschließlich durch Farbe kodierter Schlafstatus, keine erzwungene Zoom-Sperre. Bei offener Still-Stoppuhr darf ein unerwartetes Schließen der App keinen Eintrag verlieren.

## 11. Was der Klickprototyp tatsächlich zeigt

**Implementiert als Simulation:** Startseite ohne doppelte Bereichskacheln; sechs konfigurierbare Quickactions; fünfteilige Navigation mit drei freien Slots; kontextabhängiges +; Baby → nächster Brustvorschlag; Stillen starten/stopp, alternative Seite, Seitenwechsel; „Beide“ mit Hauptseite und manueller Dauer; elf Baby-Dialogtypen; eingetragene Demoereignisse im Tagebuch; Schlafplan; Baby-Verlauf und direkte Einstiege in Vorsorgefunktionen; Mahlzeiten-Erinnerung „Auto / Immer / Nie“.

**Noch nicht funktional im Prototyp:** Echtes Speichern in NutriTrack, Verschlüsselung/Sync, medizinische Zeitregeln, WHO-Berechnung, tatsächliche Lernlogik, vollständiger Rezepteditor, echte Backups/Exporte. Diese Punkte bleiben in der **produktiven App** vorhandene Module und müssen im späteren Umbau durchgereicht und getestet werden. Ein UI-Mock ist kein Beleg für produktive Datenkompatibilität.

## 12. Entscheidung / Implementierungsauftrag

**Designentscheidung:** Variante B 3.0 als Zielbild freigeben; Originaloptik bewusst weiterentwickeln; Baby-Einstieg und nächster-Brust-Status haben Vorrang vor optischer Minimalisierung. B3 ist keine Alternative zur bestehenden Funktionstiefe, sondern eine übersichtlichere Hülle darum.

**Reihenfolge empfohlen:** erst sicherer Navigations-/Aktionsrouter und Baby-Status (höchster Alltagsnutzen), dann die Baby-Unterbereiche, danach Home-Intelligenz und restliche Module. Jeden Schritt auf eigenem Branch prüfen und nur mit bestandener Funktionsmatrix mergen.