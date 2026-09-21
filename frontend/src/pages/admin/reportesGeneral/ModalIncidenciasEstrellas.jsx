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
import TableChartIcon from '@mui/icons-material/TableChart';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import api from '../../../services/api';
import Swal from 'sweetalert2';
import { generarPdfIncidenciasEstrellas } from '../../../utils/pdfIncidenciasEstrellas';
import { REPORTE_GENERAL_DIALOG_SX } from './reporteDialogProps';

export default function ModalIncidenciasEstrellas({
  open,
  onClose,
  loading,
  data,
  anio,
  bimestre,
  sedeId,
  nivelId,
  grado,
  docenteId,
  categoria,
  desde,
  hasta,
}) {
  const [exporting, setExporting] = useState(false);
  const grupos = data?.grupos || [];
  const kpis = data?.kpis || {};
  const hayDatos = grupos.length > 0;
  const [abiertos, setAbiertos] = useState(() => new Set());

  useEffect(() => {
    const lista = data?.grupos || [];
    if (!open || !lista.length) {
      setAbiertos(new Set());
      return;
    }
    setAbiertos(new Set(lista.slice(0, 2).map((g) => g.grupo_id)));
  }, [open, data]);

  const toggleGrupo = (id) => {
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const kpiCards = useMemo(() => {
    const all = [
      { id: 'incidencias', label: 'Incidencias', value: kpis.incidencias ?? 0, tone: 'amber' },
      { id: 'vestimenta', label: 'Vestimenta', value: kpis.vestimenta ?? 0, tone: 'indigo' },
      { id: 'olvido_qr', label: 'Olvido QR', value: kpis.olvido_qr ?? 0, tone: 'violet' },
      { id: 'estrellas', label: 'Estrellas', value: kpis.estrellas ?? 0, tone: 'teal' },
      {
        id: 'puntos',
        label: 'Pts. dados / desc.',
        value: kpis.puntos_label || `${kpis.puntos_estrellas ?? 0} / −${kpis.puntos_descontados ?? 0}`,
        tone: 'blue',
      },
      { id: 'alumnos', label: 'Alumnos', value: kpis.alumnos ?? 0, tone: 'indigo' },
    ];
    if (categoria === 'estrellas') {
      return all.filter((c) => c.id === 'estrellas' || c.id === 'puntos' || c.id === 'alumnos');
    }
    if (categoria === 'incidencias') {
      return all.filter((c) => c.id !== 'estrellas' && c.id !== 'puntos');
    }
    return all;
  }, [kpis, categoria]);

  const armarParams = () => {
    const params = { anio: data?.anio || anio };
    if (bimestre) params.bimestre = bimestre;
    if (sedeId) params.sede_id = sedeId;
    if (nivelId) params.nivel_id = nivelId;
    if (grado) params.grado = grado;
    if (docenteId) params.docente_id = docenteId;
    if (categoria) params.categoria = categoria;
    if (desde) params.desde = desde;
    if (hasta) params.hasta = hasta;
    return params;
  };

  const exportPdf = async () => {
    if (!hayDatos) return;
    setExporting(true);
    try {
      await generarPdfIncidenciasEstrellas({ data });
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error al exportar',
        text: e.message || 'No se pudo generar el PDF.',
      });
    } finally {
      setExporting(false);
    }
  };

  const exportExcel = async () => {
    if (!(data?.anio || anio)) return;
    setExporting(true);
    try {
      const res = await api.get('/admin/reportes/general/incidencias-estrellas/excel', {
        params: armarParams(),
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
      a.download = `incidencias_estrellas_${data?.bimestre_label || 'todos'}_${data?.anio || anio}.xlsx`;
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
        <span>Incidencias y estrellas</span>
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
            {data?.titulo ? (
              <p className="rg-alum-modal__subtitle rg-alum-modal__subtitle--strong">{data.titulo}</p>
            ) : null}
            {data?.colegio_nombre || data?.subtitulo ? (
              <p className="rg-alum-modal__subtitle rg-alum-modal__subtitle--muted">
                {[data?.colegio_nombre, data?.subtitulo].filter(Boolean).join('  ·  ')}
              </p>
            ) : null}

            {hayDatos ? (
              <div className="rg-exam-kpis rg-exam-kpis--6">
                {kpiCards.map((c) => (
                  <div key={c.label} className={`rg-exam-kpi rg-exam-kpi--${c.tone}`}>
                    <span className="rg-exam-kpi__label">{c.label}</span>
                    <strong className="rg-exam-kpi__value">{c.value}</strong>
                  </div>
                ))}
              </div>
            ) : null}

            {!hayDatos ? (
              <Typography color="text.secondary" align="center" py={4}>
                No hay incidencias ni estrellas para los filtros seleccionados.
              </Typography>
            ) : (
              <div className="rg-exam-grupos">
                {grupos.map((g) => {
                  const abierto = abiertos.has(g.grupo_id);
                  return (
                    <section key={g.grupo_id} className="rg-exam-grupo">
                      <button type="button" className="rg-inc-grupo-toggle" onClick={() => toggleGrupo(g.grupo_id)}>
                        <h3>{g.etiqueta}</h3>
                        <span className="rg-exam-chip">{(g.registros || []).length} registro(s)</span>
                        <ExpandMoreIcon
                          className={`rg-exam-card__caret${abierto ? ' is-open' : ''}`}
                          fontSize="small"
                        />
                      </button>
                      {abierto ? (
                        <div className="rg-alum-lista-table-wrap rg-exam-table-wrap">
                          <table className="rg-alum-lista-table rg-exam-table rg-inc-table">
                            <thead>
                              <tr>
                                <th>Aula</th>
                                <th>Fecha</th>
                                <th>Hora</th>
                                <th>Tipo</th>
                                <th>Alumno</th>
                                <th>Registró</th>
                                <th>Origen</th>
                                <th>Detalle</th>
                                <th className="col-num">Puntos</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(g.registros || []).map((ev) => (
                                <tr key={ev.id} className={`rg-inc-row rg-inc-row--${ev.tipo}`}>
                                  <td className="rg-inc-aula">{ev.aula || g.aula || g.etiqueta}</td>
                                  <td>{ev.fecha}</td>
                                  <td>{ev.hora}</td>
                                  <td>
                                    <span className={`rg-inc-tipo rg-inc-tipo--${ev.tipo}`}>{ev.tipo_label}</span>
                                  </td>
                                  <td className="rg-inc-alumno">{ev.alumno_nombre}</td>
                                  <td>{ev.registrado_por}</td>
                                  <td>{ev.origen}</td>
                                  <td className="rg-inc-detalle">{ev.descripcion}</td>
                                  <td
                                    className={`col-num rg-inc-pts${
                                      Number(ev.puntos) < 0
                                        ? ' rg-inc-pts--menos'
                                        : Number(ev.puntos) > 0
                                          ? ' rg-inc-pts--mas'
                                          : ''
                                    }`}
                                  >
                                    {ev.puntos_label || (ev.puntos != null ? ev.puntos : '—')}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                    </section>
                  );
                })}
              </div>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions className="rg-alum-modal__actions">
        <Button onClick={onClose} variant="outlined" color="inherit">
          Cerrar
        </Button>
        <Button
          onClick={exportExcel}
          variant="contained"
          disabled={!hayDatos || exporting}
          startIcon={exporting ? <CircularProgress size={16} color="inherit" /> : <TableChartIcon />}
          className="rg-btn-excel"
        >
          Excel
        </Button>
        <Button
          onClick={exportPdf}
          variant="contained"
          disabled={!hayDatos || exporting}
          startIcon={<PictureAsPdfIcon />}
          className="rg-btn-pdf"
        >
          PDF
        </Button>
      </DialogActions>
    </Dialog>
  );
}
