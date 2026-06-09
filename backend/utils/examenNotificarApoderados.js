/**
 * Notificación idempotente a apoderados al finalizar un intento de examen (aula virtual).
 * Usado desde POST /finalizar y POST /violaciones (AUTO_FINALIZED).
 */
const { enviarCorreoHtml } = require('../services/emailService');
const { findAlternativaMarcadaVF } = require('./examenRespuestaIds');
const { etiquetaGradoGrupo } = require('./notificacionExamenApoderadoTexto');
const { finalizarPruebaConCalificacion } = require('./examenFinalizarPrueba');

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function htmlToPlain(s) {
  return String(s ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolverTextoRespuesta(pregunta, respuestaAlumno) {
  const tipo = String(pregunta?.tipo || '').toUpperCase();
  const alternativas = Array.isArray(pregunta?.alternativas) ? pregunta.alternativas : [];
  if (respuestaAlumno === null || respuestaAlumno === undefined || respuestaAlumno === '') {
    return 'Sin responder';
  }

  if (tipo === 'ALTERNATIVAS' || tipo === 'VERDADERO_FALSO') {
    const alt = findAlternativaMarcadaVF(alternativas, respuestaAlumno);
    if (alt) {
      return htmlToPlain(alt.descripcion || `Alternativa ${alt.id}`) || `Alternativa ${alt.id}`;
    }
    return htmlToPlain(String(respuestaAlumno));
  }

  if (tipo === 'COMPLETAR' && typeof respuestaAlumno === 'object' && !Array.isArray(respuestaAlumno)) {
    const partes = Object.entries(respuestaAlumno)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([idx, val]) => `${Number(idx) + 1}) ${htmlToPlain(val || '') || '___'}`);
    return partes.length > 0 ? partes.join(' | ') : 'Sin responder';
  }

  if (tipo === 'ORDENAR' && Array.isArray(respuestaAlumno)) {
    const parts = respuestaAlumno.map((id, i) => {
      const alt = alternativas.find((a) => Number(a.id) === Number(id));
      const txt = alt ? htmlToPlain(alt.descripcion || '') : String(id);
      return `${i + 1}) ${txt || id}`;
    });
    return parts.length > 0 ? parts.join(' | ') : 'Sin responder';
  }

  if ((tipo === 'EMPAREJAR' || tipo === 'ARRASTRAR_Y_SOLTAR') && typeof respuestaAlumno === 'object') {
    const pairs = Object.entries(respuestaAlumno).map(([k, v]) => {
      const left = htmlToPlain(
        alternativas.find((a) => Number(a.id) === Number(k))?.descripcion || String(k)
      );
      const right =
        typeof v === 'object' && v && v.zona
          ? `Zona ${htmlToPlain(v.zona)}`
          : htmlToPlain(String(v ?? ''));
      return `${left} -> ${right}`;
    });
    return pairs.length > 0 ? pairs.join(' | ') : 'Sin responder';
  }

  return htmlToPlain(String(respuestaAlumno));
}

function construirTextoPlanoComprobanteExamen({
  tituloExamen,
  alumnoNombre,
  cursoNombre,
  docenteNombre,
  etiquetaGrado,
  puntajeFinal,
  correctas,
  incorrectas,
  permiteMostrarNota,
  filasResumen,
}) {
  const nl = '\n';
  const pts = permiteMostrarNota
    ? String(puntajeFinal)
    : 'Pendiente (el docente publicará la nota según la configuración del examen)';
  const cor = permiteMostrarNota ? String(correctas) : '-';
  const inc = permiteMostrarNota ? String(incorrectas) : '-';
  let t = '';
  t += `Comprobante de examen — ${tituloExamen}${nl}`;
  t += `Alumno: ${alumnoNombre}${nl}`;
  if (etiquetaGrado) t += `${etiquetaGrado}${nl}`;
  t += `Curso: ${cursoNombre}${nl}`;
  t += `Docente: ${docenteNombre}${nl}`;
  t += `Puntaje: ${pts}${nl}`;
  t += `Correctas: ${cor} · Incorrectas: ${inc}${nl}${nl}`;
  t += `Detalle de respuestas:${nl}`;
  for (const f of filasResumen || []) {
    t += `${f.nro}. ${f.pregunta}${nl}   → ${f.respuesta}${nl}`;
  }
  return t;
}

function construirHtmlResumenExamenCorreo(params) {
  const {
    colegioNombre,
    alumnoNombre,
    cursoNombre,
    docenteNombre,
    tituloExamen,
    etiquetaGrado,
    puntajeFinal,
    correctas,
    incorrectas,
    filasResumen,
  } = params;

  const filasHtml = (filasResumen || [])
    .map((f) => {
      const estadoColor = f.sinResponder ? '#b45309' : '#166534';
      const estadoLabel = f.sinResponder ? 'Sin responder' : 'Respondida';
      return `<tr>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb;vertical-align:top;color:#111827;font-size:13px;">${f.nro}</td>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb;vertical-align:top;color:#111827;font-size:13px;">${escapeHtml(f.pregunta)}</td>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb;vertical-align:top;color:#111827;font-size:13px;">${escapeHtml(f.respuesta)}</td>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb;vertical-align:top;font-size:12px;font-weight:700;color:${estadoColor};">${estadoLabel}</td>
      </tr>`;
    })
    .join('');

  return `
  <table role="presentation" style="width:100%;border-collapse:collapse;background:#f3f4f6;padding:16px;">
    <tr><td align="center">
      <table role="presentation" style="max-width:820px;width:100%;border-collapse:separate;border-spacing:0;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,.08);">
        <tr>
          <td style="padding:24px 26px;background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);color:#fff;">
            <div style="font-size:12px;opacity:.9;letter-spacing:.2px;">COMPROBANTE DE EXAMEN</div>
            <h1 style="margin:8px 0 0;font-size:24px;line-height:1.25;">${escapeHtml(tituloExamen)}</h1>
            <p style="margin:8px 0 0;font-size:14px;opacity:.95;">${escapeHtml(colegioNombre || 'Vanguard Schools')}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 26px 6px;">
            <table role="presentation" style="width:100%;border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
              <tr>
                <td style="padding:10px 12px;color:#475569;font-size:13px;width:32%;">Alumno</td>
                <td style="padding:10px 12px;color:#0f172a;font-size:13px;font-weight:600;">${escapeHtml(alumnoNombre)}</td>
              </tr>
              <tr>
                <td style="padding:10px 12px;color:#475569;font-size:13px;">Curso</td>
                <td style="padding:10px 12px;color:#0f172a;font-size:13px;font-weight:600;">${escapeHtml(cursoNombre)}</td>
              </tr>
              <tr>
                <td style="padding:10px 12px;color:#475569;font-size:13px;">Docente</td>
                <td style="padding:10px 12px;color:#0f172a;font-size:13px;font-weight:600;">${escapeHtml(docenteNombre)}</td>
              </tr>
              <tr>
                <td style="padding:10px 12px;color:#475569;font-size:13px;">Grado / Sección</td>
                <td style="padding:10px 12px;color:#0f172a;font-size:13px;font-weight:600;">${escapeHtml(etiquetaGrado || '-')}</td>
              </tr>
              <tr>
                <td style="padding:10px 12px;color:#475569;font-size:13px;">Resultado</td>
                <td style="padding:10px 12px;color:#0f172a;font-size:13px;font-weight:700;">Puntaje: ${escapeHtml(puntajeFinal)} · Correctas: ${escapeHtml(correctas)} · Incorrectas: ${escapeHtml(incorrectas)}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 26px 8px;color:#1e293b;font-size:14px;font-weight:700;">Respuestas marcadas por el alumno</td>
        </tr>
        <tr>
          <td style="padding:0 26px 20px;">
            <table role="presentation" style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
              <thead>
                <tr style="background:#eef2ff;">
                  <th style="padding:10px;border-bottom:1px solid #c7d2fe;text-align:left;font-size:12px;color:#3730a3;">#</th>
                  <th style="padding:10px;border-bottom:1px solid #c7d2fe;text-align:left;font-size:12px;color:#3730a3;">Pregunta</th>
                  <th style="padding:10px;border-bottom:1px solid #c7d2fe;text-align:left;font-size:12px;color:#3730a3;">Respuesta marcada</th>
                  <th style="padding:10px;border-bottom:1px solid #c7d2fe;text-align:left;font-size:12px;color:#3730a3;">Estado</th>
                </tr>
              </thead>
              <tbody>${filasHtml}</tbody>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 26px;background:#f8fafc;border-top:1px solid #e5e7eb;color:#64748b;font-size:12px;">
            Este correo es un comprobante automático de respuestas registradas al finalizar el examen.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>`;
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
 * Envía campanita, push, correo y mensaje interno a apoderados (una sola vez por prueba).
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

  const { preguntas, respuestas, puntajeFinal, correctas, incorrectas, puntosTotal } = calificacion;

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
  const etiquetaGradoApod = etiquetaGradoGrupo({
    grado: examenData.grado,
    seccion: examenData.seccion,
    nivel_nombre: examenData.nivel_nombre,
  });
  const sufijoGradoApod = etiquetaGradoApod ? ` — ${etiquetaGradoApod}` : '';

  const filasResumen = (preguntas || []).map((pregunta, idx) => {
    const respuestaAlumno = respuestas[pregunta.id.toString()] ?? respuestas[pregunta.id] ?? null;
    const preguntaTexto = htmlToPlain(pregunta.descripcion || `Pregunta ${idx + 1}`);
    const respuestaTexto = resolverTextoRespuesta(pregunta, respuestaAlumno);
    return {
      nro: idx + 1,
      pregunta: preguntaTexto || `Pregunta ${idx + 1}`,
      respuesta: respuestaTexto || 'Sin responder',
      sinResponder: !respuestaTexto || respuestaTexto === 'Sin responder',
    };
  });

  const permiteNota =
    mostrar_nota === undefined || mostrar_nota === null || mostrar_nota === 'SI';
  const puedeMostrarNotaEnCampanitas = permiteNota;

  const textoComprobanteInterno = construirTextoPlanoComprobanteExamen({
    tituloExamen: titulo || 'Examen',
    alumnoNombre: alumno_nombre || 'Alumno',
    cursoNombre: curso_nombre || 'Curso',
    docenteNombre: docente_nombre || 'Docente',
    etiquetaGrado: etiquetaGradoApod ? `Grado / aula: ${etiquetaGradoApod}` : '',
    puntajeFinal,
    correctas,
    incorrectas,
    permiteMostrarNota: permiteNota,
    filasResumen,
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
      asunto: `Comprobante de examen: ${titulo || 'Examen'} – ${alumno_nombre || 'Alumno'}`,
      texto: textoComprobanteInterno,
    },
  });

  try {
    const alumnoEmailRows = await query(
      `SELECT
         COALESCE(NULLIF(TRIM(al.email), ''), CASE WHEN u.usuario LIKE '%@%' THEN u.usuario ELSE NULL END) AS email
       FROM usuarios u
       INNER JOIN alumnos al ON al.id = u.alumno_id
       WHERE u.id = ? AND u.colegio_id = ? AND u.estado = 'ACTIVO'
       LIMIT 1`,
      [usuario_id, colegio_id]
    );
    const apoderadosEmailRows = await query(
      `SELECT DISTINCT ap.email AS email
       FROM apoderados ap
       INNER JOIN familias f ON f.apoderado_id = ap.id
       WHERE f.alumno_id = ? AND ap.colegio_id = ?
         AND ap.email IS NOT NULL AND TRIM(ap.email) != ''`,
      [alumno_id, colegio_id]
    );

    const correosUnicos = new Map();
    const agregarCorreo = (email) => {
      const em = String(email || '').trim();
      if (!em || !em.includes('@')) return;
      const key = em.toLowerCase();
      if (!correosUnicos.has(key)) correosUnicos.set(key, em);
    };
    (alumnoEmailRows || []).forEach((r) => agregarCorreo(r.email));
    (apoderadosEmailRows || []).forEach((r) => agregarCorreo(r.email));

    if (correosUnicos.size > 0) {
      const puntajeLabel = permiteNota ? String(puntajeFinal) : 'No disponible aún';
      const correctasLabel = permiteNota ? String(correctas) : '-';
      const incorrectasLabel = permiteNota ? String(incorrectas) : '-';
      const htmlCorreo = construirHtmlResumenExamenCorreo({
        colegioNombre: 'Vanguard Schools',
        alumnoNombre: alumno_nombre || 'Alumno',
        cursoNombre: curso_nombre || 'Curso',
        docenteNombre: docente_nombre || 'Docente',
        tituloExamen: titulo || 'Examen',
        etiquetaGrado: etiquetaGradoApod || '',
        puntajeFinal: puntajeLabel,
        correctas: correctasLabel,
        incorrectas: incorrectasLabel,
        filasResumen,
      });
      const asuntoCorreo = `Comprobante de examen: ${titulo || 'Examen'} - ${alumno_nombre || 'Alumno'}`;
      await Promise.allSettled(
        [...correosUnicos.values()].map((email) =>
          enviarCorreoHtml(email, asuntoCorreo, htmlCorreo, 'Vanguard Schools', 'EXAMEN')
        )
      );
    }
  } catch (emailError) {
    console.error('[EXAMEN NOTIF APODERADOS] Error correo comprobante:', emailError?.message || emailError);
  }

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
