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
import { generarPdfResumenAlumnosMatriculados } from '../../../utils/pdfResumenAlumnosMatriculados';
import { REPORTE_GENERAL_DIALOG_SX } from './reporteDialogProps';

function TablaNivel({ seccion }) {
  return (
    <section className="rg-resumen-seccion">
      <h3 className="rg-resumen-seccion__title">{seccion.nivel}</h3>
      <div className="rg-alum-lista-table-wrap">
        <table className="rg-alum-lista-table rg-resumen-table">
          <thead>
            <tr>
              <th className="col-grupo">Grupo</th>
              <th>Hombres</th>
              <th>Mujeres</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {(seccion.filas || []).map((f) => (
              <tr key={f.grupo}>
                <td className="col-grupo">{f.grupo}</td>
                <td className="col-num">{f.hombres}</td>
                <td className="col-num">{f.mujeres}</td>
                <td className="col-num">{f.total}</td>
              </tr>
            ))}
            <tr className="rg-resumen-table__total-row">
              <td className="col-grupo">
                <strong>TOTAL</strong>
              </td>
              <td className="col-num">
                <strong>{seccion.totales?.hombres ?? 0}</strong>
              </td>
              <td className="col-num">
                <strong>{seccion.totales?.mujeres ?? 0}</strong>
              </td>
              <td className="col-num">
                <strong>{seccion.totales?.total ?? 0}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function ModalResumenAlumnosMatriculados({
  open,
  onClose,
  loading,
  colegioNombre,
  anio,
  secciones,
  total_general,
}) {
  const hayDatos = (secciones || []).some((s) => (s.filas || []).length > 0);

  const exportPdf = async () => {
    await generarPdfResumenAlumnosMatriculados({
      colegioNombre,
      anio,
      secciones,
      total_general,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth scroll="paper" className="rg-alum-modal" sx={REPORTE_GENERAL_DIALOG_SX}>
      <DialogTitle className="rg-alum-modal__title">
        <span>Resumen alumnos matriculados {anio ? `— ${anio}` : ''}</span>
        <IconButton aria-label="Cerrar" onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers className="rg-alum-modal__content">
        {loading ? (
          <Box display="flex" justifyContent="center" py={6}>
            <CircularProgress />
          </Box>
        ) : !hayDatos ? (
          <Typography color="text.secondary" align="center" py={4}>
            No hay datos de matrícula para los filtros seleccionados.
          </Typography>
        ) : (
          <>
            {(secciones || []).map((sec) => (
              <TablaNivel key={sec.nivel} seccion={sec} />
            ))}
            {total_general ? (
              <div className="rg-resumen-general">
                <table className="rg-resumen-general-table">
                  <tbody>
                    <tr>
                      <td>
                        <strong>TOTAL GENERAL</strong>
                      </td>
                      <td>{total_general.hombres}</td>
                      <td>{total_general.mujeres}</td>
                      <td>{total_general.total}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
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
