import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import jsPDF from 'jspdf';
import Swal from 'sweetalert2';
import api from '../../services/api';
import '../../pages/AlumnoHorario.css';
import '../../pages/DocenteTutoria.css';

const DIAS_SEMANA_HORARIO = [
  { id: 1, nombre: 'Lunes', abrev: 'LUNES' },
  { id: 2, nombre: 'Martes', abrev: 'MARTES' },
  { id: 3, nombre: 'Miércoles', abrev: 'MIÉRCOLES' },
  { id: 4, nombre: 'Jueves', abrev: 'JUEVES' },
  { id: 5, nombre: 'Viernes', abrev: 'VIERNES' }
];

function formatearHoraGrupo(hora) {
  if (!hora) return '';
  const h = hora.toUpperCase().trim();
  if (h.includes('AM') || h.includes('PM')) return hora.trim();
  const partes = hora.split(':');
  if (partes.length < 2) return hora;
  const hr = parseInt(partes[0], 10);
  const m = (partes[1] ? partes[1].split(' ')[0] : '00').padStart(2, '0');
  if (isNaN(hr)) return hora;
  if (hr === 0) return `12:${m} AM`;
  if (hr < 12) return `${hr}:${m} AM`;
  if (hr === 12) return `12:${m} PM`;
  return `${hr - 12}:${m} PM`;
}

function horaAMinutosGrupo(hora) {
  if (!hora) return 0;
  const h = hora.toUpperCase().trim();
  if (h.includes('AM') || h.includes('PM')) {
    const partes = hora.split(':');
    if (partes.length < 2) return 0;
    let hr = parseInt(partes[0], 10);
    const minStr = partes[1].replace(/[^0-9]/g, '');
    const min = parseInt(minStr || 0, 10);
    if (h.includes('PM') && hr !== 12) hr += 12;
    if (h.includes('AM') && hr === 12) hr = 0;
    return hr * 60 + min;
  }
  const partes = hora.split(':');
  if (partes.length < 2) return 0;
  const hr = parseInt(partes[0], 10);
  const min = parseInt(partes[1] ? partes[1].split(' ')[0] : 0, 10);
  return isNaN(hr) || isNaN(min) ? 0 : hr * 60 + min;
}

const colorPaletteGrupo = [
  '#FFF9C4', '#BBDEFB', '#F3E5F5', '#C8E6C9', '#E0F7FA', '#FFF3E0', '#FCE4EC', '#E1F5FE', '#F1F8E9', '#FFEBEE',
  '#E8EAF6', '#E0F2F1', '#E1BEE7', '#FFE0B2', '#FFCCBC', '#D1C4E9', '#F8BBD0', '#B2DFDB', '#C5E1A5', '#FFE082'
];

function hashStringGrupo(str) {
  let h = 0;
  const s = (str || '').trim().toLowerCase();
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h += h << 10;
    h ^= h >> 6;
    h += h << 3;
    h ^= h >> 11;
    h += h << 15;
  }
  return Math.abs(h);
}

function getColorForCourseGrupo(titulo) {
  return titulo && titulo.trim()
    ? colorPaletteGrupo[hashStringGrupo(titulo) % colorPaletteGrupo.length]
    : '#ffffff';
}

function aclararColorGrupo(colorHex, factor = 0.4) {
  if (!colorHex) return '#ffffff';
  const r = parseInt(colorHex.slice(1, 3), 16);
  const g = parseInt(colorHex.slice(3, 5), 16);
  const b = parseInt(colorHex.slice(5, 7), 16);
  return `#${Math.round(r + (255 - r) * factor)
    .toString(16)
    .padStart(2, '0')}${Math.round(g + (255 - g) * factor)
    .toString(16)
    .padStart(2, '0')}${Math.round(b + (255 - b) * factor)
    .toString(16)
    .padStart(2, '0')}`;
}

function hexToRgbGrupo(hex) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r ? { r: parseInt(r[1], 16), g: parseInt(r[2], 16), b: parseInt(r[3], 16) } : null;
}

function formatearClaseGrupo(clase) {
  if (!clase) return null;
  const t = clase.titulo || '';
  const doc = clase.docente_nombre || '';
  if (!t) return null;
  return doc ? `${t} - ${doc}` : t;
}

/**
 * Modal de horario semanal del grupo (tabla + detalle + PDF), misma UX que tutoría.
 * @param {{ id: number, grado: any, seccion: string, nivel_nombre?: string, anio?: number }} grupo
 */
export default function GrupoHorarioCompletoModal({ grupo, onClose }) {
  const [horarioGrupo, setHorarioGrupo] = useState([]);
  const [loadingHorario, setLoadingHorario] = useState(true);

  useEffect(() => {
    if (!grupo?.id) return undefined;
    let cancelled = false;
    const cargar = async () => {
      setLoadingHorario(true);
      setHorarioGrupo([]);
      try {
        const params = {};
        if (grupo.anio != null && grupo.anio !== '') params.anio = grupo.anio;
        const res = await api.get(`/admin/academico/grupos/${grupo.id}/horario`, { params });
        if (cancelled) return;
        const horariosRecibidos = res.data.horario || [];
        const dias = horariosRecibidos
          .map((c) => (typeof c.dia === 'number' ? c.dia : null))
          .filter((d) => d !== null);
        const minDia = dias.length ? Math.min(...dias) : 1;
        const maxDia = dias.length ? Math.max(...dias) : 5;
        const usaCeroCuatro = minDia === 0 && maxDia <= 4;
        const normalizado = horariosRecibidos.map((c) => ({
          ...c,
          diaNormalizado: usaCeroCuatro && typeof c.dia === 'number' ? c.dia + 1 : c.dia
        }));
        setHorarioGrupo(normalizado);
      } catch (error) {
        if (!cancelled) {
          console.error('Error cargando horario:', error);
          Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.response?.data?.error || 'No se pudo cargar el horario'
          });
          setHorarioGrupo([]);
        }
      } finally {
        if (!cancelled) setLoadingHorario(false);
      }
    };
    cargar();
    return () => {
      cancelled = true;
    };
  }, [grupo?.id, grupo?.anio]);

  const horariosUnicosGrupo = useMemo(() => {
    if (!horarioGrupo || horarioGrupo.length === 0) return [];
    const bloques = horarioGrupo
      .map((c) => ({
        inicio: c.inicio || c.hora_inicio || '',
        fin: c.fin || c.hora_final || ''
      }))
      .filter((b) => b.inicio && b.fin);
    const unicos = {};
    bloques.forEach((b) => {
      const k = `${b.inicio}-${b.fin}`;
      if (!unicos[k]) unicos[k] = b;
    });
    return Object.values(unicos).sort((a, b) => horaAMinutosGrupo(a.inicio) - horaAMinutosGrupo(b.inicio));
  }, [horarioGrupo]);

  const obtenerClaseGrupo = useCallback(
    (dia, horaInicio, horaFin) => {
      if (!horarioGrupo || horarioGrupo.length === 0) return null;
      return (
        horarioGrupo.find((c) => {
          const d = c.diaNormalizado ?? c.dia ?? 0;
          const i = c.inicio || c.hora_inicio || '';
          const f = c.fin || c.hora_final || '';
          return d === dia && i === horaInicio && f === horaFin;
        }) || null
      );
    },
    [horarioGrupo]
  );

  const detalleHorarioGrupo = useMemo(() => {
    if (!horarioGrupo || horarioGrupo.length === 0) return [];
    const map = {};
    horarioGrupo.forEach((clase) => {
      if (!clase.titulo) return;
      const clave = `${clase.titulo.trim()}|||${clase.docente_nombre || ''}`;
      if (!map[clave]) {
        map[clave] = { titulo: clase.titulo.trim(), docente: clase.docente_nombre || '', horarios: [] };
      }
      const d = clase.diaNormalizado ?? clase.dia ?? 0;
      const ini = clase.inicio || clase.hora_inicio || '';
      const fin = clase.fin || clase.hora_final || '';
      if (ini && fin && !map[clave].horarios.some((h) => h.dia === d && h.inicio === ini && h.fin === fin)) {
        map[clave].horarios.push({
          dia: d,
          diaNombre: DIAS_SEMANA_HORARIO.find((x) => x.id === d)?.nombre || `Día ${d}`,
          inicio: ini,
          fin
        });
      }
    });
    const arr = Object.values(map).sort((a, b) => a.titulo.localeCompare(b.titulo));
    arr.forEach((c) =>
      c.horarios.sort((a, b) =>
        a.dia !== b.dia ? a.dia - b.dia : horaAMinutosGrupo(a.inicio) - horaAMinutosGrupo(b.inicio)
      )
    );
    return arr;
  }, [horarioGrupo]);

  const exportarHorarioGrupoPDF = useCallback(() => {
    if (!horarioGrupo || horarioGrupo.length === 0) {
      Swal.fire({ title: 'Sin datos', text: 'No hay horario para exportar', icon: 'info' });
      return;
    }
    try {
      const doc = new jsPDF('l', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      const contentWidth = pageWidth - 2 * margin;
      let yPosition = margin;
      const colorHeader = [59, 130, 246];
      const colorBorder = [30, 64, 175];
      const colorText = [30, 41, 59];
      const tituloGrupo = grupo
        ? `${grupo.grado}° ${grupo.seccion} - ${grupo.nivel_nombre || ''}`.trim()
        : 'Horario';

      doc.setFillColor(...colorHeader);
      doc.rect(margin, yPosition, contentWidth, 25, 'F');
      doc.setDrawColor(...colorBorder);
      doc.setLineWidth(0.5);
      doc.rect(margin, yPosition, contentWidth, 25);
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('HORARIO DE CLASES', margin + contentWidth / 2, yPosition + 15, { align: 'center' });
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const sub = grupo?.anio ? `${tituloGrupo} — Año ${grupo.anio}` : `${tituloGrupo} — Año lectivo`;
      doc.text(sub, margin + contentWidth / 2, yPosition + 22, { align: 'center' });
      yPosition += 30;

      const colWidth = contentWidth / 6;
      const rowHeight = 15;
      const headerHeight = 12;

      doc.setFillColor(...colorHeader);
      doc.rect(margin, yPosition, colWidth, headerHeight, 'F');
      doc.setDrawColor(...colorBorder);
      doc.rect(margin, yPosition, colWidth, headerHeight);
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('HORA', margin + colWidth / 2, yPosition + headerHeight / 2 + 3, { align: 'center' });
      DIAS_SEMANA_HORARIO.forEach((dia, idx) => {
        const x = margin + colWidth + idx * colWidth;
        doc.setFillColor(...colorHeader);
        doc.rect(x, yPosition, colWidth, headerHeight, 'F');
        doc.setDrawColor(...colorBorder);
        doc.rect(x, yPosition, colWidth, headerHeight);
        doc.text(dia.abrev, x + colWidth / 2, yPosition + headerHeight / 2 + 3, { align: 'center' });
      });
      yPosition += headerHeight;

      horariosUnicosGrupo.forEach((bloque) => {
        const c1 = obtenerClaseGrupo(1, bloque.inicio, bloque.fin);
        const c2 = obtenerClaseGrupo(2, bloque.inicio, bloque.fin);
        const c3 = obtenerClaseGrupo(3, bloque.inicio, bloque.fin);
        const c4 = obtenerClaseGrupo(4, bloque.inicio, bloque.fin);
        const c5 = obtenerClaseGrupo(5, bloque.inicio, bloque.fin);
        if (!c1 && !c2 && !c3 && !c4 && !c5) return;
        if (yPosition + rowHeight > pageHeight - margin - 10) {
          doc.addPage();
          yPosition = margin;
        }

        doc.setDrawColor(200, 200, 200);
        doc.rect(margin, yPosition, colWidth, rowHeight);
        doc.setTextColor(...colorText);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(
          `${formatearHoraGrupo(bloque.inicio)} - ${formatearHoraGrupo(bloque.fin)}`,
          margin + colWidth / 2,
          yPosition + rowHeight / 2 + 3,
          { align: 'center', maxWidth: colWidth - 4 }
        );

        [c1, c2, c3, c4, c5].forEach((clase, idx) => {
          const x = margin + colWidth + idx * colWidth;
          doc.setDrawColor(200, 200, 200);
          doc.rect(x, yPosition, colWidth, rowHeight);
          if (clase) {
            const rgb = hexToRgbGrupo(getColorForCourseGrupo(clase.titulo));
            if (rgb) {
              doc.setFillColor(rgb.r, rgb.g, rgb.b);
              doc.rect(x + 0.5, yPosition + 0.5, colWidth - 1, rowHeight - 1, 'F');
            }
            doc.setTextColor(...colorText);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            const texto = formatearClaseGrupo(clase);
            if (texto) {
              const lineas = doc.splitTextToSize(texto, colWidth - 6);
              const numLineas = lineas.length;
              const yInicio = yPosition + (rowHeight - numLineas * 4) / 2 + 3;
              lineas.forEach((l, i) => doc.text(l, x + colWidth / 2, yInicio + i * 4, { align: 'center', maxWidth: colWidth - 6 }));
            }
          }
        });
        yPosition += rowHeight;
      });

      if (detalleHorarioGrupo.length > 0) {
        if (yPosition + 20 > pageHeight - margin - 10) {
          doc.addPage();
          yPosition = margin;
        }
        yPosition += 10;
        doc.setDrawColor(...colorBorder);
        doc.line(margin, yPosition, margin + contentWidth, yPosition);
        yPosition += 5;
        doc.setTextColor(...colorText);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('DETALLE DE HORARIO', margin, yPosition);
        yPosition += 8;

        detalleHorarioGrupo.forEach((curso) => {
          const cardHeight = 28;
          if (yPosition + cardHeight > pageHeight - margin - 10) {
            doc.addPage();
            yPosition = margin;
          }
          const rgb = hexToRgbGrupo(getColorForCourseGrupo(curso.titulo));
          if (rgb) {
            doc.setFillColor(rgb.r, rgb.g, rgb.b);
            doc.roundedRect(margin, yPosition, contentWidth, cardHeight, 3, 3, 'F');
          }
          doc.setDrawColor(200, 200, 200);
          doc.roundedRect(margin, yPosition, contentWidth, cardHeight, 3, 3);
          const centro = yPosition + cardHeight / 2;
          doc.setTextColor(...colorText);
          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          doc.text(doc.splitTextToSize(curso.titulo, contentWidth - 20), margin + contentWidth / 2, centro - 8, {
            align: 'center',
            maxWidth: contentWidth - 20
          });
          if (curso.docente) {
            doc.setFontSize(11);
            doc.setFont('helvetica', 'normal');
            doc.text(`Docente: ${curso.docente}`, margin + contentWidth / 2, centro - 1, {
              align: 'center',
              maxWidth: contentWidth - 20
            });
          }
          if (curso.horarios && curso.horarios.length > 0) {
            const texto = curso.horarios
              .map((h) => `${h.diaNombre}: ${formatearHoraGrupo(h.inicio)} - ${formatearHoraGrupo(h.fin)}`)
              .join(' | ');
            doc.setFontSize(10);
            doc.text(doc.splitTextToSize(texto, contentWidth - 20), margin + contentWidth / 2, centro + 6, {
              align: 'center',
              maxWidth: contentWidth - 20
            });
          }
          yPosition += cardHeight + 4;
        });
      }

      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.setFont('helvetica', 'italic');
      doc.text(
        `Generado el: ${new Date().toLocaleDateString('es-PE', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })}`,
        margin,
        pageHeight - 10
      );
      doc.save(`Horario_grupo_${tituloGrupo.replace(/\s+/g, '_')}_${Date.now()}.pdf`);
      Swal.fire({ title: '¡PDF generado!', text: 'El horario se exportó correctamente', icon: 'success', timer: 2000, showConfirmButton: false });
    } catch (err) {
      console.error(err);
      Swal.fire({ title: 'Error', text: 'No se pudo generar el PDF', icon: 'error' });
    }
  }, [grupo, horarioGrupo, horariosUnicosGrupo, detalleHorarioGrupo, obtenerClaseGrupo]);

  const cerrar = () => {
    setHorarioGrupo([]);
    onClose();
  };

  if (!grupo) return null;

  return createPortal(
    <div className="modal-overlay-qr" onClick={cerrar} style={{ zIndex: 100000 }} role="presentation">
      <div
        className="modal-content-horario alumno-horario"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '95%', maxHeight: '95vh', overflow: 'auto', padding: '1.5rem 2rem' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="grupo-horario-modal-title"
      >
        <div className="page-header">
          <div className="header-content">
            <div>
              <h1 id="grupo-horario-modal-title">📅 Horario del grupo</h1>
              <p>
                {grupo.grado}° {grupo.seccion} — {grupo.nivel_nombre || ''}
                {grupo.anio != null && grupo.anio !== '' ? ` — Año ${grupo.anio}` : ''}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {horarioGrupo && horarioGrupo.length > 0 && (
                <button type="button" className="btn-imprimir" onClick={exportarHorarioGrupoPDF}>
                  <span className="btn-icon">📄</span>
                  <span className="btn-text">Exportar</span>
                </button>
              )}
              <button type="button" className="modal-close-qr" onClick={cerrar} aria-label="Cerrar">
                ×
              </button>
            </div>
          </div>
        </div>
        {loadingHorario ? (
          <div className="alumno-horario-loading">
            <div className="loading-spinner">Cargando horario...</div>
          </div>
        ) : !horarioGrupo || horarioGrupo.length === 0 ? (
          <div className="empty-state">
            <p>No se encontró horario para este grupo</p>
          </div>
        ) : (
          <>
            <div className="horario-container">
              <div className="horario-table-wrapper">
                <table className="horario-table">
                  <thead>
                    <tr>
                      <th className="horario-hora-col">Hora</th>
                      {DIAS_SEMANA_HORARIO.map((dia) => (
                        <th key={dia.id} className="horario-dia-col">
                          {dia.abrev}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {horariosUnicosGrupo.map((bloque, idx) => {
                      const claseLunes = obtenerClaseGrupo(1, bloque.inicio, bloque.fin);
                      const claseMartes = obtenerClaseGrupo(2, bloque.inicio, bloque.fin);
                      const claseMiercoles = obtenerClaseGrupo(3, bloque.inicio, bloque.fin);
                      const claseJueves = obtenerClaseGrupo(4, bloque.inicio, bloque.fin);
                      const claseViernes = obtenerClaseGrupo(5, bloque.inicio, bloque.fin);
                      if (!claseLunes && !claseMartes && !claseMiercoles && !claseJueves && !claseViernes) return null;
                      return (
                        <tr key={idx}>
                          <td className="horario-hora-cell">
                            {formatearHoraGrupo(bloque.inicio)} - {formatearHoraGrupo(bloque.fin)}
                          </td>
                          <td
                            className={`horario-clase-cell ${!claseLunes ? 'horario-cell-empty' : ''}`}
                            style={
                              claseLunes
                                ? { backgroundColor: aclararColorGrupo(getColorForCourseGrupo(claseLunes.titulo), 0.5) }
                                : {}
                            }
                          >
                            {formatearClaseGrupo(claseLunes) || ''}
                          </td>
                          <td
                            className={`horario-clase-cell ${!claseMartes ? 'horario-cell-empty' : ''}`}
                            style={
                              claseMartes
                                ? { backgroundColor: aclararColorGrupo(getColorForCourseGrupo(claseMartes.titulo), 0.5) }
                                : {}
                            }
                          >
                            {formatearClaseGrupo(claseMartes) || ''}
                          </td>
                          <td
                            className={`horario-clase-cell ${!claseMiercoles ? 'horario-cell-empty' : ''}`}
                            style={
                              claseMiercoles
                                ? { backgroundColor: aclararColorGrupo(getColorForCourseGrupo(claseMiercoles.titulo), 0.5) }
                                : {}
                            }
                          >
                            {formatearClaseGrupo(claseMiercoles) || ''}
                          </td>
                          <td
                            className={`horario-clase-cell ${!claseJueves ? 'horario-cell-empty' : ''}`}
                            style={
                              claseJueves
                                ? { backgroundColor: aclararColorGrupo(getColorForCourseGrupo(claseJueves.titulo), 0.5) }
                                : {}
                            }
                          >
                            {formatearClaseGrupo(claseJueves) || ''}
                          </td>
                          <td
                            className={`horario-clase-cell ${!claseViernes ? 'horario-cell-empty' : ''}`}
                            style={
                              claseViernes
                                ? { backgroundColor: aclararColorGrupo(getColorForCourseGrupo(claseViernes.titulo), 0.5) }
                                : {}
                            }
                          >
                            {formatearClaseGrupo(claseViernes) || ''}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            {detalleHorarioGrupo.length > 0 && (
              <div className="detalle-horario-container">
                <h2 className="detalle-horario-title">Detalle de horario</h2>
                <div className="detalle-horario-list">
                  {detalleHorarioGrupo.map((curso, cidx) => (
                    <div
                      key={cidx}
                      className="detalle-curso-card"
                      style={{ backgroundColor: aclararColorGrupo(getColorForCourseGrupo(curso.titulo), 0.5) }}
                    >
                      <div className="detalle-curso-header">
                        <div
                          className="detalle-curso-color-indicator"
                          style={{ backgroundColor: getColorForCourseGrupo(curso.titulo) }}
                        />
                        <div className="detalle-curso-info">
                          <h3 className="detalle-curso-titulo">{curso.titulo}</h3>
                          {curso.docente && <p className="detalle-curso-docente">👨‍🏫 {curso.docente}</p>}
                        </div>
                      </div>
                      <div className="detalle-curso-horarios">
                        {curso.horarios.map((h, hIdx) => (
                          <div key={hIdx} className="detalle-horario-item">
                            <span className="detalle-horario-dia">{h.diaNombre}</span>
                            <span className="detalle-horario-hora">
                              {formatearHoraGrupo(h.inicio)} - {formatearHoraGrupo(h.fin)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
