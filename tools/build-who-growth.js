#!/usr/bin/env node
// Erzeugt js/baby-growth-data.js aus den WHO-Wachstumsstandards (2006).
//
// Quelle: offizielles WHO-Repository https://github.com/WorldHealthOrganization/anthro
// (R-Paket „anthro“), Verzeichnis data-raw/growthstandards/:
//   weianthro.txt (Gewicht), lenanthro.txt (Laenge/Groesse), hcanthro.txt (Kopfumfang)
// Format je Zeile: sex(1=Junge,2=Maedchen) age(Tage 0..1826) l m s [loh].
//
// Die Tabellen sind tagesgenau. Ausgeliefert werden die ersten 91 Tage taeglich
// (dort aendern sich die Kurven schnell), danach jeder 7. Tag plus Tag 1826;
// die App interpoliert L, M und S linear dazwischen. Das haelt die Datei klein
// und die Abweichung gegenueber der Tagestabelle unter 0,01 z.
//
// Aufruf: node tools/build-who-growth.js <pfad/zu/anthro/data-raw/growthstandards>

'use strict';
const fs = require('fs');
const path = require('path');

const src = process.argv[2];
if (!src) { console.error('Pfad zu data-raw/growthstandards fehlt.'); process.exit(1); }

const DAILY = 91, STEP = 7, MAX = 1826;
const AGES = [];
for (let d = 0; d < DAILY; d++) AGES.push(d);
for (let d = DAILY; d < MAX; d += STEP) AGES.push(d);
AGES.push(MAX);
// Laenge: bis Tag 730 liegend gemessen, ab 731 stehend (Groesse) – die Tabelle
// springt dort um ca. 0,7 cm. Beide Tage muessen Stuetzpunkte sein, sonst
// verschmiert die Interpolation den Sprung ueber eine ganze Woche.
[730, 731].forEach((d) => { if (!AGES.includes(d)) AGES.push(d); });
AGES.sort((a, b) => a - b);
const FILES = { w: 'weianthro.txt', l: 'lenanthro.txt', h: 'hcanthro.txt' };
const out = {};
for (const [k, f] of Object.entries(FILES)) {
  const rows = fs.readFileSync(path.join(src, f), 'utf8').trim().split(/\r?\n/).slice(1)
    .map((r) => r.split('\t'));
  out[k] = {};
  for (const sex of ['1', '2']) {
    const by = {};
    rows.filter((r) => r[0] === sex).forEach((r) => { by[+r[1]] = [+r[2], +r[3], +r[4]]; });
    const flat = [];
    AGES.forEach((d) => flat.push(...by[d]));
    out[k][sex === '1' ? 'm' : 'f'] = flat;
  }
}

const body = '// NutriTrack – WHO-Wachstumsstandards (2006), ERZEUGT von tools/build-who-growth.js.\n'
  + '// Nicht von Hand bearbeiten. Quelle: github.com/WorldHealthOrganization/anthro,\n'
  + '// data-raw/growthstandards (weianthro, lenanthro, hcanthro).\n'
  + '// Je Groesse (w=Gewicht kg, l=Laenge/Groesse cm, h=Kopfumfang cm) und Geschlecht\n'
  + '// (m/f) flach [L,M,S, L,M,S, …], je ein Tripel pro Alter in `ages` (Tage).\n'
  + 'window.NT_WHO_GROWTH=' + JSON.stringify({ max: MAX, ages: AGES, d: out }) + ';\n';
fs.writeFileSync(path.join(__dirname, '..', 'js', 'baby-growth-data.js'), body);
console.log('js/baby-growth-data.js geschrieben (' + body.length + ' Bytes).');
