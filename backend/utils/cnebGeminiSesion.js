const axios = require('axios');
const { geminiDisponible, modelosAProbar } = require('../services/fichasIa/geminiFichaService');
const { partirMinutos } = require('./cnebSesionBorrador');
const { PROMPT_SESION_DEFAULT, aplicarPlantilla } = require('../data/cnebPromptSesionDefault');

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
      maxOutputTokens: 4096,
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
    proposito: String(parsed?.proposito || '').trim(),
    minutos,
    momentos: {
      inicio: String(mom.inicio || '').trim(),
      desarrollo: String(mom.desarrollo || '').trim(),
      cierre: String(mom.cierre || '').trim(),
    },
    cotejo,
  };
}

async function generarSesionConIa({ plantilla, vars, duracionMin }) {
  if (!geminiDisponible()) {
    const e = new Error('Gemini no está configurado en el servidor.');
    e.code = 'GEMINI_NO_KEY';
    throw e;
  }
  const prompt = aplicarPlantilla(plantilla || PROMPT_SESION_DEFAULT, vars);
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
