import { jsPDF } from 'jspdf';
import Swal from 'sweetalert2';

/**
 * Exporta notas detalladas a PDF (misma lógica que Apoderado/Docente Hijos).
 */
export function exportNotasDetalladasPdf(notasDetalladas, cicloSeleccionado) {
  if (!notasDetalladas?.asignaturas?.length) {
    Swal.fire({ icon: 'info', title: 'Sin datos', text: 'No hay notas para exportar' });
    return;
  }

  try {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margin = 15;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const contentWidth = pageWidth - margin * 2;
    let yPos = margin;

    doc.setFillColor(33, 150, 243);
    doc.rect(0, 0, pageWidth, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('NOTAS REGISTRADAS', pageWidth / 2, 12, { align: 'center' });
    doc.setFontSize(12);
    doc.text(`${notasDetalladas.alumno?.nombre_completo || 'Alumno'}`, pageWidth / 2, 20, { align: 'center' });
    doc.setFontSize(10);
    const nombresBimestres = ['I', 'II', 'III', 'IV'];
    doc.text(`Bimestre ${nombresBimestres[cicloSeleccionado - 1]}`, pageWidth / 2, 26, { align: 'center' });

    yPos = 40;

    doc.setFillColor(255, 235, 238);
    doc.roundedRect(margin, yPos, contentWidth, 10, 2, 2, 'F');
    doc.setDrawColor(244, 67, 54);
    doc.setLineWidth(0.5);
    doc.roundedRect(margin, yPos, contentWidth, 10, 2, 2);
    doc.setTextColor(198, 40, 40);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(
      'La información mostrada puede no estar completa al 100%, para cualquier consulta comuníquese con el administrador.',
      margin + 2,
      yPos + 6,
      { maxWidth: contentWidth - 4 }
    );

    yPos += 15;

    const coloresPastelPDF = [
      { bg: [232, 245, 233], border: [76, 175, 80], text: [46, 125, 50] },
      { bg: [227, 242, 253], border: [33, 150, 243], text: [21, 101, 192] },
      { bg: [255, 243, 224], border: [255, 152, 0], text: [230, 81, 0] },
      { bg: [243, 229, 245], border: [156, 39, 176], text: [106, 27, 154] },
      { bg: [255, 235, 238], border: [244, 67, 54], text: [198, 40, 40] },
      { bg: [255, 245, 238], border: [255, 183, 77], text: [230, 126, 34] },
      { bg: [224, 242, 241], border: [0, 150, 136], text: [0, 105, 92] },
      { bg: [251, 233, 231], border: [233, 30, 99], text: [194, 24, 91] },
    ];

    notasDetalladas.asignaturas.forEach((asignatura, index) => {
      if (yPos > pageHeight - 80) {
        doc.addPage();
        yPos = margin;
      }

      const color = coloresPastelPDF[index % coloresPastelPDF.length];
      let lineasTotales = 1 + (asignatura.criterios?.length || 0);
      if (asignatura.examen_mensual) lineasTotales += 1;
      lineasTotales += 1;
      const cardHeight = 10 + lineasTotales * 7;

      doc.setFillColor(color.bg[0], color.bg[1], color.bg[2]);
      doc.roundedRect(margin, yPos, contentWidth, cardHeight, 3, 3, 'F');
      doc.setDrawColor(color.border[0], color.border[1], color.border[2]);
      doc.setLineWidth(1);
      doc.roundedRect(margin, yPos, contentWidth, cardHeight, 3, 3);

      doc.setTextColor(color.text[0], color.text[1], color.text[2]);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(asignatura.curso_nombre, margin + 3, yPos + 6);

      let yPosInterno = yPos + 10;

      (asignatura.criterios || []).forEach((criterio) => {
        const tieneIndicadores = criterio.indicadores?.length > 0;
        const notaCriterio = criterio.notas?.[cicloSeleccionado] ?? null;

        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        let criterioTexto = criterio.descripcion;
        if (asignatura.nivel?.tipo_calificacion_final === 1) {
          criterioTexto += ` (${criterio.peso}%)`;
        }
        const criterioLines = doc.splitTextToSize(criterioTexto, 70);
        doc.text(criterioLines[0], margin + 3, yPosInterno);

        const notasX = margin + 75;
        const notasMaxWidth = contentWidth - 80;

        if (tieneIndicadores) {
          const notasIndicadores = [];
          criterio.indicadores.forEach((indicador) => {
            const cuadros = indicador.cuadros || 1;
            for (let i = 0; i < cuadros; i++) {
              const nota =
                asignatura.notas?.[cicloSeleccionado]?.[criterio.id]?.[indicador.id]?.[i] ?? '-';
              notasIndicadores.push(nota);
            }
          });
          const notasLines = doc.splitTextToSize(notasIndicadores.join('  '), notasMaxWidth);
          doc.text(notasLines[0], notasX, yPosInterno);

          if (notaCriterio != null && notaCriterio !== '') {
            const promedioX = margin + contentWidth - 15;
            doc.setFillColor(253, 233, 217);
            doc.roundedRect(promedioX, yPosInterno - 2.5, 10, 4, 1, 1, 'F');
            doc.setDrawColor(color.border[0], color.border[1], color.border[2]);
            doc.setLineWidth(0.5);
            doc.roundedRect(promedioX, yPosInterno - 2.5, 10, 4, 1, 1);
            doc.setFont('helvetica', 'bold');
            doc.text(String(notaCriterio), promedioX + 5, yPosInterno, { align: 'center' });
            doc.setFont('helvetica', 'normal');
          }
        } else if (notaCriterio != null && notaCriterio !== '') {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.text(String(notaCriterio), notasX, yPosInterno);
          doc.setFont('helvetica', 'normal');
        } else {
          doc.text('-', notasX, yPosInterno);
        }

        yPosInterno += 7;
      });

      if (asignatura.examen_mensual) {
        const examenes = asignatura.notas?.[cicloSeleccionado]?.examen_mensual || {};
        const examen1 = examenes[1];
        const examen2 = examenes[2];
        let promedioExamen = null;
        if (examen1 && examen2) {
          const e1 = parseFloat(examen1);
          const e2 = parseFloat(examen2);
          if (!Number.isNaN(e1) && !Number.isNaN(e2) && e1 > 0 && e2 > 0) {
            promedioExamen = Math.round((e1 + e2) / 2);
          }
        }

        doc.setFontSize(7);
        doc.text(`Examen Mensual (${asignatura.peso_examen_mensual}%)`, margin + 3, yPosInterno);
        doc.text(`${examen1 || '-'}  ${examen2 || '-'}`, margin + 75, yPosInterno);

        if (promedioExamen) {
          const promedioX = margin + contentWidth - 15;
          doc.setFillColor(253, 233, 217);
          doc.roundedRect(promedioX, yPosInterno - 2.5, 10, 4, 1, 1, 'F');
          doc.setFont('helvetica', 'bold');
          doc.text(String(promedioExamen), promedioX + 5, yPosInterno, { align: 'center' });
          doc.setFont('helvetica', 'normal');
        }
        yPosInterno += 7;
      }

      const promedioFinal = asignatura.notas?.[cicloSeleccionado]?.promedio_final ?? null;
      yPosInterno -= 3;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('PROMEDIO', margin + 3, yPosInterno);
      if (promedioFinal != null && promedioFinal !== '') {
        const promedioX = margin + 75;
        doc.setFillColor(249, 249, 249);
        doc.roundedRect(promedioX, yPosInterno - 2.5, 12, 5, 1, 1, 'F');
        doc.setFontSize(9);
        doc.text(String(promedioFinal), promedioX + 6, yPosInterno, { align: 'center' });
      } else {
        doc.setFontSize(7);
        doc.text('-', margin + 75, yPosInterno);
      }

      yPos += cardHeight + 8;
    });

    const apellido = (notasDetalladas.alumno?.apellido_paterno || 'Alumno').replace(/\s+/g, '_');
    doc.save(`Notas_Detalladas_${apellido}_${nombresBimestres[cicloSeleccionado - 1]}_${Date.now()}.pdf`);

    Swal.fire({
      title: '¡PDF generado!',
      text: 'Las notas detalladas se han exportado correctamente',
      icon: 'success',
      timer: 2500,
      showConfirmButton: false,
    });
  } catch (error) {
    console.error(error);
    Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo exportar el PDF' });
  }
}
