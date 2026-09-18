import React from 'react';

export default function CnebPiarMarca({ piar }) {
  if (!piar) return null;
  const title = (piar.apoyos || []).filter(Boolean).join(' · ') || 'Plan de apoyos publicado';
  return (
    <span className="cneb-piar-badge" title={title}>
      Apoyos
    </span>
  );
}
