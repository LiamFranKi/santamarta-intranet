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
    const logoResponse = await fetch('/icons/logoboleta.png');
    if (!logoResponse.ok) return false;
    const logoBlob = await logoResponse.blob();
    const logoReader = new FileReader();
    await new Promise((resolve) => {
      logoReader.onloadend = () => {
        try {
          doc.addImage(logoReader.result, 'PNG', x, y, w, h);
        } catch {
          /* sin logo */
        }
        resolve();
      };
      logoReader.onerror = () => resolve();
      logoReader.readAsDataURL(logoBlob);
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
  const margin = 18;
  const contentW = pageWidth - margin * 2;

  // Paleta sobria (casi monocromo)
  const ink = [33, 33, 33];
  const mute = [90, 90, 90];
  const line = [160, 160, 160];
  const soft = [245, 245, 245];
  const white = [255, 255, 255];

  // Marco exterior discreto
  doc.setDrawColor(...line);
  doc.setLineWidth(0.4);
  doc.rect(margin - 4, 10, contentW + 8, pageHeight - 22);

  // —— Encabezado ——
  let y = 16;
  await cargarLogoBoleta(doc, margin, y, 18, 18);

  const razon = String(facturacion.razon_social || 'EMPRESA').toUpperCase();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...ink);
  doc.text(razon, margin + 22, y + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...mute);
  doc.text(`R.U.C. ${facturacion.ruc || 'N/A'}`, margin + 22, y + 13);

  // Caja tipográfica BOLETA (sin colores vivos)
  const boxW = 52;
  const boxH = 20;
  const boxX = pageWidth - margin - boxW;
  const boxY = y;
  doc.setDrawColor(...ink);
  doc.setLineWidth(0.6);
  doc.setFillColor(...white);
  doc.rect(boxX, boxY, boxW, boxH, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...ink);
  doc.text('BOLETA DE VENTA', boxX + boxW / 2, boxY + 8, { align: 'center' });

  const numeroBoleta = `${String(pagoData.boleta_serie || '001').padStart(3, '0')}-${String(
    pagoData.boleta_numero || '0000000'
  ).padStart(7, '0')}`;
  doc.setFontSize(10);
  doc.text(`N°. ${numeroBoleta}`, boxX + boxW / 2, boxY + 15, { align: 'center' });

  y = 42;
  doc.setDrawColor(...line);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);

  // —— Cliente / fecha (estilo Boleta 2) ——
  y += 8;
  const nombreCliente = String(alumno.nombre_completo || 'N/A')
    .replace(/\s+/g, ' ')
    .trim();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...ink);
  doc.text('SEÑOR (A):', margin, y);
  doc.setFont('helvetica', 'normal');
  const nombreLines = doc.splitTextToSize(nombreCliente, contentW - 28);
  doc.text(nombreLines, margin + 26, y);

  y += Math.max(6, nombreLines.length * 4.5) + 2;
  doc.setFont('helvetica', 'bold');
  doc.text('DNI:', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.text(String(alumno.dni || 'N/A'), margin + 12, y);

  // Fecha en columnas DÍA / MES / AÑO
  const fechaPago = pagoData.fecha_cancelado ? new Date(pagoData.fecha_cancelado) : new Date();
  const dia = String(fechaPago.getDate()).padStart(2, '0');
  const mes = String(fechaPago.getMonth() + 1).padStart(2, '0');
  const anio = String(fechaPago.getFullYear());

  const fechaBoxW = 48;
  const fechaBoxX = pageWidth - margin - fechaBoxW;
  const colW = fechaBoxW / 3;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...mute);
  doc.text('DÍA', fechaBoxX + colW * 0.5, y - 5, { align: 'center' });
  doc.text('MES', fechaBoxX + colW * 1.5, y - 5, { align: 'center' });
  doc.text('AÑO', fechaBoxX + colW * 2.5, y - 5, { align: 'center' });

  doc.setDrawColor(...line);
  doc.setLineWidth(0.35);
  doc.rect(fechaBoxX, y - 2, fechaBoxW, 8);
  doc.line(fechaBoxX + colW, y - 2, fechaBoxX + colW, y + 6);
  doc.line(fechaBoxX + colW * 2, y - 2, fechaBoxX + colW * 2, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...ink);
  doc.text(dia, fechaBoxX + colW * 0.5, y + 3.5, { align: 'center' });
  doc.text(mes, fechaBoxX + colW * 1.5, y + 3.5, { align: 'center' });
  doc.text(anio, fechaBoxX + colW * 2.5, y + 3.5, { align: 'center' });

  // —— Tabla ——
  y += 14;
  const tableX = margin;
  const colN = 12;
  const colImp = 32;
  const colDesc = contentW - colN - colImp;
  const rowH = 8;

  doc.setFillColor(...soft);
  doc.setDrawColor(...ink);
  doc.setLineWidth(0.4);
  doc.rect(tableX, y, contentW, rowH, 'FD');
  doc.line(tableX + colN, y, tableX + colN, y + rowH);
  doc.line(tableX + colN + colDesc, y, tableX + colN + colDesc, y + rowH);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...ink);
  doc.text('N°.', tableX + colN / 2, y + 5.2, { align: 'center' });
  doc.text('DESCRIPCIÓN', tableX + colN + 3, y + 5.2);
  doc.text('IMPORTE S/', tableX + contentW - 2, y + 5.2, { align: 'right' });

  y += rowH;
  const desc = String(pagoData.tipo_descripcion || 'PAGO');
  const descLines = doc.splitTextToSize(desc, colDesc - 6);
  const itemH = Math.max(rowH, 4 + descLines.length * 4);

  doc.setFillColor(...white);
  doc.rect(tableX, y, contentW, itemH, 'FD');
  doc.line(tableX + colN, y, tableX + colN, y + itemH);
  doc.line(tableX + colN + colDesc, y, tableX + colN + colDesc, y + itemH);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('1', tableX + colN / 2, y + 5.5, { align: 'center' });
  doc.text(descLines, tableX + colN + 3, y + 5.5);
  const importe = pagoData.total.toFixed(2);
  doc.setFont('helvetica', 'bold');
  doc.text(importe, tableX + contentW - 2, y + 5.5, { align: 'right' });

  // —— Total en letras + TOTAL ——
  y += itemH + 8;
  const totalEntero = Math.floor(pagoData.total);
  const totalDecimal = Math.round((pagoData.total - totalEntero) * 100);
  const totalLetras =
    numeroALetras(totalEntero).toUpperCase() + ` CON ${String(totalDecimal).padStart(2, '0')}/100 SOLES`;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...mute);
  const letrasLines = doc.splitTextToSize(totalLetras, contentW - 50);
  doc.text(letrasLines, margin, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...ink);
  doc.text(`TOTAL S/. ${importe}`, pageWidth - margin, y, { align: 'right' });

  // —— Forma de pago / Estado (sin badges de color) ——
  y += Math.max(10, letrasLines.length * 4 + 6);
  doc.setDrawColor(...line);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 7;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...ink);
  doc.text('EFECTIVO', margin, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...mute);
  doc.text('ESTADO:', pageWidth - margin - 40, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...ink);
  doc.text('CANCELADO', pageWidth - margin, y, { align: 'right' });

  // —— Pie ——
  y = pageHeight - 28;
  doc.setDrawColor(...line);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);

  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...mute);
  const footerText =
    'NO ES VÁLIDO PARA CRÉDITO FISCAL. PUEDE SER CANJEADO POR BOLETA DE VENTA SI ES REQUERIDO.';
  const footerLines = doc.splitTextToSize(footerText, contentW);
  doc.text(footerLines, pageWidth / 2, y, { align: 'center' });

  y += footerLines.length * 3.5 + 3;
  doc.setFontSize(8);
  doc.setTextColor(...ink);
  doc.text(`${razon}`, pageWidth / 2, y, { align: 'center' });
  y += 4;
  doc.setFontSize(7);
  doc.setTextColor(...mute);
  doc.text(`© ${new Date().getFullYear()} / ${razon}`, pageWidth / 2, y, { align: 'center' });

  const nombreArchivo = `Boleta_${numeroBoleta.replace(/-/g, '_')}_${alumno.dni || 'N/A'}.pdf`;
  doc.save(nombreArchivo);
}

export const MSG_NO_IMPRESION_BOLETA = 'NO TIENE IMPRESION DE BOLETA';
