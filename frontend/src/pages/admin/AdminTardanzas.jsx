import React, { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import Swal from 'sweetalert2';
import { generarPdfTardanzasPersonal, generarPdfFaltasPersonal } from '../../utils/pdfTardanzasPersonal';
import './AdminEstadisticas.css';
import './AdminTardanzas.css';

function fmtSoles(n) {
  const v = parseFloat(n);
  if (Number.isNaN(v)) return '—';
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(v);
}

function fmtFecha(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  if (!d) return iso;
  return `${d}/${m}/${y}`;
}

/** created_at en hora Lima (evita +5h si el driver entrega UTC). */
function fmtLimaDateTime(raw) {
  if (!raw) return '—';
  const s = String(raw).trim();
  // MySQL DATETIME sin zona → tratar como Lima ya guardado
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
    return s.replace('T', ' ').slice(0, 19);
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s.replace('T', ' ').slice(0, 19);
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
    .format(d)
    .replace(' ', ' ');
}

function hoyLimaISO() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function toInputTime(horaFmt) {
  if (!horaFmt) return '';
  const parts = String(horaFmt).split(':');
  if (parts.length < 2) return '';
  return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
}

function fechaYmd(val) {
  return String(val || '').slice(0, 10);
}

function escapeHtmlAttr(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function IconExcel() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="#0f9d58"
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"
      />
      <path fill="#e8f5e9" d="M13 3.5V9h5.5L13 3.5z" />
      <path fill="#fff" d="M8.2 12.2h2.1l1.15 2.15 1.2-2.15h2.05l-2.2 3.35 2.35 3.55h-2.15l-1.25-2.25-1.3 2.25H8.1l2.4-3.5-2.3-3.4z" />
    </svg>
  );
}

function IconPdf() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="#dc2626"
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"
      />
      <path fill="#fecaca" d="M13 3.5V9h5.5L13 3.5z" />
      <text x="12" y="17.5" textAnchor="middle" fill="#fff" fontSize="6.5" fontWeight="800" fontFamily="Arial,sans-serif">
        PDF
      </text>
    </svg>
  );
}

function IconHoy() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 10h18" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 3v4M16 3v4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="15.5" r="1.6" fill="currentColor" />
    </svg>
  );
}

/** Botones de mantenimiento biométrico (ocultos en UI; no eliminar el código). */
const SHOW_BIO_DEV_BUTTONS = false;

function buildFiltroEtiqueta({ personalId, personal, desde, hasta }) {
  const parts = [];
  if (personalId) {
    const p = personal.find((x) => String(x.id) === String(personalId));
    if (p) parts.push(`Empleado: ${p.nombre}`);
  }
  if (desde && hasta) parts.push(`${fmtFecha(desde)} – ${fmtFecha(hasta)}`);
  else if (desde) parts.push(`Desde ${fmtFecha(desde)}`);
  else if (hasta) parts.push(`Hasta ${fmtFecha(hasta)}`);
  return parts.join(' · ') || 'Todos los registros';
}

export default function AdminTardanzas() {
  const { user } = useAuth();
  const puedeMutarRegistros = user?.tipo === 'ADMINISTRADOR';
  const [meta, setMeta] = useState(null);
  const [archivo, setArchivo] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);

  const [personalId, setPersonalId] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const [lista, setLista] = useState(null);
  const [listaLoading, setListaLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [rowActionId, setRowActionId] = useState(null);
  const [tabActiva, setTabActiva] = useState('biometrico');
  const [bioEstado, setBioEstado] = useState(null);
  const [bioLoading, setBioLoading] = useState(false);
  const [bioPersonalId, setBioPersonalId] = useState('');
  const [bioDesde, setBioDesde] = useState(() => hoyLimaISO());
  const [bioHasta, setBioHasta] = useState(() => hoyLimaISO());
  const [faltas, setFaltas] = useState(null);
  const [faltasLoading, setFaltasLoading] = useState(false);
  const [faltasPersonalId, setFaltasPersonalId] = useState('');
  const [faltasDesde, setFaltasDesde] = useState(() => hoyLimaISO());
  const [faltasHasta, setFaltasHasta] = useState(() => hoyLimaISO());

  const loadMeta = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/tardanzas/meta');
      setMeta(data);
    } catch {
      setMeta(null);
    }
  }, []);

  const buildBioParams = useCallback(
    (overrides = {}) => {
      const pid = overrides.personal_id !== undefined ? overrides.personal_id : bioPersonalId;
      const d = overrides.desde !== undefined ? overrides.desde : bioDesde;
      const h = overrides.hasta !== undefined ? overrides.hasta : bioHasta;
      const p = {};
      if (pid) p.personal_id = pid;
      if (d) p.desde = d;
      if (h) p.hasta = h;
      return p;
    },
    [bioPersonalId, bioDesde, bioHasta]
  );

  /** Solo filtra al pulsar Filtrar / Solo hoy / Actualizar (no al tipear Desde). */
  const loadBioEstado = useCallback(
    async (overrides) => {
      setBioLoading(true);
      try {
        const { data } = await api.get('/biometrico/admin/estado', {
          params: buildBioParams(overrides || {}),
        });
        setBioEstado(data);
      } catch (e) {
        setBioEstado({
          error: e.response?.data?.error || 'No se pudo cargar el estado del biométrico.',
        });
      } finally {
        setBioLoading(false);
      }
    },
    [buildBioParams]
  );

  const buildFaltasParams = useCallback(
    (overrides = {}) => {
      const pid = overrides.personal_id !== undefined ? overrides.personal_id : faltasPersonalId;
      const d = overrides.desde !== undefined ? overrides.desde : faltasDesde;
      const h = overrides.hasta !== undefined ? overrides.hasta : faltasHasta;
      const p = {};
      if (pid) p.personal_id = pid;
      if (d) p.desde = d;
      if (h) p.hasta = h;
      return p;
    },
    [faltasPersonalId, faltasDesde, faltasHasta]
  );

  const loadFaltas = useCallback(
    async (overrides) => {
      setFaltasLoading(true);
      try {
        const { data } = await api.get('/admin/tardanzas/faltas', {
          params: buildFaltasParams(overrides || {}),
        });
        setFaltas(data);
      } catch (e) {
        setFaltas(null);
        Swal.fire({
          icon: 'error',
          title: 'Faltas',
          text: e.response?.data?.error || 'No se pudo cargar la lista de faltas.',
        });
      } finally {
        setFaltasLoading(false);
      }
    },
    [buildFaltasParams]
  );

  const buildListaParams = useCallback(
    (overrides = {}) => {
      const pid = overrides.personal_id !== undefined ? overrides.personal_id : personalId;
      const d = overrides.desde !== undefined ? overrides.desde : desde;
      const h = overrides.hasta !== undefined ? overrides.hasta : hasta;
      const p = {};
      if (pid) p.personal_id = pid;
      if (d) p.desde = d;
      if (h) p.hasta = h;
      return p;
    },
    [personalId, desde, hasta]
  );

  const loadLista = useCallback(
    async (overrides) => {
      setListaLoading(true);
      try {
        const { data } = await api.get('/admin/tardanzas/lista', {
          params: buildListaParams(overrides || {}),
        });
        setLista(data);
      } catch (e) {
        setLista(null);
        Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudo cargar la lista.' });
      } finally {
        setListaLoading(false);
      }
    },
    [buildListaParams]
  );

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  // Carga inicial una sola vez (no al cambiar Desde/Hasta; eso es con el botón Filtrar)
  useEffect(() => {
    loadLista();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo montaje
  }, []);

  useEffect(() => {
    if (tabActiva === 'biometrico') loadBioEstado();
    if (tabActiva === 'faltas') loadFaltas();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar de tab
  }, [tabActiva]);

  const onArchivoChange = (e) => {
    const f = e.target.files?.[0];
    setArchivo(f || null);
    setPreview(null);
  };

  const verPreview = async () => {
    if (!archivo) {
      Swal.fire({ icon: 'info', title: 'Archivo', text: 'Seleccione un Excel del huellero.' });
      return;
    }
    setPreviewLoading(true);
    setPreview(null);
    try {
      const fd = new FormData();
      fd.append('archivo', archivo);
      const { data } = await api.post('/admin/tardanzas/preview', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPreview(data);
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Vista previa', text: e.response?.data?.error || 'No se pudo leer el archivo.' });
    } finally {
      setPreviewLoading(false);
    }
  };

  const confirmarImport = async () => {
    if (!archivo) return;
    const r = await Swal.fire({
      icon: 'question',
      title: 'Importar marcaciones',
      html: preview?.resumen
        ? `Se registrarán <strong>${preview.resumen.coincidencias}</strong> entradas (${preview.resumen.nuevos} nuevas, ${preview.resumen.actualizados} actualizadas).`
        : '¿Confirmar importación?',
      showCancelButton: true,
      confirmButtonText: 'Importar',
      cancelButtonText: 'Cancelar',
    });
    if (!r.isConfirmed) return;

    setImportLoading(true);
    try {
      const fd = new FormData();
      fd.append('archivo', archivo);
      const { data } = await api.post('/admin/tardanzas/importar', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const { insertados, actualizados, omitidos_sin_match, errores = 0 } = data.stats;
      const html = `Insertados: <strong>${insertados}</strong><br>Actualizados: <strong>${actualizados}</strong><br>Sin coincidencia: <strong>${omitidos_sin_match}</strong>${errores ? `<br>Errores: <strong>${errores}</strong>` : ''}`;
      await Swal.fire({
        icon: errores ? 'warning' : 'success',
        title: errores ? 'Importación con errores' : 'Importación completa',
        html,
      });
      setPreview(null);
      setArchivo(null);
      loadLista();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Importar', text: e.response?.data?.error || 'Error al importar.' });
    } finally {
      setImportLoading(false);
    }
  };

  const hallarFilaDiaPersonal = (filas, pid, fecha) =>
    (filas || []).find(
      (x) => String(x.personal_id) === String(pid) && fechaYmd(x.fecha) === fechaYmd(fecha)
    );

  const buscarRegistroDiaPersonal = async (pid, fecha) => {
    const local =
      hallarFilaDiaPersonal(bioEstado?.marcaciones || bioEstado?.eventos, pid, fecha) ||
      hallarFilaDiaPersonal(lista?.filas, pid, fecha);
    if (local?.id) return local;
    const { data } = await api.get('/admin/tardanzas/lista', {
      params: { personal_id: pid, desde: fecha, hasta: fecha },
    });
    return hallarFilaDiaPersonal(data?.filas, pid, fecha) || null;
  };

  const opcionesPersonalHtml = () =>
    (meta?.personal || [])
      .map((p) => `<option value="${p.id}">${escapeHtmlAttr(p.nombre)}</option>`)
      .join('');

  const ajustarHorarioDesdeToolbar = async () => {
    const personalOpts = opcionesPersonalHtml();
    if (!personalOpts) {
      Swal.fire({ icon: 'info', title: 'Personal', text: 'No hay personal cargado. Recargue la página.' });
      return;
    }
    const fechaDef = (tabActiva === 'biometrico' ? bioDesde : desde) || hoyLimaISO();
    const personalDef = (tabActiva === 'biometrico' ? bioPersonalId : personalId) || '';
    const filasVista = tabActiva === 'biometrico'
      ? (bioEstado?.marcaciones || bioEstado?.eventos)
      : lista?.filas;
    const previo = personalDef ? hallarFilaDiaPersonal(filasVista, personalDef, fechaDef) : null;

    const r = await Swal.fire({
      icon: 'question',
      title: 'Ajustar horario',
      width: '28rem',
      html: `
        <p style="margin:0 0 0.85rem;font-size:0.88rem;text-align:left;color:#64748b;line-height:1.4">
          Indique el día y la persona. Se corrige la entrada y, si aplica, la salida de ese registro.
        </p>
        <label style="display:block;text-align:left;font-size:0.85rem;margin-bottom:0.3rem">Día *</label>
        <input id="swal-tz-aj-fecha" type="date" class="swal2-input" value="${fechaDef}" style="margin:0 0 0.75rem;width:100%">
        <label style="display:block;text-align:left;font-size:0.85rem;margin-bottom:0.3rem">Personal *</label>
        <select id="swal-tz-aj-personal" class="swal2-select" style="margin:0 0 0.75rem;width:100%">
          <option value="">Seleccione…</option>
          ${personalOpts}
        </select>
        <label style="display:block;text-align:left;font-size:0.85rem;margin-bottom:0.3rem">Hora entrada *</label>
        <input id="swal-tz-aj-entrada" type="time" class="swal2-input" value="${toInputTime(previo?.hora_entrada || previo?.hora_marcacion_fmt)}" style="margin:0 0 0.75rem;width:100%">
        <label style="display:block;text-align:left;font-size:0.85rem;margin-bottom:0.3rem">Hora salida (vacío = sin salida)</label>
        <input id="swal-tz-aj-salida" type="time" class="swal2-input" value="${toInputTime(previo?.hora_salida || previo?.hora_salida_fmt)}" style="margin:0;width:100%">
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      focusConfirm: false,
      didOpen: () => {
        const sel = document.getElementById('swal-tz-aj-personal');
        if (sel && personalDef) sel.value = String(personalDef);
      },
      preConfirm: () => {
        const fecha = document.getElementById('swal-tz-aj-fecha')?.value;
        const pid = document.getElementById('swal-tz-aj-personal')?.value;
        const he = document.getElementById('swal-tz-aj-entrada')?.value;
        const hs = document.getElementById('swal-tz-aj-salida')?.value || '';
        if (!fecha) {
          Swal.showValidationMessage('Indique el día');
          return false;
        }
        if (!pid) {
          Swal.showValidationMessage('Seleccione el personal');
          return false;
        }
        if (!he) {
          Swal.showValidationMessage('Indique la hora de entrada');
          return false;
        }
        return { personal_id: pid, fecha, hora_entrada: he, hora_salida: hs };
      },
    });
    if (!r.isConfirmed || !r.value) return;

    setRowActionId('toolbar');
    try {
      Swal.fire({ title: 'Guardando…', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      const fila = await buscarRegistroDiaPersonal(r.value.personal_id, r.value.fecha);
      if (!fila?.id) {
        Swal.fire({
          icon: 'info',
          title: 'Sin registro',
          text: 'Esa persona no tiene marcación ese día. Use «Agregar ingreso» si olvidó marcar.',
        });
        return;
      }
      await api.patch(`/admin/tardanzas/registro/${fila.id}`, {
        hora_entrada: r.value.hora_entrada,
        hora_salida: r.value.hora_salida,
      });
      await loadBioEstado();
      await loadLista();
      Swal.fire({ icon: 'success', title: 'Horario actualizado', timer: 1600, showConfirmButton: false });
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Ajustar horario',
        text: e.response?.data?.error || 'No se pudo actualizar.',
      });
    } finally {
      setRowActionId(null);
    }
  };

  const quitarRegistroDesdeToolbar = async () => {
    const personalOpts = opcionesPersonalHtml();
    if (!personalOpts) {
      Swal.fire({ icon: 'info', title: 'Personal', text: 'No hay personal cargado. Recargue la página.' });
      return;
    }
    const fechaDef = (tabActiva === 'biometrico' ? bioDesde : desde) || hoyLimaISO();
    const personalDef = (tabActiva === 'biometrico' ? bioPersonalId : personalId) || '';

    const r = await Swal.fire({
      icon: 'warning',
      title: 'Quitar registro',
      width: '28rem',
      html: `
        <p style="margin:0 0 0.85rem;font-size:0.88rem;text-align:left;color:#64748b;line-height:1.4">
          Indique el día y la persona. Se elimina esa marcación en la intranet (el huellero no se modifica).
        </p>
        <label style="display:block;text-align:left;font-size:0.85rem;margin-bottom:0.3rem">Día *</label>
        <input id="swal-tz-rm-fecha" type="date" class="swal2-input" value="${fechaDef}" style="margin:0 0 0.75rem;width:100%">
        <label style="display:block;text-align:left;font-size:0.85rem;margin-bottom:0.3rem">Personal *</label>
        <select id="swal-tz-rm-personal" class="swal2-select" style="margin:0;width:100%">
          <option value="">Seleccione…</option>
          ${personalOpts}
        </select>
      `,
      showCancelButton: true,
      confirmButtonText: 'Quitar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
      focusConfirm: false,
      didOpen: () => {
        const sel = document.getElementById('swal-tz-rm-personal');
        if (sel && personalDef) sel.value = String(personalDef);
      },
      preConfirm: () => {
        const fecha = document.getElementById('swal-tz-rm-fecha')?.value;
        const pid = document.getElementById('swal-tz-rm-personal')?.value;
        if (!fecha) {
          Swal.showValidationMessage('Indique el día');
          return false;
        }
        if (!pid) {
          Swal.showValidationMessage('Seleccione el personal');
          return false;
        }
        return { personal_id: pid, fecha };
      },
    });
    if (!r.isConfirmed || !r.value) return;

    const persona = (meta?.personal || []).find((p) => String(p.id) === String(r.value.personal_id));
    const ok = await Swal.fire({
      icon: 'warning',
      title: 'Confirmar',
      html: `¿Quitar la marcación de <strong>${escapeHtmlAttr(persona?.nombre || 'esa persona')}</strong> del <strong>${fmtFecha(r.value.fecha)}</strong>?`,
      showCancelButton: true,
      confirmButtonText: 'Sí, quitar',
      cancelButtonText: 'No',
      confirmButtonColor: '#dc2626',
    });
    if (!ok.isConfirmed) return;

    setRowActionId('toolbar');
    try {
      Swal.fire({ title: 'Quitando…', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      const fila = await buscarRegistroDiaPersonal(r.value.personal_id, r.value.fecha);
      if (!fila?.id) {
        Swal.fire({
          icon: 'info',
          title: 'Sin registro',
          text: 'Esa persona no tiene marcación ese día.',
        });
        return;
      }
      await api.delete(`/admin/tardanzas/registro/${fila.id}`);
      await loadBioEstado();
      await loadLista();
      Swal.fire({ icon: 'success', title: 'Registro quitado', timer: 1500, showConfirmButton: false });
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Quitar registro',
        text: e.response?.data?.error || 'No se pudo eliminar.',
      });
    } finally {
      setRowActionId(null);
    }
  };

  /** Alta manual cuando alguien olvidó marcar un día. */
  const agregarIngresoManual = async () => {
    const personalOpts = (meta?.personal || [])
      .map((p) => `<option value="${p.id}">${String(p.nombre || '').replace(/</g, '')}</option>`)
      .join('');
    if (!personalOpts) {
      Swal.fire({ icon: 'info', title: 'Personal', text: 'No hay personal cargado. Recargue la página.' });
      return;
    }
    const fechaDef = bioDesde || desde || hoyLimaISO();
    const personalDef = bioPersonalId || personalId || '';

    const r = await Swal.fire({
      icon: 'question',
      title: 'Agregar ingreso',
      width: '28rem',
      html: `
        <p style="margin:0 0 0.85rem;font-size:0.88rem;text-align:left;color:#64748b;line-height:1.4">
          Use esta opción si alguien olvidó marcar. Indique fecha y horas. Si ya hay registro ese día, se actualizan las horas.
        </p>
        <label style="display:block;text-align:left;font-size:0.85rem;margin-bottom:0.3rem">Personal *</label>
        <select id="swal-tz-personal" class="swal2-select" style="margin:0 0 0.75rem;width:100%">
          <option value="">Seleccione…</option>
          ${personalOpts}
        </select>
        <label style="display:block;text-align:left;font-size:0.85rem;margin-bottom:0.3rem">Fecha *</label>
        <input id="swal-tz-fecha" type="date" class="swal2-input" value="${fechaDef}" style="margin:0 0 0.75rem;width:100%">
        <label style="display:block;text-align:left;font-size:0.85rem;margin-bottom:0.3rem">Hora entrada *</label>
        <input id="swal-tz-entrada" type="time" class="swal2-input" value="08:00" style="margin:0 0 0.75rem;width:100%">
        <label style="display:block;text-align:left;font-size:0.85rem;margin-bottom:0.3rem">Hora salida (opcional)</label>
        <input id="swal-tz-salida" type="time" class="swal2-input" value="" style="margin:0;width:100%">
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar ingreso',
      cancelButtonText: 'Cancelar',
      focusConfirm: false,
      didOpen: () => {
        const sel = document.getElementById('swal-tz-personal');
        if (sel && personalDef) sel.value = String(personalDef);
      },
      preConfirm: () => {
        const pid = document.getElementById('swal-tz-personal')?.value;
        const fecha = document.getElementById('swal-tz-fecha')?.value;
        const he = document.getElementById('swal-tz-entrada')?.value;
        const hs = document.getElementById('swal-tz-salida')?.value || '';
        if (!pid) {
          Swal.showValidationMessage('Seleccione el personal');
          return false;
        }
        if (!fecha) {
          Swal.showValidationMessage('Indique la fecha');
          return false;
        }
        if (!he) {
          Swal.showValidationMessage('Indique la hora de entrada');
          return false;
        }
        return { personal_id: pid, fecha, hora_entrada: he, hora_salida: hs };
      },
    });
    if (!r.isConfirmed || !r.value) return;

    try {
      Swal.fire({ title: 'Guardando…', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      const { data } = await api.post('/admin/tardanzas/registro', r.value);
      await loadBioEstado();
      await loadLista();
      Swal.fire({
        icon: 'success',
        title: data.accion === 'actualizado' ? 'Registro actualizado' : 'Ingreso agregado',
        text: data.message || 'Guardado correctamente',
        timer: 2200,
        showConfirmButton: false,
      });
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Agregar ingreso',
        text: e.response?.data?.error || 'No se pudo guardar el registro.',
      });
    }
  };

  const exportExcel = async () => {
    setExportLoading(true);
    try {
      const res = await api.get('/admin/tardanzas/export', {
        params: buildListaParams(),
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `tardanzas-personal-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      Swal.fire({ icon: 'error', title: 'Excel', text: 'No se pudo exportar.' });
    } finally {
      setExportLoading(false);
    }
  };

  const exportPdf = async () => {
    if (!lista?.filas?.length) {
      Swal.fire({ icon: 'info', title: 'Sin datos', text: 'No hay registros para exportar con los filtros actuales.' });
      return;
    }
    try {
      await generarPdfTardanzasPersonal({
        colegioNombre: lista.colegio_nombre || meta?.colegio_nombre,
        anio: lista.anio || meta?.anio,
        filtroEtiqueta: buildFiltroEtiqueta({
          personalId,
          personal: meta?.personal || [],
          desde,
          hasta,
        }),
        filas: lista.filas,
        total_descuento: lista.total_descuento,
        tarifa_por_minuto: lista.tarifa_por_minuto,
        incluirHoraSalida: true,
      });
    } catch {
      Swal.fire({ icon: 'error', title: 'PDF', text: 'No se pudo generar el PDF.' });
    }
  };

  const exportExcelBio = async () => {
    setExportLoading(true);
    try {
      const res = await api.get('/admin/tardanzas/export', {
        params: buildBioParams(),
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `biometrico-marcaciones-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      Swal.fire({ icon: 'error', title: 'Excel', text: 'No se pudo exportar.' });
    } finally {
      setExportLoading(false);
    }
  };

  const exportPdfBio = async () => {
    const filas = bioEstado?.marcaciones || [];
    if (!filas.length) {
      Swal.fire({ icon: 'info', title: 'Sin datos', text: 'No hay marcaciones para exportar con los filtros actuales.' });
      return;
    }
    try {
      await generarPdfTardanzasPersonal({
        colegioNombre: meta?.colegio_nombre,
        anio: meta?.anio,
        titulo: 'Marcaciones biométrico',
        filtroEtiqueta: buildFiltroEtiqueta({
          personalId: bioPersonalId,
          personal: meta?.personal || [],
          desde: bioDesde,
          hasta: bioHasta,
        }),
        filas,
        total_descuento: bioEstado?.total_descuento ?? 0,
        tarifa_por_minuto: bioEstado?.tarifa_por_minuto,
        incluirHoraSalida: true,
        minutosCeroComoCero: true,
      });
    } catch {
      Swal.fire({ icon: 'error', title: 'PDF', text: 'No se pudo generar el PDF.' });
    }
  };

  const exportExcelFaltas = async () => {
    const filas = faltas?.filas || [];
    if (!filas.length) {
      Swal.fire({ icon: 'info', title: 'Sin datos', text: 'No hay faltas para exportar con los filtros actuales.' });
      return;
    }
    setExportLoading(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Faltas');
      ws.columns = [
        { header: 'Fecha', key: 'fecha', width: 14 },
        { header: 'Personal', key: 'personal', width: 38 },
        { header: 'Cargo', key: 'cargo', width: 24 },
      ];
      filas.forEach((f) => {
        ws.addRow({
          fecha: fmtFecha(f.fecha),
          personal: f.personal_nombre || '',
          cargo: f.cargo || '—',
        });
      });
      const buf = await wb.xlsx.writeBuffer();
      const url = window.URL.createObjectURL(new Blob([buf]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `faltas-personal-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      Swal.fire({ icon: 'error', title: 'Excel', text: 'No se pudo exportar.' });
    } finally {
      setExportLoading(false);
    }
  };

  const exportPdfFaltas = async () => {
    const filas = faltas?.filas || [];
    if (!filas.length) {
      Swal.fire({ icon: 'info', title: 'Sin datos', text: 'No hay faltas para exportar con los filtros actuales.' });
      return;
    }
    try {
      await generarPdfFaltasPersonal({
        colegioNombre: faltas.colegio_nombre || meta?.colegio_nombre,
        anio: faltas.anio || meta?.anio,
        filtroEtiqueta: buildFiltroEtiqueta({
          personalId: faltasPersonalId,
          personal: faltas?.personal_comun || meta?.personal_comun || meta?.personal || [],
          desde: faltasDesde,
          hasta: faltasHasta,
        }),
        filas: filas.map((f) => ({
          fecha: fmtFecha(f.fecha),
          personal_nombre: f.personal_nombre,
          cargo: f.cargo,
        })),
      });
    } catch {
      Swal.fire({ icon: 'error', title: 'PDF', text: 'No se pudo generar el PDF.' });
    }
  };

  const filtroEtiqueta = buildFiltroEtiqueta({
    personalId,
    personal: meta?.personal || [],
    desde,
    hasta,
  });

  const bioFilas = bioEstado?.marcaciones || bioEstado?.eventos || [];

  return (
    <DashboardLayout>
      <div className="dashboard-container admin-tardanzas-page">
        <header className="admin-tz-hero">
          <div className="admin-tz-hero-icon" aria-hidden="true">
            ⏱
          </div>
          <div className="admin-tz-hero-text">
            <h1>Tardanzas del personal</h1>
            <p>
              Marcaciones del huellero (Excel o automático Hikvision) y descuentos por tardanza (sueldo ÷ 30 ÷ 8 ÷ 60
              por minuto; S/. 0 si no hay sueldo).
              {meta?.colegio_nombre ? ` ${meta.colegio_nombre} · Año ${meta.anio}` : ''}
            </p>
          </div>
        </header>

        <div
          className={`admin-tz-help admin-tz-help--${
            tabActiva === 'importacion' ? 'importar' : tabActiva
          }`}
        >
          <div className="admin-tz-help-icon" aria-hidden="true">
            💡
          </div>
          <div>
            <h2>
              {tabActiva === 'biometrico'
                ? 'Biométrico en vivo'
                : tabActiva === 'faltas'
                  ? 'Faltas del personal'
                  : 'Importación'}
            </h2>
            <p>
              {tabActiva === 'biometrico'
                ? 'El terminal envía cada marcación. Se identifica igual que el Excel: por nombre (First/Last Name). El DNI del huellero es solo respaldo. El descuento es sueldo ÷ 30 ÷ 8 ÷ 60 por minuto de tardanza (S/ 0 si no hay sueldo).'
                : tabActiva === 'faltas'
                  ? 'Si ese día alguien marcó, el colegio estaba abierto. Se lista a todo el personal que no marcó. Quienes tienen hora de ingreso 00:00 (perfiles de ejemplo) no aparecen aquí ni en tardanzas.'
                  : 'Importe el Excel del huellero arriba y consulte abajo los registros (entrada, tardanza y descuento).'}
            </p>
          </div>
        </div>

        <div className="admin-tz-toolbar">
          <nav className="admin-tz-tabs" role="tablist" aria-label="Secciones de tardanzas">
            <button
              type="button"
              role="tab"
              aria-selected={tabActiva === 'biometrico'}
              className={`admin-tz-tab admin-tz-tab--bio${tabActiva === 'biometrico' ? ' is-active' : ''}`}
              onClick={() => setTabActiva('biometrico')}
            >
              Biométrico
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tabActiva === 'faltas'}
              className={`admin-tz-tab admin-tz-tab--faltas${tabActiva === 'faltas' ? ' is-active' : ''}`}
              onClick={() => setTabActiva('faltas')}
            >
              Faltas
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tabActiva === 'importacion'}
              className={`admin-tz-tab admin-tz-tab--amber${tabActiva === 'importacion' ? ' is-active' : ''}`}
              onClick={() => setTabActiva('importacion')}
            >
              Importación
            </button>
          </nav>
        </div>

        {tabActiva === 'biometrico' && (
          <section className="admin-tardanzas-import admin-tz-bio" aria-label="Biométrico Hikvision">
            <h2 className="admin-tardanzas-import__title">Hikvision → intranet</h2>
            <p className="admin-tardanzas-import__desc">
              Solo se guardan marcaciones con fecha de <strong>hoy</strong> en el huellero. La{' '}
              <strong>primera</strong> del día es la entrada (se mantiene la más temprana); las siguientes actualizan
              la <strong>salida</strong> (siempre la última). El historial que reenvía el terminal no se guarda. Use
              «Limpiar entradas de hoy» si hace falta borrar el día.
            </p>

            {bioLoading && <p className="admin-tz-bio__muted">Cargando estado…</p>}

            {!bioLoading && bioEstado?.error && (
              <p className="admin-tz-bio__err">{bioEstado.error}</p>
            )}

            {!bioLoading && bioEstado && !bioEstado.error && (
              <>
                <div className="admin-tz-bio__status">
                  <span
                    className={`admin-tz-bio__pill${bioEstado.webhook_configurado ? ' is-ok' : ' is-warn'}`}
                  >
                    {bioEstado.webhook_configurado ? 'Webhook listo en servidor' : 'Falta configurar token en .env'}
                  </span>
                  {bioEstado.migracion_pendiente && (
                    <span className="admin-tz-bio__pill is-warn">Ejecutar migración SQL 067</span>
                  )}
                  <button type="button" className="admin-tardanzas-btn" onClick={loadBioEstado}>
                    Actualizar
                  </button>
                  {SHOW_BIO_DEV_BUTTONS && (
                    <>
                      <button
                        type="button"
                        className="admin-tardanzas-btn"
                        onClick={async () => {
                          const conf = await Swal.fire({
                            icon: 'question',
                            title: 'Borrar omitidos',
                            text: 'Se eliminan del log las filas OMITIDO. No borra marcaciones de asistencia ni tardanzas.',
                            showCancelButton: true,
                            confirmButtonText: 'Borrar',
                            cancelButtonText: 'Cancelar',
                          });
                          if (!conf.isConfirmed) return;
                          try {
                            const { data } = await api.delete('/biometrico/admin/eventos/omitidos');
                            await loadBioEstado();
                            Swal.fire({
                              icon: 'success',
                              title: 'Listo',
                              text: `Se borraron ${data.deleted ?? 0} filas omitidas.`,
                              timer: 2000,
                              showConfirmButton: false,
                            });
                          } catch (e) {
                            Swal.fire({
                              icon: 'error',
                              title: 'Error',
                              text: e.response?.data?.error || 'No se pudo borrar.',
                            });
                          }
                        }}
                      >
                        Borrar omitidos
                      </button>
                      <button
                        type="button"
                        className="admin-tardanzas-btn"
                        onClick={async () => {
                          const conf = await Swal.fire({
                            icon: 'warning',
                            title: 'Limpiar entradas de hoy',
                            html: 'Borra las <strong>marcaciones de entrada de hoy</strong> en asistencia (las que el historial del huellero contaminó).<br>Luego marque de nuevo en el terminal.',
                            showCancelButton: true,
                            confirmButtonText: 'Sí, limpiar hoy',
                            cancelButtonText: 'Cancelar',
                            confirmButtonColor: '#b91c1c',
                          });
                          if (!conf.isConfirmed) return;
                          try {
                            const { data } = await api.delete('/biometrico/admin/asistencia-hoy');
                            await loadBioEstado();
                            await loadLista();
                            Swal.fire({
                              icon: 'success',
                              title: 'Limpiado',
                              text: `Se borraron ${data.deleted ?? 0} entradas del ${data.fecha || 'día'}. Marque otra vez en el huellero.`,
                            });
                          } catch (e) {
                            Swal.fire({
                              icon: 'error',
                              title: 'Error',
                              text: e.response?.data?.error || 'No se pudo limpiar.',
                            });
                          }
                        }}
                      >
                        Limpiar entradas de hoy
                      </button>
                      <button
                        type="button"
                        className="admin-tardanzas-btn admin-tardanzas-btn--primary"
                        onClick={async () => {
                          try {
                            const { data } = await api.post('/biometrico/admin/probar-marcacion', {});
                            await loadBioEstado();
                            await loadLista();
                            Swal.fire({
                              icon: data.resultado?.ok === false ? 'warning' : 'success',
                              title: 'Prueba de marcación',
                              html: `<p>${data.mensaje || 'Listo'}</p>
                            <p style="font-size:0.85rem;opacity:.85">${data.name || ''} · id ${data.employeeNo || '—'}</p>
                            <p style="font-size:0.8rem">reason: <code>${data.resultado?.reason || data.resultado?.action || '—'}</code></p>`,
                            });
                          } catch (e) {
                            Swal.fire({
                              icon: 'error',
                              title: 'No se pudo probar',
                              text: e.response?.data?.error || e.message || 'Error',
                            });
                          }
                        }}
                      >
                        Probar marcación
                      </button>
                    </>
                  )}
                </div>

                {!bioEstado.webhook_configurado && (
                  <div className="admin-tz-bio__url-box">
                    <p className="admin-tz-bio__hint">{bioEstado.webhook_url_hint}</p>
                    <pre className="admin-tz-bio__env">{`BIOMETRICO_WEBHOOK_TOKEN=un_token_largo_secreto
BIOMETRICO_PUBLIC_URL=${window.location.origin}`}</pre>
                  </div>
                )}

                <h3 className="admin-tz-bio__sub">Marcaciones (entrada / salida)</h3>
                <p className="admin-tz-bio__hint">
                  Por defecto: <strong>solo hoy</strong>. Elija Desde y Hasta y pulse <strong>Buscar</strong> (no
                  aplica al cambiar solo una fecha). Una fila por persona: entrada = primera; salida = última. Orden:
                  hora de entrada (más reciente → más temprano).
                </p>

                <div className="admin-tardanzas-toolbar admin-tz-bio__filters">
                  <label>
                    Persona
                    <select value={bioPersonalId} onChange={(e) => setBioPersonalId(e.target.value)}>
                      <option value="">Todas</option>
                      {(meta?.personal || []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Desde
                    <input type="date" value={bioDesde} onChange={(e) => setBioDesde(e.target.value)} />
                  </label>
                  <label>
                    Hasta
                    <input type="date" value={bioHasta} onChange={(e) => setBioHasta(e.target.value)} />
                  </label>
                  <button
                    type="button"
                    className="admin-tardanzas-btn admin-tardanzas-btn--primary"
                    onClick={() => loadBioEstado()}
                  >
                    Buscar
                  </button>
                  {puedeMutarRegistros && (
                  <>
                  <button
                    type="button"
                    className="admin-tardanzas-lock-btn"
                    title="Ajustar horario (día, personal, entrada y salida)"
                    aria-label="Ajustar horario"
                    disabled={rowActionId != null}
                    onClick={ajustarHorarioDesdeToolbar}
                  >
                    🔒
                  </button>
                  <button
                    type="button"
                    className="admin-tardanzas-lock-btn admin-tardanzas-lock-btn--quitar"
                    title="Quitar registro (día y personal)"
                    aria-label="Quitar registro"
                    disabled={rowActionId != null}
                    onClick={quitarRegistroDesdeToolbar}
                  >
                    ✖️
                  </button>
                  <button
                    type="button"
                    className="admin-tardanzas-lock-btn admin-tardanzas-lock-btn--add"
                    title="Agregar ingreso"
                    aria-label="Agregar ingreso"
                    onClick={agregarIngresoManual}
                  >
                    +
                  </button>
                  </>
                  )}
                  <button
                    type="button"
                    className="admin-tardanzas-btn admin-tardanzas-btn--hoy"
                    title="Ver solo el día de hoy"
                    onClick={() => {
                      const hoy = hoyLimaISO();
                      setBioPersonalId('');
                      setBioDesde(hoy);
                      setBioHasta(hoy);
                      loadBioEstado({ personal_id: '', desde: hoy, hasta: hoy });
                    }}
                  >
                    <IconHoy />
                    Solo hoy
                  </button>
                  <span className="admin-tardanzas-toolbar__sep" aria-hidden="true" />
                  <button
                    type="button"
                    className="admin-tardanzas-lock-btn admin-tardanzas-lock-btn--excel"
                    title="Exportar Excel"
                    aria-label="Exportar Excel"
                    onClick={exportExcelBio}
                    disabled={exportLoading || !bioFilas.length}
                  >
                    {exportLoading ? '…' : <IconExcel />}
                  </button>
                  <button
                    type="button"
                    className="admin-tardanzas-lock-btn admin-tardanzas-lock-btn--pdf"
                    title="Exportar PDF"
                    aria-label="Exportar PDF"
                    onClick={exportPdfBio}
                    disabled={!bioFilas.length}
                  >
                    <IconPdf />
                  </button>
                </div>

                <p className="admin-tardanzas-meta">
                  Descuento: sueldo ÷ 30 ÷ 8 ÷ 60 por minuto (S/. 0 sin sueldo)
                  {bioEstado.total_registros != null ? ` · ${bioEstado.total_registros} registro(s)` : ''}
                </p>

                <div className="admin-tardanzas-table-wrap">
                  <table className="admin-tardanzas-table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Personal</th>
                        <th>Hora entrada real</th>
                        <th>Hora entrada</th>
                        <th>Min. tarde</th>
                        <th>Descuento</th>
                        <th>Hora salida</th>
                        <th>Detalle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bioFilas.length === 0 && (
                        <tr>
                          <td colSpan={8}>
                            No hay marcaciones para el filtro (por defecto día de hoy). Marque en el terminal o amplíe
                            las fechas.
                          </td>
                        </tr>
                      )}
                      {bioFilas.map((ev) => (
                        <tr key={ev.id}>
                          <td>{ev.fecha ? fmtFecha(ev.fecha) : '—'}</td>
                          <td className="col-personal">{ev.personal_nombre || '—'}</td>
                          <td>{ev.hora_entrada_real_fmt || '—'}</td>
                          <td>
                            {ev.hora_marcacion_fmt ||
                              (ev.hora_entrada ? String(ev.hora_entrada).slice(0, 8) : '—')}
                          </td>
                          <td>{ev.minutos_tardanza != null ? ev.minutos_tardanza : 0}</td>
                          <td
                            className={
                              (ev.descuento || 0) > 0 ? 'col-descuento' : 'col-descuento col-descuento--cero'
                            }
                          >
                            {fmtSoles(ev.descuento ?? 0)}
                          </td>
                          <td>
                            {ev.hora_salida_fmt && ev.hora_salida_fmt !== '—'
                              ? ev.hora_salida_fmt
                              : ev.hora_salida
                                ? String(ev.hora_salida).slice(0, 8)
                                : '—'}
                          </td>
                          <td className="col-detalle" title={ev.motivo || ''}>{ev.motivo || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {bioFilas.length > 0 && (
                    <div className="admin-tardanzas-total">
                      <span className="admin-tardanzas-total__label">Total descuento</span>
                      <span className="admin-tardanzas-total__value">
                        {fmtSoles(bioEstado.total_descuento ?? 0)}
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        )}

        {tabActiva === 'faltas' && (
          <section className="admin-tardanzas-import admin-tz-faltas" aria-label="Faltas del personal">
            <h2 className="admin-tardanzas-import__title">Quién no marcó</h2>
            <p className="admin-tardanzas-import__desc">
              Se toman los días en los que <strong>alguien sí marcó</strong>. En cada uno se muestra el personal que{' '}
              <strong>no tiene entrada</strong>. Quien tiene hora de ingreso <strong>00:00</strong> (perfiles de ejemplo)
              no cuenta ni como tardanza ni como falta. Un sábado o feriado sin marcas no genera faltas.
            </p>

            <div className="admin-tardanzas-toolbar admin-tz-bio__filters">
              <label>
                Persona
                <select value={faltasPersonalId} onChange={(e) => setFaltasPersonalId(e.target.value)}>
                  <option value="">Todas</option>
                  {(faltas?.personal_comun || meta?.personal_comun || []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Desde
                <input type="date" value={faltasDesde} onChange={(e) => setFaltasDesde(e.target.value)} />
              </label>
              <label>
                Hasta
                <input type="date" value={faltasHasta} onChange={(e) => setFaltasHasta(e.target.value)} />
              </label>
              <button
                type="button"
                className="admin-tardanzas-btn admin-tardanzas-btn--primary"
                disabled={faltasLoading}
                onClick={() => loadFaltas()}
              >
                {faltasLoading ? '…' : 'Buscar'}
              </button>
              {puedeMutarRegistros && (
              <>
              <button
                type="button"
                className="admin-tardanzas-lock-btn"
                title="Ajustar horario (día, personal, entrada y salida)"
                aria-label="Ajustar horario"
                disabled={rowActionId != null}
                onClick={ajustarHorarioDesdeToolbar}
              >
                🔒
              </button>
              <button
                type="button"
                className="admin-tardanzas-lock-btn admin-tardanzas-lock-btn--quitar"
                title="Quitar registro (día y personal)"
                aria-label="Quitar registro"
                disabled={rowActionId != null}
                onClick={quitarRegistroDesdeToolbar}
              >
                ✖️
              </button>
              <button
                type="button"
                className="admin-tardanzas-lock-btn admin-tardanzas-lock-btn--add"
                title="Agregar ingreso"
                aria-label="Agregar ingreso"
                onClick={agregarIngresoManual}
              >
                +
              </button>
              </>
              )}
              <button
                type="button"
                className="admin-tardanzas-btn admin-tardanzas-btn--hoy"
                title="Ver solo el día de hoy"
                onClick={() => {
                  const hoy = hoyLimaISO();
                  setFaltasPersonalId('');
                  setFaltasDesde(hoy);
                  setFaltasHasta(hoy);
                  loadFaltas({ personal_id: '', desde: hoy, hasta: hoy });
                }}
              >
                <IconHoy />
                Solo hoy
              </button>
              <span className="admin-tardanzas-toolbar__sep" aria-hidden="true" />
              <button
                type="button"
                className="admin-tardanzas-lock-btn admin-tardanzas-lock-btn--excel"
                title="Exportar Excel"
                aria-label="Exportar Excel"
                onClick={exportExcelFaltas}
                disabled={exportLoading || !faltas?.filas?.length}
              >
                {exportLoading ? '…' : <IconExcel />}
              </button>
              <button
                type="button"
                className="admin-tardanzas-lock-btn admin-tardanzas-lock-btn--pdf"
                title="Exportar PDF"
                aria-label="Exportar PDF"
                onClick={exportPdfFaltas}
                disabled={!faltas?.filas?.length}
              >
                <IconPdf />
              </button>
            </div>

            <p className="admin-tardanzas-meta">
              {faltasLoading
                ? 'Cargando…'
                : faltas
                  ? `${faltas.total} falta(s) · ${faltas.dias_con_marca} día(s) con marcación${
                      faltas.desde && faltas.hasta
                        ? ` · ${fmtFecha(faltas.desde)} – ${fmtFecha(faltas.hasta)}`
                        : ''
                    }`
                  : 'Elija fechas y pulse Buscar.'}
            </p>

            <div className="admin-tardanzas-table-wrap">
              {faltasLoading ? (
                <p className="admin-tardanzas-empty">Cargando…</p>
              ) : !faltas?.filas?.length ? (
                <p className="admin-tardanzas-empty">
                  {faltas?.dias_con_marca === 0
                    ? 'No hay días con marcación en ese rango.'
                    : 'Nadie del personal dejó de marcar en esas fechas.'}
                </p>
              ) : (
                <table className="admin-tardanzas-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Personal</th>
                      <th>Cargo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {faltas.filas.map((f) => (
                      <tr key={`${f.fecha}-${f.personal_id}`}>
                        <td>{fmtFecha(f.fecha)}</td>
                        <td className="col-personal">{f.personal_nombre}</td>
                        <td>{f.cargo || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        )}

        {tabActiva === 'importacion' && (
          <>
            <section className="admin-tardanzas-import" aria-label="Importar Excel">
              <h2 className="admin-tardanzas-import__title">Importar marcaciones del huellero</h2>
              <p className="admin-tardanzas-import__desc">
                Se usa la primera entrada del día por persona (hora más temprana del Excel). Si un día ya fue
                importado, se actualiza la hora y el descuento. Si editó celdas de hora en Excel, guarde el archivo
                antes de subirlo.
              </p>
              <div className="admin-tardanzas-import__row">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="admin-tardanzas-file"
                  onChange={onArchivoChange}
                />
                <button
                  type="button"
                  className="admin-tardanzas-btn"
                  disabled={!archivo || previewLoading}
                  onClick={verPreview}
                >
                  {previewLoading ? 'Analizando…' : 'Vista previa'}
                </button>
                <button
                  type="button"
                  className="admin-tardanzas-btn admin-tardanzas-btn--primary"
                  disabled={!archivo || !preview || importLoading}
                  onClick={confirmarImport}
                >
                  {importLoading ? 'Importando…' : 'Confirmar importación'}
                </button>
              </div>

              {preview && (
                <div className="admin-tardanzas-preview">
                  <div className="admin-tardanzas-kpis">
                    <div className="admin-tardanzas-kpi admin-tardanzas-kpi--ok">
                      <strong>{preview.resumen.coincidencias}</strong>
                      <span>A importar</span>
                    </div>
                    <div className="admin-tardanzas-kpi">
                      <strong>{preview.resumen.nuevos}</strong>
                      <span>Nuevos</span>
                    </div>
                    <div className="admin-tardanzas-kpi">
                      <strong>{preview.resumen.actualizados}</strong>
                      <span>Actualizar</span>
                    </div>
                    <div className="admin-tardanzas-kpi admin-tardanzas-kpi--warn">
                      <strong>{preview.resumen.sin_coincidencia}</strong>
                      <span>Sin match</span>
                    </div>
                    <div className="admin-tardanzas-kpi admin-tardanzas-kpi--warn">
                      <strong>{preview.resumen.sin_usuario}</strong>
                      <span>Sin usuario</span>
                    </div>
                  </div>
                  {preview.sin_coincidencia?.length > 0 && (
                    <div className="admin-tardanzas-warn-list">
                      <strong>Sin coincidencia en el sistema:</strong>
                      <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.1rem' }}>
                        {preview.sin_coincidencia.slice(0, 15).map((s, i) => (
                          <li key={`${s.last_name}-${s.first_name}-${s.fecha}-${i}`}>
                            {s.last_name}, {s.first_name} — {fmtFecha(s.fecha)} {s.hora_marcacion_fmt}
                          </li>
                        ))}
                        {preview.sin_coincidencia.length > 15 && (
                          <li>… y {preview.sin_coincidencia.length - 15} más</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="admin-tardanzas-toolbar" aria-label="Filtros">
              <label>
                Persona
                <select value={personalId} onChange={(e) => setPersonalId(e.target.value)}>
                  <option value="">Todos</option>
                  {(meta?.personal || []).map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Desde
                <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
              </label>
              <label>
                Hasta
                <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
              </label>
              <button
                type="button"
                className="admin-tardanzas-btn admin-tardanzas-btn--primary"
                onClick={loadLista}
                disabled={listaLoading}
              >
                {listaLoading ? '…' : 'Buscar'}
              </button>
              {puedeMutarRegistros && (
              <>
              <button
                type="button"
                className="admin-tardanzas-lock-btn"
                title="Ajustar horario (día, personal, entrada y salida)"
                aria-label="Ajustar horario"
                disabled={rowActionId != null}
                onClick={ajustarHorarioDesdeToolbar}
              >
                🔒
              </button>
              <button
                type="button"
                className="admin-tardanzas-lock-btn admin-tardanzas-lock-btn--quitar"
                title="Quitar registro (día y personal)"
                aria-label="Quitar registro"
                disabled={rowActionId != null}
                onClick={quitarRegistroDesdeToolbar}
              >
                ✖️
              </button>
              <button
                type="button"
                className="admin-tardanzas-lock-btn admin-tardanzas-lock-btn--add"
                title="Agregar ingreso"
                aria-label="Agregar ingreso"
                onClick={agregarIngresoManual}
              >
                +
              </button>
              </>
              )}
              <button
                type="button"
                className="admin-tardanzas-btn admin-tardanzas-btn--hoy"
                title="Ver solo el día de hoy"
                onClick={() => {
                  const hoy = hoyLimaISO();
                  setPersonalId('');
                  setDesde(hoy);
                  setHasta(hoy);
                  loadLista({ personal_id: '', desde: hoy, hasta: hoy });
                }}
              >
                <IconHoy />
                Solo hoy
              </button>
              <span className="admin-tardanzas-toolbar__sep" aria-hidden="true" />
              <button
                type="button"
                className="admin-tardanzas-lock-btn admin-tardanzas-lock-btn--excel"
                title="Exportar Excel"
                aria-label="Exportar Excel"
                onClick={exportExcel}
                disabled={exportLoading || !lista?.filas?.length}
              >
                {exportLoading ? '…' : <IconExcel />}
              </button>
              <button
                type="button"
                className="admin-tardanzas-lock-btn admin-tardanzas-lock-btn--pdf"
                title="Exportar PDF"
                aria-label="Exportar PDF"
                onClick={exportPdf}
                disabled={!lista?.filas?.length}
              >
                <IconPdf />
              </button>
            </section>

            <p className="admin-tardanzas-meta">
              Mostrando: {filtroEtiqueta}
              {lista ? ` · ${lista.total_registros} registro(s)` : ''}
            </p>

            <div className="admin-tardanzas-table-wrap">
              {listaLoading ? (
                <p className="admin-tardanzas-empty">Cargando…</p>
              ) : !lista?.filas?.length ? (
                <p className="admin-tardanzas-empty">
                  No hay registros. Importe un Excel del huellero o ajuste los filtros.
                </p>
              ) : (
                <>
                  <table className="admin-tardanzas-table">
                    <thead>
                      <tr>
                        <th>Personal</th>
                        <th>Fecha</th>
                        <th>Hora entrada real</th>
                        <th>Hora marcación</th>
                        <th>Min. tarde</th>
                        <th>Descuento</th>
                        <th>Hora salida</th>
                        <th>Detalle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lista.filas.map((f) => (
                        <tr key={f.id}>
                          <td className="col-personal">{f.personal_nombre}</td>
                          <td>{fmtFecha(f.fecha)}</td>
                          <td>{f.hora_entrada_real_fmt}</td>
                          <td>{f.hora_marcacion_fmt}</td>
                          <td>{f.minutos_tardanza > 0 ? f.minutos_tardanza : '—'}</td>
                          <td
                            className={
                              f.descuento > 0 ? 'col-descuento' : 'col-descuento col-descuento--cero'
                            }
                          >
                            {f.descuento > 0 ? fmtSoles(f.descuento) : '—'}
                          </td>
                          <td>
                            {f.hora_salida_fmt && f.hora_salida_fmt !== '—'
                              ? f.hora_salida_fmt
                              : '—'}
                          </td>
                          <td className="col-detalle" title={f.motivo || ''}>{f.motivo || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="admin-tardanzas-total">
                    <span className="admin-tardanzas-total__label">Total descuento</span>
                    <span className="admin-tardanzas-total__value">{fmtSoles(lista.total_descuento)}</span>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
