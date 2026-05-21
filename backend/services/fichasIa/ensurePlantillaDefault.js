const fs = require('fs');
const path = require('path');
const { query, execute } = require('../../utils/mysql');
const { templatesDir } = require('../../utils/fichasIaPaths');
const { DEFAULT_TEMPLATE } = require('./renderFichaHtml');

async function ensurePlantillaDefault(colegio_id) {
  const rows = await query(
    `SELECT id FROM fichas_ia_plantillas WHERE colegio_id = ? AND codigo = 'vanguard_default' LIMIT 1`,
    [colegio_id]
  );
  if (rows.length) return rows[0].id;

  const tplPath = path.join(templatesDir, DEFAULT_TEMPLATE);
  if (!fs.existsSync(tplPath)) {
    throw new Error(`Falta plantilla ${DEFAULT_TEMPLATE} en templates/fichas-ia`);
  }

  const result = await execute(
    `INSERT INTO fichas_ia_plantillas (colegio_id, codigo, nombre, grado, area, archivo_plantilla, version, activo)
     VALUES (?, 'vanguard_default', 'Ficha Vanguard (predeterminada)', NULL, NULL, ?, 1, 1)`,
    [colegio_id, DEFAULT_TEMPLATE]
  );
  return result.insertId;
}

module.exports = { ensurePlantillaDefault };
