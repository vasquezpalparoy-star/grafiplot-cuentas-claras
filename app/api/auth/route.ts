import { clearSession, hasSession, newSession, passwordMatches, sameOrigin } from '@/lib/auth';
export const runtime = 'edge';
export async function GET(request: Request) {
  try { return Response.json({ authenticated: await hasSession(request) }); }
  catch { return Response.json({ error: 'Falta configurar la contraseña del servidor.' }, { status: 503 }); }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  try {
    const body = await request.json() as { password?: string };
    if (typeof body.password !== 'string' || !(await passwordMatches(body.password)))
      return Response.json({ error: 'Contraseña incorrecta.' }, { status: 401 });
    return Response.json({ authenticated: true }, { headers: { 'Set-Cookie': await newSession(request), 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'No se pudo iniciar sesión.' }, { status: 503 }); }
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  return Response.json({ authenticated: false }, { headers: { 'Set-Cookie': clearSession(request), 'Cache-Control': 'no-store' } });
}
