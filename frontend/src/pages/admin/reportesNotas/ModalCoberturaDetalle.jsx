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
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

function fmtPct(n) {
  if (n == null || n === '') return '—';
  return `${Number(n).toLocaleString('es-PE', { maximumFractionDigits: 1 })}%`;
}

function fmtNota(n) {
  if (n == null || n === '') return '—';
  const v = typeof n === 'number' ? n : parseFloat(n);
  if (Number.isNaN(v)) return String(n);
  return v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pctClass(pct) {
  if (pct == null) return 'neutral';
  if (pct >= 100) return 'ok';
  if (pct >= 70) return 'warn';
  return 'bad';
}

function EstadoChip({ completo, pct }) {
  if (completo) {
    return (
      <span className="cob-det-chip cob-det-chip--ok">
        <CheckCircleOutlineIcon fontSize="inherit" /> Completo
      </span>
    );
  }
  if (pct == null || pct <= 0) {
    return (
      <span className="cob-det-chip cob-det-chip--bad">
        <ErrorOutlineIcon fontSize="inherit" /> Sin registrar
      </span>
    );
  }
  return (
    <span className="cob-det-chip cob-det-chip--warn">
      <WarningAmberIcon fontSize="inherit" /> Parcial
    </span>
  );
}

function CursoRow({ curso, index, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const pendientes = curso.alumnos_pendientes || [];
  const cls = pctClass(curso.pct_cobertura);
  const barWidth = curso.pct_cobertura != null ? Math.min(100, Math.max(2, curso.pct_cobertura)) : 2;

  return (
    <div className={`cob-det-curso ${open ? 'is-open' : ''} ${cls}`}>
      <button
        type="button"
        className="cob-det-curso__head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="cob-det-curso__idx">{index + 1}</span>
        <div className="cob-det-curso__info">
          <div className="cob-det-curso__title-row">
            <strong className="cob-det-curso__nombre">{curso.curso_nombre}</strong>
            <EstadoChip completo={curso.completo} pct={curso.pct_cobertura} />
          </div>
          <span className="cob-det-curso__docente">{curso.docente_nombre || '—'}</span>
          <div className="cob-det-curso__bar-wrap">
            <div className="cob-det-curso__bar-track">
              <div className={`cob-det-curso__bar-fill cob-det-curso__bar-fill--${cls}`} style={{ width: `${barWidth}%` }} />
            </div>
            <span className="cob-det-curso__pct">{fmtPct(curso.pct_cobertura)}</span>
          </div>
        </div>
        <div className="cob-det-curso__stats">
          <span className="cob-det-curso__stat">
            <em>{curso.registradas}</em> / {curso.esperadas}
          </span>
          {pendientes.length > 0 && (
            <span className="cob-det-curso__faltan">{pendientes.length} pendiente{pendientes.length === 1 ? '' : 's'}</span>
          )}
        </div>
        <ExpandMoreIcon className={`cob-det-curso__chevron ${open ? 'is-open' : ''}`} />
      </button>

      {open && pendientes.length > 0 && (
        <div className="cob-det-curso__body">
          <p className="cob-det-curso__body-title">Alumnos sin nota registrada</p>
          <ul className="cob-det-alumnos">
            {pendientes.map((a) => (
              <li key={a.matricula_id}>{a.alumno_nombre}</li>
            ))}
          </ul>
        </div>
      )}

      {open && pendientes.length === 0 && curso.completo && (
        <div className="cob-det-curso__body cob-det-curso__body--ok">
          <CheckCircleOutlineIcon fontSize="small" />
          Todas las notas de este curso están registradas.
        </div>
      )}
    </div>
  );
}

export default function ModalCoberturaDetalle({ open, onClose, loading, data }) {
  const cursos = data?.cursos || [];
  const incompletos = cursos.filter((c) => !c.completo);
  const pctCls = pctClass(data?.pct_cobertura);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth scroll="paper" className="cob-det-modal">
      <DialogTitle className="cob-det-modal__title">
        <div>
          <span className="cob-det-modal__heading">Detalle de cobertura</span>
          {data?.label && <span className="cob-det-modal__salon">{data.label}</span>}
        </div>
        <IconButton aria-label="Cerrar" onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers className="cob-det-modal__content">
        {loading ? (
          <Box display="flex" justifyContent="center" py={6}>
            <CircularProgress />
          </Box>
        ) : !data ? (
          <Typography color="text.secondary" align="center" py={4}>
            No se pudo cargar el detalle.
          </Typography>
        ) : (
          <>
            <p className="cob-det-modal__meta">
              {data.colegio_nombre ? `${data.colegio_nombre} · ` : ''}
              Año {data.anio} · Bimestre {data.ciclo}
              {data.es_cualitativo ? ' · Inicial (cualitativo)' : ''}
            </p>

            <div className="cob-det-kpis">
              <div className={`cob-det-kpi cob-det-kpi--${pctCls}`}>
                <span className="cob-det-kpi__label">Cobertura total</span>
                <span className="cob-det-kpi__value">{fmtPct(data.pct_cobertura)}</span>
              </div>
              <div className="cob-det-kpi">
                <span className="cob-det-kpi__label">Notas registradas</span>
                <span className="cob-det-kpi__value">
                  {data.notas_registradas ?? '—'}
                  <small> / {data.notas_esperadas ?? '—'}</small>
                </span>
              </div>
              <div className="cob-det-kpi">
                <span className="cob-det-kpi__label">Cursos incompletos</span>
                <span className="cob-det-kpi__value cob-det-kpi__value--warn">
                  {data.cursos_incompletos ?? 0}
                  <small> de {data.cursos_total ?? cursos.length}</small>
                </span>
              </div>
              {data.promedio_salon != null && (
                <div className="cob-det-kpi">
                  <span className="cob-det-kpi__label">Prom. salón</span>
                  <span className="cob-det-kpi__value">{fmtNota(data.promedio_salon)}</span>
                </div>
              )}
            </div>

            {incompletos.length === 0 ? (
              <div className="cob-det-all-ok">
                <CheckCircleOutlineIcon />
                <div>
                  <strong>Cobertura completa</strong>
                  <p>Todos los cursos tienen las notas registradas para este bimestre.</p>
                </div>
              </div>
            ) : (
              <>
                <h3 className="cob-det-section-title">
                  Cursos por completar
                  <span className="cob-det-section-hint">Ordenados de menor a mayor cobertura</span>
                </h3>
                <div className="cob-det-cursos">
                  {cursos.map((c, i) => (
                    <CursoRow key={c.asignatura_id} curso={c} index={i} defaultOpen={!c.completo && i < 3} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </DialogContent>

      <DialogActions className="cob-det-modal__actions">
        <Button onClick={onClose} variant="contained" className="cob-det-btn-close">
          Cerrar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
