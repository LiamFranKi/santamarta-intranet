import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import './KioscoCafetin.css';

function sumarDias(iso, dias) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

const EMOJIS = ['🥤', '🧃', '💧', '☕', '🍪', '🍫', '🍬', '🍩', '🍔', '🍟', '🌭', '🍕', '🥪', '🌮', '🥗', '🍚', '🍗', '🍦', '🍎', '🍌'];

function etiquetaDia(iso, hoy) {
  if (iso === hoy) return 'Hoy';
  if (iso === sumarDias(hoy, 1)) return 'Mañana';
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' });
}

function Foto({ src, emoji }) {
  if (src) return <img src={src} alt="" />;
  return <span>{emoji || '🍽️'}</span>;
}

function Icono({ tipo }) {
  const p = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  if (tipo === 'edit') {
    return <svg {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>;
  }
  if (tipo === 'trash') {
    return <svg {...p}><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>;
  }
  if (tipo === 'check') return <svg {...p}><path d="M20 6 9 17l-5-5" /></svg>;
  if (tipo === 'x') return <svg {...p}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>;
  if (tipo === 'box') return <svg {...p}><path d="M21 8 12 3 3 8v8l9 5 9-5V8z" /><path d="M3 8l9 5 9-5" /><path d="M12 13v8" /></svg>;
  return <svg {...p}><path d="M12 5v14" /><path d="M5 12h14" /></svg>;
}

function Modal({ titulo, onClose, children, ancho, encima }) {
  return createPortal(
    <div className={`kio-overlay${encima ? ' kio-overlay-top' : ''}`} onClick={onClose} role="presentation">
      <div className={`kio-modal ${ancho || ''}`} onClick={(e) => e.stopPropagation()} role="dialog">
        <header>
          <h2>{titulo}</h2>
          <button type="button" className="kio-x" onClick={onClose} aria-label="Cerrar">×</button>
        </header>
        <div className="kio-modal-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}

export default function KioscoCafetin() {
  const { user } = useAuth();
  const caja = user?.tipo === 'KIOSCO' || user?.tipo === 'ADMINISTRADOR';
  const [ventana, setVentana] = useState(null);
  const [panel, setPanel] = useState(null);
  const [cartaDias, setCartaDias] = useState([]);
  const [especiales, setEspeciales] = useState([]);
  const [buscaEsp, setBuscaEsp] = useState('');
  const [activarFecha, setActivarFecha] = useState({});
  const [misPedidos, setMisPedidos] = useState([]);
  const [deudaMia, setDeudaMia] = useState(0);
  const [editCatId, setEditCatId] = useState(null);
  const [editProdId, setEditProdId] = useState(null);
  const [yo, setYo] = useState(null);
  const [busca, setBusca] = useState('');
  const [clientes, setClientes] = useState([]);
  const [clienteSel, setClienteSel] = useState(null);
  const [clienteUsuarioId, setClienteUsuarioId] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [config, setConfig] = useState(null);
  const [hoy, setHoy] = useState('');
  const [fecha, setFecha] = useState('');
  const [carta, setCarta] = useState({ categorias: [], productos: [] });
  const [catId, setCatId] = useState('');
  const [hijos, setHijos] = useState([]);
  const [alumnoId, setAlumnoId] = useState('');
  const [carrito, setCarrito] = useState([]);
  const [pieza, setPieza] = useState(null);
  const [cant, setCant] = useState(1);
  const [reemplazar, setReemplazar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [pedidos, setPedidos] = useState([]);
  const [catalogo, setCatalogo] = useState({ categorias: [], productos: [] });
  const [resumen, setResumen] = useState(null);
  const [formCat, setFormCat] = useState({ nombre: '', emoji: '🍽️', imagen: null });
  const [formProd, setFormProd] = useState({
    nombre: '', precio: '', detalle: '', emoji: '🥤', categoria_id: '', siempre: true, es_comida: false, stock: '', imagen: null,
  });
  const [vistaCarta, setVistaCarta] = useState('cats');
  const [emojiPara, setEmojiPara] = useState(null);
  const [stockDe, setStockDe] = useState(null);
  const [stockCant, setStockCant] = useState('');

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
    const categorias = data.categorias || [];
    setCarta({ categorias, productos: data.productos || [] });
    setCatId((id) => id || (categorias[0] ? String(categorias[0].id) : ''));
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
        } else {
          const r = await api.get('/kiosco/resumen');
          const p = await api.get('/kiosco/pedidos', { params: { estado: 'todos' } });
          if (!vivo) return;
          setResumen(r.data);
          setPedidos(p.data.pedidos || []);
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

  const cargarCartaDias = useCallback(async () => {
    const { data } = await api.get('/kiosco/carta-dias');
    setCartaDias(data.filas || []);
    setEspeciales(data.especiales || []);
  }, []);

  const cargarMios = useCallback(async () => {
    const { data } = await api.get('/kiosco/mis-pedidos');
    setMisPedidos(data.pedidos || []);
    setDeudaMia(Number(data.deuda) || 0);
  }, []);

  const productosVisibles = useMemo(() => {
    if (catId === 'carta') return carta.productos.filter((p) => Number(p.siempre) !== 1);
    if (!catId) return [];
    return carta.productos.filter((p) => String(p.categoria_id) === String(catId) && Number(p.siempre) === 1);
  }, [carta, catId]);

  const total = carrito.reduce((s, it) => s + Number(it.precio) * it.cantidad, 0);
  const piezas = carrito.reduce((s, it) => s + it.cantidad, 0);
  const hijoSel = hijos.find((h) => String(h.id) === String(alumnoId));
  const dias = hoy ? [0, 1, 2, 3, 4, 5, 6].map((n) => sumarDias(hoy, n)) : [];
  const esperando = pedidos.filter((p) => p.estado === 'pedido').length;

  const enCarrito = (productoId) => carrito.find((it) => it.producto_id === productoId)?.cantidad || 0;

  const abrirPieza = (p) => {
    const libres = Number(p.stock) - enCarrito(p.id);
    if (libres <= 0) return;
    setReemplazar(false);
    setPieza(p);
    setCant(1);
  };

  const editarLinea = (it) => {
    setReemplazar(true);
    setPieza({
      id: it.producto_id,
      nombre: it.nombre,
      precio: it.precio,
      emoji: it.emoji,
      imagen_url: it.imagen_url,
      stock: it.stock,
    });
    setCant(it.cantidad);
  };

  const topePieza = pieza
    ? Math.max(0, Number(pieza.stock) - (reemplazar ? 0 : enCarrito(pieza.id)))
    : 0;

  const confirmarPieza = () => {
    const n = Math.max(1, Math.min(cant, topePieza || 1));
    if (!topePieza) return;
    setCarrito((prev) => {
      const ya = prev.find((it) => it.producto_id === pieza.id);
      const base = {
        producto_id: pieza.id,
        nombre: pieza.nombre,
        precio: Number(pieza.precio),
        emoji: pieza.emoji,
        imagen_url: pieza.imagen_url,
        stock: Number(pieza.stock) || 0,
      };
      if (reemplazar && ya) {
        return prev.map((it) => (it.producto_id === pieza.id ? { ...it, ...base, cantidad: n } : it));
      }
      if (ya) {
        return prev.map((it) => (it.producto_id === pieza.id ? { ...it, ...base, cantidad: it.cantidad + n } : it));
      }
      return [...prev, { ...base, cantidad: n }];
    });
    setPieza(null);
    setReemplazar(false);
  };

  const buscarCliente = async (texto) => {
    setBusca(texto);
    if (texto.trim().length < 2) {
      setClientes([]);
      return;
    }
    const { data } = await api.get('/kiosco/clientes', { params: { q: texto.trim() } });
    setClientes(data.clientes || []);
  };

  const elegirCliente = (c) => {
    setClienteSel(c);
    setAlumnoId(c.alumno_id ? String(c.alumno_id) : '');
    setClienteUsuarioId(c.usuario_id ? String(c.usuario_id) : '');
    setClientes([]);
    setBusca(c.nombre);
  };

  const pedir = async (origen, pago) => {
    setEnviando(true);
    setAviso('');
    setError('');
    try {
      const { data } = await api.post('/kiosco/pedidos', {
        alumno_id: alumnoId ? parseInt(alumnoId, 10) : null,
        cliente_usuario_id: clienteUsuarioId
          ? parseInt(clienteUsuarioId, 10)
          : (yo?.usuario_id ? parseInt(yo.usuario_id, 10) : null),
        para_mi: !caja && !alumnoId,
        fecha,
        items: carrito.map((it) => ({ producto_id: it.producto_id, cantidad: it.cantidad })),
        origen,
        pago,
      });
      setCarrito([]);
      setVentana(null);
      setAviso(origen === 'mostrador' ? `Venta lista. Código ${data.codigo}.` : `Pedido enviado. Código ${data.codigo}.`);
      cargarCarta(fecha).catch(() => {});
      if (caja) cargarPedidos().catch(() => {});
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo enviar el pedido.');
    } finally {
      setEnviando(false);
    }
  };

  const decidir = async (id, estado, pago) => {
    setError('');
    try {
      await api.post(`/kiosco/pedidos/${id}/estado`, { estado, pago });
      setAviso(estado === 'rechazado' ? 'Pedido rechazado.' : `Pedido aceptado como ${pago === 'fiado' ? 'fiado' : 'pagado'}.`);
      cargarPedidos().catch(() => {});
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo actualizar el pedido.');
    }
  };

  const guardarAjustes = async (siguiente) => {
    const { data } = await api.put('/kiosco/config', siguiente);
    setConfig(data.config);
    setAviso('Ajustes guardados.');
    setVentana(null);
  };

  const nombreCat = catId === 'carta'
    ? 'Carta del día'
    : (carta.categorias.find((c) => String(c.id) === String(catId))?.nombre || 'Productos');

  const cartaBloque = vistaCarta === 'cats' ? (
    <div className="kio-cats-lg">
      <button type="button" onClick={() => { setCatId('carta'); setVistaCarta('prods'); }}>
        <Foto src={config?.carta_imagen_url} emoji="🍽️" />
        <span>Carta del día</span>
      </button>
      {carta.categorias.map((c) => (
        <button key={c.id} type="button" onClick={() => { setCatId(String(c.id)); setVistaCarta('prods'); }}>
          <Foto src={c.imagen_url} emoji={c.emoji} />
          <span>{c.nombre}</span>
        </button>
      ))}
    </div>
  ) : (
    <>
      <button type="button" className="kio-atras" onClick={() => setVistaCarta('cats')}>← Categorías</button>
      <h3 className="kio-cat-titulo">{nombreCat}</h3>
      <div className="kio-platos">
        {productosVisibles.map((p) => {
          const agotado = Number(p.stock) <= 0;
          return (
            <button key={p.id} type="button" className={`kio-plato${agotado ? ' is-agotado' : ''}`} onClick={() => abrirPieza(p)}>
              <div className="kio-plato-foto"><Foto src={p.imagen_url} emoji={p.emoji} /></div>
              <strong>{p.nombre}</strong>
              {p.descripcion ? <small className="kio-detalle">{p.descripcion}</small> : null}
              <em>S/ {Number(p.precio).toFixed(2)}</em>
              <small className="kio-stock">{agotado ? 'Agotado' : `Quedan ${p.stock}`}</small>
            </button>
          );
        })}
        {!productosVisibles.length && <p className="kio-vacio">{catId === 'carta' ? 'Hoy no hay platos de la carta.' : 'Esta categoría no tiene productos de siempre.'}</p>}
      </div>
    </>
  );

  if (cargando) {
    return (
      <DashboardLayout>
        <div className="kio-page"><div className="kio-loading"><div className="kio-loading-mark">☕</div><p>Preparando la carta…</p></div></div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="kio-page">
        <header className="kio-hero">
          <div>
            <p className="kio-kicker">{caja ? 'Mostrador' : 'Para llevar'}</p>
            <h1>Kiosco cafetín</h1>
          </div>
          {caja && resumen && (
            <div className="kio-stats">
              <div><span>Hoy</span><strong>S/ {resumen.ventas_dia.toFixed(2)}</strong></div>
              <div><span>Mes</span><strong>S/ {resumen.ventas_mes.toFixed(2)}</strong></div>
              <div><span>Fiado</span><strong>S/ {resumen.fiado.toFixed(2)}</strong></div>
            </div>
          )}
        </header>

        {error && <p className="kio-alert">{error}</p>}
        {aviso && <p className="kio-ok">{aviso}</p>}

        {caja ? (
          <div className="kio-acciones">
            <button type="button" className={`kio-accion kio-accion-venta${panel === 'vender' ? ' is-on' : ''}`} onClick={() => { setPanel('vender'); cargarPedidos(); }}>
              <span>Vender</span><small>Ventas del mostrador</small>
            </button>
            <button type="button" className={`kio-accion${panel === 'pedidos' ? ' is-on' : ''}`} onClick={() => { setPanel('pedidos'); cargarPedidos(); }}>
              <span>Pedidos</span><small>{esperando} esperando</small>
            </button>
            <button type="button" className={`kio-accion${panel === 'productos' ? ' is-on' : ''}`} onClick={() => { setPanel('productos'); cargarCatalogo(); }}>
              <span>Productos</span><small>Grilla, stock y precios</small>
            </button>
            <button type="button" className={`kio-accion${panel === 'categorias' ? ' is-on' : ''}`} onClick={() => { setPanel('categorias'); cargarCatalogo(); }}>
              <span>Categorías</span><small>Fotos y nombres</small>
            </button>
            <button type="button" className={`kio-accion${panel === 'carta' ? ' is-on' : ''}`} onClick={() => { setPanel('carta'); cargarCatalogo(); cargarCartaDias(); }}>
              <span>Carta del día</span><small>Lo novedoso de cada fecha</small>
            </button>
            <button type="button" className={`kio-accion${panel === 'caja' ? ' is-on' : ''}`} onClick={() => { setPanel('caja'); cargarPedidos(); }}>
              <span>Caja</span><small>Cobros y fiados</small>
            </button>
            <button type="button" className={`kio-accion${panel === 'ajustes' ? ' is-on' : ''}`} onClick={() => setPanel('ajustes')}>
              <span>Ajustes</span><small>Quién pide, corte y límite</small>
            </button>
          </div>
        ) : (
          <div className="kio-acciones">
            <button type="button" className={`kio-accion kio-accion-venta${panel === 'pedir' ? ' is-on' : ''}`} onClick={() => setPanel(panel === 'pedir' ? null : 'pedir')}>
              <span>Pedir</span><small>Categoría, foto y cantidad</small>
            </button>
            <button type="button" className={`kio-accion${panel === 'mios' ? ' is-on' : ''}`} onClick={() => { setPanel('mios'); cargarMios(); }}>
              <span>Mis pedidos</span><small>Historial y lo que debes</small>
            </button>
          </div>
        )}

        {!caja && panel === 'pedir' && (
          <section className="kio-panel">
            <div className="kio-dias">
              {dias.map((d) => (
                <button key={d} type="button" className={fecha === d ? 'is-on' : ''} onClick={() => setFecha(d)}>{etiquetaDia(d, hoy)}</button>
              ))}
            </div>
            {cartaBloque}
          </section>
        )}

        {caja && panel === 'vender' && (
          <section className="kio-panel">
            <div className="kio-panel-head">
              <h2>Ventas</h2>
              <button type="button" className="kio-btn" onClick={() => setVentana('vender')}>Agregar venta</button>
            </div>
            <div className="kio-grilla">
              {pedidos.filter((p) => p.origen === 'mostrador').map((p) => (
                <article key={p.id} className="kio-card">
                  <strong>{p.alumno}</strong>
                  <span>{p.grado} · #{p.codigo} · {p.pago}</span>
                  <b>S/ {Number(p.total).toFixed(2)}</b>
                </article>
              ))}
              {!pedidos.some((p) => p.origen === 'mostrador') && <p className="kio-vacio">Todavía no hay ventas de mostrador.</p>}
            </div>
          </section>
        )}

        {caja && panel === 'pedidos' && (
          <section className="kio-panel">
            <div className="kio-panel-head"><h2>Pedidos</h2></div>
            <div className="kio-grilla">
              {pedidos.map((p) => (
                <article key={p.id} className="kio-card">
                  <strong>{p.alumno}</strong>
                  <span>{p.grado} · #{p.codigo} · {p.estado} · {p.pago}</span>
                  <ul>{(p.items || []).map((it, i) => <li key={i}>{it.cantidad} × {it.nombre}</li>)}</ul>
                  <b>S/ {Number(p.total).toFixed(2)}</b>
                  <p className="kio-deuda">Debe S/ {Number(p.deuda).toFixed(2)}</p>
                  {p.estado === 'pedido' && (
                    <div className="kio-btn-row kio-decide">
                      <button type="button" className="kio-btn" onClick={() => decidir(p.id, 'aceptado', 'pagado')}>Pagado</button>
                      {config?.fiado_activo && <button type="button" className="kio-btn kio-btn-ghost" onClick={() => decidir(p.id, 'aceptado', 'fiado')}>Fiado</button>}
                      <button type="button" className="kio-btn kio-btn-no" onClick={() => decidir(p.id, 'rechazado')}>Rechazar</button>
                    </div>
                  )}
                  {p.estado === 'aceptado' && (
                    <button type="button" className="kio-icono" title="Entregado" aria-label="Entregado" onClick={() => decidir(p.id, 'entregado', p.pago)}><Icono tipo="box" /></button>
                  )}
                </article>
              ))}
              {!pedidos.length && <p className="kio-vacio">No hay pedidos.</p>}
            </div>
          </section>
        )}

        {caja && panel === 'productos' && (
          <section className="kio-panel">
            <div className="kio-panel-head">
              <h2>Productos</h2>
              <button type="button" className="kio-btn" onClick={() => {
                setEditProdId(null);
                setFormProd({ nombre: '', precio: '', detalle: '', emoji: '🥤', categoria_id: '', siempre: true, es_comida: false, stock: '', imagen: null });
                setVentana('form-prod');
              }}>Agregar producto</button>
            </div>
            <div className="kio-platos">
              {catalogo.productos.map((p) => (
                <article key={p.id} className={`kio-plato kio-plato-fijo${Number(p.stock) <= 0 ? ' is-agotado' : ''}`}>
                  <div className="kio-plato-foto"><Foto src={p.imagen_url} emoji={p.emoji} /></div>
                  <strong>{p.nombre}</strong>
                  {p.descripcion ? <small className="kio-detalle">{p.descripcion}</small> : null}
                  <em>S/ {Number(p.precio).toFixed(2)}</em>
                  <small className="kio-stock">{Number(p.stock) <= 0 ? 'Agotado' : `Quedan ${p.stock}`}</small>
                  <div className="kio-btn-row">
                    <button type="button" className="kio-icono" title="Aumentar stock" aria-label="Aumentar stock" onClick={() => { setStockDe(p); setStockCant(''); }}><Icono tipo="plus" /></button>
                    <button type="button" className="kio-icono kio-icono-oscuro" onClick={() => {
                      setEditProdId(p.id);
                      setFormProd({
                        nombre: p.nombre,
                        precio: String(p.precio),
                        detalle: p.descripcion || '',
                        emoji: p.emoji || '🥤',
                        categoria_id: p.categoria_id ? String(p.categoria_id) : '',
                        siempre: Number(p.siempre) === 1,
                        es_comida: Number(p.es_comida) === 1,
                        stock: String(p.stock ?? ''),
                        imagen: null,
                      });
                      setVentana('form-prod');
                    }} title="Editar" aria-label="Editar"><Icono tipo="edit" /></button>
                    <button type="button" className="kio-icono kio-icono-rojo" onClick={() => {
                      if (!window.confirm(`¿Quitar ${p.nombre}?`)) return;
                      api.delete(`/kiosco/productos/${p.id}`).then(() => {
                        setAviso('Producto eliminado.');
                        cargarCatalogo();
                        cargarCarta(fecha);
                      });
                    }} title="Eliminar" aria-label="Eliminar"><Icono tipo="trash" /></button>
                  </div>
                </article>
              ))}
              {!catalogo.productos.length && <p className="kio-vacio">Aún no hay productos. Usa Agregar producto.</p>}
            </div>
          </section>
        )}

        {caja && panel === 'categorias' && (
          <section className="kio-panel">
            <div className="kio-panel-head">
              <h2>Categorías</h2>
              <button type="button" className="kio-btn" onClick={() => {
                setEditCatId(null);
                setFormCat({ nombre: '', emoji: '🍽️', imagen: null });
                setVentana('form-cat');
              }}>Agregar categoría</button>
            </div>
            <div className="kio-platos">
              {catalogo.categorias.map((c) => (
                <article key={c.id} className="kio-plato kio-plato-fijo">
                  <div className="kio-plato-foto"><Foto src={c.imagen_url} emoji={c.emoji} /></div>
                  <strong>{c.nombre}</strong>
                  <div className="kio-btn-row">
                    <button type="button" className="kio-icono kio-icono-oscuro" onClick={() => {
                      setEditCatId(c.id);
                      setFormCat({ nombre: c.nombre, emoji: c.emoji || '🍽️', imagen: null });
                      setVentana('form-cat');
                    }} title="Editar" aria-label="Editar"><Icono tipo="edit" /></button>
                    <button type="button" className="kio-icono kio-icono-rojo" onClick={() => {
                      if (!window.confirm(`¿Quitar la categoría ${c.nombre}?`)) return;
                      api.delete(`/kiosco/categorias/${c.id}`).then(() => {
                        setAviso('Categoría eliminada.');
                        cargarCatalogo();
                      });
                    }} title="Eliminar" aria-label="Eliminar"><Icono tipo="trash" /></button>
                  </div>
                </article>
              ))}
              {!catalogo.categorias.length && <p className="kio-vacio">Aún no hay categorías.</p>}
            </div>
          </section>
        )}

        {caja && panel === 'carta' && (
          <section className="kio-panel">
            <div className="kio-panel-head">
              <h2>Carta del día</h2>
            </div>
            <article className="kio-portada">
              <div className="kio-plato-foto kio-portada-foto"><Foto src={config?.carta_imagen_url} emoji="🍽️" /></div>
              <div>
                <strong>Foto que ven al pedir</strong>
                <p>Cuadrada. Es la imagen de la ficha Carta del día.</p>
                <label className="kio-file">Cambiar foto
                  <input type="file" accept="image/*" onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    try {
                      const fd = new FormData();
                      fd.append('imagen', file);
                      const { data } = await api.post('/kiosco/carta-portada', fd);
                      setConfig(data.config);
                      setAviso('Foto de la carta del día guardada.');
                    } catch (err) {
                      setError(err.response?.data?.error || 'No se pudo guardar la foto.');
                    }
                  }} />
                </label>
              </div>
            </article>
            <p className="kio-vacio">Lo de siempre ya sale todos los días. Aquí publicas lo especial y lo vuelves a activar otro día, sin crearlo de nuevo.</p>
            <h3>Publicado</h3>
            <div className="kio-grilla">
              {cartaDias.map((f) => (
                <article key={f.id} className="kio-card">
                  <div className="kio-plato-foto kio-mini"><Foto src={f.imagen_url} emoji={f.emoji} /></div>
                  <strong>{f.nombre}</strong>
                  <span>{String(f.fecha).slice(0, 10)}</span>
                  <button type="button" className="kio-icono kio-icono-rojo" onClick={() => {
                    api.delete(`/kiosco/carta/${f.id}`).then(() => { setAviso('Quitado de ese día. El producto sigue en el historial.'); cargarCartaDias(); cargarCarta(fecha); });
                  }} title="Quitar de ese día" aria-label="Quitar de ese día"><Icono tipo="trash" /></button>
                </article>
              ))}
              {!cartaDias.length && <p className="kio-vacio">No hay especiales publicados desde hoy.</p>}
            </div>
            <h3>Activar de nuevo</h3>
            <input className="kio-busca" value={buscaEsp} onChange={(e) => setBuscaEsp(e.target.value)} placeholder="Busca el producto, por ejemplo papa rellena" />
            <div className="kio-grilla">
              {especiales.filter((p) => p.nombre.toLowerCase().includes(buscaEsp.trim().toLowerCase())).map((p) => (
                <article key={p.id} className="kio-card">
                  <div className="kio-plato-foto kio-mini"><Foto src={p.imagen_url} emoji={p.emoji} /></div>
                  <strong>{p.nombre}</strong>
                  <span>{p.ultima ? `Última vez ${String(p.ultima).slice(0, 10)}` : 'Aún no se publicó'}</span>
                  <input type="date" value={activarFecha[p.id] || fecha} onChange={(e) => setActivarFecha((s) => ({ ...s, [p.id]: e.target.value }))} />
                  <button type="button" className="kio-btn" onClick={() => {
                    const dia = activarFecha[p.id] || fecha;
                    api.post('/kiosco/carta', { producto_id: p.id, fecha: dia }).then(() => {
                      setAviso(`${p.nombre} quedó en la carta del ${dia}.`);
                      cargarCartaDias();
                      cargarCarta(fecha);
                    }).catch((err) => setError(err.response?.data?.error || 'No se pudo activar.'));
                  }}>Activar</button>
                </article>
              ))}
              {!especiales.length && <p className="kio-vacio">No hay productos especiales. Créalos en Productos con “De siempre” apagado.</p>}
            </div>
          </section>
        )}

        {!caja && panel === 'mios' && (
          <section className="kio-panel">
            <div className="kio-panel-head">
              <h2>Mis pedidos</h2>
              <strong>Debes S/ {deudaMia.toFixed(2)}</strong>
            </div>
            <div className="kio-grilla">
              {misPedidos.map((p) => (
                <article key={p.id} className="kio-card">
                  <strong>#{p.codigo}</strong>
                  <span>{String(p.fecha_consumo).slice(0, 10)} · {p.estado} · {p.pago}</span>
                  {p.alumno ? <span>{p.alumno}</span> : null}
                  <ul>{(p.items || []).map((it, i) => <li key={i}>{it.cantidad} × {it.nombre}</li>)}</ul>
                  <b>S/ {Number(p.total).toFixed(2)}</b>
                </article>
              ))}
              {!misPedidos.length && <p className="kio-vacio">Todavía no tienes pedidos.</p>}
            </div>
          </section>
        )}

        {caja && panel === 'caja' && (
          <section className="kio-panel">
            <div className="kio-panel-head"><h2>Caja</h2></div>
            <div className="kio-grilla">
              {pedidos.filter((p) => p.estado === 'aceptado' || p.estado === 'entregado').map((p) => (
                <article key={p.id} className="kio-card">
                  <strong>{p.alumno}</strong>
                  <span>{p.grado} · {p.pago}</span>
                  <b>S/ {Number(p.total).toFixed(2)}</b>
                  {p.pago !== 'pagado' && (
                    <button type="button" className="kio-btn" onClick={() => decidir(p.id, p.estado, 'pagado')}>Marcar pagado</button>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}

        {caja && panel === 'ajustes' && config && (
          <section className="kio-panel">
            <div className="kio-panel-head"><h2>Ajustes</h2></div>
            <div className="kio-ajustes">
              <article className="kio-ajuste">
                <div><strong>Familia</strong><p>Quién puede pedir en línea.</p></div>
                <select className="kio-ajuste-select" value={config.quien_pide} onChange={(e) => setConfig({ ...config, quien_pide: e.target.value })}>
                  <option value="AMBOS">Papá y alumno</option>
                  <option value="APODERADO">Solo el papá</option>
                  <option value="ALUMNO">Solo el alumno</option>
                </select>
              </article>
              <article className="kio-ajuste">
                <div><strong>Personal</strong><p>Docentes y administrativos.</p></div>
                <label className="kio-switch">
                  <input type="checkbox" checked={config.pide_personal !== false} onChange={(e) => setConfig({ ...config, pide_personal: e.target.checked })} />
                  <i />
                  <span>{config.pide_personal !== false ? 'Pueden pedir' : 'No pueden'}</span>
                </label>
              </article>
              <article className="kio-ajuste">
                <div><strong>Límite</strong><p>Tope por pedido. Apagado, se pide sin tope.</p></div>
                <label className="kio-switch">
                  <input type="checkbox" checked={config.limite_activo} onChange={(e) => setConfig({ ...config, limite_activo: e.target.checked })} />
                  <i />
                  <span>{config.limite_activo ? 'Con límite' : 'Sin límite'}</span>
                </label>
                {config.limite_activo && <input type="number" min="0" step="0.5" value={config.limite_monto} onChange={(e) => setConfig({ ...config, limite_monto: e.target.value })} placeholder="Monto máximo" />}
              </article>
              <article className="kio-ajuste">
                <div><strong>Corte</strong><p>Hora límite para pedir. Apagado, se pide hasta el final.</p></div>
                <label className="kio-switch">
                  <input type="checkbox" checked={config.corte_activo} onChange={(e) => setConfig({ ...config, corte_activo: e.target.checked })} />
                  <i />
                  <span>{config.corte_activo ? 'Con corte' : 'Sin corte'}</span>
                </label>
                {config.corte_activo && <input type="time" value={config.corte_hora || '20:00'} onChange={(e) => setConfig({ ...config, corte_hora: e.target.value })} />}
              </article>
              <article className="kio-ajuste">
                <div><strong>Comida</strong><p>Platos marcados como comida en la carta.</p></div>
                <label className="kio-switch">
                  <input type="checkbox" checked={config.comida_activa} onChange={(e) => setConfig({ ...config, comida_activa: e.target.checked })} />
                  <i />
                  <span>{config.comida_activa ? 'Visible' : 'Oculta'}</span>
                </label>
              </article>
              <article className="kio-ajuste">
                <div><strong>Fiado</strong><p>Si se puede dejar el pago para después.</p></div>
                <label className="kio-switch">
                  <input type="checkbox" checked={config.fiado_activo} onChange={(e) => setConfig({ ...config, fiado_activo: e.target.checked })} />
                  <i />
                  <span>{config.fiado_activo ? 'Permitido' : 'No permitido'}</span>
                </label>
              </article>
            </div>
            <button type="button" className="kio-btn kio-ajuste-guardar" onClick={() => guardarAjustes(config)}>Guardar</button>
          </section>
        )}

        {!caja && (panel === 'pedir' || carrito.length > 0) && (
          <section className="kio-panel kio-boleta">
            <div className="kio-panel-head">
              <h2>Tu pedido</h2>
              <strong>S/ {total.toFixed(2)}</strong>
            </div>
            <div className="kio-dias">
              {dias.map((d) => (
                <button key={d} type="button" className={fecha === d ? 'is-on' : ''} onClick={() => setFecha(d)}>{etiquetaDia(d, hoy)}</button>
              ))}
            </div>
            {hijos.length > 0 && (
              <label className="kio-campo">Para
                <select value={alumnoId} onChange={(e) => setAlumnoId(e.target.value)}>
                  {hijos.map((h) => <option key={h.id} value={h.id}>{h.nombre}{h.grado ? ` · ${h.grado}` : ''}</option>)}
                </select>
              </label>
            )}
            {yo && <p>Para {yo.nombre}. Debe S/ {Number(yo.deuda).toFixed(2)}</p>}
            {hijoSel && <p className="kio-deuda">Debe S/ {Number(hijoSel.deuda).toFixed(2)}</p>}
            {!carrito.length && <p className="kio-vacio">Todavía no elegiste productos. Toca uno arriba y se suma aquí.</p>}
            <div className="kio-tabs-pedido">
              {carrito.map((it) => (
                <article key={it.producto_id} className="kio-tab-item">
                  <div className="kio-tab-foto"><Foto src={it.imagen_url} emoji={it.emoji} /></div>
                  <div>
                    <strong>{it.nombre}</strong>
                    <span>{it.cantidad} × S/ {Number(it.precio).toFixed(2)}</span>
                    <b>S/ {(it.precio * it.cantidad).toFixed(2)}</b>
                    <div className="kio-btn-row">
                      <button type="button" className="kio-icono kio-icono-oscuro" title="Editar" aria-label="Editar" onClick={() => editarLinea(it)}><Icono tipo="edit" /></button>
                      <button type="button" className="kio-icono kio-icono-rojo" title="Eliminar" aria-label="Eliminar" onClick={() => setCarrito((prev) => prev.filter((x) => x.producto_id !== it.producto_id))}><Icono tipo="trash" /></button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            {error && <p className="kio-alert">{error}</p>}
            <p className="kio-vacio">El kiosco recibe el pedido y elige si queda pagado o fiado.</p>
            <button type="button" className="kio-btn" disabled={enviando || !carrito.length || (!alumnoId && !yo)} onClick={() => pedir('linea', 'pendiente')}>
              {enviando ? 'Enviando…' : `Confirmar pedido · S/ ${total.toFixed(2)}`}
            </button>
          </section>
        )}

        {(caja || carrito.length > 0) && (
        <button type="button" className="kio-flotante" onClick={() => setVentana(caja ? 'carrito' : 'pedido')}>
          Carrito <b>{piezas}</b>
          <span>S/ {total.toFixed(2)}</span>
        </button>
        )}

        {pieza && (
          <Modal titulo={pieza.nombre} onClose={() => setPieza(null)} encima>
            <div className="kio-pieza">
              <div className="kio-pieza-foto"><Foto src={pieza.imagen_url} emoji={pieza.emoji} /></div>
              <p className="kio-precio-lg">S/ {Number(pieza.precio).toFixed(2)}</p>
              <p className="kio-stock">{topePieza > 0 ? `Quedan ${topePieza}` : 'Agotado'}</p>
              {pieza.descripcion ? <p className="kio-detalle">{pieza.descripcion}</p> : null}
              <div className="kio-stepper">
                <button type="button" onClick={() => setCant((n) => Math.max(1, n - 1))}>−</button>
                <strong>{cant}</strong>
                <button type="button" onClick={() => setCant((n) => Math.min(topePieza || 1, n + 1))}>+</button>
              </div>
              <button type="button" className="kio-btn" disabled={!topePieza} onClick={confirmarPieza}>{reemplazar ? 'Guardar cantidad' : `Agregar S/ ${(Number(pieza.precio) * cant).toFixed(2)}`}</button>
            </div>
          </Modal>
        )}

        {ventana === 'pedido' && !caja && (
          <Modal titulo="Tu pedido" onClose={() => setVentana(null)} ancho="kio-modal-ancho">
            {!carrito.length && <p className="kio-vacio">Todavía no elegiste productos.</p>}
            <div className="kio-tabs-pedido">
              {carrito.map((it) => (
                <article key={it.producto_id} className="kio-tab-item">
                  <div className="kio-tab-foto"><Foto src={it.imagen_url} emoji={it.emoji} /></div>
                  <div>
                    <strong>{it.nombre}</strong>
                    <span>{it.cantidad} × S/ {Number(it.precio).toFixed(2)}</span>
                    <b>S/ {(it.precio * it.cantidad).toFixed(2)}</b>
                    <div className="kio-btn-row">
                      <button type="button" className="kio-icono kio-icono-oscuro" title="Editar" aria-label="Editar" onClick={() => editarLinea(it)}><Icono tipo="edit" /></button>
                      <button type="button" className="kio-icono kio-icono-rojo" title="Eliminar" aria-label="Eliminar" onClick={() => setCarrito((prev) => prev.filter((x) => x.producto_id !== it.producto_id))}><Icono tipo="trash" /></button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <p className="kio-total">Total S/ {total.toFixed(2)}</p>
            <p className="kio-vacio">El kiosco recibe el pedido y elige si queda pagado o fiado.</p>
            {error && <p className="kio-alert">{error}</p>}
            <button type="button" className="kio-btn" disabled={enviando || !carrito.length || (!alumnoId && !yo)} onClick={() => pedir('linea', 'pendiente')}>
              {enviando ? 'Enviando…' : 'Confirmar pedido'}
            </button>
          </Modal>
        )}

        {ventana === 'carrito' && caja && (
          <Modal titulo="Venta en curso" onClose={() => setVentana(null)} ancho="kio-modal-ancho">
            {!carrito.length && <p className="kio-vacio">Todavía no elegiste productos.</p>}
            <div className="kio-tabs-pedido">
              {carrito.map((it) => (
                <article key={it.producto_id} className="kio-tab-item">
                  <div className="kio-tab-foto"><Foto src={it.imagen_url} emoji={it.emoji} /></div>
                  <div>
                    <strong>{it.nombre}</strong>
                    <span>{it.cantidad} × S/ {Number(it.precio).toFixed(2)}</span>
                    <b>S/ {(it.precio * it.cantidad).toFixed(2)}</b>
                    <div className="kio-btn-row">
                      <button type="button" className="kio-icono kio-icono-oscuro" title="Editar" aria-label="Editar" onClick={() => editarLinea(it)}><Icono tipo="edit" /></button>
                      <button type="button" className="kio-icono kio-icono-rojo" title="Eliminar" aria-label="Eliminar" onClick={() => setCarrito((prev) => prev.filter((x) => x.producto_id !== it.producto_id))}><Icono tipo="trash" /></button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <p className="kio-total">Total S/ {total.toFixed(2)}</p>
          </Modal>
        )}

        {ventana === 'vender' && (
          <Modal titulo="Agregar venta" onClose={() => setVentana(null)} ancho="kio-modal-ancho">
            <label className="kio-campo">DNI o nombre
              <input value={busca} onChange={(e) => buscarCliente(e.target.value)} placeholder="Escribe para buscar" />
            </label>
            {clientes.length > 0 && (
              <div className="kio-clientes">
                {clientes.map((c) => (
                  <button key={`${c.clase}-${c.alumno_id || c.usuario_id}`} type="button" onClick={() => elegirCliente(c)}>
                    <strong>{c.nombre}</strong>
                    <span>{c.clase}</span>
                  </button>
                ))}
              </div>
            )}
            {clienteSel && <p className="kio-ok">Cliente: {clienteSel.nombre}</p>}
            {cartaBloque}
            <div className="kio-tabs-pedido">
              {carrito.map((it) => (
                <article key={it.producto_id} className="kio-tab-item">
                  <div className="kio-tab-foto"><Foto src={it.imagen_url} emoji={it.emoji} /></div>
                  <div>
                    <strong>{it.nombre}</strong>
                    <span>{it.cantidad} × S/ {Number(it.precio).toFixed(2)}</span>
                    <b>S/ {(it.precio * it.cantidad).toFixed(2)}</b>
                    <div className="kio-btn-row">
                      <button type="button" className="kio-icono kio-icono-oscuro" title="Editar" aria-label="Editar" onClick={() => editarLinea(it)}><Icono tipo="edit" /></button>
                      <button type="button" className="kio-icono kio-icono-rojo" title="Eliminar" aria-label="Eliminar" onClick={() => setCarrito((prev) => prev.filter((x) => x.producto_id !== it.producto_id))}><Icono tipo="trash" /></button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <div className="kio-cobro">
              <span>{piezas} productos · S/ {total.toFixed(2)}</span>
              <button type="button" className="kio-btn" disabled={enviando || !carrito.length || (!alumnoId && !clienteUsuarioId)} onClick={() => pedir('mostrador', 'pagado')}>Cobrar</button>
              {config?.fiado_activo && (
                <button type="button" className="kio-btn kio-btn-ghost" disabled={enviando || !carrito.length || (!alumnoId && !clienteUsuarioId)} onClick={() => pedir('mostrador', 'fiado')}>Fiar</button>
              )}
            </div>
          </Modal>
        )}

        {ventana === 'form-cat' && (
          <Modal titulo={editCatId ? 'Editar categoría' : 'Agregar categoría'} onClose={() => setVentana(null)} encima>
            <form onSubmit={async (e) => {
              e.preventDefault();
              setError('');
              try {
                const fd = new FormData();
                fd.append('nombre', formCat.nombre);
                fd.append('emoji', formCat.emoji);
                if (formCat.imagen) fd.append('imagen', formCat.imagen);
                if (editCatId) await api.put(`/kiosco/categorias/${editCatId}`, fd);
                else await api.post('/kiosco/categorias', fd);
                setFormCat({ nombre: '', emoji: '🍽️', imagen: null });
                setEditCatId(null);
                setVentana(null);
                setAviso(editCatId ? 'Categoría actualizada.' : 'Categoría creada.');
                cargarCatalogo();
              } catch (err) {
                setError(err.response?.data?.error || 'No se pudo guardar la categoría.');
              }
            }}>
              <input className="kio-input-nombre" value={formCat.nombre} onChange={(e) => setFormCat({ ...formCat, nombre: e.target.value })} placeholder="Nombre" required />
              <button type="button" className="kio-emoji-btn" onClick={() => setEmojiPara('cat')}><span>{formCat.emoji || '🍽️'}</span> Icono</button>
              <label className="kio-file">Foto
                <input type="file" accept="image/*" onChange={(e) => setFormCat({ ...formCat, imagen: e.target.files?.[0] || null })} />
              </label>
              <button className="kio-btn" type="submit">{editCatId ? 'Guardar' : 'Crear'}</button>
            </form>
          </Modal>
        )}

        {ventana === 'form-prod' && (
          <Modal titulo={editProdId ? 'Editar producto' : 'Agregar producto'} onClose={() => setVentana(null)} encima>
            <form onSubmit={async (e) => {
              e.preventDefault();
              setError('');
              try {
                const fd = new FormData();
                fd.append('nombre', formProd.nombre);
                fd.append('precio', String(formProd.precio || '0'));
                fd.append('descripcion', formProd.detalle || '');
                fd.append('emoji', formProd.emoji);
                fd.append('categoria_id', formProd.categoria_id || '');
                fd.append('stock', String(formProd.stock || '0'));
                fd.append('siempre', formProd.siempre ? 'true' : 'false');
                fd.append('es_comida', formProd.es_comida ? 'true' : 'false');
                if (formProd.imagen) fd.append('imagen', formProd.imagen);
                if (editProdId) await api.put(`/kiosco/productos/${editProdId}`, fd);
                else await api.post('/kiosco/productos', fd);
                setFormProd({ nombre: '', precio: '', detalle: '', emoji: '🥤', categoria_id: '', siempre: true, es_comida: false, stock: '', imagen: null });
                setEditProdId(null);
                setVentana(null);
                setAviso(editProdId ? 'Producto actualizado.' : 'Producto guardado.');
                cargarCatalogo();
                cargarCarta(fecha);
              } catch (err) {
                setError(err.response?.data?.error || 'No se pudo guardar el producto.');
              }
            }}>
              <input className="kio-input-nombre" value={formProd.nombre} onChange={(e) => setFormProd({ ...formProd, nombre: e.target.value })} placeholder="Nombre" required />
              <textarea value={formProd.detalle} onChange={(e) => setFormProd({ ...formProd, detalle: e.target.value })} placeholder="Detalle: entrada, segundo, postre…" rows={2} maxLength={255} />
              <input value={formProd.precio} onChange={(e) => setFormProd({ ...formProd, precio: e.target.value })} placeholder="Precio" required />
              <button type="button" className="kio-emoji-btn" onClick={() => setEmojiPara('prod')}><span>{formProd.emoji || '🍽️'}</span> Icono</button>
              <label className="kio-file">Foto
                <input type="file" accept="image/*" onChange={(e) => setFormProd({ ...formProd, imagen: e.target.files?.[0] || null })} />
              </label>
              <select value={formProd.categoria_id} onChange={(e) => setFormProd({ ...formProd, categoria_id: e.target.value })}>
                <option value="">Sin categoría</option>
                {catalogo.categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
              <input value={formProd.stock} onChange={(e) => setFormProd({ ...formProd, stock: e.target.value })} placeholder="Stock" />
              <div className="kio-checks">
                <label className="kio-check"><input type="checkbox" checked={formProd.siempre} onChange={(e) => setFormProd({ ...formProd, siempre: e.target.checked })} /> De siempre</label>
                <label className="kio-check"><input type="checkbox" checked={formProd.es_comida} onChange={(e) => setFormProd({ ...formProd, es_comida: e.target.checked })} /> Es comida</label>
              </div>
              <button className="kio-btn" type="submit">{editProdId ? 'Guardar' : 'Publicar'}</button>
            </form>
          </Modal>
        )}

        {emojiPara && (
          <Modal titulo="Elegir icono" onClose={() => setEmojiPara(null)} encima>
            <div className="kio-emoji-grid">
              {EMOJIS.map((e) => (
                <button key={e} type="button" className={(emojiPara === 'prod' ? formProd.emoji : formCat.emoji) === e ? 'is-on' : ''} onClick={() => {
                  if (emojiPara === 'prod') setFormProd((f) => ({ ...f, emoji: e }));
                  else setFormCat((f) => ({ ...f, emoji: e }));
                  setEmojiPara(null);
                }}>{e}</button>
              ))}
            </div>
          </Modal>
        )}

        {stockDe && (
          <Modal titulo="Aumentar stock" onClose={() => setStockDe(null)} encima>
            <p>{stockDe.nombre}. Ahora hay {stockDe.stock}.</p>
            <input type="number" min="1" value={stockCant} onChange={(e) => setStockCant(e.target.value)} placeholder="Cantidad a sumar" />
            <button type="button" className="kio-btn" onClick={() => {
              const n = parseInt(stockCant, 10);
              if (!n) return;
              api.post('/kiosco/stock', { producto_id: stockDe.id, cantidad: n }).then(() => {
                setAviso(`Sumaste ${n} a ${stockDe.nombre}.`);
                setStockDe(null);
                cargarCatalogo();
              });
            }}>Guardar</button>
          </Modal>
        )}

      </div>
    </DashboardLayout>
  );
}
