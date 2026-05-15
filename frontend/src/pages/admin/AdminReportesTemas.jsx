import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import Swal from 'sweetalert2';
import './AdminReportesTemas.css';

const TYPE_ORDER = [
  'tema_interactivo',
  'sesion',
  'tarea',
  'video',
  'enlace',
  'examen_aula',
  'tema_legacy',
];

const TIPO_ETIQUETA = {
  tema_interactivo: 'Tema interactivo',
  sesion: 'Sesión',
  tarea: 'Tarea',
  video: 'Video',
  enlace: 'Enlace',
  examen_aula: 'Examen aula',
  tema_legacy: 'Tema',
};

function sortItems(list) {
  return [...(list || [])].sort((a, b) => {
    const ia = TYPE_ORDER.indexOf(a.tipo);
    const ib = TYPE_ORDER.indexOf(b.tipo);
    if (ia !== ib) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return (a.id || 0) - (b.id || 0);
  });
}

function abrirRecurso(item, aulaUrl) {
  if (item.url && String(item.url).trim() !== '') {
    const u = String(item.url).trim();
    if (/^https?:\/\//i.test(u)) {
      window.open(u, '_blank', 'noopener,noreferrer');
      return;
    }
    window.open(`${window.location.origin}${u.startsWith('/') ? u : `/${u}`}`, '_blank', 'noopener,noreferrer');
    return;
  }
  if (aulaUrl) {
    window.open(`${window.location.origin}${aulaUrl}`, '_blank', 'noopener,noreferrer');
    return;
  }
  Swal.fire({
    icon: 'info',
    title: 'Sin enlace',
    text: 'No hay archivo ni URL registrada para este ítem.',
  });
}

export default function AdminReportesTemas() {
  const [tab, setTab] = useState('grado_curso');
  const [ciclo, setCiclo] = useState(1);
  const [meta, setMeta] = useState(null);
  const [loadingMeta, setLoadingMeta] = useState(true);

  const [grupoKey, setGrupoKey] = useState('');
  const [cursoId, setCursoId] = useState('');
  const [personalGradoId, setPersonalGradoId] = useState('');
  const [personalDocenteId, setPersonalDocenteId] = useState('');

  const [cursos, setCursos] = useState([]);
  const [docentesGrado, setDocentesGrado] = useState([]);
  const [loadingCursos, setLoadingCursos] = useState(false);
  const [loadingDocGrado, setLoadingDocGrado] = useState(false);

  const [bloques, setBloques] = useState([]);
  const [loadingContenido, setLoadingContenido] = useState(false);
  const [ultimoReq, setUltimoReq] = useState(null);
  const ultimoReqRef = useRef(null);

  const grupoSel = useMemo(() => {
    if (!grupoKey || !meta?.grados) return null;
    return meta.grados.find((g) => g.key === grupoKey) || null;
  }, [grupoKey, meta]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingMeta(true);
        const { data } = await api.get('/admin/reportes/aula-temas/meta');
        if (cancelled) return;
        setMeta(data);
      } catch (e) {
        if (!cancelled) {
          setMeta(null);
          Swal.fire({
            icon: 'error',
            title: 'Error',
            text: e.response?.data?.error || e.message || 'No se pudo cargar el catálogo.',
          });
        }
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (tab !== 'grado_curso' || !grupoSel?.grupo_id || !meta?.anio) {
      setCursos([]);
      setCursoId('');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoadingCursos(true);
        const { data } = await api.get('/admin/reportes/aula-temas/cursos-por-grado', {
          params: { anio: meta.anio, grupo_id: grupoSel.grupo_id },
        });
        if (cancelled) return;
        setCursos(Array.isArray(data?.cursos) ? data.cursos : []);
        setCursoId('');
      } catch {
        if (!cancelled) {
          setCursos([]);
          setCursoId('');
        }
      } finally {
        if (!cancelled) setLoadingCursos(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, grupoSel, meta?.anio]);

  useEffect(() => {
    if (tab !== 'grado_docente' || !grupoSel?.grupo_id || !meta?.anio) {
      setDocentesGrado([]);
      setPersonalGradoId('');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoadingDocGrado(true);
        const { data } = await api.get('/admin/reportes/aula-temas/docentes-por-grado', {
          params: { anio: meta.anio, grupo_id: grupoSel.grupo_id },
        });
        if (cancelled) return;
        setDocentesGrado(Array.isArray(data?.docentes) ? data.docentes : []);
        setPersonalGradoId('');
      } catch {
        if (!cancelled) {
          setDocentesGrado([]);
          setPersonalGradoId('');
        }
      } finally {
        if (!cancelled) setLoadingDocGrado(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, grupoSel, meta?.anio]);

  const ejecutarBusqueda = useCallback(async () => {
    if (!meta?.anio) return;

    let modo;
    let params = { ciclo, anio: meta.anio };

    if (tab === 'grado_curso') {
      modo = 'grado_curso';
      if (!grupoSel?.grupo_id) {
        Swal.fire({
          icon: 'warning',
          title: 'Falta el grupo',
          text: 'Seleccione nivel · grado · sección (cada salón es un grupo distinto).',
        });
        return;
      }
      const cid = parseInt(cursoId, 10);
      if (!Number.isFinite(cid)) {
        Swal.fire({ icon: 'warning', title: 'Falta el curso', text: 'Seleccione un curso.' });
        return;
      }
      params = {
        ...params,
        modo,
        grupo_id: grupoSel.grupo_id,
        curso_id: cid,
      };
    } else if (tab === 'grado_docente') {
      modo = 'grado_docente';
      if (!grupoSel?.grupo_id) {
        Swal.fire({
          icon: 'warning',
          title: 'Falta el grupo',
          text: 'Seleccione nivel · grado · sección.',
        });
        return;
      }
      const pid = parseInt(personalGradoId, 10);
      if (!Number.isFinite(pid)) {
        Swal.fire({ icon: 'warning', title: 'Falta el docente', text: 'Seleccione un docente.' });
        return;
      }
      params = {
        ...params,
        modo,
        grupo_id: grupoSel.grupo_id,
        personal_id: pid,
      };
    } else {
      modo = 'docente';
      const pid = parseInt(personalDocenteId, 10);
      if (!Number.isFinite(pid)) {
        Swal.fire({ icon: 'warning', title: 'Falta el docente', text: 'Seleccione un docente.' });
        return;
      }
      params = { ...params, modo, personal_id: pid };
    }

    setUltimoReq(params);
    ultimoReqRef.current = params;
    setLoadingContenido(true);
    try {
      const { data } = await api.get('/admin/reportes/aula-temas/contenido', { params });
      setBloques(Array.isArray(data?.bloques) ? data.bloques : []);
    } catch (e) {
      setBloques([]);
      Swal.fire({
        icon: 'error',
        title: 'Error al buscar',
        text: e.response?.data?.error || e.message || 'Intente de nuevo.',
      });
    } finally {
      setLoadingContenido(false);
    }
  }, [meta, tab, ciclo, grupoSel, cursoId, personalGradoId, personalDocenteId]);

  const recargarConCiclo = useCallback(
    async (cicloVal) => {
      const p = ultimoReqRef.current;
      if (!p || meta?.anio == null) return;
      const { ciclo: _c, anio: _y, ...rest } = p;
      setLoadingContenido(true);
      try {
        const { data } = await api.get('/admin/reportes/aula-temas/contenido', {
          params: { ...rest, ciclo: cicloVal, anio: meta.anio },
        });
        setBloques(Array.isArray(data?.bloques) ? data.bloques : []);
        ultimoReqRef.current = { ...ultimoReqRef.current, ciclo: cicloVal, anio: meta.anio };
        setUltimoReq((prev) => (prev ? { ...prev, ciclo: cicloVal, anio: meta.anio } : prev));
      } catch {
        setBloques([]);
      } finally {
        setLoadingContenido(false);
      }
    },
    [meta?.anio]
  );

  const onElegirCiclo = (n) => {
    setCiclo(n);
    if (ultimoReqRef.current) recargarConCiclo(n);
  };

  const totalItems = useMemo(
    () => bloques.reduce((s, b) => s + (b.items?.length || 0), 0),
    [bloques]
  );

  if (loadingMeta && !meta) {
    return (
      <DashboardLayout>
        <div className="art-root">
          <div className="art-loading">Cargando…</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="art-root">
        <div className="art-inner">
          <header className="art-hero">
            <h1>Reporte · Temas del aula virtual</h1>
            <p>
              Consulta centralizada de temas interactivos, sesiones, tareas, videos, enlaces y exámenes del aula,
              filtrados por grupo (nivel · grado · sección), curso y/o docente. Cada salón (A, B, …) es un grupo distinto.
              El bimestre aplica a los contenidos que lo usan en base de datos; los temas históricos sin bimestre siguen listándose aparte.
            </p>
          </header>

          <div className="art-toolbar">
            <span>
              <label htmlFor="bim-art">Bimestre</label>
            </span>
            <div className="art-ciclos" id="bim-art">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`art-ciclo-btn ${ciclo === n ? 'active' : ''}`}
                  onClick={() => onElegirCiclo(n)}
                >
                  {n}° bim.
                </button>
              ))}
            </div>
            {meta?.anio != null && (
              <span className="art-anio">
                Año lectivo <strong style={{ color: '#e2e8f0' }}>{meta.anio}</strong>
              </span>
            )}
          </div>

          <div className="art-tabs">
            <button
              type="button"
              className={`art-tab ${tab === 'grado_curso' ? 'active' : ''}`}
              onClick={() => setTab('grado_curso')}
            >
              Grado × Curso
            </button>
            <button
              type="button"
              className={`art-tab ${tab === 'grado_docente' ? 'active' : ''}`}
              onClick={() => setTab('grado_docente')}
            >
              Grado × Docente
            </button>
            <button
              type="button"
              className={`art-tab ${tab === 'docente' ? 'active' : ''}`}
              onClick={() => setTab('docente')}
            >
              Por docente
            </button>
          </div>

          <div className="art-panel">
            {tab === 'grado_curso' && (
              <div className="art-fila-filtros">
                <div className="art-field art-field--grupo">
                  <label htmlFor="grupo-art">Grupo (nivel · grado · sección)</label>
                  <select
                    id="grupo-art"
                    value={grupoKey}
                    onChange={(e) => setGrupoKey(e.target.value)}
                  >
                    <option value="">— Seleccionar —</option>
                    {(meta?.grados || []).map((g) => (
                      <option key={g.key} value={g.key}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="art-field">
                  <label htmlFor="curso-art">
                    Curso ({loadingCursos ? 'cargando…' : `${cursos.length} opciones`})
                  </label>
                  <select
                    id="curso-art"
                    value={cursoId}
                    onChange={(e) => setCursoId(e.target.value)}
                    disabled={!grupoSel || loadingCursos}
                  >
                    <option value="">— Curso —</option>
                    {cursos.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="art-acciones">
                  <button
                    type="button"
                    className="art-btn-primary"
                    onClick={ejecutarBusqueda}
                    disabled={loadingContenido}
                  >
                    Buscar
                  </button>
                </div>
              </div>
            )}

            {tab === 'grado_docente' && (
              <div className="art-fila-filtros">
                <div className="art-field art-field--grupo">
                  <label htmlFor="grupo-doc-art">Grupo (nivel · grado · sección)</label>
                  <select
                    id="grupo-doc-art"
                    value={grupoKey}
                    onChange={(e) => setGrupoKey(e.target.value)}
                  >
                    <option value="">— Seleccionar —</option>
                    {(meta?.grados || []).map((g) => (
                      <option key={g.key} value={g.key}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="art-field">
                  <label htmlFor="doc-grado-art">
                    Docente ({loadingDocGrado ? 'cargando…' : `${docentesGrado.length} en este grupo`})
                  </label>
                  <select
                    id="doc-grado-art"
                    value={personalGradoId}
                    onChange={(e) => setPersonalGradoId(e.target.value)}
                    disabled={!grupoSel || loadingDocGrado}
                  >
                    <option value="">— Docente —</option>
                    {docentesGrado.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="art-acciones">
                  <button
                    type="button"
                    className="art-btn-primary"
                    onClick={ejecutarBusqueda}
                    disabled={loadingContenido}
                  >
                    Buscar
                  </button>
                </div>
              </div>
            )}

            {tab === 'docente' && (
              <div className="art-fila-filtros">
                <div className="art-field art-field--grow">
                  <label htmlFor="doc-todos-art">Docente (todos)</label>
                  <select
                    id="doc-todos-art"
                    value={personalDocenteId}
                    onChange={(e) => setPersonalDocenteId(e.target.value)}
                  >
                    <option value="">— Docente —</option>
                    {(meta?.docentes || []).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="art-acciones">
                  <button
                    type="button"
                    className="art-btn-primary"
                    onClick={ejecutarBusqueda}
                    disabled={loadingContenido}
                  >
                    Buscar
                  </button>
                </div>
              </div>
            )}

            <p className="art-hint">
              Tras una búsqueda, puedes cambiar el bimestre arriba y la lista se actualizará automáticamente.
            </p>

            {loadingContenido && <div className="art-loading">Cargando contenido…</div>}

            {!loadingContenido && bloques.length > 0 && (
              <>
                <div className="art-stats">
                  <span className="art-stat">
                    Asignaturas: <strong>{bloques.length}</strong>
                  </span>
                  <span className="art-stat">
                    Ítems totales: <strong>{totalItems}</strong>
                  </span>
                  <span className="art-stat">
                    Bimestre mostrado: <strong>{ciclo}</strong>
                  </span>
                </div>
                {bloques.map((b) => (
                  <article key={b.asignatura_id} className="art-bloque">
                    <div className="art-bloque-head">
                      <h3>
                        {b.curso_nombre || 'Curso'}{' '}
                        <span style={{ fontWeight: 500, opacity: 0.9 }}>
                          · {b.nivel_nombre || ''} {b.grado != null ? `${b.grado}°` : ''} — Secc. {b.seccion || '—'}
                        </span>
                      </h3>
                      <p className="art-bloque-meta">Docente: {b.docente_nombre || '—'}</p>
                    </div>
                    {(!b.items || b.items.length === 0) && (
                      <div className="art-empty">No hay ítems registrados para este bimestre.</div>
                    )}
                    {b.items?.length > 0 && (
                      <ul className="art-list">
                        {sortItems(b.items).map((it) => (
                          <li key={`${it.tipo}-${it.id}`} className="art-item">
                            <span className={`art-badge art-badge-${it.tipo}`}>
                              {TIPO_ETIQUETA[it.tipo] || it.tipo}
                            </span>
                            <span className="art-item-titulo">{it.titulo || '—'}</span>
                            {it.tipo === 'tarea' && it.archivos?.length > 1 && (
                              <span className="art-stat" style={{ border: 'none', padding: '0.2rem 0.5rem' }}>
                                +{it.archivos.length - 1} archivo(s)
                              </span>
                            )}
                            {it.tipo === 'examen_aula' && it.estado && (
                              <span className="art-stat" style={{ border: 'none', padding: '0.2rem 0.5rem' }}>
                                {it.estado}
                              </span>
                            )}
                            <button
                              type="button"
                              className="art-btn-ver"
                              onClick={() => abrirRecurso(it, b.aula_url)}
                            >
                              Ver
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                ))}
              </>
            )}

            {!loadingContenido && ultimoReq && bloques.length === 0 && (
              <div className="art-empty">No se encontraron asignaturas o no hay contenido para los filtros elegidos.</div>
            )}

            {!loadingContenido && !ultimoReq && (
              <div className="art-empty">Elige filtros y pulsa Buscar para ver el contenido del aula virtual.</div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
