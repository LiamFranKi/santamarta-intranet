import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CircularProgress, MenuItem, TextField } from '@mui/material';
import Swal from 'sweetalert2';
import DashboardLayout from '../../../components/DashboardLayout';
import api from '../../../services/api';
import PeTablaPaginacion from '../../../components/admin/PeTablaPaginacion';
import { usePaginacionTabla } from '../../../hooks/usePaginacionTabla';
import { TIPOS_COMPRA, todayIso } from './facturacionHelpers';
import FormDetalleProductos, { TotalesFacturacion } from './FormDetalleProductos';
import FacturacionModal from './FacturacionModal';
import { FactModalCancel, FactModalSave } from './FactModalActions';
import '../pagosEscolares/AdminPagosEscolares.css';
import './AdminFacturacion.css';

const lineaVacia = () => ({ categoria_id: '', concepto_id: '', cantidad: 1, precio: 0 });

export default function AdminCompras() {
  const [meta, setMeta] = useState({ catalogo: [] });
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [desde, setDesde] = useState(todayIso());
  const [hasta, setHasta] = useState(todayIso());
  const [modal, setModal] = useState(null);

  const itemsFiltrados = useMemo(() => items, [items]);
  const pag = usePaginacionTabla(itemsFiltrados, [desde, hasta]);

  const cargarMeta = useCallback(async () => {
    const { data } = await api.get('/admin/facturacion/meta');
    setMeta(data);
  }, []);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/facturacion/compras', { params: { desde, hasta } });
      setItems(data.items || []);
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error al cargar compras' });
    } finally {
      setLoading(false);
    }
  }, [desde, hasta]);

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

  const abrirNueva = () => {
    setModal({
      descripcion: '',
      fecha: todayIso(),
      tipo: 'BOLETA DE VENTA',
      serie: '',
      numero: '',
      detalles: [lineaVacia()],
    });
  };

  const abrirEditar = async (id) => {
    try {
      const { data } = await api.get(`/admin/facturacion/compras/${id}`);
      setModal({
        ...data,
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
        if (concepto) detalles[idx].precio = concepto.precio_inicial || 0;
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
        await api.put(`/admin/facturacion/compras/${modal.id}`, payload);
      } else {
        await api.post('/admin/facturacion/compras', payload);
      }
      setModal(null);
      cargar();
      Swal.fire({ icon: 'success', title: 'Compra guardada', timer: 2000, showConfirmButton: false });
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudo guardar' });
    }
  };

  const eliminar = async (row) => {
    const ok = await Swal.fire({
      icon: 'warning',
      title: '¿Eliminar compra?',
      text: row.descripcion,
      showCancelButton: true,
      confirmButtonText: 'Eliminar',
    });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/admin/facturacion/compras/${row.id}`);
      cargar();
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error' });
    }
  };

  return (
    <DashboardLayout>
      <div className="pe-wrap">
        <header className="pe-header">
          <h1>Compras</h1>
          <p>Ingreso de mercadería. Serie y número del comprobante se ingresan manualmente.</p>
        </header>

        <div className="pe-card pe-card--pastel-peach">
          <div className="pe-form-row">
            <TextField type="date" size="small" label="Desde" value={desde} onChange={(e) => setDesde(e.target.value)} InputLabelProps={{ shrink: true }} />
            <TextField type="date" size="small" label="Hasta" value={hasta} onChange={(e) => setHasta(e.target.value)} InputLabelProps={{ shrink: true }} />
            <button type="button" className="pe-btn pe-btn--secondary" onClick={cargar}>
              Buscar
            </button>
            <button type="button" className="pe-btn pe-btn--primary" onClick={abrirNueva}>
              Nueva compra
            </button>
          </div>
        </div>

        {loading ? (
          <div className="pe-loading-inline">
            <CircularProgress size={22} />
          </div>
        ) : (
          <div className="pe-card pe-card--pastel-mint pe-card--tabla-suelta">
          <div className="pe-table-wrap">
            <table className="pe-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Comprobante</th>
                  <th>Descripción</th>
                  <th>Tipo</th>
                  <th>Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="pe-empty">
                      Sin compras en el rango.
                    </td>
                  </tr>
                ) : (
                  pag.paginated.map((r) => (
                    <tr key={r.id}>
                      <td>{String(r.fecha || '').slice(0, 10)}</td>
                      <td>
                        {r.serie || '—'}-{r.numero || '—'}
                      </td>
                      <td>{r.descripcion}</td>
                      <td>{r.tipo}</td>
                      <td>S/ {Number(r.monto_total || 0).toFixed(2)}</td>
                      <td>
                        <div className="pe-table-actions">
                          <button type="button" className="pe-btn pe-btn--sm" onClick={() => abrirEditar(r.id)}>
                            Editar
                          </button>
                          <button type="button" className="pe-btn pe-btn--sm pe-btn--danger" onClick={() => eliminar(r)}>
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          </div>
        )}

        {!loading && (
          <PeTablaPaginacion
            page={pag.page}
            totalPages={pag.totalPages}
            total={pag.total}
            pageSize={pag.pageSize}
            onPageChange={pag.setPage}
            onPageSizeChange={pag.setPageSize}
          />
        )}

        <FacturacionModal
          open={!!modal}
          onClose={() => setModal(null)}
          wide
          title={modal?.id ? 'Editar ingreso' : 'Registrar ingreso'}
          footer={
            <>
              <FactModalCancel onClick={() => setModal(null)} />
              <FactModalSave onClick={guardar} />
            </>
          }
        >
          {modal && (
                <div className="fact-form-inner">
                  <section className="fact-panel fact-panel--general">
                    <div className="fact-panel-head">Información General</div>
                    <div className="fact-panel-body">
                      <div className="fact-form-table">
                        <div className="fact-form-row">
                          <label>
                            Descripción<span className="fact-req">*</span>
                          </label>
                          <div className="fact-form-field">
                            <TextField
                              size="small"
                              value={modal.descripcion || ''}
                              onChange={(e) => setModal({ ...modal, descripcion: e.target.value })}
                              fullWidth
                              placeholder="Proveedor o detalle del ingreso"
                            />
                          </div>
                        </div>

                        <div className="fact-form-row">
                          <label>
                            Fecha<span className="fact-req">*</span>
                          </label>
                          <div className="fact-form-field">
                            <TextField
                              type="date"
                              size="small"
                              value={String(modal.fecha || '').slice(0, 10)}
                              onChange={(e) => setModal({ ...modal, fecha: e.target.value })}
                              InputLabelProps={{ shrink: true }}
                              fullWidth
                            />
                          </div>
                        </div>

                        <div className="fact-form-row">
                          <label>
                            Tipo<span className="fact-req">*</span>
                          </label>
                          <div className="fact-form-field">
                            <TextField
                              select
                              size="small"
                              value={modal.tipo || 'BOLETA DE VENTA'}
                              onChange={(e) => setModal({ ...modal, tipo: e.target.value })}
                              fullWidth
                            >
                              {TIPOS_COMPRA.map((t) => (
                                <MenuItem key={t} value={t}>
                                  {t}
                                </MenuItem>
                              ))}
                            </TextField>
                          </div>
                        </div>

                        <div className="fact-form-row">
                          <label>
                            Serie / Número<span className="fact-req">*</span>
                          </label>
                          <div className="fact-form-field fact-form-field--split">
                            <TextField
                              size="small"
                              value={modal.serie || ''}
                              onChange={(e) => setModal({ ...modal, serie: e.target.value })}
                              placeholder="Serie"
                              fullWidth
                            />
                            <TextField
                              size="small"
                              value={modal.numero || ''}
                              onChange={(e) => setModal({ ...modal, numero: e.target.value })}
                              placeholder="Número"
                              fullWidth
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="fact-panel fact-panel--productos">
                    <div className="fact-panel-head">Detalles de Productos</div>
                    <div className="fact-panel-body">
                      <FormDetalleProductos
                        catalogo={meta.catalogo || []}
                        catalogoMap={catalogoMap}
                        detalles={modal.detalles}
                        mostrarStock={false}
                        onChangeDetalle={setDetalle}
                        onAddLinea={() => setModal({ ...modal, detalles: [...modal.detalles, lineaVacia()] })}
                        onRemoveLinea={(idx) =>
                          setModal({
                            ...modal,
                            detalles: modal.detalles.length > 1 ? modal.detalles.filter((_, i) => i !== idx) : modal.detalles,
                          })
                        }
                      />
                      <TotalesFacturacion subtotal={totalModal} />
                    </div>
                  </section>
                </div>
          )}
        </FacturacionModal>
      </div>
    </DashboardLayout>
  );
}
