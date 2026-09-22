/**
 * Reporte «Exámenes virtuales» — aula virtual por bimestre (modal + Excel).
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

const BIM_LABEL = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' };
const FILL_NO_RENDIO = 'FFFEF2F2';

function isoFecha(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    // DATE de MySQL llega como UTC medianoche; UTC evita el desfase -5 (Lima).
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, '0');
    const d = String(v.getUTCDate()).padStart(2, '0');
    if (y < 1990) return null;
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || s.startsWith('0000')) return null;
  const y = parseInt(s.slice(0, 4), 10);
  if (!Number.isFinite(y) || y < 1990) return null;
  return s;
}

function fmtFechaUi(iso) {
  const s = isoFecha(iso);
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

function validarFechaISO(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '').trim());
}

/** Ventana programada real (ignora 0000-00-00, que mysql2 a veces vuelve 1899/1970). */
const SQL_FECHA_EXAMEN_REAL = `(ae.fecha_desde IS NOT NULL AND CAST(ae.fecha_desde AS CHAR) >= '1990-01-01')`;
const SQL_FECHA_HASTA_REAL = `(ae.fecha_hasta IS NOT NULL AND CAST(ae.fecha_hasta AS CHAR) >= '1990-01-01')`;

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

function compararGrupos(a, b) {
  const oa = ordenNivelEducativoNombre(a.nivel_nombre);
  const ob = ordenNivelEducativoNombre(b.nivel_nombre);
  if (oa !== ob) return oa - ob;
  const gd = (parseInt(a.grado, 10) || 0) - (parseInt(b.grado, 10) || 0);
  if (gd !== 0) return gd;
  return String(a.seccion || '').localeCompare(String(b.seccion || ''), 'es', { sensitivity: 'base' });
}

function rindioPrueba(p) {
  if (!p) return false;
  const est = String(p.estado || '').toUpperCase();
  if (est === 'FINALIZADA' || est === 'FINALIZADO') return true;
  if (p.puntaje != null && p.puntaje !== '') return true;
  return false;
}

function fmtPuntaje(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function chunkIds(ids, size = 400) {
  const out = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

async function obtenerExamenesVirtuales(colegioId, filtros) {
  const anio = await resolverAnioTrabajo(colegioId, filtros.anio);
  const bimestreRaw = filtros.bimestre;
  const bimestre = bimestreRaw !== undefined && bimestreRaw !== null && String(bimestreRaw).trim() !== ''
    ? parseInt(bimestreRaw, 10)
    : NaN;
  const sedeId = filtros.sedeId != null ? parseInt(filtros.sedeId, 10) : NaN;
  const nivelId = filtros.nivelId != null ? parseInt(filtros.nivelId, 10) : NaN;
  const grado = filtros.grado != null ? parseInt(filtros.grado, 10) : NaN;
  const docenteId = filtros.docenteId != null ? parseInt(filtros.docenteId, 10) : NaN;
  const desde = validarFechaISO(filtros.desde) ? String(filtros.desde).trim() : null;
  const hasta = validarFechaISO(filtros.hasta) ? String(filtros.hasta).trim() : null;

  if (
    bimestreRaw !== undefined
    && bimestreRaw !== null
    && String(bimestreRaw).trim() !== ''
    && (!Number.isFinite(bimestre) || bimestre < 1 || bimestre > 4)
  ) {
    return { ok: false, status: 400, error: 'Seleccione un bimestre válido o Todos.' };
  }
  if (desde && hasta && desde > hasta) {
    return { ok: false, status: 400, error: 'La fecha «desde» no puede ser posterior a «hasta».' };
  }

  const hasSede = await columnExists('grupos', 'sede_id');
  let sql = `
    SELECT
      ae.id AS examen_id,
      ae.titulo,
      ae.estado,
      ae.ciclo,
      CASE WHEN CAST(ae.fecha_desde AS CHAR) LIKE '0000%' THEN NULL ELSE DATE_FORMAT(ae.fecha_desde, '%Y-%m-%d') END AS fecha_desde,
      CASE WHEN CAST(ae.fecha_hasta AS CHAR) LIKE '0000%' THEN NULL ELSE DATE_FORMAT(ae.fecha_hasta, '%Y-%m-%d') END AS fecha_hasta,
      ae.tipo,
      a.id AS asignatura_id,
      c.nombre AS curso_nombre,
      a.grupo_id,
      g.grado,
      g.seccion,
      g.nivel_id,
      n.nombre AS nivel_nombre,
      t.nombre AS turno_nombre,
      COALESCE(pe.apellidos, pa.apellidos) AS docente_apellidos,
      COALESCE(pe.nombres, pa.nombres) AS docente_nombres
    FROM asignaturas_examenes ae
    INNER JOIN asignaturas a ON a.id = ae.asignatura_id AND a.colegio_id = ?
    INNER JOIN cursos c ON c.id = a.curso_id
    INNER JOIN grupos g ON g.id = a.grupo_id AND g.colegio_id = a.colegio_id
    INNER JOIN niveles n ON n.id = g.nivel_id
    LEFT JOIN turnos t ON t.id = g.turno_id
    LEFT JOIN personal pe ON pe.id = ae.trabajador_id
    LEFT JOIN personal pa ON pa.id = a.personal_id
    WHERE a.colegio_id = ?
      AND g.anio = ?
      AND (ae.tipo IS NULL OR ae.tipo <> 'PDF')`;
  const params = [colegioId, colegioId, anio];
  if (Number.isFinite(bimestre)) {
    sql += ' AND ae.ciclo = ?';
    params.push(bimestre);
  }
  if (hasSede && Number.isFinite(sedeId)) {
    sql += ' AND g.sede_id = ?';
    params.push(sedeId);
  }
  if (Number.isFinite(nivelId)) {
    sql += ' AND g.nivel_id = ?';
    params.push(nivelId);
  }
  if (Number.isFinite(grado)) {
    sql += ' AND CAST(g.grado AS UNSIGNED) = ?';
    params.push(grado);
  }
  if (Number.isFinite(docenteId)) {
    sql += ' AND COALESCE(ae.trabajador_id, a.personal_id) = ?';
    params.push(docenteId);
  }
  if (desde || hasta) {
    const d = desde || '0001-01-01';
    const h = hasta || '9999-12-31';
    // Ventana programada que cruza el rango, O al menos un alumno rindió en esas fechas.
    // Sin esto, los exámenes con 0000-00-00 (sin horario) desaparecían al filtrar por fechas.
    sql += ` AND (
      (${SQL_FECHA_EXAMEN_REAL} AND ${SQL_FECHA_HASTA_REAL}
        AND DATE(ae.fecha_desde) <= ? AND DATE(ae.fecha_hasta) >= ?)
      OR (${SQL_FECHA_EXAMEN_REAL} AND NOT ${SQL_FECHA_HASTA_REAL} AND DATE(ae.fecha_desde) <= ?)
      OR (NOT ${SQL_FECHA_EXAMEN_REAL} AND ${SQL_FECHA_HASTA_REAL} AND DATE(ae.fecha_hasta) >= ?)
      OR EXISTS (
        SELECT 1 FROM asignaturas_examenes_pruebas p
        WHERE p.examen_id = ae.id
          AND p.fecha_hora IS NOT NULL
          AND CAST(p.fecha_hora AS CHAR) >= '1990-01-01'
          AND DATE(p.fecha_hora) >= ?
          AND DATE(p.fecha_hora) <= ?
      )
    )`;
    params.push(h, d, h, d, d, h);
  }
  sql += ' ORDER BY n.nombre ASC, CAST(g.grado AS UNSIGNED) ASC, g.seccion ASC, c.nombre ASC, ae.id ASC';

  const examenes = (await query(sql, params)) || [];

  const [colegioRow] = await query(
    'SELECT nombre FROM colegios WHERE id = ? LIMIT 1',
    [colegioId]
  );
  const colegioNombre = String(colegioRow?.nombre || '').trim() || 'Colegio';
  const bimLabel = Number.isFinite(bimestre) ? (BIM_LABEL[bimestre] || String(bimestre)) : 'todos';
  const extraFiltro = [];
  if (Number.isFinite(nivelId)) {
    const [nv] = await query('SELECT nombre FROM niveles WHERE id = ? LIMIT 1', [nivelId]);
    if (nv?.nombre) extraFiltro.push(String(nv.nombre).trim());
  }
  if (Number.isFinite(grado)) {
    extraFiltro.push(etiquetaGradoTitulo(extraFiltro[0] || '', grado));
  }
  if (Number.isFinite(docenteId)) {
    const [doc] = await query('SELECT apellidos, nombres FROM personal WHERE id = ? LIMIT 1', [docenteId]);
    if (doc) extraFiltro.push(nombrePersona(doc.apellidos, doc.nombres));
  }
  const rangoTxt = (() => {
    const partes = [];
    if (!desde && !hasta) partes.push(Number.isFinite(bimestre) ? 'Todo el bimestre' : 'Todos los bimestres');
    else {
      const d = desde ? fmtFechaUi(desde) : 'inicio';
      const h = hasta ? fmtFechaUi(hasta) : 'fin';
      partes.push(`${d} — ${h}`);
    }
    if (extraFiltro.length) partes.push(extraFiltro.filter(Boolean).join(' · '));
    return partes.join('  ·  ');
  })();

  const titulo = Number.isFinite(bimestre)
    ? `EXÁMENES VIRTUALES — BIMESTRE ${bimLabel} · ${anio}`
    : `EXÁMENES VIRTUALES — TODOS LOS BIMESTRES · ${anio}`;
  const subtitulo = rangoTxt;

  if (!examenes.length) {
    return {
      ok: true,
      colegio_nombre: colegioNombre,
      titulo,
      subtitulo,
      anio,
      bimestre,
      bimestre_label: bimLabel,
      desde,
      hasta,
      kpis: {
        total_examenes: 0,
        examenes_rendidos: 0,
        examenes_sin_rendir: 0,
        alumnos_rindieron: 0,
        promedio_general: null,
      },
      grupos: [],
    };
  }

  const examenIds = examenes.map((e) => Number(e.examen_id)).filter((id) => Number.isFinite(id));
  const grupoIds = [...new Set(examenes.map((e) => Number(e.grupo_id)).filter((id) => Number.isFinite(id)))];

  const pruebasPorExamen = new Map();
  for (const chunk of chunkIds(examenIds)) {
    const ph = chunk.map(() => '?').join(',');
    const rows = await query(
      `SELECT aep.id, aep.examen_id, aep.matricula_id, aep.puntaje, aep.correctas, aep.incorrectas,
              aep.estado, DATE_FORMAT(aep.fecha_hora, '%Y-%m-%d') AS fecha_hora
       FROM asignaturas_examenes_pruebas aep
       WHERE aep.examen_id IN (${ph})
       ORDER BY aep.id ASC`,
      chunk
    );
    for (const row of rows || []) {
      const eid = Number(row.examen_id);
      if (!pruebasPorExamen.has(eid)) pruebasPorExamen.set(eid, new Map());
      const map = pruebasPorExamen.get(eid);
      map.set(Number(row.matricula_id), row);
    }
  }

  const alumnosPorGrupo = new Map();
  for (const chunk of chunkIds(grupoIds)) {
    const ph = chunk.map(() => '?').join(',');
    const rows = await query(
      `SELECT m.id AS matricula_id, m.grupo_id,
              a.nombres, a.apellido_paterno, a.apellido_materno
       FROM matriculas m
       INNER JOIN alumnos a ON a.id = m.alumno_id AND a.colegio_id = m.colegio_id
       WHERE m.grupo_id IN (${ph})
         AND m.colegio_id = ?
         AND ${sqlMatriculaEstadoSoloRegular('m')}
       ORDER BY a.apellido_paterno ASC, a.apellido_materno ASC, a.nombres ASC`,
      [...chunk, colegioId]
    );
    for (const row of rows || []) {
      const gid = Number(row.grupo_id);
      if (!alumnosPorGrupo.has(gid)) alumnosPorGrupo.set(gid, []);
      alumnosPorGrupo.get(gid).push(row);
    }
  }

  const gruposMap = new Map();
  let totalRendidosExamenes = 0;
  let examenesSinRendir = 0;
  const alumnosUnicosRindieron = new Set();
  const puntajes = [];

  for (const ex of examenes) {
    const gid = Number(ex.grupo_id);
    const eid = Number(ex.examen_id);
    const alumnos = alumnosPorGrupo.get(gid) || [];
    const pruebas = pruebasPorExamen.get(eid) || new Map();

    const lista = alumnos.map((al) => {
      const p = pruebas.get(Number(al.matricula_id));
      const rindio = rindioPrueba(p);
      const enCurso = Boolean(p) && !rindio;
      const puntaje = rindio ? fmtPuntaje(p.puntaje) : null;
      if (rindio) {
        alumnosUnicosRindieron.add(`${gid}:${al.matricula_id}`);
        if (puntaje != null) puntajes.push(puntaje);
      }
      return {
        matricula_id: al.matricula_id,
        alumno_nombre: nombreAlumno(al),
        rindio,
        en_curso: enCurso,
        estado: rindio ? 'Rindió' : enCurso ? 'En curso' : 'No rindió',
        fecha: rindio || enCurso ? fmtFechaUi(p?.fecha_hora) : '—',
        puntaje,
        correctas: rindio ? (p.correctas != null ? Number(p.correctas) : null) : null,
        incorrectas: rindio ? (p.incorrectas != null ? Number(p.incorrectas) : null) : null,
      };
    });

    const rendidos = lista.filter((a) => a.rindio).length;
    const promedioExamen = (() => {
      const nums = lista.map((a) => a.puntaje).filter((n) => n != null);
      if (!nums.length) return null;
      return Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 100) / 100;
    })();
    if (rendidos > 0) totalRendidosExamenes += 1;
    else examenesSinRendir += 1;

    if (!gruposMap.has(gid)) {
      gruposMap.set(gid, {
        grupo_id: gid,
        nivel_nombre: ex.nivel_nombre,
        grado: ex.grado,
        seccion: ex.seccion,
        turno_nombre: ex.turno_nombre,
        etiqueta: etiquetaGrupo(ex),
        asignaturas: [],
      });
    }
    const grupo = gruposMap.get(gid);
    let asig = grupo.asignaturas.find((x) => x.asignatura_id === Number(ex.asignatura_id));
    if (!asig) {
      asig = {
        asignatura_id: Number(ex.asignatura_id),
        curso_nombre: String(ex.curso_nombre || '').trim() || '—',
        docente_nombre: nombrePersona(ex.docente_apellidos, ex.docente_nombres),
        examenes: [],
      };
      grupo.asignaturas.push(asig);
    }
    asig.examenes.push({
      examen_id: eid,
      titulo: String(ex.titulo || '').trim() || 'Examen',
      tipo: String(ex.tipo || 'VIRTUAL').trim() || 'VIRTUAL',
      estado: String(ex.estado || '').trim() || '—',
      fecha_desde: fmtFechaUi(ex.fecha_desde),
      fecha_hasta: fmtFechaUi(ex.fecha_hasta),
      total_alumnos: lista.length,
      rendidos,
      pendientes: lista.length - rendidos,
      promedio: promedioExamen,
      alumnos: lista,
    });
  }

  const grupos = [...gruposMap.values()].sort(compararGrupos);
  grupos.forEach((g) => {
    g.asignaturas.sort((a, b) =>
      String(a.curso_nombre).localeCompare(String(b.curso_nombre), 'es', { sensitivity: 'base' })
    );
  });

  const promedioGeneral = puntajes.length
    ? Math.round((puntajes.reduce((s, n) => s + n, 0) / puntajes.length) * 100) / 100
    : null;

  return {
    ok: true,
    colegio_nombre: colegioNombre,
    titulo,
    subtitulo,
    anio,
    bimestre,
    bimestre_label: bimLabel,
    desde,
    hasta,
    kpis: {
      total_examenes: examenes.length,
      examenes_rendidos: totalRendidosExamenes,
      examenes_sin_rendir: examenesSinRendir,
      alumnos_rindieron: alumnosUnicosRindieron.size,
      promedio_general: promedioGeneral,
    },
    grupos,
  };
}

function pintarFilaExcel(row, cols, { fill, leftUntil = 4 }) {
  for (let c = 1; c <= cols; c += 1) {
    estiloCuerpo(row.getCell(c), {
      fill,
      align: c <= leftUntil ? 'left' : 'center',
      wrap: c <= 4,
    });
  }
}

async function generarExcelExamenesVirtuales(colegioId, filtros) {
  const data = await obtenerExamenesVirtuales(colegioId, filtros);
  if (!data.ok) return data;

  const wb = new ExcelJS.Workbook();
  wb.creator = await marcaCreadorExcel(colegioId);
  wb.created = new Date();
  const cols = 10;
  const k = data.kpis || {};

  const wsRes = wb.addWorksheet('Resumen', { views: [{ showGridLines: false }] });
  wsRes.columns = [
    { width: 26 },
    { width: 22 },
    { width: 26 },
    { width: 34 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 11 },
    { width: 12 },
    { width: 11 },
  ];

  let r = escribirTitulo(wsRes, {
    cols,
    titulo: data.titulo,
    subtitulo: `${data.colegio_nombre}  ·  ${data.subtitulo}`,
  });
  r = escribirKpisFila(wsRes, {
    startRow: r,
    cols,
    pares: [
      ['Publicados', k.total_examenes ?? 0],
      ['Con rendición', k.examenes_rendidos ?? 0],
      ['Sin rendir', k.examenes_sin_rendir ?? 0],
      ['Alumnos', k.alumnos_rindieron ?? 0],
      ['Promedio', k.promedio_general != null ? k.promedio_general : '—'],
    ],
  });

  const headerRes = r;
  escribirCabecera(wsRes.getRow(r), [
    'Grupo',
    'Asignatura',
    'Docente',
    'Examen',
    'Estado',
    'Desde',
    'Hasta',
    'Rendidos',
    'Pendientes',
    'Promedio',
  ]);
  r += 1;

  (data.grupos || []).forEach((g) => {
    (g.asignaturas || []).forEach((asig) => {
      (asig.examenes || []).forEach((ex, idx) => {
        const row = wsRes.getRow(r);
        row.values = [
          g.etiqueta,
          asig.curso_nombre,
          asig.docente_nombre,
          ex.titulo,
          ex.estado,
          ex.fecha_desde,
          ex.fecha_hasta,
          ex.rendidos,
          ex.pendientes,
          ex.promedio != null ? ex.promedio : '—',
        ];
        row.height = 20;
        pintarFilaExcel(row, cols, {
          fill: ex.rendidos === 0 ? FILL_NO_RENDIO : idx % 2 === 1 ? FILL_FILA_PAR : FILL_FILA_IMPAR,
        });
        r += 1;
      });
    });
  });
  finalizarHoja(wsRes, { headerRow: headerRes, cols, lastRow: Math.max(headerRes, r - 1) });

  const wsNotas = wb.addWorksheet('Notas por alumno', { views: [{ showGridLines: false }] });
  wsNotas.columns = [
    { width: 26 },
    { width: 22 },
    { width: 26 },
    { width: 34 },
    { width: 32 },
    { width: 14 },
    { width: 12 },
    { width: 11 },
    { width: 11 },
    { width: 12 },
  ];
  let rn = escribirTitulo(wsNotas, {
    cols,
    titulo: `${data.titulo} — LISTA DE NOTAS`,
    subtitulo: `${data.colegio_nombre}  ·  ${data.subtitulo}`,
  });
  const headerNotas = rn;
  escribirCabecera(wsNotas.getRow(rn), [
    'Grupo',
    'Asignatura',
    'Docente',
    'Examen',
    'Alumno',
    'Estado',
    'Fecha',
    'Puntaje',
    'Correctas',
    'Incorrectas',
  ]);
  rn += 1;

  (data.grupos || []).forEach((g) => {
    (g.asignaturas || []).forEach((asig) => {
      (asig.examenes || []).forEach((ex) => {
        (ex.alumnos || []).forEach((al, idx) => {
          const row = wsNotas.getRow(rn);
          row.values = [
            g.etiqueta,
            asig.curso_nombre,
            asig.docente_nombre,
            ex.titulo,
            al.alumno_nombre,
            al.estado,
            al.fecha,
            al.puntaje != null ? al.puntaje : '—',
            al.correctas != null ? al.correctas : '—',
            al.incorrectas != null ? al.incorrectas : '—',
          ];
          row.height = 18;
          pintarFilaExcel(row, cols, {
            fill: !al.rindio ? FILL_NO_RENDIO : idx % 2 === 1 ? FILL_FILA_PAR : FILL_FILA_IMPAR,
            leftUntil: 5,
          });
          rn += 1;
        });
      });
    });
  });
  finalizarHoja(wsNotas, { headerRow: headerNotas, cols, lastRow: Math.max(headerNotas, rn - 1) });

  const buffer = await wb.xlsx.writeBuffer();
  const bim = data.bimestre_label || 'todos';
  return {
    ok: true,
    buffer,
    filename: `examenes_virtuales_b${bim}_${data.anio}.xlsx`,
  };
}

module.exports = {
  obtenerExamenesVirtuales,
  generarExcelExamenesVirtuales,
};
