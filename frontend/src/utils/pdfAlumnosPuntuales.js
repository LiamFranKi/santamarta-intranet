import { jsPDF } from 'jspdf';
import { obtenerLogoColegioParaPdf } from './pdfReporteColegioLogo';
import {
  PDF_HEADER_BLUE,
  PDF_BORDER,
  PDF_PAGE_MARGIN,
  safeTxtPdf,
  textoCentradoCelda,
  dibujarCabeceraReportePdf,
} from './pdfReportesGeneralTheme';

const MARGIN = PDF_PAGE_MARGIN;
const ROW_H = 8;
const HEAD_H = 8;
const BOTTOM_SAFE = 22;

function fmtMonto(n, moneda) {
  if (n == null || n === '') return '—';
  const v = typeof n === 'number' ? n : parseFloat(n);
  if (Number.isNaN(v)) return '—';
  return `${moneda || 'S/'} ${v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtFecha(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return safeTxtPdf(v);
  return d.toLocaleDateString('es-PE');
}

function agruparPorGrado(filas) {
  const map = new Map();
  for (const r of filas || []) {
    const key = r.grado_agrupacion_key || `${r.nivel_id}|${r.grado}`;
    const titulo = r.grado_agrupacion_titulo || safeTxtPdf(r.grado_seccion);
    if (!map.has(key)) map.set(key, { titulo, filas: [] });
    map.get(key).filas.push(r);
  }
  return [...map.values()];
}

function buildColumns(innerW) {
  const ratios = [0.26, 0.1, 0.1, 0.12, 0.14, 0.14, 0.14];
  const cols = ratios.map((r, i) => ({
    key: ['alumno', 'grupo', 'dni', 'pension', 'fecha', 'tel', 'email'][i],
    w: innerW * r,
  }));
  const sum = cols.reduce((s, c) => s + c.w, 0);
  cols[cols.length - 1].w += innerW - sum;
  return cols;
}

const LABELS = ['ALUMNO', 'GRUPO', 'DNI', 'PENSIÓN', 'FECHA ÚLT. MES', 'TEL. APODERADO', 'EMAIL APODERADO'];

export async function generarPdfAlumnosPuntuales(opts) {
  const {
    colegioNombre = '',
    anio,
    moneda = 'S/',
    mes_etiqueta = '',
    sede_etiqueta = '',
    filas = [],
    total_monto_pension: totalMontoOpt,
    total_registros: totalRegOpt,
  } = opts;

  const logo = await obtenerLogoColegioParaPdf();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const innerW = pageW - MARGIN * 2;
  const cols = buildColumns(innerW);

  const totalReg = typeof totalRegOpt === 'number' ? totalRegOpt : (filas || []).length;
  const totalMonto =
    typeof totalMontoOpt === 'number'
      ? totalMontoOpt
      : Math.round((filas || []).reduce((s, r) => s + (parseFloat(r.monto_pension) || 0), 0) * 100) / 100;

  function drawHeader() {
    return dibujarCabeceraReportePdf(doc, logo, {
      colegioNombre,
      titulos: [`ALUMNOS PUNTUALES — ${anio}`],
      subtitulos: [
        `Hasta: ${safeTxtPdf(mes_etiqueta)}${sede_etiqueta ? ` · Sede: ${safeTxtPdf(sede_etiqueta)}` : ''}`,
      ],
    });
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
      fmtMonto(row.monto_pension, moneda),
      fmtFecha(row.fecha_pago_ultimo_mes),
      row.telefono_apoderado || '—',
      row.email_apoderado || '—',
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
    doc.text(`Total alumnos: ${totalReg}`, MARGIN, y + 6);
    doc.text(`Suma pensiones: ${fmtMonto(totalMonto, moneda)}`, pageW - MARGIN, y + 6, { align: 'right' });
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
  doc.save(`alumnos_puntuales_${anio}.pdf`);
}
