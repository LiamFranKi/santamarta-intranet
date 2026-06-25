import React, { useCallback, useState } from 'react';
import { MenuItem, TextField, CircularProgress } from '@mui/material';
import TableChartIcon from '@mui/icons-material/TableChart';
import api from '../../../services/api';
import Swal from 'sweetalert2';
import ReporteGeneralPanel from '../ReporteGeneralPanel';
import useReportesGeneralMeta, { aplicarDefaultsSedeAnio } from './useReportesGeneralMeta';

const BIMESTRES = [
  { value: 1, label: 'BIMESTRE 1' },
  { value: 2, label: 'BIMESTRE 2' },
  { value: 3, label: 'BIMESTRE 3' },
  { value: 4, label: 'BIMESTRE 4' },
];

export default function ReporteConsolidadoPromediosDetallado() {
  const [anio, setAnio] = useState('');
  const [bimestre, setBimestre] = useState('1');
  const [sedeId, setSedeId] = useState('');
  const [turnoId, setTurnoId] = useState('');
  const [exporting, setExporting] = useState(false);

  const onDefaults = useCallback((data) => {
    aplicarDefaultsSedeAnio(data, { setSedeId, setAnio, setTurnoId });
    setBimestre('1');
  }, []);

  const { meta, loading } = useReportesGeneralMeta(onDefaults);

  const exportarExcel = async () => {
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

    setExporting(true);
    Swal.fire({
      title: 'Generando reporte…',
      html: 'El consolidado detallado puede tardar un momento.',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    try {
      const params = { anio: anioN, bimestre: bimN };
      if (sedeId) params.sede_id = sedeId;
      if (turnoId) params.turno_id = turnoId;

      const res = await api.get('/admin/reportes/general/consolidado-promedios-detallado/excel', {
        params,
        responseType: 'blob',
        timeout: 300000,
      });

      const contentType = res.headers?.['content-type'] || '';
      if (contentType.includes('application/json')) {
        const text = await res.data.text();
        const json = JSON.parse(text);
        throw new Error(json.error || 'No se pudo exportar el Excel.');
      }

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `consolidado_promedios_detallado_b${bimN}_${anioN}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      Swal.fire({
        icon: 'success',
        title: 'Excel generado',
        text: 'La descarga del consolidado detallado ha comenzado.',
        timer: 2200,
        showConfirmButton: false,
      });
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error al exportar',
        text: e.response?.data?.error || e.message || 'No se pudo generar el Excel.',
      });
    } finally {
      setExporting(false);
    }
  };

  const aniosOpciones = meta?.anio_activo
    ? [meta.anio_activo, meta.anio_activo - 1, meta.anio_activo - 2].filter((y) => y > 2000)
    : [new Date().getFullYear()];

  return (
    <ReporteGeneralPanel
      tone={1}
      icon="📋"
      title="Consolidado de Promedios Detallados"
      description="Indicadores por curso y promedio (PROM) de cada aula. Solo exportación Excel."
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
              <button
                type="button"
                className="rg-alum-btn rg-btn-excel"
                onClick={exportarExcel}
                disabled={exporting}
              >
                <TableChartIcon fontSize="small" aria-hidden />
                {exporting ? 'Exportando…' : 'Exportar Excel'}
              </button>
            </div>
          </>
        )}
      </div>
    </ReporteGeneralPanel>
  );
}
