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
import { generarPdfAsistenciaMensual } from '../../../utils/pdfAsistenciaMensual';
import { REPORTE_GENERAL_DIALOG_SX } from './reporteDialogProps';
import { claseCodigoAsistencia } from './asistenciaMensualUi';

export default function ModalAsistenciaMensual({
  open,
  onClose,
  loading,
  colegioNombre,
  titulo,
  subtitulo,
  columnas,
  filas,
  total,
}) {
  const hayDatos = (filas || []).length > 0;
  const cols = columnas || [];

  const exportPdf = async () => {
    await generarPdfAsistenciaMensual({
      colegioNombre,
      titulo,
      subtitulo,
      columnas: cols,
      filas,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth scroll="paper" className="rg-alum-modal" sx={REPORTE_GENERAL_DIALOG_SX}>
      <DialogTitle className="rg-alum-modal__title">
        <span>Reporte Mensual de Asistencia</span>
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
            <p className="rg-asist-mes-leyenda">
              <span className="rg-asist-mes-mark rg-asist-mes-mark--p">P</span> Presente
              <span className="rg-asist-mes-mark rg-asist-mes-mark--f">F</span> Falta
              <span className="rg-asist-mes-mark rg-asist-mes-mark--t">T</span> Tardanza
              <span className="rg-asist-mes-mark rg-asist-mes-mark--tj">TJ</span> Tardanza justificada
              <span className="rg-asist-mes-mark rg-asist-mes-mark--fj">FJ</span> Falta justificada
            </p>
            {!hayDatos ? (
              <Typography color="text.secondary" align="center" py={4}>
                No hay alumnos matriculados en este grupo.
              </Typography>
            ) : (
              <div className="rg-alum-lista-table-wrap rg-asist-mes-table-wrap">
                <table className="rg-alum-lista-table rg-asist-mes-table">
                  <thead>
                    <tr>
                      <th rowSpan={2} className="rg-asist-mes-col-nombre">
                        Apellidos y nombres
                      </th>
                      {cols.map((c) => (
                        <th key={`dow-${c.fecha}`} className="rg-asist-mes-col-dia">
                          {c.dia_semana}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      {cols.map((c) => (
                        <th key={`num-${c.fecha}`} className="rg-asist-mes-col-dia">
                          {c.dia_numero}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(filas || []).map((f, i) => (
                      <tr key={`${f.matricula_id}-${i}`}>
                        <td className="rg-asist-mes-col-nombre">{f.alumno_nombre}</td>
                        {(f.marcas || []).map((cod, j) => (
                          <td key={`${f.matricula_id}-${j}`} className="rg-asist-mes-col-dia">
                            <span className={`rg-asist-mes-mark ${claseCodigoAsistencia(cod)}`}>{cod}</span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {hayDatos && typeof total === 'number' ? (
              <p className="rg-maestros-aula-total">
                Total alumnos: <strong>{total}</strong>
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
