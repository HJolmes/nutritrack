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

window.NTMile={STAGES:STAGES,ageMonths:ageMonths,render:render,toggle:toggle,check:check,open:open,resetView:resetView};
})();
