import Swal from 'sweetalert2';

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
  const raw = p.descripcion != null ? String(p.descripcion).trim() : '';
  if (raw) return raw;
  return labelEstadoPagoDisplay(p.estado_pago);
}

function lineaObservacionesPago(p) {
  const raw = p.observaciones != null ? String(p.observaciones).trim() : '';
  return raw;
}

/**
 * Vista «Lista de pagos» (una matrícula): columnas alineadas al legado — tipo, monto+mora, descripción, fecha/hora+cancelado, opciones.
 */
function buildListaPagosPanelHtml(m) {
  const totalOtros = Number(m.total_otros);
  const otrosSafe = Number.isFinite(totalOtros) ? totalOtros : 0;
  const pagos = Array.isArray(m.pagos) ? m.pagos : [];

  const filas = pagos.map((p) => {
    const moraFila = parseFloat(p.mora || 0);
    const tieneId = p.id != null;
    const chk = tieneId
      ? `<input type="checkbox" class="admin-pagos-row-checkbox" value="${esc(String(p.id))}" aria-label="Seleccionar pago" />`
      : '<input type="checkbox" disabled title="Sin registro en base de datos" aria-label="Sin pago" />';

    const obsTxt = lineaObservacionesPago(p);
    const descObs = obsTxt
      ? `<div class="admin-pagos-lista-desc-obs">Observaciones: ${esc(obsTxt)}</div>`
      : '';

    const fechaBlock = `<span class="admin-pagos-lista-fecha-prin">${esc(fmtFechaHoraLista(p.fecha_hora))}</span>${
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

    return `<tr>
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

  return `<section class="admin-pagos-lista-root">
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

  popup.querySelector('.admin-pagos-btn-registrar')?.addEventListener('click', () => {
    Swal.fire({ icon: 'info', title: 'Registrar nuevo', text: 'Esta acción estará disponible próximamente.' });
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
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = item.getAttribute('data-action');
      const pagoId = item.getAttribute('data-pago-id');
      closeAllOpcionesMenus(popup);
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
export function showListaPagosMatriculaSwal(nombreAlumno, m) {
  const sub = m.grupo_texto || `${m.anio || '—'} · ${m.grado || '—'}° ${m.seccion || ''}`;
  Swal.fire({
    title: 'Lista de Pagos',
    width: 1180,
    showCloseButton: true,
    showConfirmButton: false,
    html: `<div class="admin-pagos-lista-swalc">
      <p class="admin-pagos-lista-alumno">${esc(nombreAlumno)}</p>
      <p class="admin-pagos-lista-grupo">${esc(sub)}</p>
      ${buildListaPagosPanelHtml(m)}
    </div>`,
    didOpen: () => bindListaPagosUi(),
  });
}

/** @deprecated Usar showListaPagosMatriculaSwal; nombre antiguo confundía con historial global */
export function showHistorialPagosUnaMatriculaSwal(nombreAlumno, m) {
  return showListaPagosMatriculaSwal(nombreAlumno, m);
}
