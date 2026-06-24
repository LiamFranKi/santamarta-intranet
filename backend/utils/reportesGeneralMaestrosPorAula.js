/**
 * Reporte «Lista de Maestros por Aula» (admin reportes general).
 */
const { query } = require('./mysql');
const { resolverGrupoId, etiquetaGradoTitulo } = require('./listaAlumnosMatriculadosReporte');

function nombreProfesorLista(row) {
  const ap = String(row.apellidos || '').trim();
  const nom = String(row.nombres || '').trim();
  if (ap && nom) return `${ap.toUpperCase()}, ${nom}`;
  return (ap || nom || '—').toUpperCase();
}

function buildSubtituloProfesores(grupo) {
  const gl = etiquetaGradoTitulo(grupo.nivel_nombre, grupo.grado);
  const sec = String(grupo.seccion || '').trim();
  const nivel = String(grupo.nivel_nombre || '').trim();
  const left = [gl, sec].filter(Boolean).join(' ');
  if (left && nivel) return `${left} - ${nivel}`;
  return left || nivel || '';
}

async function fetchPersonalNombre(colegioId, personalId) {
  const id = parseInt(personalId, 10);
  if (!Number.isFinite(id) || id <= 0) return null;
  const rows = await query(
    `SELECT nombres, apellidos FROM personal WHERE id = ? AND colegio_id = ? LIMIT 1`,
    [id, colegioId]
  );
  if (!rows.length) return null;
  return nombreProfesorLista(rows[0]);
}

async function obtenerListaMaestrosPorAula(colegioId, filtros) {
  const res = await resolverGrupoId(colegioId, filtros);
  if (res.error === 'not_found') {
    return { ok: false, status: 404, error: 'No se encontró el grupo con esos filtros.' };
  }
  if (res.error === 'duplicate') {
    return { ok: false, status: 409, error: 'Hay más de un grupo que coincide. Refine sede o datos.' };
  }

  const grupo = res.grupo;
  const subtitulo = buildSubtituloProfesores(grupo);

  const asignaturas = await query(
    `SELECT
       c.nombre AS curso,
       p.nombres,
       p.apellidos
     FROM asignaturas a
     INNER JOIN cursos c ON c.id = a.curso_id
     INNER JOIN personal p ON p.id = a.personal_id
     WHERE a.grupo_id = ? AND a.colegio_id = ?
     ORDER BY c.nombre ASC, p.apellidos ASC, p.nombres ASC`,
    [grupo.id, colegioId]
  );

  const filas = (asignaturas || []).map((row) => ({
    profesor_nombre: nombreProfesorLista(row),
    curso: String(row.curso || '').trim() || '—',
    tipo: 'asignatura',
  }));

  const grupoTutores = await query(
    `SELECT tutor_id, tutor_id_2 FROM grupos WHERE id = ? AND colegio_id = ? LIMIT 1`,
    [grupo.id, colegioId]
  );
  const gt = grupoTutores[0] || {};

  const nombreTutora = await fetchPersonalNombre(colegioId, gt.tutor_id);
  if (nombreTutora) {
    filas.push({ profesor_nombre: nombreTutora, curso: 'Tutoría', tipo: 'tutoria' });
  }

  const nombreCoTutora = await fetchPersonalNombre(colegioId, gt.tutor_id_2);
  if (nombreCoTutora) {
    filas.push({ profesor_nombre: nombreCoTutora, curso: 'Co-Tutoría', tipo: 'cotutoria' });
  }

  return {
    ok: true,
    grupo_id: grupo.id,
    titulo: `Profesores del: ${subtitulo}`,
    subtitulo,
    filas,
    total: filas.length,
  };
}

module.exports = {
  obtenerListaMaestrosPorAula,
  buildSubtituloProfesores,
  nombreProfesorLista,
};
