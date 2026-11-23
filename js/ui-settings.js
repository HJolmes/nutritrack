// @ts-check
(function(){
'use strict';
function render(){
  document.getElementById('b3Content').innerHTML='<div class="b3-grid b3-settings-grid"><button type="button" data-act="NTUI.openPreferences">Navigation anpassen</button><button type="button" data-act="NTUIHome.configure">Schnellaktionen anpassen</button><button type="button" data-act="NTUIReminders.open">Hinweise anpassen</button><button type="button" data-act="NTUI.classic">Klassische Ansicht</button></div><section class="b3-card"><h2>Alle Funktionen</h2><label for="b3CatalogQuery">Funktion oder Einstellung suchen</label><input id="b3CatalogQuery" type="search" placeholder="Zum Beispiel Alexa, Backup, KI oder Baby"><div id="b3Catalog"></div></section>';
}
window.NTUISettings={render:render};
})();
