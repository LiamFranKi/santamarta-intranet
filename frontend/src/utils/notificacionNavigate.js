/**
 * Ajusta la ruta guardada en la notificación al perfil que está navegando
 * (p. ej. apoderado viendo avisos dirigidos al usuario-alumno del hijo).
 */

export function dashboardPorTipoUsuario(tipo) {
  if (tipo === 'ALUMNO') return '/alumno/dashboard';
  if (tipo === 'APODERADO') return '/apoderado/dashboard';
  if (tipo === 'DOCENTE') return '/docente/dashboard';
  if (tipo === 'ADMINISTRADOR') return '/admin/dashboard';
  if (tipo === 'PROMOTORIA') return '/promotoria/dashboard';
  return '/';
}

/** El API puede devolver payload ya parseado o como string JSON. */
function parsePayload(raw) {
  if (raw == null || raw === '') return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return typeof p === 'object' && p !== null && !Array.isArray(p) ? p : {};
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Resuelve la ruta SPA al hacer clic en la campanita (o al abrir desde push).
 * 1) Usa url_destino si viene del backend.
 * 2) Si falta, reconstruye desde accion_tipo + accion_payload (respaldo).
 * 3) Si no hay datos, va al dashboard del rol.
 */
export function normalizarUrlNotificacion(notif, user) {
  const payload = parsePayload(notif?.accion_payload);
  let url = (notif?.url_destino != null ? String(notif.url_destino) : '').trim();
  const tipoAccion = String(notif?.accion_tipo || '');

  // Apoderado/docente: reescribir URL guardada como alumno (avisos “del hijo” en la bandeja del apoderado)
  if (user?.tipo === 'APODERADO' && url.startsWith('/alumno/aula-virtual/') && payload.asignatura_id && payload.alumno_id) {
    const qs = url.includes('?') ? url.slice(url.indexOf('?')) : '';
    return `/apoderado/hijos/${payload.alumno_id}/aula-virtual/${payload.asignatura_id}${qs}`;
  }
  if (user?.tipo === 'DOCENTE' && url.startsWith('/alumno/aula-virtual/') && payload.asignatura_id && payload.alumno_id) {
    const qs = url.includes('?') ? url.slice(url.indexOf('?')) : '';
    return `/docente/hijos/${payload.alumno_id}/aula-virtual/${payload.asignatura_id}${qs}`;
  }

  // Notificaciones viejas con rutas inexistentes /hijos/:id -> redirigir al listado de hijos
  if (user?.tipo === 'APODERADO' && /^\/apoderado\/hijos\/\d+(?:$|[?#])/.test(url)) {
    return '/apoderado/hijos';
  }
  if (user?.tipo === 'DOCENTE' && /^\/docente\/hijos\/\d+(?:$|[?#])/.test(url)) {
    return '/docente/hijos';
  }

  // Notificaciones viejas: URL de apoderado pero sesión docente (docente-apoderado) -> evitar 403
  if (user?.tipo === 'DOCENTE' && url.startsWith('/apoderado/hijos')) {
    return url.replace('/apoderado/hijos', '/docente/hijos');
  }
  if (user?.tipo === 'DOCENTE' && (url === '/apoderado/dashboard' || url.startsWith('/apoderado/mensajes'))) {
    return url.replace('/apoderado/', '/docente/');
  }
  if (user?.tipo === 'DOCENTE' && url.startsWith('/apoderado/comunicados')) {
    return url.replace('/apoderado/comunicados', '/docente/comunicados');
  }

  // Publicación: centralizar en dashboard (feed) aunque en BD siga /comunicados (datos antiguos)
  if (
    tipoAccion === 'publicacion' &&
    url &&
    url.includes('/comunicados')
  ) {
    if (user?.tipo === 'ALUMNO') return '/alumno/dashboard#publicaciones';
    if (user?.tipo === 'APODERADO') return '/apoderado/dashboard#publicaciones';
    if (user?.tipo === 'ADMINISTRADOR') return '/admin/dashboard#publicaciones';
    if (user?.tipo === 'PROMOTORIA') return '/promotoria/dashboard#publicaciones';
    return '/docente/dashboard#publicaciones';
  }

  if (url) return url;

  // ——— Respaldo: sin url_destino (datos viejos o respuesta parcial) ———

  if (tipoAccion.startsWith('aula_virtual_') && payload.asignatura_id) {
    const recursoTipo = payload.recurso_tipo || tipoAccion.replace('aula_virtual_', '');
    const recursoId = payload.recurso_id ?? payload.entidad_id;
    const qs =
      recursoTipo && recursoId != null && recursoId !== ''
        ? `?abrir=${encodeURIComponent(String(recursoTipo))}&id=${encodeURIComponent(String(recursoId))}`
        : '';
    if (user?.tipo === 'ALUMNO') {
      return `/alumno/aula-virtual/${payload.asignatura_id}${qs}`;
    }
    if (user?.tipo === 'APODERADO' && payload.alumno_id) {
      return `/apoderado/hijos/${payload.alumno_id}/aula-virtual/${payload.asignatura_id}${qs}`;
    }
    if (user?.tipo === 'DOCENTE' && payload.alumno_id) {
      return `/docente/hijos/${payload.alumno_id}/aula-virtual/${payload.asignatura_id}${qs}`;
    }
    if (user?.tipo === 'APODERADO') return '/apoderado/hijos';
    if (user?.tipo === 'DOCENTE') return '/docente/hijos';
  }

  if (tipoAccion === 'examen_activado' && payload.examen_id) {
    if (user?.tipo === 'ALUMNO') return `/alumno/examen/${payload.examen_id}`;
    if (user?.tipo === 'APODERADO' && payload.asignatura_id && payload.alumno_id) {
      return `/apoderado/hijos/${payload.alumno_id}/aula-virtual/${payload.asignatura_id}?abrir=examen&id=${payload.examen_id}`;
    }
    if (user?.tipo === 'DOCENTE' && payload.asignatura_id && payload.alumno_id) {
      return `/docente/hijos/${payload.alumno_id}/aula-virtual/${payload.asignatura_id}?abrir=examen&id=${payload.examen_id}`;
    }
    if (user?.tipo === 'APODERADO') return '/apoderado/hijos';
    if (user?.tipo === 'DOCENTE') return '/docente/dashboard';
  }

  if (tipoAccion === 'publicacion') {
    if (user?.tipo === 'ALUMNO') return '/alumno/dashboard#publicaciones';
    if (user?.tipo === 'APODERADO') return '/apoderado/dashboard#publicaciones';
    if (user?.tipo === 'ADMINISTRADOR') return '/admin/dashboard#publicaciones';
    if (user?.tipo === 'PROMOTORIA') return '/promotoria/dashboard#publicaciones';
    return '/docente/dashboard#publicaciones';
  }

  if (tipoAccion === 'mensajes_conexiones' || tipoAccion.includes('mensaje')) {
    if (user?.tipo === 'APODERADO') return '/apoderado/mensajes';
    if (user?.tipo === 'DOCENTE') return '/docente/mensajes';
    return '/alumno/mensajes';
  }

  if (tipoAccion === 'asistencia_alumno') {
    // No existe ruta /hijos/:id en App; usar listado de hijos.
    if (user?.tipo === 'DOCENTE') return '/docente/hijos';
    return '/apoderado/hijos';
  }
  if (tipoAccion === 'asistencia_docente') return '/docente/dashboard';

  if ((tipoAccion === 'tarea_por_vencer' || tipoAccion === 'tarea_vencida_sin_entrega') && payload.asignatura_id) {
    const tid = payload.tarea_id;
    const qs = tid != null && tid !== '' ? `?abrir=tarea&id=${encodeURIComponent(String(tid))}` : '';
    if (user?.tipo === 'ALUMNO') return `/alumno/aula-virtual/${payload.asignatura_id}${qs}`;
    if (user?.tipo === 'APODERADO') return '/apoderado/hijos';
  }

  if (tipoAccion === 'examen_finalizado') {
    if (user?.tipo === 'DOCENTE') {
      return '/docente/hijos';
    }
    return '/apoderado/hijos';
  }

  return dashboardPorTipoUsuario(user?.tipo);
}
