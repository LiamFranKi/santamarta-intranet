import api from '../services/api';

/** URL absoluta para archivos servidos desde `backend/uploads` (ej. elecciones). */
export function buildUploadsUrl(relativePath) {
  if (!relativePath) return '';
  const s = String(relativePath).trim();
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  let base = String(api.defaults.baseURL || '').replace(/\/?api\/?$/, '');
  if (!base && typeof window !== 'undefined') {
    base = window.location.origin;
  }
  base = base.replace(/\/+$/, '');
  return `${base}/uploads/${s.replace(/^\/+/, '')}`;
}
