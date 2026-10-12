/**
 * Avisa por tardanza de personal:
 * - a todos los ADMINISTRADORES del colegio
 * - al mismo personal (si tiene usuario activo en la intranet)
 * Campanita (tabla notificaciones) + push PWA.
 */
const { query, execute } = require('../utils/mysql');
const { insertNotificacionUsuario } = require('../utils/notificacionInsert');
const { enviarPushNotificacionesIndividuales } = require('./pushNotificationService');
const {
  evaluarMarcacion,
  sueldoDe,
  formatHoraDisplay,
  nombrePersonal,
} = require('../utils/adminTardanzasHuellero');
const { cargarPermisos } = require('../utils/permisoEntradaPersonal');

const URL_ADMIN = '/admin/herramientas/tardanzas';
const ACCION_ADMIN = 'tardanza_personal';
const ACCION_PROPIO = 'tardanza_propia';

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

function urlDashboardPorTipo(tipo) {
  const t = String(tipo || '').toUpperCase();
  if (t === 'ADMINISTRADOR' || t === 'PROMOTORIA' || t === 'PSICOLOGA' || t === 'SECRETARIA') {
    return '/admin/dashboard#mis-asistencias';
  }
  if (t === 'ASISTENCIA') return '/asistencia/dashboard#mis-asistencias';
  return '/docente/dashboard#mis-asistencias';
}

async function enviarPushAUsuarios({
  usuarioIds,
  colegioId,
  title,
  body,
  tag,
  url,
  tipo,
  personalId,
  fecha,
}) {
  if (!usuarioIds?.length) return;
  const ph = usuarioIds.map(() => '?').join(',');
  const subs = await query(
    `SELECT usuario_id, endpoint, p256dh, auth FROM push_subscriptions
     WHERE usuario_id IN (${ph}) AND colegio_id = ? AND (activo = 1 OR activo IS NULL)`,
    [...usuarioIds, colegioId]
  );
  if (!subs?.length) return;
  const bodyPush = body.length > 120 ? `${body.slice(0, 117)}…` : body;
  const pushItems = subs.map((sub) => ({
    subscription: {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    },
    payload: {
      title,
      body: bodyPush,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      vibrate: [120, 60, 120],
      tag,
      data: {
        url,
        tipo,
        personal_id: personalId,
        fecha,
      },
    },
  }));
  enviarPushNotificacionesIndividuales(pushItems).catch((err) =>
    console.warn('[tardanza-notif] push:', err.message)
  );
}

/**
 * @param {object} opts
 * @param {number} opts.colegioId
 * @param {object} opts.personal - { personal_id, nombres, apellidos, hora_entrada, usuario_id, tipo? }
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

  const personalIdPrevio = personal.personal_id ?? personal.id;
  let tipoUsuario = personal.usuario_tipo || personal.tipo || personal.tipo_usuario || '';
  if (!tipoUsuario && personalIdPrevio) {
    try {
      const [u] = await query(
        'SELECT tipo FROM usuarios WHERE personal_id = ? AND colegio_id = ? LIMIT 1',
        [personalIdPrevio, colegioId]
      );
      tipoUsuario = u?.tipo || '';
    } catch {
      tipoUsuario = '';
    }
  }
  const permisos = await cargarPermisos(query, colegioId).catch(() => []);
  const ev = evaluarMarcacion({
    horaPropia: horaConfig,
    horaMarca: horaMarcacion,
    sueldo: sueldoDe(personal),
    fecha,
    personalId: personalIdPrevio,
    tipoUsuario,
    permisos,
  });
  const minutos_tardanza = ev.minutos_tardanza;
  const descuento = ev.descuento;
  if (!minutos_tardanza || minutos_tardanza <= 0) {
    return { ok: false, reason: 'a_tiempo' };
  }

  let adminIds = [];
  try {
    adminIds = await obtenerIdsAdministradores(colegioId);
  } catch (e) {
    console.warn('[tardanza-notif] admins:', e.message);
  }

  const personalUsuarioId = Number.isFinite(Number(personal.usuario_id))
    ? Number(personal.usuario_id)
    : null;

  if (!adminIds.length && !personalUsuarioId) {
    return { ok: false, reason: 'sin_destinatarios' };
  }

  const nombre = nombrePersonal(personal);
  const horaFmt = formatHoraDisplay(horaMarcacion);
  const horaRealFmt = ev.hora_usada_fmt || formatHoraDisplay(horaConfig);
  const fechaFmt = fmtFechaPe(fecha);
  const personalId = personal.personal_id ?? personal.id;
  const origen = opts.origen || 'biometrico';

  // Emisor: el personal si tiene usuario; si no, primer admin
  const emisorId = personalUsuarioId || adminIds[0];

  // Evitar duplicar el mismo aviso (misma persona + fecha) en ventana corta
  try {
    const checkDest = adminIds[0] || personalUsuarioId;
    const dup = await query(
      `SELECT id FROM notificaciones
       WHERE accion_tipo IN (?, ?)
         AND destinatario_id = ?
         AND accion_payload LIKE ?
         AND accion_payload LIKE ?
         AND fecha_hora >= DATE_SUB(NOW(), INTERVAL 6 HOUR)
       LIMIT 1`,
      [
        ACCION_ADMIN,
        ACCION_PROPIO,
        checkDest,
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

  // Admins (si el que llegó tarde es admin, no le mandamos el aviso de “otro personal”,
  // solo el aviso propio más abajo)
  const adminIdsAvisar = personalUsuarioId
    ? adminIds.filter((id) => id !== personalUsuarioId)
    : adminIds;

  const asuntoAdmin = `⚠️ TARDANZA: ${nombre}`;
  const contenidoAdmin =
    `${nombre} llegó tarde.\n` +
    `Fecha: ${fechaFmt}\n` +
    `Hora de marcación: ${horaFmt}\n` +
    `Hora de entrada (esperada): ${horaRealFmt}\n` +
    `Tardanza: ${minutos_tardanza} min (descuento aprox. S/ ${Number(descuento).toFixed(2)}).\n` +
    `${ev.motivo || ''}`;

  for (const did of adminIdsAvisar) {
    try {
      await insertNotificacionUsuario(execute, {
        usuario_id: emisorId,
        destinatario_id: did,
        asunto: asuntoAdmin,
        contenido: contenidoAdmin,
        estado: 'ENVIADO',
        accion_tipo: ACCION_ADMIN,
        accion_payload: {
          personal_id: personalId,
          fecha,
          hora_marcacion: horaFmt,
          minutos_tardanza,
          origen,
          destinatario: 'admin',
        },
        url_destino: URL_ADMIN,
      });
    } catch (e) {
      console.warn(`[tardanza-notif] campanita admin ${did}:`, e.message);
    }
  }

  if (adminIdsAvisar.length) {
    try {
      await enviarPushAUsuarios({
        usuarioIds: adminIdsAvisar,
        colegioId,
        title: 'TARDANZA de personal',
        body: `${nombre} · ${fechaFmt} ${horaFmt} · ${minutos_tardanza} min tarde`,
        tag: `tardanza-admin-${personalId}-${fecha}`,
        url: URL_ADMIN,
        tipo: ACCION_ADMIN,
        personalId,
        fecha,
      });
    } catch (e) {
      console.warn('[tardanza-notif] push admins:', e.message);
    }
  }

  // Aviso al mismo personal
  let notificadoPropio = false;
  if (personalUsuarioId) {
    let tipoUsuario = personal.tipo_usuario || personal.tipo || null;
    if (!tipoUsuario) {
      try {
        const [u] = await query(`SELECT tipo FROM usuarios WHERE id = ? LIMIT 1`, [personalUsuarioId]);
        tipoUsuario = u?.tipo || 'DOCENTE';
      } catch {
        tipoUsuario = 'DOCENTE';
      }
    }
    const urlPropio = urlDashboardPorTipo(tipoUsuario);
    const asuntoPropio = `⚠️ Registramos tu tardanza`;
    const contenidoPropio =
      `Se registró una tardanza a tu nombre.\n` +
      `Fecha: ${fechaFmt}\n` +
      `Hora de marcación: ${horaFmt}\n` +
      `Hora de entrada (esperada): ${horaRealFmt}\n` +
      `Tardanza: ${minutos_tardanza} min (descuento aprox. S/ ${Number(descuento).toFixed(2)}).\n` +
      `Puedes revisar el detalle en Mis Asistencias.`;

    try {
      await insertNotificacionUsuario(execute, {
        usuario_id: emisorId,
        destinatario_id: personalUsuarioId,
        asunto: asuntoPropio,
        contenido: contenidoPropio,
        estado: 'ENVIADO',
        accion_tipo: ACCION_PROPIO,
        accion_payload: {
          personal_id: personalId,
          fecha,
          hora_marcacion: horaFmt,
          minutos_tardanza,
          origen,
          destinatario: 'propio',
        },
        url_destino: urlPropio,
      });
      notificadoPropio = true;
    } catch (e) {
      console.warn(`[tardanza-notif] campanita propio ${personalUsuarioId}:`, e.message);
    }

    try {
      await enviarPushAUsuarios({
        usuarioIds: [personalUsuarioId],
        colegioId,
        title: 'Tu tardanza registrada',
        body: `${fechaFmt} ${horaFmt} · ${minutos_tardanza} min tarde`,
        tag: `tardanza-propia-${personalId}-${fecha}`,
        url: urlPropio,
        tipo: ACCION_PROPIO,
        personalId,
        fecha,
      });
    } catch (e) {
      console.warn('[tardanza-notif] push propio:', e.message);
    }
  }

  console.log('[tardanza-notif] avisados', {
    colegioId,
    personal_id: personalId,
    nombre,
    fecha,
    hora: horaFmt,
    minutos_tardanza,
    admins: adminIdsAvisar.length,
    propio: notificadoPropio,
  });

  return {
    ok: true,
    minutos_tardanza,
    adminIds: adminIdsAvisar,
    personalUsuarioId: notificadoPropio ? personalUsuarioId : null,
  };
}

module.exports = {
  notificarAdminsTardanzaPersonal,
  obtenerIdsAdministradores,
};
