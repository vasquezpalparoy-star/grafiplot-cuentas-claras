import {emptyState, type State} from '../lib/model';

// The browser key is publishable. Authorization is enforced by Supabase Auth and RLS.
const url = 'https://gyvztqpvgtinxoqhyfbw.supabase.co';
const key = 'sb_publishable_m5tDCWoaiu-xP-lezwd3Lg_rlUfq118';
const storageKey = 'grafiplot-pages-session';
type Session = {access_token:string;refresh_token:string;expires_at:number};
const json = (value:unknown,status=200) => Response.json(value,{status});
const fail = (message:string,status=400) => json({error:message},status);
const headers = (token?:string, extra:Record<string,string>={}) => ({apikey:key,...(token?{Authorization:`Bearer ${token}`}:{'Authorization':`Bearer ${key}`}),...extra});

function readSession():Session|null {
  try { return JSON.parse(localStorage.getItem(storageKey)||'null') as Session|null; } catch { return null; }
}
function acceptLink() {
  const fragment=new URLSearchParams(location.hash.slice(1));
  const access_token=fragment.get('access_token'), refresh_token=fragment.get('refresh_token');
  if(access_token&&refresh_token){
    const expires_at=Math.floor(Date.now()/1000)+Number(fragment.get('expires_in')||3600);
    localStorage.setItem(storageKey,JSON.stringify({access_token,refresh_token,expires_at}));
    history.replaceState(null,'',location.pathname+location.search);
  }
  const error=fragment.get('error_description');
  if(error) { history.replaceState(null,'',location.pathname+location.search); throw new Error(decodeURIComponent(error)); }
}
async function token():Promise<string|null> {
  acceptLink();
  const session=readSession();
  if(!session)return null;
  if(session.expires_at>Date.now()/1000+60)return session.access_token;
  const response=await fetch(`${url}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:headers(undefined,{'Content-Type':'application/json'}),body:JSON.stringify({refresh_token:session.refresh_token})});
  if(!response.ok){localStorage.removeItem(storageKey);return null;}
  const next=await response.json() as {access_token:string;refresh_token:string;expires_in:number};
  localStorage.setItem(storageKey,JSON.stringify({access_token:next.access_token,refresh_token:next.refresh_token,expires_at:Math.floor(Date.now()/1000)+next.expires_in}));
  return next.access_token;
}
async function dataRequest(path:string,init:RequestInit={}) {
  const access=await token();
  if(!access)return fail('Inicia sesión desde tu correo para acceder a tus cuentas.',401);
  return fetch(`${url}/rest/v1/cuentas_claras_state?${path}`,{...init,headers:headers(access,{'Content-Type':'application/json',...(init.headers as Record<string,string>||{})}),cache:'no-store'});
}
export async function apiFetch(path:string,init:RequestInit={}):Promise<Response> {
  try {
    if(path==='/api/auth'){
      if(!init.method||init.method==='GET')return json({authenticated:!!await token()});
      if(init.method==='DELETE'){
        const access=await token();
        localStorage.removeItem(storageKey);
        if(access)void fetch(`${url}/auth/v1/logout`,{method:'POST',headers:headers(access)});
        return json({authenticated:false});
      }
      const email=String((JSON.parse(String(init.body||'{}')) as {password?:string}).password||'').trim().toLowerCase();
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return fail('Escribe un correo válido.');
      const redirect=location.origin+location.pathname;
      const response=await fetch(`${url}/auth/v1/otp?redirect_to=${encodeURIComponent(redirect)}`,{method:'POST',headers:headers(undefined,{'Content-Type':'application/json'}),body:JSON.stringify({email,create_user:true})});
      if(!response.ok)return fail('No se pudo enviar el enlace. Revisa el correo y vuelve a intentarlo.',response.status);
      return json({pending:true});
    }
    if(path==='/api/state'){
      if(!init.method||init.method==='GET'){
        let response=await dataRequest('select=revision,data&id=eq.1');
        if(!response.ok)return fail('No se pudieron cargar los datos de Supabase.',response.status);
        let rows=await response.json() as {revision:number;data:State}[];
        if(!rows.length){
          const initial=emptyState();
          response=await dataRequest('',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({id:1,revision:initial.revision,data:initial})});
          if(!response.ok)return fail('No se pudo iniciar la caja.',response.status);
          rows=await response.json() as {revision:number;data:State}[];
        }
        return json({...rows[0].data,revision:rows[0].revision});
      }
      if(init.method==='PUT'){
        const next=JSON.parse(String(init.body||'{}')) as State;
        if(!Number.isInteger(next.revision)||!Array.isArray(next.entries)||!Array.isArray(next.audit))return fail('Datos inválidos.');
        const revision=next.revision+1;
        const response=await dataRequest(`id=eq.1&revision=eq.${next.revision}&select=revision`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({revision,data:{...next,revision},updated_at:new Date().toISOString()})});
        if(!response.ok)return fail('No se pudo guardar en Supabase.',response.status);
        const rows=await response.json() as {revision:number}[];
        return rows.length?json({revision:rows[0].revision}):fail('Los datos cambiaron en otra ventana. Recarga antes de guardar.',409);
      }
    }
    return fail('Los archivos de origen antiguos se respaldan desde la versión del servidor.',501);
  } catch(e) { return fail((e as Error).message||'No se pudo conectar.',503); }
}
