import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import api from '../../services/api';
import Swal from 'sweetalert2';
import '../../pages/admin/AdminConfigIndicadores.css';

export default function ModalAsignarIndicadoresPlantilla({
  open,
  plantillaId,
  plantillaNombre,
  onClose,
  onDone,
}) {
  const [meta, setMeta] = useState(null);
  const [nivelIds, setNivelIds] = useState([]);
  const [modo, setModo] = useState('agregar');
  const [eliminarObsoletos, setEliminarObsoletos] = useState(false);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [asignando, setAsignando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNivelIds([]);
    setModo('agregar');
    setEliminarObsoletos(false);
    setPreview(null);
    api.get('/admin/indicadores-plantillas/meta-asignacion').then(({ data }) => setMeta(data));
  }, [open]);

  const cargarPreview = useCallback(async () => {
    if (!plantillaId) return;
    setLoading(true);
    try {
      const { data } = await api.post(
        `/admin/indicadores-plantillas/${plantillaId}/preview-asignacion`,
        { nivel_ids: nivelIds, modo }
      );
      setPreview(data);
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error en vista previa' });
    } finally {
      setLoading(false);
    }
  }, [plantillaId, nivelIds, modo]);

  useEffect(() => {
    if (open && plantillaId) cargarPreview();
  }, [open, plantillaId, cargarPreview]);

  const toggleNivel = (id) => {
    const sid = String(id);
    setNivelIds((prev) =>
      prev.some((x) => String(x) === sid) ? prev.filter((x) => String(x) !== sid) : [...prev, id]
    );
  };

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
        nivel_ids: nivelIds.length ? nivelIds : [],
        modo,
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
      <div className="admin-ind-modal" onClick={(e) => e.stopPropagation()} role="dialog">
        <h3>Asignar: {plantillaNombre}</h3>
        <p style={{ fontSize: '0.88rem', color: '#64748b' }}>
          Año {meta?.anio_activo}. Solo niveles cuantitativos.
        </p>
        <div className="admin-ind-niveles-grid">
          {(meta?.niveles || []).map((n) => (
            <button
              key={n.id}
              type="button"
              className={`admin-ind-nivel-chip ${nivelIds.some((x) => String(x) === String(n.id)) ? 'selected' : ''}`}
              onClick={() => toggleNivel(n.id)}
            >
              {n.nombre}
            </button>
          ))}
        </div>
        <select value={modo} onChange={(e) => setModo(e.target.value)} style={{ width: '100%', marginTop: 8, padding: 8 }}>
          <option value="solo_vacias">Solo asignaturas sin criterios</option>
          <option value="agregar">Agregar faltantes</option>
          <option value="reemplazar_sin_notas">Quitar criterios sin notas y agregar faltantes</option>
        </select>
        <div className="admin-ind-check-group">
          <label>
            <input type="checkbox" checked={eliminarObsoletos} onChange={(e) => setEliminarObsoletos(e.target.checked)} />
            Eliminar criterios que ya no están en la plantilla (solo sin notas)
          </label>
        </div>
        {preview && (
          <p style={{ marginTop: 12, fontSize: '0.9rem' }}>
            Destino: <strong>{preview.destino ?? preview.total_asignaturas}</strong> asignatura(s)
          </p>
        )}
        <div className="admin-ind-modal-actions">
          <button type="button" className="admin-ind-btn" onClick={onClose} disabled={asignando}>Cancelar</button>
          <button type="button" className="admin-ind-btn admin-ind-btn-primary" onClick={asignar} disabled={asignando || loading}>
            {asignando ? 'Asignando…' : 'Asignar'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

