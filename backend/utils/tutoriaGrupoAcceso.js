/**
 * Acceso a grupos en rutas /docente/tutoria: tutor del aula o Tutoría General (solo lectura).
 */
const { query } = require('./mysql');
const {
  resolvePersonalId,
  esTutoriaGeneralActivo,
  assertGrupoColegioAnio
} = require('./tutoriaGeneral');

async function assertAccesoTutoriaGrupo(req, grupoId) {
  const gid = parseInt(grupoId, 10);
  const { colegio_id, anio_activo } = req.user || {};
  if (Number.isNaN(gid) || !colegio_id || !anio_activo) return false;

  const personalId = await resolvePersonalId(req);
  if (!personalId) return false;

  if (req._tutoriaAccesoGeneral) {
    const grupo = await assertGrupoColegioAnio(query, gid, colegio_id, anio_activo);
    return !!grupo;
  }

  const rows = await query(
    `SELECT g.id FROM grupos g
     WHERE g.id = ? AND (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?))
       AND g.colegio_id = ? AND g.anio = ?
     LIMIT 1`,
    [gid, personalId, personalId, colegio_id, anio_activo]
  );
  return rows.length > 0;
}

async function verificarAccesoGrupoTutoria(req, res, grupoId) {
  if (req._tutoriaGrupoAccesoOk) return true;
  const ok = await assertAccesoTutoriaGrupo(req, grupoId);
  if (!ok) {
    res.status(403).json({
      error: req._tutoriaAccesoGeneral
        ? 'No tiene acceso a este grupo en Tutoría General'
        : 'No eres tutor de este grupo'
    });
    return false;
  }
  req._tutoriaGrupoAccesoOk = true;
  return true;
}

async function listarGruposTutoriaGeneral(colegioId, anioActivo) {
  return query(
    `SELECT g.*, n.nombre as nivel_nombre, t.nombre as turno_nombre,
            (SELECT COUNT(*)
             FROM matriculas m
             WHERE m.grupo_id = g.id
               AND m.colegio_id = ?
               AND (m.estado = 0)) as total_alumnos
     FROM grupos g
     INNER JOIN niveles n ON n.id = g.nivel_id
     INNER JOIN turnos t ON t.id = g.turno_id
     WHERE g.colegio_id = ? AND g.anio = ?
     ORDER BY n.nombre, g.grado, g.seccion`,
    [colegioId, colegioId, anioActivo]
  );
}

module.exports = {
  assertAccesoTutoriaGrupo,
  verificarAccesoGrupoTutoria,
  listarGruposTutoriaGeneral
};
