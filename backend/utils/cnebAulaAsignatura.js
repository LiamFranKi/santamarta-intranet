const { query } = require('./mysql');
const { esCualitativoNivel } = require('./cnebTipoNivel');

function nivelDesdeNombre(nombre) {
  const u = String(nombre || '').toUpperCase();
  if (u.includes('SECUNDARIA')) return 'SECUNDARIA';
  if (u.includes('PRIMARIA')) return 'PRIMARIA';
  if (u.includes('INICIAL')) return 'INICIAL';
  return null;
}

function normalizarNombre(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const HINTS_AREA_INICIAL = [
  { codigo: 'PS', keys: ['personal social', 'psicosocial', 'identidad'] },
  { codigo: 'REL', keys: ['religion', 'religiosa', 'catequesis'] },
  { codigo: 'PSI', keys: ['psicomot', 'educacion fisica', 'ed fisica', 'motricidad'] },
  { codigo: 'COM', keys: ['comunicacion', 'lenguaje', 'castellano'] },
  { codigo: 'MAT', keys: ['matematic', 'logico'] },
  { codigo: 'CYT', keys: ['ciencia', 'tecnolog', 'exploracion'] },
];

async function nivelCnebActivoEnAula(cid, anio, nivel) {
  if (nivel === 'INICIAL') return true;
  if (nivel !== 'PRIMARIA' && nivel !== 'SECUNDARIA') return false;
  try {
    const [row] = await query(
      `SELECT activo FROM cneb_uso_colegio
       WHERE colegio_id = ? AND anio = ? AND nivel_cneb = ? LIMIT 1`,
      [cid, anio, nivel]
    );
    return Number(row?.activo) === 1;
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR') return false;
    throw e;
  }
}

async function resolverAreaPorCurso(cursoNombre, nivelCneb) {
  const nivel = String(nivelCneb || 'INICIAL').toUpperCase();
  const areas = await query(
    `SELECT id, codigo, nombre FROM cneb_areas
     WHERE nivel_cneb = ? AND activo = 1 AND tipo <> 'transversal'
     ORDER BY orden ASC, id ASC`,
    [nivel]
  ).catch(() => []);
  const n = normalizarNombre(cursoNombre);
  if (!n || !(areas || []).length) return null;
  const exacta = areas.find((a) => normalizarNombre(a.nombre) === n);
  if (exacta) return exacta;
  const parcial = areas.find((a) => {
    const an = normalizarNombre(a.nombre);
    return n.includes(an) || an.includes(n);
  });
  if (parcial) return parcial;
  for (const hint of HINTS_AREA_INICIAL) {
    if (hint.keys.some((k) => n.includes(k))) {
      const area = areas.find((a) => a.codigo === hint.codigo);
      if (area) return area;
    }
  }
  return null;
}

async function contextoAulaCneb(cid, asignaturaId) {
  const aid = parseInt(asignaturaId, 10);
  if (!cid || !Number.isFinite(aid)) return null;
  const [row] = await query(
    `SELECT a.id AS asignatura_id, a.grupo_id, a.curso_id, a.personal_id,
            c.nombre AS curso_nombre,
            g.grado, g.seccion, g.anio,
            n.nombre AS nivel_nombre, n.tipo_calificacion
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
  const esCnebAnio = esCualitativoNivel(row.tipo_calificacion, row.nivel_nombre);
  let bimestrePrueba = null;
  if (!esCnebAnio && nivel) {
    try {
      const [uso] = await query(
        `SELECT activo, bimestre FROM cneb_uso_colegio
         WHERE colegio_id = ? AND anio = ? AND nivel_cneb = ? LIMIT 1`,
        [cid, Number(row.anio), nivel]
      );
      if (Number(uso?.activo) === 1) {
        const b = Number(uso.bimestre);
        bimestrePrueba = b >= 1 && b <= 4 ? b : 4;
      }
    } catch (e) {
      if (e.code !== 'ER_NO_SUCH_TABLE' && e.code !== 'ER_BAD_FIELD_ERROR') throw e;
    }
  }
  const esCneb = esCnebAnio || bimestrePrueba != null;
  let mapa = null;
  if (esCneb) {
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
    if (!mapa || (mapa.tipo !== 'complementario' && !mapa.area_id)) {
      const resuelta = await resolverAreaPorCurso(row.curso_nombre, nivel);
      if (resuelta) {
        mapa = {
          tipo: 'principal',
          area_id: resuelta.id,
          area_nombre: resuelta.nombre,
          area_codigo: resuelta.codigo,
        };
      }
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
    es_cneb: esCneb,
    es_cneb_anio: esCnebAnio,
    bimestre_prueba: bimestrePrueba,
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

async function listarSesionesAula(cid, ctx, bimestre) {
  if (!ctx?.grupo_id || !ctx.es_cneb) return [];
  const params = [cid, ctx.grupo_id, ctx.anio, ctx.nivel_cneb || 'INICIAL'];
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
  const b = parseInt(bimestre, 10);
  const filtrar = b >= 1 && b <= 4;
  const where = `WHERE s.colegio_id = ? AND s.grupo_id = ? AND s.anio = ? AND s.nivel_cneb = ?${extra}`;
  const order = ' ORDER BY COALESCE(s.fecha_sesion, s.creado_en) DESC, s.id DESC';
  try {
    return await query(
      `SELECT s.id, s.titulo, s.unidad, s.proposito, s.duracion_min, s.estado, s.fecha_sesion,
              s.corte, s.bimestre, s.grupo_id, s.area_id, s.asignatura_id, s.competencia_id,
              ar.nombre AS area_nombre, cp.nombre AS competencia_nombre
       FROM cneb_sesiones s
       LEFT JOIN cneb_areas ar ON ar.id = s.area_id
       LEFT JOIN cneb_competencias cp ON cp.id = s.competencia_id
       ${where}${filtrar ? ' AND s.bimestre = ?' : ''}${order}`,
      filtrar ? [...params, b] : params
    );
  } catch (e) {
    if (e.code === 'ER_BAD_FIELD_ERROR') {
      return query(
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
    }
    if (e.code === 'ER_NO_SUCH_TABLE') return [];
    throw e;
  }
}

function vistaAlumnoSesion(ses) {
  if (!ses) return null;
  return {
    id: ses.id,
    titulo: ses.titulo,
    fecha_sesion: ses.fecha_sesion,
    area_nombre: ses.area_nombre,
    ficha_estudiante: ses.ficha_estudiante || '',
  };
}

module.exports = {
  nivelDesdeNombre,
  nivelCnebActivoEnAula,
  contextoAulaCneb,
  listarSesionesAula,
  vistaAlumnoSesion,
};
