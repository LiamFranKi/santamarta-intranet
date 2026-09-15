/**
 * Respuestas por línea (pregunta) en exámenes aula virtual.
 * Retrocompatible: fusiona con JSON legacy en asignaturas_examenes_pruebas.respuestas.
 */
const phpSerialize = require('php-serialize');
const { evaluarPreguntaIndividual } = require('./examenCalificacion');
const {
  normalizarRespuestaParaPersistir,
  parseRespuestaDesdeLinea
} = require('./examenRespuestaNormalizar');
const { fusionarCamposSpeaking, esPreguntaSpeaking } = require('./examenTipo');

const TABLA = 'asignaturas_examenes_respuestas_linea';

function esErrorTablaInexistente(err) {
  return err && (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_FIELD_ERROR');
}

function parseRespuestasJsonDesdePrueba(raw) {
  if (!raw || String(raw).trim() === '') return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return normalizarClavesRespuestas(parsed);
    }
  } catch (_) {
    // legacy PHP serialize en base64
  }
  try {
    const decoded = Buffer.from(String(raw), 'base64').toString('utf-8');
    const parsed = phpSerialize.unserialize(decoded);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return normalizarClavesRespuestas(parsed);
    }
  } catch (_) {
    // ignorar
  }
  return {};
}

function normalizarClavesRespuestas(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    out[String(k)] = v;
  }
  return out;
}

function lineasAMap(lineas) {
  const out = {};
  for (const row of lineas || []) {
    if (!row || row.pregunta_id == null) continue;
    out[String(row.pregunta_id)] = parseRespuestaDesdeLinea(row.respuesta_json);
  }
  return out;
}

/** Líneas tienen prioridad sobre JSON legacy (datos más recientes). */
function mergeRespuestasMaps(jsonMap, lineasMap) {
  return { ...normalizarClavesRespuestas(jsonMap), ...normalizarClavesRespuestas(lineasMap) };
}

async function fetchLineasPorPrueba(query, pruebaId) {
  try {
    return await query(
      `SELECT pregunta_id, respuesta_json, es_correcta, puntos_parciales, actualizado_en
       FROM ${TABLA}
       WHERE prueba_id = ?`,
      [pruebaId]
    );
  } catch (err) {
    if (esErrorTablaInexistente(err)) return [];
    throw err;
  }
}

async function cargarRespuestasMergedDePrueba(query, pruebaRow) {
  const jsonMap = parseRespuestasJsonDesdePrueba(pruebaRow?.respuestas);
  const lineas = await fetchLineasPorPrueba(query, pruebaRow.id);
  return mergeRespuestasMaps(jsonMap, lineasAMap(lineas));
}

async function upsertLineaRespuesta(execute, pruebaId, preguntaId, respuestaJson, evaluacion, tipoPregunta) {
  try {
    const normalizada = normalizarRespuestaParaPersistir(respuestaJson, tipoPregunta);
    const jsonStr = JSON.stringify(normalizada);
    const esCorrecta = evaluacion && evaluacion.pendienteDocente
      ? null
      : evaluacion && evaluacion.tieneRespuesta
        ? (evaluacion.esCorrecta ? 1 : 0)
        : null;
    const puntos =
      evaluacion && (evaluacion.tieneRespuesta || evaluacion.pendienteDocente)
        ? Number(evaluacion.puntosPregunta) || 0
        : null;

    await execute(
      `INSERT INTO ${TABLA}
         (prueba_id, pregunta_id, respuesta_json, es_correcta, puntos_parciales, actualizado_en)
       VALUES (?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         respuesta_json = VALUES(respuesta_json),
         es_correcta = VALUES(es_correcta),
         puntos_parciales = VALUES(puntos_parciales),
         actualizado_en = NOW()`,
      [pruebaId, preguntaId, jsonStr, esCorrecta, puntos]
    );
    return true;
  } catch (err) {
    if (esErrorTablaInexistente(err)) return false;
    throw err;
  }
}

async function syncMapToJsonCampo(execute, pruebaId, respuestasMap) {
  await execute(
    `UPDATE asignaturas_examenes_pruebas SET respuestas = ? WHERE id = ?`,
    [JSON.stringify(normalizarClavesRespuestas(respuestasMap)), pruebaId]
  );
}

/**
 * Guarda una respuesta: línea + merge en JSON legacy (compatibilidad).
 */
async function persistirRespuestaPregunta({
  query,
  execute,
  pruebaId,
  preguntaId,
  respuesta,
  examenRow,
  preguntaRow
}) {
  const pruebaRows = await query(
    `SELECT id, respuestas FROM asignaturas_examenes_pruebas WHERE id = ? LIMIT 1`,
    [pruebaId]
  );
  const prueba = pruebaRows[0];
  if (!prueba) throw new Error('Prueba no encontrada');

  const tipoPregunta = preguntaRow?.tipo;
  let respuestaNorm = normalizarRespuestaParaPersistir(respuesta, tipoPregunta);

  const lineas = await fetchLineasPorPrueba(query, pruebaId);
  const jsonMap = mergeRespuestasMaps(
    parseRespuestasJsonDesdePrueba(prueba.respuestas),
    lineasAMap(lineas)
  );
  const previa = jsonMap[String(preguntaId)];
  if (esPreguntaSpeaking(tipoPregunta)) {
    respuestaNorm = fusionarCamposSpeaking(respuestaNorm, previa);
  }
  jsonMap[String(preguntaId)] = respuestaNorm;

  let evaluacion = null;
  if (examenRow && preguntaRow) {
    evaluacion = evaluarPreguntaIndividual(preguntaRow, respuestaNorm, examenRow);
  }

  await upsertLineaRespuesta(execute, pruebaId, preguntaId, respuestaNorm, evaluacion, tipoPregunta);
  await syncMapToJsonCampo(execute, pruebaId, jsonMap);

  return { evaluacion, respuestasMap: jsonMap };
}

/**
 * Bulk save: merge incoming over existing + upsert each line.
 */
async function persistirRespuestasBulk({
  query,
  execute,
  pruebaId,
  respuestasIncoming,
  examenRow,
  preguntasPorId
}) {
  const pruebaRows = await query(
    `SELECT id, respuestas FROM asignaturas_examenes_pruebas WHERE id = ? LIMIT 1`,
    [pruebaId]
  );
  const prueba = pruebaRows[0];
  if (!prueba) throw new Error('Prueba no encontrada');

  const lineas = await fetchLineasPorPrueba(query, pruebaId);
  const previaMap = mergeRespuestasMaps(
    parseRespuestasJsonDesdePrueba(prueba.respuestas),
    lineasAMap(lineas)
  );
  const merged = mergeRespuestasMaps(
    previaMap,
    normalizarClavesRespuestas(respuestasIncoming)
  );

  for (const [preguntaIdStr, respuesta] of Object.entries(respuestasIncoming || {})) {
    const preguntaId = parseInt(preguntaIdStr, 10);
    if (Number.isNaN(preguntaId)) continue;
    const preguntaRow = preguntasPorId?.[preguntaId];
    const tipoPregunta = preguntaRow?.tipo;
    let respuestaNorm = normalizarRespuestaParaPersistir(respuesta, tipoPregunta);
    if (esPreguntaSpeaking(tipoPregunta)) {
      respuestaNorm = fusionarCamposSpeaking(respuestaNorm, previaMap[String(preguntaId)]);
    }
    merged[String(preguntaId)] = respuestaNorm;
    let evaluacion = null;
    if (examenRow && preguntaRow) {
      evaluacion = evaluarPreguntaIndividual(preguntaRow, respuestaNorm, examenRow);
    }
    await upsertLineaRespuesta(execute, pruebaId, preguntaId, respuestaNorm, evaluacion, tipoPregunta);
  }

  await syncMapToJsonCampo(execute, pruebaId, merged);
  return merged;
}

module.exports = {
  TABLA,
  parseRespuestasJsonDesdePrueba,
  normalizarClavesRespuestas,
  lineasAMap,
  mergeRespuestasMaps,
  fetchLineasPorPrueba,
  cargarRespuestasMergedDePrueba,
  upsertLineaRespuesta,
  syncMapToJsonCampo,
  persistirRespuestaPregunta,
  persistirRespuestasBulk,
  esErrorTablaInexistente
};
