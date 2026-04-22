import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
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
import Swal from 'sweetalert2';
import { getStaticFileUrl } from '../../config/staticFiles';
import './AdminPsicologia.css';

/** Secciones habituales en el colegio (orden: UNICA primero). */
const SECCIONES_OPCIONES = ['UNICA', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

const LIMA_TZ = 'America/Lima';

function formatLimaSoloFecha(iso) {
  if (iso == null || iso === '') return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-PE', {
    timeZone: LIMA_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Lista de números de grado según el nivel (usa grado_minimo/grado_maximo del catálogo si existen). */
function gradosParaNivel(nivel) {
  if (!nivel) return [];
  const gminRaw = nivel.grado_minimo;
  const gmaxRaw = nivel.grado_maximo;
  const gmin = gminRaw !== undefined && gminRaw !== null && gminRaw !== '' ? Number(gminRaw) : NaN;
  const gmax = gmaxRaw !== undefined && gmaxRaw !== null && gmaxRaw !== '' ? Number(gmaxRaw) : NaN;
  if (Number.isFinite(gmin) && Number.isFinite(gmax) && gmax >= gmin) {
    return Array.from({ length: gmax - gmin + 1 }, (_, i) => gmin + i);
  }
  const name = String(nivel.nombre || '').toLowerCase();
  if (name.includes('inicial')) return [1, 2, 3, 4, 5];
  if (name.includes('primaria')) return [1, 2, 3, 4, 5, 6];
  if (name.includes('secundaria')) return [1, 2, 3, 4, 5];
  return [1, 2, 3, 4, 5, 6];
}

function fotoAlumnoUrl(archivo) {
  if (!archivo || !String(archivo).trim()) return null;
  return getStaticFileUrl(`Static/Image/Fotos/${String(archivo).trim()}`);
}

function inicialesNombre(nombreCompleto) {
  const p = String(nombreCompleto || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!p.length) return '?';
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

export default function AdminPsicologiaLista() {
  const navigate = useNavigate();
  const [meta, setMeta] = useState(null);
  const [loadMetaErr, setLoadMetaErr] = useState(null);
  const [sedeId, setSedeId] = useState('');
  const [nivelId, setNivelId] = useState('');
  const [grado, setGrado] = useState('');
  const [seccion, setSeccion] = useState('UNICA');
  const [turnoId, setTurnoId] = useState('');
  const [anio, setAnio] = useState('');
  const [matriculas, setMatriculas] = useState([]);
  const [ultimaBusqueda, setUltimaBusqueda] = useState('ninguna'); // 'grupo' | 'texto' | 'ninguna'
  const [filtroTarjetas, setFiltroTarjetas] = useState('');
  const [textoBuscarColegio, setTextoBuscarColegio] = useState('');
  const [loadingBuscar, setLoadingBuscar] = useState(false);
  const [loadingBuscarTexto, setLoadingBuscarTexto] = useState(false);
  const [buscarErr, setBuscarErr] = useState(null);
  const [sinGrupo, setSinGrupo] = useState(false);
  const defaultsAppliedRef = useRef(false);
  const [pendientes, setPendientes] = useState([]);
  const [loadingPendientes, setLoadingPendientes] = useState(true);
  const [pendientesErr, setPendientesErr] = useState(null);
  const [marcandoLeidaId, setMarcandoLeidaId] = useState(null);

  const cargarPendientes = useCallback(() => {
    setLoadingPendientes(true);
    setPendientesErr(null);
    api
      .get('/admin/psicologia/derivaciones/pendientes', { params: { limit: 100 } })
      .then(({ data }) => {
        setPendientes(data.derivaciones || []);
      })
      .catch((e) => setPendientesErr(e.response?.data?.error || 'No se pudieron cargar las derivaciones pendientes'))
      .finally(() => setLoadingPendientes(false));
  }, []);

  useEffect(() => {
    api
      .get('/admin/psicologia/meta')
      .then(({ data }) => {
        setMeta(data);
        setLoadMetaErr(null);
      })
      .catch((e) => {
        setLoadMetaErr(e.response?.data?.error || 'No se pudieron cargar sedes/niveles');
      });
  }, []);

  useEffect(() => {
    cargarPendientes();
  }, [cargarPendientes]);

  const marcarDerivacionLeida = async (id) => {
    setMarcandoLeidaId(id);
    try {
      await api.post(`/admin/psicologia/derivaciones/${id}/marcar-leida`);
      await Swal.fire({ icon: 'success', title: 'Marcada como vista', timer: 1200, showConfirmButton: false });
      cargarPendientes();
    } catch (e) {
      const msg = e.response?.data?.error || 'Error';
      await Swal.fire({
        icon: 'error',
        title: msg,
        html:
          msg.includes('Unknown column') || msg.includes('psicologia_leida')
            ? 'Ejecute en el servidor la migración <code>036_psicologia_derivacion_leida_piar_seguimiento_mysql.sql</code>.'
            : undefined,
      });
    } finally {
      setMarcandoLeidaId(null);
    }
  };

  /** Valores por defecto: sede San Martín, turno Mañana, nivel Inicial (si existe), primer grado del nivel, sección UNICA. */
  useEffect(() => {
    if (!meta || defaultsAppliedRef.current) return;
    defaultsAppliedRef.current = true;

    const anioAct = String(meta.anio_activo || new Date().getFullYear());
    setAnio(anioAct);

    const sedes = meta.sedes || [];
    const sedeSm = sedes.find((s) => /san\s*mart[ií]n/i.test(String(s.nombre || '')));
    if (sedeSm) setSedeId(String(sedeSm.id));
    else if (sedes.length === 1) setSedeId(String(sedes[0].id));
    else if (sedes.length) setSedeId(String(sedes[0].id));

    const turnos = meta.turnos || [];
    const turnoMan = turnos.find((t) => /mañana|manana/i.test(String(t.nombre || '')));
    if (turnoMan) setTurnoId(String(turnoMan.id));
    else if (turnos.length === 1) setTurnoId(String(turnos[0].id));
    else if (turnos.length) setTurnoId(String(turnos[0].id));

    const nivs = meta.niveles || [];
    const inicial = nivs.find((n) => /inicial/i.test(String(n.nombre || '')));
    const nivelElegido = inicial || nivs[0];
    if (nivelElegido) {
      setNivelId(String(nivelElegido.id));
      const gList = gradosParaNivel(nivelElegido);
      setGrado(gList.length ? String(gList[0]) : '');
    }

    setSeccion('UNICA');
  }, [meta]);

  const buscar = useCallback(async () => {
    setBuscarErr(null);
    setSinGrupo(false);
    setMatriculas([]);
    setUltimaBusqueda('ninguna');
    setFiltroTarjetas('');
    setLoadingBuscar(true);
    try {
      const params = {
        anio,
        nivel_id: nivelId,
        grado: String(grado),
        seccion: String(seccion || '').trim(),
        turno_id: turnoId,
      };
      if (sedeId !== '') params.sede_id = sedeId;
      const { data } = await api.get('/admin/psicologia/grupo', { params });
      if (!data.grupo?.id) {
        setSinGrupo(true);
        return;
      }
      setMatriculas(data.matriculas || []);
      setUltimaBusqueda('grupo');
    } catch (e) {
      const msg = e.response?.data?.error || e.message;
      setBuscarErr(msg);
    } finally {
      setLoadingBuscar(false);
    }
  }, [anio, nivelId, grado, seccion, turnoId, sedeId]);

  const buscarPorTextoColegio = useCallback(async () => {
    const q = String(textoBuscarColegio || '').trim();
    if (q.length < 2) {
      await Swal.fire({ icon: 'info', title: 'Escriba al menos 2 caracteres (apellido, nombre o DNI).' });
      return;
    }
    const anioN = parseInt(anio, 10);
    if (!Number.isFinite(anioN)) {
      await Swal.fire({ icon: 'warning', title: 'Indique un año escolar válido arriba.' });
      return;
    }
    setBuscarErr(null);
    setSinGrupo(false);
    setLoadingBuscarTexto(true);
    setFiltroTarjetas('');
    try {
      const { data } = await api.get('/admin/psicologia/alumnos-buscar', {
        params: { anio: anioN, q },
      });
      setMatriculas(data.matriculas || []);
      setUltimaBusqueda('texto');
    } catch (e) {
      const msg = e.response?.data?.error || e.message;
      setBuscarErr(msg);
      setMatriculas([]);
      setUltimaBusqueda('ninguna');
    } finally {
      setLoadingBuscarTexto(false);
    }
  }, [anio, textoBuscarColegio]);

  const tarjetasVisibles = useMemo(() => {
    const t = String(filtroTarjetas || '')
      .trim()
      .toLowerCase();
    if (!t) return matriculas;
    return matriculas.filter((m) => {
      const nombre = String(m.nombre_completo || '').toLowerCase();
      const doc = String(m.nro_documento || '').toLowerCase();
      const gr = String(m.grupo_etiqueta || '').toLowerCase();
      return nombre.includes(t) || doc.includes(t) || gr.includes(t);
    });
  }, [matriculas, filtroTarjetas]);

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

  const nivelActual = (meta.niveles || []).find((n) => String(n.id) === String(nivelId));
  const gradosOpciones = nivelActual ? gradosParaNivel(nivelActual) : [];

  const onNivelChange = (id) => {
    setNivelId(id);
    const n = (meta.niveles || []).find((x) => String(x.id) === String(id));
    const gList = n ? gradosParaNivel(n) : [];
    setGrado(gList.length ? String(gList[0]) : '');
  };

  return (
    <div className="psi-page">
      <div className="psi-hero">
        <h1>Psicología</h1>
        <p>Busque por aula y abra el expediente de cada estudiante: atenciones, derivaciones, actas con familias y PIAR.</p>
      </div>

      <div className="psi-pendientes-card">
        <div className="psi-pendientes-title">Derivaciones pendientes (RECIBIDA)</div>
        <p className="psi-pendientes-sub">
          Listado de derivaciones <strong>RECIBIDA</strong> que el equipo aún no ha marcado como vistas. Pulse{' '}
          <strong>Marcar vista</strong> cuando ya la revisó: dejará de aparecer aquí (sigue en el expediente del alumno). “Abrir” va al
          expediente sin quitarla del listado.
        </p>
        {pendientesErr && (
          <Alert severity="warning" sx={{ mb: 1 }}>
            {pendientesErr}
          </Alert>
        )}
        {loadingPendientes ? (
          <Box display="flex" justifyContent="center" py={2}>
            <CircularProgress size={28} />
          </Box>
        ) : pendientes.length === 0 ? (
          <p className="psi-muted" style={{ margin: 0 }}>
            No hay derivaciones pendientes en este momento.
          </p>
        ) : (
          <div className="psi-pendientes-table-wrap">
            <table className="psi-pendientes-table">
              <thead>
                <tr>
                  <th>Fecha (Lima)</th>
                  <th>Alumno</th>
                  <th>Docente</th>
                  <th>Urgencia</th>
                  <th>Resumen</th>
                  <th style={{ minWidth: 200 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pendientes.map((p) => (
                  <tr key={p.id}>
                    <td>{formatLimaSoloFecha(p.created_at)}</td>
                    <td>{p.alumno_nombre || '—'}</td>
                    <td>{p.docente_nombre || '—'}</td>
                    <td>{p.urgencia}</td>
                    <td className="psi-pend-resumen">
                      {(p.descripcion_caso || '').slice(0, 80)}
                      {(p.descripcion_caso || '').length > 80 ? '…' : ''}
                    </td>
                    <td>
                      <div className="psi-pend-actions">
                        <button
                          type="button"
                          className="psi-pend-btn-vista"
                          disabled={marcandoLeidaId === p.id}
                          onClick={() => marcarDerivacionLeida(p.id)}
                        >
                          {marcandoLeidaId === p.id ? '…' : 'Marcar vista'}
                        </button>
                        <button
                          type="button"
                          className="psi-pend-btn-abrir"
                          onClick={() =>
                            navigate(
                              `/admin/psicologia/alumno/${p.alumno_id}${p.matricula_id != null ? `?matricula_id=${p.matricula_id}` : ''}`
                            )
                          }
                        >
                          Abrir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
              sx={{ minWidth: 180 }}
            >
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
            onChange={(e) => onNivelChange(e.target.value)}
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
            select
            size="small"
            label="Grado"
            value={grado}
            onChange={(e) => setGrado(e.target.value)}
            sx={{ minWidth: 120 }}
            required
            disabled={!nivelId || gradosOpciones.length === 0}
          >
            {!nivelId ? (
              <MenuItem value="" disabled>
                Elija nivel…
              </MenuItem>
            ) : (
              gradosOpciones.map((g) => (
                <MenuItem key={g} value={String(g)}>
                  {g}°
                </MenuItem>
              ))
            )}
          </TextField>
          <TextField
            select
            size="small"
            label="Sección"
            value={seccion}
            onChange={(e) => setSeccion(e.target.value)}
            sx={{ minWidth: 110 }}
            required
          >
            {SECCIONES_OPCIONES.map((sec) => (
              <MenuItem key={sec} value={sec}>
                {sec}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Turno"
            value={turnoId}
            onChange={(e) => setTurnoId(e.target.value)}
            sx={{ minWidth: 140 }}
            required
          >
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
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, mb: 0.75, fontWeight: 600 }}>
          Buscar alumno por apellidos, nombres o DNI (todo el colegio, año indicado)
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
          <TextField
            fullWidth
            size="small"
            label="Apellidos, nombres o documento"
            placeholder="Ej. Lozano o 12345678"
            value={textoBuscarColegio}
            onChange={(e) => setTextoBuscarColegio(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') buscarPorTextoColegio();
            }}
          />
          <Button
            variant="outlined"
            onClick={buscarPorTextoColegio}
            disabled={loadingBuscarTexto}
            sx={{ height: 40, flexShrink: 0, minWidth: 200 }}
          >
            {loadingBuscarTexto ? <CircularProgress size={22} /> : 'Buscar en el colegio'}
          </Button>
        </Stack>
        {matriculas.length > 0 && (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, mb: 0.5, fontWeight: 600 }}>
              Filtrar la lista mostrada
            </Typography>
            <TextField
              fullWidth
              size="small"
              label="Filtrar tarjetas (opcional)"
              placeholder="Reduce la lista actual sin volver a consultar"
              value={filtroTarjetas}
              onChange={(e) => setFiltroTarjetas(e.target.value)}
            />
          </>
        )}
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
        {tarjetasVisibles.map((m, idx) => {
          const fotoUrl = fotoAlumnoUrl(m.foto_alumno);
          return (
            <button
              key={`${m.matricula_id}-${m.alumno_id}`}
              type="button"
              className={`psi-alumno-card psi-tone-${idx % 6}`}
              onClick={() =>
                navigate(`/admin/psicologia/alumno/${m.alumno_id}?matricula_id=${m.matricula_id}`)
              }
            >
              <div className="psi-alumno-card-body">
                <h3>{m.nombre_completo}</h3>
                {m.nro_documento ? <div className="sub">DNI / doc.: {m.nro_documento}</div> : null}
                {m.grupo_etiqueta ? <div className="sub psi-alumno-grupo">{m.grupo_etiqueta}</div> : null}
                <div className="sub">Matrícula #{m.matricula_id}</div>
                <span className="psi-badge psi-badge-exp">Abrir expediente →</span>
              </div>
              <div className="psi-alumno-card-foto" aria-hidden>
                <div className="psi-alumno-card-foto-fallback">{inicialesNombre(m.nombre_completo)}</div>
                {fotoUrl ? (
                  <img
                    className="psi-alumno-card-foto-img"
                    src={fotoUrl}
                    alt=""
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.style.visibility = 'hidden';
                    }}
                  />
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      {matriculas.length > 0 && tarjetasVisibles.length === 0 && !loadingBuscar && !loadingBuscarTexto && (
        <Typography className="psi-muted" align="center" sx={{ py: 3 }}>
          Ningún alumno coincide con el filtro de tarjetas. Borre el texto del filtro o ajuste la búsqueda.
        </Typography>
      )}

      {matriculas.length === 0 && ultimaBusqueda === 'grupo' && !loadingBuscar && !sinGrupo && !buscarErr && (
        <Typography className="psi-muted" align="center" sx={{ py: 3 }}>
          El aula no tiene alumnos matriculados activos en ese año.
        </Typography>
      )}

      {matriculas.length === 0 && ultimaBusqueda === 'texto' && !loadingBuscarTexto && !buscarErr && (
        <Typography className="psi-muted" align="center" sx={{ py: 4 }}>
          No se encontraron alumnos con ese criterio en el año escolar indicado.
        </Typography>
      )}

      {matriculas.length === 0 && !loadingBuscar && !loadingBuscarTexto && !sinGrupo && !buscarErr && ultimaBusqueda === 'ninguna' && (
        <Typography className="psi-muted" align="center" sx={{ py: 4 }}>
          Use <strong>Buscar</strong> por aula o <strong>Buscar en el colegio</strong> por nombre o documento.
        </Typography>
      )}
    </div>
  );
}
