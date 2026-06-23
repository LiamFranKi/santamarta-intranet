import { useCallback, useState } from 'react';
import { CircularProgress } from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import api from '../../../services/api';
import Swal from 'sweetalert2';
import ReporteGeneralPanel from '../ReporteGeneralPanel';
import useReportesGeneralMeta, { aplicarDefaultsSedeAnio } from './useReportesGeneralMeta';
import FiltrosSedeAnioConcepto from './FiltrosSedeAnioConcepto';
import ModalDeudoresPagadores from './ModalDeudoresPagadores';

export default function useReporteDeudoresPagadores({ modo, tone, icon, title, description, endpoint }) {
  const [sedeId, setSedeId] = useState('');
  const [anio, setAnio] = useState('');
  const [concepto, setConcepto] = useState('todos');

  const onDefaults = useCallback((data) => {
    aplicarDefaultsSedeAnio(data, { setSedeId, setAnio });
    if (data?.defaults?.concepto != null) setConcepto(String(data.defaults.concepto));
  }, []);

  const { meta, loading } = useReportesGeneralMeta(onDefaults);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [filas, setFilas] = useState([]);
  const [modalMeta, setModalMeta] = useState({});

  const verReporte = async () => {
    const anioN = parseInt(anio, 10);
    const sedeN = parseInt(sedeId, 10);
    if (!Number.isFinite(anioN)) {
      Swal.fire({ icon: 'warning', title: 'Año inválido', text: 'Indique un año lectivo válido.' });
      return;
    }
    if (!Number.isFinite(sedeN)) {
      Swal.fire({ icon: 'warning', title: 'Sede requerida', text: 'Seleccione una sede.' });
      return;
    }

    setModalOpen(true);
    setModalLoading(true);
    setFilas([]);
    try {
      const { data } = await api.get(endpoint, {
        params: { anio: anioN, sede_id: sedeN, concepto },
      });
      setModalMeta({
        anio: data.anio || anioN,
        concepto: data.concepto || concepto,
        sede_etiqueta: data.sede_etiqueta || '',
        moneda: data.moneda || meta?.moneda || 'S/',
        total_registros: data.total_registros ?? (data.filas || []).length,
        total_monto: data.total_monto ?? 0,
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

  const panel = (
    <ReporteGeneralPanel tone={tone} icon={icon} title={title} description={description} compact>
      {loading ? (
        <div className="rg-alum-loading">
          <CircularProgress size={24} />
        </div>
      ) : (
        <div className="rg-filtros-toolbar rg-filtros-toolbar--single-line">
          <FiltrosSedeAnioConcepto
            meta={meta}
            sedeId={sedeId}
            setSedeId={setSedeId}
            anio={anio}
            setAnio={setAnio}
            concepto={concepto}
            setConcepto={setConcepto}
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
  );

  const modal = (
    <ModalDeudoresPagadores
      open={modalOpen}
      onClose={() => setModalOpen(false)}
      loading={modalLoading}
      modo={modo}
      colegioNombre={meta?.colegio_nombre}
      filas={filas}
      {...modalMeta}
    />
  );

  return { panel, modal };
}
