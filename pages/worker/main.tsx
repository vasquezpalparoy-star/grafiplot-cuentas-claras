import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {todayLima} from '../../lib/model';
import './style.css';
const base='https://gyvztqpvgtinxoqhyfbw.supabase.co/rest/v1/rpc/grafiplot_worker_';
const apiKey='sb_publishable_m5tDCWoaiu-xP-lezwd3Lg_rlUfq118';
type Status={authorized:boolean;workers?:{id:string;name:string}[];shifts?:{shift:number;opening:number|null;counted:number|null}[];attendance?:{workerId:string;shift:number;event:string;time:string}[]};
const makeToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
function deviceToken(){let raw=localStorage.getItem('grafiplot-worker-phone');try{const old=JSON.parse(raw||'null');if(old?.token)raw=old.token}catch{}if(!raw||!/^[a-f0-9]{64}$/.test(raw)){raw=makeToken();localStorage.setItem('grafiplot-worker-phone',raw)}return raw}
async function rpc(method:string,body:object,access?:string){
 const response=await fetch(base+method,{method:'POST',headers:{apikey:apiKey,'Content-Type':'application/json',...(access?{Authorization:'Bearer '+access}:{})},body:JSON.stringify(body),cache:'no-store'});
 const value=await response.json();if(!response.ok)throw Error(value.message||'No se pudo guardar');return value;
}
function App(){
 const [token]=useState(deviceToken),[shift,setShift]=useState(1),[status,setStatus]=useState<Status>({authorized:false});
 const [section,setSection]=useState('asistencia'),[worker,setWorker]=useState(''),[opening,setOpening]=useState(''),[counted,setCounted]=useState('');
 const [concept,setConcept]=useState(''),[amount,setAmount]=useState(''),[method,setMethod]=useState('efectivo');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [pending,setPending]=useState<{id:string;label:string}[]>([]);
 const admin=new URLSearchParams(location.search).has('activar');
 async function refresh(){try{const s=await rpc('status',{p_token:token}) as Status;setStatus(s);if(s.workers?.length)setWorker(w=>w||s.workers![0].id);if(!s.authorized)await rpc('register',{p_token:token})}catch(e){setError((e as Error).message)}}
 useEffect(()=>{void refresh();const t=setInterval(()=>void refresh(),15000);return()=>clearInterval(t)},[]);
 function adminToken(){try{return JSON.parse(localStorage.getItem('grafiplot-pages-session')||'{}').access_token||''}catch{return ''}}
 async function requests(){try{setError('');setPending(await rpc('pending',{},adminToken()))}catch(e){setError('Inicia sesión como administrador en este navegador para aprobar el teléfono.')}}
 useEffect(()=>{if(admin)void requests()},[admin]);
 async function approve(id:string){try{setBusy(true);await rpc('approve',{p_device_hash:id},adminToken());setNotice('Celular autorizado');await requests()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function send(action:string,payload:object){
  setBusy(true);setError('');setNotice('');
  try{await rpc('action',{p_token:token,p_action:action,p_payload:{date:todayLima(),shift,...payload}});setNotice('Guardado correctamente en el sistema');if(action==='gasto'){setConcept('');setAmount('')}await refresh()}catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 async function close(){setBusy(true);setError('');try{await rpc('submit',{p_token:token,p_report:{date:todayLima(),shift,counted}});setNotice('Cierre registrado correctamente');setCounted('');await refresh()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 const sh=status.shifts?.find(x=>x.shift===shift);
 const marks=status.attendance?.filter(x=>x.workerId===worker&&x.shift===shift)||[];
 const entered=marks.some(x=>x.event==='entrada'),left=marks.some(x=>x.event==='salida');
 return <main><header><span className="brand">GRAFIPLOT ●</span><h1>{admin?'Autorizar celular del local':'Registro de Personal y Caja'}</h1><p>{todayLima()}</p></header>
 {error&&<div className="error" role="alert">{error}</div>}{notice&&<div className="success" role="status">{notice}</div>}
 {admin?<section><h2>Solicitudes de celulares</h2><button onClick={()=>void requests()}>Actualizar</button>{pending.length===0?<p>No hay solicitudes pendientes.</p>:pending.map(d=><p key={d.id}>{d.label}<button disabled={busy} onClick={()=>void approve(d.id)}>Autorizar celular</button></p>)}<p>Por seguridad, aprobar un nuevo celular reemplaza la autorización anterior.</p></section>
 :!status.authorized?<section><h2>Esperando autorización</h2><p>No necesitas código ni contraseña. El administrador autoriza este celular una sola vez desde el sistema.</p><button onClick={()=>void refresh()}>Comprobar autorización</button><p>Administrador: abre trabajador.html?activar=1 en tu navegador donde iniciaste sesión.</p></section>
 :<><section><label>Turno<select value={shift} onChange={e=>setShift(Number(e.target.value))}><option value={1}>Mañana</option><option value={2}>Tarde</option></select></label><p>Cada turno tiene caja inicial, final y gastos propios. No se suman automáticamente entre turnos.</p></section>
 <nav className="tabs">{['asistencia','gastos','caja'].map(x=><button key={x} className={section===x?'active':''} onClick={()=>setSection(x)}>{x==='gastos'?'Gastos extras':x==='caja'?'Caja':'Asistencia'}</button>)}</nav>
 {section==='asistencia'&&<section><h2>Marcar asistencia</h2><label>Trabajador<select value={worker} onChange={e=>setWorker(e.target.value)}>{status.workers?.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>{!status.workers?.length?<p>El administrador debe registrar al trabajador primero.</p>:<><button disabled={busy||entered} onClick={()=>void send('asistencia',{workerId:worker,event:'entrada'})}>Marcar entrada</button><button disabled={busy||!entered||left} onClick={()=>void send('asistencia',{workerId:worker,event:'salida'})}>Marcar salida</button>{marks.map((x,i)=><p key={i}>{x.event}: {x.time}</p>)}</>}</section>}
 {section==='gastos'&&<section><h2>Nuevo gasto extra</h2><label>Descripción<input value={concept} onChange={e=>setConcept(e.target.value)} maxLength={160}/></label><label>Monto S/<input type="number" inputMode="decimal" step="0.01" min="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label>Forma de pago<select value={method} onChange={e=>setMethod(e.target.value)}><option value="efectivo">Efectivo</option><option value="yape">Yape</option><option value="transferencia">Transferencia</option></select></label><button disabled={busy||concept.trim().length<3||Number(amount)<=0} onClick={()=>void send('gasto',{id:crypto.randomUUID(),concept,amount,method})}>Guardar gasto en el sistema</button></section>}
 {section==='caja'&&<section><h2>Caja {shift===1?'mañana':'tarde'}</h2><p>Caja inicial: {sh?.opening==null?'Sin registrar':'S/ '+Number(sh.opening).toFixed(2)}</p>{sh?.opening==null?<><label>Efectivo inicial<input type="number" step="0.01" min="0" value={opening} onChange={e=>setOpening(e.target.value)}/></label><button disabled={busy||opening===''} onClick={()=>void send('apertura',{opening})}>Guardar caja inicial</button></>:<><p>Caja final: {sh.counted==null?'Sin registrar':'S/ '+Number(sh.counted).toFixed(2)}</p>{sh.counted==null&&<><label>Todo el efectivo al cierre<input type="number" step="0.01" min="0" value={counted} onChange={e=>setCounted(e.target.value)}/></label><button disabled={busy||counted===''} onClick={()=>void close()}>Registrar cierre</button></>}</>}</section>}
 </>}
 <footer>GRAFIPLOT · Los registros se guardan en Supabase.</footer></main>
}
createRoot(document.getElementById('root')!).render(<App/>);
