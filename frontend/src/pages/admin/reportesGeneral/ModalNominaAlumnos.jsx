import React, { useLayoutEffect, useRef, useState } from 'react';
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
import { REPORTE_GENERAL_DIALOG_SX } from './reporteDialogProps';
import {
  generarPdfNominaUnGrupo,
  generarPdfNominaTodosGrupos,
  NUM_CUADROS_NOMINA,
} from '../../../utils/pdfNominaAlumnosGrupo';

const COL_NUM_PX = 36;
const NAME_MIN_PX = 200;
const NAME_RATIO = 0.34;
const CUADRO_CELL_PX = 24;

function calcularCuadros(anchoContenedor) {
  if (!anchoContenedor || anchoContenedor < 320) return NUM_CUADROS_NOMINA;
  const nameW = Math.min(Math.max(NAME_MIN_PX, anchoContenedor * NAME_RATIO), 320);
  const disponible = anchoContenedor - COL_NUM_PX - nameW;
  const extra = Math.floor(disponible / CUADRO_CELL_PX);
  return Math.max(NUM_CUADROS_NOMINA, extra);
}

function TablaNominaPreview({ filas }) {
  const wrapRef = useRef(null);
  const [numCuadros, setNumCuadros] = useState(NUM_CUADROS_NOMINA);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;

    const actualizar = () => {
      setNumCuadros(calcularCuadros(el.clientWidth));
    };

    actualizar();
    const ro = new ResizeObserver(actualizar);
    ro.observe(el);
    return () => ro.disconnect();
  }, [filas?.length]);

  return (
    <div className="rg-nomina-table-wrap" ref={wrapRef}>
      <table className="rg-nomina-table">
        <colgroup>
          <col className="rg-nomina-col-num" />
          <col className="rg-nomina-col-nombres" />
          {Array.from({ length: numCuadros }, (_, i) => (
            <col key={i} className="rg-nomina-col-cuadro" />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th className="rg-nomina-col-num">N°</th>
            <th className="rg-nomina-col-nombres">Apellidos y Nombres</th>
            {Array.from({ length: numCuadros }, (_, i) => (
              <th key={i} className="rg-nomina-col-cuadro" aria-hidden="true" />
            ))}
          </tr>
        </thead>
        <tbody>
          {(filas || []).map((f) => (
            <tr key={`${f.n}-${f.alumno_nombre}`}>
              <td className="rg-nomina-col-num">{f.n}</td>
              <td className="rg-nomina-col-nombres" title={f.alumno_nombre}>
                {f.alumno_nombre}
              </td>
              {Array.from({ length: numCuadros }, (_, i) => (
                <td key={i} className="rg-nomina-col-cuadro" />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ModalNominaAlumnos({
  open,
  onClose,
  loading,
  modo,
  colegioNombre,
  titulo,
  filas,
  totales,
  bloques,
  totalesGenerales,
  anio,
}) {
  const hayDatos =
    modo === 'todos'
      ? (bloques || []).some((b) => (b.filas || []).length > 0)
      : (filas || []).length > 0;

  const handleExport = async () => {
    try {
      if (modo === 'todos') {
        await generarPdfNominaTodosGrupos({
          colegioNombre,
          bloques: bloques || [],
          anio: anio ? parseInt(anio, 10) : undefined,
        });
      } else {
        await generarPdfNominaUnGrupo({
          colegioNombre,
          titulo,
          filas: filas || [],
          anio: anio ? parseInt(anio, 10) : undefined,
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xl"
      fullWidth
      scroll="paper"
      className="rg-alum-modal rg-nomina-modal"
      sx={REPORTE_GENERAL_DIALOG_SX}
    >
      <DialogTitle className="rg-alum-modal__title">
        <span>{modo === 'todos' ? 'Nóminas de alumnos — todos los grados' : 'Registro académico'}</span>
        <IconButton aria-label="Cerrar" onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers className="rg-alum-modal__content rg-nomina-modal__content">
        {loading ? (
          <Box display="flex" justifyContent="center" py={6}>
            <CircularProgress />
          </Box>
        ) : modo === 'todos' ? (
          <>
            {!hayDatos ? (
              <Typography color="text.secondary" align="center" py={4}>
                No hay alumnos matriculados con los filtros seleccionados.
              </Typography>
            ) : (
              (bloques || []).map((bloque) => (
                <section key={bloque.grupo_id || bloque.titulo} className="rg-alum-bloque">
                  <h3 className="rg-alum-bloque__title">{bloque.titulo}</h3>
                  <TablaNominaPreview filas={bloque.filas} />
                  <p className="rg-maestros-aula-total">
                    Alumnos: <strong>{bloque.totales?.total ?? (bloque.filas || []).length}</strong>
                  </p>
                </section>
              ))
            )}
            {hayDatos && totalesGenerales ? (
              <p className="rg-maestros-aula-total rg-nomina-total-general">
                Total general: <strong>{totalesGenerales.total ?? 0}</strong> alumnos
              </p>
            ) : null}
          </>
        ) : (
          <>
            {titulo ? (
              <p className="rg-alum-modal__subtitle rg-alum-modal__subtitle--strong">{titulo}</p>
            ) : null}
            <p className="rg-alum-modal__hint">
              Vista previa del registro académico. Los cuadros vacíos se imprimen en el PDF para anotaciones
              manuales.
            </p>
            {!hayDatos ? (
              <Typography color="text.secondary" align="center" py={4}>
                No hay alumnos matriculados en este grupo.
              </Typography>
            ) : (
              <>
                <TablaNominaPreview filas={filas} />
                {totales ? (
                  <p className="rg-maestros-aula-total">
                    Total: <strong>{totales.total ?? filas.length}</strong> alumnos
                  </p>
                ) : null}
              </>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions className="rg-alum-modal__actions">
        <Button onClick={onClose} variant="outlined" color="inherit">
          Cerrar
        </Button>
        <Button
          onClick={handleExport}
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
