import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import api from '../../services/api';
import Swal from 'sweetalert2';
import { generarPdfListaDeudores } from '../../utils/pdfListaDeudores';
import './TutoriaModalDeudores.css';

/** SweetAlert por encima del overlay del modal (z-index 100000 en DocenteTutoria.css) */
const swalSobreModal = {
  customClass: { container: 'tutoria-deudores-swal-container' },
  didOpen: (popup) => {
    const root = popup?.closest?.('.swal2-container');
    if (root) root.style.zIndex = '250000';
  }
};

function filaKey(r) {
  return `${r.matricula_id}-${r.tipo_concepto}-${r.nro_concepto}`;
}

/**
 * @param {{ open: boolean, grupo: object, onClose: () => void }} props
 */
export default function TutoriaModalDeudores({
  open,
  grupo,
  onClose,
  apiPrefix = '/docente/tutoria',
  soloLectura = false,
}) {
  const [opcionesConcepto, setOpcionesConcepto] = useState([]);
  const [tipoConcepto, setTipoConcepto] = useState('todos');
  const [anio, setAnio] = useState('');
  const [moneda, setMoneda] = useState('S/');
  const [meta, setMeta] = useState(null);
  const [filas, setFilas] = useState([]);
  const [loadingConceptos, setLoadingConceptos] = useState(false);
  const [loadingLista, setLoadingLista] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cargarConceptos = useCallback(async () => {
    if (!grupo?.id) return;
    setLoadingConceptos(true);
    try {
      const { data } = await api.get(`${apiPrefix}/grupos/${grupo.id}/deudores/conceptos`, {
        params: { anio: grupo.anio }
      });
      setAnio(String(data.anio || ''));
      setMoneda(data.moneda || 'S/');
      setOpcionesConcepto(data.opciones || []);
      setTipoConcepto((prev) => {
        const opts = data.opciones || [];
        if (opts.some((o) => o.value === prev)) return prev;
        return opts[0]?.value ?? 'todos';
      });
    } catch (e) {
      console.error(e);
      Swal.fire({
        ...swalSobreModal,
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudieron cargar los conceptos.'
      });
    } finally {
      setLoadingConceptos(false);
    }
  }, [grupo]);

  const cargarLista = useCallback(async () => {
    if (!grupo?.id || !anio) return;
    setLoadingLista(true);
    try {
      const tipoParam = tipoConcepto === 'todos' ? 'todos' : tipoConcepto;
      const { data } = await api.get(`${apiPrefix}/grupos/${grupo.id}/deudores`, {
        params: { anio: parseInt(anio, 10), tipo: tipoParam }
      });
      setMeta({
        colegio_nombre: data.colegio_nombre,
        grupo_etiqueta: data.grupo_etiqueta,
        concepto: data.concepto,
        total_alumnos_unicos: data.total_alumnos_unicos
      });
      setFilas(data.filas || []);
    } catch (e) {
      console.error(e);
      Swal.fire({
        ...swalSobreModal,
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo cargar la lista de deudores.'
      });
      setFilas([]);
    } finally {
      setLoadingLista(false);
    }
  }, [grupo, anio, tipoConcepto]);

  useEffect(() => {
    if (!open || !grupo) return;
    cargarConceptos();
  }, [open, grupo, cargarConceptos]);

  useEffect(() => {
    if (!open || !grupo || !anio || loadingConceptos) return;
    cargarLista();
  }, [open, grupo, anio, tipoConcepto, loadingConceptos, cargarLista]);

  const handleObsChange = (row, texto) => {
    const key = filaKey(row);
    setFilas((prev) =>
      prev.map((r) => (filaKey(r) === key ? { ...r, observaciones: texto } : r))
    );
  };

  const totalAlumnosUnicos =
    typeof meta?.total_alumnos_unicos === 'number'
      ? meta.total_alumnos_unicos
      : new Set(filas.map((r) => r.alumno_id)).size;

  const handleGuardar = async () => {
    if (!grupo?.id || !filas.length) {
      Swal.fire({ ...swalSobreModal, icon: 'info', title: 'Nada que guardar' });
      return;
    }
    setGuardando(true);
    try {
      const items = filas.map((r) => ({
        matricula_id: r.matricula_id,
        tipo_concepto: r.tipo_concepto,
        nro_concepto: r.nro_concepto,
        observaciones: r.observaciones ?? ''
      }));
      const { data } = await api.put(`${apiPrefix}/grupos/${grupo.id}/deudores/observaciones`, {
        items
      });
      Swal.fire({
        ...swalSobreModal,
        icon: 'success',
        title: 'Guardado',
        text: `Se actualizaron ${data.guardados ?? items.length} registro(s).`
      });
    } catch (e) {
      console.error(e);
      Swal.fire({
        ...swalSobreModal,
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudieron guardar las observaciones.'
      });
    } finally {
      setGuardando(false);
    }
  };

  const handleExportar = () => {
    if (!meta || !filas.length) {
      Swal.fire({
        ...swalSobreModal,
        icon: 'info',
        title: 'Sin datos',
        text: 'No hay filas para exportar.'
      });
      return;
    }
    try {
      const slugGrupo = `${grupo.grado || ''}_${(grupo.seccion || '').replace(/\s+/g, '_')}`;
      generarPdfListaDeudores({
        variant: 'tutor',
        colegioNombre: meta.colegio_nombre,
        grupoEtiqueta: meta.grupo_etiqueta || '',
        anio: parseInt(anio, 10),
        moneda,
        concepto: meta.concepto,
        modoAgrupacion: 'todo',
        filas,
        totalAlumnosUnicos,
        nombreArchivo: `deudores_tutoria_${slugGrupo}_${anio}.pdf`
      });
    } catch (e) {
      console.error(e);
      Swal.fire({ ...swalSobreModal, icon: 'error', title: 'PDF', text: 'No se pudo generar el PDF.' });
    }
  };

  const cerrar = () => {
    setFilas([]);
    setMeta(null);
    setOpcionesConcepto([]);
    onClose();
  };

  if (!open || !grupo) return null;

  const tituloGrupo = `${grupo.grado}° ${grupo.seccion || ''} — ${grupo.nivel_nombre || ''}`;

  return createPortal(
    <div className="modal-registro-asistencia-overlay tutoria-modal-deudores-overlay" onClick={cerrar}>
      <div
        className="modal-registro-asistencia-container tutoria-modal-deudores-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutoria-deudores-titulo"
      >
        <div className="modal-registro-asistencia-header">
          <h2 id="tutoria-deudores-titulo">💰 Deudores del grupo</h2>
          <button type="button" className="modal-registro-asistencia-close" onClick={cerrar}>
            ✕
          </button>
        </div>

        <div className="tutoria-modal-deudores-toolbar-row">
          <div className="tutoria-modal-deudores-filters tutoria-modal-deudores-filters--inline">
            <label htmlFor="tut-deudores-anio">Año</label>
            <input
              id="tut-deudores-anio"
              type="number"
              min={2000}
              max={2100}
              value={anio}
              onChange={(e) => setAnio(e.target.value)}
              className="tutoria-modal-deudores-input-anio"
            />
            <label htmlFor="tut-deudores-concepto">Concepto</label>
            <select
              id="tut-deudores-concepto"
              value={tipoConcepto}
              onChange={(e) => setTipoConcepto(e.target.value)}
              disabled={loadingConceptos}
              className="tutoria-modal-deudores-select"
            >
              {opcionesConcepto.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="tutoria-modal-deudores-btn-actualizar"
              onClick={cargarLista}
              disabled={loadingLista || loadingConceptos}
            >
              🔄 Actualizar
            </button>
          </div>
          <div className="tutoria-modal-deudores-grupo-etiqueta" title="Grupo">
            {tituloGrupo}
          </div>
        </div>

        {!!filas.length && meta && (
          <div className="tutoria-deudores-headline">
            <span>Total alumnos ({totalAlumnosUnicos})</span>
          </div>
        )}

        <div className="modal-registro-asistencia-table-wrap tutoria-modal-deudores-table-wrap">
          {loadingLista || loadingConceptos ? (
            <div className="modal-registro-asistencia-loading">
              <div className="loading-spinner" />
              <p>Cargando deudores…</p>
            </div>
          ) : !filas.length ? (
            <p className="tutoria-modal-deudores-vacio">No hay deudores con saldo pendiente para este filtro.</p>
          ) : (
            <table className="tabla-registro-asistencia tutoria-deudores-table">
              <thead>
                <tr>
                  <th>Alumno</th>
                  <th>Concepto</th>
                  <th>Tel. apoderado</th>
                  <th>Observaciones (contacto con apoderado)</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((r) => (
                  <tr key={filaKey(r)}>
                    <td className="tut-deudores-col-nombre">{r.nombre}</td>
                    <td>{r.concepto}</td>
                    <td className="tut-deudores-tel">{r.telefono_apoderado || '—'}</td>
                    <td className="tut-deudores-col-obs">
                      <textarea
                        className="tut-deudores-textarea"
                        rows={3}
                        value={r.observaciones ?? ''}
                        onChange={(e) => handleObsChange(r, e.target.value)}
                        placeholder="Qué conversó con el apoderado sobre esta deuda…"
                        readOnly={soloLectura}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="modal-registro-asistencia-footer tutoria-modal-deudores-footer">
          {!soloLectura && (
          <button
            type="button"
            className="btn-guardar-asistencias"
            onClick={handleGuardar}
            disabled={guardando || !filas.length}
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
          )}
          <button
            type="button"
            className="btn-imprimir-asistencia tutoria-btn-export-pdf"
            onClick={handleExportar}
            disabled={!filas.length}
          >
            📄 Exportar PDF
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
