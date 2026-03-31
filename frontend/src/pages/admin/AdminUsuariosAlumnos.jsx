import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
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

function formatFechaNacimiento(val) {
  if (val == null || val === '') return '—';
  const s = String(val).trim();
  const ymd = s.slice(0, 10);
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function labelMatriculaEstado(estado) {
  const e = Number(estado);
  if (e === 0 || e === 4) return 'Activa / vigente';
  if (e === 1) return 'Retirado';
  if (e === 2) return 'Trasladado';
  if (e === 3) return 'Cancelado';
  return `Cód. ${estado}`;
}

function labelTipoPago(tipo) {
  const t = Number(tipo);
  if (t === 0) return 'Matrícula';
  if (t === 1) return 'Pensión';
  return `Tipo ${tipo}`;
}

export default function AdminUsuariosAlumnos() {
  const navigate = useNavigate();
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
        html: '<p>Este alumno no tiene usuario de alumno vinculado. La contraseña por defecto es el DNI cuando exista cuenta.</p>',
      });
      return;
    }
    Swal.fire({
      title: 'Información de acceso',
      html: `<p><strong>Usuario:</strong> ${row.login_usuario || row.nro_documento}</p>
        <p><strong>Contraseña por defecto:</strong> DNI</p>`,
    });
  };

  const verInfo = (row) => {
    Swal.fire({
      title: nombreAlumno(row),
      html: `<div style="text-align:left">
        <p><strong>DNI:</strong> ${row.nro_documento}</p>
        <p><strong>Nacimiento:</strong> ${formatFechaNacimiento(row.fecha_nacimiento)}</p>
        <p><strong>Email:</strong> ${row.email || '—'}</p>
      </div>`,
      width: 440,
    });
  };

  const cerrarMenus = () => setOpenMenu(null);

  const enviarMensaje = (row) => {
    if (!row.usuario_id) {
      Swal.fire({
        icon: 'info',
        title: 'Sin acceso al aula',
        text: 'Este alumno no tiene usuario activo. Cree acceso desde Información de acceso o registre el usuario antes de enviar mensajes.',
      });
      return;
    }
    navigate('/admin/mensajes', {
      replace: false,
      state: {
        preselectMensajeAlumno: {
          usuario_id: row.usuario_id,
          nombre_completo: nombreAlumno(row),
        },
      },
    });
  };

  const verApoderados = async (row) => {
    try {
      const { data } = await api.get(`/admin/usuarios/alumnos/${row.id}/apoderados`);
      const list = data.data || [];
      if (!list.length) {
        Swal.fire({ title: 'Apoderados', text: 'No hay apoderados vinculados en familias.', icon: 'info' });
        return;
      }
      const filas = list
        .map((ap) => {
          const nom = [ap.apellido_paterno, ap.apellido_materno, ap.nombres].filter(Boolean).join(' ');
          const acc = ap.usuario_id
            ? `<span style="color:#059669">${ap.usuario_estado || 'ACTIVO'}</span>`
            : '<span style="color:#9ca3af">Sin usuario</span>';
          return `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${nom}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee">${ap.nro_documento || '—'}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee">${ap.telefono_celular || '—'}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee">${acc}</td></tr>`;
        })
        .join('');
      Swal.fire({
        title: `Apoderados — ${nombreAlumno(row)}`,
        width: 720,
        html: `<div style="max-height:380px;overflow:auto;text-align:left">
          <table style="width:100%;border-collapse:collapse;font-size:0.9rem">
            <thead><tr style="background:#f3f4f6">
              <th style="text-align:left;padding:8px">Nombre</th>
              <th style="text-align:left;padding:8px">DNI</th>
              <th style="text-align:left;padding:8px">Celular</th>
              <th style="text-align:left;padding:8px">Usuario</th>
            </tr></thead>
            <tbody>${filas}</tbody>
          </table>
        </div>`,
      });
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudieron cargar apoderados' });
    }
  };

  const historialMatriculas = async (row) => {
    try {
      const { data } = await api.get(`/admin/usuarios/alumnos/${row.id}/matriculas`);
      const list = data.data || [];
      if (!list.length) {
        Swal.fire({ title: 'Historial de matrículas', text: 'No hay matrículas registradas.', icon: 'info' });
        return;
      }
      const filas = list
        .map((m) => {
          const curso = `${m.grado || '—'}° ${m.seccion || ''} · ${m.nivel_nombre || ''}`.trim();
          return `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${m.anio ?? '—'}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee">${curso}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee">${labelMatriculaEstado(m.estado)}</td></tr>`;
        })
        .join('');
      Swal.fire({
        title: `Historial de matrículas — ${nombreAlumno(row)}`,
        width: 640,
        html: `<div style="max-height:400px;overflow:auto;text-align:left">
          <table style="width:100%;border-collapse:collapse;font-size:0.9rem">
            <thead><tr style="background:#f3f4f6">
              <th style="text-align:left;padding:8px">Año</th>
              <th style="text-align:left;padding:8px">Curso</th>
              <th style="text-align:left;padding:8px">Estado</th>
            </tr></thead>
            <tbody>${filas}</tbody>
          </table>
        </div>`,
      });
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudo cargar el historial' });
    }
  };

  const historialPagos = async (row) => {
    try {
      const { data } = await api.get(`/admin/usuarios/alumnos/${row.id}/pagos`);
      const list = data.data || [];
      if (!list.length) {
        Swal.fire({ title: 'Historial de pagos', text: 'No hay pagos registrados.', icon: 'info' });
        return;
      }
      const fmtMonto = (n) => {
        const x = parseFloat(n);
        return Number.isFinite(x) ? x.toFixed(2) : '—';
      };
      const filas = list
        .map((p) => {
          const fh = p.fecha_hora
            ? new Date(p.fecha_hora).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })
            : '—';
          const periodo = `${p.anio ?? '—'} · ${p.grado || '—'}° ${p.seccion || ''}`;
          return `<tr>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;white-space:nowrap">${periodo}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee">${labelTipoPago(p.tipo)}${p.nro_pago != null ? ` #${p.nro_pago}` : ''}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${fmtMonto(p.monto)}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee">${p.estado_pago || '—'}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:0.82rem">${fh}</td>
          </tr>`;
        })
        .join('');
      Swal.fire({
        title: `Historial de pagos — ${nombreAlumno(row)}`,
        width: 900,
        html: `<div style="max-height:420px;overflow:auto;text-align:left">
          <table style="width:100%;border-collapse:collapse;font-size:0.88rem">
            <thead><tr style="background:#f3f4f6">
              <th style="text-align:left;padding:8px">Periodo</th>
              <th style="text-align:left;padding:8px">Concepto</th>
              <th style="text-align:right;padding:8px">Monto</th>
              <th style="text-align:left;padding:8px">Estado pago</th>
              <th style="text-align:left;padding:8px">Fecha</th>
            </tr></thead>
            <tbody>${filas}</tbody>
          </table>
        </div>`,
      });
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudo cargar pagos' });
    }
  };

  const eliminarAlumno = async (row) => {
    const ok = await Swal.fire({
      title: '¿Eliminar alumno?',
      html: `<p>Se eliminará la ficha de <strong>${nombreAlumno(row)}</strong> y su usuario de alumno si existe.</p>
        <p style="color:#b91c1c;font-size:0.9rem">Solo es posible si no tiene matrículas en el sistema.</p>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
    });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/admin/usuarios/alumnos/${row.id}`);
      Swal.fire({ icon: 'success', title: 'Alumno eliminado' });
      cargar();
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudo eliminar' });
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="admin-usu-wrap" onClick={cerrarMenus}>
      <div className="admin-usu-header">
        <h1>Alumnos</h1>
        <p>Listado del colegio con acceso al aula. Usuario y contraseña por defecto: DNI.</p>
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
              <th style={{ width: 72 }} />
              <th>Apellidos y nombres</th>
              <th>Fecha de nacimiento</th>
              <th>DNI</th>
              <th style={{ width: 148 }}>Opciones</th>
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
              items.map((row) => {
                const url = fotoUsuarioAdmin(row.foto);
                const apPat = (row.apellido_paterno || '').trim();
                const nom = (row.nombres || '').trim();
                const letraAvatar = (apPat[0] || nom[0] || '?').toUpperCase();
                return (
                  <tr key={row.id}>
                    <td>
                      {url ? (
                        <img className="admin-usu-avatar" src={url} alt="" />
                      ) : (
                        <div className="admin-usu-avatar-ph">{letraAvatar}</div>
                      )}
                    </td>
                    <td>{nombreAlumno(row)}</td>
                    <td>{formatFechaNacimiento(row.fecha_nacimiento)}</td>
                    <td>{row.nro_documento}</td>
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
                              ℹ️ Ver Información
                            </button>
                            <button type="button" onClick={() => { enviarMensaje(row); cerrarMenus(); }}>
                              ✉️ Enviar Mensaje
                            </button>
                            <button type="button" onClick={() => { verApoderados(row); cerrarMenus(); }}>
                              👥 Ver Apoderados
                            </button>
                            <button type="button" onClick={() => { historialMatriculas(row); cerrarMenus(); }}>
                              📋 Historial de Matriculas
                            </button>
                            <button type="button" onClick={() => { historialPagos(row); cerrarMenus(); }}>
                              💰 Historial de Pagos
                            </button>
                            <button type="button" onClick={() => { infoAcceso(row); cerrarMenus(); }}>
                              🔐 Información de Acceso
                            </button>
                            <hr />
                            <button type="button" onClick={() => { abrirEditar(row); cerrarMenus(); }}>
                              ✏️ Editar Alumno
                            </button>
                            <button type="button" onClick={() => { eliminarAlumno(row); cerrarMenus(); }}>
                              🗑️ Eliminar Alumno
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

      {modalCreate && createPortal(
        <div className="admin-usu-modal-overlay" onClick={() => setModalCreate(false)}>
          <div className="admin-usu-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-usu-modal-header">
              <h2>Nuevo alumno</h2>
              <button type="button" className="admin-usu-modal-close" onClick={() => setModalCreate(false)}>
                ✕
              </button>
            </div>
            <div className="admin-usu-modal-body">
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
        </div>,
        document.body
      )}

      {modalEdit && createPortal(
        <div className="admin-usu-modal-overlay" onClick={() => setModalEdit(null)}>
          <div className="admin-usu-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-usu-modal-header">
              <h2>Editar alumno</h2>
              <button type="button" className="admin-usu-modal-close" onClick={() => setModalEdit(null)}>
                ✕
              </button>
            </div>
            <div className="admin-usu-modal-body">
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
        </div>,
        document.body
      )}
    </div>
  );
}
