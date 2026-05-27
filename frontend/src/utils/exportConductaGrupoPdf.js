import { jsPDF } from 'jspdf';
import Swal from 'sweetalert2';

/**
 * Exporta PDF de registro de conducta (misma maquetación que Tutoría).
 */
export async function exportConductaGrupoPdf({ alumnos, grupo, ciclo }) {
  if (!alumnos?.length) {
    await Swal.fire({ icon: 'info', title: 'Sin datos', text: 'No hay alumnos para exportar' });
    return;
  }

  const doc = new jsPDF('l', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const rowH = 7;
  const footerReserve = 14;
  const yContentMax = pageHeight - footerReserve;
  const grupoNombre = grupo
    ? `${grupo.grado}° ${grupo.seccion} - ${grupo.nivel_nombre || ''}`
    : '';
  const colorPrimario = [102, 126, 234];
  const colorBlanco = [255, 255, 255];

  try {
    const logoRes = await fetch('/icons/logoboleta.png');
    if (logoRes.ok) {
      const blob = await logoRes.blob();
      const dataUrl = await new Promise((res) => {
        const r = new FileReader();
        r.onloadend = () => res(r.result);
        r.readAsDataURL(blob);
      });
      doc.addImage(dataUrl, 'PNG', margin, 4, 24, 24);
    }
  } catch {
    /* ignore */
  }

  const dibujarBannerConducta = (esContinuacion) => {
    doc.setFillColor(...colorPrimario);
    doc.rect(0, 0, pageWidth, esContinuacion ? 22 : 32, 'F');
    doc.setFontSize(esContinuacion ? 11 : 14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...colorBlanco);
    doc.text(
      esContinuacion ? 'REGISTRO DE CONDUCTA (continúa)' : 'REGISTRO DE CONDUCTA',
      margin + (esContinuacion ? 4 : 30),
      esContinuacion ? 10 : 14
    );
    if (!esContinuacion) {
      doc.setFontSize(10);
      doc.setTextColor(240, 240, 240);
      doc.text(
        `Grupo: ${grupoNombre}  |  Bimestre: ${ciclo}  |  Año: ${grupo?.anio || ''}`,
        margin + 30,
        22
      );
    }
  };

  const dibujarCabeceraTablaConducta = (yStart) => {
    let y = yStart;
    doc.setDrawColor(200, 200, 200);
    doc.setFillColor(234, 234, 234);
    doc.rect(margin, y, 25, 8, 'FD');
    doc.rect(margin + 25, y, pageWidth - 2 * margin - 60, 8, 'FD');
    doc.rect(pageWidth - margin - 35, y, 35, 8, 'FD');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(55, 65, 81);
    doc.text('N°', margin + 12.5, y + 5.5, { align: 'center' });
    doc.text('APELLIDOS Y NOMBRES', margin + (pageWidth - 2 * margin - 60) / 2 + 25, y + 5.5, {
      align: 'center',
    });
    doc.text('NOTA', pageWidth - margin - 17.5, y + 5.5, { align: 'center' });
    y += 8;
    return y;
  };

  dibujarBannerConducta(false);
  let yPos = dibujarCabeceraTablaConducta(38);

  doc.setFont('helvetica', 'normal');
  alumnos.forEach((a, i) => {
    if (yPos + rowH > yContentMax) {
      doc.addPage();
      dibujarBannerConducta(true);
      yPos = dibujarCabeceraTablaConducta(26);
    }
    const zebra = i % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
    doc.setFillColor(...zebra);
    doc.setDrawColor(220, 220, 220);
    doc.rect(margin, yPos, 25, rowH, 'FD');
    doc.rect(margin + 25, yPos, pageWidth - 2 * margin - 60, rowH, 'FD');
    doc.rect(pageWidth - margin - 35, yPos, 35, rowH, 'FD');
    doc.setTextColor(30, 41, 59);
    doc.text(String(i + 1), margin + 12.5, yPos + 4.5, { align: 'center' });
    doc.text((a.nombre_completo || '').slice(0, 78), margin + 28, yPos + 4.5);
    doc.text(a.nota_conducta || '20', pageWidth - margin - 17.5, yPos + 4.5, { align: 'center' });
    yPos += rowH;
  });

  const totalP = doc.internal.getNumberOfPages();
  const genTxt = `Generado: ${new Date().toLocaleString('es-PE')}`;
  for (let p = 1; p <= totalP; p += 1) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(genTxt, margin, pageHeight - 6);
    doc.text(`Pág. ${p} / ${totalP}`, pageWidth - margin - 28, pageHeight - 6, { align: 'right' });
  }

  doc.save(`Conducta_${grupoNombre.replace(/\s+/g, '_')}_B${ciclo}.pdf`);
  await Swal.fire({
    icon: 'success',
    title: 'PDF generado',
    text: 'El reporte se descargó correctamente',
    timer: 2000,
    showConfirmButton: false,
  });
}
