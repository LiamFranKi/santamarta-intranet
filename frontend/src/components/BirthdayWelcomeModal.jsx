import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import DOMPurify from 'dompurify';
import api from '../services/api';
import { procesarHTMLMensaje } from '../utils/mensajesHtml';
import './BirthdayWelcomeModal.css';

function storageKeyDismiss() {
  const d = new Date();
  return `cumpleanos_bienvenida_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Modal de bienvenida con plantilla HTML de admin (cumpleaños del día en el alcance del usuario).
 * Una vez cerrado, no se vuelve a mostrar hasta el día siguiente (sessionStorage).
 */
function BirthdayWelcomeModal() {
  const [abierto, setAbierto] = useState(false);
  const [html, setHtml] = useState('');

  useEffect(() => {
    if (typeof sessionStorage === 'undefined') return;
    if (sessionStorage.getItem(storageKeyDismiss())) return;

    let cancel = false;
    (async () => {
      try {
        const { data } = await api.get('/cumpleanos/bienvenida');
        if (cancel || !data?.show_modal || !data?.html) return;
        setHtml(String(data.html));
        setAbierto(true);
      } catch {
        /* silencioso */
      }
    })();

    return () => {
      cancel = true;
    };
  }, []);

  const cerrar = () => {
    try {
      sessionStorage.setItem(storageKeyDismiss(), '1');
    } catch {
      /* ignore */
    }
    setAbierto(false);
  };

  if (!abierto || !html) return null;

  const procesado = procesarHTMLMensaje(html);
  const safe = DOMPurify.sanitize(procesado, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['style', 'target', 'rel', 'class'],
  });

  return createPortal(
    <div className="birthday-welcome-overlay" role="dialog" aria-modal="true" aria-labelledby="birthday-welcome-title">
      <div className="birthday-welcome-modal" onClick={(e) => e.stopPropagation()}>
        <div className="birthday-welcome-modal__decor" aria-hidden>
          <span className="birthday-welcome-modal__cake">🎂</span>
        </div>
        <h2 id="birthday-welcome-title" className="birthday-welcome-modal__title">
          ¡Feliz día!
        </h2>
        <div
          className="birthday-welcome-modal__body ql-editor"
          dangerouslySetInnerHTML={{ __html: safe }}
        />
        <div className="birthday-welcome-modal__actions">
          <button type="button" className="birthday-welcome-modal__btn" onClick={cerrar}>
            Entendido
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default BirthdayWelcomeModal;
