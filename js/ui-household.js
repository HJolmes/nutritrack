// @ts-check
(function(){
'use strict';
function render(){
  var root=document.getElementById('b3Content');
  root.innerHTML='<p class="b3-muted">Einkaufen, Vorrat und die nächste Mahlzeit planen.</p>'+['shop','pantry','plan','book'].map(function(id){
    var f=NTFeat.byId(id),detail=f.sub;
    if(id==='shop')detail=NTShop.openCount()+' Artikel offen';
    if(id==='pantry')detail=NTPantry.count()+' Artikel · '+NTPantry.lowCount()+' unter Mindestbestand';
    var off=NTFeat.isOff(f);
    return '<section class="b3-card b3-household-card"><h2>'+f.ic+' '+esc(f.label)+'</h2><p class="b3-muted">'+esc(detail)+'</p><button type="button" data-act="'+(off?'NTFeat.sheet':'NTUI.go')+'" data-args="'+esc(JSON.stringify([id]))+'">'+(off?'Bereich einschalten':esc(f.label)+' öffnen')+'</button></section>';
  }).join('');
}
window.NTUIHousehold={render:render};
})();
