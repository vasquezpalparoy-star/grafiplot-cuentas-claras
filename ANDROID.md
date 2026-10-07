# APK Android independiente

La web en `pages/`, su publicación en GitHub Pages y las políticas de Supabase siguen sin cambios. La APK tiene su propia interfaz en `android-web/`, reutiliza los mismos cálculos y conecta al mismo proyecto de Supabase. Cuenta como una sesión adicional dentro del límite de tres dispositivos.

## Uso

Configura un PIN, patrón o contraseña de bloqueo en Android. Entra por primera vez con internet y tu correo y clave actuales. Después de descargar las cuentas, puedes registrar movimientos sin conexión. Los cambios se guardan primero en el celular, cifrados con AES-GCM y una clave no exportable de Android Keystore. Los tokens también se cifran. La app solicita el desbloqueo del celular al abrirla y al regresar después de 30 segundos; bloquea capturas y copias automáticas del sistema.

Con la app abierta, al volver internet, volver a la app o cada 30 segundos, comprueba la sesión y sincroniza. Android puede suspender una app cerrada: en ese caso sincroniza al abrirla nuevamente. El permiso local dura hasta siete días desde la última comprobación válida en la nube. Una revocación remota solo puede comprobarse al recuperar conexión; no puede retirar datos de un celular desconectado.

La nube conserva el correo autorizado, las políticas RLS y el límite de tres sesiones. La APK solo contiene la clave pública existente. No contiene contraseñas ni claves privadas de Supabase. La recuperación de clave se realiza en la página HTTPS existente; luego se ingresa en la APK con la nueva clave.

Los movimientos independientes se combinan por ID; la caja por fecha y turno. Correcciones incompatibles del mismo campo detienen la sincronización sin sobrescribir el celular ni la nube. Revisa el registro conflictivo con la web. La APK permite conservar las correcciones locales o usar las de la nube; primero solicita exportar un respaldo y conserva los cambios independientes de ambos dispositivos. No se permite cerrar sesión con cambios pendientes. El respaldo exportado contiene los registros contables en JSON sin cifrar: guárdalo de forma privada; no incluye los Excel históricos que pertenecían al servidor anterior.

## Compilar

Requiere Node 22+, Java 21 y Android SDK 36. Ejecuta:

```sh
pnpm install --frozen-lockfile
pnpm android:test
pnpm exec tsc --noEmit -p tsconfig.android.json
pnpm android:sync
cd android
./gradlew assembleRelease lintRelease
```

GitHub Actions compila una APK release sin firma en la rama `android-apk-offline`, sin ejecutar el despliegue de Pages. Para instalarla, hay que firmarla con una clave privada mantenida fuera del repositorio. Conserva esa clave para que las actualizaciones futuras se instalen sobre la misma aplicación y conserven la copia local. Nunca publiques el keystore ni su contraseña. El identificador es `com.grafiplot.cuentasclaras`, con Android 7 o posterior.

La verificación automatizada cubre combinación de movimientos, caja y conflictos, tipos, compilación y lint Android. También deben comprobarse en un celular real: inicio con PIN, modo avión, reinicio de la app con cambios pendientes, regreso de internet, revocación, restauración/exportación y correcciones simultáneas desde la web. Desinstalar o borrar el almacenamiento de Android elimina los cambios locales pendientes.
