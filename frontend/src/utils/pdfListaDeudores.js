import { jsPDF } from 'jspdf';

const HEADER_BLUE = [30, 64, 175];
const HEADER_TEXT = [255, 255, 255];
const BORDER = [200, 210, 230];
const ROW_H_MM = 13;
const HEADER_BAND_MM = 9;

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

/**
 * @param {object} opts
 * @param {string} opts.colegioNombre
 * @param {number} opts.anio
 * @param {string} opts.moneda
 * @param {string} opts.concepto
 * @param {'todo'|'por_grado'} opts.modoAgrupacion
 * @param {Array<object>} opts.filas — cada fila: nombre, grado_etiqueta, monto, telefono_apoderado, grado_agrupacion_titulo, grado_agrupacion_key
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

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;
  const innerW = pageW - margin * 2;
  const bottomSafe = 16;

  const cols = {
    n: { x: 0, w: 10 },
    alumno: { x: 10, w: 58 },
    grado: { x: 68, w: 20 },
    monto: { x: 88, w: 26 },
    tel: { x: 114, w: 32 },
    obs: { x: 146, w: innerW - 146 }
  };

  const colXs = (base) => margin + base;

  function drawMainHeader(yStart) {
    doc.setFillColor(...HEADER_BLUE);
    doc.rect(margin, yStart, innerW, HEADER_BAND_MM, 'F');
    doc.setTextColor(...HEADER_TEXT);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('LISTA DE DEUDORES', margin + 3, yStart + 6.2);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    const sub = `${safeTxt(colegioNombre)} · Año ${anio} · Concepto: ${safeTxt(concepto)}`;
    const subLines = doc.splitTextToSize(sub, innerW - 6);
    doc.text(subLines, margin + 3, yStart + HEADER_BAND_MM + 5);
    doc.setTextColor(0, 0, 0);
    return yStart + HEADER_BAND_MM + 5 + subLines.length * 4.2 + 3;
  }

  function drawTableHeader(y) {
    doc.setFillColor(...HEADER_BLUE);
    doc.rect(margin, y, innerW, 8, 'F');
    doc.setDrawColor(...BORDER);
    doc.setTextColor(...HEADER_TEXT);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('N°', colXs(cols.n.x) + 1, y + 5.2);
    doc.text('ALUMNO', colXs(cols.alumno.x) + 1, y + 5.2);
    doc.text('GRADO', colXs(cols.grado.x) + 1, y + 5.2);
    doc.text('MONTO', colXs(cols.monto.x) + 1, y + 5.2);
    doc.text('TEL. APODERADO', colXs(cols.tel.x) + 1, y + 5.2);
    doc.text('OBSERVACIONES', colXs(cols.obs.x) + 1, y + 5.2);
    doc.setTextColor(0, 0, 0);
    return y + 8;
  }

  function strokeRowFrame(y) {
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.rect(margin, y, innerW, ROW_H_MM);
    let x = margin;
    for (const key of ['n', 'alumno', 'grado', 'monto', 'tel']) {
      x += cols[key].w;
      doc.line(x, y, x, y + ROW_H_MM);
    }
  }

  function drawDataRow(y, idx, row) {
    strokeRowFrame(y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(30, 30, 30);
    doc.text(String(idx), colXs(cols.n.x) + cols.n.w / 2, y + 5.5, { align: 'center' });

    const nombre = safeTxt(row.nombre);
    const nameLines = doc.splitTextToSize(nombre, cols.alumno.w - 2);
    doc.text(nameLines.slice(0, 2), colXs(cols.alumno.x) + 1, y + 4.8);

    const gr = safeTxt(row.grado_etiqueta);
    doc.text(doc.splitTextToSize(gr, cols.grado.w - 2).slice(0, 2), colXs(cols.grado.x) + 1, y + 5.5);

    doc.setFont('helvetica', 'bold');
    doc.text(fmtMonto(row.monto, moneda), colXs(cols.monto.x) + 1, y + 5.5);
    doc.setFont('helvetica', 'normal');
    const tel = safeTxt(row.telefono_apoderado) || '—';
    doc.text(doc.splitTextToSize(tel, cols.tel.w - 2).slice(0, 2), colXs(cols.tel.x) + 1, y + 5.5);
    return y + ROW_H_MM;
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
      doc.text(sec.titulo, margin + 2, y + 5);
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
          doc.text(`${sec.titulo} (continúa)`, margin + 2, y + 5);
          doc.setTextColor(0, 0, 0);
          y += 9;
        }
        y = drawTableHeader(y);
      }
      y = drawDataRow(y, num, row);
      num += 1;
    }
  }

  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p += 1) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`Página ${p} de ${totalPages}`, pageW - margin - 28, pageH - 8);
    doc.setTextColor(0, 0, 0);
  }

  const safeColegio = safeTxt(colegioNombre).replace(/[^\w\-]+/g, '_').slice(0, 40) || 'colegio';
  doc.save(`deudores_${safeColegio}_${anio}.pdf`);
}
