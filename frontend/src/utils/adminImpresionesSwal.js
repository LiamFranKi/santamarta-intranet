import Swal from 'sweetalert2';
import api from '../services/api';
import { generarPDFBoletaDesdeDatos, MSG_NO_IMPRESION_BOLETA } from './generarPDFBoletaPago';

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function timeInputFromHora(raw) {
  if (raw == null || raw === '') return '';
  const s = String(raw).trim();
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (!m) return '';
  const h = String(m[1]).padStart(2, '0');
  const mi = m[2];
  return `${h}:${mi}`;
}

/** Cierra submenús y quita `position:fixed` (evita menús huérfanos al recortar por overflow). */
function closeImpresionesMenus(popup) {
  if (!popup) return;
  popup.querySelectorAll('.admin-impresiones-menu').forEach((m) => {
    m.classList.remove('is-open');
    m.style.position = '';
    m.style.top = '';
    m.style.left = '';
    m.style.right = '';
    m.style.zIndex = '';
  });
}

/** Despliega el menú «Opciones» con coordenadas fijas para que no lo recorte el scroll del contenedor tabla. */
/** Aviso dentro del modal Impresiones (no usa otro Swal → no cierra el padre). */
function showImpresionesBanner(root, message, variant = 'info') {
  const prev = root.querySelector('.admin-impresiones-banner');
  if (prev) prev.remove();
  const el = document.createElement('div');
  el.className = `admin-impresiones-banner admin-impresiones-banner--${variant}`;
  el.setAttribute('role', 'status');
  el.textContent = message;
  root.insertBefore(el, root.firstChild);
  window.setTimeout(() => el.remove(), variant === 'error' ? 8000 : 5000);
}

function mountImpresionesOverlay(root, innerHtml) {
  const existing = root.querySelector('.admin-impresiones-inline-backdrop');
  if (existing) existing.remove();
  const backdrop = document.createElement('div');
  backdrop.className = 'admin-impresiones-inline-backdrop';
  backdrop.innerHTML = innerHtml;
  root.appendChild(backdrop);
  const close = () => {
    backdrop.remove();
  };
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  return { backdrop, close };
}

function placeImpresionesOpcionesMenu(btn, menu) {
  const run = () => {
    const rect = btn.getBoundingClientRect();
    const mw = Math.max(menu.offsetWidth, 230);
    const mh = menu.offsetHeight || 200;
    const pad = 8;
    let left = rect.right - mw;
    if (left < pad) left = pad;
    const maxLeft = window.innerWidth - mw - pad;
    if (left > maxLeft) left = Math.max(pad, maxLeft);
    let top = rect.bottom + 4;
    const spaceBelow = window.innerHeight - rect.bottom - 4;
    if (mh > spaceBelow && rect.top > mh + pad) {
      top = rect.top - mh - 4;
    }
    if (top < pad) top = pad;
    menu.style.position = 'fixed';
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.right = 'auto';
    menu.style.zIndex = '20050';
  };
  requestAnimationFrame(() => {
    requestAnimationFrame(run);
  });
}

function buildImpresionesHtml(payload) {
  const p = payload.pago || {};
  const rows = Array.isArray(payload.impresiones) ? payload.impresiones : [];
  const ep = String(p.estado_pago || '').toUpperCase();
  const tieneBoleta = !!p.tiene_boleta_pago;
  const puedeImprimirPago = tieneBoleta && ep === 'CANCELADO';
  const moraNd = !!p.mostrar_boton_mora_nd;
  const notaComision = !!p.mostrar_nota_comision;

  const toolbar = `
    <div class="admin-impresiones-toolbar" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px">
      <button type="button" class="admin-pagos-btn-registrar admin-impresiones-btn-pago" ${puedeImprimirPago ? '' : 'disabled'} style="${puedeImprimirPago ? '' : 'opacity:0.5;cursor:not-allowed'}">
        Imprimir Pago
      </button>
      ${
        moraNd
          ? `<button type="button" class="admin-pagos-btn-imprimir admin-impresiones-btn-mora">Imprimir Mora – Nota débito</button>`
          : ''
      }
    </div>
    ${
      notaComision
        ? `<p style="font-size:12px;color:#64748b;margin:0 0 8px 0">Pago con tarjeta y comisión registrada: la nota de débito por comisión no está disponible en esta versión.</p>`
        : ''
    }
  `;

  if (!rows.length) {
    return `${toolbar}<p style="color:#64748b;font-size:14px">No hay registros de impresión para este pago.</p>`;
  }

  const body = rows
    .map((r) => {
      const est = String(r.estado || '').toUpperCase();
      const esAnulado = est === 'ANULADO';
      const toggleLabel = esAnulado ? 'Restaurar' : 'Anular';
      const doc = String(r.tipo_documento || '').toUpperCase();
      const showJsonBoleta = doc === 'BOLETA';
      return `
      <tr>
        <td class="admin-pagos-lista-td">${esc(r.tipo_label)}</td>
        <td class="admin-pagos-lista-td">${esc(r.documento_label)}</td>
        <td class="admin-pagos-lista-td" style="white-space:nowrap">${esc(r.serie_numero)}</td>
        <td class="admin-pagos-lista-td" style="white-space:nowrap">${esc(est || '—')}</td>
        <td class="admin-pagos-lista-td admin-pagos-lista-td--fecha">${esc(r.fecha_impresion_display || '—')}</td>
        <td class="admin-pagos-lista-td" style="text-align:center;vertical-align:middle">
          <div class="admin-pagos-opciones-wrap" style="display:inline-flex;justify-content:center">
            <button type="button" class="admin-pagos-opciones-btn" aria-haspopup="true" aria-expanded="false">Opciones ▾</button>
            <div class="admin-pagos-opciones-menu admin-impresiones-menu" role="menu">
              <button type="button" class="admin-pagos-opcion-item admin-impresiones-opcion-editar" role="menuitem"
                data-imp-id="${esc(String(r.id))}"
                data-imp-fecha="${esc(r.fecha_impresion || '')}"
                data-imp-hora="${esc(r.hora_impresion || '')}"
              ><span class="admin-pagos-opcion-ico" aria-hidden>✎</span><span>Editar</span></button>
              ${
                showJsonBoleta
                  ? `<button type="button" class="admin-pagos-opcion-item admin-impresiones-json-sunat" role="menuitem"><span class="admin-pagos-opcion-ico" aria-hidden>📄</span><span>Generar JSON</span></button>`
                  : ''
              }
              ${
                esAnulado
                  ? `<button type="button" class="admin-pagos-opcion-item admin-impresiones-json-rc" role="menuitem"><span class="admin-pagos-opcion-ico" aria-hidden>📄</span><span>JSON RC</span></button>`
                  : ''
              }
              <button type="button" class="admin-pagos-opcion-item admin-impresiones-opcion-toggle" role="menuitem"
                data-imp-id="${esc(String(r.id))}"
              ><span class="admin-pagos-opcion-ico" aria-hidden>${esAnulado ? '↩' : '⊘'}</span><span>${esc(toggleLabel)}</span></button>
            </div>
          </div>
        </td>
      </tr>`;
    })
    .join('');

  return `
    ${toolbar}
    <div class="admin-pagos-lista-table-wrap" style="max-height:min(420px,50vh);overflow:auto">
      <table class="admin-pagos-lista-table">
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Tipo documento</th>
            <th>Nº documento</th>
            <th>Estado</th>
            <th>Fecha impresión</th>
            <th style="text-align:center">Opciones</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

/**
 * Modal «Impresiones» (admin): tabla de filas `impresiones`, acciones y atajos de impresión alineados al legado.
 */
export async function openAdminImpresionesSwal({ nombreAlumno, alumnoId, matriculaId, pagoId }) {
  const basePath = `/admin/usuarios/alumnos/${alumnoId}/matriculas/${matriculaId}/pagos/${pagoId}`;
  const title = `Impresiones — ${nombreAlumno || 'Alumno'} · Pago #${pagoId}`;

  try {
    /** Hay que await: si no, el caller reabre la lista de pagos y sustituye este modal al instante. */
    await Swal.fire({
      title,
      width: 960,
      html:
        '<div id="admin-impresiones-root" class="admin-impresiones-root" style="position:relative;min-height:120px"><p style="color:#64748b">Cargando…</p></div>',
      showConfirmButton: false,
      showCloseButton: true,
      customClass: { popup: 'admin-impresiones-swal' },
      didOpen: () => {
        const popup = Swal.getPopup();
        const root = popup?.querySelector('#admin-impresiones-root');
        if (!popup || !root) return;

        const store = { payload: null };

        const refresh = async () => {
          try {
            const { data } = await api.get(`${basePath}/impresiones`);
            store.payload = data;
            root.innerHTML = buildImpresionesHtml(data);
          } catch (err) {
            root.innerHTML = `<p style="color:#b91c1c">${esc(err.response?.data?.error || err.message || 'Error al cargar')}</p>`;
          }
        };

        const onRootClick = async (e) => {
          const target = /** @type {HTMLElement} */ (e.target);
          if (target.closest('.admin-pagos-opciones-btn')) {
            const btn = target.closest('.admin-pagos-opciones-btn');
            e.stopPropagation();
            const wrap = btn?.closest('.admin-pagos-opciones-wrap');
            const menu = wrap?.querySelector('.admin-pagos-opciones-menu');
            if (!menu) return;
            const willOpen = !menu.classList.contains('is-open');
            closeImpresionesMenus(popup);
            if (willOpen) {
              menu.classList.add('is-open');
              placeImpresionesOpcionesMenu(btn, menu);
            }
            return;
          }

          if (target.closest('.admin-impresiones-btn-pago')) {
            e.stopPropagation();
            const p = store.payload?.pago || {};
            const ep = String(p.estado_pago || '').toUpperCase();
            if (!p.tiene_boleta_pago) {
              showImpresionesBanner(root, `Sin impresión: ${MSG_NO_IMPRESION_BOLETA}`, 'warn');
              return;
            }
            if (ep !== 'CANCELADO') {
              showImpresionesBanner(
                root,
                'Solo se puede imprimir la boleta de pagos cancelados. Este pago aún no está cancelado.',
                'warn'
              );
              return;
            }
            const { close: closeLoading } = mountImpresionesOverlay(
              root,
              `<div class="admin-impresiones-inline-panel admin-impresiones-inline-panel--loading" role="status">
                <p class="admin-impresiones-inline-loading">Generando boleta…</p>
              </div>`
            );
            try {
              const { data } = await api.get(`${basePath}/boleta`);
              closeLoading();
              await generarPDFBoletaDesdeDatos(data);
              showImpresionesBanner(root, 'La boleta se ha descargado correctamente.', 'ok');
            } catch (err) {
              closeLoading();
              showImpresionesBanner(
                root,
                err.response?.data?.error || err.message || 'No se pudo generar la boleta. Intente nuevamente.',
                'error'
              );
            }
            return;
          }

          if (target.closest('.admin-impresiones-btn-mora')) {
            e.stopPropagation();
            showImpresionesBanner(
              root,
              'El PDF de nota de débito por mora se genera en el sistema PHP anterior (módulo Pagos / Impresiones).',
              'info'
            );
            return;
          }

          const editEl = target.closest('.admin-impresiones-opcion-editar');
          if (editEl) {
            e.stopPropagation();
            closeImpresionesMenus(popup);
            const id = editEl.getAttribute('data-imp-id');
            const fecha0 = editEl.getAttribute('data-imp-fecha') || '';
            const hora0 = editEl.getAttribute('data-imp-hora') || '';
            const fid = `admin-imp-fecha-${id}`;
            const hid = `admin-imp-hora-${id}`;
            const { backdrop, close } = mountImpresionesOverlay(
              root,
              `<div class="admin-impresiones-inline-panel" role="dialog" aria-modal="true">
                <h3 class="admin-impresiones-inline-title">Editar fechas de impresión</h3>
                <div class="admin-impresiones-inline-fields">
                  <label class="admin-impresiones-inline-label">Fecha impresión
                    <input type="date" id="${esc(fid)}" class="admin-impresiones-inline-input" value="${esc(fecha0)}" />
                  </label>
                  <label class="admin-impresiones-inline-label">Hora
                    <input type="time" id="${esc(hid)}" class="admin-impresiones-inline-input" value="${esc(timeInputFromHora(hora0))}" step="1" />
                  </label>
                </div>
                <div class="admin-impresiones-inline-actions">
                  <button type="button" class="admin-impresiones-inline-btn" data-act="cancel">Cancelar</button>
                  <button type="button" class="admin-impresiones-inline-btn admin-impresiones-inline-btn--primary" data-act="save">Guardar</button>
                </div>
              </div>`
            );
            const onDone = () => close();
            backdrop.querySelector('[data-act="cancel"]')?.addEventListener('click', onDone);
            backdrop.querySelector('[data-act="save"]')?.addEventListener('click', async () => {
              const fecha = document.getElementById(fid)?.value?.trim() || '';
              const hora = document.getElementById(hid)?.value?.trim() || '';
              if (!fecha && !hora) {
                showImpresionesBanner(root, 'Indique al menos la fecha o la hora.', 'warn');
                return;
              }
              onDone();
              try {
                await api.patch(`${basePath}/impresiones/${id}`, {
                  fecha_impresion: fecha || undefined,
                  hora_impresion: hora || undefined,
                });
                await refresh();
              } catch (err) {
                showImpresionesBanner(root, err.response?.data?.error || err.message || 'No se pudo guardar.', 'error');
              }
            });
            return;
          }

          const toggleEl = target.closest('.admin-impresiones-opcion-toggle');
          if (toggleEl) {
            e.stopPropagation();
            closeImpresionesMenus(popup);
            const id = toggleEl.getAttribute('data-imp-id');
            const { backdrop, close } = mountImpresionesOverlay(
              root,
              `<div class="admin-impresiones-inline-panel" role="dialog" aria-modal="true">
                <h3 class="admin-impresiones-inline-title">¿Cambiar estado?</h3>
                <p class="admin-impresiones-inline-text">Se alternará entre ACTIVO y ANULADO para esta línea de impresión.</p>
                <div class="admin-impresiones-inline-actions">
                  <button type="button" class="admin-impresiones-inline-btn" data-act="no">No</button>
                  <button type="button" class="admin-impresiones-inline-btn admin-impresiones-inline-btn--primary" data-act="yes">Sí</button>
                </div>
              </div>`
            );
            backdrop.querySelector('[data-act="no"]')?.addEventListener('click', close);
            backdrop.querySelector('[data-act="yes"]')?.addEventListener('click', async () => {
              close();
              try {
                await api.post(`${basePath}/impresiones/${id}/toggle-estado`);
                await refresh();
              } catch (err) {
                showImpresionesBanner(root, err.response?.data?.error || err.message || 'No se pudo cambiar el estado.', 'error');
              }
            });
            return;
          }

          if (target.closest('.admin-impresiones-json-sunat')) {
            e.stopPropagation();
            closeImpresionesMenus(popup);
            showImpresionesBanner(
              root,
              'JSON SUNAT: la generación de archivos se realiza desde el sistema PHP anterior (módulo Impresiones) o las herramientas que su colegio tenga configuradas.',
              'info'
            );
            return;
          }

          if (target.closest('.admin-impresiones-json-rc')) {
            e.stopPropagation();
            closeImpresionesMenus(popup);
            showImpresionesBanner(
              root,
              'JSON RC: este archivo se genera en el sistema PHP anterior cuando corresponda al comprobante anulado.',
              'info'
            );
          }
        };

        root.addEventListener('click', onRootClick);
        popup.addEventListener('click', () => closeImpresionesMenus(popup));

        void (async () => {
          try {
            const { data } = await api.get(`${basePath}/impresiones`);
            store.payload = data;
            root.innerHTML = buildImpresionesHtml(data);
          } catch (err) {
            root.innerHTML = `<p style="color:#b91c1c">${esc(err.response?.data?.error || err.message || 'Error al cargar')}</p>`;
          }
        })();
      },
    });
  } catch (e) {
    Swal.fire({ icon: 'error', text: e.message || 'Error' });
  }
}
