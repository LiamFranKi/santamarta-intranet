import React, { useCallback, useState } from 'react';
import { CircularProgress, Stack } from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import api from '../../../services/api';
import Swal from 'sweetalert2';
import ReporteGeneralPanel from '../ReporteGeneralPanel';
import useReportesGeneralMeta, { aplicarDefaultsSedeAnio } from './useReportesGeneralMeta';
import FiltrosSedeAnio from './FiltrosSedeAnio';
import ModalResumenAlumnosMatriculados from './ModalResumenAlumnosMatriculados';

export default function ReporteResumenAlumnosMatriculados() {
  const [sedeId, setSedeId] = useState('');
  const [anio, setAnio] = useState('');

  const onDefaults = useCallback((data) => {
    aplicarDefaultsSedeAnio(data, { setSedeId, setAnio });
  }, []);

  const { meta, loading } = useReportesGeneralMeta(onDefaults);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [secciones, setSecciones] = useState([]);
  const [totalGeneral, setTotalGeneral] = useState(null);
  const [anioModal, setAnioModal] = useState('');

  const verReporte = async () => {
    const anioN = parseInt(anio, 10);
    const sedeN = sedeId !== '' ? parseInt(sedeId, 10) : undefined;
    if (!Number.isFinite(anioN)) {
      Swal.fire({ icon: 'warning', title: 'Año inválido', text: 'Indique un año lectivo válido.' });
      return;
    }

    setModalOpen(true);
    setModalLoading(true);
    setSecciones([]);
    try {
      const { data } = await api.get('/admin/reportes/general/resumen-matriculados', {
        params: {
          anio: anioN,
          ...(Number.isFinite(sedeN) ? { sede_id: sedeN } : {}),
        },
      });
      setAnioModal(String(data.anio || anioN));
      setSecciones(data.secciones || []);
      setTotalGeneral(data.total_general || null);
    } catch (e) {
      setModalOpen(false);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo generar el resumen.',
      });
    } finally {
      setModalLoading(false);
    }
  };

  return (
    <>
      <ReporteGeneralPanel
        tone={1}
        icon="📊"
        title="Resumen alumnos matriculados"
        description="Totales por grupo, nivel y sexo."
        compact
      >
        {loading ? (
          <div className="rg-alum-loading">
            <CircularProgress size={24} />
          </div>
        ) : (
          <div className="rg-alum-filtros rg-alum-filtros--compact">
            <Stack direction="row" flexWrap="wrap" gap={1} alignItems="center" useFlexGap>
              <FiltrosSedeAnio
                meta={meta}
                sedeId={sedeId}
                setSedeId={setSedeId}
                anio={anio}
                setAnio={setAnio}
                compact
              />
            </Stack>
            <div className="rg-alum-actions rg-alum-actions--compact">
              <button type="button" className="rg-alum-btn rg-alum-btn--primary" onClick={verReporte}>
                <VisibilityIcon fontSize="small" aria-hidden />
                Ver
              </button>
            </div>
          </div>
        )}
      </ReporteGeneralPanel>

      <ModalResumenAlumnosMatriculados
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        loading={modalLoading}
        colegioNombre={meta?.colegio_nombre}
        anio={anioModal}
        secciones={secciones}
        total_general={totalGeneral}
      />
    </>
  );
}
