import React, { useMemo } from 'react';
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
import { generarPdfAlumnosDeudoresPagadores } from '../../../utils/pdfAlumnosDeudoresPagadores';
import { REPORTE_GENERAL_DIALOG_SX } from './reporteDialogProps';

function fmtMonto(n, moneda) {
  if (n == null || n === '') return '—';
  const v = parseFloat(n);
  if (Number.isNaN(v)) return '—';
  return `${moneda || 'S/'} ${v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function agruparPorGrado(filas) {
  const map = new Map();
  for (const r of filas || []) {
    const key = r.grado_agrupacion_key || `${r.nivel_id}|${r.grado}`;
    const titulo = r.grado_agrupacion_titulo || r.grado_seccion || '—';
    if (!map.has(key)) map.set(key, { titulo, filas: [] });
    map.get(key).filas.push(r);
  }
  return [...map.values()];
}

export default function ModalDeudoresPagadores({
  open,
  onClose,
  loading,
  modo,
  colegioNombre,
  anio,
  concepto,
  sede_etiqueta,
  moneda,
  filas,
  total_registros,
  total_monto,
}) {
  const secciones = useMemo(() => agruparPorGrado(filas), [filas]);
  const hayDatos = (filas || []).length > 0;
  const tituloModal = modo === 'pagador' ? 'Alumnos pagadores' : 'Alumnos deudores';

  const exportPdf = async () => {
    await generarPdfAlumnosDeudoresPagadores({
      colegioNombre,
      anio,
      moneda,
      concepto,
      sede_etiqueta,
      modo,
      filas,
      total_registros,
      total_monto,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth scroll="paper" className="rg-alum-modal" sx={REPORTE_GENERAL_DIALOG_SX}>
      <DialogTitle className="rg-alum-modal__title">
        <span>
          {tituloModal} {anio ? `— ${anio}` : ''}
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
        ) : (
          <>
            <p className="rg-alum-modal__subtitle">
              Concepto: <strong>{concepto || '—'}</strong>
              {sede_etiqueta ? (
                <>
                  {' '}
                  · Sede: <strong>{sede_etiqueta}</strong>
                </>
              ) : null}
              {typeof total_registros === 'number'
                ? ` · ${total_registros} registro${total_registros === 1 ? '' : 's'}`
                : ''}
              {typeof total_monto === 'number' ? ` · Monto total: ${fmtMonto(total_monto, moneda)}` : ''}
            </p>
            {!hayDatos ? (
              <Typography color="text.secondary" align="center" py={4}>
                No hay registros con los filtros seleccionados.
              </Typography>
            ) : (
              secciones.map((sec) => (
                <div key={sec.titulo} className="rg-deudores-seccion">
                  <h3 className="rg-deudores-seccion__titulo">{sec.titulo}</h3>
                  <div className="rg-alum-lista-table-wrap">
                    <table className="rg-alum-lista-table rg-deudores-table">
                      <thead>
                        <tr>
                          <th>Alumno</th>
                          <th>Grupo</th>
                          <th>DNI</th>
                          <th>Concepto</th>
                          <th>Monto</th>
                          <th>Tel. apoderado</th>
                          <th>Email apoderado</th>
                          <th>Dirección</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sec.filas.map((f, i) => (
                          <tr key={`${f.matricula_id}-${f.concepto}-${i}`}>
                            <td>{f.alumno_nombre}</td>
                            <td>{f.grado_seccion}</td>
                            <td className="col-num">{f.nro_documento}</td>
                            <td>{f.concepto}</td>
                            <td className="col-num">{fmtMonto(f.monto, moneda)}</td>
                            <td>{f.telefono_apoderado || '—'}</td>
                            <td>{f.email_apoderado || '—'}</td>
                            <td>{f.direccion || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
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
