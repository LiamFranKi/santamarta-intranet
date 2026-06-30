/**
 * Buscar alumnos por grupo para el módulo Pagos escolares (legado PagosApplication::index).
 */
const { query } = require('./mysql');
const {
  resolverGrupoId,
  buildTituloGrupo,
} = require('./listaAlumnosMatriculadosReporte');
const { sqlMatriculaEstadoSoloRegular } = require('./matriculaEstados');

function nombreAlumnoPagos(row) {
  const ap = [row.apellido_paterno, row.apellido_materno]
    .filter((x) => x != null && String(x).trim())
    .join(' ')
    .trim();
  const nom = String(row.nombres || '').trim();
  if (ap && nom) return `${ap}, ${nom}`;
  return ap || nom || '—';
}

function formatMonto(n) {
  const v = parseFloat(n);
  if (!Number.isFinite(v)) return '0.00';
  return v.toFixed(2);
}

async function buscarAlumnosPagosGrupo(colegioId, filtros) {
  const res = await resolverGrupoId(colegioId, filtros);
  if (res.error === 'not_found') {
    return { ok: false, status: 404, error: 'No se encontró el grupo con esos filtros.' };
  }
  if (res.error === 'duplicate') {
    return { ok: false, status: 409, error: 'Hay más de un grupo que coincide. Refine sede o datos.' };
  }

  const grupo = res.grupo;
  const rows = await query(
    `SELECT
      m.id AS matricula_id,
      a.id AS alumno_id,
      a.apellido_paterno,
      a.apellido_materno,
      a.nombres,
      NULLIF(TRIM(a.nro_documento), '') AS alumno_dni,
      COALESCE(c.matricula, 0) AS costo_matricula,
      COALESCE(c.pension, 0) AS costo_pension
    FROM matriculas m
    INNER JOIN alumnos a ON a.id = m.alumno_id AND a.colegio_id = m.colegio_id
    LEFT JOIN costos c ON c.id = m.costo_id
    WHERE m.colegio_id = ? AND m.grupo_id = ? AND ${sqlMatriculaEstadoSoloRegular('m')}
      AND (m.ocultar IS NULL OR m.ocultar = '' OR UPPER(TRIM(m.ocultar)) = 'NO')
    ORDER BY a.apellido_paterno ASC, a.apellido_materno ASC, a.nombres ASC`,
    [colegioId, grupo.id]
  );

  const monedaRow = await query('SELECT moneda FROM colegios WHERE id = ? LIMIT 1', [colegioId]).catch(
    () => []
  );
  const moneda = (monedaRow && monedaRow[0]?.moneda) || 'S/.';

  const alumnos = (rows || []).map((row) => ({
    alumno_id: row.alumno_id,
    matricula_id: row.matricula_id,
    nombre: nombreAlumnoPagos(row),
    alumno_dni: row.alumno_dni || '',
    costo_matricula: parseFloat(row.costo_matricula) || 0,
    costo_pension: parseFloat(row.costo_pension) || 0,
    costo_texto: `Matrícula: ${moneda} ${formatMonto(row.costo_matricula)} - Pensión ${moneda} ${formatMonto(row.costo_pension)}`,
  }));

  return {
    ok: true,
    titulo: buildTituloGrupo(grupo),
    grupo_id: grupo.id,
    moneda,
    alumnos,
    total: alumnos.length,
  };
}

module.exports = { buscarAlumnosPagosGrupo };
