import jsPDF from 'jspdf';
import { fmtPts } from './hexExamenesFormat';

/**
 * PDF de estadísticas de examen (herramientas): resumen + tabla de intentos ordenados por nota.
 */
export function generarPdfEstadisticasExamenHerramientas({
  examen,
  puntaje_max_examen,
  totalIntentos,
  pendientesRevision,
  estadisticas_agregadas: agg,
  intentos
}) {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const colorHeader = [59, 130, 246];
  const colorBorder = [37, 99, 235];
  const colorText = [30, 41, 59];
  const colorLight = [219, 234, 254];
  const colorDark = [30, 64, 175];

  const tituloEx = String(examen?.titulo || 'Examen').slice(0, 120);
  const fechaExp = new Date().toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });

  const ensureSpace = (h) => {
    if (y + h > pageHeight - 18) {
      doc.addPage();
      y = margin;
    }
  };

  // Portada / cabecera
  doc.setFillColor(...colorHeader);
  doc.rect(margin, y, contentWidth, 26, 'F');
  doc.setDrawColor(...colorBorder);
  doc.rect(margin, y, contentWidth, 26);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('ESTADÍSTICAS DEL EXAMEN', margin + 4, y + 10);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const tituloLines = doc.splitTextToSize(tituloEx, contentWidth - 8);
  doc.text(tituloLines, margin + 4, y + 18);
  y += 32;

  doc.setTextColor(...colorText);
  doc.setFontSize(9);
  doc.text(`Exportado: ${fechaExp}`, margin, y);
  y += 5;
  doc.text(
    `Modo: ${examen?.modo || '—'} · Intentos: ${totalIntentos ?? 0} · Pendientes revisión: ${pendientesRevision ?? 0}` +
      (puntaje_max_examen != null ? ` · Puntaje máximo: ${fmtPts(puntaje_max_examen)}` : ''),
    margin,
    y
  );
  y += 8;

  if (agg) {
    ensureSpace(40);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Resumen numérico', margin, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const lines = [
      `Promedio de puntaje: ${agg.promedio_puntaje != null ? fmtPts(agg.promedio_puntaje) : '—'}`,
      `Mediana: ${agg.mediana_puntaje != null ? fmtPts(agg.mediana_puntaje) : '—'}`,
      `Intentos con puntaje registrado: ${agg.n_con_puntaje ?? 0}`
    ];
    lines.forEach((ln) => {
      doc.text(ln, margin, y);
      y += 4.5;
    });
    y += 4;

    if (agg.distribucion_rangos?.counts?.length) {
      ensureSpace(30);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Distribución por rangos (respecto al máximo de cada intento)', margin, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      const labels = agg.distribucion_rangos.labels || [];
      const counts = agg.distribucion_rangos.counts || [];
      const totalC = counts.reduce((a, b) => a + b, 0) || 1;
      labels.forEach((lab, i) => {
        const c = counts[i] || 0;
        const pct = Math.round((100 * c) / totalC);
        doc.text(`${lab}: ${c} (${pct}%)`, margin, y);
        y += 4;
      });
      y += 4;
    }

    const bloquePreguntas = (titulo, items, campoPct) => {
      if (!items?.length) return;
      ensureSpace(22);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(titulo, margin, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      items.forEach((p, idx) => {
        const pct =
          campoPct === 'porcentaje_acierto' && p.porcentaje_acierto != null
            ? `${p.porcentaje_acierto}% acierto`
            : '';
        const line = `${idx + 1}. [${p.tipo || '?'}] ${String(p.texto_preview || '').slice(0, 85)} ${pct}`.trim();
        const wrapped = doc.splitTextToSize(line, contentWidth);
        wrapped.forEach((w) => {
          ensureSpace(5);
          doc.text(w, margin, y);
          y += 3.5;
        });
        y += 1;
      });
      y += 3;
    };

    bloquePreguntas('Preguntas con menor acierto (autoevaluables)', agg.mas_equivocadas, 'porcentaje_acierto');
    bloquePreguntas('Preguntas con mayor acierto (autoevaluables)', agg.mejor_respondidas, 'porcentaje_acierto');
  }

  // Tabla de resultados
  ensureSpace(20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Resultados por participante (orden: mayor a menor nota)', margin, y);
  y += 7;

  const colUsuario = margin;
  const colRol = margin + 72;
  const colEst = margin + 100;
  const colPts = margin + 128;
  const colFecha = margin + 158;
  const rowH = 7;

  const drawTableHeader = () => {
    doc.setFillColor(...colorHeader);
    doc.rect(margin, y, contentWidth, 8, 'F');
    doc.setDrawColor(...colorBorder);
    doc.rect(margin, y, contentWidth, 8);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('Usuario', colUsuario + 1, y + 5.5);
    doc.text('Rol', colRol, y + 5.5);
    doc.text('Estado', colEst, y + 5.5);
    doc.text('Puntaje', colPts, y + 5.5);
    doc.text('Fecha envío', colFecha, y + 5.5);
    y += 10;
    doc.setTextColor(...colorText);
    doc.setFont('helvetica', 'normal');
  };

  drawTableHeader();

  const rows = Array.isArray(intentos) ? intentos : [];
  const tableBottom = pageHeight - 14;
  rows.forEach((row, index) => {
    if (y + rowH + 4 > tableBottom) {
      doc.addPage();
      y = margin;
      drawTableHeader();
    }
    const nombre = String(row.nombre_mostrar || row.login_usuario || `#${row.usuario_id}`).slice(0, 38);
    const rol = String(row.rol_respondiente || '—').slice(0, 12);
    const est = row.estado === 'CALIFICADO' ? 'Calif.' : String(row.estado || '—').slice(0, 10);
    const maxSnap = row.puntaje_max_snapshot ?? puntaje_max_examen;
    const pts =
      row.puntaje_obtenido != null && maxSnap != null
        ? `${fmtPts(row.puntaje_obtenido)} / ${fmtPts(maxSnap)}`
        : row.puntaje_obtenido != null
          ? fmtPts(row.puntaje_obtenido)
          : '—';
    const fe = row.fecha_envio ? String(row.fecha_envio).slice(0, 19) : '—';

    if (index % 2 === 0) {
      doc.setFillColor(...colorLight);
      doc.rect(margin, y - 1, contentWidth, rowH + 1, 'F');
    }
    doc.setDrawColor(...colorBorder);
    doc.setLineWidth(0.15);
    doc.rect(margin, y - 1, contentWidth, rowH + 1);

    doc.setFontSize(7);
    doc.text(nombre, colUsuario + 1, y + 4);
    doc.text(rol, colRol, y + 4);
    doc.text(est, colEst, y + 4);
    doc.text(pts, colPts, y + 4);
    doc.text(fe, colFecha, y + 4);
    y += rowH + 1;
  });

  // Margen bajo la última fila: la baseline de doc.text queda ~2–3 mm sobre y; sin esto el pie monta sobre el borde.
  y += 6;

  doc.setFontSize(8);
  doc.setTextColor(...colorDark);
  ensureSpace(10);
  doc.text(`Total filas: ${rows.length}`, margin, y);

  const safe = tituloEx.replace(/[^\w-]+/g, '_').slice(0, 40);
  doc.save(`estadisticas_examen_${safe || 'examen'}.pdf`);
}
