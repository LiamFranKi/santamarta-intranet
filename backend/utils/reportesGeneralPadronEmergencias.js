/**
 * Padrón de apoderados autorizados + control de recojo (emergencias).
 */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { query } = require('./mysql');
const { sqlMatriculaEstadoSoloRegular } = require('./matriculaEstados');
const {
  columnExists,
  etiquetaGradoTitulo,
  buildTituloGrupo,
  resolverGrupoId,
  listarGruposFiltro,
} = require('./listaAlumnosMatriculadosReporte');
const { leerIdentidadColegio, marcaCreadorExcel } = require('./identidadColegio');
const { fechaMySQLLima } = require('./fechaHoraLima');
const { rutaLogoColegioSync } = require('./logoColegio');

const FILL_TITULO = 'FF0F172A';
const FILL_SUB = 'FFDBEAFE';
const FILL_META = 'FFEFF6FF';
const FILL_CAB = 'FF1E3A8A';
const FILL_PAR = 'FFF8FAFC';
const FILL_IMPAR = 'FFFFFFFF';
const BORDER = { style: 'thin', color: { argb: 'FF94A3B8' } };

const HEAD_PADRON = [
  'N.°',
  'Código del estudiante',
  'Apellidos y nombres del estudiante',
  'DNI del estudiante',
  'Nivel',
  'Grado',
  'Sección',
  'Orden de recojo',
  'Apellidos y nombres de la persona autorizada',
  'DNI / CE',
  'Parentesco',
  'Celular principal',
  'Celular alternativo',
  '¿Vive con el estudiante?',
  'Restricción o condición relevante',
  'Firma del apoderado que autoriza',
];

const HEAD_CONTROL = [
  'N.°',
  'Apellidos y nombres del estudiante',
  'Nivel',
  'Grado',
  'Sección',
  'Persona que recoge',
  'DNI / CE verificado',
  'Parentesco',
  'Hora de entrega',
  'Estado',
  'Responsable que entrega',
  'Firma de quien recoge',
  'Huella dactilar',
  'Incidencia / observación',
  'Comunicación realizada',
  'Teléfono utilizado',
];

function nombrePersona(apPat, apMat, nom) {
  const ap = [apPat, apMat]
    .filter((x) => x != null && String(x).trim())
    .join(' ')
    .trim()
    .toUpperCase();
  const n = String(nom || '').trim();
  if (ap && n) return `${ap}, ${n}`;
  return ap || n || '';
}

function nombrePersonal(row) {
  if (!row) return '';
  const ap = String(row.apellidos || '').trim().toUpperCase();
  const nom = String(row.nombres || '').trim();
  if (ap && nom) return `${ap}, ${nom}`;
  return ap || nom || '';
}

function claveNombre(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function etiquetaParentescoApo(raw) {
  if (raw == null || raw === '') return 'Apoderado';
  const n = parseInt(raw, 10);
  if (Number.isFinite(n) && String(raw).trim() !== '' && /^-?\d+$/.test(String(raw).trim())) {
    const map = { 0: 'Padre', 1: 'Madre', 2: 'Tutor', 3: 'Abuelo(a)', 4: 'Otro' };
    return map[n] || 'Apoderado';
  }
  return String(raw).trim() || 'Apoderado';
}

function fmtFechaPe(ymd) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

function parseFiltros(raw) {
  const anio = parseInt(raw.anio, 10);
  const turnoId = parseInt(raw.turno_id ?? raw.turnoId, 10);
  const sedeRaw = raw.sede_id ?? raw.sedeId;
  const sedeId = sedeRaw !== undefined && sedeRaw !== '' ? parseInt(sedeRaw, 10) : null;
  const nivelId = raw.nivel_id != null && raw.nivel_id !== '' ? parseInt(raw.nivel_id, 10) : null;
  const grado = raw.grado != null && raw.grado !== '' ? parseInt(raw.grado, 10) : null;
  const seccion = raw.seccion != null ? String(raw.seccion).trim() : '';
  return {
    anio,
    turnoId,
    sedeId: Number.isFinite(sedeId) ? sedeId : null,
    nivelId: Number.isFinite(nivelId) ? nivelId : null,
    grado: Number.isFinite(grado) ? grado : null,
    seccion,
    todos: String(raw.todos || '') === '1' || String(raw.modo || '') === 'todos',
    enBlanco:
      String(raw.en_blanco || '') === '1' ||
      String(raw.variante || '').toLowerCase() === 'blanco',
  };
}

async function cargarAutorizados(colegioId, alumnoIds) {
  const map = new Map();
  const uniq = [...new Set((alumnoIds || []).filter((id) => id != null))];
  if (!uniq.length) return map;
  uniq.forEach((id) => map.set(id, []));
  const ph = uniq.map(() => '?').join(',');

  const apoRows = await query(
    `SELECT f.alumno_id, f.id AS familia_id, ap.parentesco,
            ap.nombres, ap.apellido_paterno, ap.apellido_materno,
            NULLIF(TRIM(ap.nro_documento), '') AS dni,
            NULLIF(TRIM(ap.telefono_celular), '') AS celular,
            NULLIF(TRIM(ap.telefono_fijo), '') AS celular_alt
     FROM familias f
     INNER JOIN apoderados ap ON ap.id = f.apoderado_id AND ap.colegio_id = ?
     WHERE f.alumno_id IN (${ph})
     ORDER BY f.alumno_id ASC, f.id ASC`,
    [colegioId, ...uniq]
  );
  for (const r of apoRows || []) {
    map.get(r.alumno_id).push({
      nombre: nombrePersona(r.apellido_paterno, r.apellido_materno, r.nombres),
      dni: r.dni || '',
      parentesco: etiquetaParentescoApo(r.parentesco),
      celular: r.celular || '',
      celular_alt: r.celular_alt || '',
      origen: 'apoderado',
    });
  }

  try {
    const extra = await query(
      `SELECT alumno_id, nombres, parentesco, telefono, es_principal, orden
       FROM alumno_contactos_emergencia
       WHERE colegio_id = ? AND alumno_id IN (${ph})
       ORDER BY es_principal DESC, orden ASC, id ASC`,
      [colegioId, ...uniq]
    );
    for (const r of extra || []) {
      const lista = map.get(r.alumno_id) || [];
      const nom = String(r.nombres || '').trim();
      if (!nom) continue;
      const ya = lista.some((x) => claveNombre(x.nombre) === claveNombre(nom));
      if (ya) continue;
      lista.push({
        nombre: nom,
        dni: '',
        parentesco: String(r.parentesco || 'Contacto de emergencia').trim() || 'Contacto de emergencia',
        celular: String(r.telefono || '').trim(),
        celular_alt: '',
        origen: 'emergencia',
      });
      map.set(r.alumno_id, lista);
    }
  } catch (e) {
    if (e.code !== 'ER_NO_SUCH_TABLE') throw e;
  }
  return map;
}

function armarBloque(grupo, alumnos, autorizadosMap, meta) {
  const gradoLabel = etiquetaGradoTitulo(grupo.nivel_nombre, grupo.grado);
  const nivel = String(grupo.nivel_nombre || '').trim();
  const seccion = String(grupo.seccion || '').trim();
  const filas_padron = [];
  const filas_control = [];
  let nEst = 0;
  let nAut = 0;

  alumnos.forEach((al, idx) => {
    nEst += 1;
    const auts = autorizadosMap.get(al.alumno_id) || [];
    const lista = auts.length ? auts : [{ nombre: '', dni: '', parentesco: '', celular: '', celular_alt: '' }];
    if (auts.length) nAut += auts.length;
    lista.forEach((au, j) => {
      filas_padron.push({
        n: idx + 1,
        codigo: al.alumno_dni || '',
        alumno_nombre: al.alumno_nombre,
        alumno_dni: al.alumno_dni || '',
        nivel,
        grado: gradoLabel,
        seccion,
        orden_recojo: auts.length ? j + 1 : '',
        autorizado_nombre: au.nombre || '',
        autorizado_dni: au.dni || '',
        parentesco: au.parentesco || '',
        celular: au.celular || '',
        celular_alt: au.celular_alt || '',
        vive_con: '',
        restriccion: '',
        firma: '',
      });
    });
    filas_control.push({
      n: idx + 1,
      alumno_nombre: al.alumno_nombre,
      nivel,
      grado: gradoLabel,
      seccion,
      persona_recoge: '',
      dni_verificado: '',
      parentesco: '',
      hora_entrega: '',
      estado: 'Pendiente',
      responsable: '',
      firma: '',
      huella: '',
      incidencia: '',
      comunicacion: '',
      telefono: '',
    });
  });

  return {
    grupo_id: grupo.id,
    titulo: buildTituloGrupo(grupo),
    anio: grupo.anio,
    nivel,
    grado: gradoLabel,
    seccion,
    turno: String(grupo.turno_nombre || '').trim(),
    tutor: grupo.tutor_nombre || '',
    tutor2: grupo.tutor2_nombre || '',
    fecha_actualizacion: meta.fecha,
    en_blanco: !!meta.enBlanco,
    estudiantes: nEst,
    autorizados: nAut,
    filas_padron,
    filas_control,
  };
}

async function sqlAlumnosYGrupos(colegioId, grupoIds) {
  if (!grupoIds.length) return { grupos: [], alumnos: [] };
  const hasTutor2 = await columnExists('grupos', 'tutor_id_2');
  const ph = grupoIds.map(() => '?').join(',');
  const grupos = await query(
    `SELECT g.id, g.anio, g.grado, g.seccion, g.nivel_id, g.tutor_id,
            ${hasTutor2 ? 'g.tutor_id_2,' : '0 AS tutor_id_2,'}
            n.nombre AS nivel_nombre, t.nombre AS turno_nombre,
            pt.nombres AS tutor_nom, pt.apellidos AS tutor_ape,
            ${hasTutor2 ? 'pt2.nombres AS tutor2_nom, pt2.apellidos AS tutor2_ape' : 'NULL AS tutor2_nom, NULL AS tutor2_ape'}
     FROM grupos g
     LEFT JOIN niveles n ON n.id = g.nivel_id
     LEFT JOIN turnos t ON t.id = g.turno_id
     LEFT JOIN personal pt ON pt.id = g.tutor_id AND COALESCE(g.tutor_id, 0) > 0
     ${hasTutor2 ? 'LEFT JOIN personal pt2 ON pt2.id = g.tutor_id_2 AND COALESCE(g.tutor_id_2, 0) > 0' : ''}
     WHERE g.colegio_id = ? AND g.id IN (${ph})`,
    [colegioId, ...grupoIds]
  );
  const gruposMap = new Map();
  for (const g of grupos || []) {
    gruposMap.set(g.id, {
      ...g,
      tutor_nombre: nombrePersonal({ nombres: g.tutor_nom, apellidos: g.tutor_ape }),
      tutor2_nombre: nombrePersonal({ nombres: g.tutor2_nom, apellidos: g.tutor2_ape }),
    });
  }

  const alumnos = await query(
    `SELECT g.id AS grupo_id, a.id AS alumno_id,
            a.apellido_paterno, a.apellido_materno, a.nombres,
            NULLIF(TRIM(a.nro_documento), '') AS alumno_dni
     FROM matriculas m
     INNER JOIN alumnos a ON a.id = m.alumno_id AND a.colegio_id = m.colegio_id
     INNER JOIN grupos g ON g.id = m.grupo_id AND g.colegio_id = m.colegio_id
     WHERE m.colegio_id = ? AND m.grupo_id IN (${ph}) AND ${sqlMatriculaEstadoSoloRegular('m')}
     ORDER BY g.nivel_id ASC, g.grado ASC, g.seccion ASC,
              a.apellido_paterno ASC, a.apellido_materno ASC, a.nombres ASC`,
    [colegioId, ...grupoIds]
  );
  const mapped = (alumnos || []).map((a) => ({
    ...a,
    alumno_nombre: nombrePersona(a.apellido_paterno, a.apellido_materno, a.nombres),
  }));
  return { gruposMap, alumnos: mapped };
}

async function obtenerPadronEmergencias(colegioId, rawFiltros) {
  const f = parseFiltros(rawFiltros);
  if (!Number.isFinite(f.anio) || !Number.isFinite(f.turnoId)) {
    return { ok: false, status: 400, error: 'Indique año y turno válidos.' };
  }

  let gruposMeta = [];
  if (f.todos) {
    gruposMeta = await listarGruposFiltro(colegioId, {
      anio: f.anio,
      turnoId: f.turnoId,
      sedeId: f.sedeId,
    });
  } else {
    if (!Number.isFinite(f.nivelId) || !Number.isFinite(f.grado) || !f.seccion) {
      return { ok: false, status: 400, error: 'Seleccione nivel, grado y sección.' };
    }
    const res = await resolverGrupoId(colegioId, {
      anio: f.anio,
      nivelId: f.nivelId,
      grado: f.grado,
      seccion: f.seccion,
      turnoId: f.turnoId,
      sedeId: f.sedeId,
    });
    if (res.error === 'not_found') {
      return { ok: false, status: 404, error: 'No se encontró el grupo con esos filtros.' };
    }
    if (res.error === 'duplicate') {
      return { ok: false, status: 409, error: 'Hay más de un grupo que coincide. Refine sede o datos.' };
    }
    gruposMeta = [res.grupo];
  }

  const iden = await leerIdentidadColegio(colegioId);
  const fecha = fechaMySQLLima();
  if (!gruposMeta.length) {
    return {
      ok: true,
      colegio_nombre: iden.titulo,
      fecha,
      en_blanco: !!f.enBlanco,
      bloques: [],
      totales: { estudiantes: 0, autorizados: 0 },
    };
  }

  const ids = gruposMeta.map((g) => g.id);
  const { gruposMap, alumnos } = await sqlAlumnosYGrupos(colegioId, ids);
  const autorizadosMap = f.enBlanco
    ? new Map()
    : await cargarAutorizados(
        colegioId,
        alumnos.map((a) => a.alumno_id)
      );
  const porGrupo = new Map();
  for (const a of alumnos) {
    if (!porGrupo.has(a.grupo_id)) porGrupo.set(a.grupo_id, []);
    porGrupo.get(a.grupo_id).push(a);
  }

  const bloques = [];
  for (const g of gruposMeta) {
    const full = gruposMap.get(g.id) || g;
    const als = porGrupo.get(g.id) || [];
    if (!als.length) continue;
    bloques.push(armarBloque(full, als, autorizadosMap, { fecha, enBlanco: f.enBlanco }));
  }

  let estudiantes = 0;
  let autorizados = 0;
  bloques.forEach((b) => {
    estudiantes += b.estudiantes;
    autorizados += b.autorizados;
  });

  return {
    ok: true,
    colegio_nombre: iden.titulo,
    fecha,
    en_blanco: !!f.enBlanco,
    bloques,
    totales: { estudiantes, autorizados },
  };
}

function borde(cell) {
  cell.border = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };
}

function pintarCabecera(row, labels) {
  row.values = labels;
  row.height = 28;
  labels.forEach((_, i) => {
    const cell = row.getCell(i + 1);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_CAB } };
    cell.font = { bold: true, size: 8, color: { argb: 'FFFFFFFF' }, name: 'Calibri' };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    borde(cell);
  });
}

async function logoExcel(wb) {
  try {
    const p = rutaLogoColegioSync();
    if (!p || !fs.existsSync(p)) return null;
    const ext = /\.jpe?g$/i.test(p) ? 'jpeg' : 'png';
    return wb.addImage({ buffer: fs.readFileSync(p), extension: ext });
  } catch {
    return null;
  }
}

function escribirBloqueEncabezado(ws, cols, bloque, colegioNombre, tituloDoc, subtitulo, r0, logoId) {
  let r = r0;
  ws.mergeCells(r, 1, r + 1, 2);
  if (logoId != null) {
    ws.addImage(logoId, {
      tl: { col: 0, row: r - 1 },
      ext: { width: 72, height: 52 },
    });
  }
  ws.mergeCells(r, 3, r, cols);
  const t = ws.getCell(r, 3);
  t.value = String(colegioNombre || 'Colegio').toUpperCase();
  t.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' }, name: 'Calibri' };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_TITULO } };
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(r).height = 22;
  r += 1;
  ws.mergeCells(r, 3, r, cols);
  const s = ws.getCell(r, 3);
  s.value = tituloDoc;
  s.font = { bold: true, size: 11, color: { argb: 'FF1E3A8A' }, name: 'Calibri' };
  s.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_SUB } };
  s.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(r).height = 18;
  r += 1;
  ws.mergeCells(r, 1, r, cols);
  const d = ws.getCell(r, 1);
  d.value = subtitulo;
  d.font = { italic: true, size: 8, color: { argb: 'FF334155' }, name: 'Calibri' };
  d.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  ws.getRow(r).height = 16;
  r += 2;

  const meta = [
    ['Año escolar', bloque.anio, 'Nivel', bloque.nivel, 'Grado', bloque.grado],
    ['Sección', bloque.seccion, 'Turno', bloque.turno, 'Tutor(a)', bloque.tutor || '—'],
    [
      'Tutor 2',
      bloque.tutor2 || '—',
      'Fecha de actualización',
      fmtFechaPe(bloque.fecha_actualizacion),
      bloque.en_blanco ? 'Plantilla' : 'Estudiantes / autorizados',
      bloque.en_blanco
        ? `${bloque.estudiantes} alumnos (llenar apoderados a mano)`
        : `${bloque.estudiantes} / ${bloque.autorizados}`,
    ],
  ];
  meta.forEach((pares) => {
    for (let i = 0; i < 3; i += 1) {
      const cLab = 1 + i * 2;
      const cVal = cLab + 1;
      const lab = ws.getCell(r, cLab);
      lab.value = pares[i * 2];
      lab.font = { bold: true, size: 8, color: { argb: 'FF1E3A8A' }, name: 'Calibri' };
      lab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_META } };
      borde(lab);
      const val = ws.getCell(r, cVal);
      val.value = pares[i * 2 + 1] == null || pares[i * 2 + 1] === '' ? '—' : pares[i * 2 + 1];
      val.font = { size: 8, name: 'Calibri' };
      val.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
      borde(val);
    }
    ws.getRow(r).height = 16;
    r += 1;
  });
  r += 1;
  return r;
}

function escribirFilas(ws, startRow, rows, keys, cols) {
  let r = startRow;
  rows.forEach((fila, idx) => {
    const row = ws.getRow(r);
    row.values = keys.map((k) => (fila[k] == null || fila[k] === '' ? '' : fila[k]));
    row.height = 18;
    const fill = idx % 2 === 1 ? FILL_PAR : FILL_IMPAR;
    for (let c = 1; c <= cols; c += 1) {
      const cell = row.getCell(c);
      cell.font = { size: 8, name: 'Calibri', color: { argb: 'FF0F172A' } };
      cell.alignment = {
        vertical: 'middle',
        horizontal: c === 3 || c === 9 || c === 2 ? 'left' : 'center',
        wrapText: true,
      };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
      borde(cell);
    }
    r += 1;
  });
  return r;
}

async function generarExcelPadronEmergencias(colegioId, rawFiltros) {
  const data = await obtenerPadronEmergencias(colegioId, rawFiltros);
  if (!data.ok) return data;
  const bloques = data.bloques || [];
  if (!bloques.length) {
    return { ok: false, status: 404, error: 'No hay alumnos matriculados con esos filtros.' };
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = await marcaCreadorExcel(colegioId);
  wb.created = new Date();
  const logoId = await logoExcel(wb);

  const wsP = wb.addWorksheet('Padrón autorizado', { views: [{ showGridLines: false }] });
  const wsC = wb.addWorksheet('Control de recojo', { views: [{ showGridLines: false }] });
  const widthsP = [6, 14, 32, 14, 14, 10, 10, 10, 32, 12, 14, 14, 14, 12, 22, 18];
  const widthsC = [6, 32, 14, 10, 10, 26, 14, 12, 12, 12, 20, 16, 12, 20, 16, 14];
  widthsP.forEach((w, i) => {
    wsP.getColumn(i + 1).width = w;
  });
  widthsC.forEach((w, i) => {
    wsC.getColumn(i + 1).width = w;
  });

  const keysP = [
    'n',
    'codigo',
    'alumno_nombre',
    'alumno_dni',
    'nivel',
    'grado',
    'seccion',
    'orden_recojo',
    'autorizado_nombre',
    'autorizado_dni',
    'parentesco',
    'celular',
    'celular_alt',
    'vive_con',
    'restriccion',
    'firma',
  ];
  const keysC = [
    'n',
    'alumno_nombre',
    'nivel',
    'grado',
    'seccion',
    'persona_recoge',
    'dni_verificado',
    'parentesco',
    'hora_entrega',
    'estado',
    'responsable',
    'firma',
    'huella',
    'incidencia',
    'comunicacion',
    'telefono',
  ];

  let rP = 1;
  let rC = 1;
  for (const b of bloques) {
    rP = escribirBloqueEncabezado(
      wsP,
      16,
      b,
      data.colegio_nombre,
      'PADRÓN DE APODERADOS AUTORIZADOS PARA EL RECOJO DE ESTUDIANTES EN CASO DE DESASTRES NATURALES',
      'Uso institucional para la entrega segura de estudiantes ante sismos, incendios, inundaciones u otras emergencias.',
      rP,
      logoId
    );
    pintarCabecera(wsP.getRow(rP), HEAD_PADRON);
    rP += 1;
    rP = escribirFilas(wsP, rP, b.filas_padron, keysP, 16);
    rP += 2;

    rC = escribirBloqueEncabezado(
      wsC,
      16,
      b,
      data.colegio_nombre,
      'CONTROL DE ENTREGA DE ESTUDIANTES DURANTE UNA EMERGENCIA',
      'Uso institucional para la entrega segura de estudiantes ante sismos, incendios, inundaciones u otras emergencias.',
      rC,
      logoId
    );
    pintarCabecera(wsC.getRow(rC), HEAD_CONTROL);
    rC += 1;
    rC = escribirFilas(wsC, rC, b.filas_control, keysC, 16);
    rC += 2;
  }

  [wsP, wsC].forEach((ws) => {
    ws.pageSetup = {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
      margins: { left: 0.35, right: 0.35, top: 0.4, bottom: 0.4, header: 0.15, footer: 0.15 },
    };
  });

  const buffer = await wb.xlsx.writeBuffer();
  const suf = bloques.length === 1 ? bloques[0].titulo.replace(/[^\wáéíóúñÁÉÍÓÚÑ -]/gi, '').slice(0, 40) : 'todos';
  const variante = data.en_blanco ? 'en-blanco' : 'autorizados';
  return {
    ok: true,
    buffer,
    filename: `padron-emergencias-${variante}-${suf}-${data.fecha}.xlsx`.replace(/\s+/g, '_'),
  };
}

module.exports = {
  obtenerPadronEmergencias,
  generarExcelPadronEmergencias,
};
