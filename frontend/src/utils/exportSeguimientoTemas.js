import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import { cargarLogoBlancoPngDataUrl, cargarLogoPngDataUrl } from './pdfReporteColegioLogo';

const NAVY = 'FF12324D';
const TEAL = 'FF0F766E';
const AMBER = 'FFB45309';
const LINE = { style: 'thin', color: { argb: 'FFD5DEE8' } };
const FILL_TEMA = 'FFE7EEF8';
const FILL_FICHA = 'FFF8EEF5';
const FILL_SESION = 'FFFFF4E8';
const FILL_GRADO = ['FFF4F7FB', 'FFF7F4FB', 'FFF3FBF6', 'FFFBF7F3', 'FFF3F8FB'];

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

function detalleLineas(items) {
  if (!items?.length) return ['Ninguno'];
  return items.map((it) => {
    const fecha = fmtFecha(it.fecha);
    return fecha ? `${it.nombre}   ·   ${fecha}` : it.nombre;
  });
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

function packLogo(dataUrl) {
  if (!dataUrl || !String(dataUrl).includes(',')) return null;
  return { dataUrl, base64: String(dataUrl).split(',')[1] };
}

async function logosExport() {
  const [blanco, color] = await Promise.all([
    cargarLogoBlancoPngDataUrl().catch(() => null),
    cargarLogoPngDataUrl().catch(() => null),
  ]);
  return { blanco: packLogo(blanco), color: packLogo(color) };
}

function altoPorLineas(lineas, caracteres) {
  let n = 0;
  (lineas || ['']).forEach((linea) => {
    n += Math.max(1, Math.ceil(Math.max(String(linea).length, 1) / caracteres));
  });
  return Math.min(409, Math.max(22, n * 16 + 10));
}

function pintarBanda(wb, ws, logos, { titulo, subtitulo, nota, hastaCol }) {
  ws.getRow(1).height = 30;
  ws.getRow(2).height = 22;
  ws.mergeCells(1, 2, 1, hastaCol);
  ws.mergeCells(2, 2, 2, hastaCol);
  if (nota) ws.mergeCells(3, 1, 3, hastaCol);
  for (let c = 1; c <= hastaCol; c += 1) {
    [1, 2].forEach((r) => {
      const cell = ws.getCell(r, c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    });
  }
  const logo = logos.blanco || logos.color;
  if (logo && !logos.blanco) {
    ws.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
    ws.getCell(2, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
  }
  if (logo) {
    const id = wb.addImage({ base64: logo.base64, extension: 'png' });
    ws.addImage(id, { tl: { col: 0.15, row: 0.08 }, ext: { width: 48, height: 48 } });
  }
  const t = ws.getCell(1, 2);
  t.value = titulo;
  t.font = { name: 'Calibri', size: 20, bold: true, color: { argb: 'FFFFFFFF' } };
  t.alignment = { vertical: 'middle', indent: 1 };
  const s = ws.getCell(2, 2);
  s.value = subtitulo;
  s.font = { name: 'Calibri', size: 12, color: { argb: 'FFD6E4F0' } };
  s.alignment = { vertical: 'middle', indent: 1 };
  if (nota) {
    ws.getRow(3).height = 34;
    const n = ws.getCell(3, 1);
    n.value = nota;
    n.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF475569' } };
    n.alignment = { vertical: 'middle', wrapText: true, indent: 1 };
    for (let c = 1; c <= hastaCol; c += 1) {
      ws.getCell(3, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    }
  }
}

function ponerCabeza(ws, fila, titulos, color) {
  const row = ws.getRow(fila);
  row.height = 24;
  titulos.forEach((h, i) => {
    const cell = row.getCell(i + 1);
    cell.value = h;
    cell.font = { name: 'Calibri', bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
    cell.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'center', indent: i === 0 ? 1 : 0 };
    borde(cell);
  });
}

function lienzo(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w * 2;
  canvas.height = h * 2;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  return { canvas, ctx };
}

function chartNiveles(niveles) {
  const w = 860;
  const h = 300;
  const { canvas, ctx } = lienzo(w, h);
  const colores = ['#12324d', '#d8b4e8', '#f0b27a'];
  const etiquetas = ['Temas', 'Fichas', 'Sesiones'];
  const max = Math.max(1, ...niveles.flatMap((n) => [n.temas, n.fichas, n.sesiones]));
  const grupos = Math.max(niveles.length, 1);
  const pad = { l: 36, r: 24, t: 28, b: 64 };
  const groupW = (w - pad.l - pad.r) / grupos;
  const base = h - pad.b;
  const innerH = base - pad.t;
  niveles.forEach((n, i) => {
    const x0 = pad.l + i * groupW + 18;
    const bw = Math.min(36, (groupW - 48) / 3);
    [n.temas, n.fichas, n.sesiones].forEach((v, k) => {
      const bh = innerH * (v / max);
      const x = x0 + k * (bw + 8);
      ctx.fillStyle = colores[k];
      ctx.fillRect(x, base - bh, bw, Math.max(bh, 1));
      ctx.fillStyle = '#0f172a';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(v), x + bw / 2, base - bh - 6);
    });
    ctx.fillStyle = '#12324d';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(n.nivel, x0 + bw + 8, h - 36);
  });
  etiquetas.forEach((ley, i) => {
    const x = pad.l + i * 110;
    ctx.fillStyle = colores[i];
    ctx.fillRect(x, h - 18, 12, 12);
    ctx.fillStyle = '#334155';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(ley, x + 18, h - 7);
  });
  return canvas.toDataURL('image/png');
}

function chartDocentes(docentes) {
  const lista = docentes.slice(0, 45);
  const rowH = 26;
  const h = 48 + lista.length * rowH;
  const w = 980;
  const { canvas, ctx } = lienzo(w, h);
  const max = Math.max(1, ...lista.flatMap((d) => [d.temas, d.fichas, d.sesiones]));
  const labelW = 250;
  const barMax = w - labelW - 36;
  const colores = ['#12324d', '#d8b4e8', '#f0b27a'];
  ['Temas', 'Fichas', 'Sesiones'].forEach((ley, i) => {
    ctx.fillStyle = colores[i];
    ctx.fillRect(labelW + i * 100, 10, 12, 12);
    ctx.fillStyle = '#334155';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(ley, labelW + 18 + i * 100, 21);
  });
  lista.forEach((d, i) => {
    const y = 36 + i * rowH;
    ctx.fillStyle = i % 2 ? '#f8fafc' : '#ffffff';
    ctx.fillRect(8, y, w - 16, rowH - 2);
    ctx.fillStyle = '#1e293b';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'right';
    const nombre = d.docente.length > 34 ? `${d.docente.slice(0, 33)}…` : d.docente;
    ctx.fillText(nombre, labelW - 10, y + 16);
    [d.temas, d.fichas, d.sesiones].forEach((v, k) => {
      const bw = (barMax * v) / max;
      ctx.fillStyle = colores[k];
      ctx.fillRect(labelW, y + 4 + k * 7, Math.max(v ? 3 : 0, bw), 5);
    });
  });
  return { url: canvas.toDataURL('image/png'), w, h: Math.round(h) };
}

export async function exportSeguimientoTemasExcel(data) {
  const filas = data?.filas || [];
  const esperado = Number(data?.esperado) || 0;
  const wb = new ExcelJS.Workbook();
  wb.creator = data?.colegio || 'Intranet';
  const logos = await logosExport();
  const subtitulo = `${data?.ciclo || ''}° bimestre   ·   Año ${data?.anio || ''}   ·   Fecha de revisión: ${fmtRevision(data?.fecha_revision)}`;
  const niveles = resumirPorNivel(filas);
  const docentes = resumirPorDocente(filas);

  const detalle = wb.addWorksheet('Detalle', {
    views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: false },
  });
  detalle.columns = [
    { width: 34 },
    { width: 16 },
    { width: 18 },
    { width: 36 },
    { width: 14 },
    { width: 14 },
    { width: 88 },
  ];
  pintarBanda(wb, detalle, logos, {
    titulo: data?.colegio || 'Seguimiento de temas, fichas y sesiones',
    subtitulo,
    nota: 'Cada bloque es un docente, en un aula y en un curso. Temas, fichas y sesiones van en filas distintas. Cada línea de la última columna es un archivo y el día en que se subió.',
    hastaCol: 7,
  });
  ponerCabeza(detalle, 4, ['Docente', 'Nivel', 'Aula', 'Área', 'Tipo', 'Cantidad', 'Subidos y fecha de subida'], NAVY);

  let row = 5;
  let gradoIdx = -1;
  let gradoAnt = '';
  filas.forEach((f) => {
    const clave = `${f.nivel}|${f.grado}|${f.seccion}`;
    if (clave !== gradoAnt) {
      gradoIdx += 1;
      gradoAnt = clave;
    }
    const fillGrado = FILL_GRADO[gradoIdx % FILL_GRADO.length];
    const tipos = [
      ['Temas', cantidadTexto(f.temas?.subidos, esperado, true), detalleLineas(f.temas?.items), f.temas?.subidos, FILL_TEMA],
      ['Fichas', cantidadTexto(f.fichas?.subidos, esperado, true), detalleLineas(f.fichas?.items), f.fichas?.subidos, FILL_FICHA],
      ['Sesiones', String(f.sesiones?.subidos || 0), detalleLineas(f.sesiones?.items), f.sesiones?.subidos, FILL_SESION],
    ];
    const inicio = row;
    tipos.forEach((t) => {
      const r = detalle.getRow(row);
      const texto = t[2].join('\n');
      r.height = altoPorLineas(t[2], 78);
      const vals = [f.docente, f.nivel, f.aula, f.curso, t[0], t[1], texto];
      vals.forEach((v, i) => {
        const cell = r.getCell(i + 1);
        cell.value = v;
        cell.font = {
          name: 'Calibri',
          size: 10,
          bold: i === 0 || i === 4,
          color: { argb: i === 5 && !t[3] ? AMBER : 'FF0F172A' },
        };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: i < 4 ? fillGrado : t[4] },
        };
        cell.alignment = {
          vertical: 'top',
          wrapText: true,
          horizontal: i === 5 ? 'center' : 'left',
          indent: i === 5 ? 0 : 1,
        };
        borde(cell);
      });
      row += 1;
    });
    ['A', 'B', 'C', 'D'].forEach((col) => {
      detalle.mergeCells(`${col}${inicio}:${col}${inicio + 2}`);
      detalle.getCell(`${col}${inicio}`).alignment = { vertical: 'middle', wrapText: true, indent: 1 };
    });
  });

  const resumen = wb.addWorksheet('Por docente', {
    views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
    pageSetup: { orientation: 'landscape', paperSize: 9 },
  });
  resumen.columns = [
    { width: 42 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 4 }, { width: 18 },
  ];
  pintarBanda(wb, resumen, logos, {
    titulo: 'Resumen por docente',
    subtitulo,
    nota: 'Suma de todos los cursos de cada maestro en este bimestre.',
    hastaCol: 5,
  });
  ponerCabeza(resumen, 4, ['Docente', 'Cursos', 'Temas', 'Fichas', 'Sesiones'], TEAL);
  docentes.forEach((d, i) => {
    const r = resumen.getRow(5 + i);
    r.height = 22;
    [d.docente, d.cursos, d.temas, d.fichas, d.sesiones].forEach((v, c) => {
      const cell = r.getCell(c + 1);
      cell.value = v;
      cell.font = { name: 'Calibri', size: 11, bold: c === 0, color: { argb: c > 1 && !v ? AMBER : 'FF0F172A' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 ? 'FFF8FAFC' : 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle', horizontal: c === 0 ? 'left' : 'center', indent: c === 0 ? 1 : 0 };
      borde(cell);
    });
  });
  if (docentes.length) {
    const graf = chartDocentes(docentes);
    const base64 = graf.url.split(',')[1];
    const img = wb.addImage({ base64, extension: 'png' });
    resumen.addImage(img, {
      tl: { col: 6, row: 3 },
      ext: { width: Math.min(720, graf.w), height: Math.min(graf.h, 900) },
    });
  }

  const hojaNivel = wb.addWorksheet('Por nivel', {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: 'landscape', paperSize: 9 },
  });
  hojaNivel.columns = [
    { width: 24 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 16 },
  ];
  pintarBanda(wb, hojaNivel, logos, {
    titulo: 'Por nivel',
    subtitulo,
    nota: 'De Inicial a Secundaria. El gráfico compara temas, fichas y sesiones.',
    hastaCol: 5,
  });
  ponerCabeza(hojaNivel, 4, ['Nivel', 'Cursos', 'Temas', 'Fichas', 'Sesiones'], NAVY);
  const fillsNivel = ['FFE7EEF8', 'FFF3FBF6', 'FFFFF4E8', 'FFF7F4FB'];
  niveles.forEach((n, i) => {
    const r = hojaNivel.getRow(5 + i);
    r.height = 26;
    [n.nivel, n.cursos, n.temas, n.fichas, n.sesiones].forEach((v, c) => {
      const cell = r.getCell(c + 1);
      cell.value = v;
      cell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF12324D' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillsNivel[i % fillsNivel.length] } };
      cell.alignment = { vertical: 'middle', horizontal: c === 0 ? 'left' : 'center', indent: c === 0 ? 1 : 0 };
      borde(cell);
    });
  });
  if (niveles.length) {
    const url = chartNiveles(niveles);
    const img = wb.addImage({ base64: url.split(',')[1], extension: 'png' });
    hojaNivel.addImage(img, {
      tl: { col: 0, row: 6 + niveles.length },
      ext: { width: 720, height: 250 },
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  descargar(
    buffer,
    `seguimiento-temas-b${data?.ciclo || 1}-${data?.anio || ''}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
}

const FONDO_PDF = {
  Temas: [231, 238, 248],
  Fichas: [248, 238, 245],
  Sesiones: [255, 244, 232],
};

export async function exportSeguimientoTemasPdf(data) {
  const filas = data?.filas || [];
  const esperado = Number(data?.esperado) || 0;
  const doc = new jsPDF('l', 'mm', 'a4');
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 10;
  const logos = await logosExport();
  const logoCabecera = logos.blanco || logos.color;
  let y = 0;

  const header = (cont) => {
    doc.setFillColor(18, 50, 77);
    doc.rect(0, 0, pw, cont ? 14 : 28, 'F');
    let x = m;
    if (logoCabecera && !cont) {
      try {
        if (!logos.blanco) {
          doc.setFillColor(255, 255, 255);
          doc.roundedRect(m, 4, 22, 20, 1.5, 1.5, 'F');
          doc.addImage(logoCabecera.dataUrl, 'PNG', m + 1, 5, 20, 18);
        } else {
          doc.addImage(logoCabecera.dataUrl, 'PNG', m, 4, 22, 20);
        }
        x = m + 26;
      } catch {
        x = m;
      }
    }
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(cont ? 10 : 14);
    doc.text(
      pdfTexto(cont ? 'Seguimiento de temas, fichas y sesiones' : (data?.colegio || 'Seguimiento de temas, fichas y sesiones')),
      x,
      cont ? 9 : 12
    );
    if (!cont) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(
        pdfTexto(`${data?.ciclo || ''}° bimestre   ·   Año ${data?.anio || ''}   ·   Fecha de revisión: ${fmtRevision(data?.fecha_revision)}`),
        x,
        20
      );
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

  const cols = [40, 22, 26, 44, 20, 18];
  cols.push(pw - m * 2 - cols.reduce((a, b) => a + b, 0));
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

  const dibujarSubfila = (f, tipo, cantidad, lineas, conIdentidad) => {
    const leading = 3.8;
    const alto = Math.max(8, lineas.length * leading + 2.6);
    asegurar(alto);
    doc.setFillColor(248, 250, 252);
    doc.rect(m, y, cols[0] + cols[1] + cols[2] + cols[3], alto, 'F');
    const fondo = FONDO_PDF[tipo] || [255, 255, 255];
    doc.setFillColor(...fondo);
    doc.rect(m + cols[0] + cols[1] + cols[2] + cols[3], y, cols[4] + cols[5] + cols[6], alto, 'F');
    doc.setDrawColor(213, 222, 232);
    doc.rect(m, y, pw - m * 2, alto);
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(7.5);
    if (conIdentidad) {
      let xi = m;
      [f.docente, f.nivel, f.aula, f.curso].forEach((v, i) => {
        const cupo = Math.max(1, Math.floor((alto - 1.5) / leading));
        const ls = doc.splitTextToSize(pdfTexto(v), cols[i] - 3).slice(0, cupo);
        doc.setFont('helvetica', i === 0 || i === 3 ? 'bold' : 'normal');
        doc.text(ls, xi + 1.4, y + 3.5);
        xi += cols[i];
      });
    }
    let xt = m + cols[0] + cols[1] + cols[2] + cols[3];
    doc.setFont('helvetica', 'bold');
    doc.text(tipo, xt + 1.4, y + 3.6);
    xt += cols[4];
    doc.setFont('helvetica', 'normal');
    doc.text(pdfTexto(cantidad), xt + 1.4, y + 3.6);
    xt += cols[5];
    doc.text(lineas, xt + 1.4, y + 3.5);
    y += alto;
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
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Por nivel', m, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(pdfTexto(`Cursos ${filas.length}    Temas ${tot.temas}    Fichas ${tot.fichas}    Sesiones ${tot.sesiones}`), m, y);
  y += 4;

  const cn = [48, 28, 32, 32, 36];
  doc.setFillColor(18, 50, 77);
  doc.rect(m, y, cn.reduce((a, b) => a + b, 0), 7, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  let xn = m;
  ['Nivel', 'Cursos', 'Temas', 'Fichas', 'Sesiones'].forEach((h, i) => {
    doc.text(h, xn + 1.6, y + 4.8);
    xn += cn[i];
  });
  y += 7;
  const fondosNivel = [[231, 238, 248], [243, 251, 246], [255, 244, 232], [247, 244, 251]];
  niveles.forEach((n, i) => {
    const fondo = fondosNivel[i % fondosNivel.length];
    doc.setFillColor(...fondo);
    doc.rect(m, y, cn.reduce((a, b) => a + b, 0), 7, 'F');
    doc.setTextColor(18, 50, 77);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    xn = m;
    [n.nivel, n.cursos, n.temas, n.fichas, n.sesiones].forEach((v, k) => {
      doc.text(pdfTexto(v), xn + 1.6, y + 4.8);
      xn += cn[k];
    });
    y += 7;
  });
  y += 3;
  if (niveles.length) {
    try {
      doc.addImage(chartNiveles(niveles), 'PNG', m, y, 150, 52);
      y += 56;
    } catch {
      y += 2;
    }
  }

  if (y > ph - 40) {
    doc.addPage();
    header(true);
  }
  dibujarCabezaTabla();

  filas.forEach((f) => {
    const tipos = [
      ['Temas', cantidadTexto(f.temas?.subidos, esperado, true), f.temas?.items],
      ['Fichas', cantidadTexto(f.fichas?.subidos, esperado, true), f.fichas?.items],
      ['Sesiones', String(f.sesiones?.subidos || 0), f.sesiones?.items],
    ];
    tipos.forEach((t) => {
      const crudas = detalleLineas(t[2]).flatMap((linea) => doc.splitTextToSize(pdfTexto(linea), cols[6] - 4));
      const lineas = crudas.length ? crudas : ['Ninguno'];
      const maxPorTrozo = 22;
      for (let i = 0; i < lineas.length; i += maxPorTrozo) {
        dibujarSubfila(f, t[0], i === 0 ? t[1] : '', lineas.slice(i, i + maxPorTrozo), true);
      }
    });
  });

  if (resumirPorDocente(filas).length) {
    doc.addPage();
    header(true);
    doc.setTextColor(18, 50, 77);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Resumen por docente', m, y);
    y += 6;
    const lista = resumirPorDocente(filas);
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
    lista.forEach((d, i) => {
      if (y > ph - 12) {
        doc.addPage();
        header(true);
        y = 18;
      }
      if (i % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(m, y - 1, c2.reduce((a, b) => a + b, 0), 6, 'F');
      }
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      x = m;
      [d.docente, d.cursos, d.temas, d.fichas, d.sesiones].forEach((v, k) => {
        doc.text(pdfTexto(v), x + 1.5, y + 3.2);
        x += c2[k];
      });
      y += 6;
    });
  }

  pie();
  doc.save(`seguimiento-temas-b${data?.ciclo || 1}-${data?.anio || ''}.pdf`);
}
