/**
 * PDF de boleta de pago — diseño sobrio tipo comprobante clásico
 * (apoderado, docente/apoderado, admin).
 * Recibe el JSON de GET …/pagos/:id/boleta.
 */
import { jsPDF } from 'jspdf';

function numeroALetras(num) {
  const matuni = {
    1: 'uno',
    2: 'dos',
    3: 'tres',
    4: 'cuatro',
    5: 'cinco',
    6: 'seis',
    7: 'siete',
    8: 'ocho',
    9: 'nueve',
    10: 'diez',
    11: 'once',
    12: 'doce',
    13: 'trece',
    14: 'catorce',
    15: 'quince',
    16: 'dieciséis',
    17: 'diecisiete',
    18: 'dieciocho',
    19: 'diecinueve',
    20: 'veinte',
  };
  const matdec = {
    2: 'veinte',
    3: 'treinta',
    4: 'cuarenta',
    5: 'cincuenta',
    6: 'sesenta',
    7: 'setenta',
    8: 'ochenta',
    9: 'noventa',
  };
  const matcent = {
    1: 'ciento',
    2: 'doscientos',
    3: 'trescientos',
    4: 'cuatrocientos',
    5: 'quinientos',
    6: 'seiscientos',
    7: 'setecientos',
    8: 'ochocientos',
    9: 'novecientos',
  };

  if (num === 0) return 'cero';
  if (num < 0) return 'menos ' + numeroALetras(-num);

  let resultado = '';
  const millones = Math.floor(num / 1000000);
  const miles = Math.floor((num % 1000000) / 1000);
  const unidades = num % 1000;

  if (millones > 0) {
    if (millones === 1) {
      resultado += 'un millón ';
    } else {
      resultado += numeroALetras(millones) + ' millones ';
    }
  }

  if (miles > 0) {
    if (miles === 1) {
      resultado += 'mil ';
    } else {
      resultado += numeroALetras(miles) + ' mil ';
    }
  }

  if (unidades > 0) {
    if (unidades === 100) {
      resultado += 'cien';
    } else if (unidades < 100) {
      if (unidades <= 20) {
        resultado += matuni[unidades];
      } else {
        const decenas = Math.floor(unidades / 10);
        const unidadesNum = unidades % 10;
        if (decenas === 2 && unidadesNum > 0) {
          resultado += 'veinti' + matuni[unidadesNum];
        } else {
          resultado += matdec[decenas];
          if (unidadesNum > 0) {
            resultado += ' y ' + matuni[unidadesNum];
          }
        }
      }
    } else {
      const centenas = Math.floor(unidades / 100);
      const resto = unidades % 100;
      resultado += matcent[centenas];
      if (resto > 0) {
        resultado += ' ' + numeroALetras(resto);
      }
    }
  }

  return resultado.trim();
}

async function cargarLogoBoleta(doc, x, y, w, h) {
  try {
    const { cargarLogoPngDataUrl } = await import('./pdfReporteColegioLogo');
    const dataUrl = await cargarLogoPngDataUrl('/icons/logoboleta.png');
    if (!dataUrl) return false;
    await new Promise((resolve) => {
      try {
        doc.addImage(dataUrl, 'PNG', x, y, w, h);
      } catch {
        /* sin logo */
      }
      resolve();
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {object} datosBoleta — cuerpo de `response.data` del endpoint boleta
 */
export async function generarPDFBoletaDesdeDatos(datosBoleta) {
  const { pago: pagoRaw, alumno: alumnoRaw, facturacion, boleta } = datosBoleta || {};
  if (!pagoRaw || !alumnoRaw || !facturacion) {
    throw new Error('Datos de boleta incompletos');
  }

  const pagoData = { ...pagoRaw };
  const alumno = { ...alumnoRaw };

  if (!alumno.nombre_completo) {
    alumno.nombre_completo = `${alumno.apellido_paterno || ''} ${alumno.apellido_materno || ''}, ${alumno.nombres || ''}`
      .trim()
      .replace(/^,\s*|,\s*$/g, '');
  }

  if (boleta && boleta.numero != null && boleta.serie != null) {
    pagoData.boleta_numero = boleta.numero;
    pagoData.boleta_serie = boleta.serie;
  }

  pagoData.total = parseFloat(pagoData.total) || 0;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentW = pageWidth - margin * 2;

  // Paleta sobria pero con acentos elegantes (slate / teal suave)
  const ink = [30, 41, 59]; // slate-800
  const mute = [100, 116, 139]; // slate-500
  const accent = [51, 65, 85]; // slate-700
  const accentSoft = [241, 245, 249]; // slate-100
  const accentMid = [203, 213, 225]; // slate-300
  const teal = [15, 118, 110]; // teal-700
  const tealSoft = [240, 253, 250]; // teal-50
  const tealBorder = [153, 246, 228]; // teal-200
  const white = [255, 255, 255];
  const headerBand = [248, 250, 252]; // slate-50

  // Marco doble elegante
  doc.setDrawColor(...accent);
  doc.setLineWidth(0.9);
  doc.roundedRect(8, 8, pageWidth - 16, pageHeight - 16, 3, 3, 'S');
  doc.setDrawColor(...accentMid);
  doc.setLineWidth(0.35);
  doc.roundedRect(10.5, 10.5, pageWidth - 21, pageHeight - 21, 2.2, 2.2, 'S');

  // Banda superior suave
  doc.setFillColor(...headerBand);
  doc.roundedRect(11, 11, pageWidth - 22, 34, 2, 2, 'F');

  // —— Encabezado ——
  let y = 15;
  await cargarLogoBoleta(doc, margin, y, 20, 20);

  const razon = String(facturacion.razon_social || 'EMPRESA').toUpperCase();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...accent);
  doc.text(razon, margin + 24, y + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...mute);
  doc.text(`R.U.C. ${facturacion.ruc || 'N/A'}`, margin + 24, y + 15);

  // Caja BOLETA redondeada
  const boxW = 54;
  const boxH = 22;
  const boxX = pageWidth - margin - boxW;
  const boxY = y - 1;
  doc.setFillColor(...white);
  doc.setDrawColor(...accent);
  doc.setLineWidth(0.7);
  doc.roundedRect(boxX, boxY, boxW, boxH, 2.5, 2.5, 'FD');
  // detalle superior de la caja
  doc.setFillColor(...accent);
  doc.roundedRect(boxX, boxY, boxW, 3.2, 2.5, 2.5, 'F');
  doc.setFillColor(...accent);
  doc.rect(boxX, boxY + 1.5, boxW, 1.8, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...accent);
  doc.text('BOLETA DE VENTA', boxX + boxW / 2, boxY + 10, { align: 'center' });

  const numeroBoleta = `${String(pagoData.boleta_serie || '001').padStart(3, '0')}-${String(
    pagoData.boleta_numero || '0000000'
  ).padStart(7, '0')}`;
  doc.setFontSize(11);
  doc.setTextColor(...teal);
  doc.text(`N°. ${numeroBoleta}`, boxX + boxW / 2, boxY + 17.5, { align: 'center' });

  // —— Cliente (card redondeada) ——
  y = 50;
  const nombreCliente = String(alumno.nombre_completo || 'N/A')
    .replace(/\s+/g, ' ')
    .trim();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const nombreLines = doc.splitTextToSize(nombreCliente, contentW - 70);
  const clienteH = Math.max(22, 12 + nombreLines.length * 4.5);

  const clienteW = contentW - 58;
  doc.setFillColor(...accentSoft);
  doc.setDrawColor(...accentMid);
  doc.setLineWidth(0.45);
  doc.roundedRect(margin, y, clienteW, clienteH, 2.5, 2.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...teal);
  doc.text('SEÑOR (A)', margin + 4, y + 5.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...ink);
  doc.text(nombreLines, margin + 4, y + 11);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...mute);
  doc.text('DNI', margin + 4, y + clienteH - 4);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...ink);
  doc.text(String(alumno.dni || 'N/A'), margin + 14, y + clienteH - 4);

  // Fecha card
  const fechaPago = pagoData.fecha_cancelado ? new Date(pagoData.fecha_cancelado) : new Date();
  const dia = String(fechaPago.getDate()).padStart(2, '0');
  const mes = String(fechaPago.getMonth() + 1).padStart(2, '0');
  const anio = String(fechaPago.getFullYear());

  const fechaBoxW = 52;
  const fechaBoxX = pageWidth - margin - fechaBoxW;
  doc.setFillColor(...white);
  doc.setDrawColor(...accent);
  doc.setLineWidth(0.55);
  doc.roundedRect(fechaBoxX, y, fechaBoxW, clienteH, 2.5, 2.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...teal);
  doc.text('FECHA DE PAGO', fechaBoxX + fechaBoxW / 2, y + 5, { align: 'center' });

  const colW = (fechaBoxW - 6) / 3;
  const fechaInnerY = y + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...mute);
  doc.text('DÍA', fechaBoxX + 3 + colW * 0.5, fechaInnerY, { align: 'center' });
  doc.text('MES', fechaBoxX + 3 + colW * 1.5, fechaInnerY, { align: 'center' });
  doc.text('AÑO', fechaBoxX + 3 + colW * 2.5, fechaInnerY, { align: 'center' });

  doc.setFillColor(...accentSoft);
  doc.setDrawColor(...accentMid);
  doc.setLineWidth(0.3);
  doc.roundedRect(fechaBoxX + 3, fechaInnerY + 1.5, fechaBoxW - 6, 9, 1.5, 1.5, 'FD');
  doc.line(fechaBoxX + 3 + colW, fechaInnerY + 1.5, fechaBoxX + 3 + colW, fechaInnerY + 10.5);
  doc.line(fechaBoxX + 3 + colW * 2, fechaInnerY + 1.5, fechaBoxX + 3 + colW * 2, fechaInnerY + 10.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...ink);
  doc.text(dia, fechaBoxX + 3 + colW * 0.5, fechaInnerY + 7.5, { align: 'center' });
  doc.text(mes, fechaBoxX + 3 + colW * 1.5, fechaInnerY + 7.5, { align: 'center' });
  doc.text(anio, fechaBoxX + 3 + colW * 2.5, fechaInnerY + 7.5, { align: 'center' });

  // —— Tabla ——
  y += clienteH + 8;
  const tableX = margin;
  const colN = 14;
  const colImp = 34;
  const colDesc = contentW - colN - colImp;
  const rowH = 9;

  doc.setFillColor(...accent);
  doc.setDrawColor(...accent);
  doc.setLineWidth(0.3);
  doc.roundedRect(tableX, y, contentW, rowH, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...white);
  doc.text('N°.', tableX + colN / 2, y + 5.8, { align: 'center' });
  doc.text('DESCRIPCIÓN', tableX + colN + 3, y + 5.8);
  doc.text('IMPORTE S/', tableX + contentW - 3, y + 5.8, { align: 'right' });

  y += rowH;
  const desc = String(pagoData.tipo_descripcion || 'PAGO');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const descLines = doc.splitTextToSize(desc, colDesc - 6);
  const itemH = Math.max(11, 5 + descLines.length * 4.2);

  doc.setFillColor(...white);
  doc.setDrawColor(...accentMid);
  doc.setLineWidth(0.4);
  doc.roundedRect(tableX, y - 0.5, contentW, itemH + 0.5, 0, 0, 'S');
  // cierre inferior redondeado
  doc.setDrawColor(...accentMid);
  doc.roundedRect(tableX, y - 0.5, contentW, itemH + 0.5, 2, 2, 'S');
  doc.line(tableX + colN, y - 0.5, tableX + colN, y + itemH);
  doc.line(tableX + colN + colDesc, y - 0.5, tableX + colN + colDesc, y + itemH);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...mute);
  doc.text('1', tableX + colN / 2, y + 6.5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...ink);
  doc.text(descLines, tableX + colN + 3, y + 6.5);
  const importe = pagoData.total.toFixed(2);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...teal);
  doc.text(importe, tableX + contentW - 3, y + 6.5, { align: 'right' });

  // —— Total en letras + TOTAL ——
  y += itemH + 7;
  const totalEntero = Math.floor(pagoData.total);
  const totalDecimal = Math.round((pagoData.total - totalEntero) * 100);
  const totalLetras =
    numeroALetras(totalEntero).toUpperCase() + ` CON ${String(totalDecimal).padStart(2, '0')}/100 SOLES`;

  const letrasW = contentW - 58;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const letrasLines = doc.splitTextToSize(totalLetras, letrasW - 8);
  const letrasH = Math.max(14, 6 + letrasLines.length * 3.8);

  doc.setFillColor(...accentSoft);
  doc.setDrawColor(...accentMid);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, y, letrasW, letrasH, 2.5, 2.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...teal);
  doc.text('SON', margin + 4, y + 4.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...ink);
  doc.text(letrasLines, margin + 4, y + 9);

  const totalBoxW = 52;
  const totalBoxX = pageWidth - margin - totalBoxW;
  doc.setFillColor(...accent);
  doc.setDrawColor(...accent);
  doc.roundedRect(totalBoxX, y, totalBoxW, letrasH, 2.5, 2.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(226, 232, 240);
  doc.text('TOTAL', totalBoxX + totalBoxW / 2, y + letrasH / 2 - 2.5, { align: 'center' });
  doc.setFontSize(12);
  doc.setTextColor(...white);
  doc.text(`S/. ${importe}`, totalBoxX + totalBoxW / 2, y + letrasH / 2 + 4, { align: 'center' });

  // —— Forma de pago / Estado ——
  y += letrasH + 7;
  const half = (contentW - 6) / 2;

  doc.setFillColor(...white);
  doc.setDrawColor(...accentMid);
  doc.setLineWidth(0.45);
  doc.roundedRect(margin, y, half, 14, 2.5, 2.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...mute);
  doc.text('FORMA DE PAGO', margin + 4, y + 4.5);
  doc.setFontSize(10);
  doc.setTextColor(...accent);
  doc.text('EFECTIVO', margin + 4, y + 10.5);

  doc.setFillColor(...tealSoft);
  doc.setDrawColor(...tealBorder);
  doc.roundedRect(margin + half + 6, y, half, 14, 2.5, 2.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...teal);
  doc.text('ESTADO', margin + half + 10, y + 4.5);
  doc.setFontSize(10);
  doc.text('CANCELADO', margin + half + 10, y + 10.5);

  // —— Pie ——
  y = pageHeight - 30;
  doc.setDrawColor(...accentMid);
  doc.setLineWidth(0.4);
  doc.line(margin, y, pageWidth - margin, y);

  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...accent);
  doc.text(`${razon}`, pageWidth / 2, y, { align: 'center' });
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...mute);
  doc.text(`© ${new Date().getFullYear()} / ${razon}`, pageWidth / 2, y, { align: 'center' });

  const nombreArchivo = `Boleta_${numeroBoleta.replace(/-/g, '_')}_${alumno.dni || 'N/A'}.pdf`;
  doc.save(nombreArchivo);
}

export const MSG_NO_IMPRESION_BOLETA = 'NO TIENE IMPRESION DE BOLETA';
