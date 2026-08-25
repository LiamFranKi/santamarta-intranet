/**
 * Migra destinatarios legacy (config.email_notificacion_matricula_online)
 * hacia web_correos_envio con recibe_matricula=1. Idempotente.
 */
const { query, execute } = require('./mysql');

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function toBool01(v) {
  if (Buffer.isBuffer(v)) return v.length && v[0] ? 1 : 0;
  if (v && typeof v === 'object' && Array.isArray(v.data)) return v.data[0] ? 1 : 0;
  if (v === true || v === 1 || v === '1' || v === 'true') return 1;
  return 0;
}

function parseListaEmails(raw) {
  return String(raw || '')
    .split(/[,;]+/)
    .map((e) => normalizeEmail(e))
    .filter((e) => isValidEmail(e));
}

/**
 * @param {object} [opts]
 * @param {string} [opts.legacyRaw] valor ya leído de config (evita query extra)
 */
async function sincronizarDestinatariosMatriculaLegacy(opts = {}) {
  let emails = parseListaEmails(opts.legacyRaw);
  if (!emails.length) {
    const rows = await query(
      `SELECT valor FROM config WHERE clave = 'email_notificacion_matricula_online' LIMIT 1`
    );
    emails = parseListaEmails(rows?.[0]?.valor);
  }

  if (!emails.length) {
    return { ok: true, imported: 0, updated: 0, skipped: true };
  }

  let imported = 0;
  let updated = 0;

  for (const email of emails) {
    const exists = await query(
      'SELECT id, recibe_matricula FROM web_correos_envio WHERE email = ? LIMIT 1',
      [email]
    );
    if (exists?.length) {
      if (!toBool01(exists[0].recibe_matricula)) {
        await execute('UPDATE web_correos_envio SET recibe_matricula = 1, activo = 1 WHERE id = ?', [
          exists[0].id,
        ]);
        updated += 1;
      }
    } else {
      await execute(
        `INSERT INTO web_correos_envio
          (email, etiqueta, activo, recibe_sugerencias, recibe_reclamos,
           recibe_contacto, recibe_visitas, recibe_trabaja, recibe_admision, recibe_matricula)
         VALUES (?, 'Matrícula online', 1, 0, 0, 0, 0, 0, 0, 1)`,
        [email]
      );
      imported += 1;
    }
  }

  return {
    ok: true,
    imported,
    updated,
    message: `Sincronizados: ${imported} nuevos, ${updated} actualizados.`,
  };
}

module.exports = {
  sincronizarDestinatariosMatriculaLegacy,
  parseListaEmails,
};
