/** DUA de la sesión (todo el aula). Independiente de las claves JSON del PIAR. */

export const DUA_OPCIONES = {
  representacion: [
    { key: 'visual', label: 'Imagen, objeto o demostración' },
    { key: 'oral_paso', label: 'Explicación oral paso a paso' },
    { key: 'modelo', label: 'Modelo o ejemplo primero' },
  ],
  participacion: [
    { key: 'bloques', label: 'Actividad por bloques cortos' },
    { key: 'eleccion', label: 'El niño elige cómo participar' },
    { key: 'pares', label: 'Trabajo con un compañero' },
  ],
  evidencias: [
    { key: 'decir', label: 'Puede decirlo (no solo escribir)' },
    { key: 'dibujo', label: 'Dibujo, foto o audio como evidencia' },
    { key: 'tiempo', label: 'Más tiempo si lo necesita' },
  ],
};

export const DUA_CAT_LABEL = {
  representacion: 'Cómo se presenta (todo el grupo)',
  participacion: 'Cómo participan',
  evidencias: 'Cómo se evidencia',
};

export function leerProcedimientos(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const p of arr.slice(0, 8)) {
    if (!p || typeof p !== 'object') continue;
    const piarId = parseInt(p.piar_id, 10) || 0;
    const alumnoId = parseInt(p.alumno_id, 10) || 0;
    if (!piarId && !alumnoId) continue;
    const k = `${piarId}:${alumnoId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const texto = String(p.texto || '').trim().slice(0, 1200);
    if (!texto) continue;
    out.push({
      piar_id: piarId,
      alumno_id: alumnoId,
      nombre: String(p.nombre || '').trim().slice(0, 120),
      texto,
    });
  }
  return out;
}

export function fusionarProcedimientos(actuales, deIa) {
  const by = new Map();
  const key = (p) => `${Number(p?.piar_id) || 0}:${Number(p?.alumno_id) || 0}`;
  leerProcedimientos(actuales).forEach((p) => by.set(key(p), p));
  leerProcedimientos(deIa).forEach((p) => {
    const k = key(p);
    if (!by.has(k)) by.set(k, p);
  });
  return [...by.values()];
}

export function emptyDua() {
  return { representacion: [], participacion: [], evidencias: [], nota: '', procedimientos: [] };
}

export function leerDua(raw) {
  let v = raw;
  if (v == null || v === '') return emptyDua();
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return emptyDua();
    }
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return emptyDua();
  const out = emptyDua();
  Object.keys(DUA_OPCIONES).forEach((cat) => {
    const allowed = new Set(DUA_OPCIONES[cat].map((x) => x.key));
    out[cat] = (Array.isArray(v[cat]) ? v[cat] : []).map(String).filter((k) => allowed.has(k));
  });
  out.nota = String(v.nota || '').trim().slice(0, 800);
  out.procedimientos = leerProcedimientos(v.procedimientos);
  return out;
}

export function duaTieneAlgo(dua) {
  const d = leerDua(dua);
  return (
    d.representacion.length + d.participacion.length + d.evidencias.length > 0 ||
    Boolean(d.nota) ||
    d.procedimientos.length > 0
  );
}
