/**
 * Datos de libreta Inicial por grupo (áreas, indicadores, letras por bimestre).
 * Misma fuente que libreta PDF y registro de notas Inicial.
 */
function labelIndicadorInicial(descripcion, ordenEnArea) {
  const raw = String(descripcion || '').trim();
  if (!raw) return `I${ordenEnArea}`;
  const antesDosPuntos = raw.split(':')[0].trim();
  const palabras = antesDosPuntos.split(/\s+/).filter(Boolean);
  if (palabras.length >= 2) {
    return `${palabras[0]} ${palabras[1]}`.slice(0, 14).toUpperCase();
  }
  return antesDosPuntos.slice(0, 14).toUpperCase();
}

/**
 * @returns {Promise<{ areas: Array, notaMap: Object } | null>}
 */
async function cargarLibretaInicialGrupo(queryFn, { grupoId, colegioId, anio, ciclo, matriculaIds }) {
  const cicloInt = Math.min(4, Math.max(1, parseInt(ciclo, 10) || 1));
  const anioInt = parseInt(anio, 10);

  let areas = [];
  try {
    areas = await queryFn(
      `SELECT id, nombre, orden FROM libreta_inicial_areas
       WHERE grupo_id = ? AND colegio_id = ? AND anio = ?
       ORDER BY orden ASC, id ASC`,
      [grupoId, colegioId, anioInt]
    );
  } catch {
    return null;
  }

  if (!areas?.length) return null;

  const areaIds = areas.map((a) => a.id);
  const phAreas = areaIds.map(() => '?').join(',');

  let indicadores = [];
  try {
    indicadores = await queryFn(
      `SELECT id, area_id, descripcion, orden, alcance_ciclo
       FROM libreta_inicial_indicadores
       WHERE area_id IN (${phAreas}) AND colegio_id = ?
         AND (alcance_ciclo = 0 OR alcance_ciclo = ?)
       ORDER BY orden ASC, id ASC`,
      [...areaIds, colegioId, cicloInt]
    );
  } catch {
    return null;
  }

  if (!indicadores?.length) return null;

  const notaMap = {};
  const matIds = (matriculaIds || []).filter(Boolean);
  if (matIds.length) {
    const phM = matIds.map(() => '?').join(',');
    try {
      const valores = await queryFn(
        `SELECT indicador_id, matricula_id, nota
         FROM libreta_inicial_valores
         WHERE colegio_id = ? AND ciclo = ? AND matricula_id IN (${phM})`,
        [colegioId, cicloInt, ...matIds]
      );
      for (const v of valores || []) {
        const nota = v.nota != null ? String(v.nota).trim() : '';
        if (nota) {
          notaMap[`${v.matricula_id}:${v.indicador_id}`] = nota.toUpperCase();
        }
      }
    } catch {
      /* tabla opcional */
    }
  }

  const areasOut = areas
    .map((area) => {
      const inds = (indicadores || []).filter((i) => Number(i.area_id) === Number(area.id));
      return {
        id: area.id,
        nombre: area.nombre,
        indicadores: inds.map((ind, idx) => ({
          id: ind.id,
          descripcion: String(ind.descripcion || '').trim(),
          label: labelIndicadorInicial(ind.descripcion, idx + 1),
        })),
      };
    })
    .filter((a) => a.indicadores.length > 0);

  if (!areasOut.length) return null;

  return { areas: areasOut, notaMap };
}

function bloquesDesdeLibretaInicial(libreta, { incluirProm = false } = {}) {
  const bloques = (libreta.areas || []).map((area) => {
    const columnas = (area.indicadores || []).map((ind) => ({
      key: `li_${ind.id}`,
      label: ind.label,
      titulo: ind.descripcion,
      indicador_id: ind.id,
      area_id: area.id,
      tipo: 'indicador_libreta',
    }));
    if (incluirProm) {
      columnas.push({
        key: `prom_area_${area.id}`,
        label: 'PROM',
        titulo: `Área — ${area.nombre}`,
        area_id: area.id,
        tipo: 'prom',
      });
    }
    return {
      curso_nombre: String(area.nombre || '').trim().toUpperCase(),
      area_id: area.id,
      columnas,
    };
  });
  return bloques;
}

function aplanarColumnasBloques(bloques) {
  const flat = [];
  for (const bloque of bloques || []) {
    for (const col of bloque.columnas || []) {
      flat.push({
        ...col,
        curso_nombre: bloque.curso_nombre,
        asignatura_id: bloque.asignatura_id,
        area_id: bloque.area_id,
      });
    }
  }
  return flat;
}

function notaLibretaInicial(notaMap, matriculaId, indicadorId) {
  return notaMap[`${matriculaId}:${indicadorId}`] || '';
}

module.exports = {
  labelIndicadorInicial,
  cargarLibretaInicialGrupo,
  bloquesDesdeLibretaInicial,
  aplanarColumnasBloques,
  notaLibretaInicial,
};
