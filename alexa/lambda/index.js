// NutriTrack — Alexa Skill (Alexa-hosted Lambda, Node.js 18+)
//
// Der Skill ist ein reiner Briefträger: Er nimmt entgegen, was gesprochen
// wurde, und schickt es an `POST /alexa/inbox` des NutriTrack-Workers. Er liest
// nichts aus, rechnet nichts aus und hält keinen Zustand — Alexa kann deshalb
// auch nichts über deine Ernährung verraten.
//
// Zwei Umgebungsvariablen sind Pflicht (Alexa Developer Console → Code →
// "Environment variables", oder direkt hier eintragen):
//   NUTRITRACK_TOKEN     — persönliches Token aus NutriTrack (Mehr → Alexa-Einwurf)
//   NUTRITRACK_ENDPOINT  — z. B. https://…workers.dev/alexa/inbox
//
// Optional, für zwei Personen mit einem Echo:
//   NUTRITRACK_FAMILY_TOKEN — Familien-Token: Baby-Tagebuch und Einkaufszettel
//       gehen dorthin und erreichen damit BEIDE Telefone. Fehlt die Variable,
//       läuft alles wie bisher über NUTRITRACK_TOKEN.
//   NUTRITRACK_PERSONS — Zuordnung Alexa-Stimmprofil → persönliches Token,
//       Format: "amzn1.ask.person.AAA=token1;amzn1.ask.person.BBB=token2"
//       (Semikolon, Komma oder Zeilenumbruch trennen). Damit landen Essen,
//       Sport und Wasser bei der Person, die gesprochen hat. Eine unbekannte
//       oder nicht erkannte Stimme fällt auf NUTRITRACK_TOKEN zurück.
//       Die personId steht im Log jeder Anfrage (Alexa Console → Code → Logs).
//
// Kein npm-Paket nötig: Der Aufruf läuft über das eingebaute `https`-Modul —
// bewusst NICHT über `fetch`, das es erst ab Node 18 gibt und in der
// Alexa-hosted Laufzeit fehlen kann. Die Alexa-Requests verifiziert die
// Laufzeit selbst.

const TOKEN = process.env.NUTRITRACK_TOKEN || '';
const ENDPOINT = process.env.NUTRITRACK_ENDPOINT || '';
const FAMILY_TOKEN = process.env.NUTRITRACK_FAMILY_TOKEN || '';

// Geteilte Töpfe: Baby-Tagebuch und Einkaufszettel gehören beiden Partnern und
// gehen deshalb in den Familien-Briefkasten, den beide Telefone abholen.
// Alles andere (Essen, Sport, Wasser) ist persönlich.
const SHARED_KINDS = new Set(['baby', 'shop']);

// "personId=token;personId2=token2" → Map. Einmal beim Kaltstart geparst.
const PERSON_TOKENS = (() => {
  const map = new Map();
  for (const part of String(process.env.NUTRITRACK_PERSONS || '').split(/[;,\n]+/)) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const person = part.slice(0, i).trim();
    const token = part.slice(i + 1).trim();
    if (person && token) map.set(person, token);
  }
  return map;
})();

// Wer spricht? Alexa liefert die personId nur, wenn die Person ein Stimmprofil
// eingerichtet hat ("Alexa, lerne meine Stimme kennen"). Ohne Profil bleibt das
// Feld leer — dann gilt der Standard-Token.
function tokenFor(kind, personId) {
  if (SHARED_KINDS.has(kind)) return FAMILY_TOKEN || TOKEN;
  if (personId && PERSON_TOKENS.has(personId)) return PERSON_TOKENS.get(personId);
  return TOKEN;
}

// ── Alexa-Grundgerüst ──
function say(text, endSession = true) {
  return {
    version: '1.0',
    response: {
      outputSpeech: { type: 'PlainText', text },
      shouldEndSession: endSession,
    },
  };
}

function slot(request, name) {
  const s = request?.intent?.slots?.[name];
  const v = s && typeof s.value === 'string' ? s.value.trim() : '';
  return v;
}

// Zahlwörter, die Alexa als Text statt als Ziffer liefert.
const NUMWORDS = {
  ein: 1, eine: 1, einen: 1, eins: 1, zwei: 2, drei: 3, vier: 4, fünf: 5,
  sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12,
};
function toNumber(raw) {
  if (!raw) return null;
  const t = String(raw).trim().toLowerCase();
  const direct = Number(t.replace(',', '.'));
  if (Number.isFinite(direct)) return direct;
  return NUMWORDS[t] ?? null;
}

// Alexa erlaubt in einer Beispielphrase mit AMAZON.SearchQuery KEINEN zweiten
// Slot ("cannot include both a phrase slot and another intent slot"). Mahlzeit,
// Dauer und Menge stehen deshalb mit im Freitext und werden hier herausgelöst.
const MEAL_MAP = {
  frühstück: 'breakfast', fruehstueck: 'breakfast', morgens: 'breakfast',
  mittag: 'lunch', mittagessen: 'lunch', mittags: 'lunch',
  abendessen: 'dinner', abendbrot: 'dinner', abends: 'dinner',
  snack: 'snack', zwischendurch: 'snack', zwischenmahlzeit: 'snack',
};

// "150 Gramm Reis zum Mittagessen" -> {meal:'lunch', text:'150 Gramm Reis'}
function extractMeal(raw) {
  const text = String(raw || '');
  let m = text.match(/\s*\b(?:zum|zur|beim|am|als)\s+(frühstück|fruehstueck|mittagessen|mittag|abendessen|abendbrot|snack|zwischenmahlzeit)\b\s*/i);
  if (!m) m = text.match(/\s*\b(morgens|mittags|abends|zwischendurch)\b\s*/i);
  if (!m) return { meal: null, text: text.trim() };
  const key = m[1].toLowerCase();
  return {
    meal: MEAL_MAP[key] || null,
    // Die Zeitangabe raus, damit sie nicht als Lebensmittel gedeutet wird.
    text: (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim(),
  };
}

// "30 Minuten joggen" oder "joggen 30 Minuten" -> {minutes:30, text:'joggen'}
function extractMinutes(raw) {
  const text = String(raw || '');
  const m = text.match(/\s*\b(\d{1,4}|ein|eine|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf)\s*(?:min|minuten|minute)\b\s*/i);
  if (!m) return { minutes: null, text: text.trim() };
  const n = toNumber(m[1]);
  return {
    minutes: n,
    text: (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length))
      .replace(/\s+/g, ' ').replace(/^\s*(?:lang|für|fuer)\s+/i, '').trim(),
  };
}

// "120 Milliliter Flasche" -> 120 ; "38,5 Grad" -> 38.5
function extractUnit(raw, re) {
  const m = String(raw || '').match(re);
  return m ? toNumber(m[1]) : null;
}

const https = require('https');

// POST über das eingebaute https-Modul. Läuft auf jeder Node-Version, die die
// Alexa-hosted Umgebung anbietet — `fetch` gibt es dort erst ab Node 18 und
// sein Fehlen äußerte sich vorher als stummes "hat nicht geklappt".
function postJson(urlStr, headers, bodyStr) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(urlStr);
    } catch (e) {
      reject(new Error('bad_endpoint'));
      return;
    }
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: 'POST',
        headers: Object.assign({}, headers, {
          'Content-Length': Buffer.byteLength(bodyStr),
        }),
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on('error', (e) => reject(new Error('network: ' + (e && e.message))));
    req.setTimeout(8000, () => { req.destroy(new Error('timeout')); });
    req.write(bodyStr);
    req.end();
  });
}

async function push(payload, ctx) {
  if (!TOKEN || !ENDPOINT) {
    throw new Error('not_configured');
  }
  const token = tokenFor(payload && payload.kind, ctx && ctx.personId);
  const body = {
    // Eindeutige ID pro Einwurf: NutriTrack erkennt daran Doppel-Einträge,
    // falls eine Quittung verloren geht.
    id: 'ax' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    ts: Date.now(),
    ...payload,
  };
  const res = await postJson(
    ENDPOINT,
    { 'X-User-Token': token, 'Content-Type': 'application/json' },
    JSON.stringify(body)
  );
  if (res.status < 200 || res.status >= 300) {
    // Der Status wandert mit in die Sprachantwort: Bei einem privaten Skill ist
    // ein sprechender Fehler mehr wert als eine hübsche, nutzlose Entschuldigung.
    throw new Error('http_' + res.status);
  }
  return true;
}

// Eine Bestätigung, die NICHTS verrät: keine Kalorien, keine Tagessumme.
// Der Skill kennt diese Zahlen auch gar nicht.
//
// `keepOpen` entscheidet über den Bedienmodus: Ein Einzelbefehl
// ("Alexa, sage mein Tagebuch, ich habe X gegessen") kommt mit session.new=true
// an und ist nach einem Satz fertig. Nach "Alexa, öffne mein Tagebuch" läuft
// dieselbe Sitzung weiter — dann bleibt sie offen und man diktiert mehrere
// Einträge hintereinander, ohne den Aufrufnamen zu wiederholen.
function confirm(what, keepOpen) {
  if (keepOpen) return say(what + ' Notiert. Was noch?', false);
  return say(what + ' Ich habe es in NutriTrack notiert.');
}
// Klartext statt Rätselraten. Die Meldungen nennen die Ursache, nicht das Token.
function failed(err) {
  const msg = String((err && err.message) || '');
  if (msg === 'http_401') {
    return say('Das Token im Skill passt nicht zu dem in NutriTrack. Vergleich die beiden in den Einstellungen.');
  }
  if (msg === 'http_400') {
    return say('Der Server hat die Eingabe abgelehnt. Sag es bitte etwas anders.');
  }
  if (msg === 'http_403') {
    return say('Der Server hat den Zugriff verweigert.');
  }
  if (msg === 'http_404') {
    return say('Die Endpunkt-Adresse stimmt nicht. Sie muss auf alexa Schrägstrich inbox enden.');
  }
  if (msg === 'http_503') {
    return say('Der NutriTrack-Server ist nicht vollständig eingerichtet.');
  }
  if (msg.indexOf('http_') === 0) {
    return say('Der Server hat mit Fehler ' + msg.slice(5) + ' geantwortet.');
  }
  if (msg === 'bad_endpoint') {
    return say('Die Endpunkt-Adresse im Skill ist keine gültige Internetadresse.');
  }
  if (msg === 'timeout' || msg.indexOf('network') === 0) {
    return say('Ich erreiche den NutriTrack-Server gerade nicht.');
  }
  return say('Das hat gerade nicht geklappt. Versuch es später nochmal.');
}

// Frage an die Hebamme: Sie reist als Baby-Notiz mit Kennzeichen `babyP.mw`,
// nicht als eigener Typ. So braucht der Worker kein Update, und eine ältere
// App, die das Kennzeichen nicht kennt, legt sie wenigstens als Notiz ins
// Tagebuch, statt sie zu verwerfen.
// "ob sie Fencheltee trinken darf" → "Ob sie Fencheltee trinken darf?"
function midwifeText(raw) {
  let t = String(raw || '').trim()
    .replace(/^(?:frage\s+)?(?:an|für)\s+die\s+hebamme\s*/i, '')
    .replace(/^(?:hebamme|frage|fragen|habe|hab)[,:]?\s+/i, '')
    .trim();
  if (!t) return '';
  // Sprach-Eingaben sind nicht begrenzt, der Worker schneidet bei 500 ab —
  // hier schon, damit das Fragezeichen nicht mit abgeschnitten wird.
  t = t.slice(0, 499);
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (!/[?.!]$/.test(t)) t += '?';
  return t;
}

// Nur "Hebamme" gesagt: Alexa fragt nach und legt die nächste Antwort
// wörtlich in den Slot `question` (Dialog-Modell im Sprachmodell). Ohne diesen
// Schritt landete die Frage als eigener Satz im Fallback, weil sie keinem
// Satzmuster entspricht. `mwOneShot` merkt sich, dass der Nutzer mit einem
// Einzelbefehl kam — nach der Frage wird dann geschlossen, nicht "Was noch?".
function elicitMidwife(ctx) {
  return {
    version: '1.0',
    sessionAttributes: { mwOneShot: Boolean(ctx.oneShot) },
    response: {
      outputSpeech: { type: 'PlainText', text: 'Was möchtest du die Hebamme fragen?' },
      reprompt: { outputSpeech: { type: 'PlainText', text: 'Sag mir deine Frage an die Hebamme.' } },
      shouldEndSession: false,
      directives: [{
        type: 'Dialog.ElicitSlot',
        slotToElicit: 'question',
        updatedIntent: {
          name: 'MidwifeQuestionIntent',
          confirmationStatus: 'NONE',
          slots: { question: { name: 'question', confirmationStatus: 'NONE' } },
        },
      }],
    },
  };
}
async function pushMidwife(raw, keepOpen, ctx) {
  const q = midwifeText(raw);
  if (!q) return elicitMidwife(ctx);
  await push({ kind: 'baby', babyType: 'note', text: q, babyP: { mw: 1 } }, ctx);
  return confirm('Frage an die Hebamme.', keepOpen);
}

// ── Intents ──
const HANDLERS = {
  async LogMealIntent(request, keepOpen, ctx) {
    const spoken = slot(request, 'food');
    if (!spoken) return say('Was hast du gegessen?', false);
    const { meal, text } = extractMeal(spoken);
    if (!text) return say('Was hast du gegessen?', false);
    const payload = { kind: 'meal', text };
    if (meal) payload.meal = meal;
    await push(payload, ctx);
    return confirm(text + '.', keepOpen);
  },

  async LogWaterIntent(request, keepOpen, ctx) {
    const n = toNumber(slot(request, 'count')) || 1;
    await push({ kind: 'water', text: n + ' Glas Wasser', qty: n }, ctx);
    return confirm(n === 1 ? 'Ein Glas Wasser.' : n + ' Gläser Wasser.', keepOpen);
  },

  async LogExerciseIntent(request, keepOpen, ctx) {
    const spoken = slot(request, 'activity');
    if (!spoken) return say('Was hast du gemacht?', false);
    const { minutes, text } = extractMinutes(spoken);
    const activity = text || spoken;
    const payload = { kind: 'exercise', text: activity };
    if (minutes) payload.durationMin = Math.round(minutes);
    await push(payload, ctx);
    return confirm(minutes ? minutes + ' Minuten ' + activity + '.' : activity + '.', keepOpen);
  },

  async AddShoppingIntent(request, keepOpen, ctx) {
    const item = slot(request, 'item');
    if (!item) return say('Was soll auf den Einkaufszettel?', false);
    await push({ kind: 'shop', text: item }, ctx);
    return keepOpen ? say(item + ' steht auf dem Einkaufszettel. Was noch?', false)
      : say(item + ' steht auf dem Einkaufszettel.');
  },

  async LogBabyIntent(request, keepOpen, ctx) {
    const spokenRaw = slot(request, 'event');
    if (!spokenRaw) return say('Was soll ins Baby-Tagebuch?', false);
    const kindRaw = spokenRaw.toLowerCase();
    // "Baby Frage an die Hebamme …" landet hier statt im eigenen Intent.
    // Nur mit "frag…": "Baby Hebamme war da" bleibt eine Notiz.
    if (/hebamme/.test(kindRaw) && /frag/.test(kindRaw)) return pushMidwife(spokenRaw.replace(/^.*?hebamme\w*[,:]?\s*/i, ''), keepOpen, ctx);
    // Menge steht im Freitext: "120 Milliliter Flasche", "38,5 Grad Fieber".
    const amount = extractUnit(kindRaw, /(\d+(?:[.,]\d+)?)\s*(?:ml|milliliter|grad)\b/i)
      || extractUnit(kindRaw, /(\d+(?:[.,]\d+)?)/);
    let payload = null;
    let spoken = '';

    if (/windel|gewickelt/.test(kindRaw)) {
      payload = { kind: 'baby', babyType: 'diaper', babyP: { kind: 'pee' } };
      spoken = 'Windel gewechselt.';
      if (/stuhl|gro|kacke|aa/.test(kindRaw)) {
        payload.babyP.kind = 'poo';
      }
    } else if (/flasche|fläschchen|milch/.test(kindRaw)) {
      payload = { kind: 'baby', babyType: 'bottle', babyP: {} };
      if (amount) payload.babyP.ml = Math.round(amount);
      spoken = amount ? amount + ' Milliliter Flasche.' : 'Flasche.';
    } else if (/still|brust/.test(kindRaw)) {
      payload = { kind: 'baby', babyType: 'breast', babyP: {} };
      const sideIn = (t) => (/link/.test(t) ? 'l' : /recht/.test(t) ? 'r' : '');
      const sideWord = (s) => (s === 'l' ? 'links' : 'rechts');
      if (/beid|bds\b/.test(kindRaw)) {
        // "Beide" allein sagt nichts darüber, welche Seite als Nächstes dran
        // ist — die App braucht dafür die Hauptseite (die mit der größeren
        // Trinkmenge). Sie steht im Satz meist hinter "beide":
        // "beide, hauptsächlich links", "beide mehr rechts", "beide links".
        payload.babyP.side = 'b';
        const after = kindRaw.split(/beid\w*/)[1] || '';
        const main = sideIn(after) || sideIn(kindRaw);
        if (main) payload.babyP.main = main;
        spoken = main ? 'Gestillt, beide, hauptsächlich ' + sideWord(main) + '.' : 'Gestillt, beide Seiten.';
      } else {
        const side = sideIn(kindRaw);
        if (side) payload.babyP.side = side;
        spoken = side ? 'Gestillt ' + sideWord(side) + '.' : 'Gestillt.';
      }
    } else if (/schläft|schlafen|eingeschlafen/.test(kindRaw)) {
      payload = { kind: 'baby', babyType: 'sleep', babyP: {} };
      spoken = 'Schlaf notiert.';
    } else if (/fieber|temperatur/.test(kindRaw)) {
      payload = { kind: 'baby', babyType: 'temp', babyP: {} };
      if (amount) payload.babyP.temp = amount;
      spoken = amount ? amount + ' Grad.' : 'Temperatur notiert.';
    } else {
      // Alles andere wandert als Notiz ins Tagebuch, statt verloren zu gehen.
      payload = { kind: 'baby', babyType: 'note', text: spokenRaw };
      spoken = 'Notiz.';
    }
    await push(payload, ctx);
    return confirm(spoken, keepOpen);
  },

  async MidwifeQuestionIntent(request, keepOpen, ctx) {
    return pushMidwife(slot(request, 'question'), keepOpen, ctx);
  },
};

// ── Einstieg ──
exports.handler = async function (event) {
  const type = event?.request?.type;

  if (type === 'LaunchRequest') {
    // Bewusst knapp: Wer den Skill startet, weiß wofür. Wer nicht weiterweiß,
    // sagt "Hilfe" — eine Begrüßung, die jedes Mal die Anleitung vorliest, nervt.
    return say('NutriTrack gestartet.', false);
  }

  if (type === 'SessionEndedRequest') {
    return { version: '1.0', response: {} };
  }

  if (type !== 'IntentRequest') {
    return say('Das habe ich nicht verstanden.');
  }

  const name = event.request.intent?.name;

  if (name === 'AMAZON.HelpIntent') {
    return say(
      'Du kannst mir Essen, Wasser, Sport, Einkäufe, Baby-Einträge und Fragen an die Hebamme diktieren. ' +
      'Zum Beispiel: Ich habe 150 Gramm Reis gegessen. Oder: Ich war 30 Minuten joggen. ' +
      'Nachlesen kannst du alles in der NutriTrack-App.',
      false
    );
  }
  if (name === 'AMAZON.CancelIntent' || name === 'AMAZON.StopIntent') {
    return say('Okay.');
  }
  // Alexa hat den Skill gestartet, aber den Satz keinem Befehl zuordnen koennen.
  // Ein Beispiel hilft weiter; ein pauschales "nicht verstanden" nicht.
  if (name === 'AMAZON.FallbackIntent') {
    return say(
      'Das habe ich nicht zuordnen können. Sag es zum Beispiel so: ' +
      'Ich habe zwei Brötchen gegessen. Oder: Setz Milch auf den Einkaufszettel.',
      false
    );
  }

  const handler = HANDLERS[name];
  if (!handler) return say('Das habe ich nicht verstanden.');

  try {
    // Offen bleiben nur, wenn die Sitzung NACHWEISLICH schon lief — also vorher
    // mit "öffne mein Tagebuch" gestartet wurde. Fehlt die Angabe, wird
    // geschlossen: eine grundlos offene Sitzung wartet auf eine Antwort, die
    // niemand erwartet, und wirkt wie ein hängender Skill.
    // Ausnahme: Nach "Hebamme" allein hat der Skill nachgefragt — kam der
    // Nutzer mit einem Einzelbefehl, schließt die Antwort die Sitzung wieder.
    const attrs = (event.session && event.session.attributes) || {};
    const keepOpen = Boolean(event.session && event.session.new === false) && !attrs.mwOneShot;
    // Die personId ist die einzige Möglichkeit, zwei Personen an einem Echo zu
    // unterscheiden. Sie wird geloggt, damit man sie für NUTRITRACK_PERSONS
    // ablesen kann (Alexa Console → Code → Logs); sie ist eine anonyme
    // Amazon-Kennung, kein Name.
    const personId = event.context?.System?.person?.personId || '';
    console.log('[nutritrack] personId:', personId || '(kein Stimmprofil erkannt)');
    const oneShot = Boolean(event.session && event.session.new !== false);
    return await handler(event.request, keepOpen, { personId, oneShot });
  } catch (e) {
    if (e && e.message === 'not_configured') {
      return say(
        'Der Skill ist noch nicht eingerichtet. Trag Token und Endpunkt aus der ' +
        'NutriTrack-App als Umgebungsvariablen ein.'
      );
    }
    console.error('[nutritrack] push failed:', e);
    return failed(e);
  }
};
