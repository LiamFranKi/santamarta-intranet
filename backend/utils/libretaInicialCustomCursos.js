/**
 * Si existen áreas/indicadores personalizados para el grupo y año, arma el mismo
 * shape que `cursos_cualitativos` de la libreta INICIAL para reutilizar el PDF actual.
 */
async function tryBuildLibretaInicialCustomCursos(query, { grupoId, colegio_id, anioGrupo, matriculaId, ciclo }) {
  try {
    const areas = await query(
      `SELECT id, nombre FROM libreta_inicial_areas
       WHERE grupo_id = ? AND colegio_id = ? AND anio = ?
       ORDER BY orden ASC, id ASC`,
      [grupoId, colegio_id, anioGrupo]
    );
    if (!areas || areas.length === 0) return null;
    const areaIds = areas.map((a) => a.id);
    const placeholders = areaIds.map(() => '?').join(',');
    const indicadores = await query(
      `SELECT id, area_id, descripcion FROM libreta_inicial_indicadores
       WHERE area_id IN (${placeholders}) AND colegio_id = ?
       ORDER BY orden ASC, id ASC`,
      [...areaIds, colegio_id]
    );
    if (!indicadores || indicadores.length === 0) return null;

    const vals =
      (await query(
        `SELECT indicador_id, ciclo, detalle, nota FROM libreta_inicial_valores
         WHERE matricula_id = ? AND colegio_id = ?`,
        [matriculaId, colegio_id]
      )) || [];
    const valMap = new Map();
    vals.forEach((v) => {
      valMap.set(`${v.indicador_id}_${v.ciclo}`, v);
    });

    return areas.map((area) => {
      const inds = indicadores.filter((i) => Number(i.area_id) === Number(area.id));
      const indicadoresConNotas = inds.map((ind) => {
        const row = { id: ind.id, descripcion: ind.descripcion, explicacion: '' };
        for (let c = 1; c <= 4; c += 1) {
          const v = valMap.get(`${ind.id}_${c}`);
          row[`nota_b${c}`] =
            v && v.nota != null && String(v.nota).trim() !== '' ? String(v.nota).trim() : null;
        }
        const vCiclo = valMap.get(`${ind.id}_${ciclo}`);
        row.explicacion = vCiclo && vCiclo.detalle != null ? String(vCiclo.detalle).trim() : '';
        return row;
      });
      return {
        asignatura_id: area.id,
        curso_id: area.id,
        curso_nombre: area.nombre,
        criterios: [
          {
            id: -Number(area.id),
            descripcion: '',
            abreviatura: '',
            indicadores: indicadoresConNotas,
            nota_b1: null,
            nota_b2: null,
            nota_b3: null,
            nota_b4: null
          }
        ],
        promedio_b1: null,
        promedio_b2: null,
        promedio_b3: null,
        promedio_b4: null,
        promedio_final: null
      };
    });
  } catch (e) {
    console.warn('[libreta-inicial-custom] omitido:', e.message);
    return null;
  }
}

module.exports = { tryBuildLibretaInicialCustomCursos };
