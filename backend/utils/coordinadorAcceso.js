function esCoordinador(tipo) {
  return String(tipo || '').toUpperCase() === 'COORDINADOR';
}

/** COORDINADOR, DIRECTOR y CONTADOR: mismo menú, dashboard y permisos de paquete. PROMOTORIA no entra. */
function esPaqueteCoordinador(tipo) {
  const t = String(tipo || '').toUpperCase();
  return t === 'COORDINADOR' || t === 'DIRECTOR' || t === 'CONTADOR';
}

/** Catálogo académico: Coordinador y Director. El Contador no entra. */
function esPaqueteAcademico(tipo) {
  const t = String(tipo || '').toUpperCase();
  return t === 'COORDINADOR' || t === 'DIRECTOR';
}

function esMetodoLectura(method) {
  const m = String(method || '').toUpperCase();
  return m === 'GET' || m === 'HEAD' || m === 'OPTIONS';
}

function pathMatch(path, prefixes) {
  const p = String(path || '');
  return prefixes.some((pre) => p === pre || p.startsWith(`${pre}/`));
}

/** COORDINADOR: GET/PUT de Configuración General solo para el card Pagos. */
function coordinadorPuedeConfigPagos(path, method) {
  const p = String(path || '');
  const m = String(method || '').toUpperCase();
  return p === '/configuracion' && (m === 'GET' || m === 'HEAD' || m === 'OPTIONS' || m === 'PUT');
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
  if (pathMatch(p, ['/aula-virtual'])) return true;
  if (pathMatch(p, ['/cursos'])) return true;
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
 * /api/admin/academico: mismo acceso que el administrador (catálogo y procesos).
 */
function coordinadorPuedeAcademico(_path, _method) {
  return true;
}

/** Middleware: administrador todo; coordinador solo GET/HEAD. */
function requireAdminOCoordinadorGet(req, res, next) {
  const tipo = req.user?.tipo;
  if (tipo === 'ADMINISTRADOR') return next();
  if (esPaqueteCoordinador(tipo) && esMetodoLectura(req.method)) return next();
  return res.status(403).json({ error: 'No tienes permisos para modificar este módulo.' });
}

module.exports = {
  esCoordinador,
  esPaqueteCoordinador,
  esPaqueteAcademico,
  esMetodoLectura,
  pathMatch,
  coordinadorPuedeAdminCore,
  coordinadorPuedeConfigPagos,
  coordinadorPuedeDocente,
  coordinadorPuedeAcademico,
  requireAdminOCoordinadorGet,
};
