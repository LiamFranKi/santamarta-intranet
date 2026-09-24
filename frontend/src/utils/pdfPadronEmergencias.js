import { jsPDF } from 'jspdf';
import { obtenerLogoColegioParaPdf, dibujarLogoEsquina } from './pdfReporteColegioLogo';
import {
  PDF_HEADER_BLUE,
  PDF_BORDER,
  PDF_PAGE_MARGIN,
  safeTxtPdf,
  textoCentradoCelda,
} from './pdfReportesGeneralTheme';

const MARGIN = PDF_PAGE_MARGIN;
const HEAD_H = 9;
const ROW_H = 6.4;

const COLS_PADRON = [
  { key: 'n', label: 'N.°', w: 7 },
  { key: 'codigo', label: 'Código', w: 14 },
  { key: 'alumno_nombre', label: 'Estudiante', w: 32 },
  { key: 'alumno_dni', label: 'DNI est.', w: 14 },
  { key: 'nivel', label: 'Nivel', w: 14 },
  { key: 'grado', label: 'Grado', w: 10 },
  { key: 'seccion', label: 'Secc.', w: 9 },
  { key: 'autorizado_nombre', label: 'Persona autorizada', w: 38 },
  { key: 'autorizado_dni', label: 'DNI / CE', w: 13 },
  { key: 'parentesco', label: 'Parentesco', w: 14 },
  { key: 'celular', label: 'Celular', w: 14 },
  { key: 'celular_alt', label: 'Cel. alt.', w: 12 },
  { key: 'vive_con', label: '¿Vive?', w: 10 },
  { key: 'restriccion', label: 'Restricción', w: 16 },
  { key: 'firma', label: 'Firma', w: 14 },
];

const COLS_CONTROL = [
  { key: 'n', label: 'N.°', w: 7 },
  { key: 'alumno_nombre', label: 'Estudiante', w: 34 },
  { key: 'nivel', label: 'Nivel', w: 14 },
  { key: 'grado', label: 'Grado', w: 10 },
  { key: 'seccion', label: 'Secc.', w: 9 },
  { key: 'persona_recoge', label: 'Quien recoge', w: 28 },
  { key: 'dni_verificado', label: 'DNI verif.', w: 14 },
  { key: 'parentesco', label: 'Parentesco', w: 14 },
  { key: 'hora_entrega', label: 'Hora', w: 12 },
  { key: 'responsable', label: 'Entrega', w: 22 },
  { key: 'firma', label: 'Firma', w: 14 },
  { key: 'huella', label: 'Huella', w: 11 },
  { key: 'incidencia', label: 'Incidencia', w: 18 },
  { key: 'comunicacion', label: 'Comunicación', w: 16 },
  { key: 'telefono', label: 'Teléfono', w: 13 },
];

function fmtFecha(ymd) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

function drawHeaderDoc(doc, logo, { colegioNombre, titulo, subtitulo, bloque }) {
  const pageW = doc.internal.pageSize.getWidth();
  const logoH = dibujarLogoEsquina(doc, logo, { margin: MARGIN, maxWidth: 22, maxHeight: 14 });
  let y = MARGIN;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(safeTxtPdf(colegioNombre || 'Colegio').toUpperCase(), pageW / 2, y + 5, { align: 'center' });
  y += 14;
  doc.setFontSize(9.5);
  doc.setTextColor(30, 64, 175);
  doc.text(titulo, pageW / 2, y, { align: 'center', maxWidth: pageW - 56 });
  y += 6;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text(subtitulo, pageW / 2, y, { align: 'center', maxWidth: pageW - 40 });
  y = Math.max(y + 5, MARGIN + logoH + 2);

  const metas = [
    `Año: ${bloque.anio || '—'}`,
    `Tutor: ${bloque.tutor || '—'}`,
    `Tutor 2: ${bloque.tutor2 || '—'}`,
    `Actualización: ${fmtFecha(bloque.fecha_actualizacion) || '—'}`,
    bloque.en_blanco
      ? `Estudiantes: ${bloque.estudiantes}`
      : `Estudiantes: ${bloque.estudiantes}   Autorizados: ${bloque.autorizados}`,
  ];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(30, 41, 59);
  doc.text(metas.join('   ·   '), pageW / 2, y, { align: 'center', maxWidth: pageW - MARGIN * 2 });
  return y + 4;
}

function drawTable(doc, cols, filas, y0) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const totalW = cols.reduce((s, c) => s + c.w, 0);
  const scale = (pageW - MARGIN * 2) / totalW;
  let y = y0;

  const header = () => {
    let x = MARGIN;
    doc.setFillColor(...PDF_HEADER_BLUE);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.6);
    doc.rect(MARGIN, y, pageW - MARGIN * 2, HEAD_H, 'F');
    cols.forEach((col) => {
      const w = col.w * scale;
      doc.text(col.label, x + w / 2, y + 5.8, { align: 'center', maxWidth: w - 0.6 });
      x += w;
    });
    y += HEAD_H;
  };

  header();
  (filas || []).forEach((fila) => {
    if (y + ROW_H > pageH - 8) {
      doc.addPage('a4', 'landscape');
      y = MARGIN;
      header();
    }
    let x = MARGIN;
    doc.setDrawColor(...PDF_BORDER);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.rect(MARGIN, y, pageW - MARGIN * 2, ROW_H);
    cols.forEach((col) => {
      const w = col.w * scale;
      textoCentradoCelda(doc, fila[col.key], x, y + 4.2, w);
      x += w;
      doc.line(x, y, x, y + ROW_H);
    });
    y += ROW_H;
  });
  return y;
}

async function generarPdfPadronEmergencias({
  colegioNombre,
  bloques = [],
  incluirPadron = true,
  incluirControl = true,
  enBlanco = false,
}) {
  const logo = await obtenerLogoColegioParaPdf();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const lista = bloques.filter((b) => (b.filas_padron || []).length || (b.filas_control || []).length);
  if (!lista.length) throw new Error('No hay datos para exportar.');

  let first = true;
  const addSeccion = (bloque, tipo) => {
    if (!first) doc.addPage('a4', 'landscape');
    first = false;
    const esPadron = tipo === 'padron';
    const y = drawHeaderDoc(doc, logo, {
      colegioNombre,
      titulo: esPadron
        ? 'PADRÓN DE APODERADOS AUTORIZADOS PARA EL RECOJO DE ESTUDIANTES EN CASO DE DESASTRES NATURALES'
        : 'CONTROL DE ENTREGA DE ESTUDIANTES DURANTE UNA EMERGENCIA',
      subtitulo:
        'Uso institucional para la entrega segura de estudiantes ante sismos, incendios, inundaciones u otras emergencias.',
      bloque,
    });
    drawTable(doc, esPadron ? COLS_PADRON : COLS_CONTROL, esPadron ? bloque.filas_padron : bloque.filas_control, y);
  };

  lista.forEach((b) => {
    if (incluirPadron) addSeccion(b, 'padron');
    if (incluirControl) addSeccion(b, 'control');
  });

  const suf = lista.length === 1 ? lista[0].titulo.replace(/\s+/g, '_') : 'todos';
  const variante = enBlanco ? 'en-blanco' : 'autorizados';
  doc.save(`padron-emergencias-${variante}-${suf}.pdf`);
}

export { generarPdfPadronEmergencias };
