/**
 * Tutoría General: permiso aditivo sobre personal (no cambia usuarios.tipo).
 */
const { query } = require('./mysql');

async function resolvePersonalId(req) {
  let personalId = req.user?.personal_id;
  const colegio_id = req.user?.colegio_id;
  if (!personalId && req.user?.usuario_id && colegio_id) {
    const urow = await query(
      `SELECT personal_id FROM usuarios WHERE id = ? AND colegio_id = ? LIMIT 1`,
      [req.user.usuario_id, colegio_id]
    );
    if (urow.length && urow[0].personal_id) {
      personalId = urow[0].personal_id;
    }
  }
  return personalId ? parseInt(personalId, 10) : null;
}

async function esTutoriaGeneralActivo(personalId, colegioId) {
  const pid = parseInt(personalId, 10);
  const cid = parseInt(colegioId, 10);
  if (!pid || !cid) return false;
  try {
    const rows = await query(
      `SELECT 1 FROM tutoria_general_personal
       WHERE colegio_id = ? AND personal_id = ? AND activo = 1
       LIMIT 1`,
      [cid, pid]
    );
    return rows.length > 0;
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') return false;
    throw e;
  }
}

async function assertGrupoColegioAnio(queryFn, grupoId, colegioId, anioActivo) {
  const rows = await queryFn(
    `SELECT g.id, g.grado, g.seccion, g.nivel_id, g.anio
     FROM grupos g
     WHERE g.id = ? AND g.colegio_id = ? AND g.anio = ?
     LIMIT 1`,
    [grupoId, colegioId, anioActivo]
  );
  return rows[0] || null;
}

async function middlewareTutoriaGeneral(req, res, next) {
  try {
    const personalId = await resolvePersonalId(req);
    if (!personalId) {
      return res.status(404).json({ error: 'Personal no encontrado para Tutoría General' });
    }
    const activo = await esTutoriaGeneralActivo(personalId, req.user.colegio_id);
    if (!activo) {
      return res.status(403).json({ error: 'No tiene permiso de Tutoría General' });
    }
    req.tutoriaGeneralPersonalId = personalId;
    next();
  } catch (e) {
    console.error('[tutoriaGeneral] middleware', e);
    res.status(500).json({ error: 'Error verificando Tutoría General' });
  }
}

function middlewareSoloLectura(req, res, next) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return res.status(403).json({ error: 'Tutoría General es solo lectura / supervisión' });
  }
  next();
}

module.exports = {
  resolvePersonalId,
  esTutoriaGeneralActivo,
  assertGrupoColegioAnio,
  middlewareTutoriaGeneral,
  middlewareSoloLectura
};
