'use strict';

const { findAlternativaMarcadaVF } = require('./examenRespuestaIds');

const ROMAN_BIMESTRE = ['', 'I', 'II', 'III', 'IV'];

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

function findAltPorId(alternativas, id) {
  const nid = Number(id);
  if (!Number.isFinite(nid)) return null;
  return (alternativas || []).find((a) => Number(a.id) === nid) || null;
}

function etiquetaBimestreExamen(ciclo) {
  const n = parseInt(ciclo, 10);
  if (n >= 1 && n <= 4) return `${ROMAN_BIMESTRE[n]} Bimestre`;
  if (ciclo !== null && ciclo !== undefined && String(ciclo).trim() !== '') {
    return String(ciclo).trim();
  }
  return '—';
}

function construirAsuntoComprobanteExamen({ cursoNombre, alumnoNombre, tituloExamen, ciclo }) {
  const curso = String(cursoNombre || 'Curso').trim();
  const alumno = String(alumnoNombre || 'Alumno').trim();
  const titulo = String(tituloExamen || 'Examen').trim();
  const bimestre = etiquetaBimestreExamen(ciclo);
  return `Comprobante Examen ${curso} - ${alumno} - ${titulo} - ${bimestre}`.slice(0, 500);
}

/**
 * Formatea la respuesta del alumno como HTML legible (bandeja Mensajes).
 * @returns {{ html: string, sinResponder: boolean }}
 */
function formatearRespuestaExamenHtml(pregunta, respuestaAlumno) {
  const tipo = String(pregunta?.tipo || '').toUpperCase();
  const alternativas = Array.isArray(pregunta?.alternativas) ? pregunta.alternativas : [];

  const vacio =
    respuestaAlumno === null ||
    respuestaAlumno === undefined ||
    respuestaAlumno === '' ||
    (typeof respuestaAlumno === 'object' &&
      !Array.isArray(respuestaAlumno) &&
      Object.keys(respuestaAlumno).length === 0) ||
    (Array.isArray(respuestaAlumno) && respuestaAlumno.length === 0);

  if (vacio) {
    return {
      html: '<span style="color:#b45309;font-style:italic;">Sin responder</span>',
      sinResponder: true,
    };
  }

  if (tipo === 'ALTERNATIVAS') {
    const alt = findAlternativaMarcadaVF(alternativas, respuestaAlumno);
    if (alt && alt.descripcion) {
      return { html: String(alt.descripcion), sinResponder: false };
    }
    if (alt) {
      return {
        html: `<span style="color:#64748b;">Opción #${escapeHtml(alt.id)}</span>`,
        sinResponder: false,
      };
    }
    return { html: escapeHtml(htmlToPlain(String(respuestaAlumno))), sinResponder: false };
  }

  if (tipo === 'VERDADERO_FALSO') {
    const alt = findAlternativaMarcadaVF(alternativas, respuestaAlumno);
    if (alt) {
      const desc = htmlToPlain(alt.descripcion).toLowerCase();
      if (desc.includes('verdadero')) {
        return { html: '<strong>Verdadero</strong>', sinResponder: false };
      }
      if (desc.includes('falso')) {
        return { html: '<strong>Falso</strong>', sinResponder: false };
      }
      if (alt.descripcion) {
        return { html: String(alt.descripcion), sinResponder: false };
      }
    }
    return { html: escapeHtml(htmlToPlain(String(respuestaAlumno))), sinResponder: false };
  }

  if (tipo === 'ORDENAR' && Array.isArray(respuestaAlumno)) {
    const items = respuestaAlumno
      .map((id, i) => {
        const alt = findAltPorId(alternativas, id);
        const txt = alt?.descripcion || escapeHtml(String(id));
        return `<div style="margin:4px 0;padding:6px 8px;background:#fff;border:1px solid #e2e8f0;border-radius:6px;"><span style="font-weight:700;color:#4f46e5;margin-right:6px;">${i + 1}.</span>${txt}</div>`;
      })
      .join('');
    return { html: items || '<span style="color:#b45309;">Sin responder</span>', sinResponder: !items };
  }

  if (tipo === 'COMPLETAR' && typeof respuestaAlumno === 'object' && !Array.isArray(respuestaAlumno)) {
    const chips = Object.entries(respuestaAlumno)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([idx, val]) => {
        const num = Number(idx) + 1;
        const v = escapeHtml(val || '___');
        return `<span style="display:inline-block;background:#e0f2fe;border:1px solid #0ea5e9;border-radius:4px;padding:4px 8px;margin:3px 4px 3px 0;font-size:13px;"><strong>${num}.</strong> ${v}</span>`;
      })
      .join('');
    return {
      html: chips || '<span style="color:#b45309;">Sin responder</span>',
      sinResponder: !chips,
    };
  }

  if (tipo === 'RESPUESTA_CORTA') {
    return {
      html: `<span style="white-space:pre-wrap;">${escapeHtml(String(respuestaAlumno))}</span>`,
      sinResponder: false,
    };
  }

  if (tipo === 'EMPAREJAR' && typeof respuestaAlumno === 'object' && !Array.isArray(respuestaAlumno)) {
    const pares = Object.entries(respuestaAlumno)
      .map(([idOrigen, idDestino]) => {
        const origen = findAltPorId(alternativas, idOrigen);
        const destinoId = typeof idDestino === 'object' && idDestino !== null ? idDestino.id : idDestino;
        const destino = findAltPorId(alternativas, destinoId);
        const origenHtml = origen?.descripcion || escapeHtml(String(idOrigen));
        const destinoHtml = destino?.descripcion || escapeHtml(String(destinoId ?? ''));
        return `<div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;background:#f0f9ff;border-left:3px solid #3b82f6;padding:8px 10px;margin:4px 0;border-radius:6px;"><span style="font-weight:600;color:#1e40af;">${origenHtml}</span><span style="color:#3b82f6;font-size:18px;line-height:1;">→</span><span style="color:#059669;">${destinoHtml}</span></div>`;
      })
      .join('');
    return {
      html: pares || '<span style="color:#b45309;">Sin responder</span>',
      sinResponder: !pares,
    };
  }

  if (tipo === 'ARRASTRAR_Y_SOLTAR' && typeof respuestaAlumno === 'object' && !Array.isArray(respuestaAlumno)) {
    const zonas = Object.entries(respuestaAlumno)
      .map(([altId, valor]) => {
        const alt = findAltPorId(alternativas, altId);
        const altHtml = alt?.descripcion || escapeHtml(String(altId));
        const zonaNombre =
          typeof valor === 'object' && valor && valor.zona != null ? valor.zona : valor;
        return `<div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;background:#fef3c7;border-left:3px solid #f59e0b;padding:8px 10px;margin:4px 0;border-radius:6px;"><span style="background:#fbbf24;color:#fff;font-weight:700;font-size:12px;padding:3px 8px;border-radius:4px;">Zona ${escapeHtml(String(zonaNombre ?? ''))}</span><span style="color:#92400e;">${altHtml}</span></div>`;
      })
      .join('');
    return {
      html: zonas || '<span style="color:#b45309;">Sin responder</span>',
      sinResponder: !zonas,
    };
  }

  return {
    html: `<span style="white-space:pre-wrap;">${escapeHtml(htmlToPlain(String(respuestaAlumno)))}</span>`,
    sinResponder: false,
  };
}

function construirHtmlComprobanteExamenMensaje({
  tituloExamen,
  alumnoNombre,
  cursoNombre,
  docenteNombre,
  etiquetaGrado,
  bimestreLabel,
  puntajeFinal,
  correctas,
  incorrectas,
  permiteMostrarNota,
  bloquesPreguntas,
}) {
  const pts = permiteMostrarNota
    ? escapeHtml(String(puntajeFinal))
    : 'Pendiente (el docente publicará la nota según la configuración del examen)';
  const cor = permiteMostrarNota ? escapeHtml(String(correctas)) : '—';
  const inc = permiteMostrarNota ? escapeHtml(String(incorrectas)) : '—';

  const filasPreguntas = (bloquesPreguntas || [])
    .map((b) => {
      const preguntaHtml = b.preguntaHtml || escapeHtml(b.preguntaTexto || `Pregunta ${b.nro}`);
      const respuestaHtml = b.respuestaHtml || '<span style="color:#b45309;font-style:italic;">Sin responder</span>';
      return `<div style="border:1px solid #e5e7eb;border-radius:10px;padding:14px;margin-bottom:12px;background:#fff;">
        <div style="font-size:12px;font-weight:700;color:#4f46e5;text-transform:uppercase;letter-spacing:.3px;margin-bottom:8px;">Pregunta ${b.nro}</div>
        <div style="margin-bottom:12px;color:#1e293b;font-size:14px;line-height:1.45;">${preguntaHtml}</div>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 12px;">
          <div style="font-size:11px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:.25px;margin-bottom:6px;">Respuesta del alumno</div>
          <div style="font-size:14px;color:#14532d;line-height:1.45;">${respuestaHtml}</div>
        </div>
      </div>`;
    })
    .join('');

  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5;color:#0f172a;max-width:100%;">
    <div style="background:linear-gradient(135deg,#eef2ff 0%,#f5f3ff 100%);border:1px solid #c7d2fe;border-radius:10px;padding:14px 16px;margin-bottom:16px;">
      <div style="font-size:11px;font-weight:700;color:#4338ca;text-transform:uppercase;letter-spacing:.35px;margin-bottom:6px;">Comprobante de examen</div>
      <div style="font-size:17px;font-weight:700;color:#312e81;margin-bottom:10px;">${escapeHtml(tituloExamen || 'Examen')}</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr><td style="padding:4px 8px 4px 0;color:#64748b;width:38%;vertical-align:top;">Alumno</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(alumnoNombre || 'Alumno')}</td></tr>
        ${etiquetaGrado ? `<tr><td style="padding:4px 8px 4px 0;color:#64748b;vertical-align:top;">Grado / aula</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(etiquetaGrado)}</td></tr>` : ''}
        <tr><td style="padding:4px 8px 4px 0;color:#64748b;vertical-align:top;">Curso</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(cursoNombre || 'Curso')}</td></tr>
        <tr><td style="padding:4px 8px 4px 0;color:#64748b;vertical-align:top;">Docente</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(docenteNombre || 'Docente')}</td></tr>
        <tr><td style="padding:4px 8px 4px 0;color:#64748b;vertical-align:top;">Bimestre</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(bimestreLabel || '—')}</td></tr>
        <tr><td style="padding:4px 8px 4px 0;color:#64748b;vertical-align:top;">Puntaje</td><td style="padding:4px 0;font-weight:700;">${pts}</td></tr>
        <tr><td style="padding:4px 8px 4px 0;color:#64748b;vertical-align:top;">Correctas / Incorrectas</td><td style="padding:4px 0;">${cor} · ${inc}</td></tr>
      </table>
    </div>
    <div style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:10px;">Detalle de respuestas</div>
    ${filasPreguntas || '<p style="color:#64748b;font-size:13px;">Sin preguntas registradas.</p>'}
  </div>`;
}

module.exports = {
  etiquetaBimestreExamen,
  construirAsuntoComprobanteExamen,
  formatearRespuestaExamenHtml,
  construirHtmlComprobanteExamenMensaje,
};
