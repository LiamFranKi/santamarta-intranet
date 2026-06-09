/**
 * Layout fijo de intento: orden de preguntas y alternativas.
 */

export function shuffleArray(source) {
  const a = [...source];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function ordenarPreguntasSegunIds(todas, idsOrden) {
  const map = new Map(todas.map((p) => [Number(p.id), p]));
  const ordered = [];
  for (const id of idsOrden || []) {
    const p = map.get(Number(id));
    if (p) ordered.push(p);
  }
  return ordered;
}

export function ordenPreguntasEsAleatorio(val) {
  return String(val ?? '').trim().toUpperCase() === 'ALEATORIO';
}

/** Reordena alternativas según IDs guardados en layout. */
export function aplicarOrdenAlternativas(pregunta, altIds) {
  if (!pregunta) return pregunta;
  const alts = pregunta.alternativas || [];
  if (!Array.isArray(altIds) || altIds.length === 0) return pregunta;

  const map = new Map(alts.map((a) => [Number(a.id), a]));
  const ordered = [];
  const used = new Set();
  for (const id of altIds) {
    const a = map.get(Number(id));
    if (a) {
      ordered.push(a);
      used.add(Number(a.id));
    }
  }
  for (const a of alts) {
    if (!used.has(Number(a.id))) ordered.push(a);
  }
  return { ...pregunta, alternativas: ordered };
}

/** Aplica layout completo (preguntas + alternativas) sobre el catálogo base. */
export function aplicarLayoutAPreguntas(listaBase, layout) {
  if (!layout || !Array.isArray(layout.pregunta_ids) || layout.pregunta_ids.length === 0) {
    return null;
  }
  const ordenadas = ordenarPreguntasSegunIds(listaBase, layout.pregunta_ids);
  if (ordenadas.length === 0) return null;

  const altMap = layout.alternativas_ids || {};
  return ordenadas.map((p) => {
    const key = String(p.id);
    const ids =
      altMap[key] ||
      altMap[p.id] ||
      (Array.isArray(altMap) ? null : null);
    if (ids && Array.isArray(ids) && ids.length > 0) {
      return aplicarOrdenAlternativas(p, ids);
    }
    return p;
  });
}

/** Construye layout desde preguntas ya ordenadas (tras barajar o no). */
export function construirLayoutDesdePreguntas(preguntasOrdenadas) {
  const pregunta_ids = (preguntasOrdenadas || []).map((p) => Number(p.id));
  const alternativas_ids = {};
  for (const p of preguntasOrdenadas || []) {
    const ids = (p.alternativas || []).map((a) => Number(a.id)).filter((n) => Number.isFinite(n));
    if (ids.length > 0) alternativas_ids[String(p.id)] = ids;
  }
  return { v: 1, pregunta_ids, alternativas_ids };
}

/**
 * Prepara preguntas para un intento nuevo o reanudado.
 * @returns {{ preguntas, layout, esReanudacion }}
 */
export function resolverPreguntasParaIntento({
  listaBase,
  examenMeta,
  layoutServidor,
  preguntaIdsLegacy
}) {
  const esAleatorio = ordenPreguntasEsAleatorio(examenMeta?.orden_preguntas);
  const maxPreguntas = parseInt(examenMeta?.preguntas_max, 10);

  const layout =
    layoutServidor && layoutServidor.pregunta_ids?.length
      ? layoutServidor
      : preguntaIdsLegacy?.length
        ? { v: 1, pregunta_ids: preguntaIdsLegacy, alternativas_ids: {} }
        : null;

  if (layout) {
    let preguntas = aplicarLayoutAPreguntas(listaBase, layout);
    if (!preguntas || preguntas.length === 0) {
      preguntas = esAleatorio ? shuffleArray(listaBase) : [...listaBase];
      if (maxPreguntas > 0 && preguntas.length > maxPreguntas) {
        preguntas = preguntas.slice(0, maxPreguntas);
      }
      if (esAleatorio) {
        preguntas = preguntas.map((p) => ({
          ...p,
          alternativas: p.alternativas ? shuffleArray(p.alternativas) : []
        }));
      }
      return {
        preguntas,
        layout: construirLayoutDesdePreguntas(preguntas),
        esReanudacion: false
      };
    }
    return { preguntas, layout, esReanudacion: true };
  }

  let preguntas = esAleatorio ? shuffleArray(listaBase) : [...listaBase];
  if (maxPreguntas > 0 && preguntas.length > maxPreguntas) {
    preguntas = preguntas.slice(0, maxPreguntas);
  }
  if (esAleatorio) {
    preguntas = preguntas.map((p) => ({
      ...p,
      alternativas: p.alternativas ? shuffleArray(p.alternativas) : []
    }));
  }
  return {
    preguntas,
    layout: construirLayoutDesdePreguntas(preguntas),
    esReanudacion: false
  };
}
