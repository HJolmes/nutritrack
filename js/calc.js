// @ts-check
// NutriTrack – Rechenkern (#255). Klassisches Script, VOR dem grossen Inline-Block
// in index.html eingebunden: Funktionsdeklarationen werden nur innerhalb ihres
// eigenen Scripts gehoben, und der Inline-Block ruft today()/loadS() beim Start.
//
// Die Funktionen stehen hier UNVERAENDERT (Name, Signatur, Rumpf) wie vorher in
// index.html und bleiben global – keine Aufrufstelle hat sich geaendert. Was S
// liest, liest es weiter als Globales; die Tests setzen S im Kontext vor dem
// Laden (tools/test/calc.test.js laedt die Datei per `vm` wie ein Browser-
// Script – ein `module.exports` hier liesse tsc die Datei als CommonJS-Modul
// lesen, und ihre Funktionen waeren fuer alle anderen Dateien nicht mehr
// global). Neue reine Rechenfunktionen entstehen hier, nicht in index.html, und
// wer eine Funktion hier aendert, aendert oder ergaenzt ihren Test in
// tools/test/calc.test.js im selben PR.
//
// Reinheitsregel (tools/check.js): kein document., localStorage, fetch(,
// showToast, openOv, setTimeout. Was speichert (saveS) oder Fotos loescht
// (delPhotoIfUnused), ruft dafuer die globale Funktion aus index.html.

// ── Zustand laden ──
// Die Zusammenfuehrung von loadS(): FLACH. Ein alter Stand ohne ein neues
// Unterfeld (etwa macroGoalG.fat) ersetzt das ganze Vorgabe-Objekt – so ist
// es heute, die Tests halten es fest.
function mergeState(state,saved){Object.assign(state,saved);return state;}

// ── Datum ──
function today(){var d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function pad(n){return n<10?'0'+n:String(n);}
function addDays(s,d){var p=s.split('-');var dt=new Date(+p[0],+p[1]-1,+p[2]);dt.setDate(dt.getDate()+d);return dt.getFullYear()+'-'+pad(dt.getMonth()+1)+'-'+pad(dt.getDate());}
function fmtDate(s){var t=today();if(s===t)return'Heute';if(s===addDays(t,-1))return'Gestern';var p=s.split('-');return new Date(+p[0],+p[1]-1,+p[2]).toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long'});}
function isoWeek(d){
  var t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
  t.setUTCDate(t.getUTCDate()+4-(t.getUTCDay()||7));
  var y=new Date(Date.UTC(t.getUTCFullYear(),0,1));
  // @ts-expect-error Date-Arithmetik ueber valueOf() – laeuft, tsc kennt sie nicht
  return Math.ceil((((t-y)/86400000)+1)/7);
}

// ── Tage und Summen ──
// Macht einen komprimierten Alt-Tag wieder bearbeitbar. Die archivierten
// Summen bleiben als ein Eintrag im Snack erhalten; beim naechsten Start
// komprimiert compressOldDays den Tag erneut — mit der neuen Gesamtsumme.
// _reopened haelt wiederkehrende Mahlzeiten fern (recurring.js).
function reopenArchivedDay(d){
  if(!d||!d._compressed)return d;
  var p={kcal:d.kcal||0,protein:d.protein||0,carbs:d.carbs||0,fat:d.fat||0,sugar:0,fiber:0,salt:0};
  var snack=(p.kcal||p.protein||p.carbs||p.fat)
    ?[Object.assign({name:'Archivierte Tageswerte',emoji:'📦',_archived:true,amount:100,per100:p},p)]:[];
  ['_compressed','kcal','protein','carbs','fat'].forEach(function(k){delete d[k];});
  d.meals={breakfast:[],lunch:[],dinner:[],snack:snack};
  d.water=d.water||0;
  d.exercise=[];
  d._reopened=true;
  return d;
}
function getDay(){
  var d=S.days[S.currentDate];
  if(!d){d={meals:{breakfast:[],lunch:[],dinner:[],snack:[]},water:0,exercise:[]};S.days[S.currentDate]=d;}
  // Komprimierte Alt-Tage (siehe compressOldDays) werden wieder aufgemacht,
  // sonst gingen Eintraege dort still verloren (#232).
  if(d._compressed)reopenArchivedDay(d);
  if(!d.meals)d.meals={breakfast:[],lunch:[],dinner:[],snack:[]};
  if(!d.exercise)d.exercise=[];
  return d;
}
function calcM(arr){return arr.reduce(function(a,e){return{kcal:a.kcal+(e.kcal||0),protein:a.protein+(e.protein||0),carbs:a.carbs+(e.carbs||0),fat:a.fat+(e.fat||0),sugar:a.sugar+(e.sugar||0),fiber:a.fiber+(e.fiber||0),salt:a.salt+(e.salt||0)};},{kcal:0,protein:0,carbs:0,fat:0,sugar:0,fiber:0,salt:0});}
function ingTotal(ings){return(ings||[]).reduce(function(a,g){var r=(g.amount||0)/100;return{kcal:a.kcal+(g.per100.kcal||0)*r,protein:a.protein+(g.per100.protein||0)*r,carbs:a.carbs+(g.per100.carbs||0)*r,fat:a.fat+(g.per100.fat||0)*r,sugar:a.sugar+(g.per100.sugar||0)*r,fiber:a.fiber+(g.per100.fiber||0)*r,salt:a.salt+(g.per100.salt||0)*r};},{kcal:0,protein:0,carbs:0,fat:0,sugar:0,fiber:0,salt:0});}
function scaleNutrients(t,factor){return{kcal:t.kcal*factor,protein:t.protein*factor,carbs:t.carbs*factor,fat:t.fat*factor,sugar:(t.sugar||0)*factor,fiber:(t.fiber||0)*factor,salt:(t.salt||0)*factor};}
// Summe als Kurztext (Picker, Bearbeiten, Rezept-Editor, Wochenplan).
function totalStr(t){return Math.round(t.kcal)+' kcal · P'+Math.round(t.protein)+'g K'+Math.round(t.carbs)+'g F'+Math.round(t.fat)+'g';}

// ── Kalorien-Ampel ──
function _kcalAmpel(goal,eaten,S){
  // Liefert {state:'balanced'|'over'|'under', text}.
  // ±10 % Toleranz = grün. Außerhalb: Bewertung anhand Diät-Ziel
  // (lose/gain/maintain), abgeleitet aus S.goalWeight vs S.weight.
  var diff=goal-eaten;
  var pct=goal?Math.round(Math.abs(diff)/goal*100):0;
  if(pct<=10)return {state:'balanced',text:'✓ im Plan ('+pct+' %)'};
  var dir='maintain';
  if(S&&S.goalWeight&&S.weight){
    if(S.goalWeight<S.weight-0.5)dir='lose';
    else if(S.goalWeight>S.weight+0.5)dir='gain';
  }
  if(diff<0){
    // über dem Kalorienziel
    if(dir==='gain')return {state:'balanced',text:'⬈ '+pct+' % über Ziel · super, baut auf'};
    return {state:'over',text:'⬈ '+pct+' % über Ziel · ein paar Schritte gehen?'};
  }
  // unter dem Kalorienziel
  if(dir==='lose')return {state:'balanced',text:'⬊ '+pct+' % unter Ziel · gut für dein Defizit'};
  return {state:'over',text:'⬊ '+pct+' % unter Ziel · noch etwas essen!'};
}

// ── Makro-Ziele ──
function dietMacroTargets(kcal){
  var prefs=S.dietPrefs||[];
  if(prefs.indexOf('Keto')>=0)
    return{protein:Math.round(kcal*0.25/4),carbs:Math.round(kcal*0.05/4),fat:Math.round(kcal*0.70/9)};
  if(prefs.indexOf('Low Carb')>=0)
    return{protein:Math.round(kcal*0.30/4),carbs:Math.round(kcal*0.20/4),fat:Math.round(kcal*0.50/9)};
  if(prefs.indexOf('High Protein')>=0)
    return{protein:Math.round(kcal*0.35/4),carbs:Math.round(kcal*0.40/4),fat:Math.round(kcal*0.25/9)};
  return calcMacroTargets(kcal);
}
function getMacroTargets(){
  if(S.macroGoalMode==='gram'&&S.macroGoalG&&S.macroGoalG.protein){
    return{protein:S.macroGoalG.protein,carbs:S.macroGoalG.carbs,fat:S.macroGoalG.fat};
  }
  return dietMacroTargets(S.goal);
}
function calcMacroTargets(kcal){
  // Standard: 25% Protein, 45% Kohlenhydrate, 30% Fett
  return{
    protein:Math.round(kcal*0.25/4),
    carbs:Math.round(kcal*0.45/4),
    fat:Math.round(kcal*0.30/9)
  };
}

// ── Schwangerschaft ──
function calcSSW(etVal){
  var et=new Date(etVal);
  var lmp=new Date(et.getTime()-280*24*3600000);
  // @ts-expect-error Date-Arithmetik ueber valueOf() – laeuft, tsc kennt sie nicht
  return Math.floor((new Date()-lmp)/(7*24*3600000));
}
function getPregAddFromState(){
  /** @type {any} S.pregnant ist 0, '0'–'3' oder 'et' (Literal in index.html); parseInt nimmt nur string, deshalb any */
  var mode=S.pregnant;
  if(mode==='et'&&S.pregnantET){
    var ssw=calcSSW(S.pregnantET);
    var tri=ssw<=12?1:ssw<=27?2:3;
    return [0,0,300,500][tri];
  }
  return [0,0,300,500][parseInt(mode)]||0;
}

// ── Portionsgedächtnis ──
// ── Portionsgedächtnis ──
function rememberPortion(name,amount){
  if(!name||!amount)return;
  if(!S.portionMemory)S.portionMemory={};
  S.portionMemory[name.toLowerCase()]=amount;
  saveS();
}

function recallPortion(name){
  if(!S.portionMemory)return null;
  return S.portionMemory[(name||'').toLowerCase()]||null;
}

// ── Komprimierung alter Tage ──
// ── localStorage Komprimierung (alte Tage) ──
function compressOldDays(){
  var cutoff=addDays(today(),-90);// Tage älter als 90 Tage komprimieren
  var changed=false;
  Object.keys(S.days).forEach(function(d){
    if(d<cutoff&&S.days[d]&&!S.days[d]._compressed){
      var day=S.days[d];
      // Fehlende meals, Slots oder leere Eintraege zaehlen als leer (wie
      // dayTotals in js/stats.js). Ein Wurf hier stoppte die Verdichtung bei
      // jedem Start, und der Speicher wuchs weiter (#281).
      var m=day.meals||{};
      var all=[].concat(m.breakfast||[],m.lunch||[],m.dinner||[],m.snack||[]).filter(Boolean);
      var t=calcM(all);
      // Nur Summen behalten, Details + Fotos löschen — Fotos erst nach dem
      // Ersetzen, und nur wenn keine Vorlage/Kopie sie noch nutzt (#234).
      S.days[d]={_compressed:true,kcal:Math.round(t.kcal),protein:Math.round(t.protein),carbs:Math.round(t.carbs),fat:Math.round(t.fat),water:day.water||0};
      all.forEach(function(e){delPhotoIfUnused(e.mealPhotoId);});
      changed=true;
    }
  });
  if(changed){saveS();console.log('[NutriTrack] Alte Tage komprimiert');}
}

// ── Emoji ──
// „Beeren“ ist kein Bier und „Schweinebauch“ kein Wein: beer/wine nur als
// ganzes Wort, wein nicht hinter „sch“.
function emo(n){
  var nl=(n||'').toLowerCase();
  /** @type {Array<[RegExp,string]>} */
  var m=[[/banane/,'🍌'],[/apfel|äpfel/,'🍎'],[/birne/,'🍐'],[/orange|mandarine/,'🍊'],[/erdbeere/,'🍓'],[/blaubeer|heidelbeer/,'🫐'],[/himbeere/,'🫐'],[/kirsch/,'🍒'],[/trauben/,'🍇'],[/kiwi/,'🥝'],[/mango/,'🥭'],[/avocado/,'🥑'],[/melone/,'🍉'],[/pfirsich|nektarine/,'🍑'],[/tomate/,'🍅'],[/gurke/,'🥒'],[/karott|möhre/,'🥕'],[/brokkoli/,'🥦'],[/blumenkohl/,'🥦'],[/spinat/,'🥬'],[/salat|rucola|kohl/,'🥬'],[/paprika/,'🫑'],[/pilz|champignon/,'🍄'],[/kartoffel/,'🥔'],[/süßkartoffel/,'🍠'],[/mais/,'🌽'],[/hähnchen|huhn|chicken|hühnerbrust/,'🍗'],[/rind|beef|hack/,'🥩'],[/pute|turkey/,'🦃'],[/lachs|salmon/,'🐟'],[/thunfisch|tuna/,'🐠'],[/garnele|shrimp/,'🦐'],[/\bei\b|eier|egg/,'🥚'],[/milch|milk/,'🥛'],[/käse|cheese/,'🧀'],[/joghurt|yogurt/,'🥣'],[/quark/,'🥄'],[/butter/,'🧈'],[/brot|bread/,'🍞'],[/brötchen/,'🥖'],[/haferflocken|oat/,'🌾'],[/müsli|granola/,'🥣'],[/reis|rice/,'🍚'],[/pasta|nudel|spaghetti/,'🍝'],[/mandel|cashew|erdnuss|walnuss|nuss/,'🥜'],[/chiasamen|sesam/,'🌱'],[/öl|oil/,'🫙'],[/linsen|bohne|kichererbse/,'🫘'],[/tofu|tempeh/,'🧆'],[/schokolade|chocolate|nutella/,'🍫'],[/chips/,'🥔'],[/honig|honey/,'🍯'],[/protein|whey/,'💪'],[/pizza/,'🍕'],[/burger|hamburger/,'🍔'],[/pommes/,'🍟'],[/sushi/,'🍣'],[/döner/,'🥙'],[/kaffee|coffee|espresso/,'☕'],[/tee|tea/,'🍵'],[/saft|juice/,'🧃'],[/cola/,'🥤'],[/bier|\bbeer\b/,'🍺'],[/(^|[^h])wein|\bwine\b/,'🍷'],[/salami|speck|schinken|wurst|fleischsalat/,'🍖'],[/skyr/,'🥛'],[/marmelade/,'🍓']];
  for(var i=0;i<m.length;i++)if(m[i][0].test(nl))return m[i][1];
  return'🍽';
}
// Symbol aus fremder Quelle (Share-Link, Partner, Plan-Sync): kurz halten und
// ohne HTML-Zeichen — die Anzeige escaped zusaetzlich (#236).
function safeEmoji(s,fb){s=String(s==null?'':s).replace(/[&<>"'`=\\/]/g,'').slice(0,16);return s||fb||'';}

// ── Suche ──
function fuzzy(item,q){
  var ql=(q||'').toLowerCase().trim();if(!ql)return 1;
  var n=item.n.toLowerCase(),s=(item.s||'').toLowerCase();
  if(n===ql)return 5;if(n.startsWith(ql))return 4;
  var w=n.split(/\s+/);for(var i=0;i<w.length;i++)if(w[i].startsWith(ql))return 3;
  if(n.includes(ql))return 2;if(s.includes(ql))return 2;
  if(ql.length>=4&&(n.includes(ql.slice(0,-1))||s.includes(ql.slice(0,-1))))return 1;
  return 0;
}
function dbPer100(f){
  // Die Basis-DB (js/fooddb.js) fuehrt nur k/p/c/f, die erzeugte USDA-Ergaenzung
  // (js/fooddb-usda.js) zusaetzlich g Zucker, b Ballaststoffe, l Salz. Fehlende
  // Felder bleiben 0 — so lesen beide Quellen ueber denselben Weg.
  return{kcal:f.k,protein:f.p,carbs:f.c,fat:f.f,sugar:f.g||0,fiber:f.b||0,salt:f.l||0};
}

// ── Teilen: kcal einer Sendung ──
// Menge aus dem Share-Format — so gerechnet wie beim Sender, damit Vorschau,
// Senderzusammenfassung und Import dieselben kcal zeigen (#246):
// Rezeptzutat ohne Menge (fehlt/null/0) = 0 g, denn ingTotal() rechnet (amount||0);
// Lebensmittel-Eintrag (t:'f') ohne Menge = 100 g, denn _encEntry schreibt bei
// Alteinträgen ohne per100 die Gesamtwerte als p, und der Editor nimmt (amount||100).
// Naehrwerte pro 100 g ins Share-Format und zurueck. Zucker (g), Ballaststoffe (b)
// und Salz (l) reisen nur mit, wenn sie > 0 sind — aeltere Sendungen ohne sie
// lesen sich damit wie bisher als 0.
function _shPer100Enc(p){
  p=p||{};
  var r1=function(v){return Math.round((v||0)*10)/10;};
  var o={k:Math.round(p.kcal||0),pr:r1(p.protein),c:r1(p.carbs),f:r1(p.fat)};
  if(r1(p.sugar)>0)o.g=r1(p.sugar);
  if(r1(p.fiber)>0)o.b=r1(p.fiber);
  if(Math.round((p.salt||0)*100)>0)o.l=Math.round((p.salt||0)*100)/100;
  return o;
}
function _shPer100Dec(p){
  p=p||{};
  return{kcal:p.k||0,protein:p.pr||0,carbs:p.c||0,fat:p.f||0,sugar:p.g||0,fiber:p.b||0,salt:p.l||0};
}
function _shIngA(a){return parseFloat(a)||0;}
function _shFoodA(a){return parseFloat(a)||100;}
function _mmKcal(mm){
  var k=0;
  Object.keys(mm||{}).forEach(function(m){
    (mm[m]||[]).forEach(function(x){
      if(x.t==='r')k+=(x.i||[]).reduce(function(s,i){return s+(i.p.k||0)*_shIngA(i.a)/100;},0)*(x.p||1);
      else k+=(x.p.k||0)*_shFoodA(x.a)/100;
    });
  });
  return k;
}

// ── Sport ──
// MET-Werte: js/metdb.js (window.MET_DB, NTMet.lookup), erzeugt von
// tools/build-met.js aus dem 2024 Adult Compendium of Physical Activities.
// Rangfolge der Suche: eigener Bibliothekseintrag MIT MET (z.B. ein KI-Wert)
// → Tabelle → null (dann KI oder Offline-Rückfall). Einträge mit met:null
// (nur Name/Emoji) zählen nicht als Treffer. Fehlt metdb.js, bleibt nur die
// Bibliothek, der Rest läuft über KI/Rückfall wie vor der Tabelle.
// Rückfall ohne Treffer: 5 MET, Gewicht S.weight||75 — beides Schätzwerte.
var EXERCISE_FALLBACK_MET=5;

function findExercise(name){
  var nl=String(name||'').trim().toLowerCase();
  if(!nl)return null;
  var le=(S.exerciseLibrary||[]).find(function(e){return e&&e.name&&e.met&&e.name.toLowerCase()===nl;});
  if(le)return{name:le.name,emoji:le.emoji||'🏃',met:le.met,src:'lib'};
  var t=window.NTMet&&NTMet.lookup(name);
  if(t)return{name:t.n,emoji:t.e,met:t.met,src:'table'};
  return null;
}

// Chip-Leiste: Schnellauswahl (NTMet.top) plus eigene Bibliothek. Ein eigener
// Eintrag gleichen Namens ersetzt den Tabellen-Chip (mit ✕ zum Löschen).
function getAllExercises(){
  var byName={};
  (S.exerciseLibrary||[]).forEach(function(le){
    if(le&&le.name)byName[le.name.toLowerCase()]=le;
  });
  var all=[],used={};
  var top=(window.NTMet&&NTMet.top)||[];
  top.forEach(function(n){
    var key=n.toLowerCase();
    if(used[key])return;
    used[key]=1;
    var le=byName[key];
    if(le){all.push({name:le.name,emoji:le.emoji,met:le.met,isLib:true});return;}
    var t=NTMet.lookup(n);
    if(t)all.push({name:t.n,emoji:t.e,met:t.met,isLib:false});
  });
  (S.exerciseLibrary||[]).forEach(function(le){
    if(!le||!le.name)return;
    var key=le.name.toLowerCase();
    if(used[key])return;
    used[key]=1;
    all.push({name:le.name,emoji:le.emoji,met:le.met,isLib:true});
  });
  return all;
}

function getExerciseMet(name,intensity){
  var found=findExercise(name);
  if(found&&found.met)return found.met[intensity]||found.met.medium||EXERCISE_FALLBACK_MET;
  return null;
}

// Dauer im Aktivitätsnamen ("Bouldern 20 min", "45min Laufen", "Radfahren
// 1,5 Std") herauslösen: {name, dur} mit dur in Minuten, 0 = keine Angabe.
// Nur Zahl + Einheit (min/Minute(n)/Std/Stunde(n)/h) als eigenes Wort; eine
// Zahl ohne Einheit bleibt im Namen. Bleibt ohne Dauer kein Name übrig, bleibt
// der Name unverändert.
function splitExerciseDuration(name){
  var raw=String(name||'');
  var re=/(^|\s)(\d+(?:[.,]\d+)?)\s*(minuten|minute|min\.?|stunden|stunde|std\.?|h)(?=\s|[,;-]|$)/i;
  var m=raw.match(re);
  if(!m)return{name:raw.trim(),dur:0};
  var n=parseFloat(m[2].replace(',','.'));
  var unit=m[3].toLowerCase();
  var dur=Math.round(/^(std|stunde|h)/.test(unit)?n*60:n);
  var rest=(raw.slice(0,m.index)+' '+raw.slice(m.index+m[0].length))
    .replace(/\s+/g,' ').replace(/^[\s,;-]+|[\s,;-]+$/g,'');
  if(!rest||!dur)return{name:raw.trim(),dur:0};
  return{name:rest,dur:dur};
}

// Eigene Bibliothek ohne Dauer im Namen (Altbestand aus Eingaben wie
// "Bouldern 20 min"): Name bereinigt, gleicher Name danach nur einmal (der
// erste gewinnt, ein Eintrag MIT MET schlägt einen ohne). Gibt die neue Liste
// zurück, verändert die alte nicht.
function cleanExerciseLibrary(lib){
  var out=[],at={};
  (lib||[]).forEach(function(le){
    if(!le||!le.name)return;
    var e=Object.assign({},le,{name:splitExerciseDuration(le.name).name});
    var k=e.name.toLowerCase();
    if(at[k]===undefined){at[k]=out.length;out.push(e);}
    else if(!out[at[k]].met&&e.met)out[at[k]]=e;
  });
  return out;
}

// Vorschlagsliste am Namensfeld (ersetzt das <datalist>, das Chrome/Android nur
// als leere Kästchen über der Tastatur zeigt). Kandidaten: eigene Bibliothek,
// dann Tabelle (MET_DB). Leere Suche: Bibliothek, dann Tabelle alphabetisch.
// Sonst Rang 3 Name beginnt mit der Eingabe, 2 ein Wort von Name/Synonym
// beginnt damit, 1 irgendwo enthalten; gleicher Rang alphabetisch. Gleicher
// Name (ohne Groß-/Kleinschreibung) nur einmal, der eigene Eintrag gewinnt.
// limit 0 = alle.
function suggestExercises(query,limit){
  var norm=(window.NTMet&&NTMet.norm)||function(x){return String(x||'').toLowerCase().trim();};
  var q=norm(query);
  var cands=[],seen={};
  (S.exerciseLibrary||[]).forEach(function(le){
    if(!le||!le.name)return;
    var k=le.name.toLowerCase();
    if(seen[k])return;
    seen[k]=1;
    cands.push({name:le.name,emoji:le.emoji||'🏃',keys:[norm(le.name)],lib:true});
  });
  (window.MET_DB||[]).forEach(function(it){
    var k=it.n.toLowerCase();
    if(seen[k])return;
    seen[k]=1;
    cands.push({name:it.n,emoji:it.e||'🏃',keys:[norm(it.n)].concat((it.s||[]).map(norm)),lib:false});
  });
  var byName=function(a,b){return a.name.localeCompare(b.name,'de');};
  var out;
  if(!q){
    out=cands.filter(function(c){return c.lib;}).concat(cands.filter(function(c){return !c.lib;}).sort(byName));
  } else {
    var scored=[];
    cands.forEach(function(c){
      var sc=0;
      c.keys.forEach(function(k,i){
        var s=0;
        if(i===0&&k.indexOf(q)===0)s=3;
        else if((' '+k).indexOf(' '+q)!==-1)s=2;
        else if(k.indexOf(q)!==-1)s=1;
        if(s>sc)sc=s;
      });
      if(sc)scored.push({c:c,s:sc});
    });
    scored.sort(function(a,b){return (b.s-a.s)||byName(a.c,b.c);});
    out=scored.map(function(x){return x.c;});
  }
  if(limit)out=out.slice(0,limit);
  return out.map(function(c){return{name:c.name,emoji:c.emoji};});
}


// ── Rezept-Import per URL ──
// Erste http(s)-Adresse im eingefuegten Text, ohne Satzzeichen am Ende; ohne
// Link null. Rezept-Import per URL laeuft ausschliesslich ueber den
// Picker-Link-Tab (picker.js).
function recipeImportExtractUrl(text){
  var m=text.match(/https?:\/\/[^\s"<>]+/);
  return m?m[0].replace(/[.,;:!?)\]]+$/,''):null;
}

// ── Kochbuch (js/cookbook.js) ──
// Rezepte stehen JE PORTION in `recipes` (amount = Gramm je Portion); das
// Kochbuch zeigt und bearbeitet sie fuer das ganze Rezept (baseServings).
// Optionale Zutatenfelder aus dem Import: q = Menge je Portion in der Einheit
// u („EL“, „Dose“, leer = Stueck), t = Text der Quelle ohne Menge.

// „PT1H30M“ (schema.org totalTime) → 90; eine blosse Zahl gilt als Minuten.
function parseIsoDuration(s){
  s=String(s==null?'':s).trim();
  if(/^\d+$/.test(s))return parseInt(s,10);
  var m=s.match(/^P(?:(\d+(?:[.,]\d+)?)D)?(?:T(?:(\d+(?:[.,]\d+)?)H)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)S)?)?$/i);
  if(!m)return 0;
  var n=function(x){return x?parseFloat(x.replace(',','.')):0;};
  return Math.round(n(m[1])*1440+n(m[2])*60+n(m[3])+n(m[4])/60);
}
// „4 Portionen“, „Für 4-6 Personen“, „4“ → 4; nichts Brauchbares → 0.
function parseYield(v){
  var m=String(v==null?'':v).match(/\d+/);
  var n=m?parseInt(m[0],10):0;
  return n>=1&&n<=100?n:0;
}
// Zubereitung → Schritte. Eine Zeile je Schritt; Nummern und Spiegelstriche
// am Anfang fallen weg. Ein einziger langer Absatz wird an Satzenden geteilt
// und zu Schritten von mindestens 120 Zeichen zusammengefasst.
function recipeSteps(text){
  var lines=String(text||'').split(/\r?\n/).map(function(l){
    return l.replace(/^\s*(?:schritt\s*)?\d+\s*[.):]\s*/i,'').replace(/^\s*[-•*–]\s+/,'').trim();
  }).filter(Boolean);
  if(lines.length!==1||lines[0].length<=240)return lines;
  var s=lines[0],parts=[],re=/[.!?]\s+(?=[A-ZÄÖÜ])/g,last=0,m;
  while((m=re.exec(s))){parts.push(s.slice(last,m.index+1).trim());last=m.index+m[0].length;}
  parts.push(s.slice(last).trim());
  var out=[],cur='';
  parts.filter(Boolean).forEach(function(p){
    cur=cur?cur+' '+p:p;
    if(cur.length>=120){out.push(cur);cur='';}
  });
  if(cur){if(out.length&&cur.length<60)out[out.length-1]+=' '+cur;else out.push(cur);}
  return out;
}
// Zeitangaben in einem Schritt → Timer in Sekunden. „10–15 Minuten“ nimmt
// die untere Grenze (lieber zu frueh nachsehen), „1 Std. 30 Min.“ wird ein
// Timer. Hoechstens 24 Stunden, jede Dauer nur einmal.
function stepTimers(text){
  var re=/(\d+(?:[.,]\d+)?)(?:\s*(?:-|–|bis)\s*\d+(?:[.,]\d+)?)?\s*(sekunden|sek\.?|minuten|minute|min\.?|stunden|stunde|std\.?)(?![a-zäöüß])(?:\s*(?:und\s+)?(\d+)\s*(?:minuten|min\.?)(?![a-zäöüß]))?/gi;
  var out=[],seen={},m;
  while((m=re.exec(String(text||'')))){
    var v=parseFloat(m[1].replace(',','.')),u=m[2].toLowerCase(),sec;
    if(/^sek/.test(u))sec=v;
    else if(/^(std|stunde)/.test(u))sec=v*3600+(m[3]?parseInt(m[3],10)*60:0);
    else sec=v*60;
    sec=Math.round(sec);
    if(!(sec>0)||sec>86400||seen[sec])continue;
    seen[sec]=true;
    out.push({sec:sec,label:m[0].trim()});
  }
  return out;
}
// Menge zum Lesen: ab 10 ganze Zahl, darunter Brueche (½, ⅓, ¼ …), sonst
// eine Nachkommastelle mit Komma.
function fmtQty(n){
  n=+n;if(!(n>0))return '';
  if(n>=10)return String(Math.round(n));
  var whole=Math.floor(n),frac=n-whole;
  /** @type {{d:number,v:number,s:string}|null} */
  var best=null;
  /** @type {Array<[number,string]>} */
  var fr=[[0,''],[0.25,'¼'],[1/3,'⅓'],[0.5,'½'],[2/3,'⅔'],[0.75,'¾'],[1,'']];
  fr.forEach(function(f){
    var d=Math.abs(frac-f[0]);
    if(d<0.05&&(!best||d<best.d))best={d:d,v:f[0],s:f[1]};
  });
  if(best){
    var w=whole+(best.v===1?1:0);
    if(best.s)return w?w+' '+best.s:best.s;
    if(w)return String(w);
  }
  return String(Math.round(n*(n<1?100:10))/(n<1?100:10)).replace('.',',');
}
// Zutaten mal Faktor (Portionen umrechnen, Ganzes ↔ je Portion). Kopien —
// das Rezept selbst bleibt, wie es ist.
function scaleIngs(ings,f){
  return (ings||[]).map(function(g){
    var c=JSON.parse(JSON.stringify(g));
    if(c.amount>0)c.amount=Math.round(c.amount*f*10)/10;
    if(c.q>0)c.q=Math.round(c.q*f*1000)/1000;
    return c;
  });
}
// Eine Zutatenzeile fuer p Portionen: {q:'2 EL', n:'Olivenöl', g:'30 g'}.
// Mit Menge aus der Quelle steht sie vorn und das Gramm daneben; sonst Gramm.
function bookIngLine(ing,p){
  var amt=(parseFloat(ing&&ing.amount)||0)*p,g=amt>0?Math.round(amt)+' g':'';
  if(ing&&ing.pu)return {q:fmtQty(amt/100)+' Port.',n:ing.name,g:''};
  if(ing&&(ing.q>0||ing.t)){
    var u=String(ing.u||''),grams=/^(g|gr|gramm|ml)$/i.test(u);
    var q=ing.q>0?(grams?String(Math.round(ing.q*p)):fmtQty(ing.q*p))+(u?' '+u:''):'';
    return {q:q,n:ing.t||ing.name,g:grams?'':g};
  }
  return {q:g,n:ing?ing.name:'',g:''};
}
// „Pasta, vegetarisch , pasta“ → ['Pasta','Vegetarisch']: getrimmt, erster
// Buchstabe gross, ohne Gross/Klein-Dubletten.
function parseTags(s){
  var out=[],seen={};
  (Array.isArray(s)?s:String(s||'').split(',')).forEach(function(t){
    t=String(t||'').replace(/\s+/g,' ').trim();if(!t)return;
    t=t.charAt(0).toUpperCase()+t.slice(1);
    var k=t.toLowerCase();if(seen[k])return;seen[k]=true;out.push(t);
  });
  return out;
}
// Alle Kategorien des Kochbuchs, die haeufigste zuerst.
function bookTags(list){
  var n={};
  (list||[]).forEach(function(r){(r.cat||[]).forEach(function(t){n[t]=(n[t]||0)+1;});});
  return Object.keys(n).sort(function(a,b){return n[b]-n[a]||a.localeCompare(b,'de');});
}
function _bookFold(s){
  return String(s||'').toLowerCase().replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss');
}
// Suche ueber Name, Kategorien und Zutaten; tag '★' = nur Favoriten.
function bookFilter(list,q,tag){
  var words=_bookFold(q).split(/\s+/).filter(Boolean);
  return (list||[]).filter(function(r){
    if(tag==='★'){if(!r.fav)return false;}
    else if(tag&&(r.cat||[]).indexOf(tag)<0)return false;
    if(!words.length)return true;
    var hay=_bookFold([r.name].concat(r.cat||[],(r.ingredients||[]).map(function(g){return g.name+' '+(g.t||'');})).join(' '));
    return words.every(function(w){return hay.indexOf(w)>=0;});
  });
}
// Sortierung: new (zuletzt angelegt), az, cooked (zuletzt gekocht), often,
// kcal (je Portion aufsteigend), time (schnell zuerst). log = S.cookLog.
function bookSort(list,mode,log){
  log=log||{};
  var lg=function(r){return log[r.id]||{n:0,last:''};};
  var idn=function(r){return parseInt(r.id,10)||0;};
  var out=(list||[]).slice();
  out.sort(function(a,b){
    if(mode==='az')return String(a.name).localeCompare(String(b.name),'de');
    if(mode==='cooked')return (lg(b).last>lg(a).last?1:lg(b).last<lg(a).last?-1:0)||idn(b)-idn(a);
    if(mode==='often')return lg(b).n-lg(a).n||idn(b)-idn(a);
    if(mode==='kcal')return ingTotal(a.ingredients||[]).kcal-ingTotal(b.ingredients||[]).kcal;
    if(mode==='time')return (a.time>0?a.time:1e9)-(b.time>0?b.time:1e9)||idn(b)-idn(a);
    return idn(b)-idn(a);
  });
  return out;
}

// ── Kochbuch: Anpassung an die eigenen Angaben ──
// Welche Angaben ein Rezept umbauen (Tausch-Tabelle js/book-swaps.js).
var BOOK_KEY_LABEL={veg:'vegetarisch',vegan:'vegan',gf:'glutenfrei',lf:'laktosefrei',keto:'Keto',lc:'Low Carb',fish:'ohne Fisch',preg:'Schwangerschaft',nurs:'Stillzeit'};
function bookProfile(S){
  var p=(S&&S.dietPrefs)||[],keys=[];
  var has=function(n){return p.indexOf(n)>=0;};
  if(has('Vegan'))keys.push('vegan','veg');else if(has('Vegetarisch'))keys.push('veg');
  if(has('Glutenfrei'))keys.push('gf');
  if(has('Laktosefrei'))keys.push('lf');
  if(has('Keto'))keys.push('keto');else if(has('Low Carb'))keys.push('lc');
  if(has('Fischallergie'))keys.push('fish');
  if(S&&S.pregnant&&S.pregnant!=='0')keys.push('preg');
  if(S&&(S.nursing==='excl'||S.nursing==='part'))keys.push('nurs');
  var free=(S&&S.dietFree)?[String(S.dietFree)]:[];
  var labels=keys.filter(function(k){return !(k==='veg'&&keys.indexOf('vegan')>=0);}).map(function(k){return BOOK_KEY_LABEL[k];});
  return {keys:keys,free:free,labels:labels.concat(free),sig:keys.join(',')+(free.length?'|'+free.join(','):'')};
}
// Kleinschreibung, Umlaute aufgeloest, Satzzeichen zu Leerzeichen — darauf
// laufen die Suchmuster der Tausch-Tabelle.
function bookFold(s){
  return ' '+String(s||'').toLowerCase().replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
    .replace(/[éèê]/g,'e').replace(/[^a-z0-9]+/g,' ').trim()+' ';
}
// Kurzname einer Zutat: „Hähnchenbrust, dünn geschnitten“ → „Hähnchenbrust“,
// „Olivenöl zum Braten“ → „Olivenöl“. Nur er wird mit der Tausch-Tabelle
// verglichen — in den Notizen stecken sonst „halbiert“ (bier), „gehackt“
// (hack) oder „für den Lachs“.
function bookIngShort(g){
  return String((g&&(g.t||g.name))||'').split(/,|;| zum | zur | für | fuer | nach | oder | als | ca\. /)[0].trim();
}
// Ein Wort, das zeigt, dass die Zutat schon passt („laktosefreie Milch“) —
// sonst griffe dieselbe Zeile nach dem Umbenennen ein zweites Mal.
var BOOK_KEY_OK={veg:'vegetarisch|vegan|tofu',vegan:'vegan',gf:'glutenfrei',lf:'laktosefrei',preg:'pasteurisiert|gegart',nurs:'alkoholfrei',fish:'ohne fisch'};
// Muster einmal uebersetzen: Die Liste des Kochbuchs passt 100 Rezepte mit
// je ~10 Zutaten gegen ~70 Zeilen an — neu gebaut kostete das ~90 ms je Liste.
var _bookReCache={};
function _bookRe(src){return _bookReCache[src]||(_bookReCache[src]=new RegExp(src));}
function _bookRuleHits(rule,keys,hay,dish,fl){
  var key=null;
  for(var i=0;i<rule.k.length;i++)if(keys.indexOf(rule.k[i])>=0){key=rule.k[i];break;}
  if(!key)return null;
  if(BOOK_KEY_OK[key]&&_bookRe(BOOK_KEY_OK[key]).test(hay))return null;
  if(rule.dish&&!_bookRe(rule.dish).test(dish))return null;
  if(rule.x&&_bookRe(rule.x).test(hay))return null;
  var byName=!!(rule.m&&_bookRe(rule.m).test(hay));
  var byFlag=!!(rule.fl&&(fl||[]).some(function(f){return rule.fl.indexOf(f)>=0;}));
  return (byName||byFlag)?key:null;
}
// Angezeigter Name nach einem Tausch. {n} = bisheriger Name ohne Klammerzusatz
// der Quelle („Blätterteig (Butter)“ → „Blätterteig“); eigene Vermerke
// bleiben und werden zusammengefasst: „Blätterteig (vegan, glutenfrei)“.
var BOOK_MARK=/vegan|glutenfrei|laktosefrei|pasteurisiert|gegart|ohne /;
function _bookName(tpl,from){
  tpl=String(tpl);
  if(tpl.indexOf('{n}')<0)return tpl;
  var marks=[];
  var base=String(from).replace(/\s*\(([^)]*)\)/g,function(m0,inner){if(BOOK_MARK.test(inner))marks.push(inner);return '';}).trim();
  var out=tpl.replace('{n}',base),m=out.match(/^(.*?)\s*\(([^)]*)\)$/);
  if(m&&marks.length)return m[1]+' ('+marks.concat(m[2]).join(', ')+')';
  return marks.length?out+' ('+marks.join(', ')+')':out;
}
// Das Rezept so, wie es für dieses Profil auf den Tisch kommt. Das Rezept
// selbst bleibt unberührt; zurück kommen Kopien der Zutaten und die Liste der
// Täusche {from,to,why,k,m}. lookup(name) → {name,emoji,per100} oder null.
function adaptRecipe(r,prof,rules,lookup){
  var keys=(prof&&prof.keys)||[];
  var ings=JSON.parse(JSON.stringify((r&&r.ingredients)||[]));
  if(!keys.length||!rules||!rules.length)return {ingredients:ings,swaps:[]};
  // Gerichtsname plus Kennung des Grundrezepts: „Tamari-Lachs mit Avocado-Reis“
  // ist laut MorphCook eine Poke Bowl — roher Fisch, auch wenn der Name schweigt.
  var dish=bookFold(r.name+' '+(r.seed||'')),out=[],swaps=[];
  // Nur Zeilen, die eine der Angaben betreffen — spart die meisten Muster.
  rules=rules.filter(function(x){return x.k.some(function(k){return keys.indexOf(k)>=0;});});
  ings.forEach(function(g0){
    // Je Angabe höchstens ein Tausch je Zutat: „Kimchi (ohne Fischsauce)“
    // darf danach nicht noch über das Wort „Fischsauce“ stolpern. Eine andere
    // Angabe darf weiter tauschen (vegan → Sojasauce, glutenfrei → Tamari).
    var g=g0,done={};
    for(var round=0;round<4&&g;round++){
      var hay=bookFold((g.name||'')+' '+bookIngShort(g)),hit=null,key=null;
      var open=keys.filter(function(k){return !done[k];});
      for(var i=0;i<rules.length&&!hit;i++){
        key=_bookRuleHits(rules[i],open,hay,dish,g.fl);
        if(key)hit=rules[i];
      }
      if(!hit)break;
      var from=bookIngShort(g);
      done[key]=1;
      if(hit.rm){swaps.push({from:from,to:'',why:hit.why||'',k:key,m:hit.m||''});g=null;break;}
      /** @type {Record<string, any>|null} */
      var ng=null;
      if(hit.keep){
        ng=JSON.parse(JSON.stringify(g));
        ng.t=_bookName(hit.n||from,from);
      } else {
        var tgt=null;
        for(var j=0;j<(hit.to||[]).length&&!tgt;j++)tgt=lookup(hit.to[j]);
        if(!tgt)continue;
        var f=hit.f||1,u=String(g.u||''),grams=/^(g|gr|gramm|ml)$/i.test(u);
        ng={name:tgt.name,emoji:tgt.emoji||g.emoji,amount:Math.round((g.amount||0)*f*10)/10,per100:tgt.per100,t:_bookName(hit.n||tgt.name,from)};
        if(g.q>0&&(grams||f===1)){ng.q=Math.round(g.q*f*1000)/1000;ng.u=u;}
        if(!(ng.amount>0)&&g.missingGrams)ng.missingGrams=true;
      }
      delete ng.fl;
      ng.was=g0.was||from;
      swaps.push({from:from,to:bookIngShort(ng),why:hit.why||'',k:key,m:hit.m||''});
      g=ng;
    }
    if(g)out.push(g);
  });
  return {ingredients:out,swaps:swaps};
}
// Welche Täusche ein Zubereitungsschritt betrifft (Hinweis unter dem Schritt).
function bookStepSwaps(step,swaps){
  var hay=bookFold(step);
  return (swaps||[]).filter(function(s){
    if(s.m&&_bookRe(s.m).test(hay))return true;
    var w=bookFold(s.from).trim().split(' ')[0];
    return w.length>3&&hay.indexOf(' '+w.slice(0,Math.max(4,w.length-2)))>=0;
  });
}

// ── KI-Anfrage an Anthropic ──
// Haiku 5.5 und Sonnet 5.5 lehnen temperature≠1 ab (400) und denken sonst
// mit; das Denken zählt in max_tokens und schnitte die kurzen JSON-Antworten
// ab. Haiku: Denken aus, Aufwand low; Sonnet 5.5 kennt „aus“ nur als
// between_tools. Der neue Tokenizer zählt denselben Text ~30 % länger,
// deshalb wird max_tokens um diesen Anteil angehoben.
function anthropicBody(model,maxTok,content){
  var b={model:model,max_tokens:Math.ceil(maxTok*1.3),messages:[{role:'user',content:content}]};
  if(/haiku/.test(model)){b.thinking={type:'disabled'};b.output_config={effort:'low'};}
  else if(/sonnet/.test(model))b.thinking={type:'between_tools'};
  return b;
}

// ── KI-Antworten lesen ──
// Zutatenlisten aus Chat- und Foto-Antworten der KI (picker.js). Die KI
// liefert JSON, oft im ```json-Zaun und bei langen Antworten abgeschnitten;
// eine ungueltige Grammzahl wird null (Menge fehlt, nicht 0 g).
function parseIngJSON(text){
  try{
    var clean=text.replace(/`{3}json/gi,'').replace(/`{3}/g,'').trim();
    var a=clean.indexOf('['),z=clean.lastIndexOf(']');
    if(a===-1||z===-1||z<a){
      if(a!==-1){var lb=clean.lastIndexOf('}');if(lb>a){clean=clean.slice(a,lb+1)+']';}else return[];}
      else return[];
    } else {clean=clean.slice(a,z+1);}
    var foods=JSON.parse(clean);
    if(!Array.isArray(foods))return[];
    return foods.filter(function(f){return f&&f.name;}).map(function(f){
      var g=parseFloat(f.g);
      return{name:f.name,emoji:f.emoji||emo(f.name||''),g:isFinite(g)&&g>0?g:null};
    });
  }catch(e){return[];}
}
function parsePhotoResponse(text){
  var clean=String(text||'').replace(/`{3}json/gi,'').replace(/`{3}/g,'').trim(),err=null;
  // Je Form ein eigenes try (#298): Ein Array mit mehreren Objekten laesst den
  // Objekt-Versuch ({ bis }) scheitern und muss trotzdem den Array-Rueckfall erreichen.
  try{
    var oa=clean.indexOf('{'),oz=clean.lastIndexOf('}');
    if(oa!==-1&&oz>oa){
      var obj=JSON.parse(clean.slice(oa,oz+1));
      if(obj.zutaten&&Array.isArray(obj.zutaten)){
        return{rezept:(obj.rezept||'').trim(),zutaten:obj.zutaten.filter(function(f){return f&&f.name;}).map(function(f){var g=parseFloat(f.g);return{name:f.name,emoji:f.emoji||emo(f.name||''),g:isFinite(g)&&g>0?g:null};})};
      }
    }
  }catch(e){err=e;}
  try{
    var aa=clean.indexOf('['),az=clean.lastIndexOf(']');
    if(aa!==-1&&az>aa){
      var arr=JSON.parse(clean.slice(aa,az+1));
      if(Array.isArray(arr))return{rezept:'',zutaten:arr.filter(function(f){return f&&f.name;}).map(function(f){var g=parseFloat(f.g);return{name:f.name,emoji:f.emoji||emo(f.name||''),g:isFinite(g)&&g>0?g:null};})};
    }
  }catch(e){err=e;}
  if(err)console.error('[NutriTrack parsePhotoResponse]',err);
  return{rezept:'',zutaten:[]};
}

// ── Restaurant-Ketten (#307) ──
// Daten: window.CHAINS aus js/restaurants.js, je Produkt Werte PRO PORTION
// ({n,g,k,p,c,f,su,fi,sa}, g = Portionsgewicht in g bzw. ml). Die App rechnet
// in per100 + amount; chainPer100 liefert per100, die Portion bleibt g.
/** @param {string} s */
function chainFold(s){
  return String(s||'').toLowerCase().replace(/ä/g,'a').replace(/ö/g,'o').replace(/ü/g,'u').replace(/ß/g,'ss')
    .replace(/['’´`]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
}
/** @param {{g?:number|null,k?:number|null,p?:number|null,c?:number|null,f?:number|null,su?:number|null,fi?:number|null,sa?:number|null}} it */
function chainPer100(it){
  var g=it&&it.g;if(!(g&&g>0))return null;
  /** @param {number|null|undefined} v */
  // Drei Nachkommastellen: Die App rechnet per100 × Portion zurück, und auf
  // eine Stelle gerundet würden aus 21,6 g Fett je 576-g-Curry 21,9 g.
  function r(v){return Math.round((Number(v)||0)*100/g*1000)/1000;}
  return {kcal:r(it.k),protein:r(it.p),carbs:r(it.c),fat:r(it.f),sugar:r(it.su),fiber:r(it.fi),salt:r(it.sa)};
}
// Produkte ohne Portionsgewicht (#307, Variante „1 Portion“): Die Werte gelten
// je Portion. Gebucht wird ein Eintrag wie ein Rezept (Portionen statt Gramm)
// mit EINER Zutat, deren per100 die Portionswerte sind und deren amount 100 =
// eine Portion bedeutet (Kennzeichen pu:true, die Bearbeitung zeigt „% Port.“).
/** @param {{k?:number|null,p?:number|null,c?:number|null,f?:number|null,su?:number|null,fi?:number|null,sa?:number|null}} it */
function chainPerPortion(it){
  /** @param {number|null|undefined} v */
  function n(v){return Number(v)||0;}
  return {kcal:n(it.k),protein:n(it.p),carbs:n(it.c),fat:n(it.f),sugar:n(it.su),fiber:n(it.fi),salt:n(it.sa)};
}
/**
 * @param {string} name @param {string} emoji
 * @param {{kcal:number,protein:number,carbs:number,fat:number,sugar:number,fiber:number,salt:number}} perPortion
 * @param {number} portions
 */
function chainPortionEntry(name,emoji,perPortion,portions){
  var n=portions>0?portions:1;
  return Object.assign({name:name,emoji:emoji,isRecipe:true,portions:n,
    ingredients:[{name:name,emoji:emoji,amount:100,per100:perPortion,pu:true}]},scaleNutrients(perPortion,n));
}
var _CHAIN_STOP={bei:1,von:1,vom:1,im:1,aus:1,der:1,die:1,das:1,ein:1,eine:1,einen:1,einmal:1,vs:1};
/** @param {string} s */
function _chainTok(s){return chainFold(s).split(' ').filter(function(w){return w&&!_CHAIN_STOP[w];});}
// Tippfehler-Toleranz (#307): kurze Wörter nie, bis 7 Zeichen 1 Fehler, darüber 2
// — dieselbe Staffel wie die lokale Chat-Suche im Picker.
/** @param {number} len */
function _chainTol(len){return len<5?0:len<=7?1:2;}
/** @param {string} a @param {string} b */
function _chainLev(a,b){
  if(a===b)return 0;
  var m=a.length,n=b.length,i,j;if(!m)return n;if(!n)return m;
  var prev=[],cur=[];
  for(j=0;j<=n;j++)prev[j]=j;
  for(i=1;i<=m;i++){
    cur[0]=i;
    for(j=1;j<=n;j++)cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(a.charCodeAt(i-1)===b.charCodeAt(j-1)?0:1));
    prev=cur.slice();
  }
  return prev[n];
}
// Punkte eines Produktnamens für die Suchwörter: jedes Wort muss treffen —
// gleich 3, Wortanfang 2, zusammengeschrieben („bigmac“ in „Big Mac“) 2, im Wort
// ab 4 Zeichen 1, Tippfehler („whooper“, „nugets“) 1 —, sonst 0.
/** @param {string} name @param {string[]} qTok */
function _chainScore(name,qTok){
  var nTok=_chainTok(name),joined=nTok.join(''),sum=0;
  for(var i=0;i<qTok.length;i++){
    var q=qTok[i],best=0,j,t;
    for(j=0;j<nTok.length;j++){
      t=nTok[j];
      if(t===q){best=3;break;}
      if(t.indexOf(q)===0&&best<2)best=2;
      else if(q.length>=4&&t.indexOf(q)>0&&best<1)best=1;
    }
    if(best<2&&q.length>=4&&joined.indexOf(q)>=0)best=2;
    if(!best){
      for(j=0;j<nTok.length&&!best;j++){
        t=nTok[j];
        var tol=_chainTol(Math.max(t.length,q.length));
        if(tol&&_chainLev(t,q)<=tol)best=1;
        else if(j+1<nTok.length){
          var tt=t+nTok[j+1],tol2=_chainTol(Math.max(tt.length,q.length));
          if(tol2&&_chainLev(tt,q)<=tol2)best=1;
        }
      }
    }
    if(!best)return 0;
    sum+=best;
  }
  // Ganzer Name getroffen („whopper“ vor „Double Whopper“, auch „bigmac“,
  // „whooper“): genau +10, mit einem Tippfehler +8 (nur einem: sonst wäre
  // „whopper“ schon fast „Whopper Jr.“)
  var qj=qTok.join('');
  if(qj===joined)sum+=10;
  else if(_chainTol(joined.length)&&_chainLev(qj,joined)<=1)sum+=8;
  return sum;
}
// Kettenname in der Anfrage: 1–3 Wörter zusammengezogen gegen jeden Namen/Alias
// ohne Leerzeichen („mc donald's“ = „mcdonalds“). Ab 6 Zeichen auch mit
// Tippfehler („mcdonals“, „burgerkin“, „subwy“). Mehr Wörter vor weniger
// („dean davd“ ganz, nicht nur „dean“), genau vor ungefähr, länger vor kürzer.
// → {chain, rest} oder null.
/** @param {Array<{id:string,n:string,a?:string[],items:Array<any>}>} chains @param {string[]} tok */
function _chainFind(chains,tok){
  var best=null,bestScore=0;
  for(var ci=0;ci<chains.length;ci++){
    var c0=chains[ci],als=[c0.n].concat(c0.a||[]);
    for(var ai=0;ai<als.length;ai++){
      var sa=chainFold(als[ai]).replace(/ /g,'');if(!sa)continue;
      for(var i=0;i<tok.length;i++){
        for(var w=1;w<=3&&i+w<=tok.length;w++){
          var s=tok.slice(i,i+w).join(''),sc=0;
          if(s===sa)sc=w*1000+500+sa.length;
          else if(sa.length>=6&&_chainLev(s,sa)<=(sa.length>=10?2:1))sc=w*1000+sa.length;
          if(sc>bestScore){bestScore=sc;best={chain:c0,rest:tok.slice(0,i).concat(tok.slice(i+w))};}
        }
      }
    }
  }
  return best;
}
// Ketten, deren Name oder Alias (ohne Leerzeichen) mit der Anfrage anfängt;
// half: die Anfrage deckt mindestens die Hälfte des Namens ab.
/**
 * @template {{n:string,a?:string[]}} T
 * @param {T[]} chains @param {string[]} tok @param {number} min @param {boolean} [half]
 * @returns {T[]}
 */
function _chainPrefix(chains,tok,min,half){
  var pre=tok.join('');if(pre.length<min)return [];
  return chains.filter(function(c){
    return [c.n].concat(c.a||[]).some(function(a){
      var sa=chainFold(a).replace(/ /g,'');
      return sa.indexOf(pre)===0&&(!half||pre.length*2>=sa.length);
    });
  });
}
/** @param {Array<{items:Array<{n:string}>}>} chains @param {string} w */
function _chainIsWord(chains,w){
  return chains.some(function(c){return c.items.some(function(it){return _chainTok(it.n).indexOf(w)>=0;});});
}
// Suche über alle Ketten. Steht ein Kettenname (oder Alias wie „mces“, „bk“)
// in der Anfrage, zählt nur diese Kette: ohne weitere Wörter — oder wenn die
// nichts treffen — kommt ihr ganzes Sortiment (named:true). Ohne Kettennamen
// muss jedes Wort einen Produktnamen treffen („big mac“, „bigmac“, „whooper“).
// Ergebnis: [{chain,item,score,named}], beste zuerst, sonst Reihenfolge der Daten.
/**
 * @param {Array<{id:string,n:string,a?:string[],items:Array<any>}>} chains
 * @param {string} q
 * @returns {Array<{chain:any,item:any,score:number,named:boolean}>}
 */
function chainSearch(chains,q){
  var tok=chainFold(q).split(' ').filter(Boolean);
  var hit=_chainFind(chains||[],tok);
  // Halb getippter Kettenname beim Tippen („Subw“, „burger k“, „peter p“):
  // mindestens 4 Zeichen und die Hälfte des Namens, und das letzte Wort ist
  // kein ganzes Produktwort — sonst zeigte „burger“ nur Burger King
  if(!hit&&tok.length){
    var pc=_chainPrefix(chains||[],tok,4,true);
    if(pc.length===1&&!_chainIsWord(chains||[],tok[tok.length-1]))hit={chain:pc[0],rest:[]};
  }
  /** @type {Array<{chain:any,item:any,score:number,named:boolean,i:number}>} */
  var out=[];
  if(hit){
    var ch=hit.chain,rt=_chainTok(hit.rest.join(' '));
    ch.items.forEach(function(it,i){var s=rt.length?_chainScore(it.n,rt):1;if(s>0)out.push({chain:ch,item:it,score:s,named:true,i:i});});
    if(!out.length)ch.items.forEach(function(it,i){out.push({chain:ch,item:it,score:0,named:true,i:i});});
  }else{
    var qt=_chainTok(q);if(!qt.length)return [];
    var n=0;
    (chains||[]).forEach(function(c){c.items.forEach(function(it){var s=_chainScore(it.n,qt);if(s>0)out.push({chain:c,item:it,score:s,named:false,i:n});n++;});});
    // Halb getippter Kettenname, der kein Produkt trifft („Sta“ → Starbucks)
    if(!out.length)_chainPrefix(chains||[],tok,3).forEach(function(c){
      c.items.forEach(function(it,i){out.push({chain:c,item:it,score:0,named:true,i:i});});
    });
  }
  // Gleichstand bei einer Suche: kürzerer Name zuerst; das ganze Sortiment
  // (Punkte ≤ 1) bleibt in der Reihenfolge der Daten
  out.sort(function(a,b){return b.score-a.score||(a.score>1?_chainTok(a.item.n).length-_chainTok(b.item.n).length:0)||a.i-b.i;});
  return out.map(function(x){return {chain:x.chain,item:x.item,score:x.score,named:x.named};});
}
