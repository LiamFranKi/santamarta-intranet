import React, { useState } from 'react';
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
import TableChartIcon from '@mui/icons-material/TableChart';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import api from '../../../services/api';
import Swal from 'sweetalert2';
import { REPORTE_GENERAL_DIALOG_SX } from './reporteDialogProps';

const COLS = [
  { key: 'tardanzas', label: 'Tardanzas', hint: 'T + justificadas', tone: 't' },
  { key: 'tardanzas_no_just', label: 'Tard. no just.', hint: 'Solo T', tone: 't' },
  { key: 'faltas', label: 'Faltas', hint: 'F + justificadas', tone: 'f' },
  { key: 'faltas_no_just', label: 'Faltas no just.', hint: 'Solo F', tone: 'f' },
  { key: 'no_justificadas', label: 'No justificadas', hint: 'T + F', tone: 'nj' },
];

function Cifra({ valor, tone, onClick, titulo }) {
  const n = Number(valor) || 0;
  if (n <= 0) {
    return <span className="rg-asist-cons-zero">0</span>;
  }
  return (
    <button
      type="button"
      className={`rg-asist-cons-num rg-asist-cons-num--${tone}`}
      onClick={onClick}
      title={titulo}
    >
      {n}
    </button>
  );
}

export default function ModalAsistenciaConsolidado({
  open,
  onClose,
  loading,
  data,
  anio,
  mes,
  sedeId,
  turnoId,
}) {
  const [exporting, setExporting] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [detalleLoading, setDetalleLoading] = useState(false);

  React.useEffect(() => {
    if (!open) setDetalle(null);
  }, [open, data]);

  const abrirDetalle = async (fila, tipo) => {
    setDetalleLoading(true);
    setDetalle({ aula: fila.aula, tipo, filas: [] });
    try {
      const params = {
        anio,
        mes,
        grupo_id: fila.grupo_id,
        tipo,
      };
      const res = await api.get('/admin/reportes/general/asistencia-consolidado/detalle', { params });
      setDetalle(res.data);
    } catch (e) {
      setDetalle(null);
      Swal.fire({
        icon: 'error',
        title: 'No se pudo abrir el detalle',
        text: e.response?.data?.error || e.message,
      });
    } finally {
      setDetalleLoading(false);
    }
  };

  const exportExcel = async () => {
    if (!anio || !mes) return;
    setExporting(true);
    try {
      const params = { anio, mes };
      if (sedeId) params.sede_id = sedeId;
      if (turnoId) params.turno_id = turnoId;
      const res = await api.get('/admin/reportes/general/asistencia-consolidado/excel', {
        params,
        responseType: 'blob',
      });
      const contentType = res.headers?.['content-type'] || '';
      if (contentType.includes('application/json')) {
        const text = await res.data.text();
        const json = JSON.parse(text);
        throw new Error(json.error || 'No se pudo exportar el Excel.');
      }
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `consolidado_asistencia_${data?.mes_nombre || mes}_${anio}.xlsx`.replace(/\s+/g, '_');
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error al exportar',
        text: e.response?.data?.error || e.message || 'No se pudo generar el Excel.',
      });
    } finally {
      setExporting(false);
    }
  };

  const tot = data?.totales;
  const bloques = data?.bloques || [];
  const enDetalle = Boolean(detalle);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      scroll="paper"
      className="rg-alum-modal rg-asist-cons-modal"
      sx={REPORTE_GENERAL_DIALOG_SX}
    >
      <DialogTitle className="rg-alum-modal__title">
        <span>{enDetalle ? detalle.aula || 'Detalle' : 'Consolidado de asistencia'}</span>
        <IconButton aria-label="Cerrar" onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers className="rg-alum-modal__content">
        {loading ? (
          <Box display="flex" justifyContent="center" py={6}>
            <CircularProgress />
          </Box>
        ) : enDetalle ? (
          <div className="rg-asist-cons-detalle">
            <button type="button" className="rg-asist-cons-back" onClick={() => setDetalle(null)}>
              <ArrowBackIcon fontSize="small" /> Volver al consolidado
            </button>
            <p className="rg-alum-modal__subtitle">
              {detalle.etiqueta || 'Detalle'} · {detalle.aula}
            </p>
            {detalleLoading ? (
              <Box display="flex" justifyContent="center" py={5}>
                <CircularProgress />
              </Box>
            ) : !(detalle.filas || []).length ? (
              <Typography color="text.secondary" align="center" py={4}>
                No hay registros en este recuento.
              </Typography>
            ) : (
              <div className="rg-alum-lista-table-wrap">
                <table className="rg-alum-lista-table rg-asist-cons-det-table">
                  <thead>
                    <tr>
                      <th>N.º</th>
                      <th>Alumno</th>
                      <th>Día</th>
                      <th>Tipo</th>
                      <th>Hora</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detalle.filas || []).map((r, i) => (
                      <tr key={`${r.matricula_id}-${r.fecha}-${i}`}>
                        <td>{i + 1}</td>
                        <td>{r.alumno_nombre}</td>
                        <td className="rg-asist-cons-fecha">{r.fecha_texto}</td>
                        <td>
                          <span className={`rg-asist-cons-badge rg-asist-cons-badge--${String(r.codigo || '').toLowerCase()}`}>
                            {r.tipo_etiqueta}
                          </span>
                        </td>
                        <td className="rg-asist-cons-hora">
                          {r.codigo === 'T' || r.codigo === 'TJ' ? (r.hora || '—') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : !data || !bloques.length ? (
          <Typography color="text.secondary" align="center" py={4}>
            No hay aulas para esos filtros.
          </Typography>
        ) : (
          <>
            <p className="rg-alum-modal__subtitle">{data.subtitulo}</p>
            <p className="rg-asist-cons-hint">Clic en un número o en el aula para ver quiénes y en qué día. En tardanza también sale la hora marcada.</p>
            <div className="rg-asist-cons-chips">
              <span className="rg-asist-cons-chip">{data.aulas} aulas</span>
              <span className="rg-asist-cons-chip">{tot?.alumnos || 0} alumnos</span>
              <span className="rg-asist-cons-chip rg-asist-cons-chip--t">{tot?.tardanzas || 0} tardanzas</span>
              <span className="rg-asist-cons-chip rg-asist-cons-chip--f">{tot?.faltas || 0} faltas</span>
              <span className="rg-asist-cons-chip rg-asist-cons-chip--nj">{tot?.no_justificadas || 0} no just.</span>
            </div>
            <div className="rg-alum-lista-table-wrap">
              <table className="rg-alum-lista-table rg-asist-cons-table">
                <thead>
                  <tr>
                    <th className="rg-asist-cons-aula">Aula</th>
                    <th>Alumnos</th>
                    {COLS.map((c) => (
                      <th key={c.key} title={c.hint}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bloques.map((b) => (
                    <React.Fragment key={`${b.nivel_id}-${b.nivel_nombre}`}>
                      <tr className="rg-asist-cons-nivel">
                        <td colSpan={2 + COLS.length}>{b.nivel_nombre}</td>
                      </tr>
                      {b.filas.map((f) => (
                        <tr key={f.grupo_id}>
                          <td className="rg-asist-cons-aula">
                            <button
                              type="button"
                              className="rg-asist-cons-aula-btn"
                              onClick={() => abrirDetalle(f, 'todas')}
                            >
                              {f.aula}
                              {f.turno_nombre ? <em>{f.turno_nombre}</em> : null}
                            </button>
                          </td>
                          <td>{f.alumnos}</td>
                          {COLS.map((c) => (
                            <td key={c.key}>
                              <Cifra
                                valor={f[c.key]}
                                tone={c.tone}
                                titulo={`${c.label} de ${f.aula}`}
                                onClick={() => abrirDetalle(f, c.key)}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                      <tr className="rg-asist-cons-subtot">
                        <td>Subtotal {b.nivel_nombre}</td>
                        <td>{b.totales?.alumnos || 0}</td>
                        {COLS.map((c) => (
                          <td key={c.key}>{b.totales?.[c.key] || 0}</td>
                        ))}
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td>{tot?.alumnos || 0}</td>
                    {COLS.map((c) => (
                      <td key={c.key}>{tot?.[c.key] || 0}</td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </DialogContent>
      <DialogActions>
        {!enDetalle && data && bloques.length > 0 && (
          <Button
            startIcon={<TableChartIcon />}
            onClick={exportExcel}
            disabled={exporting}
            className="rg-alum-btn rg-alum-btn--excel"
          >
            {exporting ? 'Exportando…' : 'Exportar Excel'}
          </Button>
        )}
        <Button onClick={onClose}>Cerrar</Button>
      </DialogActions>
    </Dialog>
  );
}
