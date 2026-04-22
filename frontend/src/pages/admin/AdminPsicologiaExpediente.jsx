import React, { useCallback, useEffect, useState } from 'react';
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
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import api from '../../services/api';
import Swal from 'sweetalert2';
import { useAuth } from '../../context/AuthContext';
import PsicologiaSignaturePad from '../../components/PsicologiaSignaturePad';
import './AdminPsicologia.css';

const MOTIVOS_DER = [
  { key: 'conducta_disruptiva', label: 'Conducta disruptiva' },
  { key: 'dificultades_aprendizaje', label: 'Dificultades de aprendizaje' },
  { key: 'problemas_emocionales', label: 'Problemas emocionales' },
  { key: 'socializacion', label: 'Problemas de socialización' },
  { key: 'sospecha_nee', label: 'Sospecha de NEE' },
];

const PIAR_CHECKS = {
  metodologia: [
    { key: 'material_visual', label: 'Material visual' },
    { key: 'instrucciones_paso', label: 'Instrucciones paso a paso' },
    { key: 'bloques_cortos', label: 'Trabajo por bloques cortos' },
    { key: 'proyectos', label: 'Aprendizaje basado en proyectos' },
  ],
  tiempo: [
    { key: 'tiempo_extendido', label: 'Tiempo extendido en tareas' },
    { key: 'pausas_activas', label: 'Pausas activas' },
  ],
  evaluacion: [
    { key: 'oral', label: 'Evaluación oral' },
    { key: 'imagenes_om', label: 'Imágenes / opción múltiple' },
    { key: 'menos_preguntas', label: 'Reducción de preguntas' },
    { key: 'tecnologia', label: 'Tecnología (audio/video)' },
  ],
  ambiente: [
    { key: 'ubicacion_preferente', label: 'Ubicación preferencial' },
    { key: 'menos_distractores', label: 'Reducción de distractores' },
    { key: 'rutinas', label: 'Rutinas estructuradas' },
  ],
};

function emptyAjustes() {
  return { metodologia: [], tiempo: [], evaluacion: [], ambiente: [] };
}

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

const TIMELINE_TIPO_LABEL = {
  atencion: 'Atención',
  derivacion: 'Derivación',
  reunion: 'Reunión / acta',
  piar: 'PIAR',
};

function tabIndexPorTimelineTipo(tipo) {
  const m = { atencion: 1, derivacion: 2, reunion: 3, piar: 4 };
  return m[String(tipo)] ?? 0;
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

  const [tab, setTab] = useState(0);
  const [meta, setMeta] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [atenciones, setAtenciones] = useState([]);
  const [derivaciones, setDerivaciones] = useState([]);
  const [reuniones, setReuniones] = useState([]);
  const [piarLista, setPiarLista] = useState([]);
  const [loadErr, setLoadErr] = useState(null);
  const [loading, setLoading] = useState(true);

  const [dlgAtencion, setDlgAtencion] = useState(false);
  const [atForm, setAtForm] = useState({ tipo: 'ALUMNO', motivo: '', tratamiento_intervencion: '' });

  const [dlgDer, setDlgDer] = useState(false);
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

  const reloadAll = useCallback(async () => {
    setLoadErr(null);
    setLoading(true);
    try {
      const [m, r, t, a, d, re, p] = await Promise.all([
        api.get('/admin/psicologia/meta').catch(() => ({ data: {} })),
        api.get(`/admin/psicologia/alumnos/${alumnoId}/resumen`),
        api.get(`/admin/psicologia/alumnos/${alumnoId}/timeline`),
        api.get(`/admin/psicologia/alumnos/${alumnoId}/atenciones`),
        api.get(`/admin/psicologia/alumnos/${alumnoId}/derivaciones`),
        api.get(`/admin/psicologia/alumnos/${alumnoId}/reuniones`),
        api.get(`/admin/psicologia/alumnos/${alumnoId}/piar`),
      ]);
      setMeta(m.data);
      setResumen(r.data);
      setTimeline(t.data?.items || []);
      setAtenciones(a.data?.atenciones || []);
      setDerivaciones(d.data?.derivaciones || []);
      setReuniones(re.data?.reuniones || []);
      setPiarLista(p.data?.piar_lista || []);
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

  /** Si el usuario logueado es personal docente, preseleccionar en la ficha de derivación. */
  useEffect(() => {
    if (!dlgDer || !meta?.docentes?.length) return;
    const pid = user?.personal_id != null ? String(user.personal_id) : '';
    if (!pid) return;
    const existe = meta.docentes.some((d) => String(d.id) === pid);
    if (existe) {
      setDerForm((f) => ({ ...f, docente_personal_id: f.docente_personal_id || pid }));
    }
  }, [dlgDer, meta, user?.personal_id]);

  const guardarAtencion = async () => {
    try {
      await api.post(`/admin/psicologia/alumnos/${alumnoId}/atenciones`, {
        ...atForm,
        matricula_id: matriculaId || null,
      });
      Swal.fire({ icon: 'success', title: 'Registrado', timer: 1400, showConfirmButton: false });
      setDlgAtencion(false);
      setAtForm({ tipo: 'ALUMNO', motivo: '', tratamiento_intervencion: '' });
      reloadAll();
    } catch (e) {
      Swal.fire({ icon: 'error', title: e.response?.data?.error || 'Error' });
    }
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

  const guardarDerivacion = async () => {
    try {
      await api.post(`/admin/psicologia/alumnos/${alumnoId}/derivaciones`, {
        matricula_id: matriculaId || null,
        motivos_json: derForm.motivos_sel,
        motivo_otro: derForm.motivo_otro,
        descripcion_caso: derForm.descripcion_caso,
        estrategias_aula: derForm.estrategias_aula,
        urgencia: derForm.urgencia,
        docente_personal_id: derForm.docente_personal_id || null,
        firma_docente_imagen: derForm.firma_docente_imagen || null,
        firma_docente_fecha: derForm.firma_docente_imagen ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null,
        recepcion_psicologia_personal_id:
          user?.personal_id != null ? parseInt(user.personal_id, 10) : null,
        recepcion_psicologia_fecha: new Date().toISOString().slice(0, 19).replace('T', ' '),
      });
      Swal.fire({ icon: 'success', title: 'Derivación registrada', timer: 1400, showConfirmButton: false });
      setDlgDer(false);
      setDerForm({
        motivos_sel: [],
        motivo_otro: '',
        descripcion_caso: '',
        estrategias_aula: '',
        urgencia: 'MEDIA',
        docente_personal_id: '',
        firma_docente_imagen: '',
      });
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

  const eliminarReunion = async (id) => {
    const ok = await Swal.fire({
      title: '¿Eliminar esta acta?',
      text: 'Solo use esta opción para borradores que no necesite. No se puede deshacer.',
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

  const guardarPiar = async () => {
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
        estado: piarForm.estado,
        fecha_elaboracion: new Date().toISOString().slice(0, 10),
      };
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
          <Typography variant="h5" sx={{ mt: 1, fontWeight: 800, color: '#1e293b' }}>
            {nombre}
          </Typography>
          {matriculaId && (
            <Typography variant="body2" color="text.secondary">
              Matrícula de referencia: #{matriculaId}
            </Typography>
          )}
        </div>
        <Button variant="outlined" onClick={reloadAll} disabled={loading}>
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
      </div>

      <div className="psi-tabs-wrap">
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable">
          <Tab label="Resumen" />
          <Tab label="Atenciones" />
          <Tab label="Derivaciones" />
          <Tab label="Reuniones / acta" />
          <Tab label="PIAR" />
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
                    <Button
                      size="small"
                      variant="outlined"
                      className="psi-btn-ghost"
                      onClick={() => setResumenVer(it)}
                    >
                      Ver
                    </Button>
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
            <Button variant="contained" onClick={() => setDlgAtencion(true)}>
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
                  <Typography variant="caption" color="text.secondary">
                    {a.fecha_hora} · {a.registrado_por_nombre || '—'}
                  </Typography>
                </Stack>
                <Typography variant="subtitle2" sx={{ mt: 1 }}>
                  Motivo
                </Typography>
                <Typography variant="body2">{a.motivo}</Typography>
                <Typography variant="subtitle2" sx={{ mt: 1 }}>
                  Tratamiento / intervención
                </Typography>
                <Typography variant="body2">{a.tratamiento_intervencion}</Typography>
                <Button size="small" color="error" sx={{ mt: 1 }} onClick={() => eliminarAtencion(a.id)}>
                  Eliminar
                </Button>
              </Box>
            ))}
            {!atenciones.length && <Typography className="psi-muted">No hay atenciones registradas.</Typography>}
          </Stack>
        </TabPanel>

        <TabPanel value={tab} index={2}>
          <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
            <Button variant="contained" onClick={() => setDlgDer(true)}>
              + Nueva derivación
            </Button>
          </Stack>
          <Stack spacing={1.5}>
            {derivaciones.map((d) => (
              <Box key={d.id} sx={{ p: 2, borderRadius: 2, border: '1px solid #fed7aa', bgcolor: '#fffbeb' }}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Chip label={d.estado} size="small" />
                  <Chip label={d.urgencia} size="small" color="warning" variant="outlined" />
                  {d.docente_nombre && (
                    <Typography variant="caption">Docente: {d.docente_nombre}</Typography>
                  )}
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
          <Stack spacing={1}>
            {reuniones.map((r) => (
              <Stack key={r.id} direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="center">
                <Button
                  variant="outlined"
                  sx={{ flex: 1, justifyContent: 'space-between', textAlign: 'left', py: 1.5 }}
                  onClick={() => abrirReunion(r)}
                >
                  <span>
                    Acta #{r.id} — {r.estado}
                    {r.facilitador_nombre ? ` · ${r.facilitador_nombre}` : ''}
                  </span>
                  <span>✎</span>
                </Button>
                <Stack direction="row" spacing={0.5} alignItems="center">
                  {r.estado === 'BORRADOR' && (
                    <IconButton
                      color="error"
                      size="small"
                      aria-label="Eliminar acta"
                      onClick={() => eliminarReunion(r.id)}
                    >
                      <DeleteOutlineIcon />
                    </IconButton>
                  )}
                  <Button
                    variant="contained"
                    color="secondary"
                    sx={{ minWidth: 110 }}
                    onClick={() => descargarPdf(`/admin/psicologia/reuniones/${r.id}/pdf`, `acta_reunion_${r.id}.pdf`)}
                  >
                    PDF
                  </Button>
                </Stack>
              </Stack>
            ))}
            {!reuniones.length && <Typography className="psi-muted">Sin reuniones registradas.</Typography>}
          </Stack>
        </TabPanel>

        <TabPanel value={tab} index={4}>
          <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
            <Button variant="contained" onClick={abrirNuevoPiar}>
              + Nuevo PIAR (nueva versión)
            </Button>
          </Stack>
          <Stack spacing={1.5}>
            {piarLista.map((p) => (
              <Box key={p.id} sx={{ p: 2, borderRadius: 2, border: '1px solid #ddd6fe', bgcolor: '#faf5ff' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
                  <Typography fontWeight={700}>
                    Año {p.anio} · Versión {p.numero_version} · {p.estado}
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => descargarPdf(`/admin/psicologia/piar/${p.id}/pdf`, `PIAR_${p.anio}_v${p.numero_version}.pdf`)}
                    >
                      PDF
                    </Button>
                    <Button size="small" variant="contained" onClick={() => abrirEditarPiar(p)}>
                      Editar
                    </Button>
                  </Stack>
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {(p.diagnostico || '').slice(0, 120)}
                  {(p.diagnostico || '').length > 120 ? '…' : ''}
                </Typography>
              </Box>
            ))}
            {!piarLista.length && <Typography className="psi-muted">Sin planes PIAR.</Typography>}
          </Stack>
        </TabPanel>
      </div>

      <Dialog
        open={dlgAtencion}
        onClose={() => setDlgAtencion(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ className: 'psi-dialog-paper' }}
      >
        <DialogTitle>Registrar atención</DialogTitle>
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
          <Button onClick={() => setDlgAtencion(false)}>Cancelar</Button>
          <Button variant="contained" onClick={guardarAtencion}>
            Guardar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={dlgDer}
        onClose={() => setDlgDer(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ className: 'psi-dialog-paper' }}
      >
        <DialogTitle>Ficha de derivación psicológica</DialogTitle>
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
          <Button onClick={() => setDlgDer(false)}>Cancelar</Button>
          <Button variant="contained" onClick={guardarDerivacion}>
            Registrar recepción
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

      <Dialog
        open={dlgPiar}
        onClose={() => setDlgPiar(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ className: 'psi-dialog-paper' }}
      >
        <DialogTitle>{piarEditing ? 'Editar PIAR' : 'Nuevo PIAR'}</DialogTitle>
        <DialogContent>
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
          <Typography variant="subtitle2" sx={{ mt: 2 }}>
            Ajustes razonables (checklist)
          </Typography>
          {Object.entries(PIAR_CHECKS).map(([cat, items]) => (
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
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDlgPiar(false)}>Cancelar</Button>
          <Button variant="contained" onClick={guardarPiar}>
            Guardar PIAR
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
