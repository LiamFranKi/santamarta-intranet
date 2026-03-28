/**
 * Carga preguntas de un examen con alternativas desde filas reales.
 * Evita GROUP_CONCAT + split(':'), que rompe si la descripción contiene ":" (HTML/CSS) o si GROUP_CONCAT se trunca.
 */

function mapAlternativaRow(a, correctaFormat) {
  const isCorrect =
    a.correcta === 1 ||
    a.correcta === '1' ||
    a.correcta === true ||
    a.correcta === 'SI';
  const base = {
    id: a.id,
    descripcion: a.descripcion != null ? String(a.descripcion) : '',
    orden_posicion: a.orden_posicion,
    par_id: a.par_id,
    zona_drop: a.zona_drop
  };
  if (correctaFormat === 'SI_NO') {
    base.correcta = isCorrect ? 'SI' : 'NO';
  } else {
    base.correcta = isCorrect;
  }
  return base;
}

/**
 * @param {Function} query - (sql, params) => Promise<rows>
 * @param {number} examenId
 * @param {number[]} preguntaIds - vacío = todas las preguntas del examen (orden ASC)
 * @param {'boolean'|'SI_NO'} correctaFormat
 */
async function fetchPreguntasConAlternativas(query, examenId, preguntaIds, correctaFormat = 'boolean') {
  const idsOrden = Array.isArray(preguntaIds) ? preguntaIds : [];

  let preguntasRows;
  if (idsOrden.length > 0) {
    const placeholders = idsOrden.map(() => '?').join(',');
    preguntasRows = await query(
      `SELECT * FROM asignaturas_examenes_preguntas
       WHERE examen_id = ? AND id IN (${placeholders})
       ORDER BY FIELD(id, ${placeholders})`,
      [examenId, ...idsOrden, ...idsOrden]
    );
  } else {
    preguntasRows = await query(
      `SELECT * FROM asignaturas_examenes_preguntas WHERE examen_id = ? ORDER BY orden ASC`,
      [examenId]
    );
  }

  if (!preguntasRows || preguntasRows.length === 0) {
    return [];
  }

  const pids = preguntasRows.map((p) => p.id);
  const inPh = pids.map(() => '?').join(',');
  const allAlts = await query(
    `SELECT * FROM asignaturas_examenes_preguntas_alternativas
     WHERE pregunta_id IN (${inPh})
     ORDER BY pregunta_id ASC, id ASC`,
    pids
  );

  const byPregunta = {};
  for (const a of allAlts || []) {
    const pid = a.pregunta_id;
    if (!byPregunta[pid]) byPregunta[pid] = [];
    byPregunta[pid].push(mapAlternativaRow(a, correctaFormat));
  }

  return preguntasRows.map((p) => ({
    ...p,
    alternativas: byPregunta[p.id] || []
  }));
}

module.exports = { fetchPreguntasConAlternativas };
