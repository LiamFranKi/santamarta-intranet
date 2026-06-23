function apiBaseUrl() {
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL.replace(/\/api\/?$/, '');
  }
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

export function getLogoColegioUrl() {
  const base = apiBaseUrl();
  return base ? `${base}/assets/logos/logo.png` : '';
}

function loadImageAsDataUrl(url) {
  if (!url || typeof url !== 'string') return Promise.resolve(null);
  return fetch(url, { mode: 'cors' })
    .then((r) => (r.ok ? r.blob() : null))
    .then(
      (blob) =>
        blob
          ? new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            })
          : null
    )
    .catch(() => null);
}

function loadImageDimensions(dataUrl) {
  return new Promise((resolve) => {
    if (!dataUrl || typeof Image === 'undefined') {
      resolve({ w: 3, h: 1 });
      return;
    }
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 3, h: img.naturalHeight || 1 });
    img.onerror = () => resolve({ w: 3, h: 1 });
    img.src = dataUrl;
  });
}

export async function obtenerLogoColegioDataUrl() {
  return loadImageAsDataUrl(getLogoColegioUrl());
}

/** Logo con dimensiones naturales para mantener proporción (más ancho, no estirado). */
export async function obtenerLogoColegioParaPdf() {
  const dataUrl = await obtenerLogoColegioDataUrl();
  if (!dataUrl) return { dataUrl: null, dims: null };
  const dims = await loadImageDimensions(dataUrl);
  return { dataUrl, dims };
}

/**
 * Dibuja el logo del colegio en la esquina superior izquierda respetando proporción.
 * @param {import('jspdf').jsPDF} doc
 * @param {string|{ dataUrl?: string, dims?: { w: number, h: number } }} logoPack
 * @param {{ margin?: number, maxWidth?: number, maxHeight?: number }} [opts]
 * @returns {number} altura ocupada bajo el logo (para ajustar y)
 */
export function dibujarLogoEsquina(doc, logoPack, opts = {}) {
  const dataUrl = typeof logoPack === 'string' ? logoPack : logoPack?.dataUrl;
  if (!dataUrl) return 0;

  const margin = opts.margin ?? 12;
  const maxWidth = opts.maxWidth ?? 42;
  const maxHeight = opts.maxHeight ?? 13;
  const dims = typeof logoPack === 'object' ? logoPack?.dims : null;

  let drawW = maxWidth;
  let drawH = maxHeight;
  if (dims?.w > 0 && dims?.h > 0) {
    const aspect = dims.w / dims.h;
    drawW = maxWidth;
    drawH = drawW / aspect;
    if (drawH > maxHeight) {
      drawH = maxHeight;
      drawW = drawH * aspect;
    }
  }

  try {
    doc.addImage(dataUrl, 'PNG', margin, margin, drawW, drawH);
    return drawH + 2;
  } catch {
    return 0;
  }
}
