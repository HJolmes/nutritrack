#!/usr/bin/env node
// Erzeugt js/metdb.js (MET-Tabelle fuer den Sporteintrag) aus dem
// Compendium of Physical Activities 2011.
//
// Quelle: Ainsworth BE et al., 2011 Compendium of Physical Activities
// (Arizona State University). Bezogen als MySQL-Dump aus dem GitHub-Spiegel
//   github.com/tfardella/compendium_of_physical_activiy_mysql_format
//   Commit 6d473d08d876374d01f54fd0fec06922ee7c7a91 (2015-10-18),
//   Datei compendium_of_physical_activities.sql, sha256 unten fest,
// weil die offiziellen Seiten (pacompendium.com, sites.google.com/…) nicht
// aus jeder Umgebung erreichbar sind.
//
// LIZENZ: Der Spiegel hat keine LICENSE-Datei; sein README verweist fuer die
// Nutzungsbedingungen auf die Compendium-Website. Nutzungsbedingungen vor
// Merge pruefen.
//
// Gepflegt wird NUR tools/met.map.json: deutscher Name n, Emoji e,
// Synonyme s und je Intensitaet ein Compendium-Code c.low/c.medium/c.high
// (gibt es fuer eine Aktivitaet nur einen passenden Code, steht er dreimal
// da). "top": true markiert die Chips der Schnellauswahl. Die MET-Zahlen
// kommen ausschliesslich aus der Quelldatei — sie werden nie von Hand gesetzt.
//
//   node tools/build-met.js            # laedt die Quelle (Netz + git noetig)
//   node tools/build-met.js --check    # nur pruefen, nichts schreiben
//
// Abbruch (Exit 1), wenn die Quelldatei nicht passt (sha256, Zahl der Codes),
// ein Code aus der Map fehlt, ein Code met<=0 hat (19018 "Skating, ice
// dancing" steht in der Quelle mit 0) oder ein Name/Synonym nach der
// Normalisierung doppelt vorkommt. Laeuft nicht in der CI (braucht Netz).

'use strict';
var fs = require('fs');
var path = require('path');
var os = require('os');
var crypto = require('crypto');
var execFileSync = require('child_process').execFileSync;

var ROOT = path.join(__dirname, '..');
var MAP = path.join(__dirname, 'met.map.json');
var OUT = path.join(ROOT, 'js', 'metdb.js');

var REPO = 'https://github.com/tfardella/compendium_of_physical_activiy_mysql_format';
var COMMIT = '6d473d08d876374d01f54fd0fec06922ee7c7a91';
var FILE = 'compendium_of_physical_activities.sql';
var SHA256 = '179bf301223be15b99644f53c48485a81ad705e604fac4384df76480ae48685a';
var CODES = 821;
var CACHE = path.join(os.tmpdir(), 'nt-compendium-' + COMMIT.slice(0, 8));

// ─── Bezug der Quelldatei ────────────────────────────────────────────────────

// git statt codeload: codeload.github.com liefert aus manchen Umgebungen statt
// des Tarballs eine JSON-Fehlermeldung, git ueber denselben Proxy geht.
function loadSource() {
  var file = path.join(CACHE, FILE);
  if (!fs.existsSync(file)) {
    process.stderr.write('lade ' + REPO + ' @ ' + COMMIT.slice(0, 8) + ' …\n');
    fs.mkdirSync(CACHE, { recursive: true });
    var git = function(args) { execFileSync('git', args, { cwd: CACHE, stdio: ['ignore', 'ignore', 'inherit'] }); };
    git(['init', '-q']);
    git(['fetch', '-q', '--depth', '1', REPO, COMMIT]);
    git(['checkout', '-q', 'FETCH_HEAD']);
  }
  var buf = fs.readFileSync(file);
  var sum = crypto.createHash('sha256').update(buf).digest('hex');
  if (sum !== SHA256) throw new Error(FILE + ': sha256 ' + sum + ' statt ' + SHA256 + ' (Cache ' + CACHE + ' loeschen?)');
  return buf.toString('utf8');
}

// ─── Parsen ──────────────────────────────────────────────────────────────────

// INSERT INTO `mets` VALUES ('01003',14.00,1,'Bicycling, …'),(…);
// Die Beschreibung kann Klammern und ein maskiertes \' enthalten, deshalb
// wird der Text in Anfuehrungszeichen als Ganzes gelesen.
function parse(sql) {
  var i = sql.indexOf('INSERT INTO `mets` VALUES');
  if (i < 0) throw new Error('INSERT INTO `mets` nicht gefunden');
  var line = sql.slice(i, sql.indexOf(';\n', i));
  var rx = /\('(\d{5})',\s*([\d.]+),\s*(\d+),\s*'((?:[^'\\]|\\.)*)'\)/g, m, rows = {}, n = 0;
  while ((m = rx.exec(line))) {
    n++;
    if (rows[m[1]]) throw new Error('Code ' + m[1] + ' doppelt in der Quelle');
    rows[m[1]] = { met: parseFloat(m[2]), desc: m[4].replace(/\\'/g, "'") };
  }
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
    out.push({ it: it, met: met });
  });
  return { rows: out, problems: problems };
}

// ─── Schreiben ───────────────────────────────────────────────────────────────

function render(res) {
  var o = [];
  o.push('// NutriTrack – MET-Tabelle fuer den Sporteintrag (' + res.length + ' Aktivitaeten).');
  o.push('//');
  o.push('// ERZEUGT von tools/build-met.js — nicht von Hand bearbeiten.');
  o.push('// Gepflegt wird tools/met.map.json (deutscher Name, Emoji, Synonyme,');
  o.push('// je Intensitaet ein Compendium-Code); alle MET-Werte stammen unveraendert aus:');
  o.push('//');
  o.push('//   Ainsworth BE et al. 2011 Compendium of Physical Activities.');
  o.push('//   Bezogen aus github.com/tfardella/compendium_of_physical_activiy_mysql_format,');
  o.push('//   Commit ' + COMMIT + ',');
  o.push('//   ' + FILE + ' (sha256 ' + SHA256 + ').');
  o.push('//   Lizenz: im Spiegel nicht angegeben (Verweis auf die Compendium-Website).');
  o.push('//   Nutzungsbedingungen vor Merge pruefen.');
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
    console.log('✓ js/metdb.js passt zur Map (' + res.rows.length + ' Aktivitaeten, Quelle ' + CODES + ' Codes, sha256 ok)');
    return;
  }
  fs.writeFileSync(OUT, js);
  console.log('✓ js/metdb.js: ' + res.rows.length + ' Aktivitaeten, ' + Math.round(js.length / 1024) + ' KB');
}

try { main(); } catch (e) { console.error('✗ ' + e.message); process.exit(1); }
