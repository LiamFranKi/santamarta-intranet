import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import api from '../../services/api';
import Swal from 'sweetalert2';
import '../../pages/DocenteCursos.css';

const BIMESTRE_OPCIONES = [
  { value: 0, label: 'TODOS' },
  { value: 1, label: 'I Bimestre' },
  { value: 2, label: 'II Bimestre' },
  { value: 3, label: 'III Bimestre' },
  { value: 4, label: 'IV Bimestre' },
];

function etiquetaBimestre(ciclo) {
  const n = parseInt(ciclo, 10);
  if (n === 0) return 'TODOS';
  const opt = BIMESTRE_OPCIONES.find((o) => o.value === n);
  return opt ? opt.label : `Bimestre ${n}`;
}

function emptyForm() {
  return { descripcion: '', abreviatura: '', bimestre: 1, peso: '', cuadros: '1' };
}

function formDesdeCriterio(c) {
  return {
    descripcion: c.descripcion || '',
    abreviatura: c.abreviatura || '',
    bimestre: parseInt(c.ciclo, 10) ?? 1,
    peso: c.peso != null && c.peso !== '' ? String(parseFloat(c.peso) || 0) : '',
    cuadros: String(c.indicadores?.[0]?.cuadros ?? 1),
  };
}

export default function ModalCriteriosIndicadoresAsignatura({ open, asignaturaId, onClose, onChanged }) {
  const [loading, setLoading] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [criterios, setCriterios] = useState([]);
  const [infoCurso, setInfoCurso] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [criterioEditandoId, setCriterioEditandoId] = useState(null);

  const esCuantitativa = infoCurso?.tipo_calificacion === 1;
  const modoEdicion = criterioEditandoId != null;

  const cargarCriterios = useCallback(async (cursoId) => {
    if (!cursoId) return;
    try {
      setLoading(true);
      const response = await api.get(`/docente/cursos/${cursoId}/criterios`);
      setCriterios(response.data.criterios || []);
      if (response.data.curso) setInfoCurso(response.data.curso);
    } catch (error) {
      setCriterios([]);
      Swal.fire({ icon: 'error', text: error.response?.data?.error || 'No se pudieron cargar los criterios' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || asignaturaId == null || String(asignaturaId).trim() === '') {
      setCriterios([]);
      setInfoCurso(null);
      setForm(emptyForm());
      setCriterioEditandoId(null);
      return;
    }
    cargarCriterios(asignaturaId);
  }, [open, asignaturaId, cargarCriterios]);

  const cancelarEdicion = () => {
    setCriterioEditandoId(null);
    setForm(emptyForm());
  };

  const cerrar = () => {
    cancelarEdicion();
    onClose();
  };

  const abrirEditar = (criterio) => {
    setCriterioEditandoId(criterio.id);
    setForm(formDesdeCriterio(criterio));
  };

  const eliminarCriterio = async (criterioId) => {
    const result = await Swal.fire({
      title: '¿Eliminar criterio?',
      text: 'Tenga cuidado: esto afectará el registro de notas.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    });
    if (!result.isConfirmed) return;
    try {
      await api.delete(`/docente/cursos/${asignaturaId}/criterios/${criterioId}`);
      Swal.fire('Eliminado', 'Criterio eliminado correctamente', 'success');
      if (criterioEditandoId === criterioId) cancelarEdicion();
      await cargarCriterios(asignaturaId);
      onChanged?.();
    } catch (error) {
      Swal.fire('Error', error.response?.data?.error || 'No se pudo eliminar', 'error');
    }
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (!form.descripcion?.trim()) {
      Swal.fire('Campo requerido', 'La descripción es obligatoria', 'warning');
      return;
    }
    if (esCuantitativa && form.peso !== '' && Number.isNaN(parseFloat(form.peso))) {
      Swal.fire('Campo inválido', 'El peso debe ser un número', 'warning');
      return;
    }
    try {
      setGuardando(true);
      const payload = {
        descripcion: form.descripcion.trim(),
        abreviatura: form.abreviatura.trim(),
        ciclo: form.bimestre,
      };
      if (esCuantitativa) {
        payload.peso = form.peso === '' ? 0 : parseFloat(form.peso);
        payload.cuadros = Math.max(1, parseInt(form.cuadros, 10) || 1);
      }

      if (modoEdicion) {
        await api.put(`/docente/cursos/${asignaturaId}/criterios/${criterioEditandoId}`, payload);
        Swal.fire('¡Éxito!', 'Criterio actualizado correctamente', 'success');
        cancelarEdicion();
      } else {
        await api.post(`/docente/cursos/${asignaturaId}/criterios`, payload);
        Swal.fire('¡Éxito!', 'Criterio registrado correctamente', 'success');
        setForm((prev) => ({ ...emptyForm(), bimestre: prev.bimestre, peso: prev.peso }));
      }

      await cargarCriterios(asignaturaId);
      onChanged?.();
    } catch (error) {
      Swal.fire('Error', error.response?.data?.error || 'No se pudo guardar', 'error');
    } finally {
      setGuardando(false);
    }
  };

  if (!open || asignaturaId == null || String(asignaturaId).trim() === '') return null;

  const tituloCurso = infoCurso
    ? `${infoCurso.curso_nombre || 'Asignatura'} - ${infoCurso.nivel_nombre || ''}`.trim()
    : 'Cargando…';

  const instruccion = esCuantitativa
    ? 'Ingrese el criterio de evaluación. Use TODOS si aplica a todos los bimestres. El peso es el porcentaje del criterio.'
    : 'Ingrese el indicador de aprendizaje. El peso es 0 para nivel Inicial. Use TODOS si aplica a todos los bimestres.';

  return createPortal(
    <div
      className="modal-overlay modal-overlay-indicadores"
      onClick={cerrar}
      style={{ zIndex: 100000 }}
      role="presentation"
    >
      <div
        className="modal-container modal-indicadores modal-indicadores--wide"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-criterios-title"
      >
        <div className="modal-header-indicadores">
            <div className="modal-header-gradient-indicadores">
            <h2 id="modal-criterios-title">📋 Criterios / Indicadores</h2>
            <p className="modal-indicadores-subtitle">{tituloCurso}</p>
          </div>
          <button type="button" className="modal-close modal-close-indicadores" onClick={cerrar} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="modal-body-indicadores">
          <div className="modal-indicadores-instruction">{instruccion}</div>
          {modoEdicion && (
            <p className="indicadores-advertencia" style={{ background: '#eff6ff', borderColor: '#93c5fd', color: '#1e40af' }}>
              Editando criterio seleccionado. Al reducir cuadros, no puede quedar por debajo de notas ya registradas.
            </p>
          )}
          <form onSubmit={guardar} className="form-indicadores">
            <div className="form-group-indicadores">
              <label htmlFor="crit-descripcion">Descripción <span className="text-required">*</span></label>
              <input id="crit-descripcion" type="text" className="input-indicadores" placeholder="Ej: Prácticas" value={form.descripcion} onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))} required />
            </div>
            <div className="form-indicadores-row">
              <div className="form-group-indicadores form-group-indicadores--inline">
                <label htmlFor="crit-abrev">Abreviatura</label>
                <input id="crit-abrev" type="text" className="input-indicadores" placeholder="Ej: PRA" value={form.abreviatura} onChange={(e) => setForm((p) => ({ ...p, abreviatura: e.target.value }))} />
              </div>
              {esCuantitativa && (
                <div className="form-group-indicadores form-group-indicadores--inline">
                  <label htmlFor="crit-peso">Peso %</label>
                  <input
                    id="crit-peso"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    className="input-indicadores input-peso"
                    placeholder="Ej: 20"
                    value={form.peso}
                    onChange={(e) => setForm((p) => ({ ...p, peso: e.target.value }))}
                  />
                </div>
              )}
              {esCuantitativa && (
                <div className="form-group-indicadores form-group-indicadores--inline">
                  <label htmlFor="crit-cuadros">Cuadros</label>
                  <input
                    id="crit-cuadros"
                    type="number"
                    min="1"
                    max="30"
                    className="input-indicadores input-peso"
                    placeholder="Ej: 6"
                    value={form.cuadros}
                    onChange={(e) => setForm((p) => ({ ...p, cuadros: e.target.value }))}
                  />
                </div>
              )}
              <div className="form-group-indicadores form-group-indicadores--inline">
                <label htmlFor="crit-bim">Bimestre</label>
                <select id="crit-bim" className="input-indicadores select-bimestre" value={form.bimestre} onChange={(e) => setForm((p) => ({ ...p, bimestre: parseInt(e.target.value, 10) }))}>
                  {BIMESTRE_OPCIONES.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
                </select>
              </div>
            </div>
            <div className="modal-indicadores-footer">
              {modoEdicion ? (
                <button type="button" className="btn-indicadores btn-cancelar-indicadores" onClick={cancelarEdicion} disabled={guardando}>
                  Cancelar edición
                </button>
              ) : (
                <button type="button" className="btn-indicadores btn-cancelar-indicadores" onClick={cerrar} disabled={guardando}>
                  Cancelar
                </button>
              )}
              <button type="submit" className="btn-indicadores btn-guardar-indicadores" disabled={guardando}>
                {guardando ? '⏳ Guardando...' : modoEdicion ? '💾 Actualizar criterio' : '💾 Guardar Datos'}
              </button>
            </div>
          </form>
          <div className="indicadores-lista-section">
            <h3 className="indicadores-lista-title">Criterios registrados</h3>
            <p className="indicadores-advertencia">Tenga cuidado al borrar un criterio, ya que esto afectará el registro de notas.</p>
            {loading ? (
              <div className="indicadores-loading"><div className="spinner-ring" /><span>Cargando...</span></div>
            ) : criterios.length === 0 ? (
              <p className="indicadores-empty">No hay criterios registrados.</p>
            ) : (
              <div className="criterios-tabla-wrap">
                <table className="criterios-tabla">
                  <thead><tr><th>Descripción</th>{esCuantitativa && <th>Peso %</th>}{esCuantitativa && <th>Cuadros</th>}<th>Bimestre</th><th /></tr></thead>
                  <tbody>
                    {criterios.map((c) => (
                      <tr key={c.id} className={criterioEditandoId === c.id ? 'criterio-fila-editando' : undefined}>
                        <td><span className="criterio-desc-cell">{c.descripcion}</span>{c.abreviatura && <span className="indicador-abrev">{c.abreviatura}</span>}</td>
                        {esCuantitativa && <td className="criterio-peso-cell">{parseFloat(c.peso) || 0}</td>}
                        {esCuantitativa && (
                          <td>{c.indicadores?.[0]?.cuadros ?? 1}</td>
                        )}
                        <td>{etiquetaBimestre(c.ciclo)}</td>
                        <td className="criterio-acciones-cell">
                          <button type="button" className="btn-editar-indicador" onClick={() => abrirEditar(c)} title="Editar" aria-label="Editar">✏️</button>
                          <button type="button" className="btn-eliminar-indicador" onClick={() => eliminarCriterio(c.id)} title="Eliminar" aria-label="Eliminar">🗑️</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
