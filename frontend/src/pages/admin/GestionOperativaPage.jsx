import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import Swal from 'sweetalert2';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import {
  SGOI_TIPOS_FRANJA,
  etiquetaDiaCorto,
  etiquetaEstado,
  etiquetaTipoTrabajo,
  formatDuracionSeg,
  formatFechaCorta,
  formatHoraItem,
  notificarCambioSgoi,
} from '../../utils/sgoiFormat';
import './GestionOperativa.css';

const COLORES_TIPO = {
  DESARROLLO: '#2563eb',
  SOPORTE: '#0d9488',
  PAGOS: '#ca8a04',
  DESPLIEGUE: '#7c3aed',
  REUNION: '#db2777',
  DESCANSO: '#94a3b8',
  OTRO: '#64748b',
  CASO: '#dc2626',
};

const DIAS_SEMANA = [
  [1, 'Lunes'],
  [2, 'Martes'],
  [3, 'Miércoles'],
  [4, 'Jueves'],
  [5, 'Viernes'],
  [6, 'Sábado'],
  [7, 'Domingo'],
];

function vistaDesdePath(pathname) {
  if (pathname.endsWith('/tablero')) return 'tablero';
  if (pathname.endsWith('/horario')) return 'horario';
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

function IconEdit() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 20h9" strokeLinecap="round" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinejoin="round" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 7h16" strokeLinecap="round" />
      <path d="M9 7V5h6v2" />
      <path d="M6 7l1 13h10l1-13" strokeLinejoin="round" />
    </svg>
  );
}

function IconBtn({ title, onClick, danger, children }) {
  return (
    <button
      type="button"
      className={`sgoi-ico-btn ${danger ? 'is-danger' : ''}`}
      title={title}
      aria-label={title}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function opcionesTipo(selected) {
  return SGOI_TIPOS_FRANJA.map(
    (t) => `<option value="${t}"${t === selected ? ' selected' : ''}>${etiquetaTipoTrabajo(t)}</option>`
  ).join('');
}

function TooltipGestion({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="sgoi-chart-tip">
      {label ? <div className="sgoi-chart-tip-label">{label}</div> : null}
      {payload.map((entry) => (
        <div key={entry.dataKey || entry.name} className="sgoi-chart-tip-row">
          <span style={{ color: entry.color || entry.fill }}>{entry.name}</span>
          <strong>{entry.value}</strong>
        </div>
      ))}
    </div>
  );
}

export default function GestionOperativaPage() {
  const location = useLocation();
  const vista = vistaDesdePath(location.pathname);
  const [fecha, setFecha] = useState(fechaHoyLocal);
  const [dia, setDia] = useState({ bloques: [], casos_sueltos: [], items: [] });
  const [tablero, setTablero] = useState(null);
  const [horario, setHorario] = useState([]);
  const [lista, setLista] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nuevoPendiente, setNuevoPendiente] = useState('');

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      if (vista === 'dia') {
        const { data } = await api.get('/sgoi/dia', { params: { fecha } });
        setDia({
          bloques: Array.isArray(data.bloques) ? data.bloques : [],
          casos_sueltos: Array.isArray(data.casos_sueltos) ? data.casos_sueltos : [],
          items: Array.isArray(data.items) ? data.items : [],
        });
      } else if (vista === 'tablero') {
        const { data } = await api.get('/sgoi/tablero');
        setTablero(data);
      } else if (vista === 'horario') {
        const { data } = await api.get('/sgoi/horario');
        setHorario(Array.isArray(data.dias) ? data.dias : []);
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
  }, [vista, fecha]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    const onChange = () => cargar();
    window.addEventListener('sgoi-changed', onChange);
    return () => window.removeEventListener('sgoi-changed', onChange);
  }, [cargar]);

  const trabajosDia = useMemo(
    () => (dia.items || []).filter((it) => it.kind === 'TRABAJO'),
    [dia.items]
  );

  const r = tablero?.resumen;
  const dataDias = useMemo(
    () =>
      (tablero?.por_dia || []).map((d) => ({
        dia: etiquetaDiaCorto(d.fecha),
        Casos: d.casos,
        Trabajos: d.trabajos,
      })),
    [tablero]
  );
  const dataTipos = useMemo(() => {
    const src = tablero?.por_tipo || {};
    return Object.keys(src).map((k) => ({
      name: etiquetaTipoTrabajo(k),
      value: src[k],
      color: COLORES_TIPO[k] || COLORES_TIPO.OTRO,
    }));
  }, [tablero]);
  const dataTiempo = useMemo(() => {
    if (!r) return [];
    return [
      { name: 'Casos', minutos: Math.round((r.segundos_casos || 0) / 60), fill: COLORES_TIPO.CASO },
      { name: 'Trabajos', minutos: Math.round((r.segundos_trabajos || 0) / 60), fill: COLORES_TIPO.DESARROLLO },
    ];
  }, [r]);

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
             ${opcionesTipo(it.tipo || 'DESARROLLO')}
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
        ? (enCurso
          ? [['EN_CURSO', 'En curso'], ['HECHO', 'Hecho'], ['PENDIENTE', 'Pendiente']]
          : [['HECHO', 'Hecho'], ['PENDIENTE', 'Pendiente']])
        : [['ABIERTO', 'Abierto'], ['HECHO', 'Hecho']];
    const estadoSelect = enCurso && esCaso
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

  const editarFranja = async (bloque) => {
    const result = await Swal.fire({
      title: 'Cambiar franja',
      html: `
        <label class="sgoi-swal-label">Título</label>
        <input id="sgoi-titulo" class="swal2-input" maxlength="160" value="${escapeHtml(bloque.titulo)}" />
        <div class="sgoi-swal-row">
          <div>
            <label class="sgoi-swal-label">Desde</label>
            <input id="sgoi-hora-ini" class="swal2-input" type="time" value="${escapeHtml(bloque.hora_ini)}" />
          </div>
          <div>
            <label class="sgoi-swal-label">Hasta</label>
            <input id="sgoi-hora-fin" class="swal2-input" type="time" value="${escapeHtml(bloque.hora_fin)}" />
          </div>
        </div>
        <label class="sgoi-swal-label">Tipo</label>
        <select id="sgoi-tipo" class="swal2-input">${opcionesTipo(bloque.tipo || 'DESARROLLO')}</select>
        <p class="sgoi-swal-hint">Por defecto solo cambia este día. La plantilla semanal no se toca.</p>
        <div class="sgoi-swal-alcance">
          <label><input type="radio" name="sgoi-alcance" value="DIA" checked /> Solo este día</label>
          <label><input type="radio" name="sgoi-alcance" value="SIEMPRE" ${bloque.plantilla_id ? '' : 'disabled '}/> Para siempre (este día de la semana)</label>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      focusConfirm: false,
      width: 480,
      preConfirm: () => {
        const titulo = document.getElementById('sgoi-titulo')?.value || '';
        if (!titulo.trim()) {
          Swal.showValidationMessage('El título es obligatorio');
          return false;
        }
        const alcance = document.querySelector('input[name="sgoi-alcance"]:checked')?.value || 'DIA';
        return {
          titulo: titulo.trim(),
          hora_ini: document.getElementById('sgoi-hora-ini')?.value,
          hora_fin: document.getElementById('sgoi-hora-fin')?.value,
          tipo: document.getElementById('sgoi-tipo')?.value,
          alcance,
        };
      },
    });
    if (!result.isConfirmed || !result.value) return;
    try {
      await api.put(`/sgoi/horario/dia/${bloque.id}`, result.value);
      notificarCambioSgoi();
      await cargar();
      if (result.value.alcance === 'SIEMPRE') {
        Swal.fire({ icon: 'success', title: 'Plantilla actualizada', timer: 1400, showConfirmButton: false });
      }
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e?.response?.data?.error || e.message });
    }
  };

  const crearFranja = async () => {
    const result = await Swal.fire({
      title: 'Agregar franja de hoy',
      html: `
        <label class="sgoi-swal-label">Título</label>
        <input id="sgoi-titulo" class="swal2-input" maxlength="160" placeholder="Ej. Revisión de servidores" />
        <div class="sgoi-swal-row">
          <div>
            <label class="sgoi-swal-label">Desde</label>
            <input id="sgoi-hora-ini" class="swal2-input" type="time" value="08:00" />
          </div>
          <div>
            <label class="sgoi-swal-label">Hasta</label>
            <input id="sgoi-hora-fin" class="swal2-input" type="time" value="09:00" />
          </div>
        </div>
        <label class="sgoi-swal-label">Tipo</label>
        <select id="sgoi-tipo" class="swal2-input">${opcionesTipo('DESARROLLO')}</select>
        <p class="sgoi-swal-hint">Solo se agrega a este día. La plantilla semanal no cambia.</p>
      `,
      showCancelButton: true,
      confirmButtonText: 'Agregar',
      cancelButtonText: 'Cancelar',
      focusConfirm: false,
      preConfirm: () => {
        const titulo = document.getElementById('sgoi-titulo')?.value || '';
        if (!titulo.trim()) {
          Swal.showValidationMessage('El título es obligatorio');
          return false;
        }
        return {
          fecha,
          titulo: titulo.trim(),
          hora_ini: document.getElementById('sgoi-hora-ini')?.value,
          hora_fin: document.getElementById('sgoi-hora-fin')?.value,
          tipo: document.getElementById('sgoi-tipo')?.value,
        };
      },
    });
    if (!result.isConfirmed || !result.value) return;
    try {
      await api.post('/sgoi/horario/dia', result.value);
      notificarCambioSgoi();
      await cargar();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e?.response?.data?.error || e.message });
    }
  };

  const borrarFranja = async (bloque) => {
    const ok = await Swal.fire({
      icon: 'warning',
      title: 'Quitar franja de este día',
      text: 'La plantilla semanal no se modifica.',
      showCancelButton: true,
      confirmButtonText: 'Quitar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
    });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/sgoi/horario/dia/${bloque.id}`);
      notificarCambioSgoi();
      await cargar();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e?.response?.data?.error || e.message });
    }
  };

  const continuarPendiente = async (id, como) => {
    try {
      await api.post(`/sgoi/pendientes/${id}/continuar`, { como });
      notificarCambioSgoi();
      Swal.fire({
        icon: 'success',
        title: como === 'CASO' ? 'Caso en curso' : 'Registrado como trabajo',
        timer: 1400,
        showConfirmButton: false,
      });
      await cargar();
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

  const accionesRegistro = (it, kind) => (
    <div className="sgoi-ico-actions">
      <IconBtn title="Editar" onClick={() => editarRegistro({ ...it, kind })}>
        <IconEdit />
      </IconBtn>
      <IconBtn title="Eliminar" danger onClick={() => eliminarItem(kind, it.id, it.codigo || it.titulo)}>
        <IconTrash />
      </IconBtn>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="sgoi-page">
        <div className="sgoi-hero">
          <div>
            <p className="sgoi-hero-kicker">Sistemas · VanguardNet</p>
            <h1>Gestión operativa</h1>
            <p>El horario es el esqueleto del día. Si te interrumpen, el flotante atiende el caso sin romper la plantilla.</p>
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
          <NavLink to="/admin/gestion-operativa/horario" className={({ isActive }) => `sgoi-tab ${isActive ? 'active' : ''}`}>
            <span className="sgoi-tab-ico" aria-hidden>🗓️</span>
            <span>Horario</span>
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
              <button type="button" className="sgoi-btn sgoi-btn-ghost" onClick={crearFranja}>
                + Franja de hoy
              </button>
            </div>
            {dia.bloques.length === 0 && dia.items.length === 0 ? (
              <div className="sgoi-empty">
                Aún no hay horario para este día. Si acabas de activar el módulo, ejecuta la migración 081.
                Los casos se atienden desde el flotante.
              </div>
            ) : null}
            {dia.bloques.length > 0 ? (
              <ol className="sgoi-agenda">
                {dia.bloques.map((b) => (
                  <li key={b.id} className={`sgoi-slot sgoi-slot-${(b.tipo || 'OTRO').toLowerCase()} ${b.descanso ? 'is-descanso' : ''}`}>
                    <div className="sgoi-slot-time">
                      <strong>{b.hora_ini}</strong>
                      <span>{b.hora_fin}</span>
                    </div>
                    <div className="sgoi-slot-body">
                      <div className="sgoi-slot-top">
                        <span className="sgoi-badge" style={{ background: `${COLORES_TIPO[b.tipo] || COLORES_TIPO.OTRO}22`, color: COLORES_TIPO[b.tipo] || COLORES_TIPO.OTRO }}>
                          {etiquetaTipoTrabajo(b.tipo)}
                        </span>
                        <strong>{b.titulo}</strong>
                        <div className="sgoi-slot-actions">
                          <IconBtn title="Editar franja" onClick={() => editarFranja(b)}>
                            <IconEdit />
                          </IconBtn>
                          <IconBtn title="Quitar de este día" danger onClick={() => borrarFranja(b)}>
                            <IconTrash />
                          </IconBtn>
                        </div>
                      </div>
                      {(b.interrupciones || []).length > 0 ? (
                        <ul className="sgoi-inter">
                          {b.interrupciones.map((c) => (
                            <li key={c.id} className="sgoi-inter-item">
                              <span className="sgoi-badge sgoi-badge-caso">Caso</span>
                              <div>
                                <strong>{c.titulo}</strong>
                                <div className="sgoi-tl-meta">
                                  {c.codigo} · {formatHoraItem(c.inicio_at)}
                                  {c.fin_at ? ` – ${formatHoraItem(c.fin_at)}` : ' – …'}
                                  {c.estado !== 'EN_CURSO' ? ` · ${formatDuracionSeg(c.duracion_seg)}` : ''}
                                  {' · '}
                                  {etiquetaEstado(c.estado)}
                                </div>
                                {c.nota ? <p className="sgoi-tl-nota">{c.nota}</p> : null}
                              </div>
                              {accionesRegistro(c, 'CASO')}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="sgoi-slot-quiet">Sin interrupciones en esta franja.</p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            ) : null}
            {dia.casos_sueltos.length > 0 ? (
              <section className="sgoi-block">
                <h2>Casos fuera de horario</h2>
                <ul className="sgoi-entity-list">
                  {dia.casos_sueltos.map((c) => (
                    <li key={c.id} className="sgoi-entity is-caso">
                      <div>
                        <div className="sgoi-entity-top">
                          <span className="sgoi-badge sgoi-badge-caso">Caso</span>
                          <strong>{c.titulo}</strong>
                          <span className={`sgoi-st sgoi-st-${c.estado}`}>{etiquetaEstado(c.estado)}</span>
                        </div>
                        <div className="sgoi-tl-meta">
                          {c.codigo} · {formatHoraItem(c.inicio_at)}
                          {c.estado !== 'EN_CURSO' ? ` · ${formatDuracionSeg(c.duracion_seg)}` : ''}
                        </div>
                      </div>
                      {accionesRegistro(c, 'CASO')}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {trabajosDia.length > 0 ? (
              <section className="sgoi-block">
                <h2>Trabajos registrados</h2>
                <ul className="sgoi-entity-list">
                  {trabajosDia.map((it) => (
                    <li key={it.id} className="sgoi-entity is-trabajo">
                      <div>
                        <div className="sgoi-entity-top">
                          <span className="sgoi-badge">{etiquetaTipoTrabajo(it.tipo)}</span>
                          <strong>{it.titulo}</strong>
                          <span className={`sgoi-st sgoi-st-${it.estado}`}>{etiquetaEstado(it.estado)}</span>
                        </div>
                        <div className="sgoi-tl-meta">
                          {it.codigo} · {formatHoraItem(it.inicio_at)}
                          {it.estado !== 'EN_CURSO' ? ` · ${formatDuracionSeg(it.duracion_seg)}` : ''}
                        </div>
                      </div>
                      {accionesRegistro(it, 'TRABAJO')}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : vista === 'tablero' ? (
          <>
            <p className="sgoi-range">
              Semana {formatFechaCorta(tablero?.desde)} – {formatFechaCorta(tablero?.hasta)}
            </p>
            <div className="sgoi-kpis">
              <div className="sgoi-kpi sgoi-kpi-casos">
                <span>Casos</span>
                <strong>{r?.casos_total ?? 0}</strong>
                <small>{r?.casos_resueltos ?? 0} resueltos · {r?.casos_pendientes ?? 0} pendientes</small>
              </div>
              <div className="sgoi-kpi sgoi-kpi-trab">
                <span>Trabajos</span>
                <strong>{r?.trabajos_total ?? 0}</strong>
                <small>{r?.trabajos_hechos ?? 0} hechos</small>
              </div>
              <div className="sgoi-kpi">
                <span>Tiempo en casos</span>
                <strong>{formatDuracionSeg(r?.segundos_casos)}</strong>
                <small>atención e interrupciones</small>
              </div>
              <div className="sgoi-kpi">
                <span>Tiempo en trabajos</span>
                <strong>{formatDuracionSeg(r?.segundos_trabajos)}</strong>
                <small>desarrollo, soporte y pagos</small>
              </div>
              <div className="sgoi-kpi">
                <span>Pendientes</span>
                <strong>{r?.pendientes_abiertos ?? 0}</strong>
                <small>siguen abiertos</small>
              </div>
            </div>
            <div className="sgoi-charts">
              <section className="sgoi-chart-card sgoi-chart-wide">
                <h2>Movimiento de la semana</h2>
                <p>Cantidad real de casos y trabajos por día.</p>
                <div className="sgoi-chart-body">
                  {dataDias.some((d) => d.Casos || d.Trabajos) ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dataDias} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="dia" tick={{ fontSize: 11, fill: '#64748b' }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} width={28} />
                        <Tooltip content={<TooltipGestion />} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="Casos" fill={COLORES_TIPO.CASO} radius={[5, 5, 0, 0]} maxBarSize={26} />
                        <Bar dataKey="Trabajos" fill={COLORES_TIPO.DESARROLLO} radius={[5, 5, 0, 0]} maxBarSize={26} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="sgoi-empty">Sin movimientos esta semana.</div>
                  )}
                </div>
              </section>
              <section className="sgoi-chart-card">
                <h2>Trabajos por tipo</h2>
                <p>Distribución de lo registrado.</p>
                <div className="sgoi-chart-body sgoi-chart-pie">
                  {dataTipos.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={dataTipos} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={2}>
                          {dataTipos.map((d) => (
                            <Cell key={d.name} fill={d.color} />
                          ))}
                        </Pie>
                        <Tooltip content={<TooltipGestion />} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="sgoi-empty">Aún no hay trabajos en el rango.</div>
                  )}
                </div>
              </section>
              <section className="sgoi-chart-card">
                <h2>Minutos invertidos</h2>
                <p>Casos vs trabajos (duración cerrada).</p>
                <div className="sgoi-chart-body">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dataTiempo} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#334155' }} width={72} />
                      <Tooltip content={<TooltipGestion />} />
                      <Bar dataKey="minutos" name="Minutos" radius={[0, 6, 6, 0]} maxBarSize={22}>
                        {dataTiempo.map((d) => (
                          <Cell key={d.name} fill={d.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            </div>
            {tablero?.en_curso?.length ? (
              <section className="sgoi-block">
                <h2>Ahora mismo</h2>
                <ul className="sgoi-entity-list">
                  {tablero.en_curso.map((it) => (
                    <li key={`${it.kind}-${it.id}`} className={`sgoi-entity ${it.kind === 'CASO' ? 'is-caso' : 'is-trabajo'}`}>
                      <div>
                        <div className="sgoi-entity-top">
                          <span className={`sgoi-badge ${it.kind === 'CASO' ? 'sgoi-badge-caso' : ''}`}>
                            {it.kind === 'CASO' ? 'Caso' : 'Trabajo'}
                          </span>
                          <strong>{it.titulo}</strong>
                          <span className="sgoi-st sgoi-st-EN_CURSO">En curso</span>
                        </div>
                        <div className="sgoi-tl-meta">{it.codigo}</div>
                      </div>
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
                <ul className="sgoi-entity-list">
                  {tablero.recientes.map((it) => (
                    <li key={`${it.kind}-${it.id}`} className={`sgoi-entity ${it.kind === 'CASO' ? 'is-caso' : 'is-trabajo'}`}>
                      <div>
                        <div className="sgoi-entity-top">
                          <span className={`sgoi-badge ${it.kind === 'CASO' ? 'sgoi-badge-caso' : ''}`}>
                            {it.kind === 'CASO' ? 'Caso' : etiquetaTipoTrabajo(it.tipo) || 'Trabajo'}
                          </span>
                          <strong>{it.titulo}</strong>
                          <span className={`sgoi-st sgoi-st-${it.estado}`}>{etiquetaEstado(it.estado)}</span>
                        </div>
                        <div className="sgoi-tl-meta">
                          {it.codigo} · {formatHoraItem(it.inicio_at)}
                          {it.duracion_seg ? ` · ${formatDuracionSeg(it.duracion_seg)}` : ''}
                        </div>
                      </div>
                      {accionesRegistro(it, it.kind)}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : vista === 'horario' ? (
          <>
            <p className="sgoi-range">Plantilla semanal. Si cambias una franja en Mi día, elige “para siempre” solo cuando quieras actualizar este horario.</p>
            <div className="sgoi-week">
              {DIAS_SEMANA.map(([wd, nombre]) => {
                const bloques = horario.find((d) => Number(d.weekday) === wd)?.bloques || [];
                return (
                  <section key={wd} className="sgoi-week-day">
                    <h2>{nombre}</h2>
                    {bloques.length === 0 ? (
                      <p className="sgoi-slot-quiet">Sin franjas</p>
                    ) : (
                      bloques.map((b) => (
                        <div key={b.id} className="sgoi-week-slot">
                          <span>{b.hora_ini}–{b.hora_fin}</span>
                          <strong>{b.titulo}</strong>
                          <em>{etiquetaTipoTrabajo(b.tipo)}</em>
                        </div>
                      ))
                    )}
                  </section>
                );
              })}
            </div>
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
              <ul className="sgoi-entity-list">
                {lista.map((it) => (
                  <li key={it.id} className="sgoi-entity is-pendiente">
                    <div>
                      <div className="sgoi-entity-top">
                        <span className={`sgoi-st sgoi-st-${it.estado}`}>{etiquetaEstado(it.estado)}</span>
                        <strong>{it.titulo}</strong>
                      </div>
                      <div className="sgoi-tl-meta">{it.usuario_nombre || ''}</div>
                      {it.descripcion ? <p className="sgoi-tl-nota">{it.descripcion}</p> : null}
                      {it.estado !== 'HECHO' ? (
                        <div className="sgoi-card-actions">
                          <button type="button" className="sgoi-btn sgoi-btn-caso" onClick={() => continuarPendiente(it.id, 'CASO')}>
                            Atender como caso
                          </button>
                          <button type="button" className="sgoi-btn" onClick={() => continuarPendiente(it.id, 'TRABAJO')}>
                            Registrar como trabajo
                          </button>
                          <button type="button" className="sgoi-btn sgoi-btn-ghost" onClick={() => marcarHecho(it.id)}>
                            Marcar hecho
                          </button>
                        </div>
                      ) : null}
                    </div>
                    {accionesRegistro(it, 'PENDIENTE')}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : lista.length === 0 ? (
          <div className="sgoi-empty">No hay registros todavía.</div>
        ) : (
          <ul className="sgoi-entity-list">
            {lista.map((it) => {
              const kind = vista === 'casos' ? 'CASO' : 'TRABAJO';
              return (
                <li key={it.id} className={`sgoi-entity ${kind === 'CASO' ? 'is-caso' : 'is-trabajo'}`}>
                  <div>
                    <div className="sgoi-entity-top">
                      <span className={`sgoi-badge ${kind === 'CASO' ? 'sgoi-badge-caso' : ''}`}>
                        {it.codigo}
                      </span>
                      <strong>{it.titulo}</strong>
                      <span className={`sgoi-st sgoi-st-${it.estado}`}>{etiquetaEstado(it.estado)}</span>
                    </div>
                    <div className="sgoi-tl-meta">
                      {it.tipo ? `${etiquetaTipoTrabajo(it.tipo)} · ` : ''}
                      {formatFechaCorta(it.inicio_at)} {formatHoraItem(it.inicio_at)}
                      {it.estado === 'EN_CURSO' ? '' : ` · ${formatDuracionSeg(it.duracion_seg)}`}
                      {it.usuario_nombre ? ` · ${it.usuario_nombre}` : ''}
                    </div>
                    {it.nota ? <p className="sgoi-tl-nota">{it.nota}</p> : null}
                  </div>
                  {accionesRegistro(it, kind)}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </DashboardLayout>
  );
}
