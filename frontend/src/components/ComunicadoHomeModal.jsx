import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { normalizeStaticFileUrl } from '../config/staticFiles';
import { procesarHTMLMensaje } from '../utils/mensajesHtml';
import './ComunicadoHomeModal.css';

const COLORES_MAZO = ['ambar', 'azul', 'verde', 'violeta'];

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
 * Varios: mazo de cartas (una al frente; al cerrar aparece la de atrás, corrida y de otro color).
 */
function ComunicadoHomeModal() {
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const location = useLocation();
  const [comunicados, setComunicados] = useState([]);
  const [abierto, setAbierto] = useState(false);
  const [totalInicio, setTotalInicio] = useState(0);

  const userId = user?.id || user?.usuario_id;

  useEffect(() => {
    const path = location.pathname || '';
    if (authLoading || !isAuthenticated || !user || path.startsWith('/login')) {
      setAbierto(false);
      setComunicados([]);
      setTotalInicio(0);
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
        setTotalInicio(pendientes.length);
        setAbierto(pendientes.length > 0);
      } catch {
        if (!cancel) {
          setComunicados([]);
          setTotalInicio(0);
          setAbierto(false);
        }
      }
    })();

    return () => {
      cancel = true;
    };
  }, [authLoading, isAuthenticated, user, userId, location.pathname]);

  const cerrarActual = () => {
    const actual = comunicados[0];
    if (actual?.id != null) marcarVisto(userId, actual.id);
    const resto = comunicados.slice(1);
    setComunicados(resto);
    if (!resto.length) {
      setAbierto(false);
      setTotalInicio(0);
    }
  };

  if (!abierto || comunicados.length === 0) return null;

  const actual = comunicados[0];
  const atras = comunicados.slice(1, 4);
  const varios = totalInicio > 1;
  const indice = totalInicio - comunicados.length + 1;

  return createPortal(
    <div
      className="comunicado-home-overlay"
      onClick={cerrarActual}
      role="presentation"
    >
      <div
        className={`comunicado-home-mazo${atras.length ? ' comunicado-home-mazo--stack' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {atras.map((_, i) => {
          const profundidad = atras.length - i;
          const tono = COLORES_MAZO[(profundidad - 1) % COLORES_MAZO.length];
          return (
            <div
              key={`back-${i}`}
              className={`comunicado-home-mazo__carta comunicado-home-mazo__carta--${tono}`}
              style={{
                '--offset': profundidad,
              }}
              aria-hidden="true"
            />
          );
        })}

        <div
          className="comunicado-home-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-comunicado-home-title"
        >
          <div className="comunicado-home-modal__header">
            <h2 id="modal-comunicado-home-title">
              {varios
                ? `📢 Comunicado ${indice} de ${totalInicio}`
                : '📢 Comunicado importante'}
            </h2>
            <button
              className="comunicado-home-modal__close"
              onClick={cerrarActual}
              type="button"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>

          <div className="comunicado-home-modal__body">
            <article className="comunicado-home-item">
              {varios && comunicados.length > 1 ? (
                <div className="comunicado-home-item__n">
                  Quedan {comunicados.length - 1} más detrás
                </div>
              ) : null}
              <h3 className="comunicado-home-item__titulo">{actual.descripcion}</h3>
              {actual.contenido ? (
                <div
                  className="comunicado-home-item__contenido"
                  dangerouslySetInnerHTML={{ __html: procesarHTMLMensaje(actual.contenido) }}
                />
              ) : null}
              {actual.fecha_hora ? (
                <div className="comunicado-home-item__fecha">📅 {formatearFecha(actual.fecha_hora)}</div>
              ) : null}
              {actual.archivo_url ? (
                <button
                  type="button"
                  className="comunicado-home-item__archivo"
                  onClick={() => abrirArchivo(actual.archivo_url)}
                >
                  📎 Ver archivo adjunto
                </button>
              ) : null}
            </article>

            <div className="comunicado-home-modal__acciones">
              <button type="button" className="comunicado-home-modal__ok" onClick={cerrarActual}>
                {comunicados.length > 1 ? 'Entendido, ver el siguiente' : 'Entendido'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default ComunicadoHomeModal;
