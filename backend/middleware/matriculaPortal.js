const { query } = require('../utils/mysql');
const {
  alumnoTieneMatriculaAnioActivoOperativa,
  apoderadoTieneHijoMatriculaAnioActivoOperativa,
  MENSAJE_SIN_MATRICULA
} = require('../utils/matriculaAnioActivo');

const portalCache = new Map();
const PORTAL_TTL_MS = 8000;

function portalCacheKey(tipo, id, colegioId, anio) {
  return `${tipo}:${id}:${colegioId}:${anio}`;
}

function portalDesdeCache(key) {
  const hit = portalCache.get(key);
  if (!hit || hit.exp < Date.now()) {
    portalCache.delete(key);
    return null;
  }
  return hit.ok;
}

function guardarPortalCache(key, ok) {
  if (portalCache.size > 4000) {
    const now = Date.now();
    for (const [k, v] of portalCache) {
      if (v.exp < now) portalCache.delete(k);
    }
    if (portalCache.size > 4000) portalCache.clear();
  }
  portalCache.set(key, { ok: Boolean(ok), exp: Date.now() + PORTAL_TTL_MS });
}

/**
 * Tras JWT: alumno/apoderado deben tener matrícula operativa en anio_activo del token.
 * Docentes y personal no pasan por este middleware.
 */
async function requireMatriculaPortalActiva(req, res, next) {
  try {
    const { tipo, alumno_id, apoderado_id, colegio_id, anio_activo } = req.user || {};
    const anio = anio_activo != null ? parseInt(String(anio_activo), 10) : null;

    if (!colegio_id || !anio || Number.isNaN(anio)) {
      return res.status(403).json({
        error: MENSAJE_SIN_MATRICULA,
        code: 'SIN_MATRICULA_ACTIVA'
      });
    }

    if (tipo === 'ALUMNO') {
      const key = portalCacheKey('ALUMNO', alumno_id, colegio_id, anio);
      let ok = portalDesdeCache(key);
      if (ok == null) {
        ok = await alumnoTieneMatriculaAnioActivoOperativa(query, alumno_id, colegio_id, anio);
        guardarPortalCache(key, ok);
      }
      if (!ok) {
        return res.status(403).json({
          error: MENSAJE_SIN_MATRICULA,
          code: 'SIN_MATRICULA_ACTIVA'
        });
      }
      return next();
    }

    if (tipo === 'APODERADO') {
      const key = portalCacheKey('APODERADO', apoderado_id, colegio_id, anio);
      let ok = portalDesdeCache(key);
      if (ok == null) {
        ok = await apoderadoTieneHijoMatriculaAnioActivoOperativa(
          query,
          apoderado_id,
          colegio_id,
          anio
        );
        guardarPortalCache(key, ok);
      }
      if (!ok) {
        return res.status(403).json({
          error: MENSAJE_SIN_MATRICULA,
          code: 'SIN_MATRICULA_ACTIVA'
        });
      }
      return next();
    }

    return next();
  } catch (error) {
    console.error('[requireMatriculaPortalActiva]', error.message || error);
    if (/queue limit reached/i.test(String(error?.message || ''))) {
      return res.status(503).json({
        error: 'El servidor está ocupado. Intente de nuevo en un momento.',
        code: 'MYSQL_BUSY',
      });
    }
    return res.status(500).json({ error: 'Error al validar matrícula' });
  }
}

module.exports = { requireMatriculaPortalActiva };
