import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import api from '../../services/api';
import Swal from 'sweetalert2';
import jsPDF from 'jspdf';
import '../../pages/DocenteTutoria.css';
import { etiquetaOrigenConducta, claseOrigenConducta } from '../../utils/reglaConducta';

/** Rango inicial para reportes (año lectivo → hoy) */
function rangoFechasReporteGrupo(anioEscolar) {
  const a = Number(anioEscolar) || new Date().getFullYear();
  const desde = `${a}-01-01`;
  const hasta = new Date().toISOString().slice(0, 10);
  return { desde, hasta };
}

function formatearSoloFecha(f) {
  if (f == null || f === '') return '—';
  if (typeof f === 'string' && /^\d{4}-\d{2}-\d{2}/.test(f)) {
    const [y, m, d] = f.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  try {
    return new Date(f).toLocaleDateString('es-PE');
  } catch {
    return String(f);
  }
}

function formatearFechaHoraPeru(iso) {
  if (iso == null || iso === '') return '—';
  try {
    return new Date(iso).toLocaleString('es-PE', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return String(iso);
  }
}

const PASTEL_TUTOR_EVIDENCIA = [
  { bg: 'linear-gradient(145deg,#fff7ed 0%, #ffedd5 100%)', border: '#fdba74', accent: '#9a3412' },
  { bg: 'linear-gradient(145deg,#eff6ff 0%, #dbeafe 100%)', border: '#93c5fd', accent: '#1e40af' },
  { bg: 'linear-gradient(145deg,#f0fdf4 0%, #dcfce7 100%)', border: '#86efac', accent: '#166534' },
  { bg: 'linear-gradient(145deg,#fdf4ff 0%, #fae8ff 100%)', border: '#e879f9', accent: '#86198f' },
  { bg: 'linear-gradient(145deg,#ecfeff 0%, #cffafe 100%)', border: '#22d3ee', accent: '#0e7490' },
  { bg: 'linear-gradient(145deg,#fefce8 0%,#fef08a 65%)', border: '#eab308', accent: '#854d0e' },
];

/**
 * Modales + PDF de descuentos (presentación) e incidencias de grupo.
 * @param {{ apiPathPrefix: 'docente/grupos' | 'docente/tutoria/grupos', anioFallback?: number }} opts
 */
export function useGrupoReportesConducta({ apiPathPrefix, anioFallback } = {}) {
  const prefix = apiPathPrefix || 'docente/grupos';

  const [targetGrupo, setTargetGrupo] = useState(null);
  const [modalDescuentosPresentacionAbierto, setModalDescuentosPresentacionAbierto] = useState(false);
  const [modalIncidenciasGrupoAbierto, setModalIncidenciasGrupoAbierto] = useState(false);
  const [fechaDescuentosDesde, setFechaDescuentosDesde] = useState('');
  const [fechaDescuentosHasta, setFechaDescuentosHasta] = useState('');
  const [cicloDescuentos, setCicloDescuentos] = useState(1);
  const [cicloIncidencias, setCicloIncidencias] = useState(1);
  const [rangoIncidencias, setRangoIncidencias] = useState({ desde: '', hasta: '' });
  const [cicloEstrellas, setCicloEstrellas] = useState(1);
  const [rangoEstrellas, setRangoEstrellas] = useState({ desde: '', hasta: '' });
  const [dataDescuentosPorAlumno, setDataDescuentosPorAlumno] = useState([]);
  const [dataIncidenciasPorAlumno, setDataIncidenciasPorAlumno] = useState([]);
  const [dataEstrellasPorAlumno, setDataEstrellasPorAlumno] = useState([]);
  const [modalEstrellasGrupoAbierto, setModalEstrellasGrupoAbierto] = useState(false);
  const [loadingDescuentosRep, setLoadingDescuentosRep] = useState(false);
  const [loadingIncidenciasRep, setLoadingIncidenciasRep] = useState(false);
  const [loadingEstrellasRep, setLoadingEstrellasRep] = useState(false);

  const cerrarDescuentos = useCallback(() => {
    setModalDescuentosPresentacionAbierto(false);
    setDataDescuentosPorAlumno([]);
  }, []);

  const cerrarIncidencias = useCallback(() => {
    setModalIncidenciasGrupoAbierto(false);
    setDataIncidenciasPorAlumno([]);
  }, []);

  const cerrarEstrellas = useCallback(() => {
    setModalEstrellasGrupoAbierto(false);
    setDataEstrellasPorAlumno([]);
  }, []);

  const cerrarTodo = useCallback(() => {
    cerrarDescuentos();
    cerrarIncidencias();
    cerrarEstrellas();
    setTargetGrupo(null);
  }, [cerrarDescuentos, cerrarIncidencias, cerrarEstrellas]);

  const anioParaGrupo = useCallback(
    (grupo) => Number(grupo?.anio ?? anioFallback) || new Date().getFullYear(),
    [anioFallback]
  );

  const cargarReporteDescuentosPresentacion = useCallback(async () => {
    if (!targetGrupo?.id) return;
    setLoadingDescuentosRep(true);
    try {
      const { data } = await api.get(
        `/${prefix}/${targetGrupo.id}/reporte-descuentos-presentacion`,
        { params: { ciclo: cicloDescuentos } }
      );
      setDataDescuentosPorAlumno(data.alumnos || []);
      setFechaDescuentosDesde(data.fecha_desde || '');
      setFechaDescuentosHasta(data.fecha_hasta || '');
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudo cargar descuentos' });
      setDataDescuentosPorAlumno([]);
    } finally {
      setLoadingDescuentosRep(false);
    }
  }, [prefix, targetGrupo, cicloDescuentos]);

  const cargarReporteIncidenciasGrupo = useCallback(async () => {
    if (!targetGrupo?.id) return;
    setLoadingIncidenciasRep(true);
    try {
      const { data } = await api.get(`/${prefix}/${targetGrupo.id}/reporte-incidencias-grupo`, {
        params: { ciclo: cicloIncidencias },
      });
      setDataIncidenciasPorAlumno(data.alumnos || []);
      setRangoIncidencias({ desde: data.fecha_desde || '', hasta: data.fecha_hasta || '' });
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudieron cargar incidencias' });
      setDataIncidenciasPorAlumno([]);
    } finally {
      setLoadingIncidenciasRep(false);
    }
  }, [prefix, targetGrupo, cicloIncidencias]);

  const cargarReporteEstrellasGrupo = useCallback(async () => {
    if (!targetGrupo?.id) return;
    setLoadingEstrellasRep(true);
    try {
      const { data } = await api.get(`/${prefix}/${targetGrupo.id}/reporte-estrellas-grupo`, {
        params: { ciclo: cicloEstrellas },
      });
      setDataEstrellasPorAlumno(data.alumnos || []);
      setRangoEstrellas({ desde: data.fecha_desde || '', hasta: data.fecha_hasta || '' });
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudieron cargar estrellas' });
      setDataEstrellasPorAlumno([]);
    } finally {
      setLoadingEstrellasRep(false);
    }
  }, [prefix, targetGrupo, cicloEstrellas]);

  const openDescuentosPresentacion = useCallback(
    async (grupo) => {
      if (!grupo?.id) return;
      const a = anioParaGrupo(grupo);
      setTargetGrupo({ ...grupo, anio: grupo.anio ?? a });
      setCicloDescuentos(1);
      setModalIncidenciasGrupoAbierto(false);
      setModalEstrellasGrupoAbierto(false);
      setModalDescuentosPresentacionAbierto(true);
      setLoadingDescuentosRep(true);
      try {
        const { data } = await api.get(
          `/${prefix}/${grupo.id}/reporte-descuentos-presentacion`,
          { params: { ciclo: 1 } }
        );
        setDataDescuentosPorAlumno(data.alumnos || []);
        setFechaDescuentosDesde(data.fecha_desde || '');
        setFechaDescuentosHasta(data.fecha_hasta || '');
      } catch (e) {
        Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudo cargar descuentos' });
        setDataDescuentosPorAlumno([]);
      } finally {
        setLoadingDescuentosRep(false);
      }
    },
    [prefix, anioParaGrupo]
  );

  const openIncidenciasGrupo = useCallback(
    async (grupo) => {
      if (!grupo?.id) return;
      const a = anioParaGrupo(grupo);
      setTargetGrupo({ ...grupo, anio: grupo.anio ?? a });
      setCicloIncidencias(1);
      setModalDescuentosPresentacionAbierto(false);
      setModalEstrellasGrupoAbierto(false);
      setModalIncidenciasGrupoAbierto(true);
      setLoadingIncidenciasRep(true);
      try {
        const { data } = await api.get(`/${prefix}/${grupo.id}/reporte-incidencias-grupo`, {
          params: { ciclo: 1 },
        });
        setDataIncidenciasPorAlumno(data.alumnos || []);
        setRangoIncidencias({ desde: data.fecha_desde || '', hasta: data.fecha_hasta || '' });
      } catch (e) {
        Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudieron cargar incidencias' });
        setDataIncidenciasPorAlumno([]);
      } finally {
        setLoadingIncidenciasRep(false);
      }
    },
    [prefix, anioParaGrupo]
  );

  const openEstrellasGrupo = useCallback(
    async (grupo) => {
      if (!grupo?.id) return;
      const a = anioParaGrupo(grupo);
      setTargetGrupo({ ...grupo, anio: grupo.anio ?? a });
      setCicloEstrellas(1);
      setModalDescuentosPresentacionAbierto(false);
      setModalIncidenciasGrupoAbierto(false);
      setModalEstrellasGrupoAbierto(true);
      setLoadingEstrellasRep(true);
      try {
        const { data } = await api.get(`/${prefix}/${grupo.id}/reporte-estrellas-grupo`, {
          params: { ciclo: 1 },
        });
        setDataEstrellasPorAlumno(data.alumnos || []);
        setRangoEstrellas({ desde: data.fecha_desde || '', hasta: data.fecha_hasta || '' });
      } catch (e) {
        Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudieron cargar estrellas' });
        setDataEstrellasPorAlumno([]);
      } finally {
        setLoadingEstrellasRep(false);
      }
    },
    [prefix, anioParaGrupo]
  );

  const aplicarFiltrosDescuentosYResumen = useCallback(async () => {
    await cargarReporteDescuentosPresentacion();
  }, [cargarReporteDescuentosPresentacion]);

  const aplicarFiltrosIncidenciasYResumen = useCallback(async () => {
    await cargarReporteIncidenciasGrupo();
  }, [cargarReporteIncidenciasGrupo]);

  const exportPdfDescuentosPresentacion = useCallback(() => {
    if (!targetGrupo || !dataDescuentosPorAlumno?.length) {
      Swal.fire({ icon: 'info', title: 'No hay Descuentos', text: 'No hay registros en el rango de fechas seleccionado.' });
      return;
    }
    const doc = new jsPDF('p', 'mm', 'a4');
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const mm = 14;
    const innerW = pw - 2 * mm;
    const footerReserve = 12;
    const yBottom = () => ph - footerReserve;
    const lineStep = 4.1;
    const tituloGrupo = `${targetGrupo.grado}° ${targetGrupo.seccion} - ${targetGrupo.nivel_nombre}`;

    const paletasDesc = [
      { f: [255, 247, 237], b: [253, 186, 116], t: [154, 52, 18] },
      { f: [239, 246, 255], b: [147, 197, 253], t: [30, 64, 175] },
      { f: [240, 253, 244], b: [134, 239, 172], t: [22, 101, 52] },
      { f: [253, 244, 255], b: [232, 121, 249], t: [134, 25, 143] },
      { f: [236, 254, 255], b: [34, 211, 238], t: [14, 116, 144] },
      { f: [254, 252, 232], b: [234, 179, 8], t: [133, 77, 14] },
    ];

    let y = 0;
    const pintarCabeceraPrincipalDesc = () => {
      doc.setFillColor(254, 243, 199);
      doc.rect(0, 0, pw, 28, 'F');
      doc.setDrawColor(251, 191, 36);
      doc.setLineWidth(0.4);
      doc.rect(0, 0, pw, 28, 'S');
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(146, 64, 14);
      doc.text('Descuentos por presentación (asistencia / QR)', mm + 2, 11);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120, 53, 15);
      doc.text(`${tituloGrupo} · Año ${targetGrupo.anio || ''}`, mm + 2, 18);
      doc.setTextColor(71, 85, 105);
      doc.text(
        `Periodo: ${formatearSoloFecha(fechaDescuentosDesde)} → ${formatearSoloFecha(fechaDescuentosHasta)}`,
        mm + 2,
        24
      );
      y = 34;
    };

    const nuevaPaginaDesc = () => {
      doc.addPage();
      doc.setFillColor(254, 243, 199);
      doc.rect(0, 0, pw, 16, 'F');
      doc.setDrawColor(251, 191, 36);
      doc.rect(0, 0, pw, 16, 'S');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(146, 64, 14);
      doc.text('Descuentos por presentación (continúa)', mm + 2, 9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.setFontSize(8);
      doc.text(
        `Periodo: ${formatearSoloFecha(fechaDescuentosDesde)} → ${formatearSoloFecha(fechaDescuentosHasta)}`,
        mm + 2,
        14
      );
      y = 20;
    };

    pintarCabeceraPrincipalDesc();

    dataDescuentosPorAlumno.forEach((al, idxAl) => {
      const pal = paletasDesc[idxAl % paletasDesc.length];
      const lineas = [];
      (al.registros || []).forEach((r) => {
        const linea = `${formatearSoloFecha(r.fecha)} ${String(r.hora || '').slice(0, 8)} · ${r.puntos ?? ''} pts · ${r.motivo || ''} · Reg.: ${r.registrado_por_nombre || '—'}`;
        lineas.push(...doc.splitTextToSize(linea, innerW - 8));
      });
      const tituloCard = `${al.alumno_nombre || 'Alumno'}  ·  Σ puntos: ${al.suma_puntos ?? 0}`;
      const alturaTitulo = 7;
      const alturaLineas = Math.max(lineas.length, 1) * lineStep;
      const pad = 5;
      const bloqueH = pad + alturaTitulo + 2 + alturaLineas + pad;

      if (y + bloqueH > yBottom()) {
        nuevaPaginaDesc();
      }

      const y0 = y;
      doc.setFillColor(...pal.f);
      doc.setDrawColor(...pal.b);
      doc.setLineWidth(0.25);
      doc.rect(mm, y0, innerW, bloqueH, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...pal.t);
      doc.text(tituloCard, mm + pad, y0 + pad + 5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(51, 65, 85);
      let yLine = y0 + pad + alturaTitulo + 3;
      lineas.forEach((ln) => {
        if (yLine + lineStep > y0 + bloqueH - 2) return;
        doc.text(ln, mm + pad + 2, yLine);
        yLine += lineStep;
      });

      y = y0 + bloqueH + 4;
    });

    const genTxt = `Generado: ${new Date().toLocaleString('es-PE')}`;
    const totalP = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalP; p += 1) {
      doc.setPage(p);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(genTxt, mm, ph - 5);
      doc.text(`Pág. ${p} / ${totalP}`, pw - mm, ph - 5, { align: 'right' });
    }

    doc.save(`${tituloGrupo.replace(/\s+/g, '_')}_descuentos_presentacion.pdf`);
    Swal.fire({ icon: 'success', title: 'PDF generado', timer: 1800, showConfirmButton: false });
  }, [targetGrupo, dataDescuentosPorAlumno, fechaDescuentosDesde, fechaDescuentosHasta]);

  const exportPdfIncidenciasGrupoReporte = useCallback(() => {
    if (!targetGrupo || !dataIncidenciasPorAlumno?.length) {
      Swal.fire({ icon: 'info', title: 'No hay Incidencias', text: 'No hay registros en el rango de fechas seleccionado.' });
      return;
    }
    const doc = new jsPDF('p', 'mm', 'a4');
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const mm = 14;
    const innerW = pw - 2 * mm;
    const footerReserve = 12;
    const yBottom = () => ph - footerReserve;
    const lineStep = 4;
    const tituloGrupo = `${targetGrupo.grado}° ${targetGrupo.seccion} - ${targetGrupo.nivel_nombre}`;

    const paletasInc = [
      { f: [250, 245, 255], b: [216, 180, 254], t: [107, 33, 168] },
      { f: [239, 246, 255], b: [165, 180, 252], t: [67, 56, 202] },
      { f: [255, 247, 237], b: [251, 207, 232], t: [157, 23, 77] },
      { f: [240, 253, 250], b: [153, 246, 228], t: [15, 118, 110] },
      { f: [254, 252, 232], b: [253, 224, 71], t: [113, 63, 18] },
      { f: [248, 250, 252], b: [203, 213, 225], t: [51, 65, 85] },
    ];

    let y = 0;
    const pintarCabeceraPrincipalInc = () => {
      doc.setFillColor(243, 232, 255);
      doc.rect(0, 0, pw, 28, 'F');
      doc.setDrawColor(192, 132, 252);
      doc.setLineWidth(0.4);
      doc.rect(0, 0, pw, 28, 'S');
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(91, 33, 182);
      doc.text('Incidencias del grupo', mm + 2, 11);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(88, 28, 135);
      doc.text(`${tituloGrupo} · Año ${targetGrupo.anio || ''}`, mm + 2, 18);
      doc.setTextColor(71, 85, 105);
      doc.text(`Bimestre ${cicloIncidencias} · ${formatearSoloFecha(rangoIncidencias.desde)} → ${formatearSoloFecha(rangoIncidencias.hasta)}`, mm + 2, 24);
      y = 34;
    };

    const nuevaPaginaInc = () => {
      doc.addPage();
      doc.setFillColor(243, 232, 255);
      doc.rect(0, 0, pw, 16, 'F');
      doc.setDrawColor(192, 132, 252);
      doc.rect(0, 0, pw, 16, 'S');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(91, 33, 182);
      doc.text('Incidencias del grupo (continúa)', mm + 2, 9);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(`Bimestre ${cicloIncidencias} · ${formatearSoloFecha(rangoIncidencias.desde)} → ${formatearSoloFecha(rangoIncidencias.hasta)}`, mm + 2, 14);
      y = 20;
    };

    pintarCabeceraPrincipalInc();

    dataIncidenciasPorAlumno.forEach((al, idxAl) => {
      const pal = paletasInc[idxAl % paletasInc.length];
      const bloques = [];
      (al.incidencias || []).forEach((inc) => {
        const cab = `${formatearFechaHoraPeru(inc.created_at)}  ·  ${inc.docente_nombre || '—'}  ·  ${inc.curso_nombre || '—'}`;
        const det = (inc.description || '').trim();
        const lineasCab = doc.splitTextToSize(cab, innerW - 10);
        const lineasDet = det ? doc.splitTextToSize(det, innerW - 10) : [];
        bloques.push({ lineasCab, lineasDet });
      });

      let alturaEst = 7;
      bloques.forEach((b) => {
        alturaEst += b.lineasCab.length * lineStep + 1 + b.lineasDet.length * lineStep + 3;
      });
      const pad = 5;
      const bloqueH = pad + alturaEst + pad;

      if (y + bloqueH > yBottom()) {
        nuevaPaginaInc();
      }

      const y0 = y;
      doc.setFillColor(...pal.f);
      doc.setDrawColor(...pal.b);
      doc.setLineWidth(0.25);
      doc.rect(mm, y0, innerW, bloqueH, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...pal.t);
      doc.text(String(al.alumno_nombre || 'Alumno'), mm + pad, y0 + pad + 5);

      let yLine = y0 + pad + 8;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.3);
      bloques.forEach((b) => {
        doc.setTextColor(30, 41, 59);
        b.lineasCab.forEach((ln) => {
          if (yLine > y0 + bloqueH - pad) return;
          doc.text(ln, mm + pad + 2, yLine);
          yLine += lineStep;
        });
        doc.setTextColor(71, 85, 105);
        b.lineasDet.forEach((ln) => {
          if (yLine > y0 + bloqueH - pad) return;
          doc.text(ln, mm + pad + 3, yLine);
          yLine += lineStep;
        });
        yLine += 2;
      });

      y = y0 + bloqueH + 4;
    });

    const genTxt = `Generado: ${new Date().toLocaleString('es-PE')}`;
    const totalP = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalP; p += 1) {
      doc.setPage(p);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(genTxt, mm, ph - 5);
      doc.text(`Pág. ${p} / ${totalP}`, pw - mm, ph - 5, { align: 'right' });
    }

    doc.save(`${tituloGrupo.replace(/\s+/g, '_')}_incidencias_grupo.pdf`);
    Swal.fire({ icon: 'success', title: 'PDF generado', timer: 1800, showConfirmButton: false });
  }, [targetGrupo, dataIncidenciasPorAlumno, cicloIncidencias, rangoIncidencias]);

  const ReportesModals = (
    <>
      {modalDescuentosPresentacionAbierto && targetGrupo &&
        createPortal(
          <div
            className="tutor-evidencias-overlay"
            onClick={cerrarDescuentos}
            role="presentation"
          >
            <div className="tutor-evidencias-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="titulo-desc-evid-gr">
              <header className="tutor-evidencias-panel-header tutor-evidencias-panel-header--descuentos">
                <div>
                  <h2 id="titulo-desc-evid-gr">Descuentos por presentación</h2>
                  <p className="tutor-evidencias-panel-sub">
                    Grupo{' '}
                    <strong>
                      {targetGrupo.grado}° {targetGrupo.seccion} — {targetGrupo.nivel_nombre}
                    </strong>{' '}
                    · puntos aplicados al marcar asistencia (uniforme/presentación)
                  </p>
                </div>
                <button type="button" className="tutor-evidencias-close" onClick={cerrarDescuentos} aria-label="Cerrar">
                  ✕
                </button>
              </header>
              <div className="tutor-evidencias-toolbar">
                <label className="tutor-evidencias-date">
                  Bimestre{' '}
                  <select
                    value={cicloDescuentos}
                    onChange={(e) => setCicloDescuentos(parseInt(e.target.value, 10))}
                  >
                    <option value={1}>I</option>
                    <option value={2}>II</option>
                    <option value={3}>III</option>
                    <option value={4}>IV</option>
                  </select>
                </label>
                {(fechaDescuentosDesde || fechaDescuentosHasta) && (
                  <span className="conducta-rango-hint">
                    {formatearSoloFecha(fechaDescuentosDesde)} → {formatearSoloFecha(fechaDescuentosHasta)}
                  </span>
                )}
                <button type="button" className="tutor-evidencias-btn aplicar" onClick={aplicarFiltrosDescuentosYResumen}>
                  Aplicar bimestre
                </button>
                <button type="button" className="tutor-evidencias-btn pdf" onClick={exportPdfDescuentosPresentacion}>
                  📄 Exportar PDF
                </button>
              </div>
              <div className="tutor-evidencias-body">
                {loadingDescuentosRep ? (
                  <div className="modal-registro-asistencia-loading">
                    <div className="loading-spinner" />
                    <p>Cargando…</p>
                  </div>
                ) : !dataDescuentosPorAlumno.length ? (
                  <p className="tutor-evidencias-empty tutor-evidencias-empty--destacado">No hay Descuentos</p>
                ) : (
                  <div className="tutor-evidencia-cards-scroll">
                    {dataDescuentosPorAlumno.map((alu, idx) => {
                      const pastel = PASTEL_TUTOR_EVIDENCIA[idx % PASTEL_TUTOR_EVIDENCIA.length];
                      return (
                        <article
                          key={alu.alumno_id || idx}
                          className="tutor-evidencia-alumno-card"
                          style={{
                            border: `1px solid ${pastel.border}`,
                            background: pastel.bg,
                          }}
                        >
                          <div className="tutor-evidencia-alumno-card-head" style={{ color: pastel.accent }}>
                            <span className="tutor-evidencia-alumno-nombre">{alu.alumno_nombre}</span>
                            <span className="tutor-evidencia-alumno-total" title="Suma de puntos (negativo descontado)">
                              Σ puntos: <strong>{alu.suma_puntos ?? 0}</strong>
                            </span>
                          </div>
                          <ul className="tutor-evidencia-lineas">
                            {(alu.registros || []).map((r) => (
                              <li key={r.id} className="tutor-inc-card">
                                <div className="tutor-inc-card-top">
                                  <time className="tutor-inc-fecha">
                                    {formatearSoloFecha(r.fecha)} · {String(r.hora || '').slice(0, 8) || '—'}
                                  </time>
                                  <span className="tutor-inc-origen es-vestimenta">Presentación</span>
                                </div>
                                <div className="tutor-inc-card-meta">
                                  <div className="tutor-inc-meta-item">
                                    <span className="tutor-inc-meta-label">Registrado por</span>
                                    <span className="tutor-inc-meta-value es-docente">{r.registrado_por_nombre || '—'}</span>
                                  </div>
                                  <div className="tutor-inc-meta-item">
                                    <span className="tutor-inc-meta-label">Puntos</span>
                                    <span className="tutor-inc-meta-value">{r.puntos} pts</span>
                                  </div>
                                </div>
                                <p className="tutor-inc-detalle">{r.motivo || 'Descuento por presentación escolar'}</p>
                              </li>
                            ))}
                          </ul>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      {modalIncidenciasGrupoAbierto && targetGrupo &&
        createPortal(
          <div className="tutor-evidencias-overlay" onClick={cerrarIncidencias} role="presentation">
            <div className="tutor-evidencias-panel tutor-evidencias-panel--inci" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="titulo-inci-evid-gr">
              <header className="tutor-evidencias-panel-header tutor-evidencias-panel-header--incidencias">
                <div>
                  <h2 id="titulo-inci-evid-gr">Incidencias del grupo</h2>
                  <p className="tutor-evidencias-panel-sub">
                    <strong>
                      {targetGrupo.grado}° {targetGrupo.seccion}
                    </strong>{' '}
                    — detalle por bimestre (incidencias + presentación)
                  </p>
                </div>
                <button type="button" className="tutor-evidencias-close" onClick={cerrarIncidencias} aria-label="Cerrar">
                  ✕
                </button>
              </header>
              <div className="tutor-evidencias-toolbar">
                <label className="tutor-evidencias-date">
                  Bimestre{' '}
                  <select
                    value={cicloIncidencias}
                    onChange={(e) => setCicloIncidencias(parseInt(e.target.value, 10))}
                  >
                    <option value={1}>I</option>
                    <option value={2}>II</option>
                    <option value={3}>III</option>
                    <option value={4}>IV</option>
                  </select>
                </label>
                {(rangoIncidencias.desde || rangoIncidencias.hasta) && (
                  <span className="conducta-rango-hint">
                    {formatearSoloFecha(rangoIncidencias.desde)} → {formatearSoloFecha(rangoIncidencias.hasta)}
                  </span>
                )}
                <button type="button" className="tutor-evidencias-btn aplicar" onClick={aplicarFiltrosIncidenciasYResumen}>
                  Aplicar bimestre
                </button>
                <button type="button" className="tutor-evidencias-btn pdf" onClick={exportPdfIncidenciasGrupoReporte}>
                  📄 Exportar PDF
                </button>
              </div>
              <div className="tutor-evidencias-body">
                {loadingIncidenciasRep ? (
                  <div className="modal-registro-asistencia-loading">
                    <div className="loading-spinner" />
                    <p>Cargando…</p>
                  </div>
                ) : !dataIncidenciasPorAlumno.length ? (
                  <p className="tutor-evidencias-empty tutor-evidencias-empty--destacado">No hay Incidencias</p>
                ) : (
                  <div className="tutor-evidencia-cards-scroll">
                    {dataIncidenciasPorAlumno.map((alu, idx) => {
                      const pastel = PASTEL_TUTOR_EVIDENCIA[(idx + 2) % PASTEL_TUTOR_EVIDENCIA.length];
                      return (
                        <article
                          key={alu.alumno_id || idx}
                          className="tutor-evidencia-alumno-card tutor-evidencia-alumno-card--inci"
                          style={{
                            border: `1px solid ${pastel.border}`,
                            background: pastel.bg,
                          }}
                        >
                          <div className="tutor-evidencia-alumno-card-head" style={{ color: pastel.accent }}>
                            <span className="tutor-evidencia-alumno-nombre">{alu.alumno_nombre}</span>
                            <span className="tutor-evidencia-alumno-meta">
                              {(alu.incidencias || []).length} registro{(alu.incidencias || []).length !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <ul className="tutor-evidencia-lineas tutor-evidencia-lineas--inci">
                            {(alu.incidencias || []).map((inc) => (
                              <li key={inc.id} className="tutor-inc-card">
                                <div className="tutor-inc-card-top">
                                  <time className="tutor-inc-fecha">{formatearFechaHoraPeru(inc.created_at)}</time>
                                  <span className={`tutor-inc-origen ${claseOrigenConducta(inc.origen)}`}>
                                    {etiquetaOrigenConducta(inc.origen)}
                                  </span>
                                </div>
                                <div className="tutor-inc-card-meta">
                                  <div className="tutor-inc-meta-item">
                                    <span className="tutor-inc-meta-label">Registrado por</span>
                                    <span className="tutor-inc-meta-value es-docente">{inc.docente_nombre || '—'}</span>
                                  </div>
                                  <div className="tutor-inc-meta-item">
                                    <span className="tutor-inc-meta-label">Curso</span>
                                    <span className="tutor-inc-meta-value es-curso">{inc.curso_nombre || '—'}</span>
                                  </div>
                                </div>
                                {(inc.description || '').trim() ? (
                                  <p className="tutor-inc-detalle">{inc.description}</p>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      {modalEstrellasGrupoAbierto && targetGrupo &&
        createPortal(
          <div className="tutor-evidencias-overlay" onClick={cerrarEstrellas} role="presentation">
            <div className="tutor-evidencias-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="titulo-est-evid-gr">
              <header className="tutor-evidencias-panel-header">
                <div>
                  <h2 id="titulo-est-evid-gr">Estrellas del grupo</h2>
                  <p className="tutor-evidencias-panel-sub">
                    <strong>
                      {targetGrupo.grado}° {targetGrupo.seccion}
                    </strong>{' '}
                    — historial por bimestre
                  </p>
                </div>
                <button type="button" className="tutor-evidencias-close" onClick={cerrarEstrellas} aria-label="Cerrar">
                  ✕
                </button>
              </header>
              <div className="tutor-evidencias-toolbar">
                <label className="tutor-evidencias-date">
                  Bimestre{' '}
                  <select
                    value={cicloEstrellas}
                    onChange={(e) => setCicloEstrellas(parseInt(e.target.value, 10))}
                  >
                    <option value={1}>I</option>
                    <option value={2}>II</option>
                    <option value={3}>III</option>
                    <option value={4}>IV</option>
                  </select>
                </label>
                {(rangoEstrellas.desde || rangoEstrellas.hasta) && (
                  <span className="conducta-rango-hint">
                    {formatearSoloFecha(rangoEstrellas.desde)} → {formatearSoloFecha(rangoEstrellas.hasta)}
                  </span>
                )}
                <button type="button" className="tutor-evidencias-btn aplicar" onClick={cargarReporteEstrellasGrupo}>
                  Aplicar bimestre
                </button>
              </div>
              <div className="tutor-evidencias-body">
                {loadingEstrellasRep ? (
                  <div className="modal-registro-asistencia-loading">
                    <div className="loading-spinner" />
                    <p>Cargando…</p>
                  </div>
                ) : !dataEstrellasPorAlumno.length ? (
                  <p className="tutor-evidencias-empty tutor-evidencias-empty--destacado">No hay estrellas en este bimestre</p>
                ) : (
                  <div className="tutor-evidencia-cards-scroll">
                    {dataEstrellasPorAlumno.map((alu, idx) => {
                      const pastel = PASTEL_TUTOR_EVIDENCIA[(idx + 1) % PASTEL_TUTOR_EVIDENCIA.length];
                      return (
                        <article
                          key={alu.alumno_id || idx}
                          className="tutor-evidencia-alumno-card"
                          style={{
                            border: `1px solid ${pastel.border}`,
                            background: pastel.bg,
                          }}
                        >
                          <div className="tutor-evidencia-alumno-card-head" style={{ color: pastel.accent }}>
                            <span className="tutor-evidencia-alumno-nombre">{alu.alumno_nombre}</span>
                            <span className="tutor-evidencia-alumno-total">
                              ★ <strong>{alu.total_puntos ?? 0}</strong>
                              {' · '}
                              {(alu.estrellas || []).length} registro{(alu.estrellas || []).length !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <ul className="tutor-evidencia-lineas">
                            {(alu.estrellas || []).map((est) => (
                              <li key={est.id}>
                                <span className="tutor-evidencia-linea-fecha">
                                  {formatearFechaHoraPeru(est.created_at)} · +{est.points || 0} ★
                                </span>
                                <span className="tutor-evidencia-linea-pts">
                                  {est.docente_nombre || '—'} · {est.curso_nombre || '—'}
                                </span>
                                <span className="tutor-evidencia-linea-autor">{est.description || '—'}</span>
                              </li>
                            ))}
                          </ul>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );

  return {
    ReportesModals,
    openDescuentosPresentacion,
    openIncidenciasGrupo,
    openEstrellasGrupo,
    cerrarReportesConducta: cerrarTodo,
  };
}
