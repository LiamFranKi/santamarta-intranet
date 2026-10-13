import React, { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const PASOS = [
  { id: 'incidencia', label: 'Incidencia' },
  { id: 'presentacion', label: 'Presentación' },
  { id: 'puntualidad', label: 'Puntualidad' },
];

export default function ConductaRegistroPanel({ onRegistrar, guardando, children }) {
  const [estado, setEstado] = useState(null);
  const [paso, setPaso] = useState('incidencia');
  const [nivel, setNivel] = useState('leve');
  const [itemId, setItemId] = useState(null);

  useEffect(() => {
    let vivo = true;
    api.get('/docente/conducta/catalogo')
      .then(({ data }) => { if (vivo) setEstado(data); })
      .catch(() => { if (vivo) setEstado({ vigente: false, grupos: [] }); });
    return () => { vivo = false; };
  }, []);

  const items = useMemo(() => {
    const grupos = estado?.grupos || [];
    if (paso === 'presentacion') return grupos.find((g) => g.id === 'presentacion')?.items || [];
    if (paso === 'puntualidad') return grupos.find((g) => g.id === 'puntualidad')?.items || [];
    return grupos.find((g) => g.id === nivel)?.items || [];
  }, [estado, paso, nivel]);

  if (!estado) return <div className="cond-reg-loading">Cargando faltas…</div>;
  if (!estado.vigente) return children;

  const enviar = (e) => {
    e.preventDefault();
    if (!itemId || guardando) return;
    onRegistrar(itemId);
  };

  return (
    <form onSubmit={enviar} className="cond-reg">
      <p className="cond-reg-nota">
        Elige la falta. El puntaje ya está definido y se resta directo a la conducta.
      </p>
      <div className="cond-reg-pasos">
        {PASOS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={paso === p.id ? 'is-on' : ''}
            onClick={() => { setPaso(p.id); setItemId(null); }}
          >
            {p.label}
          </button>
        ))}
      </div>
      {paso === 'incidencia' ? (
        <div className="cond-reg-pasos cond-reg-pasos--sub">
          {[
            ['leve', 'Leve'],
            ['grave', 'Grave'],
            ['muy_grave', 'Muy grave'],
          ].map(([id, label]) => (
            <button key={id} type="button" className={nivel === id ? 'is-on' : ''} onClick={() => { setNivel(id); setItemId(null); }}>
              {label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="cond-reg-lista">
        {items.map((it) => (
          <label key={it.id} className={Number(itemId) === Number(it.id) ? 'is-on' : ''}>
            <input
              type="radio"
              name="conducta-item"
              checked={Number(itemId) === Number(it.id)}
              onChange={() => setItemId(it.id)}
            />
            <span className="cond-reg-cod">{it.codigo}</span>
            <span className="cond-reg-nom">{it.nombre}</span>
            <strong>−{Number(it.descuento).toFixed(2)}</strong>
          </label>
        ))}
        {items.length === 0 ? <p>No hay ítems activos en esta lista.</p> : null}
      </div>
      <button type="submit" className="btn-registrar-incidencia" disabled={!itemId || guardando}>
        {guardando ? 'Guardando...' : 'Registrar falta'}
      </button>
      <style>{`
        .cond-reg { display: flex; flex-direction: column; gap: 0.7rem; }
        .cond-reg-nota { margin: 0; color: #334155; font-size: 0.92rem; }
        .cond-reg-pasos { display: flex; flex-wrap: wrap; gap: 0.4rem; }
        .cond-reg-pasos button {
          border: 1px solid #cbd5e1; background: #fff; border-radius: 999px;
          padding: 0.35rem 0.75rem; cursor: pointer; font-weight: 700; color: #334155;
        }
        .cond-reg-pasos button.is-on { background: #1d4ed8; color: #fff; border-color: #1d4ed8; }
        .cond-reg-lista { display: flex; flex-direction: column; gap: 0.4rem; max-height: 280px; overflow: auto; }
        .cond-reg-lista label {
          display: grid; grid-template-columns: auto auto 1fr auto; gap: 0.5rem; align-items: start;
          border: 1px solid #e2e8f0; border-radius: 12px; padding: 0.55rem 0.7rem; cursor: pointer;
        }
        .cond-reg-lista label.is-on { border-color: #2563eb; background: #eff6ff; }
        .cond-reg-cod { font-weight: 800; color: #1e3a8a; }
        .cond-reg-nom { color: #0f172a; }
        .cond-reg-loading { color: #64748b; }
      `}</style>
    </form>
  );
}
