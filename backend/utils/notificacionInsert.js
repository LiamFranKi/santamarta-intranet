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

module.exports = { insertNotificacionUsuario };
