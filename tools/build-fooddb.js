#!/usr/bin/env node
// Erzeugt js/fooddb-usda.js aus der USDA-Referenzdatenbank.
//
// Quelle: USDA National Nutrient Database for Standard Reference, Release 28
// (US Department of Agriculture, Agricultural Research Service) — Public Domain.
// Bezogen als npm-Paket `fda-nutrient-database` (MIT), weil fdc.nal.usda.gov
// nicht aus jeder Umgebung erreichbar ist. Das Paket enthaelt die beiden
// Originaldateien ABBREV.txt (Naehrwerte) und FOOD_DES.txt (Beschreibungen).
//
// Gepflegt wird NUR tools/fooddb-usda.map.json: deutscher Name, Emoji,
// Synonyme und ein Suchmuster auf die englische USDA-Beschreibung. Die Zahlen
// kommen ausschliesslich aus der USDA-Datei — sie werden nie von Hand gesetzt.
//
//   node tools/build-fooddb.js            # laedt die Quelle (Netz noetig)
//   node tools/build-fooddb.js --check    # nur pruefen, nichts schreiben
//
// Eintraege, deren Name schon in js/fooddb.js steht, werden uebersprungen:
// die handgepflegte Basis-DB bleibt fuer diese Namen massgeblich, damit
// findInLocalDB() nicht zwei Treffer fuer denselben Namen hat.

var fs = require('fs');
var path = require('path');
var zlib = require('zlib');

var ROOT = path.join(__dirname, '..');
var MAP = path.join(__dirname, 'fooddb-usda.map.json');
var BASE = path.join(ROOT, 'js', 'fooddb.js');
var OUT = path.join(ROOT, 'js', 'fooddb-usda.js');
var TARBALL = 'https://registry.npmjs.org/fda-nutrient-database/-/fda-nutrient-database-1.0.2.tgz';
var CACHE = path.join(require('os').tmpdir(), 'nt-fda-nutrient-database-1.0.2.tgz');

// ─── Bezug der Quelldateien ──────────────────────────────────────────────────

function download(url) {
  return new Promise(function(resolve, reject) {
    require('https').get(url, function(res) {
      if (res.statusCode === 301 || res.statusCode === 302) {
        res.resume();
        return resolve(download(res.headers.location));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode + ' fuer ' + url));
      }
      var parts = [];
      res.on('data', function(c) { parts.push(c); });
      res.on('end', function() { resolve(Buffer.concat(parts)); });
    }).on('error', reject);
  });
}

// Minimaler tar-Leser — reicht fuer ein npm-Tarball und spart eine Abhaengigkeit.
// Ein tar besteht aus 512-Byte-Bloecken: Header (Name ab 0, Groesse ab 124 als
// Oktalzahl), danach der Inhalt auf volle 512 Byte aufgefuellt.
function untar(buf) {
  var files = {}, off = 0;
  while (off + 512 <= buf.length) {
    var name = buf.toString('utf8', off, off + 100).replace(/\0.*$/, '');
    if (!name) { off += 512; continue; }
    var size = parseInt(buf.toString('ascii', off + 124, off + 136).replace(/\0.*$/, '').trim(), 8) || 0;
    var type = buf.toString('ascii', off + 156, off + 157);
    off += 512;
    if (type === '0' || type === '\0') files[name] = buf.slice(off, off + size);
    off += Math.ceil(size / 512) * 512;
  }
  return files;
}

async function loadSource() {
  var tgz;
  if (fs.existsSync(CACHE)) {
    tgz = fs.readFileSync(CACHE);
  } else {
    process.stderr.write('lade ' + TARBALL + ' …\n');
    tgz = await download(TARBALL);
    try { fs.writeFileSync(CACHE, tgz); } catch (e) {}
  }
  var files = untar(zlib.gunzipSync(tgz));
  var abbrev = files['package/data/ABBREV.txt'];
  var desc = files['package/data/FOOD_DES.txt'];
  if (!abbrev || !desc) throw new Error('ABBREV.txt/FOOD_DES.txt fehlen im Tarball');
  return { abbrev: abbrev.toString('latin1'), desc: desc.toString('latin1') };
}

// ─── Parsen ──────────────────────────────────────────────────────────────────

// Die USDA-Dateien sind ^-getrennt, Textfelder stehen in ~Tilden~.
function cells(line) {
  return line.split('^').map(function(f) { return f.replace(/^~|~$/g, ''); });
}
function num(s) { var v = parseFloat(s); return isFinite(v) ? v : null; }

function parse(src) {
  var long = {};
  src.desc.split('\n').forEach(function(line) {
    if (!line.trim()) return;
    var f = cells(line);
    long[f[0]] = f[2];
  });
  var foods = [];
  src.abbrev.split('\n').forEach(function(line) {
    if (!line.trim()) return;
    var f = cells(line);
    // Feldreihenfolge laut sr28_doc.pdf, Abschnitt "Abbreviated File":
    // 0 NDB_No, 1 Shrt_Desc, 2 Water, 3 Energ_Kcal, 4 Protein, 5 Lipid_Tot,
    // 6 Ash, 7 Carbohydrt, 8 Fiber_TD, 9 Sugar_Tot, …, 15 Sodium
    foods.push({
      ndb: f[0],
      desc: long[f[0]] || f[1],
      kcal: num(f[3]), p: num(f[4]), f: num(f[5]), c: num(f[7]),
      fiber: num(f[8]), sugar: num(f[9]), sodium: num(f[15])
    });
  });
  return foods;
}

// ─── Aufloesen ───────────────────────────────────────────────────────────────

function resolve(map, foods) {
  var rows = [], problems = [];
  map.forEach(function(it) {
    var rx = new RegExp(it.q);
    var hits = foods.filter(function(v) { return v.desc && rx.test(v.desc); });
    if (!hits.length) { problems.push(it.n + ': kein Treffer fuer /' + it.q + '/'); return; }
    // Kuerzeste Beschreibung gewinnt — die ist die allgemeinste Variante.
    hits.sort(function(a, b) { return a.desc.length - b.desc.length; });
    if (hits.length > 1 && hits[0].desc.length === hits[1].desc.length) {
      problems.push(it.n + ': mehrdeutig — ' + hits.slice(0, 3).map(function(h) { return h.desc; }).join(' || '));
      return;
    }
    rows.push({ it: it, food: hits[0] });
  });
  return { rows: rows, problems: problems };
}

// Umlautfreie Zweitschreibung: die App vergleicht Synonyme exakt, "moehre"
// und "möhre" sind fuer sie zwei verschiedene Woerter.
function deumlaut(s) {
  return s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
          .replace(/ß/g, 'ss').replace(/é|è|ê/g, 'e').replace(/î/g, 'i');
}

function synonyms(name, s) {
  var out = {};
  (s || '').split(/\s+/).forEach(function(w) { if (w) out[w] = 1; });
  var plain = name.toLowerCase().replace(/\s*\([^)]*\)/g, '').trim();
  [plain, deumlaut(plain)].forEach(function(w) { if (w && w.indexOf(' ') === -1) out[w] = 1; });
  Object.keys(out).forEach(function(w) { out[deumlaut(w)] = 1; });
  return Object.keys(out).sort().join(' ');
}

function round(v, d) {
  if (v === null || v === undefined) return 0;
  var m = Math.pow(10, d);
  return Math.round(v * m) / m;
}

// ─── Schreiben ───────────────────────────────────────────────────────────────

function render(rows, skipped) {
  var byCat = {};
  rows.forEach(function(r) { (byCat[r.it.cat] = byCat[r.it.cat] || []).push(r); });
  var out = [];
  out.push('// NutriTrack – erweiterte Lebensmittel-Datenbank (' + rows.length + ' Eintraege).');
  out.push('//');
  out.push('// ERZEUGT von tools/build-fooddb.js — nicht von Hand bearbeiten.');
  out.push('// Gepflegt wird tools/fooddb-usda.map.json (deutscher Name, Emoji,');
  out.push('// Synonyme, Suchmuster); alle Zahlen stammen unveraendert aus:');
  out.push('//');
  out.push('//   US Department of Agriculture, Agricultural Research Service.');
  out.push('//   USDA National Nutrient Database for Standard Reference, Release 28');
  out.push('//   (2015). Public Domain.');
  out.push('//');
  out.push('// Felder wie in js/fooddb.js: n Name, e Emoji, k kcal/100g, p Protein,');
  out.push('// c Kohlenhydrate, f Fett, s Suchwoerter. Neu: g Zucker, b Ballaststoffe,');
  out.push('// l Salz (aus Natrium x 2,5). u = USDA-Kennnummer (NDB_No) zum Nachschlagen.');
  out.push('//');
  out.push('// ' + skipped + ' Zuordnungen sind uebersprungen, weil js/fooddb.js den Namen');
  out.push('// bereits fuehrt — dort steht die massgebliche Fassung.');
  out.push('window.DB_USDA=[');
  Object.keys(byCat).forEach(function(cat) {
    out.push('  // ' + cat);
    byCat[cat].forEach(function(r) {
      var f = r.food, it = r.it;
      var parts = [
        'n:' + JSON.stringify(it.n),
        'e:' + JSON.stringify(it.e),
        'k:' + round(f.kcal, 0),
        'p:' + round(f.p, 1),
        'c:' + round(f.c, 1),
        'f:' + round(f.f, 1),
        'g:' + round(f.sugar, 1),
        'b:' + round(f.fiber, 1),
        'l:' + round((f.sodium || 0) * 2.5 / 1000, 2),
        's:' + JSON.stringify(synonyms(it.n, it.s)),
        'u:' + JSON.stringify(f.ndb)
      ];
      out.push('  {' + parts.join(',') + '},');
    });
  });
  out.push('];');
  out.push('');
  out.push('// An die Basis-DB anhaengen. js/fooddb.js wird davor geladen und bleibt');
  out.push('// vorn im Array, damit findInLocalDB() bei gleichem Namen dort zuerst trifft.');
  out.push('window.DB=(window.DB||[]).concat(window.DB_USDA);');
  out.push('');
  return out.join('\n');
}

// ─── Ablauf ──────────────────────────────────────────────────────────────────

(async function main() {
  var check = process.argv.indexOf('--check') !== -1;
  var map = JSON.parse(fs.readFileSync(MAP, 'utf8'));
  var baseNames = {};
  (fs.readFileSync(BASE, 'utf8').match(/\{n:'([^']*)'/g) || []).forEach(function(m) {
    baseNames[m.slice(4, -1).toLowerCase()] = 1;
  });

  var seen = {}, dupes = [];
  map.forEach(function(it) {
    if (seen[it.n]) dupes.push(it.n);
    seen[it.n] = 1;
  });
  if (dupes.length) {
    console.error('✗ doppelte Namen in der Map: ' + dupes.join(', '));
    process.exit(1);
  }

  var wanted = map.filter(function(it) { return !baseNames[it.n.toLowerCase()]; });
  var skipped = map.length - wanted.length;

  var foods = parse(await loadSource());
  var res = resolve(wanted, foods);

  if (res.problems.length) {
    console.error('✗ ' + res.problems.length + ' Zuordnung(en) ohne eindeutigen Treffer:');
    res.problems.forEach(function(p) { console.error('  ' + p); });
    process.exit(1);
  }

  var js = render(res.rows, skipped);
  if (check) {
    var cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (cur !== js) {
      console.error('✗ js/fooddb-usda.js ist nicht auf dem Stand der Map — node tools/build-fooddb.js');
      process.exit(1);
    }
    console.log('✓ js/fooddb-usda.js passt zur Map (' + res.rows.length + " Eintraege, " + skipped + ' uebersprungen)');
    return;
  }
  fs.writeFileSync(OUT, js);
  console.log('✓ js/fooddb-usda.js: ' + res.rows.length + ' Eintraege, ' + skipped +
              ' uebersprungen (Name schon in js/fooddb.js), ' +
              Math.round(js.length / 1024) + ' KB');
})().catch(function(e) {
  console.error('✗ ' + e.message);
  process.exit(1);
});
