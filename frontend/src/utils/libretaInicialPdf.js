/**
 * Libreta PDF Nivel Inicial (cualitativa): informe de progreso, tabla por áreas/indicadores
 * (NL / Prom), registro de asistencia, escala extendida y firmas. Misma plantilla para
 * cualquier rol que exporte (apoderado, docente, tutor).
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

/** Filas de indicadores (o criterio sin hijos) en orden para el cuerpo del PDF. */
function flattenIndicadoresCurso(curso) {
  const rows = [];
  (curso.criterios || []).forEach((cr) => {
    if (cr.indicadores && cr.indicadores.length > 0) {
      cr.indicadores.forEach((ind) => rows.push(ind));
    } else {
      rows.push(cr);
    }
  });
  return rows;
}

/** Leyenda ESCALA extendida (pie de página). */
const ESCALA_INICIAL_DETALLE = [
  {
    letra: 'AD',
    titulo: 'LOGRO DESTACADO',
    texto:
      'Cuando el estudiante evidencia un nivel superior a lo esperado respecto a la competencia. Esto quiere decir que demuestra aprendizajes que van más allá del nivel esperado.'
  },
  {
    letra: 'A',
    titulo: 'LOGRO ESPERADO',
    texto:
      'Cuando el estudiante evidencia el nivel esperado respecto a la competencia, demostrando manejo satisfactorio en todas las tareas propuestas y en el tiempo programado.'
  },
  {
    letra: 'B',
    titulo: 'EN PROCESO',
    texto:
      'Cuando el estudiante está próximo o cerca al nivel esperado respecto a la competencia, para lo cual requiere acompañamiento durante un tiempo razonable para lograrlo.'
  },
  {
    letra: 'C',
    titulo: 'EN INICIO',
    texto:
      'Cuando el estudiante muestra progreso mínimo en una competencia de acuerdo al nivel esperado. Evidencia con frecuencia dificultades en el desarrollo de las tareas, por lo que necesita mayor tiempo de acompañamiento e intervención del docente.'
  }
];

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
  const { fontSize = 11, textColor = [0, 0, 0], lineWidth = 0.2, bold = false } = opts;
  const arr = Array.isArray(lines) ? lines : [String(lines ?? '')];
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(lineWidth);
  doc.setFillColor(...fillRgb);
  doc.rect(x, y, w, h, 'FD');
  doc.setFont('helvetica', bold ? 'bold' : 'normal');
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
  const { fontSize = 11, bold = false, textColor = [0, 0, 0] } = opts;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  doc.setFillColor(...fillRgb);
  doc.rect(x, y, w, h, 'FD');
  doc.setFont('helvetica', bold ? 'bold' : 'normal');
  doc.setTextColor(...textColor);
  doc.setFontSize(fontSize);
  doc.text(String(text ?? ''), x + w / 2, y + h / 2 + fontSize * 0.12, { align: 'center', maxWidth: w - 2 });
}

/** Parte el texto solo si no cabe en una línea (evita saltos prematuros de splitTextToSize). */
function lineasParaCelda(doc, texto, maxWmm, fontSize, bold = false) {
  const t = String(texto ?? '').trim() || '—';
  doc.setFont('helvetica', bold ? 'bold' : 'normal');
  doc.setFontSize(fontSize);
  if (doc.getTextWidth(t) <= maxWmm) return [t];
  return doc.splitTextToSize(t, maxWmm);
}

/**
 * @param {object} doc instancia jsPDF
 * @param {object} opts opciones de página y datos
 */
export function renderLibretaInicialBoleta(doc, opts) {
  const {
    datosLibreta,
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

  /* Cabeceras: color por grado (inicial) vía colorLabel; si no hay RGB válido, verde fijo. */
  const verde =
    Array.isArray(colorLabel) && colorLabel.length === 3 ? colorLabel : PDF_TABLA_VERDE;
  const blanco = colorData || [255, 255, 255];

  /** Tipografía unificada (pt): título banner 13, todo lo demás 11. */
  const FS_TITULO_BANNER = 13;
  const FS_DOC = 11;
  const lhDoc = FS_DOC * 0.405;

  const ensureSpace = (needH) => {
    if (yPos + needH > pageHeight - 28) {
      doc.addPage();
      yPos = margin;
    }
  };

  doc.setLineWidth(borderWidth || 0.25);
  doc.setDrawColor(0, 0, 0);

  /* ——— Título ——— */
  const tituloBanner = 'INFORME DE PROGRESO DEL ESTUDIANTE';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(FS_TITULO_BANNER);
  let lineasTitulo = [tituloBanner];
  const twTit = doc.getTextWidth(tituloBanner);
  if (twTit > contentWidth - 6) {
    lineasTitulo = doc.splitTextToSize(tituloBanner, contentWidth - 6);
  }
  const padBannerTop = 5.1;
  const lhTitulo = FS_TITULO_BANNER * 0.42;
  const padBannerBottom = 5;
  const bannerH = Math.max(16, padBannerTop + lineasTitulo.length * lhTitulo + padBannerBottom);
  ensureSpace(bannerH + 50);
  doc.setFillColor(...verde);
  drawRoundedRect(doc, margin, yPos, contentWidth, bannerH, 1.5, 'F');
  doc.setDrawColor(0, 0, 0);
  drawRoundedRect(doc, margin, yPos, contentWidth, bannerH, 1.5, 'S');
  doc.setTextColor(0, 0, 0);
  let ty = yPos + padBannerTop;
  lineasTitulo.forEach((ln) => {
    doc.text(ln, margin + contentWidth / 2, ty, { align: 'center' });
    ty += lhTitulo;
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(FS_DOC);
  doc.text(
    `${String(a.nivel_nombre || 'NIVEL INICIAL').toUpperCase()} · BIMESTRE ${bimRoman} · AÑO ${a.anio ?? '-'}`,
    margin + contentWidth / 2,
    yPos + bannerH - 2.35,
    { align: 'center' }
  );
  yPos += bannerH + 3;

  /* ——— Tabla datos alumno: una sola anchura L para todos los labels; CÓDIGO / TURNO / AÑO misma coordenada x ——— */
  const rowBase = Math.max(6.5, FS_DOC * 0.62);
  const w = contentWidth;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(FS_DOC);
  const L = Math.min(
    Math.max(doc.getTextWidth('GRADO / SECCIÓN') + 3.4, doc.getTextWidth('ALUMNO') + 3.4, 20),
    w * 0.2
  );
  const segundoBloqueX = margin + (w * 2) / 3;
  const S = w / 3 - L;
  const M = (w * 2) / 3 - L;

  const nombreAl = String(a.nombre_completo || '—').trim();
  const padTxt = 1.6;
  const lineasNombre = lineasParaCelda(doc, nombreAl, Math.max(4, M - padTxt), FS_DOC, true);
  const hRow1 = Math.max(rowBase, 2.2 + lineasNombre.length * lhDoc);

  ensureSpace(hRow1 + rowBase * 3 + 4);
  drawCellCentered(doc, margin, yPos, L, hRow1, verde, 'ALUMNO', { fontSize: FS_DOC, bold: true });
  drawCell(doc, margin + L, yPos, M, hRow1, blanco, lineasNombre, { fontSize: FS_DOC, bold: true });
  drawCellCentered(doc, segundoBloqueX, yPos, L, hRow1, verde, 'CÓDIGO', { fontSize: FS_DOC, bold: true });
  drawCellCentered(doc, segundoBloqueX + L, yPos, S, hRow1, blanco, String(a.codigo || '—'), { fontSize: FS_DOC, bold: true });
  yPos += hRow1;

  const trioW = w / 3;
  const gradoTxt = `${a.grado ?? '—'}° ${String(a.seccion || '').trim()}`.trim();
  const nivelTxt = String(a.nivel_nombre || '—').trim();
  const turnoTxt = String(a.turno_nombre || '—').trim();

  for (let t = 0; t < 3; t++) {
    const xT = margin + t * trioW;
    drawCellCentered(doc, xT, yPos, L, rowBase, verde, t === 0 ? 'GRADO / SECCIÓN' : t === 1 ? 'NIVEL' : 'TURNO', {
      fontSize: FS_DOC,
      bold: true
    });
    drawCellCentered(doc, xT + L, yPos, trioW - L, rowBase, blanco, t === 0 ? gradoTxt : t === 1 ? nivelTxt : turnoTxt, {
      fontSize: FS_DOC,
      bold: true
    });
  }
  yPos += rowBase;

  const tutorTxt = String(a.tutor_nombre || 'No asignado').trim();
  const lineasTutor = lineasParaCelda(doc, tutorTxt, Math.max(4, M - padTxt), FS_DOC, true);
  const hRow3 = Math.max(rowBase, 2.2 + lineasTutor.length * lhDoc);
  drawCellCentered(doc, margin, yPos, L, hRow3, verde, 'TUTOR', { fontSize: FS_DOC, bold: true });
  drawCell(doc, margin + L, yPos, M, hRow3, blanco, lineasTutor, { fontSize: FS_DOC, bold: true });
  drawCellCentered(doc, segundoBloqueX, yPos, L, hRow3, verde, 'AÑO', { fontSize: FS_DOC, bold: true });
  drawCellCentered(doc, segundoBloqueX + L, yPos, S, hRow3, blanco, String(a.anio ?? '—'), { fontSize: FS_DOC, bold: true });
  yPos += hRow3 + 4;

  const bimLabel = cicloSel;
  const getNota = (item) => {
    const nota = item[`nota_b${bimLabel}`];
    return nota !== null && nota !== '' && nota !== undefined ? String(nota) : '-';
  };

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(FS_DOC);

  const cursosList = datosLibreta.cursos_cualitativos || [];

  const colProm = w * 0.1;
  const colNL = w * 0.09;
  const colArea = w * 0.22;
  const colDesc = Math.max(20, w - colArea - colNL - colProm);

  const hHeadTabla = Math.max(7.4, FS_DOC * 0.72 + 1.6);
  ensureSpace(hHeadTabla + 4);
  drawCellCentered(doc, margin, yPos, colArea, hHeadTabla, verde, 'Áreas', { fontSize: FS_DOC, bold: true });
  drawCellCentered(doc, margin + colArea, yPos, colDesc, hHeadTabla, verde, 'Descripción de los aprendizajes', {
    fontSize: FS_DOC,
    bold: true
  });
  drawCellCentered(doc, margin + colArea + colDesc, yPos, colNL, hHeadTabla, verde, 'NL', { fontSize: FS_DOC, bold: true });
  drawCellCentered(doc, margin + colArea + colDesc + colNL, yPos, colProm, hHeadTabla, verde, 'Prom', {
    fontSize: FS_DOC,
    bold: true
  });
  yPos += hHeadTabla;

  const padCelda = 1.8;
  const fsInd = FS_DOC;
  const xNL = margin + colArea + colDesc;
  const xProm = xNL + colNL;

  cursosList.forEach((curso) => {
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

      const rows = flattenIndicadoresCurso(curso);

      if (rows.length === 0) {
        const rh = Math.max(7.2, rowBase);
        ensureSpace(rh + 2);
        const y0 = yPos;
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.2);
        doc.setFillColor(...blanco);
        doc.rect(margin, y0, colArea, rh, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(FS_DOC);
        doc.setTextColor(0, 0, 0);
        doc.text(nombreCurso, margin + colArea / 2, y0 + rh / 2 + 1.1, { align: 'center', maxWidth: colArea - 2 });
        doc.setFillColor(...blanco);
        doc.rect(margin + colArea, y0, colDesc, rh, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.text('—', margin + colArea + colDesc / 2, y0 + rh / 2 + 1.1, { align: 'center' });
        const stNL = getNotaCualitativaPdfStyle('');
        doc.setFillColor(...stNL.fill);
        doc.rect(xNL, y0, colNL, rh, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...stNL.text);
        doc.text('-', xNL + colNL / 2, y0 + rh / 2 + 1.1, { align: 'center' });
        const stP = getNotaCualitativaPdfStyle(promTxt === '-' ? '' : promTxt);
        doc.setFillColor(...stP.fill);
        doc.rect(xProm, y0, colProm, rh, 'FD');
        doc.setTextColor(...stP.text);
        doc.text(String(promTxt), xProm + colProm / 2, y0 + rh / 2 + 1.1, { align: 'center' });
        yPos = y0 + rh;
        return;
      }

      const rowHs = rows.map((ind) => {
        const descInd = String(ind.descripcion || ind.abreviatura || 'Indicador').trim() || '—';
        const lineas = lineasParaCelda(doc, descInd, Math.max(3, colDesc - padCelda), fsInd, true);
        return Math.max(6.9, lineas.length * lhDoc + 2.6);
      });
      const totalH = rowHs.reduce((acc, h) => acc + h, 0);
      ensureSpace(totalH + 3);
      const y0 = yPos;

      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.2);
      doc.setFillColor(...blanco);
      doc.rect(margin, y0, colArea, totalH, 'FD');
      const lineasArea = lineasParaCelda(doc, nombreCurso, Math.max(2, colArea - padCelda), FS_DOC, true);
      const lhA = lhDoc;
      let ya = y0 + (totalH - lineasArea.length * lhA) / 2 + lhA * 0.72;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(FS_DOC);
      doc.setTextColor(0, 0, 0);
      lineasArea.forEach((ln) => {
        doc.text(ln, margin + colArea / 2, ya, { align: 'center', maxWidth: colArea - 2 });
        ya += lhA;
      });

      const stProm = getNotaCualitativaPdfStyle(promTxt === '-' ? '' : promTxt);
      doc.setFillColor(...stProm.fill);
      doc.rect(xProm, y0, colProm, totalH, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(FS_DOC);
      doc.setTextColor(...stProm.text);
      doc.text(String(promTxt), xProm + colProm / 2, y0 + totalH / 2 + 1.15, { align: 'center' });

      let yRow = y0;
      rows.forEach((ind, i) => {
        const rh = rowHs[i];
        const descInd = String(ind.descripcion || ind.abreviatura || 'Indicador').trim() || '—';
        const lineas = lineasParaCelda(doc, descInd, Math.max(3, colDesc - padCelda), fsInd, true);

        doc.setFillColor(...blanco);
        doc.rect(margin + colArea, yRow, colDesc, rh, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(FS_DOC);
        doc.setTextColor(0, 0, 0);
        const blockInd = lineas.length * lhDoc;
        let yi = yRow + Math.max(2.4, (rh - blockInd) / 2 + lhDoc * 0.72);
        lineas.forEach((ln) => {
          doc.text(ln, margin + colArea + 1.2, yi, { maxWidth: colDesc - 2.4 });
          yi += lhDoc;
        });

        const notaStr = getNota(ind);
        const st = getNotaCualitativaPdfStyle(notaStr);
        doc.setFillColor(...st.fill);
        doc.rect(xNL, yRow, colNL, rh, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(FS_DOC);
        doc.setTextColor(...st.text);
        doc.text(notaStr, xNL + colNL / 2, yRow + rh / 2 + 1.05, { align: 'center' });

        yRow += rh;
      });

      yPos = y0 + totalH;
    });

  yPos += 8;

  if (!(datosLibreta.recomendaciones || '').trim()) {
    yPos += 5;
  }

  /* ——— Observaciones (más separación respecto al cuadro de notas) ——— */
  const resumen = datosLibreta.resumen || {};
  const cicloN = cicloSel || 1;

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
  const hLeyHead = Math.max(6.2, FS_DOC * 0.58 + 1.2);
  const hLeyRow = Math.max(6.2, FS_DOC * 0.58 + 1.2);
  const hSubRom = Math.max(5.4, FS_DOC * 0.52 + 1.1);

  if (textoRecom) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(FS_DOC);
    doc.setTextColor(0, 0, 0);
    doc.text('Observaciones del tutor(a)', margin, yPos);
    yPos += 4.8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(FS_DOC);
    const recLines = doc.splitTextToSize(textoRecom, contentWidth - 2);
    recLines.slice(0, 8).forEach((ln) => {
      ensureSpace(4);
      doc.text(ln, margin, yPos);
      yPos += lhDoc + 0.35;
    });
    yPos += 3.5;
  }

  ensureSpace(165);
  const yLey = yPos;
  let hResumenTotal = 0;
  const hSemaTotal = 0;
  let hEscalaTotal = 0;

  const wResumenPie = wPieTotal * 0.48;
  const wEscala = Math.max(78, wPieTotal - wResumenPie - gapPie);
  let xL = margin;

  const labR = wResumenPie * 0.42;
  const colBimW = (wResumenPie - labR) / 4;
  let yR = yLey;
  drawCellCentered(doc, xL, yR, wResumenPie, hLeyHead, verde, 'REGISTRO DE ASISTENCIA', { fontSize: FS_DOC, bold: true });
  yR += hLeyHead;
  drawCellCentered(doc, xL, yR, labR, hSubRom, verde, '', { fontSize: FS_DOC });
  for (let i = 0; i < 4; i++) {
    const rom = ['I', 'II', 'III', 'IV'][i];
    drawCellCentered(doc, xL + labR + i * colBimW, yR, colBimW, hSubRom, verde, rom, { fontSize: FS_DOC, bold: true });
  }
  yR += hSubRom;

  const filaResBim = (etiq, fnVal) => {
    drawCellCentered(doc, xL, yR, labR, hLeyRow, verde, etiq, { fontSize: FS_DOC, bold: true });
    for (let i = 0; i < 4; i++) {
      drawCellCentered(doc, xL + labR + i * colBimW, yR, colBimW, hLeyRow, blanco, fnVal(i), { fontSize: FS_DOC, bold: true });
    }
    yR += hLeyRow;
  };

  filaResBim('N° INASISTENCIAS', valBimInas);
  filaResBim('N° TARDANZAS', valBimTard);
  hResumenTotal = yR - yLey;

  const xEsc = margin + wResumenPie + gapPie;
  drawCellCentered(doc, xEsc, yLey, wEscala, hLeyHead, verde, 'ESCALA', { fontSize: FS_DOC, bold: true });
  const leyLetraW = wEscala * 0.1;
  const wTxtCol = wEscala - leyLetraW - 2.2;
  let yy = yLey + hLeyHead;
  const lhTit = lhDoc;
  const lhBody = lhDoc;
  const innerW = wEscala - leyLetraW;
  const xTxtMid = xEsc + leyLetraW + innerW / 2;
  const maxTxt = Math.max(16, wTxtCol - 1.4);

  ESCALA_INICIAL_DETALLE.forEach(({ letra, titulo, texto }) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(FS_DOC);
    const tituloUpper = String(titulo || '').toUpperCase();
    const lineasTit = doc.splitTextToSize(tituloUpper, maxTxt);
    const lineasBody = doc.splitTextToSize(String(texto || ''), maxTxt);
    const rowH = Math.max(11.5, 1.1 + lineasTit.length * lhTit + lineasBody.length * lhBody + 0.5);

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.setFillColor(...verde);
    doc.rect(xEsc, yy, leyLetraW, rowH, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(FS_DOC);
    doc.setTextColor(0, 0, 0);
    doc.text(letra, xEsc + leyLetraW / 2, yy + rowH / 2 + 1.05, { align: 'center' });

    doc.setFillColor(...blanco);
    doc.rect(xEsc + leyLetraW, yy, wEscala - leyLetraW, rowH, 'FD');
    const blockTxtH = lineasTit.length * lhTit + lineasBody.length * lhBody;
    let yt = yy + Math.max(1, (rowH - blockTxtH) / 2 + lhTit * 0.72);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(FS_DOC);
    doc.setTextColor(0, 0, 0);
    lineasTit.forEach((ln) => {
      doc.text(ln, xTxtMid, yt, { align: 'center', maxWidth: maxTxt });
      yt += lhTit;
    });
    lineasBody.forEach((ln) => {
      doc.text(ln, xTxtMid, yt, { align: 'center', maxWidth: maxTxt });
      yt += lhBody;
    });
    yy += rowH;
  });
  hEscalaTotal = yy - yLey;

  const hPie = Math.max(hResumenTotal, hSemaTotal, hEscalaTotal);
  yPos = yLey + hPie + 4;

  /* ——— Firmas (líneas más cortas, centradas en cada mitad) ——— */
  yPos += 20;
  ensureSpace(28);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.45);
  const anchoLinFirma = Math.min(52, contentWidth * 0.26);
  const gapCentroFirma = 18;
  const centroCont = margin + contentWidth / 2;
  const xLinIzq = centroCont - gapCentroFirma / 2 - anchoLinFirma;
  const xLinDer = centroCont + gapCentroFirma / 2;
  const yLinea = yPos;
  doc.line(xLinIzq, yLinea, xLinIzq + anchoLinFirma, yLinea);
  doc.line(xLinDer, yLinea, xLinDer + anchoLinFirma, yLinea);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(FS_DOC);
  doc.setTextColor(0, 0, 0);
  doc.text('FIRMA DEL DOCENTE', xLinIzq + anchoLinFirma / 2, yLinea + 8, { align: 'center' });
  doc.text('FIRMA DIRECCION', xLinDer + anchoLinFirma / 2, yLinea + 8, { align: 'center' });
}
