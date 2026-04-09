import React, { useCallback, useEffect, useState } from 'react';
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
  TextField,
  Typography,
  Chip
} from '@mui/material';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import Swal from 'sweetalert2';
import '../../pages/admin/AdminUsuarios.css';
import './HerramientasExamenes.css';

export default function HerramientasExamenEstadisticas({ variant = 'admin' }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const esAdmin = variant === 'admin';
  const base = esAdmin ? '/admin/herramientas/examenes' : '/docente/herramientas/examenes';

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [dlg, setDlg] = useState(null);
  const [lineEdits, setLineEdits] = useState({});

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
      setDlg({ intento: d.intento, lineas: d.lineas || [] });
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || 'No se pudo abrir', 'error');
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
        <div className="admin-usu-toolbar" style={{ marginBottom: 16 }}>
          <button type="button" className="admin-usu-btn admin-usu-btn-secondary" onClick={() => navigate(base)}>
            ← Volver
          </button>
        </div>

        <div className="hex-exam-hero">
          <Typography variant="h5" fontWeight={800}>
            {data.examen?.titulo}
          </Typography>
          <Typography variant="body2" sx={{ mt: 1, opacity: 0.95 }}>
            Modo: {data.examen?.modo} · Intentos enviados: {data.totalIntentos} · Pendientes de revisión (texto):{' '}
            {data.pendientesRevision}
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
                  <th>Intento</th>
                  <th>Estado</th>
                  <th>Puntaje</th>
                  <th>Fecha</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(data.intentos || []).map((row) => (
                  <tr key={row.id}>
                    <td>{row.login_usuario || `#${row.usuario_id}`}</td>
                    <td>{row.rol_respondiente}</td>
                    <td>{row.numero_intento}</td>
                    <td>
                      {row.estado === 'CALIFICADO' ? (
                        <span className="admin-usu-badge admin-usu-badge-ok">Calificado</span>
                      ) : (
                        <span className="admin-usu-badge admin-usu-badge-muted">{row.estado}</span>
                      )}
                    </td>
                    <td>
                      {row.puntaje_obtenido != null ? `${row.puntaje_obtenido} / ${row.puntaje_max_snapshot ?? '—'}` : '—'}
                    </td>
                    <td>{row.fecha_envio ? String(row.fecha_envio).slice(0, 19) : '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="admin-usu-btn admin-usu-btn-primary"
                        style={{ fontSize: '0.8rem' }}
                        onClick={() => abrirRevision(row)}
                      >
                        Revisar
                      </button>
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
          {(dlg?.lineas || []).map((L) => {
            let rj = L.respuesta_json || {};
            if (typeof rj === 'string') {
              try {
                rj = JSON.parse(rj);
              } catch {
                rj = {};
              }
            }
            const tipo = String(L.pregunta_tipo || '').toUpperCase();
            let textoResp = '—';
            if (tipo === 'RESPUESTA_CORTA') textoResp = rj.texto || '—';
            else if (tipo === 'VERDADERO_FALSO') textoResp = rj.valor === true ? 'Verdadero' : rj.valor === false ? 'Falso' : '—';
            else textoResp = rj.indice != null ? `Opción índice ${rj.indice}` : '—';

            return (
              <Box key={L.id} sx={{ mb: 3 }}>
                <Typography fontWeight={700}>{L.pregunta_texto}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {tipo}
                </Typography>
                <Typography variant="body2" sx={{ mt: 1, mb: 1 }}>
                  Respuesta: <strong>{textoResp}</strong>
                </Typography>
                {L.requiere_revision ? (
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1 }}>
                    <TextField
                      size="small"
                      label="Puntos"
                      type="number"
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
                  <Chip size="small" label={`Puntos: ${L.puntos_otorgados ?? '—'}`} />
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
