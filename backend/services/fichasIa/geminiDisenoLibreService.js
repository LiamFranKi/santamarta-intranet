const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { assetsDir } = require('../../utils/fichasIaPaths');
const {
  normalizarGuiaPractica,
  completarGuiaPracticaMinima,
  guiaPracticaALegacy,
} = require('./normalizarGuiaPractica');
const { renderFichaHtml } = require('./renderFichaHtml');
const { leerIdentidadColegio } = require('../../utils/identidadColegio');

/**
 * Diseño LIBRE híbrido:
 * - Gemini texto → guion ortográfico correcto
 * - Gemini imagen → solo ilustraciones (SIN texto)
 * - HTML/CSS A4 tipado → tipografía nítida + operaciones matemáticas claras
 *
 * Evita el fallo de “todo el texto pintado dentro de una imagen”.
 */

const MODELOS_IMAGEN = [
  process.env.FICHAS_IA_GEMINI_MODEL_IMAGEN,
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image',
  'gemini-3-pro-image-preview',
].filter(Boolean);

const MODELOS_TEXTO = [
  process.env.FICHAS_IA_GEMINI_MODEL,
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
].filter(Boolean);

function unicos(lista) {
  const seen = new Set();
  const out = [];
  for (const m of lista) {
    const s = String(m || '').trim();
    if (!s || seen.has(s)) continue;
    if (s === 'gemini-2.0-flash') {
      if (!seen.has('gemini-2.5-flash')) {
        seen.add('gemini-2.5-flash');
        out.push('gemini-2.5-flash');
      }
      continue;
    }
    seen.add(s);
    out.push(s);
  }
  return out;
}

function bandaEdadDesdeGrado(grado, grupoEtiqueta) {
  const t = `${grado || ''} ${grupoEtiqueta || ''}`.toLowerCase();
  if (/inicial|kínder|kinder|jardín|3\s*años|4\s*años|5\s*años|preescolar/.test(t)) {
    return 'infantil';
  }
  if (/secundaria|1ro?\s*sec|2do?\s*sec|3ro?\s*sec|4to?\s*sec|5to?\s*sec/.test(t)) {
    return 'secundaria';
  }
  const n = parseInt(String(grado).replace(/\D/g, ''), 10);
  if (!Number.isNaN(n)) {
    if (n <= 2) return 'temprano';
    if (n <= 4) return 'intermedio';
    return 'mayor';
  }
  if (/1\.?º|1er|2\.?º|2do/.test(t)) return 'temprano';
  if (/3\.?º|3er|4\.?º|4to/.test(t)) return 'intermedio';
  if (/5\.?º|5to|6\.?º|6to/.test(t)) return 'mayor';
  return 'intermedio';
}

function esTemaMatematica(area, titulo, curso) {
  return /matem|n[uú]mer|aritm|álgebra|algebra|geometr|fracci|decimal|operaci|suma|resta|multi|divis/i.test(
    `${area || ''} ${titulo || ''} ${curso || ''}`
  );
}

const POOLS_MASCOTA = {
  infantil: ['avatar-nino.png', 'avatar-nina1.png', 'avatar-nina2.png', 'vanguarcito.png'],
  temprano: ['avatar-nino1.png', 'avatar-nina1.png', 'avatar-nina3.png', 'vanguarcito.png'],
  intermedio: ['avatar-nino2.png', 'avatar-nina3.png', 'avatar-nina4.png', 'vanguarcito.png'],
  mayor: ['avatar-nino3.png', 'avatar-nina5.png', 'avatar-nina6.png', 'vanguarcito.png'],
  secundaria: ['avatar-nino3.png', 'avatar-nina6.png', 'avatar-nina5.png', 'vanguarcito.png'],
};

function leerAsset(filename) {
  const full = path.join(assetsDir, filename);
  if (!fs.existsSync(full)) return null;
  const buf = fs.readFileSync(full);
  const ext = path.extname(filename).toLowerCase();
  const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
  const base64 = buf.toString('base64');
  return { filename, mime, base64, dataUri: `data:${mime};base64,${base64}` };
}

function leerRuta(fsPath, filename) {
  if (!fsPath || !fs.existsSync(fsPath)) return null;
  const buf = fs.readFileSync(fsPath);
  const ext = path.extname(fsPath).toLowerCase();
  const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png';
  const base64 = buf.toString('base64');
  return { filename: filename || path.basename(fsPath), mime, base64, dataUri: `data:${mime};base64,${base64}` };
}

function elegirMascota(banda, trabajoId, principalFs) {
  const pool = POOLS_MASCOTA[banda] || POOLS_MASCOTA.intermedio;
  const idx = Math.abs(Number(trabajoId) || 1) % pool.length;
  for (let i = 0; i < pool.length; i += 1) {
    const nombre = pool[(idx + i) % pool.length];
    if (nombre === 'vanguarcito.png' && principalFs) {
      const propia = leerRuta(principalFs);
      if (propia) return propia;
    }
    const asset = leerAsset(nombre);
    if (asset) return asset;
  }
  return null;
}

function elegirDeLista(lista, trabajoId) {
  if (!lista?.length) return null;
  const idx = Math.abs(Number(trabajoId) || 1) % lista.length;
  for (let i = 0; i < lista.length; i += 1) {
    const item = lista[(idx + i) % lista.length];
    const asset = leerRuta(item.fsPath, item.archivo);
    if (asset) return asset;
  }
  return null;
}

async function llamarGemini(apiKey, modelo, body, timeout = 120000) {
  const versiones = ['v1beta', 'v1'];
  let ultimo;
  for (const ver of versiones) {
    const url = `https://generativelanguage.googleapis.com/${ver}/models/${modelo}:generateContent?key=${encodeURIComponent(apiKey)}`;
    try {
      const res = await axios.post(url, body, {
        timeout,
        headers: { 'Content-Type': 'application/json' },
      });
      return { data: res.data, modelo };
    } catch (err) {
      ultimo = err;
      if (err.response?.status !== 404) throw err;
    }
  }
  throw ultimo;
}

function extraerImagenes(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const imgs = [];
  for (const p of parts) {
    const inline = p.inlineData || p.inline_data;
    if (inline?.data) {
      const mime = inline.mimeType || inline.mime_type || 'image/png';
      imgs.push({ mime, dataUri: `data:${mime};base64,${inline.data}` });
    }
  }
  return imgs;
}

async function generarGuionOrtografico({
  apiKey,
  titulo,
  grado,
  grupoEtiqueta,
  area,
  unidad,
  puntosClave,
  textoOrigen,
  instruccionesDocente,
  banda,
  esMath,
  nombreMascota,
}) {
  const bloqueMath = esMath
    ? `
Incluye en practica:
"operaciones": ["34 + 27 =", "58 - 19 =", "6 × 8 =", "72 ÷ 8 =", "125 + 48 =", "90 - 37 ="] (mínimo 8, claras, con espacio para respuesta),
"problemas": ["problema narrado 1", "problema 2"] (2 problemas cortos del grado).
`
    : '';

  const quien = String(nombreMascota || '').trim() || 'Vanguarcito';
  const prompt = `Eres corrector y didacta en español de Perú. La mascota del colegio se llama ${quien}. Si el texto nombra una mascota, usa solo ese nombre. SOLO JSON válido.

Tema: ${titulo || 'Tema'}
Grado: ${grado || grupoEtiqueta || '—'}
Área: ${area || '—'}
Unidad: ${unidad || '—'}
Edad/banda: ${banda}
Es matemática: ${esMath ? 'SÍ' : 'NO'}
Puntos clave: ${(puntosClave || '—').slice(0, 2000)}
Indicaciones: ${(instruccionesDocente || '—').slice(0, 1500)}
Apoyo: ${(textoOrigen || '').slice(0, 5000)}

Ortografía perfecta (tildes, ñ). Frases cortas y claras.
${bloqueMath}

{
  "guia": {
    "titulo": "TÍTULO",
    "subtitulo": "Área – Grado",
    "definicion": {"titulo": "¿Qué es…?", "texto": "2-3 oraciones", "emoji": "📘"},
    "importancia": {"titulo": "¿Por qué…?", "items": ["…","…","…","…","…"]},
    "partes": {"titulo": "Ideas / partes", "items": [{"nombre":"…","descripcion":"…","emoji":"🔹"}]},
    "tipos": {
      "titulo": "Tipos / comparación",
      "columna_a": {"titulo":"A","emoji":"🅰️","items":["…","…","…"]},
      "columna_b": {"titulo":"B","emoji":"🅱️","items":["…","…","…"]},
      "nota": "…"
    },
    "proceso": {"titulo":"Proceso","pasos":[{"nombre":"…","descripcion":"…","emoji":"1️⃣"}]},
    "ejemplos": {"titulo":"Ejemplos","items":[{"titulo":"…","descripcion":"…","emoji":"✨"}]},
    "sabias_que": {"titulo":"¿Sabías que?","texto":"…","emoji":"💡"},
    "recuerda": "frase de síntesis"
  },
  "practica": {
    "titulo": "FICHA DE APLICACIÓN: …",
    "responder": {"preguntas":["…","…"]},
    "completar": {"oraciones":["… ________ …","…","…"]},
    "verdadero_falso": {"items":["…","…","…","…"]},
    "marcar": {"items":[{"pregunta":"…","opciones":["…","…","…","…"]}]},
    "relacionar": {"columna_a":["…","…","…","…"],"columna_b":["…","…","…","…"]},
    "ordenar": {"instruccion":"…","elementos":["…","…","…","…"]},
    "identifica": {"instruccion":"…","casos":[{"etiqueta_esperada":"A","pista":"…","emoji":"🔵"},{"etiqueta_esperada":"B","pista":"…","emoji":"🟢"}]},
    "operaciones": [],
    "problemas": []
  },
  "pie_motivacional": "…",
  "prompts_ilustracion": {
    "definicion": "English visual prompt for a clean educational illustration of the topic (NO TEXT, NO LETTERS)",
    "ejemplos": "English visual prompt for 3 small concept icons collage (NO TEXT)"
  }
}`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
    },
  };

  let lastErr;
  for (const modelo of unicos(MODELOS_TEXTO)) {
    try {
      const r = await llamarGemini(apiKey, modelo, body, 120000);
      const text = r.data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
      const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      const guion = JSON.parse(cleaned);
      if (!guion?.guia || !guion?.practica) throw new Error('Guion incompleto');
      const usage = r.data?.usageMetadata || {};
      return {
        guion,
        modelo: r.modelo,
        tokens_entrada: usage.promptTokenCount || 0,
        tokens_salida: usage.candidatesTokenCount || 0,
      };
    } catch (err) {
      lastErr = err;
      if (err.response?.status === 429 || err.response?.status === 403) throw err;
    }
  }
  throw lastErr || new Error('No se pudo generar el guion');
}

async function generarIlustracionSinTexto({ apiKey, promptVisual, referencia, logo }) {
  const prompt = `Create a bright, clean educational illustration for a school worksheet.
${promptVisual}
STRICT: NO text, NO letters, NO numbers, NO watermarks, NO UI. Just illustration.
Kid-friendly textbook quality, vivid colors, white or soft background.`;

  const parts = [{ text: prompt }];
  if (referencia) {
    parts.push({ text: '\n[Style reference]' });
    parts.push({ inline_data: { mime_type: referencia.mime, data: referencia.base64 } });
  }
  if (logo) {
    parts.push({ text: '\n[Brand colors cue]' });
    parts.push({ inline_data: { mime_type: logo.mime, data: logo.base64 } });
  }

  const configs = [
    { responseModalities: ['TEXT', 'IMAGE'], temperature: 0.5, imageConfig: { aspectRatio: '1:1', imageSize: '2K' } },
    { responseModalities: ['TEXT', 'IMAGE'], temperature: 0.5, imageConfig: { aspectRatio: '1:1' } },
    { responseModalities: ['TEXT', 'IMAGE'], temperature: 0.5 },
  ];

  for (const modelo of unicos(MODELOS_IMAGEN)) {
    for (const generationConfig of configs) {
      try {
        const r = await llamarGemini(
          apiKey,
          modelo,
          { contents: [{ role: 'user', parts }], generationConfig },
          150000
        );
        const imgs = extraerImagenes(r.data);
        if (imgs[0]) {
          const usage = r.data?.usageMetadata || {};
          return {
            dataUri: imgs[0].dataUri,
            modelo: r.modelo,
            tokens_entrada: usage.promptTokenCount || 0,
            tokens_salida: usage.candidatesTokenCount || 0,
          };
        }
      } catch (err) {
        if (err.response?.status === 429 || err.response?.status === 403) throw err;
        if (err.response?.status !== 400) break;
      }
    }
  }
  return null;
}

function guionAGuiaPractica(guion, titulo, esMath) {
  const g = guion.guia || {};
  const p = guion.practica || {};
  const raw = {
    guia: {
      titulo: g.titulo || titulo,
      definicion: g.definicion || {},
      importancia: g.importancia || {},
      partes: g.partes || {},
      tipos: g.tipos || {},
      proceso: g.proceso || {},
      ejemplos: g.ejemplos || {},
      sabias_que: g.sabias_que || {},
      recuerda: g.recuerda || '',
    },
    practica: {
      titulo: p.titulo || `FICHA DE APLICACIÓN: ${titulo}`,
      responder: p.responder || {},
      completar: p.completar || {},
      verdadero_falso: p.verdadero_falso || {},
      marcar: p.marcar || {},
      relacionar: p.relacionar || {},
      ordenar: p.ordenar || {},
      identifica: p.identifica || {},
    },
  };

  let { guia, practica } = normalizarGuiaPractica(raw, { titulo });
  ({ guia, practica } = completarGuiaPracticaMinima({ guia, practica }, titulo));

  // Operaciones / problemas matemática
  const ops = Array.isArray(p.operaciones)
    ? p.operaciones.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 12)
    : [];
  const problemas = Array.isArray(p.problemas)
    ? p.problemas.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 4)
    : [];
  if (esMath && ops.length < 6) {
    ops.push('24 + 18 =', '63 - 27 =', '7 × 6 =', '56 ÷ 7 =', '135 + 49 =', '100 - 58 =');
  }
  practica.operaciones = ops.slice(0, 12);
  practica.problemas = problemas;
  practica.es_matematica = Boolean(esMath);

  return { guia, practica, pie: guion.pie_motivacional || '¡Muy bien! Sigue practicando.' };
}

/**
 * Diseño libre híbrido → HTML A4 listo para Puppeteer.
 */
async function generarHtmlDisenoLibre(params) {
  const {
    titulo,
    grado,
    grupoEtiqueta,
    area,
    unidad,
    puntosClave,
    textoOrigen,
    instruccionesDocente,
    trabajoId,
  } = params;

  const apiKey = String(process.env.GOOGLE_AI_API_KEY || '').trim();
  if (!apiKey) {
    const e = new Error('No hay GOOGLE_AI_API_KEY');
    e.code = 'SIN_CLAVE';
    throw e;
  }

  const banda = bandaEdadDesdeGrado(grado, grupoEtiqueta);
  const esMath = esTemaMatematica(area, titulo);
  const colegioId = params.colegioId || 1;
  const { dibujosPropiosHoja, rutaPrincipalSiPropia, leerMascota } = require('../../utils/mascotaColegio');
  const propios = await dibujosPropiosHoja(colegioId);
  const principalPropia = propios ? null : await rutaPrincipalSiPropia(colegioId);
  const mascotaColegio = await leerMascota(colegioId);
  const nombreMascota = mascotaColegio.nombre;
  const logo = leerAsset('logo-vanguard.png');
  const mascota = propios
    ? elegirDeLista(propios, trabajoId)
    : elegirMascota(banda, trabajoId, principalPropia);
  const mascota2 = propios
    ? elegirDeLista(propios, (Number(trabajoId) || 1) + 3)
    : elegirMascota(banda, (Number(trabajoId) || 1) + 3, principalPropia);
  const referencia = leerAsset('referencia-estilo-guia.png');

  let tokensIn = 0;
  let tokensOut = 0;
  const modelosUsados = [];

  const guionRes = await generarGuionOrtografico({
    apiKey,
    titulo,
    grado,
    grupoEtiqueta,
    area,
    unidad,
    puntosClave,
    textoOrigen,
    instruccionesDocente,
    banda,
    esMath,
    nombreMascota,
  });
  tokensIn += guionRes.tokens_entrada || 0;
  tokensOut += guionRes.tokens_salida || 0;
  modelosUsados.push(`guion:${guionRes.modelo}`);

  const { guia, practica, pie } = guionAGuiaPractica(guionRes.guion, titulo, esMath);
  if (!guia.subtitulo && guionRes.guion.guia?.subtitulo) {
    /* subtítulo solo informativo en header via area/grado */
  }

  const promptsIlus = guionRes.guion.prompts_ilustracion || {};
  const promptDef =
    promptsIlus.definicion ||
    `Educational illustration about: ${titulo}. Clear diagram style for school kids.`;
  const promptEj =
    promptsIlus.ejemplos ||
    `Three small colorful educational icons related to: ${titulo}.`;

  // Ilustraciones opcionales (si fallan, la plantilla usa emoji)
  let ilusDef = null;
  let ilusEj = null;
  try {
    ilusDef = await generarIlustracionSinTexto({
      apiKey,
      promptVisual: promptDef,
      referencia,
      logo,
    });
    if (ilusDef) {
      tokensIn += ilusDef.tokens_entrada || 0;
      tokensOut += ilusDef.tokens_salida || 0;
      modelosUsados.push(`ilus:${ilusDef.modelo}`);
    }
  } catch (_e) {
    /* ignore */
  }
  try {
    ilusEj = await generarIlustracionSinTexto({
      apiKey,
      promptVisual: promptEj,
      referencia,
      logo,
    });
    if (ilusEj) {
      tokensIn += ilusEj.tokens_entrada || 0;
      tokensOut += ilusEj.tokens_salida || 0;
      modelosUsados.push(`ilus2:${ilusEj.modelo}`);
    }
  } catch (_e) {
    /* ignore */
  }

  const legacy = guiaPracticaALegacy({ guia, practica }, pie);

  const html = renderFichaHtml(
    {
      trabajoId,
      titulo: guia.titulo || titulo,
      grado: grado || '',
      grupoEtiqueta: grupoEtiqueta || '',
      area: area || '',
      unidad: unidad || '1',
      guia: {
        ...guia,
        ilustracion_definicion_url: ilusDef?.dataUri || null,
        ilustracion_ejemplos_url: ilusEj?.dataUri || null,
      },
      practica,
      pie_motivacional: pie,
      contenido: { ...legacy, guia, practica },
      mascotaIzqUrl: mascota?.dataUri || null,
      mascotaDerUrl: mascota2?.dataUri || logo?.dataUri || null,
      mascotaImpUrl: mascota?.dataUri || null,
      mascotaRecuerdaUrl: mascota2?.dataUri || null,
      usoVanguarcito: true,
      nombreMascota,
      inlineAssets: true,
      esMatematica: false,
      colegioNombre: (await leerIdentidadColegio(colegioId).catch(() => null))?.titulo || 'Vanguard Schools',
    },
    'plantilla-vanguard-guia-practica.hbs'
  );

  return {
    html,
    modelo: modelosUsados.join('|'),
    proveedor: 'google',
    tokens_entrada: tokensIn || null,
    tokens_salida: tokensOut || null,
    banda_edad: banda,
    mascota_archivo: mascota?.filename || null,
    modo_diseno: 'libre',
    motor: 'hibrido',
    // Márgenes Puppeteer + tipografía a escala 2 (texto nítido en A4 real)
    pdf_opts: {
      marginZero: false,
      deviceScaleFactor: 2,
      margin: { top: '6mm', right: '6mm', bottom: '8mm', left: '6mm' },
    },
  };
}

module.exports = {
  generarHtmlDisenoLibre,
  bandaEdadDesdeGrado,
};
