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
// Playwright liegt je nach Maschine lokal, global oder gar nicht vor. Kein
// Eintrag in package.json, weil dieses Projekt bewusst keine hat — der Test ist
// ein Werkzeug, keine Abhaengigkeit der App.
function loadPlaywright() {
  const tries = ['playwright', '/opt/node22/lib/node_modules/playwright',
                 process.env.PLAYWRIGHT_PATH].filter(Boolean);
  for (const t of tries) { try { return require(t); } catch (e) { /* naechster */ } }
  console.error('Playwright nicht gefunden. Installieren mit:  npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}
const { chromium } = loadPlaywright();

// Chromium ebenso: vorinstalliert unter /opt/pw-browsers oder von Playwright
// selbst verwaltet (dann kein executablePath noetig).
function chromePath() {
  const fs2 = require('fs');
  for (const p of ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', process.env.CHROMIUM_PATH]) {
    if (p && fs2.existsSync(p)) return p;
  }
  return undefined;
}

const BASE = process.env.SMOKE_URL || 'http://127.0.0.1:8099/index.html';

const EXPECTED_NAMESPACES = [
  'NTSync', 'NTBaby', 'NTShop', 'NTPartner', 'NTPlan', 'NTDash',
  'NTHealth', 'NTAlexa', 'NTPhotos', 'NTDrive',
  'NTRecur', 'NTStats', 'NTRemind', 'NTTpl', 'NTQueue', 'NTFeat',
];

(async () => {
  const browser = await chromium.launch({ executablePath: chromePath() });
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

  // 3b. data-act geht denselben Weg wie onclick — die Delegation loest erst zur
  //     Klickzeit auf, ein Tippfehler faellt sonst erst dort auf, wo jemand
  //     drueckt.
  const deadActs = await page.evaluate(() => {
    const dead = [];
    document.querySelectorAll('[data-act]').forEach((el) => {
      const name = el.getAttribute('data-act');
      if (typeof window.NTActions.resolve(name) !== 'function') {
        dead.push(name + '  <- ' + (el.textContent || '').trim().slice(0, 24));
      }
    });
    return [...new Set(dead)];
  });
  if (deadActs.length) deadActs.forEach((d) => console.log(`  x   data-act ohne Funktion: ${d}`));
  else console.log('  ok  Jedes data-act im DOM ist aufloesbar.');

  // 3c. Feuert die Delegation ueberhaupt, und genau EINMAL? Das ist der Beleg,
  //     den die statische Pruefung nicht liefern kann. Ein Element mit onclick
  //     UND data-act wuerde hier als 2 gezaehlt.
  const fired = await page.evaluate(() => {
    const el = document.querySelector('[data-act]');
    if (!el) return { err: 'kein data-act im DOM' };
    const name = el.getAttribute('data-act');
    let n = 0;
    const orig = window.NTActions.resolve(name);
    // Aufruf abfangen, ohne die echte Funktion laufen zu lassen.
    const reg = {}; reg[name] = function () { n++; };
    window.NTActions.register(reg);
    el.click();
    return { name: name, calls: n };
  });
  if (fired.err || fired.calls !== 1) {
    console.log(`  x   Delegation feuerte ${fired.calls}x fuer '${fired.name}' (erwartet: 1x) ${fired.err || ''}`);
  } else {
    console.log(`  ok  Delegation feuert genau 1x (geprueft an '${fired.name}').`);
  }

  // 3d. Argumente kommen typrichtig an. Eine stille Wandlung "7" -> 7 oder
  //     umgekehrt bricht jeden ===-Vergleich auf einer ID.
  const argsOk = await page.evaluate(() => {
    // Bewusst ein Element mit NICHT-String-Argument: Bei ["text"] sehen
    // "typrichtig" und "still nach String gewandelt" gleich aus, und der Test
    // meldete gruen, obwohl die Wandlung eingebaut war.
    const all = [...document.querySelectorAll('[data-act][data-args]')];
    const el = all.find((x) => {
      try {
        const v = JSON.parse(x.getAttribute('data-args').replace(/&#39;/g, "'").replace(/&amp;/g, '&'));
        return v.some((a) => typeof a !== 'string');
      } catch (e) { return false; }
    }) || all[0];
    if (!el) return { err: 'kein data-args im DOM' };
    const name = el.getAttribute('data-act');
    const expected = JSON.parse(el.getAttribute('data-args').replace(/&#39;/g, "'").replace(/&amp;/g, '&'));
    let got = null;
    const reg = {}; reg[name] = function () { got = Array.prototype.slice.call(arguments); };
    window.NTActions.register(reg);
    el.click();
    return { name: name, expected: expected, got: got, same: JSON.stringify(expected) === JSON.stringify(got) };
  });
  if (argsOk.err || !argsOk.same) console.log(`  x   data-args kamen falsch an bei '${argsOk.name}': ${JSON.stringify(argsOk.got)} statt ${JSON.stringify(argsOk.expected)} ${argsOk.err || ''}`);
  else console.log(`  ok  data-args kommen typrichtig an (geprueft an '${argsOk.name}': ${JSON.stringify(argsOk.expected)}).`);

  // 3f. Die drei uebrigen Zusagen der Delegation. Alle drei werden an eigens
  //      gebauten Proben gemessen statt an dem, was das Markup gerade hergibt:
  //      `data-stop` kommt im Markup ueberhaupt nicht vor, und ein Fehler darin
  //      waere sonst unbemerkt geblieben (die Gegenprobe hat genau das gezeigt).
  const mech = await page.evaluate(() => {
    const out = {};
    const box = document.createElement('div');
    document.body.appendChild(box);

    // (a) closest(): ein Klick auf das Icon IM Knopf muss den Knopf treffen.
    //     Ohne closest() verliert jeder Knopf mit Inhalt seine Wirkung.
    box.innerHTML = '<button data-act="__pA"><span id="__inner">x</span></button>';
    let a = 0; window.__pA = function () { a++; };
    document.getElementById('__inner').click();
    out.closest = a;

    // (b) data-bg-close: schliesst NUR beim Klick auf den Grund selbst, nicht
    //     auf den Inhalt darin. Das war die Bedingung in bgClose().
    let closedWith = [];
    const realClose = window.closeOv;
    window.closeOv = function (id) { closedWith.push(id); };
    box.innerHTML = '<div id="__bg" data-bg-close="__ovTest"><div id="__child">inhalt</div></div>';
    document.getElementById('__child').click();
    out.bgChild = closedWith.length;        // erwartet 0
    document.getElementById('__bg').click();
    out.bgSelf = closedWith.length;         // erwartet 1
    out.bgId = closedWith[0];
    window.closeOv = realClose;

    // (c) data-stop gegen einen FREMDEN Listener am Elternelement. Zwei
    //     verschachtelte data-act taugen dafuer nicht: Die Delegation laeuft
    //     einmal je Klick und nimmt ueber closest() ohnehin nur den innersten —
    //     mit und ohne stopPropagation sieht das Ergebnis gleich aus, und der
    //     erste Anlauf dieses Tests blieb deshalb gruen, obwohl die Zeile
    //     ausgebaut war.
    let outer = 0, inner = 0;
    box.innerHTML = '<div id="__outer"><button data-act="__pInner" data-stop>x</button></div>';
    document.getElementById('__outer').addEventListener('click', function () { outer++; });
    window.__pInner = function () { inner++; };
    box.querySelector('[data-act="__pInner"]').click();
    out.stopInner = inner; out.stopOuter = outer;

    // (d) Ein abgeschalteter Knopf im Aktionsbereich loest nichts aus.
    let dis = 0;
    box.innerHTML = '<div data-act="__pDis"><button id="__db" disabled><span id="__ds">x</span></button></div>';
    window.__pDis = function () { dis++; };
    document.getElementById('__ds').click();
    out.disabled = dis;
    delete window.__pDis;

    box.remove();
    delete window.__pA; delete window.__pOuter; delete window.__pInner;
    return out;
  });
  let mechFail = 0;
  const say = (okCond, good, bad) => { if (okCond) console.log('  ok  ' + good); else { console.log('  x   ' + bad); mechFail++; } };
  say(mech.closest === 1, 'Klick auf ein Kind-Element trifft den Knopf darueber (closest).',
      `Klick auf ein Kind loeste ${mech.closest}x aus statt 1x — Knoepfe mit Icon waeren wirkungslos.`);
  say(mech.bgChild === 0 && mech.bgSelf === 1 && mech.bgId === '__ovTest',
      'data-bg-close schliesst nur beim Klick auf den Grund, nicht auf den Inhalt.',
      `data-bg-close falsch: Kind=${mech.bgChild} (erwartet 0), selbst=${mech.bgSelf} (erwartet 1), id=${mech.bgId}`);
  say(mech.stopInner === 1 && mech.stopOuter === 0,
      'data-stop haelt das Ereignis von einem fremden Listener am Elternelement fern.',
      `data-stop wirkt nicht: Aktion=${mech.stopInner} (erwartet 1), Elternlistener=${mech.stopOuter} (erwartet 0)`);
  say(mech.disabled === 0,
      'Ein abgeschalteter Knopf im Aktionsbereich loest die Aktion nicht aus.',
      `Abgeschalteter Knopf loeste die Aktion ${mech.disabled}x aus (erwartet 0).`);

  // 3e. Der echte Doppelfeuer-Fall: ein Element, das beides traegt. Er entsteht
  //      bei jeder halben Migration und kostet bei einem Loeschen-Knopf Daten.
  //      (Ein zweimal registrierter Listener ist KEIN solcher Fall — der Browser
  //      dedupliziert identische (type, fn, capture); der erste Anlauf dieses
  //      Tests hat das geprueft und nichts gemessen.)
  const dbl = await page.evaluate(() => {
    const probe = document.createElement('button');
    probe.setAttribute('data-act', '__smokeProbe');
    probe.setAttribute('onclick', '__smokeProbe()');
    document.body.appendChild(probe);
    let n = 0;
    window.__smokeProbe = function () { n++; };
    probe.click();
    probe.remove();
    delete window.__smokeProbe;
    return n;
  });
  if (dbl === 2) console.log('  ok  Doppelbelegung (onclick + data-act) wuerde zweimal feuern — genau das schliesst tools/check.js aus.');
  else console.log(`  x   Doppelfeuer-Probe ergab ${dbl} statt 2 — der Test misst nicht, was er soll.`);

  const delegationFail = (deadActs.length ? 1 : 0) + ((fired.err || fired.calls !== 1) ? 1 : 0) + ((argsOk.err || !argsOk.same) ? 1 : 0) + (dbl === 2 ? 0 : 1) + mechFail;

  // 4. Durch die Oberflaeche klicken. Onboarding ueberspringen, falls es kommt.
  await page.evaluate(() => {
    try {
      localStorage.setItem('nt_v6', JSON.stringify({ setupDone: true, name: 'Test', goal: 2000, currentDate: new Date().toISOString().slice(0, 10), days: {} }));
    } catch (e) {}
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1200);

  // Sichtbare data-act-Knoepfe wirklich druecken. Jeder Fehler daraus landet
  // ueber den console/pageerror-Listener in `errors`.
  let clicked = 0;
  const handles = await page.$$('[data-act]');
  for (const h of handles.slice(0, 40)) {
    try {
      if (!(await h.isVisible())) continue;
      await h.click({ timeout: 800 });
      clicked++;
      await page.waitForTimeout(80);
      // Offene Overlays wieder schliessen, sonst verdecken sie den Rest.
      await page.keyboard.press('Escape').catch(() => {});
    } catch (e) { /* verdeckt oder ausserhalb – kein Testfehler */ }
  }
  console.log(`  ok  ${clicked} sichtbare data-act-Elemente angeklickt, ohne neuen Fehler.`);

  // 5. Liegt ein geoeffnetes Menue wirklich OBEN?
  // Alle `.ov` teilen `z-index:300` — oben liegt das, was in der DOM-Reihenfolge
  // zuletzt steht. `featSheetOv`/`featCatOv` stehen fast am Ende, also verdeckten
  // sie 21 von 25 Zielen: das Menue ging auf und war nicht bedienbar, ohne dass
  // ein einziger JS-Fehler anfiel. "Oeffnet ohne Fehler" ist keine Aussage
  // darueber, ob man es bedienen kann.
  const stack = await page.evaluate(async () => {
    const out = [];
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const closeAll = () => document.querySelectorAll('.ov.open').forEach((o) => o.classList.remove('open'));
    const open = () => [...document.querySelectorAll('.ov.open')].map((x) => x.id);
    if (!window.NTFeat) return out;
    const feats = NTFeat.list();

    // Katalog -> Zeile antippen -> das Blatt muss oben liegen.
    for (const f of feats) {
      closeAll();
      NTFeat.openCatalog();
      await sleep(30);
      const row = [...document.querySelectorAll('#featCatBody .list-row')]
        .find((x) => (x.getAttribute('data-args') || '').indexOf('"' + f.id + '"') >= 0);
      if (!row) continue;
      row.click();
      await sleep(60);
      const o = open();
      if (o[o.length - 1] !== 'featSheetOv') out.push('Katalog → ' + f.label + ': oben liegt ' + o[o.length - 1]);
    }

    // Blatt -> jede Aktion -> das neu geoeffnete Overlay muss oben liegen.
    for (const f of feats) {
      const acts = f.actions || [];
      for (let i = 0; i < acts.length; i++) {
        closeAll();
        NTFeat.sheet(f.id);
        await sleep(40);
        const vorher = open();
        const rows = document.querySelectorAll('#featSheetBody .list-row');
        if (!rows[i]) continue;
        rows[i].click();
        await sleep(200);
        const o = open();
        const neu = o.filter((x) => vorher.indexOf(x) < 0);
        if (!neu.length) continue; // Aktion oeffnet kein Overlay – nichts zu pruefen
        if (o[o.length - 1] !== neu[neu.length - 1]) {
          out.push(f.label + ' → ' + acts[i].label + ': ' + neu.join(',') + ' liegt hinter ' + o[o.length - 1]);
        }
      }
    }
    closeAll();
    return out;
  });
  if (!stack.length) console.log('  ok  Jedes aus Katalog und Funktions-Blatt geoeffnete Menue liegt oben.');
  else stack.forEach((m) => console.log('  x   ' + m));

  // 6. Jede Aktion im Register muss aufloesbar sein.
  // Seit die Zeilen ueber `NTFeat.act` laufen, steht der Zielname nicht mehr in
  // einem `data-act` — `tools/check.js` sieht ihn also nicht mehr. Ohne diese
  // Pruefung faende ein Tippfehler im Register erst der Nutzer.
  const deadFeatActs = await page.evaluate(() => {
    if (!window.NTFeat || !window.NTActions) return [];
    const bad = [];
    NTFeat.list().forEach((f) => (f.actions || []).forEach((a) => {
      if (!NTActions.resolve(a.act)) bad.push(f.label + ' → ' + a.label + ' (' + a.act + ')');
    }));
    return bad;
  });
  if (!deadFeatActs.length) console.log('  ok  Alle Aktionen im Funktions-Register sind aufloesbar.');
  else deadFeatActs.forEach((m) => console.log('  x   Aktion zeigt ins Leere: ' + m));

  await browser.close();

  if (errors.length || nsFail || badExports.length || deadHandlers.length || delegationFail || stack.length || deadFeatActs.length) {
    console.error('\nFEHLER:');
    [...new Set(errors)].forEach((e) => console.error('  x   ' + e));
    console.error(`\n${errors.length + nsFail + badExports.length + deadHandlers.length + delegationFail + stack.length + deadFeatActs.length} Problem(e).`);
    process.exit(1);
  }
  console.log('\nRauchtest bestanden.');
})().catch((e) => { console.error('Rauchtest abgebrochen:', e.message); process.exit(1); });
