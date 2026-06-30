import React from 'react';

export default function TabPlaceholder({ titulo, descripcion }) {
  return (
    <div className="pe-card pe-card--placeholder">
      <h2 className="pe-card-title">{titulo}</h2>
      <p className="pe-placeholder-text">{descripcion}</p>
      <p className="pe-placeholder-hint">Próximo paso en la migración del módulo BCP.</p>
    </div>
  );
}
