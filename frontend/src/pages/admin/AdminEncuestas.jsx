import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Paper
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import BarChartIcon from '@mui/icons-material/BarChart';
import EditIcon from '@mui/icons-material/Edit';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import Swal from 'sweetalert2';
import './AdminEncuestas.css';

export default function AdminEncuestas() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [encuestas, setEncuestas] = useState([]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const { data } = await api.get('/encuestas/admin/lista');
        if (!cancel) setEncuestas(data.encuestas || []);
      } catch (e) {
        if (!cancel) {
          Swal.fire('Error', e.response?.data?.error || 'No se pudo cargar la lista', 'error');
          setEncuestas([]);
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const fmt = (d) => (d ? String(d).slice(0, 10) : '—');

  return (
    <DashboardLayout>
      <div className="admin-encuestas-wrap">
        <div className="admin-encuestas-hero">
          <Typography variant="h1" component="h1" sx={{ fontSize: '1.65rem', fontWeight: 700, mb: 1 }}>
            Encuestas
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.92, maxWidth: 560 }}>
            Crea encuestas con varias audiencias, tipos de pregunta (marcar, lista, texto, escala) y revisa
            estadísticas por rol. Las respuestas se registran con el usuario de la intranet — sin pedir nombre ni
            grado en el formulario.
          </Typography>
        </div>

        <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate('/admin/herramientas/encuestas/nueva')}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              px: 2.5,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              boxShadow: '0 4px 14px rgba(102, 126, 234, 0.45)'
            }}
          >
            Nueva encuesta
          </Button>
        </Stack>

        <Card className="admin-enc-card" elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
          <CardContent sx={{ p: 0 }}>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                <CircularProgress />
              </Box>
            ) : encuestas.length === 0 ? (
              <Box sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>
                No hay encuestas aún. Pulsa «Nueva encuesta» para comenzar.
              </Box>
            ) : (
              <TableContainer component={Paper} elevation={0}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'action.hover' }}>
                      <TableCell>Título</TableCell>
                      <TableCell>Estado</TableCell>
                      <TableCell>Vigencia</TableCell>
                      <TableCell>Audiencias</TableCell>
                      <TableCell align="right">Respuestas</TableCell>
                      <TableCell align="right">Acciones</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {encuestas.map((e) => (
                      <TableRow key={e.id} hover>
                        <TableCell>
                          <Typography fontWeight={600}>{e.titulo}</Typography>
                          {e.categoria_metrica ? (
                            <Typography variant="caption" color="text.secondary">
                              {e.categoria_metrica}
                            </Typography>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={e.estado === 'ACTIVO' ? 'Activa' : e.estado}
                            color={e.estado === 'ACTIVO' ? 'success' : 'default'}
                          />
                        </TableCell>
                        <TableCell>
                          {fmt(e.fecha_inicio)} → {fmt(e.fecha_fin)}
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" gap={0.5} flexWrap="wrap" useFlexGap>
                            {(e.audiencias || []).map((a) => (
                              <Chip key={a} size="small" variant="outlined" label={a} />
                            ))}
                          </Stack>
                        </TableCell>
                        <TableCell align="right">{e.total_respuestas ?? 0}</TableCell>
                        <TableCell align="right">
                          <Button
                            size="small"
                            startIcon={<BarChartIcon />}
                            onClick={() => navigate(`/admin/herramientas/encuestas/${e.id}/estadisticas`)}
                            sx={{ textTransform: 'none', mr: 1 }}
                          >
                            Stats
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<EditIcon />}
                            onClick={() => navigate(`/admin/herramientas/encuestas/${e.id}/editar`)}
                            sx={{ textTransform: 'none' }}
                          >
                            Editar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
