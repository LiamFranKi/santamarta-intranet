import { getPublicStaticBaseUrl, urlDeEsteColegio } from './staticUrl';

/** URL de foto de alumnos y personal, servida por esta intranet. */
export function fotoUsuarioAdmin(foto) {
  if (!foto) return null;
  const nombre = String(foto).trim();
  if (!nombre) return null;
  const base = getPublicStaticBaseUrl();
  if (/^https?:\/\//i.test(nombre)) return urlDeEsteColegio(nombre);
  if (nombre.startsWith('/')) return `${base}${nombre}`;
  return `${base}/Static/Image/Fotos/${nombre}`;
}
