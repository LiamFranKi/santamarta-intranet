/**
 * Tras crear una derivación desde docente: notifica en BD, push y correo a personal administrativo / psicología.
 */
const { query, execute } = require('./mysql');
const { insertNotificacionUsuario, notificacionMensajeDuplicadaReciente } = require('./notificacionInsert');
const { enviarPushNotificacionesIndividuales } = require('../services/pushNotificationService');
const { enviarCorreoNotificacion } = require('../services/emailService');

/** Incluir PSICOLOGO por datos históricos; PSICOLOGA es el valor estándar en usuarios.tipo */
const TIPOS_STAFF = ['ADMINISTRADOR', 'PROMOTORIA', 'SECRETARIA', 'PSICOLOGA', 'PSICOLOGO'];

async function contextoAlumnoGrado(colegio_id, alumnoId, matriculaId) {
  const [al] = await query(
    `SELECT TRIM(CONCAT(
        COALESCE(a.apellido_paterno,''), ' ',
        COALESCE(a.apellido_materno,''), ' ',
        COALESCE(a.nombres,''))) AS nombre
     FROM alumnos a WHERE a.id = ? AND a.colegio_id = ? LIMIT 1`,
    [alumnoId, colegio_id]
  );
  let mid = matriculaId != null && Number.isFinite(Number(matriculaId)) ? Number(matriculaId) : null;
  if (!mid) {
    const [mr] = await query(
      `SELECT m.id FROM matriculas m
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND (m.estado = 0)
       ORDER BY m.id DESC LIMIT 1`,
      [alumnoId, colegio_id]
    );
    mid = mr?.id != null ? parseInt(mr.id, 10) : null;
  }
  let gradoTexto = '—';
  if (mid) {
    const [gr] = await query(
      `SELECT TRIM(CONCAT(
          COALESCE(n.nombre,''), ' ',
          COALESCE(g.grado,''), '° ',
          COALESCE(g.seccion,''))) AS t
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id AND g.colegio_id = m.colegio_id
       LEFT JOIN niveles n ON n.id = g.nivel_id AND n.colegio_id = g.colegio_id
       WHERE m.id = ? AND m.colegio_id = ? LIMIT 1`,
      [mid, colegio_id]
    );
    if (gr && gr.t) gradoTexto = String(gr.t).trim() || '—';
  }
  return {
    alumnoNombre: (al && al.nombre && String(al.nombre).trim()) || `Alumno #${alumnoId}`,
    gradoTexto,
  };
}

async function nombreDocenteReferente(personalId) {
  if (!personalId) return 'Docente';
  const [p] = await query(
    `SELECT TRIM(CONCAT(COALESCE(p.apellidos,''), ' ', COALESCE(p.nombres,''))) AS nombre
     FROM personal p WHERE p.id = ? LIMIT 1`,
    [personalId]
  );
  return (p && p.nombre && String(p.nombre).trim()) || 'Docente';
}

/**
 * @param {object} opts
 * @param {number} opts.colegio_id
 * @param {number} opts.derivacionId
 * @param {number} opts.alumnoId
 * @param {number|null} opts.matriculaId
 * @param {number|null} opts.docentePersonalId
 * @param {number|null} opts.remitenteUsuarioId — usuario docente que envía (para no duplicar notif.)
 */
async function notificarStaffNuevaDerivacionDocente(opts) {
  const {
    colegio_id,
    derivacionId,
    alumnoId,
    matriculaId,
    docentePersonalId,
    remitenteUsuarioId,
  } = opts || {};
  if (!colegio_id || !derivacionId || !alumnoId) return;

  const { alumnoNombre, gradoTexto } = await contextoAlumnoGrado(colegio_id, alumnoId, matriculaId);
  const docenteNombre = await nombreDocenteReferente(docentePersonalId);

  const tituloPush = 'Nueva derivación psicológica';
  const bodyPush = `${alumnoNombre}. ${gradoTexto}. Docente: ${docenteNombre}.`;

  const asunto = 'Nueva derivación psicológica (docente)';
  const mensajeLargo =
    `Un docente registró una derivación psicológica.\n\n` +
    `Alumno: ${alumnoNombre}\n` +
    `Grado / aula: ${gradoTexto}\n` +
    `Docente referente: ${docenteNombre}\n` +
    `ID derivación: #${derivacionId}\n\n` +
    `Revise el módulo Psicología en la intranet.`;

  let colegioNombre = 'Vanguard Schools';
  try {
    const [c] = await query('SELECT nombre FROM colegios WHERE id = ? LIMIT 1', [colegio_id]);
    if (c && c.nombre) colegioNombre = String(c.nombre);
  } catch (_) {
    /* ignore */
  }

  const placeholders = TIPOS_STAFF.map(() => '?').join(',');
  let sqlStaff = `SELECT u.id, u.email FROM usuarios u
     WHERE u.colegio_id = ? AND u.estado = 'ACTIVO'
       AND u.tipo IN (${placeholders})`;
  const paramsStaff = [colegio_id, ...TIPOS_STAFF];
  if (remitenteUsuarioId != null && Number.isFinite(Number(remitenteUsuarioId))) {
    sqlStaff += ' AND u.id <> ?';
    paramsStaff.push(Number(remitenteUsuarioId));
  }
  const staffRows = await query(sqlStaff, paramsStaff);
  if (!staffRows || !staffRows.length) {
    console.warn('[psicologia] derivación docente: sin usuarios staff para notificar');
    return;
  }

  const usuarioOrigen =
    remitenteUsuarioId != null && Number.isFinite(Number(remitenteUsuarioId))
      ? Number(remitenteUsuarioId)
      : null;
  if (usuarioOrigen == null) {
    console.warn(
      '[psicologia] derivación docente: remitenteUsuarioId ausente; no se insertan notificaciones (JWT debe incluir usuario_id/id)'
    );
  }

  for (const row of staffRows) {
    const destId = row.id;
    try {
      if (usuarioOrigen == null || destId == null) continue;
      const dup = await notificacionMensajeDuplicadaReciente(query, {
        usuario_id: usuarioOrigen,
        destinatario_id: destId,
        accion_tipo: 'PSICOLOGIA_DERIVACION_DOCENTE',
        contenido: `der-doc#${derivacionId}`,
        ventanaSegundos: 90,
      });
      if (!dup) {
        await insertNotificacionUsuario(execute, {
          para: 'USUARIO',
          usuario_id: usuarioOrigen,
          destinatario_id: destId,
          asunto: tituloPush,
          contenido: mensajeLargo,
          estado: 'NO ENVIADO',
          accion_tipo: 'PSICOLOGIA_DERIVACION_DOCENTE',
          accion_payload: { derivacion_id: derivacionId, alumno_id: alumnoId },
          url_destino: '/admin/psicologia',
        });
      }
    } catch (e) {
      console.warn('[psicologia] notif BD derivación docente:', e.message);
    }
  }

  const usuarioIds = [...new Set(staffRows.map((r) => parseInt(r.id, 10)).filter(Number.isFinite))];
  if (!usuarioIds.length) return;

  setImmediate(async () => {
    try {
      const subsData = await query(
        `SELECT usuario_id, endpoint, p256dh, auth FROM push_subscriptions
         WHERE colegio_id = ? AND usuario_id IN (${usuarioIds.map(() => '?').join(',')})
           AND (activo = 1 OR activo IS NULL)`,
        [colegio_id, ...usuarioIds]
      );
      const items = (subsData || []).map((sub) => ({
        subscription: {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload: {
          title: tituloPush,
          body: bodyPush,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-192x192.png',
          vibrate: [200, 100, 200],
          tag: `psi-der-doc-${derivacionId}`,
          data: {
            url: '/admin/psicologia',
            tipo: 'psicologia_derivacion_docente',
            derivacion_id: derivacionId,
            alumno_id: alumnoId,
          },
        },
      }));
      if (items.length) {
        enviarPushNotificacionesIndividuales(items).catch((err) => {
          console.error('[psicologia] push derivación docente:', err.message);
        });
      }
    } catch (e) {
      console.warn('[psicologia] push derivación docente:', e.message);
    }

    const emailsUnicos = new Map();
    for (const row of staffRows) {
      const em = row.email != null ? String(row.email).trim() : '';
      if (em && em.includes('@')) emailsUnicos.set(em.toLowerCase(), row.email);
    }
    for (const emailOriginal of emailsUnicos.values()) {
      try {
        await enviarCorreoNotificacion(emailOriginal, asunto, mensajeLargo, colegioNombre, 'GENERAL');
      } catch (e) {
        console.warn('[psicologia] email derivación docente:', e.message);
      }
    }
  });
}

module.exports = { notificarStaffNuevaDerivacionDocente, contextoAlumnoGrado };
