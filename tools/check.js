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
// lokal genauso wie in der GitHub Action — auch dort, wo vorher kein `npm ci`
// lief (preview.yml, Bump). Seit #252 gibt es ein package.json, aber nur fuer
// Werkzeuge (devDependencies); diese Datei braucht keines davon.
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

// ── 1b. Auslieferung ohne Abhaengigkeiten (#252) ─────────────────────────
// Ausgeliefert wird der Quelltext, wie er im Repository steht. Werkzeuge
// (Pruefungen, Tests, Playwright) duerfen npm nutzen — als devDependencies.
// Eine Laufzeit-Abhaengigkeit oder ein Build-Schritt wuerde die Auslieferung
// still vom Repository loesen: GitHub Pages fuehrt keinen Build aus.
{
  let pkgFail = 0;
  if (fs.existsSync(path.join(ROOT, 'package.json'))) {
    let pkg = null;
    try { pkg = JSON.parse(read('package.json')); } catch (e) { fail('package.json ist kein gueltiges JSON: ' + e.message); pkgFail++; }
    if (pkg) {
      const deps = pkg.dependencies && Object.keys(pkg.dependencies);
      if (deps && deps.length) { fail(`package.json fuehrt dependencies (${deps.join(', ')}) — die App hat keine Laufzeit-Abhaengigkeit; Werkzeuge gehoeren nach devDependencies.`); pkgFail++; }
      for (const k of ['build', 'prebuild', 'prepare', 'preinstall', 'install', 'postinstall']) {
        if (pkg.scripts && pkg.scripts[k]) { fail(`package.json traegt das Skript '${k}' — kein Build- oder Installationsschritt neben der Auslieferung.`); pkgFail++; }
      }
    }
  }
  const viaPkg = [...indexHtml.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map((x) => x[1]).filter((s) => /^(\.\/)?(node_modules|dist)\//.test(s));
  viaPkg.forEach((s) => { fail(`index.html bindet '${s}' ein — ausgeliefert wird nur Quelltext, nichts aus node_modules/ oder dist/.`); pkgFail++; });
  if (!pkgFail) ok('Auslieferung ohne Abhaengigkeiten: package.json nur mit devDependencies, kein Build-Skript, kein Script aus node_modules/ oder dist/.');
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
// Der Worker gehoert dazu: Er wird ausgeliefert, und ein Syntaxfehler dort
// nimmt KI, Sync und Share-Links mit — auf allen Geraeten gleichzeitig.
// ES-Modul, deshalb als .mjs geprueft.
if (fs.existsSync(path.join(ROOT, 'worker/src/index.js'))) {
  if (syntaxCheck('worker/src/index.js', read('worker/src/index.js'), true)) jsOk++;
}
ok(`${jsOk} eigene JS-Datei(en) syntaktisch in Ordnung.`);

// Die Herkunfts-Freigabe steht an zwei Stellen: als Fallback im Quelltext und
// als wirksamer [vars]-Eintrag in wrangler.toml. Laufen sie auseinander,
// funktioniert eine Umgebung und die andere nicht — und zwar erst im Browser
// des Nutzers, als „Server nicht erreichbar".
{
  const toml = path.join(ROOT, 'worker/wrangler.toml');
  const wsrc = path.join(ROOT, 'worker/src/index.js');
  if (fs.existsSync(toml) && fs.existsSync(wsrc)) {
    const code = read('worker/src/index.js');
    const mDef = code.match(/const DEFAULT_ALLOWED_ORIGINS = \[([\s\S]*?)\];/);
    const mVar = read('worker/wrangler.toml').match(/ALLOWED_ORIGINS = "([^"]+)"/);
    if (mDef && mVar) {
      const inCode = new Set([...mDef[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]));
      const inToml = new Set(mVar[1].split(',').map((x) => x.trim()).filter(Boolean));
      const missing = [...inCode].filter((o) => !inToml.has(o));
      if (missing.length) {
        missing.forEach((o) => fail(`Herkunft '${o}' steht im Worker-Fallback, fehlt aber in wrangler.toml ALLOWED_ORIGINS.`));
      } else {
        ok(`Herkunfts-Freigabe konsistent (${inToml.size} Origins, davon ${inCode.size} auch im Fallback).`);
      }
    }
  }
}

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
// tab.html (#261) traegt ein eigenes kleines Inline-Script. Bricht es, bleibt
// ein zweites Fenster ohne Ausweg auf der Seite stehen.
if (fs.existsSync(path.join(ROOT, 'tab.html'))) {
  const tabHtml = read('tab.html');
  const tabRe = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g;
  let mt, tabCount = 0, tabOk = 0;
  while ((mt = tabRe.exec(tabHtml)) !== null) {
    if (!mt[2].trim()) continue;
    tabCount++;
    if (syntaxCheck(`tab.html (inline <script> ab Zeile ${tabHtml.slice(0, mt.index).split('\n').length})`, mt[2], false)) tabOk++;
  }
  ok(`tab.html: ${tabOk}/${tabCount} Inline-<script>-Bloecke syntaktisch in Ordnung.`);
}

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

  // Jedes lokale Script muss ?v=<APP_VERSION> tragen (tools/bump.js setzt es).
  // Fehlt es, liefert der alte Service Worker nach einem Update die ALTE Datei
  // aus seinem Cache zur NEUEN index.html.
  const appV = (indexHtml.match(/APP_VERSION\s*=\s*'([^']+)'/) || [])[1];
  const badV = srcs.filter((s) => (s.match(/[?&]v=([^&]+)/) || [])[1] !== appV);
  if (badV.length) {
    badV.forEach((s) => fail(`index.html bindet '${s}' ohne ?v=${appV} ein — node tools/bump.js ${appV} setzt es.`));
  } else {
    ok(`Alle ${srcs.length} lokalen Scripts tragen ?v=${appV}.`);
  }

  // Umgekehrt: CORE_ASSETS darf nicht auf Dateileichen zeigen.
  for (const a of coreAssets) {
    if (a === '' || a.endsWith('/')) continue;
    if (!fs.existsSync(path.join(ROOT, a))) {
      fail(`sw.js CORE_ASSETS nennt '${a}', aber die Datei existiert nicht — der Install-Schritt schlaegt dafuer fehl.`);
    }
  }
}

// ── 4. IDs im statischen Markup eindeutig ─────────────────────────────────
// getElementById liefert bei doppelter ID still das ERSTE Element. So schrieb
// der Link-Import seinen Quellenhinweis in ein verstecktes Feld im Chat-Panel,
// weil beide `pickerLinkSrcHint` hiessen (#263). Gelesen wird nur das Markup
// ausserhalb von <script> und Kommentaren; IDs in generiertem HTML entstehen zur
// Laufzeit und sind hier nicht sichtbar.
{
  const markup = indexHtml
    .replace(/<script[\s\S]*?<\/script>/g, (s) => s.replace(/[^\n]/g, ' '))
    .replace(/<!--[\s\S]*?-->/g, (s) => s.replace(/[^\n]/g, ' '));
  const seenId = new Map();
  let dupIds = 0;
  for (const mId of markup.matchAll(/<[a-zA-Z][^>]*?\sid="([^"]+)"/g)) {
    const line = markup.slice(0, mId.index).split('\n').length;
    if (seenId.has(mId[1])) {
      fail(`index.html:${line}: id="${mId[1]}" steht schon in Zeile ${seenId.get(mId[1])} — getElementById trifft nur das erste.`);
      dupIds++;
    } else {
      seenId.set(mId[1], line);
    }
  }
  if (!dupIds) ok(`Alle ${seenId.size} IDs im statischen Markup sind eindeutig.`);
}

// ── 4b. Standardtabelle der Lebensmittel-DB ───────────────────────────────
// Ein Wert in DB_DEFAULT, der auf keinen Eintrag zeigt, faellt nirgends auf:
// findInLocalDB() findet ihn nicht und meldet das Wort still als unbekannt
// (#265). Geladen wird wie im Browser: Basis-DB, dann die USDA-Ergaenzung.
{
  const vm = require('vm');
  const ctx = { window: {} };
  vm.createContext(ctx);
  try {
    vm.runInContext(read('js/fooddb.js'), ctx);
    vm.runInContext(read('js/fooddb-usda.js'), ctx);
    const names = new Set((ctx.window.DB || []).map((f) => f.n));
    const def = ctx.window.DB_DEFAULT || {};
    let badDef = 0;
    for (const [k, v] of Object.entries(def)) {
      if (k !== k.toLowerCase().trim()) { fail(`js/fooddb.js DB_DEFAULT: Schluessel '${k}' muss klein und ohne Leerraum stehen.`); badDef++; }
      if (!names.has(v)) { fail(`js/fooddb.js DB_DEFAULT['${k}'] = '${v}' — kein Eintrag dieses Namens in DB/DB_USDA.`); badDef++; }
    }
    if (!badDef) ok(`Alle ${Object.keys(def).length} Standardwerte der Lebensmittel-DB zeigen auf einen Eintrag.`);
  } catch (e) {
    fail('js/fooddb.js / js/fooddb-usda.js lassen sich nicht laden: ' + e.message);
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
      // Zur Laufzeit zusammengesetzt ('+f.id+'), nicht statisch aufloesbar.
      // Der Rauchtest prueft diese im DOM, wo sie fertig dastehen.
      if (/[+$]|\$\{/.test(m3[1])) continue;
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
      if (/[+$]|\$\{/.test(m4[1])) continue; // dito
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

  // Dieselbe Doppelbelegung, nur zur LAUFZEIT gesetzt: ein
  // `el.setAttribute('onclick', …)` auf ein Element, dessen Markup schon ein
  // `data-act` traegt. Die Pruefung darueber liest nur Tags und sah das nie —
  // und genau so ist es passiert: renderMealDetail() haengte dem ＋ im
  // Mahlzeit-Detail ein `onclick="openPicker('breakfast')"` an, der Knopf trug
  // aber `data-act="openPicker" data-args='[null]'`. Beides feuerte, das
  // data-args zuletzt, und die Zutat landete in der Mahlzeit nach der Uhrzeit
  // statt in der geoeffneten. Ein Doppelfeuer, das keine Zeile Markup verraet.
  const actIds = new Set();
  for (const [, code] of sources) {
    for (const tag of code.match(/<[^>]*\bdata-act="[^"]*"[^>]*>/g) || []) {
      const m = tag.match(/\bid="([^"]+)"/);
      if (m) actIds.add(m[1]);
    }
  }
  let late = 0, lateChecked = 0;
  for (const [file, code] of sources) {
    // Variable -> id, aus `var x = document.getElementById('y')`.
    const byVar = {};
    for (const m of code.matchAll(/\b([A-Za-z_$][\w$]*)\s*=\s*document\.getElementById\(['"]([^'"]+)['"]\)/g)) byVar[m[1]] = m[2];
    for (const m of code.matchAll(/(?:\b([A-Za-z_$][\w$]*)|getElementById\(['"]([^'"]+)['"]\))\s*\.setAttribute\(\s*['"]onclick['"]/g)) {
      lateChecked++;
      const id = m[2] || byVar[m[1]];
      if (id && actIds.has(id)) {
        fail(`${file}: setAttribute('onclick', …) auf #${id} — das Element traegt data-act, die Aktion feuert zweimal.`);
        late++;
      }
    }
  }
  if (!late) ok(`Keines der ${lateChecked} zur Laufzeit gesetzten onclick trifft ein data-act-Element.`);
}

// ── 5a. Das App-JS ist in der Typpruefung (#254) ────────────────────────
// tsconfig.json: checkJs true — tsc prueft jede Datei aus `include`, mit oder
// ohne Markierung: picker.js, js/*.js (ohne js/zxing/) und die klassischen
// Inline-Bloecke von index.html und tab.html. Ausgenommen: sw.js (Service-
// Worker-Scope), worker/, alexa/, tools/. Die Zeile `// @ts-check` bleibt
// trotzdem Pflicht in Zeile 1 jedes Moduls, von picker.js und jedes klassischen
// Inline-Blocks: Sie zeigt beim
// Lesen, dass die Datei geprueft wird, und haelt die Pruefung, falls checkJs je
// zurueckgestellt wird. @ts-ignore und @ts-nocheck schalten still ab — ein
// begruendetes `// @ts-expect-error <Grund>` meldet sich, sobald es nichts mehr
// unterdrueckt.
{
  let tsFail = 0, tsOn = 0;
  let tsconf = {};
  try { tsconf = JSON.parse(read('tsconfig.json')); } catch (e) { fail('tsconfig.json nicht lesbar: ' + e.message); tsFail++; }
  if (!(tsconf.compilerOptions && tsconf.compilerOptions.checkJs === true)) {
    fail('tsconfig.json: compilerOptions.checkJs muss true sein (#254 Stufe 1).'); tsFail++;
  }
  // Das Programm selbst: kein exclude/files, include deckt alles ab (sonst nimmt
  // eine Zeile in tsconfig.json still ein Modul aus der Pruefung).
  const inc = tsconf.include || [];
  const needInc = ['picker.js', 'js/*.js', '.typecheck/*.js'].filter((x) => !inc.includes(x));
  if (needInc.length || tsconf.exclude || tsconf.files) {
    fail(`tsconfig.json: include muss picker.js, js/*.js und .typecheck/*.js enthalten (fehlt: ${needInc.join(', ') || '–'}); exclude/files sind nicht erlaubt.`); tsFail++;
  }
  const tsSrc = ['picker.js', ...fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f)];
  const blocks = [];
  for (const [page, html] of [['index.html', indexHtml], ['tab.html', read('tab.html')]]) {
    const re = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g;
    let mb;
    while ((mb = re.exec(html)) !== null) {
      if (/type\s*=\s*["'](module|application\/(ld\+)?json)["']/.test(mb[1] || '') || !mb[2].trim()) continue;
      blocks.push([`${page} (Inline-Block ab Zeile ${html.slice(0, mb.index).split('\n').length})`, mb[2]]);
    }
  }
  for (const [name, code] of [...tsSrc.map((f) => [f, read(f)]), ...blocks]) {
    if (/^\s*\/\/\s*@ts-check\b/.test(code)) tsOn++;
    else { fail(`${name} beginnt nicht mit // @ts-check — das App-JS ist in der Typpruefung (npm run typecheck).`); tsFail++; }
    // Jedes Vorkommen: tsc wertet auch die letzte Zeile eines mehrzeiligen
    // /* … */ als Direktive aus.
    const bad = code.match(/@ts-(ignore|nocheck)\b/);
    if (bad) { fail(`${name} enthaelt @ts-${bad[1]} — stattdessen beheben, per JSDoc typisieren oder // @ts-expect-error <Grund>.`); tsFail++; }
    if (/@ts-expect-error[ \t]*(\*\/)?[ \t]*$/m.test(code)) { fail(`${name}: // @ts-expect-error ohne Grund — der Grund gehoert in dieselbe Zeile.`); tsFail++; }
  }
  // Jedes lokal eingebundene Script ist eine gepruefte Datei (Fremdcode unter js/zxing/ ausgenommen).
  const checkedSet = new Set(tsSrc);
  [...indexHtml.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map((x) => x[1].split('?')[0])
    .filter((src) => !/^https?:\/\//.test(src) && !src.startsWith('js/zxing/'))
    .forEach((src) => { if (!checkedSet.has(src)) { fail(`${src} wird in index.html geladen, liegt aber nicht unter js/ und ist nicht picker.js – ausserhalb der Typpruefung.`); tsFail++; } });
  if (!tsFail) ok(`${tsOn} Dateien/Inline-Bloecke mit // @ts-check, checkJs an, kein @ts-ignore/@ts-nocheck.`);
}

// ── 5c. Der Rechenkern bleibt rein (#255) ─────────────────────────────────
// js/calc.js laeuft in Node-Tests ohne Browser. Ein document., localStorage,
// fetch(, ein Toast, ein Overlay oder ein Timer darin wuerde dort brechen –
// oder, schlimmer, im Test unbemerkt nichts tun.
if (fs.existsSync(path.join(ROOT, 'js/calc.js'))) {
  const calc = read('js/calc.js').replace(/^\s*\/\/.*$/gm, '');
  const bad = ['document.', 'localStorage', 'fetch(', 'showToast', 'openOv', 'setTimeout'].filter((t) => calc.includes(t));
  if (bad.length) bad.forEach((t) => fail(`js/calc.js enthaelt '${t}' — der Rechenkern bleibt ohne Oberflaeche, Speicher, Netz und Timer.`));
  else ok('js/calc.js ist rein (kein document., localStorage, fetch(, showToast, openOv, setTimeout).');
}

// ── 5b. UEBERGABE.md bleibt knapp (#258) ──────────────────────────────────
// Jede Session liest diese Datei vor der ersten Handlung. Die Regel „knapp
// halten, ueberschreiben statt anhaengen“ stand darin und wurde trotzdem nicht
// eingehalten — die Datei wuchs von 44 auf 132 KB, weil nichts sie mass.
{
  const UE = 'UEBERGABE.md';
  if (fs.existsSync(path.join(ROOT, UE))) {
    const ue = read(UE);
    const bytes = Buffer.byteLength(ue, 'utf8');
    const section = (title) => {
      const i = ue.indexOf('\n## ' + title);
      if (i < 0) return null;
      const rest = ue.slice(i + 1);
      const j = rest.indexOf('\n## ', 3);
      return j < 0 ? rest : rest.slice(0, j);
    };
    let ueFail = 0;
    if (bytes > 30720) { fail(`${UE}: ${bytes} Byte, erlaubt sind 30 720 — Architektur ueberschreiben, alte Live-Tests als Issue oder streichen.`); ueFail++; }
    const arch = section('Architektur');
    if (!arch) { fail(`${UE}: Abschnitt „## Architektur“ fehlt.`); ueFail++; }
    else {
      const ab = Buffer.byteLength(arch, 'utf8');
      if (ab > 15360) { fail(`${UE}: Architektur ${ab} Byte, erlaubt sind 15 360.`); ueFail++; }
      const vs = arch.match(/\bv0\.\d+/g) || [];
      if (vs.length) { fail(`${UE}: Architektur nennt ${vs.length} Versionsnummer(n) (${[...new Set(vs)].slice(0, 5).join(', ')}) — die gehoeren in „Stand“ und die Historie.`); ueFail++; }
    }
    const lt = section('Live-Test offen');
    const ltCount = lt ? (lt.match(/^- /gm) || []).length : 0;
    if (ltCount > 12) { fail(`${UE}: ${ltCount} offene Live-Tests, erlaubt sind 12 — aeltere als fuenf Versionen werden Issue (Label live-test) oder gestrichen.`); ueFail++; }
    if (!ueFail) ok(`${UE}: ${bytes} Byte (≤ 30 720), Architektur ${arch ? Buffer.byteLength(arch, 'utf8') : 0} Byte ohne Versionsnummern, ${ltCount} offene Live-Tests.`);
  }
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
