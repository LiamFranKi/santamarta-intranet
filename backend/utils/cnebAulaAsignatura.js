const { query } = require('./mysql');

function nivelDesdeNombre(nombre) {
  const u = String(nombre || '').toUpperCase();
  if (u.includes('SECUNDARIA')) return 'SECUNDARIA';
  if (u.includes('PRIMARIA')) return 'PRIMARIA';
  if (u.includes('INICIAL')) return 'INICIAL';
  return null;
}

async function contextoAulaCneb(cid, asignaturaId) {
  const aid = parseInt(asignaturaId, 10);
  if (!cid || !Number.isFinite(aid)) return null;
  const [row] = await query(
    `SELECT a.id AS asignatura_id, a.grupo_id, a.curso_id, a.personal_id,
            c.nombre AS curso_nombre,
            g.grado, g.seccion, g.anio,
            n.nombre AS nivel_nombre
     FROM asignaturas a
     INNER JOIN cursos c ON c.id = a.curso_id AND c.colegio_id = a.colegio_id
     INNER JOIN grupos g ON g.id = a.grupo_id AND g.colegio_id = a.colegio_id
     INNER JOIN niveles n ON n.id = g.nivel_id AND n.colegio_id = g.colegio_id
     WHERE a.id = ? AND a.colegio_id = ?
     LIMIT 1`,
    [aid, cid]
  );
  if (!row) return null;
  const nivel = nivelDesdeNombre(row.nivel_nombre);
  const esInicial = nivel === 'INICIAL';
  let mapa = null;
  if (esInicial) {
    try {
      const [m] = await query(
        `SELECT m.tipo, m.area_id, ar.nombre AS area_nombre, ar.codigo AS area_codigo
         FROM cneb_curso_mapa m
         LEFT JOIN cneb_areas ar ON ar.id = m.area_id
         WHERE m.colegio_id = ? AND m.curso_id = ?
         LIMIT 1`,
        [cid, row.curso_id]
      );
      mapa = m || null;
    } catch (e) {
      if (e.code !== 'ER_NO_SUCH_TABLE') throw e;
    }
  }
  return {
    asignatura_id: Number(row.asignatura_id),
    grupo_id: Number(row.grupo_id),
    curso_id: Number(row.curso_id),
    curso_nombre: row.curso_nombre,
    grado: row.grado,
    seccion: row.seccion,
    anio: Number(row.anio),
    nivel_nombre: row.nivel_nombre,
    nivel_cneb: nivel,
    es_inicial: esInicial,
    mapa: mapa
      ? {
          tipo: mapa.tipo || 'principal',
          area_id: mapa.area_id != null ? Number(mapa.area_id) : null,
          area_nombre: mapa.area_nombre || null,
          area_codigo: mapa.area_codigo || null,
        }
      : null,
  };
}

async function listarSesionesAula(cid, ctx) {
  if (!ctx?.grupo_id || !ctx.es_inicial) return [];
  const params = [cid, ctx.grupo_id, ctx.anio, 'INICIAL'];
  let extra = '';
  if (ctx.mapa?.tipo === 'complementario') {
    extra = ' AND s.asignatura_id = ?';
    params.push(ctx.asignatura_id);
  } else if (ctx.mapa?.area_id) {
    extra = ' AND (s.area_id = ? OR s.asignatura_id = ?)';
    params.push(ctx.mapa.area_id, ctx.asignatura_id);
  } else {
    extra = ' AND s.asignatura_id = ?';
    params.push(ctx.asignatura_id);
  }
  try {
    return await query(
      `SELECT s.id, s.titulo, s.proposito, s.duracion_min, s.estado, s.fecha_sesion,
              s.corte, s.grupo_id, s.area_id, s.asignatura_id, s.competencia_id,
              ar.nombre AS area_nombre, cp.nombre AS competencia_nombre
       FROM cneb_sesiones s
       LEFT JOIN cneb_areas ar ON ar.id = s.area_id
       LEFT JOIN cneb_competencias cp ON cp.id = s.competencia_id
       WHERE s.colegio_id = ? AND s.grupo_id = ? AND s.anio = ? AND s.nivel_cneb = ?${extra}
       ORDER BY COALESCE(s.fecha_sesion, s.creado_en) DESC, s.id DESC`,
      params
    );
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') return [];
    throw e;
  }
}

function vistaAlumnoSesion(ses) {
  if (!ses) return null;
  return {
    id: ses.id,
    titulo: ses.titulo,
    proposito: ses.proposito,
    duracion_min: ses.duracion_min,
    fecha_sesion: ses.fecha_sesion,
    area_nombre: ses.area_nombre,
    ficha_estudiante: ses.ficha_estudiante || '',
    momentos: ses.momentos || { inicio: '', desarrollo: '', cierre: '' },
    minutos: ses.minutos || { inicio: 0, desarrollo: 0, cierre: 0 },
  };
}

module.exports = {
  nivelDesdeNombre,
  contextoAulaCneb,
  listarSesionesAula,
  vistaAlumnoSesion,
};
