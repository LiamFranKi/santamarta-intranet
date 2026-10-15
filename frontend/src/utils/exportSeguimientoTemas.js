import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import { cargarLogoPngDataUrl } from './pdfReporteColegioLogo';

const NAVY = 'FF12324D';
const TEAL = 'FF0F766E';
const SAND = 'FFF8FAFC';
const ROW_A = 'FFFFFFFF';
const ROW_B = 'FFF1F5F9';
const AMBER = 'FFB45309';
const LINE = { style: 'thin', color: { argb: 'FFE2E8F0' } };

function fmtFecha(ymd) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

function fmtRevision(ymd) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${Number(m[3])} de ${meses[Number(m[2]) - 1]} de ${m[1]}`;
}

function detalleItems(items) {
  const partes = (items || []).map((it) => {
    const fecha = fmtFecha(it.fecha);
    return fecha ? `${it.nombre} (${fecha})` : it.nombre;
  });
  return partes.length ? partes.join('  ·  ') : 'Ninguno';
}

function cantidadTexto(subidos, esperado, aplicaEsperado) {
  const n = Number(subidos) || 0;
  if (aplicaEsperado && esperado > 0) return `${n} de ${esperado}`;
  return String(n);
}

export function resumirPorDocente(filas) {
  const map = new Map();
  (filas || []).forEach((f) => {
    const k = f.personal_id || f.docente;
    if (!map.has(k)) {
      map.set(k, { docente: f.docente, cursos: 0, temas: 0, fichas: 0, sesiones: 0 });
    }
    const r = map.get(k);
    r.cursos += 1;
    r.temas += f.temas?.subidos || 0;
    r.fichas += f.fichas?.subidos || 0;
    r.sesiones += f.sesiones?.subidos || 0;
  });
  return [...map.values()].sort((a, b) => a.docente.localeCompare(b.docente, 'es'));
}

export function resumirPorNivel(filas) {
  const map = new Map();
  (filas || []).forEach((f) => {
    const k = f.nivel || 'Otros';
    if (!map.has(k)) {
      map.set(k, { nivel: k, orden: f.nivel_orden || 9, cursos: 0, temas: 0, fichas: 0, sesiones: 0 });
    }
    const r = map.get(k);
    r.cursos += 1;
    r.temas += f.temas?.subidos || 0;
    r.fichas += f.fichas?.subidos || 0;
    r.sesiones += f.sesiones?.subidos || 0;
  });
  return [...map.values()].sort((a, b) => a.orden - b.orden || a.nivel.localeCompare(b.nivel, 'es'));
}

function borde(cell) {
  cell.border = { top: LINE, left: LINE, bottom: LINE, right: LINE };
}

function descargar(buffer, filename, type) {
  const blob = new Blob([buffer], { type });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

function pdfTexto(t) {
  return String(t || '')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, '...')
    .normalize('NFC')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF]/gu, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

async function logoBase64() {
  const dataUrl = await cargarLogoPngDataUrl();
  if (!dataUrl || !dataUrl.includes(',')) return null;
  return { dataUrl, base64: dataUrl.split(',')[1] };
}

export async function exportSeguimientoTemasExcel(data) {
  const filas = data?.filas || [];
  const esperado = Number(data?.esperado) || 0;
  const wb = new ExcelJS.Workbook();
  wb.creator = data?.colegio || 'Intranet';
  const logo = await logoBase64();

  const detalle = wb.addWorksheet('Detalle', {
    views: [{ state: 'frozen', ySplit: 5, showGridLines: false }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, paperSize: 9 },
  });
  detalle.columns = [
    { width: 32 },
    { width: 16 },
    { width: 16 },
    { width: 34 },
    { width: 14 },
    { width: 14 },
    { width: 72 },
  ];
  detalle.getRow(1).height = 36;
  detalle.mergeCells('B1:G1');
  detalle.mergeCells('B2:G2');
  detalle.mergeCells('A3:G3');
  const titulo = detalle.getCell('B1');
  titulo.value = data?.colegio || 'Seguimiento de temas, fichas y sesiones';
  titulo.font = { name: 'Calibri', size: 18, bold: true, color: { argb: NAVY } };
  titulo.alignment = { vertical: 'middle' };
  const sub = detalle.getCell('B2');
  sub.value = `${data?.ciclo || ''}° bimestre  ·  Año ${data?.anio || ''}  ·  Fecha de revisión: ${fmtRevision(data?.fecha_revision)}`;
  sub.font = { name: 'Calibri', size: 11, color: { argb: 'FF475569' } };
  const nota = detalle.getCell('A3');
  nota.value = 'Cada bloque es un docente en un aula y un curso. Temas, fichas y sesiones van aparte. La fecha entre paréntesis es el día en que se subió. El nombre es el que dejó el docente.';
  nota.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF64748B' } };
  if (logo) {
    const img = wb.addImage({ base64: logo.base64, extension: 'png' });
    detalle.addImage(img, { tl: { col: 0.15, row: 0.15 }, ext: { width: 46, height: 46 } });
  }

  const headers = ['Docente', 'Nivel', 'Aula', 'Área', 'Tipo', 'Cantidad', 'Subidos y fecha de subida'];
  const head = detalle.getRow(5);
  head.height = 22;
  headers.forEach((h, i) => {
    const cell = head.getCell(i + 1);
    cell.value = h;
    cell.font = { name: 'Calibri', bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    borde(cell);
  });

  let row = 6;
  filas.forEach((f, idx) => {
    const fill = idx % 2 === 0 ? ROW_A : ROW_B;
    const tipos = [
      ['Temas', cantidadTexto(f.temas?.subidos, esperado, true), detalleItems(f.temas?.items), f.temas?.subidos],
      ['Fichas', cantidadTexto(f.fichas?.subidos, esperado, true), detalleItems(f.fichas?.items), f.fichas?.subidos],
      ['Sesiones', String(f.sesiones?.subidos || 0), detalleItems(f.sesiones?.items), f.sesiones?.subidos],
    ];
    const inicio = row;
    tipos.forEach((t) => {
      const r = detalle.getRow(row);
      r.height = 32;
      const vals = [f.docente, f.nivel, f.aula, f.curso, t[0], t[1], t[2]];
      vals.forEach((v, i) => {
        const cell = r.getCell(i + 1);
        cell.value = v;
        cell.font = {
          name: 'Calibri',
          size: 10,
          bold: i === 4,
          color: { argb: i === 5 && !t[3] ? AMBER : 'FF0F172A' },
        };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
        cell.alignment = { vertical: 'middle', wrapText: true };
        borde(cell);
      });
      row += 1;
    });
    if (row - 1 > inicio) {
      ['A', 'B', 'C', 'D'].forEach((col) => {
        detalle.mergeCells(`${col}${inicio}:${col}${inicio + 2}`);
        detalle.getCell(`${col}${inicio}`).alignment = { vertical: 'middle', wrapText: true };
      });
    }
  });

  const resumen = wb.addWorksheet('Por docente', { views: [{ showGridLines: false }] });
  resumen.columns = [{ width: 36 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 16 }];
  resumen.mergeCells('A1:E1');
  resumen.getCell('A1').value = `Resumen por docente  ·  ${data?.ciclo || ''}° bimestre  ·  ${data?.anio || ''}`;
  resumen.getCell('A1').font = { name: 'Calibri', size: 14, bold: true, color: { argb: NAVY } };
  const rh = resumen.getRow(3);
  ['Docente', 'Cursos', 'Temas', 'Fichas', 'Sesiones'].forEach((h, i) => {
    const cell = rh.getCell(i + 1);
    cell.value = h;
    cell.font = { name: 'Calibri', bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TEAL } };
    cell.alignment = { horizontal: 'center' };
    borde(cell);
  });
  resumirPorDocente(filas).forEach((d, i) => {
    const r = resumen.getRow(4 + i);
    [d.docente, d.cursos, d.temas, d.fichas, d.sesiones].forEach((v, c) => {
      const cell = r.getCell(c + 1);
      cell.value = v;
      cell.font = { name: 'Calibri', size: 11, color: { argb: c > 1 && !v ? AMBER : 'FF0F172A' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 ? SAND : 'FFFFFFFF' } };
      borde(cell);
    });
  });

  const niveles = wb.addWorksheet('Por nivel', { views: [{ showGridLines: false }] });
  niveles.columns = [{ width: 22 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 16 }];
  niveles.mergeCells('A1:E1');
  niveles.getCell('A1').value = 'Totales de Inicial a Secundaria';
  niveles.getCell('A1').font = { name: 'Calibri', size: 14, bold: true, color: { argb: NAVY } };
  const nh = niveles.getRow(3);
  ['Nivel', 'Cursos', 'Temas', 'Fichas', 'Sesiones'].forEach((h, i) => {
    const cell = nh.getCell(i + 1);
    cell.value = h;
    cell.font = { name: 'Calibri', bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    borde(cell);
  });
  resumirPorNivel(filas).forEach((n, i) => {
    const r = niveles.getRow(4 + i);
    [n.nivel, n.cursos, n.temas, n.fichas, n.sesiones].forEach((v, c) => {
      const cell = r.getCell(c + 1);
      cell.value = v;
      cell.font = { name: 'Calibri', size: 12, bold: c === 0 };
      borde(cell);
    });
  });

  const buffer = await wb.xlsx.writeBuffer();
  const nombre = `seguimiento-temas-b${data?.ciclo || 1}-${data?.anio || ''}.xlsx`;
  descargar(buffer, nombre, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

function chartNiveles(niveles) {
  const w = 920;
  const h = 220;
  const canvas = document.createElement('canvas');
  canvas.width = w * 2;
  canvas.height = h * 2;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  const max = Math.max(1, ...niveles.flatMap((n) => [n.temas, n.fichas, n.sesiones]));
  const grupos = Math.max(niveles.length, 1);
  const gap = 28;
  const groupW = (w - 48 - gap * grupos) / grupos;
  const base = h - 36;
  const colores = ['#12324d', '#0f766e', '#d97706'];
  niveles.forEach((n, i) => {
    const x0 = 36 + i * (groupW + gap);
    const vals = [n.temas, n.fichas, n.sesiones];
    const bw = groupW / 3.4;
    vals.forEach((v, k) => {
      const bh = (base - 24) * (v / max);
      ctx.fillStyle = colores[k];
      ctx.fillRect(x0 + k * (bw + 4), base - bh, bw, bh);
    });
    ctx.fillStyle = '#334155';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(n.nivel, x0 + groupW / 2, h - 12);
  });
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'left';
  [['Temas', colores[0]], ['Fichas', colores[1]], ['Sesiones', colores[2]]].forEach((ley, i) => {
    ctx.fillStyle = ley[1];
    ctx.fillRect(w - 210 + i * 70, 12, 10, 10);
    ctx.fillStyle = '#334155';
    ctx.fillText(ley[0], w - 196 + i * 70, 21);
  });
  return canvas.toDataURL('image/png');
}

export async function exportSeguimientoTemasPdf(data) {
  const filas = data?.filas || [];
  const esperado = Number(data?.esperado) || 0;
  const doc = new jsPDF('l', 'mm', 'a4');
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 10;
  const logo = await logoBase64();
  let y = 0;

  const header = (cont) => {
    doc.setFillColor(18, 50, 77);
    doc.rect(0, 0, pw, cont ? 14 : 28, 'F');
    if (logo && !cont) {
      try {
        doc.addImage(logo.dataUrl, 'PNG', m, 4, 20, 20);
      } catch {
        /* el logo no debe tumbar el PDF */
      }
    }
    const x = logo && !cont ? m + 24 : m;
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(cont ? 10 : 14);
    doc.text(pdfTexto(cont ? 'Seguimiento de temas, fichas y sesiones (continúa)' : (data?.colegio || 'Seguimiento de temas, fichas y sesiones')), x, cont ? 9 : 12);
    if (!cont) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(pdfTexto(`${data?.ciclo || ''}° bimestre   ·   Año ${data?.anio || ''}   ·   Fecha de revisión: ${fmtRevision(data?.fecha_revision)}`), x, 20);
    }
    y = cont ? 18 : 34;
  };

  const pie = () => {
    const pages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i += 1) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`Página ${i} de ${pages}`, pw - m, ph - 5, { align: 'right' });
    }
  };

  header(false);
  const niveles = resumirPorNivel(filas);
  const tot = filas.reduce(
    (a, f) => {
      a.temas += f.temas?.subidos || 0;
      a.fichas += f.fichas?.subidos || 0;
      a.sesiones += f.sesiones?.subidos || 0;
      return a;
    },
    { temas: 0, fichas: 0, sesiones: 0 }
  );
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  doc.text(pdfTexto(`Cursos ${filas.length}    Temas ${tot.temas}    Fichas ${tot.fichas}    Sesiones ${tot.sesiones}`), m, y);
  y += 4;
  if (niveles.length) {
    try {
      doc.addImage(chartNiveles(niveles), 'PNG', m, y, 160, 38);
      y += 42;
    } catch {
      y += 2;
    }
  }

  const cols = [48, 24, 28, 52, 22, 22, pw - m * 2 - 196];
  const heads = ['Docente', 'Nivel', 'Aula', 'Área', 'Tipo', 'Cantidad', 'Subidos y fecha de subida'];

  const dibujarCabezaTabla = () => {
    let x = m;
    doc.setFillColor(18, 50, 77);
    doc.rect(m, y, pw - m * 2, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    heads.forEach((h, i) => {
      doc.text(h, x + 1.5, y + 4.8);
      x += cols[i];
    });
    y += 7;
  };

  const asegurar = (alto) => {
    if (y + alto > ph - 10) {
      doc.addPage();
      header(true);
      dibujarCabezaTabla();
    }
  };

  dibujarCabezaTabla();
  filas.forEach((f, idx) => {
    const tipos = [
      ['Temas', cantidadTexto(f.temas?.subidos, esperado, true), detalleItems(f.temas?.items)],
      ['Fichas', cantidadTexto(f.fichas?.subidos, esperado, true), detalleItems(f.fichas?.items)],
      ['Sesiones', String(f.sesiones?.subidos || 0), detalleItems(f.sesiones?.items)],
    ];
    const lineas = tipos.map((t) => doc.splitTextToSize(pdfTexto(t[2]), cols[6] - 3).slice(0, 4));
    const alto = Math.max(18, ...lineas.map((ls) => ls.length * 3.4 + 2));
    asegurar(alto);
    if (idx % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(m, y, pw - m * 2, alto, 'F');
    }
    doc.setDrawColor(226, 232, 240);
    doc.rect(m, y, pw - m * 2, alto);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    let x = m;
    [f.docente, f.nivel, f.aula, f.curso].forEach((v, i) => {
      const ls = doc.splitTextToSize(pdfTexto(v), cols[i] - 3).slice(0, 3);
      doc.text(ls, x + 1.5, y + 4);
      x += cols[i];
    });
    tipos.forEach((t, i) => {
      const yy = y + 4 + i * (alto / 3);
      doc.setFont('helvetica', 'bold');
      doc.text(t[0], x + 1.5, yy);
      doc.setFont('helvetica', 'normal');
      doc.text(pdfTexto(t[1]), x + cols[4] + 1.5, yy);
      doc.text(lineas[i], x + cols[4] + cols[5] + 1.5, yy);
    });
    y += alto;
  });

  if (resumirPorDocente(filas).length) {
    doc.addPage();
    header(true);
    doc.setTextColor(18, 50, 77);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Resumen por docente', m, y);
    y += 6;
    const docentes = resumirPorDocente(filas);
    const c2 = [90, 30, 30, 30, 30];
    doc.setFillColor(15, 118, 110);
    doc.rect(m, y, c2.reduce((a, b) => a + b, 0), 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    let x = m;
    ['Docente', 'Cursos', 'Temas', 'Fichas', 'Sesiones'].forEach((h, i) => {
      doc.text(h, x + 1.5, y + 4.8);
      x += c2[i];
    });
    y += 7;
    docentes.forEach((d) => {
      if (y > ph - 12) {
        doc.addPage();
        header(true);
      }
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      x = m;
      [d.docente, d.cursos, d.temas, d.fichas, d.sesiones].forEach((v, i) => {
        doc.text(pdfTexto(v), x + 1.5, y + 4.5);
        x += c2[i];
      });
      y += 6;
    });
  }

  pie();
  doc.save(`seguimiento-temas-b${data?.ciclo || 1}-${data?.anio || ''}.pdf`);
}
