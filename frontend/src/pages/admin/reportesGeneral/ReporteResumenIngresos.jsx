import React, { useCallback, useState } from 'react';
import { CircularProgress, TextField } from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import api from '../../../services/api';
import Swal from 'sweetalert2';
import ReporteGeneralPanel from '../ReporteGeneralPanel';
import useReportesGeneralMeta, { aplicarDefaultsSedeAnio } from './useReportesGeneralMeta';
import FiltrosSedeAnio from './FiltrosSedeAnio';
import ModalResumenIngresos from './ModalResumenIngresos';

function hoyLocalISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function ReporteResumenIngresos() {
  const [sedeId, setSedeId] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const onDefaults = useCallback((data) => {
    aplicarDefaultsSedeAnio(data, { setSedeId });
    const hoy = hoyLocalISO();
    setDesde(hoy);
    setHasta(hoy);
  }, []);

  const { meta, loading } = useReportesGeneralMeta(onDefaults);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [filas, setFilas] = useState([]);
  const [modalMeta, setModalMeta] = useState({});

  const verReporte = async () => {
    const sedeN = parseInt(sedeId, 10);
    if (!desde || !hasta) {
      Swal.fire({ icon: 'warning', title: 'Fechas requeridas', text: 'Indique el rango desde y hasta.' });
      return;
    }
    if (desde > hasta) {
      Swal.fire({
        icon: 'warning',
        title: 'Rango inválido',
        text: 'La fecha «desde» no puede ser posterior a «hasta».',
      });
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
      const { data } = await api.get('/admin/reportes/general/resumen-ingresos', {
        params: { desde, hasta, sede_id: sedeN },
      });
      setModalMeta({
        rango_etiqueta: data.rango_etiqueta || `${desde} - ${hasta}`,
        sede_etiqueta: data.sede_etiqueta || '',
        moneda: data.moneda || meta?.moneda || 'S/',
        total_ingresos: data.total_ingresos ?? 0,
      });
      setFilas(data.filas || []);
    } catch (e) {
      setModalOpen(false);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo cargar el resumen.',
      });
    } finally {
      setModalLoading(false);
    }
  };

  return (
    <>
      <ReporteGeneralPanel
        tone={5}
        icon="💰"
        title="Resumen de Ingresos"
        description="Ingresos cobrados en un rango de fechas (diario, mensual o anual)."
      >
        {loading ? (
          <div className="rg-alum-loading">
            <CircularProgress size={24} />
          </div>
        ) : (
          <div className="rg-alum-filtros">
            <div className="rg-ingresos-hint" role="note">
              <p>
                <strong>Resumen Diario:</strong> En ambos cuadros seleccione la fecha de la que desea ver el resumen.
              </p>
              <p>
                <strong>Resumen Mensual:</strong> En el primer cuadro seleccione el primer día del mes y en el segundo
                el último día del mes.
              </p>
              <p>
                <strong>Resumen Anual:</strong> En el primer cuadro seleccione el primer día del año y en el segundo el
                último día del año.
              </p>
            </div>

            <div className="rg-filtros-toolbar rg-filtros-toolbar--single-line rg-filtros-toolbar--fill">
              <FiltrosSedeAnio
                meta={meta}
                sedeId={sedeId}
                setSedeId={setSedeId}
                anio=""
                setAnio={() => {}}
                compact
                hideAnio
              />
              <TextField
                size="small"
                label="Mostrar resumen desde"
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className="rg-alum-field rg-alum-field--fecha"
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                size="small"
                label="Hasta"
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className="rg-alum-field rg-alum-field--fecha"
                InputLabelProps={{ shrink: true }}
              />
              <div className="rg-filtros-toolbar__actions">
                <button type="button" className="rg-alum-btn rg-alum-btn--primary" onClick={verReporte}>
                  <VisibilityIcon fontSize="small" aria-hidden />
                  Ver Reporte
                </button>
              </div>
            </div>
          </div>
        )}
      </ReporteGeneralPanel>

      <ModalResumenIngresos
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
