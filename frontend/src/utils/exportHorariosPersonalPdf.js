import { jsPDF } from 'jspdf';
import {
  DIAS_SEMANA,
  aclararColor,
  filasHorario,
  formatearHora,
  getColorForCourse,
  hexToRgb,
  obtenerClase,
} from './horarioDocenteGrid';

function dibujarHorarioDocente(doc, { nombre, clases, anio, colegioNombre }) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;
  const colorHeader = [74, 131, 193];
  const colorBorder = [45, 90, 143];
  const colorText = [30, 41, 59];
  const headerH = 22;
  let y = margin;

  doc.setFillColor(...colorHeader);
  doc.rect(margin, y, contentWidth, headerH, 'F');
  doc.setDrawColor(...colorBorder);
  doc.setLineWidth(0.5);
  doc.rect(margin, y, contentWidth, headerH);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('HORARIO DE CLASES', margin + contentWidth / 2, y + 7, { align: 'center' });

  doc.setFontSize(14);
  const nombreLines = doc.splitTextToSize(String(nombre || 'Docente'), contentWidth - 16);
  doc.text(nombreLines[0] || 'Docente', margin + contentWidth / 2, y + 14.5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const sub = [colegioNombre, anio ? `Año académico ${anio}` : '']
    .filter(Boolean)
    .join('  ·  ');
  doc.text(sub || 'Lunes a viernes', margin + contentWidth / 2, y + 19.5, { align: 'center' });

  y += headerH + 4;

  const { horario, bloques } = filasHorario(clases);
  const footerReserve = 8;
  const colWidth = contentWidth / 6;
  const headerHeight = 9;
  const available = pageHeight - y - headerHeight - margin - footerReserve;
  const nRows = Math.max(bloques.length, 1);
  const rowHeight = Math.min(16, Math.max(8.2, available / nRows));
  const fontCelda = rowHeight < 10 ? 6.5 : rowHeight < 12.5 ? 7.5 : 8.5;

  doc.setFillColor(...colorHeader);
  doc.setDrawColor(...colorBorder);
  doc.setLineWidth(0.3);
  doc.rect(margin, y, colWidth, headerHeight, 'F');
  doc.rect(margin, y, colWidth, headerHeight);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('HORA', margin + colWidth / 2, y + headerHeight / 2 + 2.2, { align: 'center' });

  DIAS_SEMANA.forEach((dia, idx) => {
    const xPos = margin + colWidth + idx * colWidth;
    doc.setFillColor(...colorHeader);
    doc.rect(xPos, y, colWidth, headerHeight, 'F');
    doc.rect(xPos, y, colWidth, headerHeight);
    doc.text(dia.abrev, xPos + colWidth / 2, y + headerHeight / 2 + 2.2, { align: 'center' });
  });

  y += headerHeight;

  if (!bloques.length) {
    doc.setDrawColor(200, 200, 200);
    doc.rect(margin, y, contentWidth, 14);
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.text('Sin horario de clases.', margin + contentWidth / 2, y + 8, { align: 'center' });
    return;
  }

  bloques.forEach((bloque) => {
    const clasesDia = DIAS_SEMANA.map((dia) => obtenerClase(horario, dia.id, bloque.inicio, bloque.fin));

    doc.setDrawColor(74, 131, 193);
    doc.setLineWidth(0.25);
    doc.setFillColor(249, 250, 251);
    doc.rect(margin, y, colWidth, rowHeight, 'FD');
    doc.setTextColor(...colorHeader);
    doc.setFontSize(Math.min(8.5, fontCelda + 0.5));
    doc.setFont('helvetica', 'bold');
    const horaTexto = `${formatearHora(bloque.inicio)} - ${formatearHora(bloque.fin)}`;
    doc.text(horaTexto, margin + colWidth / 2, y + rowHeight / 2 + 2, {
      align: 'center',
      maxWidth: colWidth - 3,
    });

    clasesDia.forEach((clase, diaIdx) => {
      const xPos = margin + colWidth + diaIdx * colWidth;
      doc.setDrawColor(74, 131, 193);
      if (clase) {
        const colorCurso = aclararColor(getColorForCourse(clase.titulo || ''), 0.35);
        const rgb = hexToRgb(colorCurso);
        if (rgb) doc.setFillColor(rgb.r, rgb.g, rgb.b);
        else doc.setFillColor(255, 255, 255);
      } else {
        doc.setFillColor(227, 242, 253);
      }
      doc.rect(xPos, y, colWidth, rowHeight, 'FD');

      if (clase) {
        const titulo = String(clase.titulo || '').trim();
        const grupo = String(clase.grupo || '').trim();
        const lineH = fontCelda * 0.38;
        const maxLineas = Math.max(1, Math.floor((rowHeight - 2) / lineH));
        const maxW = colWidth - 4;
        const tituloLines = titulo ? doc.splitTextToSize(titulo, maxW) : [];
        const grupoLines = grupo ? doc.splitTextToSize(grupo, maxW) : [];
        const visTitulo = tituloLines.slice(0, maxLineas);
        const visGrupo = grupoLines.slice(0, Math.max(0, maxLineas - visTitulo.length));
        const visibleCount = visTitulo.length + visGrupo.length;
        if (visibleCount) {
          doc.setTextColor(...colorText);
          const alturaTexto = visibleCount * lineH;
          let ty = y + (rowHeight - alturaTexto) / 2 + lineH * 0.75;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(fontCelda);
          visTitulo.forEach((linea) => {
            doc.text(linea, xPos + colWidth / 2, ty, { align: 'center', maxWidth: maxW });
            ty += lineH;
          });
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(Math.max(6, fontCelda - 0.6));
          visGrupo.forEach((linea) => {
            doc.text(linea, xPos + colWidth / 2, ty, { align: 'center', maxWidth: maxW });
            ty += lineH;
          });
        }
      }
    });

    y += rowHeight;
  });

  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.setFont('helvetica', 'italic');
  doc.text(
    `Generado el ${new Date().toLocaleDateString('es-PE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })}`,
    margin,
    pageHeight - 6
  );
}

export async function exportarHorariosPersonalPdf({ docentes, anio, colegioNombre }) {
  const lista = (docentes || []).filter((d) => d && Array.isArray(d.clases));
  if (!lista.length) {
    throw new Error('No hay horarios para exportar.');
  }

  const doc = new jsPDF('l', 'mm', 'a4');
  lista.forEach((docente, idx) => {
    if (idx > 0) doc.addPage();
    dibujarHorarioDocente(doc, {
      nombre: docente.nombre,
      clases: docente.clases || [],
      anio,
      colegioNombre,
    });
  });

  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`Horarios_personal_${anio || stamp}.pdf`);
}
