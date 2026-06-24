import React, { useCallback, useState } from 'react';
import { MenuItem, TextField, CircularProgress } from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import api from '../../../services/api';
import Swal from 'sweetalert2';
import ReporteGeneralPanel from '../ReporteGeneralPanel';
import useReportesGeneralMeta, { aplicarDefaultsSedeAnio } from './useReportesGeneralMeta';
import ModalListaMaestrosPorAula from './ModalListaMaestrosPorAula';

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

export default function ReporteListaMaestrosPorAula() {
  const [sedeId, setSedeId] = useState('');
  const [nivelId, setNivelId] = useState('');
  const [grado, setGrado] = useState('');
  const [seccion, setSeccion] = useState('UNICA');
  const [turnoId, setTurnoId] = useState('');
  const [anio, setAnio] = useState('');

  const onDefaults = useCallback((data) => {
    aplicarDefaultsSedeAnio(data, { setSedeId, setAnio });
    if (data?.defaults?.turno_id != null) setTurnoId(String(data.defaults.turno_id));
    const nivs = data?.niveles || [];
    const inicial = nivs.find((n) => /inicial/i.test(String(n.nombre || '')));
    const nivelElegido = inicial || nivs[0];
    if (nivelElegido) {
      setNivelId(String(nivelElegido.id));
      const gList = gradosParaNivel(nivelElegido);
      setGrado(gList.length ? String(gList[0]) : '');
    }
    setSeccion('UNICA');
  }, []);

  const { meta, loading } = useReportesGeneralMeta(onDefaults);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalTitulo, setModalTitulo] = useState('');
  const [modalFilas, setModalFilas] = useState([]);
  const [modalTotal, setModalTotal] = useState(0);

  const nivelActual = (meta?.niveles || []).find((n) => String(n.id) === String(nivelId));
  const gradosOpciones = nivelActual ? gradosParaNivel(nivelActual) : [];

  const onNivelChange = (id) => {
    setNivelId(id);
    const n = (meta?.niveles || []).find((x) => String(x.id) === String(id));
    const gList = n ? gradosParaNivel(n) : [];
    setGrado(gList.length ? String(gList[0]) : '');
  };

  const verReporte = async () => {
    const anioN = parseInt(anio, 10);
    const nivelN = parseInt(nivelId, 10);
    const gradoN = parseInt(grado, 10);
    const turnoN = parseInt(turnoId, 10);
    const sedeN = sedeId !== '' ? parseInt(sedeId, 10) : undefined;

    if (!Number.isFinite(anioN) || !Number.isFinite(turnoN)) {
      Swal.fire({ icon: 'warning', title: 'Filtros', text: 'Indique año y turno válidos.' });
      return;
    }
    if (!Number.isFinite(nivelN) || !Number.isFinite(gradoN) || !String(seccion || '').trim()) {
      Swal.fire({ icon: 'warning', title: 'Filtros', text: 'Seleccione nivel, grado y sección.' });
      return;
    }

    setModalOpen(true);
    setModalLoading(true);
    setModalFilas([]);
    try {
      const { data } = await api.get('/admin/reportes/general/maestros-por-aula', {
        params: {
          anio: anioN,
          nivel_id: nivelN,
          grado: gradoN,
          seccion: String(seccion).trim(),
          turno_id: turnoN,
          ...(Number.isFinite(sedeN) ? { sede_id: sedeN } : {}),
        },
      });
      setModalTitulo(data.titulo || '');
      setModalFilas(data.filas || []);
      setModalTotal(data.total ?? (data.filas || []).length);
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

  return (
    <>
      <ReporteGeneralPanel
        tone={1}
        icon="👨‍🏫"
        title="Lista de Maestros por Aula"
        description="Docentes asignados por curso en el grupo seleccionado, incluyendo Tutoría y Co-Tutoría."
        compact
      >
        {loading ? (
          <div className="rg-alum-loading">
            <CircularProgress size={28} />
            <span>Cargando filtros…</span>
          </div>
        ) : (
          <div className="rg-filtros-toolbar rg-filtros-toolbar--single-line rg-filtros-toolbar--fill">
            {(meta?.sedes || []).length > 0 && (
              <TextField
                select
                size="small"
                label="Sede"
                value={sedeId}
                onChange={(e) => setSedeId(e.target.value)}
                className="rg-alum-field rg-alum-field--sede"
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
              label="Turno"
              value={turnoId}
              onChange={(e) => setTurnoId(e.target.value)}
              className="rg-alum-field rg-alum-field--turno"
              required
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
              className="rg-alum-field rg-alum-field--anio"
              inputProps={{ min: 2000, max: 2100 }}
              required
            />
            <div className="rg-filtros-toolbar__actions">
              <button type="button" className="rg-alum-btn rg-alum-btn--primary" onClick={verReporte}>
                <VisibilityIcon fontSize="small" aria-hidden />
                Ver Reporte
              </button>
            </div>
          </div>
        )}
      </ReporteGeneralPanel>

      <ModalListaMaestrosPorAula
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        loading={modalLoading}
        colegioNombre={meta?.colegio_nombre}
        titulo={modalTitulo}
        filas={modalFilas}
        total={modalTotal}
      />
    </>
  );
}
