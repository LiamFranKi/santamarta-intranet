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
import { generarPdfConducta } from '../../../utils/pdfConducta';
import { REPORTE_GENERAL_DIALOG_SX } from './reporteDialogProps';

function fmt(v) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(2);
}

function claseNota(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 'rg-cond-nota rg-cond-nota--vacia';
  if (n < 13) return 'rg-cond-nota rg-cond-nota--baja';
  if (n < 17) return 'rg-cond-nota rg-cond-nota--media';
  return 'rg-cond-nota rg-cond-nota--alta';
}

function Tarjeta({ etiqueta, valor, detalle }) {
  return (
    <div className="rg-cond-card">
      <span className="rg-cond-card__label">{etiqueta}</span>
      <strong className={claseNota(valor)}>{fmt(valor)}</strong>
      {detalle ? <small>{detalle}</small> : null}
    </div>
  );
}

export default function ModalConducta({ open, onClose, loading, colegioNombre, reporte }) {
  const filas = reporte?.filas || [];
  const promedios = reporte?.promedios || {};
  const registros = reporte?.registros || [];
  const hayDatos = filas.length > 0;
  const enCurso = !!reporte?.b4_en_curso;

  const exportPdf = async () => {
    if (!reporte) return;
    await generarPdfConducta({
      colegioNombre,
      titulo: reporte.titulo,
      subtitulo: reporte.subtitulo,
      filas,
      promedios,
      b4EnCurso: enCurso,
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      scroll="paper"
      className="rg-alum-modal"
      sx={REPORTE_GENERAL_DIALOG_SX}
    >
      <DialogTitle className="rg-alum-modal__title">
        <span>Conducta</span>
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
            {reporte?.titulo ? (
              <p className="rg-alum-modal__subtitle rg-alum-modal__subtitle--strong">{reporte.titulo}</p>
            ) : null}
            {reporte?.subtitulo ? (
              <p className="rg-alum-modal__subtitle rg-alum-modal__subtitle--muted">{reporte.subtitulo}</p>
            ) : null}
            {!hayDatos ? (
              <Typography color="text.secondary" align="center" py={4}>
                No hay alumnos matriculados con esos filtros.
              </Typography>
            ) : (
              <>
                <div className="rg-cond-cards">
                  <Tarjeta etiqueta="Promedio 1.º" valor={promedios.b1} detalle="Final" />
                  <Tarjeta etiqueta="Promedio 2.º" valor={promedios.b2} detalle="Final" />
                  <Tarjeta etiqueta="Promedio 3.º" valor={promedios.b3} detalle="Final" />
                  <Tarjeta
                    etiqueta="Promedio 4.º"
                    valor={promedios.b4}
                    detalle={enCurso ? 'Cómo van ahora' : 'Nota guardada'}
                  />
                  <Tarjeta etiqueta="Promedio general" valor={promedios.general} detalle={`${filas.length} alumnos`} />
                </div>
                <p className="rg-alum-modal__hint">
                  {enCurso
                    ? 'El 1.º, 2.º y 3.º son el promedio final ya cerrado. El 4.º baja desde 20 según las faltas de este bimestre. El promedio general es la media de los bimestres que cada alumno ya tiene.'
                    : 'Cada columna es la nota de conducta guardada de ese bimestre. El promedio general es la media de los bimestres que cada alumno ya tiene.'}
                  {reporte?.detalle_omitido
                    ? ' Elija un salón o un alumno para ver el detalle de cada falta.'
                    : ''}
                </p>
                <div className="rg-alum-lista-table-wrap">
                  <table className="rg-alum-lista-table rg-cond-table">
                    <thead>
                      <tr>
                        <th className="col-num">N.º</th>
                        <th>Apellidos y nombres</th>
                        <th>Salón</th>
                        <th className="col-num">1.º</th>
                        <th className="col-num">2.º</th>
                        <th className="col-num">3.º</th>
                        <th className="col-num">{enCurso ? '4.º ahora' : '4.º'}</th>
                        <th className="col-num">Promedio</th>
                        {enCurso ? <th className="col-num">Faltas 4.º</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {filas.map((f) => (
                        <tr key={f.matricula_id}>
                          <td className="col-num">{f.numero}</td>
                          <td className="rg-cond-nombre">{f.alumno}</td>
                          <td>{f.aula}</td>
                          <td className={`col-num ${claseNota(f.b1)}`}>{fmt(f.b1)}</td>
                          <td className={`col-num ${claseNota(f.b2)}`}>{fmt(f.b2)}</td>
                          <td className={`col-num ${claseNota(f.b3)}`}>{fmt(f.b3)}</td>
                          <td className={`col-num ${claseNota(f.b4)}`}>{fmt(f.b4)}</td>
                          <td className={`col-num ${claseNota(f.promedio)}`}>{fmt(f.promedio)}</td>
                          {enCurso ? <td className="col-num">{f.faltas_b4 ?? 0}</td> : null}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={3}>Promedio de estos alumnos</td>
                        <td className="col-num">{fmt(promedios.b1)}</td>
                        <td className="col-num">{fmt(promedios.b2)}</td>
                        <td className="col-num">{fmt(promedios.b3)}</td>
                        <td className="col-num">{fmt(promedios.b4)}</td>
                        <td className="col-num">{fmt(promedios.general)}</td>
                        {enCurso ? <td /> : null}
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {registros.length > 0 ? (
                  <>
                    <h3 className="rg-cond-detalle-titulo">Faltas del 4.º bimestre</h3>
                    <div className="rg-alum-lista-table-wrap">
                      <table className="rg-alum-lista-table rg-cond-detalle">
                        <thead>
                          <tr>
                            <th>Fecha</th>
                            <th>Alumno</th>
                            <th>Salón</th>
                            <th>Tipo</th>
                            <th>Falta</th>
                            <th className="col-num">Descuento</th>
                          </tr>
                        </thead>
                        <tbody>
                          {registros.map((r, i) => (
                            <tr key={`${r.fecha}-${r.codigo}-${i}`}>
                              <td>{r.hora ? `${r.fecha} ${r.hora}` : r.fecha}</td>
                              <td>{r.alumno}</td>
                              <td>{r.aula}</td>
                              <td>{r.tipo}</td>
                              <td>{r.codigo ? `${r.codigo} · ${r.falta}` : r.falta}</td>
                              <td className="col-num">{fmt(r.descuento)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : null}
              </>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions className="rg-alum-modal__actions">
        <Button onClick={onClose}>Cerrar</Button>
        <Button
          variant="contained"
          startIcon={<PictureAsPdfIcon />}
          onClick={exportPdf}
          disabled={loading || !hayDatos}
        >
          PDF
        </Button>
      </DialogActions>
    </Dialog>
  );
}
