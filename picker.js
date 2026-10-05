// @ts-check
// ════════════════════════════════════════
// NutriTrack – Ingredient Picker
// Ausgelagert aus index.html (v0.119)
// ════════════════════════════════════════
//
// Seit v0.305 gekapselt (#257): Nach aussen geht nur window.NTPicker — die
// Funktionen, die index.html, andere Module oder ein on*-/data-act-String im
// generierten HTML rufen (Liste am Ende). Zustand und Hilfsfunktionen sind
// privat. Bewusst ohne 'use strict' und ohne neue Einrueckung: Verhalten und
// Zeilen wie vorher, `git blame` bleibt lesbar.
(function(){

// HTML-Escaping für Namen aus untrusted Quellen (OpenFoodFacts, KI-Antworten,
// Suchtreffer), die per innerHTML eingefügt werden — Schutz vor XSS. Nutzt den
// globalen esc() aus index.html, fällt aber auf eine eigene Variante zurück.
function _esc(s){
  if(typeof window!=='undefined'&&typeof window.esc==='function')return window.esc(s);
  return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});
}

// Wandelt rohe (oft englische) KI-/Proxy-Fehlermeldungen in eine kurze,
// handlungsorientierte deutsche Meldung um (#121). Unbekannte Fehler werden
// unverändert durchgereicht.
function pickerFriendlyAiError(err){
  var s=(err==null?'':String(err)).toLowerCase();
  if(s.indexOf('usage limit')>=0||s.indexOf('credit balance')>=0||s.indexOf('billing')>=0)
    return '🤖 KI-Kontingent ist gerade aufgebraucht. Trag die Zutat solange über „Suche" oder „Eigenes" ein – die KI ist später wieder verfügbar.';
  if(s.indexOf('overloaded')>=0||s.indexOf('rate limit')>=0||s.indexOf('rate_limit')>=0||s.indexOf('429')>=0||s.indexOf('529')>=0)
    return '🤖 KI gerade überlastet. Bitte gleich nochmal versuchen – oder die Zutat über „Suche"/„Eigenes" eintragen.';
  if(s.indexOf('proxy nicht konfiguriert')>=0||s.indexOf('not configured')>=0)
    return '🤖 KI ist in dieser Installation nicht eingerichtet. Trag die Zutat über „Suche" oder „Eigenes" ein.';
  if(s.indexOf('failed to fetch')>=0||s.indexOf('networkerror')>=0||s.indexOf('timeout')>=0)
    return '📡 Keine Verbindung zur KI. Prüf deine Internet-Verbindung und versuch es nochmal.';
  return 'Fehler: '+err;
}

// Picker state (global)
var pickerMeal=null;          // which meal to add to (null = ask)
var pickerSelFood=null;       // selected food in search tab
var pickerIngredients=[];     // photo/chat detected ingredients
var pickerBcFound=null;       // barcode found pending confirm
var pickerBcReader=null;      // ZXing reader instance
var pickerBcActive=false;
var pickerBcServerActive=false; // Server-Decode-Loop läuft parallel zum lokalen Decoder
var pickerTorchOn=false;

// ════════════════════════════════════════
// SECTION: INGREDIENT PICKER (universell)
// ════════════════════════════════════════
function openPicker(meal, defaultTab){
  // Der Normalfall ist „eintragen“. Nur der Weg „Neues Rezept → aus dem
  // Internet“ schaltet direkt nach diesem Aufruf auf „nur in die Bibliothek“.
  window._pickerRecipeOnly=false;
  // „Zutat hinzufuegen" setzt den Modus erst NACH openPicker (editAddIng) —
  // jeder andere Aufruf beginnt ohne ihn (#230).
  window._editEntryMode=false;
  window._pickerQueueItem=null;// setzt processOfflineQueue erst nach openPicker
  pickerMeal = meal || mealByTime();
  pickerSelFood = null;
  pickerIngredients = [];
  pickerBcFound = null;
  // Reset UI
  document.getElementById('pickerSearchQ').value='';
  document.getElementById('pickerSearchHint').textContent='Lokale Treffer sofort · Online bei Suche';
  document.getElementById('pickerResults').innerHTML='';
  document.getElementById('pickerAddSec').classList.add('hidden');
  document.getElementById('pickerPhotoPickArea').style.display='block';
  document.getElementById('pickerPrevWrap').classList.add('hidden');
  document.getElementById('pickerBcConfirm').classList.add('hidden');
  document.getElementById('pickerPhotoStatus').classList.add('hidden');
  document.getElementById('pickerAnalyzeBtn').disabled=true;
  document.getElementById('pickerAnalyzeBtn').textContent='📷 KI-Analyse starten';
  // pickerShowBcConfirm blendet den Knopf aus – jeder neue Anlauf zeigt ihn wieder (#209).
  document.getElementById('pickerAnalyzeBtn').style.display='';
  window._pickerPhotoSeq=(window._pickerPhotoSeq||0)+1;// verspätete Barcode-Treffer eines alten Fotos verwerfen
  document.getElementById('pickerPhotoResult').classList.add('hidden');
  document.getElementById('pickerChatMsgs').innerHTML='<div class="cm h">Beschreibe was du gegessen hast, z.B.:<br>„Körnerbrötchen mit Marmelade und Skyr"</div>';
  document.getElementById('pickerChatResult').classList.add('hidden');
  document.getElementById('pickerChatInp').value='';
  _pickerChatShrink();
  document.getElementById('pickerCam').value='';
  document.getElementById('pickerGal').value='';
  document.getElementById('pickerBarcodeResult').innerHTML='';
  document.getElementById('pickerRecipeName').value='';
  document.getElementById('pickerChatRecipeName').value='';
  document.getElementById('pickerLinkInput').value='';
  document.getElementById('pickerLinkUrlInfo').innerHTML='';
  document.getElementById('pickerLinkResult').classList.add('hidden');
  document.getElementById('pickerLinkImportBtn').disabled=true;
  document.getElementById('pickerLinkImportBtn').style.opacity='.4';
  document.getElementById('pickerLinkImportBtn').textContent='🔗 Rezept laden';
  _pickerLinkResetShopBtn();
  var _ownOnce=document.getElementById('ownOnce');if(_ownOnce)_ownOnce.checked=false;
  pickerStopScan();
  // Title
  document.getElementById('pickerTitle').textContent=(MEAL_NAMES[pickerMeal]||'Mahlzeit')+' – Zutat hinzufügen';
  document.getElementById('pickerSub').textContent='Lokal + Online kombiniert';
  _pickerRecipeOnlyUI();
  // Default tab
  pickerSetTab(defaultTab||'chat');
  // Load search results non-blocking
  requestAnimationFrame(function(){pickerLoadDefaultResults();});
  openOv('pickerOv');
  // Do NOT auto-focus - prevents keyboard popping up on mobile
}

function closePicker(){
  window._editEntryMode=false;// abgebrochenes „Zutat hinzufuegen" nicht nachwirken lassen (#230)
  pickerStopScan();
  if(typeof pickerVoiceStop==='function')pickerVoiceStop();
  closeOv('pickerOv');
}

function pickerSetTab(tab){
  // Always stop barcode scan when switching tabs
  pickerStopScan();
  if(typeof pickerVoiceStop==='function')pickerVoiceStop();
  document.querySelectorAll('.picker-tab').forEach(function(b){b.classList.remove('act');});
  document.querySelectorAll('.picker-panel').forEach(function(p){p.classList.remove('act');});
  var tabEl=document.getElementById('ptab-'+tab);
  var panelEl=document.getElementById('ppanel-'+tab);
  if(tabEl)tabEl.classList.add('act');
  if(panelEl)panelEl.classList.add('act');
  if(tab==='search'){pickerLoadDefaultResults();}
  if(tab==='barcode'){setTimeout(function(){pickerStartScan();},150);}
  if(tab==='recent'){renderRecentList();}
  if(tab==='link'){pickerLinkClipboard();}
  // No auto-focus on chat - user taps input to open keyboard
}

// Beim Öffnen des Link-Tabs die Zwischenablage anbieten. Das ersetzt den früheren
// 📥-Knopf in der Kopfzeile: Wer einen Link bekommen hat, kopiert ihn und findet
// ihn hier schon eingefügt — besonders auf iOS, wo der Weg aus Safari in die
// installierte PWA ohnehin über die Zwischenablage läuft.
function pickerLinkClipboard(){
  var inp=document.getElementById('pickerLinkInput');
  if(!inp||inp.value.trim())return;// nichts überschreiben
  if(!navigator.clipboard||!navigator.clipboard.readText)return;
  navigator.clipboard.readText().then(function(txt){
    var t=String(txt||'').trim();
    if(!t||t.length>4096)return;
    if(inp.value.trim())return;// inzwischen getippt
    var isShare=(typeof shareInputKind==='function')&&shareInputKind(t);
    var isUrl=/^https?:\/\//i.test(t)||/\bhttps?:\/\//i.test(t);
    if(!isShare&&!isUrl)return;
    inp.value=t;
    pickerLinkDetect();
    if(typeof showToast==='function')showToast('Aus Zwischenablage eingefügt ✓');
  }).catch(function(){/* verweigert oder nicht erlaubt */});
}

function pickerLoadDefaultResults(){
  var results=searchLocal('');
  pickerRenderResults(results,false);
}

// ─── PICKER: SEARCH TAB ───
// Live-Suche bei jedem Tastendruck: nur lokale Quellen (Rezepte, Custom Foods,
// Cache, DB) — synchron, kein Debounce nötig. Online weiterhin nur per Enter/Button.
function pickerSearchLocalLive(){
  var q=document.getElementById('pickerSearchQ').value.trim();
  pickerSelFood=null;
  document.getElementById('pickerAddSec').classList.add('hidden');
  pickerRenderResults(searchLocal(q),false);
  document.getElementById('pickerSearchHint').textContent=q?'Lokale Treffer · Enter für Online-Suche':'Lokale Treffer sofort · Online bei Suche';
}
function pickerSearch(){
  var q=document.getElementById('pickerSearchQ').value.trim();
  pickerSelFood=null;
  document.getElementById('pickerAddSec').classList.add('hidden');
  var local=searchLocal(q);
  pickerRenderResults(local,!!q&&isOnline);
  if(q&&isOnline)pickerFetchOnline(q);
}

// Laufende Nummer der Online-Suche: Nur die jüngste Antwort darf die Liste
// ersetzen, und nur, solange das Suchfeld noch dieselbe Anfrage zeigt — sonst
// überschriebe eine späte „apfel"-Antwort die Treffer für „banane" (#246).
var _pickerOnlineSeq=0;
function pickerFetchOnline(q){
  var mine=++_pickerOnlineSeq;
  var btn=document.getElementById('pickerSearchBtn');
  btn.innerHTML='<span class="spin"></span>';btn.disabled=true;
  var ql=q.toLowerCase(),eng=DE_EN[ql]||null;
  var base='https://world.openfoodfacts.org/cgi/search.pl?search_simple=1&action=process&json=1&page_size=20&fields=product_name,product_name_de,nutriments,image_front_thumb_url';
  var terms=[q];if(eng)terms.push(eng);
  var fetches=terms.map(function(t){return fetchT(offProxyUrl(base+'&search_terms='+encodeURIComponent(t)),{},6000).then(function(r){return r.json();}).catch(function(){return{products:[]};});});
  function stale(){
    if(mine!==_pickerOnlineSeq)return true;// eine neuere Anfrage setzt Knopf und Liste selbst
    btn.innerHTML='Suchen';btn.disabled=false;
    return document.getElementById('pickerSearchQ').value.trim()!==q;// weitergetippt: Live-Treffer bleiben
  }
  Promise.all(fetches).then(function(res){
    if(stale())return;
    var local=searchLocal(q);
    var seen={};local.forEach(function(p){seen[p.name.toLowerCase()]=true;});
    var online=[];
    res.forEach(function(data){
      (data.products||[]).forEach(function(p){
        var nm=p.nutriments||{},name=(p.product_name_de||p.product_name||'').trim();
        if(!name||name.length<3)return;
        var kcal=nm['energy-kcal_100g']||Math.round((nm['energy_100g']||0)/4.184)||Math.round((nm['proteins_100g']||0)*4+(nm['carbohydrates_100g']||0)*4+(nm['fat_100g']||0)*9);if(kcal<=0||kcal>950)return;
        var k=name.toLowerCase();if(seen[k])return;seen[k]=true;
        var pr=nm['proteins_100g']||0,ca=nm['carbohydrates_100g']||0,fa=nm['fat_100g']||0,su=nm['sugars_100g']||0,fi=nm['fiber_100g']||0,sa=nm['salt_100g']||0;
        var ns=(k.startsWith(ql)||k.startsWith(eng||'__'))?2:0;
        online.push({name:name,emoji:emo(name),per100:{kcal:kcal,protein:pr,carbs:ca,fat:fa,sugar:su,fiber:fi,salt:sa},score:ns+(pr>0?1:0)+(ca>0?1:0)+(fa>0?1:0),badge:'🌐',bdgCls:''});
      });
    });
    online.sort(function(a,b){return b.score-a.score;});
    var all=local.concat(online.slice(0,8));
    document.getElementById('pickerSearchHint').textContent='Lokal + Online';
    pickerRenderResults(all,false);
  }).catch(function(){if(mine===_pickerOnlineSeq){btn.innerHTML='Suchen';btn.disabled=false;}});
}

function pickerRenderResults(products,loading){
  if(loading)document.getElementById('pickerSearchHint').textContent='Lädt Online-Ergebnisse...';
  if(!products.length){document.getElementById('pickerResults').innerHTML='<div class="nr">Kein Ergebnis.</div>';return;}
  document.getElementById('pickerResults').innerHTML=products.map(function(p,i){
    var bdg=p.badge?'<span class="ri-bdg'+(p.bdgCls?' '+p.bdgCls:'')+'">'+(p.badge)+'</span>':'';
    var isR=p.isRecipe;
    return'<div class="ri'+(isR?' is-recipe':'')+'" onclick="NTPicker.pickerSelResult('+i+')" id="pri'+i+'">'+bdg
      +'<div class="ri-e">'+esc(p.emoji||'🍽')+'</div>'
      +'<div style="flex:1;min-width:0;"><div class="ri-n">'+_esc(p.name)+'</div>'
      +(p.per100?'<div class="ri-d">P '+(p.per100.protein||0).toFixed(1)+'g · K '+(p.per100.carbs||0).toFixed(1)+'g · F '+(p.per100.fat||0).toFixed(1)+'g · /100g</div>':'<div class="ri-d">Rezept</div>')
      +'</div>'
      +(p.per100?'<div class="ri-k">'+Math.round(p.per100.kcal||0)+' kcal</div>':'')
      +'</div>';
  }).join('');
  window._pickerProducts=products;
}

function pickerSelResult(i){
  var p=(window._pickerProducts||[])[i];if(!p)return;
  document.querySelectorAll('.ri').forEach(function(r){r.classList.remove('sel');});
  var el=document.getElementById('pri'+i);if(el)el.classList.add('sel');
  pickerSelFood=p;
  var isRec=p.isRecipe;
  document.getElementById('pickerAmt').value=isRec?'1':String(p.portionG||100);
  document.getElementById('pickerAmtUnit').textContent=isRec?'Portion(en)':'Gramm';
  document.getElementById('pickerAddSec').classList.remove('hidden');
}

// ─── ZUTAT-MODUS („+ Zutat hinzufügen" im Bearbeiten-Dialog) ───
// Ein Rezept wird dort EINE Zutat in Gramm: Menge = Gramm der Rezeptzutaten ×
// Portionen, per100 = Nährwerte der Zutaten auf 100 g. Rezepte sind je Portion
// gespeichert, ingTotal() liefert also eine Portion. Zutaten ohne Grammangabe
// (amount 0) zählen weder kcal noch Gramm, der Quotient bleibt stimmig.
// null, wenn keine Zutat Gramm hat — sonst entstünde eine 0-kcal-Zeile (#246).
function _pickerIngsAsOne(name,emoji,ings,factor){
  var g=(ings||[]).reduce(function(s,i){return s+(parseFloat(i.amount)||0);},0);
  if(!(g>0)||!(factor>0))return null;
  return {name:name,emoji:emoji,amount:Math.max(1,Math.round(g*factor)),per100:scaleNutrients(ingTotal(ings),100/g)};
}
var _PICKER_NO_GRAMS='Rezept ohne Grammangaben – als Zutat nicht möglich';
// Ampeln fuer einen gerade gebuchten Eintrag (#205): Rezepte ueber ihre Zutaten,
// ein Einzel-Lebensmittel ueber eine Kopie seines Namens – nie das Eintrags-
// objekt selbst, sonst schriebe die Ampel ihr Ergebnis und ihre Karte ins selbe
// Feld. `ings` (optional) bewertet nur diese Zutaten (Zutat-Modus).
function _pickerRateEntry(meal,idx,ings){
  var e=(getDay().meals[meal]||[])[idx];if(!e)return;
  // Kopie mit Naehrwerten und Menge: Keto/Low Carb/High Protein rechnen damit (#262).
  var list=ings||((e.ingredients&&e.ingredients.length)?e.ingredients:[{name:e.name,per100:e.per100,amount:e.amount}]);
  checkPregWarn(list,meal,idx);checkNursWarn(list,meal,idx);checkDietWarn(list,meal,idx);
}
// Hängt Zutaten an den offenen Eintrag und rechnet seine Summen neu (sonst
// stünden nach „Schließen ohne Speichern" die alten kcal im Tag). Gibt immer
// true zurück: Der Zutat-Modus hat den Klick verbraucht — auch wenn der
// Eintrag inzwischen fehlt; dann ein Toast statt einer stillen Neubuchung.
// Wer vorher etwas ablehnt (Rezept ohne Gramm), ruft das hier gar nicht erst
// auf, damit der Modus aktiv bleibt.
function _pickerAppendToEditEntry(items,beforeClose){
  window._editEntryMode=false;
  var meal=window._editEntryMeal,idx=window._editEntryIdx;
  var list=getDay().meals[meal];
  var e=list&&list[idx];
  if(!e||(!e.ingredients&&!e.isRecipe)){closePicker();showToast('Eintrag nicht mehr vorhanden');return true;}
  if(!e.ingredients)e.ingredients=[];
  items.forEach(function(it){e.ingredients.push(it);});
  Object.assign(e,scaleNutrients(ingTotal(e.ingredients),e.portions||1));
  saveS();renderAll();
  // Nur die neuen Zutaten bewerten; die Ampel ergaenzt die Karte am Eintrag (#205).
  _pickerRateEntry(meal,idx,items);
  if(beforeClose)beforeClose();
  closePicker();
  openEditEntry(meal,idx);
  showToast(items.length===1?((items[0].emoji||'🍽')+' '+items[0].name+' hinzugefügt'):(items.length+' Zutat(en) hinzugefügt'));
  return true;
}

function pickerConfirmAdd(){
  if(!pickerSelFood)return;
  var amt=parseFloat(document.getElementById('pickerAmt').value)||1;
  var f=pickerSelFood;
  // Zutat-Modus: an den offenen Eintrag anhängen statt neu zu buchen.
  if(window._editEntryMode){
    var item;
    if(f.isRecipe){
      var erec=recipes.find(function(r){return r.id===f.recipeId;});
      if(!erec){showToast('Rezept nicht gefunden');return;}
      item=_pickerIngsAsOne(erec.name,erec.emoji||'📋',erec.ingredients,amt);
      if(!item){showToast(_PICKER_NO_GRAMS);return;}
    } else {
      item={name:f.name,emoji:f.emoji,amount:amt,per100:f.per100||{kcal:0,protein:0,carbs:0,fat:0}};
    }
    _pickerAppendToEditEntry([item]);
    return;
  }
  // Normal: add to meal
  if(f.isRecipe){
    var rec=recipes.find(function(r){return r.id===f.recipeId;});
    if(!rec){showToast('Rezept nicht gefunden');return;}
    var t=ingTotal(rec.ingredients);
    /** @type {Record<string, any>} */
    var entry=Object.assign({name:rec.name,emoji:rec.emoji||'📋',isRecipe:true,recipeId:rec.id,portions:amt,ingredients:JSON.parse(JSON.stringify(rec.ingredients))},scaleNutrients(t,amt));
    getDay().meals[pickerMeal].push(entry);
  } else {
    var r=amt/100;
    /** @type {Record<string, any>} */
    var entry=Object.assign({name:f.name,emoji:f.emoji,amount:amt,per100:f.per100},scaleNutrients(f.per100,r));
    getDay().meals[pickerMeal].push(entry);
    cacheFood(f);
  }
  var _idx=getDay().meals[pickerMeal].length-1;
  saveS();renderAll();closePicker();
  animateAdd(pickerMeal);
  rememberPortion(f.name,amt);
  checkDataQuality(f);
  // Rezept aus der Bibliothek: die Zutaten des Eintrags bewerten, nicht den
  // Rezeptnamen (#205) – sonst stand die Warnung unter „Spaghetti Tonnato“ statt
  // unter „Thunfisch“ und fehlte im Mahlzeit-Detail. Der Eintrag hat seine
  // eigene Kopie der Zutaten, das Bibliotheksrezept bleibt ohne Ampelfelder.
  // Sonst eine Kopie mit Naehrwerten und gebuchter Menge (#262), nicht f selbst.
  var _ampIn=(f.isRecipe&&entry.ingredients&&entry.ingredients.length)?entry.ingredients:[{name:f.name,per100:f.per100,amount:f.isRecipe?undefined:amt}];
  checkPregWarn(_ampIn,pickerMeal,_idx);
  checkNursWarn(_ampIn,pickerMeal,_idx);
  checkDietWarn(_ampIn,pickerMeal,_idx);
  showToast((f.emoji||'🍽')+' '+f.name+' hinzugefügt');
}

// ─── PICKER: FOTO TAB ───
function pickerHandlePhoto(e){
  var file=e.target.files[0];if(!file)return;
  // Marke dieses Fotos: ein Barcode-Treffer, der erst nach „Ändern" oder einem
  // neuen Foto eintrifft, darf keine Rückfrage mehr öffnen (#209).
  var seq=window._pickerPhotoSeq=(window._pickerPhotoSeq||0)+1;
  // Input sofort zurücksetzen damit iOS erneutes Auswählen erlaubt
  e.target.value='';
  var reader=new FileReader();
  reader.onload=function(ev){
    var img=new Image();
    img.onload=function(){
      // MAX 1280px: genug Detail für KI-Erkennung (Teller-Komponenten, Screenshot-Zahlen) bei moderater Größe
      var c=document.createElement('canvas'),MAX=1280,w=img.width,h=img.height;
      if(w>h){if(w>MAX){h=Math.round(h*MAX/w);w=MAX;}}else{if(h>MAX){w=Math.round(w*MAX/h);h=MAX;}}
      c.width=w;c.height=h;
      var ctx=c.getContext('2d');
      ctx.drawImage(img,0,0,w,h);
      // Kein Pixel-Loop – JPEG-Komprimierung übernimmt Qualitätsanpassung
      var comp=c.toDataURL('image/jpeg',0.85);
      window._pickerPhotoB64=comp.split(',')[1];
      document.getElementById('pickerPrev').src=comp;
      document.getElementById('pickerPrevWrap').classList.remove('hidden');
      document.getElementById('pickerPhotoPickArea').style.display='none';
      document.getElementById('pickerAnalyzeBtn').disabled=false;
      document.getElementById('pickerAnalyzeBtn').style.display='';
      document.getElementById('pickerBcConfirm').classList.add('hidden');
      _pickerRefreshPhotoSaveHint();
      // Barcode-Scan verzögert damit UI sofort reagiert
      setTimeout(function(){pickerTryBarcode(c,seq);},100);
    };
    img.onerror=function(){showToast('Foto konnte nicht geladen werden');};
    img.src=/** @type {string} */ (ev.target.result);
  };
  reader.onerror=function(){showToast('Fehler beim Lesen der Datei');};
  reader.readAsDataURL(file);
}

function pickerResetPhoto(){
  window._pickerPhotoB64=null;
  window._pickerPhotoSeq=(window._pickerPhotoSeq||0)+1;
  pickerBcFound=null;
  document.getElementById('pickerPrevWrap').classList.add('hidden');
  document.getElementById('pickerPhotoPickArea').style.display='block';
  document.getElementById('pickerAnalyzeBtn').disabled=true;
  document.getElementById('pickerAnalyzeBtn').style.display='';
  document.getElementById('pickerBcConfirm').classList.add('hidden');
  document.getElementById('pickerPhotoResult').classList.add('hidden');
  document.getElementById('pickerPhotoStatus').classList.add('hidden');
  document.getElementById('pickerCam').value='';
  document.getElementById('pickerGal').value='';
  document.getElementById('pickerRecipeName').value='';
  document.getElementById('pickerChatRecipeName').value='';
  pickerIngredients=[];
  _pickerRefreshPhotoSaveHint(false);
}

// #118: Foto sichern, wenn vom User in den Einstellungen aktiviert (S.savePickerPhotos).
// Web-Capture legt das Foto weder auf iOS noch zuverlässig auf Android in die Galerie —
// daher aktiv via navigator.share (mit File) anbieten, Fallback: <a download> (Downloads/).
function _pickerSavePhotoIfWanted(){
  try{
    if(!window._pickerPhotoB64)return;
    if(typeof S==='undefined'||!S.savePickerPhotos)return;
    var bin=atob(window._pickerPhotoB64);
    var bytes=new Uint8Array(bin.length);
    for(var i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
    var blob=new Blob([bytes],{type:'image/jpeg'});
    var ts=new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
    var fname='nutritrack-'+ts+'.jpg';
    if(navigator.canShare&&typeof File!=='undefined'){
      try{
        var file=new File([blob],fname,{type:'image/jpeg'});
        if(navigator.canShare({files:[file]})&&navigator.share){
          navigator.share({files:[file],title:'NutriTrack Foto'}).catch(function(){});
          return;
        }
      }catch(e){/* fall through to download */}
    }
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');
    a.href=url;a.download=fname;a.rel='noopener';a.style.display='none';
    document.body.appendChild(a);a.click();
    setTimeout(function(){if(a.parentNode)a.parentNode.removeChild(a);URL.revokeObjectURL(url);},100);
  }catch(e){/* never block the meal-add flow */}
}

// Hinweis unter dem Foto-Preview synchronisieren (an/aus aus S.savePickerPhotos).
// show=false versteckt den Hint (z. B. beim Reset, wenn kein Foto da ist).
function _pickerRefreshPhotoSaveHint(show){
  var el=document.getElementById('pickerPhotoSaveHint');if(!el)return;
  if(show===false){el.classList.add('hidden');return;}
  var on=!!(typeof S!=='undefined'&&S.savePickerPhotos);
  el.textContent=on?'💾 Foto wird beim Hinzufügen gespeichert · in Einstellungen änderbar':'💡 Foto-Speicherung in Einstellungen aktivierbar';
  el.style.color=on?'var(--g1)':'var(--mu)';
  el.classList.remove('hidden');
}

// Die Formate, die ZXing (WASM wie JS) lesen soll. ZBar kennt keine solche
// Einschränkung und liest auch QR-Codes – die filtert _pickerZbarText.
var _PICKER_ZXW_FORMATS=['EAN-13','EAN-8','UPC-A','UPC-E','Code128','Code39'];
function _pickerZxingJsHints(){
  var hints=new Map();
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS,[ZXing.BarcodeFormat.EAN_13,ZXing.BarcodeFormat.EAN_8,ZXing.BarcodeFormat.UPC_A,ZXing.BarcodeFormat.UPC_E,ZXing.BarcodeFormat.CODE_128,ZXing.BarcodeFormat.CODE_39]);
  hints.set(ZXing.DecodeHintType.TRY_HARDER,true);
  return hints;
}

// Erster verwertbarer Text aus den ZBar-Symbolen. QR-Symbole werden
// übersprungen: Ein QR-Code auf der Verpackung (meist eine URL) ist kein
// Produktcode, und OpenFoodFacts bekäme sonst einen kaputten Pfad (#209).
// Fehlt typeName, wird das Symbol wie bisher genommen.
function _pickerZbarText(symbols){
  if(!symbols||!symbols.length)return null;
  for(var i=0;i<symbols.length;i++){
    var sym=symbols[i];if(!sym)continue;
    if(sym.typeName&&String(sym.typeName).toUpperCase().indexOf('QR')>=0)continue;
    var t=sym.decode?sym.decode():(sym.data||'');
    if(t)return String(t);
  }
  return null;
}

// Lokale Decoder-Kette für ein Standbild (Foto-Tab und 📸 Foto-Scan im
// Barcode-Tab): 1. ZXing-WASM, 2. ZBar-WASM (andere Algorithmen), 3. ZXing-JS.
// Liefert ein Promise auf den ersten Treffer oder null – nie eine Ablehnung.
// Filter (Graustufen/Kontrast) legt der Aufrufer vorher auf den Canvas.
function _pickerDecodeCanvasLocal(canvas){
  var p=Promise.resolve(null);
  if(window.ZXingWasm&&window.ZXingWasm.readBarcodes){
    try{
      p=window.ZXingWasm.readBarcodes(canvas,{
        formats:_PICKER_ZXW_FORMATS,
        tryHarder:true,tryRotate:true,tryInvert:true,maxNumberOfSymbols:1
      }).then(function(rs){return rs&&rs.length&&rs[0].text?String(rs[0].text):null;}).catch(function(){return null;});
    }catch(e){p=Promise.resolve(null);}
  }
  return p.then(function(code){
    if(code)return code;
    if(!window.ZBarWasm||!window.ZBarWasm.scanImageData)return null;
    try{
      var imgData=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);
      return window.ZBarWasm.scanImageData(imgData).then(_pickerZbarText).catch(function(){return null;});
    }catch(e){return null;}
  }).then(function(code){
    if(code)return code;
    if(typeof ZXing==='undefined')return null;
    try{
      var r=new ZXing.BrowserMultiFormatReader(_pickerZxingJsHints()).decodeFromCanvas(canvas);
      if(r&&r.getText())return String(r.getText());
    }catch(e){}
    return null;
  });
}

// Foto-Tab: sucht im geladenen Foto einen Barcode – nur lokal, ohne KI und
// ohne Server (#209): Das Foto verlässt das Gerät erst, wenn die Nutzerin
// „KI-Analyse starten" antippt. Nur GTIN-artige Treffer (8–14 Ziffern) gehen
// an OpenFoodFacts; seq ist die Marke des Fotos aus pickerHandlePhoto.
function pickerTryBarcode(canvas,seq){
  _pickerDecodeCanvasLocal(canvas).then(function(code){
    if(!code)return;
    code=String(code).replace(/\s/g,'');
    if(!/^\d{8,14}$/.test(code))return;
    if(seq!==undefined&&seq!==window._pickerPhotoSeq)return;
    pickerFetchBarcodeForConfirm(code,seq);
  });
}

function pickerToggleTorch(){
  pickerTorchOn=!pickerTorchOn;
  var btn=document.getElementById('torchBtn');
  if(btn)btn.textContent=pickerTorchOn?'💡 Taschenlampe aus':'🔦 Taschenlampe ein/aus';
  var videoEl=document.getElementById('pickerBarcodeVideo');
  if(videoEl&&videoEl.srcObject){
    var track=videoEl.srcObject.getVideoTracks()[0];
    if(track&&track.getCapabilities&&track.getCapabilities().torch){
      track.applyConstraints({advanced:[{torch:pickerTorchOn}]}).catch(function(){
        showToast('Taschenlampe nicht verfügbar');
        pickerTorchOn=!pickerTorchOn;
        if(btn)btn.textContent='🔦 Taschenlampe ein/aus';
      });
    } else {
      showToast('Taschenlampe nicht verfügbar');
      pickerTorchOn=!pickerTorchOn;
      if(btn)btn.textContent='🔦 Taschenlampe ein/aus';
    }
  }
}


// Unified scan loop for BarcodeDetector and ZXing.
// Uses requestVideoFrameCallback on iOS 15.4+ – the only reliable way to get
// pixel-accessible frames from a camera stream on iOS Safari (GPU compositing
// makes ctx.drawImage(video) return black pixels outside of rVFC callbacks).
// Canvas must be in the DOM (position:fixed offscreen) for iOS pixel readback.
//
// Crop to the visible scan region (matches the green viewfinder ~85% × 45%)
// and downscale to ~800px width. ZXing in JS is too slow on a full 1920×1080
// frame and gets confused by background clutter – cropping massively improves
// hit rate and CPU use.
function _pickerFrameLoop(videoEl,canvas,ctx,detect,label){
  var frameCount=0;
  var dbgCv=document.createElement('canvas');
  dbgCv.width=120;dbgCv.height=80;
  dbgCv.style.cssText='width:120px;height:80px;border:1px solid var(--br);border-radius:6px;display:block;margin:6px auto 0;';
  var dbgCtx=dbgCv.getContext('2d');
  var dbgEl=document.getElementById('pickerBarcodeResult');
  if(dbgEl){
    dbgEl.innerHTML='<div id="bcDbgWrap" style="font-size:11px;color:var(--mu);text-align:center;padding:4px 0;">'+
      '<span id="bcDbgLabel">'+label+'</span> · Frame <span id="bcDbgN">0</span> · <span id="bcDbgSz">–</span> · '+
      '<span id="bcDbgServer">Server: aus</span></div>';
    document.getElementById('bcDbgWrap').appendChild(dbgCv);
  }
  var TARGET_W=800;
  // 80%×42%: kompromiss zwischen genug Pixeln und engem Fokus auf Barcode.
  var CROP_W_RATIO=0.80;
  var CROP_H_RATIO=0.42;
  function process(){
    if(!pickerBcActive)return;
    if(!videoEl.videoWidth){schedule();return;}
    var vw=videoEl.videoWidth,vh=videoEl.videoHeight;
    var cropW=Math.round(vw*CROP_W_RATIO);
    var cropH=Math.round(vh*CROP_H_RATIO);
    var cropX=Math.round((vw-cropW)/2);
    var cropY=Math.round((vh-cropH)/2);
    var scale=Math.min(1,TARGET_W/cropW);
    var outW=Math.max(1,Math.round(cropW*scale));
    var outH=Math.max(1,Math.round(cropH*scale));
    if(canvas.width!==outW)canvas.width=outW;
    if(canvas.height!==outH)canvas.height=outH;
    // Schwarz-Weiß + erhöhter Kontrast hilft bei reflektiven Verpackungen
    // (Joghurtbecher, Folien) und niedrigem Strichkontrast. iOS Safari 14.5+
    // unterstützt ctx.filter; Browsern ohne Support ignorieren still die filter.
    try{ctx.filter='grayscale(100%) contrast(180%) brightness(105%)';}catch(e){}
    ctx.drawImage(videoEl,cropX,cropY,cropW,cropH,0,0,outW,outH);
    try{ctx.filter='none';}catch(e){}
    frameCount++;
    // @ts-expect-error textContent wandelt die Zahl selbst in Text
    var fn=document.getElementById('bcDbgN');if(fn)fn.textContent=frameCount;
    // Zeigt: Stream-Auflösung → Decoder-Auflösung. Wichtig für Diagnose ob
    // iOS uns hochauflösenden Stream gibt.
    var sz=document.getElementById('bcDbgSz');if(sz)sz.textContent=vw+'×'+vh+' → '+outW+'×'+outH;
    dbgCtx.drawImage(canvas,0,0,120,80);
    detect(canvas,schedule);
  }
  function schedule(){
    if(!pickerBcActive)return;
    if(typeof videoEl.requestVideoFrameCallback==='function'){
      videoEl.requestVideoFrameCallback(process);
    }else{
      setTimeout(process,200);
    }
  }
  schedule();
}

// Server-Decode-Loop: streamt parallel zum lokalen Decoder ~1.4 fps gecropte
// JPEG-Frames an den Cloudflare-Worker (POST /decode-barcode), der sie an den
// OSS-Decoder (OpenCV + pyzbar auf Cloud Run) weiterreicht – keine KI. Lokaler
// Decoder läuft weiter – wer zuerst trifft, gewinnt.
function _pickerServerDecodeUrl(){
  if(typeof PROJECT_AI_PROXY_URL!=='string'||!PROJECT_AI_PROXY_URL)return null;
  return PROJECT_AI_PROXY_URL.replace(/\/v1\/messages\/?$/,'/decode-barcode');
}
// Grenze des Workers für /decode-barcode (MAX_BARCODE_BODY_BYTES = 1024 * 200).
// Größer wird mit 413 abgelehnt – dann lieber gar nicht erst senden.
var _PICKER_SERVER_MAX_BYTES=200*1024;
// JPEG für den Foto-Serverschritt: erst 0.85; ist es zu groß, EINMAL neu
// kodieren (lange Kante ≤ 1280 px, Qualität 0.6). Passt auch das nicht, kommt
// null zurück (#209).
function _pickerServerJpeg(canvas,cb){
  canvas.toBlob(function(blob){
    if(blob&&blob.size<=_PICKER_SERVER_MAX_BYTES){cb(blob);return;}
    var src=canvas;
    var scale=Math.min(1,1280/Math.max(canvas.width,canvas.height));
    if(scale<1){
      src=document.createElement('canvas');
      src.width=Math.max(1,Math.round(canvas.width*scale));
      src.height=Math.max(1,Math.round(canvas.height*scale));
      src.getContext('2d').drawImage(canvas,0,0,src.width,src.height);
    }
    src.toBlob(function(b2){
      cb(b2&&b2.size<=_PICKER_SERVER_MAX_BYTES?b2:null);
    },'image/jpeg',0.6);
  },'image/jpeg',0.85);
}
function _pickerStartServerDecodeLoop(canvas){
  if(typeof canUseAi!=='function'||!canUseAi())return false;
  var url=_pickerServerDecodeUrl();if(!url)return false;
  pickerBcServerActive=true;
  // Sitzungsmarke: Nach Stopp und Neustart des Scanners stehen die globalen
  // Flags wieder auf true – eine noch laufende Anfrage (und der Takt) der alten
  // Sitzung darf dann weder einen Lookup auslösen noch weiterlaufen.
  var sess=window._pickerBcSess=(window._pickerBcSess||0)+1;
  function alive(){return pickerBcActive&&pickerBcServerActive&&sess===window._pickerBcSess;}
  var inFlight=0;var nextAt=Date.now()+500;var reqCount=0;
  // Der OSS-Decoder liefert nur Codes mit gültiger Prüfziffer – der erste
  // Treffer wird übernommen wie bei den lokalen Decodern (#209). Nur ein alter
  // Worker mit Vision-Fallback (source 'anthropic') braucht noch zwei gleiche
  // Codes, als Schutz gegen erfundene Ziffern mit zufällig gültiger Prüfziffer.
  var lastCode=null;
  function setStatus(s){var el=document.getElementById('bcDbgServer');if(el)el.textContent='Server: '+s;}
  setStatus('warte');
  function tick(){
    if(!alive())return;
    var now=Date.now();
    if(inFlight>=1||now<nextAt||!canvas.width||canvas.width<16){setTimeout(tick,120);return;}
    nextAt=now+700;inFlight++;reqCount++;
    setStatus('scan… ('+reqCount+')');
    canvas.toBlob(function(blob){
      if(!alive()||!blob){inFlight--;setTimeout(tick,120);return;}
      fetch(url,{
        method:'POST',
        headers:{'Content-Type':'image/jpeg','x-app-proxy-secret':getProxySecret()},
        body:blob
      }).then(function(r){
        if(!alive())return null;
        if(!r.ok){setStatus('Fehler '+r.status+' ('+reqCount+')');return null;}
        return r.json();
      }).then(function(d){
        if(!alive()||!d)return;
        var data=d.data||{};
        var raw=data.raw?String(data.raw):'';
        var code=data.code?String(data.code):'';
        var candidate=data.candidate?String(data.candidate):'';
        var checksumOk=Boolean(data.checksumValid);
        if(code){
          if(String(data.source||'')!=='anthropic'){
            setStatus('✓ '+code);
            pickerStopScan();pickerLookupBarcode(code);
          }else if(lastCode===code){
            setStatus('✓✓ '+code);
            pickerStopScan();pickerLookupBarcode(code);
          }else{
            lastCode=code;
            setStatus('1/2 ✓ '+code+' ('+reqCount+')');
          }
        }else if(candidate&&!checksumOk){
          lastCode=null;
          setStatus('✗ '+candidate+' ('+reqCount+')');
        }else{
          lastCode=null;
          setStatus((raw?raw.slice(0,24):'(leer)')+' ('+reqCount+')');
        }
      }).catch(function(e){setStatus('offline ('+reqCount+')');}).then(function(){
        inFlight--;setTimeout(tick,120);
      });
    },'image/jpeg',0.6);
  }
  setTimeout(tick,500);
  return true;
}

function pickerStartScan(){
  var wrap=document.getElementById('pickerBarcodeWrap');
  wrap.classList.remove('hidden');
  document.getElementById('pickerBcStartBtn').style.display='none';
  document.getElementById('pickerBcStopBtn').style.display='block';
  document.getElementById('pickerBarcodeResult').innerHTML='<div style="font-size:13px;color:var(--g1);padding:10px;text-align:center;"><span class="spin" style="display:inline-block;width:14px;height:14px;border:2px solid var(--g2);border-top-color:transparent;border-radius:50%;vertical-align:middle;margin-right:6px;"></span>Kamera startet…</div>';
  pickerBcActive=true;
  var videoEl=/** @type {HTMLVideoElement} */ (document.getElementById('pickerBarcodeVideo'));
  videoEl.setAttribute('playsinline','');
  videoEl.muted=true;
  // iOS Safari liefert mit dem reinen facingMode-Constraint manchmal nur 480×640
  // (Postkarten-Auflösung), was für Barcode-Decode zu wenig Pixel ergibt. Mit
  // ideal-Werten fragen wir 1920×1080 an; wenn die Kamera weniger kann, wählt
  // der Browser automatisch die nächst-höhere verfügbare Auflösung.
  function _getCameraStream(){
    return navigator.mediaDevices.getUserMedia({
      video:{
        facingMode:{ideal:'environment'},
        width:{ideal:1920},
        height:{ideal:1080},
        frameRate:{ideal:30}
      }
    }).catch(function(err){
      // Fallback: simple Constraints falls iOS mit ideal-Werten zickt
      return navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    });
  }
  _getCameraStream().then(function(stream){
    if(!pickerBcActive){stream.getTracks().forEach(function(t){t.stop();});return;}
    videoEl.srcObject=stream;
    var playP=videoEl.play();if(playP)playP.catch(function(){});
    var isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)&&!window.MSStream;
    // Auto-Focus auf BEIDEN Plattformen versuchen – moderne iPhones (16+) unterstützen
    // continuous focus zuverlässig. Mit try/catch falls iOS Safari zickt.
    try{
      var track=stream.getVideoTracks()[0];if(track){
        var caps=/** @type {MediaTrackCapabilities & {focusMode?: string[], zoom?: {min: number, max: number}}} */ (track.getCapabilities?track.getCapabilities():{});var adv=/** @type {MediaTrackConstraintSet & {focusMode?: string, zoom?: number}} */ ({});
        if(caps.focusMode&&caps.focusMode.includes('continuous'))adv.focusMode='continuous';
        if(!isIOS&&caps.zoom){var z=Math.min(2,caps.zoom.max);if(z>caps.zoom.min)adv.zoom=z;}
        if(Object.keys(adv).length)track.applyConstraints({advanced:[adv]}).catch(function(){});
      }
    }catch(e){}
    if(!isIOS){
      var tb=document.getElementById('torchBtn');if(tb)tb.style.display='block';
      pickerTorchOn=false;if(tb)tb.textContent='🔦';
    }
    pickerBcReader={_stream:stream};
    function startScanWhenReady(){
      if(!pickerBcActive)return;
      document.getElementById('pickerBarcodeResult').innerHTML='';
      // Shared canvas: in DOM (offscreen) for iOS pixel readback
      var canvas=document.createElement('canvas');
      canvas.style.cssText='position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;pointer-events:none;opacity:0;';
      document.body.appendChild(canvas);
      var ctx=canvas.getContext('2d',{willReadFrequently:true});
      pickerBcReader._canvas=canvas;

      // Pro Frame: erst zxing-wasm probieren, bei Misserfolg zbar-wasm.
      // Beide laufen gegen denselben Canvas, kostet zusammen typ. <30 ms pro Frame.
      // ZBar nutzt komplett andere Algorithmen → fängt oft genau die Codes,
      // bei denen ZXing aufgibt (z.B. dünne Striche, niedriger Kontrast, Glanz).
      function _zbarTry(c){
        if(!window.ZBarWasm||!window.ZBarWasm.scanImageData)return Promise.resolve(null);
        try{
          var imageData=ctx.getImageData(0,0,c.width,c.height);
          return window.ZBarWasm.scanImageData(imageData).then(_pickerZbarText).catch(function(){return null;});
        }catch(e){return Promise.resolve(null);}
      }
      function startZXingWasm(){
        _pickerFrameLoop(videoEl,canvas,ctx,function(c,next){
          window.ZXingWasm.readBarcodes(c,{
            formats:['EAN-13','EAN-8','UPC-A','UPC-E','Code128','Code39'],
            tryHarder:true,
            tryRotate:true,
            tryInvert:true,
            maxNumberOfSymbols:1
          }).then(function(results){
            if(!pickerBcActive)return;
            if(results&&results.length>0&&results[0].text){
              pickerStopScan();pickerLookupBarcode(results[0].text);return;
            }
            // ZXing hat nichts gefunden → ZBar versuchen
            return _zbarTry(c).then(function(zbarCode){
              if(!pickerBcActive)return;
              if(zbarCode){pickerStopScan();pickerLookupBarcode(zbarCode);return;}
              next();
            });
          }).catch(function(){
            return _zbarTry(c).then(function(zbarCode){
              if(!pickerBcActive)return;
              if(zbarCode){pickerStopScan();pickerLookupBarcode(zbarCode);return;}
              next();
            });
          });
        },'ZXing+ZBar-WASM');
      }

      function startZXingJs(){
        if(typeof ZXing==='undefined'){
          document.getElementById('pickerBarcodeResult').innerHTML='<div style="font-size:13px;color:var(--re);padding:8px;">❌ Decoder nicht geladen. Seite neu laden.</div>';
          document.getElementById('pickerBcPhotoBtn').style.display='block';
          return;
        }
        var hints=new Map();
        hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS,[ZXing.BarcodeFormat.EAN_13,ZXing.BarcodeFormat.EAN_8,ZXing.BarcodeFormat.UPC_A,ZXing.BarcodeFormat.UPC_E,ZXing.BarcodeFormat.CODE_128,ZXing.BarcodeFormat.CODE_39]);
        hints.set(ZXing.DecodeHintType.TRY_HARDER,true);
        var reader=new ZXing.BrowserMultiFormatReader(hints,300);
        pickerBcReader._zxing=reader;
        // Pro Frame ALLE Decoder probieren in Reihenfolge:
        // 1. zxing-wasm wenn nachträglich geladen (kann nach Start verfügbar werden)
        // 2. zbar-wasm wenn geladen
        // 3. ZXing-JS (immer da)
        _pickerFrameLoop(videoEl,canvas,ctx,function(c,next){
          // Update label dynamically based on which engines are loaded
          var lbl=document.getElementById('bcDbgLabel');
          if(lbl){
            var parts=['ZXing-JS'];
            if(window.ZXingWasm&&window.ZXingWasm.readBarcodes)parts.unshift('ZXing-WASM');
            if(window.ZBarWasm&&window.ZBarWasm.scanImageData)parts.push('ZBar-WASM');
            lbl.textContent=parts.join('+');
          }
          var p=Promise.resolve(null);
          if(window.ZXingWasm&&window.ZXingWasm.readBarcodes){
            p=window.ZXingWasm.readBarcodes(c,{
              formats:['EAN-13','EAN-8','UPC-A','UPC-E','Code128','Code39'],
              tryHarder:true,tryRotate:true,tryInvert:true,maxNumberOfSymbols:1
            }).then(function(rs){return rs&&rs.length&&rs[0].text?rs[0].text:null;}).catch(function(){return null;});
          }
          p.then(function(code){
            if(!pickerBcActive)return;
            if(code){pickerStopScan();pickerLookupBarcode(code);return;}
            // Try ZXing-JS
            try{var r=reader.decodeFromCanvas(c);if(r&&r.getText()){pickerStopScan();pickerLookupBarcode(r.getText());return;}}catch(e){}
            // Try ZBar last
            _zbarTry(c).then(function(zbarCode){
              if(!pickerBcActive)return;
              if(zbarCode){pickerStopScan();pickerLookupBarcode(zbarCode);return;}
              next();
            });
          });
        },'ZXing-JS+ZBar');
      }

      // zxing-wasm wird seit v0.196 lokal als synchrones <script> geladen
      // (js/zxing/), ist also normalerweise schon vor dem ersten Scan bereit.
      // Das kurze Polling deckt nur den seltenen Fall ab, dass das lokale
      // Script gar nicht lud – dann zügig (2s) auf den ZXing-JS-Fallback.
      function startWasmOrFallback(){
        if(!pickerBcActive)return;
        if(window.ZXingWasm&&window.ZXingWasm.readBarcodes){startZXingWasm();return;}
        var waited=0;
        var poll=setInterval(function(){
          if(!pickerBcActive){clearInterval(poll);return;}
          waited+=100;
          if(window.ZXingWasm&&window.ZXingWasm.readBarcodes){clearInterval(poll);startZXingWasm();}
          else if(waited>=2000){clearInterval(poll);startZXingJs();}
        },100);
      }

      // Decoder-Reihenfolge:
      // 1. BarcodeDetector (Chrome/Edge: GPU-nativ, sehr schnell)
      // 2. zxing-wasm (iOS Safari & alle Browser ohne BarcodeDetector – C++/WASM, robust)
      // 3. ZXing-JS (Fallback falls WASM-Modul nicht laden konnte)
      // PARALLEL: Server-Decode über den Worker (OSS-Decoder OpenCV + pyzbar, Cloud Run).
      // Nur auf Plattformen ohne BarcodeDetector aktivieren – auf Chrome/Android
      // trifft der lokale Decoder ohnehin in <100ms, da brauchen wir keinen Roundtrip.
      if(!('BarcodeDetector' in window)){
        try{_pickerStartServerDecodeLoop(canvas);}catch(e){}
      }
      if('BarcodeDetector' in window){
        var want=['ean_13','ean_8','upc_a','upc_e','code_128','code_39'];
        BarcodeDetector.getSupportedFormats().then(function(supported){
          var formats=want.filter(function(f){return supported.indexOf(f)>=0;});
          if(!formats.length)formats=['ean_13','ean_8'];
          var detector=new BarcodeDetector({formats:formats});
          _pickerFrameLoop(videoEl,canvas,ctx,function(c,next){
            detector.detect(c).then(function(barcodes){
              if(!pickerBcActive)return;
              if(barcodes&&barcodes.length>0){pickerStopScan();pickerLookupBarcode(barcodes[0].rawValue);}
              else{next();}
            }).catch(next);
          },'BarcodeDetector ('+formats.length+' Formate)');
        }).catch(function(){
          try{
            var detector=new BarcodeDetector({formats:['ean_13','ean_8','upc_e','code_128','code_39']});
            _pickerFrameLoop(videoEl,canvas,ctx,function(c,next){
              detector.detect(c).then(function(barcodes){
                if(!pickerBcActive)return;
                if(barcodes&&barcodes.length>0){pickerStopScan();pickerLookupBarcode(barcodes[0].rawValue);}
                else{next();}
              }).catch(next);
            },'BarcodeDetector (Fallback)');
          }catch(e){startWasmOrFallback();}
        });
      }else{
        startWasmOrFallback();
      }
    }
    if(videoEl.readyState>=2){startScanWhenReady();}
    else{videoEl.oncanplay=function(){videoEl.oncanplay=null;startScanWhenReady();};}
  }).catch(function(err){
    var msg=err.name==='NotAllowedError'
      ?'Kamerazugriff verweigert – in Einstellungen → Safari → Kamera erlauben.'
      :'Kamera nicht verfügbar: '+err.message;
    document.getElementById('pickerBarcodeResult').innerHTML='<div style="font-size:13px;color:var(--re);padding:10px;text-align:center;">❌ '+msg+'</div>';
    document.getElementById('pickerBcPhotoBtn').style.display='block';
    document.getElementById('pickerBcStopBtn').style.display='none';
    document.getElementById('pickerBcStartBtn').style.display='block';
    pickerBcActive=false;
  });
}


function pickerStopScan(){
  pickerBcActive=false;
  pickerBcServerActive=false;
  if(pickerBcReader){
    try{if(pickerBcReader._scanLoop)clearInterval(pickerBcReader._scanLoop);}catch(e){}
    try{if(pickerBcReader._zxing)pickerBcReader._zxing.reset();}catch(e){}
    try{if(pickerBcReader._canvas&&pickerBcReader._canvas.parentNode)pickerBcReader._canvas.parentNode.removeChild(pickerBcReader._canvas);}catch(e){}
    try{if(pickerBcReader._stream)pickerBcReader._stream.getTracks().forEach(function(t){t.stop();});}catch(e){}
    pickerBcReader=null;
  }
  var videoEl=/** @type {HTMLElement & {_iosKeepAlive?: EventListener|null}} */ (document.getElementById('pickerBarcodeVideo'));
  if(videoEl){
    if(videoEl._iosKeepAlive){document.removeEventListener('visibilitychange',videoEl._iosKeepAlive);videoEl._iosKeepAlive=null;}
    if(videoEl.srcObject){try{videoEl.srcObject.getTracks().forEach(function(t){t.stop();});}catch(e){}videoEl.srcObject=null;}
  }
  var w=document.getElementById('pickerBarcodeWrap');if(w)w.classList.add('hidden');
  var s=document.getElementById('pickerBcStartBtn');if(s)s.style.display='block';
  var t=document.getElementById('pickerBcStopBtn');if(t)t.style.display='none';
  var tb=document.getElementById('torchBtn');if(tb)tb.style.display='none';
  // Foto-Knopf bleibt sichtbar – ist jetzt der zuverlässige Plan B
  pickerTorchOn=false;
}

// Decodet ein hochauflösendes Foto mit den lokalen Decodern, danach über den
// OSS-Decoder des Workers (kein KI-Aufruf).
// Foto-Pfad ist robuster als Live-Stream, weil iOS hier Hardware-Auto-Focus,
// Stabilisierung und volle Sensor-Auflösung nutzt (~4032×3024 statt 1080×1920).
function pickerScanFromPhoto(event){
  var file=event.target.files&&event.target.files[0];
  if(!file)return;
  var el=document.getElementById('pickerBarcodeResult');
  el.innerHTML='<div style="font-size:13px;color:var(--g1);padding:8px;text-align:center;"><span class="spin" style="display:inline-block;width:14px;height:14px;border:2px solid var(--g2);border-top-color:transparent;border-radius:50%;vertical-align:middle;margin-right:6px;"></span>Foto wird analysiert…</div>';
  var img=new Image();
  var url=URL.createObjectURL(file);
  img.onload=function(){
    URL.revokeObjectURL(url);
    // 1600px Max statt 1200 – mehr Pixel pro Strichcode-Modul
    var MAX=1600;
    var scale=Math.min(1,MAX/Math.max(img.width,img.height));
    var w=Math.round(img.width*scale),h=Math.round(img.height*scale);
    var canvas=document.createElement('canvas');
    canvas.width=w;canvas.height=h;
    var ctx=canvas.getContext('2d',{willReadFrequently:true});
    // S/W + Kontrast hilft, falls iOS Safari es unterstützt
    try{ctx.filter='grayscale(100%) contrast(170%) brightness(105%)';}catch(e){}
    ctx.drawImage(img,0,0,w,h);
    try{ctx.filter='none';}catch(e){}
    var done=false;
    function hit(code,via){
      if(done)return;done=true;
      var inp=document.getElementById('pickerBcPhoto');if(inp)inp.value='';
      pickerLookupBarcode(code);
    }
    function fail(){
      if(done)return;done=true;
      el.innerHTML='<div style="background:var(--gl);border:1.5px solid var(--br);border-radius:12px;padding:12px;">'
        +'<div style="font-size:13px;color:var(--re);margin-bottom:8px;text-align:center;">❌ Kein Barcode erkannt</div>'
        +'<div style="font-size:11px;color:var(--mu);text-align:center;margin-bottom:10px;">Nochmal versuchen oder Code direkt eintippen:</div>'
        +'<button type="button" onclick="NTPicker.pickerOpenManualBarcode()" style="width:100%;background:linear-gradient(135deg,var(--g1),var(--g2));color:white;border:none;border-radius:10px;padding:10px;font-weight:800;font-size:13px;">📝 Code manuell eingeben</button>'
        +'</div>';
      var inp=document.getElementById('pickerBcPhoto');if(inp)inp.value='';
    }
    // 1.–3. lokal: ZXing-WASM → ZBar-WASM → ZXing-JS (gemeinsame Kette mit dem Foto-Tab)
    _pickerDecodeCanvasLocal(canvas).then(function(c){
      if(done)return;
      if(c){hit(c,'local');return;}
      // 4. Server: OSS-Decoder (OpenCV + pyzbar auf Cloud Run) über den Worker
      if(typeof canUseAi==='function'&&canUseAi()){
        var serverUrl=_pickerServerDecodeUrl&&_pickerServerDecodeUrl();
        if(serverUrl){
          _pickerServerJpeg(canvas,function(blob){
            if(!blob){fail();return;}
            fetch(serverUrl,{
              method:'POST',
              headers:{'Content-Type':'image/jpeg','x-app-proxy-secret':getProxySecret()},
              body:blob
            }).then(function(r){return r.ok?r.json():null;}).then(function(d){
              if(d&&d.ok&&d.data&&d.data.code){hit(d.data.code,'server');}
              else{fail();}
            }).catch(fail);
          });
          return;
        }
      }
      fail();
    });
  };
  img.onerror=function(){el.innerHTML='<div style="font-size:13px;color:var(--re);padding:8px;">❌ Foto konnte nicht geladen werden.</div>';};
  img.src=url;
}

// OpenFoodFacts fuehrt kcal je nach Eintrag als kcal, als kJ (energy_100g)
// oder gar nicht. Wer nur 'energy-kcal_100g' liest, zeigt fuer ein Produkt mit
// vollstaendigen Makros trotzdem 0 kcal an (#167).
function _pickerOffPer100(nm){
  nm=nm||{};
  var pr=nm['proteins_100g']||0,ca=nm['carbohydrates_100g']||0,fa=nm['fat_100g']||0;
  var kcal=nm['energy-kcal_100g']||0;
  if(!kcal&&nm['energy_100g'])kcal=Math.round(nm['energy_100g']/4.184);
  if(!kcal)kcal=Math.round(pr*4+ca*4+fa*9);
  return{kcal:kcal,protein:pr,carbs:ca,fat:fa,sugar:nm['sugars_100g']||0,fiber:nm['fiber_100g']||0,salt:nm['salt_100g']||0};
}
// Ein Cache-Eintrag aus einer aelteren Version kann leer sein – dann zaehlt er
// nicht als Treffer, sondern wird verworfen.
function _pickerCachedBarcode(code){
  var c=barcodeCache[code];
  if(!c)return null;
  if(c.per100&&_hasNutrients(c.per100))return c;
  delete barcodeCache[code];saveBarcodeCache();
  return null;
}

// Foto-Tab: Produkt zum erkannten Barcode holen und die Rückfrage zeigen.
// seq (optional) ist die Marke des Fotos – wurde es inzwischen ersetzt oder
// zurückgesetzt, bleibt die späte Antwort still (#209).
function pickerFetchBarcodeForConfirm(code,seq){
  function stale(){return seq!==undefined&&seq!==window._pickerPhotoSeq;}
  var cached=_pickerCachedBarcode(code);
  if(cached){pickerShowBcConfirm(cached);return;}
  if(!isOnline)return;
  fetchT(offProxyUrl('https://world.openfoodfacts.org/api/v0/product/'+code+'.json'),{},6000)
    .then(function(r){return r.json();})
    .then(function(data){
      if(stale())return;
      if(data.status!==1||!data.product){showToast('Barcode '+code+' nicht gefunden – bitte manuell eintragen');return;}
      var p=data.product,nm=p.nutriments||{};
      var name=p.product_name_de||p.product_name||'Unbekannt';
      var per100=_pickerOffPer100(nm);
      // Nur Hinweis: Die Nutzerin bleibt im Foto-Tab, „KI-Analyse starten" ist
      // dort weiter sichtbar. (Vorher lief hier ein Zugriff auf #bcManualName,
      // das es nur nach pickerShowBarcodeNotFound gibt → TypeError, #209.)
      if(!_hasNutrients(per100)){showToast('⚠️ „'+name+'“ hat in der Datenbank keine Nährwerte – KI-Analyse starten oder unter „Eigenes“ eintragen',4000);return;}
      var food={name:name,emoji:emo(name),barcode:code,per100:per100};
      barcodeCache[code]=food;saveBarcodeCache();cacheFood(food);
      pickerShowBcConfirm(food);
    }).catch(function(){if(!stale())showToast('Produkt-Abruf fehlgeschlagen – bist du online?');});
}

function pickerShowBcConfirm(food){
  pickerBcFound=food;
  document.getElementById('pickerBcName').textContent=(food.emoji||'🍽')+' '+food.name;
  document.getElementById('pickerBcVals').textContent=Math.round(food.per100.kcal)+' kcal · P'+food.per100.protein+'g · K'+food.per100.carbs+'g · F'+food.per100.fat+'g pro 100g';
  document.getElementById('pickerBcConfirm').classList.remove('hidden');
  document.getElementById('pickerAnalyzeBtn').style.display='none';
}

function pickerBcYes(){
  if(!pickerBcFound)return;
  document.getElementById('pickerBcConfirm').classList.add('hidden');
  var food=pickerBcFound;pickerBcFound=null;
  pickerIngredients=[{name:food.name,emoji:food.emoji,g:100,amount:100,per100:food.per100}];
  pickerShowPhotoResult('');
  showToast((food.emoji||'🍽')+' '+food.name+' erkannt');
}

function pickerBcNo(){
  document.getElementById('pickerBcConfirm').classList.add('hidden');
  pickerBcFound=null;
  // Knopf wieder zeigen: scheitert die KI, bleibt „Erneut analysieren" erreichbar (#209).
  document.getElementById('pickerAnalyzeBtn').style.display='';
  pickerAnalyze();
}

// Notnagel: Code manuell eintippen wenn alle Decoder versagen.
// Auf iOS: long-press im Eingabefeld → "Text scannen" nutzt Apples Live Text OCR,
// die EAN-Klartextziffern unter dem Strichcode extrem zuverlässig liest.
function pickerOpenManualBarcode(){
  pickerStopScan();
  _pickerManualWarn=null;// jede neu geöffnete Eingabe warnt wieder bei falscher Prüfziffer
  var el=document.getElementById('pickerBarcodeResult');
  if(!el)return;
  el.innerHTML='<div style="background:var(--gl);border:1.5px solid var(--br);border-radius:12px;padding:12px;">'
    +'<div style="font-size:12px;color:var(--mu);margin-bottom:6px;">Tippe die 13 Ziffern unter dem Strichcode ein.</div>'
    +'<div style="font-size:11px;color:var(--mu);margin-bottom:10px;line-height:1.4;">📱 <strong>iPhone-Tipp:</strong> Halte das Eingabefeld lang gedrückt → „Text scannen" → mit Kamera die Ziffern lesen lassen (Apples Live Text).</div>'
    +'<input type="text" id="bcDirectInput" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="z.B. 4006381333931" style="width:100%;box-sizing:border-box;border:2px solid var(--br);border-radius:9px;padding:10px;font-size:16px;font-family:ui-monospace,Menlo,monospace;letter-spacing:1px;outline:none;margin-bottom:10px;" maxlength="14">'
    +'<button type="button" data-act="NTPicker.pickerSubmitManualBarcode" style="width:100%;background:linear-gradient(135deg,var(--g1),var(--g2));color:white;border:none;border-radius:10px;padding:11px;font-weight:800;font-size:14px;">Suchen ✓</button>'
    +'</div>';
  setTimeout(function(){var i=document.getElementById('bcDirectInput');if(i)i.focus();},50);
}
// Prüfziffer einer GTIN (EAN-8, UPC-A, EAN-13, GTIN-14): Mod 10, Gewichte
// 3/1 von rechts ohne die Prüfziffer. Achtstellig kann auch ein UPC-E sein –
// dann gilt die Prüfziffer seiner Erweiterung auf UPC-A. Andere Längen oder
// Nicht-Ziffern (Code 128/39) lassen sich nicht prüfen und gelten als ok.
function _pickerGtinMod10(d){
  var sum=0;
  for(var i=d.length-2,w=3;i>=0;i--,w=(w===3?1:3))sum+=(d.charCodeAt(i)-48)*w;
  return (10-(sum%10))%10===d.charCodeAt(d.length-1)-48;
}
function _pickerUpcEToA(e){
  // e: 8 Ziffern = Zahlensystem (0/1) + 6 Nutzziffern + Prüfziffer
  if(e.charAt(0)!=='0'&&e.charAt(0)!=='1')return null;
  var m=e.substr(1,6),last=m.charAt(5),body;
  if(last==='0'||last==='1'||last==='2')body=m.substr(0,2)+last+'0000'+m.substr(2,3);
  else if(last==='3')body=m.substr(0,3)+'00000'+m.substr(3,2);
  else if(last==='4')body=m.substr(0,4)+'00000'+m.charAt(4);
  else body=m.substr(0,5)+'0000'+last;
  return e.charAt(0)+body+e.charAt(7);
}
function _pickerGtinOk(code){
  var c=String(code==null?'':code);
  if(!/^\d+$/.test(c))return true;
  var n=c.length;
  if(n!==8&&n!==12&&n!==13&&n!==14)return true;
  if(_pickerGtinMod10(c))return true;
  if(n===8){var a=_pickerUpcEToA(c);return !!(a&&_pickerGtinMod10(a));}
  return false;
}

// Zweites Antippen mit demselben Code sucht trotz falscher Prüfziffer.
var _pickerManualWarn=null;
function pickerSubmitManualBarcode(){
  var i=document.getElementById('bcDirectInput');
  if(!i)return;
  var code=(i.value||'').replace(/\D/g,'');
  if(code.length<8){showToast('Mindestens 8 Ziffern eingeben');return;}
  // Hinweis statt Sperre (#209): Ein Tippfehler fällt auf, bevor unter dem
  // falschen Code eigene Werte im Barcode-Cache landen; ein Code, der trotzdem
  // in der Datenbank steht, bleibt mit einem zweiten Antippen erreichbar.
  if(!_pickerGtinOk(code)&&_pickerManualWarn!==code){
    _pickerManualWarn=code;
    showToast('⚠️ Prüfziffer passt nicht – Tippfehler? Nochmal „Suchen“ tippen, um trotzdem zu suchen.',4000);
    return;
  }
  _pickerManualWarn=null;
  pickerLookupBarcode(code);
}

function pickerLookupBarcode(code){
  var el=document.getElementById('pickerBarcodeResult');
  var startBtn=document.getElementById('pickerBcStartBtn');
  if(startBtn)startBtn.style.display='none';
  if(el)el.innerHTML='<div style="font-size:13px;color:var(--g1);padding:8px;text-align:center;">🔍 Suche Barcode '+_esc(code)+'...</div>';
  var cached=_pickerCachedBarcode(code);
  if(cached){pickerShowBarcodeResult(cached,true);return;}
  if(!isOnline){
    pickerShowBarcodeNotFound(code,'📴 Offline – nicht im Cache. Werte manuell eintragen:');
    return;
  }
  fetchT(offProxyUrl('https://world.openfoodfacts.org/api/v0/product/'+code+'.json'),{},6000)
    .then(function(r){return r.json();})
    .then(function(data){
      if(data.status!==1||!data.product){
        pickerShowBarcodeNotFound(code,'Produkt nicht in der Datenbank. Trag die Werte selbst ein:');
        return;
      }
      var p=data.product,nm=p.nutriments||{};
      var name=p.product_name_de||p.product_name||'Unbekannt';
      var per100=_pickerOffPer100(nm);
      // Das Produkt steht in der Datenbank, seine Naehrwerte fehlen dort aber.
      // Ohne diesen Guard bot die Karte "0 kcal · P0 · K0 · F0" zum Buchen an (#167).
      if(!_hasNutrients(per100)){pickerBarcodeNoNutrients(code,name);return;}
      var food={name:name,emoji:emo(name),barcode:code,per100:per100};
      barcodeCache[code]=food;saveBarcodeCache();cacheFood(food);
      pickerShowBarcodeResult(food,false);
    }).catch(function(){
      if(el)el.innerHTML='<div style="font-size:13px;color:var(--re);padding:8px;">❌ Fehler beim Laden</div>';
      if(startBtn)startBtn.style.display='block';
    });
}

// Produkt steht in der Datenbank, Naehrwerte fehlen dort: schaetzen lassen –
// wie im Chat- und Foto-Pfad – oder selbst eintragen. Nie 0 kcal anbieten.
function pickerBarcodeNoNutrients(code,name){
  var el=document.getElementById('pickerBarcodeResult');
  if(typeof canUseAi==='function'&&canUseAi()&&typeof kiNutrientLookup==='function'){
    if(el)el.innerHTML='<div style="font-size:13px;color:var(--g1);padding:8px;text-align:center;">🤖 „'+_esc(name)+'" hat keine Nährwerte hinterlegt – KI schätzt sie...</div>';
    kiNutrientLookup(name,emo(name),100,function(res){
      var per100=(res&&res.per100)||{};
      if(!_hasNutrients(per100)){pickerBarcodeAskManual(code,name);return;}
      // Eine Schaetzung ist kein Produktdatum – sie wird nicht gecacht.
      pickerShowBarcodeResult({name:name,emoji:emo(name),barcode:code,per100:per100,estimated:true},false);
    });
    return;
  }
  pickerBarcodeAskManual(code,name);
}
function pickerBarcodeAskManual(code,name){
  pickerShowBarcodeNotFound(code,(name?'„'+_esc(name)+'" steht in der Datenbank, hat dort aber keine Nährwerte. ':'')+'Trag die Werte selbst ein:');
  var i=document.getElementById('bcManualName');if(i&&name)i.value=name;
}

function pickerShowBarcodeResult(food,fromCache){
  var el=document.getElementById('pickerBarcodeResult');
  if(!el){return;}
  // Letzte Sicherung: ohne Naehrwerte gibt es keinen Hinzufuegen-Knopf (#167).
  if(!food||!food.per100||!_hasNutrients(food.per100)){pickerBarcodeAskManual((food&&food.barcode)||'',(food&&food.name)||'');return;}
  el.innerHTML='<div style="background:var(--gl);border:1.5px solid var(--g3);border-radius:12px;padding:12px;">'
    +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">'
    +'<div style="font-size:28px;">'+esc(food.emoji||'🍽')+'</div>'
    +'<div style="flex:1;"><div style="font-weight:700;font-size:14px;">'+_esc(food.name)+'</div>'
    +'<div style="font-size:11px;color:var(--mu);margin-top:2px;">P '+food.per100.protein+'g · K '+food.per100.carbs+'g · F '+food.per100.fat+'g pro 100g</div>'
    +(fromCache?'<div style="font-size:10px;color:var(--g2);margin-top:2px;">📴 Aus Cache</div>':'')
    +(food.estimated?'<div style="font-size:10px;color:var(--wa,#b26a00);margin-top:2px;">🤖 Von der KI geschätzt – Datenbank hatte keine Werte</div>':'')
    +'</div>'
    +'<div style="font-weight:800;font-size:15px;color:var(--g1);">'+Math.round(food.per100.kcal)+' kcal</div>'
    +'</div>'
    +'<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">'
    +'<input type="number" id="pickerBcAmt" value="100" min="1" style="flex:1;border:2px solid var(--br);border-radius:9px;padding:8px;font-size:14px;font-weight:700;text-align:center;outline:none;">'
    +'<div style="font-size:13px;color:var(--mu);">Gramm</div>'
    +'</div>'
    +'<button type="button" onclick="NTPicker.pickerBarcodeAdd()" style="width:100%;background:linear-gradient(135deg,var(--g1),var(--g2));color:white;border:none;border-radius:10px;padding:11px;font-weight:800;font-size:14px;">Hinzufügen ✓</button>'
    +'</div>';
  window._pickerBarcodeFood=food;
}

function pickerBarcodeAdd(){
  var food=window._pickerBarcodeFood;if(!food)return;
  var amt=parseFloat(document.getElementById('pickerBcAmt').value)||100;
  var r=amt/100;
  if(window._editEntryMode){_pickerAppendToEditEntry([{name:food.name,emoji:food.emoji,amount:amt,per100:food.per100}]);return;}
  getDay().meals[pickerMeal].push(Object.assign({name:food.name,emoji:food.emoji,amount:amt,per100:food.per100},scaleNutrients(food.per100,r)));
  var _bidx=getDay().meals[pickerMeal].length-1;
  saveS();renderAll();closePicker();
  animateAdd(pickerMeal);
  var _bAmp=[{name:food.name,per100:food.per100,amount:amt}];// Kopie mit Menge (#262)
  checkPregWarn(_bAmp,pickerMeal,_bidx);
  checkNursWarn(_bAmp,pickerMeal,_bidx);
  checkDietWarn(_bAmp,pickerMeal,_bidx);
  showToast((food.emoji||'🍽')+' '+food.name+' hinzugefügt');
}

function pickerShowBarcodeNotFound(code,msg){
  var el=document.getElementById('pickerBarcodeResult');
  if(!el)return;
  window._pickerBarcodeNotFoundCode=code;
  el.innerHTML='<div style="background:var(--gl);border:1.5px solid var(--br);border-radius:12px;padding:12px;">'
    +'<div style="font-size:11px;color:var(--mu);text-align:center;margin-bottom:8px;letter-spacing:.3px;">📷 Erkannt: <strong style="font-family:ui-monospace,Menlo,monospace;font-size:13px;color:var(--g1);">'+_esc(code)+'</strong></div>'
    +'<div style="font-size:12px;color:var(--mu);margin-bottom:10px;">'+msg+'</div>'
    +'<input type="text" id="bcManualName" placeholder="Produktname *" style="width:100%;box-sizing:border-box;border:2px solid var(--br);border-radius:9px;padding:8px;font-size:14px;margin-bottom:8px;outline:none;">'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;">'
    +'<label style="font-size:11px;color:var(--mu);">kcal/100g<input type="number" id="bcManualKcal" placeholder="0" min="0" style="width:100%;box-sizing:border-box;border:1.5px solid var(--br);border-radius:8px;padding:6px;font-size:13px;margin-top:2px;outline:none;"></label>'
    +'<label style="font-size:11px;color:var(--mu);">Protein g<input type="number" id="bcManualProt" placeholder="0" min="0" style="width:100%;box-sizing:border-box;border:1.5px solid var(--br);border-radius:8px;padding:6px;font-size:13px;margin-top:2px;outline:none;"></label>'
    +'<label style="font-size:11px;color:var(--mu);">Kohlenhydrate g<input type="number" id="bcManualCarbs" placeholder="0" min="0" style="width:100%;box-sizing:border-box;border:1.5px solid var(--br);border-radius:8px;padding:6px;font-size:13px;margin-top:2px;outline:none;"></label>'
    +'<label style="font-size:11px;color:var(--mu);">Fett g<input type="number" id="bcManualFat" placeholder="0" min="0" style="width:100%;box-sizing:border-box;border:1.5px solid var(--br);border-radius:8px;padding:6px;font-size:13px;margin-top:2px;outline:none;"></label>'
    +'</div>'
    +'<button type="button" onclick="NTPicker.pickerBarcodeManualSave(\''+_esc(String(code).replace(/[\\']/g,''))+'\')" style="width:100%;background:linear-gradient(135deg,var(--g1),var(--g2));color:white;border:none;border-radius:10px;padding:11px;font-weight:800;font-size:14px;">Speichern & hinzufügen ✓</button>'
    +'</div>';
}

function pickerBarcodeManualSave(code){
  var name=(document.getElementById('bcManualName').value||'').trim();
  if(!name){showToast('Produktname eingeben');return;}
  var food={name:name,emoji:emo(name),barcode:code,per100:{
    kcal:parseFloat(document.getElementById('bcManualKcal').value)||0,
    protein:parseFloat(document.getElementById('bcManualProt').value)||0,
    carbs:parseFloat(document.getElementById('bcManualCarbs').value)||0,
    fat:parseFloat(document.getElementById('bcManualFat').value)||0,
    sugar:0,fiber:0,salt:0
  }};
  if(!_hasNutrients(food.per100)){showToast('Mindestens Kalorien oder einen Makro-Wert eintragen');return;}
  barcodeCache[code]=food;saveBarcodeCache();
  customFoods.unshift(food);saveX();
  pickerShowBarcodeResult(food,false);
  showToast(food.emoji+' '+food.name+' gespeichert');
}

function pickerAnalyze(){
  if(!window._pickerPhotoB64)return;
  if(!isOnline){
    if(window._pickerPhotoB64){NTQueue.add(window._pickerPhotoB64,pickerMeal,S.currentDate);}
    else{showToast('Foto-Analyse benötigt Internet');}
    return;
  }
  var btn=document.getElementById('pickerAnalyzeBtn');
  btn.disabled=true;btn.innerHTML='<span style="display:inline-flex;gap:5px;align-items:center;"><span class="spin"></span>KI analysiert...</span>';
  pickerSetPhotoStatus('KI analysiert das Foto...',false);
  var _srcEl=document.getElementById('pickerPhotoSource');if(_srcEl)_srcEl.innerHTML='';
  var prompt=getFotoPrompt();
  callClaude('claude-sonnet-4-6',[{type:'image',source:{type:'base64',media_type:'image/jpeg',data:window._pickerPhotoB64}},{type:'text',text:prompt}],1024,
    function(text){
      // Foto aus der Offline-Warteschlange: KI hat geantwortet → erst jetzt raus (#233).
      if(window._pickerQueueItem){NTQueue.done(window._pickerQueueItem);window._pickerQueueItem=null;}
      var parsed=parsePhotoResponse(text);
      btn.disabled=false;btn.textContent='📷 Erneut analysieren';
      // Badge sofort einfrieren: es soll die Vision-Anfrage zeigen, nicht die
      // späteren Text-Anfragen aus lookupNutrients (wie im Chat-Pfad).
      var _src=(typeof aiSourceBadgeHtml==='function')?aiSourceBadgeHtml():'';
      if(!parsed.zutaten.length){
        pickerSetPhotoStatus(text.length?'KI: '+text.slice(0,120):'Kein Lebensmittel erkannt.',true);
        return;
      }
      if(parsed.rezept){
        var nameField=document.getElementById('pickerRecipeName');
        if(nameField&&!nameField.value.trim())nameField.value=parsed.rezept;
      }
      lookupNutrients(parsed.zutaten,function(resolved){
        checkGramPlausibility(resolved);
        pickerIngredients=resolved;
        pickerShowPhotoResult(parsed.rezept);
        var srcEl=document.getElementById('pickerPhotoSource');
        if(srcEl)srcEl.innerHTML=_src;
        pickerSetPhotoStatus('',false);
      });
    },
    function(err){btn.disabled=false;btn.textContent='📷 Erneut analysieren';pickerSetPhotoStatus(pickerFriendlyAiError(err),true);}
  );
}

function pickerShowPhotoResult(rezept){
  if(rezept&&!document.getElementById('pickerRecipeName').value)
    document.getElementById('pickerRecipeName').value=rezept;
  pickerRenderIngList('pickerPhotoIngList',pickerIngredients,
    function(i,v){pickerIngredients[i].amount=parseFloat(v)||0;pickerIngredients[i].missingGrams=false;pickerUpdatePhotoTotal();},
    function(i){pickerIngredients.splice(i,1);pickerShowPhotoResult(rezept);}
  );
  pickerUpdatePhotoTotal();
  document.getElementById('pickerPhotoResult').classList.remove('hidden');
}

function pickerUpdateTotal(tab){
  var t=ingTotal(pickerIngredients);
  var p=parseFloat(document.getElementById('picker'+tab+'Portions').value)||1;
  document.getElementById('picker'+tab+'Total').textContent='1 Portion: '+totalStr(t)+(p!==1?'  ·  '+p+'× = '+totalStr(scaleNutrients(t,p)):'');
}
function pickerUpdatePhotoTotal(){pickerUpdateTotal('Photo');}
function pickerSetPhotoStatus(msg,isErr){
  var el=document.getElementById('pickerPhotoStatus');
  if(!msg){el.classList.add('hidden');return;}
  el.textContent=msg;
  el.style.background=isErr?'#ffebee':'var(--gl)';
  el.style.borderColor=isErr?'var(--re)':'var(--g3)';
  el.style.color=isErr?'var(--re)':'var(--g1)';
  el.classList.remove('hidden');
}

function pickerPhotoAddSearch(){
  var q=(document.getElementById('pickerPhotoAddQ')||{}).value||'';
  var results=searchLocal(q);
  var el=document.getElementById('pickerPhotoAddResults');
  if(!el)return;
  if(!results.length){el.innerHTML='<div class="nr">Kein Ergebnis</div>';return;}
  window._pickerPhotoAddRes=results;
  el.innerHTML=results.slice(0,8).map(function(p,i){
    return'<div class="ri" onclick="NTPicker.pickerPhotoAddFromResult('+i+')">'
      +'<div class="ri-e">'+esc(p.emoji||'🍽')+'</div>'
      +'<div style="flex:1;min-width:0;"><div class="ri-n">'+_esc(p.name)+'</div>'
      +(p.per100?'<div class="ri-d">'+Math.round(p.per100.kcal)+' kcal/100g</div>':'')
      +'</div>'
      +'<div style="font-size:18px;color:var(--g2);font-weight:900;">＋</div>'
      +'</div>';
  }).join('');
}

function pickerPhotoAddFromResult(i){
  var p=(window._pickerPhotoAddRes||[])[i];if(!p)return;
  if(p.isRecipe){showToast('Rezepte können nicht als Zutat hinzugefügt werden');return;}
  pickerIngredients.push({name:p.name,emoji:p.emoji,amount:100,per100:p.per100});
  document.getElementById('pickerPhotoAddQ').value='';
  document.getElementById('pickerPhotoAddResults').innerHTML='';
  pickerShowPhotoResult(document.getElementById('pickerRecipeName').value||'');
  showToast((p.emoji||'🍽')+' '+p.name+' hinzugefügt');
}

// Im Bibliothek-Modus gibt es nichts einzutragen: Der Knopf „✓ Eintragen“
// verschwindet, und „📋 Als Rezept“ sagt, was es wirklich tut.
function _pickerRecipeOnlyUI(){
  var on=!!window._pickerRecipeOnly;
  [['pickerLinkAddBtn','pickerLinkRecBtn'],
   ['pickerPhotoAddBtn','pickerPhotoRecBtn'],
   ['pickerChatAddBtn','pickerChatRecBtn']].forEach(function(pair){
    var a=document.getElementById(pair[0]),b=document.getElementById(pair[1]);
    if(a)a.style.display=on?'none':'';
    if(b)b.textContent=on?'📚 In die Bibliothek':'📋 Als Rezept';
  });
}

function _pickerAdd(emoji,nameId,portionsId,defaultName,saveAsRecipe,hasEditMode){
  if(!pickerIngredients.length){showToast('Keine Zutaten');return;}
  var ings=JSON.parse(JSON.stringify(pickerIngredients));
  pickerIngredients.forEach(function(f){cacheFood(f);});
  if(hasEditMode&&window._editEntryMode){_pickerAppendToEditEntry(ings,_pickerSavePhotoIfWanted);return;}
  var name=document.getElementById(nameId).value.trim()||defaultName;
  var portions=parseFloat(document.getElementById(portionsId).value)||1;
  var t=ingTotal(ings);
  var scaled=scaleNutrients(t,portions);
  var createdRec=/** @type {{id: string, name: string, emoji: string, ingredients: any[], instructions?: string}|null} */ (null);
  if(saveAsRecipe){
    // Ein zweites „Spaghetti Bolognese“ neben dem ersten faellt erst auf, wenn
    // die Bibliothek unuebersichtlich ist. Deshalb VOR dem Anlegen fragen.
    if(window.NTPlan&&NTPlan.confirmNotDuplicate&&!NTPlan.confirmNotDuplicate(name,ings))return null;
    createdRec={id:Date.now().toString(),name:name,emoji:emoji,ingredients:ings};
    recipes.unshift(createdRec);saveX();
    // Aus dem Wochenplan heraus angelegt: Das Rezept ist Vorrat, keine Mahlzeit
    // von heute. Bis v0.259 landete es beides — in der Bibliothek UND als
    // Eintrag im Tagebuch, obwohl es niemand gegessen hatte.
    if(window._pickerRecipeOnly){
      window._pickerRecipeOnly=false;
      _pickerSavePhotoIfWanted();closePicker();
      if(window.NTPlan&&NTPlan.noteRecipeCreated)NTPlan.noteRecipeCreated(createdRec);
      else showToast(emoji+' '+name+' in der Bibliothek gespeichert');
      if(typeof renderLibrary==='function')renderLibrary();
      return createdRec;
    }
    // Eigene Kopie fuer den Eintrag: Die Ampel schreibt ihre Ergebnisse an die
    // Zutaten, und mit demselben Array landeten sie im Bibliotheksrezept – und
    // von dort als alter Stand in jeden spaeteren Eintrag daraus (#205).
    ings=JSON.parse(JSON.stringify(ings));
    getDay().meals[pickerMeal].push(Object.assign({name:name,emoji:emoji,isRecipe:true,recipeId:createdRec.id,portions:portions,ingredients:ings},scaled));
    showToast(emoji+' '+name+' als Rezept gespeichert');
  } else {
    getDay().meals[pickerMeal].push(Object.assign({name:name,emoji:emoji,isRecipe:true,recipeId:null,portions:portions,ingredients:ings},scaled));
    showToast(emoji+' '+name+' eingetragen');
  }
  var _idx=getDay().meals[pickerMeal].length-1;
  saveS();renderAll();_pickerSavePhotoIfWanted();closePicker();animateAdd(pickerMeal);
  checkPregWarn(ings,pickerMeal,_idx);checkNursWarn(ings,pickerMeal,_idx);checkDietWarn(ings,pickerMeal,_idx);
  return createdRec;
}
function pickerPhotoAdd(saveAsRecipe){_pickerAdd('📸','pickerRecipeName','pickerPhotoPortions','Foto-Rezept',saveAsRecipe,true);}

// ─── PICKER: CHAT TAB ───

// Bind ingredient list to pickerIngredients with a delete that re-renders the DOM (#112).
function _pickerChatRebind(){
  pickerRenderIngList('pickerChatIngList',pickerIngredients,
    function(i,v){pickerIngredients[i].amount=parseFloat(v)||0;pickerIngredients[i].missingGrams=false;pickerUpdateChatTotal();},
    function(i){pickerIngredients.splice(i,1);_pickerChatRebind();pickerUpdateChatTotal();}
  );
}

// Suche im lokalen Bestand: Rezepte, Custom Foods, Cache, DB (#113).
// Tokenisiert + tippfehlertolerant (Levenshtein), damit „Joghurt mit Früchten"
// auch „Joghurt mit Früchten und Müsli" oder „Jogurt mit Frucht" trifft.
var _PICKER_STOP={mit:1,und:1,von:1,vom:1,ein:1,eine:1,einen:1,einem:1,einer:1,der:1,die:1,das:1,den:1,dem:1,im:1,in:1,zum:1,zur:1,an:1,am:1,auf:1,bei:1,fuer:1,zu:1};
// Umlaut-Folding: ä→a, ö→o, ü→u, ß→s — damit „Jogurt mit Frucht" auch „Joghurt mit Früchten" trifft.
function _pickerFold(s){return (s||'').toLowerCase().replace(/ä/g,'a').replace(/ö/g,'o').replace(/ü/g,'u').replace(/ß/g,'s');}
function _pickerTok(s){
  return _pickerFold(s).replace(/[^a-z0-9\s-]/g,' ').split(/[\s-]+/).filter(function(w){return w.length>=2 && !_PICKER_STOP[w];});
}
function _pickerLev(a,b){
  if(a===b)return 0;
  var m=a.length,n=b.length;if(!m)return n;if(!n)return m;
  var prev=new Array(n+1),curr=new Array(n+1),i,j;
  for(j=0;j<=n;j++)prev[j]=j;
  for(i=1;i<=m;i++){
    curr[0]=i;
    for(j=1;j<=n;j++){
      var cost=a.charCodeAt(i-1)===b.charCodeAt(j-1)?0:1;
      curr[j]=Math.min(curr[j-1]+1,prev[j]+1,prev[j-1]+cost);
    }
    for(j=0;j<=n;j++)prev[j]=curr[j];
  }
  return prev[n];
}
function _pickerScoreName(name,qTokens,qFull){
  var nl=_pickerFold(name);
  if(!nl)return 0;
  var nTokens=_pickerTok(name);
  if(!nTokens.length)return 0;
  // Alle Query-Tokens müssen treffen — sonst kein sinnvoller Treffer.
  // (Bei „Joghurt mit Früchten" wäre sonst „Joghurt Natur" ein Treffer.)
  var score=0;
  for(var qi=0;qi<qTokens.length;qi++){
    var qt=qTokens[qi],best=0;
    for(var i=0;i<nTokens.length;i++){
      var nt=nTokens[i];
      if(nt===qt){best=Math.max(best,5);break;}
      if(nt.indexOf(qt)===0){best=Math.max(best,4);continue;}
      if(nt.indexOf(qt)>0){best=Math.max(best,3);continue;}
      // Tippfehler-Toleranz: kein Levenshtein für sehr kurze Wörter, sonst sammeln sich
      // Fehltreffer wie „kaffee"↔„waffel" (Distanz 2 bei Länge 6). Erst ab Länge 5 prüfen,
      // 1 Edit bis 7 Zeichen, 2 Edits für längere.
      var maxLen=Math.max(nt.length,qt.length);
      if(maxLen<5)continue;
      var allowed=maxLen<=7?1:2;
      var d=_pickerLev(nt,qt);
      if(d<=allowed)best=Math.max(best,3-Math.min(d,2));
    }
    if(best===0)return 0;
    score+=best;
  }
  if(qFull&&nl.indexOf(qFull)>=0)score+=10;
  return score;
}
// Entfernt eine führende Mengenangabe („1 weiswein", „2 Bier", „ein Glas Wein") vom Anfang.
function _pickerStripQty(s){
  return (s||'').trim().replace(/^\s*(\d+[.,]?\d*\s*)?(x\s*)?(gl(a|ä)s(er|chen)?|stk|stück|portion(en)?|flasche|dose|becher|tasse|ein|eine|einen|einer)?\s+/i,'').trim();
}
// Hochsicherer Treffer in der eingebauten DB: exakter Name/Synonym via findInLocalDB,
// optional nach Entfernen einer führenden Mengenangabe. KEIN Fuzzy → kein #117-Rauschen.
// Gibt den DB-Eintrag oder null zurück.
function _pickerDbHit(q){
  if(typeof findInLocalDB!=='function')return null;
  var dbQ=(q||'').trim();if(!dbQ)return null;
  var hit=findInLocalDB(dbQ);
  if(hit)return hit;
  var stripped=_pickerStripQty(dbQ);
  if(stripped&&stripped!==dbQ)return findInLocalDB(stripped);
  return null;
}
// Alle gleichwertigen DB-Treffer eines Namens: der exakte Name, sonst JEDES
// exakte Synonym (Regel wie findInLocalDB Pass 2, Synonyme ≤2 Zeichen zählen
// nicht) — aber ohne dessen Tiebreak nach Namenslänge. Der macht aus „Reis"
// „Reis weiß (roh)" und aus „Kaffee" „Latte Macchiato" (#210).
function _pickerDbExact(name){
  var db=window.DB||[];
  var nl=(name||'').toLowerCase().trim();if(!nl)return [];
  var i,j,hits=[];
  for(i=0;i<db.length;i++){if(db[i].n.toLowerCase()===nl)return [db[i]];}
  for(i=0;i<db.length;i++){
    var syns=(db[i].s||'').toLowerCase().split(' ');
    for(j=0;j<syns.length;j++){if(syns[j].length>2&&syns[j]===nl){hits.push(db[i]);break;}}
  }
  return hits;
}
// DB-Treffer für die Karten: mehrdeutige Synonyme ALLE (die Nutzerin wählt),
// sonst wie bisher _pickerDbHit (inkl. Präfix — die Karte ist ja eine Auswahl).
function _pickerDbHits(q){
  var dbQ=(q||'').trim();if(!dbQ)return [];
  var hits=_pickerDbExact(dbQ);
  if(!hits.length){var st=_pickerStripQty(dbQ);if(st&&st!==dbQ)hits=_pickerDbExact(st);}
  if(hits.length)return hits;
  var hit=_pickerDbHit(dbQ);
  return hit?[hit]:[];
}
function _pickerDbItem(d){
  return {name:d.n,emoji:d.e,per100:(typeof dbPer100==='function')?dbPer100(d):{kcal:d.k,protein:d.p,carbs:d.c,fat:d.f,sugar:0,fiber:0,salt:0},badge:'📦'};
}

// ─── CHAT: MENGE LOKAL LESEN (#210) ───
// Ein Teil der Chat-Eingabe → {grams,count,name,lookupName,pieceG,unsure}.
// Die Syntax liest NTAlexa.parseAmount (dieselbe wie beim Alexa-Einwurf);
// fehlt der Export, gilt null und damit der Weg von vorher.
//   grams      — „150 g", „0,5 l", „Haferflocken 50g" (ml ≈ g wie bei Alexa)
//   count      — „2", „zwei", „eine halbe" (0,5)
//   lookupName — der Name ohne Behälter-/Maßwort („Scheibe Brot" → „Brot")
//   pieceG     — Gewicht EINES Stücks aus PIECE_G, nur an Wortgrenzen
//   unsure     — vorn steht ein Maßwort ohne Stückgewicht (EL, cl, Dose,
//                Portion …): die Anzahl wird dann mit NICHTS multipliziert.
var _PICKER_CONTAINER=/^(scheiben?|gl(?:a|ä)s(?:er)?|tassen?|becher|kugeln?)\s+/i;
var _PICKER_UNSURE=/^(el|tl|cl|dl|prisen?|msp\.?|messerspitzen?|handvoll|dosen?|packung(?:en)?|pck\.?|päckchen|stück|stueck|stk\.?|portion(?:en)?|flaschen?)(\s+|$)/i;
function _pickerChatQty(part){
  if(!(window.NTAlexa&&NTAlexa.parseAmount))return null;
  var t=String(part||'').trim();if(!t)return null;
  var a=NTAlexa.parseAmount(t);
  if(a&&a.grams===undefined&&a.count===undefined){
    // Nachgestellte Menge: „Haferflocken 50g" → „50 g Haferflocken"
    var tm=t.match(/^(.*\S)\s+(\d+(?:[.,]\d+)?)\s*(g|gr|gramm|ml|milliliter|l|liter|kg|kilo|kilogramm)\.?$/i);
    if(tm)a=NTAlexa.parseAmount(tm[2]+' '+tm[3]+' '+tm[1]);
  }
  if(!a)return null;
  var name=(a.name||'').trim(),count=a.count,grams=a.grams;
  // „eine halbe Banane": das zweite Zahlwort halbiert
  var hm=name.match(/^halbe[nrs]?\s+(.*)$/i);
  if(hm&&count>0){count=count*0.5;name=hm[1].trim();}
  var lookup=name,unsure=false,um=name.match(_PICKER_UNSURE);
  if(um){lookup=name.slice(um[0].length).trim();unsure=!(grams>0);}
  else{var cm=name.match(_PICKER_CONTAINER);if(cm)lookup=name.slice(cm[0].length).trim();}
  if(!lookup)return null;
  var pg=(NTAlexa.pieceGramsStrict&&!unsure)?NTAlexa.pieceGramsStrict(name):null;
  return {grams:grams>0?grams:0,count:count>0?count:0,name:name,lookupName:lookup,pieceG:pg||0,unsure:unsure};
}
// Gramm aus einer erkannten Menge: Gramm direkt, sonst Anzahl × Stückgewicht,
// sonst Anzahl × Portionsgedächtnis. 0 = unbekannt (dann „g?").
function _pickerQtyGrams(q,foodName){
  if(!q)return 0;
  if(q.grams>0)return Math.round(q.grams);
  if(q.count>0&&!q.unsure){
    var per=q.pieceG||((typeof recallPortion==='function')?recallPortion(foodName):0)||0;
    if(per>0)return Math.max(1,Math.round(q.count*per));
  }
  return 0;
}
// Strenger, eindeutiger Treffer für den Direkteintrag — anders als
// findInLocalDB ohne Tiebreak und ohne Präfix. Reihenfolge: eigenes
// Lebensmittel, zuletzt Getracktes (kein Rezept), eingebaute DB.
function _pickerSureHit(name){
  var f=_pickerFold(name).trim();if(!f)return null;
  var i,own=(typeof customFoods!=='undefined'?customFoods:[]).filter(function(c){return c&&c.per100&&_pickerFold(c.name).trim()===f;});
  if(own.length===1)return {name:own[0].name,emoji:own[0].emoji||emo(own[0].name),per100:own[0].per100};
  if(own.length>1)return null;
  var rec=(typeof getRecentFoods==='function'?getRecentFoods():[]).filter(function(r){return !r.isRecipe&&!r.ingredients&&r.per100&&_pickerFold(r.name).trim()===f;});
  if(rec.length)return {name:rec[0].name,emoji:rec[0].emoji||emo(rec[0].name),per100:rec[0].per100};
  var db=_pickerDbExact(name);
  if(db.length!==1)return null;
  var it=_pickerDbItem(db[0]);
  return {name:it.name,emoji:it.emoji,per100:it.per100};
}
// Vorab-Leser der Chat-Nachricht: Trägt NUR ein, wenn jeder Teil eine Menge
// und einen strengen, eindeutigen Treffer hat — sonst null, und es gilt der
// Weg von vorher (Karten, dann KI). Ein Rezept oder eigenes Lebensmittel, das
// auch passt, geht vor: dann entscheidet die Nutzerin an der Karte.
function _pickerChatPreParse(msg){
  if(window._pickerPhotoB64)return null;
  if(!(window.NTAlexa&&NTAlexa.parseAmount&&NTAlexa.splitItems))return null;
  if(/\bmit\b/i.test(msg))return null;
  var parts=NTAlexa.splitItems(msg);
  if(!parts.length)return null;
  var items=[],anyQty=false;
  for(var i=0;i<parts.length;i++){
    var q=_pickerChatQty(parts[i]);
    if(!q||q.unsure)return null;
    var own=pickerChatLocalSearch(q.lookupName).filter(function(r){return r.isRecipe||r.badge==='⭐';});
    var hit=_pickerSureHit(q.lookupName);
    if(!hit)return null;
    // Jedes Rezept und jedes eigene Lebensmittel außer dem Treffer selbst
    // (dasselbe per100-Objekt) ist ein Konkurrent — auch ein gleichnamiges:
    // Ein eigenes „Roggenbrot" darf nicht vom DB-Roggenbrot für „Brot" verdrängt werden.
    if(own.some(function(r){return r.isRecipe||r.per100!==hit.per100;}))return null;
    if(q.grams>0||q.count>0)anyQty=true;
    var amt=_pickerQtyGrams(q.grams>0||q.count>0?q:{count:1,pieceG:q.pieceG},hit.name);
    if(!(amt>0))return null;
    items.push({name:hit.name,emoji:hit.emoji,amount:amt,per100:hit.per100});
  }
  if(!anyQty&&items.length<2)return null;
  return items;
}
function pickerChatLocalSearch(q){
  var qFull=_pickerFold(q).trim();
  var qTokens=_pickerTok(q);
  if(!qTokens.length)return [];
  var results=[],seen={};
  function add(item,s){
    var k=item.name.toLowerCase();
    var prev=seen[k];
    if(prev){if(s>prev.score)prev.score=s;return;}
    var rec={score:s,item:item};seen[k]=rec;results.push(rec);
  }
  // Nur selbst gespeicherte Sachen: Rezepte + Custom Foods.
  // Cache und eingebaute DB sind ausgeschlossen (nicht „selbst gespeichert").
  recipes.forEach(function(r){
    var s=_pickerScoreName(r.name,qTokens,qFull);
    if(s>0)add({name:r.name,emoji:r.emoji||'📋',isRecipe:true,recipeId:r.id,per100:null,badge:'📋'},s+10);
  });
  customFoods.forEach(function(f){
    var s=_pickerScoreName(f.name,qTokens,qFull);
    if(s>0)add({name:f.name,emoji:f.emoji,per100:f.per100,badge:'⭐'},s+6);
  });
  // Einzelne Standard-Lebensmittel wie „Weißwein" direkt aus der eingebauten DB abfangen,
  // statt sie an die KI weiterzureichen (die bei Alkohol gern nichts Parsebares liefert, #135).
  // Mehrdeutige Synonyme („Reis": roh UND gekocht) stehen alle zur Wahl (#210).
  _pickerDbHits(q).forEach(function(d){add(_pickerDbItem(d),9);});
  // Restaurant-Ketten (#307): Kettenname in der Anfrage → ihr Sortiment zur
  // Auswahl, vor allem anderen; sonst Produkttreffer („big mac“) unter der DB.
  var ch=_pickerChainHits(q);
  if(ch.length&&ch[0].chainNamed)return ch.slice(0,40);
  ch.forEach(function(c){add(c,8);});
  results.sort(function(a,b){return b.score-a.score;});
  return results.slice(0,6).map(function(x){return x.item;});
}
// Treffer aus js/restaurants.js als Picker-Einträge: per100 + Portion in g.
// Produkte ohne Portionsgewicht fallen weg (die App rechnet in Gramm).
function _pickerChainHits(q){
  if(typeof chainSearch!=='function')return [];
  return chainSearch(window.CHAINS||[],q).filter(function(x){return x.item.g>0;}).map(function(x){
    return {name:x.item.n+' ('+x.chain.n+')',emoji:x.chain.e||'🍔',per100:chainPer100(x.item),portionG:x.item.g,badge:x.chain.n,bdgCls:'',chainNamed:x.named};
  });
}
// Gramm für einen Ketten-Treffer: Grammangabe, sonst Anzahl × Portion, sonst
// eine Portion. „6 Nuggets“ bei „Chicken McNuggets 6 Stück“ ist EINE Portion.
function _pickerChainGrams(p,q){
  if(q&&q.grams>0)return Math.round(q.grams);
  var n=(q&&q.count>0)?q.count:1;
  if(q&&q.count>0&&new RegExp('(^|\\D)'+q.count+'(\\D|$)').test(p.name))n=1;
  return Math.max(1,Math.round(n*p.portionG));
}

// Portionen eines Rezepts aus der Nachricht: „2 Chili" → 2. Eine Grammangabe
// gilt bei Rezepten nicht (sie sind je Portion gespeichert).
function _pickerQtyPortions(q){
  if(!q||!(q.count>0))return 0;
  if(q.unsure&&!/^portion/i.test(q.name))return 0;
  return q.count;
}
function pickerChatAddLocal(i){
  var p=(window._pickerLocalResults||[])[i];if(!p)return;
  var cards=document.getElementById('pickerLocalCards');if(cards)cards.remove();
  var msgs=document.getElementById('pickerChatMsgs');
  if(p.isRecipe){
    // Rezept als Ganzes in die Mahlzeit übernehmen (analog pickerAddRecent).
    var rec=recipes.find(function(r){return r.id===p.recipeId;});
    if(!rec){msgs.innerHTML+='<div class="cm a">❌ Rezept nicht mehr vorhanden.</div>';_pickerChatScrollEnd();return;}
    if(window._editEntryMode){
      var one=_pickerIngsAsOne(rec.name,rec.emoji||'📋',rec.ingredients,_pickerQtyPortions(p.qty)||1);
      if(!one){msgs.innerHTML+='<div class="cm a">❌ '+_esc(_PICKER_NO_GRAMS)+'.</div>';_pickerChatScrollEnd();showToast(_PICKER_NO_GRAMS);return;}
      _pickerAppendToEditEntry([one]);
      return;
    }
    var t=ingTotal(rec.ingredients||[]);
    var portions=_pickerQtyPortions(p.qty)||rec.portions||1;
    getDay().meals[pickerMeal].push(Object.assign({name:rec.name,emoji:rec.emoji||'📋',isRecipe:true,recipeId:rec.id,portions:portions,ingredients:JSON.parse(JSON.stringify(rec.ingredients||[]))},scaleNutrients(t,portions)));
    saveS();renderAll();closePicker();
    _pickerRateEntry(pickerMeal,getDay().meals[pickerMeal].length-1);
    showToast('📋 '+rec.name+' eingetragen');
    return;
  }
  // Menge aus der Nachricht (#210): „2 Bier" ist nicht 100 g. Ohne Stückgewicht
  // und ohne Portionsgedächtnis bleibt das Feld leer („g?") statt geraten.
  var ing={name:p.name,emoji:p.emoji,g:100,amount:100,per100:p.per100};
  if(p.portionG){ing.g=ing.amount=_pickerChainGrams(p,p.qty);}
  else if(p.qty){var ga=_pickerQtyGrams(p.qty,p.name);ing.g=ga||null;ing.amount=ga;if(!ga)ing.missingGrams=true;}
  pickerIngredients=[ing];
  if(!document.getElementById('pickerChatRecipeName').value)
    document.getElementById('pickerChatRecipeName').value=p.name.slice(0,50);
  msgs.innerHTML+='<div class="cm a">✓ '+_esc(p.name)+' übernommen.</div>';
  _pickerChatRebind();
  pickerUpdateChatTotal();
  document.getElementById('pickerChatResult').classList.remove('hidden');
  _pickerChatScrollEnd();
}

function pickerChatKiFallback(msg){
  var msgs=document.getElementById('pickerChatMsgs');
  var cards=document.getElementById('pickerLocalCards');if(cards)cards.remove();
  if(!isOnline){msgs.innerHTML+='<div class="cm a">📵 KI benötigt eine Internet-Verbindung.</div>';_pickerChatScrollEnd();document.getElementById('pickerChatSend').disabled=false;return;}
  msgs.innerHTML+='<div class="cm a">🤖 KI schätzt Nährwerte...</div>';
  _pickerChatScrollEnd();
  document.getElementById('pickerChatSend').disabled=true;
  var hasPhoto=!!window._pickerPhotoB64;
  var content=hasPhoto
    ?[{type:'image',source:{type:'base64',media_type:'image/jpeg',data:window._pickerPhotoB64}},{type:'text',text:getChatPrompt().replace('{MSG}',msg)}]
    :[{type:'text',text:getChatPrompt().replace('{MSG}',msg)}];
  var model=hasPhoto?'claude-sonnet-4-6':'claude-haiku-4-5';
  callClaude(model,content,300,
    function(text){
      /** @type {Array<{name: string, emoji?: string, g: number|null}>} */
      var raw=parseIngJSON(text);
      if(!raw.length){
        // KI lieferte kein verwertbares JSON (z.B. Ablehnung/Prosa bei Alkohol). Keine Sackgasse:
        // Die Eingabe selbst als ein Lebensmittel an die Nährwert-Suche geben (DB → OpenFoodFacts →
        // KI-Nährwerte → Schätzung). Nur bei kurzer Eingabe (sieht nach einem Einzel-Lebensmittel
        // aus); echte Mehr-Zutaten-Sätze brauchen die KI-Zerlegung und bleiben beim Hinweis (#135).
        var nq=_pickerChatQty(msg);// „150 g Bier" → Bier, 150 g (#210)
        var clean=(nq&&nq.lookupName)||_pickerStripQty(msg)||(msg||'').trim();
        if(clean&&clean.split(/\s+/).length<=4){raw=[{name:clean,g:_pickerQtyGrams(nq,clean)||null}];}
        else{msgs.innerHTML+='<div class="cm a">❌ Konnte nicht parsen. Genauer beschreiben.</div>';_pickerChatScrollEnd();document.getElementById('pickerChatSend').disabled=false;return;}
      }
      var _src=(typeof aiSourceBadgeHtml==='function')?aiSourceBadgeHtml():'';
      msgs.innerHTML+='<div class="cm a">✨ '+raw.length+' Zutaten erkannt'+_src+'. Suche Nährwerte...</div>';
      _pickerChatScrollEnd();
      lookupNutrients(raw,function(resolved){
        pickerIngredients=resolved;
        if(!document.getElementById('pickerChatRecipeName').value)
          document.getElementById('pickerChatRecipeName').value=msg.slice(0,50);
        _pickerChatRebind();
        pickerUpdateChatTotal();
        document.getElementById('pickerChatResult').classList.remove('hidden');
        _pickerChatScrollEnd();
        document.getElementById('pickerChatSend').disabled=false;
      });
    },
    function(err){msgs.innerHTML+='<div class="cm a">❌ '+pickerFriendlyAiError(err)+'</div>';_pickerChatScrollEnd();document.getElementById('pickerChatSend').disabled=false;}
  );
}

function pickerSendChat(){
  var msg=document.getElementById('pickerChatInp').value.trim();if(!msg)return;
  var msgs=document.getElementById('pickerChatMsgs');
  msgs.innerHTML+='<div class="cm u">'+_esc(msg)+'</div>';
  document.getElementById('pickerChatInp').value='';
  _pickerChatShrink();
  document.getElementById('pickerChatSend').disabled=true;
  document.getElementById('pickerChatResult').classList.add('hidden');
  _pickerChatScrollEnd();
  window._pickerChatLastMsg=msg;
  // Eindeutig lokal Erkanntes direkt als Zutatenliste, ohne KI (#210).
  var pre=_pickerChatPreParse(msg);
  if(pre){
    pickerIngredients=pre;
    if(!document.getElementById('pickerChatRecipeName').value)
      document.getElementById('pickerChatRecipeName').value=msg.slice(0,50);
    msgs.innerHTML+='<div class="cm a">📦 Lokal erkannt (ohne KI): '+pre.length+' Zutat'+(pre.length===1?'':'en')+'.'
      +'<div style="padding-top:2px;"><button type="button" data-act="NTPicker.pickerChatKiFallback" data-args="'+esc(JSON.stringify([msg]))+'" style="background:none;border:none;color:var(--mu);font-size:12px;cursor:pointer;padding:4px 0;text-decoration:underline;">🤖 Stattdessen KI fragen</button></div></div>';
    _pickerChatRebind();
    pickerUpdateChatTotal();
    document.getElementById('pickerChatResult').classList.remove('hidden');
    _pickerChatScrollEnd();
    document.getElementById('pickerChatSend').disabled=false;
    return;
  }
  // Lokale Suche zuerst (#113): Rezepte, Custom Foods, Cache, DB. KI nur als Fallback.
  // Eine erkannte Menge wird abgetrennt und in jede Karte gelegt (#210).
  var cq=(window.NTAlexa&&NTAlexa.splitItems&&NTAlexa.splitItems(msg).length===1)?_pickerChatQty(msg):null;
  if(cq&&!(cq.grams>0||cq.count>0))cq=null;
  var results=pickerChatLocalSearch(cq?cq.lookupName:msg);
  if(results.length){
    results.forEach(function(p){if(cq)p.qty=cq;});
    window._pickerLocalResults=results;
    var html='<div id="pickerLocalCards" style="display:flex;flex-direction:column;gap:6px;margin-top:4px;">';
    html+='<div class="cm a">'+(results[0].chainNamed?'🍔 '+_esc(results[0].badge)+': '+results.length+' Produkt'+(results.length===1?'':'e')+' – wähle aus:':'📚 '+results.length+' Treffer in deinem Bestand:')+'</div>';
    results.forEach(function(p,i){
      var sub=p.isRecipe?'Rezept':(p.per100?Math.round(p.per100.kcal)+' kcal · P'+(p.per100.protein||0).toFixed(1)+'g · K'+(p.per100.carbs||0).toFixed(1)+'g · F'+(p.per100.fat||0).toFixed(1)+'g /100g':'');
      if(p.portionG){
        var cg=_pickerChainGrams(p,p.qty);
        sub=cg+' g · '+Math.round((p.per100.kcal||0)*cg/100)+' kcal · P'+((p.per100.protein||0)*cg/100).toFixed(1)+'g · K'+((p.per100.carbs||0)*cg/100).toFixed(1)+'g · F'+((p.per100.fat||0)*cg/100).toFixed(1)+'g';
      }else if(p.qty){
        var qp=p.isRecipe?_pickerQtyPortions(p.qty):0,qg=p.isRecipe?0:_pickerQtyGrams(p.qty,p.name);
        var qs=p.isRecipe?(qp?qp+' Portion'+(qp===1?'':'en'):''):(qg?qg+' g':'Menge g?');
        if(qs)sub=qs+(sub?' · '+sub:'');
      }
      var badge=p.portionG?'':(p.badge||'');
      html+='<div style="background:var(--gl);border:1px solid var(--br);border-radius:10px;padding:8px 10px;display:flex;align-items:center;gap:8px;">'
        +'<div style="flex:1;min-width:0;"><div style="font-weight:600;font-size:13px;">'+esc(p.emoji||'🍽')+' '+_esc(p.name)+(badge?' <span style="font-size:11px;color:var(--mu);">'+_esc(badge)+'</span>':'')+'</div>'
        +(sub?'<div style="font-size:11px;color:var(--mu);">'+sub+'</div>':'')+'</div>'
        +'<button type="button" onclick="NTPicker.pickerChatAddLocal('+i+')" style="background:var(--g1);color:#fff;border:none;border-radius:8px;padding:5px 10px;font-size:14px;font-weight:700;cursor:pointer;flex-shrink:0;">＋</button>'
        +'</div>';
    });
    html+='<div style="text-align:center;padding-top:2px;"><button type="button" onclick="NTPicker.pickerChatKiFallback(window._pickerChatLastMsg)" style="background:none;border:none;color:var(--mu);font-size:12px;cursor:pointer;padding:4px 8px;text-decoration:underline;">🤖 Stattdessen KI fragen</button></div>';
    html+='</div>';
    msgs.innerHTML+=html;
    _pickerChatScrollEnd();
    document.getElementById('pickerChatSend').disabled=false;
    return;
  }
  if(!isOnline){msgs.innerHTML+='<div class="cm a">📵 Offline und nichts im Bestand gefunden. Verbinde dich oder lege es als „Eigenes Lebensmittel" an.</div>';_pickerChatScrollEnd();document.getElementById('pickerChatSend').disabled=false;return;}
  pickerChatKiFallback(msg);
}

// ─── PICKER: CHAT-DIKTIERFUNKTION (Web Speech API, de-DE) ───
// Nutzt die native Spracherkennung des Geräts (iOS Safari ≥14.5: webkit-Prefix,
// Android Chrome: über Google-Dienste). Kein Server-Roundtrip über den Worker.
// Bedienung (#150): kurz tippen = Start/Stopp (Auto-Stopp nach Sprechpause),
// gedrückt halten (≥350 ms) = Push-to-Talk, Aufnahme läuft bis zum Loslassen.
// Halten nutzt dieselbe Erkennungslogik wie Tippen (continuous:false) und
// verkettet nur bei Sprechpausen weitere Kurz-Sessions, solange gehalten wird.
var _pickerRec=null,_pickerRecActive=false,_pickerRecBase='',_pickerRecHold=false;
var _pickerHoldStart='',_pickerHoldDone='';
var _pickerHoldTimer=null,_pickerHoldStarted=false,PICKER_HOLD_MS=350;
function _pickerSpeechCtor(){return window.SpeechRecognition||window.webkitSpeechRecognition||null;}
function _pickerVoiceStart(hold){
  var Ctor=_pickerSpeechCtor();
  if(!Ctor)return;
  var inp=/** @type {HTMLTextAreaElement} */ (document.getElementById('pickerChatInp'));
  _pickerRecBase=inp.value.trim();
  _pickerRecHold=!!hold;
  if(_pickerRecHold){_pickerHoldStart=_pickerRecBase;_pickerHoldDone='';}
  var r=new Ctor();
  r.lang='de-DE';r.interimResults=true;r.continuous=false;r.maxAlternatives=1;
  var finals=[];
  function _finalsJoined(){
    var out=[],i;
    for(i=0;i<finals.length;i++){if(finals[i]&&finals[i].trim())out.push(finals[i].trim());}
    return out.join(' ');
  }
  function _composeVoiceText(interim){
    var session=(_finalsJoined()+(interim?' '+interim:'')).trim();
    if(!_pickerRecHold){
      if(!session&&!_pickerRecBase)return _pickerRecBase;
      return ((_pickerRecBase?_pickerRecBase+' ':'')+session).replace(/\s{2,}/g,' ').trim();
    }
    var mid=[_pickerHoldDone,session].filter(Boolean).join(' ');
    return [_pickerHoldStart,mid].filter(Boolean).join(' ').replace(/\s{2,}/g,' ').trim();
  }
  r.onresult=function(ev){
    var interim='';
    for(var i=ev.resultIndex;i<ev.results.length;i++){
      var tr=ev.results[i][0].transcript;
      if(ev.results[i].isFinal)finals[i]=tr;
      else interim+=tr;
    }
    inp.value=_composeVoiceText(interim);
    _pickerChatGrow();
  };
  r.onerror=function(ev){
    // Im Hold-Modus sind 'no-speech'/'aborted' nicht fatal — onend startet neu, solange gehalten wird.
    if(_pickerRecHold&&_pickerRecActive&&(ev.error==='no-speech'||ev.error==='aborted'))return;
    _pickerVoiceReset();
    if(ev.error==='not-allowed'||ev.error==='service-not-allowed'||ev.error==='audio-capture'){
      var msgs=document.getElementById('pickerChatMsgs');
      msgs.innerHTML+='<div class="cm a">🎙️ Kein Mikrofon-Zugriff. Bitte erlaube das Mikrofon für diese App in den Browser-/System-Einstellungen.</div>';
      _pickerChatScrollEnd();
    }
    // 'no-speech'/'aborted' bewusst still — Button-Zustand ist schon zurückgesetzt.
  };
  r.onend=function(){
    // Halten = verkettete Tap-Sessions: abgeschlossene Phrase sichern, dann neu starten.
    if(_pickerRecHold&&_pickerRecActive&&_pickerRec===r){
      var chunk=_finalsJoined();
      if(chunk)_pickerHoldDone=(_pickerHoldDone?_pickerHoldDone+' ':'')+chunk;
      finals=[];
      try{r.start();return;}catch(e){}
    }
    _pickerVoiceReset();
  };
  _pickerRec=r;_pickerRecActive=true;
  document.getElementById('pickerChatMic').classList.add('rec');
  inp.placeholder=_pickerRecHold?'🎙️ Halten & sprechen …':'🎙️ Sprich jetzt …';
  try{r.start();}catch(e){_pickerVoiceReset();}
}
function pickerVoiceToggle(){
  if(_pickerRecActive){pickerVoiceStop();return;}
  _pickerVoiceStart(false);
}
function pickerVoiceStop(){
  // Flags vor stop() löschen, damit das asynchrone onend nicht neu startet.
  _pickerRecActive=false;_pickerRecHold=false;
  if(_pickerRec){try{_pickerRec.stop();}catch(e){}}
  _pickerVoiceReset();
}
function _pickerVoiceReset(){
  _pickerRecActive=false;_pickerRec=null;_pickerRecHold=false;
  _pickerHoldStart='';_pickerHoldDone='';
  var mic=document.getElementById('pickerChatMic'),inp=/** @type {HTMLTextAreaElement} */ (document.getElementById('pickerChatInp'));
  if(mic)mic.classList.remove('rec');
  if(inp)inp.placeholder='Was hast du gegessen?';
}
// Auto-Grow fürs Chat-Eingabefeld (#149): wächst mit dem Text bis max-height
// (120px ≈ 5 Zeilen), danach scrollt es intern. +4px = 2×2px Rahmen (border-box).
function _pickerChatGrow(){
  var inp=document.getElementById('pickerChatInp');if(!inp)return;
  inp.style.height='auto';
  inp.style.height=Math.min(inp.scrollHeight+4,120)+'px';
}
function _pickerChatShrink(){var inp=document.getElementById('pickerChatInp');if(inp)inp.style.height='';}
// Neueste Nachricht direkt über die feste Eingabe holen (#181). Gescrollt wird
// das Modal: #pickerChatMsgs hat kein eigenes overflow. Aufruf NACH dem Einblenden.
// Nur im Chat-Tab: eine späte KI-Antwort darf einen anderen Tab nicht ans Ende werfen.
function _pickerChatScrollEnd(){
  var pn=document.getElementById('ppanel-chat');if(!pn||!pn.classList.contains('act'))return;
  var m=document.querySelector('#pickerOv .mod');if(m)m.scrollTop=m.scrollHeight;
}
(function(){
  var inp=document.getElementById('pickerChatInp');
  if(inp)inp.addEventListener('input',_pickerChatGrow);
  var m=document.getElementById('pickerChatMic');
  if(!m)return;
  // Ohne Web-Speech-Unterstützung (z.B. Firefox) Button ausblenden.
  if(!_pickerSpeechCtor()){m.style.display='none';return;}
  m.addEventListener('contextmenu',function(ev){ev.preventDefault();});
  m.addEventListener('pointerdown',function(ev){
    ev.preventDefault();
    if(ev.pointerId!==undefined){try{m.setPointerCapture(ev.pointerId);}catch(e){}}
    _pickerHoldStarted=false;
    clearTimeout(_pickerHoldTimer);
    _pickerHoldTimer=setTimeout(function(){
      _pickerHoldStarted=true;
      if(!_pickerRecActive){
        _pickerVoiceStart(true);
        if(navigator.vibrate){try{navigator.vibrate(20);}catch(e){}}
      }
    },PICKER_HOLD_MS);
  });
  function micUp(ev){
    clearTimeout(_pickerHoldTimer);
    if(_pickerHoldStarted){_pickerHoldStarted=false;pickerVoiceStop();}
    else if(ev.type==='pointerup'){pickerVoiceToggle();}
  }
  m.addEventListener('pointerup',micUp);
  m.addEventListener('pointercancel',micUp);
  // Tastatur/Screenreader: Enter/Leertaste toggelt wie ein kurzer Tap.
  m.addEventListener('keydown',function(ev){
    if(ev.repeat)return;
    if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();pickerVoiceToggle();}
  });
})();

function pickerUpdateChatTotal(){pickerUpdateTotal('Chat');}

function pickerChatAdd(saveAsRecipe){_pickerAdd('💬','pickerChatRecipeName','pickerChatPortions','Chat-Eintrag',saveAsRecipe,true);}

// ─── REZEPT-EXTRAKTION AUS EINER BELIEBIGEN REZEPT-SEITE ───
// Reihenfolge, absteigend nach Verlässlichkeit:
//   1. schema.org/Recipe als JSON-LD — das liefern praktisch alle Rezept-Seiten
//      und Blog-Plugins (Chefkoch, Lecker, Kochbar, Essen & Trinken, WPRM,
//      AllRecipes …). Exakt, sofort, ohne KI-Aufruf.
//   2. Microdata (itemprop="recipeIngredient") — ältere Seiten.
//   3. KI auf einem Textausschnitt rund um „Zutaten" — nur wenn 1+2 nichts
//      hergeben. Der alte Weg „erste 3000 Zeichen der Seite" traf bei vielen
//      Seiten nur Navigation und Cookie-Banner.
function _htmlDecode(s){
  s=String(s==null?'':s);
  if(s.indexOf('&')<0)return s;
  var ta=document.createElement('textarea');
  ta.innerHTML=s;// nur .value wird gelesen, nichts wird ins Dokument gehängt
  return ta.value;
}
function _stripTags(s){return _htmlDecode(String(s==null?'':s).replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();}

// Einheiten → Gramm/Milliliter für die Nährwert-Schätzung. Küchenmaße sind
// Näherungen (1 EL ≈ 15 g), das reicht für eine Kalorienschätzung und ist
// allemal besser als das alte „alles 100 g".
var _ING_UNIT_G={
  g:1,gramm:1,gramme:1,gr:1,kg:1000,kilo:1000,kilogramm:1000,
  ml:1,milliliter:1,cl:10,dl:100,l:1000,liter:1000,
  el:15,essloeffel:15,tbsp:15,tl:5,teeloeffel:5,tsp:5,
  msp:0.5,messerspitze:0.5,prise:1,priese:1,spritzer:3,schuss:10,
  tasse:150,cup:150,becher:200,glas:200,handvoll:30,
  bund:40,zehe:5,scheibe:25,scheiben:25,blatt:2,blaetter:2,zweig:5,stange:80,
  kugel:50,knolle:60,kopf:300,wuerfel:4,
  stueck:100,stk:100,st:100,pc:100,
  dose:400,dosen:400,packung:250,paeckchen:10,pck:250,pkg:250,pack:250,beutel:100,tuete:100
};
var _ING_FRAC={'½':0.5,'⅓':1/3,'⅔':2/3,'¼':0.25,'¾':0.75,'⅕':0.2,'⅖':0.4,'⅗':0.6,'⅘':0.8,'⅙':1/6,'⅚':5/6,'⅛':0.125,'⅜':0.375,'⅝':0.625,'⅞':0.875};
function _ingNormU(s){
  return String(s||'').toLowerCase()
    .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
    .replace(/[^a-z]/g,'');
}
function _ingNum(tok){
  tok=String(tok||'').trim();
  if(_ING_FRAC[tok]!==undefined)return _ING_FRAC[tok];
  // „1/2" und „1⁄2" (U+2044, Bruchstrich). Nenner 0 → keine Menge statt Infinity.
  var m=tok.match(/^(\d+)\s*[\/⁄]\s*(\d+)$/);
  if(m){var d=parseFloat(m[2]);return d?parseFloat(m[1])/d:null;}
  var v=parseFloat(tok.replace(',','.'));
  return isFinite(v)?v:null;
}
// Unbestimmte Mengenwörter am Zeilenanfang. Sie sind nie Teil des
// Lebensmittelnamens, landeten aber ungefiltert als „etwas Kurkumapulver" auf
// dem Einkaufszettel. „ca. 200 g Mehl" scheiterte zusätzlich an der
// Zahlenerkennung, weil die Zeile nicht mit einer Ziffer begann — deshalb
// fliegen sie raus, BEVOR Menge und Einheit gelesen werden.
// „etwas" steht vor „etwa", sonst würde die kürzere Alternative zu früh greifen.
var _ING_VAGUE=/^(?:etwas|ein\s+wenig|ein\s+bisschen|wenig|reichlich|einige[rsn]?|ein\s+paar|eventuell|evtl\.?|ggf\.?|circa|ca\.?|etwa|knapp|jeweils|je)\s+/i;
function _stripVague(s){
  var out=s,prev;
  for(var i=0;i<3;i++){prev=out;out=out.replace(_ING_VAGUE,'').trim();if(out===prev)break;}
  return out||s;
}

// Klammerzusätze entfernen – tiefenbewusst. Das alte /\([^)]*\)/g scheiterte an
// verschachtelten Klammern („Öl (Erdnussöl (raffiniert) oder Pflanzenöl )"):
// es schloss auf der INNEREN Klammer und ließ „oder Pflanzenöl )" stehen, was
// als Artikel „Pflanzenöl )" auf dem Zettel landete. Zählt jetzt die Tiefe und
// verwirft auch verwaiste Klammern.
function _stripBrackets(s){
  var out='',depth=0,ch;
  for(var i=0;i<s.length;i++){
    ch=s.charAt(i);
    if(ch==='('||ch==='['){depth++;continue;}
    if(ch===')'||ch===']'){if(depth>0)depth--;continue;}
    if(!depth)out+=ch;
  }
  return out;
}

// „250 g Mehl", „2 EL Olivenöl", „1 Zwiebel", „1 ½ TL Salz", „1/2 TL Salz", „2-3 Tomaten",
// „Salz und Pfeffer" → {name, g, raw} – Menge immer in Gramm.
function _parseIngLine(raw){
  var s=_stripTags(raw).replace(/ /g,' ').trim();
  if(!s)return null;
  var rest=_stripVague(s),v=null,unit='';
  // Menge: Bruch („1/2"), Dezimal („1,5"), Unicode-Bruch („½"), optional
  // gemischt („1 1/2", „1 ½"), dann Bereich („2-3", „1 1/2-2" → die untere
  // Grenze, damit nichts zu großzügig gerechnet wird). Der Bruch steht vorn,
  // sonst griffe „\d+" schon bei „1/2" und ließe „/2 TL Salz" als Namen stehen.
  // Der gemischte Bruch kommt VOR dem Bereich, sonst bliebe bei „1 1/2-2 EL"
  // der Rest „-2 EL" stehen.
  var m=rest.match(/^(\d+\s*[\/⁄]\s*\d+|\d+(?:[.,]\d+)?|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])\s*/);
  if(m){
    v=_ingNum(m[1]);
    rest=rest.slice(m[0].length);
    var f=rest.match(/^([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|\d+\s*[\/⁄]\s*\d+)\s*/);
    if(f&&v!==null){var fv=_ingNum(f[1]);rest=rest.slice(f[0].length);v=fv!==null?v+fv:null;}
    // Bereich: obere Grenze als vollständige Mengenangabe verwerfen
    var r=rest.match(/^[-–bis]+\s*(?:\d+\s*[\/⁄]\s*\d+|\d+(?:[.,]\d+)?(?:\s*(?:\d+\s*[\/⁄]\s*\d+|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]))?|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])\s*/i);
    if(r)rest=rest.slice(r[0].length);
  }
  // Einheit: nur übernehmen, wenn danach noch ein Name steht — sonst ist
  // „1 Dose" der Artikel selbst.
  var um=rest.match(/^([A-Za-zÄÖÜäöüß.]+)\.?\s+(.*)$/);
  if(um&&_ING_UNIT_G[_ingNormU(um[1])]!==undefined){unit=um[1].replace(/\.$/,'');rest=um[2];}
  // Klammerzusätze und Zubereitungs-Nachsatz raus – „Tomaten, gehackt" findet
  // die Lebensmittel-DB sonst nicht.
  var clean=_stripBrackets(rest);
  var name=clean.split(',')[0].replace(/\s+/g,' ').trim();
  name=_stripVague(name).replace(/^(von|der|die|das|frische[rns]?|frisch)\s+/i,'').trim();
  // Fallback-Kette: erst der Rest ohne Klammern, dann die Rohzeile – aber nie
  // ein Name, der nur aus einem Klammerzusatz bestand.
  if(!name)name=clean.replace(/\s+/g,' ').trim()||_stripBrackets(s).replace(/\s+/g,' ').trim()||s;
  var uk=_ingNormU(unit);
  var factor=uk?_ING_UNIT_G[uk]:null;
  var g=null;
  if(v!==null&&factor)g=Math.round(v*factor);
  else if(v!==null)g=Math.round(Math.min(v,20)*100);// Stückzahl ohne Einheit
  if(g!==null&&g<=0)g=null;
  // Küchenmaße werden bewusst NUR umgerechnet, nicht weitergereicht: im
  // Supermarkt hilft „30 g Mehl" mehr als „2 EL Mehl". Zutatenliste und
  // Einkaufszettel rechnen deshalb durchgängig in Gramm.
  return {name:name,g:g,raw:s};
}

// ── 1) JSON-LD ──
function _ldPickRecipe(node,depth){
  if(!node||depth>6)return null;
  var i,r;
  if(Array.isArray(node)){
    for(i=0;i<node.length;i++){r=_ldPickRecipe(node[i],depth+1);if(r)return r;}
    return null;
  }
  if(typeof node!=='object')return null;
  var t=node['@type'];
  var types=Array.isArray(t)?t:[t];
  for(i=0;i<types.length;i++)if(String(types[i]||'').toLowerCase()==='recipe')return node;
  var nests=['@graph','mainEntity','mainEntityOfPage','itemListElement','hasPart'];
  for(i=0;i<nests.length;i++){
    if(node[nests[i]]){r=_ldPickRecipe(node[nests[i]],depth+1);if(r)return r;}
  }
  return null;
}
function _ldText(v,depth){
  depth=depth||0;
  if(v==null||depth>4)return '';
  if(typeof v==='string')return _stripTags(v);
  if(typeof v==='number')return String(v);
  if(Array.isArray(v))return v.map(function(x){return _ldText(x,depth+1);}).filter(Boolean).join('\n');
  if(typeof v==='object'){
    if(v.itemListElement)return _ldText(v.itemListElement,depth+1);
    return _ldText(v.text||v.name||v['@value']||'',depth+1);
  }
  return '';
}
function _recipeFromJsonLd(html){
  var re=/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  var m,rec=null;
  while((m=re.exec(html))&&!rec){
    var body=m[1].replace(/^\s*<!--/,'').replace(/-->\s*$/,'')
                 .replace(/^\s*\/\*\s*<!\[CDATA\[\s*\*\//,'').replace(/\/\*\s*\]\]>\s*\*\/\s*$/,'')
                 .replace(/^\s*<!\[CDATA\[/,'').replace(/\]\]>\s*$/,'');
    var data=null;
    try{data=JSON.parse(body);}catch(e){continue;}
    rec=_ldPickRecipe(data,0);
  }
  if(!rec)return null;
  var ingRaw=rec.recipeIngredient||rec.ingredients;
  if(typeof ingRaw==='string')ingRaw=ingRaw.split(/\r?\n/);
  if(!Array.isArray(ingRaw)||!ingRaw.length)return null;
  var ings=[];
  ingRaw.forEach(function(line){
    var p=_parseIngLine(typeof line==='string'?line:_ldText(line));
    if(p&&p.name)ings.push(p);
  });
  if(!ings.length)return null;
  return {
    name:_stripTags(_ldText(rec.name))||'',
    ings:ings,
    instructions:_ldText(rec.recipeInstructions),
    yield:_stripTags(_ldText(rec.recipeYield)),
    src:'Rezeptdaten der Seite'
  };
}

// ── 2) Microdata ──
function _recipeFromMicrodata(html){
  var out=[],m;
  var re=/itemprop\s*=\s*["'](?:recipeIngredient|ingredients)["'][^>]*>([\s\S]{0,300}?)<\//gi;
  while((m=re.exec(html))){
    var p=_parseIngLine(m[1]);
    if(p&&p.name)out.push(p);
  }
  if(out.length<2)return null;
  var nm=html.match(/itemprop\s*=\s*["']name["'][^>]*>([\s\S]{0,200}?)<\//i);
  return {name:nm?_stripTags(nm[1]):'',ings:out,instructions:'',yield:'',src:'Rezeptdaten der Seite'};
}

// ── 3) Textausschnitt für die KI ──
function _recipeTextWindow(html){
  var text=String(html||'')
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<(nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi,' ')
    .replace(/<[^>]+>/g,' ');
  text=_htmlDecode(text).replace(/\s+/g,' ').trim();
  var i=text.search(/\bZutaten\b|\bIngredients\b|\bIngr[ée]dients\b|\bIngredienti\b/i);
  if(i>400)return text.slice(i-400,i+3600);
  return text.slice(0,4000);
}

function _recipeFromHtml(html){
  var r=null;
  try{r=_recipeFromJsonLd(html);}catch(e){r=null;}
  if(!r){try{r=_recipeFromMicrodata(html);}catch(e2){r=null;}}
  return r;
}

// ─── PICKER: LINK/URL TAB ───
function pickerLinkDetect(){
  var raw=document.getElementById('pickerLinkInput').value;
  var info=document.getElementById('pickerLinkUrlInfo');
  var btn=document.getElementById('pickerLinkImportBtn');
  // Zuerst prüfen, ob es eine NutriTrack-Sendung ist (geteilte Mahlzeit, Rezept,
  // Tag oder Zeitraum). Die sieht wie ein normaler Link aus, gehört aber nicht
  // durch den Rezept-Abruf, sondern in die Import-Vorschau.
  if(typeof shareInputKind==='function'&&shareInputKind(raw)){
    info.innerHTML='<div style="background:#f0faf4;border:1.5px solid var(--g2);border-radius:10px;padding:6px 10px;font-size:11px;color:var(--g1);font-weight:700;">'
      +'✓ NutriTrack-Sendung erkannt – geteilte Mahlzeit, Rezept, Tag oder Zeitraum</div>';
    btn.disabled=false;btn.style.opacity='1';btn.textContent='📥 Sendung öffnen';
    return;
  }
  btn.textContent='🔗 Rezept laden';
  var url=recipeImportExtractUrl(raw);
  if(url){
    info.innerHTML='<div style="background:#f0faf4;border:1.5px solid var(--g2);border-radius:10px;padding:6px 10px;font-size:11px;word-break:break-all;">'
      +'<span style="color:var(--g2);font-weight:800;">✓ URL erkannt: </span><span style="color:#555;">'+_esc(url)+'</span></div>';
    btn.disabled=false;btn.style.opacity='1';
  } else if(raw.trim()){
    info.innerHTML='<div style="background:#fff8e1;border:1.5px solid #f9a825;border-radius:10px;padding:6px 10px;font-size:11px;color:#888;">Weder Rezept-Link noch NutriTrack-Sendung erkannt – bitte Link oder Code einfügen.</div>';
    btn.disabled=true;btn.style.opacity='.4';
  } else {
    info.innerHTML='';btn.disabled=true;btn.style.opacity='.4';
  }
}

// Übersetzt eine Absage des /fetch-Proxys in Klartext. Vorher endete jede
// Absage — Bot-Wall, Timeout, gesperrter Host — im selben nichtssagenden
// „URL konnte nicht geladen werden".
function _linkFetchErr(status,body){
  var code='';
  try{var d=JSON.parse(body);code=(d&&d.error&&d.error.code)||'';}catch(e){}
  if(code==='upstream_blocked')
    return 'Die Seite blockiert den Abruf – dort öffnen, Zutaten kopieren und über „Eigenes" eintragen';
  if(code==='fetch_failed'||status===504)return 'Die Seite antwortet nicht – bitte später erneut versuchen';
  if(code==='host_not_allowed'||code==='bad_scheme')return 'Diese Adresse ist nicht erlaubt';
  if(code==='bad_url')return 'Die Adresse konnte nicht gelesen werden';
  return 'URL konnte nicht geladen werden (HTTP '+status+')';
}

// Stufe 3 (KI) darf nur auf echten Seiteninhalt los. Eine Bot-Wall oder ein
// Consent-Layer ist kurz und nennt keine Zutatenüberschrift — dort würde die KI
// nur Tokens auf Navigationstext verbrennen und mit „nicht erkannt" enden.
function _pageHasContent(html){
  var t=_recipeTextWindow(html);
  if(/\bZutaten\b|\bIngredients\b|\bIngr[\u00e9e]dients\b|\bIngredienti\b/i.test(t))return true;
  return t.length>=1200;
}

function pickerLinkImport(){
  var raw=document.getElementById('pickerLinkInput').value;
  // NutriTrack-Sendung: Picker schließen und in die Import-Vorschau abbiegen.
  // Der Rezept-Abruf würde hier nur auf die eigene PWA-Seite losgehen.
  if(typeof shareInputKind==='function'&&shareInputKind(raw)){
    closePicker();
    startShareImport(raw,200);
    return;
  }
  var url=recipeImportExtractUrl(raw);
  if(!url)return;
  if(typeof isOnline!=='undefined'&&!isOnline){showToast('Internet benötigt');return;}
  var btn=document.getElementById('pickerLinkImportBtn');
  btn.disabled=true;btn.textContent='⏳ Laden...';btn.style.opacity='1';
  var fail=function(msg){
    showToast(msg);
    btn.disabled=false;btn.textContent='🔗 Rezept laden';btn.style.opacity='1';
  };
  // Nur Abruf-Fehler tragen eine fertige Klartext-Meldung (_toast); alles andere
  // fällt im catch auf die allgemeine Meldung zurück.
  var netErr=function(msg){var e=/** @type {Error & {_toast?: string}} */ (new Error(msg));e._toast=msg;return e;};
  // 15 s Client-Timeout – der Worker bricht selbst nach 12 s ab, und träge
  // Portale brauchen mehr als die alten 9 s.
  fetchT(urlProxyUrl(url),{headers:{'x-app-proxy-secret':getProxySecret()}},15000)
    .then(function(r){
      if(r.status===401)throw netErr('Proxy-Passwort fehlt oder ist falsch (Mehr → 🤖 KI)');
      return r.text().then(function(txt){
        if(!r.ok)throw netErr(_linkFetchErr(r.status,txt));
        return txt;
      });
    })
    .then(function(html){
      // Erst die strukturierten Rezeptdaten der Seite versuchen – die kennen
      // fast alle Rezept-Portale und Blogs, unabhängig vom Layout.
      var rec=_recipeFromHtml(html);
      if(rec&&rec.ings.length>=2){_pickerLinkFill(rec,btn);return;}
      // Bot-Wall/Consent-Layer statt Seite: gar nicht erst die KI bemühen.
      if(!_pageHasContent(html)){
        fail('Die Seite hat keinen Rezeptinhalt geliefert (vermutlich Bot-Schutz)');
        return;
      }
      // Fallback: KI liest den Textausschnitt rund um „Zutaten".
      if(!canUseAi()){
        fail('Seite liefert keine Rezeptdaten – dafür wird die KI benötigt');
        return;
      }
      btn.textContent='🤖 KI liest die Seite...';
      callClaude('claude-haiku-4-5',[{type:'text',text:
        'Extrahiere das Rezept aus diesem Text und gib NUR gültiges JSON zurück:\n'
        +'{"name":"Rezeptname","zutaten":[{"name":"Zutat","menge":"250 g"}],"portionen":"4","anleitung":"Zubereitungsschritte (optional)"}\n'
        +'Übernimm die Mengenangabe wörtlich inklusive Einheit (z. B. "2 EL", "1 Dose", "500 g"). '
        +'Ohne Mengenangabe lässt du "menge" leer.\n'
        +'Text: '+_recipeTextWindow(html)}],900,
        function(resp){
          var d=null;
          try{
            var a=resp.indexOf('{'),z=resp.lastIndexOf('}');
            d=JSON.parse(resp.slice(a,z+1));
          }catch(e){d=null;}
          if(!d||!d.zutaten||!d.zutaten.length){fail('Rezept konnte nicht erkannt werden');return;}
          var ings=[];
          d.zutaten.forEach(function(z){
            var line=String((z.menge||'')+' '+(z.name||'')).trim();
            var pz=_parseIngLine(line);
            if(pz&&pz.name)ings.push(pz);
          });
          if(!ings.length){fail('Rezept konnte nicht erkannt werden');return;}
          _pickerLinkFill({name:d.name||'',ings:ings,instructions:d.anleitung||'',
                           yield:d.portionen?String(d.portionen):'',src:'KI-Auswertung'},btn);
        },
        function(){fail('Import fehlgeschlagen');}
      );
    })
    .catch(function(e){
      fail((e&&e._toast)||'URL konnte nicht geladen werden');
    });
}

// Gemeinsamer Abschluss für beide Extraktionswege: Nährwerte nachschlagen,
// Liste rendern, Ziel-Auswahl freischalten.
function _pickerLinkFill(rec,btn){
  window._pickerLinkInstructions=rec.instructions||'';
  var rawItems=rec.ings.map(function(x){
    return {name:x.name,g:x.g,emoji:emo(x.name)};
  });
  lookupNutrients(rawItems,function(ings){
    pickerIngredients=ings;
    document.getElementById('pickerLinkRecipeName').value=rec.name||'';
    var hint=document.getElementById('pickerLinkSrcHint');
    if(hint){
      var y=rec.yield?(' · Seite nennt '+rec.yield):'';
      hint.innerHTML='<div style="font-size:11px;color:var(--mu);margin:2px 2px 6px;">Quelle: '+_esc(rec.src||'')+_esc(y)+'. Die Mengen gelten für das ganze Rezept.</div>';
    }
    function rebindLink(){
      pickerRenderIngList('pickerLinkIngList',pickerIngredients,
        function(i,v){pickerIngredients[i].amount=parseFloat(v)||0;pickerIngredients[i].missingGrams=false;pickerUpdateLinkTotal();},
        function(i){pickerIngredients.splice(i,1);rebindLink();pickerUpdateLinkTotal();}
      );
    }
    rebindLink();
    pickerUpdateLinkTotal();
    _pickerLinkResetShopBtn();
    document.getElementById('pickerLinkResult').classList.remove('hidden');
    _pickerRecipeOnlyUI();
    if(btn){btn.disabled=false;btn.textContent='🔗 Neu laden';btn.style.opacity='1';}
  });
}

function pickerUpdateLinkTotal(){pickerUpdateTotal('Link');}

function pickerLinkAdd(saveAsRecipe){
  var rec=_pickerAdd('🔗','pickerLinkRecipeName','pickerLinkPortions','Rezept',saveAsRecipe,true);
  // Kochanleitung auf das tatsächlich erstellte Rezept übertragen (statt blind recipes[0])
  if(saveAsRecipe&&window._pickerLinkInstructions&&rec){
    rec.instructions=window._pickerLinkInstructions;
    saveX();
  }
  window._pickerLinkInstructions='';
}

// ─── PICKER: LINK → EINKAUFSZETTEL ───
// Zweiter möglicher Zielort für ein importiertes Rezept. Bewusst ohne Schließen
// des Pickers: wer die Zutaten einkauft, will das Rezept oft zusätzlich als
// Rezept speichern oder gleich eintragen.
function _pickerLinkResetShopBtn(){
  var btn=document.getElementById('pickerLinkShopBtn');
  if(btn){btn.disabled=false;btn.style.opacity='1';btn.textContent='🛒 Auf den Einkaufszettel';}
  var open=document.getElementById('pickerLinkShopOpen');
  if(open)open.classList.add('hidden');
}
function pickerLinkToShop(){
  if(!window.NTShop){showToast('Einkaufszettel nicht verfügbar');return;}
  if(!pickerIngredients.length){showToast('Keine Zutaten');return;}
  var name=document.getElementById('pickerLinkRecipeName').value.trim()||'Import-Rezept';
  var p=parseFloat(document.getElementById('pickerLinkPortions').value)||1;
  var items=pickerIngredients.map(function(f){
    // Immer Gramm – dieselbe Zahl, die auch in der Zutatenliste steht.
    return {name:f.name,q:f.amount?Math.round(f.amount*p)+' g':'',emoji:f.emoji||''};
  });
  var r=NTShop.addIngredients(items,name);
  if(!r.total){showToast('Nichts zu übernehmen');return;}
  var btn=document.getElementById('pickerLinkShopBtn');
  if(btn){btn.disabled=true;btn.style.opacity='.5';btn.textContent='✓ Auf dem Zettel';}
  var open=document.getElementById('pickerLinkShopOpen');
  if(open)open.classList.remove('hidden');
  showToast(r.merged
    ? (r.total+' Zutaten auf dem Zettel – '+r.merged+' war'+(r.merged===1?'':'en')+' schon drauf')
    : (r.total+' Zutaten auf dem Einkaufszettel ✓'));
}
function pickerLinkOpenShop(){
  closePicker();
  if(window.NTShop)NTShop.open();
}

// ─── PICKER: EIGENES TAB (inkl. ehem. Quick: Checkbox „Nur einmal eintragen") ───
function pickerSaveOwn(){
  var name=document.getElementById('ownName').value.trim();if(!name){showToast('Name eingeben');return;}
  var emoji=document.getElementById('ownEmoji').value.trim()||emo(name);
  var kcal=parseFloat(document.getElementById('ownKcal').value)||0;
  var p=parseFloat(document.getElementById('ownProtein').value)||0;
  var c=parseFloat(document.getElementById('ownCarbs').value)||0;
  var f=parseFloat(document.getElementById('ownFat').value)||0;
  var onceEl=document.getElementById('ownOnce');
  if(onceEl&&onceEl.checked){
    // Einmalig eintragen: Werte gelten als Gesamtwerte der Portion (nicht pro 100 g).
    if(!kcal){showToast('Kalorien eingeben');return;}
    if(window._editEntryMode){_pickerAppendToEditEntry([{name:name,emoji:emoji,amount:100,per100:{kcal:kcal,protein:p,carbs:c,fat:f,sugar:0,fiber:0,salt:0}}]);return;}
    getDay().meals[pickerMeal].push({name:name,emoji:emoji,amount:100,per100:{kcal:kcal,protein:p,carbs:c,fat:f,sugar:0,fiber:0,salt:0},kcal:kcal,protein:p,carbs:c,fat:f,sugar:0,fiber:0,salt:0});
    saveS();renderAll();closePicker();
    showToast(emoji+' '+name+' eingetragen');
    return;
  }
  var food={name:name,emoji:emoji,per100:{kcal:kcal,protein:p,carbs:c,fat:f,sugar:0,fiber:0,salt:0}};
  customFoods.unshift(food);saveX();
  ['ownName','ownEmoji','ownKcal','ownProtein','ownCarbs','ownFat'].forEach(function(id){document.getElementById(id).value='';});
  showToast(emoji+' '+name+' gespeichert');
  pickerSetTab('search');pickerLoadDefaultResults();
}

// ─── PICKER: universal ingredient list renderer ───
function pickerRenderIngList(elId,ings,onAmtChange,onDel){
  var el=document.getElementById(elId);if(!el)return;
  el.innerHTML=(ings||[]).map(function(ing,i){
    var missingG=ing.missingGrams||(ing.amount===null||ing.amount===undefined);
    var amtVal=missingG?'':(ing.amount||'');
    var borderStyle=missingG?'border-color:var(--or);':'';
    var warn=missingG?'<span style="font-size:11px;color:var(--or);">⚠️</span>':'';
    var ampelDot=(S.pregWarn&&ing.pregAmpel?pregAmpelDot(ing.pregAmpel.ampel):'')+(S.nursWarn&&ing.nursAmpel?nursAmpelDot(ing.nursAmpel.ampel):'')+(S.dietWarn&&ing.dietAmpel?dietAmpelDot(ing.dietAmpel.ampel):'');
    var nid=elId+'-n-'+i;
    return'<div class="ing-wrap">'
      +'<div class="ing-item">'
      +'<div class="ing-e" onclick="ingToggle(event,\''+nid+'\')">'+esc(ing.emoji||'🍽')+'</div>'
      +'<div class="ing-n" onclick="ingToggle(event,\''+nid+'\')">'+_esc(ing.name)+ampelDot+'</div>'
      +'<input type="number" class="ing-amt" value="'+amtVal+'" min="1" placeholder="g?" style="'+borderStyle+'" data-i="'+i+'" onchange="NTPicker.pickerIngAmtChange(\''+elId+'\','+i+',this.value)">'
      +'<div class="ing-u">g</div>'
      +warn
      +'<button type="button" class="ing-del" onclick="NTPicker.pickerIngDel(\''+elId+'\','+i+')">✕</button>'
      +'</div>'
      +'<div class="ing-details" id="'+nid+'">'+ingNutrHtml(ing)+'</div>'
      +'</div>';
  }).join('');
  // Store callbacks
  window['_pickerIngCb_'+elId]={onAmtChange:onAmtChange,onDel:onDel};
}
function pickerIngAmtChange(elId,i,v){var cb=window['_pickerIngCb_'+elId];if(cb)cb.onAmtChange(i,v);}
function pickerIngDel(elId,i){var cb=window['_pickerIngCb_'+elId];if(cb)cb.onDel(i);}

function pickerAddRecent(i){
  var item=(window._recentItems||[])[i];if(!item)return;
  if(window._editEntryMode){
    var it;
    if(item.isRecipe||item.ingredients){
      // Auch Chat-/Foto-Einträge ohne Rezept: die Zutaten des Eintrags zählen.
      it=_pickerIngsAsOne(item.name,item.emoji||'📋',item.ingredients,item.portions||1);
      if(!it){showToast(_PICKER_NO_GRAMS);return;}
    } else {
      it={name:item.name,emoji:item.emoji,amount:recallPortion(item.name)||item.amount||100,per100:item.per100};
    }
    _pickerAppendToEditEntry([it]);
    return;
  }
  if(item.isRecipe||item.ingredients){
    var t=ingTotal(item.ingredients||[]);
    var portions=item.portions||1;
    getDay().meals[pickerMeal].push(Object.assign({name:item.name,emoji:item.emoji,isRecipe:true,recipeId:item.recipeId||null,portions:portions,ingredients:JSON.parse(JSON.stringify(item.ingredients||[]))},scaleNutrients(t,portions)));
  } else {
    var recalled=recallPortion(item.name)||item.amount||100;
    var r=recalled/100;
    getDay().meals[pickerMeal].push({name:item.name,emoji:item.emoji,amount:recalled,per100:item.per100,kcal:(item.per100.kcal||0)*r,protein:(item.per100.protein||0)*r,carbs:(item.per100.carbs||0)*r,fat:(item.per100.fat||0)*r,sugar:(item.per100.sugar||0)*r,fiber:(item.per100.fiber||0)*r,salt:(item.per100.salt||0)*r});
  }
  saveS();renderAll();closePicker();
  _pickerRateEntry(pickerMeal,getDay().meals[pickerMeal].length-1);
  showToast((item.emoji||'🍽')+' '+item.name+' hinzugefügt');
}

// ════════════════════════════════════════
// SECTION: AUS INDEX.HTML (#257)
// ════════════════════════════════════════
// Diese vier ruft nur der Picker; sie standen bis v0.303 unveraendert in
// index.html. Global bleiben sie trotzdem (klassisches Script).

// ── Animation beim Hinzufügen ──
function animateAdd(meal){
  var sub=document.getElementById('sub-'+meal);
  if(sub){sub.style.animation='none';sub.offsetHeight;sub.style.animation='addPop .3s ease';}
  var card=sub&&sub.closest('.mc');
  if(card){card.style.boxShadow='0 0 0 3px var(--g2)';setTimeout(function(){card.style.boxShadow='';},600);}
}

// ── Datenqualitäts-Warnung ──
function checkDataQuality(food){
  if(!food||!food.per100)return;
  var p=food.per100;
  var missing=[];
  if(!p.sugar&&p.sugar!==0)missing.push('Zucker');
  if(!p.fiber&&p.fiber!==0)missing.push('Ballaststoffe');
  if(!p.salt&&p.salt!==0)missing.push('Salz');
  if(missing.length>=2){
    showToast('⚠️ Unvollständige Daten: '+missing.join(', ')+' fehlen',3000);
  }
}

// ── KI-Plausibilitäts-Check für Gramm-Schätzungen ──
function checkGramPlausibility(ings){
  var warnings=[];
  ings.forEach(function(ing){
    var g=ing.amount||ing.g||0;
    if(g>1000)warnings.push(ing.name+': '+g+'g scheint viel');
    if(g>0&&g<2)warnings.push(ing.name+': '+g+'g scheint wenig');
  });
  if(warnings.length)showToast('⚠️ Prüfe Mengen: '+warnings[0],4000);
}

// ── Tab „Zuletzt“ ──
function renderRecentList(){
  var el=document.getElementById('recentList');if(!el)return;
  var items=getRecentFoods();
  if(!items.length){el.innerHTML='<div style="text-align:center;color:var(--mu);padding:20px;font-size:13px;">Noch keine Einträge</div>';return;}
  el.innerHTML=items.map(function(item,i){
    return'<div class="ri" onclick="NTPicker.pickerAddRecent('+i+')">'
      +'<div class="ri-e">'+esc(item.emoji||'🍽')+'</div>'
      +'<div style="flex:1;min-width:0;"><div class="ri-n">'+esc(item.name)+'</div>'
      +(item.per100?'<div class="ri-d">'+Math.round(item.per100.kcal)+' kcal/100g</div>':'<div class="ri-d">'+(item.kcal?Math.round(item.kcal)+' kcal':'')+'</div>')
      +'</div>'
      +'<div style="font-size:18px;color:var(--g2);font-weight:900;">＋</div>'
      +'</div>';
  }).join('');
  window._recentItems=items;
}

// ── Aus index.html (#301): nur der Picker ruft sie ──
// Unveraendert verschoben; foodCache, recipes, customFoods, DB, MEALS und
// PROJECT_WORKER_BASE bleiben Globals von index.html.
function urlProxyUrl(u){return PROJECT_WORKER_BASE+'/fetch?u='+encodeURIComponent(u);}
function cacheFood(f){if(!f||!f.name)return;if(!f.per100||!_hasNutrients(f.per100))return;var k=f.name.toLowerCase().trim();foodCache[k]={name:f.name,emoji:f.emoji,per100:f.per100,addedAt:Date.now()};saveX();}

function searchLocal(q){
  var ql=(q||'').toLowerCase().trim();
  var results=[],seen={};
  function add(item,score){var k=item.name.toLowerCase();if(!seen[k]){seen[k]=true;results.push({score:score,item:item});}}
  // Recipes first
  recipes.forEach(function(r){
    var nl=r.name.toLowerCase();
    var s=!ql?1:(nl===ql?5:nl.startsWith(ql)?4:nl.includes(ql)?2:0);
    if(s>0)add({name:r.name,emoji:r.emoji||'📋',isRecipe:true,recipeId:r.id,per100:null,badge:'📋',bdgCls:''},s+20);
  });
  // Custom foods
  customFoods.forEach(function(f){
    var nl=f.name.toLowerCase();
    var s=!ql?1:(nl===ql?5:nl.startsWith(ql)?4:nl.includes(ql)?2:0);
    if(s>0)add({name:f.name,emoji:f.emoji,per100:f.per100,badge:'⭐',bdgCls:'own'},s+15);
  });
  // Saved cache
  Object.values(foodCache).forEach(function(f){
    var nl=f.name.toLowerCase();
    var s=!ql?0:(nl===ql?5:nl.startsWith(ql)?4:nl.includes(ql)?2:0);
    if(s>0)add({name:f.name,emoji:f.emoji,per100:f.per100,badge:'🕐',bdgCls:'saved'},s+5);
  });
  // Built-in DB
  DB.forEach(function(f){var s=fuzzy(f,q);if(s>0||!ql)add({name:f.n,emoji:f.e,per100:dbPer100(f)},s);});
  // Restaurant-Ketten (#307): mit Kettenname ganz oben
  if(ql)_pickerChainHits(q).forEach(function(c){add(c,c.chainNamed?40:6);});
  results.sort(function(a,b){return b.score-a.score;});
  var out=[],seenOut={};
  results.forEach(function(x){var k=x.item.name.toLowerCase();if(!seenOut[k]){seenOut[k]=true;out.push(x.item);}});
  return out.slice(0,!ql?12:(out.length&&out[0].chainNamed)?40:15);
}

// ── Zuletzt gegessen / Favoriten ──
function getRecentFoods(){
  var seen={};var list=[];
  var dates=Object.keys(S.days).sort().reverse().slice(0,14);
  dates.forEach(function(d){
    var day=S.days[d];
    if(!day||!day.meals)return;// komprimierter Alt-Tag (#232)
    MEALS.forEach(function(m){
      (day.meals[m]||[]).forEach(function(e){
        if(e._archived)return;
        if(e.isRecipe||(e.ingredients&&e.ingredients.length)){
          var k=(e.name||'').toLowerCase();
          if(!seen[k]&&e.name){seen[k]=true;list.push({name:e.name,emoji:e.emoji,kcal:e.kcal,amount:e.amount,per100:e.per100,isRecipe:e.isRecipe,recipeId:e.recipeId,ingredients:e.ingredients,portions:e.portions});}
        } else {
          var k=(e.name||'').toLowerCase();
          if(!seen[k]&&e.name&&e.per100){seen[k]=true;list.push({name:e.name,emoji:e.emoji,amount:e.amount||100,per100:e.per100});}
        }
      });
    });
  });
  return list.slice(0,15);
}

// ── Nach aussen ──
// Nur, was ausserhalb dieser Datei gerufen wird. tools/check.js loest jeden
// on*-/data-act-String gegen diese Liste auf, tools/smoke.js prueft jeden Eintrag.
window.NTPicker={
  pickerFriendlyAiError:pickerFriendlyAiError, openPicker:openPicker, closePicker:closePicker,
  pickerSetTab:pickerSetTab, pickerSearchLocalLive:pickerSearchLocalLive, pickerSearch:pickerSearch,
  pickerSelResult:pickerSelResult, pickerConfirmAdd:pickerConfirmAdd,
  pickerHandlePhoto:pickerHandlePhoto, pickerResetPhoto:pickerResetPhoto,
  _pickerRefreshPhotoSaveHint:_pickerRefreshPhotoSaveHint, pickerToggleTorch:pickerToggleTorch,
  pickerStartScan:pickerStartScan, pickerStopScan:pickerStopScan,
  pickerScanFromPhoto:pickerScanFromPhoto, pickerBcYes:pickerBcYes, pickerBcNo:pickerBcNo,
  pickerOpenManualBarcode:pickerOpenManualBarcode,
  pickerSubmitManualBarcode:pickerSubmitManualBarcode, pickerBarcodeAdd:pickerBarcodeAdd,
  pickerBarcodeManualSave:pickerBarcodeManualSave, pickerAnalyze:pickerAnalyze,
  pickerPhotoAddSearch:pickerPhotoAddSearch, pickerPhotoAddFromResult:pickerPhotoAddFromResult,
  _pickerRecipeOnlyUI:_pickerRecipeOnlyUI, pickerPhotoAdd:pickerPhotoAdd,
  pickerChatAddLocal:pickerChatAddLocal, pickerChatKiFallback:pickerChatKiFallback,
  pickerSendChat:pickerSendChat, pickerChatAdd:pickerChatAdd, pickerLinkDetect:pickerLinkDetect,
  pickerLinkImport:pickerLinkImport, pickerUpdateLinkTotal:pickerUpdateLinkTotal,
  pickerLinkAdd:pickerLinkAdd, pickerLinkToShop:pickerLinkToShop,
  pickerLinkOpenShop:pickerLinkOpenShop, pickerSaveOwn:pickerSaveOwn,
  pickerRenderIngList:pickerRenderIngList, pickerIngAmtChange:pickerIngAmtChange,
  pickerIngDel:pickerIngDel, pickerAddRecent:pickerAddRecent
};
})();
