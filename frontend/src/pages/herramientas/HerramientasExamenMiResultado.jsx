import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import Swal from 'sweetalert2';
import HexExamenesRevisionLineas from './HexExamenesRevisionLineas';
import { fmtPts } from './hexExamenesFormat';
import './HerramientasExamenes.css';

export default function HerramientasExamenMiResultado() {
  const { examenId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: d } = await api.get(`/herramientas-examenes/mi-resultado/${examenId}`);
      setData(d);
    } catch (e) {
      Swal.fire('Error', e.response?.data?.error || 'No se pudo cargar el resultado', 'error');
      navigate('/herramientas-examenes');
    } finally {
      setLoading(false);
    }
  }, [examenId, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !data) {
    return (
      <DashboardLayout>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      </DashboardLayout>
    );
  }

  const { intento, lineas, examen } = data;
  const mn = examen?.mostrar_nota || 'AL_ENVIAR';
  const mostrarNota =
    mn !== 'NO' &&
    intento?.estado === 'CALIFICADO' &&
    intento?.puntaje_obtenido != null &&
    intento?.puntaje_max_snapshot != null;

  return (
    <DashboardLayout>
      <div className="hex-exam-wrap">
        <div className="admin-usu-toolbar" style={{ marginBottom: 16 }}>
          <button
            type="button"
            className="admin-usu-btn admin-usu-btn-secondary"
            onClick={() => navigate('/herramientas-examenes')}
          >
            ← Volver
          </button>
        </div>

        <div className="hex-exam-hero" style={{ marginBottom: 16 }}>
          <Typography variant="h5" fontWeight={800}>
            {examen?.titulo || 'Resultado'}
          </Typography>
          <Typography variant="body2" sx={{ mt: 1, opacity: 0.95 }}>
            Modo: {examen?.modo}
            {intento?.estado === 'ENVIADO' ? ' · Pendiente de revisión (preguntas de texto)' : ''}
          </Typography>
          {mostrarNota ? (
            <Typography variant="h6" sx={{ mt: 1.5 }} fontWeight={800} color="primary">
              Nota: {fmtPts(intento.puntaje_obtenido)} / {fmtPts(intento.puntaje_max_snapshot)}
            </Typography>
          ) : null}
          {mn === 'NO' ? (
            <Typography variant="body2" sx={{ mt: 1 }}>
              Resultado completado (nota oculta según configuración del examen).
            </Typography>
          ) : null}
        </div>

        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 2 }}>
          Detalle por pregunta
        </Typography>

        <HexExamenesRevisionLineas lineas={lineas || []} examen={examen || {}} adminMode={false} />

        <Stack direction="row" justifyContent="flex-end" sx={{ mt: 3 }}>
          <Button variant="contained" onClick={() => navigate('/herramientas-examenes')}>
            Volver a exámenes
          </Button>
        </Stack>
      </div>
    </DashboardLayout>
  );
}
