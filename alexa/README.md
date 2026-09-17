# Alexa-Einwurf für NutriTrack

Ein privater Alexa-Skill, der Gesprochenes an NutriTrack weitergibt. **Einbahnstraße:**
Alexa kann einwerfen, aber nichts vorlesen — der Worker kennt weder Tagessummen noch
Ziele noch Verlauf.

## Wie es läuft

```
"Alexa, sage NutriTrack, ich habe zwei Eier gegessen"
  → Skill (Alexa-hosted Lambda)
  → POST /alexa/inbox   (Cloudflare Worker, Header X-User-Token)
  → KV-Briefkasten  ai:<token>:<id>
  → PWA holt beim Öffnen ab, trägt lokal ein, quittiert
  → Worker löscht den Einwurf
```

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

| Variable | Wert |
|---|---|
| `NUTRITRACK_TOKEN` | das Token aus Schritt 1 |
| `NUTRITRACK_ENDPOINT` | `https://<dein-worker>.workers.dev/alexa/inbox` |

Findet die Alexa-Konsole keine Stelle für Umgebungsvariablen, trag die Werte direkt
oben in `index.js` ein (`const TOKEN = '…'`). Der Code liegt in deinem privaten Skill —
niemand sonst sieht ihn.

### 6. Testen

Reiter „Test" → Stufe auf **„Development"** stellen → tippen oder sprechen:
„sage nutri track ich habe zwei Eier gegessen".

Der Skill läuft ab jetzt auf allen Echo-Geräten deines Kontos. **Eine Zertifizierung ist
nicht nötig**, solange du ihn nicht veröffentlichst.

## Sprachbefehle

| Was | Beispiel |
|---|---|
| Essen | „Alexa, sage NutriTrack, ich habe zwei Eier und ein Brötchen gegessen" |
| Essen mit Mahlzeit | „Alexa, sage NutriTrack, 150 Gramm Reis zum Mittagessen" |
| Wasser | „Alexa, sage NutriTrack, ich habe zwei Gläser Wasser getrunken" |
| Sport | „Alexa, sage NutriTrack, ich war 30 Minuten joggen" |
| Einkaufszettel | „Alexa, sage NutriTrack, setz Milch auf den Einkaufszettel" |
| Baby | „Alexa, sage NutriTrack, Windel gewechselt" |
| Baby mit Menge | „Alexa, sage NutriTrack, 120 Milliliter Flasche" |

Der Aufruf-Name (`sage NutriTrack`) ist Pflicht. Ohne ihn („Alexa, ich habe einen Apfel
gegessen") bräuchte es Name-Free Interaction — das erfordert eine Freigabe durch Amazon.

## Grenzen, die man kennen sollte

- **Mengen.** Wird keine Menge gesprochen („ein Apfel" statt „150 Gramm Apfel"), rät die
  App nicht: Sie nimmt die zuletzt verwendete Portion (oder 100 g) und markiert den
  Eintrag mit 🗣️. Antippen, Menge bestätigen, Markierung verschwindet.
- **Spracherkennung.** Freie Lebensmittelnamen sind der wackligste Teil. „Skyr" wird
  gern zu „Skier". In der App korrigierbar.
- **Baby-Tagebuch.** Einwürfe landen nur im Tagebuch, wenn es in NutriTrack eingeschaltet
  ist. Sonst werden sie verworfen.
- **Kein Vorlesen.** Bewusst. Dafür müsste die App ihren Tagesstand im Klartext auf den
  Server spiegeln — das widerspricht dem local-first-Prinzip von NutriTrack.

## Datenschutz

Gesprochenes kommt zwangsläufig im Klartext beim Worker an; eine
Ende-zu-Ende-Verschlüsselung wie beim Baby-Sync ist unmöglich, weil Alexa den Schlüssel
nicht kennt. Deshalb:

- Die PWA **löscht** jeden Einwurf nach dem Eintragen (`POST /alexa/ack`) — im Normalfall
  liegt er Minuten im KV, nicht Wochen.
- Was nie abgeholt wird, verfällt nach 30 Tagen automatisch.
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
`codeVersion: "v0.236-alexa-inbox"` melden.
