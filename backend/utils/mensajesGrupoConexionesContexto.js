/**
 * Contexto de grupo(s) para mensajes de Conexiones familiares (docente / tutor).
 */
const { query } = require('./mysql');
const { personalEsTutorDeGrupoMeta } = require('./grupoTutores');

/**
 * @param {number} colegio_id
 * @param {number[]} grupoIds
 * @returns {Promise<Array<{grupo_id, grado, seccion, tutor_id, nivel_nombre}>>}
 */
async function obtenerMetaGruposConexiones(colegio_id, grupoIds) {
  if (!grupoIds || grupoIds.length === 0) return [];
  const ids = [...new Set(grupoIds.map((id) => parseInt(id, 10)).filter((n) => !Number.isNaN(n)))];
  if (ids.length === 0) return [];

  const rows = await query(
    `SELECT g.id AS grupo_id, g.grado, g.seccion, g.tutor_id, g.tutor_id_2, n.nombre AS nivel_nombre
     FROM grupos g
     INNER JOIN niveles n ON n.id = g.nivel_id
     WHERE g.colegio_id = ? AND g.id IN (${ids.map(() => '?').join(',')})
     ORDER BY g.grado, g.seccion`,
    [colegio_id, ...ids]
  );
  return rows || [];
}

function escaparHtmlBasico(str) {
  if (str == null || str === '') return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Asunto limpio (solo texto del remitente) + bloque HTML con contexto de grupo(s).
 * Si el remitente es tutor del grupo, la etiqueta es "Tutoría"; si no, "Grupo".
 */
function enriquecerMensajeConexionesFamiliares({
  asuntoOriginal,
  mensajeOriginal,
  gruposMeta,
  personal_id: personalId
}) {
  if (!gruposMeta || gruposMeta.length === 0) {
    const a = String(asuntoOriginal || '').trim();
    return {
      asuntoFinal: a.length > 300 ? a.substring(0, 300) : a,
      mensajeFinal: mensajeOriginal || '',
      refCorta: ''
    };
  }

  const pid = personalId != null ? parseInt(personalId, 10) : NaN;

  const chips = gruposMeta.map((g) => {
    const gradoPart = g.grado != null && g.grado !== '' ? `${g.grado}°` : null;
    const sec = (g.seccion && String(g.seccion).trim()) || '';
    const gradoSeccion = [gradoPart, sec].filter(Boolean).join(' ') || '—';
    const nivel = (g.nivel_nombre && String(g.nivel_nombre).trim()) || '—';
    const esTutor = !Number.isNaN(pid) && personalEsTutorDeGrupoMeta(pid, g);
    const origen = esTutor ? 'Tutoría' : 'Grupo';
    return {
      origen,
      gradoSeccion,
      nivel,
      lineaCompacta: `${origen}: ${gradoSeccion} · ${nivel}`
    };
  });

  let refUnaLinea = chips.map((c) => c.lineaCompacta).join(' | ');
  const MAX_PREFIX = 140;
  if (refUnaLinea.length > MAX_PREFIX) {
    refUnaLinea = `${chips[0].lineaCompacta}${chips.length > 1 ? ` (+${chips.length - 1} más)` : ''}`;
  }

  const ASUNTO_MAX = 300;
  let asuntoFinal = String(asuntoOriginal || '').trim();
  if (asuntoFinal.length > ASUNTO_MAX) {
    asuntoFinal = asuntoFinal.substring(0, ASUNTO_MAX);
  }

  const chipsHtml = chips
    .map((c) => {
      const border = c.origen === 'Tutoría' ? '#0d9488' : '#4f46e5';
      return `<span style="display:inline-block;margin:4px 6px 4px 0;padding:6px 12px;border-radius:999px;font-size:12px;font-weight:600;background:#fff;box-shadow:0 1px 3px rgba(15,23,42,.08);border-left:3px solid ${border};color:#1e293b;">${escaparHtmlBasico(
        c.origen
      )} · <span style="font-weight:800">${escaparHtmlBasico(c.gradoSeccion)}</span> · ${escaparHtmlBasico(
        c.nivel
      )}</span>`;
    })
    .join('');

  const bloque = `<div style="border-left:4px solid #0f766e;padding:14px 16px;margin:0 0 18px 0;background:linear-gradient(145deg,#ecfdf5 0%,#f0f9ff 45%,#eef2ff 100%);border-radius:0 12px 12px 0;font-size:14px;line-height:1.65;color:#0f172a;">
<div style="font-weight:800;font-size:13px;letter-spacing:.02em;color:#134e4a;margin-bottom:10px;">Conexiones familiares</div>
<div style="font-size:12px;color:#64748b;margin-bottom:8px;">Este mensaje se envía en nombre del siguiente curso / grupo:</div>
<div>${chipsHtml}</div>
</div>`;

  return {
    asuntoFinal,
    mensajeFinal: bloque + (mensajeOriginal || ''),
    refCorta: refUnaLinea
  };
}

const PERFILES_ENVIAR_A = [
  'apoderados',
  'alumnos',
  'docentes',
  'todos',
  'todo_personal',
  'apoderados_alumnos'
];

function normalizarEnviarA(value) {
  const v = String(value || 'todos').toLowerCase();
  return PERFILES_ENVIAR_A.includes(v) ? v : 'todos';
}

/** Alumnos del aula: "todos" / "apoderados_alumnos" / "alumnos". */
function perfilGrupoIncluyeAlumnos(tipo) {
  return tipo === 'todos' || tipo === 'apoderados_alumnos' || tipo === 'alumnos';
}

/** Apoderados del aula (cuenta APODERADO). No incluye docentes del grupo. */
function perfilGrupoIncluyeApoderados(tipo) {
  return tipo === 'todos' || tipo === 'apoderados_alumnos' || tipo === 'apoderados';
}

/**
 * Docentes que enseñan en el grupo (asignaturas + tutores).
 * Solo "docentes". "todos" / "apoderados_alumnos" son familias, no el staff del aula.
 */
function perfilGrupoIncluyeDocentesDelGrupo(tipo) {
  return tipo === 'docentes';
}

module.exports = {
  obtenerMetaGruposConexiones,
  enriquecerMensajeConexionesFamiliares,
  normalizarEnviarA,
  perfilGrupoIncluyeAlumnos,
  perfilGrupoIncluyeApoderados,
  perfilGrupoIncluyeDocentesDelGrupo
};
