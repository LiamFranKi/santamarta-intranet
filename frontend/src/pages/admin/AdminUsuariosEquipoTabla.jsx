import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { esPaqueteCoordinador } from '../../utils/coordinadorAcceso';
import api from '../../services/api';
import Swal from 'sweetalert2';
import { jsPDF } from 'jspdf';
import { fotoUsuarioAdmin } from '../../utils/adminUsuariosFoto';
import AdminUsuariosFotoLightbox from '../../components/admin/AdminUsuariosFotoLightbox';
import AdminMensajeQuillEditor from '../../components/admin/AdminMensajeQuillEditor';
import PersonalCvViewer from '../../components/PersonalCvViewer';
import { mensajeHtmlTieneContenido } from '../../utils/mensajesHtml';
import { descargarCurriculumConAviso } from '../../utils/descargarCurriculumPersonal';
import './AdminUsuarios.css';

/**
 * Vista tabla (respaldo). Para usarla: en Dashboard.jsx importar este componente y
 * renderizarlo en lugar de AdminUsuariosEquipo, o añadir ?vista=tabla a la ruta equipo.
 */

function formatearSueldo(v) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return '—';
  return `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function nombreCompletoEquipo(row) {
  const ap = (row.apellidos || '').trim();
  const nom = (row.nombres || '').trim();
  if (ap && nom) return `${ap}, ${nom}`;
  return `${ap} ${nom}`.trim() || '—';
}

function nombreAlumnoDesdeHijo(h) {
  const ap = [h.apellido_paterno, h.apellido_materno].filter(Boolean).join(' ').trim();
  const nom = (h.nombres || '').trim();
  if (ap && nom) return `${ap}, ${nom}`;
  return `${ap} ${nom}`.trim() || '—';
}

function nombreApoderadoDesdeFila(a) {
  const ap = [a.apellido_paterno, a.apellido_materno].filter(Boolean).join(' ').trim();
  const nom = (a.nombres || '').trim();
  if (ap && nom) return `${ap}, ${nom}`;
  return `${ap} ${nom}`.trim() || '—';
}

export default function AdminUsuariosEquipoTabla() {
  const { user } = useAuth();
  const soloLectura = esPaqueteCoordinador(user?.tipo);
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
  const [menuCoords, setMenuCoords] = useState({ top: 0, left: 0 });
  const [menuRow, setMenuRow] = useState(null);
  const [menuAnchorRect, setMenuAnchorRect] = useState(null);
  const menuPortalRef = useRef(null);

  const [modalCreate, setModalCreate] = useState(false);
  const [modalEdit, setModalEdit] = useState(null);
  const [modalInfo, setModalInfo] = useState(null);
  const [modalAcceso, setModalAcceso] = useState(null);
  const [modalHorario, setModalHorario] = useState(null);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [modalMensaje, setModalMensaje] = useState(null);
  const [mensajeAsunto, setMensajeAsunto] = useState('');
  const [mensajeContenido, setMensajeContenido] = useState('');
  const [mensajeAdjuntos, setMensajeAdjuntos] = useState([]);
  const [enviandoMensaje, setEnviandoMensaje] = useState(false);
  const [accesoForm, setAccesoForm] = useState({ tipo: 'DOCENTE', estado: 'ACTIVO', password: '' });
  const [form, setForm] = useState({});
  const [fotoCreateFile, setFotoCreateFile] = useState(null);
  const [fotoCreatePreview, setFotoCreatePreview] = useState('');
  const [fotoEditFile, setFotoEditFile] = useState(null);
  const [fotoEditPreview, setFotoEditPreview] = useState('');
  const [modalVincAlumnoEquipo, setModalVincAlumnoEquipo] = useState(false);
  const [vincEqAlDni, setVincEqAlDni] = useState('');
  const [vincEqAlPreview, setVincEqAlPreview] = useState(null);
  const [vincEqAlBuscando, setVincEqAlBuscando] = useState(false);
  const [vincEqAlGuardando, setVincEqAlGuardando] = useState(false);

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
    setMenuCoords({ top: rect.bottom + 4, left: rect.right - 230 });
    setMenuAnchorRect(rect);
    setMenuRow(row);
    setOpenMenu(row.id);
  };

  useEffect(() => {
    if (!openMenu || !menuAnchorRect || !menuPortalRef.current) return;
    const menuRect = menuPortalRef.current.getBoundingClientRect();
    const menuWidth = menuRect.width || 230;
    const menuHeight = menuRect.height || 220;
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

  const abrirCrear = () => {
    setForm({
      nombres: '',
      apellidos: '',
      nro_documento: '',
      email: '',
      telefono_celular: '',
      cargo: '',
      profesion: '',
      fecha_ingreso: new Date().toISOString().slice(0, 10),
      hora_entrada: '08:00',
      hora_salida: '17:00',
      fecha_nacimiento: '1990-01-01',
      tipo: tipos.includes('DOCENTE') ? 'DOCENTE' : tipos[0] || 'DOCENTE',
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
      await api.post('/admin/usuarios/equipo', fd);
      Swal.fire({ icon: 'success', title: 'Registrado', text: 'Usuario y contraseña: DNI' });
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
      const { data } = await api.get(`/admin/usuarios/equipo/${row.id}`);
      setForm({
        nombres: data.nombres || '',
        apellidos: data.apellidos || '',
        nro_documento: data.nro_documento || '',
        email: data.email || '',
        telefono_celular: data.telefono_celular || '',
        cargo: data.cargo || '',
        profesion: data.profesion || '',
        fecha_ingreso: (data.fecha_ingreso || '').toString().slice(0, 10),
        hora_entrada: (data.hora_entrada || '').toString().slice(0, 5),
        hora_salida: (data.hora_salida || '').toString().slice(0, 5),
        fecha_nacimiento: (data.fecha_nacimiento || '1990-01-01').toString().slice(0, 10),
        foto: data.foto || '',
        tipo: data.usuario_tipo || 'DOCENTE',
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
      await api.put(`/admin/usuarios/equipo/${modalEdit}`, form);
      if (fotoEditFile) {
        const fd = new FormData();
        fd.append('foto', fotoEditFile);
        await api.put(`/admin/usuarios/equipo/${modalEdit}/foto`, fd);
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
      tipo: row.usuario_tipo || (tipos.includes('DOCENTE') ? 'DOCENTE' : tipos[0] || 'DOCENTE'),
      estado: row.usuario_estado || 'ACTIVO',
      password: '',
    });
    setModalAcceso(row);
  };

  const guardarInfoAcceso = async () => {
    if (!modalAcceso) return;
    try {
      if (soloLectura) {
        const pwd = (accesoForm.password || '').trim();
        if (!modalAcceso.usuario_id) {
          Swal.fire({ icon: 'warning', text: 'Este personal no tiene usuario de acceso.' });
          return;
        }
        if (!pwd) {
          Swal.fire({ icon: 'info', text: 'Escriba la nueva contraseña.' });
          return;
        }
        await api.post(`/admin/usuarios/equipo/${modalAcceso.id}/password`, { password: pwd });
        Swal.fire({ icon: 'success', title: 'Clave actualizada' });
        setModalAcceso(null);
        return;
      }
      if (!modalAcceso.usuario_id) {
        await api.post(`/admin/usuarios/equipo/${modalAcceso.id}/acceso`, { tipo: accesoForm.tipo });
      } else {
        await api.put(`/admin/usuarios/equipo/${modalAcceso.id}`, {
          tipo: accesoForm.tipo,
          usuario_estado: accesoForm.estado,
        });
      }
      if ((accesoForm.password || '').trim()) {
        await api.post(`/admin/usuarios/equipo/${modalAcceso.id}/password`, {
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
      const { data } = await api.get(`/admin/usuarios/equipo/${row.id}`);
      setModalInfo(data);
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudo cargar la información' });
    }
  };

  const refrescarInfoEquipoModal = async () => {
    if (!modalInfo?.id) return;
    try {
      const { data } = await api.get(`/admin/usuarios/equipo/${modalInfo.id}`);
      setModalInfo(data);
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudo actualizar la información' });
    }
  };

  const abrirModalVincAlumnoEquipo = () => {
    if (!modalInfo?.apoderado_id_para_familias) {
      Swal.fire({
        icon: 'info',
        title: 'Sin ficha de apoderado',
        text: 'Registre primero a esta persona con el mismo DNI en el menú Apoderados para poder vincular hijos en familias.',
      });
      return;
    }
    setVincEqAlDni('');
    setVincEqAlPreview(null);
    setModalVincAlumnoEquipo(true);
  };

  const buscarAlumnoPorDniEquipo = async () => {
    const dni = String(vincEqAlDni || '').trim();
    if (!dni) {
      Swal.fire({ icon: 'info', title: 'Ingrese el DNI' });
      return;
    }
    setVincEqAlBuscando(true);
    setVincEqAlPreview(null);
    try {
      const { data } = await api.get('/admin/usuarios/alumnos/por-dni', { params: { dni } });
      if (!data.encontrado) {
        Swal.fire({
          icon: 'info',
          title: 'No encontrado',
          text: 'No hay alumno registrado con ese DNI en este colegio.',
        });
        return;
      }
      const ya = (modalInfo.hijos_como_alumnos || []).some((h) => String(h.nro_documento || '').trim() === dni);
      if (ya) {
        Swal.fire({ icon: 'info', title: 'Ya vinculado', text: 'Ese alumno ya figura como hijo vinculado.' });
        return;
      }
      setVincEqAlPreview(data.alumno);
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error al buscar' });
    } finally {
      setVincEqAlBuscando(false);
    }
  };

  const guardarVinculoAlumnoEquipo = async () => {
    if (!modalInfo?.apoderado_id_para_familias || !vincEqAlPreview) return;
    setVincEqAlGuardando(true);
    try {
      await api.post(`/admin/usuarios/apoderados/${modalInfo.apoderado_id_para_familias}/vincular-alumno`, {
        nro_documento: String(vincEqAlPreview.nro_documento || '').trim(),
      });
      Swal.fire({ icon: 'success', title: 'Alumno vinculado' });
      setModalVincAlumnoEquipo(false);
      await refrescarInfoEquipoModal();
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudo guardar el vínculo' });
    } finally {
      setVincEqAlGuardando(false);
    }
  };

  const desvincularHijoEquipo = async (h) => {
    if (!modalInfo?.apoderado_id_para_familias || !h?.alumno_id) return;
    const n = nombreAlumnoDesdeHijo(h);
    const ultimo = (modalInfo.hijos_como_alumnos || []).length <= 1;
    const ok = await Swal.fire({
      icon: 'warning',
      title: '¿Quitar vínculo?',
      html: ultimo
        ? `<p>Se quitará a <strong>${n}</strong> como hijo vinculado. <strong>No quedará ningún alumno</strong> en familias con la ficha de apoderado de este DNI.</p>`
        : `<p>Se quitará el vínculo en familias entre la ficha de apoderado (mismo DNI que este personal) y el alumno <strong>${n}</strong>. No se elimina la ficha del alumno.</p>`,
      showCancelButton: true,
      confirmButtonText: 'Sí, quitar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
    });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(
        `/admin/usuarios/apoderados/${modalInfo.apoderado_id_para_familias}/alumnos/${h.alumno_id}`
      );
      Swal.fire({ icon: 'success', title: 'Vínculo quitado' });
      await refrescarInfoEquipoModal();
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudo quitar el vínculo' });
    }
  };

  const verHorario = async (row) => {
    try {
      const { data } = await api.get(`/admin/usuarios/equipo/${row.id}/horario`);
      setModalHorario({
        ...data,
        row,
      });
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudo cargar el horario' });
    }
  };

  const descargarCv = (row) => {
    if (!row?.id) return;
    descargarCurriculumConAviso(`/admin/usuarios/equipo/${row.id}/cv/export`);
  };

  const abrirModalMensaje = (row) => {
    if (!row.usuario_id) {
      Swal.fire({
        icon: 'info',
        title: 'Sin usuario',
        text: 'Este personal no tiene usuario en el sistema; no se puede enviar mensaje intranet.',
      });
      return;
    }
    setModalMensaje(row);
    setMensajeAsunto('');
    setMensajeContenido('');
    setMensajeAdjuntos([]);
  };

  const cerrarModalMensaje = () => {
    setModalMensaje(null);
    setMensajeAsunto('');
    setMensajeContenido('');
    setMensajeAdjuntos([]);
    setEnviandoMensaje(false);
  };

  const quitarAdjuntoMensaje = (idx) => {
    setMensajeAdjuntos((prev) => prev.filter((_, i) => i !== idx));
  };

  const enviarMensajeDesdeModal = async () => {
    if (!modalMensaje?.usuario_id) return;
    const asunto = String(mensajeAsunto || '').trim();
    if (!asunto) {
      Swal.fire({ icon: 'error', title: 'Asunto requerido', text: 'Ingrese el asunto del mensaje.' });
      return;
    }
    if (!mensajeHtmlTieneContenido(mensajeContenido)) {
      Swal.fire({ icon: 'error', title: 'Mensaje requerido', text: 'Ingrese el contenido del mensaje.' });
      return;
    }
    try {
      setEnviandoMensaje(true);
      const fd = new FormData();
      fd.append('destinatarios', JSON.stringify([Number(modalMensaje.usuario_id)]));
      fd.append('grupos', JSON.stringify([]));
      fd.append('asunto', asunto);
      fd.append('mensaje', String(mensajeContenido || ''));
      mensajeAdjuntos.forEach((file) => fd.append('archivos', file));
      await api.post('/docente/mensajes/enviar', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      Swal.fire({ icon: 'success', title: 'Mensaje enviado', text: 'El mensaje se envió correctamente al personal.' });
      cerrarModalMensaje();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudo enviar el mensaje' });
    } finally {
      setEnviandoMensaje(false);
    }
  };

  const eliminarPersonal = async (row) => {
    const ok = await Swal.fire({
      icon: 'warning',
      title: '¿Eliminar personal?',
      html: `Se eliminará a <strong>${nombreCompletoEquipo(row)}</strong>.<br/>Esta acción no se puede deshacer.`,
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#d33',
    });
    if (!ok.isConfirmed) return;
    try {
      await api.delete(`/admin/usuarios/equipo/${row.id}`);
      Swal.fire({ icon: 'success', title: 'Eliminado correctamente' });
      cargar();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'No se pudo eliminar', text: e.response?.data?.error || 'Error inesperado' });
    }
  };

  const diasSemana = [
    { id: 1, nombre: 'Lunes', abrev: 'LUNES' },
    { id: 2, nombre: 'Martes', abrev: 'MARTES' },
    { id: 3, nombre: 'Miércoles', abrev: 'MIÉRCOLES' },
    { id: 4, nombre: 'Jueves', abrev: 'JUEVES' },
    { id: 5, nombre: 'Viernes', abrev: 'VIERNES' },
  ];

  const formatearHora = (hora) => {
    if (!hora) return '';
    const h = String(hora).trim();
    const hUpper = h.toUpperCase();
    if (hUpper.includes('AM') || hUpper.includes('PM')) return h;
    const partes = h.split(':');
    if (partes.length < 2) return h;
    const hh = parseInt(partes[0], 10);
    const mm = (partes[1] || '00').split(' ')[0].padStart(2, '0');
    if (Number.isNaN(hh)) return h;
    if (hh === 0) return `12:${mm} AM`;
    if (hh < 12) return `${hh}:${mm} AM`;
    if (hh === 12) return `12:${mm} PM`;
    return `${hh - 12}:${mm} PM`;
  };

  const horaAMinutos = (hora) => {
    if (!hora) return 0;
    const val = String(hora).trim().toUpperCase();
    if (val.includes('AM') || val.includes('PM')) {
      const [hStr, rest = '0'] = val.split(':');
      let hh = parseInt(hStr, 10);
      const mm = parseInt(rest.replace(/[^0-9]/g, '') || '0', 10);
      if (val.includes('PM') && hh !== 12) hh += 12;
      if (val.includes('AM') && hh === 12) hh = 0;
      return (Number.isNaN(hh) ? 0 : hh) * 60 + (Number.isNaN(mm) ? 0 : mm);
    }
    const [hStr, mStr = '0'] = val.split(':');
    const hh = parseInt(hStr, 10);
    const mm = parseInt((mStr || '0').split(' ')[0], 10);
    return (Number.isNaN(hh) ? 0 : hh) * 60 + (Number.isNaN(mm) ? 0 : mm);
  };

  const palette = ['#FFF9C4', '#BBDEFB', '#F3E5F5', '#C8E6C9', '#E0F7FA', '#FFF3E0', '#FCE4EC', '#E1F5FE', '#F1F8E9', '#FFEBEE', '#E8EAF6', '#E0F2F1', '#E1BEE7', '#FFE0B2', '#FFCCBC', '#D1C4E9'];
  const hashString = (str) => {
    let hash = 0;
    const normalized = String(str || '').trim().toLowerCase();
    for (let i = 0; i < normalized.length; i += 1) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return Math.abs(hash);
  };
  const getColorForCourse = (titulo) => {
    if (!titulo) return null;
    return palette[hashString(titulo) % palette.length];
  };
  const aclararColor = (hex, factor = 0.5) => {
    if (!hex) return '#ffffff';
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const nr = Math.round(r + (255 - r) * factor);
    const ng = Math.round(g + (255 - g) * factor);
    const nb = Math.round(b + (255 - b) * factor);
    return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`;
  };
  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const initialsPreview = (form.nombres || form.apellidos || 'U').trim().charAt(0).toUpperCase();
  const fotoCreateFormPreview = fotoCreatePreview;
  const fotoFormPreview = fotoEditPreview || fotoUsuarioAdmin(form.foto);
  const credencialDni = (form.nro_documento || '').trim();
  const infoFoto = fotoUsuarioAdmin(modalInfo?.foto || '');
  const horarioNormalizado = useMemo(() => {
    const raw = modalHorario?.horario || [];
    const dias = raw
      .map((c) => (typeof c.dia === 'number' ? c.dia : parseInt(c.dia || 0, 10)))
      .filter((d) => !Number.isNaN(d));
    const minDia = dias.length ? Math.min(...dias) : 1;
    const maxDia = dias.length ? Math.max(...dias) : 5;
    const usaCeroCuatro = minDia === 0 && maxDia <= 4;
    return raw.map((c) => {
      const diaVal = typeof c.dia === 'number' ? c.dia : parseInt(c.dia || 0, 10);
      return { ...c, diaNormalizado: usaCeroCuatro ? diaVal + 1 : diaVal };
    });
  }, [modalHorario]);

  const horariosUnicos = useMemo(() => {
    const bloques = horarioNormalizado
      .map((c) => ({ inicio: c.inicio || '', fin: c.fin || '' }))
      .filter((b) => b.inicio && b.fin);
    const map = {};
    bloques.forEach((b) => {
      const key = `${b.inicio}-${b.fin}`;
      if (!map[key]) map[key] = b;
    });
    return Object.values(map).sort((a, b) => horaAMinutos(a.inicio) - horaAMinutos(b.inicio));
  }, [horarioNormalizado]);

  const obtenerClase = (dia, horaInicio, horaFin) =>
    horarioNormalizado.find((c) => c.diaNormalizado === dia && (c.inicio || '') === horaInicio && (c.fin || '') === horaFin);

  const formatearClase = (clase) => {
    if (!clase) return '';
    const titulo = clase.titulo || '';
    const grupo = clase.grupo || '';
    if (!titulo) return grupo;
    if (!grupo) return titulo;
    return `${titulo} - ${grupo}`;
  };

  const exportarHorarioPDF = () => {
    if (!horariosUnicos.length) {
      Swal.fire({ icon: 'info', title: 'Sin datos', text: 'No hay horario para exportar' });
      return;
    }
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 15;
      const contentW = pageW - margin * 2;
      let y = margin;
      const colW = contentW / 6;
      const rowH = 15;
      const headerH = 12;
      const colorHeader = [59, 130, 246];

      doc.setFillColor(...colorHeader);
      doc.rect(margin, y, contentW, 24, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text('MI HORARIO DE CLASES', margin + contentW / 2, y + 14, { align: 'center' });
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text(nombreCompletoEquipo(modalHorario?.docente || modalHorario?.row || {}), margin + contentW / 2, y + 20, { align: 'center' });
      y += 30;

      const dibujarHeader = () => {
        doc.setFillColor(...colorHeader);
        doc.rect(margin, y, colW, headerH, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('HORA', margin + colW / 2, y + 8, { align: 'center' });
        diasSemana.forEach((d, idx) => {
          const x = margin + colW + idx * colW;
          doc.setFillColor(...colorHeader);
          doc.rect(x, y, colW, headerH, 'F');
          doc.text(d.abrev, x + colW / 2, y + 8, { align: 'center' });
        });
        y += headerH;
      };

      dibujarHeader();

      horariosUnicos.forEach((b) => {
        const clases = [1, 2, 3, 4, 5].map((dia) => obtenerClase(dia, b.inicio, b.fin));
        if (!clases.some(Boolean)) return;
        if (y + rowH > pageH - margin) {
          doc.addPage();
          y = margin;
          dibujarHeader();
        }
        doc.setTextColor(30, 41, 59);
        doc.setFontSize(9);
        doc.rect(margin, y, colW, rowH);
        doc.text(`${formatearHora(b.inicio)} - ${formatearHora(b.fin)}`, margin + colW / 2, y + 9, { align: 'center', maxWidth: colW - 4 });
        clases.forEach((clase, idx) => {
          const x = margin + colW + idx * colW;
          doc.rect(x, y, colW, rowH);
          if (clase) {
            const rgb = hexToRgb(getColorForCourse(clase.titulo || ''));
            if (rgb) {
              doc.setFillColor(rgb.r, rgb.g, rgb.b);
              doc.rect(x + 0.4, y + 0.4, colW - 0.8, rowH - 0.8, 'F');
            }
            const txt = doc.splitTextToSize(formatearClase(clase), colW - 4);
            doc.setTextColor(30, 41, 59);
            doc.text(txt, x + colW / 2, y + 8, { align: 'center', maxWidth: colW - 4 });
          }
        });
        y += rowH;
      });

      doc.save(`Horario_${(modalHorario?.docente?.apellidos || 'Docente').replace(/\s+/g, '_')}.pdf`);
      Swal.fire({ icon: 'success', title: 'Exportado', text: 'Horario exportado correctamente' });
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo exportar el horario' });
    }
  };

  return (
    <div className="admin-usu-wrap" onClick={cerrarMenus}>
      <div className="admin-usu-header">
        <div className="admin-usu-header-icon" aria-hidden="true">
          👥
        </div>
        <div className="admin-usu-header-text">
          <h1>Personal</h1>
          <p>
            Docentes, administración y demás perfiles del colegio. El acceso se diferencia por el tipo de usuario;
            usuario y contraseña inicial son el DNI.
          </p>
        </div>
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
            const next = new URLSearchParams(searchParams);
            if (v) next.set('perfil', v);
            else next.delete('perfil');
            setSearchParams(next);
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
        {!soloLectura && (
        <button type="button" className="admin-usu-btn admin-usu-btn-new" onClick={abrirCrear}>
          + Registrar nuevo
        </button>
        )}
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
                        <button
                          type="button"
                          className="admin-usu-avatar-btn"
                          onClick={() => setLightboxUrl(url)}
                          title="Ver foto"
                        >
                          <img className="admin-usu-avatar" src={url} alt="" />
                        </button>
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
          ref={menuPortalRef}
          className="admin-usu-dropdown admin-usu-dropdown-portal"
          style={{ top: menuCoords.top, left: Math.max(12, menuCoords.left) }}
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" onClick={() => { verInfo(menuRow); cerrarMenus(); }}>
            ℹ️ Ver información
          </button>
          <button type="button" onClick={() => { abrirInfoAcceso(menuRow); cerrarMenus(); }}>
            🔐 Información de acceso
          </button>
          <button type="button" onClick={() => { verHorario(menuRow); cerrarMenus(); }}>
            🗓️ Ver horario
          </button>
          <button type="button" onClick={() => { descargarCv(menuRow); cerrarMenus(); }}>
            📄 Descargar CV
          </button>
          <button type="button" onClick={() => { abrirModalMensaje(menuRow); cerrarMenus(); }}>
            ✉️ Enviar mensaje
          </button>
          {!soloLectura && (
          <>
          <hr />
          <button type="button" onClick={() => { abrirEditar(menuRow); cerrarMenus(); }}>
            ✏️ Editar
          </button>
          <button type="button" className="admin-usu-dropdown-danger" onClick={() => { eliminarPersonal(menuRow); cerrarMenus(); }}>
            🗑️ Eliminar
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
              <div className="admin-usu-profile-form">
                <div className="admin-usu-profile-section">
                  <h3>Foto de Perfil</h3>
                  <div className="admin-usu-photo-wrap">
                    <div className="admin-usu-photo-preview">
                      {fotoCreateFormPreview ? (
                        <img src={fotoCreateFormPreview} alt="Foto personal" />
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
                    {['nombres', 'apellidos', 'nro_documento', 'email', 'telefono_celular', 'cargo', 'profesion'].map((k) => (
                      <div key={k} className="admin-usu-field">
                        <label>{k === 'nro_documento' ? 'DNI *' : `${k.replace(/_/g, ' ')} *`}</label>
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
                      <label>Fecha de ingreso</label>
                      <input
                        type="date"
                        value={form.fecha_ingreso || ''}
                        onChange={(e) => setForm({ ...form, fecha_ingreso: e.target.value })}
                      />
                    </div>
                    <div className="admin-usu-field">
                      <label>Hora de entrada</label>
                      <input
                        type="time"
                        value={form.hora_entrada || ''}
                        onChange={(e) => setForm({ ...form, hora_entrada: e.target.value })}
                      />
                    </div>
                    <div className="admin-usu-field">
                      <label>Hora de salida</label>
                      <input
                        type="time"
                        value={form.hora_salida || ''}
                        onChange={(e) => setForm({ ...form, hora_salida: e.target.value })}
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
              <h2>Editar personal</h2>
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
                        <img src={fotoFormPreview} alt="Foto personal" />
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
                    {['nombres', 'apellidos', 'nro_documento', 'email', 'telefono_celular', 'cargo', 'profesion'].map((k) => (
                      <div key={k} className="admin-usu-field">
                        <label>{k === 'nro_documento' ? 'DNI *' : `${k.replace(/_/g, ' ')} *`}</label>
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
                      <label>Fecha de ingreso</label>
                      <input
                        type="date"
                        value={form.fecha_ingreso || ''}
                        onChange={(e) => setForm({ ...form, fecha_ingreso: e.target.value })}
                      />
                    </div>
                    <div className="admin-usu-field">
                      <label>Hora de entrada</label>
                      <input
                        type="time"
                        value={form.hora_entrada || ''}
                        onChange={(e) => setForm({ ...form, hora_entrada: e.target.value })}
                      />
                    </div>
                    <div className="admin-usu-field">
                      <label>Hora de salida</label>
                      <input
                        type="time"
                        value={form.hora_salida || ''}
                        onChange={(e) => setForm({ ...form, hora_salida: e.target.value })}
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
              <h2>Información del personal</h2>
              <button type="button" className="admin-usu-modal-close" onClick={() => setModalInfo(null)}>✕</button>
            </div>
            <div className="admin-usu-modal-body">
              <div className="admin-usu-profile-form">
                <div className="admin-usu-profile-section">
                  <h3>Ficha General</h3>
                  <div className="admin-usu-info-hero">
                    <div className="admin-usu-photo-preview">
                      {infoFoto ? <img src={infoFoto} alt="Foto personal" /> : <div className="admin-usu-photo-ph">{(modalInfo.nombres || 'U').charAt(0)}</div>}
                    </div>
                    <div>
                      <h4>{nombreCompletoEquipo(modalInfo)}</h4>
                      <p>{modalInfo.cargo || 'Sin cargo registrado'}</p>
                      <span className={`admin-usu-badge ${modalInfo.usuario_id ? '' : 'admin-usu-badge-muted'}`}>
                        {modalInfo.usuario_tipo || 'Sin acceso'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="admin-usu-profile-section">
                  <h3>Datos Personales</h3>
                  <div className="admin-usu-info-grid">
                    <div className="admin-usu-info-item"><span className="admin-usu-info-label">Nombres</span><span className="admin-usu-info-value">{modalInfo.nombres || '—'}</span></div>
                    <div className="admin-usu-info-item"><span className="admin-usu-info-label">Apellidos</span><span className="admin-usu-info-value">{modalInfo.apellidos || '—'}</span></div>
                    <div className="admin-usu-info-item"><span className="admin-usu-info-label">DNI</span><span className="admin-usu-info-value">{modalInfo.nro_documento || '—'}</span></div>
                    <div className="admin-usu-info-item"><span className="admin-usu-info-label">Fecha de nacimiento</span><span className="admin-usu-info-value">{(modalInfo.fecha_nacimiento || '').toString().slice(0, 10) || '—'}</span></div>
                    <div className="admin-usu-info-item"><span className="admin-usu-info-label">Correo</span><span className="admin-usu-info-value">{modalInfo.email || '—'}</span></div>
                    <div className="admin-usu-info-item"><span className="admin-usu-info-label">Celular</span><span className="admin-usu-info-value">{modalInfo.telefono_celular || '—'}</span></div>
                    <div className="admin-usu-info-item"><span className="admin-usu-info-label">Cargo</span><span className="admin-usu-info-value">{modalInfo.cargo || '—'}</span></div>
                    <div className="admin-usu-info-item"><span className="admin-usu-info-label">Profesión</span><span className="admin-usu-info-value">{modalInfo.profesion || '—'}</span></div>
                    <div className="admin-usu-info-item"><span className="admin-usu-info-label">Sueldo</span><span className="admin-usu-info-value">{formatearSueldo(modalInfo.sueldo)}</span></div>
                    <div className="admin-usu-info-item"><span className="admin-usu-info-label">Hora de entrada</span><span className="admin-usu-info-value">{(modalInfo.hora_entrada || '').toString().slice(0, 5) || '—'}</span></div>
                    <div className="admin-usu-info-item"><span className="admin-usu-info-label">Hora de salida</span><span className="admin-usu-info-value">{(modalInfo.hora_salida || '').toString().slice(0, 5) || '—'}</span></div>
                  </div>
                </div>
                <div className="admin-usu-profile-section">
                  <h3>Formación y CV</h3>
                  {modalInfo?.id ? (
                    <PersonalCvViewer
                      apiBase={`/admin/usuarios/equipo/${modalInfo.id}/cv`}
                      exportUrl={`/admin/usuarios/equipo/${modalInfo.id}/cv/export`}
                    />
                  ) : null}
                </div>
                <div className="admin-usu-profile-section">
                  <h3>Asignación académica</h3>
                  {(modalInfo.grupos_cargo || []).length > 0 && (
                    <div className="admin-usu-info-item">
                      <span className="admin-usu-info-label">Grupos a cargo</span>
                      <div className="admin-usu-chip-list">
                        {(modalInfo.grupos_cargo || []).map((g) => (
                          <span key={g} className="admin-usu-chip">{g}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {(modalInfo.cursos_ensena || []).length > 0 && (
                    <div className="admin-usu-info-item" style={{ marginTop: '0.6rem' }}>
                      <span className="admin-usu-info-label">Cursos que enseña</span>
                      <div className="admin-usu-chip-list">
                        {(modalInfo.cursos_ensena || []).map((c) => (
                          <span key={c} className="admin-usu-chip">{c}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {modalInfo.tutoria && (
                    <div className="admin-usu-info-item" style={{ marginTop: '0.6rem' }}>
                      <span className="admin-usu-info-label">Tutoría</span>
                      <span className="admin-usu-info-value">{modalInfo.tutoria}</span>
                    </div>
                  )}
                  {!(modalInfo.grupos_cargo || []).length && !(modalInfo.cursos_ensena || []).length && !modalInfo.tutoria && (
                    <span className="admin-usu-info-value">Sin asignaciones académicas en el año activo</span>
                  )}
                </div>

                <div className="admin-usu-profile-section">
                  <div className="admin-usu-section-head">
                    <h3>Hijos en el colegio</h3>
                    {!soloLectura && (
                    <button
                      type="button"
                      className="admin-usu-btn admin-usu-btn-secondary admin-usu-btn-compact"
                      onClick={(e) => {
                        e.stopPropagation();
                        abrirModalVincAlumnoEquipo();
                      }}
                    >
                      + Vincular alumno
                    </button>
                    )}
                  </div>
                  <p className="admin-usu-hint" style={{ marginTop: 0, marginBottom: '0.75rem' }}>
                    Misma lógica que en Apoderados: ficha de apoderado con el DNI de este personal en familias.
                    {!modalInfo.apoderado_id_para_familias && ' Aún no hay ficha de apoderado con ese DNI: créela en el menú Apoderados para habilitar vínculos.'}
                  </p>
                  {(modalInfo.hijos_como_alumnos || []).length === 0 ? (
                    <span className="admin-usu-info-value">Sin alumnos vinculados en familias</span>
                  ) : (
                    <div className="admin-usu-familia-lista">
                      {(modalInfo.hijos_como_alumnos || []).map((h) => (
                        <div key={h.alumno_id} className="admin-usu-familia-card">
                          <div className="admin-usu-familia-card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span>{nombreAlumnoDesdeHijo(h)}</span>
                            {!soloLectura && modalInfo.apoderado_id_para_familias ? (
                              <button
                                type="button"
                                className="admin-usu-btn admin-usu-btn-danger admin-usu-btn-compact"
                                onClick={() => desvincularHijoEquipo(h)}
                              >
                                Quitar vínculo
                              </button>
                            ) : null}
                          </div>
                          <div className="admin-usu-info-grid admin-usu-info-grid--compact">
                            <div className="admin-usu-info-item">
                              <span className="admin-usu-info-label">DNI</span>
                              <span className="admin-usu-info-value">{h.nro_documento || '—'}</span>
                            </div>
                            <div className="admin-usu-info-item">
                              <span className="admin-usu-info-label">Grupo / año</span>
                              <span className="admin-usu-info-value">{h.grupo_texto || '—'}</span>
                            </div>
                            <div className="admin-usu-info-item">
                              <span className="admin-usu-info-label">Matrícula</span>
                              <span className="admin-usu-info-value">
                                {h.matricula_vigente ? (
                                  <span className="admin-usu-chip admin-usu-chip--ok">Vigente</span>
                                ) : (
                                  <span className="admin-usu-chip admin-usu-chip--muted">No vigente / sin datos</span>
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {(modalInfo.otros_apoderados_hijos || []).length > 0 && (
                  <div className="admin-usu-profile-section">
                    <h3>Cónyuge u otros apoderados de los mismos hijos</h3>
                    <p className="admin-usu-hint" style={{ marginTop: 0, marginBottom: '0.75rem' }}>
                      Personas registradas como apoderado en familias de esos alumnos, distintas del DNI de este personal (por ejemplo cónyuge).
                    </p>
                    <div className="admin-usu-familia-lista">
                      {(modalInfo.otros_apoderados_hijos || []).map((ap) => (
                        <div key={ap.id} className="admin-usu-familia-card">
                          <div className="admin-usu-familia-card-title">{nombreApoderadoDesdeFila(ap)}</div>
                          <div className="admin-usu-info-grid admin-usu-info-grid--compact">
                            <div className="admin-usu-info-item">
                              <span className="admin-usu-info-label">DNI</span>
                              <span className="admin-usu-info-value">{ap.nro_documento || '—'}</span>
                            </div>
                            <div className="admin-usu-info-item">
                              <span className="admin-usu-info-label">Parentesco</span>
                              <span className="admin-usu-info-value">{ap.parentesco || '—'}</span>
                            </div>
                            <div className="admin-usu-info-item">
                              <span className="admin-usu-info-label">Correo</span>
                              <span className="admin-usu-info-value">{ap.email || '—'}</span>
                            </div>
                            <div className="admin-usu-info-item">
                              <span className="admin-usu-info-label">Celular</span>
                              <span className="admin-usu-info-value">{ap.telefono_celular || '—'}</span>
                            </div>
                            <div className="admin-usu-info-item">
                              <span className="admin-usu-info-label">Acceso app</span>
                              <span className="admin-usu-info-value">
                                {ap.usuario_id ? (
                                  <span className="admin-usu-chip admin-usu-chip--ok">Sí</span>
                                ) : (
                                  <span className="admin-usu-chip admin-usu-chip--muted">No</span>
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="admin-usu-modal-actions">
                <button type="button" className="admin-usu-btn admin-usu-btn-secondary" onClick={() => setModalInfo(null)}>Cerrar</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {modalVincAlumnoEquipo && createPortal(
        <div
          className="admin-usu-modal-overlay"
          onClick={() => {
            if (!vincEqAlGuardando) setModalVincAlumnoEquipo(false);
          }}
        >
          <div className="admin-usu-modal admin-usu-modal--sub" onClick={(e) => e.stopPropagation()}>
            <div className="admin-usu-modal-header">
              <h2>Vincular alumno (familias)</h2>
              <button
                type="button"
                className="admin-usu-modal-close"
                onClick={() => !vincEqAlGuardando && setModalVincAlumnoEquipo(false)}
              >
                ✕
              </button>
            </div>
            <div className="admin-usu-modal-body">
              <p className="admin-usu-hint">Ingrese el DNI de un alumno ya registrado en el colegio.</p>
              <div className="admin-usu-field">
                <label>DNI</label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={vincEqAlDni}
                    onChange={(e) => setVincEqAlDni(e.target.value)}
                    placeholder="Número de documento"
                    style={{ flex: 1, minWidth: 140 }}
                  />
                  <button
                    type="button"
                    className="admin-usu-btn admin-usu-btn-search"
                    onClick={buscarAlumnoPorDniEquipo}
                    disabled={vincEqAlBuscando}
                  >
                    {vincEqAlBuscando ? 'Buscando…' : 'Buscar'}
                  </button>
                </div>
              </div>
              {vincEqAlPreview && (
                <div className="admin-usu-profile-section" style={{ marginTop: '1rem' }}>
                  <div className="admin-usu-info-grid">
                    <div className="admin-usu-info-item">
                      <span className="admin-usu-info-label">Nombre</span>
                      <span className="admin-usu-info-value">
                        {[vincEqAlPreview.apellido_paterno, vincEqAlPreview.apellido_materno, vincEqAlPreview.nombres].filter(Boolean).join(' ') || '—'}
                      </span>
                    </div>
                    <div className="admin-usu-info-item">
                      <span className="admin-usu-info-label">DNI</span>
                      <span className="admin-usu-info-value">{vincEqAlPreview.nro_documento || '—'}</span>
                    </div>
                  </div>
                </div>
              )}
              <div className="admin-usu-modal-actions">
                <button
                  type="button"
                  className="admin-usu-btn admin-usu-btn-secondary"
                  onClick={() => !vincEqAlGuardando && setModalVincAlumnoEquipo(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="admin-usu-btn admin-usu-btn-primary"
                  onClick={guardarVinculoAlumnoEquipo}
                  disabled={vincEqAlGuardando || !vincEqAlPreview}
                >
                  {vincEqAlGuardando ? 'Guardando…' : 'Guardar vínculo'}
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
              <button type="button" className="admin-usu-modal-close" onClick={() => setModalAcceso(null)}>✕</button>
            </div>
            <div className="admin-usu-modal-body">
              <div className="admin-usu-profile-section">
                <h3>Credenciales y permisos</h3>
                <div className="admin-usu-form-grid">
                  <div className="admin-usu-field">
                    <label>Usuario</label>
                    <input type="text" value={modalAcceso.login_usuario || modalAcceso.nro_documento || ''} readOnly />
                  </div>
                  <div className="admin-usu-field">
                    <label>Nueva contraseña</label>
                    <input
                      type="text"
                      placeholder={soloLectura ? 'Escriba la nueva clave' : 'Opcional: dejar vacío para no cambiar'}
                      value={accesoForm.password}
                      onChange={(e) => setAccesoForm({ ...accesoForm, password: e.target.value })}
                    />
                  </div>
                  <div className="admin-usu-field">
                    <label>Tipo</label>
                    <select value={accesoForm.tipo} disabled={soloLectura} onChange={(e) => setAccesoForm({ ...accesoForm, tipo: e.target.value })}>
                      {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="admin-usu-field">
                    <label>Estado</label>
                    <select
                      value={accesoForm.estado}
                      disabled={soloLectura || !modalAcceso.usuario_id}
                      onChange={(e) => setAccesoForm({ ...accesoForm, estado: e.target.value })}
                    >
                      <option value="ACTIVO">ACTIVO</option>
                      <option value="INACTIVO">INACTIVO</option>
                    </select>
                  </div>
                </div>
                {!soloLectura && !modalAcceso.usuario_id && (
                  <p className="admin-usu-hint">Este personal aún no tiene usuario. Al guardar se creará su acceso con usuario = DNI.</p>
                )}
              </div>
              <div className="admin-usu-modal-actions">
                <button type="button" className="admin-usu-btn admin-usu-btn-secondary" onClick={() => setModalAcceso(null)}>Cancelar</button>
                <button type="button" className="admin-usu-btn admin-usu-btn-primary" onClick={guardarInfoAcceso}>
                  {soloLectura ? 'Guardar clave' : 'Guardar datos'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {modalHorario && createPortal(
        <div className="admin-usu-modal-overlay" onClick={() => setModalHorario(null)}>
          <div className="admin-usu-modal admin-usu-modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="admin-usu-modal-header">
              <h2>Horario del docente</h2>
              <button type="button" className="admin-usu-modal-close" onClick={() => setModalHorario(null)}>✕</button>
            </div>
            <div className="admin-usu-modal-body">
              <div className="admin-usu-profile-section">
                <div className="admin-usu-horario-head">
                  <div>
                    <h3>📅 Mi Horario</h3>
                    <p>{nombreCompletoEquipo(modalHorario.docente || modalHorario.row || {})} - Año {modalHorario.anio || '—'}</p>
                  </div>
                  {horariosUnicos.length > 0 && (
                    <button type="button" className="admin-usu-btn admin-usu-btn-new" onClick={exportarHorarioPDF}>
                      📄 Exportar
                    </button>
                  )}
                </div>
                {horariosUnicos.length === 0 ? (
                  <p className="admin-usu-hint">No hay horarios registrados para este personal.</p>
                ) : (
                  <div className="admin-usu-horario-wrap">
                    <table className="admin-usu-horario-table">
                      <thead>
                        <tr>
                          <th className="admin-usu-hora-col">Hora</th>
                          {diasSemana.map((dia) => (
                            <th key={dia.id}>{dia.abrev}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {horariosUnicos.map((bloque, idx) => {
                          const clases = [1, 2, 3, 4, 5].map((dia) => obtenerClase(dia, bloque.inicio, bloque.fin));
                          if (!clases.some(Boolean)) return null;
                          return (
                            <tr key={`${bloque.inicio}-${bloque.fin}-${idx}`}>
                              <td className="admin-usu-hora-cell">{formatearHora(bloque.inicio)} - {formatearHora(bloque.fin)}</td>
                              {clases.map((clase, i) => (
                                <td
                                  key={`${idx}-${i}`}
                                  className={`admin-usu-horario-cell ${!clase ? 'admin-usu-horario-empty' : ''}`}
                                  style={clase ? { backgroundColor: aclararColor(getColorForCourse(clase.titulo), 0.5) } : {}}
                                >
                                  {formatearClase(clase)}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="admin-usu-modal-actions">
                <button type="button" className="admin-usu-btn admin-usu-btn-secondary" onClick={() => setModalHorario(null)}>Cerrar</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      <AdminUsuariosFotoLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />

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
                <h3>{nombreCompletoEquipo(modalMensaje)}</h3>
                <p className="admin-usu-hint">Mensaje intranet al usuario de personal (mismo envío que en Alumnos / Apoderados).</p>
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
                        <button type="button" onClick={() => quitarAdjuntoMensaje(idx)}>
                          ✕
                        </button>
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
    </div>
  );
}
