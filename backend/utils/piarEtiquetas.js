const PIAR_CHECKS = {
  metodologia: [
    { key: 'material_visual', label: 'Material visual' },
    { key: 'instrucciones_paso', label: 'Instrucciones paso a paso' },
    { key: 'bloques_cortos', label: 'Trabajo por bloques cortos' },
    { key: 'proyectos', label: 'Aprendizaje basado en proyectos' },
  ],
  tiempo: [
    { key: 'tiempo_extendido', label: 'Más tiempo en la actividad' },
    { key: 'pausas_activas', label: 'Pausas activas' },
  ],
  evaluacion: [
    { key: 'oral', label: 'Evidencia oral' },
    { key: 'imagenes_om', label: 'Imágenes / opción múltiple' },
    { key: 'menos_preguntas', label: 'Menos consignas a la vez' },
    { key: 'tecnologia', label: 'Audio o video' },
  ],
  ambiente: [
    { key: 'ubicacion_preferente', label: 'Ubicación preferencial' },
    { key: 'menos_distractores', label: 'Menos distractores' },
    { key: 'rutinas', label: 'Rutinas claras' },
  ],
};

const PIAR_CAT_LABEL = {
  metodologia: 'Cómo se enseña',
  tiempo: 'Tiempos y ritmos',
  evaluacion: 'Cómo se evidencia',
  ambiente: 'El aula',
};

const PIAR_KPI_LABEL = {
  participacion: 'Participación',
  comprension: 'Comprensión',
  autonomia: 'Autonomía',
};

const PIAR_ESCALA_LABEL = {
  en_proceso: 'En proceso',
  satisfactorio: 'Satisfactorio',
  requiere_refuerzo: 'Requiere refuerzo',
};

const PIAR_ESTADO_LABEL = {
  BORRADOR: 'Borrador',
  ACTIVO: 'Publicado',
  ARCHIVADO: 'Archivado',
};

const CHECK_FLAT = Object.values(PIAR_CHECKS).flat();

function etiquetaApoyo(key) {
  return CHECK_FLAT.find((x) => x.key === key)?.label || String(key || '').replace(/_/g, ' ');
}

function parseJsonPiar(v, fb) {
  if (v == null) return fb;
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(String(v));
  } catch {
    return fb;
  }
}

function apoyosComoLista(ajustes) {
  const adj = parseJsonPiar(ajustes, {}) || {};
  const out = [];
  Object.keys(PIAR_CHECKS).forEach((cat) => {
    const keys = Array.isArray(adj[cat]) ? adj[cat] : [];
    keys.forEach((k) =>
      out.push({ cat, catLabel: PIAR_CAT_LABEL[cat] || cat, key: k, label: etiquetaApoyo(k) })
    );
  });
  return out;
}

module.exports = {
  PIAR_CHECKS,
  PIAR_CAT_LABEL,
  PIAR_KPI_LABEL,
  PIAR_ESCALA_LABEL,
  PIAR_ESTADO_LABEL,
  etiquetaApoyo,
  parseJsonPiar,
  apoyosComoLista,
};
