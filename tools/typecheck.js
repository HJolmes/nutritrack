#!/usr/bin/env node
// Typpruefung ohne Build (#254): `tsc --noEmit` ueber picker.js, js/*.js und die
// Inline-Scripts aus index.html. Es entsteht keine Datei, die ausgeliefert wird —
// die Auslieferung bleibt der Quelltext (#252).
//
// Dateien ohne import/export teilen in tsc einen globalen Scope: Die rund 350
// Top-Level-Funktionen aus index.html sind damit in allen Modulen bekannt, ohne
// dass irgendwo eine Liste gepflegt wird. Geprueft wird nur, was in Zeile 1
// `// @ts-check` traegt (tsconfig.json: checkJs false) — Opt-in je Datei.
//
// Die Inline-Bloecke landen in .typecheck/inline_<n>.js, mit so vielen
// Leerzeilen davor, dass jede gemeldete Zeile die Zeile in index.html ist; im
// Fehlertext steht danach index.html statt des Hilfspfads. Ein Block wird
// geprueft, wenn `// @ts-check` in seiner ersten Zeile steht. Der Modul-Block
// (<script type="module">) bleibt draussen.
//
//   npm run typecheck        (braucht npm ci)
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '.typecheck');
const TSC = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');

if (!fs.existsSync(TSC)) {
  console.error('typescript fehlt — zuerst `npm ci`.');
  process.exit(2);
}

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT);

const re = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g;
let m, n = 0;
const blocks = [];
while ((m = re.exec(html)) !== null) {
  const attrs = m[1] || '';
  if (/type\s*=\s*["'](module|application\/(ld\+)?json)["']/.test(attrs)) continue;
  if (!m[2].trim()) continue;
  n++;
  // Zeile des Inhalts-Beginns = Zeile des Zeichens direkt nach `<script…>`.
  const start = m.index + m[0].indexOf('>') + 1;
  const line = html.slice(0, start).split('\n').length;
  const file = `inline_${n}.js`;
  fs.writeFileSync(path.join(OUT, file), '\n'.repeat(line - 1) + m[2]);
  const checked = /^\s*\/\/\s*@ts-check\b/.test(m[2]);
  blocks.push({ file, line, checked });
}

const t0 = Date.now();
const r = spawnSync(process.execPath, [TSC, '-p', path.join(ROOT, 'tsconfig.json'), '--pretty', 'false'], { encoding: 'utf8', cwd: ROOT });
const out = ((r.stdout || '') + (r.stderr || '')).replace(/\.typecheck[\\/]inline_\d+\.js/g, 'index.html');
if (out.trim()) process.stdout.write(out);
const errors = (out.match(/error TS\d+/g) || []).length;
console.log(`typecheck: ${blocks.filter((b) => b.checked).length}/${blocks.length} Inline-Bloecke mit @ts-check, ` +
  `${errors} Fehler, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(r.status === 0 ? 0 : 1);
