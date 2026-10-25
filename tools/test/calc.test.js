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
  assert.deepEqual(plain(C.dbPer100({ k: 52, p: 0.3, c: 14, f: 0.2 })), { kcal: 52, protein: 0.3, carbs: 14, fat: 0.2, sugar: 0, fiber: 0, salt: 0, src: 'db' });
  assert.deepEqual(plain(C.dbPer100({ k: 130, p: 2.7, c: 28, f: 0.3, g: 0.1, b: 0.4, l: 0.01 })), { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3, sugar: 0.1, fiber: 0.4, salt: 0.01, src: 'db' });
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
  // Bier und Wein nur, wo sie gemeint sind (v0.318)
  assert.equal(C.emo('Bier'), '🍺');
  assert.equal(C.emo('Rotwein'), '🍷');
  assert.equal(C.emo('Weißwein'), '🍷');
  assert.notEqual(C.emo('Schoko-Beeren-Crêpes'), '🍺');
  assert.notEqual(C.emo('Schweinebauch-Kimchi'), '🍷');
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

// ── Aus index.html verschoben (#257): KI-Antworten, Rezept-Link, Anzeige ──
test('anthropicBody: Haiku ohne Denken, Sonnet between_tools, kein temperature, max_tokens +30 %', () => {
  const C = load({});
  const c = [{ type: 'text', text: 'x' }];
  assert.deepEqual(plain(C.anthropicBody('claude-haiku-5-5', 300, c)), {
    model: 'claude-haiku-5-5', max_tokens: 390, messages: [{ role: 'user', content: c }],
    thinking: { type: 'disabled' }, output_config: { effort: 'low' },
  });
  assert.deepEqual(plain(C.anthropicBody('claude-sonnet-5-5', 1024, c)), {
    model: 'claude-sonnet-5-5', max_tokens: 1332, messages: [{ role: 'user', content: c }],
    thinking: { type: 'between_tools' },
  });
});

test('parseIngJSON: ```json-Zaun, Mengen als Zahl oder Text, Emoji sonst aus emo()', () => {
  const C = load({});
  const r = C.parseIngJSON('```json\n[{"name":"Apfel","g":150},{"name":"Brot","emoji":"🥖","g":"50"}]\n```');
  assert.deepEqual(plain(r), [{ name: 'Apfel', emoji: '🍎', g: 150 }, { name: 'Brot', emoji: '🥖', g: 50 }]);
});

test('parseIngJSON: abgeschnittenes Array endet nach dem letzten vollstaendigen Eintrag', () => {
  const C = load({});
  assert.deepEqual(plain(C.parseIngJSON('[{"name":"Apfel","g":150},{"name":"Bro')), [{ name: 'Apfel', emoji: '🍎', g: 150 }]);
});

test('parseIngJSON: ungueltiges g wird null, Eintrag ohne Namen faellt weg, Muell ergibt []', () => {
  const C = load({});
  const r = C.parseIngJSON('[{"name":"Skyr","g":"viel"},{"name":"Ei","g":0},{"name":"Salz","g":-2},{"g":10},null]');
  assert.deepEqual(plain(r).map((x) => [x.name, x.g]), [['Skyr', null], ['Ei', null], ['Salz', null]]);
  assert.deepEqual(plain(C.parseIngJSON('keine Ahnung')), []);
  assert.deepEqual(plain(C.parseIngJSON('{"name":"x"}')), []); // Objekt statt Array
  assert.deepEqual(plain(C.parseIngJSON('[kaputt')), []);
});

test('parsePhotoResponse: Objektform {rezept, zutaten} im Zaun, Name getrimmt', () => {
  const C = load({});
  const r = C.parsePhotoResponse('```json\n{"rezept":" Linsensuppe ","zutaten":[{"name":"Linsen","g":200},{"name":"Karotte","g":"x"},{"g":5}]}\n```');
  assert.deepEqual(plain(r), { rezept: 'Linsensuppe', zutaten: [{ name: 'Linsen', emoji: '🫘', g: 200 }, { name: 'Karotte', emoji: '🥕', g: null }] });
});

test('parsePhotoResponse: Array-Fallback, Muell ergibt leeres Ergebnis', () => {
  const C = load({});
  const logged = [];
  C.console = { log() {}, error: (...a) => logged.push(a.join(' ')) };
  assert.deepEqual(plain(C.parsePhotoResponse('Hier: [{"name":"Banane","g":120}]')), { rezept: '', zutaten: [{ name: 'Banane', emoji: '🍌', g: 120 }] });
  // #298: Ein Array mit MEHREREN Eintraegen laesst den Objekt-Versuch ({ bis })
  // scheitern; der Array-Rueckfall laeuft trotzdem, und nichts wird protokolliert.
  assert.deepEqual(plain(C.parsePhotoResponse('[{"name":"Banane","g":120},{"name":"Apfel","g":80}]')), { rezept: '', zutaten: [{ name: 'Banane', emoji: '🍌', g: 120 }, { name: 'Apfel', emoji: '🍎', g: 80 }] });
  assert.deepEqual(plain(C.parsePhotoResponse('```json\n[{"name":"Banane","g":120},\n{"name":"Apfel"}]\n```')).zutaten.length, 2);
  assert.equal(logged.length, 0);
  assert.deepEqual(plain(C.parsePhotoResponse('keine Ahnung')), { rezept: '', zutaten: [] });
  assert.deepEqual(plain(C.parsePhotoResponse('{kaputt}')), { rezept: '', zutaten: [] });
  assert.equal(logged.length, 1); // nur kaputtes JSON wird protokolliert
  // Objekt kaputt UND Array kaputt: ein Eintrag, leeres Ergebnis
  assert.deepEqual(plain(C.parsePhotoResponse('[{"name":"A"},{kaputt}]')), { rezept: '', zutaten: [] });
  assert.equal(logged.length, 2);
});

test('recipeImportExtractUrl: erster Link, Satzzeichen am Ende ab, ohne Link null', () => {
  const C = load({});
  assert.equal(C.recipeImportExtractUrl('Schau mal: https://www.chefkoch.de/rezepte/123/Suppe.html.'), 'https://www.chefkoch.de/rezepte/123/Suppe.html');
  assert.equal(C.recipeImportExtractUrl('(https://example.org/rezept?id=5)!'), 'https://example.org/rezept?id=5');
  assert.equal(C.recipeImportExtractUrl('erst http://a.de/x, dann https://b.de'), 'http://a.de/x');
  assert.equal(C.recipeImportExtractUrl('<a href="https://x.de/r">'), 'https://x.de/r');
  assert.equal(C.recipeImportExtractUrl('kein Link hier'), null);
  assert.equal(C.recipeImportExtractUrl('ftp://x.de'), null);
});

test('safeEmoji: HTML-Zeichen raus, hoechstens 16 Zeichen, sonst Ersatz', () => {
  const C = load({});
  assert.equal(C.safeEmoji('🍎', '🍽'), '🍎');
  assert.equal(C.safeEmoji('<img src=x onerror=alert(1)>', '🍽'), 'img srcx onerror');
  assert.equal(C.safeEmoji('\'"`=\\/&', '📋'), '📋'); // nur Sonderzeichen -> Ersatz
  assert.equal(C.safeEmoji('', '📋'), '📋');
  assert.equal(C.safeEmoji(null, '🍽'), '🍽');
  assert.equal(C.safeEmoji(undefined), '');
  assert.equal(C.safeEmoji(7, 'x'), '7');
});

test('totalStr: kcal und Makros gerundet, Zucker usw. nicht genannt', () => {
  const C = load({});
  assert.equal(C.totalStr({ kcal: 123.5, protein: 10.49, carbs: 0.5, fat: 2.51 }), '124 kcal · P10g K1g F3g');
  assert.equal(C.totalStr({ kcal: 0, protein: 0, carbs: 0, fat: 0, sugar: 9 }), '0 kcal · P0g K0g F0g');
});

test('_shPer100Enc/_shPer100Dec: Zucker, Ballaststoffe, Salz reisen mit, alte Sendungen lesen 0', () => {
  const C = load({});
  const enc = C._shPer100Enc({kcal:250.4,protein:8.26,carbs:30,fat:10.04,sugar:4.44,fiber:0,salt:1.234});
  assert.deepEqual(JSON.parse(JSON.stringify(enc)), {k:250,pr:8.3,c:30,f:10,g:4.4,l:1.23});
  assert.deepEqual(JSON.parse(JSON.stringify(C._shPer100Dec(enc))), {kcal:250,protein:8.3,carbs:30,fat:10,sugar:4.4,fiber:0,salt:1.23});
  assert.deepEqual(JSON.parse(JSON.stringify(C._shPer100Dec({k:100,pr:1,c:2,f:3}))), {kcal:100,protein:1,carbs:2,fat:3,sugar:0,fiber:0,salt:0});
  assert.deepEqual(JSON.parse(JSON.stringify(C._shPer100Enc(null))), {k:0,pr:0,c:0,f:0});
});

// ── Restaurant-Ketten (#307) ─────────────────────────────────────────────
const CH = [
  { id: 'mcd', n: "McDonald's", a: ['mcdonalds', 'mces', 'mc donalds'], items: [
    { n: 'Big Mac', g: 200, k: 500, p: 26, c: 42, f: 25, su: 9, fi: 3, sa: 2.2 },
    { n: 'Cheeseburger', g: 100, k: 300, p: 15, c: 30, f: 12, su: 6, fi: null, sa: 1.5 },
    { n: 'Pommes Frites mittel', g: 114, k: 330, p: 4, c: 40, f: 16, su: 0.3, fi: 4, sa: 0.6 },
  ] },
  { id: 'bk', n: 'Burger King', a: ['bk'], items: [
    { n: 'Whopper', g: 270, k: 630, p: 28, c: 50, f: 35, su: 11, fi: 3, sa: 2.3 },
    { n: 'Cheeseburger', g: 120, k: 320, p: 16, c: 31, f: 14, su: 7, fi: 1, sa: 1.6 },
  ] },
];
const names = (r) => plain(r).map((x) => x.chain.id + ':' + x.item.n);

test('chainFold: Apostroph, & und Umlaute', () => {
  const C = load({});
  assert.equal(C.chainFold("McDonald's"), 'mcdonalds');
  assert.equal(C.chainFold('dean&david'), 'dean david');
  assert.equal(C.chainFold('Mäckes Süß'), 'mackes suss');
});

test('chainPer100: Portion auf 100 g, fehlende Werte als 0, ohne Gewicht null', () => {
  const C = load({});
  assert.deepEqual(plain(C.chainPer100(CH[0].items[0])), { kcal: 250, protein: 13, carbs: 21, fat: 12.5, sugar: 4.5, fiber: 1.5, salt: 1.1 });
  assert.equal(C.chainPer100(CH[0].items[1]).fiber, 0);
  assert.equal(C.chainPer100({ n: 'x', g: null, k: 100 }), null);
});

test('chainSearch: Kettenname allein zeigt das ganze Sortiment', () => {
  const C = load({});
  const r = C.chainSearch(CH, 'mcdonalds');
  assert.deepEqual(names(r), ['mcd:Big Mac', 'mcd:Cheeseburger', 'mcd:Pommes Frites mittel']);
  assert.ok(r.every((x) => x.named));
  assert.equal(C.chainSearch(CH, "McDonald's").length, 3);
  assert.equal(C.chainSearch(CH, 'Mc Donalds').length, 3);
});

test('chainSearch: Kettenname + Produkt grenzt auf die Kette ein', () => {
  const C = load({});
  assert.deepEqual(names(C.chainSearch(CH, 'bk cheeseburger')), ['bk:Cheeseburger']);
  assert.deepEqual(names(C.chainSearch(CH, 'Pommes bei McDonalds')), ['mcd:Pommes Frites mittel']);
  // Trifft nichts: ganzes Sortiment statt leer
  assert.equal(C.chainSearch(CH, 'bk zzz').length, 2);
});

test('chainSearch: ohne Kettennamen muss jedes Wort treffen', () => {
  const C = load({});
  assert.deepEqual(names(C.chainSearch(CH, 'big mac')), ['mcd:Big Mac']);
  assert.deepEqual(names(C.chainSearch(CH, 'cheeseburger')), ['mcd:Cheeseburger', 'bk:Cheeseburger']);
  assert.deepEqual(names(C.chainSearch(CH, 'big burger')), []);
  assert.deepEqual(names(C.chainSearch(CH, 'Apfel')), []);
  // „bk“ im Wortinneren ist kein Kettenname (das Wort selbst darf als Tippfehler treffen)
  assert.ok(plain(C.chainSearch(CH, 'Whopperbk')).every((x) => !x.named));
  assert.equal(C.chainSearch(CH, '').length, 0);
  assert.equal(C.chainSearch(null, 'big mac').length, 0);
});

test('js/restaurants.js: jedes Produkt mit Gewicht und kcal, Namen je Kette eindeutig', () => {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/restaurants.js'), 'utf8'), ctx);
  const chains = ctx.window.CHAINS;
  assert.ok(Array.isArray(chains) && chains.length >= 4);
  for (const ch of chains) {
    const seen = new Set();
    for (const it of ch.items) {
      assert.ok(it.g > 0 || it.g === null, ch.n + ': ' + it.n + ' Gewicht ungültig');
      assert.equal(typeof it.k, 'number', ch.n + ': ' + it.n + ' ohne kcal');
      assert.ok(!seen.has(it.n), ch.n + ': ' + it.n + ' doppelt');
      seen.add(it.n);
    }
    if (ch.items.length) assert.ok(/^https:\/\//.test(ch.src), ch.n + ': Quelle fehlt');
  }
});

test('chainPer100: Rückrechnung auf die Portion trifft die Quelle', () => {
  const C = load({});
  const it = { n: 'Red Thai Chicken Curry', g: 576, k: 711, p: 29.8, c: 95.7, f: 21.6, su: 16.3, fi: null, sa: 4.2 };
  const per = C.chainPer100(it);
  assert.equal(Math.round(per.fat * 576 / 100 * 10) / 10, 21.6);
  assert.equal(Math.round(per.protein * 576 / 100 * 10) / 10, 29.8);
  assert.equal(Math.round(per.kcal * 576 / 100), 711);
});

test('chainSearch: genauer Name vor längeren Varianten', () => {
  const C = load({});
  const ch = [{ id: 'bk', n: 'Burger King', a: ['bk'], items: [
    { n: 'Double Whopper', g: 1, k: 1 }, { n: 'Plant-based Whopper', g: 1, k: 1 }, { n: 'Whopper', g: 1, k: 1 }, { n: 'Whopper Jr.', g: 1, k: 1 },
  ] }];
  assert.deepEqual(plain(C.chainSearch(ch, 'whopper')).map((x) => x.item.n), ['Whopper', 'Double Whopper', 'Whopper Jr.', 'Plant-based Whopper']);
});

test('chainSearch: Schreibfehler und Zusammenschreibung', () => {
  const C = load({});
  assert.deepEqual(names(C.chainSearch(CH, 'bigmac')), ['mcd:Big Mac']);
  assert.deepEqual(names(C.chainSearch(CH, 'Bigmak')), ['mcd:Big Mac']);
  assert.deepEqual(names(C.chainSearch(CH, 'whooper')), ['bk:Whopper']);
  assert.deepEqual(names(C.chainSearch(CH, 'Pomes Fritess mittel')), ['mcd:Pommes Frites mittel']);
  // Kettenname mit Tippfehler oder anders geschrieben
  assert.deepEqual(names(C.chainSearch(CH, "mc donald's big mac")), ['mcd:Big Mac']);
  assert.deepEqual(names(C.chainSearch(CH, 'mcdonals cheeseburger')), ['mcd:Cheeseburger']);
  assert.deepEqual(names(C.chainSearch(CH, 'burgerkin whopper')), ['bk:Whopper']);
  assert.equal(C.chainSearch(CH, 'mcdonals').length, 3);
  const DD = [{ id: 'dd', n: 'dean&david', a: ['dean david', 'dean'], items: [{ n: 'Red Thai Chicken Curry', g: 1, k: 1 }, { n: 'Paris Salat', g: 1, k: 1 }] }];
  assert.deepEqual(plain(C.chainSearch(DD, 'dean davd red thai')).map((x) => x.item.n), ['Red Thai Chicken Curry']);
  // Kurze Wörter bleiben streng: „Apfel“ ist kein Tippfehler von irgendwas
  assert.deepEqual(names(C.chainSearch(CH, 'Apfel')), []);
  assert.deepEqual(names(C.chainSearch(CH, 'Kaffee')), []);
});

test('chainSearch: halb getippter Kettenname zeigt das Sortiment', () => {
  const C = load({});
  const r = C.chainSearch(CH, 'mcdon');
  assert.deepEqual(names(r), ['mcd:Big Mac', 'mcd:Cheeseburger', 'mcd:Pommes Frites mittel']);
  assert.ok(r.every((x) => x.named));
  assert.ok(C.chainSearch(CH, 'Burger Ki').every((x) => x.named && x.chain.id === 'bk'));
  // Ein ganzes Produktwort bleibt Produktsuche: „burger“ zeigt nicht nur Burger King
  assert.ok(plain(C.chainSearch(CH, 'cheeseburger')).every((x) => !x.named));
  const SB = [{ id: 'sub', n: 'Subway', a: [], items: [{ n: 'Tuna Sub', g: 1, k: 1 }, { n: 'Cookie', g: 1, k: 1 }] }];
  assert.equal(C.chainSearch(SB, 'Subw').length, 2);
  // Kürzer als die Hälfte: nur als Rückfall, wenn kein Produkt trifft
  assert.deepEqual(plain(C.chainSearch(SB, 'Sub')).map((x) => x.item.n), ['Tuna Sub']);
  assert.equal(C.chainSearch(SB, 'Sbw').length, 0);
  assert.ok(plain(C.chainSearch(SB, 'Su')).every((x) => !x.named));
  const ST = [{ id: 'sb', n: 'Starbucks', a: [], items: [{ n: 'Latte', g: null, k: 1 }] }];
  assert.ok(plain(C.chainSearch(ST, 'Sta')).every((x) => x.named && x.item.n === 'Latte'));
});

test('chainPortionEntry: Produkt ohne Gewicht als Portionen-Eintrag', () => {
  const C = load({});
  const per = C.chainPerPortion({ k: 681, p: 30, c: 50, f: 38, su: null, fi: 3, sa: 2.5 });
  assert.deepEqual(plain(per), { kcal: 681, protein: 30, carbs: 50, fat: 38, sugar: 0, fiber: 3, salt: 2.5 });
  const e = plain(C.chainPortionEntry('Klassik (Hans im Glück)', '🍔', per, 2));
  assert.equal(e.isRecipe, true);
  assert.equal(e.portions, 2);
  assert.equal(e.kcal, 1362);
  assert.equal(e.ingredients.length, 1);
  assert.equal(e.ingredients[0].pu, true);
  // Eine Portion des Eintrags = Summe der Zutaten (ingTotal), wie bei Rezepten
  assert.equal(Math.round(C.ingTotal(e.ingredients).kcal), 681);
  assert.equal(plain(C.chainPortionEntry('x', '🍔', per, 0)).portions, 1);
});

// ── Kochbuch ─────────────────────────────────────────────────────────────
test('parseIsoDuration: schema.org-Dauer und blosse Minuten', () => {
  const C = load({});
  assert.equal(C.parseIsoDuration('PT1H30M'), 90);
  assert.equal(C.parseIsoDuration('PT45M'), 45);
  assert.equal(C.parseIsoDuration('P0DT2H'), 120);
  assert.equal(C.parseIsoDuration('PT90S'), 2);
  assert.equal(C.parseIsoDuration('30'), 30);
  assert.equal(C.parseIsoDuration(''), 0);
  assert.equal(C.parseIsoDuration('eine Stunde'), 0);
});

test('parseYield: erste Zahl zwischen 1 und 100', () => {
  const C = load({});
  assert.equal(C.parseYield('4 Portionen'), 4);
  assert.equal(C.parseYield('Für 4-6 Personen'), 4);
  assert.equal(C.parseYield('12'), 12);
  assert.equal(C.parseYield('Portionen'), 0);
  assert.equal(C.parseYield('0'), 0);
  assert.equal(C.parseYield(null), 0);
});

test('recipeSteps: Zeilen ohne Nummern, langer Absatz an Satzenden', () => {
  const C = load({});
  assert.deepEqual(plain(C.recipeSteps('1. Zwiebeln schneiden.\n\n2) Anbraten.\n- Servieren')),
    ['Zwiebeln schneiden.', 'Anbraten.', 'Servieren']);
  assert.deepEqual(plain(C.recipeSteps('Schritt 3: Backen')), ['Backen']);
  assert.deepEqual(plain(C.recipeSteps('')), []);
  const long = 'Den Ofen auf 200 Grad vorheizen und ein Blech mit Backpapier auslegen, damit nichts anhaftet. '
    + 'Kartoffeln waschen, schälen und in gleich große Spalten schneiden, damit sie gleichmäßig garen. '
    + 'Mit Öl, Salz und Rosmarin mischen und auf dem Blech verteilen. Ca. 30 Minuten backen.';
  const st = plain(C.recipeSteps(long));
  assert.ok(st.length >= 2, 'langer Absatz wird geteilt');
  assert.equal(st.join(' '), long);
});

test('stepTimers: Minuten, Stunden, Bereiche, keine Dubletten', () => {
  const C = load({});
  assert.deepEqual(plain(C.stepTimers('10 Minuten köcheln')).map((t) => t.sec), [600]);
  assert.deepEqual(plain(C.stepTimers('10–15 Min. backen')).map((t) => t.sec), [600]);
  assert.deepEqual(plain(C.stepTimers('1 Std. 30 Min. schmoren')).map((t) => t.sec), [5400]);
  assert.deepEqual(plain(C.stepTimers('1,5 Stunden gehen lassen')).map((t) => t.sec), [5400]);
  assert.deepEqual(plain(C.stepTimers('30 Sekunden rühren, dann 5 Minuten ziehen, nochmal 5 Minuten')).map((t) => t.sec), [30, 300]);
  assert.deepEqual(plain(C.stepTimers('200 Grad, 2 Minzblätter')), []);
});

test('fmtQty: Brueche, ganze Zahlen, Komma', () => {
  const C = load({});
  assert.equal(C.fmtQty(0.5), '½');
  assert.equal(C.fmtQty(1.5), '1 ½');
  assert.equal(C.fmtQty(0.25), '¼');
  assert.equal(C.fmtQty(2 / 3), '⅔');
  assert.equal(C.fmtQty(2), '2');
  assert.equal(C.fmtQty(0.98), '1');
  assert.equal(C.fmtQty(12.4), '12');
  assert.equal(C.fmtQty(1.4), '1,4');
  assert.equal(C.fmtQty(0.04), '0,04');
  assert.equal(C.fmtQty(0), '');
});

test('scaleIngs: Kopie mal Faktor, Original bleibt', () => {
  const C = load({});
  const ings = [{ name: 'Mehl', amount: 125, q: 0.5, u: 'Tasse', per100: { kcal: 350 } }, { name: 'Salz', amount: 0, per100: { kcal: 0 } }];
  const s = plain(C.scaleIngs(ings, 4));
  assert.equal(s[0].amount, 500);
  assert.equal(s[0].q, 2);
  assert.equal(s[1].amount, 0);
  assert.equal(ings[0].amount, 125, 'Original unverändert');
  assert.equal(plain(C.scaleIngs(s, 1 / 3))[0].amount, 166.7);
});

test('bookIngLine: Menge aus der Quelle, sonst Gramm', () => {
  const C = load({});
  assert.deepEqual(plain(C.bookIngLine({ name: 'Olivenöl', amount: 7.5, q: 0.5, u: 'EL', t: 'Olivenöl' }, 4)), { q: '2 EL', n: 'Olivenöl', g: '30 g' });
  assert.deepEqual(plain(C.bookIngLine({ name: 'Zwiebel', amount: 40, q: 0.5, u: '', t: 'Zwiebel(n), gewürfelt' }, 2)), { q: '1', n: 'Zwiebel(n), gewürfelt', g: '80 g' });
  assert.deepEqual(plain(C.bookIngLine({ name: 'Mehl', amount: 125, q: 125, u: 'g', t: 'Mehl' }, 4)), { q: '500 g', n: 'Mehl', g: '' });
  assert.deepEqual(plain(C.bookIngLine({ name: 'Reis', amount: 80 }, 3)), { q: '240 g', n: 'Reis', g: '' });
  assert.deepEqual(plain(C.bookIngLine({ name: 'Salz', amount: 0 }, 3)), { q: '', n: 'Salz', g: '' });
  assert.deepEqual(plain(C.bookIngLine({ name: 'Big Mac', amount: 100, pu: true }, 2)), { q: '2 Port.', n: 'Big Mac', g: '' });
});

test('parseTags und bookTags', () => {
  const C = load({});
  assert.deepEqual(plain(C.parseTags('pasta, Vegetarisch ,  Pasta,,')), ['Pasta', 'Vegetarisch']);
  assert.deepEqual(plain(C.parseTags(['suppe', 'Suppe'])), ['Suppe']);
  assert.deepEqual(plain(C.bookTags([{ cat: ['Pasta'] }, { cat: ['Suppe', 'Pasta'] }, {}])), ['Pasta', 'Suppe']);
});

test('Mahlzeit-Marker: bookMeals, bookToggleMeal, bookFillSlots, bookSeedMeal', () => {
  const C = load({});
  assert.deepEqual(plain(C.bookMeals({ meal: ['dinner', 'x', 'breakfast'] })), ['breakfast', 'dinner']);
  assert.deepEqual(plain(C.bookMeals({ meal: ['lunch', 'drink'] })), ['drink']);
  assert.deepEqual(plain(C.bookMeals({})), []);
  assert.deepEqual(plain(C.bookToggleMeal(['lunch'], 'dinner')), ['lunch', 'dinner']);
  assert.deepEqual(plain(C.bookToggleMeal(['lunch', 'dinner'], 'lunch')), ['dinner']);
  assert.deepEqual(plain(C.bookToggleMeal(['lunch'], 'drink')), ['drink']);
  assert.deepEqual(plain(C.bookToggleMeal(['drink'], 'snack')), ['snack']);
  assert.deepEqual(plain(C.bookFillSlots({ meal: ['breakfast', 'snack'] })), ['breakfast']);
  assert.deepEqual(plain(C.bookFillSlots({ meal: ['drink'] })), []);
  assert.deepEqual(plain(C.bookFillSlots({})), []);
  assert.deepEqual(plain(C.bookSeedMeal({ cat: ['Dessert'], meal: ['lunch', 'dinner'] })), ['snack']);
  assert.deepEqual(plain(C.bookSeedMeal({ cat: ['Hauptgericht'], meal: ['lunch', 'dinner'] })), ['lunch', 'dinner']);
});

test('bookFilter und bookSort', () => {
  const C = load({});
  const p = { kcal: 100, protein: 0, carbs: 0, fat: 0 };
  const list = [
    { id: '100', name: 'Spaghetti Bolognese', cat: ['Pasta'], fav: true, time: 40, ingredients: [{ name: 'Hackfleisch', amount: 200, per100: p }] },
    { id: '300', name: 'Käsespätzle', cat: ['Pasta', 'Vegetarisch'], ingredients: [{ name: 'Bergkäse', amount: 100, per100: p }] },
    { id: '200', name: 'Linsensuppe', cat: ['Suppe'], time: 25, ingredients: [{ name: 'Linsen', amount: 50, per100: p, t: 'rote Linsen' }] }
  ];
  const ids = (l) => plain(l).map((r) => r.id);
  assert.deepEqual(ids(C.bookFilter(list, '', 'Pasta')), ['100', '300']);
  assert.deepEqual(ids(C.bookFilter(list, '', '★')), ['100']);
  assert.deepEqual(ids(C.bookFilter(list, 'kaese', '')), ['300']);
  assert.deepEqual(ids(C.bookFilter(list, 'rote linsen', '')), ['200']);
  assert.deepEqual(ids(C.bookFilter(list, 'hack pasta', '')), ['100']);
  assert.deepEqual(ids(C.bookSort(list, 'new')), ['300', '200', '100']);
  assert.deepEqual(ids(C.bookSort(list, 'az')), ['300', '200', '100']);
  assert.deepEqual(ids(C.bookSort(list, 'kcal')), ['200', '300', '100']);
  assert.deepEqual(ids(C.bookSort(list, 'time')), ['200', '100', '300']);
  const log = { 100: { n: 3, last: '2026-10-01' }, 200: { n: 1, last: '2026-10-10' } };
  assert.deepEqual(ids(C.bookSort(list, 'cooked', log)), ['200', '100', '300']);
  assert.deepEqual(ids(C.bookSort(list, 'often', log)), ['100', '200', '300']);
});

// ── Kochbuch: Anpassung an die eigenen Angaben (v0.318) ──────────────────
function loadBook() {
  const C = load({});
  for (const f of ['js/fooddb.js', 'js/fooddb-usda.js', 'js/book-swaps.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), C, { filename: f });
  }
  C.lookup = (n) => {
    const d = C.DB.find((x) => x.n === n);
    return d ? { name: d.n, emoji: d.e, per100: C.dbPer100(d) } : null;
  };
  return C;
}
const P = (k, a) => ({ kcal: k, protein: 0, carbs: 0, fat: 0, ...(a || {}) });
const tnames = (a) => plain(a.ingredients).map((g) => g.t || g.name);

test('bookProfile: Schluessel aus Ernaehrung, Schwangerschaft, Stillzeit', () => {
  const C = load({});
  assert.deepEqual(plain(C.bookProfile({ dietPrefs: [] })).keys, []);
  assert.deepEqual(plain(C.bookProfile({ dietPrefs: ['Vegan', 'Glutenfrei'] })).keys, ['vegan', 'veg', 'gf']);
  assert.deepEqual(plain(C.bookProfile({ dietPrefs: ['Keto', 'Low Carb', 'Fischallergie'] })).keys, ['keto', 'fish']);
  const p = plain(C.bookProfile({ dietPrefs: ['Vegetarisch'], pregnant: '2', nursing: 0, dietFree: 'keine Pilze' }));
  assert.deepEqual(p.keys, ['veg', 'preg']);
  assert.deepEqual(p.labels, ['vegetarisch', 'Schwangerschaft', 'keine Pilze']);
  assert.equal(p.sig, 'veg,preg|keine Pilze');
  assert.deepEqual(plain(C.bookProfile({ pregnant: '0', nursing: 'part' })).keys, ['nurs']);
});

test('BOOK_SWAPS: jeder Ersatz steht in der Lebensmittel-Datenbank, jedes Muster ist gueltig', () => {
  const C = loadBook();
  const missing = [];
  C.BOOK_SWAPS.forEach((r, i) => {
    assert.ok(Array.isArray(r.k) && r.k.length, 'Zeile ' + i + ' ohne k');
    assert.ok(r.m || r.fl, 'Zeile ' + i + ' ohne m und fl');
    for (const rx of [r.m, r.x, r.dish]) if (rx) new RegExp(rx);
    assert.ok(r.rm || r.keep || (r.to && r.to.length), 'Zeile ' + i + ' ohne Ziel');
    (r.to || []).forEach((n) => { if (!C.lookup(n)) missing.push(n); });
  });
  assert.deepEqual(missing, []);
});

test('adaptRecipe: ohne Angaben unveraendert, Rezept bleibt unberuehrt', () => {
  const C = loadBook();
  const r = { name: 'Bolognese', ingredients: [{ name: 'Rinderhackfleisch (roh)', amount: 100, per100: P(215) }] };
  const snap = JSON.stringify(r);
  const a = plain(C.adaptRecipe(r, C.bookProfile({}), C.BOOK_SWAPS, C.lookup));
  assert.equal(a.swaps.length, 0);
  assert.equal(a.ingredients[0].name, 'Rinderhackfleisch (roh)');
  C.adaptRecipe(r, C.bookProfile({ dietPrefs: ['Vegan'] }), C.BOOK_SWAPS, C.lookup);
  assert.equal(JSON.stringify(r), snap, 'Original unveraendert');
});

test('adaptRecipe: vegetarisch – Hack, Huhn, Bruehe, Fischsauce, Kimchi; Gemuese bleibt', () => {
  const C = loadBook();
  const r = { name: 'Testpfanne', ingredients: [
    { name: 'Rinderhackfleisch (roh)', amount: 100, per100: P(215), q: 100, u: 'g', t: 'Rinderhack' },
    { name: 'Hähnchenbrust (roh)', amount: 150, per100: P(108), t: 'Hähnchenbrust, in Streifen' },
    { name: 'Hühnerbrühe', amount: 200, per100: P(6), fl: ['poultry'] },
    { name: 'Sojasauce', amount: 10, per100: P(60), t: 'Fischsauce', fl: ['fish'] },
    { name: 'Kimchi', amount: 80, per100: P(15), fl: ['fish', 'shellfish'] },
    { name: 'Paprika rot', amount: 100, per100: P(31) },
    { name: 'Austernpilze', amount: 50, per100: P(30) }
  ] };
  const a = plain(C.adaptRecipe(r, C.bookProfile({ dietPrefs: ['Vegetarisch'] }), C.BOOK_SWAPS, C.lookup));
  assert.equal(a.ingredients[0].name, 'Rote Linsen (roh)');
  assert.equal(a.ingredients[0].amount, 50, 'halbe Menge, trocken');
  assert.equal(a.ingredients[0].q, 50);
  assert.equal(a.ingredients[0].was, 'Rinderhack');
  assert.equal(a.ingredients[1].name, 'Tofu (fest)');
  assert.equal(a.ingredients[2].name, 'Gemüsebrühe');
  assert.equal(a.ingredients[3].name, 'Sojasauce');
  assert.equal(a.ingredients[4].t, 'Kimchi (ohne Fischsauce)');
  assert.equal(a.ingredients[5].name, 'Paprika rot');
  assert.equal(a.ingredients[6].name, 'Austernpilze', 'Austernpilze sind kein Fisch');
  assert.equal(a.swaps.length, 5);
  assert.ok(a.swaps.every((s) => s.k === 'veg' && s.why));
});

test('adaptRecipe: vegan + glutenfrei – Kette Sojasauce → Tamari, Ei je nach Gericht', () => {
  const C = loadBook();
  const base = [
    { name: 'Sojasauce', amount: 10, per100: P(60), t: 'Fischsauce', fl: ['fish'] },
    { name: 'Ei', amount: 55, per100: P(143), q: 1, u: '', t: 'Eier', fl: ['egg'] },
    { name: 'Butter', amount: 20, per100: P(717), fl: ['dairy'] },
    { name: 'Milch (3,5%)', amount: 200, per100: P(64) },
    { name: 'Nudeln (roh)', amount: 80, per100: P(371), fl: ['gluten'] },
    { name: 'Gochujang', amount: 10, per100: P(93), fl: ['soy', 'gluten'] }
  ];
  const prof = C.bookProfile({ dietPrefs: ['Vegan', 'Glutenfrei'] });
  const a = plain(C.adaptRecipe({ name: 'Pfannkuchen', ingredients: base }, prof, C.BOOK_SWAPS, C.lookup));
  assert.deepEqual(a.ingredients.map((g) => g.name), ['Tamari', 'Leinsamen', 'Margarine', 'Hafermilch', 'Glutenfreie Nudeln (roh)', 'Gochujang']);
  assert.equal(a.ingredients[1].q, undefined, 'Stueckzahl passt nicht mehr – nur Gramm');
  assert.equal(a.ingredients[2].t, 'Margarine (vegan)');
  assert.equal(a.ingredients[5].t, 'Gochujang (glutenfrei)');
  const bt = plain(C.adaptRecipe({ name: 'Pastete', ingredients: [{ name: 'Blätterteig', t: 'Blätterteig (Butter)', amount: 50, per100: P(551), fl: ['gluten', 'dairy'] },
    { name: 'Tamarinde', t: 'Tamarindenpaste', amount: 10, per100: P(239) }] }, prof, C.BOOK_SWAPS, C.lookup));
  assert.deepEqual(tnames(bt), ['Blätterteig (vegan, glutenfrei)', 'Tamarindenpaste'], 'Klammerzusatz faellt weg, Tamarinde ist kein Rind');
  const o = plain(C.adaptRecipe({ name: 'Käse-Omelett', ingredients: base.slice(1, 2) }, prof, C.BOOK_SWAPS, C.lookup));
  assert.equal(o.ingredients[0].name, 'Tofu (fest)');
});

test('adaptRecipe: Schwangerschaft – Wein, Rum, rohes Ei im Tiramisu, Rohschinken, Raeucherlachs', () => {
  const C = loadBook();
  const prof = C.bookProfile({ pregnant: '2' });
  const r = { name: 'Tiramisu', ingredients: [
    { name: 'Ei', amount: 55, per100: P(143) },
    { name: 'Rum', amount: 10, per100: P(230) },
    { name: 'Weißwein', amount: 50, per100: P(82), fl: ['alcohol'] },
    { name: 'Vanilleextrakt', amount: 4, per100: P(288) }
  ] };
  const a = plain(C.adaptRecipe(r, prof, C.BOOK_SWAPS, C.lookup));
  assert.deepEqual(tnames(a), ['Ei (pasteurisiert)', 'Gemüsebrühe', 'Vanilleextrakt']);
  assert.equal(a.ingredients[0].per100.kcal, 143, 'pasteurisiert: Naehrwerte bleiben');
  assert.equal(a.swaps.find((s) => s.to === '').from, 'Rum');
  const b = plain(C.adaptRecipe({ name: 'Brotzeit', ingredients: [
    { name: 'Ei', amount: 55, per100: P(143) },
    { name: 'Rohschinken', amount: 50, per100: P(250) },
    { name: 'Räucherlachs', amount: 50, per100: P(180) },
    { name: 'Camembert', amount: 50, per100: P(300) },
    { name: 'Schweinebauch (roh)', amount: 50, per100: P(518) }
  ] }, prof, C.BOOK_SWAPS, C.lookup));
  assert.deepEqual(tnames(b), ['Ei', 'Schinken (gekocht)', 'Lachs (gegart)', 'Camembert (aus pasteurisierter Milch)', 'Schweinebauch (roh)']);
  const poke = plain(C.adaptRecipe({ name: 'Tamari-Lachs mit Avocado-Reis', seed: 'poke-bowl-classic', ingredients: [
    { name: 'Lachs (roh)', amount: 100, per100: P(208), fl: ['fish'] }] }, prof, C.BOOK_SWAPS, C.lookup));
  assert.equal(poke.ingredients[0].name, 'Lachs (gegart)', 'roher Fisch – Kennung des Grundrezepts zaehlt mit');
  const n = plain(C.adaptRecipe(r, C.bookProfile({ nursing: 'excl' }), C.BOOK_SWAPS, C.lookup));
  assert.deepEqual(tnames(n), ['Ei', 'Gemüsebrühe', 'Vanilleextrakt'], 'Stillzeit: nur Alkohol');
});

test('adaptRecipe: Keto, laktosefrei, Fischallergie', () => {
  const C = loadBook();
  const r = { name: 'Lachs mit Reis', ingredients: [
    { name: 'Lachs (roh)', amount: 150, per100: P(208), fl: ['fish'] },
    { name: 'Reis weiß (roh)', amount: 75, per100: P(365) },
    { name: 'Zucker', amount: 5, per100: P(400) },
    { name: 'Sahne', amount: 50, per100: P(292), fl: ['dairy'] },
    { name: 'Parmesan', amount: 10, per100: P(431), fl: ['dairy'] }
  ] };
  const k = plain(C.adaptRecipe(r, C.bookProfile({ dietPrefs: ['Keto', 'Laktosefrei', 'Fischallergie'] }), C.BOOK_SWAPS, C.lookup));
  assert.deepEqual(tnames(k), ['Hähnchenbrust (roh)', 'Blumenkohl (als Reis)', 'laktosefreie Sahne', 'Parmesan']);
  assert.equal(k.ingredients[1].amount, 225, 'dreifache Menge Blumenkohl');
  const v = plain(C.adaptRecipe(r, C.bookProfile({ dietPrefs: ['Vegetarisch', 'Fischallergie'] }), C.BOOK_SWAPS, C.lookup));
  assert.equal(v.ingredients[0].name, 'Tofu (fest)', 'vegetarisch geht vor Fischallergie');
});

test('bookStepSwaps: Schritt nennt die getauschte Zutat', () => {
  const C = loadBook();
  const r = { name: 'X', ingredients: [{ name: 'Hähnchenbrust (roh)', amount: 150, per100: P(108), t: 'Hähnchenbrust' }] };
  const a = C.adaptRecipe(r, C.bookProfile({ dietPrefs: ['Vegetarisch'] }), C.BOOK_SWAPS, C.lookup);
  assert.equal(C.bookStepSwaps('Brate das Hähnchen 6 Minuten.', a.swaps).length, 1);
  assert.equal(C.bookStepSwaps('Schneide die Zwiebel.', a.swaps).length, 0);
});

// ── Vorrat (#325, #326) ──────────────────────────────────────────────────
test('pantryKey: Umlaute, Satzzeichen, einfache Pluralendung', () => {
  const C = load({});
  assert.equal(C.pantryKey('Zwiebeln'), C.pantryKey('Zwiebel'));
  assert.equal(C.pantryKey('Tomaten'), C.pantryKey('Tomate'));
  assert.equal(C.pantryKey('Möhren'), C.pantryKey('Möhre'));
  assert.equal(C.pantryKey('Eier'), C.pantryKey('Ei'));
  assert.equal(C.pantryKey('Milch 3,5 %'), 'milch 3 5');
  assert.notEqual(C.pantryKey('Reis'), C.pantryKey('Mais'));
});
test('pantryFind: gleicher Name vor ganzem Wort, längster Treffer gewinnt', () => {
  const C = load({});
  const items = [{ n: 'Milch' }, { n: 'Hafermilch' }, { n: 'Butter' }, { n: 'Zwiebeln' }];
  assert.equal(C.pantryFind(items, 'Zwiebel').n, 'Zwiebeln');
  assert.equal(C.pantryFind(items, 'Milch 3,5 %').n, 'Milch');
  assert.equal(C.pantryFind(items, 'Hafermilch').n, 'Hafermilch');
  assert.equal(C.pantryFind(items, 'Butter zum Braten').n, 'Butter');
  assert.equal(C.pantryFind(items, 'Vollmilch'), null);
  assert.equal(C.pantryFind(items, ''), null);
});
test('pantryUse: Gramm in Stück umrechnen, ohne Gramm je Stück nichts', () => {
  const C = load({});
  assert.equal(C.pantryUse({ q: 3, g: 500 }, 250), 2.5);
  assert.equal(C.pantryUse({ q: 1, g: 250 }, 400), 0);
  assert.equal(C.pantryUse({ q: 3 }, 250), null);
  assert.equal(C.pantryUse({ q: 3, g: 500 }, 0), null);
});
test('pantryNeed: fehlende Stück bis zur Mindestmenge', () => {
  const C = load({});
  assert.equal(C.pantryNeed(1, 3), 2);
  assert.equal(C.pantryNeed(2.5, 3), 1);
  assert.equal(C.pantryNeed(3, 3), 0);
  assert.equal(C.pantryNeed(0, 0), 0);
});
test('pantryBought: Stück, Packungen, Gramm, ohne Menge bis zur Mindestmenge', () => {
  const C = load({});
  assert.equal(C.pantryBought('2', {}), 2);
  assert.equal(C.pantryBought('3 Stück', {}), 3);
  assert.equal(C.pantryBought('2 Packungen', {}), 2);
  assert.equal(C.pantryBought('1 kg', { g: 500 }), 2);
  assert.equal(C.pantryBought('200 g', { g: 500 }), 1);
  assert.equal(C.pantryBought('', { q: 1, min: 4 }), 3);
  assert.equal(C.pantryBought('', {}), 1);
  assert.equal(C.pantryBought('500 g', {}), 1);
});
test('pantrySuggest: Anteil vorhandener Zutaten, Grundzutaten zählen nicht', () => {
  const C = load({});
  const items = [{ n: 'Nudeln', q: 2 }, { n: 'Tomaten', q: 4 }, { n: 'Eier', q: 0 }];
  const recs = [
    { id: 'a', name: 'Nudeln mit Tomatensoße', ings: ['Nudeln', 'Tomate', 'Salz', 'Olivenöl'] },
    { id: 'b', name: 'Rührei', ings: ['Ei', 'Salz'] },
    { id: 'c', name: 'Tomaten-Mozzarella', ings: ['Tomate', 'Mozzarella', 'Basilikum'] }
  ];
  const r = plain(C.pantrySuggest(recs, items));
  assert.deepEqual(r.map((x) => x.id), ['a', 'c']);
  assert.deepEqual(r[0].miss, []);
  assert.deepEqual(r[1].miss, ['Mozzarella', 'Basilikum']);
});
test('parsePantryPhoto: JSON aus der Antwort, Dubletten und unbekannte Orte fallen weg', () => {
  const C = load({});
  const txt = 'Hier: ```json {"artikel":[{"name":"Milch","stueck":2,"g":1000,"ort":"kuehl"},{"name":"Milch","stueck":1},{"name":"Nudeln","stueck":0,"ort":"keller"},{"name":""}]} ```';
  assert.deepEqual(plain(C.parsePantryPhoto(txt, ['kuehl', 'vorrat'])), [
    { n: 'Milch', q: 2, g: 1000, loc: 'kuehl', mhd: '', vd: '' },
    { n: 'Nudeln', q: 1, g: 0, loc: '', mhd: '', vd: '' }
  ]);
  assert.deepEqual(plain(C.parsePantryPhoto('kein json', [])), []);
  const d = C.parsePantryPhoto('{"artikel":[{"name":"Joghurt","mhd":"2026-11-02","vd":"02.11.2026"},{"name":"Hack","vd":"2026-13-01"}]}', []);
  assert.equal(d[0].mhd, '2026-11-02');
  assert.equal(d[0].vd, '');
  assert.equal(d[1].vd, '');
});
test('pantryDays/pantryExpiry: Tage bis zum Datum, dringlicheres Datum, Stufe', () => {
  const C = load({});
  assert.equal(C.pantryDays('2026-10-20', '2026-10-17'), 3);
  assert.equal(C.pantryDays('2026-10-16', '2026-10-17'), -1);
  assert.equal(C.pantryDays('2026-04-01', '2026-03-28'), 4); // Zeitumstellung zählt nicht
  assert.equal(C.pantryDays('', '2026-10-17'), null);
  assert.equal(C.pantryDays('17.10.2026', '2026-10-17'), null);
  assert.equal(C.pantryExpiry({}, '2026-10-17'), null);
  assert.deepEqual(plain(C.pantryExpiry({ mhd: '2026-10-30' }, '2026-10-17')), { k: 'mhd', d: '2026-10-30', days: 13, lvl: 'ok' });
  assert.deepEqual(plain(C.pantryExpiry({ mhd: '2026-10-30', vd: '2026-10-19' }, '2026-10-17')), { k: 'vd', d: '2026-10-19', days: 2, lvl: 'soon' });
  assert.equal(C.pantryExpiry({ mhd: '2026-10-19', vd: '2026-10-19' }, '2026-10-17').k, 'vd');
  assert.equal(C.pantryExpiry({ mhd: '2026-10-16' }, '2026-10-17').lvl, 'over');
});
test('pantryExpiring: nur mit Bestand, innerhalb der Frist, Dringendstes zuerst', () => {
  const C = load({});
  const items = [
    { n: 'Milch', q: 1, mhd: '2026-10-19' },
    { n: 'Hack', q: 1, vd: '2026-10-16' },
    { n: 'Käse', q: 0, mhd: '2026-10-18' },
    { n: 'Nudeln', q: 2, mhd: '2027-05-01' },
    { n: 'Reis', q: 1 }
  ];
  assert.deepEqual(plain(C.pantryExpiring(items, '2026-10-17', 3)).map((x) => x.it.n), ['Hack', 'Milch']);
});

// ── Vorrat: Einkaufszettel minus Vorrat, Haltbarkeit, Verlauf (#334, #336, #337)
test('pantryShortfall: zieht den Vorrat in Gramm ab, teilt Bestand, lässt Unbekanntes stehen', () => {
  const C = load({});
  const items = [
    { id: 'a', n: 'Tomaten', q: 2, g: 400 },   // 800 g
    { id: 'b', n: 'Milch', q: 1, g: 1000 },    // 1000 g
    { id: 'c', n: 'Zwiebeln', q: 3, g: 0 },    // ohne Gramm je Stück
    { id: 'd', n: 'Reis', q: 0, g: 500 },      // leer
  ];
  const r = C.pantryShortfall([
    { name: 'Tomate', amount: 500, emoji: '🍅' },
    { name: 'Tomaten', amount: 500 },          // nur noch 300 g übrig → 200 fehlen
    { name: 'Milch 3,5 %', q: '1,5 l' },       // 1500 ml − 1000 → 500
    { name: 'Zwiebel', amount: 200 },
    { name: 'Reis', amount: 250 },
    { name: 'Salz' },
  ], items);
  assert.equal(r.covered, 1);
  assert.equal(r.partial, 2);
  assert.equal(r.unknown, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(r.ings.map((x) => [x.name, x.amount ?? null, x.q ?? null]))), [
    ['Tomaten', 200, null], ['Milch 3,5 %', 500, null], ['Zwiebel', 200, null],
    ['Reis', 250, null], ['Salz', null, null],
  ]);
  // Eingabe bleibt unverändert
  const ing = { name: 'Tomaten', amount: 900, emoji: '🍅' };
  C.pantryShortfall([ing], items);
  assert.equal(ing.amount, 900);
  assert.deepEqual(JSON.parse(JSON.stringify(C.pantryShortfall([], null))), { ings: [], covered: 0, partial: 0, unknown: 0 });
});
test('pantryRefillMhd: leer → heute + Tage, sonst früheres Datum, ohne Tage unverändert', () => {
  const C = load({});
  const t = '2026-10-17';
  assert.equal(C.pantryRefillMhd({ hd: 7, mhd: '' }, 2, t), '2026-10-24');
  assert.equal(C.pantryRefillMhd({ hd: 7, mhd: '2026-10-01' }, 0, t), '2026-10-24');   // leer: alte Packung weg
  assert.equal(C.pantryRefillMhd({ hd: 7, mhd: '2026-10-20' }, 1, t), '2026-10-20');   // Rest läuft früher ab
  assert.equal(C.pantryRefillMhd({ hd: 7, mhd: '2026-12-01' }, 1, t), '2026-10-24');   // nie verlängern
  assert.equal(C.pantryRefillMhd({ hd: 0, mhd: '2026-12-01' }, 0, t), '2026-12-01');
  assert.equal(C.pantryRefillMhd({ mhd: '' }, 0, t), '');
  assert.equal(C.pantryRefillMhd({ hd: 3 }, 0, '2026-12-30'), '2027-01-02');
});
test('pantryLogTrim und pantryWaste: 90 Tage, Höchstzahl, Weggeworfenes je Monat', () => {
  const C = load({});
  const now = new Date(2026, 9, 17, 12).getTime(), day = 864e5;
  const log = [
    { id: '1', t: now - 100 * day, k: 'kauf', n: 'Alt', d: 1 },
    { id: '2', t: now - 2 * day, k: 'verderb', n: 'Brot', ic: '🍞', d: -1 },
    { id: '3', t: now - 1 * day, k: 'verderb', n: 'Brote', ic: '🍞', d: -2 },
    { id: '4', t: now, k: 'verderb', n: 'Milch', d: -1 },
    { id: '5', t: now, k: 'verderb', n: 'Joghurt', d: -1, u: 1 },          // rückgängig
    { id: '6', t: now, k: 'verbrauch', n: 'Käse', d: -1 },
    { id: '7', t: new Date(2026, 8, 30, 12).getTime(), k: 'verderb', n: 'Salat', d: -1 }, // September
  ];
  const tr = C.pantryLogTrim(log, now, 90, 4);
  assert.deepEqual(tr.map((e) => e.id).slice(0, 1), ['4']);
  assert.equal(tr.length, 4);
  assert.ok(!C.pantryLogTrim(log, now, 90, 100).some((e) => e.id === '1'));
  const w = C.pantryWaste(log, '2026-10');
  assert.equal(w.n, 3);
  assert.equal(w.q, 4);
  assert.equal(w.top[0].n, 'Brot');
  assert.equal(w.top[0].count, 2);
  assert.equal(w.top[1].n, 'Milch');
  assert.equal(C.pantryWaste(log, '2026-09').n, 1);
  assert.equal(C.pantryWaste(null, '2026-10').n, 0);
});

test('localTs: doppelte Stunde bei der Rückstellung nimmt die zuletzt vergangene (#345)', () => {
  const C = load({});
  const cest0205 = Date.UTC(2026, 9, 25, 0, 5); // 02:05 Sommerzeit
  const cet0205 = Date.UTC(2026, 9, 25, 1, 5);  // 02:05 Winterzeit
  // Gerade nach der Umstellung „jetzt“ eingetragen → Winterzeit, nicht vor einer Stunde
  assert.equal(C.localTs('2026-10-25', '02:05', cet0205 + 3 * 60000), cet0205);
  // Noch in der Sommerzeit-Stunde → die erste
  assert.equal(C.localTs('2026-10-25', '02:05', cest0205 + 60000), cest0205);
  // 02:50 um 02:20 Winterzeit: die zweite liegt in der Zukunft → die erste
  assert.equal(C.localTs('2026-10-25', '02:50', Date.UTC(2026, 9, 25, 1, 20)), Date.UTC(2026, 9, 25, 0, 50));
  // Eindeutige Zeiten unverändert, auch am Umstellungstag
  assert.equal(C.localTs('2026-10-25', '01:30', cet0205), Date.UTC(2026, 9, 24, 23, 30));
  assert.equal(C.localTs('2026-10-25', '03:00', cet0205), Date.UTC(2026, 9, 25, 2, 0));
  assert.equal(C.localTs('2026-10-24', '02:05', cet0205), Date.UTC(2026, 9, 24, 0, 5));
  // Vorstellung im März: 02:30 gibt es nicht, Verhalten wie new Date()
  assert.equal(C.localTs('2026-03-29', '02:30', Date.UTC(2026, 2, 29, 12)), new Date(2026, 2, 29, 2, 30).getTime());
  assert.equal(C.localTs('2026-10-25', '', cet0205), Date.UTC(2026, 9, 24, 22, 0));
});
