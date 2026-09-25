#!/usr/bin/env node
// Setzt APP_VERSION (index.html), VERSION (sw.js), jeden sichtbaren
// "Beta vX.XXX"-Text und das ?v= an jedem lokalen <script src> in einem Zug. Die drei Stellen von Hand zu pflegen ist die
// haeufigste stille Fehlerquelle des Projekts — tools/check.js findet sie
// hinterher, dieses Skript verhindert sie vorher.
//   node tools/bump.js          -> +0.001
//   node tools/bump.js 0.260    -> auf genau diesen Wert
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const ix = path.join(ROOT, 'index.html');
const sw = path.join(ROOT, 'sw.js');

let html = fs.readFileSync(ix, 'utf8');
let swjs = fs.readFileSync(sw, 'utf8');
const cur = html.match(/APP_VERSION\s*=\s*'([^']+)'/)[1];
const next = process.argv[2] || (Math.round((parseFloat(cur) + 0.001) * 1000) / 1000).toFixed(3);

html = html.replace(/APP_VERSION\s*=\s*'[^']+'/, `APP_VERSION='${next}'`);
const literals = (html.match(/Beta v\d+\.\d+/g) || []).length;
html = html.replace(/Beta v\d+\.\d+/g, `Beta v${next}`);
swjs = swjs.replace(/VERSION\s*=\s*'[^']+'/, `VERSION = '${next}'`);
// Lokale Scripts tragen ?v=<Version>. Der ALTE Service Worker findet diese URL
// nicht in seinem Cache und holt die Datei frisch — sonst traf die neue,
// network-first geladene index.html auf alte Module aus dem Cache (v0.261:
// Reiter „Meilensteine“ tot, weil js/baby.js noch ohne setTab kam).
const scripts = (html.match(/<script[^>]*\bsrc="(?!https?:)[^"]+"/g) || []).length;
html = html.replace(/(<script[^>]*\bsrc="(?!https?:)[^"?]+)(\?v=[^"]*)?"/g, `$1?v=${next}"`);

fs.writeFileSync(ix, html);
fs.writeFileSync(sw, swjs);
console.log(`${cur} -> ${next}  (APP_VERSION, sw.js VERSION, ${literals}x sichtbarer Text, ${scripts} Script-URLs)`);
