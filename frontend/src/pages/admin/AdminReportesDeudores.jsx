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
    list.push({ value: 'todos', label: '-- TODOS (saldo total pendiente) --' });
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
      Swal.fire({ icon: 'info', title: 'Primero genere la lista', text: 'Pulse «Ver reporte».' });
      return;
    }
    try {
      generarPdfListaDeudores({
        colegioNombre: meta.colegio_nombre,
        anio: meta.anio,
        moneda: meta.moneda,
        concepto: meta.concepto,
        modoAgrupacion: modoAgrupacion === 'por_grado' ? 'por_grado' : 'todo',
        filas
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
            Lista imprimible con teléfono del apoderado y columna de observaciones para uso del tutor.
          </p>
        </div>

        <div className="admin-estadisticas-content">
          {loadingKpis ? (
            <p className="admin-estadisticas-placeholder">Cargando opciones…</p>
          ) : (
            <div className="admin-deudores-card">
              <div className="admin-deudores-card-header">Alumnos deudores</div>
              <div className="admin-deudores-card-body">
                <div className="admin-deudores-field admin-deudores-field--anio">
                  <label htmlFor="deudores-anio">Mostrar deudores de</label>
                  <input
                    id="deudores-anio"
                    type="number"
                    min={2000}
                    max={2100}
                    value={anio}
                    onChange={(e) => setAnio(e.target.value)}
                  />
                </div>
                <div className="admin-deudores-field admin-deudores-field--concepto">
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
                </div>

                <div className="admin-deudores-agrupacion">
                  <span>Impresión PDF</span>
                  <label className="admin-deudores-radio">
                    <input
                      type="radio"
                      name="agrup-deudores"
                      checked={modoAgrupacion === 'todo'}
                      onChange={() => setModoAgrupacion('todo')}
                    />
                    Todo junto (una lista)
                  </label>
                  <label className="admin-deudores-radio">
                    <input
                      type="radio"
                      name="agrup-deudores"
                      checked={modoAgrupacion === 'por_grado'}
                      onChange={() => setModoAgrupacion('por_grado')}
                    />
                    Separado por grados (cada grado en hoja distinta)
                  </label>

                  <div className="admin-deudores-actions">
                    <button
                      type="button"
                      className="admin-deudores-btn"
                      disabled={loadingLista}
                      onClick={cargarLista}
                    >
                      {loadingLista ? 'Cargando…' : 'Ver reporte'}
                    </button>
                    <button
                      type="button"
                      className="admin-deudores-btn admin-deudores-btn-secondary"
                      disabled={!filas.length}
                      onClick={descargarPdf}
                    >
                      Descargar PDF
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <p className="admin-deudores-hint">
            El PDF incluye columnas N°, alumno, grado, monto, teléfono del apoderado y observaciones en blanco con altura
            amplia para apuntes a mano.
          </p>

          {!!filas.length && meta && (
            <div style={{ marginTop: '1rem' }}>
              <h2 className="admin-estadisticas-subtitle" style={{ fontSize: '1.05rem' }}>
                Vista previa ({filas.length} alumno{filas.length === 1 ? '' : 's'})
              </h2>
              <div className="admin-deudores-preview-wrap">
                <table className="admin-deudores-preview-table">
                  <thead>
                    <tr>
                      <th className="col-num">N°</th>
                      <th>Alumno</th>
                      <th>Grado</th>
                      <th className="col-monto">Monto</th>
                      <th>Tel. apoderado</th>
                      <th className="col-obs">Observaciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((r, i) => (
                      <tr key={`${r.matricula_id}-${i}`}>
                        <td className="col-num">{i + 1}</td>
                        <td>{r.nombre}</td>
                        <td>{r.grado_etiqueta}</td>
                        <td className="col-monto">{fmtMonto(r.monto, meta.moneda)}</td>
                        <td>{r.telefono_apoderado || '—'}</td>
                        <td className="col-obs" aria-label="Espacio para observaciones" />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
