/**
 * PDF «Registro académico» / nómina por grupo (cuadritos vacíos).
 * Misma maquetación que Tutoría y Docente Cursos, adaptada a Reportes → General.
 */
import { jsPDF } from 'jspdf';
import { obtenerLogoColegioParaPdf } from './pdfReporteColegioLogo';
import { safeTxtPdf } from './pdfReportesGeneralTheme';

export const NUM_CUADROS_NOMINA = 25;

const FILL_HEADER = [74, 131, 193];

function logoTopRight(doc, pageWidth, margin, logoPack) {
  const dataUrl = logoPack?.dataUrl;
  if (!dataUrl) return;
  const maxW = 16;
  let drawW = maxW;
  let drawH = maxW * 0.6;
  const dims = logoPack.dims;
  if (dims?.w > 0 && dims?.h > 0) {
    drawH = (dims.h / dims.w) * drawW;
  }
  try {
    doc.addImage(dataUrl, 'PNG', pageWidth - margin - drawW, 4, drawW, drawH);
  } catch {
    /* ignore */
  }
}

function dibujarMetaCampos(doc, pageWidth, yStart, gradoLabel) {
  const filaY = yStart;
  const altoCaja = 6;
  const pad = 3;
  const anchoLabel = 14;
  const anchoValor = 36;

  const bloques = [
    { label: 'CURSO:', valor: '', colorBg: FILL_HEADER, colorValor: [30, 64, 175] },
    { label: 'GRADO:', valor: safeTxtPdf(gradoLabel).substring(0, 28), colorBg: [16, 185, 129], colorValor: [6, 95, 70] },
    { label: 'MES:', valor: '', colorBg: [245, 158, 11], colorValor: [180, 83, 9] },
  ];

  const totalBloquesWidth = bloques.length * (anchoLabel + anchoValor + pad * 4);
  let xBloque = (pageWidth - totalBloquesWidth) / 2;

  bloques.forEach((b) => {
    const wLabel = anchoLabel + pad * 2;
    const wValor = anchoValor + pad * 2;
    doc.setFillColor(...b.colorBg);
    doc.rect(xBloque, filaY - 4, wLabel, altoCaja, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(b.label, xBloque + wLabel / 2, filaY + 0.5, { align: 'center' });
    xBloque += wLabel;
    doc.setFillColor(248, 250, 252);
    doc.rect(xBloque, filaY - 4, wValor, altoCaja, 'F');
    doc.setDrawColor(220, 220, 220);
    doc.rect(xBloque, filaY - 4, wValor, altoCaja, 'S');
    doc.setTextColor(...b.colorValor);
    doc.setFont('helvetica', 'normal');
    if (b.valor) {
      doc.text(b.valor, xBloque + wValor / 2, filaY + 0.5, { align: 'center' });
    }
    xBloque += wValor + pad;
  });

  doc.setTextColor(0, 0, 0);
  return filaY + 8;
}

function dibujarTablaNomina(doc, opts) {
  const {
    filas,
    margin,
    pageWidth,
    pageHeight,
    leftOffset,
    colNumWidth,
    colNombresWidth,
    numCols,
    colCuadroWidth,
    totalTableWidth,
    startY,
  } = opts;

  let y = startY;
  const headerHeight = 7;

  doc.setFillColor(...FILL_HEADER);
  doc.rect(leftOffset, y - 5, totalTableWidth, headerHeight, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  const headerTextY = y - 5 + headerHeight / 2 + 1.2;
  doc.text('N°', leftOffset + colNumWidth / 2, headerTextY, { align: 'center' });
  doc.text('Apellidos y Nombres', leftOffset + colNumWidth + colNombresWidth / 2, headerTextY, {
    align: 'center',
  });
  doc.setTextColor(0, 0, 0);

  const rowHeight = 5.5;
  const cuadroHeight = 4.2;
  y += 4;

  (filas || []).forEach((f, idx) => {
    if (y > pageHeight - 20) {
      doc.addPage('landscape', 'a4');
      y = 12;
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setFillColor(...FILL_HEADER);
    doc.rect(leftOffset, y - 0.5, colNumWidth, cuadroHeight + 0.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(String(f.n ?? idx + 1), leftOffset + colNumWidth / 2, y + cuadroHeight / 2 + 1, {
      align: 'center',
    });
    doc.setTextColor(0, 0, 0);
    let x = leftOffset + colNumWidth;
    const nombre = safeTxtPdf(f.alumno_nombre || f.nombre || '');
    doc.text(nombre.substring(0, 48), x + 2, y + cuadroHeight / 2 + 1);
    x += colNombresWidth;
    for (let c = 0; c < numCols; c += 1) {
      doc.rect(x, y, colCuadroWidth - 0.2, cuadroHeight, 'S');
      x += colCuadroWidth;
    }
    y += rowHeight;
  });

  return y;
}

function prepFilas(filas) {
  return (filas || []).map((f, i) => ({
    n: f.n ?? i + 1,
    alumno_nombre: f.alumno_nombre || f.nombre || '',
  }));
}

async function crearDocNominaBase() {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const logoPack = await obtenerLogoColegioParaPdf();
  return { doc, logoPack };
}

function medidasTabla(pageWidth, margin) {
  const colNombresWidth = 76;
  const numCols = NUM_CUADROS_NOMINA;
  const colNumWidth = 12;
  const usableWidth = pageWidth - 2 * margin;
  const colCuadroWidth = (usableWidth - colNumWidth - colNombresWidth) / numCols;
  const totalTableWidth = colNumWidth + colNombresWidth + numCols * colCuadroWidth;
  return {
    colNombresWidth,
    numCols,
    colNumWidth,
    colCuadroWidth,
    totalTableWidth,
    leftOffset: margin,
  };
}

function dibujarEncabezadoPagina(doc, pageWidth, margin, logoPack, { colegioNombre, gradoLabel, subtitulo }) {
  logoTopRight(doc, pageWidth, margin, logoPack);

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 64, 175);
  doc.text('REGISTRO ACADÉMICO', pageWidth / 2, 12, { align: 'center' });

  if (colegioNombre) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text(safeTxtPdf(colegioNombre), margin, 10);
  }

  if (subtitulo) {
    doc.setFontSize(10);
    doc.setTextColor(55, 65, 81);
    doc.text(safeTxtPdf(subtitulo), pageWidth / 2, 17, { align: 'center' });
  }

  return dibujarMetaCampos(doc, pageWidth, subtitulo ? 22 : 20, gradoLabel);
}

/**
 * @param {{ colegioNombre?: string, titulo?: string, filas: Array, anio?: number }} opts
 */
export async function generarPdfNominaUnGrupo(opts) {
  const { doc, logoPack } = await crearDocNominaBase();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const med = medidasTabla(pageWidth, margin);
  const filas = prepFilas(opts.filas);
  const gradoLabel = opts.titulo || opts.gradoLabel || '';

  const tableY = dibujarEncabezadoPagina(doc, pageWidth, margin, logoPack, {
    colegioNombre: opts.colegioNombre,
    gradoLabel,
    subtitulo: opts.anio ? `Año ${opts.anio}` : '',
  });

  dibujarTablaNomina(doc, {
    filas,
    margin,
    pageWidth,
    pageHeight,
    ...med,
    startY: tableY,
  });

  const slug = gradoLabel.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').slice(0, 40) || 'Grupo';
  doc.save(`Nomina_${slug}_${opts.anio || ''}.pdf`.replace(/_+$/, ''));
}

/**
 * @param {{ colegioNombre?: string, bloques: Array<{ titulo, filas }>, anio?: number }} opts
 */
export async function generarPdfNominaTodosGrupos(opts) {
  const bloques = (opts.bloques || []).filter((b) => (b.filas || []).length > 0);
  if (!bloques.length) return;

  const { doc, logoPack } = await crearDocNominaBase();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const med = medidasTabla(pageWidth, margin);

  bloques.forEach((bloque, bi) => {
    if (bi > 0) doc.addPage('landscape', 'a4');

    const tableY = dibujarEncabezadoPagina(doc, pageWidth, margin, logoPack, {
      colegioNombre: opts.colegioNombre,
      gradoLabel: bloque.titulo || '',
      subtitulo: opts.anio ? `Año ${opts.anio}` : '',
    });

    dibujarTablaNomina(doc, {
      filas: prepFilas(bloque.filas),
      margin,
      pageWidth,
      pageHeight,
      ...med,
      startY: tableY,
    });
  });

  doc.save(`Nominas_Alumnos_${opts.anio || 'todas'}.pdf`);
}
