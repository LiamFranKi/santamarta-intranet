const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');
const { templatesDir, urlAssets, assetsDir } = require('../../utils/fichasIaPaths');

const DEFAULT_TEMPLATE = 'plantilla-vanguard-default.hbs';
const MAX_MASCOTAS_FICHA = 3;

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

function listMascotaAssets() {
  if (!fs.existsSync(assetsDir)) return [];
  return fs
    .readdirSync(assetsDir)
    .filter((f) => /\.png$/i.test(f) && /^(avatar-|mascota-)/i.test(f))
    .sort((a, b) => a.localeCompare(b, 'es'))
    .map((f) => ({ archivo: f, url: assetUrl(f) }))
    .filter((x) => x.url);
}

/** Máx. 3 mascotas repartidas en intro, recuerda y primera actividad (no todas en fila). */
function seleccionarMascotasParaFicha(trabajoId) {
  const all = listMascotaAssets();
  if (!all.length) return { intro: null, recuerda: null, actividad: null };

  const seed = Number(trabajoId) || 1;
  const ninos = all.filter((m) => /avatar-nino/i.test(m.archivo));
  const ninas = all.filter((m) => /avatar-nina/i.test(m.archivo));
  const elegidas = [];
  const usados = new Set();

  const tomar = (lista, offset) => {
    if (!lista.length || elegidas.length >= MAX_MASCOTAS_FICHA) return;
    const item = lista[(seed + offset) % lista.length];
    if (item && !usados.has(item.archivo)) {
      elegidas.push(item);
      usados.add(item.archivo);
    }
  };

  tomar(ninos, 0);
  tomar(ninas, 1);
  if (elegidas.length < MAX_MASCOTAS_FICHA) {
    const resto = all.filter((m) => !usados.has(m.archivo));
    tomar(resto, 2);
  }

  return {
    intro: elegidas[0] || null,
    recuerda: elegidas[1] || elegidas[0] || null,
    actividad: elegidas[2] || elegidas[1] || elegidas[0] || null,
  };
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
 * @param {object} ctx — titulo, grado, area, unidad, actividades, trabajoId opcional
 */
function renderFichaHtml(ctx, archivoPlantilla) {
  const compile = loadTemplate(archivoPlantilla);
  const logoUrl = assetUrl('logo-vanguard.png');
  const iconoRecuerda = assetUrl('icono-recuerda.png');
  const mascotas = seleccionarMascotasParaFicha(ctx.trabajoId);

  const actividades = (ctx.actividades || []).map((act, index) => ({
    ...act,
    mascotaUrl: index === 0 && mascotas.actividad ? mascotas.actividad.url : null,
  }));

  return compile({
    ...ctx,
    actividades,
    logoUrl,
    mascotaIntroUrl: mascotas.intro?.url || null,
    mascotaRecuerdaUrl: mascotas.recuerda?.url || null,
    iconoRecuerda,
    tieneLogo: Boolean(logoUrl),
    anio: new Date().getFullYear(),
  });
}

module.exports = { renderFichaHtml, DEFAULT_TEMPLATE, listMascotaAssets, seleccionarMascotasParaFicha };
