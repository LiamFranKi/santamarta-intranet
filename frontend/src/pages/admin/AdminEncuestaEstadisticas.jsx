import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import { procesarHTMLMensaje } from '../../utils/mensajesHtml';
import { generarPdfEstadisticasEncuesta } from './encuestaReportesPdf';
import Swal from 'sweetalert2';
import './AdminUsuarios.css';
import './AdminEncuestas.css';

const COLORS = ['#3f74ad', '#667eea', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#ef4444'];

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

function RichHtml({ html }) {
  if (!html) return null;
  return (
    <div
      className="admin-enc-rich"
      dangerouslySetInnerHTML={{ __html: procesarHTMLMensaje(html) }}
    />
  );
}

function maxVal(obj) {
  const vals = Object.values(obj || {}).map((x) => Number(x) || 0);
  return Math.max(1, ...vals);
}

function DistribucionBarraSegmentada({ entries, total }) {
  const t = total > 0 ? total : 1;
  const list = Array.isArray(entries) ? entries : Object.entries(entries || {});
  return (
    <Box sx={{ mt: 1 }}>
      <div className="admin-enc-stat-pie-strip">
        {list.map(([label, count], i) => {
          const c = Number(count) || 0;
          if (c <= 0) return null;
          const pct = (c / t) * 100;
          return (
            <Box
              key={String(label)}
              title={`${label}: ${c}`}
              sx={{
                width: `${pct}%`,
                minWidth: c > 0 ? 3 : 0,
                bgcolor: COLORS[i % COLORS.length],
                transition: 'width 0.3s ease'
              }}
            />
          );
        })}
      </div>
    </Box>
  );
}

function LeyendaFilas({ entries, total, labelKey = 0, valueKey = 1 }) {
  const t = total > 0 ? total : 1;
  const list = Array.isArray(entries) ? entries.map((e, i) => [e[labelKey], e[valueKey], i]) : Object.entries(entries || {}).map(([k, v], i) => [k, v, i]);
  return (
    <Stack spacing={1}>
      {list.map(([label, count, i]) => {
        const c = Number(count) || 0;
        return (
          <Stack key={String(label)} direction="row" alignItems="center" spacing={1.5}>
            <Box
              sx={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                flexShrink: 0,
                bgcolor: COLORS[(typeof i === 'number' ? i : 0) % COLORS.length]
              }}
            />
            <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap title={String(label)}>
              {label}
            </Typography>
            <Typography variant="body2" fontWeight={700}>
              {c}{' '}
              <Typography component="span" variant="caption" color="text.secondary">
                ({Math.round((c / t) * 100)}%)
              </Typography>
            </Typography>
          </Stack>
        );
      })}
    </Stack>
  );
}

function ModalTextos({ open, onClose, titulo, textos }) {
  const [q, setQ] = useState('');
  useEffect(() => {
    if (open) setQ('');
  }, [open, titulo]);

  const filtrados = useMemo(() => {
    const arr = textos || [];
    const s = q.trim().toLowerCase();
    if (!s) return arr;
    return arr.filter((t) => String(t).toLowerCase().includes(s));
  }, [textos, q]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth scroll="paper">
      <DialogTitle sx={{ pr: 6 }}>
        {titulo}
        <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
          {filtrados.length} de {(textos || []).length} respuestas
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <TextField
          size="small"
          fullWidth
          placeholder="Buscar en las respuestas…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          sx={{ mb: 2 }}
        />
        <div className="enc-stat-modal-list">
          <Stack spacing={1.25}>
            {filtrados.map((t, i) => (
              <div key={i} className="admin-enc-stat-texto-fila">
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                  #{i + 1}
                </Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {t}
                </Typography>
              </div>
            ))}
          </Stack>
          {filtrados.length === 0 ? (
            <Typography color="text.secondary" align="center" sx={{ py: 3 }}>
              No hay coincidencias.
            </Typography>
          ) : null}
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cerrar</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function AdminEncuestaEstadisticas() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [grupoSel, setGrupoSel] = useState('');
  const [modal, setModal] = useState({ open: false, titulo: '', textos: [] });

  const cargar = async (grupo) => {
    setLoading(true);
    try {
      const params = {};
      if (grupo) params.grupo = grupo;
      const { data: d } = await api.get(`/encuestas/admin/${id}/estadisticas`, { params });
      setData(d);
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || 'No se pudieron cargar', 'error');
      navigate('/admin/herramientas/encuestas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const { encuesta, totalRespuestas, totalGeneral, porRol, porGrupo, resultadosPreguntas, grupoSeleccionado } =
    data || {};
  const totalPorRol = useMemo(() => {
    const rows = porRol || [];
    return rows.reduce((s, r) => s + Number(r.c || 0), 0);
  }, [porRol]);

  const exportarPdf = () => {
    if (!data) return;
    try {
      generarPdfEstadisticasEncuesta({
        encuesta,
        totalGeneral: totalGeneral ?? totalRespuestas,
        totalRespuestas,
        grupoSeleccionado: grupoSeleccionado || null,
        porGrupo: porGrupo || [],
        porRol: porRol || [],
        resultadosPreguntas: resultadosPreguntas || []
      });
    } catch (e) {
      Swal.fire('Error', e.message || 'No se pudo generar el PDF', 'error');
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

  return (
    <DashboardLayout>
      <div className="admin-encuestas-wrap">
        <div className="admin-usu-toolbar" style={{ marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            className="admin-usu-btn admin-usu-btn-secondary"
            onClick={() => navigate('/admin/herramientas/encuestas')}
          >
            ← Volver a la lista
          </button>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ ml: { xs: 0, sm: 1 } }}>
            <BarChartOutlinedIcon color="primary" />
            <Typography variant="subtitle1" fontWeight={700} color="primary">
              Estadísticas de encuesta
            </Typography>
          </Stack>
          <Button
            variant="contained"
            size="small"
            startIcon={<PictureAsPdfIcon />}
            onClick={exportarPdf}
            sx={{ textTransform: 'none', ml: 'auto', background: 'linear-gradient(135deg,#dc2626,#ea580c)' }}
          >
            Exportar PDF
          </Button>
        </div>

        <div className="admin-enc-stat-hero">
          <Typography variant="h5" fontWeight={800} sx={{ color: '#1e3a5f', mb: 0.5 }}>
            {encuesta.titulo}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {encuesta.categoria_metrica ? (
              <>
                Categoría: <strong>{encuesta.categoria_metrica}</strong>
                {' · '}
              </>
            ) : null}
            {grupoSeleccionado
              ? `Estadísticas del grupo «${grupoSeleccionado}»`
              : 'Resumen total general de respuestas'}
          </Typography>

          <FormControl size="small" sx={{ mt: 2, minWidth: 260, bgcolor: '#fff', borderRadius: 1 }}>
            <InputLabel id="enc-stat-grupo-label">Ver por grupo</InputLabel>
            <Select
              labelId="enc-stat-grupo-label"
              label="Ver por grupo"
              value={grupoSel}
              onChange={(e) => {
                const v = e.target.value;
                setGrupoSel(v);
                cargar(v);
              }}
            >
              <MenuItem value="">
                Total general ({totalGeneral ?? totalRespuestas})
              </MenuItem>
              {(porGrupo || []).map((g) => (
                <MenuItem key={g.etiqueta} value={g.etiqueta}>
                  {g.etiqueta} ({g.c})
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 2 }}>
            <div className="admin-enc-stat-kpi" style={{ flex: 1 }}>
              <div className="admin-enc-stat-kpi-num">{totalRespuestas}</div>
              <Typography variant="caption" color="text.secondary">
                {grupoSeleccionado ? 'Respuestas del grupo' : 'Respuestas (vista actual)'}
              </Typography>
            </div>
            <div className="admin-enc-stat-kpi" style={{ flex: 1 }}>
              <div className="admin-enc-stat-kpi-num">{totalGeneral ?? totalRespuestas}</div>
              <Typography variant="caption" color="text.secondary">
                Total general
              </Typography>
            </div>
            <div className="admin-enc-stat-kpi" style={{ flex: 1 }}>
              <div className="admin-enc-stat-kpi-num">{(porGrupo || []).length}</div>
              <Typography variant="caption" color="text.secondary">
                Grupos con respuestas
              </Typography>
            </div>
          </Stack>
        </div>

        {(porGrupo || []).length > 0 && !grupoSeleccionado ? (
          <div className="admin-usu-table-card" style={{ marginBottom: '1rem' }}>
            <Box sx={{ p: 2.5 }}>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom sx={{ color: '#374151' }}>
                Participación por grupo
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Pulsa un grupo en el filtro de arriba para ver estadísticas solo de ese aula.
              </Typography>
              <DistribucionBarraSegmentada
                entries={(porGrupo || []).map((g) => [g.etiqueta, g.c])}
                total={totalGeneral || totalRespuestas}
              />
              <LeyendaFilas
                entries={(porGrupo || []).map((g) => [g.etiqueta, g.c])}
                total={totalGeneral || totalRespuestas}
              />
            </Box>
          </div>
        ) : null}

        <div className="admin-usu-table-card" style={{ marginBottom: '1rem' }}>
          <Box sx={{ p: 2.5 }}>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom sx={{ color: '#374151' }}>
              Participación por rol
              {grupoSeleccionado ? ` · ${grupoSeleccionado}` : ' · total'}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Distribución de quién envió cada respuesta (según rol en el momento de responder).
            </Typography>
            {(porRol || []).length === 0 ? (
              <Typography color="text.secondary">Sin datos aún.</Typography>
            ) : (
              <>
                <DistribucionBarraSegmentada
                  entries={(porRol || []).map((r) => [r.rol_respondiente, r.c])}
                  total={totalPorRol || totalRespuestas}
                />
                <LeyendaFilas
                  entries={(porRol || []).map((r) => [r.rol_respondiente, r.c])}
                  total={totalPorRol || totalRespuestas}
                />
              </>
            )}
          </Box>
        </div>

        {(resultadosPreguntas || []).map((rp) => {
          const datosObj = rp.datos || {};
          const m = rp.tipo_respuesta === 'marcar' || rp.tipo_respuesta === 'lista' ? maxVal(datosObj) : 1;

          return (
            <div className="admin-usu-table-card" key={rp.pregunta_id} style={{ marginBottom: '1rem' }}>
              <Box sx={{ p: 2.5 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2} sx={{ mb: 2 }}>
                  <Box>
                    <Typography variant="caption" color="primary" fontWeight={700}>
                      Pregunta {rp.orden}
                    </Typography>
                    <Box sx={{ mt: 0.25 }}>
                      <RichHtml html={rp.texto_pregunta} />
                    </Box>
                  </Box>
                  <Chip size="small" label={rp.tipo_respuesta} variant="outlined" />
                </Stack>

                {(rp.tipo_respuesta === 'marcar' || rp.tipo_respuesta === 'lista') && (
                  <Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      Frecuencia por opción (gráfico de barras)
                    </Typography>
                    <DistribucionBarraSegmentada entries={datosObj} total={Object.values(datosObj).reduce((a, b) => a + (Number(b) || 0), 0)} />
                    <Stack spacing={1.25} sx={{ mt: 2 }}>
                      {Object.entries(datosObj).map(([label, count], idx) => {
                        const pct = Math.round((Number(count) / m) * 100);
                        return (
                          <Box key={label}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                              <Box sx={{ pr: 1, flex: 1, minWidth: 0 }}>
                                <RichHtml html={label} />
                              </Box>
                              <Typography variant="body2" fontWeight={700}>
                                {count}
                              </Typography>
                            </Stack>
                            <Box sx={{ position: 'relative', height: 10, borderRadius: 1, bgcolor: 'grey.200', mt: 0.5 }}>
                              <Box
                                sx={{
                                  position: 'absolute',
                                  left: 0,
                                  top: 0,
                                  bottom: 0,
                                  width: `${pct}%`,
                                  borderRadius: 1,
                                  bgcolor: COLORS[idx % COLORS.length],
                                  transition: 'width 0.35s ease'
                                }}
                              />
                            </Box>
                          </Box>
                        );
                      })}
                    </Stack>
                  </Box>
                )}

                {rp.tipo_respuesta === 'escala' && datosObj?.distribucion && (
                  <Box>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Promedio: <strong>{datosObj.promedio ?? '—'}</strong> · n = {datosObj.total ?? 0}
                    </Typography>
                    <DistribucionBarraSegmentada entries={datosObj.distribucion} total={datosObj.total || 1} />
                    <Stack spacing={1} sx={{ mt: 2 }}>
                      {Object.entries(datosObj.distribucion).map(([val, count], idx) => {
                        const mm = maxVal(datosObj.distribucion);
                        const pct = Math.round((Number(count) / mm) * 100);
                        return (
                          <Box key={val}>
                            <Stack direction="row" justifyContent="space-between">
                              <Typography variant="body2">Valor {val}</Typography>
                              <Typography variant="body2" fontWeight={600}>
                                {count}
                              </Typography>
                            </Stack>
                            <Box sx={{ position: 'relative', height: 10, borderRadius: 1, bgcolor: 'grey.200', mt: 0.5 }}>
                              <Box
                                sx={{
                                  position: 'absolute',
                                  left: 0,
                                  top: 0,
                                  bottom: 0,
                                  width: `${pct}%`,
                                  borderRadius: 1,
                                  bgcolor: COLORS[idx % COLORS.length]
                                }}
                              />
                            </Box>
                          </Box>
                        );
                      })}
                    </Stack>
                  </Box>
                )}

                {(rp.tipo_respuesta === 'texto_corto' || rp.tipo_respuesta === 'texto_largo') && (
                  <Box>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1} sx={{ mb: 1.5 }}>
                      <Typography variant="body2" color="text.secondary">
                        {(datosObj.muestras || []).length} respuesta(s) de texto
                      </Typography>
                      <Button
                        variant="contained"
                        size="small"
                        sx={{ textTransform: 'none' }}
                        onClick={() =>
                          setModal({
                            open: true,
                            titulo: `Respuestas — ${stripHtmlPlain(rp.texto_pregunta) || 'pregunta'}`,
                            textos: datosObj.muestras || []
                          })
                        }
                      >
                        Ver todas en ventana
                      </Button>
                    </Stack>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                      Vista previa (máx. 5). Abre el modal para listado completo y buscador.
                    </Typography>
                    <Stack spacing={1}>
                      {(datosObj.muestras || []).slice(0, 5).map((t, i) => (
                        <div key={i} className="admin-enc-stat-texto-fila">
                          <Typography variant="body2" sx={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {t}
                          </Typography>
                        </div>
                      ))}
                    </Stack>
                  </Box>
                )}
              </Box>
            </div>
          );
        })}

        <ModalTextos
          open={modal.open}
          onClose={() => setModal((m) => ({ ...m, open: false }))}
          titulo={modal.titulo}
          textos={modal.textos}
        />
      </div>
    </DashboardLayout>
  );
}
