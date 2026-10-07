import {emptyState, type State} from '../lib/model';
import {storage} from './storage';

// The browser key is publishable. Authorization is enforced by Supabase Auth and RLS.
const url = 'https://gyvztqpvgtinxoqhyfbw.supabase.co';
const key = 'sb_publishable_m5tDCWoaiu-xP-lezwd3Lg_rlUfq118';
const storageKey = 'grafiplot-pages-session';
const recoveryKey = 'grafiplot-password-recovery';
type Session = {access_token:string;refresh_token:string;expires_at:number};
export type Device = {session_id:string;label:string;created_at:string;current_device:boolean};
const json = (value:unknown,status=200) => Response.json(value,{status});
const fail = (message:string,status=400) => json({error:message},status);
const headers = (token?:string, extra:Record<string,string>={}) => ({apikey:key,...(token?{Authorization:`Bearer ${token}`}:{'Authorization':`Bearer ${key}`}),...extra});

async function readSession():Promise<Session|null> {
  try { return JSON.parse((await storage.get(storageKey))||'null') as Session|null; } catch { return null; }
}
async function acceptLink() {
  const fragment=new URLSearchParams(location.hash.slice(1));
  const access_token=fragment.get('access_token'), refresh_token=fragment.get('refresh_token');
  if(access_token&&refresh_token){
    const expires_at=Math.floor(Date.now()/1000)+Number(fragment.get('expires_in')||3600);
    await storage.set(storageKey,JSON.stringify({access_token,refresh_token,expires_at}));
    if(fragment.get('type')==='recovery')await storage.set(recoveryKey,'1');
    history.replaceState(null,'',location.pathname+location.search);
  }
  const error=fragment.get('error_description');
  if(error) {
    history.replaceState(null,'',location.pathname+location.search);
    if(fragment.get('error_code')==='otp_expired' || /invalid or has expired/i.test(error))
      throw new Error('El enlace de correo ya venció o fue usado. Solicita uno nuevo y abre solo el mensaje más reciente.');
    throw new Error(error);
  }
}
async function token():Promise<string|null> {
  await acceptLink();
  const session=await readSession();
  if(!session)return null;
  if(session.expires_at>Date.now()/1000+60)return session.access_token;
  const response=await fetch(`${url}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:headers(undefined,{'Content-Type':'application/json'}),body:JSON.stringify({refresh_token:session.refresh_token})});
  if(!response.ok){if(response.status===400||response.status===401){await storage.remove(storageKey);return null;}throw new Error('No se pudo renovar la sesión. Intenta al recuperar internet.');}
  const next=await response.json() as {access_token:string;refresh_token:string;expires_in:number};
  await storage.set(storageKey,JSON.stringify({access_token:next.access_token,refresh_token:next.refresh_token,expires_at:Math.floor(Date.now()/1000)+next.expires_in}));
  return next.access_token;
}
async function rpc(name:string,body:object={},access?:string) {
  const bearer=access||await token();
  if(!bearer)throw new Error('Inicia sesión para administrar tus dispositivos.');
  const response=await fetch(`${url}/rest/v1/rpc/grafiplot_${name}`,{method:'POST',headers:headers(bearer,{'Content-Type':'application/json'}),body:JSON.stringify(body),cache:'no-store'});
  if(!response.ok)throw new Error('No se pudo comprobar el permiso del dispositivo en Supabase.');
  return response.json();
}
async function accessStatus(access?:string) {
  const bearer=access||await token();
  if(!bearer)return {authenticated:false};
  const registered=await rpc('register_device',{p_label:/Mobi|Android|iPhone/i.test(navigator.userAgent)?'Celular':'Computadora'},bearer) as boolean;
  if(registered)return {authenticated:true,recovery:await storage.get(recoveryKey)==='1'};
  if(await rpc('is_revoked',{},bearer) as boolean){
    await storage.remove(storageKey);
    await storage.remove(recoveryKey);
    return {authenticated:false,revoked:true};
  }
  return {authenticated:false,limit:true,devices:await rpc('list_devices',{},bearer) as Device[]};
}
async function remember(next:{access_token:string;refresh_token:string;expires_in:number}) {
  await storage.set(storageKey,JSON.stringify({access_token:next.access_token,refresh_token:next.refresh_token,expires_at:Math.floor(Date.now()/1000)+next.expires_in}));
}
function emailValid(email:string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
async function dataRequest(path:string,init:RequestInit={}) {
  const access=await token();
  if(!access)return fail('Inicia sesión desde tu correo para acceder a tus cuentas.',401);
  return fetch(`${url}/rest/v1/cuentas_claras_state?${path}`,{...init,headers:headers(access,{'Content-Type':'application/json',...(init.headers as Record<string,string>||{})}),cache:'no-store'});
}
export async function remoteFetch(path:string,init:RequestInit={}):Promise<Response> {
  try {
    if(path==='/api/auth'){
      if(!init.method||init.method==='GET')return json(await accessStatus());
      if(init.method==='DELETE'){
        const access=await token();
        if(access)try {
          const body=JSON.parse(atob(access.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))) as {session_id?:string};
          if(body.session_id)await rpc('remove_device',{p_session_id:body.session_id},access);
        }catch{}
        await storage.remove(storageKey);
        await storage.remove(recoveryKey);
        if(access)void fetch(`${url}/auth/v1/logout?scope=local`,{method:'POST',headers:headers(access)});
        return json({authenticated:false});
      }
      if(init.method==='POST'){
        const {email,password}=JSON.parse(String(init.body||'{}')) as {email:string;password:string};
        if(!emailValid(String(email||'').trim()))return fail('Escribe un correo válido.');
        if(!password)return fail('Escribe tu clave.');
        const response=await fetch(`${url}/auth/v1/token?grant_type=password`,{method:'POST',headers:headers(undefined,{'Content-Type':'application/json'}),body:JSON.stringify({email:email.trim().toLowerCase(),password})});
        if(!response.ok)return fail('Correo o clave incorrectos.',401);
        const session=await response.json() as {access_token:string;refresh_token:string;expires_in:number};
        await remember(session);
        await storage.remove(recoveryKey);
        return json(await accessStatus(session.access_token));
      }
      if(init.method==='PATCH'){
        const {action,email,password}=JSON.parse(String(init.body||'{}')) as {action:string;email?:string;password?:string};
        if(action==='recover'){
          if(!emailValid(String(email||'').trim()))return fail('Escribe un correo válido.');
          const redirect='https://vasquezpalparoy-star.github.io/grafiplot-cuentas-claras/';
          const response=await fetch(`${url}/auth/v1/recover?redirect_to=${encodeURIComponent(redirect)}`,{method:'POST',headers:headers(undefined,{'Content-Type':'application/json'}),body:JSON.stringify({email:email!.trim().toLowerCase()})});
          if(response.status===429)return fail('Se alcanzó el límite de correos de Supabase. Espera antes de pedir otro enlace y revisa el mensaje más reciente.',429);
          if(!response.ok)return fail('No se pudo solicitar el enlace. Intenta más tarde.',response.status);
          return json({pending:true});
        }
        if(action==='set-password'){
          if(!password||password.length<12)return fail('La clave debe tener al menos 12 caracteres.');
          if(await storage.get(recoveryKey)!=='1')return fail('Abre primero el enlace de recuperación enviado a tu correo.',403);
          const access=await token();
          if(!access)return fail('El enlace venció. Solicita uno nuevo.',401);
          const response=await fetch(`${url}/auth/v1/user`,{method:'PUT',headers:headers(access,{'Content-Type':'application/json'}),body:JSON.stringify({password})});
          if(!response.ok)return fail('No se pudo guardar la nueva clave. Solicita otro enlace.',response.status);
          await storage.remove(recoveryKey);
          return json(await accessStatus(access));
        }
      }
    }
    if(path==='/api/devices'){
      if(!init.method||init.method==='GET')return json(await rpc('list_devices') as Device[]);
      if(init.method==='DELETE'){
        const {session_id}=JSON.parse(String(init.body||'{}')) as {session_id:string};
        if(!/^[0-9a-f-]{36}$/i.test(session_id||''))return fail('Dispositivo inválido.');
        await rpc('remove_device',{p_session_id:session_id});
        return json(await accessStatus());
      }
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

export async function sessionIdentity(){const s=await readSession();if(!s)return null;try{return JSON.parse(atob(s.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))) as {sub:string;session_id:string};}catch{return null;}}
