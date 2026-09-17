const axios = require('axios');
const { geminiDisponible, modelosAProbar } = require('../services/fichasIa/geminiFichaService');
const { partirMinutos } = require('./cnebSesionBorrador');
const { PROMPT_SESION_DEFAULT, aplicarPlantilla } = require('../data/cnebPromptSesionDefault');
const { textoCnebAHtml } = require('./cnebTextoRico');

function extraerJson(text) {
  const cleaned = String(text || '')
    .replace(/^```json\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  return JSON.parse(cleaned);
}

async function llamarGeminiJson(prompt) {
  const apiKey = String(process.env.GOOGLE_AI_API_KEY || '').trim();
  if (!apiKey) {
    const e = new Error('No hay clave de Gemini configurada (GOOGLE_AI_API_KEY).');
    e.code = 'GEMINI_NO_KEY';
    throw e;
  }
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
    },
  };
  let ultimo;
  for (const modelo of modelosAProbar()) {
    for (const ver of ['v1beta', 'v1']) {
      const url = `https://generativelanguage.googleapis.com/${ver}/models/${modelo}:generateContent?key=${encodeURIComponent(apiKey)}`;
      try {
        const res = await axios.post(url, body, {
          timeout: 90000,
          headers: { 'Content-Type': 'application/json' },
        });
        const text = res.data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
        const parsed = extraerJson(text);
        const usage = res.data?.usageMetadata || {};
        return {
          parsed,
          modelo,
          raw: text,
          tokens_entrada: usage.promptTokenCount || null,
          tokens_salida: usage.candidatesTokenCount || null,
        };
      } catch (err) {
        ultimo = err;
        if (err.response?.status && err.response.status !== 404) {
          const msg = err.response?.data?.error?.message || err.message;
          const e = new Error(`Gemini (${err.response.status}) en ${modelo}: ${msg}`);
          e.code = 'GEMINI_ERROR';
          throw e;
        }
      }
    }
  }
  const e = new Error(ultimo?.message || 'Ningún modelo Gemini respondió.');
  e.code = 'GEMINI_ALL_MODELS_FAILED';
  throw e;
}

function normalizarSalida(parsed, duracionMin) {
  const duracion = Math.min(180, Math.max(20, parseInt(duracionMin, 10) || 60));
  const def = partirMinutos(duracion);
  const minutosIn = parsed?.minutos || {};
  const minutos = {
    inicio: parseInt(minutosIn.inicio, 10) || def.inicio,
    desarrollo: parseInt(minutosIn.desarrollo, 10) || def.desarrollo,
    cierre: parseInt(minutosIn.cierre, 10) || def.cierre,
  };
  let suma = minutos.inicio + minutos.desarrollo + minutos.cierre;
  if (suma !== duracion) {
    Object.assign(minutos, def);
    suma = duracion;
  }
  const mom = parsed?.momentos || {};
  const cotejo = Array.isArray(parsed?.cotejo)
    ? parsed.cotejo.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  return {
    titulo: String(parsed?.titulo || '').trim(),
    proposito: String(parsed?.proposito || '').trim(),
    minutos,
    momentos: {
      inicio: textoCnebAHtml(mom.inicio),
      desarrollo: textoCnebAHtml(mom.desarrollo),
      cierre: textoCnebAHtml(mom.cierre),
    },
    cotejo,
    ficha: textoCnebAHtml(parsed?.ficha),
  };
}

async function generarSesionConIa({ plantilla, vars, duracionMin }) {
  if (!geminiDisponible()) {
    const e = new Error('Gemini no está configurado en el servidor.');
    e.code = 'GEMINI_NO_KEY';
    throw e;
  }
  let plantillaUso = String(plantilla || PROMPT_SESION_DEFAULT);
  if (!/ficha/i.test(plantillaUso)) {
    plantillaUso +=
      '\nIncluye en el JSON el campo "ficha": texto listo para imprimir (nombre, fecha y 3 a 6 consignas del estudiante).';
  }
  if (!/"titulo"/i.test(plantillaUso)) {
    plantillaUso +=
      '\nSi el tema ({{titulo}}) viene vacío, propone un "titulo" concreto dentro de la competencia.';
  }
  if (!/<p|<strong|html/i.test(plantillaUso)) {
    plantillaUso +=
      '\nEn momentos.inicio, momentos.desarrollo, momentos.cierre y ficha usa HTML simple: <p>, <strong>, <ol><li>, <ul><li>. Destaca en negrita cada momento (Motivación, Saberes previos, Problematización, Propósito, Actividades, Materiales, Evidencia, Metacognición). En la ficha incluye título, nombre, fecha y consignas numeradas.';
  }
  const prompt = aplicarPlantilla(plantillaUso, vars);
  const { parsed, modelo, raw, tokens_entrada, tokens_salida } = await llamarGeminiJson(prompt);
  return {
    borrador: normalizarSalida(parsed, duracionMin),
    modelo,
    prompt,
    raw,
    tokens_entrada,
    tokens_salida,
  };
}

module.exports = {
  geminiDisponible,
  generarSesionConIa,
  PROMPT_SESION_DEFAULT,
};
