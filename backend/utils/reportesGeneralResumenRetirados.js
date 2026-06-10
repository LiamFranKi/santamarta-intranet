/**
 * Resumen matriculados y lista retirados (Reportes → General).
 */
const { query } = require('./mysql');
const { MATRICULA_ESTADO } = require('./matriculaEstados');
const {
  ordenNivelEducativoNombre,
  buildTituloGrupo,
  normalizarSexoConteo,
  columnExists,
} = require('./listaAlumnosMatriculadosReporte');

function nombreAlumnoLista(row) {
  const ap = [row.apellido_paterno, row.apellido_materno]
    .filter((x) => x != null && String(x).trim())
    .join(' ')
    .trim();
  const nom = String(row.nombres || '').trim();
  if (ap && nom) return `${ap}, ${nom}`;
  return ap || nom || '—';
}

async function listarGruposSedeAnio(colegioId, { anio, sedeId }) {
  const hasSede = await columnExists('grupos', 'sede_id');
  let sql = `SELECT g.id, g.anio, g.grado, g.seccion, g.nivel_id, n.nombre AS nivel_nombre, t.nombre AS turno_nombre
    FROM grupos g
    LEFT JOIN niveles n ON n.id = g.nivel_id
    LEFT JOIN turnos t ON t.id = g.turno_id
    WHERE g.colegio_id = ? AND g.anio = ?`;
  const params = [colegioId, anio];
  if (hasSede && Number.isFinite(sedeId)) {
    sql += ' AND g.sede_id = ?';
    params.push(sedeId);
  }
  sql += ' ORDER BY g.nivel_id ASC, g.grado ASC, g.seccion ASC, t.nombre ASC';
  const rows = await query(sql, params);
  return [...(rows || [])].sort((a, b) => {
    const oa = ordenNivelEducativoNombre(a.nivel_nombre);
    const ob = ordenNivelEducativoNombre(b.nivel_nombre);
    if (oa !== ob) return oa - ob;
    const ga = parseInt(a.grado, 10) || 0;
    const gb = parseInt(b.grado, 10) || 0;
    if (ga !== gb) return ga - gb;
    const sc = String(a.seccion || '').localeCompare(String(b.seccion || ''), 'es');
    if (sc !== 0) return sc;
    return String(a.turno_nombre || '').localeCompare(String(b.turno_nombre || ''), 'es');
  });
}

async function conteosPorGrupo(colegioId, grupoIds, estadoMatricula) {
  if (!grupoIds.length) return new Map();
  const ph = grupoIds.map(() => '?').join(',');
  const rows = await query(
    `SELECT m.grupo_id, a.sexo
     FROM matriculas m
     INNER JOIN alumnos a ON a.id = m.alumno_id AND a.colegio_id = m.colegio_id
     WHERE m.colegio_id = ? AND m.grupo_id IN (${ph}) AND m.estado = ?`,
    [colegioId, ...grupoIds, estadoMatricula]
  );
  const map = new Map();
  for (const gid of grupoIds) {
    map.set(gid, { hombres: 0, mujeres: 0, total: 0 });
  }
  for (const r of rows || []) {
    const gid = r.grupo_id;
    if (!map.has(gid)) map.set(gid, { hombres: 0, mujeres: 0, total: 0 });
    const bucket = map.get(gid);
    bucket.total += 1;
    const sx = normalizarSexoConteo(r.sexo);
    if (sx === 'M') bucket.hombres += 1;
    else if (sx === 'F') bucket.mujeres += 1;
  }
  return map;
}

function nivelClave(nombre) {
  const n = String(nombre || '').toLowerCase();
  if (n.includes('inicial')) return 'INICIAL';
  if (n.includes('primaria')) return 'PRIMARIA';
  if (n.includes('secundaria')) return 'SECUNDARIA';
  return String(nombre || 'OTROS').toUpperCase();
}

async function obtenerResumenMatriculados(colegioId, { anio, sedeId }) {
  const grupos = await listarGruposSedeAnio(colegioId, { anio, sedeId });
  const ids = grupos.map((g) => g.id);
  const conteos = await conteosPorGrupo(colegioId, ids, MATRICULA_ESTADO.REGULAR);

  const seccionesMap = new Map();
  const ordenSecciones = ['INICIAL', 'PRIMARIA', 'SECUNDARIA'];

  for (const g of grupos) {
    const clave = nivelClave(g.nivel_nombre);
    if (!seccionesMap.has(clave)) {
      seccionesMap.set(clave, { nivel: clave, filas: [], totales: { hombres: 0, mujeres: 0, total: 0 } });
    }
    const c = conteos.get(g.id) || { hombres: 0, mujeres: 0, total: 0 };
    const fila = {
      grupo: buildTituloGrupo(g),
      hombres: c.hombres,
      mujeres: c.mujeres,
      total: c.total,
    };
    const sec = seccionesMap.get(clave);
    sec.filas.push(fila);
    sec.totales.hombres += c.hombres;
    sec.totales.mujeres += c.mujeres;
    sec.totales.total += c.total;
  }

  const secciones = [];
  for (const key of ordenSecciones) {
    if (seccionesMap.has(key)) secciones.push(seccionesMap.get(key));
  }
  for (const [key, sec] of seccionesMap) {
    if (!ordenSecciones.includes(key)) secciones.push(sec);
  }

  const total_general = { hombres: 0, mujeres: 0, total: 0 };
  for (const sec of secciones) {
    total_general.hombres += sec.totales.hombres;
    total_general.mujeres += sec.totales.mujeres;
    total_general.total += sec.totales.total;
  }

  return { anio, secciones, total_general };
}

async function obtenerListaRetirados(colegioId, { anio, sedeId, nivelId }) {
  const hasSede = await columnExists('grupos', 'sede_id');
  let sql = `
    SELECT
      a.apellido_paterno,
      a.apellido_materno,
      a.nombres,
      NULLIF(TRIM(a.nro_documento), '') AS nro_documento,
      g.grado,
      g.seccion,
      g.anio,
      n.nombre AS nivel_nombre,
      n.id AS nivel_id,
      t.nombre AS turno_nombre
    FROM matriculas m
    INNER JOIN alumnos a ON a.id = m.alumno_id AND a.colegio_id = m.colegio_id
    INNER JOIN grupos g ON g.id = m.grupo_id AND g.colegio_id = m.colegio_id
    LEFT JOIN niveles n ON n.id = g.nivel_id
    LEFT JOIN turnos t ON t.id = g.turno_id
    WHERE m.colegio_id = ? AND g.anio = ? AND m.estado = ?`;
  const params = [colegioId, anio, MATRICULA_ESTADO.RETIRADO];
  if (hasSede && Number.isFinite(sedeId)) {
    sql += ' AND g.sede_id = ?';
    params.push(sedeId);
  }
  if (Number.isFinite(nivelId)) {
    sql += ' AND g.nivel_id = ?';
    params.push(nivelId);
  }
  sql += ` ORDER BY n.nombre ASC, g.grado ASC, g.seccion ASC,
    a.apellido_paterno ASC, a.apellido_materno ASC, a.nombres ASC`;

  const rows = await query(sql, params);
  const filas = (rows || []).map((r) => ({
    alumno_nombre: nombreAlumnoLista(r),
    grado_seccion: buildTituloGrupo(r),
    nro_documento: r.nro_documento || '—',
    nivel_nombre: r.nivel_nombre || '',
  }));

  let nivel_etiqueta = 'TODOS';
  if (Number.isFinite(nivelId)) {
    const [nRow] = await query('SELECT nombre FROM niveles WHERE id = ? AND colegio_id = ? LIMIT 1', [
      nivelId,
      colegioId,
    ]);
    nivel_etiqueta = nRow?.nombre || 'Nivel';
  }

  return {
    anio,
    nivel_etiqueta,
    filas,
    total: filas.length,
  };
}

module.exports = {
  obtenerResumenMatriculados,
  obtenerListaRetirados,
};
