import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../services/api';
import Swal from 'sweetalert2';
import ModalAsignarIndicadoresPlantilla from '../../components/admin/ModalAsignarIndicadoresPlantilla';
import './AdminConfigIndicadores.css';

const BIMESTRE_OPCIONES = [
  { value: 0, label: 'TODOS' },
  { value: 1, label: 'I Bimestre' },
  { value: 2, label: 'II Bimestre' },
  { value: 3, label: 'III Bimestre' },
  { value: 4, label: 'IV Bimestre' },
];

function etiquetaBimestre(ciclo) {
  const o = BIMESTRE_OPCIONES.find((x) => x.value === parseInt(ciclo, 10));
  return o ? o.label : String(ciclo);
}

function emptyItemForm() {
  return { descripcion: '', abreviatura: '', peso: '', ciclo: 0, cuadros: '6' };
}

export default function AdminConfigIndicadores() {
  const [plantillas, setPlantillas] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [plantilla, setPlantilla] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [itemForm, setItemForm] = useState(emptyItemForm);
  const [guardandoItem, setGuardandoItem] = useState(false);
  const [modalAsignar, setModalAsignar] = useState(false);

  const cargarLista = useCallback(async () => {
    const { data } = await api.get('/admin/indicadores-plantillas');
    setPlantillas(data.plantillas || []);
  }, []);

  const cargarDetalle = useCallback(async (id) => {
    if (!id) {
      setPlantilla(null);
      setItems([]);
      return;
    }
    setLoadingDetalle(true);
    try {
      const { data } = await api.get(`/admin/indicadores-plantillas/${id}`);
      setPlantilla(data.plantilla);
      setItems(data.items || []);
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error al cargar' });
    } finally {
      setLoadingDetalle(false);
    }
  }, []);

  useEffect(() => {
    cargarLista().finally(() => setLoading(false));
  }, [cargarLista]);

  useEffect(() => {
    cargarDetalle(selectedId);
  }, [selectedId, cargarDetalle]);

  const sumaPeso = useMemo(() => items.reduce((s, it) => s + (parseFloat(it.peso) || 0), 0), [items]);

  const crearPlantilla = async () => {
    const { value: nombre } = await Swal.fire({
      title: 'Nueva plantilla',
      input: 'text',
      inputPlaceholder: 'Indicadores 2026',
      showCancelButton: true,
    });
    if (!nombre?.trim()) return;
    try {
      const { data } = await api.post('/admin/indicadores-plantillas', { nombre: nombre.trim() });
      await cargarLista();
      setSelectedId(data.plantilla.id);
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error' });
    }
  };

  const renombrarPlantilla = async () => {
    if (!plantilla) return;
    const { value: nombre } = await Swal.fire({
      title: 'Renombrar',
      input: 'text',
      inputValue: plantilla.nombre,
      showCancelButton: true,
    });
    if (!nombre?.trim()) return;
    await api.put(`/admin/indicadores-plantillas/${plantilla.id}`, { nombre: nombre.trim() });
    await cargarLista();
    await cargarDetalle(plantilla.id);
  };

  const duplicarPlantilla = async () => {
    if (!plantilla) return;
    const { data } = await api.post(`/admin/indicadores-plantillas/${plantilla.id}/duplicar`, {});
    await cargarLista();
    setSelectedId(data.plantilla.id);
  };

  const eliminarPlantilla = async () => {
    if (!plantilla) return;
    const c = await Swal.fire({
      title: '¿Eliminar plantilla?',
      text: 'No afecta criterios ya copiados en asignaturas.',
      icon: 'warning',
      showCancelButton: true,
    });
    if (!c.isConfirmed) return;
    await api.delete(`/admin/indicadores-plantillas/${plantilla.id}`);
    setSelectedId(null);
    await cargarLista();
  };

  const guardarItem = async (e) => {
    e.preventDefault();
    if (!plantilla || !itemForm.descripcion.trim()) return;
    setGuardandoItem(true);
    try {
      const { data } = await api.post(`/admin/indicadores-plantillas/${plantilla.id}/items`, {
        descripcion: itemForm.descripcion.trim(),
        abreviatura: itemForm.abreviatura.trim(),
        peso: itemForm.peso === '' ? 0 : parseFloat(itemForm.peso),
        ciclo: parseInt(itemForm.ciclo, 10),
        cuadros: parseInt(itemForm.cuadros, 10) || 1,
      });
      setItems(data.items || []);
      setItemForm(emptyItemForm());
    } catch (err) {
      Swal.fire({ icon: 'error', text: err.response?.data?.error || 'Error' });
    } finally {
      setGuardandoItem(false);
    }
  };

  const eliminarItem = async (itemId) => {
    if (!plantilla) return;
    const c = await Swal.fire({ title: '¿Quitar ítem?', showCancelButton: true });
    if (!c.isConfirmed) return;
    const { data } = await api.delete(`/admin/indicadores-plantillas/${plantilla.id}/items/${itemId}`);
    setItems(data.items || []);
  };

  if (loading) {
    return (
      <div className="admin-ind-plantillas">
        <p>Cargando…</p>
      </div>
    );
  }

  return (
    <div className="admin-ind-plantillas">
      <div className="admin-ind-plantillas-header">
        <h1>Plantillas de indicadores</h1>
        <p>
          Para niveles cuantitativos. Editar la plantilla no cambia criterios ni notas ya copiados en asignaturas.
        </p>
      </div>
      <div className="admin-ind-plantillas-layout">
        <aside className="admin-ind-lista">
          <h2>Plantillas</h2>
          <ul>
            {plantillas.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={`admin-ind-lista-item ${selectedId === p.id ? 'active' : ''}`}
                  onClick={() => setSelectedId(p.id)}
                >
                  {p.nombre}
                  <small>{p.total_items || 0} ítem(s)</small>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="admin-ind-btn-nueva" onClick={crearPlantilla}>
            + Nueva plantilla
          </button>
        </aside>
        <section className="admin-ind-panel">
          {!plantilla ? (
            <p className="admin-ind-empty">Seleccione o cree una plantilla.</p>
          ) : loadingDetalle ? (
            <p>Cargando detalle…</p>
          ) : (
            <>
              <div className="admin-ind-panel-toolbar">
                <h2>{plantilla.nombre}</h2>
                <button type="button" className="admin-ind-btn" onClick={renombrarPlantilla}>Renombrar</button>
                <button type="button" className="admin-ind-btn" onClick={duplicarPlantilla}>Duplicar</button>
                <button type="button" className="admin-ind-btn admin-ind-btn-danger" onClick={eliminarPlantilla}>Eliminar</button>
                <button
                  type="button"
                  className="admin-ind-btn admin-ind-btn-primary"
                  onClick={() => setModalAsignar(true)}
                  disabled={!items.length}
                >
                  Asignar a asignaturas
                </button>
              </div>
              <div className="admin-ind-aviso">
                Los cambios aquí no modifican asignaturas ya configuradas. Use Asignar para copiar a cursos.
              </div>
              <form onSubmit={guardarItem} className="admin-ind-form-item">
                <div className="admin-ind-form-item--wide">
                  <label>Descripción *</label>
                  <input
                    value={itemForm.descripcion}
                    onChange={(e) => setItemForm((f) => ({ ...f, descripcion: e.target.value }))}
                    placeholder="Ej. Prácticas"
                    required
                  />
                </div>
                <div>
                  <label>Abreviatura</label>
                  <input
                    value={itemForm.abreviatura}
                    onChange={(e) => setItemForm((f) => ({ ...f, abreviatura: e.target.value }))}
                    placeholder="PRA"
                  />
                </div>
                <div>
                  <label>Peso %</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={itemForm.peso}
                    onChange={(e) => setItemForm((f) => ({ ...f, peso: e.target.value }))}
                  />
                </div>
                <div>
                  <label>Cuadros</label>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={itemForm.cuadros}
                    onChange={(e) => setItemForm((f) => ({ ...f, cuadros: e.target.value }))}
                  />
                </div>
                <div>
                  <label>Bimestre</label>
                  <select
                    value={itemForm.ciclo}
                    onChange={(e) => setItemForm((f) => ({ ...f, ciclo: parseInt(e.target.value, 10) }))}
                  >
                    {BIMESTRE_OPCIONES.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button type="submit" className="admin-ind-btn admin-ind-btn-primary" disabled={guardandoItem}>
                    {guardandoItem ? 'Guardando…' : '+ Agregar'}
                  </button>
                </div>
              </form>
              <p className={`admin-ind-suma-peso ${sumaPeso > 0 && Math.abs(sumaPeso - 100) > 0.01 ? 'warn' : ''}`}>
                Suma de pesos: {sumaPeso.toFixed(2)}%
              </p>
              <table className="admin-ind-tabla">
                <thead>
                  <tr>
                    <th>Descripción</th>
                    <th>Abrev.</th>
                    <th>Peso %</th>
                    <th>Cuadros</th>
                    <th>Bimestre</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id}>
                      <td>{it.descripcion}</td>
                      <td>{it.abreviatura}</td>
                      <td>{parseFloat(it.peso) || 0}</td>
                      <td>{it.cuadros}</td>
                      <td>{etiquetaBimestre(it.ciclo)}</td>
                      <td>
                        <button type="button" className="admin-ind-btn admin-ind-btn-danger" onClick={() => eliminarItem(it.id)}>🗑️</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!items.length && <p className="admin-ind-empty">Agregue ítems a la plantilla.</p>}
            </>
          )}
        </section>
      </div>
      <ModalAsignarIndicadoresPlantilla
        open={modalAsignar && !!plantilla}
        plantillaId={plantilla?.id}
        plantillaNombre={plantilla?.nombre}
        onClose={() => setModalAsignar(false)}
        onDone={cargarLista}
      />
    </div>
  );
}
