/**
 * Resuelve rutas SPA según tipo de usuario destinatario (deep links).
 */
const { esTipoPersonal } = require('./hexAudiencias');

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
       INNER JOIN matriculas m ON m.alumno_id = a.id AND m.grupo_id = ? AND (m.estado = 0)
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
       INNER JOIN matriculas m ON m.alumno_id = a.id AND m.grupo_id = ? AND (m.estado = 0)
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
       INNER JOIN matriculas m ON m.alumno_id = a.id AND m.grupo_id = ? AND (m.estado = 0)
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
       INNER JOIN matriculas m ON m.alumno_id = a.id AND m.grupo_id = ? AND (m.estado = 0)
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
 * Portal hijos según rol del destinatario (evita enviar a /apoderado/* a un usuario con sesión DOCENTE).
 * extra.abrir: incidencias | asistencias — extra.item: id de fila (inc-12, ped-3, tard-9).
 */
function urlPortalHijoPorTipoUsuario(tipoDestinatario, alumno_id, extra = {}) {
  const td = String(tipoDestinatario || '').toUpperCase();
  let base = '/';
  if (td === 'DOCENTE') base = '/docente/hijos';
  else if (td === 'APODERADO') base = '/apoderado/hijos';
  else return '/';

  const abrir = extra && extra.abrir ? String(extra.abrir) : '';
  const item = extra && extra.item != null && extra.item !== '' ? String(extra.item) : '';
  const hijo = alumno_id != null && alumno_id !== '' ? String(alumno_id) : '';
  if (!abrir && !hijo && !item) return base;
  const q = [];
  if (abrir) q.push(`abrir=${encodeURIComponent(abrir)}`);
  if (hijo) q.push(`hijo=${encodeURIComponent(hijo)}`);
  if (item) q.push(`item=${encodeURIComponent(item)}`);
  return q.length ? `${base}?${q.join('&')}` : base;
}

function itemIncidenciaDesdeExtra(dataExtra) {
  if (!dataExtra || typeof dataExtra !== 'object') return '';
  if (dataExtra.incident_id != null && dataExtra.incident_id !== '') {
    return `inc-${dataExtra.incident_id}`;
  }
  if (dataExtra.presentacion_id != null && dataExtra.presentacion_id !== '') {
    return `ped-${dataExtra.presentacion_id}`;
  }
  if (dataExtra.asistencia_id != null && dataExtra.asistencia_id !== '') {
    return `tard-${dataExtra.asistencia_id}`;
  }
  return '';
}

/**
 * URL in-app según tipo de notificación y tipo de usuario destinatario (apoderado vs docente-apoderado).
 */
function inferirUrlNotificacionFamiliaPorDestinatario(
  tipoNotificacion,
  dataExtra = {},
  alumno_id,
  tipoDestinatario
) {
  const tipo = String(tipoNotificacion || '');
  const td = String(tipoDestinatario || 'APODERADO').toUpperCase();
  const extra = dataExtra && typeof dataExtra === 'object' ? dataExtra : {};
  if (tipo.includes('mensaje') || tipo === 'conexion' || extra.mensaje_id) {
    if (td === 'DOCENTE') return '/docente/mensajes';
    return '/apoderado/mensajes';
  }
  if (tipo.includes('publicacion') || tipo.includes('comunicado')) {
    if (td === 'DOCENTE') return '/docente/comunicados';
    return '/apoderado/comunicados';
  }
  if (tipo === 'incidencia' || tipo.includes('incidencia')) {
    return urlPortalHijoPorTipoUsuario(td, alumno_id, {
      abrir: 'incidencias',
      item: itemIncidenciaDesdeExtra(extra),
    });
  }
  if (tipo === 'presentacion_vestimenta' || tipo === 'olvido_qr') {
    return urlPortalHijoPorTipoUsuario(td, alumno_id, {
      abrir: 'incidencias',
      item: itemIncidenciaDesdeExtra(extra),
    });
  }
  if (tipo.includes('asistencia') || tipo.startsWith('asistencia_manual')) {
    const tr = String(extra.tipo_asistencia || extra.tipo_registro || '').toUpperCase();
    const esTardanza = tr === 'TARDANZA' || tipo.includes('tardanza');
    return urlPortalHijoPorTipoUsuario(td, alumno_id, {
      abrir: esTardanza ? 'incidencias' : 'asistencias',
      item: esTardanza ? itemIncidenciaDesdeExtra(extra) : '',
    });
  }
  if (tipo === 'examen_finalizado') {
    return urlPortalHijoPorTipoUsuario(td, alumno_id);
  }
  if (tipo === 'nota_tarea') {
    return urlPortalHijoPorTipoUsuario(td, alumno_id);
  }
  if (td === 'DOCENTE') return '/docente/dashboard';
  return '/apoderado/dashboard';
}

/**
 * URL para notificaciones dirigidas a apoderados/docente-apoderado (helper docente).
 * @deprecated Preferir inferirUrlNotificacionFamiliaPorDestinatario con tipo destinatario.
 */
function inferirUrlApoderadoNotificacion(tipoNotificacion, dataExtra = {}, alumno_id) {
  return inferirUrlNotificacionFamiliaPorDestinatario(
    tipoNotificacion,
    dataExtra,
    alumno_id,
    'APODERADO'
  );
}

/** Ruta SPA al feed de publicaciones según rol (admin/promotoría: página dedicada). */
function urlPublicacionPorTipoUsuario(tipoUsuario) {
  const t = String(tipoUsuario || '').toUpperCase();
  if (t === 'ALUMNO') return '/alumno/dashboard#publicaciones';
  if (t === 'APODERADO') return '/apoderado/dashboard#publicaciones';
  if (t === 'ADMINISTRADOR') return '/admin/publicaciones';
  if (t === 'PROMOTORIA') return '/admin/publicaciones';
  return '/docente/dashboard#publicaciones';
}

/** Ruta SPA al listado de comunicados según rol. */
function urlComunicadoPorTipoUsuario(tipoUsuario) {
  const t = String(tipoUsuario || '').toUpperCase();
  if (t === 'ALUMNO') return '/alumno/comunicados';
  if (t === 'APODERADO') return '/apoderado/comunicados';
  if (t === 'ADMINISTRADOR' || t === 'PROMOTORIA') return '/admin/comunicaciones/comunicados';
  return '/docente/comunicados';
}

/** Ruta SPA a la bandeja Mensajes según rol. */
function urlMensajesPorTipoUsuario(tipoUsuario) {
  const t = String(tipoUsuario || '').toUpperCase();
  if (t === 'ALUMNO') return '/alumno/mensajes';
  if (t === 'APODERADO') return '/apoderado/mensajes';
  if (t === 'ADMINISTRADOR' || t === 'PROMOTORIA') return '/admin/mensajes';
  if (t === 'DOCENTE' || esTipoPersonal(t)) return '/docente/mensajes';
  return '/apoderado/mensajes';
}

/** Dashboard por rol (clic en aviso manual / campanita genérica). */
function urlDashboardPorTipoUsuario(tipoUsuario) {
  const t = String(tipoUsuario || '').toUpperCase();
  if (t === 'ALUMNO') return '/alumno/dashboard';
  if (t === 'APODERADO') return '/apoderado/dashboard';
  if (t === 'ADMINISTRADOR' || t === 'PROMOTORIA' || t === 'PSICOLOGA') return '/admin/dashboard';
  return '/docente/dashboard';
}

/** Ruta SPA a vocabularios (herramientas) según rol. */
function urlVocabularioPorTipoUsuario(tipoUsuario) {
  const t = String(tipoUsuario || '').toUpperCase();
  if (t === 'ALUMNO') return '/alumno/vocabularios';
  if (t === 'APODERADO') return '/apoderado/dashboard';
  if (t === 'ADMINISTRADOR' || t === 'PROMOTORIA') return '/admin/herramientas/vocabularios';
  return '/docente/herramientas/vocabularios';
}

module.exports = {
  obtenerUrlAulaVirtual,
  obtenerUrlExamenActivado,
  inferirUrlApoderadoNotificacion,
  inferirUrlNotificacionFamiliaPorDestinatario,
  urlPortalHijoPorTipoUsuario,
  urlPublicacionPorTipoUsuario,
  urlComunicadoPorTipoUsuario,
  urlMensajesPorTipoUsuario,
  urlVocabularioPorTipoUsuario,
  urlDashboardPorTipoUsuario,
};
