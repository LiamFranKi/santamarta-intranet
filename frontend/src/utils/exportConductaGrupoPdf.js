import { jsPDF } from 'jspdf';
import Swal from 'sweetalert2';
import { formatNotaConducta, notaMaxReferencia } from './reglaConducta';

/**
 * Exporta PDF de registro de conducta (misma maquetación que Tutoría).
 */
export async function exportConductaGrupoPdf({ alumnos, grupo, ciclo, regla }) {
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
  const wNum = 14;
  const wInc = 18;
  const wPres = 20;
  const wTard = 18;
  const wNota = 22;
  const wName = pageWidth - 2 * margin - wNum - wInc - wPres - wTard - wNota;
  const notaMax = notaMaxReferencia(regla);

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

  const xs = {
    num: margin,
    name: margin + wNum,
    inc: margin + wNum + wName,
    pres: margin + wNum + wName + wInc,
    tard: margin + wNum + wName + wInc + wPres,
    nota: margin + wNum + wName + wInc + wPres + wTard,
  };

  const dibujarCabeceraTablaConducta = (yStart) => {
    let y = yStart;
    doc.setDrawColor(200, 200, 200);
    doc.setFillColor(234, 234, 234);
    doc.rect(xs.num, y, wNum, 8, 'FD');
    doc.rect(xs.name, y, wName, 8, 'FD');
    doc.rect(xs.inc, y, wInc, 8, 'FD');
    doc.rect(xs.pres, y, wPres, 8, 'FD');
    doc.rect(xs.tard, y, wTard, 8, 'FD');
    doc.rect(xs.nota, y, wNota, 8, 'FD');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(55, 65, 81);
    doc.text('N°', xs.num + wNum / 2, y + 5.5, { align: 'center' });
    doc.text('APELLIDOS Y NOMBRES', xs.name + 3, y + 5.5);
    doc.text('Incid.', xs.inc + wInc / 2, y + 5.5, { align: 'center' });
    doc.text('Present.', xs.pres + wPres / 2, y + 5.5, { align: 'center' });
    doc.text('Tard.', xs.tard + wTard / 2, y + 5.5, { align: 'center' });
    doc.text('NOTA', xs.nota + wNota / 2, y + 5.5, { align: 'center' });
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
    doc.rect(xs.num, yPos, wNum, rowH, 'FD');
    doc.rect(xs.name, yPos, wName, rowH, 'FD');
    doc.rect(xs.inc, yPos, wInc, rowH, 'FD');
    doc.rect(xs.pres, yPos, wPres, rowH, 'FD');
    doc.rect(xs.tard, yPos, wTard, rowH, 'FD');
    doc.rect(xs.nota, yPos, wNota, rowH, 'FD');
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(8);
    doc.text(String(i + 1), xs.num + wNum / 2, yPos + 4.5, { align: 'center' });
    doc.text((a.nombre_completo || '').slice(0, 70), xs.name + 2, yPos + 4.5);
    doc.text(String(a.total_incidencias ?? 0), xs.inc + wInc / 2, yPos + 4.5, { align: 'center' });
    doc.text(String(a.total_presentacion ?? 0), xs.pres + wPres / 2, yPos + 4.5, { align: 'center' });
    doc.text(String(a.total_tardanzas ?? 0), xs.tard + wTard / 2, yPos + 4.5, { align: 'center' });
    doc.text(a.nota_conducta || formatNotaConducta(notaMax), xs.nota + wNota / 2, yPos + 4.5, { align: 'center' });
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
