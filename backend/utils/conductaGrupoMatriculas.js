const {
  ASIGNATURA_CONDUCTA,
  obtenerRangoBimestre,
  contarIncidenciasMatriculaEnRango,
  notaDesdeCantidad,
  persistirNotaConducta,
  backfillVestimentaAIncidenciasGrupo,
} = require('./conductaIncidenciasBimestre');

async function fetchGrupoConductaContext(query, grupoId, colegio_id) {
  const rows = await query(
    `SELECT g.*, n.nombre as nivel_nombre FROM grupos g
     INNER JOIN niveles n ON n.id = g.nivel_id
     WHERE g.id = ? AND g.colegio_id = ? LIMIT 1`,
    [grupoId, colegio_id]
  );
  return rows[0] || null;
}

/**
 * Lista alumnos con nota de conducta automática del bimestre (20 − incidencias).
 * Persiste el promedio calculado para libretas / reportes.
 */
async function listarAlumnosConductaPorGrupo(query, execute, { grupoId, colegio_id, ciclo }) {
  const cicloInt = parseInt(ciclo, 10) || 1;
  const grupo = await fetchGrupoConductaContext(query, grupoId, colegio_id);
  const anio = grupo?.anio || new Date().getFullYear();
  const rango = await obtenerRangoBimestre(query, colegio_id, cicloInt, anio);

  if (execute) {
    try {
      await backfillVestimentaAIncidenciasGrupo(query, execute, {
        grupoId,
        colegio_id,
        anio,
        desde: rango.desde,
        hasta: rango.hasta,
      });
    } catch (e) {
      console.warn('[conducta] backfill vestimenta:', e.message);
    }
  }

  const matriculas = await query(
    `SELECT m.id as matricula_id, a.id as alumno_id,
            CONCAT(a.apellido_paterno, ' ', a.apellido_materno, ', ', a.nombres) as nombre_completo
     FROM matriculas m INNER JOIN alumnos a ON a.id = m.alumno_id
     WHERE m.grupo_id = ? AND m.colegio_id = ? AND (m.estado = 0)
     ORDER BY a.apellido_paterno, a.apellido_materno, a.nombres`,
    [grupoId, colegio_id]
  );

  if (!matriculas.length) {
    return {
      lista: [],
      ciclo: cicloInt,
      fecha_desde: rango.desde,
      fecha_hasta: rango.hasta,
    };
  }

  const lista = [];
  for (let i = 0; i < matriculas.length; i += 1) {
    const m = matriculas[i];
    const cant = await contarIncidenciasMatriculaEnRango(
      query,
      m.matricula_id,
      rango.desde,
      rango.hasta
    );
    const nota = notaDesdeCantidad(cant);
    if (execute) {
      try {
        await persistirNotaConducta(execute, m.matricula_id, cicloInt, nota);
      } catch (e) {
        console.warn('[conducta] persistir nota:', e.message);
      }
    }
    lista.push({
      numero: i + 1,
      matricula_id: m.matricula_id,
      alumno_id: m.alumno_id,
      nombre_completo: m.nombre_completo,
      nota_conducta: String(nota),
      total_incidencias: cant,
    });
  }

  return {
    lista,
    ciclo: cicloInt,
    fecha_desde: rango.desde,
    fecha_hasta: rango.hasta,
  };
}

/** @deprecated Manual save — conducta es automática; se mantiene por compatibilidad API. */
async function guardarConductaPorGrupo(execute, { cicloInt, notas }) {
  for (const [matriculaId, nota] of Object.entries(notas || {})) {
    const val = String(nota || '20').trim();
    if (!/^\d{1,2}$/.test(val) || parseInt(val, 10) < 0 || parseInt(val, 10) > 20) continue;
    await persistirNotaConducta(execute, matriculaId, cicloInt, val);
  }
}

module.exports = {
  ASIGNATURA_CONDUCTA,
  fetchGrupoConductaContext,
  listarAlumnosConductaPorGrupo,
  guardarConductaPorGrupo,
};
