// NutriTrack – Baby-Meilensteine (Reiter im Baby-Tagebuch, v0.261).
// Klassisches Script, exportiert window.NTMile. Zeigt die Entwicklungs-
// Meilensteine passend zum Alter aus S.baby.birth; abgehakt wird in
// S.babyMiles = {<id>:{d:'YYYY-MM-DD'|'',rev}} (Tag des Abhakens). Speichern
// und Sync (Baby-Topf) laufen ueber NTBaby.milesStore/setMile.
//
// Inhalt: CDC „Learn the Signs. Act Early." (Checklisten 2022). Ein Meilenstein
// steht bei dem Alter, in dem ihn etwa 75 % der Kinder erreicht haben. Die IDs
// sind fest (Alter + laufende Nummer) — nie umnummerieren, sonst wandern
// gespeicherte Haken auf einen anderen Text.
(function(){
'use strict';

var CAT={s:'💛',l:'💬',k:'🧠',m:'🏃'};
var CAT_LABEL={s:'Sozial & Gefühle',l:'Sprache',k:'Denken & Lernen',m:'Bewegung'};

var STAGES=[
  {m:2,label:'2 Monate',items:[
    ['s','Beruhigt sich, wenn man es anspricht oder hochnimmt'],
    ['s','Schaut dir ins Gesicht'],
    ['s','Freut sich, wenn du kommst'],
    ['s','Lächelt, wenn du es ansprichst oder anlächelst'],
    ['l','Macht andere Laute als Weinen'],
    ['l','Reagiert auf laute Geräusche'],
    ['k','Folgt dir mit den Augen, wenn du dich bewegst'],
    ['k','Schaut ein Spielzeug mehrere Sekunden lang an'],
    ['m','Hebt in Bauchlage den Kopf'],
    ['m','Bewegt beide Arme und beide Beine'],
    ['m','Öffnet kurz die Hände']
  ]},
  {m:4,label:'4 Monate',items:[
    ['s','Lächelt von sich aus, um deine Aufmerksamkeit zu bekommen'],
    ['s','Gluckst, wenn du es zum Lachen bringen willst'],
    ['s','Schaut dich an, bewegt sich oder macht Laute, um deine Aufmerksamkeit zu halten'],
    ['l','Gurrt und macht Laute wie „oooh", „aaah"'],
    ['l','Macht Laute zurück, wenn du mit ihm sprichst'],
    ['l','Dreht den Kopf zu deiner Stimme'],
    ['k','Öffnet den Mund, wenn es Hunger hat und Brust oder Flasche sieht'],
    ['k','Schaut interessiert auf die eigenen Hände'],
    ['m','Hält den Kopf ohne Stütze, wenn du es hältst'],
    ['m','Hält ein Spielzeug fest, wenn du es ihm in die Hand gibst'],
    ['m','Schwingt mit dem Arm nach Spielzeug'],
    ['m','Führt die Hände zum Mund'],
    ['m','Stützt sich in Bauchlage auf Ellbogen oder Unterarme']
  ]},
  {m:6,label:'6 Monate',items:[
    ['s','Erkennt vertraute Menschen'],
    ['s','Schaut sich gern im Spiegel an'],
    ['s','Lacht'],
    ['l','Macht abwechselnd mit dir Laute'],
    ['l','Pustet „Himbeeren" (Zunge raus und prusten)'],
    ['l','Quietscht'],
    ['k','Steckt Dinge in den Mund, um sie zu erkunden'],
    ['k','Greift nach einem Spielzeug, das es haben will'],
    ['k','Schließt die Lippen, wenn es nicht mehr essen will'],
    ['m','Dreht sich vom Bauch auf den Rücken'],
    ['m','Stemmt sich in Bauchlage auf gestreckte Arme hoch'],
    ['m','Stützt sich im Sitzen mit den Händen ab']
  ]},
  {m:9,label:'9 Monate',items:[
    ['s','Fremdelt bei Unbekannten'],
    ['s','Zeigt verschiedene Gesichtsausdrücke (fröhlich, traurig, wütend, überrascht)'],
    ['s','Schaut, wenn du seinen Namen rufst'],
    ['s','Reagiert, wenn du gehst (schaut, greift nach dir, weint)'],
    ['s','Lächelt oder lacht beim Guck-guck-Spiel'],
    ['l','Macht Silbenketten wie „mamama", „bababa"'],
    ['l','Hebt die Arme, um hochgenommen zu werden'],
    ['k','Sucht Dinge, die es fallen gelassen hat'],
    ['k','Schlägt zwei Dinge aneinander'],
    ['m','Kommt allein in den Sitz'],
    ['m','Gibt Dinge von einer Hand in die andere'],
    ['m','Holt Essen mit den Fingern heran'],
    ['m','Sitzt ohne Stütze']
  ]},
  {m:12,label:'12 Monate',items:[
    ['s','Spielt mit dir, z. B. Backe-backe-Kuchen'],
    ['l','Winkt „Tschüss"'],
    ['l','Sagt „Mama", „Papa" oder einen anderen Namen gezielt'],
    ['l','Versteht „Nein" (hält kurz inne)'],
    ['k','Legt etwas in einen Behälter, z. B. einen Klotz in eine Dose'],
    ['k','Sucht Dinge, die du vor seinen Augen versteckst'],
    ['m','Zieht sich zum Stehen hoch'],
    ['m','Läuft an Möbeln entlang'],
    ['m','Trinkt aus einem offenen Becher, den du hältst'],
    ['m','Greift kleine Dinge mit Daumen und Zeigefinger (Pinzettengriff)']
  ]},
  {m:15,label:'15 Monate',items:[
    ['s','Ahmt andere Kinder beim Spielen nach'],
    ['s','Zeigt dir etwas, das es mag'],
    ['s','Klatscht, wenn es sich freut'],
    ['s','Umarmt ein Kuscheltier oder eine Puppe'],
    ['s','Zeigt Zuneigung (umarmen, kuscheln, küssen)'],
    ['l','Sagt ein oder zwei Wörter außer „Mama"/„Papa"'],
    ['l','Schaut auf einen bekannten Gegenstand, wenn du ihn benennst'],
    ['l','Befolgt Aufforderungen mit Geste und Wort („Gib mir das")'],
    ['l','Zeigt auf etwas, um danach zu fragen oder Hilfe zu bekommen'],
    ['k','Versucht, Dinge richtig zu benutzen (Telefon, Becher, Buch)'],
    ['k','Stapelt zwei kleine Dinge, z. B. Bauklötze'],
    ['m','Macht ein paar Schritte allein'],
    ['m','Isst mit den Fingern selbst']
  ]},
  {m:18,label:'18 Monate',items:[
    ['s','Entfernt sich, schaut aber, ob du in der Nähe bleibst'],
    ['s','Zeigt auf etwas, um es dir zu zeigen'],
    ['s','Streckt dir die Hände zum Waschen hin'],
    ['s','Schaut mit dir ein Buch an'],
    ['s','Hilft beim Anziehen (Arm in den Ärmel)'],
    ['l','Versucht, drei oder mehr Wörter außer „Mama"/„Papa" zu sagen'],
    ['l','Befolgt einfache Aufforderungen ohne Geste („Gib mir das Spielzeug")'],
    ['k','Macht dir Alltägliches nach, z. B. Fegen'],
    ['k','Spielt auf einfache Weise mit Spielzeug (schiebt ein Auto)'],
    ['m','Läuft ohne sich festzuhalten'],
    ['m','Kritzelt'],
    ['m','Trinkt aus einem offenen Becher, auch wenn mal etwas daneben geht'],
    ['m','Versucht, mit dem Löffel zu essen'],
    ['m','Klettert ohne Hilfe auf Sofa oder Stuhl und wieder herunter']
  ]},
  {m:24,label:'2 Jahre',items:[
    ['s','Merkt, wenn andere verletzt oder traurig sind'],
    ['s','Schaut dir ins Gesicht, um zu sehen, wie du in einer neuen Lage reagierst'],
    ['l','Zeigt auf Dinge in einem Buch, wenn du fragst („Wo ist der Bär?")'],
    ['l','Sagt mindestens zwei Wörter zusammen („mehr Milch")'],
    ['l','Zeigt auf mindestens zwei Körperteile, wenn du fragst'],
    ['l','Nutzt mehr Gesten als Winken und Zeigen (Kusshand, Nicken)'],
    ['k','Hält etwas in einer Hand und benutzt die andere (Deckel abnehmen)'],
    ['k','Probiert Knöpfe und Schalter an Spielzeug aus'],
    ['k','Spielt mit mehr als einem Spielzeug gleichzeitig'],
    ['m','Kickt einen Ball'],
    ['m','Rennt'],
    ['m','Geht ein paar Stufen hoch (mit oder ohne Hilfe)'],
    ['m','Isst mit dem Löffel']
  ]},
  {m:30,label:'2½ Jahre',items:[
    ['s','Spielt neben anderen Kindern und manchmal mit ihnen'],
    ['s','Zeigt, was es kann („Schau mal!")'],
    ['s','Befolgt einfache Abläufe, z. B. beim Aufräumen mithelfen'],
    ['l','Sagt etwa 50 Wörter'],
    ['l','Sagt zwei oder mehr Wörter mit einem Tunwort („Hund läuft")'],
    ['l','Benennt Dinge in einem Buch, wenn du darauf zeigst'],
    ['l','Sagt Wörter wie „ich", „mich", „wir"'],
    ['k','Spielt „So tun als ob" (füttert eine Puppe)'],
    ['k','Löst einfache Probleme (holt einen Hocker, um etwas zu erreichen)'],
    ['k','Befolgt Aufforderungen aus zwei Schritten („Leg das hin und schließ die Tür")'],
    ['k','Kennt mindestens eine Farbe'],
    ['m','Dreht Dinge mit der Hand (Türgriff, Deckel)'],
    ['m','Zieht einige Kleidungsstücke selbst aus'],
    ['m','Springt mit beiden Füßen ab'],
    ['m','Blättert Buchseiten einzeln um']
  ]},
  {m:36,label:'3 Jahre',items:[
    ['s','Beruhigt sich innerhalb von 10 Minuten, nachdem du gegangen bist (z. B. in der Kita)'],
    ['s','Bemerkt andere Kinder und spielt mit ihnen'],
    ['l','Unterhält sich mit dir mindestens zwei Wechsel lang'],
    ['l','Stellt W-Fragen (wer, was, wo, warum)'],
    ['l','Sagt, was auf einem Bild oder in einem Buch passiert'],
    ['l','Sagt seinen Vornamen, wenn man fragt'],
    ['l','Spricht meist so, dass andere es verstehen'],
    ['k','Malt einen Kreis, wenn du es vormachst'],
    ['k','Meidet heiße Dinge wie den Herd, wenn du warnst'],
    ['m','Fädelt Dinge auf, z. B. große Perlen oder Nudeln'],
    ['m','Zieht sich einige Kleidungsstücke selbst an'],
    ['m','Isst mit der Gabel']
  ]}
];
STAGES.forEach(function(st){
  st.items=st.items.map(function(it,i){return {id:'m'+st.m+'_'+(i+1),c:it[0],t:it[1]};});
});

var _open={};// welche Altersstufe aufgeklappt ist (nur Anzeige)
var _auto=true;// solange nichts geklickt wurde: aktuelle + nächste Stufe offen

function pad(n){return n<10?'0'+n:''+n;}
function today(){var d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function store(){return NTBaby.milesStore();}
function dateOf(id){var m=store()[id];return (m&&m.d)||'';}

// Volle Lebensmonate (Kalendermonate, nicht Tage/30) — null ohne Geburtsdatum.
function ageMonths(){
  var b=(S.baby&&S.baby.birth)||'';
  var p=b.split('-');if(p.length!==3)return null;
  var now=new Date();
  var m=(now.getFullYear()-(+p[0]))*12+(now.getMonth()-(+p[1]-1));
  if(now.getDate()<(+p[2]))m--;
  return m<0?null:m;
}
// Aktuelle Stufe = die letzte, deren Alter erreicht ist; nächste = die danach.
function stageIdx(age){
  var cur=-1;
  if(age===null)return cur;
  STAGES.forEach(function(st,i){if(age>=st.m)cur=i;});
  return cur;
}
function doneCount(st){
  var s=store();
  return st.items.filter(function(it){return !!(s[it.id]&&s[it.id].d);}).length;
}
function fmtD(k){var p=(k||'').split('-');return p.length===3?(p[2]+'.'+p[1]+'.'+p[0].slice(2)):'';}

function render(){
  var box=document.getElementById('babyMileList');
  if(!box)return;
  var age=ageMonths();
  var cur=stageIdx(age);
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
      var a=age<24?(age+(age===1?' Monat':' Monate')):(Math.floor(age/12)+' Jahre'+(age%12?' '+(age%12)+' Mon.':''));
      var txt=esc(name)+' ist <b>'+a+'</b> alt.';
      if(cur>=0)txt+=' Aktuell: <b>'+STAGES[cur].label+'</b> ('+doneCount(STAGES[cur])+'/'+STAGES[cur].items.length+' erreicht).';
      if(next>=0)txt+=' Als Nächstes: '+STAGES[next].label+'.';
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
