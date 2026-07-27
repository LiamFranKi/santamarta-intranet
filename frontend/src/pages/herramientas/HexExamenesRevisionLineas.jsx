import React from 'react';
import { Box, Chip, Stack, TextField, Typography } from '@mui/material';
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

function tipoLabel(tipo) {
  const t = String(tipo || '').toUpperCase();
  if (t === 'ALTERNATIVAS') return 'Alternativas';
  if (t === 'VERDADERO_FALSO') return 'Verdadero / Falso';
  if (t === 'RESPUESTA_CORTA') return 'Respuesta corta';
  return t.replace(/_/g, ' ');
}

function tipoAccent(tipo) {
  const t = String(tipo || '').toUpperCase();
  if (t === 'ALTERNATIVAS') return { bg: '#eef2ff', color: '#4338ca', border: '#c7d2fe' };
  if (t === 'VERDADERO_FALSO') return { bg: '#f5f3ff', color: '#6d28d9', border: '#ddd6fe' };
  if (t === 'RESPUESTA_CORTA') return { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' };
  return { bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' };
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
    <Stack spacing={2.5} className="hex-rev-list">
      {(lineas || []).map((L, idx) => {
        const rj = parseRespuestaJson(L);
        const tipo = String(L.pregunta_tipo || '').toUpperCase();
        const ptsMax = puntosMaxLineaRevision(examen, L);
        const inf = L.pregunta_solo_informativo === true || L.pregunta_solo_informativo === 1;
        const manual =
          L.pregunta_calificar_manualmente === true ||
          L.pregunta_calificar_manualmente === 1 ||
          L.requiere_revision === true ||
          L.requiere_revision === 1 ||
          tipo === 'RESPUESTA_CORTA';
        const accent = tipoAccent(tipo);
        const puedeEditarPuntos = adminMode && !inf && ptsMax > 0;

        let respuestaContenido = null;
        if (inf) {
          respuestaContenido = null;
        } else if (tipo === 'RESPUESTA_CORTA') {
          respuestaContenido = (
            <Box className="hex-rev-texto-box">
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>
                {rj.texto || '—'}
              </Typography>
            </Box>
          );
        } else if (tipo === 'VERDADERO_FALSO') {
          const op = parsePreguntaOpciones(L.pregunta_opciones) || {};
          const hasKey = Object.prototype.hasOwnProperty.call(op, 'correcta');
          const correcta = hasKey ? (op.correcta === false ? false : true) : null;
          const userV = rj.valor;
          const opts = [
            { val: true, label: 'Verdadero' },
            { val: false, label: 'Falso' }
          ];
          respuestaContenido = (
            <Stack spacing={1} sx={{ mt: 0.5 }}>
              {opts.map((o) => {
                const isCorrect = correcta != null && o.val === correcta;
                const isSel = userV === o.val;
                let cls = 'hex-rev-opt';
                if (isCorrect && isSel) cls += ' hex-rev-opt--ok-sel';
                else if (isCorrect) cls += ' hex-rev-opt--ok';
                else if (isSel) cls += correcta == null ? ' hex-rev-opt--sel' : ' hex-rev-opt--bad';
                return (
                  <Box key={String(o.val)} className={cls}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 0.35 }}>
                      {isCorrect ? <Chip size="small" label="Correcta" className="hex-rev-chip-ok" /> : null}
                      {isSel ? (
                        <Chip
                          size="small"
                          label={adminMode ? 'Respuesta' : 'Tu respuesta'}
                          className={correcta == null || isCorrect ? 'hex-rev-chip-sel' : 'hex-rev-chip-bad'}
                        />
                      ) : null}
                    </Stack>
                    <Typography variant="body2" fontWeight={700}>
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
            <Stack spacing={1} sx={{ mt: 0.5 }}>
              {opciones.map((textoHtml, j) => {
                const isCorrect = correctIdx != null && j === correctIdx;
                const isSel = idxSel != null && j === idxSel;
                let cls = 'hex-rev-opt';
                if (isCorrect && isSel) cls += ' hex-rev-opt--ok-sel';
                else if (isCorrect) cls += ' hex-rev-opt--ok';
                else if (isSel) cls += correctIdx == null ? ' hex-rev-opt--sel' : ' hex-rev-opt--bad';
                return (
                  <Box key={j} className={cls}>
                    <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 0.5 }}>
                      <span className="hex-rev-opt-num">{j + 1}</span>
                      {isCorrect ? <Chip size="small" label="Correcta" className="hex-rev-chip-ok" /> : null}
                      {isSel ? (
                        <Chip
                          size="small"
                          label={adminMode ? 'Respuesta' : 'Tu respuesta'}
                          className={correctIdx == null || isCorrect ? 'hex-rev-chip-sel' : 'hex-rev-chip-bad'}
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

        if (inf) {
          return (
            <Box key={L.id} className="hex-q-section">
              <div
                className="hex-q-section-title"
                dangerouslySetInnerHTML={{ __html: L.pregunta_texto || '' }}
              />
              <div className="hex-q-section-line" aria-hidden />
            </Box>
          );
        }

        return (
          <Box key={L.id} className="hex-rev-card">
            <div className="hex-rev-card-top">
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <span className="hex-rev-num">
                  {(lineas || []).slice(0, idx).filter((x) => !(x.pregunta_solo_informativo === true || x.pregunta_solo_informativo === 1)).length + 1}
                </span>
                <Chip
                  size="small"
                  label={tipoLabel(tipo)}
                  sx={{
                    bgcolor: accent.bg,
                    color: accent.color,
                    border: `1px solid ${accent.border}`,
                    fontWeight: 700
                  }}
                />
                {adminMode && manual ? (
                  <Chip size="small" label="Revisión manual" sx={{ bgcolor: '#fef3c7', color: '#92400e', fontWeight: 700 }} />
                ) : null}
              </Stack>
            </div>

            <Box
              className="hex-revision-pregunta-html"
              sx={{
                fontWeight: 700,
                color: '#0f172a',
                lineHeight: 1.45,
                mt: 1.25,
                '& p': { margin: '0 0 0.35rem' },
                '& p:last-of-type': { marginBottom: 0 }
              }}
              dangerouslySetInnerHTML={{ __html: L.pregunta_texto || '' }}
            />

            <Typography
              variant="caption"
              sx={{ display: 'block', mt: 1.25, mb: 0.75, color: '#64748b', fontWeight: 700, letterSpacing: '0.02em' }}
            >
              {adminMode ? 'RESPUESTA DEL PARTICIPANTE' : 'TU RESPUESTA'}
            </Typography>

            <Box sx={{ mb: 1.5 }}>{respuestaContenido}</Box>

            {puedeEditarPuntos ? (
              <Box className="hex-rev-score-panel">
                <Typography variant="subtitle2" fontWeight={800} sx={{ color: '#1e3a8a', mb: 1 }}>
                  Calificación
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                  <TextField
                    size="small"
                    label="Puntos"
                    type="number"
                    inputProps={{ min: 0, max: Math.round(ptsMax), step: 1 }}
                    helperText={`Máximo: ${fmtPts(ptsMax)}`}
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
                    sx={{
                      minWidth: 140,
                      '& .MuiOutlinedInput-root': { bgcolor: '#fff', borderRadius: 2 }
                    }}
                  />
                  <TextField
                    size="small"
                    fullWidth
                    label="Comentario al estudiante (opcional)"
                    value={lineEdits[L.id]?.comentario_docente ?? ''}
                    onChange={(e) =>
                      setLineEdits?.((prev) => ({
                        ...prev,
                        [L.id]: { ...prev[L.id], comentario_docente: e.target.value }
                      }))
                    }
                    sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#fff', borderRadius: 2 } }}
                  />
                </Stack>
              </Box>
            ) : (
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                {!inf ? (
                  <Chip
                    size="small"
                    label={`Puntos: ${fmtPts(L.puntos_otorgados)} / ${fmtPts(ptsMax)}`}
                    sx={{
                      bgcolor: '#e0e7ff',
                      color: '#3730a3',
                      fontWeight: 800,
                      border: '1px solid #c7d2fe'
                    }}
                  />
                ) : null}
                {String(L.comentario_docente || '').trim() ? (
                  <Box className="hex-rev-comment">
                    <Typography variant="caption" fontWeight={800} color="text.secondary" display="block">
                      {adminMode ? 'Comentario al estudiante' : 'Comentario del revisor'}
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
                      {String(L.comentario_docente).trim()}
                    </Typography>
                  </Box>
                ) : null}
              </Stack>
            )}
          </Box>
        );
      })}
    </Stack>
  );
}
