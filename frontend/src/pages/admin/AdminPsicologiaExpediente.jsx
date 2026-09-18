import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  IconButton,
  MenuItem,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AttachFileOutlinedIcon from '@mui/icons-material/AttachFileOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import api from '../../services/api';
import Swal from 'sweetalert2';
import { useAuth } from '../../context/AuthContext';
import PsicologiaSignaturePad from '../../components/PsicologiaSignaturePad';
import PiarWizard from '../../components/psicologia/PiarWizard';
import {
  emptyAjustes,
  apoyosComoLista,
  PIAR_ESTADO_LABEL,
} from '../../utils/piarEtiquetas';
import '../../components/psicologia/PiarStudio.css';
import './AdminPsicologia.css';
import { htmlATextoPlano } from '../../utils/cnebTextoRico';

const MOTIVOS_DER = [
  { key: 'conducta_disruptiva', label: 'Conducta disruptiva' },
  { key: 'dificultades_aprendizaje', label: 'Dificultades de aprendizaje' },
  { key: 'problemas_emocionales', label: 'Problemas emocionales' },
  { key: 'socializacion', label: 'Problemas de socialización' },
  { key: 'sospecha_nee', label: 'Sospecha de NEE' },
];

const LIMA_TZ = 'America/Lima';

function formatLimaFechaHora(iso) {
  if (iso == null || iso === '') return { fecha: '—', hora: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { fecha: String(iso), hora: '' };
  const fecha = d.toLocaleDateString('es-PE', {
    timeZone: LIMA_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const hora = d.toLocaleTimeString('es-PE', {
    timeZone: LIMA_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  return { fecha, hora };
}

function formatLimaLine(iso) {
  const { fecha, hora } = formatLimaFechaHora(iso);
  if (fecha === '—') return '—';
  return hora ? `${fecha} · ${hora}` : fecha;
}

const TIMELINE_TIPO_LABEL = {
  atencion: 'Atención',
  derivacion: 'Derivación',
  reunion: 'Reunión / acta',
  piar: 'PIAR',
  archivo: 'Archivo / evidencia',
};

function tabIndexPorTimelineTipo(tipo) {
  const m = { atencion: 1, derivacion: 2, reunion: 3, archivo: 4, piar: 5 };
  return m[String(tipo)] ?? 0;
}

function formatFechaDocPe(d) {
  if (d == null || d === '') return '—';
  const s = String(d).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return s;
}

function formatBytesPsi(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  return `${(v / (1024 * 1024)).toFixed(2)} MB`;
}

function TabPanel({ children, value, index }) {
  if (value !== index) return null;
  return (
    <Box className="psi-tab-panel-inner" sx={{ p: 2 }}>
      {children}
    </Box>
  );
}

export default function AdminPsicologiaExpediente({ alumnoId }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const matriculaId = searchParams.get('matricula_id');

  const [tab, setTab] = useState(searchParams.get('tab') === 'piar' ? 5 : 0);
  const [piarGuardando, setPiarGuardando] = useState(false);
  const [meta, setMeta] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [atenciones, setAtenciones] = useState([]);
  const [derivaciones, setDerivaciones] = useState([]);
  const [reuniones, setReuniones] = useState([]);
  const [piarLista, setPiarLista] = useState([]);
  const [archivos, setArchivos] = useState([]);
  const [dlgArchivo, setDlgArchivo] = useState(false);
  const [arcForm, setArcForm] = useState({ nombre_archivo: '', detalle: '', fecha_documento: '' });
  const [arcFile, setArcFile] = useState(null);
  const archivoInputRef = useRef(null);
  const [loadErr, setLoadErr] = useState(null);
  const [loading, setLoading] = useState(true);

  const [dlgAtencion, setDlgAtencion] = useState(false);
  const [atencionEditId, setAtencionEditId] = useState(null);
  const [atForm, setAtForm] = useState({ tipo: 'ALUMNO', motivo: '', tratamiento_intervencion: '' });

  const [dlgDer, setDlgDer] = useState(false);
  const [derivacionEditId, setDerivacionEditId] = useState(null);
  const [derForm, setDerForm] = useState({
    motivos_sel: [],
    motivo_otro: '',
    descripcion_caso: '',
    estrategias_aula: '',
    urgencia: 'MEDIA',
    docente_personal_id: '',
    firma_docente_imagen: '',
  });

  const [dlgReu, setDlgReu] = useState(false);
  const [reuEditingId, setReuEditingId] = useState(null);
  const [reuForm, setReuForm] = useState({
    participantes: '',
    temas_tratados: '',
    acuerdos: '',
    compromisos_familia: '',
    compromisos_colegio: '',
    firma_padre_imagen: '',
    firma_psicologia_imagen: '',
    firma_docente_imagen: '',
  });

  const [dlgPiar, setDlgPiar] = useState(false);
  const [resumenVer, setResumenVer] = useState(null);
  const [piarEditing, setPiarEditing] = useState(null);
  const [piarForm, setPiarForm] = useState({
    anio: new Date().getFullYear(),
    diagnostico: '',
    fortalezas: '',
    areas_dificultad: '',
    estilo_aprendizaje: '',
    observaciones_relevantes: '',
    estrategias_docentes: '',
    frecuencia_aplicacion: '',
    fecha_revision: '',
    avances_observados: '',
    ajustes_necesarios_revision: '',
    docente_responsable_personal_id: '',
    coordinador_personal_id: '',
    ajustes: emptyAjustes(),
    objetivos: [
      { objetivo: '', indicador: '' },
      { objetivo: '', indicador: '' },
      { objetivo: '', indicador: '' },
    ],
    evaluacion_kpi: { participacion: false, comprension: false, autonomia: false, escala: 'en_proceso' },
    estado: 'BORRADOR',
  });

  /** Evita que un guardado desde este modal pise texto que el docente guardó en Herramientas → PIAR sin reabrir el modal. */
  const piarDocenteCamposSnapshotRef = useRef({
    estrategias_docentes: '',
    frecuencia_aplicacion: '',
    avances_observados: '',
  });

  const [seguimientoItems, setSeguimientoItems] = useState([]);
  const [seguimientoNuevo, setSeguimientoNuevo] = useState('');

  useEffect(() => {
    if (!dlgPiar || !piarEditing?.id) {
      setSeguimientoItems([]);
      setSeguimientoNuevo('');
      return undefined;
    }
    let cancel = false;
    api
      .get(`/admin/psicologia/piar/${piarEditing.id}/seguimiento`)
      .then(({ data }) => {
        if (!cancel) setSeguimientoItems(data.items || []);
      })
      .catch(() => {
        if (!cancel) setSeguimientoItems([]);
      });
    return () => {
      cancel = true;
    };
  }, [dlgPiar, piarEditing?.id]);

  const agregarSeguimientoAdmin = async () => {
    if (!piarEditing?.id || !String(seguimientoNuevo || '').trim()) return;
    try {
      await api.post(`/admin/psicologia/piar/${piarEditing.id}/seguimiento`, { contenido: seguimientoNuevo.trim() });
      setSeguimientoNuevo('');
      const { data } = await api.get(`/admin/psicologia/piar/${piarEditing.id}/seguimiento`);
      setSeguimientoItems(data.items || []);
    } catch (e) {
      Swal.fire({ icon: 'error', title: e.response?.data?.error || 'Error' });
    }
  };

  const reloadAll = useCallback(async () => {
    setLoadErr(null);
    setLoading(true);
    try {
      const [m, r, t, a, d, re, p, ar] = await Promise.all([
        api.get('/admin/psicologia/meta').catch(() => ({ data: {} })),
        api.get(`/admin/psicologia/alumnos/${alumnoId}/resumen`),
        api.get(`/admin/psicologia/alumnos/${alumnoId}/timeline`).catch(() => ({ data: { items: [] } })),
        api.get(`/admin/psicologia/alumnos/${alumnoId}/atenciones`),
        api.get(`/admin/psicologia/alumnos/${alumnoId}/derivaciones`),
        api.get(`/admin/psicologia/alumnos/${alumnoId}/reuniones`),
        api.get(`/admin/psicologia/alumnos/${alumnoId}/piar`),
        api.get(`/admin/psicologia/alumnos/${alumnoId}/archivos`).catch(() => ({ data: { archivos: [] } })),
      ]);
      setMeta(m.data);
      setResumen(r.data);
      setTimeline(t.data?.items || []);
      setAtenciones(a.data?.atenciones || []);
      setDerivaciones(d.data?.derivaciones || []);
      setReuniones(re.data?.reuniones || []);
      setPiarLista(p.data?.piar_lista || []);
      setArchivos(ar.data?.archivos || []);
    } catch (e) {
      const msg = e.response?.data?.error || e.message;
      const hint = e.response?.data?.hint;
      setLoadErr(hint ? `${msg} (${hint})` : msg);
    } finally {
      setLoading(false);
    }
  }, [alumnoId]);

  useEffect(() => {
    reloadAll();
  }, [reloadAll]);

  useEffect(() => {
    if (searchParams.get('tab') === 'piar') setTab(5);
  }, [searchParams]);

  /** Si el usuario logueado es personal docente, preseleccionar en la ficha de derivación (solo alta nueva). */
  useEffect(() => {
    if (!dlgDer || derivacionEditId || !meta?.docentes?.length) return;
    const pid = user?.personal_id != null ? String(user.personal_id) : '';
    if (!pid) return;
    const existe = meta.docentes.some((d) => String(d.id) === pid);
    if (existe) {
      setDerForm((f) => ({ ...f, docente_personal_id: f.docente_personal_id || pid }));
    }
  }, [dlgDer, derivacionEditId, meta, user?.personal_id]);

  const guardarAtencion = async () => {
    try {
      if (atencionEditId) {
        await api.put(`/admin/psicologia/atenciones/${atencionEditId}`, { ...atForm });
      } else {
        await api.post(`/admin/psicologia/alumnos/${alumnoId}/atenciones`, {
          ...atForm,
          matricula_id: matriculaId || null,
        });
      }
      Swal.fire({ icon: 'success', title: atencionEditId ? 'Actualizado' : 'Registrado', timer: 1400, showConfirmButton: false });
      setDlgAtencion(false);
      setAtencionEditId(null);
      setAtForm({ tipo: 'ALUMNO', motivo: '', tratamiento_intervencion: '' });
      reloadAll();
    } catch (e) {
      Swal.fire({ icon: 'error', title: e.response?.data?.error || 'Error' });
    }
  };

  const abrirNuevaAtencion = () => {
    setAtencionEditId(null);
    setAtForm({ tipo: 'ALUMNO', motivo: '', tratamiento_intervencion: '' });
    setDlgAtencion(true);
  };

  const abrirEditarAtencion = (a) => {
    setAtencionEditId(a.id);
    setAtForm({
      tipo: a.tipo || 'ALUMNO',
      motivo: a.motivo || '',
      tratamiento_intervencion: a.tratamiento_intervencion || '',
    });
    setDlgAtencion(true);
  };

  const eliminarAtencion = async (id) => {
    const ok = await Swal.fire({
      title: '¿Eliminar atención?',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/admin/psicologia/atenciones/${id}`);
      reloadAll();
    } catch (e) {
      Swal.fire({ icon: 'error', title: e.response?.data?.error || 'Error' });
    }
  };

  const resetDerForm = () => ({
    motivos_sel: [],
    motivo_otro: '',
    descripcion_caso: '',
    estrategias_aula: '',
    urgencia: 'MEDIA',
    docente_personal_id: '',
    firma_docente_imagen: '',
  });

  const abrirNuevaDerivacion = () => {
    setDerivacionEditId(null);
    setDerForm(resetDerForm());
    setDlgDer(true);
  };

  const abrirEditarDerivacion = (d) => {
    let motivos = [];
    const raw = d.motivos_json;
    if (Array.isArray(raw)) motivos = raw;
    else if (raw && typeof raw === 'object') motivos = Object.values(raw);
    else if (typeof raw === 'string') {
      try {
        const p = JSON.parse(raw);
        motivos = Array.isArray(p) ? p : [];
      } catch {
        motivos = [];
      }
    }
    setDerivacionEditId(d.id);
    setDerForm({
      motivos_sel: motivos,
      motivo_otro: d.motivo_otro || '',
      descripcion_caso: d.descripcion_caso || '',
      estrategias_aula: d.estrategias_aula || '',
      urgencia: d.urgencia || 'MEDIA',
      docente_personal_id: d.docente_personal_id != null ? String(d.docente_personal_id) : '',
      firma_docente_imagen: d.firma_docente_imagen || '',
    });
    setDlgDer(true);
  };

  const eliminarDerivacion = async (id) => {
    const ok = await Swal.fire({
      title: '¿Eliminar esta derivación?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#c62828',
    });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/admin/psicologia/derivaciones/${id}`);
      Swal.fire({ icon: 'success', title: 'Eliminada', timer: 1200, showConfirmButton: false });
      reloadAll();
    } catch (e) {
      Swal.fire({ icon: 'error', title: e.response?.data?.error || 'Error' });
    }
  };

  const eliminarPiar = async (id) => {
    const ok = await Swal.fire({
      title: '¿Eliminar este PIAR?',
      text: 'Solo se permiten borradores. No se puede deshacer.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#c62828',
    });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/admin/psicologia/piar/${id}`);
      Swal.fire({ icon: 'success', title: 'PIAR eliminado', timer: 1200, showConfirmButton: false });
      reloadAll();
    } catch (e) {
      Swal.fire({ icon: 'error', title: e.response?.data?.error || 'Error' });
    }
  };

  const guardarDerivacion = async () => {
    try {
      if (derivacionEditId) {
        await api.put(`/admin/psicologia/derivaciones/${derivacionEditId}`, {
          motivos_json: derForm.motivos_sel,
          motivo_otro: derForm.motivo_otro,
          descripcion_caso: derForm.descripcion_caso,
          estrategias_aula: derForm.estrategias_aula,
          urgencia: derForm.urgencia,
          docente_personal_id: derForm.docente_personal_id || null,
          firma_docente_imagen: derForm.firma_docente_imagen || null,
          firma_docente_fecha: derForm.firma_docente_imagen
            ? new Date().toISOString().slice(0, 19).replace('T', ' ')
            : null,
        });
      } else {
        await api.post(`/admin/psicologia/alumnos/${alumnoId}/derivaciones`, {
          matricula_id: matriculaId || null,
          motivos_json: derForm.motivos_sel,
          motivo_otro: derForm.motivo_otro,
          descripcion_caso: derForm.descripcion_caso,
          estrategias_aula: derForm.estrategias_aula,
          urgencia: derForm.urgencia,
          docente_personal_id: derForm.docente_personal_id || null,
          firma_docente_imagen: derForm.firma_docente_imagen || null,
          firma_docente_fecha: derForm.firma_docente_imagen
            ? new Date().toISOString().slice(0, 19).replace('T', ' ')
            : null,
          recepcion_psicologia_personal_id:
            user?.personal_id != null ? parseInt(user.personal_id, 10) : null,
          recepcion_psicologia_fecha: new Date().toISOString().slice(0, 19).replace('T', ' '),
        });
      }
      Swal.fire({
        icon: 'success',
        title: derivacionEditId ? 'Derivación actualizada' : 'Derivación registrada',
        timer: 1400,
        showConfirmButton: false,
      });
      setDlgDer(false);
      setDerivacionEditId(null);
      setDerForm(resetDerForm());
      reloadAll();
    } catch (e) {
      Swal.fire({ icon: 'error', title: e.response?.data?.error || 'Error' });
    }
  };

  const toggleMotivo = (key) => {
    setDerForm((f) => ({
      ...f,
      motivos_sel: f.motivos_sel.includes(key) ? f.motivos_sel.filter((k) => k !== key) : [...f.motivos_sel, key],
    }));
  };

  const nuevaReunion = async () => {
    const ok = await Swal.fire({
      title: 'Nueva acta de reunión',
      text: 'Se creará un borrador vacío en el servidor. ¿Desea continuar?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, crear borrador',
      cancelButtonText: 'Cancelar',
    });
    if (!ok.isConfirmed) return;
    try {
      const { data } = await api.post(`/admin/psicologia/alumnos/${alumnoId}/reuniones`, {
        matricula_id: matriculaId || null,
        estado: 'BORRADOR',
      });
      setReuEditingId(data.id);
      setReuForm({
        participantes: '',
        temas_tratados: '',
        acuerdos: '',
        compromisos_familia: '',
        compromisos_colegio: '',
        firma_padre_imagen: '',
        firma_psicologia_imagen: '',
        firma_docente_imagen: '',
      });
      setDlgReu(true);
      reloadAll();
    } catch (e) {
      Swal.fire({ icon: 'error', title: e.response?.data?.error || 'Error' });
    }
  };

  const eliminarReunion = async (id, estadoActa) => {
    const cerrada = String(estadoActa || '').toUpperCase() === 'CERRADA';
    const ok = await Swal.fire({
      title: cerrada ? '¿Eliminar acta cerrada?' : '¿Eliminar esta acta?',
      text: cerrada
        ? 'El acta está CERRADA. Solo elimine si es corrección administrativa. No se puede deshacer.'
        : 'Se eliminará el borrador. No se puede deshacer.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#c62828',
    });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/admin/psicologia/reuniones/${id}`);
      if (reuEditingId === id) {
        setDlgReu(false);
        setReuEditingId(null);
      }
      Swal.fire({ icon: 'success', title: 'Acta eliminada', timer: 1200, showConfirmButton: false });
      reloadAll();
    } catch (e) {
      Swal.fire({ icon: 'error', title: e.response?.data?.error || 'Error' });
    }
  };

  const abrirReunion = (r) => {
    setReuEditingId(r.id);
    setReuForm({
      participantes: r.participantes || '',
      temas_tratados: r.temas_tratados || '',
      acuerdos: r.acuerdos || '',
      compromisos_familia: r.compromisos_familia || '',
      compromisos_colegio: r.compromisos_colegio || '',
      firma_padre_imagen: r.firma_padre_imagen || '',
      firma_psicologia_imagen: r.firma_psicologia_imagen || '',
      firma_docente_imagen: r.firma_docente_imagen || '',
    });
    setDlgReu(true);
  };

  const guardarReunionBorrador = async () => {
    if (!reuEditingId) return;
    try {
      await api.put(`/admin/psicologia/reuniones/${reuEditingId}`, {
        ...reuForm,
        estado: 'BORRADOR',
      });
      Swal.fire({ icon: 'success', title: 'Borrador guardado', timer: 1200, showConfirmButton: false });
      reloadAll();
    } catch (e) {
      Swal.fire({ icon: 'error', title: e.response?.data?.error || 'Error' });
    }
  };

  const cerrarReunion = async () => {
    if (!reuEditingId) return;
    try {
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      await api.put(`/admin/psicologia/reuniones/${reuEditingId}`, {
        ...reuForm,
        estado: 'CERRADA',
        firma_padre_fecha: reuForm.firma_padre_imagen ? now : null,
        firma_psicologia_fecha: reuForm.firma_psicologia_imagen ? now : null,
        firma_docente_fecha: reuForm.firma_docente_imagen ? now : null,
      });
      Swal.fire({ icon: 'success', title: 'Acta cerrada', timer: 1400, showConfirmButton: false });
      setDlgReu(false);
      reloadAll();
    } catch (e) {
      Swal.fire({ icon: 'error', title: e.response?.data?.error || 'Error' });
    }
  };

  const togglePiarCheck = (cat, key) => {
    setPiarForm((f) => {
      const arr = f.ajustes[cat] || [];
      const next = arr.includes(key) ? arr.filter((k) => k !== key) : [...arr, key];
      return { ...f, ajustes: { ...f.ajustes, [cat]: next } };
    });
  };

  const abrirNuevoPiar = () => {
    const anioAct = meta?.anio_activo || new Date().getFullYear();
    setPiarEditing(null);
    setPiarForm({
      anio: anioAct,
      diagnostico: '',
      fortalezas: '',
      areas_dificultad: '',
      estilo_aprendizaje: '',
      observaciones_relevantes: '',
      estrategias_docentes: '',
      frecuencia_aplicacion: '',
      fecha_revision: '',
      avances_observados: '',
      ajustes_necesarios_revision: '',
      docente_responsable_personal_id: '',
      coordinador_personal_id: '',
      ajustes: emptyAjustes(),
      objetivos: [
        { objetivo: '', indicador: '' },
        { objetivo: '', indicador: '' },
        { objetivo: '', indicador: '' },
      ],
      evaluacion_kpi: { participacion: false, comprension: false, autonomia: false, escala: 'en_proceso' },
      estado: 'BORRADOR',
    });
    piarDocenteCamposSnapshotRef.current = {
      estrategias_docentes: '',
      frecuencia_aplicacion: '',
      avances_observados: '',
    };
    setDlgPiar(true);
  };

  const abrirEditarPiar = (row) => {
    setPiarEditing(row);
    let adj = row.ajustes_checklist_json;
    if (typeof adj === 'string') {
      try {
        adj = JSON.parse(adj);
      } catch {
        adj = emptyAjustes();
      }
    }
    if (!adj || typeof adj !== 'object') adj = emptyAjustes();
    let obj = row.objetivos_json;
    if (typeof obj === 'string') {
      try {
        obj = JSON.parse(obj);
      } catch {
        obj = [];
      }
    }
    if (obj != null && typeof obj === 'object' && !Array.isArray(obj)) {
      obj = Object.keys(obj)
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => obj[k])
        .filter(Boolean);
    }
    if (!Array.isArray(obj)) obj = [];
    while (obj.length < 3) obj.push({ objetivo: '', indicador: '' });
    if (obj.length > 3) obj = obj.slice(0, 3);
    let kpi = row.evaluacion_kpi_json;
    if (typeof kpi === 'string') {
      try {
        kpi = JSON.parse(kpi);
      } catch {
        kpi = {};
      }
    }
    if (kpi == null || typeof kpi !== 'object' || Array.isArray(kpi)) kpi = {};
    setPiarForm({
      anio: row.anio,
      diagnostico: row.diagnostico || '',
      fortalezas: row.fortalezas || '',
      areas_dificultad: row.areas_dificultad || '',
      estilo_aprendizaje: row.estilo_aprendizaje || '',
      observaciones_relevantes: row.observaciones_relevantes || '',
      estrategias_docentes: row.estrategias_docentes || '',
      frecuencia_aplicacion: row.frecuencia_aplicacion || '',
      fecha_revision: row.fecha_revision || '',
      avances_observados: row.avances_observados || '',
      ajustes_necesarios_revision: row.ajustes_necesarios_revision || '',
      docente_responsable_personal_id: row.docente_responsable_personal_id || '',
      coordinador_personal_id: row.coordinador_personal_id || '',
      ajustes: { ...emptyAjustes(), ...adj },
      objetivos: obj,
      evaluacion_kpi: { participacion: false, comprension: false, autonomia: false, escala: 'en_proceso', ...kpi },
      estado: row.estado || 'BORRADOR',
    });
    piarDocenteCamposSnapshotRef.current = {
      estrategias_docentes: row.estrategias_docentes != null ? String(row.estrategias_docentes) : '',
      frecuencia_aplicacion: row.frecuencia_aplicacion != null ? String(row.frecuencia_aplicacion) : '',
      avances_observados: row.avances_observados != null ? String(row.avances_observados) : '',
    };
    setDlgPiar(true);
  };

  const descargarPdf = async (path, filename) => {
    try {
      const res = await api.get(path, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      const msg = e.response?.data?.error;
      Swal.fire({ icon: 'error', title: typeof msg === 'string' ? msg : 'No se pudo descargar el PDF' });
    }
  };

  const descargarArchivoEvidencia = async (id, nombreSugerido) => {
    try {
      const res = await api.get(`/admin/psicologia/archivos/${id}/descarga`, { responseType: 'blob' });
      const ct = res.headers['content-type'] || 'application/octet-stream';
      const blob = new Blob([res.data], { type: ct });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombreSugerido || `documento_${id}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      const msg = e.response?.data?.error;
      Swal.fire({
        icon: 'error',
        title: typeof msg === 'string' ? msg : 'No se pudo descargar el archivo',
      });
    }
  };

  const resetDlgArchivo = () => {
    setDlgArchivo(false);
    setArcForm({ nombre_archivo: '', detalle: '', fecha_documento: '' });
    setArcFile(null);
    if (archivoInputRef.current) archivoInputRef.current.value = '';
  };

  const guardarArchivoPsi = async () => {
    const nombre = String(arcForm.nombre_archivo || '').trim();
    if (!nombre || !arcFile) {
      Swal.fire({
        icon: 'warning',
        title: 'Complete el nombre del archivo y adjunte un archivo (imagen o PDF).',
      });
      return;
    }
    try {
      const fd = new FormData();
      fd.append('nombre_archivo', nombre);
      fd.append('detalle', String(arcForm.detalle || '').trim());
      if (arcForm.fecha_documento) fd.append('fecha_documento', arcForm.fecha_documento);
      if (matriculaId) fd.append('matricula_id', matriculaId);
      fd.append('archivo', arcFile);
      await api.post(`/admin/psicologia/alumnos/${alumnoId}/archivos`, fd);
      Swal.fire({ icon: 'success', title: 'Archivo guardado', timer: 1400, showConfirmButton: false });
      resetDlgArchivo();
      reloadAll();
    } catch (e) {
      Swal.fire({ icon: 'error', title: e.response?.data?.error || 'Error al subir' });
    }
  };

  const eliminarArchivoPsi = async (id) => {
    const ok = await Swal.fire({
      title: '¿Eliminar archivo?',
      text: 'Se borrará el registro y el archivo en el servidor.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/admin/psicologia/archivos/${id}`);
      reloadAll();
      Swal.fire({ icon: 'success', title: 'Eliminado', timer: 1200, showConfirmButton: false });
    } catch (e) {
      Swal.fire({ icon: 'error', title: e.response?.data?.error || 'Error' });
    }
  };

  const guardarPiar = async (estadoOverride) => {
    setPiarGuardando(true);
    try {
      const body = {
        matricula_id: matriculaId || null,
        diagnostico: piarForm.diagnostico,
        fortalezas: piarForm.fortalezas,
        areas_dificultad: piarForm.areas_dificultad,
        estilo_aprendizaje: piarForm.estilo_aprendizaje,
        observaciones_relevantes: piarForm.observaciones_relevantes,
        estrategias_docentes: piarForm.estrategias_docentes,
        frecuencia_aplicacion: piarForm.frecuencia_aplicacion,
        fecha_revision: piarForm.fecha_revision || null,
        avances_observados: piarForm.avances_observados,
        ajustes_necesarios_revision: piarForm.ajustes_necesarios_revision,
        docente_responsable_personal_id: piarForm.docente_responsable_personal_id || null,
        coordinador_personal_id: piarForm.coordinador_personal_id || null,
        ajustes_checklist_json: piarForm.ajustes,
        objetivos_json: Array.isArray(piarForm.objetivos)
          ? piarForm.objetivos.filter((o) => o && (o.objetivo || o.indicador))
          : [],
        evaluacion_kpi_json: piarForm.evaluacion_kpi,
        estado: estadoOverride || piarForm.estado,
        fecha_elaboracion: new Date().toISOString().slice(0, 10),
      };
      if (piarEditing?.id && alumnoId) {
        const snap = piarDocenteCamposSnapshotRef.current;
        try {
          const { data } = await api.get(`/admin/psicologia/alumnos/${alumnoId}/piar`);
          const serverRow = (data.piar_lista || []).find((x) => Number(x.id) === Number(piarEditing.id));
          if (serverRow) {
            ['estrategias_docentes', 'frecuencia_aplicacion', 'avances_observados'].forEach((k) => {
              const formVal = body[k] != null ? String(body[k]) : '';
              const snapVal = snap[k] != null ? String(snap[k]) : '';
              if (formVal === snapVal && serverRow[k] != null && String(serverRow[k]) !== formVal) {
                body[k] = serverRow[k];
              }
            });
          }
        } catch {
          /* si falla la lectura, se envía el body del formulario */
        }
      }
      if (piarEditing?.id) {
        await api.put(`/admin/psicologia/piar/${piarEditing.id}`, body);
      } else {
        body.anio = parseInt(piarForm.anio, 10);
        if (!Number.isFinite(body.anio)) {
          Swal.fire({ icon: 'warning', title: 'Indique un año escolar válido' });
          return;
        }
        await api.post(`/admin/psicologia/alumnos/${alumnoId}/piar`, body);
      }
      Swal.fire({ icon: 'success', title: 'PIAR guardado', timer: 1400, showConfirmButton: false });
      setDlgPiar(false);
      reloadAll();
    } catch (e) {
      Swal.fire({ icon: 'error', title: e.response?.data?.error || 'Error' });
    } finally {
      setPiarGuardando(false);
    }
  };

  if (loading && !resumen) {
    return (
      <Box display="flex" justifyContent="center" p={4}>
        <CircularProgress />
      </Box>
    );
  }

  if (loadErr) {
    return (
      <div className="psi-page">
        <Alert severity="error">{loadErr}</Alert>
        <Button sx={{ mt: 2 }} onClick={() => navigate('/admin/psicologia')}>
          Volver al listado
        </Button>
      </div>
    );
  }

  const nombre = resumen?.alumno?.nombre_completo || `Alumno #${alumnoId}`;
  const c = resumen?.conteos || {};

  return (
    <div className="psi-page">
      <div className="psi-exp-header">
        <div>
          <button type="button" className="psi-exp-back" onClick={() => navigate('/admin/psicologia')}>
            ← Volver al buscador
          </button>
          <Typography variant="h5" className="psi-exp-nombre" sx={{ mt: 1, fontWeight: 800 }}>
            {nombre}
          </Typography>
          {matriculaId && (
            <Typography variant="body2" className="psi-exp-sub">
              Matrícula de referencia: #{matriculaId}
            </Typography>
          )}
        </div>
        <Button variant="outlined" className="psi-exp-refresh" onClick={reloadAll} disabled={loading}>
          Actualizar
        </Button>
      </div>

      <div className="psi-stat-cards">
        <div className="psi-stat-card psi-stat-a">
          {c.atenciones ?? 0}
          <span>Atenciones</span>
        </div>
        <div className="psi-stat-card psi-stat-d">
          {c.derivaciones_abiertas ?? 0}
          <span>Derivaciones abiertas</span>
        </div>
        <div className="psi-stat-card psi-stat-r">
          {c.reuniones_borrador ?? 0}
          <span>Actas en borrador</span>
        </div>
        <div className="psi-stat-card psi-stat-p">
          {c.piar_activos ?? 0}
          <span>PIAR activos</span>
        </div>
        <div className="psi-stat-card psi-stat-f">
          {c.archivos ?? 0}
          <span>Archivos evidencia</span>
        </div>
      </div>

      <div className="psi-tabs-wrap">
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          className="psi-exp-tabs"
        >
          <Tab label="Resumen" disableRipple className="psi-exp-tab" />
          <Tab label="Atenciones" disableRipple className="psi-exp-tab" />
          <Tab label="Derivaciones" disableRipple className="psi-exp-tab" />
          <Tab label="Reuniones / acta" disableRipple className="psi-exp-tab" />
          <Tab label="Archivos" disableRipple className="psi-exp-tab" />
          <Tab label="PIAR" disableRipple className="psi-exp-tab" />
        </Tabs>

        <TabPanel value={tab} index={0}>
          <Typography variant="subtitle2" gutterBottom>
            Últimos movimientos
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
            Fecha y hora en horario de Lima (Perú).
          </Typography>
          <ul className="psi-timeline">
            {(timeline || []).map((it) => {
              const { fecha, hora } = formatLimaFechaHora(it.cuando);
              return (
                <li key={`${it.tipo}-${it.id}`}>
                  <div className="psi-timeline-row">
                    <div className="psi-timeline-meta">
                      <strong>{TIMELINE_TIPO_LABEL[it.tipo] || it.tipo}</strong>
                      <span className="psi-timeline-fecha">{fecha}</span>
                      {hora ? <span className="psi-timeline-hora">{hora}</span> : null}
                      {it.titulo ? <span> — {it.titulo}</span> : null}
                    </div>
                    <Tooltip title="Ver detalle">
                      <IconButton
                        size="small"
                        color="primary"
                        className="psi-timeline-ver-btn"
                        aria-label="Ver detalle del movimiento"
                        onClick={() => setResumenVer(it)}
                      >
                        <VisibilityOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </div>
                </li>
              );
            })}
            {!timeline?.length && (
              <li className="psi-muted" style={{ padding: '0.75rem 1rem' }}>
                Sin registros aún.
              </li>
            )}
          </ul>
        </TabPanel>

        <TabPanel value={tab} index={1}>
          <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
            <Button variant="contained" onClick={abrirNuevaAtencion}>
              + Registrar atención
            </Button>
          </Stack>
          <Stack spacing={1.5}>
            {atenciones.map((a) => (
              <Box
                key={a.id}
                sx={{
                  p: 2,
                  borderRadius: 2,
                  border: '1px solid #e2e8f0',
                  bgcolor: a.tipo === 'FAMILIA' ? '#f0fdf4' : '#eff6ff',
                }}
              >
                <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
                  <Chip size="small" label={a.tipo} color={a.tipo === 'FAMILIA' ? 'success' : 'primary'} />
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
                      {formatLimaLine(a.fecha_hora)} · {a.registrado_por_nombre || '—'}
                    </Typography>
                    <IconButton size="small" color="primary" aria-label="Editar atención" onClick={() => abrirEditarAtencion(a)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" color="error" aria-label="Eliminar atención" onClick={() => eliminarAtencion(a.id)}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </Stack>
                <Typography variant="subtitle2" sx={{ mt: 1 }}>
                  Motivo
                </Typography>
                <Typography variant="body2">{a.motivo}</Typography>
                <Typography variant="subtitle2" sx={{ mt: 1 }}>
                  Tratamiento / intervención
                </Typography>
                <Typography variant="body2">{a.tratamiento_intervencion}</Typography>
              </Box>
            ))}
            {!atenciones.length && <Typography className="psi-muted">No hay atenciones registradas.</Typography>}
          </Stack>
        </TabPanel>

        <TabPanel value={tab} index={2}>
          <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
            <Button variant="contained" onClick={abrirNuevaDerivacion}>
              + Nueva derivación
            </Button>
          </Stack>
          <Stack spacing={1.5}>
            {derivaciones.map((d) => (
              <Box key={d.id} sx={{ p: 2, borderRadius: 2, border: '1px solid #fed7aa', bgcolor: '#fffbeb' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={1}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    <Chip label={d.estado} size="small" />
                    <Chip label={d.urgencia} size="small" color="warning" variant="outlined" />
                    {d.docente_nombre && (
                      <Typography variant="caption">Docente: {d.docente_nombre}</Typography>
                    )}
                    <Typography variant="caption" color="text.secondary">
                      {formatLimaLine(d.created_at)}
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={0}>
                    <IconButton size="small" color="primary" aria-label="Editar derivación" onClick={() => abrirEditarDerivacion(d)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" color="error" aria-label="Eliminar derivación" onClick={() => eliminarDerivacion(d.id)}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </Stack>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  {d.descripcion_caso}
                </Typography>
              </Box>
            ))}
            {!derivaciones.length && <Typography className="psi-muted">Sin derivaciones.</Typography>}
          </Stack>
        </TabPanel>

        <TabPanel value={tab} index={3}>
          <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
            <Button variant="contained" onClick={nuevaReunion}>
              + Nueva reunión / acta
            </Button>
          </Stack>
          <Stack spacing={1.5}>
            {reuniones.map((r) => (
              <div key={r.id} className="psi-reu-card">
                <button type="button" className="psi-reu-card-body" onClick={() => abrirReunion(r)}>
                  <div className="psi-reu-card-badges">
                    <span className={`psi-reu-badge ${String(r.estado) === 'CERRADA' ? 'cerrada' : 'borrador'}`}>{r.estado}</span>
                    <span className="psi-reu-meta">{formatLimaLine(r.created_at)}</span>
                  </div>
                  <div className="psi-reu-card-title">Acta de reunión #{r.id}</div>
                  {r.facilitador_nombre ? (
                    <div className="psi-reu-card-sub">Facilita: {r.facilitador_nombre}</div>
                  ) : (
                    <div className="psi-reu-card-sub">Sin facilitador asignado</div>
                  )}
                </button>
                <div className="psi-reu-card-actions">
                  <Tooltip title="Editar acta">
                    <IconButton color="primary" size="small" aria-label="Editar acta" onClick={() => abrirReunion(r)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Eliminar acta">
                    <IconButton
                      color="error"
                      size="small"
                      aria-label="Eliminar acta"
                      onClick={() => eliminarReunion(r.id, r.estado)}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Button
                    variant="contained"
                    className="psi-reu-btn-pdf"
                    size="small"
                    onClick={() => descargarPdf(`/admin/psicologia/reuniones/${r.id}/pdf`, `acta_reunion_${r.id}.pdf`)}
                  >
                    PDF
                  </Button>
                </div>
              </div>
            ))}
            {!reuniones.length && <Typography className="psi-muted">Sin reuniones registradas.</Typography>}
          </Stack>
        </TabPanel>

        <TabPanel value={tab} index={4}>
          <Alert severity="info" sx={{ mb: 2 }}>
            <strong>Archivos y evidencias:</strong> utilice esta tabla para registrar material con{' '}
            <strong>nombre</strong>, <strong>detalle</strong>, archivo (imagen o PDF), <strong>fecha del documento o hecho</strong> cuando
            corresponda, y un registro de <strong>cuándo se subió</strong> y por quién.
          </Alert>
          <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
            <Button
              variant="contained"
              startIcon={<AttachFileOutlinedIcon />}
              onClick={() => {
                setArcForm({ nombre_archivo: '', detalle: '', fecha_documento: '' });
                setArcFile(null);
                if (archivoInputRef.current) archivoInputRef.current.value = '';
                setDlgArchivo(true);
              }}
            >
              Subir archivo
            </Button>
          </Stack>
          <TableContainer sx={{ borderRadius: 2, border: '1px solid #e2e8f0', bgcolor: '#fff' }}>
            <Table size="small" sx={{ minWidth: 760 }}>
              <TableHead sx={{ bgcolor: '#f8fafc' }}>
                <TableRow>
                  <TableCell>Nombre del archivo</TableCell>
                  <TableCell>Detalle</TableCell>
                  <TableCell>Fecha documento</TableCell>
                  <TableCell>Fecha de subida</TableCell>
                  <TableCell>Tipo / tamaño</TableCell>
                  <TableCell>Subido por</TableCell>
                  <TableCell align="right">Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {archivos.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell sx={{ fontWeight: 700 }}>{row.nombre_archivo}</TableCell>
                    <TableCell sx={{ maxWidth: 280 }}>
                      <Typography variant="body2" color="text.secondary">
                        {(row.detalle || '').trim() || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>{formatFechaDocPe(row.fecha_documento)}</TableCell>
                    <TableCell>{formatLimaLine(row.created_at)}</TableCell>
                    <TableCell>
                      <Typography variant="caption" display="block" sx={{ wordBreak: 'break-word' }}>
                        {row.mime_type || '—'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatBytesPsi(row.tamano_bytes)}
                      </Typography>
                    </TableCell>
                    <TableCell>{row.subido_por_nombre || '—'}</TableCell>
                    <TableCell align="right">
                      <Button size="small" onClick={() => descargarArchivoEvidencia(row.id, row.nombre_archivo)}>
                        Descargar
                      </Button>
                      <IconButton size="small" color="error" aria-label="Eliminar archivo" onClick={() => eliminarArchivoPsi(row.id)}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {!archivos.length && (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <Typography className="psi-muted" sx={{ py: 2 }}>
                        No hay archivos registrados todavía.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </TabPanel>

        <TabPanel value={tab} index={5}>
          <div className="psi-piar-hero">
            <div>
              <h2>Plan individual de ajustes razonables</h2>
              <p>
                Elabore el plan en cinco pasos. Al publicarlo, el docente lo ve en Herramientas → PIAR y la familia
                consulta la versión activa. Solo se elimina un borrador; un plan publicado se archiva o se versiona.
              </p>
            </div>
            <button type="button" onClick={abrirNuevoPiar}>
              + Nuevo PIAR
            </button>
          </div>
          <div className="psi-piar-studio-list">
            {piarLista.map((p) => {
              const apoyos = apoyosComoLista(p.ajustes_checklist_json).slice(0, 6);
              const excerpt = htmlATextoPlano(p.fortalezas);
              return (
                <article key={p.id} className="psi-piar-studio-card">
                  <div>
                    <h3>
                      Año {p.anio} · Versión {p.numero_version}
                    </h3>
                    <span className={`psi-piar-estado ${String(p.estado).toLowerCase()}`}>
                      {PIAR_ESTADO_LABEL[p.estado] || p.estado}
                    </span>
                    {p.created_at ? (
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                        {formatLimaLine(p.created_at)}
                      </Typography>
                    ) : null}
                    {excerpt ? (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        {excerpt.slice(0, 140)}
                        {excerpt.length > 140 ? '…' : ''}
                      </Typography>
                    ) : null}
                    {apoyos.length > 0 && (
                      <div className="piar-chip-row" style={{ marginTop: 10 }}>
                        {apoyos.map((a) => (
                          <span key={`${a.cat}-${a.key}`} className="piar-chip">
                            {a.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="psi-piar-studio-card__actions">
                    <Button
                      size="small"
                      variant="outlined"
                      className="psi-piar-btn-pdf"
                      onClick={() =>
                        descargarPdf(`/admin/psicologia/piar/${p.id}/pdf`, `PIAR_${p.anio}_v${p.numero_version}.pdf`)
                      }
                    >
                      PDF
                    </Button>
                    <Tooltip title="Editar PIAR">
                      <IconButton size="small" color="primary" aria-label="Editar PIAR" onClick={() => abrirEditarPiar(p)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip
                      title={
                        p.estado === 'BORRADOR'
                          ? 'Eliminar PIAR (solo borrador)'
                          : 'Solo se eliminan PIAR en BORRADOR. Archivo o nueva versión si ya está activo.'
                      }
                    >
                      <span>
                        <IconButton
                          size="small"
                          color="error"
                          aria-label="Eliminar PIAR"
                          disabled={p.estado !== 'BORRADOR'}
                          onClick={() => eliminarPiar(p.id)}
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </div>
                </article>
              );
            })}
            {!piarLista.length && <Typography className="psi-muted">Sin planes PIAR.</Typography>}
          </div>
        </TabPanel>
      </div>

      <Dialog
        open={dlgAtencion}
        onClose={() => {
          setDlgAtencion(false);
          setAtencionEditId(null);
        }}
        maxWidth="sm"
        fullWidth
        PaperProps={{ className: 'psi-dialog-paper' }}
      >
        <DialogTitle>{atencionEditId ? 'Editar atención' : 'Registrar atención'}</DialogTitle>
        <DialogContent>
          <TextField
            select
            fullWidth
            label="Tipo"
            margin="normal"
            value={atForm.tipo}
            onChange={(e) => setAtForm((f) => ({ ...f, tipo: e.target.value }))}
          >
            <MenuItem value="ALUMNO">Con el estudiante</MenuItem>
            <MenuItem value="FAMILIA">Con padres / familia</MenuItem>
            <MenuItem value="OTRO">Otro</MenuItem>
          </TextField>
          <TextField
            fullWidth
            multiline
            minRows={3}
            label="Motivo"
            margin="normal"
            value={atForm.motivo}
            onChange={(e) => setAtForm((f) => ({ ...f, motivo: e.target.value }))}
          />
          <TextField
            fullWidth
            multiline
            minRows={4}
            label="Tratamiento / intervención"
            margin="normal"
            value={atForm.tratamiento_intervencion}
            onChange={(e) => setAtForm((f) => ({ ...f, tratamiento_intervencion: e.target.value }))}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setDlgAtencion(false);
              setAtencionEditId(null);
            }}
          >
            Cancelar
          </Button>
          <Button variant="contained" onClick={guardarAtencion}>
            {atencionEditId ? 'Guardar cambios' : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={dlgDer}
        onClose={() => {
          setDlgDer(false);
          setDerivacionEditId(null);
          setDerForm(resetDerForm());
        }}
        maxWidth="md"
        fullWidth
        PaperProps={{ className: 'psi-dialog-paper' }}
      >
        <DialogTitle>{derivacionEditId ? 'Editar ficha de derivación' : 'Ficha de derivación psicológica'}</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            <strong>Cómo se usa aquí:</strong> en esta pantalla de <strong>administración / psicología</strong> usted registra la{' '}
            <strong>recepción</strong> de la derivación (caso que llega desde aula). Elija el <strong>docente que deriva</strong> en el
            listado; si su usuario tiene ficha de personal docente, puede aparecer preseleccionado. Más adelante, si el docente completa
            la ficha desde su propio perfil, allí figurará su nombre y firma automáticamente.
          </Alert>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Motivos (marque los que correspondan)
          </Typography>
          <FormGroup row sx={{ flexWrap: 'wrap' }}>
            {MOTIVOS_DER.map((m) => (
              <FormControlLabel
                key={m.key}
                control={
                  <Checkbox
                    checked={derForm.motivos_sel.includes(m.key)}
                    onChange={() => toggleMotivo(m.key)}
                  />
                }
                label={m.label}
              />
            ))}
          </FormGroup>
          <TextField
            fullWidth
            label="Otro motivo (texto)"
            margin="normal"
            value={derForm.motivo_otro}
            onChange={(e) => setDerForm((f) => ({ ...f, motivo_otro: e.target.value }))}
          />
          <TextField
            fullWidth
            multiline
            minRows={4}
            label="Descripción del caso *"
            margin="normal"
            value={derForm.descripcion_caso}
            onChange={(e) => setDerForm((f) => ({ ...f, descripcion_caso: e.target.value }))}
          />
          <TextField
            fullWidth
            multiline
            minRows={2}
            label="Estrategias aplicadas en aula"
            margin="normal"
            value={derForm.estrategias_aula}
            onChange={(e) => setDerForm((f) => ({ ...f, estrategias_aula: e.target.value }))}
          />
          <TextField
            select
            fullWidth
            label="Urgencia"
            margin="normal"
            value={derForm.urgencia}
            onChange={(e) => setDerForm((f) => ({ ...f, urgencia: e.target.value }))}
          >
            <MenuItem value="ALTA">Alta</MenuItem>
            <MenuItem value="MEDIA">Media</MenuItem>
            <MenuItem value="BAJA">Baja</MenuItem>
          </TextField>
          <TextField
            select
            fullWidth
            label="Docente que deriva"
            margin="normal"
            value={derForm.docente_personal_id}
            onChange={(e) => setDerForm((f) => ({ ...f, docente_personal_id: e.target.value }))}
          >
            <MenuItem value="">(No indicado)</MenuItem>
            {(meta?.docentes || []).map((d) => (
              <MenuItem key={d.id} value={String(d.id)}>
                {d.nombre}
              </MenuItem>
            ))}
          </TextField>
          <Typography variant="subtitle2" sx={{ mt: 2 }}>
            Firma del docente (opcional)
          </Typography>
          <PsicologiaSignaturePad
            onChange={(dataUrl) => setDerForm((f) => ({ ...f, firma_docente_imagen: dataUrl }))}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setDlgDer(false);
              setDerivacionEditId(null);
              setDerForm(resetDerForm());
            }}
          >
            Cancelar
          </Button>
          <Button variant="contained" onClick={guardarDerivacion}>
            {derivacionEditId ? 'Guardar cambios' : 'Registrar recepción'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={dlgReu}
        onClose={() => setDlgReu(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ className: 'psi-dialog-paper' }}
      >
        <DialogTitle>Acta de reunión con padres</DialogTitle>
        <DialogContent>
          <Box className="psi-form-section">
          <TextField
            fullWidth
            multiline
            minRows={2}
            label="Participantes"
            margin="normal"
            value={reuForm.participantes}
            onChange={(e) => setReuForm((f) => ({ ...f, participantes: e.target.value }))}
          />
          <TextField
            fullWidth
            multiline
            minRows={2}
            label="Temas tratados"
            margin="normal"
            value={reuForm.temas_tratados}
            onChange={(e) => setReuForm((f) => ({ ...f, temas_tratados: e.target.value }))}
          />
          <TextField
            fullWidth
            multiline
            minRows={2}
            label="Acuerdos"
            margin="normal"
            value={reuForm.acuerdos}
            onChange={(e) => setReuForm((f) => ({ ...f, acuerdos: e.target.value }))}
          />
          <TextField
            fullWidth
            multiline
            minRows={2}
            label="Compromisos de la familia"
            margin="normal"
            value={reuForm.compromisos_familia}
            onChange={(e) => setReuForm((f) => ({ ...f, compromisos_familia: e.target.value }))}
          />
          <TextField
            fullWidth
            multiline
            minRows={2}
            label="Compromisos del colegio"
            margin="normal"
            value={reuForm.compromisos_colegio}
            onChange={(e) => setReuForm((f) => ({ ...f, compromisos_colegio: e.target.value }))}
          />
          </Box>
          <Typography variant="subtitle2" sx={{ mt: 2 }}>
            Firma padre/madre
          </Typography>
          <PsicologiaSignaturePad
            onChange={(dataUrl) => setReuForm((f) => ({ ...f, firma_padre_imagen: dataUrl }))}
          />
          <Typography variant="subtitle2" sx={{ mt: 2 }}>
            Firma psicología
          </Typography>
          <PsicologiaSignaturePad
            onChange={(dataUrl) => setReuForm((f) => ({ ...f, firma_psicologia_imagen: dataUrl }))}
          />
          <Typography variant="subtitle2" sx={{ mt: 2 }}>
            Firma docente (opcional)
          </Typography>
          <PsicologiaSignaturePad
            onChange={(dataUrl) => setReuForm((f) => ({ ...f, firma_docente_imagen: dataUrl }))}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDlgReu(false)}>Cerrar ventana</Button>
          <Button onClick={guardarReunionBorrador}>Guardar borrador</Button>
          <Button variant="contained" onClick={cerrarReunion}>
            Cerrar acta
          </Button>
        </DialogActions>
      </Dialog>

      <PiarWizard
        open={dlgPiar}
        editing={piarEditing}
        form={piarForm}
        setForm={setPiarForm}
        meta={meta}
        alumnoNombre={nombre}
        seguimientoItems={seguimientoItems}
        seguimientoNuevo={seguimientoNuevo}
        setSeguimientoNuevo={setSeguimientoNuevo}
        onAgregarNota={agregarSeguimientoAdmin}
        onClose={() => {
          setDlgPiar(false);
          setSeguimientoItems([]);
          setSeguimientoNuevo('');
        }}
        onGuardar={guardarPiar}
        guardando={piarGuardando}
        formatLimaLine={formatLimaLine}
      />

      <Dialog
        open={false}
        onClose={() => {
          setDlgPiar(false);
          setSeguimientoItems([]);
          setSeguimientoNuevo('');
        }}
        maxWidth="md"
        fullWidth
        PaperProps={{ className: 'psi-dialog-paper' }}
      >
        <DialogTitle>{piarEditing ? 'Editar PIAR' : 'Nuevo PIAR'}</DialogTitle>
        <DialogContent>
          <Box
            className="psi-piar-modal-section-psicologo"
            sx={{
              mb: 2,
              p: 2,
              borderRadius: 2,
              border: '2px solid #a78bfa',
              background: 'linear-gradient(180deg,#faf5ff 0%,#ede9fe 100%)',
            }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#5b21b6', mb: 1.5 }}>
              Plan PIAR — Psicología / equipo educativo
            </Typography>
          {!piarEditing && (
            <TextField
              fullWidth
              type="number"
              label="Año escolar"
              margin="normal"
              value={piarForm.anio}
              onChange={(e) => setPiarForm((f) => ({ ...f, anio: e.target.value }))}
            />
          )}
          <TextField
            fullWidth
            multiline
            minRows={2}
            label="Diagnóstico (si aplica)"
            margin="normal"
            value={piarForm.diagnostico}
            onChange={(e) => setPiarForm((f) => ({ ...f, diagnostico: e.target.value }))}
          />
          <TextField
            fullWidth
            multiline
            minRows={2}
            label="Fortalezas"
            margin="normal"
            value={piarForm.fortalezas}
            onChange={(e) => setPiarForm((f) => ({ ...f, fortalezas: e.target.value }))}
          />
          <TextField
            fullWidth
            multiline
            minRows={2}
            label="Áreas de dificultad"
            margin="normal"
            value={piarForm.areas_dificultad}
            onChange={(e) => setPiarForm((f) => ({ ...f, areas_dificultad: e.target.value }))}
          />
          <TextField
            fullWidth
            label="Estilo de aprendizaje"
            margin="normal"
            value={piarForm.estilo_aprendizaje}
            onChange={(e) => setPiarForm((f) => ({ ...f, estilo_aprendizaje: e.target.value }))}
          />
          <TextField
            fullWidth
            multiline
            minRows={2}
            label="Observaciones relevantes"
            margin="normal"
            value={piarForm.observaciones_relevantes}
            onChange={(e) => setPiarForm((f) => ({ ...f, observaciones_relevantes: e.target.value }))}
          />
          <TextField
            select
            fullWidth
            label="Docente responsable (aparece en su menú: Herramientas → PIAR)"
            margin="normal"
            value={piarForm.docente_responsable_personal_id != null ? String(piarForm.docente_responsable_personal_id) : ''}
            onChange={(e) => setPiarForm((f) => ({ ...f, docente_responsable_personal_id: e.target.value }))}
          >
            <MenuItem value="">(No indicado)</MenuItem>
            {(meta?.docentes || []).map((d) => (
              <MenuItem key={d.id} value={String(d.id)}>
                {d.nombre}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            fullWidth
            label="Coordinador (seguimiento PIAR)"
            margin="normal"
            value={piarForm.coordinador_personal_id != null ? String(piarForm.coordinador_personal_id) : ''}
            onChange={(e) => setPiarForm((f) => ({ ...f, coordinador_personal_id: e.target.value }))}
          >
            <MenuItem value="">(No indicado)</MenuItem>
            {(meta?.personal || []).map((d) => (
              <MenuItem key={d.id} value={String(d.id)}>
                {d.nombre}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            fullWidth
            type="date"
            label="Fecha de revisión programada"
            margin="normal"
            InputLabelProps={{ shrink: true }}
            value={piarForm.fecha_revision ? String(piarForm.fecha_revision).slice(0, 10) : ''}
            onChange={(e) => setPiarForm((f) => ({ ...f, fecha_revision: e.target.value }))}
          />
          <TextField
            fullWidth
            multiline
            minRows={2}
            label="Ajustes necesarios en revisión"
            margin="normal"
            value={piarForm.ajustes_necesarios_revision}
            onChange={(e) => setPiarForm((f) => ({ ...f, ajustes_necesarios_revision: e.target.value }))}
          />
          <Typography variant="subtitle2" sx={{ mt: 2 }}>
            Seguimiento (indicadores)
          </Typography>
          <FormGroup row sx={{ flexWrap: 'wrap' }}>
            {[
              ['participacion', 'Participación'],
              ['comprension', 'Comprensión'],
              ['autonomia', 'Autonomía'],
            ].map(([key, label]) => (
              <FormControlLabel
                key={key}
                control={
                  <Checkbox
                    size="small"
                    checked={Boolean(piarForm.evaluacion_kpi[key])}
                    onChange={() =>
                      setPiarForm((f) => ({
                        ...f,
                        evaluacion_kpi: { ...f.evaluacion_kpi, [key]: !f.evaluacion_kpi[key] },
                      }))
                    }
                  />
                }
                label={label}
              />
            ))}
          </FormGroup>
          <TextField
            select
            fullWidth
            label="Escala de progreso"
            margin="normal"
            value={piarForm.evaluacion_kpi.escala || 'en_proceso'}
            onChange={(e) =>
              setPiarForm((f) => ({
                ...f,
                evaluacion_kpi: { ...f.evaluacion_kpi, escala: e.target.value },
              }))
            }
          >
            <MenuItem value="en_proceso">En proceso</MenuItem>
            <MenuItem value="satisfactorio">Satisfactorio</MenuItem>
            <MenuItem value="requiere_refuerzo">Requiere refuerzo</MenuItem>
          </TextField>
          <Typography variant="subtitle2" sx={{ mt: 2 }}>
            Ajustes razonables (checklist)
          </Typography>
          {Object.entries({}).map(([cat, items]) => (
            <Box key={cat} sx={{ mb: 1 }}>
              <Typography variant="caption" fontWeight={700} textTransform="uppercase">
                {cat}
              </Typography>
              <div className="psi-chip-row">
                {items.map((it) => (
                  <FormControlLabel
                    key={it.key}
                    control={
                      <Checkbox
                        size="small"
                        checked={(piarForm.ajustes[cat] || []).includes(it.key)}
                        onChange={() => togglePiarCheck(cat, it.key)}
                      />
                    }
                    label={it.label}
                  />
                ))}
              </div>
            </Box>
          ))}
          {piarForm.objetivos.map((o, i) => (
            <Stack key={i} direction="row" spacing={1} sx={{ mt: 1 }}>
              <TextField
                fullWidth
                label={`Objetivo ${i + 1}`}
                value={o.objetivo}
                onChange={(e) => {
                  const next = [...piarForm.objetivos];
                  next[i] = { ...next[i], objetivo: e.target.value };
                  setPiarForm((f) => ({ ...f, objetivos: next }));
                }}
              />
              <TextField
                fullWidth
                label="Indicador"
                value={o.indicador}
                onChange={(e) => {
                  const next = [...piarForm.objetivos];
                  next[i] = { ...next[i], indicador: e.target.value };
                  setPiarForm((f) => ({ ...f, objetivos: next }));
                }}
              />
            </Stack>
          ))}
          <TextField
            select
            fullWidth
            label="Estado del PIAR"
            margin="normal"
            value={piarForm.estado}
            onChange={(e) => setPiarForm((f) => ({ ...f, estado: e.target.value }))}
          >
            <MenuItem value="BORRADOR">Borrador</MenuItem>
            <MenuItem value="ACTIVO">Activo (archiva otros activos del mismo año)</MenuItem>
            <MenuItem value="ARCHIVADO">Archivado</MenuItem>
          </TextField>
          {piarEditing?.id ? (
            <Box className="psi-form-section" sx={{ mt: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 0.75, fontWeight: 800 }}>
                Seguimiento (bitácora cronológica)
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                Cada nota queda fechada. Puede registrar psicología aquí; el docente asignado registra desde su intranet las suyas (mismo
                historial).
              </Typography>
              <Stack spacing={1} sx={{ mb: 1.5, maxHeight: 220, overflow: 'auto' }}>
                {seguimientoItems.map((s) => (
                  <Box key={s.id} sx={{ p: 1, bgcolor: '#f8fafc', borderRadius: 1, border: '1px solid #e2e8f0' }}>
                    <Typography variant="caption" color="text.secondary">
                      {s.autor_tipo === 'DOCENTE' ? 'Docente' : 'Psicología / admin'} · {formatLimaLine(s.created_at)}
                    </Typography>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                      {s.contenido}
                    </Typography>
                  </Box>
                ))}
                {!seguimientoItems.length && (
                  <Typography variant="body2" color="text.secondary">
                    Aún no hay notas de seguimiento.
                  </Typography>
                )}
              </Stack>
              <TextField
                fullWidth
                multiline
                minRows={2}
                label="Nueva nota (psicología / admin)"
                value={seguimientoNuevo}
                onChange={(e) => setSeguimientoNuevo(e.target.value)}
              />
              <Button sx={{ mt: 1 }} variant="outlined" onClick={agregarSeguimientoAdmin} disabled={!String(seguimientoNuevo || '').trim()}>
                Registrar nota
              </Button>
            </Box>
          ) : null}
          </Box>

          <Box
            className="psi-piar-modal-section-docente"
            sx={{
              mb: 1,
              p: 2,
              borderRadius: 2,
              border: '2px solid #14b8a6',
              background: 'linear-gradient(180deg,#f0fdfa 0%,#ccfbf1 100%)',
            }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#0f766e', mb: 1 }}>
              Seguimiento en aula — Docente
            </Typography>
            <Alert severity="success" sx={{ mb: 1.5, bgcolor: 'rgba(255,255,255,0.85)' }}>
              <strong>Solo el docente</strong> completa habitualmente estos tres campos desde <strong>Herramientas → PIAR</strong>.
              Aquí puede consensuar borradores o dejarlos vacíos; el color <strong>verde / turquesa</strong> distingue esta zona del plan de
              psicología (violeta arriba). La <strong>bitácora</strong> queda en la sección violeta: docente y psicología comparten el mismo
              historial.
            </Alert>
            <TextField
              fullWidth
              multiline
              minRows={3}
              label="Estrategias y seguimiento en aula (compromiso docente)"
              margin="dense"
              value={piarForm.estrategias_docentes}
              onChange={(e) => setPiarForm((f) => ({ ...f, estrategias_docentes: e.target.value }))}
            />
            <TextField
              fullWidth
              multiline
              minRows={2}
              label="Frecuencia de aplicación / revisión en aula"
              margin="dense"
              value={piarForm.frecuencia_aplicacion}
              onChange={(e) => setPiarForm((f) => ({ ...f, frecuencia_aplicacion: e.target.value }))}
            />
            <TextField
              fullWidth
              multiline
              minRows={2}
              label="Avances observados"
              margin="dense"
              value={piarForm.avances_observados}
              onChange={(e) => setPiarForm((f) => ({ ...f, avances_observados: e.target.value }))}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setDlgPiar(false);
              setSeguimientoItems([]);
              setSeguimientoNuevo('');
            }}
          >
            Cancelar
          </Button>
          <Button variant="contained" onClick={guardarPiar}>
            Guardar PIAR
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={dlgArchivo}
        onClose={resetDlgArchivo}
        maxWidth="sm"
        fullWidth
        PaperProps={{ className: 'psi-dialog-paper' }}
      >
        <DialogTitle>Subir archivo de evidencia</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            margin="normal"
            label="Nombre del archivo (título visible)"
            required
            value={arcForm.nombre_archivo}
            onChange={(e) => setArcForm((f) => ({ ...f, nombre_archivo: e.target.value }))}
          />
          <TextField
            fullWidth
            multiline
            minRows={3}
            margin="normal"
            label="Detalle / descripción"
            value={arcForm.detalle}
            onChange={(e) => setArcForm((f) => ({ ...f, detalle: e.target.value }))}
          />
          <TextField
            fullWidth
            type="date"
            margin="normal"
            label="Fecha del documento o del hecho (opcional)"
            InputLabelProps={{ shrink: true }}
            value={arcForm.fecha_documento || ''}
            onChange={(e) => setArcForm((f) => ({ ...f, fecha_documento: e.target.value }))}
          />
          <input
            ref={archivoInputRef}
            type="file"
            accept="image/*,.pdf,application/pdf"
            style={{ display: 'none' }}
            onChange={(e) => setArcFile(e.target.files?.[0] || null)}
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} sx={{ mt: 2 }}>
            <Button variant="outlined" onClick={() => archivoInputRef.current?.click()}>
              Seleccionar archivo…
            </Button>
            <Typography variant="body2" color={arcFile ? 'text.primary' : 'text.secondary'} sx={{ wordBreak: 'break-word' }}>
              {arcFile ? arcFile.name : 'Imagen o PDF (obligatorio)'}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={resetDlgArchivo}>Cancelar</Button>
          <Button variant="contained" onClick={guardarArchivoPsi}>
            Subir
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(resumenVer)}
        onClose={() => setResumenVer(null)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ className: 'psi-dialog-paper' }}
      >
        <DialogTitle>Detalle del movimiento</DialogTitle>
        <DialogContent>
          {resumenVer && (
            <Stack spacing={1.25}>
              <div>
                <Typography variant="caption" color="text.secondary">
                  Tipo
                </Typography>
                <Typography variant="subtitle1">
                  {TIMELINE_TIPO_LABEL[resumenVer.tipo] || resumenVer.tipo}
                </Typography>
              </div>
              <div>
                <Typography variant="caption" color="text.secondary">
                  Fecha y hora (Lima)
                </Typography>
                <Typography variant="subtitle1">
                  {formatLimaFechaHora(resumenVer.cuando).fecha}
                  {formatLimaFechaHora(resumenVer.cuando).hora
                    ? ` · ${formatLimaFechaHora(resumenVer.cuando).hora}`
                    : ''}
                </Typography>
              </div>
              {resumenVer.subtipo ? (
                <div>
                  <Typography variant="caption" color="text.secondary">
                    Subtipo / estado
                  </Typography>
                  <Typography variant="body1">{resumenVer.subtipo}</Typography>
                </div>
              ) : null}
              {resumenVer.titulo ? (
                <div>
                  <Typography variant="caption" color="text.secondary">
                    Resumen
                  </Typography>
                  <Typography variant="body1">{resumenVer.titulo}</Typography>
                </div>
              ) : null}
              {tabIndexPorTimelineTipo(resumenVer.tipo) > 0 ? (
                <Button
                  variant="contained"
                  onClick={() => {
                    setTab(tabIndexPorTimelineTipo(resumenVer.tipo));
                    setResumenVer(null);
                  }}
                >
                  Ir a la pestaña
                </Button>
              ) : null}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResumenVer(null)}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
