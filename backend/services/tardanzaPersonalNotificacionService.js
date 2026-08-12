/**
 * Avisa a todos los ADMINISTRADORES del colegio cuando un personal marca entrada con tardanza.
 * Campanita (tabla notificaciones) + push PWA.
 */
const { query, execute } = require('../utils/mysql');
const { insertNotificacionUsuario } = require('../utils/notificacionInsert');
const { enviarPushNotificacionesIndividuales } = require('./pushNotificationService');
const {
  calcTardanza,
  formatHoraDisplay,
  nombrePersonal,
} = require('../utils/adminTardanzasHuellero');

const URL_DESTINO = '/admin/herramientas/tardanzas';
const ACCION_TIPO = 'tardanza_personal';

async function obtenerIdsAdministradores(colegioId) {
  const rows = await query(
    `SELECT id FROM usuarios
     WHERE colegio_id = ? AND tipo = 'ADMINISTRADOR'
       AND (estado = 'ACTIVO' OR estado IS NULL)`,
    [colegioId]
  );
  return (rows || []).map((r) => parseInt(r.id, 10)).filter(Boolean);
}

function fmtFechaPe(fechaIso) {
  const s = String(fechaIso || '').slice(0, 10);
  const [y, m, d] = s.split('-');
  if (!d) return s || '—';
  return `${d}/${m}/${y}`;
}

/**
 * @param {object} opts
 * @param {number} opts.colegioId
 * @param {object} opts.personal - { personal_id, nombres, apellidos, hora_entrada, usuario_id }
 * @param {string} opts.fecha - YYYY-MM-DD
 * @param {string} opts.horaMarcacion - HH:MM:SS o HH:MM
 * @param {string} [opts.origen] - biometrico | manual
 * @param {'insertado'|'actualizado_entrada'|string} [opts.accionUpsert]
 */
async function notificarAdminsTardanzaPersonal(opts = {}) {
  const colegioId = opts.colegioId;
  const personal = opts.personal;
  const fecha = String(opts.fecha || '').slice(0, 10);
  const horaMarcacion = opts.horaMarcacion;
  const accion = opts.accionUpsert || 'insertado';

  if (!colegioId || !personal || !fecha || !horaMarcacion) return { ok: false, reason: 'params' };

  // Solo primera entrada del día (o alta manual). Evita spam al actualizar salida.
  const accionesEntrada = new Set(['insertado', 'actualizado_entrada', 'manual']);
  if (!accionesEntrada.has(accion)) {
    return { ok: false, reason: 'no_entrada' };
  }

  const horaConfig = personal.hora_entrada;
  if (!horaConfig) {
    return { ok: false, reason: 'sin_hora_config' };
  }

  const { minutos_tardanza, descuento } = calcTardanza(horaConfig, horaMarcacion);
  if (!minutos_tardanza || minutos_tardanza <= 0) {
    return { ok: false, reason: 'a_tiempo' };
  }

  let adminIds;
  try {
    adminIds = await obtenerIdsAdministradores(colegioId);
  } catch (e) {
    console.warn('[tardanza-notif] admins:', e.message);
    return { ok: false, reason: 'admins_error' };
  }
  if (!adminIds.length) return { ok: false, reason: 'sin_admins' };

  const nombre = nombrePersonal(personal);
  const horaFmt = formatHoraDisplay(horaMarcacion);
  const horaRealFmt = formatHoraDisplay(horaConfig);
  const fechaFmt = fmtFechaPe(fecha);
  const asunto = `⚠️ TARDANZA: ${nombre}`;
  const contenido =
    `${nombre} llegó tarde.\n` +
    `Fecha: ${fechaFmt}\n` +
    `Hora de marcación: ${horaFmt}\n` +
    `Hora de entrada (esperada): ${horaRealFmt}\n` +
    `Tardanza: ${minutos_tardanza} min (descuento aprox. S/ ${Number(descuento).toFixed(2)}).`;

  const personalId = personal.personal_id ?? personal.id;
  const emisorId =
    personal.usuario_id && Number.isFinite(Number(personal.usuario_id))
      ? Number(personal.usuario_id)
      : adminIds[0];

  // Evitar duplicar el mismo aviso (misma persona + fecha) en ventana corta
  try {
    const dup = await query(
      `SELECT id FROM notificaciones
       WHERE accion_tipo = ?
         AND destinatario_id = ?
         AND accion_payload LIKE ?
         AND accion_payload LIKE ?
         AND fecha_hora >= DATE_SUB(NOW(), INTERVAL 6 HOUR)
       LIMIT 1`,
      [
        ACCION_TIPO,
        adminIds[0],
        `%"personal_id":${Number(personalId)}%`,
        `%"fecha":"${fecha}"%`,
      ]
    );
    if (dup?.length) {
      return { ok: false, reason: 'duplicado' };
    }
  } catch {
    /* si falla el check, igual intentamos enviar */
  }

  for (const did of adminIds) {
    try {
      await insertNotificacionUsuario(execute, {
        usuario_id: emisorId,
        destinatario_id: did,
        asunto,
        contenido,
        estado: 'ENVIADO',
        accion_tipo: ACCION_TIPO,
        accion_payload: {
          personal_id: personalId,
          fecha,
          hora_marcacion: horaFmt,
          minutos_tardanza,
          origen: opts.origen || 'biometrico',
        },
        url_destino: URL_DESTINO,
      });
    } catch (e) {
      console.warn(`[tardanza-notif] campanita admin ${did}:`, e.message);
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
      const bodyPush = `${nombre} · ${fechaFmt} ${horaFmt} · ${minutos_tardanza} min tarde`;
      const pushItems = subs.map((sub) => ({
        subscription: {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload: {
          title: 'TARDANZA de personal',
          body: bodyPush.length > 120 ? `${bodyPush.slice(0, 117)}…` : bodyPush,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-192x192.png',
          vibrate: [120, 60, 120],
          tag: `tardanza-${personalId}-${fecha}`,
          data: {
            url: URL_DESTINO,
            tipo: ACCION_TIPO,
            personal_id: personalId,
            fecha,
          },
        },
      }));
      enviarPushNotificacionesIndividuales(pushItems).catch((err) =>
        console.warn('[tardanza-notif] push:', err.message)
      );
    }
  } catch (e) {
    console.warn('[tardanza-notif] push query:', e.message);
  }

  console.log('[tardanza-notif] avisados admins', {
    colegioId,
    personal_id: personalId,
    nombre,
    fecha,
    hora: horaFmt,
    minutos_tardanza,
    admins: adminIds.length,
  });

  return { ok: true, minutos_tardanza, adminIds };
}

module.exports = {
  notificarAdminsTardanzaPersonal,
  obtenerIdsAdministradores,
};
