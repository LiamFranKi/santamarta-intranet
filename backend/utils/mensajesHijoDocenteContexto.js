/**
 * Contexto de alumno/grupo para mensajes enviados por apoderado (sesión APODERADO o DOCENTE con hijos).
 */
const { query } = require('./mysql');

async function obtenerContextoAlumnoGrupoParaMensaje(colegio_id, anio_activo, alumnoId) {
  const rows = await query(
    `SELECT
       TRIM(CONCAT(COALESCE(a.apellido_paterno, ''), ' ', COALESCE(a.apellido_materno, ''), ', ', COALESCE(a.nombres, ''))) AS nombre_completo_alumno,
       g.grado,
       g.seccion,
       n.nombre AS nivel_nombre
     FROM alumnos a
     LEFT JOIN matriculas m ON m.alumno_id = a.id AND m.colegio_id = a.colegio_id AND (m.estado = 0 OR m.estado = 4)
     LEFT JOIN grupos g ON g.id = m.grupo_id AND g.anio = ?
     LEFT JOIN niveles n ON n.id = g.nivel_id
     WHERE a.id = ? AND a.colegio_id = ?
     ORDER BY (g.id IS NULL) ASC, m.fecha_registro DESC
     LIMIT 1`,
    [anio_activo, alumnoId, colegio_id]
  );
  return rows && rows[0] ? rows[0] : null;
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
 * Asunto (máx. 300) y cuerpo HTML con referencia al alumno/grado (remitente real = apoderado/docente padre).
 */
function enriquecerMensajeApoderadoADocente({ asuntoOriginal, mensajeOriginal, ctx }) {
  const nombre = (ctx && ctx.nombre_completo_alumno && ctx.nombre_completo_alumno.trim()) || 'Alumno';
  const grado = ctx && ctx.grado != null && ctx.grado !== '' ? String(ctx.grado) : null;
  const seccion = (ctx && ctx.seccion) ? String(ctx.seccion).trim() : '';
  const nivel = (ctx && ctx.nivel_nombre) ? String(ctx.nivel_nombre).trim() : '';

  const gradoSeccion = [grado ? `${grado}°` : null, seccion || null].filter(Boolean).join(' ') || 'Sin grupo';
  const nivelTxt = nivel || '—';

  const refUnaLinea = `${nombre} — ${gradoSeccion}${nivel ? ` · ${nivel}` : ''}`;
  const prefix = `[Ref: ${refUnaLinea}] `;
  const MAX = 300;
  let asuntoFinal = prefix + String(asuntoOriginal || '').trim();
  if (asuntoFinal.length > MAX) {
    asuntoFinal = asuntoFinal.substring(0, MAX);
  }

  const bloqueRef = `<div style="border-left:4px solid #6366f1;padding:10px 14px;margin:0 0 14px 0;background:#f1f5f9;font-size:14px;line-height:1.5;">
<strong style="color:#334155;">Mensaje enviado por apoderado</strong><br/>
<strong>Alumno:</strong> ${escaparHtmlBasico(nombre)}<br/>
<strong>Grado y sección:</strong> ${escaparHtmlBasico(gradoSeccion)}<br/>
<strong>Nivel:</strong> ${escaparHtmlBasico(nivelTxt)}
</div>`;

  const mensajeFinal = bloqueRef + (mensajeOriginal || '');
  return { asuntoFinal, mensajeFinal, refUnaLinea };
}

module.exports = {
  obtenerContextoAlumnoGrupoParaMensaje,
  enriquecerMensajeApoderadoADocente
};
