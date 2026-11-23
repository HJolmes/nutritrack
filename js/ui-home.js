// @ts-check
// B3 home uses existing rendered totals and Baby API, never a second calculator.
(function(){
'use strict';
var standard=['stillen','wickeln','schlaf','mahlzeit','einkauf','plan'];
function actions(){
  var p=NTUI.prefs();
  if(!Array.isArray(p.homeActions)){
    var old=Array.isArray(S.launchBar)?S.launchBar.filter(function(id){return NTLaunch.ACTIONS.some(function(a){return a.id===id;});}):[];
    p.homeActions=(old.length?old:standard).slice(0,6);saveS();
  }
  return p.homeActions;
}
function allowed(a){
  if(a.baby&&!S.babyOn)return false;
  var id=({wasser:'water',sport:'exercise',einkauf:'shop',vorrat:'pantry',kochbuch:'book',plan:'plan'})[a.id];
  var f=id&&NTFeat.byId(id);return !f||!NTFeat.isOff(f);
}
function btn(label,act,args,primary){return '<button type="button"'+(primary?' class="b3-primary"':'')+' data-act="'+act+'" data-args="'+esc(JSON.stringify(args||[]))+'">'+esc(label)+'</button>';}
function quickButton(a,label){
  return '<button type="button" data-act="NTUIHome.run" data-args="'+esc(JSON.stringify([a.id]))+'"><span class="b3-quick-icon" aria-hidden="true">'+esc(a.ic)+'</span><span class="b3-quick-label">'+esc(label)+'</span></button>';
}
function text(id){var el=document.getElementById(id);return el?el.textContent:'';}
function breast(openLink){
  if(!S.babyOn)return '';
  var n=NTBaby.nextSide(S.currentDate),run=NTBaby.runningFeed();
  var h='<section class="b3-card b3-baby-card" aria-label="Baby-Kurzstatus"><h2>👶 '+esc((S.baby&&S.baby.name)||'Baby')+'</h2>';
  h+='<p class="b3-next-side">Nächste Brust: '+(n?esc(NTBaby.SIDES[n]):'Noch kein Vorschlag')+'</p><p class="b3-muted">'+(n?'Vorschlag aus letztem Stillen':'Links oder rechts selbst auswählen')+'</p>';
  h+='<div class="b3-row">';
  if(!run&&n)h+=btn('Stillen '+NTBaby.SIDES[n],'NTBaby.startFeed',[n],true);
  if(!run&&n)h+=btn((n==='l'?'Rechts':'Links')+' starten','NTBaby.startFeed',[n==='l'?'r':'l']);
  if(!run&&!n)h+=btn('Links starten','NTBaby.startFeed',['l'])+btn('Rechts starten','NTBaby.startFeed',['r']);
  h+='</div><div class="b3-feed-line">'+NTBaby.feedLineHtml()+'</div><p class="b3-muted">'+esc(NTBaby.summaryText(S.currentDate)||'Für diesen Tag noch nichts eingetragen')+'</p>';
  if(openLink!==false)h+=btn('Baby öffnen','NTUI.go',['baby']);return h+'</section>';
}
function priority(){
  if(window.NTUIPriority)return NTUIPriority.html();
  var h='',run=S.babyOn&&NTBaby.runningFeed(),sleep=S.babyOn&&NTBaby.openSleep(NTBaby.today());
  if(run)h+='<article class="b3-card b3-active"><h3>Stillen '+esc(NTBaby.SIDES[run.side]||'')+' läuft</h3>'+NTBaby.feedLineHtml()+'</article>';
  if(sleep)h+='<article class="b3-card'+(run?'':' b3-active')+'"><h3>Schlaf läuft</h3><p>Seit '+esc(sleep.e.from)+'</p>'+btn('Wach jetzt','NTBaby.endSleep',[sleep.e.id],true)+'</article>';
  return h||'<article class="b3-card"><h3>Nichts Dringendes</h3><p class="b3-muted">Dein Tagesstand bleibt unten im Blick.</p>'+btn('Etwas erfassen','NTUIActions.all')+'</article>';
}
function render(){
  var root=document.getElementById('b3Content');if(!root||!NTUI.enabled())return;
  var n=S.babyOn?NTBaby.nextSide(S.currentDate):'',run=S.babyOn&&NTBaby.runningFeed();
  var quick=actions().map(function(id){return NTLaunch.ACTIONS.find(function(a){return a.id===id;});}).filter(function(a){return a&&allowed(a);});
  var h='<div class="b3-row b3-date">'+btn('‹','NTUI.changeDay',[-1])+ '<p>'+esc(new Date(S.currentDate+'T12:00:00').toLocaleDateString('de-DE',{weekday:'short',day:'numeric',month:'long'}))+'</p>'+btn('›','NTUI.changeDay',[1])+'</div>';
  h+='<section aria-labelledby="b3PriorityTitle"><div class="b3-section-head"><h2 id="b3PriorityTitle">Gerade wichtig</h2>'+btn('Hinweise anpassen','NTUIReminders.open')+'</div>'+priority()+'</section>';
  h+='<section aria-labelledby="b3QuickTitle"><div class="b3-section-head"><h2 id="b3QuickTitle">Schnell erfassen</h2>'+btn('Anpassen','NTUIHome.configure')+'</div><div class="b3-quick">';
  h+=quick.map(function(a){var label=a.label;
    if(a.id==='stillen')label=run?'Stillen stoppen':('Stillen'+(n?' '+NTBaby.SIDES[n]:' · wählen'));
    if(a.id==='schlaf'&&S.babyOn&&NTBaby.openSleep(NTBaby.today()))label='Schlaf beenden';
    return quickButton(a,label);
  }).join('')+'</div></section>';
  h+='<h2 class="b3-overview-title">Dein Tagesüberblick</h2>'+breast();
  h+='<section class="b3-card b3-summary-card"><h2>🥗 Ernährung</h2><div class="b3-summary-metrics"><div class="b3-metric"><strong>'+esc(text('totKcal'))+' kcal</strong>erfasst</div><div class="b3-metric"><strong>'+esc(text('remKcal'))+' kcal</strong>verfügbar</div></div><p class="b3-muted">Eiweiß '+esc(text('tP'))+' · Kohlenhydrate '+esc(text('tC'))+' · Fett '+esc(text('tF'))+'</p><p class="b3-muted">Wasser: '+esc(text('wVal'))+'</p>'+btn('Ernährung öffnen','NTUI.go',['nutrition'])+'</section>';
  root.innerHTML=h;
}
function run(id){
  if(id==='stillen'&&S.babyOn&&!NTBaby.runningFeed()&&!NTBaby.nextSide(NTBaby.today())){
    NTUIActions.show('Stillen starten',NTUIActions.button('Links starten','NTBaby.startFeed',['l'])+NTUIActions.button('Rechts starten','NTBaby.startFeed',['r']));return;
  }
  NTLaunch.run(id);
}
function configure(){
  var selected=actions();
  document.getElementById('b3HomePrefsBody').innerHTML='<p>Bis zu sechs Aktionen. Die persönlichen Baby-Schnellknöpfe bleiben separat erhalten.</p>'+NTLaunch.ACTIONS.filter(allowed).map(function(a){
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
