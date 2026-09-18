// NutriTrack – Versions-Changelog für den "Was ist neu"-Dialog.
// Ausgelagert aus index.html (v0.204). Klassisches Script, exportiert window.CHANGELOG.
window.CHANGELOG=[
  {v:'0.254',items:[
    {icon:'\ud83d\udd27',text:'Ein aus dem ⋯-Blatt oder aus „Funktionen“ geöffnetes Menü ging hinter dem noch offenen Menü auf und war damit nicht bedienbar. Betroffen waren 21 von 25 Wegen — die vier, die gingen, gingen nur zufällig. Jetzt schließt sich das Blatt, bevor es etwas öffnet.',where:'Heute → ⋯ · Mehr → \ud83e\udde9 Funktionen'},
    {icon:'\ud83d\uded2',text:'Der Einkaufszettel blendete seine Kachel selbst aus, solange nichts drauf stand — während sein Schalter auf „an“ stand. Jetzt entscheidet allein der Schalter: eingeschaltet heißt sichtbar, leer heißt leer, genau wie bei Wochenplan, Sport und Fasten. Wer ihn nicht braucht, schaltet ihn unter „Funktionen“ aus — die Artikel bleiben trotzdem erhalten.',where:'Heute · Mehr → \ud83e\udde9 Funktionen'},
    {icon:'\ud83d\udcec',text:'Dasselbe beim Postfach, nur andersherum: Es war bisher nur zu sehen, wenn gerade etwas Neues ankam. Jetzt steht es dauerhaft da, sobald eine Kopplung besteht, und sagt auch „Nichts Neues“. Ohne Kopplung bleibt es weg — und der Katalog schreibt das jetzt unter den Namen, statt einen Schalter auf „an“ neben einer fehlenden Kachel zu zeigen.',where:'Heute · Mehr → \ud83e\udde9 Funktionen'},
  ]},
  {v:'0.253',items:[
    {icon:'\ud83e\udde9',text:'Jede Funktion hat jetzt genau einen Ort: ihre Kachel auf „Heute“. Oben rechts an jeder Kachel steht ein ⋯-Knopf — darunter liegt alles, was zu dieser Funktion gehört. Beim Wasser also Wasserziel und Trink-Erinnerung, beim Sport das Eintragen und der Sport-Sync, beim Baby das Tagebuch, die Angaben zum Baby und das Teilen. Vorher lag dieselbe Sache an bis zu drei Stellen verteilt.',where:'Heute → ⋯ an jeder Kachel'},
    {icon:'\ud83d\udccb',text:'Neu: „Funktionen“ unter Mehr. Dort steht jede Kachel mit Schalter und ▲▼ — ein- und ausschalten, sortieren, und mit einem Tipp auf die Zeile direkt öffnen. Damit ist auch eine abgeschaltete Funktion erreichbar, ohne sie erst wieder einblenden zu müssen. Der alte Dialog „Kacheln auf Heute“ ist darin aufgegangen.',where:'Mehr → \ud83e\udde9 Funktionen'},
    {icon:'\ud83e\uddf9',text:'Das Mehr-Menü ist von 19 auf 10 Einträge geschrumpft. Bibliothek, Wiederkehrende Mahlzeiten, Alexa, Wochenplan, Einkaufszettel, Baby-Tagebuch, Postfach, Sport-Sync und Kacheln stehen nicht mehr dort, sondern an ihrer Kachel. Übrig bleibt, was wirklich übergreifend ist: Profil, Ziele, Ernährung, Erinnerungen, KI, Backup, Verbindungen und Hilfe.',where:'Mehr'},
    {icon:'\ud83d\udd27',text:'Nebenbei behoben: Der runde Feedback-Knopf unten rechts lag über jedem geöffneten Dialog und verdeckte dort die untere rechte Ecke — seit v0.154. Er tritt jetzt zurück, solange ein Dialog offen ist.',where:'überall'},
  ]},
  {v:'0.248',items:[
    {icon:'\ud83d\udd27',text:'Wochenplan teilen scheiterte mit „Server nicht erreichbar" — dem Worker fehlte die Freigabe für den neuen Kopfzeilen-Namen des Wochenplans, weshalb der Browser die Anfrage schon vor dem Absenden abbrach. Einkaufszettel und Baby-Tagebuch waren nie betroffen. Behoben; die Freigabe wächst jetzt automatisch mit, wenn ein Bereich dazukommt.',where:'\ud83d\udcc5 Wochenplan → \ud83d\udd04 Teilen'},
  ]},
  {v:'0.247',items:[
    {icon:'\ud83d\udd17',text:'Ein Code je Person statt einer je Liste: Mehr → \ud83d\udd17 Verbindungen. Du lädst jemanden ein, gibst ihm einen Code — und stellst dann für diese Person einzeln ein, ob sie Wochenplan, Einkaufszettel und Baby-Tagebuch bekommt. Mehrere Personen gleichzeitig sind möglich, jede mit eigener Auswahl: die Frau bekommt alles, die Oma nur den Einkaufszettel.',where:'Mehr → \ud83d\udd17 Verbindungen'},
    {icon:'\ud83d\udcc5',text:'Der Wochenplan lässt sich jetzt teilen. Mitgeschickt werden nicht nur die Namen, sondern auch Zutaten und Mengen — die andere Seite sieht den Plan also vollständig, auch ohne deine Rezeptsammlung, und kann ihn ins eigene Tagebuch oder auf den Einkaufszettel übernehmen. Fremde Rezepte sind am gestrichelten Rand erkennbar.',where:'\ud83d\udcc5 Wochenplan → \ud83d\udd04 Teilen'},
    {icon:'\u267b\ufe0f',text:'Bestehende Kopplungen bleiben bestehen: Aus deinem alten Tagebuch-Code und deinem alten Zettel-Code werden beim Update automatisch zwei Personen in der neuen Liste. Nichts wird neu hochgeladen, nichts geht verloren — du kannst sie umbenennen oder später durch einen gemeinsamen Code ersetzen.',where:'Mehr → \ud83d\udd17 Verbindungen'},
    {icon:'\u26a0\ufe0f',text:'Ehrlich dazu: Die Schalter sagen, was dein Gerät sendet und abholt — sie sind keine Sperre für die Gegenseite. Wer den Code hat, kann bei sich jeden Bereich einschalten. Was jemand gar nicht bekommen soll, teilst du nicht über denselben Code. Mahlzeiten, Kalorien, Gewicht und Profildaten werden weiterhin nie geteilt.',where:'Mehr → \ud83d\udd17 Verbindungen'},
  ]},
  {v:'0.246',items:[
    {icon:'\ud83e\udde0',text:'Der Einkaufszettel merkt sich, wohin du einen Artikel einsortiert hast. Einmal „Bier" per ✏️ in deinen „Getränkemarkt" geschoben — beim nächsten Eintippen landet es von selbst dort, samt Symbol. Gemerkt wird nur, was du selbst einstellst, nicht was die App rät. Löschst du die Kategorie, ist auch die Erinnerung weg und die App rät wieder normal.',where:'Mehr → \ud83d\uded2 Einkaufszettel'},
  ]},
  {v:'0.245',items:[
    {icon:'\ud83c\udff7\ufe0f',text:'Der Einkaufszettel nimmt jetzt eigene Kategorien: \ud83d\uded2 Einkaufszettel → \ud83c\udff7\ufe0f Kategorien. Name und Symbol frei wählbar, mit \u25b2\u25bc in die Reihenfolge deines Ladens gebracht, jederzeit wieder löschbar. Eigene Kategorien stehen im Zettel hinter den eingebauten, „Sonstiges" bleibt am Ende. Beim Löschen wandern die Artikel nach „Sonstiges" — weg ist keiner. Zuordnen geht über ✏️ am Artikel; dort liegt auch der Weg zur Verwaltung.',where:'Mehr → \ud83d\uded2 Einkaufszettel'},
    {icon:'\ud83d\udd04',text:'Eigene Kategorien werden mitgeteilt: Wer den Zettel mit einem zweiten Gerät koppelt, sieht dort dieselben Kategorien — sonst wären die Artikel drüben stumm unter „Sonstiges" gelandet. Verschlüsselt wie der Zettel selbst.',where:'\ud83d\uded2 Einkaufszettel → \ud83d\udd04 Teilen'},
  ]},
  {v:'0.244',items:[
    {icon:'\ud83d\udcc5',text:'Neu: ein Wochenplan. Rezepte auf Frühstück, Mittag, Abend und Snack der sieben Tage verteilen — Mehr → \ud83d\udcc5 Wochenplan oder über die neue Kachel auf „Heute". \ud83c\udfb2 füllt alle leeren Mittag- und Abend-Slots automatisch aus deiner Rezeptsammlung, ohne ein Rezept in derselben Woche zu wiederholen. \ud83d\uded2 schiebt die Zutaten der ganzen Woche auf den Einkaufszettel, gleiche Zutaten aus mehreren Rezepten zusammengefasst. Pro Tag ein Tipp auf „→ ins Tagebuch" trägt das Geplante als normale Mahlzeiten ein.',where:'Heute · Mehr → \ud83d\udcc5 Wochenplan'},
    {icon:'\ud83d\udcf7',text:'Rezepte aus dem Kochbuch: Seite abfotografieren, die KI liest Titel, Portionszahl, Zutatenliste und Zubereitung heraus. Haushaltsmaße werden dabei in Gramm umgerechnet (1 EL Öl ≈ 15 g, 1 Ei ≈ 60 g). Alles bleibt vor dem Speichern änderbar — Mengen, Name, Portionen, Text.',where:'Bibliothek / Wochenplan → ＋ Neues Rezept'},
    {icon:'\ud83d\udccb',text:'Ein Knopf für alle drei Wege zu einem Rezept: selbst zusammenstellen, aus dem Kochbuch fotografieren oder per Link aus dem Internet. Bisher gab es nur den Link-Weg, und ein Rezept von Hand konnte man nur anlegen, indem man erst eine Mahlzeit einträgt. „＋ Neues Rezept" steht jetzt in der Bibliothek und im Wochenplan.',where:'Mehr → \ud83d\udcda Bibliothek'},
  ]},
  {v:'0.243',items:[
    {icon:'\ud83e\udde9',text:'Die Kacheln auf „Heute" lassen sich jetzt selbst anordnen und ausblenden: Mehr → \ud83e\udde9 Kacheln auf „Heute". Am \u283f ziehen oder \u25b2\u25bc antippen sortiert, \ud83d\udc41 blendet aus. Betrifft Mahlzeiten, Sport, Wasser, Baby-Tagebuch, Postfach, Einkaufszettel und Fasten — die Kalorien-Übersicht bleibt immer oben. Ausgeblendet heißt nur unsichtbar: Eingetragenes bleibt erhalten und zählt weiter mit.',where:'Heute · Mehr → \ud83e\udde9 Kacheln'},
  ]},
  {v:'0.242',items:[
    {icon:'\ud83d\uded2',text:'„Setze Bananen auf meine Einkaufsliste“ verstand Alexa nicht — in den hinterlegten Satzmustern fehlten „meine“, „unsere“ und „Liste“. Jetzt sind alle üblichen Formulierungen drin: setzen, schreiben, packen, tun, jeweils mit Liste oder Zettel und mit oder ohne „meine“.',where:'Mehr → \ud83d\udde3\ufe0f Alexa-Einwurf'},
    {icon:'\u23ed\ufe0f',text:'Beim Starten sagt Alexa nur noch „NutriTrack gestartet“ statt jedes Mal die ganze Anleitung vorzulesen. Wer nicht weiterweiß, sagt „Hilfe“.',where:'Mehr → \ud83d\udde3\ufe0f Alexa-Einwurf'},
  ]},
  {v:'0.241',items:[
    {icon:'\ud83d\udde3\ufe0f',text:'Alexa hört jetzt auf „mein Tagebuch“ statt „nutri track“ — der alte Name wurde regelmäßig als „speck“ verstanden und die Sätze landeten als Durchsage auf allen Echos statt in der App. Neu ist auch ein Diktier-Modus: „Alexa, öffne mein Tagebuch“, dann mehrere Sachen hintereinander sagen, ohne jedes Mal den Namen zu wiederholen. „Stopp“ beendet.',where:'Mehr → \ud83d\udde3\ufe0f Alexa-Einwurf'},
    {icon:'\u2696\ufe0f',text:'Stückangaben werden realistisch gerechnet: „zwei Brötchen“ sind jetzt 100 g statt 200 g, ein Ei 60 g, ein Apfel 150 g. Vorher bekam jedes Stück pauschal 100 g — zwei Brötchen landeten damit bei 540 statt 270 Kalorien. Nur wo die App das Stückgewicht nicht kennt, bleibt es bei 100 g mit \ud83d\udde3\ufe0f-Markierung.',where:'Heute'},
  ]},
  {v:'0.240',items:[
    {icon:'\ud83d\udd27',text:'Die Token-Zeile war auf dem Handy zerschossen: Der Kopier-Knopf zog sich über die ganze Breite und quetschte das Eingabefeld zu einem schmalen Oval zusammen. Betraf den Alexa-Einwurf und den Sport-Sync gleichermaßen. Jetzt steht das Feld breit links, der \ud83d\udccb-Knopf schmal rechts daneben.',where:'Mehr → \ud83d\udde3\ufe0f Alexa-Einwurf / \ud83c\udfc3 Sport-Sync'},
  ]},
  {v:'0.239',items:[
    {icon:'\ud83d\udde3\ufe0f',text:'Die Alexa-Beispielsätze waren teilweise falsch: Alexa erlaubt in einem Satzmuster keine zwei Platzhalter gleichzeitig, weshalb „150 Gramm Reis zum Mittagessen“ so nicht ankam. Richtig ist jetzt „ich habe 150 Gramm Reis zum Mittagessen gegessen“, und Baby-Einträge beginnen mit dem Wort „Baby“ — also „Baby Windel gewechselt“. Die Liste unter Mehr → \ud83d\udde3\ufe0f Alexa-Einwurf zeigt die geprüften Sätze.',where:'Mehr → \ud83d\udde3\ufe0f Alexa-Einwurf'},
  ]},
  {v:'0.238',items:[
    {icon:'\ud83d\udde3\ufe0f',text:'Neu: Du kannst NutriTrack jetzt per Alexa füttern. „Alexa, sage NutriTrack, ich habe zwei Eier gegessen“ — und beim nächsten Öffnen der App steht es drin. Funktioniert für Essen, Wasser, Sport, Einkaufszettel und das Baby-Tagebuch. Einrichtung: Mehr → \ud83d\udde3\ufe0f Alexa-Einwurf, dort steht die Anleitung für den privaten Skill (einmalig, rund 15 Minuten, keine Zertifizierung nötig).',where:'Mehr → \ud83d\udde3\ufe0f Alexa-Einwurf'},
    {icon:'\u26a0\ufe0f',text:'Gesprochenes ohne Mengenangabe („ein Apfel“ statt „150 Gramm Apfel“) wird nicht geraten: Die App nimmt deine zuletzt verwendete Portion und markiert den Eintrag mit \ud83d\udde3\ufe0f. Antippen, Menge bestätigen — Markierung weg.',where:'Heute'},
    {icon:'\ud83d\udd12',text:'Alexa kann nur einwerfen, nichts vorlesen: Weder Tagessumme noch Ziel noch Verlauf verlassen dein Gerät. Der Server ist nur ein Briefkasten und wird nach dem Abholen sofort geleert.',where:'Mehr → \ud83d\udde3\ufe0f Alexa-Einwurf'},
  ]},
  {v:'0.237',items:[
    {icon:'\ud83d\udcec',text:'Das Postfach sitzt jetzt auf „Heute" oben rechts — mit kleiner Flagge, die zeigt, wie viele geteilte Mahlzeiten ungelesen sind. Der Knopf erscheint, sobald ihr gekoppelt seid. Daneben liegt 📤 zum Teilen des angezeigten Tages (vorher stand der neben dem Datum).',where:'Heute'},
    {icon:'\ud83d\udd17',text:'Ein Eingabefeld für alle Links: ＋ → 🔗 Link erkennt jetzt selbst, ob du einen Rezept-Link einer fremden Seite eingefügt hast oder eine geteilte NutriTrack-Sendung — Mahlzeit, Rezept, ganzer Tag oder Zeitraum. Der Knopf heißt entsprechend „Rezept laden" oder „Sendung öffnen". Beim Öffnen des Tabs wird ein passender Link aus der Zwischenablage gleich eingefügt; der 📥-Knopf in der Kopfzeile entfällt dafür. Über „Mehr → Code / Link einlösen" geht es weiterhin auch.',where:'＋ → 🔗 Link'},
  ]},
  {v:'0.236',items:[
    {icon:'\ud83d\udc6b',text:'Teilen ohne Link: Koppelt ihr eure Geräte einmalig über einen Code, steht im Teilen-Dialog oben „An <Partner> senden". Die Mahlzeit landet direkt im Postfach des anderen — kein Link, kein WhatsApp, kein Umweg über die Zwischenablage. Empfangenes wird weiterhin einzeln bestätigt, eure Tagebücher bleiben getrennt.',where:'Mehr → 👫 Partner'},
    {icon:'\ud83d\udcc5',text:'Ganze Tage teilen: Auf „Heute" liegt neben der Datumszeile ein 📤 — damit geht der komplette Tag mit allen vier Mahlzeiten raus. Im Verlauf hat jeder Tag denselben Knopf. Beim Übernehmen wählt der Empfänger, welche Mahlzeiten er will, auf welchen Tag sie sollen und ob Vorhandenes ergänzt oder ersetzt wird.',where:'Heute · Verlauf'},
    {icon:'\ud83d\uddd3',text:'Zeiträume teilen: Über 🗓 im Verlauf einen Zeitraum wählen (oder 7/14/30 Tage antippen) und alles in einer Sendung schicken. Vor dem Senden steht da, wie viele Tage, Posten und Kalorien drin sind; der Empfänger hakt einzelne Tage ab, die er nicht braucht.',where:'Verlauf → 🗓'},
  ]},
  {v:'0.235',items:[
    {icon:'\ud83d\ude34',text:'Schlaf über Mitternacht wird jetzt am Tageswechsel geteilt: Ein Schlaf von 22:50 bis 00:06 steht mit 22:50–24:00 beim Vortag und mit 00:00–00:06 beim Folgetag — beide Tage zeigen ihre eigene Schlafdauer. Vorher landete die ganze Nacht beim Vortag, und dort stand die verwirrende Spanne „22:50–00:06“. Läuft der Schlaf noch, taucht er nach Mitternacht auch am neuen Tag auf, samt „Wach jetzt“-Knopf.',where:'👶 Baby-Tagebuch'},
    {icon:'\ud83c\udf05',text:'Bleibt die App über Mitternacht offen, springt sie jetzt selbst auf den neuen Tag. Bisher blieb sie am alten Datum hängen — alles, was man nachts noch eintrug, landete beim Vortag. Wer bewusst zurückgeblättert hat, bleibt an seinem Tag.',where:'Heute'},
  ]},
  {v:'0.234',items:[
    {icon:'\ud83e\uddfe',text:'Sauberere Zutatennamen beim Rezept-Link-Import: Unbestimmte Mengenw\u00f6rter werden abgeschnitten \u2014 aus „etwas Kurkumapulver\u201c wird „Kurkumapulver\u201c. „ca. 200 g Mehl\u201c wird jetzt auch als 200 g erkannt statt als Name durchgereicht. Und verschachtelte Klammerzus\u00e4tze hinterlassen keine Reste mehr wie „Pflanzen\u00f6l )\u201c.',where:'\uff0b \u2192 Link'},
  ]},
  {v:'0.233',items:[
    {icon:'\ud83d\uded2',text:'Der Einkaufszettel blieb beim \u00d6ffnen leer, obwohl Artikel drauf waren \u2014 die Liste wurde gezeichnet, bevor das Fenster \u00fcberhaupt offen war, und der Untertitel stand deshalb auf „Noch nichts drauf\u201c. Erst die n\u00e4chste \u00c4nderung machte alles sichtbar. Behoben: Der Zettel zeigt seinen Inhalt jetzt sofort beim \u00d6ffnen.',where:'Mehr \u2192 \ud83d\uded2 Einkaufszettel'},
  ]},
  {v:'0.232',items:[
    {icon:'\ud83d\udd17',text:'Der Rezept-Link-Import holt die Rezeptdaten jetzt auch von gro\u00dfen, tr\u00e4gen Seiten zuverl\u00e4ssig: Die Seite wird komplett gelesen statt nach dem ersten halben Megabyte abgeschnitten \u2014 vorher fiel bei langen Seiten genau der Teil mit den Zutaten hinten runter, und die KI musste raten. Au\u00dferdem gibt sich der Abruf als normaler Browser aus, weil manche Portale sonst eine Bot-Sperrseite statt des Rezepts ausliefern.',where:'\uff0b \u2192 Link'},
    {icon:'\ud83d\udcac',text:'Klartext statt R\u00e4tselraten, wenn ein Link nicht klappt: Die App sagt jetzt, ob die Seite den Abruf blockiert, nicht antwortet oder das Proxy-Passwort fehlt. Blockiert eine Seite, wird die KI gar nicht erst darauf angesetzt \u2014 das sparte bisher nur Wartezeit f\u00fcr ein „Rezept konnte nicht erkannt werden".',where:'\uff0b \u2192 Link'},
  ]},
  {v:'0.230',items:[
    {icon:'🔗',text:'Der Rezept-Link-Import versteht jetzt fast jede Rezept-Seite und jeden Food-Blog, nicht nur Chefkoch: Die App liest zuerst die Rezeptdaten, die die Seite selbst mitliefert (Name, Zutaten, Zubereitung, Portionsangabe) — das ist genauer als vorher und braucht keine KI. Nur wenn eine Seite keine solchen Daten hat, liest die KI den Text rund um die Zutatenliste.',where:'＋ → Link'},
    {icon:'⚖️',text:'Küchenmaße werden in Gramm umgerechnet: „2 EL Olivenöl" wird zu 30 g, „1 Dose Tomaten" zu 400 g, „1 Prise Salz" zu 1 g. Zutatenliste und Einkaufszettel rechnen durchgängig in Gramm — im Supermarkt hilft eine Grammzahl mehr als ein Esslöffel. Zutaten ohne Mengenangabe (Salz, Pfeffer) sind wie gewohnt mit ⚠️ markiert und lassen sich von Hand ergänzen.',where:'＋ → Link'},
  ]},
  {v:'0.229',items:[
    {icon:'🛒',text:'Rezept-Link importieren und direkt einkaufen: Nach dem Laden eines Rezepts (z. B. von Chefkoch) fragt die App unter „Wohin damit?", ob du es eintragen, als Rezept speichern und/oder auf den Einkaufszettel legen willst — mehreres davon geht auch nacheinander. Die Zutaten landen mit der auf die Portionen gerechneten Menge auf dem Zettel.',where:'＋ → Link'},
    {icon:'🧾',text:'Der Einkaufszettel legt nichts doppelt an: Steht ein Artikel schon drauf, wird er nicht ein zweites Mal eingetragen, sondern bekommt den Rezeptnamen dazu. Unter dem Artikel steht dann, für welche Rezepte er gebraucht wird und ob er vorher schon auf dem Zettel stand. Mengen in gleicher Einheit werden addiert (200 g + 300 g = 500 g), unterschiedliche stehen nebeneinander.',where:'Einkaufszettel'},
  ]},
  {v:'0.228',items:[
    {icon:'🔄',text:'Der Einkaufszettel-Abgleich lief in „HTTP 503" – der Server hatte den Zettel-Zugang nicht freigeschaltet. Behoben. Fehlermeldungen beim Abgleich sind jetzt außerdem in Klartext statt als Fehlernummer.',where:'Einkaufszettel → 🔄 Teilen'},
  ]},
  {v:'0.227',items:[
    {icon:'🛒',text:'Neuer Einkaufszettel — wie eine Einkaufs-App: Artikel eintippen oder aus über 130 Kacheln auswählen, ein Tipp hakt sie im Laden ab. Alles sortiert sich von selbst nach Gängen (Obst & Gemüse, Milch & Käse, Haushalt …), Menge und Notiz lassen sich je Artikel ergänzen.',where:'Mehr → Einkaufszettel'},
    {icon:'🔄',text:'Den Zettel zu zweit führen: Über „🔄 Teilen" koppelst du ein zweites Gerät mit einem Code — danach sieht dein Partner sofort, was noch fehlt und was schon im Wagen liegt. Übertragen wird ausschließlich der Einkaufszettel, verschlüsselt. Der Code gilt nur für den Zettel; das Baby-Tagebuch bleibt getrennt.',where:'Einkaufszettel → 🔄 Teilen'},
    {icon:'📋',text:'Aus einem Rezept wird mit einem Tipp ein Einkaufszettel: In der Bibliothek beim Rezept auf 🛒, Portionen wählen, „Auf den Einkaufszettel" — alle Zutaten landen mit Menge auf dem geteilten Zettel.',where:'Bibliothek → Rezept → 🛒'},
  ]},
  {v:'0.226',items:[
    {icon:'😴',text:'Schlaf lässt sich jetzt eintragen, während das Baby noch schläft: Es genügt „Von" oder „Bis" — nicht mehr beides. Ein laufender Schlaf steht als „Schläft seit 13:00" in der Liste und bekommt einen „Wach jetzt"-Knopf, mit dem du das Ende später mit einem Tipp nachträgst. Ein Schnell-Knopf vom Typ Schlaf schaltet direkt zwischen einschlafen und aufwachen um.',where:'Baby-Tagebuch'},
  ]},
  {v:'0.225',items:[
    {icon:'🔄',text:'Baby-Tagebuch zu zweit führen: Über „🔄 Sync" koppelst du ein zweites Gerät mit einem Code — danach gleichen sich die Einträge automatisch ab. Übertragen wird ausschließlich das Baby-Tagebuch, verschlüsselt; Mahlzeiten, Kalorien und Gewicht bleiben auf deinem Gerät.',where:'Baby-Tagebuch → 🔄 Sync'},
    {icon:'⚙️',text:'Die Schnell-Knöpfe im Baby-Tagebuch sind jetzt frei einstellbar: eigene Knöpfe anlegen (z. B. „Flasche 120 ml" oder „Vitamin D"), Symbol und Beschriftung wählen, sortieren, löschen — oder alles auf die Werkseinstellung zurücksetzen.',where:'Baby-Tagebuch → ⚙️ Schnell-Knöpfe'},
  ]},
  {v:'0.224',items:[
    {icon:'🤱',text:'Stillzeit: Neben der Schwangerschaft kannst du jetzt auch angeben, dass du stillst — ausschließlich (+500 kcal/Tag) oder mit Beikost (+250 kcal/Tag). Der Zuschlag fließt in „Kalorienbedarf berechnen" ein. Beim Abnehmen wird das Defizit auf 500 kcal gedeckelt und das Ziel nie unter 1800 kcal gesetzt, damit die Milchmenge nicht leidet. Dazu ein Vorschlag fürs höhere Wasserziel.',where:'Mehr → Profil'},
    {icon:'🚦',text:'Eigene Lebensmittel-Ampel für die Stillzeit: bewertet deutlich liberaler als die Schwangerschafts-Ampel — Rohmilchkäse, Sushi und Salami sind beim Stillen grün. Gewarnt wird nur, wo es belegt ist (Alkohol, viel Koffein, quecksilberreiche Fische, Leber, milchhemmende Kräuter).',where:'Mehr → Profil'},
    {icon:'👶',text:'Neues Baby-Tagebuch: Stillen (welche Brust, wie lange), Flasche, Windeln inkl. Stuhlfarbe, Temperatur, Schlaf und Notizen — mit Schnell-Knöpfen für einen Tipp und einem Vorschlag, welche Brust als Nächstes dran ist. Aktivierbar für alle in den Einstellungen, unabhängig von Schwangerschaft und Stillzeit.',where:'Mehr → Profil → Baby-Tagebuch'},
  ]},
  {v:'0.223',items:[
    {icon:'📜',text:'Scrollen auf dem iPhone beruhigt: Wenn du ganz nach unten scrollst, springt die Ansicht nicht mehr von selbst an den Anfang zurück. Die Seite lässt sich außerdem nicht mehr über den Rand hinausziehen.',where:'App-weit'},
  ]},
  {v:'0.222',items:[
    {icon:'⌨️',text:'Eingabefelder bleiben beim Tippen sichtbar: Chat-Eingabe und Gramm-Felder rutschen auf dem iPhone nicht mehr hinter die Tastatur. Die untere Navigationsleiste blendet sich aus, solange die Tastatur offen ist.',where:'App-weit'},
  ]},
  {v:'0.221',items:[
    {icon:'🎯',text:'Manuell eingetragenes Kalorienziel bleibt nach App-Neustart erhalten — wird nicht mehr still vom Schwangerschafts-/ET-Zuschlag überschrieben. Über „Kalorienbedarf berechnen" kannst du die Automatik wieder einschalten.',where:'Mehr → Ziele'},
  ]},
  {v:'0.220',items:[
    {icon:'📱',text:'Die untere Navigationsleiste (Heute / Verlauf / + / Trends / Mehr) bleibt fest am unteren Bildschirmrand — sie rutscht auf dem iPhone nicht mehr in die Bildmitte.',where:'App-weit'},
  ]},
  {v:'0.218',items:[
    {icon:'🎙️',text:'Diktat beim Gedrückthalten überarbeitet: nutzt jetzt dieselbe Erkennungslogik wie der Kurz-Tipp — dadurch keine sich aufbauenden Wortwiederholungen mehr.',where:'Mahlzeit → ＋ → Chat'},
  ]},
  {v:'0.217',items:[
    {icon:'🎙️',text:'Diktat beim Gedrückthalten weiter verbessert: Wortdopplungen an Satzübergängen (besonders auf Android) werden jetzt zuverlässiger entfernt, absichtliche Wiederholungen bleiben möglich.',where:'Mahlzeit → ＋ → Chat'},
  ]},
  {v:'0.216',items:[
    {icon:'🛡️',text:'Lebensmittel ohne Nährwerte werden nicht mehr still mit 0 kcal eingetragen — die App erkennt das jetzt automatisch und schätzt realistische Werte oder fragt nach manueller Eingabe (Barcode).',where:'Mahlzeit → ＋'},
    {icon:'🎙️',text:'Diktat: Wortdopplung beim Gedrückthalten behoben — gesprochener Text wiederholt sich nicht mehr nach Pausen.',where:'Mahlzeit → ＋ → Chat'},
  ]},
  {v:'0.215',items:[
    {icon:'💾',text:'Fehler „Speicher voll" behoben: Wenn der Gerätespeicher knapp wurde, wurden neue Einträge teils nicht mehr gespeichert. Deine Tagebuch-Daten haben jetzt immer Vorrang — die App gibt bei Platzmangel automatisch verzichtbare Zwischenspeicher (alte Auto-Sicherungen, Such-Caches) frei, damit gespeichert wird. Auto-Sicherungen und Caches wachsen ausserdem nicht mehr unbegrenzt.',where:'automatisch'},
  ]},
  {v:'0.214',items:[
    {icon:'📷',text:'Bessere Foto-Erkennung: Die Foto-KI nutzt jetzt Qwen3-VL (qwen3-vl-plus) statt des Vorgängermodells — schärfere Bilderkennung, weiterhin automatisch die neueste Version. Nichts zu tun; dein Qwen-Key gilt unverändert.',where:'Mehr → 🤖 KI'},
  ]},
  {v:'0.213',items:[
    {icon:'📷',text:'Neue Foto-KI-Einstellung: Fotos werden jetzt standardmäßig von Qwen (qwen-vl-max — immer automatisch die neueste Version) erkannt, mit eigenem API-Key unter Mehr → 🤖 KI. Der Chat bleibt bei deinem bisherigen Anbieter; ohne Qwen-Key erkennt weiterhin Claude die Fotos.',where:'Mehr → 🤖 KI'},
  ]},
  {v:'0.212',items:[
    {icon:'🤖',text:'DeepSeek ist jetzt der vorausgewählte KI-Anbieter (Modell deepseek-chat — immer automatisch die neueste Version). Aktiv wird er mit eigenem API-Key unter Mehr → 🤖 KI; ohne Key läuft alles weiter über Anthropic. Auch Fotos gehen jetzt an DeepSeek — kann deren API sie nicht verarbeiten, springt automatisch Claude ein. Das Quellen-Badge unter dem Foto-Ergebnis zeigt jetzt ehrlich, wer das Bild erkannt hat.',where:'Mehr → 🤖 KI'},
  ]},
  {v:'0.211',items:[
    {icon:'🧭',text:'„Mehr" ist jetzt die zentrale Übersicht: Alle Einstellungs-Bereiche (Profil, Ziele, Ernährung, Erinnerungen, KI, Backup) sind als eigene Einträge direkt erreichbar — ein Tipp, ein Ziel. Die Bibliothek hat ein eigenes Fenster statt eines versteckten Einstellungs-Tabs.',where:'Mehr'},
  ]},
  {v:'0.210',items:[
    {icon:'🎙️',text:'Diktat: doppelte Wörter (v. a. auf dem iPhone) behoben — erneut gelieferte Erkennungs-Ergebnisse werden jetzt überschrieben statt angehängt.',where:'Mahlzeit → ＋ → Chat → 🎙️'},
  ]},
  {v:'0.209',items:[
    {icon:'🥚',text:'„Ei" ist jetzt ein rohes Ei mit eigenen Nährwerten — vorher landete fälschlich Rührei im Tagebuch. „Ei (gekocht)" und „Rührei" gibt es weiterhin.',where:'Suche & Chat'},
  ]},
  {v:'0.208',items:[
    {icon:'📷',text:'Mahlzeit-Fotos werden jetzt platzsparend in der Browser-Datenbank (IndexedDB) gespeichert — die „Speicher fast voll"-Warnung sollte damit Geschichte sein. Bestehende Fotos werden beim ersten Start automatisch umgezogen. Hinweis: Fotos sind gerätelokal und nicht mehr Teil der Backup-Datei.',where:'App-weit'},
  ]},
  {v:'0.207',items:[
    {icon:'📖',text:'Die Hilfe ist jetzt eine richtige, scrollbare Anleitung in der App (aufklappbare Themen, auch offline verfügbar) statt eines PDF-Fensters, das auf dem iPhone nur die erste Seite zeigte. Das PDF gibt es weiterhin als Download-Link.',where:'? · Hilfe'},
    {icon:'🎨',text:'Android-Splash-Screen und Task-Switcher zeigen jetzt die aktuellen App-Farben (Cream/Koralle) statt des alten Grüns; auch die Gewichtskurve in den Trends ist auf das neue Farbschema umgestellt und der Trend bezieht sich jetzt auf den angezeigten Chart-Zeitraum.',where:'System & Trends'},
    {icon:'⏰',text:'Ehrlicher Hinweis bei den Erinnerungen: Sie können technisch nur erscheinen, solange die App geöffnet ist.',where:'Einstellungen · Erinnerungen'},
  ]},
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
