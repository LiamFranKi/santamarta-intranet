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

function escapeHtml(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

  const rutaEntidad = (kind) => {
    if (kind === 'CASO') return 'casos';
    if (kind === 'TRABAJO') return 'trabajos';
    return 'pendientes';
  };

  const eliminarItem = async (kind, id, etiqueta) => {
    const ok = await Swal.fire({
      icon: 'warning',
      title: 'Eliminar',
      text: `Se eliminará ${etiqueta}. Esta acción no se puede deshacer.`,
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
    });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/sgoi/${rutaEntidad(kind)}/${id}`);
      notificarCambioSgoi();
      await cargar();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e?.response?.data?.error || e.message });
    }
  };

  const editarRegistro = async (it) => {
    const esCaso = it.kind === 'CASO' || vista === 'casos';
    const esTrabajo = it.kind === 'TRABAJO' || vista === 'trabajos';
    const enCurso = it.estado === 'EN_CURSO';
    const extraCampo = esCaso
      ? `<label class="sgoi-swal-label">Prioridad</label>
         <select id="sgoi-prioridad" class="swal2-input">
           <option value="NORMAL"${it.prioridad === 'NORMAL' ? ' selected' : ''}>Normal</option>
           <option value="ALTA"${it.prioridad === 'ALTA' ? ' selected' : ''}>Alta</option>
           <option value="URGENTE"${it.prioridad === 'URGENTE' ? ' selected' : ''}>Urgente</option>
         </select>`
      : esTrabajo
        ? `<label class="sgoi-swal-label">Tipo</label>
           <select id="sgoi-tipo" class="swal2-input">
             ${['DESARROLLO', 'SOPORTE', 'PAGOS', 'DESPLIEGUE', 'REUNION', 'OTRO'].map((t) =>
               `<option value="${t}"${it.tipo === t ? ' selected' : ''}>${etiquetaTipoTrabajo(t)}</option>`
             ).join('')}
           </select>`
        : `<label class="sgoi-swal-label">Prioridad</label>
           <select id="sgoi-prioridad" class="swal2-input">
             <option value="NORMAL"${it.prioridad === 'NORMAL' ? ' selected' : ''}>Normal</option>
             <option value="ALTA"${it.prioridad === 'ALTA' ? ' selected' : ''}>Alta</option>
             <option value="URGENTE"${it.prioridad === 'URGENTE' ? ' selected' : ''}>Urgente</option>
           </select>`;
    const estadosCerrados = esCaso
      ? [['RESUELTO', 'Resuelto'], ['PENDIENTE', 'Pendiente']]
      : esTrabajo
        ? [['HECHO', 'Hecho'], ['PENDIENTE', 'Pendiente']]
        : [['ABIERTO', 'Abierto'], ['HECHO', 'Hecho']];
    const estadoSelect = enCurso && (esCaso || esTrabajo)
      ? `<p class="sgoi-swal-hint">En curso: el cierre se hace desde el flotante.</p>`
      : `<label class="sgoi-swal-label">Estado</label>
         <select id="sgoi-estado" class="swal2-input">
           ${estadosCerrados.map(([v, l]) => `<option value="${v}"${it.estado === v ? ' selected' : ''}>${l}</option>`).join('')}
         </select>`;

    const result = await Swal.fire({
      title: `Editar ${it.codigo || 'pendiente'}`,
      html: `
        <label class="sgoi-swal-label">Título</label>
        <input id="sgoi-titulo" class="swal2-input" maxlength="200" value="${escapeHtml(it.titulo)}" />
        ${extraCampo}
        ${estadoSelect}
        <label class="sgoi-swal-label">${esCaso || esTrabajo ? 'Qué pasó' : 'Descripción'}</label>
        <textarea id="sgoi-nota" class="swal2-textarea" rows="4">${escapeHtml(it.nota || it.descripcion || '')}</textarea>
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      focusConfirm: false,
      preConfirm: () => {
        const titulo = document.getElementById('sgoi-titulo')?.value || '';
        const nota = document.getElementById('sgoi-nota')?.value || '';
        const prioridad = document.getElementById('sgoi-prioridad')?.value;
        const tipo = document.getElementById('sgoi-tipo')?.value;
        const estado = document.getElementById('sgoi-estado')?.value || it.estado;
        if (!titulo.trim()) {
          Swal.showValidationMessage('El título es obligatorio');
          return false;
        }
        return { titulo: titulo.trim(), nota, descripcion: nota, prioridad, tipo, estado };
      },
    });
    if (!result.isConfirmed || !result.value) return;
    try {
      const kind = it.kind || (vista === 'casos' ? 'CASO' : vista === 'trabajos' ? 'TRABAJO' : 'PENDIENTE');
      await api.put(`/sgoi/${rutaEntidad(kind)}/${it.id}`, result.value);
      notificarCambioSgoi();
      await cargar();
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
            <p>El flotante de la esquina inicia el reloj. Aquí ves, editas o eliminas todo lo registrado.</p>
          </div>
        </div>

        <nav className="sgoi-tabs" aria-label="Secciones de gestión operativa">
          <NavLink to="/admin/gestion-operativa" end className={({ isActive }) => `sgoi-tab ${isActive ? 'active' : ''}`}>
            <span className="sgoi-tab-ico" aria-hidden>📅</span>
            <span>Mi día</span>
          </NavLink>
          <NavLink to="/admin/gestion-operativa/tablero" className={({ isActive }) => `sgoi-tab ${isActive ? 'active' : ''}`}>
            <span className="sgoi-tab-ico" aria-hidden>📊</span>
            <span>Tablero</span>
          </NavLink>
          <NavLink to="/admin/gestion-operativa/casos" className={({ isActive }) => `sgoi-tab ${isActive ? 'active' : ''}`}>
            <span className="sgoi-tab-ico" aria-hidden>🚨</span>
            <span>Casos</span>
          </NavLink>
          <NavLink to="/admin/gestion-operativa/trabajos" className={({ isActive }) => `sgoi-tab ${isActive ? 'active' : ''}`}>
            <span className="sgoi-tab-ico" aria-hidden>🛠️</span>
            <span>Trabajos</span>
          </NavLink>
          <NavLink to="/admin/gestion-operativa/pendientes" className={({ isActive }) => `sgoi-tab ${isActive ? 'active' : ''}`}>
            <span className="sgoi-tab-ico" aria-hidden>📌</span>
            <span>Pendientes</span>
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
              <div className="sgoi-empty">Aún no hay movimientos este día. Usa el flotante de la esquina para registrar.</div>
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
                      <div className="sgoi-card-actions">
                        <button type="button" className="sgoi-btn sgoi-btn-ghost" onClick={() => editarRegistro({ ...it, kind: it.kind })}>
                          Editar
                        </button>
                        <button type="button" className="sgoi-btn sgoi-btn-danger" onClick={() => eliminarItem(it.kind, it.id, it.codigo || it.titulo)}>
                          Eliminar
                        </button>
                      </div>
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
                      {it.estado !== 'HECHO' ? (
                        <>
                          <button type="button" className="sgoi-btn sgoi-btn-caso" onClick={() => continuarPendiente(it.id, 'CASO')}>
                            Continuar como caso
                          </button>
                          <button type="button" className="sgoi-btn" onClick={() => continuarPendiente(it.id, 'TRABAJO')}>
                            Continuar como trabajo
                          </button>
                          <button type="button" className="sgoi-btn sgoi-btn-ghost" onClick={() => marcarHecho(it.id)}>
                            Marcar hecho
                          </button>
                        </>
                      ) : null}
                      <button type="button" className="sgoi-btn sgoi-btn-ghost" onClick={() => editarRegistro({ ...it, kind: 'PENDIENTE' })}>
                        Editar
                      </button>
                      <button type="button" className="sgoi-btn sgoi-btn-danger" onClick={() => eliminarItem('PENDIENTE', it.id, it.titulo)}>
                        Eliminar
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
                    <th>Acciones</th>
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
                      <td>
                        <div className="sgoi-card-actions">
                          <button type="button" className="sgoi-btn sgoi-btn-ghost" onClick={() => editarRegistro({ ...it, kind: vista === 'casos' ? 'CASO' : 'TRABAJO' })}>
                            Editar
                          </button>
                          <button type="button" className="sgoi-btn sgoi-btn-danger" onClick={() => eliminarItem(vista === 'casos' ? 'CASO' : 'TRABAJO', it.id, it.codigo || it.titulo)}>
                            Eliminar
                          </button>
                        </div>
                      </td>
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
