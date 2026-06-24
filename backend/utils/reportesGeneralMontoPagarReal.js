/**
 * Reporte «Monto a Pagar - Real» (Excel) — montos de matrícula y pensiones por tarifario asignado.
 */
const ExcelJS = require('exceljs');
const { query } = require('./mysql');
const { sqlMatriculaEstadoSoloRegular } = require('./matriculaEstados');
const {
  ordenNivelEducativoNombre,
  columnExists,
} = require('./listaAlumnosMatriculadosReporte');
const { cargarConfigColegio } = require('./reportesGeneralDeudoresPagadores');

const MESES_COL = [
  'ENERO',
  'FEBRERO',
  'MARZO',
  'ABRIL',
  'MAYO',
  'JUNIO',
  'JULIO',
  'AGOSTO',
  'SETIEMBRE',
  'OCTUBRE',
  'NOVIEMBRE',
  'DICIEMBRE',
];

const FILL_GRUPO = 'FFFCD5B4';
const FILL_CABECERA = 'FFE8D4B8';
const FILL_TOTALES = 'FFF8CBAD';
const BORDER_THIN = { style: 'thin', color: { argb: 'FF000000' } };

function redondearMonto(val) {
  return Math.round((parseFloat(val) || 0) * 100) / 100;
}

function nombreAlumnoLista(row) {
  const ap = [row.apellido_paterno, row.apellido_materno]
    .filter((x) => x != null && String(x).trim())
    .join(' ')
    .trim();
  const nom = String(row.nombres || '').trim();
  if (ap && nom) return `${ap}, ${nom}`;
  return ap || nom || '—';
}

function etiquetaGradoGrupo(nivelNombre, grado) {
  const n = String(nivelNombre || '').toLowerCase();
  const g = grado != null && grado !== '' ? String(grado).trim() : '';
  if (!g) return '';
  if (n.includes('inicial')) return `${g} AÑOS`;
  return `${g}º`;
}

function buildTituloGrupo(row) {
  const nivel = String(row.nivel_nombre || '').trim().toUpperCase();
  const gl = etiquetaGradoGrupo(row.nivel_nombre, row.grado);
  const sec = String(row.seccion || '').trim().toUpperCase();
  const left = [gl, sec].filter(Boolean).join(' ');
  return `${nivel} - ${left} - ${row.anio}`;
}

function etiquetasMesesPension(totalPensiones, inicioPensiones) {
  const labels = [];
  for (let nro = 1; nro <= totalPensiones; nro += 1) {
    const idx = nro + inicioPensiones - 1;
    labels.push(idx >= 0 && idx < MESES_COL.length ? MESES_COL[idx] : `MES ${nro}`);
  }
  return labels;
}

function compararPorApellido(a, b) {
  const ap = String(a.apellido_paterno || '').localeCompare(String(b.apellido_paterno || ''), 'es', {
    sensitivity: 'base',
  });
  if (ap !== 0) return ap;
  const am = String(a.apellido_materno || '').localeCompare(String(b.apellido_materno || ''), 'es', {
    sensitivity: 'base',
  });
  if (am !== 0) return am;
  return String(a.nombres || '').localeCompare(String(b.nombres || ''), 'es', { sensitivity: 'base' });
}

function compararGrupo(a, b) {
  const oa = ordenNivelEducativoNombre(a.nivel_nombre);
  const ob = ordenNivelEducativoNombre(b.nivel_nombre);
  if (oa !== ob) return oa - ob;
  const nid = (parseInt(a.nivel_id, 10) || 0) - (parseInt(b.nivel_id, 10) || 0);
  if (nid !== 0) return nid;
  const gd = (parseInt(a.grado, 10) || 0) - (parseInt(b.grado, 10) || 0);
  if (gd !== 0) return gd;
  return String(a.seccion || '').localeCompare(String(b.seccion || ''), 'es', { sensitivity: 'base' });
}

function compararAlumno(a, b) {
  return compararPorApellido(a, b);
}

async function cargarMatriculasMontoPagar(colegioId, anio, sedeId) {
  const hasSede = await columnExists('grupos', 'sede_id');
  let sql = `
    SELECT m.id AS matricula_id,
           a.apellido_paterno, a.apellido_materno, a.nombres,
           NULLIF(TRIM(a.nro_documento), '') AS dni,
           g.id AS grupo_id, g.grado, g.seccion, g.anio,
           n.id AS nivel_id, n.nombre AS nivel_nombre,
           COALESCE(c.matricula, 0) AS monto_matricula,
           COALESCE(c.pension, 0) AS monto_pension
    FROM matriculas m
    INNER JOIN grupos g ON g.id = m.grupo_id AND g.colegio_id = m.colegio_id
    INNER JOIN niveles n ON n.id = g.nivel_id
    INNER JOIN costos c ON c.id = m.costo_id
    INNER JOIN alumnos a ON a.id = m.alumno_id AND a.colegio_id = m.colegio_id
    WHERE m.colegio_id = ? AND g.anio = ? AND ${sqlMatriculaEstadoSoloRegular('m')}`;
  const params = [colegioId, anio];
  if (hasSede && Number.isFinite(sedeId)) {
    sql += ' AND g.sede_id = ?';
    params.push(sedeId);
  }
  sql += ' ORDER BY g.nivel_id ASC, g.grado ASC, g.seccion ASC, a.apellido_paterno ASC, a.apellido_materno ASC, a.nombres ASC';
  return query(sql, params);
}

function agruparPorGrupo(filas) {
  const map = new Map();
  for (const row of filas || []) {
    const gid = row.grupo_id;
    if (!map.has(gid)) {
      map.set(gid, {
        grupo_id: gid,
        nivel_id: row.nivel_id,
        nivel_nombre: row.nivel_nombre,
        grado: row.grado,
        seccion: row.seccion,
        anio: row.anio,
        titulo: buildTituloGrupo(row),
        alumnos: [],
      });
    }
    map.get(gid).alumnos.push(row);
  }
  const grupos = [...map.values()];
  grupos.sort(compararGrupo);
  grupos.forEach((g) => g.alumnos.sort(compararAlumno));
  return grupos;
}

function filaAlumnoMontos(row, numero, totalPensiones) {
  const matricula = redondearMonto(row.monto_matricula);
  const pension = redondearMonto(row.monto_pension);
  const pensiones = Array.from({ length: totalPensiones }, () => pension);
  const anual = redondearMonto(matricula + pension * totalPensiones);
  return {
    numero,
    nombre: nombreAlumnoLista(row),
    dni: row.dni || '',
    matricula,
    pensiones,
    anual,
  };
}

function sumarColumnas(filasAlumno, totalPensiones) {
  const totales = {
    matricula: 0,
    pensiones: Array.from({ length: totalPensiones }, () => 0),
    anual: 0,
  };
  for (const f of filasAlumno) {
    totales.matricula += f.matricula;
    f.pensiones.forEach((p, i) => {
      totales.pensiones[i] += p;
    });
    totales.anual += f.anual;
  }
  totales.matricula = redondearMonto(totales.matricula);
  totales.pensiones = totales.pensiones.map(redondearMonto);
  totales.anual = redondearMonto(totales.anual);
  return totales;
}

function aplicarBordeFila(row, colCount) {
  for (let c = 1; c <= colCount; c += 1) {
    const cell = row.getCell(c);
    cell.border = {
      top: BORDER_THIN,
      left: BORDER_THIN,
      bottom: BORDER_THIN,
      right: BORDER_THIN,
    };
  }
}

function pintarFila(row, colCount, fillArgb, bold = false, centerNums = false) {
  for (let c = 1; c <= colCount; c += 1) {
    const cell = row.getCell(c);
    if (fillArgb) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } };
    }
    cell.font = { bold, size: 10 };
    if (c === 2) {
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: false };
    } else if (centerNums && c >= 3) {
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    } else if (c === 1) {
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    }
  }
  aplicarBordeFila(row, colCount);
}

function pintarFilaEtiquetaTotales(row, colCount, fillArgb, etiquetaCol, etiquetaTexto) {
  for (let c = 1; c <= colCount; c += 1) {
    const cell = row.getCell(c);
    if (fillArgb) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } };
    }
    const esEtiqueta = c === etiquetaCol;
    cell.font = { bold: esEtiqueta, size: 10 };
    cell.alignment = {
      vertical: 'middle',
      horizontal: esEtiqueta || c >= 4 ? 'center' : 'left',
    };
  }
  aplicarBordeFila(row, colCount);
  const labelCell = row.getCell(etiquetaCol);
  labelCell.value = etiquetaTexto;
  labelCell.font = { bold: true, size: 10 };
  labelCell.alignment = { vertical: 'middle', horizontal: 'center' };
}

async function construirDatosReporte(colegioId, filtros) {
  const anio = parseInt(filtros.anio, 10);
  const sedeId = filtros.sedeId != null ? parseInt(filtros.sedeId, 10) : null;
  if (!Number.isFinite(anio)) {
    return { ok: false, status: 400, error: 'Indique un año válido.' };
  }

  const cfg = await cargarConfigColegio(colegioId);
  const rows = await cargarMatriculasMontoPagar(
    colegioId,
    anio,
    Number.isFinite(sedeId) ? sedeId : null
  );
  const grupos = agruparPorGrupo(rows);
  const mesesCols = etiquetasMesesPension(cfg.totalPensiones, cfg.inicioPensiones);

  const bloques = grupos.map((gr) => {
    const alumnos = gr.alumnos.map((row, idx) => filaAlumnoMontos(row, idx + 1, cfg.totalPensiones));
    return {
      titulo: gr.titulo,
      alumnos,
      totales: sumarColumnas(alumnos, cfg.totalPensiones),
    };
  });

  const totalAnuales = {
    matricula: 0,
    pensiones: Array.from({ length: cfg.totalPensiones }, () => 0),
    anual: 0,
  };
  for (const b of bloques) {
    totalAnuales.matricula += b.totales.matricula;
    b.totales.pensiones.forEach((p, i) => {
      totalAnuales.pensiones[i] += p;
    });
    totalAnuales.anual += b.totales.anual;
  }
  totalAnuales.matricula = redondearMonto(totalAnuales.matricula);
  totalAnuales.pensiones = totalAnuales.pensiones.map(redondearMonto);
  totalAnuales.anual = redondearMonto(totalAnuales.anual);

  return {
    ok: true,
    anio,
    colegio_nombre: cfg.colegioNombre,
    meses_columnas: mesesCols,
    total_pensiones: cfg.totalPensiones,
    bloques,
    total_anuales: totalAnuales,
  };
}

async function generarExcelMontoPagarReal(colegioId, filtros) {
  const data = await construirDatosReporte(colegioId, filtros);
  if (!data.ok) return data;

  const { anio, meses_columnas: mesesCols, total_pensiones: totalPensiones, bloques, total_anuales: totalAnuales } =
    data;
  const colCount = 4 + totalPensiones + 1;
  const lastColLetter = String.fromCharCode('A'.charCodeAt(0) + colCount - 1);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Hoja1', { views: [{ showGridLines: true }] });

  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 42;
  ws.getColumn(3).width = 12;
  ws.getColumn(4).width = 11;
  for (let c = 5; c < colCount; c += 1) ws.getColumn(c).width = 10;
  ws.getColumn(colCount).width = 11;

  let r = 1;
  const tituloGeneral = `MONTOS A PAGAR DE LOS ALUMNOS MATRICULADOS EN EL AÑO ${anio}`;
  ws.mergeCells(`A${r}:${lastColLetter}${r}`);
  const titleCell = ws.getCell(`A${r}`);
  titleCell.value = tituloGeneral;
  titleCell.font = { bold: true, size: 12 };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(r).height = 22;
  r += 1;

  const cabecera = ['N°', 'ALUMNO', 'DNI', 'MATRÍCULA', ...mesesCols, 'ANUAL'];

  for (const bloque of bloques) {
    ws.mergeCells(`A${r}:${lastColLetter}${r}`);
    const gCell = ws.getCell(`A${r}`);
    gCell.value = bloque.titulo;
    gCell.font = { bold: true, size: 10 };
    gCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_GRUPO } };
    gCell.alignment = { horizontal: 'center', vertical: 'middle' };
    aplicarBordeFila(ws.getRow(r), colCount);
    ws.getRow(r).height = 18;
    r += 1;

    const headRow = ws.getRow(r);
    headRow.values = cabecera;
    pintarFila(headRow, colCount, FILL_CABECERA, true, true);
    ws.getRow(r).height = 18;
    r += 1;

    for (const alumno of bloque.alumnos) {
      const row = ws.getRow(r);
      row.values = [
        alumno.numero,
        alumno.nombre,
        alumno.dni,
        alumno.matricula,
        ...alumno.pensiones,
        alumno.anual,
      ];
      pintarFila(row, colCount, null, false, true);
      r += 1;
    }

    const totRow = ws.getRow(r);
    totRow.values = [
      '',
      '',
      'TOTALES',
      bloque.totales.matricula,
      ...bloque.totales.pensiones,
      bloque.totales.anual,
    ];
    pintarFilaEtiquetaTotales(totRow, colCount, FILL_TOTALES, 3, 'TOTALES');
    ws.getRow(r).height = 18;
    r += 1;

    r += 1;
  }

  const granRow = ws.getRow(r);
  granRow.values = [
    '',
    'TOTALES ANUALES',
    '',
    totalAnuales.matricula,
    ...totalAnuales.pensiones,
    totalAnuales.anual,
  ];
  pintarFilaEtiquetaTotales(granRow, colCount, FILL_TOTALES, 2, 'TOTALES ANUALES');

  const buffer = await wb.xlsx.writeBuffer();
  return {
    ok: true,
    buffer,
    filename: `monto_pagar_real_${anio}.xlsx`,
    anio,
    total_grupos: bloques.length,
    total_alumnos: bloques.reduce((s, b) => s + b.alumnos.length, 0),
  };
}

module.exports = {
  construirDatosReporte,
  generarExcelMontoPagarReal,
  buildTituloGrupo,
  etiquetasMesesPension,
};
