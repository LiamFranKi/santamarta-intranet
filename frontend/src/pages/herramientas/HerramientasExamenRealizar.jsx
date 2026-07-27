import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
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
import { fmtPts } from './hexExamenesFormat';
import { getHexContext, HEX_ADMIN_BASE, HEX_DOCENTE_BASE, HEX_ROOT } from './hexExamenesPaths';
import HexFirmaPad from './HexFirmaPad';

function esPreguntaContable(p) {
  if (!p) return false;
  if (p.solo_informativo) return false;
  if (String(p.tipo || '').toUpperCase() === 'COMPROMISO') return false;
  return true;
}

/** Mismo criterio que el listado del editor: GENERAL → puntos_correcta del examen; INDIVIDUAL → puntos de la pregunta. */
function puntosMostrarHex(examen, pregunta) {
  const tp = String(examen?.tipo_puntaje || 'GENERAL').toUpperCase();
  if (tp === 'GENERAL') {
    const pc = examen?.puntos_correcta;
    if (pc != null && pc !== '') return Number(pc);
    return Number(pregunta?.puntos) || 0;
  }
  return Number(pregunta?.puntos) || 0;
}

export default function HerramientasExamenRealizar() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const ctx = getHexContext(pathname);
  const [searchParams] = useSearchParams();
  const preview = searchParams.get('preview') === '1';
  const fromAdmin = searchParams.get('from') === 'admin';
  const adminResponder = searchParams.get('responder') === '1';
  const volverPath = preview && fromAdmin
    ? HEX_ADMIN_BASE
    : !preview && fromAdmin && adminResponder
      ? `${HEX_ADMIN_BASE}?tab=responder`
      : ctx === 'docente'
        ? HEX_DOCENTE_BASE
        : HEX_ROOT;

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
        Swal.fire('Error', msg, 'error').then(() => navigate(volverPath));
      } finally {
        if (!c) setLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [id, navigate, preview, volverPath, pathname]);

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
    for (let qi = 0; qi < payload.preguntas.length; qi += 1) {
      const p = payload.preguntas[qi];
      if (p.solo_informativo) continue;
      const oblig = p.obligatoria !== false;
      const r = respuestas[p.id] || {};
      const tipo = String(p.tipo || '').toUpperCase();
      const nroVisible =
        payload.preguntas.slice(0, qi).filter(esPreguntaContable).length + (esPreguntaContable(p) ? 1 : 0);
      if (oblig) {
        if (tipo === 'ALTERNATIVAS' && r.indice == null) {
          Swal.fire('Atención', `Selecciona una opción en la pregunta ${nroVisible}`, 'warning');
          return;
        }
        if (tipo === 'VERDADERO_FALSO' && r.valor !== true && r.valor !== false) {
          Swal.fire('Atención', `Marca verdadero o falso en la pregunta ${nroVisible}`, 'warning');
          return;
        }
        if (tipo === 'RESPUESTA_CORTA' && !String(r.texto || '').trim()) {
          Swal.fire('Atención', `Completa la pregunta ${nroVisible}`, 'warning');
          return;
        }
        if (tipo === 'COMPROMISO') {
          if (r.aceptado !== true) {
            Swal.fire('Atención', 'Debe marcar la casilla de aceptación del compromiso', 'warning');
            return;
          }
          if (!r.firma_data_url || !String(r.firma_data_url).startsWith('data:image/png')) {
            Swal.fire('Atención', 'Debe firmar en el recuadro de firma', 'warning');
            return;
          }
        }
      }
      if (tipo === 'ALTERNATIVAS') lista.push({ pregunta_id: p.id, indice: r.indice });
      else if (tipo === 'VERDADERO_FALSO') lista.push({ pregunta_id: p.id, valor: r.valor });
      else if (tipo === 'RESPUESTA_CORTA') lista.push({ pregunta_id: p.id, texto: r.texto ?? '' });
      else if (tipo === 'COMPROMISO') {
        lista.push({
          pregunta_id: p.id,
          aceptado: r.aceptado === true,
          firma_data_url: r.firma_data_url || null
        });
      }
    }

    setEnviando(true);
    try {
      const { data } = await api.post(`/herramientas-examenes/intento/${intentoId}/enviar`, { respuestas: lista });
      const mn = data.mostrar_nota || 'AL_ENVIAR';
      const lines = [];
      if (data.requiere_revision_docente) {
        lines.push(
          '<p>Quedan preguntas <strong>pendientes de revisión</strong> (texto o calificación manual). Te avisaremos cuando tengas la nota final.</p>'
        );
      }
      if (mn !== 'NO' && data.puntaje_max != null && data.estado === 'CALIFICADO') {
        lines.push(
          `<p><strong>Nota: ${fmtPts(data.puntaje_obtenido)} / ${fmtPts(data.puntaje_max)}</strong></p>`
        );
      } else if (mn !== 'NO' && data.puntaje_max != null && data.estado === 'ENVIADO' && data.requiere_revision_docente) {
        if (mn === 'AL_ENVIAR') {
          lines.push(
            `<p>Puntaje parcial (autoevaluable): <strong>${fmtPts(data.puntaje_obtenido)} / ${fmtPts(data.puntaje_max)}</strong></p>`
          );
        } else if (mn === 'TRAS_REVISION') {
          lines.push('<p>La nota se mostrará cuando termine la revisión.</p>');
        }
      } else if (mn !== 'NO' && data.puntaje_max != null && !data.requiere_revision_docente) {
        lines.push(`<p><strong>Nota: ${fmtPts(data.puntaje_obtenido)} / ${fmtPts(data.puntaje_max)}</strong></p>`);
      }
      Swal.fire({
        icon: 'success',
        title: 'Enviado',
        html: `<p>${data.mensaje || 'Gracias.'}</p>${lines.join('')}`,
        confirmButtonText: 'OK'
      }).then(() => {
        let dest = HEX_ROOT;
        if (!preview && fromAdmin && adminResponder) dest = `${HEX_ADMIN_BASE}/resultado/${id}`;
        else if (ctx === 'docente') dest = `${HEX_DOCENTE_BASE}/resultado/${id}`;
        navigate(dest);
      });
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
      <Box className="hex-realizar-page" sx={{ maxWidth: 820, mx: 'auto', px: 1.5, pb: 6 }}>
        {preview ? (
          <Alert
            severity="info"
            sx={{
              mb: 2,
              borderRadius: 3,
              border: '1px solid #bfdbfe',
              bgcolor: '#eff6ff',
              fontWeight: 600
            }}
          >
            <strong>Vista previa.</strong> No se guardan respuestas.
          </Alert>
        ) : null}

        <div className="hex-exam-realizar-hero">
          <Typography variant="overline" sx={{ opacity: 0.9, letterSpacing: '0.12em', fontWeight: 800 }}>
            Evaluación
          </Typography>
          <Typography variant="h5" fontWeight={900} sx={{ letterSpacing: '-0.02em', lineHeight: 1.25 }}>
            {examen.titulo}
          </Typography>
          {examen.descripcion ? (
            <Typography variant="body2" sx={{ mt: 1.25, opacity: 0.95, lineHeight: 1.55, maxWidth: 640 }}>
              {examen.descripcion}
            </Typography>
          ) : null}
          <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 1.75 }}>
            <Chip size="small" className="hex-hero-chip" label={examen.modo} />
            <Chip
              size="small"
              className="hex-hero-chip"
              label={`${(preguntas || []).filter(esPreguntaContable).length} pregunta(s)`}
            />
            {examen.tiempo_minutos ? (
              <Chip size="small" className="hex-hero-chip" label={`${examen.tiempo_minutos} min`} />
            ) : null}
          </Stack>
        </div>

        {examen.bloque_contenido ||
        examen.bloque_imagen_url ||
        (Array.isArray(examen.bloque_archivos) && examen.bloque_archivos.length > 0) ? (
          <Card className="hex-realizar-contexto" elevation={0}>
            <CardContent>
              <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1, color: '#4338ca' }}>
                Contexto del examen
              </Typography>
              {examen.bloque_imagen_url ? (
                <Box
                  component="img"
                  src={examen.bloque_imagen_url}
                  alt=""
                  sx={{
                    maxWidth: '100%',
                    maxHeight: 280,
                    borderRadius: 2,
                    mb: examen.bloque_contenido || (examen.bloque_archivos || []).length ? 2 : 0,
                    objectFit: 'contain'
                  }}
                />
              ) : null}
              {examen.bloque_contenido ? (
                <Box
                  className="hex-exam-bloque-html"
                  sx={{
                    '& p': { marginTop: 0 },
                    lineHeight: 1.6,
                    mb: (examen.bloque_archivos || []).length ? 2 : 0
                  }}
                  dangerouslySetInnerHTML={{ __html: examen.bloque_contenido }}
                />
              ) : null}

              {(examen.bloque_archivos || []).length > 0 ? (
                <Box className="hex-ref-material">
                  <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 0.75, color: '#9a3412' }}>
                    Material de referencia
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 1.5, color: '#78716c', fontWeight: 600 }}>
                    Revise estos documentos antes de responder.
                  </Typography>
                  <div className="hex-pdf-cards">
                    {(examen.bloque_archivos || []).map((arch, idx) => (
                      <div key={`${arch.url}-${idx}`} className="hex-pdf-card">
                        <div className="hex-pdf-card-icon" aria-hidden>
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                            <path
                              d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"
                              fill="#fee2e2"
                              stroke="#dc2626"
                              strokeWidth="1.4"
                            />
                            <path d="M14 3v5h5" stroke="#dc2626" strokeWidth="1.4" fill="none" />
                            <text x="7.5" y="17.5" fontSize="7" fontWeight="800" fill="#b91c1c">
                              PDF
                            </text>
                          </svg>
                        </div>
                        <div className="hex-pdf-card-body">
                          <div className="hex-pdf-card-name">{arch.nombre || 'Documento.pdf'}</div>
                          <div className="hex-pdf-card-meta">Documento adjunto</div>
                        </div>
                        <a
                          className="hex-pdf-btn hex-pdf-btn--open"
                          href={arch.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Abrir
                        </a>
                      </div>
                    ))}
                  </div>
                </Box>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        <fieldset disabled={preview} style={{ border: 'none', padding: 0, margin: 0 }}>
          <Stack spacing={2.25}>
            {preguntas.map((p, idx) => {
              const tipo = String(p.tipo || '').toUpperCase();
              const r = respuestas[p.id] || {};
              const pts = puntosMostrarHex(examen, p);
              const soloInf = !!p.solo_informativo;
              const esCompromiso = tipo === 'COMPROMISO';

              if (soloInf) {
                return (
                  <Box key={p.id} className="hex-q-section">
                    <div
                      className="hex-q-section-title"
                      dangerouslySetInnerHTML={{ __html: p.texto || '' }}
                    />
                    <div className="hex-q-section-line" aria-hidden />
                  </Box>
                );
              }

              if (esCompromiso) {
                return (
                  <Box key={p.id} className="hex-q-compromiso">
                    <div
                      className="hex-q-section-title"
                      dangerouslySetInnerHTML={{ __html: p.texto || '' }}
                    />
                    <FormControlLabel
                      className="hex-compromiso-check"
                      control={
                        <Checkbox
                          checked={r.aceptado === true}
                          onChange={(e) => setVal(p.id, { aceptado: e.target.checked })}
                          disabled={preview}
                        />
                      }
                      label="Declaro haber leído y acepto el compromiso anterior"
                    />
                    <Typography variant="subtitle2" fontWeight={800} sx={{ mt: 1.5, mb: 0.75, color: '#334155' }}>
                      Firma
                    </Typography>
                    <HexFirmaPad
                      value={r.firma_data_url || null}
                      disabled={preview}
                      onChange={(dataUrl) => setVal(p.id, { firma_data_url: dataUrl })}
                    />
                    <div className="hex-q-section-line" aria-hidden />
                  </Box>
                );
              }

              const nroPregunta = preguntas.slice(0, idx).filter(esPreguntaContable).length + 1;

              return (
                <Card key={p.id} className="hex-q-card" elevation={0}>
                  <CardContent sx={{ p: { xs: 2, sm: 2.5 }, '&:last-child': { pb: { xs: 2, sm: 2.5 } } }}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1.25 }}>
                      <span className="hex-q-badge-num">{nroPregunta}</span>
                      <Chip
                        size="small"
                        label={
                          tipo === 'ALTERNATIVAS'
                            ? 'Alternativas'
                            : tipo === 'VERDADERO_FALSO'
                              ? 'V / F'
                              : 'Respuesta corta'
                        }
                        className="hex-q-chip-tipo"
                      />
                      <Chip size="small" label={`${fmtPts(pts)} pt`} className="hex-q-chip-pts" />
                    </Stack>

                    <div className="hex-q-enunciado">
                      <div
                        className="hex-q-enunciado-body"
                        dangerouslySetInnerHTML={{ __html: p.texto || '' }}
                      />
                    </div>

                    {tipo === 'ALTERNATIVAS' ? (
                      <FormControl component="fieldset" sx={{ mt: 1.5 }} fullWidth>
                        <RadioGroup
                          value={r.indice != null ? String(r.indice) : ''}
                          onChange={(e) => setVal(p.id, { indice: parseInt(e.target.value, 10) })}
                          className="hex-q-options"
                        >
                          {(p.opciones?.opciones || []).map((op, j) => (
                            <FormControlLabel
                              key={j}
                              value={String(j)}
                              className={`hex-q-option ${r.indice === j ? 'hex-q-option--on' : ''}`}
                              control={<Radio size="small" />}
                              label={<span dangerouslySetInnerHTML={{ __html: String(op || '') }} />}
                            />
                          ))}
                        </RadioGroup>
                      </FormControl>
                    ) : null}

                    {tipo === 'VERDADERO_FALSO' ? (
                      <FormControl component="fieldset" sx={{ mt: 1.5 }} fullWidth>
                        <RadioGroup
                          value={r.valor === true ? 'v' : r.valor === false ? 'f' : ''}
                          onChange={(e) => setVal(p.id, { valor: e.target.value === 'v' })}
                          className="hex-q-options hex-q-options--row"
                        >
                          <FormControlLabel
                            value="v"
                            className={`hex-q-option ${r.valor === true ? 'hex-q-option--on' : ''}`}
                            control={<Radio size="small" />}
                            label="Verdadero"
                          />
                          <FormControlLabel
                            value="f"
                            className={`hex-q-option ${r.valor === false ? 'hex-q-option--on' : ''}`}
                            control={<Radio size="small" />}
                            label="Falso"
                          />
                        </RadioGroup>
                      </FormControl>
                    ) : null}

                    {tipo === 'RESPUESTA_CORTA' ? (
                      <TextField
                        fullWidth
                        multiline
                        minRows={3}
                        sx={{
                          mt: 1.5,
                          '& .MuiOutlinedInput-root': {
                            borderRadius: 2.5,
                            bgcolor: '#f8fafc'
                          }
                        }}
                        value={r.texto || ''}
                        onChange={(e) => setVal(p.id, { texto: e.target.value })}
                        placeholder="Escribe tu respuesta"
                      />
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </Stack>
        </fieldset>

        <Stack direction="row" spacing={1.5} justifyContent="flex-end" flexWrap="wrap" useFlexGap sx={{ mt: 3 }}>
          <Button variant="outlined" onClick={() => navigate(volverPath)} sx={{ borderRadius: 2, fontWeight: 700 }}>
            Volver
          </Button>
          {!preview && intentoId ? (
            <Button variant="outlined" onClick={guardarBorrador} sx={{ borderRadius: 2, fontWeight: 700 }}>
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
                borderRadius: 2.5,
                px: 3.5,
                py: 1.1,
                background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                boxShadow: '0 8px 24px rgba(79,70,229,0.35)'
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
