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
import { generarPdfListaAlumnosRetirados } from '../../../utils/pdfListaAlumnosRetirados';
import { REPORTE_GENERAL_DIALOG_SX } from './reporteDialogProps';

export default function ModalListaAlumnosRetirados({
  open,
  onClose,
  loading,
  colegioNombre,
  anio,
  nivel_etiqueta,
  filas,
  total,
}) {
  const hayDatos = (filas || []).length > 0;

  const exportPdf = async () => {
    await generarPdfListaAlumnosRetirados({
      colegioNombre,
      anio,
      nivel_etiqueta,
      filas,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth scroll="paper" className="rg-alum-modal" sx={REPORTE_GENERAL_DIALOG_SX}>
      <DialogTitle className="rg-alum-modal__title">
        <span>Lista de alumnos retirados {anio ? `— ${anio}` : ''}</span>
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
            <p className="rg-alum-modal__subtitle">
              Alumnos de nivel: <strong>{nivel_etiqueta || 'TODOS'}</strong>
              {typeof total === 'number' ? ` · ${total} registro${total === 1 ? '' : 's'}` : ''}
            </p>
            {!hayDatos ? (
              <Typography color="text.secondary" align="center" py={4}>
                No hay alumnos retirados con los filtros seleccionados.
              </Typography>
            ) : (
              <div className="rg-alum-lista-table-wrap">
                <table className="rg-alum-lista-table rg-retirados-table">
                  <thead>
                    <tr>
                      <th>Apellidos y nombres</th>
                      <th>Grado - Sección</th>
                      <th>Nº documento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(filas || []).map((f, i) => (
                      <tr key={`${f.nro_documento}-${i}`}>
                        <td>{f.alumno_nombre}</td>
                        <td>{f.grado_seccion}</td>
                        <td className="col-num">{f.nro_documento}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
