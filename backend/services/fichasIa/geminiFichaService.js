const axios = require('axios');

const MODEL = process.env.FICHAS_IA_GEMINI_MODEL || 'gemini-2.0-flash';

function geminiDisponible() {
  return Boolean(String(process.env.GOOGLE_AI_API_KEY || '').trim());
}

/**
 * Pide a Gemini estructurar el contenido en JSON para la plantilla Vanguard.
 */
async function estructurarContenidoConGemini({ titulo, grado, area, unidad, textoOrigen, puntosClave }) {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    const err = new Error('GOOGLE_AI_API_KEY no configurada');
    err.code = 'GEMINI_NO_CONFIG';
    throw err;
  }

  const prompt = `Eres un diseñador pedagógico para colegios en Perú. A partir del material del docente, genera SOLO un JSON válido (sin markdown) con esta forma exacta:
{
  "intro": "párrafo introductorio corto para estudiantes",
  "recuerda": ["bullet 1", "bullet 2", "bullet 3"],
  "actividades": [
    {
      "tipo": "tabla_partes",
      "titulo": "1. Observa y completa la tabla",
      "instruccion": "texto breve",
      "columnas": ["Parte", "Función"],
      "filas": [{"parte": "Raíz", "funcion": ""}, {"parte": "Tallo", "funcion": ""}]
    },
    {
      "tipo": "preguntas",
      "titulo": "2. Responde",
      "preguntas": ["pregunta a", "pregunta b"]
    }
  ],
  "pie_motivacional": "frase corta motivacional sobre el tema"
}
Reglas: español de Perú, máximo 4 actividades, adecuado al grado indicado, no inventar datos científicos falsos.
Los "puntos clave" deben ser contenido CURRICULAR del tema (ej. plantas, fotosíntesis), NO instrucciones de diseño gráfico (colores, tipografía, imágenes realistas).
Si los puntos clave parecen pedidos de maquetación, ignóralos y genera contenido pedagógico del título y área.
El intro debe ser un párrafo claro de 4-8 líneas, no una sola palabra repetida.

Datos del formulario:
- Título: ${titulo || 'Sin título'}
- Grado: ${grado || '—'}
- Área: ${area || '—'}
- Unidad: ${unidad || '—'}
- Puntos clave del docente: ${puntosClave || '—'}

Texto extraído del PDF (puede estar vacío):
---
${(textoOrigen || '').slice(0, 12000)}
---`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
    },
  };

  let data;
  try {
    const res = await axios.post(url, body, {
      timeout: 120000,
      headers: { 'Content-Type': 'application/json' },
    });
    data = res.data;
  } catch (err) {
    const status = err.response?.status;
    if (status === 429) {
      const e = new Error(
        'Vanguarcito alcanzó el límite de solicitudes (429). Espere 1–2 minutos o genere la ficha sin Vanguarcito.'
      );
      e.code = 'GEMINI_RATE_LIMIT';
      throw e;
    }
    if (status === 403) {
      const e = new Error('Vanguarcito no está configurado correctamente en el servidor (403).');
      e.code = 'GEMINI_FORBIDDEN';
      throw e;
    }
    throw err;
  }

  const text =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  const usage = data?.usageMetadata || {};

  let parsed;
  try {
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (e) {
    const err = new Error('Vanguarcito no devolvió una respuesta válida');
    err.code = 'GEMINI_JSON_INVALID';
    err.raw = text.slice(0, 500);
    throw err;
  }

  return {
    contenido: normalizarContenido(parsed),
    tokens_entrada: usage.promptTokenCount || null,
    tokens_salida: usage.candidatesTokenCount || null,
    modelo: MODEL,
    proveedor: 'google',
  };
}

function normalizarContenido(raw) {
  const intro = String(raw?.intro || '').trim();
  const recuerda = Array.isArray(raw?.recuerda)
    ? raw.recuerda.map((x) => String(x).trim()).filter(Boolean)
    : [];
  const actividades = Array.isArray(raw?.actividades) ? raw.actividades : [];
  const pie_motivacional = String(raw?.pie_motivacional || '').trim();
  return { intro, recuerda, actividades, pie_motivacional };
}

function pareceInstruccionesDiseno(lineas) {
  if (!lineas.length) return false;
  const patron =
    /pasteles?|tipograf|letra\s+que|im[aá]gen(es)?\s+real|colores?\s|diseño|maquet|formato\s+visual|realistas?/i;
  const hits = lineas.filter((l) => patron.test(l)).length;
  return hits >= Math.max(1, Math.ceil(lineas.length * 0.5));
}

/** Contenido mínimo sin Vanguarcito (formulario + puntos clave). */
function contenidoDesdeFormulario({ titulo, puntosClave, textoOrigen, area }) {
  const bullets = String(puntosClave || '')
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const esDiseno = pareceInstruccionesDiseno(bullets);
  const tema = titulo || area || 'el tema de la unidad';

  const intro =
    String(textoOrigen || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 900) ||
    `En esta ficha conoceremos ${tema}. Lee con atención, observa los ejemplos y responde las actividades en tu cuaderno. Tu docente te guiará en el aula.`;

  const recuerdaCurricular = esDiseno
    ? [
        `Identifica las ideas principales sobre ${tema}`,
        'Lee cada pregunta antes de responder',
        'Usa tus propias palabras y ejemplos del aula',
      ]
    : bullets.slice(0, 5);

  const preguntas = esDiseno
    ? [
        `¿Qué aprendiste sobre ${tema}?`,
        '¿Por qué es importante este tema en tu vida y en el medio ambiente?',
        'Menciona un ejemplo que hayas visto en clase o en tu entorno.',
      ]
    : bullets.length
      ? bullets.slice(0, 3).map((b) => `Explica con tus palabras: ${b}`)
      : [
          `¿Qué aprendiste sobre ${tema}?`,
          '¿Por qué es importante este tema?',
          'Da un ejemplo relacionado con lo leído.',
        ];

  return {
    intro,
    recuerda: recuerdaCurricular,
    actividades: [
      {
        tipo: 'preguntas',
        titulo: '1. Responde según lo leído',
        preguntas,
      },
    ],
    pie_motivacional: '¡Sigue aprendiendo con esfuerzo y curiosidad!',
  };
}

module.exports = {
  geminiDisponible,
  estructurarContenidoConGemini,
  contenidoDesdeFormulario,
  MODEL,
};
