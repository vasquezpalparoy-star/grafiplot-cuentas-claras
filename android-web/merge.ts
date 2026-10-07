import type {State} from '../lib/model';
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export class SyncConflict extends Error {constructor(){super('El mismo registro cambió en otro dispositivo. Tus cambios siguen guardados en este celular. Exporta un respaldo antes de resolver el conflicto.')}}
function merge(base:unknown,local:unknown,remote:unknown,prefer?:'local'|'remote'):unknown {
  if(equal(local,base))return remote;
  if(equal(remote,base)||equal(local,remote))return local;
  if(Array.isArray(base)&&Array.isArray(local)&&Array.isArray(remote)){
    const id=(v:Record<string,unknown>)=>String(v.id??`${v.date}:${v.shift}`);
    const map=(list:Record<string,unknown>[])=>new Map(list.map(v=>[id(v),v]));
    const b=map(base),l=map(local),r=map(remote);
    return [...new Set([...l.keys(),...r.keys(),...b.keys()])].map(k=>merge(b.get(k),l.get(k),r.get(k),prefer)).filter(v=>v!==undefined);
  }
  if(base&&local&&remote&&typeof base==='object'&&typeof local==='object'&&typeof remote==='object'){
    const b=base as Record<string,unknown>,l=local as Record<string,unknown>,r=remote as Record<string,unknown>;
    return Object.fromEntries([...new Set([...Object.keys(b),...Object.keys(l),...Object.keys(r)])].map(k=>[k,merge(b[k],l[k],r[k],prefer)]));
  }
  if(prefer)return prefer==='local'?local:remote;
  throw new SyncConflict();
}
export function mergeStates(base:State,local:State,remote:State,prefer?:'local'|'remote'):State {
  return {...merge({...base,revision:0},{...local,revision:0},{...remote,revision:0},prefer) as State,revision:remote.revision};
}
