const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');
const { templatesDir, urlAssets, assetsDir } = require('../../utils/fichasIaPaths');

const DEFAULT_TEMPLATE = 'plantilla-vanguard-default.hbs';

if (!Handlebars.helpers.eq) {
  Handlebars.registerHelper('eq', (a, b) => a === b);
  Handlebars.registerHelper('add', (a, b) => Number(a) + Number(b));
}

function assetUrl(filename) {
  if (!filename) return null;
  const full = path.join(assetsDir, filename);
  if (fs.existsSync(full)) return urlAssets(filename);
  return null;
}

/** PNG en public/assets/fichas-ia: avatar-*.png, mascota-*.png (biblioteca visual fija) */
function listMascotaAssets() {
  if (!fs.existsSync(assetsDir)) return [];
  return fs
    .readdirSync(assetsDir)
    .filter((f) => /\.png$/i.test(f) && /^(avatar-|mascota-)/i.test(f))
    .sort((a, b) => a.localeCompare(b, 'es'))
    .map((f) => ({ archivo: f, url: assetUrl(f) }))
    .filter((x) => x.url);
}

function loadTemplate(archivoPlantilla) {
  const name = archivoPlantilla || DEFAULT_TEMPLATE;
  const filePath = path.join(templatesDir, name);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Plantilla no encontrada: ${name}`);
  }
  return Handlebars.compile(fs.readFileSync(filePath, 'utf8'));
}

/**
 * @param {object} ctx — titulo, grado, area, unidad, contenido { intro, recuerda, actividades, pie_motivacional }
 */
function renderFichaHtml(ctx, archivoPlantilla) {
  const compile = loadTemplate(archivoPlantilla);
  const logoUrl = assetUrl('logo-vanguard.png');
  const mascotas = listMascotaAssets();
  const iconoRecuerda = assetUrl('icono-recuerda.png');

  return compile({
    ...ctx,
    logoUrl,
    mascotas,
    iconoRecuerda,
    tieneLogo: Boolean(logoUrl),
    anio: new Date().getFullYear(),
  });
}

module.exports = { renderFichaHtml, DEFAULT_TEMPLATE };
