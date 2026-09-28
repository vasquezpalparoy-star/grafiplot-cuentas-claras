# Cuentas claras — pantallas, datos y cálculos

## Pantallas

- **Resumen:** ventas, gastos, personal, resultado, efectivo esperado y alertas de la fecha elegida.
- **Caja diaria:** dos turnos con asistencia, apertura, conteo, diferencia y explicación; cierre diario.
- **Movimientos:** otros ingresos, retiros, gastos, adelantos, bonos, descuentos y pagos. Las ventas en efectivo se anotan en Caja diaria y los cobros Yape se importan.
- **Caja diaria:** los cobros Yape se anotan junto a las ventas en efectivo; el saldo visto en Yape al cierre se guarda aparte y no se suma como venta. El importador Excel ya no aparece. Los registros importados antes se conservan en los respaldos y cálculos históricos.
- **Personal:** ficha, tarifa, asistencia y detalle del pago semanal.
- **Reportes:** vistas por día, semana, mes y año; filtros, gráficos y exportación.
- **Guía y ajustes:** fórmulas, inicio de semana, horarios, respaldo, restauración e historial.

## Datos persistentes

Un documento estructurado contiene configuración, trabajadores activos y retirados, asistencia y ausencias, movimientos, turnos, efectivo contado, saldo Yape al cierre e historial de cambios. Se guarda en el proyecto independiente de Supabase con control de revisión. El acceso requiere contraseña y una sesión firmada; las rutas de datos verifican la sesión en el servidor. Los datos anteriores se conservaron en un respaldo separado y la base actual empezó vacía.

## Fórmulas

- Efectivo esperado por turno = efectivo inicial + ventas y otros ingresos en efectivo − gastos, retiros, devoluciones, adelantos y pagos al personal en efectivo. Bonos y descuentos todavía no desembolsados son ajustes, no movimientos de caja.
- Diferencia = efectivo contado − esperado. El cierre diario toma el efectivo final del turno 2; el efectivo inicial del segundo turno es un traspaso y no una venta ni un ingreso nuevo.
- Ventas = ventas manuales + cobros Yape incluidos sin vínculo manual − devoluciones Yape incluidas. Movimientos pendientes o excluidos no afectan totales.
- El saldo Yape al cierre es una cifra anotada por el usuario; no se infiere de los cobros ni se suma de nuevo a las ventas.
- Fondo sugerido de efectivo para el día siguiente: S/ 60, configurable. Retiro sugerido = máximo entre cero y efectivo contado al final del día menos el fondo. El efectivo se cuenta antes del retiro.
- Resultado estimado = ventas − gastos operativos − pagos y adelantos al personal − `PAGASTE` de Yape sin movimiento manual vinculado. Estos pagos se muestran por separado hasta clasificarlos; otros ingresos y retiros se muestran en caja, fuera de ventas.
- Pago semanal = base + bonos − descuentos − adelantos − pagos. Base = tarifa × turnos, días únicos u horas; tarifa semanal fija se aplica una vez a la semana. Saldo mínimo mostrado: cero.
- Semana inicial: lunes. Turno 1 desde 08:00, turno 2 desde 16:00. Horas anteriores a 08:00 requieren asignación manual. Estos valores se pueden cambiar en la Guía.

La asistencia positiva cuenta para el pago semanal. Una ausencia explícita se guarda con cero horas y no genera pago. Quitar un trabajador lo deja inactivo sin borrar su historia ni sus pagos.
