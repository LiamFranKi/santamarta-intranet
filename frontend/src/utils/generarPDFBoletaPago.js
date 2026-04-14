/**
 * PDF de boleta de pago (mismo diseño que Apoderado → Imprimir Boleta).
 * Recibe el JSON de GET …/pagos/:id/boleta (apoderado o admin).
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
  let yPos = 8;

  const colorPrimario = [33, 150, 243];
  const colorSecundario = [76, 175, 80];
  const colorAcento = [255, 152, 0];
  const colorRojo = [244, 67, 54];
  const colorGrisOscuro = [66, 66, 66];
  const colorGrisClaro = [245, 245, 245];
  const colorBlanco = [255, 255, 255];

  doc.setFillColor(...colorPrimario);
  doc.rect(0, 0, pageWidth, 36, 'F');

  try {
    const logoResponse = await fetch('/icons/logoboleta.png');
    if (logoResponse.ok) {
      const logoBlob = await logoResponse.blob();
      const logoReader = new FileReader();
      await new Promise((resolve) => {
        logoReader.onloadend = () => {
          try {
            doc.addImage(logoReader.result, 'PNG', 12, 5, 26, 26);
          } catch {
            /* sin logo */
          }
          resolve();
        };
        logoReader.onerror = () => resolve();
        logoReader.readAsDataURL(logoBlob);
      });
    }
  } catch {
    /* sin logo */
  }

  doc.setFontSize(17);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...colorBlanco);
  doc.text(facturacion.razon_social || 'EMPRESA', 45, 15);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(240, 240, 240);
  doc.text(`R.U.C. ${facturacion.ruc || 'N/A'}`, 45, 22);

  const boletaCajaX = pageWidth - 68;
  const boletaCajaY = 3;
  const boletaCajaW = 53;
  const boletaCajaH = 28;

  doc.setFillColor(...colorBlanco);
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.5);
  doc.roundedRect(boletaCajaX, boletaCajaY, boletaCajaW, boletaCajaH, 4, 4, 'FD');

  const centroVertical = boletaCajaY + boletaCajaH / 2;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...colorPrimario);
  const boletaText = 'BOLETA DE VENTA';
  const boletaWidth = doc.getTextWidth(boletaText);
  doc.text(boletaText, boletaCajaX + (boletaCajaW - boletaWidth) / 2, centroVertical - 4);

  const numeroBoleta = `${String(pagoData.boleta_serie || '001').padStart(3, '0')}-${String(pagoData.boleta_numero || '0000000').padStart(7, '0')}`;
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...colorRojo);
  const numWidth = doc.getTextWidth(`N°. ${numeroBoleta}`);
  doc.text(`N°. ${numeroBoleta}`, boletaCajaX + (boletaCajaW - numWidth) / 2, centroVertical + 4);

  yPos = 42;

  const fechaCardX = 15;
  const fechaCardY = yPos;
  const fechaCardW = 58;
  const fechaCardH = 18;

  doc.setFillColor(255, 243, 224);
  doc.setDrawColor(...colorAcento);
  doc.setLineWidth(1.2);
  doc.roundedRect(fechaCardX, fechaCardY, fechaCardW, fechaCardH, 3, 3, 'FD');

  const fechaPago = pagoData.fecha_cancelado ? new Date(pagoData.fecha_cancelado) : new Date();
  const dia = fechaPago.getDate();
  const mes = fechaPago.getMonth() + 1;
  const año = fechaPago.getFullYear();

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...colorAcento);
  doc.text('FECHA DE PAGO', fechaCardX + fechaCardW / 2, fechaCardY + 6, { align: 'center' });

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...colorGrisOscuro);
  doc.text(`${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${año}`, fechaCardX + fechaCardW / 2, fechaCardY + 14, {
    align: 'center',
  });

  const clienteCardX = 78;
  const clienteCardY = yPos;
  const clienteCardW = pageWidth - 93;
  const clienteCardH = 18;

  doc.setFillColor(227, 242, 253);
  doc.setDrawColor(...colorPrimario);
  doc.setLineWidth(1.2);
  doc.roundedRect(clienteCardX, clienteCardY, clienteCardW, clienteCardH, 3, 3, 'FD');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...colorPrimario);
  doc.text('CLIENTE', clienteCardX + 3, clienteCardY + 6);

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...colorGrisOscuro);
  const nombreCliente = (alumno.nombre_completo || '').toUpperCase();
  const nombreMaxWidth = clienteCardW - 6;
  let nombreDisplay = nombreCliente;
  if (doc.getTextWidth(nombreDisplay) > nombreMaxWidth) {
    while (doc.getTextWidth(nombreDisplay + '...') > nombreMaxWidth && nombreDisplay.length > 0) {
      nombreDisplay = nombreDisplay.slice(0, -1);
    }
    nombreDisplay += '...';
  }
  doc.text(nombreDisplay, clienteCardX + 3, clienteCardY + 12);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...colorGrisOscuro);
  doc.text(`DNI: ${alumno.dni || 'N/A'}`, clienteCardX + 3, clienteCardY + 15);

  yPos += 32;

  doc.setFillColor(...colorPrimario);
  doc.setDrawColor(...colorPrimario);
  doc.setLineWidth(0.5);
  doc.roundedRect(15, yPos - 6, pageWidth - 30, 8, 2, 2, 'FD');

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...colorBlanco);
  doc.text('N°.', 18, yPos);
  doc.text('DESCRIPCIÓN', 35, yPos);
  doc.text('IMPORTE', pageWidth - 22, yPos, { align: 'right' });

  yPos += 8;
  doc.setFillColor(...colorBlanco);
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.roundedRect(15, yPos - 5, pageWidth - 30, 7, 1, 1, 'FD');

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...colorGrisOscuro);
  doc.text('1', 18, yPos);
  doc.text(pagoData.tipo_descripcion || 'PAGO', 35, yPos);
  const importe = pagoData.total.toFixed(2);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...colorPrimario);
  doc.text(`S/ ${importe}`, pageWidth - 22, yPos, { align: 'right' });

  yPos += 12;

  const letrasCardX = 15;
  const letrasCardY = yPos;
  const letrasCardW = pageWidth - 98;
  const letrasCardH = 10;

  doc.setFillColor(232, 245, 233);
  doc.setDrawColor(...colorSecundario);
  doc.setLineWidth(1);
  doc.roundedRect(letrasCardX, letrasCardY, letrasCardW, letrasCardH, 2, 2, 'FD');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  const totalEntero = Math.floor(pagoData.total);
  const totalDecimal = Math.round((pagoData.total - totalEntero) * 100);
  const totalLetras =
    numeroALetras(totalEntero).toUpperCase() + ` CON ${String(totalDecimal).padStart(2, '0')}/100 SOLES`;
  doc.setTextColor(...colorGrisOscuro);
  const letrasMaxWidth = letrasCardW - 6;
  let letrasDisplay = totalLetras;
  if (doc.getTextWidth(letrasDisplay) > letrasMaxWidth) {
    doc.setFontSize(8);
    if (doc.getTextWidth(letrasDisplay) > letrasMaxWidth) {
      while (doc.getTextWidth(letrasDisplay) > letrasMaxWidth && letrasDisplay.length > 0) {
        letrasDisplay = letrasDisplay.slice(0, -1);
      }
    }
  }
  doc.text(letrasDisplay, letrasCardX + 3, letrasCardY + 6.5);

  const totalCardX = pageWidth - 78;
  const totalCardY = yPos;
  const totalCardW = 63;
  const totalCardH = 10;

  doc.setFillColor(...colorPrimario);
  doc.setDrawColor(...colorPrimario);
  doc.setLineWidth(1);
  doc.roundedRect(totalCardX, totalCardY, totalCardW, totalCardH, 3, 3, 'FD');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...colorBlanco);
  doc.text('TOTAL', totalCardX + totalCardW / 2, totalCardY + 4.5, { align: 'center' });

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`S/ ${importe}`, totalCardX + totalCardW / 2, totalCardY + 8.5, { align: 'center' });

  yPos += 16;

  const pagoCardX = 15;
  const pagoCardY = yPos;
  const pagoCardW = 52;
  const pagoCardH = 10;

  doc.setFillColor(...colorGrisClaro);
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(1);
  doc.roundedRect(pagoCardX, pagoCardY, pagoCardW, pagoCardH, 2, 2, 'FD');

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...colorGrisOscuro);
  doc.text('FORMA DE PAGO', pagoCardX + pagoCardW / 2, pagoCardY + 4.5, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...colorGrisOscuro);
  doc.text('EFECTIVO', pagoCardX + pagoCardW / 2, pagoCardY + 8.5, { align: 'center' });

  const estadoCardX = pageWidth - 78;
  const estadoCardY = yPos;
  const estadoCardW = 63;
  const estadoCardH = 10;

  doc.setFillColor(...colorSecundario);
  doc.setDrawColor(...colorSecundario);
  doc.setLineWidth(1);
  doc.roundedRect(estadoCardX, estadoCardY, estadoCardW, estadoCardH, 3, 3, 'FD');

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...colorBlanco);
  doc.text('ESTADO', estadoCardX + estadoCardW / 2, estadoCardY + 4.5, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('CANCELADO', estadoCardX + estadoCardW / 2, estadoCardY + 8.5, { align: 'center' });

  yPos = pageHeight - 16;
  doc.setFillColor(250, 250, 250);
  doc.rect(0, yPos - 4, pageWidth, 16, 'F');

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(15, yPos - 4, pageWidth - 15, yPos - 4);

  doc.setTextColor(120, 120, 120);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  const footerText =
    'NO ES VÁLIDO PARA CRÉDITO FISCAL. PUEDE SER CANJEADO POR BOLETA DE VENTA SI ES REQUERIDO.';
  doc.text(footerText, pageWidth / 2, yPos + 2, { align: 'center', maxWidth: pageWidth - 30 });

  yPos += 6;
  doc.setFontSize(7);
  doc.text(`${facturacion.razon_social || 'EMPRESA'} ©${new Date().getFullYear()}`, pageWidth / 2, yPos, {
    align: 'center',
  });

  const nombreArchivo = `Boleta_${numeroBoleta.replace(/-/g, '_')}_${alumno.dni || 'N/A'}.pdf`;
  doc.save(nombreArchivo);
}

export const MSG_NO_IMPRESION_BOLETA = 'NO TIENE IMPRESION DE BOLETA';
