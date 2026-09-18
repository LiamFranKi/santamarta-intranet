import React, { useEffect, useState } from 'react';
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
import AssignmentIcon from '@mui/icons-material/Assignment';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { labelAudienciaHex } from './herramientas/hexAudiencias';

const ENCUESTA_PASTELS = [
  { bg: '#eff6ff', border: '#bfdbfe' },
  { bg: '#ecfdf5', border: '#a7f3d0' },
  { bg: '#fffbeb', border: '#fde68a' },
  { bg: '#fdf2f8', border: '#fbcfe8' },
  { bg: '#f5f3ff', border: '#ddd6fe' },
  { bg: '#fff7ed', border: '#fed7aa' }
];

export default function MisEncuestas() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const { data } = await api.get('/encuestas/mis-disponibles');
        if (!c) setItems(data.encuestas || []);
      } catch {
        if (!c) setItems([]);
      } finally {
        if (!c) setLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, []);

  return (
    <DashboardLayout>
      <Box sx={{ maxWidth: 1180, mx: 'auto', px: 1, pb: 4 }}>
        <Box
          sx={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: 3,
            p: 3,
            color: '#fff',
            mb: 3,
            boxShadow: '0 8px 28px rgba(102, 126, 234, 0.35)'
          }}
        >
          <Typography variant="h5" fontWeight={700} gutterBottom>
            Mis encuestas
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.92 }}>
            Encuestas disponibles para tu perfil ({user?.tipo || 'usuario'}). No necesitas escribir tu nombre ni grado:
            queda registrado automáticamente con tu cuenta.
          </Typography>
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : items.length === 0 ? (
          <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
            No hay encuestas pendientes en este momento.
          </Typography>
        ) : (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))',
              gap: 1.5
            }}
          >
            {items.map((e, idx) => {
              const pastel = ENCUESTA_PASTELS[idx % ENCUESTA_PASTELS.length];
              return (
                <Card
                  key={e.id}
                  elevation={0}
                  sx={{
                    borderRadius: 2.5,
                    border: '1px solid',
                    borderColor: pastel.border,
                    background: pastel.bg,
                    height: '100%'
                  }}
                >
                  <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1, height: '100%' }}>
                    <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 0.25 }}>
                      <AssignmentIcon color="primary" fontSize="small" />
                      <Typography fontWeight={700} sx={{ fontSize: '0.96rem' }}>{e.titulo}</Typography>
                    </Stack>
                    {e.descripcion ? (
                      <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.84rem', lineHeight: 1.45 }}>
                        {e.descripcion}
                      </Typography>
                    ) : null}
                    <Stack direction="row" gap={0.5} flexWrap="wrap" useFlexGap>
                      {(e.audiencias || []).map((a) => (
                        <Chip key={a} size="small" label={labelAudienciaHex(a)} variant="outlined" />
                      ))}
                    </Stack>
                    <Box sx={{ mt: 'auto' }}>
                      {e.ya_respondio ? (
                        <Chip icon={<CheckCircleOutlineIcon />} color="success" label="Respondida" />
                      ) : (
                        <Button
                          variant="contained"
                          onClick={() => navigate(`/encuestas/responder/${e.id}`)}
                          sx={{
                            textTransform: 'none',
                            borderRadius: 2,
                            fontWeight: 700,
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                          }}
                        >
                          Responder
                        </Button>
                      )}
                    </Box>
                  </CardContent>
                </Card>
              );
            })}
          </Box>
        )}
      </Box>
    </DashboardLayout>
  );
}
