// ============================================================
// setup_triggers.gs — Configurar triggers automáticos de GAS
// ============================================================
// Ejecutar cada función UNA SOLA VEZ desde el editor de GAS:
//   1. Abrir script.google.com → proyecto Finanzas
//   2. Seleccionar la función en el menú desplegable
//   3. Clic en ▶ Run
//
// NO desplegar como web app — este archivo solo crea triggers.
// ============================================================

/**
 * D5-2: Backup automático semanal a Google Drive.
 * Crea un trigger que ejecuta weeklyBackupToDrive() cada domingo a las 3am (Colombia).
 */
function setupWeeklyBackupTrigger() {
  // Eliminar trigger existente para evitar duplicados
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'weeklyBackupToDrive') {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger('weeklyBackupToDrive')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(3)
    .inTimezone('America/Bogota')
    .create();

  Logger.log('✓ Trigger de backup configurado: domingos 3am Colombia');
}

/**
 * Elimina el trigger de backup (útil si necesitas deshabilitar temporalmente).
 */
function removeWeeklyBackupTrigger() {
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'weeklyBackupToDrive') {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  Logger.log(removed > 0 ? '✓ Trigger de backup eliminado' : 'No había trigger activo');
}

/**
 * Lista todos los triggers activos del proyecto (útil para verificar).
 */
function listTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  if (triggers.length === 0) {
    Logger.log('No hay triggers activos');
    return;
  }
  triggers.forEach(function(t) {
    Logger.log(t.getHandlerFunction() + ' — ' + t.getTriggerSource());
  });
}
