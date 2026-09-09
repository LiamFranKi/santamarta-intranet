import React, { useEffect, useMemo, useState } from 'react';
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
import Swal from 'sweetalert2';
import { REPORTE_GENERAL_DIALOG_SX } from './reporteDialogProps';
import HorarioDocenteTabla from './HorarioDocenteTabla';
import { exportarHorariosPersonalPdf } from '../../../utils/exportHorariosPersonalPdf';

export default function ModalHorariosPersonal({
  open,
  onClose,
  loading,
  colegioNombre,
  anio,
  docentes,
  total,
}) {
  const lista = docentes || [];
  const hayDatos = lista.length > 0;
  const [activoId, setActivoId] = useState(null);

  useEffect(() => {
    if (!open) return;
    const ids = (docentes || []).map((d) => Number(d.personal_id));
    setActivoId((prev) => {
      if (prev != null && ids.includes(Number(prev))) return prev;
      return docentes?.[0]?.personal_id ?? null;
    });
  }, [open, docentes]);

  const activo = useMemo(
    () => lista.find((d) => Number(d.personal_id) === Number(activoId)) || lista[0] || null,
    [lista, activoId]
  );

  const exportPdf = async () => {
    try {
      await exportarHorariosPersonalPdf({
        docentes: lista,
        anio,
        colegioNombre,
      });
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo generar el PDF',
        text: e.message || 'Error al exportar.',
      });
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
        <span>Horarios del personal</span>
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
            No hay docentes con horario de clases para estos filtros.
          </Typography>
        ) : (
          <div className="rg-hp-preview">
            <aside className="rg-hp-preview__list" aria-label="Docentes">
              <p className="rg-hp-preview__count">
                {total} {total === 1 ? 'docente' : 'docentes'} · año {anio}
              </p>
              {lista.map((d) => (
                <button
                  key={d.personal_id}
                  type="button"
                  className={`rg-hp-preview__item ${
                    Number(activo?.personal_id) === Number(d.personal_id) ? 'is-on' : ''
                  }`}
                  onClick={() => setActivoId(d.personal_id)}
                >
                  {d.nombre}
                </button>
              ))}
            </aside>
            <div className="rg-hp-preview__grid">
              {activo ? (
                <>
                  <header className="rg-hp-preview__head">
                    <p className="rg-hp-preview__kicker">Horario de clases</p>
                    <h3>{activo.nombre}</h3>
                    <p>Lunes a viernes · curso y grado en cada hora</p>
                  </header>
                  <HorarioDocenteTabla clases={activo.clases} />
                </>
              ) : null}
            </div>
          </div>
        )}
      </DialogContent>
      <DialogActions className="rg-alum-modal__actions">
        <Button onClick={onClose}>Cerrar</Button>
        <Button
          variant="contained"
          startIcon={<PictureAsPdfIcon />}
          disabled={!hayDatos || loading}
          onClick={exportPdf}
        >
          Exportar PDF
        </Button>
      </DialogActions>
    </Dialog>
  );
}
