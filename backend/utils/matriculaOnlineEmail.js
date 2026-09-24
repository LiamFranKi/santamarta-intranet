const path = require('path');
const { enviarCorreoHtml } = require('../services/emailService');
const { etiquetaSeguro } = require('./seguroOpciones');
const { buildStaticArchivoUrl, joinStaticFs, getPublicStaticBaseUrl } = require('./staticStorage');
const { query } = require('./mysql');
const { leerIdentidadColegio } = require('./identidadColegio');
const { sincronizarDestinatariosMatriculaLegacy } = require('./matriculaOnlineCorreosSync');

const PLACEHOLDERS_AYUDA = [
  '{{nombre_apoderado}}',
  '{{nombre_alumno}}',
  '{{nivel}}',
  '{{grado}}',
  '{{nivel_grado}}',
  '{{anio_matricula}}',
  '{{fecha_registro}}',
  '{{colegio}}',
  '{{seguro}}',
  '{{dni_alumno}}',
  '{{dni_apoderado}}',
  '{{email_apoderado}}',
  '{{telefono_apoderado}}',
  '{{domicilio}}',
];

/** Datos de pie de correo (alineado al estilo del sitio web institucional). */
const FOOTER_COLEGIO = {
  direccion: 'Jr. Toribio de Luzuriaga Mz F lote 18 y 19 - SMP.',
  telefonos: 'Tel: 045 502 100 / 022 084 833',
  email: 'admin@vanguardschools.edu.pe',
};

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nombreCompletoPersona(ap, am, nom) {
  const apellidos = [ap, am].filter(Boolean).join(' ').trim();
  const nombres = String(nom || '').trim();
  if (apellidos && nombres) return `${apellidos}, ${nombres}`;
  return apellidos || nombres;
}

/** Orden natural: Nombres Apellidos (como en correos del formulario web). */
function nombreNaturalPersona(ap, am, nom) {
  const nombres = String(nom || '').trim();
  const apellidos = [ap, am].filter(Boolean).join(' ').trim();
  if (nombres && apellidos) return `${nombres} ${apellidos}`;
  return nombres || apellidos;
}

function aplicarPlaceholders(texto, vars) {
  let s = String(texto || '');
  for (const [key, val] of Object.entries(vars)) {
    const v = val != null ? String(val) : '';
    s = s.split(`{{${key}}}`).join(v);
    s = s.split(`{${key}}`).join(v);
  }
  return s;
}

/** Convierte HTML legacy (Quill) o texto plano a HTML de párrafos seguro. */
function introAHtml(raw) {
  const t = String(raw || '').trim();
  if (!t) return '';
  if (/<[a-z][\s\S]*>/i.test(t)) {
    return t;
  }
  return t
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px;">${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

async function logoEmailUrl() {
  const { resolverLogoColegio } = require('./logoColegio');
  const logo = await resolverLogoColegio();
  if (logo.desdeConfig && logo.urlAbsoluta) return logo.urlAbsoluta;
  return `${getPublicStaticBaseUrl()}/assets/logos/logo.png`;
}

function filaCampo(label, valueHtml, { esUltimo = false, esLink = false } = {}) {
  const border = esUltimo ? '' : 'border-bottom:1px solid #e8ecf1;';
  const valor = esLink
    ? valueHtml
    : `<span style="font-size:15px;font-weight:700;color:#111827;line-height:1.4;">${valueHtml}</span>`;
  return `
<tr>
  <td style="padding:14px 0;${border}">
    <div style="font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#9ca3af;margin-bottom:4px;">${escapeHtml(label)}</div>
    ${valor}
  </td>
</tr>`;
}

function marcoEmailHtml({
  eyebrow = 'MATRÍCULA ONLINE',
  titulo,
  subtitulo = '',
  introHtml = '',
  camposHtml = '',
  cuerpoExtraHtml = '',
  notaPie = '',
  colegioNombre = 'Vanguard Schools',
  anioCopyright = new Date().getFullYear(),
  logoUrl = '',
  footer,
} = {}) {
  const logo = logoUrl || `${getPublicStaticBaseUrl()}/assets/logos/logo.png`;
  const nombrePie = escapeHtml(colegioNombre || 'Vanguard Schools');
  const sub = String(subtitulo || '').trim();
  const nota = String(notaPie || '').trim();

  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#eef1f5;padding:24px 12px;">
  <tr>
    <td align="center" style="padding:12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;border-collapse:collapse;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 4px 20px rgba(15,23,42,0.08);">
        <tr>
          <td style="background:#1a56db;padding:28px 28px 26px;text-align:center;">
            <img src="${logo}" alt="${nombrePie}" width="140" style="display:block;margin:0 auto 16px;max-width:140px;height:auto;border:0;" />
            <div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.85);margin:0 0 8px;">${escapeHtml(eyebrow)}</div>
            <div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:22px;font-weight:700;line-height:1.3;color:#ffffff;margin:0;">${escapeHtml(titulo || '')}</div>
            ${sub ? `<div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:500;color:rgba(255,255,255,0.92);margin:10px 0 0;">${escapeHtml(sub)}</div>` : ''}
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px 8px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937;font-size:15px;line-height:1.6;">
            ${introHtml || ''}
            ${camposHtml ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 4px;">${camposHtml}</table>` : ''}
            ${cuerpoExtraHtml || ''}
            ${nota ? `<p style="margin:20px 0 8px;font-size:13px;color:#6b7280;line-height:1.5;">${escapeHtml(nota)}</p>` : ''}
          </td>
        </tr>
        <tr>
          <td style="padding:8px 24px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f3f4f6;border-radius:8px;">
              <tr>
                <td style="padding:18px 20px;text-align:center;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
                  <div style="font-size:15px;font-weight:700;color:#1a56db;margin:0 0 6px;">${nombrePie}</div>
                  <div style="font-size:12px;color:#4b5563;line-height:1.55;margin:0 0 4px;">${escapeHtml((footer || FOOTER_COLEGIO).direccion)}</div>
                  <div style="font-size:12px;color:#4b5563;line-height:1.55;margin:0 0 8px;">
                    ${escapeHtml((footer || FOOTER_COLEGIO).telefonos)} —
                    <a href="mailto:${(footer || FOOTER_COLEGIO).email}" style="color:#1a56db;text-decoration:none;">${escapeHtml((footer || FOOTER_COLEGIO).email)}</a>
                  </div>
                  <div style="font-size:11px;color:#9ca3af;margin:0;">© ${anioCopyright} ${nombrePie} — Mensaje automático de matrícula online</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

function plantillaApoderadoDefault() {
  return `Estimado/a {{nombre_apoderado}},

Hemos recibido correctamente su pre-matrícula online. Nuestro equipo la revisará y se comunicará con usted si requiere información adicional.

Estado actual: Temporal · Año académico {{anio_matricula}}.`;
}

function plantillaInternaDefault() {
  return `Nueva pre-matrícula online registrada en el sistema (estado Temporal).`;
}

function gradoLabel(nivelNombre, grado) {
  const n = String(nivelNombre || '').toUpperCase();
  const g = parseInt(grado, 10);
  if (n.includes('INICIAL')) return `${g} años`;
  return `${g}°`;
}

function subtituloNivelGrado(nivelNombre, grado) {
  const n = String(nivelNombre || '').trim();
  const g = gradoLabel(nivelNombre, grado);
  if (!n && !g) return '';
  if (n.toUpperCase().includes('INICIAL')) return `${g} ${n}`.trim();
  return `${g} ${n}`.replace(/\s+/g, ' ').trim();
}

function buildVarsEmail(ctx) {
  const nombreAlumno = nombreCompletoPersona(
    ctx.alumno.apellido_paterno,
    ctx.alumno.apellido_materno,
    ctx.alumno.nombres
  );
  const nombreApoderado = nombreCompletoPersona(
    ctx.apoderado.apellido_paterno,
    ctx.apoderado.apellido_materno,
    ctx.apoderado.nombres
  );
  const nombreAlumnoNatural = nombreNaturalPersona(
    ctx.alumno.apellido_paterno,
    ctx.alumno.apellido_materno,
    ctx.alumno.nombres
  );
  const nombreApoderadoNatural = nombreNaturalPersona(
    ctx.apoderado.apellido_paterno,
    ctx.apoderado.apellido_materno,
    ctx.apoderado.nombres
  );
  const nivelTxt = ctx.nivelNombre || '';
  const gradoTxt = gradoLabel(ctx.nivelNombre, ctx.grado);
  const nivelGrado = subtituloNivelGrado(ctx.nivelNombre, ctx.grado);
  const emailAp = ctx.apoderado.email || '';
  return {
    nombre_apoderado: nombreApoderado,
    nombre_alumno: nombreAlumno,
    nombre_alumno_natural: nombreAlumnoNatural,
    nombre_apoderado_natural: nombreApoderadoNatural,
    dni_alumno: ctx.alumno.nro_documento || '',
    dni_apoderado: ctx.apoderado.nro_documento || '',
    nivel: nivelTxt,
    grado: gradoTxt,
    nivel_postula: nivelTxt,
    grado_postula: gradoTxt,
    nivel_grado: nivelTxt && gradoTxt ? `${nivelTxt} — ${gradoTxt}` : nivelTxt || gradoTxt,
    nivel_grado_subtitulo: nivelGrado,
    anio_matricula: String(ctx.anioMatricula || ''),
    fecha_registro: ctx.fechaRegistro || '',
    colegio: ctx.colegioNombre || 'Vanguard Schools',
    seguro: etiquetaSeguro(ctx.alumno.seguro_id),
    email_apoderado: emailAp,
    telefono_apoderado: ctx.apoderado.telefono_celular || '',
    domicilio: ctx.alumno.domicilio || '',
    documentos_aceptados_html: (ctx.documentosAceptados || [])
      .map((d) => `<li>${escapeHtml(d.titulo)}</li>`)
      .join('') || '<li>—</li>',
  };
}

function camposResumenApoderado(vars) {
  return [
    filaCampo('Estudiante', escapeHtml(vars.nombre_alumno_natural || vars.nombre_alumno)),
    filaCampo('DNI estudiante', escapeHtml(vars.dni_alumno || '—')),
    filaCampo('Grado / nivel', escapeHtml(vars.nivel_grado_subtitulo || vars.nivel_grado || '—')),
    filaCampo('Año matrícula', escapeHtml(vars.anio_matricula || '—')),
    filaCampo('Apoderado', escapeHtml(vars.nombre_apoderado_natural || vars.nombre_apoderado)),
    filaCampo('Fecha de registro', escapeHtml(vars.fecha_registro || '—'), { esUltimo: true }),
  ].join('');
}

function camposResumenInterno(vars) {
  const emailLink = vars.email_apoderado
    ? `<a href="mailto:${escapeHtml(vars.email_apoderado)}" style="font-size:15px;font-weight:700;color:#1a56db;text-decoration:none;">${escapeHtml(vars.email_apoderado)}</a>`
    : `<span style="font-size:15px;font-weight:700;color:#111827;">—</span>`;
  const filas = [
    filaCampo('Estudiante', escapeHtml(vars.nombre_alumno_natural || vars.nombre_alumno)),
    filaCampo('DNI estudiante', escapeHtml(vars.dni_alumno || '—')),
    filaCampo('Grado de interés', escapeHtml(vars.nivel_grado_subtitulo || vars.nivel_grado || '—')),
    filaCampo('Año matrícula', escapeHtml(vars.anio_matricula || '—')),
    filaCampo('Seguro', escapeHtml(vars.seguro || '—')),
    filaCampo('Apoderado', escapeHtml(vars.nombre_apoderado_natural || vars.nombre_apoderado)),
    filaCampo('DNI apoderado', escapeHtml(vars.dni_apoderado || '—')),
    filaCampo('Teléfono', escapeHtml(vars.telefono_apoderado || '—')),
    filaCampo('Email', emailLink, { esLink: true }),
  ];
  if (vars.domicilio) {
    filas.push(filaCampo('Dirección', escapeHtml(vars.domicilio)));
  }
  filas.push(filaCampo('Fecha de registro', escapeHtml(vars.fecha_registro || '—'), { esUltimo: true }));
  return filas.join('');
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

function destinatariosDesdeConfigLegacy(config) {
  return String(config?.email_notificacion_matricula_online || '')
    .split(/[,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes('@'));
}

/** Destinatarios internos: Web → Correos de envío (canal Matrícula). Migra legacy automáticamente. */
async function resolverDestinatariosInternos(config) {
  try {
    await sincronizarDestinatariosMatriculaLegacy({
      legacyRaw: config?.email_notificacion_matricula_online,
    });
  } catch (e) {
    console.warn('[matricula-online email] sync legacy:', e.message);
  }

  try {
    const rows = await query(
      `SELECT email FROM web_correos_envio
       WHERE activo = 1 AND recibe_matricula = 1
       ORDER BY email ASC`
    );
    const emails = (rows || [])
      .map((r) => String(r.email || '').trim().toLowerCase())
      .filter((e) => e.includes('@'));
    if (emails.length) return [...new Set(emails)];
  } catch (e) {
    console.warn('[matricula-online email] web_correos_envio:', e.message);
  }
  return [...new Set(destinatariosDesdeConfigLegacy(config))];
}

async function enviarEmailsMatriculaOnline({
  config,
  ctx,
  fotoDniFilename,
  firmaFilename,
}) {
  const vars = buildVarsEmail(ctx);
  const identidad = await leerIdentidadColegio(1);
  const colegioNombre = identidad.titulo || config.remitente_emails || vars.colegio || 'Vanguard Schools';
  const subtitulo = vars.nivel_grado_subtitulo || vars.nivel_grado;
  const resultados = { apoderado: null, internos: [] };
  const logoUrl = await logoEmailUrl();
  const footerContacto = {
    direccion: identidad.direccionContacto,
    telefonos: identidad.telefono,
    email: identidad.correo,
  };

  // Intro opcional. Vacío → texto corto del sistema. Marco + campos siempre los arma el backend.
  const introApoderadoSrc = (config.email_matricula_apoderado || '').trim() || plantillaApoderadoDefault();
  const introApoderado = introAHtml(aplicarPlaceholders(introApoderadoSrc, vars));

  const htmlApoderado = marcoEmailHtml({
    eyebrow: 'MATRÍCULA ONLINE',
    titulo: 'Pre-matrícula recibida',
    subtitulo,
    introHtml: introApoderado,
    camposHtml: camposResumenApoderado(vars),
    notaPie: 'Este es un mensaje automático. Si tiene consultas, responda a este correo o comuníquese con el colegio.',
    colegioNombre,
    logoUrl,
    footer: footerContacto,
  });

  if (ctx.apoderado.email) {
    resultados.apoderado = await enviarCorreoHtml(
      ctx.apoderado.email,
      `Pre-matrícula recibida — ${vars.nombre_alumno_natural || vars.nombre_alumno}`,
      htmlApoderado,
      colegioNombre,
      'GENERAL'
    );
  }

  const destinatarios = await resolverDestinatariosInternos(config);

  if (destinatarios.length) {
    const introInternoSrc = (config.email_matricula_interno || '').trim() || plantillaInternaDefault();
    const introInterno = introAHtml(aplicarPlaceholders(introInternoSrc, vars));

    let docsExtra = `<div style="margin:16px 0 4px;"><div style="font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#9ca3af;margin-bottom:8px;">Documentos aceptados</div><ul style="margin:0;padding-left:18px;color:#1f2937;font-size:14px;line-height:1.55;">${vars.documentos_aceptados_html}</ul></div>`;

    if (fotoDniFilename) {
      const url = `${getPublicStaticBaseUrl()}/Static/Documentos/${path.basename(fotoDniFilename)}`;
      docsExtra += `<p style="margin:14px 0 0;font-size:14px;"><strong>Foto DNI:</strong> <a href="${url}" style="color:#1a56db;">Ver imagen</a></p>`;
    }
    if (firmaFilename) {
      const url = buildStaticArchivoUrl(path.basename(firmaFilename));
      docsExtra += `<p style="margin:8px 0 0;font-size:14px;"><strong>Firma:</strong> <a href="${url}" style="color:#1a56db;">Ver imagen</a></p>`;
    }

    const asuntoInterno =
      (config.email_matricula_interno_asunto || '').trim() ||
      `Nueva matrícula online — ${vars.nombre_alumno_natural || vars.nombre_alumno} (${vars.anio_matricula})`;
    const asuntoFinal = aplicarPlaceholders(asuntoInterno, vars);

    const htmlInterno = marcoEmailHtml({
      eyebrow: 'MATRÍCULA ONLINE',
      titulo: 'Nueva pre-matrícula',
      subtitulo,
      introHtml: introInterno,
      camposHtml: camposResumenInterno(vars),
      cuerpoExtraHtml: docsExtra,
      notaPie: vars.email_apoderado
        ? 'Puede responder directamente a este correo (Reply-To del apoderado).'
        : '',
      colegioNombre,
      logoUrl,
      footer: footerContacto,
    });

    const attachments = adjuntosDesdeArchivos({ fotoDniFilename, firmaFilename });
    const mailOpts = { attachments };
    if (vars.email_apoderado) {
      mailOpts.replyTo = vars.email_apoderado;
    }

    for (const dest of destinatarios) {
      const r = await enviarCorreoHtml(
        dest,
        asuntoFinal,
        htmlInterno,
        colegioNombre,
        'GENERAL',
        mailOpts
      );
      resultados.internos.push({ email: dest, ...r });
    }
  } else {
    console.warn('[matricula-online email] Sin destinatarios internos (canal Matrícula / legacy vacío)');
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
  marcoEmailHtml,
  resolverDestinatariosInternos,
};
