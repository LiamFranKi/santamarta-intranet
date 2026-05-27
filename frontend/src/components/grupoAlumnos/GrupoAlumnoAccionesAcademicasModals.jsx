import React from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import '../../pages/DocenteHijos.css';

function fmtFecha(val) {
  if (!val) return '—';
  try {
    return new Date(val).toLocaleDateString('es-PE');
  } catch {
    return String(val);
  }
}

export default function GrupoAlumnoAccionesAcademicasModals({
  nombreAlumno,
  alumnoSel,
  modalIncidencias,
  setModalIncidencias,
  incidencias,
  loadingIncidencias,
  modalAsistencias,
  setModalAsistencias,
  asistencias,
  loadingAsistencias,
  modalNotas,
  setModalNotas,
  notasDetalladas,
  cicloNotas,
  setCicloNotas,
  loadingNotas,
}) {
  const titulo = alumnoSel ? nombreAlumno(alumnoSel) : '';

  return (
    <>
      {modalIncidencias &&
        createPortal(
          <div className="modal-overlay-qr" onClick={() => setModalIncidencias(false)}>
            <div className="modal-content-incidencias" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header-qr">
                <h2>⚠️ Incidencias — {titulo}</h2>
                <button type="button" className="modal-close-qr" onClick={() => setModalIncidencias(false)}>
                  ×
                </button>
              </div>
              <div className="modal-body-incidencias">
                {loadingIncidencias ? (
                  <div className="qr-loading">Cargando…</div>
                ) : incidencias.length === 0 ? (
                  <div className="empty-state">No hay incidencias registradas</div>
                ) : (
                  <div className="cards-container">
                    {incidencias.map((inc) => (
                      <div key={inc.id} className="incidencia-card" style={{ marginBottom: 12 }}>
                        <div className="card-fecha">📅 {fmtFecha(inc.created_at)}</div>
                        <div>
                          <strong>Docente:</strong> {inc.docente_nombre || '—'}
                        </div>
                        <div>
                          <strong>Curso:</strong> {inc.curso_nombre || '—'}
                        </div>
                        <div>{inc.description || 'Sin descripción'}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      {modalAsistencias &&
        createPortal(
          <div className="modal-overlay-qr" onClick={() => setModalAsistencias(false)}>
            <div className="modal-content-estrellas" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header-qr">
                <h2>✅ Asistencias — {titulo}</h2>
                <button type="button" className="modal-close-qr" onClick={() => setModalAsistencias(false)}>
                  ×
                </button>
              </div>
              <div className="modal-body-estrellas">
                {loadingAsistencias ? (
                  <div className="qr-loading">Cargando…</div>
                ) : asistencias.length === 0 ? (
                  <div className="empty-state">No hay asistencias registradas</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: 6 }}>Fecha</th>
                        <th style={{ textAlign: 'left', padding: 6 }}>Tipo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {asistencias.map((a) => (
                        <tr key={a.id || `${a.fecha}-${a.tipo}`}>
                          <td style={{ padding: 6 }}>{fmtFecha(a.fecha)}</td>
                          <td style={{ padding: 6 }}>{a.tipo || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      {modalNotas &&
        createPortal(
          <div className="modal-overlay-qr" onClick={() => setModalNotas(false)}>
            <div className="modal-content-notas-detalladas" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header-qr">
                <h2>📊 Notas detalladas — {titulo}</h2>
                <button type="button" className="modal-close-qr" onClick={() => setModalNotas(false)}>
                  ×
                </button>
              </div>
              <div className="modal-body-notas-detalladas">
                {loadingNotas ? (
                  <div className="qr-loading">Cargando…</div>
                ) : !notasDetalladas?.asignaturas?.length ? (
                  <div className="empty-state">No hay notas registradas</div>
                ) : (
                  <>
                    <div className="notas-detalladas-controls">
                      <label>
                        Bimestre:{' '}
                        <select
                          className="select-bimestre"
                          value={cicloNotas}
                          onChange={(e) => setCicloNotas(parseInt(e.target.value, 10))}
                        >
                          <option value={1}>I</option>
                          <option value={2}>II</option>
                          <option value={3}>III</option>
                          <option value={4}>IV</option>
                        </select>
                      </label>
                    </div>
                    <div className="asignaturas-notas-container">
                      {notasDetalladas.asignaturas.map((asig) => (
                        <div key={asig.asignatura_id} className="asignatura-notas-card" style={{ marginBottom: 12 }}>
                          <h3>{asig.curso_nombre}</h3>
                          <table className="notas-detalladas-table">
                            <tbody>
                              {(asig.criterios || []).map((c) => {
                                const nota = c.notas?.[cicloNotas];
                                return (
                                  <tr key={c.id}>
                                    <th className="criterio-label">{c.descripcion}</th>
                                    <td className="criterio-notas">{nota != null && nota !== '' ? nota : '—'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
