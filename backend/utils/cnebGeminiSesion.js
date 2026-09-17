const axios = require('axios');
const { geminiDisponible, modelosAProbar } = require('../services/fichasIa/geminiFichaService');
const { partirMinutos } = require('./cnebSesionBorrador');
const { PROMPT_SESION_DEFAULT, aplicarPlantilla } = require('../data/cnebPromptSesionDefault');
const { textoCnebAHtml } = require('./cnebTextoRico');

function extraerJson(text) {
  const cleaned = String(text || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('La IA no devolvió JSON válido.');
  }
}

function sePuedeReintentar(err) {
  const status = err.response?.status;
  const msg = String(err.response?.data?.error?.message || err.message || '');
  if (!status || status === 404 || status === 400) return true;
  if (/JSON mode is not enabled/i.test(msg)) return true;
  if (/not found|not supported/i.test(msg)) return true;
  return false;
}

async function llamarGeminiJson(prompt) {
  const apiKey = String(process.env.GOOGLE_AI_API_KEY || '').trim();
  if (!apiKey) {
    const e = new Error('No hay clave de Gemini configurada (GOOGLE_AI_API_KEY).');
    e.code = 'GEMINI_NO_KEY';
    throw e;
  }
  const genBase = { temperature: 0.4, maxOutputTokens: 8192 };
  const intentos = [
    { ver: 'v1beta', json: true },
    { ver: 'v1beta', json: false },
    { ver: 'v1', json: false },
  ];
  let ultimo;
  for (const modelo of modelosAProbar()) {
    for (const intento of intentos) {
      const url = `https://generativelanguage.googleapis.com/${intento.ver}/models/${modelo}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const generationConfig = intento.json
        ? { ...genBase, responseMimeType: 'application/json' }
        : genBase;
      try {
        const res = await axios.post(
          url,
          { contents: [{ parts: [{ text: prompt }] }], generationConfig },
          { timeout: 90000, headers: { 'Content-Type': 'application/json' } }
        );
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
        if (err.response?.status === 429) {
          const e = new Error(`Gemini llegó al límite de uso (429). Espere un minuto e intente de nuevo.`);
          e.code = 'GEMINI_RATE_LIMIT';
          throw e;
        }
        if (err.response?.status === 403) {
          const e = new Error(
            err.response?.data?.error?.message ||
              'Gemini rechazó la clave (403). Revise GOOGLE_AI_API_KEY.'
          );
          e.code = 'GEMINI_FORBIDDEN';
          throw e;
        }
        if (!sePuedeReintentar(err)) {
          const msg = err.response?.data?.error?.message || err.message;
          const e = new Error(`Gemini (${err.response?.status || '?'}) en ${modelo}: ${msg}`);
          e.code = 'GEMINI_ERROR';
          throw e;
        }
      }
    }
  }
  const detalle = ultimo?.response?.data?.error?.message || ultimo?.message || 'Ningún modelo Gemini respondió.';
  const e = new Error(`No se pudo generar con IA: ${detalle}`);
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
