/**
 * Finaliza un intento de examen calificando respuestas (líneas + JSON legacy).
 */
const { fetchPreguntasConAlternativas } = require('./examenPreguntasAlternativas');
const { calificarExamenPrueba } = require('./examenCalificacion');
const { cargarRespuestasMergedDePrueba } = require('./examenRespuestasLinea');
const { parseLayoutFromPruebaRow } = require('./examenLayoutPrueba');

function parsePreguntaIdsVisibles(pruebaRow) {
  const layout = parseLayoutFromPruebaRow(pruebaRow);
  if (layout?.pregunta_ids?.length) return layout.pregunta_ids;
  return [];
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
 * @returns {{ puntajeFinal, correctas, incorrectas, detalles, respuestas, preguntas, puntosObtenidos, puntosTotal }}
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

  const { puntajeFinal, correctas, incorrectas, detalles, puntosObtenidos, puntosTotal, pendienteSpeaking } =
    calificarExamenPrueba(examenRow, preguntas, respuestas);

  return {
    examenRow,
    preguntas,
    respuestas,
    puntajeFinal,
    correctas,
    incorrectas,
    detalles,
    puntosObtenidos,
    puntosTotal,
    pendienteSpeaking: !!pendienteSpeaking
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
    `incorrectas = ?`,
    `pendiente_speaking = ?`
  ];
  const params = [
    calificacion.puntajeFinal,
    calificacion.correctas,
    calificacion.incorrectas,
    calificacion.pendienteSpeaking ? 1 : 0
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
  try {
    await execute(
      `UPDATE asignaturas_examenes_pruebas SET ${sets.join(', ')} WHERE id = ?`,
      params
    );
  } catch (err) {
    if (err && err.code === 'ER_BAD_FIELD_ERROR') {
      const setsLegacy = sets.filter((s) => !s.includes('pendiente_speaking'));
      const paramsLegacy = params.filter((_, i) => i !== 3);
      await execute(
        `UPDATE asignaturas_examenes_pruebas SET ${setsLegacy.join(', ')} WHERE id = ?`,
        paramsLegacy
      );
      return;
    }
    throw err;
  }
}

module.exports = {
  parsePreguntaIdsVisibles,
  filtrarPreguntasVisibles,
  finalizarPruebaConCalificacion,
  aplicarEstadoFinalizadoPrueba
};
