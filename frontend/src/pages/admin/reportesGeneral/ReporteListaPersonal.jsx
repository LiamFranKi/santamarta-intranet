import React, { useCallback, useState } from 'react';
import { CircularProgress, MenuItem, TextField } from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import api from '../../../services/api';
import Swal from 'sweetalert2';
import ReporteGeneralPanel from '../ReporteGeneralPanel';
import useReportesGeneralMeta, { aplicarDefaultsSedeAnio } from './useReportesGeneralMeta';
import ModalListaPersonal from './ModalListaPersonal';

const ORDEN_CAMPOS = [
  { value: 'NOMBRES', label: 'NOMBRES' },
  { value: 'APELLIDOS', label: 'APELLIDOS' },
  { value: 'PERFIL', label: 'PERFIL' },
];

const ORDEN_DIR = [
  { value: 'ASC', label: 'ASCENDENTE' },
  { value: 'DESC', label: 'DESCENDENTE' },
];

export default function ReporteListaPersonal() {
  const [sedeId, setSedeId] = useState('');
  const [turnoId, setTurnoId] = useState('');
  const [anio, setAnio] = useState('');
  const [ordenCampo, setOrdenCampo] = useState('NOMBRES');
  const [ordenDir, setOrdenDir] = useState('ASC');

  const onDefaults = useCallback((data) => {
    aplicarDefaultsSedeAnio(data, { setSedeId, setAnio, setTurnoId });
  }, []);

  const { meta, loading } = useReportesGeneralMeta(onDefaults);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalTitulo, setModalTitulo] = useState('');
  const [modalSubtitulo, setModalSubtitulo] = useState('');
  const [modalFilas, setModalFilas] = useState([]);
  const [modalTotal, setModalTotal] = useState(0);

  const verReporte = async () => {
    const d = meta?.defaults || {};
    const anioN = parseInt(anio, 10) || parseInt(d.anio, 10);
    const turnoN = parseInt(turnoId, 10) || parseInt(d.turno_id, 10);
    const sedeRaw = sedeId !== '' ? sedeId : d.sede_id;
    const sedeN = sedeRaw != null && sedeRaw !== '' ? parseInt(sedeRaw, 10) : undefined;

    if (!Number.isFinite(anioN) || !Number.isFinite(turnoN)) {
      Swal.fire({ icon: 'warning', title: 'Filtros', text: 'Espere a que carguen los filtros o recargue la página.' });
      return;
    }

    setModalOpen(true);
    setModalLoading(true);
    setModalFilas([]);
    try {
      const { data } = await api.get('/admin/reportes/general/lista-personal', {
        params: {
          anio: anioN,
          turno_id: turnoN,
          orden_campo: ordenCampo,
          orden_dir: ordenDir,
          ...(Number.isFinite(sedeN) ? { sede_id: sedeN } : {}),
        },
      });
      setModalTitulo(data.titulo || 'Personal Administrativo');
      setModalSubtitulo(data.subtitulo || '');
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
        tone={2}
        icon="👥"
        title="Lista de Personal"
        description="Personal del colegio: cargo, contacto y datos básicos."
        compact
      >
        {loading ? (
          <div className="rg-alum-loading">
            <CircularProgress size={24} />
          </div>
        ) : (
          <div className="rg-filtros-toolbar rg-filtros-toolbar--fill rg-filtros-toolbar--card-duo">
            <TextField
              select
              size="small"
              label="Ordenar por"
              value={ordenCampo}
              onChange={(e) => setOrdenCampo(e.target.value)}
              className="rg-alum-field rg-alum-field--orden-campo"
            >
              {ORDEN_CAMPOS.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="Orden"
              value={ordenDir}
              onChange={(e) => setOrdenDir(e.target.value)}
              className="rg-alum-field rg-alum-field--orden-dir"
            >
              {ORDEN_DIR.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </TextField>
            <div className="rg-filtros-toolbar__actions">
              <button type="button" className="rg-alum-btn rg-alum-btn--primary" onClick={verReporte}>
                <VisibilityIcon fontSize="small" aria-hidden />
                Ver Reporte
              </button>
            </div>
          </div>
        )}
      </ReporteGeneralPanel>

      <ModalListaPersonal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        loading={modalLoading}
        colegioNombre={meta?.colegio_nombre}
        titulo={modalTitulo}
        subtitulo={modalSubtitulo}
        filas={modalFilas}
        total={modalTotal}
      />
    </>
  );
}
