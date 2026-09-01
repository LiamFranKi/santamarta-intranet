/**
 * Notificación idempotente a apoderados al finalizar un intento de examen (aula virtual).
 * Usado desde POST /finalizar y POST /violaciones (AUTO_FINALIZED).
 */
const { etiquetaGradoGrupo } = require('./notificacionExamenApoderadoTexto');
const { finalizarPruebaConCalificacion } = require('./examenFinalizarPrueba');
const {
  etiquetaBimestreExamen,
  construirAsuntoComprobanteExamen,
  formatearRespuestaExamenHtml,
  formatearRespuestaCorrectaHtml,
  construirHtmlComprobanteExamenMensaje,
} = require('./examenComprobanteMensajeHtml');

function htmlToPlain(s) {
  return String(s ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function esErrorColumnaNotifDesconocida(err) {
  return err && (err.code === 'ER_BAD_FIELD_ERROR' || /notif_apoderados_enviada_at/i.test(String(err.message || '')));
}

/**
 * @returns {Promise<boolean>}
 */
async function pruebaYaNotificoApoderados(query, pruebaId) {
  const id = parseInt(pruebaId, 10);
  if (!Number.isFinite(id)) return false;

  try {
    const rows = await query(
      `SELECT notif_apoderados_enviada_at FROM asignaturas_examenes_pruebas WHERE id = ? LIMIT 1`,
      [id]
    );
    if (!rows?.length) return false;
    return !!rows[0].notif_apoderados_enviada_at;
  } catch (err) {
    if (!esErrorColumnaNotifDesconocida(err)) throw err;
    const fallback = await query(
      `SELECT id FROM notificaciones
       WHERE accion_tipo = 'examen_finalizado'
         AND accion_payload LIKE ?
       LIMIT 1`,
      [`%"prueba_id":${id}%`]
    );
    return (fallback || []).length > 0;
  }
}

async function marcarNotificacionApoderadosEnviada(execute, pruebaId) {
  const id = parseInt(pruebaId, 10);
  if (!Number.isFinite(id)) return;
  try {
    await execute(
      `UPDATE asignaturas_examenes_pruebas SET notif_apoderados_enviada_at = NOW() WHERE id = ?`,
      [id]
    );
  } catch (err) {
    if (!esErrorColumnaNotifDesconocida(err)) throw err;
  }
}

/**
 * Envía campanita, push y mensaje interno a apoderados (una sola vez por prueba).
 * La notificación "Examen Finalizado" (campanita/push/correo vía crearNotificacionesApoderados) no se modifica aquí.
 * @param {object} opts
 * @param {Function} opts.query
 * @param {Function} opts.execute
 * @param {number} opts.pruebaId
 * @param {number|string} opts.examenId
 * @param {number} opts.matriculaId
 * @param {number} opts.alumno_id
 * @param {number} opts.usuario_id
 * @param {number} opts.colegio_id
 * @param {number} opts.anio_activo
 * @param {object} [opts.calificacion] — si falta, se recalcula desde pruebaRow
 * @param {object} [opts.pruebaRow] — requerido si no hay calificacion
 * @returns {Promise<{ enviado: boolean, motivo?: string }>}
 */
async function enviarNotificacionApoderadosExamenIfNeeded(opts) {
  const {
    query,
    execute,
    pruebaId,
    examenId,
    matriculaId,
    alumno_id,
    usuario_id,
    colegio_id,
    anio_activo,
    calificacion: calificacionIn,
    pruebaRow,
  } = opts;

  if (await pruebaYaNotificoApoderados(query, pruebaId)) {
    return { enviado: false, motivo: 'ya_notificado' };
  }

  let calificacion = calificacionIn;
  if (!calificacion) {
    const row = pruebaRow || (await query(`SELECT * FROM asignaturas_examenes_pruebas WHERE id = ? LIMIT 1`, [pruebaId]))?.[0];
    if (!row) return { enviado: false, motivo: 'prueba_no_encontrada' };
    calificacion = await finalizarPruebaConCalificacion({
      query,
      execute,
      pruebaRow: row,
      examenId,
    });
  }

  const { preguntas, respuestas, puntajeFinal, correctas, incorrectas, puntosTotal, detalles } = calificacion;

  const examenInfo = await query(
    `SELECT ae.*, a.grupo_id, c.nombre as curso_nombre,
            CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre,
            CONCAT(a2.nombres, ' ', a2.apellido_paterno, ' ', COALESCE(a2.apellido_materno, '')) as alumno_nombre,
            g.grado, g.seccion, COALESCE(nl.nombre, '') AS nivel_nombre
     FROM asignaturas_examenes ae
     INNER JOIN asignaturas a ON a.id = ae.asignatura_id
     INNER JOIN cursos c ON c.id = a.curso_id
     INNER JOIN personal p ON p.id = a.personal_id
     INNER JOIN matriculas m ON m.id = ?
     INNER JOIN alumnos a2 ON a2.id = m.alumno_id
     INNER JOIN grupos g ON g.id = m.grupo_id
     LEFT JOIN niveles nl ON nl.id = g.nivel_id
     WHERE ae.id = ?`,
    [matriculaId, examenId]
  );

  if (!examenInfo?.length) {
    return { enviado: false, motivo: 'examen_info_vacia' };
  }

  const examenData = examenInfo[0];
  const titulo = examenData.titulo;
  const curso_nombre = examenData.curso_nombre;
  const docente_nombre = examenData.docente_nombre;
  const alumno_nombre = examenData.alumno_nombre;
  const mostrar_nota = examenData.mostrar_nota;
  const bimestreLabel = etiquetaBimestreExamen(examenData.ciclo);
  const etiquetaGradoApod = etiquetaGradoGrupo({
    grado: examenData.grado,
    seccion: examenData.seccion,
    nivel_nombre: examenData.nivel_nombre,
  });
  const sufijoGradoApod = etiquetaGradoApod ? ` — ${etiquetaGradoApod}` : '';

  const detallePorId = new Map(
    (detalles || []).map((d) => [Number(d.pregunta_id), d])
  );

  const bloquesPreguntas = (preguntas || []).map((pregunta, idx) => {
    const respuestaAlumno = respuestas[pregunta.id.toString()] ?? respuestas[pregunta.id] ?? null;
    const preguntaTexto = htmlToPlain(pregunta.descripcion || `Pregunta ${idx + 1}`);
    const preguntaHtml = pregunta.descripcion
      ? String(pregunta.descripcion)
      : preguntaTexto || `Pregunta ${idx + 1}`;
    const { html: respuestaHtml, sinResponder } = formatearRespuestaExamenHtml(pregunta, respuestaAlumno);
    const det = detallePorId.get(Number(pregunta.id));
    const esCorrecta = !!(det && det.es_correcta);
    return {
      nro: idx + 1,
      preguntaTexto: preguntaTexto || `Pregunta ${idx + 1}`,
      preguntaHtml,
      respuestaHtml,
      sinResponder,
      esCorrecta,
      respuestaCorrectaHtml: esCorrecta ? '' : formatearRespuestaCorrectaHtml(pregunta),
    };
  });

  const permiteNota =
    mostrar_nota === undefined || mostrar_nota === null || mostrar_nota === 'SI';
  const puedeMostrarNotaEnCampanitas = permiteNota;

  const asuntoComprobante = construirAsuntoComprobanteExamen({
    cursoNombre: curso_nombre,
    alumnoNombre: alumno_nombre,
    tituloExamen: titulo,
    ciclo: examenData.ciclo,
  });

  const htmlComprobanteInterno = construirHtmlComprobanteExamenMensaje({
    tituloExamen: titulo || 'Examen',
    alumnoNombre: alumno_nombre || 'Alumno',
    cursoNombre: curso_nombre || 'Curso',
    docenteNombre: docente_nombre || 'Docente',
    etiquetaGrado: etiquetaGradoApod || '',
    bimestreLabel,
    puntajeFinal,
    correctas,
    incorrectas,
    permiteMostrarNota: permiteNota,
    bloquesPreguntas,
  });

  const { crearNotificacionesApoderados } = require('../routes/docente.routes');
  await crearNotificacionesApoderados({
    alumno_id: parseInt(alumno_id, 10),
    usuario_id,
    colegio_id,
    anio_activo,
    tituloNotificacion: 'Examen Finalizado',
    mensajeNotificacion: puedeMostrarNotaEnCampanitas
      ? `${alumno_nombre} finalizó el examen "${titulo}" con ${puntajeFinal} puntos (${correctas} correctas, ${incorrectas} incorrectas) - Curso: ${curso_nombre} - Docente: ${docente_nombre}${sufijoGradoApod}`
      : `[Comprobante] ${alumno_nombre} terminó "${titulo}". Revise Mensajes para el detalle (nota puede estar pendiente según el docente).`,
    tipoNotificacion: 'examen_finalizado',
    soloMensajesInternos: !puedeMostrarNotaEnCampanitas,
    dataExtra: {
      examen_id: parseInt(examenId, 10),
      prueba_id: parseInt(pruebaId, 10),
      puntaje: puntajeFinal,
      puntos_total: puntosTotal,
      correctas,
      incorrectas,
    },
    mensajeInterno: {
      asunto: asuntoComprobante,
      texto: htmlComprobanteInterno,
    },
  });

  await marcarNotificacionApoderadosEnviada(execute, pruebaId);
  return { enviado: true };
}

/** Encola el envío en segundo plano (no bloquea la respuesta HTTP). */
function programarNotificacionApoderadosExamen(opts) {
  setImmediate(async () => {
    try {
      const result = await enviarNotificacionApoderadosExamenIfNeeded(opts);
      if (result.enviado) {
        console.log(`✅ [EXAMEN NOTIF APODERADOS] Enviado prueba_id=${opts.pruebaId} examen_id=${opts.examenId}`);
      }
    } catch (err) {
      console.error('[EXAMEN NOTIF APODERADOS] Error:', err?.message || err);
    }
  });
}

module.exports = {
  enviarNotificacionApoderadosExamenIfNeeded,
  programarNotificacionApoderadosExamen,
  pruebaYaNotificoApoderados,
};
