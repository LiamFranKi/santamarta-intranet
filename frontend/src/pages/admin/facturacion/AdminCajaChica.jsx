import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CircularProgress, MenuItem, TextField } from '@mui/material';
import Swal from 'sweetalert2';
import DashboardLayout from '../../../components/DashboardLayout';
import api from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { TIPOS_MOVIMIENTO, todayIso } from './facturacionHelpers';
import PeTablaPaginacion from '../../../components/admin/PeTablaPaginacion';
import { usePaginacionTabla } from '../../../hooks/usePaginacionTabla';
import '../pagosEscolares/AdminPagosEscolares.css';
import './AdminFacturacion.css';

export default function AdminCajaChica() {
  const { user } = useAuth();
  const esAdmin = user?.tipo === 'ADMINISTRADOR';

  const [meta, setMeta] = useState({ currencies: [], types: [] });
  const [cuentas, setCuentas] = useState([]);
  const [cuentaId, setCuentaId] = useState(null);
  const [movimientos, setMovimientos] = useState([]);
  const [loadingCuentas, setLoadingCuentas] = useState(true);
  const [loadingMovs, setLoadingMovs] = useState(false);
  const [modalCuenta, setModalCuenta] = useState(null);
  const [modalMov, setModalMov] = useState(null);

  const cargarMeta = useCallback(async () => {
    const { data } = await api.get('/admin/facturacion/caja/meta');
    setMeta(data);
  }, []);

  const cargarCuentas = useCallback(async () => {
    setLoadingCuentas(true);
    try {
      const { data } = await api.get('/admin/facturacion/caja/cuentas');
      const list = data.items || [];
      setCuentas(list);
      setCuentaId((prev) => (prev && list.some((c) => c.id === prev) ? prev : list[0]?.id || null));
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error al cargar cuentas' });
    } finally {
      setLoadingCuentas(false);
    }
  }, []);

  const cargarMovimientos = useCallback(async (id) => {
    if (!id) {
      setMovimientos([]);
      return;
    }
    setLoadingMovs(true);
    try {
      const { data } = await api.get(`/admin/facturacion/caja/cuentas/${id}/movimientos`);
      setMovimientos(data.items || []);
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error al cargar movimientos' });
    } finally {
      setLoadingMovs(false);
    }
  }, []);

  useEffect(() => {
    cargarMeta();
    cargarCuentas();
  }, [cargarMeta, cargarCuentas]);

  useEffect(() => {
    cargarMovimientos(cuentaId);
  }, [cuentaId, cargarMovimientos]);

  const cuentaActiva = useMemo(() => cuentas.find((c) => c.id === cuentaId), [cuentas, cuentaId]);

  const saldo = useMemo(() => {
    return movimientos.reduce((s, m) => {
      const amt = parseFloat(m.amount) || 0;
      return m.type === 'EGRESO' ? s - amt : s + amt;
    }, 0);
  }, [movimientos]);

  const pagMovs = usePaginacionTabla(movimientos, [cuentaId]);

  const guardarCuenta = async () => {
    try {
      if (modalCuenta.id) {
        await api.put(`/admin/facturacion/caja/cuentas/${modalCuenta.id}`, modalCuenta);
      } else {
        await api.post('/admin/facturacion/caja/cuentas', modalCuenta);
      }
      setModalCuenta(null);
      cargarCuentas();
      Swal.fire({ icon: 'success', title: 'Cuenta guardada', timer: 1500, showConfirmButton: false });
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudo guardar' });
    }
  };

  const eliminarCuenta = async (row) => {
    const ok = await Swal.fire({ icon: 'warning', title: '¿Eliminar cuenta?', text: row.name, showCancelButton: true });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/admin/facturacion/caja/cuentas/${row.id}`);
      cargarCuentas();
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error' });
    }
  };

  const guardarMov = async () => {
    try {
      const payload = { ...modalMov, cash_account_id: cuentaId };
      if (modalMov.id) {
        await api.put(`/admin/facturacion/caja/movimientos/${modalMov.id}`, payload);
      } else {
        await api.post('/admin/facturacion/caja/movimientos', payload);
      }
      setModalMov(null);
      cargarMovimientos(cuentaId);
      Swal.fire({ icon: 'success', title: 'Movimiento guardado', timer: 1500, showConfirmButton: false });
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudo guardar' });
    }
  };

  const eliminarMov = async (row) => {
    const ok = await Swal.fire({ icon: 'warning', title: '¿Eliminar movimiento?', showCancelButton: true });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/admin/facturacion/caja/movimientos/${row.id}`);
      cargarMovimientos(cuentaId);
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error' });
    }
  };

  return (
    <DashboardLayout>
      <div className="pe-wrap">
        <header className="pe-header">
          <h1>Caja chica</h1>
          <p>Cuentas y movimientos de efectivo (ingresos y egresos).</p>
        </header>

        <div className="pe-caja-layout">
          <div>
            <div className="pe-fact-actions">
              <strong>Cuentas</strong>
              {esAdmin && (
                <button
                  type="button"
                  className="pe-btn pe-btn--sm pe-btn--primary"
                  onClick={() => setModalCuenta({ name: '', description: '', privacy: 1, cash_currency_id: '', cash_account_type_id: '' })}
                >
                  + Cuenta
                </button>
              )}
            </div>
            {loadingCuentas ? (
              <CircularProgress size={22} />
            ) : (
              <div className="pe-caja-list">
                {cuentas.length === 0 ? (
                  <p className="pe-empty" style={{ padding: '1rem' }}>
                    Sin cuentas.
                  </p>
                ) : (
                  cuentas.map((c) => (
                    <button key={c.id} type="button" className={cuentaId === c.id ? 'active' : ''} onClick={() => setCuentaId(c.id)}>
                      {c.name}
                      {c.currency_name ? ` (${c.currency_name})` : ''}
                    </button>
                  ))
                )}
              </div>
            )}
            {esAdmin && cuentaActiva && (
              <div className="pe-table-actions" style={{ marginTop: '0.75rem' }}>
                <button
                  type="button"
                  className="pe-btn pe-btn--sm"
                  onClick={() =>
                    setModalCuenta({
                      ...cuentaActiva,
                      cash_currency_id: cuentaActiva.cash_currency_id || '',
                      cash_account_type_id: cuentaActiva.cash_account_type_id || '',
                    })
                  }
                >
                  Editar cuenta
                </button>
                <button type="button" className="pe-btn pe-btn--sm pe-btn--danger" onClick={() => eliminarCuenta(cuentaActiva)}>
                  Eliminar
                </button>
              </div>
            )}
          </div>

          <div className="pe-card">
            {cuentaActiva ? (
              <>
                <div className="pe-fact-actions">
                  <div>
                    <h3 className="pe-card-title" style={{ margin: 0 }}>
                      {cuentaActiva.name}
                    </h3>
                    <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>
                      Saldo calculado: <strong>S/ {saldo.toFixed(2)}</strong>
                    </p>
                  </div>
                  <button
                    type="button"
                    className="pe-btn pe-btn--primary"
                    onClick={() =>
                      setModalMov({
                        description: '',
                        entry: '',
                        date: todayIso(),
                        time: new Date().toTimeString().slice(0, 8),
                        type: 'INGRESO',
                        amount: '',
                      })
                    }
                  >
                    + Movimiento
                  </button>
                </div>

                {loadingMovs ? (
                  <CircularProgress size={22} />
                ) : (
                  <div className="pe-table-wrap">
                    <table className="pe-table">
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Descripción</th>
                          <th>Tipo</th>
                          <th>Monto</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {movimientos.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="pe-empty">
                              Sin movimientos.
                            </td>
                          </tr>
                        ) : (
                          pagMovs.paginated.map((m) => (
                            <tr key={m.id}>
                              <td>
                                {String(m.date || '').slice(0, 10)} {m.time ? String(m.time).slice(0, 5) : ''}
                              </td>
                              <td>{m.description}</td>
                              <td>{m.type}</td>
                              <td className={m.type === 'EGRESO' ? 'pe-text-danger' : ''}>
                                {m.type === 'EGRESO' ? '-' : '+'} S/ {Number(m.amount || 0).toFixed(2)}
                              </td>
                              <td>
                                <div className="pe-table-actions">
                                  <button type="button" className="pe-btn pe-btn--sm" onClick={() => setModalMov({ ...m, amount: m.amount })}>
                                    Editar
                                  </button>
                                  <button type="button" className="pe-btn pe-btn--sm pe-btn--danger" onClick={() => eliminarMov(m)}>
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
                )}

                {!loadingMovs && (
                  <PeTablaPaginacion
                    page={pagMovs.page}
                    totalPages={pagMovs.totalPages}
                    total={pagMovs.total}
                    pageSize={pagMovs.pageSize}
                    onPageChange={pagMovs.setPage}
                    onPageSizeChange={pagMovs.setPageSize}
                  />
                )}
              </>
            ) : (
              <p className="pe-empty">Seleccione una cuenta.</p>
            )}
          </div>
        </div>

        {modalCuenta && (
          <div className="pe-modal-overlay" onClick={() => setModalCuenta(null)} role="presentation">
            <div className="pe-modal" onClick={(e) => e.stopPropagation()} role="dialog">
              <div className="pe-modal-header">
                <h2>{modalCuenta.id ? 'Editar cuenta' : 'Nueva cuenta'}</h2>
                <button type="button" className="pe-btn pe-btn--sm" onClick={() => setModalCuenta(null)}>
                  ✕
                </button>
              </div>
              <div className="pe-modal-body pe-form-grid">
                <TextField label="Nombre" size="small" value={modalCuenta.name || ''} onChange={(e) => setModalCuenta({ ...modalCuenta, name: e.target.value })} />
                <TextField label="Descripción" size="small" value={modalCuenta.description || ''} onChange={(e) => setModalCuenta({ ...modalCuenta, description: e.target.value })} />
                <TextField select label="Moneda" size="small" value={modalCuenta.cash_currency_id || ''} onChange={(e) => setModalCuenta({ ...modalCuenta, cash_currency_id: e.target.value })}>
                  <MenuItem value="">—</MenuItem>
                  {(meta.currencies || []).map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField select label="Tipo cuenta" size="small" value={modalCuenta.cash_account_type_id || ''} onChange={(e) => setModalCuenta({ ...modalCuenta, cash_account_type_id: e.target.value })}>
                  <MenuItem value="">—</MenuItem>
                  {(meta.types || []).map((t) => (
                    <MenuItem key={t.id} value={t.id}>
                      {t.name}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField select label="Visibilidad" size="small" value={modalCuenta.privacy ?? 1} onChange={(e) => setModalCuenta({ ...modalCuenta, privacy: parseInt(e.target.value, 10) })}>
                  <MenuItem value={1}>Pública (cajero)</MenuItem>
                  <MenuItem value={0}>Privada (solo admin)</MenuItem>
                </TextField>
              </div>
              <div className="pe-modal-footer">
                <button type="button" className="pe-btn" onClick={() => setModalCuenta(null)}>
                  Cancelar
                </button>
                <button type="button" className="pe-btn pe-btn--primary" onClick={guardarCuenta}>
                  Guardar
                </button>
              </div>
            </div>
          </div>
        )}

        {modalMov && (
          <div className="pe-modal-overlay" onClick={() => setModalMov(null)} role="presentation">
            <div className="pe-modal" onClick={(e) => e.stopPropagation()} role="dialog">
              <div className="pe-modal-header">
                <h2>{modalMov.id ? 'Editar movimiento' : 'Nuevo movimiento'}</h2>
                <button type="button" className="pe-btn pe-btn--sm" onClick={() => setModalMov(null)}>
                  ✕
                </button>
              </div>
              <div className="pe-modal-body pe-form-grid">
                <TextField label="Descripción" size="small" value={modalMov.description || ''} onChange={(e) => setModalMov({ ...modalMov, description: e.target.value })} />
                <TextField label="Referencia" size="small" value={modalMov.entry || ''} onChange={(e) => setModalMov({ ...modalMov, entry: e.target.value })} />
                <TextField type="date" label="Fecha" size="small" value={String(modalMov.date || '').slice(0, 10)} onChange={(e) => setModalMov({ ...modalMov, date: e.target.value })} InputLabelProps={{ shrink: true }} />
                <TextField type="time" label="Hora" size="small" value={String(modalMov.time || '').slice(0, 5)} onChange={(e) => setModalMov({ ...modalMov, time: `${e.target.value}:00` })} InputLabelProps={{ shrink: true }} />
                <TextField select label="Tipo" size="small" value={modalMov.type || 'INGRESO'} onChange={(e) => setModalMov({ ...modalMov, type: e.target.value })}>
                  {TIPOS_MOVIMIENTO.map((t) => (
                    <MenuItem key={t} value={t}>
                      {t}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField type="number" label="Monto" size="small" value={modalMov.amount} onChange={(e) => setModalMov({ ...modalMov, amount: e.target.value })} />
              </div>
              <div className="pe-modal-footer">
                <button type="button" className="pe-btn" onClick={() => setModalMov(null)}>
                  Cancelar
                </button>
                <button type="button" className="pe-btn pe-btn--primary" onClick={guardarMov}>
                  Guardar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
