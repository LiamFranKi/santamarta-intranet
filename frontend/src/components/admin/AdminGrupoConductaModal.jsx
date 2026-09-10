import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import api from '../../services/api';
import Swal from 'sweetalert2';
import { exportConductaGrupoPdf } from '../../utils/exportConductaGrupoPdf';
import { exportIncidenciasPresentacionPdf } from '../../utils/exportIncidenciasPresentacionPdf';
import { textoReglaConducta, textoReglaCorta, REGLA_CONDUCTA_DEFAULT, captionDescuentosConducta, etiquetaOrigenConducta, claseOrigenConducta, notaMaxReferencia, esOrigenIncidenciaDocente } from '../../utils/reglaConducta';
import '../../pages/DocenteTutoria.css';

const API_BASE = '/admin/academico/grupos';
const REPORTE_BASE = '/docente/grupos';

function formatearSoloFecha(f) {
  if (f == null || f === '') return '—';
  if (typeof f === 'string' && /^\d{4}-\d{2}-\d{2}/.test(f)) {
    const [y, m, d] = f.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  try {
    return new Date(f).toLocaleDateString('es-PE');
  } catch {
    return String(f);
  }
}

function formatearFechaHoraPeru(iso) {
  if (iso == null || iso === '') return '—';
  try {
    return new Date(iso).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return String(iso);
  }
}

/**
 * Conducta automática por bimestre (misma UX que DocenteTutoria).
 * Usa rutas /api/admin/academico/grupos/:id/conducta (administrador o coordinador).
 */
function AdminGrupoConductaModal({ open, grupo, onClose }) {
  const [conductaCiclo, setConductaCiclo] = useState(1);
  const [conductaAlumnos, setConductaAlumnos] = useState([]);
  const [conductaRango, setConductaRango] = useState({ desde: '', hasta: '' });
  const [reglaConducta, setReglaConducta] = useState({ ...REGLA_CONDUCTA_DEFAULT });
  const [textoReglaConductaUi, setTextoReglaConductaUi] = useState(textoReglaConducta(REGLA_CONDUCTA_DEFAULT));
  const [loadingConducta, setLoadingConducta] = useState(false);
  const [recalculandoConducta, setRecalculandoConducta] = useState(false);
  const [modalIncidencias, setModalIncidencias] = useState(false);
  const [dataIncidencias, setDataIncidencias] = useState([]);
  const [loadingInc, setLoadingInc] = useState(false);
  const [fechaIncDesde, setFechaIncDesde] = useState('');
  const [fechaIncHasta, setFechaIncHasta] = useState('');
  const [detalleAlumno, setDetalleAlumno] = useState(null);
  const [loadingDetalle, setLoadingDetalle] = useState(false);

  const cargarConducta = async (grupoId, ciclo) => {
    if (!grupoId) return;
    try {
      setLoadingConducta(true);
      const res = await api.get(`${API_BASE}/${grupoId}/conducta`, { params: { ciclo } });
      setConductaAlumnos(res.data.alumnos || []);
      setConductaRango({
        desde: res.data.fecha_desde || '',
        hasta: res.data.fecha_hasta || '',
      });
      if (res.data.regla) setReglaConducta(res.data.regla);
      if (res.data.texto_regla) setTextoReglaConductaUi(res.data.texto_regla);
    } catch (error) {
      console.error('Error cargando conducta:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudieron cargar las notas de conducta',
      });
      setConductaAlumnos([]);
    } finally {
      setLoadingConducta(false);
    }
  };

  useEffect(() => {
    if (!open || !grupo?.id) return;
    setConductaCiclo(1);
    setModalIncidencias(false);
    setDetalleAlumno(null);
    cargarConducta(grupo.id, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir / cambiar grupo
  }, [open, grupo?.id]);

  const handleCambiarCiclo = (ciclo) => {
    setConductaCiclo(ciclo);
    if (grupo?.id) cargarConducta(grupo.id, ciclo);
  };

  const handleRecalcular = async () => {
    if (!grupo?.id) return;
    try {
      setRecalculandoConducta(true);
      const res = await api.post(`${API_BASE}/${grupo.id}/conducta`, { ciclo: conductaCiclo });
      setConductaAlumnos(res.data.alumnos || []);
      setConductaRango({
        desde: res.data.fecha_desde || '',
        hasta: res.data.fecha_hasta || '',
      });
      if (res.data.regla) setReglaConducta(res.data.regla);
      if (res.data.texto_regla) setTextoReglaConductaUi(res.data.texto_regla);
      Swal.fire({
        icon: 'success',
        title: 'Recalculado',
        text: res.data.texto_regla || textoReglaCorta(res.data.regla || reglaConducta),
        timer: 2200,
        showConfirmButton: false,
      });
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudo recalcular',
      });
    } finally {
      setRecalculandoConducta(false);
    }
  };

  const cargarIncidencias = async (ciclo) => {
    if (!grupo?.id) return;
    setLoadingInc(true);
    try {
      const { data } = await api.get(`${REPORTE_BASE}/${grupo.id}/reporte-incidencias-grupo`, {
        params: { ciclo },
      });
      setDataIncidencias(data.alumnos || []);
      if (data.fecha_desde) setFechaIncDesde(data.fecha_desde);
      if (data.fecha_hasta) setFechaIncHasta(data.fecha_hasta);
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudieron cargar' });
      setDataIncidencias([]);
    } finally {
      setLoadingInc(false);
    }
  };

  const abrirIncidencias = async () => {
    setModalIncidencias(true);
    await cargarIncidencias(conductaCiclo);
  };

  const abrirDetalle = async (alumno) => {
    if (!grupo?.id || !alumno?.matricula_id) return;
    setLoadingDetalle(true);
    setDetalleAlumno({ alumno, incidencias: [], fecha_desde: conductaRango.desde, fecha_hasta: conductaRango.hasta });
    try {
      const { data } = await api.get(`${REPORTE_BASE}/${grupo.id}/reporte-incidencias-grupo`, {
        params: { ciclo: conductaCiclo, matricula_id: alumno.matricula_id },
      });
      const bloque = (data.alumnos || [])[0] || { incidencias: [] };
      setDetalleAlumno({
        alumno,
        incidencias: bloque.incidencias || [],
        fecha_desde: data.fecha_desde || conductaRango.desde,
        fecha_hasta: data.fecha_hasta || conductaRango.hasta,
      });
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudo cargar' });
      setDetalleAlumno(null);
    } finally {
      setLoadingDetalle(false);
    }
  };

  const parseIdRegistroConducta = (raw) => {
    const s = String(raw || '');
    const m = s.match(/^(ped|tard)-(\d+)$/);
    if (!m) return null;
    return { tipo: m[1], id: parseInt(m[2], 10) };
  };

  const eliminarRegistroConductaDetalle = async (inc) => {
    const parsed = parseIdRegistroConducta(inc?.id);
    if (!parsed || !grupo?.id) return;
    const esPed = parsed.tipo === 'ped';
    const esOlvido = inc?.origen === 'olvido_qr';
    const confirm = await Swal.fire({
      icon: 'warning',
      title: esOlvido ? '¿Quitar olvido QR?' : esPed ? '¿Quitar presentación?' : '¿Quitar tardanza?',
      text: esOlvido
        ? 'Se eliminará este descuento por olvido de QR y se recalculará la nota de conducta.'
        : esPed
        ? 'Se eliminará este descuento por presentación y se recalculará la nota de conducta.'
        : 'La tardanza pasará a PRESENTE y se recalculará la nota de conducta.',
      showCancelButton: true,
      confirmButtonText: 'Sí, quitar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
    });
    if (!confirm.isConfirmed) return;
    const url = esPed
      ? `${REPORTE_BASE}/${grupo.id}/presentacion-descuentos/${parsed.id}`
      : `${REPORTE_BASE}/${grupo.id}/tardanzas-asistencia/${parsed.id}`;
    try {
      await api.delete(url);
      const res = await api.get(`${API_BASE}/${grupo.id}/conducta`, { params: { ciclo: conductaCiclo } });
      const alumnosAct = res.data.alumnos || [];
      setConductaAlumnos(alumnosAct);
      const mid = detalleAlumno?.alumno?.matricula_id;
      const actualizado = alumnosAct.find((a) => Number(a.matricula_id) === Number(mid));
      if (actualizado) await abrirDetalle(actualizado);
      Swal.fire({
        icon: 'success',
        title: 'Listo',
        text: 'La nota de conducta se actualizó.',
        timer: 1800,
        showConfirmButton: false,
      });
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo quitar el registro',
      });
    }
  };

  const exportPdfIncidencias = async () => {
    if (!dataIncidencias.length) {
      Swal.fire({ icon: 'info', title: 'Sin registros', text: 'No hay incidencias ni presentación en el bimestre.' });
      return;
    }
    const r = await exportIncidenciasPresentacionPdf({
      alumnos: dataIncidencias,
      grupo,
      ciclo: conductaCiclo,
      fechaDesde: fechaIncDesde,
      fechaHasta: fechaIncHasta,
      tituloExtra: 'Admin',
    });
    if (!r.ok) {
      Swal.fire({ icon: 'info', title: 'Sin registros', text: 'No hay datos para exportar.' });
      return;
    }
    Swal.fire({ icon: 'success', title: 'PDF generado', timer: 1800, showConfirmButton: false });
  };

  const exportPdfDetalleAlumno = async () => {
    if (!detalleAlumno?.incidencias?.length) {
      Swal.fire({ icon: 'info', title: 'Sin registros', text: 'No hay registros para exportar.' });
      return;
    }
    const r = await exportIncidenciasPresentacionPdf({
      alumnos: [
        {
          alumno_nombre: detalleAlumno.alumno?.nombre_completo,
          incidencias: detalleAlumno.incidencias,
        },
      ],
      grupo,
      ciclo: conductaCiclo,
      fechaDesde: detalleAlumno.fecha_desde || conductaRango.desde,
      fechaHasta: detalleAlumno.fecha_hasta || conductaRango.hasta,
      tituloExtra: `Nota ${detalleAlumno.alumno?.nota_conducta ?? '—'}`,
      filenameSuffix: `B${conductaCiclo}_alumno`,
    });
    if (!r.ok) {
      Swal.fire({ icon: 'info', title: 'Sin registros', text: 'No hay datos para exportar.' });
      return;
    }
    Swal.fire({ icon: 'success', title: 'PDF generado', timer: 1800, showConfirmButton: false });
  };

  const handleExportarPdf = () => {
    exportConductaGrupoPdf({
      alumnos: conductaAlumnos,
      grupo: {
        grado: grupo?.grado,
        seccion: grupo?.seccion,
        nivel_nombre: grupo?.nivel_nombre,
        anio: grupo?.anio,
      },
      ciclo: conductaCiclo,
      regla: reglaConducta,
    });
  };

  if (!open || !grupo) return null;

  return (
    <>
      {createPortal(
        <div className="modal-registro-asistencia-overlay" onClick={onClose} role="presentation">
          <div
            className="modal-registro-asistencia-container"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-registro-asistencia-header">
              <h2>📝 Conducta del bimestre</h2>
              <button className="modal-registro-asistencia-close" onClick={onClose} type="button">
                ✕
              </button>
            </div>
            <div className="modal-registro-asistencia-filters modal-registro-asistencia-filters--wrap">
              <label htmlFor="admin-conducta-ciclo">Bimestre:</label>
              <select
                id="admin-conducta-ciclo"
                value={conductaCiclo}
                onChange={(e) => handleCambiarCiclo(parseInt(e.target.value, 10))}
                disabled={loadingConducta}
                style={{
                  padding: '0.5rem 1rem',
                  border: '2px solid #e5e7eb',
                  borderRadius: 8,
                  fontSize: '1rem',
                  background: 'white',
                  minWidth: 100,
                }}
              >
                {[1, 2, 3, 4].map((b) => (
                  <option key={b} value={b}>
                    Bimestre {b}
                  </option>
                ))}
              </select>
              {(conductaRango.desde || conductaRango.hasta) && (
                <span className="conducta-rango-hint">
                  {formatearSoloFecha(conductaRango.desde)} → {formatearSoloFecha(conductaRango.hasta)}
                </span>
              )}
              <button
                type="button"
                className="btn-imprimir-asistencia"
                onClick={handleExportarPdf}
                disabled={loadingConducta || !conductaAlumnos.length}
              >
                🖨️ Exportar PDF
              </button>
              <button type="button" className="btn-tutor-evid-incidencias" onClick={abrirIncidencias}>
                📌 Ver incidencias y presentación
              </button>
            </div>
            <p className="conducta-auto-aviso">
              {textoReglaConductaUi}
            </p>
            <p className="conducta-caption-descuentos">{captionDescuentosConducta(reglaConducta)}</p>
            <div className="modal-registro-asistencia-table-wrap">
              {loadingConducta ? (
                <div className="modal-registro-asistencia-loading">
                  <div className="loading-spinner" />
                  <p>Cargando...</p>
                </div>
              ) : (
                <table className="tabla-registro-asistencia">
                  <thead>
                    <tr>
                      <th style={{ width: 50 }}>N°</th>
                      <th>APELLIDOS Y NOMBRES</th>
                      <th style={{ width: 62, textAlign: 'center' }}>Incid.</th>
                      <th style={{ width: 72, textAlign: 'center' }}>Present.</th>
                      <th style={{ width: 62, textAlign: 'center' }}>Tard.</th>
                      <th style={{ width: 72, textAlign: 'center' }}>Olvido QR</th>
                      <th style={{ width: 90, textAlign: 'center' }}>NOTA</th>
                      <th style={{ width: 70, textAlign: 'center' }}>Ver</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conductaAlumnos.map((a) => (
                      <tr key={a.matricula_id}>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>{a.numero}</td>
                        <td>{a.nombre_completo}</td>
                        <td style={{ textAlign: 'center' }}>{a.total_incidencias ?? 0}</td>
                        <td style={{ textAlign: 'center' }}>{a.total_presentacion ?? 0}</td>
                        <td style={{ textAlign: 'center' }}>{a.total_tardanzas ?? 0}</td>
                        <td style={{ textAlign: 'center' }}>{a.total_olvido_qr ?? 0}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="input-conducta input-conducta--readonly">{a.nota_conducta ?? notaMaxReferencia(reglaConducta)}</span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button type="button" className="btn-conducta-ver" title="Ver detalle" onClick={() => abrirDetalle(a)}>
                            👁️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="modal-registro-asistencia-footer">
              <button
                type="button"
                className="btn-guardar-asistencias"
                onClick={handleRecalcular}
                disabled={loadingConducta || recalculandoConducta}
              >
                {recalculandoConducta ? 'Recalculando...' : '↻ Recalcular'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {detalleAlumno &&
        createPortal(
          <div className="tutor-evidencias-overlay" onClick={() => setDetalleAlumno(null)} role="presentation">
            <div className="tutor-evidencias-panel tutor-evidencias-panel--inci" onClick={(e) => e.stopPropagation()} role="dialog">
              <header className="tutor-evidencias-panel-header tutor-evidencias-panel-header--incidencias">
                <div>
                  <h2>Detalle bimestre {conductaCiclo}</h2>
                  <p className="tutor-evidencias-panel-sub">
                    <strong>{detalleAlumno.alumno?.nombre_completo}</strong>
                  </p>
                  <div className="conducta-detalle-subchips">
                    <span className="conducta-detalle-chip conducta-detalle-chip--nota">
                      Nota {detalleAlumno.alumno?.nota_conducta ?? '—'}
                    </span>
                    <span className="conducta-detalle-chip">Incid. {detalleAlumno.alumno?.total_incidencias ?? (detalleAlumno.incidencias || []).filter((x) => esOrigenIncidenciaDocente(x.origen)).length}</span>
                    <span className="conducta-detalle-chip">Present. {detalleAlumno.alumno?.total_presentacion ?? (detalleAlumno.incidencias || []).filter((x) => x.origen === 'vestimenta').length}</span>
                    <span className="conducta-detalle-chip">Tard. {detalleAlumno.alumno?.total_tardanzas ?? (detalleAlumno.incidencias || []).filter((x) => x.origen === 'tardanza').length}</span>
                    <span className="conducta-detalle-chip">Olvido QR {detalleAlumno.alumno?.total_olvido_qr ?? (detalleAlumno.incidencias || []).filter((x) => x.origen === 'olvido_qr').length}</span>
                  </div>
                </div>
                <button type="button" className="tutor-evidencias-close" onClick={() => setDetalleAlumno(null)}>
                  ✕
                </button>
              </header>
              {(detalleAlumno.incidencias || []).length > 0 && !loadingDetalle ? (
                <div className="tutor-evidencias-toolbar">
                  <button type="button" className="tutor-evidencias-btn pdf" onClick={exportPdfDetalleAlumno}>
                    📄 Exportar PDF
                  </button>
                </div>
              ) : null}
              <div className="tutor-evidencias-body">
                {loadingDetalle ? (
                  <div className="modal-registro-asistencia-loading">
                    <div className="loading-spinner" />
                    <p>Cargando…</p>
                  </div>
                ) : !(detalleAlumno.incidencias || []).length ? (
                  <p className="tutor-evidencias-empty tutor-evidencias-empty--destacado">Sin registros en este bimestre</p>
                ) : (
                  <div className="tutor-evidencia-cards-scroll">
                    <ul className="tutor-evidencia-lineas tutor-evidencia-lineas--inci">
                      {(detalleAlumno.incidencias || []).map((inc) => (
                        <li key={inc.id} className="tutor-inc-card">
                          <div className="tutor-inc-card-top">
                            <time className="tutor-inc-fecha">{formatearFechaHoraPeru(inc.created_at)}</time>
                            <div className="tutor-inc-card-top-acciones">
                              <span className={`tutor-inc-origen ${claseOrigenConducta(inc.origen)}`}>
                                {etiquetaOrigenConducta(inc.origen)}
                              </span>
                              {(inc.origen === 'vestimenta' || inc.origen === 'tardanza' || inc.origen === 'olvido_qr') ? (
                                <button
                                  type="button"
                                  className="btn-eliminar-conducta-item"
                                  onClick={() => eliminarRegistroConductaDetalle(inc)}
                                >
                                  🗑️ Quitar
                                </button>
                              ) : null}
                            </div>
                          </div>
                          <div className="tutor-inc-card-meta">
                            <div className="tutor-inc-meta-item">
                              <span className="tutor-inc-meta-label">Docente</span>
                              <span className="tutor-inc-meta-value es-docente">{inc.docente_nombre || '—'}</span>
                            </div>
                            <div className="tutor-inc-meta-item">
                              <span className="tutor-inc-meta-label">Curso</span>
                              <span className="tutor-inc-meta-value es-curso">{inc.curso_nombre || '—'}</span>
                            </div>
                          </div>
                          {(inc.description || '').trim() ? <p className="tutor-inc-detalle">{inc.description}</p> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      {modalIncidencias &&
        createPortal(
          <div className="tutor-evidencias-overlay" onClick={() => setModalIncidencias(false)} role="presentation">
            <div className="tutor-evidencias-panel tutor-evidencias-panel--inci" onClick={(e) => e.stopPropagation()} role="dialog">
              <header className="tutor-evidencias-panel-header tutor-evidencias-panel-header--incidencias">
                <div>
                  <h2>Incidencias, presentación y tardanzas</h2>
                  <p className="tutor-evidencias-panel-sub">
                    <strong>
                      {grupo.grado}° {grupo.seccion}
                    </strong>{' '}
                    — bimestre {conductaCiclo}. El caption de cada registro indica el descuento.
                  </p>
                </div>
                <button type="button" className="tutor-evidencias-close" onClick={() => setModalIncidencias(false)}>
                  ✕
                </button>
              </header>
              <div className="tutor-evidencias-toolbar">
                <label className="tutor-evidencias-date">
                  Bimestre{' '}
                  <select
                    value={conductaCiclo}
                    onChange={(e) => {
                      const c = parseInt(e.target.value, 10);
                      setConductaCiclo(c);
                      cargarIncidencias(c);
                    }}
                  >
                    {[1, 2, 3, 4].map((b) => (
                      <option key={b} value={b}>
                        Bimestre {b}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="tutor-evidencias-btn pdf" onClick={exportPdfIncidencias}>
                  📄 Exportar PDF
                </button>
              </div>
              <div className="tutor-evidencias-body">
                {loadingInc ? (
                  <div className="modal-registro-asistencia-loading">
                    <div className="loading-spinner" />
                    <p>Cargando…</p>
                  </div>
                ) : !dataIncidencias.length ? (
                  <p className="tutor-evidencias-empty tutor-evidencias-empty--destacado">Sin registros</p>
                ) : (
                  <div className="tutor-evidencia-cards-scroll">
                    {dataIncidencias.map((alu, idx) => (
                      <article key={alu.alumno_id || idx} className="tutor-evidencia-alumno-card tutor-evidencia-alumno-card--inci">
                        <div className="tutor-evidencia-alumno-card-head">
                          <span className="tutor-evidencia-alumno-nombre">{alu.alumno_nombre}</span>
                          <span className="tutor-evidencia-alumno-meta">{(alu.incidencias || []).length} registro(s)</span>
                        </div>
                        <ul className="tutor-evidencia-lineas tutor-evidencia-lineas--inci">
                          {(alu.incidencias || []).map((inc) => (
                            <li key={inc.id} className="tutor-inc-card">
                              <div className="tutor-inc-card-top">
                                <time className="tutor-inc-fecha">{formatearFechaHoraPeru(inc.created_at)}</time>
                                <span className={`tutor-inc-origen ${claseOrigenConducta(inc.origen)}`}>
                                  {etiquetaOrigenConducta(inc.origen)}
                                </span>
                              </div>
                              <div className="tutor-inc-card-meta">
                                <div className="tutor-inc-meta-item">
                                  <span className="tutor-inc-meta-label">Docente</span>
                                  <span className="tutor-inc-meta-value es-docente">{inc.docente_nombre || '—'}</span>
                                </div>
                                <div className="tutor-inc-meta-item">
                                  <span className="tutor-inc-meta-label">Curso</span>
                                  <span className="tutor-inc-meta-value es-curso">{inc.curso_nombre || '—'}</span>
                                </div>
                              </div>
                              {(inc.description || '').trim() ? <p className="tutor-inc-detalle">{inc.description}</p> : null}
                            </li>
                          ))}
                        </ul>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

export default AdminGrupoConductaModal;
