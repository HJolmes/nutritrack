// @ts-check
// NutriTrack – Tausch-Tabelle des Kochbuchs (v0.318)
// Klassisches Script, kein Modul. Exportiert window.BOOK_SWAPS; angewendet von
// adaptRecipe() in js/calc.js, angezeigt von js/cookbook.js.
//
// Ein Rezept bleibt gespeichert, wie es ist. Diese Tabelle beschreibt nur, wie
// die Ansicht es fuer die Angaben im Profil umbaut (vegetarisch, schwanger …):
// Zutat fuer Zutat, die erste passende Zeile gewinnt, danach wird die neue
// Zutat noch einmal geprueft (vegan + glutenfrei: Sojasauce → Tamari).
//
// Felder einer Zeile:
//   k     Schluessel aus bookProfile(): veg, vegan, gf, lf, keto, lc, fish, preg, nurs
//   m     Suchmuster auf Name + Text der Zutat (klein, ä→ae, ö→oe, ü→ue, ß→ss)
//   x     Ausnahme: passt sie, gilt die Zeile nicht
//   fl    Merkmale der Grundrezepte (MorphCook): trifft eines, gilt die Zeile auch ohne m
//   dish  nur in Rezepten, deren Name hierauf passt (rohes Ei im Tiramisu)
//   to    Ersatz — Namen aus der Lebensmittel-Datenbank, der erste vorhandene zaehlt
//   n     angezeigter Name statt des Datenbanknamens; {n} = bisheriger Name
//   f     Mengenfaktor (Linsen statt Hack: halbe Menge, trocken)
//   keep  nur umbenennen, Naehrwerte bleiben (laktosefreie Milch)
//   rm    Zutat entfaellt
//   why   kurzer Grund fuer die Anzeige
// Jeder Ersatz in `to` muss in der Datenbank stehen — tools/test/calc.test.js prueft das.
(function(){
'use strict';
var MEAT_RED='rind|kalb|schwein|lamm|hammel|wild|reh|hirsch|steak|gulasch|braten|kotelett|schnitzel|filet|fleisch|leber|niere|kaninchen';
var POULTRY='haehnchen|huhn|huehner|gefluegel|pute|truthahn|(^| )ente|entenbrust|entenkeule|(^| )gans|chicken';
var FISH='lachs|kabeljau|seelachs|dorsch|forelle|zander|scholle|seezunge|hering|makrele|sardine|thunfisch|fisch|matjes|wolfsbarsch|dorade|pangasius|rotbarsch|karpfen|(^| )aal';
var SEAFOOD='garnele|shrimp|krabbe|scampi|hummer|languste|muschel|auster|tintenfisch|calamar|oktopus|meeresfruecht';
var NOODLE='nudel|spaghetti|pasta|penne|makkaroni|maccheroni|lasagne|fettuccine|tagliatelle|linguine|rigatoni|fusilli|farfalle|ramen|udon|mie|spaetzle';
var BREAD='brot|broetchen|toast|baguette|pita|fladenbrot|naan|wrap|ciabatta|sauerteig|croutons|tortilla';
var ALC='wein|sherry|(^| )sake|bier( |$)|cidre|(^| )sekt|champagner|prosecco|wermut|vermouth';
var SPIRIT='(^| )rum( |$)|rumaroma|likoer|amaretto|weinbrand|cognac|brandy|grand marnier|cointreau|kirschwasser|schnaps|wodka|whisk|(^| )gin( |$)|tequila|calvados|grappa|ouzo';

window.BOOK_SWAPS=[
  // ── Fisch in Saucen und Wuerzen (vegetarisch und Fischallergie) ──
  {k:['veg','fish'],m:'kimchi',keep:1,n:'Kimchi (ohne Fischsauce)',why:'klassisch mit Fischsauce angesetzt'},
  {k:['veg','fish'],m:'fischsauce|fish sauce|austernsauce',to:['Sojasauce'],why:'statt Fischsauce'},
  {k:['veg','fish'],m:'worcester',to:['Sojasauce'],why:'Worcestersauce enthält Sardellen'},
  {k:['veg','fish'],m:'sardelle|anchovi',to:['Kapern'],why:'Kapern statt Sardellen'},
  {k:['veg','fish'],m:'dashi',to:['Gemüsebrühe'],why:'Dashi wird mit Fisch gekocht'},
  {k:['veg','fish'],m:'bonito|katsuobushi',rm:1,why:'Fischflocken weglassen'},
  // ── Vegetarisch: Fleisch, Fisch, Bruehe, Gelatine ──
  {k:['veg'],m:'(huehner|rinder|fleisch|knochen|gefluegel|kalbs|wild|rind)(bruehe|fond|bouillon)|bruehe (huhn|rind)',to:['Gemüsebrühe'],why:'Gemüsebrühe statt Fleischbrühe'},
  {k:['veg'],m:'gelatine',to:['Agar-Agar'],f:0.5,why:'Agar-Agar statt Gelatine'},
  {k:['veg'],m:'speck|bacon|pancetta|guanciale|schinken|schweinebauch|bauchfleisch|salami|chorizo|wurst|mortadella|kassler|leberkaese',x:'leberwurst',to:['Tofu (fest)'],n:'Räuchertofu',why:'Räuchertofu statt Speck, Wurst oder Schinken'},
  {k:['veg'],m:'hack|faschiert|(^| )mett',x:'gehackt',to:['Rote Linsen (roh)'],f:0.5,why:'rote Linsen statt Hackfleisch (halbe Menge, trocken)'},
  {k:['veg'],m:'thunfisch',to:['Kichererbsen (gekocht)'],why:'Kichererbsen statt Thunfisch'},
  {k:['veg'],m:FISH+'|'+SEAFOOD,x:'fischsauce|kapern|austernpilz|nudel',fl:['fish','shellfish'],to:['Tofu (fest)'],why:'Tofu statt Fisch'},
  {k:['veg'],m:POULTRY,x:'bruehe|fond',fl:['poultry'],to:['Tofu (fest)'],why:'Tofu statt Geflügel'},
  {k:['veg'],m:MEAT_RED,x:'frucht|bruehe|fond|tomate|tamarind|rinde( |$)',fl:['beef','pork','lamb'],to:['Kräuterseitlinge'],why:'Kräuterseitlinge statt Fleisch'},
  // ── Vegan: Milch, Ei, Honig, Kaese, Butter ──
  {k:['vegan'],m:'honig',to:['Ahornsirup'],fl:['honey'],why:'Ahornsirup statt Honig'},
  {k:['vegan'],m:'mayo',keep:1,n:'vegane Mayonnaise',why:'Mayonnaise enthält Ei'},
  {k:['vegan'],m:'eiernudel',to:['Nudeln (roh)'],why:'Hartweizennudeln ohne Ei'},
  {k:['vegan'],m:'(^| )(ei|eier|eigelb|eiweiss)( |$)',dish:'omelett|ruehrei|shakshuka|frittata|quiche|huevos|eggs|french toast|arme ritter',to:['Tofu (fest)'],why:'Tofu statt Ei'},
  {k:['vegan'],m:'(^| )(ei|eier|eigelb|eiweiss)( |$)',fl:['egg'],x:'mayo|nudel|biskuit|teig',to:['Leinsamen'],f:0.15,why:'je Ei 1 EL Leinsamen mit 3 EL Wasser'},
  {k:['vegan'],m:'milch',x:'kokos|hafer|soja|mandel|reis|erbsen|cashew|milchreis|milchschokolade|vollmilchschokolade',to:['Hafermilch'],why:'Hafermilch statt Milch'},
  {k:['vegan'],m:'schlagsahne|kochsahne|(^| )sahne',x:'saure|kokos|hafer|soja|vegan',to:['Kokosmilch'],why:'Kokosmilch statt Sahne'},
  {k:['vegan'],m:'schmand|saure sahne|sauerrahm|creme fraiche|joghurt|quark|skyr',x:'soja|kokos|vegan',to:['Sojajoghurt'],why:'Sojajoghurt statt Milchprodukt'},
  {k:['vegan'],m:'ghee|butterschmalz',to:['Kokosöl'],why:'Kokosöl statt Butterfett'},
  {k:['vegan'],m:'butter',x:'erdnuss|mandel|cashew|kakao|vegan|margarine|keks|buttermilch|nuss|sonnenblumen|teig|blaetter',to:['Margarine'],n:'Margarine (vegan)',why:'pflanzliche Margarine statt Butter'},
  {k:['vegan'],m:'parmesan|grana|pecorino|hartkaese',to:['Cashewkerne'],f:0.7,n:'Cashewkerne, gemahlen',why:'gemahlene Cashews statt Parmesan'},
  {k:['vegan'],m:'feta|paneer|queso|halloumi|ricotta|huettenkaese|tofu feta',x:'vegan',to:['Tofu (fest)'],why:'Tofu statt Käse'},
  {k:['vegan'],m:'frischkaese|mascarpone|doppelrahm',keep:1,n:'veganer Frischkäse',why:'Nährwerte vom Original übernommen'},
  {k:['vegan'],m:'kaese|mozzarella|cheddar|gouda|emmentaler|bergkaese|edamer|raclette',x:'vegan',keep:1,n:'veganer Käse',why:'Nährwerte vom Original übernommen'},
  {k:['vegan'],m:'vollmilchschokolade|milchschokolade|weisse schokolade',to:['Zartbitterschokolade'],why:'Zartbitter ohne Milch'},
  {k:['vegan'],m:'loeffelbiskuit',keep:1,n:'vegane Löffelbiskuits',why:'enthalten Ei'},
  {k:['vegan'],m:'blaetterteig|croissant|brioche',x:'vegan',keep:1,n:'{n} (vegan)',why:'gibt es mit Margarine statt Butter'},
  // ── Keto und Low Carb (vor glutenfrei: Zucchini ist beides) ──
  {k:['keto','lc'],m:'reisnudel|glasnudel|'+NOODLE,x:'zucchini|konjak|shirataki',to:['Zucchini'],f:2.5,n:'Zucchini (als Nudeln)',why:'Zucchini-Nudeln statt Pasta'},
  {k:['keto','lc'],m:'(^| )reis|basmati|jasmin|risotto|sushireis|rundkornreis',x:'reisessig|reismehl|reiswein|blumenkohl',to:['Blumenkohl'],f:3,n:'Blumenkohl (als Reis)',why:'Blumenkohlreis statt Reis'},
  {k:['keto','lc'],m:'couscous|bulgur|quinoa|graupen',to:['Blumenkohl'],f:3,n:'Blumenkohl (fein gehackt)',why:'statt Getreide'},
  {k:['keto','lc'],m:'kartoffel|gnocchi',x:'mehl|staerke|chips',to:['Blumenkohl'],why:'Blumenkohl statt Kartoffeln'},
  {k:['keto','lc'],m:'paniermehl|semmelbroesel|panko',to:['Mandeln (blanchiert)'],n:'gemahlene Mandeln',why:'statt Semmelbrösel'},
  {k:['keto','lc'],m:'mehl|staerke',x:'mandel|kokos',to:['Mandeln (blanchiert)'],n:'Mandelmehl',why:'Mandelmehl statt Mehl'},
  {k:['keto','lc'],m:BREAD,x:'salat',to:['Romanasalat'],f:0.5,n:'Salatblätter (statt Brot)',why:'im Salatblatt statt im Brot'},
  {k:['keto','lc'],m:'haferflocken|muesli|granola',to:['Chiasamen'],f:0.5,why:'Chiasamen statt Haferflocken'},
  {k:['keto','lc'],m:'zucker|sirup|honig|agave',x:'zuckerschote|zuckermais',rm:1,why:'nach Geschmack mit Süßstoff süßen'},
  // ── Glutenfrei ──
  {k:['gf'],m:'(weizen|dinkel|roggen|vollkorn|gersten)mehl|(^| )mehl|type 405|type 550',x:'reismehl|mandel|kichererbsen|buchweizen|mais|kartoffel|glutenfrei',to:['Reismehl'],why:'Reismehl statt Weizenmehl'},
  {k:['gf'],m:NOODLE,x:'glutenfrei|zucchini|reisnudel',to:['Glutenfreie Nudeln (roh)'],why:'glutenfreie Pasta'},
  {k:['gf'],m:'paniermehl|semmelbroesel|panko',x:'glutenfrei',to:['Maisgrieß (roh)'],why:'Maisgrieß statt Semmelbrösel'},
  {k:['gf'],m:'couscous|bulgur|graupen|dinkel|freekeh',to:['Quinoa (roh)'],why:'Quinoa statt Weizen'},
  {k:['gf'],m:'griess',x:'mais',to:['Maisgrieß (roh)'],why:'Maisgrieß statt Weizengrieß'},
  {k:['gf'],m:'sojasauce|shoyu',x:'tamari',to:['Tamari'],why:'Tamari ist glutenfrei'},
  {k:['gf'],m:'seitan',to:['Tofu (fest)'],why:'Seitan ist Weizeneiweiß'},
  {k:['gf'],m:'tortilla|wrap',x:'mais',to:['Mais-Tortilla'],why:'Mais-Tortillas statt Weizen'},
  {k:['gf'],m:'teigblaetter|wan tan|filoteig|blaetterteig|loeffelbiskuit|keks|croissant|haferflocken',x:'glutenfrei',keep:1,n:'{n} (glutenfrei)',why:'glutenfreie Variante kaufen'},
  {k:['gf'],m:BREAD,x:'glutenfrei|mais',to:['Glutenfreies Brot'],why:'glutenfreies Brot'},
  {k:['gf'],m:'bier( |$)',x:'glutenfrei',keep:1,n:'glutenfreies Bier',why:'Bier enthält Gerste'},
  // ── Laktosefrei ──
  {k:['lf'],m:'milch',x:'kokos|hafer|soja|mandel|reis|erbsen|cashew|laktosefrei|milchreis|schokolade|buttermilch',keep:1,n:'laktosefreie Milch',why:'gleiche Nährwerte'},
  {k:['lf'],m:'schlagsahne|kochsahne|(^| )sahne',x:'saure|kokos|hafer|soja|laktosefrei',keep:1,n:'laktosefreie Sahne',why:'gleiche Nährwerte'},
  {k:['lf'],m:'schmand|saure sahne|sauerrahm|creme fraiche|joghurt|quark|skyr|frischkaese|mascarpone|ricotta|huettenkaese|mozzarella|doppelrahm',x:'laktosefrei|soja|kokos',keep:1,n:'{n} (laktosefrei)',why:'laktosefreie Variante kaufen'},
  {k:['lf'],m:'vollmilchschokolade|milchschokolade|weisse schokolade',to:['Zartbitterschokolade'],why:'Zartbitter mit wenig Milch'},
  // ── Schwangerschaft und Stillzeit: Alkohol ──
  {k:['preg','nurs'],m:'mirin|marsala|portwein|dessertwein|suesswein',to:['Apfelsaft'],why:'Saft statt Alkohol – er verkocht nicht vollständig'},
  {k:['preg','nurs'],m:SPIRIT,x:'rumpsteak|ingwer|gingko|eierlikoer kuchen',rm:1,why:'Alkohol weglassen (alkoholfreies Aroma geht)'},
  {k:['preg','nurs'],m:ALC,x:'weinessig|weinstein|weintraube|wein traube|schwein|alkoholfrei|bierhefe',fl:['alcohol'],to:['Gemüsebrühe'],why:'Brühe statt Alkohol – er verkocht nicht vollständig'},
  // ── Schwangerschaft: Listerien, Toxoplasmen, Vitamin A ──
  {k:['preg'],m:'leber',rm:1,why:'Leber: zu viel Vitamin A'},
  {k:['preg'],m:'rohschinken|parmaschinken|serrano|bresaola|salami|(^| )mett|chorizo|landjaeger|teewurst|rohwurst|coppa',to:['Schinken (gekocht)'],why:'Rohwurst und Rohschinken: Listerien, Toxoplasmose'},
  {k:['preg'],m:'raeucherlachs|graved|matjes|raeucherfisch|geraeuchert',x:'paprika',to:['Lachs (gegart)'],why:'roher oder kalt geräucherter Fisch: Listerien'},
  {k:['preg'],dish:'sushi|maki|poke|ceviche|tatar|carpaccio|tartar',m:FISH+'|'+SEAFOOD,x:'dose|gegart|gekocht',to:['Lachs (gegart)'],why:'roher Fisch – nur durchgegart'},
  {k:['preg'],dish:'tiramisu|carbonara|mousse|aioli|zabaione|zabaglione|mayonnaise|eierlikoer',m:'(^| )(ei|eier|eigelb|eiweiss)( |$)',x:'pasteurisiert',keep:1,n:'Ei (pasteurisiert)',why:'rohes oder kaum gestocktes Ei'},
  {k:['preg'],m:'rohmilch|brie|camembert|gorgonzola|roquefort|weichkaese|feta|ziegenkaese|blauschimmel',x:'pasteurisiert',keep:1,n:'{n} (aus pasteurisierter Milch)',why:'Listerien'},
  {k:['preg'],m:'sprossen|keimling',x:'gegart',keep:1,n:'{n} (nur gegart)',why:'rohe Sprossen tragen oft Keime'},
  // ── Fischallergie (ohne vegetarisch) ──
  {k:['fish'],m:'thunfisch',to:['Hähnchenbrust (roh)'],why:'Hähnchen statt Thunfisch'},
  {k:['fish'],m:FISH,x:'fischsauce|kapern',fl:['fish'],to:['Hähnchenbrust (roh)'],why:'Hähnchen statt Fisch'},
  // ── Merkmale der Grundrezepte, die kein Name verraten hat ──
  {k:['vegan'],fl:['dairy'],x:'vegan',keep:1,n:'{n} (vegan)',why:'pflanzliche Variante kaufen'},
  {k:['vegan'],fl:['egg'],x:'ohne ei',keep:1,n:'{n} (ohne Ei)',why:'Variante ohne Ei kaufen'},
  {k:['gf'],fl:['gluten'],x:'glutenfrei',keep:1,n:'{n} (glutenfrei)',why:'glutenfreie Variante kaufen'},
  {k:['lf'],fl:['dairy'],x:'laktosefrei|butter|ghee|parmesan|pecorino|grana|bergkaese|cheddar|gouda|emmentaler|hartkaese',keep:1,n:'{n} (laktosefrei)',why:'laktosefreie Variante kaufen'}
];
})();
