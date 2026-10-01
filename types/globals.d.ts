// Typpruefung ohne Build (#254, Stufe 0): Deklarationen, kein App-Code.
// Jede Zeile hier ist eine Stelle, an der die Pruefung bewusst weniger sieht —
// Stufe 2 und 3 nehmen sie wieder heraus.
//
// Die Module haengen ihre API mit `window.NTx = {…}` an — tsc kennt den nackten
// Namen `NTx` dadurch nicht. Fremdbibliotheken und erzeugte Daten ebenso.
declare var NTActions: any; declare var NTAlexa: any; declare var NTAmpel: any; declare var NTAutoSave: any;
declare var NTBaby: any; declare var NTBabyMed: any; declare var NTBabyWeek: any; declare var NTDash: any;
declare var NTDrive: any; declare var NTFeat: any; declare var NTGrowth: any; declare var NTHealth: any;
declare var NTMet: any; declare var NTMidwife: any; declare var NTMile: any; declare var NTPartner: any;
declare var NTPhotos: any; declare var NTPlan: any; declare var NTQueue: any; declare var NTRecur: any;
declare var NTRemind: any; declare var NTShop: any; declare var NTStats: any; declare var NTSync: any;
declare var NTTab: any; declare var NTTpl: any;
declare var ZXing: any; declare var ZXingWASM: any; declare var BarcodeDetector: any;
declare var DB: any; declare var DB_USDA: any; declare var DB_DEFAULT: any; declare var DE_EN: any;
declare var MET_DB: any; declare var CHANGELOG: any; declare var html2canvas: any;

interface Window {
  [k: `NT${string}`]: any;
  [k: `_${string}`]: any;
  ZXingWasm: any; ZBarWasm: any; DB: any; DB_USDA: any; DB_DEFAULT: any; DE_EN: any; MET_DB: any;
  CHANGELOG: any; html2canvas: any; MSStream: any;
}
// Bewusster Preis: `.value` ist damit auch auf einem <div> erlaubt. Die App ruft
// `.value` rund 400-mal auf getElementById()-Ergebnissen; ein typisierter
// Helfer waere ein Umbau dieser Stellen (Stufe 3, optional).
interface HTMLElement { value: any; checked: boolean; disabled: boolean; src: string; srcObject: any; select(): void; }
interface Element { style: CSSStyleDeclaration; }
interface Navigator { standalone?: boolean; }
interface EventTarget { tagName?: string; }
