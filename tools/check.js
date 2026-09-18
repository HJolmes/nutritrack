#!/usr/bin/env node
// NutriTrack – Konsistenzpruefung vor dem Deploy.
//
// Warum es das gibt: Die App wird ohne Build-Tool ausgeliefert. Damit gibt es
// keine Stelle, die merkt, wenn (a) ein Syntaxfehler in den 5000 Zeilen Inline-JS
// steht, (b) der Versions-Bump in einer der vier Stellen vergessen wurde oder
// (c) ein neues js/-Modul nicht in sw.js CORE_ASSETS eingetragen ist. Alle drei
// Fehler sind still: Die Seite laedt, sieht richtig aus und ist trotzdem kaputt —
// (a) bricht die ganze App, (b) verhindert die Service-Worker-Cache-Invalidierung
// (Nutzer bekommen alte Stände), (c) bricht den Offline-Betrieb der PWA.
//
// Bewusst ohne npm/Abhaengigkeiten: laeuft mit blossem `node tools/check.js`
// lokal genauso wie in der GitHub Action.
//
// Exit-Code 0 = alles gut, 1 = mindestens ein Fehler.

'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const errors = [];
const warnings = [];
const notes = [];

function fail(msg) { errors.push(msg); }
function warn(msg) { warnings.push(msg); }
function ok(msg) { notes.push(msg); }

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const indexHtml = read('index.html');
const swJs = read('sw.js');

// ── 1. Versions-Konsistenz ────────────────────────────────────────────────
// APP_VERSION (index.html) == VERSION (sw.js) == jeder sichtbare "Beta vX.XXX".
const mApp = indexHtml.match(/APP_VERSION\s*=\s*'([^']+)'/);
const mSw = swJs.match(/VERSION\s*=\s*'([^']+)'/);

if (!mApp) fail('index.html: APP_VERSION nicht gefunden.');
if (!mSw) fail('sw.js: VERSION nicht gefunden.');

const appVersion = mApp && mApp[1];
const swVersion = mSw && mSw[1];

if (appVersion && swVersion) {
  if (appVersion !== swVersion) {
    fail(`Versions-Mismatch: index.html APP_VERSION='${appVersion}' aber sw.js VERSION='${swVersion}'. ` +
         `Beide muessen identisch sein, sonst greift die Service-Worker-Cache-Invalidierung nicht.`);
  } else {
    ok(`Version ${appVersion} in index.html und sw.js konsistent.`);
  }
}

// Sichtbare "Beta vX.XXX"-Literale. Dynamische ('Beta v'+APP_VERSION) sind
// per Definition korrekt und werden vom Regex nicht erfasst.
if (appVersion) {
  const literals = [...indexHtml.matchAll(/Beta v(\d+\.\d+)/g)];
  const wrong = literals.filter((m) => m[1] !== appVersion);
  if (wrong.length) {
    wrong.forEach((m) => {
      const line = indexHtml.slice(0, m.index).split('\n').length;
      fail(`index.html:${line}: sichtbarer Versionstext 'Beta v${m[1]}' weicht von APP_VERSION='${appVersion}' ab.`);
    });
  } else {
    ok(`${literals.length} hartkodierte(r) "Beta v"-Text stimmt mit APP_VERSION ueberein.`);
  }
}

// ── 2. JS-Syntax ──────────────────────────────────────────────────────────
// Ein Syntaxfehler in den ~5000 Zeilen Inline-JS macht die gesamte App stumm
// unbenutzbar. `node --check` findet ihn in Millisekunden.
function syntaxCheck(label, code, isModule) {
  const tmp = path.join(os.tmpdir(), `nt-check-${Date.now()}-${Math.random().toString(36).slice(2)}.${isModule ? 'mjs' : 'js'}`);
  try {
    fs.writeFileSync(tmp, code);
    execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
    return true;
  } catch (e) {
    const out = String((e.stderr || e.stdout || e.message) || '').replace(new RegExp(tmp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), label);
    fail(`Syntaxfehler in ${label}:\n${out.trim().split('\n').slice(0, 12).join('\n')}`);
    return false;
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
}

// 2a. Eigenstaendige JS-Dateien. Minifizierte Fremdbibliotheken bleiben draussen.
const jsFiles = ['picker.js'];
for (const f of fs.readdirSync(path.join(ROOT, 'js'))) {
  if (f.endsWith('.js')) jsFiles.push(path.join('js', f));
}
let jsOk = 0;
for (const f of jsFiles) {
  if (f.includes('zxing')) continue; // Fremdbibliothek, minifiziert
  const code = read(f);
  if (syntaxCheck(f, code, false)) jsOk++;
}
ok(`${jsOk} eigene JS-Datei(en) syntaktisch in Ordnung.`);

// 2b. Inline-<script>-Bloecke aus index.html. type="module" separat pruefen,
// weil dort import/export erlaubt ist.
const scriptRe = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g;
let m, inlineCount = 0, inlineOk = 0;
while ((m = scriptRe.exec(indexHtml)) !== null) {
  const attrs = m[1] || '';
  const body = m[2];
  if (!body.trim()) continue;
  // JSON-LD o.ae. ist kein JavaScript.
  if (/type\s*=\s*["']application\/(ld\+)?json["']/.test(attrs)) continue;
  const isModule = /type\s*=\s*["']module["']/.test(attrs);
  const line = indexHtml.slice(0, m.index).split('\n').length;
  inlineCount++;
  if (syntaxCheck(`index.html (inline <script> ab Zeile ${line})`, body, isModule)) inlineOk++;
}
ok(`${inlineOk}/${inlineCount} Inline-<script>-Bloecke syntaktisch in Ordnung.`);

// ── 3. Service-Worker-Abdeckung ───────────────────────────────────────────
// Jedes lokal eingebundene Script muss in CORE_ASSETS stehen, sonst laeuft die
// PWA offline in einen Netzwerkfehler statt aus dem Cache.
const mCore = swJs.match(/CORE_ASSETS\s*=\s*\[([\s\S]*?)\]/);
if (!mCore) {
  fail('sw.js: CORE_ASSETS nicht gefunden.');
} else {
  const coreAssets = [...mCore[1].matchAll(/'([^']+)'/g)].map((x) => x[1].replace(/^\.\//, ''));
  const srcs = [...indexHtml.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)]
    .map((x) => x[1])
    .filter((s) => !/^https?:\/\//.test(s));
  let missing = 0;
  for (const s of srcs) {
    const clean = s.replace(/^\.\//, '').split('?')[0];
    if (!fs.existsSync(path.join(ROOT, clean))) {
      fail(`index.html bindet '${s}' ein, aber die Datei existiert nicht.`);
      continue;
    }
    if (!coreAssets.includes(clean)) {
      fail(`'${clean}' ist in index.html eingebunden, fehlt aber in sw.js CORE_ASSETS — die PWA waere offline kaputt.`);
      missing++;
    }
  }
  if (!missing) ok(`Alle ${srcs.length} lokal eingebundenen Scripts stehen in sw.js CORE_ASSETS.`);

  // Umgekehrt: CORE_ASSETS darf nicht auf Dateileichen zeigen.
  for (const a of coreAssets) {
    if (a === '' || a.endsWith('/')) continue;
    if (!fs.existsSync(path.join(ROOT, a))) {
      fail(`sw.js CORE_ASSETS nennt '${a}', aber die Datei existiert nicht — der Install-Schritt schlaegt dafuer fehl.`);
    }
  }
}

// ── 4. Aktions-Registry (Event-Delegation) ────────────────────────────────
// Jedes data-act="name" im Markup braucht eine registrierte Aktion, sonst ist
// der Knopf im Bild und tut nichts. Gegenprobe zur Delegation aus v0.251.
const acts = new Set([...indexHtml.matchAll(/\bdata-act="([^"]+)"/g)].map((x) => x[1].split(':')[0]));
if (acts.size) {
  // Registriert wird entweder global (window.<fn>) oder per NTActions.register.
  const registered = new Set([
    ...[...indexHtml.matchAll(/^\s*(?:async\s+)?function\s+([A-Za-z0-9_$]+)/gm)].map((x) => x[1]),
    ...[...indexHtml.matchAll(/NTActions\.register\(\s*'([^']+)'/g)].map((x) => x[1]),
    ...[...indexHtml.matchAll(/NTActions\.register\(\s*\{([\s\S]*?)\}\s*\)/g)]
        .flatMap((x) => [...x[1].matchAll(/([A-Za-z0-9_$]+)\s*:/g)].map((y) => y[1])),
  ]);
  let unknown = 0;
  for (const a of acts) {
    if (!registered.has(a)) { fail(`data-act="${a}" hat keine registrierte Aktion — der Knopf tut nichts.`); unknown++; }
  }
  if (!unknown) ok(`Alle ${acts.size} data-act-Aktionen sind registriert.`);
}

// ── 5. Ausgabe ────────────────────────────────────────────────────────────
notes.forEach((n) => console.log('  ok  ' + n));
warnings.forEach((w) => console.log('  !   ' + w));
if (errors.length) {
  console.error('\nFEHLER:');
  errors.forEach((e) => console.error('  x   ' + e));
  console.error(`\n${errors.length} Problem(e) gefunden.`);
  process.exit(1);
}
console.log('\nAlle Pruefungen bestanden.');
