/**
 * Finaliza un intento de examen calificando respuestas (líneas + JSON legacy).
 */
const phpSerialize = require('php-serialize');
const { fetchPreguntasConAlternativas } = require('./examenPreguntasAlternativas');
const { calificarExamenPrueba } = require('./examenCalificacion');
const { cargarRespuestasMergedDePrueba } = require('./examenRespuestasLinea');

function parsePreguntaIdsVisibles(pruebaRow) {
  if (!pruebaRow?.preguntas || String(pruebaRow.preguntas).trim() === '') return [];
  try {
    const decoded = Buffer.from(pruebaRow.preguntas, 'base64').toString('utf-8');
    const ids = phpSerialize.unserialize(decoded) || [];
    return Array.isArray(ids) ? ids.map((id) => parseInt(id, 10)).filter((n) => !Number.isNaN(n)) : [];
  } catch (_) {
    return [];
  }
}

function filtrarPreguntasVisibles(preguntasConAlternativas, preguntaIdsVisibles) {
  const idsSet = new Set(preguntaIdsVisibles);
  let preguntas =
    idsSet.size > 0
      ? preguntasConAlternativas.filter((p) => idsSet.has(parseInt(p.id, 10)))
      : preguntasConAlternativas;
  if (idsSet.size > 0 && preguntas.length === 0) {
    preguntas = preguntasConAlternativas;
  }
  return preguntas;
}

/**
 * @returns {{ puntajeFinal, correctas, incorrectas, detalles, respuestas, preguntas }}
 */
async function finalizarPruebaConCalificacion({ query, execute, pruebaRow, examenId }) {
  const examenRows = await query(`SELECT * FROM asignaturas_examenes WHERE id = ?`, [examenId]);
  if (!examenRows.length) {
    throw Object.assign(new Error('Examen no encontrado'), { status: 404 });
  }
  const examenRow = examenRows[0];

  const respuestas = await cargarRespuestasMergedDePrueba(query, pruebaRow);
  const preguntasConAlternativas = await fetchPreguntasConAlternativas(query, examenId, [], 'SI_NO');
  const preguntaIdsVisibles = parsePreguntaIdsVisibles(pruebaRow);
  const preguntas = filtrarPreguntasVisibles(preguntasConAlternativas, preguntaIdsVisibles);

  const { puntajeFinal, correctas, incorrectas, detalles } = calificarExamenPrueba(
    examenRow,
    preguntas,
    respuestas
  );

  return {
    examenRow,
    preguntas,
    respuestas,
    puntajeFinal,
    correctas,
    incorrectas,
    detalles
  };
}

async function aplicarEstadoFinalizadoPrueba(execute, pruebaId, calificacion, opciones = {}) {
  const {
    finalizado_por_salida = 'NO',
    motivo_cierre = null,
    fecha_cierre_forzado = false
  } = opciones;

  const sets = [
    `estado = 'FINALIZADA'`,
    `puntaje = ?`,
    `correctas = ?`,
    `incorrectas = ?`
  ];
  const params = [
    calificacion.puntajeFinal,
    calificacion.correctas,
    calificacion.incorrectas
  ];

  if (finalizado_por_salida === 'SI') {
    sets.push(`finalizado_por_salida = 'SI'`);
  }
  if (motivo_cierre) {
    sets.push(`motivo_cierre = ?`);
    params.push(motivo_cierre);
  }
  if (fecha_cierre_forzado) {
    sets.push(`fecha_cierre_forzado = NOW()`);
  }

  params.push(pruebaId);
  await execute(
    `UPDATE asignaturas_examenes_pruebas SET ${sets.join(', ')} WHERE id = ?`,
    params
  );
}

module.exports = {
  parsePreguntaIdsVisibles,
  filtrarPreguntasVisibles,
  finalizarPruebaConCalificacion,
  aplicarEstadoFinalizadoPrueba
};
