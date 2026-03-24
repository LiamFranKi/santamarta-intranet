/**
 * Contexto para mensajes DOCENTE → APODERADO (quién escribe, sobre qué hijo/grado/asignatura o tutoría).
 */
const { query } = require('./mysql');

function escaparHtmlBasico(str) {
  if (str == null || str === '') return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function obtenerApoderadoMeta(usuarioId, colegio_id) {
  const r = await query(
    `SELECT u.tipo, u.apoderado_id FROM usuarios u WHERE u.id = ? AND u.colegio_id = ? LIMIT 1`,
    [usuarioId, colegio_id]
  );
  return r && r[0] ? r[0] : null;
}

async function apoderadoEsPadreDeAlumno(apoderadoUsuarioId, alumnoId, colegio_id) {
  const r = await query(
    `SELECT 1 AS ok
     FROM usuarios u
     INNER JOIN apoderados ap ON ap.id = u.apoderado_id AND ap.colegio_id = ?
     INNER JOIN familias f ON f.apoderado_id = ap.id
     WHERE u.id = ? AND u.colegio_id = ? AND f.alumno_id = ?
     LIMIT 1`,
    [colegio_id, apoderadoUsuarioId, colegio_id, alumnoId]
  );
  return !!(r && r[0]);
}

async function obtenerNombreDocente(personal_id) {
  const r = await query(
    `SELECT TRIM(CONCAT(COALESCE(nombres,''), ' ', COALESCE(apellidos,''))) AS nombre FROM personal WHERE id = ? LIMIT 1`,
    [personal_id]
  );
  const n = r && r[0] && r[0].nombre ? String(r[0].nombre).trim() : '';
  return n || 'Docente';
}

/**
 * Matrícula vigente + datos alumno/grupo
 */
async function datosAlumnoGrupo(colegio_id, anio_activo, alumno_id) {
  const rows = await query(
    `SELECT m.grupo_id, g.grado, g.seccion, n.nombre AS nivel_nombre,
            TRIM(CONCAT(COALESCE(a.apellido_paterno,''), ' ', COALESCE(a.apellido_materno,''), ', ', COALESCE(a.nombres,''))) AS nombre_alumno
     FROM matriculas m
     INNER JOIN grupos g ON g.id = m.grupo_id AND g.anio = ? AND g.colegio_id = ?
     INNER JOIN alumnos a ON a.id = m.alumno_id AND a.colegio_id = ?
     LEFT JOIN niveles n ON n.id = g.nivel_id
     WHERE m.alumno_id = ? AND m.colegio_id = ? AND (m.estado = 0 OR m.estado = 4)
     ORDER BY m.fecha_registro DESC
     LIMIT 1`,
    [anio_activo, colegio_id, colegio_id, alumno_id, colegio_id]
  );
  return rows && rows[0] ? rows[0] : null;
}

async function cursosDocenteEnGrupo(personal_id, grupo_id, colegio_id) {
  const rows = await query(
    `SELECT DISTINCT c.nombre AS curso_nombre
     FROM asignaturas ast
     INNER JOIN cursos c ON c.id = ast.curso_id
     WHERE ast.personal_id = ? AND ast.grupo_id = ? AND ast.colegio_id = ?
     ORDER BY c.nombre`,
    [personal_id, grupo_id, colegio_id]
  );
  return (rows || []).map((x) => x.curso_nombre).filter(Boolean);
}

async function esTutorDeGrupo(personal_id, grupo_id, colegio_id, anio_activo) {
  const r = await query(
    `SELECT 1 AS ok FROM grupos g
     WHERE g.id = ? AND g.tutor_id = ? AND g.colegio_id = ? AND g.anio = ?
     LIMIT 1`,
    [grupo_id, personal_id, colegio_id, anio_activo]
  );
  return !!(r && r[0]);
}

/**
 * Resume rol del docente respecto a un alumno concreto.
 */
async function contextoDocenteParaAlumno(colegio_id, anio_activo, personal_id, alumno_id) {
  const base = await datosAlumnoGrupo(colegio_id, anio_activo, alumno_id);
  if (!base) return null;
  const gradoTxt = [base.grado != null ? `${base.grado}°` : '', base.seccion ? String(base.seccion).trim() : '']
    .filter(Boolean)
    .join(' ')
    .trim() || '—';
  const cursos = await cursosDocenteEnGrupo(personal_id, base.grupo_id, colegio_id);
  const tutor = await esTutorDeGrupo(personal_id, base.grupo_id, colegio_id, anio_activo);
  return {
    nombre_alumno: (base.nombre_alumno || 'Alumno').trim(),
    gradoTxt,
    nivel_nombre: (base.nivel_nombre || '').trim(),
    cursos,
    esTutor: tutor
  };
}

async function hijosDelApoderadoUsuario(apoderadoUsuarioId, colegio_id) {
  const rows = await query(
    `SELECT DISTINCT a.id AS alumno_id
     FROM usuarios u
     INNER JOIN apoderados ap ON ap.id = u.apoderado_id AND ap.colegio_id = ?
     INNER JOIN familias f ON f.apoderado_id = ap.id
     INNER JOIN alumnos a ON a.id = f.alumno_id AND a.colegio_id = ?
     WHERE u.id = ? AND u.colegio_id = ?`,
    [colegio_id, colegio_id, apoderadoUsuarioId, colegio_id]
  );
  return (rows || []).map((x) => x.alumno_id);
}

async function hijosApoderadoEnGrupos(apoderadoUsuarioId, colegio_id, anio_activo, gruposIds) {
  if (!gruposIds || gruposIds.length === 0) return [];
  const ph = gruposIds.map(() => '?').join(',');
  const rows = await query(
    `SELECT DISTINCT a.id AS alumno_id
     FROM usuarios u
     INNER JOIN apoderados ap ON ap.id = u.apoderado_id AND ap.colegio_id = ?
     INNER JOIN familias f ON f.apoderado_id = ap.id
     INNER JOIN alumnos a ON a.id = f.alumno_id AND a.colegio_id = ?
     INNER JOIN matriculas m ON m.alumno_id = a.id AND m.colegio_id = ? AND (m.estado = 0 OR m.estado = 4)
     INNER JOIN grupos g ON g.id = m.grupo_id AND g.anio = ? AND g.colegio_id = ?
     WHERE u.id = ? AND u.colegio_id = ? AND g.id IN (${ph})`,
    [colegio_id, colegio_id, colegio_id, anio_activo, colegio_id, apoderadoUsuarioId, colegio_id, ...gruposIds]
  );
  return (rows || []).map((x) => x.alumno_id);
}

function lineaRolDocente(ctx) {
  const partes = [];
  if (ctx.cursos && ctx.cursos.length) {
    partes.push(`Profesor(a) de: ${ctx.cursos.join(', ')}`);
  }
  if (ctx.esTutor) {
    partes.push('Tutor(a) de este grupo');
  }
  if (!partes.length) return 'Sin asignaturas registradas a su nombre en el grupo del alumno (mensaje general).';
  return partes.join(' · ');
}

function bloqueHtml({ docenteNombre, lineasHtmlInternas }) {
  const inner = lineasHtmlInternas.join('');
  return `<div style="border-left:4px solid #4a83c1;padding:12px 16px;margin:0 0 16px 0;background:linear-gradient(135deg,#f0f7ff 0%,#f8fafc 100%);font-size:14px;line-height:1.55;border-radius:0 10px 10px 0;box-shadow:0 1px 4px rgba(30,58,95,0.08);">
<strong style="color:#1e3a5f;display:block;margin-bottom:8px;font-size:15px;">📋 Contexto del mensaje</strong>
<strong style="color:#475569;">Docente:</strong> ${escaparHtmlBasico(docenteNombre)}<br/>
${inner}
</div>`;
}

/**
 * Devuelve { asuntoFinal, mensajeFinal } o null si no aplica enriquecimiento.
 */
async function enriquecerMensajeDocenteParaDestinatario({
  colegio_id,
  anio_activo,
  personal_id,
  destinatarioUsuarioId,
  asuntoOriginal,
  mensajeOriginal,
  contexto_alumno_id,
  gruposIds,
  mensaje_desde_tutoria
}) {
  if (!personal_id) return null;

  const meta = await obtenerApoderadoMeta(destinatarioUsuarioId, colegio_id);
  if (!meta || meta.apoderado_id == null) return null;

  const docenteNombre = await obtenerNombreDocente(personal_id);

  let items = [];

  const alumnoIdNum = contexto_alumno_id != null && contexto_alumno_id !== '' ? parseInt(contexto_alumno_id, 10) : NaN;
  if (!isNaN(alumnoIdNum) && alumnoIdNum > 0) {
    const esPadre = await apoderadoEsPadreDeAlumno(destinatarioUsuarioId, alumnoIdNum, colegio_id);
    if (esPadre) {
      const ctx = await contextoDocenteParaAlumno(colegio_id, anio_activo, personal_id, alumnoIdNum);
      if (ctx) {
        items.push({
          titulo: 'Estudiante',
          nombre: ctx.nombre_alumno,
          grado: ctx.gradoTxt,
          nivel: ctx.nivel_nombre,
          rol: lineaRolDocente(ctx)
        });
      }
    }
  }

  if (items.length === 0 && gruposIds && gruposIds.length > 0) {
    const hijosEnGrupo = await hijosApoderadoEnGrupos(destinatarioUsuarioId, colegio_id, anio_activo, gruposIds);
    const unicos = [...new Set(hijosEnGrupo)];
    for (const aid of unicos) {
      const ctx = await contextoDocenteParaAlumno(colegio_id, anio_activo, personal_id, aid);
      if (ctx) {
        const rol = lineaRolDocente(ctx);
        items.push({
          titulo: 'Estudiante en el grupo destinatario',
          nombre: ctx.nombre_alumno,
          grado: ctx.gradoTxt,
          nivel: ctx.nivel_nombre,
          rol
        });
      }
    }
  }

  if (items.length === 0) {
    const todosHijos = await hijosDelApoderadoUsuario(destinatarioUsuarioId, colegio_id);
    for (const aid of todosHijos) {
      const ctx = await contextoDocenteParaAlumno(colegio_id, anio_activo, personal_id, aid);
      if (!ctx) continue;
      const rol = lineaRolDocente(ctx);
      if (rol.includes('Sin asignaturas') && !ctx.esTutor) continue;
      items.push({
        titulo: 'Estudiante',
        nombre: ctx.nombre_alumno,
        grado: ctx.gradoTxt,
        nivel: ctx.nivel_nombre,
        rol
      });
    }
  }

  const lineasInner = [];
  if (mensaje_desde_tutoria === true || mensaje_desde_tutoria === 'true') {
    lineasInner.push(
      `<span style="display:inline-block;margin-bottom:6px;padding:3px 10px;background:rgba(74,131,193,0.12);color:#1e3a5f;border-radius:999px;font-size:12px;font-weight:600;">Módulo Tutoría</span><br/>`
    );
  }

  if (items.length === 0) {
    lineasInner.push(
      `<span style="color:#64748b;">Este mensaje fue enviado por un docente del colegio. Si no reconoce el nombre, puede verificar en la intranet o contactar a secretaría.</span><br/>`
    );
  } else if (items.length === 1) {
    const it = items[0];
    lineasInner.push(
      `<strong style="color:#475569;">${escaparHtmlBasico(it.titulo)}:</strong> ${escaparHtmlBasico(it.nombre)}<br/>` +
        `<strong style="color:#475569;">Grado y sección:</strong> ${escaparHtmlBasico(it.grado)}` +
        (it.nivel ? ` · ${escaparHtmlBasico(it.nivel)}` : '') +
        `<br/><strong style="color:#475569;">Vínculo con su hijo(a):</strong> ${escaparHtmlBasico(it.rol)}<br/>`
    );
  } else {
    lineasInner.push(`<strong style="color:#475569;">Relación con sus hijos(as) en el colegio:</strong><ul style="margin:8px 0 0 18px;padding:0;color:#334155;">`);
    for (const it of items) {
      lineasInner.push(
        `<li style="margin-bottom:6px;"><strong>${escaparHtmlBasico(it.nombre)}</strong> — ${escaparHtmlBasico(it.grado)}` +
          (it.nivel ? ` · ${escaparHtmlBasico(it.nivel)}` : '') +
          `<br/><span style="font-size:13px;color:#64748b;">${escaparHtmlBasico(it.rol)}</span></li>`
      );
    }
    lineasInner.push(`</ul>`);
  }

  const refCorta =
    items.length === 1
      ? `${items[0].nombre} (${items[0].grado})`
      : items.length > 1
        ? `${items.length} estudiantes`
        : 'Docente';

  const prefix = `[Ref: ${refCorta}] `;
  const MAX = 300;
  let asuntoFinal = prefix + String(asuntoOriginal || '').trim();
  if (asuntoFinal.length > MAX) asuntoFinal = asuntoFinal.substring(0, MAX);

  const mensajeFinal = bloqueHtml({ docenteNombre, lineasHtmlInternas: lineasInner }) + (mensajeOriginal || '');

  return { asuntoFinal, mensajeFinal };
}

module.exports = {
  enriquecerMensajeDocenteParaDestinatario
};
