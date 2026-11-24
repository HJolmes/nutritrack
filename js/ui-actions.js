// @ts-check
// Context + dispatches to the original editors; it never writes domain logs.
(function(){
'use strict';
function button(label,act,args,icon,detail){
  return '<button type="button" class="b3-capture-option'+(detail?' b3-capture-featured':'')+'" data-act="NTUIActions.choose" data-args="'+esc(JSON.stringify([act,args||[]]))+'">'
    +(icon?'<span class="b3-capture-icon" aria-hidden="true">'+esc(icon)+'</span>':'')
    +'<span class="b3-capture-label">'+esc(label)+(detail?'<small>'+esc(detail)+'</small>':'')+'</span></button>';
}
function show(title,html,grid){document.getElementById('b3ActionTitle').textContent=title;var body=document.getElementById('b3ActionBody');body.classList.toggle('b3-action-grid',grid===true);body.innerHTML=html;openOv('b3ActionOv');}
function choose(act,args){closeOv('b3ActionOv');var fn=NTActions.resolve(act);if(fn)fn.apply(null,args||[]);}
function baby(){
  if(!S.babyOn){showToast('Baby-Tagebuch ist ausgeschaltet. Mehr → Funktionen');return;}
  show('Baby-Eintrag',Object.keys(NTBaby.TYPES).map(function(k){var t=NTBaby.TYPES[k];return button(t.label,'NTBaby.openEntry',[k],t.ic);}).join(''),true);
}
function household(){
  var h=[['shop','Artikel auf den Einkaufszettel','NTShop.openCatalog',[]],['shop','Rezept-Foto auf den Zettel','NTShop.recipePhoto',[],'📷'],['pantry','Vorratsartikel anlegen','NTPantry.openItem',[null]]].map(function(row,i,all){
    var target=NTUICatalog.target(row[0]);
    if(NTUICatalog.available(row[0]))return button(row[1],row[2],row[3],row[4]||target.ic);
    // Ausgeschaltet: „… einschalten“ nur einmal je Bereich.
    return all.findIndex(function(x){return x[0]===row[0];})===i?button(target.label+' einschalten','NTFeat.sheet',[row[0]],target.ic):'';
  }).join('');
  show('Haushalt ergänzen',h,true);
}
function all(){
  var h=button('Lebensmittel erfassen','NTPicker.openPicker',[null,'chat'],'🍽️','Chat, Foto, Barcode und Suche');
  if(S.babyOn)h+=button('Baby-Eintrag','NTUIActions.baby',[],'👶');
  h+=button('Haushalt ergänzen','NTUIActions.household',[],'🏡');
  [['wasser','water'],['sport','exercise']].forEach(function(entry){
    var f=NTFeat.byId(entry[1]);
    if(f&&!NTFeat.isOff(f)){
      var action=NTLaunch.ACTIONS.find(function(a){return a.id===entry[0];});
      h+=button(action.label,'NTLaunch.run',[action.id],action.ic);
    }
  });
  show('Was erfassen?',h,true);
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
    var meals=[['breakfast','Frühstück','☕'],['lunch','Mittagessen','🍲'],['dinner','Abendessen','🍽️'],['snack','Snack','🍎']];
    show('Mahlzeit planen',date+meals.map(function(meal){return button(meal[1],'NTUIActions.planSlot',[meal[0]],meal[2]);}).join(''),true);return;
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
