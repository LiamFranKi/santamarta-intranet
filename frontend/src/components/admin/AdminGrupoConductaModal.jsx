import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import api from '../../services/api';
import Swal from 'sweetalert2';
import jsPDF from 'jspdf';
import { exportConductaGrupoPdf } from '../../utils/exportConductaGrupoPdf';
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
 * Usa rutas /api/admin/academico/grupos/:id/conducta (solo ADMINISTRADOR).
 */
function AdminGrupoConductaModal({ open, grupo, onClose }) {
  const [conductaCiclo, setConductaCiclo] = useState(1);
  const [conductaAlumnos, setConductaAlumnos] = useState([]);
  const [conductaRango, setConductaRango] = useState({ desde: '', hasta: '' });
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
      Swal.fire({
        icon: 'success',
        title: 'Recalculado',
        text: 'Nota = 20 − incidencias del bimestre (máx. 20, mín. 0)',
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

  const exportPdfIncidencias = () => {
    if (!dataIncidencias.length) {
      Swal.fire({ icon: 'info', title: 'Sin registros', text: 'No hay incidencias ni presentación en el bimestre.' });
      return;
    }
    const doc = new jsPDF('p', 'mm', 'a4');
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const mm = 14;
    const tituloGrupo = `${grupo?.grado}° ${grupo?.seccion} - ${grupo?.nivel_nombre}`;
    let y = 20;
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Incidencias y presentación', mm, y);
    y += 7;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`${tituloGrupo} · Bimestre ${conductaCiclo} · ${formatearSoloFecha(fechaIncDesde)} → ${formatearSoloFecha(fechaIncHasta)}`, mm, y);
    y += 10;
    dataIncidencias.forEach((al) => {
      if (y > ph - 30) {
        doc.addPage();
        y = 16;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(String(al.alumno_nombre || 'Alumno'), mm, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      (al.incidencias || []).forEach((inc) => {
        if (y > ph - 20) {
          doc.addPage();
          y = 16;
        }
        const tipo = inc.origen === 'vestimenta' ? 'Presentación' : 'Incidencia';
        const lineas = doc.splitTextToSize(
          `${formatearFechaHoraPeru(inc.created_at)} · ${tipo} · ${inc.description || ''}`,
          pw - 2 * mm
        );
        lineas.forEach((ln) => {
          doc.text(ln, mm + 2, y);
          y += 4;
        });
        y += 2;
      });
      y += 4;
    });
    doc.save(`${tituloGrupo.replace(/\s+/g, '_')}_incidencias_B${conductaCiclo}.pdf`);
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
              Nota automática: parte de 20; −1 por cada incidencia o descuento de presentación del bimestre (mín. 0). No se edita a mano.
            </p>
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
                      <th style={{ width: 70, textAlign: 'center' }}>Incid.</th>
                      <th style={{ width: 90, textAlign: 'center' }}>NOTA (0-20)</th>
                      <th style={{ width: 70, textAlign: 'center' }}>Ver</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conductaAlumnos.map((a) => (
                      <tr key={a.matricula_id}>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>{a.numero}</td>
                        <td>{a.nombre_completo}</td>
                        <td style={{ textAlign: 'center' }}>{a.total_incidencias ?? 0}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="input-conducta input-conducta--readonly">{a.nota_conducta ?? '20'}</span>
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
                    <span className="conducta-detalle-chip">
                      {(detalleAlumno.incidencias || []).length} registro{(detalleAlumno.incidencias || []).length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                <button type="button" className="tutor-evidencias-close" onClick={() => setDetalleAlumno(null)}>
                  ✕
                </button>
              </header>
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
                            <span className={`tutor-inc-origen ${inc.origen === 'vestimenta' ? 'es-vestimenta' : 'es-incidencia'}`}>
                              {inc.origen === 'vestimenta' ? 'Presentación' : 'Incidencia'}
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
                  <h2>Incidencias y presentación</h2>
                  <p className="tutor-evidencias-panel-sub">
                    <strong>
                      {grupo.grado}° {grupo.seccion}
                    </strong>{' '}
                    — bimestre {conductaCiclo}
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
                                <span className={`tutor-inc-origen ${inc.origen === 'vestimenta' ? 'es-vestimenta' : 'es-incidencia'}`}>
                                  {inc.origen === 'vestimenta' ? 'Presentación' : 'Incidencia'}
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
