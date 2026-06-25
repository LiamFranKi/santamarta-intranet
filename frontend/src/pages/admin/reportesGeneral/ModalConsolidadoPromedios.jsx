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
  Tabs,
  Tab,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import TableChartIcon from '@mui/icons-material/TableChart';
import api from '../../../services/api';
import Swal from 'sweetalert2';
import { REPORTE_GENERAL_DIALOG_SX } from './reporteDialogProps';

export default function ModalConsolidadoPromedios({
  open,
  onClose,
  loading,
  data,
  anio,
  bimestre,
  sedeId,
  turnoId,
}) {
  const [tabIdx, setTabIdx] = useState(0);
  const [exporting, setExporting] = useState(false);
  const pestanas = data?.pestanas || [];
  const pestana = pestanas[tabIdx] || null;
  const bloques = pestana?.bloques || [];
  const usaBloques = Boolean(pestana?.usa_bloques && bloques.length > 0);
  const columnas = usaBloques
    ? pestana?.columnas_flat || pestana?.columnas || []
    : pestana?.columnas || [];
  const filas = pestana?.filas || [];
  const hayDatos = pestanas.length > 0;

  React.useEffect(() => {
    if (open) setTabIdx(0);
  }, [open, data]);

  const exportExcel = async () => {
    if (!anio || !bimestre) return;
    setExporting(true);
    try {
      const params = { anio, bimestre };
      if (sedeId) params.sede_id = sedeId;
      if (turnoId) params.turno_id = turnoId;

      const res = await api.get('/admin/reportes/general/consolidado-promedios/excel', {
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
      a.download = `consolidado_promedios_b${bimestre}_${anio}.xlsx`;
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
      className="rg-alum-modal rg-consolidado-modal"
      sx={REPORTE_GENERAL_DIALOG_SX}
    >
      <DialogTitle className="rg-alum-modal__title">
        <span>Consolidado de Promedios</span>
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
            {data?.colegio_nombre ? (
              <p className="rg-alum-modal__subtitle rg-alum-modal__subtitle--muted">{data.colegio_nombre}</p>
            ) : null}
            {pestana?.modo_cualitativo ? (
              <p className="rg-alum-modal__hint">
                Inicial: calificaciones cualitativas por indicador (AD, A, B, C).
              </p>
            ) : null}
            {!hayDatos ? (
              <Typography color="text.secondary" align="center" py={4}>
                No hay grupos con alumnos para el año y bimestre seleccionados.
              </Typography>
            ) : (
              <>
                <Tabs
                  value={tabIdx}
                  onChange={(_e, v) => setTabIdx(v)}
                  variant="scrollable"
                  scrollButtons="auto"
                  className="rg-consolidado-tabs"
                >
                  {pestanas.map((p, i) => (
                    <Tab key={p.grupo_id || p.tab_label || i} label={p.tab_label} />
                  ))}
                </Tabs>
                {pestana?.subtitulo ? (
                  <p className="rg-consolidado-tab-sub">{pestana.subtitulo}</p>
                ) : null}
                <div className="rg-alum-lista-table-wrap rg-consolidado-table-wrap">
                  <table className="rg-alum-lista-table rg-consolidado-table">
                    <thead>
                      {usaBloques ? (
                        <>
                          <tr>
                            <th className="rg-consolidado-col-num" rowSpan={2}>
                              N°
                            </th>
                            <th className="rg-consolidado-col-dni" rowSpan={2}>
                              DNI
                            </th>
                            <th className="rg-consolidado-col-nombre" rowSpan={2}>
                              Alumnos
                            </th>
                            {bloques.map((b) => (
                              <th
                                key={`area-${b.area_id || b.asignatura_id || b.curso_nombre}`}
                                className="rg-consolidado-col-area"
                                colSpan={(b.columnas || []).length}
                              >
                                {b.curso_nombre}
                              </th>
                            ))}
                          </tr>
                          <tr>
                            {bloques.flatMap((b) =>
                              (b.columnas || []).map((col) => (
                                <th
                                  key={col.key}
                                  className="rg-consolidado-col-curso"
                                  title={col.titulo || col.label}
                                >
                                  <span className="rg-consolidado-curso-head">{col.label}</span>
                                </th>
                              ))
                            )}
                          </tr>
                        </>
                      ) : (
                        <tr>
                          <th className="rg-consolidado-col-num">N°</th>
                          <th className="rg-consolidado-col-dni">DNI</th>
                          <th className="rg-consolidado-col-nombre">Alumnos</th>
                          {columnas.map((c) => (
                            <th
                              key={c.key}
                              className="rg-consolidado-col-curso"
                              title={
                                c.titulo
                                  ? c.titulo
                                  : c.nombre_curso
                                    ? `${c.nombre_curso} — ${c.nombre}`
                                    : c.nombre
                              }
                            >
                              <span className="rg-consolidado-curso-head">{c.nombre}</span>
                            </th>
                          ))}
                        </tr>
                      )}
                    </thead>
                    <tbody>
                      {filas.map((f) => (
                        <tr key={f.matricula_id}>
                          <td className="rg-consolidado-col-num">{f.numero}</td>
                          <td className="rg-consolidado-col-dni">{f.dni || ''}</td>
                          <td className="rg-consolidado-col-nombre">{f.nombre}</td>
                          {columnas.map((c) => (
                            <td key={`${f.matricula_id}-${c.key}`} className="rg-consolidado-col-curso">
                              {f.notas?.[c.key] || ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {hayDatos ? (
              <p className="rg-maestros-aula-total">
                Aulas: <strong>{data.total_pestanas}</strong>
                {' · '}
                Alumnos en esta pestaña: <strong>{filas.length}</strong>
              </p>
            ) : null}
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
          startIcon={<TableChartIcon />}
          className="rg-btn-excel"
        >
          {exporting ? 'Exportando…' : 'Exportar Excel'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
