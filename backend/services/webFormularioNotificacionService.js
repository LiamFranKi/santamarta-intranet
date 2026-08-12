/**
 * Avisa a todos los ADMINISTRADORES cuando llega un reclamo/queja/sugerencia
 * desde la web pública (web-vanguard → misma BD).
 * Campanita (tabla notificaciones) + push PWA.
 */
const { query, execute } = require('../utils/mysql');
const { insertNotificacionUsuario } = require('../utils/notificacionInsert');
const { enviarPushNotificacionesIndividuales } = require('./pushNotificationService');
const { DEFAULT_COLEGIO_ID } = require('../utils/defaultColegio');

const URL_DESTINO = '/admin/comunicaciones/reclamos-sugerencias';

async function obtenerIdsAdministradores(colegioId) {
  const rows = await query(
    `SELECT id FROM usuarios
     WHERE colegio_id = ? AND tipo = 'ADMINISTRADOR'
       AND (estado = 'ACTIVO' OR estado IS NULL)`,
    [colegioId]
  );
  return (rows || []).map((r) => parseInt(r.id, 10)).filter(Boolean);
}

function clipTexto(texto, max = 220) {
  const s = String(texto || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '—';
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function labelCanal(canal, tipo) {
  const c = String(canal || '').toLowerCase();
  const t = String(tipo || '').toLowerCase();
  if (c === 'sugerencia' || c === 'sugerencias') return 'SUGERENCIA';
  if (t === 'queja') return 'QUEJA';
  if (t === 'reclamo') return 'RECLAMO';
  if (c === 'reclamo' || c === 'reclamos' || c === 'queja') {
    return t === 'queja' ? 'QUEJA' : 'RECLAMO';
  }
  return 'FORMULARIO WEB';
}

/**
 * @param {object} opts
 * @param {'reclamo'|'sugerencia'|'queja'} opts.canal
 * @param {string} [opts.tipo] - reclamo|queja|tipo de sugerencia del formulario
 * @param {number} [opts.id] - id en web_reclamos / web_sugerencias
 * @param {string} opts.nombre
 * @param {string} [opts.email]
 * @param {string} [opts.telefono]
 * @param {string} [opts.resumen] - detalle o mensaje
 * @param {string} [opts.numero] - nº libro de reclamaciones
 * @param {number} [opts.colegioId]
 */
async function notificarAdminsWebFormulario(opts = {}) {
  const canal = String(opts.canal || '').toLowerCase();
  const nombre = String(opts.nombre || '').trim();
  const resumen = clipTexto(opts.resumen);
  const colegioId = opts.colegioId || DEFAULT_COLEGIO_ID;

  if (!canal || !nombre) {
    return { ok: false, reason: 'params' };
  }

  let adminIds;
  try {
    adminIds = await obtenerIdsAdministradores(colegioId);
  } catch (e) {
    console.warn('[web-form-notif] admins:', e.message);
    return { ok: false, reason: 'admins_error' };
  }
  if (!adminIds.length) return { ok: false, reason: 'sin_admins' };

  const etiqueta = labelCanal(canal, opts.tipo);
  const esSugerencia = etiqueta === 'SUGERENCIA';
  const accionTipo = esSugerencia ? 'web_sugerencia' : 'web_reclamo';
  const urlDestino = esSugerencia
    ? `${URL_DESTINO}?tab=sugerencias`
    : `${URL_DESTINO}?tab=reclamos`;

  const email = String(opts.email || '').trim();
  const telefono = String(opts.telefono || '').trim();
  const numero = String(opts.numero || '').trim();
  const tipoForm = String(opts.tipo || '').trim();

  const asunto = numero
    ? `📋 ${etiqueta}: ${numero} — ${nombre}`
    : `📋 ${etiqueta} web — ${nombre}`;

  const lineas = [
    `Se recibió un(a) ${etiqueta.toLowerCase()} desde la web del colegio.`,
    `Quién: ${nombre}`,
  ];
  if (email) lineas.push(`Correo: ${email}`);
  if (telefono) lineas.push(`Teléfono: ${telefono}`);
  if (numero) lineas.push(`Nº registro: ${numero}`);
  if (tipoForm && esSugerencia) lineas.push(`Tipo: ${tipoForm}`);
  lineas.push('');
  lineas.push(resumen);

  const contenido = lineas.join('\n');
  const emisorId = adminIds[0];
  const registroId = opts.id != null ? Number(opts.id) : null;

  for (const did of adminIds) {
    try {
      await insertNotificacionUsuario(execute, {
        usuario_id: emisorId,
        destinatario_id: did,
        asunto,
        contenido,
        estado: 'ENVIADO',
        accion_tipo: accionTipo,
        accion_payload: {
          canal: esSugerencia ? 'sugerencia' : 'reclamo',
          tipo: tipoForm || (esSugerencia ? 'sugerencia' : 'reclamo'),
          id: registroId,
          numero: numero || null,
          nombre,
          email: email || null,
        },
        url_destino: urlDestino,
      });
    } catch (e) {
      console.warn(`[web-form-notif] campanita admin ${did}:`, e.message);
    }
  }

  try {
    const ph = adminIds.map(() => '?').join(',');
    const subs = await query(
      `SELECT usuario_id, endpoint, p256dh, auth FROM push_subscriptions
       WHERE usuario_id IN (${ph}) AND colegio_id = ? AND (activo = 1 OR activo IS NULL)`,
      [...adminIds, colegioId]
    );
    if (subs?.length) {
      const bodyPush = `${nombre}: ${resumen}`;
      const pushItems = subs.map((sub) => ({
        subscription: {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload: {
          title: etiqueta === 'SUGERENCIA' ? 'Nueva sugerencia (web)' : `Nuevo ${etiqueta.toLowerCase()} (web)`,
          body: bodyPush.length > 120 ? `${bodyPush.slice(0, 117)}…` : bodyPush,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-192x192.png',
          vibrate: [120, 60, 120],
          tag: `web-form-${accionTipo}-${registroId || Date.now()}`,
          data: {
            url: urlDestino,
            tipo: accionTipo,
            id: registroId,
          },
        },
      }));
      enviarPushNotificacionesIndividuales(pushItems).catch((err) =>
        console.warn('[web-form-notif] push:', err.message)
      );
    }
  } catch (e) {
    console.warn('[web-form-notif] push query:', e.message);
  }

  console.log('[web-form-notif] avisados admins', {
    colegioId,
    canal: etiqueta,
    nombre,
    id: registroId,
    admins: adminIds.length,
  });

  return { ok: true, adminIds, accionTipo };
}

module.exports = {
  notificarAdminsWebFormulario,
  obtenerIdsAdministradores,
  clipTexto,
  labelCanal,
};
