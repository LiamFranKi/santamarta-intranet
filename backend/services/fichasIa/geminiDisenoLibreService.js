const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { assetsDir } = require('../../utils/fichasIaPaths');

/**
 * Modo LIBRE = imágenes Gemini + guion ortográfico previo (texto correcto).
 * A4 sin estirar: ratio 2:3 + PDF sin márgenes + object-fit contain.
 */

const MODELOS_IMAGEN = [
  process.env.FICHAS_IA_GEMINI_MODEL_IMAGEN,
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image',
  'gemini-3-pro-image-preview',
  'gemini-2.0-flash-preview-image-generation',
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

function elegirMascota(banda, trabajoId) {
  const pool = POOLS_MASCOTA[banda] || POOLS_MASCOTA.intermedio;
  const idx = Math.abs(Number(trabajoId) || 1) % pool.length;
  for (let i = 0; i < pool.length; i += 1) {
    const asset = leerAsset(pool[(idx + i) % pool.length]);
    if (asset) return asset;
  }
  return null;
}

function tonoPorBanda(banda) {
  const map = {
    infantil: 'preschool cute, large type, short phrases',
    temprano: 'grade 1-2 friendly, clear large illustrations',
    intermedio: 'grade 3-4 colorful textbook infographic',
    mayor: 'grade 5-6 polished educational infographic',
    secundaria: 'modern secondary school infographic',
  };
  return map[banda] || map.intermedio;
}

async function llamarGemini(apiKey, modelo, body, timeout = 180000) {
  const versiones = ['v1beta', 'v1'];
  let ultimo;
  for (const ver of versiones) {
    const url = `https://generativelanguage.googleapis.com/${ver}/models/${modelo}:generateContent?key=${encodeURIComponent(apiKey)}`;
    try {
      const res = await axios.post(url, body, {
        timeout,
        headers: { 'Content-Type': 'application/json' },
      });
      return { data: res.data, modelo, apiVersion: ver };
    } catch (err) {
      ultimo = err;
      if (err.response?.status !== 404) throw err;
    }
  }
  throw ultimo;
}

function extraerImagenesDeRespuesta(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const imgs = [];
  for (const p of parts) {
    const inline = p.inlineData || p.inline_data;
    if (inline?.data) {
      const mime = inline.mimeType || inline.mime_type || 'image/png';
      imgs.push({ mime, base64: inline.data, dataUri: `data:${mime};base64,${inline.data}` });
    }
  }
  return imgs;
}

function htmlDesdePaginasImagen(paginas) {
  // A4 exacto, sin estirar: contain + centrado (evita distorsión 3:4→A4)
  const imgs = paginas
    .map(
      (p, i) =>
        `<section class="page${i < paginas.length - 1 ? ' break' : ''}"><img src="${p.dataUri}" alt="Página ${i + 1}" /></section>`
    )
    .join('\n');
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<title>Ficha Vanguarcito</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; width: 210mm; }
  .page {
    width: 210mm;
    height: 297mm;
    margin: 0;
    padding: 0;
    overflow: hidden;
    page-break-after: always;
    break-after: page;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #fff;
  }
  .page.break { page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  img {
    max-width: 210mm;
    max-height: 297mm;
    width: auto;
    height: auto;
    object-fit: contain;
    display: block;
    image-rendering: -webkit-optimize-contrast;
  }
</style>
</head>
<body>
${imgs}
</body>
</html>`;
}

function partImagen(asset, label) {
  if (!asset) return [];
  return [
    { text: `\n[${label}]` },
    { inline_data: { mime_type: asset.mime, data: asset.base64 } },
  ];
}

/**
 * Paso 1: guion en español correcto (JSON) — reduce faltas ortográficas en la imagen.
 */
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
}) {
  const prompt = `Eres corrector y didacta en español de Perú. Genera SOLO JSON válido (sin markdown).

Tema: ${titulo || 'Tema'}
Grado: ${grado || grupoEtiqueta || '—'}
Área: ${area || '—'}
Unidad: ${unidad || '—'}
Banda edad: ${banda}
Puntos clave: ${(puntosClave || '—').slice(0, 2000)}
Indicaciones docente: ${(instruccionesDocente || '—').slice(0, 1500)}
Texto apoyo: ${(textoOrigen || '').slice(0, 6000)}

Reglas ORTOGRAFÍA:
- Español correcto (tildes, ñ, mayúsculas). Cero faltas.
- Frases cortas y claras para el grado.
- Contenido factual correcto; no inventes datos científicos falsos.

Formato:
{
  "guia": {
    "titulo": "TÍTULO EN MAYÚSCULAS",
    "subtitulo": "Área – Grado",
    "definicion_titulo": "¿Qué es …?",
    "definicion_texto": "2-3 oraciones correctas",
    "importancia_titulo": "¿Por qué es importante …?",
    "importancia_items": ["frase 1", "frase 2", "frase 3", "frase 4", "frase 5"],
    "partes_titulo": "Partes / ideas principales",
    "partes": [{"nombre": "…", "descripcion": "…"}],
    "tipos_titulo": "Tipos / comparación",
    "tipo_a": {"titulo": "…", "items": ["…", "…", "…"]},
    "tipo_b": {"titulo": "…", "items": ["…", "…", "…"]},
    "tipos_nota": "frase de cierre",
    "proceso_titulo": "Proceso / niveles",
    "proceso_pasos": [{"nombre": "…", "descripcion": "…"}],
    "ejemplos_titulo": "Ejemplos",
    "ejemplos": [{"titulo": "…", "descripcion": "…"}],
    "sabias_que": "2 oraciones",
    "recuerda": "1 frase fuerte de síntesis"
  },
  "practica": {
    "titulo": "FICHA DE APLICACIÓN: …",
    "responder": ["pregunta 1", "pregunta 2"],
    "completar": ["oración con ________", "…", "…"],
    "verdadero_falso": ["afirmación 1", "2", "3", "4"],
    "marcar": [
      {"pregunta": "…", "opciones": ["A) …", "B) …", "C) …", "D) …"]}
    ],
    "relacionar_a": ["término 1", "2", "3", "4"],
    "relacionar_b": ["definición 1", "2", "3", "4"],
    "ordenar_instruccion": "…",
    "ordenar_elementos": ["…", "…", "…", "…"],
    "identifica_instruccion": "…",
    "identifica_casos": ["caso A", "caso B"],
    "pie": "frase motivadora"
  }
}`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.25,
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
  throw lastErr || new Error('No se pudo generar guion ortográfico');
}

function textoGuionParaPrompt(guion, tipoPagina) {
  const g = guion.guia || {};
  const p = guion.practica || {};
  if (tipoPagina === 'guia') {
    return `TEXTO EXACTO A PINTAR (español correcto — NO cambies letras, tildes ni palabras):
Título página: GUÍA
Título tema: ${g.titulo || ''}
Subtítulo: ${g.subtitulo || ''}
1) ${g.definicion_titulo || ''}: ${g.definicion_texto || ''}
2) ${g.importancia_titulo || ''}:
${(g.importancia_items || []).map((x, i) => `  - ${x}`).join('\n')}
3) ${g.partes_titulo || ''}:
${(g.partes || []).map((x) => `  - ${x.nombre}: ${x.descripcion}`).join('\n')}
4) ${g.tipos_titulo || ''}:
  A) ${g.tipo_a?.titulo || ''}: ${(g.tipo_a?.items || []).join(' · ')}
  B) ${g.tipo_b?.titulo || ''}: ${(g.tipo_b?.items || []).join(' · ')}
  Nota: ${g.tipos_nota || ''}
5) ${g.proceso_titulo || ''}:
${(g.proceso_pasos || []).map((x, i) => `  ${i + 1}. ${x.nombre}: ${x.descripcion}`).join('\n')}
6) ${g.ejemplos_titulo || ''}:
${(g.ejemplos || []).map((x) => `  - ${x.titulo}: ${x.descripcion}`).join('\n')}
7) ¿Sabías que?: ${g.sabias_que || ''}
¡Recuerda!: ${g.recuerda || ''}`;
  }
  return `TEXTO EXACTO A PINTAR (español correcto — NO cambies letras, tildes ni palabras):
Título: ${p.titulo || 'FICHA DE APLICACIÓN'}
Campos: Nombre ________  Grado ________  Fecha ________
I. RESPONDER:
${(p.responder || []).map((x, i) => `  ${i + 1}. ${x}`).join('\n')}
II. COMPLETAR:
${(p.completar || []).map((x, i) => `  ${i + 1}. ${x}`).join('\n')}
III. VERDADERO O FALSO:
${(p.verdadero_falso || []).map((x, i) => `  ${i + 1}. ${x}`).join('\n')}
IV. MARCAR:
${(p.marcar || [])
  .map(
    (m, i) =>
      `  ${i + 1}. ${m.pregunta}\n${(m.opciones || []).map((o) => `     ${o}`).join('\n')}`
  )
  .join('\n')}
V. RELACIONAR:
  Columna A: ${(p.relacionar_a || []).join(' | ')}
  Columna B: ${(p.relacionar_b || []).join(' | ')}
VI. ORDENAR: ${p.ordenar_instruccion || ''}
  Elementos: ${(p.ordenar_elementos || []).join(' · ')}
VII. IDENTIFICA: ${p.identifica_instruccion || ''}
  ${(p.identifica_casos || []).map((c, i) => `Caso ${i + 1}: ${c}`).join(' | ')}
Pie: ${p.pie || ''}`;
}

async function generarUnaPaginaImagen({
  apiKey,
  tipoPagina,
  banda,
  logo,
  mascota,
  referencia,
  guion,
}) {
  const tono = tonoPorBanda(banda);
  const esGuia = tipoPagina === 'guia';
  const bloqueTexto = textoGuionParaPrompt(guion, tipoPagina);

  const prompt = `${esGuia ? 'Create ONE full-page educational GUÍA infographic IMAGE' : 'Create ONE full-page FICHA DE APLICACIÓN worksheet IMAGE'} for print.

PAGE FORMAT (critical for print):
- Portrait page matching A4 proportions (aspect ~2:3, NOT square, NOT wide).
- Fill the page edge-to-edge with the worksheet design (no photo of a paper on a desk, no 3D mockup).
- Leave a small safe inner margin (~4%) so nothing is clipped.
- Sharp, high-resolution, crisp text (2K quality if available).

STYLE: Match the attached style-reference image (numbered cards, blues/greens/oranges, mascots, dense textbook quality). Age band: ${banda} (${tono}).
Use attached logo + mascot likeness.

${bloqueTexto}

ORTHOGRAPHY RULES (critical):
- Paint the Spanish text EXACTLY as given above. Do not invent alternate spellings.
- Correct accents (áéíóúñü). No random letters, no English typos.
- If space is tight, omit a bullet rather than misspelling.

CRITICAL: single finished page image, high contrast readable text, no AI watermark.`;

  const parts = [
    { text: prompt },
    ...partImagen(referencia, 'REFERENCIA DE ESTILO'),
    ...partImagen(logo, 'LOGO Vanguard'),
    ...partImagen(mascota, 'MASCOTA escolar'),
  ];

  const configs = [
    {
      responseModalities: ['TEXT', 'IMAGE'],
      temperature: 0.35,
      imageConfig: { aspectRatio: '2:3', imageSize: '2K' },
    },
    {
      responseModalities: ['TEXT', 'IMAGE'],
      temperature: 0.35,
      imageConfig: { aspectRatio: '2:3' },
    },
    {
      responseModalities: ['TEXT', 'IMAGE'],
      temperature: 0.35,
      imageConfig: { aspectRatio: '3:4', imageSize: '2K' },
    },
    {
      responseModalities: ['TEXT', 'IMAGE'],
      temperature: 0.35,
    },
  ];

  const errores = [];
  for (const modelo of unicos(MODELOS_IMAGEN)) {
    for (const generationConfig of configs) {
      try {
        const r = await llamarGemini(apiKey, modelo, {
          contents: [{ role: 'user', parts }],
          generationConfig,
        });
        const imgs = extraerImagenesDeRespuesta(r.data);
        if (!imgs.length) {
          errores.push(`${modelo}: sin imagen`);
          continue;
        }
        const usage = r.data?.usageMetadata || {};
        return {
          imagen: imgs[0],
          modelo: r.modelo,
          tokens_entrada: usage.promptTokenCount || 0,
          tokens_salida: usage.candidatesTokenCount || 0,
        };
      } catch (err) {
        const msg = err.response?.data?.error?.message || err.message;
        errores.push(`${modelo}: ${msg}`);
        if (err.response?.status === 429 || err.response?.status === 403) {
          const e = new Error(msg);
          e.code = err.response.status === 429 ? 'GEMINI_RATE_LIMIT' : 'GEMINI_FORBIDDEN';
          throw e;
        }
        // 400 por imageConfig → probar siguiente config
        if (err.response?.status !== 400) break;
      }
    }
  }
  const e = new Error(
    errores.slice(0, 6).join(' | ') ||
      'Ningún modelo de imagen Gemini respondió. Active Gemini Image en AI Studio o use plantilla tipada.'
  );
  e.code = 'GEMINI_IMAGE_FAILED';
  throw e;
}

/**
 * Genera ficha libre: guion ortográfico → 2 imágenes → HTML A4 sin distorsión.
 */
async function generarHtmlDisenoLibre({
  titulo,
  grado,
  grupoEtiqueta,
  area,
  unidad,
  puntosClave,
  textoOrigen,
  instruccionesDocente,
  trabajoId,
}) {
  const apiKey = String(process.env.GOOGLE_AI_API_KEY || '').trim();
  if (!apiKey) {
    const e = new Error('No hay GOOGLE_AI_API_KEY');
    e.code = 'SIN_CLAVE';
    throw e;
  }

  const banda = bandaEdadDesdeGrado(grado, grupoEtiqueta);
  const logo = leerAsset('logo-vanguard.png');
  const mascota = elegirMascota(banda, trabajoId);
  const referencia = leerAsset('referencia-estilo-guia.png');

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
  });

  // Completar subtítulo si falta
  if (guionRes.guion.guia && !guionRes.guion.guia.subtitulo) {
    guionRes.guion.guia.subtitulo = [area, grado || grupoEtiqueta].filter(Boolean).join(' – ');
  }

  const comunes = {
    apiKey,
    banda,
    logo,
    mascota,
    referencia,
    guion: guionRes.guion,
  };

  const pagina1 = await generarUnaPaginaImagen({ ...comunes, tipoPagina: 'guia' });
  const pagina2 = await generarUnaPaginaImagen({ ...comunes, tipoPagina: 'practica' });

  const html = htmlDesdePaginasImagen([pagina1.imagen, pagina2.imagen]);

  return {
    html,
    modelo: `guion:${guionRes.modelo}|img:${pagina1.modelo}+${pagina2.modelo}`,
    proveedor: 'google',
    tokens_entrada:
      (guionRes.tokens_entrada || 0) +
        (pagina1.tokens_entrada || 0) +
        (pagina2.tokens_entrada || 0) || null,
    tokens_salida:
      (guionRes.tokens_salida || 0) +
        (pagina1.tokens_salida || 0) +
        (pagina2.tokens_salida || 0) || null,
    banda_edad: banda,
    mascota_archivo: mascota?.filename || null,
    modo_diseno: 'libre',
    motor: 'imagen+guion',
    pdf_opts: { marginZero: true },
  };
}

module.exports = {
  generarHtmlDisenoLibre,
  bandaEdadDesdeGrado,
};
