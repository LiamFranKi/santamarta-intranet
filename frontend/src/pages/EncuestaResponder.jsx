import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  FormControl,
  FormControlLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import { procesarHTMLMensaje } from '../utils/mensajesHtml';
import Swal from 'sweetalert2';
import './admin/AdminEncuestas.css';

function stripHtmlPlain(html) {
  const s = String(html || '');
  if (typeof document !== 'undefined') {
    const d = document.createElement('div');
    d.innerHTML = s;
    const t = (d.textContent || '').replace(/\s+/g, ' ').trim();
    if (t) return t;
    if (/<img\b/i.test(s)) return '(imagen)';
    return '';
  }
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function RichHtml({ html, className = 'admin-enc-rich' }) {
  if (!html) return null;
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: procesarHTMLMensaje(html) }}
    />
  );
}

export default function EncuestaResponder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preview = searchParams.get('preview') === '1';
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [data, setData] = useState(null);
  const [respuestas, setRespuestas] = useState({});

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const url = preview ? `/encuestas/admin/${id}/vista-previa` : `/encuestas/contestar/${id}`;
        const { data: d } = await api.get(url);
        if (c) return;
        setData(d);
      } catch (err) {
        if (!preview && err.response?.data?.ya_respondio) {
          Swal.fire('Listo', 'Ya habías respondido esta encuesta.', 'info').then(() => navigate('/encuestas'));
          return;
        }
        const msg = err.response?.data?.error || 'No se pudo cargar';
        const back = preview ? '/admin/herramientas/encuestas' : '/encuestas';
        Swal.fire('Error', msg, 'error').then(() => navigate(back));
      } finally {
        if (!c) setLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [id, navigate, preview]);

  const setVal = (preguntaId, patch) => {
    setRespuestas((prev) => ({
      ...prev,
      [preguntaId]: { ...prev[preguntaId], ...patch }
    }));
  };

  const handleMarcar = (preguntaId, opcion, multiple) => {
    const prev = respuestas[preguntaId]?.opciones_seleccionadas || [];
    if (multiple) {
      const next = prev.includes(opcion) ? prev.filter((x) => x !== opcion) : [...prev, opcion];
      setVal(preguntaId, { opciones_seleccionadas: next });
    } else {
      setVal(preguntaId, { opciones_seleccionadas: [opcion] });
    }
  };

  const enviar = async () => {
    if (preview) return;
    if (!data?.preguntas) return;
    const lista = [];
    for (const p of data.preguntas) {
      const ti = p.tipo_respuesta;
      if (ti === 'titulo') continue;
      const oblig = p.obligatoria;
      const r = respuestas[p.id];
      if (oblig) {
        if (ti === 'texto_corto' || ti === 'texto_largo') {
          if (!r?.texto?.trim()) {
            Swal.fire('Atención', `Completa: ${stripHtmlPlain(p.texto_pregunta) || 'la pregunta'}`, 'warning');
            return;
          }
        } else if (ti === 'escala') {
          if (r?.valor_numerico == null) {
            Swal.fire('Atención', `Selecciona escala: ${stripHtmlPlain(p.texto_pregunta) || 'la pregunta'}`, 'warning');
            return;
          }
        } else if (ti === 'marcar' || ti === 'lista') {
          const arr = r?.opciones_seleccionadas || [];
          if (!arr.length) {
            Swal.fire('Atención', `Selecciona opción: ${stripHtmlPlain(p.texto_pregunta) || 'la pregunta'}`, 'warning');
            return;
          }
        }
      }
      const base = { pregunta_id: p.id };
      if (ti === 'texto_corto' || ti === 'texto_largo') {
        lista.push({ ...base, texto: r?.texto ?? '' });
      } else if (ti === 'escala') {
        lista.push({ ...base, valor_numerico: r?.valor_numerico });
      } else if (ti === 'marcar' || ti === 'lista') {
        lista.push({ ...base, opciones_seleccionadas: r?.opciones_seleccionadas || [] });
      }
    }

    setEnviando(true);
    try {
      await api.post(`/encuestas/contestar/${id}`, { respuestas: lista });
      const msg = data.encuesta?.mensaje_agradecimiento || '¡Gracias!';
      Swal.fire({ icon: 'success', title: 'Enviado', text: msg, confirmButtonText: 'OK' }).then(() =>
        navigate('/encuestas')
      );
    } catch (err) {
      Swal.fire('Error', err.response?.data?.error || 'No se pudo enviar', 'error');
    } finally {
      setEnviando(false);
    }
  };

  if (loading || !data) {
    return (
      <DashboardLayout>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      </DashboardLayout>
    );
  }

  const { encuesta, preguntas, usuario_contexto } = data;

  return (
    <DashboardLayout>
      <Box sx={{ maxWidth: 720, mx: 'auto', px: 1, pb: 6 }}>
        {preview ? (
          <Alert severity="info" sx={{ mb: 2 }}>
            <strong>Vista previa (administrador).</strong> Así verán el formulario los usuarios. No se guardan respuestas.
          </Alert>
        ) : null}
        <Card sx={{ mb: 2, borderRadius: 2, overflow: 'visible' }}>
          <Box
            sx={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: '#fff',
              p: 2.5,
              borderRadius: '12px 12px 0 0'
            }}
          >
            <Typography variant="h6" fontWeight={700}>
              {encuesta.titulo}
            </Typography>
            {encuesta.descripcion ? (
              <Typography variant="body2" sx={{ mt: 1, opacity: 0.95 }}>
                {encuesta.descripcion}
              </Typography>
            ) : null}
            <Chip
              size="small"
              sx={{ mt: 1.5, bgcolor: 'rgba(255,255,255,0.2)', color: '#fff' }}
              label={`Respondes como: ${usuario_contexto?.etiqueta || 'usuario'}`}
            />
          </Box>
          <CardContent>
            <fieldset
              disabled={preview}
              style={{
                border: 'none',
                padding: 0,
                margin: 0,
                minWidth: 0
              }}
            >
            <Stack spacing={3}>
              {preguntas.map((p, idx) => {
                const ti = p.tipo_respuesta;
                const op = p.opciones || {};
                if (ti === 'titulo') {
                  return (
                    <Box key={p.id} sx={{ py: 1 }}>
                      <Box sx={{ '& h1,& h2,& h3,& h4,& h5,& h6,&.admin-enc-rich': { color: 'primary.main', fontWeight: 700 } }}>
                        <RichHtml html={p.texto_pregunta} />
                      </Box>
                      {p.subtitulo ? <RichHtml html={p.subtitulo} /> : null}
                    </Box>
                  );
                }
                return (
                  <Box key={p.id}>
                    <Stack direction="row" alignItems="flex-start" spacing={0.5}>
                      <Typography fontWeight={600} component="span" sx={{ flexShrink: 0 }}>
                        {idx + 1}.
                      </Typography>
                      <Box sx={{ flex: 1 }}>
                        <RichHtml html={p.texto_pregunta} />
                        {p.obligatoria ? <span style={{ color: '#d32f2f' }}> *</span> : null}
                      </Box>
                    </Stack>
                    {p.subtitulo ? (
                      <Box sx={{ mb: 1, mt: 0.5, color: 'text.secondary' }}>
                        <RichHtml html={p.subtitulo} />
                      </Box>
                    ) : null}

                    {ti === 'marcar' && op.multiple && (
                      <Stack spacing={0.5} sx={{ mt: 1 }}>
                        {(op.opciones || []).map((opt, oi) => (
                          <FormControlLabel
                            key={`${p.id}-m-${oi}`}
                            control={
                              <Checkbox
                                checked={(respuestas[p.id]?.opciones_seleccionadas || []).includes(opt)}
                                onChange={() => handleMarcar(p.id, opt, true)}
                              />
                            }
                            label={<RichHtml html={opt} />}
                          />
                        ))}
                      </Stack>
                    )}

                    {ti === 'marcar' && !op.multiple && (
                      <RadioGroup
                        sx={{ mt: 1 }}
                        value={(respuestas[p.id]?.opciones_seleccionadas || [])[0] || ''}
                        onChange={(e) => setVal(p.id, { opciones_seleccionadas: [e.target.value] })}
                      >
                        {(op.opciones || []).map((opt, oi) => (
                          <FormControlLabel
                            key={`${p.id}-r-${oi}`}
                            value={opt}
                            control={<Radio />}
                            label={<RichHtml html={opt} />}
                          />
                        ))}
                      </RadioGroup>
                    )}

                    {ti === 'lista' && (
                      <FormControl fullWidth size="small" sx={{ mt: 1 }}>
                        <Select
                          displayEmpty
                          value={(respuestas[p.id]?.opciones_seleccionadas || [])[0] || ''}
                          onChange={(e) =>
                            setVal(p.id, { opciones_seleccionadas: e.target.value ? [e.target.value] : [] })
                          }
                          renderValue={(selected) =>
                            selected ? (
                              <RichHtml html={selected} />
                            ) : (
                              <em style={{ color: '#94a3b8' }}>Selecciona…</em>
                            )
                          }
                        >
                          <MenuItem value="">Selecciona…</MenuItem>
                          {(op.opciones || []).map((opt, oi) => (
                            <MenuItem key={`${p.id}-l-${oi}`} value={opt}>
                              <RichHtml html={opt} />
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    )}

                    {ti === 'texto_corto' && (
                      <TextField
                        fullWidth
                        size="small"
                        sx={{ mt: 1 }}
                        value={respuestas[p.id]?.texto || ''}
                        onChange={(e) => setVal(p.id, { texto: e.target.value })}
                        inputProps={{ maxLength: op.max_length || 200 }}
                      />
                    )}

                    {ti === 'texto_largo' && (
                      <TextField
                        fullWidth
                        multiline
                        minRows={3}
                        sx={{ mt: 1 }}
                        value={respuestas[p.id]?.texto || ''}
                        onChange={(e) => setVal(p.id, { texto: e.target.value })}
                        inputProps={{ maxLength: op.max_length || 2000 }}
                      />
                    )}

                    {ti === 'escala' && (
                      <Stack spacing={1} sx={{ mt: 1 }}>
                        <Stack direction="row" gap={1} flexWrap="wrap" useFlexGap>
                          {(() => {
                            const min = Number.isFinite(Number(op.min)) ? Number(op.min) : 1;
                            const max = Number.isFinite(Number(op.max)) ? Number(op.max) : 5;
                            const btns = [];
                            for (let n = min; n <= max; n += 1) {
                              btns.push(
                                <Button
                                  key={n}
                                  size="small"
                                  variant={
                                    respuestas[p.id]?.valor_numerico === n ? 'contained' : 'outlined'
                                  }
                                  onClick={() => setVal(p.id, { valor_numerico: n })}
                                  sx={{ minWidth: 44, borderRadius: 2 }}
                                >
                                  {n}
                                </Button>
                              );
                            }
                            return btns;
                          })()}
                        </Stack>
                        <Stack direction="row" justifyContent="space-between">
                          <Typography variant="caption" color="text.secondary">
                            {op.etiqueta_min}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {op.etiqueta_max}
                          </Typography>
                        </Stack>
                      </Stack>
                    )}
                  </Box>
                );
              })}
            </Stack>
            </fieldset>

            <Stack direction="row" justifyContent="flex-end" sx={{ mt: 4 }}>
              <Button
                variant="outlined"
                onClick={() => navigate(preview ? '/admin/herramientas/encuestas' : '/encuestas')}
                sx={{ mr: 1, textTransform: 'none' }}
              >
                {preview ? 'Volver al listado' : 'Volver'}
              </Button>
              {!preview ? (
                <Button
                  variant="contained"
                  disabled={enviando}
                  onClick={enviar}
                  sx={{ textTransform: 'none', px: 3, borderRadius: 2 }}
                >
                  {enviando ? 'Enviando…' : 'Enviar respuestas'}
                </Button>
              ) : null}
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </DashboardLayout>
  );
}
