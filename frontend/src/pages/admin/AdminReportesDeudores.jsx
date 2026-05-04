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

  const totales = useMemo(() => {
    const n = filas.length;
    const suma = filas.reduce((s, r) => s + (parseFloat(r.monto) || 0), 0);
    return { totalAlumnos: n, totalDeuda: Math.round(suma * 100) / 100 };
  }, [filas]);

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
      const { data } = await api.get('/admin/estadisticas/deudores-lista', {
        params: { anio: anioNum, tipo: tipoParam }
      });
      setMeta({
        colegio_nombre: data.colegio_nombre,
        anio: data.anio,
        moneda: data.moneda,
        concepto: data.concepto
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
        totalAlumnos: totales.totalAlumnos,
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
            Lista con teléfono del apoderado y columna de observaciones para el tutor.
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
            En PDF se incluye columna de observaciones en blanco para apuntes a mano; la tabla en pantalla muestra solo los datos útiles.
          </p>

          {!!filas.length && meta && (
            <div>
              <div className="admin-deudores-preview-headline">
                <span className="admin-deudores-preview-headline-left">
                  Total alumnos ({filas.length})
                </span>
                <span className="admin-deudores-preview-headline-right">
                  Monto total {fmtMonto(totales.totalDeuda, meta.moneda)}
                </span>
              </div>
              <div className="admin-deudores-preview-wrap">
                <table className="admin-deudores-preview-table">
                  <thead>
                    <tr>
                      <th className="col-num">N°</th>
                      <th className="col-alumno">Alumno</th>
                      <th className="col-nivel">Nivel</th>
                      <th className="col-grado">Grado</th>
                      <th className="col-monto">Monto</th>
                      <th className="col-tel">Tel. apoderado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((r, i) => (
                      <tr key={`${r.matricula_id}-${i}`}>
                        <td className="col-num">{i + 1}</td>
                        <td className="col-alumno">{r.nombre}</td>
                        <td className="col-nivel">{r.nivel_nombre || '—'}</td>
                        <td className="col-grado">{r.grado_etiqueta}</td>
                        <td className="col-monto">{fmtMonto(r.monto, meta.moneda)}</td>
                        <td className="col-tel">{r.telefono_apoderado || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3} className="deudores-tfoot-label">
                        Total alumnos
                      </td>
                      <td colSpan={3} className="deudores-tfoot-value">
                        {totales.totalAlumnos}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={3} className="deudores-tfoot-label">
                        Total deuda
                      </td>
                      <td colSpan={3} className="deudores-tfoot-value">
                        {fmtMonto(totales.totalDeuda, meta.moneda)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
