import React, { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import Swal from 'sweetalert2';
import { generarPdfTardanzasPersonal } from '../../utils/pdfTardanzasPersonal';
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

function toInputTime(horaFmt) {
  if (!horaFmt) return '';
  const parts = String(horaFmt).split(':');
  if (parts.length < 2) return '';
  return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
}

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
  const [tabActiva, setTabActiva] = useState('registros');
  const [bioEstado, setBioEstado] = useState(null);
  const [bioLoading, setBioLoading] = useState(false);

  const loadMeta = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/tardanzas/meta');
      setMeta(data);
    } catch {
      setMeta(null);
    }
  }, []);

  const loadBioEstado = useCallback(async () => {
    setBioLoading(true);
    try {
      const { data } = await api.get('/biometrico/admin/estado');
      setBioEstado(data);
    } catch (e) {
      setBioEstado({
        error: e.response?.data?.error || 'No se pudo cargar el estado del biométrico.',
      });
    } finally {
      setBioLoading(false);
    }
  }, []);

  const queryParams = useMemo(() => {
    const p = {};
    if (personalId) p.personal_id = personalId;
    if (desde) p.desde = desde;
    if (hasta) p.hasta = hasta;
    return p;
  }, [personalId, desde, hasta]);

  const loadLista = useCallback(async () => {
    setListaLoading(true);
    try {
      const { data } = await api.get('/admin/tardanzas/lista', { params: queryParams });
      setLista(data);
    } catch (e) {
      setLista(null);
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudo cargar la lista.' });
    } finally {
      setListaLoading(false);
    }
  }, [queryParams]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    loadLista();
  }, [loadLista]);

  useEffect(() => {
    if (tabActiva === 'biometrico') loadBioEstado();
  }, [tabActiva, loadBioEstado]);

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

  const editarHora = async (f) => {
    const r = await Swal.fire({
      icon: 'question',
      title: 'Editar hora de marcación',
      html: `<p style="margin:0 0 0.75rem;font-size:0.9rem"><strong>${f.personal_nombre}</strong><br>${fmtFecha(f.fecha)} · Entrada real: ${f.hora_entrada_real_fmt}</p>`,
      input: 'time',
      inputValue: toInputTime(f.hora_marcacion_fmt),
      inputLabel: 'Hora de marcación',
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      inputValidator: (v) => (!v ? 'Indique la hora' : undefined),
    });
    if (!r.isConfirmed || !r.value) return;

    setRowActionId(f.id);
    try {
      const { data } = await api.patch(`/admin/tardanzas/registro/${f.id}`, {
        hora_marcacion: r.value,
      });
      await Swal.fire({
        icon: 'success',
        title: 'Hora actualizada',
        html: `Min. tarde: <strong>${data.fila.minutos_tardanza}</strong> · Descuento: <strong>${fmtSoles(data.fila.descuento)}</strong>`,
        timer: 2200,
        showConfirmButton: false,
      });
      loadLista();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Editar', text: e.response?.data?.error || 'No se pudo actualizar.' });
    } finally {
      setRowActionId(null);
    }
  };

  const eliminarRegistro = async (f) => {
    const r = await Swal.fire({
      icon: 'warning',
      title: 'Eliminar registro',
      html: `¿Eliminar la marcación de <strong>${f.personal_nombre}</strong> del <strong>${fmtFecha(f.fecha)}</strong>?<br><small>Se recalculará el descuento del mes en el dashboard del personal.</small>`,
      showCancelButton: true,
      confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
    });
    if (!r.isConfirmed) return;

    setRowActionId(f.id);
    try {
      await api.delete(`/admin/tardanzas/registro/${f.id}`);
      Swal.fire({ icon: 'success', title: 'Eliminado', timer: 1500, showConfirmButton: false });
      loadLista();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Eliminar', text: e.response?.data?.error || 'No se pudo eliminar.' });
    } finally {
      setRowActionId(null);
    }
  };

  const exportExcel = async () => {
    setExportLoading(true);
    try {
      const res = await api.get('/admin/tardanzas/export', {
        params: queryParams,
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
        tarifa_por_minuto: lista.tarifa_por_minuto ?? 1,
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
              Marcaciones del huellero (Excel o automático Hikvision) y descuentos por tardanza (S/. 1.00 por minuto).
              {meta?.colegio_nombre ? ` ${meta.colegio_nombre} · Año ${meta.anio}` : ''}
            </p>
          </div>
        </header>

        <div className={`admin-tz-help admin-tz-help--${tabActiva}`}>
          <div className="admin-tz-help-icon" aria-hidden="true">
            💡
          </div>
          <div>
            <h2>
              {tabActiva === 'importar'
                ? 'Importación del huellero'
                : tabActiva === 'biometrico'
                  ? 'Biométrico en vivo'
                  : 'Consulta y descuentos'}
            </h2>
            <p>
              {tabActiva === 'importar'
                ? 'Subí el Excel, revisá la vista previa y confirmá. Se toma la primera entrada del día por persona.'
                : tabActiva === 'biometrico'
                  ? 'El terminal Hikvision envía cada marcación a la intranet. Mapee employeeNo con el código biométrico o el DNI del personal.'
                  : 'Filtrá por empleado y fechas. Podés editar, eliminar filas y exportar PDF.'}
            </p>
          </div>
        </div>

        <div className="admin-tz-toolbar">
          <nav className="admin-tz-tabs" role="tablist" aria-label="Secciones de tardanzas">
            <button
              type="button"
              role="tab"
              aria-selected={tabActiva === 'registros'}
              className={`admin-tz-tab${tabActiva === 'registros' ? ' is-active' : ''}`}
              onClick={() => setTabActiva('registros')}
            >
              Registros
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tabActiva === 'importar'}
              className={`admin-tz-tab admin-tz-tab--amber${tabActiva === 'importar' ? ' is-active' : ''}`}
              onClick={() => setTabActiva('importar')}
            >
              Importar Excel
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tabActiva === 'biometrico'}
              className={`admin-tz-tab admin-tz-tab--bio${tabActiva === 'biometrico' ? ' is-active' : ''}`}
              onClick={() => setTabActiva('biometrico')}
            >
              Biométrico
            </button>
          </nav>
        </div>

        {tabActiva === 'biometrico' && (
          <section className="admin-tardanzas-import admin-tz-bio" aria-label="Biométrico Hikvision">
            <h2 className="admin-tardanzas-import__title">Hikvision → intranet</h2>
            <p className="admin-tardanzas-import__desc">
              Configure en el dispositivo la URL de monitoreo HTTP. Cada marcación válida se guarda como entrada del día
              (igual que el Excel). En Usuarios → Equipo puede indicar el <strong>código biométrico</strong> por persona.
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
                </div>

                {bioEstado.webhook_url && (
                  <div className="admin-tz-bio__url-box">
                    <label>URL para pegar en el huellero</label>
                    <code className="admin-tz-bio__url">{bioEstado.webhook_url}</code>
                    <button
                      type="button"
                      className="admin-tardanzas-btn admin-tardanzas-btn--primary"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(bioEstado.webhook_url);
                          Swal.fire({ icon: 'success', title: 'Copiada', timer: 1400, showConfirmButton: false });
                        } catch {
                          Swal.fire({ icon: 'info', title: 'URL', text: bioEstado.webhook_url });
                        }
                      }}
                    >
                      Copiar URL
                    </button>
                    <p className="admin-tz-bio__hint">{bioEstado.webhook_url_hint}</p>
                  </div>
                )}

                {!bioEstado.webhook_configurado && (
                  <div className="admin-tz-bio__url-box">
                    <p className="admin-tz-bio__hint">{bioEstado.webhook_url_hint}</p>
                    <pre className="admin-tz-bio__env">{`BIOMETRICO_WEBHOOK_TOKEN=un_token_largo_secreto
BIOMETRICO_PUBLIC_URL=https://sistema.vanguardschools.edu.pe`}</pre>
                  </div>
                )}

                <p className="admin-tz-bio__hint">{bioEstado.mapeo}</p>

                <h3 className="admin-tz-bio__sub">Últimos eventos del log (diagnóstico)</h3>
                <p className="admin-tz-bio__hint">
                  La asistencia real es <strong>1 marcación por persona por día</strong> (si marcas varias veces,
                  se conserva la hora más temprana). Esta tabla solo es un historial técnico del huellero.
                </p>
                <div className="admin-tardanzas-table-wrap">
                  <table className="admin-tardanzas-table">
                    <thead>
                      <tr>
                        <th>Cuándo</th>
                        <th>EmployeeNo</th>
                        <th>Personal</th>
                        <th>Fecha / hora</th>
                        <th>Estado</th>
                        <th>Detalle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(bioEstado.eventos || []).length === 0 && (
                        <tr>
                          <td colSpan={6}>Aún no hay eventos. Marque una vez en el terminal tras configurar la URL.</td>
                        </tr>
                      )}
                      {(bioEstado.eventos || []).map((ev) => (
                        <tr key={ev.id}>
                          <td>{fmtLimaDateTime(ev.created_at)}</td>
                          <td>{ev.employee_no || '—'}</td>
                          <td>{ev.personal_nombre || '—'}</td>
                          <td>
                            {ev.fecha ? fmtFecha(ev.fecha) : '—'}
                            {ev.hora_marcacion ? ` ${String(ev.hora_marcacion).slice(0, 8)}` : ''}
                          </td>
                          <td>
                            <span className={`admin-tz-bio__st admin-tz-bio__st--${String(ev.estado || '').toLowerCase()}`}>
                              {ev.estado}
                            </span>
                          </td>
                          <td>{ev.detalle || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        )}

        {tabActiva === 'importar' && (
        <section className="admin-tardanzas-import" aria-label="Importar Excel">
          <h2 className="admin-tardanzas-import__title">Importar marcaciones del huellero</h2>
          <p className="admin-tardanzas-import__desc">
            Se usa la primera entrada del día por persona (hora más temprana del Excel). Si un día ya fue importado, se actualiza la hora y el descuento. Si editó celdas de hora en Excel, guarde el archivo antes de subirlo.
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
        )}

        {tabActiva === 'registros' && (
          <>
            <section className="admin-tardanzas-toolbar" aria-label="Filtros">
              <label>
                Empleado
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
              <div className="admin-tardanzas-toolbar__actions">
                <button type="button" className="admin-tardanzas-btn" onClick={loadLista} disabled={listaLoading}>
                  {listaLoading ? '…' : 'Actualizar'}
                </button>
                <button
                  type="button"
                  className="admin-tardanzas-btn"
                  onClick={exportExcel}
                  disabled={exportLoading || !lista?.filas?.length}
                >
                  {exportLoading ? '…' : 'Excel'}
                </button>
                <button
                  type="button"
                  className="admin-tardanzas-btn admin-tardanzas-btn--primary"
                  onClick={exportPdf}
                  disabled={!lista?.filas?.length}
                >
                  PDF
                </button>
              </div>
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
                        <th aria-label="Acciones">Acciones</th>
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
                          <td className="col-acciones">
                            <button
                              type="button"
                              className="admin-tardanzas-icon-btn"
                              title="Editar hora"
                              aria-label={`Editar hora de ${f.personal_nombre}`}
                              disabled={rowActionId === f.id}
                              onClick={() => editarHora(f)}
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              className="admin-tardanzas-icon-btn admin-tardanzas-icon-btn--danger"
                              title="Eliminar registro"
                              aria-label={`Eliminar registro de ${f.personal_nombre}`}
                              disabled={rowActionId === f.id}
                              onClick={() => eliminarRegistro(f)}
                            >
                              🗑️
                            </button>
                          </td>
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
