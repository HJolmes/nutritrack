// NutriTrack — Alexa Skill (Alexa-hosted Lambda, Node.js 16+)
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
    // 5 s, nicht mehr: Alexa wartet selbst nur 8 s auf die Antwort des Skills.
    // Ein Timeout ab 8 s lief in diese Grenze hinein — statt "Ich erreiche den
    // Server nicht" hörte man dann nur Alexas "Bei der Antwort … ist ein
    // Problem aufgetreten", und die Ursache blieb unsichtbar.
    req.setTimeout(5000, () => { req.destroy(new Error('timeout')); });
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

// ── Baby-Einträge ──
//
// Zwei Wege führen hierher: "Baby gestillt rechts" (LogBabyIntent, die Art
// steckt im Freitext und wird hier geraten) und "stillen rechts"
// (BabyBreastIntent, die Art steht durch den Intent fest). Beide landen in
// babyEntry(), damit Windel, Flasche und Stillen nur an einer Stelle gedeutet
// werden.
function babyTypeOf(raw) {
  const t = String(raw || '').toLowerCase();
  // "wickeln" und "gewickelt" haben nur den Stamm "wickel" gemeinsam — das
  // frühere /windel|gewickelt/ ließ "Baby wickeln" als Notiz durchfallen.
  if (/wickel|windel/.test(t)) return 'diaper';
  if (/flasche|fläschchen|flaeschchen|milch/.test(t)) return 'bottle';
  if (/still|brust/.test(t)) return 'breast';
  if (/schläft|schlaeft|schlafen|eingeschlafen|schläfchen|schlaf\b/.test(t)) return 'sleep';
  if (/fieber|temperatur/.test(t)) return 'temp';
  return 'note';
}

function sideIn(t) {
  return /link/.test(t) ? 'l' : /recht/.test(t) ? 'r' : '';
}
function sideWord(s) {
  return s === 'l' ? 'links' : 'rechts';
}

// type steht fest, detail ist alles, was sonst noch gesagt wurde
// ("stuhl und pipi", "rechts", "120 Milliliter", "38,5 Grad").
function babyEntry(type, detailRaw, noteRaw) {
  const d = String(detailRaw || '').toLowerCase();
  const amount = extractUnit(d, /(\d+(?:[.,]\d+)?)\s*(?:ml|milliliter|grad)\b/i)
    || extractUnit(d, /(\d+(?:[.,]\d+)?)/);

  if (type === 'diaper') {
    // "Stuhl und Pipi" ist in der App ein eigener Wert ("Beides") und nicht
    // zweimal dasselbe Ereignis.
    const poo = /stuhl|groß|gross|kacke|kaka|\baa\b|voll/.test(d);
    const pee = /pipi|pisse|urin|nass|klein/.test(d);
    const kind = (poo && pee) || /beide/.test(d) ? 'both' : poo ? 'poo' : 'pee';
    const word = kind === 'both' ? 'Stuhl und Pipi' : kind === 'poo' ? 'Stuhl' : 'Pipi';
    return { payload: { kind: 'baby', babyType: 'diaper', babyP: { kind } },
      spoken: 'Windel gewechselt, ' + word + '.' };
  }

  if (type === 'bottle') {
    const p = {};
    if (amount) p.ml = Math.round(amount);
    return { payload: { kind: 'baby', babyType: 'bottle', babyP: p },
      spoken: amount ? amount + ' Milliliter Flasche.' : 'Flasche.' };
  }

  if (type === 'breast') {
    const p = {};
    if (/beid|bds\b/.test(d)) {
      // "Beide" allein sagt nichts darüber, welche Seite als Nächstes dran
      // ist — die App braucht dafür die Hauptseite (die mit der größeren
      // Trinkmenge). Sie steht im Satz meist hinter "beide":
      // "beide, hauptsächlich links", "beide mehr rechts", "beide links".
      p.side = 'b';
      const main = sideIn(d.split(/beid\w*/)[1] || '') || sideIn(d);
      if (main) p.main = main;
      return { payload: { kind: 'baby', babyType: 'breast', babyP: p },
        spoken: main ? 'Gestillt, beide, hauptsächlich ' + sideWord(main) + '.' : 'Gestillt, beide Seiten.' };
    }
    const side = sideIn(d);
    if (side) p.side = side;
    return { payload: { kind: 'baby', babyType: 'breast', babyP: p },
      spoken: side ? 'Gestillt ' + sideWord(side) + '.' : 'Gestillt.' };
  }

  if (type === 'sleep') {
    return { payload: { kind: 'baby', babyType: 'sleep', babyP: {} },
      spoken: 'Schlaf notiert.' };
  }

  if (type === 'temp') {
    const p = {};
    if (amount) p.temp = amount;
    return { payload: { kind: 'baby', babyType: 'temp', babyP: p },
      spoken: amount ? amount + ' Grad.' : 'Temperatur notiert.' };
  }

  // Alles andere wandert als Notiz ins Tagebuch, statt verloren zu gehen.
  return { payload: { kind: 'baby', babyType: 'note', text: String(noteRaw || detailRaw || '') },
    spoken: 'Notiz.' };
}

async function pushBaby(type, detail, noteRaw, keepOpen, ctx) {
  const e = babyEntry(type, detail, noteRaw);
  await push(e.payload, ctx);
  return confirm(e.spoken, keepOpen);
}

// Fragen an Hebamme oder Arzt: Sie reisen als Baby-Notiz mit Kennzeichen
// `babyP.mw`, nicht als eigener Typ. So braucht der Worker kein Update (er
// erlaubt mit `mw` 500 Zeichen), und eine ältere App, die das Kennzeichen nicht
// kennt, legt sie wenigstens als Notiz ins Tagebuch, statt sie zu verwerfen.
// Arztfragen tragen zusätzlich `to: 'doc'`; eine App vor v0.315 legt sie als
// Hebammenfrage ab — der Empfänger lässt sich dort nachträglich ändern.
const ASK = {
  mw: { who: 'die Hebamme', label: 'Frage an die Hebamme.', intent: 'MidwifeQuestionIntent' },
  doc: { who: 'den Arzt', label: 'Frage an den Arzt.', intent: 'DoctorQuestionIntent' },
};
// Wörter für den Arzt, wie man sie sagt: Arzt, Ärztin, Kinderarzt, Frauenärztin,
// Doktor, Doc, Praxis …
const DOC_WORD = '(?:kinder|frauen|haus)?(?:arzt|ärztin|aerztin|ärzte|doktor|doc)\\w*|(?:die\\s+|der\\s+)?praxis';
// Lookbehind statt \b: \b kennt kein "ä", "Ärztin" fände sonst nichts.
const DOC_RE = new RegExp('(?<![\\wäöüß])(?:' + DOC_WORD + ')(?![\\wäöüß])', 'i');

// "ob sie Fencheltee trinken darf" → "Ob sie Fencheltee trinken darf?"
function questionText(raw) {
  let t = String(raw || '').trim()
    .replace(new RegExp('^(?:frage\\s+)?(?:an|für)\\s+(?:die|den|der|meine[nr]?|unsere[nr]?)?\\s*(?:hebamme|' + DOC_WORD + ')\\s*', 'i'), '')
    .replace(new RegExp('^(?:hebamme|' + DOC_WORD + '|frage|fragen|habe|hab)[,:]?\\s+', 'i'), '')
    .trim();
  if (!t) return '';
  // Sprach-Eingaben sind nicht begrenzt, der Worker schneidet bei 500 ab —
  // hier schon, damit das Fragezeichen nicht mit abgeschnitten wird.
  t = t.slice(0, 499);
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (!/[?.!]$/.test(t)) t += '?';
  return t;
}

// Nur "Hebamme" bzw. "Arzt" gesagt: Alexa fragt nach und legt die nächste
// Antwort wörtlich in den Slot `question` (Dialog-Modell im Sprachmodell).
// Ohne diesen Schritt landete die Frage als eigener Satz im Fallback, weil sie
// keinem Satzmuster entspricht. `mwOneShot` merkt sich, dass der Nutzer mit
// einem Einzelbefehl kam — nach der Frage wird dann geschlossen, nicht "Was noch?".
function elicit(intent, slotName, text, reprompt, ctx) {
  return {
    version: '1.0',
    sessionAttributes: { mwOneShot: Boolean(ctx.oneShot) },
    response: {
      outputSpeech: { type: 'PlainText', text },
      reprompt: { outputSpeech: { type: 'PlainText', text: reprompt } },
      shouldEndSession: false,
      directives: [{
        type: 'Dialog.ElicitSlot',
        slotToElicit: slotName,
        updatedIntent: {
          name: intent,
          confirmationStatus: 'NONE',
          slots: { [slotName]: { name: slotName, confirmationStatus: 'NONE' } },
        },
      }],
    },
  };
}
function elicitQuestion(to, ctx) {
  const a = ASK[to];
  return elicit(a.intent, 'question', 'Was möchtest du ' + a.who + ' fragen?', 'Sag mir deine Frage an ' + a.who + '.', ctx);
}
async function pushQuestion(to, raw, keepOpen, ctx) {
  const q = questionText(raw);
  if (!q) return elicitQuestion(to, ctx);
  const babyP = to === 'doc' ? { mw: 1, to: 'doc' } : { mw: 1 };
  await push({ kind: 'baby', babyType: 'note', text: q, babyP }, ctx);
  return confirm(ASK[to].label, keepOpen);
}

// ── Einkaufszettel ──
//
// Ein Einkauf, der im falschen Intent landet ("notiere Milch auf dem
// Einkaufszettel" passt auch auf "notiere {food}"), wird an diesem Wort erkannt
// und umgeleitet, statt als Mahlzeit gebucht zu werden.
const SHOP_RE = /\b(?:einkaufs(?:liste|zettel)|einkaufen|einkauf)\b|\b(?:auf|in|zu|zur|zum)\s+(?:die|den|der|dem|meine[nmr]?|unsere[nmr]?)\s+(?:liste|zettel)\b/i;
function isShopText(t) {
  return SHOP_RE.test(String(t || ''));
}
// "noch Milch und Eier auf die Einkaufsliste bitte" → ["Milch", "Eier"]
function shopItems(raw) {
  const t = String(raw || '')
    // Ziel-Angabe und Verb-Reste ("auf die Einkaufsliste", "zum Zettel hinzu")
    .replace(/\b(?:auf|in|zu|zur|zum)\s+(?:die|den|der|dem|meine[nmr]?|unsere[nmr]?)?\s*(?:einkaufs)?(?:liste|zettel)\b/gi, ' ')
    .replace(/\b(?:einkaufs(?:liste|zettel)|einkaufen|einkauf)\b/gi, ' ')
    .replace(/\b(?:hinzu|hinzufügen|setzen|schreiben|packen|eintragen|ein|drauf|rauf|bitte|noch|mal|auch|dann)\b/gi, ' ')
    .replace(/^\s*(?:setz|setze|schreib|schreibe|pack|packe|tu|tue|trag|trage|notier|notiere|füg|füge|kauf|kaufe)\b/i, ' ')
    .replace(/\s+/gi, ' ').trim();
  if (!t) return [];
  // Mehrere Artikel in einem Satz: an Komma und "und" trennen. Bleibt die
  // Mengenangabe am Artikel ("zwei Liter Milch"), rechnet die App sie aus.
  const parts = t.split(/\s*,\s*|\s+und\s+|\s+sowie\s+/i).map((x) => x.trim()).filter(Boolean);
  return parts.slice(0, 10).map((x) => x.charAt(0).toUpperCase() + x.slice(1));
}
async function pushShop(raw, keepOpen, ctx) {
  const items = shopItems(raw);
  // Nur "Einkaufsliste" gesagt: nachfragen wie bei der Hebamme, damit die
  // Antwort ("Milch und Eier") im Slot landet und nicht im Fallback.
  if (!items.length) return elicit('AddShoppingIntent', 'item', 'Was soll auf den Einkaufszettel?', 'Sag mir, was auf den Einkaufszettel soll.', ctx);
  // Ein Einwurf je Artikel: Jeder bekommt in der App seine eigene Zeile.
  await Promise.all(items.map((text) => push({ kind: 'shop', text }, ctx)));
  const spoken = items.length === 1 ? items[0] + ' steht'
    : items.slice(0, -1).join(', ') + ' und ' + items[items.length - 1] + ' stehen';
  return keepOpen ? say(spoken + ' auf dem Einkaufszettel. Was noch?', false)
    : say(spoken + ' auf dem Einkaufszettel.');
}

// ── Intents ──
const HANDLERS = {
  async LogMealIntent(request, keepOpen, ctx) {
    const spoken = slot(request, 'food');
    if (!spoken) return say('Was hast du gegessen?', false);
    if (isShopText(spoken)) return pushShop(spoken, keepOpen, ctx);
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
    if (isShopText(spoken)) return pushShop(spoken, keepOpen, ctx);
    const { minutes, text } = extractMinutes(spoken);
    const activity = text || spoken;
    const payload = { kind: 'exercise', text: activity };
    if (minutes) payload.durationMin = Math.round(minutes);
    await push(payload, ctx);
    return confirm(minutes ? minutes + ' Minuten ' + activity + '.' : activity + '.', keepOpen);
  },

  async AddShoppingIntent(request, keepOpen, ctx) {
    return pushShop(slot(request, 'item'), keepOpen, ctx);
  },

  async LogBabyIntent(request, keepOpen, ctx) {
    const spokenRaw = slot(request, 'event');
    if (!spokenRaw) return say('Was soll ins Baby-Tagebuch?', false);
    const kindRaw = spokenRaw.toLowerCase();
    // "Baby Frage an die Hebamme/den Arzt …" landet hier statt im eigenen
    // Intent. Nur mit "frag…": "Baby Hebamme war da" bleibt eine Notiz.
    if (/frag/.test(kindRaw)) {
      if (/hebamme/.test(kindRaw)) return pushQuestion('mw', spokenRaw.replace(/^.*?hebamme\w*[,:]?\s*/i, ''), keepOpen, ctx);
      const m = kindRaw.match(DOC_RE);
      if (m) return pushQuestion('doc', spokenRaw.slice(m.index + m[0].length).replace(/^[,:]?\s*/, ''), keepOpen, ctx);
    }
    if (isShopText(spokenRaw)) return pushShop(spokenRaw, keepOpen, ctx);
    // "Baby gestillt rechts": Die Art steckt im Freitext und wird geraten.
    return pushBaby(babyTypeOf(spokenRaw), spokenRaw, spokenRaw, keepOpen, ctx);
  },

  // Die fünf Befehle ohne das Wort "Baby". Die Art steht hier durch den Intent
  // fest — "stillen rechts" landet damit als Stillen rechts und nicht als Notiz,
  // weil im Slot nur noch "rechts" ankommt und das allein nichts verraten würde.
  async BabyDiaperIntent(request, keepOpen, ctx) {
    const d = slot(request, 'detail');
    // "Windeln auf die Einkaufsliste" / "wir brauchen Windeln" ist ein Einkauf.
    if (isShopText(d) || /brauch|kaufen|alle\b|leer\b/.test(d.toLowerCase())) return pushShop('Windeln', keepOpen, ctx);
    return pushBaby('diaper', d, d, keepOpen, ctx);
  },
  async BabyBreastIntent(request, keepOpen, ctx) {
    const d = slot(request, 'detail');
    return pushBaby('breast', d, d, keepOpen, ctx);
  },
  async BabyBottleIntent(request, keepOpen, ctx) {
    const d = slot(request, 'detail');
    return pushBaby('bottle', d, d, keepOpen, ctx);
  },
  async BabySleepIntent(request, keepOpen, ctx) {
    const d = slot(request, 'detail');
    return pushBaby('sleep', d, d, keepOpen, ctx);
  },
  async BabyTempIntent(request, keepOpen, ctx) {
    const d = slot(request, 'detail');
    return pushBaby('temp', d, d, keepOpen, ctx);
  },

  async MidwifeQuestionIntent(request, keepOpen, ctx) {
    return pushQuestion('mw', slot(request, 'question'), keepOpen, ctx);
  },
  async DoctorQuestionIntent(request, keepOpen, ctx) {
    return pushQuestion('doc', slot(request, 'question'), keepOpen, ctx);
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
      'Du kannst mir Essen, Wasser, Sport, Einkäufe, Baby-Einträge und Fragen an Hebamme oder Arzt diktieren. ' +
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
    // Ausnahme: Nach "Hebamme"/"Arzt"/"Einkaufsliste" allein hat der Skill nachgefragt — kam der
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

// Für tools/test/alexa.test.js: reine Textfunktionen, ohne Netz.
exports._test = { babyTypeOf, babyEntry, questionText, shopItems, isShopText, DOC_RE };
