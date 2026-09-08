import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import './TemasHijos.css';

const MAX_SELECCION = 20;
const BIMESTRES = [1, 2, 3, 4];

function nombreCompletoHijo(hijo) {
  if (!hijo) return '';
  return [hijo.nombres, hijo.apellido_paterno, hijo.apellido_materno]
    .filter(Boolean)
    .join(' ')
    .trim();
}

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
  const { hijoId } = useParams();

  const esDocente = String(location.pathname || '').startsWith('/docente');
  const apiBase = esDocente ? '/docente' : '/apoderado';
  const hijosHome = esDocente ? '/docente/hijos' : '/apoderado/hijos';

  const [loading, setLoading] = useState(true);
  const [hijo, setHijo] = useState(null);
  const [bimestre, setBimestre] = useState(1);
  const [archivos, setArchivos] = useState([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);

  const requestIdRef = useRef(0);
  const hijoNombre = nombreCompletoHijo(hijo);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!hijoId) {
        setHijo(null);
        return;
      }
      try {
        const endpoint = esDocente ? '/docente/roles-adicionales' : '/apoderado/hijos';
        const response = await api.get(endpoint);
        const lista = Array.isArray(response.data?.hijos) ? response.data.hijos : [];
        const encontrado = lista.find((h) => String(h.id) === String(hijoId)) || null;
        if (!cancelled) setHijo(encontrado);
      } catch (e) {
        console.error('[TemasHijos] Error cargando hijo:', e);
        if (!cancelled) setHijo(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [esDocente, hijoId]);

  useEffect(() => {
    if (!hijoId) return;
    let cancelled = false;
    const reqId = ++requestIdRef.current;

    (async () => {
      setLoading(true);
      try {
        const cursosResp = await api.get(`${apiBase}/hijos/${hijoId}/cursos`);
        const cursos = Array.isArray(cursosResp.data?.cursos) ? cursosResp.data.cursos : [];
        const archivoById = new Map();

        for (const curso of cursos) {
          const asignaturaId = curso?.asignatura_id;
          if (!asignaturaId) continue;

          const archivosResp = await api.get(`${apiBase}/hijos/${hijoId}/aula-virtual/archivos`, {
            params: { asignatura_id: asignaturaId, ciclo: bimestre },
          });
          const lista = Array.isArray(archivosResp.data?.archivos) ? archivosResp.data.archivos : [];

          for (const a of lista) {
            const id = a?.id;
            if (id == null) continue;
            const key = String(id);
            if (archivoById.has(key)) continue;
            archivoById.set(key, {
              id,
              nombre: a?.nombre || '',
              archivo_url: a?.archivo_url || null,
              fecha_hora: a?.fecha_hora || null,
              ciclo: a?.ciclo || bimestre,
              orden: a?.orden || 0,
              asignatura_id: curso?.asignatura_id || null,
              curso_nombre: curso?.curso_nombre || 'Curso',
              docente_nombre: a?.docente_nombre || curso?.docente_nombre || 'Docente',
            });
          }
        }

        if (cancelled || requestIdRef.current !== reqId) return;
        setArchivos(Array.from(archivoById.values()));
        setSelectedOrderIds([]);
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
  }, [hijoId, bimestre, apiBase]);

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
          items: [],
        });
      }
      map.get(key).items.push(a);
    }
    const res = Array.from(map.values());
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

      const response = await api.post(
        `${apiBase}/hijos/${hijoId}/aula-virtual/temas/merge-pdf`,
        { archivoIds: selectedOrderIds, ciclo: bimestre },
        { responseType: 'blob' }
      );

      const blob = response.data instanceof Blob
        ? response.data
        : new Blob([response.data], { type: 'application/pdf' });

      if (blob.type && blob.type.includes('application/json')) {
        const text = await blob.text();
        let parsed = {};
        try { parsed = JSON.parse(text); } catch { parsed = {}; }
        Swal.close();
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: parsed.error || 'No se pudo generar el PDF concatenado.',
        });
        return;
      }

      const objectUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      window.open(objectUrl, '_blank', 'noopener,noreferrer');
      Swal.close();

      const failedCount = parseInt(response.headers?.['x-temas-failed-count'], 10) || 0;
      if (failedCount > 0) {
        Swal.fire({
          icon: 'warning',
          title: 'Algunos PDFs no pudieron cargarse',
          text: `Se generó el PDF con los restantes. Fallaron: ${failedCount} archivo(s).`,
          confirmButtonText: 'Entendido',
        });
      }
    } catch (e) {
      console.error('[TemasHijos] Error generando PDF concatenado:', e);
      Swal.close();
      let msg = e.message || 'No se pudo generar el PDF';
      const errData = e?.response?.data;
      if (errData instanceof Blob) {
        try {
          const parsed = JSON.parse(await errData.text());
          if (parsed?.error) msg = parsed.error;
        } catch { /* ignore */ }
      } else if (errData?.error) {
        msg = errData.error;
      }
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: msg,
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
              {hijoNombre
                ? `Material de ${hijoNombre}. Elige el bimestre e imprime uno o varios PDF (hasta ${MAX_SELECCION}).`
                : `Selecciona por bimestre e imprime temas/fichas individuales o en un solo PDF (hasta ${MAX_SELECCION}).`}
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
            <button type="button" className="th-link-btn" onClick={() => navigate(hijosHome)}>
              Volver a Estudiantes a cargo
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
                            {a.fecha_hora ? getFechaLabel(a.fecha_hora) : ''}
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
