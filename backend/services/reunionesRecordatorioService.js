/**
 * Recordatorio el mismo día de la reunión (hora Lima), una vez por reunión.
 */
const { query, execute } = require('../utils/mysql');
const {
  tablaReunionesExiste,
  notificarParticipantesReunion,
} = require('../utils/reunionesHelper');
const { fechaMySQLLima } = require('../utils/fechaHoraLima');

async function enviarRecordatoriosReunionesHoy() {
  try {
    if (!(await tablaReunionesExiste(query))) return { ok: true, skipped: true };
  } catch (e) {
    console.warn('[REUNIONES-RECORDATORIO] tablas no disponibles:', e.message);
    return { ok: false, error: e.message };
  }

  const hoy = fechaMySQLLima();
  const reuniones = await query(
    `SELECT r.*
     FROM reuniones r
     WHERE r.fecha = ?
       AND r.estado IN ('CONVOCADA','EN_CURSO')
       AND (r.recordatorio_enviado = 0 OR r.recordatorio_enviado IS NULL)`,
    [hoy]
  );
  if (!reuniones || !reuniones.length) return { ok: true, enviadas: 0 };

  let enviadas = 0;
  for (const r of reuniones) {
    const hora = String(r.hora_inicio || '').slice(0, 5);
    const titulo = String(r.titulo || 'Reunión').trim() || 'Reunión';
    const lugar =
      r.modalidad === 'VIRTUAL'
        ? 'videollamada (enlace en la convocatoria)'
        : r.lugar
          ? `en ${r.lugar}`
          : 'en el colegio';
    try {
      await notificarParticipantesReunion({
        queryFn: query,
        executeFn: execute,
        colegio_id: r.colegio_id,
        reunion: r,
        emisor_usuario_id: r.creador_usuario_id,
        asunto: 'Recordatorio: reunión hoy',
        contenido: `Hoy a las ${hora || '—'} — «${titulo}» ${lugar}.`,
        tagSuffix: 'recordatorio',
      });
      await execute(`UPDATE reuniones SET recordatorio_enviado = 1, updated_at = NOW() WHERE id = ?`, [r.id]);
      enviadas += 1;
    } catch (e) {
      console.warn('[REUNIONES-RECORDATORIO] reunión', r.id, e.message);
    }
  }
  return { ok: true, enviadas };
}

module.exports = { enviarRecordatoriosReunionesHoy };
