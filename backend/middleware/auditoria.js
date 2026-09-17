const { registrarAccion } = require('../utils/auditoria');

/**
 * GETs de polling muy frecuentes: antes cada respuesta disparaba INSERT en auditoría,
 * compitiendo con lecturas/escrituras reales por el mismo pool MySQL.
 */
function esGetAuditoriaAltaFrecuencia(req) {
  if (req.method !== 'GET') return false;
  const pathOnly = String(req.originalUrl || req.url || '').split('?')[0];
  if (pathOnly.includes('modal-pendiente')) return true;
  return /^\/api\/elecciones\/(portal|alumno)\/procesos\/\d+\/resultados$/i.test(pathOnly);
}

/** Sin registro automático en auditoría (reduce carga BD con muchos usuarios; staff sigue auditado). */
const TIPOS_SIN_AUDITORIA_AUTOMATICA = new Set(['ALUMNO', 'APODERADO']);

function omitirAuditoriaAutomaticaPorTipoUsuario(req) {
  const tipo = String(req.user?.tipo || '')
    .trim()
    .toUpperCase();
  return TIPOS_SIN_AUDITORIA_AUTOMATICA.has(tipo);
}

/**
 * Middleware para registrar automáticamente todas las acciones
 */
const middlewareAuditoria = (req, res, next) => {
  const inicioTiempo = Date.now();

  // Guardar el método original de res.json
  const originalJson = res.json.bind(res);

  // Interceptar res.json para registrar después de la respuesta
  res.json = function (data) {
    const duracion = Date.now() - inicioTiempo;

    // Si la ruta tiene skipAudit, no registrar (ya se registró manualmente)
    if (req.skipAudit) {
      return originalJson(data);
    }

    // No registrar automáticamente para rutas de aula-virtual/examenes donde ya registramos manualmente
    if (req.path && req.path.includes('/aula-virtual/examenes') && req.method !== 'GET') {
      return originalJson(data);
    }

    // Los GET no se auditan: duplicaban el pool (auth + matrícula + consulta + INSERT).
    if (req.method === 'GET') {
      return originalJson(data);
    }

    if (esGetAuditoriaAltaFrecuencia(req)) {
      return originalJson(data);
    }

    if (omitirAuditoriaAutomaticaPorTipoUsuario(req)) {
      return originalJson(data);
    }

    // Registrar acción de forma asíncrona (no bloquea la respuesta)
    if (req.user) {
      registrarAccion({
        usuario_id: req.user.usuario_id,
        colegio_id: req.user.colegio_id,
        tipo_usuario: req.user.tipo,
        accion: obtenerAccion(req.method, req.path),
        modulo: obtenerModulo(req.path),
        entidad: obtenerEntidad(req.path),
        entidad_id: obtenerEntidadId(req.params, req.body),
        descripcion: generarDescripcion(req),
        url: req.originalUrl || req.url,
        metodo_http: req.method,
        ip_address: req.ip || req.connection.remoteAddress,
        user_agent: req.get('user-agent'),
        datos_nuevos: req.method !== 'GET' ? sanitizarDatos(req.body) : null,
        resultado: res.statusCode < 400 ? 'EXITOSO' : 'ERROR',
        mensaje_error: res.statusCode >= 400 ? serializarRespuestaAuditoria(data) : null,
        duracion_ms: duracion,
      }).catch(err => {
        console.error('Error en auditoría:', err);
      });
    }

    // Llamar al método original
    return originalJson(data);
  };

  next();
};

/**
 * Determinar la acción basada en método HTTP y ruta
 */
function obtenerAccion(method, path) {
  if (path.includes('/login')) return 'LOGIN';
  if (path.includes('/logout')) return 'LOGOUT';
  
  switch (method) {
    case 'GET': return 'VER';
    case 'POST': return 'CREAR';
    case 'PUT':
    case 'PATCH': return 'EDITAR';
    case 'DELETE': return 'ELIMINAR';
    default: return method;
  }
}

/**
 * Determinar el módulo basado en la ruta
 */
function obtenerModulo(path) {
  if (path.includes('/auth')) return 'AUTENTICACION';
  if (path.includes('/examen')) return 'EXAMENES';
  if (path.includes('/tarea')) return 'PROYECTOS';
  if (path.includes('/tema')) return 'TEMAS';
  if (path.includes('/calificacion') || path.includes('/nota')) return 'CALIFICACIONES';
  if (path.includes('/colegio')) return 'CONFIGURACION';
  if (path.includes('/auditoria')) return 'AUDITORIA';
  return 'SISTEMA';
}

/**
 * Determinar la entidad basada en la ruta
 */
function obtenerEntidad(path) {
  if (path.includes('/examen')) return 'examen';
  if (path.includes('/tarea')) return 'tarea';
  if (path.includes('/tema')) return 'tema';
  if (path.includes('/calificacion') || path.includes('/nota')) return 'calificacion';
  return null;
}

/**
 * Obtener ID de entidad de params o body
 */
function obtenerEntidadId(params, body) {
  return params.id || params.examenId || params.tareaId || params.temaId || body?.id || null;
}

/**
 * Generar descripción de la acción
 */
function generarDescripcion(req) {
  const { method, path, params, body } = req;
  
  if (method === 'GET') {
    return `Consultó ${path}`;
  }
  
  if (method === 'POST') {
    if (path.includes('/examen')) return 'Creó un examen';
    if (path.includes('/tarea')) return 'Creó un proyecto';
    if (path.includes('/tema')) return 'Creó un tema';
    return `Creó recurso en ${path}`;
  }
  
  if (method === 'PUT' || method === 'PATCH') {
    if (path.includes('/examen')) return `Editó examen ID ${params.id}`;
    if (path.includes('/tarea')) return `Editó proyecto ID ${params.id}`;
    if (path.includes('/tema')) return `Editó tema ID ${params.id}`;
    return `Editó recurso en ${path}`;
  }
  
  if (method === 'DELETE') {
    return `Eliminó recurso ID ${params.id} de ${path}`;
  }
  
  return `${method} ${path}`;
}

/**
 * Sanitizar datos sensibles antes de guardar
 */
function sanitizarDatos(data) {
  if (!data || typeof data !== 'object') return data;
  
  const sanitized = { ...data };
  
  // Eliminar campos sensibles
  delete sanitized.password;
  delete sanitized.token;
  delete sanitized.secret;
  
  return sanitized;
}

/** Evita que JSON.stringify en el payload de error tumbe res.json (circular/BigInt). */
function serializarRespuestaAuditoria(data) {
  try {
    if (data == null) return null;
    return JSON.stringify(data);
  } catch {
    try {
      return JSON.stringify({ error: 'payload_no_serializable' });
    } catch {
      return null;
    }
  }
}

module.exports = middlewareAuditoria;

