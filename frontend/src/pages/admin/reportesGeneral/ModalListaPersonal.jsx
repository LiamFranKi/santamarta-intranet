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
import { generarPdfListaPersonal } from '../../../utils/pdfListaPersonal';
import { REPORTE_GENERAL_DIALOG_SX } from './reporteDialogProps';

export default function ModalListaPersonal({
  open,
  onClose,
  loading,
  colegioNombre,
  titulo,
  subtitulo,
  filas,
  total,
}) {
  const hayDatos = (filas || []).length > 0;

  const exportPdf = async () => {
    await generarPdfListaPersonal({
      colegioNombre,
      titulo,
      subtitulo,
      filas,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth scroll="paper" className="rg-alum-modal" sx={REPORTE_GENERAL_DIALOG_SX}>
      <DialogTitle className="rg-alum-modal__title">
        <span>Lista de Personal</span>
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
            {subtitulo ? <p className="rg-alum-modal__subtitle rg-alum-modal__subtitle--muted">{subtitulo}</p> : null}
            {!hayDatos ? (
              <Typography color="text.secondary" align="center" py={4}>
                No hay personal registrado.
              </Typography>
            ) : (
              <div className="rg-alum-lista-table-wrap">
                <table className="rg-alum-lista-table rg-personal-lista-table">
                  <thead>
                    <tr>
                      <th>Apellidos y nombres</th>
                      <th>Cargo</th>
                      <th>Fecha de nacimiento</th>
                      <th>Teléfono</th>
                      <th>Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(filas || []).map((f, i) => (
                      <tr key={`${f.nombre_completo}-${i}`}>
                        <td>{f.nombre_completo}</td>
                        <td>{f.cargo}</td>
                        <td>{f.fecha_nacimiento}</td>
                        <td>{f.telefono}</td>
                        <td>{f.email}</td>
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
