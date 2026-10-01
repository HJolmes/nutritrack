// Charakterisierungstests fuer den Rechenkern js/calc.js (#255).
//
// Die Erwartungen kommen aus dem HEUTIGEN Verhalten, nicht aus einem Wunsch.
// Weicht etwas Ueberraschendes ab, steht das hier als Test mit Kommentar; eine
// Korrektur ist ein eigenes Bug-Issue, kein stilles Umschreiben.
//
// js/calc.js ist ein Browser-Script ohne module.exports. Es wird deshalb per
// `vm` in einen eigenen Kontext geladen – wie im Browser landen seine
// Funktionen dort als Globale, und was sie an Globalem lesen (S, saveS,
// delPhotoIfUnused, NTMet), liegt im selben Kontext.
//
//   npm test          (node --test tools/test/)
'use strict';
process.env.TZ = 'Europe/Berlin'; // Sommerzeit-Faelle; vor dem ersten Date setzen

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');

// Frischer Kontext je Test: S, Zaehler fuer saveS und geloeschte Fotos.
function load(S, opts) {
  const ctx = { console, S, saved: 0, delPhotos: [] };
  ctx.window = ctx;
  ctx.saveS = () => { ctx.saved++; };
  ctx.delPhotoIfUnused = (id) => { ctx.delPhotos.push(id); };
  vm.createContext(ctx);
  if (opts && opts.met) vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/metdb.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/calc.js'), 'utf8'), ctx, { filename: 'js/calc.js' });
  return ctx;
}
const plain = (o) => JSON.parse(JSON.stringify(o)); // Objekte aus dem Kontext vergleichbar machen
const zero = { kcal: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, fiber: 0, salt: 0 };
const emptyDay = () => ({ meals: { breakfast: [], lunch: [], dinner: [], snack: [] }, water: 0, exercise: [] });

// ── Datum ────────────────────────────────────────────────────────────────
test('pad: einstellig mit 0, zweistellig unveraendert', () => {
  const C = load({});
  assert.equal(C.pad(5), '05');
  assert.equal(C.pad(12), '12');
});

test('addDays: Monats-, Schalttag- und Jahreswechsel', () => {
  const C = load({});
  assert.equal(C.addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(C.addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(C.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(C.addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(C.addDays('2026-10-01', -90), '2026-07-03');
});

test('addDays: ueber die Zeitumstellung genau ein Kalendertag', () => {
  const C = load({});
  assert.equal(C.addDays('2026-03-28', 1), '2026-03-29');
  assert.equal(C.addDays('2026-03-29', 1), '2026-03-30');
  assert.equal(C.addDays('2026-03-30', -1), '2026-03-29');
  assert.equal(C.addDays('2026-10-24', 1), '2026-10-25');
  assert.equal(C.addDays('2026-10-25', 1), '2026-10-26');
  assert.equal(C.addDays('2026-10-26', -2), '2026-10-24');
});

test('today: lokales Datum als YYYY-MM-DD', () => {
  const C = load({});
  const d = new Date();
  const want = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  assert.equal(C.today(), want);
});

test('fmtDate: Heute, Gestern, sonst Wochentag und Datum', () => {
  const C = load({});
  assert.equal(C.fmtDate(C.today()), 'Heute');
  assert.equal(C.fmtDate(C.addDays(C.today(), -1)), 'Gestern');
  assert.equal(C.fmtDate('2026-01-05'), 'Montag, 5. Januar');
});

test('isoWeek: Jahresanfang und KW 53', () => {
  const C = load({});
  assert.equal(C.isoWeek(new Date(2026, 0, 1)), 1);   // Donnerstag
  assert.equal(C.isoWeek(new Date(2026, 11, 28)), 53); // Montag
  assert.equal(C.isoWeek(new Date(2027, 0, 1)), 53);  // gehoert zu 2026
  assert.equal(C.isoWeek(new Date(2027, 0, 4)), 1);
  assert.equal(C.isoWeek(new Date(2026, 9, 1)), 40);
});

// ── Summen ───────────────────────────────────────────────────────────────
test('calcM: leere Liste ergibt ueberall 0', () => {
  const C = load({});
  assert.deepEqual(plain(C.calcM([])), zero);
});

test('calcM: fehlende Felder zaehlen 0, alle sieben werden summiert', () => {
  const C = load({});
  const r = C.calcM([
    { kcal: 100, protein: 10, carbs: 5, fat: 2 },
    { kcal: 50, protein: 1, carbs: 10, fat: 1, sugar: 4, fiber: 2, salt: 0.5 },
  ]);
  assert.deepEqual(plain(r), { kcal: 150, protein: 11, carbs: 15, fat: 3, sugar: 4, fiber: 2, salt: 0.5 });
});

test('ingTotal: amount 0 und undefined zaehlen 0, sonst amount/100 x per100', () => {
  const C = load({});
  assert.deepEqual(plain(C.ingTotal(undefined)), zero);
  const p = { kcal: 100, protein: 10, carbs: 20, fat: 5, sugar: 2, fiber: 1, salt: 0.2 };
  assert.deepEqual(plain(C.ingTotal([{ amount: 0, per100: p }, { per100: p }])), zero);
  const r = plain(C.ingTotal([{ amount: 150, per100: p }]));
  assert.equal(r.kcal, 150);
  assert.equal(r.protein, 15);
  assert.ok(Math.abs(r.salt - 0.3) < 1e-9);
});

test('scaleNutrients: Faktor 0 und 2, fehlende Nebenwerte 0', () => {
  const C = load({});
  const t = { kcal: 200, protein: 10, carbs: 20, fat: 8 };
  assert.deepEqual(plain(C.scaleNutrients(t, 0)), zero);
  assert.deepEqual(plain(C.scaleNutrients(t, 2)), { kcal: 400, protein: 20, carbs: 40, fat: 16, sugar: 0, fiber: 0, salt: 0 });
});

// ── Ziele ────────────────────────────────────────────────────────────────
test('calcMacroTargets: 25/45/30 % gerundet', () => {
  const C = load({});
  assert.deepEqual(plain(C.calcMacroTargets(2000)), { protein: 125, carbs: 225, fat: 67 });
});

test('dietMacroTargets: Standard, Keto, Low Carb, High Protein', () => {
  const S = { dietPrefs: [] };
  const C = load(S);
  assert.deepEqual(plain(C.dietMacroTargets(2000)), { protein: 125, carbs: 225, fat: 67 });
  S.dietPrefs = ['Keto'];
  assert.deepEqual(plain(C.dietMacroTargets(2000)), { protein: 125, carbs: 25, fat: 156 });
  S.dietPrefs = ['Low Carb'];
  assert.deepEqual(plain(C.dietMacroTargets(2000)), { protein: 150, carbs: 100, fat: 111 });
  S.dietPrefs = ['High Protein'];
  assert.deepEqual(plain(C.dietMacroTargets(2000)), { protein: 175, carbs: 200, fat: 56 });
  // Keto schlaegt die anderen, wenn mehrere gewaehlt sind
  S.dietPrefs = ['High Protein', 'Keto'];
  assert.equal(C.dietMacroTargets(2000).carbs, 25);
});

test('getMacroTargets: Gramm-Modus schlaegt Prozent, ohne Protein faellt er zurueck', () => {
  const S = { goal: 2000, dietPrefs: [], macroGoalMode: 'gram', macroGoalG: { protein: 140, carbs: 180, fat: 70 } };
  const C = load(S);
  assert.deepEqual(plain(C.getMacroTargets()), { protein: 140, carbs: 180, fat: 70 });
  S.macroGoalG = { protein: 0, carbs: 180, fat: 70 };
  assert.deepEqual(plain(C.getMacroTargets()), { protein: 125, carbs: 225, fat: 67 });
  S.macroGoalMode = 'percent';
  S.macroGoalG = { protein: 140, carbs: 180, fat: 70 };
  assert.deepEqual(plain(C.getMacroTargets()), { protein: 125, carbs: 225, fat: 67 });
});

// ── Kalorien-Ampel ───────────────────────────────────────────────────────
test('_kcalAmpel: innerhalb 10 % gruen', () => {
  const C = load({});
  assert.deepEqual(plain(C._kcalAmpel(2000, 1800, {})), { state: 'balanced', text: '✓ im Plan (10 %)' });
  assert.equal(C._kcalAmpel(2000, 2200, {}).state, 'balanced');
});

test('_kcalAmpel: die Grenze ist der GERUNDETE Prozentwert (2201 von 2000 = 10 %)', () => {
  const C = load({});
  assert.equal(C._kcalAmpel(2000, 2201, {}).state, 'balanced');
  assert.equal(C._kcalAmpel(2000, 2210, {}).state, 'over'); // 10,5 % -> 11
});

test('_kcalAmpel: ueber dem Ziel – Abnehmen rot, Zunehmen gruen', () => {
  const C = load({});
  const lose = C._kcalAmpel(2000, 2300, { goalWeight: 70, weight: 80 });
  assert.equal(lose.state, 'over');
  assert.match(lose.text, /15 % über Ziel/);
  assert.equal(C._kcalAmpel(2000, 2300, { goalWeight: 80, weight: 70 }).state, 'balanced');
  // Ziel innerhalb 0,5 kg: Halten, also rot
  assert.equal(C._kcalAmpel(2000, 2300, { goalWeight: 70.4, weight: 70 }).state, 'over');
});

test('_kcalAmpel: unter dem Ziel – Abnehmen gruen, sonst rot', () => {
  const C = load({});
  assert.equal(C._kcalAmpel(2000, 1500, { goalWeight: 70, weight: 80 }).state, 'balanced');
  const keep = C._kcalAmpel(2000, 1500, {});
  assert.equal(keep.state, 'over');
  assert.match(keep.text, /noch etwas essen/);
});

test('_kcalAmpel: Ziel 0 gilt als im Plan', () => {
  const C = load({});
  assert.equal(C._kcalAmpel(0, 500, {}).state, 'balanced');
});

// ── Tage und Verdichtung ─────────────────────────────────────────────────
test('getDay: legt den Tag an, wenn er fehlt', () => {
  const S = { days: {}, currentDate: '2026-09-30' };
  const C = load(S);
  const d = C.getDay();
  assert.deepEqual(plain(d), emptyDay());
  assert.equal(S.days['2026-09-30'], d);
});

test('getDay: ergaenzt fehlende meals/exercise an einem vorhandenen Tag', () => {
  const S = { days: { '2026-09-30': { water: 3 } }, currentDate: '2026-09-30' };
  const C = load(S);
  assert.deepEqual(plain(C.getDay()), { water: 3, meals: { breakfast: [], lunch: [], dinner: [], snack: [] }, exercise: [] });
});

test('compressOldDays: Tag -91 wird verdichtet, Tag -89 nicht', () => {
  const S = { days: {} };
  const C = load(S);
  const old = C.addDays(C.today(), -91), young = C.addDays(C.today(), -89);
  const day = () => {
    const d = emptyDay();
    d.water = 4;
    d.meals.lunch.push({ kcal: 500.4, protein: 20.6, carbs: 60, fat: 15, mealPhotoId: 'p1' });
    d.meals.snack.push({ kcal: 100, protein: 1, carbs: 20, fat: 1 });
    return d;
  };
  S.days[old] = day();
  S.days[young] = day();
  C.compressOldDays();
  assert.deepEqual(plain(S.days[old]), { _compressed: true, kcal: 600, protein: 22, carbs: 80, fat: 16, water: 4 });
  assert.equal(S.days[young].meals.lunch.length, 1);
  assert.equal(C.saved, 1);
  // je Eintrag ein Aufruf, auch ohne Foto
  assert.equal(C.delPhotos.length, 2);
  assert.equal(C.delPhotos[0], 'p1');
  assert.equal(C.delPhotos[1], undefined);
});

test('compressOldDays: ein zweiter Lauf aendert nichts und speichert nicht', () => {
  const S = { days: {} };
  const C = load(S);
  const old = C.addDays(C.today(), -120);
  S.days[old] = emptyDay();
  C.compressOldDays();
  const once = JSON.stringify(S.days);
  C.compressOldDays();
  assert.equal(JSON.stringify(S.days), once);
  assert.equal(C.saved, 1);
});

test('compressOldDays: alter Tag ohne meals, ohne Slot oder mit leerem Eintrag wird verdichtet (#281)', () => {
  // Alle bekannten Wege legen Tage mit meals an; ein solcher Tag kaeme nur aus
  // einem fremden oder beschaedigten Stand. Bis #281 warf er einen TypeError,
  // und die Verdichtung blieb bei jedem Start fuer ALLE Tage aus.
  const S = { days: {} };
  const C = load(S);
  const noMeals = C.addDays(C.today(), -100);
  const noSlot = C.addDays(C.today(), -101);
  const nullEntry = C.addDays(C.today(), -102);
  const normal = C.addDays(C.today(), -103);
  S.days[noMeals] = { water: 2 };
  S.days[noSlot] = { meals: { lunch: [{ kcal: 300, protein: 10, carbs: 40, fat: 8 }] }, water: 1 };
  S.days[nullEntry] = { meals: { breakfast: [null, { kcal: 200, protein: 5, carbs: 30, fat: 4, mealPhotoId: 'p2' }], lunch: [], dinner: [], snack: [] } };
  S.days[normal] = emptyDay();
  S.days[normal].meals.dinner.push({ kcal: 700, protein: 30, carbs: 70, fat: 25 });
  C.compressOldDays();
  assert.deepEqual(plain(S.days[noMeals]), { _compressed: true, kcal: 0, protein: 0, carbs: 0, fat: 0, water: 2 });
  assert.deepEqual(plain(S.days[noSlot]), { _compressed: true, kcal: 300, protein: 10, carbs: 40, fat: 8, water: 1 });
  assert.deepEqual(plain(S.days[nullEntry]), { _compressed: true, kcal: 200, protein: 5, carbs: 30, fat: 4, water: 0 });
  // der kaputte Tag haelt die anderen nicht mehr auf
  assert.deepEqual(plain(S.days[normal]), { _compressed: true, kcal: 700, protein: 30, carbs: 70, fat: 25, water: 0 });
  assert.equal(C.saved, 1);
  // je echtem Eintrag ein Aufruf, der leere Eintrag faellt weg
  assert.equal(C.delPhotos.length, 3);
  assert.ok(C.delPhotos.includes('p2'));
});

test('getDay: oeffnet einen verdichteten Tag wieder, Summen als Snack-Eintrag', () => {
  const S = { days: { '2026-01-10': { _compressed: true, kcal: 1800, protein: 90, carbs: 200, fat: 60, water: 5 } }, currentDate: '2026-01-10' };
  const C = load(S);
  const d = plain(C.getDay());
  assert.equal(d._compressed, undefined);
  assert.equal(d._reopened, true);
  assert.equal(d.water, 5);
  assert.deepEqual(d.meals.breakfast, []);
  assert.equal(d.meals.snack.length, 1);
  const e = d.meals.snack[0];
  assert.equal(e.name, 'Archivierte Tageswerte');
  assert.equal(e._archived, true);
  assert.equal(e.kcal, 1800);
  assert.deepEqual(e.per100, { kcal: 1800, protein: 90, carbs: 200, fat: 60, sugar: 0, fiber: 0, salt: 0 });
});

test('reopenArchivedDay: Tag ohne Summen bekommt keinen Snack-Eintrag', () => {
  const C = load({});
  const d = plain(C.reopenArchivedDay({ _compressed: true, kcal: 0, protein: 0, carbs: 0, fat: 0, water: 0 }));
  assert.deepEqual(d.meals.snack, []);
  const plainDay = { meals: {} };
  assert.equal(C.reopenArchivedDay(plainDay), plainDay); // nicht verdichtet: unveraendert
});

// ── Schwangerschaft ──────────────────────────────────────────────────────
// ET als UTC-Datum: new Date('YYYY-MM-DD') ist UTC-Mitternacht. Mit dem
// UTC-Datum von „jetzt + n Tage“ liegt die Rechnung nie auf einer Tagesgrenze.
const etIn = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);

test('calcSSW: Entbindung in 140 Tagen = SSW 20', () => {
  const C = load({});
  assert.equal(C.calcSSW(etIn(140)), 20);
  assert.equal(C.calcSSW(etIn(280)), 0);
});

test('getPregAddFromState: je Trimester ueber den Termin, sonst ueber die Stufe', () => {
  const S = { pregnant: 'et', pregnantET: etIn(280 - 70) };// SSW 10
  const C = load(S);
  assert.equal(C.getPregAddFromState(), 0);
  S.pregnantET = etIn(280 - 140);// SSW 20
  assert.equal(C.getPregAddFromState(), 300);
  S.pregnantET = etIn(280 - 210);// SSW 30
  assert.equal(C.getPregAddFromState(), 500);
  S.pregnant = '2'; assert.equal(C.getPregAddFromState(), 300);
  S.pregnant = '3'; assert.equal(C.getPregAddFromState(), 500);
  S.pregnant = '1'; assert.equal(C.getPregAddFromState(), 0);
  S.pregnant = 0; assert.equal(C.getPregAddFromState(), 0);
  S.pregnant = 'et'; S.pregnantET = ''; assert.equal(C.getPregAddFromState(), 0);
});

// ── Sport ────────────────────────────────────────────────────────────────
test('getExerciseMet: Tabelle, Gross-/Kleinschreibung, Intensitaet', () => {
  const C = load({ exerciseLibrary: [] }, { met: true });
  assert.equal(C.getExerciseMet('Laufen', 'medium'), 9.3);
  assert.equal(C.getExerciseMet('LAUFEN', 'high'), 11.8);
  assert.equal(C.getExerciseMet('Laufen', 'gibtsnicht'), 9.3); // faellt auf medium
});

test('getExerciseMet: unbekannte Aktivitaet = null (die 5 MET setzt erst der Aufrufer)', () => {
  const C = load({ exerciseLibrary: [] }, { met: true });
  assert.equal(C.getExerciseMet('Unterwasserkorbflechten', 'medium'), null);
  assert.equal(C.findExercise(''), null);
  assert.equal(C.EXERCISE_FALLBACK_MET, 5);
});

test('getExerciseMet: eigener Bibliothekseintrag MIT MET schlaegt die Tabelle', () => {
  const C = load({ exerciseLibrary: [{ name: 'laufen', met: { medium: 6 } }, { name: 'Tanzen', met: null }] }, { met: true });
  assert.equal(C.getExerciseMet('Laufen', 'medium'), 6);
  assert.equal(C.getExerciseMet('Laufen', 'high'), 6); // ohne high: medium
  assert.equal(C.findExercise('Tanzen').src, 'table'); // ohne MET zaehlt der Eintrag nicht
});

test('getAllExercises: Schnellauswahl, eigener Eintrag ersetzt den Tabellen-Chip', () => {
  const C = load({ exerciseLibrary: [{ name: 'Laufen', emoji: '🏃‍♀️', met: { medium: 8 } }, { name: 'Bouldern', met: null }] }, { met: true });
  const all = plain(C.getAllExercises());
  assert.deepEqual(all[0], { name: 'Laufen', emoji: '🏃‍♀️', met: { medium: 8 }, isLib: true });
  assert.equal(all[1].name, 'Radfahren');
  assert.equal(all[1].isLib, false);
  assert.deepEqual(all[all.length - 1], { name: 'Bouldern', met: null, isLib: true });
});

test('suggestExercises: Anfang vor Wortanfang/Synonym vor enthalten, eigene zuerst, Limit', () => {
  const C = load({ exerciseLibrary: [{ name: 'Bouldern 20 min', emoji: '🧗', met: null }, { name: 'laufen', met: null }] }, { met: true });
  const names = (q, n) => plain(C.suggestExercises(q, n)).map((x) => x.name);
  const all = names('', 0);
  assert.equal(all[0], 'Bouldern 20 min');
  assert.equal(all[1], 'laufen');               // eigener Eintrag ersetzt „Laufen“ der Tabelle
  assert.equal(all.filter((n) => n.toLowerCase() === 'laufen').length, 1);
  assert.equal(all.length, 120 + 1);            // 120 Tabelle + Bouldern
  assert.equal(names('', 3).length, 3);
  const rad = names('rad');                     // Name beginnt mit der Eingabe, gleicher Rang alphabetisch
  assert.ok(rad.slice(0, 2).every((n) => n.startsWith('Rad')));
  assert.ok(rad.includes('Radfahren'));
  assert.ok(names('fahrrad').includes('Radfahren')); // Synonym
  assert.ok(names('jogg').length > 0);          // Synonym „joggen“ o. ä.
  assert.deepEqual(names('xyzq'), []);
  assert.equal(plain(C.suggestExercises('boul', 1))[0].emoji, '🧗');
});

test('splitExerciseDuration: Dauer aus dem Namen, Stunden in Minuten', () => {
  const C = load({});
  const sp = (x) => plain(C.splitExerciseDuration(x));
  assert.deepEqual(sp('Bouldern 20 min'), { name: 'Bouldern', dur: 20 });
  assert.deepEqual(sp('45min Laufen'), { name: 'Laufen', dur: 45 });
  assert.deepEqual(sp('Radfahren 1,5 Std'), { name: 'Radfahren', dur: 90 });
  assert.deepEqual(sp('Wandern 2 Stunden'), { name: 'Wandern', dur: 120 });
  assert.deepEqual(sp('Yoga - 30 Minuten'), { name: 'Yoga', dur: 30 });
  assert.deepEqual(sp('Schwimmen 1h'), { name: 'Schwimmen', dur: 60 });
  assert.deepEqual(sp('Laufen 10 km'), { name: 'Laufen 10 km', dur: 0 }); // keine Zeiteinheit
  assert.deepEqual(sp('Hochzeit'), { name: 'Hochzeit', dur: 0 });          // "h" nur nach Zahl
  assert.deepEqual(sp('20 min'), { name: '20 min', dur: 0 });              // ohne Rest kein Schnitt
  assert.deepEqual(sp(''), { name: '', dur: 0 });
});

test('cleanExerciseLibrary: Dauer raus, Doppel zusammen, MET gewinnt, Eingabe unveraendert', () => {
  const C = load({});
  const lib = [{ name: 'Bouldern 20 min', emoji: '🧗', met: null }, { name: 'bouldern', emoji: '🧗', met: { medium: 6 } }, { name: 'Yoga' }];
  const out = plain(C.cleanExerciseLibrary(lib));
  assert.deepEqual(out, [{ name: 'bouldern', emoji: '🧗', met: { medium: 6 } }, { name: 'Yoga' }]);
  assert.equal(lib[0].name, 'Bouldern 20 min');
  assert.deepEqual(plain(C.cleanExerciseLibrary(undefined)), []);
});

// ── Lebensmittel-DB, Suche, Emoji ───────────────────────────────────────
test('dbPer100: Basis- und USDA-Eintrag ergeben dasselbe Schema', () => {
  const C = load({});
  assert.deepEqual(plain(C.dbPer100({ k: 52, p: 0.3, c: 14, f: 0.2 })), { kcal: 52, protein: 0.3, carbs: 14, fat: 0.2, sugar: 0, fiber: 0, salt: 0 });
  assert.deepEqual(plain(C.dbPer100({ k: 130, p: 2.7, c: 28, f: 0.3, g: 0.1, b: 0.4, l: 0.01 })), { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3, sugar: 0.1, fiber: 0.4, salt: 0.01 });
});

test('fuzzy: Rangfolge exakt > Anfang > Wortanfang > enthalten > fast', () => {
  const C = load({});
  const it = { n: 'Griechischer Joghurt', s: 'yogurt skyr' };
  assert.equal(C.fuzzy(it, ''), 1);
  assert.equal(C.fuzzy(it, 'griechischer joghurt'), 5);
  assert.equal(C.fuzzy(it, 'Griech'), 4);
  assert.equal(C.fuzzy(it, 'jog'), 3);
  assert.equal(C.fuzzy(it, 'chisch'), 2);
  assert.equal(C.fuzzy(it, 'skyr'), 2);
  assert.equal(C.fuzzy(it, 'skyrs'), 1);
  assert.equal(C.fuzzy(it, 'pizza'), 0);
});

test('emo: Treffer ueber Teilwort, sonst Teller', () => {
  const C = load({});
  assert.equal(C.emo('Bananenbrot'), '🍌');
  assert.equal(C.emo('Äpfel'), '🍎');
  assert.equal(C.emo('Unbekanntes'), '🍽');
  assert.equal(C.emo(undefined), '🍽');
});

// ── Portionsgedaechtnis ─────────────────────────────────────────────────
test('rememberPortion/recallPortion: ohne Gross-/Kleinschreibung, Leeres ignoriert', () => {
  const S = {};
  const C = load(S);
  assert.equal(C.recallPortion('Apfel'), null);
  C.rememberPortion('Apfel', 150);
  assert.equal(C.recallPortion('APFEL'), 150);
  assert.equal(C.saved, 1);
  C.rememberPortion('', 100);
  C.rememberPortion('Birne', 0);
  assert.equal(C.saved, 1);
  assert.deepEqual(plain(S.portionMemory), { apfel: 150 });
});

// ── Teilen: kcal einer Sendung ──────────────────────────────────────────
test('_shIngA/_shFoodA: Rezeptzutat ohne Menge 0 g, Lebensmittel ohne Menge 100 g', () => {
  const C = load({});
  assert.equal(C._shIngA(''), 0);
  assert.equal(C._shIngA(null), 0);
  assert.equal(C._shIngA('50'), 50);
  assert.equal(C._shFoodA(''), 100);
  assert.equal(C._shFoodA('30'), 30);
});

test('_mmKcal: Rezept x Portionen plus Lebensmittel', () => {
  const C = load({});
  const mm = {
    lunch: [{ t: 'r', p: 2, i: [{ a: '100', p: { k: 200 } }, { a: '', p: { k: 999 } }] }],
    snack: [{ t: 'f', a: '', p: { k: 50 } }, { t: 'f', a: '200', p: { k: 50 } }],
  };
  assert.equal(C._mmKcal(mm), 400 + 50 + 100);
  assert.equal(C._mmKcal(undefined), 0);
});

// ── Zustand laden ────────────────────────────────────────────────────────
test('mergeState: flach – ein altes Unterobjekt ersetzt die Vorgabe ganz', () => {
  const C = load({});
  const S = { goal: 2000, macroGoalG: { protein: 0, carbs: 0, fat: 0 }, newField: [] };
  const r = C.mergeState(S, { goal: 1800, macroGoalG: { protein: 120 } });
  assert.equal(r, S);
  assert.equal(S.goal, 1800);
  assert.deepEqual(S.macroGoalG, { protein: 120 }); // carbs/fat fehlen – so ist es heute
  assert.deepEqual(S.newField, []); // neues Feld der Vorgabe bleibt, wenn der Stand es nicht kennt
});
