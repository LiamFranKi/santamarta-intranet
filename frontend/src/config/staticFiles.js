/**
 * Configuración de URLs para archivos estáticos (PDFs, imágenes, etc.)
 * 
 * IMPORTANTE: Esta configuración puede cambiar cuando se suba al VPS.
 * Para cambiar el dominio, modifica la variable STATIC_FILES_DOMAIN abajo.
 */

// Dominio base para archivos estáticos (PDFs, imágenes, etc.)
// NOTA: Este valor puede cambiar cuando se suba al VPS
// Opciones comunes:
//   - Desarrollo: 'https://sistema.vanguardschools.edu.pe'
//   - Producción (mismo VPS): 'https://sistema.vanguardschools.edu.pe' o 'https://vanguardschools.edu.pe'
//   - Producción (VPS diferente): ajustar según donde estén los archivos
const STATIC_FILES_DOMAIN = process.env.REACT_APP_STATIC_FILES_DOMAIN || 'https://sistema.vanguardschools.edu.pe';

/**
 * Construye la URL completa para un archivo estático
 * @param {string} filePath - Ruta del archivo (ej: 'Static/Archivos/nombre.pdf')
 * @returns {string} URL completa del archivo
 */
export const getStaticFileUrl = (filePath) => {
  if (!filePath) return null;
  
  // Si ya es una URL completa, validarla y corregir si es necesario
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
    // Corregir dominio si es necesario
    let url = filePath.replace(/https?:\/\/(www\.)?vanguardschools\.edu\.pe/gi, STATIC_FILES_DOMAIN);
    return url;
  }
  
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
  
  const domain = STATIC_FILES_DOMAIN.replace(/^https?:\/\//, '');
  const domainWithProtocol = STATIC_FILES_DOMAIN;
  
  let normalizedUrl = url.trim();
  
  // Si ya tiene protocolo, validar dominio
  if (normalizedUrl.startsWith('http://') || normalizedUrl.startsWith('https://')) {
    // Reemplazar cualquier variación del dominio incorrecto
    normalizedUrl = normalizedUrl.replace(/https?:\/\/(www\.)?vanguardschools\.edu\.pe/gi, domainWithProtocol);
    normalizedUrl = normalizedUrl.replace(/vanguardschools\.comstatic/gi, `${domainWithProtocol}/Static`);
    normalizedUrl = normalizedUrl.replace(/vanguardschools\.com\/static/gi, `${domainWithProtocol}/Static`);
    normalizedUrl = normalizedUrl.replace(/vanguardschools\.com\/Static/gi, `${domainWithProtocol}/Static`);
    
    // Limpiar múltiples barras
    normalizedUrl = normalizedUrl.replace(/([^:]\/)\/+/g, '$1');
  } else {
    // Construir URL completa
    normalizedUrl = getStaticFileUrl(normalizedUrl);
  }
  
  return normalizedUrl;
};

export default {
  STATIC_FILES_DOMAIN,
  getStaticFileUrl,
  normalizeStaticFileUrl,
};











