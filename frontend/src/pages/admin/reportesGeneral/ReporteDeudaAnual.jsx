import React, { useCallback, useState } from 'react';
import { TextField, CircularProgress } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import api from '../../../services/api';
import Swal from 'sweetalert2';
import ReporteGeneralPanel from '../ReporteGeneralPanel';
import useReportesGeneralMeta, { aplicarDefaultsSedeAnio } from './useReportesGeneralMeta';

export default function ReporteDeudaAnual() {
  const [sedeId, setSedeId] = useState('');
  const [anio, setAnio] = useState('');
  const [downloading, setDownloading] = useState(false);

  const onDefaults = useCallback((data) => {
    aplicarDefaultsSedeAnio(data, { setSedeId, setAnio });
  }, []);

  const { meta, loading } = useReportesGeneralMeta(onDefaults);

  const verReporte = async () => {
    const d = meta?.defaults || {};
    const anioN = parseInt(anio, 10) || parseInt(d.anio, 10);
    const sedeRaw = sedeId !== '' ? sedeId : d.sede_id;
    const sedeN = sedeRaw != null && sedeRaw !== '' ? parseInt(sedeRaw, 10) : undefined;

    if (!Number.isFinite(anioN)) {
      Swal.fire({ icon: 'warning', title: 'Filtros', text: 'Seleccione un año válido.' });
      return;
    }

    setDownloading(true);
    try {
      const res = await api.get('/admin/reportes/general/deuda-anual', {
        params: {
          anio: anioN,
          ...(Number.isFinite(sedeN) ? { sede_id: sedeN } : {}),
        },
        responseType: 'blob',
      });

      const contentType = res.headers?.['content-type'] || '';
      if (contentType.includes('application/json')) {
        const text = await res.data.text();
        const json = JSON.parse(text);
        throw new Error(json.error || 'No se pudo generar el reporte.');
      }

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `reporte_deuda_${anioN}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      let msg = e.message || 'No se pudo descargar el Excel.';
      if (e.response?.data instanceof Blob) {
        try {
          const text = await e.response.data.text();
          const json = JSON.parse(text);
          if (json.error) msg = json.error;
        } catch {
          /* mantener mensaje genérico */
        }
      } else if (e.response?.data?.error) {
        msg = e.response.data.error;
      }
      Swal.fire({ icon: 'error', title: 'Excel', text: msg });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <ReporteGeneralPanel
      tone={5}
      icon="📊"
      title="Reporte Deuda Anual"
      description="Deuda pendiente por alumno: matrícula y pensiones mensuales del año."
      compact
    >
      {loading ? (
        <div className="rg-alum-loading">
          <CircularProgress size={22} aria-hidden />
          Cargando filtros…
        </div>
      ) : (
        <div className="rg-filtros-toolbar rg-filtros-toolbar--card-trio">
          <TextField
            size="small"
            label="Año"
            type="number"
            value={anio}
            onChange={(e) => setAnio(e.target.value)}
            className="rg-alum-field rg-alum-field--anio"
            inputProps={{ min: 2000, max: 2100 }}
          />
          <div className="rg-filtros-toolbar__actions">
            <button
              type="button"
              className="rg-alum-btn rg-alum-btn--primary rg-alum-btn--compact"
              onClick={verReporte}
              disabled={downloading}
            >
              {downloading ? (
                <CircularProgress size={16} color="inherit" aria-hidden />
              ) : (
                <DownloadIcon fontSize="small" aria-hidden />
              )}
              Ver Reporte
            </button>
          </div>
        </div>
      )}
    </ReporteGeneralPanel>
  );
}
