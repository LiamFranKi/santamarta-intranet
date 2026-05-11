import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import api from '../../services/api';
import Swal from 'sweetalert2';
import './libretaInicialDocente.css';

const ALCANCE_OPTS = [
  { v: 0, l: 'Todo el año (I–IV)' },
  { v: 1, l: 'Solo I bimestre' },
  { v: 2, l: 'Solo II bimestre' },
  { v: 3, l: 'Solo III bimestre' },
  { v: 4, l: 'Solo IV bimestre' }
];

function etiquetaAlcance(v) {
  const n = Number(v);
  const o = ALCANCE_OPTS.find((x) => x.v === n);
  return o ? o.l : 'Todo el año (I–IV)';
}

export default function LibretaInicialAreasModal({ grupo, onClose }) {
  const [loading, setLoading] = useState(true);
  const [areas, setAreas] = useState([]);
  const [openArea, setOpenArea] = useState({});
  const [nuevaArea, setNuevaArea] = useState('');
  const [nuevoInd, setNuevoInd] = useState({});
  /** Bimestre en el que se listan / crean indicadores (API filtra alcance). */
  const [bimestreVista, setBimestreVista] = useState(1);
  /** Alcance del próximo indicador a agregar (0 = todo el año; 1–4 = solo ese bimestre). */
  const [alcanceNuevo, setAlcanceNuevo] = useState(1);
  /** Borrador local del nombre por área (el guardado explícito evita depender solo del blur). */
  const [nombreAreaBorrador, setNombreAreaBorrador] = useState({});

  const grupoId = grupo?.id;

  useEffect(() => {
    setAlcanceNuevo(bimestreVista);
  }, [bimestreVista]);

  const load = useCallback(async () => {
    if (!grupoId) return;
    try {
      setLoading(true);
      const { data } = await api.get(`/docente/grupos/${grupoId}/libreta-inicial/estructura`, {
        params: { ciclo: bimestreVista }
      });
      setAreas(data.areas || []);
    } catch (e) {
      const msg = e.response?.data?.error || e.message || 'No se pudo cargar';
      await Swal.fire({ icon: 'error', title: 'Error', text: msg });
      onClose();
    } finally {
      setLoading(false);
    }
  }, [grupoId, onClose, bimestreVista]);

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

  const updateAlcanceIndicador = async (indicadorId, alcance) => {
    try {
      await api.put(`/docente/grupos/${grupoId}/libreta-inicial/indicadores/${indicadorId}`, {
        alcance_ciclo: Number(alcance)
      });
      await load();
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error al actualizar alcance' });
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
              <div className="li-toolbar" style={{ alignItems: 'center', marginBottom: '0.75rem' }}>
                <label htmlFor="li-bim-estructura" style={{ fontWeight: 600, color: '#334155', fontSize: '0.88rem' }}>
                  Ver / editar indicadores del bimestre:
                </label>
                <select
                  id="li-bim-estructura"
                  className="li-input"
                  style={{ width: 'auto', minWidth: 120 }}
                  value={bimestreVista}
                  onChange={(e) => setBimestreVista(parseInt(e.target.value, 10))}
                >
                  <option value={1}>I</option>
                  <option value={2}>II</option>
                  <option value={3}>III</option>
                  <option value={4}>IV</option>
                </select>
                <span style={{ color: '#64748b', fontSize: '0.82rem', flex: '1 1 200px' }}>
                  Se muestran indicadores de <strong>todo el año</strong> y los de <strong>este bimestre</strong>. Al
                  imprimir la libreta, el apoderado elige el bimestre y verá la misma regla.
                </span>
              </div>
              <div className="li-toolbar" style={{ alignItems: 'center', marginBottom: '0.5rem' }}>
                <label htmlFor="li-alcance-nuevo" style={{ fontWeight: 600, color: '#334155', fontSize: '0.88rem' }}>
                  Nuevos indicadores serán:
                </label>
                <select
                  id="li-alcance-nuevo"
                  className="li-input"
                  style={{ flex: '1 1 220px', maxWidth: 320 }}
                  value={alcanceNuevo}
                  onChange={(e) => setAlcanceNuevo(parseInt(e.target.value, 10))}
                >
                  {ALCANCE_OPTS.map((o) => (
                    <option key={o.v} value={o.v}>
                      {o.l}
                    </option>
                  ))}
                </select>
              </div>
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
                              <th style={{ minWidth: 200 }}>Alcance</th>
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
                                  <select
                                    className="li-input"
                                    style={{ width: '100%', fontSize: '0.82rem' }}
                                    value={Number(ind.alcance_ciclo ?? 0)}
                                    onChange={(e) => updateAlcanceIndicador(ind.id, e.target.value)}
                                  >
                                    {ALCANCE_OPTS.map((o) => (
                                      <option key={o.v} value={o.v}>
                                        {o.l}
                                      </option>
                                    ))}
                                  </select>
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
