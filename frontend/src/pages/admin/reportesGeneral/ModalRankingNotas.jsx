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
import { generarPdfRankingNotas } from '../../../utils/pdfRankingNotas';
import { REPORTE_GENERAL_DIALOG_SX } from './reporteDialogProps';

function fmtNum(v) {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return n.toFixed(2);
}

function celdaPuntaje(f, modoCualitativo) {
  if (modoCualitativo) return '';
  if (f.puntaje == null || f.puntaje === '') return '';
  return fmtNum(f.puntaje);
}

function celdaPromedio(f, modoCualitativo) {
  if (modoCualitativo) return '';
  if (f.promedio == null || f.promedio === '') return '';
  return fmtNum(f.promedio);
}

function celdaPuesto(f, modoCualitativo) {
  if (modoCualitativo) return '';
  if (f.puesto == null || f.puesto === '') return '';
  return String(f.puesto);
}

export default function ModalRankingNotas({
  open,
  onClose,
  loading,
  colegioNombre,
  titulo,
  subtitulo,
  filas,
  total,
  modoCualitativo,
}) {
  const hayDatos = (filas || []).length > 0;

  const exportPdf = async () => {
    await generarPdfRankingNotas({
      colegioNombre,
      titulo,
      subtitulo,
      filas,
      modoCualitativo,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth scroll="paper" className="rg-alum-modal" sx={REPORTE_GENERAL_DIALOG_SX}>
      <DialogTitle className="rg-alum-modal__title">
        <span>Ranking de Notas</span>
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
            {titulo ? <p className="rg-alum-modal__subtitle rg-alum-modal__subtitle--strong">{titulo}</p> : null}
            {subtitulo ? <p className="rg-alum-modal__subtitle rg-alum-modal__subtitle--muted">{subtitulo}</p> : null}
            {modoCualitativo && hayDatos ? (
              <p className="rg-alum-modal__hint">Nivel cualitativo: listado por apellido sin puntajes ni puestos.</p>
            ) : null}
            {!hayDatos ? (
              <Typography color="text.secondary" align="center" py={4}>
                No hay alumnos matriculados en este grupo.
              </Typography>
            ) : (
              <div className="rg-alum-lista-table-wrap">
                <table className="rg-alum-lista-table rg-ranking-notas-table">
                  <thead>
                    <tr>
                      <th>Apellidos y nombres</th>
                      <th className="col-num">Puntaje</th>
                      <th className="col-num">Promedio</th>
                      <th className="col-num">Puesto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(filas || []).map((f, i) => (
                      <tr key={`${f.alumno_nombre}-${i}`}>
                        <td className="rg-ranking-notas-nombre">{f.alumno_nombre}</td>
                        <td className="col-num">{celdaPuntaje(f, modoCualitativo)}</td>
                        <td className="col-num">{celdaPromedio(f, modoCualitativo)}</td>
                        <td className="col-num">{celdaPuesto(f, modoCualitativo)}</td>
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
