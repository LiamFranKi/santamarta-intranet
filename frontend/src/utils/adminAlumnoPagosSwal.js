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

function buildPanelHtml(m, opts = {}) {
  const { panelId, display = 'block', mode = 'historial' } = opts;
  const idAttr = panelId != null && panelId !== '' ? ` id="${String(panelId)}"` : '';
  const esLista = mode === 'lista';
  const bannerTexto = esLista
    ? 'La información es referencial según el costo tarifario registrado para esta matrícula (lista de pagos de la matrícula actual).'
    : 'La información es referencial y corresponde al historial registrado para esta matrícula.';
  const bannerStyle = esLista
    ? 'background:#ecfdf5;border:1px solid #6ee7b7;color:#065f46;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:600;margin-bottom:10px'
    : 'background:#e0f2fe;border:1px solid #7dd3fc;color:#0c4a6e;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:600;margin-bottom:10px';
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

  return `<section${idAttr} class="admin-pagos-panel${esLista ? ' admin-pagos-panel--lista' : ''}" style="display:${display};margin-top:12px">
    <div style="${bannerStyle}">
      ${esc(bannerTexto)}
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
        mode: 'historial',
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
    title: 'Lista de pagos',
    width: 1200,
    showCloseButton: true,
    showConfirmButton: false,
    html: `<div style="text-align:left">
      <p style="margin:0 0 4px;color:#111827;font-size:15px;font-weight:700">${esc(nombreAlumno)}</p>
      <p style="margin:0 0 14px;color:#6b7280;font-size:13px;font-weight:500">${esc(sub)}</p>
      ${buildPanelHtml(m, { mode: 'lista' })}
    </div>`,
    didOpen: () => bindBoletaButtons(),
  });
}

/** @deprecated Usar showListaPagosMatriculaSwal; nombre antiguo confundía con historial global */
export function showHistorialPagosUnaMatriculaSwal(nombreAlumno, m) {
  return showListaPagosMatriculaSwal(nombreAlumno, m);
}
