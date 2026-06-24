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
import { generarPdfListaMaestrosPorAula } from '../../../utils/pdfListaMaestrosPorAula';
import { REPORTE_GENERAL_DIALOG_SX } from './reporteDialogProps';

export default function ModalListaMaestrosPorAula({
  open,
  onClose,
  loading,
  colegioNombre,
  titulo,
  filas,
  total,
}) {
  const hayDatos = (filas || []).length > 0;

  const exportPdf = async () => {
    await generarPdfListaMaestrosPorAula({
      colegioNombre,
      titulo,
      filas,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth scroll="paper" className="rg-alum-modal" sx={REPORTE_GENERAL_DIALOG_SX}>
      <DialogTitle className="rg-alum-modal__title">
        <span>Lista de Maestros por Aula</span>
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
            {titulo ? <p className="rg-alum-modal__subtitle">{titulo}</p> : null}
            {!hayDatos ? (
              <Typography color="text.secondary" align="center" py={4}>
                No hay docentes asignados a este grupo.
              </Typography>
            ) : (
              <div className="rg-alum-lista-table-wrap">
                <table className="rg-alum-lista-table rg-maestros-aula-table">
                  <thead>
                    <tr>
                      <th>Nombres y apellidos profesor</th>
                      <th>Curso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(filas || []).map((f, i) => (
                      <tr
                        key={`${f.profesor_nombre}-${f.curso}-${i}`}
                        className={f.tipo === 'tutoria' || f.tipo === 'cotutoria' ? 'rg-maestros-aula-row--tutoria' : undefined}
                      >
                        <td>{f.profesor_nombre}</td>
                        <td>{f.curso}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {hayDatos && typeof total === 'number' ? (
              <p className="rg-maestros-aula-total">
                Total: <strong>{total}</strong> registro{total === 1 ? '' : 's'}
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
