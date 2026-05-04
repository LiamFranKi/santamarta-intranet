import { jsPDF } from 'jspdf';

/** Azul uniforme (sin gradiente) para cabeceras */
const HEADER_BLUE = [30, 64, 175];
const HEADER_TEXT = [255, 255, 255];
const BORDER = [190, 200, 220];
const FOOTER_BG = [224, 231, 255];
const FOOTER_TEXT = [30, 27, 75];
const ROW_H_MM = 13;
const HEADER_BAND_MM = 9;
const TABLE_HEAD_H = 7.5;

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

/** Anchos en mm; la última columna absorbe el remanente para sumar exactamente innerW. */
function buildColumns(innerW) {
  const wN = innerW * 0.055;
  const wAl = innerW * 0.31;
  const wGr = innerW * 0.12;
  const wMo = innerW * 0.135;
  const wTe = innerW * 0.175;
  const sum5 = wN + wAl + wGr + wMo + wTe;
  const wOb = innerW - sum5;
  return [
    { key: 'n', w: wN },
    { key: 'alumno', w: wAl },
    { key: 'grado', w: wGr },
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

/**
 * @param {object} opts
 * @param {string} [opts.colegioNombre]
 * @param {number} opts.anio
 * @param {string} [opts.moneda]
 * @param {string} [opts.concepto]
 * @param {'todo'|'por_grado'} [opts.modoAgrupacion]
 * @param {Array<object>} opts.filas
 * @param {number} [opts.totalAlumnos]
 * @param {number} [opts.totalDeuda]
 */
export function generarPdfListaDeudores(opts) {
  const {
    colegioNombre = '',
    anio,
    moneda = 'S/',
    concepto = '',
    modoAgrupacion = 'todo',
    filas = []
  } = opts;

  const totalAlumnos =
    typeof opts.totalAlumnos === 'number'
      ? opts.totalAlumnos
      : filas.length;
  const totalDeuda =
    typeof opts.totalDeuda === 'number'
      ? opts.totalDeuda
      : Math.round(filas.reduce((s, r) => s + (parseFloat(r.monto) || 0), 0) * 100) / 100;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;
  const innerW = pageW - margin * 2;
  const bottomSafe = 18;
  const cols = buildColumns(innerW);

  function drawMainHeader(yStart) {
    doc.setFillColor(...HEADER_BLUE);
    doc.rect(margin, yStart, innerW, HEADER_BAND_MM, 'F');
    doc.setTextColor(...HEADER_TEXT);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('LISTA DE DEUDORES', margin + innerW / 2, yStart + 6.2, { align: 'center' });
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    const sub = `${safeTxt(colegioNombre)} · Año ${anio} · Concepto: ${safeTxt(concepto)}`;
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
    const labels = ['N°', 'ALUMNO', 'GRADO', 'MONTO', 'TEL. APODERADO', 'OBSERVACIONES'];
    doc.setTextColor(...HEADER_TEXT);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    const positioned = colStarts(margin, cols);
    for (let i = 0; i < positioned.length; i += 1) {
      const c = positioned[i];
      doc.text(labels[i], c.x0 + c.w / 2, y + TABLE_HEAD_H / 2 + 2.2, { align: 'center' });
    }
    doc.setTextColor(0, 0, 0);
    return y + TABLE_HEAD_H;
  }

  function strokeRowFrame(y) {
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.rect(margin, y, innerW, ROW_H_MM);
    const positioned = colStarts(margin, cols);
    for (let i = 1; i < positioned.length; i += 1) {
      const x = positioned[i].x0;
      doc.line(x, y, x, y + ROW_H_MM);
    }
  }

  function drawDataRow(y, idx, row) {
    strokeRowFrame(y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(35, 35, 35);
    const positioned = colStarts(margin, cols);

    doc.text(String(idx), positioned[0].x0 + positioned[0].w / 2, y + ROW_H_MM / 2 + 2.6, {
      align: 'center'
    });

    const nombre = safeTxt(row.nombre);
    const nameLines = doc.splitTextToSize(nombre, positioned[1].w - 2).slice(0, 2);
    doc.text(nameLines, positioned[1].x0 + positioned[1].w / 2, y + 4.8, {
      align: 'center',
      lineHeightFactor: 1.05
    });

    const gr = safeTxt(row.grado_etiqueta);
    const grLines = doc.splitTextToSize(gr, positioned[2].w - 2).slice(0, 2);
    doc.text(grLines, positioned[2].x0 + positioned[2].w / 2, y + 4.8, {
      align: 'center',
      lineHeightFactor: 1.05
    });

    doc.setFont('helvetica', 'bold');
    doc.text(fmtMonto(row.monto, moneda), positioned[3].x0 + positioned[3].w / 2, y + ROW_H_MM / 2 + 2.5, {
      align: 'center'
    });
    doc.setFont('helvetica', 'normal');
    const tel = safeTxt(row.telefono_apoderado) || '—';
    const telLines = doc.splitTextToSize(tel, positioned[4].w - 2).slice(0, 2);
    doc.text(telLines, positioned[4].x0 + positioned[4].w / 2, y + 4.8, {
      align: 'center',
      lineHeightFactor: 1.05
    });
    return y + ROW_H_MM;
  }

  function drawFooterTotals(y) {
    const rowH = 6.5;
    const need = rowH * 2 + 2;
    if (y + need > pageH - bottomSafe) {
      doc.addPage();
      y = margin;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...FOOTER_TEXT);

    doc.setFillColor(...FOOTER_BG);
    doc.rect(margin, y, innerW, rowH, 'F');
    doc.setDrawColor(...BORDER);
    doc.rect(margin, y, innerW, rowH, 'S');
    doc.text('Total alumnos', margin + 3, y + rowH / 2 + 2.8);
    doc.text(String(totalAlumnos), margin + innerW - 3, y + rowH / 2 + 2.8, { align: 'right' });
    y += rowH;

    doc.setFillColor(...FOOTER_BG);
    doc.rect(margin, y, innerW, rowH, 'F');
    doc.rect(margin, y, innerW, rowH, 'S');
    doc.text('Total deuda', margin + 3, y + rowH / 2 + 2.8);
    doc.text(fmtMonto(totalDeuda, moneda), margin + innerW - 3, y + rowH / 2 + 2.8, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    return y + rowH;
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
    modoAgrupacion === 'por_grado' && filas.length
      ? agruparPorGrado(filas)
      : [{ titulo: null, filas }];

  let firstSection = true;

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

    let num = 1;
    for (const row of sec.filas) {
      if (y + ROW_H_MM > pageH - bottomSafe) {
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
      y = drawDataRow(y, num, row);
      num += 1;
    }
  }

  y = drawFooterTotals(y);

  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p += 1) {
    doc.setPage(p);
    doc.setFontSize(7.5);
    doc.setTextColor(120, 120, 120);
    doc.text(`Página ${p} de ${totalPages}`, pageW - margin - 26, pageH - 7);
    doc.setTextColor(0, 0, 0);
  }

  const safeColegio = safeTxt(colegioNombre).replace(/[^\w-]+/g, '_').slice(0, 40) || 'colegio';
  doc.save(`deudores_${safeColegio}_${anio}.pdf`);
}
