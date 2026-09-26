// NutriTrack – Baby: Fragen an die Hebamme (Reiter im Baby-Tagebuch, v0.264).
// Klassisches Script, exportiert window.NTMidwife. Nutzt NTBaby (js/baby.js)
// und die globalen Helfer aus index.html (S, saveS, esc, openOv, closeOv, showToast).
//
// Eine Liste S.babyQs=[{id,q,a,done,doneAt,at,rev,del?}]: Frage, Antwort der
// Hebamme, abgehakt (besprochen) mit Datum. Geloescht wird weich (del:1), damit
// die Loeschung mit verbundenen Personen abgeglichen wird. Die Liste reist im
// Baby-Topf als `hqa_<id>`, Payload {hq} (siehe records()/applyRec() in js/baby.js).
(function(){
'use strict';

var _filter='open';// 'open' | 'done' | 'all'
var _query='';
var _editId=null;

function all(){if(!Array.isArray(S.babyQs))S.babyQs=[];return S.babyQs;}
function list(){return all().filter(function(x){return !x.del;});}
function byId(id){return list().find(function(x){return x.id===id;})||null;}
function openCount(){return list().filter(function(x){return !x.done;}).length;}
function fmtD(d){if(!d)return '';var p=d.split('-');return p[2]+'.'+p[1]+'.'+p[0].slice(2);}
function fmtTs(ts){if(!ts)return '';var d=new Date(ts);return fmtD(d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2));}
function touch(x){
  x.rev=NTBaby._nextRev();
  saveS();NTBaby._schedule();
}
function isOpen(id){var el=document.getElementById(id);return !!(el&&el.classList.contains('open'));}
function argsOf(v){return JSON.stringify(v).replace(/'/g,'&#39;');}

// ── Suche ──
// Alle Woerter muessen vorkommen (in Frage ODER Antwort), Gross-/Kleinschreibung egal.
function words(){return _query.toLowerCase().split(/\s+/).filter(Boolean);}
function matches(x,ws){
  var hay=((x.q||'')+'\n'+(x.a||'')).toLowerCase();
  return ws.every(function(w){return hay.indexOf(w)>=0;});
}
function reEsc(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
// Treffer markieren: am Rohtext teilen, jedes Stueck einzeln escapen (sonst
// traefe die Suche „amp" mitten in ein &amp;).
function hl(text,ws){
  text=text||'';
  if(!ws.length)return esc(text);
  var re=new RegExp('('+ws.map(reEsc).join('|')+')','gi');
  return text.split(re).map(function(part,i){return i%2?'<mark>'+esc(part)+'</mark>':esc(part);}).join('');
}

// ── Reiter ──
function render(){
  var box=document.getElementById('babyQaList');
  if(!box)return;
  document.querySelectorAll('#babyQaFilter [data-qf]').forEach(function(b){
    b.classList.toggle('act',b.getAttribute('data-qf')===_filter);
  });
  var ws=words();
  var qs=list();
  var nOpen=qs.filter(function(x){return !x.done;}).length;
  var head=document.getElementById('babyQaHead');
  if(head){
    head.textContent=!qs.length?'Noch keine Fragen notiert.'
      :(nOpen?nOpen+(nOpen===1?' offene Frage':' offene Fragen'):'Alle Fragen besprochen ✓')
        +' · '+(qs.length-nOpen)+' beantwortet/abgehakt';
  }
  // Mit Suchbegriff wird immer in allen Fragen gesucht – sonst findet man die
  // alte Antwort nicht, solange der Filter auf „Offen" steht.
  var shown=ws.length?qs.filter(function(x){return matches(x,ws);})
    :qs.filter(function(x){return _filter==='all'||(_filter==='done'?!!x.done:!x.done);});
  shown.sort(function(a,b){
    if(!!a.done!==!!b.done)return a.done?1:-1;
    return (b.at||0)-(a.at||0);
  });
  var fl=document.getElementById('babyQaFilter');
  if(fl)fl.style.opacity=ws.length?'.45':'';
  if(!shown.length){
    box.innerHTML='<div style="font-size:13px;color:var(--mu);font-style:italic;padding:14px 2px;">'
      +(ws.length?'Keine Frage oder Antwort passt zu „'+esc(_query)+'“.'
        :_filter==='done'?'Noch nichts abgehakt.'
        :_filter==='open'&&qs.length?'Keine offenen Fragen – alles besprochen.'
        :'Oben eine Frage eintippen und „＋ Notieren“ – beim nächsten Besuch abhaken und die Antwort dazuschreiben.')
      +'</div>';
    return;
  }
  box.innerHTML=shown.map(function(x){
    var a=argsOf([x.id]);
    var meta='notiert '+fmtTs(x.at)+(x.done?' · abgehakt '+fmtD(x.doneAt):'');
    return '<div class="qa-it'+(x.done?' done':'')+'">'
      +'<button type="button" class="mile-cb qa-cb" aria-label="'+(x.done?'Haken entfernen':'Abhaken')+'" data-act="NTMidwife.toggle" data-args=\''+a+'\'>'+(x.done?'✓':'')+'</button>'
      +'<div class="qa-body" data-act="NTMidwife.edit" data-args=\''+a+'\'>'
        +'<div class="qa-q">'+hl(x.q,ws)+'</div>'
        +(x.a?'<div class="qa-a"><b>🤱 Antwort:</b> '+hl(x.a,ws).replace(/\n/g,'<br>')+'</div>'
             :'<div class="qa-add">＋ Antwort eintragen</div>')
        +'<div class="qa-meta">'+meta+'</div>'
      +'</div></div>';
  }).join('');
}
function setFilter(f){_filter=(f==='done'||f==='all')?f:'open';render();}
function search(v){_query=String(v||'').trim();render();}
function clearSearch(){
  _query='';
  var f=document.getElementById('bqaSearch');if(f)f.value='';
  render();
}

// Schnell notieren aus dem Reiter
function add(){
  var f=document.getElementById('bqaNew');
  var q=f?f.value.trim():'';
  if(!q){showToast('Bitte zuerst die Frage eintippen');if(f)f.focus();return;}
  var x={id:'q'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),q:q,a:'',done:0,doneAt:'',at:Date.now()};
  all().push(x);
  touch(x);
  f.value='';
  if(_filter==='done')_filter='open';
  render();NTBaby.refresh();
  showToast('❓ Frage notiert');
}
function toggle(id){
  var x=byId(id);if(!x)return;
  x.done=x.done?0:1;
  x.doneAt=x.done?NTBaby.today():'';
  touch(x);
  render();NTBaby.refresh();
}

// ── Bearbeiten: Frage, Antwort, Haken ──
function edit(id){
  var x=byId(id);if(!x)return;
  _editId=id;
  document.getElementById('bqaQ').value=x.q||'';
  document.getElementById('bqaA').value=x.a||'';
  document.getElementById('bqaDone').checked=!!x.done;
  document.getElementById('bqaMeta').textContent='Notiert am '+fmtTs(x.at)+(x.done&&x.doneAt?' · abgehakt am '+fmtD(x.doneAt):'');
  openOv('babyQaOv');
}
// Wer eine Antwort eintraegt, hat die Frage in der Regel besprochen: beim
// ersten Zeichen den Haken setzen – bleibt sichtbar und abwaehlbar.
function answerInput(){
  var a=document.getElementById('bqaA'),c=document.getElementById('bqaDone');
  if(a&&c&&a.value.trim()&&!a._auto){a._auto=1;c.checked=true;}
}
function save(){
  var x=_editId?byId(_editId):null;if(!x)return;
  var q=document.getElementById('bqaQ').value.trim();
  if(!q){showToast('Die Frage darf nicht leer sein');return;}
  var done=document.getElementById('bqaDone').checked?1:0;
  x.q=q;
  x.a=document.getElementById('bqaA').value.trim();
  if(done&&!x.done)x.doneAt=NTBaby.today();
  if(!done)x.doneAt='';
  x.done=done;
  touch(x);
  closeEdit();
  render();NTBaby.refresh();
  showToast('Gespeichert ✓');
}
function del(){
  var x=_editId?byId(_editId):null;if(!x)return;
  if(!confirm('Diese Frage'+(x.a?' samt Antwort':'')+' löschen?'))return;
  x.del=1;
  touch(x);
  closeEdit();
  render();NTBaby.refresh();
}
function closeEdit(){
  _editId=null;
  var a=document.getElementById('bqaA');if(a)a._auto=0;
  closeOv('babyQaOv');
}

// Hinweis auf Kachel/Tagebuch: offene Fragen, ein Tipp oeffnet den Reiter.
function cardHtml(){
  if(!S.babyOn)return '';
  var n=openCount();
  if(!n)return '';
  return '<div class="bby-hint"><span>❓ '+n+(n===1?' offene Frage':' offene Fragen')+' an die Hebamme</span>'
    +'<button type="button" class="bby-pill" data-act="NTMidwife.open">Ansehen</button></div>';
}

function open(){
  if(!window.NTBaby)return;
  if(!isOpen('babyOv'))NTBaby.openDiary();
  if(S.babyOn)NTBaby.setTab('mw');
}

window.NTMidwife={list:list,render:render,setFilter:setFilter,search:search,clearSearch:clearSearch,
  add:add,toggle:toggle,edit:edit,answerInput:answerInput,save:save,del:del,closeEdit:closeEdit,
  cardHtml:cardHtml,open:open,openCount:openCount};
})();
