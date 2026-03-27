import React, { useCallback, useEffect, useState } from 'react';
import api from '../../services/api';
import Swal from 'sweetalert2';
import { fotoUsuarioAdmin } from '../../utils/adminUsuariosFoto';
import './AdminUsuarios.css';

function nombreAlumno(row) {
  const ap = (row.apellido_paterno || '').trim();
  const am = (row.apellido_materno || '').trim();
  const nom = (row.nombres || '').trim();
  const full = [ap, am].filter(Boolean).join(' ');
  if (full && nom) return `${full}, ${nom}`;
  return `${full} ${nom}`.trim() || '—';
}

export default function AdminUsuariosAlumnos() {
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
      const { data } = await api.get('/admin/usuarios/alumnos', {
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

  const abrirCrear = () => {
    setForm({
      apellido_paterno: '',
      apellido_materno: '',
      nombres: '',
      nro_documento: '',
      fecha_nacimiento: '2015-01-01',
      email: '',
    });
    setModalCreate(true);
  };

  const guardarNuevo = async () => {
    try {
      await api.post('/admin/usuarios/alumnos', form);
      Swal.fire({ icon: 'success', title: 'Alumno registrado', text: 'Acceso: usuario y clave = DNI' });
      setModalCreate(false);
      cargar();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudo guardar' });
    }
  };

  const abrirEditar = async (row) => {
    try {
      const { data } = await api.get(`/admin/usuarios/alumnos/${row.id}`);
      setForm({
        apellido_paterno: data.apellido_paterno || '',
        apellido_materno: data.apellido_materno || '',
        nombres: data.nombres || '',
        nro_documento: data.nro_documento || '',
        fecha_nacimiento: (data.fecha_nacimiento || '2015-01-01').toString().slice(0, 10),
        email: data.email || '',
        usuario_estado: data.usuario_estado || 'ACTIVO',
      });
      setModalEdit(row.id);
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudo cargar' });
    }
  };

  const guardarEdit = async () => {
    try {
      await api.put(`/admin/usuarios/alumnos/${modalEdit}`, form);
      Swal.fire({ icon: 'success', title: 'Actualizado' });
      setModalEdit(null);
      cargar();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudo guardar' });
    }
  };

  const infoAcceso = (row) => {
    if (!row.usuario_id) {
      Swal.fire({
        title: 'Acceso',
        html: '<p>Este alumno no tiene usuario. Use <strong>Crear acceso</strong> en opciones.</p>',
      });
      return;
    }
    Swal.fire({
      title: 'Información de acceso',
      html: `<p><strong>Usuario:</strong> ${row.login_usuario || row.nro_documento}</p>
        <p><strong>Contraseña por defecto:</strong> DNI</p>`,
    });
  };

  const resetPass = async (row) => {
    const ok = await Swal.fire({
      title: '¿Restablecer contraseña al DNI?',
      showCancelButton: true,
      confirmButtonText: 'Sí',
    });
    if (!ok.isConfirmed) return;
    try {
      await api.post(`/admin/usuarios/alumnos/${row.id}/reset-password`);
      Swal.fire({ icon: 'success', title: 'Listo' });
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error' });
    }
  };

  const crearAcceso = async (row) => {
    try {
      await api.post(`/admin/usuarios/alumnos/${row.id}/acceso`);
      Swal.fire({ icon: 'success', title: 'Acceso creado', text: 'Usuario y clave: DNI' });
      cargar();
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error' });
    }
  };

  const verInfo = (row) => {
    Swal.fire({
      title: nombreAlumno(row),
      html: `<div style="text-align:left">
        <p><strong>DNI:</strong> ${row.nro_documento}</p>
        <p><strong>Nacimiento:</strong> ${row.fecha_nacimiento || '—'}</p>
        <p><strong>Email:</strong> ${row.email || '—'}</p>
      </div>`,
      width: 440,
    });
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="admin-usu-wrap">
      <div className="admin-usu-header">
        <h1>Alumnos</h1>
        <p>Listado del colegio con acceso al aula. Usuario y contraseña por defecto: DNI.</p>
      </div>

      <div className="admin-usu-toolbar">
        <input
          type="search"
          className="admin-usu-grow"
          placeholder="Nombres, apellidos o DNI…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && cargar()}
        />
        <button type="button" className="admin-usu-btn admin-usu-btn-primary" onClick={() => { setPage(1); cargar(); }}>
          Buscar
        </button>
        <button type="button" className="admin-usu-btn admin-usu-btn-primary" onClick={abrirCrear}>
          + Registrar nuevo
        </button>
      </div>

      <div className="admin-usu-table-card">
        <table className="admin-usu-table">
          <thead>
            <tr>
              <th style={{ width: 56 }} />
              <th>Apellidos y nombres</th>
              <th>Fecha nac.</th>
              <th>DNI</th>
              <th>Acceso</th>
              <th style={{ width: 120 }}>Opciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>
                  Cargando…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                  Sin datos.
                </td>
              </tr>
            ) : (
              items.map((row) => {
                const url = fotoUsuarioAdmin(row.foto);
                const ini = (row.nombres || 'A')[0]?.toUpperCase();
                return (
                  <tr key={row.id}>
                    <td>
                      {url ? <img className="admin-usu-avatar" src={url} alt="" /> : <div className="admin-usu-avatar-ph">{ini}</div>}
                    </td>
                    <td>{nombreAlumno(row)}</td>
                    <td>{row.fecha_nacimiento || '—'}</td>
                    <td>{row.nro_documento}</td>
                    <td>
                      {row.usuario_id ? (
                        <span className={row.usuario_estado === 'ACTIVO' ? 'admin-usu-badge-ok' : 'admin-usu-badge-off'}>
                          {row.usuario_estado === 'ACTIVO' ? 'Activo' : 'Inactivo'}
                        </span>
                      ) : (
                        <span className="admin-usu-badge-muted">Sin usuario</span>
                      )}
                    </td>
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
                );
              })
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
            <h2>Nuevo alumno</h2>
            {['apellido_paterno', 'apellido_materno', 'nombres', 'nro_documento', 'email'].map((k) => (
              <div key={k} className="admin-usu-field">
                <label>{k === 'nro_documento' ? 'DNI' : k.replace(/_/g, ' ')}</label>
                <input type="text" value={form[k] || ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
              </div>
            ))}
            <div className="admin-usu-field">
              <label>Fecha de nacimiento</label>
              <input
                type="date"
                value={form.fecha_nacimiento || ''}
                onChange={(e) => setForm({ ...form, fecha_nacimiento: e.target.value })}
              />
            </div>
            <p className="admin-usu-hint">Se crea el usuario tipo ALUMNO con login y clave iguales al DNI.</p>
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
      )}

      {modalEdit && (
        <div className="admin-usu-modal-overlay" onClick={() => setModalEdit(null)}>
          <div className="admin-usu-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Editar alumno</h2>
            {['apellido_paterno', 'apellido_materno', 'nombres', 'nro_documento', 'email'].map((k) => (
              <div key={k} className="admin-usu-field">
                <label>{k === 'nro_documento' ? 'DNI' : k.replace(/_/g, ' ')}</label>
                <input type="text" value={form[k] || ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
              </div>
            ))}
            <div className="admin-usu-field">
              <label>Fecha de nacimiento</label>
              <input
                type="date"
                value={form.fecha_nacimiento || ''}
                onChange={(e) => setForm({ ...form, fecha_nacimiento: e.target.value })}
              />
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
      )}
    </div>
  );
}
