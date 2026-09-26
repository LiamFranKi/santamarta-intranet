import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { DUA_OPCIONES, DUA_CAT_LABEL, emptyDua } from '../../utils/cnebDua';

export default function CnebInclusivoPanel({ apiBase, grupoId, dua, onChangeDua }) {
  const [data, setData] = useState(null);
  const esDocente = String(apiBase || '').startsWith('/docente');
  const valor = dua && typeof dua === 'object' ? dua : emptyDua();

  useEffect(() => {
    if (!grupoId) {
      setData(null);
      return undefined;
    }
    let alive = true;
    api
      .get(`${apiBase}/aula-piar`, { params: { grupo_id: grupoId } })
      .then(({ data: d }) => {
        if (alive) setData(d);
      })
      .catch(() => {
        if (alive) setData({ estudiantes: [] });
      });
    return () => {
      alive = false;
    };
  }, [apiBase, grupoId]);

  const toggle = (cat, key) => {
    const arr = valor[cat] || [];
    const next = arr.includes(key) ? arr.filter((k) => k !== key) : [...arr, key];
    onChangeDua({ ...valor, [cat]: next });
  };

  const textoProc = (e) => {
    const list = valor.procedimientos || [];
    return (
      list.find(
        (p) => Number(p.piar_id) === Number(e.id) || Number(p.alumno_id) === Number(e.alumno_id)
      )?.texto || ''
    );
  };

  const setProc = (e, texto) => {
    const rest = (valor.procedimientos || []).filter(
      (p) => Number(p.piar_id) !== Number(e.id) && Number(p.alumno_id) !== Number(e.alumno_id)
    );
    const t = String(texto || '').slice(0, 1200);
    const next = t.trim()
      ? [...rest, { piar_id: e.id, alumno_id: e.alumno_id, nombre: e.nombre, texto: t }]
      : rest;
    onChangeDua({ ...valor, procedimientos: next });
  };

  const n = data?.estudiantes?.length || 0;

  return (
    <section className="cneb-dua-panel">
      <header className="cneb-dua-panel__head">
        <h3>Inclusión en esta sesión</h3>
        <p>
          Estas opciones son para todo el aula. Si las marca antes de generar, la IA las usa tal cual.
          Si no marca ninguna, la IA igual arma la inclusión del grupo.
        </p>
      </header>

      {!grupoId ? (
        <p className="cneb-muted">Elija el aula para ver si hay un PIAR publicado.</p>
      ) : n > 0 ? (
        <div className="cneb-dua-piar-list">
          <strong>
            {n} estudiante{n === 1 ? '' : 's'} con PIAR publicado — procedimiento de hoy
          </strong>
          <ul>
            {(data.estudiantes || []).map((e) => (
              <li key={e.id}>
                <span>{e.nombre}</span>
                <span className="cneb-piar-badge">Apoyos</span>
                <div className="cneb-dua-chips">
                  {(e.apoyos || []).map((a) => (
                    <span key={a} className="cneb-dua-chip">
                      {a}
                    </span>
                  ))}
                </div>
                <label className="cneb-dua-proc">
                  <span>Procedimiento de hoy (DUA / ajustes de esta sesión)</span>
                  <textarea
                    rows={3}
                    value={textoProc(e)}
                    onChange={(ev) => setProc(e, ev.target.value)}
                    placeholder="Ej. Consiga oral paso a paso, modelo primero y más tiempo para la evidencia. Mismo cotejo que el grupo."
                  />
                </label>
                {esDocente ? (
                  <Link className="cneb-dua-link" to={`/docente/psicologia/piar/${e.id}`}>
                    Ver plan
                  </Link>
                ) : (
                  <Link className="cneb-dua-link" to={`/admin/psicologia/alumno/${e.alumno_id}?tab=piar`}>
                    Ver plan
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="cneb-muted">En esta aula no hay un PIAR publicado. Igual puede marcar DUA para todo el grupo.</p>
      )}

      {Object.entries(DUA_OPCIONES).map(([cat, items]) => (
        <div key={cat} className="cneb-dua-cat">
          <h4>{DUA_CAT_LABEL[cat]}</h4>
          <div className="cneb-dua-tiles">
            {items.map((it) => {
              const on = (valor[cat] || []).includes(it.key);
              return (
                <button
                  key={it.key}
                  type="button"
                  className={`cneb-dua-tile${on ? ' is-on' : ''}`}
                  onClick={() => toggle(cat, it.key)}
                >
                  {it.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <label className="cneb-select-wrap cneb-full">
        <span>Nota de evidencia (qué se adaptó hoy para todo el grupo)</span>
        <textarea
          rows={2}
          value={valor.nota || ''}
          onChange={(e) => onChangeDua({ ...valor, nota: e.target.value })}
          placeholder="Ej. Consiga oral y material visual para todo el grupo."
        />
      </label>
    </section>
  );
}
