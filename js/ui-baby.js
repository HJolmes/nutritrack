// @ts-check
// Baby presentation stays attached to the one existing diary and its APIs.
(function(){
'use strict';
function mount(){
  var tabs=document.getElementById('babyTabs');if(!tabs)return;
  var el=document.getElementById('b3BabyStatus');
  if(!el){el=document.createElement('div');el.id='b3BabyStatus';tabs.parentNode.insertBefore(el,tabs);}
  refresh();
}
function refresh(){var el=document.getElementById('b3BabyStatus');if(el&&NTUI.enabled())el.innerHTML=NTUIHome.breast(false);}
window.NTUIBaby={mount:mount,refresh:refresh};
})();
