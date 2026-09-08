import React from 'react';
import './AdjuntosPendientes.css';

function tamanoArchivo(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / 1024).toFixed(1)} KB`;
}

/**
 * Lista de archivos aún no enviados, con botón claro para quitar uno por error.
 */
export default function AdjuntosPendientes({ archivos = [], onQuitar, inputId }) {
  if (!Array.isArray(archivos) || archivos.length === 0) return null;

  const quitar = (index) => {
    onQuitar(index);
    if (inputId) {
      const input = document.getElementById(inputId);
      if (input) input.value = '';
    }
  };

  return (
    <ul className="adjuntos-pendientes" aria-label="Archivos adjuntos por enviar">
      {archivos.map((archivo, index) => (
        <li key={`${archivo.name}-${archivo.size}-${index}`} className="adjuntos-pendientes-item">
          <div className="adjuntos-pendientes-info">
            <span className="adjuntos-pendientes-nombre" title={archivo.name}>{archivo.name}</span>
            <span className="adjuntos-pendientes-tam">{tamanoArchivo(archivo.size)}</span>
          </div>
          <button
            type="button"
            className="adjuntos-pendientes-quitar"
            onClick={() => quitar(index)}
            aria-label={`Quitar ${archivo.name}`}
          >
            Quitar
          </button>
        </li>
      ))}
    </ul>
  );
}
