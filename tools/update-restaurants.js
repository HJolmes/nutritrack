#!/usr/bin/env node
// Aktualisiert die Ketten mit maschinenlesbarer Quelle in js/restaurants.js (#307):
// Burger King, McDonald's, Coffee Fellows, BackWerk, Hans im Glück, Peter Pane.
// Vierteljährlich in .github/workflows/update-restaurants.yml (--only bk,cf,bw,hig,pp);
// McDonald's blockt GitHub-Server und läuft in der Claude-Routine (--only mcd).
// Lokal:
//   node tools/update-restaurants.js [--only mcd|bk|cf|bw|hig|pp[,…]] [--summary datei.md]
// (in der Claude-Umgebung mit NODE_USE_ENV_PROXY=1, damit fetch den Proxy nimmt)
//
// Ersetzt nur den Block zwischen /*gen:<id>*/ und /*/gen:<id>*/ und den Stand
// der Kette. dean&david, Subway, KFC und Starbucks kommen aus PDFs und bleiben unberührt.
//
// Regeln wie bei der ersten Befüllung – nichts wird geschätzt:
// - Werte je Portion; g = Portionsgewicht laut Quelle oder exakt aus Portions- und
//   100-g-Werten, sonst (Hans im Glück, Peter Pane) null → Buchung in Portionen
// - Produkte mit ≈ 0 kcal fallen still weg
// - kcal müssen zu den Makros passen (±20 %, 9·F + 4·KH + 4·E + 2·Ballaststoffe),
//   sonst fällt das Produkt weg (Ausnahme: Bier und Glühwein, deren kcal Alkohol enthalten)
// - Kohlenhydrate kleiner als Zucker → Kohlenhydrate = Zucker (Datenfehler der Quelle)
// - schrumpft eine Kette auf unter 60 % ihres bisherigen Bestands, bleibt der alte
//   Stand (Quelle vermutlich umgebaut oder blockiert) und die Zusammenfassung sagt es.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'js/restaurants.js');
const args = process.argv.slice(2);
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',').map((x) => x.trim()) : null;
const SUMMARY = args.includes('--summary') ? args[args.indexOf('--summary') + 1] : null;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return isFinite(n) ? n : null;
}
function fmt(v) { return v === null || v === undefined ? 'null' : String(Math.round(Number(v) * 100) / 100); }
function line(it) {
  return `{n:${JSON.stringify(it.n)},g:${fmt(it.g)},k:${fmt(it.k)},p:${fmt(it.p)},c:${fmt(it.c)},f:${fmt(it.f)},su:${fmt(it.su)},fi:${fmt(it.fi)},sa:${fmt(it.sa)}}`;
}
// Gemeinsame Prüfung; gibt das Produkt zurück, null (≈ 0 kcal, still weglassen)
// oder einen Grund für den Ausschluss. Optionen für die Ketten ab Coffee Fellows
// (VET_NEU): Gewicht darf fehlen (noWeight), ≈ 0 kcal heißt ≤ zeroMax, der
// Makro-Abgleich gilt schon ab checkFrom kcal (Zero-Limo mit 16 kcal), und Zucker
// gilt erst als größer als die Kohlenhydrate, wenn er sie um mehr als suTol
// übersteigt (Zucker hat dort 2, KH 1 Nachkommastelle). kjRatio = kJ/kcal laut
// Quelle: widerspricht es kcal (nicht 4,0–4,35), müssen die Makros kcal auf ±10 %
// bestätigen.
const ALCOHOL = /heineken|bier|glühwein/i;
function vet(it, o = {}) {
  if (it.k === null || it.k === undefined) return 'ohne kcal';
  if (o.zeroMax !== undefined ? it.k <= o.zeroMax : it.k < 3) return null;
  if (!o.noWeight && !(it.g > 0)) return 'ohne Gewicht';
  if (it.c !== null && it.su !== null && it.su > it.c + (o.suTol || 0)) it.c = it.su;
  const calc = 9 * (it.f || 0) + 4 * (it.c || 0) + 4 * (it.p || 0) + 2 * (it.fi || 0);
  const dev = Math.abs(calc - it.k) / it.k;
  if (it.k > (o.checkFrom !== undefined ? o.checkFrom : 30) && dev > 0.2 && !ALCOHOL.test(it.n)) return `kcal passen nicht (${fmt(it.k)} vs. ${Math.round(calc)} aus Makros)`;
  if (o.kjRatio && !(o.kjRatio > 4 && o.kjRatio < 4.35) && dev > 0.1) return `kJ widerspricht kcal (${fmt(o.kjRatio)} kJ/kcal), Makros bestätigen kcal nicht (${fmt(it.k)} vs. ${Math.round(calc)})`;
  return it;
}
const VET_NEU = { zeroMax: 5, checkFrom: 5, suTol: 0.05 };
// Runden wie Pythons round() der ersten Befüllung (bei exakter Mitte zur geraden Ziffer).
function rnd(x, d = 0) {
  if (x === null || x === undefined) return null;
  const s = Math.abs(x).toPrecision(40); // exakte Dezimaldarstellung des Doubles
  const [ip, fp = ''] = s.split('.');
  const digits = (ip + fp.padEnd(d, '0').slice(0, d)).replace(/^0+(?=\d)/, '');
  const rest = fp.slice(d).replace(/0+$/, '');
  let n = BigInt(digits || '0');
  if (rest && (rest[0] > '5' || (rest[0] === '5' && (rest.length > 1 || n % 2n === 1n)))) n += 1n;
  const v = Number(n) / 10 ** d;
  return x < 0 ? -v : v;
}
// HTML → Zeilen/Text (für die server-gerenderten Seiten).
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’', sbquo: '‚', ldquo: '“', rdquo: '”', bdquo: '„', acute: '´', euro: '€', reg: '®', trade: '™', szlig: 'ß', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', eacute: 'é', egrave: 'è', agrave: 'à', ntilde: 'ñ', ccedil: 'ç' };
function unesc(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1));
    return ENT[e] !== undefined ? ENT[e] : m;
  });
}
function stripTags(s, sep) {
  return unesc(s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, sep));
}
async function getText(url) {
  const r = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'de-DE,de;q=0.9' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} für ${url}`);
  return r.text();
}
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// ── Burger King: Datensatz prod_bk_de, ausgehend vom aktuellen Menü-Dokument ──
const BK_Q = 'https://czqk28jt.apicdn.sanity.io/v2023-08-01/data/query/prod_bk_de?query=';
async function bkQuery(q) {
  const r = await fetch(BK_Q + encodeURIComponent(q), { headers: { 'user-agent': UA } });
  if (!r.ok) throw new Error('Sanity HTTP ' + r.status);
  return (await r.json()).result;
}
function refs(o, acc) {
  if (Array.isArray(o)) o.forEach((v) => refs(v, acc));
  else if (o && typeof o === 'object') {
    if (typeof o._ref === 'string') acc.add(o._ref);
    Object.values(o).forEach((v) => refs(v, acc));
  }
}
async function fetchBK(skipped) {
  const menus = await bkQuery('*[_type=="menu" && !(_id in path("drafts.**"))]{_id}');
  if (!menus.length) throw new Error('kein Menü-Dokument');
  const FOLLOW = new Set(['menu', 'section', 'picker', 'combo', 'pickerAspect', 'pickerAspectValue', 'comboSlot', 'itemOptionModifier', 'pickerOption', 'offer', 'comboSlotOption']);
  const seen = new Map();
  let front = new Set(menus.map((m) => m._id));
  for (let depth = 0; depth < 6 && front.size; depth++) {
    const ids = [...front].filter((i) => !seen.has(i));
    const next = new Set();
    for (let k = 0; k < ids.length; k += 80) {
      const docs = await bkQuery('*[_id in ' + JSON.stringify(ids.slice(k, k + 80)) + ']');
      docs.forEach((d) => {
        seen.set(d._id, d);
        if (FOLLOW.has(d._type)) refs(d, next);
      });
    }
    front = next;
  }
  const REN = { 'Große King Pommes': 'King Pommes groß', 'mittlere King Pommes': 'King Pommes mittel', 'Kleine King Pommes': 'King Pommes klein' };
  const best = new Map();
  for (const d of seen.values()) {
    if (d._type !== 'item') continue;
    let n = ((d.name && d.name.de) || '').trim();
    if (/Aufpreis/.test(n)) continue;
    n = REN[n] || n;
    n = n.replace(/[®™]/g, '').replace(/’/g, "'").replace(/\s+/g, ' ').trim();
    const nu = d.nutrition || {};
    if (!nu.weight || nu.calories === null || nu.calories === undefined || nu.calories < 3) continue;
    const key = n.toLowerCase().replace(' (bk lieferservice)', '').replace('0,5l', '0,5 l').replace('jr.', 'jr').replace(/\s+/g, ' ');
    const lief = /Lieferservice/.test(n);
    const old = best.get(key);
    if (!old || (old.lief && !lief) || (old.lief === lief && d._updatedAt > old.upd)) best.set(key, { n, nu, lief, upd: d._updatedAt });
  }
  const out = [];
  [...best.values()].sort((a, b) => (a.n.toLowerCase() < b.n.toLowerCase() ? -1 : a.n.toLowerCase() > b.n.toLowerCase() ? 1 : 0)).forEach(({ n, nu }) => {
    const it = vet({ n, g: num(nu.weight), k: num(nu.calories), p: num(nu.proteins), c: num(nu.carbohydrates), f: num(nu.fat), su: num(nu.sugar), fi: num(nu.fiber), sa: num(nu.salt) });
    if (typeof it === 'string') skipped.push(n + ': ' + it);
    else if (it) out.push(it);
  });
  return out;
}

// ── McDonald's: Produktseiten im Browser (Akamai blockt reine HTTP-Abrufe) ──
const MCD = 'https://www.mcdonalds.com';
const MCD_CATS = ['alle-produkte', 'alle-produkte/burger', 'alle-produkte/mcwrap', 'alle-produkte/mccrispy', 'alle-produkte/mcnuggets-fingerfood', 'alle-produkte/veggie-und-plantbased', 'alle-produkte/beilagen-extras', 'alle-produkte/fruehstueck', 'alle-produkte/getraenke', 'alle-produkte/desserts', 'alle-produkte/mccafe', 'alle-produkte/mcsmart-snacks', 'alle-produkte/highlights'];
async function fetchMCD(skipped) {
  const { chromium } = require('playwright');
  const opt = { args: ['--ignore-certificate-errors'] };
  if (process.env.HTTPS_PROXY) opt.proxy = { server: process.env.HTTPS_PROXY };
  if (fs.existsSync('/opt/pw-browsers/chromium')) opt.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(opt);
  try {
    const page = await browser.newPage({ locale: 'de-DE', userAgent: UA });
    const links = new Set();
    for (const c of MCD_CATS) {
      await page.goto(`${MCD}/de/de-de/produkte/${c}.html`, { timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(2500);
      (await page.$$eval('a[href*="/product/"]', (as) => as.map((a) => a.getAttribute('href')))).forEach((h) => links.add(h.split('?')[0]));
    }
    if (!links.size) throw new Error('keine Produktlinks (Seite umgebaut oder blockiert)');
    const rows = [];
    for (const h of links) {
      const slug = h.split('/').pop().replace('.html', '');
      // Auf die Nährwert-Antwort der Seite warten (bis 20 s), einmal neu laden,
      // wenn sie ausbleibt – eine feste Wartezeit verlor im Test 3 von 151 Produkten.
      let got = null;
      for (let attempt = 0; attempt < 2 && !got; attempt++) {
        const wait = page.waitForResponse((r) => /dnaapp\/itemDetails/.test(r.url()), { timeout: 20000 }).catch(() => null);
        await page.goto(MCD + h, { timeout: 45000 }).catch(() => {});
        const r = await wait;
        if (r) {
          try { got = { id: (r.url().match(/item=(\d+)/) || [])[1], json: JSON.parse(await r.text()) }; } catch (e) { got = null; }
        }
      }
      if (got) rows.push({ key: slug + '__' + got.id + '.json', item: got.json.item });
      else skipped.push(slug + ': keine Nährwert-Antwort der Produktseite');
    }
    rows.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const out = [], seen = new Set();
    for (const { item } of rows) {
      if (!item) continue;
      let n = item.item_marketing_name || item.item_name || '';
      n = n.replace(/®/g, '').replace(/ /g, ' ').replace(/McVeggie(?=\S)/g, 'McVeggie ').replace(/\s+/g, ' ').trim();
      if (/^Wahlzutat/.test(n)) n = 'McFlurry/McSundae ' + n;
      const nf = {};
      ((item.nutrient_facts && item.nutrient_facts.nutrient) || []).forEach((x) => { if (x && x.nutrient_name_id) nf[x.nutrient_name_id] = x; });
      const v = (k) => num(nf[k] && nf[k].value);
      let g = v('primary_serving_size');
      if (g !== null && nf.primary_serving_size.uom === 'L') g *= 1000;
      const it = vet({ n, g, k: v('energy_kcal'), p: v('protein'), c: v('carbohydrate'), f: v('fat'), su: v('sugar'), fi: v('fiber'), sa: v('salt') });
      if (typeof it === 'string') { skipped.push(n + ': ' + it); continue; }
      if (!it || seen.has(n)) continue;
      seen.add(n);
      out.push(it);
    }
    return out;
  } finally {
    await browser.close();
  }
}

// ── Coffee Fellows: Druckansicht aller Produkte, je Produkt Spalten „100g“ und „pro Portion“ ──
const CF = 'https://products.coffee-fellows.com/print';
const CF_LAB = { 'Brennwert (kj)': 'kj', 'Brennwert (kcal)': 'k', 'Fett': 'f', 'davon gesättigte Fettsäuren': 'sat', 'Kohlenhydrate': 'c', 'davon Zucker': 'su', 'Eiweiß': 'p', 'Salz': 'sa', 'Ballaststoffe': 'fi' };
// Schreibfehler der Quelle (wortweise, greifen auch bei neuen Produkten mit demselben Wort).
const CF_TYPO = [[/bröchten\b/g, 'brötchen'], [/Bröchten\b/g, 'Brötchen'], [/\bOmlette\b/g, 'Omelette'], [/\bMayonaise\b/g, 'Mayonnaise'], [/^Red velvet\b/, 'Red Velvet'],
  [/\bIngwer Zitrone Karotte- Saft\b/, 'Ingwer, Zitrone, Karotte – Saft'], [/^Topfit- +/, 'Topfit – ']];
function cfName(raw) {
  let n = raw.replace(/\s+/g, ' ').trim();
  CF_TYPO.forEach(([re, to]) => { n = n.replace(re, to); });
  n = n
    .replace(/\s*\((?:CS|Sylt)(?:\s*\/\s*(?:CS|Sylt))*\)/gi, '') // Filial-Hinweise (CS)/(Sylt)
    .replace(/\s*\(NEUE?\b[^)]*\)/gi, '') // (NEU ab …), (NEUE Rezeptur ab …)
    .replace(/\s*-\s*NEUE Rezeptur\b.*$/i, '') // „Large- NEUE Rezeptur gültig ab …“
    .replace(/\s*\(gültig ab[^)]*\)/gi, '')
    .replace(/(\((?:Small|Medium|Large)\))\s*-\s.*$/, '$1') // „(Large) - koffeinhaltiges Erfrischungsgetränk“
    .replace(/\s+(?:gültig\s+)?(?:ab|bis)\s+(?:Sommer|Winter|Herbst|Frühling|Frühjahr)\S*\s+[\d/]+$/i, '') // „ab Sommerkarte 26“
    .replace(/\s+NEU$/, '')
    .replace(/\s*\(?\s*\b(Small|Medium|Large)\s*\)?$/, ' ($1)') // Größe einheitlich in Klammern
    .replace(/(\p{L})- (?=\p{L})/gu, '$1-') // „Mandel- Bienenstich“
    .replace(/\s+/g, ' ').trim();
  return n;
}
async function fetchCF(skipped) {
  const html = await getText(CF);
  const parts = html.split('<p class="mb-3 font-semibold">').slice(1);
  if (!parts.length) throw new Error('keine Produkte (Seite umgebaut?)');
  const rows = [];
  for (const part of parts) {
    const L = stripTags(part, '\n').split('\n').map((l) => l.trim()).filter((l) => l && l !== '--');
    const raw = L[0];
    if (/gültig bis/i.test(raw)) { skipped.push(raw.replace(/\s+/g, ' ') + ': alte Rezeptur (laut Quelle nur befristet gültig)'); continue; }
    const i = L.indexOf('Nährwertangaben');
    if (i < 0) { skipped.push(raw + ': keine Nährwerttabelle'); continue; }
    const cols = [];
    let k = i + 1;
    while (k < L.length && !(L[k] in CF_LAB)) cols.push(L[k++]);
    const v = {};
    while (k < L.length && L[k] in CF_LAB) { v[CF_LAB[L[k]]] = L.slice(k + 1, k + 1 + cols.length).map(num); k += 1 + cols.length; }
    const ip = cols.indexOf('pro Portion'), ih = cols.findIndex((c) => /^100\s*(g|ml)$/i.test(c));
    const at = (key, idx) => (v[key] && idx >= 0 ? v[key][idx] : null);
    if (ip < 0 || at('k', ip) === null) { skipped.push(raw + ': keine Werte je Portion'); continue; }
    let kP = at('k', ip), k100 = at('k', ih);
    const kjP = at('kj', ip), kj100 = at('kj', ih);
    // kJ ist immer ≈ 4,18 × kcal; ist die kJ-Spalte kleiner als die kcal-Spalte, sind
    // beide in der Quelle vertauscht (Red-Velvet-Muffin, 2026): kcal aus der kJ-Spalte.
    if (kjP !== null && kj100 !== null && k100 !== null && kjP < kP && kj100 < k100) { kP = kjP; k100 = kj100; }
    // Portionsgewicht steht nicht in der Quelle: exakt kcal je Portion / kcal je 100 g.
    const g = k100 ? rnd(kP / k100 * 100, 1) : null;
    rows.push({ raw, n: cfName(raw), g, kjr: kjP && kP ? kjP / kP : null, k: rnd(kP, 1), p: rnd(at('p', ip), 1), c: rnd(at('c', ip), 1), f: rnd(at('f', ip), 1), su: rnd(at('su', ip), 2), fi: rnd(at('fi', ip), 2), sa: rnd(at('sa', ip), 2) });
  }
  const out = [];
  for (const r of rows) {
    const it = vet({ n: r.n, g: r.g === null ? null : rnd(r.g), k: r.k, p: r.p, c: r.c, f: r.f, su: r.su, fi: r.fi, sa: r.sa }, Object.assign({ kjRatio: r.kjr, noWeight: true }, VET_NEU));
    if (typeof it === 'string') skipped.push(r.raw + ': ' + it);
    else if (it) { it.g1 = r.g; out.push(it); }
  }
  // Gleicher Name nach der Bereinigung (z. B. zwei Croissant-Größen): Gewicht anhängen.
  const cnt = new Map();
  out.forEach((it) => cnt.set(it.n, (cnt.get(it.n) || 0) + 1));
  const seen = new Set();
  return out.filter((it) => {
    if (cnt.get(it.n) > 1) it.n += ` (${it.g1} g)`;
    delete it.g1;
    if (seen.has(it.n)) return false;
    seen.add(it.n);
    return true;
  });
}

// ── BackWerk: Sortiment → Produktseiten (je 100 g + Verkaufsgewicht) ──
const BW = 'https://www.back-werk.de';
const BW_LAB = { 'verkaufsgewicht': 'g', 'brennwert (kcal)': 'k', 'brennwert (kj)': 'kj', 'kohlenhydrate': 'c', 'davon zucker': 'su', 'fett': 'f', 'eiweiß': 'p', 'salz': 'sa', 'ballaststoffe': 'fi' };
async function fetchBW(skipped) {
  const list = await getText(BW + '/de/sortiment/');
  const slugs = [...new Set([...list.matchAll(/href="\/de\/sortiment\/([a-z0-9-]+)\?lang=de"/g)].map((m) => m[1]))].sort();
  if (!slugs.length) throw new Error('keine Produktlinks (Seite umgebaut?)');
  const out = [];
  for (const slug of slugs) {
    let page;
    try { page = await getText(`${BW}/de/sortiment/${slug}?lang=de`); } catch (e) { skipped.push(slug + ': ' + e.message); continue; }
    const nm = page.match(/<h1>([^<]*)<\/h1>\s*<time>/);
    const n = nm ? unesc(nm[1]).replace(/\s+/g, ' ').trim() : slug;
    const hi = page.indexOf('Durchschnittliche Nährwerte');
    if (hi < 0) { skipped.push(n + ': keine Nährwerte angegeben'); continue; }
    const hdr = stripTags(page.slice(hi, hi + 80), ' ');
    const tbl = (page.slice(hi).match(/<table[\s\S]*?<\/table>/) || [''])[0];
    const v = {};
    for (const m of tbl.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
      const td = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => stripTags(x[1], ' ').replace(/\s+/g, ' ').trim());
      const key = td.length === 2 && BW_LAB[td[0].toLowerCase()];
      if (key) v[key] = num((td[1].match(/[\d.,]+/) || [])[0]);
    }
    if (!/je 100 ?g/i.test(hdr)) { skipped.push(n + ': Nährwerte nicht je 100 g (' + hdr.trim() + ')'); continue; }
    if (v.k === undefined || v.k === null) { skipped.push(n + ': keine Nährwerte angegeben'); continue; }
    if (!(v.g > 0)) { if (v.k > 5) skipped.push(n + ': nur Werte je 100 g, kein Verkaufsgewicht'); continue; }
    const per = (x, d = 1) => (x === null || x === undefined ? null : rnd(x * v.g / 100, d));
    const it = vet({ n, g: rnd(v.g), k: per(v.k), p: per(v.p), c: per(v.c), f: per(v.f), su: per(v.su), fi: per(v.fi), sa: per(v.sa, 2) }, Object.assign({ kjRatio: v.kj && v.kj / v.k }, VET_NEU));
    if (typeof it === 'string') skipped.push(n + ': ' + it);
    else if (it) out.push(it);
  }
  return out;
}

// ── Hans im Glück: digitale Speisekarte, Daten als turbo-stream im HTML eingebettet ──
const HIG = 'https://menu.hansimglueck-burgergrill.de/?naehrwerte=true';
// React Router serialisiert die Loader-Daten als flaches Array mit Verweisen
// (turbo-stream): Objekte {"_<Schlüsselindex>": <Wertindex>}, Arrays aus Indizes,
// negative Indizes sind Konstanten.
function turboDecode(a) {
  const C = { '-1': undefined, '-2': NaN, '-3': -Infinity, '-4': -0, '-5': null, '-6': Infinity, '-7': undefined };
  const memo = new Map();
  const val = (i) => {
    if (i < 0) return C[i];
    if (memo.has(i)) return memo.get(i);
    const v = a[i];
    if (Array.isArray(v)) {
      if (typeof v[0] === 'string') return v; // Sondertypen (Datum, Promise …) kommen hier nicht vor
      const out = []; memo.set(i, out); v.forEach((j) => out.push(val(j))); return out;
    }
    if (v && typeof v === 'object') {
      const o = {}; memo.set(i, o);
      for (const k of Object.keys(v)) o[a[+k.slice(1)]] = val(v[k]);
      return o;
    }
    return v;
  };
  return val(0);
}
const HIG_SMALL = new Set(['im', 'mit', 'und', 'von', 'der', 'die', 'das']);
// Namen kommen in Großbuchstaben: „KLASSIK“ → „Klassik“, „HANS IM GLÜCK“ → „Hans im Glück“.
function higName(n) {
  if (/\p{Ll}/u.test(n)) return n;
  return n.split(' ').map((w, i) => {
    const l = w.toLowerCase();
    return i > 0 && HIG_SMALL.has(l) ? l : l.charAt(0).toUpperCase() + l.slice(1);
  }).join(' ');
}
async function fetchHIG(skipped) {
  const html = await getText(HIG);
  const m = html.match(/streamController\.enqueue\(("(?:[^"\\]|\\.)*")\)/);
  if (!m) throw new Error('keine eingebetteten Kartendaten (Seite umgebaut?)');
  const data = turboDecode(JSON.parse(JSON.parse(m[1]).split('\n')[0]));
  const cats = data && data.loaderData && data.loaderData.root && data.loaderData.root.menuData && data.loaderData.root.menuData.categories;
  if (!Array.isArray(cats)) throw new Error('menuData.categories fehlt');
  const out = [], seen = new Set(), names = new Set();
  const sortKeys = (o) => JSON.stringify(Object.keys(o).sort().reduce((a, k) => ((a[k] = o[k]), a), {}));
  for (const c of cats) {
    for (const sc of c.subcategories || []) {
      for (const p of sc.items || []) {
        let n = String(p.name || '').replace(/[®™]/g, '').replace(/\s+/g, ' ').trim();
        // „Gesamt“ = Standardaufbau (bei Burgern Sauerteigbrot + Standard-Bratling).
        const nv = p.nutritionalValues || {};
        const key = n + '|' + sortKeys(nv);
        if (seen.has(key)) continue;
        seen.add(key);
        if (nv.energy === null || nv.energy === undefined) { skipped.push(n + ': keine Nährwerte'); continue; }
        const it = vet({ n, g: null, k: rnd(nv.energy), p: rnd(nv.protein, 1), c: rnd(nv.carbohydrates, 1), f: rnd(nv.fat, 1), su: rnd(nv.sugar, 1), fi: rnd(nv.fiber, 1), sa: rnd(nv.salt, 1) }, Object.assign({ noWeight: true }, VET_NEU));
        if (typeof it === 'string') { skipped.push(n + ': ' + it); continue; }
        if (!it) continue;
        if (names.has(n)) n += ' (' + String(sc.name || c.name || '').trim() + ')';
        names.add(n);
        it.n = higName(n);
        out.push(it);
      }
    }
  }
  return out;
}

// ── Peter Pane: Produktliste aus der Shop-API, Werte von den Produktseiten ──
// Cloudflare lässt je Browserkontext nur wenige Seiten durch → je Seite ein frischer
// Kontext. Nur peterpane.de (www.peterpane.de ist gesperrt).
const PP = 'https://peterpane.de';
function ppNum(x) {
  if (x === null || x === undefined) return null;
  x = x.trim();
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(x)) x = x.replace(/\./g, ''); // 2.257 kJ
  return num(x);
}
function ppParse(html) {
  const tm = html.match(/<h1[^>]*class="[^"]*product_title[^"]*"[^>]*>([\s\S]*?)<\/h1>/);
  const n = tm ? unesc(tm[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim() : null;
  const t = stripTags(html, ' ').replace(/ /g, ' ').replace(/\s+/g, ' ');
  const i = t.indexOf('Durchschnittliche Nährwerte');
  if (i < 0) return { n, d: null };
  const seg = t.slice(i, i + 700);
  const g = (lbl) => {
    const m = seg.match(new RegExp(lbl + '\\s*:?\\s*([\\d.,]+)\\s*(?:g|kJ|kcal)?'));
    return m && /\d/.test(m[1]) ? ppNum(m[1]) : null;
  };
  return { n, d: { perPortion: /je Portion/.test(seg.slice(0, 60)), k: g('Kalorien'), p: g('Eiweiß'), c: g('Kohlenhydrate'), su: g('davon Zucker'), f: g('Fett'), fi: g('Ballaststoffe'), sa: g('(?:Koch)?[Ss]alz') } };
}
async function fetchPP(skipped) {
  const { chromium } = require('playwright');
  const opt = { args: ['--ignore-certificate-errors', '--disable-blink-features=AutomationControlled'] };
  if (process.env.HTTPS_PROXY) opt.proxy = { server: process.env.HTTPS_PROXY };
  if (fs.existsSync('/opt/pw-browsers/chromium')) opt.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(opt);
  // Eine Seite in frischem Kontext laden, Cloudflare-Prüfung abwarten, bis ok(Inhalt)
  // stimmt; bis zu 3 Versuche.
  async function load(url, asText, ok) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const ctx = await browser.newContext({ locale: 'de-DE', userAgent: UA });
      try {
        const page = await ctx.newPage();
        await page.route(/\.(avif|png|jpe?g|webp|gif|woff2?|svg)(\?|$)/, (r) => r.abort());
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
        for (let i = 0; i < 15; i++) {
          if (!/Just a moment|Einen Moment/i.test(await page.title().catch(() => ''))) {
            const body = asText ? await page.evaluate(() => document.body.innerText).catch(() => null) : await page.content().catch(() => null);
            if (body && ok(body)) return body;
          }
          await page.waitForTimeout(1500);
        }
      } finally { await ctx.close(); }
      await sleep(15000);
    }
    return null;
  }
  try {
    const urls = new Set();
    for (let pg = 1; pg < 20; pg++) {
      const txt = await load(`${PP}/wp-json/wc/store/v1/products?per_page=100&page=${pg}`, true, (b) => /^\s*\[/.test(b));
      if (txt === null) throw new Error(`Produktliste Seite ${pg} nicht abrufbar (Cloudflare?)`);
      const arr = JSON.parse(txt);
      arr.forEach((p) => { if (/^https:\/\/peterpane\.de\/speisekarte\//.test(p.permalink || '')) urls.add(p.permalink); });
      if (arr.length < 100) break;
    }
    if (!urls.size) throw new Error('keine Produkte in der Shop-API');
    const list = [...urls].sort();
    const pages = new Array(list.length).fill(null);
    // Drei Kontexte parallel; mehr lässt Cloudflare häufiger prüfen.
    let next = 0;
    await Promise.all([0, 1, 2].map(async () => {
      while (next < list.length) {
        const i = next++;
        pages[i] = await load(list[i], false, (b) => /class="[^"]*product_title/.test(b));
        await sleep(1000);
      }
    }));
    const out = [], seen = new Set(), names = new Set();
    list.forEach((u, i) => {
      if (pages[i] === null) { skipped.push(u + ': Seite nicht abrufbar (Cloudflare?)'); return; }
      const { n: raw, d } = ppParse(pages[i]);
      if (!raw) { skipped.push(u + ': kein Produktname'); return; }
      let n = raw.replace(/[®™]/g, '').replace(/\s+/g, ' ').trim();
      if (!d || d.k === null) { skipped.push(n + ': Produktseite ohne Nährwerte'); return; }
      if (!d.perPortion) { skipped.push(n + ': Nährwerte nicht je Portion'); return; }
      const key = [n, d.k, d.p, d.c, d.f].join('|');
      if (seen.has(key)) return; // dasselbe Produkt in mehreren Kategorien
      seen.add(key);
      const it = vet({ n, g: null, k: rnd(d.k), p: rnd(d.p, 1), c: rnd(d.c, 1), f: rnd(d.f, 1), su: rnd(d.su, 1), fi: rnd(d.fi, 1), sa: rnd(d.sa, 1) }, Object.assign({ noWeight: true }, VET_NEU));
      if (typeof it === 'string') { skipped.push(n + ': ' + it); return; }
      if (!it) return;
      if (names.has(n)) it.n = n + ' (' + u.replace(/\/$/, '').split('/').slice(-2, -1)[0] + ')';
      names.add(it.n);
      out.push(it);
    });
    return out;
  } finally {
    await browser.close();
  }
}

// ── Datei schreiben ──
function oldItems(src, id) {
  const m = src.match(new RegExp(`/\\*gen:${id}\\*/([\\s\\S]*?)/\\*/gen:${id}\\*/`));
  if (!m) throw new Error(`Marker /*gen:${id}*/ fehlt in js/restaurants.js`);
  const ctx = { out: [] };
  // Die Zeilen sind JS-Objektliterale; als Array auswerten.
  ctx.out = Function('"use strict";return [' + m[1] + '];')();
  return ctx.out;
}
function replaceBlock(src, id, items, stand) {
  const body = '\n      ' + items.map(line).join(',\n      ');
  src = src.replace(new RegExp(`(/\\*gen:${id}\\*/)[\\s\\S]*?(\\n\\s*/\\*/gen:${id}\\*/)`), (_, a, b) => a + body + b);
  return src.replace(new RegExp(`(\\{id:'${id}'[\\s\\S]*?stand:')[^']*(')`), `$1${stand}$2`);
}
function diff(oldL, newL) {
  const o = new Map(oldL.map((x) => [x.n, x])), n = new Map(newL.map((x) => [x.n, x]));
  const added = newL.filter((x) => !o.has(x.n)).map((x) => x.n);
  const removed = oldL.filter((x) => !n.has(x.n)).map((x) => x.n);
  const changed = newL.filter((x) => o.has(x.n) && line(x) !== line(o.get(x.n))).map((x) => {
    const a = o.get(x.n);
    return `${x.n}: ${a.k} → ${x.k} kcal, ${a.g} → ${x.g} g`;
  });
  return { added, removed, changed };
}

(async () => {
  let src = fs.readFileSync(FILE, 'utf8');
  const d = new Date();
  const stand = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  const md = ['## Ketten-Update ' + d.toISOString().slice(0, 10), ''];
  let anyChange = false, anyFail = false;
  const CHAINS = [['bk', 'Burger King', fetchBK], ['mcd', "McDonald's", fetchMCD], ['cf', 'Coffee Fellows', fetchCF], ['bw', 'BackWerk', fetchBW], ['hig', 'Hans im Glück', fetchHIG], ['pp', 'Peter Pane', fetchPP]];
  if (ONLY) ONLY.filter((id) => !CHAINS.some((c) => c[0] === id)).forEach((id) => { throw new Error('unbekannte Kette: ' + id); });
  for (const [id, label, fn] of CHAINS) {
    if (ONLY && !ONLY.includes(id)) continue;
    const old = oldItems(src, id);
    const skipped = [];
    let items;
    try { items = await fn(skipped); } catch (e) {
      anyFail = true;
      md.push(`### ${label}: nicht aktualisiert`, '', `Fehler: ${e.message}. Alter Stand bleibt.`, '');
      console.error(label, e);
      continue;
    }
    if (items.length < old.length * 0.6) {
      anyFail = true;
      md.push(`### ${label}: nicht aktualisiert`, '', `Nur ${items.length} statt bisher ${old.length} Produkte – Quelle vermutlich umgebaut. Alter Stand bleibt.`, '');
      continue;
    }
    const df = diff(old, items);
    const same = !df.added.length && !df.removed.length && !df.changed.length && items.map((x) => x.n).join('|') === old.map((x) => x.n).join('|');
    md.push(`### ${label}: ${items.length} Produkte (vorher ${old.length})${same ? ' – unverändert' : ''}`, '');
    if (!same) {
      anyChange = true;
      src = replaceBlock(src, id, items, stand);
      if (df.added.length) md.push(`**Neu (${df.added.length}):** ${df.added.join(', ')}`, '');
      if (df.removed.length) md.push(`**Entfallen (${df.removed.length}):** ${df.removed.join(', ')}`, '');
      if (df.changed.length) md.push(`**Geänderte Werte (${df.changed.length}):**`, ...df.changed.map((c) => '- ' + c), '');
    }
    if (skipped.length) md.push(`<details><summary>Ausgeschlossen (${skipped.length})</summary>`, '', ...skipped.map((s) => '- ' + s), '', '</details>', '');
  }
  if (anyChange) fs.writeFileSync(FILE, src);
  if (SUMMARY) fs.writeFileSync(SUMMARY, md.join('\n') + '\n');
  console.log(md.join('\n'));
  console.log(anyChange ? 'GEAENDERT' : 'UNVERAENDERT');
  process.exitCode = anyFail && !anyChange ? 2 : 0;
})();
