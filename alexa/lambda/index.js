// NutriTrack — Alexa Skill (Alexa-hosted Lambda, Node.js 18+)
//
// Der Skill ist ein reiner Briefträger: Er nimmt entgegen, was gesprochen
// wurde, und schickt es an `POST /alexa/inbox` des NutriTrack-Workers. Er liest
// nichts aus, rechnet nichts aus und hält keinen Zustand — Alexa kann deshalb
// auch nichts über deine Ernährung verraten.
//
// Zwei Umgebungsvariablen sind Pflicht (Alexa Developer Console → Code →
// "Environment variables", oder direkt hier eintragen):
//   NUTRITRACK_TOKEN     — das Token aus NutriTrack (Mehr → Alexa-Einwurf)
//   NUTRITRACK_ENDPOINT  — z. B. https://…workers.dev/alexa/inbox
//
// Kein npm-Paket nötig: `fetch` ist in Node 18 eingebaut, und die Alexa-Requests
// werden von der Alexa-hosted Laufzeit selbst verifiziert.

const TOKEN = process.env.NUTRITRACK_TOKEN || '';
const ENDPOINT = process.env.NUTRITRACK_ENDPOINT || '';

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

// Mahlzeiten-Slot: Alexa liefert das gesprochene Wort, NutriTrack erwartet den
// internen Namen. Ohne Angabe entscheidet die App anhand der Uhrzeit.
const MEAL_MAP = {
  frühstück: 'breakfast', fruehstueck: 'breakfast', morgens: 'breakfast',
  mittag: 'lunch', mittagessen: 'lunch', mittags: 'lunch',
  abendessen: 'dinner', abendbrot: 'dinner', abends: 'dinner',
  snack: 'snack', zwischendurch: 'snack', zwischenmahlzeit: 'snack',
};

async function push(payload) {
  if (!TOKEN || !ENDPOINT) {
    throw new Error('not_configured');
  }
  const body = {
    // Eindeutige ID pro Einwurf: NutriTrack erkennt daran Doppel-Einträge,
    // falls eine Quittung verloren geht.
    id: 'ax' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    ts: Date.now(),
    ...payload,
  };
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'X-User-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('http ' + res.status);
  return true;
}

// Eine Bestätigung, die NICHTS verrät: keine Kalorien, keine Tagessumme.
// Der Skill kennt diese Zahlen auch gar nicht.
function confirm(what) {
  return say(what + ' Ich habe es in NutriTrack notiert.');
}
function failed() {
  return say('Das hat gerade nicht geklappt. Versuch es später nochmal.');
}

// ── Intents ──
const HANDLERS = {
  async LogMealIntent(request) {
    const text = slot(request, 'food');
    if (!text) return say('Was hast du gegessen?', false);
    const mealRaw = slot(request, 'meal').toLowerCase();
    const payload = { kind: 'meal', text };
    if (MEAL_MAP[mealRaw]) payload.meal = MEAL_MAP[mealRaw];
    await push(payload);
    return confirm(text + '.');
  },

  async LogWaterIntent(request) {
    const n = toNumber(slot(request, 'count')) || 1;
    await push({ kind: 'water', text: n + ' Glas Wasser', qty: n });
    return confirm(n === 1 ? 'Ein Glas Wasser.' : n + ' Gläser Wasser.');
  },

  async LogExerciseIntent(request) {
    const activity = slot(request, 'activity');
    if (!activity) return say('Was hast du gemacht?', false);
    const mins = toNumber(slot(request, 'duration'));
    const payload = { kind: 'exercise', text: activity };
    if (mins) payload.durationMin = Math.round(mins);
    await push(payload);
    return confirm(mins ? mins + ' Minuten ' + activity + '.' : activity + '.');
  },

  async AddShoppingIntent(request) {
    const item = slot(request, 'item');
    if (!item) return say('Was soll auf den Einkaufszettel?', false);
    await push({ kind: 'shop', text: item });
    return say(item + ' steht auf dem Einkaufszettel.');
  },

  async LogBabyIntent(request) {
    const kindRaw = slot(request, 'event').toLowerCase();
    const amount = toNumber(slot(request, 'amount'));
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
      if (/links/.test(kindRaw)) payload.babyP.side = 'l';
      else if (/rechts/.test(kindRaw)) payload.babyP.side = 'r';
      spoken = 'Gestillt.';
    } else if (/schläft|schlafen|eingeschlafen/.test(kindRaw)) {
      payload = { kind: 'baby', babyType: 'sleep', babyP: {} };
      spoken = 'Schlaf notiert.';
    } else if (/fieber|temperatur/.test(kindRaw)) {
      payload = { kind: 'baby', babyType: 'temp', babyP: {} };
      if (amount) payload.babyP.temp = amount;
      spoken = amount ? amount + ' Grad.' : 'Temperatur notiert.';
    } else {
      // Alles andere wandert als Notiz ins Tagebuch, statt verloren zu gehen.
      payload = { kind: 'baby', babyType: 'note', text: slot(request, 'event') };
      spoken = 'Notiz.';
    }
    await push(payload);
    return confirm(spoken);
  },
};

// ── Einstieg ──
exports.handler = async function (event) {
  const type = event?.request?.type;

  if (type === 'LaunchRequest') {
    return say(
      'NutriTrack hört zu. Sag zum Beispiel: Ich habe zwei Eier gegessen. ' +
      'Oder: Setz Milch auf den Einkaufszettel.',
      false
    );
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
      'Du kannst mir Essen, Wasser, Sport, Einkäufe und Baby-Einträge diktieren. ' +
      'Zum Beispiel: Ich habe 150 Gramm Reis gegessen. Oder: Ich war 30 Minuten joggen. ' +
      'Nachlesen kannst du alles in der NutriTrack-App.',
      false
    );
  }
  if (name === 'AMAZON.CancelIntent' || name === 'AMAZON.StopIntent') {
    return say('Okay.');
  }

  const handler = HANDLERS[name];
  if (!handler) return say('Das habe ich nicht verstanden.');

  try {
    return await handler(event.request);
  } catch (e) {
    if (e && e.message === 'not_configured') {
      return say(
        'Der Skill ist noch nicht eingerichtet. Trag Token und Endpunkt aus der ' +
        'NutriTrack-App als Umgebungsvariablen ein.'
      );
    }
    console.error('[nutritrack] push failed:', e);
    return failed();
  }
};
