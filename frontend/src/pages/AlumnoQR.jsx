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

      // Borde superior con color del colegio - más alto y con gradiente
      doc.setFillColor(37, 99, 235); // Azul más vibrante
      doc.rect(0, 0, width, 10, 'F');

      // Nombre del colegio - más grande y en mayúsculas
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      const colegioNombre = (qrData.colegio_nombre || 'Vanguard Schools').toUpperCase();
      doc.text(colegioNombre, width / 2, 6.5, { align: 'center' });

      let yPos = 10;

      // QR Code a la izquierda - más grande
      const qrSize = 42; // Aumentado de 35 a 42mm
      const qrX = margin + 2;
      const qrY = yPos;

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
              
              // Agregar imagen al PDF
              doc.addImage(imgData, 'PNG', qrX, qrY, qrSize, qrSize);
              
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
          doc.rect(qrX, qrY, qrSize, qrSize, 'F');
          doc.setDrawColor(200, 200, 200);
          doc.rect(qrX, qrY, qrSize, qrSize);
        }
      } else {
        // Fallback si no se encuentra el elemento
        doc.setFillColor(240, 240, 240);
        doc.rect(qrX, qrY, qrSize, qrSize, 'F');
        doc.setDrawColor(200, 200, 200);
        doc.rect(qrX, qrY, qrSize, qrSize);
      }

      // Texto "Código QR"
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(6);
      doc.setFont('helvetica', 'normal');
      doc.text('Código QR', qrX + qrSize / 2, qrY + qrSize + 3, { align: 'center' });

      // Información del alumno a la derecha
      const infoX = qrX + qrSize + 4;
      const infoY = yPos + 3;

      doc.setTextColor(31, 41, 55);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('NOMBRES:', infoX, infoY);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      const nombres = qrData.nombres || '';
      const nombresLines = doc.splitTextToSize(nombres, contentWidth - infoX - margin);
      doc.text(nombresLines, infoX, infoY + 5, { maxWidth: contentWidth - infoX - margin });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('APELLIDOS:', infoX, infoY + 11);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      const apellidos = `${qrData.apellido_paterno || ''} ${qrData.apellido_materno || ''}`.trim();
      const apellidosLines = doc.splitTextToSize(apellidos, contentWidth - infoX - margin);
      doc.text(apellidosLines, infoX, infoY + 16, { maxWidth: contentWidth - infoX - margin });

      if (qrData.grupo) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('SECCIÓN:', infoX, infoY + 22);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        const grupoLines = doc.splitTextToSize(qrData.grupo, contentWidth - infoX - margin);
        doc.text(grupoLines, infoX, infoY + 27, { maxWidth: contentWidth - infoX - margin });
      }

      // Año
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(74, 131, 193);
      doc.text(qrData.anio?.toString() || '2026', width / 2, height - 3, { align: 'center' });

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

            {/* Contenido principal */}
            <div className="qr-card-body">
              {/* QR Code a la izquierda */}
              <div className="qr-code-section">
                <div className="qr-code-wrapper">
                  <QRCodeSVG 
                    value={qrData.qr_data || qrData.nro_documento || 'ALUMNO'}
                    size={180}
                    level="H"
                    includeMargin={true}
                  />
                </div>
                <p className="qr-code-label">Código QR</p>
              </div>

              {/* Información del alumno a la derecha */}
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
