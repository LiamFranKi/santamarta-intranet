import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { Box, Button, CircularProgress, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import api from '../services/api';

const LIMA_TZ = 'America/Lima';

function formatLimaLine(iso) {
  if (iso == null || iso === '') return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const fecha = d.toLocaleDateString('es-PE', {
    timeZone: LIMA_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const hora = d.toLocaleTimeString('es-PE', {
    timeZone: LIMA_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  return `${fecha} · ${hora}`;
}

export default function DocentePsicologiaMisDerivaciones() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api
      .get('/docente/psicologia/mis-derivaciones')
      .then(({ data }) => {
        setRows(data.derivaciones || []);
        setErr(null);
      })
      .catch((e) => setErr(e.response?.data?.error || 'No se pudo cargar'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <DashboardLayout>
      <Box sx={{ maxWidth: 960, mx: 'auto', p: 2 }}>
        <Typography variant="h5" fontWeight={800} gutterBottom>
          Mis derivaciones psicológicas
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Aquí aparecen las fichas que usted registró como docente referente. Para crear una nueva, use{' '}
          <strong>Grupos asignados</strong> → <strong>Opciones</strong> del alumno → <strong>Derivación psicológica</strong>.
        </Typography>
        <Button variant="outlined" sx={{ mb: 2 }} onClick={() => navigate('/docente/grupos')}>
          Ir a mis grupos
        </Button>
        {loading && (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        )}
        {err && (
          <Typography color="error" sx={{ mb: 2 }}>
            {err}
          </Typography>
        )}
        {!loading && !err && (
          <Paper variant="outlined" sx={{ overflow: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Fecha (Lima)</TableCell>
                  <TableCell>Alumno</TableCell>
                  <TableCell>Estado</TableCell>
                  <TableCell>Urgencia</TableCell>
                  <TableCell>Resumen</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell>{formatLimaLine(r.created_at)}</TableCell>
                    <TableCell>{r.alumno_nombre || `#${r.alumno_id}`}</TableCell>
                    <TableCell>{r.estado}</TableCell>
                    <TableCell>{r.urgencia}</TableCell>
                    <TableCell sx={{ maxWidth: 320 }}>
                      {(r.descripcion_caso || '').slice(0, 120)}
                      {(r.descripcion_caso || '').length > 120 ? '…' : ''}
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      Aún no tiene derivaciones registradas.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Paper>
        )}
      </Box>
    </DashboardLayout>
  );
}
