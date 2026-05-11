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

/** Convierte nota cualitativa a número para promediar (AD > A > B > C). */
function notaCualitativaANum(s) {
  const u = String(s ?? '').trim().toUpperCase();
  if (u === 'AD') return 4;
  if (u === 'A') return 3;
  if (u === 'B') return 2;
  if (u === 'C') return 1;
  return null;
}

function numANotaCualitativa(n) {
  const r = Math.round(Number(n));
  if (r >= 4) return 'AD';
  if (r === 3) return 'A';
  if (r === 2) return 'B';
  return 'C';
}

/**
 * Promedio de notas de indicadores (ej. A+A+B → A; A+B+B → B) vía media y redondeo.
 */
function promedioNotasIndicadores(notasStrs) {
  const nums = (notasStrs || []).map(notaCualitativaANum).filter((x) => x !== null);
  if (nums.length === 0) return '-';
  const avg = nums.reduce((acc, v) => acc + v, 0) / nums.length;
  return numANotaCualitativa(avg);
}

/** Recorre criterios/indicadores del curso y devuelve las notas del bimestre activo. */
function collectNotasCurso(curso, bimLabel) {
  const out = [];
  const key = `nota_b${bimLabel}`;
  (curso.criterios || []).forEach((cr) => {
    if (cr.indicadores && cr.indicadores.length > 0) {
      cr.indicadores.forEach((ind) => {
        const n = ind[key];
        if (n !== null && n !== undefined && String(n).trim() !== '') out.push(String(n));
      });
    } else {
      const n = cr[key];
      if (n !== null && n !== undefined && String(n).trim() !== '') out.push(String(n));
    }
  });
  return out;
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

  /* Misma anchura para las tres etiquetas verdes: GRADO/SECCIÓN, NIVEL, TURNO */
  const thirdW = w / 3;
  const labTriple = Math.min(thirdW * 0.4, 26);
  const valTriple = thirdW - labTriple;
  const gradoTxt = `${a.grado ?? '—'}° ${String(a.seccion || '').trim()}`.trim();
  const nivelTxt = String(a.nivel_nombre || '—').trim();
  const turnoTxt = String(a.turno_nombre || '—').trim();

  drawCellCentered(doc, margin, yPos, labTriple, rowBase, verde, 'GRADO / SECCIÓN', { fontSize: 6.2, bold: true });
  drawCellCentered(doc, margin + labTriple, yPos, valTriple, rowBase, blanco, gradoTxt, { fontSize: 7 });
  drawCellCentered(doc, margin + thirdW, yPos, labTriple, rowBase, verde, 'NIVEL', { fontSize: 7, bold: true });
  drawCellCentered(doc, margin + thirdW + labTriple, yPos, valTriple, rowBase, blanco, nivelTxt, { fontSize: 7 });
  drawCellCentered(doc, margin + thirdW * 2, yPos, labTriple, rowBase, verde, 'TURNO', { fontSize: 7, bold: true });
  drawCellCentered(doc, margin + thirdW * 2 + labTriple, yPos, valTriple, rowBase, blanco, turnoTxt, { fontSize: 7 });
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

  /* ——— Columnas: más ancho Área y Descripción; nota y semáforo más angostos ——— */
  const colNota = w * 0.075;
  const colCirc = w * 0.068;
  const colArea = w * 0.36;
  const colDesc = w - colArea - colNota - colCirc;

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
    const notasInd = collectNotasCurso(curso, bimLabel);
    let promTxt = promedioNotasIndicadores(notasInd);
    if (promTxt === '-') {
      const vCurso = curso[`promedio_b${bimLabel}`];
      if (vCurso !== null && vCurso !== '' && vCurso !== '-') {
        promTxt = String(vCurso).toUpperCase();
      }
    } else {
      promTxt = String(promTxt).toUpperCase();
    }

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

  yPos += 14;

  if (!(datosLibreta.recomendaciones || '').trim()) {
    yPos += 8;
  }

  /* ——— Observaciones (más separación respecto al cuadro de notas) ——— */
  const resumen = datosLibreta.resumen || {};
  const cicloN = cicloSel || 1;

  const valBimConducta = (i) => {
    const keys = ['b1', 'b2', 'b3', 'b4'];
    const k = keys[i];
    const v = resumen.promedio_conducta?.[k];
    if (i + 1 > cicloN) return '—';
    if (v === null || v === undefined || v === '') return '—';
    return String(v);
  };
  const valBimInas = (i) => {
    const keys = ['b1', 'b2', 'b3', 'b4'];
    const k = keys[i];
    const v = resumen.inasistencias?.[k];
    if (i + 1 > cicloN) return '—';
    if (v === null || v === undefined || v === '') return '—';
    return String(v);
  };
  const valBimTard = (i) => {
    const keys = ['b1', 'b2', 'b3', 'b4'];
    const k = keys[i];
    const v = resumen.tardanzas?.[k];
    if (i + 1 > cicloN) return '—';
    if (v === null || v === undefined || v === '') return '—';
    return String(v);
  };

  const textoRecom = (datosLibreta.recomendaciones || '').trim();
  const gapPie = 2;
  const wPieTotal = contentWidth - gapPie * 2;
  const wResumenPie = wPieTotal * 0.46;
  const wColDer = (wPieTotal - wResumenPie) / 2;
  const hLeyHead = 5;
  const hLeyRow = 5;
  const hSubRom = 4.8;

  ensureSpace(50);
  if (textoRecom) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(0, 0, 0);
    doc.text('Observaciones del tutor(a)', margin, yPos);
    yPos += 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    const recLines = doc.splitTextToSize(textoRecom, contentWidth - 2);
    recLines.slice(0, 8).forEach((ln) => {
      ensureSpace(4);
      doc.text(ln, margin, yPos);
      yPos += 3.6;
    });
    yPos += 6;
  }

  const yLey = yPos;
  let xL = margin;

  /* ——— CUADRO DE RESUMEN: conducta, inasistencias, tardanzas (I–IV) ——— */
  const labR = wResumenPie * 0.42;
  const colBimW = (wResumenPie - labR) / 4;
  let yR = yLey;
  drawCellCentered(doc, xL, yR, wResumenPie, hLeyHead, verde, 'CUADRO DE RESUMEN', { fontSize: 7, bold: true });
  yR += hLeyHead;
  drawCellCentered(doc, xL, yR, labR, hSubRom, verde, '', { fontSize: 6 });
  for (let i = 0; i < 4; i++) {
    const rom = ['I', 'II', 'III', 'IV'][i];
    drawCellCentered(doc, xL + labR + i * colBimW, yR, colBimW, hSubRom, verde, rom, { fontSize: 6.5, bold: true });
  }
  yR += hSubRom;

  const filaResBim = (etiq, fnVal) => {
    drawCellCentered(doc, xL, yR, labR, hLeyRow, verde, etiq, { fontSize: 5.6, bold: true });
    for (let i = 0; i < 4; i++) {
      drawCellCentered(doc, xL + labR + i * colBimW, yR, colBimW, hLeyRow, blanco, fnVal(i), { fontSize: 6.8 });
    }
    yR += hLeyRow;
  };

  filaResBim('NOTA DE CONDUCTA', valBimConducta);
  filaResBim('N° INASISTENCIAS', valBimInas);
  filaResBim('N° TARDANZAS', valBimTard);

  const hResumenTotal = yR - yLey;

  xL += wResumenPie + gapPie;
  /* ——— SEMÁFORO (verde / amarillo / rojo) ——— */
  const xSem = xL;
  let ySem = yLey;
  drawCellCentered(doc, xSem, ySem, wColDer, hLeyHead, verde, 'SEMAFORO', { fontSize: 7, bold: true });
  ySem += hLeyHead;

  const filaCirculoTxt = (y0, rgb, texto) => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.setFillColor(...blanco);
    doc.rect(xSem, y0, wColDer, hLeyRow, 'FD');
    doc.setFillColor(...rgb);
    const cx = xSem + 4;
    const cy = y0 + hLeyRow / 2;
    if (typeof doc.circle === 'function') {
      doc.circle(cx, cy, 1.8, 'F');
    } else {
      doc.rect(cx - 1.8, cy - 1.8, 3.6, 3.6, 'F');
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(0, 0, 0);
    doc.text(texto, xSem + 8, cy + 0.9);
  };

  filaCirculoTxt(ySem, [34, 197, 94], 'Logrado');
  ySem += hLeyRow;
  filaCirculoTxt(ySem, [234, 179, 8], 'En proceso');
  ySem += hLeyRow;
  filaCirculoTxt(ySem, [239, 68, 68], 'Requiere apoyo');
  ySem += hLeyRow;
  const hSemaTotal = ySem - yLey;

  xL += wColDer + gapPie;
  /* ——— ESCALA (AD + A B C) ——— */
  const xEsc = xL;
  drawCellCentered(doc, xEsc, yLey, wColDer, hLeyHead, verde, 'ESCALA', { fontSize: 7, bold: true });
  const leyLetraW = wColDer * 0.14;
  let yy = yLey + hLeyHead;
  const leyendas = [
    ['AD', 'Logro destacado'],
    ['A', 'Logro esperado'],
    ['B', 'En proceso'],
    ['C', 'En inicio']
  ];
  leyendas.forEach(([letra, txt]) => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.setFillColor(...verde);
    doc.rect(xEsc, yy, leyLetraW, hLeyRow, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(letra === 'AD' ? 6.5 : 7);
    doc.setTextColor(0, 0, 0);
    doc.text(letra, xEsc + leyLetraW / 2, yy + hLeyRow / 2 + 0.9, { align: 'center' });
    doc.setFillColor(...blanco);
    doc.rect(xEsc + leyLetraW, yy, wColDer - leyLetraW, hLeyRow, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.2);
    const tShow = txt === 'Logro destacado' ? 'LOGRO DESTACADO' : txt;
    doc.text(tShow, xEsc + leyLetraW + 1.2, yy + hLeyRow / 2 + 0.9);
    yy += hLeyRow;
  });
  const hEscalaTotal = yy - yLey;

  const hPie = Math.max(hResumenTotal, hSemaTotal, hEscalaTotal);
  yPos = yLey + hPie + 4;

  /* ——— Firmas ——— */
  yPos += 22;
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
