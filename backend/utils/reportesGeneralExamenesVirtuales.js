/**
 * Reporte «Exámenes virtuales» — aula virtual por bimestre (modal + Excel).
 */
const ExcelJS = require('exceljs');
const { query } = require('./mysql');
const { sqlMatriculaEstadoSoloRegular } = require('./matriculaEstados');
const {
  columnExists,
  etiquetaGradoTitulo,
  ordenNivelEducativoNombre,
} = require('./listaAlumnosMatriculadosReporte');

const BIM_LABEL = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' };
const FILL_TITULO = 'FF1E40AF';
const FILL_CABECERA = 'FFDBEAFE';
const FILL_FILA_PAR = 'FFF8FAFC';
const FILL_NO_RENDIO = 'FFFEF2F2';
const BORDER_THIN = { style: 'thin', color: { argb: 'FFCBD5E1' } };

function isoFecha(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    if (y < 1000) return null;
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || s.startsWith('0000')) return null;
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

function examenEnRango(ex, desde, hasta) {
  if (!desde && !hasta) return true;
  const fd = isoFecha(ex.fecha_desde);
  const fh = isoFecha(ex.fecha_hasta);
  if (!fd && !fh) return true;
  const start = fd || '0001-01-01';
  const end = fh || '9999-12-31';
  if (desde && end < desde) return false;
  if (hasta && start > hasta) return false;
  return true;
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

function aplicarBordeFila(row, colCount) {
  for (let c = 1; c <= colCount; c += 1) {
    row.getCell(c).border = {
      top: BORDER_THIN,
      left: BORDER_THIN,
      bottom: BORDER_THIN,
      right: BORDER_THIN,
    };
  }
}

async function obtenerExamenesVirtuales(colegioId, filtros) {
  const anio = parseInt(filtros.anio, 10);
  const bimestre = parseInt(filtros.bimestre, 10);
  const sedeId = filtros.sedeId != null ? parseInt(filtros.sedeId, 10) : NaN;
  const desde = validarFechaISO(filtros.desde) ? String(filtros.desde).trim() : null;
  const hasta = validarFechaISO(filtros.hasta) ? String(filtros.hasta).trim() : null;

  if (!Number.isFinite(anio) || anio < 2000) {
    return { ok: false, status: 400, error: 'Indique un año válido.' };
  }
  if (!Number.isFinite(bimestre) || bimestre < 1 || bimestre > 4) {
    return { ok: false, status: 400, error: 'Seleccione un bimestre válido.' };
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
      ae.fecha_desde,
      ae.fecha_hasta,
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
      AND ae.ciclo = ?
      AND (ae.tipo IS NULL OR ae.tipo <> 'PDF')`;
  const params = [colegioId, colegioId, anio, bimestre];
  if (hasSede && Number.isFinite(sedeId)) {
    sql += ' AND g.sede_id = ?';
    params.push(sedeId);
  }
  sql += ' ORDER BY n.nombre ASC, CAST(g.grado AS UNSIGNED) ASC, g.seccion ASC, c.nombre ASC, ae.id ASC';

  const examenesRaw = await query(sql, params);
  const examenes = (examenesRaw || []).filter((ex) => examenEnRango(ex, desde, hasta));

  const [colegioRow] = await query(
    'SELECT nombre FROM colegios WHERE id = ? LIMIT 1',
    [colegioId]
  );
  const colegioNombre = String(colegioRow?.nombre || '').trim() || 'Colegio';
  const bimLabel = BIM_LABEL[bimestre] || String(bimestre);
  const rangoTxt = (() => {
    if (!desde && !hasta) return 'Todo el bimestre';
    const d = desde ? fmtFechaUi(desde) : 'inicio';
    const h = hasta ? fmtFechaUi(hasta) : 'fin';
    return `${d} — ${h}`;
  })();

  const titulo = `EXÁMENES VIRTUALES — BIMESTRE ${bimLabel} · ${anio}`;
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
              aep.estado, aep.fecha_hora
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

async function generarExcelExamenesVirtuales(colegioId, filtros) {
  const data = await obtenerExamenesVirtuales(colegioId, filtros);
  if (!data.ok) return data;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'VanguardNet';
  const wsRes = wb.addWorksheet('Resumen', { views: [{ showGridLines: true }] });
  wsRes.columns = [
    { width: 28 },
    { width: 22 },
    { width: 28 },
    { width: 36 },
    { width: 12 },
    { width: 16 },
    { width: 16 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
  ];

  let r = 1;
  wsRes.mergeCells(`A${r}:J${r}`);
  const tCell = wsRes.getCell(`A${r}`);
  tCell.value = data.titulo;
  tCell.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
  tCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_TITULO } };
  tCell.alignment = { horizontal: 'center', vertical: 'middle' };
  wsRes.getRow(r).height = 22;
  r += 1;
  wsRes.mergeCells(`A${r}:J${r}`);
  wsRes.getCell(`A${r}`).value = `${data.colegio_nombre}  ·  ${data.subtitulo}`;
  wsRes.getCell(`A${r}`).font = { italic: true, size: 10, color: { argb: 'FF1E3A8A' } };
  r += 2;

  const k = data.kpis || {};
  const kpiPairs = [
    ['Exámenes publicados', k.total_examenes],
    ['Con al menos un alumno que rindió', k.examenes_rendidos],
    ['Sin rendir', k.examenes_sin_rendir],
    ['Alumnos que rindieron', k.alumnos_rindieron],
    ['Promedio general', k.promedio_general != null ? k.promedio_general : '—'],
  ];
  kpiPairs.forEach(([label, val]) => {
    wsRes.getCell(`A${r}`).value = label;
    wsRes.getCell(`A${r}`).font = { bold: true };
    wsRes.getCell(`B${r}`).value = val;
    r += 1;
  });
  r += 1;

  const headRes = wsRes.getRow(r);
  headRes.values = [
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
  ];
  for (let c = 1; c <= 10; c += 1) {
    const cell = headRes.getCell(c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_CABECERA } };
    cell.font = { bold: true, size: 9, color: { argb: 'FF1E3A8A' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  }
  aplicarBordeFila(headRes, 10);
  r += 1;

  (data.grupos || []).forEach((g) => {
    (g.asignaturas || []).forEach((asig) => {
      (asig.examenes || []).forEach((ex) => {
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
        for (let c = 1; c <= 10; c += 1) {
          const cell = row.getCell(c);
          cell.font = { size: 9 };
          cell.alignment = { vertical: 'middle', horizontal: c <= 4 ? 'left' : 'center' };
          if (ex.rendidos === 0) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_NO_RENDIO } };
          }
        }
        aplicarBordeFila(row, 10);
        r += 1;
      });
    });
  });

  const wsNotas = wb.addWorksheet('Notas por alumno', { views: [{ showGridLines: true }] });
  wsNotas.columns = [
    { width: 28 },
    { width: 22 },
    { width: 28 },
    { width: 36 },
    { width: 36 },
    { width: 14 },
    { width: 14 },
    { width: 12 },
    { width: 12 },
    { width: 14 },
  ];
  let rn = 1;
  wsNotas.mergeCells(`A${rn}:J${rn}`);
  const nt = wsNotas.getCell(`A${rn}`);
  nt.value = `${data.titulo} — LISTA DE NOTAS`;
  nt.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
  nt.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_TITULO } };
  nt.alignment = { horizontal: 'center', vertical: 'middle' };
  wsNotas.getRow(rn).height = 22;
  rn += 1;

  const headN = wsNotas.getRow(rn);
  headN.values = [
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
  ];
  for (let c = 1; c <= 10; c += 1) {
    const cell = headN.getCell(c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_CABECERA } };
    cell.font = { bold: true, size: 9, color: { argb: 'FF1E3A8A' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  }
  aplicarBordeFila(headN, 10);
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
            al.puntaje != null ? al.puntaje : '',
            al.correctas != null ? al.correctas : '',
            al.incorrectas != null ? al.incorrectas : '',
          ];
          for (let c = 1; c <= 10; c += 1) {
            const cell = row.getCell(c);
            cell.font = { size: 9 };
            cell.alignment = { vertical: 'middle', horizontal: c <= 5 ? 'left' : 'center' };
            if (!al.rindio) {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_NO_RENDIO } };
            } else if (idx % 2 === 1) {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_FILA_PAR } };
            }
          }
          aplicarBordeFila(row, 10);
          rn += 1;
        });
      });
    });
  });

  const buffer = await wb.xlsx.writeBuffer();
  const bim = data.bimestre_label || data.bimestre;
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
