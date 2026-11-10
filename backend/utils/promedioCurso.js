/**
 * Promedio de curso.
 * Porcentual: cada criterio pesa lo que dice su porcentaje; sin nota cuenta 0.
 * El .5 sube (12.5 → 13). Antes se limpian los decimales de más que deja el binario,
 * porque 12.5 a veces queda en 12.499999999 y Math.round lo bajaba.
 */

const CLAVE_RECALCULO = 'promedios_porcentual_v1';

function redondearMediaArriba(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  const limpio = Math.round((x + Number.EPSILON) * 1e6) / 1e6;
  return Math.round(limpio);
}

function notasNumericas(valores) {
  return (valores || [])
    .map((n) => parseFloat(n))
    .filter((n) => !Number.isNaN(n));
}

function calcularPromedioPorcentual({
  criterios,
  notasPorCriterio,
  examenes,
  examenMensual,
  pesoExamen,
}) {
  let suma = 0;
  let pesoCriterios = 0;
  for (const criterio of criterios || []) {
    const peso = parseFloat(criterio.peso) || 0;
    if (peso <= 0) continue;
    pesoCriterios += peso;
    const raw = notasPorCriterio ? notasPorCriterio[criterio.id] : null;
    const nota =
      raw != null && raw !== '' && !Number.isNaN(parseFloat(raw)) ? parseFloat(raw) : 0;
    suma += (nota * peso) / 100;
  }

  const examSi = examenMensual === 'SI' || examenMensual === true;
  const pesoEx = examSi ? parseFloat(pesoExamen) || 0 : 0;
  if (pesoEx > 0) {
    const nums = notasNumericas(examenes);
    const promEx = nums.length > 0
      ? redondearMediaArriba(nums.reduce((s, n) => s + n, 0) / nums.length)
      : 0;
    suma += (promEx * pesoEx) / 100;
  }

  if (pesoCriterios + pesoEx <= 0) return null;
  return redondearMediaArriba(suma);
}

function calcularPromedioSimple({ notas, examenes, examenMensual, pesoExamen }) {
  const notasValidas = notasNumericas(notas);
  if (notasValidas.length === 0) return null;

  let promedio = redondearMediaArriba(
    notasValidas.reduce((s, n) => s + n, 0) / notasValidas.length
  );
  if (promedio == null) return null;

  if (examenMensual === 'SI' || examenMensual === true) {
    const nums = notasNumericas(examenes);
    if (nums.length > 0) {
      const promedioExamen = redondearMediaArriba(
        nums.reduce((s, n) => s + n, 0) / nums.length
      );
      const peso = parseFloat(pesoExamen) || 0;
      if (peso > 0) {
        promedio = redondearMediaArriba(
          (promedio * (100 - peso)) / 100 + (promedioExamen * peso) / 100
        );
      } else {
        promedio = redondearMediaArriba((promedio + promedioExamen) / 2);
      }
    }
  }
  return promedio;
}

function trozos(lista, tamano) {
  const out = [];
  for (let i = 0; i < lista.length; i += tamano) out.push(lista.slice(i, i + tamano));
  return out;
}

async function consultarEnTrozos(query, ids, sqlFn) {
  const filas = [];
  for (const grupo of trozos(ids, 300)) {
    const marcas = grupo.map(() => '?').join(',');
    const rows = await query(sqlFn(marcas), grupo);
    if (rows?.length) filas.push(...rows);
  }
  return filas;
}

/**
 * Corrige los promedios ya guardados de cursos que promedian por porcentaje.
 * Corre una sola vez (config.promedios_porcentual_v1). Si falla, se puede reintentar.
 */
async function recalcularPromediosPorcentualesGuardados(query, execute) {
  const ya = await query(`SELECT id FROM config WHERE clave = ? LIMIT 1`, [CLAVE_RECALCULO]);
  if (ya?.length) return { omitido: true };

  const filas = await query(
    `SELECT p.matricula_id, p.asignatura_id, p.ciclo, p.promedio,
            a.colegio_id, c.examen_mensual, c.peso_examen_mensual
     FROM promedios p
     INNER JOIN asignaturas a ON a.id = p.asignatura_id
     INNER JOIN grupos g ON g.id = a.grupo_id
     INNER JOIN niveles nv ON nv.id = g.nivel_id
     LEFT JOIN cursos c ON c.id = a.curso_id
     WHERE p.asignatura_id > 0
       AND nv.tipo_calificacion_final = 1
       AND (nv.tipo_calificacion IS NULL OR nv.tipo_calificacion <> 0)`
  );

  let actualizados = 0;
  if (filas?.length) {
    const asignaturaIds = [...new Set(filas.map((f) => f.asignatura_id))];
    const criterios = await consultarEnTrozos(
      query,
      asignaturaIds,
      (marcas) =>
        `SELECT id, asignatura_id, ciclo, peso, colegio_id
         FROM asignaturas_criterios
         WHERE asignatura_id IN (${marcas})`
    );
    const notas = await consultarEnTrozos(
      query,
      asignaturaIds,
      (marcas) =>
        `SELECT matricula_id, asignatura_id, ciclo, criterio_id, nota
         FROM notas
         WHERE asignatura_id IN (${marcas})`
    );
    const hayExamen = filas.some((f) => f.examen_mensual === 'SI');
    const examenes = hayExamen
      ? await consultarEnTrozos(
          query,
          asignaturaIds,
          (marcas) =>
            `SELECT matricula_id, asignatura_id, ciclo, nota
             FROM notas_examen_mensual
             WHERE asignatura_id IN (${marcas})`
        )
      : [];

    const criteriosPorAsignatura = new Map();
    for (const c of criterios) {
      const id = Number(c.asignatura_id);
      if (!criteriosPorAsignatura.has(id)) criteriosPorAsignatura.set(id, []);
      criteriosPorAsignatura.get(id).push(c);
    }
    const notaPorClave = new Map();
    for (const n of notas) {
      notaPorClave.set(
        `${Number(n.matricula_id)}|${Number(n.asignatura_id)}|${Number(n.ciclo)}|${Number(n.criterio_id)}`,
        n.nota
      );
    }
    const examenesPorClave = new Map();
    for (const e of examenes) {
      const clave = `${Number(e.matricula_id)}|${Number(e.asignatura_id)}|${Number(e.ciclo)}`;
      if (!examenesPorClave.has(clave)) examenesPorClave.set(clave, []);
      examenesPorClave.get(clave).push(e.nota);
    }

    for (const fila of filas) {
      const asignaturaId = Number(fila.asignatura_id);
      const ciclo = Number(fila.ciclo);
      const colegioId = Number(fila.colegio_id);
      const delCurso = (criteriosPorAsignatura.get(asignaturaId) || []).filter(
        (c) =>
          Number(c.colegio_id) === colegioId &&
          (Number(c.ciclo) === ciclo || Number(c.ciclo) === 0)
      );
      const notasPorCriterio = {};
      for (const c of delCurso) {
        const clave = `${Number(fila.matricula_id)}|${asignaturaId}|${ciclo}|${Number(c.id)}`;
        if (notaPorClave.has(clave)) notasPorCriterio[c.id] = notaPorClave.get(clave);
      }
      const nuevo = calcularPromedioPorcentual({
        criterios: delCurso,
        notasPorCriterio,
        examenes: examenesPorClave.get(`${Number(fila.matricula_id)}|${asignaturaId}|${ciclo}`) || [],
        examenMensual: fila.examen_mensual,
        pesoExamen: fila.peso_examen_mensual,
      });
      if (nuevo == null) continue;
      const anterior = parseFloat(fila.promedio);
      if (Number.isFinite(anterior) && anterior === nuevo) continue;
      await execute(
        `UPDATE promedios SET promedio = ? WHERE matricula_id = ? AND asignatura_id = ? AND ciclo = ?`,
        [String(nuevo), fila.matricula_id, fila.asignatura_id, fila.ciclo]
      );
      actualizados += 1;
    }
  }

  await execute(`INSERT INTO config (clave, valor) VALUES (?, ?)`, [
    CLAVE_RECALCULO,
    new Date().toISOString(),
  ]);
  return { actualizados };
}

module.exports = {
  redondearMediaArriba,
  calcularPromedioPorcentual,
  calcularPromedioSimple,
  recalcularPromediosPorcentualesGuardados,
};
