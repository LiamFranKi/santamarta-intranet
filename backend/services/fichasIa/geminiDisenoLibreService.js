const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { assetsDir } = require('../../utils/fichasIaPaths');

/** Modelos con buen soporte multimodal + salida larga */
const MODELOS_LIBRE = [
  process.env.FICHAS_IA_GEMINI_MODEL_LIBRE,
  process.env.FICHAS_IA_GEMINI_MODEL,
  'gemini-2.5-flash',
  'gemini-2.0-flash-001',
].filter(Boolean);

function normalizarModelo(m) {
  const s = String(m || '').trim();
  if (s === 'gemini-2.0-flash') return 'gemini-2.5-flash';
  return s;
}

function modelosUnicos() {
  const seen = new Set();
  const out = [];
  for (const m of MODELOS_LIBRE.map(normalizarModelo)) {
    if (!m || seen.has(m)) continue;
    seen.add(m);
    out.push(m);
  }
  return out;
}

/**
 * Banda de edad según grado/etiqueta para adaptar mascota y diseño.
 * @returns {'infantil'|'temprano'|'intermedio'|'mayor'|'secundaria'}
 */
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

function leerPngBase64(filename) {
  const full = path.join(assetsDir, filename);
  if (!fs.existsSync(full)) return null;
  const base64 = fs.readFileSync(full).toString('base64');
  return {
    filename,
    mime: 'image/png',
    base64,
    dataUri: `data:image/png;base64,${base64}`,
  };
}

function elegirMascota(banda, trabajoId) {
  const pool = POOLS_MASCOTA[banda] || POOLS_MASCOTA.intermedio;
  const idx = Math.abs(Number(trabajoId) || 1) % pool.length;
  for (let i = 0; i < pool.length; i += 1) {
    const asset = leerPngBase64(pool[(idx + i) % pool.length]);
    if (asset) return asset;
  }
  return null;
}

function tonoPorBanda(banda) {
  const map = {
    infantil: 'muy infantil, colores pastel, tipografía grande, iconos grandes, poco texto por bloque',
    temprano: 'amigable para 1°-2°, tipografía clara, ilustraciones grandes, oraciones cortas',
    intermedio: 'escolar atractiva 3°-4°, balance texto/imagen, secciones numeradas',
    mayor: 'seria pero colorida 5°-6°, más contenido, diagramas claros, sin verse infantil excesivo',
    secundaria: 'moderna y limpia para secundaria, tipografía profesional, menos “kawaii”, más infografía',
  };
  return map[banda] || map.intermedio;
}

async function llamarGeminiMultimodal(apiKey, modelo, body, timeout = 180000) {
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

function extraerHtml(text) {
  let t = String(text || '').trim();
  t = t.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  const i = t.toLowerCase().indexOf('<!doctype');
  const j = t.toLowerCase().indexOf('<html');
  const start = i >= 0 ? i : j;
  if (start >= 0) t = t.slice(start);
  const end = t.toLowerCase().lastIndexOf('</html>');
  if (end >= 0) t = t.slice(0, end + 7);
  if (!/<html[\s>]/i.test(t)) {
    throw Object.assign(new Error('Vanguarcito no devolvió HTML completo'), { code: 'GEMINI_HTML_INVALID' });
  }
  // Quitar scripts por seguridad
  t = t.replace(/<script[\s\S]*?<\/script>/gi, '');
  return t;
}

function inyectarAssets(html, logo, mascota) {
  let out = html;
  if (logo?.dataUri) {
    out = out
      .replace(/__LOGO_SRC__/g, logo.dataUri)
      .replace(/\{\{LOGO_URL\}\}/g, logo.dataUri)
      .replace(/src=["']logo["']/gi, `src="${logo.dataUri}"`);
  }
  if (mascota?.dataUri) {
    out = out
      .replace(/__MASCOTA_SRC__/g, mascota.dataUri)
      .replace(/\{\{MASCOTA_URL\}\}/g, mascota.dataUri)
      .replace(/src=["']mascota["']/gi, `src="${mascota.dataUri}"`);
  }
  // Si el modelo no usó placeholders, insertar logo/mascota fijos en un header si faltan data:image
  if (logo?.dataUri && !out.includes(logo.dataUri.slice(0, 40)) && !out.includes('__LOGO')) {
    out = out.replace(
      /<body[^>]*>/i,
      (m) =>
        `${m}\n<!-- assets Vanguard --><div style="display:none"><img id="vanguard-logo" src="${logo.dataUri}"/><img id="vanguard-mascota" src="${mascota?.dataUri || logo.dataUri}"/></div>`
    );
  }
  return out;
}

/**
 * Genera HTML A4 libre (2 hojas) con Gemini multimodal.
 * Logo + mascota van como referencia visual; se inyectan en el HTML final.
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
  const logo = leerPngBase64('logo-vanguard.png');
  const mascota = elegirMascota(banda, trabajoId);
  const tono = tonoPorBanda(banda);

  const prompt = `Eres un diseñador gráfico + didacta escolar (marca Vanguard Schools / Vanguarcito).

TAREA: genera UNA ficha escolar lista para imprimir en PDF A4, en HTML+CSS autocontenido (un solo archivo).

CONTENIDO OBLIGATORIO (2 páginas A4):
1) GUÍA / INFOGRAFÍA del tema (definición, importancia, partes, tipos o comparación, proceso/niveles, ejemplos, ¿sabías que?, recuerda).
2) FICHA DE APLICACIÓN con: Nombre/Grado/Fecha + actividades variadas (responder, completar, V/F, marcar, relacionar, ordenar, identificar).

DATOS:
- Título: ${titulo || 'Tema'}
- Grado: ${grado || grupoEtiqueta || '—'}
- Área: ${area || '—'}
- Unidad: ${unidad || '—'}
- Banda de edad/diseño: ${banda} → estilo visual: ${tono}
- Puntos clave: ${(puntosClave || '—').slice(0, 2000)}
- Indicaciones docente: ${(instruccionesDocente || '—').slice(0, 2000)}
- Texto apoyo (puede estar vacío): ${(textoOrigen || '').slice(0, 8000)}

IMÁGENES ADJUNTAS (referencia visual):
1) Logo institucional Vanguard — úsalo en el encabezado.
2) Mascota / alumno ilustrado — úsala 1-3 veces (cabecera, pie o costado). Adapta el diseño a la edad (${banda}).

REGLAS DE SALIDA:
- Responde SOLO con HTML completo empezando en <!DOCTYPE html> (sin markdown).
- CSS embebido en <style>. Colores vivos, layout denso tipo infografía profesional.
- Usa exactamente estos placeholders para las imágenes (obligatorio):
  src="__LOGO_SRC__"  y  src="__MASCOTA_SRC__"
- NO uses JavaScript.
- Español de Perú, contenido correcto para el grado.
- Todo el trabajo de la práctica se hace EN LA HOJA (prohibido decir cuaderno/libreta).
- page-break entre hoja 1 y hoja 2 (@media print / page-break-after).
- Márgenes seguros para impresión A4.`;

  const parts = [{ text: prompt }];
  if (logo) {
    parts.push({ text: '\n[Imagen 1: LOGO institucional]' });
    parts.push({ inline_data: { mime_type: logo.mime, data: logo.base64 } });
  }
  if (mascota) {
    parts.push({ text: '\n[Imagen 2: MASCOTA / personaje según edad]' });
    parts.push({ inline_data: { mime_type: mascota.mime, data: mascota.base64 } });
  }

  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.75,
      maxOutputTokens: 16384,
    },
  };

  const errores = [];
  let data;
  let modeloUsado;
  for (const modelo of modelosUnicos()) {
    try {
      const r = await llamarGeminiMultimodal(apiKey, modelo, body);
      data = r.data;
      modeloUsado = r.modelo;
      break;
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
  if (!data) {
    const e = new Error(errores.join(' | ') || 'Diseño libre: ningún modelo respondió');
    e.code = 'GEMINI_ALL_MODELS_FAILED';
    throw e;
  }

  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  let html = extraerHtml(text);
  html = inyectarAssets(html, logo, mascota);

  const usage = data?.usageMetadata || {};
  return {
    html,
    modelo: modeloUsado,
    proveedor: 'google',
    tokens_entrada: usage.promptTokenCount || null,
    tokens_salida: usage.candidatesTokenCount || null,
    banda_edad: banda,
    mascota_archivo: mascota?.filename || null,
    modo_diseno: 'libre',
  };
}

module.exports = {
  generarHtmlDisenoLibre,
  bandaEdadDesdeGrado,
};
