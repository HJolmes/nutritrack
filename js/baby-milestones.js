// NutriTrack – Baby-Meilensteine (Reiter im Baby-Tagebuch, v0.261).
// Klassisches Script, exportiert window.NTMile. Zeigt die Entwicklungs-
// Meilensteine passend zum Alter aus S.baby.birth; abgehakt wird in
// S.babyMiles = {<id>:{d:'YYYY-MM-DD'|'',rev}} (Tag des Abhakens). Speichern
// und Sync (Baby-Topf) laufen ueber NTBaby.milesStore/setMile.
//
// Inhalt: Gelbes Kinderuntersuchungsheft des G-BA (Stand Juni 2026), je U die
// „Orientierende Beurteilung der Entwicklung" unter „Aktuelle Anamnese des
// Kindes". Texte woertlich, nur je Satz in einen eigenen Punkt geteilt; rein
// medizinische Fragen (Hoeren, Schnarchen, Stuhl …) sind nicht uebernommen.
// Die U-Zeitraeume geben das Alter vor: „3.–4. Lebensmonat" beginnt nach
// 2 vollen Monaten (from:{m:2}).
// Die IDs (`u4_3` = U4, dritter Punkt) sind fest — nie umnummerieren, sonst
// wandern gespeicherte Haken auf einen anderen Text.
(function(){
'use strict';

var CAT={g:'🏃',f:'✋',k:'🧠',l:'💬',s:'💛',i:'🤝'};
var CAT_LABEL={g:'Grobmotorik',f:'Feinmotorik',k:'Perzeption/Kognition',l:'Sprache',s:'Soziale/emotionale Kompetenz',i:'Interaktion/Kommunikation'};

var STAGES=[
  {u:'U3',span:'4.–5. Lebenswoche',from:{d:21},items:[
    ['g','Kopf wird in schwebender Bauchlage für wenigstens 3 Sekunden gehalten.'],
    ['g','Kopf wird in Rumpfebene und in Rückenlage für 10 Sekunden in Mittelstellung gehalten.'],
    ['f','Hände werden spontan geöffnet, insgesamt sind die Hände noch eher geschlossen.'],
    ['k','Folgt mit den Augen einem Gegenstand nach beiden Seiten bis mindestens 45 Grad.'],
    ['s','Aufmerksames Schauen auf nahe Gesichter nächster Bindungspersonen.']
  ]},
  {u:'U4',span:'3.–4. Lebensmonat',from:{m:2},items:[
    ['g','Kräftiges alternierendes und beidseitiges Beugen und Strecken der Arme und Beine.'],
    ['g','Hält den Kopf in der Sitzhaltung aufrecht, mind. 30 Sekunden.'],
    ['g','Bauchlage wird toleriert, Abstützen auf den Unterarmen, der Kopf wird in der Bauchlage zwischen 40° und 90° mindestens eine Minute gehoben.'],
    ['k','Fixiert ein bewegtes Gesicht und folgt ihm.'],
    ['k','Versucht durch Kopfdrehen, Quellen eines bekannten Geräusches zu sehen.'],
    ['f','Hände können spontan zur Körpermitte gebracht werden.'],
    ['s','Kind freut sich über Zuwendung, Blickkontakt kann gehalten werden.'],
    ['s','Reaktion auf Ansprache, erwidert Lächeln einer Bezugsperson („soziales Lächeln").']
  ]},
  {u:'U5',span:'6.–7. Lebensmonat',from:{m:5},items:[
    ['g','Handstütz mit gestreckten Armen auf den Handflächen.'],
    ['g','Bei Traktionsreaktion Kopf symmetrisch in Verlängerung der Wirbelsäule und Beugung beider Arme.'],
    ['g','Federn mit den Beinen.'],
    ['k','Objekte, Spielzeuge werden mit beiden Händen ergriffen, in den Mund gesteckt, benagt, jedoch wenig intensiv betrachtet; (erkundet oral und manuell).'],
    ['f','Wechselt Spielzeug zwischen den Händen, palmares, radial betontes Greifen.'],
    ['l','Rhythmische Silbenketten (z. B. ge-ge-ge, mem-mem-mem, dei-dei-dei).'],
    ['s','Lacht stimmhaft, wenn es geneckt wird.'],
    ['s','Benimmt sich gegen Bekannte und Unbekannte unterschiedlich.'],
    ['s','Freut sich beim Erscheinen eines anderen Kindes.']
  ]},
  {u:'U6',span:'10.–12. Lebensmonat',from:{m:9},items:[
    ['g','Freies Sitzen mit geradem Rücken und sicherer Gleichgewichtskontrolle.'],
    ['g','Zieht sich in den Stand hoch und bleibt einige Sekunden stehen.'],
    ['g','Selbständiges, flüssiges Drehen von Rückenlage zu Bauchlage und zurück.'],
    ['k','Gibt der Mutter oder dem Vater nach Aufforderung einen Gegenstand.'],
    ['k','Verfolgt den Zeigefinger in die gezeigte Richtung.'],
    ['f','Greift kleinen Gegenstand zwischen Daumen und gestrecktem Zeigefinger.'],
    ['f','Klopft 2 Würfel aneinander.'],
    ['l','Spontane Äußerung von längeren Silbenketten.'],
    ['l','Produziert Doppelsilben (z. B. ba-ba, da-da).'],
    ['l','Ahmt Laute nach.'],
    ['s','Kann alleine aus der Flasche trinken, trinkt aus der Tasse, aus dem Becher mit etwas Hilfe.'],
    ['s','Das Kind kann zwischen fremden und bekannten Personen unterscheiden.'],
    ['s','Freut sich über andere Kinder.']
  ]},
  {u:'U7',span:'21.–24. Lebensmonat',from:{m:20},items:[
    ['g','Kann über längere Zeit frei und sicher gehen.'],
    ['g','Geht 3 Stufen im Kinderschritt hinunter, hält sich mit einer Hand fest.'],
    ['f','Malt flache Spirale.'],
    ['f','Kann eingewickelte Bonbons oder andere kleine Gegenstände auswickeln oder auspacken.'],
    ['l','Einwortsprache (wenigstens 10 richtige Wörter ohne Mama und Papa).'],
    ['l','Versteht und befolgt einfache Aufforderungen.'],
    ['l','Drückt durch Gestik oder Sprache (Kopfschütteln oder Nein-Sagen) aus, dass es etwas ablehnt oder eigene Vorstellungen hat.'],
    ['l','Zeigt oder blickt auf 3 benannte Körperteile.'],
    ['k','Stapelt 3 Würfel.'],
    ['k','Zeigt im Bilderbuch auf bekannte Gegenstände.'],
    ['s','Bleibt und spielt etwa 15 min alleine, auch wenn die Mutter/der Vater nicht im Zimmer, jedoch in der Nähe ist.'],
    ['s','Kann mit dem Löffel selber essen.'],
    ['s','Hat Interesse an anderen Kindern.'],
    ['i','Versucht Eltern irgendwo hinzuziehen.']
  ]},
  {u:'U7a',span:'34.–36. Lebensmonat',from:{m:33},items:[
    ['g','Beidseitiges Abhüpfen von der untersten Treppenstufe mit sicherer Gleichgewichtskontrolle.'],
    ['g','Steigt 2 Stufen im Erwachsenenschritt, hält sich mit der Hand fest.'],
    ['f','Präziser Dreifinger-Spitzgriff (Daumen, Zeige-Mittelfinger) zur Manipulation auch sehr kleiner Gegenstände möglich.'],
    ['l','Spricht mindestens Dreiwortsätze.'],
    ['l','Spricht von sich in der Ich-Form.'],
    ['l','Kennt und sagt seinen Rufnamen.'],
    ['k','Kann zuhören und konzentriert spielen, Als-Ob-Spiele.'],
    ['k','Öffnet große Knöpfe selbst.'],
    ['s','Kann sich gut über einige Stunden trennen, wenn es von vertrauter Person betreut wird.'],
    ['s','Beteiligt sich an häuslichen Tätigkeiten, will mithelfen.'],
    ['i','Gemeinsames Spielen mit gleichaltrigen Kindern, auch Rollenspiele.']
  ]},
  {u:'U8',span:'46.–48. Lebensmonat',from:{m:45},items:[
    ['g','Laufrad oder ähnliches Fahrzeug wird zielgerichtet und sicher bewegt.'],
    ['g','Hüpft über ein 20-50 cm breites Blatt.'],
    ['f','Mal-Zeichenstift wird richtig zwischen den ersten drei Fingern gehalten.'],
    ['f','Zeichnet geschlossene Kreise.'],
    ['l','Spricht 6-Wortsätze in Kindersprache.'],
    ['l','Geschichten werden etwa in zeitlichem und logischem Verlauf wiedergegeben.'],
    ['k','Fragt warum, wie, wo, wieso, woher.'],
    ['s','Kann sich selbst an- und ausziehen.'],
    ['s','Gießt Flüssigkeiten ein.'],
    ['s','Bei alltäglichen Ereignissen kann das Kind seine Emotionen meist selbst regulieren.'],
    ['s','Toleriert meist leichtere, übliche Enttäuschungen, Freude, Ängste, Stress-Situationen.'],
    ['i','Gemeinsames Spielen mit gleichaltrigen Kindern, auch Rollenspiele, hält sich an Spielregeln.']
  ]},
  {u:'U9',span:'60.–64. Lebensmonat',from:{m:59},items:[
    ['g','Hüpft auf einem Bein, jeweils rechts und links, und kurzer Einbeinstand.'],
    ['g','Größere Bälle können aufgefangen werden.'],
    ['g','Läuft Treppen vorwärts rauf und runter im Erwachsenenschritt (wechselfüßig) ohne sich festzuhalten.'],
    ['f','Nachmalen eines Kreises, Quadrates, Dreiecks möglich.'],
    ['f','Stifthaltung wie ein Erwachsener.'],
    ['f','Kann mit einer Kinderschere an einer geraden Linie entlang schneiden.'],
    ['l','Fehlerfreie Aussprache, vereinzelt können noch Laute fehlerhaft ausgesprochen werden.'],
    ['l','Ereignisse und Geschichten werden im richtigen zeitlichen und logischen Ablauf wiedergegeben in korrekten, jedoch noch einfach strukturierten Sätzen.'],
    ['k','Mindestens 3 Farben werden erkannt und richtig benannt.'],
    ['s','Kann sich mit anderen Kindern gut im Spiel abwechseln.'],
    ['s','Ist bereit zu teilen.'],
    ['s','Kind kann seine Emotionen meist selbst regulieren.'],
    ['s','Toleriert meist leichtere, übliche Enttäuschungen.'],
    ['i','Das Kind lädt andere Kinder zu sich ein und wird selbst eingeladen.'],
    ['i','Intensive Rollenspiele: Verkleiden, Verwandlung in Tiere, Vorbilder (Ritter, Piraten, Helden), auch mit anderen Kindern.']
  ]}
];
STAGES.forEach(function(st){
  st.label=st.u+' · '+st.span;
  st.items=st.items.map(function(it,i){return {id:st.u.toLowerCase()+'_'+(i+1),c:it[0],t:it[1]};});
});

// ── U-Termine (v0.263) ──
// Zeitraum je U laut Gelbem Heft; `to` ist exklusiv (erster Tag DANACH).
// Lebenstag 1 = Geburtstag, also „3.–10. Lebenstag" = Tag 2 bis Tag 9.
// „3.–4. Lebensmonat" = ab 2 vollen Monaten bis vor 4 vollen Monaten.
// U1 fehlt bewusst: sie findet direkt nach der Geburt statt.
var UDATES=[{u:'U2',span:'3.–10. Lebenstag',from:{d:2},to:{d:10}}].concat(STAGES.map(function(st){
  var TO={U3:{d:35},U4:{m:4},U5:{m:7},U6:{m:12},U7:{m:24},U7a:{m:36},U8:{m:48},U9:{m:64}};
  return {u:st.u,span:st.span,from:st.from,to:TO[st.u]};
}));
var _allU=false;

var _open={};// welche Altersstufe aufgeklappt ist (nur Anzeige)
var _auto=true;// solange nichts geklickt wurde: aktuelle + nächste Stufe offen

function pad(n){return n<10?'0'+n:''+n;}
function today(){var d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function store(){return NTBaby.milesStore();}
function dateOf(id){var m=store()[id];return (m&&m.d)||'';}

// Volle Lebensmonate (Kalendermonate, nicht Tage/30) — null ohne Geburtsdatum.
function birthDate(){
  var p=((S.baby&&S.baby.birth)||'').split('-');
  return p.length===3?new Date(+p[0],+p[1]-1,+p[2]):null;
}
function ageMonths(){
  var b=birthDate();if(!b)return null;
  var now=new Date();
  var m=(now.getFullYear()-b.getFullYear())*12+(now.getMonth()-b.getMonth());
  if(now.getDate()<b.getDate())m--;
  return m<0?null:m;
}
function ageDays(){
  var b=birthDate();if(!b)return null;
  var d=Math.floor((new Date()-b)/86400000);
  return d<0?null:d;
}
function reached(st,months,days){
  return st.from.d!==undefined?days>=st.from.d:months>=st.from.m;
}
// Aktuelle Stufe = die letzte, deren U-Zeitraum begonnen hat; nächste = die danach.
function stageIdx(months,days){
  var cur=-1;
  if(months===null)return cur;
  STAGES.forEach(function(st,i){if(reached(st,months,days))cur=i;});
  return cur;
}
function ageLabel(months,days){
  if(days<14)return days+(days===1?' Tag':' Tage');
  if(days<70)return Math.floor(days/7)+' Wochen';
  if(months<24)return months+' Monate';
  return Math.floor(months/12)+' Jahre'+(months%12?' '+(months%12)+' Mon.':'');
}
function doneCount(st){
  var s=store();
  return st.items.filter(function(it){return !!(s[it.id]&&s[it.id].d);}).length;
}
function fmtD(k){var p=(k||'').split('-');return p.length===3?(p[2]+'.'+p[1]+'.'+p[0].slice(2)):'';}

function render(){
  var box=document.getElementById('babyMileList');
  if(!box)return;
  var age=ageMonths(),days=ageDays();
  var cur=stageIdx(age,days);
  var next=cur+1<STAGES.length?cur+1:-1;
  if(_auto){
    _open={};
    if(cur>=0)_open[cur]=true;
    if(next>=0)_open[next]=true;
  }
  var head=document.getElementById('babyMileHead');
  if(head){
    var name=(S.baby&&S.baby.name)||'Dein Baby';
    if(age===null){
      head.innerHTML='Ohne Geburtsdatum kann die App die passende Altersstufe nicht wählen. '
        +'<button type="button" class="seb" style="margin:8px 0 0;" data-act="NTFeat.openBabySettings">📝 Geburtsdatum eintragen</button>';
    }else{
      var txt=esc(name)+' ist <b>'+ageLabel(age,days)+'</b> alt.';
      if(cur>=0)txt+=' Aktuell: <b>'+STAGES[cur].u+'</b> ('+doneCount(STAGES[cur])+'/'+STAGES[cur].items.length+' erreicht).';
      if(next>=0)txt+=' Als Nächstes: '+STAGES[next].u+' ('+STAGES[next].span+').';
      head.innerHTML=txt;
    }
  }
  renderDates();
  var s=store();
  box.innerHTML=STAGES.map(function(st,i){
    var n=doneCount(st),tot=st.items.length;
    var tag=i===cur?' <span class="mile-tag">aktuell</span>':(i===next?' <span class="mile-tag nx">als Nächstes</span>':'');
    var open=!!_open[i];
    var h='<div class="mile-st'+(i===cur?' cur':'')+'">'
      +'<button type="button" class="mile-sh" data-act="NTMile.toggle" data-args="['+i+']">'
      +'<span>'+(open?'▾':'▸')+' '+st.label+tag+'</span>'
      +'<span class="mile-cnt'+(n===tot?' full':'')+'">'+n+'/'+tot+'</span></button>';
    if(open){
      h+='<div class="mile-items">'+st.items.map(function(it){
        var d=(s[it.id]&&s[it.id].d)||'';
        return '<button type="button" class="mile-it'+(d?' done':'')+'" data-act="NTMile.check" data-args=\'["'+it.id+'"]\' title="'+CAT_LABEL[it.c]+'">'
          +'<span class="mile-cb">'+(d?'✓':'')+'</span>'
          +'<span class="mile-tx">'+CAT[it.c]+' '+esc(it.t)+(d?'<span class="mile-d">erreicht '+fmtD(d)+'</span>':'')+'</span>'
          +'</button>';
      }).join('')+'</div>';
    }
    return h+'</div>';
  }).join('');
}

// Datum = Geburt + Tage bzw. volle Monate (Monatsende wird nicht übersprungen:
// 31.01. + 1 Monat = 28./29.02.).
function plus(b,o){
  var d=new Date(b.getFullYear(),b.getMonth(),b.getDate());
  if(o.d!==undefined){d.setDate(d.getDate()+o.d);return d;}
  var y=d.getFullYear(),m=d.getMonth()+o.m,day=d.getDate();
  var last=new Date(y,m+1,0).getDate();
  return new Date(y,m,Math.min(day,last));
}
function key(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function uWindows(){
  var b=birthDate();if(!b)return [];
  return UDATES.map(function(x){
    var f=plus(b,x.from),t=plus(b,x.to);t.setDate(t.getDate()-1);
    var done=dateOf('udone_'+x.u);
    return {u:x.u,span:x.span,from:key(f),to:key(t),done:done};
  });
}
function uState(w,t){
  if(w.done)return 'done';
  if(t<w.from)return 'future';
  if(t>w.to)return 'past';
  return 'now';
}
function toggleU(u){
  var id='udone_'+u;
  if(!dateOf(id)&&!confirm(u+' als erledigt abhaken (heute)?'))return;
  NTBaby.setMile(id,dateOf(id)?'':today());
  render();
  NTBaby.refresh();
}
function showAllU(){_allU=!_allU;render();}
// Termine = Tagebuch-Einträge {t:'appt'} an ihrem Datum.
function appts(){
  var out=[];
  Object.keys(S.babyLog||{}).forEach(function(d){
    NTBaby.logRO(d).forEach(function(e){if(e.t==='appt')out.push({d:d,e:e});});
  });
  out.sort(function(a,b){return a.d<b.d?-1:a.d>b.d?1:(a.e.ts||0)-(b.e.ts||0);});
  return out;
}
var WD=['So','Mo','Di','Mi','Do','Fr','Sa'];
function dShort(k){var p=k.split('-'),d=new Date(+p[0],+p[1]-1,+p[2]);return WD[d.getDay()]+' '+p[2]+'.'+p[1]+'.';}
function apptWhen(a){
  var t=today(),tm=NTBaby.addDayKey(t,1);
  var d=a.d===t?'Heute':a.d===tm?'Morgen':dShort(a.d)+(a.d.slice(0,4)!==t.slice(0,4)?a.d.slice(2,4):'');
  return d+(a.e.time?' '+a.e.time:'');
}
function renderDates(){
  var box=document.getElementById('babyUDates');
  if(!box)return;
  var t=today(),h='';
  var ws=uWindows();
  if(ws.length){
    var show=_allU?ws:ws.filter(function(w,i){
      var st=uState(w,t);
      // Standard: was jetzt dran ist, die nächste anstehende und offene vergangene
      if(st==='now'||st==='past')return true;
      if(st==='future')return ws.slice(0,i).every(function(x){return uState(x,t)!=='future';});
      return false;
    });
    h+='<div class="bby-sec">🩺 U-Untersuchungen</div>';
    h+=show.map(function(w){
      var st=uState(w,t);
      var lab={done:'✓ erledigt '+fmtD(w.done),now:'jetzt fällig',future:'demnächst',past:'Zeitraum vorbei – abhaken, falls erledigt'}[st];
      return '<button type="button" class="mile-it'+(st==='done'?' done':'')+'" data-act="NTMile.toggleU" data-args=\'["'+w.u+'"]\'>'
        +'<span class="mile-cb">'+(st==='done'?'✓':'')+'</span>'
        +'<span class="mile-tx"><b>'+w.u+'</b> · '+w.span+'<span class="mile-d'+(st==='now'?' now':'')+'">'+fmtD(w.from)+'–'+fmtD(w.to)+' · '+lab+'</span></span></button>';
    }).join('');
    h+='<button type="button" class="bby-link" data-act="NTMile.showAllU">'+(_allU?'Weniger anzeigen':'Alle U-Termine anzeigen')+'</button>';
  }
  var as=appts();
  var up=as.filter(function(a){return a.d>=t;}),past=as.filter(function(a){return a.d<t;}).slice(-3).reverse();
  h+='<div class="bby-sec" style="display:flex;justify-content:space-between;align-items:center;">📅 Termine &amp; Impfungen'
    +'<button type="button" class="bby-pill on" data-act="NTBaby.openEntry" data-args=\'["appt"]\'>＋ Termin</button></div>';
  if(!as.length)h+='<div style="font-size:12px;color:var(--mu);padding:4px 2px 8px;">Noch keine Termine. Impftermine und Arztbesuche hier eintragen – sie erscheinen ab einer Woche vorher auf der Kachel.</div>';
  var row=function(a,old){
    return '<div class="fe" onclick="NTBaby.editEntry(\''+a.e.id+'\')"'+(old?' style="opacity:.6;"':'')+'>'
      +'<div class="fee">'+(a.e.kind==='vacc'?'💉':a.e.kind==='u'?'🩺':'📅')+'</div>'
      +'<div class="fei"><div class="fen">'+esc(NTBaby.entryTitle(a.e))+'</div>'
      +'<div class="fem">'+apptWhen(a)+(a.e.note?' · '+esc(a.e.note):'')+'</div></div><div class="fe-ic">✏️</div></div>';
  };
  h+=up.map(function(a){return row(a,false);}).join('');
  if(past.length)h+='<div style="font-size:11px;color:var(--mu);margin:6px 2px 2px;">Zuletzt</div>'+past.map(function(a){return row(a,true);}).join('');
  box.innerHTML=h;
}
// Kachel: Termine der nächsten 7 Tage und eine gerade fällige U (höchstens 2 Zeilen).
function cardHtml(){
  if(!S.babyOn)return '';
  var t=today(),lim=NTBaby.addDayKey(t,7),out=[];
  appts().forEach(function(a){
    if(a.d>=t&&a.d<=lim&&out.length<2)out.push('📅 '+esc(apptWhen(a))+' · '+esc(NTBaby.entryTitle(a.e)));
  });
  var hasUAppt=appts().some(function(a){return a.d>=t&&a.e.kind==='u';});
  if(!hasUAppt&&out.length<2){
    uWindows().forEach(function(w){
      if(uState(w,t)==='now'&&out.length<2)out.push('🩺 '+w.u+' ist jetzt fällig (bis '+fmtD(w.to)+')');
    });
  }
  return out.map(function(x){return '<div class="bby-hint"><span>'+x+'</span></div>';}).join('');
}

function toggle(i){
  _auto=false;
  _open[i]=!_open[i];
  render();
}
function check(id){
  NTBaby.setMile(id,dateOf(id)?'':today());
  render();
}
// Einstieg von außen (Funktions-Blatt): Tagebuch öffnen, direkt im Reiter.
function open(){
  if(!window.NTBaby)return;
  NTBaby.openDiary();
  if(S.babyOn)NTBaby.setTab('mile');
}
function resetView(){_auto=true;}

window.NTMile={STAGES:STAGES,ageMonths:ageMonths,render:render,toggle:toggle,check:check,open:open,resetView:resetView,
  toggleU:toggleU,showAllU:showAllU,cardHtml:cardHtml,uWindows:uWindows};
})();
