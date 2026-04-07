/**
 * Vista previa de plantillas de cumpleaños (admin): mismas sustituciones y lógica de push que el servidor.
 */

const MESES_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

/** Datos ficticios para previsualizar variables */
export const MUESTRA_CUMPLEANOS = {
  /** Un solo cumpleañero (modal, correo, mensaje sistema) */
  nombreUno: 'Pérez García, Ana María',
  /** Varios nombres como en el push real */
  nombreListaPush: 'Pérez García, Ana María; López Díaz, Carlos',
  colegio: 'Colegio Vanguard Schools',
};

export function mesActualNombre() {
  return MESES_ES[new Date().getMonth()];
}

export function sustituirVariablesPlantilla(texto, { nombre, colegio, mes }) {
  return String(texto ?? '')
    .replace(/\{nombre\}/gi, nombre)
    .replace(/\{colegio\}/gi, colegio)
    .replace(/\{mes\}/gi, mes || '');
}

const DEFAULT_PLANTILLA_PUSH = '¡Feliz cumpleaños, {nombre}! Te desea un gran día {colegio}.';
const TITULO_PUSH_FALLBACK = '🎂 Cumpleaños';

function truncarTexto(s, max) {
  if (!s || s.length <= max) return s || '';
  return s.slice(0, max - 3) + '...';
}

/**
 * Igual que construirTituloYBody en backend cumpleanosPushService.js
 */
export function previewPushTituloCuerpo(plantilla) {
  let t = String(plantilla ?? '').trim();
  if (!t) t = DEFAULT_PLANTILLA_PUSH;

  const sustituido = sustituirVariablesPlantilla(t, {
    nombre: MUESTRA_CUMPLEANOS.nombreListaPush,
    colegio: MUESTRA_CUMPLEANOS.colegio,
    mes: mesActualNombre(),
  });

  const text = sustituido.trim();
  if (!text) {
    return { titulo: TITULO_PUSH_FALLBACK, cuerpo: 'Hay cumpleaños hoy.' };
  }
  const idx = text.indexOf('\n');
  if (idx === -1) {
    return {
      titulo: truncarTexto(TITULO_PUSH_FALLBACK, 80),
      cuerpo: truncarTexto(text, 450),
    };
  }
  let titulo = text.slice(0, idx).trim() || TITULO_PUSH_FALLBACK;
  let cuerpo = text.slice(idx + 1).trim();
  if (!cuerpo) cuerpo = titulo;
  return {
    titulo: truncarTexto(titulo, 100),
    cuerpo: truncarTexto(cuerpo, 450),
  };
}

export function previewHtmlPlantilla(html) {
  return sustituirVariablesPlantilla(html ?? '', {
    nombre: MUESTRA_CUMPLEANOS.nombreUno,
    colegio: MUESTRA_CUMPLEANOS.colegio,
    mes: mesActualNombre(),
  });
}

export function previewTextoAsunto(asunto) {
  return sustituirVariablesPlantilla(asunto ?? '', {
    nombre: MUESTRA_CUMPLEANOS.nombreUno,
    colegio: MUESTRA_CUMPLEANOS.colegio,
    mes: mesActualNombre(),
  });
}
