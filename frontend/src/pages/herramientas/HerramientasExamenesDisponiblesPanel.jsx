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
import { fmtPts } from './hexExamenesFormat';
import { hexExamenesUrls } from './hexExamenesPaths';

const MODO = { PRACTICA: 'Práctica', CALIFICADO: 'Calificatorio', MIXTO: 'Mixto' };
const DOCENTE_PASTELS = [
  { bg: '#eff6ff', border: '#bfdbfe' },
  { bg: '#ecfdf5', border: '#a7f3d0' },
  { bg: '#fffbeb', border: '#fde68a' },
  { bg: '#fdf2f8', border: '#fbcfe8' },
  { bg: '#f5f3ff', border: '#ddd6fe' },
  { bg: '#fff7ed', border: '#fed7aa' }
];

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
    return {
      label: `Nota: ${fmtPts(u.puntaje_obtenido)} / ${fmtPts(u.puntaje_max_snapshot)}`,
      color: 'success'
    };
  }
  return null;
}

/**
 * Listado de exámenes de herramientas disponibles para el usuario (mis-disponibles).
 * Sin DashboardLayout: para incrustar en la página admin de gestión o en MisHerramientasExamenes.
 */
export default function HerramientasExamenesDisponiblesPanel({
  compact = false,
  adminResponderTab = false,
  docenteContext = false
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const urls = hexExamenesUrls(
    adminResponderTab && compact ? 'admin' : docenteContext ? 'docente' : 'default'
  );
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
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))',
            gap: 1.5
          }}
        >
          {items.map((e, idx) => {
            const pastel = DOCENTE_PASTELS[idx % DOCENTE_PASTELS.length];
            return (
              <Card
                key={e.id}
                elevation={0}
                sx={{
                  borderRadius: 2.5,
                  border: '1px solid',
                  borderColor: pastel.border,
                  overflow: 'visible',
                  background: pastel.bg,
                  height: '100%'
                }}
              >
                <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1, height: '100%' }}>
                  <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
                    <AssignmentIcon color="primary" fontSize="small" />
                    <Typography fontWeight={700} sx={{ fontSize: '0.96rem' }}>
                      {e.titulo}
                    </Typography>
                  </Stack>
                  {e.descripcion ? (
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.84rem', lineHeight: 1.45 }}>
                      {e.descripcion}
                    </Typography>
                  ) : null}
                  <Stack direction="row" gap={0.5} flexWrap="wrap" useFlexGap>
                    <Chip size="small" label={MODO[e.modo] || e.modo} variant="outlined" color="secondary" />
                    {(e.audiencias || []).map((a) => (
                      <Chip key={a} size="small" label={a} variant="outlined" />
                    ))}
                  </Stack>
                  {(() => {
                    const ch = chipResultadoExamen(e);
                    return ch ? (
                      <Chip size="small" label={ch.label} color={ch.color} sx={{ width: 'fit-content', fontWeight: 700 }} />
                    ) : null;
                  })()}
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    Intentos: {e.intentos_usados ?? 0} / {e.intentos_max ?? 1}
                  </Typography>

                  <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ mt: 'auto' }}>
                    {e.ultimo_intento ? (
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => navigate(urls.resultado(e.id))}
                        sx={{ textTransform: 'none', fontWeight: 700 }}
                      >
                        Ver mis respuestas
                      </Button>
                    ) : <span />}
                    {!e.puede_intentar ? (
                      <Chip label="Sin intentos" color="default" />
                    ) : (
                      <Button
                        variant="contained"
                        onClick={() =>
                          navigate(
                            urls.realizar(
                              e.id,
                              adminResponderTab && compact ? { from: 'admin', responder: '1' } : {}
                            )
                          )
                        }
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
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}
    </div>
  );
}
