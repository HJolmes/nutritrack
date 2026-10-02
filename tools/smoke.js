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
  'NTRecur', 'NTStats', 'NTRemind', 'NTTpl', 'NTQueue', 'NTFeat', 'NTAmpel', 'NTMet', 'NTTab',
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
    const real = window.openPicker;
    const out = [];
    for (const meal of ['breakfast', 'lunch', 'dinner', 'snack']) {
      const calls = [];
      window.openPicker = function (m) { calls.push(m === undefined ? '(leer)' : m); };
      window.openMealDetail(meal);
      await sleep(30);
      const cb = document.getElementById('cbMealDetail');
      if (!cb) { window.openPicker = real; return { err: 'cbMealDetail fehlt' }; }
      cb.click();
      await sleep(30);
      out.push({ meal: meal, calls: calls });
    }
    window.openPicker = real;
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
    const chatRes = "pickerIngredients=Array.from({length:6},function(_,i){return {name:'Zutat '+i,emoji:'🥕',amount:null,missingGrams:true,per100:{kcal:100,protein:1,carbs:1,fat:1}};});document.getElementById('pickerChatResult').classList.remove('hidden');_pickerChatRebind();_pickerChatScrollEnd();";
    const cases = [
      ['Picker-Chat', "openMealDetail('breakfast');openPickerForOpenMeal();", '#pickerChatInp'],
      ['Picker-Gramm', "openMealDetail('breakfast');openPickerForOpenMeal('search');pickerSearchQ.value='Banane';pickerSearchLocalLive();var b=document.querySelector('#pickerResults [onclick]');if(b)b.click();", '#pickerAmt'],
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

  if (errors.length || nsFail || badExports.length || deadHandlers.length || delegationFail || stack.length || deadFeatActs.length || remindFail || tabFail || kbFail || dietFail) {
    console.error('\nFEHLER:');
    [...new Set(errors)].forEach((e) => console.error('  x   ' + e));
    console.error(`\n${errors.length + nsFail + badExports.length + deadHandlers.length + delegationFail + stack.length + deadFeatActs.length + remindFail + tabFail + kbFail + dietFail} Problem(e).`);
    process.exit(1);
  }
  console.log('\nRauchtest bestanden.');
})().catch((e) => { console.error('Rauchtest abgebrochen:', e.message); process.exit(1); });
