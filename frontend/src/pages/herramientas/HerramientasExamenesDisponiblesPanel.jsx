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
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import './HerramientasExamenes.css';

const MODO = { PRACTICA: 'Práctica', CALIFICADO: 'Calificatorio', MIXTO: 'Mixto' };

function chipResultadoExamen(e) {
  const u = e.ultimo_intento;
  if (!u) return null;
  const mn = e.mostrar_nota || 'AL_ENVIAR';
  if (mn === 'NO') {
    return { label: 'Completado', color: 'default' };
  }
  if (u.estado === 'ENVIADO') {
    return { label: 'Pendiente de revisión', color: 'warning' };
  }
  if (u.estado === 'CALIFICADO' && u.puntaje_obtenido != null && u.puntaje_max_snapshot != null) {
    const a = Number(u.puntaje_obtenido);
    const b = Number(u.puntaje_max_snapshot);
    return {
      label: `Nota: ${a.toFixed(2)} / ${b.toFixed(2)}`,
      color: 'success'
    };
  }
  return null;
}

/**
 * Listado de exámenes de herramientas disponibles para el usuario (mis-disponibles).
 * Sin DashboardLayout: para incrustar en la página admin de gestión o en MisHerramientasExamenes.
 */
export default function HerramientasExamenesDisponiblesPanel({ compact = false }) {
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
    <div className={compact ? 'hex-exam-panel-embedded' : ''}>
      {compact ? (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 0.5 }}>
            Exámenes para responder
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Exámenes activos que puedes rendir según audiencia y alcance.
          </Typography>
        </Box>
      ) : (
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
      )}

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
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap" sx={{ mb: 0.5 }}>
                      <AssignmentIcon color="primary" />
                      <Typography fontWeight={800}>{e.titulo}</Typography>
                      {(() => {
                        const ch = chipResultadoExamen(e);
                        return ch ? (
                          <Chip size="small" label={ch.label} color={ch.color} sx={{ fontWeight: 700 }} />
                        ) : null;
                      })()}
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
  );
}
