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
function emo(n){
  var nl=(n||'').toLowerCase();
  /** @type {Array<[RegExp,string]>} */
  var m=[[/banane/,'🍌'],[/apfel|äpfel/,'🍎'],[/birne/,'🍐'],[/orange|mandarine/,'🍊'],[/erdbeere/,'🍓'],[/blaubeer|heidelbeer/,'🫐'],[/himbeere/,'🫐'],[/kirsch/,'🍒'],[/trauben/,'🍇'],[/kiwi/,'🥝'],[/mango/,'🥭'],[/avocado/,'🥑'],[/melone/,'🍉'],[/pfirsich|nektarine/,'🍑'],[/tomate/,'🍅'],[/gurke/,'🥒'],[/karott|möhre/,'🥕'],[/brokkoli/,'🥦'],[/blumenkohl/,'🥦'],[/spinat/,'🥬'],[/salat|rucola|kohl/,'🥬'],[/paprika/,'🫑'],[/pilz|champignon/,'🍄'],[/kartoffel/,'🥔'],[/süßkartoffel/,'🍠'],[/mais/,'🌽'],[/hähnchen|huhn|chicken|hühnerbrust/,'🍗'],[/rind|beef|hack/,'🥩'],[/pute|turkey/,'🦃'],[/lachs|salmon/,'🐟'],[/thunfisch|tuna/,'🐠'],[/garnele|shrimp/,'🦐'],[/\bei\b|eier|egg/,'🥚'],[/milch|milk/,'🥛'],[/käse|cheese/,'🧀'],[/joghurt|yogurt/,'🥣'],[/quark/,'🥄'],[/butter/,'🧈'],[/brot|bread/,'🍞'],[/brötchen/,'🥖'],[/haferflocken|oat/,'🌾'],[/müsli|granola/,'🥣'],[/reis|rice/,'🍚'],[/pasta|nudel|spaghetti/,'🍝'],[/mandel|cashew|erdnuss|walnuss|nuss/,'🥜'],[/chiasamen|sesam/,'🌱'],[/öl|oil/,'🫙'],[/linsen|bohne|kichererbse/,'🫘'],[/tofu|tempeh/,'🧆'],[/schokolade|chocolate|nutella/,'🍫'],[/chips/,'🥔'],[/honig|honey/,'🍯'],[/protein|whey/,'💪'],[/pizza/,'🍕'],[/burger|hamburger/,'🍔'],[/pommes/,'🍟'],[/sushi/,'🍣'],[/döner/,'🥙'],[/kaffee|coffee|espresso/,'☕'],[/tee|tea/,'🍵'],[/saft|juice/,'🧃'],[/cola/,'🥤'],[/bier|beer/,'🍺'],[/wein|wine/,'🍷'],[/salami|speck|schinken|wurst|fleischsalat/,'🍖'],[/skyr/,'🥛'],[/marmelade/,'🍓']];
  for(var i=0;i<m.length;i++)if(m[i][0].test(nl))return m[i][1];
  return'🍽';
}

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

