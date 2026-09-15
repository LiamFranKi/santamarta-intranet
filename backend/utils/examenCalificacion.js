/**
 * Calificación de exámenes del aula virtual (compartido alumno / docente).
 */
const { esCompletarCorrecto } = require('./examenCompletar');
const { findAlternativaMarcadaVF } = require('./examenRespuestaIds');
const {
  esExamenHibrido,
  esPreguntaSpeaking,
  parseSpeakingRespuesta,
  puntosMaxSpeaking
} = require('./examenTipo');

function respuestaTieneValor(respuestaAlumno) {
  if (respuestaAlumno === null || respuestaAlumno === undefined || respuestaAlumno === '') {
    return false;
  }
  if (typeof respuestaAlumno === 'object' && !Array.isArray(respuestaAlumno)) {
    return Object.keys(respuestaAlumno).length > 0;
  }
  if (Array.isArray(respuestaAlumno)) {
    return respuestaAlumno.length > 0;
  }
  return true;
}

/**
 * Evalúa una pregunta individual (puntos parciales + flag correcta).
 */
function evaluarPreguntaIndividual(pregunta, respuestaAlumno, examenRow) {
  const tipoPuntaje = examenRow.tipo_puntaje;
  const puntosCorrecta = parseFloat(examenRow.puntos_correcta) || 0;
  const alternativas = pregunta.alternativas || [];
  let puntosPregunta = 0;
  let esCorrecta = false;
  const tipo = String(pregunta.tipo || '').toUpperCase();

  switch (tipo) {
    case 'ALTERNATIVAS':
    case 'VERDADERO_FALSO':
      if (respuestaAlumno !== null && respuestaAlumno !== undefined && respuestaAlumno !== '') {
        const alternativaMarcada = findAlternativaMarcadaVF(alternativas, respuestaAlumno);
        if (alternativaMarcada && alternativaMarcada.correcta === 'SI') {
          esCorrecta = true;
          puntosPregunta =
            tipoPuntaje === 'GENERAL' ? puntosCorrecta : parseFloat(pregunta.puntos) || 0;
        } else if (examenRow.penalizar_incorrecta === 'SI') {
          puntosPregunta = -(parseFloat(examenRow.penalizacion_incorrecta) || 0);
        }
      }
      break;

    case 'COMPLETAR':
      if (respuestaAlumno && typeof respuestaAlumno === 'object') {
        const tieneAlgunaRespuesta = Object.keys(respuestaAlumno).length > 0;
        const todasCorrectas = esCompletarCorrecto(respuestaAlumno, pregunta.descripcion);
        if (todasCorrectas) {
          esCorrecta = true;
          puntosPregunta =
            tipoPuntaje === 'GENERAL' ? puntosCorrecta : parseFloat(pregunta.puntos) || 0;
        } else if (examenRow.penalizar_incorrecta === 'SI' && tieneAlgunaRespuesta) {
          puntosPregunta = -(parseFloat(examenRow.penalizacion_incorrecta) || 0);
        }
      }
      break;

    case 'ORDENAR':
      if (respuestaAlumno && Array.isArray(respuestaAlumno) && respuestaAlumno.length > 0) {
        const alternativasConOrden = alternativas.filter(
          (alt) => alt.orden_posicion !== null && alt.orden_posicion !== undefined
        );
        let ordenCorrecto = true;
        if (respuestaAlumno.length === alternativasConOrden.length) {
          for (let i = 0; i < respuestaAlumno.length; i++) {
            const altId = parseInt(respuestaAlumno[i], 10);
            const alternativa = alternativas.find((alt) => {
              const altIdComp = typeof alt.id === 'number' ? alt.id : parseInt(alt.id, 10);
              return altIdComp === altId;
            });
            if (!alternativa) {
              ordenCorrecto = false;
              break;
            }
            const ordenEsperado =
              typeof alternativa.orden_posicion === 'number'
                ? alternativa.orden_posicion
                : parseInt(alternativa.orden_posicion, 10);
            if (ordenEsperado !== i + 1) {
              ordenCorrecto = false;
              break;
            }
          }
        } else {
          ordenCorrecto = false;
        }
        if (ordenCorrecto) {
          esCorrecta = true;
          puntosPregunta =
            tipoPuntaje === 'GENERAL' ? puntosCorrecta : parseFloat(pregunta.puntos) || 0;
        } else if (examenRow.penalizar_incorrecta === 'SI' && respuestaAlumno.length > 0) {
          puntosPregunta = -(parseFloat(examenRow.penalizacion_incorrecta) || 0);
        }
      }
      break;

    case 'EMPAREJAR':
      if (respuestaAlumno && typeof respuestaAlumno === 'object' && Object.keys(respuestaAlumno).length > 0) {
        const alternativasConPar = alternativas.filter(
          (alt) => alt.par_id !== null && alt.par_id !== undefined
        );
        let todosParesCorrectos = true;
        let paresVerificados = 0;
        for (const [altId, parId] of Object.entries(respuestaAlumno)) {
          const altIdNum = parseInt(altId, 10);
          const parIdNum = parseInt(parId, 10);
          const alternativa = alternativas.find((alt) => {
            const altIdComp = typeof alt.id === 'number' ? alt.id : parseInt(alt.id, 10);
            return altIdComp === altIdNum;
          });
          if (!alternativa) {
            todosParesCorrectos = false;
            break;
          }
          const parEsperado = alternativa.par_id
            ? typeof alternativa.par_id === 'number'
              ? alternativa.par_id
              : parseInt(alternativa.par_id, 10)
            : null;
          if (!parEsperado || parIdNum !== parEsperado) {
            todosParesCorrectos = false;
            break;
          }
          paresVerificados++;
        }
        if (todosParesCorrectos && paresVerificados === alternativasConPar.length) {
          esCorrecta = true;
          puntosPregunta =
            tipoPuntaje === 'GENERAL' ? puntosCorrecta : parseFloat(pergunta.puntos) || 0;
        } else if (examenRow.penalizar_incorrecta === 'SI' && Object.keys(respuestaAlumno).length > 0) {
          puntosPregunta = -(parseFloat(examenRow.penalizacion_incorrecta) || 0);
        }
      }
      break;

    case 'ARRASTRAR_Y_SOLTAR':
      if (respuestaAlumno && typeof respuestaAlumno === 'object' && Object.keys(respuestaAlumno).length > 0) {
        const alternativasConZona = alternativas.filter(
          (alt) => alt.zona_drop && String(alt.zona_drop).trim() !== ''
        );
        let todasZonasCorrectas = true;
        let zonasVerificadas = 0;
        for (const [altId, zonaValue] of Object.entries(respuestaAlumno)) {
          const altIdNum = parseInt(altId, 10);
          const alternativa = alternativas.find((alt) => {
            const altIdComp = typeof alt.id === 'number' ? alt.id : parseInt(alt.id, 10);
            return altIdComp === altIdNum;
          });
          if (!alternativa) {
            todasZonasCorrectas = false;
            break;
          }
          let zonaAlumno;
          if (typeof zonaValue === 'string') {
            zonaAlumno = zonaValue.trim().toLowerCase();
          } else if (typeof zonaValue === 'object' && zonaValue !== null && zonaValue.zona) {
            zonaAlumno = String(zonaValue.zona).trim().toLowerCase();
          } else {
            todasZonasCorrectas = false;
            break;
          }
          const zonaEsperada = alternativa.zona_drop
            ? String(alternativa.zona_drop).trim().toLowerCase()
            : null;
          if (!zonaEsperada || zonaAlumno !== zonaEsperada) {
            todasZonasCorrectas = false;
            break;
          }
          zonasVerificadas++;
        }
        if (todasZonasCorrectas && zonasVerificadas === alternativasConZona.length) {
          esCorrecta = true;
          puntosPregunta =
            tipoPuntaje === 'GENERAL' ? puntosCorrecta : parseFloat(pregunta.puntos) || 0;
        } else if (examenRow.penalizar_incorrecta === 'SI' && Object.keys(respuestaAlumno).length > 0) {
          puntosPregunta = -(parseFloat(examenRow.penalizacion_incorrecta) || 0);
        }
      }
      break;

    case 'RESPUESTA_CORTA':
      if (respuestaAlumno) {
        const respuestaNormalizada = String(respuestaAlumno).trim().toLowerCase();
        const alternativaCorrecta = alternativas.find((alt) => alt.correcta === 'SI');
        if (alternativaCorrecta) {
          const correctaNormalizada = alternativaCorrecta.descripcion
            .replace(/<[^>]*>/g, '')
            .trim()
            .toLowerCase();
          if (respuestaNormalizada === correctaNormalizada) {
            esCorrecta = true;
            puntosPregunta =
              tipoPuntaje === 'GENERAL' ? puntosCorrecta : parseFloat(pregunta.puntos) || 0;
          } else if (examenRow.penalizar_incorrecta === 'SI') {
            puntosPregunta = -(parseFloat(examenRow.penalizacion_incorrecta) || 0);
          }
        }
      }
      break;

    case 'SPEAKING': {
      if (!esExamenHibrido(examenRow.tipo)) {
        return {
          esCorrecta: false,
          puntosPregunta: 0,
          tieneRespuesta: false,
          pendienteDocente: false,
          omitida: true
        };
      }
      const sp = parseSpeakingRespuesta(respuestaAlumno);
      if (sp.nota_docente != null) {
        const maxSp = puntosMaxSpeaking(pregunta, examenRow);
        const nota = Math.max(0, Math.min(maxSp || sp.nota_docente, sp.nota_docente));
        return {
          esCorrecta: nota > 0,
          puntosPregunta: nota,
          tieneRespuesta: true,
          pendienteDocente: false,
          omitida: false
        };
      }
      const tieneAudioOVisto = !!(sp.audio || sp.visto || sp.modo === 'EN_VIVO' || sp.modo === 'AUDIO');
      return {
        esCorrecta: false,
        puntosPregunta: 0,
        tieneRespuesta: tieneAudioOVisto,
        pendienteDocente: true,
        omitida: false
      };
    }

    default:
      break;
  }

  return {
    esCorrecta,
    puntosPregunta,
    tieneRespuesta: respuestaTieneValor(respuestaAlumno),
    pendienteDocente: false,
    omitida: false
  };
}

/**
 * Califica un conjunto de preguntas con mapa de respuestas { preguntaId: valor }.
 */
function calificarExamenPrueba(examenRow, preguntas, respuestasMap) {
  const tipoPuntaje = examenRow.tipo_puntaje;
  const puntosCorrecta = parseFloat(examenRow.puntos_correcta) || 0;
  let puntosObtenidos = 0;
  let correctas = 0;
  let incorrectas = 0;
  let pendienteSpeaking = false;
  const detalles = [];

  for (const pregunta of preguntas) {
    const respuestaAlumno =
      respuestasMap[pregunta.id.toString()] ?? respuestasMap[pregunta.id] ?? null;
    const { esCorrecta, puntosPregunta, tieneRespuesta, pendienteDocente, omitida } =
      evaluarPreguntaIndividual(pregunta, respuestaAlumno, examenRow);

    if (omitida) {
      continue;
    }

    puntosObtenidos += puntosPregunta;
    if (pendienteDocente && esPreguntaSpeaking(pregunta.tipo)) {
      pendienteSpeaking = true;
    } else if (esCorrecta) {
      correctas++;
    } else if (tieneRespuesta) {
      incorrectas++;
    }

    detalles.push({
      pregunta_id: pregunta.id,
      es_correcta: esCorrecta,
      puntos: puntosPregunta,
      pendiente_docente: !!pendienteDocente
    });
  }

  const puntajeFinal = Math.min(20, Math.max(0, Math.round(puntosObtenidos)));

  return {
    puntajeFinal,
    correctas,
    incorrectas,
    detalles,
    puntosObtenidos,
    pendienteSpeaking,
    puntosTotal: preguntas.reduce((acc, p) => {
      if (esPreguntaSpeaking(p.tipo) && !esExamenHibrido(examenRow.tipo)) return acc;
      if (esPreguntaSpeaking(p.tipo)) return acc + puntosMaxSpeaking(p, examenRow);
      return acc + (tipoPuntaje === 'GENERAL' ? puntosCorrecta : parseFloat(p.puntos) || 0);
    }, 0)
  };
}

module.exports = {
  respuestaTieneValor,
  evaluarPreguntaIndividual,
  calificarExamenPrueba
};
