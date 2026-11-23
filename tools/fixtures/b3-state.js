'use strict';
// Entirely synthetic. No personal data, usable credentials or production rooms.
function fixture(today='2026-11-23') {
  const state={setupDone:true,name:'Testprofil',goal:2000,currentDate:today,babyOn:true,baby:{name:'Demo',birth:'2026-09-01',sex:'f'},babyLog:{},babyQuick:[],babyTomb:{},babyMiles:{'demo-mile':1},babyQs:[{id:'demo-q',q:'Testfrage',to:'doc',done:false}],babyMeds:[],babyNightWindow:{start:'20:00',end:'08:00'},launchBar:['wickeln','foto','stillen'],dashOrder:['baby','meals'],dashHidden:['fast'],reminders:[{id:'demo-rem',label:'Test',time:'12:30',on:false}],days:{},shopList:[{id:'demo-shop',n:'Äpfel',q:'2',c:'obst',rev:1}],shopTomb:{},pantry:[{id:'demo-pantry',n:'Haferflocken',q:2,g:500,min:1,loc:'kitchen',rev:1}],pantryLocs:[{id:'kitchen',n:'Küche'}],pantryTomb:{},mealPlan:{},links:[],weightLog:{},bookSeedV:1,bookMealV:1};
  const per100={kcal:100,protein:4,carbs:15,fat:3,fiber:2,sugar:1,salt:0.1};
  for(let i=1;i<=21;i++) {
    const d=new Date(today+'T12:00:00'); d.setDate(d.getDate()-i); const k=d.toISOString().slice(0,10);
    state.days[k]={meals:{breakfast:[],lunch:[{id:'l'+i,name:'Demo Mittag',amount:200,per100,kcal:200,protein:8,carbs:30,fat:6,ts:new Date(k+'T12:30:00').getTime()}],dinner:[{id:'d'+i,name:'Demo Abend',amount:300,per100,kcal:300,protein:12,carbs:45,fat:9,ts:new Date(k+'T18:30:00').getTime()}],snack:[]},exercise:[],water:4};
  }
  state.days[today]={meals:{breakfast:[],lunch:[],dinner:[],snack:[]},exercise:[],water:2};
  const day='2026-11-22'; let ts=new Date(day+'T08:00:00').getTime();
  const records=[{t:'breast',side:'r',min:10},{t:'bottle',ml:80,kind:'mm'},{t:'diaper',kind:'both',color:'yellow',cons:'soft'},{t:'temp',temp:36.8,site:'rektal'},{t:'sleep',from:'09:00',to:'10:00',sleepType:'day'},{t:'note',text:'Synthetische Notiz'},{t:'solid',food:'Karotte',amount:'1 TL',first:1,reaction:'none'},{t:'pump',ml:30,side:'b'},{t:'med',name:'Demo',dose:'Testgabe'},{t:'growth',g:5500,cm:58,hc:38},{t:'appt',kind:'doc',title:'Demo-Termin',date:day}];
  state.babyLog[day]=records.map((e,i)=>({...e,id:'demo-b'+i,ts:ts+i*60000,rev:i+1}));
  for(let i=0;i<10;i++)state.babyQuick.push({id:'demo-quick'+i,icon:'🤱',label:'Eigener Knopf '+i,t:'breast',p:{side:i%2?'r':'l',timer:i%3===0}});
  const recipe={id:'demo-recipe',name:'Demo Brei',servings:1,ingredients:[{name:'Haferflocken',amount:50,per100}],meal:['breakfast']};
  state.mealPlan[today]={lunch:[{r:recipe.id,p:2}]};
  return {state,foodCache:{},customFoods:[{id:'demo-food',name:'Demo Lebensmittel',per100}],recipes:[recipe],barcodeCache:{}};
}
module.exports={fixture};
