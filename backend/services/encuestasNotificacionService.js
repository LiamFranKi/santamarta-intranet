/**
 * Encuestas: notificaciones campanita + push al activar; aviso a admins al activar y al responder.
 */
const { query, execute, getAnioActivo } = require('../utils/mysql');
const { insertNotificacionUsuario } = require('../utils/notificacionInsert');
const { enviarPushNotificacionesIndividuales } = require('./pushNotificationService');

/**
 * Destinatarios por audiencia. Si grupo_ids tiene valores, filtra por grupos del año activo
 * (alumno / apoderado-hijos / docente-asignatura|tutor). Admin y promotoría por audiencia no se filtran por grupo.
 */
async function obtenerDestinatariosEncuesta(colegio_id, audiencias, grupo_ids = [], anio = null) {
  if (!audiencias || audiencias.length === 0) return [];
  const audList = Array.isArray(audiencias)
    ? audiencias.map((a) => (typeof a === 'object' ? a.tipo : a))
    : [];
  const types = audList.map((t) => String(t || '').toUpperCase());
  const typeSet = new Set(types);
  const gids = (grupo_ids || []).map((g) => parseInt(g, 10)).filter(Boolean);

  if (gids.length === 0) {
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
    if (parts.length === 0) return [];
    return query(
      `SELECT id, email, tipo, personal_id FROM usuarios WHERE colegio_id = ? AND (estado = 'ACTIVO' OR estado IS NULL) AND (${parts.join(' OR ')})`,
      [colegio_id]
    );
  }

  const anioAct = anio || (await getAnioActivo(colegio_id));
  const ph = gids.map(() => '?').join(',');
  const ids = new Set();
  const includeTipo = (t) => typeSet.has('TODOS') || typeSet.has(t);

  if (includeTipo('ALUMNO')) {
    const r = await query(
      `SELECT DISTINCT u.id FROM usuarios u
       INNER JOIN matriculas m ON m.alumno_id = u.alumno_id AND m.colegio_id = ?
       INNER JOIN grupos g ON g.id = m.grupo_id AND g.anio = ?
       WHERE u.colegio_id = ? AND u.tipo = 'ALUMNO' AND (m.estado = 0)
         AND m.grupo_id IN (${ph})`,
      [colegio_id, anioAct, colegio_id, ...gids]
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
             SELECT 1 FROM grupos g
             WHERE g.colegio_id = ? AND g.anio = ? AND g.id IN (${ph})
               AND (g.tutor_id = p.id OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = p.id))
           )
         )`,
      [colegio_id, colegio_id, anioAct, ...gids, colegio_id, anioAct, ...gids]
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
       WHERE u.colegio_id = ? AND u.tipo = 'APODERADO' AND (m.estado = 0)
         AND m.grupo_id IN (${ph})`,
      [colegio_id, anioAct, colegio_id, ...gids]
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

  const allIds = [...ids];
  if (allIds.length === 0) return [];
  const phId = allIds.map(() => '?').join(',');
  return query(
    `SELECT id, email, tipo, personal_id FROM usuarios WHERE colegio_id = ? AND id IN (${phId})`,
    [colegio_id, ...allIds]
  );
}

/** IDs de usuarios con rol de gestión (reciben avisos administrativos de encuestas). */
async function obtenerIdsAdminsColegio(colegio_id) {
  const rows = await query(
    `SELECT id FROM usuarios
     WHERE colegio_id = ? AND tipo IN ('ADMINISTRADOR','PROMOTORIA')
       AND (estado = 'ACTIVO' OR estado IS NULL)`,
    [colegio_id]
  );
  return (rows || []).map((r) => parseInt(r.id, 10)).filter(Boolean);
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

/**
 * Aviso a directivos: encuesta activada (siempre, aunque no entren en la audiencia de destinatarios).
 */
async function notificarAdminsEncuestaActivada({ colegio_id, encuesta_id, titulo, usuario_id_emisor }) {
  const ids = await obtenerIdsAdminsColegio(colegio_id);
  if (!ids.length) return;

  const tituloSafe = String(titulo || 'Encuesta').trim() || 'Encuesta';
  const urlDestino = `/admin/herramientas/encuestas/${encuesta_id}/estadisticas`;
  const asunto = 'Encuesta activada (gestión)';
  const contenido = `La encuesta «${tituloSafe}» quedó activa. Puedes revisar estadísticas cuando haya respuestas.`;

  for (const did of ids) {
    try {
      await insertNotificacionUsuario(execute, {
        usuario_id: usuario_id_emisor,
        destinatario_id: did,
        asunto,
        contenido,
        estado: 'ENVIADO',
        accion_tipo: 'encuesta_activa_admin',
        accion_payload: { encuesta_id },
        url_destino: urlDestino
      });
    } catch (e) {
      console.warn('[encuestasNotif] admin activación', did, e.message);
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
      title: 'Encuesta activada',
      body: `«${tituloSafe}» — revisa estadísticas`.substring(0, 110),
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      vibrate: [150, 80, 150],
      tag: `encuesta-admin-${encuesta_id}`,
      data: { url: urlDestino, tipo: 'encuesta_activa_admin', encuesta_id }
    }
  }));

  enviarPushNotificacionesIndividuales(pushItems).catch((err) =>
    console.error('[encuestasNotif] push admin activación', err.message)
  );
}

/**
 * Aviso a directivos: alguien completó la encuesta (excluye al propio respondiente si es admin).
 */
async function notificarAdminsEncuestaRespondida({
  colegio_id,
  encuesta_id,
  titulo,
  usuario_respondedor_id,
  nombre_respondedor
}) {
  const ids = await obtenerIdsAdminsColegio(colegio_id);
  const destinatarios = ids.filter((id) => id !== usuario_respondedor_id);
  if (!destinatarios.length) return;

  const tituloSafe = String(titulo || 'Encuesta').trim() || 'Encuesta';
  const nombre = nombre_respondedor || 'Un usuario';
  const urlDestino = `/admin/herramientas/encuestas/${encuesta_id}/estadisticas`;
  const asunto = 'Nueva respuesta en encuesta';
  const contenido = `${nombre} completó la encuesta «${tituloSafe}».`;

  for (const did of destinatarios) {
    try {
      await insertNotificacionUsuario(execute, {
        usuario_id: usuario_respondedor_id,
        destinatario_id: did,
        asunto,
        contenido,
        estado: 'ENVIADO',
        accion_tipo: 'encuesta_respuesta_admin',
        accion_payload: { encuesta_id, respondedor_id: usuario_respondedor_id },
        url_destino: urlDestino
      });
    } catch (e) {
      console.warn('[encuestasNotif] admin respuesta', did, e.message);
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
      title: 'Respuesta en encuesta',
      body: `${nombre} · ${tituloSafe}`.substring(0, 110),
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      vibrate: [150, 80, 150],
      tag: `encuesta-resp-${encuesta_id}-${usuario_respondedor_id}`,
      data: { url: urlDestino, tipo: 'encuesta_respuesta_admin', encuesta_id }
    }
  }));

  enviarPushNotificacionesIndividuales(pushItems).catch((err) =>
    console.error('[encuestasNotif] push respuesta admin', err.message)
  );
}

/**
 * @param {object} params
 * @param {number} params.colegio_id
 * @param {number} params.encuesta_id
 * @param {string} params.titulo
 * @param {number} params.usuario_id_emisor
 * @param {Array<{tipo:string}|string>} params.audiencias
 * @param {number[]} [params.grupo_ids]
 * @param {number} [params.anio]
 */
async function notificarEncuestaActivada({
  colegio_id,
  encuesta_id,
  titulo,
  usuario_id_emisor,
  audiencias,
  grupo_ids = [],
  anio = null
}) {
  const dest = await obtenerDestinatariosEncuesta(colegio_id, audiencias, grupo_ids, anio);
  const tituloSafe = String(titulo || 'Encuesta').trim() || 'Encuesta';
  const urlDestino = '/encuestas/responder/' + encuesta_id;
  const asunto = 'Nueva encuesta disponible';
  const contenido = `«${tituloSafe}». Tienes una encuesta pendiente; participa cuando puedas.`;

  const destinatariosIds = new Set();
  for (const d of dest || []) {
    const did = parseInt(d.id, 10);
    if (!did) continue;
    destinatariosIds.add(did);
  }

  for (const did of destinatariosIds) {
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

  const idsPush = [...destinatariosIds];
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

module.exports = {
  notificarEncuestaActivada,
  notificarAdminsEncuestaActivada,
  notificarAdminsEncuestaRespondida,
  obtenerDestinatariosEncuesta,
  obtenerNombreMostrarUsuario
};
