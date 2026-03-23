/**
 * Resuelve rutas SPA según tipo de usuario destinatario (deep links).
 */

async function obtenerUrlAulaVirtual(query, destinatarioUsuarioId, ctx) {
  const { asignatura_id, grupo_id, recurso_tipo, recurso_id } = ctx;
  const users = await query(
    `SELECT id, tipo, alumno_id, apoderado_id, personal_id FROM usuarios WHERE id = ? LIMIT 1`,
    [destinatarioUsuarioId]
  );
  if (!users.length) return '/';
  const u = users[0];
  const q = [];
  if (recurso_tipo && recurso_id != null && recurso_id !== '') {
    q.push(`abrir=${encodeURIComponent(String(recurso_tipo))}`, `id=${encodeURIComponent(String(recurso_id))}`);
  }
  const queryStr = q.length ? `?${q.join('&')}` : '';

  if (u.tipo === 'ALUMNO') {
    return `/alumno/aula-virtual/${asignatura_id}${queryStr}`;
  }

  if (u.tipo === 'APODERADO' && u.apoderado_id) {
    const hijos = await query(
      `SELECT DISTINCT a.id FROM alumnos a
       INNER JOIN familias f ON f.alumno_id = a.id AND f.apoderado_id = ?
       INNER JOIN matriculas m ON m.alumno_id = a.id AND m.grupo_id = ? AND (m.estado = 0 OR m.estado = 4)
       LIMIT 1`,
      [u.apoderado_id, grupo_id]
    );
    if (hijos.length) {
      return `/apoderado/hijos/${hijos[0].id}/aula-virtual/${asignatura_id}${queryStr}`;
    }
    return '/apoderado/hijos';
  }

  if (u.tipo === 'DOCENTE' && u.personal_id) {
    const hijos = await query(
      `SELECT DISTINCT a.id FROM alumnos a
       INNER JOIN familias f ON f.alumno_id = a.id
       INNER JOIN apoderados ap ON ap.id = f.apoderado_id
       INNER JOIN personal pap ON pap.nro_documento = ap.nro_documento AND pap.id = ?
       INNER JOIN matriculas m ON m.alumno_id = a.id AND m.grupo_id = ? AND (m.estado = 0 OR m.estado = 4)
       LIMIT 1`,
      [u.personal_id, grupo_id]
    );
    if (hijos.length) {
      return `/docente/hijos/${hijos[0].id}/aula-virtual/${asignatura_id}${queryStr}`;
    }
    return '/docente/dashboard';
  }

  return '/docente/dashboard';
}

async function obtenerUrlExamenActivado(query, destinatarioUsuarioId, ctx) {
  const { asignatura_id, grupo_id, examen_id } = ctx;
  const users = await query(
    `SELECT id, tipo, alumno_id, apoderado_id, personal_id FROM usuarios WHERE id = ? LIMIT 1`,
    [destinatarioUsuarioId]
  );
  if (!users.length) return '/';
  const u = users[0];
  if (u.tipo === 'ALUMNO') {
    return `/alumno/examen/${examen_id}`;
  }
  const queryStr = `?abrir=examen&id=${encodeURIComponent(String(examen_id))}`;
  if (u.tipo === 'APODERADO' && u.apoderado_id) {
    const hijos = await query(
      `SELECT DISTINCT a.id FROM alumnos a
       INNER JOIN familias f ON f.alumno_id = a.id AND f.apoderado_id = ?
       INNER JOIN matriculas m ON m.alumno_id = a.id AND m.grupo_id = ? AND (m.estado = 0 OR m.estado = 4)
       LIMIT 1`,
      [u.apoderado_id, grupo_id]
    );
    if (hijos.length) {
      return `/apoderado/hijos/${hijos[0].id}/aula-virtual/${asignatura_id}${queryStr}`;
    }
    return '/apoderado/hijos';
  }
  if (u.tipo === 'DOCENTE' && u.personal_id) {
    const hijos = await query(
      `SELECT DISTINCT a.id FROM alumnos a
       INNER JOIN familias f ON f.alumno_id = a.id
       INNER JOIN apoderados ap ON ap.id = f.apoderado_id
       INNER JOIN personal pap ON pap.nro_documento = ap.nro_documento AND pap.id = ?
       INNER JOIN matriculas m ON m.alumno_id = a.id AND m.grupo_id = ? AND (m.estado = 0 OR m.estado = 4)
       LIMIT 1`,
      [u.personal_id, grupo_id]
    );
    if (hijos.length) {
      return `/docente/hijos/${hijos[0].id}/aula-virtual/${asignatura_id}${queryStr}`;
    }
    return '/docente/dashboard';
  }
  return '/docente/dashboard';
}

/**
 * URL para notificaciones dirigidas a apoderados/docente-apoderado (helper docente).
 */
function inferirUrlApoderadoNotificacion(tipoNotificacion, dataExtra = {}, alumno_id) {
  const tipo = String(tipoNotificacion || '');
  if (tipo.includes('mensaje') || tipo === 'conexion' || (dataExtra && dataExtra.mensaje_id)) {
    return '/apoderado/mensajes';
  }
  if (tipo.includes('publicacion') || tipo.includes('comunicado')) {
    return '/apoderado/comunicados';
  }
  if (tipo.includes('asistencia')) {
    return '/apoderado/hijos';
  }
  if (tipo === 'examen_finalizado' && alumno_id) {
    return '/apoderado/hijos';
  }
  return '/apoderado/dashboard';
}

function urlPublicacionPorTipoUsuario(tipoUsuario) {
  if (tipoUsuario === 'ALUMNO') return '/alumno/comunicados';
  if (tipoUsuario === 'APODERADO') return '/apoderado/comunicados';
  return '/docente/comunicados';
}

module.exports = {
  obtenerUrlAulaVirtual,
  obtenerUrlExamenActivado,
  inferirUrlApoderadoNotificacion,
  urlPublicacionPorTipoUsuario
};
