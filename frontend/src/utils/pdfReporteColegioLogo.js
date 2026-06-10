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

export async function obtenerLogoColegioDataUrl() {
  return loadImageAsDataUrl(getLogoColegioUrl());
}

/**
 * Dibuja el logo del colegio en la esquina superior izquierda.
 * @param {import('jspdf').jsPDF} doc
 * @param {string|null} logoDataUrl
 * @param {{ margin?: number, size?: number }} [opts]
 * @returns {number} altura ocupada bajo el logo (para ajustar y)
 */
export function dibujarLogoEsquina(doc, logoDataUrl, opts = {}) {
  const margin = opts.margin ?? 12;
  const size = opts.size ?? 16;
  if (!logoDataUrl) return 0;
  try {
    doc.addImage(logoDataUrl, 'PNG', margin, margin, size, size);
    return size + 2;
  } catch {
    return 0;
  }
}
