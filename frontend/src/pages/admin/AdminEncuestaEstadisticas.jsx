import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  Typography
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import Swal from 'sweetalert2';
import './AdminEncuestas.css';

export default function AdminEncuestaEstadisticas() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const { data: d } = await api.get(`/encuestas/admin/${id}/estadisticas`);
        if (!c) setData(d);
      } catch (e) {
        Swal.fire('Error', e.response?.data?.error || 'No se pudieron cargar', 'error');
        navigate('/admin/herramientas/encuestas');
      } finally {
        if (!c) setLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [id, navigate]);

  if (loading || !data) {
    return (
      <DashboardLayout>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      </DashboardLayout>
    );
  }

  const { encuesta, totalRespuestas, porRol, resultadosPreguntas } = data;
  const maxBar = (obj) => {
    const vals = Object.values(obj || {}).map((x) => Number(x) || 0);
    return Math.max(1, ...vals);
  };

  return (
    <DashboardLayout>
      <div className="admin-encuestas-wrap">
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/admin/herramientas/encuestas')}
          sx={{ mb: 2, textTransform: 'none' }}
        >
          Volver
        </Button>

        <div className="admin-encuestas-hero" style={{ marginBottom: 24 }}>
          <Typography variant="h5" fontWeight={700}>
            Estadísticas: {encuesta.titulo}
          </Typography>
          <Typography variant="body2" sx={{ mt: 1, opacity: 0.92 }}>
            Total de respuestas: <strong>{totalRespuestas}</strong>
            {encuesta.categoria_metrica ? (
              <>
                {' '}
                · Categoría: <strong>{encuesta.categoria_metrica}</strong>
              </>
            ) : null}
          </Typography>
        </div>

        <Card sx={{ mb: 2, borderRadius: 2 }}>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Por tipo de usuario (rol al responder)
            </Typography>
            <Stack direction="row" gap={1} flexWrap="wrap" useFlexGap>
              {(porRol || []).map((r) => (
                <Chip
                  key={r.rol_respondiente}
                  label={`${r.rol_respondiente}: ${r.c}`}
                  color="primary"
                  variant="outlined"
                />
              ))}
            </Stack>
          </CardContent>
        </Card>

        {(resultadosPreguntas || []).map((rp) => (
          <Card key={rp.pregunta_id} sx={{ mb: 2, borderRadius: 2 }}>
            <CardContent>
              <Typography fontWeight={700} gutterBottom>
                {rp.orden}. {rp.texto_pregunta}
              </Typography>
              <Chip size="small" label={rp.tipo_respuesta} sx={{ mb: 2 }} />

              {(rp.tipo_respuesta === 'marcar' || rp.tipo_respuesta === 'lista') && (
                <Stack spacing={1.5}>
                  {Object.entries(rp.datos || {}).map(([label, count]) => {
                    const m = maxBar(rp.datos);
                    const pct = Math.round((Number(count) / m) * 100);
                    return (
                      <Box key={label}>
                        <Stack direction="row" justifyContent="space-between">
                          <Typography variant="body2">{label}</Typography>
                          <Typography variant="body2" fontWeight={600}>
                            {count}
                          </Typography>
                        </Stack>
                        <div className="enc-stat-bar-wrap">
                          <div className="enc-stat-bar-fill" style={{ width: `${pct}%` }} />
                        </div>
                      </Box>
                    );
                  })}
                </Stack>
              )}

              {rp.tipo_respuesta === 'escala' && rp.datos?.distribucion && (
                <Box>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Promedio: {rp.datos.promedio ?? '—'} (n = {rp.datos.total ?? 0})
                  </Typography>
                  <Stack spacing={1}>
                    {Object.entries(rp.datos.distribucion).map(([val, count]) => {
                      const m = maxBar(rp.datos.distribucion);
                      const pct = Math.round((Number(count) / m) * 100);
                      return (
                        <Box key={val}>
                          <Stack direction="row" justifyContent="space-between">
                            <Typography variant="body2">Valor {val}</Typography>
                            <Typography variant="body2">{count}</Typography>
                          </Stack>
                          <div className="enc-stat-bar-wrap">
                            <div className="enc-stat-bar-fill" style={{ width: `${pct}%` }} />
                          </div>
                        </Box>
                      );
                    })}
                  </Stack>
                </Box>
              )}

              {(rp.tipo_respuesta === 'texto_corto' || rp.tipo_respuesta === 'texto_largo') && (
                <Stack spacing={1}>
                  {(rp.datos?.muestras || []).slice(0, 40).map((t, i) => (
                    <Typography
                      key={i}
                      variant="body2"
                      sx={{
                        p: 1.5,
                        borderRadius: 1,
                        bgcolor: 'action.hover',
                        borderLeft: '3px solid',
                        borderColor: 'primary.main'
                      }}
                    >
                      {t}
                    </Typography>
                  ))}
                  {(rp.datos?.muestras || []).length > 40 ? (
                    <Typography variant="caption" color="text.secondary">
                      Mostrando 40 de {(rp.datos?.muestras || []).length} respuestas.
                    </Typography>
                  ) : null}
                </Stack>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </DashboardLayout>
  );
}
