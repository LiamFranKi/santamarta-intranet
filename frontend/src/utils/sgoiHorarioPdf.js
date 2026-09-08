import { jsPDF } from 'jspdf';
import { etiquetaTipoTrabajo } from './sgoiFormat';

const DIAS = [
  [1, 'Lunes'],
  [2, 'Martes'],
  [3, 'Miércoles'],
  [4, 'Jueves'],
  [5, 'Viernes'],
  [6, 'Sábado'],
  [7, 'Domingo'],
];

const COLOR_TIPO = {
  DESARROLLO: [37, 99, 235],
  SOPORTE: [13, 148, 136],
  PAGOS: [202, 138, 4],
  DESPLIEGUE: [124, 58, 237],
  REUNION: [219, 39, 119],
  DESCANSO: [148, 163, 184],
  OTRO: [100, 116, 139],
};

function rgbTipo(tipo) {
  return COLOR_TIPO[tipo] || COLOR_TIPO.OTRO;
}

function wrapText(doc, text, maxWidth) {
  const parts = doc.splitTextToSize(String(text || ''), maxWidth);
  return Array.isArray(parts) ? parts : [String(text || '')];
}

/**
 * PDF del horario semanal. Solo días con franjas escritas (L–S; domingo si hay).
 */
export function exportarHorarioSgoiPdf(dias, { nombre } = {}) {
  const conContenido = DIAS.map(([wd, nombre]) => {
    const bloques = (dias.find((d) => Number(d.weekday) === wd)?.bloques || []).filter(
      (b) => String(b.titulo || '').trim()
    );
    return { weekday: wd, nombre, bloques };
  }).filter((d) => d.bloques.length > 0);

  if (!conContenido.length) {
    throw new Error('No hay franjas para exportar.');
  }

  const horas = Array.from(
    new Set(
      conContenido.flatMap((d) => d.bloques.map((b) => `${b.hora_ini}–${b.hora_fin}`))
    )
  ).sort();

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;
  const headerH = 22;
  const innerW = pageW - margin * 2;

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, headerH + 8, 'F');
  doc.setFillColor(37, 99, 235);
  doc.rect(0, headerH + 6, pageW, 3, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Horario semanal · Área de Sistemas', margin, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(191, 219, 254);
  const persona = String(nombre || '').trim();
  doc.text(persona ? `Emitido para: ${persona}` : 'VanguardNet · Gestión operativa', margin, 18);
  const generado = new Date().toLocaleString('es-PE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  doc.text(generado, pageW - margin, 12, { align: 'right' });
  doc.text(`${conContenido.length} día${conContenido.length === 1 ? '' : 's'} con franjas`, pageW - margin, 18, {
    align: 'right',
  });

  const colHora = 28;
  const colDia = (innerW - colHora) / conContenido.length;
  const headY = headerH + 14;
  const headH = 9;
  let y = headY;

  doc.setFillColor(30, 64, 175);
  doc.rect(margin, y, innerW, headH, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('HORA', margin + colHora / 2, y + 6, { align: 'center' });
  conContenido.forEach((d, i) => {
    const x = margin + colHora + i * colDia;
    doc.text(d.nombre.toUpperCase(), x + colDia / 2, y + 6, { align: 'center' });
  });
  y += headH;

  const rowH = Math.min(16, Math.max(11, (pageH - y - 16) / Math.max(horas.length, 1)));

  horas.forEach((hora, idx) => {
    if (y + rowH > pageH - 12) {
      doc.addPage();
      y = margin;
    }
    const bg = idx % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
    doc.setFillColor(...bg);
    doc.rect(margin, y, innerW, rowH, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.rect(margin, y, innerW, rowH);

    doc.setTextColor(51, 65, 85);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text(hora, margin + colHora / 2, y + rowH / 2 + 1, { align: 'center' });

    conContenido.forEach((d, i) => {
      const x = margin + colHora + i * colDia;
      doc.rect(x, y, colDia, rowH);
      const bloque = d.bloques.find((b) => `${b.hora_ini}–${b.hora_fin}` === hora);
      if (!bloque) return;
      const color = rgbTipo(bloque.tipo);
      doc.setFillColor(...color);
      doc.rect(x, y, 1.6, rowH, 'F');
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      const lineas = wrapText(doc, bloque.titulo, colDia - 5);
      const tipoTxt = etiquetaTipoTrabajo(bloque.tipo);
      const start = y + (rowH > 13 ? 5 : 4.2);
      lineas.slice(0, 2).forEach((ln, li) => {
        doc.text(ln, x + 3.2, start + li * 3.4);
      });
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(color[0], color[1], color[2]);
      doc.setFontSize(5.5);
      doc.text(tipoTxt, x + 3.2, y + rowH - 2.4);
    });

    y += rowH;
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(
    persona
      ? `Horario de ${persona} · Área de Sistemas. Solo se imprimen los días con franjas.`
      : 'Plantilla semanal de Sistemas. Solo se imprimen los días que tienen franjas.',
    margin,
    pageH - 7
  );

  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`horario-sistemas-${stamp}.pdf`);
}
