#!/usr/bin/env node
// Erzeugt js/book-seed.js — den Grundbestand des Kochbuchs — aus MorphCook.
//
// Quelle: MorphCook (https://github.com/TheMorpheus407/morphcook), Ordner
// claude-fable-5/app/assets, MIT-Lizenz, (c) 2026 Cedric Mössner. Die
// Rezepte dort hat eine KI-Pipeline geschrieben (pipeline/agents/*.md im
// MorphCook-Repo); sie sind nicht redaktionell geprüft.
//
//   git clone --depth 1 https://github.com/TheMorpheus407/morphcook /tmp/mc
//   node tools/build-book-seed.js /tmp/mc            # schreibt js/book-seed.js
//   node tools/build-book-seed.js /tmp/mc --check    # nur pruefen
//
// Auswahl: je Gericht (dish_id) GENAU EIN Rezept — die klassische Fassung,
// einfach vor mittel, ≤600 kcal vor ≤400 vor ≤800. Ohne pop-culture.json
// (Fantasiegerichte aus Spielen und Serien). Vegetarische, vegane oder
// glutenfreie Fassungen entstehen in der App aus der Tausch-Tabelle
// (js/book-swaps.js) bzw. per KI, nicht als zweites Rezept.
//
// Naehrwerte: MorphCook liefert nur Summen je Portion. Jede Zutat wird deshalb
// einem Lebensmittel der NutriTrack-Datenbank zugeordnet (tools/book-seed.map.json)
// und mit dessen Werten je 100 g gerechnet — wie jedes andere Rezept der App.
// Die Summe wird gegen die Angabe von MorphCook gehalten und im Lauf gemeldet.
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..');
var OUT = path.join(ROOT, 'js', 'book-seed.js');
var MAP = path.join(__dirname, 'book-seed.map.json');
var SEED_VERSION = 1;

var args = process.argv.slice(2);
var check = args.indexOf('--check') >= 0;
var srcDir = args.filter(function(a) { return a.indexOf('--') !== 0; })[0];
if (!srcDir) { console.error('Aufruf: node tools/build-book-seed.js <morphcook-Ordner> [--check]'); process.exit(2); }
var ASSETS = fs.existsSync(path.join(srcDir, 'claude-fable-5')) ? path.join(srcDir, 'claude-fable-5', 'app', 'assets') : srcDir;

// ── NutriTrack-Datenbank und emo() laden (wie im Browser, ohne Oberflaeche) ──
var ctx = { console: console };
ctx.window = ctx;
vm.createContext(ctx);
['js/fooddb.js', 'js/fooddb-usda.js', 'js/calc.js'].forEach(function(f) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
});
var DB = ctx.DB.concat(ctx.DB_USDA || []);
function dbFind(name) {
  for (var i = 0; i < DB.length; i++) if (DB[i].n === name) return DB[i];
  return null;
}
function per100(d) {
  return { kcal: d.k || 0, protein: d.p || 0, carbs: d.c || 0, fat: d.f || 0, sugar: d.g || 0, fiber: d.b || 0, salt: d.l || 0 };
}

// ── Einheiten ──────────────────────────────────────────────────────────────
// Gramm je Einheit, wenn die Zuordnung nichts anderes sagt. Haushaltsmasse wie
// beim Link-Import in picker.js (1 EL ≈ 15 g, 1 TL ≈ 5 g); ml gilt als g.
var UNIT_G = { g: 1, kg: 1000, ml: 1, l: 1000, tsp: 5, tbsp: 15, pinch: 0.5, clove: 5, sprig: 2, bunch: 30, slice: 30, can: 400 };
var UNIT_DE = { g: 'g', kg: 'kg', ml: 'ml', l: 'l', tsp: 'TL', tbsp: 'EL', pinch: 'Prise', clove: 'Zehe', sprig: 'Zweig', bunch: 'Bund', slice: 'Scheibe', can: 'Dose', piece: '' };

var CAT_DE = { mains: 'Hauptgericht', desserts: 'Dessert', snacks: 'Snack', 'soups-stews': 'Suppe & Eintopf', breakfast: 'Frühstück', 'salads-bowls': 'Salat & Bowl', drinks: 'Getränk' };
// Kueche: erster Treffer dieser Reihenfolge aus cuisine_tags, sonst aus der Datei.
var CUISINE = [['german', 'Deutsch'], ['italian', 'Italienisch'], ['french', 'Französisch'], ['british', 'Britisch'],
  ['japanese', 'Japanisch'], ['indian', 'Indisch'], ['mexican', 'Mexikanisch'], ['tex-mex', 'Mexikanisch'],
  ['middle-eastern', 'Orientalisch'], ['asian', 'Asiatisch'], ['american', 'Amerikanisch'], ['european', 'Europäisch']];
var FILE_CUISINE = { 'cuisine-asian.json': 'Asiatisch', 'cuisine-european.json': 'Europäisch', 'cuisine-indian.json': 'Indisch',
  'cuisine-italian.json': 'Italienisch', 'cuisine-mexican.json': 'Mexikanisch', 'cuisine-middle-eastern.json': 'Orientalisch' };
var CAT_EMOJI = { desserts: '🍰', breakfast: '🥞', 'soups-stews': '🍲', 'salads-bowls': '🥗', snacks: '🥪', drinks: '🥤', mains: '🍽' };

function readJson(f) { return JSON.parse(fs.readFileSync(path.join(ASSETS, f), 'utf8')); }
function de(o) { return o && typeof o === 'object' ? (o.de || o.en || '') : String(o || ''); }
function r1(v) { return Math.round(v * 10) / 10; }
function r3(v) { return Math.round(v * 1000) / 1000; }

var map = JSON.parse(fs.readFileSync(MAP, 'utf8')).ing;
var dishList = readJson('dishes.json');
dishList = dishList.dishes || dishList;
var dishes = {};
dishList.forEach(function(d) { dishes[d.id] = d; });

var ingTree = readJson('ingredients.json');
var ingInfo = {};
(function walk(nodes) {
  nodes.forEach(function(n) { ingInfo[n.id] = n; if (n.children) walk(n.children); });
})(ingTree.nodes);

// ── Auswahl ────────────────────────────────────────────────────────────────
var files = fs.readdirSync(ASSETS).filter(function(f) { return /\.json$/.test(f) && f !== 'pop-culture.json'; }).sort();
var byDish = {}, fileOf = {};
files.forEach(function(f) {
  var d;
  try { d = readJson(f); } catch (e) { return; }
  if (!d || !Array.isArray(d.recipes)) return;
  d.recipes.forEach(function(r) { (byDish[r.dish_id] = byDish[r.dish_id] || []).push(r); fileOf[r.id] = f; });
});
var ER = { easy: 0, medium: 1 }, CR = { le600: 0, le400: 1, le800: 2 };
function rank(r) {
  var v = r.variant || {};
  return (v.diet === 'classic' ? 0 : 100) + (ER[v.effort] !== undefined ? ER[v.effort] : 3) * 10 + (CR[v.calorie] !== undefined ? CR[v.calorie] : 3);
}
var picked = Object.keys(byDish).sort().map(function(id) {
  return byDish[id].slice().sort(function(a, b) { return rank(a) - rank(b) || (a.id < b.id ? -1 : 1); })[0];
});

// ── Umwandeln ──────────────────────────────────────────────────────────────
var problems = [], report = [];
var recipes = picked.map(function(r) {
  var dish = dishes[r.dish_id] || {};
  var serv = Math.max(1, Math.round(r.servings || 1));
  var ings = (r.ingredients || []).map(function(g) {
    var m = map[g.ingredient_id];
    if (!m) { problems.push(r.id + ': Zutat ' + g.ingredient_id + ' fehlt in ' + path.basename(MAP)); return null; }
    var note = de(g.note);
    // Die Notiz entscheidet mit: „gekocht“ ist anderer Reis, „mit Knochen“
    // zaehlt nur den essbaren Anteil, „zum Ausbacken“ nur das aufgenommene Oel.
    var dbName = m.n, pf = 1;
    (m.alt || []).forEach(function(a) {
      if (pf === 1 && dbName === m.n && new RegExp(a.rx, 'i').test(note)) { dbName = a.n; pf = a.pf || 1; }
    });
    var d = dbFind(dbName);
    if (!d) { problems.push(g.ingredient_id + ': "' + dbName + '" steht nicht in der Datenbank'); return null; }
    var unit = g.unit || 'g';
    var perUnit = (m.g && m.g[unit] !== undefined) ? m.g[unit] : UNIT_G[unit];
    if (perUnit === undefined) { problems.push(r.id + ': ' + g.ingredient_id + ' in "' + unit + '" ohne Grammangabe'); return null; }
    var info = ingInfo[g.ingredient_id] || {};
    var p100 = per100(d);
    if (pf !== 1) Object.keys(p100).forEach(function(k) { p100[k] = Math.round(p100[k] * pf * 100) / 100; });
    var o = {
      name: d.n, emoji: d.e || '🍽',
      amount: r1((g.qty || 0) * perUnit / serv),
      per100: p100,
      q: r3((g.qty || 0) / serv), u: UNIT_DE[unit] !== undefined ? UNIT_DE[unit] : unit,
      t: de(info.name) + (note ? ', ' + note : '')
    };
    if (info.flags && info.flags.length) o.fl = info.flags.slice();
    return o;
  }).filter(Boolean);
  var steps = (r.steps || []).map(function(s) { return de(s.text).trim(); }).filter(Boolean);
  var cats = [];
  if (CAT_DE[dish.category]) cats.push(CAT_DE[dish.category]);
  var tags = dish.cuisine_tags || [];
  var cu = null;
  for (var i = 0; i < CUISINE.length && !cu; i++) if (tags.indexOf(CUISINE[i][0]) >= 0) cu = CUISINE[i][1];
  cu = cu || FILE_CUISINE[fileOf[r.id]];
  if (cu) cats.push(cu);
  var name = de(r.title);
  var em = ctx.emo(name + ' ' + de(dish.name));
  var out = {
    id: 'mc-' + r.dish_id, seed: r.id,
    name: name, emoji: em !== '🍽' ? em : (CAT_EMOJI[dish.category] || '📋'),
    ingredients: ings, instructions: steps.join('\n'),
    baseServings: serv, time: r.time_minutes || 0, cat: cats,
    meal: (r.meal || []).slice(), desc: de(r.intro) || de(r.caption),
    src: 'https://github.com/TheMorpheus407/morphcook'
  };
  var kc = ings.reduce(function(s, g) { return s + g.per100.kcal * g.amount / 100; }, 0);
  var mc = r.calories_per_serving || (r.macros && r.macros.calories) || 0;
  report.push({ id: r.id, ours: Math.round(kc), theirs: mc });
  return out;
});

// ── Bericht ────────────────────────────────────────────────────────────────
var dev = report.filter(function(x) { return x.theirs; }).map(function(x) { return (x.ours - x.theirs) / x.theirs; });
dev.sort(function(a, b) { return a - b; });
var med = dev.length ? dev[Math.floor(dev.length / 2)] : 0;
var far = report.filter(function(x) { return x.theirs && Math.abs(x.ours - x.theirs) / x.theirs > 0.35; });
console.log(recipes.length + ' Gerichte aus ' + files.length + ' Dateien; kcal je Portion gegen MorphCook: Median '
  + (med * 100).toFixed(0) + ' %, ' + far.length + ' Rezepte mehr als 35 % daneben.');
far.forEach(function(x) { console.log('  ' + x.id + ': NutriTrack ' + x.ours + ' kcal, MorphCook ' + x.theirs + ' kcal'); });
if (problems.length) {
  console.error('\nFEHLER:\n  ' + problems.join('\n  '));
  process.exit(1);
}

// ── Schreiben ──────────────────────────────────────────────────────────────
var license = fs.existsSync(path.join(srcDir, 'LICENSE')) ? fs.readFileSync(path.join(srcDir, 'LICENSE'), 'utf8').trim() : '';
if (!license) { console.error('LICENSE von MorphCook nicht gefunden (Ordner des Repos angeben).'); process.exit(1); }
var lines = [];
lines.push('// @ts-check');
lines.push('// NutriTrack – Grundbestand des Kochbuchs (' + recipes.length + ' Gerichte, Fassung ' + SEED_VERSION + ').');
lines.push('//');
lines.push('// ERZEUGT von tools/build-book-seed.js — nicht von Hand bearbeiten.');
lines.push('// Rezepte: MorphCook, https://github.com/TheMorpheus407/morphcook');
lines.push('// (claude-fable-5/app/assets), von einer KI-Pipeline geschrieben. Naehrwerte');
lines.push('// je Zutat aus der NutriTrack-Datenbank (tools/book-seed.map.json).');
lines.push('//');
license.split('\n').forEach(function(l) { lines.push(('// ' + l).trimEnd()); });
lines.push('window.BOOK_SEED={v:' + SEED_VERSION + ',src:"MorphCook (MIT-Lizenz, © 2026 Cedric Mössner)",recipes:[');
recipes.forEach(function(r, i) { lines.push(JSON.stringify(r) + (i < recipes.length - 1 ? ',' : '')); });
lines.push(']};');
var text = lines.join('\n') + '\n';
if (check) {
  var cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (cur !== text) { console.error('✗ js/book-seed.js passt nicht zur Quelle — node tools/build-book-seed.js <Ordner> ausfuehren.'); process.exit(1); }
  console.log('✓ js/book-seed.js passt zur Quelle.');
} else {
  fs.writeFileSync(OUT, text);
  console.log('✓ js/book-seed.js: ' + recipes.length + ' Rezepte, ' + Math.round(text.length / 1024) + ' KB');
}
