import type {State} from '../lib/model';
import {remoteFetch,sessionIdentity} from './api';
import {native,storage} from './storage';
import {mergeStates} from './merge';
export {type Device} from './api';
const cacheKey='grafiplot-offline-v1',grantKey='grafiplot-offline-grant';
type Cache={owner:string;base:State;local:State;pending:boolean};
type Grant={owner:string;session:string;until:number};
export type SyncStatus='cloud'|'local'|'syncing'|'conflict'|'locked';
let status:SyncStatus='cloud';
export function syncStatus(){return status}
function announce(value:SyncStatus){status=value;window.dispatchEvent(new CustomEvent('grafiplot-sync',{detail:value}))}
const json=(v:unknown,s=200)=>Response.json(v,{status:s});
async function cache():Promise<Cache|null>{const raw=await storage.get(cacheKey);return raw?JSON.parse(raw):null}
async function grant():Promise<Grant|null>{const raw=await storage.get(grantKey);return raw?JSON.parse(raw):null}
async function permitted(){const g=await grant(),s=await sessionIdentity();return !!(g&&s&&g.owner===s.sub&&g.session===s.session_id&&g.until>Date.now())}
async function checkedAuth(){
  const response=await remoteFetch('/api/auth');
  if(response.ok){
    const a=await response.clone().json() as {authenticated?:boolean;recovery?:boolean};
    if(a.authenticated&&!a.recovery){const s=await sessionIdentity();if(s)await storage.set(grantKey,JSON.stringify({owner:s.sub,session:s.session_id,until:Date.now()+7*86400000}));}
    else {await storage.remove(grantKey);announce('locked')}
  }
  return response;
}
async function synchronize(){
  if(!navigator.onLine){announce('local');return}
  announce('syncing');
  const auth=await checkedAuth();
  if(!auth.ok)throw new Error('No se pudo verificar el acceso a la nube.');
  const a=await auth.json() as {authenticated?:boolean};
  if(!a.authenticated){announce('locked');throw new Error('Inicia sesión otra vez para sincronizar. Los cambios pendientes permanecen cifrados.')}
  const current=await cache(),identity=await sessionIdentity();
  if(!current||current.owner!==identity?.sub){announce('cloud');return}
  const response=await remoteFetch('/api/state');
  if(!response.ok){announce(response.status===401||response.status===403?'locked':'local');throw new Error('No se pudo consultar la nube; la copia local se conserva.')}
  const remote=await response.json() as State;
  if(!current.pending){await storage.set(cacheKey,JSON.stringify({...current,base:remote,local:remote}));announce('cloud');return}
  try {
    const merged=mergeStates(current.base,current.local,remote);
    const write=await remoteFetch('/api/state',{method:'PUT',body:JSON.stringify(merged)});
    if(!write.ok){announce(write.status===409?'conflict':'local');throw new Error(write.status===409?'Otro dispositivo guardó mientras se sincronizaba. Reintenta; tus datos siguen en el celular.':'No se pudo guardar en la nube; los cambios siguen en el celular.')}
    const result=await write.json() as {revision:number};
    const confirmed={...merged,revision:result.revision};
    await storage.set(cacheKey,JSON.stringify({...current,base:confirmed,local:confirmed,pending:false}));announce('cloud');
  }catch(e){if((e as Error).name==='Error'&&/mismo registro/.test((e as Error).message))announce('conflict');throw e}
}
let queue:Promise<unknown>=Promise.resolve();
function serial<T>(fn:()=>Promise<T>):Promise<T>{const task=queue.then(fn);queue=task.catch(()=>{});return task}
export function syncNow(){return serial(synchronize)}
export function apiFetch(path:string,init:RequestInit={}):Promise<Response>{return serial(async()=>{
  if(!native)return remoteFetch(path,init);
  if(path==='/api/auth'){
    if(init.method==='DELETE'){
      const c=await cache();if(c?.pending)return json({error:'Primero sincroniza o exporta los cambios pendientes. Cerrar sesión borraría la copia local.'},409);
      // Clear locally even when the network is unavailable.
      const response=await remoteFetch(path,init);await storage.remove('grafiplot-pages-session');await storage.remove(cacheKey);await storage.remove(grantKey);return response;
    }
    if(!init.method||init.method==='GET'){
      const r=navigator.onLine?await checkedAuth():json({error:'Sin conexión'},503);
      if(r.status>=500&&await permitted()){announce('local');return json({authenticated:true,offline:true})}
      return r;
    }
    const r=await remoteFetch(path,init);
    if(r.ok){const a=await r.clone().json() as {authenticated?:boolean;recovery?:boolean};if(a.authenticated&&!a.recovery)await checkedAuth()}
    return r;
  }
  if(path!=='/api/state')return remoteFetch(path,init);
  if(!await permitted())return json({error:'Conéctate e inicia sesión para habilitar el acceso local.'},401);
  const identity=await sessionIdentity(),c=await cache();
  if(c&&c.owner!==identity?.sub)return json({error:'La copia local pertenece a otra cuenta.'},403);
  if(init.method==='PUT'){
    if(!c)return json({error:'Primero carga tus cuentas con conexión.'},409);
    const next=JSON.parse(String(init.body)) as State;
    await storage.set(cacheKey,JSON.stringify({...c,local:{...next,revision:next.revision+1},pending:true}));
    announce('local');
    // The durable local write is the acknowledgement. Network sync runs separately.
    window.dispatchEvent(new Event('grafiplot-pending'));
    return json({revision:next.revision+1,local:true});
  }
  if(c){return json(c.local)}
  const r=await remoteFetch(path,init);if(r.ok){const state=await r.clone().json() as State;await storage.set(cacheKey,JSON.stringify({owner:identity!.sub,base:state,local:state,pending:false}));announce('cloud')}return r;
})}
