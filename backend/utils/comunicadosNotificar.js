/**
 * Campanita + push al publicar un comunicado (sustituye el aviso por correo).
 */
const { insertNotificacionUsuario } = require('./notificacionInsert');
const { urlComunicadoPorTipoUsuario } = require('./notificacionUrls');
const { enviarPushNotificacionesIndividuales } = require('../services/pushNotificationService');

/**
 * @param {object} ctx
 * @param {Function} ctx.query
 * @param {Function} ctx.execute
 * @param {number} ctx.colegio_id
 * @param {number} ctx.usuario_emisor_id
 * @param {number} ctx.comunicadoId
 * @param {string} ctx.descripcion
 */
async function notificarComunicadoNuevo(ctx) {
  const { query, execute, colegio_id, usuario_emisor_id, comunicadoId, descripcion } = ctx || {};
  if (!colegio_id || !comunicadoId) return;

  const tituloNotif = 'Nuevo comunicado';
  const descripcionCorta = String(descripcion || '').trim().substring(0, 100);
  const contenidoNotif = descripcionCorta
    ? `Nuevo comunicado: "${descripcionCorta}". Ingrese a Comunicados para ver el contenido.`
    : 'Hay un nuevo comunicado. Ingrese a Comunicados para ver el contenido.';

  const usuarios = await query(
    `SELECT id, tipo FROM usuarios
     WHERE colegio_id = ? AND estado = 'ACTIVO' AND tipo IN ('ALUMNO', 'APODERADO', 'DOCENTE')`,
    [colegio_id]
  );
  if (!usuarios || usuarios.length === 0) {
    console.log('📢 [COMUNICADOS] Sin destinatarios activos para notificar');
    return;
  }

  const emisorId = parseInt(usuario_emisor_id, 10);
  const tipoPorUsuario = new Map(usuarios.map((u) => [parseInt(u.id, 10), u.tipo]));

  let campanitas = 0;
  for (const u of usuarios) {
    const destId = parseInt(u.id, 10);
    if (isNaN(destId)) continue;
    try {
      await insertNotificacionUsuario(execute, {
        usuario_id: isNaN(emisorId) ? destId : emisorId,
        destinatario_id: destId,
        asunto: tituloNotif,
        contenido: contenidoNotif,
        estado: 'NO ENVIADO',
        accion_tipo: 'comunicado',
        accion_payload: { comunicado_id: comunicadoId },
        url_destino: urlComunicadoPorTipoUsuario(u.tipo)
      });
      campanitas++;
    } catch (e) {
      console.warn(`📢 [COMUNICADOS] Campanita usuario ${destId}:`, e.message);
    }
  }
  console.log(`✅ [COMUNICADOS] ${campanitas} notificación(es) en campanita`);

  const usuarioIds = usuarios.map((u) => parseInt(u.id, 10)).filter((id) => !isNaN(id));
  if (usuarioIds.length === 0) return;

  const subsData = await query(
    `SELECT usuario_id, endpoint, p256dh, auth
     FROM push_subscriptions
     WHERE usuario_id IN (${usuarioIds.map(() => '?').join(',')})
       AND colegio_id = ? AND (activo = 1 OR activo IS NULL)`,
    [...usuarioIds, colegio_id]
  );

  if (!subsData || subsData.length === 0) {
    console.log('⚠️ [COMUNICADOS] No hay suscripciones push activas');
    return;
  }

  const pushItems = subsData.map((sub) => {
    const uid = parseInt(sub.usuario_id, 10);
    const tipoU = tipoPorUsuario.get(uid) || 'DOCENTE';
    const urlPush = urlComunicadoPorTipoUsuario(tipoU);
    return {
      subscription: {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      },
      payload: {
        title: tituloNotif,
        body: descripcionCorta || contenidoNotif.substring(0, 120),
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-192x192.png',
        vibrate: [200, 100, 200],
        tag: `comunicado-${comunicadoId}-${uid}`,
        data: {
          url: urlPush,
          tipo: 'comunicado',
          comunicado_id: comunicadoId
        }
      }
    };
  });

  enviarPushNotificacionesIndividuales(pushItems)
    .then((resultados) => {
      const ok = resultados.filter((r) => r.resultado && r.resultado.success).length;
      const fail = resultados.length - ok;
      console.log(`📱 [COMUNICADOS] Push: ${ok} ok, ${fail} fallidas (${pushItems.length} suscripciones)`);
    })
    .catch((err) => console.error('❌ [COMUNICADOS] Error push:', err));
}

module.exports = { notificarComunicadoNuevo };
