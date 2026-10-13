import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import ConductaRegistrosAlumno from './ConductaRegistrosAlumno';
import './ConductaRapidaFlotante.css';

const TIPOS = [
  { id: 'incidencia', label: 'Incidencia', texto: 'Falta leve, grave o muy grave', tono: 'sky' },
  { id: 'puntualidad', label: 'Tardanza', texto: 'Llegó tarde a clase o al recreo', tono: 'amber' },
  { id: 'presentacion', label: 'Vestimenta', texto: 'Uniforme, cabello o presentación', tono: 'teal' },
];

function iniciales(nombre) {
  const partes = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] || '') + (partes[1]?.[0] || '')).toUpperCase() || 'AL';
}

export default function ConductaRapidaFlotante({ pisos = 0 }) {
  const { user } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [alumnos, setAlumnos] = useState([]);
  const [vigente, setVigente] = useState(true);
  const [alumno, setAlumno] = useState(null);
  const [catalogo, setCatalogo] = useState(null);
  const [tipo, setTipo] = useState(null);
  const [nivel, setNivel] = useState('leve');
  const [item, setItem] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [hecho, setHecho] = useState(null);
  const [rev, setRev] = useState(0);

  useEffect(() => {
    if (!abierto) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return undefined;
    const texto = q.trim();
    if (texto.length < 2) {
      setAlumnos([]);
      return undefined;
    }
    let vivo = true;
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const { data } = await api.get('/docente/conducta/buscar', { params: { q: texto } });
        if (!vivo) return;
        setAlumnos(data.alumnos || []);
        setVigente(data.vigente !== false);
      } catch (e) {
        if (vivo) setAviso(e.response?.data?.error || 'No se pudo buscar');
      } finally {
        if (vivo) setBuscando(false);
      }
    }, 280);
    return () => { vivo = false; clearTimeout(t); };
  }, [q, abierto]);

  useEffect(() => {
    if (!abierto || catalogo) return;
    api.get('/docente/conducta/catalogo')
      .then(({ data }) => setCatalogo(data))
      .catch(() => setCatalogo({ grupos: [], vigente: false }));
  }, [abierto, catalogo]);

  const items = useMemo(() => {
    const grupos = catalogo?.grupos || [];
    if (tipo === 'presentacion' || tipo === 'puntualidad') {
      return grupos.find((g) => g.id === tipo)?.items || [];
    }
    if (tipo === 'incidencia') return grupos.find((g) => g.id === nivel)?.items || [];
    return [];
  }, [catalogo, tipo, nivel]);

  if (user?.tipo !== 'DOCENTE') return null;

  const cerrar = () => {
    setAbierto(false);
    setQ('');
    setAlumnos([]);
    setAlumno(null);
    setTipo(null);
    setItem(null);
    setHecho(null);
    setAviso('');
  };

  const elegirAlumno = (al) => {
    setAlumno(al);
    setTipo(null);
    setItem(null);
    setHecho(null);
    setAviso('');
  };

  const registrar = async () => {
    if (!alumno || !item || guardando) return;
    setGuardando(true);
    setAviso('');
    try {
      const { data } = await api.post('/docente/conducta/registrar', {
        matricula_id: alumno.matricula_id,
        item_id: item.id,
      });
      setHecho({ codigo: data.codigo || item.codigo, nota: data.nota });
      setItem(null);
      setRev((n) => n + 1);
    } catch (e) {
      setAviso(e.response?.data?.error || 'No se pudo registrar');
    } finally {
      setGuardando(false);
    }
  };

  const gradoTxt = alumno
    ? [alumno.grado ? `${alumno.grado}°` : '', alumno.seccion, alumno.nivel].filter(Boolean).join(' ')
    : '';

  return (
    <>
      <button
        type="button"
        className={`crf-fab crf-fab--p${pisos}`}
        onClick={() => setAbierto(true)}
        aria-label="Registrar conducta"
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M8 4.5h8.2A2.3 2.3 0 0 1 18.5 6.8v12.4l-2.2-1.3-2.1 1.3-2.2-1.3-2.1 1.3-2.2-1.3-2.1 1.3V6.8A2.3 2.3 0 0 1 8 4.5z" stroke="currentColor" strokeWidth="1.7" />
          <path d="M9 9.2h6M9 12.4h6M9 15.5h3.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>
      {abierto ? (
        <div className="crf-modal" onClick={cerrar} role="presentation">
          <div className="crf-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Registrar conducta">
            <header className="crf-head">
              <div>
                <p>Conducta del día</p>
                <h2>{alumno ? alumno.nombre : 'Buscar alumno'}</h2>
                {alumno ? <span>{gradoTxt}{alumno.dni ? ` · DNI ${alumno.dni}` : ''}</span> : <span>Nombre o DNI. Solo tus aulas.</span>}
              </div>
              <button type="button" className="crf-x" onClick={cerrar} aria-label="Cerrar">×</button>
            </header>

            {aviso ? <p className="crf-aviso">{aviso}</p> : null}
            {!vigente && !alumno ? (
              <p className="crf-aviso">Este bimestre todavía usa la conducta anterior. El acceso rápido entra en el bimestre 4.</p>
            ) : null}

            {!alumno ? (
              <div className="crf-buscar">
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Nombre o DNI"
                  enterKeyHint="search"
                />
                <div className="crf-lista">
                  {buscando ? <p className="crf-vacio">Buscando…</p> : null}
                  {!buscando && q.trim().length >= 2 && alumnos.length === 0 ? (
                    <p className="crf-vacio">No hay alumnos con ese dato en tus aulas.</p>
                  ) : null}
                  {alumnos.map((al) => (
                    <button type="button" key={al.matricula_id} className="crf-alumno" onClick={() => elegirAlumno(al)}>
                      <span className="crf-ava">{iniciales(al.nombre)}</span>
                      <span>
                        <strong>{al.nombre}</strong>
                        <small>
                          {[al.grado ? `${al.grado}°` : '', al.seccion, al.nivel].filter(Boolean).join(' ')}
                          {al.dni ? ` · ${al.dni}` : ''}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {alumno && !tipo && !hecho ? (
              <div className="crf-tipos">
                <p className="crf-seccion">Registros de este año</p>
                <ConductaRegistrosAlumno key={`${alumno.matricula_id}-${rev}`} matriculaId={alumno.matricula_id} compacto />
                {TIPOS.map((t) => (
                  <button key={t.id} type="button" className={`crf-tipo crf-tipo--${t.tono}`} onClick={() => { setTipo(t.id); setItem(null); }}>
                    <strong>{t.label}</strong>
                    <span>{t.texto}</span>
                  </button>
                ))}
                <button type="button" className="crf-link" onClick={() => setAlumno(null)}>Elegir otro alumno</button>
              </div>
            ) : null}

            {alumno && tipo && !hecho ? (
              <div className="crf-items">
                {tipo === 'incidencia' ? (
                  <div className="crf-niveles">
                    {[
                      ['leve', 'Leve', 'sky'],
                      ['grave', 'Grave', 'amber'],
                      ['muy_grave', 'Muy grave', 'rose'],
                    ].map(([id, label, tono]) => (
                      <button key={id} type="button" className={`crf-nivel crf-nivel--${tono}${nivel === id ? ' is-on' : ''}`} onClick={() => { setNivel(id); setItem(null); }}>
                        {label}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className={`crf-lista crf-lista--items crf-lista--${tipo === 'incidencia' ? nivel : tipo}`}>
                  {items.map((it) => (
                    <button
                      key={it.id}
                      type="button"
                      className={`crf-item crf-item--${tipo === 'incidencia' ? nivel : tipo}${item?.id === it.id ? ' is-on' : ''}`}
                      onClick={() => setItem(it)}
                    >
                      <b>{it.codigo}</b>
                      <span>{it.nombre}</span>
                      <em>−{Number(it.descuento).toFixed(2)}</em>
                    </button>
                  ))}
                  {items.length === 0 ? <p className="crf-vacio">No hay ítems en esta lista.</p> : null}
                </div>
                <div className="crf-acc">
                  <button type="button" className="crf-link" onClick={() => setTipo(null)}>Atrás</button>
                  <button type="button" className="crf-go" disabled={!item || guardando || !vigente} onClick={registrar}>
                    {guardando ? 'Guardando…' : 'Registrar'}
                  </button>
                </div>
              </div>
            ) : null}

            {hecho ? (
              <div className="crf-hecho">
                <strong>Listo</strong>
                <p>Se registró {hecho.codigo}. La nota del bimestre quedó en {hecho.nota}.</p>
                <div className="crf-acc">
                  <button type="button" className="crf-link" onClick={() => { setHecho(null); setTipo(null); }}>Otra falta</button>
                  <button type="button" className="crf-go" onClick={() => { setAlumno(null); setHecho(null); setTipo(null); setQ(''); }}>Otro alumno</button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
