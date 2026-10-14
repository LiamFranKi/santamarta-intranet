/**
 * URLs de PDFs e imágenes de esta intranet.
 */
import { getPublicStaticBaseUrl, urlDeEsteColegio } from '../utils/staticUrl';

function dominioArchivos() {
  const desdeEntorno = String(process.env.REACT_APP_STATIC_FILES_DOMAIN || '').trim();
  if (desdeEntorno && !/vanguardschools/i.test(desdeEntorno)) return desdeEntorno.replace(/\/$/, '');
  return getPublicStaticBaseUrl();
}

/**
 * Construye la URL completa para un archivo estático
 * @param {string} filePath - Ruta del archivo (ej: 'Static/Archivos/nombre.pdf')
 * @returns {string} URL completa del archivo
 */
export const getStaticFileUrl = (filePath) => {
  if (!filePath) return null;
  
  // Si ya es una URL completa, validarla y corregir si es necesario
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
    return urlDeEsteColegio(filePath);
  }

  const STATIC_FILES_DOMAIN = dominioArchivos();

  // Si empieza con /Static/, construir URL completa
  if (filePath.startsWith('/Static/')) {
    return `${STATIC_FILES_DOMAIN}${filePath}`;
  }
  
  // Si empieza con Static/ (sin barra inicial), agregar la barra
  if (filePath.startsWith('Static/')) {
    return `${STATIC_FILES_DOMAIN}/${filePath}`;
  }
  
  // Si es solo el nombre del archivo, construir ruta completa
  const cleanPath = filePath.replace(/^\/+/, '');
  return `${STATIC_FILES_DOMAIN}/Static/Archivos/${cleanPath}`;
};

/**
 * Normaliza y valida una URL de archivo estático
 * @param {string} url - URL a normalizar
 * @returns {string} URL normalizada
 */
export const normalizeStaticFileUrl = (url) => {
  if (!url) return null;
  const normalizedUrl = String(url).trim();
  if (normalizedUrl.startsWith('http://') || normalizedUrl.startsWith('https://')) {
    return urlDeEsteColegio(normalizedUrl);
  }
  return getStaticFileUrl(normalizedUrl);
};

export default {
  get STATIC_FILES_DOMAIN() {
    return dominioArchivos();
  },
  getStaticFileUrl,
  normalizeStaticFileUrl,
};











