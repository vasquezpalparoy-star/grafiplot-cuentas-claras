export type Money = number;
export type Method = 'efectivo' | 'yape' | 'transferencia';
export type Shift = 1 | 2;
export type Worker = { id:string; name:string; rateType:'turno'|'dia'|'hora'|'semana'; rate:number; active:boolean };
export type Attendance = { id:string; date:string; shift:Shift; workerId:string; hours:number; present?:boolean };
export type Entry = { id:string; date:string; shift:Shift; kind:'venta'|'otro_ingreso'|'retiro'|'gasto'|'personal'|'adelanto'|'bono'|'descuento'|'devolucion'; amount:number; method:Method; category?:string; concept:string; workerId?:string; receipt?:string; sourceId?:string; yapeId?:string; fixed?:boolean; cashCountAuto?:boolean; note?:string; editedAt?:string; excluded?:boolean };
export type Yape = { id:string; sourceId:string; row:number; date:string; time:string; amount:number; kind:'cobro'|'devolucion'|'salida'; reference:string; shift:Shift|null; status:'pendiente'|'incluido'|'excluido'; linkedEntryId?:string; duplicateReason?:string; original:Record<string,string>; note?:string };
export type Source = { id:string; name:string; uploadedAt:string; rows:number; stored:boolean };
export type CashShift = { date:string; shift:Shift; opening:number; counted:number|null; yapeClosing?:number|null; explanation:string; closed:boolean };
export type Settings = { weekStart:number; shift1Start:string; shift2Start:string; currency:string; cashFloat?:number };
export type Audit = { id:string; at:string; action:string; entity:string; recordId:string; before:unknown; after:unknown; note:string };
export type State = { revision:number; settings:Settings; workers:Worker[]; attendance:Attendance[]; entries:Entry[]; yape:Yape[]; sources:Source[]; shifts:CashShift[]; audit:Audit[]; demo:boolean };
export const uid = () => crypto.randomUUID();
export const todayLima = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const fmt = (n:number) => 'S/ '+(Number(n)||0).toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2});
export const round = (n:number) => Math.round((n+Number.EPSILON)*100)/100;
export const emptyState = ():State => ({revision:1,demo:false,settings:{weekStart:1,shift1Start:'08:00',shift2Start:'16:00',currency:'PEN',cashFloat:60},workers:[],attendance:[],entries:[],yape:[],sources:[],shifts:[],audit:[]});
export function periodStart(date:string, start:number){ const d=new Date(date+'T12:00:00Z'); const diff=(d.getUTCDay()-start+7)%7; d.setUTCDate(d.getUTCDate()-diff); return d.toISOString().slice(0,10); }
export function shiftEntries(s:State,date:string,shift:Shift){return s.entries.filter(e=>!e.excluded&&e.date===date&&e.shift===shift)}
export function defaultCashOpening(s:State,date:string,shift:Shift):number{if(shift===1)return s.settings.cashFloat??60;const first=s.shifts.find(x=>x.date===date&&x.shift===1);return first?.counted??cashExpected(s,date,1)}
export function cashExpected(s:State,date:string,shift:Shift):number{const sh=s.shifts.find(x=>x.date===date&&x.shift===shift); const es=shiftEntries(s,date,shift);return round((sh?.opening??defaultCashOpening(s,date,shift))+es.reduce((v,e)=>v+(e.method==='efectivo'?(e.kind==='venta'||e.kind==='otro_ingreso'?e.amount:e.kind==='bono'||e.kind==='descuento'?0:-e.amount):0),0));}
export function yapeEffective(s:State,y:Yape){return y.status==='incluido'&&!y.linkedEntryId&&y.shift!==null? (y.kind==='cobro'?y.amount:-y.amount):0}
export function yapeTotals(s:State,filter:(date:string,shift:Shift)=>boolean){
 const totals={received:0,returned:0,paid:0,net:0};
 for(const y of s.yape){
  if(y.shift===null||!filter(y.date,y.shift)||y.status!=='incluido')continue;
  if(y.kind==='cobro')totals.received+=y.amount;
  else if(y.kind==='devolucion')totals.returned+=y.amount;
  else totals.paid+=y.amount;
 }
 totals.received=round(totals.received);totals.returned=round(totals.returned);totals.paid=round(totals.paid);
 totals.net=round(totals.received-totals.returned-totals.paid);
 return totals;
}
export function yapeUnrecordedPaid(s:State,filter:(date:string,shift:Shift)=>boolean){return round(s.yape.filter(y=>y.kind==='salida'&&y.status==='incluido'&&!y.linkedEntryId&&y.shift!==null&&filter(y.date,y.shift)).reduce((v,y)=>v+y.amount,0))}
export function sales(s:State,filter:(date:string,shift:Shift)=>boolean){const es=s.entries.filter(e=>!e.excluded&&e.kind==='venta'&&filter(e.date,e.shift));const by={efectivo:0,yape:0,transferencia:0};for(const e of es)by[e.method]+=e.amount;for(const y of s.yape)if((y.kind==='cobro'||y.kind==='devolucion')&&y.shift!==null&&filter(y.date,y.shift))by.yape+=yapeEffective(s,y);return {by,total:round(by.efectivo+by.yape+by.transferencia)};}
export function weeklyPay(s:State,worker:Worker,date:string){const begin=periodStart(date,s.settings.weekStart);const end=new Date(begin+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+6);const until=end.toISOString().slice(0,10);const a=s.attendance.filter(x=>x.present!==false&&x.workerId===worker.id&&x.date>=begin&&x.date<=until);const shifts=a.length,days=new Set(a.map(x=>x.date)).size,hours=round(a.reduce((v,x)=>v+x.hours,0));const base=round(worker.rate*(worker.rateType==='turno'?shifts:worker.rateType==='dia'?days:worker.rateType==='hora'?hours:1));const adjustments=s.entries.filter(e=>!e.excluded&&e.workerId===worker.id&&e.date>=begin&&e.date<=until);const sum=(kind:Entry['kind'])=>round(adjustments.filter(e=>e.kind===kind).reduce((v,e)=>v+e.amount,0));const bonus=sum('bono'),discount=sum('descuento'),advance=sum('adelanto'),paid=sum('personal');return {begin,until,shifts,days,hours,base,bonus,discount,advance,paid,due:round(Math.max(0,base+bonus-discount-advance-paid))};}

// Recalcula solo las ventas de los conteos enviados desde el celular autorizado.
export function recalculateWorkerCountSales(s:State):State {
 return {...s,entries:s.entries.map(e=>{
  if(!e.cashCountAuto||!e.sourceId?.startsWith('worker-count:')||e.excluded)return e;
  const sh=s.shifts.find(x=>x.date===e.date&&x.shift===e.shift);
  if(sh?.counted==null)return e;
  const adjustment=s.entries.filter(x=>x.id!==e.id&&!x.excluded&&x.date===e.date&&x.shift===e.shift&&x.method==='efectivo').reduce((sum,x)=>sum+(['venta','otro_ingreso'].includes(x.kind)?-x.amount:['bono','descuento'].includes(x.kind)?0:x.amount),0);
  return {...e,amount:round(Math.max(0,sh.counted-sh.opening+adjustment))};
 })};
}
