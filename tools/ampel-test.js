#!/usr/bin/env node
// NutriTrack – Pruefung der Ampel-Tabellen (js/ampel.js): Stillzeit (#205),
// Ernaehrung (#262).
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
        'Absinth', 'Lillet', 'Limoncello', 'Erdbeerbowle', 'Alsterwasser',
        // #262: alkoholische Getraenke, die bis v0.301 gruen waren; Speisen, die schon rot waren, bleiben rot
        'Kirschwasser', 'Grog', 'Punsch', 'Rumpunsch', 'Eierlikörkuchen', 'Rum-Rosinen-Eis', 'Likörpralinen',
        'Eierlikör (zerlegt NFD)'.replace(' (zerlegt NFD)', '').normalize('NFD')],
  gelb: ['Thunfisch (Dose)', 'Thunfisch (frisch)', 'Thunfischsalat', 'Pizza Tonno', 'Schwertfisch', 'Hai',
         'Königsmakrele', 'Rinderleber', 'Leberwurst', 'Kalbsleberwurst',
         'Kaffee (schwarz)', 'Espresso', 'Cappuccino', 'Latte Macchiato', 'Milchkaffee', 'Eiskaffee',
         'Cola', 'Cola Zero', 'Cola light', 'Coca-Cola', 'Energy Drink', 'Schwarzer Tee', 'Grüner Tee',
         'Mate', 'Club Mate', 'Monster Energy', 'Salbeitee', 'Pfefferminztee', 'Tee (Pfefferminze)', 'Petersilientee',
         // #262 (Entscheidung 2026-10-01): Leberkaese und Alkohol in Speisen gelb
         'Leberkäse', 'Leberkäs', 'Leberkässemmel', 'Leberkaas', 'Tiramisu', 'Erdbeertiramisu', 'Tiramisù', 'Rumkugeln',
         'Schokorumkugeln', 'Rumtopf', 'Rumrosinen', 'Weincreme', 'Weinschaumcreme', 'Zabaione', 'Sabayon', 'Coq au Vin',
         'Mon Chéri', 'Weinbrandbohnen', 'Schwarzwälder Kirschtorte', 'Biersuppe', 'Bierbraten',
         'Schweinebraten in Biersoße', 'Cognacsoße', 'Baba au Rhum', 'Savarin', 'Schwarzwälder Kirsch-Torte',
         'Schwarzwälder Kirsch', 'Kirschwassertorte', 'Grog-Torte', 'Punsch Kuchen'],
  gruen: ['Weintrauben', 'Schweineschnitzel', 'Schweinebraten', 'Schweineschmalz', 'Wildschwein',
          'Teewurst', 'Tomate', 'Tomatensauce', 'Passierte Tomaten', 'Bierschinken', 'Rucola',
          'Schokolade (70%)', 'Schokoladenkuchen', 'Aubergine', 'Ingwer', 'Paniermehl',
          'Rumpsteak (gebraten)', 'Kaffeesahne', 'Makrele', 'Salami', 'Ei', 'Ei (roh)', 'Rohmilchkäse',
          'Sushi', 'Rohschinken', 'Weißkohl', 'Zwiebel', 'Linsen (gekocht)', 'Kichererbsen', 'Rotkohl',
          'Weinessig', 'Rotweinessig', 'Weinblätter', 'Dinkel (Korn)', 'Vollkornbrot', 'Malzbier',
          'Alkoholfreies Bier', 'Bier alkoholfrei', 'Kaffee entkoffeiniert', 'Thai Curry',
          'Petersilie', 'Salbei', 'Pfefferminze', 'Kräutertee',
          'Buchweizen', 'Weizenmehl', 'Cocktailtomaten', 'Hefeweizen alkoholfrei',
          // #262: bewusst ohne Koffein-Hinweis; ohne Alkohol; kein Fehltreffer
          'Tee', 'Eistee', 'Chai', 'Kakao', 'Fleischkäse', 'Tiramisu alkoholfrei', 'Rumkugeln alkoholfrei',
          'Bier ohne Alkohol', 'Kinderpunsch', 'Kinder-Punsch', 'Kinder Punsch', 'Früchte-Punsch', 'Krumme Gurke'],
};

let fail = 0;
for (const [ampel, names] of Object.entries(expect)) {
  names.forEach((n) => {
    const r = A.rate('nurs', n);
    if (!r || r.ampel !== ampel || r.src !== 'rule') { fail++; console.log(`  x   ${n}: erwartet ${ampel}, bekommen ${r ? r.ampel : 'null'}`); }
  });
}
// Die richtige Zeile entscheidet, nicht nur die richtige Farbe: Leberkaese hat
// einen eigenen Grund, nicht „Leber – viel Vitamin A“ (zugeordnet ueber grund,
// der dafuer je Zeile eindeutig sein muss).
const grunds = A.RULES.nurs.map((r) => r.grund);
if (new Set(grunds).size !== grunds.length) { fail++; console.log('  x   RULES.nurs: grund nicht eindeutig'); }
const expectCat = { 'Leberkäse': 'leberkaese', 'Rinderleber': 'leber', 'Tiramisu': 'alkohol_speise', 'Rumkugeln': 'alkohol_speise',
  'Rotweinsauce': 'alkohol', 'Eierlikör-Kuchen': 'alkohol', 'Kirschwasser': 'alkohol_getraenk', 'Kirschwassertorte': 'alkohol_speise' };
for (const [n, cat] of Object.entries(expectCat)) {
  const r = A.rate('nurs', n), row = A.RULES.nurs.find((x) => x.grund === (r && r.grund));
  if (!row || row.cat !== cat) { fail++; console.log(`  x   ${n}: Zeile ${cat} erwartet, bekommen ${row ? row.cat : 'keine'} (${A.match('nurs', n).map((x) => x.cat).join(', ')})`); }
}
// Ohne Tabelle bleibt die Schwangerschaft bei der KI; die Ernaehrung ohne lokale Praeferenz ebenso.
if (A.rate('preg', 'Rotwein') !== null) { fail++; console.log(`  x   rate('preg') muss null sein`); }
if (A.rate('diet', 'Rotwein') !== null || A.rate('diet', 'Rotwein', { prefs: ['Glutenfrei', 'histaminarm'] }) !== null) { fail++; console.log(`  x   rate('diet') ohne lokale Praeferenz muss null sein`); }
// Format wie die KI-Antwort: name unveraendert (Kartenschluessel ist name.toLowerCase()).
const fmt = A.rate('nurs', 'Thunfisch (Dose)');
if (!fmt || fmt.name !== 'Thunfisch (Dose)' || typeof fmt.grund !== 'string') { fail++; console.log('  x   Ergebnisformat'); }

const names = window.DB.map((d) => d.n);
const hits = names.map((n) => ({ n, r: A.rate('nurs', n) })).filter((x) => x.r.ampel !== 'gruen');
console.log(`  ok  ${names.length} DB-Namen geprueft, ${hits.length} mit Stillzeit-Hinweis.`);
if (process.argv.includes('--list') || fail) {
  hits.forEach((x) => console.log(`      ${x.r.ampel.padEnd(4)} ${x.n}  (${A.match('nurs', x.n).map((r) => r.cat).join(', ')})`));
}
const nursCases = Object.values(expect).reduce((a, b) => a + b.length, 0);

// ── Ernaehrung (#262) ──────────────────────────────────────────────────────
// Vegetarisch/Vegan: [Name, Vegetarisch, Vegan]; '-' = kein Treffer (offen, KI).
const VEG = [
  ['Bratwurst', 'rot', 'rot'], ['Leberkäse', 'rot', 'rot'], ['Hühnerbrühe', 'rot', 'rot'], ['Speck', 'rot', 'rot'],
  ['Schinken', 'rot', 'rot'], ['Thunfisch', 'rot', 'rot'], ['Garnelen', 'rot', 'rot'], ['Gelatine', 'rot', 'rot'],
  ['Gummibärchen', 'rot', 'rot'], ['Worcestersauce', 'rot', 'rot'], ['Rumpsteak (gebraten)', 'rot', 'rot'],
  ['Spaghetti Bolognese', 'rot', 'rot'], ['Hähnchen mit veganem Dressing', 'rot', 'rot'], ['Gemüse-Bratwurst-Pfanne', 'rot', 'rot'],
  ['Wurst-Reis-Pfanne', 'rot', 'rot'], ['Pizza Hawaii', 'rot', 'rot'], ['Ćevapčići', 'rot', 'rot'], ['Entrecôte', 'rot', 'rot'],
  ['Käsekrainer', 'rot', 'rot'], ['Rouladen', 'rot', 'rot'], ['Pulled Pork', 'rot', 'rot'], ['Lachsfilet', 'rot', 'rot'],
  ['Parmesan', 'rot', 'rot'], ['Gorgonzola', 'rot', 'rot'], ['Pesto', 'gelb', 'rot'], ['Lasagne', 'gelb', 'rot'],
  ['Gemüsebrühe', '-', '-'], ['Brühe', 'gelb', 'gelb'], ['Maultaschen', 'gelb', 'gelb'], ['Pecorino', 'gelb', 'rot'],
  ['Fleischtomate', '-', '-'], ['Sojawurst', '-', '-'], ['Tofu Burger', '-', '-'], ['Gemüse-Frikadelle', '-', '-'],
  ['Blumenkohlsteak', '-', '-'], ['Seitan-Gyros', '-', '-'], ['Veggie Burger', '-', 'gelb'], ['Leberwurst vegan', '-', '-'],
  ['Champignons (gebraten)', '-', '-'], ['Hirschhornsalz', '-', '-'], ['Wachtelbohnen', '-', '-'], ['Serrano-Chili', '-', '-'],
  ['Welschriesling', '-', '-'], ['Austernpilze', '-', '-'], ['Limburger', '-', 'rot'], ['Butterschmalz', '-', 'rot'],
  ['Butterkeks', '-', 'rot'], ['Milchschokolade', '-', 'rot'], ['Eiweiß', '-', 'rot'], ['Bio-Ei', '-', 'rot'],
  ['Freilandeier', '-', 'rot'], ['Spätzle', '-', 'rot'], ['Mayonnaise', '-', 'rot'], ['Honig', '-', 'rot'], ['Met', '-', 'rot'],
  ['Crème fraîche', '-', 'rot'], ['Cappuccino', '-', 'rot'], ['Eis', '-', 'gelb'], ['Croissant', '-', 'gelb'],
  ['Erdnussbutter', '-', '-'], ['Kokosmilch', '-', '-'], ['Hafermilch', '-', '-'], ['Hafer Milch', '-', '-'],
  ['Cappuccino mit Hafermilch', '-', '-'], ['Kaffee ohne Milch', '-', '-'], ['Nudeln ohne Ei', '-', '-'],
  ['Butternusskürbis', '-', '-'], ['Honigmelone', '-', '-'], ['Eierschwammerl', '-', '-'], ['Eiertomaten', '-', '-'],
  ['Milchsäure', '-', '-'], ['Weintrauben', '-', '-'], ['Reis', '-', '-'], ['Weizenmehl', '-', '-'], ['Eisbergsalat', '-', '-'],
  ['Preiselbeeren', '-', '-'], ['Granatapfel', '-', '-'], ['Mais', '-', '-'], ['Apfel', '-', '-'],
  // Review v0.302: ausdruecklich fleischfrei, Kopfwoerter, pflanzliche Alternativen
  ['Burger ohne Fleisch', '-', '-'], ['Fleischfreie Bratwurst', '-', '-'], ['Bolognese fleischfrei', '-', '-'],
  ['fleischfreie Salami', '-', '-'], ['Bratwurst, vegan', '-', '-'], ['Hähnchen mit Salat ohne Fleisch', 'rot', 'rot'],
  ['Nudeln ohne Ei und Milch', '-', '-'], ['Burger Brötchen', '-', '-'], ['Burger Sauce', '-', '-'],
  ['Döner Sauce', '-', '-'], ['Currywurst Sauce', '-', '-'], ['Weißwurstsenf', '-', '-'], ['Hähnchen Gewürz', '-', '-'],
  ['Fisch Gewürz', '-', '-'], ['Bratwurst Brötchen', 'rot', 'rot'], ['Schinken Brötchen', 'rot', 'rot'],
  ['Fisch Sauce', 'rot', 'rot'], ['Austernsauce', 'rot', 'rot'], ['Austernseitlinge', '-', '-'], ['Austern-Pilze', '-', '-'],
  ['Muschel Nudeln', '-', '-'], ['Nierentee', '-', '-'], ['Nieren- und Blasentee', '-', '-'], ['Linsen-Köfte', '-', '-'],
  ['Pilz-Stroganoff', '-', '-'], ['Gemüse-Schaschlik', '-', '-'], ['Avocado-Tatar', '-', '-'], ['Köfte', 'rot', 'rot'],
  ['Rindertatar', 'rot', 'rot'], ['Wild-Preiselbeeren', '-', '-'], ['Spurenelemente', '-', '-'], ['Kräuterstrauß', '-', '-'],
  ['Kürbisfleisch', '-', '-'], ['Butternut Kürbis', '-', '-'], ['Peanut Butter', '-', '-'], ['Soja-Joghurtalternative', '-', '-'],
  ['Frischkäse-Alternative', '-', '-'], ['Lasagneplatten', '-', '-'], ['Honig-Melone', '-', '-'], ['Cashew Joghurt', '-', '-'],
  ['Tofu-Rührei', '-', '-'], ['Tofu Rührei', '-', '-'], ['Ei-Ersatz', '-', '-'], ['Soja-Eiweiß', '-', '-'],
  ['Joghurt', '-', 'rot'], ['Frischkäse', '-', 'rot'], ['Rührei', '-', 'rot'], ['Rührei mit Speck', 'rot', 'rot'],
];
const dietPick = (r, p) => { const b = r && r.by.find((x) => x.p === p); return b ? b.ampel : (r && r.open.includes(p) ? '-' : '?'); };
let dietFail = 0;
VEG.forEach(([n, veg, vegan]) => {
  const r = A.rate('diet', n, { prefs: ['Vegetarisch', 'Vegan'] });
  const gv = dietPick(r, 'Vegetarisch'), gn = dietPick(r, 'Vegan');
  if (gv !== veg || gn !== vegan) { dietFail++; console.log(`  x   ${n}: Vegetarisch ${veg}/Vegan ${vegan} erwartet, bekommen ${gv}/${gn}`); }
});
// Die Tabelle sagt bei Vegetarisch/Vegan nie Gruen (ohne Treffer: KI).
const vegRows = A.RULES.veg.concat(A.RULES.vegan);
if (vegRows.some((r) => r.ampel === 'gruen')) { dietFail++; console.log('  x   Veg/Vegan-Tabelle enthaelt Gruen'); }

// Keto/Low Carb/High Protein: [Name, per100, amount, Praeferenz, erwartet]
const P = (kcal, protein, carbs, fat) => ({ kcal, protein, carbs, fat });
const MAC = [
  ['Hähnchenbrust', P(110, 23, 0, 2), 150, 'Keto', 'gruen'], ['Brokkoli', P(34, 3, 5, 0.4), 200, 'Keto', 'gruen'],
  ['Möhre', P(36, 1, 7, 0.2), 100, 'Keto', 'gelb'], ['Apfel', P(52, 0.3, 14, 0.2), 150, 'Keto', 'rot'],
  ['Banane', P(89, 1, 20, 0.3), 120, 'Low Carb', 'gelb'], ['Brot', P(250, 9, 45, 3), 50, 'Low Carb', 'rot'],
  ['Kartoffeln (gekocht)', P(72, 2, 15, 0.1), 200, 'Low Carb', 'gelb'], ['Gurke', P(12, 0.6, 2, 0.1), 100, 'Low Carb', 'gruen'],
  ['Milch', P(64, 3.4, 4.8, 3.5), 200, 'Keto', 'gelb'], ['Milch', P(64, 3.4, 4.8, 3.5), 200, 'Low Carb', 'gruen'],
  ['Orangensaft', P(45, 0.7, 9, 0.2), 200, 'Low Carb', 'gelb'], ['Cola', P(42, 0, 10.6, 0), 330, 'Low Carb', 'rot'],
  ['Rucola', P(25, 2.6, 3.7, 0.7), 50, 'Keto', 'gruen'], ['Zucker', P(400, 0, 100, 0), 1, 'Keto', 'gruen'],
  ['Zimt', P(250, 4, 80, 1), 1, 'Keto', 'gruen'], ['Zimt', P(250, 4, 80, 1), 2, 'Keto', 'rot'], ['Zimt', P(250, 4, 80, 1), 2, 'Low Carb', 'gruen'],
  ['Honig', P(304, 0.3, 82, 0), 20, 'Low Carb', 'rot'],
  ['Magerquark', P(67, 12, 4, 0.2), 250, 'High Protein', 'gruen'], ['Linsen (gekocht)', P(116, 9, 20, 0.4), 150, 'High Protein', '-'],
  ['Spinat', P(23, 2.9, 3.6, 0.4), 100, 'High Protein', '-'], ['Mandeln', P(579, 21, 22, 50), 30, 'High Protein', '-'],
  ['Thunfisch (Dose)', P(116, 26, 0, 1), 80, 'High Protein', 'gruen'],
  // Getraenke ohne Gattungswort (Review v0.302): halbe Schwellen
  ['Krombacher Pils', P(42, 0.5, 3.1, 0), 500, 'Keto', 'gelb'], ['Fanta Orange', P(32, 0, 7.6, 0), 330, 'Low Carb', 'gelb'],
  ['Pepsi', P(44, 0, 11, 0), 330, 'Low Carb', 'rot'], ['Lipton Ice Tea', P(19, 0, 4.3, 0), 500, 'Keto', 'gelb'],
  ['Birnen in Rotwein', P(90, 0.4, 18, 0.1), 150, 'Low Carb', 'gelb'],
];
MAC.forEach(([n, per100, amount, p, want]) => {
  const r = A.rate('diet', n, { prefs: [p], per100, amount });
  const b = r && r.by.find((x) => x.p === p);
  const got = b ? b.ampel : (r && !r.open.includes(p) ? '-' : 'offen');
  if (got !== want) { dietFail++; console.log(`  x   ${n} (${p}): erwartet ${want}, bekommen ${got} ${b ? '(' + b.grund + ')' : ''}`); }
});
// Ohne plausible Naehrwerte bleiben Keto/Low Carb offen (kein falsches Gruen), High Protein ohne Punkt.
[undefined, P(0, 0, 0, 0), { kcal: 100 }].forEach((per100, i) => {
  const r = A.rate('diet', 'Unbekannt', { prefs: ['Keto', 'Low Carb', 'High Protein'], per100 });
  if (!r || !r.open.includes('Keto') || !r.open.includes('Low Carb') || r.open.includes('High Protein') || r.ampel) { dietFail++; console.log(`  x   unplausible Werte (${i}): ${JSON.stringify(r)}`); }
});
// Getraenk am Namen
const LIQ = [['Kaffee mit Milch', true], ['Hohes C Orange', true], ['Heiße Schokolade', true], ['Trinkschokolade', true],
  ['Kinderpunsch', true], ['Wodka/Korn (40%)', true], ['Thunfisch (Dose, Wasser)', false], ['Rinderbraten in Rotwein', false],
  ['Grießbrei mit Milch', false], ['Rotweinsauce', false], ['Rum-Rosinen-Eis', false], ['Kakao (Pulver)', false],
  ['Wassermelone', false], ['Rucola', false], ['Milchreis', false]];
LIQ.forEach(([n, want]) => { if (A.isLiquid(n) !== want) { dietFail++; console.log(`  x   isLiquid(${n}) soll ${want}`); } });
// Gemischt: lokal entschieden + offen fuer die KI; strengste Stufe, Gruende zusammengefasst.
{
  const r = A.rate('diet', 'Schweinebraten', { prefs: ['Vegetarisch', 'Vegan', 'Keto', 'Glutenfrei', 'histaminarm'], per100: P(300, 13, 2, 27), amount: 100 });
  if (!r || r.ampel !== 'rot' || r.grund !== 'Vegetarisch, Vegan: enthält Fleisch' || JSON.stringify(r.open) !== '["Glutenfrei","histaminarm"]') { dietFail++; console.log('  x   gemischt: ' + JSON.stringify(r)); }
  const g = A.rate('diet', 'Apfel', { prefs: ['Vegan', 'Glutenfrei'], per100: P(52, 0.3, 14, 0.2) });
  if (!g || g.ampel !== null || JSON.stringify(g.open) !== '["Glutenfrei","Vegan"]') { dietFail++; console.log('  x   offen: ' + JSON.stringify(g)); }
}
// combine: die strengere Stufe gewinnt, grau ueber gruen, Gleichstand nennt beide Gruende.
{
  const L = (ampel, grund) => ({ name: 'X', ampel, grund });
  const c1 = A.combine(L('rot', 'a'), L('gruen', 'b')), c2 = A.combine(L('gruen', 'a'), L('grau', 'b')), c3 = A.combine(L('gelb', 'a'), L('gelb', 'b'));
  if (c1.ampel !== 'rot' || c1.grund !== 'a' || c2.ampel !== 'grau' || c3.grund !== 'a · b' || c3.src !== 'rule+ai' || A.combine(null, L('gelb', 'b')).ampel !== 'gelb') { dietFail++; console.log('  x   combine'); }
  // KI ohne gueltige Stufe: lokales Rot bleibt, lokales Gruen ist unbestaetigt (null)
  if (A.combine(L('rot', 'a'), L('green', 'b')).ampel !== 'rot' || A.combine(L('gruen', 'a'), { name: 'X' }) !== null) { dietFail++; console.log('  x   combine ohne gueltige KI-Stufe'); }
}
fail += dietFail;

// Ueber alle DB-Namen: Vegetarisch/Vegan und die DB-Kategorien muessen zusammenpassen.
const cats = require(path.join(ROOT, 'tools/fooddb-usda.map.json'));
const catOf = Object.fromEntries(cats.map((c) => [c.n, c.cat]));
const count = { veg: { rot: 0, gelb: 0, '-': 0 }, vegan: { rot: 0, gelb: 0, '-': 0 } };
let catFail = 0;
window.DB.forEach((d) => {
  const r = A.rate('diet', d.n, { prefs: ['Vegetarisch', 'Vegan'] });
  const v = dietPick(r, 'Vegetarisch'), g = dietPick(r, 'Vegan');
  count.veg[v]++; count.vegan[g]++;
  const c = catOf[d.n];
  if (c === 'Fleisch, Wurst & Fisch' && v !== 'rot') { catFail++; console.log(`  x   DB ${d.n} (${c}): Vegetarisch ${v} statt rot`); }
  if ((c === 'Obst' || c === 'Gemüse') && (v !== '-' || g !== '-')) { catFail++; console.log(`  x   DB ${d.n} (${c}): ${v}/${g} statt ohne Treffer`); }
  if (process.argv.includes('--list') && (v !== '-' || g !== '-')) console.log(`      veg ${v.padEnd(4)} vegan ${g.padEnd(4)} ${d.n}`);
});
fail += catFail;
console.log(`  ok  Ernaehrung: ${VEG.length} Veg/Vegan-Faelle, ${MAC.length} Makro-Faelle; DB Vegetarisch ${count.veg.rot} rot/${count.veg.gelb} gelb/${count.veg['-']} offen, Vegan ${count.vegan.rot}/${count.vegan.gelb}/${count.vegan['-']}.`);

if (fail) { console.log(`\n${fail} Fehler.`); process.exit(1); }
console.log(`  ok  ${nursCases} feste Stillzeit-Faelle stimmen.`);
