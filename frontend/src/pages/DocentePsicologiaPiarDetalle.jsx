import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Box, Button, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import Swal from 'sweetalert2';
import './DocentePsicologia.css';
import '../components/psicologia/PiarStudio.css';
import {
  apoyosComoLista,
  parseJsonPiar,
  PIAR_ESTADO_LABEL,
  PIAR_KPI_LABEL,
  PIAR_ESCALA_LABEL,
} from '../utils/piarEtiquetas';

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
  const [puedeEditar, setPuedeEditar] = useState(false);
  const [soloLecturaMotivo, setSoloLecturaMotivo] = useState(null);
  const [form, setForm] = useState({
    estrategias_docentes: '',
    frecuencia_aplicacion: '',
    avances_observados: '',
    firma_docente_imagen: '',
  });
  const [bitNueva, setBitNueva] = useState('');
  const [guardandoAula, setGuardandoAula] = useState(false);
  const [guardandoBit, setGuardandoBit] = useState(false);

  const descargarPdf = async () => {
    try {
      const res = await api.get(`/docente/psicologia/piar/${id}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `PIAR_${piar?.anio || ''}_v${piar?.numero_version || ''}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      Swal.fire({ icon: 'error', title: e.response?.data?.error || 'No se pudo descargar el PDF' });
    }
  };

  const cargar = useCallback(() => {
    if (!id) return;
    setLoading(true);
    api
      .get(`/docente/psicologia/piar/${id}`)
      .then(({ data }) => {
        const p = data.piar;
        setPiar(p);
        setSeguimiento(data.seguimiento || []);
        setPuedeEditar(data.puede_editar_aula === true);
        setSoloLecturaMotivo(data.solo_lectura_motivo || null);
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

  const guardarAula = async () => {
    if (!id || !puedeEditar) return;
    setGuardandoAula(true);
    try {
      await api.put(`/docente/psicologia/piar/${id}`, {
        estrategias_docentes: form.estrategias_docentes,
        frecuencia_aplicacion: form.frecuencia_aplicacion,
        avances_observados: form.avances_observados,
      });
      await Swal.fire({ icon: 'success', title: 'Cambios guardados', timer: 1400, showConfirmButton: false });
      cargar();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'No se pudo guardar', text: e.response?.data?.error || e.message });
    } finally {
      setGuardandoAula(false);
    }
  };

  const agregarBitacora = async () => {
    const t = String(bitNueva || '').trim();
    if (!id || !puedeEditar || !t) return;
    setGuardandoBit(true);
    try {
      await api.post(`/docente/psicologia/piar/${id}/seguimiento`, { contenido: t });
      setBitNueva('');
      await Swal.fire({ icon: 'success', title: 'Nota registrada', timer: 1200, showConfirmButton: false });
      cargar();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'No se pudo registrar', text: e.response?.data?.error || e.message });
    } finally {
      setGuardandoBit(false);
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

  const lecturaMsg =
    soloLecturaMotivo === 'archivado'
      ? 'Este PIAR está archivado: solo puede consultar el contenido.'
      : soloLecturaMotivo === 'otro_docente_responsable'
        ? 'Otro docente figura como responsable de este PIAR: solo puede consultar. Si debe ser usted, pida a Psicología que actualice el docente responsable.'
        : 'Solo puede consultar este formulario.';

  const objs = parseJsonPiar(piar.objetivos_json, []);
  const apoyos = apoyosComoLista(piar.ajustes_checklist_json);
  const kpi = parseJsonPiar(piar.evaluacion_kpi_json, {}) || {};

  return (
    <DashboardLayout>
      <div className="psi-doc-page" style={{ maxWidth: 860 }}>
        <div className="psi-doc-hero" style={{ textAlign: 'left' }}>
          <h1>PIAR · plan y aula</h1>
          <p style={{ margin: 0 }}>
            <strong>{piar.alumno_nombre || 'Alumno'}</strong> — Año {piar.anio} · Versión {piar.numero_version} ·{' '}
            {PIAR_ESTADO_LABEL[piar.estado] || piar.estado}
          </p>
          {piar.grupo_aula_etiqueta ? (
            <p className="psi-doc-grupo-sub" style={{ margin: '0.35rem 0 0', color: 'rgba(255,255,255,0.88)' }}>
              {String(piar.grupo_aula_etiqueta).trim()}
            </p>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <button type="button" className="psi-doc-btn psi-doc-btn-secondary" onClick={() => navigate('/docente/psicologia/piar')}>
            ← Volver al listado
          </button>
          <button type="button" className="psi-doc-btn psi-doc-btn-primary" onClick={descargarPdf}>
            Descargar PDF
          </button>
        </div>

        {puedeEditar ? (
          <Alert severity="success" sx={{ mb: 2 }}>
            Puede <strong>editar su parte del aula</strong> (estrategias, frecuencia, avances) y <strong>agregar notas en la bitácora</strong>.
          </Alert>
        ) : (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <strong>Solo lectura.</strong> {lecturaMsg}
          </Alert>
        )}

        <div className="piar-plan-block">
          <h3>Retrato del estudiante</h3>
          <p>
            <strong>Fortalezas:</strong> {piar.fortalezas || '—'}
          </p>
          <p>
            <strong>Áreas de apoyo:</strong> {piar.areas_dificultad || '—'}
          </p>
          <p>
            <strong>Estilo de aprendizaje:</strong> {piar.estilo_aprendizaje || '—'}
          </p>
          {piar.diagnostico ? (
            <p>
              <strong>Diagnóstico (si aplica):</strong> {piar.diagnostico}
            </p>
          ) : null}
        </div>

        <div className="piar-plan-block">
          <h3>Apoyos en aula</h3>
          {apoyos.length ? (
            <div className="piar-chip-row">
              {apoyos.map((a) => (
                <span key={`${a.cat}-${a.key}`} className="piar-chip" title={a.catLabel}>
                  {a.label}
                </span>
              ))}
            </div>
          ) : (
            <p>Psicología aún no marcó apoyos en este plan.</p>
          )}
        </div>

        <div className="piar-plan-block">
          <h3>Objetivos</h3>
          {Array.isArray(objs) && objs.some((o) => o && (o.objetivo || o.indicador)) ? (
            <ul>
              {objs.map((o, i) =>
                o && (o.objetivo || o.indicador) ? (
                  <li key={i}>
                    {o.objetivo || '—'}
                    {o.indicador ? <em> — {o.indicador}</em> : null}
                  </li>
                ) : null
              )}
            </ul>
          ) : (
            <p>Sin objetivos registrados.</p>
          )}
          <p style={{ marginTop: 8 }}>
            Seguimiento:{' '}
            {['participacion', 'comprension', 'autonomia']
              .filter((k) => kpi[k])
              .map((k) => PIAR_KPI_LABEL[k])
              .join(', ') || '—'}
            {' · '}
            Escala: {PIAR_ESCALA_LABEL[kpi.escala] || kpi.escala || '—'}
          </p>
        </div>

        <Box
          sx={{
            p: 2,
            mb: 2,
            borderRadius: 2,
            border: puedeEditar ? '2px solid #14b8a6' : '2px solid #cbd5e1',
            background: puedeEditar ? 'linear-gradient(180deg,#f0fdfa 0%,#ccfbf1 100%)' : '#f8fafc',
          }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 800, color: puedeEditar ? '#0f766e' : '#64748b', mb: 1 }}>
            Su parte — seguimiento en aula (docente)
          </Typography>
          <TextField
            fullWidth
            multiline
            minRows={4}
            label="Estrategias y seguimiento en aula"
            margin="dense"
            value={form.estrategias_docentes}
            onChange={(e) => setForm((f) => ({ ...f, estrategias_docentes: e.target.value }))}
            InputProps={{ readOnly: !puedeEditar }}
          />
          <TextField
            fullWidth
            multiline
            minRows={2}
            label="Frecuencia de aplicación / revisión"
            margin="dense"
            value={form.frecuencia_aplicacion}
            onChange={(e) => setForm((f) => ({ ...f, frecuencia_aplicacion: e.target.value }))}
            InputProps={{ readOnly: !puedeEditar }}
          />
          <TextField
            fullWidth
            multiline
            minRows={3}
            label="Avances observados (síntesis en aula)"
            margin="dense"
            value={form.avances_observados}
            onChange={(e) => setForm((f) => ({ ...f, avances_observados: e.target.value }))}
            InputProps={{ readOnly: !puedeEditar }}
          />
          {puedeEditar && (
            <Button variant="contained" sx={{ mt: 1.5 }} onClick={guardarAula} disabled={guardandoAula}>
              {guardandoAula ? 'Guardando…' : 'Guardar cambios del aula'}
            </Button>
          )}
        </Box>

        <Box
          sx={{
            p: 2,
            mb: 1,
            borderRadius: 2,
            border: '2px solid #a78bfa',
            background: 'linear-gradient(180deg,#faf5ff 0%,#ede9fe 100%)',
          }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#5b21b6', mb: 1 }}>
            Bitácora de seguimiento (Psicología + docente)
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
            Mismo historial que ve el equipo de Psicología. Las notas de docente aparecen con su etiqueta.
          </Typography>
          <Stack spacing={1} sx={{ mb: 1.5, maxHeight: 280, overflow: 'auto' }}>
            {seguimiento.map((s) => (
              <Box
                key={s.id}
                sx={{
                  p: 1.25,
                  borderRadius: 2,
                  border: s.autor_tipo === 'DOCENTE' ? '1px solid #5eead4' : '1px solid #c4b5fd',
                  bgcolor: s.autor_tipo === 'DOCENTE' ? 'rgba(204,251,241,0.6)' : 'rgba(237,233,254,0.7)',
                }}
              >
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
            label="Nueva nota en bitácora"
            value={bitNueva}
            onChange={(e) => setBitNueva(e.target.value)}
            disabled={!puedeEditar}
            placeholder={puedeEditar ? 'Escriba aquí y pulse Registrar…' : ''}
          />
          {puedeEditar && (
            <Button variant="outlined" sx={{ mt: 1 }} onClick={agregarBitacora} disabled={guardandoBit || !String(bitNueva || '').trim()}>
              {guardandoBit ? 'Registrando…' : 'Registrar nota'}
            </Button>
          )}
        </Box>
      </div>
    </DashboardLayout>
  );
}
