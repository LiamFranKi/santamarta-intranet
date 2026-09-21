import React, { useCallback, useState } from 'react';
import { MenuItem, TextField, CircularProgress } from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import api from '../../../services/api';
import Swal from 'sweetalert2';
import ReporteGeneralPanel from '../ReporteGeneralPanel';
import useReportesGeneralMeta, { aplicarDefaultsSedeAnio } from './useReportesGeneralMeta';
import ModalExamenesVirtuales from './ModalExamenesVirtuales';

const BIMESTRES = [
  { value: 1, label: 'BIMESTRE 1' },
  { value: 2, label: 'BIMESTRE 2' },
  { value: 3, label: 'BIMESTRE 3' },
  { value: 4, label: 'BIMESTRE 4' },
];

export default function ReporteExamenesVirtuales() {
  const [anio, setAnio] = useState('');
  const [bimestre, setBimestre] = useState('1');
  const [sedeId, setSedeId] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const onDefaults = useCallback((data) => {
    aplicarDefaultsSedeAnio(data, { setAnio });
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
    if (desde && hasta && desde > hasta) {
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
      const params = { anio: anioN, bimestre: bimN };
      if (sedeId) params.sede_id = sedeId;
      if (desde) params.desde = desde;
      if (hasta) params.hasta = hasta;
      const { data } = await api.get('/admin/reportes/general/examenes-virtuales', { params });
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
        tone={2}
        icon="📝"
        title="Exámenes virtuales"
        description="Exámenes en línea del aula virtual del bimestre, agrupados por grupo, asignatura y docente, con la lista de notas. Las fechas son opcionales."
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
              {(meta?.sedes || []).length > 0 && (
                <TextField
                  select
                  size="small"
                  label="Sede"
                  value={sedeId}
                  onChange={(e) => setSedeId(e.target.value)}
                  className="rg-alum-field rg-alum-field--sede"
                >
                  <MenuItem value="">Todas</MenuItem>
                  {(meta.sedes || []).map((s) => (
                    <MenuItem key={s.id} value={String(s.id)}>
                      {s.nombre}
                    </MenuItem>
                  ))}
                </TextField>
              )}
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
                required
              >
                {BIMESTRES.map((b) => (
                  <MenuItem key={b.value} value={String(b.value)}>
                    {b.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                size="small"
                type="date"
                label="Desde"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                InputLabelProps={{ shrink: true }}
                className="rg-alum-field rg-alum-field--fecha"
              />
              <TextField
                size="small"
                type="date"
                label="Hasta"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                InputLabelProps={{ shrink: true }}
                className="rg-alum-field rg-alum-field--fecha"
              />
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

      <ModalExamenesVirtuales
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        loading={modalLoading}
        data={modalData}
        anio={anio}
        bimestre={bimestre}
        sedeId={sedeId}
        desde={desde}
        hasta={hasta}
      />
    </>
  );
}
