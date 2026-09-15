import React from 'react';
import './LayeredAvatar.css';

/**
 * Componente que superpone imágenes PNG en capas (avatar base + accesorios).
 * Usa position: relative/absolute y zIndex para encajar pixel-perfect.
 * Todas las imágenes se escalan al 100% del contenedor (responsive).
 *
 * @param {Object} props
 * @param {string} props.baseImage - Nombre del archivo de la capa base (ej: '01_Volt_Spectrum.png')
 * @param {Array<{image: string, zIndex: number}>} props.accessories - Accesorios con image y zIndex
 * @param {string} [props.baseUrl] - URL base (ej: '/Static/Image/Avatars/' o URL completa)
 * @param {string|number} [props.size] - Tamaño del contenedor: '512px', '100%', etc.
 * @param {string} [props.className] - Clase adicional del contenedor
 */
function LayeredAvatar({ baseImage, accessories = [], baseUrl = '', size = '512px', className = '' }) {
  const getImageUrl = (filename) => {
    if (!filename) return '';
    if (filename.startsWith('http')) return filename;
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    const isLocal = !host || host === 'localhost' || host === '127.0.0.1';
    const apiBase = isLocal
      ? process.env.REACT_APP_API_URL || 'http://localhost:5000/api'
      : `${window.location.protocol}//${host}/api`;
    const base = baseUrl || apiBase.replace(/\/+$/, '') + '/static/avatars/';
    const cleanBase = base.replace(/\/+$/, '');
    const cleanName = filename.replace(/^\//, '');
    return cleanBase + '/' + encodeURIComponent(cleanName);
  };

  return (
    <div
      className={`layered-avatar ${className}`}
      style={{
        width: size,
        height: size === '100%' ? 'auto' : size,
        aspectRatio: '1 / 1',
        maxWidth: '100%',
      }}
    >
      <div className="layered-avatar-inner">
        {baseImage && (
          <img
            src={getImageUrl(baseImage)}
            alt="Avatar base"
            className="layered-avatar-layer layered-avatar-base"
            style={{ zIndex: 2 }}
          />
        )}
        {Array.isArray(accessories) &&
          accessories
            .filter((a) => a && a.image)
            .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
            .map((acc, i) => (
              <img
                key={`${acc.image}-${i}`}
                src={getImageUrl(acc.image)}
                alt={acc.name || `Accesorio ${i + 1}`}
                className="layered-avatar-layer"
                style={{ zIndex: acc.zIndex ?? i + 1 }}
              />
            ))}
      </div>
    </div>
  );
}

export default LayeredAvatar;
