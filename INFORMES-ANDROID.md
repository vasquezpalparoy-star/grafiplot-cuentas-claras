# Grafiplot · Conteo de efectivo Android

APK para un único celular autorizado, con el icono Grafiplot aportado por el propietario. El trabajador solo elige mañana o tarde y registra el efectivo contado al cierre, incluidos los S/ 60 iniciales. El efectivo inicial se guarda automáticamente como S/ 60 para cada turno.

No pide ventas, gastos, Yape, trabajador, horas ni observaciones. No consulta la caja ni permite editar o borrar registros enviados. El propietario completa gastos, Yape y la revisión final en su aplicación principal.

## Activar el celular una sola vez

1. En el navegador donde ingresas al sistema principal con tu cuenta, abre https://vasquezpalparoy-star.github.io/grafiplot-cuentas-claras/trabajador.html?activar=1.
2. Genera el código de activación, instala la APK en el celular y pega el código.
3. En adelante el equipo recordará su autorización: turno, conteo, revisión y envío.

El código dura siete días y se consume una vez. Generar otro código revoca el celular anterior. No hace falta registrar trabajadores para utilizar esta APK. Se deshabilitan las copias de seguridad Android y la depuración del WebView.

## Datos que registra

El envío guarda el efectivo total contado, el inicio de S/ 60, fecha, turno y auditoría. En el sistema se crea una venta en efectivo calculada a partir del conteo menos los S/ 60 iniciales. No registra gastos, Yape ni asistencia. Los movimientos existentes se conservan. El cierre queda pendiente de revisión del propietario (`closed=false`) hasta que complete sus datos en el sistema principal. Ejemplo sin otros movimientos: conteo S/ 260, fondo S/ 60, ventas calculadas S/ 200. Al registrar gastos o salidas en efectivo después, el sistema ajusta esa venta calculada para reconstruir las ventas brutas y no descontar el mismo gasto dos veces. Una corrección manual de esa venta por el propietario deja de recalcularla automáticamente.

Se permite un conteo por fecha y turno. Un reintento idéntico devuelve el mismo comprobante. Otro conteo para el mismo turno se rechaza. Si el sistema principal ya tiene conteo o cierre, la APK no lo reemplaza. El sistema principal ve el conteo al cargar o recargar la página.

## Instalar

Descarga la APK e instálala en Android 8 o posterior. Es una APK firmada para instalación directa; no se publica en Play Store. Necesita internet para enviar y guarda localmente el borrador si no se envía. La APK carga la pantalla publicada y recibe sus mejoras sin reinstalar.

El workflow **Construir APK de informes** genera el artefacto **Grafiplot-Informes-Android**. La firma inicial es de desarrollo; nuevos builds de runners diferentes pueden tener otra firma. Las actualizaciones del binario sobre la misma instalación requieren una firma estable en GitHub Secrets. La desinstalación borra la autorización y el borrador.

`supabase/worker-reports.sql` añade dos tablas privadas y tres operaciones limitadas. La activación no devuelve información de caja. No se modifican las políticas ni las sesiones del propietario.

La migración adicional `supabase/worker-count-sales.sql` añade el cálculo de ventas de los nuevos conteos, sin modificar otras ventas.
