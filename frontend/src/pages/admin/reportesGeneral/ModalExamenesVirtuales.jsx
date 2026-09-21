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
import { generarPdfExamenesVirtuales } from '../../../utils/pdfExamenesVirtuales';
import { REPORTE_GENERAL_DIALOG_SX } from './reporteDialogProps';

function fmtNum(v) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export default function ModalExamenesVirtuales({
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
    const first = lista[0]?.asignaturas?.[0]?.examenes?.[0]?.examen_id;
    setAbiertos(first ? new Set([first]) : new Set());
  }, [open, data]);

  const toggleExamen = (id) => {
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const kpiCards = useMemo(
    () => [
      { label: 'Publicados', value: kpis.total_examenes ?? 0, tone: 'blue' },
      { label: 'Con rendición', value: kpis.examenes_rendidos ?? 0, tone: 'teal' },
      { label: 'Sin rendir', value: kpis.examenes_sin_rendir ?? 0, tone: 'amber' },
      { label: 'Alumnos que rindieron', value: kpis.alumnos_rindieron ?? 0, tone: 'indigo' },
      { label: 'Promedio general', value: fmtNum(kpis.promedio_general), tone: 'violet' },
    ],
    [kpis]
  );

  const exportPdf = async () => {
    if (!hayDatos) return;
    setExporting(true);
    try {
      await generarPdfExamenesVirtuales({ data });
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
    if (!anio || !bimestre) return;
    setExporting(true);
    try {
      const params = { anio, bimestre };
      if (sedeId) params.sede_id = sedeId;
      if (nivelId) params.nivel_id = nivelId;
      if (grado) params.grado = grado;
      if (docenteId) params.docente_id = docenteId;
      if (desde) params.desde = desde;
      if (hasta) params.hasta = hasta;
      const res = await api.get('/admin/reportes/general/examenes-virtuales/excel', {
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
      a.download = `examenes_virtuales_b${data?.bimestre_label || bimestre}_${anio}.xlsx`;
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
        <span>Exámenes virtuales</span>
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
              <div className="rg-exam-kpis">
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
                No hay exámenes virtuales para los filtros seleccionados.
              </Typography>
            ) : (
              <div className="rg-exam-grupos">
                {grupos.map((g) => (
                  <section key={g.grupo_id} className="rg-exam-grupo">
                    <header className="rg-exam-grupo__head">
                      <h3>{g.etiqueta}</h3>
                    </header>
                    {(g.asignaturas || []).map((asig) => (
                      <div key={asig.asignatura_id} className="rg-exam-asig">
                        <div className="rg-exam-asig__meta">
                          <strong>{asig.curso_nombre}</strong>
                          <span>{asig.docente_nombre}</span>
                        </div>
                        {(asig.examenes || []).map((ex) => {
                          const abierto = abiertos.has(ex.examen_id);
                          return (
                            <article
                              key={ex.examen_id}
                              className={`rg-exam-card${ex.rendidos === 0 ? ' is-empty' : ''}${abierto ? ' is-open' : ''}`}
                            >
                              <button
                                type="button"
                                className="rg-exam-card__toggle"
                                onClick={() => toggleExamen(ex.examen_id)}
                              >
                                <span className="rg-exam-card__title">{ex.titulo}</span>
                                <span className="rg-exam-card__chips">
                                  {ex.tipo ? <span className="rg-exam-chip">{ex.tipo}</span> : null}
                                  <span className="rg-exam-chip">{ex.estado}</span>
                                  <span className="rg-exam-chip">
                                    {ex.fecha_desde} — {ex.fecha_hasta}
                                  </span>
                                  <span className={`rg-exam-chip ${ex.rendidos ? 'is-ok' : 'is-warn'}`}>
                                    {ex.rendidos}/{ex.total_alumnos} rindieron
                                  </span>
                                  <span className="rg-exam-chip">
                                    Prom. {fmtNum(ex.promedio)}
                                  </span>
                                </span>
                                <ExpandMoreIcon
                                  className={`rg-exam-card__caret${abierto ? ' is-open' : ''}`}
                                  fontSize="small"
                                />
                              </button>
                              {abierto ? (
                                <div className="rg-alum-lista-table-wrap rg-exam-table-wrap">
                                  <table className="rg-alum-lista-table rg-exam-table">
                                    <thead>
                                      <tr>
                                        <th className="col-num">N°</th>
                                        <th>Alumno</th>
                                        <th>Estado</th>
                                        <th>Fecha</th>
                                        <th className="col-num">Puntaje</th>
                                        <th className="col-num">Correctas</th>
                                        <th className="col-num">Incorrectas</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(ex.alumnos || []).map((al, i) => (
                                        <tr key={al.matricula_id} className={al.rindio ? '' : 'is-miss'}>
                                          <td className="col-num">{i + 1}</td>
                                          <td>{al.alumno_nombre}</td>
                                          <td>{al.estado}</td>
                                          <td>{al.fecha}</td>
                                          <td className="col-num">{fmtNum(al.puntaje)}</td>
                                          <td className="col-num">{al.correctas ?? '—'}</td>
                                          <td className="col-num">{al.incorrectas ?? '—'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : null}
                            </article>
                          );
                        })}
                      </div>
                    ))}
                  </section>
                ))}
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
