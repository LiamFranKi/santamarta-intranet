const { query } = require('../utils/mysql');
const {
  alumnoTieneMatriculaAnioActivoOperativa,
  apoderadoTieneHijoMatriculaAnioActivoOperativa,
  MENSAJE_SIN_MATRICULA
} = require('../utils/matriculaAnioActivo');

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
      const ok = await alumnoTieneMatriculaAnioActivoOperativa(query, alumno_id, colegio_id, anio);
      if (!ok) {
        return res.status(403).json({
          error: MENSAJE_SIN_MATRICULA,
          code: 'SIN_MATRICULA_ACTIVA'
        });
      }
      return next();
    }

    if (tipo === 'APODERADO') {
      const ok = await apoderadoTieneHijoMatriculaAnioActivoOperativa(
        query,
        apoderado_id,
        colegio_id,
        anio
      );
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
    console.error('[requireMatriculaPortalActiva]', error);
    return res.status(500).json({ error: 'Error al validar matrícula' });
  }
}

module.exports = { requireMatriculaPortalActiva };
