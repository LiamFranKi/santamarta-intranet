import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CircularProgress, IconButton, InputAdornment, MenuItem, TextField, Tooltip } from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import SearchIcon from '@mui/icons-material/Search';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import Swal from 'sweetalert2';
import DashboardLayout from '../../../components/DashboardLayout';
import api from '../../../services/api';
import '../pagosEscolares/AdminPagosEscolares.css';
import './AdminFacturacion.css';
import PeTablaPaginacion from '../../../components/admin/PeTablaPaginacion';
import { usePaginacionTabla } from '../../../hooks/usePaginacionTabla';
import FacturacionModal from './FacturacionModal';
import { FactModalCancel, FactModalSave } from './FactModalActions';

const TABS = [
  { id: 'productos', label: 'Productos', tone: 'productos' },
  { id: 'categorias', label: 'Categorías', tone: 'categorias' },
  { id: 'subcategorias', label: 'Subcategorías', tone: 'subcategorias' },
];

function FiltroBar({ value, onChange, placeholder }) {
  return (
    <TextField
      size="small"
      label="Buscar"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      fullWidth
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <SearchIcon fontSize="small" color="action" />
          </InputAdornment>
        ),
      }}
    />
  );
}

function Modal({ title, onClose, children, footer, wide }) {
  return (
    <FacturacionModal open title={title} onClose={onClose} footer={footer} wide={wide}>
      {children}
    </FacturacionModal>
  );
}

function TabCategorias() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [filtro, setFiltro] = useState('');

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/facturacion/categorias');
      setItems(data.items || []);
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error al cargar' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const guardar = async () => {
    try {
      if (modal.id) {
        await api.put(`/admin/facturacion/categorias/${modal.id}`, modal);
      } else {
        await api.post('/admin/facturacion/categorias', modal);
      }
      setModal(null);
      cargar();
      Swal.fire({ icon: 'success', title: 'Guardado', timer: 1500, showConfirmButton: false });
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudo guardar' });
    }
  };

  const eliminar = async (row) => {
    const ok = await Swal.fire({
      icon: 'warning',
      title: '¿Eliminar categoría?',
      text: row.nombre,
      showCancelButton: true,
      confirmButtonText: 'Eliminar',
    });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/admin/facturacion/categorias/${row.id}`);
      cargar();
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudo eliminar' });
    }
  };

  const filtrados = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (r) => String(r.nombre || '').toLowerCase().includes(q) || String(r.descripcion || '').toLowerCase().includes(q)
    );
  }, [items, filtro]);

  const pag = usePaginacionTabla(filtrados, [filtro]);

  if (loading) {
    return (
      <div className="pe-loading-inline">
        <CircularProgress size={22} />
      </div>
    );
  }

  return (
    <>
      <div className="pe-fact-actions pe-fact-actions--toolbar">
        <FiltroBar value={filtro} onChange={setFiltro} placeholder="Nombre o descripción…" />
        <button type="button" className="pe-btn pe-btn--primary pe-btn--icon" onClick={() => setModal({ nombre: '', descripcion: '' })}>
          <AddCircleOutlineIcon fontSize="small" />
          Nueva categoría
        </button>
      </div>
      <div className="pe-table-wrap">
        <table className="pe-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Descripción</th>
              <th className="pe-th-accion" />
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={3} className="pe-empty">
                  Sin categorías.
                </td>
              </tr>
            ) : (
              pag.paginated.map((r) => (
              <tr key={r.id}>
                <td>{r.nombre}</td>
                <td>{r.descripcion}</td>
                <td className="pe-td-accion">
                  <div className="pe-table-actions--icons">
                    <Tooltip title="Editar">
                      <IconButton size="small" color="primary" onClick={() => setModal({ ...r })}>
                        <EditOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Eliminar">
                      <IconButton size="small" color="error" onClick={() => eliminar(r)}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </div>
                </td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
      <PeTablaPaginacion
        page={pag.page}
        totalPages={pag.totalPages}
        total={pag.total}
        pageSize={pag.pageSize}
        onPageChange={pag.setPage}
        onPageSizeChange={pag.setPageSize}
      />
      {modal && (
        <Modal
          title={modal.id ? 'Editar categoría' : 'Nueva categoría'}
          onClose={() => setModal(null)}
          footer={
            <>
              <FactModalCancel onClick={() => setModal(null)} label="Cancelar" />
              <FactModalSave onClick={guardar} label="Guardar" />
            </>
          }
        >
          <div className="pe-form-grid">
            <TextField label="Nombre" size="small" value={modal.nombre} onChange={(e) => setModal({ ...modal, nombre: e.target.value })} fullWidth />
            <TextField label="Descripción" size="small" value={modal.descripcion || ''} onChange={(e) => setModal({ ...modal, descripcion: e.target.value })} fullWidth />
          </div>
        </Modal>
      )}
    </>
  );
}

function TabSubcategorias({ categorias }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [filtro, setFiltro] = useState('');
  const [filtroCat, setFiltroCat] = useState('');

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/facturacion/subcategorias');
      setItems(data.items || []);
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error al cargar' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const guardar = async () => {
    try {
      if (modal.id) {
        await api.put(`/admin/facturacion/subcategorias/${modal.id}`, modal);
      } else {
        await api.post('/admin/facturacion/subcategorias', modal);
      }
      setModal(null);
      cargar();
      Swal.fire({ icon: 'success', title: 'Guardado', timer: 1500, showConfirmButton: false });
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudo guardar' });
    }
  };

  const eliminar = async (row) => {
    const ok = await Swal.fire({ icon: 'warning', title: '¿Eliminar?', showCancelButton: true });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/admin/facturacion/subcategorias/${row.id}`);
      cargar();
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudo eliminar' });
    }
  };

  const filtrados = useMemo(() => {
    let list = items;
    if (filtroCat) list = list.filter((r) => String(r.categoria_id) === String(filtroCat));
    const q = filtro.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (r) =>
        String(r.nombre || '').toLowerCase().includes(q) ||
        String(r.categoria_nombre || '').toLowerCase().includes(q)
    );
  }, [items, filtro, filtroCat]);

  const pag = usePaginacionTabla(filtrados, [filtro, filtroCat]);

  if (loading) {
    return (
      <div className="pe-loading-inline">
        <CircularProgress size={22} />
      </div>
    );
  }

  return (
    <>
      <div className="pe-fact-actions pe-fact-actions--toolbar">
        <div className="pe-fact-filters">
          <FiltroBar value={filtro} onChange={setFiltro} placeholder="Nombre o categoría…" />
          <TextField select size="small" label="Categoría" value={filtroCat} onChange={(e) => setFiltroCat(e.target.value)} className="pe-field" fullWidth>
            <MenuItem value="">Todas</MenuItem>
            {categorias.map((c) => (
              <MenuItem key={c.id} value={String(c.id)}>
                {c.nombre}
              </MenuItem>
            ))}
          </TextField>
        </div>
        <button
          type="button"
          className="pe-btn pe-btn--primary pe-btn--icon"
          onClick={() => setModal({ categoria_id: categorias[0]?.id || '', nombre: '', descripcion: '', concar_igv: '', concar_cuenta: '', starsoft_cuenta: '' })}
        >
          <AddCircleOutlineIcon fontSize="small" />
          Nueva subcategoría
        </button>
      </div>
      <div className="pe-table-wrap">
        <table className="pe-table">
          <thead>
            <tr>
              <th>Categoría</th>
              <th>Nombre</th>
              <th>CONCAR IGV</th>
              <th className="pe-th-accion" />
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={4} className="pe-empty">
                  Sin subcategorías.
                </td>
              </tr>
            ) : (
              pag.paginated.map((r) => (
              <tr key={r.id}>
                <td>{r.categoria_nombre}</td>
                <td>{r.nombre}</td>
                <td>{r.concar_igv}</td>
                <td className="pe-td-accion">
                  <div className="pe-table-actions--icons">
                    <Tooltip title="Editar">
                      <IconButton size="small" color="primary" onClick={() => setModal({ ...r })}>
                        <EditOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Eliminar">
                      <IconButton size="small" color="error" onClick={() => eliminar(r)}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </div>
                </td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
      <PeTablaPaginacion
        page={pag.page}
        totalPages={pag.totalPages}
        total={pag.total}
        pageSize={pag.pageSize}
        onPageChange={pag.setPage}
        onPageSizeChange={pag.setPageSize}
      />
      {modal && (
        <Modal
          title={modal.id ? 'Editar subcategoría' : 'Nueva subcategoría'}
          onClose={() => setModal(null)}
          footer={
            <>
              <FactModalCancel onClick={() => setModal(null)} label="Cancelar" />
              <FactModalSave onClick={guardar} label="Guardar" />
            </>
          }
        >
          <div className="pe-form-grid">
            <TextField select label="Categoría" size="small" value={modal.categoria_id} onChange={(e) => setModal({ ...modal, categoria_id: e.target.value })} fullWidth>
              {categorias.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.nombre}
                </MenuItem>
              ))}
            </TextField>
            <TextField label="Nombre" size="small" value={modal.nombre} onChange={(e) => setModal({ ...modal, nombre: e.target.value })} fullWidth />
            <TextField label="Descripción" size="small" value={modal.descripcion || ''} onChange={(e) => setModal({ ...modal, descripcion: e.target.value })} fullWidth />
            <TextField label="CONCAR IGV" size="small" value={modal.concar_igv || ''} onChange={(e) => setModal({ ...modal, concar_igv: e.target.value })} fullWidth />
            <TextField label="CONCAR cuenta" size="small" value={modal.concar_cuenta || ''} onChange={(e) => setModal({ ...modal, concar_cuenta: e.target.value })} fullWidth />
            <TextField label="Starsoft cuenta" size="small" value={modal.starsoft_cuenta || ''} onChange={(e) => setModal({ ...modal, starsoft_cuenta: e.target.value })} fullWidth />
          </div>
        </Modal>
      )}
    </>
  );
}

function TabProductos({ categorias, subcategorias }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [stockModal, setStockModal] = useState(null);
  const [filtro, setFiltro] = useState('');
  const [filtroCat, setFiltroCat] = useState('');

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/facturacion/productos', { params: { ocultos: '1' } });
      setItems(data.items || []);
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error al cargar' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const subsDe = (catId) => subcategorias.filter((s) => Number(s.categoria_id) === Number(catId));

  const guardar = async () => {
    try {
      if (modal.id) {
        await api.put(`/admin/facturacion/productos/${modal.id}`, modal);
      } else {
        await api.post('/admin/facturacion/productos', modal);
      }
      setModal(null);
      cargar();
      Swal.fire({ icon: 'success', title: 'Guardado', timer: 1500, showConfirmButton: false });
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudo guardar' });
    }
  };

  const guardarStock = async () => {
    try {
      await api.post(`/admin/facturacion/productos/${stockModal.id}/recalcular-stock`, stockModal);
      setStockModal(null);
      cargar();
      Swal.fire({ icon: 'success', title: 'Stock actualizado', timer: 1500, showConfirmButton: false });
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error' });
    }
  };

  const eliminar = async (row) => {
    const ok = await Swal.fire({ icon: 'warning', title: '¿Eliminar producto?', showCancelButton: true });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/admin/facturacion/productos/${row.id}`);
      cargar();
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudo eliminar' });
    }
  };

  const filtrados = useMemo(() => {
    let list = items;
    if (filtroCat) list = list.filter((r) => String(r.categoria_id) === String(filtroCat));
    const q = filtro.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (r) =>
        String(r.descripcion || '').toLowerCase().includes(q) ||
        String(r.categoria_nombre || '').toLowerCase().includes(q)
    );
  }, [items, filtro, filtroCat]);

  const pag = usePaginacionTabla(filtrados, [filtro, filtroCat]);

  if (loading) {
    return (
      <div className="pe-loading-inline">
        <CircularProgress size={22} />
      </div>
    );
  }

  return (
    <>
      <div className="pe-fact-actions pe-fact-actions--toolbar">
        <div className="pe-fact-filters">
          <FiltroBar value={filtro} onChange={setFiltro} placeholder="Descripción o categoría…" />
          <TextField select size="small" label="Categoría" value={filtroCat} onChange={(e) => setFiltroCat(e.target.value)} className="pe-field" fullWidth>
            <MenuItem value="">Todas</MenuItem>
            {categorias.map((c) => (
              <MenuItem key={c.id} value={String(c.id)}>
                {c.nombre}
              </MenuItem>
            ))}
          </TextField>
        </div>
        <button
          type="button"
          className="pe-btn pe-btn--primary pe-btn--icon"
          onClick={() =>
            setModal({
              categoria_id: categorias[0]?.id || '',
              subcategoria_id: '',
              descripcion: '',
              precio_inicial: 0,
              costo_unitario: 0,
              controlar_stock: 'NO',
              stock: 0,
              ocultar: 'NO',
            })
          }
        >
          <AddCircleOutlineIcon fontSize="small" />
          Nuevo producto
        </button>
      </div>
      <div className="pe-table-wrap">
        <table className="pe-table">
          <thead>
            <tr>
              <th>Descripción</th>
              <th>Categoría</th>
              <th>Precio</th>
              <th>Stock</th>
              <th>Oculto</th>
              <th className="pe-th-accion" />
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={6} className="pe-empty">
                  Sin productos.
                </td>
              </tr>
            ) : (
              pag.paginated.map((r) => (
              <tr key={r.id}>
                <td>{r.descripcion}</td>
                <td>{r.categoria_nombre}</td>
                <td>S/ {Number(r.precio_inicial || 0).toFixed(2)}</td>
                <td>
                  {r.controlar_stock === 'SI' ? (
                    <span className="pe-badge pe-badge--ok">{r.stock}</span>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  <span className={`pe-badge ${r.ocultar === 'SI' ? 'pe-badge--pending' : 'pe-badge--ok'}`}>{r.ocultar}</span>
                </td>
                <td className="pe-td-accion">
                  <div className="pe-table-actions--icons">
                    <Tooltip title="Editar">
                      <IconButton size="small" color="primary" onClick={() => setModal({ ...r })}>
                        <EditOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    {r.controlar_stock === 'SI' && (
                      <Tooltip title="Stock">
                        <IconButton
                          size="small"
                          color="secondary"
                          onClick={() => setStockModal({ id: r.id, stock_inicial: r.stock_inicial || r.stock, precio_inicial: r.precio_inicial })}
                        >
                          <Inventory2OutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title="Eliminar">
                      <IconButton size="small" color="error" onClick={() => eliminar(r)}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </div>
                </td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
      <PeTablaPaginacion
        page={pag.page}
        totalPages={pag.totalPages}
        total={pag.total}
        pageSize={pag.pageSize}
        onPageChange={pag.setPage}
        onPageSizeChange={pag.setPageSize}
      />
      {modal && (
        <Modal
          title={modal.id ? 'Editar producto' : 'Nuevo producto'}
          onClose={() => setModal(null)}
          footer={
            <>
              <FactModalCancel onClick={() => setModal(null)} label="Cancelar" />
              <FactModalSave onClick={guardar} label="Guardar" />
            </>
          }
        >
          <div className="pe-form-grid pe-form-grid--producto">
            <TextField select label="Categoría" size="small" value={modal.categoria_id} onChange={(e) => setModal({ ...modal, categoria_id: e.target.value, subcategoria_id: '' })} fullWidth>
              {categorias.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.nombre}
                </MenuItem>
              ))}
            </TextField>
            <TextField select label="Subcategoría" size="small" value={modal.subcategoria_id || ''} onChange={(e) => setModal({ ...modal, subcategoria_id: e.target.value })} fullWidth>
              <MenuItem value="">—</MenuItem>
              {subsDe(modal.categoria_id).map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.nombre}
                </MenuItem>
              ))}
            </TextField>
            <TextField label="Descripción" size="small" value={modal.descripcion} onChange={(e) => setModal({ ...modal, descripcion: e.target.value })} fullWidth />
            <TextField label="Precio" size="small" type="number" value={modal.precio_inicial} onChange={(e) => setModal({ ...modal, precio_inicial: e.target.value })} fullWidth />
            <TextField select label="Controlar stock" size="small" value={modal.controlar_stock || 'NO'} onChange={(e) => setModal({ ...modal, controlar_stock: e.target.value })} fullWidth>
              <MenuItem value="NO">NO</MenuItem>
              <MenuItem value="SI">SI</MenuItem>
            </TextField>
            {modal.controlar_stock === 'SI' && !modal.id && (
              <TextField label="Stock inicial" size="small" type="number" value={modal.stock} onChange={(e) => setModal({ ...modal, stock: e.target.value })} fullWidth />
            )}
            <TextField select label="Ocultar" size="small" value={modal.ocultar || 'NO'} onChange={(e) => setModal({ ...modal, ocultar: e.target.value })} fullWidth>
              <MenuItem value="NO">NO</MenuItem>
              <MenuItem value="SI">SI</MenuItem>
            </TextField>
          </div>
        </Modal>
      )}
      {stockModal && (
        <Modal
          title="Recalcular stock"
          onClose={() => setStockModal(null)}
          footer={
            <>
              <FactModalCancel onClick={() => setStockModal(null)} label="Cancelar" />
              <FactModalSave onClick={guardarStock} label="Actualizar" />
            </>
          }
        >
          <div className="pe-form-grid">
            <TextField label="Stock inicial" type="number" size="small" value={stockModal.stock_inicial} onChange={(e) => setStockModal({ ...stockModal, stock_inicial: e.target.value })} />
            <TextField label="Precio inicial" type="number" size="small" value={stockModal.precio_inicial} onChange={(e) => setStockModal({ ...stockModal, precio_inicial: e.target.value })} />
          </div>
        </Modal>
      )}
    </>
  );
}

export default function AdminProductos() {
  const [tab, setTab] = useState('productos');
  const [categorias, setCategorias] = useState([]);
  const [subcategorias, setSubcategorias] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [cat, sub] = await Promise.all([
          api.get('/admin/facturacion/categorias'),
          api.get('/admin/facturacion/subcategorias'),
        ]);
        setCategorias(cat.data.items || []);
        setSubcategorias(sub.data.items || []);
      } catch {
        /* tabs load own data */
      }
    })();
  }, []);

  return (
    <DashboardLayout>
      <div className="pe-wrap">
        <header className="pe-header">
          <h1>Productos</h1>
          <p>Catálogo de productos, categorías y subcategorías para ventas y compras.</p>
        </header>
        <nav className="pe-tabs pe-tabs--full pe-tabs--fact" aria-label="Secciones de productos">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={`pe-tab pe-tab--${t.tone}${tab === t.id ? ' pe-tab--active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <div
          className={`pe-tab-panel pe-card pe-card--pastel-${tab === 'categorias' ? 'sky' : tab === 'subcategorias' ? 'mint' : 'lavender'}`}
        >
          {tab === 'categorias' && <TabCategorias />}
          {tab === 'subcategorias' && <TabSubcategorias categorias={categorias} />}
          {tab === 'productos' && <TabProductos categorias={categorias} subcategorias={subcategorias} />}
        </div>
      </div>
    </DashboardLayout>
  );
}
