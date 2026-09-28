# Grafiplot · Cuentas claras

Aplicación en español para caja de dos turnos, cobros Yape anotados en caja, gastos, asistencia, pagos semanales y reportes en soles. No usa inventario. Los datos se guardan como un documento JSON en un proyecto independiente de Supabase. El proyecto arranca sin trabajadores ni movimientos y propone dejar S/ 60 en efectivo al cierre. El acceso requiere contraseña.

## Publicar el código en GitHub

1. Descomprime este proyecto y crea un repositorio privado o público en GitHub.
2. Sube el contenido con `git init`, `git add .`, `git commit -m "Grafiplot"` y enlaza el repositorio remoto desde GitHub.
3. No subas `.env`, `.dev.vars`, respaldos de datos ni claves. `.env.example` contiene solo marcadores.

GitHub guarda el código. **GitHub Pages no ejecuta las rutas `/api/state` ni las funciones de Cloudflare**; para usar la aplicación hay que desplegarla en un entorno compatible con Cloudflare Workers/Vinext y restringir el acceso a los visitantes. El sitio actual de Sites ya tiene acceso privado. Si publicas otra copia sin control de acceso, las rutas de la aplicación quedarían expuestas a sus visitantes.

## Preparar Supabase

1. Usa un proyecto de Supabase separado de otras cuentas. En el editor SQL, abre `supabase/setup.sql` y reemplaza `REEMPLAZAR_HASH_SHA256` por el hash de un token aleatorio de 32 bytes o más.
2. Genera el token con `openssl rand -hex 32` y su hash con `printf '%s' 'EL_TOKEN' | openssl dgst -sha256`. Conserva el token sin cifrar solo en los secretos del servidor; el SQL guarda únicamente su hash.
3. Configura `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_APP_TOKEN` como variables del servidor de despliegue. El token debe coincidir con el hash del SQL. **No uses** una clave `service_role` ni prefijos `NEXT_PUBLIC_` para estos valores.
4. En desarrollo local, copia `.env.example` a `.env` y reemplaza los marcadores. El plugin de Cloudflare carga las variables locales en `env`; `.env` está ignorado por Git.

La tabla tiene RLS y permisos explícitos para `anon`, con una política que exige el token enviado únicamente desde el servidor. Las rutas `/api/state` leen y guardan con revisión incremental; si otra pestaña guardó antes, la app informa el conflicto. El primer acceso crea un estado vacío.

## Contraseña de acceso

Configura dos secretos adicionales en el servidor:

- `APP_LOGIN_PASSWORD`: contraseña larga y única para ingresar. Puedes generarla con `openssl rand -base64 24`.
- `APP_SESSION_SECRET`: clave independiente para firmar las sesiones. Genera `openssl rand -hex 32`.

El navegador recibe una cookie `HttpOnly`, `SameSite=Strict`, válida por siete días. Las rutas de datos y los archivos de respaldo comprueban esa cookie; la contraseña y el token de Supabase permanecen en el servidor. Para cambiar la contraseña, actualiza el secreto del servidor; rota también `APP_SESSION_SECRET` si quieres cerrar todas las sesiones abiertas. No publiques estos valores en GitHub. El sitio de Sites conserva además su acceso privado de propietario. Para otra plataforma, añade control de acceso y limitación de intentos en el perímetro antes de exponer la app públicamente.

## Ejecutar y comprobar

Requiere Node.js 22.13 o posterior. Con las dependencias instaladas desde `pnpm-lock.yaml`, ejecuta `pnpm dev` para desarrollo y `pnpm build` para comprobar el paquete. La configuración de Sites se conserva en `.openai/hosting.json`; para otro proyecto de Sites sustituye su ID. La integración de R2 (`BUCKET`) es opcional y solo se usa para restaurar respaldos antiguos que contenían archivos de origen.

Después de desplegar, abre la aplicación y anota un gasto de prueba. Comprueba en Supabase que aumentó `revision` y que `data->'entries'` contiene el registro. Elimina el gasto de prueba mediante restauración de un respaldo vacío si quieres empezar sin él.
