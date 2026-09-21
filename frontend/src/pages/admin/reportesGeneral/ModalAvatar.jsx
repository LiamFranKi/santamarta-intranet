import React, { useMemo, useState } from 'react';
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
import api from '../../../services/api';
import Swal from 'sweetalert2';
import { generarPdfAvatar } from '../../../utils/pdfAvatar';
import { REPORTE_GENERAL_DIALOG_SX } from './reporteDialogProps';

function medalla(puesto) {
  if (puesto === 1) return '🥇';
  if (puesto === 2) return '🥈';
  if (puesto === 3) return '🥉';
  return '';
}

export default function ModalAvatar({
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
  const ranking = data?.ranking || [];
  const grupos = data?.grupos || [];
  const kpis = data?.kpis || {};
  const hayDatos = ranking.length > 0 || grupos.length > 0;

  const kpiCards = useMemo(
    () => [
      { label: 'Canjes', value: kpis.canjes ?? 0, tone: 'teal' },
      { label: 'Alumnos que canjearon', value: kpis.alumnos_canjearon ?? 0, tone: 'indigo' },
      { label: 'En ranking', value: kpis.alumnos_ranking ?? 0, tone: 'blue' },
      { label: 'Puntos totales', value: kpis.puntos_totales ?? 0, tone: 'violet' },
      { label: '1.er puesto', value: kpis.top_nombre || '—', tone: 'amber' },
      { label: 'Puntos del 1.°', value: kpis.top_puntos ?? 0, tone: 'amber' },
    ],
    [kpis]
  );

  const armarParams = () => {
    const params = { anio: data?.anio || anio };
    if (bimestre) params.bimestre = bimestre;
    if (sedeId) params.sede_id = sedeId;
    if (nivelId) params.nivel_id = nivelId;
    if (grado) params.grado = grado;
    if (docenteId) params.docente_id = docenteId;
    if (desde) params.desde = desde;
    if (hasta) params.hasta = hasta;
    return params;
  };

  const exportPdf = async () => {
    if (!hayDatos) return;
    setExporting(true);
    try {
      await generarPdfAvatar({ data });
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
      const res = await api.get('/admin/reportes/general/avatar/excel', {
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
      a.download = `avatar_${data?.bimestre_label || 'todos'}_${data?.anio || anio}.xlsx`;
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
        <span>Avatar</span>
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
                No hay canjes ni estrellas para los filtros seleccionados.
              </Typography>
            ) : (
              <>
                <section className="rg-av-bloque">
                  <header className="rg-av-bloque__head">
                    <h3>Ranking de estrellas</h3>
                    <span className="rg-exam-chip">{data?.alcance || 'Ranking general'}</span>
                  </header>
                  {ranking.length ? (
                    <div className="rg-alum-lista-table-wrap rg-exam-table-wrap">
                      <table className="rg-alum-lista-table rg-exam-table rg-av-table">
                        <thead>
                          <tr>
                            <th className="col-num">Puesto</th>
                            <th>Aula</th>
                            <th>Alumno</th>
                            <th className="col-num">Puntos</th>
                            <th className="col-num">Canjes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ranking.map((ev) => (
                            <tr
                              key={`${ev.matricula_id}-${ev.alumno_id}`}
                              className={`rg-av-rank rg-av-rank--${ev.puesto <= 3 ? ev.puesto : 'n'}`}
                            >
                              <td className="col-num rg-av-puesto">
                                {medalla(ev.puesto)} {ev.puesto}
                              </td>
                              <td className="rg-inc-aula">{ev.aula}</td>
                              <td className="rg-inc-alumno">{ev.alumno_nombre}</td>
                              <td className="col-num rg-inc-pts rg-inc-pts--mas">{ev.puntos}</td>
                              <td className="col-num">{ev.canjes || 0}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="rg-av-empty">No hay alumnos con estrellas en este alcance.</p>
                  )}
                </section>

                <section className="rg-av-bloque">
                  <header className="rg-av-bloque__head">
                    <h3>Canjes y desbloqueos</h3>
                    <span className="rg-exam-chip">{(data?.canjes || []).length} registro(s)</span>
                  </header>
                  {grupos.length ? (
                    <div className="rg-alum-lista-table-wrap rg-exam-table-wrap">
                      <table className="rg-alum-lista-table rg-exam-table rg-av-table rg-av-table--canjes">
                        <thead>
                          <tr>
                            <th>Aula</th>
                            <th>Fecha</th>
                            <th>Alumno</th>
                            <th>Tipo</th>
                            <th>Ítem</th>
                            <th>Avatar</th>
                            <th className="col-num">Pts. req.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {grupos.flatMap((g) =>
                            (g.registros || []).map((ev) => (
                              <tr key={ev.id} className={`rg-av-canje rg-av-canje--${ev.tipo}`}>
                                <td className="rg-inc-aula">{ev.aula || g.aula}</td>
                                <td>{ev.fecha}</td>
                                <td className="rg-inc-alumno">{ev.alumno_nombre}</td>
                                <td>
                                  <span className={`rg-inc-tipo rg-av-tipo--${ev.tipo}`}>{ev.tipo_label}</span>
                                </td>
                                <td>{ev.item_nombre}</td>
                                <td>{ev.base_nombre}</td>
                                <td className="col-num">{ev.puntos_req ?? '—'}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="rg-av-empty">No hay canjes para los filtros seleccionados.</p>
                  )}
                </section>
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
