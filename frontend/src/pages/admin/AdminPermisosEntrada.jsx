import React, { useCallback, useEffect, useState } from 'react';
import api from '../../services/api';
import Swal from 'sweetalert2';

const ALCANCES = [
  { id: 'TODOS', label: 'Todo el personal' },
  { id: 'DOCENTES', label: 'Solo docentes' },
  { id: 'PERSONAL', label: 'Solo personal administrativo' },
  { id: 'INDIVIDUAL', label: 'Una persona' },
];

const VACIO = {
  nombre: '',
  alcance: 'TODOS',
  personal_id: '',
  fecha_desde: '',
  fecha_hasta: '',
  hora_entrada: '08:00',
  hora_salida: '',
};

function etiquetaAlcance(p) {
  if (p.alcance === 'INDIVIDUAL') return p.personal_nombre || 'Una persona';
  return ALCANCES.find((a) => a.id === p.alcance)?.label || p.alcance;
}

function fmtDia(iso) {
  const [y, m, d] = String(iso || '').slice(0, 10).split('-');
  if (!d) return iso || '—';
  return `${d}/${m}/${y}`;
}

export default function AdminPermisosEntrada() {
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [permisos, setPermisos] = useState([]);
  const [personal, setPersonal] = useState([]);
  const [form, setForm] = useState(VACIO);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const { data } = await api.get('/admin/permisos-entrada');
      setPermisos(Array.isArray(data?.permisos) ? data.permisos : []);
      setPersonal(Array.isArray(data?.personal) ? data.personal : []);
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudieron leer los permisos',
        text: e.response?.data?.error || e.message || '',
      });
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const setCampo = (campo, valor) => setForm((prev) => ({ ...prev, [campo]: valor }));

  const guardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      const { data } = await api.post('/admin/permisos-entrada', {
        ...form,
        personal_id: form.alcance === 'INDIVIDUAL' ? form.personal_id : null,
        hora_salida: form.hora_salida || null,
      });
      setPermisos(Array.isArray(data?.permisos) ? data.permisos : []);
      setForm(VACIO);
      Swal.fire({ icon: 'success', title: 'Permiso guardado', timer: 1400, showConfirmButton: false });
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'No se guardó',
        text: err.response?.data?.error || err.message || '',
      });
    } finally {
      setGuardando(false);
    }
  };

  const quitar = async (p) => {
    const ok = await Swal.fire({
      icon: 'warning',
      title: 'Quitar este permiso',
      text: 'Los días que cubría vuelven a usar la hora de entrada de cada ficha.',
      showCancelButton: true,
      confirmButtonText: 'Quitar',
      cancelButtonText: 'Cancelar',
    });
    if (!ok.isConfirmed) return;
    try {
      const { data } = await api.delete(`/admin/permisos-entrada/${p.id}`);
      setPermisos(Array.isArray(data?.permisos) ? data.permisos : []);
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'No se quitó', text: err.response?.data?.error || '' });
    }
  };

  return (
    <div className="config-panel-card config-panel-card--spaced">
      <div className="config-panel-card-header config-panel-card-header--sky">
        <span className="config-panel-card-ico" aria-hidden="true">⏱</span>
        Permisos de entrada
      </div>
      <div className="config-section">
        <p className="config-section-hint">
          En los días del permiso, esa hora reemplaza la de la ficha solo si es más tarde.
          El permiso de una persona gana sobre el del grupo. La marcación real no se cambia.
          La hora de salida queda guardada y todavía no descuenta.
        </p>

        <form onSubmit={guardar} className="form-grid">
          <div className="form-group">
            <label>Nombre</label>
            <input
              value={form.nombre}
              onChange={(e) => setCampo('nombre', e.target.value)}
              placeholder="Ej. Semana de gestión"
              maxLength={120}
            />
          </div>
          <div className="form-group">
            <label>Aplica a</label>
            <select value={form.alcance} onChange={(e) => setCampo('alcance', e.target.value)}>
              {ALCANCES.map((a) => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </select>
          </div>
          {form.alcance === 'INDIVIDUAL' && (
            <div className="form-group">
              <label>Persona</label>
              <select
                value={form.personal_id}
                onChange={(e) => setCampo('personal_id', e.target.value)}
                required
              >
                <option value="">Elegir…</option>
                {personal.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}{p.hora_entrada ? ` · entra ${p.hora_entrada}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="form-group">
            <label>Desde</label>
            <input type="date" required value={form.fecha_desde} onChange={(e) => setCampo('fecha_desde', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Hasta</label>
            <input type="date" required value={form.fecha_hasta} onChange={(e) => setCampo('fecha_hasta', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Puede entrar hasta</label>
            <input type="time" required value={form.hora_entrada} onChange={(e) => setCampo('hora_entrada', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Hora de salida (opcional)</label>
            <input type="time" value={form.hora_salida} onChange={(e) => setCampo('hora_salida', e.target.value)} />
          </div>
          <div className="card-actions">
            <button type="submit" className="btn-submit-card" disabled={guardando || cargando}>
              {guardando ? 'Guardando…' : 'Agregar permiso'}
            </button>
          </div>
        </form>

        {cargando ? (
          <p className="config-section-hint">Cargando permisos…</p>
        ) : permisos.length === 0 ? (
          <p className="config-section-hint">Todavía no hay permisos. Cada quien entra a su hora de ficha.</p>
        ) : (
          <div className="permiso-entrada-tabla">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Aplica a</th>
                  <th>Días</th>
                  <th>Entrada</th>
                  <th>Salida</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {permisos.map((p) => (
                  <tr key={p.id}>
                    <td>{p.nombre || '—'}</td>
                    <td>{etiquetaAlcance(p)}</td>
                    <td>{fmtDia(p.fecha_desde)} – {fmtDia(p.fecha_hasta)}</td>
                    <td>{p.hora_entrada || '—'}</td>
                    <td>{p.hora_salida || '—'}</td>
                    <td>
                      <button type="button" className="btn-submit-card" onClick={() => quitar(p)}>
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
