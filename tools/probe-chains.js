// TEMPORÄR (#307): Welche Ketten-Quellen erreichen die GitHub-Server? Wird vor dem Merge entfernt.
'use strict';
const { chromium } = require('playwright');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const T = [
  ['mcd', 'page', 'https://www.mcdonalds.com/de/de-de/produkte/alle-produkte/burger.html', (h) => (h.match(/\/product\//g) || []).length + ' Produktlinks'],
  ['bk', 'fetch', 'https://czqk28jt.apicdn.sanity.io/v2023-08-01/data/query/prod_bk_de?query=count(*%5B_type%3D%3D%22item%22%5D)', (t) => t.slice(0, 80)],
  ['dd', 'page', 'https://deananddavid.com/', (h) => (h.match(/Naehrwertuebersicht[^"]*\.pdf/) || ['kein PDF-Link'])[0]],
  ['sub', 'page', 'https://www.subway.com/de-de/menunutrition/nutrition', (h) => (h.match(/Nutritional[^"]*\.pdf/i) || ['kein PDF-Link'])[0]],
  ['sub-pdf', 'fetch', 'https://media.subway.com/dam/urn:aaid:aem:24d496bd-951b-4f8b-9887-acbee5d18960/original/as/Kopie%20von%20Germany%20Nutritional%20Information%20Full%20Menu%20C4%202026.pdf', (t, r) => r],
  ['kfc', 'kfcpdf', 'https://static.kfc.de/pdf/ALLERGENE.pdf', (t, r) => r],
  ['sb', 'page', 'https://www.starbucks.de/de/nutrition', (h) => (h.match(/N%C3%A4hrwert[^"]*\.pdf|Nährwert[^"]*\.pdf/) || ['kein PDF-Link'])[0].slice(0, 90)],
  ['bw', 'page', 'https://www.back-werk.de/de/sortiment/', (h) => (h.match(/\/de\/sortiment\/[a-z0-9-]+-\d+/g) || []).length + ' Produktlinks'],
  ['cf', 'page', 'https://products.coffee-fellows.com/print', (h) => (h.match(/kcal/gi) || []).length + '× kcal'],
  ['hig', 'page', 'https://menu.hansimglueck-burgergrill.de/?naehrwerte=true', (h) => (h.match(/kcal/gi) || []).length + '× kcal'],
  ['pp', 'page', 'https://peterpane.de/speisekarte/burger/', (h) => /Just a moment|cf-challenge/i.test(h) ? 'Cloudflare-Sperre' : (h.match(/speisekarte\/burger\/[a-z0-9-]+\/[a-z0-9-]+/g) || []).length + ' Produktlinks'],
];
(async () => {
  const b = await chromium.launch();
  for (const [id, kind, url, sig] of T) {
    const ctx = await b.newContext({ locale: 'de-DE', userAgent: UA });
    const p = await ctx.newPage();
    let line;
    try {
      if (kind === 'fetch') {
        const r = await p.request.get(url, { timeout: 30000 });
        const t = (await r.body()).toString('latin1');
        line = `HTTP ${r.status()} · ${sig(t, (r.headers()['content-type'] || '') + ' ' + t.length + ' B')}`;
      } else if (kind === 'kfcpdf') {
        await p.goto('https://static.kfc.de/', { timeout: 30000 }).catch(() => {});
        const r = await p.evaluate(async (u) => { try { const x = await fetch(u); const a = await x.arrayBuffer(); return x.status + ' ' + (x.headers.get('content-type') || '') + ' ' + a.byteLength + ' B'; } catch (e) { return 'Fehler ' + e.message; } }, url);
        line = r;
      } else {
        const r = await p.goto(url, { timeout: 45000 }).catch((e) => ({ status: () => 'ERR ' + e.message.split('\n')[0] }));
        await p.waitForTimeout(4000);
        const h = await p.content().catch(() => '');
        line = `HTTP ${r.status()} · ${sig(h)}`;
      }
    } catch (e) { line = 'Fehler ' + e.message.split('\n')[0]; }
    console.log(`PROBE ${id.padEnd(8)} ${line}`);
    await ctx.close();
  }
  await b.close();
})();
