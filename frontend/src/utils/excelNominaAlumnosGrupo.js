/**
 * Excel «Registro académico» / nómina (lista + cuadritos).
 * Formato con cabecera, bordes y anchos legibles.
 */
import ExcelJS from 'exceljs';

export const NUM_CUADROS_NOMINA_EXCEL = 25;

function nombreAlumno(a) {
  if (a?.nombre_completo) return String(a.nombre_completo).trim();
  const ape = [a?.apellido_paterno, a?.apellido_materno].filter(Boolean).join(' ');
  const nom = a?.nombres || '';
  if (ape && nom) return `${ape}, ${nom}`.trim();
  return ape || nom || '—';
}

function slugFile(s) {
  return String(s || 'Grupo')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 48);
}

/**
 * @param {object} opts
 * @param {string} [opts.titulo] - ej. REGISTRO ACADÉMICO
 * @param {string} [opts.subtitulo] - grado/sección/nivel
 * @param {object} [opts.meta] - { curso, grado, docente, bimestre, colegio }
 * @param {Array} opts.filas - alumnos
 * @param {Record<string|number, string[]>} [opts.notasPorMatricula] - valores en cuadritos
 * @param {number} [opts.numCuadros]
 * @param {string} [opts.filename]
 */
export async function exportarExcelNominaGrupo(opts = {}) {
  const filas = opts.filas || [];
  if (!filas.length) {
    const err = new Error('No hay alumnos para exportar');
    err.code = 'EMPTY';
    throw err;
  }

  const numCuadros = opts.numCuadros || NUM_CUADROS_NOMINA_EXCEL;
  const notasMap = opts.notasPorMatricula || {};
  const meta = opts.meta || {};
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Intranet Vanguard';
  const ws = wb.addWorksheet('Nómina', {
    views: [{ state: 'frozen', ySplit: 4, xSplit: 2, showGridLines: false }],
  });

  const thin = { style: 'thin', color: { argb: 'FF94A3B8' } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const fillTitle = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
  const fillHead = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4A83C1' } };
  const fillAlt = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
  const fillNum = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4A83C1' } };
  const center = { horizontal: 'center', vertical: 'middle', wrapText: true };
  const leftMid = { horizontal: 'left', vertical: 'middle' };

  const totalCols = 2 + numCuadros;
  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 38;
  for (let c = 3; c <= totalCols; c += 1) {
    ws.getColumn(c).width = 3.6;
  }

  // Fila 1: título
  ws.mergeCells(1, 1, 1, totalCols);
  const title = ws.getCell(1, 1);
  title.value = opts.titulo || 'REGISTRO ACADÉMICO';
  title.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  title.fill = fillTitle;
  title.alignment = center;
  ws.getRow(1).height = 26;

  // Fila 2: subtítulo / meta
  ws.mergeCells(2, 1, 2, totalCols);
  const sub = ws.getCell(2, 1);
  const subtitulo = (opts.subtitulo || '').trim();
  const gradoMeta = (meta.grado || '').trim();
  // Evitar "3° A - Primaria · Grado: 3° A - Primaria" cuando el subtítulo ya es el grado
  const gradoParte =
    gradoMeta && gradoMeta !== subtitulo ? `Grado: ${gradoMeta}` : null;
  const parts = [
    subtitulo || null,
    meta.curso ? `Curso: ${meta.curso}` : null,
    gradoParte,
    meta.docente ? `Docente: ${meta.docente}` : null,
    meta.bimestre != null ? `Bimestre: ${meta.bimestre}` : null,
    meta.colegio || null,
  ].filter(Boolean);
  sub.value = parts.join('  ·  ') || 'Nómina de alumnos';
  sub.font = { size: 9, color: { argb: 'FF334155' } };
  sub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  sub.alignment = center;
  ws.getRow(2).height = 18;

  // Fila 3: vacía separador
  ws.getRow(3).height = 6;

  // Fila 4: cabecera
  const headRow = ws.getRow(4);
  headRow.getCell(1).value = 'N°';
  headRow.getCell(2).value = 'Apellidos y Nombres';
  for (let i = 0; i < numCuadros; i += 1) {
    headRow.getCell(3 + i).value = '';
  }
  for (let c = 1; c <= totalCols; c += 1) {
    const cell = headRow.getCell(c);
    cell.fill = fillHead;
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    cell.alignment = center;
    cell.border = border;
  }
  headRow.height = 20;

  filas.forEach((a, idx) => {
    const row = ws.getRow(5 + idx);
    const mid = a.matricula_id ?? a.id;
    const notas = notasMap[mid] || notasMap[String(mid)] || [];

    const cNum = row.getCell(1);
    cNum.value = idx + 1;
    cNum.fill = fillNum;
    cNum.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    cNum.alignment = center;
    cNum.border = border;

    const cNom = row.getCell(2);
    cNom.value = nombreAlumno(a);
    cNom.font = { size: 10 };
    cNom.alignment = leftMid;
    cNom.border = border;
    if (idx % 2 === 1) cNom.fill = fillAlt;

    for (let i = 0; i < numCuadros; i += 1) {
      const cell = row.getCell(3 + i);
      const val = notas[i];
      cell.value = val != null && String(val).trim() !== '' ? String(val).trim() : '';
      cell.alignment = center;
      cell.border = border;
      cell.font = { size: 8 };
      if (idx % 2 === 1) cell.fill = fillAlt;
    }
    row.height = 18;
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const base =
    opts.filename ||
    `Nomina_${slugFile(opts.subtitulo || opts.meta?.grado || 'Grupo')}_${Date.now()}`;
  a.download = base.endsWith('.xlsx') ? base : `${base}.xlsx`;
  a.click();
  window.URL.revokeObjectURL(url);
}

/**
 * Diálogo PDF / Excel (SweetAlert2).
 * @returns {'pdf'|'excel'|null}
 */
export async function elegirFormatoExportNomina(SwalLib) {
  const Swal = SwalLib;
  const result = await Swal.fire({
    title: 'Ver Nómina',
    text: 'Elija el formato de exportación',
    icon: 'question',
    showDenyButton: true,
    showCancelButton: true,
    confirmButtonText: '📄 PDF',
    denyButtonText: '📊 Excel',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#4a83c1',
    denyButtonColor: '#059669',
  });
  if (result.isConfirmed) return 'pdf';
  if (result.isDenied) return 'excel';
  return null;
}
