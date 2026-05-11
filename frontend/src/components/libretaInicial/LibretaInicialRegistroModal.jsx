import React, { useCallback, useEffect, useState } from 'react';
import api from '../../services/api';
import Swal from 'sweetalert2';
import './libretaInicialDocente.css';

const NOTAS = ['', 'AD', 'A', 'B', 'C'];

function flattenIndicadores(areas) {
  const list = [];
  (areas || []).forEach((a) => {
    (a.indicadores || []).forEach((ind) => {
      list.push({ ...ind, areaNombre: a.nombre });
    });
  });
  return list;
}

export default function LibretaInicialRegistroModal({ grupo, onClose }) {
  const grupoId = grupo?.id;
  const [loading, setLoading] = useState(true);
  const [ciclo, setCiclo] = useState(1);
  const [areas, setAreas] = useState([]);
  const [alumnos, setAlumnos] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [edit, setEdit] = useState(null);

  const load = useCallback(
    async (opts = {}) => {
      if (!grupoId) return;
      try {
        setLoading(true);
        const { data } = await api.get(`/docente/grupos/${grupoId}/libreta-inicial/registro`, {
          params: { ciclo }
        });
        const nextAreas = data.areas || [];
        const nextAlumnos = data.alumnos || [];
        setAreas(nextAreas);
        setAlumnos(nextAlumnos);
        const mid = opts.keepExpandedMatriculaId;
        if (mid) {
          const al = nextAlumnos.find((x) => Number(x.matricula_id) === Number(mid));
          if (al) {
            const nextFlat = flattenIndicadores(nextAreas);
            const vals = {};
            nextFlat.forEach((ind) => {
              const v = (al.valores && al.valores[ind.id]) || {};
              vals[ind.id] = { detalle: v.detalle || '', nota: v.nota || '' };
            });
            setExpanded(mid);
            setEdit({
              matricula_id: al.matricula_id,
              nombre: al.nombre_completo,
              recomendacion: al.recomendacion || '',
              vals
            });
            return;
          }
        }
        setExpanded(null);
        setEdit(null);
      } catch (e) {
        const msg = e.response?.data?.error || e.message || 'No se pudo cargar';
        await Swal.fire({ icon: 'error', title: 'Error', text: msg });
        onClose();
      } finally {
        setLoading(false);
      }
    },
    [grupoId, ciclo, onClose]
  );

  useEffect(() => {
    load();
  }, [load]);

  const openAlumno = (al) => {
    const nextFlat = flattenIndicadores(areas);
    if (nextFlat.length === 0) {
      Swal.fire({
        icon: 'info',
        title: 'Sin indicadores',
        text: 'Primero defina áreas e indicadores en el otro submenú.'
      });
      return;
    }
    const vals = {};
    nextFlat.forEach((ind) => {
      const v = (al.valores && al.valores[ind.id]) || {};
      vals[ind.id] = { detalle: v.detalle || '', nota: v.nota || '' };
    });
    setExpanded(al.matricula_id);
    setEdit({
      matricula_id: al.matricula_id,
      nombre: al.nombre_completo,
      recomendacion: al.recomendacion || '',
      vals
    });
  };

  const setVal = (indId, field, value) => {
    setEdit((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        vals: {
          ...prev.vals,
          [indId]: { ...prev.vals[indId], [field]: value }
        }
      };
    });
  };

  const guardarAlumno = async () => {
    if (!edit) return;
    const nextFlat = flattenIndicadores(areas);
    const valores = nextFlat.map((ind) => ({
      indicador_id: ind.id,
      detalle: edit.vals[ind.id]?.detalle ?? '',
      nota: edit.vals[ind.id]?.nota || ''
    }));
    try {
      await api.post(`/docente/grupos/${grupoId}/libreta-inicial/guardar-alumno`, {
        ciclo,
        matricula_id: edit.matricula_id,
        valores,
        recomendacion: edit.recomendacion
      });
      await Swal.fire({ icon: 'success', title: 'Guardado', timer: 1400, showConfirmButton: false });
      await load({ keepExpandedMatriculaId: edit.matricula_id });
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudo guardar' });
    }
  };

  const tituloGrupo = `${grupo?.grado}° ${grupo?.seccion || ''} — ${grupo?.nivel_nombre || ''}`;

  return (
    <div className="li-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="li-modal" role="dialog" aria-labelledby="li-reg-title" onClick={(e) => e.stopPropagation()}>
        <div className="li-modal-header">
          <div>
            <h2 id="li-reg-title">Registrar notas y detalles</h2>
            <p className="li-modal-sub">{tituloGrupo}</p>
          </div>
          <button type="button" className="li-btn-close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div className="li-modal-body">
          <div className="li-ciclo-row">
            <label htmlFor="li-ciclo-sel">Bimestre:</label>
            <select
              id="li-ciclo-sel"
              className="li-input"
              value={ciclo}
              onChange={(e) => setCiclo(parseInt(e.target.value, 10))}
            >
              <option value={1}>I</option>
              <option value={2}>II</option>
              <option value={3}>III</option>
              <option value={4}>IV</option>
            </select>
          </div>

          {loading ? (
            <div className="li-loading">Cargando…</div>
          ) : (
            <>
              <p style={{ color: '#64748b', fontSize: '0.88rem', marginTop: 0 }}>
                Abra un alumno, complete el detalle y la nota por indicador, y use <strong>Guardar este alumno</strong>{' '}
                antes de cerrar o cambiar de alumno para no perder cambios.
              </p>
              {(alumnos || []).map((al) => (
                <div key={al.matricula_id} className="li-accordion">
                  <button
                    type="button"
                    className="li-accordion-head"
                    onClick={() => {
                      if (expanded === al.matricula_id) {
                        setExpanded(null);
                        setEdit(null);
                      } else {
                        openAlumno(al);
                      }
                    }}
                  >
                    <span>
                      {expanded === al.matricula_id ? '▼' : '▶'} {al.nombre_completo}
                    </span>
                  </button>
                  {expanded === al.matricula_id && edit && (
                    <div className="li-accordion-body">
                      {areas.map((ar) => (
                        <div key={ar.id} style={{ marginBottom: '1rem' }}>
                          <div style={{ fontWeight: 700, marginBottom: '0.35rem', color: '#334155' }}>{ar.nombre}</div>
                          <table className="li-table-mini">
                            <thead>
                              <tr>
                                <th>Indicador</th>
                                <th>Descripción / detalle</th>
                                <th style={{ width: 88 }}>Nota</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(ar.indicadores || []).map((ind) => (
                                <tr key={ind.id}>
                                  <td>{ind.descripcion}</td>
                                  <td>
                                    <textarea
                                      className="li-textarea-detalle"
                                      value={edit.vals[ind.id]?.detalle ?? ''}
                                      onChange={(e) => setVal(ind.id, 'detalle', e.target.value)}
                                    />
                                  </td>
                                  <td>
                                    <select
                                      className="li-input li-select-nota"
                                      value={edit.vals[ind.id]?.nota ?? ''}
                                      onChange={(e) => setVal(ind.id, 'nota', e.target.value)}
                                    >
                                      {NOTAS.map((n) => (
                                        <option key={n || 'empty'} value={n}>
                                          {n || '—'}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ))}

                      <div className="li-recomendaciones">
                        <label htmlFor={`rec-${edit.matricula_id}`}>Recomendaciones (tutoría / libreta)</label>
                        <textarea
                          id={`rec-${edit.matricula_id}`}
                          className="li-textarea-detalle"
                          style={{ minHeight: 80 }}
                          value={edit.recomendacion}
                          onChange={(e) => setEdit((p) => (p ? { ...p, recomendacion: e.target.value } : p))}
                          placeholder="Observaciones generales para la familia…"
                        />
                      </div>

                      <div className="li-toolbar" style={{ marginTop: '0.75rem' }}>
                        <button type="button" className="li-btn li-btn-primary" onClick={guardarAlumno}>
                          Guardar este alumno
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
