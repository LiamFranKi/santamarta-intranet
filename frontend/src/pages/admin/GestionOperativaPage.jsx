import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import Swal from 'sweetalert2';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import {
  etiquetaEstado,
  etiquetaTipoTrabajo,
  formatDuracionSeg,
  formatFechaCorta,
  formatHoraItem,
  notificarCambioSgoi,
} from '../../utils/sgoiFormat';
import './GestionOperativa.css';

function vistaDesdePath(pathname) {
  if (pathname.endsWith('/tablero')) return 'tablero';
  if (pathname.endsWith('/casos')) return 'casos';
  if (pathname.endsWith('/trabajos')) return 'trabajos';
  if (pathname.endsWith('/pendientes')) return 'pendientes';
  return 'dia';
}

function fechaHoyLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function lunesDomingoSemana() {
  const d = new Date();
  const day = d.getDay() || 7;
  const lunes = new Date(d);
  lunes.setDate(d.getDate() - day + 1);
  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() + 6);
  const iso = (x) => {
    const p = (n) => String(n).padStart(2, '0');
    return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
  };
  return { desde: iso(lunes), hasta: iso(domingo) };
}

export default function GestionOperativaPage() {
  const location = useLocation();
  const vista = vistaDesdePath(location.pathname);
  const [fecha, setFecha] = useState(fechaHoyLocal);
  const [semana] = useState(lunesDomingoSemana);
  const [diaItems, setDiaItems] = useState([]);
  const [tablero, setTablero] = useState(null);
  const [lista, setLista] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nuevoPendiente, setNuevoPendiente] = useState('');

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      if (vista === 'dia') {
        const { data } = await api.get('/sgoi/dia', { params: { fecha } });
        setDiaItems(Array.isArray(data.items) ? data.items : []);
      } else if (vista === 'tablero') {
        const { data } = await api.get('/sgoi/tablero', { params: semana });
        setTablero(data);
      } else if (vista === 'casos') {
        const { data } = await api.get('/sgoi/casos');
        setLista(Array.isArray(data.items) ? data.items : []);
      } else if (vista === 'trabajos') {
        const { data } = await api.get('/sgoi/trabajos');
        setLista(Array.isArray(data.items) ? data.items : []);
      } else {
        const { data } = await api.get('/sgoi/pendientes');
        setLista(Array.isArray(data.items) ? data.items : []);
      }
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Gestión operativa',
        text: e?.response?.data?.error || 'No se pudo cargar.',
      });
    } finally {
      setLoading(false);
    }
  }, [vista, fecha, semana]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    const onChange = () => cargar();
    window.addEventListener('sgoi-changed', onChange);
    return () => window.removeEventListener('sgoi-changed', onChange);
  }, [cargar]);

  const totalDiaSeg = useMemo(
    () => diaItems.reduce((s, it) => s + (it.estado === 'EN_CURSO' ? 0 : Number(it.duracion_seg || 0)), 0),
    [diaItems]
  );

  const continuarPendiente = async (id, como) => {
    try {
      await api.post(`/sgoi/pendientes/${id}/continuar`, { como });
      notificarCambioSgoi();
      Swal.fire({ icon: 'success', title: 'En curso', timer: 1400, showConfirmButton: false });
    } catch (e) {
      Swal.fire({ icon: 'warning', title: 'No se pudo continuar', text: e?.response?.data?.error || e.message });
    }
  };

  const marcarHecho = async (id) => {
    try {
      await api.post(`/sgoi/pendientes/${id}/hecho`);
      notificarCambioSgoi();
      cargar();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e?.response?.data?.error || e.message });
    }
  };

  const crearPendiente = async (ev) => {
    ev.preventDefault();
    const titulo = nuevoPendiente.trim();
    if (!titulo) return;
    try {
      await api.post('/sgoi/pendientes', { titulo });
      setNuevoPendiente('');
      cargar();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e?.response?.data?.error || e.message });
    }
  };

  const r = tablero?.resumen;

  return (
    <DashboardLayout>
      <div className="sgoi-page">
        <div className="sgoi-hero">
          <div>
            <h1>Gestión operativa</h1>
            <p>Bitácora del día, casos de soporte y trabajos. El flotante GO registra el reloj.</p>
          </div>
        </div>

        <nav className="sgoi-tabs">
          <NavLink to="/admin/gestion-operativa" end className={({ isActive }) => `sgoi-tab ${isActive ? 'active' : ''}`}>
            Mi día
          </NavLink>
          <NavLink to="/admin/gestion-operativa/tablero" className={({ isActive }) => `sgoi-tab ${isActive ? 'active' : ''}`}>
            Tablero
          </NavLink>
          <NavLink to="/admin/gestion-operativa/casos" className={({ isActive }) => `sgoi-tab ${isActive ? 'active' : ''}`}>
            Casos
          </NavLink>
          <NavLink to="/admin/gestion-operativa/trabajos" className={({ isActive }) => `sgoi-tab ${isActive ? 'active' : ''}`}>
            Trabajos
          </NavLink>
          <NavLink to="/admin/gestion-operativa/pendientes" className={({ isActive }) => `sgoi-tab ${isActive ? 'active' : ''}`}>
            Pendientes
          </NavLink>
        </nav>

        {loading ? (
          <div className="sgoi-empty">Cargando…</div>
        ) : vista === 'dia' ? (
          <>
            <div className="sgoi-toolbar">
              <label>
                Fecha
                <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </label>
              <div className="sgoi-chip">Registrado: {formatDuracionSeg(totalDiaSeg)}</div>
            </div>
            {diaItems.length === 0 ? (
              <div className="sgoi-empty">Aún no hay movimientos este día. Usa el botón GO de la esquina.</div>
            ) : (
              <ol className="sgoi-timeline">
                {diaItems.map((it) => (
                  <li key={`${it.kind}-${it.id}`} className={`sgoi-tl ${it.kind === 'CASO' ? 'is-caso' : 'is-trabajo'}`}>
                    <div className="sgoi-tl-time">
                      {formatHoraItem(it.inicio_at)}
                      {it.fin_at ? ` – ${formatHoraItem(it.fin_at)}` : ' – …'}
                    </div>
                    <div className="sgoi-tl-body">
                      <div className="sgoi-tl-top">
                        <span className="sgoi-badge">{it.kind === 'CASO' ? 'Caso' : 'Trabajo'}</span>
                        <strong>{it.titulo}</strong>
                        <span className={`sgoi-st sgoi-st-${it.estado}`}>{etiquetaEstado(it.estado)}</span>
                      </div>
                      <div className="sgoi-tl-meta">
                        {it.codigo}
                        {it.tipo ? ` · ${etiquetaTipoTrabajo(it.tipo)}` : ''}
                        {it.usuario_nombre ? ` · ${it.usuario_nombre}` : ''}
                        {it.estado !== 'EN_CURSO' ? ` · ${formatDuracionSeg(it.duracion_seg)}` : ''}
                      </div>
                      {it.nota ? <p className="sgoi-tl-nota">{it.nota}</p> : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </>
        ) : vista === 'tablero' ? (
          <>
            <p className="sgoi-range">
              Semana {formatFechaCorta(tablero?.desde)} – {formatFechaCorta(tablero?.hasta)}
            </p>
            <div className="sgoi-kpis">
              <div className="sgoi-kpi">
                <span>Casos</span>
                <strong>{r?.casos_total ?? 0}</strong>
                <small>{r?.casos_resueltos ?? 0} resueltos</small>
              </div>
              <div className="sgoi-kpi">
                <span>Soporte</span>
                <strong>{formatDuracionSeg(r?.segundos_soporte)}</strong>
                <small>tiempo atendiendo</small>
              </div>
              <div className="sgoi-kpi">
                <span>Desarrollo</span>
                <strong>{formatDuracionSeg(r?.segundos_desarrollo)}</strong>
                <small>módulos y despliegues</small>
              </div>
              <div className="sgoi-kpi">
                <span>Pendientes</span>
                <strong>{r?.pendientes_abiertos ?? 0}</strong>
                <small>siguen abiertos</small>
              </div>
            </div>
            {tablero?.en_curso?.length ? (
              <section className="sgoi-block">
                <h2>Ahora mismo</h2>
                <ul className="sgoi-list">
                  {tablero.en_curso.map((it) => (
                    <li key={`${it.kind}-${it.id}`}>
                      <strong>{it.titulo}</strong>
                      <span>{it.kind === 'CASO' ? 'Caso' : 'Trabajo'} · {it.codigo}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <section className="sgoi-block">
              <h2>Actividad reciente</h2>
              {(tablero?.recientes || []).length === 0 ? (
                <div className="sgoi-empty">Sin movimientos esta semana.</div>
              ) : (
                <ul className="sgoi-list">
                  {tablero.recientes.map((it) => (
                    <li key={`${it.kind}-${it.id}`}>
                      <strong>{it.titulo}</strong>
                      <span>
                        {it.kind === 'CASO' ? 'Caso' : 'Trabajo'} · {etiquetaEstado(it.estado)} · {formatHoraItem(it.inicio_at)}
                        {it.duracion_seg ? ` · ${formatDuracionSeg(it.duracion_seg)}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : vista === 'pendientes' ? (
          <>
            <form className="sgoi-toolbar" onSubmit={crearPendiente}>
              <input
                type="text"
                value={nuevoPendiente}
                onChange={(e) => setNuevoPendiente(e.target.value)}
                placeholder="Nuevo pendiente…"
                maxLength={200}
              />
              <button type="submit" className="sgoi-btn">Agregar</button>
            </form>
            {lista.length === 0 ? (
              <div className="sgoi-empty">No hay pendientes abiertos.</div>
            ) : (
              <ul className="sgoi-cards">
                {lista.map((it) => (
                  <li key={it.id} className="sgoi-card">
                    <div>
                      <strong>{it.titulo}</strong>
                      <div className="sgoi-tl-meta">
                        {etiquetaEstado(it.estado)}
                        {it.usuario_nombre ? ` · ${it.usuario_nombre}` : ''}
                      </div>
                      {it.descripcion ? <p className="sgoi-tl-nota">{it.descripcion}</p> : null}
                    </div>
                    <div className="sgoi-card-actions">
                      <button type="button" className="sgoi-btn sgoi-btn-caso" onClick={() => continuarPendiente(it.id, 'CASO')}>
                        Continuar como caso
                      </button>
                      <button type="button" className="sgoi-btn" onClick={() => continuarPendiente(it.id, 'TRABAJO')}>
                        Continuar como trabajo
                      </button>
                      <button type="button" className="sgoi-btn sgoi-btn-ghost" onClick={() => marcarHecho(it.id)}>
                        Marcar hecho
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          lista.length === 0 ? (
            <div className="sgoi-empty">No hay registros todavía.</div>
          ) : (
            <div className="sgoi-table-wrap">
              <table className="sgoi-table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Título</th>
                    <th>Estado</th>
                    <th>Cuándo</th>
                    <th>Duración</th>
                    <th>Quién</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((it) => (
                    <tr key={it.id}>
                      <td>{it.codigo}</td>
                      <td>
                        {it.titulo}
                        {it.tipo ? <div className="sgoi-tl-meta">{etiquetaTipoTrabajo(it.tipo)}</div> : null}
                        {it.nota ? <div className="sgoi-tl-nota">{it.nota}</div> : null}
                      </td>
                      <td><span className={`sgoi-st sgoi-st-${it.estado}`}>{etiquetaEstado(it.estado)}</span></td>
                      <td>{formatFechaCorta(it.inicio_at)} {formatHoraItem(it.inicio_at)}</td>
                      <td>{it.estado === 'EN_CURSO' ? '—' : formatDuracionSeg(it.duracion_seg)}</td>
                      <td>{it.usuario_nombre || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </DashboardLayout>
  );
}
