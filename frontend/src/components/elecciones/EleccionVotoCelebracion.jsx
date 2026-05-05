import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import './EleccionVotoCelebracion.css';

/**
 * Pantalla de éxito tras registrar el voto (diseño destacado; el flujo de urna puede evolucionar después).
 */
export default function EleccionVotoCelebracion({ open, tituloProceso, onContinuar }) {
  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="elcc-voto-celebracion-backdrop" role="dialog" aria-modal="true" aria-labelledby="elcc-voto-celebracion-title">
      <div className="elcc-voto-celebracion-glow" aria-hidden />
      <div className="elcc-voto-celebracion-card">
        <div className="elcc-voto-celebracion-ring" aria-hidden />
        <div className="elcc-voto-celebracion-check" aria-hidden>
          ✓
        </div>
        <h2 id="elcc-voto-celebracion-title" className="elcc-voto-celebracion-title">
          ¡Tu voto fue realizado!
        </h2>
        <p className="elcc-voto-celebracion-lead">Gracias por participar en la democracia escolar.</p>
        {tituloProceso ? <p className="elcc-voto-celebracion-proc">{tituloProceso}</p> : null}
        <p className="elcc-voto-celebracion-note">Tu elección quedó registrada de forma segura. No podrás modificarla.</p>
        <button type="button" className="elcc-voto-celebracion-btn" onClick={onContinuar}>
          Continuar
        </button>
      </div>
    </div>,
    document.body
  );
}
