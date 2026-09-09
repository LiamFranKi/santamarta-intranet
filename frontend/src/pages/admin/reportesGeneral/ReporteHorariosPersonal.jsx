import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  TextField,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import VisibilityIcon from '@mui/icons-material/Visibility';
import api from '../../../services/api';
import Swal from 'sweetalert2';
import ReporteGeneralPanel from '../ReporteGeneralPanel';
import useReportesGeneralMeta, { aplicarDefaultsSedeAnio } from './useReportesGeneralMeta';
import { REPORTE_GENERAL_DIALOG_SX } from './reporteDialogProps';
import ModalHorariosPersonal from './ModalHorariosPersonal';

const ALCANCES = [
  { id: 'todos', label: 'Todos' },
  { id: 'nivel', label: 'Por nivel' },
  { id: 'elegir', label: 'Elegir personas' },
];

function iniciales(nombre) {
  return String(nombre || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('') || 'D';
}

export default function ReporteHorariosPersonal() {
  const [anio, setAnio] = useState('');
  const [alcance, setAlcance] = useState('todos');
  const [nivelId, setNivelId] = useState('');
  const [elegidos, setElegidos] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [catalogo, setCatalogo] = useState([]);
  const [catalogoLoading, setCatalogoLoading] = useState(false);
  const [filtroPicker, setFiltroPicker] = useState('');
  const [marcados, setMarcados] = useState(() => new Set());

  const onDefaults = useCallback((data) => {
    aplicarDefaultsSedeAnio(data, { setAnio });
  }, []);

  const { meta, loading } = useReportesGeneralMeta(onDefaults);
  const anioN = parseInt(anio, 10) || parseInt(meta?.defaults?.anio, 10);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [docentes, setDocentes] = useState([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!Number.isFinite(anioN)) return undefined;
    let cancel = false;
    (async () => {
      setCatalogoLoading(true);
      try {
        const { data } = await api.get('/admin/reportes/general/horarios-personal', {
          params: { anio: anioN, solo_lista: 1 },
        });
        if (!cancel) setCatalogo(data.docentes || []);
      } catch {
        if (!cancel) setCatalogo([]);
      } finally {
        if (!cancel) setCatalogoLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [anioN]);

  useEffect(() => {
    setElegidos((prev) => prev.filter((p) => catalogo.some((c) => Number(c.personal_id) === Number(p.personal_id))));
  }, [catalogo]);

  const yaElegidos = useMemo(
    () => new Set(elegidos.map((p) => Number(p.personal_id))),
    [elegidos]
  );

  const visibles = useMemo(() => {
    const q = filtroPicker.trim().toLowerCase();
    if (!q) return catalogo;
    return catalogo.filter((p) => String(p.nombre || '').toLowerCase().includes(q));
  }, [catalogo, filtroPicker]);

  const visiblesNuevos = visibles.filter((p) => !yaElegidos.has(Number(p.personal_id)));
  const todosVisibles =
    visiblesNuevos.length > 0 && visiblesNuevos.every((p) => marcados.has(Number(p.personal_id)));

  const abrirPicker = () => {
    setFiltroPicker('');
    setMarcados(new Set());
    setPickerOpen(true);
  };

  const toggle = (id) => {
    const pid = Number(id);
    if (yaElegidos.has(pid)) return;
    setMarcados((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  };

  const toggleTodos = () => {
    setMarcados((prev) => {
      const next = new Set(prev);
      if (todosVisibles) visiblesNuevos.forEach((p) => next.delete(Number(p.personal_id)));
      else visiblesNuevos.forEach((p) => next.add(Number(p.personal_id)));
      return next;
    });
  };

  const confirmarPicker = () => {
    const extra = catalogo.filter((p) => {
      const pid = Number(p.personal_id);
      return marcados.has(pid) && !yaElegidos.has(pid);
    });
    if (extra.length) setElegidos([...elegidos, ...extra]);
    setPickerOpen(false);
  };

  const quitarElegido = (id) => {
    setElegidos(elegidos.filter((p) => Number(p.personal_id) !== Number(id)));
  };

  const verReporte = async () => {
    if (!Number.isFinite(anioN)) {
      Swal.fire({ icon: 'warning', title: 'Año', text: 'Indique el año académico.' });
      return;
    }
    if (alcance === 'nivel' && !nivelId) {
      Swal.fire({ icon: 'warning', title: 'Nivel', text: 'Elija el nivel para filtrar a los docentes.' });
      return;
    }
    if (alcance === 'elegir' && elegidos.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'Docentes',
        text: 'Marque al menos un docente. Solo aparecen quienes tienen horario de clases.',
      });
      return;
    }

    const params = { anio: anioN };
    if (alcance === 'nivel') params.nivel_id = nivelId;
    if (alcance === 'elegir') params.personal_ids = elegidos.map((p) => p.personal_id).join(',');

    setModalOpen(true);
    setModalLoading(true);
    setDocentes([]);
    try {
      const { data } = await api.get('/admin/reportes/general/horarios-personal', { params });
      setDocentes(data.docentes || []);
      setTotal(data.total ?? (data.docentes || []).length);
    } catch (e) {
      setModalOpen(false);
      Swal.fire({
        icon: 'error',
        title: 'No se pudo cargar',
        text: e.response?.data?.error || e.message,
      });
    } finally {
      setModalLoading(false);
    }
  };

  return (
    <>
      <ReporteGeneralPanel
        tone={3}
        icon="🗓️"
        title="Horarios del personal"
        description="Horario de clases de cada docente, igual al de «Mi horario»: lunes a viernes, curso y grado en cada hora."
        compact
      >
        {loading ? (
          <div className="rg-alum-loading">
            <CircularProgress size={24} />
          </div>
        ) : (
          <div className="rg-hp-form">
            <div className="rg-filtros-toolbar rg-filtros-toolbar--fill">
              <TextField
                size="small"
                label="Año"
                type="number"
                value={anio}
                onChange={(e) => setAnio(e.target.value)}
                className="rg-alum-field rg-alum-field--anio"
                inputProps={{ min: 2000, max: 2100 }}
              />
              <div className="rg-hp-alcance" role="radiogroup" aria-label="Alcance">
                {ALCANCES.map((a) => (
                  <label key={a.id} className={`rg-hp-alcance__opt ${alcance === a.id ? 'is-on' : ''}`}>
                    <input
                      type="radio"
                      name="rg-hp-alcance"
                      value={a.id}
                      checked={alcance === a.id}
                      onChange={() => setAlcance(a.id)}
                    />
                    {a.label}
                  </label>
                ))}
              </div>
              {alcance === 'nivel' ? (
                <TextField
                  select
                  size="small"
                  label="Nivel"
                  value={nivelId}
                  onChange={(e) => setNivelId(e.target.value)}
                  className="rg-alum-field rg-alum-field--nivel"
                >
                  <MenuItem value="">Seleccione</MenuItem>
                  {(meta?.niveles || []).map((n) => (
                    <MenuItem key={n.id} value={String(n.id)}>
                      {n.nombre}
                    </MenuItem>
                  ))}
                </TextField>
              ) : null}
              {alcance === 'elegir' ? (
                <button type="button" className="rg-alum-btn rg-alum-btn--secondary" onClick={abrirPicker}>
                  <PersonAddAlt1Icon fontSize="small" aria-hidden />
                  Elegir docentes
                </button>
              ) : null}
              <div className="rg-filtros-toolbar__actions">
                <button type="button" className="rg-alum-btn rg-alum-btn--primary" onClick={verReporte}>
                  <VisibilityIcon fontSize="small" aria-hidden />
                  Ver Reporte
                </button>
              </div>
            </div>
            {alcance === 'elegir' ? (
              <div className="rg-hp-chips">
                {elegidos.length === 0 ? (
                  <p className="rg-hp-chips__hint">
                    {catalogoLoading
                      ? 'Cargando docentes con horario…'
                      : 'Elija docentes. Quienes no tienen clases no aparecen.'}
                  </p>
                ) : (
                  elegidos.map((p) => (
                    <span key={p.personal_id} className="rg-hp-chip">
                      {p.nombre}
                      <button type="button" aria-label={`Quitar ${p.nombre}`} onClick={() => quitarElegido(p.personal_id)}>
                        ×
                      </button>
                    </span>
                  ))
                )}
              </div>
            ) : null}
            {alcance === 'nivel' ? (
              <p className="rg-hp-chips__hint">
                Entran docentes con al menos una clase en ese nivel. El PDF muestra su horario completo.
              </p>
            ) : null}
          </div>
        )}
      </ReporteGeneralPanel>

      <Dialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        maxWidth="sm"
        fullWidth
        className="rg-alum-modal"
        sx={REPORTE_GENERAL_DIALOG_SX}
      >
        <DialogTitle className="rg-alum-modal__title">
          <span>Elegir docentes</span>
          <IconButton aria-label="Cerrar" onClick={() => setPickerOpen(false)} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <p className="rg-hp-picker-hint">
            Solo personal con horario de clases en {anioN || 'el año'}. Marque y confirme; los nombres quedan como chips.
          </p>
          <input
            className="rg-hp-search"
            value={filtroPicker}
            onChange={(e) => setFiltroPicker(e.target.value)}
            placeholder="Filtrar por nombre…"
            autoFocus
          />
          <label className={`rg-hp-todos ${visiblesNuevos.length === 0 ? 'is-disabled' : ''}`}>
            <input
              type="checkbox"
              checked={todosVisibles}
              disabled={visiblesNuevos.length === 0}
              onChange={toggleTodos}
            />
            Todos los visibles
          </label>
          <div className="rg-hp-picker-list">
            {catalogoLoading ? <p className="rg-hp-empty">Cargando…</p> : null}
            {!catalogoLoading && visibles.length === 0 ? (
              <p className="rg-hp-empty">No hay docentes con horario en este año.</p>
            ) : null}
            {visibles.map((p) => {
              const pid = Number(p.personal_id);
              const ya = yaElegidos.has(pid);
              return (
                <label key={pid} className={`rg-hp-row ${ya ? 'is-ya' : ''} ${marcados.has(pid) ? 'is-on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={ya || marcados.has(pid)}
                    disabled={ya}
                    onChange={() => toggle(pid)}
                  />
                  <span className="rg-hp-avatar" aria-hidden>
                    {iniciales(p.nombre)}
                  </span>
                  <span>
                    <strong>{p.nombre}</strong>
                    {ya ? <small>Ya seleccionado</small> : null}
                  </span>
                </label>
              );
            })}
          </div>
        </DialogContent>
        <DialogActions>
          <button type="button" className="rg-alum-btn" onClick={() => setPickerOpen(false)}>
            Cancelar
          </button>
          <button
            type="button"
            className="rg-alum-btn rg-alum-btn--primary"
            disabled={[...marcados].filter((id) => !yaElegidos.has(id)).length === 0}
            onClick={confirmarPicker}
          >
            Agregar ({[...marcados].filter((id) => !yaElegidos.has(id)).length})
          </button>
        </DialogActions>
      </Dialog>

      <ModalHorariosPersonal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        loading={modalLoading}
        colegioNombre={meta?.colegio_nombre}
        anio={anioN}
        docentes={docentes}
        total={total}
      />
    </>
  );
}
