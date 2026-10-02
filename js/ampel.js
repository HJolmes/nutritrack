// @ts-check
// NutriTrack – Ampel-Tabellen: Stillzeit (#205) und Ernaehrung (#262)
// Klassisches Script, kein Modul. Exportiert window.NTAmpel; greift auf nichts
// Globales zu und laeuft deshalb auch unter node (tools/ampel-test.js).
//
// ── Stillzeit ──
// Warum eine Tabelle statt der KI: Die Stillzeit-Regeln standen bis v0.277
// vollstaendig im Prompt von checkNursWarn() – die KI hat nur noch Namen den
// Regeln zugeordnet. Das kostete je Eintrag einen Aufruf, lief offline gar
// nicht und war nicht reproduzierbar. Der Prompt lautete (woertlich):
//
//   'WICHTIG: In der Stillzeit gelten NICHT die Schwangerschaftsregeln.
//    Rohmilchkäse, Sushi, rohes/kurzgebratenes Fleisch, Salami und rohe Eier
//    sind beim Stillen gruen.'
//   'Relevant sind nur: Alkohol (rot), Koffein über ca. 300 mg/Tag (gelb),
//    quecksilberreiche Fische wie Thunfisch, Schwertfisch, Hai, Königsmakrele
//    (gelb), Leber wegen Vitamin A (gelb), Salbei/Pfefferminze/Petersilie in
//    Heilmengen (gelb, milchhemmend).'
//   'Warne NICHT vor blähenden Lebensmitteln (Kohl, Zwiebeln, Hülsenfrüchte) –
//    dafür gibt es keine Evidenz.'
//
// Fuenf Zeilen stammen aus diesem Prompt. Zwei kamen mit der Entscheidung des
// Menschen vom 2026-10-01 (#262) dazu: Leberkaese gelb (je nach Sorte mit
// Leber) und Alkohol in Speisen gelb (Tiramisu, Rumkugeln … – breit nach dem
// Namen; Speisen, die schon vorher rot waren, wie Rotweinsauce, bleiben rot).
// Bewusst OHNE Koffein-Hinweis bleiben „Tee“ ohne Angabe, Eistee, Chai und
// Kakao (Entscheidung #262), auch wenn Chai und Eistee meist Schwarztee sind.
// Wegen „Relevant sind nur" ist alles andere gruen (NOHIT). Zwei Regeln haengen
// an der Menge, die Ampel kennt aber nur Namen:
//   - Koffein: jedes koffeinhaltige Getraenk wird gelb, mit dem Hinweis auf die
//     Tagesmenge statt einer Warnung.
//   - Salbei/Pfefferminze/Petersilie: nur als Tee (die Form, in der Heilmengen
//     zusammenkommen); als Gewuerz gruen.
//
// ── Ernaehrung (#262) ──
// Lokal entschieden werden nur die Praeferenzen, deren Regeln der Mensch am
// 2026-10-02 freigegeben hat (DIET_LOCAL); Glutenfrei, Laktosefrei und Freitext
// bleiben bei der KI. Vegetarisch/Vegan: Schluesselwoerter fuer Rot und Gelb;
// ein Name ohne Treffer bleibt offen (KI) – die Tabelle sagt nie Gruen. Keto
// und Low Carb: Schwellen fuer Kohlenhydrate je 100 g (Getraenke halbe Werte),
// eine Portion mit hoechstens 1 bzw. 2 g KH ist gruen; ohne plausible
// Naehrwerte offen. High Protein: nur Gruen („proteinreich“: mindestens 20 %
// der Energie aus Eiweiss wie bei „hoher Proteingehalt“ nach VO (EG) 1924/2006
// und mindestens 10 g je 100 g), sonst kein Punkt, nie Gelb oder Rot.
// Die Kohlenhydrate sind die gespeicherten; Eintraege der Basis-DB fuehren bei
// ballaststoffreichen Lebensmitteln (Nuesse, Avocado) Gesamt-KH und fallen
// deshalb eher zu streng aus (bei der Freigabe so benannt).
//
// Der Abgleich ist absichtlich eng. Ein Schluesselwort trifft je nach Art nur
// ein ganzes Wort (w), einen Wortanfang (p), ein Wortende (e), irgendwo im Wort
// (c) oder eine Wortfolge (ph). Einfache Teilstrings wuerden „Schweineschnitzel"
// (wein), „Rumpsteak" (rum), „Aubergine" (gin), „Rucola" (cola), „Tomate"
// (mate) oder „Teewurst" (tee) treffen. „not" nimmt ein Wort, das einen der
// Teile enthaelt, fuer diese Regel aus, „notPre" ein Wort, das mit einem der
// Teile beginnt und laenger ist („Hafermilch“, „Tofuwurst“); „skip" (Wortanfang),
// „skipPh" (Wortfolge) und „skipEnd" (Wortende) nehmen den ganzen Namen aus
// („alkoholfreies Bier", „Bier ohne Alkohol", „Grog-Torte").
(function(){
'use strict';

// Pflanzliche Bestimmungswoerter: „Sojawurst“, „Linsenbolognese“, „Tofu Burger“.
var PLANT=['soja','tofu','seitan','lupine','gemuese','linsen','bohnen','erbsen','kichererbsen','pilz','champignon',
  'portobello','sellerie','blumenkohl','kohlrabi','zucchini','aubergine','jackfruit','gruenkern','falafel','halloumi',
  'nuss','erdnuss','kakao','shea','mandel','cashew','haselnuss','sesam','sonnenblumen','kokos','hafer','reis','dinkel',
  'hanf','pflanzen','quinoa','hirse','kartoffel','kuerbis','spinat','spargel','bete','vegan','veggie','avocado',
  'mercimek','peanut','pistazie','macadamia','kuerbiskern'];
var SKIP_VEG=['vegan','vegetar','veggie','fleischlos','fleischfrei','fleischersatz','pflanzlich'];
var SKIP_VEGAN=['vegan','pflanzlich'];
// Milchwoerter, die mit pflanzlichem Wort davor keine Milch sind („Hafer Milch“).
var DAIRY=['milch','sahne','joghurt','jogurt','quark','kaese','butter','pudding','creme'];
var EGG=['ei','eier','ruehrei','omelett','omelette','eiweiss'];
// Kopfwoerter, die ein vorangehendes Wort nur naeher bestimmen („Austern-Pilze“,
// „Burger Brötchen“, „Joghurt-Alternative“): beide werden ein Wort, damit die
// not-Eintraege der Zeilen (austernpilz, burgerbroetchen, alternativ) greifen.
var NEUTRAL=['pilz','seitling','nudel','tee','kraut','kraeuter','beere','gewuerz','sauce','sosse','senf','pfeffer',
  'marinade','dip','bun','broetchen','brot','alternativ','ersatz','platte','blaett','melone','pomelo','tomate'];
// Gerichtwoerter: ohne pflanzliches Bestimmungswort meist Fleisch.
var DISH={w:['braten','burger','hack','schnitzel','steak','wurst','gulasch','bolognese','frikassee','geschnetzeltes',
    'aufschnitt','nuggets','filet','roulade','gyros','doener','kebab','kebap','hotdog','koefte','kofte','souvlaki',
    'stroganoff','tatar'],
  e:['braten','burger','burgern','hack','schnitzel','steak','steaks','wurst','gulasch','bolognese','frikassee',
    'geschnetzeltes','aufschnitt','filet','filets','roulade','rouladen','nuggets','gyros','doener','kebab','kebap'],
  c:['wurst','wuerst','gulasch','bolognese','geschnetzelte','frikassee','frikadelle','bulette','boulette','klops',
    'koettbullar','hackbraten','hackfleisch','hackbaellchen','fleischbaellchen','fleischpflanzerl','schaschlik',
    'cevapcici','cevapi']};

/** @typedef {{cat:string, ampel:string, grund:string, w?:string[], p?:string[], e?:string[], c?:string[],
 *   ph?:string[], not?:string[], notPre?:string[], skip?:string[], skipPh?:string[], skipName?:string[],
 *   skipEnd?:string[], tea?:string[], inFood?:{w:string[], c:string[], end:string[]}}} AmpelRule */
/** @type {{nurs:AmpelRule[], veg:AmpelRule[], vegan:AmpelRule[]}} */
var RULES={
  nurs:[
    {cat:'alkohol',ampel:'rot',grund:'Alkohol – in der Stillzeit meiden',
      w:['sekt','prosecco','champagner','whisky','whiskey','wodka','vodka','gin','rum','tequila','cognac',
         'weinbrand','grappa','ouzo','aperol','campari','cidre','cider','sherry','alkohol','doppelkorn',
         'kornbrand','weinschorle','federweisser','spritz','sangria','pils','koelsch','amaretto',
         'pilsner','pilsener','hefeweizen','kristallweizen','alster','alsterwasser','martini','wermut',
         'mojito','caipirinha','hugo','baileys','jaegermeister','absinth','lillet','limoncello'],
      p:['rotwein','weisswein','rosewein'],
      e:['wein','bier','bowle'],
      c:['likoer','schnaps','radler'],
      not:['schwein','essig','malzbier'],
      skip:['alkoholfrei','alkfrei'],skipPh:['ohne alkohol']},
    // Entscheidung #262: Getraenke, die bis v0.301 gruen waren – als Getraenk rot,
    // in einer Speise („Kirschwassertorte“, „Grog-Kuchen“) gelb (Zeile darunter).
    {cat:'alkohol_getraenk',ampel:'rot',grund:'alkoholisches Getränk – in der Stillzeit meiden',
      w:['grog','punsch'],
      c:['kirschwasser','rumpunsch'],
      not:['kinderpunsch','fruechtepunsch'],
      skip:['alkoholfrei','alkfrei'],skipPh:['ohne alkohol','kinder punsch','fruechte punsch'],
      skipEnd:['torte','kuchen','creme','sauce','sosse','eis','praline','pralinen','pudding','suppe','braten','kugel','kugeln']},
    // Entscheidung #262: Alkohol in Speisen gelb statt gruen.
    {cat:'alkohol_speise',ampel:'gelb',grund:'kann Alkohol enthalten – in Maßen',
      c:['tiramis','rumkugel','rumtopf','rumrosine','weincreme','weinschaum','zabaione','sabaione','sabayon',
         'weinbrandbohne','biersuppe','bierbraten','biersosse','biersauce','cognacsosse','cognacsauce',
         'schwarzwaelderkirsch','savarin','kirschwassertorte','kirschwasserkuchen','grogtorte','punschtorte',
         'punschkuchen','punschkrapfen'],
      ph:['coq au vin','mon cheri','baba au rhum','schwarzwaelder kirschtorte','schwarzwaelder kirsch','schwarzwaelder torte'],
      // „Grog-Torte“, „Punsch Kuchen“: Getraenkewort und Speise als getrennte Woerter
      inFood:{w:['grog','punsch'],c:['kirschwasser','rumpunsch'],
        end:['torte','kuchen','creme','sauce','sosse','eis','praline','pralinen','pudding','suppe','braten','kugel','kugeln']},
      skip:['alkoholfrei','alkfrei'],skipPh:['ohne alkohol']},
    {cat:'koffein',ampel:'gelb',grund:'Menge im Blick behalten (ca. 300 mg Koffein pro Tag)',
      w:['kaffee','caffe','americano','mokka','lungo','ristretto','cola','pepsi','spezi','energydrink',
         'mate','matetee','schwarztee','gruentee','darjeeling','assam','sencha'],
      p:['kaffeegetraenk'],
      e:['kaffee','cola'],
      c:['espresso','cappuccino','macchiato','frappuccino','matcha'],
      ph:['flat white','cafe au lait','cafe crema','cold brew','mezzo mix','energy drink','red bull',
          'schwarzer tee','gruener tee','tee schwarz','tee gruen','earl grey','monster energy'],
      not:['rucola','kaffeesahne','kaffeeweiss'],
      skip:['koffeinfrei','entkoffeiniert']},
    {cat:'fisch',ampel:'gelb',grund:'quecksilberreicher Fisch – in Maßen',
      w:['tuna','tonno','hai','dornhai','blauhai','heringshai'],
      p:['schillerlocke'],
      c:['thunfisch','schwertfisch','haifisch','koenigsmakrele']},
    {cat:'leber',ampel:'gelb',grund:'Leber – viel Vitamin A',
      c:['leber'],
      ph:['foie gras'],
      not:['leberka']},
    // Entscheidung #262: Leberkaese gelb statt gruen (eigene Zeile, damit er
    // nicht den Grund der Leber-Zeile bekommt).
    {cat:'leberkaese',ampel:'gelb',grund:'je nach Sorte mit Leber (Vitamin A)',
      c:['leberka']},
    {cat:'kraeuter',ampel:'gelb',grund:'als Tee in Heilmengen milchhemmend',
      tea:['salbei','pfefferminz','petersili']}
  ],
  // Vegetarisch: Fleisch, Fisch, Gelatine, tierisches Lab. Vegan prueft diese
  // Zeilen UND die Zeilen unter „vegan“ (strengste Stufe gewinnt).
  veg:[
    {cat:'fleisch',ampel:'rot',grund:'enthält Fleisch',
      w:['ente','gans','reh','ham','beef','mett','speck','rind','wild','pork','ribs','rib','tatar','boeuf','sucuk',
         'lahmacun','presskopf','pinkel','cabanossi','kabanossi','lyoner','bifteki'],
      p:['lamm','pute','puter','enten','gaense','ochsen','zunge','mett'],
      e:['lamm','ente','gans','huhn','beef','rind','mett','pork','ribs'],
      c:['fleisch','rinder','rindfleisch','rinds','schwein','kalb','haehnchen','huehnchen','huehner','hendl','chicken',
         'truthahn','hirsch','kaninchen','wachtel','fasan','strauss','pferdefleisch','ziegenfleisch','zicklein','hammel',
         'schaffleisch','hasenbraten','hasenkeule','hasenruecken','rehkeule','rehbraten','rehgulasch','rehragout',
         'wildgulasch','wildbraten','wildfond','wildragout','gefluegel','entrecote','ribeye','vitello','saumagen',
         'pljeskavica','krainer','salami','schinken','speck','bacon','prosciutto','serrano',
         'pancetta','guanciale','chorizo','pastrami','mortadella','cervelat','kabanos','landjaeger','leber','nieren',
         'kutteln','innereien','blutwurst','corned','roastbeef','kassler','kasseler','eisbein','haxe','hachse',
         'kotelett','tafelspitz','saltimbocca','ossobuco','carbonara','labskaus'],
      ph:['cordon bleu','con carne','foie gras','pulled pork','spare ribs','strammer max','toast hawaii','pizza hawaii'],
      not:['fleischtomate','fruchtfleisch','kokosfleisch','kokosnussfleisch','schweineohr','schweinsohr','gluecksschwein',
           'marzipanschwein','ochsenherz','gebraten','huehnerei','wachtelei','blutorange','nierenbohne','schokosalami',
           'schokoladensalami','gaensebluemchen','leberbluemchen','dente','hirschhorn','wachtelbohne','kleber',
           'serranochili','serranoschote','straussenei','nierentee','element','ferment','kraeuterstrauss',
           'kuerbisfleisch','gewuerz','marinade','blasentee'],
      notPre:PLANT,
      skip:SKIP_VEG,skipPh:['serrano chili','serrano schote','nieren und blasentee']},
    {cat:'fisch',ampel:'rot',grund:'enthält Fisch oder Meeresfrüchte',
      w:['hai','aal','tuna','tonno','pulpo','skrei','stoer','dashi','nigiri'],
      p:['wels'],
      e:['aal','wels'],
      c:['fisch','lachs','hering','matjes','makrele','sardine','sardelle','anchovi','forelle','kabeljau','dorsch',
         'zander','barsch','scholle','seezunge','heilbutt','karpfen','hecht','pangasius','tilapia','dorade','sprotte',
         'saibling','rotbarbe','surimi','kaviar','garnele','shrimp','scampi','krabbe','krebs','hummer','languste',
         'langustine','muschel','auster','tintenfisch','kalmar','calamar','oktopus','krake','sepia','meeresfruechte',
         'rollmops','worcester','gambas','sashimi','steinbutt','seeteufel','schillerlocke','flunder','bouillabaisse','bonito'],
      ph:['frutti di mare'],
      not:['austernpilz','austernseitling','muschelnudel','auberginenkaviar','linsenkaviar','tomatenkaviar','welsch',
           'gewuerz','marinade'],
      notPre:PLANT,
      skip:SKIP_VEG},
    {cat:'gelatine',ampel:'rot',grund:'enthält Gelatine oder tierisches Fett',
      c:['gelatine','gummibaer','marshmallow','aspik','suelze','schmalz','grieben','talg'],
      not:['butterschmalz','pflanzenschmalz','kokosschmalz'],
      skip:SKIP_VEG},
    // Gerichtwoerter: Rot, ausser ein pflanzliches Bestimmungswort steht davor
    // (im Wort oder als direkt vorangehendes Wort, siehe _dietSections).
    {cat:'gericht',ampel:'rot',grund:'meist mit Fleisch',
      w:DISH.w,e:DISH.e,c:DISH.c,
      not:PLANT.concat(['burgerbroetchen','burgerbrot','burgersauce','burgersosse','biskuitroulade','schokoroulade',
        'sahneroulade','erdbeerroulade','obstroulade','zitronenroulade','orangenfilet','mandarinenfilet',
        'grapefruitfilet','bratapfel','gebraten','limburger','kaese','sauce','sosse','senf','gewuerz','pfeffer',
        'marinade','dip','buns','burgerbroetchen','hamburgerbroetchen','burgerbun','doenerbrot','hotdogbroetchen']),
      skip:SKIP_VEG},
    // VSMK 2016: Lab ist ein Verarbeitungshilfsstoff; „Parmesan“ ist nach EuGH
    // C-132/05 Parmigiano Reggiano, Gorgonzola g.U. wird mit Kaelberlab gemacht.
    {cat:'lab',ampel:'rot',grund:'Käse mit tierischem Lab',
      c:['parmesan','parmigiano','gorgonzola'],
      ph:['grana padano','pecorino romano'],
      skip:SKIP_VEG},
    {cat:'unsicher',ampel:'gelb',grund:'oft mit Fleisch, Fisch oder tierischem Lab',
      w:['bruehe','fond','bouillon','lasagne','ravioli','tortellini','tortelloni','cannelloni','burrito','sushi','paella',
         'quiche','flammkuchen','caesar','pannacotta','grana','pecorino','gruyere','comte','roquefort','carpaccio','ramen','pho','poke'],
      c:['pesto','maultasche','fruehlingsrolle','bratensauce','bratensosse','bratensaft','fruchtgummi','weingummi',
         'linsensuppe','erbsensuppe','eintopf','kraftbruehe','knochenbruehe','bruehwuerfel','goetterspeise','wackelpudding'],
      ph:['panna cotta'],
      not:['gemuesebruehe','gemuesefond','pilzfond','gemuesebouillon','gemueselasagne','spinatlasagne','gemuesemaultasche',
           'gemueseeintopf'],
      skip:SKIP_VEG}
  ],
  vegan:[
    {cat:'milch',ampel:'rot',grund:'enthält Milch oder Milchprodukte',
      w:['milk','skyr','kefir','ayran','lassi','schmand','ghee','rahm','feta','brie','cheese','whey','nutella','margherita',
         'topfen','obatzda','obazda','leerdammer','maasdamer','comte'],
      p:['rahm'],
      e:['rahm'],
      c:['milch','kaese','quark','joghurt','jogurt','yoghurt','yogurt','sahne','butter','molke','kasein','casein',
         'cremefraiche','gouda','edamer','emmentaler','gruyere','appenzeller','tilsiter','parmesan','parmigiano','pecorino',
         'mozzarella','burrata','ricotta','mascarpone','halloumi','camembert','gorgonzola','roquefort','cheddar','raclette',
         'harzer','handkaes','limburger','romadur','provolone','manchego','paneer','labneh','griessbrei','milchreis',
         'eiscreme','pesto','lasagne','tiramisu','pannacotta','kaesspatzen','kasspatzen'],
      ph:['creme fraiche','saure sahne','weisse schokolade','panna cotta','grana padano'],
      not:['hafermilch','sojamilch','mandelmilch','reismilch','kokosmilch','kokosnussmilch','dinkelmilch','cashewmilch',
           'haselnussmilch','erbsenmilch','hanfmilch','lupinenmilch','pflanzenmilch','nussmilch','milchdistel',
           'erdnussbutter','kakaobutter','sheabutter','mandelbutter','cashewbutter','nussbutter','kokosbutter',
           'haselnussbutter','sesambutter','pflanzenbutter','butternuss','butterbohne','butterpilz','buttersalat',
           'butterkopf','butterbirne','sojasahne','hafersahne','kokossahne','pflanzensahne','sojajoghurt','haferjoghurt',
           'kokosjoghurt','mandeljoghurt','lupinenjoghurt','sojaquark','cashewkaese','pflanzenkaese','hefeschmelz',
           'wasserkefir','kokosrahm','sojapudding','milchsaeure','milchsauer','butternut','peanutbutter','apfelbutter',
           'lasagneplatte','lasagneblaett','lasagnenudel','alternativ','ersatz'],
      notPre:PLANT,
      skip:SKIP_VEGAN},
    {cat:'milchgetraenk',ampel:'rot',grund:'Kaffee- oder Kakaogetränk mit Milch',
      w:['latte','cappuccino','macchiato','milchkaffee','eiskaffee','kakaogetraenk'],
      c:['cappuccino','macchiato','milchkaffee','eiskaffee','kakaogetraenk'],
      ph:['flat white','chai latte','cafe au lait'],
      // „Cappuccino mit Hafermilch“: die Pflanzenmilch steht im zweiten Abschnitt,
      // skipName prueft deshalb den ganzen Namen.
      skip:SKIP_VEGAN,skipName:['hafer','soja','mandel','reis','kokos','dinkel','cashew','erbsen','pflanz']},
    {cat:'ei',ampel:'rot',grund:'enthält Ei',
      w:['ei','eier','eiweiss','mayo','omelett','omelette'],
      p:['eier','eigelb','eidotter','eiklar'],
      e:['eier'],
      c:['ruehrei','spiegelei','huehnerei','wachtelei','fruehstuecksei','freilandei','bioei','eigelb','eidotter','eiklar',
         'mayonnaise','remoulade','aioli','hollandaise','bearnaise','baiser','meringue','omelett','eierlikoer','eiernudel',
         'eierkuchen','pfannkuchen','spaetzle','carbonara','tiramisu','biskuit','kaiserschmarrn','frittata','shakshuka',
         'zabaione','windbeutel'],
      not:['eierschwammerl','eierschwamm','eiertomate','eierfrucht','eierpflaume','eiersatz','ersatz'],
      notPre:PLANT,
      skip:SKIP_VEGAN},
    {cat:'honig',ampel:'rot',grund:'enthält Honig',
      w:['honey','propolis','met'],
      c:['honig','bienenwachs'],
      ph:['gelee royale'],
      not:['honigmelone','honigpomelo','honigtomate'],
      skip:SKIP_VEGAN},
    {cat:'unsicher',ampel:'gelb',grund:'enthält oft Milch, Ei oder Honig',
      w:['eis','waffel','waffeln','crepe','donut','muffin','croissant','brioche','berliner','krapfen','pizza','naan'],
      e:['eis','kuchen','torte','keks','kekse','plaetzchen','gebaeck','teilchen','stollen'],
      c:['veggie','vegetarisch','schokolade','schoko','praline','lebkuchen','spekulatius','eiweisspulver','eiweissbrot',
         'proteinriegel','proteinpulver','muesliriegel','haferbrei','porridge','kartoffelpueree','schaumkuss','schokokuss',
         'toffee','karamell','tortellini','tortelloni','ravioli','maultasche','bienenstich','pudding'],
      not:['reis','kreis','preis','kakaopulver','kakaonibs','kakaobohne','sojapudding','wassereis'],
      skip:SKIP_VEGAN}
  ]
};

// Kein Treffer: Stillzeit gruen (Prompt: „Relevant sind nur …"). Fuer die
// Typen ohne Tabelle null – dann entscheidet weiter die KI. Die Ernaehrung hat
// eigene Regeln (rateDiet): Vegetarisch/Vegan ohne Treffer bleiben offen.
var NOHIT={
  nurs:{ampel:'gruen',grund:'kein Stillzeit-Hinweis'},
  preg:null,
  diet:null
};

var RANK={gruen:0,gelb:1,rot:2};
// Zusammenfuehren mit der KI: „keine Einschaetzung“ steht ueber „passt“.
var CRANK={gruen:0,grau:1,gelb:2,rot:3};

// NFC zuerst, damit ein zerlegtes „ä“ (a + Trema) auch zu „ae“ wird; danach
// alle uebrigen Akzente entfernen (Tiramisù, Crème fraîche, Ćevapčići).
function normalize(name){
  var s=String(name==null?'':name);
  if(s.normalize)s=s.normalize('NFC');
  s=s.toLowerCase().replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
    .replace(/œ/g,'oe').replace(/æ/g,'ae');
  if(s.normalize)s=s.normalize('NFD').replace(/[̀-ͯ]/g,'');
  return s;
}
function tokens(name){
  return normalize(name).split(/[^a-z]+/).filter(Boolean);
}

/** @param {any[]|undefined} list @param {(x:any)=>boolean} fn */
function _has(list,fn){
  if(!list)return false;
  for(var i=0;i<list.length;i++){if(fn(list[i]))return true;}
  return false;
}
function _isTea(t){return t==='tee'||t==='tea'||(t.length>3&&t.slice(-3)==='tee');}
/** @param {string} t @param {{w?:string[],p?:string[],e?:string[],c?:string[]}} r */
function _wordHits(t,r){
  return _has(r.w,function(k){return t===k;})
    ||_has(r.p,function(k){return t.indexOf(k)===0;})
    ||_has(r.e,function(k){return t.length>=k.length&&t.slice(-k.length)===k;})
    ||_has(r.c,function(k){return t.indexOf(k)>=0;});
}

function _ruleHits(rule,toks,line){
  if(_has(rule.skip,function(s){return _has(toks,function(t){return t.indexOf(s)===0;});}))return false;
  if(_has(rule.skipPh,function(ph){return line.indexOf(' '+ph+' ')>=0;}))return false;
  if(_has(rule.skipEnd,function(s){return _has(toks,function(t){return t.length>=s.length&&t.slice(-s.length)===s;});}))return false;
  if(_has(rule.ph,function(ph){return line.indexOf(' '+ph+' ')>=0;}))return true;
  var f=rule.inFood;
  if(f&&_has(toks,function(t){return _wordHits(t,f);})
    &&_has(toks,function(t){return _has(f.end,function(e){return t.length>=e.length&&t.slice(-e.length)===e;});}))return true;
  var ok=toks.filter(function(t){
    return !_has(rule.not,function(n){return t.indexOf(n)>=0;})
      &&!_has(rule.notPre,function(n){return t.length>n.length&&t.indexOf(n)===0;});
  });
  if(rule.tea){
    var anyTea=_has(toks,_isTea);
    return _has(ok,function(t){
      return _has(rule.tea,function(h){return t.indexOf(h)>=0&&(anyTea||_isTea(t));});
    });
  }
  return _has(ok,function(t){return _wordHits(t,rule);});
}

function _matchRules(rules,name){
  var toks=tokens(name);if(!rules||!toks.length)return [];
  var line=' '+toks.join(' ')+' ';
  return rules.filter(function(r){return _ruleHits(r,toks,line);});
}
// Alle Regeln, die ein Name trifft (fuer Test und Sichtpruefung).
function match(type,name){return _matchRules(RULES[type],name);}

// {name,ampel,grund,src:'rule'} im Format der KI-Antwort, oder null, wenn es
// fuer diesen Typ keine Tabelle gibt. Mehrere Treffer: die strengste Stufe,
// bei Gleichstand die erste Regel. 'diet' braucht opts (siehe rateDiet).
function rate(type,name,opts){
  if(type==='diet')return rateDiet(name,opts);
  if(!RULES[type]||!name)return null;
  var best=null;
  match(type,name).forEach(function(r){if(!best||RANK[r.ampel]>RANK[best.ampel])best=r;});
  var res=best||NOHIT[type];
  if(!res)return null;
  return {name:String(name),ampel:res.ampel,grund:res.grund,src:'rule'};
}

// ── Ernaehrung ──────────────────────────────────────────────────────────────
var DIET_LOCAL=['Vegetarisch','Vegan','Low Carb','Keto','High Protein'];
// Keto/Low Carb: Gruen bis, Gelb bis (g KH je 100 g); Getraenke die Haelfte.
// portion: so wenig KH in der gebuchten Menge ist immer gruen (Gewuerze).
var MACRO={'Keto':{gruen:5,gelb:10,portion:1},'Low Carb':{gruen:10,gelb:20,portion:2}};
var HP={share:0.2,min:10};

// Getraenk am Namen: Gezaehlt wird nur der erste Teil („Kaffee mit Milch“ ja,
// „Birnen in Rotwein“, „Thunfisch (Dose, Wasser)“ nein); ein Speise-Wortende
// (Sauce, Torte, Eis, Pulver …) schliesst aus. Marken ohne Gattungswort (Pils,
// Fanta, Ice Tea) stehen als ganze Woerter in LIQ_W.
var LIQ_W=['wasser','tee','kaffee','espresso','cappuccino','latte','macchiato','kakao','mate','cola','limo','limonade',
  'spezi','radler','bier','wein','sekt','prosecco','cidre','cider','smoothie','kefir','ayran','lassi','kombucha','saft',
  'milch','drink','shake','schorle','nektar','brause','fassbrause','pils','pilsener','pilsner','helles','koelsch',
  'hefeweizen','weissbier','fanta','sprite','pepsi','mirinda','almdudler','bionade','capri','tea','energy','bull',
  'punsch','grog','likoer','schnaps','wodka','vodka','whisky','whiskey','gin','rum','champagner','actimel','baileys',
  'valensina','mezzo','glühwein'];
var LIQ_E=['wasser','tee','kaffee','cola','limo','limonade','saft','milch','drink','shake','schorle','nektar','brause',
  'bier','wein','smoothie','punsch','likoer','schnaps'];
var LIQ_PH=['heisse schokolade','red bull','hohes c'];
var LIQ_NOT=['schwein','rucola','kondensmilch','trockenmilch','milchpulver','milchreis','milchschokolade','milchbroetchen'];
var FOOD_END=['sauce','sosse','suppe','braten','kuchen','torte','creme','eis','pudding','brei','gelee','schokolade',
  'pulver','praline','pralinen','reis','kugel','kugeln','konfituere','marmelade','dressing','salat','topf','pfanne',
  'auflauf','gulasch','ragout'];
function isLiquid(name){
  var first=normalize(name).split(/\(|,|\s+mit\s+|\s+und\s+|\s+in\s+/)[0]||'';
  var toks=first.split(/[^a-z]+/).filter(Boolean);
  if(!toks.length)return false;
  var line=' '+toks.join(' ')+' ';
  if(_has(LIQ_PH,function(ph){return line.indexOf(' '+ph+' ')>=0;}))return true;
  // Ausschluss ueber den ganzen Namen („Kakao (Pulver)“)
  var all=tokens(name);
  if(_has(all,function(t){
    return t.indexOf('trink')!==0&&_has(FOOD_END,function(f){return t.length>=f.length&&t.slice(-f.length)===f;});
  }))return false;
  if(_has(all,function(t){return _has(LIQ_NOT,function(n){return t.indexOf(n)>=0;});}))return false;
  return _has(toks,function(t){
    return (t.indexOf('trink')===0&&t.length>5)
      ||_has(LIQ_W,function(k){return t===k;})
      ||_has(LIQ_E,function(k){return t.length>k.length&&t.slice(-k.length)===k;});
  });
}

function _num(x){return typeof x==='number'&&isFinite(x)?x:NaN;}
/** @param {any} p */
function _plausible(p){
  if(!p)return false;
  var k=_num(p.kcal),pr=_num(p.protein),c=_num(p.carbs),f=_num(p.fat);
  return k>0&&isFinite(c)&&c>=0&&((pr||0)+c+(f||0))>0;
}
function _fmt(x){return String(Math.round(x*10)/10).replace('.',',');}

// Ein Urteil je Makro-Praeferenz: {p,ampel,grund}, ampel null = kein Punkt
// (High Protein unter der Schwelle); null = offen (keine plausiblen Werte).
function rateMacro(pref,name,per100,amount){
  if(!_plausible(per100))return pref==='High Protein'?{p:pref,ampel:null,grund:''}:null;
  var liq=isLiquid(name),unit=liq?'ml':'g';
  if(pref==='High Protein'){
    var pr=_num(per100.protein);
    if(pr>=HP.min&&pr*4/per100.kcal>=HP.share)return {p:pref,ampel:'gruen',grund:'proteinreich ('+_fmt(pr)+' g Eiweiß je 100 '+unit+')'};
    return {p:pref,ampel:null,grund:''};
  }
  var m=MACRO[pref];if(!m)return null;
  var c=per100.carbs,f=liq?0.5:1;
  if(typeof amount==='number'&&amount>0&&c*amount/100<=m.portion){
    return {p:pref,ampel:'gruen',grund:'nur '+_fmt(c*amount/100)+' g KH in der Portion'};
  }
  var a=c<=m.gruen*f?'gruen':(c<=m.gelb*f?'gelb':'rot');
  return {p:pref,ampel:a,grund:_fmt(c)+' g KH je 100 '+unit};
}

// Name in Abschnitte (#262): „ohne Fleisch“/„fleischfrei“ werden zum Skip-Wort
// „fleischlos“; sonst zaehlen „ohne A und B“ und „…frei“ nicht. „mit“, „und“,
// „in“ und Komma trennen Bestandteile (sonst nimmt „veganem Dressing“ dem
// „Hähnchen“ das Rot); ein Abschnitt nur aus „vegan“, „vegetarisch“ …
// („Bratwurst, vegan“) gilt fuer alle. Danach werden Kopfwoerter mit dem Wort
// davor eins: neutrale Kopfwoerter („Austern-Pilze“, „Burger Brötchen“) und
// Gericht-, Milch- und Ei-Woerter nach einem pflanzlichen Wort („Tofu Burger“,
// „Hafer Milch“, „Tofu-Rührei“) – dann greifen not und notPre der Zeilen.
var SKIP_ONLY=['vegan','vegetar','veggie','fleischlos','pflanzlich','bio'];
function _endsWord(t,w){
  for(var k=0;k<=2;k++){var end=t.length-k;if(end-w.length>=0&&t.slice(end-w.length,end)===w)return true;}
  return false;
}
function _isNeutralHead(t){return _has(NEUTRAL,function(w){return t.indexOf(w)===0||_endsWord(t,w);});}
function _dietSections(name){
  var s=normalize(name)
    .replace(/\bohne\s+fleisch\b/g,' fleischlos ').replace(/\bfleischfrei[a-z]*/g,' fleischlos ')
    .replace(/\bohne\s+[a-z]+(?:\s*(?:,|\bund\b|\boder\b)\s*[a-z]+)*/g,' ')
    .replace(/[a-z]*frei(e|er|es|en|em)?\b/g,' ')
    .replace(/-\s+(und|oder)\s+/g,' $1_ ');// Ergaenzungsstrich: „Nieren- und Blasentee“ bleibt ein Abschnitt
  var secs=s.split(/\s+mit\s+|\s+und\s+|\s+in\s+|[,;&+]/).map(function(sec){
    return sec.split(/[^a-z]+/).filter(Boolean);
  }).filter(function(t){return t.length;});
  var global=[];
  secs=secs.filter(function(toks){
    var only=toks.every(function(t){return _has(SKIP_ONLY,function(k){return t.indexOf(k)===0;});});
    if(only)global=global.concat(toks);
    return !only;
  });
  return secs.map(function(toks){
    var n=toks.length;
    while(n>=2){
      var head=toks[n-1],prev=toks[n-2];
      var plantHead=_has(PLANT,function(p){return prev.indexOf(p)>=0;})
        &&(_wordHits(head,DISH)||_has(DAIRY,function(d){return head.indexOf(d)===0;})||EGG.indexOf(head)>=0);
      if(!plantHead&&!_isNeutralHead(head))break;
      toks.splice(n-2,2,prev+head);n--;
    }
    return toks.concat(global).join(' ');
  });
}
// Strengste Zeile ueber alle Abschnitte, oder null (kein Treffer → offen).
function rateVeg(kind,name){
  var all=tokens(name);
  var rules=(kind==='vegan'?RULES.veg.concat(RULES.vegan):RULES.veg).filter(function(r){
    return !_has(r.skipName,function(s){return _has(all,function(t){return t.indexOf(s)===0;});});
  });
  /** @type {AmpelRule|null} */
  var best=null;
  _dietSections(name).forEach(function(sec){
    _matchRules(rules,sec).forEach(function(r){if(!best||RANK[r.ampel]>RANK[best.ampel])best=r;});
  });
  return best;
}

// opts: {prefs:[…], per100, amount}. null, wenn keine Praeferenz lokal
// entschieden werden kann (dann wie bisher alles an die KI). Sonst
// {name, ampel|null, grund, src:'rule', by:[{p,ampel,grund}], open:[…]}:
// ampel = strengste Stufe aus by; open = was die KI noch bewerten muss.
function rateDiet(name,opts){
  var o=opts||{},prefs=o.prefs||[];
  var local=prefs.filter(function(p){return DIET_LOCAL.indexOf(p)>=0;});
  if(!local.length||!name)return null;
  /** @type {{p:string, ampel:string, grund:string}[]} */
  var by=[];
  var open=prefs.filter(function(p){return DIET_LOCAL.indexOf(p)<0;});
  local.forEach(function(p){
    if(p==='Vegetarisch'||p==='Vegan'){
      var hit=rateVeg(p==='Vegan'?'vegan':'veg',name);
      if(hit)by.push({p:p,ampel:hit.ampel,grund:hit.grund});else open.push(p);
    }else{
      var r=rateMacro(p,name,o.per100,o.amount);
      if(!r)open.push(p);else if(r.ampel)by.push(r);
    }
  });
  /** @type {{p:string, ampel:string, grund:string}|null} */
  var best=null;
  by.forEach(function(b){if(!best||RANK[b.ampel]>RANK[best.ampel])best=b;});
  // Grund: die strengsten Urteile, gleicher Grund nur einmal („Vegetarisch, Vegan: enthält Fleisch“)
  var groups=[],byGrund={};
  by.forEach(function(b){
    if(!best||b.ampel!==best.ampel)return;
    if(!byGrund[b.grund]){byGrund[b.grund]=[];groups.push(b.grund);}
    byGrund[b.grund].push(b.p);
  });
  var grund=groups.map(function(g){return byGrund[g].join(', ')+': '+g;}).join(' · ');
  return {name:String(name),ampel:best?best.ampel:null,grund:grund,src:'rule',by:by,open:open};
}

// Lokales Teilergebnis und KI-Antwort fuer denselben Namen: die strengere
// Stufe gewinnt (grau ueber gruen); bei Gleichstand beide Gruende.
// Ohne gueltige KI-Stufe bleibt ein lokales Gelb/Rot stehen; ein lokales Gruen
// ist dann nicht bestaetigt (offene Praeferenzen ungeprueft) → null.
function combine(local,ai){
  if(!local||!local.ampel)return ai;
  var rl=CRANK[local.ampel],ra=ai?CRANK[ai.ampel]:undefined;
  if(rl===undefined)return ai;
  if(ra===undefined)return local.ampel==='gruen'?null:local;
  var w=ra>rl?ai:local;
  var grund=ra===rl&&local.grund!==ai.grund?[local.grund,ai.grund].filter(Boolean).join(' · '):w.grund;
  return {name:ai.name||local.name,ampel:w.ampel,grund:grund,src:'rule+ai'};
}

window.NTAmpel={
  rate:rate,
  match:match,
  normalize:normalize,
  isLiquid:isLiquid,
  combine:combine,
  RULES:RULES,
  NOHIT:NOHIT,
  DIET_LOCAL:DIET_LOCAL
};
})();
