import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
  CircularProgress,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import TableChartIcon from '@mui/icons-material/TableChart';
import Swal from 'sweetalert2';
import api from '../../../services/api';
import { REPORTE_GENERAL_DIALOG_SX } from './reporteDialogProps';
import { generarPdfPadronEmergencias } from '../../../utils/pdfPadronEmergencias';

function TablaPadron({ filas }) {
  return (
    <div className="rg-alum-lista-table-wrap">
      <table className="rg-alum-lista-table">
        <thead>
          <tr>
            <th>N.°</th>
            <th>Estudiante</th>
            <th>DNI</th>
            <th>Orden</th>
            <th>Persona autorizada</th>
            <th>DNI / CE</th>
            <th>Parentesco</th>
            <th>Celular</th>
          </tr>
        </thead>
        <tbody>
          {(filas || []).length === 0 ? (
            <tr>
              <td colSpan={8}>Sin registros.</td>
            </tr>
          ) : (
            filas.map((f, i) => (
              <tr key={`${f.n}-${f.autorizado_nombre}-${i}`}>
                <td>{f.n}</td>
                <td>{f.alumno_nombre}</td>
                <td>{f.alumno_dni || '—'}</td>
                <td>{f.orden_recojo || '—'}</td>
                <td>{f.autorizado_nombre || '—'}</td>
                <td>{f.autorizado_dni || '—'}</td>
                <td>{f.parentesco || '—'}</td>
                <td>{f.celular || '—'}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function TablaControl({ filas }) {
  return (
    <div className="rg-alum-lista-table-wrap">
      <table className="rg-alum-lista-table">
        <thead>
          <tr>
            <th>N.°</th>
            <th>Estudiante</th>
            <th>Nivel</th>
            <th>Grado</th>
            <th>Sección</th>
            <th>Estado</th>
            <th>Quien recoge</th>
          </tr>
        </thead>
        <tbody>
          {(filas || []).map((f) => (
            <tr key={`c-${f.n}-${f.alumno_nombre}`}>
              <td>{f.n}</td>
              <td>{f.alumno_nombre}</td>
              <td>{f.nivel}</td>
              <td>{f.grado}</td>
              <td>{f.seccion}</td>
              <td>{f.estado}</td>
              <td>{f.persona_recoge || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ModalPadronEmergencias({
  open,
  onClose,
  loading,
  colegioNombre,
  bloques = [],
  totales,
  excelParams,
  enBlanco = false,
}) {
  const [tab, setTab] = useState('padron');
  const [busy, setBusy] = useState('');

  const exportExcel = async () => {
    if (!excelParams) return;
    setBusy('excel');
    try {
      const res = await api.get('/admin/reportes/general/padron-emergencias/excel', {
        params: excelParams,
        responseType: 'blob',
        timeout: 120000,
      });
      const contentType = res.headers?.['content-type'] || '';
      if (contentType.includes('application/json')) {
        const text = await res.data.text();
        const json = JSON.parse(text);
        throw new Error(json.error || 'No se pudo exportar el Excel.');
      }
      const cd = res.headers?.['content-disposition'] || '';
      const m = cd.match(/filename="([^"]+)"/);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = m ? m[1] : 'padron-emergencias.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Excel',
        text: e.response?.data?.error || e.message || 'No se pudo generar el Excel.',
      });
    } finally {
      setBusy('');
    }
  };

  const exportPdf = async (incluirPadron, incluirControl) => {
    setBusy('pdf');
    try {
      await generarPdfPadronEmergencias({
        colegioNombre,
        bloques,
        incluirPadron,
        incluirControl,
        enBlanco,
      });
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'PDF', text: e.message || 'No se pudo generar el PDF.' });
    } finally {
      setBusy('');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xl" sx={REPORTE_GENERAL_DIALOG_SX}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1 }}>
        {enBlanco ? 'Padrón emergencias (en blanco)' : 'Padrón emergencias'}
        <IconButton onClick={onClose} aria-label="Cerrar">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <div className="rg-alum-loading">
            <CircularProgress size={28} />
            <span>Cargando padrón…</span>
          </div>
        ) : (
          <>
            <Typography variant="body2" sx={{ mb: 1, color: 'text.secondary' }}>
              {colegioNombre} · {totales?.estudiantes || 0} estudiantes
              {enBlanco
                ? ' · plantilla para llenar apoderados a mano'
                : ` · ${totales?.autorizados || 0} autorizados`}
            </Typography>
            <nav className="rg-tabs-report" role="tablist" style={{ marginBottom: '0.75rem' }}>
              <button
                type="button"
                className={`rg-tab-report${tab === 'padron' ? ' is-active' : ''}`}
                onClick={() => setTab('padron')}
              >
                Padrón autorizado
              </button>
              <button
                type="button"
                className={`rg-tab-report${tab === 'control' ? ' is-active' : ''}`}
                onClick={() => setTab('control')}
              >
                Control de recojo
              </button>
            </nav>
            {(bloques || []).map((b) => (
              <section key={b.grupo_id} style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ margin: '0 0 0.35rem', fontSize: '0.95rem' }}>{b.titulo}</h3>
                <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: '#64748b' }}>
                  Tutor: {b.tutor || '—'}
                  {b.tutor2 ? ` · Tutor 2: ${b.tutor2}` : ''} · {b.estudiantes} estudiantes
                  {enBlanco ? '' : ` · ${b.autorizados} autorizados`}
                </p>
                {tab === 'padron' ? <TablaPadron filas={b.filas_padron} /> : <TablaControl filas={b.filas_control} />}
              </section>
            ))}
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1, px: 2, py: 1.5 }}>
        <Button
          startIcon={<TableChartIcon />}
          disabled={loading || !!busy || !bloques.length}
          onClick={exportExcel}
        >
          {busy === 'excel' ? 'Excel…' : 'Excel (ambas hojas)'}
        </Button>
        <Button
          startIcon={<PictureAsPdfIcon />}
          disabled={loading || !!busy || !bloques.length}
          onClick={() => exportPdf(true, true)}
        >
          PDF ambos
        </Button>
        <Button disabled={loading || !!busy || !bloques.length} onClick={() => exportPdf(true, false)}>
          PDF padrón
        </Button>
        <Button disabled={loading || !!busy || !bloques.length} onClick={() => exportPdf(false, true)}>
          PDF control
        </Button>
        <Button onClick={onClose}>Cerrar</Button>
      </DialogActions>
    </Dialog>
  );
}
