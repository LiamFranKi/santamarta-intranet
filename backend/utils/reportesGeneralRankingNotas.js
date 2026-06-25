/**
 * Reporte «Ranking de Notas» por aula y bimestre (admin reportes general).
 */
const { query } = require('./mysql');
const { sqlMatriculaEstadoSoloRegular } = require('./matriculaEstados');
const { resolverGrupoId, etiquetaGradoTitulo } = require('./listaAlumnosMatriculadosReporte');

const CONDUCTA_ASIGNATURA_ID = -101;

function parseNumPromedio(raw) {
  if (raw == null || raw === '' || raw === '-') return null;
  const n = parseFloat(String(raw).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function nombreAlumnoLista(row) {
  const ap = [row.apellido_paterno, row.apellido_materno]
    .filter((x) => x != null && String(x).trim())
    .join(' ')
    .trim();
  const nom = String(row.nombres || '').trim();
  if (ap && nom) return `${ap}, ${nom}`;
  return ap || nom || '—';
}

function compararApellido(a, b) {
  const ap = String(a.apellido_paterno || '').localeCompare(String(b.apellido_paterno || ''), 'es', {
    sensitivity: 'base',
  });
  if (ap !== 0) return ap;
  const am = String(a.apellido_materno || '').localeCompare(String(b.apellido_materno || ''), 'es', {
    sensitivity: 'base',
  });
  if (am !== 0) return am;
  return String(a.nombres || '').localeCompare(String(b.nombres || ''), 'es', { sensitivity: 'base' });
}

function buildSubtituloRanking(grupo, anio) {
  const nivel = String(grupo.nivel_nombre || '').trim().toUpperCase();
  const gl = String(etiquetaGradoTitulo(grupo.nivel_nombre, grupo.grado) || '')
    .trim()
    .toUpperCase();
  const sec = String(grupo.seccion || '').trim().toUpperCase();
  const turno = String(grupo.turno_nombre || '').trim().toUpperCase();
  const left = [gl, sec].filter(Boolean).join(' ');
  return `${nivel} - ${left} - ${turno} - ${anio}`;
}

function asignarPuestosCompetencia(ordenados) {
  if (!ordenados.length) return;
  let puesto = 1;
  for (let i = 0; i < ordenados.length; i += 1) {
    if (i > 0) {
      const prev = ordenados[i - 1];
      const cur = ordenados[i];
      if (cur.promedio !== prev.promedio || cur.puntaje !== prev.puntaje) {
        puesto = i + 1;
      }
    }
    ordenados[i].puesto = puesto;
  }
}

async function cargarTipoCalificacion(colegioId, grupoId) {
  const rows = await query(
    `SELECT n.tipo_calificacion, n.nombre AS nivel_nombre
     FROM grupos g
     INNER JOIN niveles n ON n.id = g.nivel_id AND n.colegio_id = g.colegio_id
     WHERE g.id = ? AND g.colegio_id = ?
     LIMIT 1`,
    [grupoId, colegioId]
  );
  const row = rows[0] || {};
  const cualitativo = parseInt(row.tipo_calificacion, 10) === 0;
  const nombreInicial = String(row.nivel_nombre || '')
    .toLowerCase()
    .includes('inicial');
  return cualitativo || nombreInicial;
}

async function obtenerRankingNotas(colegioId, filtros) {
  const anio = parseInt(filtros.anio, 10);
  const nivelId = parseInt(filtros.nivelId, 10);
  const grado = parseInt(filtros.grado, 10);
  const seccion = String(filtros.seccion || '').trim();
  const turnoId = parseInt(filtros.turnoId, 10);
  const sedeId = filtros.sedeId != null ? parseInt(filtros.sedeId, 10) : null;
  const bimestre = Math.min(4, Math.max(1, parseInt(filtros.bimestre, 10) || 1));

  if (!Number.isFinite(anio) || !Number.isFinite(nivelId) || !Number.isFinite(grado) || !seccion) {
    return { ok: false, status: 400, error: 'Indique año, nivel, grado y sección válidos.' };
  }
  if (!Number.isFinite(turnoId)) {
    return { ok: false, status: 400, error: 'Indique un turno válido.' };
  }

  const res = await resolverGrupoId(colegioId, {
    anio,
    nivelId,
    grado,
    seccion,
    turnoId,
    sedeId: Number.isFinite(sedeId) ? sedeId : null,
  });
  if (res.error === 'not_found') {
    return { ok: false, status: 404, error: 'No se encontró el grupo con esos filtros.' };
  }
  if (res.error === 'duplicate') {
    return { ok: false, status: 409, error: 'Hay más de un grupo que coincide. Refine sede o datos.' };
  }

  const grupo = res.grupo;
  const subtitulo = buildSubtituloRanking(grupo, anio);
  const titulo = `RANKING DE NOTAS - BIMESTRE ${bimestre}`;
  const esCualitativo = await cargarTipoCalificacion(colegioId, grupo.id);

  const alumnos = await query(
    `SELECT m.id AS matricula_id,
            a.apellido_paterno, a.apellido_materno, a.nombres
     FROM matriculas m
     INNER JOIN alumnos a ON a.id = m.alumno_id AND a.colegio_id = m.colegio_id
     WHERE m.grupo_id = ? AND m.colegio_id = ? AND ${sqlMatriculaEstadoSoloRegular('m')}
     ORDER BY a.apellido_paterno ASC, a.apellido_materno ASC, a.nombres ASC`,
    [grupo.id, colegioId]
  );

  if (esCualitativo) {
    const filas = (alumnos || []).map((row) => ({
      alumno_nombre: nombreAlumnoLista(row),
      puntaje: null,
      promedio: null,
      puesto: null,
    }));
    return {
      ok: true,
      grupo_id: grupo.id,
      titulo,
      subtitulo,
      bimestre,
      modo_cualitativo: true,
      filas,
      total: filas.length,
    };
  }

  const asignaturas = await query(
    `SELECT a.id AS asignatura_id
     FROM asignaturas a
     WHERE a.grupo_id = ? AND a.colegio_id = ?
     ORDER BY a.id ASC`,
    [grupo.id, colegioId]
  );
  const asigIds = (asignaturas || [])
    .map((a) => a.asignatura_id)
    .filter((id) => id != null && id !== CONDUCTA_ASIGNATURA_ID);

  const matriculaIds = (alumnos || []).map((a) => a.matricula_id);
  const promMap = {};
  if (matriculaIds.length > 0 && asigIds.length > 0) {
    const phM = matriculaIds.map(() => '?').join(',');
    const phA = asigIds.map(() => '?').join(',');
    const proms = await query(
      `SELECT p.matricula_id, p.asignatura_id, p.promedio
       FROM promedios p
       WHERE p.matricula_id IN (${phM})
         AND p.asignatura_id IN (${phA})
         AND p.ciclo = ?`,
      [...matriculaIds, ...asigIds, bimestre]
    );
    (proms || []).forEach((p) => {
      promMap[`${p.matricula_id}:${p.asignatura_id}`] = p.promedio;
    });
  }

  const conNotas = [];
  const sinNotas = [];

  for (const row of alumnos || []) {
    const mid = row.matricula_id;
    let suma = 0;
    let count = 0;
    for (const asigId of asigIds) {
      const n = parseNumPromedio(promMap[`${mid}:${asigId}`]);
      if (n != null) {
        suma += n;
        count += 1;
      }
    }

    const base = {
      alumno_nombre: nombreAlumnoLista(row),
      apellido_paterno: row.apellido_paterno,
      apellido_materno: row.apellido_materno,
      nombres: row.nombres,
    };

    if (count > 0) {
      conNotas.push({
        ...base,
        puntaje: round2(suma),
        promedio: round2(suma / count),
      });
    } else {
      sinNotas.push({
        ...base,
        puntaje: 0,
        promedio: null,
      });
    }
  }

  conNotas.sort((a, b) => {
    if (b.promedio !== a.promedio) return b.promedio - a.promedio;
    if (b.puntaje !== a.puntaje) return b.puntaje - a.puntaje;
    return compararApellido(a, b);
  });

  asignarPuestosCompetencia(conNotas);

  sinNotas.sort(compararApellido);
  const siguientePuesto =
    conNotas.length > 0 ? (conNotas[conNotas.length - 1].puesto || 0) + 1 : 1;
  sinNotas.forEach((f) => {
    f.puesto = siguientePuesto;
  });

  const filas = [...conNotas, ...sinNotas]
    .map(({ alumno_nombre, puntaje, promedio, puesto }) => ({
      alumno_nombre,
      puntaje,
      promedio,
      puesto,
    }))
    .sort((a, b) => {
      const pa = a.puesto != null ? a.puesto : 9999;
      const pb = b.puesto != null ? b.puesto : 9999;
      if (pa !== pb) return pa - pb;
      return String(a.alumno_nombre || '').localeCompare(String(b.alumno_nombre || ''), 'es', {
        sensitivity: 'base',
      });
    });

  return {
    ok: true,
    grupo_id: grupo.id,
    titulo,
    subtitulo,
    bimestre,
    modo_cualitativo: false,
    filas,
    total: filas.length,
  };
}

module.exports = {
  obtenerRankingNotas,
  buildSubtituloRanking,
  nombreAlumnoLista,
};
