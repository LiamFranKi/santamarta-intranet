import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import api from '../../services/api';
import Swal from 'sweetalert2';
import './libretaInicialDocente.css';

export default function LibretaInicialAreasModal({ grupo, onClose }) {
  const [loading, setLoading] = useState(true);
  const [areas, setAreas] = useState([]);
  const [openArea, setOpenArea] = useState({});
  const [nuevaArea, setNuevaArea] = useState('');
  const [nuevoInd, setNuevoInd] = useState({});
  /** Borrador local del nombre por área (el guardado explícito evita depender solo del blur). */
  const [nombreAreaBorrador, setNombreAreaBorrador] = useState({});

  const grupoId = grupo?.id;

  const load = useCallback(async () => {
    if (!grupoId) return;
    try {
      setLoading(true);
      const { data } = await api.get(`/docente/grupos/${grupoId}/libreta-inicial/estructura`);
      setAreas(data.areas || []);
    } catch (e) {
      const msg = e.response?.data?.error || e.message || 'No se pudo cargar';
      await Swal.fire({ icon: 'error', title: 'Error', text: msg });
      onClose();
    } finally {
      setLoading(false);
    }
  }, [grupoId, onClose]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    document.body.classList.add('li-libreta-modal-open');
    return () => document.body.classList.remove('li-libreta-modal-open');
  }, []);

  useEffect(() => {
    setNombreAreaBorrador({});
  }, [areas]);

  const addArea = async () => {
    const nombre = nuevaArea.trim();
    if (!nombre) return;
    try {
      await api.post(`/docente/grupos/${grupoId}/libreta-inicial/areas`, { nombre });
      setNuevaArea('');
      await load();
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error al crear área' });
    }
  };

  const updateAreaNombre = async (areaId, nombre) => {
    const n = String(nombre || '').trim();
    if (!n) return;
    try {
      await api.put(`/docente/grupos/${grupoId}/libreta-inicial/areas/${areaId}`, { nombre: n });
      await load();
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error' });
    }
  };

  const guardarNombreArea = async (areaId, nombreServidor) => {
    const texto = String(
      nombreAreaBorrador[areaId] !== undefined ? nombreAreaBorrador[areaId] : nombreServidor || ''
    ).trim();
    if (!texto) {
      await Swal.fire({ icon: 'warning', text: 'El nombre del área no puede quedar vacío.' });
      return;
    }
    if (texto === String(nombreServidor || '').trim()) return;
    await updateAreaNombre(areaId, texto);
  };

  const textoNombreArea = (area) =>
    nombreAreaBorrador[area.id] !== undefined ? nombreAreaBorrador[area.id] : area.nombre;

  const deleteArea = async (areaId) => {
    const ok = await Swal.fire({
      title: '¿Eliminar área?',
      text: 'Se eliminarán también todos sus indicadores.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/docente/grupos/${grupoId}/libreta-inicial/areas/${areaId}`);
      await load();
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error' });
    }
  };

  const addIndicador = async (areaId) => {
    const descripcion = String(nuevoInd[areaId] || '').trim();
    if (!descripcion) return;
    try {
      await api.post(`/docente/grupos/${grupoId}/libreta-inicial/indicadores`, { area_id: areaId, descripcion });
      setNuevoInd((p) => ({ ...p, [areaId]: '' }));
      await load();
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error' });
    }
  };

  const updateIndicador = async (indicadorId, descripcion) => {
    const d = String(descripcion || '').trim();
    if (!d) return;
    try {
      await api.put(`/docente/grupos/${grupoId}/libreta-inicial/indicadores/${indicadorId}`, { descripcion: d });
      await load();
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error' });
    }
  };

  const deleteIndicador = async (indicadorId) => {
    const ok = await Swal.fire({
      title: '¿Eliminar indicador?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar'
    });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/docente/grupos/${grupoId}/libreta-inicial/indicadores/${indicadorId}`);
      await load();
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error' });
    }
  };

  const tituloGrupo = `${grupo?.grado}° ${grupo?.seccion || ''} — ${grupo?.nivel_nombre || ''}`;

  return createPortal(
    <div className="li-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="li-modal" role="dialog" aria-labelledby="li-areas-title" onClick={(e) => e.stopPropagation()}>
        <div className="li-modal-header">
          <div>
            <h2 id="li-areas-title">Áreas e indicadores</h2>
            <p className="li-modal-sub">{tituloGrupo}</p>
          </div>
          <button type="button" className="li-btn-close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div className="li-modal-body">
          {loading ? (
            <div className="li-loading">Cargando…</div>
          ) : (
            <>
              <div className="li-toolbar">
                <input
                  className="li-input"
                  style={{ flex: '1 1 200px' }}
                  placeholder="Nombre del área (ej. Comunicación)"
                  value={nuevaArea}
                  onChange={(e) => setNuevaArea(e.target.value)}
                />
                <button type="button" className="li-btn li-btn-primary" onClick={addArea}>
                  Agregar área
                </button>
              </div>

              {areas.length === 0 ? (
                <p style={{ color: '#64748b' }}>Aún no hay áreas. Cree la primera con el campo superior.</p>
              ) : (
                areas.map((a) => (
                  <div key={a.id} className="li-accordion">
                    <button
                      type="button"
                      className="li-accordion-head"
                      onClick={() => setOpenArea((p) => ({ ...p, [a.id]: !p[a.id] }))}
                    >
                      <span>{openArea[a.id] ? '▼' : '▶'} {a.nombre}</span>
                      <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{a.indicadores?.length || 0} indicadores</span>
                    </button>
                    {openArea[a.id] && (
                      <div className="li-accordion-body">
                        <div className="li-area-nombre-edit" style={{ marginBottom: '0.75rem' }}>
                          <label className="li-field-label" htmlFor={`li-area-nombre-${a.id}`}>
                            Nombre del área
                          </label>
                          <div className="li-toolbar">
                            <input
                              id={`li-area-nombre-${a.id}`}
                              className="li-input"
                              style={{ flex: '1 1 200px' }}
                              value={textoNombreArea(a)}
                              onChange={(e) => setNombreAreaBorrador((p) => ({ ...p, [a.id]: e.target.value }))}
                            />
                            <button
                              type="button"
                              className="li-btn li-btn-ghost"
                              onClick={() => guardarNombreArea(a.id, a.nombre)}
                              disabled={
                                textoNombreArea(a).trim() === String(a.nombre || '').trim() ||
                                !textoNombreArea(a).trim()
                              }
                            >
                              Guardar nombre
                            </button>
                          </div>
                          <button type="button" className="li-btn li-btn-danger" onClick={() => deleteArea(a.id)}>
                            Eliminar área
                          </button>
                        </div>
                        <table className="li-table-mini">
                          <thead>
                            <tr>
                              <th>Indicador</th>
                              <th style={{ width: 90 }}> </th>
                            </tr>
                          </thead>
                          <tbody>
                            {(a.indicadores || []).map((ind) => (
                              <tr key={ind.id}>
                                <td>
                                  <input
                                    className="li-input"
                                    style={{ width: '100%' }}
                                    defaultValue={ind.descripcion}
                                    key={`ind-${ind.id}-${ind.descripcion}`}
                                    onBlur={(e) => {
                                      if (e.target.value.trim() !== ind.descripcion) {
                                        updateIndicador(ind.id, e.target.value);
                                      }
                                    }}
                                  />
                                </td>
                                <td>
                                  <button
                                    type="button"
                                    className="li-btn li-btn-danger"
                                    onClick={() => deleteIndicador(ind.id)}
                                  >
                                    Quitar
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="li-toolbar" style={{ marginTop: '0.5rem' }}>
                          <input
                            className="li-input"
                            style={{ flex: 1 }}
                            placeholder="Nuevo indicador"
                            value={nuevoInd[a.id] || ''}
                            onChange={(e) => setNuevoInd((p) => ({ ...p, [a.id]: e.target.value }))}
                          />
                          <button type="button" className="li-btn li-btn-primary" onClick={() => addIndicador(a.id)}>
                            Agregar indicador
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
