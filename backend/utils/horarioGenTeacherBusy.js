/**
 * Ocupación de docentes entre niveles (Inicial / Primaria / Secundaria).
 * Cruza por día + solape de hora (los bloque_id difieren entre configs).
 */
const { query } = require('./mysql');

function timeToSec(t) {
  if (!t) return null;
  const s = String(t).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] || 0);
}

function rankEstadoVersion(est) {
  const e = String(est || '').toUpperCase();
  if (e === 'PUBLISHED') return 4;
  if (e === 'APPROVED') return 3;
  if (e === 'REVIEW') return 2;
  if (e === 'DRAFT') return 1;
  return 0;
}

function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
  if (aStart == null || aEnd == null || bStart == null || bEnd == null) return false;
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Mejor versión por nivel (no archivadas, con clases).
 */
async function pickBestVersionsByNivel(colegioId, anio) {
  const versiones = await query(
    `SELECT v.*, n.nombre AS nivel_nombre,
            (SELECT COUNT(*) FROM horario_gen_entradas e WHERE e.version_id = v.id) AS total_entradas
     FROM horario_gen_versiones v
     LEFT JOIN niveles n ON n.id = v.nivel_id
     WHERE v.colegio_id = ? AND v.anio = ? AND v.estado <> 'ARCHIVED'
     ORDER BY v.updated_at DESC, v.id DESC`,
    [colegioId, anio]
  );
  const bestByNivel = new Map();
  for (const v of versiones || []) {
    if (!Number(v.total_entradas || 0)) continue;
    const key = v.nivel_id != null ? Number(v.nivel_id) : `cfg-${v.config_id}`;
    const prev = bestByNivel.get(key);
    if (!prev) {
      bestByNivel.set(key, v);
      continue;
    }
    const rNew = rankEstadoVersion(v.estado);
    const rOld = rankEstadoVersion(prev.estado);
    if (rNew > rOld) bestByNivel.set(key, v);
    else if (rNew === rOld && Number(v.total_entradas) > Number(prev.total_entradas)) {
      bestByNivel.set(key, v);
    }
  }
  return [...bestByNivel.values()];
}

/**
 * Intervalos ocupados del docente en el año (todos los borradores no archivados).
 * Usado en colocación manual.
 */
async function findTeacherClashAcrossYear({
  colegioId,
  anio,
  personalId,
  diaSemana,
  horaInicio,
  horaFin,
  excludeEntradaId = null,
}) {
  if (!personalId || !anio || diaSemana == null) return null;
  let sql = `
    SELECT e.id, g.grado, g.seccion, n.nombre AS nivel_nombre,
           cur.nombre AS curso_nombre, e.texto_libre,
           b.nombre AS bloque_nombre, b.hora_inicio, b.hora_fin,
           v.nombre AS version_nombre, v.estado AS version_estado
    FROM horario_gen_entradas e
    INNER JOIN horario_gen_versiones v ON v.id = e.version_id
    INNER JOIN grupos g ON g.id = e.grupo_id
    LEFT JOIN niveles n ON n.id = g.nivel_id
    LEFT JOIN cursos cur ON cur.id = e.curso_id
    LEFT JOIN horario_gen_carga cg ON cg.id = e.carga_id
    INNER JOIN horario_gen_bloques b ON b.id = e.bloque_id
    WHERE v.colegio_id = ?
      AND v.anio = ?
      AND v.estado <> 'ARCHIVED'
      AND e.dia_semana = ?
      AND COALESCE(e.personal_id, cg.personal_id) = ?
      AND b.hora_inicio < ?
      AND b.hora_fin > ?
  `;
  const params = [colegioId, anio, diaSemana, personalId, horaFin, horaInicio];
  if (excludeEntradaId) {
    sql += ' AND e.id <> ?';
    params.push(excludeEntradaId);
  }
  sql += ' ORDER BY n.nombre, g.grado, g.seccion LIMIT 1';
  const rows = await query(sql, params);
  return rows?.[0] || null;
}

/**
 * Intervalos externos para el solver: ocupación en OTROS niveles
 * (mejor versión de cada nivel distinto al que se genera).
 * @returns {Array<{ personal_id:number, dia:number, startSec:number, endSec:number, label:string }>}
 */
async function loadExternalTeacherIntervals({ colegioId, anio, excludeNivelId = null }) {
  const best = await pickBestVersionsByNivel(colegioId, anio);
  const others = best.filter((v) => {
    if (excludeNivelId == null) return true;
    return Number(v.nivel_id) !== Number(excludeNivelId);
  });
  if (!others.length) return [];

  const ids = others.map((v) => Number(v.id));
  const placeholders = ids.map(() => '?').join(',');
  const rows = await query(
    `SELECT e.dia_semana AS dia,
            COALESCE(e.personal_id, cg.personal_id) AS personal_id,
            b.hora_inicio, b.hora_fin,
            n.nombre AS nivel_nombre, g.grado, g.seccion,
            cur.nombre AS curso_nombre
     FROM horario_gen_entradas e
     INNER JOIN grupos g ON g.id = e.grupo_id
     LEFT JOIN niveles n ON n.id = g.nivel_id
     LEFT JOIN cursos cur ON cur.id = e.curso_id
     LEFT JOIN horario_gen_carga cg ON cg.id = e.carga_id
     INNER JOIN horario_gen_bloques b ON b.id = e.bloque_id
     WHERE e.version_id IN (${placeholders})
       AND COALESCE(e.personal_id, cg.personal_id) IS NOT NULL`,
    ids
  );

  const out = [];
  for (const r of rows || []) {
    const pid = Number(r.personal_id);
    if (!pid) continue;
    const startSec = timeToSec(r.hora_inicio);
    const endSec = timeToSec(r.hora_fin);
    if (startSec == null || endSec == null) continue;
    const label = [r.nivel_nombre, r.grado != null ? `${r.grado}` : null, r.seccion, r.curso_nombre]
      .filter((x) => x !== null && x !== undefined && String(x).trim() !== '')
      .join(' ');
    out.push({
      personal_id: pid,
      dia: Number(r.dia),
      startSec,
      endSec,
      label,
    });
  }
  return out;
}

function isExternalTeacherBusy(externalIntervals, personalId, dia, bloque) {
  if (!personalId || !externalIntervals?.length) return false;
  const startSec = timeToSec(bloque.hora_inicio);
  const endSec = timeToSec(bloque.hora_fin);
  if (startSec == null || endSec == null) return false;
  const pid = Number(personalId);
  const d = Number(dia);
  return externalIntervals.some(
    (iv) =>
      Number(iv.personal_id) === pid &&
      Number(iv.dia) === d &&
      intervalsOverlap(startSec, endSec, iv.startSec, iv.endSec)
  );
}

module.exports = {
  pickBestVersionsByNivel,
  findTeacherClashAcrossYear,
  loadExternalTeacherIntervals,
  isExternalTeacherBusy,
  intervalsOverlap,
  rankEstadoVersion,
};
