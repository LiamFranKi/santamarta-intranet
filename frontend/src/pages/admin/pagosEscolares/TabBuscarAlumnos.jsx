import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CircularProgress, InputAdornment, MenuItem, TextField } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import Swal from 'sweetalert2';
import api from '../../../services/api';
import { showListaPagosMatriculaSwal } from '../../../utils/adminAlumnoPagosSwal';
import PeTablaPaginacion from '../../../components/admin/PeTablaPaginacion';
import { usePaginacionTabla } from '../../../hooks/usePaginacionTabla';
import {
  SECCIONES_OPCIONES,
  etiquetaGradoOpcion,
  gradosParaNivel,
  sedeIdSanMartin,
} from './pagosEscolaresFilters';

export default function TabBuscarAlumnos() {
  const [meta, setMeta] = useState(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [sedeId, setSedeId] = useState('');
  const [nivelId, setNivelId] = useState('');
  const [grado, setGrado] = useState('');
  const [seccion, setSeccion] = useState('UNICA');
  const [turnoId, setTurnoId] = useState('');
  const [anio, setAnio] = useState('');
  const defaultsAppliedRef = useRef(false);

  const [buscando, setBuscando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [filtroTabla, setFiltroTabla] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingMeta(true);
        const { data } = await api.get('/admin/pagos/meta');
        if (!cancelled) setMeta(data);
      } catch (e) {
        if (!cancelled) {
          Swal.fire({
            icon: 'error',
            title: 'Error',
            text: e.response?.data?.error || 'No se pudieron cargar los filtros.',
          });
        }
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!meta || defaultsAppliedRef.current) return;
    defaultsAppliedRef.current = true;
    const d = meta.defaults || {};
    setAnio(String(d.anio ?? meta.anio_activo ?? new Date().getFullYear()));
    if (meta.sedes?.length) setSedeId(sedeIdSanMartin(meta.sedes));
    else if (d.sede_id != null) setSedeId(String(d.sede_id));
    if (d.turno_id != null) setTurnoId(String(d.turno_id));

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

  const nivelActual = (meta?.niveles || []).find((n) => String(n.id) === String(nivelId));
  const gradosOpciones = nivelActual ? gradosParaNivel(nivelActual) : [];

  const onNivelChange = (id) => {
    setNivelId(id);
    const n = (meta?.niveles || []).find((x) => String(x.id) === String(id));
    const gList = n ? gradosParaNivel(n) : [];
    setGrado(gList.length ? String(gList[0]) : '');
  };

  const buildParams = useCallback(() => {
    const anioN = parseInt(anio, 10);
    const turnoN = parseInt(turnoId, 10);
    const nivelN = parseInt(nivelId, 10);
    const gradoN = parseInt(grado, 10);
    const sedeN = sedeId !== '' ? parseInt(sedeId, 10) : undefined;
    return {
      anio: anioN,
      turno_id: turnoN,
      nivel_id: nivelN,
      grado: gradoN,
      seccion: String(seccion || '').trim(),
      ...(Number.isFinite(sedeN) ? { sede_id: sedeN } : {}),
    };
  }, [anio, turnoId, nivelId, grado, seccion, sedeId]);

  const buscar = async () => {
    const p = buildParams();
    if (
      !Number.isFinite(p.anio) ||
      !Number.isFinite(p.turno_id) ||
      !Number.isFinite(p.nivel_id) ||
      !Number.isFinite(p.grado) ||
      !p.seccion
    ) {
      Swal.fire({ icon: 'warning', title: 'Filtros', text: 'Complete año, nivel, grado, sección y turno.' });
      return;
    }

    setBuscando(true);
    try {
      const { data } = await api.get('/admin/pagos/buscar-alumnos', { params: p });
      setResultado(data);
      setFiltroTabla('');
    } catch (e) {
      setResultado(null);
      Swal.fire({
        icon: 'error',
        title: 'No se pudo buscar',
        text: e.response?.data?.error || e.message,
      });
    } finally {
      setBuscando(false);
    }
  };

  const filasFiltradas = useMemo(() => {
    const list = resultado?.alumnos || [];
    const q = filtroTabla.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (row) =>
        String(row.nombre || '').toLowerCase().includes(q) ||
        String(row.alumno_dni || '').toLowerCase().includes(q) ||
        String(row.costo_texto || '').toLowerCase().includes(q)
    );
  }, [resultado, filtroTabla]);

  const pag = usePaginacionTabla(filasFiltradas, [filtroTabla]);

  const verPagos = async (row) => {
    try {
      const { data } = await api.get(
        `/admin/usuarios/alumnos/${row.alumno_id}/matriculas/${row.matricula_id}/pagos`
      );
      const m = data.data;
      if (!m) {
        Swal.fire({ icon: 'info', title: 'Pagos', text: 'No hay datos para esta matrícula.' });
        return;
      }
      showListaPagosMatriculaSwal(row.nombre, m, { alumnoId: row.alumno_id });
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudo cargar pagos' });
    }
  };

  return (
    <div className="pe-tab-buscar">
      <div className="pe-card pe-card--filtros pe-card--pastel-mint">
        <h2 className="pe-card-title">Buscar alumnos</h2>
        {loadingMeta ? (
          <div className="pe-loading-inline">
            <CircularProgress size={24} />
            <span>Cargando filtros…</span>
          </div>
        ) : (
          <div className="pe-filtros-row">
            {(meta?.sedes || []).length > 0 && (
              <TextField
                select
                size="small"
                label="Sede"
                value={sedeId}
                onChange={(e) => setSedeId(e.target.value)}
                className="pe-field pe-field--sede"
                fullWidth
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
              className="pe-field"
              required
              fullWidth
            >
              {(meta?.niveles || []).map((n) => (
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
              className="pe-field"
              disabled={!nivelId || gradosOpciones.length === 0}
              required
              fullWidth
            >
              {gradosOpciones.map((g) => (
                <MenuItem key={g} value={String(g)}>
                  {etiquetaGradoOpcion(nivelActual, g)}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="Sección"
              value={seccion}
              onChange={(e) => setSeccion(e.target.value)}
              className="pe-field"
              required
              fullWidth
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
              className="pe-field"
              required
              fullWidth
            >
              {(meta?.turnos || []).map((t) => (
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
              className="pe-field pe-field--anio"
              inputProps={{ min: 2000, max: 2100 }}
              fullWidth
            />
            <button type="button" className="pe-btn pe-btn--primary pe-btn--icon" onClick={buscar} disabled={buscando}>
              <SearchIcon fontSize="small" />
              {buscando ? 'Buscando…' : 'Buscar'}
            </button>
          </div>
        )}
      </div>

      {resultado && (
        <div className="pe-card pe-card--tabla pe-card--pastel-sky">
          <div className="pe-tabla-toolbar">
            <div className="pe-tabla-info">
              <strong>{resultado.titulo || 'Resultados'}</strong>
              <span className="pe-tabla-count">{filasFiltradas.length} alumno(s)</span>
            </div>
            <TextField
              size="small"
              label="Filtrar en tabla"
              value={filtroTabla}
              onChange={(e) => setFiltroTabla(e.target.value)}
              className="pe-field pe-field--filtro"
              fullWidth
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
              }}
            />
          </div>

          <div className="pe-table-wrap">
            <table className="pe-table">
              <thead>
                <tr>
                  <th>Apellidos y nombres</th>
                  <th>Costo</th>
                  <th className="pe-th-accion" />
                </tr>
              </thead>
              <tbody>
                {filasFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="pe-empty">
                      No hay alumnos para mostrar.
                    </td>
                  </tr>
                ) : (
                  pag.paginated.map((row) => (
                    <tr key={row.matricula_id}>
                      <td>{row.nombre}</td>
                      <td className="pe-td-costo">{row.costo_texto}</td>
                      <td className="pe-td-accion">
                        <button
                          type="button"
                          className="pe-btn pe-btn--sm pe-btn--primary pe-btn--icon"
                          onClick={() => verPagos(row)}
                        >
                          <PaymentsOutlinedIcon fontSize="small" />
                          Ver pagos
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <PeTablaPaginacion
            page={pag.page}
            totalPages={pag.totalPages}
            total={pag.total}
            pageSize={pag.pageSize}
            onPageChange={pag.setPage}
            onPageSizeChange={pag.setPageSize}
          />
        </div>
      )}
    </div>
  );
}
