import { jsPDF } from 'jspdf';
import { obtenerLogoColegioParaPdf, dibujarLogoEsquina } from './pdfReporteColegioLogo';
import { PDF_HEADER_BLUE, PDF_BORDER, safeTxtPdf, textoCentradoCelda } from './pdfReportesGeneralTheme';

const MARGIN = 10;
const ROW_H = 8;
const HEAD_H = 8;
const BOTTOM_SAFE = 22;

function safeTxt(s) {
  return safeTxtPdf(s);
}

function fmtMonto(n, moneda) {
  if (n == null || n === '') return '—';
  const v = typeof n === 'number' ? n : parseFloat(n);
  if (Number.isNaN(v)) return '—';
  return `${moneda || 'S/'} ${v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function agruparPorGrado(filas) {
  const map = new Map();
  for (const r of filas || []) {
    const key = r.grado_agrupacion_key || `${r.nivel_id}|${r.grado}`;
    const titulo = r.grado_agrupacion_titulo || safeTxt(r.grado_seccion);
    if (!map.has(key)) map.set(key, { titulo, filas: [] });
    map.get(key).filas.push(r);
  }
  return [...map.values()];
}

function buildColumns(innerW) {
  const ratios = [0.2, 0.09, 0.09, 0.12, 0.09, 0.11, 0.14, 0.16];
  const cols = ratios.map((r, i) => ({
    key: ['alumno', 'grupo', 'dni', 'concepto', 'monto', 'tel', 'email', 'dir'][i],
    w: innerW * r,
  }));
  const sum = cols.reduce((s, c) => s + c.w, 0);
  cols[cols.length - 1].w += innerW - sum;
  return cols;
}

const LABELS = [
  'ALUMNO',
  'GRUPO',
  'DNI',
  'CONCEPTO',
  'MONTO',
  'TEL. APODERADO',
  'EMAIL APODERADO',
  'DIRECCIÓN',
];

/**
 * @param {'deudor'|'pagador'} modo
 */
export async function generarPdfAlumnosDeudoresPagadores(opts) {
  const {
    colegioNombre = '',
    anio,
    moneda = 'S/',
    concepto = '',
    sede_etiqueta = '',
    modo = 'deudor',
    filas = [],
    total_monto: totalMontoOpt,
    total_registros: totalRegOpt,
  } = opts;

  const logo = await obtenerLogoColegioParaPdf();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const innerW = pageW - MARGIN * 2;
  const cols = buildColumns(innerW);
  const tituloReporte = modo === 'pagador' ? 'LISTA DE ALUMNOS PAGADORES' : 'LISTA DE ALUMNOS DEUDORES';

  const totalMonto =
    typeof totalMontoOpt === 'number'
      ? totalMontoOpt
      : Math.round((filas || []).reduce((s, r) => s + (parseFloat(r.monto) || 0), 0) * 100) / 100;
  const totalReg = typeof totalRegOpt === 'number' ? totalRegOpt : (filas || []).length;

  function drawHeader(yStart) {
    const logoH = dibujarLogoEsquina(doc, logo, { margin: MARGIN });
    let y = Math.max(yStart, MARGIN + logoH);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 64, 175);
    doc.text(safeTxt(colegioNombre), pageW - MARGIN, y, { align: 'right' });
    y += 6;
    doc.setFontSize(10);
    doc.text(`${tituloReporte} — ${anio}`, pageW - MARGIN, y, { align: 'right' });
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    let sub = `Concepto: ${safeTxt(concepto)}`;
    if (sede_etiqueta) sub += ` · Sede: ${safeTxt(sede_etiqueta)}`;
    doc.text(sub, pageW - MARGIN, y, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    return y + 8;
  }

  function drawTableHead(y) {
    doc.setFillColor(...PDF_HEADER_BLUE);
    doc.rect(MARGIN, y, innerW, HEAD_H, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    let x = MARGIN;
    LABELS.forEach((lb, i) => {
      doc.text(lb, x + cols[i].w / 2, y + 5.2, { align: 'center', maxWidth: cols[i].w - 1 });
      x += cols[i].w;
    });
    doc.setTextColor(35, 35, 35);
    return y + HEAD_H;
  }

  function drawRow(y, row) {
    doc.setDrawColor(...PDF_BORDER);
    doc.rect(MARGIN, y, innerW, ROW_H);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    let x = MARGIN;
    const vals = [
      row.alumno_nombre,
      row.grado_seccion,
      row.nro_documento,
      row.concepto,
      fmtMonto(row.monto, moneda),
      row.telefono_apoderado || '—',
      row.email_apoderado || '—',
      row.direccion || '—',
    ];
    vals.forEach((v, i) => {
      const w = cols[i].w;
      textoCentradoCelda(doc, v, x, y + 5, w, 2);
      x += w;
      doc.line(x, y, x, y + ROW_H);
    });
    return y + ROW_H;
  }

  function drawFooter(y) {
    if (y + 10 > pageH - BOTTOM_SAFE) {
      doc.addPage();
      y = drawHeader(MARGIN);
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(30, 64, 175);
    doc.text(`Total registros: ${totalReg}`, MARGIN, y + 6);
    doc.text(`Monto total: ${fmtMonto(totalMonto, moneda)}`, pageW - MARGIN, y + 6, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    return y + 12;
  }

  const secciones = (filas || []).length ? agruparPorGrado(filas) : [{ titulo: null, filas: [] }];
  let y = drawHeader(MARGIN);
  let first = true;

  for (const sec of secciones) {
    if (!first) {
      doc.addPage();
      y = drawHeader(MARGIN);
    }
    first = false;

    if (sec.titulo) {
      doc.setFillColor(230, 238, 255);
      doc.rect(MARGIN, y, innerW, 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(30, 50, 100);
      doc.text(sec.titulo, MARGIN + innerW / 2, y + 4.8, { align: 'center' });
      doc.setTextColor(0, 0, 0);
      y += 8;
    }

    y = drawTableHead(y);
    for (const row of sec.filas) {
      if (y + ROW_H > pageH - BOTTOM_SAFE) {
        doc.addPage();
        y = drawHeader(MARGIN);
        if (sec.titulo) {
          doc.setFillColor(230, 238, 255);
          doc.rect(MARGIN, y, innerW, 7, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.text(`${sec.titulo} (continúa)`, MARGIN + innerW / 2, y + 4.8, { align: 'center' });
          y += 8;
        }
        y = drawTableHead(y);
      }
      y = drawRow(y, row);
    }
  }

  drawFooter(y);

  const slug = modo === 'pagador' ? 'pagadores' : 'deudores';
  doc.save(`${slug}_general_${anio}.pdf`);
}
