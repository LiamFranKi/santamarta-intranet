import React, { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';

function iniciales(nombre) {
  return String(nombre || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('') || 'P';
}

export default function ReunionPersonalPicker({
  abierto,
  invitadosIds,
  onCerrar,
  onAgregar,
  modo = 'multiple',
  titulo,
  kicker,
  descripcion,
}) {
  const uno = modo === 'uno';
  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState('');
  const [marcados, setMarcados] = useState(() => new Set());

  const yaConvocados = useMemo(
    () => new Set((invitadosIds || []).map((id) => Number(id))),
    [invitadosIds]
  );

  useEffect(() => {
    if (!abierto) return undefined;
    let cancel = false;
    setFiltro('');
    setMarcados(new Set());
    setCargando(true);
    setError('');
    (async () => {
      try {
        const { data } = await api.get('/reuniones/personal');
        if (cancel) return;
        setLista(data.personal || []);
      } catch (e) {
        if (!cancel) setError(e.response?.data?.error || 'No se pudo cargar el personal.');
      } finally {
        if (!cancel) setCargando(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [abierto]);

  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return lista;
    return lista.filter((p) => {
      const hay = `${p.nombre_completo} ${p.info_adicional || ''} ${p.tipo || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [lista, filtro]);

  const visiblesNuevos = visibles.filter((p) => !yaConvocados.has(Number(p.usuario_id)));
  const todosVisibles = visiblesNuevos.length > 0 && visiblesNuevos.every((p) => marcados.has(Number(p.usuario_id)));
  const nMarcados = [...marcados].filter((id) => !yaConvocados.has(id)).length;

  const toggle = (id) => {
    const uid = Number(id);
    if (yaConvocados.has(uid)) return;
    setMarcados((prev) => {
      if (uno) return new Set([uid]);
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const toggleTodos = () => {
    setMarcados((prev) => {
      const next = new Set(prev);
      if (todosVisibles) {
        visiblesNuevos.forEach((p) => next.delete(Number(p.usuario_id)));
      } else {
        visiblesNuevos.forEach((p) => next.add(Number(p.usuario_id)));
      }
      return next;
    });
  };

  const confirmar = () => {
    const ids = new Set(yaConvocados);
    const nuevos = lista.filter((p) => {
      const uid = Number(p.usuario_id);
      if (!marcados.has(uid) || ids.has(uid)) return false;
      ids.add(uid);
      return true;
    });
    if (nuevos.length) onAgregar(nuevos);
    onCerrar();
  };

  if (!abierto) return null;

  return (
    <div className="re-modal-bg" role="dialog" aria-label={titulo || 'Elegir personal'} onClick={onCerrar}>
      <div className="re-modal re-personal-modal" onClick={(e) => e.stopPropagation()}>
        <header className="re-personal-head">
          <p className="re-personal-kicker">{kicker || (uno ? 'Anfitrión' : 'Convocatoria')}</p>
          <h3>{titulo || 'Personal del colegio'}</h3>
          <p className="re-hint">
            {descripcion ||
              (uno
                ? 'Elige a un docente o personal para que abra la reunión y redacte el acta.'
                : 'Marca a quienes quieres en la reunión. Quienes ya están convocados aparecen deshabilitados.')}
          </p>
        </header>

        <div className="re-personal-toolbar">
          <input
            className="re-buscador-input"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Filtrar por nombre o cargo…"
            autoFocus
          />
          {uno ? null : (
            <label className={`re-personal-todos ${visiblesNuevos.length === 0 ? 'is-disabled' : ''}`}>
              <input
                type="checkbox"
                checked={todosVisibles}
                disabled={visiblesNuevos.length === 0}
                onChange={toggleTodos}
              />
              Todos
            </label>
          )}
        </div>

        <div className="re-personal-list">
          {cargando ? <p className="re-empty">Cargando personal…</p> : null}
          {error ? <p className="re-empty">{error}</p> : null}
          {!cargando && !error && visibles.length === 0 ? (
            <p className="re-empty">No hay personal para mostrar.</p>
          ) : null}
          {visibles.map((p) => {
            const uid = Number(p.usuario_id);
            const ya = yaConvocados.has(uid);
            return (
              <label key={uid} className={`re-personal-row ${ya ? 'is-ya' : ''} ${marcados.has(uid) ? 'is-on' : ''}`}>
                <input
                  type="checkbox"
                  checked={ya || marcados.has(uid)}
                  disabled={ya}
                  onChange={() => toggle(uid)}
                />
                <span className="re-personal-avatar" aria-hidden>{iniciales(p.nombre_completo)}</span>
                <span className="re-personal-meta">
                  <strong>{p.nombre_completo}</strong>
                  <small>
                    {ya ? 'Ya convocado' : [p.info_adicional, p.tipo].filter(Boolean).join(' · ')}
                  </small>
                </span>
              </label>
            );
          })}
        </div>

        <footer className="re-personal-foot">
          <button type="button" className="re-btn re-btn-ghost" style={{ background: '#e2e8f0', color: '#0f172a' }} onClick={onCerrar}>
            Cancelar
          </button>
          <button type="button" className="re-btn re-btn-solid" disabled={nMarcados === 0} onClick={confirmar}>
            {uno ? 'Elegir' : `Agregar${nMarcados > 0 ? ` (${nMarcados})` : ''}`}
          </button>
        </footer>
      </div>
    </div>
  );
}
