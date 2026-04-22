import React, { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  FormGroup,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import api from '../services/api';
import Swal from 'sweetalert2';
import PsicologiaSignaturePad from '../components/PsicologiaSignaturePad';

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

  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({
    motivos_sel: [],
    motivo_otro: '',
    descripcion_caso: '',
    estrategias_aula: '',
    urgencia: 'MEDIA',
    firma_docente_imagen: '',
  });

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
    setSending(true);
    try {
      await api.post(`/docente/psicologia/alumnos/${alumnoId}/derivaciones`, {
        matricula_id: matriculaId || null,
        motivos_json: form.motivos_sel,
        motivo_otro: form.motivo_otro,
        descripcion_caso: form.descripcion_caso,
        estrategias_aula: form.estrategias_aula,
        urgencia: form.urgencia,
        firma_docente_imagen: form.firma_docente_imagen || null,
        firma_docente_fecha: form.firma_docente_imagen
          ? new Date().toISOString().slice(0, 19).replace('T', ' ')
          : null,
      });
      await Swal.fire({ icon: 'success', title: 'Derivación enviada a psicología', timer: 1600, showConfirmButton: false });
      if (grupoId) navigate(`/docente/grupos`);
      else navigate('/docente/psicologia/derivaciones');
    } catch (e) {
      Swal.fire({ icon: 'error', title: e.response?.data?.error || 'Error' });
    } finally {
      setSending(false);
    }
  };

  return (
    <DashboardLayout>
      <Box sx={{ maxWidth: 720, mx: 'auto', p: 2 }}>
        <Typography variant="h5" fontWeight={800} gutterBottom>
          Derivación psicológica
        </Typography>
        <Alert severity="info" sx={{ mb: 2 }}>
          Esta ficha llegará al equipo de psicología / administración con su nombre como docente referente. Sea objetivo en la descripción
          del caso.
        </Alert>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Alumno ID: {alumnoId}
          {matriculaId ? ` · Matrícula: #${matriculaId}` : ''}
        </Typography>

        <FormGroup row sx={{ flexWrap: 'wrap', mb: 1 }}>
          {MOTIVOS_DER.map((m) => (
            <FormControlLabel
              key={m.key}
              control={<Checkbox checked={form.motivos_sel.includes(m.key)} onChange={() => toggleMotivo(m.key)} />}
              label={m.label}
            />
          ))}
        </FormGroup>
        <TextField
          fullWidth
          label="Otro motivo (texto)"
          margin="normal"
          value={form.motivo_otro}
          onChange={(e) => setForm((f) => ({ ...f, motivo_otro: e.target.value }))}
        />
        <TextField
          fullWidth
          multiline
          minRows={4}
          label="Descripción del caso *"
          margin="normal"
          value={form.descripcion_caso}
          onChange={(e) => setForm((f) => ({ ...f, descripcion_caso: e.target.value }))}
        />
        <TextField
          fullWidth
          multiline
          minRows={2}
          label="Estrategias aplicadas en aula"
          margin="normal"
          value={form.estrategias_aula}
          onChange={(e) => setForm((f) => ({ ...f, estrategias_aula: e.target.value }))}
        />
        <TextField
          select
          fullWidth
          label="Urgencia"
          margin="normal"
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
        <PsicologiaSignaturePad onChange={(dataUrl) => setForm((f) => ({ ...f, firma_docente_imagen: dataUrl }))} />

        <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
          <Button variant="outlined" onClick={() => navigate(grupoId ? '/docente/grupos' : '/docente/psicologia/derivaciones')}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={enviar} disabled={sending}>
            {sending ? <CircularProgress size={22} color="inherit" /> : 'Enviar derivación'}
          </Button>
        </Stack>
      </Box>
    </DashboardLayout>
  );
}
