import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  FormControl,
  FormControlLabel,
  FormGroup,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
  Alert
} from '@mui/material';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import Swal from 'sweetalert2';
import './AdminUsuarios.css';
import './AdminEncuestas.css';

const AUDIENCIAS = [
  { value: 'ALUMNO', label: 'Alumnos' },
  { value: 'APODERADO', label: 'Apoderados' },
  { value: 'DOCENTE', label: 'Docentes' },
  { value: 'PROMOTORIA', label: 'Promotoría' },
  { value: 'ADMINISTRADOR', label: 'Administradores' },
  { value: 'TODOS', label: 'Todos los usuarios' }
];

const TIPOS_PREG = [
  { value: 'marcar', label: 'Marcar (radio/checkbox)' },
  { value: 'lista', label: 'Lista (desplegable)' },
  { value: 'texto_corto', label: 'Texto corto' },
  { value: 'texto_largo', label: 'Texto largo' },
  { value: 'escala', label: 'Escala numérica' },
  { value: 'titulo', label: 'Solo título / sección' }
];

function nuevaPregunta() {
  return {
    texto_pregunta: '',
    subtitulo: '',
    tipo_interfaz: 'marcar',
    obligatoria: true,
    opciones: { opciones: ['Opción 1', 'Opción 2'], multiple: false, min: 1, max: 5, etiqueta_min: '', etiqueta_max: '' }
  };
}

export default function AdminEncuestaEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const esNueva = !id || id === 'nueva';
  const [loading, setLoading] = useState(!esNueva);
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [mensaje, setMensaje] = useState('¡Gracias por tu participación!');
  const [categoria, setCategoria] = useState('');
  const [audiencias, setAudiencias] = useState([]);
  const [estadoEncuesta, setEstadoEncuesta] = useState('ACTIVO');
  const [preguntas, setPreguntas] = useState([nuevaPregunta()]);
  const [preguntaExpandida, setPreguntaExpandida] = useState(false);
  const [tieneRespuestas, setTieneRespuestas] = useState(false);

  useEffect(() => {
    if (esNueva) return;
    let c = false;
    (async () => {
      try {
        const { data } = await api.get(`/encuestas/admin/${id}`);
        if (c) return;
        const e = data.encuesta;
        setTitulo(e.titulo || '');
        setDescripcion(e.descripcion || '');
        setFechaInicio(e.fecha_inicio ? String(e.fecha_inicio).slice(0, 10) : '');
        setFechaFin(e.fecha_fin ? String(e.fecha_fin).slice(0, 10) : '');
        setMensaje(e.mensaje_agradecimiento || '¡Gracias por tu participación!');
        setCategoria(e.categoria_metrica || '');
        setEstadoEncuesta(String(e.estado || 'ACTIVO').toUpperCase() === 'INACTIVO' ? 'INACTIVO' : 'ACTIVO');
        setAudiencias((data.audiencias || []).filter((t) => t !== 'PERSONAL'));
        const pr = (data.preguntas || []).map((p) => ({
          id: p.id,
          texto_pregunta: p.texto_pregunta,
          subtitulo: p.subtitulo || '',
          tipo_interfaz: p.tipo_interfaz || 'texto_corto',
          obligatoria: p.obligatoria !== false,
          opciones: p.opciones && Object.keys(p.opciones).length ? p.opciones : nuevaPregunta().opciones
        }));
        setPreguntas(pr.length ? pr : [nuevaPregunta()]);
        const st = await api.get(`/encuestas/admin/${id}/estadisticas`).catch(() => ({ data: { totalRespuestas: 0 } }));
        setTieneRespuestas((st.data?.totalRespuestas || 0) > 0);
      } catch (err) {
        Swal.fire('Error', err.response?.data?.error || 'No se pudo cargar', 'error');
        navigate('/admin/herramientas/encuestas');
      } finally {
        if (!c) setLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [id, esNueva, navigate]);

  const toggleAud = (v) => {
    setAudiencias((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  };

  const actualizarPregunta = (idx, campo, val) => {
    setPreguntas((prev) => {
      const n = [...prev];
      n[idx] = { ...n[idx], [campo]: val };
      return n;
    });
  };

  const actualizarOpciones = (idx, patch) => {
    setPreguntas((prev) => {
      const n = [...prev];
      n[idx] = { ...n[idx], opciones: { ...n[idx].opciones, ...patch } };
      return n;
    });
  };

  const mover = (idx, dir) => {
    setPreguntas((prev) => {
      const j = dir === 'up' ? idx - 1 : idx + 1;
      if (j < 0 || j >= prev.length) return prev;
      const n = [...prev];
      [n[idx], n[j]] = [n[j], n[idx]];
      return n;
    });
    setPreguntaExpandida(false);
  };

  const eliminarPregunta = (idx) => {
    setPreguntas((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
    setPreguntaExpandida((exp) => {
      if (exp === false) return false;
      if (exp === idx) return false;
      if (typeof exp === 'number' && exp > idx) return exp - 1;
      return exp;
    });
  };

  const addPregunta = () => {
    setPreguntas((prev) => {
      const n = [...prev, nuevaPregunta()];
      setPreguntaExpandida(n.length - 1);
      return n;
    });
  };

  const guardar = async () => {
    if (!titulo.trim()) {
      Swal.fire('Atención', 'El título es obligatorio', 'warning');
      return;
    }
    if (audiencias.length === 0) {
      Swal.fire('Atención', 'Selecciona al menos una audiencia', 'warning');
      return;
    }
    const validas = preguntas.filter((p) => {
      const ti = p.tipo_interfaz;
      if (ti === 'titulo') return true;
      return String(p.texto_pregunta || '').trim().length > 0;
    });
    if (!validas.length) {
      Swal.fire('Atención', 'Agrega al menos una pregunta con texto', 'warning');
      return;
    }

    const payloadBase = {
      titulo: titulo.trim(),
      descripcion: descripcion || null,
      fecha_inicio: fechaInicio || null,
      fecha_fin: fechaFin || null,
      mensaje_agradecimiento: mensaje,
      categoria_metrica: categoria || null,
      estado: estadoEncuesta
    };
    const payload = tieneRespuestas
      ? payloadBase
      : {
          ...payloadBase,
          audiencias,
          preguntas: preguntas.map((p, i) => ({
            ...p,
            orden: i + 1
          }))
        };

    try {
      if (esNueva) {
        await api.post('/encuestas/admin', {
          ...payloadBase,
          audiencias,
          preguntas: preguntas.map((p, i) => ({
            ...p,
            orden: i + 1
          }))
        });
        Swal.fire({ icon: 'success', title: 'Encuesta creada', timer: 1600, showConfirmButton: false });
      } else {
        await api.put(`/encuestas/admin/${id}`, payload);
        Swal.fire({ icon: 'success', title: 'Guardado', timer: 1600, showConfirmButton: false });
      }
      navigate('/admin/herramientas/encuestas');
    } catch (err) {
      const msg = err.response?.data?.error || 'No se pudo guardar';
      Swal.fire('Error', msg, 'error');
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <Box sx={{ p: 4, textAlign: 'center' }}>Cargando…</Box>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="admin-encuestas-wrap">
        <div className="admin-usu-toolbar" style={{ marginBottom: '1rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="admin-usu-btn admin-usu-btn-secondary"
            onClick={() => navigate('/admin/herramientas/encuestas')}
          >
            ← Volver a la lista
          </button>
        </div>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>
          {esNueva ? 'Nueva encuesta' : 'Editar encuesta'}
        </Typography>

        {tieneRespuestas ? (
          <Alert severity="info" sx={{ mb: 2 }}>
            Esta encuesta ya tiene respuestas: solo puedes cambiar título, fechas y mensajes — no las preguntas ni las
            audiencias desde este formulario.
          </Alert>
        ) : null}

        <Card sx={{ mb: 2, borderRadius: 2 }}>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Información general
            </Typography>
            <Stack spacing={2}>
              <TextField
                label="Título"
                fullWidth
                required
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
              />
              <TextField
                label="Descripción"
                fullWidth
                multiline
                minRows={2}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="Fecha inicio"
                  type="date"
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  value={fechaInicio}
                  onChange={(e) => setFechaInicio(e.target.value)}
                />
                <TextField
                  label="Fecha fin"
                  type="date"
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  value={fechaFin}
                  onChange={(e) => setFechaFin(e.target.value)}
                />
              </Stack>
              <TextField
                label="Mensaje al finalizar"
                fullWidth
                value={mensaje}
                onChange={(e) => setMensaje(e.target.value)}
              />
              <TextField
                label="Categoría (estadísticas)"
                fullWidth
                placeholder="ej. clima, satisfacción"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
              />
              <FormControl fullWidth size="small">
                <InputLabel id="enc-estado-label">Estado</InputLabel>
                <Select
                  labelId="enc-estado-label"
                  label="Estado"
                  value={estadoEncuesta}
                  onChange={(e) => setEstadoEncuesta(e.target.value)}
                >
                  <MenuItem value="ACTIVO">Activa</MenuItem>
                  <MenuItem value="INACTIVO">Inactiva</MenuItem>
                </Select>
              </FormControl>
            </Stack>
          </CardContent>
        </Card>

        <Card sx={{ mb: 2, borderRadius: 2 }}>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              ¿A quién va dirigida? (puedes elegir varias)
            </Typography>
            <FormGroup row sx={{ gap: 1, flexWrap: 'wrap' }}>
              {AUDIENCIAS.map((a) => (
                <FormControlLabel
                  key={a.value}
                  control={
                    <Checkbox
                      checked={audiencias.includes(a.value)}
                      onChange={() => toggleAud(a.value)}
                      disabled={tieneRespuestas}
                    />
                  }
                  label={a.label}
                />
              ))}
            </FormGroup>
          </CardContent>
        </Card>

        <Card sx={{ mb: 2, borderRadius: 2 }}>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Typography variant="subtitle1" fontWeight={600}>
                Preguntas
              </Typography>
              <Button
                variant="outlined"
                size="small"
                disabled={tieneRespuestas}
                onClick={addPregunta}
                sx={{ textTransform: 'none' }}
              >
                + Pregunta
              </Button>
            </Stack>

            {preguntas.map((p, idx) => {
              const preview =
                p.tipo_interfaz === 'titulo'
                  ? (String(p.texto_pregunta || '').trim() || '(Solo título / sección)').slice(0, 72)
                  : (String(p.texto_pregunta || '').trim() || '(sin texto)').slice(0, 72);
              return (
                <Accordion
                  key={p.id ?? `n-${idx}`}
                  expanded={preguntaExpandida === idx}
                  onChange={(_, exp) => setPreguntaExpandida(exp ? idx : false)}
                  disableGutters
                  elevation={0}
                  sx={{
                    mb: 1,
                    border: '1px solid rgba(0,0,0,0.08)',
                    borderRadius: '12px !important',
                    '&:before': { display: 'none' },
                    overflow: 'hidden'
                  }}
                >
                  <AccordionSummary
                    expandIcon={<ExpandMoreIcon />}
                    sx={{
                      bgcolor: 'action.hover',
                      '& .MuiAccordionSummary-content': {
                        alignItems: 'center',
                        gap: 1,
                        flexWrap: 'wrap',
                        my: 1
                      }
                    }}
                  >
                    <Typography variant="subtitle2" fontWeight={700} sx={{ minWidth: 88 }}>
                      Pregunta {idx + 1}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 120 }} noWrap title={preview}>
                      {preview}
                    </Typography>
                    <Stack direction="row" onClick={(ev) => ev.stopPropagation()}>
                      <IconButton size="small" onClick={() => mover(idx, 'up')} disabled={idx === 0}>
                        <ArrowUpwardIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => mover(idx, 'down')} disabled={idx === preguntas.length - 1}>
                        <ArrowDownwardIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="error"
                        disabled={preguntas.length <= 1 || tieneRespuestas}
                        onClick={() => eliminarPregunta(idx)}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  </AccordionSummary>
                  <AccordionDetails className="enc-pregunta-editor">
                    <TextField
                      label="Texto"
                      fullWidth
                      size="small"
                      sx={{ mb: 1 }}
                      value={p.texto_pregunta}
                      onChange={(e) => actualizarPregunta(idx, 'texto_pregunta', e.target.value)}
                      disabled={tieneRespuestas}
                    />
                    <TextField
                      label="Subtítulo (opcional)"
                      fullWidth
                      size="small"
                      sx={{ mb: 1 }}
                      value={p.subtitulo}
                      onChange={(e) => actualizarPregunta(idx, 'subtitulo', e.target.value)}
                      disabled={tieneRespuestas}
                    />
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 1 }} alignItems="center">
                      <FormControl size="small" fullWidth>
                        <Typography variant="caption" color="text.secondary">
                          Tipo
                        </Typography>
                        <Select
                          value={p.tipo_interfaz}
                          onChange={(e) => actualizarPregunta(idx, 'tipo_interfaz', e.target.value)}
                          disabled={tieneRespuestas}
                        >
                          {TIPOS_PREG.map((t) => (
                            <MenuItem key={t.value} value={t.value}>
                              {t.label}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={p.obligatoria}
                            onChange={(e) => actualizarPregunta(idx, 'obligatoria', e.target.checked)}
                            disabled={tieneRespuestas || p.tipo_interfaz === 'titulo'}
                          />
                        }
                        label="Obligatoria"
                      />
                    </Stack>

                    {(p.tipo_interfaz === 'marcar' || p.tipo_interfaz === 'lista') && !tieneRespuestas && (
                      <OpcionesLista p={p} idx={idx} actualizarOpciones={actualizarOpciones} />
                    )}

                    {p.tipo_interfaz === 'marcar' && !tieneRespuestas && (
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={!!p.opciones.multiple}
                            onChange={(e) => actualizarOpciones(idx, { multiple: e.target.checked })}
                          />
                        }
                        label="Selección múltiple"
                      />
                    )}

                    {p.tipo_interfaz === 'escala' && !tieneRespuestas && (
                      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                        <TextField
                          label="Mín"
                          type="number"
                          size="small"
                          value={p.opciones.min ?? 1}
                          onChange={(e) => actualizarOpciones(idx, { min: parseInt(e.target.value, 10) || 1 })}
                        />
                        <TextField
                          label="Máx"
                          type="number"
                          size="small"
                          value={p.opciones.max ?? 5}
                          onChange={(e) => actualizarOpciones(idx, { max: parseInt(e.target.value, 10) || 5 })}
                        />
                        <TextField
                          label="Etiqueta mín"
                          size="small"
                          value={p.opciones.etiqueta_min || ''}
                          onChange={(e) => actualizarOpciones(idx, { etiqueta_min: e.target.value })}
                        />
                        <TextField
                          label="Etiqueta máx"
                          size="small"
                          value={p.opciones.etiqueta_max || ''}
                          onChange={(e) => actualizarOpciones(idx, { etiqueta_max: e.target.value })}
                        />
                      </Stack>
                    )}
                  </AccordionDetails>
                </Accordion>
              );
            })}
          </CardContent>
        </Card>

        <Stack direction="row" spacing={2}>
          <Button variant="outlined" onClick={() => navigate('/admin/herramientas/encuestas')} sx={{ textTransform: 'none' }}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={guardar} sx={{ textTransform: 'none', px: 3 }}>
            Guardar
          </Button>
        </Stack>
      </div>
    </DashboardLayout>
  );
}

function OpcionesLista({ p, idx, actualizarOpciones }) {
  const opts = p.opciones?.opciones || [];
  return (
    <Stack spacing={1} sx={{ mt: 1 }}>
      {opts.map((op, i) => (
        <Stack key={i} direction="row" spacing={1} alignItems="center">
          <TextField
            size="small"
            fullWidth
            value={op}
            onChange={(e) => {
              const nuevas = [...opts];
              nuevas[i] = e.target.value;
              actualizarOpciones(idx, { opciones: nuevas });
            }}
          />
          <Button
            size="small"
            color="error"
            onClick={() => {
              const nuevas = opts.filter((_, j) => j !== i);
              actualizarOpciones(idx, { opciones: nuevas.length ? nuevas : ['Opción'] });
            }}
          >
            Quitar
          </Button>
        </Stack>
      ))}
      <Button size="small" onClick={() => actualizarOpciones(idx, { opciones: [...opts, `Opción ${opts.length + 1}`] })}>
        + Opción
      </Button>
    </Stack>
  );
}
