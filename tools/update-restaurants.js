#!/usr/bin/env node
// Aktualisiert McDonald's und Burger King in js/restaurants.js (#307).
// Burger King läuft vierteljährlich in .github/workflows/update-restaurants.yml
// (--only bk); McDonald's blockt GitHub-Server und läuft in der Claude-Routine
// (--only mcd, aus der Claude-Umgebung erreichbar). Lokal:
//   node tools/update-restaurants.js [--only mcd|bk] [--summary datei.md]
// (in der Claude-Umgebung mit NODE_USE_ENV_PROXY=1, damit fetch den Proxy nimmt)
//
// Ersetzt nur den Block zwischen /*gen:<id>*/ und /*/gen:<id>*/ und den Stand
// der Kette. dean&david und Subway kommen aus PDFs und bleiben unberührt.
//
// Regeln wie bei der ersten Befüllung – nichts wird geschätzt:
// - nur Produkte mit Portionsgewicht und kcal ≥ 3
// - kcal müssen zu den Makros passen (±20 %, 9·F + 4·KH + 4·E + 2·Ballaststoffe),
//   sonst fällt das Produkt weg (Ausnahme: Bier, dessen kcal Alkohol enthalten)
// - Kohlenhydrate kleiner als Zucker → Kohlenhydrate = Zucker (Datenfehler der Quelle)
// - schrumpft eine Kette auf unter 60 % ihres bisherigen Bestands, bleibt der alte
//   Stand (Quelle vermutlich umgebaut oder blockiert) und die Zusammenfassung sagt es.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'js/restaurants.js');
const args = process.argv.slice(2);
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
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
// Gemeinsame Prüfung; gibt das Produkt zurück oder einen Grund für den Ausschluss.
function vet(it) {
  if (!(it.g > 0) || it.k === null) return 'ohne Gewicht/kcal';
  if (it.k < 3) return null; // ≈ 0 kcal: still weglassen
  if (it.c !== null && it.su !== null && it.su > it.c) it.c = it.su;
  const calc = 9 * (it.f || 0) + 4 * (it.c || 0) + 4 * (it.p || 0) + 2 * (it.fi || 0);
  if (it.k > 30 && Math.abs(calc - it.k) / it.k > 0.2 && !/heineken|bier/i.test(it.n)) return `kcal passen nicht (${it.k} vs. ${Math.round(calc)})`;
  return it;
}

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
  for (const [id, label, fn] of [['bk', 'Burger King', fetchBK], ['mcd', "McDonald's", fetchMCD]]) {
    if (ONLY && ONLY !== id) continue;
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
