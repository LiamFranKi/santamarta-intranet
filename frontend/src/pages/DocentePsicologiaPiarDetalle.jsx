import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { Box, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import api from '../services/api';
import Swal from 'sweetalert2';
import PsicologiaSignaturePad from '../components/PsicologiaSignaturePad';
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
  const [nuevaNota, setNuevaNota] = useState('');
  const [saving, setSaving] = useState(false);

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

  const guardar = async () => {
    setSaving(true);
    try {
      await api.put(`/docente/psicologia/piar/${id}`, {
        estrategias_docentes: form.estrategias_docentes,
        frecuencia_aplicacion: form.frecuencia_aplicacion,
        avances_observados: form.avances_observados,
        firma_docente_imagen: form.firma_docente_imagen || null,
        firma_docente_fecha: form.firma_docente_imagen
          ? new Date().toISOString().slice(0, 19).replace('T', ' ')
          : null,
      });
      await Swal.fire({ icon: 'success', title: 'Guardado', timer: 1200, showConfirmButton: false });
      cargar();
    } catch (e) {
      Swal.fire({ icon: 'error', title: e.response?.data?.error || 'Error' });
    } finally {
      setSaving(false);
    }
  };

  const agregarNota = async () => {
    if (!String(nuevaNota || '').trim()) return;
    try {
      await api.post(`/docente/psicologia/piar/${id}/seguimiento`, { contenido: nuevaNota.trim() });
      setNuevaNota('');
      const { data } = await api.get(`/docente/psicologia/piar/${id}`);
      setSeguimiento(data.seguimiento || []);
    } catch (e) {
      Swal.fire({ icon: 'error', title: e.response?.data?.error || 'Error' });
    }
  };

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
        <div className="psi-doc-hero">
          <h1>PIAR · seguimiento en aula</h1>
          <p>
            <strong>{piar.alumno_nombre || 'Alumno'}</strong> — Año {piar.anio} · Versión {piar.numero_version} · {piar.estado}
          </p>
        </div>
        <button type="button" className="psi-doc-btn psi-doc-btn-secondary" style={{ marginBottom: 12 }} onClick={() => navigate('/docente/psicologia/piar')}>
          ← Volver al listado
        </button>
        <div className="psi-doc-alert" style={{ marginBottom: 16 }}>
          Los campos de diagnóstico y ajustes generales los completa el equipo de psicología en el expediente. Aquí solo actualice lo
          acordado para <strong>su práctica en aula</strong> y registre <strong>notas de seguimiento</strong> (también las verá
          psicología).
        </div>
        <TextField
          fullWidth
          multiline
          minRows={4}
          label="Estrategias y seguimiento en aula"
          margin="normal"
          value={form.estrategias_docentes}
          onChange={(e) => setForm((f) => ({ ...f, estrategias_docentes: e.target.value }))}
        />
        <TextField
          fullWidth
          multiline
          minRows={2}
          label="Frecuencia de aplicación / revisión"
          margin="normal"
          value={form.frecuencia_aplicacion}
          onChange={(e) => setForm((f) => ({ ...f, frecuencia_aplicacion: e.target.value }))}
        />
        <TextField
          fullWidth
          multiline
          minRows={3}
          label="Avances observados (síntesis en aula)"
          margin="normal"
          value={form.avances_observados}
          onChange={(e) => setForm((f) => ({ ...f, avances_observados: e.target.value }))}
        />
        <Typography variant="subtitle2" sx={{ mt: 2 }}>
          Firma docente (opcional)
        </Typography>
        <PsicologiaSignaturePad onChange={(dataUrl) => setForm((f) => ({ ...f, firma_docente_imagen: dataUrl }))} />
        <div className="psi-doc-btn-row">
          <button type="button" className="psi-doc-btn psi-doc-btn-primary" onClick={guardar} disabled={saving}>
            {saving ? <CircularProgress size={22} color="inherit" /> : 'Guardar cambios'}
          </button>
        </div>

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
        <TextField
          fullWidth
          multiline
          minRows={2}
          label="Nueva nota de seguimiento"
          value={nuevaNota}
          onChange={(e) => setNuevaNota(e.target.value)}
        />
        <button type="button" className="psi-doc-btn psi-doc-btn-secondary" style={{ marginTop: 8 }} onClick={agregarNota} disabled={!String(nuevaNota || '').trim()}>
          Registrar nota
        </button>
      </div>
    </DashboardLayout>
  );
}
