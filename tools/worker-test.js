#!/usr/bin/env node
// Prueft den Cloudflare-Worker (worker/src/index.js) ohne Cloudflare.
//
// Warum es das gibt: Der Worker wird bei jedem Push auf main automatisch
// deployt (deploy-worker.yml), aber bisher von keiner Pruefung ausgefuehrt —
// tools/check.js prueft nur die Syntax. Ein TypeError bei einem Body `null`,
// ein chunked Body ohne Content-Length an den Groessengrenzen vorbei oder eine
// Weiterleitung auf 127.0.0.1 waeren ohne diesen Lauf erst im Betrieb sichtbar.
//
// Bewusst ohne npm: nur Node 22 (fetch, Request, Response, ReadableStream,
// AbortSignal.timeout sind dort eingebaut). Das Worker-Modul wird per
// data:-URL importiert, weil es ES-Modul-Syntax traegt und das package.json
// im Repo (seit #252, nur Werkzeuge) kein "type": "module" setzt.
//
// NICHTS geht nach aussen: globalThis.fetch ist durch einen Ersatz ersetzt,
// der nur die im jeweiligen Test hinterlegte Antwort liefert und sonst wirft.
// KV ist nachgebaut und zaehlt get/put/delete/list.
//
// Aufruf: node tools/worker-test.js   (Exit-Code 1 bei einem Fehlschlag)

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'worker/src/index.js');

// ─── Ersatz fuer fetch: nichts verlaesst den Rechner ────────────────────────
const outbound = []; // jede URL, die der Worker abrufen wollte (je Test geleert)
const allOutbound = []; // dasselbe ueber den ganzen Lauf
let upstream = null; // (url, init) => Response | Promise<Response>
globalThis.fetch = async function fakeFetch(input, init) {
  const url = typeof input === 'string' ? input : input.url;
  outbound.push(url);
  allOutbound.push(url);
  if (!upstream) throw new Error('worker-test: kein Upstream hinterlegt fuer ' + url);
  return upstream(url, init || {});
};

// Wie echtes fetch mit redirect:"follow": Weiterleitungen werden intern
// verfolgt, ohne dass der Aufrufer die Zwischenziele sieht. So zeigt der Test
// auch am Stand VOR der Haertung, welches Ziel tatsaechlich erreicht wurde.
const reached = [];
function routeTable(table) {
  return async function (url, init) {
    let current = url;
    for (let hop = 0; hop < 20; hop++) {
      reached.push(current);
      const handler = table[current];
      if (!handler) throw new Error('worker-test: unbekanntes Ziel ' + current);
      const res = await handler(init);
      const loc = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && loc && init.redirect !== 'manual') {
        current = new URL(loc, current).toString();
        continue;
      }
      return res;
    }
    throw new Error('worker-test: zu viele Weiterleitungen');
  };
}

// ─── Nachgebautes KV ────────────────────────────────────────────────────────
function makeKV() {
  const store = new Map();
  const kv = {
    store,
    counts: { get: 0, put: 0, delete: 0, list: 0 },
    failPut: null, // (key) => true laesst put werfen (z. B. Kontingent erschoepft)
    reset() {
      store.clear();
      kv.counts = { get: 0, put: 0, delete: 0, list: 0 };
      kv.failPut = null;
    },
    async get(key, opts) {
      kv.counts.get++;
      const e = store.get(key);
      if (!e) return null;
      const type = typeof opts === 'string' ? opts : opts && opts.type;
      return type === 'json' ? JSON.parse(e.value) : e.value;
    },
    async getWithMetadata(key) {
      kv.counts.get++;
      const e = store.get(key);
      if (!e) return { value: null, metadata: null };
      return { value: e.value, metadata: e.metadata };
    },
    async put(key, value, opts) {
      kv.counts.put++;
      if (kv.failPut && kv.failPut(key)) throw new Error('KV put failed: 429 daily limit exceeded');
      store.set(key, { value: String(value), metadata: (opts && opts.metadata) || null });
    },
    async delete(key) {
      kv.counts.delete++;
      store.delete(key);
    },
    async list(opts) {
      kv.counts.list++;
      const prefix = (opts && opts.prefix) || '';
      const limit = (opts && opts.limit) || 1000;
      const start = opts && opts.cursor ? Number(opts.cursor) : 0;
      const names = [...store.keys()].filter((k) => k.startsWith(prefix)).sort();
      const slice = names.slice(start, start + limit);
      const done = start + limit >= names.length;
      return {
        keys: slice.map((name) => ({ name, metadata: store.get(name).metadata })),
        list_complete: done,
        cursor: done ? undefined : String(start + limit),
      };
    },
  };
  return kv;
}

const ORIGIN = 'https://hjolmes.github.io';
const SECRET = 'test-proxy-secret-0123456789abcdef';
const KV = makeKV();
const env = {
  ANTHROPIC_API_KEY: 'test-anthropic-key',
  NUTRITRACK_PROXY_TOKEN: SECRET,
  DECODER_URL: 'https://decoder.test',
  GITHUB_TOKEN: 'test-github-token',
  SHARE_KV: KV,
};
const TOKEN = 'Tok3nTok3nTok3nTok3nTok3nTok3n12'; // 32 Zeichen wie health-sync.js
const ROOM = 'RoomRoomRoomRoomRoomRoomRoomRoom'; // 32 Zeichen wie sync-core.js

// ─── Anfragen ───────────────────────────────────────────────────────────────
// Ein Body als ReadableStream OHNE Content-Length, so wie ihn ein chunked
// Upload liefert. `pulled` zaehlt, wie viel der Worker tatsaechlich gelesen hat.
function chunkedStream(totalBytes, fill, chunkSize) {
  const CHUNK = chunkSize || 64 * 1024;
  const src = typeof fill === 'string' ? Buffer.from(fill) : null;
  const state = { pulled: 0, cancelled: false };
  const stream = new ReadableStream({
    pull(ctrl) {
      if (state.pulled >= totalBytes) return ctrl.close();
      const n = Math.min(CHUNK, totalBytes - state.pulled);
      const chunk = src ? src.subarray(state.pulled, state.pulled + n) : new Uint8Array(n).fill(0x61);
      state.pulled += n;
      ctrl.enqueue(new Uint8Array(chunk));
    },
    cancel() {
      state.cancelled = true;
    },
  });
  return { stream, state };
}

let worker = null;

async function call(method, pathName, opts) {
  opts = opts || {};
  const headers = new Headers(opts.headers || {});
  const origin = opts.origin === undefined ? ORIGIN : opts.origin;
  if (origin) headers.set('Origin', origin);
  const init = { method, headers };
  if (opts.stream) {
    init.body = opts.stream;
    init.duplex = 'half';
  } else if (opts.body !== undefined) {
    const raw = typeof opts.body === 'string' || opts.body instanceof Uint8Array ? opts.body : JSON.stringify(opts.body);
    init.body = raw;
    // Wie ein echter Client mit String-Body (fetch, https.request): mit Laenge.
    headers.set('content-length', String(Buffer.byteLength(raw)));
  }
  const req = new Request('https://worker.test' + pathName, init);
  const out = { status: 0, json: null, text: '', headers: null, threw: null };
  try {
    const res = await Promise.race([
      worker.fetch(req, env),
      new Promise((_, rej) => setTimeout(() => rej(new Error('haengt (> ' + (opts.waitMs || 3000) + ' ms)')), opts.waitMs || 3000)),
    ]);
    out.status = res.status;
    out.headers = res.headers;
    out.text = await res.text();
    try {
      out.json = JSON.parse(out.text);
    } catch (_) {}
  } catch (e) {
    out.threw = e;
  }
  return out;
}

function show(r) {
  if (r.threw) return 'Ausnahme: ' + (r.threw && r.threw.message);
  const code = r.json && r.json.error ? ' ' + r.json.error.code : '';
  return 'HTTP ' + r.status + code;
}
function cors(r) {
  return Boolean(r.headers && r.headers.get('access-control-allow-origin'));
}

// ─── Auswertung ─────────────────────────────────────────────────────────────
let failed = 0;
let passed = 0;
function check(name, ok, detail) {
  if (ok) {
    passed++;
    console.log('  ok   ' + name);
  } else {
    failed++;
    console.log('  FAIL ' + name + (detail ? '  — ' + detail : ''));
  }
}
function section(title) {
  console.log('\n' + title);
}

const secretHdr = { 'x-app-proxy-secret': SECRET, 'Content-Type': 'application/json' };
const workoutBody = { id: 'w1', source: 'apple-health', type: 'Running', start: '2026-09-30T07:00:00Z', durationSec: 1800, kcal: 320 };
const alexaBody = { id: 'ax1', ts: Date.now(), kind: 'meal', text: 'ein Apfel', meal: 'snack' };
const syncBody = { records: [{ id: 'e1', rev: Date.now(), iv: 'aXY=', ct: 'Y3Q=' }] };
const aiBody = { model: 'claude-haiku-4-5', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] };
const JPEG_B64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]).toString('base64');
const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString('base64');

function githubStub(record) {
  return async function (url, init) {
    record.push({ url, method: (init && init.method) || 'GET', body: init && init.body });
    if (/\/branches\//.test(url)) return new Response('{}', { status: 200 });
    if (/\/contents\//.test(url)) {
      if (record.uploadThrows) throw new Error('secret-ish upstream detail 7f3a');
      return new Response(JSON.stringify({ content: { download_url: 'https://raw.test/s.jpg' } }), { status: 201 });
    }
    if (/\/issues$/.test(url)) return new Response(JSON.stringify({ number: 1, html_url: 'https://github.test/1' }), { status: 201 });
    return new Response('{}', { status: 404 });
  };
}

async function main() {
  const src = fs.readFileSync(SRC, 'utf8');
  const mod = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
  worker = mod.default;

  // ── Gesundheit ──
  section('/health');
  {
    const r = await call('GET', '/health');
    check('codeVersion ist v0.292-upce', r.json && r.json.data && r.json.data.codeVersion === 'v0.292-upce', r.json && r.json.data && r.json.data.codeVersion);
  }

  // ── (a) Body null / kein Objekt → 400 mit CORS, keine Ausnahme ──
  section('(a) JSON-Body null → 400 samt CORS');
  upstream = async () => new Response(JSON.stringify({ content: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const nullCases = [
    ['/share', {}],
    ['/ai/messages', Object.assign({ 'x-ai-provider': 'openai', 'x-ai-key': 'k' }, secretHdr)],
    ['/v1/messages', secretHdr],
    ['/workout', { 'X-User-Token': TOKEN }],
    ['/alexa/inbox', { 'X-User-Token': TOKEN }],
    ['/alexa/ack', { 'X-User-Token': TOKEN }],
    ['/shop/sync', { 'X-Shop-Room': ROOM }],
    ['/feedback', secretHdr],
  ];
  for (const [p, h] of nullCases) {
    KV.reset();
    outbound.length = 0;
    const r = await call('POST', p, { headers: Object.assign({ 'Content-Type': 'application/json' }, h), body: 'null' });
    check('POST ' + p + ' mit null', !r.threw && r.status === 400 && cors(r) && outbound.length === 0, show(r) + (outbound.length ? ', ging nach aussen: ' + outbound[0] : ''));
  }
  {
    KV.reset();
    const r = await call('POST', '/v1/messages', { headers: secretHdr, body: '[1,2]' });
    check('POST /v1/messages mit Array → 400', r.status === 400 && cors(r), show(r));
    const r2 = await call('POST', '/decode-barcode', { headers: { 'x-app-proxy-secret': SECRET, 'Content-Type': 'image/jpeg' } });
    check('POST /decode-barcode ohne Body → 400', r2.status === 400 && cors(r2), show(r2));
  }

  // ── (b) chunked Body ohne Content-Length ueber der Grenze → 413 ──
  section('(b) Body ohne Content-Length ueber der Grenze → 413, Lesen bricht ab');
  const limitCases = [
    ['/share', 1024 * 256, {}],
    ['/feedback', 1024 * 1024 * 1.5, secretHdr],
    ['/workout', 1024 * 4, { 'X-User-Token': TOKEN }],
    ['/alexa/inbox', 1024 * 8, { 'X-User-Token': TOKEN }],
    ['/alexa/ack', 1024 * 8, { 'X-User-Token': TOKEN }],
    ['/shop/sync', 1024 * 512, { 'X-Shop-Room': ROOM }],
    ['/ai/messages', 1024 * 1024 * 4, Object.assign({ 'x-ai-provider': 'openai', 'x-ai-key': 'k' }, secretHdr)],
    ['/v1/messages', 1024 * 1024 * 4, secretHdr],
    ['/decode-barcode', 1024 * 200, { 'x-app-proxy-secret': SECRET, 'Content-Type': 'image/jpeg' }],
  ];
  for (const [p, max, h] of limitCases) {
    KV.reset();
    outbound.length = 0;
    const total = Math.floor(max * 2);
    // Stuecke deutlich kleiner als die Grenze, damit "Lesen bricht ab" messbar ist.
    const { stream, state } = chunkedStream(total, null, Math.min(64 * 1024, Math.floor(max / 8)));
    const r = await call('POST', p, { headers: h, stream, waitMs: 10000 });
    const stopped = state.pulled < total;
    check('POST ' + p + ' mit ' + Math.round(total / 1024) + ' KB chunked', r.status === 413 && cors(r) && stopped && KV.counts.put === 0 && outbound.length === 0,
      show(r) + ', gelesen ' + Math.round(state.pulled / 1024) + ' KB, puts ' + KV.counts.put + ', nach aussen ' + outbound.length);
  }
  // Gueltiges JSON ueber der Grenze: kam vor der Haertung als 200 durch.
  {
    KV.reset();
    const s = JSON.stringify(Object.assign({ pad: 'x'.repeat(1024 * 64) }, workoutBody));
    const { stream } = chunkedStream(Buffer.byteLength(s), s);
    const r = await call('POST', '/workout', { headers: { 'X-User-Token': TOKEN, 'Content-Type': 'application/json' }, stream, origin: '' });
    check('POST /workout mit 64 KB gueltigem JSON chunked → 413, nichts gespeichert', r.status === 413 && KV.counts.put === 0, show(r) + ', puts ' + KV.counts.put);
  }
  // Unter der Grenze: chunked Body wird wie bisher angenommen.
  {
    KV.reset();
    const s = JSON.stringify(workoutBody);
    const { stream } = chunkedStream(Buffer.byteLength(s), s);
    const r = await call('POST', '/workout', { headers: { 'X-User-Token': TOKEN, 'Content-Type': 'application/json' }, stream, origin: '' });
    check('POST /workout chunked unter der Grenze → 200', r.status === 200 && r.json.data.stored === true, show(r));
    const big = { records: [] };
    for (let i = 0; i < 150; i++) big.records.push({ id: 'e' + i, rev: Date.now(), iv: 'aXY=', ct: 'Y'.repeat(2000) });
    const bs = JSON.stringify(big);
    const c2 = chunkedStream(Buffer.byteLength(bs), bs);
    const r2 = await call('POST', '/shop/sync', { headers: { 'X-Shop-Room': ROOM, 'Content-Type': 'application/json' }, stream: c2.stream });
    check('POST /shop/sync chunked mit ' + Math.round(bs.length / 1024) + ' KB (mehrere Stuecke) → 200, 150 gespeichert', r2.status === 200 && r2.json.data.stored === 150, show(r2));
    const r3 = await call('POST', '/share', { headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(1024 * 257) });
    check('POST /share mit Content-Length ueber der Grenze → 413 (wie bisher)', r3.status === 413, show(r3));
  }

  // ── (c) SSRF-Filter /fetch ──
  section('(c) /fetch: Hostfilter und Weiterleitungen');
  const html = '<html><body>Zutaten</body></html>';
  const okPage = async () => new Response(html, { status: 200, headers: { 'Content-Type': 'text/html' } });
  const blockedHosts = [
    'http://[::1]/', 'http://[::ffff:127.0.0.1]/', 'http://[::ffff:7f00:1]/', 'http://[fd00::1]/', 'http://[fe80::1]/',
    'http://[::]/', 'http://[64:ff9b::a00:1]/', 'http://100.64.0.1/', 'http://100.127.255.254/', 'http://localhost./',
    'http://foo.localhost/', 'http://printer.local/', 'http://metadata.internal/', 'http://2130706433/', 'http://0x7f.1/',
    'http://0177.0.0.1/', 'http://127.1/', 'http://10.0.0.1/', 'http://192.168.1.1/', 'http://172.16.0.1/',
    'http://169.254.169.254/', 'http://0.0.0.0/', 'http://0/', 'http://0.1.2.3/', 'http://198.18.0.1/', 'http://192.0.0.1/',
    'http://224.0.0.1/', 'http://255.255.255.255/', 'http://LOCALHOST/',
  ];
  for (const u of blockedHosts) {
    outbound.length = 0;
    upstream = async () => okPage();
    const r = await call('GET', '/fetch?u=' + encodeURIComponent(u), { headers: { 'x-app-proxy-secret': SECRET } });
    check('gesperrt: ' + u, r.status === 403 && r.json && r.json.error.code === 'host_not_allowed' && outbound.length === 0, show(r) + ', nach aussen ' + outbound.length);
  }
  for (const u of ['https://example.com/rezept', 'https://www.chefkoch.de/rezepte/1', 'http://100.128.0.1/', 'http://172.32.0.1/', 'http://[2a00:1450:4001:80b::200e]/']) {
    outbound.length = 0;
    upstream = async () => okPage();
    const r = await call('GET', '/fetch?u=' + encodeURIComponent(u), { headers: { 'x-app-proxy-secret': SECRET } });
    check('erlaubt: ' + u, r.status === 200 && r.text === html && outbound.length === 1, show(r));
  }
  {
    const redirect = (to, status) => async () => new Response(null, { status: status || 302, headers: to ? { Location: to } : {} });
    reached.length = 0;
    upstream = routeTable({ 'https://example.com/r1': redirect('http://127.0.0.1/admin'), 'http://127.0.0.1/admin': okPage });
    let r = await call('GET', '/fetch?u=' + encodeURIComponent('https://example.com/r1'), { headers: { 'x-app-proxy-secret': SECRET } });
    check('302 auf http://127.0.0.1/ → 403, Ziel nie abgerufen', r.status === 403 && reached.indexOf('http://127.0.0.1/admin') < 0, show(r) + ', erreicht: ' + reached.join(' → '));

    reached.length = 0;
    upstream = routeTable({ 'https://example.com/r2': redirect('http://[::ffff:a00:1]/'), 'http://[::ffff:a00:1]/': okPage });
    r = await call('GET', '/fetch?u=' + encodeURIComponent('https://example.com/r2'), { headers: { 'x-app-proxy-secret': SECRET } });
    check('302 auf [::ffff:10.0.0.1] → 403', r.status === 403 && reached.length === 1, show(r) + ', erreicht: ' + reached.join(' → '));

    reached.length = 0;
    upstream = routeTable({ 'http://example.com/a': redirect('https://example.org/', 301), 'https://example.org/': okPage });
    r = await call('GET', '/fetch?u=' + encodeURIComponent('http://example.com/a'), { headers: { 'x-app-proxy-secret': SECRET } });
    check('301 http → https://example.org/ → 200', r.status === 200 && r.text === html, show(r));

    reached.length = 0;
    upstream = routeTable({ 'https://example.com/b/c': redirect('../rezept?x=1', 302), 'https://example.com/rezept?x=1': okPage });
    r = await call('GET', '/fetch?u=' + encodeURIComponent('https://example.com/b/c'), { headers: { 'x-app-proxy-secret': SECRET } });
    check('relative Location wird aufgeloest → 200', r.status === 200 && r.text === html, show(r) + ', erreicht: ' + reached.join(' → '));

    reached.length = 0;
    upstream = routeTable({ 'https://example.com/x': redirect('ftp://example.com/', 302) });
    r = await call('GET', '/fetch?u=' + encodeURIComponent('https://example.com/x'), { headers: { 'x-app-proxy-secret': SECRET } });
    check('Location mit ftp: → 403 bad_scheme', r.status === 403 && r.json && r.json.error.code === 'bad_scheme', show(r));

    reached.length = 0;
    upstream = routeTable({ 'https://example.com/n': redirect(null, 302) });
    r = await call('GET', '/fetch?u=' + encodeURIComponent('https://example.com/n'), { headers: { 'x-app-proxy-secret': SECRET } });
    check('3xx ohne Location → Fehler (502 bad_redirect) samt CORS', r.status === 502 && r.json && r.json.error.code === 'bad_redirect' && cors(r), show(r));

    const chain = (n) => {
      const t = {};
      for (let i = 0; i < n; i++) t['https://example.com/h' + i] = redirect('https://example.com/h' + (i + 1), 302);
      t['https://example.com/h' + n] = okPage;
      return t;
    };
    upstream = routeTable(chain(5));
    r = await call('GET', '/fetch?u=' + encodeURIComponent('https://example.com/h0'), { headers: { 'x-app-proxy-secret': SECRET } });
    check('5 Weiterleitungen → 200', r.status === 200, show(r));
    upstream = routeTable(chain(6));
    r = await call('GET', '/fetch?u=' + encodeURIComponent('https://example.com/h0'), { headers: { 'x-app-proxy-secret': SECRET } });
    check('6 Weiterleitungen → 502 bad_redirect', r.status === 502 && r.json && r.json.error.code === 'bad_redirect', show(r));

    // Die Upstream-Seite wird begrenzt gelesen (MAX_URL_READ_BYTES = 2 MB).
    const big = chunkedStream(1024 * 1024 * 8);
    upstream = async () => new Response(big.stream, { status: 200, headers: { 'Content-Type': 'text/html' } });
    r = await call('GET', '/fetch?u=' + encodeURIComponent('https://example.com/gross'), { headers: { 'x-app-proxy-secret': SECRET }, waitMs: 10000 });
    check('8-MB-Seite: nur bis 2 MB gelesen, Antwort 512 KB', r.status === 200 && big.state.pulled <= 1024 * 1024 * 2 + 2 * 64 * 1024 && // der Stream fuellt bis zu zwei Stuecke vor
      big.state.cancelled && r.text.length === 1024 * 512,
      show(r) + ', gelesen ' + Math.round(big.state.pulled / 1024) + ' KB, Antwort ' + Math.round(r.text.length / 1024) + ' KB');

    // JSON-LD hinter 1 MB Seitentext ueberlebt weiterhin die Kuerzung.
    const ld = '<script type="application/ld+json">{"@type":"Recipe","name":"Test"}</script>';
    const page = '<html>' + 'x'.repeat(1024 * 1024) + ld + '</html>';
    upstream = async () => new Response(page, { status: 403 });
    r = await call('GET', '/fetch?u=' + encodeURIComponent('https://example.com/ld'), { headers: { 'x-app-proxy-secret': SECRET } });
    check('JSON-LD hinten auf der Seite wird vorangestellt (auch bei HTTP 403)', r.status === 200 && r.text.indexOf(ld) === 0 && r.text.length === ld.length + 1 + 1024 * 512, show(r));
    upstream = async () => new Response('<html>Bitte Cookies</html>', { status: 403 });
    r = await call('GET', '/fetch?u=' + encodeURIComponent('https://example.com/wall'), { headers: { 'x-app-proxy-secret': SECRET } });
    check('Bot-Wall ohne JSON-LD → 502 upstream_blocked (wie bisher)', r.status === 502 && r.json.error.code === 'upstream_blocked', show(r));
    upstream = async () => { throw new Error('connect ECONNREFUSED'); };
    r = await call('GET', '/fetch?u=' + encodeURIComponent('https://example.com/down'), { headers: { 'x-app-proxy-secret': SECRET } });
    check('Upstream nicht erreichbar → 504 fetch_failed (wie bisher)', r.status === 504 && r.json.error.code === 'fetch_failed', show(r));
    r = await call('GET', '/fetch?u=' + encodeURIComponent('https://example.com/'));
    check('/fetch ohne Secret → 401 (wie bisher)', r.status === 401, show(r));
  }

  // ── (d) /v1/messages: Upstream-Fehler → JSON samt CORS ──
  section('(d) /v1/messages: Fehler beim Abruf von Anthropic');
  {
    upstream = async () => { throw new Error('network down'); };
    let r = await call('POST', '/v1/messages', { headers: secretHdr, body: aiBody });
    check('werfendes fetch → 502 upstream_error samt CORS', r.status === 502 && r.json && r.json.error.code === 'upstream_error' && cors(r), show(r));

    const origTimeout = AbortSignal.timeout;
    const asked = [];
    AbortSignal.timeout = (ms) => { asked.push(ms); return origTimeout.call(AbortSignal, 50); };
    upstream = (url, init) => new Promise((_, rej) => {
      if (!init.signal) return; // ohne Signal haengt es fuer immer
      init.signal.addEventListener('abort', () => rej(init.signal.reason));
    });
    r = await call('POST', '/v1/messages', { headers: secretHdr, body: aiBody, waitMs: 2000 });
    AbortSignal.timeout = origTimeout;
    check('haengendes fetch → 504 samt CORS', r.status === 504 && cors(r), show(r));
    check('Timeout liegt ueber dem Client-Timeout von 25 s', asked.length === 1 && asked[0] >= 30000, 'angefragt: ' + asked.join(','));

    let seen = null;
    upstream = async (url, init) => { seen = { url, init }; return new Response('{"content":[{"type":"text","text":"ok"}]}', { status: 200, headers: { 'Content-Type': 'application/json' } }); };
    r = await call('POST', '/v1/messages', { headers: secretHdr, body: aiBody });
    check('normaler Aufruf → 200, Body unveraendert weitergereicht', r.status === 200 && r.json.content[0].text === 'ok' && seen && seen.init.body === JSON.stringify(aiBody) && seen.init.headers['x-api-key'] === 'test-anthropic-key', show(r));
    upstream = async () => new Response('{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}', { status: 529, headers: { 'Content-Type': 'application/json' } });
    r = await call('POST', '/v1/messages', { headers: secretHdr, body: aiBody });
    check('Anthropic-Fehler wird mit Status weitergereicht (529)', r.status === 529 && r.json.error.message === 'Overloaded' && cors(r), show(r));
    r = await call('POST', '/v1/messages', { headers: { 'Content-Type': 'application/json' }, body: aiBody });
    check('/v1/messages ohne Secret → 401', r.status === 401, show(r));
  }

  // ── (e) Unbehandelte Ausnahmen → 500 JSON samt CORS ──
  section('(e) KV wirft (Kontingent erschoepft) → 500 internal_error samt CORS');
  {
    KV.reset();
    KV.failPut = () => true;
    const origLog = console.log;
    let r;
    console.log = () => {};
    try {
      r = await call('POST', '/workout', { headers: { 'X-User-Token': TOKEN, 'Content-Type': 'application/json' }, body: workoutBody, origin: '' });
    } finally {
      console.log = origLog;
    }
    check('POST /workout mit werfendem put → 500 internal_error samt CORS', r.status === 500 && r.json && r.json.error.code === 'internal_error' && cors(r), show(r));
    console.log = () => {};
    try {
      r = await call('POST', '/shop/sync', { headers: { 'X-Shop-Room': ROOM, 'Content-Type': 'application/json' }, body: syncBody });
    } finally {
      console.log = origLog;
    }
    check('POST /shop/sync mit werfendem put → 500 internal_error samt CORS', r.status === 500 && r.json && r.json.error.code === 'internal_error' && cors(r), show(r));

    KV.reset();
    KV.failPut = (key) => key.indexOf('fbrl:') === 0;
    const gh = [];
    upstream = githubStub(gh);
    console.log = () => {};
    try {
      r = await call('POST', '/feedback', { headers: secretHdr, body: { type: 'bug', description: 'Test', context: {} } });
    } finally {
      console.log = origLog;
    }
    check('Feedback geht durch, wenn nur der Zaehler-put wirft', r.status === 200 && r.json.data.number === 1, show(r));

    KV.reset();
    r = await call('POST', '/feedback', { headers: secretHdr, body: '{kaputt' });
    check('ungueltiges Feedback kostet keinen KV-Schreibzugriff', r.status === 400 && KV.counts.put === 0, show(r) + ', puts ' + KV.counts.put);
    r = await call('POST', '/feedback', { headers: secretHdr, body: 'x'.repeat(1024 * 1024 * 2) });
    check('zu grosses Feedback kostet keinen KV-Schreibzugriff', r.status === 413 && KV.counts.put === 0, show(r) + ', puts ' + KV.counts.put);
    r = await call('POST', '/feedback', { headers: secretHdr, body: { type: 'bug', description: 'Test' } });
    check('gueltiges Feedback zaehlt weiterhin (1 put)', r.status === 200 && KV.counts.put === 1, show(r) + ', puts ' + KV.counts.put);
    KV.store.set('fbrl:unknown:' + new Date().toISOString().slice(0, 10), { value: '30', metadata: null });
    r = await call('POST', '/feedback', { headers: secretHdr, body: { type: 'bug', description: 'Test' } });
    check('Feedback-Tagesgrenze greift weiterhin (429)', r.status === 429 && cors(r), show(r));
  }

  // ── (g) Die bestehenden Clients brechen nicht ──
  section('(g) Clients: App, Kurzbefehl/Tasker, Alexa-Lambda');
  {
    KV.reset();
    upstream = null;
    let r = await call('POST', '/share', { headers: { 'Content-Type': 'application/json' }, body: { code: 'QUJDREVGR0hJSktMTU5PUA' } });
    check('App: POST /share (Origin + Content-Type) → 200', r.status === 200 && /\?s=/.test(r.json.data.short), show(r));
    const id = r.json && r.json.data && r.json.data.id;
    r = await call('GET', '/share/' + id);
    check('App: GET /share/<id> → 200', r.status === 200 && r.json.data.code === 'QUJDREVGR0hJSktMTU5PUA', show(r));
    r = await call('POST', '/share', { headers: { 'Content-Type': 'application/json' }, body: { code: 'QUJDREVGR0hJSktMTU5PUA' }, origin: '' });
    check('POST /share ohne Origin → 200 (keine Origin-Pflicht)', r.status === 200, show(r));
    r = await call('POST', '/share', { headers: { 'Content-Type': 'application/json' }, body: { code: 'QUJDREVGR0hJSktMTU5PUA' }, origin: 'https://evil.test' });
    check('POST /share von fremder Webseite → 403 (wie bisher)', r.status === 403, show(r));

    for (const [p, hdr] of [['/baby/sync', 'X-Baby-Room'], ['/shop/sync', 'X-Shop-Room'], ['/partner/sync', 'X-Partner-Room'], ['/plan/sync', 'X-Plan-Room']]) {
      KV.reset();
      const h = { 'Content-Type': 'application/json' };
      h[hdr] = ROOM;
      r = await call('POST', p, { headers: h, body: syncBody });
      const r2 = await call('GET', p + '?since=0', { headers: h });
      check('App: POST+GET ' + p + ' → 200, Record kommt zurueck', r.status === 200 && r.json.data.stored === 1 && r2.status === 200 && r2.json.data.records.length === 1, show(r) + ' / ' + show(r2));
    }
    r = await call('POST', '/shop/sync', { headers: { 'X-Shop-Room': ROOM, 'Content-Type': 'application/json' }, body: syncBody, origin: '' });
    check('POST /shop/sync ohne Origin → 200 (keine Origin-Pflicht)', r.status === 200, show(r));
    r = await call('GET', '/shop/sync', { headers: { 'X-Shop-Room': ROOM }, origin: '' });
    check('GET /shop/sync ohne Origin → 200 (wie bisher)', r.status === 200, show(r));

    KV.reset();
    r = await call('POST', '/workout', { headers: { 'X-User-Token': TOKEN, 'Content-Type': 'application/json' }, body: workoutBody, origin: '' });
    check('Kurzbefehl/Tasker: POST /workout nur mit X-User-Token, ohne Origin → 200', r.status === 200 && r.json.data.stored === true, show(r));
    r = await call('POST', '/workout', { headers: { 'X-User-Token': TOKEN }, body: workoutBody, origin: '' });
    check('Kurzbefehl ohne Content-Type → 200', r.status === 200, show(r));
    r = await call('POST', '/workout', { headers: { 'X-User-Token': TOKEN, 'Content-Type': 'application/json' }, body: '﻿' + JSON.stringify(workoutBody), origin: '' });
    check('Kurzbefehl mit BOM vor dem JSON → 200 (wie request.json())', r.status === 200, show(r));
    r = await call('GET', '/workouts?since=0', { headers: { 'X-User-Token': TOKEN } });
    check('App: GET /workouts → Workout kommt zurueck', r.status === 200 && r.json.data.workouts.length === 1, show(r));

    KV.reset();
    r = await call('POST', '/alexa/inbox', { headers: { 'X-User-Token': TOKEN, 'Content-Type': 'application/json' }, body: alexaBody, origin: '' });
    check('Alexa-Lambda: POST /alexa/inbox (X-User-Token, Content-Type, Content-Length, ohne Origin) → 200', r.status === 200 && r.json.data.stored === true, show(r));
    r = await call('GET', '/alexa/inbox?since=0', { headers: { 'X-User-Token': TOKEN } });
    check('App: GET /alexa/inbox → Einwurf kommt zurueck', r.status === 200 && r.json.data.items.length === 1, show(r));
    r = await call('POST', '/alexa/ack', { headers: { 'X-User-Token': TOKEN, 'Content-Type': 'application/json' }, body: { ids: ['ax1'] } });
    check('App: POST /alexa/ack → geloescht', r.status === 200 && r.json.data.deleted === 1, show(r));

    upstream = async (url) => {
      if (url === 'https://decoder.test/decode') return new Response(JSON.stringify({ code: '4006381333931' }), { status: 200 });
      throw new Error('unerwartet ' + url);
    };
    r = await call('POST', '/decode-barcode', { headers: { 'x-app-proxy-secret': SECRET, 'Content-Type': 'image/jpeg' }, body: new Uint8Array(2048).fill(7) });
    check('App: POST /decode-barcode (JPEG-Bytes) → 200 mit Code', r.status === 200 && r.json.data.code === '4006381333931', show(r));

    upstream = async () => new Response(JSON.stringify({ choices: [{ message: { content: 'hallo' } }] }), { status: 200 });
    r = await call('POST', '/ai/messages', { headers: Object.assign({ 'x-ai-provider': 'openai', 'x-ai-key': 'k' }, secretHdr), body: aiBody });
    check('App: POST /ai/messages → 200 im Anthropic-Schema', r.status === 200 && r.json.content[0].text === 'hallo', show(r));

    const pre = await call('OPTIONS', '/shop/sync');
    check('Preflight → 204 mit Raum-Headern', pre.status === 204 && /x-plan-room/.test(pre.headers.get('access-control-allow-headers') || ''), show(pre));
    r = await call('GET', '/gibt-es-nicht');
    check('unbekannter Pfad → 404 samt CORS (wie bisher)', r.status === 404 && cors(r), show(r));
  }

  // ── (h) Feedback-Screenshot ──
  section('(h) Feedback: Screenshot nur als JPEG, keine Fehlermeldung im Issue');
  {
    KV.reset();
    let gh = [];
    upstream = githubStub(gh);
    let r = await call('POST', '/feedback', { headers: secretHdr, body: { type: 'bug', description: 'Test', screenshotB64: PNG_B64 } });
    check('PNG-Screenshot → 400 invalid_screenshot, kein GitHub-Aufruf', r.status === 400 && r.json.error.code === 'invalid_screenshot' && gh.length === 0, show(r) + ', GitHub-Aufrufe ' + gh.length);
    gh = [];
    upstream = githubStub(gh);
    r = await call('POST', '/feedback', { headers: secretHdr, body: { type: 'bug', description: 'Test', screenshotB64: 'data:image/jpeg;base64,' + JPEG_B64 } });
    check('JPEG-Screenshot (auch mit data:-Praefix) → Upload versucht, 200', r.status === 200 && r.json.data.screenshotUploaded === true && gh.some((c) => /\/contents\//.test(c.url)), show(r));
    gh = [];
    gh.uploadThrows = true;
    upstream = githubStub(gh);
    const origLog = console.log;
    console.log = () => {};
    try {
      r = await call('POST', '/feedback', { headers: secretHdr, body: { type: 'bug', description: 'Test', screenshotB64: JPEG_B64 } });
    } finally {
      console.log = origLog;
    }
    const issue = gh.find((c) => /\/issues$/.test(c.url));
    const issueText = issue ? JSON.parse(issue.body).body : '';
    check('werfender Upload: Issue nennt "upload threw", nicht die Fehlermeldung', r.status === 200 && /upload threw/.test(issueText) && issueText.indexOf('7f3a') < 0, issueText.split('\n').filter((l) => /Screenshot/.test(l)).join(' '));
  }

  // ── (i) /decode-barcode ohne Vision-Fallback (#209) ──
  // Auch ein altes ENABLE_VISION_FALLBACK="true" im Dashboard darf keinen
  // Anthropic-Aufruf mehr ausloesen; die Quelle des Decoders wird durchgereicht.
  section('(i) /decode-barcode: nur OSS-Decoder, keine Vision');
  {
    const jpeg = { headers: { 'x-app-proxy-secret': SECRET, 'Content-Type': 'image/jpeg' }, body: new Uint8Array(2048).fill(7) };
    const oldFlag = env.ENABLE_VISION_FALLBACK;
    env.ENABLE_VISION_FALLBACK = 'true';
    try {
      outbound.length = 0;
      upstream = async (url) => {
        if (url === 'https://decoder.test/decode') return new Response(JSON.stringify({ found: false, code: null }), { status: 200 });
        if (url.indexOf('api.anthropic.com') >= 0) return new Response(JSON.stringify({ content: [{ type: 'text', text: '4006381333931' }] }), { status: 200 });
        throw new Error('unerwartet ' + url);
      };
      let r = await call('POST', '/decode-barcode', jpeg);
      const toAnthropic = outbound.filter((u) => u.indexOf('api.anthropic.com') >= 0).length;
      check('Decoder-Miss (Flag alt auf "true") → found:false, source opencv-miss, kein Anthropic-Aufruf', r.status === 200 && r.json.data.found === false && r.json.data.source === 'opencv-miss' && toAnthropic === 0, show(r) + ', Anthropic-Aufrufe ' + toAnthropic);

      upstream = async (url) => {
        if (url === 'https://decoder.test/decode') return new Response(JSON.stringify({ found: true, code: '4006381333931', source: 'pyzbar' }), { status: 200 });
        throw new Error('unerwartet ' + url);
      };
      r = await call('POST', '/decode-barcode', jpeg);
      check('Decoder-Treffer mit source pyzbar → source pyzbar durchgereicht', r.status === 200 && r.json.data.code === '4006381333931' && r.json.data.source === 'pyzbar', show(r));

      upstream = async (url) => {
        if (url === 'https://decoder.test/decode') return new Response(JSON.stringify({ found: true, code: '4006381333931' }), { status: 200 });
        throw new Error('unerwartet ' + url);
      };
      r = await call('POST', '/decode-barcode', jpeg);
      check('Decoder-Treffer ohne source → opencv (wie bisher)', r.status === 200 && r.json.data.source === 'opencv', show(r));

      const oldUrl = env.DECODER_URL;
      delete env.DECODER_URL;
      try {
        outbound.length = 0;
        r = await call('POST', '/decode-barcode', jpeg);
        check('ohne DECODER_URL → 500 worker_not_configured, kein Abruf', r.status === 500 && r.json.error.code === 'worker_not_configured' && outbound.length === 0, show(r) + ', Abrufe ' + outbound.length);
      } finally {
        env.DECODER_URL = oldUrl;
      }

      // UPC-E (#264): achtstellig, aber keine gueltige EAN-8. 04252614 ist die
      // Kurzform von 042100005264; vorher verwarf der Worker den Treffer.
      for (const [code, want, what] of [
        ['04252614', true, 'UPC-E 04252614 (→ UPC-A 042100005264)'],
        ['04252615', false, 'UPC-E mit falscher Pruefziffer 04252615'],
        ['96385074', true, 'EAN-8 96385074 (wie bisher)'],
        ['96385075', false, 'EAN-8 mit falscher Pruefziffer 96385075'],
      ]) {
        upstream = async (url) => {
          if (url === 'https://decoder.test/decode') return new Response(JSON.stringify({ found: true, code }), { status: 200 });
          throw new Error('unerwartet ' + url);
        };
        r = await call('POST', '/decode-barcode', jpeg);
        check(what + (want ? ' → found:true' : ' → found:false'), r.status === 200 && r.json.data.found === want && (want ? r.json.data.code === code : r.json.data.code === null), show(r));
      }

      r = await call('GET', '/health');
      check('/health meldet kein visionFallbackEnabled mehr', r.status === 200 && !('visionFallbackEnabled' in r.json.data), show(r));
    } finally {
      if (oldFlag === undefined) delete env.ENABLE_VISION_FALLBACK;
      else env.ENABLE_VISION_FALLBACK = oldFlag;
    }
  }

  // ── Bekannte Grenze (Folge-Issue): unauthentifizierte Abrufe kosten KV ──
  section('Bekannte Grenze: GET mit frei gewaehltem Raum kostet 1 list + 1 put');
  {
    KV.reset();
    const r = await call('GET', '/shop/sync?since=0', { headers: { 'X-Shop-Room': 'Fremd' + ROOM }, origin: '' });
    check('GET /shop/sync mit fremdem Raum: 200, 1 list, 1 put (Stand wie v0.277, nicht geaendert)', r.status === 200 && KV.counts.list === 1 && KV.counts.put === 1, show(r) + ', list ' + KV.counts.list + ', put ' + KV.counts.put);
  }

  const bad = allOutbound.filter((u) => !/^https:\/\/(example\.(com|org)|www\.chefkoch\.de|decoder\.test|api\.github\.com|api\.anthropic\.com|api\.openai\.com)\//.test(u) && !/^http:\/\/(example\.com|100\.128\.0\.1|172\.32\.0\.1|\[2a00:)/.test(u));
  check('kein Abruf ging an ein unerwartetes Ziel (und keiner wirklich nach aussen)', bad.length === 0, bad.join(', '));

  console.log('\n' + passed + ' ok, ' + failed + ' fehlgeschlagen');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('worker-test: Abbruch:', e && e.stack);
  process.exit(1);
});
