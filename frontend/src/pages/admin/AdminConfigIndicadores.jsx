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
  const [tabsAbiertos, setTabsAbiertos] = useState(true);

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

  useEffect(() => {
    if (!selectedId && plantillas.length > 0) {
      setSelectedId(plantillas[0].id);
    }
  }, [plantillas, selectedId]);

  const sumaPeso = useMemo(() => items.reduce((s, it) => s + (parseFloat(it.peso) || 0), 0), [items]);
  const pesoOk = items.length === 0 || Math.abs(sumaPeso - 100) <= 0.01;

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
      setTabsAbiertos(true);
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
    setTabsAbiertos(true);
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
    setPlantilla(null);
    setItems([]);
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
      await cargarLista();
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
    await cargarLista();
  };

  if (loading) {
    return (
      <div className="admin-ind-plantillas">
        <div className="admin-ind-loading">Cargando plantillas…</div>
      </div>
    );
  }

  return (
    <div className="admin-ind-plantillas">
      <header className="admin-ind-hero">
        <div className="admin-ind-hero-icon" aria-hidden="true">
          📐
        </div>
        <div className="admin-ind-hero-text">
          <h1>Plantillas de indicadores</h1>
          <p>
            Diseñe modelos de criterios para niveles cuantitativos y asígnelos por nivel, curso o asignatura.
            Editar la plantilla no cambia cursos ya configurados ni altera notas ya registradas.
          </p>
        </div>
      </header>

      <div className="admin-ind-tabs-bar">
        <div className="admin-ind-tabs-bar-top">
          <button
            type="button"
            className="admin-ind-tabs-toggle"
            onClick={() => setTabsAbiertos((v) => !v)}
            aria-expanded={tabsAbiertos}
          >
            <span aria-hidden="true">{tabsAbiertos ? '▾' : '▸'}</span>
            Plantillas ({plantillas.length})
          </button>
          <button type="button" className="admin-ind-btn-nueva" onClick={crearPlantilla}>
            + Nueva plantilla
          </button>
        </div>

        {tabsAbiertos && (
          <nav className="admin-ind-tabs" aria-label="Plantillas de indicadores">
            {plantillas.length === 0 && (
              <p className="admin-ind-tabs-empty">Aún no hay plantillas. Cree la primera.</p>
            )}
            {plantillas.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`admin-ind-tab ${selectedId === p.id ? 'is-active' : ''}`}
                onClick={() => setSelectedId(p.id)}
              >
                <span className="admin-ind-tab-icon" aria-hidden="true">
                  📋
                </span>
                <span className="admin-ind-tab-body">
                  <strong>{p.nombre}</strong>
                  <small>{p.total_items || 0} ítem(s)</small>
                </span>
              </button>
            ))}
          </nav>
        )}

        {!tabsAbiertos && plantilla && (
          <div className="admin-ind-tabs-collapsed-hint">
            Editando: <strong>{plantilla.nombre}</strong>
          </div>
        )}
      </div>

      <section className="admin-ind-panel">
        {!plantilla ? (
          <p className="admin-ind-empty">Seleccione o cree una plantilla.</p>
        ) : loadingDetalle ? (
          <div className="admin-ind-loading">Cargando detalle…</div>
        ) : (
          <>
            <div className="admin-ind-panel-toolbar">
              <div className="admin-ind-panel-title">
                <span className="admin-ind-panel-title-icon" aria-hidden="true">
                  ✏️
                </span>
                <h2>{plantilla.nombre}</h2>
              </div>
              <div className="admin-ind-panel-actions">
                <button type="button" className="admin-ind-btn" onClick={renombrarPlantilla}>
                  ✏️ Renombrar
                </button>
                <button type="button" className="admin-ind-btn" onClick={duplicarPlantilla}>
                  📄 Duplicar
                </button>
                <button type="button" className="admin-ind-btn admin-ind-btn-danger" onClick={eliminarPlantilla}>
                  🗑️ Eliminar
                </button>
                <button
                  type="button"
                  className="admin-ind-btn admin-ind-btn-primary"
                  onClick={() => setModalAsignar(true)}
                  disabled={!items.length}
                >
                  🚀 Asignar a asignaturas
                </button>
              </div>
            </div>

            <div className="admin-ind-aviso">
              <span className="admin-ind-aviso-icon" aria-hidden="true">
                💡
              </span>
              <div>
                Los cambios aquí no modifican asignaturas ya configuradas. Use{' '}
                <strong>Asignar</strong> para copiar a niveles, cursos o salas concretas. Cada asignatura
                guarda sus propios criterios: no afectan las notas de otros cursos.
              </div>
            </div>

            <div className="admin-ind-kpis">
              <div className={`admin-ind-kpi ${pesoOk ? 'admin-ind-kpi--ok' : 'admin-ind-kpi--warn'}`}>
                <span className="admin-ind-kpi-icon" aria-hidden="true">
                  ⚖️
                </span>
                <div>
                  <small>Suma de pesos</small>
                  <strong>{sumaPeso.toFixed(2)}%</strong>
                </div>
              </div>
              <div className="admin-ind-kpi admin-ind-kpi--items">
                <span className="admin-ind-kpi-icon" aria-hidden="true">
                  📦
                </span>
                <div>
                  <small>Ítems</small>
                  <strong>{items.length}</strong>
                </div>
              </div>
            </div>

            <form onSubmit={guardarItem} className="admin-ind-form-item">
              <div className="admin-ind-form-item-head">Agregar indicador a la plantilla</div>
              <div className="admin-ind-form-item--wide">
                <label htmlFor="ind-desc">Descripción *</label>
                <input
                  id="ind-desc"
                  value={itemForm.descripcion}
                  onChange={(e) => setItemForm((f) => ({ ...f, descripcion: e.target.value }))}
                  placeholder="Ej. Prácticas"
                  required
                />
              </div>
              <div>
                <label htmlFor="ind-abr">Abreviatura</label>
                <input
                  id="ind-abr"
                  value={itemForm.abreviatura}
                  onChange={(e) => setItemForm((f) => ({ ...f, abreviatura: e.target.value }))}
                  placeholder="PRA"
                />
              </div>
              <div>
                <label htmlFor="ind-peso">Peso %</label>
                <input
                  id="ind-peso"
                  type="number"
                  min="0"
                  step="0.01"
                  value={itemForm.peso}
                  onChange={(e) => setItemForm((f) => ({ ...f, peso: e.target.value }))}
                />
              </div>
              <div>
                <label htmlFor="ind-cuadros">Cuadros</label>
                <input
                  id="ind-cuadros"
                  type="number"
                  min="1"
                  max="30"
                  value={itemForm.cuadros}
                  onChange={(e) => setItemForm((f) => ({ ...f, cuadros: e.target.value }))}
                />
              </div>
              <div>
                <label htmlFor="ind-ciclo">Bimestre</label>
                <select
                  id="ind-ciclo"
                  value={itemForm.ciclo}
                  onChange={(e) => setItemForm((f) => ({ ...f, ciclo: parseInt(e.target.value, 10) }))}
                >
                  {BIMESTRE_OPCIONES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="admin-ind-form-item-actions">
                <button type="submit" className="admin-ind-btn admin-ind-btn-primary" disabled={guardandoItem}>
                  {guardandoItem ? 'Guardando…' : '+ Agregar'}
                </button>
              </div>
            </form>

            <div className="admin-ind-tabla-wrap">
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
                      <td>
                        <span className="admin-ind-abr">{it.abreviatura || '—'}</span>
                      </td>
                      <td>{parseFloat(it.peso) || 0}</td>
                      <td>{it.cuadros}</td>
                      <td>
                        <span className={`admin-ind-bim admin-ind-bim--${parseInt(it.ciclo, 10) || 0}`}>
                          {etiquetaBimestre(it.ciclo)}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="admin-ind-btn admin-ind-btn-danger admin-ind-btn-icon"
                          onClick={() => eliminarItem(it.id)}
                          aria-label="Eliminar ítem"
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!items.length && <p className="admin-ind-empty">Agregue ítems a la plantilla.</p>}
            </div>
          </>
        )}
      </section>

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
