import React, { useCallback, useState } from 'react';
import { MenuItem, TextField, CircularProgress } from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import api from '../../../services/api';
import Swal from 'sweetalert2';
import ReporteGeneralPanel from '../ReporteGeneralPanel';
import useReportesGeneralMeta, { aplicarDefaultsSedeAnio } from './useReportesGeneralMeta';
import ModalAsistenciaConsolidado from './ModalAsistenciaConsolidado';
import { MESES_OPCIONES } from './asistenciaMensualUi';

export default function ReporteAsistenciaConsolidado() {
  const [sedeId, setSedeId] = useState('');
  const [turnoId, setTurnoId] = useState('');
  const [anio, setAnio] = useState('');
  const [mes, setMes] = useState(String(new Date().getMonth() + 1));

  const onDefaults = useCallback((data) => {
    aplicarDefaultsSedeAnio(data, { setSedeId, setAnio });
    const anioDef = data?.defaults?.anio ?? data?.anio_activo ?? new Date().getFullYear();
    if (Number(anioDef) === new Date().getFullYear()) {
      setMes(String(new Date().getMonth() + 1));
    }
    setTurnoId('');
  }, []);

  const { meta, loading } = useReportesGeneralMeta(onDefaults);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [data, setData] = useState(null);

  const aniosOpciones = meta?.anio_activo
    ? [meta.anio_activo, meta.anio_activo - 1, meta.anio_activo - 2].filter((y) => y > 2000)
    : [new Date().getFullYear()];

  const verReporte = async () => {
    const anioN = parseInt(anio, 10);
    const mesN = parseInt(mes, 10);
    if (!Number.isFinite(anioN) || !Number.isFinite(mesN) || mesN < 1 || mesN > 12) {
      Swal.fire({ icon: 'warning', title: 'Filtros', text: 'Indique año y mes válidos.' });
      return;
    }
    setModalOpen(true);
    setModalLoading(true);
    setData(null);
    try {
      const params = { anio: anioN, mes: mesN };
      if (sedeId) params.sede_id = sedeId;
      if (turnoId) params.turno_id = turnoId;
      const res = await api.get('/admin/reportes/general/asistencia-consolidado', { params });
      setData(res.data);
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
        tone={0}
        icon="📊"
        title="Consolidado de asistencia"
        description="Todas las aulas del mes: tardanzas, faltas y no justificadas. Clic en un número para ver a quién y qué día."
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
                label="Mes"
                value={mes}
                onChange={(e) => setMes(e.target.value)}
                className="rg-alum-field rg-alum-field--mes"
              >
                {MESES_OPCIONES.map((m) => (
                  <MenuItem key={m.value} value={String(m.value)}>
                    {m.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                label="Turno"
                value={turnoId}
                onChange={(e) => setTurnoId(e.target.value)}
                className="rg-alum-field rg-alum-field--turno"
              >
                <MenuItem value="">Todos</MenuItem>
                {(meta?.turnos || []).map((t) => (
                  <MenuItem key={t.id} value={String(t.id)}>
                    {t.nombre}
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

      <ModalAsistenciaConsolidado
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        loading={modalLoading}
        data={data}
        anio={anio}
        mes={mes}
        sedeId={sedeId}
        turnoId={turnoId}
      />
    </>
  );
}
