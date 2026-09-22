// ════════════════════════════════════════
// NutriTrack – Ingredient Picker
// Ausgelagert aus index.html (v0.119)
// ════════════════════════════════════════

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

function pickerFetchOnline(q){
  var btn=document.getElementById('pickerSearchBtn');
  btn.innerHTML='<span class="spin"></span>';btn.disabled=true;
  var ql=q.toLowerCase(),eng=DE_EN[ql]||null;
  var base='https://world.openfoodfacts.org/cgi/search.pl?search_simple=1&action=process&json=1&page_size=20&fields=product_name,product_name_de,nutriments,image_front_thumb_url';
  var terms=[q];if(eng)terms.push(eng);
  var fetches=terms.map(function(t){return fetchT(offProxyUrl(base+'&search_terms='+encodeURIComponent(t)),{},6000).then(function(r){return r.json();}).catch(function(){return{products:[]};});});
  Promise.all(fetches).then(function(res){
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
    btn.innerHTML='Suchen';btn.disabled=false;
    document.getElementById('pickerSearchHint').textContent='Lokal + Online';
    pickerRenderResults(all,false);
  }).catch(function(){btn.innerHTML='Suchen';btn.disabled=false;});
}

function pickerRenderResults(products,loading){
  if(loading)document.getElementById('pickerSearchHint').textContent='Lädt Online-Ergebnisse...';
  if(!products.length){document.getElementById('pickerResults').innerHTML='<div class="nr">Kein Ergebnis.</div>';return;}
  document.getElementById('pickerResults').innerHTML=products.map(function(p,i){
    var bdg=p.badge?'<span class="ri-bdg'+(p.bdgCls?' '+p.bdgCls:'')+'">'+(p.badge)+'</span>':'';
    var isR=p.isRecipe;
    return'<div class="ri'+(isR?' is-recipe':'')+'" onclick="pickerSelResult('+i+')" id="pri'+i+'">'+bdg
      +'<div class="ri-e">'+(p.emoji||'🍽')+'</div>'
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
  document.getElementById('pickerAmt').value=isRec?'1':'100';
  document.getElementById('pickerAmtUnit').textContent=isRec?'Portion(en)':'Gramm';
  document.getElementById('pickerAddSec').classList.remove('hidden');
}

function pickerConfirmAdd(){
  if(!pickerSelFood)return;
  var amt=parseFloat(document.getElementById('pickerAmt').value)||1;
  var f=pickerSelFood;
  // Check if we're adding to an existing diary entry's ingredient list
  if(window._editEntryMode){
    window._editEntryMode=false;
    var e=getDay().meals[window._editEntryMeal][window._editEntryIdx];
    if(e&&e.ingredients){
      var per100=f.per100||{kcal:0,protein:0,carbs:0,fat:0};
      e.ingredients.push({name:f.name,emoji:f.emoji,amount:amt,per100:per100});
      saveS();closePicker();
      openEditEntry(window._editEntryMeal,window._editEntryIdx);
      showToast((f.emoji||'🍽')+' '+f.name+' hinzugefügt');
      return;
    }
  }
  // Normal: add to meal
  if(f.isRecipe){
    var rec=recipes.find(function(r){return r.id===f.recipeId;});
    if(!rec){showToast('Rezept nicht gefunden');return;}
    var t=ingTotal(rec.ingredients);
    var entry=Object.assign({name:rec.name,emoji:rec.emoji||'📋',isRecipe:true,recipeId:rec.id,portions:amt,ingredients:JSON.parse(JSON.stringify(rec.ingredients))},scaleNutrients(t,amt));
    getDay().meals[pickerMeal].push(entry);
  } else {
    var r=amt/100;
    var entry=Object.assign({name:f.name,emoji:f.emoji,amount:amt,per100:f.per100},scaleNutrients(f.per100,r));
    getDay().meals[pickerMeal].push(entry);
    cacheFood(f);
  }
  var _idx=getDay().meals[pickerMeal].length-1;
  saveS();renderAll();closePicker();
  animateAdd(pickerMeal);
  rememberPortion(f.name,amt);
  checkDataQuality(f);
  checkPregWarn([f],pickerMeal,_idx);
  checkNursWarn([f],pickerMeal,_idx);
  checkDietWarn([f],pickerMeal,_idx);
  showToast((f.emoji||'🍽')+' '+f.name+' hinzugefügt');
}

// ─── PICKER: FOTO TAB ───
function pickerHandlePhoto(e){
  var file=e.target.files[0];if(!file)return;
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
      _pickerRefreshPhotoSaveHint();
      // Barcode-Scan verzögert damit UI sofort reagiert
      setTimeout(function(){pickerTryBarcode(c);},100);
    };
    img.onerror=function(){showToast('Foto konnte nicht geladen werden');};
    img.src=ev.target.result;
  };
  reader.onerror=function(){showToast('Fehler beim Lesen der Datei');};
  reader.readAsDataURL(file);
}

function pickerResetPhoto(){
  window._pickerPhotoB64=null;
  document.getElementById('pickerPrevWrap').classList.add('hidden');
  document.getElementById('pickerPhotoPickArea').style.display='block';
  document.getElementById('pickerAnalyzeBtn').disabled=true;
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

function pickerTryBarcode(canvas){
  var isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)&&!window.MSStream;
  if(typeof ZXing!=='undefined'){
    var hints=new Map();
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS,[ZXing.BarcodeFormat.EAN_13,ZXing.BarcodeFormat.EAN_8,ZXing.BarcodeFormat.UPC_A,ZXing.BarcodeFormat.UPC_E,ZXing.BarcodeFormat.CODE_128,ZXing.BarcodeFormat.CODE_39]);
    hints.set(ZXing.DecodeHintType.TRY_HARDER,true);
    try{
      var r=new ZXing.BrowserMultiFormatReader(hints).decodeFromCanvas(canvas);
      if(r&&r.getText()){pickerFetchBarcodeForConfirm(r.getText());return;}
    }catch(e){}
  }
  // iOS: Claude Haiku als Fallback für Barcode-Erkennung
  if(!isIOS)return;
  if(!canUseAi())return;
  var b64=canvas.toDataURL('image/jpeg',0.85).split(',')[1];
  callClaude('claude-haiku-4-5',[
    {type:'image',source:{type:'base64',media_type:'image/jpeg',data:b64}},
    {type:'text',text:'Is there a barcode in this image? If yes, reply with ONLY the digits. If no barcode, reply exactly "NONE".'}
  ],20,
  function(text){
    var code=(text||'').trim().replace(/\s/g,'');
    if(code!=='NONE'&&/^\d{8,14}$/.test(code))pickerFetchBarcodeForConfirm(code);
  },
  function(){});
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
// JPEG-Frames an den Cloudflare-Worker (POST /decode-barcode), der per Claude
// Haiku Vision die Ziffern liest. Lokaler Decoder läuft weiter – wer zuerst
// trifft, gewinnt. Auf iOS ist der Worker-Pfad meist der einzige, der trifft.
function _pickerServerDecodeUrl(){
  if(typeof PROJECT_AI_PROXY_URL!=='string'||!PROJECT_AI_PROXY_URL)return null;
  return PROJECT_AI_PROXY_URL.replace(/\/v1\/messages\/?$/,'/decode-barcode');
}
function _pickerStartServerDecodeLoop(canvas){
  if(typeof canUseAi!=='function'||!canUseAi())return false;
  var url=_pickerServerDecodeUrl();if(!url)return false;
  pickerBcServerActive=true;
  var inFlight=0;var nextAt=Date.now()+500;var reqCount=0;
  // Mehrfrachen-Bestätigung: erst nach 2 identischen gültigen Codes wird der Lookup gestartet.
  // Schützt gegen seltene Halluzinationen mit zufällig gültiger Prüfziffer.
  var lastCode=null;
  function setStatus(s){var el=document.getElementById('bcDbgServer');if(el)el.textContent='Server: '+s;}
  setStatus('warte');
  function tick(){
    if(!pickerBcActive||!pickerBcServerActive)return;
    var now=Date.now();
    if(inFlight>=1||now<nextAt||!canvas.width||canvas.width<16){setTimeout(tick,120);return;}
    nextAt=now+700;inFlight++;reqCount++;
    setStatus('scan… ('+reqCount+')');
    canvas.toBlob(function(blob){
      if(!pickerBcActive||!pickerBcServerActive||!blob){inFlight--;setTimeout(tick,120);return;}
      fetch(url,{
        method:'POST',
        headers:{'Content-Type':'image/jpeg','x-app-proxy-secret':getProxySecret()},
        body:blob
      }).then(function(r){
        if(!pickerBcActive||!pickerBcServerActive)return null;
        if(!r.ok){setStatus('Fehler '+r.status+' ('+reqCount+')');return null;}
        return r.json();
      }).then(function(d){
        if(!pickerBcActive||!pickerBcServerActive||!d)return;
        var data=d.data||{};
        var raw=data.raw?String(data.raw):'';
        var code=data.code?String(data.code):'';
        var candidate=data.candidate?String(data.candidate):'';
        var checksumOk=Boolean(data.checksumValid);
        if(code){
          if(lastCode===code){
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
  document.getElementById('pickerBarcodeResult').innerHTML='<div style="font-size:13px;color:var(--g1);padding:10px;text-align:center;"><span class="spin" style="display:inline-block;width:14px;height:14px;border:2px solid var(--g2);border-top-color:transparent;border-radius:50%;vertical-align:middle;margin-right:6px;"></span>Kamera startetâ¦</div>';
  pickerBcActive=true;
  var videoEl=document.getElementById('pickerBarcodeVideo');
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
        var caps=track.getCapabilities?track.getCapabilities():{};var adv={};
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
          return window.ZBarWasm.scanImageData(imageData).then(function(symbols){
            if(symbols&&symbols.length){
              for(var i=0;i<symbols.length;i++){
                var t=symbols[i].decode?symbols[i].decode():(symbols[i].data||'');
                if(t)return String(t);
              }
            }
            return null;
          }).catch(function(){return null;});
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
      // PARALLEL: Server-Decode über Cloudflare-Worker (Claude Haiku Vision).
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
      ?'Kamerazugriff verweigert â in Einstellungen → Safari → Kamera erlauben.'
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
  var videoEl=document.getElementById('pickerBarcodeVideo');
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

// Decodet ein hochauflösendes Foto mit allen verfügbaren Decodern + Server.
// Foto-Pfad ist robuster als Live-Stream, weil iOS hier Hardware-Auto-Focus,
// Stabilisierung und volle Sensor-Auflösung nutzt (~4032×3024 statt 1080×1920).
function pickerScanFromPhoto(event){
  var file=event.target.files&&event.target.files[0];
  if(!file)return;
  var el=document.getElementById('pickerBarcodeResult');
  el.innerHTML='<div style="font-size:13px;color:var(--g1);padding:8px;text-align:center;"><span class="spin" style="display:inline-block;width:14px;height:14px;border:2px solid var(--g2);border-top-color:transparent;border-radius:50%;vertical-align:middle;margin-right:6px;"></span>Foto wird analysiert (alle Decoder + KI)…</div>';
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
        +'<button type="button" onclick="pickerOpenManualBarcode()" style="width:100%;background:linear-gradient(135deg,var(--g1),var(--g2));color:white;border:none;border-radius:10px;padding:10px;font-weight:800;font-size:13px;">📝 Code manuell eingeben</button>'
        +'</div>';
      var inp=document.getElementById('pickerBcPhoto');if(inp)inp.value='';
    }
    // 1. ZXing-WASM (modern, schnell)
    var p1=Promise.resolve(null);
    if(window.ZXingWasm&&window.ZXingWasm.readBarcodes){
      p1=window.ZXingWasm.readBarcodes(canvas,{
        formats:['EAN-13','EAN-8','UPC-A','UPC-E','Code128','Code39'],
        tryHarder:true,tryRotate:true,tryInvert:true,maxNumberOfSymbols:1
      }).then(function(rs){return rs&&rs.length&&rs[0].text?rs[0].text:null;}).catch(function(){return null;});
    }
    p1.then(function(c){
      if(c){hit(c,'wasm');return;}
      // 2. ZBar-WASM (andere Algorithmen)
      if(window.ZBarWasm&&window.ZBarWasm.scanImageData){
        try{
          var imgData=ctx.getImageData(0,0,w,h);
          return window.ZBarWasm.scanImageData(imgData).then(function(syms){
            if(syms&&syms.length){
              for(var i=0;i<syms.length;i++){
                var t=syms[i].decode?syms[i].decode():(syms[i].data||'');
                if(t){hit(String(t),'zbar');return null;}
              }
            }
            return null;
          }).catch(function(){return null;});
        }catch(e){}
      }
      return null;
    }).then(function(){
      if(done)return;
      // 3. ZXing-JS (Fallback)
      if(typeof ZXing!=='undefined'){
        try{
          var hints=new Map();
          hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS,[ZXing.BarcodeFormat.EAN_13,ZXing.BarcodeFormat.EAN_8,ZXing.BarcodeFormat.UPC_A,ZXing.BarcodeFormat.UPC_E,ZXing.BarcodeFormat.CODE_128,ZXing.BarcodeFormat.CODE_39]);
          hints.set(ZXing.DecodeHintType.TRY_HARDER,true);
          var r=new ZXing.BrowserMultiFormatReader(hints).decodeFromCanvas(canvas);
          if(r&&r.getText()){hit(r.getText(),'zxingjs');return;}
        }catch(e){}
      }
      // 4. Server (Claude Vision) als letzter Ausweg
      if(typeof canUseAi==='function'&&canUseAi()){
        var serverUrl=_pickerServerDecodeUrl&&_pickerServerDecodeUrl();
        if(serverUrl){
          canvas.toBlob(function(blob){
            if(!blob){fail();return;}
            fetch(serverUrl,{
              method:'POST',
              headers:{'Content-Type':'image/jpeg','x-app-proxy-secret':getProxySecret()},
              body:blob
            }).then(function(r){return r.ok?r.json():null;}).then(function(d){
              if(d&&d.ok&&d.data&&d.data.code){hit(d.data.code,'server');}
              else{fail();}
            }).catch(fail);
          },'image/jpeg',0.85);
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

function pickerFetchBarcodeForConfirm(code){
  var cached=_pickerCachedBarcode(code);
  if(cached){pickerShowBcConfirm(cached);return;}
  if(!isOnline)return;
  fetchT(offProxyUrl('https://world.openfoodfacts.org/api/v0/product/'+code+'.json'),{},6000)
    .then(function(r){return r.json();})
    .then(function(data){
      if(data.status!==1||!data.product){showToast('Barcode '+code+' nicht gefunden – bitte manuell eintragen');return;}
      var p=data.product,nm=p.nutriments||{};
      var name=p.product_name_de||p.product_name||'Unbekannt';
      var per100=_pickerOffPer100(nm);
      if(!_hasNutrients(per100)){showToast('⚠️ Keine Nährwerte verfügbar für „'+name+'" – bitte manuell eintragen');pickerOpenManualBarcode();document.getElementById('bcManualName').value=name;return;}
      var food={name:name,emoji:emo(name),barcode:code,per100:per100};
      barcodeCache[code]=food;saveBarcodeCache();cacheFood(food);
      pickerShowBcConfirm(food);
    }).catch(function(){showToast('Produkt-Abruf fehlgeschlagen – bist du online?');});
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
  pickerAnalyze();
}

// Notnagel: Code manuell eintippen wenn alle Decoder versagen.
// Auf iOS: long-press im Eingabefeld → "Text scannen" nutzt Apples Live Text OCR,
// die EAN-Klartextziffern unter dem Strichcode extrem zuverlässig liest.
function pickerOpenManualBarcode(){
  pickerStopScan();
  var el=document.getElementById('pickerBarcodeResult');
  if(!el)return;
  el.innerHTML='<div style="background:var(--gl);border:1.5px solid var(--br);border-radius:12px;padding:12px;">'
    +'<div style="font-size:12px;color:var(--mu);margin-bottom:6px;">Tippe die 13 Ziffern unter dem Strichcode ein.</div>'
    +'<div style="font-size:11px;color:var(--mu);margin-bottom:10px;line-height:1.4;">📱 <strong>iPhone-Tipp:</strong> Halte das Eingabefeld lang gedrückt → „Text scannen" → mit Kamera die Ziffern lesen lassen (Apples Live Text).</div>'
    +'<input type="text" id="bcDirectInput" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="z.B. 4011200296898" style="width:100%;box-sizing:border-box;border:2px solid var(--br);border-radius:9px;padding:10px;font-size:16px;font-family:ui-monospace,Menlo,monospace;letter-spacing:1px;outline:none;margin-bottom:10px;" maxlength="14">'
    +'<button type="button" onclick="pickerSubmitManualBarcode()" style="width:100%;background:linear-gradient(135deg,var(--g1),var(--g2));color:white;border:none;border-radius:10px;padding:11px;font-weight:800;font-size:14px;">Suchen ✓</button>'
    +'</div>';
  setTimeout(function(){var i=document.getElementById('bcDirectInput');if(i)i.focus();},50);
}
function pickerSubmitManualBarcode(){
  var i=document.getElementById('bcDirectInput');
  if(!i)return;
  var code=(i.value||'').replace(/\D/g,'');
  if(code.length<8){showToast('Mindestens 8 Ziffern eingeben');return;}
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
    +'<div style="font-size:28px;">'+(food.emoji||'🍽')+'</div>'
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
    +'<button type="button" onclick="pickerBarcodeAdd()" style="width:100%;background:linear-gradient(135deg,var(--g1),var(--g2));color:white;border:none;border-radius:10px;padding:11px;font-weight:800;font-size:14px;">Hinzufügen ✓</button>'
    +'</div>';
  window._pickerBarcodeFood=food;
}

function pickerBarcodeAdd(){
  var food=window._pickerBarcodeFood;if(!food)return;
  var amt=parseFloat(document.getElementById('pickerBcAmt').value)||100;
  var r=amt/100;
  if(window._editEntryMode){
    window._editEntryMode=false;
    var e=getDay().meals[window._editEntryMeal][window._editEntryIdx];
    if(e&&e.ingredients){
      e.ingredients.push({name:food.name,emoji:food.emoji,amount:amt,per100:food.per100});
      saveS();closePicker();
      openEditEntry(window._editEntryMeal,window._editEntryIdx);
      showToast((food.emoji||'🍽')+' '+food.name+' hinzugefügt');
      return;
    }
  }
  getDay().meals[pickerMeal].push(Object.assign({name:food.name,emoji:food.emoji,amount:amt,per100:food.per100},scaleNutrients(food.per100,r)));
  var _bidx=getDay().meals[pickerMeal].length-1;
  saveS();renderAll();closePicker();
  animateAdd(pickerMeal);
  checkPregWarn([food],pickerMeal,_bidx);
  checkNursWarn([food],pickerMeal,_bidx);
  checkDietWarn([food],pickerMeal,_bidx);
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
    +'<button type="button" onclick="pickerBarcodeManualSave(\''+_esc(String(code).replace(/[\\']/g,''))+'\')" style="width:100%;background:linear-gradient(135deg,var(--g1),var(--g2));color:white;border:none;border-radius:10px;padding:11px;font-weight:800;font-size:14px;">Speichern & hinzufügen ✓</button>'
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
    function(i,v){pickerIngredients[i].amount=parseFloat(v)||0;pickerUpdatePhotoTotal();},
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
    return'<div class="ri" onclick="pickerPhotoAddFromResult('+i+')">'
      +'<div class="ri-e">'+(p.emoji||'🍽')+'</div>'
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
  if(hasEditMode&&window._editEntryMode){
    window._editEntryMode=false;
    var e=getDay().meals[window._editEntryMeal][window._editEntryIdx];
    if(e&&e.ingredients){
      ings.forEach(function(ing){e.ingredients.push(ing);});
      saveS();_pickerSavePhotoIfWanted();closePicker();openEditEntry(window._editEntryMeal,window._editEntryIdx);
      showToast(ings.length+' Zutat(en) hinzugefügt');return;
    }
  }
  var name=document.getElementById(nameId).value.trim()||defaultName;
  var portions=parseFloat(document.getElementById(portionsId).value)||1;
  var t=ingTotal(ings);
  var scaled=scaleNutrients(t,portions);
  var createdRec=null;
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
    function(i,v){pickerIngredients[i].amount=parseFloat(v)||0;pickerUpdateChatTotal();},
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
  var dbHit=_pickerDbHit(q);
  if(dbHit)add({name:dbHit.n,emoji:dbHit.e,per100:{kcal:dbHit.k,protein:dbHit.p,carbs:dbHit.c,fat:dbHit.f,sugar:0,fiber:0,salt:0},badge:'📦'},9);
  results.sort(function(a,b){return b.score-a.score;});
  return results.slice(0,6).map(function(x){return x.item;});
}

function pickerChatAddLocal(i){
  var p=(window._pickerLocalResults||[])[i];if(!p)return;
  var cards=document.getElementById('pickerLocalCards');if(cards)cards.remove();
  var msgs=document.getElementById('pickerChatMsgs');
  if(p.isRecipe){
    // Rezept als Ganzes in die Mahlzeit übernehmen (analog pickerAddRecent).
    var rec=recipes.find(function(r){return r.id===p.recipeId;});
    if(!rec){msgs.innerHTML+='<div class="cm a">❌ Rezept nicht mehr vorhanden.</div>';return;}
    var t=ingTotal(rec.ingredients||[]);
    var portions=rec.portions||1;
    getDay().meals[pickerMeal].push(Object.assign({name:rec.name,emoji:rec.emoji||'📋',isRecipe:true,recipeId:rec.id,portions:portions,ingredients:rec.ingredients||[]},scaleNutrients(t,portions)));
    saveS();renderAll();closePicker();
    showToast('📋 '+rec.name+' eingetragen');
    return;
  }
  pickerIngredients=[{name:p.name,emoji:p.emoji,g:100,amount:100,per100:p.per100}];
  if(!document.getElementById('pickerChatRecipeName').value)
    document.getElementById('pickerChatRecipeName').value=p.name.slice(0,50);
  msgs.innerHTML+='<div class="cm a">✓ '+_esc(p.name)+' übernommen.</div>';
  _pickerChatRebind();
  pickerUpdateChatTotal();
  document.getElementById('pickerChatResult').classList.remove('hidden');
}

function pickerChatKiFallback(msg){
  var msgs=document.getElementById('pickerChatMsgs');
  var cards=document.getElementById('pickerLocalCards');if(cards)cards.remove();
  if(!isOnline){msgs.innerHTML+='<div class="cm a">📵 KI benötigt eine Internet-Verbindung.</div>';document.getElementById('pickerChatSend').disabled=false;return;}
  msgs.innerHTML+='<div class="cm a">🤖 KI schätzt Nährwerte...</div>';
  msgs.scrollTop=msgs.scrollHeight;
  document.getElementById('pickerChatSend').disabled=true;
  var hasPhoto=!!window._pickerPhotoB64;
  var content=hasPhoto
    ?[{type:'image',source:{type:'base64',media_type:'image/jpeg',data:window._pickerPhotoB64}},{type:'text',text:getChatPrompt().replace('{MSG}',msg)}]
    :[{type:'text',text:getChatPrompt().replace('{MSG}',msg)}];
  var model=hasPhoto?'claude-sonnet-4-6':'claude-haiku-4-5';
  callClaude(model,content,300,
    function(text){
      var raw=parseIngJSON(text);
      if(!raw.length){
        // KI lieferte kein verwertbares JSON (z.B. Ablehnung/Prosa bei Alkohol). Keine Sackgasse:
        // Die Eingabe selbst als ein Lebensmittel an die Nährwert-Suche geben (DB → OpenFoodFacts →
        // KI-Nährwerte → Schätzung). Nur bei kurzer Eingabe (sieht nach einem Einzel-Lebensmittel
        // aus); echte Mehr-Zutaten-Sätze brauchen die KI-Zerlegung und bleiben beim Hinweis (#135).
        var clean=_pickerStripQty(msg)||(msg||'').trim();
        if(clean&&clean.split(/\s+/).length<=4){raw=[{name:clean,g:null}];}
        else{msgs.innerHTML+='<div class="cm a">❌ Konnte nicht parsen. Genauer beschreiben.</div>';document.getElementById('pickerChatSend').disabled=false;return;}
      }
      var _src=(typeof aiSourceBadgeHtml==='function')?aiSourceBadgeHtml():'';
      msgs.innerHTML+='<div class="cm a">✨ '+raw.length+' Zutaten erkannt'+_src+'. Suche Nährwerte...</div>';
      msgs.scrollTop=msgs.scrollHeight;
      lookupNutrients(raw,function(resolved){
        pickerIngredients=resolved;
        if(!document.getElementById('pickerChatRecipeName').value)
          document.getElementById('pickerChatRecipeName').value=msg.slice(0,50);
        _pickerChatRebind();
        pickerUpdateChatTotal();
        document.getElementById('pickerChatResult').classList.remove('hidden');
        document.getElementById('pickerChatSend').disabled=false;
      });
    },
    function(err){msgs.innerHTML+='<div class="cm a">❌ '+pickerFriendlyAiError(err)+'</div>';document.getElementById('pickerChatSend').disabled=false;}
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
  msgs.scrollTop=msgs.scrollHeight;
  window._pickerChatLastMsg=msg;
  // Lokale Suche zuerst (#113): Rezepte, Custom Foods, Cache, DB. KI nur als Fallback.
  var results=pickerChatLocalSearch(msg);
  if(results.length){
    window._pickerLocalResults=results;
    var html='<div id="pickerLocalCards" style="display:flex;flex-direction:column;gap:6px;margin-top:4px;">';
    html+='<div class="cm a">📚 '+results.length+' Treffer in deinem Bestand:</div>';
    results.forEach(function(p,i){
      var sub=p.isRecipe?'Rezept':(p.per100?Math.round(p.per100.kcal)+' kcal · P'+(p.per100.protein||0).toFixed(1)+'g · K'+(p.per100.carbs||0).toFixed(1)+'g · F'+(p.per100.fat||0).toFixed(1)+'g /100g':'');
      var badge=p.badge||'';
      html+='<div style="background:var(--gl);border:1px solid var(--br);border-radius:10px;padding:8px 10px;display:flex;align-items:center;gap:8px;">'
        +'<div style="flex:1;min-width:0;"><div style="font-weight:600;font-size:13px;">'+(p.emoji||'🍽')+' '+_esc(p.name)+(badge?' <span style="font-size:11px;color:var(--mu);">'+_esc(badge)+'</span>':'')+'</div>'
        +(sub?'<div style="font-size:11px;color:var(--mu);">'+sub+'</div>':'')+'</div>'
        +'<button type="button" onclick="pickerChatAddLocal('+i+')" style="background:var(--g1);color:#fff;border:none;border-radius:8px;padding:5px 10px;font-size:14px;font-weight:700;cursor:pointer;flex-shrink:0;">＋</button>'
        +'</div>';
    });
    html+='<div style="text-align:center;padding-top:2px;"><button type="button" onclick="pickerChatKiFallback(window._pickerChatLastMsg)" style="background:none;border:none;color:var(--mu);font-size:12px;cursor:pointer;padding:4px 8px;text-decoration:underline;">🤖 Stattdessen KI fragen</button></div>';
    html+='</div>';
    msgs.innerHTML+=html;
    msgs.scrollTop=msgs.scrollHeight;
    document.getElementById('pickerChatSend').disabled=false;
    return;
  }
  if(!isOnline){msgs.innerHTML+='<div class="cm a">📵 Offline und nichts im Bestand gefunden. Verbinde dich oder lege es als „Eigenes Lebensmittel" an.</div>';document.getElementById('pickerChatSend').disabled=false;return;}
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
  var inp=document.getElementById('pickerChatInp');
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
      msgs.scrollTop=msgs.scrollHeight;
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
  var mic=document.getElementById('pickerChatMic'),inp=document.getElementById('pickerChatInp');
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
  var m=tok.match(/^(\d+)\s*\/\s*(\d+)$/);
  if(m)return parseFloat(m[1])/parseFloat(m[2]);
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

// „250 g Mehl", „2 EL Olivenöl", „1 Zwiebel", „1 ½ TL Salz", „2-3 Tomaten",
// „Salz und Pfeffer" → {name, g, raw} – Menge immer in Gramm.
function _parseIngLine(raw){
  var s=_stripTags(raw).replace(/ /g,' ').trim();
  if(!s)return null;
  var rest=_stripVague(s),v=null,unit='';
  // Menge: Dezimal, Bruch, Unicode-Bruch, Bereich („2-3" → die kleinere Zahl,
  // damit nichts zu großzügig gerechnet wird), optional gemischt („1 ½").
  var m=rest.match(/^(\d+(?:[.,]\d+)?|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|\d+\s*\/\s*\d+)\s*/);
  if(m){
    v=_ingNum(m[1]);
    rest=rest.slice(m[0].length);
    var r=rest.match(/^[-–bis]+\s*\d+(?:[.,]\d+)?\s*/i);
    if(r)rest=rest.slice(r[0].length);// Bereich: obere Grenze verwerfen
    var f=rest.match(/^([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|\d+\s*\/\s*\d+)\s*/);
    if(f&&v!==null){var fv=_ingNum(f[1]);if(fv!==null){v+=fv;rest=rest.slice(f[0].length);}}
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
  var netErr=function(msg){var e=new Error(msg);e._toast=msg;return e;};
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
        function(i,v){pickerIngredients[i].amount=parseFloat(v)||0;pickerUpdateLinkTotal();},
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
      +'<div class="ing-e" onclick="ingToggle(event,\''+nid+'\')">'+(ing.emoji||'🍽')+'</div>'
      +'<div class="ing-n" onclick="ingToggle(event,\''+nid+'\')">'+_esc(ing.name)+ampelDot+'</div>'
      +'<input type="number" class="ing-amt" value="'+amtVal+'" min="1" placeholder="g?" style="'+borderStyle+'" data-i="'+i+'" onchange="pickerIngAmtChange(\''+elId+'\','+i+',this.value)">'
      +'<div class="ing-u">g</div>'
      +warn
      +'<button type="button" class="ing-del" onclick="pickerIngDel(\''+elId+'\','+i+')">✕</button>'
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
  if(item.isRecipe||item.ingredients){
    var t=ingTotal(item.ingredients||[]);
    var portions=item.portions||1;
    getDay().meals[pickerMeal].push(Object.assign({name:item.name,emoji:item.emoji,isRecipe:true,recipeId:item.recipeId||null,portions:portions,ingredients:item.ingredients||[]},scaleNutrients(t,portions)));
  } else {
    var recalled=recallPortion(item.name)||item.amount||100;
    var r=recalled/100;
    getDay().meals[pickerMeal].push({name:item.name,emoji:item.emoji,amount:recalled,per100:item.per100,kcal:(item.per100.kcal||0)*r,protein:(item.per100.protein||0)*r,carbs:(item.per100.carbs||0)*r,fat:(item.per100.fat||0)*r,sugar:(item.per100.sugar||0)*r,fiber:(item.per100.fiber||0)*r,salt:(item.per100.salt||0)*r});
  }
  saveS();renderAll();closePicker();
  showToast((item.emoji||'🍽')+' '+item.name+' hinzugefügt');
}
