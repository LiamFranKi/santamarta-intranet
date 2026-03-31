import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import Swal from 'sweetalert2';
import { fotoUsuarioAdmin } from '../../utils/adminUsuariosFoto';
import './AdminUsuarios.css';

function nombreCompletoEquipo(row) {
  const ap = (row.apellidos || '').trim();
  const nom = (row.nombres || '').trim();
  if (ap && nom) return `${ap}, ${nom}`;
  return `${ap} ${nom}`.trim() || '—';
}

export default function AdminUsuariosEquipo() {
  const [searchParams, setSearchParams] = useSearchParams();
  const perfilFilter = (searchParams.get('perfil') || '').toUpperCase();

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [search, setSearch] = useState('');
  const [tipos, setTipos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openMenu, setOpenMenu] = useState(null);

  const [modalCreate, setModalCreate] = useState(false);
  const [modalEdit, setModalEdit] = useState(null);
  const [form, setForm] = useState({});
  const [fotoEditFile, setFotoEditFile] = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/usuarios/equipo', {
        params: { page, limit, search: search.trim(), perfil: perfilFilter || undefined },
      });
      setItems(data.data || []);
      setTotal(data.total || 0);
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo cargar el listado',
      });
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, perfilFilter]);

  useEffect(() => {
    api.get('/admin/usuarios/equipo/tipos').then((r) => setTipos(r.data.tipos || [])).catch(() => {});
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cerrarMenus = () => setOpenMenu(null);

  const abrirCrear = () => {
    setForm({
      nombres: '',
      apellidos: '',
      nro_documento: '',
      email: '',
      telefono_celular: '',
      cargo: '',
      fecha_nacimiento: '1990-01-01',
      tipo: tipos.includes('DOCENTE') ? 'DOCENTE' : tipos[0] || 'DOCENTE',
    });
    setModalCreate(true);
  };

  const guardarNuevo = async () => {
    try {
      await api.post('/admin/usuarios/equipo', form);
      Swal.fire({ icon: 'success', title: 'Registrado', text: 'Usuario y contraseña: DNI' });
      setModalCreate(false);
      cargar();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudo guardar' });
    }
  };

  const abrirEditar = async (row) => {
    try {
      const { data } = await api.get(`/admin/usuarios/equipo/${row.id}`);
      setForm({
        nombres: data.nombres || '',
        apellidos: data.apellidos || '',
        nro_documento: data.nro_documento || '',
        email: data.email || '',
        telefono_celular: data.telefono_celular || '',
        cargo: data.cargo || '',
        fecha_nacimiento: (data.fecha_nacimiento || '1990-01-01').toString().slice(0, 10),
        tipo: data.usuario_tipo || 'DOCENTE',
        usuario_estado: data.usuario_estado || 'ACTIVO',
      });
      setFotoEditFile(null);
      setModalEdit(row.id);
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudo cargar' });
    }
  };

  const guardarEdit = async () => {
    try {
      await api.put(`/admin/usuarios/equipo/${modalEdit}`, form);
      if (fotoEditFile) {
        const fd = new FormData();
        fd.append('foto', fotoEditFile);
        await api.put(`/admin/usuarios/equipo/${modalEdit}/foto`, fd);
      }
      Swal.fire({ icon: 'success', title: 'Actualizado' });
      setFotoEditFile(null);
      setModalEdit(null);
      cargar();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudo guardar' });
    }
  };

  const infoAcceso = (row) => {
    if (!row.usuario_id) {
      Swal.fire({
        title: 'Información de acceso',
        html: '<p>Este personal no tiene usuario en el sistema.</p><p>Puede crear acceso desde <strong>Opciones</strong>.</p>',
      });
      return;
    }
    Swal.fire({
      title: 'Información de acceso',
      html: `<p><strong>Usuario:</strong> ${row.login_usuario || row.nro_documento}</p>
        <p><strong>Contraseña por defecto:</strong> mismo número de DNI</p>
        <p style="color:#6b7280;font-size:0.9rem">Si cambió la contraseña, use Restablecer a DNI.</p>`,
    });
  };

  const resetPass = async (row) => {
    const ok = await Swal.fire({
      title: '¿Restablecer contraseña?',
      text: 'La clave quedará igual al DNI actual del personal.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, restablecer',
    });
    if (!ok.isConfirmed) return;
    try {
      await api.post(`/admin/usuarios/equipo/${row.id}/reset-password`);
      Swal.fire({ icon: 'success', title: 'Contraseña actualizada' });
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'Falló' });
    }
  };

  const crearAcceso = async (row) => {
    const { value: tipo } = await Swal.fire({
      title: 'Perfil de acceso',
      input: 'select',
      inputOptions: Object.fromEntries(tipos.map((t) => [t, t])),
      inputValue: tipos.includes('DOCENTE') ? 'DOCENTE' : tipos[0],
      showCancelButton: true,
    });
    if (!tipo) return;
    try {
      await api.post(`/admin/usuarios/equipo/${row.id}/acceso`, { tipo });
      Swal.fire({ icon: 'success', title: 'Acceso creado', text: 'Usuario y clave: DNI' });
      cargar();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'Falló' });
    }
  };

  const verInfo = (row) => {
    Swal.fire({
      title: nombreCompletoEquipo(row),
      html: `
        <div style="text-align:left;font-size:0.95rem;line-height:1.5">
          <p><strong>DNI:</strong> ${row.nro_documento || '—'}</p>
          <p><strong>Email:</strong> ${row.email || '—'}</p>
          <p><strong>Celular:</strong> ${row.telefono_celular || '—'}</p>
          <p><strong>Cargo:</strong> ${row.cargo || '—'}</p>
          <p><strong>Perfil:</strong> ${row.usuario_tipo || 'Sin acceso'}</p>
        </div>`,
      width: 480,
    });
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="admin-usu-wrap" onClick={cerrarMenus}>
      <div className="admin-usu-header">
        <h1>Personal</h1>
        <p>
          Docentes, administración y demás perfiles del colegio. El acceso se diferencia por el tipo de usuario;
          usuario y contraseña inicial son el DNI.
        </p>
      </div>

      <div className="admin-usu-toolbar" onClick={(e) => e.stopPropagation()}>
        <input
          type="search"
          className="admin-usu-grow"
          placeholder="Buscar por nombre, apellidos o DNI…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && cargar()}
        />
        <select
          value={perfilFilter}
          onChange={(e) => {
            const v = (e.target.value || '').toUpperCase();
            setPage(1);
            if (v) setSearchParams({ perfil: v });
            else setSearchParams({});
          }}
          aria-label="Filtrar por perfil"
        >
          <option value="">Todos los perfiles</option>
          {tipos.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button type="button" className="admin-usu-btn admin-usu-btn-search" onClick={() => { setPage(1); cargar(); }}>
          Buscar
        </button>
        <button type="button" className="admin-usu-btn admin-usu-btn-new" onClick={abrirCrear}>
          + Registrar nuevo
        </button>
      </div>

      <div className="admin-usu-table-card">
        <div className="admin-usu-table-scroll">
          <table className="admin-usu-table">
          <thead>
            <tr>
              <th style={{ width: 56 }} />
              <th>Apellidos y nombres</th>
              <th>DNI</th>
              <th>Perfil</th>
              <th style={{ width: 120 }}>Opciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                  Cargando…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                  No hay registros.
                </td>
              </tr>
            ) : (
              items.map((row) => {
                const url = fotoUsuarioAdmin(row.foto);
                const ini = (row.nombres || 'U')[0]?.toUpperCase();
                return (
                  <tr key={row.id}>
                    <td>
                      {url ? (
                        <img className="admin-usu-avatar" src={url} alt="" />
                      ) : (
                        <div className="admin-usu-avatar-ph">{ini}</div>
                      )}
                    </td>
                    <td>{nombreCompletoEquipo(row)}</td>
                    <td>{row.nro_documento}</td>
                    <td>
                      {row.usuario_tipo ? (
                        <span className="admin-usu-badge">{row.usuario_tipo}</span>
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
                            <button type="button" onClick={() => { verInfo(row); cerrarMenus(); }}>
                              ℹ️ Ver información
                            </button>
                            <button type="button" onClick={() => { infoAcceso(row); cerrarMenus(); }}>
                              🔐 Información de acceso
                            </button>
                            {!row.usuario_id && (
                              <button type="button" onClick={() => { crearAcceso(row); cerrarMenus(); }}>
                                ➕ Crear acceso
                              </button>
                            )}
                            {row.usuario_id && (
                              <button type="button" onClick={() => { resetPass(row); cerrarMenus(); }}>
                                🔑 Restablecer clave a DNI
                              </button>
                            )}
                            <hr />
                            <button type="button" onClick={() => { abrirEditar(row); cerrarMenus(); }}>
                              ✏️ Editar
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
      </div>

      <div className="admin-usu-pagination">
        <span>
          Página {page} de {totalPages} — {total} registros
        </span>
        <button
          type="button"
          className="admin-usu-btn admin-usu-btn-secondary"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
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

      {modalCreate && createPortal(
        <div className="admin-usu-modal-overlay" onClick={() => setModalCreate(false)}>
          <div className="admin-usu-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-usu-modal-header">
              <h2>Nuevo personal</h2>
              <button type="button" className="admin-usu-modal-close" onClick={() => setModalCreate(false)}>
                ✕
              </button>
            </div>
            <div className="admin-usu-modal-body">
              {['nombres', 'apellidos', 'nro_documento', 'email', 'telefono_celular', 'cargo'].map((k) => (
                <div key={k} className="admin-usu-field">
                  <label>{k === 'nro_documento' ? 'DNI' : k.replace(/_/g, ' ')}</label>
                  <input
                    type="text"
                    value={form[k] || ''}
                    onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                  />
                </div>
              ))}
              <div className="admin-usu-field">
                <label>Fecha nacimiento</label>
                <input
                  type="date"
                  value={form.fecha_nacimiento || ''}
                  onChange={(e) => setForm({ ...form, fecha_nacimiento: e.target.value })}
                />
              </div>
              <div className="admin-usu-field">
                <label>Perfil (tipo de usuario)</label>
                <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                  {tipos.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <p className="admin-usu-hint">Se creará el usuario con login DNI y contraseña DNI (SHA1 en base de datos).</p>
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
        </div>,
        document.body
      )}

      {modalEdit && createPortal(
        <div className="admin-usu-modal-overlay" onClick={() => setModalEdit(null)}>
          <div className="admin-usu-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-usu-modal-header">
              <h2>Editar personal</h2>
              <button type="button" className="admin-usu-modal-close" onClick={() => setModalEdit(null)}>
                ✕
              </button>
            </div>
            <div className="admin-usu-modal-body">
              {['nombres', 'apellidos', 'nro_documento', 'email', 'telefono_celular', 'cargo'].map((k) => (
                <div key={k} className="admin-usu-field">
                  <label>{k === 'nro_documento' ? 'DNI' : k.replace(/_/g, ' ')}</label>
                  <input
                    type="text"
                    value={form[k] || ''}
                    onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                  />
                </div>
              ))}
              <div className="admin-usu-field">
                <label>Fecha nacimiento</label>
                <input
                  type="date"
                  value={form.fecha_nacimiento || ''}
                  onChange={(e) => setForm({ ...form, fecha_nacimiento: e.target.value })}
                />
              </div>
              <div className="admin-usu-field">
                <label>Perfil</label>
                <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                  {tipos.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="admin-usu-field">
                <label>Estado acceso</label>
                <select
                  value={form.usuario_estado || 'ACTIVO'}
                  onChange={(e) => setForm({ ...form, usuario_estado: e.target.value })}
                >
                  <option value="ACTIVO">ACTIVO</option>
                  <option value="INACTIVO">INACTIVO</option>
                </select>
              </div>
              <div className="admin-usu-field">
                <label>Cambiar foto (opcional)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setFotoEditFile(e.target.files?.[0] || null)}
                />
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
        </div>,
        document.body
      )}
    </div>
  );
}
