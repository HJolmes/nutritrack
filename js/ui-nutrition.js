// @ts-check
(function(){
'use strict';
function button(label,act,args){return '<button type="button" data-act="NTUI.dispatch" data-args="'+esc(JSON.stringify([act,args||[]]))+'">'+esc(label)+'</button>';}
function render(section){
  var root=document.getElementById('b3Content');
  var h='<nav class="b3-grid" aria-label="Ernährungsbereiche">'+[['Heute','nutrition'],['Planung','plan'],['Kochbuch','book'],['Verlauf','history']].map(function(x){return button(x[0],'NTUI.go',[x[1]]);}).join('')+'</nav>';
  h+='<div class="b3-date b3-row">'+button('‹','NTUI.changeDay',[-1])+'<p id="b3NutritionDate"></p>'+button('›','NTUI.changeDay',[1])+'</div>';
  h+='<div class="b3-row">'+button('Trends & Gewicht','NTUI.go',['trends'])+button('Tag teilen','shareDay')+button('Zeitraum teilen','openShareRange')+'</div>';
  if(section==='nutrition'){
    h+='<details class="b3-card"><summary>Wasser, Aktivität, Fasten und Ziele</summary><div class="b3-grid">';
    [['water','Wasserziel','NTFeat.openWaterGoal'],['exercise','Aktivität erfassen','openExerciseOv'],['fast','Fasten','openFastOv']].forEach(function(row){var f=NTFeat.byId(row[0]);h+=NTFeat.isOff(f)?button(f.label+' einschalten','NTFeat.sheet',[f.id]):button(row[1],row[2]);});
    h+=button('Apple / Samsung Health','openHealthSync')+button('Profil & Ziele','openSettings',['ziele'])+button('Wiederkehrend','NTRecur.openManage')+button('Vorlagen','NTUI.templates')+'</div></details>';
  }
  root.innerHTML=h;refresh();
}
function refresh(){var el=document.getElementById('b3NutritionDate');if(el)el.textContent=new Date(S.currentDate+'T12:00:00').toLocaleDateString('de-DE',{weekday:'short',day:'numeric',month:'long'});}
window.NTUINutrition={render:render,refresh:refresh};
})();
