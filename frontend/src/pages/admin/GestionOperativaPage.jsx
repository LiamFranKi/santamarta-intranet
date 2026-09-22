import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Navigate, useLocation } from 'react-router-dom';
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
import { useAuth } from '../../context/AuthContext';
import { useColegio } from '../../context/ColegioContext';
import api from '../../services/api';
import {
  SGOI_TIPOS_FRANJA,
  etiquetaDiaCorto,
  etiquetaDiaLargo,
  etiquetaEstado,
  etiquetaTipoTrabajo,
  formatDuracionSeg,
  formatFechaCorta,
  formatHoraItem,
  nombrePersonaSgoi,
  notificarCambioSgoi,
  usuarioPuedeHorarioSgoi,
  usuarioVeAreaSgoi,
  idUsuarioSesion,
  esRegistroSgoiPropio,
  colorFranjaIgual,
} from '../../utils/sgoiFormat';
import { exportarHorarioSgoiPdf } from '../../utils/sgoiHorarioPdf';
import { exportarReporteSgoiPdf } from '../../utils/sgoiReportePdf';
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
  if (pathname.endsWith('/reporte')) return 'reporte';
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

function htmlFilaPlantilla(b = {}) {
  return `<div class="sgoi-day-row">
    <input type="time" class="sgoi-r-ini" value="${escapeHtml(b.hora_ini || '08:00')}" />
    <input type="time" class="sgoi-r-fin" value="${escapeHtml(b.hora_fin || '09:00')}" />
    <input type="text" class="sgoi-r-tit" maxlength="160" placeholder="Actividad" value="${escapeHtml(b.titulo || '')}" />
    <select class="sgoi-r-tipo">${opcionesTipo(b.tipo || 'DESARROLLO')}</select>
    <button type="button" class="sgoi-r-del" title="Quitar franja">×</button>
  </div>`;
}

function leerFilasPlantilla() {
  return Array.from(document.querySelectorAll('#sgoi-day-rows .sgoi-day-row')).map((row) => ({
    hora_ini: row.querySelector('.sgoi-r-ini')?.value,
    hora_fin: row.querySelector('.sgoi-r-fin')?.value,
    titulo: (row.querySelector('.sgoi-r-tit')?.value || '').trim(),
    tipo: row.querySelector('.sgoi-r-tipo')?.value || 'DESARROLLO',
  })).filter((b) => b.titulo);
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
  const { user } = useAuth();
  const { textoIntranet } = useColegio();
  const vista = vistaDesdePath(location.pathname);
  const puedeHorario = usuarioPuedeHorarioSgoi(user?.tipo);
  const veArea = usuarioVeAreaSgoi(user?.tipo);
  const miUsuarioId = idUsuarioSesion(user);
  const [fecha, setFecha] = useState(fechaHoyLocal);
  const [dia, setDia] = useState({ bloques: [], casos_sueltos: [], items: [] });
  const [tablero, setTablero] = useState(null);
  const [horario, setHorario] = useState([]);
  const [horarioUsuario, setHorarioUsuario] = useState('');
  const [reporte, setReporte] = useState(null);
  const [periodoReporte, setPeriodoReporte] = useState('semana');
  const [fechaReporte, setFechaReporte] = useState(fechaHoyLocal);
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
      } else if (vista === 'reporte') {
        const { data } = await api.get('/sgoi/reporte', {
          params: { periodo: periodoReporte, fecha: fechaReporte },
        });
        setReporte(data);
      } else if (vista === 'horario') {
        if (!puedeHorario) return;
        const { data } = await api.get('/sgoi/horario');
        setHorario(Array.isArray(data.dias) ? data.dias : []);
        setHorarioUsuario(data?.usuario?.nombre || '');
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
  }, [vista, fecha, puedeHorario, periodoReporte, fechaReporte]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    const onChange = () => cargar();
    window.addEventListener('sgoi-changed', onChange);
    return () => window.removeEventListener('sgoi-changed', onChange);
  }, [cargar]);

  const incidenciasDia = useMemo(
    () =>
      (dia.items || []).filter((it) => {
        if (it.kind !== 'CASO') return false;
        if (veArea) return true;
        return Number(it.usuario_id) === miUsuarioId;
      }),
    [dia.items, veArea, miUsuarioId]
  );

  const listaPropia = useMemo(() => {
    if (veArea) return lista;
    return (lista || []).filter((it) => Number(it.usuario_id) === miUsuarioId);
  }, [lista, veArea, miUsuarioId]);

  const soloMios = (arr) => {
    const list = Array.isArray(arr) ? arr : [];
    if (veArea) return list;
    return list.filter((it) => Number(it.usuario_id) === miUsuarioId);
  };

  const r = tablero?.resumen;
  const rr = reporte?.resumen;
  const dataDias = useMemo(
    () =>
      (tablero?.por_dia || []).map((d) => ({
        dia: etiquetaDiaCorto(d.fecha),
        Incidencias: d.casos,
      })),
    [tablero]
  );
  const dataEstados = useMemo(() => {
    if (!r) return [];
    return [
      { name: 'Resueltos', value: r.casos_resueltos || 0, color: '#16a34a' },
      { name: 'Pendientes', value: r.casos_pendientes || 0, color: '#ca8a04' },
      { name: 'En curso', value: r.casos_en_curso || 0, color: '#d97706' },
    ].filter((d) => d.value > 0);
  }, [r]);
  const dataMinutosDia = useMemo(
    () =>
      (tablero?.por_dia || []).map((d) => ({
        dia: etiquetaDiaCorto(d.fecha),
        Minutos: Math.round((d.seg_casos || 0) / 60),
      })),
    [tablero]
  );
  const dataDiasReporte = useMemo(
    () =>
      (reporte?.por_dia || []).map((d) => ({
        dia: etiquetaDiaCorto(d.fecha),
        Incidencias: d.casos,
      })),
    [reporte]
  );
  const dataEstadosReporte = useMemo(() => {
    if (!rr) return [];
    return [
      { name: 'Resueltas', value: rr.casos_resueltos || 0, color: '#16a34a' },
      { name: 'Pendientes', value: rr.casos_pendientes || 0, color: '#ca8a04' },
      { name: 'En curso', value: rr.casos_en_curso || 0, color: '#d97706' },
    ].filter((d) => d.value > 0);
  }, [rr]);
  const dataMinutosReporte = useMemo(
    () =>
      (reporte?.por_dia || []).map((d) => ({
        dia: etiquetaDiaCorto(d.fecha),
        Minutos: Math.round((d.seg_casos || 0) / 60),
      })),
    [reporte]
  );
  const nombreReporte = useMemo(
    () => nombrePersonaSgoi(user, reporte?.usuario?.nombre),
    [user, reporte]
  );
  const nombreHorarioPdf = useMemo(
    () => nombrePersonaSgoi(user, horarioUsuario),
    [user, horarioUsuario]
  );

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

  const editarFranjaPlantilla = async (bloque) => {
    const result = await Swal.fire({
      title: 'Editar franja de la plantilla',
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
        <p class="sgoi-swal-hint">Cambia la plantilla de este día de la semana (para siempre). Mi día de hoy no se reescribe.</p>
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
        return {
          titulo: titulo.trim(),
          hora_ini: document.getElementById('sgoi-hora-ini')?.value,
          hora_fin: document.getElementById('sgoi-hora-fin')?.value,
          tipo: document.getElementById('sgoi-tipo')?.value,
        };
      },
    });
    if (!result.isConfirmed || !result.value) return;
    try {
      await api.put(`/sgoi/horario/plantilla/${bloque.id}`, result.value);
      notificarCambioSgoi();
      await cargar();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e?.response?.data?.error || e.message });
    }
  };

  const borrarFranjaPlantilla = async (bloque) => {
    const ok = await Swal.fire({
      icon: 'warning',
      title: 'Quitar de la plantilla',
      text: 'Se elimina de este día de la semana para siempre. Los días ya pasados no se tocan.',
      showCancelButton: true,
      confirmButtonText: 'Quitar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
    });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/sgoi/horario/plantilla/${bloque.id}`);
      notificarCambioSgoi();
      await cargar();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e?.response?.data?.error || e.message });
    }
  };

  const agregarFranjaPlantilla = async (weekday, nombre) => {
    const result = await Swal.fire({
      title: `Nueva franja · ${nombre}`,
      html: `
        <label class="sgoi-swal-label">Título</label>
        <input id="sgoi-titulo" class="swal2-input" maxlength="160" placeholder="Ej. Testing" />
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
          weekday,
          titulo: titulo.trim(),
          hora_ini: document.getElementById('sgoi-hora-ini')?.value,
          hora_fin: document.getElementById('sgoi-hora-fin')?.value,
          tipo: document.getElementById('sgoi-tipo')?.value,
        };
      },
    });
    if (!result.isConfirmed || !result.value) return;
    try {
      await api.post('/sgoi/horario/plantilla', result.value);
      notificarCambioSgoi();
      await cargar();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e?.response?.data?.error || e.message });
    }
  };

  const editarDiaPlantilla = async (weekday, nombre, bloques) => {
    const iniciales = bloques.length ? bloques : [{ hora_ini: '08:00', hora_fin: '09:00', titulo: '', tipo: 'DESARROLLO' }];
    const result = await Swal.fire({
      title: `Editar ${nombre}`,
      html: `
        <p class="sgoi-swal-hint">Reemplaza todas las franjas de este día en la plantilla semanal.</p>
        <div id="sgoi-day-rows">${iniciales.map((b) => htmlFilaPlantilla(b)).join('')}</div>
        <button type="button" id="sgoi-add-row" class="sgoi-btn sgoi-btn-ghost">+ Franja</button>
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar día',
      cancelButtonText: 'Cancelar',
      width: 640,
      focusConfirm: false,
      didOpen: () => {
        const box = document.getElementById('sgoi-day-rows');
        document.getElementById('sgoi-add-row')?.addEventListener('click', () => {
          box.insertAdjacentHTML('beforeend', htmlFilaPlantilla());
        });
        box.addEventListener('click', (ev) => {
          const btn = ev.target.closest('.sgoi-r-del');
          if (!btn) return;
          const rows = box.querySelectorAll('.sgoi-day-row');
          if (rows.length <= 1) return;
          btn.closest('.sgoi-day-row')?.remove();
        });
      },
      preConfirm: () => {
        const filas = leerFilasPlantilla();
        if (!filas.length) {
          Swal.showValidationMessage('Deja al menos una franja con título');
          return false;
        }
        return { bloques: filas };
      },
    });
    if (!result.isConfirmed || !result.value) return;
    try {
      await api.put(`/sgoi/horario/semana/${weekday}`, result.value);
      notificarCambioSgoi();
      await cargar();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e?.response?.data?.error || e.message });
    }
  };

  const exportarHorarioPdf = async () => {
    try {
      await exportarHorarioSgoiPdf(horario, { nombre: nombreHorarioPdf });
    } catch (e) {
      Swal.fire({ icon: 'info', title: 'PDF', text: e.message || 'No se pudo exportar.' });
    }
  };

  const exportarReportePdf = async () => {
    try {
      await exportarReporteSgoiPdf({
        reporte,
        periodo: periodoReporte,
        nombre: nombreReporte,
      });
    } catch (e) {
      Swal.fire({ icon: 'info', title: 'PDF', text: e.message || 'No se pudo exportar.' });
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

  const accionesRegistro = (it, kind) => {
    if (!veArea && !esRegistroSgoiPropio(it, user)) return null;
    return (
    <div className="sgoi-ico-actions">
      <IconBtn title="Editar" onClick={() => editarRegistro({ ...it, kind })}>
        <IconEdit />
      </IconBtn>
      <IconBtn title="Eliminar" danger onClick={() => eliminarItem(kind, it.id, it.codigo || it.titulo)}>
        <IconTrash />
      </IconBtn>
    </div>
    );
  };

  if ((vista === 'horario' && !puedeHorario) || vista === 'trabajos') {
    return (
      <DashboardLayout>
        <Navigate to="/admin/gestion-operativa" replace />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="sgoi-page">
        <div className="sgoi-hero">
          <div>
            <p className="sgoi-hero-kicker">Sistemas · {(textoIntranet || '').trim() || 'VanguardNet'}</p>
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
          <NavLink to="/admin/gestion-operativa/reporte" className={({ isActive }) => `sgoi-tab ${isActive ? 'active' : ''}`}>
            <span className="sgoi-tab-ico" aria-hidden>📄</span>
            <span>Reporte</span>
          </NavLink>
          {puedeHorario ? (
            <NavLink to="/admin/gestion-operativa/horario" className={({ isActive }) => `sgoi-tab ${isActive ? 'active' : ''}`}>
              <span className="sgoi-tab-ico" aria-hidden>🗓️</span>
              <span>Horario</span>
            </NavLink>
          ) : null}
          <NavLink to="/admin/gestion-operativa/casos" className={({ isActive }) => `sgoi-tab ${isActive ? 'active' : ''}`}>
            <span className="sgoi-tab-ico" aria-hidden>🚨</span>
            <span>Casos</span>
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
              {puedeHorario ? (
                <button type="button" className="sgoi-btn sgoi-btn-ghost" onClick={crearFranja}>
                  + Franja de hoy
                </button>
              ) : null}
              {incidenciasDia.length > 0 ? (
                <div className="sgoi-chip sgoi-chip-inc">
                  {incidenciasDia.length} incidencia{incidenciasDia.length === 1 ? '' : 's'} hoy
                </div>
              ) : null}
            </div>
            {dia.bloques.length === 0 && dia.items.length === 0 ? (
              <div className="sgoi-empty">
                {puedeHorario
                  ? 'Aún no hay horario para este día. Si acabas de activar el módulo, ejecuta la migración 081. Los casos se atienden desde el flotante.'
                  : 'Aún no hay movimientos este día. Los casos se atienden desde el flotante.'}
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
                        {(b.interrupciones || []).length > 0 ? (
                          <span className="sgoi-badge sgoi-badge-caso">
                            {b.interrupciones.length} incidencia{b.interrupciones.length === 1 ? '' : 's'}
                          </span>
                        ) : null}
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
                              <span className="sgoi-badge sgoi-badge-caso">Incidencia</span>
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
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            ) : null}
            {soloMios(dia.casos_sueltos).length > 0 ? (
              <section className="sgoi-block">
                <h2>Incidencias fuera de horario</h2>
                <ul className="sgoi-entity-list">
                  {soloMios(dia.casos_sueltos).map((c) => (
                    <li key={c.id} className="sgoi-entity is-caso">
                      <div>
                        <div className="sgoi-entity-top">
                          <span className="sgoi-badge sgoi-badge-caso">Incidencia</span>
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
          </>
        ) : vista === 'tablero' ? (
          <>
            <p className="sgoi-range">
              Semana {formatFechaCorta(tablero?.desde)} – {formatFechaCorta(tablero?.hasta)}
            </p>
            <div className="sgoi-kpis">
              <div className="sgoi-kpi sgoi-kpi-casos">
                <span>Incidencias</span>
                <strong>{r?.casos_total ?? 0}</strong>
                <small>{r?.casos_resueltos ?? 0} resueltas · {r?.casos_pendientes ?? 0} pendientes</small>
              </div>
              <div className="sgoi-kpi">
                <span>Tiempo en incidencias</span>
                <strong>{formatDuracionSeg(r?.segundos_casos)}</strong>
                <small>atención registrada</small>
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
                <p>Incidencias (casos) por día.</p>
                <div className="sgoi-chart-body">
                  {dataDias.some((d) => d.Incidencias) ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dataDias} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="dia" tick={{ fontSize: 11, fill: '#64748b' }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} width={28} />
                        <Tooltip content={<TooltipGestion />} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="Incidencias" fill={COLORES_TIPO.CASO} radius={[5, 5, 0, 0]} maxBarSize={32} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="sgoi-empty">Sin incidencias esta semana.</div>
                  )}
                </div>
              </section>
              <section className="sgoi-chart-card">
                <h2>Estado de incidencias</h2>
                <p>Resueltas, pendientes y en curso.</p>
                <div className="sgoi-chart-body sgoi-chart-pie">
                  {dataEstados.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={dataEstados} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={2}>
                          {dataEstados.map((d) => (
                            <Cell key={d.name} fill={d.color} />
                          ))}
                        </Pie>
                        <Tooltip content={<TooltipGestion />} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="sgoi-empty">Aún no hay incidencias en el rango.</div>
                  )}
                </div>
              </section>
              <section className="sgoi-chart-card">
                <h2>Minutos de atención</h2>
                <p>Duración de incidencias por día.</p>
                <div className="sgoi-chart-body">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dataMinutosDia} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="dia" tick={{ fontSize: 11, fill: '#64748b' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#64748b' }} width={32} />
                      <Tooltip content={<TooltipGestion />} />
                      <Bar dataKey="Minutos" fill="#1d4ed8" radius={[5, 5, 0, 0]} maxBarSize={32} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            </div>
            {soloMios(tablero?.en_curso?.filter((it) => it.kind === 'CASO')).length ? (
              <section className="sgoi-block">
                <h2>Ahora mismo</h2>
                <ul className="sgoi-entity-list">
                  {soloMios(tablero.en_curso.filter((it) => it.kind === 'CASO')).map((it) => (
                    <li key={`${it.kind}-${it.id}`} className="sgoi-entity is-caso">
                      <div>
                        <div className="sgoi-entity-top">
                          <span className="sgoi-badge sgoi-badge-caso">Incidencia</span>
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
              {(soloMios((tablero?.recientes || []).filter((it) => it.kind === 'CASO'))).length === 0 ? (
                <div className="sgoi-empty">Sin incidencias esta semana.</div>
              ) : (
                <ul className="sgoi-entity-list">
                  {soloMios(tablero.recientes.filter((it) => it.kind === 'CASO')).map((it) => (
                    <li key={`${it.kind}-${it.id}`} className="sgoi-entity is-caso">
                      <div>
                        <div className="sgoi-entity-top">
                          <span className="sgoi-badge sgoi-badge-caso">Incidencia</span>
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
        ) : vista === 'reporte' ? (
          <>
            <div className="sgoi-toolbar">
              <div className="sgoi-seg" role="group" aria-label="Periodo del reporte">
                {[['dia', 'Día'], ['semana', 'Semana'], ['mes', 'Mes']].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`sgoi-seg-btn ${periodoReporte === id ? 'active' : ''}`}
                    onClick={() => setPeriodoReporte(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label>
                {periodoReporte === 'dia' ? 'Fecha' : periodoReporte === 'mes' ? 'Mes (cualquier día)' : 'Semana (cualquier día)'}
                <input type="date" value={fechaReporte} onChange={(e) => setFechaReporte(e.target.value)} />
              </label>
              <button type="button" className="sgoi-btn sgoi-toolbar-export" onClick={exportarReportePdf}>
                Exportar PDF
              </button>
            </div>
            <p className="sgoi-range">
              {periodoReporte === 'dia' ? 'Reporte del día' : periodoReporte === 'mes' ? 'Reporte mensual' : 'Reporte semanal'}
              {nombreReporte ? ` · ${nombreReporte}` : ''}
              {' · '}
              {formatFechaCorta(reporte?.desde)}
              {reporte?.desde !== reporte?.hasta ? ` – ${formatFechaCorta(reporte?.hasta)}` : ''}
            </p>
            <div className="sgoi-kpis">
              <div className="sgoi-kpi sgoi-kpi-casos">
                <span>Incidencias</span>
                <strong>{rr?.casos_total ?? 0}</strong>
                <small>{rr?.casos_resueltos ?? 0} resueltas · {rr?.casos_pendientes ?? 0} pendientes</small>
              </div>
              <div className="sgoi-kpi">
                <span>Tiempo en incidencias</span>
                <strong>{formatDuracionSeg(rr?.segundos_casos)}</strong>
                <small>atención registrada</small>
              </div>
              <div className="sgoi-kpi">
                <span>Días con actividad</span>
                <strong>{rr?.dias_con_actividad ?? 0}</strong>
                <small>en el periodo</small>
              </div>
            </div>
            {(reporte?.dias || []).length === 0 ? (
              <div className="sgoi-empty">No hay horario ni incidencias en este periodo.</div>
            ) : (
              (reporte.dias || []).map((d) => (
                <section key={d.fecha} className="sgoi-report-day">
                  <h2>{etiquetaDiaLargo(d.fecha)}</h2>
                  {(d.bloques || []).length > 0 ? (
                    <ol className="sgoi-agenda sgoi-agenda-report">
                      {d.bloques.map((b) => (
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
                              {(b.interrupciones || []).length > 0 ? (
                                <span className="sgoi-badge sgoi-badge-caso">
                                  {b.interrupciones.length} incidencia{b.interrupciones.length === 1 ? '' : 's'}
                                </span>
                              ) : null}
                            </div>
                            {(b.interrupciones || []).length > 0 ? (
                              <ul className="sgoi-inter">
                                {b.interrupciones.map((c) => (
                                  <li key={c.id} className="sgoi-inter-item">
                                    <span className="sgoi-badge sgoi-badge-caso">Incidencia</span>
                                    <div>
                                      <strong>{c.titulo}</strong>
                                      <div className="sgoi-tl-meta">
                                        {c.codigo} · {formatHoraItem(c.inicio_at)}
                                        {c.fin_at ? ` – ${formatHoraItem(c.fin_at)}` : ' – …'}
                                        {c.estado !== 'EN_CURSO' ? ` · ${formatDuracionSeg(c.duracion_seg)}` : ''}
                                        {' · '}
                                        {etiquetaEstado(c.estado)}
                                        {c.usuario_nombre ? ` · ${c.usuario_nombre}` : ''}
                                      </div>
                                      {c.nota ? <p className="sgoi-tl-nota">{c.nota}</p> : null}
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                  {(soloMios(d.casos_sueltos).length > 0 || (!(d.bloques || []).length && soloMios(d.casos).length > 0)) ? (
                    <>
                      <h3>{(d.bloques || []).length ? 'Incidencias fuera de horario' : 'Incidencias'}</h3>
                      <ul className="sgoi-entity-list">
                        {soloMios((d.bloques || []).length ? d.casos_sueltos : d.casos).map((c) => (
                          <li key={c.id} className="sgoi-entity is-caso">
                            <div>
                              <div className="sgoi-entity-top">
                                <span className="sgoi-badge sgoi-badge-caso">{c.codigo}</span>
                                <strong>{c.titulo}</strong>
                                <span className={`sgoi-st sgoi-st-${c.estado}`}>{etiquetaEstado(c.estado)}</span>
                              </div>
                              <div className="sgoi-tl-meta">
                                {formatHoraItem(c.inicio_at)}
                                {c.fin_at ? ` – ${formatHoraItem(c.fin_at)}` : ''}
                                {c.estado !== 'EN_CURSO' ? ` · ${formatDuracionSeg(c.duracion_seg)}` : ''}
                                {c.usuario_nombre ? ` · ${c.usuario_nombre}` : ''}
                              </div>
                              {c.nota ? <p className="sgoi-tl-nota">{c.nota}</p> : null}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </section>
              ))
            )}
            <h2 className="sgoi-report-charts-title">Gráficos del periodo</h2>
            <div className="sgoi-charts">
              <section className="sgoi-chart-card sgoi-chart-wide">
                <h2>Incidencias por día</h2>
                <p>Cantidad real registrada en el periodo.</p>
                <div className="sgoi-chart-body">
                  {dataDiasReporte.some((d) => d.Incidencias) ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dataDiasReporte} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="dia" tick={{ fontSize: 11, fill: '#64748b' }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} width={28} />
                        <Tooltip content={<TooltipGestion />} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="Incidencias" fill={COLORES_TIPO.CASO} radius={[5, 5, 0, 0]} maxBarSize={32} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="sgoi-empty">Sin datos para graficar.</div>
                  )}
                </div>
              </section>
              <section className="sgoi-chart-card">
                <h2>Estado de incidencias</h2>
                <p>Resueltas, pendientes y en curso.</p>
                <div className="sgoi-chart-body sgoi-chart-pie">
                  {dataEstadosReporte.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={dataEstadosReporte} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={2}>
                          {dataEstadosReporte.map((d) => (
                            <Cell key={d.name} fill={d.color} />
                          ))}
                        </Pie>
                        <Tooltip content={<TooltipGestion />} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="sgoi-empty">Sin incidencias en el periodo.</div>
                  )}
                </div>
              </section>
              <section className="sgoi-chart-card">
                <h2>Minutos de atención</h2>
                <p>Duración de incidencias por día.</p>
                <div className="sgoi-chart-body">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dataMinutosReporte} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="dia" tick={{ fontSize: 11, fill: '#64748b' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#64748b' }} width={32} />
                      <Tooltip content={<TooltipGestion />} />
                      <Bar dataKey="Minutos" fill="#1d4ed8" radius={[5, 5, 0, 0]} maxBarSize={32} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            </div>
          </>
        ) : vista === 'horario' ? (
          <>
            <div className="sgoi-toolbar">
              <p className="sgoi-range sgoi-range-inline">
                {nombreHorarioPdf ? `Horario de ${nombreHorarioPdf}. ` : ''}
                Plantilla semanal. Aquí se edita para siempre. En Mi día puedes cambiar solo una fecha.
              </p>
              <button type="button" className="sgoi-btn" onClick={exportarHorarioPdf}>
                Exportar PDF
              </button>
            </div>
            <div className="sgoi-week">
              {DIAS_SEMANA.map(([wd, nombre]) => {
                const bloques = horario.find((d) => Number(d.weekday) === wd)?.bloques || [];
                return (
                  <section key={wd} className="sgoi-week-day">
                    <div className="sgoi-week-head">
                      <h2>{nombre}</h2>
                      <div className="sgoi-week-head-actions">
                        <button type="button" className="sgoi-btn sgoi-btn-ghost sgoi-btn-mini" onClick={() => editarDiaPlantilla(wd, nombre, bloques)}>
                          Editar día
                        </button>
                        <button type="button" className="sgoi-btn sgoi-btn-ghost sgoi-btn-mini" onClick={() => agregarFranjaPlantilla(wd, nombre)}>
                          + Franja
                        </button>
                      </div>
                    </div>
                    {bloques.length === 0 ? (
                      <p className="sgoi-slot-quiet">Sin franjas</p>
                    ) : (
                      bloques.map((b) => {
                        const tint = colorFranjaIgual(b.titulo, b.tipo);
                        return (
                        <div
                          key={b.id}
                          className="sgoi-week-slot"
                          style={{ background: tint.bg, borderColor: tint.fg }}
                        >
                          <div className="sgoi-week-slot-top">
                            <span style={{ color: tint.fg }}>{b.hora_ini}–{b.hora_fin}</span>
                            <div className="sgoi-ico-actions">
                              <IconBtn title="Editar franja" onClick={() => editarFranjaPlantilla(b)}>
                                <IconEdit />
                              </IconBtn>
                              <IconBtn title="Quitar franja" danger onClick={() => borrarFranjaPlantilla(b)}>
                                <IconTrash />
                              </IconBtn>
                            </div>
                          </div>
                          <strong>{b.titulo}</strong>
                          <em style={{ color: tint.fg }}>{etiquetaTipoTrabajo(b.tipo)}</em>
                        </div>
                        );
                      })
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
            {listaPropia.length === 0 ? (
              <div className="sgoi-empty">No hay pendientes abiertos.</div>
            ) : (
              <ul className="sgoi-entity-list">
                {listaPropia.map((it) => (
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
        ) : listaPropia.length === 0 ? (
          <div className="sgoi-empty">No hay registros todavía.</div>
        ) : (
          <ul className="sgoi-entity-list">
            {listaPropia.map((it) => {
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
