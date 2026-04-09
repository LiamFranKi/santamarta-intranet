/**
 * Notificaciones al activar una encuesta: campanita + push (sin correo masivo).
 */
const { query, execute } = require('../utils/mysql');
const { insertNotificacionUsuario } = require('../utils/notificacionInsert');
const { enviarPushNotificacionesIndividuales } = require('./pushNotificationService');

async function obtenerDestinatariosEncuesta(colegio_id, audiencias) {
  if (!audiencias || audiencias.length === 0) return [];
  const types = audiencias.map((a) => a.tipo);
  if (types.includes('TODOS')) {
    return query(
      `SELECT id, email, tipo, personal_id FROM usuarios WHERE colegio_id = ? AND (estado = 'ACTIVO' OR estado IS NULL)`,
      [colegio_id]
    );
  }
  const parts = [];
  if (types.includes('ALUMNO')) parts.push(`tipo = 'ALUMNO'`);
  if (types.includes('APODERADO')) parts.push(`tipo = 'APODERADO'`);
  if (types.includes('DOCENTE')) parts.push(`tipo = 'DOCENTE'`);
  if (types.includes('PROMOTORIA')) parts.push(`tipo = 'PROMOTORIA'`);
  if (types.includes('ADMINISTRADOR')) parts.push(`tipo = 'ADMINISTRADOR'`);
  if (types.includes('PERSONAL')) parts.push(`(personal_id IS NOT NULL AND personal_id > 0)`);
  if (parts.length === 0) return [];
  const sql = `SELECT id, email, tipo, personal_id FROM usuarios WHERE colegio_id = ? AND (estado = 'ACTIVO' OR estado IS NULL) AND (${parts.join(' OR ')})`;
  return query(sql, [colegio_id]);
}

/**
 * @param {object} params
 * @param {number} params.colegio_id
 * @param {number} params.encuesta_id
 * @param {string} params.titulo
 * @param {number} params.usuario_id_emisor
 * @param {Array<{tipo:string}>} params.audiencias
 */
async function notificarEncuestaActivada({ colegio_id, encuesta_id, titulo, usuario_id_emisor, audiencias }) {
  const dest = await obtenerDestinatariosEncuesta(colegio_id, audiencias);
  if (!dest || dest.length === 0) return;

  const tituloSafe = String(titulo || 'Encuesta').trim() || 'Encuesta';
  const urlDestino = '/encuestas/responder/' + encuesta_id;
  const asunto = 'Nueva encuesta disponible';
  const contenido = `«${tituloSafe}». Tienes una encuesta pendiente; participa cuando puedas.`;

  const destinatariosIds = new Set();
  for (const d of dest) {
    const did = parseInt(d.id, 10);
    if (!did) continue;
    destinatariosIds.add(did);
  }

  for (const did of destinatariosIds) {
    if (did === usuario_id_emisor) continue;
    try {
      await insertNotificacionUsuario(execute, {
        usuario_id: usuario_id_emisor,
        destinatario_id: did,
        asunto,
        contenido,
        estado: 'ENVIADO',
        accion_tipo: 'encuesta_activa',
        accion_payload: { encuesta_id },
        url_destino: urlDestino
      });
    } catch (e) {
      console.warn('[encuestasNotif] campanita', did, e.message);
    }
  }

  const idsPush = [...destinatariosIds].filter((id) => id !== usuario_id_emisor);
  if (idsPush.length === 0) return;

  const ph = idsPush.map(() => '?').join(',');
  const subsData = await query(
    `SELECT usuario_id, endpoint, p256dh, auth FROM push_subscriptions
     WHERE usuario_id IN (${ph}) AND colegio_id = ? AND (activo = 1 OR activo IS NULL)`,
    [...idsPush, colegio_id]
  );
  if (!subsData || subsData.length === 0) return;

  const pushItems = subsData.map((sub) => ({
    subscription: {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth }
    },
    payload: {
      title: 'Nueva encuesta',
      body: tituloSafe.substring(0, 110),
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      vibrate: [200, 100, 200],
      tag: `encuesta-${encuesta_id}`,
      data: { url: urlDestino, tipo: 'encuesta_activa', encuesta_id }
    }
  }));

  enviarPushNotificacionesIndividuales(pushItems).catch((err) =>
    console.error('[encuestasNotif] push', err.message)
  );
}

module.exports = { notificarEncuestaActivada, obtenerDestinatariosEncuesta };
