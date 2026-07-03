/**
 * Insert en tabla notificaciones con campos opcionales de deep link.
 * Requiere ejecutar database/alter_notificaciones_deep_link.sql antes.
 */
const { fechaHoraMySQLLima } = require('./fechaHoraLima');

async function insertNotificacionUsuario(execute, params) {
  const {
    para = 'USUARIO',
    usuario_id,
    destinatario_id,
    asunto,
    contenido,
    estado = 'NO ENVIADO',
    accion_tipo = null,
    accion_payload = null,
    url_destino = null
  } = params;

  const payloadStr =
    accion_payload == null
      ? null
      : typeof accion_payload === 'string'
        ? accion_payload
        : JSON.stringify(accion_payload);

  await execute(
    `INSERT INTO notificaciones 
     (para, usuario_id, destinatario_id, asunto, contenido, fecha_hora, estado, accion_tipo, accion_payload, url_destino)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      para,
      usuario_id,
      destinatario_id,
      asunto,
      contenido,
      fechaHoraMySQLLima(),
      estado,
      accion_tipo,
      payloadStr,
      url_destino
    ]
  );
}

/**
 * Evita notificaciones duplicadas por doble envío (mismo remitente, destinatario, tipo y texto en ventana corta).
 */
async function notificacionMensajeDuplicadaReciente(query, params) {
  const {
    usuario_id,
    destinatario_id,
    accion_tipo,
    contenido,
    ventanaSegundos = 25
  } = params || {};
  if (
    !query ||
    usuario_id == null ||
    destinatario_id == null ||
    !accion_tipo ||
    contenido == null
  ) {
    return false;
  }
  const contenidoStr = String(contenido);
  const accionStr = String(accion_tipo);
  const rows = await query(
    `SELECT id FROM notificaciones
     WHERE usuario_id = ? AND destinatario_id = ?
       AND accion_tipo COLLATE utf8mb4_unicode_ci = ?
       AND contenido COLLATE utf8mb4_unicode_ci = ?
       AND fecha_hora >= DATE_SUB(NOW(), INTERVAL ? SECOND)
     LIMIT 1`,
    [usuario_id, destinatario_id, accionStr, contenidoStr, ventanaSegundos]
  );
  return Array.isArray(rows) && rows.length > 0;
}

module.exports = { insertNotificacionUsuario, notificacionMensajeDuplicadaReciente };
