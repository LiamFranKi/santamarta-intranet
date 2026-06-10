/**
 * Cierra intentos ACTIVO al terminar ventana, cierre docente o tiempo individual;
 * notifica apoderados que aún no recibieron aviso.
 */
const moment = require('moment-timezone');
const {
  finalizarPruebaConCalificacion,
  aplicarEstadoFinalizadoPrueba,
} = require('./examenFinalizarPrueba');
const {
  enviarNotificacionApoderadosExamenIfNeeded,
  pruebaYaNotificoApoderados,
} = require('./examenNotificarApoderados');

const BATCH_EXPIRADOS = 100;
const BATCH_NOTIF_REINTENTO = 40;

const MOTIVO = {
  TIEMPO_AGOTADO: 'TIEMPO_AGOTADO',
  CIERRE_DOCENTE: 'CIERRE_DOCENTE',
  VENTANA_EXAMEN: 'VENTANA_EXAMEN',
  EXAMEN_INACTIVO: 'EXAMEN_INACTIVO',
  EXAMEN_ELIMINADO: 'EXAMEN_ELIMINADO',
};

function esFechaInvalida(val) {
  if (!val) return true;
  const s = String(val).trim();
  return !s || s.startsWith('0000-00-00');
}

function esErrorExamenNoEncontrado(err) {
  return err?.status === 404 && /examen no encontrado/i.test(String(err?.message || ''));
}

function normalizarFechaExamen(val) {
  if (!val) return '';
  if (typeof val === 'string') {
    if (esFechaInvalida(val)) return '';
    return val.split(' ')[0].trim();
  }
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return moment(val).tz('America/Lima').format('YYYY-MM-DD');
  }
  const s = String(val);
  return esFechaInvalida(s) ? '' : s.split(' ')[0].trim();
}

function normalizarHoraExamen(val) {
  if (!val) return '';
  const h = String(val).trim();
  if (!h || h === '00:00:00') return '';
  return h.substring(0, 5);
}

function ventanaExamenVencida(examenRow) {
  const fechaInicio = normalizarFechaExamen(examenRow.fecha_desde);
  const fechaFin = normalizarFechaExamen(examenRow.fecha_hasta);
  const horaInicio = normalizarHoraExamen(examenRow.hora_desde);
  const horaFin = normalizarHoraExamen(examenRow.hora_hasta);
  if (!fechaInicio || !fechaFin || !horaInicio || !horaFin) return false;

  const ahoraLima = moment.tz('America/Lima');
  const fin = moment.tz(`${fechaFin} ${horaFin}:00`, 'YYYY-MM-DD HH:mm:ss', 'America/Lima');
  if (!fin.isValid()) return false;
  return ahoraLima.isSameOrAfter(fin);
}

async function examenExiste(query, examenId) {
  const eid = parseInt(examenId, 10);
  if (!Number.isFinite(eid)) return false;
  const rows = await query(`SELECT id FROM asignaturas_examenes WHERE id = ? LIMIT 1`, [eid]);
  return !!rows?.length;
}

async function marcarNotifOmitidaHuerfano(execute, pruebaId) {
  try {
    await execute(
      `UPDATE asignaturas_examenes_pruebas SET notif_apoderados_enviada_at = NOW() WHERE id = ?`,
      [pruebaId]
    );
  } catch (err) {
    if (err?.code !== 'ER_BAD_FIELD_ERROR' && !/notif_apoderados_enviada_at/i.test(String(err.message || ''))) {
      throw err;
    }
  }
}

/** Intentos cuyo examen padre ya no existe: cerrar sin calificar ni notificar. */
async function resolverIntentoHuerfano({ execute, pruebaRow }) {
  const calificacionCero = { puntajeFinal: 0, correctas: 0, incorrectas: 0 };

  if (String(pruebaRow.estado) === 'ACTIVO') {
    await aplicarEstadoFinalizadoPrueba(execute, pruebaRow.id, calificacionCero, {
      finalizado_por_salida: 'SI',
      motivo_cierre: MOTIVO.EXAMEN_ELIMINADO,
      fecha_cierre_forzado: true,
    });
  }

  await marcarNotifOmitidaHuerfano(execute, pruebaRow.id);

  return {
    finalizado: String(pruebaRow.estado) === 'ACTIVO',
    notificado: false,
    motivo: 'examen_eliminado',
    huerfano: true,
  };
}

async function resolverDatosAlumnoParaNotif(query, matriculaId) {
  const rows = await query(
    `SELECT m.id AS matricula_id, m.alumno_id, m.colegio_id, g.anio AS anio_activo,
            u.id AS usuario_id
     FROM matriculas m
     INNER JOIN grupos g ON g.id = m.grupo_id
     LEFT JOIN usuarios u ON u.alumno_id = m.alumno_id AND u.colegio_id = m.colegio_id AND u.estado = 'ACTIVO'
     WHERE m.id = ?
     LIMIT 1`,
    [matriculaId]
  );
  return rows?.[0] || null;
}

/**
 * Finaliza un intento ACTIVO y notifica apoderados si corresponde.
 */
async function cerrarIntentoIndividual({ query, execute, pruebaRow, examenId, motivoCierre }) {
  if (!pruebaRow) {
    return { finalizado: false, notificado: false, motivo: 'sin_fila' };
  }

  const eid = parseInt(examenId ?? pruebaRow.examen_id, 10);

  if (String(pruebaRow.estado) === 'FINALIZADA') {
    if (!(await examenExiste(query, eid))) {
      return resolverIntentoHuerfano({ execute, pruebaRow });
    }
    return reintentarNotificacionPendiente({ query, execute, pruebaRow, examenId: eid });
  }

  if (String(pruebaRow.estado) !== 'ACTIVO') {
    return { finalizado: false, notificado: false, motivo: 'no_activo' };
  }

  if (!(await examenExiste(query, eid))) {
    return resolverIntentoHuerfano({ execute, pruebaRow });
  }

  const calificacion = await finalizarPruebaConCalificacion({
    query,
    execute,
    pruebaRow,
    examenId: eid,
  });

  await aplicarEstadoFinalizadoPrueba(execute, pruebaRow.id, calificacion, {
    finalizado_por_salida: 'SI',
    motivo_cierre: motivoCierre || MOTIVO.EXAMEN_INACTIVO,
    fecha_cierre_forzado: true,
  });

  return notificarIntentoFinalizado({
    query,
    execute,
    pruebaId: pruebaRow.id,
    examenId: eid,
    matriculaId: pruebaRow.matricula_id,
    calificacion,
  });
}

async function notificarIntentoFinalizado({
  query,
  execute,
  pruebaId,
  examenId,
  matriculaId,
  calificacion,
}) {
  const ctx = await resolverDatosAlumnoParaNotif(query, matriculaId);
  if (!ctx?.usuario_id) {
    return { finalizado: true, notificado: false, motivo: 'sin_usuario' };
  }

  const notif = await enviarNotificacionApoderadosExamenIfNeeded({
    query,
    execute,
    pruebaId,
    examenId,
    matriculaId: ctx.matricula_id,
    alumno_id: ctx.alumno_id,
    usuario_id: ctx.usuario_id,
    colegio_id: ctx.colegio_id,
    anio_activo: ctx.anio_activo,
    calificacion,
  });

  return { finalizado: true, notificado: !!notif.enviado, motivo: notif.motivo };
}

async function reintentarNotificacionPendiente({ query, execute, pruebaRow, examenId }) {
  if (await pruebaYaNotificoApoderados(query, pruebaRow.id)) {
    return { finalizado: false, notificado: false, motivo: 'ya_notificado' };
  }

  const eid = parseInt(examenId ?? pruebaRow.examen_id, 10);
  if (!(await examenExiste(query, eid))) {
    return resolverIntentoHuerfano({ execute, pruebaRow });
  }

  const r = await notificarIntentoFinalizado({
    query,
    execute,
    pruebaId: pruebaRow.id,
    examenId: eid,
    matriculaId: pruebaRow.matricula_id,
    calificacion: null,
  });
  return { finalizado: false, notificado: r.notificado, motivo: r.motivo || 'reintento_notif' };
}

function acumularResultadoIntento(stats, result) {
  if (result.huerfano) {
    stats.huerfanos += 1;
    return;
  }
  if (result.finalizado) stats.cerrados += 1;
  if (result.notificado) stats.notificados += 1;
}

async function cerrarIntentosPendientesExamen({ query, execute, examenId, motivoCierre }) {
  const eid = parseInt(examenId, 10);
  if (!Number.isFinite(eid)) return { cerrados: 0, notificados: 0, huerfanos: 0, errores: 0 };

  const pruebas = await query(
    `SELECT * FROM asignaturas_examenes_pruebas WHERE examen_id = ? AND estado = 'ACTIVO'`,
    [eid]
  );

  const stats = { cerrados: 0, notificados: 0, huerfanos: 0, errores: 0 };
  for (const prueba of pruebas || []) {
    try {
      const r = await cerrarIntentoIndividual({
        query,
        execute,
        pruebaRow: prueba,
        examenId: eid,
        motivoCierre,
      });
      acumularResultadoIntento(stats, r);
    } catch (err) {
      stats.errores += 1;
      if (!esErrorExamenNoEncontrado(err)) {
        console.error(`[EXAMEN CIERRE AUTO] Error prueba_id=${prueba.id}:`, err?.message || err);
      }
    }
  }
  return stats;
}

function programarCierreIntentosPendientesExamen({ query, execute, examenId, motivoCierre }) {
  setImmediate(async () => {
    try {
      const stats = await cerrarIntentosPendientesExamen({
        query,
        execute,
        examenId,
        motivoCierre,
      });
      if (stats.cerrados > 0 || stats.notificados > 0 || stats.huerfanos > 0) {
        console.log(
          `[EXAMEN CIERRE AUTO] examen_id=${examenId} motivo=${motivoCierre} cerrados=${stats.cerrados} notificados=${stats.notificados} huerfanos=${stats.huerfanos} errores=${stats.errores}`
        );
      }
    } catch (err) {
      console.error('[EXAMEN CIERRE AUTO] Error en cierre programado:', err?.message || err);
    }
  });
}

async function desactivarExamenesVentanaVencida(query, execute) {
  const examenes = await query(
    `SELECT id, titulo, estado, fecha_desde, fecha_hasta, hora_desde, hora_hasta
     FROM asignaturas_examenes
     WHERE estado = 'ACTIVO'
       AND fecha_desde IS NOT NULL AND fecha_hasta IS NOT NULL
       AND hora_desde IS NOT NULL AND hora_hasta IS NOT NULL`
  );

  let desactivados = 0;
  for (const examen of examenes || []) {
    if (!ventanaExamenVencida(examen)) continue;
    try {
      await execute(`UPDATE asignaturas_examenes SET estado = 'INACTIVO' WHERE id = ?`, [examen.id]);
      desactivados += 1;
      await cerrarIntentosPendientesExamen({
        query,
        execute,
        examenId: examen.id,
        motivoCierre: MOTIVO.VENTANA_EXAMEN,
      });
    } catch (err) {
      console.error(`[EXAMEN CIERRE AUTO] Ventana vencida examen ${examen.id}:`, err?.message || err);
    }
  }
  return desactivados;
}

async function cerrarIntentosExpirados(query, execute) {
  const pruebas = await query(
    `SELECT * FROM asignaturas_examenes_pruebas
     WHERE estado = 'ACTIVO'
       AND expiracion IS NOT NULL
       AND expiracion <= NOW()
     ORDER BY id ASC
     LIMIT ${BATCH_EXPIRADOS}`
  );

  const stats = { cerrados: 0, huerfanos: 0, errores: 0 };
  for (const prueba of pruebas || []) {
    try {
      const r = await cerrarIntentoIndividual({
        query,
        execute,
        pruebaRow: prueba,
        examenId: prueba.examen_id,
        motivoCierre: MOTIVO.TIEMPO_AGOTADO,
      });
      acumularResultadoIntento(stats, r);
    } catch (err) {
      stats.errores += 1;
      if (!esErrorExamenNoEncontrado(err)) {
        console.error(`[EXAMEN CIERRE AUTO] Expiración prueba ${prueba.id}:`, err?.message || err);
      }
    }
  }
  return stats;
}

async function cerrarIntentosExamenInactivo(query, execute) {
  const pruebas = await query(
    `SELECT p.* FROM asignaturas_examenes_pruebas p
     INNER JOIN asignaturas_examenes ae ON ae.id = p.examen_id
     WHERE p.estado = 'ACTIVO' AND ae.estado = 'INACTIVO'`
  );

  const stats = { cerrados: 0, huerfanos: 0, errores: 0 };
  for (const prueba of pruebas || []) {
    try {
      const r = await cerrarIntentoIndividual({
        query,
        execute,
        pruebaRow: prueba,
        examenId: prueba.examen_id,
        motivoCierre: MOTIVO.EXAMEN_INACTIVO,
      });
      acumularResultadoIntento(stats, r);
    } catch (err) {
      stats.errores += 1;
      if (!esErrorExamenNoEncontrado(err)) {
        console.error(`[EXAMEN CIERRE AUTO] Examen INACTIVO prueba ${prueba.id}:`, err?.message || err);
      }
    }
  }
  return stats;
}

async function reintentarNotificacionesPendientes(query, execute) {
  let rows = [];
  try {
    rows = await query(
      `SELECT * FROM asignaturas_examenes_pruebas
       WHERE estado = 'FINALIZADA' AND notif_apoderados_enviada_at IS NULL
       ORDER BY id ASC
       LIMIT ${BATCH_NOTIF_REINTENTO}`
    );
  } catch (err) {
    if (err?.code !== 'ER_BAD_FIELD_ERROR' && !/notif_apoderados_enviada_at/i.test(String(err.message || ''))) {
      throw err;
    }
    return { enviados: 0, huerfanos: 0, errores: 0 };
  }

  const stats = { enviados: 0, huerfanos: 0, errores: 0 };
  for (const prueba of rows || []) {
    try {
      const r = await reintentarNotificacionPendiente({
        query,
        execute,
        pruebaRow: prueba,
        examenId: prueba.examen_id,
      });
      if (r.huerfano) stats.huerfanos += 1;
      else if (r.notificado) stats.enviados += 1;
    } catch (err) {
      stats.errores += 1;
      if (!esErrorExamenNoEncontrado(err)) {
        console.error(`[EXAMEN CIERRE AUTO] Reintento notif prueba ${prueba.id}:`, err?.message || err);
      }
    }
  }
  return stats;
}

/**
 * Job periódico: expiración individual, examen inactivo, ventana vencida y notificaciones pendientes.
 */
async function verificarExamenesIntentosPendientes() {
  const { query, execute } = require('./mysql');

  const expStats = await cerrarIntentosExpirados(query, execute);
  const inacStats = await cerrarIntentosExamenInactivo(query, execute);
  const desactivados = await desactivarExamenesVentanaVencida(query, execute);
  const notifStats = await reintentarNotificacionesPendientes(query, execute);

  const huerfanos =
    (expStats.huerfanos || 0) + (inacStats.huerfanos || 0) + (notifStats.huerfanos || 0);
  const expirados = expStats.cerrados || 0;
  const inactivos = inacStats.cerrados || 0;
  const notificados = notifStats.enviados || 0;
  const errores = (expStats.errores || 0) + (inacStats.errores || 0) + (notifStats.errores || 0);

  if (expirados + inactivos + desactivados + notificados + huerfanos > 0 || errores > 0) {
    console.log(
      `[EXAMEN CIERRE AUTO] Cron: expirados=${expirados} inactivos=${inactivos} ventana=${desactivados} notif_reintento=${notificados} huerfanos_limpiados=${huerfanos} errores=${errores}`
    );
  }

  return { expirados, inactivos, desactivados, notificados, huerfanos, errores };
}

module.exports = {
  MOTIVO,
  cerrarIntentoIndividual,
  cerrarIntentosPendientesExamen,
  programarCierreIntentosPendientesExamen,
  verificarExamenesIntentosPendientes,
  ventanaExamenVencida,
};
