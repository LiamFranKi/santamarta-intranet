import { jsPDF } from 'jspdf';
import { obtenerLogoColegioParaPdf, dibujarLogoEsquina } from './pdfReporteColegioLogo';
import { obtenerTituloColegio } from './identidadColegio';

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const DIAS_CORTOS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];

const INK = [15, 23, 42];
const MUTED = [100, 116, 139];
const HEADER = [55, 48, 163];
const HEADER_DEEP = [30, 27, 75];
const LINE = [226, 232, 240];
const WEEKEND_BG = [248, 250, 252];
const TODAY_BG = [255, 251, 235];
const TODAY_RING = [245, 158, 11];
const WHITE = [255, 255, 255];

function ymdLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseYmd(s) {
  const [y, m, d] = String(s || '').slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function lunesDe(d) {
  const dow = d.getDay();
  const offset = dow === 0 ? 6 : dow - 1;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset);
}

function isoWeek(d) {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
}

function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return [100, 116, 139];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function safeTxt(s) {
  return String(s || '').replace(/\r?\n/g, ' ').trim();
}

function fmtDiaMes(d) {
  return `${d.getDate()} de ${MESES[d.getMonth()]}`;
}

function fmtRangoSemana(lunes, domingo) {
  if (lunes.getMonth() === domingo.getMonth() && lunes.getFullYear() === domingo.getFullYear()) {
    return `${lunes.getDate()} – ${domingo.getDate()} de ${MESES[lunes.getMonth()]} ${lunes.getFullYear()}`;
  }
  if (lunes.getFullYear() === domingo.getFullYear()) {
    return `${lunes.getDate()} de ${MESES[lunes.getMonth()]} – ${domingo.getDate()} de ${MESES[domingo.getMonth()]} ${lunes.getFullYear()}`;
  }
  return `${fmtDiaMes(lunes)} ${lunes.getFullYear()} – ${fmtDiaMes(domingo)} ${domingo.getFullYear()}`;
}

function eventoCubreDia(ev, ymd) {
  return ev.fecha_inicio <= ymd && ev.fecha_fin >= ymd;
}

export function semanasAgendaPdf(desdeYmd, hastaYmd) {
  const start = lunesDe(parseYmd(desdeYmd));
  const end = parseYmd(hastaYmd);
  const weeks = [];
  let cur = start;
  while (cur <= end) {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(cur, i);
      return { date: d, ymd: ymdLocal(d) };
    });
    weeks.push({
      lunes: cur,
      domingo: addDays(cur, 6),
      days,
      weekNum: isoWeek(cur),
      year: isoWeek(cur) === 1 && cur.getMonth() === 11 ? cur.getFullYear() + 1 : cur.getFullYear(),
    });
    cur = addDays(cur, 7);
  }
  return weeks;
}

/** Calcula el rango a exportar: semana actual, mes del calendario o año del calendario. */
export function rangoAgendaPdf(modo, { anio, mes, hoyYmd }) {
  const hoy = parseYmd(hoyYmd) || new Date();
  if (modo === 'semana') {
    const lunes = lunesDe(hoy);
    const domingo = addDays(lunes, 6);
    return {
      desde: ymdLocal(lunes),
      hasta: ymdLocal(domingo),
      label: `Semana del ${fmtRangoSemana(lunes, domingo)}`,
      archivo: `agenda-interna-semana-${isoWeek(lunes)}-${lunes.getFullYear()}.pdf`,
    };
  }
  if (modo === 'anio') {
    const y = Number(anio) || hoy.getFullYear();
    return {
      desde: `${y}-01-01`,
      hasta: `${y}-12-31`,
      label: `Año ${y}`,
      archivo: `agenda-interna-${y}.pdf`,
    };
  }
  const y = Number(anio) || hoy.getFullYear();
  const m = Number(mes) || hoy.getMonth() + 1;
  const last = new Date(y, m, 0).getDate();
  const nombre = MESES[m - 1];
  return {
    desde: `${y}-${String(m).padStart(2, '0')}-01`,
    hasta: `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
    label: `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${y}`,
    archivo: `agenda-interna-${nombre}-${y}.pdf`,
  };
}

function dibujarSemana(doc, week, eventos, opts) {
  const { hoyYmd, tituloRango, filtrosLabel, logo, page, pages, colegioNombre } = opts;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 8;
  const innerW = pageW - margin * 2;

  doc.setFillColor(...HEADER);
  doc.rect(0, 0, pageW, 26, 'F');
  doc.setFillColor(...HEADER_DEEP);
  doc.rect(0, 26, pageW, 1.2, 'F');

  if (logo) {
    try {
      dibujarLogoEsquina(doc, logo, { margin: 8, maxWidth: 22, maxHeight: 14 });
    } catch {
      /* sin logo */
    }
  }

  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Agenda interna', margin + 26, 11);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`${colegioNombre || 'Vanguard Schools'}  ·  uso interno, no se publica en la web`, margin + 26, 16.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(fmtRangoSemana(week.lunes, week.domingo), pageW - margin, 10, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Semana ${week.weekNum}  ·  ${tituloRango}`, pageW - margin, 16, { align: 'right' });
  if (filtrosLabel) {
    doc.text(filtrosLabel, pageW - margin, 21.2, { align: 'right' });
  }

  const tiposUsados = [];
  const seen = new Set();
  for (const ev of eventos) {
    if (seen.has(ev.tipo)) continue;
    if (week.days.some((d) => eventoCubreDia(ev, d.ymd))) {
      seen.add(ev.tipo);
      tiposUsados.push(ev);
    }
  }

  let legendY = 30.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text('Tipos', margin, legendY + 2.2);
  let lx = margin + 12;
  tiposUsados.forEach((ev) => {
    const rgb = hexToRgb(ev.tipo_color);
    doc.setFillColor(...rgb);
    doc.roundedRect(lx, legendY - 1.2, 3.2, 3.2, 0.6, 0.6, 'F');
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'normal');
    const label = ev.tipo_etiqueta || ev.tipo;
    doc.text(label, lx + 4.2, legendY + 1.4);
    lx += doc.getTextWidth(label) + 8;
  });
  if (!tiposUsados.length) {
    doc.setTextColor(...MUTED);
    doc.setFont('helvetica', 'normal');
    doc.text('Sin avisos esta semana', lx, legendY + 1.4);
  }

  const gridTop = 36;
  const footerH = 7;
  const colW = innerW / 7;
  const colH = pageH - gridTop - footerH - margin;
  const headerDiaH = 12;

  week.days.forEach((day, i) => {
    const x = margin + i * colW;
    const esFin = i >= 5;
    const esHoy = day.ymd === hoyYmd;

    if (esHoy) doc.setFillColor(...TODAY_BG);
    else if (esFin) doc.setFillColor(...WEEKEND_BG);
    else doc.setFillColor(...WHITE);
    doc.rect(x, gridTop, colW, colH, 'F');

    doc.setFillColor(...(esHoy ? TODAY_RING : HEADER));
    doc.rect(x, gridTop, colW, headerDiaH, 'F');
    doc.setTextColor(...WHITE);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.text(DIAS_CORTOS[i], x + colW / 2, gridTop + 4.2, { align: 'center' });
    doc.setFontSize(11);
    doc.text(String(day.date.getDate()), x + colW / 2, gridTop + 10.2, { align: 'center' });

    doc.setDrawColor(...(esHoy ? TODAY_RING : LINE));
    doc.setLineWidth(esHoy ? 0.6 : 0.25);
    doc.rect(x, gridTop, colW, colH);

    const delDia = eventos
      .filter((ev) => eventoCubreDia(ev, day.ymd))
      .sort((a, b) => String(a.fecha_inicio).localeCompare(String(b.fecha_inicio)) || (a.id - b.id));

    const pad = 1.4;
    const cardH = 16.2;
    const gap = 1.3;
    const areaTop = gridTop + headerDiaH + pad;
    const areaBottom = gridTop + colH - pad;
    const maxCards = Math.max(0, Math.floor((areaBottom - areaTop + gap) / (cardH + gap)));
    const visibles = delDia.slice(0, Math.max(0, maxCards - (delDia.length > maxCards ? 1 : 0)));
    const ocultos = delDia.length - visibles.length;

    visibles.forEach((ev, idx) => {
      const y = areaTop + idx * (cardH + gap);
      const rgb = hexToRgb(ev.tipo_color);
      const hecho = ev.estado === 'HECHO';
      const vencido = ev.urgencia === 'vencido' && !hecho;

      doc.setFillColor(hecho ? 248 : 255, hecho ? 250 : 255, hecho ? 252 : 255);
      doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
      doc.setLineWidth(0.2);
      doc.roundedRect(x + pad, y, colW - pad * 2, cardH, 1.2, 1.2, 'FD');
      doc.setFillColor(...rgb);
      doc.rect(x + pad, y, 1.5, cardH, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.6);
      doc.setTextColor(...(hecho ? MUTED : INK));
      const titulo = doc.splitTextToSize(safeTxt(ev.titulo) || 'Aviso', colW - pad * 2 - 4);
      doc.text(titulo.slice(0, 2), x + pad + 3, y + 4.4);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.6);
      doc.setTextColor(...MUTED);
      const meta = [ev.tipo_etiqueta, ev.lugar].filter(Boolean).join(' · ');
      if (meta) {
        doc.text(doc.splitTextToSize(meta, colW - pad * 2 - 4)[0], x + pad + 3, y + 10.2);
      }

      let badge = '';
      if (hecho) badge = 'Hecho';
      else if (vencido) badge = 'Vencido';
      else if (ev.fecha_inicio !== ev.fecha_fin) {
        badge = ev.fecha_inicio === day.ymd ? 'Inicio' : ev.fecha_fin === day.ymd ? 'Cierra' : 'Sigue';
      }
      if (badge) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(5.2);
        doc.setTextColor(...(vencido ? [225, 29, 72] : hecho ? MUTED : HEADER));
        doc.text(badge, x + pad + 3, y + 14.2);
      }
    });

    if (ocultos > 0) {
      const y = areaTop + visibles.length * (cardH + gap) + 3.2;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.setTextColor(...HEADER);
      doc.text(`+${ocultos} más`, x + colW / 2, y, { align: 'center' });
    }

    if (delDia.length === 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.2);
      doc.setTextColor(180, 188, 200);
      doc.text('Sin avisos', x + colW / 2, gridTop + headerDiaH + 14, { align: 'center' });
    }
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text('Lun – Dom  ·  una hoja por semana', margin, pageH - 5);
  doc.text(`Hoja ${page} de ${pages}`, pageW - margin, pageH - 5, { align: 'right' });
}

export async function exportarAgendaInternaPdf({
  eventos = [],
  desde,
  hasta,
  tituloRango = '',
  filtrosLabel = '',
  archivo = 'agenda-interna.pdf',
  hoyYmd,
}) {
  const weeks = semanasAgendaPdf(desde, hasta);
  if (!weeks.length) return;

  const logo = await obtenerLogoColegioParaPdf();
  const colegioNombre = await obtenerTituloColegio();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const hoy = hoyYmd || ymdLocal(new Date());

  weeks.forEach((week, i) => {
    if (i > 0) doc.addPage('a4', 'landscape');
    dibujarSemana(doc, week, eventos, {
      hoyYmd: hoy,
      tituloRango,
      filtrosLabel,
      logo,
      colegioNombre,
      page: i + 1,
      pages: weeks.length,
    });
  });

  doc.save(archivo);
}
