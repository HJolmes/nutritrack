'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function domains(page,output,width){
  await page.evaluate(()=>{S.currentDate=NTBaby.today();renderAll();NTUI.go('nutrition');});
  const bad=await page.evaluate(()=>NTUICatalog.entries().filter(e=>!NTActions.resolve(e.act)).map(e=>e.act));assert.deepEqual(bad,[],'full catalogue resolves every real workflow');
  const kcal=await page.locator('#totKcal').textContent();
  await page.locator('#mealsCard [data-act="openMealDetail"]').first().click();await page.locator('#mealDetailScreen.active').waitFor();
  await page.goBack();await page.locator('#mainScreen.active').waitFor();
  assert.equal(await page.locator('#totKcal').textContent(),kcal,'navigation preserves the original calculation');
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Erfassen: Ernährung'}).click();
  for(const tab of ['chat','search','recent','foto','barcode','own','link'])await page.locator('#ptab-'+tab).click();
  await page.evaluate(()=>closeOv('pickerOv'));
  const water=await page.evaluate(()=>getDay().water||0);
  await page.locator('#waterCard button[data-args="[250]"]').click();assert.equal(await page.evaluate(()=>getDay().water),water+1);
  const archive=await page.evaluate(()=>{S.days['2026-01-05']={_compressed:true,kcal:650,protein:20,carbs:90,fat:15,water:3};goToDay('2026-01-05');const total=calcM(getDay().meals.breakfast.concat(getDay().meals.lunch,getDay().meals.dinner,getDay().meals.snack)).kcal;S.currentDate=NTBaby.today();renderAll();NTUI.go('nutrition');return total;});assert.equal(archive,650,'reopening archived history retains calories');
  // New cookbook entry through the contextual + and the existing real editor.
  await page.evaluate(()=>NTUI.go('book'));await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Erfassen: Kochbuch'}).click();
  await page.locator('#recNewOv [data-act="NTPlan.newBlank"]').click();
  await page.locator('#recEditName').fill('B3 Testbrei');await page.locator('#recEditSearchQ').fill('Demo Lebensmittel');
  await page.locator('#recEditResults [data-act="NTBook.editAdd"]').first().click();
  await page.evaluate(()=>NTBook.toggleMeal('lunch'));
  await page.locator('#recEditOv [data-act="NTBook.editSave"]').click();
  const recipe=await page.evaluate(()=>recipes.find(r=>r.name==='B3 Testbrei'));assert.ok(recipe);assert.equal(recipe.ingredients.length,1);
  await page.evaluate(()=>{NTUI.go('plan');NTPlan.shiftWeek(1);});
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Erfassen: Wochenplan'}).click();
  const nextDay=await page.evaluate(()=>NTPlan.visibleDates()[2]);
  await page.locator('#b3PlanDate').selectOption(nextDay);
  await page.locator('#b3ActionBody button').filter({hasText:'Mittagessen'}).click();
  await page.locator('#planPickQ').fill('B3 Testbrei');
  await page.locator('#planPickList [onclick^="NTPlan.addToSlot"]').click();
  assert.ok(await page.evaluate(({day,id})=>S.mealPlan[day].lunch.some(e=>e.r===id),{day:nextDay,id:recipe.id}),'plus inserts into the selected day of the visible week');
  await page.evaluate(()=>NTUI.go('plan'));await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Erfassen: Wochenplan'}).click();
  await page.locator('#b3ActionBody button').filter({hasText:'Mittagessen'}).click();await page.locator('#planPickQ').fill('B3 Testbrei');
  await page.locator('#planPickList [onclick^="NTPlan.addToSlot"]').click();
  assert.ok(await page.evaluate(id=>S.mealPlan[S.currentDate].lunch.some(e=>e.r===id),recipe.id));
  await page.locator('#planOv [data-act="NTPlan.weekToShop"]').click();
  // F2: erst die Zusammenfassung (X auf den Zettel, Y im Vorrat), dann übernehmen.
  await page.locator('#planShopOv.open').waitFor();
  assert.match(await page.locator('#planShopSum').textContent(),/^\d+ Zutat(en)? auf den Zettel, \d+ (ist|sind) im Vorrat\./);
  await page.locator('#planShopGo').click();
  assert.match(await page.evaluate(()=>S.shopList.find(e=>e.n==='Demo Lebensmittel').q),/100\s*g/);
  page.removeAllListeners('dialog');page.on('dialog',d=>d.message().includes('schon im Tagebuch')?d.dismiss():d.accept());
  await page.evaluate(()=>NTPlan.toDiary(S.currentDate));const count=await page.evaluate(()=>getDay().meals.lunch.length);
  await page.evaluate(()=>NTPlan.toDiary(S.currentDate));assert.equal(await page.evaluate(()=>getDay().meals.lunch.length),count,'confirmed plan is not duplicated after rejected repeat');
  await page.evaluate(()=>NTUI.go('household'));await page.locator('#b3Content .b3-feature-row[data-args=\'["pantry"]\']').click();
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Erfassen: Vorrat'}).click();
  for(const [id,value] of Object.entries({pantryItemName:'B3 Mindestvorrat',pantryItemQ:'1',pantryItemG:'100',pantryItemMin:'2'}))await page.locator('#'+id).fill(value);
  await page.locator('#pantryItemOv [data-act="NTPantry.saveItem"]').click();
  try{await page.waitForFunction(()=>S.pantry.some(p=>p.n==='B3 Mindestvorrat'),{},{timeout:5000});}
  catch(error){
    console.error('Pantry save diagnostic',await page.evaluate(()=>({open:document.getElementById('pantryItemOv').classList.contains('open'),fields:['pantryItemName','pantryItemQ','pantryItemG','pantryItemMin'].map(id=>[id,document.getElementById(id).value]),toast:document.getElementById('toast')?.textContent,names:S.pantry.map(p=>p.n)})));
    await page.screenshot({path:path.join(output,'pantry-save-failure-'+width+'.png'),fullPage:true});throw error;
  }
  const item=await page.evaluate(()=>S.pantry.find(p=>p.n==='B3 Mindestvorrat'));assert.equal(item.q,1);
  await page.evaluate(()=>NTUI.go('shop'));await page.locator('#shopOv [data-act="NTShop.toggle"]').filter({hasText:'B3 Mindestvorrat'}).click();
  assert.equal(await page.evaluate(id=>S.pantry.find(p=>p.id===id).q,item.id),2,'buying refills the linked stock');
  await page.evaluate(id=>{NTUI.go('pantry');NTPantry.openItem(id);document.getElementById('pantryItemUseQ').value='1';NTPantry.consume(false);},item.id);
  assert.equal(await page.evaluate(id=>S.pantry.find(p=>p.id===id).q,item.id),1);
  await page.evaluate(id=>{const e=S.pantryLog.find(e=>e.pid===id&&e.k==='verbrauch');NTPantry.undo(e.id);closeOv('pantryItemOv');},item.id);
  assert.equal(await page.evaluate(id=>S.pantry.find(p=>p.id===id).q,item.id),2,'Undo restores the quantity');
  // Selten Gebrauchtes liegt hinter ⋯ Mehr: Verlauf per Klick erreichbar, Kopf mit vier Werkzeugen.
  await page.locator('#pantryOv.open [data-act="NTPantry.openMore"]').click();
  await page.locator('#pantryMoreOv.open').getByRole('button',{name:'Verlauf'}).click();
  await page.locator('#pantryLogOv.open').waitFor();
  assert.equal(await page.locator('#pantryOv .pantry-tools .nt-tool').count(),4);
  await page.evaluate(()=>closeOv('pantryLogOv'));
  await page.evaluate(id=>{S.pantry.find(p=>p.id===id).mhd=NTBaby.today();NTUI.go('household');},item.id);
  await page.locator('.b3-expiry').getByRole('button',{name:'Artikel anzeigen'}).click();
  assert.match(await page.locator('#pantryOv.open #pantryStats [aria-pressed="true"]').textContent(),/Läuft ab/);
  assert.ok(await page.locator('#pantryOv.open').getByText('B3 Mindestvorrat',{exact:true}).isVisible());
  await page.evaluate(()=>{NTPantry.setFilter('');NTUI.go('household');});
  await page.getByRole('button',{name:'Rezepte aus dem Vorrat finden'}).click();
  await page.locator('#pantryCookOv.open').waitFor();
  const milk=await page.evaluate(()=>{
    closeOv('pantryCookOv');
    const shop=NTShop.add('H-Milch','2 Stück','','🥛');NTShop.toggle(shop.id);
    const stock=S.pantry.find(p=>p.n==='H-Milch');
    return {shop:shop.id,id:stock.id,q:stock.q,mhd:stock.mhd,estimate:addDays(NTBaby.today(),90)};
  });
  assert.equal(milk.q,2,'an item absent from pantry is created at checkout');
  assert.equal(milk.mhd,milk.estimate);
  await page.evaluate(id=>NTPantry.openItem(id),milk.id);
  await page.locator('#pantryItemG').fill('1000');
  for(const offset of [7,21]){
    await page.getByRole('button',{name:'＋ Charge mit eigenem Datum'}).click();
    const date=await page.evaluate(offset=>addDays(NTBaby.today(),offset),offset);
    await page.locator('#pantryCharges .pantry-charge-mhd').last().fill(date);
  }
  await page.locator('#pantryItemOv [data-act="NTPantry.saveItem"]').click();
  const undoCheck=await page.evaluate(milk=>{
    S.shopList=JSON.parse(localStorage.getItem('nt_v6')).shopList;
    NTShop.toggle(milk.shop);
    const stock=S.pantry.find(p=>p.id===milk.id);
    const remaining=stock.lots.map(lot=>lot.mhd);
    NTShop.toggle(milk.shop);
    return {remaining,after:stock.q,lots:stock.lots.length,first:stock.mhd};
  },milk);
  assert.equal(undoCheck.remaining.length,2,'stored undo removes only the purchased lot');
  assert.equal(undoCheck.after,4);assert.equal(undoCheck.lots,3);
  for(const accept of [false,true]){
    await page.evaluate(()=>{
      NTUI.go('nutrition');NTPicker.openPicker('breakfast','own');
      document.getElementById('ownName').value='H-Milch';
      document.getElementById('ownKcal').value='65';document.getElementById('ownOnce').checked=true;NTPicker.pickerSaveOwn();
    });
    await page.locator('#pantryMealOv.open').waitFor();
    // E1: eine Zeile je Artikel, Menge in Gramm (Artikel kennt Gramm je Stück), vorgewählt.
    assert.equal(await page.locator('#pantryMealRows .pantry-meal-q input').inputValue(),'100');
    assert.ok(await page.locator('#pantryMealRows .pantry-meal-on input').isChecked());
    await page.getByRole('button',{name:accept?'Abziehen':'Nicht aus dem Vorrat',exact:true}).click();
    const state=await page.evaluate(id=>S.pantry.find(p=>p.id===id),milk.id);
    assert.equal(state.q,accept?3.9:4);
    assert.equal(state.lots.find(lot=>lot.mhd===undoCheck.first).q,accept?0.9:1,'earliest lot is used first');
  }
  // E4: Eintrag gelöscht → Rücknahme anbieten, über Rückgängig sichtbar im Verlauf.
  const booked=await page.evaluate(id=>{const e=S.pantryLog.find(l=>l.pid===id&&l.ev&&!l.u);return {ev:e.ev,idx:getDay().meals.breakfast.findIndex(x=>x._vid===e.ev)};},milk.id);
  assert.ok(booked.idx>=0,'the booking knows its diary entry');
  await page.evaluate(idx=>{openEditEntry('breakfast',idx);deleteEntry();},booked.idx);
  await page.locator('#pantryMealOv.open').waitFor();
  assert.match(await page.locator('#pantryMealTitle').textContent(),/zurücknehmen/);
  await page.getByRole('button',{name:'Zurückbuchen',exact:true}).click();
  assert.equal(await page.evaluate(id=>S.pantry.find(p=>p.id===id).q,milk.id),4,'deleting the entry gives the stock back after confirmation');
  assert.ok(await page.evaluate(ev=>S.pantryLog.some(l=>l.ev===ev&&l.u),booked.ev),'the reversal is visible in the history');
  const repeat=await page.evaluate(()=>{
    const first=NTShop.add('B3 Haferflocken','500 g','','');NTShop.toggle(first.id);
    const second=NTShop.add('B3 Haferflocken','200 g','','');NTShop.toggle(second.id);
    const stock=S.pantry.find(p=>p.n==='B3 Haferflocken'),bought=stock.q;
    NTShop.toggle(second.id);
    return {bought,remaining:stock.q};
  });
  assert.deepEqual(repeat,{bought:1.4,remaining:1},'reopening a completed list item starts a new purchase and keeps its previous lot');
  // Every settings/integration entry is reached through the searchable catalogue.
  await page.evaluate(()=>NTUI.go('more'));
  await page.getByRole('button',{name:'Alle Funktionen',exact:true}).click();
  for(const [query,label,id] of [['Alexa','Alexa-Verbindung','alexaOv'],['Samsung','Apple / Samsung Health','healthSyncOv'],['Excel','Excel-Export','foodExportOv'],['Prompts','KI-Prompts','promptOv'],['Link importieren','Code / Link importieren','importPasteOv'],['Backup','Backup & Daten','settOv'],['Hilfe','Hilfe und App-Tour','helpOv']]){
    await page.locator('#b3CatalogQuery').fill(query);
    await page.locator('#b3Catalog').getByRole('button',{name:label,exact:true}).click();await page.locator('#'+id+'.open').waitFor();await page.evaluate(id=>closeOv(id),id);
  }
  const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==';
  await page.evaluate(async photo=>{await NTPhotos.put('b3-local-photo',photo);getDay().meals.breakfast[0].mealPhotoId='b3-local-photo';saveS();},photo);
  const protectedData=await page.evaluate(()=>({days:S.days,babyLog:S.babyLog,babyQuick:S.babyQuick,ui:S.ui,links:S.links,recipes,customFoods,pantry:S.pantry,shopList:S.shopList,mealPlan:S.mealPlan}));
  const event=page.waitForEvent('download');await page.evaluate(()=>exportData());const download=await event,file=path.join(output,'b3-full-roundtrip-'+width+'.json');await download.saveAs(file);
  assert.ok(fs.existsSync(file));await page.setInputFiles('#impInp',file);await page.waitForTimeout(250);
  const restored=await page.evaluate(()=>({days:S.days,babyLog:S.babyLog,babyQuick:S.babyQuick,ui:S.ui,links:S.links,recipes,customFoods,pantry:S.pantry,shopList:S.shopList,mealPlan:S.mealPlan}));
  assert.deepEqual(restored,protectedData,'new UI/recipes/kitchen/logs survive real backup restore');
  assert.equal(await page.evaluate(()=>NTPhotos.get('b3-local-photo')),photo,'local photo remains available');
  await page.evaluate(()=>NTUI.go('home'));await page.screenshot({path:path.join(output,'b3-complete-'+width+'.png'),fullPage:true});
  await page.evaluate(()=>{NTUI.go('more');NTTour.start(0);});
  const steps=await page.evaluate(()=>NTTour.steps().length);
  for(let i=0;i<steps;i++){assert.equal(await page.evaluate(()=>NTTour.active()),true);await page.evaluate(()=>NTTour.next());}
  assert.equal(await page.evaluate(()=>NTTour.active()),false);
  console.log('B3 domains: nutrition + seven picker methods, recipe-plan-shopping-stock chain, integrations, local photo, complete backup restore and adapted tour OK');
};
