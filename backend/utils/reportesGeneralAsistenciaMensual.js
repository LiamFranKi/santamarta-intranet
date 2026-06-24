/**
 * Reporte «Mensual de Asistencia» (admin reportes general).
 */
const moment = require('moment-timezone');
const { query } = require('./mysql');
const { sqlMatriculaEstadoSoloRegular } = require('./matriculaEstados');
const { resolverGrupoId, etiquetaGradoTitulo } = require('./listaAlumnosMatriculadosReporte');

const DIAS_SEM_EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const MESES_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const TIPO_CODIGO = {
  PRESENTE: 'P',
  FALTA: 'F',
  TARDANZA: 'T',
  TARDANZA_JUSTIFICADA: 'TJ',
  FALTA_JUSTIFICADA: 'FJ',
};

function nombreAlumnoLista(row) {
  const ap = [row.apellido_paterno, row.apellido_materno]
    .filter((x) => x != null && String(x).trim())
    .join(' ')
    .trim();
  const nom = String(row.nombres || '').trim();
  if (ap && nom) return `${ap}, ${nom}`;
  return ap || nom || '—';
}

function diasLaborablesMes(anio, mes) {
  const dias = [];
  const start = moment.tz({ year: anio, month: mes - 1, day: 1 }, 'America/Lima');
  const end = start.clone().endOf('month');
  const cur = start.clone();
  while (cur.isSameOrBefore(end, 'day')) {
    const dow = cur.day();
    if (dow >= 1 && dow <= 5) {
      dias.push({
        fecha: cur.format('YYYY-MM-DD'),
        dia_semana: DIAS_SEM_EN[dow],
        dia_numero: cur.date(),
      });
    }
    cur.add(1, 'day');
  }
  return dias;
}

function buildTituloAsistencia(grupo) {
  const gl = etiquetaGradoTitulo(grupo.nivel_nombre, grupo.grado);
  const sec = String(grupo.seccion || '').trim().toUpperCase();
  const left = [gl, sec].filter(Boolean).join(' ');
  return left ? `REPORTE DE ASISTENCIA - ${left}` : 'REPORTE DE ASISTENCIA';
}

function codigoTipoAsistencia(tipo) {
  if (!tipo) return '';
  const t = String(tipo).toUpperCase().trim();
  if (TIPO_CODIGO[t]) return TIPO_CODIGO[t];
  if (t === 'P' || t.includes('PRESENT')) return 'P';
  if (t === 'F' || t.includes('FALT')) return t.includes('JUST') ? 'FJ' : 'F';
  if (t === 'T' || t.includes('TARD')) return t.includes('JUST') ? 'TJ' : 'T';
  return '';
}

async function cargarMapaAsistenciasMes(colegioId, grupoId, fechaInicio, fechaFin) {
  const mapaAsist = {};
  const asistRows = await query(
    `SELECT
       m_actual.id AS matricula_id,
       DATE_FORMAT(ma.fecha, '%Y-%m-%d') AS fecha,
       ma.tipo
     FROM matriculas_asistencias ma
     INNER JOIN matriculas m_reg ON m_reg.id = ma.matricula_id AND m_reg.colegio_id = ?
     INNER JOIN matriculas m_actual ON m_actual.alumno_id = m_reg.alumno_id
       AND m_actual.grupo_id = ? AND m_actual.colegio_id = ?
     WHERE DATE(ma.fecha) >= DATE(?) AND DATE(ma.fecha) <= DATE(?)
       AND ${sqlMatriculaEstadoSoloRegular('m_actual')}`,
    [colegioId, grupoId, colegioId, fechaInicio, fechaFin]
  );

  for (const row of asistRows || []) {
    const f = String(row.fecha || '').slice(0, 10);
    if (!f) continue;
    const key = `${row.matricula_id}|${f}`;
    const cod = codigoTipoAsistencia(row.tipo);
    if (cod) mapaAsist[key] = cod;
  }
  return mapaAsist;
}

async function obtenerAsistenciaMensual(colegioId, filtros) {
  const anio = parseInt(filtros.anio, 10);
  const mes = parseInt(filtros.mes, 10);
  const nivelId = parseInt(filtros.nivelId, 10);
  const grado = parseInt(filtros.grado, 10);
  const seccion = String(filtros.seccion || '').trim();
  const turnoId = parseInt(filtros.turnoId, 10);
  const sedeId = filtros.sedeId != null ? parseInt(filtros.sedeId, 10) : null;

  if (!Number.isFinite(anio) || !Number.isFinite(mes) || mes < 1 || mes > 12) {
    return { ok: false, status: 400, error: 'Indique año y mes válidos.' };
  }
  if (!Number.isFinite(nivelId) || !Number.isFinite(grado) || !seccion || !Number.isFinite(turnoId)) {
    return { ok: false, status: 400, error: 'Parámetros incompletos: nivel, grado, sección y turno.' };
  }

  const res = await resolverGrupoId(colegioId, {
    anio,
    nivelId,
    grado,
    seccion,
    turnoId,
    sedeId: Number.isFinite(sedeId) ? sedeId : null,
  });
  if (res.error === 'not_found') {
    return { ok: false, status: 404, error: 'No se encontró el grupo con esos filtros.' };
  }
  if (res.error === 'duplicate') {
    return { ok: false, status: 409, error: 'Hay más de un grupo que coincide. Refine sede o datos.' };
  }

  const grupo = res.grupo;
  const columnas = diasLaborablesMes(anio, mes);
  const mesNombre = MESES_ES[mes - 1] || String(mes);

  const matriculas = await query(
    `SELECT m.id AS matricula_id,
            a.apellido_paterno, a.apellido_materno, a.nombres
     FROM matriculas m
     INNER JOIN alumnos a ON a.id = m.alumno_id AND a.colegio_id = m.colegio_id
     WHERE m.grupo_id = ? AND m.colegio_id = ? AND ${sqlMatriculaEstadoSoloRegular('m')}
     ORDER BY a.apellido_paterno ASC, a.apellido_materno ASC, a.nombres ASC`,
    [grupo.id, colegioId]
  );

  const mapaAsist = {};
  if (matriculas.length && columnas.length) {
    const fechaInicio = columnas[0].fecha;
    const fechaFin = columnas[columnas.length - 1].fecha;
    Object.assign(
      mapaAsist,
      await cargarMapaAsistenciasMes(colegioId, grupo.id, fechaInicio, fechaFin)
    );
  }

  const filas = (matriculas || []).map((m) => {
    const marcas = columnas.map((col) => mapaAsist[`${m.matricula_id}|${col.fecha}`] || '');
    return {
      matricula_id: m.matricula_id,
      alumno_nombre: nombreAlumnoLista(m),
      marcas,
    };
  });

  return {
    ok: true,
    grupo_id: grupo.id,
    titulo: buildTituloAsistencia(grupo),
    subtitulo: `Mes de ${mesNombre} - ${anio}`,
    anio,
    mes,
    mes_nombre: mesNombre,
    columnas,
    filas,
    total: filas.length,
  };
}

module.exports = {
  obtenerAsistenciaMensual,
  diasLaborablesMes,
  codigoTipoAsistencia,
  MESES_ES,
};
