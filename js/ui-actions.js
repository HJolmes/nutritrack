// @ts-check
// Context + dispatches to the original editors; it never writes domain logs.
(function(){
'use strict';
function button(label,act,args){return '<button type="button" data-act="NTUIActions.choose" data-args="'+esc(JSON.stringify([act,args||[]]))+'">'+esc(label)+'</button>';}
function show(title,html){document.getElementById('b3ActionTitle').textContent=title;document.getElementById('b3ActionBody').innerHTML=html;openOv('b3ActionOv');}
function choose(act,args){closeOv('b3ActionOv');var fn=NTActions.resolve(act);if(fn)fn.apply(null,args||[]);}
function baby(){
  if(!S.babyOn){showToast('Baby-Tagebuch ist ausgeschaltet. Mehr → Funktionen');return;}
  show('Baby-Eintrag',Object.keys(NTBaby.TYPES).map(function(k){var t=NTBaby.TYPES[k];return button(t.ic+' '+t.label,'NTBaby.openEntry',[k]);}).join(''));
}
function household(){show('Haushalt ergänzen',button('Artikel auf den Einkaufszettel','NTShop.openCatalog')+button('Vorratsartikel anlegen','NTPantry.openItem',[null]));}
function all(){
  var h=button('Lebensmittel erfassen','NTPicker.openPicker',[null,'chat']);
  if(S.babyOn)h+=button('Baby-Eintrag','NTUIActions.baby');
  h+=button('Haushalt ergänzen','NTUIActions.household');
  ['wasser','sport'].forEach(function(id){var f=NTFeat.byId(id==='wasser'?'water':'exercise');if(f&&!NTFeat.isOff(f)){var a=NTLaunch.ACTIONS.find(function(x){return x.id===id;});h+=button(a.label,'NTLaunch.run',[id]);}});
  show('Was erfassen?',h);
}
function plus(){
  var owner=NTUI.context();
  if(owner==='nutrition'){NTPicker.openPicker(window._mealDetailOpen||null,'chat');return;}
  if(owner==='baby'){baby();return;}
  if(owner==='shop'){NTShop.openCatalog();return;}
  if(owner==='pantry'){NTPantry.openItem(null);return;}
  if(owner==='book'){NTPlan.newRecipe();return;}
  if(owner==='plan'){
    show('Mahlzeit planen',['breakfast','lunch','dinner','snack'].map(function(slot,i){return button(['Frühstück','Mittagessen','Abendessen','Snack'][i]+' · Rezept oder Notiz','NTPlan.pick',[S.currentDate,slot]);}).join(''));return;
  }
  if(owner==='household'){household();return;}
  all();
}
window.NTUIActions={show:show,plus:plus,baby:baby,household:household,all:all,choose:choose,button:button};
})();
