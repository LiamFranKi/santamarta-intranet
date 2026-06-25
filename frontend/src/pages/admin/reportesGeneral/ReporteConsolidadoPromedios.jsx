import React, { useCallback, useState } from 'react';
import { MenuItem, TextField, CircularProgress } from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import api from '../../../services/api';
import Swal from 'sweetalert2';
import ReporteGeneralPanel from '../ReporteGeneralPanel';
import useReportesGeneralMeta, { aplicarDefaultsSedeAnio } from './useReportesGeneralMeta';
import ModalConsolidadoPromedios from './ModalConsolidadoPromedios';

const BIMESTRES = [
  { value: 1, label: 'BIMESTRE 1' },
  { value: 2, label: 'BIMESTRE 2' },
  { value: 3, label: 'BIMESTRE 3' },
  { value: 4, label: 'BIMESTRE 4' },
];

export default function ReporteConsolidadoPromedios() {
  const [anio, setAnio] = useState('');
  const [bimestre, setBimestre] = useState('1');
  const [sedeId, setSedeId] = useState('');
  const [turnoId, setTurnoId] = useState('');

  const onDefaults = useCallback((data) => {
    aplicarDefaultsSedeAnio(data, { setSedeId, setAnio, setTurnoId });
    setBimestre('1');
  }, []);

  const { meta, loading } = useReportesGeneralMeta(onDefaults);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalData, setModalData] = useState(null);

  const verReporte = async () => {
    const anioN = parseInt(anio, 10);
    const bimN = parseInt(bimestre, 10);
    if (!Number.isFinite(anioN)) {
      Swal.fire({ icon: 'warning', title: 'Año requerido', text: 'Indique un año válido.' });
      return;
    }
    if (!Number.isFinite(bimN) || bimN < 1 || bimN > 4) {
      Swal.fire({ icon: 'warning', title: 'Bimestre', text: 'Seleccione un bimestre válido.' });
      return;
    }

    setModalOpen(true);
    setModalLoading(true);
    setModalData(null);
    try {
      const params = { anio: anioN, bimestre: bimN };
      if (sedeId) params.sede_id = sedeId;
      if (turnoId) params.turno_id = turnoId;

      const { data } = await api.get('/admin/reportes/general/consolidado-promedios', { params });
      setModalData(data);
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
        tone={0}
        icon="📊"
        title="Consolidado de Promedios"
        description="Promedios por curso o indicador (Inicial) de todas las aulas, por bimestre."
        compact
      >
        <div className="rg-filtros-toolbar rg-filtros-toolbar--fill">
          {loading ? (
            <div className="rg-alum-loading">
              <CircularProgress size={22} />
              <span>Cargando filtros…</span>
            </div>
          ) : (
            <>
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
              <TextField
                select
                size="small"
                label="Bimestre"
                value={bimestre}
                onChange={(e) => setBimestre(e.target.value)}
                className="rg-alum-field rg-alum-field--bimestre"
              >
                {BIMESTRES.map((b) => (
                  <MenuItem key={b.value} value={String(b.value)}>
                    {b.label}
                  </MenuItem>
                ))}
              </TextField>
              <div className="rg-filtros-toolbar__actions">
                <button type="button" className="rg-alum-btn rg-alum-btn--primary" onClick={verReporte}>
                  <VisibilityIcon fontSize="small" aria-hidden />
                  Ver Reporte
                </button>
              </div>
            </>
          )}
        </div>
      </ReporteGeneralPanel>

      <ModalConsolidadoPromedios
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        loading={modalLoading}
        data={modalData}
        anio={anio}
        bimestre={bimestre}
        sedeId={sedeId}
        turnoId={turnoId}
      />
    </>
  );
}
