/**
 * Datos para reporte «Lista de alumnos matriculados» (admin reportes general).
 */
const { query } = require('./mysql');
const { sqlMatriculaEstadoSoloRegular } = require('./matriculaEstados');

function ordenNivelEducativoNombre(nombre) {
  const n = String(nombre || '').toLowerCase();
  if (n.includes('inicial')) return 1;
  if (n.includes('primaria')) return 2;
  if (n.includes('secundaria')) return 3;
  return 9;
}

function compararNivelGradoApellido(a, b) {
  const oa = ordenNivelEducativoNombre(a.nivel_nombre);
  const ob = ordenNivelEducativoNombre(b.nivel_nombre);
  if (oa !== ob) return oa - ob;
  const nid = (parseInt(a.nivel_id, 10) || 0) - (parseInt(b.nivel_id, 10) || 0);
  if (nid !== 0) return nid;
  const gd = (parseInt(a.grado, 10) || 0) - (parseInt(b.grado, 10) || 0);
  if (gd !== 0) return gd;
  const sc = String(a.seccion || '').localeCompare(String(b.seccion || ''), 'es', {
    sensitivity: 'base',
  });
  if (sc !== 0) return sc;
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

function etiquetaGradoTitulo(nivelNombre, grado) {
  const n = String(nivelNombre || '').toLowerCase();
  const g = grado != null && grado !== '' ? String(grado).trim() : '';
  if (!g) return '';
  if (n.includes('inicial')) return `${g} AÑOS`;
  return `${g}°`;
}

function buildTituloGrupo(row) {
  const parts = [];
  const nivel = String(row.nivel_nombre || '').trim();
  if (nivel) parts.push(nivel.toUpperCase());
  const gl = etiquetaGradoTitulo(row.nivel_nombre, row.grado);
  if (gl) parts.push(gl.toUpperCase());
  const sec = String(row.seccion || '').trim();
  if (sec) parts.push(sec.toUpperCase());
  const turno = String(row.turno_nombre || '').trim();
  if (turno) parts.push(turno.toUpperCase());
  if (row.anio != null && row.anio !== '') parts.push(String(row.anio));
  return parts.join(' - ');
}

function nombreAlumnoLista(row) {
  const ap = [row.apellido_paterno, row.apellido_materno].filter((x) => x != null && String(x).trim()).join(' ').trim();
  const nom = String(row.nombres || '').trim();
  if (ap && nom) return `${ap}, ${nom}`;
  return ap || nom || '—';
}

function nombreApoderadoLista(row) {
  const p = [
    row.apoderado_apellido_paterno,
    row.apoderado_apellido_materno,
    row.apoderado_nombres,
  ]
    .filter((x) => x != null && String(x).trim())
    .map((x) => String(x).trim())
    .join(' ');
  return p || '—';
}

function normalizarSexoConteo(sexo) {
  const n = parseInt(sexo, 10);
  if (n === 1) return 'F';
  if (n === 2) return 'M';
  if (n === 0) return 'M';
  const s = String(sexo ?? '').toUpperCase();
  if (s.includes('FEM') || s === 'F') return 'F';
  if (s.includes('MASC') || s === 'M') return 'M';
  return null;
}

function calcularTotales(filas) {
  let hombres = 0;
  let mujeres = 0;
  for (const f of filas || []) {
    const sx = normalizarSexoConteo(f.sexo);
    if (sx === 'M') hombres += 1;
    else if (sx === 'F') mujeres += 1;
  }
  return { hombres, mujeres, total: (filas || []).length };
}

async function columnExists(table, col) {
  const rows = await query(
    `SELECT 1 AS ok FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [table, col]
  );
  return Array.isArray(rows) && rows.length > 0;
}

function mapFilaLista(row, index) {
  return {
    n: index + 1,
    alumno_nombre: nombreAlumnoLista(row),
    alumno_dni: row.alumno_dni || '—',
    apoderado_nombre: nombreApoderadoLista(row),
    apoderado_dni: row.apoderado_dni || '—',
    fecha_nacimiento: row.fecha_nacimiento || '—',
    telefono: row.apoderado_telefono || '—',
    email: row.apoderado_email || '—',
    sexo: row.sexo,
  };
}

async function sqlFilasMatriculadosGrupos(colegioId, grupoIds) {
  if (!grupoIds.length) return [];
  const ph = grupoIds.map(() => '?').join(',');
  const sql = `
    SELECT
      g.id AS grupo_id,
      g.anio,
      g.grado,
      g.seccion,
      n.nombre AS nivel_nombre,
      t.nombre AS turno_nombre,
      a.id AS alumno_id,
      a.apellido_paterno,
      a.apellido_materno,
      a.nombres,
      NULLIF(TRIM(a.nro_documento), '') AS alumno_dni,
      a.fecha_nacimiento,
      a.sexo,
      ap.apellido_paterno AS apoderado_apellido_paterno,
      ap.apellido_materno AS apoderado_apellido_materno,
      ap.nombres AS apoderado_nombres,
      NULLIF(TRIM(ap.nro_documento), '') AS apoderado_dni,
      NULLIF(TRIM(ap.telefono_celular), '') AS apoderado_telefono,
      NULLIF(TRIM(ap.email), '') AS apoderado_email
    FROM matriculas m
    INNER JOIN alumnos a ON a.id = m.alumno_id AND a.colegio_id = m.colegio_id
    INNER JOIN grupos g ON g.id = m.grupo_id AND g.colegio_id = m.colegio_id
    LEFT JOIN niveles n ON n.id = g.nivel_id
    LEFT JOIN turnos t ON t.id = g.turno_id
    LEFT JOIN (
      SELECT f.alumno_id, MIN(f.apoderado_id) AS apoderado_id
      FROM familias f
      GROUP BY f.alumno_id
    ) fam ON fam.alumno_id = a.id
    LEFT JOIN apoderados ap ON ap.id = fam.apoderado_id AND ap.colegio_id = m.colegio_id
    WHERE m.colegio_id = ? AND m.grupo_id IN (${ph}) AND ${sqlMatriculaEstadoSoloRegular('m')}
    ORDER BY g.nivel_id ASC, g.grado ASC, g.seccion ASC, a.apellido_paterno ASC, a.apellido_materno ASC, a.nombres ASC`;
  return query(sql, [colegioId, ...grupoIds]);
}

async function resolverGrupoId(colegioId, { anio, nivelId, grado, seccion, turnoId, sedeId }) {
  const hasSede = await columnExists('grupos', 'sede_id');
  let sql = `SELECT g.id, g.anio, g.grado, g.seccion, g.nivel_id, n.nombre AS nivel_nombre, t.nombre AS turno_nombre
    FROM grupos g
    LEFT JOIN niveles n ON n.id = g.nivel_id
    LEFT JOIN turnos t ON t.id = g.turno_id
    WHERE g.colegio_id = ? AND g.anio = ? AND g.nivel_id = ? AND g.grado = ?
      AND UPPER(TRIM(g.seccion)) = UPPER(?) AND g.turno_id = ?`;
  const params = [colegioId, anio, nivelId, grado, seccion, turnoId];
  if (hasSede && Number.isFinite(sedeId)) {
    sql += ' AND g.sede_id = ?';
    params.push(sedeId);
  }
  sql += ' LIMIT 3';
  const rows = await query(sql, params);
  if (!rows.length) return { error: 'not_found' };
  if (rows.length > 1) return { error: 'duplicate' };
  return { grupo: rows[0] };
}

async function listarGruposFiltro(colegioId, { anio, turnoId, sedeId }) {
  const hasSede = await columnExists('grupos', 'sede_id');
  let sql = `SELECT g.id, g.anio, g.grado, g.seccion, g.nivel_id, n.nombre AS nivel_nombre, t.nombre AS turno_nombre
    FROM grupos g
    LEFT JOIN niveles n ON n.id = g.nivel_id
    LEFT JOIN turnos t ON t.id = g.turno_id
    WHERE g.colegio_id = ? AND g.anio = ? AND g.turno_id = ?`;
  const params = [colegioId, anio, turnoId];
  if (hasSede && Number.isFinite(sedeId)) {
    sql += ' AND g.sede_id = ?';
    params.push(sedeId);
  }
  sql += ' ORDER BY g.nivel_id ASC, g.grado ASC, g.seccion ASC';
  const rows = await query(sql, params);
  return [...(rows || [])].sort((a, b) => {
    const oa = ordenNivelEducativoNombre(a.nivel_nombre);
    const ob = ordenNivelEducativoNombre(b.nivel_nombre);
    if (oa !== ob) return oa - ob;
    const ga = parseInt(a.grado, 10) || 0;
    const gb = parseInt(b.grado, 10) || 0;
    if (ga !== gb) return ga - gb;
    return String(a.seccion || '').localeCompare(String(b.seccion || ''), 'es');
  });
}

function agruparFilasPorGrupo(rawRows, gruposMeta) {
  const buckets = new Map();
  for (const r of rawRows || []) {
    const gid = r.grupo_id;
    if (!buckets.has(gid)) buckets.set(gid, []);
    buckets.get(gid).push(r);
  }
  const bloques = [];
  for (const g of gruposMeta || []) {
    const raw = buckets.get(g.id) || [];
    const filas = raw.map((row, i) => mapFilaLista(row, i));
    bloques.push({
      grupo_id: g.id,
      titulo: buildTituloGrupo(g),
      filas,
      totales: calcularTotales(raw),
    });
  }
  return bloques.filter((b) => b.filas.length > 0);
}

async function obtenerListaUnGrupo(colegioId, filtros) {
  const res = await resolverGrupoId(colegioId, filtros);
  if (res.error === 'not_found') {
    return { ok: false, status: 404, error: 'No se encontró el grupo con esos filtros.' };
  }
  if (res.error === 'duplicate') {
    return { ok: false, status: 409, error: 'Hay más de un grupo que coincide. Refine sede o datos.' };
  }
  const grupo = res.grupo;
  const raw = await sqlFilasMatriculadosGrupos(colegioId, [grupo.id]);
  const filas = raw.map((row, i) => mapFilaLista(row, i));
  return {
    ok: true,
    titulo: buildTituloGrupo(grupo),
    grupo_id: grupo.id,
    filas,
    totales: calcularTotales(raw),
  };
}

async function obtenerListaTodosGrupos(colegioId, { anio, turnoId, sedeId }) {
  const grupos = await listarGruposFiltro(colegioId, { anio, turnoId, sedeId });
  if (!grupos.length) {
    return { ok: true, bloques: [], totales_generales: { hombres: 0, mujeres: 0, total: 0 } };
  }
  const ids = grupos.map((g) => g.id);
  const raw = await sqlFilasMatriculadosGrupos(colegioId, ids);
  const bloques = agruparFilasPorGrupo(raw, grupos).filter((b) => b.filas.length > 0);
  let hombres = 0;
  let mujeres = 0;
  let total = 0;
  for (const b of bloques) {
    hombres += b.totales.hombres;
    mujeres += b.totales.mujeres;
    total += b.totales.total;
  }
  return {
    ok: true,
    bloques,
    totales_generales: { hombres, mujeres, total },
  };
}

module.exports = {
  ordenNivelEducativoNombre,
  compararNivelGradoApellido,
  etiquetaGradoTitulo,
  buildTituloGrupo,
  calcularTotales,
  normalizarSexoConteo,
  columnExists,
  resolverGrupoId,
  obtenerListaUnGrupo,
  obtenerListaTodosGrupos,
};
