// @ts-check
(function(){
'use strict';
function render(){
  var root=document.getElementById('b3Content');
  var rows=['shop','pantry','plan','book'].map(function(id){
    var f=NTFeat.byId(id),off=NTFeat.isOff(f),detail=f.sub;
    if(id==='shop')detail=NTShop.openCount()+' Artikel offen';
    if(id==='pantry'){
      var low=NTPantry.lowCount();
      detail=NTPantry.count()+' Artikel'+(low?' · '+low+' unter Mindestbestand':'');
    }
    return '<button type="button" class="b3-feature-row" data-act="'+(off?'NTFeat.sheet':'NTUI.go')+'" data-args="'+esc(JSON.stringify([id]))+'"><span class="b3-feature-icon" aria-hidden="true">'+esc(f.ic)+'</span><span><strong>'+esc(f.label)+'</strong><small>'+esc(off?'Funktion einschalten':detail)+'</small></span><span aria-hidden="true">›</span></button>';
  }).join('');
  var pantry=NTUICatalog.available('pantry'),expiring=pantry?NTPantry.expiring():[];
  var h='';
  if(expiring.length)h='<section class="b3-card b3-expiry"><h2>Haltbarkeit</h2><p>'+expiring.length+' '+(expiring.length===1?'Artikel läuft bald ab oder ist abgelaufen.':'Artikel laufen bald ab oder sind abgelaufen.')+'</p><button type="button" data-act="NTPantry.openExpiring">Artikel anzeigen</button></section>';
  h+='<div class="b3-feature-list">'+rows+'</div>';
  if(pantry)h+='<section class="b3-card"><h2>Was kochen?</h2><button type="button" data-act="NTPantry.openCook">Rezepte aus dem Vorrat finden</button></section>';
  root.innerHTML=h;
}
window.NTUIHousehold={render:render};
})();
