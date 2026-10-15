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

let metaPromise = null;

export function invalidarCacheLogo() {
  metaPromise = null;
}

function cargarColegio() {
  if (!metaPromise) {
    const base = apiBaseUrl();
    metaPromise = fetch(`${base}/api/colegio/1`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return metaPromise;
}

function absoluto(raw) {
  if (!raw) return null;
  const s = String(raw);
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  const base = apiBaseUrl();
  return `${base}${s.startsWith('/') ? s : `/${s}`}`;
}

/** URL absoluta del logo guardado en configuración, o null si aún no hay uno. */
export function urlLogoConfigurado() {
  return cargarColegio().then((data) => {
    if (!data?.logo_desde_config || !data.logo) return null;
    return absoluto(data.logo);
  });
}

/**
 * Cabecera de la libreta: logo de libreta si está subido, si no el logo a color.
 * Marca de agua: fondo de libreta si está subido, si no la misma cabecera.
 */
export async function imagenesLibretaPdf() {
  const data = await cargarColegio();
  const color = data?.logo_desde_config && data.logo ? absoluto(data.logo) : null;
  const header = absoluto(data?.libreta_logo) || color;
  const fondo = absoluto(data?.libreta_fondo) || header;
  return { header, fondo };
}

/** Logo de configuración, o el archivo que esa pantalla ya usaba. */
export async function urlLogoConRespaldo(fallbackPath = '/assets/logos/logo.png') {
  const cfg = await urlLogoConfigurado();
  if (cfg) return cfg;
  const base = apiBaseUrl();
  if (!fallbackPath) return '';
  if (String(fallbackPath).startsWith('http://') || String(fallbackPath).startsWith('https://')) {
    return fallbackPath;
  }
  return `${base}${String(fallbackPath).startsWith('/') ? fallbackPath : `/${fallbackPath}`}`;
}

async function rasterToPngDataUrl(url) {
  if (!url) return null;
  try {
    const r = await fetch(url, { mode: 'cors' });
    if (!r.ok) return null;
    const blob = await r.blob();
    const raw = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
    if (!raw || typeof raw !== 'string') return null;
    if (raw.startsWith('data:image/png')) return raw;
    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || 1;
          canvas.height = img.naturalHeight || 1;
          canvas.getContext('2d').drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } catch {
          resolve(raw);
        }
      };
      img.onerror = () => resolve(null);
      img.src = raw;
    });
  } catch {
    return null;
  }
}

/** Logo blanco de configuración, para cabeceras de fondo oscuro. */
export async function cargarLogoBlancoPngDataUrl() {
  const data = await cargarColegio();
  if (!data?.logo_blanco_desde_config || !data.logo_blanco) return null;
  return rasterToPngDataUrl(absoluto(data.logo_blanco));
}

/** PNG listo para jsPDF. Si el logo de configuración falla, usa el respaldo. */
export async function cargarLogoPngDataUrl(fallbackPath = '/assets/logos/logo.png') {
  const cfg = await urlLogoConfigurado();
  if (cfg) {
    const png = await rasterToPngDataUrl(cfg);
    if (png) return png;
  }
  const base = apiBaseUrl();
  const fb = !fallbackPath
    ? ''
    : String(fallbackPath).startsWith('http')
      ? fallbackPath
      : `${base}${String(fallbackPath).startsWith('/') ? fallbackPath : `/${fallbackPath}`}`;
  return rasterToPngDataUrl(fb);
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
  return cargarLogoPngDataUrl('/assets/logos/logo.png');
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

  const margin = opts.margin ?? 8;
  const maxWidth = opts.maxWidth ?? 28;
  const maxHeight = opts.maxHeight ?? 8;
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
