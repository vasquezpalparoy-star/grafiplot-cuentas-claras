# Grafiplot · Informes Android

Aplicación separada para un único celular, con informes de mañana y tarde. La caja y las pantallas actuales se conservan. No hay aplicación de Windows.

## Autorizar el celular

1. Agrega los trabajadores activos en Personal del sistema actual.
2. Desde el navegador donde iniciaste sesión como propietario, abre `https://vasquezpalparoy-star.github.io/grafiplot-cuentas-claras/trabajador.html?activar=1` y genera un código.
3. Instala la APK en el celular y pega el código una vez. Se recordará el equipo y los nombres de los trabajadores activos al activarlo.
4. El trabajador elige su nombre, mañana o tarde, completa caja, gastos, horas y observaciones, revisa y confirma el envío. Necesita internet para enviar. El borrador queda en el equipo.

Solo hay un acceso de celular vigente en la base de datos. El código caduca en siete días y se consume al activarlo. Generar otro código revoca el equipo anterior; sirve también si se cambia de celular o de lista de trabajadores. La app deshabilita copias de seguridad de Android y la depuración del WebView. No hay inicio de sesión del propietario dentro de la APK, ni acceso a sus pantallas, importaciones, recuperación de datos o modificación de registros enviados.

El envío añade ventas, gastos, asistencia y cierre a la caja existente, y registra auditoría y revisión en una sola transacción. El sistema principal ve los datos al cargar o recargar su página. Los reintentos del mismo informe reciben el comprobante anterior sin repetir movimientos. Otro contenido para el mismo trabajador/fecha/turno se rechaza. Si el turno ya tiene ventas o un cierre, se rechaza para no reemplazar datos del sistema. Las correcciones se hacen desde el sistema principal por el propietario. La APK no puede borrar ni modificar informes.

## Construcción e instalación

El workflow **Construir APK de informes** genera el archivo instalable en el artefacto **Grafiplot-Informes-Android**. Descarga el ZIP del workflow, extrae `app-debug.apk` e instálalo en Android 8 o posterior. Es una APK firmada de instalación directa, con depuración deshabilitada. No se publica en Play Store.

La firma inicial es de desarrollo; los builds de distintos runners pueden tener firmas diferentes. Para actualizaciones continuas sobre la misma instalación se necesita configurar una clave de firma de producción en GitHub Secrets. No desinstales la app sin guardar o enviar tu borrador: desinstalar borra su activación. El propietario puede generar un nuevo código si fuera necesario.

## Base de datos

`supabase/worker-reports.sql` añade dos tablas privadas y tres operaciones específicas. No modifica las políticas existentes de caja, el inicio de sesión ni las sesiones del propietario. Los trabajadores no pueden leer la caja ni acceder directamente a estas tablas. Su token autoriza exclusivamente el envío. La activación devuelve solo nombres e identificadores de trabajadores activos, sin tarifas ni datos de caja.
