import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import './KioscoCafetin.css';

function sumarDias(iso, dias) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function etiquetaDia(iso, hoy) {
  if (iso === hoy) return 'Hoy';
  if (iso === sumarDias(hoy, 1)) return 'Mañana';
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function KioscoCafetin() {
  const { user } = useAuth();
  const caja = user?.tipo === 'KIOSCO' || user?.tipo === 'ADMINISTRADOR';
  const [tab, setTab] = useState(caja ? 'pedidos' : 'pedir');
  const [yo, setYo] = useState(null);
  const [busca, setBusca] = useState('');
  const [clientes, setClientes] = useState([]);
  const [clienteUsuarioId, setClienteUsuarioId] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [config, setConfig] = useState(null);
  const [hoy, setHoy] = useState('');
  const [fecha, setFecha] = useState('');
  const [carta, setCarta] = useState({ categorias: [], productos: [] });
  const [catId, setCatId] = useState('todas');
  const [hijos, setHijos] = useState([]);
  const [alumnoId, setAlumnoId] = useState('');
  const [carrito, setCarrito] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [pedidos, setPedidos] = useState([]);
  const [catalogo, setCatalogo] = useState({ categorias: [], productos: [] });
  const [resumen, setResumen] = useState(null);
  const [formCat, setFormCat] = useState({ nombre: '', emoji: '🍽️' });
  const [formProd, setFormProd] = useState({
    nombre: '', precio: '', emoji: '🥤', categoria_id: '', siempre: true, es_comida: false, stock: '10',
  });

  const cargarBase = useCallback(async () => {
    const { data } = await api.get('/kiosco/config');
    setConfig(data.config);
    setHoy(data.hoy);
    setFecha((f) => f || data.hoy);
    return data;
  }, []);

  const cargarCarta = useCallback(async (dia) => {
    if (!dia) return;
    const { data } = await api.get('/kiosco/carta', { params: { fecha: dia } });
    setCarta({ categorias: data.categorias || [], productos: data.productos || [] });
  }, []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      setError('');
      try {
        await cargarBase();
        if (!caja) {
          const { data } = await api.get('/kiosco/hijos');
          if (!vivo) return;
          setHijos(data.hijos || []);
          setYo(data.yo || null);
          if (data.hijos?.[0]) setAlumnoId(String(data.hijos[0].id));
        }
      } catch (e) {
        if (vivo) setError(e.response?.data?.error || 'No se pudo abrir el kiosco.');
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, [caja, cargarBase]);

  useEffect(() => {
    if (fecha) cargarCarta(fecha).catch(() => {});
  }, [fecha, cargarCarta]);

  const cargarPedidos = useCallback(async () => {
    const { data } = await api.get('/kiosco/pedidos', { params: { estado: 'todos' } });
    setPedidos(data.pedidos || []);
    const r = await api.get('/kiosco/resumen');
    setResumen(r.data);
  }, []);

  const cargarCatalogo = useCallback(async () => {
    const { data } = await api.get('/kiosco/catalogo');
    setCatalogo({ categorias: data.categorias || [], productos: data.productos || [] });
  }, []);

  useEffect(() => {
    if (!caja) return;
    if (tab === 'pedidos' || tab === 'caja') cargarPedidos().catch(() => {});
    if (tab === 'productos' || tab === 'carta') cargarCatalogo().catch(() => {});
  }, [caja, tab, cargarPedidos, cargarCatalogo]);

  const productosVisibles = useMemo(() => {
    if (catId === 'todas') return carta.productos;
    return carta.productos.filter((p) => String(p.categoria_id) === String(catId));
  }, [carta, catId]);

  const total = carrito.reduce((s, it) => s + Number(it.precio) * it.cantidad, 0);
  const hijoSel = hijos.find((h) => String(h.id) === String(alumnoId));

  const agregar = (p) => {
    setCarrito((prev) => {
      const ya = prev.find((it) => it.producto_id === p.id);
      if (ya) return prev.map((it) => (it.producto_id === p.id ? { ...it, cantidad: it.cantidad + 1 } : it));
      return [...prev, { producto_id: p.id, nombre: p.nombre, precio: Number(p.precio), cantidad: 1, emoji: p.emoji }];
    });
  };

  const pedir = async (origen, pago) => {
    setEnviando(true);
    setAviso('');
    setError('');
    try {
      const { data } = await api.post('/kiosco/pedidos', {
        alumno_id: alumnoId ? parseInt(alumnoId, 10) : null,
        cliente_usuario_id: clienteUsuarioId ? parseInt(clienteUsuarioId, 10) : null,
        para_mi: Boolean(yo) && !caja,
        fecha,
        items: carrito.map((it) => ({ producto_id: it.producto_id, cantidad: it.cantidad })),
        origen,
        pago,
      });
      setCarrito([]);
      setAviso(origen === 'mostrador' ? `Venta lista. Código ${data.codigo}.` : `Pedido enviado. Código ${data.codigo}.`);
      cargarCarta(fecha).catch(() => {});
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo enviar el pedido.');
    } finally {
      setEnviando(false);
    }
  };

  const decidir = async (id, estado, pago) => {
    await api.post(`/kiosco/pedidos/${id}/estado`, { estado, pago });
    cargarPedidos().catch(() => {});
  };

  const guardarAjustes = async (siguiente) => {
    const { data } = await api.put('/kiosco/config', siguiente);
    setConfig(data.config);
    setAviso('Ajustes guardados.');
  };

  if (cargando) {
    return (
      <DashboardLayout>
      <div className="kio-page">
        <div className="kio-loading">
          <div className="kio-loading-mark">☕</div>
          <p>Preparando la carta…</p>
        </div>
      </div>
      </DashboardLayout>
    );
  }

  const dias = hoy ? [0, 1, 2, 3, 4, 5, 6].map((n) => sumarDias(hoy, n)) : [];

  return (
    <DashboardLayout>
    <div className="kio-page">
      <header className="kio-hero">
        <div>
          <p className="kio-kicker">Colegio</p>
          <h1>Kiosco cafetín</h1>
          <p className="kio-lead">Lo de siempre y lo del día, para pedir con calma.</p>
        </div>
        {resumen && caja && (
          <div className="kio-stats">
            <div><span>Hoy</span><strong>S/ {resumen.ventas_dia.toFixed(2)}</strong></div>
            <div><span>Mes</span><strong>S/ {resumen.ventas_mes.toFixed(2)}</strong></div>
            <div><span>Fiado</span><strong>S/ {resumen.fiado.toFixed(2)}</strong></div>
          </div>
        )}
      </header>

      {caja && (
        <nav className="kio-tabs">
          {[
            ['vender', 'Vender'],
            ['pedidos', 'Pedidos'],
            ['carta', 'Carta del día'],
            ['productos', 'Productos'],
            ['caja', 'Caja'],
            ['ajustes', 'Ajustes'],
          ].map(([id, label]) => (
            <button key={id} type="button" className={tab === id ? 'is-on' : ''} onClick={() => setTab(id)}>{label}</button>
          ))}
        </nav>
      )}

      {error && <p className="kio-alert">{error}</p>}
      {aviso && <p className="kio-ok">{aviso}</p>}

      {(tab === 'vender' || tab === 'pedir' || !caja) && (
        <section className="kio-pedir">
          <div className="kio-dias">
            {dias.map((d) => (
              <button key={d} type="button" className={fecha === d ? 'is-on' : ''} onClick={() => setFecha(d)}>
                {etiquetaDia(d, hoy)}
              </button>
            ))}
          </div>
          {hijos.length > 0 && (
            <label className="kio-hijo">
              Para
              <select value={alumnoId} onChange={(e) => setAlumnoId(e.target.value)}>
                {hijos.map((h) => (
                  <option key={h.id} value={h.id}>{h.nombre}{h.grado ? ` · ${h.grado}` : ''}</option>
                ))}
              </select>
              {hijoSel && <span className="kio-deuda">Debe S/ {Number(hijoSel.deuda).toFixed(2)}</span>}
            </label>
          )}
          {yo && !caja && (
            <p className="kio-hijo">Pedido para <strong>{yo.nombre}</strong> <span className="kio-deuda">Debe S/ {Number(yo.deuda).toFixed(2)}</span></p>
          )}
          {caja && (
            <label className="kio-hijo">
              Alumno o personal
              <input
                value={busca}
                onChange={async (e) => {
                  const v = e.target.value;
                  setBusca(v);
                  if (v.trim().length < 2) { setClientes([]); return; }
                  const { data } = await api.get('/kiosco/clientes', { params: { q: v.trim() } });
                  setClientes(data.clientes || []);
                }}
                placeholder="Nombre o DNI"
              />
              {clientes.length > 0 && (
                <select
                  value={alumnoId ? `a-${alumnoId}` : clienteUsuarioId ? `u-${clienteUsuarioId}` : ''}
                  onChange={(e) => {
                    const [tipo, id] = e.target.value.split('-');
                    setAlumnoId(tipo === 'a' ? id : '');
                    setClienteUsuarioId(tipo === 'u' ? id : '');
                  }}
                >
                  <option value="">Elige</option>
                  {clientes.map((c) => (
                    <option key={`${c.alumno_id || 'u'}-${c.usuario_id || c.alumno_id}`} value={c.alumno_id ? `a-${c.alumno_id}` : `u-${c.usuario_id}`}>
                      {c.nombre} · {c.clase}
                    </option>
                  ))}
                </select>
              )}
            </label>
          )}
          <div className="kio-cats">
            <button type="button" className={catId === 'todas' ? 'is-on' : ''} onClick={() => setCatId('todas')}>Todo</button>
            {carta.categorias.map((c) => (
              <button key={c.id} type="button" className={String(catId) === String(c.id) ? 'is-on' : ''} onClick={() => setCatId(String(c.id))}>
                {c.emoji} {c.nombre}
              </button>
            ))}
          </div>
          <div className="kio-grid">
            {productosVisibles.map((p) => (
              <button key={p.id} type="button" className="kio-card" onClick={() => agregar(p)}>
                <span className="kio-card-emoji">{p.imagen_url ? <img src={p.imagen_url} alt="" /> : p.emoji}</span>
                <strong>{p.nombre}</strong>
                <em>{p.descripcion}</em>
                <span className="kio-precio">S/ {Number(p.precio).toFixed(2)}</span>
                <span className="kio-stock">{Number(p.siempre) === 1 ? 'Siempre' : 'Del día'} · {p.stock} u.</span>
              </button>
            ))}
            {!productosVisibles.length && <p className="kio-vacio">Este día todavía no tiene productos publicados.</p>}
          </div>
          <aside className="kio-carrito">
            <h2>Tu pedido</h2>
            {!carrito.length && <p>Toca un producto para sumarlo.</p>}
            {carrito.map((it) => (
              <div key={it.producto_id} className="kio-linea">
                <span>{it.emoji} {it.nombre} × {it.cantidad}</span>
                <span>S/ {(it.precio * it.cantidad).toFixed(2)}</span>
              </div>
            ))}
            <p className="kio-total">Total S/ {total.toFixed(2)}</p>
            {!caja && (
              <button type="button" className="kio-btn" disabled={enviando || !carrito.length || (!alumnoId && !yo)} onClick={() => pedir('linea', 'pendiente')}>
                {enviando ? 'Enviando…' : 'Pedir'}
              </button>
            )}
            {caja && (
              <div className="kio-btn-row">
                <button type="button" className="kio-btn" disabled={enviando || !carrito.length || (!alumnoId && !clienteUsuarioId)} onClick={() => pedir('mostrador', 'pagado')}>Cobrar</button>
                <button type="button" className="kio-btn kio-btn-ghost" disabled={enviando || !carrito.length || (!alumnoId && !clienteUsuarioId)} onClick={() => pedir('mostrador', 'fiado')}>Fiar</button>
              </div>
            )}
          </aside>
        </section>
      )}

      {caja && tab === 'pedidos' && (
        <section className="kio-cola">
          {pedidos.filter((p) => p.estado === 'pedido').map((p) => (
            <article key={p.id} className="kio-pedido">
              <header>
                <div>
                  <strong>{p.alumno}</strong>
                  <span>{p.grado} · {p.fecha_consumo} · #{p.codigo}</span>
                </div>
                <b>S/ {Number(p.total).toFixed(2)}</b>
              </header>
              <ul>{(p.items || []).map((it, i) => <li key={i}>{it.cantidad} × {it.nombre}</li>)}</ul>
              <p className="kio-deuda">Debe S/ {Number(p.deuda).toFixed(2)}</p>
              <div className="kio-btn-row">
                <button type="button" className="kio-btn" onClick={() => decidir(p.id, 'aceptado', 'pendiente')}>Aceptar</button>
                {config?.fiado_activo && (
                  <button type="button" className="kio-btn kio-btn-ghost" onClick={() => decidir(p.id, 'aceptado', 'fiado')}>Aceptar fiado</button>
                )}
                <button type="button" className="kio-btn kio-btn-danger" onClick={() => decidir(p.id, 'rechazado')}>Rechazar</button>
              </div>
            </article>
          ))}
          {!pedidos.some((p) => p.estado === 'pedido') && <p className="kio-vacio">No hay pedidos esperando.</p>}
          <h3>Para entregar</h3>
          {pedidos.filter((p) => p.estado === 'aceptado').map((p) => (
            <article key={p.id} className="kio-pedido kio-pedido-ok">
              <header>
                <div>
                  <strong>{p.alumno}</strong>
                  <span>{p.grado} · #{p.codigo} · {p.pago}</span>
                </div>
                <button type="button" className="kio-btn" onClick={() => decidir(p.id, 'entregado', p.pago)}>Entregado</button>
              </header>
              <ul>{(p.items || []).map((it, i) => <li key={i}>{it.cantidad} × {it.nombre}</li>)}</ul>
            </article>
          ))}
        </section>
      )}

      {caja && tab === 'productos' && (
        <section className="kio-forms">
          <form onSubmit={async (e) => { e.preventDefault(); await api.post('/kiosco/categorias', formCat); setFormCat({ nombre: '', emoji: '🍽️' }); cargarCatalogo(); }}>
            <h2>Categoría</h2>
            <input value={formCat.nombre} onChange={(e) => setFormCat({ ...formCat, nombre: e.target.value })} placeholder="Bebidas, snacks, menú…" required />
            <input value={formCat.emoji} onChange={(e) => setFormCat({ ...formCat, emoji: e.target.value })} placeholder="Emoji" />
            <button className="kio-btn" type="submit">Crear categoría</button>
          </form>
          <form onSubmit={async (e) => {
            e.preventDefault();
            await api.post('/kiosco/productos', { ...formProd, precio: Number(formProd.precio), stock: Number(formProd.stock) });
            setFormProd({ nombre: '', precio: '', emoji: '🥤', categoria_id: '', siempre: true, es_comida: false, stock: '10' });
            cargarCatalogo();
            cargarCarta(fecha);
          }}>
            <h2>Producto</h2>
            <input value={formProd.nombre} onChange={(e) => setFormProd({ ...formProd, nombre: e.target.value })} placeholder="Nombre" required />
            <input value={formProd.precio} onChange={(e) => setFormProd({ ...formProd, precio: e.target.value })} placeholder="Precio" required />
            <input value={formProd.emoji} onChange={(e) => setFormProd({ ...formProd, emoji: e.target.value })} placeholder="Emoji" />
            <select value={formProd.categoria_id} onChange={(e) => setFormProd({ ...formProd, categoria_id: e.target.value })}>
              <option value="">Sin categoría</option>
              {catalogo.categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <input value={formProd.stock} onChange={(e) => setFormProd({ ...formProd, stock: e.target.value })} placeholder="Stock" />
            <label><input type="checkbox" checked={formProd.siempre} onChange={(e) => setFormProd({ ...formProd, siempre: e.target.checked })} /> De siempre</label>
            <label><input type="checkbox" checked={formProd.es_comida} onChange={(e) => setFormProd({ ...formProd, es_comida: e.target.checked })} /> Es comida</label>
            <button className="kio-btn" type="submit">Publicar producto</button>
          </form>
          <ul className="kio-lista">
            {catalogo.productos.map((p) => (
              <li key={p.id}>
                <span>{p.emoji} {p.nombre} · S/ {Number(p.precio).toFixed(2)} · stock {p.stock}</span>
                <span>
                  <button type="button" onClick={() => api.post('/kiosco/stock', { producto_id: p.id, cantidad: 1 }).then(cargarCatalogo)}>+1</button>
                  <button type="button" onClick={() => api.post('/kiosco/stock', { producto_id: p.id, cantidad: -1 }).then(cargarCatalogo)}>−1</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {caja && tab === 'carta' && (
        <section className="kio-forms">
          <h2>Publicar en un día</h2>
          <p>Lo marcado como “de siempre” ya sale todos los días. Aquí sumas lo novedoso.</p>
          <form onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            await api.post('/kiosco/carta', { producto_id: fd.get('producto_id'), fecha: fd.get('fecha') });
            setAviso('Quedó en la carta de ese día.');
            cargarCarta(fecha);
          }}>
            <select name="producto_id" required>
              <option value="">Producto</option>
              {catalogo.productos.filter((p) => Number(p.siempre) !== 1).map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
            <input type="date" name="fecha" defaultValue={fecha} required />
            <button className="kio-btn" type="submit">Poner en ese día</button>
          </form>
        </section>
      )}

      {caja && tab === 'caja' && (
        <section className="kio-cola">
          <h2>Ventas y pendientes</h2>
          {pedidos.filter((p) => p.estado === 'aceptado' || p.estado === 'entregado').map((p) => (
            <article key={p.id} className="kio-pedido">
              <header>
                <div>
                  <strong>{p.alumno}</strong>
                  <span>{p.grado} · {p.pago} · {p.origen}</span>
                </div>
                <b>S/ {Number(p.total).toFixed(2)}</b>
              </header>
              {p.pago !== 'pagado' && (
                <button type="button" className="kio-btn" onClick={() => decidir(p.id, p.estado === 'pedido' ? 'aceptado' : p.estado, 'pagado')}>Marcar pagado</button>
              )}
            </article>
          ))}
        </section>
      )}

      {caja && tab === 'ajustes' && config && (
        <section className="kio-ajustes">
          <h2>Cómo se pide</h2>
          <div className="kio-ajuste">
            <div>
              <strong>Familia</strong>
              <p>Quién de la familia puede armar un pedido en línea.</p>
            </div>
            <select value={config.quien_pide} onChange={(e) => setConfig({ ...config, quien_pide: e.target.value })}>
              <option value="AMBOS">Papá y alumno</option>
              <option value="APODERADO">Solo el papá</option>
              <option value="ALUMNO">Solo el alumno</option>
            </select>
          </div>
          <div className="kio-ajuste">
            <div>
              <strong>Personal</strong>
              <p>Docentes y administrativos también pueden pedir en línea.</p>
            </div>
            <label className="kio-switch">
              <input type="checkbox" checked={config.pide_personal !== false} onChange={(e) => setConfig({ ...config, pide_personal: e.target.checked })} />
              <span>{config.pide_personal !== false ? 'Pueden pedir' : 'No pueden pedir'}</span>
            </label>
          </div>
          <div className="kio-ajuste">
            <div>
              <strong>Límite de monto</strong>
              <p>Si está apagado, el pedido no tiene tope.</p>
            </div>
            <div className="kio-ajuste-ctrl">
              <label className="kio-switch">
                <input type="checkbox" checked={config.limite_activo} onChange={(e) => setConfig({ ...config, limite_activo: e.target.checked })} />
                <span>{config.limite_activo ? 'Con límite' : 'Sin límite'}</span>
              </label>
              {config.limite_activo && (
                <input type="number" min="0" step="0.5" value={config.limite_monto} onChange={(e) => setConfig({ ...config, limite_monto: e.target.value })} />
              )}
            </div>
          </div>
          <div className="kio-ajuste">
            <div>
              <strong>Hora de corte</strong>
              <p>Si está apagada, se puede pedir hasta el último momento.</p>
            </div>
            <div className="kio-ajuste-ctrl">
              <label className="kio-switch">
                <input type="checkbox" checked={config.corte_activo} onChange={(e) => setConfig({ ...config, corte_activo: e.target.checked })} />
                <span>{config.corte_activo ? 'Con corte' : 'Sin corte'}</span>
              </label>
              {config.corte_activo && (
                <input type="time" value={config.corte_hora || '20:00'} onChange={(e) => setConfig({ ...config, corte_hora: e.target.value })} />
              )}
            </div>
          </div>
          <div className="kio-ajuste">
            <div>
              <strong>Comida</strong>
              <p>Muestra los productos marcados como comida.</p>
            </div>
            <label className="kio-switch">
              <input type="checkbox" checked={config.comida_activa} onChange={(e) => setConfig({ ...config, comida_activa: e.target.checked })} />
              <span>{config.comida_activa ? 'Ofrecer' : 'Ocultar'}</span>
            </label>
          </div>
          <div className="kio-ajuste">
            <div>
              <strong>Fiado</strong>
              <p>Permite dejar el pago pendiente.</p>
            </div>
            <label className="kio-switch">
              <input type="checkbox" checked={config.fiado_activo} onChange={(e) => setConfig({ ...config, fiado_activo: e.target.checked })} />
              <span>{config.fiado_activo ? 'Permitido' : 'No permitir'}</span>
            </label>
          </div>
          <button type="button" className="kio-btn" onClick={() => guardarAjustes(config)}>Guardar ajustes</button>
        </section>
      )}
    </div>
    </DashboardLayout>
  );
}
