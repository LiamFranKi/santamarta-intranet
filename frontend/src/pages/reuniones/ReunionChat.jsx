import React, { useEffect, useRef, useState } from 'react';
import api from '../../services/api';

function horaChat(s) {
  if (!s) return '';
  return String(s).slice(11, 16);
}

export default function ReunionChat({ reunionId, yoId, soloLectura }) {
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const caja = useRef(null);
  const fileRef = useRef(null);

  const cargar = async () => {
    try {
      const { data } = await api.get(`/reuniones/${reunionId}/chat`);
      setMensajes(data.mensajes || []);
    } catch {
      /* silencio */
    }
  };

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 2500);
    return () => clearInterval(t);
  }, [reunionId]);

  useEffect(() => {
    if (caja.current) caja.current.scrollTop = caja.current.scrollHeight;
  }, [mensajes.length]);

  const enviar = async (file) => {
    const msg = texto.trim();
    if (!msg && !file) return;
    setEnviando(true);
    try {
      const fd = new FormData();
      if (msg) fd.append('mensaje', msg);
      if (file) fd.append('archivo', file);
      const { data } = await api.post(`/reuniones/${reunionId}/chat`, fd);
      setMensajes(data.mensajes || []);
      setTexto('');
    } catch (e) {
      window.alert(e.response?.data?.error || 'No se pudo enviar.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="re-chat">
      <div className="re-chat-head">
        <strong>Chat de la reunión</strong>
        <span>Solo quienes están convocados</span>
      </div>
      <div className="re-chat-lista" ref={caja}>
        {mensajes.length === 0 ? (
          <p className="re-hint" style={{ padding: '1rem' }}>Aún no hay mensajes. Pueden escribir y adjuntar archivos.</p>
        ) : null}
        {mensajes.map((m) => {
          const mio = Number(m.usuario_id) === Number(yoId);
          return (
            <div key={m.id} className={`re-chat-msg ${mio ? 'mio' : ''}`}>
              <div className="re-chat-meta">
                {m.nombre} · {horaChat(m.created_at)}
              </div>
              {m.mensaje ? <div className="re-chat-txt">{m.mensaje}</div> : null}
              {m.url ? (
                <a className="re-chat-file" href={m.url} target="_blank" rel="noopener noreferrer">
                  {m.nombre_original || 'Archivo'}
                </a>
              ) : null}
            </div>
          );
        })}
      </div>
      {soloLectura ? (
        <p className="re-hint" style={{ padding: '0.6rem 0.8rem' }}>La reunión ya cerró. El chat queda como evidencia.</p>
      ) : (
        <form
          className="re-chat-form"
          onSubmit={(e) => {
            e.preventDefault();
            enviar();
          }}
        >
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escribe un mensaje…"
            maxLength={2000}
            disabled={enviando}
          />
          <input
            ref={fileRef}
            type="file"
            hidden
            onChange={(e) => {
              const f = e.target.files && e.target.files[0];
              e.target.value = '';
              if (f) enviar(f);
            }}
          />
          <button type="button" className="re-chat-adj" onClick={() => fileRef.current && fileRef.current.click()} title="Adjuntar">
            +
          </button>
          <button type="submit" className="re-btn re-btn-solid" disabled={enviando}>
            Enviar
          </button>
        </form>
      )}
    </div>
  );
}
