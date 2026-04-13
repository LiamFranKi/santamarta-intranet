import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import Swal from 'sweetalert2';
import { fotoUsuarioAdmin } from '../../utils/adminUsuariosFoto';
import './AdminUsuarios.css';
import './AdminUsuariosEquipoCards.css';

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

export default function AdminUsuariosApoderados() {
  const [searchParams] = useSearchParams();
  const vistaTabla = searchParams.get('vista') === 'tabla';
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [openMenu, setOpenMenu] = useState(null);
  const [menuCoords, setMenuCoords] = useState({ top: 0, left: 0 });
  const [menuRow, setMenuRow] = useState(null);
  const [menuAnchorRect, setMenuAnchorRect] = useState(null);
  const menuPortalRef = useRef(null);

  const [modalCreate, setModalCreate] = useState(false);
  const [modalEdit, setModalEdit] = useState(null);
  const [form, setForm] = useState({});
  const [fotoCreateFile, setFotoCreateFile] = useState(null);
  const [fotoCreatePreview, setFotoCreatePreview] = useState('');
  const [fotoEditFile, setFotoEditFile] = useState(null);
  const [fotoEditPreview, setFotoEditPreview] = useState('');

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

  useEffect(() => {
    return () => {
      if (fotoCreatePreview && fotoCreatePreview.startsWith('blob:')) {
        URL.revokeObjectURL(fotoCreatePreview);
      }
      if (fotoEditPreview && fotoEditPreview.startsWith('blob:')) {
        URL.revokeObjectURL(fotoEditPreview);
      }
    };
  }, [fotoCreatePreview, fotoEditPreview]);

  useEffect(() => {
    if (!openMenu) return undefined;
    const close = () => cerrarMenus();
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [openMenu]);

  const cerrarMenus = () => {
    setOpenMenu(null);
    setMenuRow(null);
    setMenuAnchorRect(null);
  };

  const abrirMenuOpciones = (event, row) => {
    event.stopPropagation();
    const nextOpen = openMenu === row.id ? null : row.id;
    if (!nextOpen) {
      cerrarMenus();
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setMenuCoords({ top: rect.bottom + 4, left: rect.right - 240 });
    setMenuAnchorRect(rect);
    setMenuRow(row);
    setOpenMenu(row.id);
  };

  useEffect(() => {
    if (!openMenu || !menuAnchorRect || !menuPortalRef.current) return;
    const menuRect = menuPortalRef.current.getBoundingClientRect();
    const menuWidth = menuRect.width || 240;
    const menuHeight = menuRect.height || 260;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const gap = 4;
    const preferBelowTop = menuAnchorRect.bottom + gap;
    const preferAboveTop = menuAnchorRect.top - menuHeight - gap;
    const top = (preferBelowTop + menuHeight > viewportH - 8 && preferAboveTop > 8)
      ? preferAboveTop
      : Math.max(8, Math.min(preferBelowTop, viewportH - menuHeight - 8));
    const rawLeft = menuAnchorRect.right - menuWidth;
    const left = Math.max(8, Math.min(rawLeft, viewportW - menuWidth - 8));
    setMenuCoords((prev) => (prev.top === top && prev.left === left ? prev : { top, left }));
  }, [openMenu, menuAnchorRect]);

  const abrirCrear = () => {
    if (fotoCreatePreview && fotoCreatePreview.startsWith('blob:')) {
      URL.revokeObjectURL(fotoCreatePreview);
    }
    setFotoCreateFile(null);
    setFotoCreatePreview('');
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

  const handleFotoCreateChange = (event) => {
    const file = event.target.files?.[0];
    if (fotoCreatePreview && fotoCreatePreview.startsWith('blob:')) {
      URL.revokeObjectURL(fotoCreatePreview);
    }
    setFotoCreateFile(file || null);
    setFotoCreatePreview(file ? URL.createObjectURL(file) : '');
  };

  const handleFotoEditChange = (event) => {
    const file = event.target.files?.[0];
    if (fotoEditPreview && fotoEditPreview.startsWith('blob:')) {
      URL.revokeObjectURL(fotoEditPreview);
    }
    setFotoEditFile(file || null);
    setFotoEditPreview(file ? URL.createObjectURL(file) : '');
  };

  const cerrarModalCrear = () => {
    if (fotoCreatePreview && fotoCreatePreview.startsWith('blob:')) {
      URL.revokeObjectURL(fotoCreatePreview);
    }
    setFotoCreateFile(null);
    setFotoCreatePreview('');
    setModalCreate(false);
  };

  const cerrarModalEditar = () => {
    if (fotoEditPreview && fotoEditPreview.startsWith('blob:')) {
      URL.revokeObjectURL(fotoEditPreview);
    }
    setFotoEditFile(null);
    setFotoEditPreview('');
    setModalEdit(null);
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
      const fd = new FormData();
      const p = payloadApoderado(form);
      Object.entries(p).forEach(([k, v]) => {
        fd.append(k, v == null ? '' : String(v));
      });
      if (fotoCreateFile) {
        fd.append('foto', fotoCreateFile);
      }
      const { data } = await api.post('/admin/usuarios/apoderados', fd);
      if (data.usuario_compartido) {
        Swal.fire({
          icon: 'info',
          title: 'Apoderado registrado',
          html: `<p>${data.mensaje || 'Se vinculó a la cuenta existente (mismo DNI).'}</p><p style="margin-top:0.75rem;color:#6b7280;font-size:0.95rem">Perfil intranet: <strong>${data.usuario_tipo || 'personal'}</strong>. No hace falta otro login.</p>`,
        });
      } else {
        Swal.fire({ icon: 'success', title: 'Apoderado registrado', text: 'Usuario y clave = DNI' });
      }
      cerrarModalCrear();
      cargar();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudo guardar' });
    }
  };

  const abrirEditar = async (row) => {
    try {
      if (fotoEditPreview && fotoEditPreview.startsWith('blob:')) {
        URL.revokeObjectURL(fotoEditPreview);
      }
      setFotoEditFile(null);
      setFotoEditPreview('');
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
        foto: data.foto || '',
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
      if (fotoEditFile) {
        const fd = new FormData();
        fd.append('foto', fotoEditFile);
        await api.put(`/admin/usuarios/apoderados/${modalEdit}/foto`, fd);
      }
      Swal.fire({ icon: 'success', title: 'Actualizado' });
      cerrarModalEditar();
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
  const credencialDni = (form.nro_documento || '').trim();
  const initialsPreview = (form.nombres || form.apellido_paterno || 'A').trim().charAt(0).toUpperCase();
  const fotoCreateFormPreview = fotoCreatePreview;
  const fotoFormPreview = fotoEditPreview || fotoUsuarioAdmin(form.foto);

  return (
    <div className="admin-usu-wrap" onClick={cerrarMenus}>
      <div className="admin-usu-header">
        <h1>Apoderados</h1>
        <p>Padres de familia del colegio. Usuario y contraseña por defecto: DNI.</p>
        {!vistaTabla && (
          <p className="admin-usu-view-hint">
            Vista en tarjetas. Para la tabla clásica, use la misma ruta con <code>?vista=tabla</code> en el navegador.
          </p>
        )}
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

      {vistaTabla ? (
        <div className="admin-usu-table-card">
          <div className="admin-usu-table-scroll">
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
                            onClick={(e) => abrirMenuOpciones(e, row)}
                          >
                            Opciones ▾
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="admin-usu-cards-wrap">
          <div className="admin-usu-cards-grid">
            {loading ? (
              <p className="admin-usu-cards-empty">Cargando…</p>
            ) : items.length === 0 ? (
              <p className="admin-usu-cards-empty">Sin datos.</p>
            ) : (
              items.map((row, idx) => {
                const url = fotoUsuarioAdmin(row.foto);
                const apPat = (row.apellido_paterno || '').trim();
                const nom = (row.nombres || '').trim();
                const letraAvatar = (apPat[0] || nom[0] || '?').toUpperCase();
                const colorIdx = idx % 8;
                return (
                  <article
                    key={row.id}
                    className={`admin-usu-person-card admin-usu-person-card--${colorIdx}`}
                  >
                    <div className="admin-usu-person-photo-wrap">
                      {url ? (
                        <img className="admin-usu-person-photo" src={url} alt="" />
                      ) : (
                        <div className="admin-usu-person-photo-ph">{letraAvatar}</div>
                      )}
                    </div>
                    <h3 className="admin-usu-person-name">{nombreApoderado(row)}</h3>
                    <p className="admin-usu-person-meta">
                      {PARENTESCO_LABEL[row.parentesco] || `Parentesco ${row.parentesco}`}
                    </p>
                    <p className="admin-usu-person-dni">DNI: {row.nro_documento || '—'}</p>
                    <p className="admin-usu-person-meta" style={{ fontSize: '0.85rem' }}>
                      Nac.: {formatFechaNacimiento(row.fecha_nacimiento)}
                    </p>
                    <button
                      type="button"
                      className="admin-usu-actions-btn"
                      onClick={(e) => abrirMenuOpciones(e, row)}
                    >
                      Opciones ▾
                    </button>
                  </article>
                );
              })
            )}
          </div>
        </div>
      )}

      {openMenu && menuRow && createPortal(
        <div
          ref={menuPortalRef}
          className="admin-usu-dropdown admin-usu-dropdown-portal"
          style={{ top: menuCoords.top, left: Math.max(12, menuCoords.left) }}
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" onClick={() => { verInfo(menuRow); cerrarMenus(); }}>
            ℹ️ Ver información
          </button>
          <button type="button" onClick={() => { infoAcceso(menuRow); cerrarMenus(); }}>
            🔐 Información de acceso
          </button>
          {!menuRow.usuario_id && (
            <button type="button" onClick={() => { crearAcceso(menuRow); cerrarMenus(); }}>
              ➕ Crear acceso
            </button>
          )}
          {menuRow.usuario_id && (
            <button type="button" onClick={() => { resetPass(menuRow); cerrarMenus(); }}>
              🔑 Restablecer clave a DNI
            </button>
          )}
          <hr />
          <button type="button" onClick={() => { abrirEditar(menuRow); cerrarMenus(); }}>
            ✏️ Editar
          </button>
        </div>,
        document.body
      )}

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
        <div className="admin-usu-modal-overlay" onClick={cerrarModalCrear}>
          <div className="admin-usu-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-usu-modal-header">
              <h2>Nuevo apoderado</h2>
              <button type="button" className="admin-usu-modal-close" onClick={cerrarModalCrear}>
                ✕
              </button>
            </div>
            <div className="admin-usu-modal-body">
              <div className="admin-usu-profile-form">
                <div className="admin-usu-profile-section">
                  <h3>Foto de perfil</h3>
                  <div className="admin-usu-photo-wrap">
                    <div className="admin-usu-photo-preview">
                      {fotoCreateFormPreview ? (
                        <img src={fotoCreateFormPreview} alt="Foto apoderado" />
                      ) : (
                        <div className="admin-usu-photo-ph">{initialsPreview}</div>
                      )}
                    </div>
                    <label className="admin-usu-upload-btn">
                      📷 Subir foto
                      <input type="file" accept="image/*" onChange={handleFotoCreateChange} />
                    </label>
                    <p className="admin-usu-hint">Formatos: JPG, PNG, GIF, WEBP (máx. 5MB)</p>
                  </div>
                </div>
                <div className="admin-usu-profile-section">
                  <h3>Información Personal</h3>
                  <div className="admin-usu-form-grid">
                    {['nombres', 'apellido_paterno', 'apellido_materno', 'nro_documento', 'email', 'telefono_celular'].map((k) => (
                      <div key={k} className="admin-usu-field">
                        <label>{k === 'nro_documento' ? 'DNI *' : `${k.replace(/_/g, ' ')} *`}</label>
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
                      <label>Fecha de nacimiento</label>
                      <input
                        type="date"
                        value={form.fecha_nacimiento || ''}
                        onChange={(e) => setForm({ ...form, fecha_nacimiento: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
                <div className="admin-usu-profile-section">
                  <h3>Información del Sistema</h3>
                  <div className="admin-usu-info-grid">
                    <div className="admin-usu-info-item">
                      <span className="admin-usu-info-label">Usuario inicial</span>
                      <span className="admin-usu-info-value">{credencialDni || '—'}</span>
                    </div>
                    <div className="admin-usu-info-item">
                      <span className="admin-usu-info-label">Contraseña inicial</span>
                      <span className="admin-usu-info-value">{credencialDni || '—'}</span>
                    </div>
                  </div>
                  <p className="admin-usu-hint">
                    Si el DNI ya es usuario de <strong>personal/docente</strong>, no se crea otra cuenta: se vincula la ficha de
                    apoderado al mismo login.
                  </p>
                </div>
              </div>
              <div className="admin-usu-modal-actions">
                <button type="button" className="admin-usu-btn admin-usu-btn-secondary" onClick={cerrarModalCrear}>
                  ❌ Cancelar
                </button>
                <button type="button" className="admin-usu-btn admin-usu-btn-primary" onClick={guardarNuevo}>
                  💾 Guardar cambios
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {modalEdit && createPortal(
        <div className="admin-usu-modal-overlay" onClick={cerrarModalEditar}>
          <div className="admin-usu-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-usu-modal-header">
              <h2>Editar apoderado</h2>
              <button type="button" className="admin-usu-modal-close" onClick={cerrarModalEditar}>
                ✕
              </button>
            </div>
            <div className="admin-usu-modal-body">
              <div className="admin-usu-profile-form">
                <div className="admin-usu-profile-section">
                  <h3>Foto de perfil</h3>
                  <div className="admin-usu-photo-wrap">
                    <div className="admin-usu-photo-preview">
                      {fotoFormPreview ? (
                        <img src={fotoFormPreview} alt="Foto apoderado" />
                      ) : (
                        <div className="admin-usu-photo-ph">{initialsPreview}</div>
                      )}
                    </div>
                    <label className="admin-usu-upload-btn">
                      📷 Cambiar foto
                      <input type="file" accept="image/*" onChange={handleFotoEditChange} />
                    </label>
                    <p className="admin-usu-hint">Formatos: JPG, PNG, GIF, WEBP (máx. 5MB)</p>
                  </div>
                </div>
                <div className="admin-usu-profile-section">
                  <h3>Información Personal</h3>
                  <div className="admin-usu-form-grid">
                    {['nombres', 'apellido_paterno', 'apellido_materno', 'nro_documento', 'email', 'telefono_celular'].map((k) => (
                      <div key={k} className="admin-usu-field">
                        <label>{k === 'nro_documento' ? 'DNI *' : `${k.replace(/_/g, ' ')} *`}</label>
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
                  </div>
                </div>
                <div className="admin-usu-profile-section">
                  <h3>Información del Sistema</h3>
                  <div className="admin-usu-info-grid">
                    <div className="admin-usu-info-item">
                      <span className="admin-usu-info-label">Estado de acceso</span>
                      <select
                        value={form.usuario_estado || 'ACTIVO'}
                        onChange={(e) => setForm({ ...form, usuario_estado: e.target.value })}
                      >
                        <option value="ACTIVO">ACTIVO</option>
                        <option value="INACTIVO">INACTIVO</option>
                      </select>
                    </div>
                    <div className="admin-usu-info-item">
                      <span className="admin-usu-info-label">Usuario</span>
                      <span className="admin-usu-info-value">{credencialDni || '—'}</span>
                    </div>
                    <div className="admin-usu-info-item">
                      <span className="admin-usu-info-label">Contraseña por defecto</span>
                      <span className="admin-usu-info-value">{credencialDni || '—'}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="admin-usu-modal-actions">
                <button type="button" className="admin-usu-btn admin-usu-btn-secondary" onClick={cerrarModalEditar}>
                  ❌ Cancelar
                </button>
                <button type="button" className="admin-usu-btn admin-usu-btn-primary" onClick={guardarEdit}>
                  💾 Guardar cambios
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
