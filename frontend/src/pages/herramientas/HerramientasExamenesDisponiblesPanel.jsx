import React, { useEffect, useState } from 'react';
import { Box, Button, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import QuizIcon from '@mui/icons-material/Quiz';
import SchoolIcon from '@mui/icons-material/School';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import './HerramientasExamenes.css';
import { fmtPts } from './hexExamenesFormat';
import { hexExamenesUrls } from './hexExamenesPaths';

const MODO = { PRACTICA: 'Práctica', CALIFICADO: 'Calificatorio', MIXTO: 'Mixto' };
const AUD_LABEL = {
  ALUMNO: 'Alumnos',
  APODERADO: 'Apoderados',
  DOCENTE: 'Docentes',
  PROMOTORIA: 'Promotoría',
  ADMINISTRADOR: 'Administradores',
  TODOS: 'Todos'
};

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
        <div className="hex-disp-grid">
          {items.map((e) => {
            const ch = chipResultadoExamen(e);
            const chipClass =
              ch?.color === 'success' ? 'hex-disp-chip-ok' : ch?.color === 'warning' ? 'hex-disp-chip-warn' : '';
            return (
              <article key={e.id} className="hex-disp-card">
                <div className="hex-disp-card-ribbon">
                  <div className="hex-disp-card-ribbon-left">
                    <span className="hex-disp-card-icon" aria-hidden>
                      <QuizIcon />
                    </span>
                    <span className="hex-disp-card-kicker">Examen institucional</span>
                  </div>
                  <span className="hex-disp-card-modo">{MODO[e.modo] || e.modo}</span>
                </div>
                <div className="hex-disp-card-body">
                  <h3 className="hex-disp-card-title">{e.titulo}</h3>
                  {e.descripcion ? <p className="hex-disp-card-desc">{e.descripcion}</p> : null}
                  <div className="hex-disp-kpis">
                    <div className="hex-disp-kpi">
                      <span>Intentos</span>
                      <strong>
                        {e.intentos_usados ?? 0} / {e.intentos_max ?? 1}
                      </strong>
                    </div>
                    {e.tiempo_minutos ? (
                      <div className="hex-disp-kpi">
                        <span>Duración</span>
                        <strong>{e.tiempo_minutos} min</strong>
                      </div>
                    ) : null}
                    {e.preguntas_max && Number(e.preguntas_max) > 1 ? (
                      <div className="hex-disp-kpi">
                        <span>Preguntas</span>
                        <strong>{e.preguntas_max}</strong>
                      </div>
                    ) : null}
                  </div>
                  <div className="hex-disp-chips">
                    {(e.audiencias || []).map((a) => (
                      <span key={a} className="hex-disp-chip">
                        {AUD_LABEL[a] || a}
                      </span>
                    ))}
                    {ch ? <span className={`hex-disp-chip ${chipClass}`}>{ch.label}</span> : null}
                  </div>
                  <div className="hex-disp-card-actions">
                    {e.ultimo_intento ? (
                      <Button
                        variant="outlined"
                        size="small"
                        className="hex-disp-btn-ghost"
                        onClick={() => navigate(urls.resultado(e.id))}
                      >
                        Ver mis respuestas
                      </Button>
                    ) : (
                      <span />
                    )}
                    {!e.puede_intentar ? (
                      <Chip size="small" label="Sin intentos" className="hex-disp-chip-mute" />
                    ) : (
                      <Button
                        variant="contained"
                        className="hex-disp-btn-go"
                        onClick={() =>
                          navigate(
                            urls.realizar(
                              e.id,
                              adminResponderTab && compact ? { from: 'admin', responder: '1' } : {}
                            )
                          )
                        }
                      >
                        {e.intentos_usados > 0 ? 'Nuevo intento' : 'Comenzar'}
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
