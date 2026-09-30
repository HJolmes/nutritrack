#!/usr/bin/env node
// NutriTrack – Pruefung der Stillzeit-Tabelle (js/ampel.js, #205).
//
// Warum es das gibt: Die Tabelle ersetzt einen KI-Aufruf, der Namen den
// Regeln des Stillzeit-Prompts zugeordnet hat. Ein zu weiter Abgleich macht
// Obst rot („Weintrauben"), ein zu enger laesst Alkohol gruen durch. Beides
// sieht im Code gleich aus. Deshalb laeuft der Abgleich hier gegen JEDEN
// Namen der eingebauten Datenbank, und jeder Treffer wird zur Sichtpruefung
// ausgegeben – dazu feste Positiv- und Negativlisten mit Freitextnamen, die in
// der Datenbank nicht stehen.
//
//   node tools/ampel-test.js          Pruefung, Exit 1 bei Fehler
//   node tools/ampel-test.js --list   zusaetzlich alle DB-Treffer auflisten
'use strict';
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
global.window = {};
require(path.join(ROOT, 'js/fooddb.js'));
require(path.join(ROOT, 'js/fooddb-usda.js'));
require(path.join(ROOT, 'js/ampel.js'));
const A = window.NTAmpel;

const expect = {
  rot: ['Rotwein', 'Weißwein', 'Bier', 'Wodka/Korn (40%)', 'Sekt', 'Prosecco', 'Glühwein', 'Eierlikör',
        'Whisky', 'Schnaps', 'Radler', 'Aperol Spritz', 'Weizenbier', 'Gin Tonic', 'Rotweinsauce',
        'Pilsner', 'Pilsener', 'Hefeweizen', 'Martini', 'Mojito', 'Caipirinha', 'Hugo', 'Baileys', 'Jägermeister',
        'Absinth', 'Lillet', 'Limoncello', 'Erdbeerbowle', 'Alsterwasser'],
  gelb: ['Thunfisch (Dose)', 'Thunfisch (frisch)', 'Thunfischsalat', 'Pizza Tonno', 'Schwertfisch', 'Hai',
         'Königsmakrele', 'Rinderleber', 'Leberwurst', 'Kalbsleberwurst',
         'Kaffee (schwarz)', 'Espresso', 'Cappuccino', 'Latte Macchiato', 'Milchkaffee', 'Eiskaffee',
         'Cola', 'Cola Zero', 'Cola light', 'Coca-Cola', 'Energy Drink', 'Schwarzer Tee', 'Grüner Tee',
         'Mate', 'Club Mate', 'Monster Energy', 'Salbeitee', 'Pfefferminztee', 'Tee (Pfefferminze)', 'Petersilientee'],
  gruen: ['Weintrauben', 'Schweineschnitzel', 'Schweinebraten', 'Schweineschmalz', 'Wildschwein',
          'Teewurst', 'Tomate', 'Tomatensauce', 'Passierte Tomaten', 'Bierschinken', 'Rucola',
          'Schokolade (70%)', 'Schokoladenkuchen', 'Aubergine', 'Ingwer', 'Paniermehl',
          'Rumpsteak (gebraten)', 'Kaffeesahne', 'Makrele', 'Salami', 'Ei', 'Ei (roh)', 'Rohmilchkäse',
          'Sushi', 'Rohschinken', 'Weißkohl', 'Zwiebel', 'Linsen (gekocht)', 'Kichererbsen', 'Rotkohl',
          'Weinessig', 'Rotweinessig', 'Weinblätter', 'Dinkel (Korn)', 'Vollkornbrot', 'Malzbier',
          'Alkoholfreies Bier', 'Bier alkoholfrei', 'Kaffee entkoffeiniert', 'Thai Curry',
          'Petersilie', 'Salbei', 'Pfefferminze', 'Kräutertee', 'Leberkäse', 'Leberkäs',
          'Buchweizen', 'Weizenmehl', 'Cocktailtomaten', 'Hefeweizen alkoholfrei'],
};

let fail = 0;
for (const [ampel, names] of Object.entries(expect)) {
  names.forEach((n) => {
    const r = A.rate('nurs', n);
    if (!r || r.ampel !== ampel || r.src !== 'rule') { fail++; console.log(`  x   ${n}: erwartet ${ampel}, bekommen ${r ? r.ampel : 'null'}`); }
  });
}
// Typen ohne Tabelle bleiben bei der KI.
['preg', 'diet'].forEach((t) => { if (A.rate(t, 'Rotwein') !== null) { fail++; console.log(`  x   rate('${t}') muss null sein`); } });
// Format wie die KI-Antwort: name unveraendert (Kartenschluessel ist name.toLowerCase()).
const fmt = A.rate('nurs', 'Thunfisch (Dose)');
if (!fmt || fmt.name !== 'Thunfisch (Dose)' || typeof fmt.grund !== 'string') { fail++; console.log('  x   Ergebnisformat'); }

const names = window.DB.map((d) => d.n);
const hits = names.map((n) => ({ n, r: A.rate('nurs', n) })).filter((x) => x.r.ampel !== 'gruen');
console.log(`  ok  ${names.length} DB-Namen geprueft, ${hits.length} mit Stillzeit-Hinweis.`);
if (process.argv.includes('--list') || fail) {
  hits.forEach((x) => console.log(`      ${x.r.ampel.padEnd(4)} ${x.n}  (${A.match('nurs', x.n).map((r) => r.cat).join(', ')})`));
}
if (fail) { console.log(`\n${fail} Fehler.`); process.exit(1); }
console.log(`  ok  ${Object.values(expect).reduce((a, b) => a + b.length, 0)} feste Faelle stimmen.`);
