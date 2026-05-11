/**
 * Libreta PDF Nivel Inicial (cualitativa): cabecera, tabla de datos del alumno,
 * tabla por áreas/indicadores (descripción del proceso, nota, semáforo), leyendas y firmas.
 */

export function pdfGetInitialsLibreta(nombre) {
  if (!nombre) return 'A';
  const parts = String(nombre).trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join('') || 'A';
}

/** Verde claro tipo Excel / libreta institucional (cabeceras de tabla). */
const PDF_TABLA_VERDE = [198, 224, 180];

export function getNotaCualitativaPdfStyle(notaRaw) {
  const s = String(notaRaw ?? '').trim().toUpperCase();
  if (s === 'AD' || s === 'A') {
    return { fill: [220, 252, 231], stroke: [74, 222, 128], text: [22, 101, 52] };
  }
  if (s === 'B') {
    return { fill: [254, 249, 195], stroke: [250, 204, 21], text: [113, 63, 18] };
  }
  if (s === 'C') {
    return { fill: [254, 226, 226], stroke: [248, 113, 113], text: [127, 29, 29] };
  }
  return { fill: [248, 250, 252], stroke: [203, 213, 225], text: [51, 65, 85] };
}

/** Color del círculo semáforo (columna 4). */
function rgbSemaforoNota(notaRaw) {
  const s = String(notaRaw ?? '').trim().toUpperCase();
  if (s === 'AD' || s === 'A') return [34, 197, 94];
  if (s === 'B') return [234, 179, 8];
  if (s === 'C') return [239, 68, 68];
  return [148, 163, 184];
}

function drawRoundedRect(doc, x, y, w, h, r, style) {
  const nx = Number(x) || 0;
  const ny = Number(y) || 0;
  const nw = Math.max(0.01, Number(w) || 0);
  const nh = Math.max(0.01, Number(h) || 0);
  const nr = Math.max(0, Math.min(Number(r) || 0, nw / 2, nh / 2));
  if (typeof doc.roundedRect === 'function') {
    doc.roundedRect(nx, ny, nw, nh, nr, nr, style);
  } else {
    doc.rect(nx, ny, nw, nh, style);
  }
}

function drawCell(doc, x, y, w, h, fillRgb, lines, opts = {}) {
  const { fontSize = 7, textColor = [0, 0, 0], lineWidth = 0.2 } = opts;
  const arr = Array.isArray(lines) ? lines : [String(lines ?? '')];
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(lineWidth);
  doc.setFillColor(...fillRgb);
  doc.rect(x, y, w, h, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...textColor);
  doc.setFontSize(fontSize);
  const lh = fontSize * 0.38;
  const n = Math.min(arr.length, 12);
  const blockH = n * lh;
  let ty = y + Math.max(2.2, (h - blockH) / 2 + lh * 0.75);
  arr.slice(0, 12).forEach((ln) => {
    doc.text(ln, x + 1.2, ty, { maxWidth: Math.max(2, w - 2.4) });
    ty += lh;
  });
}

function drawCellCentered(doc, x, y, w, h, fillRgb, text, opts = {}) {
  const { fontSize = 7, bold = false, textColor = [0, 0, 0] } = opts;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  doc.setFillColor(...fillRgb);
  doc.rect(x, y, w, h, 'FD');
  doc.setFont('helvetica', bold ? 'bold' : 'normal');
  doc.setTextColor(...textColor);
  doc.setFontSize(fontSize);
  doc.text(String(text ?? ''), x + w / 2, y + h / 2 + fontSize * 0.12, { align: 'center', maxWidth: w - 2 });
}

/**
 * @param {object} doc instancia jsPDF
 * @param {object} opts opciones de página y datos
 * @returns {Promise<void>}
 */
export function renderLibretaInicialBoleta(doc, opts) {
  const {
    datosLibreta,
    pageWidth,
    pageHeight,
    margin,
    contentWidth,
    borderWidth,
    colorLabel,
    colorData,
    cicloSel,
    yStart,
    logoHeightMm = 0
  } = opts;

  const a = datosLibreta.alumno || {};
  const bimRoman = ['I', 'II', 'III', 'IV'][(cicloSel || 1) - 1] || 'I';
  let yPos = Math.max(yStart, margin + (logoHeightMm || 0) + 2);

  const verde = PDF_TABLA_VERDE;
  const blanco = colorData || [255, 255, 255];

  const headerHeight = 5;
  const ensureSpace = (needH) => {
    if (yPos + needH > pageHeight - 28) {
      doc.addPage();
      yPos = margin;
    }
  };

  doc.setLineWidth(borderWidth || 0.25);
  doc.setDrawColor(0, 0, 0);

  /* ——— Título ——— */
  const bannerH = 11;
  ensureSpace(bannerH + 50);
  doc.setFillColor(...(colorLabel || verde));
  drawRoundedRect(doc, margin, yPos, contentWidth, bannerH, 1.5, 'F');
  doc.setDrawColor(0, 0, 0);
  drawRoundedRect(doc, margin, yPos, contentWidth, bannerH, 1.5, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  doc.text('LIBRETA DE DESARROLLO Y APRENDIZAJE', margin + contentWidth / 2, yPos + 4.2, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(
    `${String(a.nivel_nombre || 'NIVEL INICIAL').toUpperCase()} · BIMESTRE ${bimRoman} · AÑO ${a.anio ?? '-'}`,
    margin + contentWidth / 2,
    yPos + 8.6,
    { align: 'center' }
  );
  yPos += bannerH + 3;

  /* ——— Tabla datos alumno (formato imagen 01, sin foto) ——— */
  const rowBase = 5.8;
  const w = contentWidth;
  const l1 = w * 0.11;
  const v1 = w * 0.54;
  const l2 = w * 0.1;
  const v2 = w - l1 - v1 - l2;

  const nombreAl = String(a.nombre_completo || '—').trim();
  const lineasNombre = doc.splitTextToSize(nombreAl, v1 - 2.5);
  const hRow1 = Math.max(rowBase, 2 + lineasNombre.length * 3.2);

  ensureSpace(hRow1 + rowBase * 3 + 4);
  let x0 = margin;
  drawCellCentered(doc, x0, yPos, l1, hRow1, verde, 'ALUMNO', { fontSize: 7.2, bold: true });
  drawCell(doc, x0 + l1, yPos, v1, hRow1, blanco, lineasNombre, { fontSize: 7 });
  drawCellCentered(doc, x0 + l1 + v1, yPos, l2, hRow1, verde, 'CÓDIGO', { fontSize: 7.2, bold: true });
  drawCellCentered(doc, x0 + l1 + v1 + l2, yPos, v2, hRow1, blanco, String(a.codigo || '—'), { fontSize: 7 });
  yPos += hRow1;

  const lG = w * 0.16;
  const vG = w * 0.14;
  const lN = w * 0.09;
  const vN = w * 0.16;
  const lT = w * 0.09;
  const vT = w - lG - vG - lN - vN - lT;
  const gradoTxt = `${a.grado ?? '—'}° ${String(a.seccion || '').trim()}`.trim();
  const nivelTxt = String(a.nivel_nombre || '—').trim();
  const turnoTxt = String(a.turno_nombre || '—').trim();

  drawCellCentered(doc, margin, yPos, lG, rowBase, verde, 'GRADO / SECCIÓN', { fontSize: 6.3, bold: true });
  drawCellCentered(doc, margin + lG, yPos, vG, rowBase, blanco, gradoTxt, { fontSize: 7 });
  drawCellCentered(doc, margin + lG + vG, yPos, lN, rowBase, verde, 'NIVEL', { fontSize: 7, bold: true });
  drawCellCentered(doc, margin + lG + vG + lN, yPos, vN, rowBase, blanco, nivelTxt, { fontSize: 7 });
  drawCellCentered(doc, margin + lG + vG + lN + vN, yPos, lT, rowBase, verde, 'TURNO', { fontSize: 7, bold: true });
  drawCellCentered(doc, margin + lG + vG + lN + vN + lT, yPos, vT, rowBase, blanco, turnoTxt, { fontSize: 7 });
  yPos += rowBase;

  const lTu = w * 0.11;
  const vTu = w * 0.62;
  const lAn = w * 0.09;
  const vAn = w - lTu - vTu - lAn;
  const tutorTxt = String(a.tutor_nombre || 'No asignado').trim();
  const lineasTutor = doc.splitTextToSize(tutorTxt, vTu - 2.5);
  const hRow3 = Math.max(rowBase, 2 + lineasTutor.length * 3.2);
  drawCellCentered(doc, margin, yPos, lTu, hRow3, verde, 'TUTOR', { fontSize: 7.2, bold: true });
  drawCell(doc, margin + lTu, yPos, vTu, hRow3, blanco, lineasTutor, { fontSize: 7 });
  drawCellCentered(doc, margin + lTu + vTu, yPos, lAn, hRow3, verde, 'AÑO', { fontSize: 7.2, bold: true });
  drawCellCentered(doc, margin + lTu + vTu + lAn, yPos, vAn, hRow3, blanco, String(a.anio ?? '—'), { fontSize: 7 });
  yPos += hRow3 + 4;

  /* ——— Columnas notas: Área | Descripción del proceso | Promedio | Color ——— */
  const colArea = w * 0.28;
  const colDesc = w * 0.47;
  const colNota = w * 0.12;
  const colCirc = w - colArea - colDesc - colNota;

  const bimLabel = cicloSel;
  const getNota = (item) => {
    const nota = item[`nota_b${bimLabel}`];
    return nota !== null && nota !== '' && nota !== undefined ? String(nota) : '-';
  };
  const getTextoDetalle = (item) => {
    const expl = (item.explicacion || '').trim();
    if (expl) return expl;
    const n = getNota(item);
    return n !== '-' ? n : '—';
  };

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);

  (datosLibreta.cursos_cualitativos || []).forEach((curso) => {
    const nombreCurso = String(curso.curso_nombre || '').toUpperCase();
    const vCurso = curso[`promedio_b${bimLabel}`];
    const promTxt =
      vCurso !== null && vCurso !== '' && vCurso !== '-' ? String(vCurso).toUpperCase() : '-';

    const hArea = 5.5;
    ensureSpace(hArea + 6);
    drawCellCentered(doc, margin, yPos, colArea, hArea, verde, nombreCurso, { fontSize: 7.2, bold: true });
    drawCellCentered(doc, margin + colArea, yPos, colDesc, hArea, verde, 'DESCRIPCIÓN DEL PROCESO', {
      fontSize: 6.8,
      bold: true
    });
    drawCellCentered(doc, margin + colArea + colDesc, yPos, colNota, hArea, verde, promTxt, { fontSize: 8, bold: true });
    doc.setFillColor(...verde);
    doc.rect(margin + colArea + colDesc + colNota, yPos, colCirc, hArea, 'FD');
    yPos += hArea;

    const pintarFilaIndicador = (ind) => {
      const textoDetalle = getTextoDetalle(ind);
      const lineas = doc.splitTextToSize(textoDetalle || '—', colDesc - 3);
      const descInd = String(ind.descripcion || ind.abreviatura || 'Indicador').trim() || '—';
      const lineasInd = doc.splitTextToSize(descInd, colArea - 3);
      const rowHeight = Math.max(5.5, Math.max(lineasInd.length, 1) * 3.5 + 3, lineas.length * 3.5 + 3);
      ensureSpace(rowHeight + 2);

      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.2);
      doc.setFillColor(...blanco);
      doc.rect(margin, yPos, colArea, rowHeight, 'FD');
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      let yi = yPos + 3.6;
      lineasInd.forEach((ln) => {
        doc.text(ln, margin + 1.2, yi, { maxWidth: colArea - 2.4 });
        yi += 3.5;
      });

      doc.setFillColor(...blanco);
      doc.rect(margin + colArea, yPos, colDesc, rowHeight, 'FD');
      yi = yPos + 3.6;
      lineas.forEach((ln) => {
        doc.text(ln, margin + colArea + 1.2, yi, { maxWidth: colDesc - 2.4 });
        yi += 3.5;
      });

      const notaStr = getNota(ind);
      doc.setFillColor(...blanco);
      doc.rect(margin + colArea + colDesc, yPos, colNota, rowHeight, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(0, 0, 0);
      doc.text(notaStr, margin + colArea + colDesc + colNota / 2, yPos + rowHeight / 2 + 1, { align: 'center' });

      doc.setFillColor(...blanco);
      doc.rect(margin + colArea + colDesc + colNota, yPos, colCirc, rowHeight, 'FD');
      const rgb = rgbSemaforoNota(notaStr);
      doc.setFillColor(...rgb);
      const cx = margin + colArea + colDesc + colNota + colCirc / 2;
      const cy = yPos + rowHeight / 2;
      const rad = Math.min(2.1, colCirc / 2 - 0.5);
      if (typeof doc.circle === 'function') {
        doc.circle(cx, cy, rad, 'F');
      } else {
        doc.rect(cx - rad, cy - rad, rad * 2, rad * 2, 'F');
      }

      yPos += rowHeight;
    };

    (curso.criterios || []).forEach((cr) => {
      if (cr.indicadores && cr.indicadores.length > 0) {
        cr.indicadores.forEach((ind) => pintarFilaIndicador(ind));
      } else {
        pintarFilaIndicador(cr);
      }
    });
  });

  yPos += 3;

  /* ——— Observaciones + leyendas (imagen 03) ——— */
  const resumen = datosLibreta.resumen || {};
  const idx = Math.max(0, (cicloSel || 1) - 1);
  const pick = (arr) => (arr && arr[idx] != null && arr[idx] !== '' ? String(arr[idx]) : '—');
  const inas = pick([
    resumen.inasistencias?.b1,
    resumen.inasistencias?.b2,
    resumen.inasistencias?.b3,
    resumen.inasistencias?.b4
  ]);
  const tard = pick([
    resumen.tardanzas?.b1,
    resumen.tardanzas?.b2,
    resumen.tardanzas?.b3,
    resumen.tardanzas?.b4
  ]);

  const textoRecom = (datosLibreta.recomendaciones || '').trim();
  const anchoLey = (contentWidth - 6) / 3;
  const hLeyHead = 5;
  const hLeyRow = 5.2;

  ensureSpace(42);
  if (textoRecom) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(0, 0, 0);
    doc.text('Observaciones del tutor(a)', margin, yPos);
    yPos += 3.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    const recLines = doc.splitTextToSize(textoRecom, contentWidth - 2);
    recLines.slice(0, 6).forEach((ln) => {
      ensureSpace(4);
      doc.text(ln, margin, yPos);
      yPos += 3.6;
    });
    yPos += 2;
  }

  const yLey = yPos;
  let xL = margin;

  /* Inasistencias / tardanzas */
  drawCellCentered(doc, xL, yLey, anchoLey, hLeyHead, verde, 'ASISTENCIA', { fontSize: 7, bold: true });
  drawCellCentered(doc, xL, yLey + hLeyHead, anchoLey * 0.52, hLeyRow, verde, 'N° INASISTENCIAS', { fontSize: 5.8, bold: true });
  drawCellCentered(doc, xL + anchoLey * 0.52, yLey + hLeyHead, anchoLey * 0.48, hLeyRow, blanco, inas, { fontSize: 7 });
  drawCellCentered(doc, xL, yLey + hLeyHead + hLeyRow, anchoLey * 0.52, hLeyRow, verde, 'N° TARDANZAS', { fontSize: 5.8, bold: true });
  drawCellCentered(doc, xL + anchoLey * 0.52, yLey + hLeyHead + hLeyRow, anchoLey * 0.48, hLeyRow, blanco, tard, {
    fontSize: 7
  });

  xL += anchoLey + 3;
  /* Leyenda colores (fondo blanco en filas de datos) */
  drawCellCentered(doc, xL, yLey, anchoLey, hLeyHead, verde, 'LEYENDA', { fontSize: 7, bold: true });
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  doc.setFillColor(...blanco);
  doc.rect(xL, yLey + hLeyHead, anchoLey, hLeyRow, 'FD');
  doc.setFillColor(234, 179, 8);
  if (typeof doc.circle === 'function') {
    doc.circle(xL + 4, yLey + hLeyHead + hLeyRow / 2, 1.8, 'F');
  } else {
    doc.rect(xL + 2.2, yLey + hLeyHead + 1.2, 3.6, 3.6, 'F');
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(0, 0, 0);
  doc.text('En proceso', xL + 8, yLey + hLeyHead + hLeyRow / 2 + 0.9);

  doc.setFillColor(...blanco);
  doc.rect(xL, yLey + hLeyHead + hLeyRow, anchoLey, hLeyRow, 'FD');
  doc.setFillColor(239, 68, 68);
  if (typeof doc.circle === 'function') {
    doc.circle(xL + 4, yLey + hLeyHead + hLeyRow + hLeyRow / 2, 1.8, 'F');
  } else {
    doc.rect(xL + 2.2, yLey + hLeyHead + hLeyRow + 1.2, 3.6, 3.6, 'F');
  }
  doc.text('Requiere apoyo', xL + 8, yLey + hLeyHead + hLeyRow + hLeyRow / 2 + 0.9);

  xL += anchoLey + 3;
  /* Leyenda letras */
  drawCellCentered(doc, xL, yLey, anchoLey, hLeyHead, verde, 'ESCALA', { fontSize: 7, bold: true });
  const leyendas = [
    ['A', 'Logro esperado'],
    ['B', 'En proceso'],
    ['C', 'En inicio']
  ];
  let yy = yLey + hLeyHead;
  leyendas.forEach(([letra, txt]) => {
    doc.setFillColor(...verde);
    doc.rect(xL, yy, anchoLey * 0.12, hLeyRow, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(0, 0, 0);
    doc.text(letra, xL + (anchoLey * 0.12) / 2, yy + hLeyRow / 2 + 0.9, { align: 'center' });
    doc.setFillColor(...blanco);
    doc.rect(xL + anchoLey * 0.12, yy, anchoLey * 0.88, hLeyRow, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text(txt, xL + anchoLey * 0.12 + 1.5, yy + hLeyRow / 2 + 0.9);
    yy += hLeyRow;
  });

  yPos = yLey + hLeyHead + hLeyRow * 3 + 2;

  /* ——— Firmas: mucho espacio y dos bloques ——— */
  yPos += 32;
  ensureSpace(28);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.45);
  const gapFirma = 14;
  const anchoFirma = (contentWidth - gapFirma) / 2;
  const yLinea = yPos;
  doc.line(margin, yLinea, margin + anchoFirma, yLinea);
  doc.line(margin + anchoFirma + gapFirma, yLinea, margin + contentWidth, yLinea);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  doc.text('FIRMA DEL DOCENTE', margin + anchoFirma / 2, yLinea + 8, { align: 'center' });
  doc.text('FIRMA DIRECCION', margin + anchoFirma + gapFirma + anchoFirma / 2, yLinea + 8, { align: 'center' });
}
