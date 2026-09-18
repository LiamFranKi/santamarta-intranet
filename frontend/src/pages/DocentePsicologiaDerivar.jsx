import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import {
  Box,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  FormGroup,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import api from '../services/api';
import Swal from 'sweetalert2';
import PsicologiaSignaturePad from '../components/PsicologiaSignaturePad';
import './DocentePsicologia.css';

const MOTIVOS_DER = [
  { key: 'conducta_disruptiva', label: 'Conducta disruptiva' },
  { key: 'dificultades_aprendizaje', label: 'Dificultades de aprendizaje' },
  { key: 'problemas_emocionales', label: 'Problemas emocionales' },
  { key: 'socializacion', label: 'Problemas de socialización' },
  { key: 'sospecha_nee', label: 'Sospecha de NEE' },
];

export default function DocentePsicologiaDerivar() {
  const { alumnoId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const matriculaId = searchParams.get('matricula_id');
  const grupoId = searchParams.get('grupo_id');
  const derivacionIdParam = searchParams.get('derivacion_id');
  const derivacionId = derivacionIdParam != null && derivacionIdParam !== '' ? parseInt(derivacionIdParam, 10) : null;

  const [sending, setSending] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [nombreAlumno, setNombreAlumno] = useState('');
  const [estadoDer, setEstadoDer] = useState(null);
  const [form, setForm] = useState({
    motivos_sel: [],
    motivo_otro: '',
    descripcion_caso: '',
    estrategias_aula: '',
    urgencia: 'MEDIA',
    firma_docente_imagen: '',
  });

  useEffect(() => {
    let cancel = false;
    if (!alumnoId) return undefined;
    setLoadingMeta(true);
    setEstadoDer(null);
    api
      .get(`/docente/psicologia/alumnos/${alumnoId}/cabecera`)
      .then(({ data }) => {
        if (!cancel) setNombreAlumno((data && data.nombre_completo) || '');
      })
      .catch(() => {
        if (!cancel) setNombreAlumno('');
      })
      .finally(() => {
        if (cancel) return;
        if (!Number.isFinite(derivacionId)) setLoadingMeta(false);
      });
    return () => {
      cancel = true;
    };
  }, [alumnoId, derivacionId]);

  useEffect(() => {
    if (!Number.isFinite(derivacionId) || !alumnoId) {
      return undefined;
    }
    let cancel = false;
    api
      .get(`/docente/psicologia/derivaciones/${derivacionId}`)
      .then(({ data }) => {
        if (cancel) return;
        const d = data.derivacion;
        if (!d) return;
        setEstadoDer(d.estado);
        const motivos = Array.isArray(d.motivos_json) ? d.motivos_json : [];
        setForm({
          motivos_sel: motivos,
          motivo_otro: d.motivo_otro || '',
          descripcion_caso: d.descripcion_caso || '',
          estrategias_aula: d.estrategias_aula || '',
          urgencia: d.urgencia || 'MEDIA',
          firma_docente_imagen: d.firma_docente_imagen || '',
        });
      })
      .catch(() => {
        if (!cancel) Swal.fire({ icon: 'error', title: 'No se pudo cargar la derivación' });
      })
      .finally(() => {
        if (!cancel) setLoadingMeta(false);
      });
    return () => {
      cancel = true;
    };
  }, [derivacionId, alumnoId]);

  const toggleMotivo = (key) => {
    setForm((f) => ({
      ...f,
      motivos_sel: f.motivos_sel.includes(key) ? f.motivos_sel.filter((k) => k !== key) : [...f.motivos_sel, key],
    }));
  };

  const enviar = async () => {
    if (!String(form.descripcion_caso || '').trim()) {
      Swal.fire({ icon: 'warning', title: 'Describa el caso' });
      return;
    }
    if (Number.isFinite(derivacionId) && estadoDer && String(estadoDer) !== 'RECIBIDA') {
      Swal.fire({ icon: 'info', title: 'Esta derivación ya no se puede editar desde aquí.' });
      return;
    }
    setSending(true);
    try {
      const base = {
        motivos_json: form.motivos_sel,
        motivo_otro: form.motivo_otro,
        descripcion_caso: form.descripcion_caso,
        estrategias_aula: form.estrategias_aula,
        urgencia: form.urgencia,
        firma_docente_imagen: form.firma_docente_imagen || null,
        firma_docente_fecha: form.firma_docente_imagen
          ? new Date().toISOString().slice(0, 19).replace('T', ' ')
          : null,
      };
      if (Number.isFinite(derivacionId)) {
        await api.put(`/docente/psicologia/derivaciones/${derivacionId}`, base);
        await Swal.fire({ icon: 'success', title: 'Cambios guardados', timer: 1400, showConfirmButton: false });
      } else {
        await api.post(`/docente/psicologia/alumnos/${alumnoId}/derivaciones`, {
          ...base,
          matricula_id: matriculaId || null,
        });
        await Swal.fire({ icon: 'success', title: 'Derivación enviada a psicología', timer: 1600, showConfirmButton: false });
      }
      if (grupoId) navigate('/docente/grupos');
      else navigate('/docente/psicologia?tab=derivaciones');
    } catch (e) {
      Swal.fire({ icon: 'error', title: e.response?.data?.error || 'Error' });
    } finally {
      setSending(false);
    }
  };

  const volver = () => {
    if (grupoId) navigate('/docente/grupos');
    else navigate('/docente/psicologia?tab=derivaciones');
  };

  const titulo = Number.isFinite(derivacionId) ? 'Editar derivación psicológica' : 'Derivación psicológica';
  const bloqueadoEdicion = Number.isFinite(derivacionId) && estadoDer && String(estadoDer) !== 'RECIBIDA';

  return (
    <DashboardLayout>
      <div className="psi-doc-page" style={{ maxWidth: 720 }}>
        <div className="psi-doc-hero">
          <h1>{titulo}</h1>
          <p>
            Esta ficha llegará al equipo de psicología / administración con su nombre como docente referente. Sea objetivo en la descripción
            del caso.
          </p>
        </div>

        {loadingMeta ? (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <div className="psi-doc-alumno-line">
              Alumno: {nombreAlumno || `—`}
              {matriculaId ? ` · Matrícula: #${matriculaId}` : ''}
            </div>
            {bloqueadoEdicion && (
              <div className="psi-doc-alert" style={{ color: '#92400e', borderColor: '#fcd34d', background: '#fffbeb' }}>
                Esta derivación ya no está en estado RECIBIDA; no puede editarla desde esta pantalla.
              </div>
            )}

            <FormGroup row sx={{ flexWrap: 'wrap', mb: 1 }}>
              {MOTIVOS_DER.map((m) => (
                <FormControlLabel
                  key={m.key}
                  control={
                    <Checkbox
                      disabled={bloqueadoEdicion}
                      checked={form.motivos_sel.includes(m.key)}
                      onChange={() => toggleMotivo(m.key)}
                    />
                  }
                  label={m.label}
                />
              ))}
            </FormGroup>
            <TextField
              fullWidth
              label="Otro motivo (texto)"
              margin="normal"
              disabled={bloqueadoEdicion}
              value={form.motivo_otro}
              onChange={(e) => setForm((f) => ({ ...f, motivo_otro: e.target.value }))}
            />
            <TextField
              fullWidth
              multiline
              minRows={4}
              label="Descripción del caso *"
              margin="normal"
              disabled={bloqueadoEdicion}
              value={form.descripcion_caso}
              onChange={(e) => setForm((f) => ({ ...f, descripcion_caso: e.target.value }))}
            />
            <TextField
              fullWidth
              multiline
              minRows={2}
              label="Estrategias aplicadas en aula"
              margin="normal"
              disabled={bloqueadoEdicion}
              value={form.estrategias_aula}
              onChange={(e) => setForm((f) => ({ ...f, estrategias_aula: e.target.value }))}
            />
            <TextField
              select
              fullWidth
              label="Urgencia"
              margin="normal"
              disabled={bloqueadoEdicion}
              value={form.urgencia}
              onChange={(e) => setForm((f) => ({ ...f, urgencia: e.target.value }))}
            >
              <MenuItem value="ALTA">Alta</MenuItem>
              <MenuItem value="MEDIA">Media</MenuItem>
              <MenuItem value="BAJA">Baja</MenuItem>
            </TextField>
            <Typography variant="subtitle2" sx={{ mt: 2 }}>
              Firma (opcional)
            </Typography>
            {!bloqueadoEdicion && (
              <PsicologiaSignaturePad onChange={(dataUrl) => setForm((f) => ({ ...f, firma_docente_imagen: dataUrl }))} />
            )}

            <div className="psi-doc-btn-row">
              <button type="button" className="psi-doc-btn psi-doc-btn-secondary" onClick={volver}>
                Cancelar
              </button>
              {!bloqueadoEdicion && (
                <button type="button" className="psi-doc-btn psi-doc-btn-primary" onClick={enviar} disabled={sending}>
                  {sending ? <CircularProgress size={22} color="inherit" /> : Number.isFinite(derivacionId) ? 'Guardar cambios' : 'Enviar derivación'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
