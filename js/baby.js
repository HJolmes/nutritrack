// NutriTrack – Baby-Tagebuch (v0.225)
// Klassisches Script, kein Modul. Exportiert window.NTBaby und greift direkt auf
// die globalen Helfer aus index.html zu (S, saveS, renderAll, openOv, closeOv,
// esc, fmtDate, showToast, PROJECT_WORKER_BASE).
//
// Bewusst unabhängig von Schwangerschaft/Stillzeit: aktiviert wird das Tagebuch
// über den eigenen Schalter S.babyOn (seit v0.253: Mehr → Funktionen, oder an
// der Kachel über ⋯), damit es auch Väter,
// Partner und Betreuende führen können.
//
// Daten liegen in S.babyLog (eigener Schlüssel, NICHT in S.days) – sonst würde
// compressOldDays() die Einträge nach 90 Tagen mit den Mahlzeiten wegräumen.
// S wird komplett gesichert (backupState), das Tagebuch ist damit automatisch
// Teil jedes Backups.
(function(){
'use strict';

var TYPES={
  breast:{ic:'🤱',label:'Stillen'},
  bottle:{ic:'🍼',label:'Flasche'},
  diaper:{ic:'👶',label:'Windel'},
  temp:  {ic:'🌡️',label:'Temperatur'},
  sleep: {ic:'😴',label:'Schlaf'},
  note:  {ic:'📝',label:'Notiz'},
  // seit v0.263
  solid: {ic:'🥣',label:'Beikost'},
  pump:  {ic:'🍶',label:'Abpumpen'},
  med:   {ic:'💊',label:'Medizin'},
  growth:{ic:'📏',label:'Messung'},
  appt:  {ic:'📅',label:'Termin'}
};
// Mahlzeiten des Babys – daraus rechnet „letzte Mahlzeit vor …".
var FEEDS={breast:1,bottle:1,solid:1};
// Messung und Termin gehören zu einem frei gewählten Datum, nicht zum gerade
// angezeigten Tag (Werte aus dem U-Heft nachtragen, Termin in drei Wochen).
var DATED={growth:1,appt:1};
var REACTION={none:'keine Reaktion',skin:'Hautausschlag',tummy:'Bauchweh/Blähungen',vomit:'Erbrechen',diarr:'Durchfall',other:'andere Reaktion'};
var APPT={u:'U-Untersuchung',vacc:'Impfung',doc:'Kinderarzt',mw:'Hebamme',other:'Termin'};
var SIDES={l:'Links',r:'Rechts',b:'Beide'};
// Bei „Beide" trinkt ein Baby fast nie gleich viel an beiden Seiten. Die
// Hauptseite (e.main) hält fest, an welcher es überwiegend getrunken hat –
// nur daraus lässt sich sagen, welche Seite beim nächsten Mal dran ist.
function sideLabel(e){
  var s=SIDES[e&&e.side]||'';
  if(e&&e.side==='b'&&SIDES[e.main])s+=' (haupt. '+SIDES[e.main]+')';
  return s;
}
// Die für die Alternation maßgebliche Seite eines Still-Eintrags: bei „Beide"
// die Hauptseite, sonst die Seite selbst. Leer = Eintrag sagt nichts darüber.
function effSide(e){
  if(e.side==='l'||e.side==='r')return e.side;
  if(e.side==='b'&&(e.main==='l'||e.main==='r'))return e.main;
  return '';
}
var BOTTLE={mm:'Muttermilch',pre:'Pre-Nahrung',folge:'Folgemilch'};
var DIAPER={pee:'💧 Pipi',poo:'💩 Stuhl',both:'💧💩 Beides'};
var TEMP_SITE={rektal:'rektal',ohr:'Ohr',stirn:'Stirn',axillar:'Achsel'};
// Fiebergrenze laut gängiger pädiatrischer Definition
var FEVER=38.0;

// Werksbelegung der Schnell-Knöpfe. Wird nur gesetzt, wenn S.babyQuick fehlt –
// eigene Knöpfe des Nutzers werden nie überschrieben.
var QUICK_DEFAULTS=[
  {id:'qd1',icon:'🤱',label:'Links',   t:'breast',p:{side:'l'}},
  {id:'qd2',icon:'🤱',label:'Rechts',  t:'breast',p:{side:'r'}},
  {id:'qd3',icon:'💧',label:'Pipi',    t:'diaper',p:{kind:'pee'}},
  {id:'qd4',icon:'💩',label:'Stuhl',   t:'diaper',p:{kind:'poo'}}
];
var QUICK_MAX=10;

var _editId=null;
var _quickEditId=null;

function pad(n){return n<10?'0'+n:''+n;}
function _today(){var d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function dayKey(){return (typeof S!=='undefined'&&S.currentDate)||_today();}
function uid(){return 'b'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);}

// Revisionsnummer für den Sync: streng monoton, auch wenn die Geräteuhr
// zurückspringt (Zeitzone, manuelle Korrektur) – sonst „gewinnt" beim Merge
// eine ältere Änderung.
var _lastRev=0;
function nextRev(){
  var r=Math.max(Date.now(),_lastRev+1);
  _lastRev=r;
  return r;
}

function log(key){
  S.babyLog=S.babyLog||{};
  key=key||dayKey();
  if(!S.babyLog[key])S.babyLog[key]=[];
  return S.babyLog[key];
}
function sorted(key){
  return log(key).slice().sort(function(a,b){return (a.ts||0)-(b.ts||0);});
}
function hhmm(ts){var d=new Date(ts);return pad(d.getHours())+':'+pad(d.getMinutes());}
// Uhrzeit-String (HH:MM) auf den angezeigten Tag beziehen, nicht auf "jetzt" –
// sonst landen Einträge beim Zurückblättern am falschen Datum.
function tsFor(key,timeStr){
  var p=(key||'').split('-'),t=(timeStr||'').split(':');
  if(p.length!==3)return Date.now();
  var d=new Date(+p[0],+p[1]-1,+p[2],parseInt(t[0],10)||0,parseInt(t[1],10)||0,0,0);
  return d.getTime();
}
function nowTimeOnDay(key){
  var n=new Date();
  return (key===_today())?pad(n.getHours())+':'+pad(n.getMinutes()):'12:00';
}
function byId(id,key){return log(key).find(function(e){return e.id===id;});}
// Ein Eintrag kann beim Bearbeiten den Tag wechseln (Uhrzeit-Korrektur über
// Mitternacht) und per Sync an einem anderen Tag ankommen – deshalb global suchen.
function findAnywhere(id){
  S.babyLog=S.babyLog||{};
  var keys=Object.keys(S.babyLog);
  for(var i=0;i<keys.length;i++){
    var arr=S.babyLog[keys[i]]||[];
    for(var j=0;j<arr.length;j++)if(arr[j].id===id)return {day:keys[i],idx:j,e:arr[j]};
  }
  return null;
}

function add(entry,key){
  key=key||dayKey();
  entry.id=entry.id||uid();
  if(!entry.ts)entry.ts=tsFor(key,nowTimeOnDay(key));
  entry.rev=nextRev();
  log(key).push(entry);
  saveS();
  Sync.schedule();
  refresh();
  return entry;
}
function remove(id,key){
  var hit=findAnywhere(id)||(key?{day:key,idx:log(key).findIndex(function(e){return e.id===id;})}:null);
  if(!hit||hit.idx<0)return;
  S.babyLog[hit.day].splice(hit.idx,1);
  // Grabstein, damit die Löschung auch auf dem anderen Gerät ankommt
  S.babyTomb=S.babyTomb||{};
  S.babyTomb[id]={rev:nextRev(),day:hit.day};
  saveS();
  Sync.schedule();
  refresh();
}

function refresh(){
  renderCard();
  if(isOpen('babyOv'))renderDiary();
}
function isOpen(id){
  var el=document.getElementById(id);
  return !!(el&&el.classList.contains('open'));
}

// ── Alter des Babys, rein informativ ──
function ageText(){
  var b=(S.baby&&S.baby.birth)||'';
  if(!b)return '';
  var p=b.split('-');if(p.length!==3)return '';
  var birth=new Date(+p[0],+p[1]-1,+p[2]);
  var days=Math.floor((new Date()-birth)/86400000);
  if(days<0)return '';
  if(days<14)return days+' Tage alt';
  if(days<70)return Math.floor(days/7)+' Wochen alt';
  var months=Math.floor(days/30.44);
  if(months<24)return months+' Monate alt';
  return Math.floor(months/12)+' Jahre alt';
}

// ── Zusammenfassung eines Tages ──
function summary(key){
  // Nur lesen: log() legte für jeden abgefragten Tag ein leeres Array an – der
  // Verlauf (js/baby-week.js) fragt 14 Tage auf einmal ab.
  var arr=logRO(key);
  var s={breast:0,breastMin:0,bottle:0,ml:0,diaper:0,pee:0,poo:0,temp:null,sleepMin:0,sleepOpen:null,solid:0,pump:0,pumpMl:0,med:0};
  arr.forEach(function(e){
    if(e.t==='breast'){s.breast++;s.breastMin+=parseInt(e.min,10)||0;}
    else if(e.t==='solid')s.solid++;
    else if(e.t==='pump'){s.pump++;s.pumpMl+=parseInt(e.ml,10)||0;}
    else if(e.t==='med')s.med++;
    else if(e.t==='bottle'){s.bottle++;s.ml+=parseInt(e.ml,10)||0;}
    else if(e.t==='diaper'){s.diaper++;if(e.kind==='poo'||e.kind==='both')s.poo++;if(e.kind==='pee'||e.kind==='both')s.pee++;}
    else if(e.t==='temp'){if(!s.temp||e.ts>s.temp.ts)s.temp=e;}
    // Schlaf wird unten über sleepSegments() gezählt – tagesgenau, auch wenn er
    // über Mitternacht läuft und deshalb an einem anderen Tag gespeichert ist.
  });
  sleepSegments(key).forEach(function(seg){
    s.sleepMin+=seg.min;
    if(seg.live)s.sleepOpen=seg;
  });
  return s;
}
// ── Schlaf über Mitternacht ──
// Ein Schlaf-Eintrag bleibt immer an seinem Starttag gespeichert (ein Datensatz,
// eine Bearbeitung, ein Sync-Objekt). Für Anzeige und Tages-Summe wird er aber
// am Mitternachts-Schnitt geteilt: 22:50–24:00 gehört zum Starttag, 00:00–00:06
// zum Folgetag. Sonst stehen sämtliche Nachtminuten am Vortag und der Folgetag
// weiß nichts von dem Schlaf – auch nicht, dass gerade noch geschlafen wird.
function dayStart(key){return tsFor(key,'00:00');}
// Lesender Zugriff ohne Seiteneffekt – log() würde für jeden geprüften Tag ein
// leeres Array anlegen und damit Speicher und Sync mit Leertagen zumüllen.
function logRO(key){return (S.babyLog&&S.babyLog[key])||[];}
// Absolute Zeitspanne eines Eintrags, unabhängig vom Tag, an dem er liegt.
function sleepSpan(day,e){
  if(!e||e.t!=='sleep'||!e.from)return null;
  var f=tsFor(day,e.from),t;
  if(e.to){
    t=tsFor(day,e.to);
    // Ende vor Beginn = über Mitternacht. Über addDayKey statt +86400000, damit
    // die Zeitumstellung nicht eine Stunde dazu erfindet oder verschluckt.
    if(t<f)t=tsFor(addDayKey(day,1),e.to);
  }else{
    t=Date.now();
    if(t<f)return null;// offener Schlaf, dessen Beginn noch in der Zukunft liegt
  }
  return {from:f,to:t};
}
// Anteil eines Eintrags am Tag `key` – oder null, wenn er dort nicht hineinragt.
function sleepSeg(key,day,e){
  var sp=sleepSpan(day,e);
  if(!sp)return null;
  var a=dayStart(key),b=dayStart(addDayKey(key,1));
  if(sp.from>=b)return null;         // beginnt erst nach diesem Tag
  if(sp.from<a&&sp.to<=a)return null;// war schon vor diesem Tag zu Ende
  var s=Math.max(sp.from,a),t=Math.min(sp.to,b);
  return {
    e:e,day:day,key:key,start:s,end:t,
    min:Math.max(0,Math.round((t-s)/60000)),
    totalMin:Math.max(0,Math.round((sp.to-sp.from)/60000)),
    cont:sp.from<a,      // begann am Vortag
    spill:sp.to>b,       // reicht in den Folgetag
    open:!e.to,
    live:!e.to&&key===_today()// läuft gerade – nur dann „Wach jetzt"
  };
}
// Alle Schlaf-Segmente eines Tages, chronologisch. Der Vortag wird mitgeprüft,
// weil ein um 22:50 begonnener Schlaf dort gespeichert ist.
function sleepSegments(key){
  key=key||dayKey();
  var out=[];
  [addDayKey(key,-1),key].forEach(function(d){
    logRO(d).forEach(function(e){
      if(e.t!=='sleep'||!e.from)return;
      var seg=sleepSeg(key,d,e);
      if(seg)out.push(seg);
    });
  });
  out.sort(function(a,b){return a.start-b.start;});
  return out;
}
// Überschrift eines Segments – immer innerhalb des angezeigten Tages lesbar.
function segTitle(seg){
  var s=seg.cont?'00:00':seg.e.from;
  if(seg.spill)return 'Schlaf '+s+'–24:00';
  if(seg.open)return seg.cont?('Schläft seit gestern '+seg.e.from):('Schläft seit '+seg.e.from);
  return 'Schlaf '+s+'–'+seg.e.to;
}
// Zeilen eines Tages: normale Einträge plus Schlaf-Segmente (die auch vom Vortag
// stammen können). Gemeinsame Quelle für Heute-Kachel und Tagebuch-Timeline.
function dayRows(key){
  var rows=sleepSegments(key).map(function(seg){
    return {ts:seg.start,seg:seg,e:seg.e};
  });
  sorted(key).forEach(function(e){
    if(e.t==='sleep'&&e.from)return;// steckt bereits als Segment in der Liste
    rows.push({ts:e.ts||0,e:e,seg:null});
  });
  rows.sort(function(a,b){return a.ts-b.ts;});
  return rows;
}
function rowTitle(r){return r.seg?segTitle(r.seg):entryTitle(r.e);}
function fmtDur(min){
  var h=Math.floor(min/60),m=min%60;
  return h?(h+' h '+m+' Min.'):(m+' Min.');
}
// Laufender Schlaf: letzter Eintrag mit Beginn, aber ohne Ende. Auch der Vortag
// wird geprüft – ein um 23:40 begonnener Schlaf endet nach Mitternacht.
function openSleep(key){
  key=key||dayKey();
  var days=[key,addDayKey(key,-1)];
  for(var d=0;d<days.length;d++){
    var arr=sorted(days[d]).filter(function(e){return e.t==='sleep'&&e.from&&!e.to;});
    if(arr.length)return {e:arr[arr.length-1],day:days[d]};
  }
  return null;
}
function addDayKey(key,delta){
  var p=(key||'').split('-');
  if(p.length!==3)return key;
  var d=new Date(+p[0],+p[1]-1,+p[2]);
  d.setDate(d.getDate()+delta);
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
}
// Laufenden Schlaf beenden – ein Tipp statt „Eintrag bearbeiten".
function endSleep(id){
  var hit=findAnywhere(id);
  if(!hit||hit.e.t!=='sleep'||hit.e.to)return;
  var n=new Date();
  hit.e.to=pad(n.getHours())+':'+pad(n.getMinutes());
  hit.e.rev=nextRev();
  saveS();
  Sync.schedule();
  refresh();
  showToast('Wach um '+hit.e.to+' ✓');
}
// ── Stillen mit Stoppuhr (v0.263) ──
// Ein laufendes Stillen ist ein normaler Still-Eintrag mit `run:1`; ts ist der
// Beginn. Stopp rechnet die Minuten aus und nimmt `run` weg. So reist die
// laufende Stoppuhr per Sync mit, und ein zweites Gerät kann sie beenden.
function runningFeed(){
  var t=_today(),days=[t,addDayKey(t,-1)];
  for(var d=0;d<days.length;d++){
    var arr=logRO(days[d]).filter(function(e){return e.t==='breast'&&e.run;});
    if(arr.length){arr.sort(function(a,b){return (a.ts||0)-(b.ts||0);});return arr[arr.length-1];}
  }
  return null;
}
function startFeed(side){
  if(!S.babyOn)return;
  if(runningFeed()){showToast('Die Stoppuhr läuft schon');return;}
  var key=_today();
  side=side||nextSide(key)||'l';
  add({t:'breast',side:side,run:1,ts:Date.now()},key);
  showToast('⏱ Stillen '+SIDES[side]+' läuft');
}
function stopFeed(silent){
  var e=runningFeed();
  if(!e)return null;
  e.min=Math.max(1,Math.round((Date.now()-(e.ts||Date.now()))/60000));
  delete e.run;
  e.rev=nextRev();
  saveS();
  Sync.schedule();
  refresh();
  if(!silent)showToast('🤱 '+SIDES[e.side]+' · '+e.min+' Min. eingetragen ✓');
  return e;
}
// Seite wechseln = laufende Seite beenden, andere sofort starten.
function switchFeed(){
  var e=stopFeed(true);
  if(!e)return;
  var other=e.side==='l'?'r':'l';
  add({t:'breast',side:other,run:1,ts:Date.now()},_today());
  showToast('⇄ Jetzt '+SIDES[other]+' ('+SIDES[e.side]+' '+e.min+' Min.)');
}
// Letzte Mahlzeit über die letzten Tage – beantwortet nachts „wann zuletzt?".
function lastFeed(){
  var t=_today(),now=Date.now(),best=null;
  for(var i=0;i<4;i++){
    logRO(addDayKey(t,-i)).forEach(function(e){
      if(!FEEDS[e.t]||!e.ts||e.ts>now)return;
      if(!best||e.ts>best.ts)best=e;
    });
    if(best)break;
  }
  return best;
}
function sinceText(ts){
  var min=Math.max(0,Math.floor((Date.now()-ts)/60000));
  if(min<1)return 'gerade eben';
  return 'vor '+fmtDur(min);
}
function feedLineHtml(){
  var run=runningFeed();
  if(run){
    var m=Math.max(0,Math.floor((Date.now()-run.ts)/60000));
    return '<div class="bby-run"><span>⏱ Stillt '+esc(SIDES[run.side]||'')+' seit '+fmtDur(m)+'</span>'
      +'<span style="display:flex;gap:6px;">'
      +'<button type="button" class="bby-pill" data-act="NTBaby.switchFeed">⇄ Seite</button>'
      +'<button type="button" class="bby-pill on" data-act="NTBaby.stopFeed">■ Stopp</button></span></div>';
  }
  var f=lastFeed();
  if(!f)return '';
  return '<span style="color:var(--mu);">🍼 Letzte Mahlzeit </span><b>'+sinceText(f.ts)+'</b>'
    +'<span style="color:var(--mu);"> · '+hhmm(f.ts)+' '+esc(entryTitle(f))+'</span>';
}

function summaryText(key){
  var s=summary(key);
  var parts=[];
  if(s.breast)parts.push(s.breast+'× gestillt'+(s.breastMin?' ('+s.breastMin+' Min.)':''));
  if(s.bottle)parts.push(s.bottle+'× Flasche'+(s.ml?' ('+s.ml+' ml)':''));
  if(s.solid)parts.push(s.solid+'× Beikost');
  if(s.pump)parts.push(s.pumpMl+' ml abgepumpt');
  if(s.diaper)parts.push(s.diaper+(s.diaper===1?' Windel':' Windeln')+(s.poo?' · '+s.poo+'× 💩':''));
  if(s.sleepMin)parts.push('Schlaf '+fmtDur(s.sleepMin)+(s.sleepOpen?' (schläft noch)':''));
  else if(s.sleepOpen)parts.push('schläft seit '+(s.sleepOpen.cont?'gestern ':'')+s.sleepOpen.e.from);
  if(s.temp)parts.push('🌡️ '+fmtTemp(s.temp.c)+' °C');
  return parts.join(' · ');
}
// Zahl mit bis zu `dec` Nachkommastellen, deutsches Komma, ohne Null-Schwanz.
function fmtNum(v,dec){
  var x=(parseFloat(v)||0).toFixed(dec);
  if(x.indexOf('.')>=0)x=x.replace(/0+$/,'').replace(/\.$/,'');
  return x.replace('.',',');
}
function fmtTemp(c){return (Math.round((parseFloat(c)||0)*10)/10).toFixed(1).replace('.',',');}
function isFever(c){return (parseFloat(c)||0)>=FEVER;}

// ── Eintrags-Zeile als Text ──
function entryTitle(e){
  if(e.t==='breast')return 'Stillen · '+sideLabel(e)+(e.run?' · läuft':(e.min?' · '+e.min+' Min.':''));
  if(e.t==='solid')return 'Beikost · '+(e.food||'?')+(e.amount?' · '+e.amount:'')+(e.first?' · neu':'')+(e.react&&e.react!=='none'?' · ⚠️ '+(REACTION[e.react]||''):'');
  if(e.t==='pump')return 'Abgepumpt · '+(e.ml||0)+' ml'+(SIDES[e.side]?' · '+SIDES[e.side]:'');
  if(e.t==='med')return (e.name||'Medizin')+(e.dose?' · '+e.dose:'');
  if(e.t==='growth'){
    var g=[];
    if(e.g)g.push(fmtNum(e.g/1000,3)+' kg');
    if(e.cm)g.push(fmtNum(e.cm,1)+' cm');
    if(e.hc)g.push('Kopf '+fmtNum(e.hc,1)+' cm');
    return 'Messung · '+(g.join(' · ')||'–');
  }
  if(e.t==='appt')return (e.title||APPT[e.kind]||'Termin')+(e.kind&&e.title&&APPT[e.kind]?' ('+APPT[e.kind]+')':'');
  if(e.t==='bottle')return 'Flasche · '+(e.ml||0)+' ml'+(BOTTLE[e.kind]?' · '+BOTTLE[e.kind]:'');
  if(e.t==='diaper'){
    var d=DIAPER[e.kind]||'Windel';
    var extra=[];
    if(e.color)extra.push(e.color);
    if(e.cons)extra.push(e.cons);
    return d+(extra.length?' · '+extra.join(', '):'');
  }
  if(e.t==='temp')return fmtTemp(e.c)+' °C'+(TEMP_SITE[e.site]?' · '+TEMP_SITE[e.site]:'');
  if(e.t==='sleep'){
    if(e.from&&e.to)return 'Schlaf '+e.from+'–'+e.to+(e.to<e.from?' (+1 Tag)':'');
    if(e.from)return 'Schläft seit '+e.from;
    if(e.to)return 'Wach um '+e.to;
    return 'Schlaf';
  }
  if(e.t==='note')return e.text||'Notiz';
  return '';
}

// ════════════════════════════════════════
// SCHNELL-KNÖPFE (frei konfigurierbar)
// ════════════════════════════════════════
function ensureQuick(){
  if(!Array.isArray(S.babyQuick)||!S.babyQuick.length){
    S.babyQuick=JSON.parse(JSON.stringify(QUICK_DEFAULTS));
  }
  return S.babyQuick;
}
function quickBtnHtml(q,small){
  var pad=small?'6px':'8px 6px',fs=small?'11px':'12px';
  return '<button type="button" onclick="NTBaby.quick(\''+esc(q.id)+'\')" '
    +'style="flex:1;min-width:70px;background:var(--gl);border:1.5px solid var(--g3);border-radius:8px;padding:'+pad+';font-size:'+fs+';font-weight:700;color:var(--g1);">'
    +esc(q.icon||'•')+' '+esc(q.label||'')+'</button>';
}
function renderQuickBtns(){
  var qs=ensureQuick();
  var a=document.getElementById('babyQuickBtns');
  if(a)a.innerHTML=qs.map(function(q){return quickBtnHtml(q,true);}).join('');
  var b=document.getElementById('babyOvQuickBtns');
  if(b)b.innerHTML=qs.map(function(q){return quickBtnHtml(q,false);}).join('');
}
// Ein Tipp = fertiger Eintrag mit aktueller Uhrzeit, ohne Dialog.
function quick(qid){
  if(!S.babyOn)return;
  var q=ensureQuick().find(function(x){return x.id===qid;});
  if(!q)return;
  var key=dayKey();
  // Schlaf ist ein Umschalter: schläft gerade niemand -> Beginn eintragen,
  // läuft ein Schlaf -> ihn beenden. Kein Dialog, kein Nachtragen.
  if(q.t==='sleep'){
    var open=openSleep(key);
    if(open){endSleep(open.e.id);return;}
    var n=new Date();
    var hhmmNow=pad(n.getHours())+':'+pad(n.getMinutes());
    add({t:'sleep',from:hhmmNow,to:'',ts:tsFor(key,hhmmNow)},key);
    showToast('😴 Schläft seit jetzt ✓');
    return;
  }
  // Stoppuhr-Knopf: erster Tipp startet, der nächste stoppt.
  if(q.t==='breast'&&q.p&&q.p.timer){
    if(runningFeed())stopFeed();else startFeed(q.p.side);
    return;
  }
  var e=Object.assign({t:q.t},JSON.parse(JSON.stringify(q.p||{})));
  // „Nächste Seite"-Vorschlag nur, wenn der Knopf keine Seite vorgibt
  if(q.t==='breast'&&!e.side)e.side=nextSide(key)||'l';
  // „Beide" ohne feste Hauptseite: den Vorschlag als Hauptseite eintragen,
  // sonst reißt die Alternation ab. Im Eintrag jederzeit korrigierbar.
  if(q.t==='breast'&&e.side==='b'&&!e.main){var sug=nextSide(key);if(sug)e.main=sug;}
  add(e,key);
  showToast((q.icon||'')+' '+(q.label||'Eintrag')+' eingetragen ✓');
}

function openQuickManage(){
  renderQuickManage();
  openOv('babyQuickOv');
}
function renderQuickManage(){
  var qs=ensureQuick();
  var list=document.getElementById('babyQuickList');
  if(!list)return;
  list.innerHTML=qs.map(function(q,i){
    return '<div class="fe" style="cursor:default;">'
      +'<div class="fee">'+esc(q.icon||'•')+'</div>'
      +'<div class="fei" onclick="NTBaby.openQuickEdit(\''+esc(q.id)+'\')" style="cursor:pointer;">'
        +'<div class="fen">'+esc(q.label||'')+'</div>'
        +'<div class="fem">'+esc(quickSubtitle(q))+'</div></div>'
      +'<div style="display:flex;gap:2px;flex-shrink:0;">'
        +'<button type="button" onclick="NTBaby.moveQuick(\''+esc(q.id)+'\',-1)" '+(i===0?'disabled ':'')+'style="background:none;border:none;font-size:16px;padding:4px 6px;color:'+(i===0?'#ddd':'var(--mu)')+';">↑</button>'
        +'<button type="button" onclick="NTBaby.moveQuick(\''+esc(q.id)+'\',1)" '+(i===qs.length-1?'disabled ':'')+'style="background:none;border:none;font-size:16px;padding:4px 6px;color:'+(i===qs.length-1?'#ddd':'var(--mu)')+';">↓</button>'
        +'<button type="button" onclick="NTBaby.openQuickEdit(\''+esc(q.id)+'\')" style="background:none;border:none;font-size:14px;padding:4px 6px;">✏️</button>'
        +'<button type="button" onclick="NTBaby.deleteQuick(\''+esc(q.id)+'\')" style="background:none;border:none;font-size:14px;padding:4px 6px;">🗑</button>'
      +'</div></div>';
  }).join('');
  var addBtn=document.getElementById('babyQuickAddBtn');
  if(addBtn)addBtn.style.display=(qs.length>=QUICK_MAX)?'none':'block';
}
function quickSubtitle(q){
  var t=(TYPES[q.t]&&TYPES[q.t].label)||q.t;
  var p=q.p||{};
  var det=[];
  if(q.t==='breast'){det.push(p.side?sideLabel(p):'Seite wird vorgeschlagen');if(p.timer)det.push('Stoppuhr');else if(p.min)det.push(p.min+' Min.');}
  else if(q.t==='pump'){if(p.ml)det.push(p.ml+' ml');if(p.side)det.push(SIDES[p.side]);}
  else if(q.t==='bottle'){if(p.ml)det.push(p.ml+' ml');if(p.kind)det.push(BOTTLE[p.kind]||'');}
  else if(q.t==='diaper'){det.push((DIAPER[p.kind]||'').replace(/^[^ ]+ /,''));}
  else if(q.t==='temp'){det.push('Dialog öffnet sich');}
  else if(q.t==='sleep'){det.push('Umschalter: einschlafen / aufwachen');}
  else if(q.t==='note'){if(p.text)det.push('„'+p.text+'"');}
  return t+(det.filter(Boolean).length?' · '+det.filter(Boolean).join(' · '):'');
}
function moveQuick(id,dir){
  var qs=ensureQuick();
  var i=qs.findIndex(function(q){return q.id===id;});
  var j=i+dir;
  if(i<0||j<0||j>=qs.length)return;
  var tmp=qs[i];qs[i]=qs[j];qs[j]=tmp;
  saveS();renderQuickManage();renderQuickBtns();
}
function deleteQuick(id){
  var qs=ensureQuick();
  if(qs.length<=1){showToast('Mindestens ein Schnell-Knopf muss bleiben');return;}
  if(!confirm('Diesen Schnell-Knopf löschen?'))return;
  S.babyQuick=qs.filter(function(q){return q.id!==id;});
  saveS();renderQuickManage();renderQuickBtns();
}
function resetQuick(){
  if(!confirm('Schnell-Knöpfe auf die Werkseinstellung zurücksetzen?'))return;
  S.babyQuick=JSON.parse(JSON.stringify(QUICK_DEFAULTS));
  saveS();renderQuickManage();renderQuickBtns();
  showToast('Zurückgesetzt ✓');
}
function openQuickEdit(id){
  _quickEditId=id||null;
  var q=id?ensureQuick().find(function(x){return x.id===id;}):null;
  document.getElementById('bqIcon').value=(q&&q.icon)||'🤱';
  document.getElementById('bqLabel').value=(q&&q.label)||'';
  document.getElementById('bqType').value=(q&&q.t)||'breast';
  var p=(q&&q.p)||{};
  document.getElementById('bqSide').value=p.side||'';
  document.getElementById('bqMain').value=p.main||'';
  document.getElementById('bqMin').value=p.min||'';
  document.getElementById('bqTimer').checked=!!p.timer;
  document.getElementById('bqPumpMl').value=(q&&q.t==='pump'&&p.ml)||'';
  document.getElementById('bqPumpSide').value=(q&&q.t==='pump'&&p.side)||'b';
  document.getElementById('bqMl').value=p.ml||'';
  document.getElementById('bqBottleKind').value=p.kind&&BOTTLE[p.kind]?p.kind:'mm';
  document.getElementById('bqDiaperKind').value=(q&&q.t==='diaper'&&p.kind)||'pee';
  document.getElementById('bqNoteText').value=p.text||'';
  document.getElementById('bqTitle').textContent=id?'Knopf bearbeiten':'Neuer Schnell-Knopf';
  document.getElementById('bqDeleteBtn').style.display=id?'block':'none';
  updateQuickTypeFields();
  openOv('babyQuickEditOv');
}
function updateQuickTypeFields(){
  var t=document.getElementById('bqType').value;
  ['breast','bottle','pump','diaper','temp','sleep','note'].forEach(function(k){
    var el=document.getElementById('bqFields-'+k);
    if(el)el.style.display=(k===t)?'block':'none';
  });
  updateQuickBreastFields();
}
// Hauptseite nur bei „Beide" – bei einer einzelnen Seite wäre sie sinnlos.
function updateQuickBreastFields(){
  var sel=document.getElementById('bqSide'),wrap=document.getElementById('bqMainWrap');
  if(sel&&wrap)wrap.style.display=(sel.value==='b')?'block':'none';
}
function saveQuick(){
  var t=document.getElementById('bqType').value;
  var label=document.getElementById('bqLabel').value.trim();
  if(!label){showToast('Bitte eine Beschriftung eingeben');return;}
  var icon=document.getElementById('bqIcon').value.trim()||((TYPES[t]&&TYPES[t].ic)||'•');
  var p={};
  if(t==='breast'){
    var side=document.getElementById('bqSide').value;
    if(side)p.side=side;
    var main=document.getElementById('bqMain').value;
    if(side==='b'&&main)p.main=main;
    if(document.getElementById('bqTimer').checked)p.timer=1;
    else{
      var min=parseInt(document.getElementById('bqMin').value,10);
      if(min>0)p.min=min;
    }
  }else if(t==='pump'){
    var pml=parseInt(document.getElementById('bqPumpMl').value,10);
    if(!(pml>0)){showToast('Bitte eine Menge in ml angeben');return;}
    p.ml=pml;p.side=document.getElementById('bqPumpSide').value;
  }else if(t==='bottle'){
    var ml=parseInt(document.getElementById('bqMl').value,10);
    if(!(ml>0)){showToast('Bitte eine Menge in ml angeben');return;}
    p.ml=ml;p.kind=document.getElementById('bqBottleKind').value;
  }else if(t==='diaper'){
    p.kind=document.getElementById('bqDiaperKind').value;
  }else if(t==='note'){
    var txt=document.getElementById('bqNoteText').value.trim();
    if(!txt){showToast('Bitte den Notiz-Text angeben');return;}
    p.text=txt;
  }else if(t==='temp'||t==='sleep'){
    // Temperatur braucht immer einen Messwert – der Knopf öffnet den Dialog.
    // Schlaf braucht keine Vorbelegung: der Knopf schaltet zwischen
    // "schläft jetzt ein" und "ist jetzt wach" um (siehe quick()).
    p={};
  }
  var qs=ensureQuick();
  if(_quickEditId){
    var q=qs.find(function(x){return x.id===_quickEditId;});
    if(q){q.icon=icon;q.label=label;q.t=t;q.p=p;}
  }else{
    if(qs.length>=QUICK_MAX){showToast('Maximal '+QUICK_MAX+' Schnell-Knöpfe');return;}
    qs.push({id:'q'+uid(),icon:icon,label:label,t:t,p:p});
  }
  _quickEditId=null;
  saveS();
  closeOv('babyQuickEditOv');
  renderQuickManage();renderQuickBtns();
  showToast('Gespeichert ✓');
}
function deleteQuickFromEdit(){
  if(!_quickEditId)return;
  var id=_quickEditId;
  closeOv('babyQuickEditOv');
  _quickEditId=null;
  deleteQuick(id);
}

// ════════════════════════════════════════
// SYNC (nur das Baby-Tagebuch, Ende-zu-Ende-verschlüsselt)
// ════════════════════════════════════════
// Übertragen werden ausschließlich Einträge aus S.babyLog und Löschmarken –
// keine Mahlzeiten, keine Kalorien, kein Gewicht, kein Profil.
//
// Der Kopplungs-Code besteht aus zwei Teilen: `raum.schluessel`. Der Raum
// adressiert den Briefkasten beim Worker, der Schlüssel entschlüsselt die
// Inhalte und wird NIE gesendet. Wer nur den Raum kennt, sieht Chiffrat.
// ── Sync: Tagebuch-Einträge ───────────────────────────────────────────────
// Transport, Verschlüsselung, Personen und Quittungen liegen seit v0.247 in
// js/sync-core.js. Hier bleibt nur die Form DIESES Topfes: Einträge liegen nach
// Tag gruppiert, deshalb reist der Tag als eigenes Feld mit — ohne ihn wüsste
// die Gegenseite nicht, wohin ein Eintrag gehört.
// S.babyMiles = {<id>:{d:'YYYY-MM-DD'|'',rev}}. Eine fruehe Vorabform
// speicherte nur das Datum als Zeichenkette — das wird hier einmalig mit einer
// rev versehen, damit die Haken beim ersten Abgleich mitgehen.
var OLD_MILE=/^m\d/;
function milesStore(){
  if(!S.babyMiles||typeof S.babyMiles!=='object')S.babyMiles={};
  var ms=S.babyMiles;
  Object.keys(ms).forEach(function(k){
    // `m2_1` usw. waren die CDC-Punkte der Vorabversion — Texte ersetzt, Haken weg.
    if(OLD_MILE.test(k)){delete ms[k];return;}
    if(typeof ms[k]==='string')ms[k]={d:ms[k],rev:nextRev()};
  });
  return ms;
}
// Haken setzen/zuruecknehmen: neue rev, speichern, Abgleich anstossen.
function setMile(mid,d){
  var ms=milesStore();
  ms[mid]={d:d||'',rev:nextRev()};
  saveS();
  Sync.schedule();
}
function stripSy(e){
  var c={};
  Object.keys(e).forEach(function(k){if(k!=='_sy')c[k]=e[k];});
  return c;
}
function records(){
  var out=[];
  S.babyLog=S.babyLog||{};
  Object.keys(S.babyLog).forEach(function(day){
    (S.babyLog[day]||[]).forEach(function(e){
      out.push({id:e.id,rev:e.rev||0,holder:e,payload:{day:day,e:stripSy(e)}});
    });
  });
  // Meilenstein-Haken (js/baby-milestones.js) reisen im selben Topf mit —
  // eigener ID-Raum `mile_<id>`, Payload {mile,d}; d='' heisst „nicht erreicht".
  var miles=milesStore();
  Object.keys(miles).forEach(function(mid){
    var m=miles[mid];
    out.push({id:'mile_'+mid,rev:m.rev||0,holder:m,payload:{mile:mid,d:m.d||''}});
  });
  // Medikamenten-Liste (js/baby-meds.js) – damit beide Eltern dieselben Gaben
  // und Abstände sehen. Gelöscht wird weich (del:1), die rev entscheidet.
  (Array.isArray(S.babyMeds)?S.babyMeds:[]).forEach(function(m){
    out.push({id:'medcfg_'+m.id,rev:m.rev||0,holder:m,payload:{med:stripSy(m)}});
  });
  // Fragen an die Hebamme (js/baby-midwife.js) – Frage, Antwort, Haken.
  // Gelöscht wird weich (del:1), die rev entscheidet.
  (Array.isArray(S.babyQs)?S.babyQs:[]).forEach(function(q){
    out.push({id:'hqa_'+q.id,rev:q.rev||0,holder:q,payload:{hq:stripSy(q)}});
  });
  S.babyTomb=S.babyTomb||{};
  Object.keys(S.babyTomb).forEach(function(id){
    var t=S.babyTomb[id];if(!t)return;
    out.push({id:id,rev:t.rev||0,holder:t,payload:{day:t.day||'',e:null}});
  });
  return out;
}

// Merge: höhere rev gewinnt. Gilt für Einträge und Löschmarken gleichermaßen.
function applyRec(id,rev,payload,room){
  if(id.indexOf('mile_')===0){
    // Ohne `mile` kommt es von einer App vor v0.261, die den Datensatz fuer
    // einen geloeschten Eintrag hielt — nicht als Baby-Eintrag verbuchen.
    if(!payload||!payload.mile||OLD_MILE.test(payload.mile))return false;
    var miles=milesStore(),cur=miles[payload.mile];
    if(cur&&(cur.rev||0)>=rev)return false;
    var m={d:payload.d||'',rev:rev};
    NTSync.ack(m,room,rev);
    miles[payload.mile]=m;
    if(rev>_lastRev)_lastRev=rev;
    return true;
  }
  if(id.indexOf('medcfg_')===0){
    // Ohne `med` kommt es von einer App vor v0.263 (sie hält den Datensatz
    // für einen gelöschten Eintrag) – ignorieren.
    if(!payload||!payload.med||!payload.med.id)return false;
    if(!Array.isArray(S.babyMeds))S.babyMeds=[];
    var mi=S.babyMeds.findIndex(function(x){return x.id===payload.med.id;});
    if(mi>=0&&(S.babyMeds[mi].rev||0)>=rev)return false;
    var med=Object.assign({},payload.med,{rev:rev});
    NTSync.ack(med,room,rev);
    if(mi>=0)S.babyMeds[mi]=med;else S.babyMeds.push(med);
    if(rev>_lastRev)_lastRev=rev;
    return true;
  }
  if(id.indexOf('hqa_')===0){
    // Ohne `hq` kommt es von einer App vor v0.264 – ignorieren.
    if(!payload||!payload.hq||!payload.hq.id)return false;
    if(!Array.isArray(S.babyQs))S.babyQs=[];
    var qi=S.babyQs.findIndex(function(x){return x.id===payload.hq.id;});
    if(qi>=0&&(S.babyQs[qi].rev||0)>=rev)return false;
    var hq=Object.assign({},payload.hq,{rev:rev});
    NTSync.ack(hq,room,rev);
    if(qi>=0)S.babyQs[qi]=hq;else S.babyQs.push(hq);
    if(rev>_lastRev)_lastRev=rev;
    return true;
  }
  S.babyLog=S.babyLog||{};S.babyTomb=S.babyTomb||{};
  var tomb=S.babyTomb[id];
  if(tomb&&(tomb.rev||0)>=rev)return false;// lokal später gelöscht
  var hit=findAnywhere(id);
  if(hit&&(hit.e.rev||0)>=rev)return false;// lokal neuer
  if(hit)S.babyLog[hit.day].splice(hit.idx,1);
  if(payload.e===null||payload.e===undefined){
    var t={rev:rev,day:payload.day||''};
    NTSync.ack(t,room,rev);// quittiert gegenüber DIESER Person
    S.babyTomb[id]=t;
    if(rev>_lastRev)_lastRev=rev;
    return true;
  }
  if(tomb)delete S.babyTomb[id];
  var day=payload.day||_today();
  var e=payload.e;
  e.id=id;e.rev=rev;
  NTSync.ack(e,room,rev);
  if(!S.babyLog[day])S.babyLog[day]=[];
  S.babyLog[day].push(e);
  if(rev>_lastRev)_lastRev=rev;
  return true;
}

var Sync=NTSync.engine({
  topic:'baby',path:'/baby/sync',header:'X-Baby-Room',salt:'nutritrack-baby',
  pollMs:45000,      // solange das Tagebuch offen ist
  debounceMs:1500,   // Änderungen sammeln statt pro Tipp zu senden
  records:records,
  apply:applyRec,
  onApplied:function(){refresh();},
  onStatus:function(){renderSyncUI();}
});

// ── Sync-Oberfläche ──
// Seit v0.247 gibt es KEINEN eigenen Tagebuch-Code mehr: Codes gehören zu einer
// Person, nicht zu einem Topf. Der Dialog sagt nur noch, mit wem geteilt wird.
function openSync(){renderSyncUI();openOv('babySyncOv');}
function renderSyncUI(){
  var on=Sync.active();
  var stat=document.getElementById('babySyncStatus');
  if(stat)stat.textContent=Sync.statusText();
  var badge=document.getElementById('babySyncBadge');
  if(badge)badge.style.display=on?'':'none';
  var who=document.getElementById('babySyncWho');
  if(who){
    var ls=NTSync.forTopic('baby');
    who.innerHTML=ls.length
      ?ls.map(function(l){return '<span class="lnk-chip">👤 '+esc(l.name)+'</span>';}).join('')
      :'<span style="font-size:12px;color:var(--mu);">Noch mit niemandem geteilt.</span>';
  }
}
function openLinks(){closeOv('babySyncOv');setTimeout(function(){NTSync.open();},200);}
function syncNow(){
  if(!Sync.active()){showToast('Erst jemanden verbinden');return;}
  showToast('Wird abgeglichen …');
  Sync.run(true).then(function(){refresh();renderSyncUI();});
}

// ════════ Heute-Kachel ════════
function renderCard(){
  var card=document.getElementById('babyCard');
  if(!card)return;
  if(!S.babyOn){card.style.display='none';return;}
  card.style.display='';
  var key=dayKey();
  var name=(S.baby&&S.baby.name)?S.baby.name:'Baby';
  var age=ageText();
  var ttl=document.getElementById('babyCardTitle');
  if(ttl)ttl.textContent='👶 '+name+(age?' · '+age:'');
  var sum=document.getElementById('babyCardSum');
  if(sum)sum.textContent=summaryText(key)||'Noch nichts eingetragen';
  // Seit v0.263 steht hier die letzte Mahlzeit (bzw. die laufende Stoppuhr)
  // statt des letzten beliebigen Eintrags – das ist die Frage, die nachts zählt.
  var last=document.getElementById('babyCardLast');
  if(last)last.innerHTML=feedLineHtml();
  var hints=document.getElementById('babyCardHints');
  if(hints)hints.innerHTML=hintsHtml();
  var hint=document.getElementById('babyNextSide');
  if(hint){
    var nx=nextSide(key);
    hint.textContent=nx?('Vorschlag: nächste Seite '+SIDES[nx]):'';
  }
  renderQuickBtns();
}
// Hinweise auf der Kachel: fällige Gaben (js/baby-meds.js) und anstehende
// Termine/U-Untersuchungen (js/baby-milestones.js). Beide Module liefern HTML
// oder '' – die Kachel bleibt leer, wenn nichts ansteht.
function hintsHtml(){
  var h='';
  if(window.NTBabyMed)h+=NTBabyMed.cardHtml();
  if(window.NTMile&&NTMile.cardHtml)h+=NTMile.cardHtml();
  if(window.NTMidwife)h+=NTMidwife.cardHtml();
  return h;
}
// Merker „zuletzt welche Brust" – aus dem letzten Still-Eintrag der letzten Tage
function nextSide(key){
  S.babyLog=S.babyLog||{};
  var keys=Object.keys(S.babyLog).sort();
  for(var i=keys.length-1;i>=0;i--){
    if(keys[i]>key)continue;
    var arr=sorted(keys[i]).filter(function(e){return e.t==='breast'&&effSide(e);});
    if(arr.length){var s=effSide(arr[arr.length-1]);return s==='l'?'r':'l';}
  }
  return '';
}

// ════════ Tagebuch-Overlay ════════
function openDiary(){
  if(!S.babyOn){showToast('Baby-Tagebuch erst unter Mehr → Funktionen einschalten');return;}
  setTab('log');
  if(window.NTMile)NTMile.resetView();
  renderDiary();
  openOv('babyOv');
  Sync.run();
  Sync.startPoll(function(){return isOpen('babyOv');});
}
function closeDiary(){Sync.stopPoll();closeOv('babyOv');}
// Reiter im Tagebuch: 'log' (Einträge des Tages), 'week' (Verlauf, Beikost,
// Arzt-Bericht – js/baby-week.js), 'growth' (Wachstum – js/baby-growth.js),
// 'mile' (U-Heft: U-Termine, Termine, Meilensteine – js/baby-milestones.js),
// 'mw' (Fragen an die Hebamme – js/baby-midwife.js).
// Beim Öffnen steht immer das Tagebuch vorn.
var TABS={log:'babyPaneLog',week:'babyPaneWeek',growth:'babyPaneGrowth',mile:'babyPaneMile',mw:'babyPaneMw'};
var _tab='log';
function setTab(t){
  _tab=TABS[t]?t:'log';
  document.querySelectorAll('#babyTabs [data-tab]').forEach(function(b){
    b.classList.toggle('act',b.getAttribute('data-tab')===_tab);
  });
  Object.keys(TABS).forEach(function(k){
    var el=document.getElementById(TABS[k]);
    if(el)el.style.display=(k===_tab)?'':'none';
  });
  renderTab();
}
function renderTab(){
  if(_tab==='mile'&&window.NTMile)NTMile.render();
  else if(_tab==='week'&&window.NTBabyWeek)NTBabyWeek.render();
  else if(_tab==='growth'&&window.NTGrowth)NTGrowth.render();
  else if(_tab==='mw'&&window.NTMidwife)NTMidwife.render();
}
function renderDiary(){
  var key=dayKey();
  var head=document.getElementById('babyOvSub');
  if(head){
    var name=(S.baby&&S.baby.name)?S.baby.name:'Baby';
    var age=ageText();
    head.textContent=name+(age?' · '+age:'')+' · '+fmtDate(key);
  }
  var sum=document.getElementById('babyOvSum');
  if(sum)sum.textContent=summaryText(key)||'Noch nichts eingetragen';
  var nx=document.getElementById('babyOvNextSide');
  if(nx){
    var n=nextSide(key);
    nx.textContent=n?('Vorschlag: nächste Seite '+SIDES[n]):'';
    nx.style.display=n?'block':'none';
  }
  renderQuickBtns();
  renderSyncUI();
  renderTab();
  var feed=document.getElementById('babyOvFeed');
  if(feed)feed.innerHTML=feedLineHtml();
  var hints=document.getElementById('babyOvHints');
  if(hints)hints.innerHTML=hintsHtml();
  var list=document.getElementById('babyTimeline');
  if(!list)return;
  var rows=dayRows(key);
  if(!rows.length){
    list.innerHTML='<div style="font-size:13px;color:var(--mu);font-style:italic;padding:14px 2px;">Noch kein Eintrag für diesen Tag. Nutze die Schnell-Knöpfe oben oder „＋ Eintrag".</div>';
  }else{
    list.innerHTML=rows.map(function(r){
      var e=r.e,seg=r.seg;
      var ic=(TYPES[e.t]&&TYPES[e.t].ic)||'•';
      var fever=(e.t==='temp'&&isFever(e.c))||(e.t==='solid'&&e.react&&e.react!=='none');
      var running=!!(seg&&seg.live);
      var feeding=(e.t==='breast'&&e.run);
      // Laufender Schlaf/laufendes Stillen: ein Tipp beendet es, statt den Dialog zu öffnen.
      var right=running
        ?'<button type="button" onclick="event.stopPropagation();NTBaby.endSleep(\''+e.id+'\')" style="background:var(--g2);border:none;border-radius:999px;color:#fff;font-size:11px;font-weight:700;padding:5px 10px;cursor:pointer;flex-shrink:0;">Wach jetzt</button>'
        :feeding
        ?'<button type="button" onclick="event.stopPropagation();NTBaby.stopFeed()" style="background:var(--g2);border:none;border-radius:999px;color:#fff;font-size:11px;font-weight:700;padding:5px 10px;cursor:pointer;flex-shrink:0;">■ Stopp</button>'
        :'<div class="fe-ic">✏️</div>';
      var bits=[(e.t==='appt'&&!e.time)?'ganztägig':hhmm(r.ts)];
      if(feeding)bits.push('läuft seit '+fmtDur(Math.max(0,Math.floor((Date.now()-e.ts)/60000))));
      if(e.t==='growth'&&window.NTGrowth){var pc=NTGrowth.pctText(e);if(pc)bits.push(pc);}
      if(e.t==='med'&&e.every)bits.push('Abstand '+e.every+' h');
      if(seg&&seg.cont)bits.push('Fortsetzung von gestern');
      if(seg&&seg.spill)bits.push('geht weiter am Folgetag');
      if(running)bits.push('läuft seit '+fmtDur(seg.totalMin));
      else if(seg&&seg.min)bits.push(fmtDur(seg.min));
      if(e.note)bits.push(esc(e.note));
      return '<div class="fe" onclick="NTBaby.editEntry(\''+e.id+'\')">'
        +'<div class="fee">'+ic+'</div>'
        +'<div class="fei"><div class="fen"'+(fever?' style="color:#c62828;"':'')+'>'+esc(rowTitle(r))+(fever?' 🔴':'')+'</div>'
        +'<div class="fem">'+bits.join(' · ')+'</div></div>'
        +right
        +'</div>';
    }).join('');
  }
  var fev=logRO(key).filter(function(e){return e.t==='temp'&&isFever(e.c);});
  var fw=document.getElementById('babyFeverWarn');
  if(fw)fw.style.display=fev.length?'block':'none';
}

// ════════ Eintrags-Dialog ════════
function openEntry(type,id){
  _editId=id||null;
  var key=dayKey();
  var hitE=id?findAnywhere(id):null;
  var e=hitE?hitE.e:null;
  var t=type||(e&&e.t)||'breast';
  setType(t);
  // Datum nur bei Messung/Termin: vorbelegt mit dem Tag des Eintrags bzw. heute.
  document.getElementById('babyEntryDate').value=hitE?hitE.day:_today();
  fillMedPick((e&&e.mid)||'');
  document.getElementById('babyMedName').value=(e&&e.t==='med'&&e.name)||'';
  document.getElementById('babyMedDose').value=(e&&e.t==='med'&&e.dose)||'';
  document.getElementById('babyMedEvery').value=(e&&e.t==='med'&&e.every)||'';
  if(!e&&t==='med')medPicked();
  document.getElementById('babySolidFood').value=(e&&e.food)||'';
  document.getElementById('babySolidAmount').value=(e&&e.amount)||'';
  document.getElementById('babySolidFirst').checked=!!(e&&e.first);
  document.getElementById('babySolidReact').value=(e&&e.react)||'none';
  fillFoodList();
  document.getElementById('babyPumpSide').value=(e&&e.t==='pump'&&e.side)||'b';
  document.getElementById('babyPumpMl').value=(e&&e.t==='pump'&&e.ml)||'';
  document.getElementById('babyGrowthG').value=(e&&e.g)||'';
  document.getElementById('babyGrowthCm').value=(e&&e.cm)||'';
  document.getElementById('babyGrowthHc').value=(e&&e.hc)||'';
  document.getElementById('babyApptKind').value=(e&&e.t==='appt'&&e.kind)||'u';
  document.getElementById('babyApptTitle').value=(e&&e.t==='appt'&&e.title)||'';
  document.getElementById('babyEntryTime').value=(t==='appt')?((e&&e.time)||''):(e?hhmm(e.ts):nowTimeOnDay(key));
  document.getElementById('babyEntryNote').value=(e&&e.note)||'';
  var side=(e&&e.side)||nextSide(key)||'l';
  document.getElementById('babySide').value=side;
  // Vorschlag nur bei neuen Einträgen: beim nachträglichen Bearbeiten käme er
  // aus dem jüngsten Eintrag des Tages, nicht aus dem vor diesem hier.
  document.getElementById('babyMain').value=(e&&e.main)||((!e&&side==='b')?(nextSide(key)||''):'');
  updateBreastFields();
  document.getElementById('babyMin').value=(e&&e.min)||'';
  document.getElementById('babyMl').value=(e&&e.ml)||'';
  document.getElementById('babyBottleKind').value=(e&&e.t==='bottle'&&e.kind)||'mm';
  document.getElementById('babyDiaperKind').value=(e&&e.t==='diaper'&&e.kind)||'pee';
  document.getElementById('babyStoolColor').value=(e&&e.color)||'';
  document.getElementById('babyStoolCons').value=(e&&e.cons)||'';
  document.getElementById('babyTempC').value=(e&&e.c)||'';
  document.getElementById('babyTempSite').value=(e&&e.site)||'rektal';
  document.getElementById('babySleepFrom').value=(e&&e.from)||'';
  document.getElementById('babySleepTo').value=(e&&e.to)||'';
  document.getElementById('babyNoteText').value=(e&&e.t==='note'&&e.text)||'';
  document.getElementById('babyEntryTitle').textContent=id?(t==='growth'?'Messung bearbeiten':t==='appt'?'Termin bearbeiten':'Eintrag bearbeiten')
    :(t==='growth'?'Neue Messung':t==='appt'?'Neuer Termin':'Neuer Eintrag');
  document.getElementById('babyDeleteBtn').style.display=id?'block':'none';
  updateDiaperFields();
  openOv('babyEntryOv');
}
function editEntry(id){openEntry(null,id);}
// Medizin: Auswahl aus der eigenen Liste (js/baby-meds.js) oder frei.
function fillMedPick(sel){
  var el=document.getElementById('babyMedPick');
  if(!el)return;
  var meds=window.NTBabyMed?NTBabyMed.list():[];
  el.innerHTML='<option value="">– frei eingeben –</option>'+meds.map(function(m){
    return '<option value="'+esc(m.id)+'">'+esc(m.name)+'</option>';
  }).join('');
  el.value=meds.some(function(m){return m.id===sel;})?sel:(meds.length&&!_editId?meds[0].id:'');
}
function medPicked(){
  var id=document.getElementById('babyMedPick').value;
  var m=id&&window.NTBabyMed?NTBabyMed.byId(id):null;
  if(!m)return;
  document.getElementById('babyMedName').value=m.name||'';
  document.getElementById('babyMedDose').value=m.dose||'';
  document.getElementById('babyMedEvery').value=m.every||'';
}
// Beikost: Vorschläge aus der eingebauten Lebensmittel-Datenbank (window.DB)
// plus allem, was schon einmal als Beikost eingetragen wurde.
function fillFoodList(){
  var dl=document.getElementById('babyFoodList');
  if(!dl)return;
  var seen={},names=[];
  solidFoods().concat((window.DB||[]).map(function(d){return d.n;})).forEach(function(n){
    var k=(n||'').toLowerCase();
    if(k&&!seen[k]){seen[k]=1;names.push(n);}
  });
  dl.innerHTML=names.map(function(n){return '<option value="'+esc(n)+'">';}).join('');
}
function solidFoods(){
  var out=[];
  Object.keys(S.babyLog||{}).forEach(function(d){
    logRO(d).forEach(function(e){if(e.t==='solid'&&e.food)out.push(e.food);});
  });
  return out;
}
function setType(t){
  document.querySelectorAll('#babyTypeTabs [data-bt]').forEach(function(b){
    b.classList.toggle('act',b.getAttribute('data-bt')===t);
  });
  // Bei Schlaf ist „Von/Bis" die Uhrzeit — ein zweites, generisches Zeitfeld
  // daneben wäre widersprüchlich (welches gilt?) und stellte den Eintrag in der
  // Zeitleiste an die falsche Stelle.
  var tr=document.getElementById('babyEntryTimeRow');
  // Messung: das Datum genügt, eine Uhrzeit wäre Schein-Genauigkeit.
  if(tr)tr.style.display=(t==='sleep'||t==='growth')?'none':'';
  var dr=document.getElementById('babyEntryDateRow');
  if(dr)dr.style.display=DATED[t]?'':'none';
  // Messung und Termin kommen aus ihrem eigenen Reiter – dort passt die
  // Typ-Leiste nicht (ein Wechsel auf „Windel" ergäbe keinen Sinn).
  var tabs=document.getElementById('babyTypeTabs');
  if(tabs)tabs.style.display=DATED[t]?'none':'flex';
  Object.keys(TYPES).forEach(function(k){
    var el=document.getElementById('babyFields-'+k);
    if(el)el.style.display=(k===t)?'block':'none';
  });
  var tt=document.getElementById('babyEntryOv');
  if(tt)tt.setAttribute('data-type',t);
  updateBreastFields();
}
function updateBreastFields(){
  var sel=document.getElementById('babySide'),wrap=document.getElementById('babyMainWrap');
  if(!sel||!wrap)return;
  wrap.style.display=(sel.value==='b')?'block':'none';
  // Beim Umschalten auf „Beide" gleich den Alternations-Vorschlag anbieten.
  var main=document.getElementById('babyMain');
  if(!_editId&&sel.value==='b'&&main&&!main.value)main.value=nextSide(dayKey())||'';
}
function currentType(){
  var tt=document.getElementById('babyEntryOv');
  return (tt&&tt.getAttribute('data-type'))||'breast';
}
function updateDiaperFields(){
  var k=document.getElementById('babyDiaperKind');
  var wrap=document.getElementById('babyStoolWrap');
  if(k&&wrap)wrap.style.display=(k.value==='poo'||k.value==='both')?'block':'none';
}
function saveEntry(){
  var key=dayKey();
  var t=currentType();
  if(DATED[t]){
    key=document.getElementById('babyEntryDate').value||'';
    if(!/^\d{4}-\d{2}-\d{2}$/.test(key)){showToast('Bitte ein Datum angeben');return;}
  }
  var time=document.getElementById('babyEntryTime').value||(DATED[t]?(t==='appt'?'09:00':'12:00'):nowTimeOnDay(key));
  var e={t:t,ts:tsFor(key,time),note:document.getElementById('babyEntryNote').value.trim()};
  if(t==='breast'){
    e.side=document.getElementById('babySide').value;
    // Hauptseite nur bei „Beide" mitschreiben; beim Bearbeiten werden alle
    // Felder ersetzt, ein Wechsel auf Links/Rechts räumt sie also mit auf.
    if(e.side==='b'){var mn=document.getElementById('babyMain').value;if(mn)e.main=mn;}
    e.min=parseInt(document.getElementById('babyMin').value,10)||0;
  }else if(t==='bottle'){
    e.ml=parseInt(document.getElementById('babyMl').value,10)||0;
    e.kind=document.getElementById('babyBottleKind').value;
    if(!e.ml){showToast('Bitte Menge in ml angeben');return;}
  }else if(t==='diaper'){
    e.kind=document.getElementById('babyDiaperKind').value;
    if(e.kind==='poo'||e.kind==='both'){
      e.color=document.getElementById('babyStoolColor').value||'';
      e.cons=document.getElementById('babyStoolCons').value||'';
    }
  }else if(t==='temp'){
    e.c=parseFloat(String(document.getElementById('babyTempC').value).replace(',','.'))||0;
    e.site=document.getElementById('babyTempSite').value;
    if(!e.c){showToast('Bitte Temperatur angeben');return;}
  }else if(t==='sleep'){
    e.from=document.getElementById('babySleepFrom').value||'';
    e.to=document.getElementById('babySleepTo').value||'';
    // Einsortiert wird nach dem Beginn; fehlt der, nach dem Ende.
    if(e.from||e.to)e.ts=tsFor(key,e.from||e.to);
    // Beginn ODER Ende genügt: Man trägt den Schlaf oft mitten drin ein und
    // kennt das Ende noch nicht - erzwungene Vollständigkeit hieße, sich das
    // erst als Notiz zu merken und später nachzupflegen.
    if(!e.from&&!e.to){showToast('Bitte Beginn oder Ende angeben');return;}
  }else if(t==='note'){
    e.text=document.getElementById('babyNoteText').value.trim();
    if(!e.text){showToast('Bitte Notiz eingeben');return;}
  }else if(t==='solid'){
    e.food=document.getElementById('babySolidFood').value.trim();
    if(!e.food){showToast('Bitte das Lebensmittel angeben');return;}
    e.amount=document.getElementById('babySolidAmount').value.trim();
    if(document.getElementById('babySolidFirst').checked)e.first=1;
    e.react=document.getElementById('babySolidReact').value||'none';
  }else if(t==='pump'){
    e.side=document.getElementById('babyPumpSide').value;
    e.ml=parseInt(document.getElementById('babyPumpMl').value,10)||0;
    if(!e.ml){showToast('Bitte Menge in ml angeben');return;}
  }else if(t==='med'){
    e.name=document.getElementById('babyMedName').value.trim();
    if(!e.name){showToast('Bitte das Medikament angeben');return;}
    e.dose=document.getElementById('babyMedDose').value.trim();
    var ev=parseFloat(String(document.getElementById('babyMedEvery').value).replace(',','.'));
    if(ev>0)e.every=ev;
    var mid=document.getElementById('babyMedPick').value;
    if(mid)e.mid=mid;
  }else if(t==='growth'){
    var g=parseInt(document.getElementById('babyGrowthG').value,10);
    var cm=parseFloat(String(document.getElementById('babyGrowthCm').value).replace(',','.'));
    var hc=parseFloat(String(document.getElementById('babyGrowthHc').value).replace(',','.'));
    if(g>0)e.g=g;
    if(cm>0)e.cm=cm;
    if(hc>0)e.hc=hc;
    if(!e.g&&!e.cm&&!e.hc){showToast('Bitte mindestens einen Messwert angeben');return;}
    // Häufigster Tippfehler: kg statt g – 3,4 wäre ein unmögliches Gewicht.
    if(e.g&&e.g<300){showToast('Gewicht bitte in Gramm (z.B. 3450)');return;}
  }else if(t==='appt'){
    e.kind=document.getElementById('babyApptKind').value;
    e.title=document.getElementById('babyApptTitle').value.trim();
    // Uhrzeit nur speichern, wenn eine eingegeben wurde – sonst „ganztägig".
    e.time=document.getElementById('babyEntryTime').value||'';
  }
  if(_editId){
    var hit=findAnywhere(_editId);
    if(hit){
      // Eintrag bleibt an seinem Tag; nur die Felder werden ersetzt.
      var target=hit.e;
      // Laufende Stoppuhr bleibt laufen, solange keine Dauer eingetragen wird.
      if(t==='breast'&&target.run&&!e.min)e.run=1;
      Object.keys(target).forEach(function(k2){if(k2!=='id')delete target[k2];});
      Object.assign(target,e);
      var day=hit.day;
      // Messung/Termin: neues Datum = Eintrag wandert an diesen Tag.
      if(DATED[t]&&key!==hit.day){
        S.babyLog[hit.day].splice(hit.idx,1);
        log(key).push(target);
        day=key;
      }
      target.ts=(t==='sleep'&&(e.from||e.to))?tsFor(day,e.from||e.to):tsFor(day,time);
      target.rev=nextRev();
      saveS();
      Sync.schedule();
    }
  }else{
    add(Object.assign({},e),key);
  }
  _editId=null;
  closeOv('babyEntryOv');
  refresh();
  if(t==='solid'&&e.react!=='none')showToast('⚠️ Reaktion notiert – bei Atemnot, starker Schwellung oder Kreislaufproblemen sofort den Notruf 112 wählen.',6000);
  else if(t==='temp'&&isFever(e.c))showToast('🌡️ '+fmtTemp(e.c)+' °C – Fieber. Im 1. Lebensjahr bitte ärztlich abklären.',5000);
  else showToast('Eingetragen ✓');
}
function deleteEntry(){
  if(!_editId)return;
  if(!confirm('Diesen Eintrag löschen?'))return;
  remove(_editId);
  _editId=null;
  closeOv('babyEntryOv');
}

// ── Boot: höchste bekannte rev merken, dann einmal abgleichen ──
function boot(){
  S.babyLog=S.babyLog||{};
  Object.keys(S.babyLog).forEach(function(d){
    (S.babyLog[d]||[]).forEach(function(e){if((e.rev||0)>_lastRev)_lastRev=e.rev;});
  });
  Object.keys(S.babyTomb||{}).forEach(function(id){
    var t=S.babyTomb[id];if(t&&(t.rev||0)>_lastRev)_lastRev=t.rev;
  });
  var ms=S.babyMiles||{};
  Object.keys(ms).forEach(function(k){var m=ms[k];if(m&&(m.rev||0)>_lastRev)_lastRev=m.rev;});
  (Array.isArray(S.babyMeds)?S.babyMeds:[]).forEach(function(m){if((m.rev||0)>_lastRev)_lastRev=m.rev;});
  (Array.isArray(S.babyQs)?S.babyQs:[]).forEach(function(q){if((q.rev||0)>_lastRev)_lastRev=q.rev;});
  milesStore();
  if(S.babyOn)Sync.run();
}
document.addEventListener('visibilitychange',function(){
  if(!document.hidden&&S.babyOn)Sync.run();
});

// Läuft gerade ein Schlaf am angezeigten Tag? index.html frischt dann minutlich
// auf, damit „läuft seit …" mitzählt und die Mitternachts-Teilung sofort greift.
function hasRunningSleep(){
  if(!S.babyOn)return false;
  return sleepSegments(dayKey()).some(function(seg){return seg.live;});
}
// Minutentakt aus index.html: Kachel immer („letzte Mahlzeit vor …", fällige
// Gaben), das offene Tagebuch nur, wenn dort etwas mitzählt.
function tick(){
  if(!S.babyOn)return;
  renderCard();
  if(isOpen('babyOv')&&(hasRunningSleep()||runningFeed()))renderDiary();
}

window.NTBaby={
  boot:boot,refresh:refresh,hasRunningSleep:hasRunningSleep,tick:tick,
  // add() ist der programmatische Einfuege-Pfad (Alexa-Einwurf, js/alexa-sync.js).
  // Der Aufrufer liefert einen fertigen Eintrag {t,...} plus Tagesschluessel;
  // Sync, Speichern und Neuzeichnen passieren hier drin.
  add:add,
  openDiary:openDiary,closeDiary:closeDiary,renderDiary:renderDiary,setTab:setTab,renderCard:renderCard,
  quick:quick,openEntry:openEntry,editEntry:editEntry,setType:setType,endSleep:endSleep,
  updateDiaperFields:updateDiaperFields,updateBreastFields:updateBreastFields,saveEntry:saveEntry,deleteEntry:deleteEntry,
  openQuickManage:openQuickManage,openQuickEdit:openQuickEdit,updateQuickTypeFields:updateQuickTypeFields,updateQuickBreastFields:updateQuickBreastFields,
  saveQuick:saveQuick,deleteQuick:deleteQuick,deleteQuickFromEdit:deleteQuickFromEdit,
  moveQuick:moveQuick,resetQuick:resetQuick,renderQuickBtns:renderQuickBtns,
  openSync:openSync,renderSyncUI:renderSyncUI,openLinks:openLinks,syncNow:syncNow,
  Sync:Sync,summaryText:summaryText,TYPES:TYPES,
  // Fuer den Alexa-Einwurf: welche Brust waere als Naechstes dran?
  nextSide:nextSide,
  // Meilensteine (js/baby-milestones.js): Haken lesen/setzen, synchronisiert.
  milesStore:milesStore,setMile:setMile,
  // v0.263: Stoppuhr, Medizin-Auswahl, gemeinsame Helfer für Verlauf/Wachstum/Gaben
  startFeed:startFeed,stopFeed:stopFeed,switchFeed:switchFeed,medPicked:medPicked,
  summary:summary,entryTitle:entryTitle,logRO:logRO,addDayKey:addDayKey,today:_today,
  fmtDur:fmtDur,fmtNum:fmtNum,isFever:isFever,fmtTemp:fmtTemp,ageText:ageText,
  REACTION:REACTION,APPT:APPT,SIDES:SIDES,
  _nextRev:nextRev,_bumpRev:function(r){if(r>_lastRev)_lastRev=r;},_schedule:function(){Sync.schedule();}
};
})();
