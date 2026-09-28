import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import Swal from 'sweetalert2';
import AdminCnebUnidades from './AdminCnebUnidades';
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
  { id: 'unidades', label: 'Unidades', hint: 'Tema de cada bimestre' },
  { id: 'sesiones', label: 'Sesiones', hint: 'Inicio, desarrollo y cierre' },
  { id: 'registro', label: 'Registro', hint: 'Cotejo y conclusión AD/A/B/C' },
  { id: 'catalogo', label: 'Catálogo CNEB', hint: 'Áreas y competencias oficiales' },
  { id: 'mapeo', label: 'Cursos del colegio', hint: 'Principal o complementario' },
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
  const [nivel, setNivel] = useState('INICIAL');
  const [tab, setTab] = useState('sesiones');
  const [verPrompt, setVerPrompt] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingUso, setSavingUso] = useState(false);
  const [resumen, setResumen] = useState(null);
  const [usoDraft, setUsoDraft] = useState({ bimestre: 4, niveles: { INICIAL: false, PRIMARIA: false, SECUNDARIA: false } });
  const [usoBase, setUsoBase] = useState({ bimestre: 4, niveles: { INICIAL: false, PRIMARIA: false, SECUNDARIA: false } });
  const [usoCuali, setUsoCuali] = useState({ INICIAL: true, PRIMARIA: false, SECUNDARIA: false });
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
        const cuali = { INICIAL: false, PRIMARIA: false, SECUNDARIA: false };
        (uso.niveles || []).forEach((row) => {
          niveles[row.nivel] = Boolean(row.activo);
          cuali[row.nivel] = Boolean(row.cualitativo);
        });
        const siguiente = { bimestre: Number(uso.bimestre || 4), niveles };
        setUsoDraft(siguiente);
        setUsoBase(siguiente);
        setUsoCuali(cuali);
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
        const actual = next[c.id] || { tipo: 'principal', area_id: '' };
        const yaOk =
          actual.tipo === 'complementario' || (actual.tipo === 'principal' && actual.area_id);
        if (yaOk) return;
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
    const cambios = NIVELES_UI.filter(
      (n) => !usoCuali[n.id] && Boolean(usoDraft.niveles[n.id]) !== Boolean(usoBase.niveles[n.id])
    );
    const cambiaBimestre = Number(usoDraft.bimestre) !== Number(usoBase.bimestre);
    if (cambios.length || cambiaBimestre) {
      const lineas = cambios
        .map((n) =>
          usoDraft.niveles[n.id]
            ? `${n.label} mostrará CNEB solo en el ${usoDraft.bimestre}.º bimestre. El nivel sigue como está en Niveles.`
            : `${n.label} deja la prueba. El aula vuelve a números en todos los bimestres.`
        )
        .join(' ');
      const ok = await Swal.fire({
        icon: 'question',
        title: 'Prueba de un bimestre',
        text: `${lineas || `La prueba queda en el ${usoDraft.bimestre}.º bimestre.`} No se cambia el tipo del nivel y no se borra nada.`,
        showCancelButton: true,
        confirmButtonText: 'Sí, guardar',
        cancelButtonText: 'Cancelar',
      });
      if (!ok.isConfirmed) return;
    }
    setSavingUso(true);
    try {
      const { data } = await api.put('/admin/cneb/uso', usoDraft);
      setResumen((r) => ({ ...r, uso: data.uso }));
      if (data?.uso) {
        const niveles = { INICIAL: false, PRIMARIA: false, SECUNDARIA: false };
        const cuali = { INICIAL: false, PRIMARIA: false, SECUNDARIA: false };
        (data.uso.niveles || []).forEach((row) => {
          niveles[row.nivel] = Boolean(row.activo);
          cuali[row.nivel] = Boolean(row.cualitativo);
        });
        const siguiente = { bimestre: Number(data.uso.bimestre || usoDraft.bimestre), niveles };
        setUsoDraft(siguiente);
        setUsoBase(siguiente);
        setUsoCuali(cuali);
      }
      await Swal.fire({
        icon: 'success',
        title: 'Uso guardado',
        text: 'La prueba quedó guardada. El tipo del nivel no cambió y no se borró nada.',
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
            El modo del año se elige en Académico → Niveles. Aquí puede probar CNEB en un solo
            bimestre, sin cambiar ese modo.
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
            onClick={() => {
              setNivel(n.id);
              setVerPrompt(false);
            }}
          >
            <strong>{n.label}</strong>
            <span>{n.hint}</span>
          </button>
        ))}
      </div>

      <div className="cneb-uso-inline">
        {usoCuali[nivel] ? (
          <div>
            <strong>{etiquetaNivel(nivel)} ya es cualitativo</strong>
            <span>
              CNEB va en los cuatro bimestres. Para cambiarlo, use Académico → Niveles. Esta prueba
              no hace falta.
            </span>
          </div>
        ) : (
          <>
            <div>
              <strong>Probar CNEB en un bimestre · {etiquetaNivel(nivel)}</strong>
              <span>
                No cambia el tipo en Niveles. Solo el bimestre elegido muestra CNEB. Los otros
                siguen con números. Quitar la prueba no borra nada.
              </span>
            </div>
            <label className="cneb-uso-check">
              <input
                type="checkbox"
                checked={Boolean(usoDraft.niveles[nivel])}
                onChange={(e) =>
                  setUsoDraft((u) => ({
                    ...u,
                    niveles: { ...u.niveles, [nivel]: e.target.checked },
                  }))
                }
              />
              {usoDraft.niveles[nivel] ? 'Prueba activa' : 'Sin prueba'}
            </label>
            <label className="cneb-select-wrap cneb-bimestre">
              <span>Bimestre de la prueba</span>
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
            <button type="button" className="cneb-btn primary" onClick={guardarUso} disabled={savingUso}>
              {savingUso ? 'Guardando…' : 'Guardar prueba'}
            </button>
          </>
        )}
      </div>

      <div className="cneb-seccion-head">
        <h2>Opciones de {etiquetaNivel(nivel)}</h2>
        <button
          type="button"
          className={`cneb-btn ghost${verPrompt ? ' is-active' : ''}`}
          onClick={() => setVerPrompt((v) => !v)}
        >
          {verPrompt ? 'Volver a las opciones del nivel' : 'Prompt de la IA (los 3 niveles)'}
        </button>
      </div>

      {verPrompt ? (
        <AdminCnebPrompt />
      ) : (
        <>
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

      {tab === 'unidades' && <AdminCnebUnidades nivel={nivel} etiquetaNivel={etiquetaNivel} />}

      {tab === 'sesiones' && (
        <AdminCnebSesiones
          nivel={nivel}
          areas={areas}
          etiquetaNivel={etiquetaNivel}
          bimestre={usoDraft.bimestre}
        />
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
                El área CNEB no se adivina por el nombre del curso del colegio: sale del currículo
                MINEDU de <strong>este</strong> nivel. Principal entra al informe y a SIAGIE;
                complementario se evalúa en el registro interno y no viaja a SIAGIE.
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
          <div className="cneb-callout">
            {nivel === 'INICIAL' ? (
              <>
                <p>
                  <strong>Inicial (ciclo II):</strong> el CNEB no tiene «Educación Física». Ese curso
                  del colegio corresponde al área <strong>Psicomotriz</strong> (motricidad). Personal
                  Social, Comunicación, Matemática, Ciencia y Tecnología y Religión sí coinciden en
                  nombre. Inglés y Computación, en este nivel, van como complementarios.
                </p>
                <p>
                  En Primaria y Secundaria sí existe el área Educación Física. Use «Sugerir los
                  vacíos» y revise el texto «Según MINEDU» de cada tarjeta.
                </p>
              </>
            ) : (
              <p>
                <strong>{etiquetaNivel(nivel)}:</strong> las áreas oficiales son las del programa
                curricular (Comunicación, Matemática, Ciencia y Tecnología, Educación Física, etc.).
                Un taller (natación, ajedrez, finanzas) se marca complementario: se observa en el
                cotejo del colegio, no en la conclusión AD/A/B/C ni en SIAGIE.
              </p>
            )}
            <p>
              Los complementarios <strong>sí se evalúan</strong> si el docente crea sesión + lista de
              cotejo: aparecen en Registro (auxiliar y consolidado). No se muestran como AD/A/B/C de
              un área oficial porque MINEDU no los reporta en SIAGIE.
            </p>
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
                      {esComp || c.sugerencia?.tipo === 'complementario' ? (
                        <p className="cneb-minedu-hint">
                          Según MINEDU de este nivel: taller complementario (no va a SIAGIE).
                        </p>
                      ) : c.sugerencia?.area_nombre ? (
                        <p className="cneb-minedu-hint">
                          Según MINEDU: {c.sugerencia.area_nombre}
                          {String(d.area_id) !== String(c.sugerencia.area_id) ? (
                            <button
                              type="button"
                              className="cneb-hint-use"
                              onClick={() =>
                                setCursoDraft(c.id, {
                                  tipo: 'principal',
                                  area_id: String(c.sugerencia.area_id),
                                })
                              }
                            >
                              Usar
                            </button>
                          ) : null}
                        </p>
                      ) : (
                        <p className="cneb-minedu-hint is-warn">
                          MINEDU no sugiere área por el nombre. Elíjala del catálogo de este nivel.
                        </p>
                      )}
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

        </>
      )}
    </div>
  );
}
