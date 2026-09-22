/**
 * Reporte «Incidencias y estrellas» — aula + ingreso (vestimenta / olvido QR).
 */
const ExcelJS = require('exceljs');
const { marcaCreadorExcel } = require('./identidadColegio');
const { query } = require('./mysql');
const {
  FILL_FILA_PAR,
  FILL_FILA_IMPAR,
  resolverAnioTrabajo,
  escribirTitulo,
  escribirKpisFila,
  escribirCabecera,
  estiloCuerpo,
  finalizarHoja,
} = require('./excelReporteGeneral');
const { sqlMatriculaEstadoSoloRegular } = require('./matriculaEstados');
const {
  columnExists,
  etiquetaGradoTitulo,
  ordenNivelEducativoNombre,
} = require('./listaAlumnosMatriculadosReporte');
const {
  ASSIGNMENT_ID_TUTORIA,
  ASSIGNMENT_ID_VESTIMENTA,
  MOTIVO_OLVIDO_QR,
  obtenerRangoBimestre,
  toFechaYmd,
  toFechaHoraSql,
} = require('./conductaIncidenciasBimestre');
const { fetchReglaConducta, formatDescuentoLabel } = require('./reglaConducta');

const BIM_LABEL = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' };
const DOCENTE_INGRESO = 'ingreso';
const FILL_INC = 'FFFEF2F2';
const FILL_EST = 'FFECFDF5';
const FILL_QR = 'FFFFF7ED';

function validarFechaISO(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '').trim());
}

function fmtFechaUi(iso) {
  const s = toFechaYmd(iso);
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

function nombrePersona(apellidos, nombres) {
  const ap = String(apellidos || '').trim();
  const nom = String(nombres || '').trim();
  if (ap && nom) return `${ap}, ${nom}`;
  return ap || nom || '—';
}

function nombreAlumno(row) {
  const ap = [row.apellido_paterno, row.apellido_materno]
    .filter((x) => x != null && String(x).trim())
    .join(' ')
    .trim();
  const nom = String(row.nombres || '').trim();
  if (ap && nom) return `${ap}, ${nom}`;
  return ap || nom || '—';
}

function etiquetaGrupo(g) {
  const nivel = String(g.nivel_nombre || '').trim();
  const gl = etiquetaGradoTitulo(g.nivel_nombre, g.grado);
  const sec = String(g.seccion || '').trim();
  const turno = String(g.turno_nombre || '').trim();
  return [nivel, [gl, sec].filter(Boolean).join(' '), turno].filter(Boolean).join(' · ');
}

/** Nivel + grado + sección, p. ej. «Inicial 5 Años A». */
function etiquetaAula(g) {
  const nivel = String(g.nivel_nombre || '').trim();
  const n = nivel.toLowerCase();
  const gnum = g.grado != null && g.grado !== '' ? String(g.grado).trim() : '';
  const gl = n.includes('inicial') && gnum ? `${gnum} Años` : gnum ? `${gnum}°` : '';
  const sec = String(g.seccion || '').trim();
  return [nivel, [gl, sec].filter(Boolean).join(' ')].filter(Boolean).join(' ');
}

function nombreSiExiste(apellidos, nombres) {
  const nom = nombrePersona(apellidos, nombres);
  return nom && nom !== '—' ? nom : '';
}

function nombreRegistrante(row) {
  return (
    nombreSiExiste(row.docente_apellidos, row.docente_nombres) ||
    nombreSiExiste(row.tutor_apellidos, row.tutor_nombres) ||
    nombreSiExiste(row.tutor2_apellidos, row.tutor2_nombres) ||
    '—'
  );
}

function compararGrupos(a, b) {
  const oa = ordenNivelEducativoNombre(a.nivel_nombre);
  const ob = ordenNivelEducativoNombre(b.nivel_nombre);
  if (oa !== ob) return oa - ob;
  const gd = (parseInt(a.grado, 10) || 0) - (parseInt(b.grado, 10) || 0);
  if (gd !== 0) return gd;
  return String(a.seccion || '').localeCompare(String(b.seccion || ''), 'es', { sensitivity: 'base' });
}

function esOlvidoQr(motivo) {
  return String(motivo || '').trim().toUpperCase() === MOTIVO_OLVIDO_QR;
}

function maxIso(a, b) {
  const xs = [a, b].filter(Boolean);
  if (!xs.length) return null;
  return xs.sort()[xs.length - 1];
}

function minIso(a, b) {
  const xs = [a, b].filter(Boolean);
  if (!xs.length) return null;
  return xs.sort()[0];
}

function numeroPuntos(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  return Math.round(v * 10) / 10;
}

function fmtPuntosSigned(n) {
  const v = numeroPuntos(n);
  if (v == null) return '—';
  const abs = Math.abs(v);
  const txt = Math.abs(abs - Math.round(abs)) < 1e-9 ? String(Math.round(abs)) : abs.toFixed(1);
  if (v > 0) return `+${txt}`;
  if (v < 0) return `−${txt}`;
  return '0';
}

/** Incidencia/QR: en BD suele ir 0; se usa el descuento de la regla (negativo). */
function puntosDescuento(raw, descuentoRegla) {
  const stored = numeroPuntos(raw);
  if (stored != null && stored !== 0) return stored > 0 ? -Math.abs(stored) : stored;
  const d = numeroPuntos(descuentoRegla);
  return d != null && d > 0 ? -d : null;
}

function sqlFiltroGrupo(aliasG, { hasSede, sedeId, nivelId, grado }) {
  let sql = '';
  const params = [];
  if (hasSede && Number.isFinite(sedeId)) {
    sql += ` AND ${aliasG}.sede_id = ?`;
    params.push(sedeId);
  }
  if (Number.isFinite(nivelId)) {
    sql += ` AND ${aliasG}.nivel_id = ?`;
    params.push(nivelId);
  }
  if (Number.isFinite(grado)) {
    sql += ` AND CAST(${aliasG}.grado AS UNSIGNED) = ?`;
    params.push(grado);
  }
  return { sql, params };
}

function parseBimestreOpcional(v) {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n < 1 || n > 4) return null;
  return n;
}

function parseCategoria(v) {
  const s = String(v || '').trim().toLowerCase();
  if (s === 'incidencias' || s === 'estrellas') return s;
  return 'todos';
}

async function resolverVentanaFechas(colegioId, anio, bimestre, desdeUser, hastaUser) {
  let bimDesde = null;
  let bimHasta = null;
  if (Number.isFinite(bimestre)) {
    const rango = await obtenerRangoBimestre(query, colegioId, bimestre, anio);
    bimDesde = rango?.desde || null;
    bimHasta = rango?.hasta || null;
  }
  const desde = maxIso(bimDesde, desdeUser) || `${anio}-01-01`;
  const hasta = minIso(bimHasta, hastaUser) || `${anio}-12-31`;
  if (desde > hasta) {
    return { ok: false, status: 400, error: 'El rango de fechas no coincide con el bimestre elegido.' };
  }
  return { ok: true, desde, hasta };
}

async function obtenerIncidenciasEstrellas(colegioId, filtros) {
  const anio = await resolverAnioTrabajo(colegioId, filtros.anio);
  const bimestre = parseBimestreOpcional(filtros.bimestre);
  const sedeId = filtros.sedeId != null ? parseInt(filtros.sedeId, 10) : NaN;
  const nivelId = filtros.nivelId != null ? parseInt(filtros.nivelId, 10) : NaN;
  const grado = filtros.grado != null ? parseInt(filtros.grado, 10) : NaN;
  const docenteRaw = filtros.docenteId;
  const categoria = parseCategoria(filtros.categoria);
  const quiereEstrellas = categoria !== 'incidencias';
  const quiereIncidencias = categoria !== 'estrellas';
  const esIngreso = String(docenteRaw || '').toLowerCase() === DOCENTE_INGRESO;
  const docenteId = !esIngreso && docenteRaw != null ? parseInt(docenteRaw, 10) : NaN;
  const desdeUser = validarFechaISO(filtros.desde) ? String(filtros.desde).trim() : null;
  const hastaUser = validarFechaISO(filtros.hasta) ? String(filtros.hasta).trim() : null;

  if (filtros.bimestre != null && String(filtros.bimestre).trim() !== '' && !Number.isFinite(bimestre)) {
    return { ok: false, status: 400, error: 'Seleccione un bimestre válido o Todos.' };
  }
  if (desdeUser && hastaUser && desdeUser > hastaUser) {
    return { ok: false, status: 400, error: 'La fecha «desde» no puede ser posterior a «hasta».' };
  }

  const ventana = await resolverVentanaFechas(colegioId, anio, bimestre, desdeUser, hastaUser);
  if (!ventana.ok) return ventana;
  const { desde, hasta } = ventana;

  const hasSede = await columnExists('grupos', 'sede_id');
  const gFiltro = sqlFiltroGrupo('g', { hasSede, sedeId, nivelId, grado });
  const regla = await fetchReglaConducta(query);
  const descVest = `Vestimenta / presentación escolar (${formatDescuentoLabel(regla.presentacion?.descuento ?? 0.5)})`;
  const descQr = `Olvido de QR / carné de asistencia (${formatDescuentoLabel(regla.olvido_qr?.descuento ?? 0.5)})`;

  const eventos = [];

  if (!esIngreso && (quiereEstrellas || quiereIncidencias)) {
    const paramsEi = [ASSIGNMENT_ID_TUTORIA, colegioId, anio, desde, hasta];
    let extraDoc = '';
    if (Number.isFinite(docenteId)) {
      extraDoc = ' AND ei.worker_id = ? ';
      paramsEi.push(docenteId);
    }
    paramsEi.push(...gFiltro.params);
    let filtroTipo = `
         AND (
           ei.type = 2
           OR (
             ei.type = 1
             AND COALESCE(ei.assignment_id, 0) <> ${ASSIGNMENT_ID_VESTIMENTA}
             AND COALESCE(ei.description, '') NOT LIKE '[VESTIMENTA]%'
           )
         )`;
    if (!quiereEstrellas) {
      filtroTipo = `
         AND ei.type = 1
         AND COALESCE(ei.assignment_id, 0) <> ${ASSIGNMENT_ID_VESTIMENTA}
         AND COALESCE(ei.description, '') NOT LIKE '[VESTIMENTA]%'`;
    } else if (!quiereIncidencias) {
      filtroTipo = ' AND ei.type = 2 ';
    }
    const rowsEi = await query(
      `SELECT ei.id, ei.type, ei.points, ei.description, ei.created_at, ei.assignment_id, ei.worker_id,
              m.id AS matricula_id, m.grupo_id,
              al.nombres, al.apellido_paterno, al.apellido_materno,
              g.grado, g.seccion, g.nivel_id,
              n.nombre AS nivel_nombre,
              t.nombre AS turno_nombre,
              pe.apellidos AS docente_apellidos,
              pe.nombres AS docente_nombres,
              pt.apellidos AS tutor_apellidos,
              pt.nombres AS tutor_nombres,
              pt2.apellidos AS tutor2_apellidos,
              pt2.nombres AS tutor2_nombres,
              CASE
                WHEN ei.assignment_id = ? THEN 'Tutoría'
                ELSE COALESCE(c.nombre, '—')
              END AS curso_nombre
       FROM enrollment_incidents ei
       INNER JOIN matriculas m ON m.id = ei.enrollment_id AND m.colegio_id = ? AND ${sqlMatriculaEstadoSoloRegular('m')}
       INNER JOIN grupos g ON g.id = m.grupo_id AND g.colegio_id = m.colegio_id AND g.anio = ?
       INNER JOIN alumnos al ON al.id = m.alumno_id AND al.colegio_id = m.colegio_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       LEFT JOIN turnos t ON t.id = g.turno_id
       LEFT JOIN personal pe ON pe.id = ei.worker_id AND COALESCE(ei.worker_id, 0) > 0
       LEFT JOIN personal pt ON pt.id = g.tutor_id AND COALESCE(g.tutor_id, 0) > 0
       LEFT JOIN personal pt2 ON pt2.id = g.tutor_id_2 AND COALESCE(g.tutor_id_2, 0) > 0
       LEFT JOIN asignaturas a ON a.id = ei.assignment_id AND ei.assignment_id > 0
       LEFT JOIN cursos c ON c.id = a.curso_id
       WHERE DATE(ei.created_at) BETWEEN ? AND ?
         ${filtroTipo}
         ${extraDoc}
         ${gFiltro.sql}
       ORDER BY ei.created_at DESC, ei.id DESC`,
      paramsEi
    );
    (rowsEi || []).forEach((r) => {
      const esEstrella = Number(r.type) === 2;
      const puntos = esEstrella
        ? numeroPuntos(r.points) || 0
        : puntosDescuento(r.points, regla.incidencias?.descuento);
      eventos.push({
        id: esEstrella ? `est-${r.id}` : `inc-${r.id}`,
        tipo: esEstrella ? 'estrella' : 'incidencia',
        tipo_label: esEstrella ? 'Estrella' : 'Incidencia',
        fecha_iso: toFechaYmd(r.created_at),
        fecha: fmtFechaUi(r.created_at),
        hora: String(toFechaHoraSql(r.created_at) || '').slice(11, 16) || '—',
        alumno_nombre: nombreAlumno(r),
        registrado_por: nombreRegistrante(r),
        aula: etiquetaAula(r),
        origen: String(r.curso_nombre || '—').trim() || '—',
        descripcion: String(r.description || '').trim() || '—',
        puntos,
        puntos_label: fmtPuntosSigned(puntos),
        grupo_id: Number(r.grupo_id),
        nivel_nombre: r.nivel_nombre,
        grado: r.grado,
        seccion: r.seccion,
        turno_nombre: r.turno_nombre,
        sort_at: toFechaHoraSql(r.created_at) || String(r.created_at || ''),
      });
    });
  }

  if (quiereIncidencias && !Number.isFinite(docenteId)) {
    try {
      const paramsPed = [colegioId, anio, colegioId, anio, desde, hasta, ...gFiltro.params];
      const rowsPed = await query(
        `SELECT ped.id, ped.fecha, ped.hora, ped.motivo, ped.puntos,
                m.id AS matricula_id, m.grupo_id,
                al.nombres, al.apellido_paterno, al.apellido_materno,
                g.grado, g.seccion, g.nivel_id,
                n.nombre AS nivel_nombre,
                t.nombre AS turno_nombre,
                pt.apellidos AS tutor_apellidos,
                pt.nombres AS tutor_nombres
         FROM presentacion_escolar_descuentos ped
         INNER JOIN usuarios ua ON ua.id = ped.alumno_usuario_id AND ua.colegio_id = ped.colegio_id
         INNER JOIN alumnos al ON al.id = ua.alumno_id AND al.colegio_id = ua.colegio_id
         INNER JOIN matriculas m ON m.alumno_id = ua.alumno_id AND m.colegio_id = ? AND ${sqlMatriculaEstadoSoloRegular('m')}
         INNER JOIN grupos g ON g.id = m.grupo_id AND g.colegio_id = m.colegio_id AND g.anio = ?
         INNER JOIN niveles n ON n.id = g.nivel_id
         LEFT JOIN turnos t ON t.id = g.turno_id
         LEFT JOIN personal pt ON pt.id = g.tutor_id AND COALESCE(g.tutor_id, 0) > 0
         WHERE ped.colegio_id = ? AND ped.anio = ?
           AND DATE(ped.fecha) BETWEEN ? AND ?
           ${gFiltro.sql}
         ORDER BY ped.fecha DESC, ped.hora DESC, ped.id DESC`,
        paramsPed
      );
      (rowsPed || []).forEach((r) => {
        const qr = esOlvidoQr(r.motivo);
        const fechaIso = toFechaYmd(r.fecha);
        const hora = r.hora ? String(r.hora).slice(0, 5) : '—';
        const puntos = puntosDescuento(
          r.puntos,
          qr ? regla.olvido_qr?.descuento : regla.presentacion?.descuento
        );
        eventos.push({
          id: `ped-${r.id}`,
          tipo: qr ? 'olvido_qr' : 'vestimenta',
          tipo_label: qr ? 'Olvido QR' : 'Vestimenta',
          fecha_iso: fechaIso,
          fecha: fmtFechaUi(r.fecha),
          hora,
          alumno_nombre: nombreAlumno(r),
          registrado_por: 'Ingreso',
          aula: etiquetaAula(r),
          origen: qr ? 'Olvido de QR' : 'Vestimenta (QR)',
          descripcion: qr ? descQr : descVest,
          puntos,
          puntos_label: fmtPuntosSigned(puntos),
          grupo_id: Number(r.grupo_id),
          nivel_nombre: r.nivel_nombre,
          grado: r.grado,
          seccion: r.seccion,
          turno_nombre: r.turno_nombre,
          sort_at: `${fechaIso || ''} ${r.hora ? String(r.hora).slice(0, 8) : '00:00:00'}`,
        });
      });
    } catch (e) {
      if (!(String(e.message || '').includes("doesn't exist") || e.code === 'ER_NO_SUCH_TABLE')) {
        console.warn('[reportes/incidencias-estrellas] presentacion:', e.message);
      }
    }
  }

  eventos.sort((a, b) => String(b.sort_at || '').localeCompare(String(a.sort_at || '')));

  const gruposMap = new Map();
  const alumnosUnicos = new Set();
  const kpis = {
    incidencias: 0,
    vestimenta: 0,
    olvido_qr: 0,
    estrellas: 0,
    puntos_estrellas: 0,
    puntos_descontados: 0,
  };

  eventos.forEach((ev) => {
    alumnosUnicos.add(`${ev.grupo_id}:${ev.alumno_nombre}`);
    if (ev.tipo === 'incidencia') kpis.incidencias += 1;
    else if (ev.tipo === 'vestimenta') kpis.vestimenta += 1;
    else if (ev.tipo === 'olvido_qr') kpis.olvido_qr += 1;
    else if (ev.tipo === 'estrella') {
      kpis.estrellas += 1;
      kpis.puntos_estrellas += Number(ev.puntos) || 0;
    }
    if (Number(ev.puntos) < 0) {
      kpis.puntos_descontados += Math.abs(Number(ev.puntos));
    }
    if (!gruposMap.has(ev.grupo_id)) {
      gruposMap.set(ev.grupo_id, {
        grupo_id: ev.grupo_id,
        nivel_nombre: ev.nivel_nombre,
        grado: ev.grado,
        seccion: ev.seccion,
        turno_nombre: ev.turno_nombre,
        etiqueta: etiquetaGrupo(ev),
        aula: ev.aula || etiquetaAula(ev),
        registros: [],
      });
    }
    gruposMap.get(ev.grupo_id).registros.push(ev);
  });

  const grupos = [...gruposMap.values()].sort(compararGrupos);
  kpis.alumnos = alumnosUnicos.size;
  kpis.total = eventos.length;
  kpis.puntos_estrellas = numeroPuntos(kpis.puntos_estrellas) || 0;
  kpis.puntos_descontados = numeroPuntos(kpis.puntos_descontados) || 0;
  kpis.puntos_label = `${fmtPuntosSigned(kpis.puntos_estrellas)} / ${fmtPuntosSigned(
    kpis.puntos_descontados ? -kpis.puntos_descontados : 0
  )}`;

  const [colegioRow] = await query('SELECT nombre FROM colegios WHERE id = ? LIMIT 1', [colegioId]);
  const colegioNombre = String(colegioRow?.nombre || '').trim() || 'Colegio';
  const bimTxt = Number.isFinite(bimestre) ? `BIMESTRE ${BIM_LABEL[bimestre] || bimestre}` : 'TODOS LOS BIMESTRES';
  const extraFiltro = [];
  if (Number.isFinite(nivelId)) {
    const [nv] = await query('SELECT nombre FROM niveles WHERE id = ? LIMIT 1', [nivelId]);
    if (nv?.nombre) extraFiltro.push(String(nv.nombre).trim());
  }
  if (Number.isFinite(grado)) extraFiltro.push(etiquetaGradoTitulo(extraFiltro[0] || '', grado));
  if (esIngreso) extraFiltro.push('Ingreso');
  else if (Number.isFinite(docenteId)) {
    const [doc] = await query('SELECT apellidos, nombres FROM personal WHERE id = ? LIMIT 1', [docenteId]);
    if (doc) extraFiltro.push(nombrePersona(doc.apellidos, doc.nombres));
  }
  if (categoria === 'incidencias') extraFiltro.push('Solo incidencias');
  else if (categoria === 'estrellas') extraFiltro.push('Solo estrellas');
  const subtitulo = [`${fmtFechaUi(desde)} — ${fmtFechaUi(hasta)}`, ...extraFiltro].filter(Boolean).join('  ·  ');
  const catTitulo =
    categoria === 'incidencias'
      ? 'INCIDENCIAS'
      : categoria === 'estrellas'
        ? 'ESTRELLAS'
        : 'INCIDENCIAS Y ESTRELLAS';

  return {
    ok: true,
    colegio_nombre: colegioNombre,
    titulo: `${catTitulo} — ${bimTxt} · ${anio}`,
    categoria,
    subtitulo,
    anio,
    bimestre,
    bimestre_label: Number.isFinite(bimestre) ? BIM_LABEL[bimestre] : 'todos',
    desde,
    hasta,
    kpis,
    grupos,
  };
}

async function generarExcelIncidenciasEstrellas(colegioId, filtros) {
  const data = await obtenerIncidenciasEstrellas(colegioId, filtros);
  if (!data.ok) return data;

  const wb = new ExcelJS.Workbook();
  wb.creator = await marcaCreadorExcel(colegioId);
  wb.created = new Date();
  const cols = 9;
  const ws = wb.addWorksheet('Detalle', { views: [{ showGridLines: false }] });
  ws.columns = [
    { width: 22 },
    { width: 12 },
    { width: 9 },
    { width: 13 },
    { width: 30 },
    { width: 24 },
    { width: 16 },
    { width: 46 },
    { width: 11 },
  ];

  const k = data.kpis || {};
  let r = escribirTitulo(ws, {
    cols,
    titulo: data.titulo,
    subtitulo: `${data.colegio_nombre}  ·  ${data.subtitulo}`,
  });
  r = escribirKpisFila(ws, {
    startRow: r,
    cols,
    pares: [
      ['Incidencias', k.incidencias ?? 0],
      ['Vestimenta', k.vestimenta ?? 0],
      ['Olvido QR', k.olvido_qr ?? 0],
      ['Estrellas', k.estrellas ?? 0],
      ['Pts. dados', k.puntos_estrellas ?? 0],
      ['Pts. desc.', k.puntos_descontados ?? 0],
      ['Alumnos', k.alumnos ?? 0],
    ],
  });

  const headerRow = r;
  escribirCabecera(ws.getRow(r), [
    'Aula',
    'Fecha',
    'Hora',
    'Tipo',
    'Alumno',
    'Registró',
    'Origen',
    'Detalle',
    'Puntos',
  ]);
  r += 1;

  (data.grupos || []).forEach((g) => {
    (g.registros || []).forEach((ev, idx) => {
      const row = ws.getRow(r);
      row.values = [
        ev.aula || g.aula || g.etiqueta,
        ev.fecha,
        ev.hora,
        ev.tipo_label,
        ev.alumno_nombre,
        ev.registrado_por,
        ev.origen,
        ev.descripcion,
        ev.puntos_label || (ev.puntos != null ? ev.puntos : '—'),
      ];
      let fill = idx % 2 === 1 ? FILL_FILA_PAR : FILL_FILA_IMPAR;
      if (ev.tipo === 'incidencia') fill = FILL_INC;
      else if (ev.tipo === 'estrella') fill = FILL_EST;
      else if (ev.tipo === 'vestimenta' || ev.tipo === 'olvido_qr') fill = FILL_QR;
      const desc = String(ev.descripcion || '');
      const lineas = Math.min(6, Math.max(1, Math.ceil(desc.length / 55)));
      row.height = Math.max(18, 12 + lineas * 12);
      for (let c = 1; c <= cols; c += 1) {
        const ptsColor =
          c === 9 && Number(ev.puntos) < 0 ? 'FFBE123C' : c === 9 && Number(ev.puntos) > 0 ? 'FF047857' : null;
        estiloCuerpo(row.getCell(c), {
          fill,
          align: c === 1 || c === 5 || c === 6 || c === 8 ? 'left' : 'center',
          wrap: c === 1 || c === 5 || c === 8,
          bold: c === 9,
          color: ptsColor,
        });
      }
      r += 1;
    });
  });

  finalizarHoja(ws, { headerRow, cols, lastRow: Math.max(headerRow, r - 1) });

  const buffer = await wb.xlsx.writeBuffer();
  return {
    ok: true,
    buffer,
    filename: `incidencias_estrellas_${data.bimestre_label}_${data.anio}.xlsx`,
  };
}

module.exports = {
  obtenerIncidenciasEstrellas,
  generarExcelIncidenciasEstrellas,
};
