const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');
const { templatesDir, urlAssets, assetsDir } = require('../../utils/fichasIaPaths');
const { normalizarActividades } = require('./normalizarActividades');
const { normalizarEjerciciosMatematica } = require('./normalizarEjerciciosMatematica');
const { esPlantillaMatematica } = require('./estilosFicha');

const DEFAULT_TEMPLATE = 'plantilla-vanguard-default.hbs';
const MAX_MASCOTAS_FICHA = 3;

if (!Handlebars.helpers.eq) {
  Handlebars.registerHelper('eq', (a, b) => a === b);
  Handlebars.registerHelper('add', (a, b) => Number(a) + Number(b));
  Handlebars.registerHelper('mod', (a, b) => Number(a) % Number(b));
}

const ESTILOS_PARRAFO = ['caja-verde', 'caja-azul', 'caja-amarilla', 'caja-lila', 'caja-coral'];
const ESTILOS_ACTIVIDAD = ['act-verde', 'act-azul', 'act-amarilla', 'act-lila', 'act-coral', 'act-mint'];

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

/** Partes de oración para completar (evita HTML escapado en Handlebars). */
function oracionAFragmentos(oracion) {
  const limpio = String(oracion || '')
    .replace(/<[^>]*>/g, '')
    .trim();
  const partes = [];
  const re = /_{2,}|___+/g;
  let last = 0;
  let m;
  while ((m = re.exec(limpio)) !== null) {
    if (m.index > last) partes.push({ tipo: 'texto', valor: limpio.slice(last, m.index) });
    partes.push({ tipo: 'hueco' });
    last = m.index + m[0].length;
  }
  if (last < limpio.length) partes.push({ tipo: 'texto', valor: limpio.slice(last) });
  if (!partes.length) partes.push({ tipo: 'texto', valor: limpio || 'Completa: ' });
  return partes;
}

function enriquecerTeoriaMatematica(teoria, ctx) {
  const t = { ...teoria };
  const tema = ctx.titulo || ctx.area || 'números';
  if (!t.glosario?.length) {
    t.glosario = [
      { termino: 'Suma', definicion: 'Juntar cantidades para obtener un total mayor.' },
      { termino: 'Resta', definicion: 'Quitar o comparar cantidades para hallar la diferencia.' },
      { termino: 'Valor posicional', definicion: 'Cada cifra vale según su lugar (unidades, decenas, centenas…).' },
      { termino: 'Problema', definicion: 'Situación de la vida real que se resuelve con operaciones.' },
    ];
  }
  if (!t.ilustraciones?.length) {
    t.ilustraciones = [
      {
        titulo: 'Operaciones',
        descripcion: `Practica sumas y restas del tema «${tema}» escribiendo cada paso con orden.`,
        emoji: '➕',
      },
      {
        titulo: 'Tabla de valor',
        descripcion: 'Observa cómo cada dígito cambia de valor según la columna donde está.',
        emoji: '🔢',
      },
      {
        titulo: 'Comprobar',
        descripcion: 'Revisa tu resultado estimando o haciendo la operación inversa.',
        emoji: '✅',
      },
    ];
  }
  if (!t.recuerda?.length) {
    t.recuerda = [
      'Lee el enunciado dos veces antes de calcular',
      'Alinea las cifras por columnas (unidades con unidades)',
      'Escribe el procedimiento en la ficha',
    ];
  }
  return t;
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
    glosario: ctx.glosario || [],
    ilustraciones: ctx.ilustraciones || [],
  };
  if (!teoria.glosario?.length && ctx.glosario?.length) teoria.glosario = ctx.glosario;
  if (!teoria.ilustraciones?.length && ctx.ilustraciones?.length) {
    teoria.ilustraciones = ctx.ilustraciones;
  }
  const aplicacion = ctx.aplicacion || {
    titulo_seccion: 'FICHA DE APLICACIÓN',
    instruccion_general: 'Demuestra lo que aprendiste en la teoría.',
    actividades: ctx.actividades || [],
  };

  const esMatematicaPre =
    ctx.esMatematica ||
    esPlantillaMatematica(archivoPlantilla) ||
    Boolean(
      (ctx.aplicacion || {}).ejercicios?.length ||
        ctx.ejercicios_matematicos?.length ||
        ctx.contenido?.ejercicios_matematicos?.length
    );

  let teoriaRender = teoria;
  if (esMatematicaPre) {
    teoriaRender = enriquecerTeoriaMatematica(teoria, ctx);
  }

  const parrafos = (teoriaRender.parrafos || []).map((texto, index) => ({
    texto,
    num: index + 1,
    estilo: ESTILOS_PARRAFO[index % ESTILOS_PARRAFO.length],
    mascotaUrl: index === 0 ? urlMascota(mascotas.intro) : null,
  }));

  const actsNorm = normalizarActividades(aplicacion.actividades || ctx.actividades || []);
  const actividades = actsNorm.map((act, index) => ({
    ...act,
    estilo: ESTILOS_ACTIVIDAD[index % ESTILOS_ACTIVIDAD.length],
    mascotaUrl: index === 0 ? urlMascota(mascotas.actividad) : null,
  }));

  const esMatematica =
    ctx.esMatematica ||
    esPlantillaMatematica(archivoPlantilla) ||
    Boolean(aplicacion.ejercicios?.length || ctx.ejercicios_matematicos?.length);

  let ejerciciosMatematicos = [];
  if (esMatematica) {
    const rawEj =
      aplicacion.ejercicios || ctx.ejercicios_matematicos || ctx.contenido?.ejercicios_matematicos || [];
    ejerciciosMatematicos = normalizarEjerciciosMatematica(rawEj, {
      titulo: ctx.titulo,
      grado: ctx.grado,
    }).map((ej) => {
      if (ej.tipo === 'completar' && ej.oracion) {
        return { ...ej, oracionPartes: oracionAFragmentos(ej.oracion) };
      }
      if (ej.tipo === 'verdadero_falso') {
        return {
          ...ej,
          enunciado: ej.enunciado || 'Completa V o F:',
          instruccion_vf: 'Marca V o F en cada casillero de la tabla.',
        };
      }
      return ej;
    });
  }

  const subtituloExtra = [subtituloGrado(ctx.grado, ctx.grupoEtiqueta), ctx.area, 'Vanguard Schools', String(ctx.anio || new Date().getFullYear())]
    .filter(Boolean)
    .join(' · ');

  return compile({
    ...ctx,
    teoria: { ...teoriaRender, parrafos },
    aplicacion,
    actividades,
    ejerciciosMatematicos,
    esMatematica,
    logoUrl,
    mascotaRecuerdaUrl: urlMascota(mascotas.recuerda),
    tieneLogo: Boolean(logoUrl),
    subtituloLinea: subtituloExtra,
    usoVanguarcito: Boolean(ctx.usoVanguarcito),
    anio: ctx.anio || new Date().getFullYear(),
  });
}

module.exports = { renderFichaHtml, DEFAULT_TEMPLATE, listMascotaAssets, seleccionarMascotasParaFicha };
