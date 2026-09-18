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

// ── 5. onclick-Ziele in generiertem HTML ──────────────────────────────────
// Der Rauchtest (tools/smoke.js) prueft nur, was zur Pruefzeit im DOM steht.
// Der weitaus groessere Teil der Knoepfe entsteht aber erst zur Laufzeit aus
// innerHTML-Strings — ein onclick darin, der beim Zerlegen des Monolithen auf
// einen inzwischen modul-privaten Namen zeigt, faellt dort nie auf. Diese
// Pruefung liest die Strings im Quelltext und loest sie gegen das auf, was
// global existiert.
{
  // Kommentare zuerst ausblenden: Ein Doku-Kommentar, der die Schreibweise
  // erklaert ("<button data-act=… statt onclick=foo()"), ist kein Aufruf. Diese
  // Pruefung ist genau daran zuerst rot geworden.
  const stripComments = (code) => code
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const sources = [['index.html', indexHtml]];
  for (const f of jsFiles) { if (!f.includes('zxing')) sources.push([f, stripComments(read(f))]); }

  // Global verfuegbar ist alles, was NICHT in einer IIFE gekapselt ist:
  // das Inline-Script von index.html und picker.js (das bewusst nie gekapselt
  // wurde — seine 93 Funktionen haengen direkt an window).
  const globals = new Set();
  for (const [file, code] of sources) {
    const encapsulated = /^\s*\(function\s*\(/m.test(code.split('\n').slice(0, 40).join('\n'));
    if (file !== 'index.html' && encapsulated) continue;
    for (const x of code.matchAll(/^\s*(?:async\s+)?function\s+([A-Za-z0-9_$]+)/gm)) globals.add(x[1]);
  }
  // Dazu alles, was ein Modul an window haengt. Der Export steht einzeilig
  // (dashboard.js) oder ueber mehrere Zeilen (baby.js) — die Klammerbilanz
  // deckt beides ab, ein Regex mit \n}; nur die zweite Form.
  const nsMembers = {};
  for (const [, code] of sources) {
    const start = code.search(/window\.NT[A-Za-z]+\s*=\s*\{/);
    if (start < 0) continue;
    const ns = code.slice(start).match(/window\.(NT[A-Za-z]+)/)[1];
    let i = code.indexOf('{', start), depth = 0, end = i;
    for (; i < code.length; i++) {
      if (code[i] === '{') depth++;
      else if (code[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    globals.add(ns);
    nsMembers[ns] = new Set([...code.slice(start, end).matchAll(/(?:^|[,{\s])([A-Za-z0-9_$]+)\s*:/gm)].map((x) => x[1]));
  }
  const HOST = new Set(['this','event','document','window','console','JSON','Math','Object','Array','String',
    'Number','Date','Promise','location','history','navigator','localStorage','sessionStorage','alert',
    'confirm','prompt','setTimeout','clearTimeout','setInterval','parseInt','parseFloat','encodeURIComponent',
    'decodeURIComponent','if','for','while','return','typeof','new','function','void','delete','in',
    'instanceof','else','do','switch','try','catch','throw','await','navigator']);

  let dead = 0, checked = 0;
  for (const [file, code] of sources) {
    // onclick="…" im Markup und onclick=\"…\" in JS-Strings
    const attrs = [...code.matchAll(/onclick=\\?["']((?:[^"'\\]|\\.)*)["']/g)].map((x) => x[1]);
    for (const a of attrs) {
      for (const c of a.match(/(?:^|[;{(\s!=&|?:])([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z0-9_$]+)*)\s*\(/g) || []) {
        const name = c.replace(/^[^A-Za-z_$]/, '').replace(/\s*\($/, '');
        const parts = name.split('.');
        if (HOST.has(parts[0])) continue;
        checked++;
        if (parts.length === 1) {
          if (!globals.has(parts[0])) { fail(`${file}: onclick ruft '${name}()' — weder globale Funktion noch Modul-Export.`); dead++; }
        } else if (nsMembers[parts[0]]) {
          if (!nsMembers[parts[0]].has(parts[1])) { fail(`${file}: onclick ruft '${name}()' — ${parts[0]} exportiert '${parts[1]}' nicht.`); dead++; }
        } else if (!globals.has(parts[0])) {
          fail(`${file}: onclick ruft '${name}()' — '${parts[0]}' existiert nicht.`); dead++;
        }
      }
    }
  }
  if (!dead) ok(`Alle ${checked} onclick-Ziele (auch in generiertem HTML) sind aufloesbar.`);

  // data-act geht denselben Weg: Die Delegation loest zur Klickzeit auf, ein
  // Tippfehler faellt sonst erst dort auf, wo jemand den Knopf drueckt.
  let deadAct = 0, acts = 0;
  for (const [file, code] of sources) {
    for (const m3 of code.matchAll(/\bdata-act="([^"]+)"/g)) {
      acts++;
      const parts = m3[1].split('.');
      if (parts.length > 1) {
        if (nsMembers[parts[0]]) {
          if (!nsMembers[parts[0]].has(parts[1])) { fail(`${file}: data-act="${m3[1]}" — ${parts[0]} exportiert '${parts[1]}' nicht.`); deadAct++; }
        } else if (!globals.has(parts[0])) { fail(`${file}: data-act="${m3[1]}" — '${parts[0]}' existiert nicht.`); deadAct++; }
      } else if (!globals.has(parts[0])) {
        fail(`${file}: data-act="${m3[1]}" — weder globale Funktion noch registrierte Aktion.`); deadAct++;
      }
    }
  }
  if (!deadAct) ok(`Alle ${acts} data-act-Ziele sind aufloesbar.`);

  // data-args muss gueltiges JSON sein — die Delegation wirft es sonst zur
  // Klickzeit weg und die Funktion bekommt gar keine Argumente.
  let badArgs = 0, argCount = 0;
  for (const [file, code] of sources) {
    for (const m4 of code.matchAll(/\bdata-args='([^']*)'/g)) {
      argCount++;
      const raw = m4[1].replace(/&#39;/g, "'").replace(/&amp;/g, '&');
      try {
        const v = JSON.parse(raw);
        if (!Array.isArray(v)) { fail(`${file}: data-args='${m4[1]}' ist kein Array.`); badArgs++; }
      } catch (e) { fail(`${file}: data-args='${m4[1]}' ist kein gueltiges JSON.`); badArgs++; }
    }
  }
  if (!badArgs) ok(`Alle ${argCount} data-args sind gueltiges JSON.`);

  // Ein Element mit beidem wuerde seine Aktion ZWEIMAL ausloesen: einmal ueber
  // das Attribut, einmal ueber die Delegation. Bei einem Loeschen-Knopf ist das
  // kein Schoenheitsfehler.
  let both = 0;
  for (const [file, code] of sources) {
    for (const tag of code.match(/<[^>]*\bdata-act="[^"]*"[^>]*>/g) || []) {
      if (/\bonclick=/.test(tag)) { fail(`${file}: Element traegt data-act UND onclick — die Aktion feuert zweimal: ${tag.slice(0, 90)}`); both++; }
    }
  }
  if (!both) ok('Kein Element traegt data-act und onclick zugleich.');
}

// ── 6. Ausgabe ────────────────────────────────────────────────────────────
notes.forEach((n) => console.log('  ok  ' + n));
warnings.forEach((w) => console.log('  !   ' + w));
if (errors.length) {
  console.error('\nFEHLER:');
  errors.forEach((e) => console.error('  x   ' + e));
  console.error(`\n${errors.length} Problem(e) gefunden.`);
  process.exit(1);
}
console.log('\nAlle Pruefungen bestanden.');
