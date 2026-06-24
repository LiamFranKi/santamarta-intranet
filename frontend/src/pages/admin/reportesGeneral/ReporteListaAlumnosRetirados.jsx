import React, { useCallback, useState } from 'react';
import { CircularProgress, MenuItem, TextField } from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import api from '../../../services/api';
import Swal from 'sweetalert2';
import ReporteGeneralPanel from '../ReporteGeneralPanel';
import useReportesGeneralMeta, { aplicarDefaultsSedeAnio } from './useReportesGeneralMeta';
import FiltrosSedeAnio from './FiltrosSedeAnio';
import ModalListaAlumnosRetirados from './ModalListaAlumnosRetirados';

export default function ReporteListaAlumnosRetirados() {
  const [sedeId, setSedeId] = useState('');
  const [anio, setAnio] = useState('');
  const [nivelId, setNivelId] = useState('TODOS');

  const onDefaults = useCallback((data) => {
    aplicarDefaultsSedeAnio(data, { setSedeId, setAnio });
    const nivs = data?.niveles || [];
    const inicial = nivs.find((n) => /inicial/i.test(String(n.nombre || '')));
    if (inicial) setNivelId(String(inicial.id));
  }, []);

  const { meta, loading } = useReportesGeneralMeta(onDefaults);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [filas, setFilas] = useState([]);
  const [nivelEtiqueta, setNivelEtiqueta] = useState('TODOS');
  const [anioModal, setAnioModal] = useState('');
  const [total, setTotal] = useState(0);

  const verReporte = async () => {
    const anioN = parseInt(anio, 10);
    const sedeN = sedeId !== '' ? parseInt(sedeId, 10) : undefined;
    if (!Number.isFinite(anioN)) {
      Swal.fire({ icon: 'warning', title: 'Año inválido', text: 'Indique un año lectivo válido.' });
      return;
    }

    setModalOpen(true);
    setModalLoading(true);
    setFilas([]);
    try {
      const params = {
        anio: anioN,
        nivel_id: nivelId,
        ...(Number.isFinite(sedeN) ? { sede_id: sedeN } : {}),
      };
      const { data } = await api.get('/admin/reportes/general/alumnos-retirados', { params });
      setAnioModal(String(data.anio || anioN));
      setNivelEtiqueta(data.nivel_etiqueta || 'TODOS');
      setFilas(data.filas || []);
      setTotal(data.total ?? (data.filas || []).length);
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
        tone={2}
        icon="📤"
        title="Lista alumnos retirados"
        hint={
          <>
            Seleccione sede, año y nivel. Use <strong>TODOS</strong> para ver todos los niveles.
          </>
        }
        compact
      >
        {loading ? (
          <div className="rg-alum-loading">
            <CircularProgress size={24} />
          </div>
        ) : (
          <div className="rg-filtros-toolbar rg-filtros-toolbar--single-line rg-filtros-toolbar--fill">
            <FiltrosSedeAnio
              meta={meta}
              sedeId={sedeId}
              setSedeId={setSedeId}
              anio={anio}
              setAnio={setAnio}
              compact
            />
            <TextField
              select
              size="small"
              label="Nivel"
              value={nivelId}
              onChange={(e) => setNivelId(e.target.value)}
              className="rg-alum-field rg-alum-field--nivel-compact"
            >
              <MenuItem value="TODOS">TODOS</MenuItem>
              {(meta?.niveles || []).map((n) => (
                <MenuItem key={n.id} value={String(n.id)}>
                  {n.nombre}
                </MenuItem>
              ))}
            </TextField>
            <div className="rg-filtros-toolbar__actions">
              <button type="button" className="rg-alum-btn rg-alum-btn--primary" onClick={verReporte}>
                <VisibilityIcon fontSize="small" aria-hidden />
                Ver
              </button>
            </div>
          </div>
        )}
      </ReporteGeneralPanel>

      <ModalListaAlumnosRetirados
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        loading={modalLoading}
        colegioNombre={meta?.colegio_nombre}
        anio={anioModal}
        nivel_etiqueta={nivelEtiqueta}
        filas={filas}
        total={total}
      />
    </>
  );
}
