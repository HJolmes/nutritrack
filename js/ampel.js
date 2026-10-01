// @ts-check
// NutriTrack – Stillzeit-Ampel als Tabelle (#205)
// Klassisches Script, kein Modul. Exportiert window.NTAmpel; greift auf nichts
// Globales zu und laeuft deshalb auch unter node (tools/ampel-test.js).
//
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
// Genau diese fuenf Kategorien stehen unten, keine weitere. Wegen „Relevant
// sind nur" ist alles andere gruen (NOHIT) – auch die ausdruecklich gruenen
// Faelle und die blaehenden Lebensmittel, die deshalb keine eigene Zeile
// brauchen. Zwei Regeln haengen an der Menge, die Ampel kennt aber nur Namen:
//   - Koffein: jedes koffeinhaltige Getraenk wird gelb, mit dem Hinweis auf die
//     Tagesmenge statt einer Warnung.
//   - Salbei/Pfefferminze/Petersilie: nur als Tee (die Form, in der Heilmengen
//     zusammenkommen); als Gewuerz gruen.
// Schwangerschaft und Ernaehrung bleiben bei der KI – fuer sie gibt es im Repo
// keine Regelquelle (NOHIT null, rate() liefert null).
//
// Der Abgleich ist absichtlich eng. Ein Schluesselwort trifft je nach Art nur
// ein ganzes Wort (w), einen Wortanfang (p), ein Wortende (e), irgendwo im Wort
// (c) oder eine Wortfolge (ph). Einfache Teilstrings wuerden „Schweineschnitzel"
// (wein), „Rumpsteak" (rum), „Aubergine" (gin), „Rucola" (cola), „Tomate"
// (mate) oder „Teewurst" (tee) treffen. „not" nimmt ein Wort, das einen der
// Teile enthaelt, fuer diese Regel aus; „skip" (Wortanfang) nimmt den ganzen
// Namen aus („alkoholfreies Bier", „Kaffee entkoffeiniert").
(function(){
'use strict';

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
      skip:['alkoholfrei','alkfrei']},
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
      not:['leberkae','leberkas']},
    {cat:'kraeuter',ampel:'gelb',grund:'als Tee in Heilmengen milchhemmend',
      tea:['salbei','pfefferminz','petersili']}
  ]
};

// Kein Treffer: Stillzeit gruen (Prompt: „Relevant sind nur …"). Fuer die
// Typen ohne Tabelle null – dann entscheidet weiter die KI.
var NOHIT={
  nurs:{ampel:'gruen',grund:'kein Stillzeit-Hinweis'},
  preg:null,
  diet:null
};

var RANK={gruen:0,gelb:1,rot:2};

function normalize(name){
  return String(name==null?'':name).toLowerCase()
    .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
    .replace(/[éèê]/g,'e').replace(/[àá]/g,'a');
}
function tokens(name){
  return normalize(name).split(/[^a-z]+/).filter(Boolean);
}

function _has(list,fn){
  if(!list)return false;
  for(var i=0;i<list.length;i++){if(fn(list[i]))return true;}
  return false;
}
function _isTea(t){return t==='tee'||t==='tea'||(t.length>3&&t.slice(-3)==='tee');}

function _ruleHits(rule,toks,line){
  if(_has(rule.skip,function(s){return _has(toks,function(t){return t.indexOf(s)===0;});}))return false;
  if(_has(rule.ph,function(ph){return line.indexOf(' '+ph+' ')>=0;}))return true;
  var ok=toks.filter(function(t){return !_has(rule.not,function(n){return t.indexOf(n)>=0;});});
  if(rule.tea){
    var anyTea=_has(toks,_isTea);
    return _has(ok,function(t){
      return _has(rule.tea,function(h){return t.indexOf(h)>=0&&(anyTea||_isTea(t));});
    });
  }
  return _has(ok,function(t){
    return _has(rule.w,function(k){return t===k;})
      ||_has(rule.p,function(k){return t.indexOf(k)===0;})
      ||_has(rule.e,function(k){return t.length>=k.length&&t.slice(-k.length)===k;})
      ||_has(rule.c,function(k){return t.indexOf(k)>=0;});
  });
}

// Alle Regeln, die ein Name trifft (fuer Test und Sichtpruefung).
function match(type,name){
  var rules=RULES[type];if(!rules)return [];
  var toks=tokens(name);if(!toks.length)return [];
  var line=' '+toks.join(' ')+' ';
  return rules.filter(function(r){return _ruleHits(r,toks,line);});
}

// {name,ampel,grund,src:'rule'} im Format der KI-Antwort, oder null, wenn es
// fuer diesen Typ keine Tabelle gibt. Mehrere Treffer: die strengste Stufe,
// bei Gleichstand die erste Regel.
function rate(type,name){
  if(!RULES[type]||!name)return null;
  var best=null;
  match(type,name).forEach(function(r){if(!best||RANK[r.ampel]>RANK[best.ampel])best=r;});
  var res=best||NOHIT[type];
  if(!res)return null;
  return {name:String(name),ampel:res.ampel,grund:res.grund,src:'rule'};
}

window.NTAmpel={
  rate:rate,
  match:match,
  normalize:normalize,
  RULES:RULES,
  NOHIT:NOHIT
};
})();
