// @ts-check
// NutriTrack – Restaurant-Ketten (#307). Klassisches Script, exportiert window.CHAINS.
// Handgepflegt aus den OFFIZIELLEN deutschen Nährwertangaben der Ketten – nichts
// geschätzt: Ein Produkt steht nur hier, wenn seine Werte aus der genannten Quelle
// stammen. Werte PRO PORTION, g = Portionsgewicht in g (Getränke ml ≈ g).
//   {n:Name, g, k:kcal, p:Eiweiß, c:Kohlenhydrate, f:Fett, su:Zucker, fi:Ballaststoffe, sa:Salz}
// Fehlt ein Einzelwert in der Quelle: null. Suche/Umrechnung: chainSearch/chainPer100 in js/calc.js.
/** @typedef {{n:string,g:number|null,k:number,p:number|null,c:number|null,f:number|null,su:number|null,fi:number|null,sa:number|null}} ChainItem */
/** @type {Array<{id:string,n:string,e:string,a:string[],src:string,stand:string,items:ChainItem[]}>} */
window.CHAINS=[
  {id:'mcd',n:"McDonald's",e:'🍔',a:['mcdonalds','mcdonald','mc donalds','mc donald','mces','mackes','mcd'],
    src:'',stand:'',items:[]},
  {id:'bk',n:'Burger King',e:'👑',a:['burgerking','bk'],
    src:'',stand:'',items:[]},
  {id:'dd',n:'dean&david',e:'🥗',a:['dean david','dean and david','dean und david','deananddavid','dean'],
    src:'',stand:'',items:[]},
  {id:'sub',n:'Subway',e:'🥪',a:[],
    src:'',stand:'',items:[]}
];
