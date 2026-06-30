import React from 'react';
import { createPortal } from 'react-dom';

/**
 * Modal en document.body para quedar por encima del sidebar (z-index 9999) y del header sticky.
 */
export default function FacturacionModal({ open, onClose, title, wide, children, footer }) {
  if (!open) return null;

  const modalCls = ['pe-modal', wide ? 'pe-modal--wide' : '', wide ? 'pe-modal--factura' : '']
    .filter(Boolean)
    .join(' ');

  return createPortal(
    <div className="pe-modal-overlay" onClick={onClose} role="presentation">
      <div className={modalCls} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {title != null && (
          <div className="pe-modal-header">
            <h2>{title}</h2>
            <button type="button" className="pe-btn pe-btn--sm pe-btn--ghost" onClick={onClose} aria-label="Cerrar">
              ✕
            </button>
          </div>
        )}
        <div className="pe-modal-body">{children}</div>
        {footer && <div className="pe-modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
