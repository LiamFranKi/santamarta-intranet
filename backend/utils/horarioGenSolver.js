/**
 * Solver piloto — generación automática de horarios (horario_gen_*).
 * Backtracking en memoria + score suave.
 * Respeta horas seguidas (bloques_consecutivos_min/max).
 * NO escribe en grupos_horarios.
 */
const { query, execute } = require('./mysql');
const { timeToSec } = require('./horarioGenValidation');

const DIAS = [1, 2, 3, 4, 5];

function toBool01(v, fallback = 1) {
  if (Buffer.isBuffer(v)) return v.length && v[0] ? 1 : 0;
  if (v && typeof v === 'object' && Array.isArray(v.data)) return v.data[0] ? 1 : 0;
  if (v === true || v === 1 || v === '1' || v === 'true') return 1;
  if (v === false || v === 0 || v === '0' || v === 'false') return 0;
  return fallback;
}

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

function isClassTipo(tipo) {
  return tipo === 'CLASS' || tipo === 'ACTIVITY';
}

/**
 * Ventanas de N horas de clase consecutivas en el reloj
 * (sin recreo/almuerzo en medio).
 */
function buildConsecutiveWindows(allBlocksSorted, size) {
  const windows = [];
  if (size < 1 || !allBlocksSorted?.length) return windows;
  for (let i = 0; i <= allBlocksSorted.length - size; i += 1) {
    const slice = allBlocksSorted.slice(i, i + size);
    if (slice.every((b) => isClassTipo(b.tipo))) {
      windows.push(slice);
    }
  }
  return windows;
}

/**
 * Fallback solo para dobles (size 2): dos CLASS con recreo/almuerzo en medio
 * (ej. 3ª hora + 4ª hora). Se usa si no hay franja estrictamente seguida libre.
 */
function buildAcrossBreakWindows(allBlocksSorted) {
  const windows = [];
  if (!allBlocksSorted?.length) return windows;
  const classIdx = [];
  allBlocksSorted.forEach((b, i) => {
    if (isClassTipo(b.tipo)) classIdx.push(i);
  });
  for (let c = 0; c < classIdx.length - 1; c += 1) {
    const i = classIdx[c];
    const j = classIdx[c + 1];
    if (j === i + 1) continue; // ya es seguida estricta
    let onlyBreak = true;
    for (let k = i + 1; k < j; k += 1) {
      const t = allBlocksSorted[k].tipo;
      if (isClassTipo(t)) {
        onlyBreak = false;
        break;
      }
      if (t !== 'BREAK' && t !== 'LUNCH') {
        onlyBreak = false;
        break;
      }
    }
    if (onlyBreak) windows.push([allBlocksSorted[i], allBlocksSorted[j]]);
  }
  return windows;
}

/**
 * Parte la carga semanal en trozos según min/max seguidas.
 * Ej: 6 horas con 2/2 → [2,2,2]
 */
function buildChunkSizes(carga) {
  const need = Math.max(0, Number(carga.bloques_semanales || 0));
  const minC = Math.max(1, Number(carga.bloques_consecutivos_min || 1));
  const maxC = Math.max(minC, Number(carga.bloques_consecutivos_max || minC));
  const chunks = [];
  let remaining = need;
  while (remaining > 0) {
    let size;
    if (remaining >= maxC) {
      size = maxC;
    } else if (remaining >= minC) {
      size = remaining;
    } else {
      // No alcanza el mínimo (ej. 1 hora con 2/2): coloca el resto suelto
      size = remaining;
    }
    chunks.push(size);
    remaining -= size;
  }
  return chunks;
}

function scoreSolution(placements, classBlocks, cargasById) {
  let distributionPenalty = 0;
  let latePenalty = 0;
  let gapPenalty = 0;
  let consecBonus = 0;
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

  for (const [key, n] of byCargaDay) {
    const cargaId = Number(String(key).split(':')[0]);
    const carga = cargasById?.get(cargaId);
    const maxC = Math.max(1, Number(carga?.bloques_consecutivos_max || 2));
    if (n > maxC) distributionPenalty += (n - maxC) * 3;
  }

  for (const [, ords] of byTeacherDayBlocks) {
    const sorted = [...ords].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i += 1) {
      const gap = sorted[i] - sorted[i - 1];
      if (gap === 1) consecBonus += 1;
      if (gap > 2) gapPenalty += gap - 2;
    }
  }

  const soft =
    Math.max(0, 35 - distributionPenalty) +
    Math.max(0, 25 - latePenalty) +
    Math.max(0, 25 - gapPenalty) +
    Math.min(15, consecBonus);
  return Math.round(55 + soft * 0.4);
}

function buildPreDiagnostico({ cargas, classBlocks, allBlocksSorted, dispByTeacherDay, docentesNombres }) {
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

    const minC = Math.max(1, Number(c.bloques_consecutivos_min || 1));
    const maxC = Math.max(minC, Number(c.bloques_consecutivos_max || minC));
    if (maxC >= 2) {
      const wins = buildConsecutiveWindows(allBlocksSorted, Math.min(maxC, 2));
      if (!wins.length) {
        causas.push(
          `"${c.curso_nombre || 'Curso'}" pide horas seguidas ${minC}/${maxC}, pero no hay franjas CLASS consecutivas (revisar recreos).`
        );
        sugerencias.push('Ajuste la estructura de horas para tener al menos 2 clases seguidas sin recreo en medio.');
      }
    }
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
        `${nombre} requiere ${demand} horas/semana, pero solo tiene ~${supply} huecos CLASS disponibles.`
      );
      sugerencias.push(`Ampliar disponibilidad de ${nombre} o reducir su carga.`);
    }
  }

  if (!classBlocks.length) {
    causas.push('No hay horas CLASS/ACTIVITY activas.');
    sugerencias.push('Configure horas en la pestaña Configuración.');
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
  allBlocksSorted = null,
  dispByTeacherDay,
  lockedPlacements = [],
  seed = 1,
  maxNodes = 500000,
  docentesNombres = new Map(),
}) {
  const rng = mulberry32(seed);
  const timeline = (allBlocksSorted && allBlocksSorted.length
    ? allBlocksSorted
    : [...classBlocks]
  ).sort((a, b) => (a.orden || 0) - (b.orden || 0));

  const diagnostico = buildPreDiagnostico({
    cargas,
    classBlocks,
    allBlocksSorted: timeline,
    dispByTeacherDay,
    docentesNombres,
  });

  const cargasById = new Map(cargas.map((c) => [Number(c.id), c]));
  const lockedBase = (lockedPlacements || []).map((p) => ({ ...p, _locked: true }));

  const windowCache = new Map();
  function windowsOf(size) {
    if (!windowCache.has(size)) {
      windowCache.set(size, buildConsecutiveWindows(timeline, size));
    }
    return windowCache.get(size);
  }
  const acrossBreakWins = buildAcrossBreakWindows(timeline);

  function buildUnits(forceSingles) {
    const units = [];
    for (const c of cargas) {
      const already = lockedBase.filter((p) => Number(p.carga_id) === Number(c.id)).length;
      const need = Math.max(0, Number(c.bloques_semanales || 0) - already);
      if (need <= 0) continue;
      if (forceSingles) {
        for (let i = 0; i < need; i += 1) {
          units.push({
            carga: c,
            size: 1,
            personal_id: c.personal_id ? Number(c.personal_id) : null,
            grupo_id: Number(c.grupo_id),
            carga_id: Number(c.id),
          });
        }
      } else {
        const sizes = buildChunkSizes({ ...c, bloques_semanales: need });
        for (const size of sizes) {
          units.push({
            carga: c,
            size,
            personal_id: c.personal_id ? Number(c.personal_id) : null,
            grupo_id: Number(c.grupo_id),
            carga_id: Number(c.id),
          });
        }
      }
    }
    return units;
  }

  function runSearch(units, nodesBudget) {
    const grupoBusy = new Set();
    const teacherBusy = new Set();
    const placements = [];

    for (const p of lockedBase) {
      grupoBusy.add(grupoSlotKey(p.grupo_id, p.dia, p.bloque_id));
      if (p.personal_id) teacherBusy.add(teacherSlotKey(p.personal_id, p.dia, p.bloque_id));
      placements.push({ ...p });
    }

    function slotFree(unit, dia, b) {
      if (!isTeacherAvailable(dispByTeacherDay, unit.personal_id, dia, b)) return false;
      if (grupoBusy.has(grupoSlotKey(unit.grupo_id, dia, b.id))) return false;
      if (unit.personal_id && teacherBusy.has(teacherSlotKey(unit.personal_id, dia, b.id))) {
        return false;
      }
      return true;
    }

    function candidatesFor(unit) {
      const out = [];
      let wins = windowsOf(unit.size).map((w) => ({ blocks: w, softExtra: 0 }));
      if (!wins.length && unit.size === 1) {
        wins = classBlocks.map((b) => ({ blocks: [b], softExtra: 0 }));
      }
      if (unit.size === 2 && acrossBreakWins.length) {
        for (const w of acrossBreakWins) {
          wins.push({ blocks: w, softExtra: 80 });
        }
      }
      // Último recurso para un doble sin hueco: dos sueltas no se arman aquí;
      // el reintento forceSingles cubre ese caso.
      for (const dia of shuffle(DIAS, rng)) {
        const hoursSameDay = placements.filter(
          (p) => Number(p.carga_id) === unit.carga_id && Number(p.dia) === dia
        ).length;
        for (const { blocks: win, softExtra } of shuffle(wins, rng)) {
          if (!win.every((b) => slotFree(unit, dia, b))) continue;
          const firstOrden = Number(win[0].orden) || 0;
          out.push({
            dia,
            blocks: win,
            soft: hoursSameDay * 20 + firstOrden * 0.05 + softExtra,
          });
        }
      }
      out.sort((a, b) => a.soft - b.soft);
      return out;
    }

    const unitsOrdered = [...units].sort((a, b) => {
      if (b.size !== a.size) return b.size - a.size;
      return candidatesFor(a).length - candidatesFor(b).length;
    });

    let nodes = 0;
    let bestPlacements = placements.map(({ _locked, ...rest }) => rest);
    let bestCount = bestPlacements.length;

    function snapshotBest() {
      if (placements.length > bestCount) {
        bestCount = placements.length;
        bestPlacements = placements.map(({ _locked, ...rest }) => rest);
      }
    }

    function dfs(ui) {
      nodes += 1;
      if (nodes > nodesBudget) return false;
      if (ui >= unitsOrdered.length) {
        snapshotBest();
        return true;
      }

      const unit = unitsOrdered[ui];
      const already = placements.filter((p) => Number(p.carga_id) === unit.carga_id).length;
      if (already >= Number(unit.carga.bloques_semanales || 0)) return dfs(ui + 1);

      const cands = candidatesFor(unit);
      if (!cands.length) {
        snapshotBest();
        return false;
      }

      for (const cand of cands) {
        const added = [];
        for (const b of cand.blocks) {
          const p = {
            dia: cand.dia,
            bloque_id: b.id,
            bloque_orden: b.orden,
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
          added.push(p);
        }
        snapshotBest();

        if (dfs(ui + 1)) return true;

        for (let i = 0; i < added.length; i += 1) {
          const p = placements.pop();
          grupoBusy.delete(grupoSlotKey(p.grupo_id, p.dia, p.bloque_id));
          if (p.personal_id) teacherBusy.delete(teacherSlotKey(p.personal_id, p.dia, p.bloque_id));
        }
      }
      snapshotBest();
      return false;
    }

    const ok = dfs(0);
    // Si no completó, devolver el mejor parcial (no dejar vacío)
    const finalPlacements = ok
      ? placements.map(({ _locked, ...rest }) => rest)
      : bestPlacements;
    return { ok, placements: finalPlacements, nodes };
  }

  // 1) Intento respetando horas seguidas (dobles)
  let search = runSearch(buildUnits(false), maxNodes);
  // 2) Si quedó vacío o muy incompleto, reintentar en sueltas (mejor algo que nada)
  const totalNeed = cargas.reduce((s, c) => s + Number(c.bloques_semanales || 0), 0);
  if (!search.ok && search.placements.length < Math.max(1, Math.floor(totalNeed * 0.4))) {
    const retry = runSearch(buildUnits(true), maxNodes);
    if (retry.placements.length > search.placements.length) {
      search = retry;
      diagnostico.sugerencias.push(
        'No cupieron todos los dobles (2/2); se colocó lo posible también en horas sueltas. Revise disponibilidad o complete a mano.'
      );
    }
  }

  const finalPlacements = search.placements;
  const placed = finalPlacements.length;
  const ok = search.ok && placed >= totalNeed;

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
    diagnostico.causas.push(`No se completó: ${placed}/${totalNeed} horas (nodos ${search.nodes}).`);
    if (unplaced.length) {
      diagnostico.causas.push(
        `Pendientes: ${unplaced
          .slice(0, 10)
          .map((u) => `${u.curso || 'curso'}×${u.faltan}`)
          .join('; ')}.`
      );
    }
    if (!diagnostico.sugerencias.length) {
      diagnostico.sugerencias.push(
        'Con Horas seguidas 2/2 el sistema prioriza dobles. Si no caben, intenta ampliar disponibilidad del docente o complete a mano.'
      );
    }
  }

  return {
    ok,
    placements: finalPlacements,
    score: scoreSolution(finalPlacements, classBlocks, cargasById),
    placed,
    total: totalNeed,
    unplaced,
    diagnostico,
    nodes: search.nodes,
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

  const bloquesRaw = await query(
    `SELECT * FROM horario_gen_bloques WHERE config_id = ? ORDER BY orden ASC, id ASC`,
    [config.id]
  );
  let bloques = (bloquesRaw || []).filter((b) => toBool01(b.activo, 0) === 1);
  if (!bloques.length && (bloquesRaw || []).length > 0) {
    await execute(`UPDATE horario_gen_bloques SET activo = 1 WHERE config_id = ?`, [config.id]);
    bloques = bloquesRaw;
  }
  if (!bloques.length) {
    const err = new Error(
      'Ese nivel no tiene bloques horarios activos. Configúralos en la pestaña 1. Configuración.'
    );
    err.code = 'NO_BLOQUES';
    throw err;
  }
  const allBlocksSorted = [...bloques].sort((a, b) => (a.orden || 0) - (b.orden || 0));
  const classBlocks = allBlocksSorted.filter((b) => isClassTipo(b.tipo));

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
    allBlocksSorted,
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
  buildChunkSizes,
  buildConsecutiveWindows,
  buildAcrossBreakWindows,
  DIAS,
};
