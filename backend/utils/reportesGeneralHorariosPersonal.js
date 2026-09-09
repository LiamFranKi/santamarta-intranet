/**
 * Reportes → Personal → Horarios.
 * Misma fuente que GET /docente/horario: grupos_horarios + asignaturas + grupos.
 */
const { query } = require('./mysql');

function tituloCadaPalabra(texto) {
  return String(texto || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function tituloNombre(apellidos, nombres) {
  const ap = String(apellidos || '').trim();
  const nom = tituloCadaPalabra(nombres);
  if (ap && nom) return `${ap.toUpperCase()}, ${nom}`;
  return (ap || nom || 'Docente').trim();
}

function textoGrupo(row) {
  if (!(row.nivel_nombre || row.grado || row.seccion)) return '';
  const gradoTexto = row.grado ? `${row.grado}°` : '';
  let grupoTexto = `${row.nivel_nombre || ''} ${gradoTexto} ${row.seccion || ''}`.trim();
  if (row.anio) grupoTexto = `${grupoTexto} - ${row.anio}`;
  return grupoTexto;
}

function mapClase(row) {
  return {
    id: row.id,
    dia: typeof row.dia === 'number' ? row.dia : parseInt(row.dia || 0, 10),
    inicio: row.hora_inicio,
    fin: row.hora_final,
    anio: row.anio,
    titulo: row.curso_nombre || row.descripcion || '',
    grupo: textoGrupo(row),
    nivel_id: row.nivel_id != null ? Number(row.nivel_id) : null,
  };
}

async function obtenerHorariosPersonal(colegioId, filtros = {}) {
  const anio = parseInt(filtros.anio, 10);
  if (!Number.isFinite(anio)) {
    return { ok: false, status: 400, error: 'Indique un año válido.' };
  }
  const nivelId = filtros.nivelId != null && filtros.nivelId !== '' ? parseInt(filtros.nivelId, 10) : null;
  let personalIds = [];
  if (Array.isArray(filtros.personalIds)) {
    personalIds = filtros.personalIds.map((n) => parseInt(n, 10)).filter((n) => Number.isFinite(n));
  } else if (filtros.personalIds) {
    personalIds = String(filtros.personalIds)
      .split(',')
      .map((n) => parseInt(n, 10))
      .filter((n) => Number.isFinite(n));
  }

  const params = [colegioId, anio, colegioId];
  let extra = '';
  if (Number.isFinite(nivelId)) {
    extra += ' AND g.nivel_id = ?';
    params.push(nivelId);
  }

  const docentes = await query(
    `SELECT p.id AS personal_id, p.nombres, p.apellidos
     FROM personal p
     WHERE p.colegio_id = ?
       AND p.id IN (
         SELECT DISTINCT COALESCE(a.personal_id, gh.personal_id)
         FROM grupos_horarios gh
         LEFT JOIN asignaturas a ON a.id = gh.asignatura_id
         LEFT JOIN grupos g ON g.id = COALESCE(a.grupo_id, gh.grupo_id)
         WHERE gh.anio = ?
           AND COALESCE(a.personal_id, gh.personal_id) IS NOT NULL
           AND (g.colegio_id = ? OR g.colegio_id IS NULL)
           ${extra}
       )
     ORDER BY p.apellidos ASC, p.nombres ASC`,
    params
  );

  let lista = docentes || [];
  if (personalIds.length) {
    const set = new Set(personalIds);
    lista = lista.filter((d) => set.has(Number(d.personal_id)));
  }

  const ids = lista.map((d) => Number(d.personal_id));
  const docentesBase = lista.map((d) => ({
    personal_id: Number(d.personal_id),
    nombre: tituloNombre(d.apellidos, d.nombres),
  }));

  if (!ids.length) {
    return {
      ok: true,
      anio,
      titulo: 'Horarios del personal',
      docentes: [],
      total: 0,
    };
  }

  if (filtros.soloLista) {
    return {
      ok: true,
      anio,
      titulo: 'Horarios del personal',
      docentes: docentesBase,
      total: docentesBase.length,
    };
  }

  const ph = ids.map(() => '?').join(',');
  const filas = await query(
    `SELECT
       gh.id,
       gh.dia,
       gh.hora_inicio,
       gh.hora_final,
       gh.anio,
       COALESCE(a.personal_id, gh.personal_id) AS personal_id,
       c.nombre AS curso_nombre,
       gh.descripcion AS descripcion,
       g.grado,
       g.seccion,
       g.nivel_id,
       n.nombre AS nivel_nombre
     FROM grupos_horarios gh
     LEFT JOIN asignaturas a ON a.id = gh.asignatura_id
     LEFT JOIN grupos g ON g.id = COALESCE(a.grupo_id, gh.grupo_id)
     LEFT JOIN niveles n ON n.id = g.nivel_id
     LEFT JOIN cursos c ON c.id = a.curso_id
     WHERE gh.anio = ?
       AND COALESCE(a.personal_id, gh.personal_id) IN (${ph})
     ORDER BY COALESCE(a.personal_id, gh.personal_id), gh.dia,
       TIME(STR_TO_DATE(gh.hora_inicio, '%l:%i %p')),
       COALESCE(TIME(STR_TO_DATE(gh.hora_inicio, '%H:%i:%s')), TIME(STR_TO_DATE(gh.hora_inicio, '%H:%i')))`,
    [anio, ...ids]
  );

  const porDocente = new Map();
  for (const d of lista) {
    const pid = Number(d.personal_id);
    porDocente.set(pid, {
      personal_id: pid,
      nombre: tituloNombre(d.apellidos, d.nombres),
      clases: [],
    });
  }
  for (const row of filas || []) {
    const pid = Number(row.personal_id);
    const bucket = porDocente.get(pid);
    if (!bucket) continue;
    bucket.clases.push(mapClase(row));
  }

  const docentesOut = [...porDocente.values()].filter((d) => d.clases.length > 0);

  return {
    ok: true,
    anio,
    titulo: 'Horarios del personal',
    docentes: docentesOut,
    total: docentesOut.length,
  };
}

module.exports = { obtenerHorariosPersonal };
