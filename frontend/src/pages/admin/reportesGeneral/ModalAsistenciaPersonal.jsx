import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
  Box,
  CircularProgress,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import TableChartIcon from '@mui/icons-material/TableChart';
import api from '../../../services/api';
import Swal from 'sweetalert2';
import { REPORTE_GENERAL_DIALOG_SX } from './reporteDialogProps';

export default function ModalAsistenciaPersonal({
  open,
  onClose,
  loading,
  colegioNombre,
  data,
  desde,
  hasta,
}) {
  const [exporting, setExporting] = useState(false);
  const filas = data?.filas || [];
  const fechas = data?.fechas || [];
  const hayDatos = filas.length > 0;

  const exportExcel = async () => {
    if (!desde || !hasta) return;
    setExporting(true);
    try {
      const res = await api.get('/admin/reportes/general/asistencia-personal/excel', {
        params: { desde, hasta },
        responseType: 'blob',
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
      a.download = `asistencia_personal_${desde}_${hasta}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
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

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xl"
      fullWidth
      scroll="paper"
      className="rg-alum-modal"
      sx={REPORTE_GENERAL_DIALOG_SX}
    >
      <DialogTitle className="rg-alum-modal__title">
        <span>Asistencia del Personal</span>
        <IconButton aria-label="Cerrar" onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers className="rg-alum-modal__content">
        {loading ? (
          <Box display="flex" justifyContent="center" py={6}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {data?.titulo ? (
              <p className="rg-alum-modal__subtitle rg-alum-modal__subtitle--strong">{data.titulo}</p>
            ) : null}
            {colegioNombre ? (
              <p className="rg-alum-modal__subtitle rg-alum-modal__subtitle--muted">{colegioNombre}</p>
            ) : null}
            {data?.formula_descuento ? (
              <p className="rg-alum-modal__hint">
                Descuento por minuto: sueldo ÷ 30 días ÷ 8 horas ÷ 60 minutos (S/. 0 si no hay sueldo). El total es la
                suma de cada día.
              </p>
            ) : data?.tarifa_por_minuto != null ? (
              <p className="rg-alum-modal__hint">
                Tarifa tardanza: S/. {Number(data.tarifa_por_minuto).toFixed(2)} por minuto
              </p>
            ) : null}
            {!hayDatos ? (
              <Typography color="text.secondary" align="center" py={4}>
                No hay personal registrado en el colegio.
              </Typography>
            ) : (
              <div className="rg-alum-lista-table-wrap rg-asist-personal-table-wrap">
                <table className="rg-alum-lista-table rg-asist-personal-table">
                  <thead>
                    <tr>
                      <th className="col-num">N°</th>
                      <th className="rg-asist-personal-col-nombre">Nombre trabajador</th>
                      <th>Hora ingreso</th>
                      {fechas.map((f) => (
                        <th key={f.iso || f} className="rg-asist-personal-col-dia">
                          {f.label || f}
                        </th>
                      ))}
                      <th className="col-num">Minutos</th>
                      <th className="col-num">Descuento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f) => (
                      <tr key={f.personal_id}>
                        <td className="col-num">{f.numero}</td>
                        <td className="rg-asist-personal-col-nombre">{f.nombre}</td>
                        <td>{f.hora_ingreso || '—'}</td>
                        {fechas.map((fecha) => {
                          const iso = fecha.iso || fecha;
                          return (
                            <td key={`${f.personal_id}-${iso}`} className="rg-asist-personal-col-dia">
                              {f.dias?.[iso]?.hora_marcacion || ''}
                            </td>
                          );
                        })}
                        <td className="col-num">{f.minutos_total ?? 0}</td>
                        <td className="col-num">{f.descuento_total_fmt || 'S/. 0.00'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {hayDatos ? (
              <p className="rg-maestros-aula-total">
                Total personal: <strong>{data.total_personal}</strong>
                {' · '}
                Minutos: <strong>{data.total_minutos}</strong>
                {' · '}
                Descuento: <strong>{data.total_descuento_fmt}</strong>
              </p>
            ) : null}
          </>
        )}
      </DialogContent>
      <DialogActions className="rg-alum-modal__actions">
        <Button onClick={onClose} variant="outlined" color="inherit">
          Cerrar
        </Button>
        <Button
          onClick={exportExcel}
          variant="contained"
          disabled={!hayDatos || exporting}
          startIcon={<TableChartIcon />}
          className="rg-btn-excel"
        >
          {exporting ? 'Exportando…' : 'Exportar Excel'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
