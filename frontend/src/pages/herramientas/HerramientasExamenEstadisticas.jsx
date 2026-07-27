import React, { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Paper,
  Stack,
  Typography
} from '@mui/material';
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import Swal from 'sweetalert2';
import '../../pages/admin/AdminUsuarios.css';
import './HerramientasExamenes.css';
import HexExamenesRevisionLineas from './HexExamenesRevisionLineas';
import { fmtPts } from './hexExamenesFormat';
import { generarPdfEstadisticasExamenHerramientas } from './hexExamenEstadisticasPdf';

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
  const [modalGraficos, setModalGraficos] = useState(false);

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
          puntos_otorgados:
            L.puntos_otorgados != null ? String(Math.round(Number(L.puntos_otorgados))) : '',
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

  const exportarPdf = () => {
    if (!data) return;
    generarPdfEstadisticasExamenHerramientas({
      examen: data.examen,
      puntaje_max_examen: data.puntaje_max_examen,
      totalIntentos: data.totalIntentos,
      pendientesRevision: data.pendientesRevision,
      estadisticas_agregadas: data.estadisticas_agregadas,
      intentos: data.intentos || []
    });
  };

  const guardarRevision = async () => {
    if (!dlg) return;
    const lineas = Object.entries(lineEdits).map(([linea_id, v]) => ({
      linea_id: parseInt(linea_id, 10),
      puntos_otorgados:
        v.puntos_otorgados === '' || v.puntos_otorgados == null
          ? null
          : Math.round(Number(v.puntos_otorgados)),
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

  const agg = data.estadisticas_agregadas;
  const distLabels = agg?.distribucion_rangos?.labels || [];
  const distCounts = agg?.distribucion_rangos?.counts || [];
  const maxDist = Math.max(...distCounts, 1);

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
          <button
            type="button"
            className="admin-usu-btn admin-usu-btn-secondary"
            onClick={() => setModalGraficos(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <BarChartOutlinedIcon sx={{ fontSize: 18 }} />
            Gráficos
          </button>
          <button
            type="button"
            className="admin-usu-btn admin-usu-btn-primary"
            onClick={exportarPdf}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <PictureAsPdfOutlinedIcon sx={{ fontSize: 18 }} />
            Exportar PDF
          </button>
        </div>

        <div className="hex-exam-hero">
          <Typography variant="h5" fontWeight={800}>
            {data.examen?.titulo}
          </Typography>
          <Typography variant="body2" sx={{ mt: 1, opacity: 0.95 }}>
            Modo: {data.examen?.modo}
            {data.examen?.tipo_puntaje === 'GENERAL' && data.examen?.puntos_correcta != null
              ? ` · Puntos por respuesta: ${fmtPts(data.examen.puntos_correcta)}`
              : data.examen?.tipo_puntaje === 'INDIVIDUAL'
                ? ' · Puntaje por pregunta (individual)'
                : ''}
            {' · '}
            Intentos enviados: {data.totalIntentos} · Pendientes de revisión (texto): {data.pendientesRevision}
            {data.puntaje_max_examen != null ? ` · Máximo posible: ${fmtPts(data.puntaje_max_examen)} pt.` : ''}
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
                        ? `${fmtPts(row.puntaje_obtenido)} / ${fmtPts(data.puntaje_max_examen ?? row.puntaje_max_snapshot)}`
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
        <DialogTitle className="hex-rev-dlg-title">Revisión de intento</DialogTitle>
        <DialogContent dividers className="hex-rev-dlg-content">
          {dlg?.intento ? (
            <Box
              sx={{
                mb: 2,
                p: 1.5,
                borderRadius: 2,
                bgcolor: '#fff',
                border: '1px solid #e0e7ff',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 1.5,
                alignItems: 'center'
              }}
            >
              <Typography variant="body2" fontWeight={700} color="text.secondary">
                Intento #{dlg.intento.id}
              </Typography>
              {dlg.intento.puntaje_obtenido != null ? (
                <Chip
                  size="small"
                  label={`Puntaje actual: ${fmtPts(dlg.intento.puntaje_obtenido)} / ${fmtPts(
                    dlg.intento.puntaje_max_snapshot ?? data?.puntaje_max_examen
                  )}`}
                  sx={{ bgcolor: '#e0e7ff', color: '#3730a3', fontWeight: 800 }}
                />
              ) : null}
              <Typography variant="caption" color="text.secondary">
                Asigna o ajusta los puntos por pregunta y guarda la calificación.
              </Typography>
            </Box>
          ) : null}
          <HexExamenesRevisionLineas
            lineas={dlg?.lineas || []}
            examen={dlg?.examen || {}}
            adminMode
            lineEdits={lineEdits}
            setLineEdits={setLineEdits}
          />
        </DialogContent>
        <DialogActions sx={{ px: 2.5, py: 1.75, bgcolor: '#f8fafc' }}>
          <Button onClick={() => setDlg(null)} sx={{ fontWeight: 700 }}>
            Cerrar
          </Button>
          <Button
            variant="contained"
            onClick={guardarRevision}
            sx={{
              fontWeight: 800,
              borderRadius: 2,
              px: 2.5,
              background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)'
            }}
          >
            Guardar calificación
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={modalGraficos} onClose={() => setModalGraficos(false)} maxWidth="md" fullWidth scroll="paper">
        <DialogTitle>Estadísticas del examen</DialogTitle>
        <DialogContent dividers>
          {!agg ? (
            <Typography color="text.secondary">No hay estadísticas agregadas disponibles.</Typography>
          ) : (
            <Stack spacing={2}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                  Indicadores globales
                </Typography>
                <Typography variant="body2">
                  Promedio de puntaje:{' '}
                  <strong>{agg.promedio_puntaje != null ? fmtPts(agg.promedio_puntaje) : '—'}</strong>
                  {' · '}
                  Mediana: <strong>{agg.mediana_puntaje != null ? fmtPts(agg.mediana_puntaje) : '—'}</strong>
                  {' · '}
                  Intentos con puntaje: <strong>{agg.n_con_puntaje ?? 0}</strong>
                </Typography>
                {agg.distribucion_rangos?.descripcion && (
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                    {agg.distribucion_rangos.descripcion}
                  </Typography>
                )}
              </Paper>

              <Box>
                <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                  Distribución de resultados (barras)
                </Typography>
                {distLabels.map((lab, i) => {
                  const c = distCounts[i] ?? 0;
                  const pctBar = maxDist > 0 ? Math.round((100 * c) / maxDist) : 0;
                  return (
                    <Box key={lab} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <Typography variant="caption" sx={{ width: 72, flexShrink: 0 }}>
                        {lab}
                      </Typography>
                      <Box sx={{ flex: 1, bgcolor: 'action.hover', borderRadius: 1, height: 12, overflow: 'hidden' }}>
                        <Box
                          sx={{
                            width: `${pctBar}%`,
                            bgcolor: 'primary.main',
                            height: 12,
                            borderRadius: 1,
                            transition: 'width 0.2s'
                          }}
                        />
                      </Box>
                      <Typography variant="caption" sx={{ width: 48, textAlign: 'right' }}>
                        {c}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>

              <Divider />

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-start">
                <Paper variant="outlined" sx={{ p: 2, flex: 1, width: '100%' }}>
                  <Typography variant="subtitle2" fontWeight={700} gutterBottom color="error.main">
                    Más equivocadas (autoevaluables)
                  </Typography>
                  <Stack component="ol" sx={{ m: 0, pl: 2.5 }} spacing={0.5}>
                    {(agg.mas_equivocadas || []).map((p) => (
                      <Typography key={p.pregunta_id} component="li" variant="body2">
                        <strong>{p.porcentaje_acierto != null ? `${p.porcentaje_acierto}%` : '—'}</strong>{' '}
                        — {p.texto_preview}
                      </Typography>
                    ))}
                  </Stack>
                  {!(agg.mas_equivocadas || []).length && (
                    <Typography variant="body2" color="text.secondary">
                      Sin datos de alternativas/V.F. con respuestas.
                    </Typography>
                  )}
                </Paper>
                <Paper variant="outlined" sx={{ p: 2, flex: 1, width: '100%' }}>
                  <Typography variant="subtitle2" fontWeight={700} gutterBottom color="success.main">
                    Mejor respondidas (autoevaluables)
                  </Typography>
                  <Stack component="ol" sx={{ m: 0, pl: 2.5 }} spacing={0.5}>
                    {(agg.mejor_respondidas || []).map((p) => (
                      <Typography key={p.pregunta_id} component="li" variant="body2">
                        <strong>
                          {p.porcentaje_acierto != null ? `${p.porcentaje_acierto}%` : '—'}
                        </strong>{' '}
                        — {p.texto_preview}
                      </Typography>
                    ))}
                  </Stack>
                  {!(agg.mejor_respondidas || []).length && (
                    <Typography variant="body2" color="text.secondary">
                      Sin datos de alternativas/V.F. con respuestas.
                    </Typography>
                  )}
                </Paper>
              </Stack>

              <Divider />

              <Box>
                <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                  Todas las preguntas (resumen)
                </Typography>
                <Box sx={{ overflowX: 'auto' }}>
                  <table className="admin-usu-table" style={{ fontSize: '0.8rem' }}>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Tipo</th>
                        <th>Texto</th>
                        <th>% acierto</th>
                        <th>Resp. corta (prom. pts)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(agg.preguntas_resumen || []).map((p) => (
                        <tr key={p.pregunta_id}>
                          <td>{p.orden != null ? p.orden + 1 : '—'}</td>
                          <td>{p.tipo}</td>
                          <td>{p.texto_preview}</td>
                          <td>{p.porcentaje_acierto != null ? `${p.porcentaje_acierto}%` : '—'}</td>
                          <td>
                            {p.texto_calificadas > 0 && p.promedio_puntos_texto != null
                              ? fmtPts(p.promedio_puntos_texto)
                              : p.pendientes_revision > 0
                                ? `${p.pendientes_revision} pend.`
                                : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Box>
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModalGraficos(false)}>Cerrar</Button>
          <Button variant="contained" startIcon={<PictureAsPdfOutlinedIcon />} onClick={exportarPdf}>
            Exportar PDF
          </Button>
        </DialogActions>
      </Dialog>
    </DashboardLayout>
  );
}
