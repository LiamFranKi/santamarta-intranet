const { query, execute } = require('./mysql');
const phpSerialize = require('php-serialize');

function normAbrev(s) {
  return String(s || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function normDesc(s) {
  return String(s || '').trim().toLowerCase();
}

/**
 * ¿El criterio tiene notas guardadas? (tabla notas o detalle serializado con subnotas)
 */
async function criterioTieneNotas(asignaturaId, criterioId) {
  const id = parseInt(criterioId, 10);
  const asigId = parseInt(asignaturaId, 10);
  if (!id || !asigId) return false;

  const notasRows = await query(
    `SELECT nota FROM notas
     WHERE asignatura_id = ? AND criterio_id = ?
       AND nota IS NOT NULL AND TRIM(CAST(nota AS CHAR)) != ''
     LIMIT 1`,
    [asigId, id]
  );
  if (notasRows.length > 0) return true;

  const indicadores = await query(
    `SELECT id FROM asignaturas_indicadores WHERE criterio_id = ?`,
    [id]
  );
  if (indicadores.length === 0) return false;

  const indIds = new Set(indicadores.map((i) => String(i.id)));
  const detalles = await query(
    `SELECT data FROM notas_detalles WHERE asignatura_id = ?`,
    [asigId]
  );

  for (const row of detalles) {
    if (!row.data) continue;
    let data;
    try {
      if (Buffer.isBuffer(row.data)) {
        data = phpSerialize.unserialize(row.data);
      } else if (typeof row.data === 'string') {
        try {
          data = phpSerialize.unserialize(row.data);
        } catch {
          data = JSON.parse(row.data);
        }
      } else {
        data = row.data;
      }
    } catch {
      continue;
    }
    const bloque = data?.[id] ?? data?.[String(id)];
    if (!bloque || typeof bloque !== 'object') continue;
    for (const indKey of Object.keys(bloque)) {
      if (!indIds.has(String(indKey))) continue;
      const arr = bloque[indKey];
      if (Array.isArray(arr) && arr.some((n) => n !== null && n !== undefined && String(n).trim() !== '')) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Máximo índice de cuadro con nota (1-based) en notas_detalles para un criterio.
 */
async function maxCuadrosConNotaEnCriterio(asignaturaId, criterioId) {
  const id = parseInt(criterioId, 10);
  const asigId = parseInt(asignaturaId, 10);
  if (!id || !asigId) return 0;

  const indicadores = await query(
    `SELECT id FROM asignaturas_indicadores WHERE criterio_id = ?`,
    [id]
  );
  if (indicadores.length === 0) return 0;

  const indIds = new Set(indicadores.map((i) => String(i.id)));
  const detalles = await query(
    `SELECT data FROM notas_detalles WHERE asignatura_id = ?`,
    [asigId]
  );

  let maxCuadros = 0;

  for (const row of detalles) {
    if (!row.data) continue;
    let data;
    try {
      if (Buffer.isBuffer(row.data)) {
        data = phpSerialize.unserialize(row.data);
      } else if (typeof row.data === 'string') {
        try {
          data = phpSerialize.unserialize(row.data);
        } catch {
          data = JSON.parse(row.data);
        }
      } else {
        data = row.data;
      }
    } catch {
      continue;
    }
    const bloque = data?.[id] ?? data?.[String(id)];
    if (!bloque || typeof bloque !== 'object') continue;
    for (const indKey of Object.keys(bloque)) {
      if (!indIds.has(String(indKey))) continue;
      const arr = bloque[indKey];
      if (!Array.isArray(arr)) continue;
      arr.forEach((n, idx) => {
        if (n !== null && n !== undefined && String(n).trim() !== '') {
          maxCuadros = Math.max(maxCuadros, idx + 1);
        }
      });
    }
  }

  return maxCuadros;
}

async function eliminarCriterioSeguro(criterioId) {
  await execute(`DELETE FROM asignaturas_indicadores WHERE criterio_id = ?`, [criterioId]);
  await execute(`DELETE FROM notas WHERE criterio_id = ?`, [criterioId]);
  await execute(`DELETE FROM asignaturas_criterios WHERE id = ?`, [criterioId]);
}

/**
 * Inserta un criterio + indicador (cuantitativo) en una asignatura.
 */
async function insertarCriterioDesdeItem(colegioId, asignaturaId, item, orden) {
  const cicloInt = parseInt(item.ciclo, 10);
  const abrev =
    (item.abreviatura || '').trim() ||
    String(item.descripcion || '')
      .trim()
      .substring(0, 20);
  const pesoVal = Math.max(0, parseFloat(item.peso) || 0);
  const cuadros = Math.max(1, parseInt(item.cuadros, 10) || 1);

  await execute(
    `INSERT INTO asignaturas_criterios
       (colegio_id, descripcion, abreviatura, asignatura_id, ciclo, orden, peso)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      colegioId,
      String(item.descripcion).trim(),
      abrev,
      asignaturaId,
      cicloInt,
      orden,
      pesoVal,
    ]
  );

  const inserted = await query(
    `SELECT id FROM asignaturas_criterios
     WHERE asignatura_id = ? AND colegio_id = ? AND ciclo = ? AND orden = ?
     ORDER BY id DESC LIMIT 1`,
    [asignaturaId, colegioId, cicloInt, orden]
  );
  const criterioId = inserted[0]?.id;
  if (!criterioId) throw new Error('No se pudo crear el criterio');

  await execute(
    `INSERT INTO asignaturas_indicadores (criterio_id, descripcion, cuadros)
     VALUES (?, ?, ?)`,
    [criterioId, String(item.descripcion).trim(), cuadros]
  );

  return criterioId;
}

function criterioCoincideItem(criterio, item) {
  const abrevC = normAbrev(criterio.abreviatura);
  const abrevI = normAbrev(item.abreviatura);
  if (abrevC && abrevI && abrevC === abrevI) {
    return parseInt(criterio.ciclo, 10) === parseInt(item.ciclo, 10);
  }
  return (
    normDesc(criterio.descripcion) === normDesc(item.descripcion) &&
    parseInt(criterio.ciclo, 10) === parseInt(item.ciclo, 10)
  );
}

/**
 * Lista asignaturas cuantitativas del colegio/año según filtros.
 */
async function listarAsignaturasCuantitativas(colegioId, anioActivo, filtros = {}) {
  const { nivel_ids = [], asignatura_ids = [] } = filtros;
  const params = [colegioId, anioActivo];
  let sql = `
    SELECT a.id, a.grupo_id, c.nombre AS curso_nombre, g.grado, g.seccion,
           n.id AS nivel_id, n.nombre AS nivel_nombre, g.anio
    FROM asignaturas a
    INNER JOIN grupos g ON g.id = a.grupo_id
    INNER JOIN cursos c ON c.id = a.curso_id
    INNER JOIN niveles n ON n.id = g.nivel_id
    WHERE a.colegio_id = ? AND g.anio = ? AND n.tipo_calificacion = 1
  `;

  if (nivel_ids.length > 0) {
    sql += ` AND n.id IN (${nivel_ids.map(() => '?').join(',')})`;
    params.push(...nivel_ids.map((x) => parseInt(x, 10)));
  }
  if (asignatura_ids.length > 0) {
    sql += ` AND a.id IN (${asignatura_ids.map(() => '?').join(',')})`;
    params.push(...asignatura_ids.map((x) => parseInt(x, 10)));
  }

  sql += ` ORDER BY n.nombre, g.grado, g.seccion, c.nombre`;
  return query(sql, params);
}

/**
 * Aplica plantilla a una asignatura.
 * @param {'solo_vacias'|'agregar'|'reemplazar_sin_notas'} modo
 */
async function aplicarPlantillaAAsignatura({
  colegioId,
  asignaturaId,
  items,
  modo,
  eliminarObsoletosSinNotas,
}) {
  const resultado = {
    asignatura_id: asignaturaId,
    creados: 0,
    omitidos: 0,
    eliminados: 0,
    no_eliminados_con_notas: 0,
  };

  const criteriosActuales = await query(
    `SELECT * FROM asignaturas_criterios WHERE asignatura_id = ? AND colegio_id = ? ORDER BY orden ASC`,
    [asignaturaId, colegioId]
  );

  if (modo === 'solo_vacias' && criteriosActuales.length > 0) {
    resultado.omitidos = items.length;
    return resultado;
  }

  const plantillaKeys = new Set(
    items.map((it) => `${normAbrev(it.abreviatura) || normDesc(it.descripcion)}|${parseInt(it.ciclo, 10)}`)
  );

  if (eliminarObsoletosSinNotas || modo === 'reemplazar_sin_notas') {
    for (const c of criteriosActuales) {
      const key = `${normAbrev(c.abreviatura) || normDesc(c.descripcion)}|${parseInt(c.ciclo, 10)}`;
      const enPlantilla = plantillaKeys.has(key);
      if (enPlantilla) continue;
      const tieneNotas = await criterioTieneNotas(asignaturaId, c.id);
      if (tieneNotas) {
        resultado.no_eliminados_con_notas += 1;
        continue;
      }
      await eliminarCriterioSeguro(c.id);
      resultado.eliminados += 1;
    }
  }

  if (modo === 'reemplazar_sin_notas') {
    const restantes = await query(
      `SELECT * FROM asignaturas_criterios WHERE asignatura_id = ? AND colegio_id = ?`,
      [asignaturaId, colegioId]
    );
    for (const c of restantes) {
      const tieneNotas = await criterioTieneNotas(asignaturaId, c.id);
      if (tieneNotas) continue;
      await eliminarCriterioSeguro(c.id);
      resultado.eliminados += 1;
    }
  }

  const criteriosDespuesDelete = await query(
    `SELECT * FROM asignaturas_criterios WHERE asignatura_id = ? AND colegio_id = ?`,
    [asignaturaId, colegioId]
  );

  let maxOrden = criteriosDespuesDelete.reduce((m, c) => Math.max(m, c.orden || 0), 0);

  for (const item of items) {
    const existe = criteriosDespuesDelete.some((c) => criterioCoincideItem(c, item));
    if (existe) {
      resultado.omitidos += 1;
      continue;
    }
    maxOrden += 1;
    await insertarCriterioDesdeItem(colegioId, asignaturaId, item, maxOrden);
    resultado.creados += 1;
  }

  return resultado;
}

module.exports = {
  normAbrev,
  criterioTieneNotas,
  maxCuadrosConNotaEnCriterio,
  eliminarCriterioSeguro,
  insertarCriterioDesdeItem,
  listarAsignaturasCuantitativas,
  aplicarPlantillaAAsignatura,
};
