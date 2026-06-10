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
import {
  generarPdfListaAlumnosTodosGrupos,
  generarPdfListaAlumnosUnGrupo,
} from '../../../utils/pdfListaAlumnosMatriculados';

function fmtFecha(iso) {
  if (!iso || iso === '—') return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function TablaLista({ filas }) {
  return (
    <div className="rg-alum-lista-table-wrap">
      <table className="rg-alum-lista-table">
        <thead>
          <tr>
            <th>N°</th>
            <th>Apellidos y nombres</th>
            <th>DNI alumno</th>
            <th>Apoderado</th>
            <th>DNI apoderado</th>
            <th>Fec. nac.</th>
            <th>Teléfono</th>
            <th>Email</th>
          </tr>
        </thead>
        <tbody>
          {(filas || []).map((f) => (
            <tr key={`${f.n}-${f.alumno_dni}`}>
              <td className="col-num">{f.n}</td>
              <td>{f.alumno_nombre}</td>
              <td>{f.alumno_dni}</td>
              <td>{f.apoderado_nombre}</td>
              <td>{f.apoderado_dni}</td>
              <td>{fmtFecha(f.fecha_nacimiento)}</td>
              <td>{f.telefono}</td>
              <td className="col-email">{f.email}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PieTotales({ totales }) {
  if (!totales) return null;
  return (
    <div className="rg-alum-totales" role="group" aria-label="Totales">
      <div className="rg-alum-totales__box">
        <span className="rg-alum-totales__label">Hombres</span>
        <strong>{totales.hombres ?? 0}</strong>
      </div>
      <div className="rg-alum-totales__box">
        <span className="rg-alum-totales__label">Mujeres</span>
        <strong>{totales.mujeres ?? 0}</strong>
      </div>
      <div className="rg-alum-totales__box rg-alum-totales__box--total">
        <span className="rg-alum-totales__label">Total</span>
        <strong>{totales.total ?? 0}</strong>
      </div>
    </div>
  );
}

export default function ModalListaAlumnosMatriculados({
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
  onExportPdf,
}) {
  const handleExport = async () => {
    if (onExportPdf) {
      onExportPdf();
      return;
    }
    try {
      if (modo === 'todos') {
        await generarPdfListaAlumnosTodosGrupos({
          colegioNombre,
          bloques: bloques || [],
          totales_generales: totalesGenerales,
        });
      } else {
        await generarPdfListaAlumnosUnGrupo({
          colegioNombre,
          titulo,
          filas: filas || [],
          totales,
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const hayDatos =
    modo === 'todos'
      ? (bloques || []).some((b) => (b.filas || []).length > 0)
      : (filas || []).length > 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth scroll="paper" className="rg-alum-modal">
      <DialogTitle className="rg-alum-modal__title">
        <span>
          {modo === 'todos' ? 'Lista de alumnos — todos los grados' : 'Lista de alumnos matriculados'}
        </span>
        <IconButton aria-label="Cerrar" onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers className="rg-alum-modal__content">
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
                  <TablaLista filas={bloque.filas} />
                  <PieTotales totales={bloque.totales} />
                </section>
              ))
            )}
            {hayDatos && totalesGenerales ? (
              <div className="rg-alum-totales rg-alum-totales--general">
                <span className="rg-alum-totales-general-label">Total general</span>
                <PieTotales totales={totalesGenerales} />
              </div>
            ) : null}
          </>
        ) : (
          <>
            {titulo ? <p className="rg-alum-modal__subtitle">{titulo}</p> : null}
            {!hayDatos ? (
              <Typography color="text.secondary" align="center" py={4}>
                No hay alumnos matriculados en este grupo.
              </Typography>
            ) : (
              <>
                <TablaLista filas={filas} />
                <PieTotales totales={totales} />
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
