import jsPDF from 'jspdf';

function stripHtmlPlain(html) {
  const s = String(html || '');
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * PDF de estadísticas de encuesta (total o filtrado por grupo).
 */
export function generarPdfEstadisticasEncuesta({
  encuesta,
  totalGeneral,
  totalRespuestas,
  grupoSeleccionado,
  porGrupo,
  porRol,
  resultadosPreguntas
}) {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const colorHeader = [37, 99, 235];
  const colorText = [30, 41, 59];

  const ensureSpace = (h) => {
    if (y + h > pageHeight - 16) {
      doc.addPage();
      y = margin;
    }
  };

  const titulo = String(encuesta?.titulo || 'Encuesta').slice(0, 140);
  const fechaExp = new Date().toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });

  doc.setFillColor(...colorHeader);
  doc.rect(margin, y, contentWidth, 24, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text('ESTADÍSTICAS DE ENCUESTA', margin + 4, y + 9);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const tituloLines = doc.splitTextToSize(titulo, contentWidth - 8);
  doc.text(tituloLines.slice(0, 2), margin + 4, y + 16);
  y += 30;

  doc.setTextColor(...colorText);
  doc.setFontSize(9);
  doc.text(`Exportado: ${fechaExp}`, margin, y);
  y += 5;
  const alcance =
    grupoSeleccionado
      ? `Alcance: grupo «${grupoSeleccionado}» · ${totalRespuestas} respuestas (de ${totalGeneral} totales)`
      : `Alcance: total general · ${totalRespuestas} respuestas`;
  doc.text(alcance, margin, y);
  y += 8;

  if ((porGrupo || []).length) {
    ensureSpace(12 + porGrupo.length * 5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Participación por grupo', margin, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    for (const g of porGrupo) {
      ensureSpace(5);
      doc.text(`${g.etiqueta}: ${g.c}`, margin + 2, y);
      y += 4.5;
    }
    y += 4;
  }

  if ((porRol || []).length) {
    ensureSpace(12 + porRol.length * 5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Participación por rol', margin, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    for (const r of porRol) {
      ensureSpace(5);
      doc.text(`${r.rol_respondiente}: ${r.c}`, margin + 2, y);
      y += 4.5;
    }
    y += 4;
  }

  for (const rp of resultadosPreguntas || []) {
    if (rp.tipo_respuesta === 'titulo') continue;
    const perguntaTxt = stripHtmlPlain(rp.texto_pregunta) || `Pregunta ${rp.orden}`;
    ensureSpace(16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(`P${rp.orden}. ${perguntaTxt}`, contentWidth);
    doc.text(lines, margin, y);
    y += lines.length * 4.5 + 2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);

    if (rp.tipo_respuesta === 'marcar' || rp.tipo_respuesta === 'lista') {
      const entries = Object.entries(rp.datos || {});
      if (!entries.length) {
        doc.text('Sin respuestas', margin + 2, y);
        y += 5;
      } else {
        for (const [label, count] of entries) {
          ensureSpace(5);
          const lab = stripHtmlPlain(label).slice(0, 80) || '(opción)';
          doc.text(`· ${lab}: ${count}`, margin + 2, y);
          y += 4.2;
        }
      }
    } else if (rp.tipo_respuesta === 'escala') {
      const d = rp.datos || {};
      doc.text(`Promedio: ${d.promedio ?? '—'} · n=${d.total ?? 0}`, margin + 2, y);
      y += 5;
      for (const [val, count] of Object.entries(d.distribucion || {})) {
        ensureSpace(5);
        doc.text(`· Valor ${val}: ${count}`, margin + 2, y);
        y += 4.2;
      }
    } else if (rp.tipo_respuesta === 'texto_corto' || rp.tipo_respuesta === 'texto_largo') {
      const muestras = rp.datos?.muestras || [];
      doc.text(`${muestras.length} respuesta(s) de texto (se listan hasta 15)`, margin + 2, y);
      y += 5;
      for (const t of muestras.slice(0, 15)) {
        ensureSpace(8);
        const tl = doc.splitTextToSize(`· ${String(t).slice(0, 200)}`, contentWidth - 4);
        doc.text(tl, margin + 2, y);
        y += tl.length * 3.8 + 1;
      }
    }
    y += 4;
  }

  const safe = titulo.replace(/[^\w\-]+/g, '_').slice(0, 40);
  const suf = grupoSeleccionado ? `_grupo` : '_total';
  doc.save(`encuesta_estadisticas${suf}_${safe}.pdf`);
}

/**
 * PDF de historial de respuestas (agrupado o filtrado).
 */
export function generarPdfHistorialEncuesta({ encuesta, filas, grupoSeleccionado }) {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;
  const colorHeader = [13, 148, 136];
  const colorText = [30, 41, 59];

  const ensureSpace = (h) => {
    if (y + h > pageHeight - 14) {
      doc.addPage();
      y = margin;
    }
  };

  const titulo = String(encuesta?.titulo || 'Encuesta').slice(0, 120);
  doc.setFillColor(...colorHeader);
  doc.rect(margin, y, contentWidth, 20, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('HISTORIAL DE RESPUESTAS', margin + 3, y + 8);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(doc.splitTextToSize(titulo, contentWidth - 6).slice(0, 1), margin + 3, y + 15);
  y += 26;

  doc.setTextColor(...colorText);
  doc.setFontSize(8.5);
  doc.text(
    `Exportado: ${new Date().toLocaleString('es-PE')} · ${filas.length} fila(s)` +
      (grupoSeleccionado ? ` · Grupo: ${grupoSeleccionado}` : ' · Todos los grupos'),
    margin,
    y
  );
  y += 7;

  const byGroup = new Map();
  for (const f of filas) {
    const k = f.grupo_etiqueta || 'Sin grupo';
    if (!byGroup.has(k)) byGroup.set(k, []);
    byGroup.get(k).push(f);
  }

  for (const [grupo, rows] of [...byGroup.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'))) {
    ensureSpace(10);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`${grupo} (${rows.length})`, margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    for (const f of rows) {
      ensureSpace(6);
      const fecha = f.fecha_respuesta
        ? new Date(f.fecha_respuesta).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })
        : '—';
      const line = `${f.nombre_mostrar || 'Usuario'} · ${f.rol_respondiente || '—'} · ${fecha}`;
      doc.text(doc.splitTextToSize(line, contentWidth).slice(0, 1), margin + 2, y);
      y += 4.5;
    }
    y += 3;
  }

  const safe = titulo.replace(/[^\w\-]+/g, '_').slice(0, 40);
  doc.save(`encuesta_historial_${safe}.pdf`);
}
