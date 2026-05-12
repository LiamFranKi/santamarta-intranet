/**
 * Apreciaciones / recomendaciones por matrícula (campo matriculas.recomendaciones, PHP serialize + base64).
 * Compartido por tutoría docente y administración académica.
 */
const phpSerialize = require('php-serialize');

/**
 * @param {Function} query
 * @param {number|string} grupoId
 * @param {number} colegio_id
 * @returns {Promise<object|null>} fila grupo con nivel_nombre o null
 */
async function fetchGrupoRecomendacionesContext(query, grupoId, colegio_id) {
  const grupoRows = await query(
    `SELECT g.*, n.nombre as nivel_nombre FROM grupos g
     INNER JOIN niveles n ON n.id = g.nivel_id
     WHERE g.id = ? AND g.colegio_id = ?`,
    [grupoId, colegio_id]
  );
  return grupoRows.length ? grupoRows[0] : null;
}

function textoRecomendacionPorCiclo(recomendacionesBlob, ciclo) {
  let descripcion = '';
  if (!recomendacionesBlob) return descripcion;
  try {
    const decoded = Buffer.from(recomendacionesBlob, 'base64').toString('binary');
    const deserialized = phpSerialize.unserialize(decoded);
    if (deserialized && deserialized[ciclo] && deserialized[ciclo].descripcion) {
      descripcion = deserialized[ciclo].descripcion || '';
    }
  } catch (e) {
    /* ignorar formato inválido */
  }
  return descripcion;
}

/**
 * Lista alumnos del grupo con texto de recomendación para un bimestre.
 * @param {Function} query
 * @param {{ grupoId: number|string, colegio_id: number, ciclo: number }} p
 */
async function listarAlumnosRecomendacionesPorGrupo(query, { grupoId, colegio_id, ciclo }) {
  const matriculas = await query(
    `SELECT m.id as matricula_id, a.id as alumno_id,
            CONCAT(a.apellido_paterno, ' ', a.apellido_materno, ', ', a.nombres) as nombre_completo,
            m.recomendaciones
     FROM matriculas m INNER JOIN alumnos a ON a.id = m.alumno_id
     WHERE m.grupo_id = ? AND m.colegio_id = ? AND (m.estado = 0)
     ORDER BY a.apellido_paterno, a.apellido_materno, a.nombres`,
    [grupoId, colegio_id]
  );

  return matriculas.map((m, i) => ({
    numero: i + 1,
    matricula_id: m.matricula_id,
    nombre_completo: m.nombre_completo,
    recomendacion: textoRecomendacionPorCiclo(m.recomendaciones, ciclo),
  }));
}

/**
 * @param {Function} query
 * @param {Function} execute
 * @param {{ grupoId: number|string, cicloInt: number, recomendaciones: Record<string, string>, personalActor: number }} p
 */
async function guardarRecomendacionesPorGrupo(query, execute, { grupoId, cicloInt, recomendaciones, personalActor }) {
  const actor = Number.isFinite(parseInt(String(personalActor), 10)) ? parseInt(String(personalActor), 10) : 0;
  for (const [matriculaId, descripcion] of Object.entries(recomendaciones || {})) {
    const rows = await query(`SELECT id, recomendaciones FROM matriculas WHERE id = ? AND grupo_id = ?`, [
      matriculaId,
      grupoId,
    ]);
    if (rows.length === 0) continue;

    let rec = {};
    if (rows[0].recomendaciones) {
      try {
        const decoded = Buffer.from(rows[0].recomendaciones, 'base64').toString('binary');
        rec = phpSerialize.unserialize(decoded) || {};
      } catch (e) {
        /* mantener rec vacío */
      }
    }
    rec[cicloInt] = { descripcion: String(descripcion || '').trim(), personal: actor };
    const serialized = phpSerialize.serialize(rec);
    const encoded = Buffer.from(serialized, 'binary').toString('base64');
    await execute(`UPDATE matriculas SET recomendaciones = ? WHERE id = ?`, [encoded, matriculaId]);
  }
}

module.exports = {
  fetchGrupoRecomendacionesContext,
  listarAlumnosRecomendacionesPorGrupo,
  guardarRecomendacionesPorGrupo,
};
