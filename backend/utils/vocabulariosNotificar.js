/**
 * Push, correo y registro en `notificaciones` al publicar un vocabulario (PDF) para un grupo.
 */
const { enviarPushNotificacionesIndividuales } = require('../services/pushNotificationService');
const { enviarCorreoNotificacion } = require('../services/emailService');
const { insertNotificacionUsuario } = require('./notificacionInsert');
const { urlVocabularioPorTipoUsuario } = require('./notificacionUrls');

/**
 * Alumnos, apoderados, docentes del grupo, tutor, administradores y promotoría.
 */
async function recolectarDestinatariosGrupo(query, colegio_id, grupo_id) {
  const gruposArray = [grupo_id];
  const destinatarios = [];

  const alumnosGrupos = await query(
    `SELECT DISTINCT u.id, u.tipo, a.id AS alumno_id
     FROM alumnos a
     INNER JOIN matriculas m ON m.alumno_id = a.id
     INNER JOIN usuarios u ON u.alumno_id = a.id
     WHERE m.grupo_id IN (${gruposArray.map(() => '?').join(',')})
       AND m.colegio_id = ?
       AND (m.estado = 0 OR m.estado = 4)
       AND u.colegio_id = ?
       AND u.estado = 'ACTIVO'`,
    [...gruposArray, colegio_id, colegio_id]
  );

  const alumnoIds = (alumnosGrupos || []).map((a) => a.alumno_id);
  let apoderadosIds = [];

  if (alumnoIds.length > 0) {
    const apoderadosData = await query(
      `SELECT DISTINCT u.id, u.tipo, ap.nro_documento
       FROM apoderados ap
       INNER JOIN familias f ON f.apoderado_id = ap.id
       INNER JOIN usuarios u ON u.apoderado_id = ap.id
       WHERE f.alumno_id IN (${alumnoIds.map(() => '?').join(',')})
         AND ap.colegio_id = ?
         AND u.colegio_id = ?
         AND u.estado = 'ACTIVO'`,
      [...alumnoIds, colegio_id, colegio_id]
    );
    apoderadosIds = (apoderadosData || []).map((a) => ({ usuario_id: a.id, tipo: a.tipo }));

    const apoderadoDnis = (apoderadosData || []).map((a) => a.nro_documento).filter(Boolean);
    if (apoderadoDnis.length > 0) {
      const yaIds = new Set([
        ...(alumnosGrupos || []).map((a) => a.id),
        ...apoderadosIds.map((a) => a.usuario_id)
      ]);
      const docentesApoderados = await query(
        `SELECT DISTINCT u.id, u.tipo
         FROM usuarios u
         INNER JOIN personal p ON p.id = u.personal_id
         WHERE u.colegio_id = ?
           AND u.estado = 'ACTIVO'
           AND u.tipo = 'DOCENTE'
           AND (p.nro_documento IN (${apoderadoDnis.map(() => '?').join(',')})
                OR u.usuario IN (${apoderadoDnis.map(() => '?').join(',')}))`,
        [colegio_id, ...apoderadoDnis, ...apoderadoDnis]
      );
      for (const d of docentesApoderados || []) {
        if (!yaIds.has(d.id)) {
          yaIds.add(d.id);
          apoderadosIds.push({ usuario_id: d.id, tipo: d.tipo });
        }
      }
    }
  }

  const docentesGrupos = await query(
    `SELECT DISTINCT u.id, u.tipo
     FROM asignaturas a
     INNER JOIN usuarios u ON u.personal_id = a.personal_id
     WHERE a.grupo_id IN (${gruposArray.map(() => '?').join(',')})
       AND a.colegio_id = ?
       AND u.colegio_id = ?
       AND u.estado = 'ACTIVO'`,
    [...gruposArray, colegio_id, colegio_id]
  );

  const tutores = await query(
    `SELECT DISTINCT u.id, u.tipo
     FROM grupos g
     INNER JOIN usuarios u ON u.personal_id = g.tutor_id AND u.colegio_id = g.colegio_id
     WHERE g.id = ? AND g.colegio_id = ?
       AND u.estado = 'ACTIVO'`,
    [grupo_id, colegio_id]
  );

  destinatarios.push(
    ...(alumnosGrupos || []).map((a) => ({ usuario_id: a.id, tipo: a.tipo })),
    ...apoderadosIds,
    ...(docentesGrupos || []).map((d) => ({ usuario_id: d.id, tipo: d.tipo })),
    ...(tutores || []).map((t) => ({ usuario_id: t.id, tipo: t.tipo }))
  );

  const adminsColegio = await query(
    `SELECT u.id, u.tipo FROM usuarios u
     WHERE u.colegio_id = ? AND u.estado = 'ACTIVO'
       AND u.tipo IN ('ADMINISTRADOR', 'PROMOTORIA')`,
    [colegio_id]
  );
  for (const row of adminsColegio || []) {
    destinatarios.push({ usuario_id: row.id, tipo: row.tipo });
  }

  const seen = new Set();
  const unicos = [];
  for (const d of destinatarios) {
    if (!seen.has(d.usuario_id)) {
      seen.add(d.usuario_id);
      unicos.push(d);
    }
  }
  return unicos;
}

function construirCuerpoPush({ titulo, etiquetaGrupo, nombreDocente }) {
  const partes = [titulo, etiquetaGrupo];
  if (nombreDocente && String(nombreDocente).trim()) {
    partes.push(`Por: ${nombreDocente.trim()}`);
  }
  return partes.join(' · ');
}

/**
 * @param {object} ctx
 * @param {Function} ctx.query
 * @param {Function} ctx.execute
 * @param {number} ctx.colegio_id
 * @param {number} ctx.grupo_id
 * @param {string} ctx.titulo
 * @param {string} ctx.etiquetaGrupo  ej. "Inicial — 3° · Sec. A"
 * @param {string} [ctx.nombreDocente]
 * @param {number} ctx.vocabularioId
 * @param {number} ctx.usuario_emisor_id
 */
async function notificarVocabularioNuevo(ctx) {
  const {
    query,
    execute,
    colegio_id,
    grupo_id,
    titulo,
    etiquetaGrupo,
    nombreDocente,
    vocabularioId,
    usuario_emisor_id
  } = ctx;

  try {
    const colegioRows = await query(`SELECT nombre FROM colegios WHERE id = ? LIMIT 1`, [colegio_id]);
    const colegioNombre = colegioRows.length ? colegioRows[0].nombre : 'Vanguard Schools';

    const destinatarios = await recolectarDestinatariosGrupo(query, colegio_id, grupo_id);
    if (!destinatarios.length) {
      console.log('📚 [VOCABULARIOS] Sin destinatarios para notificar');
      return;
    }

    const tituloNotif = 'Nuevo vocabulario';
    const mensajeNotif = construirCuerpoPush({ titulo, etiquetaGrupo, nombreDocente });
    const tipoPorUsuario = new Map(destinatarios.map((d) => [d.usuario_id, d.tipo]));

    for (const dest of destinatarios) {
      try {
        const urlDest = urlVocabularioPorTipoUsuario(dest.tipo);
        await insertNotificacionUsuario(execute, {
          usuario_id: usuario_emisor_id,
          destinatario_id: dest.usuario_id,
          asunto: tituloNotif,
          contenido: mensajeNotif,
          estado: 'NO ENVIADO',
          accion_tipo: 'vocabulario',
          accion_payload: { vocabulario_id: vocabularioId, grupo_id: grupo_id },
          url_destino: urlDest
        });
      } catch (e) {
        console.warn(`📚 [VOCABULARIOS] Error insert notificación usuario ${dest.usuario_id}:`, e.message);
      }
    }

    const usuarioIds = destinatarios.map((d) => d.usuario_id);
    const subsData = await query(
      `SELECT usuario_id, endpoint, p256dh, auth
       FROM push_subscriptions
       WHERE usuario_id IN (${usuarioIds.map(() => '?').join(',')})
         AND colegio_id = ? AND (activo = 1 OR activo IS NULL)`,
      [...usuarioIds, colegio_id]
    );

    if ((subsData || []).length > 0) {
      const pushItems = subsData.map((sub) => {
        const tipoU = tipoPorUsuario.get(sub.usuario_id) || 'DOCENTE';
        return {
          subscription: {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth }
          },
          payload: {
            title: tituloNotif,
            body: mensajeNotif,
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-192x192.png',
            vibrate: [200, 100, 200],
            tag: `vocabulario-${vocabularioId}-${sub.usuario_id}`,
            data: {
              url: urlVocabularioPorTipoUsuario(tipoU),
              tipo: 'vocabulario',
              vocabulario_id: vocabularioId,
              grupo_id: grupo_id
            }
          }
        };
      });

      enviarPushNotificacionesIndividuales(pushItems)
        .then(async (resultadosPush) => {
          const expiradas = resultadosPush.filter((r) => r.resultado && r.resultado.expired && r.subscription?.endpoint);
          for (const { subscription } of expiradas) {
            try {
              await execute('UPDATE push_subscriptions SET activo = 0 WHERE endpoint = ?', [subscription.endpoint]);
            } catch (e) {
              console.warn('📚 [VOCABULARIOS] push subscription inactiva:', e.message);
            }
          }
        })
        .catch((err) => console.error('📚 [VOCABULARIOS] Error push:', err));
    }

    const idsCorreo = destinatarios
      .filter((d) => ['APODERADO', 'DOCENTE', 'ADMINISTRADOR', 'PROMOTORIA'].includes(String(d.tipo || '').toUpperCase()))
      .map((d) => d.usuario_id);
    if (idsCorreo.length > 0) {
      const emailsRows = await query(
        `SELECT u.id, COALESCE(ap.email, p.email) AS email
         FROM usuarios u
         LEFT JOIN apoderados ap ON ap.id = u.apoderado_id
         LEFT JOIN personal p ON p.id = u.personal_id
         WHERE u.id IN (${idsCorreo.map(() => '?').join(',')})
           AND COALESCE(ap.email, p.email) IS NOT NULL
           AND TRIM(COALESCE(ap.email, p.email)) != ''`,
        [...idsCorreo]
      );
      const emailsUnicos = new Map();
      (emailsRows || []).forEach((u) => {
        const email = (u.email || '').toLowerCase().trim();
        if (email.includes('@') && !emailsUnicos.has(email)) emailsUnicos.set(email, u.email);
      });

      const cuerpoCorreo = [
        `Se publicó un nuevo vocabulario: «${titulo}».`,
        `Grupo: ${etiquetaGrupo}.`,
        nombreDocente && String(nombreDocente).trim() ? `Docente: ${nombreDocente.trim()}.` : '',
        'Ingrese a la intranet en la sección Vocabulario (Herramientas) para ver el PDF.'
      ]
        .filter(Boolean)
        .join('\n\n');

      let enviados = 0;
      for (const email of emailsUnicos.values()) {
        try {
          const res = await enviarCorreoNotificacion(
            email,
            tituloNotif,
            cuerpoCorreo,
            colegioNombre,
            'COMUNICADOS'
          );
          if (res && res.success) enviados += 1;
        } catch (e) {
          console.warn(`📚 [VOCABULARIOS] Correo error ${email}:`, e.message);
        }
      }
      console.log(`📚 [VOCABULARIOS] Correos: ${enviados}/${emailsUnicos.size} · Push subs: ${(subsData || []).length} · Destinatarios: ${destinatarios.length}`);
    }
  } catch (err) {
    console.error('📚 [VOCABULARIOS] notificarVocabularioNuevo:', err);
  }
}

module.exports = { notificarVocabularioNuevo, recolectarDestinatariosGrupo };
