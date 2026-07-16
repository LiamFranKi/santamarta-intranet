const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { assetsDir } = require('../../utils/fichasIaPaths');

/**
 * Modo LIBRE = generación por IMAGEN (Gemini Image / Nano Banana).
 * El HTML libre fallaba porque no puede hacer infografías con diagramas reales.
 */

const MODELOS_IMAGEN = [
  process.env.FICHAS_IA_GEMINI_MODEL_IMAGEN,
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image',
  'gemini-3-pro-image-preview',
  'gemini-2.0-flash-preview-image-generation',
].filter(Boolean);

function modelosUnicos() {
  const seen = new Set();
  const out = [];
  for (const m of MODELOS_IMAGEN) {
    const s = String(m || '').trim();
    if (!s || seen.has(s)) continue;
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
    infantil: 'very cute preschool style, large icons, short text, pastel colors',
    temprano: 'friendly grade 1-2 worksheet, clear big illustrations, short sentences',
    intermedio: 'colorful grade 3-4 educational infographic, balanced text and images',
    mayor: 'polished grade 5-6 textbook-quality infographic, clear diagrams, not babyish',
    secundaria: 'modern clean secondary school infographic, professional but colorful',
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
  @page { size: A4; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .page { width: 210mm; min-height: 297mm; margin: 0 auto; page-break-after: always; break-after: page; }
  .page.break { page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  img { width: 100%; height: auto; display: block; }
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

async function generarUnaPaginaImagen({
  apiKey,
  tipoPagina,
  titulo,
  grado,
  grupoEtiqueta,
  area,
  unidad,
  puntosClave,
  textoOrigen,
  instruccionesDocente,
  banda,
  logo,
  mascota,
  referencia,
}) {
  const tono = tonoPorBanda(banda);
  const esGuia = tipoPagina === 'guia';

  const prompt = esGuia
    ? `Create ONE full-page educational WORKSHEET IMAGE (print A4 portrait, dense infographic layout).

STYLE REFERENCE: Match the attached "referencia de estilo" image as closely as possible:
- Title "GUÍA" + topic title
- Two cartoon school mascots framing the header (use the attached mascot character style/clothing cues)
- School logo in a discreet place (attached logo)
- 7 numbered rounded section cards in a clean grid
- Real-looking educational diagrams/illustrations inside sections (not empty boxes)
- Footer green banner "¡Recuerda!" with a strong summary sentence
- Bright blues/greens/oranges, professional kids textbook quality
- Spanish (Peru), age band: ${banda} (${tono})

TOPIC DATA (must be accurate for the grade):
- Title: ${titulo}
- Grade: ${grado || grupoEtiqueta || '—'}
- Subject: ${area || '—'}
- Unit: ${unidad || '—'}
- Key points: ${(puntosClave || '').slice(0, 1500)}
- Teacher notes: ${(instruccionesDocente || '').slice(0, 1200)}
- Extra text: ${(textoOrigen || '').slice(0, 4000)}

SECTION STRUCTURE (fill with THIS topic, not cells unless the topic is cells):
1) ¿Qué es…? + illustration
2) ¿Por qué es importante…? + bullets + mascots
3) Partes / ideas principales with labeled callouts
4) Tipos / comparación two columns
5) Proceso / niveles with arrows
6) Ejemplos (3 cards)
7) ¿Sabías que?
Footer: ¡Recuerda!

CRITICAL:
- Output a single finished page image (not a mockup on a desk).
- Readable Spanish text, high contrast.
- No English UI chrome, no watermarks saying AI.
- Use the attached logo and mascot likeness.`
    : `Create ONE full-page educational PRACTICE WORKSHEET IMAGE (print A4 portrait).

STYLE: Same brand as the attached style reference (colors, rounded cards, mascots, logo), but this page is "FICHA DE APLICACIÓN".
- Header with title FICHA DE APLICACIÓN: ${titulo}
- Fields: Nombre / Grado / Fecha
- Subject line: ${area || '—'} – ${grado || grupoEtiqueta || '—'}
- Age band: ${banda} (${tono})
- Include attached logo + mascot 1-2 times

Activities (all on THIS page, Spanish):
I. RESPONDER (2 open questions with answer lines)
II. COMPLETAR (3 fill-in-the-blank sentences + small illustration)
III. VERDADERO O FALSO (4 statements with V/F boxes)
IV. MARCAR (2 multiple-choice a-b-c-d)
V. RELACIONAR (match columns)
VI. ORDENAR (scrambled items + empty sequence boxes)
VII. IDENTIFICA (2 illustrated cases to label)
Footer motivational line.

Topic: ${titulo}
Key points: ${(puntosClave || '').slice(0, 1200)}
Teacher notes: ${(instruccionesDocente || '').slice(0, 800)}

CRITICAL: finished printable page, readable Spanish, no notebook mentions, no AI watermark.`;

  const parts = [
    { text: prompt },
    ...partImagen(referencia, 'REFERENCIA DE ESTILO (imitar layout y calidad visual)'),
    ...partImagen(logo, 'LOGO institucional Vanguard'),
    ...partImagen(mascota, 'MASCOTA / personaje escolar (usar en la ficha)'),
  ];

  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      temperature: 0.6,
      imageConfig: {
        aspectRatio: '3:4',
      },
    },
  };

  const errores = [];
  for (const modelo of modelosUnicos()) {
    try {
      // Algunos modelos usan imageConfig; si 400, reintentar sin imageConfig
      let r;
      try {
        r = await llamarGemini(apiKey, modelo, body);
      } catch (err) {
        if (err.response?.status === 400) {
          const body2 = {
            contents: body.contents,
            generationConfig: { responseModalities: ['TEXT', 'IMAGE'], temperature: 0.6 },
          };
          r = await llamarGemini(apiKey, modelo, body2);
        } else {
          throw err;
        }
      }
      const imgs = extraerImagenesDeRespuesta(r.data);
      if (!imgs.length) {
        errores.push(`${modelo}: respondió sin imagen`);
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
    }
  }
  const e = new Error(
    errores.join(' | ') ||
      'Ningún modelo de imagen Gemini respondió. Active Gemini Image en AI Studio o use plantilla tipada.'
  );
  e.code = 'GEMINI_IMAGE_FAILED';
  throw e;
}

/**
 * Genera ficha libre como 2 imágenes A4 (guía + práctica) → HTML para Puppeteer.
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

  const comunes = {
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
    logo,
    mascota,
    referencia,
  };

  const pagina1 = await generarUnaPaginaImagen({ ...comunes, tipoPagina: 'guia' });
  const pagina2 = await generarUnaPaginaImagen({ ...comunes, tipoPagina: 'practica' });

  const html = htmlDesdePaginasImagen([pagina1.imagen, pagina2.imagen]);

  return {
    html,
    modelo: `${pagina1.modelo}+${pagina2.modelo}`,
    proveedor: 'google',
    tokens_entrada: (pagina1.tokens_entrada || 0) + (pagina2.tokens_entrada || 0) || null,
    tokens_salida: (pagina1.tokens_salida || 0) + (pagina2.tokens_salida || 0) || null,
    banda_edad: banda,
    mascota_archivo: mascota?.filename || null,
    modo_diseno: 'libre',
    motor: 'imagen',
  };
}

module.exports = {
  generarHtmlDisenoLibre,
  bandaEdadDesdeGrado,
};
