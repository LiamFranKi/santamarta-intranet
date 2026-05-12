/**
 * Datos agregados para exportar PDF de notas de todos los cursos de un grupo (tutoría / admin).
 * Misma lógica que GET /docente/tutoria/grupos/:id/notas-todos; el año del grupo debe pasarse explícito.
 */
function deserializarNotasDetalles(dataString) {
  if (!dataString || dataString === '') {
    return {};
  }
  try {
    const phpSerialize = require('php-serialize');
    try {
      const deserialized = phpSerialize.unserialize(dataString);
      return deserialized || {};
    } catch (e) {
      try {
        const decoded = Buffer.from(dataString, 'base64').toString('utf-8');
        const deserialized = phpSerialize.unserialize(decoded);
        return deserialized || {};
      } catch (e2) {
        console.warn('Error deserializando notas_detalles:', e2);
        return {};
      }
    }
  } catch (error) {
    console.warn('Error deserializando notas_detalles:', error);
    return {};
  }
}

/**
 * @param {Function} query - mysql query
 * @param {{ grupoId: number|string, colegio_id: number, anioGrupo: number, cicloInt: number }} p
 * @returns {Promise<{ cursos: Array, grupo: object }>}
 */
async function fetchNotasTodosGrupoData(query, { grupoId, colegio_id, anioGrupo, cicloInt }) {
  const grupoRows = await query(
    `SELECT g.*, n.nombre as nivel_nombre, n.tipo_calificacion, n.tipo_calificacion_final,
            n.nota_aprobatoria, n.nota_maxima, n.nota_minima
     FROM grupos g
     INNER JOIN niveles n ON n.id = g.nivel_id
     WHERE g.id = ? AND g.colegio_id = ? AND g.anio = ?`,
    [grupoId, colegio_id, anioGrupo]
  );

  if (!grupoRows.length) {
    const err = new Error('GRUPO_NOT_FOUND');
    err.code = 'GRUPO_NOT_FOUND';
    throw err;
  }

  const grupoInfo = grupoRows[0];

  const asignaturas = await query(
    `SELECT a.id, a.grupo_id, c.nombre as curso_nombre, c.peso_examen_mensual, c.examen_mensual
     FROM asignaturas a
     INNER JOIN cursos c ON c.id = a.curso_id
     INNER JOIN grupos g ON g.id = a.grupo_id
     WHERE a.grupo_id = ? AND a.colegio_id = ? AND g.anio = ?
     ORDER BY c.nombre ASC`,
    [grupoId, colegio_id, anioGrupo]
  );

  if (asignaturas.length === 0) {
    return { cursos: [], grupo: grupoInfo };
  }

  const cursosConNotas = [];
  const esInicialTutoria = grupoInfo.tipo_calificacion === 0;

  for (const asignatura of asignaturas) {
    const cursoId = asignatura.id;

    let criterios = await query(
      `SELECT * FROM asignaturas_criterios
       WHERE asignatura_id = ? AND colegio_id = ? AND (ciclo = ? OR ciclo = 0)
       ORDER BY orden ASC`,
      [cursoId, colegio_id, cicloInt]
    );
    if (criterios.length === 0 && [2, 3, 4].includes(cicloInt) && esInicialTutoria) {
      criterios = await query(
        `SELECT * FROM asignaturas_criterios
         WHERE asignatura_id = ? AND colegio_id = ? AND (ciclo = 1 OR ciclo = 0)
         ORDER BY orden ASC`,
        [cursoId, colegio_id]
      );
    }

    const criterioIds = criterios.map((c) => c.id);
    let todosIndicadores = [];
    if (criterioIds.length > 0) {
      todosIndicadores = await query(
        `SELECT * FROM asignaturas_indicadores
         WHERE criterio_id IN (${criterioIds.map(() => '?').join(',')})
         ORDER BY criterio_id ASC, id ASC`,
        criterioIds
      );
    }

    const indicadoresPorCriterio = {};
    todosIndicadores.forEach((indicador) => {
      if (!indicadoresPorCriterio[indicador.criterio_id]) {
        indicadoresPorCriterio[indicador.criterio_id] = [];
      }
      indicadoresPorCriterio[indicador.criterio_id].push(indicador);
    });

    const criteriosConIndicadores = criterios.map((criterio) => ({
      ...criterio,
      indicadores: indicadoresPorCriterio[criterio.id] || [],
    }));

    const alumnos = await query(
      `SELECT a.id as alumno_id,
              a.nombres,
              a.apellido_paterno,
              a.apellido_materno,
              CONCAT(a.apellido_paterno, ' ', a.apellido_materno, ', ', a.nombres) as nombre_completo,
              m.id as matricula_id
       FROM alumnos a
       INNER JOIN matriculas m ON m.alumno_id = a.id
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.grupo_id = ?
         AND m.colegio_id = ?
         AND (m.estado = 0)
         AND g.anio = ?
       ORDER BY a.apellido_paterno, a.apellido_materno, a.nombres`,
      [grupoId, colegio_id, anioGrupo]
    );

    const matriculaIds = alumnos.map((a) => a.matricula_id);
    let todasNotasDetalles = [];
    let todasNotasCriterios = [];
    let todasExamenesMensuales = [];
    let todosPromedios = [];

    if (matriculaIds.length > 0) {
      todasNotasDetalles = await query(
        `SELECT matricula_id, data FROM notas_detalles
         WHERE asignatura_id = ? AND matricula_id IN (${matriculaIds.map(() => '?').join(',')}) AND ciclo = ?`,
        [cursoId, ...matriculaIds, cicloInt]
      );
      todasNotasCriterios = await query(
        `SELECT matricula_id, criterio_id, nota FROM notas
         WHERE asignatura_id = ? AND matricula_id IN (${matriculaIds.map(() => '?').join(',')}) AND ciclo = ?`,
        [cursoId, ...matriculaIds, cicloInt]
      );
      if (asignatura.examen_mensual === 'SI') {
        todasExamenesMensuales = await query(
          `SELECT matricula_id, nro, nota FROM notas_examen_mensual
           WHERE asignatura_id = ? AND matricula_id IN (${matriculaIds.map(() => '?').join(',')}) AND ciclo = ?
           ORDER BY matricula_id ASC, nro ASC`,
          [cursoId, ...matriculaIds, cicloInt]
        );
      }
      todosPromedios = await query(
        `SELECT matricula_id, promedio FROM promedios
         WHERE asignatura_id = ? AND matricula_id IN (${matriculaIds.map(() => '?').join(',')}) AND ciclo = ?`,
        [cursoId, ...matriculaIds, cicloInt]
      );
    }

    const alumnosConNotas = alumnos.map((alumno, index) => {
      const matriculaId = alumno.matricula_id;
      const notaDetalle = todasNotasDetalles.find((nd) => nd.matricula_id === matriculaId);
      let notasDetalladas = {};
      if (notaDetalle && notaDetalle.data) {
        notasDetalladas = deserializarNotasDetalles(notaDetalle.data);
      }
      const notasCriterios = todasNotasCriterios.filter((n) => n.matricula_id === matriculaId);
      const notasMap = {};
      notasCriterios.forEach((nota) => {
        notasMap[nota.criterio_id] = nota.nota;
      });
      const examenesAlumno = todasExamenesMensuales.filter((e) => e.matricula_id === matriculaId);
      const examenesMap = {};
      examenesAlumno.forEach((examen) => {
        examenesMap[examen.nro] = examen.nota;
      });
      const promedioAlumno = todosPromedios.find((p) => p.matricula_id === matriculaId);

      return {
        ...alumno,
        numero: index + 1,
        notas_detalladas: notasDetalladas,
        notas_criterios: notasMap,
        examenes_mensuales: examenesMap,
        promedio_final: promedioAlumno ? promedioAlumno.promedio : null,
      };
    });

    cursosConNotas.push({
      curso: {
        id: cursoId,
        curso_nombre: asignatura.curso_nombre,
        grado: grupoInfo.grado,
        seccion: grupoInfo.seccion,
        nivel_nombre: grupoInfo.nivel_nombre,
        grupo_id: grupoId,
        nivel: {
          tipo_calificacion: grupoInfo.tipo_calificacion,
          tipo_calificacion_final: grupoInfo.tipo_calificacion_final,
          nota_aprobatoria: grupoInfo.nota_aprobatoria,
          nota_maxima: grupoInfo.nota_maxima,
          nota_minima: grupoInfo.nota_minima,
        },
        examen_mensual: asignatura.examen_mensual === 'SI',
        peso_examen_mensual: asignatura.peso_examen_mensual || 0,
      },
      criterios: criteriosConIndicadores,
      alumnos: alumnosConNotas,
      ciclo: cicloInt,
    });
  }

  return { cursos: cursosConNotas, grupo: grupoInfo };
}

module.exports = { fetchNotasTodosGrupoData, deserializarNotasDetalles };
