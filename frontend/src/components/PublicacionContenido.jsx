import React from 'react';
import {
  construirUrlArchivoPublicacion,
  normalizarUrlImagenPublicacion,
  resolverVideoPublicacion,
} from '../utils/publicacionesMedia';

function nombreArchivoCorto(archivo, index) {
  const nombreArchivo = String(archivo || '').split('/').pop() || `Archivo ${index + 1}`;
  const extension = nombreArchivo.split('.').pop()?.toLowerCase() || 'pdf';

  if (extension === 'pdf') return 'Archivo.pdf';
  if (extension === 'doc' || extension === 'docx') return 'Archivo.docx';
  if (extension === 'xls' || extension === 'xlsx') return 'Archivo.xlsx';
  if (extension === 'ppt' || extension === 'pptx') return 'Archivo.pptx';
  return `Archivo.${extension}`;
}

export default function PublicacionContenido({ pub, onImageClick }) {
  const video = resolverVideoPublicacion(pub);

  return (
    <div className="publicacion-contenido">
      {pub?.contenido ? <p>{pub.contenido}</p> : null}

      {video ? (
        <div className="publicacion-video-embed">
          <iframe
            src={video.embedUrl}
            title={`Video de YouTube - publicación ${pub?.id || ''}`}
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      ) : null}

      {Array.isArray(pub?.images) && pub.images.length > 0 ? (
        <div className="publicacion-imagenes">
          {pub.images.slice(0, 3).map((imagenUrl, idx) => {
            const urlCompleta = imagenUrl?.startsWith?.('http')
              ? normalizarUrlImagenPublicacion(imagenUrl)
              : `${window.location.protocol === 'https:' ? 'https:' : 'http:'}//${window.location.hostname}${String(imagenUrl || '').startsWith('/') ? '' : '/'}${imagenUrl}`;

            return (
              <img
                key={idx}
                src={urlCompleta}
                alt={`Publicación ${idx + 1}`}
                className={pub.images.length === 1 ? 'imagen-sola' : 'imagen-multiple'}
                onClick={() => onImageClick?.(urlCompleta)}
                onError={(e) => {
                  console.error('Error cargando imagen:', imagenUrl, '→', urlCompleta);
                  e.target.style.display = 'none';
                }}
                style={{ cursor: 'pointer' }}
              />
            );
          })}
          {pub.images.length > 3 ? (
            <div className="imagen-mas">+{pub.images.length - 3} más</div>
          ) : null}
        </div>
      ) : null}

      {Array.isArray(pub?.archivos) && pub.archivos.length > 0 ? (
        <div className="publicacion-archivos">
          {pub.archivos.map((archivo, idx) => (
            <a
              key={idx}
              href={construirUrlArchivoPublicacion(archivo)}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="archivo-link"
            >
              📎 {nombreArchivoCorto(archivo, idx)}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
