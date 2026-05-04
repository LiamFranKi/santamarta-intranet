import React, { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import Swal from 'sweetalert2';
import { generarPdfListaDeudores } from '../../utils/pdfListaDeudores';
import './AdminEstadisticas.css';
import './AdminReportesDeudores.css';

function fmtMonto(n, moneda) {
  if (n == null || n === '') return '—';
  return `${moneda || 'S/'} ${parseFloat(n).toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export default function AdminReportesDeudores() {
  const [kpis, setKpis] = useState(null);
  const [loadingKpis, setLoadingKpis] = useState(true);
  const [anio, setAnio] = useState('');
  const [tipoConcepto, setTipoConcepto] = useState('1');
  const [modoAgrupacion, setModoAgrupacion] = useState('todo');
  const [filas, setFilas] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loadingLista, setLoadingLista] = useState(false);
  const [grupoId, setGrupoId] = useState('');
  const [gruposOpciones, setGruposOpciones] = useState([]);

  const etiquetaGrupoOpcion = (g) => {
    const nivel = (g.nivel_nombre || '').trim() || '—';
    const grRaw = g.grado != null && g.grado !== '' ? String(g.grado).trim() : '';
    const gr =
      grRaw === ''
        ? '—'
        : /^\d+$/.test(grRaw)
          ? `${grRaw}°`
          : grRaw;
    const sec = (g.seccion || '').toString().trim() || '—';
    return `${nivel} - ${gr} - ${sec}`;
  };

  const totales = useMemo(() => {
    const suma = filas.reduce((s, r) => s + (parseFloat(r.monto) || 0), 0);
    return { totalDeuda: Math.round(suma * 100) / 100 };
  }, [filas]);

  const totalAlumnosUnicos = useMemo(() => {
    if (typeof meta?.total_alumnos_unicos === 'number') return meta.total_alumnos_unicos;
    return new Set(filas.map((r) => r.alumno_id)).size;
  }, [meta, filas]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingKpis(true);
        const { data } = await api.get('/admin/estadisticas/kpis');
        if (cancelled) return;
        setKpis(data);
        setAnio(String(data?.anio || new Date().getFullYear()));
        const conceptos = data?.conceptos || [];
        const firstPension = conceptos.find((c) => Number(c.tipo) > 0);
        setTipoConcepto(firstPension != null ? String(firstPension.tipo) : '0');
      } catch {
        if (!cancelled) setKpis(null);
      } finally {
        if (!cancelled) setLoadingKpis(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loadingKpis) return;
    const anioNum = parseInt(anio, 10);
    if (!anioNum) {
      setGruposOpciones([]);
      setGrupoId('');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/admin/academico/grupos', { params: { anio: anioNum } });
        if (cancelled) return;
        setGruposOpciones(Array.isArray(data?.grupos) ? data.grupos : []);
        setGrupoId('');
      } catch {
        if (!cancelled) {
          setGruposOpciones([]);
          setGrupoId('');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [anio, loadingKpis]);

  const opcionesConcepto = useMemo(() => {
    const list = [];
    list.push({ value: 'todos', label: 'Todos (saldo total)' });
    const conceptos = kpis?.conceptos || [];
    for (const c of conceptos) {
      if (Number(c.tipo) === 0) list.push({ value: '0', label: 'Matrícula' });
      else list.push({ value: String(c.tipo), label: `Mensualidad ${c.concepto || ''}`.trim() });
    }
    return list;
  }, [kpis]);

  const cargarLista = async () => {
    const anioNum = parseInt(anio, 10);
    if (!anioNum) {
      Swal.fire({ icon: 'warning', title: 'Año inválido', text: 'Indique un año lectivo válido.' });
      return;
    }
    const tipoParam = tipoConcepto === 'todos' ? 'todos' : tipoConcepto;
    setLoadingLista(true);
    try {
      const params = { anio: anioNum, tipo: tipoParam };
      const gid = parseInt(grupoId, 10);
      if (Number.isFinite(gid) && gid > 0) params.grupo_id = gid;

      const { data } = await api.get('/admin/estadisticas/deudores-lista', {
        params
      });
      setMeta({
        colegio_nombre: data.colegio_nombre,
        anio: data.anio,
        moneda: data.moneda,
        concepto: data.concepto,
        total_alumnos_unicos: data.total_alumnos_unicos
      });
      setFilas(data.filas || []);
      if (!(data.filas || []).length) {
        Swal.fire({
          icon: 'info',
          title: 'Sin deudores',
          text: 'No hay alumnos con saldo pendiente para los filtros elegidos.',
          confirmButtonText: 'Aceptar'
        });
      }
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo cargar la lista.'
      });
    } finally {
      setLoadingLista(false);
    }
  };

  const descargarPdf = () => {
    if (!meta || !filas.length) {
      Swal.fire({ icon: 'info', title: 'Primero genere la lista', text: 'Pulse «Ver».' });
      return;
    }
    try {
      generarPdfListaDeudores({
        colegioNombre: meta.colegio_nombre,
        anio: meta.anio,
        moneda: meta.moneda,
        concepto: meta.concepto,
        modoAgrupacion: modoAgrupacion === 'por_grado' ? 'por_grado' : 'todo',
        filas,
        totalAlumnosUnicos,
        totalDeuda: totales.totalDeuda
      });
    } catch (e) {
      console.error(e);
      Swal.fire({ icon: 'error', title: 'PDF', text: 'No se pudo generar el PDF.' });
    }
  };

  return (
    <DashboardLayout>
      <div className="dashboard-container admin-deudores-reporte">
        <div className="admin-estadisticas-header">
          <h1 className="admin-estadisticas-title">Deudores</h1>
          <p className="admin-estadisticas-desc">
            Lista con teléfono del apoderado. La columna Detalle muestra lo registrado por el tutor en su seguimiento de deudores por concepto.
          </p>
        </div>

        <div className="admin-estadisticas-content">
          {loadingKpis ? (
            <p className="admin-estadisticas-placeholder">Cargando opciones…</p>
          ) : (
            <div className="admin-deudores-card">
              <div className="admin-deudores-card-header">Alumnos deudores</div>
              <div className="admin-deudores-toolbar" role="toolbar" aria-label="Filtros de deudores">
                <label htmlFor="deudores-anio">Año</label>
                <input
                  id="deudores-anio"
                  type="number"
                  min={2000}
                  max={2100}
                  value={anio}
                  onChange={(e) => setAnio(e.target.value)}
                />
                <label htmlFor="deudores-concepto">Concepto</label>
                <select
                  id="deudores-concepto"
                  value={tipoConcepto}
                  onChange={(e) => setTipoConcepto(e.target.value)}
                >
                  {opcionesConcepto.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <label htmlFor="deudores-grado">Grado</label>
                <select
                  id="deudores-grado"
                  className="admin-deudores-select-grado"
                  value={grupoId}
                  onChange={(e) => setGrupoId(e.target.value)}
                  aria-label="Filtrar por aula o grado"
                >
                  <option value="">Todos los grados</option>
                  {gruposOpciones.map((g) => (
                    <option key={g.id} value={String(g.id)}>
                      {etiquetaGrupoOpcion(g)}
                    </option>
                  ))}
                </select>
                <div className="admin-deudores-segment" role="group" aria-label="Formato PDF">
                  <button
                    type="button"
                    className={modoAgrupacion === 'todo' ? 'is-active' : ''}
                    onClick={() => setModoAgrupacion('todo')}
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    className={modoAgrupacion === 'por_grado' ? 'is-active' : ''}
                    onClick={() => setModoAgrupacion('por_grado')}
                  >
                    Separados
                  </button>
                </div>
                <span className="admin-deudores-toolbar-spacer" aria-hidden />
                <button
                  type="button"
                  className="admin-deudores-btn-compact admin-deudores-btn-compact--primary"
                  disabled={loadingLista}
                  onClick={cargarLista}
                >
                  {loadingLista ? '…' : 'Ver'}
                </button>
                <button
                  type="button"
                  className="admin-deudores-btn-compact admin-deudores-btn-compact--ghost"
                  disabled={!filas.length}
                  onClick={descargarPdf}
                >
                  PDF
                </button>
              </div>
            </div>
          )}

          <p className="admin-deudores-hint">
            El PDF replica la misma tabla: grado con nivel debajo, teléfono y columna Detalle (tutor) cuando exista texto guardado.
          </p>

          {!!filas.length && meta && (
            <div>
              <div className="admin-deudores-preview-headline">
                <span className="admin-deudores-preview-headline-left">
                  Total alumnos ({totalAlumnosUnicos})
                </span>
                <span className="admin-deudores-preview-headline-right">
                  Monto total {fmtMonto(totales.totalDeuda, meta.moneda)}
                </span>
              </div>
              <div className="admin-deudores-preview-wrap">
                <table className="admin-deudores-preview-table">
                  <thead>
                    <tr>
                      <th className="col-alumno">Alumno</th>
                      <th className="col-grado-nivel">Grado / Nivel</th>
                      <th className="col-concepto">Concepto</th>
                      <th className="col-monto">Monto</th>
                      <th className="col-tel">Tel. apoderado</th>
                      <th className="col-detalle">Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((r, i) => (
                      <tr key={`${r.matricula_id}-${r.concepto || 'x'}-${i}`}>
                        <td className="col-alumno">
                          <span className="admin-deudores-alumno-cell">{r.nombre}</span>
                        </td>
                        <td className="col-grado-nivel">
                          <span className="admin-deudores-grado-line">{r.grado_etiqueta}</span>
                          <span className="admin-deudores-nivel-sub">{r.nivel_nombre || '—'}</span>
                        </td>
                        <td className="col-concepto">{r.concepto || '—'}</td>
                        <td className="col-monto">{fmtMonto(r.monto, meta.moneda)}</td>
                        <td className="col-tel">{r.telefono_apoderado || '—'}</td>
                        <td className="col-detalle">
                          <span className="admin-deudores-detalle-cell">{r.detalle || '—'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="admin-deudores-preview-headline admin-deudores-preview-summary-below">
                <span className="admin-deudores-preview-headline-left">
                  Total alumnos ({totalAlumnosUnicos})
                </span>
                <span className="admin-deudores-preview-headline-right">
                  Monto total {fmtMonto(totales.totalDeuda, meta.moneda)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
