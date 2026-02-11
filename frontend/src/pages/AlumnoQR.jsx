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
      // Tamaño fotocheck vertical: 54mm x 89mm (portrait)
      const width = 54;
      const height = 89;
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [width, height]
      });

      const margin = 2.5;
      const contentWidth = width - (margin * 2);

      // Fondo con gradiente suave
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, width, height, 'F');
      doc.setFillColor(248, 250, 252);
      doc.rect(0, 0, width, height * 0.6, 'F');

      // Header con gradiente púrpura/azul
      const headerHeight = 8;
      doc.setFillColor(79, 70, 229); // #4f46e5
      doc.rect(0, 0, width, headerHeight, 'F');
      
      // Efecto de gradiente en header (simulado con rectángulo más claro)
      doc.setFillColor(99, 102, 241); // #6366f1
      doc.rect(0, headerHeight * 0.5, width, headerHeight * 0.5, 'F');

      // Nombre del colegio - en mayúsculas
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      const colegioNombre = (qrData.colegio_nombre || 'Vanguard Schools').toUpperCase();
      doc.text(colegioNombre, width / 2, 5.5, { align: 'center' });

      // Calcular espacio disponible
      const footerHeight = 6;
      const bodyHeight = height - headerHeight - footerHeight;
      let yPos = headerHeight + 3;

      // QR Code arriba centrado
      const qrSize = 28; // Tamaño optimizado para formato vertical
      const qrX = (width - qrSize) / 2; // Centrado
      const qrY = yPos;

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
              
              // Dibujar fondo blanco para el QR
              doc.setFillColor(255, 255, 255);
              doc.roundedRect(qrX - 1, qrY - 1, qrSize + 2, qrSize + 2, 1, 1, 'F');
              
              // Borde del QR
              doc.setDrawColor(224, 231, 255); // #e0e7ff
              doc.setLineWidth(0.5);
              doc.roundedRect(qrX - 1, qrY - 1, qrSize + 2, qrSize + 2, 1, 1);
              
              doc.addImage(imgData, 'PNG', qrX, qrY, qrSize, qrSize);
              
              URL.revokeObjectURL(url);
              resolve();
            };
            img.onerror = reject;
            img.src = url;
          });
        } catch (error) {
          console.warn('Error convirtiendo QR a imagen, usando placeholder:', error);
          doc.setFillColor(240, 240, 240);
          doc.roundedRect(qrX - 1, qrY - 1, qrSize + 2, qrSize + 2, 1, 1, 'F');
          doc.setDrawColor(200, 200, 200);
          doc.roundedRect(qrX - 1, qrY - 1, qrSize + 2, qrSize + 2, 1, 1);
        }
      } else {
        doc.setFillColor(240, 240, 240);
        doc.roundedRect(qrX - 1, qrY - 1, qrSize + 2, qrSize + 2, 1, 1, 'F');
        doc.setDrawColor(200, 200, 200);
        doc.roundedRect(qrX - 1, qrY - 1, qrSize + 2, qrSize + 2, 1, 1);
      }

      // Información del alumno debajo del QR - estilo card
      const infoStartY = qrY + qrSize + 4;
      const cardPadding = 1.5;
      const cardSpacing = 2.5;
      let currentY = infoStartY;

      // Card Nombres
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin, currentY, contentWidth, 8, 1, 1, 'F');
      doc.setDrawColor(224, 231, 255);
      doc.setLineWidth(0.3);
      doc.roundedRect(margin, currentY, contentWidth, 8, 1, 1);
      
      // Label Nombres
      doc.setFillColor(238, 242, 255); // #eef2ff
      doc.roundedRect(margin + cardPadding, currentY + 0.5, 12, 2.5, 0.5, 0.5, 'F');
      doc.setTextColor(99, 102, 241); // #6366f1
      doc.setFontSize(5);
      doc.setFont('helvetica', 'bold');
      doc.text('NOMBRES:', margin + cardPadding + 1, currentY + 2);
      
      // Valor Nombres
      doc.setTextColor(30, 41, 59); // #1e293b
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      const nombres = qrData.nombres || '';
      const nombresLines = doc.splitTextToSize(nombres, contentWidth - (cardPadding * 2) - 2);
      nombresLines.forEach((line, idx) => {
        doc.text(line, margin + cardPadding, currentY + 4.5 + (idx * 3.5), { maxWidth: contentWidth - (cardPadding * 2) });
      });
      currentY += 8 + cardSpacing;

      // Card Apellidos
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin, currentY, contentWidth, 8, 1, 1, 'F');
      doc.setDrawColor(224, 231, 255);
      doc.roundedRect(margin, currentY, contentWidth, 8, 1, 1);
      
      doc.setFillColor(238, 242, 255);
      doc.roundedRect(margin + cardPadding, currentY + 0.5, 13, 2.5, 0.5, 0.5, 'F');
      doc.setTextColor(99, 102, 241);
      doc.setFontSize(5);
      doc.setFont('helvetica', 'bold');
      doc.text('APELLIDOS:', margin + cardPadding + 1, currentY + 2);
      
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      const apellidos = `${qrData.apellido_paterno || ''} ${qrData.apellido_materno || ''}`.trim();
      const apellidosLines = doc.splitTextToSize(apellidos, contentWidth - (cardPadding * 2) - 2);
      apellidosLines.forEach((line, idx) => {
        doc.text(line, margin + cardPadding, currentY + 4.5 + (idx * 3.5), { maxWidth: contentWidth - (cardPadding * 2) });
      });
      currentY += 8 + cardSpacing;

      // Card Sección (si existe)
      if (qrData.grupo) {
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(margin, currentY, contentWidth, 8, 1, 1, 'F');
        doc.setDrawColor(224, 231, 255);
        doc.roundedRect(margin, currentY, contentWidth, 8, 1, 1);
        
        doc.setFillColor(238, 242, 255);
        doc.roundedRect(margin + cardPadding, currentY + 0.5, 11, 2.5, 0.5, 0.5, 'F');
        doc.setTextColor(99, 102, 241);
        doc.setFontSize(5);
        doc.setFont('helvetica', 'bold');
        doc.text('SECCIÓN:', margin + cardPadding + 1, currentY + 2);
        
        doc.setTextColor(30, 41, 59);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        const grupoLines = doc.splitTextToSize(qrData.grupo, contentWidth - (cardPadding * 2) - 2);
        grupoLines.forEach((line, idx) => {
          doc.text(line, margin + cardPadding, currentY + 4.5 + (idx * 3.5), { maxWidth: contentWidth - (cardPadding * 2) });
        });
      }

      // Footer con año - gradiente
      const footerY = height - footerHeight;
      doc.setFillColor(79, 70, 229); // #4f46e5
      doc.rect(0, footerY, width, footerHeight, 'F');
      doc.setFillColor(99, 102, 241); // #6366f1
      doc.rect(0, footerY + footerHeight * 0.5, width, footerHeight * 0.5, 'F');
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text(qrData.anio?.toString() || '2026', width / 2, footerY + 4, { align: 'center' });

      const nombreArchivo = `Fotocheck_${qrData.nombre_completo?.replace(/\s+/g, '_') || 'Alumno'}_${new Date().getTime()}.pdf`;
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
              <p>Fotocheck de identificación estudiantil</p>
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

            {/* Contenido principal - Layout Vertical */}
            <div className="qr-card-body">
              {/* QR Code arriba centrado */}
              <div className="qr-code-section">
                <div className="qr-code-wrapper">
                  <QRCodeSVG 
                    value={qrData.qr_data || qrData.nro_documento || 'ALUMNO'}
                    size={220}
                    level="H"
                    includeMargin={true}
                  />
                </div>
              </div>

              {/* Información del alumno debajo */}
              <div className="qr-info-section">
                <div className="qr-info-item">
                  <label className="qr-info-label">Nombres:</label>
                  <p className="qr-info-value">{qrData.nombres || ''}</p>
                </div>
                <div className="qr-info-item">
                  <label className="qr-info-label">Apellidos:</label>
                  <p className="qr-info-value">
                    {`${qrData.apellido_paterno || ''} ${qrData.apellido_materno || ''}`.trim()}
                  </p>
                </div>
                {qrData.grupo && (
                  <div className="qr-info-item">
                    <label className="qr-info-label">Sección:</label>
                    <p className="qr-info-value">{qrData.grupo}</p>
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

export default AlumnoQR;
