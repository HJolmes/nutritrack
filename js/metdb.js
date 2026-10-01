// @ts-check
// NutriTrack – MET-Tabelle fuer den Sporteintrag (120 Aktivitaeten).
//
// ERZEUGT von tools/build-met.js — nicht von Hand bearbeiten.
// Gepflegt wird tools/met.map.json (deutscher Name, Emoji, Synonyme,
// je Intensitaet ein Compendium-Code); alle MET-Werte stammen unveraendert aus:
//
//   Herrmann SD et al. 2024 Adult Compendium of Physical Activities.
//   J Sport Health Sci 2024;13(1):6-12. https://pacompendium.com/
//   https://pacompendium.com/wp-content/uploads/2025/02/1_2024-adult-compendium_1_2024.pdf
//   (sha256 ac30234b8f8f813837e282773cfcb3e0fe062334777c2f7b3213429c4fbc251c).
//   Nutzung: laut pacompendium.com frei, auch kommerziell; Werte nicht
//   aendern, Quelle nennen (steht im Sport-Dialog).
//
// Felder: n Name, e Emoji, s Synonyme, met {low,medium,high} MET-Werte,
// c {low,medium,high} Compendium-Codes zum Nachschlagen.
//
// API: window.NTMet.lookup(name) -> Eintrag oder null; NTMet.top = Namen
// der Schnellauswahl; NTMet.norm(s) = die Normalisierung der Suche.
window.MET_DB=[
  {n:"Laufen",e:"🏃",met:{low:7.5,medium:9.3,high:11.8},c:{low:"12020",medium:"12050",high:"12080"},s:["lauf","rennen","running","gelaufen","gerannt","dauerlauf","laufband"]},
  {n:"Radfahren",e:"🚴",met:{low:4,medium:7,high:10},c:{low:"01010",medium:"01014",high:"01040"},s:["rad","fahrrad","fahrradfahren","radeln","radel","geradelt","radtour","fahrradtour","velo","cycling"]},
  {n:"Schwimmen",e:"🏊",met:{low:6,medium:8,high:9.8},c:{low:"18310",medium:"18290",high:"18230"},s:["schwimm","geschwommen","schwimmbad","bahnen schwimmen"]},
  {n:"Krafttraining",e:"🏋️",met:{low:3.5,medium:5,high:6},c:{low:"02054",medium:"02052",high:"02050"},s:["kraft","kraftsport","gewichte","gewichtheben","hanteln","hanteltraining","bodybuilding","geraetetraining"]},
  {n:"Yoga",e:"🧘",met:{low:2.3,medium:3.5,high:4},c:{low:"02150",medium:"02180",high:"02160"},s:[]},
  {n:"Wandern",e:"🥾",met:{low:5.3,medium:6,high:7.8},c:{low:"17082",medium:"17080",high:"17012"},s:["wander","wanderung","gewandert","bergwandern","hiking","trekking"]},
  {n:"Spazieren",e:"🚶",met:{low:3,medium:3.5,high:4.8},c:{low:"17170",medium:"17160",high:"17200"},s:["spazier","spazierengehen","spaziergang","spaziert","gehen","gegangen","bummeln"]},
  {n:"Fußball",e:"⚽",met:{low:7,medium:7,high:9.5},c:{low:"15610",medium:"15610",high:"15605"},s:["kicken","gekickt","soccer"]},
  {n:"Joggen",e:"🏃",met:{low:6.5,medium:7.5,high:8.5},c:{low:"12028",medium:"12020",high:"12030"},s:["jogg","jogging","gejoggt","joggingrunde"]},
  {n:"Geländelauf",e:"🏃",met:{low:9.3,medium:9.3,high:9.3},c:{low:"12140",medium:"12140",high:"12140"},s:["crosslauf","trailrunning","trail running","waldlauf","querfeldein"]},
  {n:"Marathon",e:"🏃",met:{low:13.3,medium:13.3,high:13.3},c:{low:"12200",medium:"12200",high:"12200"},s:["marathonlauf"]},
  {n:"Orientierungslauf",e:"🧭",met:{low:9,medium:9,high:9},c:{low:"15480",medium:"15480",high:"15480"},s:[]},
  {n:"Walken",e:"🚶",met:{low:4.8,medium:5.5,high:7},c:{low:"17200",medium:"17220",high:"17230"},s:["walking","power walking","powerwalking","gewalkt","zuegig gehen","zuegiges gehen","schnell gehen","schnelles gehen"]},
  {n:"Nordic Walking",e:"🚶",met:{low:4.3,medium:5.3,high:8.5},c:{low:"17302",medium:"17304",high:"17305"},s:["nordicwalking","nordic walken"]},
  {n:"Gassi gehen",e:"🐕",met:{low:3,medium:3,high:3},c:{low:"17165",medium:"17165",high:"17165"},s:["gassi","mit dem hund","hund ausfuehren","hundespaziergang"]},
  {n:"Bergsteigen",e:"⛰️",met:{low:5.3,medium:6.5,high:7.5},c:{low:"17034",medium:"17045",high:"17050"},s:["bergtour"]},
  {n:"Treppensteigen",e:"🪜",met:{low:4.5,medium:8,high:9.3},c:{low:"17133",medium:"17130",high:"17134"},s:["treppen steigen","treppe","treppen","treppenlaufen"]},
  {n:"Kinderwagen schieben",e:"👶",met:{low:3.8,medium:3.8,high:3.8},c:{low:"17100",medium:"17100",high:"17100"},s:["kinderwagen"]},
  {n:"Einkaufen",e:"🛒",met:{low:2.3,medium:2.3,high:3.3},c:{low:"05065",medium:"05065",high:"05060"},s:["einkauf","eingekauft","shoppen","shopping"]},
  {n:"Mountainbike",e:"🚵",met:{low:8.5,medium:8.5,high:14},c:{low:"01009",medium:"01009",high:"01003"},s:["mtb","mountainbiken","mountainbiking"]},
  {n:"Rennrad",e:"🚴",met:{low:8,medium:10,high:12},c:{low:"01030",medium:"01040",high:"01050"},s:["rennradfahren","rennrad fahren"]},
  {n:"Rad zur Arbeit",e:"🚲",met:{low:6.8,medium:6.8,high:6.8},c:{low:"01011",medium:"01011",high:"01011"},s:["mit dem rad zur arbeit","fahrrad zur arbeit","radpendeln"]},
  {n:"BMX",e:"🚲",met:{low:8.5,medium:8.5,high:8.5},c:{low:"01008",medium:"01008",high:"01008"},s:[]},
  {n:"Ergometer",e:"🚴",met:{low:5,medium:6.8,high:8},c:{low:"01216",medium:"01200",high:"01228"},s:["heimtrainer","hometrainer","fahrradergometer","radergometer"]},
  {n:"Spinning",e:"🚴",met:{low:9,medium:9,high:9},c:{low:"01270",medium:"01270",high:"01270"},s:["indoor cycling","indoorcycling","spinningkurs"]},
  {n:"Brustschwimmen",e:"🏊",met:{low:5.3,medium:5.3,high:10.3},c:{low:"18265",medium:"18265",high:"18260"},s:[]},
  {n:"Rückenschwimmen",e:"🏊",met:{low:4.8,medium:4.8,high:9.5},c:{low:"18255",medium:"18255",high:"18250"},s:[]},
  {n:"Kraulen",e:"🏊",met:{low:5.8,medium:8,high:10.5},c:{low:"18240",medium:"18290",high:"18280"},s:["kraul","gekrault","freistil"]},
  {n:"Delfinschwimmen",e:"🏊",met:{low:13.8,medium:13.8,high:13.8},c:{low:"18270",medium:"18270",high:"18270"},s:["schmetterling","butterfly"]},
  {n:"Aquafitness",e:"🏊",met:{low:5.5,medium:5.5,high:5.5},c:{low:"18355",medium:"18355",high:"18355"},s:["aqua fitness","aquagymnastik","wassergymnastik","aquaaerobic","wasseraerobic"]},
  {n:"Aquajogging",e:"🏊",met:{low:9.8,medium:9.8,high:9.8},c:{low:"18366",medium:"18366",high:"18366"},s:["wasserjogging","aqua jogging"]},
  {n:"Rudern",e:"🚣",met:{low:3.5,medium:5.8,high:12},c:{low:"18070",medium:"18050",high:"18080"},s:["gerudert","ruderboot"]},
  {n:"Rudergerät",e:"🚣",met:{low:5,medium:7.5,high:11},c:{low:"02071",medium:"02072",high:"02073"},s:["ruderergometer","rudermaschine","indoor rudern"]},
  {n:"Kanu",e:"🛶",met:{low:2.8,medium:5.8,high:12.5},c:{low:"18040",medium:"18050",high:"18060"},s:["kanufahren","paddeln","gepaddelt","kanadier"]},
  {n:"Kajak",e:"🛶",met:{low:5,medium:5,high:12.5},c:{low:"18100",medium:"18100",high:"18060"},s:["kajakfahren","kayak"]},
  {n:"Stand-up-Paddling",e:"🏄",met:{low:3.8,medium:6.5,high:9.8},c:{low:"18226",medium:"18224",high:"18228"},s:["sup","stand up paddling","standup paddling","stehpaddeln"]},
  {n:"Surfen",e:"🏄",met:{low:3,medium:3,high:5},c:{low:"18220",medium:"18220",high:"18222"},s:["wellenreiten","gesurft"]},
  {n:"Windsurfen",e:"🏄",met:{low:5,medium:5,high:14},c:{low:"18380",medium:"18380",high:"18390"},s:[]},
  {n:"Kitesurfen",e:"🪁",met:{low:11,medium:11,high:11},c:{low:"18385",medium:"18385",high:"18385"},s:["kiten","kiteboarden"]},
  {n:"Segeln",e:"⛵",met:{low:3,medium:3.3,high:4.5},c:{low:"18120",medium:"18140",high:"18130"},s:["gesegelt"]},
  {n:"Tauchen",e:"🤿",met:{low:7,medium:7,high:7},c:{low:"18200",medium:"18200",high:"18200"},s:["getaucht","geraetetauchen","scuba"]},
  {n:"Schnorcheln",e:"🤿",met:{low:5,medium:5,high:5},c:{low:"18210",medium:"18210",high:"18210"},s:["geschnorchelt"]},
  {n:"Wasserski",e:"🎿",met:{low:6,medium:6,high:6},c:{low:"18150",medium:"18150",high:"18150"},s:["wakeboarden","wakeboard"]},
  {n:"Wasserball",e:"🤽",met:{low:10,medium:10,high:10},c:{low:"18360",medium:"18360",high:"18360"},s:[]},
  {n:"Rafting",e:"🛶",met:{low:5,medium:5,high:5},c:{low:"18370",medium:"18370",high:"18370"},s:["wildwasser"]},
  {n:"Fitness",e:"🏋️",met:{low:3.8,medium:5.5,high:7.8},c:{low:"02064",medium:"02060",high:"02062"},s:["fitnessstudio","fitnesstraining","fitnesskurs","workout","gym"]},
  {n:"Zirkeltraining",e:"🏋️",met:{low:5,medium:5,high:7.5},c:{low:"02035",medium:"02035",high:"02040"},s:["circuit training","kettlebell","kettlebells"]},
  {n:"Bootcamp",e:"🪖",met:{low:5,medium:5,high:5},c:{low:"02008",medium:"02008",high:"02008"},s:["boot camp"]},
  {n:"Gymnastik",e:"🤸",met:{low:2.8,medium:3.8,high:7.5},c:{low:"02024",medium:"02022",high:"02020"},s:["calisthenics","liegestuetze","situps","sit ups","klimmzuege","eigengewichtstraining","bodyweight"]},
  {n:"Rückengymnastik",e:"🤸",met:{low:3.5,medium:3.5,high:3.5},c:{low:"02030",medium:"02030",high:"02030"},s:["rueckentraining","rueckenschule"]},
  {n:"Turnen",e:"🤸",met:{low:3.8,medium:3.8,high:3.8},c:{low:"15300",medium:"15300",high:"15300"},s:["geturnt","geraeteturnen"]},
  {n:"Dehnen",e:"🧘",met:{low:2.3,medium:2.3,high:2.3},c:{low:"02101",medium:"02101",high:"02101"},s:["stretching","gedehnt","dehnuebungen"]},
  {n:"Pilates",e:"🧘",met:{low:2.8,medium:2.8,high:2.8},c:{low:"02105",medium:"02105",high:"02105"},s:[]},
  {n:"Tai-Chi",e:"🥋",met:{low:3.3,medium:3.3,high:3.3},c:{low:"15670",medium:"15670",high:"15670"},s:["taichi","qigong","qi gong"]},
  {n:"Crosstrainer",e:"🏃",met:{low:5,medium:5,high:5},c:{low:"02048",medium:"02048",high:"02048"},s:["cross trainer","ellipsentrainer","elliptical"]},
  {n:"Stepper",e:"🪜",met:{low:9.3,medium:9.3,high:9.3},c:{low:"02065",medium:"02065",high:"02065"},s:["stairmaster","treppenstepper"]},
  {n:"Seilspringen",e:"🪢",met:{low:8.3,medium:11.8,high:12.3},c:{low:"15552",medium:"15551",high:"15550"},s:["seilhuepfen","seil springen","springseil","rope skipping"]},
  {n:"Aerobic",e:"💃",met:{low:4.8,medium:7.3,high:8},c:{low:"02005",medium:"02000",high:"02006"},s:["aerobics"]},
  {n:"Step-Aerobic",e:"💃",met:{low:5.5,medium:7.3,high:9},c:{low:"02001",medium:"02002",high:"02003"},s:["stepaerobic","step"]},
  {n:"Trampolin",e:"🤸",met:{low:6.3,medium:6.3,high:10.3},c:{low:"15700",medium:"15700",high:"15702"},s:["trampolinspringen","trampolin springen"]},
  {n:"Home-Workout",e:"📺",met:{low:2.5,medium:4,high:6},c:{low:"02140",medium:"02143",high:"02145"},s:["homeworkout","workout video","fitnessvideo","fitness video","heimtraining"]},
  {n:"Exergaming",e:"🎮",met:{low:2.3,medium:4,high:7.5},c:{low:"22160",medium:"22240",high:"22320"},s:["wii fit","ring fit","ringfit","just dance"]},
  {n:"Tanzen",e:"💃",met:{low:3,medium:5.5,high:9.8},c:{low:"03040",medium:"03030",high:"03031"},s:["tanz","getanzt","disco","line dance","linedance","volkstanz"]},
  {n:"Standardtanz",e:"💃",met:{low:3,medium:5.5,high:11.3},c:{low:"03040",medium:"03030",high:"03038"},s:["walzer","foxtrott","tango","gesellschaftstanz","tanzkurs"]},
  {n:"Salsa",e:"💃",met:{low:4.5,medium:4.5,high:4.5},c:{low:"03025",medium:"03025",high:"03025"},s:["bauchtanz","flamenco","swing","merengue"]},
  {n:"Ballett",e:"🩰",met:{low:5,medium:5,high:6.8},c:{low:"03010",medium:"03010",high:"03012"},s:["ballet","jazzdance","modern dance"]},
  {n:"Stepptanz",e:"💃",met:{low:4.8,medium:4.8,high:4.8},c:{low:"03014",medium:"03014",high:"03014"},s:[]},
  {n:"Basketball",e:"🏀",met:{low:5,medium:7.5,high:8},c:{low:"15070",medium:"15055",high:"15040"},s:[]},
  {n:"Handball",e:"🤾",met:{low:8,medium:8,high:8},c:{low:"15330",medium:"15330",high:"15330"},s:[]},
  {n:"Volleyball",e:"🏐",met:{low:3,medium:4,high:6},c:{low:"15720",medium:"15710",high:"15711"},s:[]},
  {n:"Beachvolleyball",e:"🏐",met:{low:8,medium:8,high:8},c:{low:"15725",medium:"15725",high:"15725"},s:["beach volleyball"]},
  {n:"Hockey",e:"🏑",met:{low:7.8,medium:7.8,high:7.8},c:{low:"15350",medium:"15350",high:"15350"},s:["feldhockey"]},
  {n:"Eishockey",e:"🏒",met:{low:8,medium:8,high:10},c:{low:"15360",medium:"15360",high:"15362"},s:[]},
  {n:"American Football",e:"🏈",met:{low:4,medium:8,high:8},c:{low:"15232",medium:"15230",high:"15210"},s:["football"]},
  {n:"Rugby",e:"🏉",met:{low:6.3,medium:6.3,high:8.3},c:{low:"15562",medium:"15562",high:"15560"},s:[]},
  {n:"Baseball",e:"⚾",met:{low:4,medium:5,high:5},c:{low:"15625",medium:"15620",high:"15620"},s:["softball"]},
  {n:"Cricket",e:"🏏",met:{low:4.8,medium:4.8,high:4.8},c:{low:"15150",medium:"15150",high:"15150"},s:[]},
  {n:"Frisbee",e:"🥏",met:{low:3,medium:3,high:8},c:{low:"15240",medium:"15240",high:"15250"},s:["ultimate frisbee","ultimate"]},
  {n:"Golf",e:"⛳",met:{low:3.5,medium:4.5,high:4.5},c:{low:"15290",medium:"15255",high:"15285"},s:["golfen"]},
  {n:"Minigolf",e:"⛳",met:{low:3.5,medium:3.5,high:3.5},c:{low:"15270",medium:"15270",high:"15270"},s:[]},
  {n:"Bowling",e:"🎳",met:{low:3.8,medium:3.8,high:3.8},c:{low:"15092",medium:"15092",high:"15092"},s:["kegeln","gekegelt"]},
  {n:"Boule",e:"🎯",met:{low:3.3,medium:3.3,high:3.3},c:{low:"15465",medium:"15465",high:"15465"},s:["boules","boccia","petanque"]},
  {n:"Darts",e:"🎯",met:{low:2.5,medium:2.5,high:2.5},c:{low:"15180",medium:"15180",high:"15180"},s:[]},
  {n:"Billard",e:"🎱",met:{low:2.5,medium:2.5,high:2.5},c:{low:"15080",medium:"15080",high:"15080"},s:["snooker"]},
  {n:"Tennis",e:"🎾",met:{low:4.5,medium:6.8,high:8},c:{low:"15685",medium:"15675",high:"15690"},s:[]},
  {n:"Tischtennis",e:"🏓",met:{low:4,medium:4,high:4},c:{low:"15660",medium:"15660",high:"15660"},s:["ping pong","pingpong"]},
  {n:"Badminton",e:"🏸",met:{low:5.5,medium:5.5,high:7},c:{low:"15030",medium:"15030",high:"15020"},s:["federball"]},
  {n:"Squash",e:"🎾",met:{low:7.3,medium:7.3,high:12},c:{low:"15652",medium:"15652",high:"15650"},s:[]},
  {n:"Boxen",e:"🥊",met:{low:5.8,medium:7.8,high:12.3},c:{low:"15110",medium:"15120",high:"15100"},s:["box","geboxt","sandsack","boxtraining"]},
  {n:"Kampfsport",e:"🥋",met:{low:5.3,medium:10.3,high:10.3},c:{low:"15425",medium:"15430",high:"15430"},s:["karate","judo","jiu jitsu","jujitsu","taekwondo","kickboxen","kickboxing","muay thai","thaiboxen","kung fu","selbstverteidigung"]},
  {n:"Fechten",e:"🤺",met:{low:6,medium:6,high:6},c:{low:"15200",medium:"15200",high:"15200"},s:["gefochten"]},
  {n:"Klettern",e:"🧗",met:{low:5.8,medium:7.3,high:8},c:{low:"15537",medium:"15535",high:"15533"},s:["geklettert","bouldern","gebouldert","kletterhalle"]},
  {n:"Hochseilgarten",e:"🧗",met:{low:4,medium:4,high:4},c:{low:"15335",medium:"15335",high:"15335"},s:["kletterwald","kletterpark"]},
  {n:"Reiten",e:"🐎",met:{low:3.8,medium:5.8,high:7.3},c:{low:"15400",medium:"15390",high:"15395"},s:["geritten","ausreiten","ausritt","reitstunde"]},
  {n:"Skateboarden",e:"🛹",met:{low:5,medium:5,high:6},c:{low:"15580",medium:"15580",high:"15582"},s:["skateboard","skaten"]},
  {n:"Inlineskaten",e:"🛼",met:{low:7.5,medium:9.8,high:12.3},c:{low:"15591",medium:"15592",high:"15593"},s:["inline skaten","inline skating","inliner","inlinern","rollerblades","rollerbladen"]},
  {n:"Rollschuhlaufen",e:"🛼",met:{low:7,medium:7,high:7},c:{low:"15590",medium:"15590",high:"15590"},s:["rollschuh","rollschuhfahren"]},
  {n:"Skifahren",e:"⛷️",met:{low:4.3,medium:6.3,high:8},c:{low:"19150",medium:"19160",high:"19170"},s:["ski","ski alpin","skilaufen"]},
  {n:"Snowboarden",e:"🏂",met:{low:4.3,medium:6.3,high:6.3},c:{low:"19150",medium:"19160",high:"19160"},s:["snowboard","snowboardfahren"]},
  {n:"Langlauf",e:"⛷️",met:{low:6.8,medium:8.5,high:11.3},c:{low:"19080",medium:"19090",high:"19100"},s:["skilanglauf","ski langlauf","langlaufen","loipe"]},
  {n:"Eislaufen",e:"⛸️",met:{low:5.5,medium:7,high:9},c:{low:"19020",medium:"19030",high:"19040"},s:["schlittschuhlaufen","schlittschuh laufen","schlittschuh","eis laufen"]},
  {n:"Rodeln",e:"🛷",met:{low:7,medium:7,high:7},c:{low:"19180",medium:"19180",high:"19180"},s:["gerodelt","schlitten","schlittenfahren"]},
  {n:"Schneeschuhwandern",e:"🥾",met:{low:5.3,medium:5.3,high:10},c:{low:"19190",medium:"19190",high:"19192"},s:["schneeschuh","schneeschuhlaufen"]},
  {n:"Schnee schippen",e:"❄️",met:{low:5.3,medium:5.3,high:7.5},c:{low:"19252",medium:"19252",high:"19254"},s:["schneeschippen","schnee schaufeln","schneeschaufeln","schnee raeumen","schneeraeumen"]},
  {n:"Hausarbeit",e:"🧹",met:{low:2.8,medium:3.3,high:4.3},c:{low:"05025",medium:"05026",high:"05027"},s:["haushalt","putzen","geputzt","aufraeumen","saubermachen","sauber machen","hausputz"]},
  {n:"Staubsaugen",e:"🧹",met:{low:3,medium:3,high:3},c:{low:"05043",medium:"05043",high:"05043"},s:["gesaugt","staubgesaugt"]},
  {n:"Fenster putzen",e:"🪟",met:{low:3.3,medium:3.3,high:3.3},c:{low:"05022",medium:"05022",high:"05022"},s:["fensterputzen"]},
  {n:"Bügeln",e:"👕",met:{low:1.8,medium:1.8,high:1.8},c:{low:"05070",medium:"05070",high:"05070"},s:["gebuegelt"]},
  {n:"Kochen",e:"🍳",met:{low:2,medium:3.3,high:3.5},c:{low:"05050",medium:"05035",high:"05049"},s:["gekocht"]},
  {n:"Abwaschen",e:"🍽️",met:{low:2,medium:2,high:2},c:{low:"05041",medium:"05041",high:"05041"},s:["abwasch","abgewaschen","geschirr spuelen"]},
  {n:"Umzug",e:"📦",met:{low:5,medium:5.8,high:9},c:{low:"05121",medium:"05120",high:"05150"},s:["moebel tragen","kisten tragen","kisten schleppen"]},
  {n:"Mit Kindern spielen",e:"🧒",met:{low:2.8,medium:3.5,high:5.8},c:{low:"05171",medium:"05175",high:"05180"},s:["mit kindern","mit den kindern","mit dem kind"]},
  {n:"Gartenarbeit",e:"🌱",met:{low:2.3,medium:3.8,high:6},c:{low:"08260",medium:"08245",high:"08262"},s:["garten","gaertnern","gartenarbeiten"]},
  {n:"Rasenmähen",e:"🌿",met:{low:4.5,medium:5.5,high:6},c:{low:"08125",medium:"08095",high:"08110"},s:["rasen maehen","rasen gemaeht","rasenmaeher"]},
  {n:"Unkraut jäten",e:"🌿",met:{low:3.8,medium:4.5,high:5},c:{low:"08239",medium:"08240",high:"08241"},s:["unkraut","jaeten","gejaetet"]},
  {n:"Laub rechen",e:"🍂",met:{low:4,medium:4,high:4},c:{low:"08160",medium:"08165",high:"08165"},s:["laubrechen","laub harken","laub gerecht"]},
  {n:"Holz hacken",e:"🪓",met:{low:4.5,medium:4.5,high:6.5},c:{low:"08019",medium:"08019",high:"08020"},s:["holzhacken","holz spalten","holz gehackt"]},
  {n:"Umgraben",e:"🌱",met:{low:3.5,medium:5,high:7.3},c:{low:"08045",medium:"08050",high:"08052"},s:["umgegraben","beet umgraben"]},
  {n:"Hecke schneiden",e:"🌳",met:{low:3.3,medium:3.8,high:3.8},c:{low:"08215",medium:"08210",high:"08210"},s:["heckeschneiden","hecke geschnitten","straeucher schneiden"]},
  {n:"Auto waschen",e:"🚗",met:{low:3.5,medium:3.5,high:3.5},c:{low:"05020",medium:"05020",high:"05020"},s:["autowaschen","auto gewaschen"]},
];

(function(root){
  var api=(function runtime(root) {
  var FILL = { gehen: 1, fahren: 1, machen: 1, spielen: 1, gegangen: 1, gefahren: 1, gespielt: 1,
    gemacht: 1, trainiert: 1, trainieren: 1, gewesen: 1 };
  var UNIT = { min: 1, minute: 1, minuten: 1, std: 1, stunde: 1, stunden: 1, h: 1 };
  // Kleinschreibung, Umlaute gefaltet, alles ausser a-z/0-9 wird Leerzeichen.
  function norm(s) {
    return String(s || '').toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[éèê]/g, 'e')
      .replace(/[^a-z0-9]+/g, ' ').replace(/^ +| +$/g, '');
  }
  // Dauerangaben ("30 Minuten", "45min") fallen weg.
  function words(s) {
    var w = norm(s).split(' '), out = [], num = false;
    for (var i = 0; i < w.length; i++) {
      var x = w[i];
      if (!x) continue;
      if (/^\d+(min|std|h)?$/.test(x)) { num = true; continue; }
      if (num && UNIT[x]) { num = false; continue; }
      num = false;
      out.push(x);
    }
    return out;
  }
  var idx = null;
  function index() {
    if (idx) return idx;
    var map = {}, keys = [], db = root.MET_DB || [];
    db.forEach(function(it) {
      [it.n].concat(it.s || []).forEach(function(k) {
        k = norm(k);
        if (k && !map[k]) { map[k] = it; keys.push(k); }
      });
    });
    var pos = {};
    keys.forEach(function(k, i) { pos[k] = i; });
    // Laengster Schluessel zuerst: "schwimmen" schlaegt "gehen", "skilanglauf" schlaegt "lauf".
    keys.sort(function(a, b) { return (b.length - a.length) || (pos[a] - pos[b]); });
    idx = { map: map, keys: keys };
    return idx;
  }
  // (1) exakt auf Name/Synonym, (2) dasselbe ohne Fuellwort am Ende
  // ("Schwimmen gehen", "Tennis gespielt"), (3) Teilstring, laengster Schluessel
  // zuerst ("gelaufen", "Bergwandern"); Schluessel unter 4 Zeichen ("rad",
  // "ski") nur als ganzes Wort. Kein Treffer: null.
  function lookup(name) {
    var w = words(name);
    if (!w.length) return null;
    var ix = index(), t = w.join(' ');
    if (ix.map[t]) return ix.map[t];
    while (w.length > 1 && FILL[w[w.length - 1]]) w.pop();
    t = w.join(' ');
    if (ix.map[t]) return ix.map[t];
    var pad = ' ' + t + ' ';
    for (var i = 0; i < ix.keys.length; i++) {
      var k = ix.keys[i];
      if (k.length < 4 ? pad.indexOf(' ' + k + ' ') !== -1 : t.indexOf(k) !== -1) return ix.map[k];
    }
    return null;
  }
  return { lookup: lookup, norm: norm };
})(root);
  api.top=["Laufen","Radfahren","Schwimmen","Krafttraining","Yoga","Wandern","Spazieren","Fußball"];
  root.NTMet=api;
})(window);
