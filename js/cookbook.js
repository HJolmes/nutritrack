// @ts-check
// NutriTrack – Kochbuch (v0.317)
// Klassisches Script, kein Modul. Exportiert window.NTBook und greift direkt auf
// die globalen Helfer aus index.html und js/calc.js zu (S, recipes, saveS,
// saveX, openOv, closeOv, esc, showToast, renderAll; ingTotal, scaleNutrients,
// totalStr, recipeSteps, stepTimers, scaleIngs, bookIngLine, bookFilter,
// bookSort, bookTags, parseTags, fmtDate, today, emo, fuzzy, dbPer100) und auf
// NTPlan, NTShop und NTPicker.
//
// ── Ein Bestand ───────────────────────────────────────────────────────────
// Das Kochbuch IST die Rezeptbibliothek: `recipes` in nt_x, je Portion
// gespeichert. Wochenplan ({r,p}), Einkaufszettel und Tagebuch lesen dieselben
// Rezepte; was dort entsteht, ist eine Kopie (Tagebuch, Zettel) oder ein
// Verweis (Plan) — keiner dieser Wege schreibt ins Rezept zurueck.
//
// ── Ein Rezept aendert sich nur, wenn man es bearbeitet ───────────────────
// Der Editor arbeitet auf einem ENTWURF (_draft, tiefe Kopie). Erst
// „Speichern“ ersetzt das Rezept; ✕, ein Tipp daneben oder ein Abbruch lassen
// es unberuehrt. Bis v0.316 schrieb der Editor jede Mengenaenderung sofort in
// das Bibliotheksrezept, auch wenn danach niemand speicherte. Der
// Portionsrechner der Ansicht und des Kochmodus rechnet nur fuer die Anzeige.
// Kochverlauf (S.cookLog) steht deshalb auch nicht am Rezept.
//
// Im Editor stehen die Mengen fuer das GANZE Rezept (baseServings Portionen),
// gespeichert wird je Portion — wie ein Kochbuch es schreibt, wie der Rest der
// App es rechnet.
//
// ── Fuer dich angepasst (v0.318) ──────────────────────────────────────────
// view(r) liefert das Rezept so, wie es fuer die Angaben im Profil auf den
// Tisch kommt (vegetarisch, schwanger, glutenfrei …): erst die Tausch-Tabelle
// (js/book-swaps.js ueber adaptRecipe in js/calc.js), dann — einmal je Rezept
// und Profil, wenn online — die KI fuer alles, was die Tabelle nicht kennt.
// Gespeichert bleibt das Original; der Schalter „Original anzeigen“ zeigt es.
// Ansicht, Kochmodus, Wochenplan, Einkauf und Tagebuch rechnen alle mit view().
//
// ── Grundbestand ──────────────────────────────────────────────────────────
// js/book-seed.js (101 Gerichte aus MorphCook, erzeugt von
// tools/build-book-seed.js) wird beim ersten Start nachgeladen und in
// `recipes` uebernommen — danach sind es gewoehnliche Rezepte: aenderbar,
// loeschbar. Geloeschte stehen in S.bookSeedOff und kommen nicht wieder.
(function(){
'use strict';

var SLOTS=[
  {id:'breakfast',ic:'🌅',label:'Frühstück'},
  {id:'lunch',    ic:'☀️',label:'Mittagessen'},
  {id:'dinner',   ic:'🌙',label:'Abendessen'},
  {id:'snack',    ic:'🍎',label:'Snack'}
];
// Mahlzeit-Marker (r.meal): die Slots plus Getraenk.
var MEALS=SLOTS.map(function(s){return {id:s.id,ic:s.ic,label:s.label.replace('essen','')};})
  .concat([{id:'drink',ic:'🥤',label:'Getränk'}]);
function mealTags(r){
  return bookMeals(r).map(function(id){
    var m=MEALS.filter(function(x){return x.id===id;})[0];
    return m?'<span class="bk-tag bk-meal">'+m.ic+' '+esc(m.label)+'</span>':'';
  }).join('');
}
var SORTS=[['new','Neueste zuerst'],['az','A–Z'],['cooked','Zuletzt gekocht'],['often','Am häufigsten gekocht'],['time','Schnell zuerst'],['kcal','Wenig kcal zuerst']];

function rec(id){for(var i=0;i<recipes.length;i++)if(recipes[i].id===id)return recipes[i];return null;}
function isOpen(id){var e=document.getElementById(id);return !!(e&&e.classList.contains('open'));}
function servingsOf(r){return Math.max(1,Math.round((r&&r.baseServings)||1));}
function logOf(id){var l=S.cookLog&&S.cookLog[id];return l||{n:0,last:''};}
function args(a){return esc(JSON.stringify(a));}
function guessEmoji(name){var e=emo(name||'');return (e&&e!=='🍽')?e:'📋';}

// ══════════════════════════════════════════════════════════════════════════
// GRUNDBESTAND
// ══════════════════════════════════════════════════════════════════════════
// SEED_V muss zu BOOK_SEED.v in js/book-seed.js passen (tools/check.js).
var SEED_V=1,_seedLoading=false;
function boot(){
  renderCard();
  fixSeedMeals();
  if((S.bookSeedV||0)>=SEED_V)return;
  setTimeout(loadSeed,1500);
}
function loadSeed(cb){
  if(window.BOOK_SEED){mergeSeed();if(cb)cb();return;}
  if(_seedLoading)return;
  _seedLoading=true;
  var sc=document.createElement('script');
  sc.src='js/book-seed.js?v='+APP_VERSION;
  sc.onload=function(){_seedLoading=false;mergeSeed();if(cb)cb();};
  sc.onerror=function(){_seedLoading=false;};
  document.head.appendChild(sc);
}
function mergeSeed(){
  var seed=window.BOOK_SEED;
  if(!seed||!Array.isArray(seed.recipes))return 0;
  if(window.NTTab&&!NTTab.canWrite())return 0;
  var off=Array.isArray(S.bookSeedOff)?S.bookSeedOff:[],have={},n=0;
  recipes.forEach(function(r){have[r.id]=1;if(r.seed)have['s:'+r.seed]=1;});
  seed.recipes.forEach(function(sr){
    if(off.indexOf(sr.id)>=0||have[sr.id]||have['s:'+sr.seed])return;
    var cp=JSON.parse(JSON.stringify(sr));cp.meal=bookSeedMeal(cp);
    recipes.push(cp);n++;
  });
  S.bookSeedV=seed.v||SEED_V;
  saveX();saveS();
  render();
  if(window.NTPlan&&NTPlan.render)NTPlan.render();
  return n;
}
// Einmalig: Grundrezepte, die vor den Mahlzeit-Markern geladen wurden, tragen
// bei Desserts und Snacks noch Mittag/Abend aus MorphCook.
function fixSeedMeals(){
  if(S.bookMealV||(window.NTTab&&!NTTab.canWrite()))return;
  recipes.forEach(function(r){if(r.seed)r.meal=bookSeedMeal(r);});
  S.bookMealV=1;
  saveX();saveS();
}

// ══════════════════════════════════════════════════════════════════════════
// FUER DICH ANGEPASST
// ══════════════════════════════════════════════════════════════════════════
var _orig={};          // Rezept-ID → true: „Original anzeigen“ ist an
var _memo={};          // id → {r, key, v}
// Ersatz aus der eigenen Lebensmittel-Datenbank (eigene Lebensmittel zuerst).
var _dbIdx=null;
function lookupFood(name){
  for(var i=0;i<customFoods.length;i++)if(customFoods[i].name===name)return {name:name,emoji:customFoods[i].emoji,per100:customFoods[i].per100};
  if(!_dbIdx){_dbIdx={};for(var j=DB.length-1;j>=0;j--)_dbIdx[DB[j].n]=DB[j];}
  var d=_dbIdx[name];
  return d?{name:d.n,emoji:d.e,per100:dbPer100(d)}:null;
}
function profile(){return bookProfile(S);}
function profileActive(pr){return !!(pr.keys.length||pr.free.length);}
// Kennung des Inhalts — die KI-Antwort gilt nur fuer genau diesen Stand.
function contentHash(r){
  var s=JSON.stringify([r.name,(r.ingredients||[]).map(function(g){return [g.name,g.t||'',g.amount];}),r.instructions||'']);
  var h=5381;for(var i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;
  return (h>>>0).toString(36);
}
// ── KI-Ergaenzung: einmal je Rezept und Profil, gemerkt in nt_book_ai ──
var AI_KEY='nt_book_ai',AI_MAX=150,_ai=null,_aiBusy={},_aiErr={};
function aiStore(){
  if(!_ai){try{_ai=JSON.parse(localStorage.getItem(AI_KEY)||'{}')||{};}catch(e){_ai={};}}
  return _ai;
}
function aiSave(){
  if(window.NTTab&&!NTTab.canWrite())return;
  var st=aiStore(),keys=Object.keys(st);
  if(keys.length>AI_MAX){
    keys.sort(function(a,b){return (st[a].at||0)-(st[b].at||0);});
    keys.slice(0,keys.length-AI_MAX).forEach(function(k){delete st[k];});
  }
  try{localStorage.setItem(AI_KEY,JSON.stringify(st));}catch(e){}
}
function aiKey(r,pr){return r.id+'|'+contentHash(r)+'|'+pr.sig;}
function aiState(r,pr){
  if(!profileActive(pr))return '';
  var k=aiKey(r,pr);
  if(aiStore()[k])return 'done';
  if(_aiBusy[k])return 'busy';
  if(_aiErr[k])return 'err';
  if(typeof isOnline!=='undefined'&&!isOnline)return 'off';
  if(!canUseAi())return 'noai';
  return 'todo';
}
function aiApply(v,entry,serv){
  (entry.t||[]).forEach(function(t){
    var want=bookFold(t.zutat).trim();
    var idx=-1;
    for(var i=0;i<v.ingredients.length&&idx<0;i++){
      var g=v.ingredients[i];
      if(bookFold(bookIngShort(g)).trim()===want||bookFold(g.name).trim()===want||bookFold(g.t||'').trim()===want)idx=i;
    }
    if(idx<0)return;
    var old=v.ingredients[idx],from=bookIngShort(old);
    if(!t.neu){
      v.ingredients.splice(idx,1);
      v.swaps.push({from:from,to:'',why:t.grund||'',k:'ki',m:'',ki:1});
      return;
    }
    v.ingredients[idx]={name:t.name||t.neu,emoji:t.emoji||old.emoji,amount:Math.round((t.g||0)/serv*10)/10,
      per100:t.per100||old.per100,t:t.neu,was:old.was||from};
    v.swaps.push({from:from,to:t.neu,why:t.grund||'',k:'ki',m:'',ki:1});
  });
  if(entry.s&&entry.s.length){v.instructions=entry.s.join('\n');v.aiSteps=true;}
  if(entry.n&&(v.swaps.length||v.aiSteps))v.name=entry.n;
}
function aiCheck(r){
  var pr=profile(),st=aiState(r,pr);
  if(st!=='todo')return;
  var k=aiKey(r,pr),serv=servingsOf(r);
  _aiBusy[k]=1;
  var base=view(r,false);
  var list=base.ingredients.map(function(g){
    var amt=Math.round((g.amount||0)*serv);
    return '- '+(amt>0?amt+' g ':'')+bookIngShort(g)+(g.was?' (statt '+g.was+')':'');
  }).join('\n');
  var steps=recipeSteps(r.instructions).map(function(x,i){return (i+1)+'. '+x;}).join('\n');
  var prompt='Du passt ein Rezept an die Ernährung einer Person an. Vorgaben: '+pr.labels.join(', ')+'.\n'
    +'Rezept „'+r.name+'“ für '+serv+' Portionen.\n'
    +'Zutaten (Menge für das ganze Rezept; „statt …“ ist schon getauscht):\n'+list+'\n'
    +(steps?'Zubereitung:\n'+steps+'\n':'')
    +'Prüfe jede Zutat und jeden Schritt gegen die Vorgaben — auch versteckt: Alkohol, rohes oder kaum gegartes Ei, '
    +'nicht durchgegartes Fleisch oder Fisch, Rohmilchkäse, Gelatine, Fisch- oder Austernsauce, Gluten in Saucen und Fertigprodukten.\n'
    +'Antworte NUR mit JSON ohne Markdown:\n'
    +'{"titel":"<Name der angepassten Fassung, leer wenn der alte passt>","tausch":[{"zutat":"<Name genau wie in der Liste, ohne Menge>","neu":"<Ersatz als einfacher deutscher Lebensmittelname, leer = weglassen>","g":<Gramm für das ganze Rezept>,"grund":"<höchstens 8 Wörter>"}],'
    +'"schritte":["<alle Schritte, angepasst an alle Täusche>"]}\n'
    +'Passt schon alles: "tausch":[]. "titel" nur, wenn der Name eine getauschte Zutat nennt („Hähnchen-Curry“ → „Tofu-Curry“). '
    +'"schritte" nur, wenn ein Schritt eine getauschte Zutat nennt oder sich ändern muss, sonst [].';
  var done=function(entry){
    delete _aiBusy[k];
    entry.at=Date.now();
    aiStore()[k]=entry;aiSave();
    delete _memo[r.id];
    refreshViews(r.id);
  };
  callClaude('claude-haiku-5-5',[{type:'text',text:prompt}],1600,function(text){
    var d=null,txt=String(text||''),a=txt.indexOf('{'),z=txt.lastIndexOf('}');
    try{if(a>=0&&z>a)d=JSON.parse(txt.slice(a,z+1));}catch(e){d=null;}
    if(!d||!Array.isArray(d.tausch)){delete _aiBusy[k];_aiErr[k]=1;refreshViews(r.id);return;}
    var t=d.tausch.filter(function(x){return x&&x.zutat;}).slice(0,20).map(function(x){
      return {zutat:String(x.zutat).slice(0,80),neu:String(x.neu||'').trim().slice(0,80),g:Math.max(0,parseFloat(x.g)||0),grund:String(x.grund||'').slice(0,80)};
    });
    var s2=Array.isArray(d.schritte)?d.schritte.map(function(x){return String(x||'').trim();}).filter(Boolean).slice(0,40):[];
    var ti=String(d.titel||'').trim().slice(0,90);
    var need=t.filter(function(x){return x.neu;});
    if(!need.length){done({t:t,s:s2,n:ti});return;}
    // Naehrwerte der neuen Zutaten wie bei jedem Import: Datenbank, OFF, KI.
    lookupNutrients(need.map(function(x){return {name:x.neu,g:x.g||null};}),function(res){
      need.forEach(function(x,i){var r0=res[i]||{};x.name=r0.name||x.neu;x.emoji=r0.emoji;x.per100=r0.per100;});
      done({t:t,s:s2,n:ti});
    });
  },function(){delete _aiBusy[k];_aiErr[k]=1;refreshViews(r.id);});
  refreshViews(r.id);
}
function refreshViews(id){
  if(isOpen('bookDetailOv')&&_cur===id)renderDetail();
  if(isOpen('cookOv')&&_ck&&_ck.id===id)renderCook();
  if(window.NTPlan&&NTPlan.render&&isOpen('planOv'))NTPlan.render();
}
// Das Rezept, wie es auf den Tisch kommt. forceOrig: true = Original, false =
// angepasst (Schalter ueberstimmt), undefined = wie der Schalter steht.
// Zurueck: {name, emoji, ingredients, instructions, swaps, adapted, orig, ai, prof}
function view(r,forceOrig){
  if(!r)return null;
  var pr=profile();
  var orig=forceOrig===true||(forceOrig!==false&&!!_orig[r.id]);
  var ai=aiState(r,pr);
  var key=pr.sig+'|'+(orig?1:0)+'|'+ai;
  var m=_memo[r.id];
  if(m&&m.r===r&&m.key===key)return m.v;
  var v={name:r.name,emoji:r.emoji||'📋',ingredients:r.ingredients||[],instructions:r.instructions||'',
    swaps:[],adapted:false,orig:orig,ai:ai,prof:pr,aiSteps:false};
  if(!orig&&profileActive(pr)){
    var a=adaptRecipe(r,pr,window.BOOK_SWAPS||[],lookupFood);
    v.ingredients=a.ingredients;v.swaps=a.swaps;
    var entry=ai==='done'?aiStore()[aiKey(r,pr)]:null;
    if(entry)aiApply(v,entry,servingsOf(r));
    v.adapted=v.swaps.length>0||v.aiSteps;
  }
  _memo[r.id]={r:r,key:key,v:v};
  return v;
}
function toggleOrig(){
  if(!_cur)return;
  _orig[_cur]=!_orig[_cur];
  renderDetail();
}
function mins(t){
  if(!(t>0))return '';
  return t<60?t+' Min':Math.floor(t/60)+' Std'+(t%60?' '+(t%60)+' Min':'');
}
// Kurzzeile unter dem Namen: Zeit · kcal je Portion · Portionen · gekocht
function metaLine(r){
  var l=logOf(r.id),parts=[];
  if(r.time>0)parts.push('⏱ '+mins(r.time));
  parts.push(Math.round(ingTotal(view(r).ingredients).kcal)+' kcal/Portion');
  if(servingsOf(r)>1)parts.push('für '+servingsOf(r));
  if(l.n)parts.push(l.n+'× gekocht');
  return parts.join(' · ');
}

// ══════════════════════════════════════════════════════════════════════════
// LISTE (im Overlay libraryOv, Reiter „Rezepte“)
// ══════════════════════════════════════════════════════════════════════════
var _tag='',_sort='new';
function setTag(t){_tag=(_tag===t)?'':t;renderList();}
function setSort(s){_sort=s||'new';renderList();}
function renderTools(){
  var el=document.getElementById('bookChips');if(!el)return;
  var tags=bookTags(recipes);
  var hasFav=recipes.some(function(r){return r.fav;});
  if(_tag&&_tag!=='★'&&tags.indexOf(_tag)<0)_tag='';
  if(_tag==='★'&&!hasFav)_tag='';
  var chip=function(t,label){
    return '<button type="button" class="bk-chip'+(_tag===t?' on':'')+'" data-act="NTBook.setTag" data-args="'+args([t])+'">'+esc(label)+'</button>';
  };
  el.innerHTML=chip('','Alle')+(hasFav?chip('★','⭐ Favoriten'):'')
    +tags.map(function(t){return chip(t,t);}).join('');
  var sel=/** @type {HTMLSelectElement|null} */ (document.getElementById('bookSortSel'));
  if(sel&&sel.value!==_sort)sel.value=_sort;
}
function renderList(){
  var ov=document.getElementById('libraryOv');
  if(ov&&ov.getAttribute('data-tab')==='foods')return;
  var el=document.getElementById('libraryList');if(!el)return;
  renderTools();
  if(!recipes.length){
    el.innerHTML='<div class="bk-empty"><div style="font-size:30px;">📖</div>'
      +'<div style="font-weight:700;margin-top:4px;">Dein Kochbuch ist noch leer</div>'
      +'<div class="bk-mu">Leg ein Rezept selbst an, fotografiere eine Kochbuchseite oder hol es über einen Link von Chefkoch, Lecker &amp; Co.</div></div>';
    return;
  }
  var q=(document.getElementById('libSearchQ')||{}).value||'';
  var list=bookSort(bookFilter(recipes,q,_tag),_sort,S.cookLog);
  if(!list.length){el.innerHTML='<div class="bk-empty bk-mu">Keine Rezepte gefunden</div>';return;}
  el.innerHTML=list.map(function(r){
    var cats=mealTags(r)+(r.cat||[]).slice(0,3).map(function(t){return '<span class="bk-tag">'+esc(t)+'</span>';}).join('');
    return '<div class="list-row bk-row" data-act="NTBook.detail" data-args="'+args([r.id])+'">'
      +'<div class="lr-ic">'+esc(r.emoji||'📋')+'</div>'
      +'<div class="lr-body"><div class="lr-name">'+(r.fav?'⭐ ':'')+esc(r.name)+'</div>'
      +'<div class="lr-sub">'+esc(metaLine(r))+'</div>'
      +(cats?'<div class="bk-tags">'+cats+'</div>':'')+'</div>'
      +'<div class="lr-val">›</div></div>';
  }).join('');
}

// ══════════════════════════════════════════════════════════════════════════
// ANSICHT EINES REZEPTS
// ══════════════════════════════════════════════════════════════════════════
var _cur=null,_portions=1,_panel='';
function detail(id){
  var r=rec(id);
  if(!r){showToast('Rezept nicht gefunden');return;}
  _cur=id;_portions=servingsOf(r);_panel='';
  renderDetail();
  openOv('bookDetailOv');
  aiCheck(r);
  var b=document.querySelector('#bookDetailOv .mod');if(b)b.scrollTop=0;
}
function closeDetail(){_panel='';closeOv('bookDetailOv');}
function setPortions(d){
  _portions=Math.max(1,Math.min(99,_portions+d));
  renderIngs('bookDetIngs',view(rec(_cur)),_portions);
  var v=document.getElementById('bookDetP');if(v)v.textContent=String(_portions);
}
// v = view(r): getauschte Zutaten tragen `was` (die Zutat des Originals).
function ingsHtml(v,p){
  return (v.ingredients||[]).map(function(g){
    var l=bookIngLine(g,p);
    return '<div class="bk-ing'+(g.was?' sw':'')+'"><span class="bk-iq">'+esc(l.q||'—')+'</span>'
      +'<span class="bk-in">'+esc(l.n)+(g.was?'<small>↻ statt '+esc(g.was)+'</small>':'')+'</span>'
      +(l.g?'<span class="bk-ig">'+esc(l.g)+'</span>':'')+'</div>';
  }).join('');
}
// Hinweis oben in der Ansicht: angepasst an …, Täusche, KI-Stand, Schalter.
function adaptHtml(v){
  var pr=v.prof;
  if(!profileActive(pr))return '';
  var who=esc(pr.labels.join(', '));
  var aiTxt={busy:'🤖 Die KI prüft gerade die übrigen Zutaten und Schritte …',done:'🤖 Von der KI geprüft.',
    off:'Ohne Internet ist nur die Tausch-Tabelle geprüft.',noai:'Nur die Tausch-Tabelle geprüft (KI nicht eingerichtet).',
    err:'Die KI-Prüfung hat nicht geklappt — nur die Tausch-Tabelle.',todo:''}[v.ai]||'';
  if(v.orig){
    return '<div class="bk-adapt is-orig"><div class="bk-at">📖 Original wird angezeigt</div>'
      +'<div class="bk-mu">Deine Angaben: '+who+'</div>'
      +'<button type="button" class="seb" style="margin-top:8px;" data-act="NTBook.toggleOrig">🌱 Für mich anpassen</button></div>';
  }
  if(!v.adapted){
    return '<div class="bk-adapt"><div class="bk-at">✓ Passt zu deinen Angaben</div>'
      +'<div class="bk-mu">'+who+(aiTxt?' · '+aiTxt:'')+'</div></div>';
  }
  var rows=v.swaps.map(function(s){
    return '<li><b>'+esc(s.from)+'</b> → '+(s.to?esc(s.to):'<i>weglassen</i>')+(s.ki?' 🤖':'')
      +(s.why?'<span> · '+esc(s.why)+'</span>':'')+'</li>';
  }).join('');
  return '<div class="bk-adapt"><div class="bk-at">🌱 Für dich angepasst · '+who+'</div>'
    +(rows?'<ul class="bk-swaps">'+rows+'</ul>':'')
    +(v.aiSteps?'<div class="bk-mu">Die Zubereitung hat die KI an die Täusche angepasst.</div>':'')
    +(aiTxt?'<div class="bk-mu">'+aiTxt+'</div>':'')
    +'<button type="button" class="seb" style="margin-top:8px;" data-act="NTBook.toggleOrig">📖 Original anzeigen</button></div>';
}
function renderIngs(elId,r,p){var el=document.getElementById(elId);if(el&&r)el.innerHTML=ingsHtml(r,p);}
function togglePanel(p){_panel=(_panel===p)?'':p;renderDetail();}
function slotOptions(sel,auto){
  return (auto?'<option value="">Jetzt (nach Uhrzeit)</option>':'')+SLOTS.map(function(s){
    return '<option value="'+s.id+'"'+(s.id===sel?' selected':'')+'>'+s.ic+' '+s.label+'</option>';
  }).join('');
}
// Ins Tagebuch: dieselbe Stelle wie der Picker (Ampel, Toast, Kopie der
// Zutaten) — NTPicker.addRecipeEntry. Gebucht wird in den angezeigten Tag.
function eatPanel(pre){
  var day=S.currentDate||today();
  return '<div class="bk-panel">'
    +'<div class="bk-pt">🍽 Ins Tagebuch · '+esc(fmtDate(day))+'</div>'
    +'<div class="bk-prow"><select class="sinp" id="'+pre+'EatMeal">'+slotOptions('',true)+'</select>'
    +'<input type="number" class="sinp bk-pn" id="'+pre+'EatP" value="1" min="0.25" step="0.25" title="Portionen"><span class="bk-mu">Port.</span></div>'
    +'<button type="button" class="svb" data-act="NTBook.eatNow" data-args="'+args([pre])+'">✓ Eintragen</button>'
    +'</div>';
}
function eatNow(pre){
  var id=pre==='cook'?(_ck&&_ck.id):_cur;
  if(!id||!window.NTPicker||!NTPicker.addRecipeEntry)return;
  var m=(document.getElementById(pre+'EatMeal')||{}).value||null;
  var p=parseFloat((document.getElementById(pre+'EatP')||{}).value)||1;
  if(!NTPicker.addRecipeEntry(id,m,p,!!_orig[id]))return;
  if(pre==='cook'){cookClose(true);return;}
  _panel='';renderDetail();
}
// Vorauswahl im Einplanen: der erste Marker, sonst Abendessen.
function planSlotOf(r){
  var m=bookMeals(r).filter(function(x){return x!=='drink';});
  return m[0]||'dinner';
}
function planPanel(){
  return '<div class="bk-panel">'
    +'<div class="bk-pt">📅 In den Wochenplan</div>'
    +'<div class="bk-prow"><input type="date" class="sinp" id="bookPlanDate" value="'+esc(S.currentDate||today())+'">'
    +'<select class="sinp" id="bookPlanSlot">'+slotOptions(planSlotOf(rec(_cur)),false)+'</select></div>'
    +'<div class="bk-prow"><span class="bk-mu">Portionen für dich</span><input type="number" class="sinp bk-pn" id="bookPlanP" value="1" min="0.25" step="0.25"></div>'
    +'<button type="button" class="svb" data-act="NTBook.planNow">📅 Einplanen</button>'
    +'</div>';
}
function planNow(){
  var r=rec(_cur);if(!r||!window.NTPlan||!NTPlan.planRecipe)return;
  var d=(document.getElementById('bookPlanDate')||{}).value||'';
  var sl=(document.getElementById('bookPlanSlot')||{}).value||'dinner';
  var p=parseFloat((document.getElementById('bookPlanP')||{}).value)||1;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d)){showToast('Bitte einen Tag wählen');return;}
  if(!NTPlan.planRecipe(d,sl,r.id,p,!!_orig[r.id]))return;
  var s=SLOTS.filter(function(x){return x.id===sl;})[0];
  showToast('📅 '+r.name+' · '+(s?s.label:'')+' '+fmtDate(d)+' eingeplant ✓');
  _panel='';renderDetail();
}
function toShop(){
  if(!window.NTShop){showToast('Einkaufszettel nicht verfügbar');return;}
  NTShop.addRecipe(_cur,_portions,!!_orig[_cur]);
}
function toggleFav(){
  var r=rec(_cur);if(!r)return;
  r.fav=!r.fav;if(!r.fav)delete r.fav;
  saveX();renderDetail();render();
  showToast(r.fav?'⭐ Favorit':'Kein Favorit mehr');
}
function duplicate(){
  var r=rec(_cur);if(!r)return;
  var c=JSON.parse(JSON.stringify(r));
  c.id=Date.now().toString();c.name=r.name+' (Kopie)';delete c.fav;
  recipes.unshift(c);saveX();render();
  detail(c.id);
  showToast('⎘ Kopie angelegt — jetzt bearbeiten');
}
// Unter einem Schritt: welche Zutat dort jetzt anders ist (nur ohne KI-Text).
function stepNote(v,step){
  if(v.orig||v.aiSteps||!v.swaps.length)return '';
  var hits=bookStepSwaps(step,v.swaps);
  if(!hits.length)return '';
  return '<small class="bk-stepsw">'+hits.map(function(s){return '↻ '+(s.to?esc(s.to)+' statt '+esc(s.from):esc(s.from)+' weglassen');}).join(' · ')+'</small>';
}
function renderDetail(){
  var r=rec(_cur);
  if(!r){closeOv('bookDetailOv');return;}
  var v=view(r);
  var t=document.getElementById('bookDetTitle');if(t)t.textContent=(r.emoji||'📋')+' '+v.name;
  var sub=document.getElementById('bookDetSub');if(sub)sub.textContent=metaLine(r)+(v.adapted?' · 🌱 angepasst':'');
  var el=document.getElementById('bookDetBody');if(!el)return;
  var steps=recipeSteps(v.instructions);
  var l=logOf(r.id),per=ingTotal(v.ingredients);
  var src=String(r.src||''),host='';
  if(/^https?:\/\//i.test(src)){try{host=new URL(src).hostname.replace(/^www\./,'');}catch(e){host='';}}
  var btn=function(act,label){return '<button type="button" class="bk-act" data-act="'+act+'">'+label+'</button>';};
  var tags=mealTags(r)+(r.cat||[]).map(function(c){return '<span class="bk-tag">'+esc(c)+'</span>';}).join('');
  el.innerHTML=
    (tags?'<div class="bk-tags" style="margin:0 0 10px;">'+tags+'</div>':'')
    +(bookMeals(r).length?'':'<div class="bk-mu" style="margin:0 0 10px;">Keine Mahlzeit gewählt – „🎲 Füllen“ plant das Rezept nicht ein. ✏️ Bearbeiten → Passt zu.</div>')
    +'<button type="button" class="svb" style="margin:0 0 8px;" data-act="NTBook.cook" data-args="'+args([r.id,0])+'">👨‍🍳 Kochen'+(steps.length?' · '+steps.length+' Schritt'+(steps.length===1?'':'e'):'')+'</button>'
    +'<div class="bk-acts">'
      +'<button type="button" class="bk-act'+(_panel==='plan'?' on':'')+'" data-act="NTBook.togglePanel" data-args="'+args(['plan'])+'">📅<span>Einplanen</span></button>'
      +'<button type="button" class="bk-act" data-act="NTBook.toShop">🛒<span>Einkaufen</span></button>'
      +'<button type="button" class="bk-act'+(_panel==='eat'?' on':'')+'" data-act="NTBook.togglePanel" data-args="'+args(['eat'])+'">🍽<span>Eintragen</span></button>'
      +'<button type="button" class="bk-act'+(r.fav?' on':'')+'" data-act="NTBook.toggleFav">'+(r.fav?'⭐':'☆')+'<span>Favorit</span></button>'
    +'</div>'
    +(_panel==='plan'?planPanel():'')+(_panel==='eat'?eatPanel('book'):'')
    +(r.desc&&!v.adapted?'<div class="bk-desc">'+esc(r.desc)+'</div>':'')
    +adaptHtml(v)
    +'<div class="bk-sec"><div class="bk-sh">Zutaten</div>'
      +'<div class="bk-scale"><button type="button" data-act="NTBook.setPortions" data-args="[-1]">−</button>'
      +'<b id="bookDetP">'+_portions+'</b><span>Portion'+(_portions===1?'':'en')+'</span>'
      +'<button type="button" data-act="NTBook.setPortions" data-args="[1]">＋</button></div></div>'
    +'<div id="bookDetIngs" class="bk-ings">'+ingsHtml(v,_portions)+'</div>'
    +'<div class="bk-mu" style="margin:4px 2px 0;">1 Portion: '+esc(totalStr(per))+'. Der Rechner ändert nur die Anzeige, nicht das Rezept.</div>'
    +'<div class="bk-sec"><div class="bk-sh">Zubereitung</div></div>'
    +(steps.length
      ?'<ol class="bk-steps">'+steps.map(function(s){return '<li>'+esc(s)+stepNote(v,s)+'</li>';}).join('')+'</ol>'
      :'<div class="bk-mu">Noch keine Zubereitung hinterlegt — über ✏️ Bearbeiten ergänzen.</div>')
    +(r.note?'<div class="bk-sec"><div class="bk-sh">Notizen</div></div><div class="bk-note">'+esc(r.note)+'</div>':'')
    +'<div class="bk-foot">'
      +(host?'<a class="bk-src" href="'+esc(src)+'" target="_blank" rel="noopener noreferrer">🔗 '+esc(r.seed?'MorphCook':host)+'</a>':'')
      +(r.seed?'<div class="bk-mu">Grundrezept aus MorphCook (MIT-Lizenz), von einer KI geschrieben; Nährwerte aus der NutriTrack-Datenbank.</div>':'')
      +(l.n?'<div class="bk-mu">👨‍🍳 '+l.n+'× gekocht · zuletzt '+esc(fmtDate(l.last))+'</div>':'')
    +'</div>'
    +'<div class="bk-acts" style="margin-top:12px;">'
      +btn('NTBook.editCur','✏️<span>Bearbeiten</span>')
      +btn('NTBook.duplicate','⎘<span>Kopieren</span>')
      +'<button type="button" class="bk-act" data-act="shareRecipe" data-args="'+args([r.id])+'">📤<span>Teilen</span></button>'
    +'</div>';
}

// ══════════════════════════════════════════════════════════════════════════
// EDITOR (Overlay recEditOv) — arbeitet auf einem Entwurf
// ══════════════════════════════════════════════════════════════════════════
var _draft=null,_dOpts=null,_snap='',_saved=false;
function edit(id){
  var r=rec(id);if(!r)return;
  var d=JSON.parse(JSON.stringify(r));
  d.baseServings=servingsOf(r);
  d.ingredients=scaleIngs(r.ingredients||[],d.baseServings);
  openEditor(d,{isNew:false});
}
function editCur(){if(_cur)edit(_cur);}
// Neues Rezept (selbst, Foto, Link, Mahlzeit): `d` traegt die Mengen fuer das
// ganze Rezept. opts.from: 'plan' | 'library' | 'mealDetail' | 'picker' | null,
// opts.hint: Hinweis ueber dem Formular.
function editDraft(d,opts){
  d=JSON.parse(JSON.stringify(d||{}));
  d.id=Date.now().toString();
  d.name=String(d.name||'');
  d.emoji=d.emoji||guessEmoji(d.name);
  d.ingredients=d.ingredients||[];
  d.baseServings=Math.max(1,Math.round(d.baseServings||1));
  openEditor(d,Object.assign({isNew:true},opts||{}));
}
function setVal(id,v){var e=document.getElementById(id);if(e)e.value=v==null?'':v;}
function getVal(id){return String((document.getElementById(id)||{}).value||'');}
function openEditor(d,opts){
  _draft=d;_dOpts=opts;_saved=false;
  var t=document.getElementById('recEditTitle');
  if(t)t.textContent=opts.isNew?'📖 Neues Rezept':'✏️ '+(d.emoji||'📋')+' '+d.name;
  var h=document.getElementById('recEditHint');
  if(h){h.textContent=opts.hint||'';h.style.display=opts.hint?'':'none';}
  setVal('recEditName',d.name);setVal('recEditEmoji',d.emoji||'');
  setVal('recEditServ',d.baseServings);setVal('recEditTime',d.time>0?d.time:'');
  setVal('recEditCats',(d.cat||[]).join(', '));
  d.meal=bookMeals(d);
  setVal('recEditInstructions',d.instructions||'');setVal('recEditNote',d.note||'');
  setVal('recEditSrc',d.src||'');setVal('recEditSearchQ','');
  var del=document.getElementById('recEditDelBtn');if(del)del.style.display=opts.isNew?'none':'';
  renderEditIngs();renderCatChips();renderMealChips();editSearch();
  _snap=JSON.stringify(readFields(JSON.parse(JSON.stringify(d))));
  openOv('recEditOv');
  var m=document.querySelector('#recEditOv .mod');if(m)m.scrollTop=0;
}
function readFields(d){
  d.name=getVal('recEditName').trim();
  d.emoji=getVal('recEditEmoji').trim()||guessEmoji(d.name);
  d.baseServings=Math.max(1,Math.min(99,Math.round(parseFloat(getVal('recEditServ'))||1)));
  var tm=Math.round(parseFloat(getVal('recEditTime'))||0);
  if(tm>0)d.time=tm;else delete d.time;
  d.cat=parseTags(getVal('recEditCats'));
  d.instructions=getVal('recEditInstructions').trim();
  d.note=getVal('recEditNote').trim();
  d.src=getVal('recEditSrc').trim();
  return d;
}
function renderEditIngs(){
  if(!_draft)return;
  if(window.NTPicker)NTPicker.pickerRenderIngList('recEditIngList',_draft.ingredients,
    function(i,v){
      var g=_draft&&_draft.ingredients[i];if(!g)return;
      var nv=parseFloat(v)||0;
      // Die Menge aus der Quelle („2 EL“) waechst mit den Gramm mit, sonst
      // stuende in der Ansicht weiter die alte Angabe neben der neuen Zahl.
      if(g.q>0&&g.amount>0&&nv>0)g.q=Math.round(g.q*nv/g.amount*1000)/1000;
      g.amount=nv;if(nv>0)g.missingGrams=false;
      editTotal();
    },
    function(i){if(!_draft)return;_draft.ingredients.splice(i,1);renderEditIngs();}
  );
  editTotal();
}
function editTotal(){
  var el=document.getElementById('recEditTotal');if(!el||!_draft)return;
  var n=Math.max(1,Math.round(parseFloat(getVal('recEditServ'))||1));
  var t=ingTotal(_draft.ingredients);
  el.textContent=_draft.ingredients.length
    ?'Ganzes Rezept: '+totalStr(t)+(n>1?'  ·  1 Portion: '+totalStr(scaleNutrients(t,1/n)):'')
    :'Noch keine Zutaten';
}
function renderCatChips(){
  var el=document.getElementById('recEditCatChips');if(!el)return;
  var have=parseTags(getVal('recEditCats')).map(function(t){return t.toLowerCase();});
  var tags=bookTags(recipes).filter(function(t){return have.indexOf(t.toLowerCase())<0;}).slice(0,12);
  el.innerHTML=tags.map(function(t){
    return '<button type="button" class="bk-chip" data-act="NTBook.addCat" data-args="'+args([t])+'">＋ '+esc(t)+'</button>';
  }).join('');
}
function renderMealChips(){
  var el=document.getElementById('recEditMeals');if(!el||!_draft)return;
  var have=bookMeals(_draft);
  el.innerHTML=MEALS.map(function(m){
    return '<button type="button" class="bk-chip'+(have.indexOf(m.id)>=0?' on':'')+'" data-act="NTBook.toggleMeal" data-args="'+args([m.id])+'">'+m.ic+' '+esc(m.label)+'</button>';
  }).join('');
}
function toggleMeal(id){
  if(!_draft)return;
  _draft.meal=bookToggleMeal(_draft.meal,id);
  renderMealChips();
}
function addCat(t){
  var c=parseTags(getVal('recEditCats'));c.push(t);
  setVal('recEditCats',parseTags(c).join(', '));renderCatChips();
}
// Zutatensuche: eigene Lebensmittel und lokale Datenbank (offline).
var _results=[];
function editSearch(){
  var q=getVal('recEditSearchQ');
  var results=[],seen={};
  customFoods.forEach(function(f){
    var k=f.name.toLowerCase();
    if(seen[k]||(q&&k.indexOf(q.toLowerCase())<0))return;
    seen[k]=true;results.push({name:f.name,emoji:f.emoji,per100:f.per100,score:100});
  });
  DB.forEach(function(f){
    var s=fuzzy(f,q),k=f.n.toLowerCase();
    if((s>0||!q)&&!seen[k]){seen[k]=true;results.push({name:f.n,emoji:f.e,per100:dbPer100(f),score:s});}
  });
  if(q)results.sort(function(a,b){return(b.score||0)-(a.score||0);});
  _results=results.slice(0,12);
  var el=document.getElementById('recEditResults');if(!el)return;
  if(!_results.length){el.innerHTML='<div class="nr" style="padding:8px;">Kein Ergebnis</div>';return;}
  el.innerHTML=_results.map(function(p,i){
    return '<div class="bk-res" data-act="NTBook.editAdd" data-args="['+i+']">'
      +'<div style="font-size:18px;">'+esc(p.emoji||'🍽')+'</div>'
      +'<div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:13px;">'+esc(p.name)+'</div>'
      +'<div class="bk-mu">'+Math.round(p.per100.kcal)+' kcal pro 100 g</div></div>'
      +'<div style="font-size:18px;color:var(--g2);font-weight:900;">＋</div></div>';
  }).join('');
}
function editAdd(i){
  var p=_results[i];if(!p||!_draft)return;
  _draft.ingredients.push({name:p.name,emoji:p.emoji,amount:100,per100:p.per100});
  renderEditIngs();
  showToast((p.emoji||'🍽')+' '+p.name+' hinzugefügt – Menge prüfen');
}
// Gleiches Rezept schon da? Dieselbe Quelle ist eindeutig, sonst fragt die
// Dublettenpruefung des Wochenplans (aehnlicher Name oder fast dieselben Zutaten).
function confirmNew(d,skipId){
  if(d.src){
    var same=recipes.filter(function(r){return r.src&&r.src===d.src&&r.id!==skipId;})[0];
    if(same&&!confirm('Dieses Rezept steht schon im Kochbuch („'+same.name+'“, gleiche Quelle).\n\nTrotzdem zusätzlich anlegen?'))return false;
    if(same)return true;
  }
  if(window.NTPlan&&NTPlan.confirmNotDuplicate&&!NTPlan.confirmNotDuplicate(d.name,d.ingredients,skipId))return false;
  return true;
}
function editSave(){
  var d=_draft,o=_dOpts;if(!d||!o)return;
  readFields(d);
  // Nichts geaendert: nichts schreiben — sonst rundete jedes Speichern die
  // Mengen einmal ueber das ganze Rezept und zurueck.
  if(!o.isNew&&JSON.stringify(d)===_snap&&rec(d.id)){_saved=true;_draft=null;_dOpts=null;closeOv('recEditOv');return;}
  if(!d.name){showToast('Bitte einen Namen eintragen');return;}
  if(!d.ingredients.length){showToast('Mindestens eine Zutat eintragen');return;}
  var missing=d.ingredients.filter(function(g){return !(g.amount>0)&&!g.pu;}).length;
  if(missing&&o.isNew&&!confirm(missing+' Zutat'+(missing===1?' hat':'en haben')+' keine Grammangabe und zählen mit 0 kcal. Trotzdem speichern?'))return;
  var old=o.isNew?null:rec(d.id);
  if(o.isNew||(old&&old.name!==d.name)){if(!confirmNew(d,o.isNew?null:d.id))return;}
  var n=d.baseServings;
  // Vom alten Rezept bleibt, was der Editor nicht kennt (fav und kuenftige Felder).
  /** @type {Record<string, any>} */
  var out=old?JSON.parse(JSON.stringify(old)):{};
  ['baseServings','time','cat','meal','note','src'].forEach(function(k){delete out[k];});
  Object.assign(out,{id:d.id,name:d.name,emoji:d.emoji||'📋',ingredients:scaleIngs(d.ingredients,1/n),instructions:d.instructions||''});
  if(n>1)out.baseServings=n;
  if(d.time>0)out.time=d.time;
  if(d.cat&&d.cat.length)out.cat=d.cat;
  var ml=bookMeals(d);if(ml.length)out.meal=ml;
  if(d.note)out.note=d.note;
  if(d.src)out.src=d.src;
  var idx=-1;for(var i=0;i<recipes.length;i++)if(recipes[i].id===out.id){idx=i;break;}
  if(idx>=0)recipes[idx]=out;else recipes.unshift(out);
  saveX();
  _saved=true;_draft=null;_dOpts=null;
  closeOv('recEditOv');
  if(o.isNew){
    // Wochenplan-Slot befuellen (aus ＋ eines Tages heraus angelegt) und melden.
    if(window.NTPlan&&NTPlan.noteRecipeCreated)NTPlan.noteRecipeCreated(out);
    else showToast((out.emoji||'📋')+' '+out.name+' im Kochbuch gespeichert ✓');
  } else showToast('Rezept gespeichert ✓');
  render();
  if(o.from!=='mealDetail'&&o.from!=='plan')detail(out.id);
  else if(isOpen('bookDetailOv'))renderDetail();
}
// Vom closeOv-Haken in index.html gerufen — bei JEDEM Schliessen des Editors.
// Nicht gespeicherte Aenderungen gehen nur mit Rueckfrage verloren; das
// Rezept selbst ist in keinem Fall angefasst worden.
function editClosed(){
  if(_saved||!_draft){_saved=false;return;}
  var cur=JSON.stringify(readFields(JSON.parse(JSON.stringify(_draft))));
  if(cur!==_snap&&!confirm('Änderungen verwerfen?')){openOv('recEditOv');return;}
  var o=_dOpts;_draft=null;_dOpts=null;
  if(o&&o.isNew&&window.NTPlan&&NTPlan.cancelNew)NTPlan.cancelNew();
}
function planDays(id){
  var n=0,mp=S.mealPlan||{};
  Object.keys(mp).forEach(function(d){
    var p=mp[d];if(!p)return;
    if(SLOTS.some(function(s){return (p[s.id]||[]).some(function(it){return it&&it.r===id;});}))n++;
  });
  return n;
}
function editDelete(){
  var d=_draft;if(!d||!_dOpts||_dOpts.isNew)return;
  var r=rec(d.id);if(!r)return;
  var n=planDays(r.id);
  if(!confirm('„'+r.name+'“ aus dem Kochbuch löschen?'
    +(n?'\n\nEs steht an '+n+' Tag'+(n===1?'':'en')+' im Wochenplan und erscheint dort dann als „Rezept gelöscht“.':'')
    +'\n\nEinträge im Tagebuch bleiben erhalten.'))return;
  recipes.splice(recipes.indexOf(r),1);
  if(S.cookLog)delete S.cookLog[r.id];
  // Ein geloeschtes Grundrezept kommt mit dem naechsten Grundbestand nicht wieder.
  if(r.seed){if(!Array.isArray(S.bookSeedOff))S.bookSeedOff=[];if(S.bookSeedOff.indexOf(r.id)<0)S.bookSeedOff.push(r.id);}
  saveX();saveS();
  _saved=true;_draft=null;_dOpts=null;
  closeOv('recEditOv');
  if(_cur===r.id){_cur=null;closeOv('bookDetailOv');}
  render();
  if(window.NTPlan&&NTPlan.render)NTPlan.render();
  showToast('Rezept gelöscht');
}

// ══════════════════════════════════════════════════════════════════════════
// KOCHMODUS (Overlay cookOv)
// ══════════════════════════════════════════════════════════════════════════
// Ein Schritt je Bildschirm, grosse Schrift, Bildschirm bleibt an (Wake Lock),
// Timer aus den Zeitangaben des Schritts. Die Timer laufen weiter, wenn man
// blaettert, und melden sich mit Vibration, Ton und — im Hintergrund — einer
// Meldung ueber NTRemind. „Fertig gekocht“ zaehlt in S.cookLog.
var _ck=null,_tick=0,_wake=null,_audio=null,_tid=0;
function cook(id,p){
  var r=rec(id);if(!r){showToast('Rezept nicht gefunden');return;}
  var keep=_ck&&_ck.id===id;
  if(_ck&&!keep&&running().length&&!confirm('Für „'+(rec(_ck.id)||{name:'?'}).name+'“ läuft noch ein Timer. Beenden?'))return;
  if(!keep)stopTimers();
  var steps=recipeSteps(view(r).instructions);
  _ck={id:id,steps:steps,i:keep?Math.min(_ck.i,Math.max(0,steps.length-1)):0,p:p||(_cur===id?_portions:servingsOf(r)),
       timers:keep?_ck.timers:[],done:false,ings:!steps.length};
  renderCook();
  openOv('cookOv');
  wakeOn();
  aiCheck(r);
}
function running(){return _ck?_ck.timers.filter(function(t){return !t.done;}):[];}
function stopTimers(){if(_tick){clearInterval(_tick);_tick=0;}if(_ck)_ck.timers=[];}
function cookClose(force){
  if(!force&&running().length&&!confirm('Es läuft noch ein Timer. Kochmodus trotzdem beenden?'))return;
  stopTimers();wakeOff();_ck=null;
  closeOv('cookOv');
}
function cookGo(d){
  if(!_ck)return;
  _ck.i=Math.max(0,Math.min(_ck.steps.length-1,_ck.i+d));
  _ck.done=false;renderCook();
}
function cookIngs(){if(!_ck)return;_ck.ings=!_ck.ings;renderCook();}
function cookPortions(d){if(!_ck)return;_ck.p=Math.max(1,Math.min(99,_ck.p+d));renderCook();}
function fmtClock(s){
  s=Math.max(0,Math.round(s));
  var h=Math.floor(s/3600),m=Math.floor((s%3600)/60),x=s%60;
  return (h?h+':'+String(m).padStart(2,'0'):String(m))+':'+String(x).padStart(2,'0');
}
function renderTimers(){
  var el=document.getElementById('cookTimers');if(!el||!_ck)return;
  var now=Date.now();
  el.innerHTML=_ck.timers.map(function(t){
    var left=t.done?0:(t.end-now)/1000;
    return '<div class="ck-timer'+(t.done?' done':'')+'">'
      +'<span class="ck-tc">'+(t.done?'⏰ Fertig':'⏱ '+fmtClock(left))+'</span>'
      +'<span class="ck-tl">'+esc(t.label)+' · Schritt '+(t.step+1)+'</span>'
      +'<button type="button" data-act="NTBook.timerDrop" data-args="['+t.id+']">✕</button></div>';
  }).join('');
}
function audioCtx(){
  try{
    var AC=window.AudioContext||/** @type {any} */ (window).webkitAudioContext;
    if(!_audio&&AC)_audio=new AC();
    if(_audio&&_audio.state==='suspended')_audio.resume();
  }catch(e){_audio=null;}
  return _audio;
}
function beep(){
  var ctx=audioCtx();if(!ctx)return;
  try{
    [0,0.35,0.7].forEach(function(at){
      var o=ctx.createOscillator(),g=ctx.createGain();
      o.frequency.value=880;g.gain.value=0.25;
      o.connect(g);g.connect(ctx.destination);
      o.start(ctx.currentTime+at);o.stop(ctx.currentTime+at+0.22);
    });
  }catch(e){}
}
function alarm(t){
  var r=_ck?rec(_ck.id):null;
  try{if(navigator.vibrate)navigator.vibrate([400,200,400,200,800]);}catch(e){}
  beep();
  showToast('⏰ '+t.label+' – die Zeit ist um!');
  if(document.hidden&&window.NTRemind&&NTRemind.notify)
    NTRemind.notify('⏰ '+(r?r.name:'Kochmodus'),{body:t.label+' ist abgelaufen',tag:'nt-cook-'+t.id});
}
function tick(){
  if(!_ck){clearInterval(_tick);_tick=0;return;}
  var now=Date.now();
  _ck.timers.forEach(function(t){if(!t.done&&t.end<=now){t.done=true;alarm(t);}});
  renderTimers();
  if(!running().length){clearInterval(_tick);_tick=0;}
}
function timerStart(sec,label){
  if(!_ck)return;
  audioCtx();// im Tipp freischalten — spaeter, ohne Geste, darf iOS keinen Ton anfangen
  _ck.timers.push({id:++_tid,end:Date.now()+sec*1000,label:String(label||''),step:_ck.i,done:false});
  if(!_tick)_tick=window.setInterval(tick,1000);
  renderCook();
}
function timerDrop(id){
  if(!_ck)return;
  _ck.timers=_ck.timers.filter(function(t){return t.id!==id;});
  renderCook();
}
function wakeOn(){
  try{
    var wl=/** @type {any} */ (navigator).wakeLock;
    if(wl&&wl.request)wl.request('screen').then(function(l){_wake=l;}).catch(function(){});
  }catch(e){}
}
function wakeOff(){if(_wake){try{_wake.release();}catch(e){}_wake=null;}}
document.addEventListener('visibilitychange',function(){
  if(!document.hidden&&isOpen('cookOv'))wakeOn();
});
function cookDone(){
  if(!_ck)return;
  if(!S.cookLog||typeof S.cookLog!=='object')S.cookLog={};
  var l=S.cookLog[_ck.id]||{n:0,last:''};
  S.cookLog[_ck.id]={n:(l.n||0)+1,last:today()};
  saveS();
  _ck.done=true;
  renderCook();render();
}
function renderCook(){
  var r=_ck?rec(_ck.id):null;
  if(!_ck||!r){cookClose(true);return;}
  var v=view(r);
  // Die KI kann die Schritte nachtraeglich anpassen — dann gilt ihre Fassung.
  var st=recipeSteps(v.instructions);
  if(st.join('\n')!==_ck.steps.join('\n')){_ck.steps=st;_ck.i=Math.min(_ck.i,Math.max(0,st.length-1));}
  var n=_ck.steps.length,i=_ck.i;
  var t=document.getElementById('cookTitle');if(t)t.textContent=(r.emoji||'📋')+' '+v.name;
  var sub=document.getElementById('cookSub');
  if(sub)sub.textContent=_ck.done?'Fertig gekocht':(n?'Schritt '+(i+1)+' von '+n:'Keine Zubereitung hinterlegt');
  var el=document.getElementById('cookBody');if(!el)return;
  if(_ck.done){
    var l=logOf(r.id);
    el.innerHTML='<div class="ck-done"><div style="font-size:44px;">🎉</div>'
      +'<div class="ck-dt">Guten Appetit!</div>'
      +'<div class="bk-mu">'+l.n+'× gekocht</div></div>'
      +eatPanel('cook')
      +'<button type="button" class="seb" data-act="NTBook.cookClose" data-args="[true]">Schließen</button>';
    return;
  }
  var step=n?_ck.steps[i]:'';
  // Ein Timer, der fuer diesen Schritt schon laeuft, bekommt keinen zweiten Knopf.
  var tms=stepTimers(step).filter(function(x){
    return !_ck.timers.some(function(t){return t.step===i&&t.label===x.label;});
  });
  el.innerHTML='<div id="cookTimers"></div>'
    +(n>1?'<div class="ck-prog"><div style="width:'+Math.round((i+1)/n*100)+'%;"></div></div>':'')
    +'<button type="button" class="ck-ingbtn" data-act="NTBook.cookIngs">🥕 Zutaten für '+_ck.p+' Portion'+(_ck.p===1?'':'en')+(_ck.ings?' ▲':' ▼')+'</button>'
    +(_ck.ings?'<div class="bk-scale" style="margin:6px 0;"><button type="button" data-act="NTBook.cookPortions" data-args="[-1]">−</button><b>'+_ck.p+'</b><span>Portionen</span><button type="button" data-act="NTBook.cookPortions" data-args="[1]">＋</button></div>'
      +'<div class="bk-ings">'+ingsHtml(v,_ck.p)+'</div>':'')
    +(v.adapted&&!v.orig?'<div class="bk-mu" style="margin:0 2px 6px;">🌱 Für dich angepasst · '+esc(v.prof.labels.join(', '))+'</div>':'')
    +(n?'<div class="ck-step"><div class="ck-no">'+(i+1)+'</div><div class="ck-tx">'+esc(step)+stepNote(v,step)+'</div></div>'
      :'<div class="bk-mu" style="margin:14px 2px;">Für dieses Rezept ist keine Zubereitung hinterlegt. Ergänzen kannst du sie über ✏️ Bearbeiten.</div>')
    +(tms.length?'<div class="ck-tstart">'+tms.map(function(x){
        return '<button type="button" data-act="NTBook.timerStart" data-args="'+args([x.sec,x.label])+'">⏱ '+esc(x.label)+' starten</button>';
      }).join('')+'</div>':'')
    +'<div class="ck-nav">'
      +'<button type="button" class="seb" style="margin:0;" data-act="NTBook.cookGo" data-args="[-1]"'+(i>0?'':' disabled')+'>‹ Zurück</button>'
      +(i<n-1
        ?'<button type="button" class="svb" style="margin:0;" data-act="NTBook.cookGo" data-args="[1]">Weiter ›</button>'
        :'<button type="button" class="svb" style="margin:0;" data-act="NTBook.cookDone">✓ Fertig gekocht</button>')
    +'</div>';
  renderTimers();
}

// ══════════════════════════════════════════════════════════════════════════
// KACHEL AUF „HEUTE“
// ══════════════════════════════════════════════════════════════════════════
// Was heute geplant ist, steht oben — mit dem Weg in den Kochmodus. Ist
// nichts geplant, die Favoriten, sonst die zuletzt angelegten Rezepte.
function renderCard(){
  var val=document.getElementById('bookCardVal');
  if(val)val.textContent=recipes.length?recipes.length+' Rezept'+(recipes.length===1?'':'e'):'Öffnen';
  var body=document.getElementById('bookCardBody');if(!body)return;
  if(!recipes.length){
    body.innerHTML='<div class="bk-mu" style="font-style:italic;">Noch keine Rezepte im Kochbuch</div>'
      +'<button type="button" class="seb" style="margin-top:8px;margin-bottom:0;" data-act="NTPlan.newRecipe">＋ Erstes Rezept anlegen</button>';
    return;
  }
  var ds=S.currentDate||today();
  var planned=(window.NTPlan&&NTPlan.dayRecipes)?NTPlan.dayRecipes(ds):[];
  if(planned.length){
    body.innerHTML='<div class="bk-ch">'+esc(fmtDate(ds))+' geplant</div>'+planned.map(function(x){
      var r=rec(x.id);if(!r)return '';
      return '<div class="bk-crow"><span class="bk-cic">'+x.ic+'</span>'
        +'<button type="button" class="bk-clink" data-act="NTBook.detail" data-args="'+args([r.id])+'">'+esc(r.emoji||'📋')+' '+esc(r.name)+'</button>'
        +'<button type="button" class="bk-cook" title="Kochmodus" data-act="NTBook.cook" data-args="'+args([r.id,0])+'">👨‍🍳</button></div>';
    }).join('');
    return;
  }
  var fav=recipes.filter(function(r){return r.fav;});
  var pick=(fav.length?fav:bookSort(recipes,'new',S.cookLog)).slice(0,4);
  body.innerHTML='<div class="bk-ch">'+(fav.length?'⭐ Favoriten':'Zuletzt angelegt')+'</div>'
    +'<div class="bk-cchips">'+pick.map(function(r){
      return '<button type="button" class="plan-chip" data-act="NTBook.detail" data-args="'+args([r.id])+'">'+esc(r.emoji||'📋')+' '+esc(r.name)+'</button>';
    }).join('')+'</div>';
}

// Alles neu zeichnen, was gerade sichtbar ist.
function render(){
  if(isOpen('libraryOv'))renderList();
  if(isOpen('bookDetailOv'))renderDetail();
  renderCard();
}

window.NTBook={
  boot:boot,loadSeed:loadSeed,mergeSeed:mergeSeed,view:view,toggleOrig:toggleOrig,aiCheck:aiCheck,
  render:render,renderList:renderList,renderCard:renderCard,setTag:setTag,setSort:setSort,
  detail:detail,closeDetail:closeDetail,setPortions:setPortions,togglePanel:togglePanel,
  planNow:planNow,eatNow:eatNow,toShop:toShop,toggleFav:toggleFav,duplicate:duplicate,
  edit:edit,editCur:editCur,editDraft:editDraft,editSave:editSave,editClosed:editClosed,editDelete:editDelete,
  editTotal:editTotal,editSearch:editSearch,editAdd:editAdd,addCat:addCat,renderCatChips:renderCatChips,toggleMeal:toggleMeal,
  cook:cook,cookClose:cookClose,cookGo:cookGo,cookIngs:cookIngs,cookPortions:cookPortions,cookDone:cookDone,
  timerStart:timerStart,timerDrop:timerDrop
};
})();
