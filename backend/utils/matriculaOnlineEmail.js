const path = require('path');
const { enviarCorreoHtml } = require('../services/emailService');
const { etiquetaSeguro } = require('./seguroOpciones');
const { buildStaticArchivoUrl, joinStaticFs, getPublicStaticBaseUrl } = require('./staticStorage');

const PLACEHOLDERS_AYUDA = [
  '{{nombre_apoderado}}',
  '{{nombre_alumno}}',
  '{{nivel}}',
  '{{grado}}',
  '{{anio_matricula}}',
  '{{fecha_registro}}',
  '{{colegio}}',
  '{{seguro}}',
  '{{email_apoderado}}',
  '{{telefono_apoderado}}',
];

function aplicarPlaceholders(texto, vars) {
  let s = String(texto || '');
  for (const [key, val] of Object.entries(vars)) {
    const v = val != null ? String(val) : '';
    s = s.split(`{{${key}}}`).join(v);
    s = s.split(`{${key}}`).join(v);
  }
  return s;
}

function marcoEmailHtml(titulo, cuerpoInterior, colegioNombre) {
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);">
  <tr>
    <td style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:28px 32px;color:#ffffff;">
      <div style="font-size:13px;opacity:0.9;letter-spacing:0.04em;text-transform:uppercase;">${colegioNombre || 'Vanguard Schools'}</div>
      <div style="font-size:22px;font-weight:700;margin-top:8px;line-height:1.3;">${titulo}</div>
    </td>
  </tr>
  <tr>
    <td style="padding:32px;color:#334155;font-size:15px;line-height:1.65;">
      ${cuerpoInterior}
    </td>
  </tr>
  <tr>
    <td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;text-align:center;">
      Este correo fue generado automáticamente por el sistema de matrícula online.
    </td>
  </tr>
</table>`;
}

function plantillaApoderadoDefault() {
  return `<p>Estimado/a <strong>{{nombre_apoderado}}</strong>,</p>
<p>Hemos recibido correctamente la solicitud de matrícula online de <strong>{{nombre_alumno}}</strong> para el nivel <strong>{{nivel}}</strong>, grado <strong>{{grado}}</strong>, correspondiente al año académico <strong>{{anio_matricula}}</strong>.</p>
<p>Su solicitud quedó registrada con estado <strong>Temporal</strong>. Nuestro equipo la revisará y se comunicará con usted si requiere información adicional.</p>
<p>Fecha de registro: <strong>{{fecha_registro}}</strong>.</p>
<p>Atentamente,<br><strong>{{colegio}}</strong></p>`;
}

function plantillaInternaDefault() {
  return `<p>Se registró una nueva matrícula online <strong>Temporal</strong>.</p>
<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
  <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b;width:40%;">Alumno</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;"><strong>{{nombre_alumno}}</strong> (DNI {{dni_alumno}})</td></tr>
  <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b;">Nivel / Grado</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">{{nivel}} — {{grado}}</td></tr>
  <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b;">Año matrícula</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">{{anio_matricula}}</td></tr>
  <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b;">Seguro</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">{{seguro}}</td></tr>
  <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b;">Apoderado</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">{{nombre_apoderado}} (DNI {{dni_apoderado}})</td></tr>
  <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b;">Contacto</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">{{email_apoderado}} · {{telefono_apoderado}}</td></tr>
  <tr><td style="padding:8px;color:#64748b;">Fecha</td><td style="padding:8px;">{{fecha_registro}}</td></tr>
</table>
<p><strong>Documentos aceptados:</strong></p>
{{documentos_aceptados_html}}`;
}

function gradoLabel(nivelNombre, grado) {
  const n = String(nivelNombre || '').toUpperCase();
  const g = parseInt(grado, 10);
  if (n.includes('INICIAL')) return `${g} años`;
  return `${g}°`;
}

function buildVarsEmail(ctx) {
  const nombreAlumno = [ctx.alumno.nombres, ctx.alumno.apellido_paterno, ctx.alumno.apellido_materno]
    .filter(Boolean)
    .join(' ')
    .trim();
  const nombreApoderado = [ctx.apoderado.nombres, ctx.apoderado.apellido_paterno, ctx.apoderado.apellido_materno]
    .filter(Boolean)
    .join(' ')
    .trim();
  return {
    nombre_apoderado: nombreApoderado,
    nombre_alumno: nombreAlumno,
    dni_alumno: ctx.alumno.nro_documento || '',
    dni_apoderado: ctx.apoderado.nro_documento || '',
    nivel: ctx.nivelNombre || '',
    grado: gradoLabel(ctx.nivelNombre, ctx.grado),
    anio_matricula: String(ctx.anioMatricula || ''),
    fecha_registro: ctx.fechaRegistro || '',
    colegio: ctx.colegioNombre || 'Vanguard Schools',
    seguro: etiquetaSeguro(ctx.alumno.seguro_id),
    email_apoderado: ctx.apoderado.email || '',
    telefono_apoderado: ctx.apoderado.telefono_celular || '',
    documentos_aceptados_html: (ctx.documentosAceptados || [])
      .map((d) => `<li>${d.titulo}</li>`)
      .join('') || '<li>—</li>',
  };
}

function adjuntosDesdeArchivos({ fotoDniFilename, firmaFilename }) {
  const attachments = [];
  if (fotoDniFilename) {
    const abs = joinStaticFs('Documentos', path.basename(fotoDniFilename));
    attachments.push({
      filename: `dni-${path.basename(fotoDniFilename)}`,
      path: abs,
    });
  }
  if (firmaFilename) {
    const abs = joinStaticFs('Archivos', path.basename(firmaFilename));
    attachments.push({
      filename: `firma-${path.basename(firmaFilename)}`,
      path: abs,
    });
  }
  return attachments;
}

async function enviarEmailsMatriculaOnline({
  config,
  ctx,
  fotoDniFilename,
  firmaFilename,
}) {
  const vars = buildVarsEmail(ctx);
  const colegioNombre = config.remitente_emails || vars.colegio;
  const resultados = { apoderado: null, internos: [] };

  const cuerpoApoderadoRaw = (config.email_matricula_apoderado || '').trim() || plantillaApoderadoDefault();
  const cuerpoApoderado = aplicarPlaceholders(cuerpoApoderadoRaw, vars);
  const htmlApoderado = marcoEmailHtml('Confirmación de matrícula online', cuerpoApoderado, colegioNombre);

  if (ctx.apoderado.email) {
    resultados.apoderado = await enviarCorreoHtml(
      ctx.apoderado.email,
      `Matrícula online recibida — ${vars.nombre_alumno}`,
      htmlApoderado,
      colegioNombre,
      'GENERAL'
    );
  }

  const internosRaw = (config.email_notificacion_matricula_online || '').trim();
  const destinatarios = internosRaw
    .split(/[,;]+/)
    .map((e) => e.trim())
    .filter(Boolean);

  if (destinatarios.length) {
    const cuerpoInternoRaw = (config.email_matricula_interno || '').trim() || plantillaInternaDefault();
    let cuerpoInterno = aplicarPlaceholders(cuerpoInternoRaw, vars);
    if (!cuerpoInterno.includes('<ul') && cuerpoInterno.includes('{{documentos_aceptados_html}}')) {
      cuerpoInterno = cuerpoInterno.replace(
        '{{documentos_aceptados_html}}',
        `<ul>${vars.documentos_aceptados_html}</ul>`
      );
    } else if (cuerpoInterno.includes('<li>')) {
      /* ok */
    } else if (vars.documentos_aceptados_html) {
      cuerpoInterno += `<ul>${vars.documentos_aceptados_html}</ul>`;
    }

    if (fotoDniFilename) {
      const url = `${getPublicStaticBaseUrl()}/Static/Documentos/${path.basename(fotoDniFilename)}`;
      cuerpoInterno += `<p style="margin-top:16px;"><strong>Foto DNI:</strong> <a href="${url}">Ver imagen</a></p>`;
    }
    if (firmaFilename) {
      const url = buildStaticArchivoUrl(path.basename(firmaFilename));
      cuerpoInterno += `<p><strong>Firma:</strong> <a href="${url}">Ver imagen</a></p>`;
    }

    const asuntoInterno =
      (config.email_matricula_interno_asunto || '').trim() ||
      `Nueva matrícula online — ${vars.nombre_alumno} (${vars.anio_matricula})`;
    const asuntoFinal = aplicarPlaceholders(asuntoInterno, vars);
    const htmlInterno = marcoEmailHtml('Nueva matrícula online', cuerpoInterno, colegioNombre);
    const attachments = adjuntosDesdeArchivos({ fotoDniFilename, firmaFilename });

    for (const dest of destinatarios) {
      const r = await enviarCorreoHtml(dest, asuntoFinal, htmlInterno, colegioNombre, 'GENERAL', { attachments });
      resultados.internos.push({ email: dest, ...r });
    }
  }

  return resultados;
}

module.exports = {
  PLACEHOLDERS_AYUDA,
  aplicarPlaceholders,
  plantillaApoderadoDefault,
  plantillaInternaDefault,
  enviarEmailsMatriculaOnline,
  gradoLabel,
};
