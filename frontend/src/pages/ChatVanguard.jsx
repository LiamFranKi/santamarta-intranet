import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import './ChatVanguard.css';

const POLL_HILO = 2500;
const POLL_LISTA = 4000;

function iniciales(nombre) {
  const p = String(nombre || 'C').trim().split(/\s+/).slice(0, 2);
  return p.map((w) => (w[0] || '').toUpperCase()).join('') || 'C';
}

function hueDe(str) {
  const s = String(str || '');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = s.charCodeAt(i) + ((h << 5) - h);
  const hues = [198, 168, 38, 262, 152, 12, 210, 330];
  return hues[Math.abs(h) % hues.length];
}

function horaLima(val) {
  if (!val) return '';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' });
}

function diaSep(val) {
  if (!val) return '';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return '';
  const limaMsg = d.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
  const limaHoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
  if (limaHoy === limaMsg) return 'Hoy';
  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  if (ayer.toLocaleDateString('en-CA', { timeZone: 'America/Lima' }) === limaMsg) return 'Ayer';
  return d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short', timeZone: 'America/Lima' });
}

function iconoSala(tipo) {
  if (tipo === 'aula') return '🏫';
  if (tipo === 'personal') return '✦';
  return '💬';
}

function etiquetaSala(tipo) {
  if (tipo === 'aula') return 'Aula';
  if (tipo === 'personal') return 'Personal';
  return 'Privado';
}

export default function ChatVanguard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [yo, setYo] = useState(0);
  const [salas, setSalas] = useState([]);
  const [salaId, setSalaId] = useState(null);
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [qContacto, setQContacto] = useState('');
  const [contactos, setContactos] = useState([]);
  const [buscarPersona, setBuscarPersona] = useState(false);
  const [cargandoLista, setCargandoLista] = useState(true);
  const [cargandoHilo, setCargandoHilo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);

  const hiloRef = useRef(null);
  const lastIdRef = useRef(0);
  const salaIdRef = useRef(null);
  const stickRef = useRef(true);
  const inputRef = useRef(null);

  const salaActiva = useMemo(
    () => salas.find((s) => Number(s.id) === Number(salaId)) || null,
    [salas, salaId]
  );

  const salasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return salas;
    return salas.filter((s) =>
      `${s.titulo} ${s.subtitulo || ''} ${s.ultimo || ''}`.toLowerCase().includes(q)
    );
  }, [salas, busqueda]);

  const cargarSalas = useCallback(async (silencio) => {
    try {
      const { data } = await api.get('/chat/salas');
      setYo(Number(data.yo) || 0);
      setSalas(data.salas || []);
      setError('');
    } catch (e) {
      if (!silencio) {
        setError(e.response?.data?.error || 'No se pudieron cargar las conversaciones.');
      }
    } finally {
      setCargandoLista(false);
    }
  }, []);

  const cargarHilo = useCallback(async (id, inicial) => {
    if (!id) return;
    try {
      if (inicial) setCargandoHilo(true);
      const after = inicial ? 0 : lastIdRef.current;
      const { data } = await api.get(`/chat/salas/${id}/mensajes`, {
        params: inicial ? {} : { after_id: after },
      });
      const nuevos = data.mensajes || [];
      if (inicial) {
        setMensajes(nuevos);
        lastIdRef.current = nuevos.length ? nuevos[nuevos.length - 1].id : 0;
        stickRef.current = true;
      } else if (nuevos.length) {
        setMensajes((prev) => {
          const ids = new Set(prev.map((m) => m.id));
          const extra = nuevos.filter((m) => !ids.has(m.id));
          return extra.length ? [...prev, ...extra] : prev;
        });
        lastIdRef.current = nuevos[nuevos.length - 1].id;
      }
    } catch (e) {
      if (inicial) setError(e.response?.data?.error || 'No se pudo abrir la conversación.');
    } finally {
      setCargandoHilo(false);
    }
  }, []);

  useEffect(() => {
    cargarSalas(false);
  }, [cargarSalas]);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), POLL_LISTA);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (tick > 0) cargarSalas(true);
  }, [tick, cargarSalas]);

  useEffect(() => {
    salaIdRef.current = salaId;
    lastIdRef.current = 0;
    if (!salaId) {
      setMensajes([]);
      return undefined;
    }
    cargarHilo(salaId, true);
    const t = setInterval(() => {
      if (salaIdRef.current) cargarHilo(salaIdRef.current, false);
    }, POLL_HILO);
    return () => clearInterval(t);
  }, [salaId, cargarHilo]);

  useEffect(() => {
    if (!stickRef.current || !hiloRef.current) return;
    hiloRef.current.scrollTo({ top: hiloRef.current.scrollHeight, behavior: 'smooth' });
  }, [mensajes]);

  useEffect(() => {
    if (!qContacto.trim() || qContacto.trim().length < 2) {
      setContactos([]);
      return undefined;
    }
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get('/chat/contactos', { params: { q: qContacto.trim() } });
        setContactos(data.contactos || []);
      } catch {
        setContactos([]);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [qContacto]);

  useEffect(() => {
    const q = parseInt(searchParams.get('sala'), 10);
    if (q) setSalaId(q);
  }, [searchParams]);

  const abrirSala = (id) => {
    setSalaId(id);
    setBuscarPersona(false);
    if (id) setSearchParams({ sala: String(id) }, { replace: true });
    setTimeout(() => inputRef.current?.focus(), 80);
  };

  const borrarSala = async (sala) => {
    if (!window.confirm(`¿Borrar el chat con ${sala.titulo}? Se oculta para usted. Si le escriben de nuevo, vuelve a aparecer.`)) return;
    try {
      await api.delete(`/chat/salas/${sala.id}`);
      if (Number(salaIdRef.current) === Number(sala.id)) {
        setSalaId(null);
        setSearchParams({}, { replace: true });
      }
      await cargarSalas(true);
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo borrar la conversación.');
    }
  };

  const abrirDm = async (usuarioId) => {
    try {
      const { data } = await api.post('/chat/dm', { usuario_id: usuarioId });
      await cargarSalas(true);
      if (data.sala?.id) abrirSala(data.sala.id);
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo abrir el chat privado.');
    }
  };

  const enviar = async (e) => {
    e?.preventDefault();
    const body = texto.trim();
    if (!body || !salaId || enviando) return;
    setEnviando(true);
    setTexto('');
    try {
      const { data } = await api.post(`/chat/salas/${salaId}/mensajes`, { texto: body });
      const msg = data.mensaje;
      if (msg) {
        setMensajes((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        lastIdRef.current = Math.max(lastIdRef.current, msg.id);
        stickRef.current = true;
      }
      cargarSalas(true);
    } catch (err) {
      setTexto(body);
      setError(err.response?.data?.error || 'No se pudo enviar.');
    } finally {
      setEnviando(false);
      inputRef.current?.focus();
    }
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  };

  const onScrollHilo = () => {
    const el = hiloRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  let ultimoDia = '';

  return (
    <DashboardLayout>
      <div className={`cvg-page ${salaId ? 'cvg-page--hilo' : ''}`}>
        <div className="cvg-aurora" aria-hidden>
          <span className="cvg-orb cvg-orb-a" />
          <span className="cvg-orb cvg-orb-b" />
          <span className="cvg-orb cvg-orb-c" />
        </div>

        <aside className="cvg-list">
          <header className="cvg-list-head">
            <div className="cvg-brand">
              <span className="cvg-brand-mark" aria-hidden>
                <i />
              </span>
              <div>
                <h1>Chat Vanguard</h1>
                <p>Aulas, personal y mensajes privados</p>
              </div>
            </div>
            <button
              type="button"
              className="cvg-btn-nuevo"
              onClick={() => {
                setBuscarPersona((v) => !v);
                setQContacto('');
                setContactos([]);
              }}
            >
              {buscarPersona ? 'Cerrar' : 'Nuevo chat'}
            </button>
          </header>

          {buscarPersona ? (
            <div className="cvg-nuevo">
              <input
                className="cvg-search"
                value={qContacto}
                onChange={(e) => setQContacto(e.target.value)}
                placeholder="Buscar persona (mín. 2 letras)…"
                autoFocus
              />
              <div className="cvg-contactos">
                {qContacto.trim().length < 2 && (
                  <p className="cvg-hint">Escriba un nombre para encontrar docentes, personal o su aula.</p>
                )}
                {contactos.map((c) => (
                  <button key={c.id} type="button" className="cvg-contacto" onClick={() => abrirDm(c.id)}>
                    <span className="cvg-ava" style={{ '--h': hueDe(c.nombre) }}>{iniciales(c.nombre)}</span>
                    <span>
                      <strong>{c.nombre}</strong>
                      <em>{c.etiqueta}</em>
                    </span>
                  </button>
                ))}
                {qContacto.trim().length >= 2 && !contactos.length && (
                  <p className="cvg-hint">Sin coincidencias en su alcance.</p>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="cvg-search-wrap">
                <input
                  className="cvg-search"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar conversación…"
                />
              </div>
              <div className="cvg-salas">
                {cargandoLista && <div className="cvg-skel" />}
                {!cargandoLista && error && !salas.length && <p className="cvg-error">{error}</p>}
                {!cargandoLista && !salasFiltradas.length && !error && (
                  <p className="cvg-hint">Aún no hay salas. Encienda el módulo y recargue.</p>
                )}
                {salasFiltradas.map((s) => (
                  <div
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    className={`cvg-sala ${Number(s.id) === Number(salaId) ? 'is-on' : ''}`}
                    onClick={() => abrirSala(s.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter') abrirSala(s.id); }}
                  >
                    <span className={`cvg-ava cvg-ava--${s.tipo}`} style={{ '--h': hueDe(s.titulo) }}>
                      {s.tipo === 'dm' ? iniciales(s.titulo) : iconoSala(s.tipo)}
                    </span>
                    <span className="cvg-sala-txt">
                      <span className="cvg-sala-top">
                        <strong>{s.titulo}</strong>
                        <time>{horaLima(s.ultimo_at)}</time>
                      </span>
                      <span className="cvg-sala-sub">
                        <em>{s.ultimo || s.subtitulo || etiquetaSala(s.tipo)}</em>
                        {s.no_leidos > 0 && <b className="cvg-badge">{s.no_leidos > 99 ? '99+' : s.no_leidos}</b>}
                      </span>
                    </span>
                    {s.tipo === 'dm' && (
                      <button
                        type="button"
                        className="cvg-borrar"
                        title="Borrar conversación"
                        onClick={(e) => { e.stopPropagation(); borrarSala(s); }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </aside>

        <section className="cvg-thread">
          {!salaActiva ? (
            <div className="cvg-empty">
              <div className="cvg-empty-rings" aria-hidden>
                <i />
                <i />
                <i />
              </div>
              <h2>Bienvenido al Chat Vanguard</h2>
              <p>
                Hable con su aula, con el personal del colegio o inicie un chat privado.
                Los mensajes se actualizan al instante.
              </p>
            </div>
          ) : (
            <>
              <header className="cvg-thread-head">
                <button type="button" className="cvg-back" onClick={() => { setSalaId(null); setSearchParams({}, { replace: true }); }} aria-label="Volver">
                  ←
                </button>
                <span className={`cvg-ava cvg-ava--${salaActiva.tipo}`} style={{ '--h': hueDe(salaActiva.titulo) }}>
                  {salaActiva.tipo === 'dm' ? iniciales(salaActiva.titulo) : iconoSala(salaActiva.tipo)}
                </span>
                <div>
                  <h2>{salaActiva.titulo}</h2>
                  <p>{salaActiva.subtitulo || etiquetaSala(salaActiva.tipo)}</p>
                </div>
                <span className={`cvg-pill cvg-pill--${salaActiva.tipo}`}>{etiquetaSala(salaActiva.tipo)}</span>
              </header>

              <div className="cvg-hilo" ref={hiloRef} onScroll={onScrollHilo}>
                {cargandoHilo && <div className="cvg-hilo-load">Abriendo conversación…</div>}
                {mensajes.map((m) => {
                  const dia = diaSep(m.created_at);
                  const showDia = dia && dia !== ultimoDia;
                  if (showDia) ultimoDia = dia;
                  const mio = !!m.mio || Number(m.usuario_id) === yo;
                  return (
                    <React.Fragment key={m.id}>
                      {showDia && <div className="cvg-dia"><span>{dia}</span></div>}
                      <article className={`cvg-msg ${mio ? 'is-mio' : ''}`}>
                        {!mio && (
                          <span className="cvg-ava cvg-ava-sm" style={{ '--h': hueDe(m.nombre) }}>
                            {iniciales(m.nombre)}
                          </span>
                        )}
                        <div className="cvg-burbuja">
                          {!mio && <cite>{m.nombre}</cite>}
                          <p>{m.texto}</p>
                          <time>{horaLima(m.created_at)}</time>
                        </div>
                      </article>
                    </React.Fragment>
                  );
                })}
                {!cargandoHilo && !mensajes.length && (
                  <p className="cvg-hint cvg-hint-center">Sea el primero en escribir. El aula lo va a leer.</p>
                )}
              </div>

              <form className="cvg-composer" onSubmit={enviar}>
                <textarea
                  ref={inputRef}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value.slice(0, 2000))}
                  onKeyDown={onKey}
                  placeholder="Escriba un mensaje… Enter para enviar"
                  rows={1}
                />
                <button type="submit" className="cvg-send" disabled={!texto.trim() || enviando} aria-label="Enviar">
                  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
                    <path fill="currentColor" d="M3.4 20.6 21 12 3.4 3.4 3 10l11 2-11 2z" />
                  </svg>
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}
