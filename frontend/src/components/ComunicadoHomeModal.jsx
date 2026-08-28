import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { normalizeStaticFileUrl } from '../config/staticFiles';
import { procesarHTMLMensaje } from '../utils/mensajesHtml';
import './ComunicadoHomeModal.css';

function storageKey(userId, comunicadoId) {
  return `comunicado_home_u${userId || 'x'}_${comunicadoId}`;
}

function yaVisto(userId, comunicadoId) {
  try {
    return sessionStorage.getItem(storageKey(userId, comunicadoId)) === 'true';
  } catch {
    return false;
  }
}

function marcarVisto(userId, comunicadoId) {
  try {
    sessionStorage.setItem(storageKey(userId, comunicadoId), 'true');
  } catch {
    /* ignore */
  }
}

function formatearFecha(fechaHora) {
  if (!fechaHora) return '';
  const fecha = new Date(fechaHora);
  const dia = String(fecha.getDate()).padStart(2, '0');
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const año = fecha.getFullYear();
  let horas = fecha.getHours();
  const minutos = String(fecha.getMinutes()).padStart(2, '0');
  const ampm = horas >= 12 ? 'PM' : 'AM';
  horas = horas % 12;
  horas = horas ? horas : 12;
  return `${dia}-${mes}-${año} ${String(horas).padStart(2, '0')}:${minutos} ${ampm}`;
}

function abrirArchivo(archivoUrl) {
  if (!archivoUrl) return;
  let urlFinal = String(archivoUrl).trim();
  if (!urlFinal.startsWith('http://') && !urlFinal.startsWith('https://')) {
    urlFinal = normalizeStaticFileUrl(archivoUrl);
  }
  if (!urlFinal) return;
  try {
    const urlObj = new URL(urlFinal);
    const nuevaVentana = window.open(urlObj.href, '_blank', 'noopener,noreferrer');
    if (!nuevaVentana) {
      const link = document.createElement('a');
      link.href = urlObj.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => document.body.removeChild(link), 100);
    }
  } catch (error) {
    console.error('Error al abrir archivo de comunicado:', error);
  }
}

/**
 * Ventanas de comunicados con "Mostrar en inicio".
 * Varios a la vez (lista en un solo modal). Clave de visto por usuario, no por navegador.
 */
function ComunicadoHomeModal() {
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const location = useLocation();
  const [comunicados, setComunicados] = useState([]);
  const [abierto, setAbierto] = useState(false);

  const userId = user?.id || user?.usuario_id;

  useEffect(() => {
    const path = location.pathname || '';
    if (authLoading || !isAuthenticated || !user || path.startsWith('/login')) {
      setAbierto(false);
      setComunicados([]);
      return undefined;
    }

    let cancel = false;
    (async () => {
      try {
        const { data } = await api.get('/comunicados/inicio');
        if (cancel) return;
        const lista = Array.isArray(data?.comunicados) ? data.comunicados : [];
        const pendientes = lista.filter((c) => c?.id != null && !yaVisto(userId, c.id));
        setComunicados(pendientes);
        setAbierto(pendientes.length > 0);
      } catch {
        if (!cancel) {
          setComunicados([]);
          setAbierto(false);
        }
      }
    })();

    return () => {
      cancel = true;
    };
  }, [authLoading, isAuthenticated, user, userId, location.pathname]);

  const cerrar = () => {
    comunicados.forEach((c) => {
      if (c?.id != null) marcarVisto(userId, c.id);
    });
    setAbierto(false);
    setComunicados([]);
  };

  if (!abierto || comunicados.length === 0) return null;

  const varios = comunicados.length > 1;

  return createPortal(
    <div
      className="comunicado-home-overlay"
      onClick={cerrar}
      role="presentation"
    >
      <div
        className="comunicado-home-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-comunicado-home-title"
      >
        <div className="comunicado-home-modal__header">
          <h2 id="modal-comunicado-home-title">
            {varios ? `📢 Comunicados importantes (${comunicados.length})` : '📢 Comunicado importante'}
          </h2>
          <button
            className="comunicado-home-modal__close"
            onClick={cerrar}
            type="button"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="comunicado-home-modal__body">
          {comunicados.map((com, idx) => (
            <article
              key={com.id || idx}
              className={`comunicado-home-item${varios ? ' comunicado-home-item--varios' : ''}`}
            >
              {varios && (
                <div className="comunicado-home-item__n">Comunicado {idx + 1} de {comunicados.length}</div>
              )}
              <h3 className="comunicado-home-item__titulo">{com.descripcion}</h3>
              {com.contenido ? (
                <div
                  className="comunicado-home-item__contenido"
                  dangerouslySetInnerHTML={{ __html: procesarHTMLMensaje(com.contenido) }}
                />
              ) : null}
              {com.fecha_hora ? (
                <div className="comunicado-home-item__fecha">📅 {formatearFecha(com.fecha_hora)}</div>
              ) : null}
              {com.archivo_url ? (
                <button
                  type="button"
                  className="comunicado-home-item__archivo"
                  onClick={() => abrirArchivo(com.archivo_url)}
                >
                  📎 Ver archivo adjunto
                </button>
              ) : null}
            </article>
          ))}

          <div className="comunicado-home-modal__acciones">
            <button type="button" className="comunicado-home-modal__ok" onClick={cerrar}>
              Entendido
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default ComunicadoHomeModal;
