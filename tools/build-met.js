#!/usr/bin/env node
// Erzeugt js/metdb.js (MET-Tabelle fuer den Sporteintrag) aus dem
// 2024 Adult Compendium of Physical Activities.
//
// Quelle: Herrmann SD et al. 2024 Adult Compendium of Physical Activities:
// A third update of the energy costs of human activities. J Sport Health Sci
// 2024;13(1):6-12. Offizielle Tabelle als PDF von pacompendium.com (URL und
// sha256 unten fest), gelesen mit pdftotext (poppler-utils).
//
// NUTZUNG (pacompendium.com, "Using the Compendium", gelesen 2026-10-01):
// "The Adult, Older Adult, and Wheelchair Compendia are free to use for
// commercial purposes." — "Please do not change MET values or combine
// activities with different MET levels." — "Please cite the Compendium
// website or publication(s)." Deshalb: Werte nur aus der Quelle, je
// Intensitaet genau ein Code, Quellenangabe sichtbar in der App (Sport-Dialog).
//
// Gepflegt wird NUR tools/met.map.json: deutscher Name n, Emoji e,
// Synonyme s und je Intensitaet ein Compendium-Code c.low/c.medium/c.high
// (gibt es fuer eine Aktivitaet nur einen passenden Code, steht er dreimal
// da). "top": true markiert die Chips der Schnellauswahl. Die MET-Zahlen
// kommen ausschliesslich aus der Quelldatei — sie werden nie von Hand gesetzt.
//
//   node tools/build-met.js            # laedt die Quelle (Netz + pdftotext noetig)
//   node tools/build-met.js --check    # nur pruefen, nichts schreiben
//
// Abbruch (Exit 1), wenn die Quelldatei nicht passt (sha256, Zahl der Codes,
// unbekannte Hauptgruppe), ein Code aus der Map fehlt, ein Code met<=0 hat,
// die Intensitaeten absteigen (leicht > mittel oder mittel > intensiv) oder ein
// Name/Synonym nach der Normalisierung doppelt vorkommt. Laeuft nicht in der
// CI (braucht Netz).

'use strict';
var fs = require('fs');
var path = require('path');
var os = require('os');
var crypto = require('crypto');
var execFileSync = require('child_process').execFileSync;

var ROOT = path.join(__dirname, '..');
var MAP = path.join(__dirname, 'met.map.json');
var OUT = path.join(ROOT, 'js', 'metdb.js');

var URL = 'https://pacompendium.com/wp-content/uploads/2025/02/1_2024-adult-compendium_1_2024.pdf';
var SHA256 = 'ac30234b8f8f813837e282773cfcb3e0fe062334777c2f7b3213429c4fbc251c';
var CODES = 1111;
var CACHE = path.join(os.tmpdir(), 'nt-compendium-2024-' + SHA256.slice(0, 8) + '.pdf');
var HEADINGS = ['Bicycling', 'Conditioning Exercise', 'Dancing', 'Fishing & Hunting', 'Home Activities',
  'Home Repair', 'Inactivity', 'Lawn & Garden', 'Miscellaneous', 'Music Playing', 'Occupation',
  'Religious Activities', 'Running', 'Self Care', 'Sexual Activity', 'Sports', 'Transportation',
  'Video Games', 'Volunteer Activities', 'Walking', 'Water Activities', 'Winter Activities'];

// ─── Bezug der Quelldatei ────────────────────────────────────────────────────

function loadSource() {
  if (!fs.existsSync(CACHE)) {
    process.stderr.write('lade ' + URL + ' …\n');
    execFileSync('curl', ['-sSfL', '-m', '120', '-o', CACHE, URL], { stdio: ['ignore', 'ignore', 'inherit'] });
  }
  var sum = crypto.createHash('sha256').update(fs.readFileSync(CACHE)).digest('hex');
  if (sum !== SHA256) throw new Error('PDF: sha256 ' + sum + ' statt ' + SHA256 + ' (Cache ' + CACHE + ' loeschen?)');
  return execFileSync('pdftotext', ['-layout', CACHE, '-'], { encoding: 'utf8', maxBuffer: 16 << 20 });
}

// ─── Parsen ──────────────────────────────────────────────────────────────────

// Je Code eine Zeile "Hauptgruppe  Code  MET  Beschreibung". Lange
// Beschreibungen umbricht pdftotext auf die Zeilen davor und danach — sie
// werden nicht gebraucht, gelesen wird nur Code und MET.
function parse(txt) {
  var rows = {}, n = 0;
  txt.split('\n').forEach(function(line) {
    var m = line.match(/^\s*(\S.*?)\s+(\d{5})\s+(\d+(?:\.\d+)?)(?:\s|$)/);
    if (!m) return;
    if (HEADINGS.indexOf(m[1]) < 0) throw new Error('unbekannte Hauptgruppe "' + m[1] + '" bei Code ' + m[2]);
    n++;
    if (rows[m[2]]) throw new Error('Code ' + m[2] + ' doppelt in der Quelle');
    rows[m[2]] = { met: parseFloat(m[3]) };
  });
  if (n !== CODES) throw new Error(n + ' Codes gelesen, erwartet ' + CODES);
  return rows;
}

// ─── Suche (wird unveraendert nach js/metdb.js geschrieben) ─────────────────
// Dieselbe Funktion prueft hier die Eindeutigkeit der Schluessel, damit
// Generator und App nicht zwei verschiedene Normalisierungen haben.
function runtime(root) {
  var FILL = { gehen: 1, fahren: 1, machen: 1, spielen: 1, gegangen: 1, gefahren: 1, gespielt: 1,
    gemacht: 1, trainiert: 1, trainieren: 1, gewesen: 1 };
  var UNIT = { min: 1, minute: 1, minuten: 1, std: 1, stunde: 1, stunden: 1, h: 1 };
  // Kleinschreibung, Umlaute gefaltet, alles ausser a-z/0-9 wird Leerzeichen.
  function norm(s) {
    return String(s || '').toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[éèê]/g, 'e')
      .replace(/[^a-z0-9]+/g, ' ').replace(/^ +| +$/g, '');
  }
  // Dauerangaben ("30 Minuten", "45min") fallen weg.
  function words(s) {
    var w = norm(s).split(' '), out = [], num = false;
    for (var i = 0; i < w.length; i++) {
      var x = w[i];
      if (!x) continue;
      if (/^\d+(min|std|h)?$/.test(x)) { num = true; continue; }
      if (num && UNIT[x]) { num = false; continue; }
      num = false;
      out.push(x);
    }
    return out;
  }
  var idx = null;
  function index() {
    if (idx) return idx;
    var map = {}, keys = [], db = root.MET_DB || [];
    db.forEach(function(it) {
      [it.n].concat(it.s || []).forEach(function(k) {
        k = norm(k);
        if (k && !map[k]) { map[k] = it; keys.push(k); }
      });
    });
    var pos = {};
    keys.forEach(function(k, i) { pos[k] = i; });
    // Laengster Schluessel zuerst: "schwimmen" schlaegt "gehen", "skilanglauf" schlaegt "lauf".
    keys.sort(function(a, b) { return (b.length - a.length) || (pos[a] - pos[b]); });
    idx = { map: map, keys: keys };
    return idx;
  }
  // (1) exakt auf Name/Synonym, (2) dasselbe ohne Fuellwort am Ende
  // ("Schwimmen gehen", "Tennis gespielt"), (3) Teilstring, laengster Schluessel
  // zuerst ("gelaufen", "Bergwandern"); Schluessel unter 4 Zeichen ("rad",
  // "ski") nur als ganzes Wort. Kein Treffer: null.
  function lookup(name) {
    var w = words(name);
    if (!w.length) return null;
    var ix = index(), t = w.join(' ');
    if (ix.map[t]) return ix.map[t];
    while (w.length > 1 && FILL[w[w.length - 1]]) w.pop();
    t = w.join(' ');
    if (ix.map[t]) return ix.map[t];
    var pad = ' ' + t + ' ';
    for (var i = 0; i < ix.keys.length; i++) {
      var k = ix.keys[i];
      if (k.length < 4 ? pad.indexOf(' ' + k + ' ') !== -1 : t.indexOf(k) !== -1) return ix.map[k];
    }
    return null;
  }
  return { lookup: lookup, norm: norm };
}

// ─── Aufloesen ───────────────────────────────────────────────────────────────

var LEVELS = ['low', 'medium', 'high'];

function resolve(map, rows) {
  var out = [], problems = [], names = {}, keys = {};
  var norm = runtime({}).norm;
  map.forEach(function(it, i) {
    var label = it.n || ('#' + i);
    if (!it.n || !it.e) problems.push(label + ': n und e sind Pflicht');
    if (names[it.n]) problems.push(label + ': Name doppelt');
    names[it.n] = 1;
    var own = {};
    [it.n].concat(it.s || []).forEach(function(k) {
      var nk = norm(k);
      if (!nk) { problems.push(label + ': leeres Synonym "' + k + '"'); return; }
      if (own[nk]) return;
      own[nk] = 1;
      if (keys[nk]) problems.push(label + ': Schluessel "' + nk + '" steht schon bei ' + keys[nk]);
      else keys[nk] = it.n;
    });
    var met = {}, c = it.c || {};
    LEVELS.forEach(function(l) {
      var code = c[l], row = code && rows[code];
      if (!row) { problems.push(label + ': Code ' + l + '=' + code + ' fehlt in der Quelle'); return; }
      if (!(row.met > 0)) { problems.push(label + ': Code ' + code + ' hat met=' + row.met + ' (nicht verwendbar)'); return; }
      met[l] = row.met;
    });
    if (met.low > met.medium || met.medium > met.high)
      problems.push(label + ': MET steigt nicht an (' + met.low + ' / ' + met.medium + ' / ' + met.high + ')');
    out.push({ it: it, met: met });
  });
  return { rows: out, problems: problems };
}

// ─── Schreiben ───────────────────────────────────────────────────────────────

function render(res) {
  var o = [];
  o.push('// @ts-check');
  o.push('// NutriTrack – MET-Tabelle fuer den Sporteintrag (' + res.length + ' Aktivitaeten).');
  o.push('//');
  o.push('// ERZEUGT von tools/build-met.js — nicht von Hand bearbeiten.');
  o.push('// Gepflegt wird tools/met.map.json (deutscher Name, Emoji, Synonyme,');
  o.push('// je Intensitaet ein Compendium-Code); alle MET-Werte stammen unveraendert aus:');
  o.push('//');
  o.push('//   Herrmann SD et al. 2024 Adult Compendium of Physical Activities.');
  o.push('//   J Sport Health Sci 2024;13(1):6-12. https://pacompendium.com/');
  o.push('//   ' + URL);
  o.push('//   (sha256 ' + SHA256 + ').');
  o.push('//   Nutzung: laut pacompendium.com frei, auch kommerziell; Werte nicht');
  o.push('//   aendern, Quelle nennen (steht im Sport-Dialog).');
  o.push('//');
  o.push('// Felder: n Name, e Emoji, s Synonyme, met {low,medium,high} MET-Werte,');
  o.push('// c {low,medium,high} Compendium-Codes zum Nachschlagen.');
  o.push('//');
  o.push('// API: window.NTMet.lookup(name) -> Eintrag oder null; NTMet.top = Namen');
  o.push('// der Schnellauswahl; NTMet.norm(s) = die Normalisierung der Suche.');
  o.push('window.MET_DB=[');
  res.forEach(function(r) {
    var it = r.it;
    o.push('  {n:' + JSON.stringify(it.n) + ',e:' + JSON.stringify(it.e) +
      ',met:{low:' + r.met.low + ',medium:' + r.met.medium + ',high:' + r.met.high + '}' +
      ',c:{low:' + JSON.stringify(it.c.low) + ',medium:' + JSON.stringify(it.c.medium) + ',high:' + JSON.stringify(it.c.high) + '}' +
      ',s:' + JSON.stringify(it.s || []) + '},');
  });
  o.push('];');
  o.push('');
  o.push('(function(root){');
  o.push('  var api=(' + runtime.toString() + ')(root);');
  o.push('  api.top=' + JSON.stringify(res.filter(function(r) { return r.it.top; }).map(function(r) { return r.it.n; })) + ';');
  o.push('  root.NTMet=api;');
  o.push('})(window);');
  o.push('');
  return o.join('\n');
}

// ─── Ablauf ──────────────────────────────────────────────────────────────────

function main() {
  var check = process.argv.indexOf('--check') !== -1;
  var map = JSON.parse(fs.readFileSync(MAP, 'utf8'));
  var rows = parse(loadSource());
  var res = resolve(map, rows);
  if (res.problems.length) {
    console.error('✗ ' + res.problems.length + ' Problem(e) in tools/met.map.json:');
    res.problems.forEach(function(p) { console.error('  ' + p); });
    process.exit(1);
  }
  var js = render(res.rows);
  if (check) {
    var cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (cur !== js) {
      console.error('✗ js/metdb.js ist nicht auf dem Stand der Map — node tools/build-met.js');
      process.exit(1);
    }
    console.log('✓ js/metdb.js passt zur Map (' + res.rows.length + ' Aktivitaeten, Quelle ' + CODES + ' Codes 2024, sha256 ok)');
    return;
  }
  fs.writeFileSync(OUT, js);
  console.log('✓ js/metdb.js: ' + res.rows.length + ' Aktivitaeten, ' + Math.round(js.length / 1024) + ' KB');
}

try { main(); } catch (e) { console.error('✗ ' + e.message); process.exit(1); }
