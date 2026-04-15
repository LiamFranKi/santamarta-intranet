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

function closeImpresionesMenus(popup) {
  popup.querySelectorAll('.admin-impresiones-menu.is-open').forEach((m) => m.classList.remove('is-open'));
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
      html: '<div id="admin-impresiones-root"><p style="color:#64748b">Cargando…</p></div>',
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
            if (willOpen) menu.classList.add('is-open');
            return;
          }

          if (target.closest('.admin-impresiones-btn-pago')) {
            e.stopPropagation();
            const p = store.payload?.pago || {};
            const ep = String(p.estado_pago || '').toUpperCase();
            if (!p.tiene_boleta_pago) {
              Swal.fire({
                icon: 'warning',
                title: 'Sin impresión',
                text: MSG_NO_IMPRESION_BOLETA,
                confirmButtonText: 'Entendido',
              });
              return;
            }
            if (ep !== 'CANCELADO') {
              Swal.fire({
                icon: 'warning',
                title: 'Pago no cancelado',
                text: 'Solo se puede imprimir la boleta de pagos cancelados. Este pago aún no está cancelado.',
                confirmButtonText: 'Entendido',
              });
              return;
            }
            try {
              Swal.fire({ title: 'Generando boleta…', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
              const { data } = await api.get(`${basePath}/boleta`);
              Swal.close();
              await generarPDFBoletaDesdeDatos(data);
              Swal.fire({
                icon: 'success',
                title: 'Boleta generada',
                text: 'La boleta se ha descargado correctamente.',
                timer: 2000,
                showConfirmButton: false,
              });
            } catch (err) {
              Swal.close();
              Swal.fire({
                icon: 'error',
                title: 'No se pudo generar la boleta',
                text: err.response?.data?.error || err.message || 'Intente nuevamente.',
                confirmButtonText: 'Entendido',
              });
            }
            return;
          }

          if (target.closest('.admin-impresiones-btn-mora')) {
            e.stopPropagation();
            Swal.fire({
              icon: 'info',
              title: 'No disponible en esta versión',
              text: 'El PDF de nota de débito por mora se genera en el sistema PHP anterior (módulo Pagos / Impresiones).',
              confirmButtonText: 'Entendido',
            });
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
            const result = await Swal.fire({
              title: 'Editar fechas de impresión',
              html: `
            <div style="text-align:left;display:flex;flex-direction:column;gap:10px;margin-top:8px">
              <label style="font-size:13px">Fecha impresión
                <input type="date" id="${esc(fid)}" class="swal2-input" style="display:block;width:100%;margin-top:4px" value="${esc(fecha0)}" />
              </label>
              <label style="font-size:13px">Hora
                <input type="time" id="${esc(hid)}" class="swal2-input" style="display:block;width:100%;margin-top:4px" value="${esc(timeInputFromHora(hora0))}" step="1" />
              </label>
            </div>`,
              showCancelButton: true,
              confirmButtonText: 'Guardar',
              cancelButtonText: 'Cancelar',
              focusConfirm: false,
              preConfirm: () => {
                const fecha = document.getElementById(fid)?.value?.trim() || '';
                const hora = document.getElementById(hid)?.value?.trim() || '';
                if (!fecha && !hora) {
                  Swal.showValidationMessage('Indique al menos la fecha o la hora.');
                  return false;
                }
                return { fecha_impresion: fecha || undefined, hora_impresion: hora || undefined };
              },
            });
            if (!result.isConfirmed || !result.value) return;
            try {
              await api.patch(`${basePath}/impresiones/${id}`, result.value);
              await refresh();
            } catch (err) {
              Swal.fire({
                icon: 'error',
                text: err.response?.data?.error || err.message || 'No se pudo guardar.',
              });
            }
            return;
          }

          const toggleEl = target.closest('.admin-impresiones-opcion-toggle');
          if (toggleEl) {
            e.stopPropagation();
            closeImpresionesMenus(popup);
            const id = toggleEl.getAttribute('data-imp-id');
            const ok = await Swal.fire({
              icon: 'question',
              title: '¿Cambiar estado?',
              text: 'Se alternará entre ACTIVO y ANULADO para esta línea de impresión.',
              showCancelButton: true,
              confirmButtonText: 'Sí',
              cancelButtonText: 'No',
            });
            if (!ok.isConfirmed) return;
            try {
              await api.post(`${basePath}/impresiones/${id}/toggle-estado`);
              await refresh();
            } catch (err) {
              Swal.fire({
                icon: 'error',
                text: err.response?.data?.error || err.message || 'No se pudo cambiar el estado.',
              });
            }
            return;
          }

          if (target.closest('.admin-impresiones-json-sunat')) {
            e.stopPropagation();
            closeImpresionesMenus(popup);
            Swal.fire({
              icon: 'info',
              title: 'Generar JSON (SUNAT)',
              text: 'La generación de archivos JSON para SUNAT se realiza desde el sistema PHP anterior (módulo Impresiones) o mediante las herramientas que su colegio tenga configuradas.',
              confirmButtonText: 'Entendido',
            });
            return;
          }

          if (target.closest('.admin-impresiones-json-rc')) {
            e.stopPropagation();
            closeImpresionesMenus(popup);
            Swal.fire({
              icon: 'info',
              title: 'JSON RC (resumen de baja)',
              text: 'Este archivo se genera en el sistema PHP anterior cuando corresponda al comprobante anulado.',
              confirmButtonText: 'Entendido',
            });
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
