import { jsPDF } from 'jspdf';
import Swal from 'sweetalert2';
import { etiquetaTipoAsistencia } from './asistenciasAlumnoUi';

/**
 * Exporta un mes del historial de asistencias de un alumno a PDF.
 */
export async function exportAsistenciasAlumnoMesPdf(nombreAlumno, mesAnio, asistenciasMes) {
  if (!asistenciasMes?.length) {
    Swal.fire({ icon: 'info', title: 'Sin datos', text: 'No hay registros para exportar' });
    return;
  }
  try {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margin = 15;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const contentWidth = pageWidth - margin * 2;
    let yPos = margin;

    doc.setFillColor(102, 126, 234);
    doc.rect(0, 0, pageWidth, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('HISTORIAL DE ASISTENCIAS', pageWidth / 2, 12, { align: 'center' });
    doc.setFontSize(11);
    doc.text(nombreAlumno, pageWidth / 2, 20, { align: 'center' });
    doc.setFontSize(9);
    doc.text(mesAnio, pageWidth / 2, 26, { align: 'center' });

    yPos = 38;
    const rowH = 8;
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);

    asistenciasMes.forEach((a) => {
      if (yPos > pageHeight - 20) {
        doc.addPage();
        yPos = margin;
      }
      const fecha = String(a.fecha || '').slice(0, 10);
      const tipo = etiquetaTipoAsistencia(a.tipo);
      const horas = [a.hora_entrada, a.hora_salida].filter(Boolean).join(' — ') || '—';
      doc.setFont('helvetica', 'bold');
      doc.text(fecha, margin, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(`${tipo}  |  ${horas}`, margin + 32, yPos);
      yPos += rowH;
    });

    const safe = nombreAlumno.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').slice(0, 40);
    doc.save(`Asistencias_${safe}_${mesAnio.replace(/\s+/g, '_')}.pdf`);
    Swal.fire({ icon: 'success', title: 'PDF generado', timer: 2000, showConfirmButton: false });
  } catch (e) {
    console.error(e);
    Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo exportar el PDF' });
  }
}
