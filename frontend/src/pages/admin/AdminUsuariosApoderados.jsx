import React, { useCallback, useEffect, useState } from 'react';
import api from '../../services/api';
import Swal from 'sweetalert2';
import './AdminUsuarios.css';

const PARENTESCO_LABEL = {
  1: 'Padre',
  2: 'Madre',
  3: 'Tutor',
  4: 'Apoderado',
};

function nombreApoderado(row) {
  const ap = (row.apellido_paterno || '').trim();
  const am = (row.apellido_materno || '').trim();
  const nom = (row.nombres || '').trim();
  const full = [ap, am].filter(Boolean).join(' ');
  if (full && nom) return `${full}, ${nom}`;
  return `${full} ${nom}`.trim() || '—';
}

export default function AdminUsuariosApoderados() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [openMenu, setOpenMenu] = useState(null);

  const [modalCreate, setModalCreate] = useState(false);
  const [modalEdit, setModalEdit] = useState(null);
  const [form, setForm] = useState({});

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/usuarios/apoderados', {
        params: { page, limit, search: search.trim() },
      });
      setItems(data.data || []);
      setTotal(data.total || 0);
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo cargar',
      });
    } finally {
      setLoading(false);
    }
  }, [page, limit, search]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cerrarMenus = () => setOpenMenu(null);

  const abrirCrear = () => {
    setForm({
      nombres: '',
      apellido_paterno: '',
      apellido_materno: '',
      nro_documento: '',
      email: '',
      telefono_celular: '',
      parentesco: 1,
      fecha_nacimiento: '1985-01-01',
    });
    setModalCreate(true);
  };

  const payloadApoderado = (f) => ({
    nombres: f.nombres,
    apellido_paterno: f.apellido_paterno,
    apellido_materno: f.apellido_materno,
    nro_documento: f.nro_documento,
    email: f.email,
    telefono_celular: f.telefono_celular,
    parentesco: f.parentesco,
    fecha_nacimiento: f.fecha_nacimiento,
  });

  const buscarDesdePersonal = async () => {
    const dni = String(form.nro_documento || '').trim();
    if (!dni) {
      Swal.fire({ icon: 'info', title: 'DNI', text: 'Escriba el DNI y pulse de nuevo para buscar en personal.' });
      return;
    }
    try {
      const { data } = await api.get('/admin/usuarios/personal-por-dni', { params: { dni } });
      if (!data.encontrado) {
        Swal.fire({ icon: 'info', title: 'Sin coincidencia', text: 'No hay ficha en personal con ese DNI en este colegio.' });
        return;
      }
      setForm((prev) => ({
        ...prev,
        nombres: data.nombres || prev.nombres,
        apellido_paterno: data.apellido_paterno || prev.apellido_paterno,
        apellido_materno: data.apellido_materno || prev.apellido_materno,
        nro_documento: data.nro_documento || prev.nro_documento,
        email: data.email || prev.email,
        telefono_celular: data.telefono_celular || prev.telefono_celular,
        fecha_nacimiento: data.fecha_nacimiento || prev.fecha_nacimiento,
      }));
      Swal.fire({ icon: 'success', title: 'Datos cargados', text: 'Revise parentesco y guarde. Si es docente, se reutilizará su mismo usuario (DNI).', timer: 2800, showConfirmButton: false });
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudo buscar' });
    }
  };

  const guardarNuevo = async () => {
    try {
      const { data } = await api.post('/admin/usuarios/apoderados', payloadApoderado(form));
      if (data.usuario_compartido) {
        Swal.fire({
          icon: 'info',
          title: 'Apoderado registrado',
          html: `<p>${data.mensaje || 'Se vinculó a la cuenta existente (mismo DNI).'}</p><p style="margin-top:0.75rem;color:#6b7280;font-size:0.95rem">Perfil intranet: <strong>${data.usuario_tipo || 'personal'}</strong>. No hace falta otro login.</p>`,
        });
      } else {
        Swal.fire({ icon: 'success', title: 'Apoderado registrado', text: 'Usuario y clave = DNI' });
      }
      setModalCreate(false);
      cargar();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudo guardar' });
    }
  };

  const abrirEditar = async (row) => {
    try {
      const { data } = await api.get(`/admin/usuarios/apoderados/${row.id}`);
      setForm({
        nombres: data.nombres || '',
        apellido_paterno: data.apellido_paterno || '',
        apellido_materno: data.apellido_materno || '',
        nro_documento: data.nro_documento || '',
        email: data.email || '',
        telefono_celular: data.telefono_celular || '',
        parentesco: data.parentesco ?? 1,
        usuario_estado: data.usuario_estado || 'ACTIVO',
      });
      setModalEdit(row.id);
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudo cargar' });
    }
  };

  const guardarEdit = async () => {
    try {
      await api.put(`/admin/usuarios/apoderados/${modalEdit}`, {
        ...payloadApoderado(form),
        usuario_estado: form.usuario_estado,
      });
      Swal.fire({ icon: 'success', title: 'Actualizado' });
      setModalEdit(null);
      cargar();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudo guardar' });
    }
  };

  const infoAcceso = (row) => {
    if (!row.usuario_id) {
      Swal.fire({ title: 'Acceso', html: '<p>Sin usuario. Use <strong>Crear acceso</strong>.</p>' });
      return;
    }
    const extra =
      row.usuario_tipo && row.usuario_tipo !== 'APODERADO'
        ? `<p style="margin-top:0.75rem;color:#5b21b6">Usa la misma cuenta de <strong>${row.usuario_tipo}</strong> (un solo login).</p>`
        : '';
    Swal.fire({
      title: 'Información de acceso',
      html: `<p><strong>Usuario:</strong> ${row.login_usuario || row.nro_documento}</p>
        <p><strong>Contraseña por defecto:</strong> DNI</p>${extra}`,
    });
  };

  const resetPass = async (row) => {
    const ok = await Swal.fire({ title: '¿Restablecer al DNI?', showCancelButton: true });
    if (!ok.isConfirmed) return;
    try {
      await api.post(`/admin/usuarios/apoderados/${row.id}/reset-password`);
      Swal.fire({ icon: 'success', title: 'Listo' });
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error' });
    }
  };

  const crearAcceso = async (row) => {
    try {
      const { data } = await api.post(`/admin/usuarios/apoderados/${row.id}/acceso`);
      if (data.usuario_compartido) {
        Swal.fire({
          icon: 'success',
          title: 'Vinculado',
          text: 'Se asoció la ficha de apoderado al usuario de personal/docente con el mismo DNI.',
        });
      } else {
        Swal.fire({ icon: 'success', title: 'Acceso creado', text: 'Usuario y clave = DNI' });
      }
      cargar();
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error' });
    }
  };

  const verInfo = (row) => {
    const par = PARENTESCO_LABEL[row.parentesco] || `Código ${row.parentesco}`;
    Swal.fire({
      title: nombreApoderado(row),
      html: `<div style="text-align:left">
        <p><strong>Documento:</strong> ${row.nro_documento}</p>
        <p><strong>Parentesco:</strong> ${par}</p>
        <p><strong>Email:</strong> ${row.email || '—'}</p>
        <p><strong>Celular:</strong> ${row.telefono_celular || '—'}</p>
      </div>`,
      width: 440,
    });
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="admin-usu-wrap" onClick={cerrarMenus}>
      <div className="admin-usu-header">
        <h1>Apoderados</h1>
        <p>Padres de familia del colegio. Usuario y contraseña por defecto: DNI.</p>
      </div>

      <div className="admin-usu-toolbar" onClick={(e) => e.stopPropagation()}>
        <input
          type="search"
          className="admin-usu-grow"
          placeholder="Nombres, apellidos o DNI…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && cargar()}
        />
        <button type="button" className="admin-usu-btn admin-usu-btn-search" onClick={() => { setPage(1); cargar(); }}>
          Buscar
        </button>
        <button type="button" className="admin-usu-btn admin-usu-btn-new" onClick={abrirCrear}>
          + Registrar nuevo
        </button>
      </div>

      <div className="admin-usu-table-card">
        <table className="admin-usu-table">
          <thead>
            <tr>
              <th>Apellidos y nombres</th>
              <th>Documento</th>
              <th>Celular</th>
              <th>Parentesco</th>
              <th style={{ width: 120 }}>Opciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>
                  Cargando…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                  Sin datos.
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={row.id}>
                  <td>{nombreApoderado(row)}</td>
                  <td>{row.nro_documento}</td>
                  <td>{row.telefono_celular || '—'}</td>
                  <td>{PARENTESCO_LABEL[row.parentesco] || `Cód. ${row.parentesco}`}</td>
                  <td>
                    <div className="admin-usu-actions-wrap">
                      <button
                        type="button"
                        className="admin-usu-actions-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenu(openMenu === row.id ? null : row.id);
                        }}
                      >
                        Opciones ▾
                      </button>
                      {openMenu === row.id && (
                        <div className="admin-usu-dropdown" onClick={(e) => e.stopPropagation()}>
                          <button type="button" onClick={() => { verInfo(row); setOpenMenu(null); }}>
                            Ver información
                          </button>
                          <button type="button" onClick={() => { infoAcceso(row); setOpenMenu(null); }}>
                            Información de acceso
                          </button>
                          {!row.usuario_id && (
                            <button type="button" onClick={() => { crearAcceso(row); setOpenMenu(null); }}>
                              Crear acceso
                            </button>
                          )}
                          {row.usuario_id && (
                            <button type="button" onClick={() => { resetPass(row); setOpenMenu(null); }}>
                              Restablecer clave a DNI
                            </button>
                          )}
                          <hr />
                          <button type="button" onClick={() => { abrirEditar(row); setOpenMenu(null); }}>
                            Editar
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="admin-usu-pagination">
        <span>
          Página {page} de {totalPages} — {total} registros
        </span>
        <button type="button" className="admin-usu-btn admin-usu-btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          Anterior
        </button>
        <button
          type="button"
          className="admin-usu-btn admin-usu-btn-secondary"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          Siguiente
        </button>
      </div>

      {modalCreate && (
        <div className="admin-usu-modal-overlay" onClick={() => setModalCreate(false)}>
          <div className="admin-usu-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-usu-modal-header">
              <h2>Nuevo apoderado</h2>
              <button type="button" className="admin-usu-modal-close" onClick={() => setModalCreate(false)}>
                ✕
              </button>
            </div>
            <div className="admin-usu-modal-body">
              {['nombres', 'apellido_paterno', 'apellido_materno', 'nro_documento', 'email', 'telefono_celular'].map((k) => (
                <div key={k} className="admin-usu-field">
                  <label>{k === 'nro_documento' ? 'DNI' : k.replace(/_/g, ' ')}</label>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      style={{ flex: 1, minWidth: '120px' }}
                      value={form[k] || ''}
                      onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                    />
                    {k === 'nro_documento' && (
                      <button type="button" className="admin-usu-btn admin-usu-btn-secondary" onClick={buscarDesdePersonal}>
                        Desde personal
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <div className="admin-usu-field">
                <label>Parentesco (código)</label>
                <select
                  value={form.parentesco || 1}
                  onChange={(e) => setForm({ ...form, parentesco: parseInt(e.target.value, 10) })}
                >
                  <option value={1}>Padre</option>
                  <option value={2}>Madre</option>
                  <option value={3}>Tutor</option>
                  <option value={4}>Apoderado</option>
                </select>
              </div>
              <div className="admin-usu-field">
                <label>Fecha de nacimiento</label>
                <input
                  type="date"
                  value={form.fecha_nacimiento || ''}
                  onChange={(e) => setForm({ ...form, fecha_nacimiento: e.target.value })}
                />
              </div>
              <p className="admin-usu-hint">
                Si el DNI ya es usuario de <strong>personal/docente</strong>, no se crea otra cuenta: se vincula la ficha de
                apoderado al mismo login. Si no existe usuario, se crea uno tipo APODERADO (usuario y clave = DNI). Use
                «Desde personal» para copiar datos del docente.
              </p>
              <div className="admin-usu-modal-actions">
                <button type="button" className="admin-usu-btn admin-usu-btn-secondary" onClick={() => setModalCreate(false)}>
                  Cancelar
                </button>
                <button type="button" className="admin-usu-btn admin-usu-btn-primary" onClick={guardarNuevo}>
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modalEdit && (
        <div className="admin-usu-modal-overlay" onClick={() => setModalEdit(null)}>
          <div className="admin-usu-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-usu-modal-header">
              <h2>Editar apoderado</h2>
              <button type="button" className="admin-usu-modal-close" onClick={() => setModalEdit(null)}>
                ✕
              </button>
            </div>
            <div className="admin-usu-modal-body">
              {['nombres', 'apellido_paterno', 'apellido_materno', 'nro_documento', 'email', 'telefono_celular'].map((k) => (
                <div key={k} className="admin-usu-field">
                  <label>{k === 'nro_documento' ? 'DNI' : k.replace(/_/g, ' ')}</label>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      style={{ flex: 1, minWidth: '120px' }}
                      value={form[k] || ''}
                      onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                    />
                    {k === 'nro_documento' && (
                      <button type="button" className="admin-usu-btn admin-usu-btn-secondary" onClick={buscarDesdePersonal}>
                        Desde personal
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <div className="admin-usu-field">
                <label>Parentesco</label>
                <select
                  value={form.parentesco || 1}
                  onChange={(e) => setForm({ ...form, parentesco: parseInt(e.target.value, 10) })}
                >
                  <option value={1}>Padre</option>
                  <option value={2}>Madre</option>
                  <option value={3}>Tutor</option>
                  <option value={4}>Apoderado</option>
                </select>
              </div>
              <div className="admin-usu-field">
                <label>Estado del usuario</label>
                <select
                  value={form.usuario_estado || 'ACTIVO'}
                  onChange={(e) => setForm({ ...form, usuario_estado: e.target.value })}
                >
                  <option value="ACTIVO">ACTIVO</option>
                  <option value="INACTIVO">INACTIVO</option>
                </select>
              </div>
              <div className="admin-usu-modal-actions">
                <button type="button" className="admin-usu-btn admin-usu-btn-secondary" onClick={() => setModalEdit(null)}>
                  Cancelar
                </button>
                <button type="button" className="admin-usu-btn admin-usu-btn-primary" onClick={guardarEdit}>
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
