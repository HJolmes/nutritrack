// NutriTrack – Baby-Tagebuch (v0.225)
// Klassisches Script, kein Modul. Exportiert window.NTBaby und greift direkt auf
// die globalen Helfer aus index.html zu (S, saveS, renderAll, openOv, closeOv,
// esc, fmtDate, showToast, PROJECT_WORKER_BASE).
//
// Bewusst unabhängig von Schwangerschaft/Stillzeit: aktiviert wird das Tagebuch
// über den eigenen Schalter S.babyOn (Mehr → Profil), damit es auch Väter,
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
  note:  {ic:'📝',label:'Notiz'}
};
var SIDES={l:'Links',r:'Rechts',b:'Beide'};
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
  var arr=log(key);
  var s={breast:0,breastMin:0,bottle:0,ml:0,diaper:0,poo:0,temp:null,sleepMin:0,sleepOpen:null};
  arr.forEach(function(e){
    if(e.t==='breast'){s.breast++;s.breastMin+=parseInt(e.min,10)||0;}
    else if(e.t==='bottle'){s.bottle++;s.ml+=parseInt(e.ml,10)||0;}
    else if(e.t==='diaper'){s.diaper++;if(e.kind==='poo'||e.kind==='both')s.poo++;}
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
function summaryText(key){
  var s=summary(key);
  var parts=[];
  if(s.breast)parts.push(s.breast+'× gestillt'+(s.breastMin?' ('+s.breastMin+' Min.)':''));
  if(s.bottle)parts.push(s.bottle+'× Flasche'+(s.ml?' ('+s.ml+' ml)':''));
  if(s.diaper)parts.push(s.diaper+(s.diaper===1?' Windel':' Windeln')+(s.poo?' · '+s.poo+'× 💩':''));
  if(s.sleepMin)parts.push('Schlaf '+fmtDur(s.sleepMin)+(s.sleepOpen?' (schläft noch)':''));
  else if(s.sleepOpen)parts.push('schläft seit '+(s.sleepOpen.cont?'gestern ':'')+s.sleepOpen.e.from);
  if(s.temp)parts.push('🌡️ '+fmtTemp(s.temp.c)+' °C');
  return parts.join(' · ');
}
function fmtTemp(c){return (Math.round((parseFloat(c)||0)*10)/10).toFixed(1).replace('.',',');}
function isFever(c){return (parseFloat(c)||0)>=FEVER;}

// ── Eintrags-Zeile als Text ──
function entryTitle(e){
  if(e.t==='breast')return 'Stillen · '+(SIDES[e.side]||'')+(e.min?' · '+e.min+' Min.':'');
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
  var e=Object.assign({t:q.t},JSON.parse(JSON.stringify(q.p||{})));
  // „Nächste Seite"-Vorschlag nur, wenn der Knopf keine Seite vorgibt
  if(q.t==='breast'&&!e.side)e.side=nextSide(key)||'l';
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
  if(q.t==='breast'){det.push(p.side?SIDES[p.side]:'Seite wird vorgeschlagen');if(p.min)det.push(p.min+' Min.');}
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
  document.getElementById('bqMin').value=p.min||'';
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
  ['breast','bottle','diaper','temp','sleep','note'].forEach(function(k){
    var el=document.getElementById('bqFields-'+k);
    if(el)el.style.display=(k===t)?'block':'none';
  });
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
    var min=parseInt(document.getElementById('bqMin').value,10);
    if(min>0)p.min=min;
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
var Sync=(function(){
  var API=(typeof PROJECT_WORKER_BASE!=='undefined'?PROJECT_WORKER_BASE:'')+'/baby/sync';
  var POLL_MS=45000;   // solange das Tagebuch offen ist
  var DEBOUNCE_MS=1500;// Änderungen sammeln statt pro Tipp zu senden
  var _timer=null,_poll=null,_busy=false,_key=null,_keyFor='';

  function st(){
    S.babySync=S.babySync||{on:false,room:'',key:'',since:0,lastAt:0,lastErr:''};
    return S.babySync;
  }
  function active(){var c=st();return !!(c.on&&c.room&&c.key);}
  // Neue Kopplung: alle Quittungen verwerfen, damit der komplette lokale
  // Bestand einmal in den neuen Raum hochgeladen wird.
  function resetAcks(){
    S.babyLog=S.babyLog||{};
    Object.keys(S.babyLog).forEach(function(d){
      (S.babyLog[d]||[]).forEach(function(e){delete e._sy;});
    });
    S.babyTomb=S.babyTomb||{};
    Object.keys(S.babyTomb).forEach(function(id){if(S.babyTomb[id])delete S.babyTomb[id].sy;});
  }
  function cryptoOk(){return !!(window.crypto&&crypto.subtle&&window.TextEncoder);}

  function rand(n){
    var a=crypto.getRandomValues(new Uint8Array(n)),s='';
    var abc='abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for(var i=0;i<n;i++)s+=abc[a[i]%abc.length];
    return s;
  }
  function b64(buf){var b=new Uint8Array(buf),s='';for(var i=0;i<b.length;i++)s+=String.fromCharCode(b[i]);return btoa(s);}
  function b64d(s){var bin=atob(s),b=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)b[i]=bin.charCodeAt(i);return b;}

  // Schlüssel deterministisch aus dem Code ableiten – beide Geräte kommen mit
  // demselben Code auf denselben AES-Schlüssel, ohne ihn je zu übertragen.
  function getKey(){
    var c=st();
    var tag=c.room+'|'+c.key;
    if(_key&&_keyFor===tag)return Promise.resolve(_key);
    return crypto.subtle.importKey('raw',new TextEncoder().encode(c.key),'PBKDF2',false,['deriveKey'])
      .then(function(km){
        return crypto.subtle.deriveKey(
          {name:'PBKDF2',salt:new TextEncoder().encode('nutritrack-baby|'+c.room),iterations:100000,hash:'SHA-256'},
          km,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
      }).then(function(k){_key=k;_keyFor=tag;return k;});
  }
  function encRec(id,rev,payload){
    var iv=crypto.getRandomValues(new Uint8Array(12));
    return getKey().then(function(k){
      return crypto.subtle.encrypt({name:'AES-GCM',iv:iv},k,new TextEncoder().encode(JSON.stringify(payload)));
    }).then(function(ct){return {id:id,rev:rev,iv:b64(iv),ct:b64(ct)};});
  }
  function decRec(rec){
    return getKey().then(function(k){
      return crypto.subtle.decrypt({name:'AES-GCM',iv:b64d(rec.iv)},k,b64d(rec.ct));
    }).then(function(buf){return JSON.parse(new TextDecoder().decode(buf));})
      .catch(function(){return null;});// fremder/kaputter Record → überspringen
  }

  function code(){var c=st();return c.room&&c.key?(c.room+'.'+c.key):'';}
  function createRoom(){
    if(!cryptoOk()){showToast('Dieses Gerät unterstützt die Verschlüsselung nicht');return false;}
    var c=st();
    c.room=rand(32);c.key=rand(24);c.on=true;c.since=0;c.lastErr='';resetAcks();
    _key=null;_keyFor='';
    saveS();
    // Bestehende Einträge einmal vollständig hochladen
    run(true);
    return true;
  }
  function joinRoom(raw){
    if(!cryptoOk()){showToast('Dieses Gerät unterstützt die Verschlüsselung nicht');return false;}
    var parts=String(raw||'').trim().replace(/\s+/g,'').split('.');
    if(parts.length!==2||!/^[A-Za-z0-9_-]{24,64}$/.test(parts[0])||parts[1].length<16){
      showToast('Code sieht nicht gültig aus');
      return false;
    }
    var c=st();
    c.room=parts[0];c.key=parts[1];c.on=true;c.since=0;c.lastErr='';resetAcks();
    _key=null;_keyFor='';
    saveS();
    run(true);
    return true;
  }
  function disconnect(){
    var c=st();
    c.on=false;c.room='';c.key='';c.since=0;c.lastErr='';
    _key=null;_keyFor='';
    stopPoll();
    saveS();
    renderSyncUI();
    showToast('Verbindung getrennt – Einträge bleiben auf diesem Gerät');
  }

  // Was ist lokal neuer als das, was der Server bestätigt hat?
  // Bewusst pro Eintrag (`_sy` = quittierte Revision) statt einer globalen
  // Hochwassermarke: Bei zwei Geräten mit leicht unterschiedlichen Uhren wäre
  // eine gemeinsame Marke schon durch einen fremden, höheren Zeitstempel
  // überholt — eigene, ältere Änderungen würden dann nie hochgeladen.
  function pending(){
    var out=[];
    S.babyLog=S.babyLog||{};
    Object.keys(S.babyLog).forEach(function(day){
      (S.babyLog[day]||[]).forEach(function(e){
        if((e.rev||0)>(e._sy||0))out.push({id:e.id,rev:e.rev,day:day,e:e});
      });
    });
    S.babyTomb=S.babyTomb||{};
    Object.keys(S.babyTomb).forEach(function(id){
      var t=S.babyTomb[id];
      if(t&&(t.rev||0)>(t.sy||0))out.push({id:id,rev:t.rev,day:t.day,tomb:t});
    });
    return out.sort(function(a,b){return a.rev-b.rev;});
  }
  // `_sy` ist eine rein lokale Buchhaltung und gehört nicht ins Chiffrat.
  function strip(e){
    var c={};
    Object.keys(e).forEach(function(k){if(k!=='_sy')c[k]=e[k];});
    return c;
  }

  function push(){
    var c=st();
    var items=pending();
    if(!items.length)return Promise.resolve(0);
    items=items.slice(0,200);// Worker-Limit
    return Promise.all(items.map(function(it){
      return encRec(it.id,it.rev,{day:it.day,e:it.e?strip(it.e):null});
    }))
      .then(function(recs){
        return fetch(API,{method:'POST',headers:{'Content-Type':'application/json','X-Baby-Room':c.room},body:JSON.stringify({records:recs})});
      })
      .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
      .then(function(){
        // Erst nach bestätigtem Upload quittieren – bei Abbruch wird alles
        // beim nächsten Lauf erneut gesendet.
        items.forEach(function(it){
          if(it.e)it.e._sy=it.rev;
          else if(it.tomb)it.tomb.sy=it.rev;
        });
        saveS();
        return items.length;
      });
  }

  function pull(){
    var c=st();
    return fetch(API+'?since='+encodeURIComponent(c.since||0),{headers:{'X-Baby-Room':c.room}})
      .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
      .then(function(j){
        var d=(j&&j.data)||{};
        var recs=d.records||[];
        if(!recs.length){if(d.cursor)c.since=Math.max(c.since||0,d.cursor);return 0;}
        return Promise.all(recs.map(decRec)).then(function(payloads){
          var applied=0;
          payloads.forEach(function(pl,i){
            if(pl&&apply(recs[i].id,recs[i].rev,pl))applied++;
          });
          if(d.cursor)c.since=Math.max(c.since||0,d.cursor);
          if(applied)saveS();
          return applied;
        });
      });
  }

  // Merge: höhere rev gewinnt. Gilt für Einträge und Löschmarken gleichermaßen.
  function apply(id,rev,payload){
    S.babyLog=S.babyLog||{};S.babyTomb=S.babyTomb||{};
    var tomb=S.babyTomb[id];
    if(tomb&&(tomb.rev||0)>=rev)return false;// lokal später gelöscht
    var hit=findAnywhere(id);
    if(hit&&(hit.e.rev||0)>=rev)return false;// lokal neuer
    if(hit)S.babyLog[hit.day].splice(hit.idx,1);
    if(payload.e===null||payload.e===undefined){
      // sy=rev: kam vom Server, muss nicht zurückgeschickt werden
      S.babyTomb[id]={rev:rev,day:payload.day||'',sy:rev};
      return true;
    }
    if(tomb)delete S.babyTomb[id];
    var day=payload.day||_today();
    var e=payload.e;
    e.id=id;e.rev=rev;e._sy=rev;
    if(!S.babyLog[day])S.babyLog[day]=[];
    S.babyLog[day].push(e);
    if(rev>_lastRev)_lastRev=rev;
    return true;
  }

  function run(force){
    if(!active()||!cryptoOk())return Promise.resolve();
    if(_busy&&!force)return Promise.resolve();
    _busy=true;
    var c=st();
    return push()
      .then(pull)
      .then(function(applied){
        c.lastAt=Date.now();c.lastErr='';
        saveS();
        if(applied)refresh();
        renderSyncUI();
      })
      .catch(function(err){
        // Offline oder Worker nicht erreichbar: Quittungen bleiben stehen,
        // beim nächsten Versuch wird alles Offene nachgeholt.
        c.lastErr=(err&&err.message)||'Fehler';
        saveS();
        renderSyncUI();
      })
      .then(function(){_busy=false;});
  }

  function schedule(){
    if(!active())return;
    clearTimeout(_timer);
    _timer=setTimeout(function(){run();},DEBOUNCE_MS);
  }
  function startPoll(){
    if(!active())return;
    stopPoll();
    _poll=setInterval(function(){if(isOpen('babyOv'))run();else stopPoll();},POLL_MS);
  }
  function stopPoll(){if(_poll){clearInterval(_poll);_poll=null;}}

  function statusText(){
    var c=st();
    if(!active())return 'Nicht verbunden – Einträge bleiben nur auf diesem Gerät.';
    if(c.lastErr)return '⚠️ Letzter Abgleich fehlgeschlagen ('+c.lastErr+') – wird automatisch erneut versucht.';
    if(!c.lastAt)return 'Verbunden – noch kein Abgleich gelaufen.';
    var mins=Math.round((Date.now()-c.lastAt)/60000);
    return '✓ Verbunden · letzter Abgleich '+(mins<1?'gerade eben':'vor '+mins+' Min.');
  }

  return {
    st:st,active:active,code:code,createRoom:createRoom,joinRoom:joinRoom,
    disconnect:disconnect,run:run,schedule:schedule,startPoll:startPoll,
    stopPoll:stopPoll,statusText:statusText,cryptoOk:cryptoOk
  };
})();

// ── Sync-Oberfläche ──
function openSync(){
  renderSyncUI();
  openOv('babySyncOv');
}
function renderSyncUI(){
  var on=Sync.active();
  var stat=document.getElementById('babySyncStatus');
  if(stat)stat.textContent=Sync.statusText();
  var setup=document.getElementById('babySyncSetup');
  if(setup)setup.style.display=on?'none':'block';
  var live=document.getElementById('babySyncLive');
  if(live)live.style.display=on?'block':'none';
  var codeEl=document.getElementById('babySyncCode');
  if(codeEl)codeEl.textContent=Sync.code()||'';
  var badge=document.getElementById('babySyncBadge');
  if(badge)badge.style.display=on?'':'none';
}
function copySyncCode(){
  var c=Sync.code();
  if(!c)return;
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(c).then(function(){showToast('Code kopiert ✓');},function(){showToast('Kopieren nicht möglich – Code markieren');});
  }else showToast('Kopieren nicht möglich – Code markieren');
}
function shareSyncCode(){
  var c=Sync.code();
  if(!c)return;
  if(navigator.share)navigator.share({title:'NutriTrack Baby-Tagebuch',text:c}).catch(function(){});
  else copySyncCode();
}
function createSyncRoom(){if(Sync.createRoom()){renderSyncUI();showToast('Verbunden – jetzt den Code am zweiten Gerät eingeben');}}
function joinSyncRoom(){
  var inp=document.getElementById('babySyncJoinCode');
  if(!inp)return;
  if(Sync.joinRoom(inp.value)){inp.value='';renderSyncUI();showToast('Verbunden – Einträge werden abgeglichen');}
}
function syncNow(){
  if(!Sync.active()){showToast('Erst ein Gerät verbinden');return;}
  showToast('Wird abgeglichen …');
  Sync.run(true).then(function(){refresh();renderSyncUI();});
}
function disconnectSync(){
  if(!confirm('Verbindung trennen? Die Einträge auf diesem Gerät bleiben erhalten, es wird nur nichts mehr abgeglichen.'))return;
  Sync.disconnect();
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
  var last=document.getElementById('babyCardLast');
  if(last){
    var rows=dayRows(key);
    var r=rows[rows.length-1];
    last.innerHTML=r?('<span style="color:var(--mu);">zuletzt '+hhmm(r.ts)+' · </span>'+esc(rowTitle(r))):'';
  }
  var hint=document.getElementById('babyNextSide');
  if(hint){
    var nx=nextSide(key);
    hint.textContent=nx?('Vorschlag: nächste Seite '+SIDES[nx]):'';
  }
  renderQuickBtns();
}
// Merker „zuletzt welche Brust" – aus dem letzten Still-Eintrag der letzten Tage
function nextSide(key){
  S.babyLog=S.babyLog||{};
  var keys=Object.keys(S.babyLog).sort();
  for(var i=keys.length-1;i>=0;i--){
    if(keys[i]>key)continue;
    var arr=sorted(keys[i]).filter(function(e){return e.t==='breast'&&(e.side==='l'||e.side==='r');});
    if(arr.length){var s=arr[arr.length-1].side;return s==='l'?'r':'l';}
  }
  return '';
}

// ════════ Tagebuch-Overlay ════════
function openDiary(){
  if(!S.babyOn){showToast('Baby-Tagebuch erst unter Mehr → Profil aktivieren');return;}
  renderDiary();
  openOv('babyOv');
  Sync.run();
  Sync.startPoll();
}
function closeDiary(){Sync.stopPoll();closeOv('babyOv');}
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
  var list=document.getElementById('babyTimeline');
  if(!list)return;
  var rows=dayRows(key);
  if(!rows.length){
    list.innerHTML='<div style="font-size:13px;color:var(--mu);font-style:italic;padding:14px 2px;">Noch kein Eintrag für diesen Tag. Nutze die Schnell-Knöpfe oben oder „＋ Eintrag".</div>';
  }else{
    list.innerHTML=rows.map(function(r){
      var e=r.e,seg=r.seg;
      var ic=(TYPES[e.t]&&TYPES[e.t].ic)||'•';
      var fever=(e.t==='temp'&&isFever(e.c));
      var running=!!(seg&&seg.live);
      // Laufender Schlaf: ein Tipp beendet ihn, statt den Dialog zu öffnen.
      var right=running
        ?'<button type="button" onclick="event.stopPropagation();NTBaby.endSleep(\''+e.id+'\')" style="background:var(--g2);border:none;border-radius:999px;color:#fff;font-size:11px;font-weight:700;padding:5px 10px;cursor:pointer;flex-shrink:0;">Wach jetzt</button>'
        :'<div class="fe-ic">✏️</div>';
      var bits=[hhmm(r.ts)];
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
  var e=id?(findAnywhere(id)||{}).e:null;
  var t=type||(e&&e.t)||'breast';
  setType(t);
  document.getElementById('babyEntryTime').value=e?hhmm(e.ts):nowTimeOnDay(key);
  document.getElementById('babyEntryNote').value=(e&&e.note)||'';
  var side=(e&&e.side)||nextSide(key)||'l';
  document.getElementById('babySide').value=side;
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
  document.getElementById('babyEntryTitle').textContent=(id?'Eintrag bearbeiten':'Neuer Eintrag');
  document.getElementById('babyDeleteBtn').style.display=id?'block':'none';
  updateDiaperFields();
  openOv('babyEntryOv');
}
function editEntry(id){openEntry(null,id);}
function setType(t){
  document.querySelectorAll('#babyTypeTabs [data-bt]').forEach(function(b){
    b.classList.toggle('act',b.getAttribute('data-bt')===t);
  });
  // Bei Schlaf ist „Von/Bis" die Uhrzeit — ein zweites, generisches Zeitfeld
  // daneben wäre widersprüchlich (welches gilt?) und stellte den Eintrag in der
  // Zeitleiste an die falsche Stelle.
  var tr=document.getElementById('babyEntryTimeRow');
  if(tr)tr.style.display=(t==='sleep')?'none':'';
  Object.keys(TYPES).forEach(function(k){
    var el=document.getElementById('babyFields-'+k);
    if(el)el.style.display=(k===t)?'block':'none';
  });
  var tt=document.getElementById('babyEntryOv');
  if(tt)tt.setAttribute('data-type',t);
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
  var time=document.getElementById('babyEntryTime').value||nowTimeOnDay(key);
  var e={t:t,ts:tsFor(key,time),note:document.getElementById('babyEntryNote').value.trim()};
  if(t==='breast'){
    e.side=document.getElementById('babySide').value;
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
  }
  if(_editId){
    var hit=findAnywhere(_editId);
    if(hit){
      // Eintrag bleibt an seinem Tag; nur die Felder werden ersetzt.
      var target=hit.e;
      Object.keys(target).forEach(function(k2){if(k2!=='id')delete target[k2];});
      Object.assign(target,e);
      target.ts=(t==='sleep'&&(e.from||e.to))?tsFor(hit.day,e.from||e.to):tsFor(hit.day,time);
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
  if(t==='temp'&&isFever(e.c))showToast('🌡️ '+fmtTemp(e.c)+' °C – Fieber. Im 1. Lebensjahr bitte ärztlich abklären.',5000);
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

window.NTBaby={
  boot:boot,refresh:refresh,hasRunningSleep:hasRunningSleep,
  // add() ist der programmatische Einfuege-Pfad (Alexa-Einwurf, js/alexa-sync.js).
  // Der Aufrufer liefert einen fertigen Eintrag {t,...} plus Tagesschluessel;
  // Sync, Speichern und Neuzeichnen passieren hier drin.
  add:add,
  openDiary:openDiary,closeDiary:closeDiary,renderDiary:renderDiary,renderCard:renderCard,
  quick:quick,openEntry:openEntry,editEntry:editEntry,setType:setType,endSleep:endSleep,
  updateDiaperFields:updateDiaperFields,saveEntry:saveEntry,deleteEntry:deleteEntry,
  openQuickManage:openQuickManage,openQuickEdit:openQuickEdit,updateQuickTypeFields:updateQuickTypeFields,
  saveQuick:saveQuick,deleteQuick:deleteQuick,deleteQuickFromEdit:deleteQuickFromEdit,
  moveQuick:moveQuick,resetQuick:resetQuick,renderQuickBtns:renderQuickBtns,
  openSync:openSync,renderSyncUI:renderSyncUI,createSyncRoom:createSyncRoom,joinSyncRoom:joinSyncRoom,
  copySyncCode:copySyncCode,shareSyncCode:shareSyncCode,syncNow:syncNow,disconnectSync:disconnectSync,
  Sync:Sync,summaryText:summaryText,TYPES:TYPES
};
})();
