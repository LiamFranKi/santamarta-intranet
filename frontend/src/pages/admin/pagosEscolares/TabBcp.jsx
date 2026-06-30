import React, { useCallback, useEffect, useState } from 'react';
import {
  Autocomplete,
  Chip,
  CircularProgress,
  IconButton,
  MenuItem,
  TextField,
  Tooltip,
} from '@mui/material';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import Swal from 'sweetalert2';
import api from '../../../services/api';
import PeTablaPaginacion from '../../../components/admin/PeTablaPaginacion';
import { DEFAULT_PAGE_SIZE } from '../../../hooks/usePaginacionTabla';
import FacturacionModal from '../facturacion/FacturacionModal';
import '../facturacion/AdminFacturacion.css';
import { sedeIdSanMartin } from './pagosEscolaresFilters';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function descargarBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

async function parseErrorBlob(e, fallback) {
  if (e.response?.data instanceof Blob) {
    try {
      const txt = await e.response.data.text();
      const j = JSON.parse(txt);
      return j.error || fallback;
    } catch {
      return fallback;
    }
  }
  return e.response?.data?.error || fallback;
}

function HistorialBcp({ anio }) {
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, page_size: DEFAULT_PAGE_SIZE, total: 0, total_pages: 1 });
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [boleteandoId, setBoleteandoId] = useState(null);

  const cargar = useCallback(
    async (page = 1, size = pageSize) => {
      setLoading(true);
      try {
        const { data } = await api.get('/admin/pagos/bcp/historial', {
          params: { anio, page, page_size: size },
        });
        setItems(data.items || []);
        setPagination(data.pagination || { page: 1, page_size: size, total: 0, total_pages: 1 });
      } catch (e) {
        Swal.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudo cargar el historial' });
      } finally {
        setLoading(false);
      }
    },
    [anio, pageSize]
  );

  useEffect(() => {
    cargar(1, pageSize);
  }, [anio, pageSize]);

  useEffect(() => {
    const handler = () => cargar(1, pageSize);
    window.addEventListener('pe-bcp-historial-refresh', handler);
    return () => window.removeEventListener('pe-bcp-historial-refresh', handler);
  }, [cargar, pageSize]);

  const { page, total_pages, total } = pagination;

  const onPageSizeChange = (size) => {
    setPageSize(size);
    cargar(1, size);
  };

  const verDetalle = async (row) => {
    setCargandoDetalle(true);
    try {
      const { data } = await api.get(`/admin/pagos/bcp/historial/${row.id}`);
      setDetalle(data);
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudo cargar el detalle' });
    } finally {
      setCargandoDetalle(false);
    }
  };

  const boletearLote = async (row) => {
    const ok = await Swal.fire({
      icon: 'question',
      title: 'Boletear lote',
      text: `¿Generar ZIP de boletas para "${row.archivo}"?`,
      showCancelButton: true,
      confirmButtonText: 'Sí, boletear',
    });
    if (!ok.isConfirmed) return;

    setBoleteandoId(row.id);
    try {
      const { data, headers } = await api.post(
        `/admin/pagos/bcp/historial/${row.id}/boletear`,
        {},
        { responseType: 'blob' }
      );
      const disp = headers['content-disposition'] || '';
      const m = disp.match(/filename=([^;]+)/i);
      const filename = m ? m[1].replace(/"/g, '') : 'boletas.zip';
      descargarBlob(data, filename);
      const count = headers['x-boletas-count'];
      Swal.fire({
        icon: 'success',
        title: 'Boletas generadas',
        text: count ? `${count} comprobante(s) en el ZIP.` : 'Descarga iniciada.',
        timer: 2200,
        showConfirmButton: false,
      });
      cargar(page, pageSize);
      window.dispatchEvent(new Event('pe-bcp-historial-refresh'));
    } catch (e) {
      const msg = await parseErrorBlob(e, 'No se pudo boletear el lote');
      Swal.fire({ icon: 'error', text: msg });
    } finally {
      setBoleteandoId(null);
    }
  };

  return (
    <div className="pe-bcp-historial">
      <h3 className="pe-bcp-section-title">Historial de archivos importados</h3>
      <p className="pe-bcp-section-hint">Archivos CDPG procesados correctamente (sin errores de matrícula).</p>

      {loading ? (
        <div className="pe-loading-inline">
          <CircularProgress size={22} />
          <span>Cargando historial…</span>
        </div>
      ) : (
        <>
          <div className="pe-table-wrap">
            <table className="pe-table">
              <thead>
                <tr>
                  <th className="pe-th-center">Fecha</th>
                  <th className="pe-th-center">Archivo</th>
                  <th className="pe-th-center">Cantidad de pagos</th>
                  <th className="pe-th-center">Estado</th>
                  <th className="pe-th-center pe-th-accion">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="pe-empty">
                      No hay importaciones registradas para {anio}.
                    </td>
                  </tr>
                ) : (
                  items.map((row) => (
                    <tr key={row.id}>
                      <td className="pe-td-center">{String(row.fecha || '').slice(0, 10)}</td>
                      <td className="pe-td-center">{row.archivo}</td>
                      <td className="pe-td-center">{row.cantidad_pagos}</td>
                      <td className="pe-td-center">
                        <span
                          className={`pe-badge ${
                            row.estado === 'BOLETAS IMPRESAS' ? 'pe-badge--ok' : 'pe-badge--pending'
                          }`}
                        >
                          {row.estado}
                        </span>
                      </td>
                      <td className="pe-td-accion">
                        <div className="pe-bcp-historial-actions">
                          <Tooltip title="Ver pagos importados">
                            <IconButton
                              size="small"
                              className="pe-btn-historial-ver"
                              onClick={() => verDetalle(row)}
                              disabled={cargandoDetalle}
                            >
                              <ArticleOutlinedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Boletear lote">
                            <IconButton
                              size="small"
                              className="pe-btn-historial-print"
                              onClick={() => boletearLote(row)}
                              disabled={boleteandoId === row.id}
                            >
                              {boleteandoId === row.id ? (
                                <CircularProgress size={16} />
                              ) : (
                                <PrintOutlinedIcon fontSize="small" />
                              )}
                            </IconButton>
                          </Tooltip>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {total > 0 && (
            <PeTablaPaginacion
              page={page}
              totalPages={total_pages}
              total={total}
              pageSize={pageSize}
              onPageChange={(p) => cargar(p, pageSize)}
              onPageSizeChange={onPageSizeChange}
              disabled={loading}
            />
          )}
        </>
      )}

      <FacturacionModal
        open={!!detalle}
        onClose={() => setDetalle(null)}
        wide
        title={detalle?.historial ? `Pagos — ${detalle.historial.archivo}` : 'Detalle del lote'}
      >
        {detalle && (
          <>
            <p className="pe-bcp-detalle-meta">
              <strong>Fecha:</strong> {String(detalle.historial.fecha || '').slice(0, 10)}
              {' · '}
              <strong>Estado:</strong> {detalle.historial.estado}
              {' · '}
              <strong>Pagos:</strong> {detalle.historial.cantidad_pagos}
            </p>
            <div className="pe-table-wrap">
              <table className="pe-table pe-table--compact">
                <thead>
                  <tr>
                    <th className="pe-th-center">DNI</th>
                    <th className="pe-th-center">Alumno</th>
                    <th className="pe-th-center">Nivel / Grado</th>
                    <th className="pe-th-center">Concepto</th>
                    <th className="pe-th-center">Monto</th>
                    <th className="pe-th-center">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {(detalle.pagos || []).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="pe-empty">
                        Sin pagos en este lote.
                      </td>
                    </tr>
                  ) : (
                    detalle.pagos.map((p) => (
                      <tr key={p.id}>
                        <td className="pe-td-center">{p.dni}</td>
                        <td className="pe-td-center">{p.alumno}</td>
                        <td className="pe-td-center">
                          {[p.nivel, p.grado && `${p.grado}°`, p.seccion].filter(Boolean).join(' ')}
                        </td>
                        <td className="pe-td-center">{p.descripcion || `Pensión ${p.nro_pago}`}</td>
                        <td className="pe-td-center">S/ {Number(p.monto || 0).toFixed(2)}</td>
                        <td className="pe-td-center">{p.estado_pago}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </FacturacionModal>
    </div>
  );
}

export default function TabBcp() {
  const [meta, setMeta] = useState(null);
  const [bcpCfg, setBcpCfg] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [grupos, setGrupos] = useState([]);
  const [loadingInit, setLoadingInit] = useState(true);

  const [anio, setAnio] = useState('');
  const [fecha, setFecha] = useState(todayIso());
  const [sedeId, setSedeId] = useState('');
  const [nroPago, setNroPago] = useState('');
  const [grupoId, setGrupoId] = useState(-1);
  const [tipo, setTipo] = useState('A');
  const [tipoAlumno, setTipoAlumno] = useState('TODOS');
  const [tipoDocumento, setTipoDocumento] = useState('A');

  const [nroPagoInd, setNroPagoInd] = useState('');
  const [tipoInd, setTipoInd] = useState('A');
  const [tipoDocumentoInd, setTipoDocumentoInd] = useState('A');
  const [matriculaOpts, setMatriculaOpts] = useState([]);
  const [matriculaSel, setMatriculaSel] = useState([]);
  const [matriculaInput, setMatriculaInput] = useState('');
  const [buscandoMat, setBuscandoMat] = useState(false);

  const [archivoCdpg, setArchivoCdpg] = useState(null);
  const [archivoXlsx, setArchivoXlsx] = useState(null);
  const [filaInicio, setFilaInicio] = useState(5);
  const [exportando, setExportando] = useState(false);
  const [importando, setImportando] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingInit(true);
        const [metaRes, bcpRes] = await Promise.all([
          api.get('/admin/pagos/meta'),
          api.get('/admin/pagos/bcp/config'),
        ]);
        if (cancelled) return;
        setMeta(metaRes.data);
        setBcpCfg(bcpRes.data);
        setLoadError('');
        const anioAct = String(bcpRes.data.anio_activo || metaRes.data.anio_activo || new Date().getFullYear());
        setAnio(anioAct);
        const sedes = metaRes.data.sedes || [];
        if (sedes.length) setSedeId(sedeIdSanMartin(sedes));
        const opts = Array.isArray(bcpRes.data.opciones_nro_pago) ? bcpRes.data.opciones_nro_pago : [];
        if (opts.length) {
          setNroPago(opts[0].value);
          setNroPagoInd(opts[0].value);
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e.response?.data?.error || 'Error al cargar datos BCP');
          Swal.fire({ icon: 'error', text: e.response?.data?.error || 'Error al cargar datos BCP' });
        }
      } finally {
        if (!cancelled) setLoadingInit(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!anio) return;
    let cancelled = false;
    (async () => {
      try {
        const params = { anio: parseInt(anio, 10) };
        if (sedeId) params.sede_id = parseInt(sedeId, 10);
        const { data } = await api.get('/admin/pagos/bcp/grupos', { params });
        if (!cancelled) setGrupos(data.grupos || []);
      } catch {
        if (!cancelled) setGrupos([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [anio, sedeId]);

  useEffect(() => {
    const q = matriculaInput.trim();
    if (q.length < 2 || !anio) {
      setMatriculaOpts([]);
      return undefined;
    }
    const t = setTimeout(async () => {
      setBuscandoMat(true);
      try {
        const { data } = await api.get('/admin/pagos/bcp/matriculas-buscar', {
          params: { q, anio: parseInt(anio, 10) },
        });
        setMatriculaOpts(data.items || []);
      } catch {
        setMatriculaOpts([]);
      } finally {
        setBuscandoMat(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [matriculaInput, anio]);

  const exportarCrep = async (modo) => {
    if (bcpCfg && bcpCfg.recaudo_completo === false) {
      Swal.fire({
        icon: 'warning',
        title: 'Configuración BCP incompleta',
        text: 'Configure recaudo_nro_sucursal, recaudo_nro_cuenta y recaudo_razon_social en Institucional → Configuración.',
      });
      return;
    }

    const params = {
      anio: parseInt(anio, 10),
      fecha,
      nro_pago: modo === 'individual' ? nroPagoIndVal : nroPagoVal,
      tipo: modo === 'individual' ? tipoInd : tipo,
      tipo_documento: modo === 'individual' ? tipoDocumentoInd : tipoDocumento,
    };

    if (modo === 'masivo') {
      params.grupo_id = grupoId;
      params.tipo_alumno = tipoAlumno;
      if (sedeId) params.sede_id = parseInt(sedeId, 10);
    } else {
      if (!matriculaSel.length) {
        Swal.fire({ icon: 'warning', text: 'Seleccione al menos un alumno.' });
        return;
      }
      matriculaSel.forEach((m) => {
        if (!params.matricula_id) params.matricula_id = [];
        params.matricula_id.push(m.matricula_id);
      });
    }

    setExportando(true);
    try {
      const { data } = await api.get('/admin/pagos/bcp/exportar-crep', {
        params,
        responseType: 'blob',
        paramsSerializer: (p) => {
          const usp = new URLSearchParams();
          Object.entries(p).forEach(([k, v]) => {
            if (v == null || v === '') return;
            if (Array.isArray(v)) v.forEach((x) => usp.append(k, x));
            else usp.append(k, v);
          });
          return usp.toString();
        },
      });
      descargarBlob(data, 'CREP.txt');
      Swal.fire({ icon: 'success', title: 'CREP generado', timer: 2000, showConfirmButton: false });
    } catch (e) {
      let msg = 'No se pudo exportar';
      if (e.response?.data instanceof Blob) {
        try {
          const txt = await e.response.data.text();
          const j = JSON.parse(txt);
          msg = j.error || msg;
        } catch {
          /* ignore */
        }
      } else {
        msg = e.response?.data?.error || msg;
      }
      Swal.fire({ icon: 'error', title: 'Exportación fallida', text: msg });
    } finally {
      setExportando(false);
    }
  };

  const importarCdpg = async () => {
    if (!archivoCdpg) {
      Swal.fire({ icon: 'warning', text: 'Seleccione un archivo .txt del banco.' });
      return;
    }
    const fd = new FormData();
    fd.append('archivo', archivoCdpg);
    setImportando(true);
    try {
      const { data } = await api.post('/admin/pagos/bcp/importar-cdpg', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setArchivoCdpg(null);
      Swal.fire({
        icon: 'success',
        title: 'Importación exitosa',
        text: `Se procesaron ${data.pagos_procesados || 0} pago(s).`,
      });
      window.dispatchEvent(new CustomEvent('pe-bcp-historial-refresh'));
    } catch (e) {
      const d = e.response?.data || {};
      const code = parseInt(d.code, 10);
      let html = d.error || 'No se pudo importar el archivo';
      if (d.errores?.length) {
        html += `<br/><br/><div style="text-align:left;max-height:200px;overflow:auto;font-size:0.85rem">${d.errores
          .map((x) => `• ${String(x).replace(/</g, '')}`)
          .join('<br/>')}</div>`;
      }
      if (code === -2) {
        html +=
          '<br/><br/><small>El historial solo se guarda cuando no hay errores. Revise las matrículas indicadas.</small>';
      }
      Swal.fire({ icon: 'error', title: 'Importación con problemas', html });
    } finally {
      setImportando(false);
    }
  };

  const importarOperacion = async () => {
    if (!archivoXlsx) {
      Swal.fire({ icon: 'warning', text: 'Seleccione un archivo Excel.' });
      return;
    }
    const fd = new FormData();
    fd.append('archivo', archivoXlsx);
    fd.append('start_row', String(filaInicio));
    setImportando(true);
    try {
      const { data } = await api.post('/admin/pagos/bcp/importar-operacion', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setArchivoXlsx(null);
      const extra =
        data.errores?.length > 0
          ? ` Advertencias: ${data.errores.length} fila(s) con problemas.`
          : '';
      Swal.fire({
        icon: 'success',
        title: 'Operación completada',
        text: `Registros actualizados: ${data.actualizados || 0}.${extra}`,
      });
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.error || 'No se pudo importar' });
    } finally {
      setImportando(false);
    }
  };

  const opcionesPago = Array.isArray(bcpCfg?.opciones_nro_pago) ? bcpCfg.opciones_nro_pago : [];

  if (loadingInit) {
    return (
      <div className="pe-loading-inline">
        <CircularProgress size={28} />
        <span>Cargando módulo BCP…</span>
      </div>
    );
  }

  if (!bcpCfg || !opcionesPago.length) {
    return (
      <div className="pe-empty-state">
        <p>{loadError || 'No se pudo cargar la configuración BCP. Verifique su conexión o permisos.'}</p>
      </div>
    );
  }

  const nroPagoVal = opcionesPago.some((o) => o.value === nroPago) ? nroPago : opcionesPago[0].value;
  const nroPagoIndVal = opcionesPago.some((o) => o.value === nroPagoInd) ? nroPagoInd : opcionesPago[0].value;

  return (
    <div className="pe-tab-bcp">
      {bcpCfg?.recaudo_completo === false && (
        <div className="pe-alert pe-alert--warn">
          Falta configurar datos de recaudo BCP (sucursal, cuenta, razón social) en Institucional.
        </div>
      )}

      <div className="pe-card pe-bcp-panel">
        <h3 className="pe-bcp-section-title">Exportar registro (CREP)</h3>
        <div className="pe-bcp-grid">
          <TextField size="small" label="Año" type="number" value={anio} onChange={(e) => setAnio(e.target.value)} fullWidth />
          <TextField size="small" label="Fecha archivo" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
          <TextField select size="small" label="Pago" value={nroPagoVal} onChange={(e) => setNroPago(parseInt(e.target.value, 10))} fullWidth>
            {opcionesPago.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField select size="small" label="Grupo" value={grupoId} onChange={(e) => setGrupoId(parseInt(e.target.value, 10))} fullWidth>
            <MenuItem value={-1}>-- TODOS --</MenuItem>
            {grupos.map((g) => (
              <MenuItem key={g.id} value={g.id}>
                {g.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField select size="small" label="Acción" value={tipo} onChange={(e) => setTipo(e.target.value)} fullWidth>
            <MenuItem value="A">AGREGAR</MenuItem>
            <MenuItem value="M">MODIFICAR</MenuItem>
            <MenuItem value="E">ELIMINAR</MenuItem>
          </TextField>
          <TextField select size="small" label="Alumnos" value={tipoAlumno} onChange={(e) => setTipoAlumno(e.target.value)} fullWidth>
            <MenuItem value="TODOS">TODOS</MenuItem>
            <MenuItem value="NUEVOS">NUEVOS</MenuItem>
            <MenuItem value="ANTIGUOS">ANTIGUOS</MenuItem>
          </TextField>
          <TextField select size="small" label="Tipo doc." value={tipoDocumento} onChange={(e) => setTipoDocumento(e.target.value)} fullWidth>
            <MenuItem value="A">A</MenuItem>
            <MenuItem value="R">R</MenuItem>
          </TextField>
        </div>
        <button type="button" className="pe-btn pe-btn--primary pe-btn--block" disabled={exportando} onClick={() => exportarCrep('masivo')}>
          {exportando ? 'Generando…' : 'Exportar registro'}
        </button>
      </div>

      <div className="pe-card pe-bcp-panel">
        <h3 className="pe-bcp-section-title">Exportar registro — individual</h3>
        <div className="pe-bcp-grid">
          <TextField size="small" label="Año" type="number" value={anio} onChange={(e) => setAnio(e.target.value)} fullWidth />
          <TextField size="small" label="Fecha archivo" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
          <TextField select size="small" label="Pago" value={nroPagoIndVal} onChange={(e) => setNroPagoInd(parseInt(e.target.value, 10))} fullWidth>
            {opcionesPago.map((o) => (
              <MenuItem key={`i-${o.value}`} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField select size="small" label="Acción" value={tipoInd} onChange={(e) => setTipoInd(e.target.value)} fullWidth>
            <MenuItem value="A">AGREGAR</MenuItem>
            <MenuItem value="M">MODIFICAR</MenuItem>
            <MenuItem value="E">ELIMINAR</MenuItem>
          </TextField>
          <TextField select size="small" label="Tipo doc." value={tipoDocumentoInd} onChange={(e) => setTipoDocumentoInd(e.target.value)} fullWidth>
            <MenuItem value="A">A</MenuItem>
            <MenuItem value="R">R</MenuItem>
          </TextField>
        </div>
        <Autocomplete
          multiple
          size="small"
          options={matriculaOpts}
          getOptionLabel={(o) => o?.label || ''}
          isOptionEqualToValue={(a, b) => a?.matricula_id === b?.matricula_id}
          value={matriculaSel}
          onChange={(_, v) => setMatriculaSel(v)}
          inputValue={matriculaInput}
          onInputChange={(_, v) => setMatriculaInput(v)}
          loading={buscandoMat}
          renderTags={(value, getTagProps) =>
            value.map((option, index) => (
              <Chip {...getTagProps({ index })} key={option.matricula_id} label={option.label} size="small" />
            ))
          }
          renderInput={(params) => (
            <TextField {...params} label="Alumnos (mín. 2 caracteres)" placeholder="Buscar por nombre o DNI" fullWidth />
          )}
          className="pe-bcp-autocomplete"
        />
        <button type="button" className="pe-btn pe-btn--primary pe-btn--block" disabled={exportando} onClick={() => exportarCrep('individual')}>
          {exportando ? 'Generando…' : 'Exportar registro'}
        </button>
      </div>

      <div className="pe-card pe-bcp-panel">
        <h3 className="pe-bcp-section-title">Importar registro (CDPG)</h3>
        <p className="pe-bcp-section-hint">Archivo plano .txt que envía el BCP (ej. CDPG-PENSIONES-…).</p>
        <div className="pe-bcp-import-row">
          <input type="file" accept=".txt,text/plain" onChange={(e) => setArchivoCdpg(e.target.files?.[0] || null)} />
          <button type="button" className="pe-btn pe-btn--primary" disabled={importando} onClick={importarCdpg}>
            {importando ? 'Importando…' : 'Importar archivo'}
          </button>
        </div>
      </div>

      <div className="pe-card pe-bcp-panel">
        <h3 className="pe-bcp-section-title">Importar N° de operación</h3>
        <div className="pe-bcp-import-row">
          <input type="file" accept=".xlsx,.xls" onChange={(e) => setArchivoXlsx(e.target.files?.[0] || null)} />
          <TextField
            size="small"
            label="Fila inicio"
            type="number"
            value={filaInicio}
            onChange={(e) => setFilaInicio(parseInt(e.target.value, 10) || 5)}
            inputProps={{ min: 1 }}
            className="pe-field--fila"
          />
          <button type="button" className="pe-btn pe-btn--primary" disabled={importando} onClick={importarOperacion}>
            Importar archivo
          </button>
        </div>
      </div>

      <div className="pe-card pe-bcp-panel pe-bcp-panel--historial">
        <HistorialBcp
          anio={parseInt(anio, 10) || new Date().getFullYear()}
          key={`hist-${anio}`}
        />
      </div>
    </div>
  );
}
