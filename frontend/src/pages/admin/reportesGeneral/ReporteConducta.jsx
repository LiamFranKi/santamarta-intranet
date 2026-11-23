import React, { useCallback, useState } from 'react';
import { MenuItem, TextField, CircularProgress } from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import api from '../../../services/api';
import Swal from 'sweetalert2';
import ReporteGeneralPanel from '../ReporteGeneralPanel';
import useReportesGeneralMeta, { aplicarDefaultsSedeAnio } from './useReportesGeneralMeta';
import ModalConducta from './ModalConducta';

const SECCIONES = ['', 'UNICA', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

function gradosParaNivel(nivel) {
  if (!nivel) return [];
  const gmin = Number(nivel.grado_minimo);
  const gmax = Number(nivel.grado_maximo);
  if (Number.isFinite(gmin) && Number.isFinite(gmax) && gmax >= gmin) {
    return Array.from({ length: gmax - gmin + 1 }, (_, i) => gmin + i);
  }
  const name = String(nivel.nombre || '').toLowerCase();
  if (name.includes('inicial')) return [3, 4, 5];
  if (name.includes('primaria')) return [1, 2, 3, 4, 5, 6];
  if (name.includes('secundaria')) return [1, 2, 3, 4, 5];
  return [1, 2, 3, 4, 5, 6];
}

function etiquetaGrado(nivel, grado) {
  const n = String(nivel?.nombre || '').toLowerCase();
  if (n.includes('inicial')) return `${grado} Años`;
  return `${grado}°`;
}

export default function ReporteConducta() {
  const [anio, setAnio] = useState('');
  const [nivelId, setNivelId] = useState('');
  const [grado, setGrado] = useState('');
  const [seccion, setSeccion] = useState('');
  const [q, setQ] = useState('');

  const onDefaults = useCallback((data) => {
    aplicarDefaultsSedeAnio(data, { setAnio });
  }, []);

  const { meta, loading } = useReportesGeneralMeta(onDefaults);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [reporte, setReporte] = useState(null);

  const nivelActual = (meta?.niveles || []).find((n) => String(n.id) === String(nivelId));
  const gradosOpciones = nivelActual ? gradosParaNivel(nivelActual) : [];

  const onNivelChange = (id) => {
    setNivelId(id);
    setGrado('');
    setSeccion('');
  };

  const verReporte = async () => {
    const anioN = parseInt(anio, 10) || parseInt(meta?.defaults?.anio, 10);
    if (!Number.isFinite(anioN)) {
      Swal.fire({ icon: 'warning', title: 'Filtros', text: 'Espere a que cargue el año o recargue la página.' });
      return;
    }
    const texto = q.trim();
    if (texto && texto.length < 2) {
      Swal.fire({ icon: 'warning', title: 'Alumno', text: 'Escriba al menos 2 letras del apellido o del nombre.' });
      return;
    }

    setModalOpen(true);
    setModalLoading(true);
    setReporte(null);
    try {
      const { data } = await api.get('/admin/reportes/general/conducta', {
        params: {
          anio: anioN,
          ...(nivelId ? { nivel_id: nivelId } : {}),
          ...(grado !== '' ? { grado } : {}),
          ...(seccion ? { seccion } : {}),
          ...(texto ? { q: texto } : {}),
        },
      });
      setReporte(data);
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
        icon="🧭"
        title="Conducta"
        description="Promedio final del 1.º, 2.º y 3.º bimestre, y cómo van ahora en el 4.º. Puede ver todo el colegio, un nivel, un salón o un alumno."
        compact
      >
        {loading ? (
          <div className="rg-alum-loading">
            <CircularProgress size={28} />
            <span>Cargando filtros…</span>
          </div>
        ) : (
          <div className="rg-filtros-toolbar rg-filtros-toolbar--fill">
            <TextField
              select
              size="small"
              label="Nivel"
              value={nivelId}
              onChange={(e) => onNivelChange(e.target.value)}
              className="rg-alum-field rg-alum-field--nivel"
            >
              <MenuItem value="">Todos</MenuItem>
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
              disabled={!nivelId}
            >
              <MenuItem value="">Todos</MenuItem>
              {gradosOpciones.map((g) => (
                <MenuItem key={g} value={String(g)}>
                  {etiquetaGrado(nivelActual, g)}
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
            >
              {SECCIONES.map((sec) => (
                <MenuItem key={sec || 'todas'} value={sec}>
                  {sec || 'Todas'}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              label="Alumno"
              placeholder="Apellido o nombre"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="rg-alum-field"
              onKeyDown={(e) => {
                if (e.key === 'Enter') verReporte();
              }}
            />
            <div className="rg-filtros-toolbar__actions">
              <button type="button" className="rg-alum-btn rg-alum-btn--primary" onClick={verReporte}>
                <VisibilityIcon fontSize="small" aria-hidden />
                Ver reporte
              </button>
            </div>
          </div>
        )}
      </ReporteGeneralPanel>

      <ModalConducta
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        loading={modalLoading}
        colegioNombre={meta?.colegio_nombre}
        reporte={reporte}
      />
    </>
  );
}
