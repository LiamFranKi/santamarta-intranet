import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import Swal from 'sweetalert2';
import AdminCnebSesiones from './AdminCnebSesiones';
import AdminCnebRegistro from './AdminCnebRegistro';
import AdminCnebPrompt from './AdminCnebPrompt';
import './AdminCnebPiloto.css';

const NIVELES_UI = [
  { id: 'INICIAL', label: 'Inicial', hint: 'Ciclo II · 3, 4 y 5 años' },
  { id: 'PRIMARIA', label: 'Primaria', hint: '1.º a 6.º' },
  { id: 'SECUNDARIA', label: 'Secundaria', hint: '1.º a 5.º' },
];

const TABS = [
  { id: 'uso', label: 'Uso en este año', hint: 'Qué nivel prueba el bimestre' },
  { id: 'sesiones', label: 'Sesiones', hint: 'Inicio, desarrollo y cierre' },
  { id: 'registro', label: 'Registro', hint: 'Cotejo y corte AD/A/B/C' },
  { id: 'catalogo', label: 'Catálogo CNEB', hint: 'Áreas y competencias oficiales' },
  { id: 'mapeo', label: 'Cursos del colegio', hint: 'Principal o complementario' },
  { id: 'prompt', label: 'Prompt IA', hint: 'Texto que usa Gemini' },
];

const AREA_TONE = {
  PS: 'rose',
  DPCC: 'rose',
  CS: 'amber',
  REL: 'amber',
  PSI: 'teal',
  EF: 'teal',
  ARTE: 'sky',
  COM: 'sky',
  ING: 'indigo',
  MAT: 'indigo',
  CYT: 'lime',
  EPT: 'lime',
  TIC: 'slate',
  AUTO: 'violet',
};

function IconLibro() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function etiquetaNivel(id) {
  return NIVELES_UI.find((n) => n.id === id)?.label || id;
}

export default function AdminCnebPiloto() {
  const { user } = useAuth();
  const [nivel, setNivel] = useState('INICIAL');
  const [tab, setTab] = useState('sesiones');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingUso, setSavingUso] = useState(false);
  const [resumen, setResumen] = useState(null);
  const [usoDraft, setUsoDraft] = useState({ bimestre: 4, niveles: { INICIAL: true, PRIMARIA: false, SECUNDARIA: false } });
  const [areas, setAreas] = useState([]);
  const [areaSel, setAreaSel] = useState(null);
  const [compSel, setCompSel] = useState(null);
  const [corte, setCorte] = useState(5);
  const [cursos, setCursos] = useState([]);
  const [areasMapa, setAreasMapa] = useState([]);
  const [gruposNivel, setGruposNivel] = useState([]);
  const [draft, setDraft] = useState({});
  const [filtro, setFiltro] = useState('');
  const [dirty, setDirty] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [rRes, cRes, mRes, gRes] = await Promise.all([
        api.get('/admin/cneb/resumen'),
        api.get('/admin/cneb/catalogo', { params: { nivel } }),
        api.get('/admin/cneb/cursos', { params: { nivel } }),
        api.get('/admin/cneb/sesiones/meta', { params: { nivel } }).catch(() => ({ data: { grupos: [] } })),
      ]);
      setResumen(rRes.data);
      const uso = rRes.data?.uso;
      if (uso) {
        const niveles = { INICIAL: false, PRIMARIA: false, SECUNDARIA: false };
        (uso.niveles || []).forEach((row) => {
          niveles[row.nivel] = Boolean(row.activo);
        });
        setUsoDraft({ bimestre: Number(uso.bimestre || 4), niveles });
      }
      const tree = cRes.data?.areas || [];
      setAreas(tree);
      setAreaSel(tree[0]?.id || null);
      setCompSel(tree[0]?.competencias?.[0]?.id || null);
      setCorte(nivel === 'INICIAL' ? 5 : 1);
      setAreasMapa(mRes.data?.areas || []);
      setGruposNivel(gRes.data?.grupos || []);
      const list = mRes.data?.cursos || [];
      setCursos(list);
      const next = {};
      list.forEach((c) => {
        const tipo = c.tipo || c.sugerencia?.tipo || 'principal';
        const areaId =
          tipo === 'complementario'
            ? ''
            : c.area_id != null
              ? String(c.area_id)
              : c.sugerencia?.area_id
                ? String(c.sugerencia.area_id)
                : '';
        next[c.id] = { tipo, area_id: areaId };
      });
      setDraft(next);
      setDirty(false);
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo abrir CNEB',
        text: e.response?.data?.error || e.message || 'Revise las migraciones 092 y 093.',
      });
    } finally {
      setLoading(false);
    }
  }, [nivel]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const areaActiva = useMemo(
    () => areas.find((a) => Number(a.id) === Number(areaSel)) || areas[0] || null,
    [areas, areaSel]
  );

  const competenciaActiva = useMemo(() => {
    const list = areaActiva?.competencias || [];
    return list.find((c) => Number(c.id) === Number(compSel)) || list[0] || null;
  }, [areaActiva, compSel]);

  useEffect(() => {
    if (!areaActiva) return;
    const ids = (areaActiva.competencias || []).map((c) => Number(c.id));
    if (!ids.includes(Number(compSel))) setCompSel(ids[0] || null);
  }, [areaActiva, compSel]);

  const cortes = useMemo(() => {
    if (nivel === 'PRIMARIA') return [1, 2, 3, 4, 5, 6].map((n) => ({ v: n, label: `${n}.º` }));
    if (nivel === 'SECUNDARIA') return [1, 2, 3, 4, 5].map((n) => ({ v: n, label: `${n}.º` }));
    return [3, 4, 5].map((n) => ({ v: n, label: `${n} años` }));
  }, [nivel]);

  const desempenosCorte = useMemo(() => {
    const all = competenciaActiva?.desempenos || [];
    if (nivel === 'INICIAL') return all.filter((d) => Number(d.edad) === Number(corte));
    return all.filter((d) => Number(d.grado) === Number(corte));
  }, [competenciaActiva, corte, nivel]);

  const cursosFiltrados = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return cursos;
    return cursos.filter((c) => String(c.nombre || '').toLowerCase().includes(q));
  }, [cursos, filtro]);

  const statsMapa = useMemo(() => {
    let principales = 0;
    let complementarios = 0;
    let sinArea = 0;
    cursos.forEach((c) => {
      const d = draft[c.id];
      if (!d) return;
      if (d.tipo === 'complementario') complementarios += 1;
      else {
        principales += 1;
        if (!d.area_id) sinArea += 1;
      }
    });
    return { principales, complementarios, sinArea, total: cursos.length };
  }, [cursos, draft]);

  const statsNivel = resumen?.catalogo?.[nivel];

  const setCursoDraft = (id, patch) => {
    setDraft((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    setDirty(true);
  };

  const aplicarSugerenciasVacias = () => {
    setDraft((prev) => {
      const next = { ...prev };
      cursos.forEach((c) => {
        if (c.mapeado) return;
        const sug = c.sugerencia || {};
        next[c.id] = {
          tipo: sug.tipo || 'principal',
          area_id: sug.area_id ? String(sug.area_id) : '',
        };
      });
      return next;
    });
    setDirty(true);
  };

  const guardarUso = async () => {
    setSavingUso(true);
    try {
      const { data } = await api.put('/admin/cneb/uso', usoDraft);
      setResumen((r) => ({ ...r, uso: data.uso }));
      await Swal.fire({
        icon: 'success',
        title: 'Uso guardado',
        text: 'No se cambiaron notas ni el tipo de calificación del nivel. Solo qué niveles usan este módulo en el bimestre de prueba.',
      });
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo guardar el uso',
        text: e.response?.data?.error || e.message,
      });
    } finally {
      setSavingUso(false);
    }
  };

  const guardarMapa = async () => {
    const incompletos = cursos.filter((c) => {
      const d = draft[c.id];
      return d && d.tipo === 'principal' && !d.area_id;
    });
    if (incompletos.length) {
      const ok = await Swal.fire({
        icon: 'question',
        title: 'Hay cursos principales sin área CNEB',
        html: `<p style="text-align:left">Se guardarán igual. ${incompletos.length} curso(s) principal(es) aún no tienen área oficial.</p>`,
        showCancelButton: true,
        confirmButtonText: 'Guardar así',
        cancelButtonText: 'Seguir editando',
      });
      if (!ok.isConfirmed) return;
    }
    setSaving(true);
    try {
      const items = cursos.map((c) => ({
        curso_id: c.id,
        tipo: draft[c.id]?.tipo || 'principal',
        area_id: draft[c.id]?.tipo === 'complementario' ? null : draft[c.id]?.area_id || null,
      }));
      const { data } = await api.put('/admin/cneb/cursos/mapa', { nivel, items });
      await Swal.fire({
        icon: 'success',
        title: 'Mapeo guardado',
        text: `${data.guardados || items.length} cursos de ${etiquetaNivel(nivel)} actualizados.`,
      });
      await loadAll();
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo guardar',
        text: e.response?.data?.error || e.message,
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading && !resumen) {
    return (
      <div className="cneb-page cneb-page--loading">
        <div className="cneb-loading-card">
          <div className="cneb-spinner" />
          <p>Preparando el módulo CNEB…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cneb-page">
      <header className="cneb-hero">
        <div className="cneb-hero-icon">
          <IconLibro />
        </div>
        <div className="cneb-hero-text">
          <div className="cneb-hero-kicker">
            <span className="cneb-badge">Un solo CNEB</span>
            <span>Inicial · Primaria · Secundaria</span>
          </div>
          <h1>Evaluación CNEB</h1>
          <p>
            El catálogo oficial se carga una vez. Usted elige qué nivel lo usa en el bimestre de
            prueba. Activarlo no convierte las notas 0–20 ni cambia la libreta vigente.
          </p>
        </div>
        <div className="cneb-hero-stats">
          <div>
            <strong>{statsNivel?.areas ?? areas.length}</strong>
            <span>Áreas</span>
          </div>
          <div>
            <strong>{statsNivel?.competencias ?? '—'}</strong>
            <span>Competencias</span>
          </div>
          <div>
            <strong>{cursos.length}</strong>
            <span>Cursos</span>
          </div>
        </div>
      </header>

      <div className="cneb-nivel-switch" role="group" aria-label="Nivel">
        {NIVELES_UI.map((n) => (
          <button
            key={n.id}
            type="button"
            className={nivel === n.id ? 'is-active' : ''}
            onClick={() => setNivel(n.id)}
          >
            <strong>{n.label}</strong>
            <span>{n.hint}</span>
          </button>
        ))}
      </div>

      <p className="cneb-safe">
        Viendo <strong>{etiquetaNivel(nivel)}</strong>. Los cursos se mapean con las áreas de ese
        nivel. El 4.º bimestre de prueba se configura en la pestaña Uso: puede dejar solo Inicial,
        o sumar otro nivel cuando quieran.
      </p>

      <nav className="cneb-tabs" role="tablist" aria-label="Secciones CNEB">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`cneb-tab${tab === t.id ? ' is-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <strong>{t.label}</strong>
            <span>{t.hint}</span>
          </button>
        ))}
      </nav>

      {tab === 'uso' && (
        <section className="cneb-panel">
          <h2 className="cneb-uso-title">Bimestre de prueba</h2>
          <p className="cneb-muted cneb-uso-lead">
            El catálogo de los tres niveles ya está listo. Aquí solo marca cuáles entran al piloto
            (recomendado: Inicial). Primaria y Secundaria pueden quedar cargadas y apagadas hasta
            que coordinación lo autorice.
          </p>
          <label className="cneb-select-wrap cneb-bimestre">
            <span>Bimestre</span>
            <select
              value={usoDraft.bimestre}
              onChange={(e) => setUsoDraft((u) => ({ ...u, bimestre: Number(e.target.value) }))}
            >
              {[1, 2, 3, 4].map((b) => (
                <option key={b} value={b}>
                  {b}.º bimestre
                </option>
              ))}
            </select>
          </label>
          <div className="cneb-uso-grid">
            {NIVELES_UI.map((n) => (
              <label key={n.id} className={`cneb-uso-card${usoDraft.niveles[n.id] ? ' is-on' : ''}`}>
                <input
                  type="checkbox"
                  checked={Boolean(usoDraft.niveles[n.id])}
                  onChange={(e) =>
                    setUsoDraft((u) => ({
                      ...u,
                      niveles: { ...u.niveles, [n.id]: e.target.checked },
                    }))
                  }
                />
                <strong>{n.label}</strong>
                <span>{n.hint}</span>
                <em>{usoDraft.niveles[n.id] ? 'Usa CNEB en el piloto' : 'Solo catálogo, sin piloto'}</em>
              </label>
            ))}
          </div>
          <button type="button" className="cneb-btn primary" onClick={guardarUso} disabled={savingUso}>
            {savingUso ? 'Guardando…' : 'Guardar qué nivel se usa'}
          </button>
          <div className="cneb-next cneb-next--compact">
            <h3>Ya puede armar la sesión</h3>
            <p className="cneb-muted">
              Sesiones con tres momentos, lista de cotejo, corte AD/A/B/C y Excel de trabajo para
              SIAGIE. La IA usa el prompt de la última pestaña y solo el catálogo oficial.
            </p>
            <p className="cneb-muted">Perfil: {user?.tipo}.</p>
          </div>
        </section>
      )}

      {tab === 'sesiones' && (
        <AdminCnebSesiones nivel={nivel} areas={areas} etiquetaNivel={etiquetaNivel} />
      )}

      {tab === 'registro' && (
        <AdminCnebRegistro
          nivel={nivel}
          grupos={gruposNivel}
          bimestreDefault={usoDraft.bimestre}
          etiquetaNivel={etiquetaNivel}
        />
      )}

      {tab === 'catalogo' && (
        <section className="cneb-panel">
          <div className="cneb-catalog">
            <aside className="cneb-area-list">
              <h2>Áreas de {etiquetaNivel(nivel)}</h2>
              {areas.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`cneb-area-btn tone-${AREA_TONE[a.codigo] || 'slate'}${Number(areaSel) === Number(a.id) ? ' is-active' : ''}`}
                  onClick={() => {
                    setAreaSel(a.id);
                    setCompSel(a.competencias?.[0]?.id || null);
                  }}
                >
                  <span className="cneb-area-code">{a.codigo}</span>
                  <span className="cneb-area-name">{a.nombre}</span>
                  <span className="cneb-area-meta">
                    {a.tipo === 'transversal' ? 'Transversal' : a.tipo === 'religion' ? 'Religión' : 'Curricular'}
                    {' · '}
                    {(a.competencias || []).length} competencia{(a.competencias || []).length === 1 ? '' : 's'}
                  </span>
                </button>
              ))}
            </aside>

            <div className="cneb-area-detail">
              {areaActiva ? (
                <>
                  <div className="cneb-detail-head">
                    <p className="cneb-kicker">{areaActiva.tipo}</p>
                    <h2>{areaActiva.nombre}</h2>
                    <p>{areaActiva.descripcion}</p>
                  </div>
                  <div className="cneb-comp-pills">
                    {(areaActiva.competencias || []).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={`cneb-pill${Number(competenciaActiva?.id) === Number(c.id) ? ' is-active' : ''}`}
                        onClick={() => setCompSel(c.id)}
                      >
                        {c.nombre}
                      </button>
                    ))}
                  </div>
                  {competenciaActiva && (
                    <article className="cneb-comp-card">
                      <h3>{competenciaActiva.nombre}</h3>
                      <h4>Capacidades</h4>
                      <ul className="cneb-caps">
                        {(competenciaActiva.capacidades || []).map((cap) => (
                          <li key={cap.id}>{cap.nombre}</li>
                        ))}
                      </ul>
                      {competenciaActiva.estandar_ciclo ? (
                        <>
                          <h4>Estándar / descripción</h4>
                          <p className="cneb-estandar">{competenciaActiva.estandar_ciclo}</p>
                        </>
                      ) : null}
                      <div className="cneb-edad-row">
                        <h4>{nivel === 'INICIAL' ? 'Desempeños por edad' : 'Desempeños por grado'}</h4>
                        <div className="cneb-edad-switch" role="group">
                          {cortes.map((c) => (
                            <button
                              key={c.v}
                              type="button"
                              className={Number(corte) === c.v ? 'is-active' : ''}
                              onClick={() => setCorte(c.v)}
                            >
                              {c.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      {desempenosCorte.length === 0 ? (
                        <p className="cneb-muted">
                          {nivel === 'INICIAL'
                            ? 'Sin desempeños para esta edad.'
                            : 'Competencias listas. Los desempeños por grado de Primaria y Secundaria se completan desde el programa curricular (siguiente carga). Inicial ya los tiene por edad.'}
                        </p>
                      ) : (
                        <ol className="cneb-des-list">
                          {desempenosCorte.map((d) => (
                            <li key={d.id}>{d.texto}</li>
                          ))}
                        </ol>
                      )}
                    </article>
                  )}
                </>
              ) : (
                <p className="cneb-muted">No hay áreas. Aplique las migraciones 092 y 093.</p>
              )}
            </div>
          </div>
          <p className="cneb-fuente">{resumen?.fuente_por_nivel?.[nivel]}</p>
        </section>
      )}

      {tab === 'mapeo' && (
        <section className="cneb-panel">
          <div className="cneb-map-toolbar">
            <div>
              <h2>Cursos de {etiquetaNivel(nivel)}</h2>
              <p>
                Los mismos cursos de Académico. Principal va al informe MINEDU; complementario
                (natación, finanzas, etc.) queda interno.
              </p>
            </div>
            <div className="cneb-map-actions">
              <input
                type="search"
                className="cneb-search"
                placeholder="Buscar curso…"
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
              />
              <button type="button" className="cneb-btn ghost" onClick={aplicarSugerenciasVacias}>
                Sugerir los vacíos
              </button>
              <button type="button" className="cneb-btn primary" onClick={guardarMapa} disabled={saving || !cursos.length}>
                {saving ? 'Guardando…' : dirty ? 'Guardar mapeo' : 'Guardar'}
              </button>
            </div>
          </div>
          <div className="cneb-map-stats">
            <span>
              <strong>{statsMapa.total}</strong> cursos
            </span>
            <span>
              <strong>{statsMapa.principales}</strong> principales
            </span>
            <span>
              <strong>{statsMapa.complementarios}</strong> complementarios
            </span>
            {statsMapa.sinArea > 0 && (
              <span className="warn">
                <strong>{statsMapa.sinArea}</strong> principales sin área
              </span>
            )}
          </div>
          {cursos.length === 0 ? (
            <div className="cneb-empty">
              No hay cursos de {etiquetaNivel(nivel)} en Académico. Créelos ahí y vuelva a mapearlos.
            </div>
          ) : (
            <div className="cneb-course-list">
              {cursosFiltrados.map((c) => {
                const d = draft[c.id] || { tipo: 'principal', area_id: '' };
                const esComp = d.tipo === 'complementario';
                return (
                  <article key={c.id} className={`cneb-course-card${esComp ? ' is-comp' : ''}`}>
                    <div className="cneb-course-name">
                      <h3>{c.nombre}</h3>
                      <p>
                        {c.nivel_nombre}
                        {c.mapeado ? ' · guardado' : ' · pendiente'}
                      </p>
                    </div>
                    <div className="cneb-seg" role="group" aria-label={`Tipo de ${c.nombre}`}>
                      <button
                        type="button"
                        className={!esComp ? 'is-active' : ''}
                        onClick={() => setCursoDraft(c.id, { tipo: 'principal' })}
                      >
                        Principal
                      </button>
                      <button
                        type="button"
                        className={esComp ? 'is-active' : ''}
                        onClick={() => setCursoDraft(c.id, { tipo: 'complementario', area_id: '' })}
                      >
                        Complementario
                      </button>
                    </div>
                    <label className="cneb-select-wrap">
                      <span>Área CNEB</span>
                      <select
                        disabled={esComp}
                        value={esComp ? '' : d.area_id}
                        onChange={(e) => setCursoDraft(c.id, { area_id: e.target.value })}
                      >
                        <option value="">{esComp ? 'No aplica (taller interno)' : 'Elegir área…'}</option>
                        {areasMapa
                          .filter((a) => a.tipo !== 'transversal')
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.nombre}
                            </option>
                          ))}
                      </select>
                    </label>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {tab === 'prompt' && <AdminCnebPrompt />}
    </div>
  );
}
