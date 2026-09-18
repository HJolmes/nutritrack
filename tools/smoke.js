#!/usr/bin/env node
// NutriTrack – Rauchtest im echten Browser.
//
// Warum es das gibt: `node --check` findet Syntaxfehler, aber nicht die
// Fehlerklasse, die beim Zerlegen des Monolithen entsteht — eine Funktion, die
// in ein Modul gewandert ist und an ihrer alten Aufrufstelle nur noch als
// `undefined` ankommt. Das bricht die App erst zur LAUFZEIT und erst an der
// Stelle, an der jemand den Knopf drueckt.
//
// Der Test laedt die App in Chromium, sammelt JEDEN Konsolenfehler und jede
// unbehandelte Exception ein, prueft dass alle Namespaces stehen und klickt
// danach durch die Oberflaeche.
//
//   node tools/smoke.js          (braucht ein lokales http-server auf :8099)
'use strict';
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const BASE = process.env.SMOKE_URL || 'http://127.0.0.1:8099/index.html';

const EXPECTED_NAMESPACES = [
  'NTSync', 'NTBaby', 'NTShop', 'NTPartner', 'NTPlan', 'NTDash',
  'NTHealth', 'NTAlexa', 'NTPhotos', 'NTDrive',
  'NTRecur', 'NTStats', 'NTRemind', 'NTTpl', 'NTQueue',
];

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();

  const errors = [];
  const ignore = [/favicon/i, /manifest/i, /Failed to load resource/i, /ServiceWorker/i,
                  /net::ERR/i, /workers\.dev/i, /openfoodfacts/i, /404/];
  const record = (where, text) => {
    if (ignore.some((r) => r.test(text))) return;
    errors.push(`[${where}] ${text}`);
  };
  page.on('console', (m) => { if (m.type() === 'error') record('console', m.text()); });
  page.on('pageerror', (e) => record('pageerror', e.message));

  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(1200);

  // 1. Namespaces stehen?
  const ns = await page.evaluate((names) => {
    const out = {};
    names.forEach((n) => { out[n] = typeof window[n]; });
    return out;
  }, EXPECTED_NAMESPACES);
  let nsFail = 0;
  for (const [n, t] of Object.entries(ns)) {
    if (t !== 'object' && t !== 'function') { console.log(`  x   window.${n} fehlt (${t})`); nsFail++; }
  }
  if (!nsFail) console.log(`  ok  Alle ${EXPECTED_NAMESPACES.length} Namespaces geladen.`);

  // 2. Jede exportierte API ist wirklich aufrufbar — ein Export, der auf
  //    undefined zeigt, faellt sonst erst beim Klick auf.
  const badExports = await page.evaluate((names) => {
    const bad = [];
    names.forEach((n) => {
      const o = window[n];
      if (!o || typeof o !== 'object') return;
      Object.keys(o).forEach((k) => {
        const v = o[k];
        if (v === undefined || v === null) bad.push(`${n}.${k}`);
      });
    });
    return bad;
  }, EXPECTED_NAMESPACES);
  if (badExports.length) { badExports.forEach((b) => console.log(`  x   Export zeigt auf undefined: ${b}`)); }
  else console.log('  ok  Kein Export zeigt auf undefined.');

  // 3. Jedes onclick im Markup muss aufloesbar sein. Das ist die Pruefung, die
  //    beim Zerlegen des Monolithen zaehlt: eine Funktion, die ins Modul
  //    gewandert ist, aber im Markup noch unter ihrem alten globalen Namen steht.
  const deadHandlers = await page.evaluate(() => {
    const dead = [];
    document.querySelectorAll('[onclick]').forEach((el) => {
      const code = el.getAttribute('onclick');
      // Erster Bezeichner bzw. Namespace.methode vor der Klammer
      const calls = code.match(/(?:^|[;{(\s!])([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z0-9_$]+)*)\s*\(/g) || [];
      calls.forEach((c) => {
        const name = c.replace(/^[;{(\s!]/, '').replace(/\s*\($/, '');
        // Schluesselwoerter und Operatoren sind keine Funktionen.
        if (/^(if|for|while|return|typeof|new|function|void|delete|in|instanceof|else|do|switch|try|catch|throw|await)$/.test(name)) return;
        const root = name.split('.')[0];
        // `this` ist im onclick-Kontext das Element selbst, `event` das Ereignis —
        // beide sind zur Pruefzeit nicht aufloesbar und auch nie das Problem.
        if (['this', 'event', 'document', 'window', 'console', 'JSON', 'Math', 'Object', 'Array',
             'String', 'Number', 'Date', 'Promise', 'location', 'history', 'navigator',
             'localStorage', 'sessionStorage', 'alert', 'confirm', 'prompt', 'setTimeout',
             'clearTimeout', 'setInterval', 'parseInt', 'parseFloat', 'encodeURIComponent'].includes(root)) return;
        let ref = window;
        for (const part of name.split('.')) { ref = ref && ref[part]; }
        if (typeof ref !== 'function') dead.push(name + '  <- ' + (el.textContent || '').trim().slice(0, 24));
      });
    });
    return [...new Set(dead)];
  });
  if (deadHandlers.length) { deadHandlers.forEach((d) => console.log(`  x   toter onclick-Handler: ${d}`)); }
  else console.log('  ok  Jeder onclick-Handler im Markup ist aufloesbar.');

  // 4. Durch die Oberflaeche klicken. Onboarding ueberspringen, falls es kommt.
  await page.evaluate(() => {
    try {
      localStorage.setItem('nt_v6', JSON.stringify({ setupDone: true, name: 'Test', goal: 2000, currentDate: new Date().toISOString().slice(0, 10), days: {} }));
    } catch (e) {}
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1200);

  const clicked = [];
  for (const sel of ['#btnPause', '[onclick*="openSettings"]', '[onclick*="switchTab"]', '[onclick*="openOv"]']) {
    const el = await page.$(sel);
    if (el) {
      try { await el.click({ timeout: 1500, force: true }); clicked.push(sel); await page.waitForTimeout(250); } catch (e) {}
    }
  }
  console.log(`  ok  ${clicked.length} Oberflaechen-Element(e) angeklickt, ohne neuen Fehler.`);

  await browser.close();

  if (errors.length || nsFail || badExports.length || deadHandlers.length) {
    console.error('\nFEHLER:');
    [...new Set(errors)].forEach((e) => console.error('  x   ' + e));
    console.error(`\n${errors.length + nsFail + badExports.length + deadHandlers.length} Problem(e).`);
    process.exit(1);
  }
  console.log('\nRauchtest bestanden.');
})().catch((e) => { console.error('Rauchtest abgebrochen:', e.message); process.exit(1); });
