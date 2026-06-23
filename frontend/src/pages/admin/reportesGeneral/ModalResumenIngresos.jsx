import React from 'react';
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
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { generarPdfResumenIngresos } from '../../../utils/pdfResumenIngresos';
import { REPORTE_GENERAL_DIALOG_SX } from './reporteDialogProps';

function fmtMonto(n, moneda) {
  const v = parseFloat(n);
  if (Number.isNaN(v)) return '—';
  return `${moneda || 'S/'} ${v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ModalResumenIngresos({
  open,
  onClose,
  loading,
  colegioNombre,
  rango_etiqueta,
  sede_etiqueta,
  moneda,
  filas,
  total_ingresos,
}) {
  const hayDatos = (filas || []).length > 0;

  const exportPdf = async () => {
    await generarPdfResumenIngresos({
      colegioNombre,
      rango_etiqueta,
      sede_etiqueta,
      moneda,
      filas,
      total_ingresos,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth scroll="paper" className="rg-alum-modal" sx={REPORTE_GENERAL_DIALOG_SX}>
      <DialogTitle className="rg-alum-modal__title">
        <span>Resumen de Ingresos {rango_etiqueta ? `— ${rango_etiqueta}` : ''}</span>
        <IconButton aria-label="Cerrar" onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers className="rg-alum-modal__content rg-ingresos-modal">
        {loading ? (
          <Box display="flex" justifyContent="center" py={6}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <div className="rg-ingresos-modal__header-meta">
              <p className="rg-alum-modal__subtitle">
                {sede_etiqueta ? (
                  <>
                    Sede: <strong>{sede_etiqueta}</strong>
                    {' · '}
                  </>
                ) : null}
                {hayDatos ? `${filas.length} registro${filas.length === 1 ? '' : 's'}` : 'Sin registros'}
              </p>
            </div>

            <h3 className="rg-ingresos-section-title">INGRESOS</h3>

            {!hayDatos ? (
              <Typography color="text.secondary" align="center" py={4}>
                No hay ingresos en el rango seleccionado.
              </Typography>
            ) : (
              <div className="rg-alum-lista-table-wrap">
                <table className="rg-alum-lista-table rg-ingresos-table">
                  <thead>
                    <tr>
                      <th>Nº de recibo</th>
                      <th>Monto S/.</th>
                      <th>Descripción</th>
                      <th>Alumno</th>
                      <th>Fecha pago</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(filas || []).map((f) => (
                      <tr key={f.pago_id}>
                        <td className="col-num">{f.nro_recibo}</td>
                        <td className="col-num">{fmtMonto(f.monto, moneda)}</td>
                        <td>{f.descripcion}</td>
                        <td>{f.alumno_nombre}</td>
                        <td className="col-num">{f.fecha_pago}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h3 className="rg-ingresos-section-title rg-ingresos-section-title--balance">BALANCE</h3>
            <div className="rg-ingresos-balance">
              <div className="rg-ingresos-balance__label">TOTAL INGRESOS S/.</div>
              <div className="rg-ingresos-balance__value">
                {(parseFloat(total_ingresos) || 0).toLocaleString('es-PE', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
            </div>
          </>
        )}
      </DialogContent>
      <DialogActions className="rg-alum-modal__actions">
        <Button onClick={onClose} variant="outlined" color="inherit">
          Cerrar
        </Button>
        <Button
          onClick={exportPdf}
          variant="contained"
          disabled={!hayDatos}
          startIcon={<PictureAsPdfIcon />}
          className="rg-btn-pdf"
        >
          Exportar PDF
        </Button>
      </DialogActions>
    </Dialog>
  );
}
