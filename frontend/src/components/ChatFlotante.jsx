import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import './ChatFlotante.css';

const POLL_MS = 8000;
const PULSO_MS = 10000;

function tabId() {
  const key = 'cvg-tab';
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(key, id);
  }
  return id;
}

export function ChatEnLinea() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user || user.tipo === 'ASISTENCIA') return undefined;
    const id = tabId();
    let timer = null;
    const pulso = () => {
      if (document.visibilityState !== 'visible') return;
      api.post('/chat/pulso', { tab_id: id }).catch(() => {});
    };
    const ausente = () => {
      api.post('/chat/ausente', { tab_id: id }).catch(() => {});
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') pulso();
      else ausente();
    };
    pulso();
    timer = setInterval(pulso, PULSO_MS);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', ausente);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', ausente);
      ausente();
    };
  }, [user]);
  return null;
}

function iniciales(nombre) {
  const p = String(nombre || 'C').trim().split(/\s+/).slice(0, 2);
  return p.map((w) => (w[0] || '').toUpperCase()).join('') || 'C';
}

function horaCorta(val) {
  if (!val) return '';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' });
}

export default function ChatFlotante({ levantado = false }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [abierto, setAbierto] = useState(false);
  const [aviso, setAviso] = useState({ no_leidos: 0, salas: [] });
  const enChat = pathname === '/chat' || pathname.startsWith('/chat/');
  const oculto = !user || user.tipo === 'ASISTENCIA' || enChat;

  const cargar = useCallback(async () => {
    if (oculto) return;
    try {
      const { data } = await api.get('/chat/aviso');
      setAviso({
        no_leidos: Number(data?.no_leidos) || 0,
        salas: data?.salas || [],
      });
    } catch {
      /* módulo apagado o tablas aún no creadas */
    }
  }, [oculto]);

  useEffect(() => {
    if (oculto) {
      setAbierto(false);
      return undefined;
    }
    cargar();
    const t = setInterval(cargar, POLL_MS);
    const onFocus = () => cargar();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', onFocus);
    };
  }, [oculto, cargar]);

  if (oculto) return null;

  const total = aviso.no_leidos;
  const ir = (salaId) => {
    setAbierto(false);
    navigate(salaId ? `/chat?sala=${salaId}` : '/chat');
  };

  return (
    <div className={`cvf ${levantado ? 'cvf--up' : ''} ${abierto ? 'is-open' : ''}`}>
      {abierto && (
        <div className="cvf-panel" role="dialog" aria-label="Chat Vanguard">
          <header className="cvf-head">
            <span className="cvf-mark" aria-hidden><i /></span>
            <div>
              <strong>Chat Vanguard</strong>
              <span>{total > 0 ? `${total} sin leer` : 'Mensajes del colegio'}</span>
            </div>
          </header>
          <div className="cvf-list">
            {aviso.salas.length === 0 && (
              <p className="cvf-empty">Todavía no hay conversaciones. Abra el chat para escribir.</p>
            )}
            {aviso.salas.map((s) => (
              <button key={s.id} type="button" className="cvf-row" onClick={() => ir(s.id)}>
                <span className={`cvf-ava cvf-ava--${s.tipo}`}>{s.tipo === 'dm' ? iniciales(s.titulo) : s.tipo === 'aula' ? '🏫' : '✦'}</span>
                <span className="cvf-txt">
                  <span className="cvf-top">
                    <b>{s.titulo}</b>
                    <time>{horaCorta(s.ultimo_at)}</time>
                  </span>
                  <em>{s.ultimo || 'Sin mensajes'}</em>
                </span>
                {s.no_leidos > 0 && <b className="cvf-badge">{s.no_leidos > 99 ? '99+' : s.no_leidos}</b>}
              </button>
            ))}
          </div>
          <button type="button" className="cvf-open" onClick={() => ir()}>Abrir chat</button>
        </div>
      )}
      <button
        type="button"
        className={`cvf-fab ${total > 0 ? 'has-new' : ''}`}
        onClick={() => setAbierto((v) => !v)}
        aria-label={abierto ? 'Cerrar chat' : 'Abrir Chat Vanguard'}
      >
        {abierto ? (
          <span className="cvf-x" aria-hidden>×</span>
        ) : (
          <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden>
            <path fill="currentColor" d="M4 4.8A2.8 2.8 0 0 1 6.8 2h10.4A2.8 2.8 0 0 1 20 4.8v8.4a2.8 2.8 0 0 1-2.8 2.8H9.2L4.6 20.2A1 1 0 0 1 3 19.4V4.8Z" />
          </svg>
        )}
        {!abierto && total > 0 && (
          <span className="cvf-count">{total > 99 ? '99+' : total}</span>
        )}
      </button>
    </div>
  );
}
