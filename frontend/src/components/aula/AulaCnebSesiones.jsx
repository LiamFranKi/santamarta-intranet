import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../../services/api';
import Swal from 'sweetalert2';
import AdminCnebAuxiliar from '../../pages/admin/AdminCnebAuxiliar';
import AdminCnebSesiones, { hallarAreaCneb, MarcoCnebVista } from '../../pages/admin/AdminCnebSesiones';
import AdminCnebCorte from '../../pages/admin/AdminCnebCorte';
import EvidenciasGaleria from './EvidenciasGaleria';
import CnebHtmlVista from './CnebHtmlVista';
import { htmlVacio } from '../../utils/cnebTextoRico';
import '../../pages/admin/AdminCnebPiloto.css';
import './AulaCnebSesiones.css';

function fechaCorta(v) {
  if (!v) return 'Sin fecha';
  const d = new Date(String(v).slice(0, 10) + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 10);
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
}

async function bajarPdf(apiBase, id, parte, formato = 'colegio') {
  const res = await api.get(`${apiBase}/sesiones/${id}/pdf`, {
    params: { parte, formato },
    responseType: 'blob',
    timeout: 60000,
  });
  const href = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = href;
  a.download = parte === 'ficha' ? `ficha_cneb_${id}.pdf` : `sesion_cneb_${id}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

export default function AulaCnebSesiones({
  asignaturaId,
  rol = 'docente',
  readOnly = false,
  bimestre = 1,
  onActivo,
}) {
  const esDocente = rol === 'docente';
  const apiBase = esDocente ? '/docente/cneb' : '/alumno/cneb';
  const onActivoRef = useRef(onActivo);
  onActivoRef.current = onActivo;
  const [meta, setMeta] = useState(null);
  const [areasCat, setAreasCat] = useState([]);
  const [editor, setEditor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sesion, setSesion] = useState(null);
  const [vista, setVista] = useState('lista');
  const [evidencias, setEvidencias] = useState([]);
  const [subiendoEv, setSubiendoEv] = useState(false);

  const evidenciasUrl = esDocente ? '/docente/aula-virtual/evidencias' : '/alumno/aula-virtual/evidencias';

  const loadEvidencias = useCallback(
    async (sesionId) => {
      if (!asignaturaId || !sesionId) {
        setEvidencias([]);
        return;
      }
      try {
        const { data } = await api.get(evidenciasUrl, {
          params: { asignatura_id: asignaturaId, ciclo: bimestre, sesion_id: sesionId },
        });
        setEvidencias(data.evidencias || []);
      } catch {
        setEvidencias([]);
      }
    },
    [asignaturaId, bimestre, evidenciasUrl]
  );

  const loadLista = useCallback(async () => {
    if (!asignaturaId) return;
    setLoading(true);
    try {
      const { data } = await api.get(`${apiBase}/aula/${asignaturaId}`);
      setMeta(data);
      if (data?.areas?.length) setAreasCat(data.areas);
      if (onActivoRef.current) onActivoRef.current(Boolean(data?.es_inicial));
    } catch {
      setMeta(null);
      if (onActivoRef.current) onActivoRef.current(false);
    } finally {
      setLoading(false);
    }
  }, [apiBase, asignaturaId]);

  useEffect(() => {
    loadLista();
  }, [loadLista]);

  useEffect(() => {
    if (!meta?.es_inicial || !esDocente) return;
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get('/docente/cneb/catalogo', { params: { nivel: 'INICIAL' } });
        if (alive) setAreasCat(data.areas || data || []);
      } catch {
        if (alive) setAreasCat([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [meta?.es_inicial, esDocente]);

  const contextoAula = useMemo(() => {
    if (!meta) return null;
    const grado = Number(meta.grado);
    const corte = Number.isFinite(grado) && grado >= 3 && grado <= 5 ? grado : 5;
    const aula = [meta.grado != null ? String(meta.grado) : '', meta.seccion || ''].filter(Boolean).join(' ') || 'Esta aula';
    const tallerMapa = meta.mapa?.tipo === 'complementario';
    const areaResuelta = tallerMapa
      ? null
      : hallarAreaCneb(areasCat, meta.mapa?.area_id, meta.mapa?.area_nombre || meta.curso_nombre);
    return {
      grupo_id: meta.grupo_id,
      asignatura_id: meta.asignatura_id,
      area_id: tallerMapa ? '' : areaResuelta?.id || meta.mapa?.area_id || '',
      area_nombre: tallerMapa
        ? 'Taller interno'
        : areaResuelta?.nombre || meta.mapa?.area_nombre || meta.curso_nombre || '',
      corte,
      aula_label: `${aula} · ${corte} años`,
    };
  }, [meta, areasCat]);

  const marcoSesion = useMemo(() => {
    if (!sesion) return null;
    const area = hallarAreaCneb(areasCat, sesion.area_id, sesion.area_nombre);
    const comp = (area?.competencias || []).find((c) => String(c.id) === String(sesion.competencia_id));
    const corte = Number(sesion.corte);
    const caps = (sesion.capacidades || []).length ? sesion.capacidades : comp?.capacidades || [];
    const estandar = sesion.estandar_ciclo || comp?.estandar_ciclo || '';
    const desGuardados = sesion.desempenos || [];
    const desCatalogo = (comp?.desempenos || []).filter((d) =>
      Number.isFinite(corte) ? Number(d.edad) === corte || Number(d.grado) === corte : true
    );
    return {
      competenciaNombre: sesion.competencia_nombre || comp?.nombre || '',
      capacidades: caps,
      estandar,
      desempenos: desGuardados.length ? desGuardados : desCatalogo,
      edadLabel: Number.isFinite(corte) && corte > 0 ? `${corte} años` : '',
    };
  }, [sesion, areasCat]);

  const abrir = async (id) => {
    try {
      const { data } = await api.get(`${apiBase}/sesiones/${id}`);
      setSesion(data.sesion);
      setVista('plan');
      await loadEvidencias(id);
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo abrir la sesión',
        text: e.response?.data?.error || e.message,
      });
    }
  };

  const pdf = async (id, parte, formato) => {
    try {
      await bajarPdf(apiBase, id, parte, formato);
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo descargar',
        text: e.response?.data?.error || e.message,
      });
    }
  };

  const subirEvidencia = async (file) => {
    if (!file || !sesion?.id) return;
    setSubiendoEv(true);
    try {
      const fd = new FormData();
      fd.append('asignatura_id', asignaturaId);
      fd.append('titulo', file.name.replace(/\.[^.]+$/, '') || 'Evidencia');
      fd.append('ciclo', bimestre);
      fd.append('cneb_sesion_id', sesion.id);
      fd.append('archivo', file);
      await api.post('/docente/aula-virtual/evidencias', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await loadEvidencias(sesion.id);
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo subir la evidencia',
        text: e.response?.data?.error || e.message,
      });
    } finally {
      setSubiendoEv(false);
    }
  };

  const borrarEvidencia = async (ev) => {
    const ok = await Swal.fire({
      icon: 'warning',
      title: '¿Eliminar esta evidencia?',
      showCancelButton: true,
      confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar',
    });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/docente/aula-virtual/evidencias/${ev.id}`);
      await loadEvidencias(sesion.id);
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo eliminar',
        text: e.response?.data?.error || e.message,
      });
    }
  };

  if (!loading && !meta?.es_inicial) return null;

  const sesiones = meta?.sesiones || [];
  const taller = meta?.mapa?.tipo === 'complementario';
  const areaLabel = taller
    ? 'Taller interno'
    : meta?.mapa?.area_nombre || meta?.curso_nombre || 'Área CNEB';

  return (
    <div className="aula-section-card temas-card expanded aula-cneb-card">
      <div className="card-header">
        <div className="card-icon">📗</div>
        <div className="card-info">
          <h3 className="card-title">Sesiones CNEB</h3>
          <p className="card-count">{sesiones.length}</p>
          <p className="card-subtitle">{areaLabel}</p>
        </div>
        <div className="card-action-btns">
          {editor || sesion || vista === 'corte' ? (
            <button
              type="button"
              className="card-action-btn card-action-btn-secondary"
              onClick={() => {
                setEditor(null);
                setSesion(null);
                setVista('lista');
                setEvidencias([]);
              }}
            >
              ← Listado
            </button>
          ) : null}
          {esDocente && !readOnly && !editor && !sesion ? (
            <>
              {sesiones.length > 0 && !taller ? (
                <button
                  type="button"
                  className="card-action-btn card-action-btn-secondary"
                  onClick={() => {
                    setSesion(null);
                    setEditor(null);
                    setVista('corte');
                  }}
                >
                  Corte AD/A/B/C
                </button>
              ) : null}
              <button
                type="button"
                className="card-action-btn"
                onClick={() => {
                  setSesion(null);
                  setVista('lista');
                  setEditor({ sesionId: null });
                }}
              >
                + Nueva sesión
              </button>
            </>
          ) : null}
          {esDocente && !readOnly && sesion && !editor ? (
            <button
              type="button"
              className="card-action-btn"
              onClick={() => setEditor({ sesionId: sesion.id })}
            >
              Editar plan
            </button>
          ) : null}
        </div>
      </div>

      <div className="card-content-expanded">
        {loading ? (
          <div className="empty-state">
            <p>Cargando sesiones…</p>
          </div>
        ) : editor ? (
          <AdminCnebSesiones
            nivel="INICIAL"
            areas={areasCat}
            etiquetaNivel={() => 'Inicial'}
            apiBase="/docente/cneb"
            embebido
            contextoAula={contextoAula}
            sesionId={editor.sesionId}
            onCerrar={() => {
              setEditor(null);
              setVista('lista');
            }}
            onGuardado={() => {
              loadLista();
            }}
          />
        ) : vista === 'corte' ? (
          <AdminCnebCorte
            apiBase="/docente/cneb"
            nivel="INICIAL"
            grupos={
              meta?.grupo_id
                ? [{ id: meta.grupo_id, grado: meta.grado, seccion: meta.seccion }]
                : []
            }
            grupoFijo={meta?.grupo_id}
            bimestreDefault={bimestre}
            etiquetaNivel={() => 'Inicial'}
            areaId={contextoAula?.area_id || ''}
            areaNombre={contextoAula?.area_nombre || areaLabel}
            asignaturaId={meta?.asignatura_id || contextoAula?.asignatura_id || ''}
            haySesiones={sesiones.length > 0}
          />
        ) : sesion ? (
          <div className="aula-cneb-detalle">
            <header className="aula-cneb-detalle-head">
              <p className="aula-cneb-kicker">
                {sesion.area_nombre || areaLabel}
                {sesion.duracion_min ? ` · ${sesion.duracion_min} min` : ''}
                {` · ${fechaCorta(sesion.fecha_sesion)}`}
              </p>
              <h4>{sesion.titulo}</h4>
              {sesion.proposito ? <p className="aula-cneb-proposito">{sesion.proposito}</p> : null}
            </header>

            {esDocente ? (
              <div className="aula-cneb-subtabs" role="tablist">
                <button type="button" className={vista === 'plan' ? 'is-active' : ''} onClick={() => setVista('plan')}>
                  Plan (inicio · desarrollo · cierre)
                </button>
                <button type="button" className={vista === 'cotejo' ? 'is-active' : ''} onClick={() => setVista('cotejo')}>
                  Observar / cotejo
                </button>
              </div>
            ) : null}

            {(!esDocente || vista === 'plan') && (
              <>
                {esDocente && marcoSesion?.competenciaNombre ? (
                  <MarcoCnebVista
                    competenciaNombre={marcoSesion.competenciaNombre}
                    capacidades={marcoSesion.capacidades}
                    estandar={marcoSesion.estandar}
                    desempenos={marcoSesion.desempenos}
                    edadLabel={marcoSesion.edadLabel}
                    modo="lectura"
                  />
                ) : null}
                {['inicio', 'desarrollo', 'cierre'].map((tipo) => {
                  const titulo = tipo === 'inicio' ? 'Inicio' : tipo === 'cierre' ? 'Cierre' : 'Desarrollo';
                  const texto = sesion.momentos?.[tipo] || '';
                  const mins = sesion.minutos?.[tipo];
                  if (!esDocente && !texto) return null;
                  return (
                    <article key={tipo} className="aula-cneb-momento">
                      <h5>
                        {titulo}
                        {esDocente && mins ? <span> {mins} min</span> : null}
                      </h5>
                      <CnebHtmlVista html={texto} vacio="Aún no hay texto en este momento." />
                    </article>
                  );
                })}
                {!htmlVacio(sesion.ficha_estudiante) ? (
                  <article className="aula-cneb-momento aula-cneb-ficha-vista">
                    <h5>Ficha del estudiante</h5>
                    <p className="aula-cneb-row-sub">
                      Así queda la hoja que se imprime. El niño dibuja o escribe; no es una nota.
                    </p>
                    <div className="cneb-ficha-preview">
                      <CnebHtmlVista html={sesion.ficha_estudiante} />
                      <div className="cneb-ficha-dibujo" aria-hidden>
                        Espacio para dibujar o escribir
                      </div>
                    </div>
                  </article>
                ) : null}
                {esDocente && (sesion.cotejo || []).length > 0 && vista === 'plan' ? (
                  <article className="aula-cneb-momento">
                    <h5>Lista de cotejo</h5>
                    <ol>
                      {sesion.cotejo.map((c) => (
                        <li key={c.id || c.item}>{c.item}</li>
                      ))}
                    </ol>
                  </article>
                ) : null}
                <div className="aula-cneb-pdfs">
                  {esDocente ? (
                    <>
                      <button type="button" className="card-action-btn card-action-btn-secondary" onClick={() => pdf(sesion.id, 'sesion')}>
                        PDF de la sesión
                      </button>
                      <button type="button" className="card-action-btn" onClick={() => pdf(sesion.id, 'ficha')}>
                        Ficha del estudiante
                      </button>
                      <button
                        type="button"
                        className="card-action-btn card-action-btn-secondary"
                        onClick={() => pdf(sesion.id, 'ficha', 'minedu')}
                      >
                        Ficha MINEDU
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="aula-cneb-nota aula-cneb-nota--info">
                        La <strong>ficha</strong> es tu hoja para dibujar o escribir. La <strong>guía</strong> es el
                        plan de la clase (inicio, desarrollo y cierre). No ves las notas de tus compañeros.
                      </p>
                      <button type="button" className="card-action-btn" onClick={() => pdf(sesion.id, 'ficha')}>
                        Mi ficha (PDF)
                      </button>
                      <button type="button" className="card-action-btn card-action-btn-secondary" onClick={() => pdf(sesion.id, 'sesion')}>
                        Guía de la clase (PDF)
                      </button>
                    </>
                  )}
                </div>
              </>
            )}

            {esDocente && vista === 'cotejo' ? (
              <div className="aula-cneb-auxiliar">
                <AdminCnebAuxiliar apiBase="/docente/cneb" sesionId={sesion.id} />
              </div>
            ) : null}

            <section className="aula-cneb-evidencias">
              <h5>Evidencias de esta sesión</h5>
              <p className="aula-cneb-row-sub">
                Fotos o PDF de lo que hicieron (ficha llena, dibujo, trabajo). No es una nota: el
                maestro las mira y luego marca el cotejo.
              </p>
              {esDocente && !readOnly ? (
                <label className="aula-cneb-upload">
                  {subiendoEv ? 'Subiendo…' : '+ Subir foto o PDF'}
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    hidden
                    disabled={subiendoEv}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) subirEvidencia(f);
                    }}
                  />
                </label>
              ) : null}
              <EvidenciasGaleria
                items={evidencias}
                canManage={esDocente && !readOnly}
                onDelete={borrarEvidencia}
              />
            </section>
          </div>
        ) : sesiones.length === 0 ? (
          <div className="empty-state">
            <p>
              {esDocente
                ? taller
                  ? 'Taller interno: cree una sesión en CNEB si desea evidencia. No va a SIAGIE.'
                  : 'Aún no hay sesiones de esta área. Créela con inicio, desarrollo y cierre.'
                : 'Todavía no hay sesiones en este curso.'}
            </p>
          </div>
        ) : (
          <table className="tabla-aula-virtual">
            <thead>
              <tr>
                <th>SESIÓN</th>
                <th>FECHA</th>
                <th className="text-center">ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {sesiones.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.titulo}</strong>
                    {s.proposito ? <div className="aula-cneb-row-sub">{s.proposito}</div> : null}
                  </td>
                  <td>{fechaCorta(s.fecha_sesion)}</td>
                  <td className="text-center">
                    <button type="button" className="card-action-btn" onClick={() => abrir(s.id)}>
                      {esDocente ? 'Abrir' : 'Ver'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {taller && !sesion ? (
          <p className="aula-cneb-nota">Este curso es complementario: el cotejo queda interno y no entra a SIAGIE.</p>
        ) : null}
      </div>
    </div>
  );
}
