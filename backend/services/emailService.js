const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const { envolverMarcoCumpleanosEmail } = require('../utils/cumpleanosMarcoHtml');

/**
 * Control global de envío SMTP. Por defecto deshabilitado (solo push/campanita/mensajes internos).
 * Para reactivar correos: EMAIL_ENVIO_HABILITADO=true en backend/.env y reiniciar PM2.
 */
function isEmailEnvioHabilitado() {
  const v = process.env.EMAIL_ENVIO_HABILITADO;
  if (v === undefined || v === null || String(v).trim() === '') {
    return false;
  }
  const s = String(v).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'si' || s === 'sí';
}

function resultadoCorreoDeshabilitado() {
  return { success: false, skipped: true, error: 'Envío de correo deshabilitado (EMAIL_ENVIO_HABILITADO)' };
}

// Configurar transporter de nodemailer
const emailConfig = {
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: false, // true para 465, false para otros puertos
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  },
  tls: {
    rejectUnauthorized: false // Para desarrollo/producción con certificados auto-firmados
  }
};

console.log(`📧 [EMAIL] Configuración de email:`, {
  host: emailConfig.host,
  port: emailConfig.port,
  user: emailConfig.auth.user ? `${emailConfig.auth.user.substring(0, 3)}***` : 'NO CONFIGURADO',
  hasPassword: !!emailConfig.auth.pass
});
console.log(
  `📧 [EMAIL] Envío SMTP: ${isEmailEnvioHabilitado() ? 'HABILITADO (EMAIL_ENVIO_HABILITADO=true)' : 'DESHABILITADO (solo push/campanita; reactivar con EMAIL_ENVIO_HABILITADO=true)'}`
);

const transporter = nodemailer.createTransport(emailConfig);

// Transporter opcional SOLO para correos de ASISTENCIA (QR / entrada-salida).
// Si defines EMAIL_ASISTENCIA_USER y EMAIL_ASISTENCIA_PASSWORD en .env, los correos de asistencia
// usan esta cuenta y no consumen el límite diario de la cuenta principal (EMAIL_USER).
// Gmail: ~500/día por cuenta; todos los módulos comparten EMAIL_USER, por eso se agota con muchos escaneos.
let transporterAsistencia = null;
const asistenciaUser = process.env.EMAIL_ASISTENCIA_USER;
const asistenciaPass = process.env.EMAIL_ASISTENCIA_PASSWORD;
if (asistenciaUser && asistenciaPass) {
  transporterAsistencia = nodemailer.createTransport({
    host: process.env.EMAIL_ASISTENCIA_HOST || process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_ASISTENCIA_PORT || process.env.EMAIL_PORT || '587'),
    secure: false,
    auth: { user: asistenciaUser, pass: asistenciaPass },
    tls: { rejectUnauthorized: false }
  });
  console.log(`📧 [EMAIL] Cuenta de ASISTENCIA configurada: ${asistenciaUser.substring(0, 3)}*** (no usa límite de la cuenta principal)`);
} else {
  console.log(`📧 [EMAIL] Asistencia usará la misma cuenta que el resto (EMAIL_USER). Para evitar límite Gmail, define EMAIL_ASISTENCIA_USER y EMAIL_ASISTENCIA_PASSWORD`);
}

// Cuentas opcionales para TAREAS y EXÁMENES (mismo esquema: *_USER, *_PASSWORD, opcional *_HOST, *_PORT)
function crearTransporterOpcional(prefix) {
  const user = process.env[`EMAIL_${prefix}_USER`];
  const pass = process.env[`EMAIL_${prefix}_PASSWORD`];
  if (!user || !pass) return null;
  const trans = nodemailer.createTransport({
    host: process.env[`EMAIL_${prefix}_HOST`] || process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env[`EMAIL_${prefix}_PORT`] || process.env.EMAIL_PORT || '587'),
    secure: false,
    auth: { user, pass },
    tls: { rejectUnauthorized: false }
  });
  console.log(`📧 [EMAIL] Cuenta ${prefix} configurada: ${user.substring(0, 3)}***`);
  return { transporter: trans, user };
}
let transporterTarea = crearTransporterOpcional('TAREA');
let transporterExamen = crearTransporterOpcional('EXAMEN');
let transporterPublicaciones = crearTransporterOpcional('PUBLICACIONES');
let transporterMensajes = crearTransporterOpcional('MENSAJES');
let transporterComunicados = crearTransporterOpcional('COMUNICADOS');
let transporterAlertas = crearTransporterOpcional('ALERTAS');

/** Devuelve { transporter, fromUser } según categoría: ASISTENCIA | TAREA | EXAMEN | PUBLICACIONES | MENSAJES | COMUNICADOS | ALERTAS | GENERAL */
function getTransporterPorCategoria(categoria) {
  if (categoria === 'ASISTENCIA' && transporterAsistencia) {
    return { transporter: transporterAsistencia, fromUser: process.env.EMAIL_ASISTENCIA_USER };
  }
  if (categoria === 'TAREA' && transporterTarea) {
    return { transporter: transporterTarea.transporter, fromUser: process.env.EMAIL_TAREA_USER };
  }
  if (categoria === 'EXAMEN' && transporterExamen) {
    return { transporter: transporterExamen.transporter, fromUser: process.env.EMAIL_EXAMEN_USER };
  }
  if (categoria === 'PUBLICACIONES' && transporterPublicaciones) {
    return { transporter: transporterPublicaciones.transporter, fromUser: transporterPublicaciones.user };
  }
  if (categoria === 'MENSAJES' && transporterMensajes) {
    return { transporter: transporterMensajes.transporter, fromUser: transporterMensajes.user };
  }
  if (categoria === 'COMUNICADOS' && transporterComunicados) {
    return { transporter: transporterComunicados.transporter, fromUser: transporterComunicados.user };
  }
  if (categoria === 'ALERTAS' && transporterAlertas) {
    return { transporter: transporterAlertas.transporter, fromUser: transporterAlertas.user };
  }
  return { transporter, fromUser: process.env.EMAIL_USER };
}

// Evita spam de logs/reintentos cuando Gmail bloquea por límite diario (550 5.4.5).
const cooldownEmailPorCuenta = new Map();

function esErrorLimiteDiarioGmail(error) {
  const txt = String(error?.message || error?.response || '').toLowerCase();
  return txt.includes('5.4.5') || txt.includes('daily user sending limit exceeded');
}

function cuentaEnCooldown(fromUser) {
  const key = String(fromUser || 'GENERAL').toLowerCase();
  const hasta = cooldownEmailPorCuenta.get(key);
  if (!hasta) return false;
  if (Date.now() >= hasta) {
    cooldownEmailPorCuenta.delete(key);
    return false;
  }
  return true;
}

function activarCooldownCuenta(fromUser, ms = 60 * 60 * 1000) {
  const key = String(fromUser || 'GENERAL').toLowerCase();
  cooldownEmailPorCuenta.set(key, Date.now() + ms);
}

// Configurar manejo de errores y rebotes
// Los rebotes y errores de entrega se registrarán en logs pero NO se reenviarán al remitente
transporter.on('error', (error) => {
  console.error(`❌ [EMAIL] Error en transporter (no se reenvía al remitente):`, error.message);
  // No hacer nada más, solo registrar el error
});

// Verificar conexión al iniciar (con delay y manejo de errores mejorado)
// Se ejecuta después de 5 segundos para evitar conflictos con múltiples reinicios
let verificacionEnProceso = false;
setTimeout(() => {
  if (!verificacionEnProceso) {
    verificacionEnProceso = true;
    transporter.verify(function (error, success) {
      verificacionEnProceso = false;
      if (error) {
        // Solo mostrar error si no es un bloqueo temporal de Gmail
        if (error.code === 'EAUTH' && error.responseCode === 454) {
          console.warn(`⚠️ [EMAIL] Gmail bloqueó temporalmente el acceso (demasiados intentos). Se desbloqueará automáticamente en 1-2 horas.`);
          console.warn(`⚠️ [EMAIL] El sistema seguirá funcionando, pero los emails pueden fallar temporalmente.`);
        } else {
          console.error(`❌ [EMAIL] Error verificando conexión SMTP:`, error.message);
        }
      } else {
        console.log(`✅ [EMAIL] Servidor SMTP listo para enviar correos`);
      }
    });
  }
}, 5000); // Esperar 5 segundos antes de verificar

/**
 * Generar template HTML para correo de asistencia
 */
function generarTemplateAsistencia(datos) {
  const { nombreAlumno, hora, fecha, tipo, colegioNombre, esDocente, tipoAsistencia, descuentosPresentacion } = datos;
  
  const icono = tipo === 'ENTRADA' ? '✅' : '👋';
  const titulo = esDocente 
    ? (tipo === 'ENTRADA' ? 'Registro de Entrada' : 'Registro de Salida')
    : (tipo === 'ENTRADA' ? 'Llegada al Colegio' : 'Salida del Colegio');
  const mensaje = esDocente
    ? (tipo === 'ENTRADA' 
        ? `Su entrada ha sido registrada correctamente.`
        : `Su salida ha sido registrada correctamente.`)
    : (tipo === 'ENTRADA' 
        ? `Tu hijo(a) <strong>${nombreAlumno}</strong> ha llegado al colegio.`
        : `Tu hijo(a) <strong>${nombreAlumno}</strong> ha salido del colegio.`);
  
  const colorPrincipal = tipo === 'ENTRADA' ? '#10b981' : '#3b82f6';

  const tieneDescPresentacion =
    tipo === 'ENTRADA' &&
    !esDocente &&
    Array.isArray(descuentosPresentacion) &&
    descuentosPresentacion.length > 0;
  const lineasPresentacion = [];
  if (tieneDescPresentacion) {
    if (descuentosPresentacion.includes('PRESENTACION')) {
      lineasPresentacion.push('Se le descontó 1 punto por presentación escolar.');
    }
  }
  const htmlBloquePresentacion =
    lineasPresentacion.length > 0
      ? `
              <div style="background-color: #fef3c7; border-left: 4px solid #d97706; padding: 16px 18px; margin: 20px 0 0 0; border-radius: 8px;">
                <p style="margin: 0; font-size: 15px; color: #78350f; line-height: 1.55;">
                  <strong>Presentación escolar</strong><br/>
                  ${lineasPresentacion.map((t) => `<span style="display:block;margin-top:6px;">${t}</span>`).join('')}
                </p>
              </div>`
      : '';
  
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
                  ${esDocente ? '' : `
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px; font-weight: 600;">👤 ${esDocente ? 'Docente' : 'Estudiante'}:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-size: 14px;">${nombreAlumno}</td>
                  </tr>
                  `}
                  ${esDocente ? `
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px; font-weight: 600;">👤 Docente:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-size: 14px;">${nombreAlumno}</td>
                  </tr>
                  ` : ''}
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px; font-weight: 600;">📅 Fecha:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-size: 14px;">${fecha}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px; font-weight: 600;">🕐 Hora:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-size: 14px; font-weight: 700;">${hora}</td>
                  </tr>
                  ${tipo === 'ENTRADA' && tipoAsistencia && !esDocente ? `
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px; font-weight: 600;">📊 Estado:</td>
                    <td style="padding: 8px 0; color: ${tipoAsistencia === 'PRESENTE' ? '#10b981' : '#f59e0b'}; font-size: 14px; font-weight: 700;">${tipoAsistencia === 'PRESENTE' ? '✅ Presente' : '⚠️ Tardanza'}</td>
                  </tr>
                  ` : ''}
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px; font-weight: 600;">🏫 Colegio:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-size: 14px;">${colegioNombre}</td>
                  </tr>
                </table>
              </div>
              
              ${tipo === 'ENTRADA' && !esDocente && (tipoAsistencia === 'TARDANZA' || tipoAsistencia === 'FALTA') ? `
              <p style="margin: 25px 0 15px 0; font-size: 16px; color: #1f2937; line-height: 1.6; font-weight: 600;">
                Comuníquese con su tutora para poder justificar su Falta o Tardanza.
              </p>
              ` : ''}
              ${htmlBloquePresentacion}
              
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
 * Obtener icono y color según el tipo de notificación
 */
function obtenerIconoYColor(titulo) {
  const tituloLower = titulo.toLowerCase();
  
  // Detectar tipo por palabras clave o emojis
  if (tituloLower.includes('nueva publicación') || tituloLower.includes('publicación')) {
    return { icono: '📢', color: '#3b82f6' }; // Azul
  } else if (tituloLower.includes('nuevo proyecto') || tituloLower.includes('proyecto') || tituloLower.includes('nueva tarea') || tituloLower.includes('tarea')) {
    return { icono: '📝', color: '#10b981' }; // Verde
  } else if (tituloLower.includes('examen activado') || tituloLower.includes('nuevo examen') || tituloLower.includes('examen finalizado')) {
    return { icono: '📚', color: '#8b5cf6' }; // Morado
  } else if (tituloLower.includes('nuevo tema')) {
    return { icono: '📖', color: '#f59e0b' }; // Naranja
  } else if (tituloLower.includes('nuevo video')) {
    return { icono: '🎥', color: '#ef4444' }; // Rojo
  } else if (tituloLower.includes('nuevo enlace')) {
    return { icono: '🔗', color: '#06b6d4' }; // Cyan
  } else if (tituloLower.includes('estrella')) {
    return { icono: '⭐', color: '#fbbf24' }; // Amarillo
  } else if (tituloLower.includes('incidencia')) {
    return { icono: '⚠️', color: '#f59e0b' }; // Naranja
  } else if (tituloLower.includes('asistió') || tituloLower.includes('asistencia registrada')) {
    return { icono: '✅', color: '#10b981' }; // Verde
  } else if (tituloLower.includes('tardanza')) {
    return { icono: '⚠️', color: '#f59e0b' }; // Naranja
  } else if (tituloLower.includes('falta registrada') || tituloLower.includes('falta -')) {
    return { icono: '❌', color: '#ef4444' }; // Rojo
  } else if (tituloLower.includes('nota de tarea')) {
    return { icono: '📝', color: '#10b981' }; // Verde
  } else if (tituloLower.includes('supervisión') || tituloLower.includes('supervision')) {
    return { icono: '📋', color: '#4a83c1' };
  } else if (tituloLower.includes('proyecto se vence') || tituloLower.includes('tarea se vence')) {
    if (tituloLower.includes('hoy')) {
      return { icono: '⚠️', color: '#ef4444' }; // Rojo
    } else if (tituloLower.includes('mañana')) {
      return { icono: '⏰', color: '#f59e0b' }; // Naranja
    } else {
      return { icono: '📅', color: '#3b82f6' }; // Azul
    }
  } else {
    // Por defecto
    return { icono: '🔔', color: '#3b82f6' }; // Azul
  }
}

/**
 * Generar template HTML genérico para correo de notificación
 */
function generarTemplateNotificacion(datos) {
  const { titulo, mensaje, colegioNombre } = datos;
  
  const { icono, color } = obtenerIconoYColor(titulo);
  const colorPrincipal = color;
  
  // Extraer el icono del título si ya lo tiene, o usar el detectado
  const tituloConIcono = titulo.includes(icono) ? titulo : `${icono} ${titulo}`;
  
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${tituloConIcono} - ${colegioNombre}</title>
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
                ${tituloConIcono}
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
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px; font-weight: 600;">🏫 Colegio:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-size: 14px;">${colegioNombre}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px; font-weight: 600;">📅 Fecha:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-size: 14px;">${new Date().toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px; font-weight: 600;">🕐 Hora:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-size: 14px; font-weight: 700;">${new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</td>
                  </tr>
                </table>
              </div>
              
              <p style="margin: 25px 0 0 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
                Este es un mensaje automático del sistema. Por favor, no responda a este correo.
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
 * Enviar correo de notificación de asistencia (entrada/salida QR, docente).
 * Usa EMAIL_ASISTENCIA_* si está configurado; si no, usa la cuenta principal (EMAIL_USER).
 */
async function enviarCorreoAsistencia(destinatario, datos) {
  if (!isEmailEnvioHabilitado()) {
    return resultadoCorreoDeshabilitado();
  }
  try {
    const usoAsistencia = transporterAsistencia ? transporterAsistencia : transporter;
    const fromUser = transporterAsistencia ? process.env.EMAIL_ASISTENCIA_USER : process.env.EMAIL_USER;
    const fromPass = transporterAsistencia ? process.env.EMAIL_ASISTENCIA_PASSWORD : process.env.EMAIL_PASSWORD;

    if (!fromUser || !fromPass) {
      console.error(`❌ [EMAIL] Configuración de email incompleta. Revisar backend/.env (EMAIL_USER o EMAIL_ASISTENCIA_USER para asistencia)`);
      return { success: false, error: 'Configuración de email incompleta' };
    }
    const emailDestino = (destinatario && String(destinatario).trim()) || '';
    if (!emailDestino || !emailDestino.includes('@')) {
      console.error(`❌ [EMAIL] Destinatario de asistencia inválido: "${destinatario}"`);
      return { success: false, error: 'Destinatario inválido' };
    }

    const { nombreAlumno, hora, fecha, tipo, colegioNombre, esDocente, tipoAsistencia, descuentosPresentacion } = datos;
    
    console.log(`📧 [EMAIL] Enviando correo de asistencia a: ${emailDestino}`);
    console.log(`📧 [EMAIL] Datos:`, { nombreAlumno, hora, fecha, tipo, colegioNombre, esDocente, tipoAsistencia, descuentosPresentacion });
    
    const template = generarTemplateAsistencia({
      nombreAlumno,
      hora,
      fecha,
      tipo,
      colegioNombre: colegioNombre || 'Vanguard Schools',
      esDocente: esDocente || false,
      tipoAsistencia: tipoAsistencia || null,
      descuentosPresentacion: Array.isArray(descuentosPresentacion) ? descuentosPresentacion : []
    });

    // Asunto con palabra clave al inicio: ASISTIÓ, TARDANZA, SALIDA (para apoderados)
    const asunto = esDocente
      ? (tipo === 'ENTRADA'
          ? `✅ Registro de Entrada - ${hora}`
          : `👋 Registro de Salida - ${hora}`)
      : (tipo === 'ENTRADA'
          ? `${tipoAsistencia === 'TARDANZA' ? 'TARDANZA' : 'ASISTIÓ'} - ${nombreAlumno} llegó al colegio - ${hora}`
          : `SALIDA - ${nombreAlumno} salió del colegio - ${hora}`);

    const mailOptions = {
      from: `"${colegioNombre || 'Vanguard Schools'}" <${fromUser}>`,
      to: emailDestino,
      subject: asunto,
      html: template,
      headers: {
        'Return-Path': fromUser,
        'X-Auto-Response-Suppress': 'All',
        'X-Priority': '1',
        'Importance': 'high'
      },
      envelope: {
        from: fromUser,
        to: emailDestino
      }
    };

    console.log(`📧 [EMAIL] SMTP enviando asistencia hacia: ${emailDestino}`);
    const info = await usoAsistencia.sendMail(mailOptions);
    console.log(`✅ [EMAIL] Correo enviado exitosamente. MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ [EMAIL] Error enviando correo de asistencia:`, error.message);
    console.error(`❌ [EMAIL] Stack:`, error.stack);
    return { success: false, error: error.message };
  }
}

/**
 * Enviar correo genérico de notificación
 * @param {string} destinatario - Email del destinatario
 * @param {string} titulo - Título de la notificación
 * @param {string} mensaje - Mensaje de la notificación
 * @param {string} colegioNombre - Nombre del colegio (opcional)
 * @param {string} categoria - 'ASISTENCIA' | 'TAREA' | 'EXAMEN' | 'GENERAL' (opcional). Define qué cuenta usar; si no hay cuenta específica, usa la principal.
 */
/** Verifica que una cadena sea un email válido (evita "No recipients defined" por datos en BD) */
function esEmailValido(email) {
  if (!email || typeof email !== 'string') return false;
  const e = email.trim();
  return e.length > 0 && e.includes('@') && !e.includes(' ') && e.indexOf('@') > 0 && e.indexOf('@') < e.length - 1;
}

async function enviarCorreoNotificacion(destinatario, titulo, mensaje, colegioNombre = 'Vanguard Schools', categoria = 'GENERAL') {
  if (!isEmailEnvioHabilitado()) {
    return resultadoCorreoDeshabilitado();
  }
  try {
    const { transporter: trans, fromUser } = getTransporterPorCategoria(categoria || 'GENERAL');
    if (!fromUser) {
      console.error(`❌ [EMAIL] No hay cuenta configurada para categoría ${categoria}. Revisa .env (EMAIL_USER para GENERAL, o EMAIL_ASISTENCIA_*/EMAIL_MENSAJES_*/EMAIL_COMUNICADOS_*/EMAIL_ALERTAS_*/EMAIL_PUBLICACIONES_*)`);
      return { success: false, error: 'Configuración de email incompleta' };
    }

    if (!destinatario || !titulo || !mensaje) {
      console.error(`❌ [EMAIL] Faltan parámetros requeridos: destinatario=${destinatario}, titulo=${titulo}, mensaje=${mensaje}`);
      return { success: false, error: 'Parámetros incompletos' };
    }

    if (cuentaEnCooldown(fromUser)) {
      console.warn(`⚠️ [EMAIL NOTIFICACION] Cuenta ${fromUser} en cooldown por límite diario de Gmail. Se omite envío temporalmente.`);
      return { success: false, error: 'Cuenta de correo en cooldown por límite diario de Gmail' };
    }

    const emailDestino = String(destinatario).trim();
    if (!esEmailValido(emailDestino)) {
      console.warn(`⚠️ [EMAIL] Email inválido omitido (falta @ o tiene espacios): "${emailDestino}"`);
      return { success: false, error: 'Email inválido' };
    }

    console.log(`📧 [EMAIL NOTIFICACION] Preparando correo para: ${emailDestino} (categoría: ${categoria || 'GENERAL'})`);
    console.log(`📧 [EMAIL NOTIFICACION] Título: ${titulo}`);
    
    const { icono } = obtenerIconoYColor(titulo);
    const tituloConIcono = titulo.includes(icono) ? titulo : `${icono} ${titulo}`;
    
    const template = generarTemplateNotificacion({
      titulo: tituloConIcono,
      mensaje,
      colegioNombre: colegioNombre || 'Vanguard Schools'
    });

    const mailOptions = {
      from: `"${colegioNombre || 'Vanguard Schools'}" <${fromUser}>`,
      to: emailDestino,
      subject: tituloConIcono,
      html: template,
      headers: {
        'Return-Path': fromUser,
        'X-Auto-Response-Suppress': 'All',
        'Precedence': 'bulk'
      },
      envelope: {
        from: fromUser,
        to: emailDestino
      }
    };

    console.log(`📧 [EMAIL NOTIFICACION] Enviando correo desde: ${fromUser} hacia: ${emailDestino}`);
    const info = await trans.sendMail(mailOptions);
    console.log(`✅ [EMAIL NOTIFICACION] Correo enviado exitosamente. MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    if (esErrorLimiteDiarioGmail(error)) {
      // Evita repetir errores en cada intento durante la hora siguiente.
      activarCooldownCuenta(getTransporterPorCategoria(categoria || 'GENERAL').fromUser, 60 * 60 * 1000);
      console.error(`❌ [EMAIL NOTIFICACION] Límite diario de Gmail alcanzado. Se activa cooldown 60 min para esta cuenta.`);
      return { success: false, error: 'Límite diario de Gmail alcanzado (cooldown 60 min)' };
    }
    // Error capturado: solo registrar en logs, NO reenviar al remitente
    const emailDestino = (destinatario && String(destinatario).trim()) || '?';
    console.error(`❌ [EMAIL NOTIFICACION] Error enviando correo a ${emailDestino}:`, error.message);
    console.error(`❌ [EMAIL NOTIFICACION] Stack trace:`, error.stack);
    console.log(`⚠️ [EMAIL NOTIFICACION] Error registrado pero NO se notificará al remitente para evitar confusión`);
    return { success: false, error: error.message };
  }
}

/**
 * Correo de cumpleaños: cuerpo HTML de plantilla (solo contenido interno) envuelto en marco festivo email-safe.
 * Úsalo cuando automatices el envío al cumpleañero (asunto sin pasar por generarTemplateNotificacion).
 */
async function enviarCorreoCumpleanosHtml(destinatario, asunto, innerHtmlBody, colegioNombre = 'Vanguard Schools') {
  if (!isEmailEnvioHabilitado()) {
    return resultadoCorreoDeshabilitado();
  }
  try {
    const { transporter: trans, fromUser } = getTransporterPorCategoria('GENERAL');
    if (!fromUser) {
      console.error('❌ [EMAIL CUMPLEAÑOS] Sin cuenta GENERAL configurada');
      return { success: false, error: 'Configuración de email incompleta' };
    }
    if (!destinatario || !asunto) {
      return { success: false, error: 'Parámetros incompletos' };
    }
    const emailDestino = String(destinatario).trim();
    if (!esEmailValido(emailDestino)) {
      console.warn(`⚠️ [EMAIL CUMPLEAÑOS] Email inválido: "${emailDestino}"`);
      return { success: false, error: 'Email inválido' };
    }

    const bloque = envolverMarcoCumpleanosEmail(String(innerHtmlBody || '').trim() || '<p>¡Feliz cumpleaños!</p>');
    const year = new Date().getFullYear();
    const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:20px 12px;background:#f3f4f6;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
${bloque}
<p style="margin:24px 0 0;text-align:center;font-size:12px;color:#9ca3af;">© ${year} ${colegioNombre} · Mensaje automático</p>
</body></html>`;

    const mailOptions = {
      from: `"${colegioNombre}" <${fromUser}>`,
      to: emailDestino,
      subject: String(asunto).trim(),
      html,
      headers: {
        'Return-Path': fromUser,
        'X-Auto-Response-Suppress': 'All',
        Precedence: 'bulk',
      },
      envelope: { from: fromUser, to: emailDestino },
    };

    const info = await trans.sendMail(mailOptions);
    console.log(`✅ [EMAIL CUMPLEAÑOS] Enviado a ${emailDestino} MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ [EMAIL CUMPLEAÑOS]', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Enviar correo HTML personalizado con categoría opcional (EXAMEN, etc.).
 * Útil cuando el módulo necesita un diseño propio más rico que la plantilla genérica.
 */
async function enviarCorreoHtml(destinatario, asunto, htmlBody, colegioNombre = 'Vanguard Schools', categoria = 'GENERAL') {
  if (!isEmailEnvioHabilitado()) {
    return resultadoCorreoDeshabilitado();
  }
  try {
    const { transporter: trans, fromUser } = getTransporterPorCategoria(categoria || 'GENERAL');
    if (!fromUser) {
      console.error(`❌ [EMAIL HTML] No hay cuenta configurada para categoría ${categoria}`);
      return { success: false, error: 'Configuración de email incompleta' };
    }
    if (!destinatario || !asunto || !htmlBody) {
      return { success: false, error: 'Parámetros incompletos' };
    }
    if (cuentaEnCooldown(fromUser)) {
      return { success: false, error: 'Cuenta de correo en cooldown por límite diario de Gmail' };
    }

    const emailDestino = String(destinatario).trim();
    if (!esEmailValido(emailDestino)) {
      return { success: false, error: 'Email inválido' };
    }

    const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
${htmlBody}
</body>
</html>`;

    const mailOptions = {
      from: `"${colegioNombre || 'Vanguard Schools'}" <${fromUser}>`,
      to: emailDestino,
      subject: String(asunto).trim(),
      html,
      headers: {
        'Return-Path': fromUser,
        'X-Auto-Response-Suppress': 'All',
        Precedence: 'bulk'
      },
      envelope: { from: fromUser, to: emailDestino }
    };

    const info = await trans.sendMail(mailOptions);
    console.log(`✅ [EMAIL HTML] Enviado a ${emailDestino} MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    if (esErrorLimiteDiarioGmail(error)) {
      activarCooldownCuenta(getTransporterPorCategoria(categoria || 'GENERAL').fromUser, 60 * 60 * 1000);
      return { success: false, error: 'Límite diario de Gmail alcanzado (cooldown 60 min)' };
    }
    console.error(`❌ [EMAIL HTML] Error enviando correo:`, error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  isEmailEnvioHabilitado,
  enviarCorreoAsistencia,
  generarTemplateAsistencia,
  enviarCorreoNotificacion,
  generarTemplateNotificacion,
  obtenerIconoYColor,
  enviarCorreoCumpleanosHtml,
  enviarCorreoHtml,
};

