import jsPDF from 'jspdf';

const COLORS = {
  primary: [37, 99, 235],
  primaryDark: [29, 78, 216],
  teal: [13, 148, 136],
  tealDark: [15, 118, 110],
  slate: [30, 41, 59],
  muted: [100, 116, 139],
  border: [226, 232, 240],
  cardBg: [248, 250, 252],
  white: [255, 255, 255],
  softBlue: [239, 246, 255],
  softTeal: [240, 253, 250],
  softAmber: [255, 251, 235],
  barPalette: [
    [37, 99, 235],
    [14, 165, 233],
    [16, 185, 129],
    [245, 158, 11],
    [139, 92, 246],
    [236, 72, 153],
    [20, 184, 166],
    [239, 68, 68],
    [99, 102, 241],
    [234, 88, 12]
  ]
};

function stripHtmlPlain(html) {
  const s = String(html || '');
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeName(titulo) {
  return String(titulo || 'encuesta')
    .replace(/[^\w\-áéíóúñÁÉÍÓÚÑ]+/gi, '_')
    .slice(0, 40);
}

function pct(n, total) {
  const t = Number(total) || 0;
  if (t <= 0) return 0;
  return Math.round((Number(n) / t) * 100);
}

/**
 * Helpers de layout para PDFs de encuesta (cards, barras, pie de página).
 */
function createPdfKit(doc, { accent = COLORS.primary, accentDark = COLORS.primaryDark } = {}) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentW = pageW - margin * 2;
  let y = margin;

  const rounded = (x, yy, w, h, r, style) => {
    if (typeof doc.roundedRect === 'function') {
      doc.roundedRect(x, yy, w, h, r, r, style);
    } else {
      doc.rect(x, yy, w, h, style);
    }
  };

  const ensure = (h) => {
    if (y + h > pageH - 16) {
      doc.addPage();
      y = margin;
      return true;
    }
    return false;
  };

  const footerAllPages = (label) => {
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i += 1) {
      doc.setPage(i);
      doc.setDrawColor(...COLORS.border);
      doc.setLineWidth(0.3);
      doc.line(margin, pageH - 12, pageW - margin, pageH - 12);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...COLORS.muted);
      doc.text(String(label || 'Intranet · Encuestas').slice(0, 70), margin, pageH - 7);
      doc.text(`Página ${i} de ${total}`, pageW - margin, pageH - 7, { align: 'right' });
    }
  };

  const hero = ({ eyebrow, title, subtitleLines = [] }) => {
    doc.setFillColor(accentDark[0], accentDark[1], accentDark[2]);
    rounded(margin, y + 1.2, contentW, 34, 3, 'F');
    doc.setFillColor(...accent);
    rounded(margin, y, contentW, 34, 3, 'F');

    doc.setTextColor(...COLORS.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(String(eyebrow || '').toUpperCase(), margin + 5, y + 8);
    doc.setFontSize(13.5);
    const titleLines = doc.splitTextToSize(String(title || ''), contentW - 14);
    doc.text(titleLines.slice(0, 2), margin + 5, y + 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    let sy = y + 16 + Math.min(2, titleLines.length) * 5 + 1;
    (subtitleLines || []).slice(0, 2).forEach((ln) => {
      doc.text(String(ln), margin + 5, sy);
      sy += 4;
    });
    y += 40;
  };

  const kpiRow = (items) => {
    const n = Math.max(1, items.length);
    const gap = 3;
    const w = (contentW - gap * (n - 1)) / n;
    ensure(28);
    items.forEach((it, i) => {
      const x = margin + i * (w + gap);
      doc.setFillColor(...(it.bg || COLORS.cardBg));
      rounded(x, y, w, 24, 2.5, 'F');
      doc.setDrawColor(...COLORS.border);
      doc.setLineWidth(0.35);
      rounded(x, y, w, 24, 2.5, 'S');
      doc.setFillColor(...(it.accent || accent));
      doc.rect(x, y, 1.8, 24, 'F');
      doc.setTextColor(...COLORS.muted);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text(String(it.label || ''), x + 5, y + 7);
      doc.setTextColor(...COLORS.slate);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text(String(it.value ?? '0'), x + 5, y + 17);
    });
    y += 28;
  };

  const sectionTitle = (text) => {
    ensure(12);
    doc.setFillColor(...accent);
    rounded(margin, y, 2.2, 6, 1, 'F');
    doc.setTextColor(...COLORS.slate);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(String(text), margin + 5, y + 5);
    y += 10;
  };

  const cardEnd = (startY, { pad = 3 } = {}) => {
    const h = Math.max(12, y - startY + pad);
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.45);
    doc.setFillColor(...accent);
    doc.rect(margin, startY - 1, contentW, 1.15, 'F');
    rounded(margin, startY - 1, contentW, h + 1, 2, 'S');
    y = startY - 1 + h + 5;
  };

  const barChart = (entries, { maxBars = 18, showPct = true } = {}) => {
    const list = (entries || [])
      .map((e) => ({
        label: stripHtmlPlain(e.label ?? e.etiqueta ?? e[0] ?? ''),
        value: Number(e.value ?? e.c ?? e[1] ?? 0) || 0
      }))
      .filter((e) => e.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, maxBars);

    if (!list.length) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(...COLORS.muted);
      doc.text('Sin datos para graficar.', margin + 2, y);
      y += 6;
      return;
    }

    const total = list.reduce((s, e) => s + e.value, 0);
    const maxV = Math.max(...list.map((e) => e.value), 1);
    const labelW = Math.min(58, contentW * 0.34);
    const barMaxW = contentW - labelW - 28;
    const rowH = 7;

    list.forEach((e, idx) => {
      ensure(rowH + 1);
      const color = COLORS.barPalette[idx % COLORS.barPalette.length];
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...COLORS.slate);
      const lab = doc.splitTextToSize(e.label || '(sin etiqueta)', labelW - 2);
      doc.text(lab[0], margin + 1, y + 4.2);

      const bw = Math.max(2, (e.value / maxV) * barMaxW);
      doc.setFillColor(241, 245, 249);
      rounded(margin + labelW, y + 1.2, barMaxW, 4.2, 1.2, 'F');
      doc.setFillColor(...color);
      rounded(margin + labelW, y + 1.2, bw, 4.2, 1.2, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...COLORS.slate);
      const right = showPct ? `${e.value} (${pct(e.value, total)}%)` : String(e.value);
      doc.text(right, margin + labelW + barMaxW + 2, y + 4.2);
      y += rowH;
    });
    y += 2;
  };

  const stackedBar = (entries) => {
    const list = (entries || [])
      .map((e) => ({
        label: String(e.label ?? e.rol_respondiente ?? e.etiqueta ?? ''),
        value: Number(e.value ?? e.c ?? 0) || 0
      }))
      .filter((e) => e.value > 0);
    const total = list.reduce((s, e) => s + e.value, 0) || 1;
    ensure(18);
    let x = margin;
    const h = 8;
    list.forEach((e, idx) => {
      const w = Math.max(1.5, (e.value / total) * contentW);
      doc.setFillColor(...COLORS.barPalette[idx % COLORS.barPalette.length]);
      doc.rect(x, y, w, h, 'F');
      x += w;
    });
    y += h + 4;
    let lx = margin;
    list.forEach((e, idx) => {
      ensure(6);
      const color = COLORS.barPalette[idx % COLORS.barPalette.length];
      doc.setFillColor(...color);
      doc.circle(lx + 1.5, y - 1.2, 1.5, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...COLORS.slate);
      const txt = `${e.label}: ${e.value} (${pct(e.value, total)}%)`;
      doc.text(txt, lx + 5, y);
      const tw = doc.getTextWidth(txt) + 10;
      if (lx + tw > margin + contentW) {
        lx = margin;
        y += 5;
        ensure(6);
      } else {
        lx += tw;
      }
    });
    y += 4;
  };

  return {
    get y() {
      return y;
    },
    set y(v) {
      y = v;
    },
    margin,
    contentW,
    pageW,
    pageH,
    ensure,
    hero,
    kpiRow,
    sectionTitle,
    cardEnd,
    barChart,
    stackedBar,
    footerAllPages,
    rounded
  };
}

/**
 * PDF de estadísticas de encuesta (total o filtrado por grupo) — diseño con KPIs y gráficos.
 */
export function generarPdfEstadisticasEncuesta({
  encuesta,
  totalGeneral,
  totalRespuestas,
  grupoSeleccionado,
  porGrupo,
  porRol,
  resultadosPreguntas
}) {
  const doc = new jsPDF('p', 'mm', 'a4');
  const kit = createPdfKit(doc, { accent: COLORS.primary, accentDark: COLORS.primaryDark });
  const titulo = String(encuesta?.titulo || 'Encuesta');
  const fechaExp = new Date().toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });

  kit.hero({
    eyebrow: 'Reporte de estadísticas',
    title: titulo,
    subtitleLines: [
      `Exportado: ${fechaExp}`,
      grupoSeleccionado
        ? `Alcance: grupo «${grupoSeleccionado}»`
        : 'Alcance: total general · todos los grupos'
    ]
  });

  kit.kpiRow([
    {
      label: grupoSeleccionado ? 'Respuestas (grupo)' : 'Respuestas (vista)',
      value: totalRespuestas ?? 0,
      bg: COLORS.softBlue,
      accent: COLORS.primary
    },
    {
      label: 'Total general',
      value: totalGeneral ?? totalRespuestas ?? 0,
      bg: COLORS.softTeal,
      accent: COLORS.teal
    },
    {
      label: 'Grupos con data',
      value: (porGrupo || []).length,
      bg: COLORS.softAmber,
      accent: [217, 119, 6]
    }
  ]);

  if ((porGrupo || []).length) {
    kit.sectionTitle('Participación por grupo');
    const start = kit.y;
    kit.y += 3;
    kit.barChart(porGrupo, { maxBars: 20 });
    kit.cardEnd(start, { pad: 2 });
  }

  if ((porRol || []).length) {
    kit.sectionTitle(
      grupoSeleccionado ? `Participación por rol · ${grupoSeleccionado}` : 'Participación por rol · total'
    );
    const start = kit.y;
    kit.y += 3;
    kit.stackedBar(
      (porRol || []).map((r) => ({ label: r.rol_respondiente, value: r.c }))
    );
    kit.cardEnd(start, { pad: 2 });
  }

  const preguntas = (resultadosPreguntas || []).filter((rp) => rp.tipo_respuesta !== 'titulo');
  if (preguntas.length) {
    kit.sectionTitle('Resultados por pregunta');
  }

  preguntas.forEach((rp) => {
    const perguntaTxt = stripHtmlPlain(rp.texto_pregunta) || `Pregunta ${rp.orden}`;
    kit.ensure(30);
    const start = kit.y;
    kit.y += 4;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.primary);
    doc.text(`PREGUNTA ${rp.orden}  ·  ${String(rp.tipo_respuesta || '').toUpperCase()}`, kit.margin + 3, kit.y);
    kit.y += 5;

    doc.setTextColor(...COLORS.slate);
    doc.setFontSize(9.5);
    const lines = doc.splitTextToSize(perguntaTxt, kit.contentW - 8);
    doc.text(lines, kit.margin + 3, kit.y);
    kit.y += lines.length * 4.2 + 3;

    if (rp.tipo_respuesta === 'marcar' || rp.tipo_respuesta === 'lista') {
      const entries = Object.entries(rp.datos || {}).map(([label, value]) => ({ label, value }));
      if (!entries.length) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        doc.setTextColor(...COLORS.muted);
        doc.text('Sin respuestas marcadas.', kit.margin + 3, kit.y);
        kit.y += 5;
      } else {
        kit.barChart(entries, { maxBars: 24 });
      }
    } else if (rp.tipo_respuesta === 'escala') {
      const d = rp.datos || {};
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...COLORS.slate);
      doc.text(`Promedio: ${d.promedio ?? '—'}   ·   n = ${d.total ?? 0}`, kit.margin + 3, kit.y);
      kit.y += 5;
      const entries = Object.entries(d.distribucion || {}).map(([label, value]) => ({
        label: `Valor ${label}`,
        value
      }));
      kit.barChart(entries, { showPct: true });
    } else if (rp.tipo_respuesta === 'texto_corto' || rp.tipo_respuesta === 'texto_largo') {
      const muestras = rp.datos?.muestras || [];
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...COLORS.muted);
      doc.text(`${muestras.length} respuesta(s) de texto (muestra hasta 12)`, kit.margin + 3, kit.y);
      kit.y += 4;
      muestras.slice(0, 12).forEach((t, i) => {
        kit.ensure(10);
        doc.setFillColor(...COLORS.cardBg);
        const txt = doc.splitTextToSize(`${i + 1}. ${String(t).slice(0, 280)}`, kit.contentW - 10);
        const boxH = txt.length * 3.6 + 4;
        kit.rounded(kit.margin + 2, kit.y, kit.contentW - 4, boxH, 1.5, 'F');
        doc.setTextColor(...COLORS.slate);
        doc.setFontSize(7.5);
        doc.text(txt, kit.margin + 4, kit.y + 4);
        kit.y += boxH + 2;
      });
    }

    kit.cardEnd(start, { pad: 2 });
  });

  kit.footerAllPages(titulo);
  const suf = grupoSeleccionado ? '_grupo' : '_total';
  doc.save(`encuesta_estadisticas${suf}_${safeName(titulo)}.pdf`);
}

/**
 * PDF de historial de respuestas — cabecera, KPIs, tablas por grupo.
 */
export function generarPdfHistorialEncuesta({ encuesta, filas, grupoSeleccionado }) {
  const doc = new jsPDF('p', 'mm', 'a4');
  const kit = createPdfKit(doc, { accent: COLORS.teal, accentDark: COLORS.tealDark });
  const titulo = String(encuesta?.titulo || 'Encuesta');
  const lista = filas || [];

  const byGroup = new Map();
  const byRol = new Map();
  for (const f of lista) {
    const rol = String(f.rol_respondiente || '').toUpperCase();
    const k =
      f.grupo_etiqueta ||
      (rol === 'APODERADO' ? 'Apoderados' : 'Sin grupo');
    if (!byGroup.has(k)) byGroup.set(k, []);
    byGroup.get(k).push(f);
    byRol.set(rol || 'OTRO', (byRol.get(rol || 'OTRO') || 0) + 1);
  }
  // Apoderados primero (si existe), luego el resto alfabético
  const gruposSorted = [...byGroup.entries()].sort((a, b) => {
    if (a[0] === 'Apoderados') return -1;
    if (b[0] === 'Apoderados') return 1;
    return a[0].localeCompare(b[0], 'es');
  });

  kit.hero({
    eyebrow: 'Historial de respuestas',
    title: titulo,
    subtitleLines: [
      `Exportado: ${new Date().toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })}`,
      grupoSeleccionado ? `Filtro: grupo «${grupoSeleccionado}»` : 'Filtro: todos los grupos'
    ]
  });

  kit.kpiRow([
    {
      label: 'Respuestas',
      value: lista.length,
      bg: COLORS.softTeal,
      accent: COLORS.teal
    },
    {
      label: 'Grupos',
      value: byGroup.size,
      bg: COLORS.softBlue,
      accent: COLORS.primary
    },
    {
      label: 'Roles distintos',
      value: byRol.size,
      bg: COLORS.softAmber,
      accent: [217, 119, 6]
    }
  ]);

  if (byGroup.size > 1) {
    kit.sectionTitle('Resumen por grupo');
    const start = kit.y;
    kit.y += 3;
    kit.barChart(
      gruposSorted.map(([etiqueta, rows]) => ({ label: etiqueta, value: rows.length })),
      { maxBars: 22 }
    );
    kit.cardEnd(start, { pad: 2 });
  }

  if (byRol.size) {
    kit.sectionTitle('Distribución por rol');
    const start = kit.y;
    kit.y += 3;
    kit.stackedBar([...byRol.entries()].map(([label, value]) => ({ label, value })));
    kit.cardEnd(start, { pad: 2 });
  }

  kit.sectionTitle('Detalle de participantes');

  const col = {
    nombre: 72,
    rol: 28,
    fecha: 38
  };
  // grupo shown in section headers; leftover for spacing
  void col;

  for (const [grupo, rows] of gruposSorted) {
    kit.ensure(22);
    // Group header chip
    doc.setFillColor(...COLORS.teal);
    kit.rounded(kit.margin, kit.y, kit.contentW, 8, 1.5, 'F');
    doc.setTextColor(...COLORS.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(`${grupo}  ·  ${rows.length} respuesta(s)`, kit.margin + 3, kit.y + 5.3);
    kit.y += 10;

    // Table head
    doc.setFillColor(241, 245, 249);
    doc.rect(kit.margin, kit.y, kit.contentW, 6.5, 'F');
    doc.setTextColor(...COLORS.muted);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text('PARTICIPANTE', kit.margin + 2, kit.y + 4.3);
    doc.text('ROL', kit.margin + 78, kit.y + 4.3);
    doc.text('FECHA', kit.margin + 108, kit.y + 4.3);
    kit.y += 6.5;

    rows.forEach((f, i) => {
      kit.ensure(8);
      const rowH = 7;
      if (i % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(kit.margin, kit.y, kit.contentW, rowH, 'F');
      }
      doc.setDrawColor(...COLORS.border);
      doc.setLineWidth(0.2);
      doc.line(kit.margin, kit.y + rowH, kit.margin + kit.contentW, kit.y + rowH);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...COLORS.slate);
      const nombre = String(f.nombre_mostrar || f.usuario_login || 'Usuario');
      doc.text(doc.splitTextToSize(nombre, 74)[0], kit.margin + 2, kit.y + 4.5);

      const rol = String(f.rol_respondiente || '—');
      // pill-ish for rol
      const rolW = Math.min(28, doc.getTextWidth(rol) + 4);
      const rolColor =
        rol.toUpperCase() === 'ALUMNO'
          ? COLORS.primary
          : rol.toUpperCase() === 'APODERADO'
            ? [139, 92, 246]
            : COLORS.teal;
      doc.setFillColor(...rolColor);
      kit.rounded(kit.margin + 78, kit.y + 1.5, rolW, 4.2, 1, 'F');
      doc.setTextColor(...COLORS.white);
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'bold');
      doc.text(rol.slice(0, 14), kit.margin + 80, kit.y + 4.4);

      doc.setTextColor(...COLORS.muted);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      const fecha = f.fecha_respuesta
        ? new Date(f.fecha_respuesta).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })
        : '—';
      doc.text(fecha, kit.margin + 108, kit.y + 4.5);

      kit.y += rowH;
    });

    kit.y += 4;
  }

  kit.footerAllPages(titulo);
  doc.save(`encuesta_historial_${safeName(titulo)}.pdf`);
}
