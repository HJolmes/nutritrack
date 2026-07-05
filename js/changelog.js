// NutriTrack – Versions-Changelog für den "Was ist neu"-Dialog.
// Ausgelagert aus index.html (v0.204). Klassisches Script, exportiert window.CHANGELOG.
window.CHANGELOG=[
  {v:'0.206',items:[
    {icon:'🔍',text:'Die Lebensmittel-Suche zeigt lokale Treffer jetzt sofort beim Tippen — Enter lädt zusätzlich Online-Ergebnisse.',where:'Mahlzeit → ＋ → Suche'},
    {icon:'⚡',text:'„Quick" ist in „Eigenes" aufgegangen: Häkchen „Nur einmal eintragen" setzen, dann gelten die Werte als Gesamtwerte der Portion und nichts wird dauerhaft gespeichert. Ein Tab weniger im Picker.',where:'Mahlzeit → ＋ → Eigenes'},
    {icon:'🔗',text:'Rezept-Import per Link gibt es nur noch an einem Ort: Picker → Link. Der 🔗-Button in der Bibliothek führt jetzt dorthin.',where:'Bibliothek & Picker'},
  ]},
  {v:'0.205',items:[
    {icon:'💾',text:'Alle Sicherungs-Wege führen jetzt an einen Ort: Einstellungen → Backup, mit klarem „Jetzt sichern"-Button, der anzeigt, was passiert (OneDrive, Teilen oder Datei-Download).',where:'Einstellungen · Backup'},
    {icon:'🔑',text:'Das Proxy-Passwort wird beim Speichern gegen den Server geprüft — Tippfehler fallen sofort auf. Außerdem lässt sich der Start-Dialog mit „Später" überspringen: Die App ist auch ohne KI-Passwort voll nutzbar.',where:'Start & Einstellungen · KI'},
  ]},
  {v:'0.203',items:[
    {icon:'🔒',text:'Namen aus geteilten Links, Online-Datenbanken und KI-Antworten werden jetzt in allen Ansichten sicher dargestellt.',where:'App-weit'},
  ]},
  {v:'0.202',items:[
    {icon:'🎙️',text:'Diktat-Fix: Beim Gedrückthalten des Mikrofon-Buttons wiederholten sich bereits erkannte Wörter nach jedem neuen Wort. Der Text läuft jetzt sauber weiter.',where:'Mahlzeit → ＋ → Chat'},
  ]},
  {v:'0.201',items:[
    {icon:'🐛',text:'Zurückblättern auf sehr alte (archivierte) Tage lässt die App nicht mehr einfrieren.',where:'Heute · ‹-Pfeil'},
  ]},
  {v:'0.200',items:[
    {icon:'💬',text:'Beim Hinzufügen einer Zutat öffnet sich jetzt immer zuerst der Chat statt der Datenbank-Suche. Die Suche bleibt einen Tab-Tipp entfernt; aus der Bibliothek heraus landest du weiterhin direkt in der vorbefüllten Suche.',where:'Mahlzeit → ＋'},
    {icon:'🎙️',text:'Diktieren jetzt auch per Gedrückthalten: Mikrofon-Button halten → Aufnahme läuft, solange du hältst, und stoppt beim Loslassen. Kurzes Antippen startet/stoppt weiterhin wie bisher.',where:'Mahlzeit → ＋ → Chat'},
    {icon:'📝',text:'Das Chat-Eingabefeld wächst mit deinem Text mit (bis ca. 5 Zeilen) — auch beim Diktieren. Nach dem Senden schrumpft es wieder auf eine Zeile.',where:'Mahlzeit → ＋ → Chat'},
    {icon:'📐',text:'Layout-Fix: Die drei Nährwert-Karten (Protein, Kohlenhydrate, Fett) liefen auf schmalen Displays rechts aus dem Bildschirm — die Fett-Karte war abgeschnitten. Jetzt passen alle drei immer in die Breite.',where:'Heute'},
  ]},
  {v:'0.199',items:[
    {icon:'🔐',text:'Der API-Key deines eigenen KI-Anbieters wird jetzt mitgesichert: Datei-Export, OneDrive-Sicherung und Autospeicher enthalten ihn verschlüsselt (AES, Schlüssel aus deinem Proxy-Passwort abgeleitet) — im Klartext taucht er in keinem Backup auf. Beim Import wird er automatisch wiederhergestellt; fehlt das Proxy-Passwort auf dem neuen Gerät noch, wird der Key übernommen, sobald du es einträgst.',where:'Einstellungen · Backup'},
  ]},
  {v:'0.198',items:[
    {icon:'🎨',text:'Nährwert-Details repariert: Die Kacheln (Protein, Carbs, Fett, Zucker, Ballaststoffe, Salz) waren noch für den alten dunklen Hintergrund gestylt — weißer Text war kaum lesbar und die „grüne" Kachel komplett unsichtbar. Jetzt dunkle Schrift auf dezent getönten Ampel-Farben. Außerdem überlappt die Prozentzahl in den Makro-Karten nicht mehr mit dem Namen.',where:'Heute · Nährwert-Details'},
  ]},
  {v:'0.197',items:[
    {icon:'🎙️',text:'Diktierfunktion im Chat: Neben dem Eingabefeld gibt es jetzt einen Mikrofon-Button. Antippen, sprechen — der gesprochene Text erscheint direkt im Eingabefeld und lässt sich vor dem Senden noch bearbeiten. Die Erkennung nutzt die Spracherkennung deines Geräts (Deutsch); auf Geräten ohne Unterstützung wird der Button automatisch ausgeblendet.',where:'Mahlzeit → ＋ → Chat'},
  ]},
  {v:'0.196',items:[
    {icon:'⚡',text:'Barcode-Scanner startet jetzt deutlich schneller, vor allem auf dem iPhone: Der Decoder wird mit der App ausgeliefert und gecacht, statt bei jedem Scan sekundenlang aus dem Netz nachzuladen. Funktioniert dadurch auch offline.',where:'Mahlzeit → ＋ → Barcode'},
  ]},
  {v:'0.194',items:[
    {icon:'🔖',text:'Du siehst jetzt, welche KI tatsächlich geantwortet hat: Am Ergebnis (Picker-Chat, Foto-Erkennung, Wochenbericht) erscheint ein kleines Badge „über …" mit Anbieter und Modell. Springt bei einem Limit oder Fehler der Anthropic-Fallback ein, zeigt das Badge das ebenfalls an.',where:'Picker · Chat & Foto · Trends'},
  ]},
  {v:'0.193',items:[
    {icon:'🤖',text:'Du kannst jetzt selbst wählen, welche KI deine Schätzungen übernimmt: Unter „⚙️ → 🤖 KI → KI-Anbieter" einen Anbieter (OpenAI, Google Gemini, OpenRouter, Mistral, DeepSeek) auswählen und den eigenen API-Key eintragen. Dieser wird dann zuerst genutzt; ist das Kontingent aufgebraucht oder kommt kein Ergebnis, schaltet NutriTrack automatisch auf Anthropic (Standard) zurück. Ohne eigenen Key bleibt alles wie bisher.',where:'Einstellungen · KI'},
  ]},
  {v:'0.192',items:[
    {icon:'⚡',text:'Lebensmittel-Suche & Chat wieder schnell: Der externe Dienst, über den die Nährwerte von OpenFoodFacts geladen wurden, hatte seinen Gratis-Zugang abgeschaltet — dadurch wurde besonders der Picker-Chat extrem langsam. Die Nährwert-Abfrage läuft jetzt direkt über den eigenen Server, mit Zeitlimit, damit nichts mehr einfriert. Auch der Rezept-Import per Link funktioniert wieder.',where:'Picker · Chat & Suche'},
  ]},
  {v:'0.191',items:[
    {icon:'📷',text:'Foto-Erkennung verbessert: Die Bild-Analyse nutzt jetzt das aktuelle, stärkere KI-Modell, schickt das Foto in höherer Auflösung und hat mehr Platz für Ergebnisse. Damit werden Teller mit mehreren Komponenten und App-Screenshots zuverlässiger und vollständiger erkannt.',where:'Picker · Foto'},
  ]},
  {v:'0.190',items:[
    {icon:'🍷',text:'Picker · Chat erkennt jetzt zuverlässig jedes Lebensmittel — auch einzelne Begriffe und Getränke wie „Weißwein" oder „2 Bier". Die KI antwortet nicht mehr mit Ausreden, und falls doch mal nichts Brauchbares zurückkommt, wird deine Eingabe trotzdem als Lebensmittel übernommen statt mit „Konnte nicht parsen" abzubrechen. (#135)',where:'Picker · Chat'},
  ]},
  {v:'0.188',items:[
    {icon:'🐛',text:'Einstellungen · Ernährung: Der Button zum Hinzufügen einer eigenen Präferenz war über die volle Breite verrutscht und hat das Eingabefeld verdrängt. Er sitzt jetzt wieder kompakt neben dem Feld und heißt „+ Hinzufügen" (statt „+ Speichern"), damit er nicht mit dem Speichern-Button verwechselt wird. (#134)',where:'Einstellungen · Ernährung'},
  ]},
  {v:'0.187',items:[
    {icon:'🧹',text:'Einstellungen aufgeräumt: Der überladene „Daten"-Tab ist jetzt in zwei klare Tabs geteilt — „🤖 KI" (Proxy-Passwort & KI-Prompts) und „💾 Backup" (Autospeicher, Datei-Export/Import, OneDrive). Der Picker-Foto-Schalter sitzt jetzt logisch unter „🥗 Ernährung", die doppelte Lebensmittel-/Rezept-Liste wurde entfernt (alles in der Bibliothek), und der „⏰ Erinnerungen"-Tab ist nicht mehr abgekürzt.',where:'Einstellungen'},
  ]},
  {v:'0.186',items:[
    {icon:'🐛',text:'Picker · Chat: „Kaffee" wird endlich als schwarzer Kaffee erkannt statt als Cappuccino. Ursache war ein falscher Suchbegriff in der internen Lebensmittel-Datenbank (der Cappuccino-Eintrag hatte „kaffee" als Stichwort beansprucht). (#127)',where:'Picker · Chat'},
  ]},
  {v:'0.183',items:[
    {icon:'🐛',text:'Picker · Chat: Genannte Lebensmittel werden nicht mehr eigenmächtig „aufgewertet". Tippst du z. B. „Kaffee mit Hafermilch und Sojamilch", bleibt Kaffee jetzt Kaffee (schwarz) — statt fälschlich als Cappuccino erkannt zu werden. (#127)',where:'Picker · Chat'},
  ]},
  {v:'0.182',items:[
    {icon:'🔒',text:'Stabilität & Sicherheit: Namen aus geteilten Links, Online-Datenbanken und KI-Antworten werden jetzt sicher dargestellt (Schutz vor manipulierten Inhalten). Die Offline-Nutzung wurde robuster gemacht, und das Portionsgedächtnis merkt sich nun auch Mengen, die du über die Suche hinzufügst.',where:'App-weit'},
  ]},
  {v:'0.181',items:[
    {icon:'🔁',text:'Neu: Wiederkehrende Mahlzeiten. Öffne eine Mahlzeit (z. B. dein Frühstück), tippe „🔁 Wiederholen" und wähle die Wochentage (Standard Mo–Fr) — die Mahlzeit wird dann automatisch an diesen Tagen eingetragen. An Tagen, wo es mal nicht stimmt, einfach löschen; sie kommt an dem Tag nicht zurück. Verwalten/pausieren unter „Mehr → 🔁 Wiederkehrende Mahlzeiten". (#122)',where:'Mahlzeit-Detail · Mehr'},
  ]},
  {v:'0.180',items:[
    {icon:'🐛',text:'Picker: Wenn die KI gerade nicht antwortet (Kontingent aufgebraucht, überlastet oder offline), erscheint jetzt eine klare deutsche Meldung mit Tipp, statt der kryptischen englischen Originalmeldung. (#121)',where:'Picker · Chat & Foto'},
  ]},
  {v:'0.179',items:[
    {icon:'📷',text:'Picker · Foto: Neue Option in Einstellungen → Daten → „Foto auf Handy sichern". Wenn aktiv, wird das Foto nach dem Hinzufügen einer Mahlzeit übers System-Teilen-Menü angeboten (z. B. „In Fotos sichern" auf iOS, „In Galerie speichern" auf Android). Unter dem Foto-Preview gibt es einen Hinweis-Link zur Einstellung. (#118)',where:'Einstellungen · Daten · Picker-Fotos'},
  ]},
  {v:'0.178',items:[
    {icon:'🐛',text:'Picker Chat: Fuzzy-Suche ist strenger — „Waffel" findet nicht mehr fälschlich „Kaffee mit Milch". Levenshtein-Toleranz für kurze Wörter (bis 7 Zeichen) auf 1 Edit reduziert. (#117)',where:'Picker · Chat-Tab'},
  ]},
  {v:'0.177',items:[
    {icon:'🔍',text:'Picker Chat: Suche nur noch in deinen eigenen Rezepten und gespeicherten Lebensmitteln (Cache und eingebaute DB raus). Alle Wörter deiner Eingabe müssen treffen — „Joghurt mit Früchten" liefert kein „Joghurt Natur" oder „Früchte gemischt" mehr.',where:'Picker · Chat-Tab'},
  ]},
  {v:'0.176',items:[
    {icon:'🔍',text:'Picker Chat: Suche im eigenen Bestand ist jetzt tippfehler- und umlauttolerant. „Jogurt mit Frucht" findet „Joghurt mit Früchten und Müsli", „hänchen" findet „Hähnchenbrust". Teilformulierungen werden Wort-für-Wort gewichtet.',where:'Picker · Chat-Tab'},
  ]},
  {v:'0.175',items:[
    {icon:'🔍',text:'Picker Chat: Sucht jetzt zuerst in deinen eigenen Lebensmitteln, Rezepten und früher getrackten Sachen — Treffer erscheinen als wählbare Karten. Erst wenn nichts gefunden wird, fragt die KI. (#113)',where:'Picker · Chat-Tab'},
    {icon:'🐛',text:'Picker: Gelöschte Zutaten verschwinden jetzt sofort aus der Liste (vorher blieben die DOM-Zeilen sichtbar bis zum nächsten Render). (#112)',where:'Picker · Zutaten-Liste'},
  ]},
  {v:'0.173',items:[
    {icon:'📲',text:'Share-Import: „In App öffnen"-Anleitung erscheint jetzt auf allen Browsern (Edge, Firefox, Samsung Internet …) — nicht mehr nur auf iOS Safari. Link wird automatisch in die Zwischenablage kopiert.',where:'Import · Alle Browser'},
  ]},
  {v:'0.172',items:[
    {icon:'🔧',text:'Picker · Suche: „Hinzufügen"-Button klebt jetzt immer am unteren Rand der Auswahl — kein Scrollen mehr nötig auf Android.',where:'Picker · Suche'},
  ]},
  {v:'0.171',items:[
    {icon:'🔧',text:'iOS: Screen-Header jetzt korrekt unterhalb der Status-Bar (der BLOOM-Override hatte den Safe-Area-Fix überschrieben). (#104)',where:'iOS · Layout'},
    {icon:'🔍',text:'Picker Chat: Bei Marke + Produkt (z.B. „Dean David Red Thai Curry") wird zusätzlich nach dem Gericht ohne Markenname gesucht — mehr Treffer bei Markenprodukten.',where:'Picker · Chat-Tab'},
  ]},
  {v:'0.170',items:[
    {icon:'🔍',text:'Suche: Produkte ohne Energy-Felder (z. B. Curry, Dean & David) werden jetzt gefunden — kcal wird aus Protein/Kohlenhydrate/Fett berechnet wenn keine Energieangabe vorhanden. Chat-Suche prüft jetzt 10 statt 6 OFT-Ergebnisse. (#96 #101)',where:'Picker · Suche & Chat'},
  ]},
  {v:'0.169',items:[
    {icon:'📊',text:'Trends: Kcal-Durchschnitt berücksichtigt den heutigen Tag nicht mehr (laufender Tag verfälscht Wochenwert). (#103)',where:'Trends · Statistik'},
    {icon:'🤖',text:'KI-Wochenbericht: Bewertet Tage jetzt relativ zur Zielrichtung (Abnehmen/Zunehmen/Halten) statt nach absolutem kcal. Format: Stichpunkte + konkrete Empfehlung für nächste Woche. (#102)',where:'Trends · KI-Bericht'},
  ]},
  {v:'0.168',items:[
    {icon:'🔧',text:'iOS: Screen-Header werden jetzt korrekt unterhalb der Status-Bar / Dynamic Island positioniert — Buttons auf dem Mahlzeit-Detail-Screen und allen anderen Screens sind tippbar. (#104)',where:'iOS · Layout'},
  ]},
  {v:'0.167',items:[
    {icon:'🔧',text:'Bottom-Nav auf Android zentriert (war 14 px nach rechts versetzt). Auf iPhone/iPad scrollt die App nach dem Schließen der Tastatur nicht mehr nach oben weg. (#97 #98 #99)',where:'Layout · iOS & Android'},
  ]},
  {v:'0.166',items:[
    {icon:'📷',text:'Foto-Tab: Nach der Analyse kein automatischer Wechsel in den Chat mehr — Ergebnis bleibt sichtbar, Zutaten direkt eintragbar.',where:'Picker · Foto-Tab'},
  ]},
  {v:'0.165',items:[
    {icon:'🌐',text:'OpenFoodFacts findet jetzt deutlich mehr Produkte: Einträge mit Energie-Angabe in kJ (statt kcal) werden korrekt erkannt und umgerechnet — betrifft Chat-Suche, Suche-Tab und Nährwert-Lookup. (#79)',where:'Picker · Chat & Suche'},
  ]},
  {v:'0.164',items:[
    {icon:'🌐',text:'Im Chat-Tab sucht die App jetzt zuerst in OpenFoodFacts — Markenprodukte (z.B. Dean & David) werden direkt mit echten Nährwerten als Karte angezeigt. Kein Treffer → KI schätzt wie bisher. „🤖 Stattdessen KI fragen" überspringt OFT. (#79)',where:'Picker · Chat-Tab'},
  ]},
  {v:'0.163',items:[
    {icon:'💬',text:'Nach der Foto-Analyse wechselt der Picker automatisch in den Chat — die KI kann jetzt Rückfragen stellen, und du kannst weitere Details zum Foto ergänzen. Fotos werden als Bildkontext mitgeschickt (Modell: claude-sonnet-4-6). (#80)',where:'Picker · Foto → Chat'},
  ]},
  {v:'0.162',items:[
    {icon:'📸',text:'Feedback-Screenshot zeigt jetzt den tatsächlich aktiven Screen — offene Overlays (z.B. Rezeptsuche, Picker) erscheinen korrekt im Bild, nicht nur der Hintergrund (#87)',where:'Feedback · Screenshot'},
  ]},
  {v:'0.161',items:[
    {icon:'🗑️',text:'KI-Tagesreport entfernt — der „🤖 Tag bewerten"-Button ist nicht mehr auf der Heute-Seite (#81)',where:'Heute-Tab'},
    {icon:'📱',text:'Hinzufügen-Button und Bottom-Nav sind jetzt auch auf iPhone (Home-Indikator) und Android (Gesten-Navigation) vollständig sichtbar (#88)',where:'Alle Screens · Navigation'},
  ]},
  {v:'0.160',items:[
    {icon:'📚',text:'Bibliothek (Rezepte & eigene Lebensmittel) ist jetzt direkt über den Mehr-Tab erreichbar und nicht mehr als Tab in den Einstellungen versteckt (#84, #85)',where:'Mehr → Bibliothek'},
    {icon:'🔧',text:'Layout-Fix im Mehr-Tab: lange Texte werden nun korrekt abgeschnitten statt umzubrechen (#86)',where:'Mehr-Tab'},
  ]},
  {v:'0.159',items:[
    {icon:'☁️',text:'Läuft die OneDrive-Sitzung ab, erscheint jetzt sofort ein Dialog zum Neu-Verbinden — ein Tipp reicht, kein stiller Datenverlust mehr (#77)',where:'OneDrive · Verbindung'},
    {icon:'💾',text:'Autospeicher-Slots werden jetzt täglich automatisch befüllt — ein Fehler hatte die Slot-Rotation deaktiviert (#78)',where:'OneDrive · Autospeicher'},
  ]},
  {v:'0.158',items:[
    {icon:'🏃',text:'Sport-Sync: Workouts aus Apple Health (über iOS-Kurzbefehle) und Samsung Health / Health Connect (über Android HTTP-Shortcuts oder Tasker) werden automatisch importiert. Die verbrannten Kalorien werden vom Tagesziel abgezogen. Einrichten unter „Mehr" → „Sport-Sync".',where:'Mehr · Sport-Sync'},
  ]},
  {v:'0.157',items:[
    {icon:'📋',text:'Aus einer Mahlzeit lässt sich jetzt ein Rezept erstellen: im Mahlzeit-Detail neuer Button „💾 Als Rezept" — bündelt alle Einträge der Mahlzeit (inkl. enthaltener Rezepte, anteilig nach Portionen) zu einem neuen Rezept und öffnet direkt den Editor zum Benennen (Issue #75)',where:'Mahlzeit-Detail · 💾 Als Rezept'},
  ]},
  {v:'0.156',items:[
    {icon:'⚙️',text:'Einstellungs-Button oben rechts entfernt — Einstellungen erreichst du weiter über den Mehr-Tab (Issue #71)',where:'Heute-Tab & Trends · Header'},
    {icon:'🆕',text:'„Was ist neu" zeigt jetzt die komplette Versionshistorie — nicht nur die Änderungen seit dem letzten Update (Issue #70)',where:'Mehr-Tab → Was ist neu · Header-Versions-Tag'},
  ]},
  {v:'0.155',items:[
    {icon:'📋',text:'Mahlzeit-Detail öffnet jetzt als Bottom Sheet über der aktuellen Seite — kein eigener Screen mehr, kein Kontext-Verlust (Issue #72)',where:'Heute-Tab · Mahlzeit-Karten'},
    {icon:'⚙️',text:'Einstellungs-Button oben rechts entfernt — Einstellungen erreichst du weiter über den Mehr-Tab (Issue #71)',where:'Heute-Tab & Trends · Header'},
    {icon:'🆕',text:'„Was ist neu" zeigt jetzt die komplette Versionshistorie — nicht nur die Änderungen seit dem letzten Update (Issue #70)',where:'Mehr-Tab → Was ist neu · Header-Versions-Tag'},
  ]},
  {v:'0.154',items:[
    {icon:'📸',text:'Screenshot beim Feedback erfasst wieder die ganze Seite (statt nur den sichtbaren Ausschnitt). Das war zuverlässiger – der Viewport-Crop hat bei offenen Bottom-Sheet-Modalen Teile abgeschnitten. Button heißt jetzt schlicht „📸 Screenshot" (Issue #67, revertiert #56)',where:'Feedback-Modal · 📸 Screenshot'},
  ]},
  {v:'0.153',items:[
    {icon:'📸',text:'Screenshot beim Feedback erfasst Bottom-Sheet-Modale (z.B. „Zutat hinzufügen") jetzt komplett — vorher wurde nur der obere Header-Streifen abgelichtet, weil html2canvas die Modal-Position falsch berechnet hat. Vor dem Capture friert die Funktion die tatsächliche Viewport-Position des offenen Modals als Pixel-Werte ein und stellt sie hinterher zurück (Issue #67)',where:'Feedback-Modal · 📸 Sichtbarer Ausschnitt'},
  ]},
  {v:'0.152',items:[
    {icon:'📸',text:'Screenshot beim Feedback ist robuster: weniger Mobile-Chromium-Stolpersteine (deaktiviertes ForeignObject-Rendering, Bild-Timeout 8 s, Feedback-Modal selbst wird ignoriert) und ein automatischer Zweit-Versuch mit toleranteren Optionen, falls der erste fehlschlägt. Schlägt es trotzdem fehl, zeigt der Toast jetzt den genauen Fehlertext und verweist auf „📁 Eigenes Foto…" (Issue #61)',where:'Feedback-Modal · 📸 Sichtbarer Ausschnitt'},
  ]},
  {v:'0.151',items:[
    {icon:'🔢',text:'Versionsnummer ist jetzt im Heute-Header sichtbar (kleiner Tag rechts neben „Hej …") – Tippen öffnet „Was ist neu" (Issue #62)',where:'Heute-Tab · Header'},
    {icon:'➕',text:'Mahlzeit-Detail entrümpelt: der separate „+ Zutat"-Button im Body fällt weg. Stattdessen kennt der zentrale ＋ in der unteren Leiste jetzt die geöffnete Mahlzeit und legt direkt dort an (Issue #64)',where:'Mahlzeit-Detail'},
  ]},
  {v:'0.150',items:[
    {icon:'🤖',text:'KI-Tagesbewertung („🤖 Tag bewerten" auf der Heute-Seite): Prompt enthält jetzt Makros pro Mahlzeit (kcal · P · K · F) plus Gesamt-Makros und Makro-Ziele – die Bewertung bezieht sich nun konkret auf Kalorien- und Makroziele. Bei leerer KI-Antwort kommt eine Hinweis-Toast statt einem stummen leeren Feld; Token-Limit auf 300 erhöht (Issue #55)',where:'Heute-Tab · KI-Tagesbewertung'},
  ]},
  {v:'0.149',items:[
    {icon:'🐛',text:'Header aufgeräumt: „📤 Sichern" ist nicht mehr im Header neben „📥 Importieren" (zu ähnlich, zu nah). Daten-Sicherung läuft jetzt nur noch über Einstellungen → Datensicherung bzw. den „Mehr"-Hub → Daten teilen / sichern (Issue #53)',where:'Heute · Trends'},
    {icon:'🎯',text:'Kalorien-Ampel auf der Heute-Seite richtet sich nach deinem Diät-Ziel: ±10 % vom Kalorienziel = grün („im Plan"); darüber/darunter ist abhängig vom Zielgewicht. Wer abnehmen will, bekommt Unterschreitungen grün („gut für dein Defizit") und Überschreitungen rot mit Bewegungstipp. Wer zunehmen will, bekommt es genau umgekehrt. Ohne Zielgewicht (Halten) wird beides als Hinweis markiert (Issue #52)',where:'Heute-Tab · Hero-Pill unter der kcal-Zahl'},
  ]},
  {v:'0.148',items:[
    {icon:'🐛',text:'Feedback-Modal liegt jetzt über allen anderen Modalen (vorher konnte es hinter offenen Dialogen verschwinden, Issue #57)',where:'Feedback-Modal'},
    {icon:'🐛',text:'Screenshot beim Feedback nimmt nur noch den sichtbaren Ausschnitt auf (vorher die ganze Seite) – kleinere Datei, präzisere Suche (Issue #56)',where:'Feedback-Modal · 📸 Sichtbarer Ausschnitt'},
    {icon:'🐛',text:'Feedback-Modal aufgeräumt: „📤 Senden" sitzt jetzt direkt unter dem Textfeld, der Screenshot-Bereich ist ausklappbar und enthält neben dem Auto-Screenshot auch „📁 Eigenes Foto…" als Fallback (Issue #54)',where:'Feedback-Modal'},
  ]},
  {v:'0.147',items:[
    {icon:'🐛',text:'Feedback-Modal: „✕ Screenshot entfernen" liegt jetzt unter dem „Screenshot anhängen"-Button (vorher daneben mit unsauber breiter leerer Fläche)',where:'Feedback-Modal'},
  ]},
  {v:'0.146',items:[
    {icon:'🐛',text:'Feedback-Button (🐛) ist jetzt ein globaler Floating-Button unten rechts und auf jeder Seite sowie über jedem geöffneten Modal erreichbar (Issue #48). Die Header-Buttons und der eigene Listen-Eintrag im „Mehr"-Hub entfallen dafür ersatzlos',where:'App-weit (außer Setup)'},
  ]},
  {v:'0.145',items:[
    {icon:'🐛',text:'Neuer Feedback-Button (🐛) im Top-Header jedes Screens und im „Mehr"-Hub: Bug melden oder Änderungswunsch einreichen — landet automatisch als GitHub-Issue auf hjolmes/nutritrack. Optional kann ein Auto-Screenshot der aktuellen Seite angehängt werden (Vorschau vor dem Senden, Screenshot kann persönliche Daten enthalten — bitte prüfen). Mitgesendet werden Tab, Screen, App-Version, User-Agent und Zeitpunkt',where:'Top-Header jedes Screens · Mehr-Hub'},
  ]},
  {v:'0.144',items:[
    {icon:'🌸',text:'Bloom-Redesign: warmes Cream-Theme mit Coral-Akzent und Fraunces-Serif-Typografie – ruhigere, redaktionelle Optik auf jedem Screen',where:'App-weit'},
    {icon:'🏠',text:'Heute personalisiert: „Hej {Name}" mit Wochentag und Kalenderwoche, große Hero-Zahl „kcal verbleibend" plus Trend-Pill (über/unter Soll)',where:'Heute-Tab'},
    {icon:'🍱',text:'Mahlzeiten als 2×2-Grid: jede Karte zeigt Icon-Tile, Uhrzeit, kcal-Wert und Vorschau der Zutaten – Tap öffnet die neue Mahlzeit-Detail-Subseite',where:'Heute-Tab'},
    {icon:'🧭',text:'5-Tab-Navigation als schwebende Pille: Heute · Verlauf · + · Trends · Mehr – inklusive Verlauf-Liste der vergangenen Tage und „Mehr"-Hub für Bibliothek/Einstellungen/Daten/Hilfe',where:'Bottom-Nav'},
  ]},
  {v:'0.143',items:[
    {icon:'📲',text:'Auf iOS isoliert Apple seit iOS 17.4 den Safari-Speicher von der installierten PWA – Imports landeten in Safari-Daten und waren in der App nicht sichtbar. Neuer Flow: Wenn du einen geteilten Link in Safari öffnest, kopiert NutriTrack die URL automatisch in die Zwischenablage und zeigt eine 3-Schritt-Anleitung. In der App tippst du oben auf 📥 – der Link wird automatisch eingefügt und du bestätigst nur noch die Vorschau',where:'Geteilter Link in Safari öffnen'},
    {icon:'📋',text:'Beim 📥-Tap in der App wird die Zwischenablage geprüft. Wenn ein NutriTrack-Link drin liegt, wird er automatisch ins Eingabefeld übernommen – ein Tap weniger',where:'Hauptansicht → 📥'},
    {icon:'🆘',text:'„Trotzdem in Safari importieren"-Option für reine Browser-Nutzer ohne installierte App – Daten bleiben dann in Safari, nicht in der App',where:'iOS-Switch-to-App-Dialog'},
  ]},
  {v:'0.142',items:[
    {icon:'📲',text:'Geteilte Links öffnen jetzt direkt die installierte PWA (auf Android Chrome) statt einem neuen Browser-Tab. Dafür liegt der Kurzlink ab jetzt auf der PWA-Origin selbst (hjolmes.github.io/nutritrack/?s=Ab12X), nicht mehr auf der Worker-Origin – Chrome erkennt den PWA-Scope und routet via handle_links zur App. Auf iOS bleibt der Safari-Pfad (Apple bietet keine PWA-URL-Routing-API), aber Safari und PWA teilen sich denselben Storage – das Rezept landet trotzdem in der App',where:'Jeder geteilte Link'},
    {icon:'🔗',text:'Kurzlink ist jetzt sogar 11 Zeichen kürzer (~47 statt ~58), weil hjolmes.github.io kürzer ist als nutritrack-ai-proxy.h-jolmes.workers.dev. Alte v0.140-Links bleiben gültig – der Worker leitet sie automatisch auf das neue Format um',where:''},
  ]},
  {v:'0.141',items:[
    {icon:'📥',text:'Import-Button direkt in der Hauptansicht: oben rechts neben „📤 Sichern" jetzt „📥 Importieren". Link oder Code einfügen — die App erkennt automatisch ob es ein Rezept (→ Bibliothek), eine Mahlzeit (→ Eintrag in gewählte Tageszeit) oder ein Lebensmittel (→ eigene Lebensmittel) ist und legt eine Vorschau zur Bestätigung vor',where:'Hauptansicht oben rechts: 📥'},
  ]},
  {v:'0.140',items:[
    {icon:'🔗',text:'Eigener Kurzlink-Service auf dem Cloudflare Worker statt is.gd: aus dem ~570-Zeichen-Link wird "https://nutritrack-ai-proxy.h-jolmes.workers.dev/s/Ab12X3y" (~58 Zeichen). Funktioniert dauerhaft (kein Drittanbieter, eigene KV-Storage), 1 Jahr Lebenszeit pro Link, ID alphanumerisch ohne 0/O/1/I/l. Fallback weiterhin: is.gd → langer Link',where:'Jeder 📤 Share-Button'},
  ]},
  {v:'0.139',items:[
    {icon:'🔗',text:'Teilen via Kurzlink: Lange Base64-URLs werden über is.gd zu „is.gd/abc123" verkürzt – passt in jede WhatsApp-Vorschau, kein Zeilenumbruch mehr. Fallback auf Original-Link wenn der Shortener offline ist',where:'Jeder 📤 Share-Button'},
    {icon:'📲',text:'Auf Android (Chrome ≥97) öffnen geteilte Links jetzt direkt die installierte PWA statt den Browser-Tab. Auf iOS bleibt der Safari-Pfad (Apple bietet keine PWA-URL-Routing-API), aber das Rezept landet trotzdem in der App – Safari und PWA teilen sich denselben Speicher',where:'Manifest: handle_links + launch_handler'},
    {icon:'🌐',text:'Eine Funktion für alles: Mahlzeiten, Lebensmittel und Rezepte teilen jetzt über einen einzigen Code-Pfad. Eigene Lebensmittel können erstmals geteilt und importiert werden – per Link wie Rezepte',where:'Bibliothek + Eintragsmenü + Mahlzeit-Header'},
    {icon:'📥',text:'Import-Dialog erkennt automatisch was kommt: Rezept, Lebensmittel oder ganze Mahlzeit – mit passender Vorschau (Zutaten, Nährwerte, Anzahl Einträge). Bei Mahlzeiten wählst du das Ziel (Frühstück/Mittag/Abend/Snack)',where:'Geteilten Link öffnen → Bestätigungs-Dialog'},
  ]},
  {v:'0.138',items:[
    {icon:'🔗',text:'Rezepte teilen jetzt per Link statt Code: 📤 öffnet das System-Share-Sheet (WhatsApp, Mail, Signal, …). Empfänger tippt den Link an → Rezept-Vorschau mit Zutaten und Kalorien → ein Tap zum Importieren. Funktioniert auf iOS und Android. Code-Eingabefeld bleibt als Fallback erhalten und akzeptiert sowohl Link als auch alten Code',where:'Bibliothek → Rezept → 📤 oder Rezept bearbeiten → „Rezept teilen"'},
  ]},
  {v:'0.137',items:[
    {icon:'🚀',text:'iOS-Server-Decode komplett umgebaut: statt Claude Vision (KI, teuer) läuft jetzt ein dedizierter OSS-Decoder (OpenCV BarcodeDetector + pyzbar) auf Cloud Run als Primärpfad. Echter Strichcode-Decoder, kein KI-Bias, ~30–150 ms warm, dauerhaft kostenlos im Free-Tier. Vision bleibt nur als optionaler Fallback verkabelt (per Env-Flag aktivierbar)',where:'Barcode-Tab'},
  ]},
  {v:'0.136',items:[
    {icon:'📸',text:'Barcode: „Foto aufnehmen"-Knopf jetzt immer sichtbar als Plan B. Hochauflösendes Foto wird durch alle Decoder geschickt: zxing-wasm → zbar-wasm → ZXing-JS → Claude Vision. Foto hat ~5× mehr Pixel als Live-Stream-Frame – schafft auch Codes ohne Klartext-Ziffern (z.B. Rügenwalder)',where:'Barcode-Tab'},
  ]},
  {v:'0.135',items:[
    {icon:'📝',text:'Barcode: „Code manuell eingeben"-Knopf als Notnagel wenn die Decoder versagen. Auf iPhone kannst du im Eingabefeld via long-press Apples Live Text nutzen – das liest EAN-Ziffern brilliant. Plus Schwarz-Weiß-Filter mit erhöhtem Kontrast vor jedem Decode (hilft bei reflektiven Verpackungen wie Joghurtbechern)',where:'Barcode-Tab'},
  ]},
  {v:'0.134',items:[
    {icon:'⏳',text:'Barcode: WASM-Module-Polling von 2s auf 15s erhöht – auf iOS Safari mit langsamer Verbindung kann esm.sh länger brauchen. Wenn JS-Fallback aktiv ist, werden trotzdem alle Decoder pro Frame geprüft. Debug-Label zeigt jetzt live, welche Engines aktiv sind',where:'Barcode-Tab'},
  ]},
  {v:'0.133',items:[
    {icon:'📷',text:'Barcode: zbar-wasm als zweiter lokaler Decoder (gleiche Library wie OpenFoodFacts-App), pro Frame parallel zu zxing-wasm – fängt Codes mit niedrigem Kontrast oder dünnen Strichen, wo ZXing aufgibt. Plus iOS Auto-Focus aktiviert + engerer Crop (70×35)',where:'Barcode-Tab'},
  ]},
  {v:'0.132',items:[
    {icon:'📐',text:'Barcode iOS: höhere Kamera-Auflösung erzwungen (ideal 1920×1080) – iOS Safari liefert sonst manchmal nur 480×640, was für Decode zu wenig ist. Debug-Label zeigt jetzt Stream-Auflösung',where:'Barcode-Tab'},
  ]},
  {v:'0.131',items:[
    {icon:'🛡️',text:'Barcode iOS: EAN-13-Prüfziffer + 2× identische Bestätigung gegen halluzinierte Codes von Claude Vision – falsche Codes landen nicht mehr im Lookup',where:'Barcode-Tab'},
  ]},
  {v:'0.130',items:[
    {icon:'📷',text:'Barcode: erkannter Code wird jetzt oben in der „Produkt nicht in der Datenbank"-Box angezeigt – damit sichtbar ist, dass der Scan funktioniert hat (auch wenn OpenFoodFacts das Produkt nicht kennt)',where:'Barcode-Tab'},
  ]},
  {v:'0.129',items:[
    {icon:'🔍',text:'Barcode-Diagnose: Debug-Label zeigt Claudes Roh-Antwort + Request-Zähler – damit sichtbar wird, was die KI tatsächlich erkennt (oder nicht)',where:'Barcode-Tab → Debug-Label unter dem Sucher'},
  ]},
  {v:'0.128',items:[
    {icon:'📷',text:'iOS Barcode-Scanner: Live-Frames laufen parallel an den Cloudflare-Worker und werden dort via Claude Haiku Vision dekodiert – Live-Sucher unverändert, aber endlich Treffer auf iPhone',where:'Barcode-Tab'},
  ]},
  {v:'0.127',items:[
    {icon:'📷',text:'Barcode-Scanner: zxing-wasm (C++/WebAssembly) ersetzt langsamen JS-Decoder – iOS Safari erkennt jetzt EAN-13 zuverlässig',where:'Barcode-Tab'},
  ]},
  {v:'0.126',items:[
    {icon:'📷',text:'Barcode-Scanner: Crop auf Sucher-Region + Downscale auf 800px – ZXing erkennt jetzt Codes statt am vollen 1080p-Bild zu scheitern',where:'Barcode-Tab'},
  ]},
  {v:'0.125',items:[
    {icon:'🔍',text:'Debug-Vorschau: kleines Bild zeigt was der Decoder sieht + Frame-Zähler + aktiver Pfad',where:'Barcode-Tab'},
  ]},
  {v:'0.124',items:[
    {icon:'📷',text:'iOS Barcode-Scanner: requestVideoFrameCallback + BarcodeDetector.getSupportedFormats() – zuverlässige Erkennung auf iPhone',where:'Barcode-Tab'},
  ]},
  {v:'0.123',items:[
    {icon:'📷',text:'iOS Barcode-Scanner: Canvas ans DOM gehängt – behebt leere Frames bei ZXing auf iPhone',where:'Barcode-Tab'},
  ]},
  {v:'0.122',items:[
    {icon:'📷',text:'iOS Barcode-Scanner: createImageBitmap behebt schwarze Frames – Live-Scan funktioniert jetzt auf iPhone',where:'Barcode-Tab'},
    {icon:'➕',text:'Barcode nicht gefunden → Produkt manuell eintragen (wird dauerhaft gespeichert)',where:'Barcode-Tab'},
  ]},
  {v:'0.121',items:[
    {icon:'📷',text:'Barcode-Scanner auf iPhone: ZXing-Live-Scan statt Foto-Fallback',where:'Mahlzeit → + → Barcode'},
  ]},
  {v:'0.120',items:[
    {icon:'🗂️',text:'Picker-Code in eigene Datei picker.js ausgelagert – Seite ~900 Zeilen schlanker',where:'Intern'},
  ]},
  {v:'0.119',items:[
    {icon:'☁️',text:'OneDrive Auto-Sync täglich beim App-Start (wenn verbunden)',where:'Automatisch im Hintergrund'},
    {icon:'🔄',text:'5 rotierende OneDrive-Slots (1→2→3→4→5→1…) – frühere Stände wählbar',where:'⚙️ → Daten → Autospeicher'},
    {icon:'📁',text:'OneDrive-Ordnerpfad frei wählbar',where:'⚙️ → Daten → OneDrive'},
  ]},
  {v:'0.118',items:[
    {icon:'🕹️',text:'Autospeicher – App speichert bei jedem Start automatisch; frühere Stände laden',where:'⚙️ → Daten → Autospeicher'},
    {icon:'☁️',text:'Täglicher Hinweis wenn OneDrive nicht verbunden',where:'Banner oben im Hauptbildschirm'},
  ]},
  {v:'0.117',items:[
    {icon:'☁️',text:'Export-Button speichert zuerst in OneDrive – lokaler Download als Fallback',where:'📤 Button oben rechts'},
  ]},
  {v:'0.116',items:[
    {icon:'🔑',text:'Proxy-Passwort: KI-Zugang per Passwort sichern – kein Token mehr im Code',where:'⚙️ → Daten → Proxy-Passwort'},
  ]},
  {v:'0.115',items:[
    {icon:'🔒',text:'KI-Anfragen laufen jetzt über einen geschützten Cloudflare Proxy statt direkt aus dem Browser',where:'Cloudflare Worker + sichere Secrets'},
  ]},
  {v:'0.114',items:[
    {icon:'☁️',text:'OneDrive Sync – Daten automatisch in Microsoft OneDrive sichern',where:'⚙️ → Daten → OneDrive verbinden'},
  ]},
  {v:'0.113',items:[
    {icon:'📚',text:'Bibliothek (Rezepte & Lebensmittel) jetzt in den Einstellungen',where:'⚙️ → Tab „📚 Bibliothek"'},
    {icon:'👆',text:'Rezept in Mahlzeit antippen: Bearbeiten, Teilen, Kochanleitung',where:'Rezept-Eintrag in der Hauptansicht antippen'},
    {icon:'📤',text:'Ganze Mahlzeit als Code teilen – andere können direkt importieren',where:'Mahlzeit-Header → 📤 Button'},
  ]},
  {v:'0.112',items:[
    {icon:'🔍',text:'Nährwerte pro Zutat aufklappbar – überall (Picker, Bearbeiten, Rezept-Editor)',where:'Zutat antippen → Emoji oder Name'},
  ]},
  {v:'0.111',items:[
    {icon:'📱',text:'Live-Barcode-Scanner auf iPhone/iPad (iOS 18.6.2+)',where:'+ → Barcode → Scanner starten'},
  ]},
  {v:'0.110',items:[
    {icon:'↕',text:'Mahlzeiten verschieben: Einträge per Knopf zwischen Mahlzeiten wechseln',where:'Eintrag antippen → „↕ Mahlzeit wechseln"'},
    {icon:'📤',text:'Rezept als Code teilen und einlösen (inkl. Kochanleitung)',where:'Bibliothek → Rezept → 📤 oder Rezept bearbeiten → „Rezept teilen"'},
    {icon:'📝',text:'Kochanleitung pro Rezept – Freitext, wird beim URL-Import automatisch erkannt',where:'Einstellungen → Rezept bearbeiten → Kochanleitung'},
    {icon:'➕',text:'Rezept aus allen Quellen erweitern: Chat, Foto, Barcode, Suche, Link',where:'Eintrag antippen → „+ Zutat hinzufügen"'},
    {icon:'📷',text:'Screenshot-Import verbessert: Tracking-Apps, Einkaufszettel, Übersichten',where:'+ → Foto → Bild auswählen'},
    {icon:'⚙️',text:'Einstellungen in übersichtliche Tabs aufgeteilt',where:'⚙️ oben rechts'},
  ]},
  {v:'0.109',items:[
    {icon:'🆕',text:'Automatischer Update-Hinweis beim App-Start',where:'Erscheint nach Update automatisch'},
    {icon:'📄',text:'Benutzerhandbuch aktualisiert',where:'❓ Hilfe'},
  ]},
  {v:'0.108',items:[
    {icon:'🔗',text:'Rezept-Import per Link direkt beim Eintragen',where:'+ drücken → Tab „🔗 Link"'},
  ]},
];
