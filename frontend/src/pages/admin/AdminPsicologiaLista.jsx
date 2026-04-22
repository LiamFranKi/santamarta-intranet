import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  CircularProgress,
  MenuItem,
  Stack,
  TextField,
  Typography,
  Alert,
} from '@mui/material';
import api from '../../services/api';
import './AdminPsicologia.css';

export default function AdminPsicologiaLista() {
  const navigate = useNavigate();
  const [meta, setMeta] = useState(null);
  const [loadMetaErr, setLoadMetaErr] = useState(null);
  const [sedeId, setSedeId] = useState('');
  const [nivelId, setNivelId] = useState('');
  const [grado, setGrado] = useState('');
  const [seccion, setSeccion] = useState('');
  const [turnoId, setTurnoId] = useState('');
  const [anio, setAnio] = useState('');
  const [matriculas, setMatriculas] = useState([]);
  const [loadingBuscar, setLoadingBuscar] = useState(false);
  const [buscarErr, setBuscarErr] = useState(null);
  const [sinGrupo, setSinGrupo] = useState(false);

  useEffect(() => {
    api
      .get('/admin/psicologia/meta')
      .then(({ data }) => {
        setMeta(data);
        setAnio(String(data.anio_activo || new Date().getFullYear()));
        if (data.sedes?.length === 1) setSedeId(String(data.sedes[0].id));
        setLoadMetaErr(null);
      })
      .catch((e) => {
        setLoadMetaErr(e.response?.data?.error || 'No se pudieron cargar sedes/niveles');
      });
  }, []);

  const buscar = useCallback(async () => {
    setBuscarErr(null);
    setSinGrupo(false);
    setMatriculas([]);
    setLoadingBuscar(true);
    try {
      const params = {
        anio,
        nivel_id: nivelId,
        grado,
        seccion: seccion.trim(),
        turno_id: turnoId,
      };
      if (sedeId !== '') params.sede_id = sedeId;
      const { data } = await api.get('/admin/psicologia/grupo', { params });
      if (!data.grupo?.id) {
        setSinGrupo(true);
        return;
      }
      setMatriculas(data.matriculas || []);
    } catch (e) {
      const msg = e.response?.data?.error || e.message;
      setBuscarErr(msg);
    } finally {
      setLoadingBuscar(false);
    }
  }, [anio, nivelId, grado, seccion, turnoId, sedeId]);

  if (loadMetaErr) {
    return (
      <div className="psi-page">
        <Alert severity="error">{loadMetaErr}</Alert>
      </div>
    );
  }

  if (!meta) {
    return (
      <Box className="psi-page" display="flex" justifyContent="center" p={4}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <div className="psi-page">
      <div className="psi-hero">
        <h1>Psicología</h1>
        <p>Busque por aula y abra el expediente de cada estudiante: atenciones, derivaciones, actas con familias y PIAR.</p>
      </div>

      <div className="psi-filter-card">
        <div className="psi-filter-title">Buscar alumnos por grupo</div>
        <Stack direction="row" flexWrap="wrap" gap={1.5} alignItems="center">
          {meta.sedes?.length > 0 && (
            <TextField
              select
              size="small"
              label="Sede"
              value={sedeId}
              onChange={(e) => setSedeId(e.target.value)}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="">(Todas)</MenuItem>
              {(meta.sedes || []).map((s) => (
                <MenuItem key={s.id} value={String(s.id)}>
                  {s.nombre}
                </MenuItem>
              ))}
            </TextField>
          )}
          <TextField
            select
            size="small"
            label="Nivel"
            value={nivelId}
            onChange={(e) => setNivelId(e.target.value)}
            sx={{ minWidth: 160 }}
            required
          >
            <MenuItem value="" disabled>
              Elija…
            </MenuItem>
            {(meta.niveles || []).map((n) => (
              <MenuItem key={n.id} value={String(n.id)}>
                {n.nombre}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            label="Grado"
            type="number"
            value={grado}
            onChange={(e) => setGrado(e.target.value)}
            sx={{ width: 100 }}
            required
          />
          <TextField
            size="small"
            label="Sección"
            value={seccion}
            onChange={(e) => setSeccion(e.target.value)}
            sx={{ width: 110 }}
            required
          />
          <TextField
            select
            size="small"
            label="Turno"
            value={turnoId}
            onChange={(e) => setTurnoId(e.target.value)}
            sx={{ minWidth: 140 }}
            required
          >
            <MenuItem value="" disabled>
              Elija…
            </MenuItem>
            {(meta.turnos || []).map((t) => (
              <MenuItem key={t.id} value={String(t.id)}>
                {t.nombre}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            label="Año"
            type="number"
            value={anio}
            onChange={(e) => setAnio(e.target.value)}
            sx={{ width: 100 }}
            required
          />
          <Button variant="contained" onClick={buscar} disabled={loadingBuscar} sx={{ height: 40 }}>
            {loadingBuscar ? <CircularProgress size={22} color="inherit" /> : 'Buscar'}
          </Button>
        </Stack>
      </div>

      {buscarErr && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {buscarErr}
        </Alert>
      )}
      {sinGrupo && (
        <Alert severity="info" sx={{ mb: 2 }}>
          No se encontró un grupo con esos datos. Verifique sede, nivel, grado, sección, turno y año.
        </Alert>
      )}

      <div className="psi-grid">
        {matriculas.map((m) => (
          <button
            key={m.matricula_id}
            type="button"
            className="psi-alumno-card"
            onClick={() =>
              navigate(`/admin/psicologia/alumno/${m.alumno_id}?matricula_id=${m.matricula_id}`)
            }
          >
            <h3>{m.nombre_completo}</h3>
            <div className="sub">Matrícula #{m.matricula_id}</div>
            <span className="psi-badge psi-badge-exp">Abrir expediente →</span>
          </button>
        ))}
      </div>

      {matriculas.length === 0 && !loadingBuscar && !sinGrupo && !buscarErr && (
        <Typography className="psi-muted" align="center" sx={{ py: 4 }}>
          Use los filtros y pulse Buscar para listar alumnos del aula.
        </Typography>
      )}
    </div>
  );
}
