/**
 * Nota de Speaking puesta por el docente (audio o en vivo).
 */
const { persistirRespuestaPregunta } = require('./examenRespuestasLinea');
const { finalizarPruebaConCalificacion, aplicarEstadoFinalizadoPrueba } = require('./examenFinalizarPrueba');
const {
  esExamenHibrido,
  esPreguntaSpeaking,
  parseSpeakingRespuesta,
  puntosMaxSpeaking
} = require('./examenTipo');

async function aplicarNotaSpeaking({
  query,
  execute,
  pruebaRow,
  preguntaRow,
  examenRow,
  puntos,
  comentario,
  personalId
}) {
  if (!esExamenHibrido(examenRow.tipo)) {
    const err = new Error('El Speaking solo se califica en exámenes tipo HÍBRIDO.');
    err.status = 400;
    throw err;
  }
  if (!esPreguntaSpeaking(preguntaRow.tipo)) {
    const err = new Error('Esa pregunta no es de tipo Speaking.');
    err.status = 400;
    throw err;
  }

  const maxPts = puntosMaxSpeaking(preguntaRow, examenRow);
  const nota = Number(puntos);
  if (!Number.isFinite(nota) || nota < 0) {
    const err = new Error('La nota de Speaking no es válida.');
    err.status = 400;
    throw err;
  }
  if (maxPts > 0 && nota > maxPts) {
    const err = new Error(`La nota no puede ser mayor a ${maxPts} punto(s).`);
    err.status = 400;
    throw err;
  }

  const previa = parseSpeakingRespuesta(null);
  const merged = {
    modo: previa.modo || examenRow.speaking_modo || 'AUDIO',
    audio: previa.audio,
    visto: true,
    nota_docente: nota,
    comentario: comentario ? String(comentario).slice(0, 500) : null,
    calificado_por: personalId || null
  };

  const { cargarRespuestasMergedDePrueba } = require('./examenRespuestasLinea');
  const actual = await cargarRespuestasMergedDePrueba(query, pruebaRow);
  const prevSp = parseSpeakingRespuesta(actual[String(preguntaRow.id)] || actual[preguntaRow.id]);
  merged.audio = prevSp.audio || merged.audio;
  merged.modo = prevSp.modo || merged.modo;

  await persistirRespuestaPregunta({
    query,
    execute,
    pruebaId: pruebaRow.id,
    preguntaId: preguntaRow.id,
    respuesta: merged,
    examenRow,
    preguntaRow
  });

  const pruebaFreshRows = await query(
    `SELECT * FROM asignaturas_examenes_pruebas WHERE id = ? LIMIT 1`,
    [pruebaRow.id]
  );
  const calificacion = await finalizarPruebaConCalificacion({
    query,
    execute,
    pruebaRow: pruebaFreshRows[0] || pruebaRow,
    examenId: examenRow.id
  });

  const estadoActual = String((pruebaFreshRows[0] || pruebaRow).estado || '').toUpperCase();
  if (estadoActual === 'FINALIZADA') {
    await aplicarEstadoFinalizadoPrueba(execute, pruebaRow.id, calificacion);
  } else {
    try {
      await execute(
        `UPDATE asignaturas_examenes_pruebas
         SET puntaje = ?, correctas = ?, incorrectas = ?, pendiente_speaking = ?
         WHERE id = ?`,
        [
          calificacion.puntajeFinal,
          calificacion.correctas,
          calificacion.incorrectas,
          calificacion.pendienteSpeaking ? 1 : 0,
          pruebaRow.id
        ]
      );
    } catch (err) {
      if (err && err.code === 'ER_BAD_FIELD_ERROR') {
        await execute(
          `UPDATE asignaturas_examenes_pruebas
           SET puntaje = ?, correctas = ?, incorrectas = ?
           WHERE id = ?`,
          [
            calificacion.puntajeFinal,
            calificacion.correctas,
            calificacion.incorrectas,
            pruebaRow.id
          ]
        );
      } else {
        throw err;
      }
    }
  }

  return calificacion;
}

module.exports = { aplicarNotaSpeaking };
