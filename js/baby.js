// NutriTrack – Baby-Tagebuch (v0.224)
// Klassisches Script, kein Modul. Exportiert window.NTBaby und greift direkt auf
// die globalen Helfer aus index.html zu (S, saveS, renderAll, openOv, closeOv,
// esc, fmtDate, showToast).
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
var STOOL_COLOR=['gelb','senffarben','grün','braun','schwarz','weiß/hell','blutig'];
var STOOL_CONS=['flüssig','breiig','weich','fest','hart'];
var TEMP_SITE={rektal:'rektal',ohr:'Ohr',stirn:'Stirn',axillar:'Achsel'};
// Fiebergrenze laut gängiger pädiatrischer Definition
var FEVER=38.0;

var _editId=null;

function pad(n){return n<10?'0'+n:''+n;}
function dayKey(){return (typeof S!=='undefined'&&S.currentDate)||'';}
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
function _today(){var d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function uid(){return 'b'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);}

function add(entry,key){
  key=key||dayKey();
  entry.id=entry.id||uid();
  if(!entry.ts)entry.ts=tsFor(key,nowTimeOnDay(key));
  log(key).push(entry);
  saveS();
  refresh();
  return entry;
}
function remove(id,key){
  key=key||dayKey();
  var arr=log(key);
  var i=arr.findIndex(function(e){return e.id===id;});
  if(i>-1){arr.splice(i,1);saveS();refresh();}
}
function byId(id,key){return log(key).find(function(e){return e.id===id;});}

function refresh(){
  renderCard();
  if(document.getElementById('babyOv')&&document.getElementById('babyOv').classList.contains('open'))renderDiary();
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
  var s={breast:0,breastMin:0,bottle:0,ml:0,diaper:0,poo:0,temp:null,sleepMin:0};
  arr.forEach(function(e){
    if(e.t==='breast'){s.breast++;s.breastMin+=parseInt(e.min,10)||0;}
    else if(e.t==='bottle'){s.bottle++;s.ml+=parseInt(e.ml,10)||0;}
    else if(e.t==='diaper'){s.diaper++;if(e.kind==='poo'||e.kind==='both')s.poo++;}
    else if(e.t==='temp'){if(!s.temp||e.ts>s.temp.ts)s.temp=e;}
    else if(e.t==='sleep'&&e.from&&e.to){
      var f=tsFor(key,e.from),t=tsFor(key,e.to);
      if(t<f)t+=86400000;// über Mitternacht
      s.sleepMin+=Math.round((t-f)/60000);
    }
  });
  return s;
}
function summaryText(key){
  var s=summary(key);
  var parts=[];
  if(s.breast)parts.push(s.breast+'× gestillt'+(s.breastMin?' ('+s.breastMin+' Min.)':''));
  if(s.bottle)parts.push(s.bottle+'× Flasche'+(s.ml?' ('+s.ml+' ml)':''));
  if(s.diaper)parts.push(s.diaper+(s.diaper===1?' Windel':' Windeln')+(s.poo?' · '+s.poo+'× 💩':''));
  if(s.sleepMin)parts.push('Schlaf '+Math.floor(s.sleepMin/60)+' h '+(s.sleepMin%60)+' Min.');
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
  if(e.t==='sleep')return 'Schlaf '+(e.from||'?')+'–'+(e.to||'?');
  if(e.t==='note')return e.text||'Notiz';
  return '';
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
    var arr=sorted(key);
    var e=arr[arr.length-1];
    last.innerHTML=e?('<span style="color:var(--mu);">zuletzt '+hhmm(e.ts)+' · </span>'+esc(entryTitle(e))):'';
  }
  var hint=document.getElementById('babyNextSide');
  if(hint){
    var nx=nextSide(key);
    hint.textContent=nx?('Vorschlag: nächste Seite '+SIDES[nx]):'';
  }
}
// Merker „zuletzt welche Brust" – aus dem letzten Still-Eintrag der letzten Tage
function nextSide(key){
  var keys=Object.keys(S.babyLog||{}).sort();
  for(var i=keys.length-1;i>=0;i--){
    if(keys[i]>key)continue;
    var arr=sorted(keys[i]).filter(function(e){return e.t==='breast'&&(e.side==='l'||e.side==='r');});
    if(arr.length){var s=arr[arr.length-1].side;return s==='l'?'r':'l';}
  }
  return '';
}

// ════════ Schnell-Eintrag (ein Tipp, kein Dialog) ════════
function quick(kind){
  if(!S.babyOn)return;
  var key=dayKey();
  if(kind==='l'||kind==='r'||kind==='b')add({t:'breast',side:kind},key);
  else if(kind==='pee')add({t:'diaper',kind:'pee'},key);
  else if(kind==='poo')add({t:'diaper',kind:'poo'},key);
  else return;
  var lbl={l:'🤱 Links',r:'🤱 Rechts',b:'🤱 Beide',pee:'💧 Pipi',poo:'💩 Stuhl'}[kind];
  showToast(lbl+' eingetragen ✓');
}

// ════════ Tagebuch-Overlay ════════
function openDiary(){
  if(!S.babyOn){showToast('Baby-Tagebuch erst unter Mehr → Profil aktivieren');return;}
  renderDiary();
  openOv('babyOv');
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
  var list=document.getElementById('babyTimeline');
  if(!list)return;
  var arr=sorted(key);
  if(!arr.length){
    list.innerHTML='<div style="font-size:13px;color:var(--mu);font-style:italic;padding:14px 2px;">Noch kein Eintrag für diesen Tag. Nutze die Schnell-Knöpfe oben oder „＋ Eintrag".</div>';
    return;
  }
  list.innerHTML=arr.map(function(e){
    var ic=(TYPES[e.t]&&TYPES[e.t].ic)||'•';
    var fever=(e.t==='temp'&&isFever(e.c));
    return '<div class="fe" onclick="NTBaby.editEntry(\''+e.id+'\')">'
      +'<div class="fee">'+ic+'</div>'
      +'<div class="fei"><div class="fen"'+(fever?' style="color:#c62828;"':'')+'>'+esc(entryTitle(e))+(fever?' 🔴':'')+'</div>'
      +'<div class="fem">'+hhmm(e.ts)+(e.note?' · '+esc(e.note):'')+'</div></div>'
      +'<div class="fe-ic">✏️</div>'
      +'</div>';
  }).join('');
  var fev=arr.filter(function(e){return e.t==='temp'&&isFever(e.c);});
  var fw=document.getElementById('babyFeverWarn');
  if(fw)fw.style.display=fev.length?'block':'none';
}

// ════════ Eintrags-Dialog ════════
function openEntry(type,id){
  _editId=id||null;
  var key=dayKey();
  var e=id?byId(id,key):null;
  var t=type||(e&&e.t)||'breast';
  setType(t);
  document.getElementById('babyEntryTime').value=e?hhmm(e.ts):nowTimeOnDay(key);
  document.getElementById('babyEntryNote').value=(e&&e.note)||'';
  // Felder vorbelegen
  var side=(e&&e.side)||nextSide(key)||'l';
  document.getElementById('babySide').value=side;
  document.getElementById('babyMin').value=(e&&e.min)||'';
  document.getElementById('babyMl').value=(e&&e.ml)||'';
  document.getElementById('babyBottleKind').value=(e&&e.kind)||'mm';
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
    if(!e.from||!e.to){showToast('Bitte Beginn und Ende angeben');return;}
  }else if(t==='note'){
    e.text=document.getElementById('babyNoteText').value.trim();
    if(!e.text){showToast('Bitte Notiz eingeben');return;}
  }
  if(_editId){
    var old=byId(_editId,key);
    if(old){
      Object.keys(old).forEach(function(k2){if(k2!=='id')delete old[k2];});
      Object.assign(old,e);
      saveS();
    }
  }else{
    log(key).push(Object.assign({id:uid()},e));
    saveS();
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

window.NTBaby={
  openDiary:openDiary,
  renderDiary:renderDiary,
  renderCard:renderCard,
  quick:quick,
  openEntry:openEntry,
  editEntry:editEntry,
  setType:setType,
  updateDiaperFields:updateDiaperFields,
  saveEntry:saveEntry,
  deleteEntry:deleteEntry,
  summaryText:summaryText,
  TYPES:TYPES,STOOL_COLOR:STOOL_COLOR,STOOL_CONS:STOOL_CONS
};
})();
