// @ts-check
// Context + dispatches to the original editors; it never writes domain logs.
(function(){
'use strict';
function button(label,act,args){return '<button type="button" data-act="NTUIActions.choose" data-args="'+esc(JSON.stringify([act,args||[]]))+'">'+esc(label)+'</button>';}
function show(title,html,grid){document.getElementById('b3ActionTitle').textContent=title;var body=document.getElementById('b3ActionBody');body.classList.toggle('b3-action-grid',grid===true);body.innerHTML=html;openOv('b3ActionOv');}
function choose(act,args){closeOv('b3ActionOv');var fn=NTActions.resolve(act);if(fn)fn.apply(null,args||[]);}
function baby(){
  if(!S.babyOn){showToast('Baby-Tagebuch ist ausgeschaltet. Mehr → Funktionen');return;}
  show('Baby-Eintrag',Object.keys(NTBaby.TYPES).map(function(k){var t=NTBaby.TYPES[k];return button(t.ic+' '+t.label,'NTBaby.openEntry',[k]);}).join(''),true);
}
function household(){
  var h=[['shop','Artikel auf den Einkaufszettel','NTShop.openCatalog',[]],['pantry','Vorratsartikel anlegen','NTPantry.openItem',[null]]].map(function(row){
    return NTUICatalog.available(row[0])?button(row[1],row[2],row[3]):button(NTUICatalog.target(row[0]).label+' einschalten','NTFeat.sheet',[row[0]]);
  }).join('');
  show('Haushalt ergänzen',h);
}
function all(){
  var h=button('Lebensmittel erfassen','NTPicker.openPicker',[null,'chat']);
  if(S.babyOn)h+=button('Baby-Eintrag','NTUIActions.baby');
  h+=button('Haushalt ergänzen','NTUIActions.household');
  ['wasser','sport'].forEach(function(id){var f=NTFeat.byId(id==='wasser'?'water':'exercise');if(f&&!NTFeat.isOff(f)){var a=NTLaunch.ACTIONS.find(function(x){return x.id===id;});h+=button(a.label,'NTLaunch.run',[id]);}});
  show('Was erfassen?',h);
}
function plus(){
  var owner=NTUI.context();
  if(owner==='nutrition'){
    var detail=document.getElementById('mealDetailScreen').classList.contains('active');
    NTPicker.openPicker(detail?window._mealDetailOpen||null:null,'chat');return;
  }
  if(owner==='baby'){baby();return;}
  if(owner==='shop'){NTShop.openCatalog();return;}
  if(owner==='pantry'){NTPantry.openItem(null);return;}
  if(owner==='book'){NTPlan.newRecipe();return;}
  if(owner==='plan'){
    var days=NTPlan.visibleDates(),selected=days.includes(S.currentDate)?S.currentDate:days[0];
    var date='<label for="b3PlanDate">Wochentag</label><select id="b3PlanDate">'+days.map(function(day){
      var label=new Date(day+'T12:00:00').toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'short'});
      return '<option value="'+esc(day)+'"'+(day===selected?' selected':'')+'>'+esc(label)+'</option>';
    }).join('')+'</select>';
    show('Mahlzeit planen',date+['breakfast','lunch','dinner','snack'].map(function(slot,i){return button(['Frühstück','Mittagessen','Abendessen','Snack'][i]+' · Rezept oder Notiz','NTUIActions.planSlot',[slot]);}).join(''));return;
  }
  if(owner==='household'){household();return;}
  all();
}
function planSlot(slot){
  var date=document.getElementById('b3PlanDate').value;
  if(NTPlan.visibleDates().includes(date))NTPlan.pick(date,slot);
}
window.NTUIActions={show:show,plus:plus,baby:baby,household:household,all:all,choose:choose,button:button,planSlot:planSlot};
})();
