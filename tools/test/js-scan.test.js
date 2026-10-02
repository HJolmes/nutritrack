// Tests fuer tools/js-scan.js (#257): Kommentar-Lexer und Handler-Zerlegung,
// die tools/check.js und tools/smoke.js teilen. Jeder Fall stammt aus einem
// Fund im Review — vorher zaehlte Text im String als Aufruf, ein `=>` oder ein
// `'+'` versteckte einen, und ein `//` am Zeilenende war Code.
//
//   npm test          (node --test tools/test/)
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { stripComments, handlerCalls } = require('../js-scan');

test('handlerCalls: Text in String-Literalen ist kein Aufruf', () => {
  assert.deepEqual(handlerCalls("showToast('Bitte warten (gleich)')"), ['showToast']);
  assert.deepEqual(handlerCalls('showToast("Fehler (3)");closeOv(\'x\')'), ['showToast', 'closeOv']);
});

test('handlerCalls: Aufruf hinter => zaehlt', () => {
  assert.deepEqual(handlerCalls('setTimeout(()=>pickerSearch(),0)'), ['pickerSearch']);
});

test('handlerCalls: Schluesselwoerter, this, event und Browser-Globale zaehlen nicht', () => {
  assert.deepEqual(handlerCalls("if(event.key==='Enter')pickerSearch()"), ['pickerSearch']);
  assert.deepEqual(handlerCalls("this.closest('.x').remove();event.stopPropagation()"), []);
  assert.deepEqual(handlerCalls('NTStats.setRange(7)'), ['NTStats.setRange']);
});

test('handlerCalls: ${…} im Template ist ein Wert, auch verschachtelt', () => {
  assert.deepEqual(handlerCalls('del(${fmt({a:1})})'), ['del']);
  assert.deepEqual(handlerCalls("open('${esc(x)}')"), ['open']);
});

test("handlerCalls: '+' im DOM ist ein Literal, keine Verkettung", () => {
  assert.deepEqual(handlerCalls("addOp('+');calc()"), ['addOp', 'calc']);
});

test('handlerCalls im JS-String: Verkettung wird 0, \\\' ist die Anfuehrung', () => {
  const o = { inJsString: true };
  assert.deepEqual(handlerCalls("delFood(\\''+f.id+'\\')", o), ['delFood']);
  assert.deepEqual(handlerCalls("closeOv('+id+');openPicker(null)", o), ['closeOv', 'openPicker']);
  // Ein Literal '+' steht im JS-String als \'+\' — keine Verkettung.
  assert.deepEqual(handlerCalls("addOp(\\'+\\');calc()", o), ['addOp', 'calc']);
  // Offene Verkettung bis zum Ende: dahinter wird nichts geprueft.
  assert.deepEqual(handlerCalls("a();b(\\''+p.replace(/'/g,\"\\\\'\")", o), ['a', 'b']);
  // Zur Laufzeit zusammengesetzter Name: kein Aufruf erkennbar, kein Fehlalarm.
  assert.deepEqual(handlerCalls("'+fn+'(1)", o), []);
});

test('stripComments: Zeilen und Laenge bleiben', () => {
  const src = "a(); // b()\n/* c()\n d() */ e();\n";
  const out = stripComments(src);
  assert.equal(out.length, src.length);
  assert.equal(out.split('\n').length, src.split('\n').length);
  assert.equal(out.replace(/\s+/g, ' ').trim(), 'a(); e();');
});

test('stripComments: // und /* in Strings, Templates und Regex bleiben Code', () => {
  for (const src of [
    "var u = 'https://x.y/' + go();",
    'var a = "image/*"; run();',
    'var t = `//${f()}/*`; g();',
    'if (/\\/\\*/.test(s)) h();',
    'return /\\/\\//.test(s);',
    'x = [/[/*]/g, 1];',
  ]) assert.equal(stripComments(src), src, src);
});

test('stripComments: Kommentar hinter Division, Regex und im ${…}', () => {
  assert.equal(stripComments('x = a / b; // c()').trimEnd(), 'x = a / b;');
  assert.equal(stripComments('ok = /a/.test(s) // k()').trimEnd(), 'ok = /a/.test(s)');
  assert.equal(stripComments('t = `${a /* b() */}`;'), 't = `${a ' + ' '.repeat(9) + '}`;');
  assert.equal(stripComments('o = {a: 1} // x()\nf()'), 'o = {a: 1}       \nf()');
});
