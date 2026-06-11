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
    `SELECT g.*, n.nombre as nivel_nombre, n.tipo_calificacion, t.nombre as turno_nombre,
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

/**
 * Devuelve fila de grupo: tutor del aula o, en Tutoría General, cualquier grupo del colegio/año.
 * @param {object} req
 * @param {string|number} grupoId
 * @param {object[]} [filasTutor] resultado de query tutor_id
 * @param {{ extraFields?: string, withTurno?: boolean }} [opts]
 */
async function filaGrupoTutoriaOGeneral(req, grupoId, filasTutor = [], opts = {}) {
  if (filasTutor && filasTutor.length > 0) return filasTutor[0];
  if (!req._tutoriaGrupoAccesoOk) return null;

  const { colegio_id, anio_activo } = req.user || {};
  const gid = parseInt(grupoId, 10);
  if (!colegio_id || !anio_activo || Number.isNaN(gid)) return null;

  const withTurno = opts.withTurno !== false;
  let sql = 'SELECT g.*, n.nombre as nivel_nombre';
  if (withTurno) sql += ', t.nombre as turno_nombre';
  if (opts.extraFields) sql += `, ${opts.extraFields}`;
  sql += ' FROM grupos g INNER JOIN niveles n ON n.id = g.nivel_id';
  if (withTurno) sql += ' INNER JOIN turnos t ON t.id = g.turno_id';
  sql += ' WHERE g.id = ? AND g.colegio_id = ? AND g.anio = ? LIMIT 1';

  const rows = await query(sql, [gid, colegio_id, anio_activo]);
  return rows[0] || null;
}

async function esTutoriaGeneralUsuario(req) {
  const { colegio_id } = req.user || {};
  const personalId = await resolvePersonalId(req);
  if (!personalId || !colegio_id) return false;
  return esTutoriaGeneralActivo(personalId, colegio_id);
}

module.exports = {
  assertAccesoTutoriaGrupo,
  verificarAccesoGrupoTutoria,
  listarGruposTutoriaGeneral,
  filaGrupoTutoriaOGeneral,
  esTutoriaGeneralUsuario
};
