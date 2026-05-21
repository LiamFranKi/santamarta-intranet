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

function assetSrc(filename, inlineAssets) {
  if (!filename) return null;
  const full = path.join(assetsDir, filename);
  if (!fs.existsSync(full)) return null;
  if (inlineAssets) {
    const buf = fs.readFileSync(full);
    return `data:image/png;base64,${buf.toString('base64')}`;
  }
  return urlAssets(filename);
}

function listMascotaAssets() {
  if (!fs.existsSync(assetsDir)) return [];
  return fs
    .readdirSync(assetsDir)
    .filter((f) => /\.png$/i.test(f) && /^(avatar-|mascota-)/i.test(f))
    .sort((a, b) => a.localeCompare(b, 'es'))
    .map((f) => ({ archivo: f, url: urlAssets(f) }))
    .filter((x) => x.url);
}

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

function subtituloGrado(grado, grupoEtiqueta) {
  if (grupoEtiqueta) return grupoEtiqueta;
  if (grado) return `${grado}.º grado`;
  return '';
}

/**
 * @param {object} ctx — titulo, actividades, trabajoId, usoVanguarcito, inlineAssets, grupoEtiqueta
 */
function renderFichaHtml(ctx, archivoPlantilla) {
  const compile = loadTemplate(archivoPlantilla);
  const inline = ctx.inlineAssets !== false;
  const logoUrl = assetSrc('logo-vanguard.png', inline);
  const mascotas = seleccionarMascotasParaFicha(ctx.trabajoId);

  const urlMascota = (m) => (m?.archivo ? assetSrc(m.archivo, inline) : null);

  const teoria = ctx.teoria || {
    titulo_seccion: 'Aprendemos el tema',
    parrafos: ctx.intro ? [ctx.intro] : ['Lee con atención el tema de esta unidad.'],
    recuerda: ctx.recuerda || [],
  };
  const aplicacion = ctx.aplicacion || {
    titulo_seccion: 'FICHA DE APLICACIÓN',
    instruccion_general: 'Demuestra lo que aprendiste en la teoría.',
    actividades: ctx.actividades || [],
  };

  const actividades = (aplicacion.actividades || []).map((act, index) => ({
    ...act,
    mascotaUrl: index === 0 ? urlMascota(mascotas.actividad) : null,
  }));

  const subtituloExtra = [subtituloGrado(ctx.grado, ctx.grupoEtiqueta), ctx.area, 'Vanguard Schools', String(ctx.anio || new Date().getFullYear())]
    .filter(Boolean)
    .join(' · ');

  return compile({
    ...ctx,
    teoria,
    aplicacion,
    actividades,
    logoUrl,
    mascotaIntroUrl: urlMascota(mascotas.intro),
    mascotaRecuerdaUrl: urlMascota(mascotas.recuerda),
    tieneLogo: Boolean(logoUrl),
    subtituloLinea: subtituloExtra,
    usoVanguarcito: Boolean(ctx.usoVanguarcito),
    anio: ctx.anio || new Date().getFullYear(),
  });
}

module.exports = { renderFichaHtml, DEFAULT_TEMPLATE, listMascotaAssets, seleccionarMascotasParaFicha };
