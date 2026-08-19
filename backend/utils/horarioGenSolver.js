/**
 * Solver piloto — generación automática de horarios (horario_gen_*).
 * Backtracking en memoria + score suave.
 * NO escribe en grupos_horarios.
 */
const { query, execute } = require('./mysql');
const { timeToSec } = require('./horarioGenValidation');

const DIAS = [1, 2, 3, 4, 5];

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function rng() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function grupoSlotKey(grupoId, dia, bloqueId) {
  return `${grupoId}:${dia}:${bloqueId}`;
}

function teacherSlotKey(personalId, dia, bloqueId) {
  return `${personalId}:${dia}:${bloqueId}`;
}

function isTeacherAvailable(dispByTeacherDay, personalId, dia, bloque) {
  if (!personalId) return true;
  const d = dispByTeacherDay.get(`${personalId}:${dia}`);
  if (!d) return true;
  if (d.estado === 'UNAVAILABLE') return false;
  const bStart = timeToSec(bloque.hora_inicio);
  const bEnd = timeToSec(bloque.hora_fin);
  if (d.estado === 'AVAILABLE' || d.estado === 'CUSTOM_INTERVAL') {
    const from = timeToSec(d.hora_desde);
    const until = timeToSec(d.hora_hasta);
    if (from == null || until == null) return true;
    return bStart >= from && bEnd <= until;
  }
  if (d.estado === 'AVAILABLE_UNTIL') {
    const until = timeToSec(d.hora_hasta);
    return until == null || bEnd <= until;
  }
  if (d.estado === 'AVAILABLE_FROM') {
    const from = timeToSec(d.hora_desde);
    return from == null || bStart >= from;
  }
  return true;
}

function scoreSolution(placements, classBlocks) {
  let distributionPenalty = 0;
  let latePenalty = 0;
  let gapPenalty = 0;
  const byCargaDay = new Map();
  const byTeacherDayBlocks = new Map();
  const lastOrden = Math.max(...classBlocks.map((b) => Number(b.orden) || 0), 1);

  for (const p of placements) {
    const k = `${p.carga_id}:${p.dia}`;
    byCargaDay.set(k, (byCargaDay.get(k) || 0) + 1);
    if (p.personal_id) {
      const tk = `${p.personal_id}:${p.dia}`;
      if (!byTeacherDayBlocks.has(tk)) byTeacherDayBlocks.set(tk, []);
      byTeacherDayBlocks.get(tk).push(Number(p.bloque_orden) || 0);
    }
    if ((Number(p.bloque_orden) || 0) >= lastOrden - 1) latePenalty += 1;
  }
  for (const [, n] of byCargaDay) {
    if (n >= 3) distributionPenalty += (n - 2) * 2;
  }
  for (const [, ords] of byTeacherDayBlocks) {
    const sorted = [...ords].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i += 1) {
      const gap = sorted[i] - sorted[i - 1];
      if (gap > 2) gapPenalty += gap - 2;
    }
  }
  const soft =
    Math.max(0, 40 - distributionPenalty) +
    Math.max(0, 30 - latePenalty) +
    Math.max(0, 30 - gapPenalty);
  return Math.round(55 + soft * 0.45);
}

function buildPreDiagnostico({ cargas, classBlocks, dispByTeacherDay, docentesNombres }) {
  const causas = [];
  const sugerencias = [];
  const demandByTeacher = new Map();

  for (const c of cargas) {
    if (!c.personal_id) {
      causas.push(`Carga "${c.curso_nombre || c.id}" (grupo ${c.grupo_id}) sin docente.`);
      continue;
    }
    const pid = Number(c.personal_id);
    demandByTeacher.set(pid, (demandByTeacher.get(pid) || 0) + Number(c.bloques_semanales || 0));
  }

  for (const [pid, demand] of demandByTeacher) {
    let supply = 0;
    for (const dia of DIAS) {
      for (const b of classBlocks) {
        if (isTeacherAvailable(dispByTeacherDay, pid, dia, b)) supply += 1;
      }
    }
    const nombre = docentesNombres.get(pid) || `Docente #${pid}`;
    if (demand > supply) {
      causas.push(
        `${nombre} requiere ${demand} bloques/semana, pero solo tiene ~${supply} huecos CLASS disponibles.`
      );
      sugerencias.push(`Ampliar disponibilidad de ${nombre} o reducir su carga.`);
    }
  }

  if (!classBlocks.length) {
    causas.push('No hay bloques CLASS/ACTIVITY activos.');
    sugerencias.push('Configure bloques en la pestaña Configuración.');
  }
  if (!cargas.length) {
    causas.push('No hay carga semanal activa para este nivel/año.');
    sugerencias.push('Importe asignaturas en Carga semanal.');
  }
  return { causas, sugerencias };
}

function solveInMemory({
  cargas,
  classBlocks,
  dispByTeacherDay,
  lockedPlacements = [],
  seed = 1,
  maxNodes = 300000,
  docentesNombres = new Map(),
}) {
  const rng = mulberry32(seed);
  const diagnostico = buildPreDiagnostico({
    cargas,
    classBlocks,
    dispByTeacherDay,
    docentesNombres,
  });

  const grupoBusy = new Set();
  const teacherBusy = new Set();
  const placements = [];

  for (const p of lockedPlacements) {
    grupoBusy.add(grupoSlotKey(p.grupo_id, p.dia, p.bloque_id));
    if (p.personal_id) teacherBusy.add(teacherSlotKey(p.personal_id, p.dia, p.bloque_id));
    placements.push({ ...p, _locked: true });
  }

  const units = [];
  for (const c of cargas) {
    const already = placements.filter((p) => Number(p.carga_id) === Number(c.id)).length;
    const need = Math.max(0, Number(c.bloques_semanales || 0) - already);
    for (let i = 0; i < need; i += 1) {
      units.push({
        carga: c,
        personal_id: c.personal_id ? Number(c.personal_id) : null,
        grupo_id: Number(c.grupo_id),
        carga_id: Number(c.id),
      });
    }
  }

  const blocks = [...classBlocks].sort((a, b) => (a.orden || 0) - (b.orden || 0));

  function candidatesFor(unit) {
    const out = [];
    for (const dia of shuffle(DIAS, rng)) {
      // Preferir días con menos clases de esta carga
      const sameDay = placements.filter(
        (p) => Number(p.carga_id) === unit.carga_id && Number(p.dia) === dia
      ).length;
      for (const b of shuffle(blocks, rng)) {
        if (!isTeacherAvailable(dispByTeacherDay, unit.personal_id, dia, b)) continue;
        if (grupoBusy.has(grupoSlotKey(unit.grupo_id, dia, b.id))) continue;
        if (unit.personal_id && teacherBusy.has(teacherSlotKey(unit.personal_id, dia, b.id))) continue;
        out.push({
          dia,
          bloque: b,
          soft: sameDay * 10 + (Number(b.orden) || 0) * 0.1,
        });
      }
    }
    out.sort((a, b) => a.soft - b.soft);
    return out;
  }

  // MRV: menos candidatos primero
  const unitsOrdered = [...units].sort((a, b) => candidatesFor(a).length - candidatesFor(b).length);

  let nodes = 0;

  function dfs(ui) {
    nodes += 1;
    if (nodes > maxNodes) return false;
    if (ui >= unitsOrdered.length) return true;

    const unit = unitsOrdered[ui];
    const already = placements.filter((p) => Number(p.carga_id) === unit.carga_id).length;
    if (already >= Number(unit.carga.bloques_semanales || 0)) return dfs(ui + 1);

    const cands = candidatesFor(unit);
    if (!cands.length) return false;

    for (const cand of cands) {
      const p = {
        dia: cand.dia,
        bloque_id: cand.bloque.id,
        bloque_orden: cand.bloque.orden,
        grupo_id: unit.grupo_id,
        carga_id: unit.carga_id,
        personal_id: unit.personal_id,
        curso_id: unit.carga.curso_id || null,
        asignatura_id: unit.carga.asignatura_id || null,
        locked: 0,
      };
      grupoBusy.add(grupoSlotKey(p.grupo_id, p.dia, p.bloque_id));
      if (p.personal_id) teacherBusy.add(teacherSlotKey(p.personal_id, p.dia, p.bloque_id));
      placements.push(p);

      if (dfs(ui + 1)) return true;

      placements.pop();
      grupoBusy.delete(grupoSlotKey(p.grupo_id, p.dia, p.bloque_id));
      if (p.personal_id) teacherBusy.delete(teacherSlotKey(p.personal_id, p.dia, p.bloque_id));
    }
    return false;
  }

  const ok = dfs(0);
  const finalPlacements = placements.map(({ _locked, ...rest }) => rest);
  const totalNeed = cargas.reduce((s, c) => s + Number(c.bloques_semanales || 0), 0);
  const placed = finalPlacements.length;

  const unplaced = [];
  for (const c of cargas) {
    const n = finalPlacements.filter((p) => Number(p.carga_id) === Number(c.id)).length;
    const need = Number(c.bloques_semanales || 0);
    if (n < need) {
      unplaced.push({
        carga_id: c.id,
        curso: c.curso_nombre,
        grupo_id: c.grupo_id,
        docente: docentesNombres.get(Number(c.personal_id)) || null,
        colocados: n,
        necesarios: need,
        faltan: need - n,
      });
    }
  }

  if (!ok) {
    diagnostico.causas.push(
      `No se completó: ${placed}/${totalNeed} bloques (nodos ${nodes}).`
    );
    if (unplaced.length) {
      diagnostico.causas.push(
        `Pendientes: ${unplaced
          .slice(0, 10)
          .map((u) => `${u.curso || 'curso'}×${u.faltan}`)
          .join('; ')}.`
      );
    }
    if (!diagnostico.sugerencias.length) {
      diagnostico.sugerencias.push('Ajuste disponibilidad o complete a mano en el Editor.');
      diagnostico.sugerencias.push('Pruebe otra semilla / alternativa.');
    }
  }

  return {
    ok,
    placements: finalPlacements,
    score: scoreSolution(finalPlacements, classBlocks),
    placed,
    total: totalNeed,
    unplaced,
    diagnostico,
    nodes,
  };
}

async function loadSolverContext({ colegioId, anio, nivelId, grupoIds = null }) {
  const cfg = await query(
    `SELECT * FROM horario_gen_config WHERE colegio_id = ? AND anio = ? AND nivel_id = ? LIMIT 1`,
    [colegioId, anio, nivelId]
  );
  if (!cfg?.length) {
    const err = new Error('No hay configuración de bloques para ese nivel/año.');
    err.code = 'NO_CONFIG';
    throw err;
  }
  const config = cfg[0];

  const bloques = await query(
    `SELECT * FROM horario_gen_bloques WHERE config_id = ? AND activo = 1 ORDER BY orden ASC, id ASC`,
    [config.id]
  );
  const classBlocks = (bloques || []).filter((b) => b.tipo === 'CLASS' || b.tipo === 'ACTIVITY');

  let cargaSql = `
    SELECT c.*, cur.nombre AS curso_nombre
    FROM horario_gen_carga c
    LEFT JOIN cursos cur ON cur.id = c.curso_id
    INNER JOIN grupos g ON g.id = c.grupo_id
    WHERE c.colegio_id = ? AND c.anio = ? AND c.activo = 1 AND g.nivel_id = ?
  `;
  const cargaParams = [colegioId, anio, nivelId];
  if (grupoIds?.length) {
    cargaSql += ` AND c.grupo_id IN (${grupoIds.map(() => '?').join(',')})`;
    cargaParams.push(...grupoIds);
  }
  const cargas = await query(cargaSql, cargaParams);

  const disp = await query(
    `SELECT * FROM horario_gen_disponibilidad WHERE colegio_id = ? AND anio = ?`,
    [colegioId, anio]
  );
  const dispByTeacherDay = new Map();
  for (const d of disp || []) {
    dispByTeacherDay.set(`${d.personal_id}:${d.dia_semana}`, d);
  }

  const docentesNombres = new Map();
  const pids = [...new Set((cargas || []).map((c) => c.personal_id).filter(Boolean))];
  if (pids.length) {
    const docs = await query(
      `SELECT id, TRIM(CONCAT(COALESCE(apellidos,''), ' ', COALESCE(nombres,''))) AS nombre
       FROM personal WHERE id IN (${pids.map(() => '?').join(',')})`,
      pids
    );
    for (const d of docs || []) docentesNombres.set(Number(d.id), d.nombre);
  }

  return {
    config,
    bloques: bloques || [],
    classBlocks,
    cargas: cargas || [],
    dispByTeacherDay,
    docentesNombres,
  };
}

async function persistPlacements(versionId, placements) {
  await execute(`DELETE FROM horario_gen_entradas WHERE version_id = ? AND locked = 0`, [versionId]);
  const locked = await query(
    `SELECT dia_semana, bloque_id, grupo_id FROM horario_gen_entradas WHERE version_id = ? AND locked = 1`,
    [versionId]
  );
  const lockedSet = new Set(
    (locked || []).map((l) => `${l.grupo_id}:${l.dia_semana}:${l.bloque_id}`)
  );

  let inserted = 0;
  for (const p of placements) {
    const k = `${p.grupo_id}:${p.dia}:${p.bloque_id}`;
    if (lockedSet.has(k)) continue;
    await execute(
      `INSERT INTO horario_gen_entradas
        (version_id, bloque_id, dia_semana, grupo_id, curso_id, asignatura_id, personal_id, carga_id, locked)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        versionId,
        p.bloque_id,
        p.dia,
        p.grupo_id,
        p.curso_id || null,
        p.asignatura_id || null,
        p.personal_id || null,
        p.carga_id,
      ]
    );
    inserted += 1;
  }
  return inserted;
}

module.exports = {
  solveInMemory,
  loadSolverContext,
  persistPlacements,
  buildPreDiagnostico,
  scoreSolution,
  DIAS,
};
