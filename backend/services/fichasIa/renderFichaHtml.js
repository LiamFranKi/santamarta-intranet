const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');
const { templatesDir, urlAssets, assetsDir } = require('../../utils/fichasIaPaths');
const { normalizarActividades } = require('./normalizarActividades');
const { normalizarEjerciciosMatematica } = require('./normalizarEjerciciosMatematica');
const { esPlantillaMatematica } = require('./estilosFicha');

const DEFAULT_TEMPLATE = 'plantilla-vanguard-guia-practica.hbs';
const MAX_MASCOTAS_POOL = 12;
const {
  normalizarGuiaPractica,
  completarGuiaPracticaMinima,
  legacyAGuiaPractica,
} = require('./normalizarGuiaPractica');

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

function dataUriDeRuta(fsPath) {
  if (!fsPath || !fs.existsSync(fsPath)) return null;
  const ext = path.extname(fsPath).toLowerCase();
  const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png';
  return `data:${mime};base64,${fs.readFileSync(fsPath).toString('base64')}`;
}

function poolPorDefecto() {
  return listMascotaAssets().map((x) => ({
    archivo: x.archivo,
    fsPath: path.join(assetsDir, x.archivo),
    url: x.url,
  }));
}

function seleccionarMascotasUnicas(trabajoId, cantidad, poolExterno) {
  const all = Array.isArray(poolExterno) && poolExterno.length ? poolExterno : poolPorDefecto();
  if (!all.length) return [];

  const seed = Number(trabajoId) || 1;
  const elegidas = [];
  const usados = new Set();

  for (let offset = 0; elegidas.length < cantidad && offset < all.length * 3; offset += 1) {
    const item = all[(seed + offset) % all.length];
    if (item && !usados.has(item.archivo)) {
      elegidas.push(item);
      usados.add(item.archivo);
    }
  }
  return elegidas;
}

function srcMascotaItem(item, inlineAssets) {
  if (!item) return null;
  const fsPath = item.fsPath || (item.archivo ? path.join(assetsDir, item.archivo) : null);
  if (inlineAssets) return dataUriDeRuta(fsPath);
  if (item.url) return item.url;
  if (item.archivo && fsPath && fs.existsSync(fsPath)) return urlAssets(item.archivo);
  return null;
}

/** Asigna mascotas sin repetir archivo en toda la ficha. */
function crearAsignadorMascotas(trabajoId, poolExterno) {
  const pool = seleccionarMascotasUnicas(trabajoId, MAX_MASCOTAS_POOL, poolExterno);
  let cursor = 0;
  const usados = new Set();

  return {
    tomar() {
      while (cursor < pool.length) {
        const item = pool[cursor];
        cursor += 1;
        if (item && !usados.has(item.archivo)) {
          usados.add(item.archivo);
          return item;
        }
      }
      return null;
    },
  };
}

function parrafoLlevaMascota(index, total) {
  if (index === 0) return true;
  if (total >= 3 && index === 2) return true;
  if (total === 2 && index === 1) return true;
  return false;
}

function actividadLlevaMascota(index) {
  return index === 0 || index === 2;
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

function oracionAHtmlConHuecos(oracion) {
  return oracionAFragmentos(oracion)
    .map((p) => {
      if (p.tipo === 'hueco') return '<span class="hueco">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>';
      return String(p.valor || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    })
    .join('');
}

function esPlantillaGuiaPractica(archivoPlantilla) {
  return /guia-practica|guia_practica/i.test(String(archivoPlantilla || ''));
}

function asegurarGuiaPractica(ctx) {
  if (ctx.guia && ctx.practica) {
    let { guia, practica } = normalizarGuiaPractica(
      { guia: ctx.guia, practica: ctx.practica },
      { titulo: ctx.titulo }
    );
    ({ guia, practica } = completarGuiaPracticaMinima({ guia, practica }, ctx.titulo));
    return { guia, practica };
  }
  const fromContenido = ctx.contenido || {};
  if (fromContenido.guia && fromContenido.practica) {
    let { guia, practica } = normalizarGuiaPractica(fromContenido, { titulo: ctx.titulo });
    ({ guia, practica } = completarGuiaPracticaMinima({ guia, practica }, ctx.titulo));
    return { guia, practica };
  }
  const legacy = legacyAGuiaPractica(
    {
      teoria: ctx.teoria,
      aplicacion: ctx.aplicacion,
      recuerda: ctx.recuerda,
      glosario: ctx.glosario,
      ilustraciones: ctx.ilustraciones,
      actividades: ctx.actividades,
      pie_motivacional: ctx.pie_motivacional,
    },
    ctx.titulo
  );
  return { guia: legacy.guia, practica: legacy.practica };
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
function renderFichaHtml(ctxIn, archivoPlantilla) {
  const ctx = {
    ...ctxIn,
    nombreMascota: String(ctxIn?.nombreMascota || '').trim() || 'Vanguarcito',
    colegioNombre: String(ctxIn?.colegioNombre || '').trim() || 'Vanguard Schools',
  };
  const plantilla =
    archivoPlantilla ||
    (ctx.esMatematica ? 'plantilla-vanguard-matematica.hbs' : DEFAULT_TEMPLATE);
  const compile = loadTemplate(plantilla);
  const inline = ctx.inlineAssets !== false;
  const logoUrl = assetSrc('logo-vanguard.png', inline);
  const mascotas = crearAsignadorMascotas(ctx.trabajoId, ctx.mascotasPool);

  const urlMascota = (m) => srcMascotaItem(m, inline);

  // Plantilla tipada GUÍA + PRÁCTICA
  if (esPlantillaGuiaPractica(plantilla) && !ctx.esMatematica) {
    const { guia, practica } = asegurarGuiaPractica(ctx);
    // Campos extra del diseño híbrido (no pasan por el normalizador tipado)
    const guiaSrc = ctx.guia || ctx.contenido?.guia || {};
    const practicaSrc = ctx.practica || ctx.contenido?.practica || {};
    if (guiaSrc.ilustracion_definicion_url) {
      guia.ilustracion_definicion_url = guiaSrc.ilustracion_definicion_url;
    }
    if (guiaSrc.ilustracion_ejemplos_url) {
      guia.ilustracion_ejemplos_url = guiaSrc.ilustracion_ejemplos_url;
    }
    practica.operaciones = Array.isArray(practicaSrc.operaciones)
      ? practicaSrc.operaciones.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 12)
      : Array.isArray(practica.operaciones)
        ? practica.operaciones
        : [];
    practica.problemas = Array.isArray(practicaSrc.problemas)
      ? practicaSrc.problemas.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 4)
      : Array.isArray(practica.problemas)
        ? practica.problemas
        : [];
    practica.es_matematica = Boolean(practicaSrc.es_matematica || practica.operaciones.length);

    practica.completar = {
      ...practica.completar,
      oraciones: (practica.completar?.oraciones || []).map(oracionAHtmlConHuecos),
    };
    const subtituloExtra = [
      subtituloGrado(ctx.grado, ctx.grupoEtiqueta),
      ctx.area,
      String(ctx.anio || new Date().getFullYear()),
    ]
      .filter(Boolean)
      .join(' · ');
    const pieMotivacional =
      String(ctx.pie_motivacional || '').trim() || '¡Muy bien! Seguir aprendiendo te hace crecer.';

    return compile({
      ...ctx,
      guia,
      practica,
      logoUrl,
      mascotaIzqUrl: ctx.mascotaIzqUrl || urlMascota(mascotas.tomar()),
      mascotaDerUrl: ctx.mascotaDerUrl || urlMascota(mascotas.tomar()),
      mascotaImpUrl: ctx.mascotaImpUrl || urlMascota(mascotas.tomar()),
      mascotaRecuerdaUrl: ctx.mascotaRecuerdaUrl || urlMascota(mascotas.tomar()),
      tieneLogo: Boolean(logoUrl),
      subtituloLinea: subtituloExtra,
      pie_motivacional: pieMotivacional,
      anio: ctx.anio || new Date().getFullYear(),
    });
  }

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

  const parrafosRaw = teoriaRender.parrafos || [];
  const parrafos = parrafosRaw.map((texto, index) => ({
    texto,
    num: index + 1,
    estilo: ESTILOS_PARRAFO[index % ESTILOS_PARRAFO.length],
    mascotaUrl: parrafoLlevaMascota(index, parrafosRaw.length) ? urlMascota(mascotas.tomar()) : null,
  }));

  const actsNorm = normalizarActividades(aplicacion.actividades || ctx.actividades || []);
  const actividades = actsNorm.map((act, index) => ({
    ...act,
    estilo: ESTILOS_ACTIVIDAD[index % ESTILOS_ACTIVIDAD.length],
    mascotaUrl: actividadLlevaMascota(index) ? urlMascota(mascotas.tomar()) : null,
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
    }).map((ej, index) => {
      let out = ej;
      if (ej.tipo === 'completar' && ej.oracion) {
        out = { ...ej, oracionPartes: oracionAFragmentos(ej.oracion) };
      } else if (ej.tipo === 'verdadero_falso') {
        out = {
          ...ej,
          enunciado: ej.enunciado || 'Completa V o F:',
          instruccion_vf: 'Marca V o F en cada casillero de la tabla.',
        };
      }
      return {
        ...out,
        mascotaUrl: actividadLlevaMascota(index) ? urlMascota(mascotas.tomar()) : null,
      };
    });
  }

  const subtituloExtra = [subtituloGrado(ctx.grado, ctx.grupoEtiqueta), ctx.area, ctx.colegioNombre || 'Vanguard Schools', String(ctx.anio || new Date().getFullYear())]
    .filter(Boolean)
    .join(' · ');

  const pieMotivacional =
    String(ctx.pie_motivacional || '').trim() || '¡Sigue aprendiendo con esfuerzo y curiosidad!';

  return compile({
    ...ctx,
    teoria: { ...teoriaRender, parrafos },
    aplicacion,
    actividades,
    ejerciciosMatematicos,
    esMatematica,
    logoUrl,
    mascotaRecuerdaUrl: urlMascota(mascotas.tomar()),
    tieneLogo: Boolean(logoUrl),
    subtituloLinea: subtituloExtra,
    usoVanguarcito: Boolean(ctx.usoVanguarcito),
    pie_motivacional: pieMotivacional,
    anio: ctx.anio || new Date().getFullYear(),
  });
}

module.exports = {
  renderFichaHtml,
  DEFAULT_TEMPLATE,
  listMascotaAssets,
  seleccionarMascotasUnicas,
  crearAsignadorMascotas,
};
