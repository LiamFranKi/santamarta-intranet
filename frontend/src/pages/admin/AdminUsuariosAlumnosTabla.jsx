import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import api from '../../services/api';
import Swal from 'sweetalert2';
import { fotoUsuarioAdmin } from '../../utils/adminUsuariosFoto';
import AdminUsuariosFotoLightbox from '../../components/admin/AdminUsuariosFotoLightbox';
import './AdminUsuarios.css';

/**
 * Vista tabla (respaldo). Usar URL /admin/usuarios/alumnos?vista=tabla o cambiar el import en Dashboard.
 */

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

export default function AdminUsuariosAlumnosTabla() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [openMenu, setOpenMenu] = useState(null);
  const [menuCoords, setMenuCoords] = useState({ top: 0, left: 0 });
  const [menuRow, setMenuRow] = useState(null);

  const [modalCreate, setModalCreate] = useState(false);
  const [modalEdit, setModalEdit] = useState(null);
  const [modalInfo, setModalInfo] = useState(null);
  const [modalAcceso, setModalAcceso] = useState(null);
  const [modalMensaje, setModalMensaje] = useState(null);
  const [accesoForm, setAccesoForm] = useState({ estado: 'ACTIVO', password: '' });
  const [mensajeDestino, setMensajeDestino] = useState('ALUMNO');
  const [mensajeApoderados, setMensajeApoderados] = useState([]);
  const [mensajeAsunto, setMensajeAsunto] = useState('');
  const [mensajeContenido, setMensajeContenido] = useState('');
  const [mensajeAdjuntos, setMensajeAdjuntos] = useState([]);
  const [enviandoMensaje, setEnviandoMensaje] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [form, setForm] = useState({});
  const [fotoCreateFile, setFotoCreateFile] = useState(null);
  const [fotoCreatePreview, setFotoCreatePreview] = useState('');
  const [fotoEditFile, setFotoEditFile] = useState(null);
  const [fotoEditPreview, setFotoEditPreview] = useState('');

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

  useEffect(() => () => {
    if (fotoCreatePreview && fotoCreatePreview.startsWith('blob:')) {
      URL.revokeObjectURL(fotoCreatePreview);
    }
    if (fotoEditPreview && fotoEditPreview.startsWith('blob:')) {
      URL.revokeObjectURL(fotoEditPreview);
    }
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

  const abrirCrear = () => {
    setForm({
      apellido_paterno: '',
      apellido_materno: '',
      nombres: '',
      nro_documento: '',
      fecha_nacimiento: '2015-01-01',
      email: '',
    });
    setFotoCreateFile(null);
    setFotoCreatePreview('');
    setFotoEditFile(null);
    setFotoEditPreview('');
    setModalCreate(true);
  };

  const guardarNuevo = async () => {
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v ?? ''));
      if (fotoCreateFile) {
        fd.append('foto', fotoCreateFile);
      }
      await api.post('/admin/usuarios/alumnos', fd);
      Swal.fire({ icon: 'success', title: 'Alumno registrado', text: 'Acceso: usuario y clave = DNI' });
      setFotoCreateFile(null);
      setFotoCreatePreview('');
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
        foto: data.foto || '',
        usuario_estado: data.usuario_estado || 'ACTIVO',
      });
      setFotoEditFile(null);
      setFotoEditPreview('');
      setModalEdit(row.id);
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudo cargar' });
    }
  };

  const guardarEdit = async () => {
    try {
      await api.put(`/admin/usuarios/alumnos/${modalEdit}`, form);
      if (fotoEditFile) {
        const fd = new FormData();
        fd.append('foto', fotoEditFile);
        await api.put(`/admin/usuarios/alumnos/${modalEdit}/foto`, fd);
      }
      Swal.fire({ icon: 'success', title: 'Actualizado' });
      setFotoEditFile(null);
      setFotoEditPreview('');
      setModalEdit(null);
      cargar();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudo guardar' });
    }
  };

  const abrirInfoAcceso = (row) => {
    setAccesoForm({
      estado: row.usuario_estado || 'ACTIVO',
      password: '',
    });
    setModalAcceso(row);
  };

  const guardarInfoAcceso = async () => {
    if (!modalAcceso) return;
    try {
      if (!modalAcceso.usuario_id) {
        await api.post(`/admin/usuarios/alumnos/${modalAcceso.id}/acceso`);
      } else {
        await api.put(`/admin/usuarios/alumnos/${modalAcceso.id}`, {
          usuario_estado: accesoForm.estado,
        });
      }
      if ((accesoForm.password || '').trim()) {
        await api.post(`/admin/usuarios/alumnos/${modalAcceso.id}/password`, {
          password: accesoForm.password.trim(),
        });
      }
      Swal.fire({ icon: 'success', title: 'Acceso actualizado' });
      setModalAcceso(null);
      cargar();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudo guardar el acceso' });
    }
  };

  const verInfo = async (row) => {
    try {
      const [infoRes, matriculasRes, apoderadosRes, hermanosRes] = await Promise.all([
        api.get(`/admin/usuarios/alumnos/${row.id}`),
        api.get(`/admin/usuarios/alumnos/${row.id}/matriculas`),
        api.get(`/admin/usuarios/alumnos/${row.id}/apoderados`),
        api.get(`/admin/usuarios/alumnos/${row.id}/hermanos`),
      ]);
      const info = infoRes.data || {};
      const matriculas = matriculasRes.data?.data || [];
      const apoderados = apoderadosRes.data?.data || [];
      const hermanos = hermanosRes.data?.data || [];
      const vigentes = matriculas.filter((m) => Number(m.estado) === 0 || Number(m.estado) === 4);
      vigentes.sort((a, b) => Number(b.anio || 0) - Number(a.anio || 0));
      setModalInfo({
        ...info,
        qr_data: info.nro_documento || `ALUMNO-${info.id || row.id}`,
        matricula_actual: vigentes[0] || null,
        apoderados,
        hermanos,
      });
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudo cargar información' });
    }
  };

  const cerrarMenus = () => {
    setOpenMenu(null);
    setMenuRow(null);
  };

  const abrirMenuOpciones = (event, row) => {
    event.stopPropagation();
    const nextOpen = openMenu === row.id ? null : row.id;
    if (!nextOpen) {
      cerrarMenus();
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 240;
    const menuHeight = 330;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const preferBelowTop = rect.bottom + 4;
    const preferAboveTop = rect.top - menuHeight - 4;
    const top = (preferBelowTop + menuHeight > viewportH - 8 && preferAboveTop > 8)
      ? preferAboveTop
      : Math.max(8, Math.min(preferBelowTop, viewportH - menuHeight - 8));
    const rawLeft = rect.right - menuWidth;
    const left = Math.max(8, Math.min(rawLeft, viewportW - menuWidth - 8));
    setMenuCoords({ top, left });
    setMenuRow(row);
    setOpenMenu(row.id);
  };

  const handleFotoEditChange = (event) => {
    if (fotoEditPreview && fotoEditPreview.startsWith('blob:')) {
      URL.revokeObjectURL(fotoEditPreview);
    }
    const file = event.target.files?.[0] || null;
    setFotoEditFile(file);
    setFotoEditPreview(file ? URL.createObjectURL(file) : '');
  };

  const handleFotoCreateChange = (event) => {
    if (fotoCreatePreview && fotoCreatePreview.startsWith('blob:')) {
      URL.revokeObjectURL(fotoCreatePreview);
    }
    const file = event.target.files?.[0] || null;
    setFotoCreateFile(file);
    setFotoCreatePreview(file ? URL.createObjectURL(file) : '');
  };

  const abrirModalMensaje = async (row) => {
    try {
      const { data } = await api.get(`/docente/mensajes/alumno/${row.id}/apoderados-destinatarios`);
      const aps = Array.isArray(data?.destinatarios) ? data.destinatarios : [];
      setModalMensaje(row);
      setMensajeApoderados(aps);
      setMensajeDestino(row.usuario_id ? 'ALUMNO' : (aps.length ? 'APODERADOS' : 'ALUMNO'));
      setMensajeAsunto('');
      setMensajeContenido('');
      setMensajeAdjuntos([]);
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudo preparar el envío de mensaje' });
    }
  };

  const cerrarModalMensaje = () => {
    setModalMensaje(null);
    setMensajeApoderados([]);
    setMensajeAsunto('');
    setMensajeContenido('');
    setMensajeAdjuntos([]);
    setEnviandoMensaje(false);
  };

  const quitarAdjuntoMensaje = (idx) => {
    setMensajeAdjuntos((prev) => prev.filter((_, i) => i !== idx));
  };

  const enviarMensajeDesdeModal = async () => {
    if (!modalMensaje) return;
    const asunto = String(mensajeAsunto || '').trim();
    const contenido = String(mensajeContenido || '').trim();
    if (!asunto) {
      Swal.fire({ icon: 'error', title: 'Asunto requerido', text: 'Ingrese el asunto del mensaje.' });
      return;
    }
    if (!contenido) {
      Swal.fire({ icon: 'error', title: 'Mensaje requerido', text: 'Ingrese el contenido del mensaje.' });
      return;
    }
    const ids = new Set();
    if (mensajeDestino === 'ALUMNO' || mensajeDestino === 'TODOS') {
      if (modalMensaje.usuario_id) ids.add(Number(modalMensaje.usuario_id));
    }
    if (mensajeDestino === 'APODERADOS' || mensajeDestino === 'TODOS') {
      (mensajeApoderados || []).forEach((ap) => {
        if (ap?.usuario_id) ids.add(Number(ap.usuario_id));
      });
    }
    const destinatarios = Array.from(ids).filter((n) => Number.isFinite(n) && n > 0);
    if (!destinatarios.length) {
      Swal.fire({
        icon: 'info',
        title: 'Sin destinatarios',
        text: 'No hay usuarios activos para el destino seleccionado (alumno/apoderados).',
      });
      return;
    }

    try {
      setEnviandoMensaje(true);
      const fd = new FormData();
      fd.append('destinatarios', JSON.stringify(destinatarios));
      fd.append('grupos', JSON.stringify([]));
      fd.append('asunto', asunto);
      fd.append('mensaje', contenido);
      mensajeAdjuntos.forEach((file) => fd.append('archivos', file));
      await api.post('/docente/mensajes/enviar', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      Swal.fire({
        icon: 'success',
        title: 'Mensaje enviado',
        text: `Se envió correctamente a ${destinatarios.length} destinatario(s).`,
      });
      cerrarModalMensaje();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudo enviar el mensaje' });
    } finally {
      setEnviandoMensaje(false);
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
  const initialsPreview = (form.nombres || form.apellido_paterno || 'A').trim().charAt(0).toUpperCase();
  const fotoCreateFormPreview = fotoCreatePreview;
  const fotoFormPreview = fotoEditPreview || fotoUsuarioAdmin(form.foto);
  const credencialDni = (form.nro_documento || '').trim();
  const infoFoto = fotoUsuarioAdmin(modalInfo?.foto || '');
  const avatarAsignado = (modalInfo?.avatar_asignado_url || '').trim();

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
        <div className="admin-usu-table-scroll">
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
                        <button
                          type="button"
                          className="admin-usu-avatar-btn"
                          onClick={() => setLightboxUrl(url)}
                          title="Ver foto"
                        >
                          <img className="admin-usu-avatar" src={url} alt="" />
                        </button>
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
                          onClick={(e) => abrirMenuOpciones(e, row)}
                        >
                          Opciones ▾
                        </button>
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

      {openMenu && menuRow && createPortal(
        <div
          className="admin-usu-dropdown admin-usu-dropdown-portal"
          style={{ top: menuCoords.top, left: Math.max(12, menuCoords.left) }}
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" onClick={() => { verInfo(menuRow); cerrarMenus(); }}>
            ℹ️ Ver Información
          </button>
          <button type="button" onClick={() => { abrirModalMensaje(menuRow); cerrarMenus(); }}>
            ✉️ Enviar Mensaje
          </button>
          <button type="button" onClick={() => { historialMatriculas(menuRow); cerrarMenus(); }}>
            📋 Historial de Matriculas
          </button>
          <button type="button" onClick={() => { historialPagos(menuRow); cerrarMenus(); }}>
            💰 Historial de Pagos
          </button>
          <button type="button" onClick={() => { abrirInfoAcceso(menuRow); cerrarMenus(); }}>
            🔐 Información de Acceso
          </button>
          <hr />
          <button type="button" onClick={() => { abrirEditar(menuRow); cerrarMenus(); }}>
            ✏️ Editar Alumno
          </button>
          <button type="button" onClick={() => { eliminarAlumno(menuRow); cerrarMenus(); }}>
            🗑️ Eliminar Alumno
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
        <div className="admin-usu-modal-overlay" onClick={() => setModalCreate(false)}>
          <div className="admin-usu-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-usu-modal-header">
              <h2>Nuevo alumno</h2>
              <button type="button" className="admin-usu-modal-close" onClick={() => setModalCreate(false)}>
                ✕
              </button>
            </div>
            <div className="admin-usu-modal-body">
              <div className="admin-usu-profile-form">
                <div className="admin-usu-profile-section">
                  <h3>Foto de Perfil</h3>
                  <div className="admin-usu-photo-wrap">
                    <div className="admin-usu-photo-preview">
                      {fotoCreateFormPreview ? (
                        <img src={fotoCreateFormPreview} alt="Foto alumno" />
                      ) : (
                        <div className="admin-usu-photo-ph">{initialsPreview}</div>
                      )}
                    </div>
                    <label className="admin-usu-upload-btn">
                      📷 Subir Foto
                      <input type="file" accept="image/*" onChange={handleFotoCreateChange} />
                    </label>
                    <p className="admin-usu-hint">Formatos: JPG, PNG, GIF, WEBP (máx. 5MB)</p>
                  </div>
                </div>
                <div className="admin-usu-profile-section">
                  <h3>Información Personal</h3>
                  <div className="admin-usu-form-grid">
                    {['apellido_paterno', 'apellido_materno', 'nombres', 'nro_documento', 'email'].map((k) => (
                      <div key={k} className="admin-usu-field">
                        <label>{k === 'nro_documento' ? 'DNI *' : `${k.replace(/_/g, ' ')} *`}</label>
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
                </div>
              </div>
              <div className="admin-usu-modal-actions">
                <button type="button" className="admin-usu-btn admin-usu-btn-secondary" onClick={() => setModalCreate(false)}>
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
        <div className="admin-usu-modal-overlay" onClick={() => setModalEdit(null)}>
          <div className="admin-usu-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-usu-modal-header">
              <h2>Editar alumno</h2>
              <button type="button" className="admin-usu-modal-close" onClick={() => setModalEdit(null)}>
                ✕
              </button>
            </div>
            <div className="admin-usu-modal-body">
              <div className="admin-usu-profile-form">
                <div className="admin-usu-profile-section">
                  <h3>Foto de Perfil</h3>
                  <div className="admin-usu-photo-wrap">
                    <div className="admin-usu-photo-preview">
                      {fotoFormPreview ? (
                        <img src={fotoFormPreview} alt="Foto alumno" />
                      ) : (
                        <div className="admin-usu-photo-ph">{initialsPreview}</div>
                      )}
                    </div>
                    <label className="admin-usu-upload-btn">
                      📷 Cambiar Foto
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFotoEditChange}
                      />
                    </label>
                    <p className="admin-usu-hint">Formatos: JPG, PNG, GIF, WEBP (máx. 5MB)</p>
                  </div>
                </div>
                <div className="admin-usu-profile-section">
                  <h3>Información Personal</h3>
                  <div className="admin-usu-form-grid">
                    {['apellido_paterno', 'apellido_materno', 'nombres', 'nro_documento', 'email'].map((k) => (
                      <div key={k} className="admin-usu-field">
                        <label>{k === 'nro_documento' ? 'DNI *' : `${k.replace(/_/g, ' ')} *`}</label>
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
                      <span className="admin-usu-info-value">{form.nro_documento || '—'}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="admin-usu-modal-actions">
                <button type="button" className="admin-usu-btn admin-usu-btn-secondary" onClick={() => setModalEdit(null)}>
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

      {modalInfo && createPortal(
        <div className="admin-usu-modal-overlay" onClick={() => setModalInfo(null)}>
          <div className="admin-usu-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-usu-modal-header">
              <h2>Información del alumno</h2>
              <button type="button" className="admin-usu-modal-close" onClick={() => setModalInfo(null)}>
                ✕
              </button>
            </div>
            <div className="admin-usu-modal-body">
              <div className="admin-usu-profile-form">
                <div className="admin-usu-profile-section">
                  <h3>Ficha General</h3>
                  <div className="admin-usu-info-hero admin-usu-info-hero-split">
                    <div className="admin-usu-info-hero-main">
                      <div className="admin-usu-photo-preview">
                        {infoFoto ? <img src={infoFoto} alt="Foto alumno" /> : <div className="admin-usu-photo-ph">{(modalInfo.nombres || 'A').charAt(0)}</div>}
                      </div>
                      <div>
                        <h4>{nombreAlumno(modalInfo)}</h4>
                        <p>Alumno</p>
                        <span className={`admin-usu-badge ${modalInfo.usuario_id ? '' : 'admin-usu-badge-muted'}`}>
                          {modalInfo.usuario_id ? 'Con acceso' : 'Sin acceso'}
                        </span>
                      </div>
                    </div>
                    <div className="admin-usu-qr-panel">
                      <div className="admin-usu-qr-group">
                        <span className="admin-usu-info-label">Avatar</span>
                        {avatarAsignado ? (
                          <div className="admin-usu-photo-preview admin-usu-photo-preview-sm">
                            <img src={avatarAsignado} alt="Avatar alumno" />
                          </div>
                        ) : (
                          <div className="admin-usu-avatar-empty">
                            Avatar aun no Asignado
                          </div>
                        )}
                      </div>
                      <div className="admin-usu-qr-group">
                        <span className="admin-usu-info-label">Código QR</span>
                        <div className="admin-usu-qr-box">
                          <QRCodeSVG
                            value={modalInfo.qr_data || modalInfo.nro_documento || 'ALUMNO'}
                            size={94}
                            level="H"
                            includeMargin={false}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="admin-usu-profile-section">
                  <h3>Datos Personales</h3>
                  <div className="admin-usu-info-grid">
                    <div className="admin-usu-info-item"><span className="admin-usu-info-label">Nombres</span><span className="admin-usu-info-value">{modalInfo.nombres || '—'}</span></div>
                    <div className="admin-usu-info-item"><span className="admin-usu-info-label">Apellido paterno</span><span className="admin-usu-info-value">{modalInfo.apellido_paterno || '—'}</span></div>
                    <div className="admin-usu-info-item"><span className="admin-usu-info-label">Apellido materno</span><span className="admin-usu-info-value">{modalInfo.apellido_materno || '—'}</span></div>
                    <div className="admin-usu-info-item"><span className="admin-usu-info-label">DNI</span><span className="admin-usu-info-value">{modalInfo.nro_documento || '—'}</span></div>
                    <div className="admin-usu-info-item"><span className="admin-usu-info-label">Nacimiento</span><span className="admin-usu-info-value">{formatFechaNacimiento(modalInfo.fecha_nacimiento)}</span></div>
                    <div className="admin-usu-info-item"><span className="admin-usu-info-label">Correo</span><span className="admin-usu-info-value">{modalInfo.email || '—'}</span></div>
                  </div>
                </div>
                {modalInfo.matricula_actual && (
                  <div className="admin-usu-profile-section">
                    <h3>Matrícula Vigente</h3>
                    <div className="admin-usu-info-grid">
                      <div className="admin-usu-info-item"><span className="admin-usu-info-label">Año</span><span className="admin-usu-info-value">{modalInfo.matricula_actual.anio || '—'}</span></div>
                      <div className="admin-usu-info-item"><span className="admin-usu-info-label">Nivel</span><span className="admin-usu-info-value">{modalInfo.matricula_actual.nivel_nombre || '—'}</span></div>
                      <div className="admin-usu-info-item"><span className="admin-usu-info-label">Grado</span><span className="admin-usu-info-value">{modalInfo.matricula_actual.grado || '—'}</span></div>
                      <div className="admin-usu-info-item"><span className="admin-usu-info-label">Sección</span><span className="admin-usu-info-value">{modalInfo.matricula_actual.seccion || '—'}</span></div>
                    </div>
                  </div>
                )}
                <div className="admin-usu-profile-section">
                  <h3>Apoderados</h3>
                  {(modalInfo.apoderados || []).length === 0 ? (
                    <span className="admin-usu-info-value">Sin apoderados vinculados</span>
                  ) : (
                    <div className="admin-usu-related-list">
                      {(modalInfo.apoderados || []).map((ap) => (
                        <div key={ap.id} className="admin-usu-related-card">
                          <div className="admin-usu-info-item">
                            <span className="admin-usu-info-label">Apoderado</span>
                            <span className="admin-usu-info-value">{[ap.apellido_paterno, ap.apellido_materno, ap.nombres].filter(Boolean).join(' ') || '—'}</span>
                          </div>
                          <div className="admin-usu-info-item">
                            <span className="admin-usu-info-label">DNI</span>
                            <span className="admin-usu-info-value">{ap.nro_documento || '—'}</span>
                          </div>
                          <div className="admin-usu-info-item">
                            <span className="admin-usu-info-label">Celular</span>
                            <span className="admin-usu-info-value">{ap.telefono_celular || '—'}</span>
                          </div>
                          <div className="admin-usu-info-item">
                            <span className="admin-usu-info-label">Estado acceso</span>
                            <span className="admin-usu-info-value">{ap.usuario_id ? (ap.usuario_estado || 'ACTIVO') : 'Sin usuario'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="admin-usu-profile-section">
                  <h3>Hermanos</h3>
                  {(modalInfo.hermanos || []).length === 0 ? (
                    <span className="admin-usu-info-value">No tiene hermanos registrados</span>
                  ) : (
                    <div className="admin-usu-related-list">
                      {(modalInfo.hermanos || []).map((h) => (
                        <div key={h.id} className="admin-usu-related-card">
                          <div className="admin-usu-info-item">
                            <span className="admin-usu-info-label">Hermano(a)</span>
                            <span className="admin-usu-info-value">{[h.apellido_paterno, h.apellido_materno, h.nombres].filter(Boolean).join(' ') || '—'}</span>
                          </div>
                          <div className="admin-usu-info-item">
                            <span className="admin-usu-info-label">DNI</span>
                            <span className="admin-usu-info-value">{h.nro_documento || '—'}</span>
                          </div>
                          <div className="admin-usu-info-item">
                            <span className="admin-usu-info-label">Nivel</span>
                            <span className="admin-usu-info-value">{h.nivel_nombre || '—'}</span>
                          </div>
                          <div className="admin-usu-info-item">
                            <span className="admin-usu-info-label">Grado / Sección</span>
                            <span className="admin-usu-info-value">
                              {h.grado ? `${h.grado}° ${h.seccion || ''}`.trim() : '—'} {h.anio ? `(${h.anio})` : ''}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="admin-usu-modal-actions">
                <button type="button" className="admin-usu-btn admin-usu-btn-secondary" onClick={() => setModalInfo(null)}>
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {modalAcceso && createPortal(
        <div className="admin-usu-modal-overlay" onClick={() => setModalAcceso(null)}>
          <div className="admin-usu-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-usu-modal-header">
              <h2>Información de acceso</h2>
              <button type="button" className="admin-usu-modal-close" onClick={() => setModalAcceso(null)}>
                ✕
              </button>
            </div>
            <div className="admin-usu-modal-body">
              <div className="admin-usu-profile-section">
                <h3>Credenciales y estado</h3>
                <div className="admin-usu-form-grid">
                  <div className="admin-usu-field">
                    <label>Usuario</label>
                    <input type="text" readOnly value={modalAcceso.login_usuario || modalAcceso.nro_documento || ''} />
                  </div>
                  <div className="admin-usu-field">
                    <label>Nueva contraseña</label>
                    <input
                      type="text"
                      placeholder="Opcional: dejar vacío para no cambiar"
                      value={accesoForm.password}
                      onChange={(e) => setAccesoForm({ ...accesoForm, password: e.target.value })}
                    />
                  </div>
                  <div className="admin-usu-field">
                    <label>Tipo</label>
                    <input type="text" readOnly value="ALUMNO" />
                  </div>
                  <div className="admin-usu-field">
                    <label>Estado</label>
                    <select
                      value={accesoForm.estado}
                      disabled={!modalAcceso.usuario_id}
                      onChange={(e) => setAccesoForm({ ...accesoForm, estado: e.target.value })}
                    >
                      <option value="ACTIVO">ACTIVO</option>
                      <option value="INACTIVO">INACTIVO</option>
                    </select>
                  </div>
                </div>
                {!modalAcceso.usuario_id && (
                  <p className="admin-usu-hint">Este alumno no tiene usuario. Al guardar se creará su acceso con usuario = DNI.</p>
                )}
              </div>
              <div className="admin-usu-modal-actions">
                <button type="button" className="admin-usu-btn admin-usu-btn-secondary" onClick={() => setModalAcceso(null)}>
                  Cancelar
                </button>
                <button type="button" className="admin-usu-btn admin-usu-btn-primary" onClick={guardarInfoAcceso}>
                  Guardar datos
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {modalMensaje && createPortal(
        <div className="admin-usu-modal-overlay" onClick={cerrarModalMensaje}>
          <div className="admin-usu-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-usu-modal-header">
              <h2>Enviar mensaje</h2>
              <button type="button" className="admin-usu-modal-close" onClick={cerrarModalMensaje}>
                ✕
              </button>
            </div>
            <div className="admin-usu-modal-body">
              <div className="admin-usu-profile-section">
                <h3>{nombreAlumno(modalMensaje)}</h3>
                <div className="admin-usu-field">
                  <label>Destino</label>
                  <div className="admin-usu-destino-row">
                    <label>
                      <input
                        type="radio"
                        name="destino-mensaje-alumno"
                        value="ALUMNO"
                        checked={mensajeDestino === 'ALUMNO'}
                        onChange={() => setMensajeDestino('ALUMNO')}
                        disabled={!modalMensaje.usuario_id}
                      />
                      Alumno
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="destino-mensaje-alumno"
                        value="APODERADOS"
                        checked={mensajeDestino === 'APODERADOS'}
                        onChange={() => setMensajeDestino('APODERADOS')}
                        disabled={(mensajeApoderados || []).length === 0}
                      />
                      Apoderado(s)
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="destino-mensaje-alumno"
                        value="TODOS"
                        checked={mensajeDestino === 'TODOS'}
                        onChange={() => setMensajeDestino('TODOS')}
                        disabled={!modalMensaje.usuario_id && (mensajeApoderados || []).length === 0}
                      />
                      Todos
                    </label>
                  </div>
                </div>
                <div className="admin-usu-field">
                  <label>Asunto</label>
                  <input
                    type="text"
                    value={mensajeAsunto}
                    onChange={(e) => setMensajeAsunto(e.target.value)}
                    placeholder="Escriba el asunto"
                  />
                </div>
                <div className="admin-usu-field">
                  <label>Mensaje</label>
                  <textarea
                    className="admin-usu-msg-textarea"
                    value={mensajeContenido}
                    onChange={(e) => setMensajeContenido(e.target.value)}
                    placeholder="Escriba su mensaje..."
                  />
                </div>
                <div className="admin-usu-field">
                  <label>Adjuntar imagen / archivo</label>
                  <input
                    type="file"
                    multiple
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      if (!files.length) return;
                      setMensajeAdjuntos((prev) => [...prev, ...files]);
                      e.target.value = '';
                    }}
                  />
                </div>
                {!!mensajeAdjuntos.length && (
                  <div className="admin-usu-files-list">
                    {mensajeAdjuntos.map((f, idx) => (
                      <div key={`${f.name}-${idx}`} className="admin-usu-file-chip">
                        <span>{f.name}</span>
                        <button type="button" onClick={() => quitarAdjuntoMensaje(idx)}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="admin-usu-modal-actions">
                <button type="button" className="admin-usu-btn admin-usu-btn-secondary" onClick={cerrarModalMensaje}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="admin-usu-btn admin-usu-btn-primary"
                  onClick={enviarMensajeDesdeModal}
                  disabled={enviandoMensaje}
                >
                  {enviandoMensaje ? 'Enviando...' : 'Enviar mensaje'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      <AdminUsuariosFotoLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </div>
  );
}
