/**
 * Avisa a ADMINISTRADORES cuando llega un formulario desde la web pública.
 * Canales: reclamo, queja, sugerencia, contacto, visita, trabaja, admision.
 * Campanita + push PWA.
 */
const { query, execute } = require('../utils/mysql');
const { insertNotificacionUsuario } = require('../utils/notificacionInsert');
const { enviarPushNotificacionesIndividuales } = require('./pushNotificationService');
const { DEFAULT_COLEGIO_ID } = require('../utils/defaultColegio');

const URL_BASE = '/admin/comunicaciones/web';

const CANAL_META = {
  reclamo: { label: 'RECLAMO', accion: 'web_reclamo', tab: 'reclamos', pushTitle: 'Nuevo reclamo (web)' },
  queja: { label: 'QUEJA', accion: 'web_reclamo', tab: 'reclamos', pushTitle: 'Nueva queja (web)' },
  sugerencia: {
    label: 'SUGERENCIA',
    accion: 'web_sugerencia',
    tab: 'sugerencias',
    pushTitle: 'Nueva sugerencia (web)',
  },
  contacto: {
    label: 'CONTACTO',
    accion: 'web_contacto',
    tab: 'contacto',
    pushTitle: 'Nuevo contacto (web)',
  },
  visita: {
    label: 'VISITA GUIADA',
    accion: 'web_visita',
    tab: 'visitas',
    pushTitle: 'Nueva visita guiada (web)',
  },
  trabaja: {
    label: 'TRABAJA CON NOSOTROS',
    accion: 'web_trabaja',
    tab: 'trabaja',
    pushTitle: 'Nueva postulación (web)',
  },
  admision: {
    label: 'ADMISIÓN',
    accion: 'web_admision',
    tab: 'admision',
    pushTitle: 'Nueva admisión (web)',
  },
};

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

function normalizeCanal(canal, tipo) {
  let c = String(canal || '').toLowerCase().trim();
  if (c === 'reclamos' || c === 'libro-reclamaciones') c = 'reclamo';
  if (c === 'sugerencias') c = 'sugerencia';
  if (c === 'contactenos' || c === 'contáctenos') c = 'contacto';
  if (c === 'visitas' || c === 'visita-guiada' || c === 'visitas-guiadas') c = 'visita';
  if (c === 'trabaja-con-nosotros' || c === 'postulacion' || c === 'postulación') c = 'trabaja';
  if (c === 'admision-2026' || c === 'admisión' || c === 'ratificacion') c = 'admision';
  if (c === 'queja') return 'queja';
  if (String(tipo || '').toLowerCase() === 'queja' && (c === 'reclamo' || !c)) return 'queja';
  return c;
}

function labelCanal(canal, tipo) {
  const c = normalizeCanal(canal, tipo);
  return CANAL_META[c]?.label || 'FORMULARIO WEB';
}

/**
 * @param {object} opts
 */
async function notificarAdminsWebFormulario(opts = {}) {
  const canal = normalizeCanal(opts.canal, opts.tipo);
  const nombre = String(opts.nombre || '').trim();
  const resumen = clipTexto(opts.resumen);
  const colegioId = opts.colegioId || DEFAULT_COLEGIO_ID;
  const meta = CANAL_META[canal];

  if (!meta || !nombre) {
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

  const accionTipo = meta.accion;
  const urlDestino = `${URL_BASE}?tab=${meta.tab}`;
  const etiqueta = meta.label;

  const email = String(opts.email || '').trim();
  const telefono = String(opts.telefono || '').trim();
  const numero = String(opts.numero || '').trim();
  const tipoForm = String(opts.tipo || '').trim();

  const asunto = numero
    ? `📋 ${etiqueta}: ${numero} — ${nombre}`
    : `📋 ${etiqueta} web — ${nombre}`;

  const lineas = [
    `Se recibió un registro (${etiqueta.toLowerCase()}) desde la web del colegio.`,
    `Quién: ${nombre}`,
  ];
  if (email) lineas.push(`Correo: ${email}`);
  if (telefono) lineas.push(`Teléfono: ${telefono}`);
  if (numero) lineas.push(`Nº registro: ${numero}`);
  if (tipoForm && canal === 'sugerencia') lineas.push(`Tipo: ${tipoForm}`);
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
          canal,
          tipo: tipoForm || canal,
          id: registroId,
          numero: numero || null,
          nombre,
          email: email || null,
          tab: meta.tab,
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
          title: meta.pushTitle,
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

  return { ok: true, adminIds, accionTipo, canal };
}

module.exports = {
  notificarAdminsWebFormulario,
  obtenerIdsAdministradores,
  clipTexto,
  labelCanal,
  normalizeCanal,
  CANAL_META,
};
