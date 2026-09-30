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

function inicioSemana(iso) {
  const d = new Date(`${iso}T12:00:00`);
  const diff = d.getDay() === 0 ? 6 : d.getDay() - 1;
  return sumarDias(iso, -diff);
}

function finSemana(iso) {
  return sumarDias(inicioSemana(iso), 6);
}

function inicioMes(iso) {
  return `${iso.slice(0, 8)}01`;
}

function finMes(iso) {
  const [y, m] = iso.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${iso.slice(0, 8)}${String(last).padStart(2, '0')}`;
}

function fechaCorta(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

function etiquetaPedido(p) {
  if (p.estado === 'pedido') return 'Por atender';
  if (p.estado === 'rechazado') return 'Rechazado';
  if (p.pago === 'fiado') return 'Fiado';
  if (p.pago === 'pagado') return 'Pagado';
  if (p.pago === 'pendiente') return 'Pendiente de cobro';
  return p.estado || '';
}

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
  const [panel, setPanel] = useState(caja ? null : 'pedir');
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
  const [cola, setCola] = useState([]);
  const [atendiendo, setAtendiendo] = useState(null);
  const [catalogo, setCatalogo] = useState({ categorias: [], productos: [] });
  const [resumen, setResumen] = useState(null);
  const [reporte, setReporte] = useState(null);
  const [repDesde, setRepDesde] = useState('');
  const [repHasta, setRepHasta] = useState('');
  const [repFiltro, setRepFiltro] = useState('todos');
  const [repCargando, setRepCargando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [cupo, setCupo] = useState(null);
  const [cupoForm, setCupoForm] = useState(null);
  const [guardandoCupo, setGuardandoCupo] = useState(false);
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
        const base = await cargarBase();
        if (!vivo) return;
        if (!caja) {
          const { data } = await api.get('/kiosco/hijos');
          if (!vivo) return;
          const lista = data.hijos || [];
          const persona = data.yo || null;
          const puedeYo = !!persona && base?.config?.pide_personal !== false;
          const puedeHijo = user?.tipo === 'APODERADO' || user?.tipo === 'ALUMNO' || base?.config?.quien_pide !== 'ALUMNO';
          setHijos(puedeHijo ? lista : []);
          setYo(persona);
          if (puedeYo && puedeHijo && lista.length) setAlumnoId('yo');
          else if (puedeHijo && lista[0]) setAlumnoId(String(lista[0].id));
          else if (puedeYo) setAlumnoId('yo');
        } else {
          const [r, p, c] = await Promise.all([
            api.get('/kiosco/resumen').catch(() => ({ data: null })),
            api.get('/kiosco/pedidos', { params: { estado: 'todos' } }).catch(() => ({ data: { pedidos: [] } })),
            api.get('/kiosco/pedidos', { params: { estado: 'pedido' } }).catch(() => ({ data: { pedidos: [] } })),
          ]);
          if (!vivo) return;
          if (r.data) setResumen(r.data);
          setPedidos(p.data?.pedidos || []);
          setCola(c.data?.pedidos || []);
        }
      } catch (e) {
        if (vivo) setError(e.response?.data?.error || 'No se pudo abrir el kiosco.');
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, [caja, cargarBase, user?.tipo]);

  useEffect(() => {
    if (fecha) cargarCarta(fecha).catch(() => {});
  }, [fecha, cargarCarta]);

  const cargarPedidos = useCallback(async () => {
    const { data } = await api.get('/kiosco/pedidos', { params: { estado: 'todos' } });
    setPedidos(data.pedidos || []);
    const r = await api.get('/kiosco/resumen');
    setResumen(r.data);
  }, []);

  const cargarReporte = useCallback(async (desde, hasta) => {
    const d = desde || hoy;
    const h = hasta || desde || hoy;
    if (!d || !h) return;
    setRepDesde(d);
    setRepHasta(h);
    setRepCargando(true);
    setError('');
    try {
      const { data } = await api.get('/kiosco/reporte', { params: { desde: d, hasta: h } });
      setReporte(data);
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo cargar el reporte.');
    } finally {
      setRepCargando(false);
    }
  }, [hoy]);

  const cargarCola = useCallback(async () => {
    const { data } = await api.get('/kiosco/pedidos', { params: { estado: 'pedido' } });
    setCola(data.pedidos || []);
  }, []);

  useEffect(() => {
    if (!caja || panel !== 'pedidos') return undefined;
    const timer = setInterval(() => {
      cargarCola().catch(() => {});
    }, 8000);
    return () => clearInterval(timer);
  }, [caja, panel, cargarCola]);

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
  const muestraYo = !!yo && config?.pide_personal !== false;
  const hijosPedido = (user?.tipo === 'APODERADO' || user?.tipo === 'ALUMNO' || config?.quien_pide !== 'ALUMNO') ? hijos : [];
  const deudaHijosJuntos = hijosPedido.reduce((s, h) => s + (Number(h.deuda) || 0), 0);
  const alumnoPedido = alumnoId && alumnoId !== 'yo' ? alumnoId : '';
  const eligeDestino = (valor) => {
    setAlumnoId(valor);
    setCarrito([]);
  };
  const dias = hoy ? [0, 1, 2, 3, 4, 5, 6].map((n) => sumarDias(hoy, n)) : [];
  const esperando = cola.length;
  const pedidosReporte = useMemo(() => {
    const lista = reporte?.pedidos || [];
    if (repFiltro === 'vendido') return lista.filter((p) => p.estado === 'aceptado' || p.estado === 'entregado');
    if (repFiltro === 'pagado') return lista.filter((p) => (p.estado === 'aceptado' || p.estado === 'entregado') && p.pago === 'pagado');
    if (repFiltro === 'fiado') return lista.filter((p) => (p.estado === 'aceptado' || p.estado === 'entregado') && p.pago === 'fiado');
    if (repFiltro === 'pendiente') return lista.filter((p) => (p.estado === 'aceptado' || p.estado === 'entregado') && p.pago === 'pendiente');
    if (repFiltro === 'rechazado') return lista.filter((p) => p.estado === 'rechazado');
    if (repFiltro === 'espera') return lista.filter((p) => p.estado === 'pedido');
    return lista;
  }, [reporte, repFiltro]);

  const esPapa = user?.tipo === 'APODERADO';

  useEffect(() => {
    const idNum = parseInt(alumnoId, 10);
    if (caja || !idNum) {
      setCupo(null);
      return undefined;
    }
    let vivo = true;
    api.get('/kiosco/cupo', { params: { alumno_id: idNum, fecha: fecha || undefined } })
      .then(({ data }) => {
        if (!vivo) return;
        setCupo(data);
        setCupoForm(data.papa || { dia_activo: false, dia_monto: 0, general_activo: false, general_monto: 0 });
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, [caja, alumnoId, fecha]);

  const guardarCupo = async () => {
    if (!esPapa || !alumnoId || !cupoForm) return;
    setGuardandoCupo(true);
    setError('');
    try {
      const { data } = await api.put('/kiosco/cupo', { ...cupoForm, alumno_id: parseInt(alumnoId, 10), fecha });
      setCupo(data);
      setCupoForm(data.papa);
      setAviso('Límite de fiado guardado. Si se paga la deuda, el cupo vuelve a quedar libre.');
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo guardar el límite.');
    } finally {
      setGuardandoCupo(false);
    }
  };

  const bajarReporte = async () => {
    if (!reporte) return;
    setExportando(true);
    try {
      const nombres = { todos: 'Todos', vendido: 'Vendidos', pagado: 'Pagados', fiado: 'Fiados', pendiente: 'Pendientes', rechazado: 'Rechazados', espera: 'Por atender' };
      const { exportarKioscoReporte } = await import('../utils/exportKioscoReporte');
      await exportarKioscoReporte({
        desde: reporte.desde,
        hasta: reporte.hasta,
        cierre: reporte.cierre,
        pedidos: pedidosReporte,
        productos: reporte.productos || [],
        filtro: nombres[repFiltro] || 'Todos',
      });
    } catch (e) {
      setError('No se pudo exportar el Excel.');
    } finally {
      setExportando(false);
    }
  };

  const bajarPdf = async () => {
    if (!reporte) return;
    setExportando(true);
    setError('');
    try {
      const res = await api.get('/kiosco/reporte/pdf', {
        params: { desde: reporte.desde, hasta: reporte.hasta, filtro: repFiltro },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `kiosco_${reporte.desde}_${reporte.hasta}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError('No se pudo exportar el PDF.');
    } finally {
      setExportando(false);
    }
  };

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
        alumno_id: (!caja && alumnoPedido) ? parseInt(alumnoPedido, 10) : (alumnoId && alumnoId !== 'yo' ? parseInt(alumnoId, 10) : null),
        cliente_usuario_id: (!caja && alumnoPedido)
          ? null
          : (clienteUsuarioId
            ? parseInt(clienteUsuarioId, 10)
            : (yo?.usuario_id ? parseInt(yo.usuario_id, 10) : null)),
        para_mi: !caja && !alumnoPedido,
        fecha,
        items: carrito.map((it) => ({ producto_id: it.producto_id, cantidad: it.cantidad })),
        origen,
        pago,
      });
      setCarrito([]);
      setVentana(null);
      setAviso(origen === 'mostrador' ? `Venta lista. Código ${data.codigo}.` : `Pedido enviado. Código ${data.codigo}.`);
      cargarCarta(fecha).catch(() => {});
      if (caja) {
        cargarPedidos().catch(() => {});
        cargarCola().catch(() => {});
      }
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo enviar el pedido.');
    } finally {
      setEnviando(false);
    }
  };

  const decidir = async (id, estado, pago) => {
    if (atendiendo) return;
    setAtendiendo(id);
    setError('');
    try {
      await api.post(`/kiosco/pedidos/${id}/estado`, { estado, pago });
      if (estado === 'rechazado') setAviso('Pedido rechazado. Sigue el que llegó después.');
      else if (pago === 'fiado') setAviso('Atendido y fiado. Sigue el que llegó después.');
      else setAviso('Atendido y pagado. Sigue el que llegó después.');
      await Promise.all([cargarCola(), cargarPedidos()]);
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo actualizar el pedido.');
    } finally {
      setAtendiendo(null);
    }
  };

  const horaLlegada = (valor) => {
    const texto = String(valor || '').replace('T', ' ');
    const hora = texto.match(/(\d{2}:\d{2})/);
    return hora ? hora[1] : '';
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
              <div><span>Hoy</span><strong>S/ {Number(resumen.ventas_dia || 0).toFixed(2)}</strong></div>
              <div><span>Mes</span><strong>S/ {Number(resumen.ventas_mes || 0).toFixed(2)}</strong></div>
              <div><span>Fiado</span><strong>S/ {Number(resumen.fiado || 0).toFixed(2)}</strong></div>
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
            <button type="button" className={`kio-accion${panel === 'pedidos' ? ' is-on' : ''}`} onClick={() => { setPanel('pedidos'); cargarCola(); }}>
              <span>Por atender</span><small>{esperando} en espera</small>
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
            <button type="button" className={`kio-accion${panel === 'reportes' ? ' is-on' : ''}`} onClick={() => { setPanel('reportes'); if (!reporte) cargarReporte(hoy, hoy); }}>
              <span>Reportes</span><small>Historial, cierre y Excel</small>
            </button>
            <button type="button" className={`kio-accion${panel === 'ajustes' ? ' is-on' : ''}`} onClick={() => setPanel('ajustes')}>
              <span>Ajustes</span><small>Quién pide, corte y cupo de fiado</small>
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
            <div className="kio-panel-head">
              <div>
                <h2>Por atender</h2>
                <p className="kio-cola-nota">Del más antiguo al más reciente. Pagado o fiado significa que ya se atendió, y sube el siguiente.</p>
              </div>
              <strong>{esperando}</strong>
            </div>
            <div className="kio-cola">
              {cola.map((p, indice) => (
                <article key={p.id} className={indice === 0 ? 'kio-turno kio-turno--ahora' : 'kio-turno'}>
                  <div className="kio-turno-puesto">
                    <b>{indice === 0 ? 'Ahora' : indice + 1}</b>
                    <span>{horaLlegada(p.creado_en) || 'En espera'}</span>
                  </div>
                  <div className="kio-turno-cuerpo">
                    <strong>{p.alumno}</strong>
                    <span>{p.grado} · #{p.codigo}</span>
                    <ul>{(p.items || []).map((it, i) => <li key={i}>{it.cantidad} × {it.nombre}</li>)}</ul>
                    {p.nota ? <p className="kio-turno-nota">{p.nota}</p> : null}
                    <p className="kio-deuda">Ya debe S/ {Number(p.deuda).toFixed(2)}</p>
                  </div>
                  <div className="kio-turno-pago">
                    <b>S/ {Number(p.total).toFixed(2)}</b>
                    <button type="button" className="kio-btn" disabled={atendiendo === p.id} onClick={() => decidir(p.id, 'aceptado', 'pagado')}>Pagado</button>
                    {config?.fiado_activo && (
                      <button type="button" className="kio-btn kio-btn-ghost" disabled={atendiendo === p.id} onClick={() => decidir(p.id, 'aceptado', 'fiado')}>Fiado</button>
                    )}
                    <button type="button" className="kio-btn kio-btn-no" disabled={atendiendo === p.id} onClick={() => decidir(p.id, 'rechazado')}>Rechazar</button>
                  </div>
                </article>
              ))}
              {!cola.length && <p className="kio-vacio">No hay pedidos en espera. El siguiente aparecerá aquí.</p>}
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
              <strong>{muestraYo && hijosPedido.length ? 'Tú debes' : 'Debes'} S/ {(muestraYo ? Number(yo?.deuda || 0) : (hijosPedido.length ? deudaHijosJuntos : deudaMia)).toFixed(2)}</strong>
            </div>
            {muestraYo && hijosPedido.length > 0 && (
              <p className="kio-deuda">
                Tus hijos deben S/ {deudaHijosJuntos.toFixed(2)}
                {hijosPedido.length > 1 ? `. ${hijosPedido.map((h) => `${h.nombre} S/ ${Number(h.deuda || 0).toFixed(2)}`).join(' + ')}` : '.'}
              </p>
            )}
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

        {caja && panel === 'reportes' && (
          <section className="kio-panel">
            <div className="kio-panel-head">
              <div>
                <h2>Reportes</h2>
                <p className="kio-cola-nota">Historial de lo atendido, lo cobrado, lo fiado, lo pendiente y lo rechazado. El cierre usa la fecha en que se hizo el pedido.</p>
              </div>
              <div className="kio-rep-export">
                <button type="button" className="kio-btn" disabled={!reporte || exportando} onClick={bajarReporte}>Excel</button>
                <button type="button" className="kio-btn kio-btn-ghost" disabled={!reporte || exportando} onClick={bajarPdf}>PDF</button>
              </div>
            </div>
            <div className="kio-rep-presets">
              <button type="button" className={repDesde === hoy && repHasta === hoy ? 'is-on' : ''} onClick={() => cargarReporte(hoy, hoy)}>Hoy</button>
              <button type="button" className={hoy && repDesde === inicioSemana(hoy) && repHasta === finSemana(hoy) ? 'is-on' : ''} onClick={() => cargarReporte(inicioSemana(hoy), finSemana(hoy))}>Semana</button>
              <button type="button" className={hoy && repDesde === inicioMes(hoy) && repHasta === finMes(hoy) ? 'is-on' : ''} onClick={() => cargarReporte(inicioMes(hoy), finMes(hoy))}>Mes</button>
            </div>
            <div className="kio-rep-fechas">
              <label>Desde<input type="date" value={repDesde} onChange={(e) => setRepDesde(e.target.value)} /></label>
              <label>Hasta<input type="date" value={repHasta} onChange={(e) => setRepHasta(e.target.value)} /></label>
              <button type="button" className="kio-btn" disabled={repCargando || !repDesde || !repHasta} onClick={() => cargarReporte(repDesde, repHasta)}>Ver</button>
            </div>
            {repCargando && <p className="kio-vacio">Cargando el cierre…</p>}
            {reporte && !repCargando && (
              <>
                <p className="kio-hint">Cierre del {fechaCorta(reporte.desde)} al {fechaCorta(reporte.hasta)}. Lo vendido ya se atendió. Lo pagado entró a caja. Lo fiado se atendió y sigue debiendo. Lo rechazado no se vendió.</p>
                <div className="kio-cierre">
                  {[
                    ['vendido', 'Vendido', reporte.cierre.vendido],
                    ['pagado', 'Pagado', reporte.cierre.pagado],
                    ['fiado', 'Fiado', reporte.cierre.fiado],
                    ['pendiente', 'Pendiente', reporte.cierre.pendiente],
                    ['rechazado', 'Rechazado', reporte.cierre.rechazado],
                    ['espera', 'Por atender', reporte.cierre.espera],
                  ].map(([clave, nombre, dato]) => (
                    <button key={clave} type="button" className={`kio-cierre-card${repFiltro === clave ? ' is-on' : ''}${clave === 'pagado' ? ' kio-cierre-caja' : ''}`} onClick={() => setRepFiltro(clave)}>
                      <span>{nombre}</span>
                      <strong>S/ {Number(dato.total).toFixed(2)}</strong>
                      <small>{dato.n} pedido{dato.n === 1 ? '' : 's'}</small>
                    </button>
                  ))}
                </div>
                <div className="kio-dias">
                  {[
                    ['todos', 'Todos'],
                    ['pagado', 'Pagados'],
                    ['fiado', 'Fiados'],
                    ['pendiente', 'Pendientes'],
                    ['rechazado', 'Rechazados'],
                    ['espera', 'Por atender'],
                  ].map(([clave, nombre]) => (
                    <button key={clave} type="button" className={repFiltro === clave ? 'is-on' : ''} onClick={() => setRepFiltro(clave)}>{nombre}</button>
                  ))}
                </div>
                <div className="kio-rep-lista">
                  {pedidosReporte.map((p) => (
                    <article key={p.id} className="kio-rep-card">
                      <div>
                        <strong>{p.cliente || 'Sin nombre'}</strong>
                        <span>{fechaCorta(p.fecha)} {p.hora} · {p.codigo} · {p.grado || p.origen}</span>
                        <em>{p.detalle || 'Sin detalle'}</em>
                      </div>
                      <div>
                        <b className={`kio-rep-tag kio-rep-${p.estado === 'rechazado' ? 'rechazado' : p.estado === 'pedido' ? 'espera' : p.pago}`}>{etiquetaPedido(p)}</b>
                        <strong>S/ {Number(p.total).toFixed(2)}</strong>
                      </div>
                    </article>
                  ))}
                  {!pedidosReporte.length && <p className="kio-vacio">No hay pedidos en este filtro.</p>}
                </div>
                {reporte.cortado && <p className="kio-hint">Se muestran los 2000 pedidos más recientes del rango. El cierre de arriba sí suma todos.</p>}
                <h3 className="kio-rep-sub">Lo que se vendió</h3>
                <div className="kio-rep-lista">
                  {(reporte.productos || []).map((p) => (
                    <article key={p.nombre} className="kio-rep-card">
                      <div>
                        <strong>{p.nombre}</strong>
                        <span>{p.vendidos} vendido{p.vendidos === 1 ? '' : 's'}{p.no_vendidos ? ` · ${p.no_vendidos} no se vendió` : ''}</span>
                      </div>
                      <strong>S/ {Number(p.monto).toFixed(2)}</strong>
                    </article>
                  ))}
                  {!(reporte.productos || []).length && <p className="kio-vacio">En este rango no hay productos vendidos ni rechazados.</p>}
                </div>
              </>
            )}
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
                <div><strong>Fiado por pedido</strong><p>Un solo fiado no puede pasar de este monto en soles. Si el pedido se paga, el tope no aplica.</p></div>
                <label className="kio-switch">
                  <input type="checkbox" checked={config.limite_activo} onChange={(e) => setConfig({ ...config, limite_activo: e.target.checked })} />
                  <i />
                  <span>{config.limite_activo ? 'Con tope' : 'Sin tope'}</span>
                </label>
                {config.limite_activo && (
                  <label className="kio-soles">
                    <span>S/</span>
                    <input type="number" min="0" step="0.5" value={config.limite_monto} onChange={(e) => setConfig({ ...config, limite_monto: e.target.value })} placeholder="Máximo por fiado" />
                  </label>
                )}
              </article>
              <article className="kio-ajuste">
                <div><strong>Fiado por día</strong><p>Cuántos soles puede quedar debiendo en un mismo día. Cuando ese fiado se paga, el día vuelve a quedar libre.</p></div>
                <label className="kio-switch">
                  <input type="checkbox" checked={!!config.limite_dia_activo} onChange={(e) => setConfig({ ...config, limite_dia_activo: e.target.checked })} />
                  <i />
                  <span>{config.limite_dia_activo ? 'Con tope' : 'Sin tope'}</span>
                </label>
                {config.limite_dia_activo && (
                  <label className="kio-soles">
                    <span>S/</span>
                    <input type="number" min="0" step="0.5" value={config.limite_dia_monto} onChange={(e) => setConfig({ ...config, limite_dia_monto: e.target.value })} placeholder="Máximo del día" />
                  </label>
                )}
              </article>
              <article className="kio-ajuste">
                <div><strong>Fiado general</strong><p>Cuántos soles puede quedar debiendo en total, desde que se enciende. Al pagar, esos soles se liberan. Manda el tope más bajo entre el colegio y el papá.</p></div>
                <label className="kio-switch">
                  <input type="checkbox" checked={!!config.limite_general_activo} onChange={(e) => setConfig({ ...config, limite_general_activo: e.target.checked })} />
                  <i />
                  <span>{config.limite_general_activo ? 'Con tope' : 'Sin tope'}</span>
                </label>
                {config.limite_general_activo && (
                  <label className="kio-soles">
                    <span>S/</span>
                    <input type="number" min="0" step="0.5" value={config.limite_general_monto} onChange={(e) => setConfig({ ...config, limite_general_monto: e.target.value })} placeholder="Máximo que puede deber" />
                  </label>
                )}
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
            {(muestraYo && hijosPedido.length > 0) && (
              <label className="kio-campo">Para
                <select value={alumnoId || 'yo'} onChange={(e) => eligeDestino(e.target.value)}>
                  <option value="yo">Para mí · {yo.nombre}</option>
                  {hijosPedido.map((h) => <option key={h.id} value={h.id}>{h.nombre}{h.grado ? ` · ${h.grado}` : ''}</option>)}
                </select>
              </label>
            )}
            {(!muestraYo && hijosPedido.length > 0) && (
              <label className="kio-campo">Para
                <select value={alumnoPedido} onChange={(e) => eligeDestino(e.target.value)}>
                  {hijosPedido.map((h) => <option key={h.id} value={h.id}>{h.nombre}{h.grado ? ` · ${h.grado}` : ''}</option>)}
                </select>
              </label>
            )}
            {muestraYo && !alumnoPedido && <p>Para {yo.nombre}. Esta compra queda a tu nombre. Debes S/ {Number(yo.deuda).toFixed(2)}</p>}
            {hijosPedido.length > 1 && (
              <p className="kio-deuda">
                Tus hijos deben en total S/ {deudaHijosJuntos.toFixed(2)}. {hijosPedido.map((h) => `${h.nombre} S/ ${Number(h.deuda || 0).toFixed(2)}`).join(' + ')}
              </p>
            )}
            {hijoSel && <p className="kio-deuda">Para {hijoSel.nombre}. Esta compra usa su cupo. Debe S/ {Number(hijoSel.deuda).toFixed(2)}</p>}
            {cupo && (esPapa || cupo.colegio?.pedido_activo || cupo.colegio?.dia_activo || cupo.colegio?.general_activo || cupo.papa?.dia_activo || cupo.papa?.general_activo) && (
              <div className="kio-cupo">
                <strong>Cupo de fiado</strong>
                <p>Solo cuenta lo que queda debiendo. Si se paga, esos soles vuelven a quedar libres. Un pedido pagado no usa este cupo.</p>
                <p>Este día debe <b>S/ {Number(cupo.debe_dia || 0).toFixed(2)}</b>
                  {cupo.colegio?.dia_activo ? ` · Colegio hasta S/ ${Number(cupo.colegio.dia_monto).toFixed(2)}` : ''}
                  {cupo.papa?.dia_activo ? ` · Papá hasta S/ ${Number(cupo.papa.dia_monto).toFixed(2)}` : ''}
                </p>
                {(cupo.colegio?.general_activo || cupo.papa?.general_activo) && (
                  <p>
                    {cupo.papa?.general_activo ? `Tope general del papá: debe S/ ${Number(cupo.debe_general_papa || 0).toFixed(2)} de S/ ${Number(cupo.papa.general_monto).toFixed(2)}. ` : ''}
                    {cupo.colegio?.general_activo ? `Tope general del colegio: debe S/ ${Number(cupo.debe_general_colegio || 0).toFixed(2)} de S/ ${Number(cupo.colegio.general_monto).toFixed(2)}.` : ''}
                  </p>
                )}
                {esPapa && cupoForm && (
                  <div className="kio-cupo-form">
                    <label className="kio-switch">
                      <input type="checkbox" checked={!!cupoForm.dia_activo} onChange={(e) => setCupoForm({ ...cupoForm, dia_activo: e.target.checked })} />
                      <i />
                      <span>Por día</span>
                    </label>
                    {cupoForm.dia_activo && (
                      <label className="kio-soles"><span>S/</span>
                        <input type="number" min="0" step="0.5" value={cupoForm.dia_monto} onChange={(e) => setCupoForm({ ...cupoForm, dia_monto: e.target.value })} />
                      </label>
                    )}
                    <label className="kio-switch">
                      <input type="checkbox" checked={!!cupoForm.general_activo} onChange={(e) => setCupoForm({ ...cupoForm, general_activo: e.target.checked })} />
                      <i />
                      <span>General</span>
                    </label>
                    {cupoForm.general_activo && (
                      <label className="kio-soles"><span>S/</span>
                        <input type="number" min="0" step="0.5" value={cupoForm.general_monto} onChange={(e) => setCupoForm({ ...cupoForm, general_monto: e.target.value })} />
                      </label>
                    )}
                    <button type="button" className="kio-btn" disabled={guardandoCupo} onClick={guardarCupo}>
                      {guardandoCupo ? 'Guardando…' : 'Guardar límite de mi hijo'}
                    </button>
                  </div>
                )}
              </div>
            )}
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
            <button type="button" className="kio-btn" disabled={enviando || !carrito.length || (!alumnoPedido && !muestraYo)} onClick={() => pedir('linea', 'pendiente')}>
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
            <button type="button" className="kio-btn" disabled={enviando || !carrito.length || (!alumnoPedido && !muestraYo)} onClick={() => pedir('linea', 'pendiente')}>
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
