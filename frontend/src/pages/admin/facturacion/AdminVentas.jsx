import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CircularProgress, MenuItem, TextField } from '@mui/material';
import Swal from 'sweetalert2';
import DashboardLayout from '../../../components/DashboardLayout';
import api from '../../../services/api';
import { ESTADOS_PAGO_VENTA, SERIES_VENTA, TIPOS_CLIENTE_VENTA, todayIso } from './facturacionHelpers';
import '../pagosEscolares/AdminPagosEscolares.css';
import './AdminFacturacion.css';

const lineaVacia = () => ({ categoria_id: '', concepto_id: '', cantidad: 1, precio: 0, stock: null });

export default function AdminVentas() {
  const [meta, setMeta] = useState({ sedes: [], catalogo: [] });
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fecha1, setFecha1] = useState(todayIso());
  const [fecha2, setFecha2] = useState(todayIso());
  const [modal, setModal] = useState(null);
  const [nroPreview, setNroPreview] = useState('');

  const sedeNombre = useMemo(() => {
    const m = {};
    (meta.sedes || []).forEach((s) => {
      m[s.id] = s.nombre;
    });
    return m;
  }, [meta.sedes]);

  const cargarMeta = useCallback(async () => {
    const { data } = await api.get('/admin/facturacion/meta');
    setMeta(data);
  }, []);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/facturacion/ventas', { params: { fecha1, fecha2, estado: 'ACTIVO' } });
      setItems(data.items || []);
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error al cargar ventas' });
    } finally {
      setLoading(false);
    }
  }, [fecha1, fecha2]);

  useEffect(() => {
    cargarMeta();
  }, [cargarMeta]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const catalogoMap = useMemo(() => {
    const m = {};
    (meta.catalogo || []).forEach((c) => {
      m[c.id] = c;
    });
    return m;
  }, [meta.catalogo]);

  const fetchSiguienteNumero = async (sedeId, serie) => {
    if (!sedeId || !serie) return;
    try {
      const { data } = await api.get('/admin/facturacion/ventas/siguiente-numero', {
        params: { sede_id: sedeId, serie },
      });
      setNroPreview(data.nro_boleta || '');
      setModal((prev) => (prev ? { ...prev, numero: data.numero, serie: data.serie } : prev));
    } catch (e) {
      setNroPreview('');
      Swal.fire({ icon: 'warning', text: e.response?.data?.error || 'Sin numeración configurada para la sede' });
    }
  };

  const abrirNueva = () => {
    const sedeId = meta.sedes[0]?.id || '';
    setModal({
      sede_id: sedeId,
      serie: 1,
      numero: 0,
      nombre: '',
      dni: '',
      fecha: todayIso(),
      tipo: 'EXTERNO',
      estado_pago: 'PENDIENTE',
      tipo_documento: 'BOLETA',
      transferencia_gratuita: 'NO',
      detalles: [lineaVacia()],
    });
    if (sedeId) fetchSiguienteNumero(sedeId, 1);
  };

  const resolveSerieIdx = (venta) => {
    const cfg = (meta.numeracion || []).find((n) => n.sede_id === venta.sede_id);
    if (!cfg) return 1;
    const s = parseInt(venta.serie, 10);
    if (s === parseInt(cfg.serie_2, 10)) return 2;
    if (s === parseInt(cfg.serie_3, 10)) return 3;
    return 1;
  };

  const abrirEditar = async (id) => {
    try {
      const { data } = await api.get(`/admin/facturacion/ventas/${id}`);
      setNroPreview(data.nro_boleta || '');
      setModal({
        ...data,
        serie: resolveSerieIdx(data),
        detalles: (data.detalles || []).map((d) => ({
          categoria_id: d.categoria_id,
          concepto_id: d.concepto_id,
          cantidad: d.cantidad,
          precio: d.precio,
        })),
      });
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudo cargar' });
    }
  };

  const setDetalle = (idx, patch) => {
    setModal((prev) => {
      const detalles = [...prev.detalles];
      detalles[idx] = { ...detalles[idx], ...patch };
      if (patch.categoria_id !== undefined) {
        detalles[idx].concepto_id = '';
        detalles[idx].precio = 0;
      }
      if (patch.concepto_id !== undefined && patch.concepto_id) {
        const cat = catalogoMap[detalles[idx].categoria_id];
        const concepto = cat?.conceptos?.find((x) => String(x.id) === String(patch.concepto_id));
        if (concepto) {
          detalles[idx].precio = concepto.precio_inicial || 0;
          detalles[idx].stock = concepto.stock;
        }
      }
      return { ...prev, detalles };
    });
  };

  const totalModal = useMemo(() => {
    if (!modal?.detalles) return 0;
    return modal.detalles.reduce((s, d) => s + (parseFloat(d.cantidad) || 0) * (parseFloat(d.precio) || 0), 0);
  }, [modal]);

  const guardar = async () => {
    try {
      const payload = { ...modal, detalles: modal.detalles.filter((d) => d.concepto_id) };
      if (modal.id) {
        await api.put(`/admin/facturacion/ventas/${modal.id}`, payload);
      } else {
        await api.post('/admin/facturacion/ventas', payload);
      }
      setModal(null);
      cargar();
      cargarMeta();
      Swal.fire({ icon: 'success', title: 'Venta guardada', timer: 2000, showConfirmButton: false });
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudo guardar' });
    }
  };

  const anular = async (row) => {
    const ok = await Swal.fire({ icon: 'warning', title: '¿Anular / reactivar venta?', showCancelButton: true });
    if (!ok.isConfirmed) return;
    try {
      await api.post(`/admin/facturacion/ventas/${row.id}/toggle-estado`);
      cargar();
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error' });
    }
  };

  const marcarImpresa = async (row) => {
    try {
      const { data } = await api.post(`/admin/facturacion/ventas/${row.id}/marcar-impresa`);
      Swal.fire({ icon: 'success', title: 'Boleta asignada', text: data.venta?.nro_boleta || '', timer: 2500 });
      cargar();
      cargarMeta();
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error' });
    }
  };

  return (
    <DashboardLayout>
      <div className="pe-wrap">
        <header className="pe-header">
          <h1>Ventas</h1>
          <p>Registro de ventas con numeración de boleta por sede y serie (001/002/003).</p>
        </header>

        {(meta.numeracion || []).length > 0 && (
          <div className="pe-card">
            <h3 className="pe-card-title">Contadores actuales (siguiente N° al guardar)</h3>
            <div className="pe-numeracion-grid">
              {meta.numeracion.map((n) => (
                <div key={n.sede_id} className="pe-numeracion-chip">
                  <strong>{sedeNombre[n.sede_id] || `Sede ${n.sede_id}`}</strong>
                  <span>
                    001: {String(n.serie).padStart(3, '0')}-{String(n.numero).padStart(8, '0')}
                  </span>
                  <span>
                    002: {String(n.serie_2).padStart(3, '0')}-{String(n.numero_2).padStart(8, '0')}
                  </span>
                  <span>
                    003: {String(n.serie_3).padStart(3, '0')}-{String(n.numero_3).padStart(8, '0')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pe-card">
          <div className="pe-form-row">
            <TextField type="date" size="small" label="Desde" value={fecha1} onChange={(e) => setFecha1(e.target.value)} InputLabelProps={{ shrink: true }} />
            <TextField type="date" size="small" label="Hasta" value={fecha2} onChange={(e) => setFecha2(e.target.value)} InputLabelProps={{ shrink: true }} />
            <button type="button" className="pe-btn pe-btn--secondary" onClick={cargar}>
              Buscar
            </button>
            <button type="button" className="pe-btn pe-btn--primary" onClick={abrirNueva}>
              Nueva venta
            </button>
          </div>
        </div>

        {loading ? (
          <div className="pe-loading-inline">
            <CircularProgress size={22} />
          </div>
        ) : (
          <div className="pe-table-wrap">
            <table className="pe-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>N° Boleta</th>
                  <th>Cliente</th>
                  <th>DNI</th>
                  <th>Total</th>
                  <th>Pago</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="pe-empty">
                      Sin ventas en el rango.
                    </td>
                  </tr>
                ) : (
                  items.map((r) => (
                    <tr key={r.id}>
                      <td>{String(r.fecha || '').slice(0, 10)}</td>
                      <td>{r.nro_boleta}</td>
                      <td>{r.nombre}</td>
                      <td>{r.dni}</td>
                      <td>S/ {Number(r.monto_total || 0).toFixed(2)}</td>
                      <td>{r.estado_pago}</td>
                      <td>
                        <div className="pe-table-actions">
                          <button type="button" className="pe-btn pe-btn--sm" onClick={() => abrirEditar(r.id)}>
                            Editar
                          </button>
                          {r.nro_boleta === 'PENDIENTE' && (
                            <button type="button" className="pe-btn pe-btn--sm" onClick={() => marcarImpresa(r)}>
                              Asignar N°
                            </button>
                          )}
                          <button type="button" className="pe-btn pe-btn--sm pe-btn--danger" onClick={() => anular(r)}>
                            Anular
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {modal && (
          <div className="pe-modal-overlay" onClick={() => setModal(null)} role="presentation">
            <div className="pe-modal pe-modal--wide" onClick={(e) => e.stopPropagation()} role="dialog">
              <div className="pe-modal-header">
                <h2>{modal.id ? 'Editar venta' : 'Nueva venta'}</h2>
                <button type="button" className="pe-btn pe-btn--sm" onClick={() => setModal(null)}>
                  ✕
                </button>
              </div>
              <div className="pe-modal-body">
                <div className="pe-form-grid">
                  <TextField
                    select
                    label="Sede"
                    size="small"
                    value={modal.sede_id}
                    onChange={(e) => {
                      const v = e.target.value;
                      setModal({ ...modal, sede_id: v });
                      fetchSiguienteNumero(v, modal.serie);
                    }}
                  >
                    {meta.sedes.map((s) => (
                      <MenuItem key={s.id} value={s.id}>
                        {s.nombre}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    select
                    label="Serie"
                    size="small"
                    value={modal.serie}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      setModal({ ...modal, serie: v });
                      fetchSiguienteNumero(modal.sede_id, v);
                    }}
                  >
                    {SERIES_VENTA.map((s) => (
                      <MenuItem key={s.value} value={s.value}>
                        {s.label}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField label="Siguiente N°" size="small" value={nroPreview || modal.numero} InputProps={{ readOnly: true }} helperText="Contador desde configuración de sede" />
                  <TextField type="date" label="Fecha" size="small" value={String(modal.fecha || '').slice(0, 10)} onChange={(e) => setModal({ ...modal, fecha: e.target.value })} InputLabelProps={{ shrink: true }} />
                  <TextField label="DNI" size="small" value={modal.dni || ''} onChange={(e) => setModal({ ...modal, dni: e.target.value })} />
                  <TextField label="Nombre cliente" size="small" value={modal.nombre || ''} onChange={(e) => setModal({ ...modal, nombre: e.target.value })} />
                  <TextField select label="Tipo cliente" size="small" value={modal.tipo || 'EXTERNO'} onChange={(e) => setModal({ ...modal, tipo: e.target.value })}>
                    {TIPOS_CLIENTE_VENTA.map((t) => (
                      <MenuItem key={t} value={t}>
                        {t}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField select label="Estado pago" size="small" value={modal.estado_pago || 'PENDIENTE'} onChange={(e) => setModal({ ...modal, estado_pago: e.target.value })}>
                    {ESTADOS_PAGO_VENTA.map((t) => (
                      <MenuItem key={t} value={t}>
                        {t}
                      </MenuItem>
                    ))}
                  </TextField>
                </div>

                <h3 className="pe-card-title">Detalle</h3>
                {modal.detalles.map((d, idx) => (
                  <div className="pe-detalle-row" key={idx}>
                    <TextField select size="small" label="Cat." value={d.categoria_id} onChange={(e) => setDetalle(idx, { categoria_id: e.target.value })}>
                      <MenuItem value="">—</MenuItem>
                      {(meta.catalogo || []).map((c) => (
                        <MenuItem key={c.id} value={c.id}>
                          {c.nombre}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField select size="small" label="Producto" value={d.concepto_id} onChange={(e) => setDetalle(idx, { concepto_id: e.target.value })}>
                      <MenuItem value="">—</MenuItem>
                      {(catalogoMap[d.categoria_id]?.conceptos || []).map((p) => (
                        <MenuItem key={p.id} value={p.id}>
                          {p.descripcion}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField size="small" type="number" label="Cant." value={d.cantidad} onChange={(e) => setDetalle(idx, { cantidad: e.target.value })} />
                    <TextField size="small" type="number" label="Precio" value={d.precio} onChange={(e) => setDetalle(idx, { precio: e.target.value })} />
                    <span>{d.stock != null ? `St:${d.stock}` : '—'}</span>
                    <button type="button" className="pe-btn pe-btn--sm pe-btn--danger" onClick={() => setModal({ ...modal, detalles: modal.detalles.filter((_, i) => i !== idx) })}>
                      ×
                    </button>
                  </div>
                ))}
                <button type="button" className="pe-btn pe-btn--sm" onClick={() => setModal({ ...modal, detalles: [...modal.detalles, lineaVacia()] })}>
                  + Línea
                </button>
                <div className="pe-total-line">Total: S/ {totalModal.toFixed(2)}</div>
              </div>
              <div className="pe-modal-footer">
                <button type="button" className="pe-btn" onClick={() => setModal(null)}>
                  Cancelar
                </button>
                <button type="button" className="pe-btn pe-btn--primary" onClick={guardar}>
                  Guardar venta
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
