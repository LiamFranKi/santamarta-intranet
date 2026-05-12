/**
 * Carnet QR 90×60 mm (misma apariencia que Apoderado → Imprimir PDF), dibujado en offsets (ox, oy) mm.
 * En lote: generar SIEMPRE un PNG nuevo por alumno con QRCode.toDataURL(item.qr_data) — no reutilizar entre ítems.
 */
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

function loadImageAsDataUrl(url) {
  if (!url || typeof url !== 'string') return Promise.resolve(null);
  return fetch(url, { mode: 'cors' })
    .then((r) => r.blob())
    .then(
      (blob) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        })
    )
    .catch(() => null);
}

/**
 * @param {import('jspdf').jsPDF} doc
 * @param {object} qrData — mismo shape que GET apoderado/hijos/:id/qr
 * @param {number} ox mm origen horizontal del carnet
 * @param {number} oy mm origen vertical del carnet
 * @param {string} qrPngDataUrl data URL PNG del QR de ESTE alumno
 */
export async function drawCarnetQrMm(doc, qrData, ox, oy, qrPngDataUrl) {
  const width = 90;
  const height = 60;
  const X = (x) => ox + x;
  const Y = (y) => oy + y;

  const blueBg = [41, 65, 114];
  const blueDark = [28, 48, 95];
  const blueLight = [52, 82, 138];
  const greenBorder = [34, 197, 94];
  const white = [255, 255, 255];
  const orangeAccent = [251, 191, 36];
  const cardRadius = 3;

  const scale = 4;
  const gradCanvas = document.createElement('canvas');
  gradCanvas.width = width * scale;
  gradCanvas.height = height * scale;
  const gctx = gradCanvas.getContext('2d');
  const rClip = cardRadius * scale;
  gctx.beginPath();
  if (gctx.roundRect) {
    gctx.roundRect(0, 0, gradCanvas.width, gradCanvas.height, rClip);
  } else {
    gctx.rect(0, 0, gradCanvas.width, gradCanvas.height);
  }
  gctx.closePath();
  gctx.clip();
  const gradient = gctx.createLinearGradient(0, 0, 0, gradCanvas.height);
  gradient.addColorStop(0, `rgb(${blueDark[0]}, ${blueDark[1]}, ${blueDark[2]})`);
  gradient.addColorStop(0.5, `rgb(${blueBg[0]}, ${blueBg[1]}, ${blueBg[2]})`);
  gradient.addColorStop(1, `rgb(${blueLight[0]}, ${blueLight[1]}, ${blueLight[2]})`);
  gctx.fillStyle = gradient;
  gctx.fillRect(0, 0, gradCanvas.width, gradCanvas.height);
  const W = gradCanvas.width;
  const H = gradCanvas.height;
  gctx.globalAlpha = 0.07;
  gctx.beginPath();
  gctx.moveTo(W + 20, H * 0.3);
  gctx.bezierCurveTo(W * 0.85, H * 0.2, W * 0.6, H * 0.5, W * 0.35, H * 0.4);
  gctx.bezierCurveTo(W * 0.15, H * 0.32, -20, H * 0.5, -20, H * 0.6);
  gctx.lineTo(-20, H + 20);
  gctx.lineTo(W + 20, H + 20);
  gctx.closePath();
  gctx.fillStyle = 'rgb(34, 197, 94)';
  gctx.fill();
  gctx.globalAlpha = 0.05;
  gctx.beginPath();
  gctx.moveTo(W + 30, H * 0.75);
  gctx.bezierCurveTo(W * 0.7, H * 0.7, W * 0.4, H * 0.85, W * 0.2, H * 0.75);
  gctx.bezierCurveTo(0, H * 0.65, -20, H * 0.8, -20, H + 20);
  gctx.lineTo(W + 30, H + 20);
  gctx.closePath();
  gctx.fillStyle = 'rgb(22, 163, 74)';
  gctx.fill();
  gctx.globalAlpha = 0.04;
  gctx.beginPath();
  gctx.moveTo(W * 0.9, 0);
  gctx.bezierCurveTo(W * 0.6, -H * 0.1, W * 0.3, H * 0.25, 0, H * 0.15);
  gctx.lineTo(-20, H + 20);
  gctx.lineTo(W + 20, H + 20);
  gctx.lineTo(W + 20, -20);
  gctx.closePath();
  gctx.fillStyle = 'rgb(74, 222, 128)';
  gctx.fill();
  gctx.globalAlpha = 1;
  try {
    doc.addImage(gradCanvas.toDataURL('image/png'), 'PNG', X(0), Y(0), width, height);
  } catch (e) {
    doc.setFillColor(...blueBg);
    doc.roundedRect(X(0), Y(0), width, height, cardRadius, cardRadius, 'F');
  }
  doc.setDrawColor(...greenBorder);
  doc.setLineWidth(0.8);
  doc.roundedRect(X(0), Y(0), width, height, cardRadius, cardRadius);

  const logoSize = 10;
  const logoX = 3;
  const logoY = 2;
  const logoUrlLocal = typeof window !== 'undefined' ? `${window.location.origin}/icons/logoboleta.png` : '';
  let logoData = logoUrlLocal ? await loadImageAsDataUrl(logoUrlLocal) : null;
  if (!logoData) logoData = qrData.logo_base64 || null;
  if (!logoData && qrData.logo_url) logoData = await loadImageAsDataUrl(qrData.logo_url);
  if (logoData) {
    try {
      const logoFormat = logoData.indexOf('image/png') !== -1 ? 'PNG' : 'JPEG';
      doc.addImage(logoData, logoFormat, X(logoX), Y(logoY), logoSize, logoSize);
    } catch (e) {
      /* ignorar */
    }
  }

  const colegioNombre = (qrData.colegio_nombre || 'Vanguard Schools').trim();
  const partes = colegioNombre.toUpperCase().split(/\s+/);
  const titulo = partes[0] || 'COLEGIO';
  const subtitulo = partes.slice(1).join(' ') || 'VANGUARD SCHOOLS';
  doc.setTextColor(...white);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(titulo, X(logoX + logoSize + 4), Y(logoY + 4));
  doc.text(subtitulo, X(logoX + logoSize + 4), Y(logoY + 9.5));
  doc.setFontSize(8);
  doc.setTextColor(...orangeAccent);
  doc.text('Intranet Escolar', X(width - 4), Y(logoY + 5.5), { align: 'right' });
  doc.setTextColor(...white);

  const bodyY = 16;
  const photoW = 29;
  const photoH = 28;
  const photoX = 3;
  const photoRadius = 6;
  const centerX = 35;
  const centerW = 50;
  const qrBoxSize = 24;
  const qrY = 30;
  const qrX = width - qrBoxSize - 5;

  const photoInset = 0;
  const photoInnerW = photoW - photoInset * 2;
  const photoInnerH = photoH - photoInset * 2;
  let photoData = qrData.foto_base64 || null;
  if (!photoData && qrData.foto_url) photoData = await loadImageAsDataUrl(qrData.foto_url);
  if (photoData) {
    try {
      doc.setFillColor(...blueBg);
      doc.roundedRect(X(photoX), Y(bodyY), photoW, photoH, photoRadius, photoRadius, 'F');
      const photoClipped = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const sc = 6;
          const c = document.createElement('canvas');
          c.width = photoInnerW * sc;
          c.height = photoInnerH * sc;
          const ctx = c.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          const rr = Math.max(1, photoRadius * sc);
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(0, 0, c.width, c.height, rr);
          else ctx.rect(0, 0, c.width, c.height);
          ctx.closePath();
          ctx.clip();
          const boxAspect = c.width / c.height;
          const imgAspect = img.width / img.height;
          let sx = 0;
          let sy = 0;
          let sw = img.width;
          let sh = img.height;
          if (imgAspect > boxAspect) {
            sw = img.height * boxAspect;
            sx = (img.width - sw) / 2;
          } else {
            sh = img.width / boxAspect;
            sy = (img.height - sh) / 2;
          }
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/png'));
        };
        img.onerror = () => resolve(null);
        img.src = photoData;
      });
      if (photoClipped) {
        doc.addImage(photoClipped, 'PNG', X(photoX + photoInset), Y(bodyY + photoInset), photoInnerW, photoInnerH);
      } else {
        doc.addImage(
          photoData,
          photoData.indexOf('image/png') !== -1 ? 'PNG' : 'JPEG',
          X(photoX + photoInset),
          Y(bodyY + photoInset),
          photoInnerW,
          photoInnerH
        );
      }
    } catch (e) {
      doc.setFillColor(60, 70, 90);
      doc.roundedRect(X(photoX), Y(bodyY), photoW, photoH, photoRadius, photoRadius, 'F');
    }
  } else {
    doc.setFillColor(60, 70, 90);
    doc.roundedRect(X(photoX), Y(bodyY), photoW, photoH, photoRadius, photoRadius, 'F');
  }
  doc.setDrawColor(...orangeAccent);
  doc.setLineWidth(0.35);
  doc.roundedRect(X(photoX), Y(bodyY), photoW, photoH, photoRadius, photoRadius, 'S');

  const paddingFotoApoderado = 4;
  const filaY0 = bodyY + photoH + paddingFotoApoderado;
  const labelW = 20;
  const valorX = photoX + labelW;
  const valorMaxW = qrX - valorX - 2;
  const filaH = 3.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(...orangeAccent);
  doc.text('Apoderado', X(photoX), Y(filaY0 + 1.2));
  doc.setFontSize(5.5);
  doc.setTextColor(...white);
  const apoderadoNombre = (qrData.apoderado_nombre || '-').trim();
  const lineasNombre = doc.splitTextToSize(apoderadoNombre, valorMaxW);
  lineasNombre.slice(0, 2).forEach((line, i) => doc.text(line, X(valorX), Y(filaY0 + 1.2 + i * 2.2)));
  doc.setFontSize(5.5);
  doc.setTextColor(...orangeAccent);
  doc.text('Cel. Apoderado', X(photoX), Y(filaY0 + filaH + 1.2));
  doc.setTextColor(...white);
  const cel = (qrData.apoderado_celular || '-').trim();
  const lineasCel = doc.splitTextToSize(cel, valorMaxW);
  lineasCel.slice(0, 2).forEach((line, i) => doc.text(line, X(valorX), Y(filaY0 + filaH + 1.2 + i * 2.2)));
  doc.setTextColor(...orangeAccent);
  doc.text('Dirección', X(photoX), Y(filaY0 + filaH * 2 + 1.2));
  doc.setTextColor(...white);
  const dir = (qrData.direccion || '-').trim();
  const lineasDir = doc.splitTextToSize(dir, valorMaxW);
  lineasDir.slice(0, 2).forEach((line, i) => doc.text(line, X(valorX), Y(filaY0 + filaH * 2 + 1.2 + i * 2.2)));

  const nombres = (qrData.nombres || '').trim();
  const apellidos = `${(qrData.apellido_paterno || '')} ${(qrData.apellido_materno || '')}`.trim();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...white);
  let textY = bodyY + 6;
  if (nombres) {
    const nombresLines = doc.splitTextToSize(nombres, centerW - 2);
    doc.text(nombresLines[0], X(centerX), Y(textY));
    textY += 5;
  }
  if (apellidos) {
    const apellidosLines = doc.splitTextToSize(apellidos, centerW - 2);
    doc.text(apellidosLines[0], X(centerX), Y(textY));
    textY += 5;
  }
  if (qrData.grupo) {
    doc.setFontSize(8);
    doc.setTextColor(...orangeAccent);
    doc.setFont('helvetica', 'bold');
    const grupoLines = doc.splitTextToSize(qrData.grupo, centerW - 2);
    grupoLines.slice(0, 2).forEach((line) => {
      doc.text(line, X(centerX), Y(textY));
      textY += 4.5;
    });
  }
  const dni = qrData.nro_documento || '';
  if (dni) {
    textY += 2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...white);
    doc.text(`DNI: ${dni}`, X(centerX), Y(textY));
  }

  const qrPadding = 0.6;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(X(qrX), Y(qrY), qrBoxSize, qrBoxSize, 1, 1, 'F');
  doc.setDrawColor(...orangeAccent);
  doc.setLineWidth(0.35);
  doc.roundedRect(X(qrX), Y(qrY), qrBoxSize, qrBoxSize, 1, 1, 'S');
  if (qrPngDataUrl) {
    try {
      const qrDrawSize = qrBoxSize - qrPadding * 2;
      doc.addImage(qrPngDataUrl, 'PNG', X(qrX + qrPadding), Y(qrY + qrPadding), qrDrawSize, qrDrawSize);
    } catch (err) {
      doc.setFillColor(240, 240, 240);
      doc.roundedRect(X(qrX), Y(qrY), qrBoxSize, qrBoxSize, 1, 1, 'F');
    }
  } else {
    doc.setFillColor(240, 240, 240);
    doc.roundedRect(X(qrX), Y(qrY), qrBoxSize, qrBoxSize, 1, 1, 'F');
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5);
  doc.setTextColor(...white);
  const instruccion = 'Acerca el código QR a la cámara para registrar tu asistencia';
  doc.text(instruccion, X(qrX + qrBoxSize / 2), Y(qrY + qrBoxSize + 2), { align: 'center', maxWidth: qrBoxSize + 4 });
}

const CARD_W_MM = 90;
const CARD_H_MM = 60;
const PER_PAGE = 8;
const MARGIN_X = 10;
const GAP_X = 10;
const MARGIN_Y = 10;
const GAP_Y = 8;

function slotOriginMm(slotIndex) {
  const col = slotIndex % 2;
  const row = Math.floor(slotIndex / 2);
  const ox = MARGIN_X + col * (CARD_W_MM + GAP_X);
  const oy = MARGIN_Y + row * (CARD_H_MM + GAP_Y);
  return { ox, oy };
}

/**
 * @param {Array<object>} carnets — respuesta de /admin/academico/grupos/:id/qr-carnets
 * @param {{ fileBase?: string }} opts
 */
export async function exportGrupoCarnetsPdfA4(carnets, opts = {}) {
  if (!Array.isArray(carnets) || carnets.length === 0) {
    throw new Error('No hay carnets para exportar');
  }
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  for (let i = 0; i < carnets.length; i += 1) {
    if (i > 0 && i % PER_PAGE === 0) {
      doc.addPage();
    }
    const slot = i % PER_PAGE;
    const { ox, oy } = slotOriginMm(slot);
    const item = carnets[i];
    const qrPayload = String(item.qr_data ?? '');
    const qrPngDataUrl = await QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 512,
      color: { dark: '#000000', light: '#ffffffff' },
    });
    await drawCarnetQrMm(doc, item, ox, oy, qrPngDataUrl);
  }

  const base = opts.fileBase || 'Carnets_QR_grupo';
  const nombreArchivo = `${base}_${Date.now()}.pdf`;
  doc.save(nombreArchivo);
}
