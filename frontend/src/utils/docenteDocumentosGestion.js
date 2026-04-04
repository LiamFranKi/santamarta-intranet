import api from '../services/api';

/** URL absoluta del PDF para abrir en nueva pestaña */
export function gestionPdfFullUrl(rutaRelativa) {
  if (!rutaRelativa) return '';
  const base = (api.defaults.baseURL || '').replace(/\/api\/?$/, '');
  const p = rutaRelativa.startsWith('/') ? rutaRelativa : `/${rutaRelativa}`;
  return `${base}${p}`;
}

export function docenteDocTimestamp(d) {
  const raw = d.fecha_publicacion || d.created_at;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Agrupa documentos por categoría y ordena por fecha (más recientes primero).
 */
export function groupDocenteDocsByCategory(docs) {
  const map = new Map();
  (docs || []).forEach((d) => {
    const nombre = d.categoria_nombre || 'General';
    const orden = Number(d.categoria_orden);
    const ordenCat = Number.isFinite(orden) ? orden : 0;
    if (!map.has(nombre)) {
      map.set(nombre, { orden: ordenCat, items: [] });
    }
    const entry = map.get(nombre);
    entry.items.push(d);
    entry.orden = Math.min(entry.orden, ordenCat);
  });
  return Array.from(map.entries())
    .sort((a, b) => a[1].orden - b[1].orden || a[0].localeCompare(b[0], 'es'))
    .map(([nombre, v]) => ({
      nombre,
      orden: v.orden,
      items: [...v.items].sort((a, b) => docenteDocTimestamp(b) - docenteDocTimestamp(a)),
    }));
}
