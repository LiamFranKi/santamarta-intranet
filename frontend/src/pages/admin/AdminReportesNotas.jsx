import React, { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import api from '../../services/api';
import Swal from 'sweetalert2';
import { generarPdfReporteNotas } from '../../utils/pdfReportesNotas';
import './AdminEstadisticas.css';
import './AdminReportesNotas.css';

const REPORT_CATALOG = [
  {
    bloque: 'A',
    titulo: 'Rankings',
    items: [
      {
        tipo: 'ranking-salones-general',
        label: 'Ranking de salones (general)',
        desc: 'Promedio académico por salón, sin conducta. Mayor a menor.',
        needs: []
      },
      {
        tipo: 'ranking-salones-curso',
        label: 'Ranking por curso',
        desc: 'Compara salones en una materia específica.',
        needs: ['curso_id']
      },
      {
        tipo: 'comparativa-secciones',
        label: 'Comparativa de secciones',
        desc: 'Mismo grado y nivel: secciones lado a lado.',
        needs: ['nivel_id', 'grado']
      },
      {
        tipo: 'conducta-salones',
        label: 'Ranking — Conducta',
        desc: 'Nota de conducta por salón (aparte del promedio académico).',
        needs: []
      }
    ]
  },
  {
    bloque: 'B',
    titulo: 'Análisis global',
    items: [
      {
        tipo: 'resumen-ejecutivo',
        label: 'Resumen ejecutivo',
        desc: 'KPIs institucionales y ranking de salones.',
        needs: []
      },
      {
        tipo: 'panel-general',
        label: 'Panel general',
        desc: 'Distribución por rangos de nota y aprobación.',
        needs: []
      },
      {
        tipo: 'mejores-cursos-colegio',
        label: 'Mejores cursos del colegio',
        desc: 'Promedio institucional por materia.',
        needs: []
      },
      {
        tipo: 'por-area',
        label: 'Promedio por área',
        desc: 'Desempeño por área curricular.',
        needs: []
      },
      {
        tipo: 'cobertura',
        label: 'Cobertura de registro',
        desc: '% de notas registradas vs esperadas por salón.',
        needs: []
      }
    ]
  },
  {
    bloque: 'C',
    titulo: 'Matrices y detalle',
    items: [
      {
        tipo: 'matriz-cursos-salones',
        label: 'Matriz cursos × salones',
        desc: 'Heatmap de promedios por materia y aula.',
        needs: []
      },
      {
        tipo: 'detalle-salon',
        label: 'Detalle del salón',
        desc: 'Alumnos, promedios y cursos del aula seleccionada.',
        needs: ['grupo_id']
      },
      {
        tipo: 'evolucion-bimestres',
        label: 'Evolución bimestral',
        desc: 'Promedio por bimestre (salón, nivel o institucional).',
        needs: []
      }
    ]
  },
  {
    bloque: 'D',
    titulo: 'Inicial',
    items: [
      {
        tipo: 'inicial-cualitativo',
        label: 'Inicial — Cualitativo',
        desc: 'Distribución AD / A / B / C y salones de inicial.',
        needs: ['nivel_id']
      }
    ]
  }
];

const ALL_REPORTS = REPORT_CATALOG.flatMap((b) => b.items.map((r) => ({ ...r, bloque: b.bloque, bloqueTitulo: b.titulo })));

function fmtNota(n) {
  if (n == null || n === '') return '\u2014';
  const v = typeof n === 'number' ? n : parseFloat(n);
  if (Number.isNaN(v)) return String(n);
  return v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n) {
  if (n == null || n === '') return '\u2014';
  return `${Number(n).toLocaleString('es-PE', { maximumFractionDigits: 1 })}%`;
}

function BarChart({ chart, variant = 'default', title = 'Gráfico' }) {
  if (!chart?.length) return null;
  const maxPct = Math.max(...chart.map((c) => c.pct ?? 0), 1);
  return (
    <div className="admin-notas-chart-panel">
      <h3 className="admin-notas-chart-title">{title}</h3>
      <div className="admin-notas-hbar-list">
        {chart.map((item, i) => {
          const pct = item.pct ?? (item.value != null ? (item.value / 20) * 100 : 0);
          const width = Math.max(2, Math.round((pct / maxPct) * 100));
          const fillClass =
            variant === 'conducta'
              ? 'admin-notas-hbar-fill admin-notas-hbar-fill--conducta'
              : variant === 'inicial'
                ? 'admin-notas-hbar-fill admin-notas-hbar-fill--inicial'
                : 'admin-notas-hbar-fill';
          return (
            <div key={`${item.label}-${i}`} className="admin-notas-hbar-row">
              <span className="admin-notas-hbar-label" title={item.label}>
                {item.label}
              </span>
              <div className="admin-notas-hbar-track">
                <div className={fillClass} style={{ width: `${width}%` }} />
              </div>
              <span className="admin-notas-hbar-value">
                {item.value != null ? fmtNota(item.value) : fmtPct(pct)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EvolucionChart({ series }) {
  if (!series?.length) return null;
  const max = Math.max(...series.map((s) => s.promedio ?? 0), 1);
  return (
    <div className="admin-notas-chart-panel">
      <h3 className="admin-notas-chart-title">Evolución por bimestre</h3>
      <div className="admin-notas-evolucion">
        {series.map((s) => {
          const h = s.promedio != null ? Math.max(4, (s.promedio / max) * 140) : 4;
          return (
            <div key={s.bimestre} className="admin-notas-evol-col">
              <span className="admin-notas-evol-val">{fmtNota(s.promedio)}</span>
              <div className="admin-notas-evol-bar" style={{ height: `${h}px` }} />
              <span className="admin-notas-evol-label">{s.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MatrizTable({ data }) {
  const { cursos = [], salones = [], celdas = [] } = data || {};
  const lookup = useMemo(() => {
    const m = new Map();
    celdas.forEach((c) => m.set(`${c.curso_id}:${c.grupo_id}`, c.promedio));
    return m;
  }, [celdas]);

  if (!cursos.length || !salones.length) {
    return <p className="admin-notas-empty">Sin datos para la matriz.</p>;
  }

  const allVals = celdas.map((c) => c.promedio).filter((v) => v != null);
  const avg = allVals.length ? allVals.reduce((s, v) => s + v, 0) / allVals.length : 0;

  return (
    <div className="admin-notas-matriz-wrap">
      <table className="admin-notas-matriz">
        <thead>
          <tr>
            <th className="col-sticky">Curso</th>
            {salones.map((s) => (
              <th key={s.grupo_id} title={s.label}>
                {s.label.length > 12 ? `${s.label.slice(0, 10)}…` : s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cursos.map((c) => (
            <tr key={c.curso_id}>
              <td className="col-sticky">{c.nombre}</td>
              {salones.map((s) => {
                const v = lookup.get(`${c.curso_id}:${s.grupo_id}`);
                let cls = '';
                if (v != null && v >= avg + 1) cls = 'cell-high';
                else if (v != null && v <= avg - 1) cls = 'cell-low';
                return (
                  <td key={s.grupo_id} className={cls}>
                    {fmtNota(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function buildPdfPayload(report, data, meta) {
  const base = {
    colegioNombre: data.colegio_nombre || meta?.colegio_nombre,
    titulo: data.titulo,
    anio: data.anio,
    ciclo: data.ciclo,
    chart: data.chart || data.chart_alumnos || data.chart_cursos
  };

  if (data.kpis) {
    const kpiList = [];
    if (data.kpis.promedio_institucional != null) {
      kpiList.push({ label: 'Prom. institucional', value: fmtNota(data.kpis.promedio_institucional) });
    }
    if (data.kpis.pct_aprobados != null) {
      kpiList.push({ label: '% aprobados', value: fmtPct(data.kpis.pct_aprobados) });
    }
    if (data.kpis.mejor_salon) {
      kpiList.push({
        label: 'Mejor salón',
        value: `${data.kpis.mejor_salon.label} (${fmtNota(data.kpis.mejor_salon.promedio)})`
      });
    }
    if (data.kpis.peor_salon) {
      kpiList.push({
        label: 'Menor salón',
        value: `${data.kpis.peor_salon.label} (${fmtNota(data.kpis.peor_salon.promedio)})`
      });
    }
    base.kpis = kpiList;
  }

  if (report.tipo === 'matriz-cursos-salones' && data.celdas) {
    const rows = data.cursos.map((c) => {
      const row = { curso: c.nombre };
      data.salones.forEach((s) => {
        const cell = data.celdas.find((x) => x.curso_id === c.curso_id && x.grupo_id === s.grupo_id);
        row[`g${s.grupo_id}`] = cell?.promedio;
      });
      return row;
    });
    const cols = [
      { key: 'curso', label: 'Curso', width: 2, align: 'left', format: 'text' },
      ...data.salones.map((s) => ({
        key: `g${s.grupo_id}`,
        label: s.label.length > 14 ? `${s.label.slice(0, 12)}…` : s.label,
        width: 1,
        format: 'nota'
      }))
    ];
    return { ...base, columns: cols, rows };
  }

  if (report.tipo === 'detalle-salon' && data.alumnos) {
    return {
      ...base,
      columns: [
        { key: 'puesto', label: '#', width: 0.5 },
        { key: 'nombre', label: 'Alumno', width: 2.5, align: 'left' },
        { key: 'promedio_academico', label: 'Prom. acad.', width: 1, format: 'nota' },
        { key: 'promedio_conducta', label: 'Conducta', width: 1, format: 'nota' }
      ],
      rows: data.alumnos
    };
  }

  if (data.filas?.length) {
    const isConducta = report.tipo === 'conducta-salones';
    const isRankingCurso = report.tipo === 'ranking-salones-curso';
    const isMejoresCursos = report.tipo === 'mejores-cursos-colegio';
    const isArea = report.tipo === 'por-area';
    const isCobertura = report.tipo === 'cobertura';

    const cols = [{ key: 'puesto', label: '#', width: 0.6 }];
    if (isMejoresCursos) {
      cols.push({ key: 'curso_nombre', label: 'Curso', width: 2, align: 'left' });
    } else if (isRankingCurso) {
      cols.push({ key: 'label', label: 'Grado / Salón', width: 2, align: 'left' });
    } else {
      cols.push({ key: 'label', label: 'Salón / Área', width: 2, align: 'left' });
    }
    if (isArea) cols.push({ key: 'area_nombre', label: 'Área', width: 1.5, align: 'left' });
    cols.push({
      key: 'promedio',
      label: isConducta ? 'Conducta' : 'Promedio',
      width: 1,
      format: 'nota'
    });
    if (isCobertura) {
      cols.push({ key: 'pct_cobertura', label: 'Cobertura', width: 1, format: 'pct' });
    }
    if (!isMejoresCursos && !isRankingCurso && !isArea && !isCobertura) {
      cols.push({ key: 'pct_aprobados', label: '% aprob.', width: 1, format: 'pct' });
    }
    if (isRankingCurso && data.curso_nombre) {
      base.titulo = `${data.titulo || report.label} — ${data.curso_nombre}`;
    }
    return { ...base, columns: cols, rows: data.filas };
  }

  if (data.distribucion) {
    return {
      ...base,
      columns: [
        { key: 'letra', label: 'Calificación', width: 1 },
        { key: 'cantidad', label: 'Cantidad', width: 1 }
      ],
      rows: Object.entries(data.distribucion)
        .filter(([k]) => k !== 'OTRO' || data.distribucion.OTRO > 0)
        .map(([letra, cantidad]) => ({ letra, cantidad }))
    };
  }

  return base;
}

function RankingTable({ filas, tipo }) {
  if (!filas?.length) return <p className="admin-notas-empty">No hay registros para los filtros seleccionados.</p>;
  const isConducta = tipo === 'conducta-salones';
  const isRankingCurso = tipo === 'ranking-salones-curso';
  const isMejoresCursos = tipo === 'mejores-cursos-colegio' || tipo === 'curso';
  const isCobertura = tipo === 'cobertura';
  const isArea = tipo === 'por-area';
  const isDetalle = tipo === 'detalle';

  return (
    <div className="admin-notas-table-wrap">
      <table className="admin-notas-table">
        <thead>
          <tr>
            <th className="col-puesto">#</th>
            {isMejoresCursos && <th>Curso</th>}
            {!isMejoresCursos && !isCobertura && (
              <th>{isArea ? 'Área' : isDetalle ? 'Alumno' : isRankingCurso ? 'Grado / Salón' : 'Salón'}</th>
            )}
            {isCobertura && <th>Salón</th>}
            <th>{isConducta ? 'Conducta' : isDetalle ? 'Prom. acad.' : 'Promedio'}</th>
            {isDetalle && <th>Conducta</th>}
            {isCobertura && <th>Cobertura</th>}
            {!isMejoresCursos && !isRankingCurso && !isArea && !isCobertura && !isDetalle && (
              <th>% aprob.</th>
            )}
            {!isMejoresCursos && !isRankingCurso && !isCobertura && !isDetalle && <th>Alumnos</th>}
            {isMejoresCursos && tipo === 'mejores-cursos-colegio' && <th>Secciones</th>}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.puesto ?? f.grupo_id ?? f.curso_id ?? f.area_id}>
              <td className="col-puesto">{f.puesto ?? '\u2014'}</td>
              <td className="col-left">
                {f.label || f.curso_nombre || f.area_nombre || '\u2014'}
              </td>
              <td>{fmtNota(f.promedio ?? f.promedio_academico)}</td>
              {isDetalle && <td>{fmtNota(f.promedio_conducta)}</td>}
              {isCobertura && <td>{fmtPct(f.pct_cobertura)}</td>}
              {!isMejoresCursos && !isRankingCurso && !isArea && !isCobertura && !isDetalle && (
                <td>{fmtPct(f.pct_aprobados)}</td>
              )}
              {!isMejoresCursos && !isRankingCurso && !isCobertura && !isDetalle && (
                <td>{f.alumnos_total ?? f.alumnos_con_conducta ?? '\u2014'}</td>
              )}
              {isMejoresCursos && tipo === 'mejores-cursos-colegio' && (
                <td>{f.secciones_evaluadas ?? '\u2014'}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminReportesNotas() {
  const [meta, setMeta] = useState(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [activeTipo, setActiveTipo] = useState(ALL_REPORTS[0].tipo);
  const [anio, setAnio] = useState('');
  const [ciclo, setCiclo] = useState('1');
  const [nivelId, setNivelId] = useState('');
  const [grado, setGrado] = useState('');
  const [grupoId, setGrupoId] = useState('');
  const [cursoId, setCursoId] = useState('');
  const [areaId, setAreaId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const report = useMemo(() => ALL_REPORTS.find((r) => r.tipo === activeTipo) || ALL_REPORTS[0], [activeTipo]);

  const esInicial = report.tipo === 'inicial-cualitativo';

  const nivelesOpciones = useMemo(() => {
    if (esInicial) return meta?.niveles_inicial || [];
    return meta?.niveles || [];
  }, [meta, esInicial]);

  const gradosOpciones = useMemo(() => {
    if (!meta?.grupos) return [];
    const set = new Set();
    const list = [];
    meta.grupos.forEach((g) => {
      if (nivelId && String(g.nivel_id) !== String(nivelId)) return;
      if (!esInicial && g.tipo_calificacion === 0) return;
      const key = `${g.nivel_id}:${g.grado}`;
      if (set.has(key)) return;
      set.add(key);
      list.push({ nivel_id: g.nivel_id, grado: g.grado, label: `${g.grado}°` });
    });
    return list;
  }, [meta, nivelId, esInicial]);

  const cursosOpciones = useMemo(() => {
    const vinculo = meta?.cursos_vinculo || [];
    const idsNumericos = new Set((meta?.niveles || []).map((n) => String(n.id)));
    let rows = vinculo.filter((r) => idsNumericos.has(String(r.nivel_id)));
    if (nivelId) rows = rows.filter((r) => String(r.nivel_id) === String(nivelId));
    if (grado) rows = rows.filter((r) => String(r.grado) === String(grado));
    const map = new Map();
    rows.forEach((r) => map.set(r.curso_id, { id: r.curso_id, nombre: r.curso_nombre }));
    return [...map.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [meta, nivelId, grado]);

  useEffect(() => {
    if (!cursoId) return;
    if (!cursosOpciones.some((c) => String(c.id) === String(cursoId))) {
      setCursoId('');
    }
  }, [cursosOpciones, cursoId]);

  const loadMeta = useCallback(async (anioNum) => {
    setLoadingMeta(true);
    try {
      const { data: m } = await api.get('/admin/reportes/notas/meta', {
        params: anioNum ? { anio: anioNum } : {}
      });
      setMeta(m);
      setAnio(String(m.anio || new Date().getFullYear()));
    } catch {
      setMeta(null);
    } finally {
      setLoadingMeta(false);
    }
  }, []);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    const anioNum = parseInt(anio, 10);
    if (!anioNum) return;
    const t = setTimeout(() => loadMeta(anioNum), 400);
    return () => clearTimeout(t);
  }, [anio, loadMeta]);

  const buildParams = () => {
    const p = { anio: parseInt(anio, 10), ciclo: parseInt(ciclo, 10) || 1 };
    if (nivelId) p.nivel_id = nivelId;
    if (grado) p.grado = grado;
    if (grupoId) p.grupo_id = grupoId;
    if (cursoId) p.curso_id = cursoId;
    if (areaId) p.area_id = areaId;
    return p;
  };

  const validarFiltros = () => {
    const anioNum = parseInt(anio, 10);
    if (!anioNum) {
      Swal.fire({ icon: 'warning', title: 'Año inválido', text: 'Indique un año lectivo válido.' });
      return false;
    }
    for (const need of report.needs) {
      if (need === 'curso_id' && !cursoId) {
        Swal.fire({ icon: 'warning', title: 'Curso requerido', text: 'Seleccione un curso.' });
        return false;
      }
      if (need === 'grupo_id' && !grupoId) {
        Swal.fire({ icon: 'warning', title: 'Salón requerido', text: 'Seleccione un salón / grupo.' });
        return false;
      }
      if (need === 'nivel_id' && !nivelId) {
        Swal.fire({ icon: 'warning', title: 'Nivel requerido', text: 'Seleccione un nivel educativo.' });
        return false;
      }
      if (need === 'grado' && !grado) {
        Swal.fire({ icon: 'warning', title: 'Grado requerido', text: 'Seleccione un grado.' });
        return false;
      }
    }
    return true;
  };

  const generar = async () => {
    if (!validarFiltros()) return;
    setLoading(true);
    try {
      const { data: res } = await api.get(`/admin/reportes/notas/reporte/${report.tipo}`, {
        params: buildParams()
      });
      setData(res);
    } catch (e) {
      setData(null);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: e.response?.data?.error || 'No se pudo generar el reporte.'
      });
    } finally {
      setLoading(false);
    }
  };

  const exportarPdf = () => {
    if (!data) {
      Swal.fire({ icon: 'info', title: 'Sin datos', text: 'Genere el reporte con «Ver reporte» primero.' });
      return;
    }
    try {
      const payload = buildPdfPayload(report, data, meta);
      if (!payload.rows?.length && !payload.chart?.length && !payload.kpis?.length) {
        Swal.fire({ icon: 'info', title: 'Sin contenido', text: 'No hay filas para exportar.' });
        return;
      }
      generarPdfReporteNotas(payload);
    } catch (e) {
      console.error(e);
      Swal.fire({ icon: 'error', title: 'PDF', text: 'No se pudo generar el PDF.' });
    }
  };

  const chartVariant = report.tipo === 'conducta-salones' ? 'conducta' : report.tipo === 'inicial-cualitativo' ? 'inicial' : 'default';

  return (
    <DashboardLayout>
      <div className="dashboard-container admin-notas-reporte">
        <div className="admin-estadisticas-header">
          <h1 className="admin-estadisticas-title">Reportes de notas</h1>
          <p className="admin-estadisticas-desc">
            Rankings, matrices, conducta, evolución bimestral y exportación PDF. El promedio académico no incluye conducta; use el reporte específico de conducta.
          </p>
        </div>

        {loadingMeta ? (
          <p className="admin-estadisticas-placeholder">Cargando opciones…</p>
        ) : (
          <div className="admin-notas-layout">
            <nav className="admin-notas-sidebar" aria-label="Tipos de reporte">
              <div className="admin-notas-sidebar-title">Informes</div>
              {REPORT_CATALOG.map((bloque) => (
                <div key={bloque.bloque}>
                  <div className="admin-notas-bloque-label">
                    {bloque.bloque}. {bloque.titulo}
                  </div>
                  {bloque.items.map((item) => (
                    <button
                      key={item.tipo}
                      type="button"
                      className={`admin-notas-nav-btn ${activeTipo === item.tipo ? 'is-active' : ''}`}
                      onClick={() => {
                        setActiveTipo(item.tipo);
                        setData(null);
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              ))}
            </nav>

            <div className="admin-notas-main">
              <div className="admin-notas-main-head">
                <h2>{report.label}</h2>
                <p>{report.desc}</p>
              </div>

              <div className="admin-notas-toolbar" role="toolbar" aria-label="Filtros">
                <label htmlFor="notas-anio">Año</label>
                <input
                  id="notas-anio"
                  type="number"
                  min={2000}
                  max={2100}
                  value={anio}
                  onChange={(e) => setAnio(e.target.value)}
                />
                <label htmlFor="notas-ciclo">Bimestre</label>
                <select id="notas-ciclo" value={ciclo} onChange={(e) => setCiclo(e.target.value)}>
                  <option value="1">1°</option>
                  <option value="2">2°</option>
                  <option value="3">3°</option>
                  <option value="4">4°</option>
                </select>
                <label htmlFor="notas-nivel">Nivel</label>
                <select
                  id="notas-nivel"
                  value={nivelId}
                  onChange={(e) => {
                    setNivelId(e.target.value);
                    setGrado('');
                    setGrupoId('');
                    setCursoId('');
                  }}
                >
                  <option value="">{esInicial ? '—' : 'Todos'}</option>
                  {nivelesOpciones.map((n) => (
                    <option key={n.id} value={String(n.id)}>{n.nombre}</option>
                  ))}
                </select>
                {(report.needs.includes('grado') || gradosOpciones.length > 0) && (
                  <>
                    <label htmlFor="notas-grado">Grado</label>
                    <select id="notas-grado" value={grado} onChange={(e) => { setGrado(e.target.value); setGrupoId(''); setCursoId(''); }}>
                      <option value="">—</option>
                      {gradosOpciones.map((g) => (
                        <option key={`${g.nivel_id}-${g.grado}`} value={String(g.grado)}>{g.label}</option>
                      ))}
                    </select>
                  </>
                )}
                {(report.needs.includes('grupo_id') || report.tipo === 'evolucion-bimestres') && (
                  <>
                    <label htmlFor="notas-grupo">Salón</label>
                    <select id="notas-grupo" value={grupoId} onChange={(e) => setGrupoId(e.target.value)}>
                      <option value="">Institucional</option>
                      {(meta?.grupos || [])
                        .filter((g) => !nivelId || String(g.nivel_id) === nivelId)
                        .filter((g) => !grado || String(g.grado) === grado)
                        .map((g) => (
                          <option key={g.grupo_id} value={String(g.grupo_id)}>{g.label}</option>
                        ))}
                    </select>
                  </>
                )}
                {report.needs.includes('curso_id') && (
                  <>
                    <label htmlFor="notas-curso">Curso</label>
                    <select id="notas-curso" value={cursoId} onChange={(e) => setCursoId(e.target.value)}>
                      <option value="">—</option>
                      {cursosOpciones.map((c) => (
                        <option key={c.id} value={String(c.id)}>{c.nombre}</option>
                      ))}
                    </select>
                  </>
                )}
                {report.tipo === 'por-area' && (
                  <>
                    <label htmlFor="notas-area">Área</label>
                    <select id="notas-area" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
                      <option value="">Todas</option>
                      {(meta?.areas || []).map((a) => (
                        <option key={a.id} value={String(a.id)}>{a.nombre}</option>
                      ))}
                    </select>
                  </>
                )}
                <button type="button" className="admin-notas-btn admin-notas-btn--primary" disabled={loading} onClick={generar}>
                  {loading ? '…' : 'Ver reporte'}
                </button>
                <button type="button" className="admin-notas-btn admin-notas-btn--ghost" disabled={!data} onClick={exportarPdf}>
                  PDF
                </button>
              </div>

              <p className="admin-notas-hint">
                {meta?.colegio_nombre ? `${meta.colegio_nombre} · ` : ''}
                Año {anio || '—'} · Bimestre {ciclo}
              </p>

              <div className="admin-notas-body">
                {!data && !loading && (
                  <p className="admin-notas-empty">Configure los filtros y pulse «Ver reporte».</p>
                )}
                {loading && <p className="admin-notas-empty">Generando…</p>}

                {data && !loading && (
                  <>
                    {data.kpis && (
                      <div className="admin-notas-kpis">
                        {data.kpis.promedio_institucional != null && (
                          <div className="admin-notas-kpi">
                            <div className="admin-notas-kpi-label">Prom. institucional</div>
                            <div className="admin-notas-kpi-value">{fmtNota(data.kpis.promedio_institucional)}</div>
                          </div>
                        )}
                        {data.kpis.pct_aprobados != null && (
                          <div className="admin-notas-kpi">
                            <div className="admin-notas-kpi-label">% aprobados</div>
                            <div className="admin-notas-kpi-value">{fmtPct(data.kpis.pct_aprobados)}</div>
                          </div>
                        )}
                        {data.kpis.mejor_salon && (
                          <div className="admin-notas-kpi">
                            <div className="admin-notas-kpi-label">Mejor salón</div>
                            <div className="admin-notas-kpi-value">{fmtNota(data.kpis.mejor_salon.promedio)}</div>
                            <div className="admin-notas-kpi-sub">{data.kpis.mejor_salon.label}</div>
                          </div>
                        )}
                        {data.kpis.peor_salon && (
                          <div className="admin-notas-kpi">
                            <div className="admin-notas-kpi-label">A reforzar</div>
                            <div className="admin-notas-kpi-value">{fmtNota(data.kpis.peor_salon.promedio)}</div>
                            <div className="admin-notas-kpi-sub">{data.kpis.peor_salon.label}</div>
                          </div>
                        )}
                        {data.kpis.total_salones != null && (
                          <div className="admin-notas-kpi">
                            <div className="admin-notas-kpi-label">Salones</div>
                            <div className="admin-notas-kpi-value">
                              {data.kpis.salones_con_datos ?? '—'} / {data.kpis.total_salones}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {data.distribucion && (
                      <div className="admin-notas-distrib">
                        {Object.entries(data.distribucion)
                          .filter(([k, v]) => v > 0 && k !== 'OTRO')
                          .map(([k, v]) => (
                            <span key={k} className="admin-notas-dist-chip">
                              {k}: {v}
                            </span>
                          ))}
                      </div>
                    )}

                    {report.tipo === 'matriz-cursos-salones' && <MatrizTable data={data} />}

                    {report.tipo === 'evolucion-bimestres' && (
                      <EvolucionChart series={data.series} />
                    )}

                    {report.tipo === 'detalle-salon' && (
                      <>
                        {data.stats && (
                          <div className="admin-notas-kpis">
                            <div className="admin-notas-kpi">
                              <div className="admin-notas-kpi-label">Prom. salón</div>
                              <div className="admin-notas-kpi-value">{fmtNota(data.stats.promedio)}</div>
                            </div>
                            <div className="admin-notas-kpi">
                              <div className="admin-notas-kpi-label">% aprobados</div>
                              <div className="admin-notas-kpi-value">{fmtPct(data.stats.pct_aprobados)}</div>
                            </div>
                          </div>
                        )}
                        <div className="admin-notas-split">
                          <div>
                            <h3 className="admin-notas-section-title">Alumnos</h3>
                            <RankingTable
                              filas={data.alumnos?.map((a) => ({
                                ...a,
                                label: a.nombre,
                                promedio: a.promedio_academico
                              }))}
                              tipo="detalle"
                            />
                          </div>
                          <BarChart chart={data.chart_alumnos} title="Top alumnos" />
                        </div>
                        <div className="admin-notas-split">
                          <div>
                            <h3 className="admin-notas-section-title">Por curso</h3>
                            <RankingTable
                              filas={data.cursos?.map((c, i) => ({
                                puesto: i + 1,
                                label: c.curso_nombre,
                                promedio: c.promedio
                              }))}
                              tipo="curso"
                            />
                          </div>
                          <BarChart chart={data.chart_cursos} title="Cursos del salón" />
                        </div>
                      </>
                    )}

                    {report.tipo !== 'matriz-cursos-salones' &&
                      report.tipo !== 'evolucion-bimestres' &&
                      report.tipo !== 'detalle-salon' &&
                      data.filas && (
                        <div className="admin-notas-split">
                          <RankingTable
                            filas={data.filas}
                            tipo={report.tipo === 'ranking-salones-curso' ? 'ranking-salones-curso' : report.tipo}
                          />
                          {data.chart?.length > 0 && (
                            <BarChart chart={data.chart} variant={chartVariant} title="Comparativo visual" />
                          )}
                        </div>
                      )}

                    {report.tipo === 'panel-general' && data.chart?.length > 0 && !data.filas && (
                      <BarChart chart={data.chart} title="Distribución por rangos" />
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

