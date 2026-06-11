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

  const loadMeta = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/tardanzas/meta');
      setMeta(data);
    } catch {
      setMeta(null);
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
      await Swal.fire({
        icon: 'success',
        title: 'Importación completa',
        html: `Insertados: <strong>${data.stats.insertados}</strong><br>Actualizados: <strong>${data.stats.actualizados}</strong><br>Sin coincidencia: <strong>${data.stats.omitidos_sin_match}</strong>`,
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
        <header className="admin-estadisticas-header">
          <h1 className="admin-estadisticas-title">Tardanzas del personal</h1>
          <p className="admin-estadisticas-desc">
            Importe el Excel del huellero y consulte descuentos por tardanza (S/. 1.00 por minuto).
            {meta?.colegio_nombre ? ` ${meta.colegio_nombre} · Año ${meta.anio}` : ''}
          </p>
        </header>

        <section className="admin-tardanzas-import" aria-label="Importar Excel">
          <h2 className="admin-tardanzas-import__title">Importar marcaciones del huellero</h2>
          <p className="admin-tardanzas-import__desc">
            Se usa la primera entrada del día por persona (hora más temprana). Si un día ya fue importado, se actualiza sin duplicar el descuento.
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
            <p className="admin-tardanzas-empty">No hay registros. Importe un Excel del huellero o ajuste los filtros.</p>
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
                      <td className={f.descuento > 0 ? 'col-descuento' : 'col-descuento col-descuento--cero'}>
                        {f.descuento > 0 ? fmtSoles(f.descuento) : '—'}
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
      </div>
    </DashboardLayout>
  );
}
