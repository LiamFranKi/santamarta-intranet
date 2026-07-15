import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import Swal from 'sweetalert2';
import { fotoUsuarioAdmin } from '../../utils/adminUsuariosFoto';
import AdminUsuariosFotoLightbox from '../../components/admin/AdminUsuariosFotoLightbox';
import AdminMensajeQuillEditor from '../../components/admin/AdminMensajeQuillEditor';
import NuevaMatriculaAlumnoExistenteModal from '../../components/admin/NuevaMatriculaAlumnoExistenteModal';
import { mensajeHtmlTieneContenido } from '../../utils/mensajesHtml';
import { showHistorialPagosSwal, showListaPagosMatriculaSwal } from '../../utils/adminAlumnoPagosSwal';
import './AdminUsuarios.css';
import './AdminUsuariosEquipoCards.css';

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

/** Solo fecha de registro de matrícula (sin hora). */
function formatFechaRegistroMatricula(val) {
  if (val == null || val === '') return '—';
  const s = String(val).trim().slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return formatFechaNacimiento(val);
}

/** Índices alineados a sistema-anterior TraitConstants::$ESTADOS_MATRICULA */
function labelMatriculaEstado(estado) {
  const labels = ['Regular', 'Irregular', 'Retirado', 'Traslado', 'Temporal'];
  const e = Number(estado);
  if (Number.isFinite(e) && e >= 0 && e < labels.length) return labels[e];
  return `Cód. ${estado}`;
}

const PARENTESCO_VINC_LABEL = {
  1: 'Padre',
  2: 'Madre',
  3: 'Tutor',
  4: 'Apoderado',
};

export default function AdminUsuariosAlumnos() {
  const { user } = useAuth();
  const vistaRestringidaPsicologa = user?.tipo === 'PSICOLOGA';
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [openMenu, setOpenMenu] = useState(null);
  const [menuCoords, setMenuCoords] = useState({ top: 0, left: 0 });
  const [menuAnchorRect, setMenuAnchorRect] = useState(null);
  const menuPortalRef = useRef(null);
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
  const [modalVincApoderado, setModalVincApoderado] = useState(false);
  const [vincApDni, setVincApDni] = useState('');
  const [vincApPreview, setVincApPreview] = useState(null);
  const [vincApParentesco, setVincApParentesco] = useState(1);
  const [vincApBuscando, setVincApBuscando] = useState(false);
  const [vincApGuardando, setVincApGuardando] = useState(false);
  const [modalMatriculas, setModalMatriculas] = useState(null);
  const [nuevaMatriculaModalOpen, setNuevaMatriculaModalOpen] = useState(false);
  /** { alumno, matriculaId } — edición con el mismo formulario que «Registrar nuevo» */
  const [editMatriculaModal, setEditMatriculaModal] = useState(null);
  const [menuMatricula, setMenuMatricula] = useState(null);
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

  useEffect(() => {
    if (!modalMatriculas) {
      setNuevaMatriculaModalOpen(false);
      setEditMatriculaModal(null);
    }
  }, [modalMatriculas]);

  useEffect(() => () => {
    if (fotoCreatePreview && fotoCreatePreview.startsWith('blob:')) {
      URL.revokeObjectURL(fotoCreatePreview);
    }
    if (fotoEditPreview && fotoEditPreview.startsWith('blob:')) {
      URL.revokeObjectURL(fotoEditPreview);
    }
  }, [fotoCreatePreview, fotoEditPreview]);

  useEffect(() => {
    if (!openMenu && !menuMatricula) return undefined;
    const close = () => cerrarMenus();
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [openMenu, menuMatricula]);

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
      const vigentes = matriculas.filter((m) => Number(m.estado) === 0);
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

  const refrescarApoderadosEnModalInfo = async () => {
    if (!modalInfo?.id) return;
    try {
      const { data } = await api.get(`/admin/usuarios/alumnos/${modalInfo.id}/apoderados`);
      setModalInfo((prev) => (prev ? { ...prev, apoderados: data.data || [] } : prev));
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudo actualizar la lista de apoderados' });
    }
  };

  const abrirModalVincApoderado = () => {
    setVincApDni('');
    setVincApPreview(null);
    setVincApParentesco(1);
    setModalVincApoderado(true);
  };

  const buscarApoderadoPorDni = async () => {
    const dni = String(vincApDni || '').trim();
    if (!dni) {
      Swal.fire({ icon: 'info', title: 'Ingrese el DNI' });
      return;
    }
    setVincApBuscando(true);
    setVincApPreview(null);
    try {
      const { data } = await api.get('/admin/usuarios/apoderados/por-dni', { params: { dni } });
      if (!data.encontrado) {
        Swal.fire({
          icon: 'info',
          title: 'No encontrado',
          text: 'No hay apoderado registrado con ese DNI en este colegio.',
        });
        return;
      }
      const ya = (modalInfo.apoderados || []).some((a) => String(a.nro_documento || '').trim() === dni);
      if (ya) {
        Swal.fire({ icon: 'info', title: 'Ya vinculado', text: 'Ese apoderado ya figura en la lista del alumno.' });
        return;
      }
      setVincApPreview(data.apoderado);
      const p = Number(data.apoderado?.parentesco);
      if (p >= 1 && p <= 4) setVincApParentesco(p);
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error al buscar' });
    } finally {
      setVincApBuscando(false);
    }
  };

  const guardarVinculoApoderado = async () => {
    if (!modalInfo?.id || !vincApPreview) return;
    setVincApGuardando(true);
    try {
      await api.post(`/admin/usuarios/alumnos/${modalInfo.id}/vincular-apoderado`, {
        nro_documento: String(vincApPreview.nro_documento || '').trim(),
        parentesco: vincApParentesco,
      });
      Swal.fire({ icon: 'success', title: 'Apoderado vinculado' });
      setModalVincApoderado(false);
      await refrescarApoderadosEnModalInfo();
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudo guardar el vínculo' });
    } finally {
      setVincApGuardando(false);
    }
  };

  const desvincularApoderadoDeAlumno = async (ap) => {
    if (!modalInfo?.id || !ap?.id) return;
    const nombre = [ap.apellido_paterno, ap.apellido_materno, ap.nombres].filter(Boolean).join(' ').trim() || 'este apoderado';
    const ultimo = (modalInfo.apoderados || []).length <= 1;
    const ok = await Swal.fire({
      icon: 'warning',
      title: '¿Quitar apoderado del alumno?',
      text: ultimo
        ? `Se eliminará el vínculo en familias con ${nombre}. El alumno quedará sin apoderados vinculados.`
        : `Se quitará el vínculo en familias con ${nombre}. La ficha del apoderado no se elimina.`,
      showCancelButton: true,
      confirmButtonText: 'Sí, quitar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
    });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/admin/usuarios/alumnos/${modalInfo.id}/apoderados/${ap.id}`);
      Swal.fire({ icon: 'success', title: 'Vínculo quitado' });
      await refrescarApoderadosEnModalInfo();
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudo quitar el vínculo' });
    }
  };

  const cerrarMenus = () => {
    setOpenMenu(null);
    setMenuRow(null);
    setMenuMatricula(null);
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
    const menuHeight = menuRect.height || 120;
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
    if (!asunto) {
      Swal.fire({ icon: 'error', title: 'Asunto requerido', text: 'Ingrese el asunto del mensaje.' });
      return;
    }
    if (!mensajeHtmlTieneContenido(mensajeContenido)) {
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
      fd.append('mensaje', String(mensajeContenido || ''));
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

  const recargarMatriculasModal = async (alumnoId) => {
    try {
      const { data } = await api.get(`/admin/usuarios/alumnos/${alumnoId}/matriculas`);
      const list = data.data || [];
      setModalMatriculas((prev) => (prev && prev.alumno?.id === alumnoId ? { ...prev, rows: list, loading: false } : prev));
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudo actualizar el listado' });
    }
  };

  const historialMatriculas = async (row) => {
    setMenuMatricula(null);
    setModalMatriculas({ alumno: row, loading: true, rows: [] });
    try {
      const { data } = await api.get(`/admin/usuarios/alumnos/${row.id}/matriculas`);
      const list = data.data || [];
      setModalMatriculas({ alumno: row, loading: false, rows: list });
    } catch (e) {
      setModalMatriculas(null);
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudo cargar el historial' });
    }
  };

  const abrirMenuMatricula = (e, alumno, mat) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const w = 240;
    setMenuMatricula({
      top: Math.min(rect.bottom + 4, window.innerHeight - 200),
      left: Math.min(rect.left, window.innerWidth - w - 12),
      alumno,
      mat,
    });
  };

  const verPagosMatricula = async (alumno, mat) => {
    cerrarMenus();
    try {
      const { data } = await api.get(`/admin/usuarios/alumnos/${alumno.id}/matriculas/${mat.matricula_id}/pagos`);
      const m = data.data;
      if (!m) {
        Swal.fire({ icon: 'info', title: 'Pagos', text: 'No hay datos para esta matrícula.' });
        return;
      }
      showListaPagosMatriculaSwal(nombreAlumno(alumno), m, { alumnoId: alumno.id });
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudo cargar pagos' });
    }
  };

  const abrirEditarMatricula = (alumno, mat) => {
    cerrarMenus();
    setNuevaMatriculaModalOpen(false);
    setEditMatriculaModal({ alumno, matriculaId: mat.matricula_id });
  };

  const borrarMatricula = async (alumno, mat) => {
    cerrarMenus();
    const ok = await Swal.fire({
      title: '¿Eliminar matrícula?',
      html: `<p>Se eliminará el registro de matrícula del grupo <strong>${(mat.grupo_texto || '').replace(/</g, '')}</strong>.</p>
        <p style="color:#b91c1c;font-size:0.9rem">Solo es posible si no hay pagos asociados a esa matrícula.</p>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
    });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/admin/usuarios/alumnos/${alumno.id}/matriculas/${mat.matricula_id}`);
      Swal.fire({ icon: 'success', title: 'Matrícula eliminada' });
      if (modalMatriculas?.alumno?.id === alumno.id) {
        await recargarMatriculasModal(alumno.id);
      }
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudo eliminar' });
    }
  };

  const historialPagos = async (row) => {
    try {
      const { data } = await api.get(`/admin/usuarios/alumnos/${row.id}/pagos`);
      const matriculas = data.data || [];
      if (!matriculas.length) {
        Swal.fire({ title: 'Historial de pagos', text: 'No hay pagos registrados.', icon: 'info' });
        return;
      }
      showHistorialPagosSwal(nombreAlumno(row), matriculas);
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
        <div className="admin-usu-header-icon" aria-hidden="true">
          🎓
        </div>
        <div className="admin-usu-header-text">
          <h1>Alumnos</h1>
          <p>Listado del colegio con acceso al aula. Usuario y contraseña por defecto: DNI.</p>
          <p className="admin-usu-view-hint">
            Vista en tarjetas. Para la grilla clásica, use la misma ruta con <code>?vista=tabla</code> en el
            navegador.
          </p>
        </div>
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
        {!vistaRestringidaPsicologa && (
          <button type="button" className="admin-usu-btn admin-usu-btn-new" onClick={abrirCrear}>
            + Registrar nuevo
          </button>
        )}
      </div>

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
                  <div
                    className={`admin-usu-person-photo-wrap${url ? ' admin-usu-person-photo-wrap--clickable' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (url) setLightboxUrl(url);
                    }}
                    role={url ? 'button' : undefined}
                    tabIndex={url ? 0 : undefined}
                    onKeyDown={
                      url
                        ? (ev) => {
                            if (ev.key === 'Enter' || ev.key === ' ') {
                              ev.preventDefault();
                              setLightboxUrl(url);
                            }
                          }
                        : undefined
                    }
                  >
                    {url ? (
                      <img className="admin-usu-person-photo" src={url} alt="" />
                    ) : (
                      <div className="admin-usu-person-photo-ph">{letraAvatar}</div>
                    )}
                  </div>
                  <h3 className="admin-usu-person-name">{nombreAlumno(row)}</h3>
                  <p className="admin-usu-person-meta">
                    Nac.: {formatFechaNacimiento(row.fecha_nacimiento)}
                  </p>
                  <p className="admin-usu-person-dni">DNI: {row.nro_documento || '—'}</p>
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

      {openMenu && menuRow && createPortal(
        <div
          ref={menuPortalRef}
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
          {!vistaRestringidaPsicologa && (
            <>
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
            </>
          )}
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
                  <div className="admin-usu-section-head">
                    <h3>Apoderados</h3>
                    <button
                      type="button"
                      className="admin-usu-btn admin-usu-btn-secondary admin-usu-btn-compact"
                      onClick={(e) => {
                        e.stopPropagation();
                        abrirModalVincApoderado();
                      }}
                    >
                      + Nuevo
                    </button>
                  </div>
                  {(modalInfo.apoderados || []).length === 0 ? (
                    <span className="admin-usu-info-value">Sin apoderados vinculados</span>
                  ) : (
                    <div className="admin-usu-related-list">
                      {(modalInfo.apoderados || []).map((ap) => (
                        <div key={ap.id} className="admin-usu-related-card">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                            <div className="admin-usu-info-item" style={{ flex: 1, minWidth: 0 }}>
                              <span className="admin-usu-info-label">Apoderado</span>
                              <span className="admin-usu-info-value">{[ap.apellido_paterno, ap.apellido_materno, ap.nombres].filter(Boolean).join(' ') || '—'}</span>
                            </div>
                            <button
                              type="button"
                              className="admin-usu-btn admin-usu-btn-danger admin-usu-btn-compact"
                              onClick={() => desvincularApoderadoDeAlumno(ap)}
                            >
                              Quitar vínculo
                            </button>
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

      {modalVincApoderado && createPortal(
        <div
          className="admin-usu-modal-overlay"
          onClick={() => {
            if (!vincApGuardando) setModalVincApoderado(false);
          }}
        >
          <div className="admin-usu-modal admin-usu-modal--sub" onClick={(e) => e.stopPropagation()}>
            <div className="admin-usu-modal-header">
              <h2>Vincular apoderado</h2>
              <button
                type="button"
                className="admin-usu-modal-close"
                onClick={() => !vincApGuardando && setModalVincApoderado(false)}
              >
                ✕
              </button>
            </div>
            <div className="admin-usu-modal-body">
              <p className="admin-usu-hint">Ingrese el DNI de un apoderado ya registrado en el colegio.</p>
              <div className="admin-usu-field">
                <label>DNI</label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={vincApDni}
                    onChange={(e) => setVincApDni(e.target.value)}
                    placeholder="Número de documento"
                    style={{ flex: 1, minWidth: 140 }}
                  />
                  <button
                    type="button"
                    className="admin-usu-btn admin-usu-btn-search"
                    onClick={buscarApoderadoPorDni}
                    disabled={vincApBuscando}
                  >
                    {vincApBuscando ? 'Buscando…' : 'Buscar'}
                  </button>
                </div>
              </div>
              {vincApPreview && (
                <div className="admin-usu-profile-section" style={{ marginTop: '1rem' }}>
                  <div className="admin-usu-info-grid">
                    <div className="admin-usu-info-item">
                      <span className="admin-usu-info-label">Nombre</span>
                      <span className="admin-usu-info-value">
                        {[vincApPreview.apellido_paterno, vincApPreview.apellido_materno, vincApPreview.nombres].filter(Boolean).join(' ') || '—'}
                      </span>
                    </div>
                    <div className="admin-usu-info-item">
                      <span className="admin-usu-info-label">DNI</span>
                      <span className="admin-usu-info-value">{vincApPreview.nro_documento || '—'}</span>
                    </div>
                    <div className="admin-usu-info-item">
                      <span className="admin-usu-info-label">Celular</span>
                      <span className="admin-usu-info-value">{vincApPreview.telefono_celular || '—'}</span>
                    </div>
                  </div>
                  <div className="admin-usu-field">
                    <label>Parentesco con el alumno</label>
                    <select
                      value={vincApParentesco}
                      onChange={(e) => setVincApParentesco(Number(e.target.value))}
                    >
                      {[1, 2, 3, 4].map((k) => (
                        <option key={k} value={k}>
                          {PARENTESCO_VINC_LABEL[k]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              <div className="admin-usu-modal-actions">
                <button
                  type="button"
                  className="admin-usu-btn admin-usu-btn-secondary"
                  onClick={() => !vincApGuardando && setModalVincApoderado(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="admin-usu-btn admin-usu-btn-primary"
                  onClick={guardarVinculoApoderado}
                  disabled={vincApGuardando || !vincApPreview}
                >
                  {vincApGuardando ? 'Guardando…' : 'Guardar vínculo'}
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

      {modalMatriculas && createPortal(
        <div className="admin-usu-modal-overlay" onClick={() => setModalMatriculas(null)}>
          <div
            className="admin-usu-modal admin-usu-modal-wide"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-matriculas-titulo"
          >
            <div className="admin-usu-modal-header">
              <h2 id="admin-matriculas-titulo">Historial de matrículas</h2>
              <button type="button" className="admin-usu-modal-close" onClick={() => setModalMatriculas(null)} aria-label="Cerrar">
                ✕
              </button>
            </div>
            <div className="admin-usu-modal-body">
              <div className="admin-usu-matriculas-toolbar">
                <p className="admin-usu-matriculas-nombre">{nombreAlumno(modalMatriculas.alumno)}</p>
                {!vistaRestringidaPsicologa && (
                  <button
                    type="button"
                    className="admin-usu-btn admin-usu-btn-new"
                    disabled={modalMatriculas.loading}
                    onClick={() => {
                      setEditMatriculaModal(null);
                      setNuevaMatriculaModalOpen(true);
                    }}
                  >
                    + Registrar nuevo
                  </button>
                )}
              </div>
              {modalMatriculas.loading ? (
                <p style={{ color: '#6b7280' }}>Cargando…</p>
              ) : (
                <>
                  <div className="admin-usu-table-card">
                  <div className="admin-usu-table-scroll">
                    <table className="admin-usu-table">
                      <thead>
                        <tr>
                          <th>Grupo</th>
                          <th>Fecha</th>
                          <th>Estado</th>
                          <th>Modalidad</th>
                          <th style={{ width: 140 }}>Opciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(modalMatriculas.rows || []).length === 0 ? (
                          <tr>
                            <td colSpan={5} style={{ textAlign: 'center', color: '#6b7280', padding: '1.5rem' }}>
                              No hay matrículas registradas.
                            </td>
                          </tr>
                        ) : (
                          (modalMatriculas.rows || []).map((m) => (
                            <tr key={m.matricula_id}>
                              <td>{m.grupo_texto || '—'}</td>
                              <td>{formatFechaRegistroMatricula(m.fecha_registro)}</td>
                              <td>{m.estado_display || labelMatriculaEstado(m.estado)}</td>
                              <td>{(m.modalidad_texto && String(m.modalidad_texto).trim()) || '—'}</td>
                              <td>
                                <button
                                  type="button"
                                  className="admin-usu-actions-btn"
                                  style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                                  onClick={(e) => abrirMenuMatricula(e, modalMatriculas.alumno, m)}
                                >
                                  Opciones ▾
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      <NuevaMatriculaAlumnoExistenteModal
        open={(nuevaMatriculaModalOpen || !!editMatriculaModal) && !!modalMatriculas?.alumno}
        mode={editMatriculaModal ? 'edit' : 'create'}
        matriculaId={editMatriculaModal?.matriculaId ?? null}
        alumno={editMatriculaModal?.alumno ?? modalMatriculas?.alumno}
        onClose={() => {
          setNuevaMatriculaModalOpen(false);
          setEditMatriculaModal(null);
        }}
        onRegistrado={(alumnoId) => {
          const id = alumnoId ?? editMatriculaModal?.alumno?.id ?? modalMatriculas?.alumno?.id;
          if (id) recargarMatriculasModal(id);
        }}
      />

      {menuMatricula && createPortal(
        <div
          className="admin-usu-dropdown admin-usu-dropdown-portal admin-usu-dropdown-portal--over-modal"
          style={{ top: menuMatricula.top, left: menuMatricula.left }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="admin-usu-dropdown-btn-row"
            onClick={() => {
              verPagosMatricula(menuMatricula.alumno, menuMatricula.mat);
            }}
          >
            <span className="admin-usu-dropdown-icon" aria-hidden>
              💰
            </span>
            <span>Ver pagos</span>
          </button>
          <button
            type="button"
            className="admin-usu-dropdown-btn-row"
            onClick={() => {
              abrirEditarMatricula(menuMatricula.alumno, menuMatricula.mat);
            }}
          >
            <span className="admin-usu-dropdown-icon" aria-hidden>
              ✏️
            </span>
            <span>Editar matrícula</span>
          </button>
          <button
            type="button"
            className="admin-usu-dropdown-btn-row admin-usu-dropdown-danger"
            onClick={() => {
              borrarMatricula(menuMatricula.alumno, menuMatricula.mat);
            }}
          >
            <span className="admin-usu-dropdown-icon" aria-hidden>
              🗑️
            </span>
            <span>Borrar matrícula</span>
          </button>
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
                  <AdminMensajeQuillEditor
                    value={mensajeContenido}
                    onChange={setMensajeContenido}
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
