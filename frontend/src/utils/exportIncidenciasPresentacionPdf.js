import { jsPDF } from 'jspdf';
import { etiquetaOrigenConducta } from './reglaConducta';

function formatearSoloFecha(f) {
  if (f == null || f === '') return '—';
  if (typeof f === 'string' && /^\d{4}-\d{2}-\d{2}/.test(f)) {
    const [y, m, d] = f.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  try {
    return new Date(f).toLocaleDateString('es-PE');
  } catch {
    return String(f);
  }
}

function formatearFechaHoraPeru(iso) {
  if (iso == null || iso === '') return '—';
  try {
    return new Date(iso).toLocaleString('es-PE', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return String(iso);
  }
}

/** jsPDF no dibuja bien emojis/símbolos; evita basura tipo Ø=Þ¯ y anchos raros */
function sanitizePdfText(t) {
  return String(t || '')
    .normalize('NFKD')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]/gu, '')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF\u0100-\u017F]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tipoOrigenPdf(origen) {
  return sanitizePdfText(etiquetaOrigenConducta(origen).toUpperCase());
}

function esPresentacion(origen) {
  return origen === 'vestimenta';
}

async function cargarLogoDataUrl() {
  try {
    const { cargarLogoPngDataUrl } = await import('./pdfReporteColegioLogo');
    return await cargarLogoPngDataUrl('/icons/logoboleta.png');
  } catch {
    return null;
  }
}

/**
 * PDF de incidencias + presentación (grupo o un alumno).
 * @param {{
 *   alumnos: Array<{ alumno_nombre?: string, incidencias?: Array }>,
 *   grupo: { grado?: any, seccion?: string, nivel_nombre?: string, anio?: any },
 *   ciclo?: number|null,
 *   fechaDesde?: string,
 *   fechaHasta?: string,
 *   tituloExtra?: string,
 *   filenameSuffix?: string,
 * }} opts
 */
export async function exportIncidenciasPresentacionPdf({
  alumnos,
  grupo,
  ciclo = null,
  fechaDesde = '',
  fechaHasta = '',
  tituloExtra = '',
  filenameSuffix = '',
}) {
  const lista = (alumnos || []).filter((a) => (a.incidencias || []).length > 0);
  if (!lista.length) {
    return { ok: false, reason: 'empty' };
  }

  const doc = new jsPDF('p', 'mm', 'a4');
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const mm = 14;
  const innerW = pw - 2 * mm;
  const footerH = 12;
  const yMax = () => ph - footerH;
  const tituloGrupo = `${grupo?.grado ?? ''}° ${grupo?.seccion || ''} - ${grupo?.nivel_nombre || ''}`.replace(/\s+/g, ' ').trim();
  const periodoTxt =
    ciclo >= 1 && ciclo <= 4
      ? `Bimestre ${ciclo}  ·  ${formatearSoloFecha(fechaDesde)} → ${formatearSoloFecha(fechaHasta)}`
      : `Periodo: ${formatearSoloFecha(fechaDesde)} → ${formatearSoloFecha(fechaHasta)}`;

  const logo = await cargarLogoDataUrl();
  const colorHeader = [67, 56, 202];
  const colorMuted = [100, 116, 139];
  const colorText = [30, 41, 59];

  let y = 0;

  const dibujarHeader = (continuacion) => {
    doc.setFillColor(...colorHeader);
    doc.rect(0, 0, pw, continuacion ? 22 : 34, 'F');
    if (logo && !continuacion) {
      try {
        doc.addImage(logo, 'PNG', mm, 5, 22, 22);
      } catch {
        /* ignore */
      }
    }
    const xText = logo && !continuacion ? mm + 26 : mm;
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(continuacion ? 11 : 13);
    doc.text(
      continuacion ? 'INCIDENCIAS, PRESENTACIÓN Y TARDANZAS (continúa)' : 'INCIDENCIAS, PRESENTACIÓN Y TARDANZAS',
      xText,
      continuacion ? 10 : 12
    );
    if (!continuacion) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(226, 232, 240);
      const linea2 = [tituloGrupo, grupo?.anio ? `Año ${grupo.anio}` : '', tituloExtra]
        .filter(Boolean)
        .join('  ·  ');
      doc.text(linea2, xText, 20);
      doc.text(periodoTxt, xText, 27);
      y = 42;
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(226, 232, 240);
      doc.text(periodoTxt, xText, 17);
      y = 28;
    }
  };

  const asegurarEspacio = (necesario) => {
    if (y + necesario > yMax()) {
      doc.addPage();
      dibujarHeader(true);
    }
  };

  dibujarHeader(false);

  for (let i = 0; i < lista.length; i += 1) {
    const al = lista[i];
    const regs = al.incidencias || [];
    const nInc = regs.filter((r) => r.origen !== 'vestimenta' && r.origen !== 'tardanza').length;
    const nPres = regs.filter((r) => r.origen === 'vestimenta').length;
    const nTard = regs.filter((r) => r.origen === 'tardanza').length;

    asegurarEspacio(16);

    // Cabecera de alumno
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.roundedRect(mm, y, innerW, 10, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...colorText);
    doc.text(String(al.alumno_nombre || 'Alumno'), mm + 3, y + 6.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...colorMuted);
    const resumen = `${regs.length} reg.  ·  ${nInc} incidencia${nInc !== 1 ? 's' : ''}  ·  ${nPres} presentación  ·  ${nTard} tardanza`;
    doc.text(resumen, pw - mm - 3, y + 6.5, { align: 'right' });
    y += 13;

    for (let j = 0; j < regs.length; j += 1) {
      const inc = regs[j];
      const esVest = esPresentacion(inc.origen);
      const tipo = tipoOrigenPdf(inc.origen);
      const desc = sanitizePdfText(inc.description || '');
      const lineasDesc = desc ? doc.splitTextToSize(desc, innerW - 10) : [];
      const altoDesc = lineasDesc.length * 4.2;
      const altoCard = 18 + (lineasDesc.length ? 4 + altoDesc : 0);

      asegurarEspacio(Math.min(altoCard, 40));

      const y0 = y;
      // borde izquierdo por tipo
      if (esVest) {
        doc.setFillColor(255, 247, 237);
        doc.setDrawColor(251, 146, 60);
      } else {
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(165, 180, 252);
      }
      doc.setLineWidth(0.35);
      doc.roundedRect(mm, y0, innerW, altoCard, 1.2, 1.2, 'FD');
      doc.setFillColor(esVest ? 234 : 79, esVest ? 88 : 70, esVest ? 12 : 229);
      doc.rect(mm, y0, 1.6, altoCard, 'F');

      // Fecha + tipo
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...colorText);
      doc.text(formatearFechaHoraPeru(inc.created_at), mm + 5, y0 + 5.5);

      const tipoW = doc.getTextWidth(tipo) + 4;
      doc.setFillColor(esVest ? 254 : 237, esVest ? 215 : 233, esVest ? 170 : 254);
      doc.roundedRect(pw - mm - tipoW - 4, y0 + 2.2, tipoW, 5, 1, 1, 'F');
      doc.setFontSize(7);
      doc.setTextColor(esVest ? 154 : 91, esVest ? 52 : 33, esVest ? 18 : 182);
      doc.text(tipo, pw - mm - tipoW - 2, y0 + 5.6);

      // Meta
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...colorMuted);
      doc.text('Docente', mm + 5, y0 + 10.5);
      doc.text('Curso', mm + innerW / 2, y0 + 10.5);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.2);
      doc.setTextColor(esVest ? 154 : 67, esVest ? 52 : 56, esVest ? 18 : 202);
      const docNom = doc.splitTextToSize(String(inc.docente_nombre || '—'), innerW / 2 - 10);
      const curNom = doc.splitTextToSize(String(inc.curso_nombre || '—'), innerW / 2 - 10);
      doc.text(docNom[0] || '—', mm + 5, y0 + 14.5);
      doc.setTextColor(4, 120, 87);
      doc.text(curNom[0] || '—', mm + innerW / 2, y0 + 14.5);

      if (lineasDesc.length) {
        let yd = y0 + 19;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.2);
        doc.setTextColor(51, 65, 85);
        lineasDesc.forEach((ln) => {
          doc.text(ln, mm + 5, yd);
          yd += 4.2;
        });
      }

      y = y0 + altoCard + 3.2;
    }

    y += 2;
  }

  const genTxt = `Generado: ${new Date().toLocaleString('es-PE')}`;
  const totalP = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalP; p += 1) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(mm, ph - 9, pw - mm, ph - 9);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...colorMuted);
    doc.text(genTxt, mm, ph - 5);
    doc.text(`Pág. ${p} / ${totalP}`, pw - mm, ph - 5, { align: 'right' });
  }

  const safeGrupo = tituloGrupo.replace(/\s+/g, '_') || 'grupo';
  const suf = filenameSuffix || (ciclo ? `B${ciclo}` : 'periodo');
  const soloUno = lista.length === 1 ? `_${String(lista[0].alumno_nombre || 'alumno').replace(/\s+/g, '_').slice(0, 40)}` : '';
  doc.save(`${safeGrupo}_incidencias_presentacion_${suf}${soloUno}.pdf`);
  return { ok: true };
}

/**
 * PDF completo del hijo: todos los bimestres + nota de conducta por bimestre.
 */
export async function exportIncidenciasHijoBimestresPdf({
  alumnoNombre,
  anio,
  bimestres = [],
  notaMax = 20,
}) {
  const hayAlgo = (bimestres || []).some((b) => (b.incidencias || []).length > 0);
  if (!hayAlgo) return { ok: false, reason: 'empty' };

  const doc = new jsPDF('p', 'mm', 'a4');
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const mm = 14;
  const innerW = pw - 2 * mm;
  const footerH = 12;
  const yMax = () => ph - footerH;
  const logo = await cargarLogoDataUrl();
  const colorHeader = [67, 56, 202];
  const colorMuted = [100, 116, 139];
  const colorText = [30, 41, 59];
  let y = 0;

  const dibujarHeader = (continuacion) => {
    doc.setFillColor(...colorHeader);
    doc.rect(0, 0, pw, continuacion ? 20 : 32, 'F');
    if (logo && !continuacion) {
      try {
        doc.addImage(logo, 'PNG', mm, 4, 20, 20);
      } catch {
        /* ignore */
      }
    }
    const xText = logo && !continuacion ? mm + 24 : mm;
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(continuacion ? 11 : 13);
    doc.text(
      continuacion ? 'INCIDENCIAS, PRESENTACIÓN Y TARDANZAS (continúa)' : 'INCIDENCIAS, PRESENTACIÓN Y TARDANZAS',
      xText,
      continuacion ? 9 : 12
    );
    if (!continuacion) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(226, 232, 240);
      doc.text(sanitizePdfText(alumnoNombre || 'Alumno'), xText, 20);
      doc.text(`Año escolar ${anio || ''}  ·  Agrupado por bimestre`, xText, 26);
      y = 40;
    } else {
      y = 26;
    }
  };

  const asegurar = (h) => {
    if (y + h > yMax()) {
      doc.addPage();
      dibujarHeader(true);
    }
  };

  dibujarHeader(false);

  for (const bim of bimestres || []) {
    const regs = bim.incidencias || [];
    asegurar(22);

    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(mm, y, innerW, 14, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...colorText);
    doc.text(`Bimestre ${bim.ciclo}`, mm + 3, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...colorMuted);
    doc.text(
      `${formatearSoloFecha(bim.fecha_desde)} → ${formatearSoloFecha(bim.fecha_hasta)}  ·  ${regs.length} registro(s)`,
      mm + 3,
      y + 11
    );
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(146, 64, 14);
    doc.text(
      bim.modo === 'nueva'
        ? `Promedio: ${bim.nota_conducta ?? notaMax}`
        : `Conducta: ${bim.nota_conducta ?? notaMax}`,
      pw - mm - 3,
      y + 8.5,
      { align: 'right' }
    );
    y += 18;

    if (bim.modo === 'nueva') {
      asegurar(16);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(mm, y, innerW, 12, 1.2, 1.2, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(
        `Primeras 4 semanas: ${bim.nota_mes_1 ?? '—'} (−${bim.descontado_1 ?? '0.00'})   ·   Siguientes semanas: ${bim.nota_mes_2 ?? '—'} (−${bim.descontado_2 ?? '0.00'})   ·   Promedio: ${bim.nota_conducta ?? notaMax}`,
        mm + 3,
        y + 7.5
      );
      y += 16;
    }

    if (!regs.length) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(...colorMuted);
      doc.text('Sin registros en este bimestre.', mm + 2, y);
      y += 8;
      continue;
    }

    for (const inc of regs) {
      const esVest = esPresentacion(inc.origen);
      const tipo = tipoOrigenPdf(inc.origen);
      const desc = sanitizePdfText(
        `${inc.description || ''}${inc.descuento ? ` · −${inc.descuento}` : ''}`
      );
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      const lineasDesc = desc ? doc.splitTextToSize(desc, innerW - 10) : [];
      const lineH = 4.1;
      const headerH = 14.5;
      const padBottom = 3.5;
      const maxBodyH = yMax() - 30; // cabecera continuación + margen

      // Pintar por trozos si el detalle es muy largo (no sale de la hoja)
      let offset = 0;
      while (offset < Math.max(lineasDesc.length, 1) || (offset === 0 && !lineasDesc.length)) {
        if (yMax() - y < headerH + padBottom + lineH + 2) {
          asegurar(headerH + padBottom + lineH + 6);
        }
        const espacio = yMax() - y - 4;
        const maxLinesHere = Math.max(1, Math.floor((Math.min(espacio, maxBodyH) - headerH - padBottom) / lineH));
        const chunk = lineasDesc.slice(offset, offset + (lineasDesc.length ? maxLinesHere : 0));
        const altoCard = headerH + (chunk.length ? chunk.length * lineH : 0) + padBottom;
        asegurar(Math.min(altoCard + 2, yMax() - 28));

        const y0 = y;
        doc.setFillColor(esVest ? 255 : 248, esVest ? 247 : 250, esVest ? 237 : 252);
        doc.setDrawColor(esVest ? 251 : 165, esVest ? 146 : 180, esVest ? 60 : 252);
        doc.setLineWidth(0.3);
        doc.roundedRect(mm, y0, innerW, altoCard, 1.2, 1.2, 'FD');
        doc.setFillColor(esVest ? 234 : 79, esVest ? 88 : 70, esVest ? 12 : 229);
        doc.rect(mm, y0, 1.5, altoCard, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.2);
        doc.setTextColor(...colorText);
        const fechaTxt = offset === 0
          ? formatearFechaHoraPeru(inc.created_at)
          : `${formatearFechaHoraPeru(inc.created_at)} (cont.)`;
        doc.text(fechaTxt, mm + 4, y0 + 5);

        const tipoW = doc.getTextWidth(tipo) + 3.5;
        doc.setFillColor(esVest ? 254 : 237, esVest ? 215 : 233, esVest ? 170 : 254);
        doc.roundedRect(pw - mm - tipoW - 3, y0 + 2, tipoW, 4.8, 1, 1, 'F');
        doc.setFontSize(6.8);
        doc.setTextColor(esVest ? 154 : 91, esVest ? 52 : 33, esVest ? 18 : 182);
        doc.text(tipo, pw - mm - tipoW - 1.2, y0 + 5.3);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.2);
        doc.setTextColor(...colorMuted);
        const meta = `${sanitizePdfText(inc.docente_nombre || '—')}  ·  ${sanitizePdfText(inc.curso_nombre || '—')}`;
        const metaLines = doc.splitTextToSize(meta, innerW - 10);
        doc.text(metaLines[0] || '—', mm + 4, y0 + 10);

        if (chunk.length) {
          let yd = y0 + 14.5;
          doc.setFontSize(8);
          doc.setTextColor(51, 65, 85);
          chunk.forEach((ln) => {
            doc.text(ln, mm + 4, yd);
            yd += lineH;
          });
        }
        y = y0 + altoCard + 3;

        if (!lineasDesc.length) break;
        offset += chunk.length;
        if (offset >= lineasDesc.length) break;
      }
    }

    if (bim.modo === 'nueva') {
      y += 2;
      continue;
    }
    // Resumen conducta del bimestre
    asegurar(16);
    doc.setFillColor(254, 243, 199);
    doc.setDrawColor(251, 191, 36);
    doc.roundedRect(mm, y, innerW, 12, 1.2, 1.2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(146, 64, 14);
    doc.text(
      `Resumen B${bim.ciclo}: ${bim.total_incidencias || 0} incidencia(s) + ${bim.total_presentacion || 0} presentación(es) + ${bim.total_tardanzas || 0} tardanza(s) + ${bim.total_olvido_qr || 0} olvido QR = promedio ${bim.nota_conducta ?? notaMax}`,
      mm + 3,
      y + 7.5
    );
    y += 18;
  }

  const genTxt = `Generado: ${new Date().toLocaleString('es-PE')}`;
  const totalP = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalP; p += 1) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240);
    doc.line(mm, ph - 9, pw - mm, ph - 9);
    doc.setFontSize(7.5);
    doc.setTextColor(...colorMuted);
    doc.text(genTxt, mm, ph - 5);
    doc.text(`Pág. ${p} / ${totalP}`, pw - mm, ph - 5, { align: 'right' });
  }

  const safe = sanitizePdfText(alumnoNombre || 'alumno').replace(/\s+/g, '_').slice(0, 50);
  doc.save(`Incidencias_Presentacion_${safe}_${anio || ''}.pdf`);
  return { ok: true };
}

/**
 * PDF de estrellas del hijo agrupado por bimestre.
 */
export async function exportEstrellasHijoBimestresPdf({
  alumnoNombre,
  anio,
  bimestres = [],
}) {
  const hayAlgo = (bimestres || []).some((b) => (b.estrellas || []).length > 0);
  if (!hayAlgo) return { ok: false, reason: 'empty' };

  const doc = new jsPDF('p', 'mm', 'a4');
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const mm = 14;
  const innerW = pw - 2 * mm;
  const footerH = 12;
  const yMax = () => ph - footerH;
  const logo = await cargarLogoDataUrl();
  const colorHeader = [217, 119, 6];
  const colorMuted = [100, 116, 139];
  const colorText = [30, 41, 59];
  let y = 0;

  const dibujarHeader = (continuacion) => {
    doc.setFillColor(...colorHeader);
    doc.rect(0, 0, pw, continuacion ? 20 : 32, 'F');
    if (logo && !continuacion) {
      try {
        doc.addImage(logo, 'PNG', mm, 4, 20, 20);
      } catch {
        /* ignore */
      }
    }
    const xText = logo && !continuacion ? mm + 24 : mm;
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(continuacion ? 11 : 13);
    doc.text(continuacion ? 'ESTRELLAS (continúa)' : 'ESTRELLAS', xText, continuacion ? 9 : 12);
    if (!continuacion) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(254, 243, 199);
      doc.text(sanitizePdfText(alumnoNombre || 'Alumno'), xText, 20);
      doc.text(`Año escolar ${anio || ''}  ·  Agrupado por bimestre`, xText, 26);
      y = 40;
    } else {
      y = 26;
    }
  };

  const asegurar = (h) => {
    if (y + h > yMax()) {
      doc.addPage();
      dibujarHeader(true);
    }
  };

  dibujarHeader(false);

  for (const bim of bimestres || []) {
    const regs = bim.estrellas || [];
    asegurar(22);

    doc.setFillColor(255, 251, 235);
    doc.setDrawColor(253, 230, 138);
    doc.roundedRect(mm, y, innerW, 14, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...colorText);
    doc.text(`Bimestre ${bim.ciclo}`, mm + 3, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...colorMuted);
    doc.text(
      `${formatearSoloFecha(bim.fecha_desde)} → ${formatearSoloFecha(bim.fecha_hasta)}  ·  ${regs.length} registro(s)`,
      mm + 3,
      y + 11
    );
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(180, 83, 9);
    doc.text(`Total: ${bim.total_puntos ?? 0} ★`, pw - mm - 3, y + 8.5, { align: 'right' });
    y += 18;

    if (!regs.length) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(...colorMuted);
      doc.text('Sin estrellas en este bimestre.', mm + 2, y);
      y += 8;
      continue;
    }

    for (const est of regs) {
      const desc = sanitizePdfText(est.description || '');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      const lineasDesc = desc ? doc.splitTextToSize(desc, innerW - 10) : [];
      const altoCard = 16 + (lineasDesc.length ? lineasDesc.length * 4 : 0);
      asegurar(Math.min(altoCard + 2, 45));

      const y0 = y;
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(253, 230, 138);
      doc.setLineWidth(0.3);
      doc.roundedRect(mm, y0, innerW, altoCard, 1.2, 1.2, 'FD');
      doc.setFillColor(245, 158, 11);
      doc.rect(mm, y0, 1.5, altoCard, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.2);
      doc.setTextColor(...colorText);
      doc.text(formatearFechaHoraPeru(est.created_at), mm + 4, y0 + 5);

      const pts = `+${est.points || 0}`;
      const ptsW = doc.getTextWidth(pts) + 4;
      doc.setFillColor(254, 243, 199);
      doc.roundedRect(pw - mm - ptsW - 3, y0 + 2, ptsW, 4.8, 1, 1, 'F');
      doc.setFontSize(7.5);
      doc.setTextColor(180, 83, 9);
      doc.text(pts, pw - mm - ptsW - 1, y0 + 5.3);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.2);
      doc.setTextColor(...colorMuted);
      const meta = `${sanitizePdfText(est.docente_nombre || '—')}  ·  ${sanitizePdfText(est.curso_nombre || '—')}`;
      doc.text(doc.splitTextToSize(meta, innerW - 10)[0] || '—', mm + 4, y0 + 10);

      if (lineasDesc.length) {
        let yd = y0 + 14.5;
        doc.setFontSize(8);
        doc.setTextColor(51, 65, 85);
        lineasDesc.forEach((ln) => {
          doc.text(ln, mm + 4, yd);
          yd += 4;
        });
      }
      y = y0 + altoCard + 3;
    }

    asegurar(12);
    doc.setFillColor(255, 251, 235);
    doc.setDrawColor(251, 191, 36);
    doc.roundedRect(mm, y, innerW, 10, 1.2, 1.2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(146, 64, 14);
    doc.text(
      `Resumen B${bim.ciclo}: ${bim.total_puntos ?? 0} estrella(s) en ${regs.length} registro(s)`,
      mm + 3,
      y + 6.5
    );
    y += 16;
  }

  const genTxt = `Generado: ${new Date().toLocaleString('es-PE')}`;
  const totalP = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalP; p += 1) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240);
    doc.line(mm, ph - 9, pw - mm, ph - 9);
    doc.setFontSize(7.5);
    doc.setTextColor(...colorMuted);
    doc.text(genTxt, mm, ph - 5);
    doc.text(`Pág. ${p} / ${totalP}`, pw - mm, ph - 5, { align: 'right' });
  }

  const safe = sanitizePdfText(alumnoNombre || 'alumno').replace(/\s+/g, '_').slice(0, 50);
  doc.save(`Estrellas_${safe}_${anio || ''}.pdf`);
  return { ok: true };
}
