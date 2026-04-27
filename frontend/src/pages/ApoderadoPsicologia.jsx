import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Box, Card, CardContent, CircularProgress, Stack, Typography } from '@mui/material';
import DashboardLayout from '../components/DashboardLayout';
import ApoderadoPsicologaMensajeModal from '../components/ApoderadoPsicologaMensajeModal';
import api from '../services/api';
import './admin/AdminPsicologia.css';

function parseJson(v, fb) {
  if (v == null) return fb;
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(String(v));
  } catch {
    return fb;
  }
}

function inicialesNombre(nombreCompleto) {
  const p = String(nombreCompleto || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (p.length === 0) return '—';
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

export default function ApoderadoPsicologia() {
  const { alumnoId } = useParams();
  const navigate = useNavigate();
  const [hijos, setHijos] = useState([]);
  const [vista, setVista] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [psicologa, setPsicologa] = useState(null);
  const [modalMensajeAbierto, setModalMensajeAbierto] = useState(false);

  const loadHijos = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { data } = await api.get('/apoderado/psicologia/mis-hijos');
      setHijos(data.hijos || []);
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPsicologa = useCallback(async () => {
    try {
      const { data } = await api.get('/apoderado/psicologia/psicologa-contacto');
      setPsicologa(data.psicologa || null);
    } catch {
      setPsicologa(null);
    }
  }, []);

  const loadVista = useCallback(async (id) => {
    setLoading(true);
    setErr(null);
    try {
      const { data } = await api.get(`/apoderado/psicologia/alumnos/${id}/vista-familia`);
      setVista(data);
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (alumnoId) {
      loadVista(alumnoId);
    } else {
      setVista(null);
      loadHijos();
      loadPsicologa();
    }
  }, [alumnoId, loadHijos, loadVista, loadPsicologa]);

  const inner = () => {
    if (loading && !vista && !hijos.length && !err) {
      return (
        <Box display="flex" justifyContent="center" p={4}>
          <CircularProgress />
        </Box>
      );
    }
    if (err) {
      return <Alert severity="error">{err}</Alert>;
    }
    if (alumnoId && vista) {
      const piar = vista.piar_activo;
      const objs = parseJson(piar?.objetivos_json, []);
      const adj = parseJson(piar?.ajustes_checklist_json, {});
      return (
        <div className="psi-page">
          <button type="button" className="psi-exp-back" onClick={() => navigate('/apoderado/psicologia')}>
            ← Volver a mis hijos
          </button>
          <Typography variant="h5" sx={{ mt: 2, fontWeight: 800, color: '#1e293b' }}>
            {vista.alumno?.nombre || 'Estudiante'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Documentación compartida con la familia (actas cerradas y plan PIAR activo). No incluye notas clínicas de
            sesiones internas.
          </Typography>

          <Typography variant="h6" sx={{ mt: 2, mb: 1, fontWeight: 700 }}>
            Actas de reunión (cerradas)
          </Typography>
          {(vista.actas_cerradas || []).length === 0 && (
            <Typography color="text.secondary">No hay actas cerradas registradas.</Typography>
          )}
          <Stack spacing={1.5}>
            {(vista.actas_cerradas || []).map((a) => (
              <Card key={a.id} variant="outlined" sx={{ borderRadius: 2, borderColor: '#c7d2fe' }}>
                <CardContent>
                  <Typography variant="subtitle2" color="primary">
                    Acta #{a.id} · {a.fecha_reunion || 'Sin fecha'}
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    <strong>Participantes:</strong> {a.participantes || '—'}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Temas:</strong> {a.temas_tratados || '—'}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Acuerdos:</strong> {a.acuerdos || '—'}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Compromisos familia:</strong> {a.compromisos_familia || '—'}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Compromisos colegio:</strong> {a.compromisos_colegio || '—'}
                  </Typography>
                </CardContent>
              </Card>
            ))}
          </Stack>

          <Typography variant="h6" sx={{ mt: 3, mb: 1, fontWeight: 700 }}>
            PIAR activo
          </Typography>
          {!piar && <Typography color="text.secondary">No hay un PIAR activo publicado para este año.</Typography>}
          {piar && (
            <Card variant="outlined" sx={{ borderRadius: 2, borderColor: '#ddd6fe', bgcolor: '#faf5ff' }}>
              <CardContent>
                <Typography variant="subtitle2">
                  Año {piar.anio} · Versión {piar.numero_version}
                </Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  <strong>Fortalezas:</strong> {piar.fortalezas || '—'}
                </Typography>
                <Typography variant="body2">
                  <strong>Áreas de apoyo:</strong> {piar.areas_dificultad || '—'}
                </Typography>
                <Typography variant="body2">
                  <strong>Estilo de aprendizaje:</strong> {piar.estilo_aprendizaje || '—'}
                </Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  <strong>Objetivos:</strong>
                </Typography>
                <ul style={{ margin: '0.25rem 0 0 1.1rem' }}>
                  {Array.isArray(objs) &&
                    objs.map((o, i) => (
                      <li key={i}>
                        {o.objetivo || '—'} — <em>{o.indicador || '—'}</em>
                      </li>
                    ))}
                </ul>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  <strong>Ajustes (resumen):</strong>
                </Typography>
                <Typography variant="caption" component="div" color="text.secondary">
                  {Object.keys(adj).map((k) => (
                    <span key={k}>
                      {k}: {(Array.isArray(adj[k]) ? adj[k] : []).join(', ') || '—'};{' '}
                    </span>
                  ))}
                </Typography>
                {piar.fecha_revision && (
                  <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                    Próxima revisión: {piar.fecha_revision}
                  </Typography>
                )}
                {piar.avances_observados && (
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    <strong>Avances:</strong> {piar.avances_observados}
                  </Typography>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      );
    }

    return (
      <div className="psi-page">
        <div className="psi-hero" style={{ marginBottom: '1.25rem' }}>
          <h1>Psicología</h1>
          <p>
            Consulte actas de reuniones ya cerradas y el PIAR activo de cada hijo. Puede escribir a la psicóloga del
            colegio desde aquí; para otros temas use también <strong>Mensajes</strong>.
          </p>
        </div>

        <section className="psi-psicologa-contact-card" aria-label="Contacto psicología">
          <div className="psi-psicologa-contact-card__avatar" aria-hidden="true">
            {psicologa?.foto_url ? (
              <img src={psicologa.foto_url} alt={psicologa.nombre_completo || 'Psicóloga'} />
            ) : (
              <div className="psi-psicologa-contact-card__avatar-fallback">
                {psicologa ? inicialesNombre(psicologa.nombre_completo) : '🧠'}
              </div>
            )}
          </div>
          <div className="psi-psicologa-contact-card__text">
            {psicologa ? (
              <>
                <h2 className="psi-psicologa-contact-card__name">{psicologa.nombre_completo}</h2>
                <p className="psi-psicologa-contact-card__rol">Psicóloga</p>
                <p className="psi-psicologa-contact-card__hint">
                  Mensaje privado solo para ella: texto enriquecido, fotos en el mensaje y archivos adjuntos (igual que
                  en Mensajes).
                </p>
              </>
            ) : (
              <>
                <h2 className="psi-psicologa-contact-card__name">Psicología</h2>
                <p className="psi-psicologa-contact-card__rol">Contacto</p>
                <p className="psi-psicologa-contact-card__hint">
                  Aún no hay una cuenta de psicóloga activa en el colegio. Para consultas use el módulo{' '}
                  <strong>Mensajes</strong> o secretaría.
                </p>
              </>
            )}
          </div>
          <div className="psi-psicologa-contact-card__actions">
            <button
              type="button"
              className="psi-btn-mensaje-psicologa"
              disabled={!psicologa?.usuario_id}
              onClick={() => psicologa?.usuario_id && setModalMensajeAbierto(true)}
            >
              Enviar mensaje
            </button>
          </div>
        </section>

        <ApoderadoPsicologaMensajeModal
          open={modalMensajeAbierto}
          onClose={() => setModalMensajeAbierto(false)}
          psicologa={psicologa}
        />

        <div className="psi-grid">
          {hijos.map((h, i) => (
            <button
              key={h.alumno_id}
              type="button"
              className={`psi-alumno-card psi-alumno-card--familia psi-tone-${i % 6}`}
              onClick={() => navigate(`/apoderado/psicologia/${h.alumno_id}`)}
            >
              <h3>{h.nombre}</h3>
              <div className="sub">
                Actas cerradas: {h.actas_cerradas ?? 0} · PIAR activo:{' '}
                {Number(h.piar_activos) > 0 ? 'Sí' : 'No'}
              </div>
              <span className="psi-badge psi-badge-exp">Ver documentación →</span>
            </button>
          ))}
        </div>
        {!hijos.length && !loading && (
          <Typography align="center" color="text.secondary" sx={{ py: 4 }}>
            No hay estudiantes vinculados a su cuenta o aún no hay datos de psicología.
          </Typography>
        )}
      </div>
    );
  };

  return <DashboardLayout>{inner()}</DashboardLayout>;
}
