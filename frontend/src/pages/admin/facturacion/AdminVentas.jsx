import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CircularProgress, InputAdornment, MenuItem, TextField } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import Swal from 'sweetalert2';
import DashboardLayout from '../../../components/DashboardLayout';
import api from '../../../services/api';
import PeTablaPaginacion from '../../../components/admin/PeTablaPaginacion';
import { usePaginacionTabla } from '../../../hooks/usePaginacionTabla';
import {
  ESTADOS_PAGO_VENTA,
  RUBROS_VENTA,
  SERIES_VENTA,
  TIPOS_CLIENTE_VENTA,
  TIPOS_DOC_IDENTIDAD,
  TRANSFERENCIA_GRATUITA_OPCIONES,
  calcularComisionTarjeta,
  sedeIdSanMartin,
  todayIso,
} from './facturacionHelpers';
import FormDetalleProductos, { TotalesFacturacion } from './FormDetalleProductos';
import { buscarClientePorDni } from './facturacionClienteDni';
import FacturacionModal from './FacturacionModal';
import { FactModalCancel, FactModalSave } from './FactModalActions';
import '../pagosEscolares/AdminPagosEscolares.css';
import './AdminFacturacion.css';

const lineaVacia = () => ({ categoria_id: '', concepto_id: '', cantidad: 1, precio: 0, stock: null });

export default function AdminVentas() {
  const [meta, setMeta] = useState({ sedes: [], catalogo: [], comision_tarjeta_debito: 0, comision_tarjeta_credito: 0 });
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fecha1, setFecha1] = useState(todayIso());
  const [fecha2, setFecha2] = useState(todayIso());
  const [modal, setModal] = useState(null);
  const [nroPreview, setNroPreview] = useState('');
  const [filtroTabla, setFiltroTabla] = useState('');
  const [buscandoDni, setBuscandoDni] = useState(false);
  const dniTimerRef = useRef(null);

  const sedeDefault = useMemo(() => sedeIdSanMartin(meta.sedes), [meta.sedes]);

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
    const sedeId = sedeDefault || meta.sedes[0]?.id || '';
    setModal({
      sede_id: sedeId,
      serie: 1,
      numero: 0,
      nombre: '',
      dni: '',
      fecha: todayIso(),
      tipo: 'ALUMNO',
      estado_pago: 'PENDIENTE',
      tipo_documento: 'BOLETA',
      transferencia_gratuita: 'NO',
      entry: 'NINGUNO',
      comision_tarjeta: 0,
      tipo_tarjeta: 'CREDITO',
      doc_identidad: 'DNI',
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
        doc_identidad: data.doc_identidad || 'DNI',
        entry: data.entry || 'NINGUNO',
        tipo_tarjeta: data.tipo_tarjeta || 'CREDITO',
        comision_tarjeta: data.comision_tarjeta || 0,
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

  const comisionMonto = useMemo(() => {
    const tipo = modal?.tipo_tarjeta || 'CREDITO';
    const pct =
      tipo === 'DEBITO'
        ? meta.comision_tarjeta_debito
        : meta.comision_tarjeta_credito;
    return calcularComisionTarjeta(totalModal, pct);
  }, [modal?.tipo_tarjeta, meta.comision_tarjeta_debito, meta.comision_tarjeta_credito, totalModal]);

  const serieNumeroVista = useMemo(() => {
    if (!modal) return { serie: '001', numero: '' };
    if (nroPreview && String(nroPreview).includes('-')) {
      const [s, ...rest] = String(nroPreview).split('-');
      return { serie: s, numero: rest.join('-') };
    }
    if (parseInt(modal.numero, 10) > 0) {
      return {
        serie: String(modal.serie || '1').padStart(3, '0'),
        numero: String(modal.numero).padStart(8, '0'),
      };
    }
    return { serie: '001', numero: '—' };
  }, [modal, nroPreview]);

  const ejecutarBusquedaDni = useCallback(async (dni, tipoCliente) => {
    const doc = String(dni || '').trim();
    if (doc.length < 8) return;
    setBuscandoDni(true);
    const r = await buscarClientePorDni(doc, tipoCliente);
    setBuscandoDni(false);
    setModal((prev) => {
      if (!prev || String(prev.dni || '').trim() !== doc) return prev;
      if (r.encontrado) {
        return { ...prev, nombre: r.nombre, tipo: r.tipo || prev.tipo };
      }
      return { ...prev, nombre: '' };
    });
  }, []);

  const onDniChange = (value) => {
    setModal((prev) => {
      if (dniTimerRef.current) clearTimeout(dniTimerRef.current);
      dniTimerRef.current = setTimeout(() => ejecutarBusquedaDni(value, prev?.tipo || 'ALUMNO'), 450);
      return { ...prev, dni: value };
    });
  };

  const onTipoClienteChange = (tipo) => {
    setModal((prev) => {
      const next = { ...prev, tipo };
      if (String(prev.dni || '').trim().length >= 8) {
        ejecutarBusquedaDni(prev.dni, tipo);
      }
      return next;
    });
  };

  useEffect(() => () => {
    if (dniTimerRef.current) clearTimeout(dniTimerRef.current);
  }, []);

  const guardar = async () => {
    try {
      const payload = {
        ...modal,
        comision_tarjeta: comisionMonto,
        detalles: modal.detalles.filter((d) => d.concepto_id),
      };
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

  const itemsFiltrados = useMemo(() => {
    const q = filtroTabla.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (r) =>
        String(r.nombre || '').toLowerCase().includes(q) ||
        String(r.dni || '').toLowerCase().includes(q) ||
        String(r.nro_boleta || '').toLowerCase().includes(q)
    );
  }, [items, filtroTabla]);

  const pag = usePaginacionTabla(itemsFiltrados, [filtroTabla, fecha1, fecha2]);

  return (
    <DashboardLayout>
      <div className="pe-wrap">
        <header className="pe-header">
          <h1>Ventas</h1>
          <p>Registro de ventas con numeración de boleta por sede y serie (001/002/003).</p>
        </header>

        <div className="pe-card">
          <div className="pe-toolbar-search">
            <div className="pe-form-row" style={{ flex: 1, margin: 0 }}>
              <TextField type="date" size="small" label="Desde" value={fecha1} onChange={(e) => setFecha1(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
              <TextField type="date" size="small" label="Hasta" value={fecha2} onChange={(e) => setFecha2(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
              <button type="button" className="pe-btn pe-btn--secondary pe-btn--icon" onClick={cargar}>
                <SearchIcon fontSize="small" />
                Buscar
              </button>
              <button type="button" className="pe-btn pe-btn--primary pe-btn--icon" onClick={abrirNueva}>
                <AddCircleOutlineIcon fontSize="small" />
                Nueva venta
              </button>
            </div>
          </div>
          <TextField
            size="small"
            label="Filtrar resultados"
            value={filtroTabla}
            onChange={(e) => setFiltroTabla(e.target.value)}
            fullWidth
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" color="action" />
                </InputAdornment>
              ),
            }}
          />
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
                  <th className="pe-th-center">Fecha</th>
                  <th className="pe-th-center">N° Boleta</th>
                  <th className="pe-th-center">Cliente</th>
                  <th className="pe-th-center">DNI</th>
                  <th className="pe-th-center">Total</th>
                  <th className="pe-th-center">Pago</th>
                  <th className="pe-th-center pe-th-accion">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {itemsFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="pe-empty">
                      Sin ventas en el rango.
                    </td>
                  </tr>
                ) : (
                  pag.paginated.map((r) => (
                    <tr key={r.id}>
                      <td>{String(r.fecha || '').slice(0, 10)}</td>
                      <td>{r.nro_boleta}</td>
                      <td>{r.nombre}</td>
                      <td>{r.dni}</td>
                      <td>S/ {Number(r.monto_total || 0).toFixed(2)}</td>
                      <td>{r.estado_pago}</td>
                      <td>
                        <div className="pe-table-actions">
                          <button type="button" className="pe-btn pe-btn--sm pe-btn--icon" onClick={() => abrirEditar(r.id)}>
                            <EditOutlinedIcon fontSize="small" />
                            Editar
                          </button>
                          {r.nro_boleta === 'PENDIENTE' && (
                            <button type="button" className="pe-btn pe-btn--sm pe-btn--icon" onClick={() => marcarImpresa(r)}>
                              <PrintOutlinedIcon fontSize="small" />
                              Asignar N°
                            </button>
                          )}
                          <button type="button" className="pe-btn pe-btn--sm pe-btn--danger pe-btn--icon" onClick={() => anular(r)}>
                            <BlockOutlinedIcon fontSize="small" />
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
          title={modal?.id ? 'Editar venta / servicio' : 'Registrar venta / servicio'}
          footer={
            <>
              <FactModalCancel onClick={() => setModal(null)} />
              <FactModalSave onClick={guardar} />
            </>
          }
        >
          {modal && (
                <div className="fact-form-inner">
                  <section className="fact-panel">
                    <div className="fact-panel-head">Información General</div>
                    <div className="fact-panel-body">
                      <div className="fact-form-grid-lines">
                        <div className="fact-form-line fact-form-line--3">
                          <div className="fact-form-cell">
                            <label>Tipo de Documento</label>
                            <TextField
                              select
                              size="small"
                              value={modal.doc_identidad || 'DNI'}
                              onChange={(e) => setModal({ ...modal, doc_identidad: e.target.value })}
                              fullWidth
                            >
                              {TIPOS_DOC_IDENTIDAD.map((t) => (
                                <MenuItem key={t} value={t}>
                                  {t}
                                </MenuItem>
                              ))}
                            </TextField>
                          </div>
                          <div className="fact-form-cell">
                            <label>
                              N° de Documento<span className="fact-req">*</span>
                            </label>
                            <TextField
                              select
                              size="small"
                              value={modal.tipo || 'ALUMNO'}
                              onChange={(e) => onTipoClienteChange(e.target.value)}
                              fullWidth
                            >
                              {TIPOS_CLIENTE_VENTA.map((t) => (
                                <MenuItem key={t} value={t}>
                                  {t}
                                </MenuItem>
                              ))}
                            </TextField>
                          </div>
                          <div className="fact-form-cell">
                            <label>DNI / documento</label>
                            <TextField
                              size="small"
                              value={modal.dni || ''}
                              onChange={(e) => onDniChange(e.target.value)}
                              onBlur={() => ejecutarBusquedaDni(modal.dni, modal.tipo)}
                              placeholder="DNI / documento"
                              fullWidth
                            />
                          </div>
                        </div>
                        {buscandoDni && <div className="fact-dni-busy">Buscando en el sistema…</div>}

                        <div className="fact-form-line fact-form-line--2">
                          <div className="fact-form-cell">
                            <label>
                              Nombre<span className="fact-req">*</span>
                            </label>
                            <TextField
                              size="small"
                              value={modal.nombre || ''}
                              onChange={(e) => setModal({ ...modal, nombre: e.target.value })}
                              fullWidth
                              required
                            />
                          </div>
                          <div className="fact-form-cell">
                            <label>
                              Fecha<span className="fact-req">*</span>
                            </label>
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

                        <div className="fact-form-line fact-form-line--sede-serie">
                          <div className="fact-form-cell">
                            <label>
                              Sede<span className="fact-req">*</span>
                            </label>
                            <TextField
                              select
                              size="small"
                              value={modal.sede_id || sedeDefault}
                              onChange={(e) => {
                                const v = e.target.value;
                                setModal({ ...modal, sede_id: v });
                                fetchSiguienteNumero(v, modal.serie);
                              }}
                              fullWidth
                            >
                              {meta.sedes.map((s) => (
                                <MenuItem key={s.id} value={s.id}>
                                  {s.nombre}
                                </MenuItem>
                              ))}
                            </TextField>
                          </div>
                          <div className="fact-form-cell">
                            <label>
                              Serie / Número<span className="fact-req">*</span>
                            </label>
                            <div className="fact-form-cell--serie">
                              <TextField
                                select
                                size="small"
                                value={modal.serie}
                                onChange={(e) => {
                                  const v = parseInt(e.target.value, 10);
                                  setModal({ ...modal, serie: v });
                                  fetchSiguienteNumero(modal.sede_id || sedeDefault, v);
                                }}
                                fullWidth
                              >
                                {SERIES_VENTA.map((s) => (
                                  <MenuItem key={s.value} value={s.value}>
                                    {String(s.value).padStart(3, '0')}
                                  </MenuItem>
                                ))}
                              </TextField>
                              <TextField
                                size="small"
                                value={serieNumeroVista.numero}
                                InputProps={{ readOnly: true }}
                                fullWidth
                              />
                            </div>
                          </div>
                        </div>

                        <div className="fact-form-line fact-form-line--3eq">
                          <div className="fact-form-cell">
                            <label>
                              Estado Pago<span className="fact-req">*</span>
                            </label>
                            <TextField
                              select
                              size="small"
                              value={modal.estado_pago || 'PENDIENTE'}
                              onChange={(e) => setModal({ ...modal, estado_pago: e.target.value })}
                              fullWidth
                            >
                              {ESTADOS_PAGO_VENTA.map((t) => (
                                <MenuItem key={t} value={t}>
                                  {t}
                                </MenuItem>
                              ))}
                            </TextField>
                          </div>
                          <div className="fact-form-cell">
                            <label>
                              Transferencia Gratuita<span className="fact-req">*</span>
                            </label>
                            <TextField
                              select
                              size="small"
                              value={modal.transferencia_gratuita || 'NO'}
                              onChange={(e) => setModal({ ...modal, transferencia_gratuita: e.target.value })}
                              fullWidth
                            >
                              {TRANSFERENCIA_GRATUITA_OPCIONES.map((t) => (
                                <MenuItem key={t} value={t}>
                                  {t}
                                </MenuItem>
                              ))}
                            </TextField>
                          </div>
                          <div className="fact-form-cell">
                            <label>Rubro</label>
                            <TextField
                              select
                              size="small"
                              value={modal.entry || 'NINGUNO'}
                              onChange={(e) => setModal({ ...modal, entry: e.target.value })}
                              fullWidth
                            >
                              {RUBROS_VENTA.map((r) => (
                                <MenuItem key={r} value={r}>
                                  {r}
                                </MenuItem>
                              ))}
                            </TextField>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="fact-panel">
                    <div className="fact-panel-head">Detalles de Productos</div>
                    <div className="fact-panel-body">
                      <FormDetalleProductos
                        catalogo={meta.catalogo || []}
                        catalogoMap={catalogoMap}
                        detalles={modal.detalles}
                        onChangeDetalle={setDetalle}
                        onAddLinea={() => setModal({ ...modal, detalles: [...modal.detalles, lineaVacia()] })}
                        onRemoveLinea={(idx) =>
                          setModal({
                            ...modal,
                            detalles: modal.detalles.length > 1 ? modal.detalles.filter((_, i) => i !== idx) : modal.detalles,
                          })
                        }
                      />
                      <TotalesFacturacion
                        subtotal={totalModal}
                        comision={comisionMonto}
                        mostrarComision
                        tipoTarjeta={modal.tipo_tarjeta || 'CREDITO'}
                        onTipoTarjetaChange={(v) => setModal({ ...modal, tipo_tarjeta: v })}
                        pctDebito={meta.comision_tarjeta_debito || 0}
                        pctCredito={meta.comision_tarjeta_credito || 0}
                      />
                    </div>
                  </section>
                </div>
          )}
        </FacturacionModal>
      </div>
    </DashboardLayout>
  );
}
