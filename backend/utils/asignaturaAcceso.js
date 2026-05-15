/**
 * Verificación de acceso a una asignatura: docente titular o staff (admin/promotoría).
 */
function esStaffColegio(tipo) {
  return tipo === 'ADMINISTRADOR' || tipo === 'PROMOTORIA';
}

const FROM_ASIGNATURA_BASE = `
 FROM asignaturas a
 INNER JOIN grupos g ON g.id = a.grupo_id
 LEFT JOIN niveles n ON n.id = g.nivel_id
 LEFT JOIN turnos t ON t.id = g.turno_id
 LEFT JOIN cursos c ON c.id = a.curso_id`;

/**
 * @returns {Promise<object|null>} fila de asignaturas o null
 */
async function fetchAsignaturaConAcceso(query, req, asignaturaId, selectSql = 'a.*') {
  const id = parseInt(asignaturaId, 10);
  if (!Number.isFinite(id)) return null;

  const { colegio_id, anio_activo, tipo, personal_id } = req.user;
  const anio = parseInt(anio_activo, 10);

  if (esStaffColegio(tipo)) {
    const rows = await query(
      `SELECT ${selectSql}${FROM_ASIGNATURA_BASE}
       WHERE a.id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [id, colegio_id, anio]
    );
    return rows && rows[0] ? rows[0] : null;
  }

  if (!personal_id) return null;

  const rows = await query(
    `SELECT ${selectSql}${FROM_ASIGNATURA_BASE}
     WHERE a.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
    [id, personal_id, colegio_id, anio]
  );
  return rows && rows[0] ? rows[0] : null;
}

module.exports = {
  esStaffColegio,
  fetchAsignaturaConAcceso,
};
