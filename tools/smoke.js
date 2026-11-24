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
// Playwright liegt je nach Maschine lokal, global oder gar nicht vor. Seit #252
// steht es als devDependency in package.json (`npm ci`) — ueberholt ist damit
// die fruehere Begruendung „kein Eintrag, weil dieses Projekt bewusst keine
// hat“. Es bleibt ein Werkzeug, keine Abhaengigkeit der App; der globale Pfad
// bleibt als Rueckfall fuer Maschinen ohne `npm ci`.
function loadPlaywright() {
  const tries = ['playwright', '/opt/node22/lib/node_modules/playwright',
                 process.env.PLAYWRIGHT_PATH].filter(Boolean);
  for (const t of tries) { try { return require(t); } catch (e) { /* naechster */ } }
  console.error('Playwright nicht gefunden. Installieren mit:  npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}
const { chromium } = loadPlaywright();
const { handlerCalls } = require('./js-scan');

// Chromium ebenso: vorinstalliert unter /opt/pw-browsers oder von Playwright
// selbst verwaltet (dann kein executablePath noetig).
function chromePath() {
  const fs2 = require('fs');
  for (const p of [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium']) {
    if (p && fs2.existsSync(p)) return p;
  }
  return undefined;
}

// Keep exercising the complete classic recovery path after the new UI rollout.
const classicUrl=new URL(process.env.SMOKE_URL || 'http://127.0.0.1:8099/index.html');
classicUrl.searchParams.set('ui','classic');
const BASE=classicUrl.href;

const EXPECTED_NAMESPACES = [
  'NTSync', 'NTBaby', 'NTShop', 'NTPartner', 'NTPlan', 'NTDash',
  'NTHealth', 'NTAlexa', 'NTPhotos', 'NTDrive',
  'NTRecur', 'NTStats', 'NTRemind', 'NTTpl', 'NTQueue', 'NTFeat', 'NTAmpel', 'NTMet', 'NTTab', 'NTPicker', 'NTBook',
];

(async () => {
  const browser = await chromium.launch({ executablePath: chromePath() });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();

  // Nur der eigene Server. Alles Fremde wird abgeschnitten — und zwar nicht,
  // um Fehler loszuwerden, sondern weil ein Rauchtest sonst vom Netz abhaengt:
  // In der CI laedt `import("https://esm.sh/@undecaf/zbar-wasm")` (steht seit
  // v0.184 im Markup, optionaler Zweit-Decoder), das fremde minifizierte Modul
  // wirft dabei "n is not a function" — auf einer Maschine ohne Zugriff auf
  // esm.sh passiert das nie. Derselbe Code waere je nach Netz gruen oder rot.
  // Die App ist offline-first: ohne jedes CDN muss sie starten, und genau das
  // prueft der Lauf seither. Fuer UNSEREN Code ist das die strengere Bedingung,
  // nicht die laxere.
  const EIGEN=/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/;
  let fremd=0;
  // Am KONTEXT, nicht an der Seite: Sonst laedt jedes weitere Fenster (Schritt 8,
  // zweites Fenster) das fremde Modul doch – in der CI mit Netz warf es dort
  // genau das „n is not a function“, lokal ohne Zugang zu esm.sh nie.
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (EIGEN.test(u) || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
    fremd++;
    return route.abort();
  });

  const errors = [];
  const ignore = [/favicon/i, /manifest/i, /Failed to load resource/i, /ServiceWorker/i,
                  /net::ERR/i, /workers\.dev/i, /openfoodfacts/i, /404/];
  const record = (where, text) => {
    if (ignore.some((r) => r.test(text))) return;
    errors.push(`[${where}] ${text}`);
  };
  page.on('console', (m) => { if (m.type() === 'error') record('console', m.text()); });
  // Die Quelle mitnehmen: „n is not a function" allein sagt nicht, WESSEN Code
  // geworfen hat — mit der ersten Stack-Zeile ist es in einem Blick klar.
  page.on('pageerror', (e) => {
    const quelle = (String(e.stack || '').split('\n')[1] || '').trim();
    record('pageerror', e.message + (quelle ? '  (' + quelle + ')' : ''));
  });

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

  // 3. Jeder Event-Handler im Markup (onclick, oninput, onkeydown, onchange, …)
  //    muss aufloesbar sein. Das ist die Pruefung, die beim Zerlegen des
  //    Monolithen zaehlt: eine Funktion, die ins Modul gewandert ist, aber im
  //    Markup noch unter ihrem alten globalen Namen steht. Bis v0.303 las sie
  //    nur onclick — ein totes `onkeydown="if(…)pickerSearch()"` blieb gruen.
  //    Den Rumpf zerlegt handlerCalls() aus tools/js-scan.js wie in
  //    tools/check.js (Text in Strings zaehlt nicht, `()=>name()` schon).
  const handlerAttrs = await page.evaluate(() => {
    const list = [];
    document.querySelectorAll('*').forEach((el) => {
      for (const at of Array.from(el.attributes)) {
        if (/^on[a-z]+$/.test(at.name)) list.push({ attr: at.name, value: at.value, where: el.id ? '#' + el.id : (el.textContent || '').trim().slice(0, 24) });
      }
    });
    return list;
  });
  const handlerScan = await page.evaluate((list) => {
    const dead = [];
    for (const h of list) {
      for (const name of h.names) {
        let ref = window;
        for (const part of name.split('.')) { ref = ref && ref[part]; }
        if (typeof ref !== 'function') dead.push(h.attr + ' ' + name + '  <- ' + h.where);
      }
    }
    return { dead: [...new Set(dead)], attrs: list.length };
  }, handlerAttrs.map((h) => ({ ...h, names: handlerCalls(h.value) })));
  const deadHandlers = handlerScan.dead;
  if (deadHandlers.length) { deadHandlers.forEach((d) => console.log(`  x   toter Handler: ${d}`)); }
  else console.log(`  ok  Jeder der ${handlerScan.attrs} Event-Handler (on*) im Markup ist aufloesbar.`);

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

  // 3g. Das ＋ in der unteren Leiste bucht, solange eine Mahlzeit geoeffnet ist,
  //      in GENAU diese Mahlzeit. Bis v0.257 tat es das nicht: der Knopf trug
  //      `data-act` und bekam zur Renderzeit zusaetzlich ein `onclick` — beides
  //      feuerte, das data-args mit `null` zuletzt, und `openPicker(null)` nahm
  //      wieder die Mahlzeit nach der Uhrzeit. Geoeffnet war das Fruehstueck,
  //      gebucht wurde in „Snack". Kein Fehler in der Konsole, kein Zeichen im
  //      Markup — nur ein Eintrag an der falschen Stelle. Gemessen wird der
  //      Klick auf den echten Knopf, nicht der Aufruf von openPicker().
  const mealPlus = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    if (typeof window.openMealDetail !== 'function') return { err: 'openMealDetail fehlt' };
    const real = window.NTPicker.openPicker;
    const out = [];
    for (const meal of ['breakfast', 'lunch', 'dinner', 'snack']) {
      const calls = [];
      window.NTPicker.openPicker = function (m) { calls.push(m === undefined ? '(leer)' : m); };
      window.openMealDetail(meal);
      await sleep(30);
      const cb = document.getElementById('cbMealDetail');
      if (!cb) { window.NTPicker.openPicker = real; return { err: 'cbMealDetail fehlt' }; }
      cb.click();
      await sleep(30);
      out.push({ meal: meal, calls: calls });
    }
    window.NTPicker.openPicker = real;
    if (typeof window.closeMealDetail === 'function') window.closeMealDetail();
    return { rows: out };
  });
  let mealPlusFail = 0;
  if (mealPlus.err) { console.log('  x   ＋ im Mahlzeit-Detail nicht pruefbar: ' + mealPlus.err); mealPlusFail++; }
  else {
    const bad = mealPlus.rows.filter((r) => r.calls.length !== 1 || r.calls[0] !== r.meal);
    if (bad.length) { bad.forEach((r) => console.log(`  x   ＋ bei geoeffnetem '${r.meal}' buchte in ${JSON.stringify(r.calls)} (erwartet genau ["${r.meal}"]).`)); mealPlusFail += bad.length; }
    else console.log('  ok  Das ＋ bucht in die geoeffnete Mahlzeit — genau einmal, in alle vier geprueft.');
  }

  const delegationFail = (deadActs.length ? 1 : 0) + ((fired.err || fired.calls !== 1) ? 1 : 0) + ((argsOk.err || !argsOk.same) ? 1 : 0) + (dbl === 2 ? 0 : 1) + mechFail + mealPlusFail;

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

  // 4b. Jeden Reiter der unteren Leiste einmal oeffnen (#253): renderStatsPanel
  // warf seit v0.250 bei jedem Oeffnen des Trends-Tabs einen ReferenceError –
  // eine Funktion war ins Modul gewandert, die alte Aufrufstelle blieb. Keiner
  // der Klickschritte oben oeffnete den Tab. Fehler landen ueber den
  // pageerror-Listener in `errors`.
  const tabErrBefore = errors.length;
  for (const tab of ['trends', 'history', 'more', 'main']) {
    await page.evaluate((t) => { try { switchTab(t); } catch (e) { throw e; } }, tab).catch((e) => record('switchTab ' + tab, e.message));
    await page.waitForTimeout(250);
  }
  const reportOk = await page.evaluate(() => { const el = document.getElementById('weekReportText'); return !!(el && el.innerHTML.trim()); });
  if (!reportOk) record('trends', 'Wochenbericht nach switchTab(\'trends\') leer');
  if (errors.length === tabErrBefore) console.log('  ok  Alle Reiter geoeffnet (Trends mit Wochenbericht), ohne neuen Fehler.');

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
  console.log(`  ok  Ohne jedes CDN gestartet (${fremd} fremde Anfragen abgeschnitten).`);
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

  // 7. Das ✕ einer Erinnerung (#249): data-act ohne onclick, und ein Klick
  //    entfernt genau einen Eintrag – den eigenen. Bis v0.277 loeschte ein
  //    onclick nach Listenposition.
  const remind = await page.evaluate(() => {
    const keep = S.reminders;
    const realSave = window.saveS;
    window.saveS = function () {};
    try {
      S.reminders = [{ time: '07:00', label: 'A', active: false }, { time: '08:00', label: 'B', active: false }, { time: '09:00', label: 'C', active: false }];
      NTRemind.render();
      const btns = [...document.querySelectorAll('#reminderList [data-act="NTRemind.del"]')];
      const withOnclick = document.querySelectorAll('#reminderList [onclick]').length;
      if (btns.length !== 3) return { err: btns.length + ' Knoepfe statt 3' };
      btns[1].click();
      return { withOnclick: withOnclick, left: S.reminders.map((r) => r.label) };
    } finally { S.reminders = keep; window.saveS = realSave; NTRemind.render(); }
  });
  const remindFail = (remind.err || remind.withOnclick || JSON.stringify(remind.left) !== '["A","C"]') ? 1 : 0;
  if (remindFail) console.log('  x   Erinnerung loeschen: ' + JSON.stringify(remind));
  else console.log('  ok  Das ✕ einer Erinnerung ist data-act ohne onclick und entfernt genau die eigene.');

  // 10. Ernaehrungs-Ampel (#262): Vegan entscheidet die Tabelle, Glutenfrei die
  //     KI (hier ein Stub). Die KI bekommt je Name nur dessen offene
  //     Praeferenzen, ein lokales Rot ueberlebt ein KI-Gruen, das Banner behaelt
  //     es, obwohl die KI den Namen nicht nennt, und offline steht kein Gruen,
  //     solange eine Praeferenz offen ist.
  let dietFail = 0;
  {
    const d = await page.evaluate(async () => {
      const keep = { prefs: S.dietPrefs, free: S.dietFree, warn: S.dietWarn, save: window.saveS, ai: window.canUseAi, cc: window.callClaude };
      const day = getDay();
      const before = (day.meals.snack || []).length;
      let prompt = '';
      try {
        window.saveS = function () {};
        window.canUseAi = function () { return true; };
        let answer = [{ name: 'Schweinebraten', ampel: 'gruen', grund: 'glutenfrei' }, { name: 'Apfel', ampel: 'gruen', grund: 'glutenfrei' }];
        window.callClaude = function (model, content, max, ok) { prompt = content[0].text; ok(JSON.stringify(answer)); };
        S.dietPrefs = ['Vegan', 'Glutenfrei']; S.dietFree = ''; S.dietWarn = true;
        const ings = [{ name: 'Schweinebraten', amount: 150, per100: { kcal: 250, protein: 25, carbs: 0, fat: 16 } },
          { name: 'Apfel', amount: 150, per100: { kcal: 52, protein: 0.3, carbs: 14, fat: 0.2 } }];
        day.meals.snack = (day.meals.snack || []).concat([{ name: 'Teller', ingredients: ings }]);
        checkDietWarn(ings, 'snack', day.meals.snack.length - 1);
        await new Promise((r) => setTimeout(r, 50));
        const e = day.meals.snack[day.meals.snack.length - 1];
        // Zweiter Lauf: Die KI nennt nur den Apfel (gelb). Der Banner-Abschnitt
        // wird ersetzt und muss das lokale Rot des Schweinebratens behalten.
        closeAmpelBanner();
        answer = [{ name: 'Apfel [Glutenfrei, Vegan]', ampel: 'gelb', grund: 'Test' }];
        const ings2 = ings.map((i) => ({ name: i.name, amount: i.amount, per100: i.per100 }));
        day.meals.snack.push({ name: 'Teller 2', ingredients: ings2 });
        checkDietWarn(ings2, 'snack', day.meals.snack.length - 1);
        await new Promise((r) => setTimeout(r, 50));
        const banner = (document.getElementById('ampelBanner') || {}).textContent || '';
        const e2 = day.meals.snack[day.meals.snack.length - 1];
        // Offline: Keto entscheidet die Gurke gruen, Glutenfrei bleibt offen → kein Punkt.
        window.canUseAi = function () { return false; };
        S.dietPrefs = ['Keto', 'Glutenfrei'];
        const ings3 = [{ name: 'Gurke', amount: 100, per100: { kcal: 12, protein: 0.6, carbs: 2, fat: 0.1 } }];
        day.meals.snack.push({ name: 'Teller 3', ingredients: ings3 });
        checkDietWarn(ings3, 'snack', day.meals.snack.length - 1);
        const e3 = day.meals.snack[day.meals.snack.length - 1];
        return { prompt, map: e.dietAmpel, ing0: ings[0].dietAmpel, banner, apfel2: (e2.dietAmpel || {}).apfel, offline: e3.dietAmpel || null };
      } finally {
        day.meals.snack = day.meals.snack.slice(0, before);
        S.dietPrefs = keep.prefs; S.dietFree = keep.free; S.dietWarn = keep.warn;
        window.saveS = keep.save; window.canUseAi = keep.ai; window.callClaude = keep.cc;
        closeAmpelBanner(); renderAll();
      }
    });
    const m = d.map || {};
    const ok = /in eckigen Klammern dahinter \(Glutenfrei, Vegan\)/.test(d.prompt) && /Schweinebraten \[Glutenfrei\], Apfel \[Glutenfrei, Vegan\]$/.test(d.prompt)
      && m.schweinebraten && m.schweinebraten.ampel === 'rot' && m.apfel && m.apfel.ampel === 'gruen'
      && d.ing0 && d.ing0.ampel === 'rot' && d.banner.includes('Schweinebraten') && d.banner.includes('Apfel')
      && d.apfel2 && d.apfel2.ampel === 'gelb' && !d.offline;
    if (!ok) { dietFail++; console.log('  x   Ernaehrungs-Ampel: ' + JSON.stringify(d)); }
    else console.log('  ok  Ernaehrungs-Ampel (#262): Vegan lokal, je Name nur offene Praeferenzen an die KI, lokales Rot schlaegt KI-Gruen, Banner behaelt es, offline kein Gruen bei offener Praeferenz.');
  }

  // 11. Picker (#257). picker.js ist das Modul mit den meisten Aufrufen nach
  //     index.html, und einige davon sind mit #257 nach picker.js bzw.
  //     js/calc.js gewandert (renderRecentList, animateAdd, totalStr, …). Kein
  //     Schritt oben oeffnet den Picker: hier oeffnen (wie das ＋ im
  //     Mahlzeit-Detail), jeden Tab aus dem Markup einmal schalten, in der
  //     Suche tippen (oninput) und Enter druecken (onkeydown), schliessen. Muss
  //     vor Schritt 8 stehen: danach ist dieses Fenster pausiert.
  let pickFail = 0;
  {
    const errBefore = errors.length;
    const tabs = await page.evaluate(() => [...document.querySelectorAll('#pickerOv .picker-tab')].map((b) => b.id.replace(/^ptab-/, '')));
    const opened = await page.evaluate(async () => {
      openMealDetail('breakfast');
      openPickerForOpenMeal();
      await new Promise((r) => setTimeout(r, 150));
      return document.getElementById('pickerOv').classList.contains('open');
    }).catch((e) => { record('Picker oeffnen', e.message); return false; });
    if (!opened) { pickFail++; console.log('  x   Picker: openPickerForOpenMeal() oeffnet #pickerOv nicht.'); }
    if (tabs.length < 7) { pickFail++; console.log(`  x   Picker: nur ${tabs.length} Tabs im Markup gefunden (${tabs.join(', ')}), erwartet 7.`); }
    for (const t of tabs) {
      const act = await page.evaluate((tab) => {
        NTPicker.pickerSetTab(tab);
        const p = document.getElementById('ppanel-' + tab);
        return !!p && p.classList.contains('act');
      }, t).catch((e) => { record('pickerSetTab ' + t, e.message); return false; });
      // Der Barcode-Tab startet den Scanner erst nach 150 ms.
      await page.waitForTimeout(t === 'barcode' ? 400 : 120);
      if (!act) { pickFail++; console.log(`  x   Picker: Tab '${t}' ist nach pickerSetTab nicht aktiv.`); }
    }
    const hint = () => page.evaluate(() => document.getElementById('pickerSearchHint').textContent);
    await page.evaluate(() => NTPicker.pickerSetTab('search'));
    await page.type('#pickerSearchQ', 'Banane', { delay: 15 });
    const live = await page.evaluate(() => ({ hint: document.getElementById('pickerSearchHint').textContent,
      first: (document.querySelector('#pickerResults .ri-n') || {}).textContent || '' }));
    await page.press('#pickerSearchQ', 'Enter');
    await page.waitForTimeout(500);
    const afterEnter = await hint();
    const closed = await page.evaluate(() => {
      NTPicker.closePicker();
      if (typeof closeMealDetail === 'function') closeMealDetail();
      return !document.getElementById('pickerOv').classList.contains('open');
    }).catch((e) => { record('closePicker', e.message); return false; });
    // oninput: Live-Treffer und der Hinweis fuer die Online-Suche. onkeydown
    // (Enter): pickerSearch() setzt den Hinweis um — der Worker ist hier
    // abgeschnitten, es bleibt bei den lokalen Treffern.
    if (!/Enter für Online-Suche/.test(live.hint) || !/banane/i.test(live.first)) { pickFail++; console.log('  x   Picker: Tippen in #pickerSearchQ loeste die Live-Suche nicht aus: ' + JSON.stringify(live)); }
    if (afterEnter === live.hint) { pickFail++; console.log('  x   Picker: Enter in #pickerSearchQ loeste pickerSearch() nicht aus (Hinweis unveraendert: ' + afterEnter + ').'); }
    if (!closed) { pickFail++; console.log('  x   Picker: closePicker() schliesst #pickerOv nicht.'); }
    const newErr = errors.length - errBefore;
    if (newErr) { pickFail++; console.log(`  x   Picker: ${newErr} neue(r) Fehler, siehe unten.`); }
    if (!pickFail) console.log(`  ok  Picker (#257): geoeffnet, ${tabs.length} Tabs (${tabs.join(', ')}) geschaltet, Suche per Tippen und Enter, geschlossen — ohne Fehler.`);
  }

  // 12. Kochbuch (v0.317): Ein Rezept aendert sich nur ueber „💾 Speichern“.
  //     Angelegt wird erst beim Speichern (Entwurf), der Editor rechnet fuer
  //     das ganze Rezept und speichert je Portion, ✕ verwirft eine geaenderte
  //     Menge mit Rueckfrage, Portionsrechner, Tagebuch und Kochmodus lassen
  //     das Rezept unberuehrt. Muss vor Schritt 8 stehen (Fenster pausiert).
  let bookFail = 0;
  {
    const errBefore = errors.length;
    const onDialog = (d) => d.accept();
    page.on('dialog', onDialog);
    const r = await page.evaluate(async () => {
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const out = {};
      const n0 = recipes.length;
      NTBook.editDraft({ name: 'Smoke-Suppe', baseServings: 4, instructions: 'Schneiden.\nGenau 10 Minuten köcheln.',
        ingredients: [{ name: 'Linsen', emoji: '🫘', amount: 200, per100: { kcal: 300, protein: 20, carbs: 50, fat: 1 } }] }, { from: 'mealDetail' });
      out.draftNotSaved = recipes.length === n0;
      NTBook.editSave();
      await wait(50);
      const rec = recipes.find((x) => x.name === 'Smoke-Suppe');
      out.saved = !!rec && rec.ingredients[0].amount === 50 && rec.baseServings === 4;
      const snap = JSON.stringify(rec);
      NTBook.detail(rec.id);
      NTBook.setPortions(3);
      out.scaled = /350 g/.test(document.getElementById('bookDetIngs').textContent) && JSON.stringify(rec) === snap;
      NTBook.editCur();
      const amt = document.querySelector('#recEditIngList input.ing-amt');
      out.whole = amt && amt.value === '200';
      amt.value = '999'; amt.dispatchEvent(new Event('change'));
      closeOv('recEditOv');
      out.cancelKeeps = JSON.stringify(recipes.find((x) => x.id === rec.id)) === snap;
      NTBook.cook(rec.id, 0);
      NTBook.cookGo(1);
      out.timer = !!document.querySelector('#cookOv .ck-tstart button');
      NTBook.cookDone();
      NTBook.cookClose(true);
      out.cooked = !!(S.cookLog[rec.id] && S.cookLog[rec.id].n === 1);
      NTPicker.addRecipeEntry(rec.id, 'snack', 2);
      const e = getDay().meals.snack[getDay().meals.snack.length - 1];
      out.diary = e.recipeId === rec.id && e.portions === 2 && e.ingredients !== rec.ingredients;
      out.untouched = JSON.stringify(recipes.find((x) => x.id === rec.id)) === snap;
      NTBook.closeDetail();
      getDay().meals.snack.pop();
      recipes.splice(recipes.indexOf(recipes.find((x) => x.id === rec.id)), 1);
      delete S.cookLog[rec.id];
      // Grundbestand (v0.318): nachladen, einmal einspielen, angepasst anzeigen.
      await new Promise((res) => NTBook.loadSeed(res));
      const seeded = recipes.filter((x) => x.seed).length;
      out.seed = seeded >= 100 && NTBook.mergeSeed() === 0;
      const sch = recipes.find((x) => x.id === 'mc-schnitzel');
      const schSnap = JSON.stringify(sch);
      const prefs = S.dietPrefs, preg = S.pregnant;
      S.dietPrefs = ['Vegetarisch']; S.pregnant = 0;
      const v = NTBook.view(sch);
      out.adapted = v.adapted && v.ingredients.some((g) => g.name === 'Tofu (fest)') && !v.ingredients.some((g) => /Hähnchen/.test(g.name));
      NTBook.detail(sch.id);
      out.banner = /Für dich angepasst/.test(document.getElementById('bookDetBody').textContent);
      NTBook.toggleOrig();
      out.orig = /Original wird angezeigt/.test(document.getElementById('bookDetBody').textContent)
        && NTBook.view(sch).ingredients.some((g) => /Hähnchen/.test(g.name));
      NTBook.toggleOrig();
      NTPicker.addRecipeEntry(sch.id, 'snack', 1);
      const ve = getDay().meals.snack[getDay().meals.snack.length - 1];
      out.diaryAdapted = ve.ingredients.some((g) => g.name === 'Tofu (fest)');
      getDay().meals.snack.pop();
      // `used` markiert nur die Benutzung (Picker-Suche), der Inhalt bleibt.
      const now = JSON.parse(JSON.stringify(recipes.find((x) => x.id === 'mc-schnitzel'))), was = JSON.parse(schSnap);
      delete now.used; delete was.used;
      out.seedUntouched = JSON.stringify(now) === JSON.stringify(was);
      NTBook.closeDetail();
      S.dietPrefs = prefs; S.pregnant = preg;
      return out;
    }).catch((e) => { record('Kochbuch', e.message); return {}; });
    page.off('dialog', onDialog);
    for (const [k, v] of Object.entries({ draftNotSaved: 'Entwurf legt vor dem Speichern nichts an',
      saved: 'gespeichert je Portion (200 g fuer 4 → 50 g)', scaled: 'Portionsrechner zeigt 3 Portionen, Rezept bleibt',
      whole: 'Editor zeigt Mengen fuer das ganze Rezept', cancelKeeps: '✕ nach Aenderung laesst das Rezept unveraendert',
      timer: 'Kochmodus bietet den Timer aus „10 Minuten“ an', cooked: '„Fertig gekocht“ zaehlt in S.cookLog',
      diary: 'Tagebuch bekommt eine Kopie', untouched: 'Rezept nach allem unveraendert',
      seed: 'Grundbestand (101 Gerichte) nachgeladen, ein zweites Einspielen fuegt nichts hinzu',
      adapted: 'vegetarisch: Hähnchen wird Tofu', banner: 'Ansicht nennt die Anpassung',
      orig: '„Original anzeigen“ zeigt das Hähnchen', diaryAdapted: 'Tagebuch bekommt die angepasste Fassung',
      seedUntouched: 'Grundrezept nach Anpassung unveraendert' })) {
      if (!r[k]) { bookFail++; console.log('  x   Kochbuch: ' + v); }
    }
    const newErr = errors.length - errBefore;
    if (newErr) { bookFail++; console.log(`  x   Kochbuch: ${newErr} neue(r) Fehler, siehe unten.`); }
    if (!bookFail) console.log('  ok  Kochbuch: Entwurf, Speichern je Portion, Rechner/✕/Kochmodus/Tagebuch lassen das Rezept unveraendert, Timer und Kochverlauf; Grundbestand, vegetarische Fassung, „Original anzeigen“.');
  }

  // 12b. Vorrat (#325, #326): Eintippen, Mindestmenge → Einkaufszettel,
  //      Abhaken füllt auf, „Fertig gekocht“ zieht ab, Lagerorte, Fotos mit
  //      gestellter KI-Antwort erst nach Bestätigung, Kochvorschläge.
  let pantryFail = 0;
  {
    const errBefore = errors.length;
    const onDialog = (d) => d.accept();
    page.on('dialog', onDialog);
    const r = await page.evaluate(async () => {
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const out = {};
      const shop0 = JSON.stringify(S.shopList), pant0 = JSON.stringify(S.pantry || []);
      NTPantry.open();
      out.seedLocs = S.pantryLocs.length === 3 && !!document.querySelector('#pantryLocChips .stab');
      const inp = document.getElementById('pantryInput');
      inp.value = '3 Dosen Tomaten'; NTPantry.submitInput();
      const tom = S.pantry.find((x) => x.n === 'Tomaten');
      out.typed = !!tom && tom.q === 3 && /Tomaten/.test(document.getElementById('pantryList').textContent);
      // Mindestmenge 2, dann zweimal − → unter 2 → Einkaufszettel
      NTPantry.openItem(tom.id);
      document.getElementById('pantryItemMin').value = '2';
      document.getElementById('pantryItemG').value = '400';
      NTPantry.saveItem();
      NTPantry.step(tom.id, -1); NTPantry.step(tom.id, -1);
      const si = S.shopList.find((x) => x.n === 'Tomaten' && !x.d);
      out.toShop = !!si && /1 Stück/.test(si.q) && /Knapp/.test(document.getElementById('pantryCardBody').textContent);
      // Abhaken → +1, wieder ent-haken → zurück
      NTShop.toggle(si.id);
      out.bought = tom.q === 2;
      NTShop.toggle(si.id);
      out.unbought = tom.q === 1;
      NTShop.toggle(si.id);
      // Kochen: 2 Portionen à 200 g Tomaten = 400 g = 1 Stück
      NTBook.editDraft({ name: 'Smoke-Tomatensuppe', baseServings: 2, instructions: 'Kochen.',
        ingredients: [{ name: 'Tomaten', emoji: '🍅', amount: 400, per100: { kcal: 20, protein: 1, carbs: 3, fat: 0 } }] }, { from: 'mealDetail' });
      NTBook.editSave();
      await wait(50);
      const rec = recipes.find((x) => x.name === 'Smoke-Tomatensuppe');
      NTBook.cook(rec.id, 2);
      NTBook.cookDone();
      NTBook.cookClose(true);
      out.cooked = tom.q === 1;
      // Haltbarkeit: Verbrauchsdatum morgen → „Läuft ab“ in Liste, Filter und Kachel
      NTPantry.openItem(tom.id);
      document.getElementById('pantryItemVd').value = addDays(today(), 1);
      document.getElementById('pantryItemMhd').value = addDays(today(), 30);
      NTPantry.saveItem();
      NTPantry.setFilter('__exp');
      out.expiry = tom.vd === addDays(today(), 1) && /Verbr\. bis .* morgen/.test(document.getElementById('pantryList').textContent)
        && /Läuft ab/.test(document.querySelector('#pantryStats [aria-pressed="true"]').textContent)
        && /Läuft ab:[\s\S]*Tomaten · morgen/.test(document.getElementById('pantryCardBody').textContent);
      NTPantry.setFilter('');
      // 🐛 bleibt über dem offenen Dialog sichtbar, nur im Feedback-Dialog weg
      const fab = document.getElementById('feedbackFab');
      const fr = fab.getBoundingClientRect();
      out.fab = getComputedStyle(fab).display !== 'none' && fr.top < 80 && document.elementFromPoint(fr.left + fr.width / 2, fr.top + fr.height / 2) === fab;
      openOv('feedbackOv'); out.fab = out.fab && getComputedStyle(fab).display === 'none'; closeOv('feedbackOv');
      // Kochvorschläge: das Rezept steht oben, Tomaten sind da
      NTPantry.openCook();
      out.suggest = /Smoke-Tomatensuppe/.test(document.getElementById('pantryCookList').textContent);
      closeOv('pantryCookOv');
      // Lagerort anlegen und löschen; Artikel verliert ihn, bleibt aber
      NTPantry.openLocs();
      document.getElementById('pantryLocNewNm').value = 'Keller';
      NTPantry.locAdd();
      const kel = S.pantryLocs.find((l) => l.label === 'Keller');
      tom.loc = kel.id;
      NTPantry.locDelete(kel.id);
      out.locs = !S.pantryLocs.some((l) => l.label === 'Keller') && tom.loc === '' && !!S.pantryTomb['loc:' + kel.id];
      closeOv('pantryLocsOv');
      // Fotos: KI gestellt, übernommen wird erst nach Bestätigung
      const realAi = window.callClaude, realCan = window.canUseAi;
      window.canUseAi = () => true;
      window.callClaude = (m, content, t, ok) => ok('{"artikel":[{"name":"Milch","stueck":2,"g":1000,"ort":"kuehl","mhd":"2030-01-31"},{"name":"Senf","stueck":1,"ort":"kuehl"}]}');
      NTPantry.openPhotos();
      out.camera = document.getElementById('pantryCamFile').getAttribute('capture') === 'environment'
        && !!document.querySelector('#pantryPhotoThumbs [data-act="NTPantry.takePhoto"]');
      NTPantry.photosChosen({ files: [] });
      out.photoBtn = document.getElementById('pantryPhotoBtn').disabled;
      const n0 = S.pantry.length;
      // Ein Foto ohne Dateidialog: dieselbe Funktion, die der Dateidialog ruft
      const fake = document.createElement('canvas'); fake.width = 4; fake.height = 4;
      const b64 = fake.toDataURL('image/jpeg').split(',')[1];
      NTPantry.photosChosen({ files: [new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'k.jpg', { type: 'image/jpeg' })] });
      await wait(300);
      NTPantry.analyzePhotos();
      out.notYet = S.pantry.length === n0 && document.querySelectorAll('#pantryFound input[type=checkbox]').length === 2;
      NTPantry.foundSet(1, 'on', false);
      NTPantry.foundApply();
      const milk = S.pantry.find((x) => x.n === 'Milch');
      out.applied = !!milk && milk.q === 2 && milk.g === 1000 && milk.loc === 'kuehl' && milk.mhd === '2030-01-31' && !S.pantry.some((x) => x.n === 'Senf');
      window.callClaude = realAi; window.canUseAi = realCan;
      const isOpen = (id) => document.getElementById(id).classList.contains('open');
      // #334: Rezept → Zettel nur, was der Vorrat nicht deckt (Tomaten 1 × 400 g, Milch 2 × 1000 g)
      const sr = NTShop.addIngredients([{ name: 'Tomaten', amount: 300 }, { name: 'Milch', amount: 2500 }, { name: 'Smoke-Paprika', amount: 100 }], 'Smoke');
      const sm = S.shopList.find((x) => x.n === 'Milch');
      out.shortfall = sr.pantry === 1 && sr.part === 1 && sr.total === 2 && !!sm && /500 g/.test(sm.q)
        && !S.shopList.some((x) => x.n === 'Tomaten' && (x.rc || []).includes('Smoke')) && /schon im Vorrat/.test(NTShop.resultText(sr));
      // #336: Verlauf mit Kauf, Verbrauch, Zettel, Kochen; Weggeworfen + Rückgängig
      const ks = S.pantryLog.map((e) => e.k + ':' + e.src);
      out.log = ks.includes('kauf:hand') && ks.includes('verbrauch:hand') && ks.includes('kauf:zettel')
        && ks.includes('kochen:Smoke-Tomatensuppe') && ks.includes('kauf:foto');
      NTPantry.openItem(milk.id);
      document.getElementById('pantryItemUseQ').value = '1';
      NTPantry.consume(true);
      const ve = S.pantryLog[0];
      NTPantry.saveItem();
      NTPantry.openLog();
      out.waste = milk.q === 1 && ve.k === 'verderb' && ve.d === -1 && /weggeworfen: 1 Stück/.test(document.getElementById('pantryWaste').textContent)
        && !!document.querySelector('#pantryLogList [data-act="NTPantry.undo"]');
      NTPantry.undo(ve.id);
      out.undo = milk.q === 2 && ve.u === 1 && !document.querySelector('#pantryLogList [data-args*="' + ve.id + '"]');
      closeOv('pantryLogOv');
      // #337: „Hält ca. 5 Tage“, leer aufgefüllt → MHD heute + 5
      NTPantry.openItem(milk.id);
      document.getElementById('pantryItemHd').value = '5';
      document.getElementById('pantryItemQ').value = '0';
      NTPantry.saveItem();
      NTPantry.step(milk.id, 1);
      out.hd = milk.hd === 5 && milk.mhd === addDays(today(), 5) && S.pantryLog[0].k === 'kauf';
      // Ablauf-Meldung einmal am Tag (Notification gestellt)
      const realN = window.Notification, realNotify = NTRemind.notify; let sent = 0;
      window.Notification = /** @type {any} */ ({ permission: 'granted' });
      NTRemind.notify = () => { sent++; };
      milk.mhd = addDays(today(), 1); delete S.pantryRemindDay; S.pantryRemindOff = false;
      NTPantry.checkRemind(); NTPantry.checkRemind();
      out.remind = new Date().getHours() < 7 ? sent === 0 : (sent === 1 && S.pantryRemindDay === today());
      window.Notification = realN; NTRemind.notify = realNotify;
      openSettings('erinnerungen'); NTRemind.render();
      out.remindChk = document.getElementById('pantryRemindChk').checked === true;
      closeOv('settOv');
      // #335: Barcode — bekannt ＋1 und weiterscannen, unbekannt → Open Food Facts → Artikel mit Barcode
      const ean = (d12) => d12 + ((10 - (d12.split('').reduce((a, c, i) => a + (+c) * (i % 2 ? 3 : 1), 0) % 10)) % 10);
      const known = ean('400638133393'), fresh = ean('400000000123');
      milk.bc = [known];
      const q0 = milk.q;
      NTPantry.scan('in');
      NTPicker.pickerStopScan();
      NTPicker.pickerOpenManualBarcode();
      document.getElementById('bcDirectInput').value = known;
      NTPicker.pickerSubmitManualBarcode();
      out.scanKnown = milk.q === q0 + 1 && isOpen('pickerOv') && /Vorrat: einbuchen/.test(document.getElementById('pickerTitle').textContent)
        && /Milch · jetzt/.test(document.getElementById('pickerBarcodeResult').textContent) && S.pantryLog[0].src === 'scan';
      const realFetch = window.fetchT;
      window.fetchT = () => Promise.resolve({ json: () => ({ status: 1, product: { product_name: 'Smoke-Haferflocken', product_quantity: 500, product_quantity_unit: 'g' } }) });
      NTPicker.pickerStopScan();
      NTPicker.pickerOpenManualBarcode();
      document.getElementById('bcDirectInput').value = fresh;
      NTPicker.pickerSubmitManualBarcode();
      await wait(50);
      window.fetchT = realFetch;
      // Paket 4 (G2): Serienscan — ein neuer Code unterbricht den Scan nicht mehr,
      // er steht als Rückfrage unter dem Sucherbild; „Zuordnen“ öffnet den Artikel-Dialog.
      const stillOpen = isOpen('pickerOv') && /Smoke-Haferflocken/.test(document.getElementById('pickerScanList').textContent);
      document.querySelector('#pickerScanList [data-act="NTPantry.scanResolve"]').click();
      out.scanNew = stillOpen && !isOpen('pickerOv') && isOpen('pantryItemOv') && document.getElementById('pantryItemName').value === 'Smoke-Haferflocken'
        && document.getElementById('pantryItemG').value === '500' && !!document.getElementById('pantryItemAssign');
      NTPantry.saveItem();
      const oat = S.pantry.find((x) => x.n === 'Smoke-Haferflocken');
      out.scanSaved = !!oat && oat.q === 1 && oat.g === 500 && Array.isArray(oat.bc) && oat.bc[0] === fresh;
      // Sync-Records: Artikel und Lagerorte
      out.sync = !!NTPantry.Sync && NTSync.TOPICS.some((t) => t.id === 'pantry');
      NTPantry.close();
      // aufräumen
      recipes.splice(recipes.indexOf(rec), 1);
      delete S.cookLog[rec.id];
      S.shopList = JSON.parse(shop0); S.pantry = JSON.parse(pant0); S.pantryTomb = {}; S.pantryLocs = null; S.pantryLog = []; delete S.pantryRemindDay;
      saveS(); NTShop.render(); NTPantry.render();
      return out;
    }).catch((e) => { record('Vorrat', e.message); return {}; });
    page.off('dialog', onDialog);
    for (const [k, v] of Object.entries({ seedLocs: 'drei vorgeschlagene Lagerorte als Filter', typed: '„3 Dosen Tomaten“ → 3 Stück Tomaten',
      toShop: 'unter der Mindestmenge → Einkaufszettel mit fehlender Menge, Kachel zeigt „Knapp“',
      bought: 'Abhaken auf dem Zettel füllt auf', unbought: 'Ent-haken nimmt das Auffüllen zurück',
      cooked: '„Fertig gekocht“ zieht 400 g = 1 Stück ab',
      expiry: 'Verbrauchsdatum morgen → Zeile, Filter „Läuft ab“ und Kachel', fab: '🐛 über offenem Dialog sichtbar und klickbar, im Feedback-Dialog weg',
      camera: 'Kamera-Feld mit capture und Kamera-Kachel', suggest: 'Kochvorschlag aus dem Kochbuch',
      locs: 'Lagerort anlegen und löschen (Artikel bleibt, Grabstein für den Sync)',
      photoBtn: 'Auswerten ohne Foto gesperrt', notYet: 'Foto-Ergebnis erst nach Bestätigung im Vorrat',
      applied: 'nur ausgewählte Artikel übernommen, mit Menge, Gramm, Ort und MHD',
      shortfall: 'Rezept → Zettel ohne Gedecktes, Teil mit Restmenge (#334)', log: 'Verlauf: Kauf, Verbrauch, Zettel, Kochen, Foto (#336)',
      waste: '🗑️ Weggeworfen bucht ab, Monatszeile im Verlauf', undo: '↩️ macht die Buchung rückgängig',
      hd: '„Hält ca. 5 Tage“: leer aufgefüllt → MHD heute + 5 (#337)', remind: 'Ablauf-Meldung höchstens einmal am Tag',
      remindChk: 'Schalter in Einstellungen → Erinnerungen', scanKnown: 'bekannter Barcode ＋1, Scanner bleibt offen (#335)',
      scanNew: 'neuer Barcode → Rückfrage unter dem Sucherbild, Scanner bleibt offen, „Zuordnen“ → Artikel-Dialog mit Name und Gramm aus Open Food Facts', scanSaved: 'Artikel mit Barcode gespeichert',
      sync: 'eigener Topf „Vorrat“ im Sync-Kern' })) {
      if (!r[k]) { pantryFail++; console.log('  x   Vorrat: ' + v); }
    }
    const newErr = errors.length - errBefore;
    if (newErr) { pantryFail++; console.log(`  x   Vorrat: ${newErr} neue(r) Fehler, siehe unten.`); }
    if (!pantryFail) console.log('  ok  Vorrat: Eintippen, Mindestmenge → Einkaufszettel, Abhaken füllt auf, Kochen zieht ab, Haltbarkeit, 🐛 im Dialog, Lagerorte, Kamera, Fotos erst nach Bestätigung, Zettel minus Vorrat, Verlauf/Weggeworfen/Rückgängig, Hält-ca.-Tage, Ablauf-Meldung, Barcode, Kochvorschläge, eigener Sync-Topf.');
  }

  // 12c. Vorrat-Ausbau: Übersicht (Läuft ab/Fehlt/Artikel), Suche getrennt vom
  //      Einbuchen, Ordnen nach Name/Kategorie, Kategorie auf den Zettel,
  //      Detail mit Chargen, geschätztes MHD, „Geöffnet“ verkürzt die Frist,
  //      geöffnete Charge zuerst abgezogen, Charge entfernen + Rückgängig,
  //      Ortswechsel schätzt nur geschätzte Daten neu. Alles per Klick.
  let pantry2Fail = 0;
  {
    const errBefore = errors.length;
    const onDialog = (d) => d.accept();
    page.on('dialog', onDialog);
    const out = {};
    let keep = null;
    try {
      keep = await page.evaluate(() => {
        const k = JSON.stringify({ shop: S.shopList, pantry: S.pantry || [], log: S.pantryLog || [], order: S.pantryOrder === undefined ? null : S.pantryOrder });
        document.querySelectorAll('.ov.open').forEach((o) => o.classList.remove('open'));
        S.pantry = []; S.pantryLog = []; S.pantryLocs = null; delete S.pantryOrder;
        NTPantry.open(); NTPantry.setFilter('');
        return k;
      });
      const T = await page.evaluate(() => ({ d5: addDays(today(), 5), d3: addDays(today(), 3), d10: addDays(today(), 10), d30: addDays(today(), 30), t: today() }));
      const type = async (txt) => { await page.fill('#pantryInput', txt); await page.click('#pantryOv [data-act="NTPantry.submitInput"]'); };
      const listText = () => page.evaluate(() => document.getElementById('pantryList').textContent);
      // D1: im Kühlschrank eingebucht → MHD heute + 5, als geschätzt markiert
      await page.click('#pantryLocChips [data-args=\'["kuehl"]\']');
      await type('Milch');
      await page.click('#pantryLocChips [data-args=\'[""]\']');
      await type('2 Nudeln');
      await type('Smoke-Schwamm');
      const st = await page.evaluate(() => {
        const m = S.pantry.find((x) => x.n === 'Milch'), s = S.pantry.find((x) => x.n === 'Smoke-Schwamm');
        s.min = 3; NTPantry.render();
        return { m: { loc: m.loc, mhd: m.mhd, est: m.lots[0].estimated, c: m.c, in: m.lots[0].in }, s: { mhd: s.mhd }, row: document.getElementById('pantryList').textContent };
      });
      out.estimate = st.m.loc === 'kuehl' && st.m.mhd === T.d5 && st.m.est === true && st.m.in === T.t && st.s.mhd === '' && /geschätzt/.test(st.row);
      // A1: Kennzahlen, „Fehlt“ filtert, zweiter Tipp hebt auf
      const tiles = await page.evaluate(() => [...document.querySelectorAll('#pantryStats .nt-tool')].map((b) => b.textContent));
      await page.click('#pantryStats [data-args=\'["__low"]\']');
      const low = await listText();
      const pressed = await page.getAttribute('#pantryStats [data-args=\'["__low"]\']', 'aria-pressed');
      await page.click('#pantryStats [data-args=\'["__low"]\']');
      out.stats = tiles[0] === '0Läuft ab' && tiles[1] === '1Fehlt' && tiles[2] === '3Artikel'
        && /Smoke-Schwamm/.test(low) && !/Nudeln/.test(low) && pressed === 'true' && /Nudeln/.test(await listText());
      // A2: Suche legt nichts an; „nicht gefunden“ bietet das Einbuchen an
      await page.fill('#pantrySearch', 'nud');
      const found = await listText();
      await page.fill('#pantrySearch', 'Quark');
      const n0 = await page.evaluate(() => S.pantry.length);
      const miss = await listText();
      await page.click('#pantryList [data-act="NTPantry.addQuery"]');
      out.search = /Nudeln/.test(found) && !/Milch/.test(found) && /Nichts gefunden/.test(miss) && n0 === 3
        && await page.evaluate(() => S.pantry.length === 4 && !!S.pantry.find((x) => x.n === 'Quark') && document.getElementById('pantrySearch').value === '');
      // A2/A3: ordnen nach Name (flach, gemerkt) und nach Kategorie (Gruppen + Kategorie-Chips)
      await page.selectOption('#pantryOrder', 'name');
      const byName = await page.evaluate(() => [...document.querySelectorAll('#pantryList [data-act="NTPantry.openItem"] > div:first-child')].map((d) => d.textContent));
      await page.selectOption('#pantryOrder', 'cat');
      const byCat = await page.evaluate(() => ({ list: document.getElementById('pantryList').textContent, chips: document.getElementById('pantryLocChips').textContent, order: S.pantryOrder }));
      await page.selectOption('#pantryOrder', 'loc');
      out.order = byName.join('|') === 'Milch|Nudeln|Quark|Smoke-Schwamm' && byCat.order === 'cat' && /Milch & Käse/.test(byCat.list) && /Milch & Käse/.test(byCat.chips)
        && await page.evaluate(() => S.pantryOrder === 'loc');
      // A4 + A3: Detail öffnen, Kategorie auf den Zettel
      const milkId = await page.evaluate(() => S.pantry.find((x) => x.n === 'Milch').id);
      await page.click('#pantryOv [data-act="NTPantry.step"][data-args=\'["' + milkId + '",1]\']');
      await page.click('#pantryList [data-act="NTPantry.openItem"][data-args=\'["' + milkId + '"]\']');
      await page.locator('#pantryItemOv.open').waitFor();
      const det = await page.evaluate(() => ({ sum: document.getElementById('pantryItemSum').textContent, cards: document.querySelectorAll('#pantryCharges .pantry-charge[data-lot-id]:not([data-lot-id=""])').length, log: document.getElementById('pantryItemLog').textContent }));
      await page.click('#pantryItemOv [data-act="NTPantry.toShop"]');
      out.detail = /Bestand/.test(det.sum) && /Kühlschrank/.test(det.sum) && /Milch & Käse/.test(det.sum) && det.cards === 2 && /Gekauft/.test(det.log)
        && await page.evaluate(() => { const m = S.pantry.find((x) => x.n === 'Milch'), si = S.shopList.find((x) => x.n === 'Milch' && !x.d); return !!si && si.c === m.c; });
      // D2: zweite Charge „Geöffnet“ → Frist heute + 3 zählt, Kennzahl „Läuft ab“
      const lots0 = await page.evaluate((id) => S.pantry.find((x) => x.id === id).lots.map((l) => l.id), milkId);
      await page.click('#pantryCharges [data-act="NTPantry.openLot"][data-args=\'["' + lots0[1] + '"]\']');
      const op = await page.evaluate((id) => { const m = S.pantry.find((x) => x.id === id); return { op: m.lots.find((l) => l.op), exp: NTPantry.expiring().length, sum: document.getElementById('pantryItemSum').textContent }; }, milkId);
      out.opened = !!op.op && op.op.id === lots0[1] && op.op.op === T.t && op.exp === 1 && /Geöffnet · bis/.test(op.sum);
      // D3: „−“ in der Liste nimmt die geöffnete Charge, obwohl beide gleich lange halten
      await page.evaluate(() => closeOv('pantryItemOv'));
      await page.click('#pantryOv [data-act="NTPantry.step"][data-args=\'["' + milkId + '",-1]\']');
      out.oldestFirst = await page.evaluate(({ id, keepLot }) => { const m = S.pantry.find((x) => x.id === id); return m.q === 1 && m.lots.length === 1 && m.lots[0].id === keepLot && S.pantryLog[0].lots[0].op; }, { id: milkId, keepLot: lots0[0] });
      // A4: Charge entfernen bucht eine Korrektur, ↩️ in „Letzte Buchungen“ holt sie zurück
      await page.click('#pantryList [data-act="NTPantry.openItem"][data-args=\'["' + milkId + '"]\']');
      await page.click('#pantryCharges [data-act="NTPantry.dropLot"]');
      const dropped = await page.evaluate((id) => ({ q: S.pantry.find((x) => x.id === id).q, k: S.pantryLog[0].k }), milkId);
      await page.click('#pantryItemLog [data-act="NTPantry.undo"]');
      out.dropLot = dropped.q === 0 && dropped.k === 'korrektur' && await page.evaluate((id) => S.pantry.find((x) => x.id === id).q === 1 && /Bestand/.test(document.getElementById('pantryItemSum').textContent), milkId);
      // D4: echte Charge (Datum eingetragen) bleibt, geschätzte wird für den Tiefkühler neu berechnet
      await page.click('#pantryItemOv [data-act="NTPantry.addChargeRow"]');
      await page.fill('#pantryCharges .pantry-charge-mhd >> nth=-1', T.d10);
      await page.click('#pantryItemOv [data-act="NTPantry.saveItem"]');
      await page.click('#pantryList [data-act="NTPantry.openItem"][data-args=\'["' + milkId + '"]\']');
      await page.selectOption('#pantryItemLoc', 'tk');
      const offer = await page.isVisible('#pantryItemRelocChk');
      await page.click('#pantryItemOv [data-act="NTPantry.saveItem"]');
      out.reloc = offer && await page.evaluate(({ id, T }) => {
        const m = S.pantry.find((x) => x.id === id), d = m.lots.map((l) => l.mhd).sort();
        return m.loc === 'tk' && d[0] === T.d10 && d[1] === T.d30 && m.lots.find((l) => l.mhd === T.d10).estimated === false;
      }, { id: milkId, T });
    } catch (e) { record('Vorrat-Ausbau', e.message); }
    await page.evaluate((k) => {
      document.querySelectorAll('.ov.open').forEach((o) => o.classList.remove('open'));
      if (!k) return;
      const o = JSON.parse(k);
      S.shopList = o.shop; S.pantry = o.pantry; S.pantryLog = o.log; S.pantryLocs = null; S.pantryTomb = {};
      if (o.order === null) delete S.pantryOrder; else S.pantryOrder = o.order;
      saveS(); NTShop.render(); NTPantry.render();
    }, keep).catch(() => {});
    page.off('dialog', onDialog);
    for (const [k, v] of Object.entries({ estimate: 'Milch im Kühlschrank → MHD heute + 5, „geschätzt“, eingebucht heute; ohne Richtwert kein Datum',
      stats: 'Übersicht Läuft ab/Fehlt/Artikel, „Fehlt“ filtert und hebt beim zweiten Tipp auf',
      search: 'Suche filtert ohne anzulegen, „nicht gefunden“ bucht auf Wunsch ein',
      order: 'Ordnen nach Name (flach, gemerkt) und Kategorie (Gruppen und Chips)',
      detail: 'Detail mit Bestand, Ort, Kategorie, Chargen und Buchungen; Zettel übernimmt die Kategorie',
      opened: '„Geöffnet“ setzt das Datum, verkürzte Frist zählt in Kopf und „Läuft ab“',
      oldestFirst: '„−“ zieht von der geöffneten Charge ab', dropLot: 'Charge entfernen als Korrektur, ↩️ im Detail holt sie zurück',
      reloc: 'Ortswechsel schätzt nur das geschätzte Datum neu, eingetragenes bleibt' })) {
      if (!out[k]) { pantry2Fail++; console.log('  x   Vorrat-Ausbau: ' + v); }
    }
    const newErr = errors.length - errBefore;
    if (newErr) { pantry2Fail++; console.log(`  x   Vorrat-Ausbau: ${newErr} neue(r) Fehler, siehe unten.`); }
    if (!pantry2Fail) console.log('  ok  Vorrat-Ausbau: Übersicht und Filter, Suche getrennt vom Einbuchen, Ordnen nach Name/Kategorie, Detail mit Chargen und Buchungen, Kategorie auf den Zettel, geschätztes MHD, Geöffnet-Frist, geöffnete Charge zuerst, Charge entfernen/Rückgängig, Ortswechsel.');
  }

  // 12d. Vorrat Paket 2: Verbrauch lernen (Weggeworfenes zählt nicht),
  //      Prognose in Zeile und Detail, „Geht bald aus“, Mindestmenge
  //      vorschlagen, Dauerartikel → Zettel mit Herkunft, vom Zettel genommen →
  //      gesperrt bis zum Einbuchen, Nachkaufen-Ansicht, täglicher Lauf ohne
  //      Dublette, eine Meldung, ⋯ Mehr mit Orten/Verlauf/Vorlauf. Per Klick.
  let pantry3Fail = 0;
  {
    const errBefore = errors.length;
    const out = {};
    let keep = null;
    try {
      keep = await page.evaluate(() => {
        const k = JSON.stringify({ shop: S.shopList, shopTomb: S.shopTomb || {}, pantry: S.pantry || [], log: S.pantryLog || [], tomb: S.pantryTomb || {} });
        document.querySelectorAll('.ov.open').forEach((o) => o.classList.remove('open'));
        S.shopList = []; S.shopTomb = {}; S.pantryTomb = {}; S.pantryLocs = null;
        ['pantryLead', 'pantryRestockDay', 'pantryRestockNews', 'pantryRemindDay'].forEach((x) => delete S[x]);
        // 30 Tage Verlauf: 14 gekauft, 6 × 1,5 verbraucht/gekocht, 3 weggeworfen,
        // eine rückgängig gemachte Entnahme → 2 da, 0,3 Stück/Tag → reicht ca. 6 Tage.
        const day = 864e5, now = Date.now();
        S.pantry = [{ id: 'smoke-kaffee', n: 'Smoke-Kaffee', ic: '☕', loc: 'vorrat', c: 'vorrat', q: 2, g: 500, min: 0, mhd: '', vd: '', rev: 1 }];
        S.pantryLog = [{ id: 'sk0', t: now - 30 * day, pid: 'smoke-kaffee', n: 'Smoke-Kaffee', d: 14, k: 'kauf', src: 'hand', u: 0, rev: 1 }];
        [28, 24, 20, 16, 12, 8].forEach((d, i) => S.pantryLog.push({ id: 'sk' + (i + 1), t: now - d * day, pid: 'smoke-kaffee', n: 'Smoke-Kaffee', d: -1.5, k: i % 2 ? 'kochen' : 'verbrauch', src: 'hand', u: 0, rev: 1 }));
        S.pantryLog.push({ id: 'sk7', t: now - 5 * day, pid: 'smoke-kaffee', n: 'Smoke-Kaffee', d: -3, k: 'verderb', src: 'hand', u: 0, rev: 1 });
        S.pantryLog.push({ id: 'sk8', t: now - 4 * day, pid: 'smoke-kaffee', n: 'Smoke-Kaffee', d: -2, k: 'verbrauch', src: 'hand', u: 1, rev: 1 });
        S.pantryLog.sort((a, b) => b.t - a.t);
        NTPantry.open(); NTPantry.setFilter('');
        return k;
      });
      const listText = () => page.evaluate(() => document.getElementById('pantryList').textContent);
      const shopOf = () => page.evaluate(() => S.shopList.filter((x) => x.n === 'Smoke-Kaffee' && !x.d).map((x) => ({ id: x.id, q: x.q, pv: x.pv })));
      const kaffee = () => page.evaluate(() => { const k = S.pantry.find((x) => x.id === 'smoke-kaffee'); return { q: k.q, min: k.min, auto: k.auto, rs: k.rs || null, rsNo: k.rsNo || 0 }; });
      // B2: Zeile dezent, Hinweis „geht bald aus“ filtert
      const row0 = await listText();
      const hint = await page.textContent('#pantrySoon .pantry-soon');
      await page.click('#pantrySoon .pantry-soon');
      const soonView = await listText();
      out.forecast = /reicht ca\. 6 Tage/.test(row0) && /1 geht bald aus/.test(hint) && /Smoke-Kaffee/.test(soonView) && /Kein Dauerartikel/.test(soonView)
        && await page.getAttribute('#pantrySoon .pantry-soon', 'aria-pressed') === 'true';
      await page.click('#pantrySoon .pantry-soon'); // zweiter Tipp hebt den Filter auf
      // B2/B3: Detail mit Verbrauch pro Woche (ohne Weggeworfenes/Rückgängiges), Vorschlag übernehmen
      await page.click('#pantryList [data-act="NTPantry.openItem"][data-args=\'["smoke-kaffee"]\']');
      await page.locator('#pantryItemOv.open').waitFor();
      const sum = await page.textContent('#pantryItemSum');
      const sug = await page.textContent('#pantryItemMinSug');
      await page.click('#pantryItemMinSug [data-act="NTPantry.takeMinSug"]');
      out.detail = /Verbrauch ca\. 2,1 Stück pro Woche \(1 kg\)/.test(sum) && /reicht bis ca\./.test(sum) && /6 Entnahmen in 30 Tagen/.test(sum)
        && /3 Stück/.test(sug) && await page.inputValue('#pantryItemMin') === '3' && (await kaffee()).min === 0;
      // C1/C2: Dauerartikel → unter Mindestmenge → Zettel mit fester ID, Herkunft und üblicher Menge
      await page.check('#pantryItemAuto');
      await page.click('#pantryItemOv [data-act="NTPantry.saveItem"]');
      let s1 = await shopOf(), k1 = await kaffee();
      out.auto = k1.auto === 1 && k1.min === 3 && s1.length === 1 && /^vorrat-smoke-kaffee-sk0$/.test(s1[0].id) && s1[0].q === '14 Stück'
        && s1[0].pv === 'unter Mindestmenge' && k1.rs && k1.rs.s === s1[0].id;
      await page.evaluate(() => { NTShop.open(); });
      out.shopSrc = /aus dem Vorrat · unter Mindestmenge/.test(await page.textContent('#shopList'));
      await page.evaluate(() => { NTShop.close(); delete S.pantryRestockDay; NTPantry.daily(); NTPantry.open(); });
      out.noDup = (await shopOf()).length === 1;
      // Vom Zettel genommen → „−“ bringt ihn nicht zurück (gesperrt bis zum Einbuchen)
      await page.evaluate((id) => NTShop.remove(id), s1[0].id);
      await page.click('#pantryOv [data-act="NTPantry.step"][data-args=\'["smoke-kaffee",-1]\']');
      const k2 = await kaffee();
      out.blocked = (await shopOf()).length === 0 && k2.q === 1 && !k2.rs && k2.rsNo > 0;
      // C3: Nachkaufen-Ansicht — gesperrt, „Auf den Zettel“ holt ihn trotzdem (neue ID wegen Grabstein), „Diesmal nicht“ nimmt ihn weg
      await page.click('#pantrySoon .pantry-soon');
      const sv = await listText();
      await page.click('#pantryList [data-act="NTPantry.restockNow"][data-args=\'["smoke-kaffee"]\']');
      const s3 = await shopOf();
      await page.click('#pantryList [data-act="NTPantry.skipRestock"][data-args=\'["smoke-kaffee"]\']');
      const k3 = await kaffee();
      out.soonActs = /Diesmal nicht — wieder nach dem nächsten Einkauf/.test(sv) && s3.length === 1 && s3[0].id === 'vorrat-smoke-kaffee-sk0-2' && !!s3[0].pv
        && (await shopOf()).length === 0 && !k3.rs && k3.rsNo > 0;
      // Einbuchen hebt die Sperre auf → wieder unter Mindestmenge → neuer Eintrag; Abhaken füllt auf und löst die Markierung
      await page.evaluate(() => NTPantry.setFilter(''));
      await page.click('#pantryOv [data-act="NTPantry.step"][data-args=\'["smoke-kaffee",1]\']');
      const s4 = await shopOf(), k4 = await kaffee();
      await page.evaluate((id) => NTShop.toggle(id), s4[0] && s4[0].id);
      const k5 = await kaffee();
      out.cycle = s4.length === 1 && s4[0].id !== 'vorrat-smoke-kaffee-sk0' && k4.q === 2 && !k4.rsNo && k4.rs && k4.rs.s === s4[0].id
        && s4[0].q === '8 Stück' // üblicher Kauf: Median aus 14 und 1
        && k5.q === 10 && !k5.rs && (await shopOf()).length === 0;
      // C2/C4: täglicher Lauf setzt einen Dauerartikel und die EINE Meldung nennt ihn
      const daily = await page.evaluate(() => {
        S.pantry.push({ id: 'smoke-tee', n: 'Smoke-Tee', ic: '🍵', loc: 'vorrat', q: 0, g: 0, min: 1, auto: 1, rev: 1 });
        delete S.pantryRestockDay; delete S.pantryRemindDay; S.pantryRemindOff = false;
        const realN = window.Notification, realNotify = NTRemind.notify, sent = [];
        window.Notification = /** @type {any} */ ({ permission: 'granted' });
        NTRemind.notify = (t, o) => { sent.push(t + ' | ' + o.body); };
        NTPantry.daily(); NTPantry.daily();
        window.Notification = realN; NTRemind.notify = realNotify;
        const tee = S.shopList.filter((x) => x.n === 'Smoke-Tee' && !x.d);
        return { tee: tee.length, pv: tee[0] && tee[0].pv, news: S.pantryRestockNews, sent, early: new Date().getHours() < 7 };
      });
      out.daily = daily.tee === 1 && daily.pv === 'unter Mindestmenge' && /Smoke-Tee/.test(daily.news.n.join())
        && (daily.early ? daily.sent.length === 0 : (daily.sent.length === 1 && /1 auf dem Einkaufszettel/.test(daily.sent[0]) && /Nachkaufen: .*Smoke-Tee/.test(daily.sent[0])));
      // Kopf: ⋯ Mehr führt zu Verlauf, Orten und dem Vorlauf
      await page.click('#pantryOv [data-act="NTPantry.openMore"]');
      await page.click('#pantryMoreOv [data-act="NTPantry.openLog"]');
      const logOpen = await page.evaluate(() => document.getElementById('pantryLogOv').classList.contains('open') && !document.getElementById('pantryMoreOv').classList.contains('open'));
      await page.evaluate(() => closeOv('pantryLogOv'));
      await page.click('#pantryOv [data-act="NTPantry.openMore"]');
      await page.selectOption('#pantryLead', '5');
      await page.click('#pantryMoreOv [data-act="NTPantry.openLocs"]');
      out.more = logOpen && await page.evaluate(() => S.pantryLead === 5 && document.getElementById('pantryLocsOv').classList.contains('open'))
        && await page.evaluate(() => document.querySelectorAll('#pantryOv .pantry-tools .nt-tool').length === 4);
    } catch (e) { record('Vorrat Nachkauf', e.message); }
    await page.evaluate((k) => {
      document.querySelectorAll('.ov.open').forEach((o) => o.classList.remove('open'));
      ['pantryLead', 'pantryRestockDay', 'pantryRestockNews', 'pantryRemindDay'].forEach((x) => delete S[x]);
      if (!k) return;
      const o = JSON.parse(k);
      S.shopList = o.shop; S.shopTomb = o.shopTomb; S.pantry = o.pantry; S.pantryLog = o.log; S.pantryTomb = o.tomb; S.pantryLocs = null;
      saveS(); NTShop.render(); NTPantry.render();
    }, keep).catch(() => {});
    for (const [k, v] of Object.entries({ forecast: 'Zeile „reicht ca. 6 Tage“, Hinweis „geht bald aus“ filtert auf Nachkaufen',
      detail: 'Detail: Verbrauch pro Woche ohne Weggeworfenes/Rückgängiges, Vorschlag Mindestmenge nur per Tipp',
      auto: 'Dauerartikel unter Mindestmenge → Zettel mit fester ID, üblicher Menge und Herkunft',
      shopSrc: 'Zettel zeigt „aus dem Vorrat“ mit Grund', noDup: 'täglicher Lauf setzt nichts doppelt',
      blocked: 'vom Zettel genommen → kommt nach „−“ nicht wieder', soonActs: 'Nachkaufen: „Auf den Zettel“ und „Diesmal nicht“',
      cycle: 'Einbuchen hebt die Sperre auf, Abhaken füllt auf und löst die Markierung',
      daily: 'täglicher Lauf setzt Dauerartikel, eine Meldung nennt Ablauf und Nachkauf', more: '⋯ Mehr: Verlauf, Orte, Vorlauf; vier Werkzeuge im Kopf' })) {
      if (!out[k]) { pantry3Fail++; console.log('  x   Vorrat Nachkauf: ' + v); }
    }
    const newErr = errors.length - errBefore;
    if (newErr) { pantry3Fail++; console.log(`  x   Vorrat Nachkauf: ${newErr} neue(r) Fehler, siehe unten.`); }
    if (!pantry3Fail) console.log('  ok  Vorrat Nachkauf: Verbrauch lernen, Prognose in Zeile/Detail, Geht bald aus, Mindestmenge vorschlagen, Dauerartikel mit Herkunft auf den Zettel, Sperre nach Entfernen, Nachkaufen-Ansicht, täglicher Lauf ohne Dublette, eine Meldung, ⋯ Mehr.');
  }

  // 12e. Vorrat Paket 3: Tagebuch ↔ Vorrat und Wochenplan ↔ Vorrat. Ein
  //      Rezept ins Tagebuch → EIN Vorschlag mit allen Artikeln (Gramm/Stück,
  //      abwählbar), Mehrdeutiges zur Auswahl und gemerkt, dreimal abgelehnt →
  //      nicht mehr gefragt (⋯ Mehr setzt zurück), Schalter aus → keine Frage,
  //      Wiederkehrende → nur offener Vorschlag im Vorrat (kein Dialog, kein
  //      Abzug), schon gebucht → entdoppelt, Portionen halbiert → Rückbuchung,
  //      Läuft ab → „Rezept dazu finden“ → Einplanen, „Füllen“ mit Vorrats-
  //      Merkmal, Woche → Zettel mit Zusammenfassung, Vorrat nur einmal.
  let pantry4Fail = 0;
  {
    const errBefore = errors.length;
    const onDialog = (d) => d.accept();
    page.on('dialog', onDialog);
    const out = {};
    let keep = null;
    const tick = () => page.evaluate(() => new Promise((r) => setTimeout(r, 30)));
    const isOpen = (id) => page.evaluate((id) => document.getElementById(id).classList.contains('open'), id);
    try {
      keep = await page.evaluate(() => {
        const k = JSON.stringify({ shop: S.shopList, shopTomb: S.shopTomb || {}, pantry: S.pantry || [], log: S.pantryLog || [], tomb: S.pantryTomb || {},
          ask: S.pantryAsk || null, map: S.pantryMap || null, off: !!S.pantryAskOff, days: S.days, plan: S.mealPlan || {}, planTomb: S.planTomb || {},
          applied: S.planApplied || {}, recur: S.recurringMeals || [], cook: S.cookLog || {}, goal: S.goal, cur: S.currentDate, recipes });
        document.querySelectorAll('.ov.open').forEach((o) => o.classList.remove('open'));
        const p = (kcal) => ({ kcal, protein: 5, carbs: 10, fat: 3, sugar: 0, fiber: 0, salt: 0 });
        S.currentDate = today(); S.goal = 2000; S.days = {}; S.mealPlan = {}; S.planApplied = {}; S.recurringMeals = []; S.cookLog = {};
        delete S.pantryAsk; delete S.pantryMap; delete S.pantryAskOff;
        S.shopList = []; S.pantryLog = []; S.pantryTomb = {}; S.pantryLocs = null;
        S.pantry = [
          { id: 'sm-milch', n: 'Milch', ic: '🥛', loc: 'kuehl', q: 2, g: 1000, min: 0, lots: [{ id: 'sm-l1', q: 2, mhd: addDays(today(), 1), vd: '' }], mhd: addDays(today(), 1), vd: '', rev: 1 },
          { id: 'sm-hafer', n: 'Haferflocken', ic: '🌾', loc: 'vorrat', q: 1, g: 500, min: 0, rev: 1 },
          { id: 'sm-toast', n: 'Smoke-Toast', ic: '🍞', loc: 'vorrat', q: 3, g: 0, min: 0, rev: 1 },
          { id: 'sm-pizza', n: 'Smoke-Pizza', ic: '🍕', loc: 'tk', q: 2, g: 0, min: 0, rev: 1 },
        ];
        recipes.splice(0, recipes.length,
          { id: 'sm-muesli', name: 'Smoke-Müsli', emoji: '🥣', meal: ['breakfast'], ingredients: [
            { name: 'Haferflocken', amount: 60, per100: p(370) }, { name: 'Milch', amount: 200, per100: p(64) },
            { name: 'Smoke-Toast', amount: 50, per100: p(260) }, { name: 'Zimt', amount: 2, per100: p(250) }] },
          { id: 'sm-pudding', name: 'Smoke-Pudding', emoji: '🍮', meal: ['lunch'], ingredients: [{ name: 'Milch', amount: 1000, per100: p(70) }] },
          { id: 'sm-reis', name: 'Smoke-Reis', emoji: '🍚', meal: ['dinner'], ingredients: [{ name: 'Reis', amount: 100, per100: p(350) }] });
        saveS(); renderAll();
        return k;
      });
      // E1: Rezept ins Tagebuch → ein Vorschlag, Gramm vorgeschlagen, Stück leer und abgewählt
      await page.evaluate(() => NTPicker.addRecipeEntry('sm-muesli', 'breakfast', 1));
      await page.locator('#pantryMealOv.open').waitFor();
      const rows = await page.evaluate(() => [...document.querySelectorAll('#pantryMealRows .pantry-meal-row')].map((r) => ({
        it: r.querySelector('select').value, q: r.querySelector('.pantry-meal-q input').value, unit: r.querySelector('.pantry-meal-q span').textContent,
        on: r.querySelector('.pantry-meal-on input').checked })));
      out.offer = rows.length === 3 && JSON.stringify(rows) === JSON.stringify([
        { it: 'sm-hafer', q: '60', unit: 'g', on: true }, { it: 'sm-milch', q: '200', unit: 'g', on: true }, { it: 'sm-toast', q: '', unit: 'Stück', on: false }])
        && await page.textContent('#pantryMealOk') === 'Abziehen' && await page.textContent('#pantryMealNo') === 'Nicht aus dem Vorrat'
        && await page.evaluate(() => S.pantry.find((x) => x.id === 'sm-milch').q === 2);
      // abwählen und ergänzen: Haferflocken nicht, Toast 1 Stück
      await page.click('#pantryMealRows .pantry-meal-row:nth-child(1) .pantry-meal-on');
      await page.fill('#pantryMealRows .pantry-meal-row:nth-child(3) .pantry-meal-q input', '1');
      await page.click('#pantryMealRows .pantry-meal-row:nth-child(3) .pantry-meal-on');
      await page.click('#pantryMealOk');
      out.booked = await page.evaluate(() => {
        const q = (id) => S.pantry.find((x) => x.id === id).q, e = getDay().meals.breakfast[0];
        const evs = S.pantryLog.filter((l) => l.ev === e._vid).map((l) => l.pid + ':' + l.d).sort().join();
        return q('sm-milch') === 1.8 && q('sm-toast') === 2 && q('sm-hafer') === 1 && evs === 'sm-milch:-0.2,sm-toast:-1'
          && S.pantryMap.milch.ok === 1 && S.pantryMap.milch.p === 'sm-milch' && S.pantryMap[pantryKey('Haferflocken')].no === 1
          && !document.getElementById('pantryMealOv').classList.contains('open');
      });
      // E2: mehrdeutig → zur Auswahl, nichts vorgewählt; Wahl wird gemerkt
      const amb = { name: 'Haferflocken mit Milch', emoji: '🥣', amount: 250, per100: { kcal: 90, protein: 3, carbs: 12, fat: 3 }, kcal: 225, protein: 8, carbs: 30, fat: 8 };
      await page.evaluate((amb) => { const e = JSON.parse(JSON.stringify(amb)); getDay().meals.snack.push(e); NTPantry.offerMeal(e); }, amb);
      await page.locator('#pantryMealOv.open').waitFor();
      const ambRow = await page.evaluate(() => ({ n: document.querySelectorAll('#pantryMealRows .pantry-meal-row').length, sel: document.querySelector('#pantryMealRows select').value,
        on: document.querySelector('#pantryMealRows .pantry-meal-on input').checked, note: document.querySelector('#pantryMealRows small').textContent }));
      await page.selectOption('#pantryMealRows select', 'sm-milch');
      const picked = await page.inputValue('#pantryMealRows .pantry-meal-q input');
      await page.click('#pantryMealOk');
      await page.evaluate((amb) => { const e = JSON.parse(JSON.stringify(amb)); getDay().meals.snack.push(e); NTPantry.offerMeal(e); }, amb);
      await page.locator('#pantryMealOv.open').waitFor();
      const again = await page.evaluate(() => ({ sel: document.querySelector('#pantryMealRows select').value, on: document.querySelector('#pantryMealRows .pantry-meal-on input').checked }));
      await page.click('#pantryMealNo');
      out.choice = ambRow.n === 1 && ambRow.sel === '' && !ambRow.on && /Mehrdeutig/.test(ambRow.note) && picked === '250'
        && again.sel === 'sm-milch' && again.on && await page.evaluate(() => S.pantry.find((x) => x.id === 'sm-milch').q === 1.55);
      // E2: dreimal „Nicht aus dem Vorrat“ für denselben Namen → keine Frage mehr; ⋯ Mehr setzt zurück
      const pizza = { name: 'Smoke-Pizza', emoji: '🍕', amount: 300, per100: { kcal: 250, protein: 10, carbs: 30, fat: 10 }, kcal: 750, protein: 30, carbs: 90, fat: 30 };
      for (let i = 0; i < 3; i++) {
        await page.evaluate((x) => { const e = JSON.parse(JSON.stringify(x)); getDay().meals.dinner.push(e); NTPantry.offerMeal(e); }, pizza);
        await page.locator('#pantryMealOv.open').waitFor();
        await page.click('#pantryMealNo');
      }
      await page.evaluate((x) => { const e = JSON.parse(JSON.stringify(x)); getDay().meals.dinner.push(e); NTPantry.offerMeal(e); }, pizza);
      await tick();
      const muted = !(await isOpen('pantryMealOv'));
      await page.evaluate(() => { NTPantry.open(); NTPantry.openMore(); });
      const muteNote = await page.textContent('#pantryAskMuted');
      await page.click('#pantryAskMuted [data-act="NTPantry.askUnmute"]');
      out.mute = muted && /Für 1 Namen fragt die App nicht mehr/.test(muteNote) && await page.evaluate(() => !S.pantryMap[pantryKey('Smoke-Pizza')]);
      // E5: Schalter aus → keine Frage (gerätelokal), an → wieder
      await page.uncheck('#pantryAskChk');
      await page.evaluate((x) => { const e = JSON.parse(JSON.stringify(x)); getDay().meals.dinner.push(e); NTPantry.offerMeal(e); }, pizza);
      await tick();
      out.toggle = !(await isOpen('pantryMealOv')) && await page.evaluate(() => S.pantryAskOff === true);
      await page.check('#pantryAskChk');
      await page.evaluate(() => { closeOv('pantryMoreOv'); });
      // E3: Wiederkehrende Mahlzeit → kein Dialog, kein Abzug, offener Vorschlag im Vorrat
      await page.evaluate(() => {
        S.recurringMeals = [{ id: 'sm-rec', active: true, meal: 'lunch', weekdays: [0, 1, 2, 3, 4, 5, 6], startDate: addDays(today(), -1),
          entries: [{ name: 'Smoke-Toast', emoji: '🍞', amount: 50, per100: { kcal: 260, protein: 8, carbs: 48, fat: 3 }, kcal: 130, protein: 4, carbs: 24, fat: 2, _vid: 'alt' }] }];
        NTRecur.apply(today()); saveS(); NTPantry.render();
      });
      await tick();
      const e3 = await page.evaluate(() => ({ open: document.getElementById('pantryMealOv').classList.contains('open'), toast: S.pantry.find((x) => x.id === 'sm-toast').q,
        ask: (S.pantryAsk || []).length, vid: getDay().meals.lunch[0]._vid, hint: document.getElementById('pantryAskHint').textContent }));
      await page.click('#pantryAskHint .pantry-soon');
      await page.locator('#pantryMealOv.open').waitFor();
      const e3sub = await page.textContent('#pantryMealSub');
      await page.fill('#pantryMealRows .pantry-meal-q input', '1');
      await page.check('#pantryMealRows .pantry-meal-on input');
      await page.click('#pantryMealOk');
      out.pending = !e3.open && e3.toast === 2 && e3.ask === 1 && e3.vid !== 'alt' && /1 Mahlzeit: aus dem Vorrat abziehen\?/.test(e3.hint) && /Ohne dich eingetragen/.test(e3sub)
        && await page.evaluate(() => S.pantry.find((x) => x.id === 'sm-toast').q === 1 && !(S.pantryAsk || []).length && !document.getElementById('pantryAskHint').textContent);
      // E3: derselbe Eintrag schon gebucht (anderes Gerät, Verlauf per Sync) → Vorschlag fällt weg; zu alte Tage gar nicht erst
      out.dedup = await page.evaluate(() => {
        const e = { name: 'Smoke-Toast', amount: 50, per100: { kcal: 260, protein: 8, carbs: 48, fat: 3 }, kcal: 130 };
        getDay().meals.snack.push(e); NTPantry.queueMeal(e, today(), 'snack', 'alexa');
        const before = S.pantryAsk.length;
        S.pantryLog.unshift({ id: 'fremd', t: Date.now(), pid: 'sm-toast', n: 'Smoke-Toast', d: -1, k: 'verbrauch', src: 'Mahlzeit', ev: e._vid, u: 0, rev: 1 });
        NTPantry.render();
        const old = { name: 'Smoke-Toast', amount: 50 }; NTPantry.queueMeal(old, addDays(today(), -5), 'snack', 'alexa');
        return before === 1 && !S.pantryAsk.length && !document.getElementById('pantryAskHint').textContent;
      });
      // E4: Portionen halbiert → Rückbuchung anbieten, Gramm/Stück zurück, im Verlauf mit Bezug
      await page.evaluate(() => { closeOv('pantryOv'); openEditEntry('breakfast', 0); document.getElementById('editPortions').value = '0.5'; saveEditEntry(); });
      await page.locator('#pantryMealOv.open').waitFor();
      const back = await page.evaluate(() => ({ t: document.getElementById('pantryMealTitle').textContent,
        q: [...document.querySelectorAll('#pantryMealRows .pantry-meal-q input')].map((i) => i.value).sort().join('|') }));
      await page.click('#pantryMealOk');
      out.rebook = /anpassen/.test(back.t) && back.q === '0,5|100' && await page.evaluate(() => {
        const q = (id) => S.pantry.find((x) => x.id === id).q, v = getDay().meals.breakfast[0]._vid;
        return q('sm-milch') === 1.65 && q('sm-toast') === 1.5 && S.pantryLog.some((l) => l.ev === v && l.k === 'korrektur' && l.d === 0.1);
      });
      // F3: Läuft ab → „Rezept dazu finden“ → nur Rezepte mit Milch → Einplanen öffnet das Kochbuch mit Einplanen-Feld
      await page.evaluate(() => { NTPantry.open(); NTPantry.setFilter('__exp'); });
      await page.click('#pantryList [data-act="NTPantry.openCook"][data-args=\'["sm-milch"]\']');
      await page.locator('#pantryCookOv.open').waitFor();
      const cook = await page.textContent('#pantryCookList');
      await page.click('#pantryCookList [data-act="NTPantry.planRecipe"][data-args=\'["sm-pudding"]\']');
      await page.locator('#bookDetailOv.open').waitFor();
      out.cookFor = /Mit 🥛 Milch/.test(cook) && /Smoke-Pudding/.test(cook) && /Smoke-Müsli/.test(cook) && !/Smoke-Reis/.test(cook)
        && await page.isVisible('#bookPlanDate');
      // F1: „Füllen“ nimmt das Rezept mit ablaufender Milch und sagt warum
      out.fill = await page.evaluate(() => {
        document.querySelectorAll('.ov.open').forEach((o) => o.classList.remove('open'));
        S.days = {}; S.mealPlan = {};
        recipes.splice(0, recipes.length, recipes.find((r) => r.id === 'sm-pudding') || { id: 'x' });
        recipes[0].ingredients[0].amount = 1000; // 700 kcal ≈ 35 % von 2000
        NTPlan.open(today()); NTPlan.autoFill();
        const it = (S.mealPlan[today()] || {}).lunch || [];
        return it.length === 1 && it[0].w === 'verbraucht Milch (läuft ab)' && /🥫 verbraucht Milch/.test(document.getElementById('planDays').textContent);
      });
      // F2: zwei Rezepte à 1000 g Milch bei 1500 g Vorrat → 500 g fehlen; vergangene Tage zählen nicht; erst Zusammenfassung
      await page.evaluate(() => {
        S.mealPlan = {}; S.pantry.find((x) => x.id === 'sm-milch').q = 1.5; S.pantry.find((x) => x.id === 'sm-milch').lots = [{ id: 'sm-l1', q: 1.5, mhd: '', vd: '' }];
        NTPlan.planRecipe(today(), 'lunch', 'sm-pudding', 1); NTPlan.planRecipe(today(), 'dinner', 'sm-pudding', 1);
        if (NTPlan.visibleDates().indexOf(addDays(today(), -1)) >= 0) NTPlan.planRecipe(addDays(today(), -1), 'lunch', 'sm-pudding', 3);
        NTPlan.render(); NTPlan.weekToShop();
      });
      await page.locator('#planShopOv.open').waitFor();
      const shopSum = await page.textContent('#planShopSum');
      const shop0 = await page.evaluate(() => S.shopList.length);
      await page.click('#planShopGo');
      out.weekShop = /1 Zutat auf den Zettel, 0 sind im Vorrat/.test(shopSum) && /1 davon nur teilweise/.test(shopSum) && shop0 === 0
        && await page.evaluate(() => { const m = S.shopList.find((x) => x.n === 'Milch'); return !!m && /^500 g$/.test(m.q); });
    } catch (e) { record('Vorrat Tagebuch/Plan', e.message); }
    await page.evaluate((k) => {
      document.querySelectorAll('.ov.open').forEach((o) => o.classList.remove('open'));
      if (!k) return;
      const o = JSON.parse(k);
      S.shopList = o.shop; S.shopTomb = o.shopTomb; S.pantry = o.pantry; S.pantryLog = o.log; S.pantryTomb = o.tomb; S.pantryLocs = null;
      if (o.ask) S.pantryAsk = o.ask; else delete S.pantryAsk;
      if (o.map) S.pantryMap = o.map; else delete S.pantryMap;
      if (o.off) S.pantryAskOff = true; else delete S.pantryAskOff;
      S.days = o.days; S.mealPlan = o.plan; S.planTomb = o.planTomb; S.planApplied = o.applied; S.recurringMeals = o.recur; S.cookLog = o.cook; S.goal = o.goal; S.currentDate = o.cur;
      recipes.splice(0, recipes.length, ...o.recipes);
      saveS(); renderAll(); NTShop.render(); NTPantry.render();
    }, keep).catch(() => {});
    page.off('dialog', onDialog);
    for (const [k, v] of Object.entries({ offer: 'Rezept ins Tagebuch → ein Vorschlag mit allen Artikeln, Gramm vorgeschlagen, Stück leer und abgewählt',
      booked: '„Abziehen“ bucht nur Gewähltes, Buchung kennt den Eintrag, Zuordnung/Ablehnung gemerkt',
      choice: 'mehrdeutiger Name zur Auswahl, Wahl gemerkt und beim nächsten Mal vorgewählt',
      mute: 'dreimal abgelehnt → keine Frage mehr, ⋯ Mehr setzt zurück', toggle: 'Schalter „Beim Eintragen nach Vorratsabzug fragen“ aus → keine Frage',
      pending: 'Wiederkehrende → kein Dialog, kein Abzug, Hinweis im Vorrat, dort bestätigt', dedup: 'schon gebucht (anderes Gerät) entdoppelt, zu alte Tage nicht gefragt',
      rebook: 'Portionen halbiert → Rückbuchung angeboten und im Verlauf mit Bezug', cookFor: 'Läuft ab → Rezept dazu finden → Einplanen',
      fill: '„Füllen“ mit Vorrats-Merkmal am Planeintrag', weekShop: 'Woche → Zettel: Zusammenfassung, Vorrat nur einmal verrechnet' })) {
      if (!out[k]) { pantry4Fail++; console.log('  x   Vorrat Tagebuch/Plan: ' + v); }
    }
    const newErr = errors.length - errBefore;
    if (newErr) { pantry4Fail++; console.log(`  x   Vorrat Tagebuch/Plan: ${newErr} neue(r) Fehler, siehe unten.`); }
    if (!pantry4Fail) console.log('  ok  Vorrat Tagebuch/Plan: ein bestätigter Vorschlag je Mahlzeit, Auswahl bei Mehrdeutigem, gemerkte Zuordnung, Ablehnen dämpft, Schalter, offene Vorschläge ohne Dialog, Entdoppeln, Rückbuchung, Rezept zu Ablaufendem, Füllen mit Merkmal, Woche → Zettel mit Zusammenfassung.');
  }

  // 7c. App-Tour: aus der Hilfe von vorn bis „Fertig“ per Klick, dann an
  //     einem Punkt einsteigen und mit Esc beenden.
  let tourFail = 0;
  {
    const errBefore = errors.length;
    try {
      await page.evaluate(() => { document.querySelectorAll('.ov.open').forEach((o) => o.classList.remove('open')); switchTab('main'); });
      await page.click('#mainScreen .hbtn[data-act="openHelp"]');
      await page.click('#helpOv [data-act="NTTour.start"][data-args="[0]"]');
      const n = await page.evaluate(() => NTTour.steps().length);
      const chips = await page.evaluate(() => document.querySelectorAll('#helpTourList .tour-chip').length);
      if (chips !== n) { tourFail++; console.log(`  x   Tour: ${chips} Einstiege in der Hilfe, ${n} Schritte.`); }
      for (let i = 0; i < n; i++) {
        await page.waitForTimeout(350);
        const st = await page.evaluate((i) => {
          const s = NTTour.steps()[i];
          const ids = { main: 'mainScreen', history: 'historyScreen', trends: 'statsScreen', more: 'moreScreen' };
          const card = document.getElementById('tourCard').getBoundingClientRect();
          return { top: Math.round(card.top), bottom: Math.round(card.bottom), h: innerHeight, count: document.getElementById('tourCount').textContent, help: document.getElementById('helpOv').classList.contains('open'),
            tab: document.getElementById(ids[s.tab]).classList.contains('active'), inView: card.top >= 0 && card.bottom <= innerHeight + 1 };
        }, i);
        if (st.count !== `${i + 1} / ${n}` || st.help || !st.tab || !st.inView) { tourFail++; console.log('  x   Tour Schritt ' + (i + 1) + ': ' + JSON.stringify(st)); }
        await page.click('#tourNext');
      }
      const ended = await page.evaluate(() => !NTTour.active() && document.getElementById('mainScreen').classList.contains('active'));
      if (!ended) { tourFail++; console.log('  x   Tour: „Fertig“ beendet die Tour nicht oder landet nicht auf „Heute“.'); }
      await page.click('#mainScreen .hbtn[data-act="openHelp"]');
      const hist = await page.evaluate(() => NTTour.steps().findIndex((s) => s.tab === 'history'));
      await page.click(`#helpTourList .tour-chip[data-args="[${hist}]"]`);
      const mid = await page.evaluate(() => ({ on: NTTour.active(), hist: document.getElementById('historyScreen').classList.contains('active') }));
      if (!mid.on || !mid.hist) { tourFail++; console.log('  x   Tour: Einstieg am Verlauf ' + JSON.stringify(mid)); }
      await page.keyboard.press('Escape');
      const esc = await page.evaluate(() => !NTTour.active() && !document.getElementById('tourRoot').classList.contains('on'));
      if (!esc) { tourFail++; console.log('  x   Tour: Esc beendet die Tour nicht.'); }
    } catch (e) { tourFail++; console.log('  x   Tour: ' + e.message); }
    const newErr = errors.length - errBefore;
    if (newErr) { tourFail++; console.log(`  x   Tour: ${newErr} neue(r) Fehler, siehe unten.`); }
    if (!tourFail) console.log('  ok  App-Tour: aus der Hilfe gestartet, alle Schritte per Weiter mit passendem Reiter, Fertig, Einstieg an einem Punkt, Esc beendet.');
  }

  // 7b. Excel-Export: Mehr → Backup → 📊 Excel-Export → „Alles“ → Datei.
  //     Der Handy-Kontext geht ueber navigator.share; geprueft wird die echte
  //     Datei (ZIP-Kopf, Blattnamen, ein Eintrag, Datum als Seriennummer).
  {
    const fx = await page.evaluate(async () => {
      const r = {};
      S.days['2026-01-05'] = { meals: { breakfast: [{ name: 'Smoke-Müsli', amount: 80, kcal: 300, protein: 9, carbs: 50, fat: 6 }], lunch: [], dinner: [], snack: [] }, water: 2, exercise: [] };
      saveS();
      let file = null;
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
      Object.defineProperty(navigator, 'share', { configurable: true, value: (d) => { file = d.files[0]; return Promise.resolve(); } });
      document.querySelector('[data-act="NTExport.open"]').click();
      const ov = document.getElementById('foodExportOv');
      r.open = ov.classList.contains('open');
      ov.querySelector('[data-fx="0"]').click();
      r.from = document.getElementById('fxFrom').value;
      r.allAct = ov.querySelector('[data-fx="0"]').classList.contains('act');
      ov.querySelector('[data-act="NTExport.run"]').click();
      await new Promise((ok) => setTimeout(ok, 100));
      r.closed = !ov.classList.contains('open');
      if (file) {
        r.name = file.name; r.type = file.type;
        const b = new Uint8Array(await file.arrayBuffer());
        r.zip = b[0] === 0x50 && b[1] === 0x4b;
        const t = new TextDecoder().decode(b);
        r.sheets = /<sheet name="Einträge"/.test(t) && /<sheet name="Tage"/.test(t);
        r.entry = t.includes('Smoke-Müsli');
        r.date = t.includes('<v>46027</v>');
      }
      delete S.days['2026-01-05']; saveS();
      return r;
    });
    if (fx.open && fx.allAct && fx.from <= '2026-01-05' && fx.closed && fx.zip && fx.sheets && fx.entry && fx.date
      && /^nutritrack-essen-.*\.xlsx$/.test(fx.name) && fx.type.includes('spreadsheetml'))
      console.log('  ok  Excel-Export: Dialog, „Alles“ ab erstem Tag, .xlsx mit „Einträge“/„Tage“, Eintrag und Datum, Teilen schliesst den Dialog.');
    else record('Excel-Export', JSON.stringify(fx));
  }

  // 8. Zweites Fenster (#261): Es darf die App nicht starten und nichts
  //    schreiben, sondern landet auf tab.html. „Hier weiterarbeiten“ uebernimmt,
  //    und das erste Fenster pausiert. Vorher ueberschrieb der letzte Schreiber
  //    das Tagebuch des anderen Fensters.
  let tabFail = 0;
  {
    const before = await page.evaluate(() => { S.name = 'Fenster eins'; saveS(); return localStorage.getItem('nt_v6'); });
    const second = await ctx.newPage();
    second.on('pageerror', (e) => record('pageerror (2. Fenster)', e.message));
    await second.goto(BASE, { waitUntil: 'load' });
    await second.waitForTimeout(800);
    const p2 = new URL(second.url()).pathname;
    const after = await page.evaluate(() => localStorage.getItem('nt_v6'));
    if (!p2.endsWith('/tab.html')) { console.log('  x   Zweites Fenster startete die App (' + p2 + ') statt tab.html.'); tabFail++; }
    else if (after !== before) { console.log('  x   Zweites Fenster hat nt_v6 veraendert.'); tabFail++; }
    else {
      await second.click('#goBtn');
      await second.waitForTimeout(1200);
      const took = await second.evaluate(() => !!(window.NTTab && NTTab.canWrite() && window.S && S.name === 'Fenster eins'));
      const p1 = new URL(page.url()).pathname;
      if (!took || !p1.endsWith('/tab.html')) { console.log('  x   Uebernahme: zweites Fenster schreibt=' + took + ', erstes auf ' + p1); tabFail++; }
      else console.log('  ok  Zweites Fenster landet auf tab.html ohne zu schreiben; „Hier weiterarbeiten“ uebernimmt, das erste pausiert.');
    }
    await second.close();
  }

  // 9. Tastatur auf dem iPhone (#181). iOS verkleinert bei offener Tastatur nur
  //    den Visual Viewport, nicht window.innerHeight; fixe Elemente bleiben am
  //    Layout Viewport, und iOS verschiebt den Visual Viewport (offsetTop > 0),
  //    um das fokussierte Feld nach vorn zu holen. Chromium hat keine
  //    Bildschirmtastatur — window.visualViewport wird deshalb durch ein
  //    EventTarget ersetzt und die Tastatur per resize/scroll nachgestellt.
  //    Ein Fall besteht, wenn kb-open gesetzt ist, der Dialog im sichtbaren
  //    Band [offsetTop, offsetTop + Hoehe] liegt und das Feld darin unverdeckt
  //    (elementFromPoint). window.scrollTo verschiebt im Nachbau auch den
  //    Visual Viewport, wie auf iOS: v0.221 setzte bei jedem Viewport-Ereignis
  //    window.scrollTo(0,0) und nahm so das Verschieben durch iOS zurueck.
  //    Modell ohne iOS-26-Formularleiste: Ob iOS sie vom Visual Viewport
  //    abzieht, ist ein offener Live-Test, keine Annahme dieses Tests.
  let kbFail = 0;
  {
    const W = 375, H = 812, VVH = 410; // iPhone 375x812, Tastatur samt Leiste 402 px
    const kctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5.2 Mobile/15E148 Safari/604.1' });
    await kctx.route('**/*', (r) => (EIGEN.test(r.request().url()) || r.request().url().startsWith('data:') ? r.continue() : r.abort()));
    await kctx.addInitScript(() => {
      const st = { height: null, offsetTop: 0 };
      class FakeVV extends EventTarget {
        get width() { return window.innerWidth; }
        get height() { return st.height == null ? window.innerHeight : st.height; }
        get offsetTop() { return st.offsetTop; }
        get offsetLeft() { return 0; }
        get pageTop() { return window.scrollY + st.offsetTop; }
        get pageLeft() { return window.scrollX; }
        get scale() { return 1; }
      }
      const fake = new FakeVV();
      Object.defineProperty(window, 'visualViewport', { configurable: true, get() { return fake; } });
      window.__kb = (h, top, type) => { st.height = h; st.offsetTop = top; fake.dispatchEvent(new Event(type)); };
      const realScrollTo = window.scrollTo.bind(window);
      window.scrollTo = function (x, y) {
        realScrollTo.apply(null, arguments);
        const top = x && typeof x === 'object' ? (x.top || 0) : (y || 0);
        if (st.height == null) return;
        const t = Math.max(0, Math.min(window.innerHeight - st.height, top));
        if (t !== st.offsetTop) { st.offsetTop = t; fake.dispatchEvent(new Event('scroll')); }
      };
    });
    const kp = await kctx.newPage();
    kp.on('pageerror', (e) => record('pageerror (Tastatur)', e.message));
    await kp.goto(BASE, { waitUntil: 'load' });
    await kp.evaluate(() => {
      const key = today(); // Ortsdatum wie die App, nicht UTC
      const ing = Array.from({ length: 9 }, (_, i) => ({ name: 'Zutat ' + i, emoji: '🥕', amount: 40, per100: { kcal: 100, protein: 3, carbs: 10, fat: 2 }, kcal: 40, protein: 1, carbs: 4, fat: 1 }));
      const days = {}; days[key] = { meals: { breakfast: [
        { name: 'Haferflocken', emoji: '🥣', amount: 60, per100: { kcal: 370, protein: 13, carbs: 59, fat: 7 }, kcal: 222, protein: 8, carbs: 35, fat: 4 },
        { name: 'Bowl', emoji: '🥗', isRecipe: true, portions: 1, ingredients: ing, kcal: 360, protein: 9, carbs: 36, fat: 9 },
      ], lunch: [], dinner: [], snack: [] }, water: 0, exercise: [] };
      localStorage.setItem('nt_v6', JSON.stringify({ setupDone: true, name: 'Test', goal: 2000, currentDate: key, days }));
      localStorage.setItem('nt_gate_skipped', '1');
    });
    await kp.reload({ waitUntil: 'load' });
    await kp.waitForTimeout(1200);
    // Wochensicherung (#340/#343): iPhone ohne OneDrive → Dialog ohne ✕; Abbrechen
    // laesst ihn offen, Teilen schliesst ihn und rueckt die Datei 1→2 weiter.
    // Erledigt sie zugleich fuer den Rest des Laufs (runAutosave nach 3 s).
    const fsv = await kp.evaluate(async () => {
      const ov = document.getElementById('fileSaveOv'), btn = ov.querySelector('[data-act]');
      localStorage.removeItem('nt_file_backup_day'); localStorage.removeItem('nt_file_backup_idx');
      NTAutoSave.fileCheck();
      const r = { open: ov.classList.contains('open'), noClose: !ov.querySelector('.mcl') && !ov.hasAttribute('data-bg-close') };
      let mode = 'abort'; r.names = [];
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
      Object.defineProperty(navigator, 'share', { configurable: true, value: (d) => { r.names.push(d.files[0].name);
        return mode === 'abort' ? Promise.reject(new DOMException('x', 'AbortError')) : Promise.resolve(); } });
      btn.click(); await new Promise((s) => setTimeout(s, 50));
      r.openAfterAbort = ov.classList.contains('open');
      mode = 'ok'; btn.click(); await new Promise((s) => setTimeout(s, 50));
      r.openAfterShare = ov.classList.contains('open');
      r.idx = localStorage.getItem('nt_file_backup_idx'); r.today = localStorage.getItem('nt_file_backup_day') === today();
      NTAutoSave.fileCheck(); r.reopened = ov.classList.contains('open');
      localStorage.setItem('nt_file_backup_day', addDays(today(), -6)); NTAutoSave.fileCheck(); r.day6 = ov.classList.contains('open');
      localStorage.setItem('nt_file_backup_day', addDays(today(), -7)); NTAutoSave.fileCheck(); r.day7 = ov.classList.contains('open');
      closeOv('fileSaveOv'); localStorage.setItem('nt_file_backup_day', today());
      return r;
    });
    if (fsv.open && fsv.noClose && fsv.openAfterAbort && !fsv.openAfterShare && fsv.names.join() === 'nutritrack-backup1.json,nutritrack-backup1.json'
      && fsv.idx === '1' && fsv.today && !fsv.reopened && !fsv.day6 && fsv.day7)
      console.log('  ok  Wochensicherung (#340/#343): iPhone ohne OneDrive → Dialog ohne ✕, Abbrechen laesst ihn offen, Teilen von nutritrack-backup1.json schliesst ihn, naechste Datei 2, nach 6 Tagen still, nach 7 Tagen wieder.');
    else record('Wochensicherung (#340/#343)', JSON.stringify(fsv));
    // Chat-Ergebnis ueber den echten Weg (KI-Rueckfall), nur KI und
    // Naehrwertsuche ersetzt: seit #257 ist der Zustand des Pickers privat.
    const chatRes = "var _cc=callClaude,_ln=lookupNutrients;"
      + "callClaude=function(m,c,t,ok){ok(JSON.stringify(Array.from({length:6},function(_,i){return {name:'Zutat '+i,g:null};})));};"
      + "lookupNutrients=function(raw,done){done(raw.map(function(r){return {name:r.name,emoji:'🥕',amount:null,missingGrams:true,per100:{kcal:100,protein:1,carbs:1,fat:1}};}));};"
      + "try{NTPicker.pickerChatKiFallback('sechs Zutaten');}finally{callClaude=_cc;lookupNutrients=_ln;}";
    const cases = [
      ['Picker-Chat', "openMealDetail('breakfast');openPickerForOpenMeal();", '#pickerChatInp'],
      ['Picker-Gramm', "openMealDetail('breakfast');openPickerForOpenMeal('search');pickerSearchQ.value='Banane';NTPicker.pickerSearchLocalLive();var b=document.querySelector('#pickerResults [onclick]');if(b)b.click();", '#pickerAmt'],
      ['Chat-Ergebnis-Gramm', "openMealDetail('breakfast');openPickerForOpenMeal();" + chatRes, '#pickerChatIngList .ing-wrap:last-child .ing-amt'],
      ['editAmt', "openMealDetail('breakfast');openEditEntry('breakfast',0);", '#editAmt'],
      ['Rezept-Gramm', "openMealDetail('breakfast');openEditEntry('breakfast',1);", '#editIngList .ing-wrap:last-child .ing-amt'],
      ['Einkauf-Artikel', "NTShop.add('Milch','');NTShop.openItem(S.shopList[0].id);", '#shopItemQty'],
    ];
    // Lage 0: iOS verschiebt nicht. Lage „reveal“: iOS schiebt den Visual
    // Viewport so weit, dass das Feld beim Aufgehen der Tastatur sichtbar wird.
    // Lage „max“: ganz nach unten verschoben (offsetTop = innerHeight - Hoehe).
    for (const [label, open, sel] of cases) {
      for (const pan of [0, 'reveal', 'max']) {
        const r = await kp.evaluate(async ({ open, sel, pan, VVH }) => {
          const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
          document.querySelectorAll('.ov.open').forEach((o) => o.classList.remove('open'));
          if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
          __kb(null, 0, 'resize');
          await sleep(200);
          try { (new Function(open))(); } catch (e) { return { err: e.message }; }
          await sleep(300);
          const el = document.querySelector(sel);
          if (!el) return { err: 'Feld fehlt' };
          el.focus();
          const b0 = el.getBoundingClientRect();
          await sleep(50);
          __kb(VVH, 0, 'resize'); // Tastatur geht auf
          const off = pan === 'max' ? innerHeight - VVH
            : pan === 'reveal' ? Math.max(0, Math.min(innerHeight - VVH, Math.round(b0.bottom + 12 - VVH))) : pan;
          await sleep(50);
          if (off) __kb(VVH, off, 'scroll');
          await sleep(700); // focusin-Zeitgeber laufen bei 250 und 550 ms
          const now = visualViewport.offsetTop;
          if (now !== off) return { err: 'Visual Viewport von ' + off + ' auf ' + now + ' zurueckgesetzt (window.scrollTo?)' };
          const rc = el.getBoundingClientRect();
          const mod = el.closest('.mod');
          const mr = mod ? mod.getBoundingClientRect() : { top: -1e9, bottom: 1e9 };
          const h = document.elementFromPoint(rc.left + rc.width / 2, rc.top + rc.height / 2);
          const inBand = rc.top >= off - 0.5 && rc.bottom <= off + VVH + 0.5;
          const inMod = rc.top >= mr.top - 0.5 && rc.bottom <= mr.bottom + 0.5;
          const modInBand = !mod || (mr.top >= off - 0.5 && mr.bottom <= off + VVH + 0.5);
          const ok = inBand && inMod && modInBand && (h === el || el.contains(h));
          return { ok, field: [Math.round(rc.top), Math.round(rc.bottom)], band: [off, off + VVH], mod: [Math.round(mr.top), Math.round(mr.bottom)],
            hit: h === el ? 'Feld' : (h && (h.id || h.className || h.tagName)), kbOpen: document.body.classList.contains('kb-open') };
        }, { open, sel, pan, VVH });
        if (r.err || !r.ok || !r.kbOpen) {
          kbFail++;
          console.log(`  x   Tastatur: ${label} (Lage ${pan}) ${r.err || ('Feld ' + JSON.stringify(r.field) + ', sichtbar ' + JSON.stringify(r.band) + ', Dialog ' + JSON.stringify(r.mod) + ', oben liegt ' + r.hit + ', kb-open=' + r.kbOpen)}`);
        }
      }
    }
    // Toast ueber der Tastatur; nach dem Schliessen Nav und 🐛 zurueck; ohne
    // geschrumpften Viewport (Hardware-Tastatur, Desktop) kein kb-open.
    const after = await kp.evaluate(async ({ VVH }) => {
      const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
      openMealDetail('breakfast'); openEditEntry('breakfast', 0);
      const el = document.getElementById('editAmt'); el.focus();
      __kb(VVH, 0, 'resize'); await sleep(700);
      const nav = document.querySelector('#mealDetailScreen .bnav');
      const fab = document.getElementById('feedbackFab');
      const shown = (x) => !!x && getComputedStyle(x).display !== 'none';
      const hidden = !shown(nav) && !shown(fab);
      showToast('Probe'); await sleep(400);
      const t = document.querySelector('.tst.show') || document.querySelector('.tst');
      const toastOk = !!t && t.getBoundingClientRect().bottom <= VVH + 0.5;
      // Blur bei noch kleinem Viewport (iOS beim Schliessen) und Pinch-Zoom ohne
      // Fokus duerfen die Messwerte der Tastatur nicht ueberschreiben.
      el.blur(); __kb(VVH, 0, 'scroll'); __kb(541, 200, 'scroll');
      const d = window._kbDiag;
      const diagKept = !!d && d.vvh === VVH && d.el === 'editAmt';
      __kb(null, 0, 'resize'); document.querySelectorAll('.ov.open').forEach((o) => o.classList.remove('open'));
      await sleep(400);
      const back = !document.body.classList.contains('kb-open') && shown(nav) && (!fab || shown(fab));
      openEditEntry('breakfast', 0); document.getElementById('editAmt').focus(); await sleep(700);
      const hw = !document.body.classList.contains('kb-open');
      if (document.activeElement) document.activeElement.blur();
      closeOv('editOv'); closeMealDetail();
      // Der 🐛-Weg: Vorschau zeigt die Zeile, die Beschreibung traegt sie.
      openFeedback();
      const prev = (document.getElementById('feedbackCtxPreview') || {}).textContent || '';
      const realFetch = window.fetch;
      let sent = null;
      window.fetch = (u, o) => { sent = JSON.parse(o.body); return Promise.resolve({ status: 500, json: () => Promise.resolve({ ok: false }) }); };
      try {
        document.getElementById('feedbackText').value = 'Probe';
        submitFeedback(); await sleep(300);
      } finally { window.fetch = realFetch; }
      closeOv('feedbackOv');
      const fb = prev.includes('Tastatur:   innerHeight') && !!sent && /^Probe\n\n— Tastatur zuletzt \(automatisch, #181\): innerHeight \d+, visualViewport 410 \(oben 0\), .*Feld editAmt/.test(sent.description);
      return { toastOk, hidden, back, hw, diagKept, fb };
    }, { VVH });
    if (!after.toastOk) { kbFail++; console.log('  x   Tastatur: Toast liegt unter der Tastatur.'); }
    if (!after.hidden) { kbFail++; console.log('  x   Tastatur: Nav oder 🐛 bleiben bei offener Tastatur sichtbar.'); }
    if (!after.back) { kbFail++; console.log('  x   Tastatur: nach dem Schliessen fehlen Nav oder 🐛, oder kb-open bleibt.'); }
    if (!after.hw) { kbFail++; console.log('  x   Tastatur: kb-open ohne geschrumpften Viewport (Hardware-Tastatur/Desktop).'); }
    if (!after.diagKept) { kbFail++; console.log('  x   Tastatur: window._kbDiag fehlt oder wurde nach dem Schliessen bzw. beim Zoom ueberschrieben.'); }
    if (!after.fb) { kbFail++; console.log('  x   Tastatur: Messwerte fehlen in der 🐛-Vorschau oder in der gesendeten Beschreibung.'); }
    if (!kbFail) console.log(`  ok  Tastatur (#181): ${cases.length} Eingabefelder x 3 Lagen, Dialog und Feld ueber der Tastatur, Toast darueber, Nav/🐛 weg und danach zurueck, ohne Tastatur kein kb-open, Messwerte im 🐛-Bericht.`);
    await kctx.close();
  }

  await browser.close();

  if (errors.length || nsFail || badExports.length || deadHandlers.length || delegationFail || stack.length || deadFeatActs.length || remindFail || tabFail || kbFail || dietFail || pickFail || bookFail || pantryFail || pantry2Fail || pantry3Fail || pantry4Fail || tourFail) {
    console.error('\nFEHLER:');
    [...new Set(errors)].forEach((e) => console.error('  x   ' + e));
    console.error(`\n${errors.length + nsFail + badExports.length + deadHandlers.length + delegationFail + stack.length + deadFeatActs.length + remindFail + tabFail + kbFail + dietFail + pickFail + bookFail + pantryFail + pantry2Fail + pantry3Fail + pantry4Fail + tourFail} Problem(e).`);
    process.exit(1);
  }
  console.log('\nRauchtest bestanden.');
})().catch((e) => { console.error('Rauchtest abgebrochen:', e.message); process.exit(1); });
