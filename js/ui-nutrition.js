// @ts-check
(function(){
'use strict';
function button(label,act,args,active){return '<button type="button"'+(active?' aria-current="page"':'')+' data-act="NTUI.dispatch" data-args="'+esc(JSON.stringify([act,args||[]]))+'">'+esc(label)+'</button>';}
function render(section){
  var root=document.getElementById('b3Content');
  var h='<nav class="b3-subnav" aria-label="Ernährungsbereiche">'+[['Heute','nutrition'],['Planung','nutrition-plan','plan'],['Kochbuch','nutrition-book','book'],['Verlauf','history']].map(function(x){
    var selected=section===x[1]||(section==='trends'&&x[1]==='history');
    return x[2]&&!NTUICatalog.available(x[2])?button(x[0],'NTFeat.sheet',[x[2]]):button(x[0],'NTUI.go',[x[1]],selected);
  }).join('')+'</nav>';
  if(section==='nutrition'){
    h+='<div class="b3-date"><button type="button" data-act="NTUI.changeDay" data-args="[-1]" aria-label="Vorheriger Tag">‹</button><p><time id="b3NutritionDate"></time></p><button type="button" id="b3NutritionNext" data-act="NTUI.changeDay" data-args="[1]" aria-label="Nächster Tag">›</button></div>';
    h+='<div class="b3-row b3-nutrition-share">'+button('Tag teilen','shareDay')+button('Zeitraum teilen','openShareRange')+'</div>';
  }else if(section==='history'||section==='trends'){
    h+='<div class="b3-row b3-history-tools">'+button(section==='history'?'Trends & Gewicht':'Tagebuch öffnen','NTUI.go',[section==='history'?'trends':'history'])+button('Zeitraum teilen','openShareRange')+'</div>';
  }
  root.innerHTML=h;refresh();
}
function refresh(){
  var el=document.getElementById('b3NutritionDate');if(!el)return;
  el.setAttribute('datetime',S.currentDate);
  el.textContent=new Date(S.currentDate+'T12:00:00').toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long'});
  document.getElementById('b3NutritionNext').disabled=S.currentDate>=NTBaby.today();
}
window.NTUINutrition={render:render,refresh:refresh};
})();
