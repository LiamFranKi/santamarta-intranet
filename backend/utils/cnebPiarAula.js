const { query } = require('./mysql');
const { apoyosComoLista } = require('./piarEtiquetas');
const { sqlMatriculaEstadoSoloRegular } = require('./matriculaEstados');
const { DUA_CAT_LABEL, DUA_OPCIONES, duaTieneAlgo, leerDua } = require('./cnebDua');

function primerNombre(nombreCompleto) {
  const s = String(nombreCompleto || '').trim();
  if (!s) return 'El estudiante';
  const coma = s.indexOf(',');
  if (coma >= 0) {
    const nombres = s.slice(coma + 1).trim().split(/\s+/)[0];
    return nombres || s.slice(0, coma).trim() || 'El estudiante';
  }
  return s.split(/\s+/)[0];
}

function resumenDeFila(row) {
  const apoyos = apoyosComoLista(row.ajustes_checklist_json).map((a) => a.label);
  return {
    id: Number(row.id),
    alumno_id: Number(row.alumno_id),
    matricula_id: row.matricula_id != null ? Number(row.matricula_id) : null,
    nombre: row.nombre || '',
    apoyos,
  };
}

async function piarActivosDelGrupo(cid, anio, grupoId) {
  const gid = parseInt(grupoId, 10);
  const year = parseInt(anio, 10);
  if (!cid || !Number.isFinite(gid) || !Number.isFinite(year)) return [];
  try {
    const rows = await query(
      `SELECT p.id, p.alumno_id, p.ajustes_checklist_json, m.id AS matricula_id,
              TRIM(CONCAT(
                COALESCE(a.apellido_paterno,''), ' ', COALESCE(a.apellido_materno,''), ', ', COALESCE(a.nombres,'')
              )) AS nombre
       FROM psicologia_piar p
       INNER JOIN alumnos a ON a.id = p.alumno_id AND a.colegio_id = p.colegio_id
       INNER JOIN matriculas m ON m.alumno_id = p.alumno_id AND m.colegio_id = p.colegio_id
         AND m.grupo_id = ? AND ${sqlMatriculaEstadoSoloRegular('m')}
       WHERE p.colegio_id = ? AND p.anio = ? AND p.estado = 'ACTIVO'
       ORDER BY a.apellido_paterno ASC, a.apellido_materno ASC, a.nombres ASC`,
      [gid, cid, year]
    );
    return (rows || []).map(resumenDeFila);
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') return [];
    throw e;
  }
}

async function anexarPiarAAlumnos(cid, anio, grupoId, alumnos) {
  const list = Array.isArray(alumnos) ? alumnos : [];
  if (!list.length) return list;
  const activos = await piarActivosDelGrupo(cid, anio, grupoId);
  const byAlumno = new Map(activos.map((p) => [Number(p.alumno_id), p]));
  return list.map((al) => {
    const p = byAlumno.get(Number(al.alumno_id));
    if (!p) return { ...al, piar: null };
    return {
      ...al,
      piar: { id: p.id, apoyos: p.apoyos },
    };
  });
}

function textoDuaMarcado(raw) {
  const d = leerDua(raw);
  if (!duaTieneAlgo(d)) return '';
  const partes = [];
  Object.keys(DUA_OPCIONES).forEach((cat) => {
    const labs = (d[cat] || []).map((k) => DUA_OPCIONES[cat].find((x) => x.key === k)?.label || k);
    if (labs.length) partes.push(`${DUA_CAT_LABEL[cat]}: ${labs.join(', ')}`);
  });
  if (d.nota) partes.push(`Nota del docente: ${d.nota}`);
  (d.procedimientos || []).forEach((p) => {
    const quien = p.nombre ? primerNombre(p.nombre) : `alumno_id ${p.alumno_id}`;
    partes.push(`Procedimiento ya escrito para ${quien} (piar_id ${p.piar_id}, alumno_id ${p.alumno_id}): ${p.texto}`);
  });
  return `El docente ya marcó DUA / procedimientos para esta sesión (respételo e incorpórelo):\n${partes.join('\n')}`;
}

function textoApoyosParaPrompt(activos) {
  const base =
    'Diseñe la sesión con DUA para TODO el grupo: más de una forma de ver/escuchar la consigna, de participar y de evidenciar. No invente diagnósticos. No cambie la competencia ni el cotejo (mismos ítems para todos).';
  if (!activos || !activos.length) {
    return `${base}\nEn este aula no hay un PIAR publicado. Igual use DUA. Deje procedimientos como [].`;
  }
  const lineas = activos.map((p) => {
    const nom = primerNombre(p.nombre);
    const ap = (p.apoyos || []).length ? p.apoyos.join(', ') : 'apoyos registrados en el PIAR';
    return `- piar_id ${p.id}, alumno_id ${p.alumno_id}, ${nom}: ${ap}`;
  });
  return `${base}
Hay ${activos.length} estudiante(s) con PIAR publicado. Incorpore estos apoyos en materiales, tiempos y evidencia del DESARROLLO.
En "procedimientos" escriba, para CADA uno, qué hará el docente HOY con ese niño (2 a 4 frases, sin diagnóstico). Use exactamente esos piar_id y alumno_id. No ponga el diagnóstico ni el nombre en la ficha impresa.
${lineas.join('\n')}`;
}

async function docentesUsuarioDelAulaAlumno(cid, alumnoId, anio) {
  const year = parseInt(anio, 10);
  const aid = parseInt(alumnoId, 10);
  if (!cid || !Number.isFinite(aid) || !Number.isFinite(year)) return [];
  try {
    return await query(
      `SELECT DISTINCT u.id
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id AND g.colegio_id = m.colegio_id AND g.anio = ?
       INNER JOIN usuarios u ON u.colegio_id = m.colegio_id AND u.estado = 'ACTIVO' AND u.tipo = 'DOCENTE'
         AND u.personal_id IS NOT NULL
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND ${sqlMatriculaEstadoSoloRegular('m')}
         AND (
           EXISTS (
             SELECT 1 FROM asignaturas a
             WHERE a.grupo_id = g.id AND a.personal_id = u.personal_id AND a.colegio_id = g.colegio_id
           )
           OR g.tutor_id = u.personal_id
           OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = u.personal_id)
         )`,
      [year, aid, cid]
    );
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') return [];
    throw e;
  }
}

async function tutoresUsuarioDelAlumno(cid, alumnoId, anio) {
  const year = parseInt(anio, 10);
  const aid = parseInt(alumnoId, 10);
  if (!cid || !Number.isFinite(aid) || !Number.isFinite(year)) return [];
  try {
    return await query(
      `SELECT DISTINCT u.id, u.tipo
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id AND g.colegio_id = m.colegio_id AND g.anio = ?
       INNER JOIN usuarios u ON u.colegio_id = m.colegio_id AND u.estado = 'ACTIVO'
         AND u.personal_id IS NOT NULL
         AND (
           (COALESCE(g.tutor_id, 0) > 0 AND u.personal_id = g.tutor_id)
           OR (COALESCE(g.tutor_id_2, 0) > 0 AND u.personal_id = g.tutor_id_2)
         )
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND ${sqlMatriculaEstadoSoloRegular('m')}`,
      [year, aid, cid]
    );
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') return [];
    throw e;
  }
}

async function varsGenerarSesionIa(cid, body, anio) {
  const grupoId = parseInt(body?.grupo_id, 10);
  const year = parseInt(anio, 10) || new Date().getFullYear();
  const activos = Number.isFinite(grupoId) ? await piarActivosDelGrupo(cid, year, grupoId) : [];
  return {
    nivel: body?.nivel || 'INICIAL',
    corte_label: body?.corte_label || '',
    duracion: String(Math.min(180, Math.max(20, parseInt(body?.duracion_min, 10) || 60))),
    area: body?.area_nombre || '',
    competencia: body?.competencia_nombre || '',
    capacidades: Array.isArray(body?.capacidades) ? body.capacidades.join('; ') : '',
    desempenos: Array.isArray(body?.desempenos_texto)
      ? body.desempenos_texto.map((t, i) => `${i + 1}. ${t}`).join('\n')
      : '',
    titulo: body?.titulo || '',
    proposito: body?.proposito || '',
    apoyos_aula: [textoApoyosParaPrompt(activos), textoDuaMarcado(body?.dua)].filter(Boolean).join('\n\n'),
  };
}

function urlDestinoPiarPorTipo(tipo, { piarId, alumnoId }) {
  const t = String(tipo || '').toUpperCase();
  if (t === 'DOCENTE') return `/docente/psicologia/piar/${piarId}`;
  if (t === 'APODERADO') return `/apoderado/psicologia/${alumnoId}`;
  return `/admin/psicologia/alumno/${alumnoId}?tab=piar`;
}

module.exports = {
  piarActivosDelGrupo,
  anexarPiarAAlumnos,
  textoApoyosParaPrompt,
  docentesUsuarioDelAulaAlumno,
  tutoresUsuarioDelAlumno,
  urlDestinoPiarPorTipo,
  varsGenerarSesionIa,
};
