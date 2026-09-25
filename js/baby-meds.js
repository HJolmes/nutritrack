// NutriTrack – Baby: Medikamente und tägliche Gaben (v0.263).
// Klassisches Script, exportiert window.NTBabyMed. Nutzt NTBaby (js/baby.js)
// und die globalen Helfer aus index.html (S, saveS, esc, openOv, closeOv, showToast).
//
// Eine Liste S.babyMeds=[{id,name,dose,every,daily,rev,del?}] – eigene Einträge,
// z.B. „Vitamin D, 1 Tablette, täglich" oder „Paracetamol-Zäpfchen, 125 mg,
// Mindestabstand 6 h". Die App legt KEINE Dosis und KEINEN Abstand fest; beides
// kommt vom Arzt bzw. aus dem Beipackzettel und wird hier nur festgehalten.
//
// Eine Gabe ist ein normaler Tagebuch-Eintrag {t:'med',name,dose,every,mid} –
// sie synchronisiert also wie jeder andere Eintrag. Die Liste selbst reist im
// Baby-Topf als `medcfg_<id>` mit (siehe records()/applyRec() in js/baby.js).
(function(){
'use strict';

var _editId=null;

function all(){if(!Array.isArray(S.babyMeds))S.babyMeds=[];return S.babyMeds;}
function list(){return all().filter(function(m){return !m.del;});}
function byId(id){return list().find(function(m){return m.id===id;})||null;}
function pad(n){return n<10?'0'+n:''+n;}
function hhmm(ts){var d=new Date(ts);return pad(d.getHours())+':'+pad(d.getMinutes());}

// Letzte Gabe zu einem Listeneintrag (über id, sonst gleicher Name) in den
// letzten drei Tagen.
function lastGiven(m){
  var t=NTBaby.today(),best=null,now=Date.now();
  for(var i=0;i<3;i++){
    NTBaby.logRO(NTBaby.addDayKey(t,-i)).forEach(function(e){
      if(e.t!=='med'||!e.ts||e.ts>now)return;
      var same=m.id?(e.mid===m.id||(!e.mid&&sameName(e.name,m.name))):sameName(e.name,m.name);
      if(same&&(!best||e.ts>best.ts))best=e;
    });
  }
  return best;
}
function sameName(a,b){return (a||'').trim().toLowerCase()===(b||'').trim().toLowerCase();}
function givenToday(m){
  return NTBaby.logRO(NTBaby.today()).some(function(e){
    return e.t==='med'&&(e.mid===m.id||(!e.mid&&sameName(e.name,m.name)));
  });
}

// Wartezeiten: jede Gabe mit Abstand, deren Frist noch läuft – auch frei
// eingetragene ohne Listeneintrag. Je Name nur die jüngste.
function waits(){
  var t=NTBaby.today(),now=Date.now(),latest={};
  for(var i=0;i<3;i++){
    NTBaby.logRO(NTBaby.addDayKey(t,-i)).forEach(function(e){
      if(e.t!=='med'||!e.every||!e.ts||e.ts>now)return;
      var k=(e.name||'').trim().toLowerCase();
      if(!latest[k]||e.ts>latest[k].ts)latest[k]=e;
    });
  }
  return Object.keys(latest).map(function(k){
    var e=latest[k];
    return {e:e,until:e.ts+e.every*3600000};
  }).filter(function(w){return w.until>now;})
    .sort(function(a,b){return a.until-b.until;});
}

// Kachel/Tagebuch: fällige tägliche Gaben + laufende Wartezeiten.
function cardHtml(){
  if(!S.babyOn)return '';
  var h='';
  list().forEach(function(m){
    if(!m.daily||givenToday(m))return;
    h+='<div class="bby-hint"><span>💊 '+esc(m.name)+' heute noch offen</span>'
      +'<button type="button" class="bby-pill on" data-act="NTBabyMed.give" data-args=\''+JSON.stringify([m.id]).replace(/'/g,'&#39;')+'\'>Gegeben ✓</button></div>';
  });
  var today=NTBaby.today();
  waits().forEach(function(w){
    var d=new Date(w.until);
    var dk=d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
    h+='<div class="bby-hint"><span>⏳ '+esc(w.e.name)+': nächste Gabe frühestens '
      +(dk===today?'':'morgen ')+hhmm(w.until)+'</span></div>';
  });
  return h;
}

function give(id){
  var m=byId(id);
  if(!m)return;
  var e={t:'med',name:m.name,mid:m.id,ts:Date.now()};
  if(m.dose)e.dose=m.dose;
  if(m.every)e.every=m.every;
  // Frist der letzten Gabe noch nicht um: nachfragen statt still eintragen.
  var last=lastGiven(m);
  if(m.every&&last&&Date.now()<last.ts+m.every*3600000){
    if(!confirm(m.name+' wurde um '+hhmm(last.ts)+' gegeben. Der eingetragene Mindestabstand von '
      +String(m.every).replace('.',',')+' h ist noch nicht um. Trotzdem eintragen?'))return;
  }
  NTBaby.add(e,NTBaby.today());
  showToast('💊 '+m.name+' eingetragen ✓');
  if(isOpen('babyMedOv'))render();
}

// ── Verwaltung ──
function isOpen(id){var el=document.getElementById(id);return !!(el&&el.classList.contains('open'));}
function open(){_editId=null;fillForm(null);render();openOv('babyMedOv');}
function render(){
  var box=document.getElementById('babyMedList');
  if(!box)return;
  var ms=list();
  if(!ms.length){
    box.innerHTML='<div style="font-size:12px;color:var(--mu);font-style:italic;padding:8px 2px;">Noch nichts angelegt. Unten z.B. „Vitamin D“ mit „täglich“ oder ein Fiebermittel mit dem Mindestabstand aus dem Beipackzettel eintragen.</div>';
    return;
  }
  box.innerHTML=ms.map(function(m){
    var last=lastGiven(m);
    var sub=[];
    if(m.dose)sub.push(esc(m.dose));
    if(m.daily)sub.push('täglich');
    if(m.every)sub.push('Abstand '+String(m.every).replace('.',',')+' h');
    sub.push(last?('zuletzt '+(last.ts>=tsToday()?'heute ':'')+hhmm(last.ts)):'noch nie gegeben');
    var args=JSON.stringify([m.id]).replace(/'/g,'&#39;');
    return '<div class="fe" style="cursor:default;">'
      +'<div class="fee">💊</div>'
      +'<div class="fei" data-act="NTBabyMed.edit" data-args=\''+args+'\' style="cursor:pointer;">'
        +'<div class="fen">'+esc(m.name)+'</div><div class="fem">'+sub.join(' · ')+'</div></div>'
      +'<button type="button" class="bby-pill on" data-act="NTBabyMed.give" data-args=\''+args+'\'>Gegeben</button>'
      +'</div>';
  }).join('');
}
function tsToday(){var d=new Date();d.setHours(0,0,0,0);return d.getTime();}
function fillForm(m){
  document.getElementById('bmName').value=(m&&m.name)||'';
  document.getElementById('bmDose').value=(m&&m.dose)||'';
  document.getElementById('bmEvery').value=(m&&m.every)||'';
  document.getElementById('bmDaily').checked=!!(m&&m.daily);
  document.getElementById('bmSaveBtn').textContent=m?'Änderung speichern ✓':'＋ Hinzufügen';
  document.getElementById('bmDelBtn').style.display=m?'block':'none';
  document.getElementById('bmFormTitle').textContent=m?'Bearbeiten':'Neu anlegen';
}
function edit(id){
  var m=byId(id);
  if(!m)return;
  _editId=id;
  fillForm(m);
  var f=document.getElementById('bmName');
  if(f)f.focus();
}
function save(){
  var name=document.getElementById('bmName').value.trim();
  if(!name){showToast('Bitte einen Namen angeben');return;}
  var every=parseFloat(String(document.getElementById('bmEvery').value).replace(',','.'));
  var rec={
    name:name,
    dose:document.getElementById('bmDose').value.trim(),
    every:every>0?every:0,
    daily:document.getElementById('bmDaily').checked?1:0
  };
  var ms=all(),m=_editId?ms.find(function(x){return x.id===_editId;}):null;
  if(m)Object.assign(m,rec);
  else{m=Object.assign({id:'m'+Date.now().toString(36)+Math.random().toString(36).slice(2,5)},rec);ms.push(m);}
  m.rev=NTBaby._nextRev();
  _editId=null;
  saveS();NTBaby._schedule();NTBaby.refresh();
  fillForm(null);render();
  showToast('Gespeichert ✓');
}
function del(){
  var m=_editId?all().find(function(x){return x.id===_editId;}):null;
  if(!m)return;
  if(!confirm('„'+m.name+'“ aus der Liste löschen? Bereits eingetragene Gaben bleiben im Tagebuch.'))return;
  m.del=1;m.rev=NTBaby._nextRev();
  _editId=null;
  saveS();NTBaby._schedule();NTBaby.refresh();
  fillForm(null);render();
}
function cancelEdit(){_editId=null;fillForm(null);}

window.NTBabyMed={list:list,byId:byId,cardHtml:cardHtml,give:give,open:open,render:render,edit:edit,save:save,del:del,cancelEdit:cancelEdit};
})();
