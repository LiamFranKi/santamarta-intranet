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
import SchoolIcon from '@mui/icons-material/School';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import './HerramientasExamenes.css';

const MODO = { PRACTICA: 'Práctica', CALIFICADO: 'Calificatorio', MIXTO: 'Mixto' };

export default function MisHerramientasExamenes() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const { data } = await api.get('/herramientas-examenes/mis-disponibles');
        if (!c) setItems(data.examenes || []);
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
      <div className="hex-exam-wrap">
        <div className="hex-exam-hero">
          <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1 }}>
            <SchoolIcon sx={{ fontSize: 32 }} />
            <Typography variant="h5" fontWeight={800}>
              Exámenes disponibles
            </Typography>
          </Stack>
          <Typography variant="body2" sx={{ opacity: 0.95 }}>
            Evaluaciones institucionales según tu perfil ({user?.tipo || 'usuario'}). Si tu aula o rol coincide con la
            audiencia y el alcance, verás el examen aquí.
          </Typography>
        </div>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : items.length === 0 ? (
          <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
            No hay exámenes disponibles en este momento.
          </Typography>
        ) : (
          <Stack spacing={2}>
            {items.map((e) => (
              <Card
                key={e.id}
                elevation={0}
                sx={{
                  borderRadius: 3,
                  border: '1px solid',
                  borderColor: 'divider',
                  overflow: 'visible',
                  background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)'
                }}
              >
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={2} flexWrap="wrap">
                    <Box>
                      <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 0.5 }}>
                        <AssignmentIcon color="primary" />
                        <Typography fontWeight={800}>{e.titulo}</Typography>
                      </Stack>
                      {e.descripcion ? (
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                          {e.descripcion}
                        </Typography>
                      ) : null}
                      <Stack direction="row" gap={0.5} flexWrap="wrap" useFlexGap>
                        <Chip size="small" label={MODO[e.modo] || e.modo} variant="outlined" color="secondary" />
                        {(e.audiencias || []).map((a) => (
                          <Chip key={a} size="small" label={a} variant="outlined" />
                        ))}
                      </Stack>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                        Intentos: {e.intentos_usados ?? 0} / {e.intentos_max ?? 1}
                      </Typography>
                    </Box>
                    <Box>
                      {!e.puede_intentar ? (
                        <Chip label="Sin intentos" color="default" />
                      ) : (
                        <Button
                          variant="contained"
                          onClick={() => navigate(`/herramientas-examenes/realizar/${e.id}`)}
                          sx={{
                            textTransform: 'none',
                            borderRadius: 2,
                            fontWeight: 700,
                            background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                            boxShadow: '0 8px 24px rgba(79, 70, 229, 0.35)'
                          }}
                        >
                          {e.intentos_usados > 0 ? 'Nuevo intento' : 'Comenzar'}
                        </Button>
                      )}
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
        )}
      </div>
    </DashboardLayout>
  );
}
