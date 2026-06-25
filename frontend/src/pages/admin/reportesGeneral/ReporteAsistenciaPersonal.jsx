import React, { useCallback, useState } from 'react';
import { TextField, CircularProgress } from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import api from '../../../services/api';
import Swal from 'sweetalert2';
import ReporteGeneralPanel from '../ReporteGeneralPanel';
import ModalAsistenciaPersonal from './ModalAsistenciaPersonal';

function hoyLocalISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function ReporteAsistenciaPersonal() {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const onDefaults = useCallback(() => {
    const hoy = hoyLocalISO();
    setDesde(hoy);
    setHasta(hoy);
  }, []);

  const [metaLoaded, setMetaLoaded] = useState(false);
  const [colegioNombre, setColegioNombre] = useState('');

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/admin/reportes/general/meta');
        if (!cancelled) {
          setColegioNombre(data.colegio_nombre || '');
          onDefaults();
          setMetaLoaded(true);
        }
      } catch {
        if (!cancelled) {
          onDefaults();
          setMetaLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onDefaults]);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalData, setModalData] = useState(null);
  const [rangoExport, setRangoExport] = useState({ desde: '', hasta: '' });

  const verReporte = async () => {
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

    setModalOpen(true);
    setModalLoading(true);
    setModalData(null);
    try {
      const { data } = await api.get('/admin/reportes/general/asistencia-personal', {
        params: { desde, hasta },
      });
      setModalData(data);
      setRangoExport({ desde, hasta });
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
        icon="🕐"
        title="Asistencia del Personal"
        description="Marcaciones de entrada, minutos de tardanza y descuentos por rango de fechas."
        compact
      >
        {!metaLoaded ? (
          <div className="rg-alum-loading">
            <CircularProgress size={28} />
          </div>
        ) : (
          <div className="rg-filtros-toolbar rg-filtros-toolbar--fill rg-filtros-toolbar--card-duo rg-filtros-toolbar--fechas-derecha">
            <TextField
              size="small"
              label="Desde"
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
        )}
      </ReporteGeneralPanel>

      <ModalAsistenciaPersonal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        loading={modalLoading}
        colegioNombre={colegioNombre}
        data={modalData}
        desde={rangoExport.desde}
        hasta={rangoExport.hasta}
      />
    </>
  );
}
