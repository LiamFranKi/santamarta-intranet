const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

// Configurar transporter de nodemailer
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: false, // true para 465, false para otros puertos
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

/**
 * Generar template HTML para correo de asistencia
 */
function generarTemplateAsistencia(datos) {
  const { nombreAlumno, hora, fecha, tipo, colegioNombre } = datos;
  
  const icono = tipo === 'ENTRADA' ? '✅' : '👋';
  const titulo = tipo === 'ENTRADA' ? 'Llegada al Colegio' : 'Salida del Colegio';
  const mensaje = tipo === 'ENTRADA' 
    ? `Tu hijo(a) <strong>${nombreAlumno}</strong> ha llegado al colegio.`
    : `Tu hijo(a) <strong>${nombreAlumno}</strong> ha salido del colegio.`;
  
  const colorPrincipal = tipo === 'ENTRADA' ? '#10b981' : '#3b82f6';
  
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${titulo} - ${colegioNombre}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f3f4f6; padding: 20px;">
    <tr>
      <td align="center">
        <table role="presentation" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
          <!-- Header con color -->
          <tr>
            <td style="background: linear-gradient(135deg, ${colorPrincipal} 0%, ${colorPrincipal}dd 100%); padding: 30px 20px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 700;">
                ${icono} ${titulo}
              </h1>
            </td>
          </tr>
          
          <!-- Contenido principal -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px 0; font-size: 18px; color: #1f2937; line-height: 1.6;">
                ${mensaje}
              </p>
              
              <div style="background-color: #f9fafb; border-left: 4px solid ${colorPrincipal}; padding: 20px; margin: 25px 0; border-radius: 6px;">
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px; font-weight: 600;">👤 Estudiante:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-size: 14px;">${nombreAlumno}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px; font-weight: 600;">📅 Fecha:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-size: 14px;">${fecha}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px; font-weight: 600;">🕐 Hora:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-size: 14px; font-weight: 700;">${hora}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px; font-weight: 600;">🏫 Colegio:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-size: 14px;">${colegioNombre}</td>
                  </tr>
                </table>
              </div>
              
              <p style="margin: 25px 0 0 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
                Este es un mensaje automático del sistema de asistencia. Por favor, no responda a este correo.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                © ${new Date().getFullYear()} ${colegioNombre}. Todos los derechos reservados.
              </p>
              <p style="margin: 10px 0 0 0; font-size: 12px; color: #9ca3af;">
                Sistema de Gestión Escolar - Vanguard Schools
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

/**
 * Enviar correo de notificación de asistencia
 */
async function enviarCorreoAsistencia(destinatario, datos) {
  try {
    const { nombreAlumno, hora, fecha, tipo, colegioNombre } = datos;
    
    const template = generarTemplateAsistencia({
      nombreAlumno,
      hora,
      fecha,
      tipo,
      colegioNombre: colegioNombre || 'Vanguard Schools'
    });

    const mailOptions = {
      from: `"${colegioNombre || 'Vanguard Schools'}" <${process.env.EMAIL_USER}>`,
      to: destinatario,
      subject: tipo === 'ENTRADA' 
        ? `✅ ${nombreAlumno} llegó al colegio - ${hora}`
        : `👋 ${nombreAlumno} salió del colegio - ${hora}`,
      html: template
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Correo enviado:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error enviando correo:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  enviarCorreoAsistencia,
  generarTemplateAsistencia
};

