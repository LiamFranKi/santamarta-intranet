/**
 * Cuadro de resumen de libreta: rangos de bimestre (colegios.rangos_ciclos_notas)
 * y conteo de inasistencias / tardanzas por rango de fechas en matriculas_asistencias.
 */
const phpSerialize = require('php-serialize');

function parseRangosCiclosNotas(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object' && !Buffer.isBuffer(raw)) return raw;
  const s = String(raw).trim();
  if (!s) return null;
  try {
    const u = phpSerialize.unserialize(s);
    if (u && typeof u === 'object') return u;
  } catch (e) {
    /* continuar */
  }
  try {
    const j = JSON.parse(s);
    if (j && typeof j === 'object') return j;
  } catch (e2) {
    /* ignore */
  }
  return null;
}

/**
 * @param {Function} query - mysql helper
 * @param {number} colegio_id
 * @returns {Promise<object|null>}
 */
async function fetchRangosCiclosParsed(query, colegio_id) {
  try {
    const rows = await query('SELECT rangos_ciclos_notas FROM colegios WHERE id = ? LIMIT 1', [colegio_id]);
    if (!rows || rows.length === 0) return null;
    return parseRangosCiclosNotas(rows[0].rangos_ciclos_notas);
  } catch (e) {
    return null;
  }
}

function parseDdMm(str, year) {
  if (!str || typeof str !== 'string') return null;
  const parts = str.trim().split('-');
  if (parts.length < 2) return null;
  const d = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (Number.isNaN(d) || Number.isNaN(m) || m < 1 || m > 12) return null;
  const dt = new Date(year, m - 1, d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function toYmd(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Si no hay rangos en colegio: 4 bloques por meses del año calendario del año escolar (evita repetir el total anual en cada columna). */
function fallbackMesesPorCiclo(ciclo, anio) {
  const periods = {
    1: [`${anio}-01-01`, `${anio}-03-31`],
    2: [`${anio}-04-01`, `${anio}-06-30`],
    3: [`${anio}-07-01`, `${anio}-09-30`],
    4: [`${anio}-10-01`, `${anio}-12-31`],
  };
  const p = periods[ciclo];
  return p ? { desde: p[0], hasta: p[1] } : null;
}

/**
 * @param {object|null} rangosParsed - resultado de parseRangosCiclosNotas / fetchRangosCiclosParsed
 * @param {number} ciclo 1..4
 * @param {number|string} anioEscolar - grupos.anio
 * @returns {{ desde: string, hasta: string }|null} YYYY-MM-DD
 */
function getFechasCicloAsistencia(rangosParsed, ciclo, anioEscolar) {
  const anio = parseInt(anioEscolar, 10);
  if (!Number.isFinite(anio) || ciclo < 1 || ciclo > 4) return null;

  const r = rangosParsed && (rangosParsed[String(ciclo)] || rangosParsed[ciclo]);
  if (r && r.inicio && r.final) {
    const inicio = parseDdMm(String(r.inicio), anio);
    let fin = parseDdMm(String(r.final), anio);
    if (!inicio || !fin) return fallbackMesesPorCiclo(ciclo, anio);
    if (fin < inicio) {
      fin = parseDdMm(String(r.final), anio + 1);
      if (!fin || fin < inicio) return fallbackMesesPorCiclo(ciclo, anio);
    }
    return { desde: toYmd(inicio), hasta: toYmd(fin) };
  }

  return fallbackMesesPorCiclo(ciclo, anio);
}

/**
 * @param {Function} query
 * @param {number} matriculaId
 * @param {number|string} anioGrupo grupos.anio de la matrícula
 * @param {object|null} rangosParsed
 * @param {number} ciclo 1..4
 */
async function contarInasistenciasBimestre(query, matriculaId, anioGrupo, rangosParsed, ciclo) {
  try {
    const fechas = getFechasCicloAsistencia(rangosParsed, ciclo, anioGrupo);
    if (!fechas) return 0;
    const rows = await query(
      `SELECT COUNT(*) as total
       FROM matriculas_asistencias ma
       INNER JOIN matriculas m ON m.id = ma.matricula_id
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE ma.matricula_id = ?
         AND ma.tipo = 'FALTA'
         AND g.anio = ?
         AND DATE(ma.fecha) >= DATE(?)
         AND DATE(ma.fecha) <= DATE(?)`,
      [matriculaId, anioGrupo, fechas.desde, fechas.hasta]
    );
    return rows && rows.length > 0 ? Number(rows[0].total) || 0 : 0;
  } catch (error) {
    console.error('contarInasistenciasBimestre:', error.message);
    return 0;
  }
}

async function contarTardanzasBimestre(query, matriculaId, anioGrupo, rangosParsed, ciclo) {
  try {
    const fechas = getFechasCicloAsistencia(rangosParsed, ciclo, anioGrupo);
    if (!fechas) return 0;
    const rows = await query(
      `SELECT COUNT(*) as total
       FROM matriculas_asistencias ma
       INNER JOIN matriculas m ON m.id = ma.matricula_id
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE ma.matricula_id = ?
         AND ma.tipo = 'TARDANZA'
         AND g.anio = ?
         AND DATE(ma.fecha) >= DATE(?)
         AND DATE(ma.fecha) <= DATE(?)`,
      [matriculaId, anioGrupo, fechas.desde, fechas.hasta]
    );
    return rows && rows.length > 0 ? Number(rows[0].total) || 0 : 0;
  } catch (error) {
    console.error('contarTardanzasBimestre:', error.message);
    return 0;
  }
}

module.exports = {
  parseRangosCiclosNotas,
  fetchRangosCiclosParsed,
  getFechasCicloAsistencia,
  contarInasistenciasBimestre,
  contarTardanzasBimestre,
};
