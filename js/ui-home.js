// @ts-check
// B3 home uses existing rendered totals and Baby API, never a second calculator.
(function(){
'use strict';
var standard=['stillen','wickeln','schlaf','mahlzeit','einkauf','plan'];
var lastMarkup='';
function actions(){
  var p=NTUI.prefs();
  if(!Array.isArray(p.homeActions)){
    var old=Array.isArray(S.launchBar)?S.launchBar.filter(function(id){return NTLaunch.ACTIONS.some(function(a){return a.id===id;});}):[];
    p.homeActions=(old.length?old:standard).slice(0,6);saveS();
  }
  return p.homeActions;
}
function disabledFeature(a){
  if(a.baby&&!S.babyOn)return 'baby';
  var id=({wasser:'water',sport:'exercise',einkauf:'shop',vorrat:'pantry',kochbuch:'book',plan:'plan'})[a.id];
  var f=id&&NTFeat.byId(id);return f&&NTFeat.isOff(f)?id:'';
}
function btn(label,act,args,primary){return '<button type="button"'+(primary?' class="b3-primary"':'')+' data-act="'+act+'" data-args="'+esc(JSON.stringify(args||[]))+'">'+esc(label)+'</button>';}
function quickButton(a,label,off){
  return '<button type="button"'+(off?' class="b3-quick-off" aria-label="'+esc(label+' · Funktion einschalten')+'"':'')+' data-act="NTUIHome.run" data-args="'+esc(JSON.stringify([a.id]))+'"><span class="b3-quick-icon" aria-hidden="true">'+esc(a.ic)+'</span><span class="b3-quick-label">'+esc(label)+'</span>'+(off?'<span class="b3-quick-state">Aus</span>':'')+'</button>';
}
function text(id){var el=document.getElementById(id);return el?el.textContent:'';}
function breast(openLink){
  if(!S.babyOn)return '';
  var today=S.currentDate===NTBaby.today(),n=NTBaby.nextSide(S.currentDate),run=NTBaby.runningFeed();
  var h='<section class="b3-card b3-baby-card" aria-label="Baby-Kurzstatus"><h2><span aria-hidden="true">👶</span> '+esc((S.baby&&S.baby.name)||'Baby')+'</h2>';
  h+='<p class="b3-next-side">Nächste Seite: '+(n?esc(NTBaby.SIDES[n]):'Noch kein Vorschlag')+'</p><p class="b3-muted">'+(n?'Vorschlag aus letztem Stillen':'Links oder rechts selbst auswählen')+'</p>';
  h+='<div class="b3-row">';
  if(today&&!run)h+=n
    ?btn('Stillen '+NTBaby.SIDES[n],'NTBaby.startFeed',[n],true)+btn((n==='l'?'Rechts':'Links')+' starten','NTBaby.startFeed',[n==='l'?'r':'l'])
    :btn('Links starten','NTBaby.startFeed',['l'])+btn('Rechts starten','NTBaby.startFeed',['r']);
  var feed=today?NTBaby.feedLineHtml():'';
  var sleep=today&&openLink===false&&NTBaby.openSleep(S.currentDate);
  if(sleep)h+=btn('Schlaf beenden','NTBaby.endSleep',[sleep.e.id]);
  h+='</div>'+(feed?'<div class="b3-feed-line">'+feed+'</div>':'')+'<p class="b3-muted">'+esc(NTBaby.summaryText(S.currentDate)||'Für diesen Tag noch nichts eingetragen')+'</p>';
  if(openLink!==false)h+=btn('Baby öffnen','NTUI.go',['baby']);return h+'</section>';
}
function render(){
  var root=document.getElementById('b3Content');if(!root||!NTUI.enabled())return;
  var key=NTBaby.today(),n=S.babyOn?NTBaby.nextSide(key):'',run=S.babyOn&&NTBaby.runningFeed();
  var quick=actions().map(function(id){return NTLaunch.ACTIONS.find(function(a){return a.id===id;});}).filter(Boolean);
  var date=esc(new Date(S.currentDate+'T12:00:00').toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long'}));
  var h='<div class="b3-date"><button type="button" data-act="NTUI.changeDay" data-args="[-1]" aria-label="Vorheriger Tag">‹</button><p><time datetime="'+esc(S.currentDate)+'">'+date+'</time></p><button type="button" data-act="NTUI.changeDay" data-args="[1]" aria-label="Nächster Tag"'+(S.currentDate>=key?' disabled':'')+'>›</button></div>';
  h+='<section aria-labelledby="b3PriorityTitle"><div class="b3-section-head"><h2 id="b3PriorityTitle">Gerade wichtig</h2>'+btn('Hinweise anpassen','NTUIReminders.open')+'</div>'+NTUIPriority.html()+'</section>';
  h+='<section aria-labelledby="b3QuickTitle"><div class="b3-section-head"><h2 id="b3QuickTitle">Schnell erfassen</h2>'+btn('Anpassen','NTUIHome.configure')+'</div><div class="b3-quick">';
  h+=quick.map(function(a){
    var off=disabledFeature(a),label=a.label;
    if(!off&&a.id==='stillen')label=run?'Stillen stoppen':('Stillen'+(n?' '+NTBaby.SIDES[n]:' · wählen'));
    if(!off&&a.id==='schlaf'&&NTBaby.openSleep(key))label='Schlaf beenden';
    return quickButton(a,label,off);
  }).join('')+'</div>'+(quick.length?'':'<p class="b3-muted">Wähle deine Schnellaktionen unter „Anpassen“.</p>')+'</section>';
  h+='<div class="b3-overview"><h2 class="b3-overview-title">Tagesüberblick</h2>'+breast();
  var remaining=text('remKcal');
  h+='<section class="b3-card b3-summary-card"><h2><span aria-hidden="true">🥗</span> Ernährung</h2><div class="b3-summary-metrics"><div class="b3-metric"><strong>'+esc(text('totKcal'))+' kcal</strong>erfasst</div><div class="b3-metric"><strong>'+esc(remaining.replace(/^[−-]/,''))+' kcal</strong>'+(/^[−-]/.test(remaining)?'über dem Ziel':'verfügbar')+'</div></div><p class="b3-muted">Eiweiß '+esc(text('tP'))+' · Kohlenhydrate '+esc(text('tC'))+' · Fett '+esc(text('tF'))+'</p>'+(disabledFeature({id:'wasser'})?'':'<p class="b3-muted">Wasser: '+esc(text('wVal'))+'</p>')+btn('Ernährung öffnen','NTUI.go',['nutrition'])+'</section></div>';
  if(h!==lastMarkup||!root.firstChild){root.innerHTML=h;lastMarkup=h;}
}
function run(id){
  var action=NTLaunch.ACTIONS.find(function(a){return a.id===id;});if(!action)return;
  var off=disabledFeature(action);if(off){NTFeat.sheet(off);return;}
  if(id==='schlaf'){NTBaby.toggleSleep(NTBaby.today());return;}
  if(id==='stillen'&&S.babyOn&&!NTBaby.runningFeed()&&!NTBaby.nextSide(NTBaby.today())){
    NTUIActions.show('Stillen starten',NTUIActions.button('Links starten','NTBaby.startFeed',['l'])+NTUIActions.button('Rechts starten','NTBaby.startFeed',['r']));return;
  }
  NTLaunch.run(id);
}
function configure(){
  var selected=actions();
  document.getElementById('b3HomePrefsBody').innerHTML='<p>Bis zu sechs Aktionen. Die persönlichen Baby-Schnellknöpfe bleiben separat erhalten.</p>'+NTLaunch.ACTIONS.filter(function(a){return selected.includes(a.id)||!disabledFeature(a);}).map(function(a){
    var at=selected.indexOf(a.id),on=at>=0;
    return '<div class="b3-row">'+btn((on?'✓ ':'＋ ')+a.label,'NTUIHome.toggle',[a.id])+(on?btn('Hoch','NTUIHome.move',[a.id,-1])+btn('Runter','NTUIHome.move',[a.id,1]):'')+'</div>';
  }).join('');
  openOv('b3HomePrefsOv');
}
function toggle(id){
  var list=actions().slice(),at=list.indexOf(id);
  if(at>=0)list.splice(at,1);else {if(list.length>=6){showToast('Zuerst eine der sechs Aktionen abwählen.');return;}list.push(id);}
  NTUI.prefs().homeActions=list;saveS();configure();render();
}
function move(id,dir){var list=actions().slice(),at=list.indexOf(id),to=at+dir;if(at<0||to<0||to>=list.length)return;list.splice(to,0,list.splice(at,1)[0]);NTUI.prefs().homeActions=list;saveS();configure();render();}
window.NTUIHome={render:render,breast:breast,actions:actions,run:run,configure:configure,toggle:toggle,move:move};
})();
