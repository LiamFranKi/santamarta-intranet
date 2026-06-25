import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MenuItem, TextField, CircularProgress } from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ListAltIcon from '@mui/icons-material/ListAlt';
import api from '../../../services/api';
import Swal from 'sweetalert2';
import ReporteGeneralPanel from '../ReporteGeneralPanel';
import ModalNominaAlumnos from './ModalNominaAlumnos';

const SECCIONES_OPCIONES = ['UNICA', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

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

function etiquetaGradoOpcion(nivel, grado) {
  const n = String(nivel?.nombre || '').toLowerCase();
  if (n.includes('inicial')) return `${grado} Años`;
  return `${grado}°`;
}

export default function ReporteNominasAlumnos() {
  const [meta, setMeta] = useState(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [nivelId, setNivelId] = useState('');
  const [grado, setGrado] = useState('');
  const [seccion, setSeccion] = useState('UNICA');
  const [anio, setAnio] = useState('');
  const [sedeId, setSedeId] = useState('');
  const [turnoId, setTurnoId] = useState('');
  const defaultsAppliedRef = useRef(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalModo, setModalModo] = useState('uno');
  const [modalTitulo, setModalTitulo] = useState('');
  const [modalFilas, setModalFilas] = useState([]);
  const [modalTotales, setModalTotales] = useState(null);
  const [modalBloques, setModalBloques] = useState([]);
  const [modalTotalesGenerales, setModalTotalesGenerales] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingMeta(true);
        const { data } = await api.get('/admin/reportes/general/alumnos-matriculados/meta');
        if (cancelled) return;
        setMeta(data);
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
    if (d.sede_id != null) setSedeId(String(d.sede_id));
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

  const buildParamsBase = useCallback(() => {
    const anioN = parseInt(anio, 10);
    const turnoN = parseInt(turnoId, 10);
    const sedeN = sedeId !== '' ? parseInt(sedeId, 10) : undefined;
    return {
      anio: anioN,
      turno_id: turnoN,
      ...(Number.isFinite(sedeN) ? { sede_id: sedeN } : {}),
    };
  }, [anio, turnoId, sedeId]);

  const validarFiltrosComunes = () => {
    const p = buildParamsBase();
    if (!Number.isFinite(p.anio) || !Number.isFinite(p.turno_id)) {
      Swal.fire({ icon: 'warning', title: 'Filtros', text: 'Indique año y turno válidos.' });
      return null;
    }
    return p;
  };

  const verUnGrupo = async () => {
    const base = validarFiltrosComunes();
    if (!base) return;
    const nivelN = parseInt(nivelId, 10);
    const gradoN = parseInt(grado, 10);
    if (!Number.isFinite(nivelN) || !Number.isFinite(gradoN) || !String(seccion || '').trim()) {
      Swal.fire({ icon: 'warning', title: 'Filtros', text: 'Seleccione nivel, grado y sección.' });
      return;
    }

    setModalModo('uno');
    setModalOpen(true);
    setModalLoading(true);
    setModalFilas([]);
    setModalBloques([]);
    try {
      const { data } = await api.get('/admin/reportes/general/alumnos-matriculados/lista', {
        params: {
          ...base,
          nivel_id: nivelN,
          grado: gradoN,
          seccion: String(seccion).trim(),
        },
      });
      setModalTitulo(data.titulo || '');
      setModalFilas(data.filas || []);
      setModalTotales(data.totales || { total: (data.filas || []).length });
    } catch (e) {
      setModalOpen(false);
      Swal.fire({
        icon: 'error',
        title: 'No se pudo cargar',
        text: e.response?.data?.error || e.message,
      });
    } finally {
      setModalLoading(false);
    }
  };

  const verTodos = async () => {
    const base = validarFiltrosComunes();
    if (!base) return;

    setModalModo('todos');
    setModalOpen(true);
    setModalLoading(true);
    setModalFilas([]);
    setModalBloques([]);
    try {
      const { data } = await api.get('/admin/reportes/general/alumnos-matriculados/lista-todos', {
        params: base,
      });
      setModalBloques(data.bloques || []);
      setModalTotalesGenerales(data.totales_generales || { total: 0 });
    } catch (e) {
      setModalOpen(false);
      Swal.fire({
        icon: 'error',
        title: 'No se pudo cargar',
        text: e.response?.data?.error || e.message,
      });
    } finally {
      setModalLoading(false);
    }
  };

  const aniosOpciones = meta?.anio_activo
    ? [meta.anio_activo, meta.anio_activo - 1, meta.anio_activo - 2].filter((y) => y > 2000)
    : [new Date().getFullYear()];

  return (
    <>
      <ReporteGeneralPanel
        tone={2}
        icon="📋"
        title="Nóminas de alumnos"
        description="Registro académico por grado con cuadros para anotaciones. Vista previa en modal y exportación a PDF."
        compact
      >
        {loadingMeta ? (
          <div className="rg-alum-loading">
            <CircularProgress size={28} />
            <span>Cargando filtros…</span>
          </div>
        ) : (
          <div className="rg-filtros-toolbar rg-filtros-toolbar--card-duo">
            <TextField
              select
              size="small"
              label="Nivel"
              value={nivelId}
              onChange={(e) => onNivelChange(e.target.value)}
              className="rg-alum-field rg-alum-field--nivel"
              required
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
              className="rg-alum-field rg-alum-field--grado"
              disabled={!nivelId || gradosOpciones.length === 0}
              required
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
              className="rg-alum-field rg-alum-field--sec"
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
              label="Año"
              value={anio}
              onChange={(e) => setAnio(e.target.value)}
              className="rg-alum-field rg-alum-field--anio"
            >
              {aniosOpciones.map((y) => (
                <MenuItem key={y} value={String(y)}>
                  {y}
                </MenuItem>
              ))}
            </TextField>
            <div className="rg-filtros-toolbar__actions">
              <button type="button" className="rg-alum-btn rg-alum-btn--primary" onClick={verUnGrupo}>
                <VisibilityIcon fontSize="small" aria-hidden />
                Ver reporte
              </button>
              <button type="button" className="rg-alum-btn rg-alum-btn--secondary" onClick={verTodos}>
                <ListAltIcon fontSize="small" aria-hidden />
                Todos
              </button>
            </div>
          </div>
        )}
      </ReporteGeneralPanel>

      <ModalNominaAlumnos
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        loading={modalLoading}
        modo={modalModo}
        colegioNombre={meta?.colegio_nombre}
        titulo={modalTitulo}
        filas={modalFilas}
        totales={modalTotales}
        bloques={modalBloques}
        totalesGenerales={modalTotalesGenerales}
        anio={anio}
      />
    </>
  );
}
