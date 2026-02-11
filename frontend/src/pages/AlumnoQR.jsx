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
      doc.setFillColor(37, 99, 235); // Azul más vibrante
      doc.rect(0, 0, width, headerHeight, 'F');

      // Nombre del colegio - en mayúsculas
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      const colegioNombre = (qrData.colegio_nombre || 'Vanguard Schools').toUpperCase();
      doc.text(colegioNombre, width / 2, 6.5, { align: 'center' });

      // Calcular espacio disponible para el body
      const footerHeight = 6; // Espacio para el footer
      const bodyHeight = height - headerHeight - footerHeight;
      let yPos = headerHeight + 2;

      // QR Code a la izquierda - tamaño optimizado para que quepa todo
      const qrX = margin + 2;
      const qrY = yPos;
      
      // Verificar que el QR no sobrepase el espacio disponible
      const maxQrSize = bodyHeight - 8; // Dejar espacio para label y padding
      const qrSize = 36; // Tamaño base
      const finalQrSize = Math.min(qrSize, maxQrSize);

      // Obtener el elemento QR del DOM y convertirlo a imagen
      const qrElement = document.querySelector('#qr-card-print .qr-code-wrapper svg');
      if (qrElement) {
        try {
          // Convertir SVG a imagen usando canvas
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
              
              // Agregar imagen al PDF con tamaño ajustado
              doc.addImage(imgData, 'PNG', qrX, qrY, finalQrSize, finalQrSize);
              
              URL.revokeObjectURL(url);
              resolve();
            };
            img.onerror = reject;
            img.src = url;
          });
        } catch (error) {
          console.warn('Error convirtiendo QR a imagen, usando placeholder:', error);
          // Fallback: dibujar rectángulo
          doc.setFillColor(240, 240, 240);
          doc.rect(qrX, qrY, finalQrSize, finalQrSize, 'F');
          doc.setDrawColor(200, 200, 200);
          doc.rect(qrX, qrY, finalQrSize, finalQrSize);
        }
      } else {
        // Fallback si no se encuentra el elemento
        doc.setFillColor(240, 240, 240);
        doc.rect(qrX, qrY, finalQrSize, finalQrSize, 'F');
        doc.setDrawColor(200, 200, 200);
        doc.rect(qrX, qrY, finalQrSize, finalQrSize);
      }

      // Texto "Código QR" - debajo del QR
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(6);
      doc.setFont('helvetica', 'normal');
      doc.text('Código QR', qrX + finalQrSize / 2, qrY + finalQrSize + 3, { align: 'center' });

      // Información del alumno a la derecha - mejor espaciado
      const infoX = qrX + finalQrSize + 4;
      const infoY = yPos + 3;
      const lineSpacing = 7; // Espaciado entre líneas

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
      const apellidos = `${qrData.apellido_paterno || ''} ${qrData.apellido_materno || ''}`.trim();
      const apellidosLines = doc.splitTextToSize(apellidos, contentWidth - infoX - margin);
      apellidosLines.forEach((line, idx) => {
        doc.text(line, infoX, apellidosY + 5 + (idx * 4), { maxWidth: contentWidth - infoX - margin });
      });
      const apellidosHeight = apellidosLines.length * 4;

      if (qrData.grupo) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        const seccionY = apellidosY + apellidosHeight + lineSpacing;
        doc.text('SECCIÓN:', infoX, seccionY);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        const grupoLines = doc.splitTextToSize(qrData.grupo, contentWidth - infoX - margin);
        grupoLines.forEach((line, idx) => {
          doc.text(line, infoX, seccionY + 5 + (idx * 4), { maxWidth: contentWidth - infoX - margin });
        });
      }

      // Año - en el footer, centrado, sin sobreponerse
      const anioY = height - 3; // 3mm desde el borde inferior
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(37, 99, 235);
      doc.text(qrData.anio?.toString() || '2026', width / 2, anioY, { align: 'center' });

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
                <p className="qr-code-label">Código QR</p>
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
