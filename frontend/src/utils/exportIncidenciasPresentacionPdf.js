import { jsPDF } from 'jspdf';

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

async function cargarLogoDataUrl() {
  try {
    const logoRes = await fetch('/icons/logoboleta.png');
    if (!logoRes.ok) return null;
    const blob = await logoRes.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
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
      continuacion ? 'INCIDENCIAS Y PRESENTACIÓN (continúa)' : 'INCIDENCIAS Y PRESENTACIÓN',
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
    const nInc = regs.filter((r) => r.origen !== 'vestimenta').length;
    const nPres = regs.filter((r) => r.origen === 'vestimenta').length;

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
    const resumen = `${regs.length} reg.  ·  ${nInc} incidencia${nInc !== 1 ? 's' : ''}  ·  ${nPres} presentación`;
    doc.text(resumen, pw - mm - 3, y + 6.5, { align: 'right' });
    y += 13;

    for (let j = 0; j < regs.length; j += 1) {
      const inc = regs[j];
      const esVest = inc.origen === 'vestimenta';
      const tipo = esVest ? 'PRESENTACIÓN' : 'INCIDENCIA';
      const desc = (inc.description || '').trim();
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
