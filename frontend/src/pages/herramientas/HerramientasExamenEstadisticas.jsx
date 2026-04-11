import React, { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
  Chip,
  Divider
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import Swal from 'sweetalert2';
import '../../pages/admin/AdminUsuarios.css';
import './HerramientasExamenes.css';

/** Coherente con backend: GENERAL → puntos_correcta; INDIVIDUAL → pregunta_puntos */
function puntosMaxLineaRevision(examen, L) {
  const tp = String(examen?.tipo_puntaje || 'GENERAL').toUpperCase();
  const base = tp === 'GENERAL' ? Number(examen?.puntos_correcta) || 0 : Number(L.pregunta_puntos) || 0;
  const inf = L.pregunta_solo_informativo === true || L.pregunta_solo_informativo === 1;
  const modo = String(examen?.modo || 'MIXTO').toUpperCase();
  if (modo === 'PRACTICA') return base;
  return inf ? 0 : base;
}

function parsePreguntaOpciones(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default function HerramientasExamenEstadisticas({ variant = 'admin' }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const esAdmin = variant === 'admin';
  const base = '/admin/herramientas/examenes';

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [dlg, setDlg] = useState(null);
  const [lineEdits, setLineEdits] = useState({});
  const [recalculando, setRecalculando] = useState(false);
  const [eliminandoId, setEliminandoId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: d } = await api.get(`/herramientas-examenes/gestion/${id}/estadisticas`);
      setData(d);
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || 'No se pudo cargar', 'error');
      navigate(base);
    } finally {
      setLoading(false);
    }
  }, [id, navigate, base]);

  useEffect(() => {
    load();
  }, [load]);

  const abrirRevision = async (intentoRow) => {
    try {
      const { data: d } = await api.get(`/herramientas-examenes/gestion/${id}/intento/${intentoRow.id}`);
      const edits = {};
      for (const L of d.lineas || []) {
        edits[L.id] = {
          puntos_otorgados: L.puntos_otorgados != null ? String(L.puntos_otorgados) : '',
          comentario_docente: L.comentario_docente || ''
        };
      }
      setLineEdits(edits);
      setDlg({ intento: d.intento, lineas: d.lineas || [], examen: d.examen || {} });
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || 'No se pudo abrir', 'error');
    }
  };

  const eliminarIntento = async (row) => {
    const ok = await Swal.fire({
      title: '¿Eliminar este intento?',
      html:
        'Se borrarán las respuestas de este intento. El participante podrá <strong>volver a rendir</strong> el examen si aún hay cupo de intentos.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      focusCancel: true
    });
    if (!ok.isConfirmed) return;
    setEliminandoId(row.id);
    try {
      await api.delete(`/herramientas-examenes/gestion/${id}/intento/${row.id}`);
      if (dlg?.intento?.id === row.id) setDlg(null);
      await load();
      Swal.fire('Listo', 'Intento eliminado. El usuario puede volver a dar el examen.', 'success');
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || 'No se pudo eliminar', 'error');
    } finally {
      setEliminandoId(null);
    }
  };

  const recalcularPuntos = async () => {
    const ok = await Swal.fire({
      title: 'Recalcular puntajes',
      text: 'Se actualizan las respuestas autoevaluables según la configuración del examen (p. ej. puntos por respuesta en modo GENERAL). Las respuestas cortas ya calificadas manualmente se respetan.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, recalcular',
      cancelButtonText: 'Cancelar'
    });
    if (!ok.isConfirmed) return;
    setRecalculando(true);
    try {
      const { data: r } = await api.post(`/herramientas-examenes/gestion/${id}/recalcular-puntos`);
      Swal.fire('Listo', `Intentos actualizados: ${r.intentos_actualizados ?? 0}.`, 'success');
      await load();
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || 'No se pudo recalcular', 'error');
    } finally {
      setRecalculando(false);
    }
  };

  const guardarRevision = async () => {
    if (!dlg) return;
    const lineas = Object.entries(lineEdits).map(([linea_id, v]) => ({
      linea_id: parseInt(linea_id, 10),
      puntos_otorgados: v.puntos_otorgados === '' ? null : Number(v.puntos_otorgados),
      comentario_docente: v.comentario_docente || null
    }));
    try {
      await api.put(`/herramientas-examenes/gestion/${id}/intento/${dlg.intento.id}/revision`, { lineas });
      Swal.fire('Listo', 'Calificación guardada.', 'success');
      setDlg(null);
      load();
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || 'No se pudo guardar', 'error');
    }
  };

  if (!esAdmin) {
    return <Navigate to="/herramientas-examenes" replace />;
  }

  if (loading || !data) {
    return (
      <DashboardLayout>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="hex-exam-wrap">
        <div className="admin-usu-toolbar" style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <button type="button" className="admin-usu-btn admin-usu-btn-secondary" onClick={() => navigate(base)}>
            ← Volver
          </button>
          <button
            type="button"
            className="admin-usu-btn admin-usu-btn-new"
            disabled={recalculando}
            onClick={recalcularPuntos}
            title="Actualiza puntos de alternativas y V/F según puntos por respuesta del examen (modo GENERAL)"
          >
            {recalculando ? 'Recalculando…' : 'Recalcular puntajes'}
          </button>
        </div>

        <div className="hex-exam-hero">
          <Typography variant="h5" fontWeight={800}>
            {data.examen?.titulo}
          </Typography>
          <Typography variant="body2" sx={{ mt: 1, opacity: 0.95 }}>
            Modo: {data.examen?.modo}
            {data.examen?.tipo_puntaje === 'GENERAL' && data.examen?.puntos_correcta != null
              ? ` · Puntos por respuesta: ${data.examen.puntos_correcta}`
              : data.examen?.tipo_puntaje === 'INDIVIDUAL'
                ? ' · Puntaje por pregunta (individual)'
                : ''}
            {' · '}
            Intentos enviados: {data.totalIntentos} · Pendientes de revisión (texto): {data.pendientesRevision}
            {data.puntaje_max_examen != null ? ` · Máximo posible: ${data.puntaje_max_examen} pt.` : ''}
          </Typography>
        </div>

        <div className="admin-enc-stat-hero" style={{ marginBottom: 16 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <div className="hex-exam-stat-kpi" style={{ flex: 1 }}>
              <div className="hex-exam-stat-kpi-num">{data.totalIntentos}</div>
              <Typography variant="caption" color="text.secondary">
                Intentos completados
              </Typography>
            </div>
            <div className="hex-exam-stat-kpi" style={{ flex: 1 }}>
              <div className="hex-exam-stat-kpi-num">{data.pendientesRevision}</div>
              <Typography variant="caption" color="text.secondary">
                Pendientes revisión manual
              </Typography>
            </div>
          </Stack>
        </div>

        <div className="admin-usu-table-card">
          <div className="admin-usu-table-scroll">
            <table className="admin-usu-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Puntaje</th>
                  <th>Fecha</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(data.intentos || []).map((row) => (
                  <tr key={row.id}>
                    <td>{row.nombre_mostrar || row.login_usuario || `#${row.usuario_id}`}</td>
                    <td>{row.rol_respondiente}</td>
                    <td>
                      {row.estado === 'CALIFICADO' ? (
                        <span className="admin-usu-badge admin-usu-badge-ok">Calificado</span>
                      ) : (
                        <span className="admin-usu-badge admin-usu-badge-muted">{row.estado}</span>
                      )}
                    </td>
                    <td>
                      {row.puntaje_obtenido != null
                        ? `${row.puntaje_obtenido} / ${data.puntaje_max_examen ?? row.puntaje_max_snapshot ?? '—'}`
                        : '—'}
                    </td>
                    <td>{row.fecha_envio ? String(row.fecha_envio).slice(0, 19) : '—'}</td>
                    <td>
                      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                        <button
                          type="button"
                          className="admin-usu-btn admin-usu-btn-primary"
                          style={{ fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                          disabled={eliminandoId === row.id}
                          onClick={() => abrirRevision(row)}
                        >
                          <RateReviewOutlinedIcon sx={{ fontSize: 18 }} />
                          Revisar
                        </button>
                        <button
                          type="button"
                          className="admin-usu-btn admin-usu-btn-secondary"
                          style={{ fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                          disabled={eliminandoId === row.id}
                          onClick={() => eliminarIntento(row)}
                        >
                          {eliminandoId === row.id ? (
                            '…'
                          ) : (
                            <>
                              <DeleteOutlineIcon sx={{ fontSize: 18 }} />
                              Eliminar
                            </>
                          )}
                        </button>
                      </Stack>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Dialog open={Boolean(dlg)} onClose={() => setDlg(null)} maxWidth="md" fullWidth>
        <DialogTitle>Revisión de intento</DialogTitle>
        <DialogContent dividers>
          {(dlg?.lineas || []).map((L, idx) => {
            let rj = L.respuesta_json || {};
            if (typeof rj === 'string') {
              try {
                rj = JSON.parse(rj);
              } catch {
                rj = {};
              }
            }
            const tipo = String(L.pregunta_tipo || '').toUpperCase();
            const exRev = dlg?.examen || {};
            const ptsMax = puntosMaxLineaRevision(exRev, L);

            let respuestaContenido = null;
            if (tipo === 'RESPUESTA_CORTA') {
              respuestaContenido = <Typography variant="body2">{rj.texto || '—'}</Typography>;
            } else if (tipo === 'VERDADERO_FALSO') {
              respuestaContenido = (
                <Typography variant="body2" fontWeight={600}>
                  {rj.valor === true ? 'Verdadero' : rj.valor === false ? 'Falso' : '—'}
                </Typography>
              );
            } else if (tipo === 'ALTERNATIVAS') {
              const op = parsePreguntaOpciones(L.pregunta_opciones);
              const idxSel = rj.indice;
              const rawOp = idxSel != null && op?.opciones ? op.opciones[idxSel] : null;
              respuestaContenido = rawOp ? (
                <Box
                  className="hex-revision-resp-html"
                  sx={{ lineHeight: 1.5, '& p': { m: 0 } }}
                  dangerouslySetInnerHTML={{ __html: String(rawOp) }}
                />
              ) : (
                <Typography variant="body2">{idxSel != null ? `Opción ${Number(idxSel) + 1}` : '—'}</Typography>
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
                  Respuesta del participante
                </Typography>
                <Box sx={{ pl: 0.5, mt: 0.5, mb: 1 }}>{respuestaContenido}</Box>
                <Divider sx={{ my: 1.5 }} />
                {L.requiere_revision ? (
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1 }}>
                    <TextField
                      size="small"
                      label="Puntos"
                      type="number"
                      helperText={`Máximo según examen: ${ptsMax}`}
                      value={lineEdits[L.id]?.puntos_otorgados ?? ''}
                      onChange={(e) =>
                        setLineEdits((prev) => ({
                          ...prev,
                          [L.id]: { ...prev[L.id], puntos_otorgados: e.target.value }
                        }))
                      }
                    />
                    <TextField
                      size="small"
                      fullWidth
                      label="Comentario al estudiante"
                      value={lineEdits[L.id]?.comentario_docente ?? ''}
                      onChange={(e) =>
                        setLineEdits((prev) => ({
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
                    label={`Puntos: ${L.puntos_otorgados ?? '—'} / ${ptsMax}`}
                  />
                )}
              </Box>
            );
          })}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDlg(null)}>Cerrar</Button>
          <Button variant="contained" onClick={guardarRevision}>
            Guardar calificación
          </Button>
        </DialogActions>
      </Dialog>
    </DashboardLayout>
  );
}
