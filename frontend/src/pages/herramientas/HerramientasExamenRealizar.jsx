import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  FormControl,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import Swal from 'sweetalert2';
import './HerramientasExamenes.css';

export default function HerramientasExamenRealizar() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preview = searchParams.get('preview') === '1';

  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [payload, setPayload] = useState(null);
  const [intentoId, setIntentoId] = useState(null);
  const [respuestas, setRespuestas] = useState({});

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        if (preview) {
          const { data } = await api.get(`/herramientas-examenes/preview/${id}`);
          if (c) return;
          setPayload({ examen: data.examen, preguntas: data.preguntas, preview: true });
          setIntentoId(null);
        } else {
          const { data } = await api.post(`/herramientas-examenes/realizar/${id}/iniciar`);
          if (c) return;
          setPayload({ examen: data.examen, preguntas: data.preguntas });
          setIntentoId(data.intento?.id);
          const borrador = data.intento?.borrador_json;
          if (borrador && typeof borrador === 'object') {
            setRespuestas(borrador);
          } else if (typeof borrador === 'string') {
            try {
              setRespuestas(JSON.parse(borrador));
            } catch {
              setRespuestas({});
            }
          }
        }
      } catch (err) {
        const msg = err.response?.data?.error || 'No se pudo cargar';
        Swal.fire('Error', msg, 'error').then(() => navigate('/herramientas-examenes'));
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

  const guardarBorrador = async () => {
    if (!intentoId || preview) return;
    try {
      await api.put(`/herramientas-examenes/intento/${intentoId}/borrador`, { borrador: respuestas });
      Swal.fire({ icon: 'success', title: 'Borrador guardado', timer: 1200, showConfirmButton: false });
    } catch {
      Swal.fire('Error', 'No se pudo guardar el borrador', 'error');
    }
  };

  const enviar = async () => {
    if (preview || !payload?.preguntas || !intentoId) return;
    const lista = [];
    for (const p of payload.preguntas) {
      const oblig = p.obligatoria !== false;
      const r = respuestas[p.id] || {};
      const tipo = String(p.tipo || '').toUpperCase();
      if (oblig) {
        if (tipo === 'ALTERNATIVAS' && r.indice == null) {
          Swal.fire('Atención', `Selecciona una opción: ${p.texto}`, 'warning');
          return;
        }
        if (tipo === 'VERDADERO_FALSO' && r.valor !== true && r.valor !== false) {
          Swal.fire('Atención', `Marca verdadero o falso: ${p.texto}`, 'warning');
          return;
        }
        if (tipo === 'RESPUESTA_CORTA' && !String(r.texto || '').trim()) {
          Swal.fire('Atención', `Completa: ${p.texto}`, 'warning');
          return;
        }
      }
      if (tipo === 'ALTERNATIVAS') lista.push({ pregunta_id: p.id, indice: r.indice });
      else if (tipo === 'VERDADERO_FALSO') lista.push({ pregunta_id: p.id, valor: r.valor });
      else if (tipo === 'RESPUESTA_CORTA') lista.push({ pregunta_id: p.id, texto: r.texto ?? '' });
    }

    setEnviando(true);
    try {
      const { data } = await api.post(`/herramientas-examenes/intento/${intentoId}/enviar`, { respuestas: lista });
      const lines = [];
      if (data.requiere_revision_docente) {
        lines.push('Hay preguntas de texto pendientes de revisión por el docente.');
      }
      if (data.puntaje_max != null) {
        lines.push(`Puntaje automático: ${data.puntaje_obtenido} / ${data.puntaje_max}`);
      }
      Swal.fire({
        icon: 'success',
        title: 'Enviado',
        html: `<p>${data.mensaje || 'Gracias.'}</p>${lines.map((l) => `<p>${l}</p>`).join('')}`,
        confirmButtonText: 'OK'
      }).then(() => navigate('/herramientas-examenes'));
    } catch (err) {
      Swal.fire('Error', err.response?.data?.error || 'No se pudo enviar', 'error');
    } finally {
      setEnviando(false);
    }
  };

  if (loading || !payload) {
    return (
      <DashboardLayout>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      </DashboardLayout>
    );
  }

  const { examen, preguntas } = payload;

  return (
    <DashboardLayout>
      <Box sx={{ maxWidth: 760, mx: 'auto', px: 1, pb: 6 }}>
        {preview ? (
          <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
            <strong>Vista previa.</strong> No se guardan respuestas.
          </Alert>
        ) : null}
        <div className="hex-exam-realizar-hero">
          <Typography variant="h6" fontWeight={800}>
            {examen.titulo}
          </Typography>
          {examen.descripcion ? (
            <Typography variant="body2" sx={{ mt: 1, opacity: 0.95 }}>
              {examen.descripcion}
            </Typography>
          ) : null}
          <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 1.5 }}>
            <Chip size="small" sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: '#fff' }} label={examen.modo} />
            {preview ? null : (
              <Chip size="small" sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: '#fff' }} label={`Intento ${intentoId}`} />
            )}
          </Stack>
        </div>

        <Card sx={{ borderRadius: 3, mb: 2 }}>
          <CardContent>
            <fieldset disabled={preview} style={{ border: 'none', padding: 0, margin: 0 }}>
              <Stack spacing={3}>
                {preguntas.map((p, idx) => {
                  const tipo = String(p.tipo || '').toUpperCase();
                  const r = respuestas[p.id] || {};
                  return (
                    <Box key={p.id}>
                      <Typography fontWeight={700} sx={{ mb: 1 }}>
                        {idx + 1}. {p.texto}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {p.solo_informativo ? 'Informativo · ' : ''}
                        {p.puntos != null ? `${p.puntos} pt.` : ''}
                      </Typography>

                      {tipo === 'ALTERNATIVAS' ? (
                        <FormControl component="fieldset" sx={{ mt: 1 }} fullWidth>
                          <RadioGroup
                            value={r.indice != null ? String(r.indice) : ''}
                            onChange={(e) => setVal(p.id, { indice: parseInt(e.target.value, 10) })}
                          >
                            {(p.opciones?.opciones || []).map((op, j) => (
                              <FormControlLabel key={j} value={String(j)} control={<Radio />} label={op} />
                            ))}
                          </RadioGroup>
                        </FormControl>
                      ) : null}

                      {tipo === 'VERDADERO_FALSO' ? (
                        <FormControl component="fieldset" sx={{ mt: 1 }}>
                          <RadioGroup
                            value={r.valor === true ? 'v' : r.valor === false ? 'f' : ''}
                            onChange={(e) => setVal(p.id, { valor: e.target.value === 'v' })}
                          >
                            <FormControlLabel value="v" control={<Radio />} label="Verdadero" />
                            <FormControlLabel value="f" control={<Radio />} label="Falso" />
                          </RadioGroup>
                        </FormControl>
                      ) : null}

                      {tipo === 'RESPUESTA_CORTA' ? (
                        <TextField
                          fullWidth
                          multiline
                          minRows={2}
                          sx={{ mt: 1 }}
                          value={r.texto || ''}
                          onChange={(e) => setVal(p.id, { texto: e.target.value })}
                          placeholder="Escribe tu respuesta"
                        />
                      ) : null}
                    </Box>
                  );
                })}
              </Stack>
            </fieldset>
          </CardContent>
        </Card>

        <Stack direction="row" spacing={2} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
          <Button variant="outlined" onClick={() => navigate('/herramientas-examenes')}>
            Volver
          </Button>
          {!preview && intentoId ? (
            <Button variant="outlined" onClick={guardarBorrador}>
              Guardar borrador
            </Button>
          ) : null}
          {!preview ? (
            <Button
              variant="contained"
              disabled={enviando}
              onClick={enviar}
              sx={{
                fontWeight: 800,
                borderRadius: 2,
                px: 3,
                background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)'
              }}
            >
              {enviando ? 'Enviando…' : 'Enviar respuestas'}
            </Button>
          ) : null}
        </Stack>
      </Box>
    </DashboardLayout>
  );
}
