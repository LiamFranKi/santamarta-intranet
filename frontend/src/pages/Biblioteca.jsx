import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Swal from 'sweetalert2';
import DashboardLayout from '../components/DashboardLayout';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { exportarBibliotecaPrestamosExcel } from '../utils/exportBibliotecaPrestamosExcel';
import './Biblioteca.css';

const TABS_USER = [
  { id: 'catalogo', label: 'Catálogo' },
  { id: 'mios', label: 'Mis préstamos' },
];
const TABS_GESTION = [
  { id: 'catalogo', label: 'Catálogo' },
  { id: 'movimientos', label: 'Préstamos' },
  { id: 'categorias', label: 'Categorías' },
  { id: 'areas', label: 'Áreas' },
];

const ESTADO_LABEL = {
  SEPARADO: 'Separado',
  PRESTADO: 'Prestado',
  DEVUELTO: 'Devuelto',
  CANCELADO: 'Cancelado',
  NO_RECOGIDO: 'No recogido',
};

function inicialesLibro(titulo) {
  const p = String(titulo || 'L').trim().split(/\s+/).slice(0, 2);
  return p.map((w) => (w[0] || '').toUpperCase()).join('') || 'L';
}

function ymd(val) {
  if (!val) return '';
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return val.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
  }
  return String(val).slice(0, 10);
}

function fmtFecha(val) {
  const s = ymd(val);
  if (!s) return '—';
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

function hoyYmd() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
}

function estaVencido(mov) {
  const vence = ymd(mov.fecha_vencimiento);
  return mov.estado === 'PRESTADO' && vence && vence < hoyYmd();
}

export default function Biblioteca() {
  const { user } = useAuth();
  const [tab, setTab] = useState('catalogo');
  const [meta, setMeta] = useState({ puede_gestionar: false, categorias: [], areas: [], hijos: [] });
  const [libros, setLibros] = useState([]);
  const [q, setQ] = useState('');
  const [filtroCat, setFiltroCat] = useState('');
  const [filtroArea, setFiltroArea] = useState('');
  const [loading, setLoading] = useState(true);
  const [movimientos, setMovimientos] = useState([]);
  const [filtroMov, setFiltroMov] = useState('PRESTADO');
  const [fechaCampo, setFechaCampo] = useState('PRESTAMO');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [formLibro, setFormLibro] = useState(null);
  const [hijoId, setHijoId] = useState('');
  const [exportando, setExportando] = useState(false);

  const gestionar = !!meta.puede_gestionar;
  const tabs = gestionar ? TABS_GESTION : TABS_USER;
  const esApoderado = String(user?.tipo || '').toUpperCase() === 'APODERADO';

  const cargarMeta = useCallback(async () => {
    const { data } = await api.get('/biblioteca/meta');
    setMeta(data);
    setHijoId((prev) => prev || (data.hijos?.[0] ? String(data.hijos[0].id) : ''));
  }, []);

  const cargarCatalogo = useCallback(async () => {
    const { data } = await api.get('/biblioteca/catalogo', {
      params: {
        q: q || undefined,
        categoria_id: filtroCat || undefined,
        area_id: filtroArea || undefined,
      },
    });
    setLibros(data.libros || []);
  }, [q, filtroCat, filtroArea]);

  const cargarMovs = useCallback(async () => {
    const params = {
      fecha_campo: fechaCampo,
    };
    if (gestionar && filtroMov) params.estado = filtroMov;
    if (fechaDesde) params.desde = fechaDesde;
    if (fechaHasta) params.hasta = fechaHasta;
    const { data } = await api.get('/biblioteca/movimientos', { params });
    setMovimientos(data.movimientos || []);
  }, [gestionar, filtroMov, fechaCampo, fechaDesde, fechaHasta]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await cargarMeta();
        await cargarCatalogo();
      } catch (e) {
        Swal.fire('Biblioteca', e.response?.data?.error || e.message, 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [cargarMeta, cargarCatalogo]);

  useEffect(() => {
    if (tab === 'movimientos' || tab === 'mios') {
      cargarMovs().catch(() => setMovimientos([]));
    }
  }, [tab, cargarMovs]);

  const catsActivas = useMemo(
    () => (meta.categorias || []).filter((c) => c.activo !== 0),
    [meta.categorias]
  );
  const areasActivas = useMemo(
    () => (meta.areas || []).filter((a) => a.activo !== 0),
    [meta.areas]
  );

  const separar = async (libro) => {
    if (!libro.disponibles) {
      Swal.fire('Sin stock', 'No hay ejemplares disponibles.', 'info');
      return;
    }
    const payload = { libro_id: libro.id };
    if (esApoderado) {
      if (!hijoId) {
        Swal.fire('Hijo', 'Seleccione el estudiante para quien separa el libro.', 'warning');
        return;
      }
      payload.alumno_id = Number(hijoId);
    }
    const ok = await Swal.fire({
      title: '¿Separar este libro?',
      text: 'Quedará no disponible hasta que lo recoja o el bibliotecario libere la reserva.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Separar',
      cancelButtonText: 'Cancelar',
    });
    if (!ok.isConfirmed) return;
    try {
      const { data } = await api.post('/biblioteca/separar', payload);
      Swal.fire({ icon: 'success', title: 'Separado', text: data.mensaje, timer: 2200, showConfirmButton: false });
      await cargarCatalogo();
    } catch (e) {
      Swal.fire('No se pudo separar', e.response?.data?.error || e.message, 'error');
    }
  };

  const guardarLibro = async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    try {
      if (formLibro?.id) {
        await api.put(`/biblioteca/libros/${formLibro.id}`, {
          titulo: fd.get('titulo'),
          autor: fd.get('autor'),
          editorial: fd.get('editorial'),
          isbn: fd.get('isbn'),
          anio: fd.get('anio'),
          categoria_id: fd.get('categoria_id'),
          area_id: fd.get('area_id'),
          descripcion: fd.get('descripcion'),
        });
        if (fd.get('portada') && fd.get('portada').size) {
          const foto = new FormData();
          foto.append('portada', fd.get('portada'));
          await api.post(`/biblioteca/libros/${formLibro.id}/portada`, foto);
        }
      } else {
        await api.post('/biblioteca/libros', fd);
      }
      setFormLibro(null);
      await cargarMeta();
      await cargarCatalogo();
      Swal.fire({ icon: 'success', title: 'Guardado', timer: 1200, showConfirmButton: false });
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || e.message, 'error');
    }
  };

  const agregarEjemplares = async (libro) => {
    const { value } = await Swal.fire({
      title: 'Agregar ejemplares',
      input: 'number',
      inputValue: 1,
      inputAttributes: { min: 1, max: 20 },
      showCancelButton: true,
      confirmButtonText: 'Agregar',
    });
    if (!value) return;
    try {
      await api.post(`/biblioteca/libros/${libro.id}/ejemplares`, { cantidad: Number(value) });
      await cargarCatalogo();
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || e.message, 'error');
    }
  };

  const prestarPresencial = async (libro) => {
    const tipo = await Swal.fire({
      title: 'Préstamo presencial',
      text: '¿A quién se presta?',
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonText: 'Alumno',
      denyButtonText: 'Personal',
      cancelButtonText: 'Cancelar',
    });
    if (tipo.isDismissed) return;
    const destTipo = tipo.isConfirmed ? 'ALUMNO' : 'PERSONAL';
    const { value: qPersona } = await Swal.fire({
      title: destTipo === 'ALUMNO' ? 'Buscar alumno' : 'Buscar personal',
      input: 'text',
      inputPlaceholder: 'Nombre o DNI (mín. 2 letras)',
      showCancelButton: true,
    });
    if (!qPersona || String(qPersona).trim().length < 2) return;
    let personas = [];
    try {
      const { data } = await api.get('/biblioteca/buscar-personas', {
        params: { q: qPersona, tipo: destTipo },
      });
      personas = data.personas || [];
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || e.message, 'error');
      return;
    }
    if (!personas.length) {
      Swal.fire('Sin resultados', 'No se encontró a esa persona.', 'info');
      return;
    }
    const { value: personaId } = await Swal.fire({
      title: 'Seleccione',
      input: 'select',
      inputOptions: Object.fromEntries(personas.map((p) => [p.id, `${p.nombre} (${p.dni || 's/d'})`])),
      showCancelButton: true,
    });
    if (!personaId) return;
    const { value: dias } = await Swal.fire({
      title: 'Días de préstamo',
      input: 'number',
      inputValue: 7,
      inputAttributes: { min: 1, max: 90 },
      showCancelButton: true,
    });
    if (!dias) return;
    try {
      await api.post('/biblioteca/prestamo', {
        libro_id: libro.id,
        destinatario_tipo: destTipo,
        alumno_id: destTipo === 'ALUMNO' ? Number(personaId) : undefined,
        personal_id: destTipo === 'PERSONAL' ? Number(personaId) : undefined,
        dias: Number(dias),
      });
      Swal.fire({ icon: 'success', title: 'Prestado', timer: 1400, showConfirmButton: false });
      await cargarCatalogo();
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || e.message, 'error');
    }
  };

  const accMov = async (id, accion, extra = {}) => {
    try {
      await api.post(`/biblioteca/movimientos/${id}/${accion}`, extra);
      await cargarMovs();
      await cargarCatalogo();
      return true;
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || e.message, 'error');
      return false;
    }
  };

  const devolver = async (mov) => {
    const ok = await Swal.fire({
      title: '¿Marcar como devuelto?',
      text: `${mov.libro_titulo} — ${mov.persona}`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Devuelto',
      cancelButtonText: 'Cancelar',
    });
    if (!ok.isConfirmed) return;
    const hecho = await accMov(mov.id, 'devolver');
    if (hecho) {
      Swal.fire({ icon: 'success', title: 'Devuelto', timer: 1200, showConfirmButton: false });
    }
  };

  const exportarPrestamos = async () => {
    if (!movimientos.length) {
      Swal.fire({ icon: 'info', title: 'Sin datos', text: 'No hay préstamos para exportar con esos filtros.' });
      return;
    }
    setExportando(true);
    try {
      const campoLabel = {
        PRESTAMO: 'préstamo',
        VENCIMIENTO: 'vencimiento',
        DEVOLUCION: 'devolución',
        SEPARACION: 'separación',
      }[fechaCampo] || 'préstamo';
      const partes = [];
      if (gestionar && tab === 'movimientos') {
        partes.push(filtroMov ? ESTADO_LABEL[filtroMov] || filtroMov : 'Todos los estados');
      } else {
        partes.push('Mis préstamos');
      }
      if (fechaDesde || fechaHasta) {
        partes.push(
          `${campoLabel} ${fechaDesde ? fmtFecha(fechaDesde) : '…'} – ${fechaHasta ? fmtFecha(fechaHasta) : '…'}`
        );
      }
      await exportarBibliotecaPrestamosExcel({
        movimientos,
        colegioNombre: user?.colegio_nombre || 'Vanguard Schools',
        filtrosTexto: partes.join('  ·  '),
      });
    } catch (e) {
      Swal.fire('Error', e.message || 'No se pudo exportar.', 'error');
    } finally {
      setExportando(false);
    }
  };

  const entregar = async (mov) => {
    const { value: dias } = await Swal.fire({
      title: 'Entregar (préstamo)',
      input: 'number',
      inputValue: mov.dias_prestamo || 7,
      inputAttributes: { min: 1, max: 90 },
      showCancelButton: true,
      confirmButtonText: 'Entregar',
    });
    if (!dias) return;
    await accMov(mov.id, 'entregar', { dias: Number(dias) });
  };

  const guardarTax = async (tipo, nombre, id) => {
    const n = String(nombre || '').trim();
    if (!n) return;
    try {
      if (id) await api.put(`/biblioteca/${tipo}/${id}`, { nombre: n });
      else await api.post(`/biblioteca/${tipo}`, { nombre: n });
      await cargarMeta();
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || e.message, 'error');
    }
  };

  const borrarTax = async (tipo, id) => {
    const ok = await Swal.fire({
      title: '¿Eliminar?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Eliminar',
    });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/biblioteca/${tipo}/${id}`);
      await cargarMeta();
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || e.message, 'error');
    }
  };

  return (
    <DashboardLayout>
      <div className="bib-page">
        <header className="bib-hero">
          <div className="bib-hero-icon" aria-hidden>
            📚
          </div>
          <div>
            <h1>Biblioteca</h1>
            <p>
              Consulte el catálogo, separe un ejemplar disponible o revise sus préstamos.
              {gestionar ? ' Usted puede gestionar el inventario y los estados.' : ''}
            </p>
          </div>
        </header>

        {esApoderado && meta.hijos?.length > 0 && (
          <div className="bib-hijo-bar">
            <label htmlFor="bib-hijo">Separar / ver para</label>
            <select id="bib-hijo" value={hijoId} onChange={(e) => setHijoId(e.target.value)}>
              {meta.hijos.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.apellido_paterno} {h.apellido_materno}, {h.nombres}
                </option>
              ))}
            </select>
          </div>
        )}

        <nav className="bib-tabs" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`bib-tab${tab === t.id ? ' is-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {loading ? (
          <p className="bib-muted">Cargando…</p>
        ) : tab === 'catalogo' ? (
          <>
            <div className="bib-toolbar">
              <input
                type="search"
                placeholder="Buscar título, autor o ISBN"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <select value={filtroCat} onChange={(e) => setFiltroCat(e.target.value)}>
                <option value="">Todas las categorías</option>
                {catsActivas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
              <select value={filtroArea} onChange={(e) => setFiltroArea(e.target.value)}>
                <option value="">Todas las áreas</option>
                {areasActivas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
              </select>
              {gestionar && (
                <button type="button" className="bib-btn bib-btn--primary" onClick={() => setFormLibro({})}>
                  Nuevo libro
                </button>
              )}
            </div>
            <div className="bib-grid">
              {libros.length === 0 ? (
                <p className="bib-muted">No hay libros con esos filtros.</p>
              ) : (
                libros.map((libro) => (
                  <article key={libro.id} className="bib-card">
                    <div className="bib-cover">
                      {libro.portada_url ? (
                        <img src={libro.portada_url} alt="" />
                      ) : (
                        <span>{inicialesLibro(libro.titulo)}</span>
                      )}
                    </div>
                    <div className="bib-card-body">
                      <h3>{libro.titulo}</h3>
                      <p className="bib-autor">{libro.autor || 'Autor no registrado'}</p>
                      <p className="bib-meta">
                        {libro.categoria_nombre || 'Sin categoría'}
                        {libro.area_nombre ? ` · ${libro.area_nombre}` : ''}
                      </p>
                      <p className={`bib-stock${libro.disponibles ? '' : ' is-out'}`}>
                        {libro.disponibles} de {libro.total_ejemplares} disponibles
                      </p>
                      <div className="bib-card-actions">
                        <button
                          type="button"
                          className="bib-btn bib-btn--primary"
                          disabled={!libro.disponibles}
                          onClick={() => separar(libro)}
                        >
                          Separar
                        </button>
                        {gestionar && (
                          <>
                            <button type="button" className="bib-btn" onClick={() => prestarPresencial(libro)}>
                              Prestar
                            </button>
                            <button type="button" className="bib-btn" onClick={() => setFormLibro(libro)}>
                              Editar
                            </button>
                            <button type="button" className="bib-btn" onClick={() => agregarEjemplares(libro)}>
                              + Ejemplares
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </>
        ) : tab === 'movimientos' || tab === 'mios' ? (
          <>
            <p className="bib-hint">
              {gestionar
                ? 'Grilla de préstamos. En Prestados use Devuelto para cerrar el préstamo y liberar el ejemplar. Filtre por fechas y exporte a Excel.'
                : 'Sus préstamos y reservas. Puede filtrar por fechas y exportar la lista.'}
            </p>
            <div className="bib-toolbar">
              {gestionar && tab === 'movimientos' && (
                <select
                  value={filtroMov}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFiltroMov(v);
                    if (v === 'SEPARADO') setFechaCampo('SEPARACION');
                    else if (v === 'DEVUELTO') setFechaCampo('DEVOLUCION');
                    else if (v === 'PRESTADO' || v === 'NO_RECOGIDO') setFechaCampo('PRESTAMO');
                  }}
                >
                  <option value="PRESTADO">Prestados (por devolver)</option>
                  <option value="SEPARADO">Separados (por recoger)</option>
                  <option value="DEVUELTO">Devueltos</option>
                  <option value="NO_RECOGIDO">No recogidos</option>
                  <option value="CANCELADO">Cancelados</option>
                  <option value="">Todos</option>
                </select>
              )}
              <select value={fechaCampo} onChange={(e) => setFechaCampo(e.target.value)}>
                <option value="PRESTAMO">Fecha de préstamo</option>
                <option value="VENCIMIENTO">Fecha de vencimiento</option>
                <option value="DEVOLUCION">Fecha de devolución</option>
                <option value="SEPARACION">Fecha de separación</option>
              </select>
              <label className="bib-date">
                Desde
                <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
              </label>
              <label className="bib-date">
                Hasta
                <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
              </label>
              <button type="button" className="bib-btn bib-btn--primary" disabled={exportando} onClick={exportarPrestamos}>
                {exportando ? 'Exportando…' : 'Exportar Excel'}
              </button>
              <span className="bib-count">{movimientos.length} registro{movimientos.length === 1 ? '' : 's'}</span>
            </div>
            <div className="bib-table-wrap">
              <table className="bib-table">
                <thead>
                  <tr>
                    <th>Libro</th>
                    <th>Persona</th>
                    <th>Estado</th>
                    <th>Canal</th>
                    <th>Prestado</th>
                    <th>Vence</th>
                    <th>Devuelto</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientos.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="bib-muted">
                        Sin registros en ese rango.
                      </td>
                    </tr>
                  ) : (
                    movimientos.map((m) => (
                      <tr key={m.id} className={estaVencido(m) ? 'is-vencido' : undefined}>
                        <td>{m.libro_titulo}</td>
                        <td>{m.persona}</td>
                        <td>
                          <span className={`bib-pill bib-pill--${m.estado}`}>{ESTADO_LABEL[m.estado] || m.estado}</span>
                        </td>
                        <td>{m.canal === 'VIRTUAL' ? 'Virtual' : 'Presencial'}</td>
                        <td>{fmtFecha(m.fecha_prestamo)}</td>
                        <td>{fmtFecha(m.fecha_vencimiento)}</td>
                        <td>{fmtFecha(m.fecha_devolucion)}</td>
                        <td>
                          {gestionar && m.estado === 'SEPARADO' && (
                            <>
                              <button type="button" className="bib-btn bib-btn--sm" onClick={() => entregar(m)}>
                                Entregar
                              </button>
                              <button type="button" className="bib-btn bib-btn--sm" onClick={() => accMov(m.id, 'no-recogido')}>
                                No recogió
                              </button>
                            </>
                          )}
                          {gestionar && m.estado === 'PRESTADO' && (
                            <button type="button" className="bib-btn bib-btn--sm bib-btn--ok" onClick={() => devolver(m)}>
                              Devuelto
                            </button>
                          )}
                          {m.estado === 'SEPARADO' && (
                            <button type="button" className="bib-btn bib-btn--sm" onClick={() => accMov(m.id, 'cancelar')}>
                              Cancelar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : tab === 'categorias' || tab === 'areas' ? (
          <TaxPanel
            titulo={tab === 'categorias' ? 'Categorías' : 'Áreas'}
            hint={
              tab === 'categorias'
                ? 'Tipo o género del material: novela, cuento, enciclopedia, diccionario, cómic, texto escolar… Sirve para ordenar el catálogo por clase de libro.'
                : 'Materia o disciplina: Matemática, Comunicación, Ciencia, Historia, Inglés… Sirve para buscar libros de un área curricular.'
            }
            items={tab === 'categorias' ? meta.categorias : meta.areas}
            onSave={(nombre, id) => guardarTax(tab, nombre, id)}
            onDelete={(id) => borrarTax(tab, id)}
          />
        ) : null}

        {formLibro &&
          createPortal(
          <div className="bib-modal" role="dialog" aria-modal="true">
            <form className="bib-modal-card" onSubmit={guardarLibro}>
              <h2>{formLibro.id ? 'Editar libro' : 'Nuevo libro'}</h2>
              <label>
                Título *
                <input name="titulo" defaultValue={formLibro.titulo || ''} required />
              </label>
              <label>
                Autor
                <input name="autor" defaultValue={formLibro.autor || ''} />
              </label>
              <div className="bib-form-row">
                <label>
                  Editorial
                  <input name="editorial" defaultValue={formLibro.editorial || ''} />
                </label>
                <label>
                  ISBN
                  <input name="isbn" defaultValue={formLibro.isbn || ''} />
                </label>
                <label>
                  Año
                  <input name="anio" type="number" defaultValue={formLibro.anio || ''} />
                </label>
              </div>
              <div className="bib-form-row">
                <label>
                  Categoría
                  <select name="categoria_id" defaultValue={formLibro.categoria_id || ''}>
                    <option value="">—</option>
                    {catsActivas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Área
                  <select name="area_id" defaultValue={formLibro.area_id || ''}>
                    <option value="">—</option>
                    {areasActivas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nombre}
                      </option>
                    ))}
                  </select>
                </label>
                {!formLibro.id && (
                  <label>
                    Ejemplares
                    <input name="ejemplares" type="number" min="1" max="50" defaultValue="1" />
                  </label>
                )}
              </div>
              <label>
                Descripción
                <textarea name="descripcion" rows={3} defaultValue={formLibro.descripcion || ''} />
              </label>
              <label>
                Portada
                <input name="portada" type="file" accept="image/*" />
              </label>
              <div className="bib-modal-actions">
                <button type="button" className="bib-btn" onClick={() => setFormLibro(null)}>
                  Cancelar
                </button>
                <button type="submit" className="bib-btn bib-btn--primary">
                  Guardar
                </button>
              </div>
            </form>
          </div>,
          document.body
        )}
      </div>
    </DashboardLayout>
  );
}

function TaxPanel({ titulo, hint, items, onSave, onDelete }) {
  const [nombre, setNombre] = useState('');
  return (
    <div className="bib-tax">
      {hint ? <p className="bib-hint">{hint}</p> : null}
      <div className="bib-toolbar">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder={`Nueva ${titulo.slice(0, -1).toLowerCase()}`}
        />
        <button
          type="button"
          className="bib-btn bib-btn--primary"
          onClick={() => {
            onSave(nombre);
            setNombre('');
          }}
        >
          Agregar
        </button>
      </div>
      <ul className="bib-tax-list">
        {(items || []).map((it) => (
          <li key={it.id}>
            <span>{it.nombre}</span>
            <span>
              <button
                type="button"
                className="bib-btn bib-btn--sm"
                onClick={async () => {
                  const { value } = await Swal.fire({
                    title: 'Renombrar',
                    input: 'text',
                    inputValue: it.nombre,
                    showCancelButton: true,
                  });
                  if (value) onSave(value, it.id);
                }}
              >
                Editar
              </button>
              <button type="button" className="bib-btn bib-btn--sm" onClick={() => onDelete(it.id)}>
                Quitar
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
