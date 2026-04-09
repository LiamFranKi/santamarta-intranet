import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
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
import Swal from 'sweetalert2';

export default function EncuestaResponder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [data, setData] = useState(null);
  const [respuestas, setRespuestas] = useState({});

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const { data: d } = await api.get(`/encuestas/contestar/${id}`);
        if (c) return;
        setData(d);
      } catch (err) {
        if (err.response?.data?.ya_respondio) {
          Swal.fire('Listo', 'Ya habías respondido esta encuesta.', 'info').then(() => navigate('/encuestas'));
          return;
        }
        const msg = err.response?.data?.error || 'No se pudo cargar';
        Swal.fire('Error', msg, 'error').then(() => navigate('/encuestas'));
      } finally {
        if (!c) setLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [id, navigate]);

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
            Swal.fire('Atención', `Completa: ${p.texto_pregunta}`, 'warning');
            return;
          }
        } else if (ti === 'escala') {
          if (r?.valor_numerico == null) {
            Swal.fire('Atención', `Selecciona escala: ${p.texto_pregunta}`, 'warning');
            return;
          }
        } else if (ti === 'marcar' || ti === 'lista') {
          const arr = r?.opciones_seleccionadas || [];
          if (!arr.length) {
            Swal.fire('Atención', `Selecciona opción: ${p.texto_pregunta}`, 'warning');
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
            <Stack spacing={3}>
              {preguntas.map((p, idx) => {
                const ti = p.tipo_respuesta;
                const op = p.opciones || {};
                if (ti === 'titulo') {
                  return (
                    <Box key={p.id} sx={{ py: 1 }}>
                      <Typography variant="h6" fontWeight={700} color="primary">
                        {p.texto_pregunta}
                      </Typography>
                      {p.subtitulo ? (
                        <Typography variant="body2" color="text.secondary">
                          {p.subtitulo}
                        </Typography>
                      ) : null}
                    </Box>
                  );
                }
                return (
                  <Box key={p.id}>
                    <Typography fontWeight={600}>
                      {idx + 1}. {p.texto_pregunta}
                      {p.obligatoria ? <span style={{ color: '#d32f2f' }}> *</span> : null}
                    </Typography>
                    {p.subtitulo ? (
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        {p.subtitulo}
                      </Typography>
                    ) : null}

                    {ti === 'marcar' && op.multiple && (
                      <Stack spacing={0.5} sx={{ mt: 1 }}>
                        {(op.opciones || []).map((opt) => (
                          <FormControlLabel
                            key={opt}
                            control={
                              <Checkbox
                                checked={(respuestas[p.id]?.opciones_seleccionadas || []).includes(opt)}
                                onChange={() => handleMarcar(p.id, opt, true)}
                              />
                            }
                            label={opt}
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
                        {(op.opciones || []).map((opt) => (
                          <FormControlLabel key={opt} value={opt} control={<Radio />} label={opt} />
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
                        >
                          <MenuItem value="">Selecciona…</MenuItem>
                          {(op.opciones || []).map((opt) => (
                            <MenuItem key={opt} value={opt}>
                              {opt}
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

            <Stack direction="row" justifyContent="flex-end" sx={{ mt: 4 }}>
              <Button variant="outlined" onClick={() => navigate('/encuestas')} sx={{ mr: 1, textTransform: 'none' }}>
                Volver
              </Button>
              <Button
                variant="contained"
                disabled={enviando}
                onClick={enviar}
                sx={{ textTransform: 'none', px: 3, borderRadius: 2 }}
              >
                {enviando ? 'Enviando…' : 'Enviar respuestas'}
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </DashboardLayout>
  );
}
