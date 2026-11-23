// @ts-check
(function(){
'use strict';
function button(label,act,args,active){return '<button type="button"'+(active?' aria-current="page"':'')+' data-act="NTUI.dispatch" data-args="'+esc(JSON.stringify([act,args||[]]))+'">'+esc(label)+'</button>';}
function render(section){
  var root=document.getElementById('b3Content');
  var h='<nav class="b3-subnav" aria-label="Ernährungsbereiche">'+[['Heute','nutrition'],['Planung','plan'],['Kochbuch','book'],['Verlauf','history']].map(function(x){return button(x[0],'NTUI.go',[x[1]],section===x[1]||(section==='trends'&&x[1]==='history'));}).join('')+'</nav>';
  if(section==='nutrition'){
    h+='<div class="b3-date"><button type="button" data-act="NTUI.changeDay" data-args="[-1]" aria-label="Vorheriger Tag">‹</button><p><time id="b3NutritionDate"></time></p><button type="button" id="b3NutritionNext" data-act="NTUI.changeDay" data-args="[1]" aria-label="Nächster Tag">›</button></div>';
    h+='<details class="b3-card b3-nutrition-tools"><summary>Mehr zu Ernährung</summary><div class="b3-grid">';
    [['water','Wasserziel','NTFeat.openWaterGoal'],['exercise','Aktivität erfassen','openExerciseOv'],['fast','Fasten','openFastOv']].forEach(function(row){var f=NTFeat.byId(row[0]);h+=NTFeat.isOff(f)?button(f.label+' einschalten','NTFeat.sheet',[f.id]):button(row[1],row[2]);});
    h+=button('Apple / Samsung Health','openHealthSync')+button('Profil & Ziele','openSettings',['ziele'])+button('Wiederkehrend','NTRecur.openManage')+button('Vorlagen','NTUI.templates')+button('Trends & Gewicht','NTUI.go',['trends'])+button('Tag teilen','shareDay')+button('Zeitraum teilen','openShareRange')+'</div></details>';
  }else{
    h+='<div class="b3-row b3-history-tools">'+button(section==='history'?'Trends & Gewicht':'Tagebuch öffnen','NTUI.go',[section==='history'?'trends':'history'])+button('Tag teilen','shareDay')+button('Zeitraum teilen','openShareRange')+'</div>';
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
