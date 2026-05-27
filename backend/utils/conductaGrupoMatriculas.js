const ASIGNATURA_CONDUCTA = -101;

async function fetchGrupoConductaContext(query, grupoId, colegio_id) {
  const rows = await query(
    `SELECT g.*, n.nombre as nivel_nombre FROM grupos g
     INNER JOIN niveles n ON n.id = g.nivel_id
     WHERE g.id = ? AND g.colegio_id = ? LIMIT 1`,
    [grupoId, colegio_id]
  );
  return rows[0] || null;
}

async function listarAlumnosConductaPorGrupo(query, { grupoId, colegio_id, ciclo }) {
  const cicloInt = parseInt(ciclo, 10) || 1;
  const matriculas = await query(
    `SELECT m.id as matricula_id, a.id as alumno_id,
            CONCAT(a.apellido_paterno, ' ', a.apellido_materno, ', ', a.nombres) as nombre_completo
     FROM matriculas m INNER JOIN alumnos a ON a.id = m.alumno_id
     WHERE m.grupo_id = ? AND m.colegio_id = ? AND (m.estado = 0)
     ORDER BY a.apellido_paterno, a.apellido_materno, a.nombres`,
    [grupoId, colegio_id]
  );

  if (!matriculas.length) {
    return { lista: [], ciclo: cicloInt };
  }

  const promedios = await query(
    `SELECT matricula_id, promedio FROM promedios
     WHERE asignatura_id = ? AND ciclo = ? AND matricula_id IN (${matriculas.map(() => '?').join(',')})`,
    [ASIGNATURA_CONDUCTA, cicloInt, ...matriculas.map((m) => m.matricula_id)]
  );
  const mapaProm = {};
  promedios.forEach((p) => {
    mapaProm[p.matricula_id] = p.promedio;
  });

  const lista = matriculas.map((m, i) => {
    const nota = mapaProm[m.matricula_id];
    return {
      numero: i + 1,
      matricula_id: m.matricula_id,
      nombre_completo: m.nombre_completo,
      nota_conducta: nota !== undefined && nota !== null && nota !== '' ? String(nota) : '20',
    };
  });

  return { lista, ciclo: cicloInt };
}

async function guardarConductaPorGrupo(execute, { cicloInt, notas }) {
  for (const [matriculaId, nota] of Object.entries(notas || {})) {
    const val = String(nota || '20').trim();
    if (!/^\d{1,2}$/.test(val) || parseInt(val, 10) < 0 || parseInt(val, 10) > 20) continue;

    await execute(
      `DELETE FROM promedios WHERE matricula_id = ? AND asignatura_id = ? AND ciclo = ?`,
      [matriculaId, ASIGNATURA_CONDUCTA, cicloInt]
    );
    await execute(
      `INSERT INTO promedios (matricula_id, asignatura_id, ciclo, promedio) VALUES (?, ?, ?, ?)`,
      [matriculaId, ASIGNATURA_CONDUCTA, cicloInt, val]
    );
  }
}

module.exports = {
  ASIGNATURA_CONDUCTA,
  fetchGrupoConductaContext,
  listarAlumnosConductaPorGrupo,
  guardarConductaPorGrupo,
};
