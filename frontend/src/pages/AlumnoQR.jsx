import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import { QRCodeSVG } from 'qrcode.react';
import { jsPDF } from 'jspdf';
import Swal from 'sweetalert2';
import './AlumnoQR.css';

function AlumnoQR() {
  const [loading, setLoading] = useState(true);
  const [qrData, setQrData] = useState(null);

  useEffect(() => {
    cargarDatosQR();
  }, []);

  const cargarDatosQR = async () => {
    try {
      setLoading(true);
      const response = await api.get('/alumno/qr');
      setQrData(response.data);
    } catch (error) {
      console.error('Error cargando datos QR:', error);
      Swal.fire({
        title: 'Error',
        text: 'No se pudieron cargar los datos para el QR',
        icon: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const loadImageAsDataUrl = (url) => {
    if (!url || typeof url !== 'string') return Promise.resolve(null);
    return fetch(url, { mode: 'cors' })
      .then((r) => r.blob())
      .then((blob) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      }))
      .catch(() => null);
  };

  const handleExportarPDF = async () => {
    if (!qrData) {
      Swal.fire({
        title: 'Sin datos',
        text: 'No hay datos para exportar',
        icon: 'info'
      });
      return;
    }

    try {
      const width = 90;
      const height = 60;
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: [width, height]
      });

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
      const r = cardRadius * scale;
      gctx.beginPath();
      if (gctx.roundRect) {
        gctx.roundRect(0, 0, gradCanvas.width, gradCanvas.height, r);
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
        doc.addImage(gradCanvas.toDataURL('image/png'), 'PNG', 0, 0, width, height);
      } catch (e) {
        doc.setFillColor(...blueBg);
        doc.roundedRect(0, 0, width, height, cardRadius, cardRadius, 'F');
      }
      doc.setDrawColor(...greenBorder);
      doc.setLineWidth(0.8);
      doc.roundedRect(0, 0, width, height, cardRadius, cardRadius);

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
          doc.addImage(logoData, logoFormat, logoX, logoY, logoSize, logoSize);
        } catch (e) { /* ignorar */ }
      }

      const colegioNombre = (qrData.colegio_nombre || 'Vanguard Schools').trim();
      const partes = colegioNombre.toUpperCase().split(/\s+/);
      const titulo = partes[0] || 'COLEGIO';
      const subtitulo = partes.slice(1).join(' ') || 'VANGUARD SCHOOLS';
      doc.setTextColor(...white);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(titulo, logoX + logoSize + 4, logoY + 4);
      doc.text(subtitulo, logoX + logoSize + 4, logoY + 9.5);
      doc.setFontSize(8);
      doc.setTextColor(...orangeAccent);
      doc.text('Intranet Escolar', width - 4, logoY + 5.5, { align: 'right' });
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

      let photoData = qrData.foto_base64 || null;
      if (!photoData && qrData.foto_url) photoData = await loadImageAsDataUrl(qrData.foto_url);
      if (photoData) {
        try {
          const photoInset = 0;
          const photoInnerW = photoW - photoInset * 2;
          const photoInnerH = photoH - photoInset * 2;
          doc.setFillColor(...blueBg);
          doc.roundedRect(photoX, bodyY, photoW, photoH, photoRadius, photoRadius, 'F');
          const photoClipped = await new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
              const scale = 6;
              const c = document.createElement('canvas');
              c.width = photoInnerW * scale;
              c.height = photoInnerH * scale;
              const ctx = c.getContext('2d');
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = 'high';
              const r = Math.max(1, photoRadius * scale);
              ctx.beginPath();
              if (ctx.roundRect) ctx.roundRect(0, 0, c.width, c.height, r);
              else ctx.rect(0, 0, c.width, c.height);
              ctx.closePath();
              ctx.clip();
              const boxAspect = c.width / c.height;
              const imgAspect = img.width / img.height;
              let sx = 0, sy = 0, sw = img.width, sh = img.height;
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
            doc.addImage(photoClipped, 'PNG', photoX + photoInset, bodyY + photoInset, photoInnerW, photoInnerH);
          } else {
            doc.addImage(photoData, photoData.indexOf('image/png') !== -1 ? 'PNG' : 'JPEG', photoX + photoInset, bodyY + photoInset, photoInnerW, photoInnerH);
          }
        } catch (e) {
          doc.setFillColor(60, 70, 90);
          doc.roundedRect(photoX, bodyY, photoW, photoH, photoRadius, photoRadius, 'F');
        }
      } else {
        doc.setFillColor(60, 70, 90);
        doc.roundedRect(photoX, bodyY, photoW, photoH, photoRadius, photoRadius, 'F');
      }
      doc.setDrawColor(...orangeAccent);
      doc.setLineWidth(0.35);
      doc.roundedRect(photoX, bodyY, photoW, photoH, photoRadius, photoRadius, 'S');

      const paddingFotoApoderado = 4;
      const filaY0 = bodyY + photoH + paddingFotoApoderado;
      const labelW = 20;
      const valorX = photoX + labelW;
      const valorMaxW = qrX - valorX - 2;
      const filaH = 3.5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.5);
      doc.setTextColor(...orangeAccent);
      doc.text('Apoderado', photoX, filaY0 + 1.2);
      doc.setFontSize(5.5);
      doc.setTextColor(...white);
      const apoderadoNombre = (qrData.apoderado_nombre || '-').trim();
      const lineasNombre = doc.splitTextToSize(apoderadoNombre, valorMaxW);
      lineasNombre.slice(0, 2).forEach((line, i) => doc.text(line, valorX, filaY0 + 1.2 + i * 2.2));
      doc.setFontSize(5.5);
      doc.setTextColor(...orangeAccent);
      doc.text('Cel. Apoderado', photoX, filaY0 + filaH + 1.2);
      doc.setTextColor(...white);
      const cel = (qrData.apoderado_celular || '-').trim();
      const lineasCel = doc.splitTextToSize(cel, valorMaxW);
      lineasCel.slice(0, 2).forEach((line, i) => doc.text(line, valorX, filaY0 + filaH + 1.2 + i * 2.2));
      doc.setTextColor(...orangeAccent);
      doc.text('Dirección', photoX, filaY0 + filaH * 2 + 1.2);
      doc.setTextColor(...white);
      const dir = (qrData.direccion || '-').trim();
      const lineasDir = doc.splitTextToSize(dir, valorMaxW);
      lineasDir.slice(0, 2).forEach((line, i) => doc.text(line, valorX, filaY0 + filaH * 2 + 1.2 + i * 2.2));

      const nombres = (qrData.nombres || '').trim();
      const apellidos = `${(qrData.apellido_paterno || '')} ${(qrData.apellido_materno || '')}`.trim();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...white);
      let textY = bodyY + 6;
      if (nombres) {
        const nombresLines = doc.splitTextToSize(nombres, centerW - 2);
        doc.text(nombresLines[0], centerX, textY);
        textY += 5;
      }
      if (apellidos) {
        const apellidosLines = doc.splitTextToSize(apellidos, centerW - 2);
        doc.text(apellidosLines[0], centerX, textY);
        textY += 5;
      }
      if (qrData.grupo) {
        doc.setFontSize(8);
        doc.setTextColor(...orangeAccent);
        doc.setFont('helvetica', 'bold');
        const grupoLines = doc.splitTextToSize(qrData.grupo, centerW - 2);
        grupoLines.slice(0, 2).forEach((line) => {
          doc.text(line, centerX, textY);
          textY += 4.5;
        });
      }
      const dni = qrData.nro_documento || '';
      if (dni) {
        textY += 2;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...white);
        doc.text(`DNI: ${dni}`, centerX, textY);
      }

      const qrPadding = 1;
      const qrElement = document.querySelector('#qr-card-modal-print .qr-code-wrapper svg');
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(qrX, qrY, qrBoxSize, qrBoxSize, 1, 1, 'F');
      doc.setDrawColor(...orangeAccent);
      doc.setLineWidth(0.35);
      doc.roundedRect(qrX, qrY, qrBoxSize, qrBoxSize, 1, 1, 'S');
      if (qrElement) {
        try {
          const svgData = new XMLSerializer().serializeToString(qrElement);
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const img = new Image();
          const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
          const url = URL.createObjectURL(svgBlob);
          await new Promise((resolve, reject) => {
            img.onload = () => {
              canvas.width = 200;
              canvas.height = 200;
              ctx.drawImage(img, 0, 0);
              const imgData = canvas.toDataURL('image/png');
              const qrDrawSize = qrBoxSize - qrPadding * 2;
              doc.addImage(imgData, 'PNG', qrX + qrPadding, qrY + qrPadding, qrDrawSize, qrDrawSize);
              URL.revokeObjectURL(url);
              resolve();
            };
            img.onerror = reject;
            img.src = url;
          });
        } catch (err) {
          doc.setFillColor(240, 240, 240);
          doc.roundedRect(qrX, qrY, qrBoxSize, qrBoxSize, 1, 1, 'F');
        }
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5);
      doc.setTextColor(...white);
      doc.text('Acerca el código QR a la cámara para registrar tu asistencia', qrX + qrBoxSize / 2, qrY + qrBoxSize + 2, { align: 'center', maxWidth: qrBoxSize + 4 });

      const nombreArchivo = `Carnet_${(qrData.nombre_completo || 'Alumno').replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`;
      doc.save(nombreArchivo);

      Swal.fire({
        title: '¡PDF Generado!',
        text: 'El carnet se ha exportado correctamente (9×6 cm).',
        icon: 'success'
      });
    } catch (error) {
      console.error('Error generando PDF:', error);
      Swal.fire({
        title: 'Error',
        text: 'No se pudo generar el PDF',
        icon: 'error'
      });
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="alumno-qr-loading">
          <div className="loading-spinner">Cargando datos...</div>
        </div>
      </DashboardLayout>
    );
  }

  if (!qrData) {
    return (
      <DashboardLayout>
        <div className="alumno-qr">
          <div className="page-header">
            <h1>📱 Mi QR</h1>
            <p>No se pudieron cargar los datos</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="alumno-qr">
        <div className="page-header">
          <div className="header-content">
            <div>
              <h1>📱 Mi QR</h1>
              <p>Carnet de identificación estudiantil</p>
            </div>
            <button className="btn-exportar" onClick={handleExportarPDF}>
              <span className="btn-icon">📄</span>
              <span className="btn-text">Exportar</span>
            </button>
          </div>
        </div>

        <div className="qr-card-container qr-preview-simple">
          <div className="qr-card qr-card-modal qr-card-solo-qr" id="qr-card-modal-print">
            <div className="qr-code-wrapper">
              <QRCodeSVG
                value={qrData.qr_data || qrData.nro_documento || 'ALUMNO'}
                size={260}
                level="H"
                includeMargin={true}
              />
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default AlumnoQR;
