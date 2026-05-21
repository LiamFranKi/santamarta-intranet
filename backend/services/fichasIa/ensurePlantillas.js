const fs = require('fs');
const path = require('path');
const { query, execute } = require('../../utils/mysql');
const { templatesDir } = require('../../utils/fichasIaPaths');
const { metaEstilo, ESTILOS } = require('./estilosFicha');

async function ensurePlantillaPorCodigo(colegio_id, plantillaCodigo) {
  const rows = await query(
    `SELECT id FROM fichas_ia_plantillas WHERE colegio_id = ? AND codigo = ? LIMIT 1`,
    [colegio_id, plantillaCodigo]
  );
  if (rows.length) return rows[0].id;

  const estilo = Object.values(ESTILOS).find((e) => e.plantillaCodigo === plantillaCodigo);
  if (!estilo) throw new Error(`Estilo de plantilla desconocido: ${plantillaCodigo}`);

  const tplPath = path.join(templatesDir, estilo.archivo);
  if (!fs.existsSync(tplPath)) {
    throw new Error(`Falta archivo ${estilo.archivo} en templates/fichas-ia`);
  }

  const result = await execute(
    `INSERT INTO fichas_ia_plantillas (colegio_id, codigo, nombre, grado, area, archivo_plantilla, version, activo)
     VALUES (?, ?, ?, NULL, NULL, ?, 1, 1)`,
    [colegio_id, estilo.plantillaCodigo, estilo.nombre, estilo.archivo]
  );
  return result.insertId;
}

async function ensurePlantillaPorEstilo(colegio_id, codigoEstilo) {
  const meta = metaEstilo(codigoEstilo);
  return ensurePlantillaPorCodigo(colegio_id, meta.plantillaCodigo);
}

async function ensurePlantillasColegio(colegio_id) {
  await ensurePlantillaPorCodigo(colegio_id, ESTILOS.general.plantillaCodigo);
  await ensurePlantillaPorCodigo(colegio_id, ESTILOS.matematica.plantillaCodigo);
}

async function ensurePlantillaDefault(colegio_id) {
  return ensurePlantillaPorEstilo(colegio_id, 'general');
}

module.exports = {
  ensurePlantillaDefault,
  ensurePlantillaPorEstilo,
  ensurePlantillaPorCodigo,
  ensurePlantillasColegio,
};
