import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * Vista ampliada de la foto de perfil (tarjetas usuarios admin).
 * Cerrar: clic fuera, botón ✕ o Escape.
 */
export default function AdminUsuariosFotoLightbox({ url, onClose }) {
  useEffect(() => {
    if (!url) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [url, onClose]);

  if (!url) return null;

  return createPortal(
    <div
      className="admin-usu-foto-lightbox-overlay"
      onClick={onClose}
      role="presentation"
    >
      <button
        type="button"
        className="admin-usu-foto-lightbox-close"
        onClick={onClose}
        aria-label="Cerrar"
      >
        ✕
      </button>
      <img
        className="admin-usu-foto-lightbox-img"
        src={url}
        alt=""
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body
  );
}
