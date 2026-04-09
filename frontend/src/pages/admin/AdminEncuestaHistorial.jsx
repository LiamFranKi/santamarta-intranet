import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography
} from '@mui/material';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import Swal from 'sweetalert2';
import './AdminUsuarios.css';
import './AdminEncuestas.css';

export default function AdminEncuestaHistorial() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [titulo, setTitulo] = useState('');
  const [filas, setFilas] = useState([]);
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
      const x = new Date(d);
      return x.toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return String(d);
    }
  };

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
        <div className="admin-usu-toolbar" style={{ marginBottom: '1rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="admin-usu-btn admin-usu-btn-secondary"
            onClick={() => navigate('/admin/herramientas/encuestas')}
          >
            ← Volver a la lista
          </button>
        </div>

        <div className="admin-enc-stat-hero" style={{ marginBottom: '1rem' }}>
          <Typography variant="h5" fontWeight={800} sx={{ color: '#1e3a5f' }}>
            Historial de respuestas
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {titulo}
          </Typography>
          <Typography variant="caption" display="block" sx={{ mt: 1 }}>
            Cada fila es un usuario que envió sus respuestas. Pulsa «Ver detalle» para ver qué marcó en cada pregunta.
          </Typography>
        </div>

        <div className="admin-usu-table-card">
          {filas.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
              Nadie ha respondido aún esta encuesta.
            </div>
          ) : (
            <div className="admin-usu-table-scroll">
              <table className="admin-usu-table">
                <thead>
                  <tr>
                    <th>Usuario</th>
                    <th>Rol al responder</th>
                    <th>Fecha</th>
                    <th>Grado / nivel</th>
                    <th style={{ minWidth: 140 }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.respuesta_id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{f.nombre_mostrar || f.usuario_login}</div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{f.usuario_login}</div>
                      </td>
                      <td>{f.rol_respondiente}</td>
                      <td>{fmtFecha(f.fecha_respuesta)}</td>
                      <td>
                        {[f.grado_snapshot, f.nivel_snapshot].filter(Boolean).join(' · ') || '—'}
                      </td>
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
          )}
        </div>

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
                    <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 0.5 }}>
                      {it.texto_pregunta}
                    </Typography>
                    {it.subtitulo ? (
                      <Typography variant="caption" color="text.secondary" display="block">
                        {it.subtitulo}
                      </Typography>
                    ) : null}
                    {it.tipo_interfaz !== 'titulo' ? (
                      <Typography variant="body2" sx={{ mt: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        <strong>Respuesta:</strong> {it.respuesta_legible || '—'}
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
