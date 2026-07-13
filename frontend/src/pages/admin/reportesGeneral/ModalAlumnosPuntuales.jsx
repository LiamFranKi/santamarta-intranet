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
import { generarPdfAlumnosPuntuales } from '../../../utils/pdfAlumnosPuntuales';
import { REPORTE_GENERAL_DIALOG_SX } from './reporteDialogProps';

function fmtMonto(n, moneda) {
  if (n == null || n === '') return '—';
  const v = parseFloat(n);
  if (Number.isNaN(v)) return '—';
  return `${moneda || 'S/'} ${v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtFecha(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString('es-PE');
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

export default function ModalAlumnosPuntuales({
  open,
  onClose,
  loading,
  colegioNombre,
  anio,
  mes_etiqueta,
  sede_etiqueta,
  moneda,
  filas,
  total_registros,
  total_monto_pension,
}) {
  const secciones = useMemo(() => agruparPorGrado(filas), [filas]);
  const hayDatos = (filas || []).length > 0;

  const exportPdf = async () => {
    await generarPdfAlumnosPuntuales({
      colegioNombre,
      anio,
      moneda,
      mes_etiqueta,
      sede_etiqueta,
      filas,
      total_registros,
      total_monto_pension,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth scroll="paper" className="rg-alum-modal" sx={REPORTE_GENERAL_DIALOG_SX}>
      <DialogTitle className="rg-alum-modal__title">
        <span>
          Alumnos puntuales {anio ? `— ${anio}` : ''}
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
              Hasta: <strong>{mes_etiqueta || '—'}</strong>
              {sede_etiqueta ? (
                <>
                  {' '}
                  · Sede: <strong>{sede_etiqueta}</strong>
                </>
              ) : null}
              {typeof total_registros === 'number'
                ? ` · ${total_registros} alumno${total_registros === 1 ? '' : 's'}`
                : ''}
              {typeof total_monto_pension === 'number'
                ? ` · Suma pensiones: ${fmtMonto(total_monto_pension, moneda)}`
                : ''}
            </p>
            {!hayDatos ? (
              <Typography color="text.secondary" align="center" py={4}>
                No hay alumnos puntuales con los filtros seleccionados.
              </Typography>
            ) : (
              <>
                {secciones.map((sec) => (
                  <div key={sec.titulo} className="rg-deudores-seccion">
                    <h3 className="rg-deudores-seccion__titulo">{sec.titulo}</h3>
                    <div className="rg-alum-lista-table-wrap">
                      <table className="rg-alum-lista-table rg-deudores-table">
                        <thead>
                          <tr>
                            <th>Alumno</th>
                            <th>Grupo</th>
                            <th>DNI</th>
                            <th>Pensión mensual</th>
                            <th>Fecha pago último mes</th>
                            <th>Tel. apoderado</th>
                            <th>Email apoderado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sec.filas.map((f) => (
                            <tr key={f.matricula_id}>
                              <td>{f.alumno_nombre}</td>
                              <td>{f.grado_seccion}</td>
                              <td className="col-num">{f.nro_documento}</td>
                              <td className="col-num">{fmtMonto(f.monto_pension, moneda)}</td>
                              <td className="col-num">{fmtFecha(f.fecha_pago_ultimo_mes)}</td>
                              <td>{f.telefono_apoderado || '—'}</td>
                              <td>{f.email_apoderado || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
                <p className="rg-maestros-aula-total">
                  <strong>
                    Total de alumnos: {typeof total_registros === 'number' ? total_registros : filas.length}
                  </strong>
                </p>
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
