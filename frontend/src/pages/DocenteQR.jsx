import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import api from '../services/api';
import { QRCodeSVG } from 'qrcode.react';
import { jsPDF } from 'jspdf';
import Swal from 'sweetalert2';
import './DocenteQR.css';

function DocenteQR() {
  const [loading, setLoading] = useState(true);
  const [qrData, setQrData] = useState(null);

  useEffect(() => {
    cargarDatosQR();
  }, []);

  const cargarDatosQR = async () => {
    try {
      setLoading(true);
      const response = await api.get('/docente/qr');
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
      // Tamaño fotocheck estándar: 89mm x 54mm
      const width = 89;
      const height = 54;
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: [width, height]
      });

      const margin = 3;
      const contentWidth = width - (margin * 2);

      // Fondo blanco
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, width, height, 'F');

      // Borde superior con color del colegio
      const headerHeight = 10;
      doc.setFillColor(37, 99, 235);
      doc.rect(0, 0, width, headerHeight, 'F');

      // Nombre del colegio - en mayúsculas
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      const colegioNombre = (qrData.colegio_nombre || 'Vanguard Schools').toUpperCase();
      doc.text(colegioNombre, width / 2, 6.5, { align: 'center' });

      // Calcular espacio disponible para el body
      const footerHeight = 6;
      const bodyHeight = height - headerHeight - footerHeight;
      let yPos = headerHeight + 2;

      // QR Code a la izquierda - tamaño optimizado
      const qrX = margin + 2;
      const qrY = yPos;
      
      // Verificar que el QR no sobrepase el espacio disponible
      const maxQrSize = bodyHeight - 8;
      const qrSize = 36;
      const finalQrSize = Math.min(qrSize, maxQrSize);

      // Obtener el elemento QR del DOM y convertirlo a imagen
      const qrElement = document.querySelector('#qr-card-print .qr-code-wrapper svg');
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
              
              doc.addImage(imgData, 'PNG', qrX, qrY, finalQrSize, finalQrSize);
              
              URL.revokeObjectURL(url);
              resolve();
            };
            img.onerror = reject;
            img.src = url;
          });
        } catch (error) {
          console.warn('Error convirtiendo QR a imagen, usando placeholder:', error);
          doc.setFillColor(240, 240, 240);
          doc.rect(qrX, qrY, finalQrSize, finalQrSize, 'F');
          doc.setDrawColor(200, 200, 200);
          doc.rect(qrX, qrY, finalQrSize, finalQrSize);
        }
      } else {
        doc.setFillColor(240, 240, 240);
        doc.rect(qrX, qrY, finalQrSize, finalQrSize, 'F');
        doc.setDrawColor(200, 200, 200);
        doc.rect(qrX, qrY, finalQrSize, finalQrSize);
      }

      // Texto "Código QR"
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(6);
      doc.setFont('helvetica', 'normal');
      doc.text('Código QR', qrX + finalQrSize / 2, qrY + finalQrSize + 3, { align: 'center' });

      // Información del docente a la derecha
      const infoX = qrX + finalQrSize + 4;
      const infoY = yPos + 3;
      const lineSpacing = 7;

      doc.setTextColor(31, 41, 55);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('NOMBRES:', infoX, infoY);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const nombres = qrData.nombres || '';
      const nombresLines = doc.splitTextToSize(nombres, contentWidth - infoX - margin);
      let nombresY = infoY + 5;
      nombresLines.forEach((line, idx) => {
        doc.text(line, infoX, nombresY + (idx * 4), { maxWidth: contentWidth - infoX - margin });
      });
      const nombresHeight = nombresLines.length * 4;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      const apellidosY = infoY + nombresHeight + lineSpacing;
      doc.text('APELLIDOS:', infoX, apellidosY);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const apellidos = qrData.apellidos || '';
      const apellidosLines = doc.splitTextToSize(apellidos, contentWidth - infoX - margin);
      apellidosLines.forEach((line, idx) => {
        doc.text(line, infoX, apellidosY + 5 + (idx * 4), { maxWidth: contentWidth - infoX - margin });
      });
      const apellidosHeight = apellidosLines.length * 4;

      if (qrData.fecha_nacimiento) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        const fechaY = apellidosY + apellidosHeight + lineSpacing;
        doc.text('FECHA NACIMIENTO:', infoX, fechaY);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        const fechaLines = doc.splitTextToSize(qrData.fecha_nacimiento, contentWidth - infoX - margin);
        fechaLines.forEach((line, idx) => {
          doc.text(line, infoX, fechaY + 5 + (idx * 4), { maxWidth: contentWidth - infoX - margin });
        });
      }

      // Año
      const anioY = height - 3;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(37, 99, 235);
      doc.text(qrData.anio?.toString() || '2026', width / 2, anioY, { align: 'center' });

      const nombreArchivo = `Fotocheck_${qrData.nombre_completo?.replace(/\s+/g, '_') || 'Docente'}_${new Date().getTime()}.pdf`;
      doc.save(nombreArchivo);

      Swal.fire({
        title: '¡PDF Generado!',
        text: 'El fotocheck se ha exportado correctamente',
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
        <div className="docente-qr-loading">
          <div className="loading-spinner">Cargando datos...</div>
        </div>
      </DashboardLayout>
    );
  }

  if (!qrData) {
    return (
      <DashboardLayout>
        <div className="docente-qr">
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
      <div className="docente-qr">
        <div className="page-header">
          <div className="header-content">
            <div>
              <h1>📱 Mi QR</h1>
              <p>Fotocheck de identificación docente</p>
            </div>
            <button className="btn-exportar" onClick={handleExportarPDF}>
              <span className="btn-icon">📄</span>
              <span className="btn-text">Exportar</span>
            </button>
          </div>
        </div>

        <div className="qr-card-container">
          <div className="qr-card" id="qr-card-print">
            {/* Borde superior con nombre del colegio */}
            <div className="qr-card-header">
              <h2 className="qr-colegio-nombre">{qrData.colegio_nombre || 'Vanguard Schools'}</h2>
            </div>

            {/* Contenido principal */}
            <div className="qr-card-body">
              {/* QR Code a la izquierda */}
              <div className="qr-code-section">
                <div className="qr-code-wrapper">
                  <QRCodeSVG 
                    value={qrData.qr_data || qrData.nro_documento || 'DOCENTE'}
                    size={160}
                    level="H"
                    includeMargin={true}
                  />
                </div>
                <p className="qr-code-label">Código QR</p>
              </div>

              {/* Información del docente a la derecha */}
              <div className="qr-info-section">
                <div className="qr-info-item">
                  <label className="qr-info-label">Nombres:</label>
                  <p className="qr-info-value">{qrData.nombres || ''}</p>
                </div>
                <div className="qr-info-item">
                  <label className="qr-info-label">Apellidos:</label>
                  <p className="qr-info-value">{qrData.apellidos || ''}</p>
                </div>
                {qrData.fecha_nacimiento && (
                  <div className="qr-info-item">
                    <label className="qr-info-label">Fecha Nacimiento:</label>
                    <p className="qr-info-value">{qrData.fecha_nacimiento}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Año en la parte inferior */}
            <div className="qr-card-footer">
              <span className="qr-anio">{qrData.anio || '2026'}</span>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default DocenteQR;

