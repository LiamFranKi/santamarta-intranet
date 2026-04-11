import React from 'react';
import { Box, Chip, Divider, Stack, TextField, Typography } from '@mui/material';
import { fmtPts } from './hexExamenesFormat';

function parsePreguntaOpciones(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Coherente con backend: GENERAL → puntos_correcta; INDIVIDUAL → pregunta_puntos */
export function puntosMaxLineaRevision(examen, L) {
  const tp = String(examen?.tipo_puntaje || 'GENERAL').toUpperCase();
  const base = tp === 'GENERAL' ? Number(examen?.puntos_correcta) || 0 : Number(L.pregunta_puntos) || 0;
  const inf = L.pregunta_solo_informativo === true || L.pregunta_solo_informativo === 1;
  const modo = String(examen?.modo || 'MIXTO').toUpperCase();
  if (modo === 'PRACTICA') return base;
  return inf ? 0 : base;
}

function parseRespuestaJson(L) {
  let rj = L.respuesta_json || {};
  if (typeof rj === 'string') {
    try {
      rj = JSON.parse(rj);
    } catch {
      rj = {};
    }
  }
  return rj;
}

/**
 * Listado de preguntas en revisión (admin con campos) o solo lectura (participante).
 */
export default function HexExamenesRevisionLineas({
  lineas = [],
  examen = {},
  adminMode = false,
  lineEdits = {},
  setLineEdits = null
}) {
  return (
    <>
      {(lineas || []).map((L, idx) => {
        const rj = parseRespuestaJson(L);
        const tipo = String(L.pregunta_tipo || '').toUpperCase();
        const exRev = examen;
        const ptsMax = puntosMaxLineaRevision(exRev, L);

        let respuestaContenido = null;
        if (tipo === 'RESPUESTA_CORTA') {
          respuestaContenido = <Typography variant="body2">{rj.texto || '—'}</Typography>;
        } else if (tipo === 'VERDADERO_FALSO') {
          const op = parsePreguntaOpciones(L.pregunta_opciones) || {};
          const correcta = op.correcta === false ? false : true;
          const userV = rj.valor;
          const opts = [
            { val: true, label: 'Verdadero' },
            { val: false, label: 'Falso' }
          ];
          respuestaContenido = (
            <Stack spacing={1} sx={{ mt: 1 }}>
              {opts.map((o) => {
                const isCorrect = o.val === correcta;
                const isSel = userV === o.val;
                let border = '1px solid';
                let borderColor = 'divider';
                let bgcolor = 'background.paper';
                if (isCorrect && isSel) {
                  borderColor = 'success.main';
                  bgcolor = 'rgba(46, 125, 50, 0.12)';
                } else if (isCorrect) {
                  borderColor = 'success.light';
                  bgcolor = 'rgba(34, 197, 94, 0.08)';
                } else if (isSel) {
                  borderColor = 'error.main';
                  bgcolor = 'rgba(211, 47, 47, 0.08)';
                }
                return (
                  <Box
                    key={String(o.val)}
                    sx={{
                      p: 1.25,
                      borderRadius: 1,
                      border,
                      borderColor,
                      bgcolor
                    }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 0.5 }}>
                      {isCorrect ? <Chip size="small" label="Correcta" color="success" variant="outlined" /> : null}
                      {isSel ? (
                        <Chip
                          size="small"
                          label="Tu respuesta"
                          color={isCorrect ? 'success' : 'error'}
                          variant="filled"
                        />
                      ) : null}
                    </Stack>
                    <Typography variant="body2" fontWeight={600}>
                      {o.label}
                    </Typography>
                  </Box>
                );
              })}
            </Stack>
          );
        } else if (tipo === 'ALTERNATIVAS') {
          const op = parsePreguntaOpciones(L.pregunta_opciones);
          const opciones = op?.opciones || [];
          const correctIdx = typeof op?.correcta === 'number' ? op.correcta : null;
          const idxSel = rj.indice != null ? Number(rj.indice) : null;
          respuestaContenido = (
            <Stack spacing={1} sx={{ mt: 1 }}>
              {opciones.map((textoHtml, j) => {
                const isCorrect = correctIdx != null && j === correctIdx;
                const isSel = idxSel != null && j === idxSel;
                let borderColor = 'divider';
                let bgcolor = 'background.paper';
                if (isCorrect && isSel) {
                  borderColor = 'success.main';
                  bgcolor = 'rgba(34, 197, 94, 0.12)';
                } else if (isCorrect) {
                  borderColor = 'success.light';
                  bgcolor = 'rgba(34, 197, 94, 0.08)';
                } else if (isSel) {
                  borderColor = 'error.main';
                  bgcolor = 'error.lighter';
                }
                return (
                  <Box
                    key={j}
                    sx={{
                      p: 1.25,
                      borderRadius: 1,
                      border: '2px solid',
                      borderColor,
                      bgcolor
                    }}
                  >
                    <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 0.75 }}>
                      <Typography variant="caption" fontWeight={700} color="text.secondary">
                        {j + 1}.
                      </Typography>
                      {isCorrect ? <Chip size="small" label="Correcta" color="success" variant="outlined" /> : null}
                      {isSel ? (
                        <Chip
                          size="small"
                          label="Tu respuesta"
                          color={isCorrect ? 'success' : 'error'}
                          variant="filled"
                        />
                      ) : null}
                    </Stack>
                    <Box
                      className="hex-revision-resp-html"
                      sx={{ lineHeight: 1.5, '& p': { m: 0 } }}
                      dangerouslySetInnerHTML={{ __html: String(textoHtml || '') }}
                    />
                  </Box>
                );
              })}
            </Stack>
          );
        } else {
          respuestaContenido = <Typography variant="body2">—</Typography>;
        }

        return (
          <Box key={L.id} sx={{ mb: 2.5 }}>
            <Stack direction="row" alignItems="baseline" spacing={1} flexWrap="wrap" sx={{ mb: 0.5 }}>
              <Typography variant="caption" color="primary" fontWeight={800}>
                {idx + 1}.
              </Typography>
              <Chip size="small" label={tipo.replace(/_/g, ' ')} variant="outlined" />
            </Stack>
            <Box
              className="hex-revision-pregunta-html"
              sx={{
                fontWeight: 700,
                color: '#0f172a',
                lineHeight: 1.45,
                '& p': { margin: '0 0 0.35rem' },
                '& p:last-of-type': { marginBottom: 0 }
              }}
              dangerouslySetInnerHTML={{ __html: L.pregunta_texto || '' }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              {adminMode ? 'Respuesta del participante' : 'Tu respuesta'}
            </Typography>
            <Box sx={{ pl: 0.5, mt: 0.5, mb: 1 }}>{respuestaContenido}</Box>
            <Divider sx={{ my: 1.5 }} />
            {adminMode && L.requiere_revision ? (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1 }}>
                <TextField
                  size="small"
                  label="Puntos"
                  type="number"
                  inputProps={{ min: 0, max: Math.round(ptsMax), step: 1 }}
                  helperText={`Máximo según examen: ${fmtPts(ptsMax)}`}
                  value={lineEdits[L.id]?.puntos_otorgados ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === '') {
                      setLineEdits?.((prev) => ({
                        ...prev,
                        [L.id]: { ...prev[L.id], puntos_otorgados: '' }
                      }));
                      return;
                    }
                    const n = parseInt(raw, 10);
                    if (!Number.isNaN(n)) {
                      setLineEdits?.((prev) => ({
                        ...prev,
                        [L.id]: { ...prev[L.id], puntos_otorgados: String(n) }
                      }));
                    }
                  }}
                />
                <TextField
                  size="small"
                  fullWidth
                  label="Comentario al estudiante"
                  value={lineEdits[L.id]?.comentario_docente ?? ''}
                  onChange={(e) =>
                    setLineEdits?.((prev) => ({
                      ...prev,
                      [L.id]: { ...prev[L.id], comentario_docente: e.target.value }
                    }))
                  }
                />
              </Stack>
            ) : (
              <Chip
                size="small"
                color="primary"
                variant="outlined"
                label={`Puntos: ${fmtPts(L.puntos_otorgados)} / ${fmtPts(ptsMax)}`}
              />
            )}
          </Box>
        );
      })}
    </>
  );
}
