# Alexa-Einwurf für NutriTrack

Ein privater Alexa-Skill, der Gesprochenes an NutriTrack weitergibt. **Einbahnstraße:**
Alexa kann einwerfen, aber nichts vorlesen — der Worker kennt weder Tagessummen noch
Ziele noch Verlauf.

## Wie es läuft

```
"Alexa, öffne mein Tagebuch" → "Ich habe zwei Eier gegessen"
  → Skill (Alexa-hosted Lambda)
  → POST /alexa/inbox   (Cloudflare Worker, Header X-User-Token)
  → KV-Briefkasten  ai:<token>:<id>
  → PWA holt beim Öffnen ab, trägt lokal ein, quittiert
  → Worker löscht den Einwurf
```

**Zwei Briefkästen (ab v0.244).** Essen, Sport und Wasser sind persönlich und gehen an das
Token der Person, die gesprochen hat (Alexa-Stimmprofil). Baby-Tagebuch und Einkaufszettel
gehören beiden Partnern und gehen an ein **Familien-Token**, das auf beiden Telefonen
eingetragen ist — beide Geräte holen dieselben Einwürfe ab. Damit derselbe Einwurf nicht
zweimal auf dem Zettel bzw. im Tagebuch landet, leitet sich die Eintrags-ID aus der
Alexa-ID ab; Baby- und Einkaufs-Sync führen sie als denselben Eintrag zusammen.
Geteilte Einwürfe werden deshalb **nicht** beim Abholen gelöscht, sondern verfallen nach
48 Stunden.

Der Einwurf erscheint **nicht sofort**. Eine PWA läuft nicht im Hintergrund; sie holt beim
App-Start und bei jeder Rückkehr in den Vordergrund ab.

## Einrichtung (einmalig, ~15 Minuten)

### 1. Token in NutriTrack erzeugen

Mehr → 🗣️ Alexa-Einwurf → „🎲 Neu erzeugen" → „Speichern ✓". Token und Endpunkt-URL
stehen dort zum Kopieren.

### 2. Skill anlegen

1. [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask) öffnen —
   mit **demselben Amazon-Konto wie dein Echo**, sonst erscheint der Skill dort nicht.
2. „Skill erstellen":
   - Name: `NutriTrack`
   - Sprache: **Deutsch (DE)**
   - Modell: **Custom**
   - Hosting: **Alexa-hosted (Node.js)**

### 3. Sprachmodell einspielen

Build → „JSON Editor" → Inhalt von [`interaction-model.de-DE.json`](interaction-model.de-DE.json)
einfügen → „Save Model" → **„Build Model"** (dauert 1–2 Minuten).

### 4. Code einspielen

Code → `index.js` durch [`lambda/index.js`](lambda/index.js) ersetzen → „Deploy".

### 5. Token hinterlegen

Im Code-Reiter die beiden Umgebungsvariablen setzen:

| Variable | Pflicht | Wert |
|---|---|---|
| `NUTRITRACK_TOKEN` | ja | dein persönliches Token aus Schritt 1 |
| `NUTRITRACK_ENDPOINT` | ja | `https://<dein-worker>.workers.dev/alexa/inbox` |
| `NUTRITRACK_FAMILY_TOKEN` | nur zu zweit | das Familien-Token aus Schritt 1 (Baby + Einkauf) |
| `NUTRITRACK_PERSONS` | nur zu zweit | `amzn1.ask.person.AAA=token1;amzn1.ask.person.BBB=token2` |

Findet die Alexa-Konsole keine Stelle für Umgebungsvariablen, trag die Werte direkt
oben in `index.js` ein (`const TOKEN = '…'`). Der Code liegt in deinem privaten Skill —
niemand sonst sieht ihn.

### 6. Testen

Reiter „Test" → Stufe auf **„Development"** stellen → tippen oder sprechen:
„sage mein tagebuch ich habe zwei Eier gegessen".

Der Skill läuft ab jetzt auf allen Echo-Geräten deines Kontos. **Eine Zertifizierung ist
nicht nötig**, solange du ihn nicht veröffentlichst.

### 7. Zu zweit nutzen (optional)

**Geteilt:** Baby-Tagebuch und Einkaufszettel. In NutriTrack unter Mehr → 🗣️ Alexa-Einwurf
ein **Familien-Token** erzeugen, auf **beiden** Telefonen dasselbe eintragen und im Skill
als `NUTRITRACK_FAMILY_TOKEN` hinterlegen. Ab dann sieht jeder jeden Einwurf, sobald er
seine App öffnet — unabhängig davon, wer gesprochen hat.

**Getrennt:** Kalorien, Wasser, Sport. Jede Person erzeugt in ihrer App ein eigenes
persönliches Token. Damit der Skill weiß, wer spricht, braucht jede Person ein
**Stimmprofil** („Alexa, lerne meine Stimme kennen"). So findest du die Kennungen:

1. Beide sprechen je einen Satz, z. B. „Alexa, sage mein Tagebuch, ich habe einen Apfel gegessen".
2. Alexa Developer Console → Reiter **Code** → **Logs** (CloudWatch).
3. Je Anfrage steht dort `[nutritrack] personId: amzn1.ask.person.…` — beide Kennungen kopieren.
4. Umgebungsvariable setzen:
   `NUTRITRACK_PERSONS=amzn1.ask.person.AAA=TokenPersonA;amzn1.ask.person.BBB=TokenPersonB`

Ohne `NUTRITRACK_PERSONS` landen Essen, Sport und Wasser immer beim Token aus
`NUTRITRACK_TOKEN`; eine nicht erkannte Stimme fällt ebenfalls dorthin zurück.

## Sprachbefehle

### Diktier-Modus — der bequeme Weg

```
"Alexa, starte mein Tagebuch"
  → "NutriTrack gestartet."
"Ich habe zwei Brötchen gegessen"   → "Notiert. Was noch?"
"Zwei Gläser Wasser"                → "Notiert. Was noch?"
"Setz Milch auf den Einkaufszettel" → "Notiert. Was noch?"
"Stopp"                             → "Okay."
```

Der Aufrufname fällt nur einmal — danach diktierst du frei. Technisch hängt das
an `session.new`: Ein Einzelbefehl kommt mit `new: true` an und wird nach einem
Satz geschlossen, ein Dialog nach „öffne" mit `new: false` und bleibt offen.

### Einzelne Einträge

| Was | Beispiel |
|---|---|
| Essen | „Alexa, sage mein Tagebuch, ich habe zwei Eier und ein Brötchen gegessen" |
| Essen mit Mahlzeit | „Alexa, sage mein Tagebuch, ich habe 150 Gramm Reis zum Mittagessen gegessen" |
| Essen, kurz | „Alexa, sage mein Tagebuch, trag einen Apfel ein" |
| Wasser | „Alexa, sage mein Tagebuch, ich habe zwei Gläser Wasser getrunken" |
| Sport | „Alexa, sage mein Tagebuch, ich war 30 Minuten joggen" |
| Einkaufsliste | „Setze Bananen auf meine Einkaufsliste" |
| Einkaufsliste | „Schreib Milch auf den Einkaufszettel" |
| Einkaufsliste | „Wir brauchen Klopapier" · „Kauf Butter ein" |
| Baby | „Alexa, sage mein Tagebuch, Baby Windel gewechselt" |
| Baby mit Menge | „Alexa, sage mein Tagebuch, Baby 120 Milliliter Flasche" |
| Baby, Seite | „Alexa, sage mein Tagebuch, Baby gestillt links" |

### Warum der Aufrufname „mein tagebuch" heißt

Der erste Name war „nutri track". Am echten Echo verstand Alexa daraus „speck" —
und weil „Alexa, **sage** …" im Deutschen zugleich der Befehl für eine Durchsage
ist, landete der Satz als Ankündigung auf allen Echos statt im Skill. Ein
deutsches, geläufiges Wortpaar wird deutlich zuverlässiger erkannt. Wer den Namen
ändert, ändert ihn in `interaction-model.de-DE.json` (`invocationName`) und muss
das Modell neu bauen.

Der Aufruf-Name (`sage mein Tagebuch`) ist Pflicht. Ohne ihn („Alexa, ich habe einen Apfel
gegessen") bräuchte es Name-Free Interaction — das erfordert eine Freigabe durch Amazon.

Haupt- und Nebensatz gehen beide: „sage mein Tagebuch, **ich habe** zwei Brötchen **gegessen**"
ebenso wie „sage mein Tagebuch, **dass ich** zwei Brötchen **gegessen habe**". Passt ein Satz zu
keinem Befehl, nennt der Skill ein Beispiel, statt nur „nicht verstanden" zu sagen.

**Baby-Einträge beginnen immer mit dem Wort „Baby".** Das ist keine Schikane, sondern eine
Folge der Alexa-Regel unten: Ohne ein festes Wort vor dem Freitext kann Alexa den Satz
keinem Intent zuordnen.

### Warum Menge und Uhrzeit mit im Satz stehen

Alexa verbietet, dass ein Freitext-Slot (`AMAZON.SearchQuery`) mit einem zweiten Slot in
derselben Beispielphrase steht — „{food} zum {meal}" wird beim Build abgelehnt
(*„cannot include both a phrase slot and another intent slot"*). Menge, Dauer, Mahlzeit
und Milliliter kommen deshalb als Teil des Freitexts an und werden in
[`lambda/index.js`](lambda/index.js) (`extractMeal`, `extractMinutes`, `extractUnit`)
bzw. in `js/alexa-sync.js` (`parseAmount`) herausgelöst. Wer das Sprachmodell erweitert,
muss diese Regel einhalten — sonst schlägt „Build Model" fehl.

### Formulierungen der Einkaufsliste

Alle Kombinationen aus **setz / setze / schreib / schreibe / pack / packe / tu / tue**
und **auf den Einkaufszettel / auf die Einkaufsliste / auf meine Einkaufsliste /
auf meinen Einkaufszettel / auf unsere Einkaufsliste / auf die Liste / auf meine Liste /
auf den Zettel / auf meinen Zettel** sind hinterlegt, dazu „wir brauchen …",
„ich brauche …" und „kauf … ein". Der erste Anlauf hatte nur „auf den
Einkaufszettel" und „auf die Einkaufsliste" — „Setze Bananen auf **meine**
Einkaufsliste" fiel deshalb durch. Beim Ergänzen: lieber die Kombinatorik
aufspannen als einzelne Sätze raten.

## Wenn etwas nicht klappt

Der Skill nennt die Ursache in der Sprachantwort, statt pauschal zu scheitern:

| Alexa sagt | Ursache | Lösung |
|---|---|---|
| „Ich weiß nicht, wie ich dir dabei helfen kann" | Der Skill wurde gar nicht aufgerufen — Sprachmodell fehlt oder ist nicht gebaut | Build → JSON Editor → Modell einfügen → Save → **Build Model** |
| „Das habe ich nicht zuordnen können …" | Der Skill läuft, aber der Satzbau passt zu keinem Befehl | eine Formulierung aus der Tabelle oben nehmen |
| „Der Skill ist noch nicht eingerichtet" | `TOKEN` oder `ENDPOINT` ist leer | Code-Reiter, die zwei Zeilen oben ausfüllen, Deploy |
| „Das Token im Skill passt nicht zu dem in NutriTrack" | HTTP 401 — die beiden Token sind verschieden | Mehr → 🗣️ Alexa-Einwurf, Token vergleichen |
| „Die Endpunkt-Adresse stimmt nicht" | HTTP 404 — die URL endet nicht auf `/alexa/inbox` | `ENDPOINT` korrigieren |
| „Der NutriTrack-Server ist nicht vollständig eingerichtet" | HTTP 503 — dem Worker fehlt der KV-Namespace | `GET /health` prüfen, `alexaInboxConfigured` muss `true` sein |
| „Ich erreiche den NutriTrack-Server gerade nicht" | Zeitüberschreitung oder Netzfehler | Worker-URL im Browser aufrufen |
| „Der Server hat mit Fehler NNN geantwortet" | unerwarteter HTTP-Code | `GET /health` und CloudWatch Logs ansehen |

Mehr Details stehen in den CloudWatch Logs (Code-Reiter → „CloudWatch Logs").

## Grenzen, die man kennen sollte

- **Mengen.** Wird keine Grammzahl gesprochen, geht die App in drei Stufen vor:
  zuletzt verwendete Portion → übliches Stückgewicht (Brötchen 50 g, Ei 60 g,
  Apfel 150 g …, Tabelle `PIECE_G` in `js/alexa-sync.js`) → 100 g. Nur die letzte
  Stufe ist geraten und bekommt die 🗣️-Markierung; antippen, Menge bestätigen,
  Markierung verschwindet. Vorher bekam jedes Stück pauschal 100 g — „zwei
  Brötchen" landeten damit bei 540 statt 270 Kalorien.
- **Spracherkennung.** Freie Lebensmittelnamen sind der wackligste Teil. „Skyr" wird
  gern zu „Skier". In der App korrigierbar.
- **Baby-Tagebuch.** Einwürfe landen nur im Tagebuch, wenn es in NutriTrack eingeschaltet
  ist. Sonst werden sie verworfen.
- **Auch geteilt nicht live.** Ein Einwurf erscheint erst, wenn **eines** der beiden
  Telefone die App öffnet. Wer spricht, hat sein Telefon meist dabei — sein Gerät holt ab
  und reicht es über den Baby-/Einkaufs-Sync ans andere weiter.
- **Kein Vorlesen.** Bewusst. Dafür müsste die App ihren Tagesstand im Klartext auf den
  Server spiegeln — das widerspricht dem local-first-Prinzip von NutriTrack.

## Datenschutz

Gesprochenes kommt zwangsläufig im Klartext beim Worker an; eine
Ende-zu-Ende-Verschlüsselung wie beim Baby-Sync ist unmöglich, weil Alexa den Schlüssel
nicht kennt. Deshalb:

- Die PWA **löscht** jeden persönlichen Einwurf nach dem Eintragen (`POST /alexa/ack`) —
  im Normalfall liegt er Minuten im KV, nicht Wochen.
- **Geteilte Einwürfe** (Baby, Einkauf) müssen zwei Geräte erreichen und werden deshalb
  nicht quittiert, sondern verfallen nach **48 Stunden**. Länger liegt auch hier nichts.
- Was nie abgeholt wird, verfällt spätestens nach 30 Tagen automatisch.
- Der Briefkasten enthält nur, was du diktiert hast — keine Historie, keine Summen,
  kein Gewicht, kein Profil.

Amazon speichert Sprachaufnahmen unabhängig davon nach den eigenen Alexa-Einstellungen.
Wer das nicht will, findet die Löschoptionen in der Alexa-App unter
Einstellungen → Alexa-Datenschutz.

## Worker

Die Endpunkte liegen in [`../worker/src/index.js`](../worker/src/index.js)
(`handleAlexaPush` / `handleAlexaPull` / `handleAlexaAck`). Nach einer Änderung dort:

```bash
cd worker && wrangler deploy
```

Prüfen: `GET /health` muss `alexaInboxConfigured: true` und
`codeVersion: "v0.244-alexa-family"` melden. **Ohne dieses Deploy bleibt der Familien-Briefkasten wirkungslos** — ein älterer Worker löscht geteilte Einwürfe beim ersten Abholen, das zweite Telefon geht dann leer aus.
