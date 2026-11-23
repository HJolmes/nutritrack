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
  await page.evaluate(()=>NTUI.go('plan'));await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('button',{name:'Erfassen: Wochenplan'}).click();
  await page.locator('#b3ActionBody button').filter({hasText:'Mittagessen'}).click();await page.locator('#planPickQ').fill('B3 Testbrei');
  await page.locator('#planPickList [onclick^="NTPlan.addToSlot"]').click();
  assert.ok(await page.evaluate(id=>S.mealPlan[S.currentDate].lunch.some(e=>e.r===id),recipe.id));
  await page.locator('#planOv [data-act="NTPlan.weekToShop"]').click();
  assert.match(await page.evaluate(()=>S.shopList.find(e=>e.n==='Demo Lebensmittel').q),/100\s*g/);
  page.removeAllListeners('dialog');page.on('dialog',d=>d.message().includes('schon im Tagebuch')?d.dismiss():d.accept());
  await page.evaluate(()=>NTPlan.toDiary(S.currentDate));const count=await page.evaluate(()=>getDay().meals.lunch.length);
  await page.evaluate(()=>NTPlan.toDiary(S.currentDate));assert.equal(await page.evaluate(()=>getDay().meals.lunch.length),count,'confirmed plan is not duplicated after rejected repeat');
  await page.evaluate(()=>NTUI.go('household'));await page.locator('#b3Content button').filter({hasText:'Vorrat öffnen'}).click();
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
  // Every settings/integration entry is reached through the searchable catalogue.
  for(const [query,label,id] of [['Alexa','Alexa-Verbindung','alexaOv'],['Samsung','Apple / Samsung Health','healthSyncOv'],['Excel','Excel-Export','foodExportOv'],['Prompts','KI-Prompts','promptOv'],['Link importieren','Code / Link importieren','importPasteOv'],['Backup','OneDrive, Autosicherung, Backup & Datei-Import','settOv'],['Hilfe','Hilfe und App-Tour','helpOv']]){
    await page.evaluate(()=>NTUI.go('more'));await page.locator('#b3CatalogQuery').fill(query);
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
