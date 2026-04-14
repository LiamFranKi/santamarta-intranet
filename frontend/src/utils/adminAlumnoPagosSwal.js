import Swal from 'sweetalert2';
import api from '../services/api';

/** Último payload de lista de pagos por matrícula (para combo de meses al registrar). */
const listaPagosMatriculaContext = new Map();

/**
 * Valores iniciales para un registro NUEVO de pago (fecha/hora local y fecha cancelado = hoy).
 * Usar al abrir el formulario tipo legado (Registrar Nuevo).
 */
export function getDefaultsRegistroPagoNuevo(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const y = now.getFullYear();
  const mo = pad(now.getMonth() + 1);
  const day = pad(now.getDate());
  const h = pad(now.getHours());
  const mi = pad(now.getMinutes());
  return {
    /** Valor para input `datetime-local` */
    fechaHoraDatetimeLocal: `${y}-${mo}-${day}T${h}:${mi}`,
    /** Valor para input `date` (fecha cancelado cuando el pago está cobrado) */
    fechaCanceladoDate: `${y}-${mo}-${day}`,
  };
}

function parseDatetimeLocalToApi(fechaHoraLocal) {
  const s = String(fechaHoraLocal || '').trim();
  if (!s) return '';
  const normalized = s.length === 16 ? `${s}:00` : s;
  return normalized.replace('T', ' ');
}

/** Respaldo si `fecha_hora` llega como ISO en JSON y `fecha_hora_local` no vino en el DTO. */
function normalizeFechaHoraForDatetimeLocal(raw) {
  if (raw == null || raw === '') return '';
  const s = String(raw).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/);
  if (m) return `${m[1]}T${m[2]}:${m[3]}`;
  return '';
}

function normalizeFechaForDateInput(raw) {
  if (raw == null || raw === '') return '';
  const s = String(raw).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  return '';
}

/** Opciones `<option>` para mes de pensión (nro_pago + etiqueta desde API). */
function buildPensionMesOptionsHtml(opciones, selectedNro) {
  if (!Array.isArray(opciones) || opciones.length === 0) {
    return '<option value="">Sin meses configurados</option>';
  }
  return opciones
    .map((o) => {
      const nro = o.nro_pago;
      const sel =
        selectedNro != null && String(selectedNro) === String(nro) ? ' selected' : '';
      return `<option value="${esc(String(nro))}"${sel}>${esc(
        o.mes_label != null ? String(o.mes_label) : `Cuota ${nro}`
      )}</option>`;
    })
    .join('');
}

function labelTipoPago(tipo) {
  const t = Number(tipo);
  if (t === 0) return 'Matrícula';
  if (t === 1) return 'Pensión';
  return `Tipo ${tipo}`;
}

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtMonto(n) {
  const x = parseFloat(n);
  return Number.isFinite(x) ? `S/ ${x.toFixed(2)}` : '—';
}

function fmtFecha(val) {
  if (!val) return '—';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-PE', { dateStyle: 'short' });
}

function fmtFechaHoraLista(val) {
  if (!val) return '—';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function labelEstadoPagoDisplay(estado) {
  const s = String(estado || '').toUpperCase();
  if (s === 'CANCELADO') return 'PAGO CANCELADO';
  if (s === 'PENDIENTE') return 'PENDIENTE';
  if (!s) return '—';
  return String(estado);
}

function fmtCanceladoLine(val) {
  if (val == null || val === '') return '';
  const s = String(val).trim();
  const d = s.length >= 10 ? s.slice(0, 10) : s;
  return `Cancelado: ${d}`;
}

/** Texto principal columna DESCRIPCIÓN: campo `descripcion` (BD); si vacío, estado (PAGO CANCELADO / PENDIENTE). */
function lineaPrincipalDescripcionPago(p) {
  if (String(p.estado_pago || '').toUpperCase() === 'PENDIENTE') {
    return labelEstadoPagoDisplay('PENDIENTE');
  }
  const raw = p.descripcion != null ? String(p.descripcion).trim() : '';
  if (raw) return raw;
  return labelEstadoPagoDisplay(p.estado_pago);
}

function lineaObservacionesPago(p) {
  if (String(p.estado_pago || '').toUpperCase() === 'PENDIENTE') return '';
  const raw = p.observaciones != null ? String(p.observaciones).trim() : '';
  return raw;
}

/**
 * Vista «Lista de pagos» (una matrícula): columnas alineadas al legado — tipo, monto+mora, descripción, fecha/hora+cancelado, opciones.
 */
function buildListaPagosPanelHtml(m, ctx = {}) {
  const { alumnoId } = ctx;
  const dataAlumno = alumnoId != null ? ` data-alumno-id="${esc(String(alumnoId))}"` : '';
  const dataMatricula =
    m.matricula_id != null ? ` data-matricula-id="${esc(String(m.matricula_id))}"` : '';
  const totalOtros = Number(m.total_otros);
  const otrosSafe = Number.isFinite(totalOtros) ? totalOtros : 0;
  const pagos = Array.isArray(m.pagos) ? m.pagos : [];

  const filas = pagos.map((p) => {
    const moraFila = parseFloat(p.mora || 0);
    const tieneId = p.id != null;
    const esPendiente = String(p.estado_pago || '').toUpperCase() === 'PENDIENTE';
    const trClass = esPendiente ? 'admin-pagos-lista-tr admin-pagos-lista-tr--pendiente' : 'admin-pagos-lista-tr';
    const chk = tieneId
      ? `<input type="checkbox" class="admin-pagos-row-checkbox" value="${esc(String(p.id))}" aria-label="Seleccionar pago" />`
      : '<input type="checkbox" disabled title="Sin registro en base de datos" aria-label="Sin pago" />';

    const obsTxt = lineaObservacionesPago(p);
    const descObs = obsTxt
      ? `<div class="admin-pagos-lista-desc-obs">Observaciones: ${esc(obsTxt)}</div>`
      : '';

    const fechaBlock = esPendiente
      ? '<span class="admin-pagos-lista-fecha-prin">—</span>'
      : `<span class="admin-pagos-lista-fecha-prin">${esc(fmtFechaHoraLista(p.fecha_hora))}</span>${
          p.fecha_cancelado
            ? `<div class="admin-pagos-lista-fecha-cancel">${esc(fmtCanceladoLine(p.fecha_cancelado))}</div>`
            : ''
        }`;

    const menuItems = tieneId
      ? `<div class="admin-pagos-opciones-menu" role="menu" aria-hidden="true">
          <button type="button" class="admin-pagos-opcion-item" data-action="impresiones" data-pago-id="${esc(String(p.id))}"><span class="admin-pagos-opcion-ico" aria-hidden>🖨</span><span>Impresiones</span></button>
          <button type="button" class="admin-pagos-opcion-item" data-action="boleta_externa" data-pago-id="${esc(String(p.id))}"><span class="admin-pagos-opcion-ico" aria-hidden>🖨</span><span>Imprimir Boleta Externa</span></button>
          <button type="button" class="admin-pagos-opcion-item" data-action="editar" data-pago-id="${esc(String(p.id))}"><span class="admin-pagos-opcion-ico" aria-hidden>✏️</span><span>Editar Pago</span></button>
          <button type="button" class="admin-pagos-opcion-item admin-pagos-opcion-item--danger" data-action="anular" data-pago-id="${esc(String(p.id))}"><span class="admin-pagos-opcion-ico" aria-hidden>⛔</span><span>Anular Pago</span></button>
          <button type="button" class="admin-pagos-opcion-item admin-pagos-opcion-item--danger" data-action="borrar" data-pago-id="${esc(String(p.id))}"><span class="admin-pagos-opcion-ico" aria-hidden>🗑️</span><span>Borrar Pago</span></button>
        </div>`
      : '';

    const btnOpciones = tieneId
      ? `<button type="button" class="admin-pagos-opciones-btn">Opciones ▾</button>`
      : `<button type="button" class="admin-pagos-opciones-btn" disabled style="opacity:0.45;cursor:not-allowed">Opciones ▾</button>`;

    return `<tr class="${trClass}">
      <td class="admin-pagos-lista-td">${chk}</td>
      <td class="admin-pagos-lista-td admin-pagos-lista-td--tipo">${esc(p.tipo_descripcion || labelTipoPago(p.tipo || ''))}</td>
      <td class="admin-pagos-lista-td">
        <div>${esc(fmtMonto(p.monto))}</div>
        ${moraFila > 0 ? `<div class="admin-pagos-lista-mora-fila">Mora: ${esc(fmtMonto(moraFila))}</div>` : ''}
      </td>
      <td class="admin-pagos-lista-td">
        <div class="admin-pagos-lista-desc-stack">
          <div class="admin-pagos-lista-desc-prin">${esc(lineaPrincipalDescripcionPago(p))}</div>
          ${descObs}
        </div>
      </td>
      <td class="admin-pagos-lista-td admin-pagos-lista-td--fecha">${fechaBlock}</td>
      <td class="admin-pagos-lista-td">
        <div class="admin-pagos-opciones-wrap">${btnOpciones}${menuItems}</div>
      </td>
    </tr>`;
  }).join('');

  const moraTotalNum = parseFloat(m.total_mora_pagada || 0);
  const moraTotalLinea =
    Number.isFinite(moraTotalNum) && moraTotalNum > 0
      ? `<div class="admin-pagos-lista-total-mora">Mora: ${esc(fmtMonto(moraTotalNum))}</div>`
      : '';

  return `<section class="admin-pagos-lista-root"${dataAlumno}${dataMatricula}>
    <div class="admin-pagos-lista-toolbar">
      <button type="button" class="admin-pagos-btn-registrar">+ Registrar Nuevo</button>
      <button type="button" class="admin-pagos-btn-imprimir">🖨 Imprimir Seleccionados</button>
    </div>
    <div class="admin-pagos-lista-banner">
      La información es referencial que se calcula a partir del costo seleccionado al momento de registrar la matrícula.
    </div>
    <div class="admin-pagos-lista-totales">
      <div class="admin-pagos-lista-total-card">
        <div class="admin-pagos-lista-total-label">MONTO A PAGAR S/.</div>
        <div class="admin-pagos-lista-total-val">${esc(fmtMonto(m.total_pagar))}</div>
      </div>
      <div class="admin-pagos-lista-total-card admin-pagos-lista-total-card--ok">
        <div class="admin-pagos-lista-total-label">MONTO PAGADO S/.</div>
        <div class="admin-pagos-lista-total-val">${esc(fmtMonto(m.total_pagado))}</div>
        ${moraTotalLinea}
      </div>
      <div class="admin-pagos-lista-total-card admin-pagos-lista-total-card--warn">
        <div class="admin-pagos-lista-total-label">MONTO QUE ADEUDA S/.</div>
        <div class="admin-pagos-lista-total-val" style="color:${Number(m.total_pendiente || 0) > 0 ? '#b45309' : '#047857'}">${esc(fmtMonto(m.total_pendiente))}</div>
      </div>
      <div class="admin-pagos-lista-total-card">
        <div class="admin-pagos-lista-total-label">OTROS PAGOS S/.</div>
        <div class="admin-pagos-lista-total-val">${esc(fmtMonto(otrosSafe))}</div>
      </div>
    </div>
    <div class="admin-pagos-lista-table-wrap">
      <table class="admin-pagos-lista-table">
        <thead>
          <tr>
            <th style="width:36px"></th>
            <th>TIPO DE PAGO</th>
            <th>MONTO</th>
            <th>DESCRIPCIÓN</th>
            <th>FECHA - HORA</th>
            <th style="width:120px">OPCIONES</th>
          </tr>
        </thead>
        <tbody>
          ${filas || `<tr><td colspan="6" style="padding:20px;text-align:center;color:#6b7280">Sin filas</td></tr>`}
        </tbody>
      </table>
    </div>
  </section>`;
}

function buildPanelHtml(m, opts = {}) {
  const { panelId, display = 'block' } = opts;
  const idAttr = panelId != null && panelId !== '' ? ` id="${String(panelId)}"` : '';
  const moraHist = parseFloat(m.total_mora_pagada || 0);
  const moraHistorialLinea =
    Number.isFinite(moraHist) && moraHist > 0
      ? `<div style="margin-top:2px;font-size:12px;color:#6d28d9;font-weight:600">Mora: ${esc(fmtMonto(moraHist))}</div>`
      : '';
  const pagos = Array.isArray(m.pagos) ? m.pagos : [];
  const filas = pagos.map((p) => {
    const nroOperacion = [p.nro_movimiento_banco, p.nro_movimiento_importado].filter(Boolean).join(' | ') || '—';
    const serieNumero = p.boleta?.serie_numero || '—';
    const moraFila = parseFloat(p.mora || 0);
    return `<tr>
      <td style="padding:8px;border-bottom:1px solid #eef2f7;white-space:nowrap;text-align:center;vertical-align:middle">${esc(p.tipo_descripcion || labelTipoPago(p.tipo || ''))}</td>
      <td style="padding:8px;border-bottom:1px solid #eef2f7;white-space:nowrap;text-align:center;vertical-align:middle">
        <div>${esc(fmtMonto(p.monto))}</div>
        ${moraFila > 0 ? `<div style="font-size:11px;color:#6d28d9;font-weight:600">Mora: ${esc(fmtMonto(moraFila))}</div>` : ''}
      </td>
      <td style="padding:8px;border-bottom:1px solid #eef2f7;white-space:nowrap;text-align:center;vertical-align:middle">${esc(fmtFecha(p.fecha_hora))}</td>
      <td style="padding:8px;border-bottom:1px solid #eef2f7;white-space:nowrap;text-align:center;vertical-align:middle">${esc(nroOperacion)}</td>
      <td style="padding:8px;border-bottom:1px solid #eef2f7;white-space:nowrap;text-align:center;vertical-align:middle">${esc(serieNumero)}</td>
      <td style="padding:8px;border-bottom:1px solid #eef2f7;white-space:nowrap;text-align:center;vertical-align:middle">${esc(fmtFecha(p.boleta?.fecha_impresion))}</td>
      <td style="padding:8px;border-bottom:1px solid #eef2f7;white-space:nowrap;text-align:center;vertical-align:middle">${esc(fmtFecha(p.fecha_cancelado))}</td>
    </tr>`;
  }).join('');

  return `<section${idAttr} class="admin-pagos-panel" style="display:${display};margin-top:12px">
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
        ${moraHistorialLinea}
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
}

/**
 * Modal «Registrar» / «Editar» pago (mismo formulario que el legado).
 * @param {object} [pagosMatricula] Respuesta de GET …/pagos (incluye `pension_meses_opciones`).
 * @param {number} [editPagoId] Si se indica, carga el pago y guarda con PUT.
 */
async function openPagoFormSwal({ nombreAlumno, alumnoId, matriculaId, pagosMatricula, editPagoId }) {
  let pm = pagosMatricula;
  let pagoEdit = null;

  if (editPagoId) {
    try {
      Swal.fire({ title: 'Cargando pago...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      const { data } = await api.get(
        `/admin/usuarios/alumnos/${alumnoId}/matriculas/${matriculaId}/pagos/${editPagoId}`
      );
      Swal.close();
      pagoEdit = data?.data?.pago;
      const opc = data?.data?.pension_meses_opciones;
      if (Array.isArray(opc) && opc.length) {
        pm = { ...(pm || {}), pension_meses_opciones: opc };
      }
      if (!pagoEdit) {
        await Swal.fire({ icon: 'error', text: 'No se encontró el pago.' });
        return false;
      }
      if (String(pagoEdit.pago_registro_estado || '').toUpperCase() !== 'ACTIVO') {
        await Swal.fire({
          icon: 'warning',
          title: 'No se puede editar',
          text: 'Este pago está anulado. Use las acciones correspondientes en el menú.',
        });
        return false;
      }
    } catch (e) {
      Swal.close();
      await Swal.fire({
        icon: 'error',
        text: e.response?.data?.error || e.message || 'Error al cargar el pago',
      });
      return false;
    }
  } else if (!pm?.pension_meses_opciones?.length && alumnoId && matriculaId) {
    try {
      const { data } = await api.get(`/admin/usuarios/alumnos/${alumnoId}/matriculas/${matriculaId}/pagos`);
      if (data?.data) pm = data.data;
    } catch (e) {
      /* sin opciones de mes */
    }
  }

  const defs = getDefaultsRegistroPagoNuevo();
  const mesSelectedNro =
    pagoEdit && Number(pagoEdit.tipo) === 1 ? pagoEdit.nro_pago : undefined;
  const mesOpts = buildPensionMesOptionsHtml(pm?.pension_meses_opciones, mesSelectedNro);

  const formaVal = pagoEdit ? String(pagoEdit.forma_pago || 'EFECTIVO').toUpperCase() : 'EFECTIVO';
  const FORMAS = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'YAPE'];
  const formaOpts = FORMAS.map(
    (f) => `<option value="${f}"${f === formaVal ? ' selected' : ''}>${f}</option>`
  ).join('');

  const tipoVal = pagoEdit != null ? String(Number(pagoEdit.tipo)) : '0';
  const tipoOpts = [
    ['0', 'Matrícula'],
    ['1', 'Pensión'],
    ['2', 'Otro / varios'],
  ]
    .map(([v, l]) => `<option value="${v}"${v === tipoVal ? ' selected' : ''}>${l}</option>`)
    .join('');

  const estadoVal =
    pagoEdit != null ? String(pagoEdit.estado_pago || 'CANCELADO').toUpperCase() : 'CANCELADO';
  const estadoCancelSel = estadoVal === 'CANCELADO' ? ' selected' : '';
  const estadoPendSel = estadoVal === 'PENDIENTE' ? ' selected' : '';

  let fechaHoraVal = defs.fechaHoraDatetimeLocal;
  let fechaCancelVal = defs.fechaCanceladoDate;
  if (pagoEdit) {
    const fh =
      pagoEdit.fecha_hora_local ||
      normalizeFechaHoraForDatetimeLocal(pagoEdit.fecha_hora);
    const fc =
      pagoEdit.fecha_cancelado_date || normalizeFechaForDateInput(pagoEdit.fecha_cancelado);
    fechaHoraVal = fh || defs.fechaHoraDatetimeLocal;
    fechaCancelVal = fc || defs.fechaCanceladoDate;
  }

  const montoInputAttrs =
    pagoEdit != null && pagoEdit.monto != null && pagoEdit.monto !== ''
      ? ` value="${esc(String(pagoEdit.monto))}"`
      : '';
  const moraInputAttrs =
    pagoEdit != null
      ? ` value="${esc(String(pagoEdit.mora ?? 0))}"`
      : ' value="0"';
  const descInputAttrs =
    pagoEdit != null ? ` value="${esc(String(pagoEdit.descripcion ?? ''))}"` : '';
  const obsInputAttrs =
    pagoEdit != null ? ` value="${esc(String(pagoEdit.observaciones ?? ''))}"` : '';

  const title = editPagoId ? 'Editar pago' : 'Registrar pago';

  const html = `
    <div class="admin-pagos-reg-form">
      <p class="admin-pagos-reg-alumno">${esc(nombreAlumno)}</p>
      <div class="admin-pagos-reg-card">
        <div class="admin-pagos-reg-grid">
          <div class="admin-pagos-reg-field">
            <label class="admin-pagos-reg-label" for="admin-pago-monto">Monto (S/) <span class="admin-pagos-reg-req">*</span></label>
            <input type="number" id="admin-pago-monto" class="admin-pagos-reg-input" step="0.01" min="0" placeholder="0.00"${montoInputAttrs} />
          </div>
          <div class="admin-pagos-reg-field">
            <label class="admin-pagos-reg-label" for="admin-pago-mora">Mora (S/)</label>
            <input type="number" id="admin-pago-mora" class="admin-pagos-reg-input" step="0.01" min="0"${moraInputAttrs} />
          </div>
          <div class="admin-pagos-reg-field">
            <label class="admin-pagos-reg-label" for="admin-pago-tipo">Tipo de pago <span class="admin-pagos-reg-req">*</span></label>
            <select id="admin-pago-tipo" class="admin-pagos-reg-input admin-pagos-reg-select">${tipoOpts}</select>
          </div>
          <div class="admin-pagos-reg-field" id="admin-pago-col-mes">
            <div id="admin-pago-mes-active" class="admin-pago-mes-active" style="display:none">
              <label class="admin-pagos-reg-label" for="admin-pago-mes-nro">Mes de pensión <span class="admin-pagos-reg-req">*</span></label>
              <select id="admin-pago-mes-nro" class="admin-pagos-reg-input admin-pagos-reg-select">${mesOpts}</select>
            </div>
            <div id="admin-pago-mes-spacer" class="admin-pagos-reg-mes-spacer" aria-hidden="true"></div>
          </div>
          <div class="admin-pagos-reg-field">
            <label class="admin-pagos-reg-label" for="admin-pago-forma">Forma de pago</label>
            <select id="admin-pago-forma" class="admin-pagos-reg-input admin-pagos-reg-select">${formaOpts}</select>
          </div>
          <div class="admin-pagos-reg-field">
            <label class="admin-pagos-reg-label" for="admin-pago-fecha-hora">Fecha y hora <span id="admin-pago-fecha-hora-req" class="admin-pagos-reg-req">*</span></label>
            <input type="datetime-local" id="admin-pago-fecha-hora" class="admin-pagos-reg-input" value="${esc(fechaHoraVal)}" />
          </div>
          <div class="admin-pagos-reg-field admin-pagos-reg-field--full">
            <label class="admin-pagos-reg-label" for="admin-pago-desc">Descripción</label>
            <input type="text" id="admin-pago-desc" class="admin-pagos-reg-input" placeholder="Opcional"${descInputAttrs} />
          </div>
          <div class="admin-pagos-reg-field admin-pagos-reg-field--full">
            <label class="admin-pagos-reg-label" for="admin-pago-obs">Observaciones</label>
            <input type="text" id="admin-pago-obs" class="admin-pagos-reg-input" placeholder="Opcional"${obsInputAttrs} />
          </div>
          <div class="admin-pagos-reg-estado-wrap admin-pagos-reg-field--full" id="admin-pago-estado-wrap">
            <div class="admin-pagos-reg-field admin-pagos-reg-field--grow">
              <label class="admin-pagos-reg-label" for="admin-pago-estado">Estado pago <span class="admin-pagos-reg-req">*</span></label>
              <select id="admin-pago-estado" class="admin-pagos-reg-input admin-pagos-reg-select">
                <option value="CANCELADO"${estadoCancelSel}>Pagado (CANCELADO)</option>
                <option value="PENDIENTE"${estadoPendSel}>Pendiente</option>
              </select>
            </div>
            <div class="admin-pagos-reg-field admin-pagos-reg-field--grow" id="admin-pago-row-fecha-cancel">
              <label class="admin-pagos-reg-label" for="admin-pago-fecha-cancel">Fecha cancelado <span id="admin-pago-fecha-cancel-req" class="admin-pagos-reg-req">*</span></label>
              <input type="date" id="admin-pago-fecha-cancel" class="admin-pagos-reg-input" value="${esc(fechaCancelVal)}" />
            </div>
          </div>
        </div>
      </div>
    </div>`;

  const result = await Swal.fire({
    title,
    html,
    width: 560,
    showCancelButton: true,
    confirmButtonText: 'Guardar',
    cancelButtonText: 'Volver',
    focusConfirm: false,
    customClass: {
      popup: 'admin-pagos-reg-swal-popup',
      title: 'admin-pagos-reg-swal-title',
      confirmButton: 'admin-pagos-reg-swal-confirm',
      cancelButton: 'admin-pagos-reg-swal-cancel',
      htmlContainer: 'admin-pagos-reg-swal-html',
    },
    didOpen: () => {
      const popup = Swal.getPopup();
      if (!popup) return;
      const tipo = popup.querySelector('#admin-pago-tipo');
      const mesActive = popup.querySelector('#admin-pago-mes-active');
      const mesSpacer = popup.querySelector('#admin-pago-mes-spacer');
      const estado = popup.querySelector('#admin-pago-estado');
      const rowCancel = popup.querySelector('#admin-pago-row-fecha-cancel');
      const inpCancel = popup.querySelector('#admin-pago-fecha-cancel');
      const syncTipoNro = () => {
        const t = tipo?.value;
        const showMes = t === '1';
        if (mesActive) mesActive.style.display = showMes ? '' : 'none';
        if (mesSpacer) mesSpacer.style.display = showMes ? 'none' : '';
      };
      const estadoWrap = popup.querySelector('#admin-pago-estado-wrap');
      const reqFh = popup.querySelector('#admin-pago-fecha-hora-req');
      const reqFc = popup.querySelector('#admin-pago-fecha-cancel-req');
      const inpFh = popup.querySelector('#admin-pago-fecha-hora');
      const syncEstadoFecha = () => {
        const pend = estado?.value === 'PENDIENTE';
        if (rowCancel) rowCancel.style.display = pend ? 'none' : '';
        if (estadoWrap) estadoWrap.classList.toggle('admin-pagos-reg-estado-wrap--solo', Boolean(pend));
        if (reqFh) reqFh.style.display = pend ? 'none' : '';
        if (reqFc) reqFc.style.display = pend ? 'none' : '';
        if (pend && inpCancel) inpCancel.value = '';
        if (!pend && inpCancel && !String(inpCancel.value || '').trim()) {
          inpCancel.value = getDefaultsRegistroPagoNuevo().fechaCanceladoDate;
        }
      };
      tipo?.addEventListener('change', syncTipoNro);
      estado?.addEventListener('change', syncEstadoFecha);
      syncTipoNro();
      syncEstadoFecha();
      if (estado?.value === 'CANCELADO' && inpCancel && !String(inpCancel.value || '').trim()) {
        inpCancel.value = getDefaultsRegistroPagoNuevo().fechaCanceladoDate;
      }
      popup.querySelector('#admin-pago-monto')?.focus();
    },
    preConfirm: async () => {
      const popup = Swal.getPopup();
      const monto = parseFloat(popup.querySelector('#admin-pago-monto')?.value);
      const mora = parseFloat(popup.querySelector('#admin-pago-mora')?.value || '0');
      const tipoVal = popup.querySelector('#admin-pago-tipo')?.value;
      const nroVal = popup.querySelector('#admin-pago-mes-nro')?.value;
      const fechaHoraRaw = popup.querySelector('#admin-pago-fecha-hora')?.value;
      const fechaHora = String(fechaHoraRaw || '').trim();
      const estadoVal = popup.querySelector('#admin-pago-estado')?.value;
      const fechaCancel = popup.querySelector('#admin-pago-fecha-cancel')?.value;
      if (!Number.isFinite(monto) || monto < 0) {
        Swal.showValidationMessage('Indique un monto válido');
        return false;
      }
      if (estadoVal !== 'PENDIENTE' && !fechaHora) {
        Swal.showValidationMessage('Indique fecha y hora');
        return false;
      }
      if (tipoVal === '1' && (!nroVal || parseInt(nroVal, 10) < 1)) {
        Swal.showValidationMessage('Indique el mes de pensión');
        return false;
      }
      if (estadoVal === 'CANCELADO' && !fechaCancel) {
        Swal.showValidationMessage('Indique fecha cancelado');
        return false;
      }
      try {
        const payload = {
          monto,
          mora: Number.isFinite(mora) && mora >= 0 ? mora : 0,
          tipo: parseInt(tipoVal, 10),
          nro_pago: tipoVal === '1' ? parseInt(nroVal, 10) : 0,
          fecha_hora:
            estadoVal === 'PENDIENTE' && !fechaHora
              ? ''
              : parseDatetimeLocalToApi(fechaHoraRaw),
          descripcion: popup.querySelector('#admin-pago-desc')?.value || '',
          observaciones: popup.querySelector('#admin-pago-obs')?.value || '',
          estado_pago: estadoVal,
          fecha_cancelado: estadoVal === 'CANCELADO' ? fechaCancel : '',
          forma_pago: popup.querySelector('#admin-pago-forma')?.value || 'EFECTIVO',
        };
        const base = `/admin/usuarios/alumnos/${alumnoId}/matriculas/${matriculaId}/pagos`;
        const { data } = editPagoId
          ? await api.put(`${base}/${editPagoId}`, payload)
          : await api.post(base, payload);
        return data;
      } catch (e) {
        Swal.showValidationMessage(e.response?.data?.error || e.message || 'Error al guardar');
        return false;
      }
    },
  });

  return result.isConfirmed && result.value;
}

async function openRegistroPagoNuevoSwal(opts) {
  return openPagoFormSwal({ ...opts, editPagoId: undefined });
}

function bindBoletaButtons() {
  const popup = Swal.getPopup();
  if (!popup) return;
  popup.querySelectorAll('.admin-pagos-boleta-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      window.open('https://sfe.bizlinks.com.pe/sfeperu/public/loginAnonimo.jsf', '_blank', 'noopener,noreferrer');
    });
  });
}

function closeAllOpcionesMenus(popup) {
  popup.querySelectorAll('.admin-pagos-opciones-menu.is-open').forEach((m) => m.classList.remove('is-open'));
}

function bindListaPagosUi() {
  const popup = Swal.getPopup();
  if (!popup) return;

  popup.querySelector('.admin-pagos-btn-registrar')?.addEventListener('click', async () => {
    const root = popup.querySelector('.admin-pagos-lista-root');
    const alumnoIdRaw = root?.getAttribute('data-alumno-id');
    const matriculaIdRaw = root?.getAttribute('data-matricula-id');
    const nombre = popup.querySelector('.admin-pagos-lista-alumno')?.textContent?.trim() || '';
    if (!alumnoIdRaw || !matriculaIdRaw) {
      Swal.fire({
        icon: 'warning',
        title: 'No se puede registrar',
        text: 'Falta identificar alumno o matrícula. Actualice la página e intente de nuevo.',
      });
      return;
    }
    const aid = parseInt(alumnoIdRaw, 10);
    const mid = parseInt(matriculaIdRaw, 10);
    const ctxMat = listaPagosMatriculaContext.get(`${aid}-${mid}`);
    Swal.close();
    await openRegistroPagoNuevoSwal({
      nombreAlumno: nombre,
      alumnoId: aid,
      matriculaId: mid,
      pagosMatricula: ctxMat,
    });
    try {
      const { data } = await api.get(`/admin/usuarios/alumnos/${aid}/matriculas/${mid}/pagos`);
      const fresh = data.data;
      if (fresh) {
        showListaPagosMatriculaSwal(nombre, fresh, { alumnoId: aid });
      }
    } catch (e) {
      Swal.fire({
        icon: 'error',
        text: e.response?.data?.error || 'No se pudo recargar la lista de pagos.',
      });
    }
  });

  popup.querySelector('.admin-pagos-btn-imprimir')?.addEventListener('click', () => {
    const n = popup.querySelectorAll('.admin-pagos-row-checkbox:checked').length;
    if (!n) {
      Swal.fire({ icon: 'info', title: 'Imprimir seleccionados', text: 'Seleccione al menos un pago con el checkbox.' });
      return;
    }
    Swal.fire({ icon: 'info', title: 'Próximamente', text: `Se imprimirían ${n} pago(s) seleccionado(s).` });
  });

  popup.querySelectorAll('.admin-pagos-opciones-menu').forEach((menu) => {
    menu.addEventListener('click', (e) => e.stopPropagation());
  });

  popup.querySelectorAll('.admin-pagos-opciones-btn').forEach((btn) => {
    if (btn.disabled) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const wrap = btn.closest('.admin-pagos-opciones-wrap');
      const menu = wrap?.querySelector('.admin-pagos-opciones-menu');
      if (!menu) return;
      const willOpen = !menu.classList.contains('is-open');
      closeAllOpcionesMenus(popup);
      if (willOpen) menu.classList.add('is-open');
    });
  });

  popup.querySelectorAll('.admin-pagos-opcion-item').forEach((item) => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = item.getAttribute('data-action');
      const pagoId = item.getAttribute('data-pago-id');
      closeAllOpcionesMenus(popup);

      if (action === 'editar' && pagoId) {
        const root = popup.querySelector('.admin-pagos-lista-root');
        const alumnoIdRaw = root?.getAttribute('data-alumno-id');
        const matriculaIdRaw = root?.getAttribute('data-matricula-id');
        const nombre = popup.querySelector('.admin-pagos-lista-alumno')?.textContent?.trim() || '';
        const aid = parseInt(alumnoIdRaw, 10);
        const mid = parseInt(matriculaIdRaw, 10);
        const pid = parseInt(pagoId, 10);
        if (!alumnoIdRaw || !matriculaIdRaw || !Number.isFinite(aid) || !Number.isFinite(mid) || !Number.isFinite(pid)) {
          Swal.fire({
            icon: 'warning',
            title: 'No se puede editar',
            text: 'Falta identificar el pago o la matrícula. Actualice la página e intente de nuevo.',
          });
          return;
        }
        const ctxMat = listaPagosMatriculaContext.get(`${aid}-${mid}`);
        Swal.close();
        await openPagoFormSwal({
          nombreAlumno: nombre,
          alumnoId: aid,
          matriculaId: mid,
          pagosMatricula: ctxMat,
          editPagoId: pid,
        });
        try {
          const { data } = await api.get(`/admin/usuarios/alumnos/${aid}/matriculas/${mid}/pagos`);
          const fresh = data.data;
          if (fresh) {
            showListaPagosMatriculaSwal(nombre, fresh, { alumnoId: aid });
          }
        } catch (err) {
          Swal.fire({
            icon: 'error',
            text: err.response?.data?.error || 'No se pudo recargar la lista de pagos.',
          });
        }
        return;
      }

      const labels = {
        impresiones: 'Impresiones',
        boleta_externa: 'Imprimir Boleta Externa',
        editar: 'Editar Pago',
        anular: 'Anular Pago',
        borrar: 'Borrar Pago',
      };
      Swal.fire({
        icon: 'info',
        title: 'Próximamente',
        text: `«${labels[action] || action}» para el pago #${pagoId || '—'} estará disponible en una siguiente versión.`,
      });
    });
  });

  popup.addEventListener('click', () => closeAllOpcionesMenus(popup));
}

/**
 * Historial de pagos con pestañas por matrícula (vista admin).
 */
export function showHistorialPagosSwal(nombreAlumno, matriculas) {
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

  const panelsHtml = matriculas
    .map((m, i) =>
      buildPanelHtml(m, {
        panelId: `tab-${m.matricula_id}`,
        display: i === 0 ? 'block' : 'none',
      })
    )
    .join('');

  Swal.fire({
    title: `Historial de pagos — ${nombreAlumno}`,
    width: 1200,
    showCloseButton: true,
    showConfirmButton: false,
    html: `<div style="text-align:left">
      <div style="display:flex;gap:8px;overflow:auto;padding-bottom:4px">${tabsHtml}</div>
      ${panelsHtml}
    </div>`,
    didOpen: () => {
      const p = Swal.getPopup();
      if (!p) return;
      const buttons = p.querySelectorAll('.admin-pagos-tab-btn');
      const panels = p.querySelectorAll('.admin-pagos-panel');
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
          panels.forEach((el) => {
            el.style.display = el.id === target ? 'block' : 'none';
          });
        });
      });
      bindBoletaButtons();
    },
  });
}

/**
 * Lista de pagos de una sola matrícula (menú Opciones → Ver pagos). No es el historial global por alumno.
 */
export function showListaPagosMatriculaSwal(nombreAlumno, m, options = {}) {
  const { alumnoId } = options;
  if (alumnoId != null && m?.matricula_id != null) {
    listaPagosMatriculaContext.set(`${alumnoId}-${m.matricula_id}`, m);
  }
  const sub = m.grupo_texto || `${m.anio || '—'} · ${m.grado || '—'}° ${m.seccion || ''}`;
  Swal.fire({
    title: 'Lista de Pagos',
    width: 1180,
    showCloseButton: true,
    showConfirmButton: false,
    html: `<div class="admin-pagos-lista-swalc">
      <p class="admin-pagos-lista-alumno">${esc(nombreAlumno)}</p>
      <p class="admin-pagos-lista-grupo">${esc(sub)}</p>
      ${buildListaPagosPanelHtml(m, { alumnoId })}
    </div>`,
    didOpen: () => bindListaPagosUi(),
  });
}

/** @deprecated Usar showListaPagosMatriculaSwal; nombre antiguo confundía con historial global */
export function showHistorialPagosUnaMatriculaSwal(nombreAlumno, m) {
  return showListaPagosMatriculaSwal(nombreAlumno, m);
}
