import React, { useCallback, useState } from 'react';
import { CircularProgress } from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import api from '../../../services/api';
import Swal from 'sweetalert2';
import ReporteGeneralPanel from '../ReporteGeneralPanel';
import useReportesGeneralMeta, { aplicarDefaultsSedeAnio } from './useReportesGeneralMeta';
import FiltrosSedeAnioMesPension from './FiltrosSedeAnioMesPension';
import ModalAlumnosPuntuales from './ModalAlumnosPuntuales';

export default function ReporteAlumnosPuntuales() {
  const [sedeId, setSedeId] = useState('');
  const [anio, setAnio] = useState('');
  const [mesHasta, setMesHasta] = useState('');

  const onDefaults = useCallback((data) => {
    aplicarDefaultsSedeAnio(data, { setSedeId, setAnio });
    if (data?.defaults?.mes_hasta != null) setMesHasta(String(data.defaults.mes_hasta));
  }, []);

  const { meta, loading } = useReportesGeneralMeta(onDefaults);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [filas, setFilas] = useState([]);
  const [modalMeta, setModalMeta] = useState({});

  const verReporte = async () => {
    const anioN = parseInt(anio, 10);
    const sedeN = parseInt(sedeId, 10);
    const mesN = parseInt(mesHasta, 10);
    if (!Number.isFinite(anioN)) {
      Swal.fire({ icon: 'warning', title: 'Año inválido', text: 'Indique un año lectivo válido.' });
      return;
    }
    if (!Number.isFinite(sedeN)) {
      Swal.fire({ icon: 'warning', title: 'Sede requerida', text: 'Seleccione una sede.' });
      return;
    }
    if (!Number.isFinite(mesN)) {
      Swal.fire({ icon: 'warning', title: 'Mes requerido', text: 'Seleccione hasta qué mes de pensión filtrar.' });
      return;
    }

    setModalOpen(true);
    setModalLoading(true);
    setFilas([]);
    try {
      const { data } = await api.get('/admin/reportes/general/alumnos-puntuales', {
        params: { anio: anioN, sede_id: sedeN, mes_hasta: mesN },
      });
      setModalMeta({
        anio: data.anio || anioN,
        mes_etiqueta: data.mes_etiqueta || '',
        mes_hasta: data.mes_hasta ?? mesN,
        sede_etiqueta: data.sede_etiqueta || '',
        moneda: data.moneda || meta?.moneda || 'S/',
        total_registros: data.total_registros ?? (data.filas || []).length,
        total_monto_pension: data.total_monto_pension ?? 0,
      });
      setFilas(data.filas || []);
    } catch (e) {
      setModalOpen(false);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo cargar la lista.',
      });
    } finally {
      setModalLoading(false);
    }
  };

  return (
    <>
      <ReporteGeneralPanel
        tone={5}
        icon="⭐"
        title="Alumnos puntuales"
        description="Alumnos con pensiones canceladas hasta el mes elegido, sin mora en ningún mes. Una fila por alumno."
        compact
      >
        {loading ? (
          <div className="rg-alum-loading">
            <CircularProgress size={24} />
          </div>
        ) : (
          <div className="rg-filtros-toolbar rg-filtros-toolbar--single-line rg-filtros-toolbar--fill">
            <FiltrosSedeAnioMesPension
              meta={meta}
              sedeId={sedeId}
              setSedeId={setSedeId}
              anio={anio}
              setAnio={setAnio}
              mesHasta={mesHasta}
              setMesHasta={setMesHasta}
              compact
            />
            <div className="rg-filtros-toolbar__actions">
              <button type="button" className="rg-alum-btn rg-alum-btn--primary" onClick={verReporte}>
                <VisibilityIcon fontSize="small" aria-hidden />
                Ver
              </button>
            </div>
          </div>
        )}
      </ReporteGeneralPanel>

      <ModalAlumnosPuntuales
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        loading={modalLoading}
        colegioNombre={meta?.colegio_nombre}
        filas={filas}
        {...modalMeta}
      />
    </>
  );
}
