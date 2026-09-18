/**
 * Ajusta la ruta guardada en la notificación al perfil que está navegando
 * (p. ej. apoderado viendo avisos dirigidos al usuario-alumno del hijo).
 */

import { urlFichaSupervision } from './supervisionRutas';

export function dashboardPorTipoUsuario(tipo) {
  if (tipo === 'ALUMNO') return '/alumno/dashboard';
  if (tipo === 'APODERADO') return '/apoderado/dashboard';
  if (tipo === 'DOCENTE') return '/docente/dashboard';
  if (tipo === 'ADMINISTRADOR') return '/admin/dashboard';
  if (tipo === 'PROMOTORIA') return '/promotoria/dashboard';
  if (tipo === 'PSICOLOGA') return '/admin/psicologa-dashboard';
  if (tipo === 'COORDINADOR' || tipo === 'DIRECTOR' || tipo === 'CONTADOR') return '/docente/dashboard';
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
/**
 * Exámenes de herramientas: las notificaciones guardaban /herramientas-examenes/...
 * Docente y admin deben ir a /docente/... y /admin/... para no salir del área ni provocar errores de ruta.
 */
function reescribirUrlHerramientasExamen(url, tipoUsuario) {
  if (!url || !url.startsWith('/herramientas-examenes')) return url;
  const t = String(tipoUsuario || '').toUpperCase();
  const base = '/herramientas-examenes';
  const suffix = url.length > base.length ? url.slice(base.length) : '';
  if (t === 'DOCENTE' || t === 'COORDINADOR' || t === 'DIRECTOR' || t === 'CONTADOR') return `/docente/herramientas/examenes${suffix}`;
  if (t === 'ADMINISTRADOR' || t === 'PROMOTORIA' || t === 'PSICOLOGA') return `/admin/herramientas/examenes${suffix}`;
  return url;
}

export function normalizarUrlNotificacion(notif, user) {
  const payload = parsePayload(notif?.accion_payload);
  let url = (notif?.url_destino != null ? String(notif.url_destino) : '').trim();
  const tipoAccion = String(notif?.accion_tipo || '');

  if (url && url.startsWith('/herramientas-examenes')) {
    url = reescribirUrlHerramientasExamen(url, user?.tipo);
  }

  // Mensajes: el backend a veces guarda /alumno/mensajes; apoderado/docente deben abrir su propia bandeja (evita 403 y cierre de sesión)
  if (user?.tipo === 'APODERADO' && /^\/alumno\/mensajes(\/|[?#]|$)/.test(url)) {
    return url.replace(/^\/alumno\/mensajes/, '/apoderado/mensajes');
  }
  if (user?.tipo === 'DOCENTE' && /^\/alumno\/mensajes(\/|[?#]|$)/.test(url)) {
    return url.replace(/^\/alumno\/mensajes/, '/docente/mensajes');
  }

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

  // Publicación: administración va al menú Publicaciones (no al feed docente por error de url_destino legacy)
  if (
    tipoAccion === 'publicacion'
    && (user?.tipo === 'ADMINISTRADOR' || user?.tipo === 'PROMOTORIA' || user?.tipo === 'PSICOLOGA')
  ) {
    if (
      !url ||
      url.includes('/docente/') ||
      url.includes('/comunicados') ||
      url.includes('#publicaciones')
    ) {
      return '/admin/comunicaciones/publicaciones';
    }
  }

  // Publicación: centralizar en dashboard (feed) aunque en BD siga /comunicados (datos antiguos)
  if (
    tipoAccion === 'publicacion' &&
    url &&
    url.includes('/comunicados')
  ) {
    if (user?.tipo === 'ALUMNO') return '/alumno/dashboard#publicaciones';
    if (user?.tipo === 'APODERADO') return '/apoderado/dashboard#publicaciones';
    if (user?.tipo === 'ADMINISTRADOR' || user?.tipo === 'PROMOTORIA' || user?.tipo === 'PSICOLOGA') {
      return '/admin/comunicaciones/publicaciones';
    }
    return '/docente/dashboard#publicaciones';
  }

  if (tipoAccion === 'supervision_visita' || tipoAccion === 'supervision_evaluacion') {
    const vid = payload.visita_id;
    if (user?.tipo === 'DOCENTE') return urlFichaSupervision('DOCENTE', vid);
    return urlFichaSupervision(user?.tipo, vid);
  }

  if (tipoAccion === 'tardanza_personal') {
    if (user?.tipo === 'ADMINISTRADOR' || user?.tipo === 'PROMOTORIA') {
      return '/admin/herramientas/tardanzas';
    }
  }

  if (tipoAccion === 'tardanza_propia') {
    // Abre Mis Asistencias (modal) vía hash en el dashboard del rol
    if (user?.tipo === 'ADMINISTRADOR' || user?.tipo === 'PROMOTORIA' || user?.tipo === 'PSICOLOGA' || user?.tipo === 'SECRETARIA') {
      return '/admin/dashboard#mis-asistencias';
    }
    if (user?.tipo === 'ASISTENCIA') return '/asistencia/dashboard#mis-asistencias';
    return '/docente/dashboard#mis-asistencias';
  }

  if (
    tipoAccion === 'web_reclamo' ||
    tipoAccion === 'web_sugerencia' ||
    tipoAccion === 'web_contacto' ||
    tipoAccion === 'web_visita' ||
    tipoAccion === 'web_trabaja' ||
    tipoAccion === 'web_admision'
  ) {
    if (user?.tipo === 'ADMINISTRADOR' || user?.tipo === 'PROMOTORIA') {
      if (url) {
        // Migrar URLs antiguas
        return String(url).replace(
          '/admin/comunicaciones/reclamos-sugerencias',
          '/admin/comunicaciones/web'
        );
      }
      const tabByTipo = {
        web_sugerencia: 'sugerencias',
        web_contacto: 'contacto',
        web_visita: 'visitas',
        web_trabaja: 'trabaja',
        web_admision: 'admision',
        web_reclamo: 'reclamos',
      };
      const tab = tabByTipo[tipoAccion] || payload.tab || 'reclamos';
      return `/admin/comunicaciones/web?tab=${tab}`;
    }
  }

  if (tipoAccion === 'encuesta_activa' && payload.encuesta_id) {
    return `/encuestas/responder/${payload.encuesta_id}`;
  }

  if (!url && payload.examen_id != null && tipoAccion.startsWith('herramientas_examen')) {
    const eid = payload.examen_id;
    if (tipoAccion === 'herramientas_examen_activo_admin' || tipoAccion === 'herramientas_examen_completado_admin') {
      url = `/admin/herramientas/examenes/${eid}/estadisticas`;
    } else if (tipoAccion === 'herramientas_examen_activo') {
      url = reescribirUrlHerramientasExamen(`/herramientas-examenes/realizar/${eid}`, user?.tipo);
    } else {
      url = reescribirUrlHerramientasExamen(`/herramientas-examenes/resultado/${eid}`, user?.tipo);
    }
  }

  // Incidencia / tardanza / presentación: si la URL guardada es genérica (dashboard o listado), abrir el modal del hijo.
  if (
    (tipoAccion === 'incidencia' ||
      tipoAccion === 'presentacion_vestimenta' ||
      tipoAccion === 'olvido_qr' ||
      tipoAccion === 'asistencia_alumno') &&
    (user?.tipo === 'APODERADO' || user?.tipo === 'DOCENTE')
  ) {
    const urlCorta = (url || '').split('?')[0];
    const esGenerica =
      !urlCorta ||
      urlCorta === '/apoderado/dashboard' ||
      urlCorta === '/docente/dashboard' ||
      urlCorta === '/apoderado/hijos' ||
      urlCorta === '/docente/hijos';
    if (esGenerica) {
      const qs = new URLSearchParams();
      const abrir =
        tipoAccion === 'asistencia_alumno' && String(payload.tipo_asistencia || '').toUpperCase() !== 'TARDANZA'
          ? 'asistencias'
          : 'incidencias';
      qs.set('abrir', abrir);
      if (payload.alumno_id) qs.set('hijo', String(payload.alumno_id));
      if (payload.incident_id) qs.set('item', `inc-${payload.incident_id}`);
      const base = user?.tipo === 'DOCENTE' ? '/docente/hijos' : '/apoderado/hijos';
      url = `${base}?${qs.toString()}`;
    }
  }

  if (tipoAccion === 'PSICOLOGIA_PIAR') {
    const piarId = payload.piar_id;
    const alumnoId = payload.alumno_id;
    if (user?.tipo === 'DOCENTE' && piarId) return `/docente/psicologia/piar/${piarId}`;
    if (user?.tipo === 'APODERADO' && alumnoId) return `/apoderado/psicologia/${alumnoId}`;
    if (alumnoId) return `/admin/psicologia/alumno/${alumnoId}?tab=piar`;
    if (user?.tipo === 'DOCENTE') return '/docente/psicologia?tab=piar';
    return '/admin/psicologia';
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
    if (user?.tipo === 'ADMINISTRADOR' || user?.tipo === 'PROMOTORIA' || user?.tipo === 'PSICOLOGA') {
      return '/admin/comunicaciones/publicaciones';
    }
    return '/docente/dashboard#publicaciones';
  }

  if (tipoAccion === 'comunicado') {
    if (user?.tipo === 'ALUMNO') return '/alumno/comunicados';
    if (user?.tipo === 'APODERADO') return '/apoderado/comunicados';
    if (user?.tipo === 'ADMINISTRADOR' || user?.tipo === 'PROMOTORIA' || user?.tipo === 'PSICOLOGA') {
      return '/admin/comunicaciones/comunicados';
    }
    return '/docente/comunicados';
  }

  if (tipoAccion === 'mensajes_conexiones' || tipoAccion.includes('mensaje')) {
    if (user?.tipo === 'APODERADO') return '/apoderado/mensajes';
    if (user?.tipo === 'DOCENTE') return '/docente/mensajes';
    if (user?.tipo === 'ADMINISTRADOR' || user?.tipo === 'PROMOTORIA' || user?.tipo === 'PSICOLOGA') {
      return '/admin/mensajes';
    }
    return '/alumno/mensajes';
  }

  if (tipoAccion === 'incidencia' || tipoAccion === 'presentacion_vestimenta' || tipoAccion === 'olvido_qr' || tipoAccion === 'asistencia_alumno') {
    const qs = new URLSearchParams();
    const abrir =
      tipoAccion === 'asistencia_alumno' && String(payload.tipo_asistencia || '').toUpperCase() !== 'TARDANZA'
        ? 'asistencias'
        : 'incidencias';
    qs.set('abrir', abrir);
    if (payload.alumno_id) qs.set('hijo', String(payload.alumno_id));
    if (payload.incident_id) qs.set('item', `inc-${payload.incident_id}`);
    const base = user?.tipo === 'DOCENTE' ? '/docente/hijos' : '/apoderado/hijos';
    return `${base}?${qs.toString()}`;
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

  if (tipoAccion === 'agenda_interna') {
    const eid = payload.evento_id;
    return eid ? `/agenda-interna?id=${eid}` : '/agenda-interna';
  }

  if (tipoAccion === 'reunion') {
    const rid = payload.reunion_id;
    const t = String(user?.tipo || '').toUpperCase();
    if (t === 'ALUMNO') return rid ? `/alumno/reuniones/${rid}` : '/alumno/reuniones';
    if (t === 'APODERADO') return rid ? `/apoderado/reuniones/${rid}` : '/apoderado/reuniones';
    if (t === 'DOCENTE') return rid ? `/docente/herramientas/reuniones/${rid}` : '/docente/herramientas/reuniones';
    return rid ? `/admin/herramientas/reuniones/${rid}` : '/admin/herramientas/reuniones';
  }

  return dashboardPorTipoUsuario(user?.tipo);
}
