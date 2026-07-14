import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Checkbox,
  FormControl,
  FormControlLabel,
  IconButton,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DashboardLayout from '../../components/DashboardLayout';
import AdminMensajeQuillEditor from '../../components/admin/AdminMensajeQuillEditor';
import api from '../../services/api';
import { mensajeHtmlTieneContenido } from '../../utils/mensajesHtml';
import Swal from 'sweetalert2';
import './AdminUsuarios.css';
import './AdminEncuestas.css';

const AUDIENCIAS = [
  { value: 'ALUMNO', label: 'Alumnos', tone: 'alumnos' },
  { value: 'APODERADO', label: 'Apoderados', tone: 'apoderados' },
  { value: 'DOCENTE', label: 'Docentes', tone: 'docentes' },
  { value: 'PROMOTORIA', label: 'Promotoría', tone: 'promotoria' },
  { value: 'ADMINISTRADOR', label: 'Administradores', tone: 'admins' },
  { value: 'TODOS', label: 'Todos los usuarios', tone: 'todos' }
];

const TIPOS_PREG = [
  { value: 'marcar', label: 'Marcar (radio/checkbox)' },
  { value: 'lista', label: 'Lista (desplegable)' },
  { value: 'texto_corto', label: 'Texto corto' },
  { value: 'texto_largo', label: 'Texto largo' },
  { value: 'escala', label: 'Escala numérica' },
  { value: 'titulo', label: 'Solo título / sección' }
];

function stripHtmlPreview(html) {
  const s = String(html || '');
  if (!s.trim()) return '(sin texto)';
  if (typeof document !== 'undefined') {
    const d = document.createElement('div');
    d.innerHTML = s;
    const t = (d.textContent || '').replace(/\s+/g, ' ').trim();
    if (t) return t.slice(0, 72);
    if (/<img\b/i.test(s)) return '(imagen)';
    return '(sin texto)';
  }
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 72) || '(sin texto)';
}

function preguntaTieneContenido(p) {
  if (p.tipo_interfaz === 'titulo') return true;
  return mensajeHtmlTieneContenido(p.texto_pregunta) || /<img\b/i.test(String(p.texto_pregunta || ''));
}

function nuevaPregunta() {
  return {
    texto_pregunta: '',
    subtitulo: '',
    tipo_interfaz: 'marcar',
    obligatoria: true,
    opciones: { opciones: ['Opción 1', 'Opción 2'], multiple: false, min: 1, max: 5, etiqueta_min: '', etiqueta_max: '' }
  };
}

function etiquetaGrupo(g) {
  return `${g.grado}° ${g.seccion} ${g.nivel_nombre || ''}`.trim();
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
  const [alcance, setAlcance] = useState('todos');
  const [grupos, setGrupos] = useState([]);
  const [gruposSeleccionados, setGruposSeleccionados] = useState([]);
  const [estadoEncuesta, setEstadoEncuesta] = useState('ACTIVO');
  const [preguntas, setPreguntas] = useState([nuevaPregunta()]);
  const [preguntaExpandida, setPreguntaExpandida] = useState(false);
  const [tieneRespuestas, setTieneRespuestas] = useState(false);

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const gr = await api.get('/docente/grupos');
        if (!c) setGrupos(gr.data?.grupos || []);
      } catch {
        if (!c) setGrupos([]);
      }
    })();
    return () => {
      c = true;
    };
  }, []);

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
        const gids = (data.grupos || []).map((g) => Number(g)).filter(Boolean);
        setGruposSeleccionados(gids);
        setAlcance(
          String(data.alcance_grupos || e.alcance_grupos || 'TODOS').toUpperCase() === 'GRUPOS' || gids.length
            ? 'grupos'
            : 'todos'
        );
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

  const toggleGrupo = (gid) => {
    setGruposSeleccionados((prev) =>
      prev.includes(gid) ? prev.filter((x) => x !== gid) : [...prev, gid]
    );
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
    const alcanceEfectivo = gruposSeleccionados.length > 0 || alcance === 'grupos' ? 'grupos' : 'todos';
    if (alcanceEfectivo === 'grupos' && gruposSeleccionados.length === 0) {
      Swal.fire('Atención', 'Selecciona al menos un grupo o elige cobertura Todos', 'warning');
      return;
    }
    const validas = preguntas.filter(preguntaTieneContenido);
    if (!validas.length) {
      Swal.fire('Atención', 'Agrega al menos una pregunta con texto o imagen', 'warning');
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
    const alcance_grupos = alcanceEfectivo === 'grupos' ? 'GRUPOS' : 'TODOS';
    const gruposPayload = alcance_grupos === 'GRUPOS' ? gruposSeleccionados : [];
    const payload = tieneRespuestas
      ? payloadBase
      : {
          ...payloadBase,
          audiencias,
          alcance_grupos,
          grupos: gruposPayload,
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
          alcance_grupos,
          grupos: gruposPayload,
          preguntas: preguntas.map((p, i) => ({
            ...p,
            orden: i + 1
          }))
        });
        Swal.fire({ icon: 'success', title: 'Encuesta creada', timer: 1600, showConfirmButton: false });
      } else {
        await api.put(`/encuestas/admin/${id}`, tieneRespuestas ? payloadBase : payload);
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
      <div className="admin-encuestas-wrap admin-enc-editor">
        <div className="admin-usu-toolbar" style={{ marginBottom: '1rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="admin-usu-btn admin-usu-btn-secondary"
            onClick={() => navigate('/admin/herramientas/encuestas')}
          >
            ← Volver a la lista
          </button>
        </div>

        <div className="admin-encuestas-hero admin-enc-editor-hero">
          <h1>{esNueva ? 'Nueva encuesta' : 'Editar encuesta'}</h1>
          <p>
            Define audiencia, cobertura por grupos y preguntas con formato e imágenes. Las respuestas se registran con
            el usuario de la intranet.
          </p>
        </div>

        {tieneRespuestas ? (
          <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
            Esta encuesta ya tiene respuestas: solo puedes cambiar título, fechas y mensajes — no las preguntas, audiencias
            ni grupos desde este formulario.
          </Alert>
        ) : null}

        <section className="admin-enc-section admin-enc-section--info">
          <div className="admin-enc-section-head">
            <span className="admin-enc-section-badge">01</span>
            <div>
              <h2>Información general</h2>
              <p>Título, vigencia y mensaje de cierre</p>
            </div>
          </div>
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
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
                Estado
              </Typography>
              <Select value={estadoEncuesta} onChange={(e) => setEstadoEncuesta(e.target.value)}>
                <MenuItem value="ACTIVO">Activa</MenuItem>
                <MenuItem value="INACTIVO">Inactiva</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </section>

        <section className="admin-enc-section admin-enc-section--audiencia">
          <div className="admin-enc-section-head">
            <span className="admin-enc-section-badge">02</span>
            <div>
              <h2>¿A quién va dirigida?</h2>
              <p>Perfiles + cobertura por grupos (como Conexiones Familiares)</p>
            </div>
          </div>

          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
            Perfiles (puedes elegir varios)
          </Typography>
          <div className="admin-enc-aud-grid">
            {AUDIENCIAS.map((a) => {
              const on = audiencias.includes(a.value);
              return (
                <button
                  key={a.value}
                  type="button"
                  className={`admin-enc-aud-chip admin-enc-aud-chip--${a.tone}${on ? ' is-on' : ''}`}
                  disabled={tieneRespuestas}
                  onClick={() => toggleAud(a.value)}
                >
                  <span className="admin-enc-aud-check">{on ? '✓' : ''}</span>
                  {a.label}
                </button>
              );
            })}
          </div>

          <div className="admin-enc-cobertura">
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
              Cobertura
            </Typography>
            <div className="admin-enc-cobertura-radios">
              <label className={alcance === 'todos' ? 'is-on' : ''}>
                <input
                  type="radio"
                  name="enc-alcance"
                  checked={alcance === 'todos'}
                  disabled={tieneRespuestas}
                  onChange={() => {
                    setAlcance('todos');
                    setGruposSeleccionados([]);
                  }}
                />
                Todos (todo el colegio)
              </label>
              <label className={alcance === 'grupos' ? 'is-on' : ''}>
                <input
                  type="radio"
                  name="enc-alcance"
                  checked={alcance === 'grupos'}
                  disabled={tieneRespuestas}
                  onChange={() => setAlcance('grupos')}
                />
                Grupos
              </label>
            </div>
            {alcance === 'grupos' && (
              <div className="admin-enc-grupos-grid">
                {grupos.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No hay grupos cargados para el año activo.
                  </Typography>
                ) : (
                  grupos.map((g) => {
                    const on = gruposSeleccionados.includes(g.id);
                    return (
                      <label key={g.id} className={`admin-enc-grupo-item${on ? ' is-on' : ''}`}>
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={tieneRespuestas}
                          onChange={() => toggleGrupo(g.id)}
                        />
                        <span>{etiquetaGrupo(g)}</span>
                      </label>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </section>

        <section className="admin-enc-section admin-enc-section--preguntas">
          <div className="admin-enc-section-head">
            <span className="admin-enc-section-badge">03</span>
            <div>
              <h2>Preguntas</h2>
              <p>Texto enriquecido, formato e imágenes en preguntas y alternativas</p>
            </div>
            <Button
              variant="contained"
              size="small"
              disabled={tieneRespuestas}
              onClick={addPregunta}
              className="admin-enc-add-preg-btn"
              sx={{ textTransform: 'none', ml: 'auto' }}
            >
              + Pregunta
            </Button>
          </div>

          {preguntas.map((p, idx) => {
            const preview =
              p.tipo_interfaz === 'titulo'
                ? stripHtmlPreview(p.texto_pregunta) || '(Solo título / sección)'
                : stripHtmlPreview(p.texto_pregunta);
            return (
              <Accordion
                key={p.id ?? `n-${idx}`}
                expanded={preguntaExpandida === idx}
                onChange={(_, exp) => setPreguntaExpandida(exp ? idx : false)}
                disableGutters
                elevation={0}
                className="admin-enc-pregunta-acc"
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />} className="admin-enc-pregunta-sum">
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
                  <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    Texto de la pregunta
                  </Typography>
                  {!tieneRespuestas ? (
                    <AdminMensajeQuillEditor
                      compact
                      uploadUrl="/encuestas/admin/subir-imagen"
                      value={p.texto_pregunta || ''}
                      onChange={(html) => actualizarPregunta(idx, 'texto_pregunta', html)}
                      placeholder="Escribe la pregunta… (formato e imágenes)"
                    />
                  ) : (
                    <div
                      className="admin-enc-html-readonly"
                      dangerouslySetInnerHTML={{ __html: p.texto_pregunta || '' }}
                    />
                  )}

                  <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mt: 1.5, mb: 0.5 }}>
                    Subtítulo (opcional)
                  </Typography>
                  {!tieneRespuestas ? (
                    <AdminMensajeQuillEditor
                      compact
                      uploadUrl="/encuestas/admin/subir-imagen"
                      value={p.subtitulo || ''}
                      onChange={(html) => actualizarPregunta(idx, 'subtitulo', html)}
                      placeholder="Subtítulo o ayuda…"
                    />
                  ) : (
                    <div
                      className="admin-enc-html-readonly"
                      dangerouslySetInnerHTML={{ __html: p.subtitulo || '' }}
                    />
                  )}

                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 1.5, mb: 1 }} alignItems="center">
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
        </section>

        <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
          <Button variant="outlined" onClick={() => navigate('/admin/herramientas/encuestas')} sx={{ textTransform: 'none' }}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={guardar}
            sx={{
              textTransform: 'none',
              px: 3,
              background: 'linear-gradient(135deg, #2563eb 0%, #0ea5e9 100%)',
              boxShadow: '0 6px 20px rgba(37, 99, 235, 0.35)'
            }}
          >
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
    <Stack spacing={1.25} sx={{ mt: 1 }} className="admin-enc-opciones">
      <Typography variant="caption" fontWeight={700} color="text.secondary">
        Alternativas
      </Typography>
      {opts.map((op, i) => (
        <Box key={i} className="admin-enc-opcion-row">
          <Typography variant="caption" fontWeight={600} sx={{ mb: 0.5, display: 'block' }}>
            Opción {i + 1}
          </Typography>
          <AdminMensajeQuillEditor
            compact
            uploadUrl="/encuestas/admin/subir-imagen"
            value={typeof op === 'string' ? op : ''}
            onChange={(html) => {
              const nuevas = [...opts];
              nuevas[i] = html;
              actualizarOpciones(idx, { opciones: nuevas });
            }}
            placeholder={`Texto de la opción ${i + 1}…`}
          />
          <Button
            size="small"
            color="error"
            sx={{ mt: 0.5, textTransform: 'none' }}
            onClick={() => {
              const nuevas = opts.filter((_, j) => j !== i);
              actualizarOpciones(idx, { opciones: nuevas.length ? nuevas : ['Opción'] });
            }}
          >
            Quitar
          </Button>
        </Box>
      ))}
      <Button
        size="small"
        variant="outlined"
        sx={{ textTransform: 'none', alignSelf: 'flex-start' }}
        onClick={() => actualizarOpciones(idx, { opciones: [...opts, `Opción ${opts.length + 1}`] })}
      >
        + Opción
      </Button>
    </Stack>
  );
}
