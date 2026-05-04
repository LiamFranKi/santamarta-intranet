import { jsPDF } from 'jspdf';

const HEADER_BLUE = [30, 64, 175];
const HEADER_TEXT = [255, 255, 255];
const BORDER = [190, 200, 220];
const ROW_H_BASE_MM = 14;
const HEADER_BAND_MM = 9;
const TABLE_HEAD_H = 8;
const CELL_LINE_MM = 3.2;

function fmtMonto(n, moneda) {
  if (n == null || n === '') return '—';
  const v = typeof n === 'number' ? n : parseFloat(n);
  if (Number.isNaN(v)) return '—';
  return `${moneda || 'S/'} ${v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function safeTxt(s) {
  if (s == null) return '';
  return String(s).replace(/\r?\n/g, ' ').trim();
}

function textoObservacionRow(row) {
  return safeTxt(row.detalle ?? row.observaciones ?? row.observaciones_tutor ?? '');
}

function drawTextCellVCentered(doc, lines, cx, yTop, rowH, maxW, opts = {}) {
  doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
  let wrapped;
  if (Array.isArray(lines)) {
    wrapped = lines.map((l) => safeTxt(l)).filter(Boolean).slice(0, 2);
  } else {
    wrapped = doc.splitTextToSize(safeTxt(lines), maxW).slice(0, 2);
  }
  if (!wrapped.length) return;
  const n = wrapped.length;
  const blockH = n * CELL_LINE_MM;
  const y0 = yTop + (rowH - blockH) / 2 + CELL_LINE_MM * 0.78;
  if (n === 1) {
    doc.text(wrapped[0], cx, yTop + rowH / 2 + 2.5, { align: 'center', maxWidth: maxW });
  } else {
    doc.text(wrapped, cx, y0, { align: 'center', lineHeightFactor: 1.06, maxWidth: maxW });
  }
}

/** Detalle / observaciones: centrado horizontal y vertical en la celda */
function drawObsCellCentered(doc, text, x0, yTop, w, h) {
  const t = safeTxt(text);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.3);
  doc.setTextColor(35, 35, 35);
  if (!t) return;
  const lines = doc.splitTextToSize(t, w - 3).slice(0, 14);
  if (!lines.length) return;
  const lineH = 2.55;
  const blockH = lines.length * lineH * 1.05;
  let yy = yTop + Math.max((h - blockH) / 2 + lineH * 0.85, 2.6);
  const cx = x0 + w / 2;
  for (const line of lines) {
    if (yy > yTop + h - 1) break;
    doc.text(line, cx, yy, { align: 'center', maxWidth: w - 3 });
    yy += lineH;
  }
}

/** 6 columnas: grado arriba + nivel abajo; tel algo más angosto; última absorbe resto (DETALLE / obs. tutor) */
function buildColumnsListaDeudores(innerW) {
  const wAl = innerW * 0.22;
  const wGr = innerW * 0.14;
  const wCo = innerW * 0.14;
  const wMo = innerW * 0.1;
  const wTe = innerW * 0.1;
  const sum = wAl + wGr + wCo + wMo + wTe;
  const wOb = innerW - sum;
  return [
    { key: 'alumno', w: wAl },
    { key: 'grado', w: wGr },
    { key: 'concepto', w: wCo },
    { key: 'monto', w: wMo },
    { key: 'tel', w: wTe },
    { key: 'obs', w: wOb }
  ];
}

function colStarts(margin, cols) {
  const out = [];
  let x = margin;
  for (const c of cols) {
    out.push({ ...c, x0: x });
    x += c.w;
  }
  return out;
}

function computeRowHeight(doc, row, wObs) {
  const obs = textoObservacionRow(row);
  if (!obs) return ROW_H_BASE_MM;
  doc.setFontSize(6.3);
  const n = doc.splitTextToSize(obs, wObs - 3).length;
  return Math.min(42, Math.max(ROW_H_BASE_MM, 5.5 + Math.min(n, 14) * 2.55));
}

/**
 * @param {object} opts
 * @param {'admin'|'tutor'} [opts.variant]
 * @param {string} [opts.grupoEtiqueta] — subtítulo si variant tutor
 * @param {string} [opts.nombreArchivo] — nombre al guardar (sin forzar extensión .pdf)
 */
export function generarPdfListaDeudores(opts) {
  const {
    colegioNombre = '',
    anio,
    moneda = 'S/',
    concepto = '',
    modoAgrupacion = 'todo',
    filas = [],
    variant = 'admin',
    grupoEtiqueta = ''
  } = opts;

  const totalDeuda =
    typeof opts.totalDeuda === 'number'
      ? opts.totalDeuda
      : Math.round(filas.reduce((s, r) => s + (parseFloat(r.monto) || 0), 0) * 100) / 100;

  const totalAlumnosUnicos =
    typeof opts.totalAlumnosUnicos === 'number'
      ? opts.totalAlumnosUnicos
      : new Set(filas.map((r) => r.alumno_id)).size;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;
  const innerW = pageW - margin * 2;
  const bottomSafe = 20;
  const isTutor = variant === 'tutor';
  const cols = buildColumnsListaDeudores(innerW);
  const tableLabels = isTutor
    ? ['ALUMNO', 'GRADO / NIVEL', 'CONCEPTO', 'MONTO', 'TEL. APODERADO', 'OBSERVACIONES']
    : ['ALUMNO', 'GRADO / NIVEL', 'CONCEPTO', 'MONTO', 'TEL. APODERADO', 'DETALLE'];

  function drawMainHeader(yStart) {
    doc.setFillColor(...HEADER_BLUE);
    doc.rect(margin, yStart, innerW, HEADER_BAND_MM, 'F');
    doc.setTextColor(...HEADER_TEXT);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    const titulo = isTutor ? 'DEUDORES — TUTORÍA' : 'LISTA DE DEUDORES';
    doc.text(titulo, margin + innerW / 2, yStart + 6.2, { align: 'center' });
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    let sub = `${safeTxt(colegioNombre)} · Año ${anio} · Concepto: ${safeTxt(concepto)}`;
    if (isTutor && grupoEtiqueta) {
      sub += ` · Grupo: ${safeTxt(grupoEtiqueta)}`;
    }
    const subLines = doc.splitTextToSize(sub, innerW - 6);
    doc.text(subLines, margin + innerW / 2, yStart + HEADER_BAND_MM + 4.8, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    return yStart + HEADER_BAND_MM + 4.5 + subLines.length * 4.1 + 2;
  }

  function drawTableHeader(y) {
    doc.setFillColor(...HEADER_BLUE);
    doc.rect(margin, y, innerW, TABLE_HEAD_H, 'F');
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.15);
    doc.setTextColor(...HEADER_TEXT);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    const positioned = colStarts(margin, cols);
    for (let i = 0; i < positioned.length; i += 1) {
      const c = positioned[i];
      doc.text(tableLabels[i], c.x0 + c.w / 2, y + TABLE_HEAD_H / 2 + 2.35, { align: 'center' });
    }
    doc.setTextColor(0, 0, 0);
    return y + TABLE_HEAD_H;
  }

  function strokeRowFrame(y, rowH) {
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.rect(margin, y, innerW, rowH);
    const positioned = colStarts(margin, cols);
    for (let i = 1; i < positioned.length; i += 1) {
      const x = positioned[i].x0;
      doc.line(x, y, x, y + rowH);
    }
  }

  function drawDataRow(y, row, rowH) {
    strokeRowFrame(y, rowH);
    doc.setFontSize(8);
    doc.setTextColor(35, 35, 35);
    const positioned = colStarts(margin, cols);
    const wObs = positioned[positioned.length - 1].w;

    const nombre = safeTxt(row.nombre);
    const nameWrapped = doc.splitTextToSize(nombre, positioned[0].w - 2).slice(0, 2);
    drawTextCellVCentered(
      doc,
      nameWrapped,
      positioned[0].x0 + positioned[0].w / 2,
      y,
      rowH,
      positioned[0].w - 2
    );

    const gradoLine = safeTxt(row.grado_etiqueta) || '—';
    const nivelLine = safeTxt(row.nivel_nombre) || '—';
    drawTextCellVCentered(
      doc,
      [gradoLine, nivelLine],
      positioned[1].x0 + positioned[1].w / 2,
      y,
      rowH,
      positioned[1].w - 2
    );

    const con = safeTxt(row.concepto) || '—';
    const conWrapped = doc.splitTextToSize(con, positioned[2].w - 2).slice(0, 2);
    drawTextCellVCentered(
      doc,
      conWrapped,
      positioned[2].x0 + positioned[2].w / 2,
      y,
      rowH,
      positioned[2].w - 2
    );

    drawTextCellVCentered(
      doc,
      [fmtMonto(row.monto, moneda)],
      positioned[3].x0 + positioned[3].w / 2,
      y,
      rowH,
      positioned[3].w - 1,
      { bold: true }
    );

    const tel = safeTxt(row.telefono_apoderado) || '—';
    const telWrapped = doc.splitTextToSize(tel, positioned[4].w - 2).slice(0, 2);
    drawTextCellVCentered(
      doc,
      telWrapped,
      positioned[4].x0 + positioned[4].w / 2,
      y,
      rowH,
      positioned[4].w - 2
    );

    drawObsCellCentered(doc, textoObservacionRow(row), positioned[5].x0, y, wObs, rowH);

    return y + rowH;
  }

  function drawSummaryLineFooter(y) {
    const bandH = 9;
    if (y + bandH > pageH - bottomSafe) {
      doc.addPage();
      y = margin;
    }
    doc.setDrawColor(...HEADER_BLUE);
    doc.setLineWidth(0.45);
    doc.line(margin, y, margin + innerW, y);
    y += 1.2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    const left = `Total alumnos (${totalAlumnosUnicos})`;
    const right = `Monto total ${fmtMonto(totalDeuda, moneda)}`;
    doc.text(left, margin + 1, y + 6);
    doc.text(right, margin + innerW - 1, y + 6, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    return y + bandH;
  }

  function agruparPorGrado(list) {
    const map = new Map();
    for (const r of list) {
      const key = r.grado_agrupacion_key || `${r.nivel_id}|${r.grado}`;
      const titulo = r.grado_agrupacion_titulo || safeTxt(r.grado_etiqueta);
      if (!map.has(key)) map.set(key, { titulo, filas: [] });
      map.get(key).filas.push(r);
    }
    return [...map.entries()]
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'es', { sensitivity: 'base' }))
      .map(([, v]) => v);
  }

  let y = margin;
  y = drawMainHeader(y);

  const secciones =
    !isTutor && modoAgrupacion === 'por_grado' && filas.length
      ? agruparPorGrado(filas)
      : [{ titulo: null, filas }];

  let firstSection = true;
  const wObsCol = cols[cols.length - 1].w;

  for (const sec of secciones) {
    if (!firstSection) {
      doc.addPage();
      y = margin;
      y = drawMainHeader(y);
    }
    firstSection = false;

    if (sec.titulo) {
      doc.setFillColor(230, 238, 255);
      doc.setDrawColor(...BORDER);
      doc.rect(margin, y, innerW, 7, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(30, 50, 100);
      doc.text(sec.titulo, margin + innerW / 2, y + 4.8, { align: 'center' });
      doc.setTextColor(0, 0, 0);
      y += 9;
    }

    y = drawTableHeader(y);

    for (const row of sec.filas) {
      const rowH = computeRowHeight(doc, row, wObsCol);
      if (y + rowH > pageH - bottomSafe) {
        doc.addPage();
        y = margin;
        y = drawMainHeader(y);
        if (sec.titulo) {
          doc.setFillColor(230, 238, 255);
          doc.rect(margin, y, innerW, 7, 'FD');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(30, 50, 100);
          doc.text(`${sec.titulo} (continúa)`, margin + innerW / 2, y + 4.8, { align: 'center' });
          doc.setTextColor(0, 0, 0);
          y += 9;
        }
        y = drawTableHeader(y);
      }
      y = drawDataRow(y, row, rowH);
    }
  }

  y = drawSummaryLineFooter(y);

  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p += 1) {
    doc.setPage(p);
    doc.setFontSize(7.5);
    doc.setTextColor(120, 120, 120);
    doc.text(`Página ${p} de ${totalPages}`, pageW - margin - 26, pageH - 7);
    doc.setTextColor(0, 0, 0);
  }

  const baseNombre =
    opts.nombreArchivo ||
    `deudores_${safeTxt(colegioNombre).replace(/[^\w-]+/g, '_').slice(0, 40) || 'colegio'}_${anio}`;
  const nombre = baseNombre.endsWith('.pdf') ? baseNombre : `${baseNombre}.pdf`;
  doc.save(nombre);
}
