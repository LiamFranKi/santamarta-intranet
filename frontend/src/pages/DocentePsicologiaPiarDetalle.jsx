import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { Box, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import api from '../services/api';
import './DocentePsicologia.css';

const LIMA_TZ = 'America/Lima';

function formatLimaLine(iso) {
  if (iso == null || iso === '') return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const fecha = d.toLocaleDateString('es-PE', { timeZone: LIMA_TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
  const hora = d.toLocaleTimeString('es-PE', { timeZone: LIMA_TZ, hour: '2-digit', minute: '2-digit', hour12: true });
  return `${fecha} · ${hora}`;
}

export default function DocentePsicologiaPiarDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [piar, setPiar] = useState(null);
  const [seguimiento, setSeguimiento] = useState([]);
  const [form, setForm] = useState({
    estrategias_docentes: '',
    frecuencia_aplicacion: '',
    avances_observados: '',
    firma_docente_imagen: '',
  });

  const cargar = useCallback(() => {
    if (!id) return;
    setLoading(true);
    api
      .get(`/docente/psicologia/piar/${id}`)
      .then(({ data }) => {
        const p = data.piar;
        setPiar(p);
        setSeguimiento(data.seguimiento || []);
        setForm({
          estrategias_docentes: p.estrategias_docentes || '',
          frecuencia_aplicacion: p.frecuencia_aplicacion || '',
          avances_observados: p.avances_observados || '',
          firma_docente_imagen: p.firma_docente_imagen || '',
        });
        setErr(null);
      })
      .catch((e) => setErr(e.response?.data?.error || 'No se pudo cargar'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (loading && !piar) {
    return (
      <DashboardLayout>
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress />
        </Box>
      </DashboardLayout>
    );
  }

  if (err || !piar) {
    return (
      <DashboardLayout>
        <div className="psi-doc-page">
          <p className="psi-doc-muted" style={{ color: '#b91c1c' }}>
            {err || 'No encontrado'}
          </p>
          <button type="button" className="psi-doc-btn psi-doc-btn-secondary" onClick={() => navigate('/docente/psicologia/piar')}>
            Volver al listado
          </button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="psi-doc-page" style={{ maxWidth: 720 }}>
        <div className="psi-doc-hero" style={{ textAlign: 'center' }}>
          <h1>PIAR · seguimiento en aula</h1>
          <p style={{ margin: 0 }}>
            <strong>{piar.alumno_nombre || 'Alumno'}</strong> — Año {piar.anio} · Versión {piar.numero_version} · {piar.estado}
          </p>
          {piar.grupo_aula_etiqueta ? (
            <p className="psi-doc-grupo-sub" style={{ margin: '0.35rem 0 0' }}>
              {String(piar.grupo_aula_etiqueta).trim()}
            </p>
          ) : null}
        </div>
        <button type="button" className="psi-doc-btn psi-doc-btn-secondary" style={{ marginBottom: 12 }} onClick={() => navigate('/docente/psicologia/piar')}>
          ← Volver al listado
        </button>
        <div className="psi-doc-alert" style={{ marginBottom: 16 }}>
          Vista de <strong>solo lectura</strong>. Aquí puede consultar lo registrado por Psicología y el historial de seguimiento.
        </div>
        <TextField
          fullWidth
          multiline
          minRows={4}
          label="Estrategias y seguimiento en aula"
          margin="normal"
          value={form.estrategias_docentes}
          InputProps={{ readOnly: true }}
        />
        <TextField
          fullWidth
          multiline
          minRows={2}
          label="Frecuencia de aplicación / revisión"
          margin="normal"
          value={form.frecuencia_aplicacion}
          InputProps={{ readOnly: true }}
        />
        <TextField
          fullWidth
          multiline
          minRows={3}
          label="Avances observados (síntesis en aula)"
          margin="normal"
          value={form.avances_observados}
          InputProps={{ readOnly: true }}
        />

        <Typography variant="h6" sx={{ mt: 3, mb: 1, fontWeight: 800 }}>
          Bitácora de seguimiento
        </Typography>
        <Stack spacing={1} sx={{ mb: 2, maxHeight: 280, overflow: 'auto' }}>
          {seguimiento.map((s) => (
            <Box key={s.id} sx={{ p: 1.25, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0' }}>
              <Typography variant="caption" color="text.secondary">
                {s.autor_tipo === 'DOCENTE' ? 'Usted (docente)' : 'Psicología / admin'} · {formatLimaLine(s.created_at)}
              </Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 0.5 }}>
                {s.contenido}
              </Typography>
            </Box>
          ))}
          {!seguimiento.length && <Typography className="psi-doc-muted">Sin notas aún.</Typography>}
        </Stack>
      </div>
    </DashboardLayout>
  );
}
