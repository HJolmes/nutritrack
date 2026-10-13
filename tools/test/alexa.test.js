// Tests fuer die Textdeutung im Alexa-Skill (alexa/lambda/index.js): Fragen an
// Hebamme/Arzt, Windel-Saetze, Einkaufszettel. Ohne Netz, nur reine Funktionen.
//
//   npm test
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { babyTypeOf, babyEntry, questionText, shopItems, isShopText, DOC_RE } = require('../../alexa/lambda/index.js')._test;

test('Arzt-Woerter, auch mit Umlaut am Wortanfang', () => {
  for (const w of ['Arzt', 'Ärztin', 'Kinderarzt', 'Kinderärztin', 'Frauenärztin', 'Doktor']) {
    assert.ok(DOC_RE.test('frag die ' + w + ' ob'), w);
  }
  assert.ok(!DOC_RE.test('Hebamme war da'));
});

test('Fragetext: Anrede weg, gross, Fragezeichen', () => {
  assert.equal(questionText('ob sie Fencheltee trinken darf'), 'Ob sie Fencheltee trinken darf?');
  assert.equal(questionText('an den Kinderarzt wann ist die U4'), 'Wann ist die U4?');
  assert.equal(questionText('Frage an die Ärztin wie viel Vitamin D'), 'Wie viel Vitamin D?');
  assert.equal(questionText(''), '');
});

test('Windel: Art und Inhalt', () => {
  assert.equal(babyTypeOf('volle Windel'), 'diaper');
  assert.equal(babyTypeOf('Windeln gewechselt'), 'diaper');
  assert.equal(babyEntry('diaper', 'volle').payload.babyP.kind, 'poo');
  assert.equal(babyEntry('diaper', 'nass').payload.babyP.kind, 'pee');
  assert.equal(babyEntry('diaper', 'stuhl und pipi').payload.babyP.kind, 'both');
});

test('Einkauf: Ziel und Fuellwoerter weg, mehrere Artikel getrennt', () => {
  assert.deepEqual(shopItems('noch Milch und Eier auf die Einkaufsliste bitte'), ['Milch', 'Eier']);
  assert.deepEqual(shopItems('Milch, Butter und zwei Liter Saft'), ['Milch', 'Butter', 'Zwei Liter Saft']);
  assert.deepEqual(shopItems('kaufe Brot ein'), ['Brot']);
  assert.deepEqual(shopItems('Einkaufsliste'), []);
});

test('Einkauf im falschen Intent wird erkannt, Essen nicht', () => {
  assert.ok(isShopText('Milch auf dem Einkaufszettel'));
  assert.ok(isShopText('Bananen auf meine Liste'));
  assert.ok(!isShopText('zwei Brötchen'));
  assert.ok(!isShopText('Linsen mit Spätzle'));
});
