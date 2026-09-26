import React, { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import AdminCnebAuxiliar from './AdminCnebAuxiliar';
import AdminCnebCorte from './AdminCnebCorte';
import AdminCnebConsolidado from './AdminCnebConsolidado';
import {
  aulasDe,
  claveCurso,
  cursosDe,
  etiquetaAula,
  etiquetaGrado,
  gradosDe,
} from './cnebElegirAula';

function bimestreDeSesion(s) {
  const b = Number(s?.bimestre);
  return b >= 1 && b <= 4 ? b : 4;
}

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
  const [gradoSel, setGradoSel] = useState('');
  const [aulaSel, setAulaSel] = useState('');
  const [cursoSel, setCursoSel] = useState('');
  const [sesionId, setSesionId] = useState(sesionInicial ? String(sesionInicial) : '');

  useEffect(() => {
    let alive = true;
    setGradoSel('');
    setAulaSel('');
    setCursoSel('');
    setSesionId(sesionInicial ? String(sesionInicial) : '');
    (async () => {
      try {
        const { data } = await api.get(`${apiBase}/sesiones`, { params: { nivel } });
        if (!alive) return;
        setSesiones(data.sesiones || []);
      } catch {
        if (alive) setSesiones([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [apiBase, nivel, sesionInicial]);

  const grados = useMemo(() => gradosDe(grupos), [grupos]);
  const aulas = useMemo(() => aulasDe(grupos, gradoSel), [grupos, gradoSel]);
  const sesionesAula = useMemo(
    () =>
      sesiones.filter(
        (s) =>
          String(s.grupo_id) === String(aulaSel) && bimestreDeSesion(s) === Number(bimestreDefault)
      ),
    [sesiones, aulaSel, bimestreDefault]
  );
  const cursos = useMemo(() => cursosDe(sesionesAula), [sesionesAula]);
  const sesionesCurso = useMemo(
    () => sesionesAula.filter((s) => claveCurso(s) === cursoSel),
    [sesionesAula, cursoSel]
  );
  const sesionUna = sesionId && sesionId !== 'todas' ? sesionId : '';
  const listo = Boolean(gradoSel && aulaSel && cursoSel && sesionId);
  const aula = aulas.find((g) => String(g.id) === String(aulaSel));

  const onGrado = (v) => {
    setGradoSel(v);
    setAulaSel('');
    setCursoSel('');
    setSesionId('');
  };
  const onAula = (v) => {
    setAulaSel(v);
    setCursoSel('');
    setSesionId('');
  };
  const onCurso = (v) => {
    setCursoSel(v);
    setSesionId('');
  };

  return (
    <>
      <div className="cneb-subtabs" role="tablist" aria-label="Registro CNEB">
        <button
          type="button"
          className={modo === 'auxiliar' ? 'is-active' : ''}
          onClick={() => {
            setModo('auxiliar');
            if (sesionId === 'todas') setSesionId('');
          }}
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
        <div className="cneb-elige">
          <label className="cneb-select-wrap">
            <span>Grado</span>
            <select value={gradoSel} onChange={(e) => onGrado(e.target.value)}>
              <option value="">Elegir grado…</option>
              {grados.map((g) => (
                <option key={g} value={g}>
                  {etiquetaGrado(nivel, g)}
                </option>
              ))}
            </select>
          </label>
          <label className="cneb-select-wrap">
            <span>Aula</span>
            <select value={aulaSel} onChange={(e) => onAula(e.target.value)} disabled={!gradoSel}>
              <option value="">Elegir aula…</option>
              {aulas.map((g) => (
                <option key={g.id} value={g.id}>
                  {etiquetaAula(g)}
                </option>
              ))}
            </select>
          </label>
          <label className="cneb-select-wrap">
            <span>Curso</span>
            <select value={cursoSel} onChange={(e) => onCurso(e.target.value)} disabled={!aulaSel}>
              <option value="">Elegir curso…</option>
              {cursos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="cneb-select-wrap">
            <span>Sesión</span>
            <select value={sesionId} onChange={(e) => setSesionId(e.target.value)} disabled={!cursoSel}>
              <option value="">Elegir sesión…</option>
              {modo !== 'auxiliar' ? <option value="todas">Todas las sesiones de este curso</option> : null}
              {sesionesCurso.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.titulo}
                  {s.fecha_sesion ? ` · ${String(s.fecha_sesion).slice(0, 10)}` : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
        {aulaSel && cursos.length === 0 ? (
          <p className="cneb-muted">En esta aula todavía no hay sesiones de este bimestre.</p>
        ) : !listo ? (
          <p className="cneb-muted">
            Elija el grado, el aula, el curso y la sesión de {etiquetaNivel ? etiquetaNivel(nivel) : nivel}. Ahí
            aparece el registro de ese grupo.
          </p>
        ) : (
          <p className="cneb-muted">
            {etiquetaNivel ? etiquetaNivel(nivel) : nivel}
            {aula ? ` · ${etiquetaAula(aula)}` : ''}
            {cursos.find((c) => c.id === cursoSel)?.nombre ? ` · ${cursos.find((c) => c.id === cursoSel).nombre}` : ''}
          </p>
        )}
      </section>
      ) : null}
      {modo === 'auxiliar' && sesionUna ? <AdminCnebAuxiliar apiBase={apiBase} sesionId={sesionUna} /> : null}
      {modo === 'corte' ? (
        <AdminCnebCorte
          apiBase={apiBase}
          nivel={nivel}
          grupos={grupos}
          sesiones={sesiones}
          bimestreDefault={bimestreDefault}
          etiquetaNivel={etiquetaNivel}
        />
      ) : null}
      {modo === 'consolidado' ? (
        <AdminCnebConsolidado
          apiBase={apiBase}
          nivel={nivel}
          grupos={grupos}
          sesiones={sesiones}
          bimestreDefault={bimestreDefault}
          etiquetaNivel={etiquetaNivel}
        />
      ) : null}
    </>
  );
}
