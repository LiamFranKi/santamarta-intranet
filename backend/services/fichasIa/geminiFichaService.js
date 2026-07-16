const axios = require('axios');
const { normalizarActividades, sanitizarTextoFicha } = require('./normalizarActividades');
const { normalizarEjerciciosMatematica } = require('./normalizarEjerciciosMatematica');
const { esEstiloMatematica } = require('./estilosFicha');
const {
  normalizarGuiaPractica,
  completarGuiaPracticaMinima,
  guiaPracticaALegacy,
} = require('./normalizarGuiaPractica');

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
 * Pide a Vanguarcito (Gemini) GUÍA tipada (7 bloques) + FICHA DE APLICACIÓN tipada (7 actividades).
 * La maquetación visual la hace la plantilla; aquí solo contenido.
 */
function buildPromptGeneral({ titulo, grado, area, unidad, puntosClave, textoOrigen, instruccionesDocente }) {
  const bloqueInstrucciones = instruccionesDocente
    ? `\nInstrucciones del docente (prioridad alta):\n${instruccionesDocente.slice(0, 4000)}\n`
    : '';

  return `Eres Vanguarcito, didáctica para colegios en Perú. Genera SOLO JSON válido (sin markdown).

Debes armar DOS hojas escolares tipadas (como ficha institucional de alta calidad):
1) GUÍA (infografía de estudio, 7 bloques fijos)
2) FICHA DE APLICACIÓN (práctica, 7 actividades fijas)

Formato exacto:
{
  "guia": {
    "titulo": "TÍTULO DEL TEMA EN MAYÚSCULAS",
    "definicion": {
      "titulo": "¿Qué es …?",
      "texto": "Definición clara 2-4 oraciones para el grado.",
      "emoji": "🔬"
    },
    "importancia": {
      "titulo": "¿Por qué son importantes …?",
      "items": ["Frase completa 1", "Frase 2", "Frase 3", "Frase 4", "Frase 5"]
    },
    "partes": {
      "titulo": "Partes principales / ideas clave",
      "items": [
        {"nombre": "Parte 1", "descripcion": "Función o explicación breve", "emoji": "🔹"},
        {"nombre": "Parte 2", "descripcion": "…", "emoji": "🔹"},
        {"nombre": "Parte 3", "descripcion": "…", "emoji": "🔹"}
      ]
    },
    "tipos": {
      "titulo": "Tipos / comparación",
      "columna_a": {"titulo": "Tipo A", "emoji": "🅰️", "items": ["característica 1", "2", "3"]},
      "columna_b": {"titulo": "Tipo B", "emoji": "🅱️", "items": ["característica 1", "2", "3"]},
      "nota": "Frase que une ambos tipos."
    },
    "proceso": {
      "titulo": "Proceso / niveles / secuencia",
      "pasos": [
        {"nombre": "Paso 1", "descripcion": "breve", "emoji": "1️⃣"},
        {"nombre": "Paso 2", "descripcion": "breve", "emoji": "2️⃣"},
        {"nombre": "Paso 3", "descripcion": "breve", "emoji": "3️⃣"},
        {"nombre": "Paso 4", "descripcion": "breve", "emoji": "4️⃣"}
      ]
    },
    "ejemplos": {
      "titulo": "Ejemplos",
      "items": [
        {"titulo": "Ejemplo 1", "descripcion": "1-2 oraciones", "emoji": "✨"},
        {"titulo": "Ejemplo 2", "descripcion": "…", "emoji": "✨"},
        {"titulo": "Ejemplo 3", "descripcion": "…", "emoji": "✨"}
      ]
    },
    "sabias_que": {
      "titulo": "¿Sabías que?",
      "texto": "Dato curioso verdadero y útil (2-3 oraciones).",
      "emoji": "💡"
    },
    "recuerda": "Una frase fuerte de cierre / síntesis del tema."
  },
  "practica": {
    "titulo": "FICHA DE APLICACIÓN: [TEMA]",
    "responder": {
      "preguntas": [
        "Pregunta abierta completa (mín. 12 palabras).",
        "Segunda pregunta abierta completa."
      ]
    },
    "completar": {
      "oraciones": [
        "Oración con un hueco ______________ sobre el tema.",
        "Otra oración con ______________.",
        "Tercera con ______________."
      ]
    },
    "verdadero_falso": {
      "items": [
        "Afirmación completa 1.",
        "Afirmación 2.",
        "Afirmación 3.",
        "Afirmación 4."
      ]
    },
    "marcar": {
      "items": [
        {
          "pregunta": "Pregunta de opción múltiple completa.",
          "opciones": ["Opción A", "Opción B", "Opción C", "Opción D"]
        },
        {
          "pregunta": "Segunda pregunta de opción múltiple.",
          "opciones": ["Opción A", "Opción B", "Opción C", "Opción D"]
        }
      ]
    },
    "relacionar": {
      "columna_a": ["Término 1", "Término 2", "Término 3", "Término 4"],
      "columna_b": ["Definición o función 1", "2", "3", "4"]
    },
    "ordenar": {
      "instruccion": "Ordena correctamente la secuencia del tema.",
      "elementos": ["elemento desordenado 1", "2", "3", "4", "5"]
    },
    "identifica": {
      "instruccion": "Identifica cada caso según lo aprendido.",
      "casos": [
        {"etiqueta_esperada": "A", "pista": "Descripción del caso A", "emoji": "🔵"},
        {"etiqueta_esperada": "B", "pista": "Descripción del caso B", "emoji": "🟢"}
      ]
    }
  },
  "pie_motivacional": "Frase motivadora corta sobre el tema."
}

Reglas:
- Español de Perú; grado ${grado || 'indicado'}; área ${area || '—'}.
- Contenido CORRECTO y escolar (no inventes datos científicos falsos).
- Todo el trabajo de la práctica se hace EN ESTA HOJA. Prohibido decir cuaderno/libreta/agenda.
- Rellena TODOS los bloques; no dejes arrays vacíos.
- Usa emojis representativos del concepto (no mascotas del colegio).
- Si el tema no tiene "tipos" naturales, usa contraste útil (ej. ventajas/desventajas, antes/después, natural/artificial).
- Si no hay "proceso" natural, usa niveles, pasos de aprendizaje o ciclo del tema.
${bloqueInstrucciones}
Datos:
- Título: ${titulo || 'Sin título'}
- Grado: ${grado || '—'}
- Área: ${area || '—'}
- Unidad: ${unidad || '—'}
- Puntos clave: ${puntosClave || '—'}

Texto de apoyo (puede estar vacío):
---
${(textoOrigen || '').slice(0, 12000)}
---`;
}

function buildPromptMatematica({ titulo, grado, area, unidad, puntosClave, textoOrigen, instruccionesDocente }) {
  const bloqueInstrucciones = instruccionesDocente
    ? `\nInstrucciones del docente:\n${instruccionesDocente.slice(0, 4000)}\n`
    : '';

  return `Eres especialista en didáctica de MATEMÁTICA para colegios en Perú (Vanguarcito). Genera SOLO JSON válido.

La HOJA 2 es ficha de MATEMÁTICA: mínimo 10 ejercicios numéricos en esta misma ficha (nunca cuaderno ni libreta).

Formato:
{
  "teoria": {
    "titulo_seccion": "Aprendemos: [tema matemático]",
    "parrafos": ["Mínimo 4 párrafos (4-6 oraciones cada uno) con conceptos, procedimientos y ejemplos numéricos del grado"],
    "glosario": [{"termino": "Suma", "definicion": "Definición clara para el grado"}],
    "recuerda": ["5 a 7 reglas o pasos en frases completas"],
    "ilustraciones": [{"titulo": "Nombre del concepto", "descripcion": "Qué debe observar el niño (2-3 oraciones)", "emoji": "🔢"}]
  },
  "aplicacion": {
    "titulo_seccion": "FICHA DE APLICACIÓN — MATEMÁTICA",
    "instruccion_general": "Resuelve en esta hoja. Escribe operaciones y procedimiento cuando corresponda.",
    "ejercicios": [
      {
        "tipo": "operacion",
        "numero": 1,
        "enunciado": "Calcula:",
        "operaciones": ["34 + 27 =", "58 - 19 =", "6 × 4 ="]
      },
      {
        "tipo": "problema",
        "numero": 5,
        "texto": "Problema narrado completo (mínimo 2 oraciones) relacionado con el tema; pide mostrar operación en el espacio de la ficha."
      },
      {
        "tipo": "completar",
        "numero": 8,
        "enunciado": "Completa:",
        "oracion": "El doble de 15 es ___."
      },
      {
        "tipo": "verdadero_falso",
        "numero": 10,
        "enunciado": "Completa V o F:",
        "items": [{"enunciado": "Afirmación matemática completa."}, {"enunciado": "Otra afirmación del tema."}]
      }
    ]
  },
  "pie_motivacional": "frase breve"
}

Reglas:
- Mínimo 10 ejercicios con campo "numero" del 1 al 10+; mezcla: operacion (varias líneas), problema (texto completo), completar, verdadero_falso.
- Operaciones acordes al grado ${grado || ''} y tema "${titulo}" (${area || ''}).
- Cada problema y pregunta: oración COMPLETA, nunca frases cortadas.
- PROHIBIDO: cuaderno, libreta, agenda, en casa, otra hoja.
- TEORÍA: mínimo 4 párrafos sustantivos; glosario 4-6 términos matemáticos; 2-3 ilustraciones con emoji (🔢➕📐); recuerda con frases completas.
- En "completar" usa solo guiones bajos ___ para el hueco (nunca HTML).
- En "verdadero_falso" el enunciado del ejercicio debe ser "Completa V o F:" y al menos 2 ítems en items.
${bloqueInstrucciones}
Título: ${titulo || '—'} | Grado: ${grado || '—'} | Área: ${area || '—'} | Unidad: ${unidad || '—'}
Puntos clave: ${puntosClave || '—'}
Texto PDF:
---
${(textoOrigen || '').slice(0, 12000)}
---`;
}

async function estructurarContenidoConGemini({
  titulo,
  grado,
  area,
  unidad,
  textoOrigen,
  puntosClave,
  instruccionesDocente,
  estiloFicha = 'general',
}) {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    const err = new Error('GOOGLE_AI_API_KEY no configurada');
    err.code = 'GEMINI_NO_CONFIG';
    throw err;
  }

  const prompt = esEstiloMatematica(estiloFicha)
    ? buildPromptMatematica({
        titulo,
        grado,
        area,
        unidad,
        puntosClave,
        textoOrigen,
        instruccionesDocente,
      })
    : buildPromptGeneral({
        titulo,
        grado,
        area,
        unidad,
        puntosClave,
        textoOrigen,
        instruccionesDocente,
      });

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
    contenido: normalizarContenido(parsed, { estiloFicha, titulo, grado }),
    tokens_entrada: usage.promptTokenCount || null,
    tokens_salida: usage.candidatesTokenCount || null,
    modelo: modeloUsado,
    proveedor: 'google',
  };
}

function normalizarContenido(raw, { estiloFicha = 'general', titulo, grado } = {}) {
  // Formato nuevo: GUÍA + PRÁCTICA tipadas (estilo general)
  if (raw?.guia && raw?.practica && !esEstiloMatematica(estiloFicha)) {
    let { guia, practica } = normalizarGuiaPractica(raw, { titulo });
    ({ guia, practica } = completarGuiaPracticaMinima({ guia, practica }, titulo));
    const legacy = guiaPracticaALegacy(
      { guia, practica },
      String(raw?.pie_motivacional || '').trim()
    );
    return {
      ...legacy,
      estilo_ficha: 'general',
    };
  }

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
    const ejerciciosRaw = raw.aplicacion.ejercicios;
    const esMath =
      esEstiloMatematica(estiloFicha) ||
      (Array.isArray(ejerciciosRaw) && ejerciciosRaw.length > 0);
    if (esMath) {
      const ejercicios = normalizarEjerciciosMatematica(ejerciciosRaw, { titulo, grado });
      aplicacion = {
        titulo_seccion: String(raw.aplicacion.titulo_seccion || 'FICHA DE APLICACIÓN — MATEMÁTICA').trim(),
        instruccion_general: sanitizarTextoFicha(
          raw.aplicacion.instruccion_general ||
            'Resuelve en esta hoja. Escribe las operaciones y el procedimiento cuando corresponda.'
        ),
        ejercicios,
      };
    } else {
      aplicacion = {
        titulo_seccion: String(raw.aplicacion.titulo_seccion || 'FICHA DE APLICACIÓN').trim(),
        instruccion_general: sanitizarTextoFicha(
          raw.aplicacion.instruccion_general ||
            raw.aplicacion.instruccion ||
            'Usa lo que leíste en la teoría y responde en esta hoja.'
        ),
        actividades: normalizarActividades(raw.aplicacion.actividades),
      };
    }
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

  const esMathContenido =
    esEstiloMatematica(estiloFicha) || Boolean(aplicacion.ejercicios?.length);
  if (esMathContenido) {
    if (!teoria.glosario?.length) {
      teoria.glosario = [
        { termino: 'Operación', definicion: 'Acción matemática como sumar, restar, multiplicar o dividir.' },
        { termino: 'Resultado', definicion: 'Respuesta obtenida al resolver correctamente.' },
      ];
    }
    if (!teoria.ilustraciones?.length) {
      teoria.ilustraciones = [
        { titulo: 'Números', descripcion: 'Usa cifras alineadas por columnas al calcular.', emoji: '🔢' },
      ];
    }
  }

  const intro = teoria.parrafos.join('\n\n');
  let actividades = [];
  let ejercicios_matematicos = [];
  if (aplicacion.ejercicios?.length) {
    ejercicios_matematicos = aplicacion.ejercicios;
  } else {
    aplicacion.actividades = normalizarActividades(aplicacion.actividades || []);
    actividades = aplicacion.actividades;
  }
  const pie_motivacional = String(raw?.pie_motivacional || '').trim();
  const estilo_ficha = aplicacion.ejercicios?.length ? 'matematica' : estiloFicha;

  const base = {
    teoria,
    aplicacion,
    intro,
    recuerda: teoria.recuerda,
    glosario: teoria.glosario || [],
    ilustraciones: teoria.ilustraciones || [],
    actividades,
    ejercicios_matematicos,
    estilo_ficha,
    pie_motivacional,
  };

  // Estilo general: siempre materializar guía+práctica tipadas para la plantilla nueva
  if (estilo_ficha === 'general' && !base.guia) {
    const { legacyAGuiaPractica } = require('./normalizarGuiaPractica');
    return { ...legacyAGuiaPractica(base, titulo), estilo_ficha: 'general' };
  }

  return base;
}

function pareceInstruccionesDiseno(lineas) {
  if (!lineas.length) return false;
  const patron =
    /pasteles?|tipograf|letra\s+que|im[aá]gen(es)?\s+real|colores?\s|diseño|maquet|formato\s+visual|realistas?/i;
  const hits = lineas.filter((l) => patron.test(l)).length;
  return hits >= Math.max(1, Math.ceil(lineas.length * 0.5));
}

function contenidoDesdeFormularioMatematica({ titulo, puntosClave, textoOrigen, area, grado }) {
  const bullets = String(puntosClave || '')
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const tema = titulo || area || 'operaciones numéricas';

  const parrafos = textoOrigen
    ? [String(textoOrigen).replace(/\s+/g, ' ').trim().slice(0, 900)]
    : [
        `En esta unidad trabajamos ${tema}. Repasamos conceptos y procedimientos de ${area || 'matemática'} acordes al grado.`,
        `Observa los ejemplos, practica con calma y escribe tus operaciones en la ficha de aplicación.`,
      ];

  const teoria = {
    titulo_seccion: `Aprendemos: ${tema}`,
    parrafos:
      parrafos.length >= 2
        ? parrafos
        : [
            ...parrafos,
            `Para resolver problemas de ${tema} identificamos los datos, elegimos la operación y comprobamos el resultado.`,
            `En el valor posicional cada cifra tiene un lugar: unidades, decenas, centenas y así sucesivamente.`,
          ],
    recuerda: bullets.length
      ? bullets.slice(0, 7)
      : ['Lee cada enunciado', 'Escribe la operación', 'Revisa tu resultado'],
    glosario: [
      { termino: 'Suma', definicion: 'Juntar cantidades para obtener un total.' },
      { termino: 'Resta', definicion: 'Hallar la diferencia entre dos cantidades.' },
      { termino: 'Valor posicional', definicion: 'El valor de cada dígito según su columna.' },
      { termino: 'Estimación', definicion: 'Aproximar un resultado antes de calcular exacto.' },
    ],
    ilustraciones: [
      { titulo: 'Operaciones', descripcion: `Practica sumas y restas de ${tema} en la ficha.`, emoji: '➕' },
      { titulo: 'Problemas', descripcion: 'Lee el enunciado, escribe los datos y la operación.', emoji: '📝' },
      { titulo: 'Comprobar', descripcion: 'Verifica tu respuesta con la operación inversa.', emoji: '✅' },
    ],
  };

  const ejercicios = normalizarEjerciciosMatematica([], { titulo: tema, grado });
  const aplicacion = {
    titulo_seccion: 'FICHA DE APLICACIÓN — MATEMÁTICA',
    instruccion_general: 'Resuelve todos los ejercicios en esta hoja. Muestra el procedimiento cuando lo pida el enunciado.',
    ejercicios,
  };

  return {
    teoria,
    aplicacion,
    intro: parrafos.join('\n\n'),
    recuerda: teoria.recuerda,
    glosario: [],
    ilustraciones: teoria.ilustraciones,
    actividades: [],
    ejercicios_matematicos: ejercicios,
    estilo_ficha: 'matematica',
    pie_motivacional: '¡La práctica hace al maestro de los números!',
  };
}

/** Contenido sin Vanguarcito: GUÍA + PRÁCTICA tipadas mínimas. */
function contenidoDesdeFormulario({ titulo, puntosClave, textoOrigen, area, estiloFicha }) {
  if (esEstiloMatematica(estiloFicha)) {
    return contenidoDesdeFormularioMatematica({ titulo, puntosClave, textoOrigen, area });
  }
  const bullets = String(puntosClave || '')
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const esDiseno = pareceInstruccionesDiseno(bullets);
  const tema = titulo || area || 'el tema de la unidad';
  const textoPdf = String(textoOrigen || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 700);

  const itemsImportancia = esDiseno
    ? [
        `Permite comprender mejor ${tema}.`,
        'Ayuda a participar con más seguridad en clase.',
        'Sirve para relacionar lo aprendido con el entorno.',
        'Prepara para temas más avanzados.',
      ]
    : bullets.length
      ? bullets.slice(0, 5)
      : [
          `Permite comprender mejor ${tema}.`,
          'Ayuda a explicar situaciones de la vida diaria.',
          'Sirve de base para nuevos aprendizajes.',
          'Fomenta la curiosidad y el pensamiento.',
        ];

  let { guia, practica } = normalizarGuiaPractica(
    {
      guia: {
        titulo: String(tema).toUpperCase(),
        definicion: {
          titulo: `¿Qué es ${tema}?`,
          texto:
            textoPdf ||
            `${tema} es un tema importante de ${area || 'tu curso'}. Léelo con atención y observa los ejemplos.`,
          emoji: '📘',
        },
        importancia: { titulo: `¿Por qué es importante ${tema}?`, items: itemsImportancia },
        partes: {
          titulo: 'Ideas principales',
          items: (esDiseno ? itemsImportancia : bullets).slice(0, 4).map((b, i) => ({
            nombre: `Idea ${i + 1}`,
            descripcion: b,
            emoji: '🔹',
          })),
        },
        tipos: {
          titulo: 'Comparación útil',
          columna_a: { titulo: 'Debo recordar', emoji: '✅', items: itemsImportancia.slice(0, 3) },
          columna_b: {
            titulo: 'Debo evitar',
            emoji: '⚠️',
            items: ['Memorizar sin entender', 'Copiar sin leer', 'Dejar dudas sin preguntar'],
          },
          nota: `Estudiar ${tema} con comprensión da mejores resultados.`,
        },
        proceso: {
          titulo: 'Pasos para aprender',
          pasos: [
            { nombre: 'Leer', descripcion: 'Lee la guía', emoji: '📖' },
            { nombre: 'Observar', descripcion: 'Mira ejemplos', emoji: '👀' },
            { nombre: 'Practicar', descripcion: 'Haz la ficha', emoji: '✏️' },
            { nombre: 'Repasar', descripcion: 'Revisa el recuerda', emoji: '✅' },
          ],
        },
        ejemplos: {
          titulo: 'Ejemplos',
          items: [
            { titulo: 'En el aula', descripcion: `Un ejemplo escolar de ${tema}.`, emoji: '🏫' },
            { titulo: 'En casa', descripcion: `Un ejemplo cotidiano de ${tema}.`, emoji: '🏠' },
            { titulo: 'En la comunidad', descripcion: `Un ejemplo del entorno sobre ${tema}.`, emoji: '🌍' },
          ],
        },
        sabias_que: {
          titulo: '¿Sabías que?',
          texto: `Cuanto más practicas ${tema}, más fácil te resulta explicarlo con tus palabras.`,
          emoji: '💡',
        },
        recuerda: `${tema} se comprende mejor con ejemplos y práctica. ¡Tú puedes!`,
      },
      practica: {
        titulo: `FICHA DE APLICACIÓN: ${tema}`,
        responder: {
          preguntas: [
            `¿Qué es ${tema}? Explícalo con tus palabras.`,
            `¿Por qué es importante aprender sobre ${tema}?`,
          ],
        },
        completar: {
          oraciones: [
            `La idea principal de ${tema} es ______________.`,
            `Un ejemplo de ${tema} es ______________.`,
            `${tema} nos ayuda a ______________.`,
          ],
        },
        verdadero_falso: {
          items: [
            `${tema} no tiene relación con la vida diaria.`,
            `Es importante estudiar ${tema} con atención.`,
            `Los ejemplos ayudan a comprender ${tema}.`,
            `No hace falta practicar para aprender ${tema}.`,
          ],
        },
        marcar: {
          items: [
            {
              pregunta: `¿Qué afirmación sobre ${tema} es correcta?`,
              opciones: [
                'Es un tema importante del curso',
                'No sirve para nada',
                'Solo existe en libros antiguos',
                'No se puede explicar',
              ],
            },
          ],
        },
        relacionar: {
          columna_a: ['Concepto', 'Ejemplo', 'Importancia', 'Práctica'],
          columna_b: [
            `Idea central de ${tema}`,
            'Caso de la vida diaria',
            'Por qué lo estudiamos',
            'Actividades de esta ficha',
          ],
        },
        ordenar: {
          instruccion: 'Ordena los pasos para estudiar el tema.',
          elementos: ['Leer la guía', 'Observar ejemplos', 'Responder la práctica', 'Repasar el recuerda'],
        },
        identifica: {
          instruccion: 'Identifica cada caso.',
          casos: [
            { etiqueta_esperada: 'A', pista: `Caso correcto sobre ${tema}`, emoji: '🔵' },
            { etiqueta_esperada: 'B', pista: `Caso distinto o incorrecto sobre ${tema}`, emoji: '🟢' },
          ],
        },
      },
      pie_motivacional: '¡Muy bien! Seguir practicando te ayuda a comprender mejor.',
    },
    { titulo: tema }
  );
  ({ guia, practica } = completarGuiaPracticaMinima({ guia, practica }, tema));
  return {
    ...guiaPracticaALegacy({ guia, practica }, '¡Muy bien! Seguir practicando te ayuda a comprender mejor.'),
    estilo_ficha: 'general',
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
