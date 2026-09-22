import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import api from '../../services/api';
import Swal from 'sweetalert2';
import jsPDF from 'jspdf';
import '../../pages/DocenteTutoria.css';

const API_BASE = '/admin/academico/grupos';

/**
 * Registro de asistencia por grupo (misma UX que DocenteTutoria → Asistencias).
 * Usa rutas /api/admin/academico/grupos/:id/asistencia (administrador o coordinador).
 */
function AdminGrupoAsistenciaModal({ open, grupo, onClose }) {
  const [asistenciaFecha, setAsistenciaFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [asistenciaAlumnos, setAsistenciaAlumnos] = useState([]);
  const [loadingAsistencias, setLoadingAsistencias] = useState(false);
  const [guardandoAsistencia, setGuardandoAsistencia] = useState(null);

  const cargarAsistencias = async (grupoId, fecha) => {
    if (!grupoId) return;
    try {
      setLoadingAsistencias(true);
      const res = await api.get(`${API_BASE}/${grupoId}/asistencia`, {
        params: { fecha },
      });
      setAsistenciaAlumnos(res.data.alumnos || []);
    } catch (error) {
      console.error('Error cargando asistencias:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudieron cargar las asistencias',
      });
      setAsistenciaAlumnos([]);
    } finally {
      setLoadingAsistencias(false);
    }
  };

  useEffect(() => {
    if (!open || !grupo?.id) return;
    const hoy = new Date().toISOString().slice(0, 10);
    setAsistenciaFecha(hoy);
    cargarAsistencias(grupo.id, hoy);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir / cambiar grupo
  }, [open, grupo?.id]);

  const handleCambiarFechaAsistencia = (nuevaFecha) => {
    setAsistenciaFecha(nuevaFecha);
    if (grupo?.id) cargarAsistencias(grupo.id, nuevaFecha);
  };

  const handleAsistenciaClick = async (matriculaId, tipo) => {
    if (!grupo?.id || guardandoAsistencia) return;
    setGuardandoAsistencia(matriculaId);
    try {
      const now = new Date();
      const hora_dispositivo = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      await api.post(`${API_BASE}/${grupo.id}/asistencia`, {
        matricula_id: matriculaId,
        fecha: asistenciaFecha,
        tipo,
        hora_dispositivo,
      });
      setAsistenciaAlumnos((prev) =>
        prev.map((a) => (a.matricula_id === matriculaId ? { ...a, tipo } : a))
      );
    } catch (error) {
      console.error('Error guardando asistencia:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudo guardar',
      });
    } finally {
      setGuardandoAsistencia(null);
    }
  };

  const handleGuardarAsistencias = async () => {
    if (!grupo?.id) return;
    try {
      setLoadingAsistencias(true);
      const now = new Date();
      const hora_dispositivo = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      const res = await api.post(`${API_BASE}/${grupo.id}/asistencia/guardar-todo`, {
        fecha: asistenciaFecha,
        hora_dispositivo,
      });
      await cargarAsistencias(grupo.id, asistenciaFecha);
      const n = res.data?.marcados_como_falta || 0;
      if (n > 0) {
        Swal.fire({
          icon: 'success',
          title: 'Guardado',
          text: `${n} alumno(s) marcado(s) como falta. Se enviaron notificaciones.`,
          timer: 2500,
          showConfirmButton: false,
        });
      } else {
        Swal.fire({
          icon: 'success',
          title: 'Guardado',
          text: 'No había alumnos pendientes de marcar.',
          timer: 2000,
          showConfirmButton: false,
        });
      }
    } catch (error) {
      console.error('Error guardando asistencias:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'No se pudo guardar',
      });
    } finally {
      setLoadingAsistencias(false);
    }
  };

  const exportarPDFAsistencia = async () => {
    if (!asistenciaAlumnos.length) {
      Swal.fire({ icon: 'info', title: 'Sin datos', text: 'No hay alumnos para exportar' });
      return;
    }
    const doc = new jsPDF('l', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    const grupoNombre = grupo
      ? `${grupo.grado}° ${grupo.seccion} - ${grupo.nivel_nombre || ''}`
      : '';
    let yPos = 0;

    const colorPrimario = [102, 126, 234];
    const colorBlanco = [255, 255, 255];
    const colorGrisOscuro = [55, 65, 81];

    const dibujarHeader = async () => {
      yPos = 0;
      doc.setFillColor(...colorPrimario);
      doc.rect(0, 0, pageWidth, 32, 'F');

      try {
        const { cargarLogoPngDataUrl } = await import('../../utils/pdfReporteColegioLogo');
        const logoDataUrl = await cargarLogoPngDataUrl('/icons/logoboleta.png');
        if (logoDataUrl) {
          try {
            doc.addImage(logoDataUrl, 'PNG', margin, 4, 24, 24);
          } catch (e) {
            /* ignorar */
          }
        }
      } catch (e) {
        /* continuar sin logo */
      }

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...colorBlanco);
      doc.text('REGISTRO DE ASISTENCIA', margin + 30, 14);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(240, 240, 240);
      doc.text(`Grupo: ${grupoNombre}  |  Fecha: ${asistenciaFecha}`, margin + 30, 22);

      yPos = 36;
      doc.setFillColor(234, 234, 234);
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.rect(margin, yPos, 22, 10, 'FD');
      doc.rect(margin + 22, yPos, 125, 10, 'FD');
      doc.rect(margin + 147, yPos, 45, 10, 'FD');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...colorGrisOscuro);
      doc.text('N°', margin + 11, yPos + 6.5, { align: 'center' });
      doc.text('APELLIDOS Y NOMBRES', margin + 84, yPos + 6.5, { align: 'center' });
      doc.text('REGISTRO', margin + 169, yPos + 6.5, { align: 'center' });
      yPos += 10;
    };

    await dibujarHeader();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    for (let i = 0; i < asistenciaAlumnos.length; i++) {
      const a = asistenciaAlumnos[i];
      if (yPos + 8 > pageHeight - 18) {
        doc.addPage('l', 'a4');
        await dibujarHeader();
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
      }
      doc.setDrawColor(220, 220, 220);
      doc.rect(margin, yPos, 22, 7, 'S');
      doc.rect(margin + 22, yPos, 125, 7, 'S');
      doc.rect(margin + 147, yPos, 45, 7, 'S');
      doc.setTextColor(...colorGrisOscuro);
      doc.text(String(i + 1), margin + 11, yPos + 4.5, { align: 'center' });
      doc.text((a.nombre_completo || '').slice(0, 55), margin + 24, yPos + 4.5);
      const tipoTexto = a.tipo ? a.tipo.replace(/_/g, ' ') : '-';
      if (a.tipo === 'FALTA' || a.tipo === 'FALTA_JUSTIFICADA') {
        doc.setTextColor(185, 28, 28);
      }
      doc.text(tipoTexto, margin + 169, yPos + 4.5, { align: 'center' });
      doc.setTextColor(...colorGrisOscuro);
      yPos += 7;
    }

    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Generado: ${new Date().toLocaleString('es-PE')}`, margin, pageHeight - 8);
    const fechaFormato = new Date(asistenciaFecha).toLocaleDateString('es-PE');
    doc.save(`Asistencia_${grupoNombre.replace(/\s+/g, '_')}_${fechaFormato.replace(/\//g, '-')}.pdf`);
    Swal.fire({
      icon: 'success',
      title: 'PDF generado',
      text: 'El reporte se descargó correctamente',
      timer: 2000,
      showConfirmButton: false,
    });
  };

  if (!open || !grupo) return null;

  return createPortal(
    <div
      className="modal-registro-asistencia-overlay"
      onClick={() => {
        onClose();
        setAsistenciaAlumnos([]);
      }}
    >
      <div
        className="modal-registro-asistencia-container"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-admin-asistencia-title"
      >
        <div className="modal-registro-asistencia-header">
          <h2 id="modal-admin-asistencia-title">📋 Registro de Asistencia</h2>
          <button
            type="button"
            className="modal-registro-asistencia-close"
            onClick={() => {
              onClose();
              setAsistenciaAlumnos([]);
            }}
            aria-label="Cerrar modal"
          >
            ✕
          </button>
        </div>
        <div className="modal-registro-asistencia-filters">
          <label htmlFor="admin-asistencia-fecha">Seleccione Fecha:</label>
          <input
            id="admin-asistencia-fecha"
            type="date"
            value={asistenciaFecha}
            onChange={(e) => handleCambiarFechaAsistencia(e.target.value)}
            disabled={loadingAsistencias}
          />
          <button
            type="button"
            className="btn-imprimir-asistencia"
            onClick={exportarPDFAsistencia}
            disabled={loadingAsistencias || !asistenciaAlumnos.length}
          >
            🖨️ Imprimir Asistencia
          </button>
        </div>
        <div className="modal-registro-asistencia-table-wrap">
          {loadingAsistencias ? (
            <div className="modal-registro-asistencia-loading">
              <div className="loading-spinner" />
              <p>Cargando asistencias...</p>
            </div>
          ) : (
            <table className="tabla-registro-asistencia">
              <thead>
                <tr>
                  <th style={{ width: 50 }}>N°</th>
                  <th>APELLIDOS Y NOMBRES</th>
                  <th style={{ textAlign: 'center', minWidth: 380 }}>REGISTRO</th>
                </tr>
              </thead>
              <tbody>
                {asistenciaAlumnos.map((alumno) => (
                  <tr key={alumno.matricula_id}>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{alumno.numero}</td>
                    <td>{alumno.nombre_completo}</td>
                    <td>
                      <div className="botones-asistencia-row">
                        {[
                          { tipo: 'PRESENTE', clase: 'btn-presente', label: 'Presente' },
                          { tipo: 'TARDANZA', clase: 'btn-tardanza', label: 'Tardanza' },
                          { tipo: 'TARDANZA_JUSTIFICADA', clase: 'btn-tj', label: 'TJ' },
                          { tipo: 'FALTA', clase: 'btn-falta', label: 'Falta' },
                          { tipo: 'FALTA_JUSTIFICADA', clase: 'btn-fj', label: 'FJ' },
                        ].map(({ tipo, clase, label }) => {
                          const isActive = alumno.tipo === tipo;
                          return (
                            <button
                              key={tipo}
                              type="button"
                              className={`btn-asistencia-tipo ${clase} ${isActive ? 'active' : ''}`}
                              disabled={guardandoAsistencia === alumno.matricula_id}
                              onClick={() => handleAsistenciaClick(alumno.matricula_id, tipo)}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="modal-registro-asistencia-footer">
          <button
            type="button"
            className="btn-guardar-asistencias"
            onClick={handleGuardarAsistencias}
            disabled={loadingAsistencias}
          >
            {loadingAsistencias ? 'Guardando...' : 'Guardar (marcar sin registro como Falta)'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default AdminGrupoAsistenciaModal;
