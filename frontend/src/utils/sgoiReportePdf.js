import { jsPDF } from 'jspdf';
import {
  etiquetaDiaCorto,
  etiquetaDiaLargo,
  etiquetaEstado,
  etiquetaTipoTrabajo,
  formatDuracionSeg,
  formatFechaCorta,
  formatHoraItem,
} from './sgoiFormat';

const COLOR_TIPO = {
  DESARROLLO: [37, 99, 235],
  SOPORTE: [13, 148, 136],
  PAGOS: [202, 138, 4],
  DESPLIEGUE: [124, 58, 237],
  REUNION: [219, 39, 119],
  DESCANSO: [148, 163, 184],
  OTRO: [100, 116, 139],
};

const COLOR_ESTADO = {
  RESUELTO: [22, 163, 74],
  PENDIENTE: [202, 138, 4],
  EN_CURSO: [217, 119, 6],
  HECHO: [22, 163, 74],
};

function rgbTipo(tipo) {
  return COLOR_TIPO[tipo] || COLOR_TIPO.OTRO;
}

function etiquetaPeriodo(periodo) {
  if (periodo === 'dia') return 'Reporte del día';
  if (periodo === 'mes') return 'Reporte mensual';
  return 'Reporte semanal';
}

function wrapText(doc, text, maxWidth) {
  const parts = doc.splitTextToSize(String(text || ''), maxWidth);
  return Array.isArray(parts) ? parts : [String(text || '')];
}

function crearCanvas(w, h) {
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  return { canvas, ctx, w, h };
}

function roundedRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function chartBarras(items, { valueKey, color, emptyLabel }) {
  const w = 640;
  const h = 220;
  const { canvas, ctx } = crearCanvas(w, h);
  const pad = { l: 40, r: 16, t: 18, b: 36 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const max = Math.max(1, ...items.map((it) => Number(it[valueKey]) || 0));

  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = pad.t + (innerH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(w - pad.r, y);
    ctx.stroke();
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(String(Math.round(max * (1 - i / 4))), pad.l - 6, y + 4);
  }

  if (!items.some((it) => Number(it[valueKey]) > 0)) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(emptyLabel || 'Sin datos', w / 2, h / 2);
    return canvas.toDataURL('image/png');
  }

  const gap = 8;
  const barW = Math.min(36, Math.max(10, (innerW - gap * items.length) / items.length));
  const step = innerW / items.length;
  items.forEach((it, i) => {
    const val = Number(it[valueKey]) || 0;
    const bh = (val / max) * innerH;
    const x = pad.l + i * step + (step - barW) / 2;
    const y = pad.t + innerH - bh;
    ctx.fillStyle = color;
    roundedRect(ctx, x, y, barW, Math.max(2, bh), 4);
    ctx.fill();
    ctx.fillStyle = '#64748b';
    ctx.font = '10px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(it.label || ''), x + barW / 2, h - 12);
  });
  return canvas.toDataURL('image/png');
}

function chartPie(slices) {
  const w = 640;
  const h = 220;
  const { canvas, ctx } = crearCanvas(w, h);
  const total = slices.reduce((s, x) => s + (Number(x.value) || 0), 0);
  if (!total) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Sin incidencias en el periodo', w / 2, h / 2);
    return canvas.toDataURL('image/png');
  }
  const cx = 150;
  const cy = 110;
  const r = 72;
  let ang = -Math.PI / 2;
  slices.forEach((sl) => {
    const sweep = ((Number(sl.value) || 0) / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, ang, ang + sweep);
    ctx.closePath();
    ctx.fillStyle = sl.color;
    ctx.fill();
    ang += sweep;
  });
  ctx.beginPath();
  ctx.arc(cx, cy, 38, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 16px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(String(total), cx, cy + 2);
  ctx.font = '10px Helvetica, Arial, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('total', cx, cy + 16);

  let ly = 48;
  slices.forEach((sl) => {
    ctx.fillStyle = sl.color;
    roundedRect(ctx, 280, ly - 8, 12, 12, 3);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.font = '13px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${sl.name}  ·  ${sl.value}`, 300, ly + 2);
    ly += 28;
  });
  return canvas.toDataURL('image/png');
}

/**
 * PDF del reporte: horario del periodo, incidencias colgadas y gráficos al final.
 */
export function exportarReporteSgoiPdf({ reporte, periodo }) {
  const dias = Array.isArray(reporte?.dias) ? reporte.dias : [];
  const resumen = reporte?.resumen || {};
  if (!dias.length && !(resumen.casos_total > 0)) {
    throw new Error('No hay horario ni incidencias en este periodo para exportar.');
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 13;
  const innerW = pageW - margin * 2;
  const footerH = 12;
  let y = 0;

  const rangoTxt = reporte?.desde === reporte?.hasta
    ? formatFechaCorta(reporte?.desde)
    : `${formatFechaCorta(reporte?.desde)} – ${formatFechaCorta(reporte?.hasta)}`;
  const generado = new Date().toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' });

  const piePagina = () => {
    const n = doc.internal.getNumberOfPages();
    for (let i = 1; i <= n; i += 1) {
      doc.setPage(i);
      doc.setFillColor(248, 250, 252);
      doc.rect(0, pageH - footerH, pageW, footerH, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text('VanguardNet · Gestión operativa · Área de Sistemas', margin, pageH - 4.5);
      doc.text(`Página ${i} de ${n}`, pageW - margin, pageH - 4.5, { align: 'right' });
    }
  };

  const ensure = (need) => {
    if (y + need <= pageH - footerH - 4) return;
    doc.addPage();
    y = margin;
  };

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 28, 'F');
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 26, pageW, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('Gestión operativa · Reporte', margin, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(191, 219, 254);
  doc.text(`${etiquetaPeriodo(periodo)} · ${rangoTxt}`, margin, 19);
  doc.setTextColor(226, 232, 240);
  doc.text(generado, pageW - margin, 12, { align: 'right' });
  y = 38;

  const kpis = [
    { t: 'Incidencias', v: String(resumen.casos_total || 0), s: `${resumen.casos_resueltos || 0} resueltas · ${resumen.casos_pendientes || 0} pendientes`, c: [220, 38, 38] },
    { t: 'Tiempo en incidencias', v: formatDuracionSeg(resumen.segundos_casos), s: 'atención registrada', c: [37, 99, 235] },
    { t: 'Días con actividad', v: String(resumen.dias_con_actividad || dias.length || 0), s: 'en el periodo', c: [13, 148, 136] },
  ];
  const kpiW = (innerW - 6) / 3;
  kpis.forEach((k, i) => {
    const x = margin + i * (kpiW + 3);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, kpiW, 22, 2, 2, 'FD');
    doc.setFillColor(...k.c);
    doc.rect(x, y, kpiW, 1.4, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(k.t.toUpperCase(), x + 3.2, y + 6.2);
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(13);
    doc.text(k.v, x + 3.2, y + 13.2);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(100, 116, 139);
    doc.text(k.s, x + 3.2, y + 18.4);
  });
  y += 28;

  dias.forEach((dia) => {
    const bloques = dia.bloques || [];
    const sueltos = dia.casos_sueltos || [];
    const casos = dia.casos || [];
    const tieneAgenda = bloques.length > 0;
    ensure(18);

    doc.setFillColor(239, 246, 255);
    doc.roundedRect(margin, y, innerW, 8, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30, 64, 175);
    doc.text(etiquetaDiaLargo(dia.fecha), margin + 3, y + 5.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    const nInc = casos.length;
    doc.text(
      nInc ? `${nInc} incidencia${nInc === 1 ? '' : 's'}` : 'Sin incidencias',
      pageW - margin - 3,
      y + 5.5,
      { align: 'right' }
    );
    y += 11;

    if (tieneAgenda) {
      bloques.forEach((b) => {
        const incs = b.interrupciones || [];
        const tituloLines = wrapText(doc, b.titulo || '—', innerW - 38);
        const notaH = incs.reduce((acc, c) => {
          const nota = c.nota ? wrapText(doc, c.nota, innerW - 44).length : 0;
          return acc + 8 + nota * 3.2;
        }, 0);
        const h = Math.max(11, 8 + tituloLines.length * 3.4) + notaH;
        ensure(h + 2);
        const color = rgbTipo(b.tipo);
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(margin, y, innerW, h, 1.6, 1.6, 'FD');
        doc.setFillColor(...color);
        doc.rect(margin, y, 1.8, h, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(15, 23, 42);
        doc.text(`${b.hora_ini}`, margin + 4.2, y + 4.6);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text(`${b.hora_fin}`, margin + 4.2, y + 8.2);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.4);
        doc.setTextColor(...color);
        doc.text(etiquetaTipoTrabajo(b.tipo).toUpperCase(), margin + 22, y + 4.4);
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(8.2);
        tituloLines.slice(0, 2).forEach((ln, i) => {
          doc.text(ln, margin + 22, y + 8.4 + i * 3.4);
        });

        if (incs.length) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6.2);
          doc.setTextColor(185, 28, 28);
          doc.text(
            `${incs.length} INCIDENCIA${incs.length === 1 ? '' : 'S'}`,
            pageW - margin - 3,
            y + 4.6,
            { align: 'right' }
          );
        }

        let iy = y + Math.max(11, 8 + tituloLines.length * 3.4);
        incs.forEach((c) => {
          const notaLines = c.nota ? wrapText(doc, c.nota, innerW - 44) : [];
          const ih = 7.2 + notaLines.length * 3.1;
          doc.setFillColor(254, 242, 242);
          doc.setDrawColor(254, 202, 202);
          doc.roundedRect(margin + 21, iy, innerW - 24, ih, 1.2, 1.2, 'FD');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.2);
          doc.setTextColor(185, 28, 28);
          doc.text(c.codigo || 'Incidencia', margin + 23.2, iy + 3.6);
          doc.setTextColor(15, 23, 42);
          doc.text(c.titulo || 'Caso', margin + 42, iy + 3.6);
          const est = etiquetaEstado(c.estado);
          const estColor = COLOR_ESTADO[c.estado] || [100, 116, 139];
          doc.setTextColor(...estColor);
          doc.text(est, pageW - margin - 5, iy + 3.6, { align: 'right' });
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.6);
          doc.setTextColor(100, 116, 139);
          const horas = `${formatHoraItem(c.inicio_at)}${c.fin_at ? ` – ${formatHoraItem(c.fin_at)}` : ' – …'}`;
          const dur = c.estado !== 'EN_CURSO' && c.duracion_seg ? ` · ${formatDuracionSeg(c.duracion_seg)}` : '';
          const quien = c.usuario_nombre ? ` · ${c.usuario_nombre}` : '';
          doc.text(`${horas}${dur}${quien}`, margin + 23.2, iy + 6.6);
          notaLines.slice(0, 3).forEach((ln, i) => {
            doc.setTextColor(71, 85, 105);
            doc.text(ln, margin + 23.2, iy + 9.8 + i * 3.1);
          });
          iy += ih + 1.2;
        });
        y += h + 2.2;
      });
    } else if (casos.length) {
      casos.forEach((c) => {
        const notaLines = c.nota ? wrapText(doc, c.nota, innerW - 10) : [];
        const h = 11 + notaLines.length * 3.2;
        ensure(h + 2);
        doc.setFillColor(254, 242, 242);
        doc.setDrawColor(254, 202, 202);
        doc.roundedRect(margin, y, innerW, h, 1.4, 1.4, 'FD');
        doc.setFillColor(220, 38, 38);
        doc.rect(margin, y, 1.6, h, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(185, 28, 28);
        doc.text(c.codigo || 'CAS', margin + 4, y + 4.4);
        doc.setTextColor(15, 23, 42);
        doc.text(c.titulo || 'Caso', margin + 24, y + 4.4);
        doc.setTextColor(...(COLOR_ESTADO[c.estado] || [100, 116, 139]));
        doc.text(etiquetaEstado(c.estado), pageW - margin - 3, y + 4.4, { align: 'right' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text(
          `${formatHoraItem(c.inicio_at)}${c.fin_at ? ` – ${formatHoraItem(c.fin_at)}` : ''}${c.duracion_seg ? ` · ${formatDuracionSeg(c.duracion_seg)}` : ''}${c.usuario_nombre ? ` · ${c.usuario_nombre}` : ''}`,
          margin + 4,
          y + 8.2
        );
        notaLines.forEach((ln, i) => {
          doc.setTextColor(71, 85, 105);
          doc.text(ln, margin + 4, y + 11.4 + i * 3.2);
        });
        y += h + 2;
      });
    } else {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text('Sin franjas ni incidencias este día.', margin + 1, y + 3);
      y += 8;
    }

    if (tieneAgenda && sueltos.length) {
      ensure(12);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(185, 28, 28);
      doc.text('Incidencias fuera de horario', margin + 1, y + 3);
      y += 6;
      sueltos.forEach((c) => {
        const h = 9;
        ensure(h + 2);
        doc.setFillColor(254, 242, 242);
        doc.roundedRect(margin, y, innerW, h, 1.2, 1.2, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.2);
        doc.setTextColor(15, 23, 42);
        doc.text(`${c.codigo || ''}  ${c.titulo || ''}`, margin + 3, y + 3.8);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.6);
        doc.setTextColor(100, 116, 139);
        doc.text(
          `${formatHoraItem(c.inicio_at)}${c.duracion_seg ? ` · ${formatDuracionSeg(c.duracion_seg)}` : ''} · ${etiquetaEstado(c.estado)}`,
          margin + 3,
          y + 7.2
        );
        y += h + 1.6;
      });
    }
    y += 3;
  });

  const porDia = Array.isArray(reporte?.por_dia) ? reporte.por_dia : [];
  const barrasInc = porDia.map((d) => ({
    label: etiquetaDiaCorto(d.fecha),
    value: d.casos || 0,
  }));
  const barrasMin = porDia.map((d) => ({
    label: etiquetaDiaCorto(d.fecha),
    value: Math.round((d.seg_casos || 0) / 60),
  }));
  const pieSlices = [
    { name: 'Resueltas', value: resumen.casos_resueltos || 0, color: '#16a34a' },
    { name: 'Pendientes', value: resumen.casos_pendientes || 0, color: '#ca8a04' },
    { name: 'En curso', value: resumen.casos_en_curso || 0, color: '#d97706' },
  ].filter((s) => s.value > 0);

  const imgBarras = chartBarras(barrasInc, { valueKey: 'value', color: '#dc2626', emptyLabel: 'Sin incidencias' });
  const imgPie = chartPie(pieSlices);
  const imgMin = chartBarras(barrasMin, { valueKey: 'value', color: '#1d4ed8', emptyLabel: 'Sin minutos registrados' });

  ensure(18);
  y += 2;
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(margin, y, innerW, 8, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text('Gráficos del periodo', margin + 3, y + 5.5);
  y += 12;

  const chartBlock = (titulo, sub, img) => {
    ensure(78);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(titulo, margin, y + 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(sub, margin, y + 8.4);
    y += 10;
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin, y, innerW, 62, 2, 2, 'FD');
    doc.addImage(img, 'PNG', margin + 3, y + 2, innerW - 6, 58);
    y += 66;
  };

  chartBlock('Incidencias por día', 'Cantidad real registrada en el periodo.', imgBarras);
  chartBlock('Estado de incidencias', 'Resueltas, pendientes y en curso.', imgPie);
  chartBlock('Minutos de atención', 'Duración de incidencias por día.', imgMin);

  piePagina();
  const stamp = `${reporte?.desde || 'periodo'}_${reporte?.hasta || ''}`.replace(/-+/g, '');
  doc.save(`reporte-gestion-operativa-${stamp}.pdf`);
}
