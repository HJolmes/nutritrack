// ════════════════════════════════════════
// NutriTrack – Ingredient Picker
// Ausgelagert aus index.html (v0.119)
// ════════════════════════════════════════

// Picker state (global)
var pickerMeal=null;          // which meal to add to (null = ask)
var pickerOnAdd=null;         // callback: function(ingredient)
var pickerSelFood=null;       // selected food in search tab
var pickerIngredients=[];     // photo/chat detected ingredients
var pickerBcFound=null;       // barcode found pending confirm
var pickerBcReader=null;      // ZXing reader instance
var pickerBcActive=false;
var pickerTorchOn=false;

// ════════════════════════════════════════
// SECTION: INGREDIENT PICKER (universell)
// ════════════════════════════════════════
function openPicker(meal, defaultTab){
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
  pickerStopScan();
  // Title
  document.getElementById('pickerTitle').textContent=(MEAL_NAMES[pickerMeal]||'Mahlzeit')+' – Zutat hinzufügen';
  document.getElementById('pickerSub').textContent='Lokal + Online kombiniert';
  // Default tab
  pickerSetTab(defaultTab||'chat');
  // Load search results non-blocking
  requestAnimationFrame(function(){pickerLoadDefaultResults();});
  openOv('pickerOv');
  // Do NOT auto-focus - prevents keyboard popping up on mobile
}

function closePicker(){
  pickerStopScan();
  closeOv('pickerOv');
}

function pickerSetTab(tab){
  // Always stop barcode scan when switching tabs
  pickerStopScan();
  document.querySelectorAll('.picker-tab').forEach(function(b){b.classList.remove('act');});
  document.querySelectorAll('.picker-panel').forEach(function(p){p.classList.remove('act');});
  var tabEl=document.getElementById('ptab-'+tab);
  var panelEl=document.getElementById('ppanel-'+tab);
  if(tabEl)tabEl.classList.add('act');
  if(panelEl)panelEl.classList.add('act');
  if(tab==='search'){pickerLoadDefaultResults();}
  if(tab==='barcode'){setTimeout(function(){pickerStartScan();},150);}
  if(tab==='recent'){renderRecentList();}
  // No auto-focus on chat - user taps input to open keyboard
}

function pickerLoadDefaultResults(){
  var results=searchLocal('');
  pickerRenderResults(results,false);
}

// ─── PICKER: SEARCH TAB ───
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
  var proxy='https://corsproxy.io/?';
  var base='https://world.openfoodfacts.org/cgi/search.pl?search_simple=1&action=process&json=1&page_size=20&fields=product_name,product_name_de,nutriments,image_front_thumb_url';
  var terms=[q];if(eng)terms.push(eng);
  var fetches=terms.map(function(t){return fetch(proxy+encodeURIComponent(base+'&search_terms='+encodeURIComponent(t))).then(function(r){return r.json();}).catch(function(){return{products:[]};});});
  Promise.all(fetches).then(function(res){
    var local=searchLocal(q);
    var seen={};local.forEach(function(p){seen[p.name.toLowerCase()]=true;});
    var online=[];
    res.forEach(function(data){
      (data.products||[]).forEach(function(p){
        var nm=p.nutriments||{},name=(p.product_name_de||p.product_name||'').trim();
        if(!name||name.length<3)return;
        var kcal=nm['energy-kcal_100g']||0;if(kcal<=0||kcal>950)return;
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
      +'<div style="flex:1;min-width:0;"><div class="ri-n">'+p.name+'</div>'
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
  rememberPortion(f.name,f.amount);
  checkDataQuality(f);
  checkPregWarn([f],pickerMeal,_idx);
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
      // MAX 800px reicht für KI-Analyse – schneller, weniger RAM
      var c=document.createElement('canvas'),MAX=800,w=img.width,h=img.height;
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


function _pickerZxingScanLoop(videoEl,canvas,ctx,reader){
  if(!pickerBcActive)return;
  requestAnimationFrame(function(){
    if(!pickerBcActive)return;
    if(videoEl.readyState<2||!videoEl.videoWidth){
      setTimeout(function(){_pickerZxingScanLoop(videoEl,canvas,ctx,reader);},100);return;
    }
    canvas.width=videoEl.videoWidth;canvas.height=videoEl.videoHeight;
    function onFrame(){
      try{
        var r=reader.decodeFromCanvas(canvas);
        if(r&&r.getText()){pickerStopScan();pickerLookupBarcode(r.getText());return;}
      }catch(e){}
      setTimeout(function(){_pickerZxingScanLoop(videoEl,canvas,ctx,reader);},150);
    }
    if(typeof createImageBitmap!=='undefined'){
      createImageBitmap(videoEl).then(function(bm){
        ctx.drawImage(bm,0,0,canvas.width,canvas.height);bm.close();onFrame();
      }).catch(function(){ctx.drawImage(videoEl,0,0,canvas.width,canvas.height);onFrame();});
    } else {
      ctx.drawImage(videoEl,0,0,canvas.width,canvas.height);onFrame();
    }
  });
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
  navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}}).then(function(stream){
    if(!pickerBcActive){stream.getTracks().forEach(function(t){t.stop();});return;}
    videoEl.srcObject=stream;
    var playP=videoEl.play();if(playP)playP.catch(function(){});
    // Android only: torch + camera tuning
    var isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)&&!window.MSStream;
    if(!isIOS){
      var tb=document.getElementById('torchBtn');if(tb)tb.style.display='block';
      pickerTorchOn=false;if(tb)tb.textContent='🔦';
      try{
        var track=stream.getVideoTracks()[0];if(track){
          var caps=track.getCapabilities();var adv={};
          if(caps.focusMode&&caps.focusMode.includes('continuous'))adv.focusMode='continuous';
          if(caps.zoom){var z=Math.min(2,caps.zoom.max);if(z>caps.zoom.min)adv.zoom=z;}
          if(Object.keys(adv).length)track.applyConstraints({advanced:[adv]}).catch(function(){});
        }
      }catch(e){}
    }
    pickerBcReader={_stream:stream};
    // Wait for video to be ready before scanning
    function startScanWhenReady(){
      if(!pickerBcActive)return;
      document.getElementById('pickerBarcodeResult').innerHTML='';
      if('BarcodeDetector' in window){
        var detector=new BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e','code_128','code_39']});
        pickerBcReader._scanLoop=setInterval(function(){
          if(!pickerBcActive)return;
          if(videoEl.readyState<2)return;
          detector.detect(videoEl).then(function(barcodes){
            if(!pickerBcActive)return;
            if(barcodes&&barcodes.length>0){clearInterval(pickerBcReader._scanLoop);pickerStopScan();pickerLookupBarcode(barcodes[0].rawValue);}
          }).catch(function(){});
        },200);
      } else if(typeof ZXing!=='undefined'){
        var hints=new Map();
        hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS,[ZXing.BarcodeFormat.EAN_13,ZXing.BarcodeFormat.EAN_8,ZXing.BarcodeFormat.UPC_A,ZXing.BarcodeFormat.UPC_E,ZXing.BarcodeFormat.CODE_128,ZXing.BarcodeFormat.CODE_39]);
        hints.set(ZXing.DecodeHintType.TRY_HARDER,true);
        var reader=new ZXing.BrowserMultiFormatReader(hints,300);
        pickerBcReader._zxing=reader;
        var canvas=document.createElement('canvas');
        var ctx=canvas.getContext('2d',{willReadFrequently:true});
        _pickerZxingScanLoop(videoEl,canvas,ctx,reader);
      } else {
        document.getElementById('pickerBarcodeResult').innerHTML='<div style="font-size:13px;color:var(--re);padding:8px;">❌ ZXing nicht geladen. Seite neu laden.</div>';
        document.getElementById('pickerBcPhotoBtn').style.display='block';
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
  if(pickerBcReader){
    try{if(pickerBcReader._scanLoop)clearInterval(pickerBcReader._scanLoop);}catch(e){}
    try{if(pickerBcReader._zxing)pickerBcReader._zxing.reset();}catch(e){}
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
  var pb=document.getElementById('pickerBcPhotoBtn');if(pb)pb.style.display='none';
  pickerTorchOn=false;
}

function pickerScanFromPhoto(event){
  var file=event.target.files&&event.target.files[0];
  if(!file)return;
  var el=document.getElementById('pickerBarcodeResult');
  el.innerHTML='<div style="font-size:13px;color:var(--g1);padding:8px;text-align:center;">🔍 Barcode wird erkannt...</div>';
  var img=new Image();
  var url=URL.createObjectURL(file);
  img.onload=function(){
    URL.revokeObjectURL(url);
    var MAX=1200;
    var scale=Math.min(1,MAX/Math.max(img.width,img.height));
    var w=Math.round(img.width*scale),h=Math.round(img.height*scale);
    var canvas=document.createElement('canvas');
    canvas.width=w;canvas.height=h;
    var ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(img,0,0,w,h);
    var zxingOk=false;
    if(typeof ZXing!=='undefined'){
      var hints=new Map();
      hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS,[ZXing.BarcodeFormat.EAN_13,ZXing.BarcodeFormat.EAN_8,ZXing.BarcodeFormat.UPC_A,ZXing.BarcodeFormat.UPC_E,ZXing.BarcodeFormat.CODE_128,ZXing.BarcodeFormat.CODE_39]);
      hints.set(ZXing.DecodeHintType.TRY_HARDER,true);
      try{
        var result=new ZXing.BrowserMultiFormatReader(hints).decodeFromCanvas(canvas);
        if(result&&result.getText()){
          zxingOk=true;
          document.getElementById('pickerBcPhoto').value='';
          pickerLookupBarcode(result.getText());
        }
      }catch(e){}
    }
    if(!zxingOk){
      el.innerHTML='<div style="font-size:13px;color:var(--re);padding:8px;">❌ Kein Barcode erkannt. Nochmal versuchen.</div>';
      document.getElementById('pickerBcPhoto').value='';
    }
  };
  img.onerror=function(){el.innerHTML='<div style="font-size:13px;color:var(--re);padding:8px;">❌ Foto konnte nicht geladen werden.</div>';};
  img.src=url;
}

function pickerFetchBarcodeForConfirm(code){
  var cached=barcodeCache[code];
  if(cached){pickerShowBcConfirm(cached);return;}
  if(!isOnline)return;
  fetch('https://world.openfoodfacts.org/api/v0/product/'+code+'.json')
    .then(function(r){return r.json();})
    .then(function(data){
      if(data.status!==1||!data.product)return;
      var p=data.product,nm=p.nutriments||{};
      var name=p.product_name_de||p.product_name||'Unbekannt';
      var food={name:name,emoji:emo(name),barcode:code,per100:{kcal:nm['energy-kcal_100g']||0,protein:nm['proteins_100g']||0,carbs:nm['carbohydrates_100g']||0,fat:nm['fat_100g']||0,sugar:nm['sugars_100g']||0,fiber:nm['fiber_100g']||0,salt:nm['salt_100g']||0}};
      barcodeCache[code]=food;saveBarcodeCache();cacheFood(food);
      pickerShowBcConfirm(food);
    }).catch(function(){});
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

function pickerLookupBarcode(code){
  var el=document.getElementById('pickerBarcodeResult');
  var startBtn=document.getElementById('pickerBcStartBtn');
  if(startBtn)startBtn.style.display='none';
  if(el)el.innerHTML='<div style="font-size:13px;color:var(--g1);padding:8px;text-align:center;">🔍 Suche Barcode '+code+'...</div>';
  var cached=barcodeCache[code];
  if(cached){pickerShowBarcodeResult(cached,true);return;}
  if(!isOnline){
    pickerShowBarcodeNotFound(code,'📴 Offline – nicht im Cache. Werte manuell eintragen:');
    return;
  }
  fetch('https://world.openfoodfacts.org/api/v0/product/'+code+'.json')
    .then(function(r){return r.json();})
    .then(function(data){
      if(data.status!==1||!data.product){
        pickerShowBarcodeNotFound(code,'Produkt nicht in der Datenbank. Trag die Werte selbst ein:');
        return;
      }
      var p=data.product,nm=p.nutriments||{};
      var name=p.product_name_de||p.product_name||'Unbekannt';
      var food={name:name,emoji:emo(name),barcode:code,per100:{kcal:nm['energy-kcal_100g']||0,protein:nm['proteins_100g']||0,carbs:nm['carbohydrates_100g']||0,fat:nm['fat_100g']||0,sugar:nm['sugars_100g']||0,fiber:nm['fiber_100g']||0,salt:nm['salt_100g']||0}};
      barcodeCache[code]=food;saveBarcodeCache();cacheFood(food);
      pickerShowBarcodeResult(food,false);
    }).catch(function(){
      if(el)el.innerHTML='<div style="font-size:13px;color:var(--re);padding:8px;">❌ Fehler beim Laden</div>';
      if(startBtn)startBtn.style.display='block';
    });
}

function pickerShowBarcodeResult(food,fromCache){
  var el=document.getElementById('pickerBarcodeResult');
  if(!el){return;}
  el.innerHTML='<div style="background:var(--gl);border:1.5px solid var(--g3);border-radius:12px;padding:12px;">'
    +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">'
    +'<div style="font-size:28px;">'+(food.emoji||'🍽')+'</div>'
    +'<div style="flex:1;"><div style="font-weight:700;font-size:14px;">'+food.name+'</div>'
    +'<div style="font-size:11px;color:var(--mu);margin-top:2px;">P '+food.per100.protein+'g · K '+food.per100.carbs+'g · F '+food.per100.fat+'g pro 100g</div>'
    +(fromCache?'<div style="font-size:10px;color:var(--g2);margin-top:2px;">📴 Aus Cache</div>':'')
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
  checkDietWarn([food],pickerMeal,_bidx);
  showToast((food.emoji||'🍽')+' '+food.name+' hinzugefügt');
}

function pickerShowBarcodeNotFound(code,msg){
  var el=document.getElementById('pickerBarcodeResult');
  if(!el)return;
  window._pickerBarcodeNotFoundCode=code;
  el.innerHTML='<div style="background:var(--gl);border:1.5px solid var(--br);border-radius:12px;padding:12px;">'
    +'<div style="font-size:12px;color:var(--mu);margin-bottom:10px;">'+msg+'</div>'
    +'<input type="text" id="bcManualName" placeholder="Produktname *" style="width:100%;box-sizing:border-box;border:2px solid var(--br);border-radius:9px;padding:8px;font-size:14px;margin-bottom:8px;outline:none;">'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;">'
    +'<label style="font-size:11px;color:var(--mu);">kcal/100g<input type="number" id="bcManualKcal" placeholder="0" min="0" style="width:100%;box-sizing:border-box;border:1.5px solid var(--br);border-radius:8px;padding:6px;font-size:13px;margin-top:2px;outline:none;"></label>'
    +'<label style="font-size:11px;color:var(--mu);">Protein g<input type="number" id="bcManualProt" placeholder="0" min="0" style="width:100%;box-sizing:border-box;border:1.5px solid var(--br);border-radius:8px;padding:6px;font-size:13px;margin-top:2px;outline:none;"></label>'
    +'<label style="font-size:11px;color:var(--mu);">Kohlenhydrate g<input type="number" id="bcManualCarbs" placeholder="0" min="0" style="width:100%;box-sizing:border-box;border:1.5px solid var(--br);border-radius:8px;padding:6px;font-size:13px;margin-top:2px;outline:none;"></label>'
    +'<label style="font-size:11px;color:var(--mu);">Fett g<input type="number" id="bcManualFat" placeholder="0" min="0" style="width:100%;box-sizing:border-box;border:1.5px solid var(--br);border-radius:8px;padding:6px;font-size:13px;margin-top:2px;outline:none;"></label>'
    +'</div>'
    +'<button type="button" onclick="pickerBarcodeManualSave(\''+code+'\')" style="width:100%;background:linear-gradient(135deg,var(--g1),var(--g2));color:white;border:none;border-radius:10px;padding:11px;font-weight:800;font-size:14px;">Speichern & hinzufügen ✓</button>'
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
  barcodeCache[code]=food;saveBarcodeCache();
  customFoods.unshift(food);saveX();
  pickerShowBarcodeResult(food,false);
  showToast(food.emoji+' '+food.name+' gespeichert');
}

function pickerAnalyze(){
  if(!window._pickerPhotoB64)return;
  if(!isOnline){
    if(window._pickerPhotoB64){addToOfflineQueue(window._pickerPhotoB64,pickerMeal,S.currentDate);}
    else{showToast('Foto-Analyse benötigt Internet');}
    return;
  }
  var btn=document.getElementById('pickerAnalyzeBtn');
  btn.disabled=true;btn.innerHTML='<span style="display:inline-flex;gap:5px;align-items:center;"><span class="spin"></span>KI analysiert...</span>';
  pickerSetPhotoStatus('KI analysiert das Foto...',false);
  var prompt=getFotoPrompt();
  callClaude('claude-sonnet-4-5',[{type:'image',source:{type:'base64',media_type:'image/jpeg',data:window._pickerPhotoB64}},{type:'text',text:prompt}],600,
    function(text){
      console.log('[NutriTrack KI-Antwort]',text);
      var parsed=parsePhotoResponse(text);
      btn.disabled=false;btn.textContent='📷 Erneut analysieren';
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
        pickerSetPhotoStatus('',false);
      });
    },
    function(err){btn.disabled=false;btn.textContent='📷 Erneut analysieren';pickerSetPhotoStatus('Fehler: '+err,true);}
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
function _pickerIngCallbacks(tab){
  return {
    onChange:function(i,v){pickerIngredients[i].amount=parseFloat(v)||0;pickerUpdateTotal(tab);},
    onDelete:function(i){pickerIngredients.splice(i,1);pickerUpdateTotal(tab);}
  };
}

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
      +'<div style="flex:1;min-width:0;"><div class="ri-n">'+p.name+'</div>'
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

function _pickerAdd(emoji,nameId,portionsId,defaultName,saveAsRecipe,hasEditMode){
  if(!pickerIngredients.length){showToast('Keine Zutaten');return;}
  var ings=JSON.parse(JSON.stringify(pickerIngredients));
  pickerIngredients.forEach(function(f){cacheFood(f);});
  if(hasEditMode&&window._editEntryMode){
    window._editEntryMode=false;
    var e=getDay().meals[window._editEntryMeal][window._editEntryIdx];
    if(e&&e.ingredients){
      ings.forEach(function(ing){e.ingredients.push(ing);});
      saveS();closePicker();openEditEntry(window._editEntryMeal,window._editEntryIdx);
      showToast(ings.length+' Zutat(en) hinzugefügt');return;
    }
  }
  var name=document.getElementById(nameId).value.trim()||defaultName;
  var portions=parseFloat(document.getElementById(portionsId).value)||1;
  var t=ingTotal(ings);
  var scaled=scaleNutrients(t,portions);
  if(saveAsRecipe){
    var rec={id:Date.now().toString(),name:name,emoji:emoji,ingredients:ings};
    recipes.unshift(rec);saveX();
    getDay().meals[pickerMeal].push(Object.assign({name:name,emoji:emoji,isRecipe:true,recipeId:rec.id,portions:portions,ingredients:ings},scaled));
    showToast(emoji+' '+name+' als Rezept gespeichert');
  } else {
    getDay().meals[pickerMeal].push(Object.assign({name:name,emoji:emoji,isRecipe:true,recipeId:null,portions:portions,ingredients:ings},scaled));
    showToast(emoji+' '+name+' eingetragen');
  }
  var _idx=getDay().meals[pickerMeal].length-1;
  saveS();renderAll();closePicker();animateAdd(pickerMeal);
  checkPregWarn(ings,pickerMeal,_idx);checkDietWarn(ings,pickerMeal,_idx);
}
function pickerPhotoAdd(saveAsRecipe){_pickerAdd('📸','pickerRecipeName','pickerPhotoPortions','Foto-Rezept',saveAsRecipe,true);}

// ─── PICKER: CHAT TAB ───
function pickerSendChat(){
  var msg=document.getElementById('pickerChatInp').value.trim();if(!msg)return;
  if(!isOnline){showToast('Internet benötigt');return;}
  var msgs=document.getElementById('pickerChatMsgs');
  msgs.innerHTML+='<div class="cm u">'+msg+'</div>';
  document.getElementById('pickerChatInp').value='';
  document.getElementById('pickerChatSend').disabled=true;
  document.getElementById('pickerChatResult').classList.add('hidden');
  msgs.scrollTop=msgs.scrollHeight;
  var prompt=getChatPrompt().replace('{MSG}',msg);
  callClaude('claude-haiku-4-5',[{type:'text',text:prompt}],300,
    function(text){
      var raw=parseIngJSON(text);
      if(!raw.length){msgs.innerHTML+='<div class="cm a">❌ Konnte nicht parsen. Genauer beschreiben.</div>';document.getElementById('pickerChatSend').disabled=false;return;}
      msgs.innerHTML+='<div class="cm a">✨ '+raw.length+' Zutaten erkannt. Suche Nährwerte...</div>';
      msgs.scrollTop=msgs.scrollHeight;
      lookupNutrients(raw,function(resolved){
        pickerIngredients=resolved;
        if(!document.getElementById('pickerChatRecipeName').value)
          document.getElementById('pickerChatRecipeName').value=msg.slice(0,50);
        pickerRenderIngList('pickerChatIngList',pickerIngredients,
          function(i,v){pickerIngredients[i].amount=parseFloat(v)||0;pickerUpdateChatTotal();},
          function(i){pickerIngredients.splice(i,1);pickerUpdateChatTotal();pickerRenderIngList('pickerChatIngList',pickerIngredients,function(i,v){pickerIngredients[i].amount=parseFloat(v)||0;pickerUpdateChatTotal();},function(i){pickerIngredients.splice(i,1);pickerUpdateChatTotal();});}
        );
        pickerUpdateChatTotal();
        document.getElementById('pickerChatResult').classList.remove('hidden');
        document.getElementById('pickerChatSend').disabled=false;
      });
    },
    function(err){msgs.innerHTML+='<div class="cm a">❌ Fehler: '+err+'</div>';document.getElementById('pickerChatSend').disabled=false;}
  );
}

function pickerUpdateChatTotal(){pickerUpdateTotal('Chat');}

function pickerChatAdd(saveAsRecipe){_pickerAdd('💬','pickerChatRecipeName','pickerChatPortions','Chat-Eintrag',saveAsRecipe,true);}

// ─── PICKER: LINK/URL TAB ───
function pickerLinkDetect(){
  var raw=document.getElementById('pickerLinkInput').value;
  var url=recipeImportExtractUrl(raw);
  var info=document.getElementById('pickerLinkUrlInfo');
  var btn=document.getElementById('pickerLinkImportBtn');
  if(url){
    info.innerHTML='<div style="background:#f0faf4;border:1.5px solid var(--g2);border-radius:10px;padding:6px 10px;font-size:11px;word-break:break-all;">'
      +'<span style="color:var(--g2);font-weight:800;">✓ URL erkannt: </span><span style="color:#555;">'+url+'</span></div>';
    btn.disabled=false;btn.style.opacity='1';
  } else if(raw.trim()){
    info.innerHTML='<div style="background:#fff8e1;border:1.5px solid #f9a825;border-radius:10px;padding:6px 10px;font-size:11px;color:#888;">Keine URL gefunden – bitte Link einfügen.</div>';
    btn.disabled=true;btn.style.opacity='.4';
  } else {
    info.innerHTML='';btn.disabled=true;btn.style.opacity='.4';
  }
}

function pickerLinkImport(){
  var raw=document.getElementById('pickerLinkInput').value;
  var url=recipeImportExtractUrl(raw);
  if(!url)return;
  if(!canUseAi()){showAiUnavailable();return;}
  var btn=document.getElementById('pickerLinkImportBtn');
  btn.disabled=true;btn.textContent='⏳ Laden...';btn.style.opacity='.6';
  fetch('https://corsproxy.io/?'+encodeURIComponent(url))
    .then(function(r){return r.text();})
    .then(function(html){
      var text=html.replace(/<script[\s\S]*?<\/script>/gi,'')
                   .replace(/<style[\s\S]*?<\/style>/gi,'')
                   .replace(/<[^>]+>/g,' ')
                   .replace(/\s+/g,' ')
                   .slice(0,3000);
      callClaude('claude-haiku-4-5',[{type:'text',text:
        'Extrahiere das Rezept aus diesem Text und gib NUR gültiges JSON zurück:\n'
        +'{"name":"Rezeptname","zutaten":[{"name":"Zutat","menge":"100g"}],"anleitung":"Zubereitungsschritte (optional)"}\n'
        +'Text: '+text}],800,
        function(resp){
          try{
            var a=resp.indexOf('{'),z=resp.lastIndexOf('}');
            var d=JSON.parse(resp.slice(a,z+1));
            if(!d.name||!d.zutaten||!d.zutaten.length)throw new Error();
            var rawItems=d.zutaten.map(function(z){
              var g=parseFloat((z.menge||'').replace(/[^\d.]/g,''))||100;
              return{name:z.name,g:g,emoji:emo(z.name)};
            });
            window._pickerLinkInstructions=d.anleitung||'';
            lookupNutrients(rawItems,function(ings){
              pickerIngredients=ings;
              document.getElementById('pickerLinkRecipeName').value=d.name;
              pickerRenderIngList('pickerLinkIngList',pickerIngredients,
                function(i,v){pickerIngredients[i].amount=parseFloat(v)||0;pickerUpdateLinkTotal();},
                function(i){pickerIngredients.splice(i,1);pickerUpdateLinkTotal();}
              );
              pickerUpdateLinkTotal();
              document.getElementById('pickerLinkResult').classList.remove('hidden');
              btn.disabled=false;btn.textContent='🔗 Neu laden';btn.style.opacity='1';
            });
          }catch(e){
            showToast('Rezept konnte nicht erkannt werden');
            btn.disabled=false;btn.textContent='🔗 Rezept laden';btn.style.opacity='1';
          }
        },
        function(){
          showToast('Import fehlgeschlagen');
          btn.disabled=false;btn.textContent='🔗 Rezept laden';btn.style.opacity='1';
        }
      );
    })
    .catch(function(){
      showToast('URL konnte nicht geladen werden');
      btn.disabled=false;btn.textContent='🔗 Rezept laden';btn.style.opacity='1';
    });
}

function pickerUpdateLinkTotal(){pickerUpdateTotal('Link');}

function pickerLinkAdd(saveAsRecipe){
  _pickerAdd('🔗','pickerLinkRecipeName','pickerLinkPortions','Rezept',saveAsRecipe,true);
  // Kochanleitung auf das zuletzt gespeicherte Rezept übertragen
  if(saveAsRecipe&&window._pickerLinkInstructions&&recipes.length){
    recipes[0].instructions=window._pickerLinkInstructions;
    saveX();
  }
  window._pickerLinkInstructions='';
}

// ─── PICKER: EIGENES TAB ───
function pickerSaveOwn(){
  var name=document.getElementById('ownName').value.trim();if(!name){showToast('Name eingeben');return;}
  var emoji=document.getElementById('ownEmoji').value.trim()||emo(name);
  var food={name:name,emoji:emoji,per100:{kcal:parseFloat(document.getElementById('ownKcal').value)||0,protein:parseFloat(document.getElementById('ownProtein').value)||0,carbs:parseFloat(document.getElementById('ownCarbs').value)||0,fat:parseFloat(document.getElementById('ownFat').value)||0,sugar:0,fiber:0,salt:0}};
  customFoods.unshift(food);saveX();
  ['ownName','ownEmoji','ownKcal','ownProtein','ownCarbs','ownFat'].forEach(function(id){document.getElementById(id).value='';});
  showToast(emoji+' '+name+' gespeichert');
  pickerSetTab('search');pickerLoadDefaultResults();
}

// ─── PICKER: QUICKTRACK TAB ───
function pickerQuicktrack(){
  var name=document.getElementById('qtName').value.trim()||'Quicktrack';
  var kcal=parseFloat(document.getElementById('qtKcal').value)||0;
  if(!kcal){showToast('Kalorien eingeben');return;}
  var p=parseFloat(document.getElementById('qtProtein').value)||0;
  var c=parseFloat(document.getElementById('qtCarbs').value)||0;
  var f=parseFloat(document.getElementById('qtFat').value)||0;
  getDay().meals[pickerMeal].push({name:name,emoji:'⚡',amount:100,per100:{kcal:kcal,protein:p,carbs:c,fat:f,sugar:0,fiber:0,salt:0},kcal:kcal,protein:p,carbs:c,fat:f,sugar:0,fiber:0,salt:0});
  saveS();renderAll();closePicker();
  showToast('⚡ '+name+' eingetragen');
}

// ─── PICKER: universal ingredient list renderer ───
function pickerRenderIngList(elId,ings,onAmtChange,onDel){
  var el=document.getElementById(elId);if(!el)return;
  el.innerHTML=(ings||[]).map(function(ing,i){
    var missingG=ing.missingGrams||(ing.amount===null||ing.amount===undefined);
    var amtVal=missingG?'':(ing.amount||'');
    var borderStyle=missingG?'border-color:var(--or);':'';
    var warn=missingG?'<span style="font-size:11px;color:var(--or);">⚠️</span>':'';
    var ampelDot=(S.pregWarn&&ing.pregAmpel?pregAmpelDot(ing.pregAmpel.ampel):'')+(S.dietWarn&&ing.dietAmpel?dietAmpelDot(ing.dietAmpel.ampel):'');
    var nid=elId+'-n-'+i;
    return'<div class="ing-wrap">'
      +'<div class="ing-item">'
      +'<div class="ing-e" onclick="ingToggle(event,\''+nid+'\')">'+(ing.emoji||'🍽')+'</div>'
      +'<div class="ing-n" onclick="ingToggle(event,\''+nid+'\')">'+ing.name+ampelDot+'</div>'
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
