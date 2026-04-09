import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Checkbox,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
  Alert
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import Swal from 'sweetalert2';
import '../../pages/admin/AdminUsuarios.css';
import './HerramientasExamenes.css';

const AUDIENCIAS = [
  { value: 'ALUMNO', label: 'Alumnos' },
  { value: 'APODERADO', label: 'Apoderados' },
  { value: 'DOCENTE', label: 'Docentes' },
  { value: 'PROMOTORIA', label: 'Promotoría' },
  { value: 'ADMINISTRADOR', label: 'Administradores' },
  { value: 'TODOS', label: 'Todos los usuarios' }
];

const TIPOS = [
  { value: 'ALTERNATIVAS', label: 'Alternativas (automático)' },
  { value: 'VERDADERO_FALSO', label: 'Verdadero / Falso (automático)' },
  { value: 'RESPUESTA_CORTA', label: 'Respuesta corta (revisión manual)' }
];

function nuevaPregunta() {
  return {
    texto: '',
    tipo: 'ALTERNATIVAS',
    opciones: { opciones: ['Opción A', 'Opción B', 'Opción C', 'Opción D'], correcta: 0 },
    puntos: 1,
    solo_informativo: false,
    obligatoria: true
  };
}

export default function HerramientasExamenEditor({ variant = 'admin' }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const esNueva = !id || id === 'nueva';
  const esAdmin = variant === 'admin';
  const base = esAdmin ? '/admin/herramientas/examenes' : '/docente/herramientas/examenes';
  const apiBase = esAdmin ? '/herramientas-examenes/admin' : '/herramientas-examenes/docente';

  const [loading, setLoading] = useState(!esNueva);
  const [gruposOpts, setGruposOpts] = useState([]);
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [mensaje, setMensaje] = useState('¡Gracias por tu participación!');
  const [estadoEx, setEstadoEx] = useState('BORRADOR');
  const [modo, setModo] = useState('MIXTO');
  const [intentosMax, setIntentosMax] = useState(1);
  const [mostrarNota, setMostrarNota] = useState('AL_ENVIAR');
  const [escalaMax, setEscalaMax] = useState(100);
  const [audiencias, setAudiencias] = useState([]);
  const [grupoIds, setGrupoIds] = useState([]);
  const [preguntas, setPreguntas] = useState([nuevaPregunta()]);
  const [expIdx, setExpIdx] = useState(false);

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const { data } = await api.get('/herramientas-examenes/meta/grupos');
        if (!c) setGruposOpts(data.grupos || []);
      } catch {
        if (!c) setGruposOpts([]);
      }
    })();
    return () => {
      c = true;
    };
  }, []);

  useEffect(() => {
    if (esNueva) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`${apiBase}/${id}`);
        if (cancelled) return;
        const e = data.examen;
        setTitulo(e.titulo || '');
        setDescripcion(e.descripcion || '');
        setFechaInicio(e.fecha_inicio ? String(e.fecha_inicio).slice(0, 10) : '');
        setFechaFin(e.fecha_fin ? String(e.fecha_fin).slice(0, 10) : '');
        setMensaje(e.mensaje_agradecimiento || '¡Gracias por tu participación!');
        setEstadoEx(String(e.estado || 'BORRADOR').toUpperCase());
        setModo(e.modo || 'MIXTO');
        setIntentosMax(e.intentos_max || 1);
        setMostrarNota(e.mostrar_nota || 'AL_ENVIAR');
        setEscalaMax(e.escala_max != null ? Number(e.escala_max) : 100);
        setAudiencias(data.audiencias || []);
        setGrupoIds((data.grupo_ids || []).map(Number));
        const pr = (data.preguntas || []).map((p) => ({
          id: p.id,
          texto: p.texto,
          tipo: p.tipo,
          opciones: p.opciones || {},
          puntos: p.puntos ?? 1,
          solo_informativo: !!p.solo_informativo,
          obligatoria: p.obligatoria !== false
        }));
        setPreguntas(pr.length ? pr : [nuevaPregunta()]);
      } catch (err) {
        Swal.fire('Error', err.response?.data?.error || 'No se pudo cargar', 'error');
        navigate(base);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, esNueva, apiBase, navigate, base]);

  const toggleAud = (v) => {
    setAudiencias((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  };

  const toggleGrupo = (gid) => {
    setGrupoIds((prev) => (prev.includes(gid) ? prev.filter((x) => x !== gid) : [...prev, gid]));
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
    setExpIdx(false);
  };

  const eliminarPregunta = (idx) => {
    setPreguntas((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  };

  const addPregunta = () => {
    setPreguntas((prev) => {
      const n = [...prev, nuevaPregunta()];
      setExpIdx(n.length - 1);
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
    const validas = preguntas.filter((p) => String(p.texto || '').trim().length > 0);
    if (!validas.length) {
      Swal.fire('Atención', 'Agrega al menos una pregunta con texto', 'warning');
      return;
    }

    const payload = {
      titulo: titulo.trim(),
      descripcion: descripcion || null,
      estado: estadoEx,
      modo,
      fecha_inicio: fechaInicio || null,
      fecha_fin: fechaFin || null,
      mensaje_agradecimiento: mensaje,
      intentos_max: intentosMax,
      mostrar_nota: mostrarNota,
      escala_max: escalaMax,
      audiencias,
      grupo_ids: grupoIds,
      preguntas: preguntas
        .filter((p) => String(p.texto || '').trim())
        .map((p, i) => ({
          texto: p.texto.trim(),
          tipo: p.tipo,
          opciones:
            p.tipo === 'ALTERNATIVAS'
              ? {
                  opciones: p.opciones?.opciones?.length ? p.opciones.opciones : ['A', 'B', 'C', 'D'],
                  correcta: typeof p.opciones?.correcta === 'number' ? p.opciones.correcta : 0
                }
              : p.tipo === 'VERDADERO_FALSO'
                ? { correcta: p.opciones?.correcta === false ? false : true }
                : {},
          puntos: Math.max(0, Number(p.puntos) || 0),
          solo_informativo: !!p.solo_informativo,
          obligatoria: p.obligatoria !== false
        }))
    };

    try {
      if (esNueva) {
        await api.post(apiBase, payload);
        Swal.fire({ icon: 'success', title: 'Examen creado', timer: 1600, showConfirmButton: false });
      } else {
        await api.put(`${apiBase}/${id}`, payload);
        Swal.fire({ icon: 'success', title: 'Guardado', timer: 1600, showConfirmButton: false });
      }
      navigate(base);
    } catch (err) {
      Swal.fire('Error', err.response?.data?.error || 'No se pudo guardar', 'error');
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
      <div className="hex-exam-wrap">
        <div className="admin-usu-toolbar" style={{ marginBottom: '1rem', flexWrap: 'wrap' }}>
          <button type="button" className="admin-usu-btn admin-usu-btn-secondary" onClick={() => navigate(base)}>
            ← Volver a la lista
          </button>
        </div>

        <div className="hex-exam-hero" style={{ marginBottom: 22 }}>
          <Typography variant="h5" fontWeight={800} sx={{ mb: 1 }}>
            {esNueva ? 'Nuevo examen' : 'Editar examen'}
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.95 }}>
            Define audiencias y, si quieres limitar por aulas, elige grupos; si no marcas ninguno, aplica a toda la
            institución (según audiencia).
          </Typography>
        </div>

        <div className="hex-exam-card">
          <Stack spacing={2}>
            <TextField label="Título" fullWidth value={titulo} onChange={(e) => setTitulo(e.target.value)} required />
            <TextField
              label="Descripción"
              fullWidth
              multiline
              minRows={2}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FormControl fullWidth>
                <InputLabel>Estado</InputLabel>
                <Select value={estadoEx} label="Estado" onChange={(e) => setEstadoEx(e.target.value)}>
                  <MenuItem value="BORRADOR">Borrador</MenuItem>
                  <MenuItem value="ACTIVO">Activo</MenuItem>
                  <MenuItem value="CERRADO">Cerrado</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel>Modo</InputLabel>
                <Select value={modo} label="Modo" onChange={(e) => setModo(e.target.value)}>
                  <MenuItem value="PRACTICA">Práctica (feedback sin peso de libreta)</MenuItem>
                  <MenuItem value="CALIFICADO">Calificatorio</MenuItem>
                  <MenuItem value="MIXTO">Mixto (preguntas informativas sin puntaje)</MenuItem>
                </Select>
              </FormControl>
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Vigencia desde"
                type="date"
                fullWidth
                InputLabelProps={{ shrink: true }}
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
              />
              <TextField
                label="Vigencia hasta"
                type="date"
                fullWidth
                InputLabelProps={{ shrink: true }}
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
              />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Intentos permitidos"
                type="number"
                fullWidth
                inputProps={{ min: 1, max: 20 }}
                value={intentosMax}
                onChange={(e) => setIntentosMax(parseInt(e.target.value, 10) || 1)}
              />
              <FormControl fullWidth>
                <InputLabel>Mostrar nota</InputLabel>
                <Select value={mostrarNota} label="Mostrar nota" onChange={(e) => setMostrarNota(e.target.value)}>
                  <MenuItem value="NO">No mostrar</MenuItem>
                  <MenuItem value="AL_ENVIAR">Al enviar (auto)</MenuItem>
                  <MenuItem value="TRAS_REVISION">Tras revisión manual (texto)</MenuItem>
                </Select>
              </FormControl>
              <TextField
                label="Escala / referencia máx."
                type="number"
                fullWidth
                value={escalaMax}
                onChange={(e) => setEscalaMax(Number(e.target.value))}
              />
            </Stack>
            <TextField
              label="Mensaje final"
              fullWidth
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
            />
          </Stack>
        </div>

        <Typography variant="subtitle1" fontWeight={700} sx={{ mt: 3, mb: 1 }}>
          Audiencias
        </Typography>
        <div className="hex-exam-card">
          <Stack direction="row" flexWrap="wrap" gap={1}>
            {AUDIENCIAS.map((a) => (
              <FormControlLabel
                key={a.value}
                control={<Checkbox checked={audiencias.includes(a.value)} onChange={() => toggleAud(a.value)} />}
                label={a.label}
              />
            ))}
          </Stack>
        </div>

        <Typography variant="subtitle1" fontWeight={700} sx={{ mt: 2, mb: 1 }}>
          Alcance por aulas (opcional)
        </Typography>
        <div className="hex-exam-card">
          <Alert severity="info" sx={{ mb: 2 }}>
            Si no seleccionas ningún grupo, el examen aplica a <strong>toda la institución</strong> (respetando la
            audiencia). Si eliges grupos, solo usuarios vinculados a esas aulas lo verán.
          </Alert>
          <Stack spacing={0.5} sx={{ maxHeight: 220, overflow: 'auto' }}>
            {gruposOpts.map((g) => {
              const label = `${g.nivel_nombre || ''} ${g.grado}° ${g.seccion || ''}`.trim();
              return (
                <FormControlLabel
                  key={g.id}
                  control={<Checkbox checked={grupoIds.includes(g.id)} onChange={() => toggleGrupo(g.id)} />}
                  label={label || `Grupo ${g.id}`}
                />
              );
            })}
          </Stack>
        </div>

        <Typography variant="subtitle1" fontWeight={700} sx={{ mt: 2, mb: 1 }}>
          Preguntas
        </Typography>

        {preguntas.map((p, idx) => (
          <Accordion
            key={idx}
            expanded={expIdx === idx}
            onChange={(_, v) => setExpIdx(v ? idx : false)}
            sx={{ borderRadius: '14px !important', mb: 1, '&:before': { display: 'none' } }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography fontWeight={600}>
                {idx + 1}. {p.texto?.slice(0, 56) || 'Sin texto'} — {p.tipo}
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <div className="hex-exam-preg-editor">
                <Stack spacing={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Tipo</InputLabel>
                    <Select
                      label="Tipo"
                      value={p.tipo}
                      onChange={(e) => {
                        const t = e.target.value;
                        actualizarPregunta(idx, 'tipo', t);
                        if (t === 'ALTERNATIVAS') {
                          actualizarOpciones(idx, { opciones: ['A', 'B', 'C', 'D'], correcta: 0 });
                        }
                        if (t === 'VERDADERO_FALSO') {
                          actualizarOpciones(idx, { correcta: true });
                        }
                      }}
                    >
                      {TIPOS.map((t) => (
                        <MenuItem key={t.value} value={t.value}>
                          {t.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <TextField
                    label="Texto de la pregunta"
                    fullWidth
                    multiline
                    value={p.texto}
                    onChange={(e) => actualizarPregunta(idx, 'texto', e.target.value)}
                  />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <TextField
                      label="Puntos"
                      type="number"
                      size="small"
                      value={p.puntos}
                      onChange={(e) => actualizarPregunta(idx, 'puntos', Number(e.target.value))}
                    />
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={!!p.solo_informativo}
                          onChange={(e) => actualizarPregunta(idx, 'solo_informativo', e.target.checked)}
                        />
                      }
                      label="Solo informativo (no suma en modo mixto)"
                    />
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={p.obligatoria !== false}
                          onChange={(e) => actualizarPregunta(idx, 'obligatoria', e.target.checked)}
                        />
                      }
                      label="Obligatoria"
                    />
                  </Stack>

                  {p.tipo === 'ALTERNATIVAS' ? (
                    <Stack spacing={1}>
                      {(p.opciones?.opciones || []).map((op, j) => (
                        <TextField
                          key={j}
                          size="small"
                          label={`Opción ${j + 1}`}
                          value={op}
                          onChange={(e) => {
                            const next = [...(p.opciones?.opciones || [])];
                            next[j] = e.target.value;
                            actualizarOpciones(idx, { opciones: next });
                          }}
                        />
                      ))}
                      <TextField
                        label="Índice correcto (0 = primera opción)"
                        type="number"
                        size="small"
                        value={p.opciones?.correcta ?? 0}
                        onChange={(e) => actualizarOpciones(idx, { correcta: parseInt(e.target.value, 10) || 0 })}
                      />
                    </Stack>
                  ) : null}

                  {p.tipo === 'VERDADERO_FALSO' ? (
                    <FormControl fullWidth size="small">
                      <InputLabel>Respuesta correcta</InputLabel>
                      <Select
                        label="Respuesta correcta"
                        value={p.opciones?.correcta === false ? 'false' : 'true'}
                        onChange={(e) =>
                          actualizarOpciones(idx, { correcta: e.target.value === 'true' })
                        }
                      >
                        <MenuItem value="true">Verdadero</MenuItem>
                        <MenuItem value="false">Falso</MenuItem>
                      </Select>
                    </FormControl>
                  ) : null}

                  {p.tipo === 'RESPUESTA_CORTA' ? (
                    <Alert severity="warning">Esta pregunta se califica manualmente en estadísticas.</Alert>
                  ) : null}

                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <button type="button" className="admin-usu-btn admin-usu-btn-secondary" onClick={() => mover(idx, 'up')}>
                      Subir
                    </button>
                    <button
                      type="button"
                      className="admin-usu-btn admin-usu-btn-secondary"
                      onClick={() => mover(idx, 'down')}
                    >
                      Bajar
                    </button>
                    <button
                      type="button"
                      className="admin-usu-btn admin-usu-btn-secondary"
                      onClick={() => eliminarPregunta(idx)}
                      disabled={preguntas.length <= 1}
                    >
                      Quitar
                    </button>
                  </Stack>
                </Stack>
              </div>
            </AccordionDetails>
          </Accordion>
        ))}

        <button type="button" className="admin-usu-btn admin-usu-btn-secondary" onClick={addPregunta} style={{ marginTop: 8 }}>
          + Agregar pregunta
        </button>

        <Stack direction="row" spacing={2} sx={{ mt: 3, justifyContent: 'flex-end' }}>
          <button type="button" className="admin-usu-btn admin-usu-btn-secondary" onClick={() => navigate(base)}>
            Cancelar
          </button>
          <button type="button" className="admin-usu-btn admin-usu-btn-new" onClick={guardar}>
            Guardar examen
          </button>
        </Stack>
      </div>
    </DashboardLayout>
  );
}
