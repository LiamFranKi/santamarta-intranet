import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import api from '../../services/api';
import Swal from 'sweetalert2';
import '../../pages/admin/AdminConfigIndicadores.css';

function toggleId(list, id) {
  const sid = String(id);
  return list.some((x) => String(x) === sid)
    ? list.filter((x) => String(x) !== sid)
    : [...list, id];
}

export default function ModalAsignarIndicadoresPlantilla({
  open,
  plantillaId,
  plantillaNombre,
  onClose,
  onDone,
}) {
  const [meta, setMeta] = useState(null);
  const [nivelIds, setNivelIds] = useState([]);
  const [cursoIds, setCursoIds] = useState([]);
  const [asignaturaIds, setAsignaturaIds] = useState([]);
  const [modo, setModo] = useState('agregar');
  const [desdeCiclo, setDesdeCiclo] = useState(1);
  const [eliminarObsoletos, setEliminarObsoletos] = useState(false);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [asignando, setAsignando] = useState(false);
  const [filtroAsig, setFiltroAsig] = useState('');
  const [seccion, setSeccion] = useState('alcance');

  useEffect(() => {
    if (!open) return;
    setNivelIds([]);
    setCursoIds([]);
    setAsignaturaIds([]);
    setModo('agregar');
    setDesdeCiclo(1);
    setEliminarObsoletos(false);
    setPreview(null);
    setFiltroAsig('');
    setSeccion('alcance');
    api.get('/admin/indicadores-plantillas/meta-asignacion').then(({ data }) => setMeta(data));
  }, [open]);

  const cursosVisibles = useMemo(() => {
    const cursos = meta?.cursos || [];
    if (!nivelIds.length) return cursos;
    const setN = new Set(nivelIds.map(String));
    return cursos.filter((c) => setN.has(String(c.nivel_id)));
  }, [meta, nivelIds]);

  const asignaturasVisibles = useMemo(() => {
    let list = meta?.asignaturas || [];
    if (nivelIds.length) {
      const setN = new Set(nivelIds.map(String));
      list = list.filter((a) => setN.has(String(a.nivel_id)));
    }
    if (cursoIds.length) {
      const setC = new Set(cursoIds.map(String));
      list = list.filter((a) => setC.has(String(a.curso_id)));
    }
    const q = filtroAsig.trim().toLowerCase();
    if (q) {
      list = list.filter((a) => {
        const label = `${a.curso_nombre || ''} ${a.nivel_nombre || ''} ${a.grado || ''} ${a.seccion || ''}`.toLowerCase();
        return label.includes(q);
      });
    }
    return list;
  }, [meta, nivelIds, cursoIds, filtroAsig]);

  const alcancePayload = useCallback(() => {
    const payload = {
      nivel_ids: nivelIds.length ? nivelIds : [],
      curso_ids: cursoIds.length ? cursoIds : [],
      asignatura_ids: asignaturaIds.length ? asignaturaIds : [],
      modo,
      desde_ciclo: desdeCiclo,
    };
    return payload;
  }, [nivelIds, cursoIds, asignaturaIds, modo, desdeCiclo]);

  const cargarPreview = useCallback(async () => {
    if (!plantillaId) return;
    setLoading(true);
    try {
      const { data } = await api.post(
        `/admin/indicadores-plantillas/${plantillaId}/preview-asignacion`,
        alcancePayload()
      );
      setPreview(data);
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error en vista previa' });
    } finally {
      setLoading(false);
    }
  }, [plantillaId, alcancePayload]);

  useEffect(() => {
    if (open && plantillaId && meta) cargarPreview();
  }, [open, plantillaId, meta, cargarPreview]);

  const onToggleNivel = (id) => {
    setNivelIds((prev) => toggleId(prev, id));
    setCursoIds([]);
    setAsignaturaIds([]);
  };

  const onToggleCurso = (id) => {
    setCursoIds((prev) => toggleId(prev, id));
    setAsignaturaIds([]);
  };

  const onToggleAsignatura = (id) => {
    setAsignaturaIds((prev) => toggleId(prev, id));
  };

  const seleccionarTodasAsignaturasVisibles = () => {
    setAsignaturaIds(asignaturasVisibles.map((a) => a.id));
  };

  const limpiarAsignaturas = () => setAsignaturaIds([]);

  const asignar = async () => {
    const destino = preview?.destino ?? preview?.total_asignaturas ?? 0;
    if (destino === 0) {
      Swal.fire(
        'Sin destino',
        'No hay asignaturas que reciban la plantilla con el alcance y modo elegidos.',
        'info'
      );
      return;
    }
    const confirm = await Swal.fire({
      title: '¿Asignar plantilla?',
      html: `Se aplicará <strong>${plantillaNombre}</strong> a <strong>${destino}</strong> asignatura(s).<br/><small>No se borran notas ya registradas.</small>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, asignar',
    });
    if (!confirm.isConfirmed) return;

    setAsignando(true);
    try {
      const { data } = await api.post(`/admin/indicadores-plantillas/${plantillaId}/asignar`, {
        ...alcancePayload(),
        eliminar_obsoletos_sin_notas: eliminarObsoletos,
      });
      const r = data.resumen || {};
      await Swal.fire({
        icon: 'success',
        title: 'Listo',
        html: `Procesadas: ${r.asignaturas_procesadas || 0}<br/>Creados: ${r.creados || 0}<br/>Omitidos: ${r.omitidos || 0}`,
      });
      onDone?.();
      onClose();
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error al asignar' });
    } finally {
      setAsignando(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="admin-ind-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="admin-ind-modal admin-ind-modal--wide"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="admin-ind-modal-title"
      >
        <div className="admin-ind-modal-hero">
          <div className="admin-ind-modal-hero-icon" aria-hidden="true">
            🚀
          </div>
          <div>
            <h3 id="admin-ind-modal-title">Asignar: {plantillaNombre}</h3>
            <p>
              Año {meta?.anio_activo ?? '—'}. Solo niveles cuantitativos. Puede limitar por nivel, curso o
              asignaturas concretas.
            </p>
          </div>
          <button type="button" className="admin-ind-modal-close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>

        <div className="admin-ind-modal-tabs">
          <button
            type="button"
            className={`admin-ind-modal-tab ${seccion === 'alcance' ? 'is-active' : ''}`}
            onClick={() => setSeccion('alcance')}
          >
            🎯 Alcance
          </button>
          <button
            type="button"
            className={`admin-ind-modal-tab ${seccion === 'modo' ? 'is-active' : ''}`}
            onClick={() => setSeccion('modo')}
          >
            ⚙️ Modo
          </button>
        </div>

        {seccion === 'alcance' && (
          <div className="admin-ind-modal-body">
            <div className="admin-ind-scope-block">
              <div className="admin-ind-scope-label">
                <span>1 · Niveles</span>
                <small>Vacío = todos los cuantitativos</small>
              </div>
              <div className="admin-ind-niveles-grid">
                {(meta?.niveles || []).map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className={`admin-ind-nivel-chip ${
                      nivelIds.some((x) => String(x) === String(n.id)) ? 'selected' : ''
                    }`}
                    onClick={() => onToggleNivel(n.id)}
                  >
                    {n.nombre}
                  </button>
                ))}
              </div>
            </div>

            <div className="admin-ind-scope-block">
              <div className="admin-ind-scope-label">
                <span>2 · Cursos</span>
                <small>Vacío = todos los cursos del alcance</small>
              </div>
              <div className="admin-ind-niveles-grid">
                {cursosVisibles.length === 0 && (
                  <p className="admin-ind-scope-empty">Sin cursos en el filtro actual.</p>
                )}
                {cursosVisibles.map((c) => (
                  <button
                    key={`${c.id}-${c.nivel_id}`}
                    type="button"
                    className={`admin-ind-nivel-chip admin-ind-nivel-chip--curso ${
                      cursoIds.some((x) => String(x) === String(c.id)) ? 'selected' : ''
                    }`}
                    onClick={() => onToggleCurso(c.id)}
                    title={c.nivel_nombre}
                  >
                    {c.nombre}
                    <em>{c.nivel_nombre}</em>
                  </button>
                ))}
              </div>
            </div>

            <div className="admin-ind-scope-block">
              <div className="admin-ind-scope-label">
                <span>3 · Asignaturas (opcional)</span>
                <small>Vacío = todas las del nivel/curso</small>
              </div>
              <div className="admin-ind-asig-tools">
                <input
                  type="search"
                  placeholder="Buscar curso, grado, sección…"
                  value={filtroAsig}
                  onChange={(e) => setFiltroAsig(e.target.value)}
                />
                <button type="button" className="admin-ind-btn" onClick={seleccionarTodasAsignaturasVisibles}>
                  Todas visibles
                </button>
                <button type="button" className="admin-ind-btn" onClick={limpiarAsignaturas}>
                  Limpiar
                </button>
              </div>
              <div className="admin-ind-asig-list">
                {asignaturasVisibles.length === 0 && (
                  <p className="admin-ind-scope-empty">Sin asignaturas para mostrar.</p>
                )}
                {asignaturasVisibles.map((a) => {
                  const checked = asignaturaIds.some((x) => String(x) === String(a.id));
                  return (
                    <label key={a.id} className={`admin-ind-asig-row ${checked ? 'is-checked' : ''}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleAsignatura(a.id)}
                      />
                      <span>
                        <strong>{a.curso_nombre}</strong>
                        <small>
                          {a.nivel_nombre} {a.grado != null ? `${a.grado}°` : ''} — Secc. {a.seccion || '—'}
                        </small>
                      </span>
                    </label>
                  );
                })}
              </div>
              {asignaturaIds.length > 0 && (
                <p className="admin-ind-scope-selected">{asignaturaIds.length} asignatura(s) marcadas</p>
              )}
            </div>
          </div>
        )}

        {seccion === 'modo' && (
          <div className="admin-ind-modal-body">
            <label className="admin-ind-field-label" htmlFor="admin-ind-desde-ciclo">
              Aplicar desde bimestre
            </label>
            <select
              id="admin-ind-desde-ciclo"
              className="admin-ind-select"
              value={desdeCiclo}
              onChange={(e) => setDesdeCiclo(parseInt(e.target.value, 10))}
            >
              <option value={1}>1° bimestre (todo el año / igual que antes)</option>
              <option value={2}>2° bimestre en adelante</option>
              <option value={3}>3° bimestre en adelante</option>
              <option value={4}>Solo 4° bimestre</option>
            </select>
            <p className="admin-ind-modo-hint admin-ind-modo-hint--desde">
              {desdeCiclo <= 1
                ? 'Se aplican los ítems de la plantilla como están (TODOS = ciclo 0).'
                : `Se crean/completan indicadores solo desde el ${desdeCiclo}° bimestre. Los bimestres anteriores no se borran: si ya tienen notas, se conservan intactos.`}
            </p>

            <label className="admin-ind-field-label" htmlFor="admin-ind-modo" style={{ marginTop: '0.85rem' }}>
              Cómo aplicar la plantilla
            </label>
            <select
              id="admin-ind-modo"
              className="admin-ind-select"
              value={modo}
              onChange={(e) => setModo(e.target.value)}
            >
              <option value="solo_vacias">Solo asignaturas sin criterios</option>
              <option value="agregar">Agregar faltantes</option>
              <option value="reemplazar_sin_notas">Quitar criterios sin notas y agregar faltantes</option>
            </select>
            <div className="admin-ind-check-group">
              <label>
                <input
                  type="checkbox"
                  checked={eliminarObsoletos}
                  onChange={(e) => setEliminarObsoletos(e.target.checked)}
                />
                Eliminar criterios obsoletos (solo sin notas; no toca bimestres anteriores al «desde»)
              </label>
            </div>
            <p className="admin-ind-modo-hint">
              Las notas ya registradas no se borran. Alcance vacío (sin nivel/curso/asignatura) = todos los cuantitativos.
            </p>
          </div>
        )}

        <div className="admin-ind-modal-preview">
          {loading ? (
            <span>Calculando destino…</span>
          ) : (
            <>
              Destino: <strong>{preview?.destino ?? preview?.total_asignaturas ?? 0}</strong> asignatura(s)
              {preview?.items_efectivos != null && (
                <>
                  {' '}
                  · Ítems a aplicar: <strong>{preview.items_efectivos}</strong>
                </>
              )}
              {preview?.desde_ciclo != null && (
                <>
                  {' '}
                  · Desde bimestre: <strong>{preview.desde_ciclo}°</strong>
                </>
              )}
            </>
          )}
        </div>

        <div className="admin-ind-modal-actions">
          <button type="button" className="admin-ind-btn" onClick={onClose} disabled={asignando}>
            Cancelar
          </button>
          <button
            type="button"
            className="admin-ind-btn admin-ind-btn-primary"
            onClick={asignar}
            disabled={asignando || loading}
          >
            {asignando ? 'Asignando…' : 'Asignar'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
