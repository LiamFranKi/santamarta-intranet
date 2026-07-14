import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import { procesarHTMLMensaje } from '../../utils/mensajesHtml';
import { generarPdfHistorialEncuesta } from './encuestaReportesPdf';
import Swal from 'sweetalert2';
import './AdminUsuarios.css';
import './AdminEncuestas.css';

function RichHtml({ html }) {
  if (!html) return null;
  return <div className="admin-enc-rich" dangerouslySetInnerHTML={{ __html: procesarHTMLMensaje(html) }} />;
}

export default function AdminEncuestaHistorial() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [titulo, setTitulo] = useState('');
  const [filas, setFilas] = useState([]);
  const [porGrupo, setPorGrupo] = useState([]);
  const [grupoSel, setGrupoSel] = useState('');
  const [vista, setVista] = useState('grupos'); // grupos | lista
  const [q, setQ] = useState('');
  const [detalleOpen, setDetalleOpen] = useState(false);
  const [detalleLoading, setDetalleLoading] = useState(false);
  const [detalle, setDetalle] = useState(null);

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const { data } = await api.get(`/encuestas/admin/${id}/historial`);
        if (!c) {
          setTitulo(data.encuesta?.titulo || '');
          setFilas(data.filas || []);
          setPorGrupo(data.porGrupo || []);
        }
      } catch (e) {
        Swal.fire('Error', e.response?.data?.error || 'No se pudo cargar', 'error');
        navigate('/admin/herramientas/encuestas');
      } finally {
        if (!c) setLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [id, navigate]);

  const filasFiltradas = useMemo(() => {
    let rows = filas;
    if (grupoSel) {
      rows = rows.filter((f) => (f.grupo_etiqueta || 'Sin grupo') === grupoSel);
    }
    const s = q.trim().toLowerCase();
    if (s) {
      rows = rows.filter((f) => {
        const blob = `${f.nombre_mostrar || ''} ${f.usuario_login || ''} ${f.rol_respondiente || ''} ${f.grupo_etiqueta || ''}`.toLowerCase();
        return blob.includes(s);
      });
    }
    return rows;
  }, [filas, grupoSel, q]);

  const agrupadas = useMemo(() => {
    const map = new Map();
    for (const f of filasFiltradas) {
      const k = f.grupo_etiqueta || 'Sin grupo';
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(f);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'));
  }, [filasFiltradas]);

  const abrirDetalle = async (respuestaId) => {
    setDetalleOpen(true);
    setDetalleLoading(true);
    setDetalle(null);
    try {
      const { data } = await api.get(`/encuestas/admin/${id}/respuestas/${respuestaId}`);
      setDetalle(data);
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || 'No se pudo cargar', 'error');
      setDetalleOpen(false);
    } finally {
      setDetalleLoading(false);
    }
  };

  const fmtFecha = (d) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return String(d);
    }
  };

  const exportarPdf = () => {
    try {
      generarPdfHistorialEncuesta({
        encuesta: { titulo },
        filas: filasFiltradas,
        grupoSeleccionado: grupoSel || null
      });
    } catch (e) {
      Swal.fire('Error', e.message || 'No se pudo generar el PDF', 'error');
    }
  };

  const renderTabla = (rows) => (
    <div className="admin-usu-table-scroll">
      <table className="admin-usu-table">
        <thead>
          <tr>
            <th>Usuario</th>
            <th>Rol</th>
            <th>Fecha</th>
            <th>Grupo</th>
            <th style={{ minWidth: 120 }}>Acción</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((f) => (
            <tr key={f.respuesta_id}>
              <td>
                <div style={{ fontWeight: 600 }}>{f.nombre_mostrar || f.usuario_login}</div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{f.usuario_login}</div>
              </td>
              <td>{f.rol_respondiente}</td>
              <td>{fmtFecha(f.fecha_respuesta)}</td>
              <td>{f.grupo_etiqueta || '—'}</td>
              <td>
                <button
                  type="button"
                  className="admin-usu-btn admin-usu-btn-primary"
                  style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                  onClick={() => abrirDetalle(f.respuesta_id)}
                >
                  Ver detalle
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  if (loading) {
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
        <div className="admin-usu-toolbar" style={{ marginBottom: '1rem', flexWrap: 'wrap', gap: 8 }}>
          <button
            type="button"
            className="admin-usu-btn admin-usu-btn-secondary"
            onClick={() => navigate('/admin/herramientas/encuestas')}
          >
            ← Volver a la lista
          </button>
          <Button
            variant="contained"
            size="small"
            startIcon={<PictureAsPdfIcon />}
            onClick={exportarPdf}
            sx={{ textTransform: 'none', ml: 'auto', background: 'linear-gradient(135deg,#0d9488,#14b8a6)' }}
          >
            Exportar PDF
          </Button>
        </div>

        <div className="admin-enc-stat-hero" style={{ marginBottom: '1rem' }}>
          <Typography variant="h5" fontWeight={800} sx={{ color: '#1e3a5f' }}>
            Historial de respuestas
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {titulo}
          </Typography>
          <Typography variant="caption" display="block" sx={{ mt: 1 }}>
            Agrupado por grado/grupo. Usa el filtro para un aula, busca por nombre, o abre «Ver detalle» por respuesta.
          </Typography>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
            <FormControl size="small" sx={{ minWidth: 220, bgcolor: '#fff', borderRadius: 1 }}>
              <InputLabel id="hist-grupo">Grupo</InputLabel>
              <Select
                labelId="hist-grupo"
                label="Grupo"
                value={grupoSel}
                onChange={(e) => setGrupoSel(e.target.value)}
              >
                <MenuItem value="">Todos ({filas.length})</MenuItem>
                {(porGrupo.length ? porGrupo : agrupadas.map(([etiqueta, rows]) => ({ etiqueta, c: rows.length }))).map(
                  (g) => (
                    <MenuItem key={g.etiqueta} value={g.etiqueta}>
                      {g.etiqueta} ({g.c})
                    </MenuItem>
                  )
                )}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 160, bgcolor: '#fff', borderRadius: 1 }}>
              <InputLabel id="hist-vista">Vista</InputLabel>
              <Select
                labelId="hist-vista"
                label="Vista"
                value={vista}
                onChange={(e) => setVista(e.target.value)}
              >
                <MenuItem value="grupos">Por grupo</MenuItem>
                <MenuItem value="lista">Lista plana</MenuItem>
              </Select>
            </FormControl>
            <TextField
              size="small"
              placeholder="Buscar usuario…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              sx={{ minWidth: 200, bgcolor: '#fff', borderRadius: 1 }}
            />
            <Chip
              label={`${filasFiltradas.length} respuesta(s)`}
              color="primary"
              variant="outlined"
              sx={{ alignSelf: 'center' }}
            />
          </Stack>
        </div>

        {filasFiltradas.length === 0 ? (
          <div className="admin-usu-table-card">
            <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
              {filas.length === 0
                ? 'Nadie ha respondido aún esta encuesta.'
                : 'No hay respuestas con estos filtros.'}
            </div>
          </div>
        ) : vista === 'lista' ? (
          <div className="admin-usu-table-card">{renderTabla(filasFiltradas)}</div>
        ) : (
          <Stack spacing={1}>
            {agrupadas.map(([grupo, rows]) => (
              <Accordion
                key={grupo}
                defaultExpanded={agrupadas.length <= 4 || !!grupoSel}
                disableGutters
                elevation={0}
                className="admin-enc-pregunta-acc"
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />} className="admin-enc-pregunta-sum">
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%', pr: 1 }}>
                    <Typography fontWeight={800}>{grupo}</Typography>
                    <Chip size="small" label={`${rows.length}`} color="primary" />
                  </Stack>
                </AccordionSummary>
                <AccordionDetails sx={{ p: 0 }}>{renderTabla(rows)}</AccordionDetails>
              </Accordion>
            ))}
          </Stack>
        )}

        <Dialog open={detalleOpen} onClose={() => setDetalleOpen(false)} maxWidth="md" fullWidth scroll="paper">
          <DialogTitle>
            Respuesta individual
            {detalle?.respuesta?.nombre_mostrar ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {detalle.respuesta.nombre_mostrar} · {detalle.respuesta.rol_respondiente} ·{' '}
                {fmtFecha(detalle.respuesta.fecha_respuesta)}
              </Typography>
            ) : null}
          </DialogTitle>
          <DialogContent dividers>
            {detalleLoading ? (
              <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
                <CircularProgress size={32} />
              </Box>
            ) : detalle?.items?.length ? (
              <Stack spacing={2}>
                {detalle.items.map((it) => (
                  <Box
                    key={it.pregunta_id}
                    sx={{
                      p: 1.5,
                      borderRadius: 1,
                      bgcolor: 'action.hover',
                      borderLeft: '4px solid',
                      borderColor: 'primary.main'
                    }}
                  >
                    <Typography variant="caption" color="primary" fontWeight={700}>
                      Pregunta {it.orden}
                      {it.tipo_interfaz === 'titulo' ? ' (sección)' : ''}
                    </Typography>
                    <Box sx={{ mt: 0.5 }}>
                      <RichHtml html={it.texto_pregunta} />
                    </Box>
                    {it.subtitulo ? (
                      <Box sx={{ mt: 0.5, color: 'text.secondary' }}>
                        <RichHtml html={it.subtitulo} />
                      </Box>
                    ) : null}
                    {it.tipo_interfaz !== 'titulo' ? (
                      <Typography variant="body2" sx={{ mt: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        <strong>Respuesta:</strong>{' '}
                        {/<[a-z][\s\S]*>/i.test(String(it.respuesta_legible || '')) ? (
                          <span dangerouslySetInnerHTML={{ __html: procesarHTMLMensaje(it.respuesta_legible) }} />
                        ) : (
                          it.respuesta_legible || '—'
                        )}
                      </Typography>
                    ) : null}
                  </Box>
                ))}
              </Stack>
            ) : (
              <Typography color="text.secondary">Sin datos.</Typography>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDetalleOpen(false)}>Cerrar</Button>
          </DialogActions>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
