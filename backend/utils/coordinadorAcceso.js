function esCoordinador(tipo) {
  return String(tipo || '').toUpperCase() === 'COORDINADOR';
}

function esMetodoLectura(method) {
  const m = String(method || '').toUpperCase();
  return m === 'GET' || m === 'HEAD' || m === 'OPTIONS';
}

function pathMatch(path, prefixes) {
  const p = String(path || '');
  return prefixes.some((pre) => p === pre || p.startsWith(`${pre}/`));
}

/** /api/admin (admin.routes.js): perfil, institucional (GET), documentos (GET), comunicaciones. */
function coordinadorPuedeAdminCore(path, method) {
  const p = String(path || '');
  const lectura = esMetodoLectura(method);
  if (pathMatch(p, ['/perfil'])) return true;
  if (pathMatch(p, ['/institucional']) && lectura) return true;
  if (pathMatch(p, ['/gestion-documentos']) && lectura) return true;
  if (pathMatch(p, ['/conexiones'])) return true;
  if (pathMatch(p, ['/estadisticas']) && lectura) return true;
  if (p === '/notificaciones' || p.startsWith('/notificaciones/')) {
    if (lectura) return true;
    if (String(method).toUpperCase() === 'PUT' && p.includes('marcar-leido')) return true;
    return false;
  }
  if (pathMatch(p, ['/eventos']) && lectura) return true;
  return false;
}

/** /api/docente: dashboard, hijos, comunicaciones (crear), documentos solo GET. */
function coordinadorPuedeDocente(path, method) {
  const p = String(path || '');
  const lectura = esMetodoLectura(method);
  if (pathMatch(p, ['/documentos-gestion'])) return lectura;
  if (pathMatch(p, ['/aula-virtual'])) return lectura;
  if (pathMatch(p, ['/cursos'])) {
    if (lectura) return true;
    if (p.includes('/aula-virtual') || p.includes('/copiar-contenido')) return false;
    return true;
  }
  return pathMatch(p, [
    '/dashboard',
    '/roles-adicionales',
    '/tiene-asignaciones',
    '/comunicados',
    '/actividades',
    '/publicaciones',
    '/mensajes',
    '/hijos',
    '/grupos',
    '/alumnos',
    '/conexiones',
  ]);
}

/**
 * /api/admin/academico: consulta de catálogo; en grados/grupos todos los procesos
 * salvo editar o borrar el grupo.
 */
function coordinadorPuedeAcademico(path, method) {
  const p = String(path || '');
  const m = String(method || '').toUpperCase();
  const lectura = esMetodoLectura(m);
  if (p === '/meta') return lectura;
  if (pathMatch(p, ['/niveles', '/cursos', '/asignaturas', '/areas'])) return lectura;
  if (p === '/grupos' || p === '/grados') {
    return lectura || m === 'POST';
  }
  if (p === '/grupos/upload-horario') return true;
  if (/^\/grupos\/\d+$/.test(p) || /^\/grados\/\d+$/.test(p)) return lectura;
  if (p.startsWith('/grupos/') || p.startsWith('/grados/')) return true;
  return false;
}

/** Middleware: administrador todo; coordinador solo GET/HEAD. */
function requireAdminOCoordinadorGet(req, res, next) {
  const tipo = req.user?.tipo;
  if (tipo === 'ADMINISTRADOR') return next();
  if (esCoordinador(tipo) && esMetodoLectura(req.method)) return next();
  return res.status(403).json({ error: 'No tienes permisos para modificar este módulo.' });
}

module.exports = {
  esCoordinador,
  esMetodoLectura,
  pathMatch,
  coordinadorPuedeAdminCore,
  coordinadorPuedeDocente,
  coordinadorPuedeAcademico,
  requireAdminOCoordinadorGet,
};
