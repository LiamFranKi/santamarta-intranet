/**
 * Exámenes de herramientas: campanita + push al activar; aviso a admins; nota al usuario y aviso admin al enviar.
 */
const { query, execute } = require('../utils/mysql');

/** Enteros en textos de notificación / push (evita 20.00 en campanita y Chrome). */
function fmtPtsNotif(n) {
  if (n == null || n === '') return '';
  const x = Number(n);
  if (Number.isNaN(x)) return String(n);
  return String(Math.round(x));
}
const { insertNotificacionUsuario } = require('../utils/notificacionInsert');
const { enviarPushNotificacionesIndividuales } = require('./pushNotificationService');
const { obtenerDestinatariosEncuesta } = require('./encuestasNotificacionService');

/** Deep link según rol: docente/admin no deben recibir solo /herramientas-examenes/... (fuera de su menú). */
function urlHerramientasExamenPorTipo(examen_id, tipoUsuario, pagina) {
  const id = parseInt(examen_id, 10);
  if (!Number.isFinite(id)) return '/herramientas-examenes';
  const t = String(tipoUsuario || '').toUpperCase();
  const tail = pagina === 'resultado' ? `resultado/${id}` : `realizar/${id}`;
  if (t === 'DOCENTE') return `/docente/herramientas/examenes/${tail}`;
  if (t === 'ADMINISTRADOR' || t === 'PROMOTORIA') return `/admin/herramientas/examenes/${tail}`;
  return `/herramientas-examenes/${tail}`;
}

async function obtenerTipoUsuario(usuario_id) {
  const rows = await query(`SELECT tipo FROM usuarios WHERE id = ? LIMIT 1`, [usuario_id]);
  return rows?.[0]?.tipo || null;
}

async function obtenerIdsAdminsColegio(colegio_id) {
  const rows = await query(
    `SELECT id FROM usuarios
     WHERE colegio_id = ? AND tipo IN ('ADMINISTRADOR','PROMOTORIA')
       AND (estado = 'ACTIVO' OR estado IS NULL)`,
    [colegio_id]
  );
  return (rows || []).map((r) => parseInt(r.id, 10)).filter(Boolean);
}

/**
 * Usuarios a notificar al activar el examen: audiencia + alcance por grupos (vacío = toda la institución).
 */
async function obtenerDestinatariosHerramientasExamen(colegio_id, anio, audiencias, grupo_ids) {
  const gids = (grupo_ids || []).map((g) => parseInt(g, 10)).filter(Boolean);
  const audList = Array.isArray(audiencias) ? audiencias.map((a) => (typeof a === 'object' ? a.tipo : a)) : [];
  const types = new Set(audList.map((t) => String(t || '').toUpperCase()));

  if (gids.length === 0) {
    const rows = await obtenerDestinatariosEncuesta(colegio_id, audiencias);
    return rows || [];
  }

  const ph = gids.map(() => '?').join(',');
  const ids = new Set();

  const includeTipo = (t) => types.has('TODOS') || types.has(t);

  if (includeTipo('ALUMNO')) {
    const r = await query(
      `SELECT DISTINCT u.id FROM usuarios u
       INNER JOIN matriculas m ON m.alumno_id = u.alumno_id AND m.colegio_id = ?
       INNER JOIN grupos g ON g.id = m.grupo_id AND g.anio = ?
       WHERE u.colegio_id = ? AND u.tipo = 'ALUMNO' AND (m.estado = 0 OR m.estado = 4)
         AND m.grupo_id IN (${ph})`,
      [colegio_id, anio, colegio_id, ...gids]
    );
    (r || []).forEach((x) => ids.add(x.id));
  }

  if (includeTipo('DOCENTE')) {
    const r = await query(
      `SELECT DISTINCT u.id FROM usuarios u
       INNER JOIN personal p ON p.id = u.personal_id
       WHERE u.colegio_id = ? AND u.tipo = 'DOCENTE'
         AND (
           EXISTS (
             SELECT 1 FROM asignaturas a
             INNER JOIN grupos g ON g.id = a.grupo_id
             WHERE a.personal_id = p.id AND g.colegio_id = ? AND g.anio = ? AND g.id IN (${ph})
           )
           OR EXISTS (
             SELECT 1 FROM grupos g WHERE g.tutor_id = p.id AND g.colegio_id = ? AND g.anio = ? AND g.id IN (${ph})
           )
         )`,
      [colegio_id, colegio_id, anio, ...gids, colegio_id, anio, ...gids]
    );
    (r || []).forEach((x) => ids.add(x.id));
  }

  if (includeTipo('APODERADO')) {
    const r = await query(
      `SELECT DISTINCT u.id FROM usuarios u
       INNER JOIN apoderados ap ON ap.id = u.apoderado_id
       INNER JOIN familias f ON f.apoderado_id = ap.id
       INNER JOIN alumnos al ON al.id = f.alumno_id
       INNER JOIN matriculas m ON m.alumno_id = al.id AND m.colegio_id = ?
       INNER JOIN grupos g ON g.id = m.grupo_id AND g.anio = ?
       WHERE u.colegio_id = ? AND u.tipo = 'APODERADO' AND (m.estado = 0 OR m.estado = 4)
         AND m.grupo_id IN (${ph})`,
      [colegio_id, anio, colegio_id, ...gids]
    );
    (r || []).forEach((x) => ids.add(x.id));
  }

  if (includeTipo('ADMINISTRADOR')) {
    const r = await query(
      `SELECT id FROM usuarios WHERE colegio_id = ? AND tipo = 'ADMINISTRADOR' AND (estado = 'ACTIVO' OR estado IS NULL)`,
      [colegio_id]
    );
    (r || []).forEach((x) => ids.add(x.id));
  }

  if (includeTipo('PROMOTORIA')) {
    const r = await query(
      `SELECT id FROM usuarios WHERE colegio_id = ? AND tipo = 'PROMOTORIA' AND (estado = 'ACTIVO' OR estado IS NULL)`,
      [colegio_id]
    );
    (r || []).forEach((x) => ids.add(x.id));
  }

  if (types.size === 0) return [];

  const allIds = [...ids];
  if (allIds.length === 0) return [];

  const phId = allIds.map(() => '?').join(',');
  return query(
    `SELECT id, email, tipo, personal_id FROM usuarios WHERE colegio_id = ? AND id IN (${phId})`,
    [colegio_id, ...allIds]
  );
}

async function notificarExamenHerramientasActivado({
  colegio_id,
  examen_id,
  titulo,
  usuario_id_emisor,
  audiencias,
  grupo_ids,
  anio
}) {
  const dest = await obtenerDestinatariosHerramientasExamen(colegio_id, anio, audiencias, grupo_ids);
  const tituloSafe = String(titulo || 'Examen').trim() || 'Examen';
  const asunto = 'Nuevo examen disponible';
  const contenido = `«${tituloSafe}». Tienes un examen pendiente; complétalo cuando puedas.`;

  const destinatariosIds = new Set();
  for (const d of dest || []) {
    const did = parseInt(d.id, 10);
    if (did) destinatariosIds.add(did);
  }

  for (const d of dest || []) {
    const did = parseInt(d.id, 10);
    if (!did) continue;
    const urlDestino = urlHerramientasExamenPorTipo(examen_id, d.tipo, 'realizar');
    try {
      await insertNotificacionUsuario(execute, {
        usuario_id: usuario_id_emisor,
        destinatario_id: did,
        asunto,
        contenido,
        estado: 'ENVIADO',
        accion_tipo: 'herramientas_examen_activo',
        accion_payload: { examen_id },
        url_destino: urlDestino
      });
    } catch (e) {
      console.warn('[hexNotif] campanita', did, e.message);
    }
  }

  const idsPush = [...destinatariosIds];
  if (idsPush.length === 0) return;

  const ph = idsPush.map(() => '?').join(',');
  const subsData = await query(
    `SELECT usuario_id, endpoint, p256dh, auth FROM push_subscriptions
     WHERE usuario_id IN (${ph}) AND colegio_id = ? AND (activo = 1 OR activo IS NULL)`,
    [...idsPush, colegio_id]
  );
  if (!subsData || subsData.length === 0) return;

  const tipoPorUsuario = new Map();
  for (const d of dest || []) {
    const did = parseInt(d.id, 10);
    if (did) tipoPorUsuario.set(did, d.tipo);
  }

  const pushItems = subsData.map((sub) => {
    const uid = parseInt(sub.usuario_id, 10);
    const pushUrl = urlHerramientasExamenPorTipo(examen_id, tipoPorUsuario.get(uid), 'realizar');
    return {
      subscription: {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      },
      payload: {
        title: 'Nuevo examen',
        body: tituloSafe.substring(0, 110),
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-192x192.png',
        vibrate: [200, 100, 200],
        tag: `hex-examen-${examen_id}`,
        data: { url: pushUrl, tipo: 'herramientas_examen_activo', examen_id }
      }
    };
  });

  enviarPushNotificacionesIndividuales(pushItems).catch((err) => console.error('[hexNotif] push', err.message));
}

async function notificarAdminsExamenActivado({ colegio_id, examen_id, titulo, usuario_id_emisor }) {
  const ids = await obtenerIdsAdminsColegio(colegio_id);
  if (!ids.length) return;

  const tituloSafe = String(titulo || 'Examen').trim() || 'Examen';
  const urlDestino = `/admin/herramientas/examenes/${examen_id}/estadisticas`;
  const asunto = 'Examen de herramientas activado';
  const contenido = `El examen «${tituloSafe}» quedó activo. Puedes revisar estadísticas cuando haya intentos.`;

  for (const did of ids) {
    try {
      await insertNotificacionUsuario(execute, {
        usuario_id: usuario_id_emisor,
        destinatario_id: did,
        asunto,
        contenido,
        estado: 'ENVIADO',
        accion_tipo: 'herramientas_examen_activo_admin',
        accion_payload: { examen_id },
        url_destino: urlDestino
      });
    } catch (e) {
      console.warn('[hexNotif] admin activación', did, e.message);
    }
  }

  const ph = ids.map(() => '?').join(',');
  const subsData = await query(
    `SELECT usuario_id, endpoint, p256dh, auth FROM push_subscriptions
     WHERE usuario_id IN (${ph}) AND colegio_id = ? AND (activo = 1 OR activo IS NULL)`,
    [...ids, colegio_id]
  );
  if (!subsData || !subsData.length) return;

  const pushItems = subsData.map((sub) => ({
    subscription: {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth }
    },
    payload: {
      title: 'Examen activado',
      body: `«${tituloSafe}» — estadísticas`.substring(0, 110),
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      vibrate: [150, 80, 150],
      tag: `hex-examen-admin-${examen_id}`,
      data: { url: urlDestino, tipo: 'herramientas_examen_activo_admin', examen_id }
    }
  }));

  enviarPushNotificacionesIndividuales(pushItems).catch((err) =>
    console.error('[hexNotif] push admin activación', err.message)
  );
}

async function obtenerNombreMostrarUsuario(usuario_id) {
  const rows = await query(
    `SELECT COALESCE(
        NULLIF(TRIM(CONCAT(COALESCE(a.nombres,''), ' ', COALESCE(a.apellido_paterno,''), ' ', COALESCE(a.apellido_materno,''))), ''),
        NULLIF(TRIM(CONCAT(COALESCE(p.nombres,''), ' ', COALESCE(p.apellidos,''))), ''),
        NULLIF(TRIM(CONCAT(COALESCE(ap.nombres,''), ' ', COALESCE(ap.apellido_paterno,''), ' ', COALESCE(ap.apellido_materno,''))), ''),
        u.usuario
      ) AS nombre
     FROM usuarios u
     LEFT JOIN alumnos a ON a.id = u.alumno_id
     LEFT JOIN personal p ON p.id = u.personal_id
     LEFT JOIN apoderados ap ON ap.id = u.apoderado_id
     WHERE u.id = ?
     LIMIT 1`,
    [usuario_id]
  );
  if (!rows || !rows.length) return 'Usuario';
  const n = rows[0].nombre;
  return n && String(n).trim() ? String(n).trim() : 'Usuario';
}

/** Notificación al usuario que envió el examen (nota si aplica). */
async function notificarUsuarioExamenEnviado({
  colegio_id,
  usuario_id_dest,
  examen_id,
  titulo,
  puntaje_obtenido,
  puntaje_max,
  mostrar_nota,
  estado_intento
}) {
  const tituloSafe = String(titulo || 'Examen').trim() || 'Examen';
  const tipoDest = await obtenerTipoUsuario(usuario_id_dest);
  const urlDestino = urlHerramientasExamenPorTipo(examen_id, tipoDest, 'resultado');
  let contenido = `Enviaste el examen «${tituloSafe}».`;
  if (mostrar_nota === 'AL_ENVIAR' && estado_intento === 'CALIFICADO' && puntaje_max != null && puntaje_obtenido != null) {
    contenido = `Resultado «${tituloSafe}»: ${fmtPtsNotif(puntaje_obtenido)} / ${fmtPtsNotif(puntaje_max)}.`;
  } else if (mostrar_nota === 'AL_ENVIAR' && estado_intento === 'ENVIADO') {
    contenido = `Enviaste «${tituloSafe}». Queda pendiente de revisión para la nota final.`;
  }

  try {
    await insertNotificacionUsuario(execute, {
      usuario_id: usuario_id_dest,
      destinatario_id: usuario_id_dest,
      asunto: 'Examen enviado',
      contenido,
      estado: 'ENVIADO',
      accion_tipo: 'herramientas_examen_resultado',
      accion_payload: { examen_id, puntaje_obtenido, puntaje_max },
      url_destino: urlDestino
    });
  } catch (e) {
    console.warn('[hexNotif] usuario resultado', e.message);
  }
}

/** Aviso a administradores: usuario completó examen con nota. */
async function notificarAdminsExamenCompletado({
  colegio_id,
  examen_id,
  titulo,
  usuario_respondedor_id,
  nombre_respondedor,
  puntaje_obtenido,
  puntaje_max,
  estado_intento
}) {
  const ids = await obtenerIdsAdminsColegio(colegio_id);
  const destinatarios = ids.filter((id) => id !== usuario_respondedor_id);
  if (!destinatarios.length) return;

  const tituloSafe = String(titulo || 'Examen').trim() || 'Examen';
  const nombre = nombre_respondedor || 'Un usuario';
  const urlDestino = `/admin/herramientas/examenes/${examen_id}/estadisticas`;
  let contenido = `${nombre} completó el examen «${tituloSafe}».`;
  if (estado_intento === 'CALIFICADO' && puntaje_obtenido != null && puntaje_max != null) {
    contenido = `${nombre} completó «${tituloSafe}» con nota ${fmtPtsNotif(puntaje_obtenido)} / ${fmtPtsNotif(puntaje_max)}.`;
  } else if (estado_intento === 'ENVIADO') {
    contenido = `${nombre} envió «${tituloSafe}» (pendiente de revisión manual).`;
  }

  const asunto = 'Intento de examen (herramientas)';

  for (const did of destinatarios) {
    try {
      await insertNotificacionUsuario(execute, {
        usuario_id: usuario_respondedor_id,
        destinatario_id: did,
        asunto,
        contenido,
        estado: 'ENVIADO',
        accion_tipo: 'herramientas_examen_completado_admin',
        accion_payload: { examen_id, usuario_id: usuario_respondedor_id },
        url_destino: urlDestino
      });
    } catch (e) {
      console.warn('[hexNotif] admin completado', did, e.message);
    }
  }

  const ph = destinatarios.map(() => '?').join(',');
  const subsData = await query(
    `SELECT usuario_id, endpoint, p256dh, auth FROM push_subscriptions
     WHERE usuario_id IN (${ph}) AND colegio_id = ? AND (activo = 1 OR activo IS NULL)`,
    [...destinatarios, colegio_id]
  );
  if (!subsData || !subsData.length) return;

  const pushItems = subsData.map((sub) => ({
    subscription: {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth }
    },
    payload: {
      title: 'Examen completado',
      body: `${nombre} · ${tituloSafe}`.substring(0, 110),
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      vibrate: [150, 80, 150],
      tag: `hex-envio-${examen_id}-${usuario_respondedor_id}`,
      data: { url: urlDestino, tipo: 'herramientas_examen_completado_admin', examen_id }
    }
  }));

  enviarPushNotificacionesIndividuales(pushItems).catch((err) =>
    console.error('[hexNotif] push admin completado', err.message)
  );
}

/** Cuando el revisor termina las respuestas manuales y el intento pasa a CALIFICADO. */
async function notificarUsuarioExamenRevisadoCalificado({
  colegio_id,
  usuario_id_dest,
  examen_id,
  titulo,
  puntaje_obtenido,
  puntaje_max,
  mostrar_nota
}) {
  const tituloSafe = String(titulo || 'Examen').trim() || 'Examen';
  const tipoDest = await obtenerTipoUsuario(usuario_id_dest);
  const urlDestino = urlHerramientasExamenPorTipo(examen_id, tipoDest, 'resultado');
  let contenido = `Tu examen «${tituloSafe}» ya fue evaluado.`;
  if (mostrar_nota !== 'NO' && puntaje_obtenido != null && puntaje_max != null) {
    contenido = `Tu nota en «${tituloSafe}»: ${fmtPtsNotif(puntaje_obtenido)} / ${fmtPtsNotif(puntaje_max)}.`;
  }

  try {
    await insertNotificacionUsuario(execute, {
      usuario_id: usuario_id_dest,
      destinatario_id: usuario_id_dest,
      asunto: 'Examen evaluado',
      contenido,
      estado: 'ENVIADO',
      accion_tipo: 'herramientas_examen_revisado',
      accion_payload: { examen_id, puntaje_obtenido, puntaje_max },
      url_destino: urlDestino
    });
  } catch (e) {
    console.warn('[hexNotif] usuario revisado', e.message);
  }

  const subsData = await query(
    `SELECT usuario_id, endpoint, p256dh, auth FROM push_subscriptions
     WHERE usuario_id = ? AND colegio_id = ? AND (activo = 1 OR activo IS NULL)`,
    [usuario_id_dest, colegio_id]
  );
  if (!subsData || !subsData.length) return;

  const body =
    mostrar_nota !== 'NO' && puntaje_obtenido != null && puntaje_max != null
      ? `${tituloSafe}: ${fmtPtsNotif(puntaje_obtenido)} / ${fmtPtsNotif(puntaje_max)}`.substring(0, 110)
      : `«${tituloSafe}» — revisión lista`.substring(0, 110);

  const pushItems = subsData.map((sub) => ({
    subscription: {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth }
    },
    payload: {
      title: 'Examen evaluado',
      body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      vibrate: [150, 80, 150],
      tag: `hex-revisado-${examen_id}-${usuario_id_dest}`,
      data: {
        url: urlHerramientasExamenPorTipo(examen_id, tipoDest, 'resultado'),
        tipo: 'herramientas_examen_revisado',
        examen_id
      }
    }
  }));

  enviarPushNotificacionesIndividuales(pushItems).catch((err) =>
    console.error('[hexNotif] push revisado', err.message)
  );
}

module.exports = {
  obtenerDestinatariosHerramientasExamen,
  notificarExamenHerramientasActivado,
  notificarAdminsExamenActivado,
  notificarUsuarioExamenEnviado,
  notificarAdminsExamenCompletado,
  notificarUsuarioExamenRevisadoCalificado,
  obtenerNombreMostrarUsuario
};
