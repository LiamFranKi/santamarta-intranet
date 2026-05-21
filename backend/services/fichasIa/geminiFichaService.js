const axios = require('axios');

/** Modelos retirados en API nuevas (404). Se sustituyen al probar. */
const MODELO_SUSTITUTO = {
  'gemini-2.0-flash': 'gemini-2.5-flash',
  'gemini-1.5-flash': 'gemini-2.5-flash',
  'gemini-1.5-pro': 'gemini-2.5-flash',
};

const MODELOS_POR_DEFECTO = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash-001',
  'gemini-1.5-flash-8b',
];

function normalizarNombreModelo(nombre) {
  const m = String(nombre || '').trim();
  if (!m) return null;
  return MODELO_SUSTITUTO[m] || m;
}

function modelosAProbar() {
  const vistos = new Set();
  const lista = [];
  const envModel = normalizarNombreModelo(process.env.FICHAS_IA_GEMINI_MODEL);
  if (envModel) lista.push(envModel);
  for (const m of MODELOS_POR_DEFECTO) lista.push(m);
  return lista.filter((m) => {
    if (vistos.has(m)) return false;
    vistos.add(m);
    return true;
  });
}

function geminiDisponible() {
  return Boolean(String(process.env.GOOGLE_AI_API_KEY || '').trim());
}

function extraerErrorGoogle(err) {
  return (
    err.response?.data?.error?.message ||
    err.response?.data?.error?.status ||
    err.message ||
    'Error desconocido'
  );
}

async function llamarGemini(apiKey, modelo, body, timeout = 120000) {
  const versiones = ['v1beta', 'v1'];
  let ultimoErr;
  for (const ver of versiones) {
    const url = `https://generativelanguage.googleapis.com/${ver}/models/${modelo}:generateContent?key=${encodeURIComponent(apiKey)}`;
    try {
      const res = await axios.post(url, body, {
        timeout,
        headers: { 'Content-Type': 'application/json' },
      });
      return { data: res.data, modelo, apiVersion: ver };
    } catch (err) {
      ultimoErr = err;
      if (err.response?.status !== 404) throw err;
    }
  }
  throw ultimoErr;
}

function errorGeminiAmigable(err, modelo) {
  const status = err.response?.status;
  const googleMsg = extraerErrorGoogle(err);
  if (status === 429) {
    const e = new Error(`Vanguarcito: límite (429). ${googleMsg}`);
    e.code = 'GEMINI_RATE_LIMIT';
    return e;
  }
  if (status === 403) {
    const e = new Error(
      `Vanguarcito rechazó la clave (403) con modelo ${modelo}. ${googleMsg} Active «Generative Language API» en Google Cloud para el proyecto de la API key.`
    );
    e.code = 'GEMINI_FORBIDDEN';
    return e;
  }
  if (status === 404) {
    const e = new Error(`Modelo ${modelo} no disponible (404). ${googleMsg}`);
    e.code = 'GEMINI_MODEL_NOT_FOUND';
    return e;
  }
  if (status === 400) {
    const e = new Error(`Solicitud inválida (400) en ${modelo}. ${googleMsg}`);
    e.code = 'GEMINI_BAD_REQUEST';
    return e;
  }
  const e = new Error(`Vanguarcito (${status || 'sin código'}) en ${modelo}: ${googleMsg}`);
  e.code = 'GEMINI_ERROR';
  return e;
}

/**
 * Pide a Vanguarcito (Gemini) estructurar teoría + ficha de aplicación en JSON.
 */
async function estructurarContenidoConGemini({
  titulo,
  grado,
  area,
  unidad,
  textoOrigen,
  puntosClave,
  instruccionesDocente,
}) {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    const err = new Error('GOOGLE_AI_API_KEY no configurada');
    err.code = 'GEMINI_NO_CONFIG';
    throw err;
  }

  const bloqueInstrucciones = instruccionesDocente
    ? `\nInstrucciones del docente (prioridad alta — intégralas sin contradecir el currículo):\n${instruccionesDocente.slice(0, 4000)}\n`
    : '';

  const prompt = `Eres un especialista en didáctica para colegios en Perú (Vanguarcito). Genera SOLO JSON válido (sin markdown).

Objetivo: ficha PROFUNDA y pedagógica (como mini capítulo de estudio), no texto genérico ni plantilla vacía.

Formato exacto:
{
  "teoria": {
    "titulo_seccion": "Aprendemos: [tema]",
    "parrafos": [
      "Mínimo 4 párrafos distintos; cada uno con 4-6 oraciones claras para el grado.",
      "Incluye definiciones, causas, consecuencias y ejemplos del Perú/entorno escolar.",
      "Desarrolla conceptos del título y puntos clave con profundidad (no repitas solo el título)."
    ],
    "glosario": [
      {"termino": "Palabra clave", "definicion": "Definición breve y comprensible para el grado"}
    ],
    "recuerda": ["5 a 7 ideas clave formuladas como frases completas, no solo palabras sueltas"],
    "ilustraciones": [
      {
        "titulo": "Nombre del concepto visual",
        "descripcion": "Qué debe observar el niño en esta ilustración (2-3 oraciones, lenguaje visual)",
        "emoji": "🌱"
      }
    ]
  },
  "aplicacion": {
    "titulo_seccion": "FICHA DE APLICACIÓN",
    "instruccion_general": "Instrucción motivadora para el niño.",
    "actividades": [
      {
        "tipo": "tabla_partes",
        "titulo": "1. Observa y relaciona",
        "instruccion": "texto",
        "columnas": ["Concepto", "Ejemplo / función"],
        "filas": [{"parte": "…", "funcion": ""}]
      },
      {
        "tipo": "preguntas",
        "titulo": "2. Piensa y responde",
        "preguntas": ["Preguntas abiertas que exijan razonar y usar la teoría"]
      }
    ]
  },
  "pie_motivacional": "frase motivacional sobre el tema"
}

Reglas obligatorias:
- Español de Perú; vocabulario acorde al grado ${grado || 'indicado'}.
- TEORÍA: mínimo 4 párrafos sustantivos; glosario con 4-6 términos; 2-3 ilustraciones con emoji representativo del concepto (no mascotas del colegio).
- RECUERDA: frases completas con contenido, no listas de una palabra.
- APLICACIÓN: 3-4 actividades variadas (tabla + preguntas + al menos una pregunta de análisis o situación real).
- No copies instrucciones de diseño gráfico (colores, tipografía, logos).
- Si faltan datos, investiga el tema desde el título y el área curricular con rigor escolar.
${bloqueInstrucciones}
Datos del formulario:
- Título: ${titulo || 'Sin título'}
- Grado: ${grado || '—'}
- Área: ${area || '—'}
- Unidad: ${unidad || '—'}
- Puntos clave: ${puntosClave || '—'}

Texto extraído del PDF de apoyo (puede estar vacío):
---
${(textoOrigen || '').slice(0, 14000)}
---`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.55,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
    },
  };

  let data;
  let modeloUsado;
  const errores = [];
  for (const modelo of modelosAProbar()) {
    try {
      const res = await llamarGemini(apiKey, modelo, body);
      data = res.data;
      modeloUsado = res.modelo;
      break;
    } catch (err) {
      const amig = errorGeminiAmigable(err, modelo);
      errores.push(amig.message);
      if (amig.code !== 'GEMINI_MODEL_NOT_FOUND' && amig.code !== 'GEMINI_BAD_REQUEST') {
        throw amig;
      }
    }
  }
  if (!data) {
    const probados = modelosAProbar().join(', ');
    const e = new Error(
      (errores.join(' | ') || 'Ningún modelo Gemini respondió') +
        ` (probados: ${probados}). Si usa gemini-2.0-flash en .env, cámbielo a gemini-2.5-flash.`
    );
    e.code = 'GEMINI_ALL_MODELS_FAILED';
    throw e;
  }

  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
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
    modelo: modeloUsado,
    proveedor: 'google',
  };
}

function normalizarContenido(raw) {
  let teoria;
  let aplicacion;

  if (raw?.teoria && raw?.aplicacion) {
    teoria = {
      titulo_seccion: String(raw.teoria.titulo_seccion || 'Aprendemos el tema').trim(),
      parrafos: Array.isArray(raw.teoria.parrafos)
        ? raw.teoria.parrafos.map((p) => String(p).trim()).filter(Boolean)
        : [String(raw.teoria.texto || raw.intro || '').trim()].filter(Boolean),
      glosario: Array.isArray(raw.teoria.glosario)
        ? raw.teoria.glosario
            .map((g) => ({
              termino: String(g?.termino || g?.term || '').trim(),
              definicion: String(g?.definicion || g?.def || '').trim(),
            }))
            .filter((g) => g.termino && g.definicion)
        : [],
      ilustraciones: Array.isArray(raw.teoria.ilustraciones)
        ? raw.teoria.ilustraciones
            .map((il) => ({
              titulo: String(il?.titulo || '').trim(),
              descripcion: String(il?.descripcion || il?.texto || '').trim(),
              emoji: String(il?.emoji || '📘').trim().slice(0, 4) || '📘',
            }))
            .filter((il) => il.titulo && il.descripcion)
            .slice(0, 3)
        : [],
      recuerda: Array.isArray(raw.teoria.recuerda)
        ? raw.teoria.recuerda.map((x) => String(x).trim()).filter(Boolean)
        : [],
    };
    aplicacion = {
      titulo_seccion: String(raw.aplicacion.titulo_seccion || 'FICHA DE APLICACIÓN').trim(),
      instruccion_general: String(
        raw.aplicacion.instruccion_general || raw.aplicacion.instruccion || ''
      ).trim(),
      actividades: Array.isArray(raw.aplicacion.actividades) ? raw.aplicacion.actividades : [],
    };
  } else {
    const intro = String(raw?.intro || '').trim();
    const recuerda = Array.isArray(raw?.recuerda)
      ? raw.recuerda.map((x) => String(x).trim()).filter(Boolean)
      : [];
    teoria = {
      titulo_seccion: 'Aprendemos el tema',
      parrafos: intro ? [intro] : ['Lee con atención el tema de esta unidad.'],
      recuerda,
    };
    aplicacion = {
      titulo_seccion: 'FICHA DE APLICACIÓN',
      instruccion_general: 'Demuestra lo que aprendiste en la teoría.',
      actividades: Array.isArray(raw?.actividades) ? raw.actividades : [],
    };
  }

  if (!teoria.parrafos.length) {
    teoria.parrafos = ['Exploramos este tema con ejemplos del aula.'];
  }
  if (!teoria.recuerda.length) {
    teoria.recuerda = ['Lee con atención', 'Observa los ejemplos', 'Pregunta a tu docente si tienes dudas'];
  }

  const intro = teoria.parrafos.join('\n\n');
  const actividades = aplicacion.actividades;
  const pie_motivacional = String(raw?.pie_motivacional || '').trim();

  return {
    teoria,
    aplicacion,
    intro,
    recuerda: teoria.recuerda,
    glosario: teoria.glosario || [],
    ilustraciones: teoria.ilustraciones || [],
    actividades,
    pie_motivacional,
  };
}

function pareceInstruccionesDiseno(lineas) {
  if (!lineas.length) return false;
  const patron =
    /pasteles?|tipograf|letra\s+que|im[aá]gen(es)?\s+real|colores?\s|diseño|maquet|formato\s+visual|realistas?/i;
  const hits = lineas.filter((l) => patron.test(l)).length;
  return hits >= Math.max(1, Math.ceil(lineas.length * 0.5));
}

/** Contenido sin Vanguarcito: teoría breve + aplicación simple. */
function contenidoDesdeFormulario({ titulo, puntosClave, textoOrigen, area }) {
  const bullets = String(puntosClave || '')
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const esDiseno = pareceInstruccionesDiseno(bullets);
  const tema = titulo || area || 'el tema de la unidad';

  const textoPdf = String(textoOrigen || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 900);

  const parrafos = textoPdf
    ? [textoPdf]
    : [
        `En esta unidad conoceremos ${tema}. Es un tema importante en ${area || 'tu curso'}.`,
        `Observa, escucha a tu docente y participa en las actividades del aula para comprender mejor.`,
      ];

  const recuerdaCurricular = esDiseno
    ? [
        `Ideas principales sobre ${tema}`,
        'Participa en clase con respeto y atención',
        'Relaciona lo aprendido con tu entorno',
      ]
    : bullets.length
      ? bullets.slice(0, 5)
      : ['Lee con atención', 'Responde con tus palabras', 'Consulta a tu docente'];

  const preguntas = esDiseno
    ? [
        `¿Qué aprendiste sobre ${tema}?`,
        `¿Cómo se relaciona ${tema} con tu vida diaria?`,
        'Menciona un ejemplo que viste en clase.',
      ]
    : bullets.length
      ? [
          `Explica con tus palabras qué es ${bullets[0] || tema} y por qué es importante.`,
          bullets[1]
            ? `Da un ejemplo de ${bullets[1]} relacionado con ${tema}.`
            : `¿Qué más te gustaría saber sobre ${tema}?`,
          `¿Cómo cuidarías o protegerías algo relacionado con ${tema}?`,
        ]
      : [
          `¿Qué aprendiste sobre ${tema}?`,
          '¿Por qué es importante este tema?',
          'Da un ejemplo del aula o de tu casa.',
        ];

  const teoria = {
    titulo_seccion: `Aprendemos: ${tema}`,
    parrafos,
    recuerda: recuerdaCurricular,
  };

  const aplicacion = {
    titulo_seccion: 'FICHA DE APLICACIÓN',
    instruccion_general:
      'Usa lo que leíste en la teoría. Responde con tus propias palabras y dibujos si tu docente lo indica.',
    actividades: [
      {
        tipo: 'preguntas',
        titulo: '1. Aplica lo aprendido',
        preguntas,
      },
    ],
  };

  return {
    teoria,
    aplicacion,
    intro: parrafos.join('\n\n'),
    recuerda: recuerdaCurricular,
    actividades: aplicacion.actividades,
    pie_motivacional: '¡Sigue aprendiendo con esfuerzo y curiosidad!',
  };
}

/** Prueba real contra la API (no solo que exista la variable en .env). */
async function probarConexionVanguarcito() {
  const key = String(process.env.GOOGLE_AI_API_KEY || '').trim();
  if (!key) {
    return {
      ok: false,
      codigo: 'SIN_CLAVE',
      mensaje:
        'No hay GOOGLE_AI_API_KEY en backend/.env del servidor. El prepago en AI Studio no alcanza: debe pegar la clave ahí y reiniciar pm2.',
    };
  }
  const sufijo = key.length > 8 ? `${key.slice(0, 4)}…${key.slice(-4)}` : '****';
  const body = {
    contents: [{ parts: [{ text: 'Responde solo este JSON: {"prueba":true}' }] }],
    generationConfig: { maxOutputTokens: 32, responseMimeType: 'application/json' },
  };
  const errores = [];
  for (const modelo of modelosAProbar()) {
    try {
      await llamarGemini(key, modelo, body, 45000);
      return {
        ok: true,
        codigo: 'OK',
        mensaje: 'Vanguarcito respondió correctamente. Puede generar fichas con IA.',
        modelo,
        clave_sufijo: sufijo,
        modelos_probados: modelosAProbar(),
      };
    } catch (err) {
      const amig = errorGeminiAmigable(err, modelo);
      errores.push(amig.message);
      if (amig.code !== 'GEMINI_MODEL_NOT_FOUND' && amig.code !== 'GEMINI_BAD_REQUEST') {
        return {
          ok: false,
          codigo: amig.code,
          mensaje: amig.message,
          modelo,
          clave_sufijo: sufijo,
          ayuda:
            amig.code === 'GEMINI_FORBIDDEN'
              ? 'En console.cloud.google.com → APIs → habilite «Generative Language API» en el proyecto de la API key (sistema-intranet).'
              : 'Revise backend/.env y pm2 restart all.',
        };
      }
    }
  }
  return {
    ok: false,
    codigo: 'GEMINI_ALL_MODELS_FAILED',
    mensaje: errores.join(' | '),
    modelo: modelosAProbar()[0],
    clave_sufijo: sufijo,
    ayuda: 'En backend/.env use FICHAS_IA_GEMINI_MODEL=gemini-2.5-flash (gemini-2.0-flash da 404 en proyectos nuevos).',
  };
}

module.exports = {
  geminiDisponible,
  estructurarContenidoConGemini,
  contenidoDesdeFormulario,
  probarConexionVanguarcito,
  modelosAProbar,
};
