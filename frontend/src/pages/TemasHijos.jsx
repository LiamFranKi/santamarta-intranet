import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import './TemasHijos.css';

const MAX_SELECCION = 20;
const BIMESTRES = [1, 2, 3, 4];

function getFechaLabel(fechaHora) {
  if (!fechaHora) return '';
  try {
    const d = new Date(fechaHora);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('es-PE', { year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch {
    return '';
  }
}

function TemasHijosPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const esDocente = String(location.pathname || '').startsWith('/docente');
  const apiBase = esDocente ? '/docente' : '/apoderado';

  const [loading, setLoading] = useState(true);
  const [hijos, setHijos] = useState([]);
  const [bimestre, setBimestre] = useState(1);

  const [archivos, setArchivos] = useState([]); // lista única (deduplicada) por id
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);

  const requestIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const endpoint = esDocente ? '/docente/roles-adicionales' : '/apoderado/hijos';
        const response = await api.get(endpoint);
        const lista = Array.isArray(response.data?.hijos) ? response.data.hijos : [];
        if (!cancelled) setHijos(lista);
      } catch (e) {
        console.error('[TemasHijos] Error cargando hijos:', e);
        if (!cancelled) {
          setHijos([]);
          Swal.fire({
            icon: 'error',
            title: 'Error',
            text: e?.response?.data?.error || e.message || 'No se pudieron cargar los hijos',
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [esDocente]);

  useEffect(() => {
    if (!hijos.length) return;
    let cancelled = false;
    const reqId = ++requestIdRef.current;

    (async () => {
      setLoading(true);
      try {
        const archivoById = new Map();

        for (const hijo of hijos) {
          const hijoNombre = [hijo?.nombres, hijo?.apellido_paterno, hijo?.apellido_materno]
            .filter(Boolean)
            .join(' ')
            .trim();

          // 1) Cursos del hijo
          const cursosResp = await api.get(`${apiBase}/hijos/${hijo.id}/cursos`);
          const cursos = Array.isArray(cursosResp.data?.cursos) ? cursosResp.data.cursos : [];

          // 2) Temas/fichas del hijo por curso + bimestre
          for (const curso of cursos) {
            const asignaturaId = curso?.asignatura_id;
            if (!asignaturaId) continue;

            const archivosResp = await api.get(`${apiBase}/hijos/${hijo.id}/aula-virtual/archivos`, {
              params: { asignatura_id: asignaturaId, ciclo: bimestre },
            });
            const lista = Array.isArray(archivosResp.data?.archivos) ? archivosResp.data.archivos : [];

            for (const a of lista) {
              const id = a?.id;
              if (id == null) continue;

              const key = String(id);
              if (!archivoById.has(key)) {
                archivoById.set(key, {
                  id,
                  nombre: a?.nombre || '',
                  archivo_url: a?.archivo_url || null,
                  archivo_val: a?.archivo || null,
                  fecha_hora: a?.fecha_hora || null,
                  ciclo: a?.ciclo || bimestre,
                  orden: a?.orden || 0,
                  asignatura_id: curso?.asignatura_id || null,
                  curso_nombre: curso?.curso_nombre || 'Curso',
                  docente_nombre: a?.docente_nombre || curso?.docente_nombre || 'Docente',
                  hijosNombres: new Set(hijoNombre ? [hijoNombre] : []),
                });
              } else {
                // Deduplicamos por id: solo agregamos contribución de este hijo
                const existing = archivoById.get(key);
                if (hijoNombre) existing.hijosNombres.add(hijoNombre);
              }
            }
          }
        }

        if (cancelled || requestIdRef.current !== reqId) return;

        const listaFinal = Array.from(archivoById.values()).map((item) => ({
          ...item,
          hijosNombres: Array.from(item.hijosNombres || []),
        }));

        setArchivos(listaFinal);
        setSelectedOrderIds([]); // al cambiar bimestre, reiniciamos selección
      } catch (e) {
        console.error('[TemasHijos] Error cargando temas:', e);
        if (!cancelled) {
          setArchivos([]);
          Swal.fire({
            icon: 'error',
            title: 'Error',
            text: e?.response?.data?.error || e.message || 'No se pudieron cargar los temas',
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hijos, bimestre, apiBase]);

  const selectedSet = useMemo(() => new Set(selectedOrderIds.map((x) => String(x))), [selectedOrderIds]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const a of archivos) {
      const key = String(a.asignatura_id || a.curso_nombre || 'curso');
      if (!map.has(key)) {
        map.set(key, {
          key,
          curso_nombre: a.curso_nombre || 'Curso',
          docente_nombre: a.docente_nombre || 'Docente',
          hijosNombres: new Set(),
          items: [],
        });
      }
      const g = map.get(key);
      if (a.hijosNombres?.length) a.hijosNombres.forEach((n) => g.hijosNombres.add(n));
      g.items.push(a);
    }
    const res = Array.from(map.values()).map((g) => ({
      ...g,
      hijosNombres: Array.from(g.hijosNombres || []),
    }));

    // Orden: por nombre de curso, y dentro por orden/fecha
    res.sort((a, b) => String(a.curso_nombre).localeCompare(String(b.curso_nombre)));
    for (const g of res) {
      g.items.sort((x, y) => (x.orden || 0) - (y.orden || 0));
    }
    return res;
  }, [archivos]);

  const toggleSelect = (archivoId, checkedNow) => {
    const idStr = String(archivoId);
    const isSelected = selectedSet.has(idStr);

    if (checkedNow && !isSelected) {
      if (selectedOrderIds.length >= MAX_SELECCION) {
        Swal.fire({
          icon: 'warning',
          title: 'Límite de selección',
          text: `Solo puedes seleccionar hasta ${MAX_SELECCION} PDFs.`,
          confirmButtonText: 'Entendido',
        });
        return;
      }
      setSelectedOrderIds((prev) => [...prev, archivoId]);
      return;
    }

    if (!checkedNow && isSelected) {
      setSelectedOrderIds((prev) => prev.filter((x) => String(x) !== idStr));
    }
  };

  const imprimirIndividual = (archivo) => {
    if (!archivo?.archivo_url) {
      Swal.fire({ icon: 'info', title: 'Sin PDF', text: 'Este archivo no tiene URL pública disponible.' });
      return;
    }
    window.open(archivo.archivo_url, '_blank', 'noopener,noreferrer');
  };

  const imprimirSeleccion = async () => {
    if (selectedOrderIds.length === 0) {
      Swal.fire({
        icon: 'info',
        title: 'Nada seleccionado',
        text: 'Selecciona al menos un tema/ficha para imprimir.',
        confirmButtonText: 'Entendido',
      });
      return;
    }

    try {
      Swal.fire({
        title: 'Generando PDF...',
        text: 'Un momento por favor.',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      const endpoint = `${apiBase}/hijos/aula-virtual/temas/merge-pdf`;
      const response = await api.post(endpoint, {
        archivoIds: selectedOrderIds,
        ciclo: bimestre,
      });

      const downloadUrl = response.data?.downloadUrl;
      const failed = Array.isArray(response.data?.failed) ? response.data.failed : [];

      if (!downloadUrl) {
        Swal.close();
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: response.data?.error || 'No se pudo generar el PDF concatenado.',
        });
        return;
      }

      Swal.close();
      window.open(downloadUrl, '_blank', 'noopener,noreferrer');

      if (failed.length > 0) {
        Swal.fire({
          icon: 'warning',
          title: 'Algunos PDFs no pudieron cargarse',
          text: `Se generó el PDF con los restantes. Fallaron: ${failed.length} archivo(s).`,
          confirmButtonText: 'Entendido',
        });
      }
    } catch (e) {
      console.error('[TemasHijos] Error generando PDF concatenado:', e);
      Swal.close();
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e?.response?.data?.error || e.message || 'No se pudo generar el PDF',
        confirmButtonText: 'Entendido',
      });
    }
  };

  const limpiarSeleccion = () => {
    setSelectedOrderIds([]);
  };

  return (
    <DashboardLayout>
      <div className="th-root">
        <div className="th-hero">
          <div className="th-hero-icon">📚</div>
          <div className="th-hero-text">
            <h1>Temas & Fichas</h1>
            <p>
              Selecciona por bimestre e imprime temas/fichas individuales o en un solo PDF (hasta {MAX_SELECCION}).
            </p>
          </div>
        </div>

        <div className="th-toolbar">
          <div className="th-toolbar-label">Bimestre</div>
          <div className="th-ciclos">
            {BIMESTRES.map((b) => (
              <button
                key={b}
                type="button"
                className={`th-ciclo-btn ${b === bimestre ? 'active' : ''}`}
                onClick={() => setBimestre(b)}
              >
                B{b}
              </button>
            ))}
          </div>

          <div className="th-toolbar-right">
            <div className="th-badge">
              Seleccionados: <strong>{selectedOrderIds.length}</strong>/{MAX_SELECCION}
            </div>
          </div>
        </div>

        <div className="th-actions">
          <button type="button" className="th-btn" onClick={imprimirSeleccion} disabled={loading}>
            🖨️ Imprimir PDF único
          </button>
          <button type="button" className="th-btn th-btn-ghost" onClick={limpiarSeleccion} disabled={loading || selectedOrderIds.length === 0}>
            Limpiar
          </button>

          <div className="th-back">
            <button
              type="button"
              className="th-link-btn"
              onClick={() => navigate(esDocente ? '/docente/hijos' : '/apoderado/hijos')}
            >
              Volver a Hijos a cargo
            </button>
          </div>
        </div>

        {loading ? (
          <div className="th-loading">
            <div className="th-spinner" />
            <div>Cargando temas...</div>
          </div>
        ) : archivos.length === 0 ? (
          <div className="th-empty">
            <div className="th-empty-title">No hay temas para este bimestre</div>
            <div className="th-empty-sub">Si el docente aún no sube archivos, aparecerán más adelante.</div>
          </div>
        ) : (
          <div className="th-groups">
            {grouped.map((g) => (
              <div key={g.key} className="th-group">
                <div className="th-group-header">
                  <div className="th-group-title">
                    <span className="th-group-course">{g.curso_nombre}</span>
                    <span className="th-group-dot">·</span>
                    <span className="th-group-teacher"> {g.docente_nombre}</span>
                  </div>
                  <div className="th-group-meta">
                    {g.hijosNombres?.length ? `Hijos: ${g.hijosNombres.length}` : ''}
                    <span className="th-group-sep">|</span>
                    {g.items.length} PDF(s)
                  </div>
                </div>

                <div className="th-items">
                  {g.items.map((a) => {
                    const checked = selectedSet.has(String(a.id));
                    const disabled = !checked && selectedOrderIds.length >= MAX_SELECCION;
                    return (
                      <div key={a.id} className={`th-item-card ${checked ? 'selected' : ''}`}>
                        <div className="th-item-left">
                          <label className={`th-checkbox ${disabled ? 'disabled' : ''}`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={disabled}
                              onChange={(e) => toggleSelect(a.id, e.target.checked)}
                            />
                            <span className="th-checkbox-ui" />
                          </label>
                        </div>

                        <div className="th-item-main">
                          <div className="th-item-name" title={a.nombre || ''}>
                            {a.nombre || 'Tema sin nombre'}
                          </div>
                          <div className="th-item-sub">
                            {a.hijosNombres?.length ? `Hijos: ${a.hijosNombres[0]}${a.hijosNombres.length > 1 ? ' +' + (a.hijosNombres.length - 1) : ''}` : ''}
                            {a.fecha_hora ? <span className="th-item-sub-sep">·</span> : null}
                            {a.fecha_hora ? getFechaLabel(a.fecha_hora) : null}
                          </div>
                        </div>

                        <div className="th-item-right">
                          <button type="button" className="th-btn th-btn-small" onClick={() => imprimirIndividual(a)}>
                            Abrir
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default TemasHijosPage;

