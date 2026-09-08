import React, { useState } from 'react';
import { createPortal } from 'react-dom';

function EvidenciasGaleria({ items = [], canManage = false, onDelete }) {
  const [visor, setVisor] = useState(null);

  if (!items.length) {
    return (
      <div className="empty-state">
        <p>No hay evidencias en este bimestre</p>
      </div>
    );
  }

  return (
    <>
      <div className="evidencias-galeria">
        {items.map((ev) => {
          const esPdf = ev.tipo === 'pdf';
          return (
            <article key={ev.id} className="evidencia-tile">
              <h4 className="evidencia-tile-nombre" title={ev.titulo}>
                {ev.titulo}
              </h4>
              <button
                type="button"
                className={`evidencia-tile-thumb ${esPdf ? 'is-pdf' : 'is-imagen'}`}
                onClick={() =>
                  setVisor({
                    titulo: ev.titulo,
                    tipo: ev.tipo,
                    url: ev.archivo_url,
                  })
                }
                aria-label={`Ver ${ev.titulo}`}
              >
                {esPdf ? (
                  <div className="evidencia-tile-pdf">
                    <span className="evidencia-tile-pdf-icon" aria-hidden>
                      📄
                    </span>
                    <span>PDF</span>
                  </div>
                ) : (
                  <img src={ev.archivo_url} alt="" />
                )}
              </button>
              {canManage && typeof onDelete === 'function' && (
                <button
                  type="button"
                  className="evidencia-tile-del"
                  onClick={() => onDelete(ev)}
                >
                  Eliminar
                </button>
              )}
            </article>
          );
        })}
      </div>

      {visor &&
        createPortal(
          <div
            className="evidencia-visor-overlay"
            onClick={() => setVisor(null)}
            role="dialog"
            aria-modal="true"
            aria-label={visor.titulo}
          >
            <div className="evidencia-visor-box" onClick={(e) => e.stopPropagation()}>
              <div className="evidencia-visor-bar">
                <h3>{visor.titulo}</h3>
                <div className="evidencia-visor-actions">
                  {visor.url && (
                    <a
                      className="evidencia-visor-open"
                      href={visor.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Abrir
                    </a>
                  )}
                  <button type="button" className="evidencia-visor-close" onClick={() => setVisor(null)} aria-label="Cerrar">
                    ×
                  </button>
                </div>
              </div>
              <div className="evidencia-visor-body">
                {visor.tipo === 'pdf' ? (
                  <iframe title={visor.titulo} src={visor.url} />
                ) : (
                  <img src={visor.url} alt={visor.titulo} />
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

export default EvidenciasGaleria;
