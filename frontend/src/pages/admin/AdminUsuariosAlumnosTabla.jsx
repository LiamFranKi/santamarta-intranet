import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import api from '../../services/api';
import Swal from 'sweetalert2';
import { fotoUsuarioAdmin } from '../../utils/adminUsuariosFoto';
import AdminUsuariosFotoLightbox from '../../components/admin/AdminUsuariosFotoLightbox';
import AdminMensajeQuillEditor from '../../components/admin/AdminMensajeQuillEditor';
import { mensajeHtmlTieneContenido } from '../../utils/mensajesHtml';
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

const PARENTESCO_VINC_LABEL = {
  1: 'Padre',
  2: 'Madre',
  3: 'Tutor',
  4: 'Apoderado',
};

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
  const [modalVincApoderado, setModalVincApoderado] = useState(false);
  const [vincApDni, setVincApDni] = useState('');
  const [vincApPreview, setVincApPreview] = useState(null);
  const [vincApParentesco, setVincApParentesco] = useState(1);
  const [vincApBuscando, setVincApBuscando] = useState(false);
  const [vincApGuardando, setVincApGuardando] = useState(false);
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
      const matriculas = data.data || [];
      if (!matriculas.length) {
        Swal.fire({ title: 'Historial de pagos', text: 'No hay pagos registrados.', icon: 'info' });
        return;
      }

      const esc = (v) => String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

      const fmtMonto = (n) => {
        const x = parseFloat(n);
        return Number.isFinite(x) ? `S/ ${x.toFixed(2)}` : '—';
      };

      const fmtFecha = (val, withTime = false) => {
        if (!val) return '—';
        const d = new Date(val);
        if (Number.isNaN(d.getTime())) return '—';
        return withTime
          ? d.toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })
          : d.toLocaleDateString('es-PE', { dateStyle: 'short' });
      };

      const tabsHtml = matriculas.map((m, i) => {
        const label = m.grupo_texto || `${m.anio || '—'} · ${m.grado || '—'}° ${m.seccion || ''}`;
        return `<button type="button" class="admin-pagos-tab-btn ${i === 0 ? 'active' : ''}" data-target="tab-${m.matricula_id}" style="
          border:1px solid #d1d5db;
          background:${i === 0 ? '#2563eb' : '#f3f4f6'};
          color:${i === 0 ? '#fff' : '#1f2937'};
          border-radius:8px;
          padding:8px 12px;
          font-size:12px;
          font-weight:600;
          cursor:pointer;
          white-space:nowrap;
        ">${esc(label)}</button>`;
      }).join('');

      const panelsHtml = matriculas.map((m, i) => {
        const pagos = Array.isArray(m.pagos) ? m.pagos : [];
        const filas = pagos.map((p) => {
          const nroOperacion = [p.nro_movimiento_banco, p.nro_movimiento_importado].filter(Boolean).join(' | ') || '—';
          const serieNumero = p.boleta?.serie_numero || '—';
          const moraFila = parseFloat(p.mora || 0);
          return `<tr>
            <td style="padding:8px;border-bottom:1px solid #eef2f7;white-space:nowrap;text-align:center;vertical-align:middle">${esc(p.tipo_descripcion || labelTipoPago(p.tipo || ''))}</td>
            <td style="padding:8px;border-bottom:1px solid #eef2f7;white-space:nowrap;text-align:center;vertical-align:middle">
              <div>${esc(fmtMonto(p.monto))}</div>
              ${moraFila > 0 ? `<div style="font-size:12px;color:#6d28d9;font-weight:600">Mora: ${esc(fmtMonto(moraFila))}</div>` : ''}
            </td>
            <td style="padding:8px;border-bottom:1px solid #eef2f7;white-space:nowrap;text-align:center;vertical-align:middle">${esc(fmtFecha(p.fecha_hora, true))}</td>
            <td style="padding:8px;border-bottom:1px solid #eef2f7;white-space:nowrap;text-align:center;vertical-align:middle">${esc(nroOperacion)}</td>
            <td style="padding:8px;border-bottom:1px solid #eef2f7;white-space:nowrap;text-align:center;vertical-align:middle">${esc(serieNumero)}</td>
            <td style="padding:8px;border-bottom:1px solid #eef2f7;white-space:nowrap;text-align:center;vertical-align:middle">${esc(fmtFecha(p.boleta?.fecha_impresion))}</td>
            <td style="padding:8px;border-bottom:1px solid #eef2f7;white-space:nowrap;text-align:center;vertical-align:middle">${esc(fmtFecha(p.fecha_cancelado))}</td>
          </tr>`;
        }).join('');

        return `<section id="tab-${m.matricula_id}" class="admin-pagos-panel" style="display:${i === 0 ? 'block' : 'none'};margin-top:12px">
          <div style="background:#e0f2fe;border:1px solid #7dd3fc;color:#0c4a6e;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:600;margin-bottom:10px">
            La información es referencial y corresponde al historial registrado para esta matrícula.
          </div>
          <div style="
            display:grid;
            grid-template-columns:repeat(3,minmax(170px,1fr));
            gap:10px;
            margin-bottom:12px;
          ">
            <div style="border:1px solid #e5e7eb;background:#f9fafb;border-radius:8px;padding:10px;text-align:center">
              <div style="font-size:11px;color:#6b7280">Monto a pagar</div>
              <div style="font-size:16px;font-weight:700;color:#111827">${esc(fmtMonto(m.total_pagar))}</div>
            </div>
            <div style="border:1px solid #e5e7eb;background:#ecfdf5;border-radius:8px;padding:10px;text-align:center">
              <div style="font-size:11px;color:#6b7280">Monto pagado</div>
              <div style="font-size:16px;font-weight:700;color:#047857">${esc(fmtMonto(m.total_pagado))}</div>
              <div style="margin-top:2px;font-size:12px;color:#6d28d9;font-weight:600">Mora: ${esc(fmtMonto(m.total_mora_pagada || 0))}</div>
            </div>
            <div style="border:1px solid #e5e7eb;background:#fffbeb;border-radius:8px;padding:10px;text-align:center">
              <div style="font-size:11px;color:#6b7280">Monto que adeuda</div>
              <div style="font-size:16px;font-weight:700;color:${Number(m.total_pendiente || 0) > 0 ? '#b45309' : '#047857'}">${esc(fmtMonto(m.total_pendiente))}</div>
            </div>
          </div>
          <div style="max-height:330px;overflow:auto;border:1px solid #e5e7eb;border-radius:8px">
            <table style="width:100%;border-collapse:collapse;font-size:12.5px;background:#fff">
              <thead>
                <tr style="background:#f8fafc">
                  <th style="text-align:center;padding:8px;position:sticky;top:0;background:#f8fafc">Tipo de pago</th>
                  <th style="text-align:center;padding:8px;position:sticky;top:0;background:#f8fafc">Monto</th>
                  <th style="text-align:center;padding:8px;position:sticky;top:0;background:#f8fafc">Fecha registro</th>
                  <th style="text-align:center;padding:8px;position:sticky;top:0;background:#f8fafc">N° operación</th>
                  <th style="text-align:center;padding:8px;position:sticky;top:0;background:#f8fafc">Serie/Número</th>
                  <th style="text-align:center;padding:8px;position:sticky;top:0;background:#f8fafc">Fecha emisión</th>
                  <th style="text-align:center;padding:8px;position:sticky;top:0;background:#f8fafc">Fecha cancelado</th>
                </tr>
              </thead>
              <tbody>${filas || '<tr><td colspan="7" style="padding:16px;text-align:center;color:#6b7280;vertical-align:middle">Sin pagos registrados</td></tr>'}</tbody>
            </table>
          </div>
          <div style="margin-top:10px;background:#22b8f0;border:1px solid #7dd3fc;border-radius:8px;padding:14px 12px;text-align:center">
            <div style="color:#ffffff;font-size:13px;font-weight:700;margin-bottom:10px">Puede consultar sus Boletas haciendo clic en el siguiente botón</div>
            <button
              type="button"
              class="admin-pagos-boleta-btn"
              style="border:0;background:#1d4ed8;color:#fff;padding:8px 16px;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer"
            >
              Consultar Boletas
            </button>
          </div>
        </section>`;
      }).join('');

      Swal.fire({
        title: `Historial de pagos — ${nombreAlumno(row)}`,
        width: 1200,
        html: `<div style="text-align:left">
          <div style="display:flex;gap:8px;overflow:auto;padding-bottom:4px">${tabsHtml}</div>
          ${panelsHtml}
        </div>`,
        didOpen: () => {
          const popup = Swal.getPopup();
          if (!popup) return;
          const buttons = popup.querySelectorAll('.admin-pagos-tab-btn');
          const panels = popup.querySelectorAll('.admin-pagos-panel');
          buttons.forEach((btn) => {
            btn.addEventListener('click', () => {
              const target = btn.getAttribute('data-target');
              buttons.forEach((b) => {
                b.classList.remove('active');
                b.style.background = '#f3f4f6';
                b.style.color = '#1f2937';
              });
              btn.classList.add('active');
              btn.style.background = '#2563eb';
              btn.style.color = '#fff';
              panels.forEach((p) => {
                p.style.display = p.id === target ? 'block' : 'none';
              });
            });
          });
          const boletaButtons = popup.querySelectorAll('.admin-pagos-boleta-btn');
          boletaButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
              window.open('https://sfe.bizlinks.com.pe/sfeperu/public/loginAnonimo.jsf', '_blank', 'noopener,noreferrer');
            });
          });
        },
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
