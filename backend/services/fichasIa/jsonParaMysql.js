/**
 * Serializa objetos para columna JSON de MySQL (utf8mb4).
 * MySQL rechaza bytes nulos, controles y UTF-8 inválido (surrogates sueltos).
 */

function limpiarTextoJson(s) {
  if (typeof s !== 'string') return s;
  let t = s.replace(/\u0000/g, '');
  t = t.replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, ' ');
  if (t.length > 65000) t = t.slice(0, 65000);
  return Buffer.from(t, 'utf8').toString('utf8');
}

function sanitizarValorJsonMysql(val, depth = 0) {
  if (depth > 80) return null;
  if (val == null) return null;
  if (typeof val === 'string') return limpiarTextoJson(val);
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  if (typeof val === 'boolean') return val;
  if (Array.isArray(val)) return val.map((v) => sanitizarValorJsonMysql(v, depth + 1));
  if (typeof val === 'object') {
    const o = {};
    for (const [k, v] of Object.entries(val)) {
      if (v === undefined) continue;
      o[k] = sanitizarValorJsonMysql(v, depth + 1);
    }
    return o;
  }
  return null;
}

function jsonParaMysql(val) {
  try {
    return JSON.stringify(sanitizarValorJsonMysql(val));
  } catch {
    return '{}';
  }
}

function tipoSeccionDesdeActividad(act) {
  const t = String(act?.tipo || '').toLowerCase();
  if (t === 'tabla_partes') return 'ACTIVIDAD_TABLA';
  if (t === 'unir' || t === 'relacionar') return 'ACTIVIDAD_UNIR';
  return 'ACTIVIDAD_PREGUNTAS';
}

function normalizarRecuerdaItems(recuerda) {
  if (Array.isArray(recuerda)) {
    return recuerda.map((x) => String(x ?? '').trim()).filter(Boolean);
  }
  if (recuerda && typeof recuerda === 'object' && Array.isArray(recuerda.items)) {
    return recuerda.items.map((x) => String(x ?? '').trim()).filter(Boolean);
  }
  return [];
}

module.exports = {
  jsonParaMysql,
  tipoSeccionDesdeActividad,
  normalizarRecuerdaItems,
};
