import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import AdminCnebAuxiliar from './AdminCnebAuxiliar';
import AdminCnebCorte from './AdminCnebCorte';
import AdminCnebConsolidado from './AdminCnebConsolidado';

export default function AdminCnebRegistro({
  apiBase = '/admin/cneb',
  nivel,
  grupos = [],
  bimestreDefault = 4,
  etiquetaNivel,
  sesionInicial = '',
}) {
  const [modo, setModo] = useState('auxiliar');
  const [sesiones, setSesiones] = useState([]);
  const [sesionId, setSesionId] = useState(sesionInicial ? String(sesionInicial) : '');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get(`${apiBase}/sesiones`, { params: { nivel } });
        if (!alive) return;
        const list = data.sesiones || [];
        setSesiones(list);
        setSesionId((prev) => {
          if (sesionInicial) return String(sesionInicial);
          if (prev && list.some((s) => String(s.id) === String(prev))) return prev;
          return list[0] ? String(list[0].id) : '';
        });
      } catch {
        if (alive) setSesiones([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [apiBase, nivel, sesionInicial]);

  return (
    <>
      <div className="cneb-subtabs" role="tablist" aria-label="Registro CNEB">
        <button
          type="button"
          className={modo === 'auxiliar' ? 'is-active' : ''}
          onClick={() => setModo('auxiliar')}
        >
          Lista de cotejo
        </button>
        <button
          type="button"
          className={modo === 'corte' ? 'is-active' : ''}
          onClick={() => setModo('corte')}
        >
          Corte AD/A/B/C (áreas oficiales)
        </button>
        <button
          type="button"
          className={modo === 'consolidado' ? 'is-active' : ''}
          onClick={() => setModo('consolidado')}
        >
          Consolidado
        </button>
      </div>
      {modo === 'auxiliar' ? (
        <section className="cneb-panel" style={{ marginBottom: '0.7rem' }}>
          <label className="cneb-select-wrap">
            <span>Sesión</span>
            <select value={sesionId} onChange={(e) => setSesionId(e.target.value)}>
              <option value="">Elegir sesión…</option>
              {sesiones.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.titulo}
                  {s.grado != null ? ` · ${s.grado} ${s.seccion || ''}`.trim() : ''}
                </option>
              ))}
            </select>
          </label>
        </section>
      ) : null}
      {modo === 'auxiliar' && sesionId ? (
        <AdminCnebAuxiliar apiBase={apiBase} sesionId={sesionId} />
      ) : null}
      {modo === 'auxiliar' && !sesionId ? (
        <div className="cneb-empty">Cree una sesión con cotejo y luego márquela aquí alumno por alumno.</div>
      ) : null}
      {modo === 'corte' ? (
        <AdminCnebCorte
          apiBase={apiBase}
          nivel={nivel}
          grupos={grupos}
          bimestreDefault={bimestreDefault}
          etiquetaNivel={etiquetaNivel}
        />
      ) : null}
      {modo === 'consolidado' ? (
        <AdminCnebConsolidado
          apiBase={apiBase}
          nivel={nivel}
          grupos={grupos}
          bimestreDefault={bimestreDefault}
          etiquetaNivel={etiquetaNivel}
        />
      ) : null}
    </>
  );
}
