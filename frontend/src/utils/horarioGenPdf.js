import { jsPDF } from 'jspdf';
import { colorForCurso, hexToRgb } from './horarioGenColors';

const DIAS = [
  { id: 1, nombre: 'Lunes', abrev: 'LUNES' },
  { id: 2, nombre: 'Martes', abrev: 'MARTES' },
  { id: 3, nombre: 'Miércoles', abrev: 'MIÉRCOLES' },
  { id: 4, nombre: 'Jueves', abrev: 'JUEVES' },
  { id: 5, nombre: 'Viernes', abrev: 'VIERNES' },
];

function fmtHora(t) {
  if (!t) return '';
  const raw = String(t).trim();
  const up = raw.toUpperCase();
  if (up.includes('AM') || up.includes('PM')) return raw;
  const partes = raw.split(':');
  if (partes.length < 2) return raw;
  const hr = parseInt(partes[0], 10);
  const m = (partes[1] ? partes[1].split(' ')[0] : '00').padStart(2, '0');
  if (Number.isNaN(hr)) return raw;
  if (hr === 0) return `12:${m} AM`;
  if (hr < 12) return `${hr}:${m} AM`;
  if (hr === 12) return `12:${m} PM`;
  return `${hr - 12}:${m} PM`;
}

/**
 * PDF landscape estilo horarios del sistema (jsPDF).
 * @param {object} opts
 * @param {string} opts.titulo - ej. "Inicial · 3 Años · UNICA"
 * @param {string|number} [opts.anio]
 * @param {string} [opts.subtituloExtra] - Docente / Grupo
 * @param {Array} opts.bloques - { id, nombre, hora_inicio, hora_fin, tipo }
 * @param {Array} opts.entradas - { dia_semana, bloque_id, curso_nombre, docente_nombre, grupo_label, carga_color }
 * @param {'grupo'|'docente'} [opts.modo]
 */
export function exportarHorarioGenPDF({
  titulo,
  anio,
  subtituloExtra = '',
  bloques = [],
  entradas = [],
  modo = 'grupo',
}) {
  const doc = new jsPDF('l', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - 2 * margin;
  let y = margin;
  const colorHeader = [59, 130, 246];
  const colorBorder = [30, 64, 175];
  const colorText = [30, 41, 59];
  const colorBreak = [255, 237, 213];

  const entradaEn = (dia, bloqueId) =>
    (entradas || []).find(
      (e) => Number(e.dia_semana) === Number(dia) && Number(e.bloque_id) === Number(bloqueId)
    );

  // Encabezado
  doc.setFillColor(...colorHeader);
  doc.rect(margin, y, contentWidth, 25, 'F');
  doc.setDrawColor(...colorBorder);
  doc.setLineWidth(0.5);
  doc.rect(margin, y, contentWidth, 25);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('HORARIO DE CLASES', margin + contentWidth / 2, y + 12, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const sub = [titulo, anio ? `Año ${anio}` : null, subtituloExtra].filter(Boolean).join(' — ');
  doc.text(sub, margin + contentWidth / 2, y + 20, { align: 'center', maxWidth: contentWidth - 8 });
  y += 30;

  const colWidth = contentWidth / 6;
  const rowHeight = 16;
  const headerHeight = 12;

  // Cabecera días
  doc.setFillColor(...colorHeader);
  doc.rect(margin, y, colWidth, headerHeight, 'F');
  doc.setDrawColor(...colorBorder);
  doc.rect(margin, y, colWidth, headerHeight);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('HORA', margin + colWidth / 2, y + headerHeight / 2 + 3, { align: 'center' });
  DIAS.forEach((dia, idx) => {
    const x = margin + colWidth + idx * colWidth;
    doc.setFillColor(...colorHeader);
    doc.rect(x, y, colWidth, headerHeight, 'F');
    doc.setDrawColor(...colorBorder);
    doc.rect(x, y, colWidth, headerHeight);
    doc.text(dia.abrev, x + colWidth / 2, y + headerHeight / 2 + 3, { align: 'center' });
  });
  y += headerHeight;

  (bloques || []).forEach((b) => {
    if (y + rowHeight > pageHeight - margin - 12) {
      doc.addPage();
      y = margin;
    }
    const isBreak = b.tipo === 'BREAK' || b.tipo === 'LUNCH';
    const breakLabel = b.tipo === 'LUNCH' ? 'Almuerzo' : 'Recreo';

    doc.setDrawColor(200, 200, 200);
    doc.rect(margin, y, colWidth, rowHeight);
    doc.setTextColor(...colorText);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    const horaTxt = `${fmtHora(b.hora_inicio)} - ${fmtHora(b.hora_fin)}`;
    const horaLines = doc.splitTextToSize(horaTxt, colWidth - 4);
    horaLines.forEach((l, i) => {
      doc.text(l, margin + colWidth / 2, y + 5 + i * 4, { align: 'center' });
    });

    DIAS.forEach((dia, idx) => {
      const x = margin + colWidth + idx * colWidth;
      doc.setDrawColor(200, 200, 200);
      doc.rect(x, y, colWidth, rowHeight);

      if (isBreak) {
        doc.setFillColor(...colorBreak);
        doc.rect(x + 0.5, y + 0.5, colWidth - 1, rowHeight - 1, 'F');
        doc.setTextColor(154, 52, 18);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(breakLabel, x + colWidth / 2, y + rowHeight / 2 + 2, { align: 'center' });
        return;
      }

      const e = entradaEn(dia.id, b.id);
      if (!e) return;

      const tituloCelda = e.curso_nombre || 'Clase';
      const secundario =
        modo === 'docente' ? e.grupo_label || '' : e.docente_nombre || '';
      const hex = e.carga_color || colorForCurso(tituloCelda);
      const rgb = hexToRgb(hex);
      if (rgb) {
        doc.setFillColor(rgb.r, rgb.g, rgb.b);
        doc.rect(x + 0.5, y + 0.5, colWidth - 1, rowHeight - 1, 'F');
      }
      doc.setTextColor(...colorText);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      const lineas = doc.splitTextToSize(
        secundario ? `${tituloCelda} - ${secundario}` : tituloCelda,
        colWidth - 5
      );
      const n = Math.min(lineas.length, 3);
      const y0 = y + (rowHeight - n * 3.6) / 2 + 3;
      for (let i = 0; i < n; i += 1) {
        doc.text(lineas[i], x + colWidth / 2, y0 + i * 3.6, { align: 'center', maxWidth: colWidth - 5 });
      }
    });

    y += rowHeight;
  });

  // Pie
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.setFont('helvetica', 'italic');
  doc.text(
    `Generado el: ${new Date().toLocaleDateString('es-PE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })}`,
    margin,
    pageHeight - 8
  );

  const safe = String(titulo || 'horario')
    .replace(/[^\wÁÉÍÓÚáéíóúñÑ·\- ]+/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 60);
  doc.save(`Horario_${safe}_${Date.now()}.pdf`);
}

/**
 * Exporta varios grupos/docentes en un PDF multipágina (estilo sistema).
 */
export function exportarHorarioGenPDFMultiple({ anio, bloques, items, modo = 'grupo' }) {
  if (!items?.length) {
    throw new Error('No hay horarios para exportar');
  }

  const doc = new jsPDF('l', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - 2 * margin;
  const colorHeader = [59, 130, 246];
  const colorBorder = [30, 64, 175];
  const colorText = [30, 41, 59];
  const colorBreak = [255, 237, 213];
  const colWidth = contentWidth / 6;
  const rowHeight = 16;
  const headerHeight = 12;

  items.forEach((it, index) => {
    if (index > 0) doc.addPage();
    let y = margin;
    const titulo = modo === 'grupo' ? it.label : it.nombre;
    const entradas = it.entradas || [];

    doc.setFillColor(...colorHeader);
    doc.rect(margin, y, contentWidth, 25, 'F');
    doc.setDrawColor(...colorBorder);
    doc.setLineWidth(0.5);
    doc.rect(margin, y, contentWidth, 25);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('HORARIO DE CLASES', margin + contentWidth / 2, y + 12, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const sub = [titulo, anio ? `Año ${anio}` : null, modo === 'grupo' ? 'Grupo' : 'Docente']
      .filter(Boolean)
      .join(' — ');
    doc.text(sub, margin + contentWidth / 2, y + 20, { align: 'center', maxWidth: contentWidth - 8 });
    y += 30;

    doc.setFillColor(...colorHeader);
    doc.rect(margin, y, colWidth, headerHeight, 'F');
    doc.setDrawColor(...colorBorder);
    doc.rect(margin, y, colWidth, headerHeight);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('HORA', margin + colWidth / 2, y + headerHeight / 2 + 3, { align: 'center' });
    DIAS.forEach((dia, idx) => {
      const x = margin + colWidth + idx * colWidth;
      doc.setFillColor(...colorHeader);
      doc.rect(x, y, colWidth, headerHeight, 'F');
      doc.setDrawColor(...colorBorder);
      doc.rect(x, y, colWidth, headerHeight);
      doc.text(dia.abrev, x + colWidth / 2, y + headerHeight / 2 + 3, { align: 'center' });
    });
    y += headerHeight;

    (bloques || []).forEach((b) => {
      if (y + rowHeight > pageHeight - margin - 12) {
        doc.addPage();
        y = margin;
      }
      const isBreak = b.tipo === 'BREAK' || b.tipo === 'LUNCH';
      const breakLabel = b.tipo === 'LUNCH' ? 'Almuerzo' : 'Recreo';

      doc.setDrawColor(200, 200, 200);
      doc.rect(margin, y, colWidth, rowHeight);
      doc.setTextColor(...colorText);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      const horaTxt = `${fmtHora(b.hora_inicio)} - ${fmtHora(b.hora_fin)}`;
      doc.splitTextToSize(horaTxt, colWidth - 4).forEach((l, i) => {
        doc.text(l, margin + colWidth / 2, y + 5 + i * 4, { align: 'center' });
      });

      DIAS.forEach((dia, idx) => {
        const x = margin + colWidth + idx * colWidth;
        doc.setDrawColor(200, 200, 200);
        doc.rect(x, y, colWidth, rowHeight);
        if (isBreak) {
          doc.setFillColor(...colorBreak);
          doc.rect(x + 0.5, y + 0.5, colWidth - 1, rowHeight - 1, 'F');
          doc.setTextColor(154, 52, 18);
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.text(breakLabel, x + colWidth / 2, y + rowHeight / 2 + 2, { align: 'center' });
          return;
        }
        const e = (entradas || []).find(
          (en) => Number(en.dia_semana) === Number(dia.id) && Number(en.bloque_id) === Number(b.id)
        );
        if (!e) return;
        const tituloCelda = e.curso_nombre || 'Clase';
        const secundario = modo === 'docente' ? e.grupo_label || '' : e.docente_nombre || '';
        const rgb = hexToRgb(e.carga_color || colorForCurso(tituloCelda));
        if (rgb) {
          doc.setFillColor(rgb.r, rgb.g, rgb.b);
          doc.rect(x + 0.5, y + 0.5, colWidth - 1, rowHeight - 1, 'F');
        }
        doc.setTextColor(...colorText);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        const lineas = doc.splitTextToSize(
          secundario ? `${tituloCelda} - ${secundario}` : tituloCelda,
          colWidth - 5
        );
        const n = Math.min(lineas.length, 3);
        const y0 = y + (rowHeight - n * 3.6) / 2 + 3;
        for (let i = 0; i < n; i += 1) {
          doc.text(lineas[i], x + colWidth / 2, y0 + i * 3.6, { align: 'center', maxWidth: colWidth - 5 });
        }
      });
      y += rowHeight;
    });

    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'italic');
    doc.text(
      `Generado el: ${new Date().toLocaleDateString('es-PE', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })}`,
      margin,
      pageHeight - 8
    );
  });

  const safe = String(items[0]?.label || items[0]?.nombre || 'horario')
    .replace(/[^\wÁÉÍÓÚáéíóúñÑ·\- ]+/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 40);
  doc.save(`Horario_${safe}_${items.length > 1 ? 'varios_' : ''}${Date.now()}.pdf`);
}
