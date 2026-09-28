import { env } from 'cloudflare:workers';

const cookieName = 'grafiplot_session';
const ttlSeconds = 7 * 24 * 60 * 60;
const encoder = new TextEncoder();

type AuthEnv = { APP_LOGIN_PASSWORD?: string; APP_SESSION_SECRET?: string };
function secrets() {
  const e = env as unknown as AuthEnv;
  if (!e.APP_LOGIN_PASSWORD || !e.APP_SESSION_SECRET) throw new Error('Falta configurar el acceso privado');
  return { password: e.APP_LOGIN_PASSWORD, sessionKey: e.APP_SESSION_SECRET };
}
function equal(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}
async function digest(value: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}
async function sign(value: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secrets().sessionKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}
function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export async function passwordMatches(input: string) {
  const expected = await digest(secrets().password);
  const given = await digest(input);
  return equal(expected, given);
}
export async function newSession(request: Request) {
  const payload = `v1.${Math.floor(Date.now() / 1000) + ttlSeconds}`;
  const mac = base64url(await sign(payload));
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${cookieName}=${payload}.${mac}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${ttlSeconds}${secure}`;
}
export function clearSession(request: Request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`;
}
export async function hasSession(request: Request) {
  secrets();
  const cookie = request.headers.get('cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith(cookieName + '='));
  const match = cookie?.slice(cookieName.length + 1).match(/^(v1\.\d+)\.([A-Za-z0-9_-]+)$/);
  if (!match) return false;
  const expires = Number(match[1].slice(3));
  if (!Number.isSafeInteger(expires) || expires < Math.floor(Date.now() / 1000)) return false;
  return equal(encoder.encode(match[2]), encoder.encode(base64url(await sign(match[1]))));
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}
export const unauthorized = () => Response.json({ error: 'Inicia sesión para acceder a tus cuentas.' }, { status: 401 });
