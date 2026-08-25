const express = require('express');
const router = express.Router();
const { query, execute } = require('../utils/mysql');
const { authenticateToken } = require('../middleware/auth');
const moment = require('moment-timezone');
const { enviarCorreoAsistencia, isEmailEnvioHabilitado, enviarCorreoHtml } = require('../services/emailService');
const { enviarPushNotificacionesIndividuales } = require('../services/pushNotificationService');
const { insertNotificacionUsuario } = require('../utils/notificacionInsert');
const { urlPortalHijoPorTipoUsuario } = require('../utils/notificacionUrls');
const { lineaAlumnoGrado, etiquetaGradoGrupo } = require('../utils/notificacionExamenApoderadoTexto');
const mensajesConfig = require('../config/mensajes.json');
const {
  asegurarIncidenciaVestimenta,
  sincronizarConductaMatriculaBimestre,
  cicloQueContieneFecha,
  fetchRangosCiclosParsed,
} = require('../utils/conductaIncidenciasBimestre');

// Todas las rutas requieren autenticación: ASISTENCIA, ADMINISTRADOR o DOCENTE con al menos un grupo como tutor
router.use(authenticateToken);

router.use(async (req, res, next) => {
  try {
    const t = req.user.tipo;
    if (t === 'ASISTENCIA' || t === 'ADMINISTRADOR') return next();
    if (t === 'DOCENTE' && req.user.personal_id) {
      const ok = await query(
        `SELECT 1 AS ok FROM grupos g
         WHERE (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?))
           AND g.colegio_id = ? AND g.anio = ?
         LIMIT 1`,
        [req.user.personal_id, req.user.personal_id, req.user.colegio_id, req.user.anio_activo]
      );
      if (ok.length > 0) return next();
    }
    return res.status(403).json({
      error: 'Acceso denegado. Solo personal de asistencia o tutores con grupo a cargo pueden usar el escáner.'
    });
  } catch (e) {
    console.error('Error verificando permisos asistencia:', e);
    return res.status(500).json({ error: 'Error verificando permisos' });
  }
});

/**
 * Valida y normaliza fecha/hora enviadas desde el dispositivo.
 * Retorna { fecha, hora } si son válidas, o null para usar hora del servidor.
 */
function parsearFechaHoraDispositivo(fecha_dispositivo, hora_dispositivo) {
  if (!fecha_dispositivo || !hora_dispositivo || typeof fecha_dispositivo !== 'string' || typeof hora_dispositivo !== 'string') return null;
  const fecha = fecha_dispositivo.trim();
  const hora = hora_dispositivo.trim();
  const matchFecha = fecha.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matchFecha) return null;
  const [, y, m, d] = matchFecha.map(Number);
  if (y < 2020 || y > moment().year() + 1 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  let h = 0, min = 0, seg = 0;
  if (/^\d{1,2}:\d{1,2}:\d{1,2}$/.test(hora)) {
    const parts = hora.split(':').map(Number);
    h = parts[0]; min = parts[1]; seg = parts[2];
  } else if (/^\d{1,2}:\d{1,2}$/.test(hora)) {
    const parts = hora.split(':').map(Number);
    h = parts[0]; min = parts[1];
  } else return null;
  if (h < 0 || h > 23 || min < 0 || min > 59 || seg < 0 || seg > 59) return null;
  const horaNorm = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(seg).padStart(2, '0')}`;
  return { fecha, hora: horaNorm };
}

function normalizarTextoComparacionNotificacion(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function construirMensajeFamiliaConAlumnoYGrupo(base, row) {
  const mensajeBase = String(base || '').trim();
  if (!mensajeBase || !row) return mensajeBase;

  const alumnoNombre = String(row.alumno_nombre || '').replace(/\s+/g, ' ').trim();
  const grupoTexto = etiquetaGradoGrupo(row);
  const baseNormalizada = normalizarTextoComparacionNotificacion(mensajeBase);
  const yaIncluyeAlumno =
    alumnoNombre && baseNormalizada.includes(normalizarTextoComparacionNotificacion(alumnoNombre));
  const yaIncluyeGrupo =
    grupoTexto && baseNormalizada.includes(normalizarTextoComparacionNotificacion(grupoTexto));

  if (yaIncluyeAlumno && (!grupoTexto || yaIncluyeGrupo)) {
    return mensajeBase;
  }

  const lineaContexto = lineaAlumnoGrado({
    alumno_nombre: alumnoNombre,
    grado: row.grado,
    seccion: row.seccion,
    nivel_nombre: row.nivel_nombre,
  });

  return lineaContexto ? `${lineaContexto} — ${mensajeBase}` : mensajeBase;
}

/**
 * POST /api/asistencia/escaneo
 * Procesar escaneo de QR y registrar asistencia
 */
router.post('/escaneo', async (req, res) => {
  try {
    const { qr_data } = req.body;
    const { colegio_id, anio_activo } = req.user;

    if (!qr_data) {
      return res.status(400).json({ error: 'QR data es requerido' });
    }

    // Buscar usuario por DNI o ID
    let usuario = null;
    let tipoUsuario = null;

    // Intentar buscar por DNI (formato: número)
    if (/^\d+$/.test(qr_data)) {
      // Buscar en alumnos
      const alumno = await query(
        `SELECT u.id, u.tipo, a.id as alumno_id, a.nombres, a.apellido_paterno, a.apellido_materno, 
                a.nro_documento, u.colegio_id
         FROM usuarios u
         INNER JOIN alumnos a ON a.id = u.alumno_id
         WHERE (a.nro_documento = ? OR u.usuario = ?) 
           AND u.colegio_id = ? AND u.estado = 'ACTIVO'
         LIMIT 1`,
        [qr_data, qr_data, colegio_id]
      );

      if (alumno.length > 0) {
        usuario = alumno[0];
        tipoUsuario = 'ALUMNO';
      } else {
        // Buscar en personal/docentes
        const docente = await query(
          `SELECT u.id, u.tipo, p.id as personal_id, p.nombres, p.apellidos, 
                  u.usuario as nro_documento, u.colegio_id
           FROM usuarios u
           INNER JOIN personal p ON p.id = u.personal_id
           WHERE (u.usuario = ? OR p.nro_documento = ?)
             AND u.colegio_id = ? AND u.estado = 'ACTIVO'
           LIMIT 1`,
          [qr_data, qr_data, colegio_id]
        );

        if (docente.length > 0) {
          usuario = docente[0];
          tipoUsuario = 'DOCENTE';
        }
      }
    } else if (qr_data.startsWith('ALUMNO-') || qr_data.startsWith('DOCENTE-')) {
      // Buscar por ID (formato: ALUMNO-123 o DOCENTE-123)
      const id = qr_data.replace(/^(ALUMNO|DOCENTE)-/, '');
      
      if (qr_data.startsWith('ALUMNO-')) {
        const alumno = await query(
          `SELECT u.id, u.tipo, a.id as alumno_id, a.nombres, a.apellido_paterno, a.apellido_materno,
                  a.nro_documento, u.colegio_id
           FROM usuarios u
           INNER JOIN alumnos a ON a.id = u.alumno_id
           WHERE a.id = ? AND u.colegio_id = ? AND u.estado = 'ACTIVO'
           LIMIT 1`,
          [id, colegio_id]
        );
        if (alumno.length > 0) {
          usuario = alumno[0];
          tipoUsuario = 'ALUMNO';
        }
      } else {
        const docente = await query(
          `SELECT u.id, u.tipo, p.id as personal_id, p.nombres, p.apellidos,
                  u.usuario as nro_documento, u.colegio_id
           FROM usuarios u
           INNER JOIN personal p ON p.id = u.personal_id
           WHERE p.id = ? AND u.colegio_id = ? AND u.estado = 'ACTIVO'
           LIMIT 1`,
          [id, colegio_id]
        );
        if (docente.length > 0) {
          usuario = docente[0];
          tipoUsuario = 'DOCENTE';
        }
      }
    }

    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado con el QR proporcionado' });
    }

    // Preparar datos de respuesta
    const datosUsuario = {
      usuario_id: usuario.id,
      tipo: tipoUsuario,
      nombres: tipoUsuario === 'ALUMNO' 
        ? usuario.nombres 
        : usuario.nombres,
      apellidos: tipoUsuario === 'ALUMNO'
        ? `${usuario.apellido_paterno || ''} ${usuario.apellido_materno || ''}`.trim()
        : usuario.apellidos || '',
      nro_documento: tipoUsuario === 'ALUMNO' 
        ? usuario.nro_documento 
        : usuario.nro_documento
    };

    // Verificar si ya hay un registro de asistencia HOY (mismo día)
    const fechaHoy = moment().tz('America/Lima').format('YYYY-MM-DD');
    const asistenciaHoy = await query(
      `SELECT id, tipo_registro, hora_entrada, hora_salida, fecha
       FROM asistencia_registros
       WHERE usuario_id = ? AND colegio_id = ? AND fecha = ? AND anio = ?
       ORDER BY id DESC
       LIMIT 1`,
      [usuario.id, colegio_id, fechaHoy, anio_activo]
    );

    // IMPORTANTE: Solo es SALIDA si:
    // 1. Hay un registro HOY (mismo día)
    // 2. Tiene hora_entrada
    // 3. NO tiene hora_salida
    // Si tiene entrada Y salida, registro_completo = true (evitar bucle en frontend)
    let tipoRegistro = 'ENTRADA';
    let registroCompleto = false;
    if (asistenciaHoy.length > 0) {
      const registro = asistenciaHoy[0];
      const fechaRegistro = moment(registro.fecha).format('YYYY-MM-DD');
      if (fechaRegistro === fechaHoy) {
        if (registro.hora_entrada && registro.hora_salida) {
          registroCompleto = true;
          tipoRegistro = 'COMPLETO'; // El frontend no debe mostrar modal de registrar
        } else if (registro.hora_entrada && !registro.hora_salida) {
          tipoRegistro = 'SALIDA';
        }
      }
    }

    res.json({
      success: true,
      registro_completo: registroCompleto,
      usuario: datosUsuario,
      tipo_registro: tipoRegistro,
      asistencia_existente: asistenciaHoy.length > 0 ? asistenciaHoy[0] : null
    });
  } catch (error) {
    console.error('Error procesando escaneo:', error);
    res.status(500).json({ error: 'Error al procesar el escaneo' });
  }
});

/**
 * POST /api/asistencia/registrar
 * Registrar asistencia (entrada o salida)
 */
const MOTIVOS_PRESENTACION = new Set(['PRESENTACION']);

function tieneDescuentoPresentacion(descuentosPresentacion) {
  return (
    Array.isArray(descuentosPresentacion) &&
    descuentosPresentacion.includes('PRESENTACION')
  );
}

/** Aviso aparte (campanita / push / correo): no mezclar con la notificación de asistencia. */
function buildAvisoVestimenta({ nombreAlumno, fechaFormateada, horaFormateada, contextoAlumno }) {
  const nombre = String(nombreAlumno || 'Su hijo(a)').trim() || 'Su hijo(a)';
  const titulo = '👔 Vestimenta −1 punto';
  let contenido =
    `Se descontó 1 punto a ${nombre} por vestimenta / presentación escolar ` +
    `(uniforme incompleto o presentación no adecuada) el ${fechaFormateada} a las ${horaFormateada}. ` +
    `Le pedimos reforzar el cumplimiento del uniforme y la presentación requerida por el colegio.`;
  contenido = construirMensajeFamiliaConAlumnoYGrupo(contenido, contextoAlumno);
  return { titulo, contenido };
}

function htmlCorreoVestimenta({ nombreAlumno, fecha, hora, colegioNombre, mensaje }) {
  const colegio = colegioNombre || 'Vanguard Schools';
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f3f4f6;padding:20px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 14px rgba(15,23,42,0.08);">
      <tr>
        <td style="background:linear-gradient(135deg,#d97706 0%,#b45309 100%);padding:26px 22px;text-align:center;">
          <div style="font-size:28px;margin-bottom:8px;">👔</div>
          <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">Vestimenta −1 punto</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:28px 26px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937;font-size:15px;line-height:1.6;">
          <p style="margin:0 0 16px;">Estimado(a) apoderado(a),</p>
          <p style="margin:0 0 16px;">${mensaje}</p>
          <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;margin:18px 0;">
            <table role="presentation" width="100%" style="border-collapse:collapse;font-size:14px;">
              <tr>
                <td style="padding:6px 0;color:#92400e;font-weight:600;">Estudiante</td>
                <td style="padding:6px 0;color:#78350f;font-weight:700;text-align:right;">${nombreAlumno}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#92400e;font-weight:600;">Motivo</td>
                <td style="padding:6px 0;color:#78350f;font-weight:700;text-align:right;">Vestimenta / presentación</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#92400e;font-weight:600;">Descuento</td>
                <td style="padding:6px 0;color:#b45309;font-weight:800;text-align:right;">−1 punto</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#92400e;font-weight:600;">Fecha</td>
                <td style="padding:6px 0;color:#78350f;text-align:right;">${fecha}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#92400e;font-weight:600;">Hora</td>
                <td style="padding:6px 0;color:#78350f;text-align:right;">${hora}</td>
              </tr>
            </table>
          </div>
          <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">Mensaje automático de ${colegio}.</p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>`;
}

router.post('/registrar', async (req, res) => {
  try {
    const {
      usuario_id,
      tipo_usuario,
      tipo_registro,
      fecha_dispositivo,
      hora_dispositivo,
      descuentos_presentacion: rawDescuentos
    } = req.body;
    const { colegio_id, anio_activo, usuario_id: asistencia_usuario_id } = req.user;

    let descuentosPresentacion = [];
    if (Array.isArray(rawDescuentos)) {
      descuentosPresentacion = [...new Set(rawDescuentos.filter((d) => MOTIVOS_PRESENTACION.has(d)))];
    }

    if (!usuario_id || !tipo_usuario || !tipo_registro) {
      return res.status(400).json({ error: 'Datos incompletos' });
    }

    if (!['ENTRADA', 'SALIDA'].includes(tipo_registro)) {
      return res.status(400).json({ error: 'Tipo de registro inválido' });
    }

    const dispositivo = parsearFechaHoraDispositivo(fecha_dispositivo, hora_dispositivo);
    const fechaHoy = dispositivo ? dispositivo.fecha : moment().tz('America/Lima').format('YYYY-MM-DD');
    const horaActual = dispositivo ? dispositivo.hora : moment().tz('America/Lima').format('HH:mm:ss');
    if (dispositivo) console.log(`📋 [ASISTENCIA] Usando fecha/hora del dispositivo: ${fechaHoy} ${horaActual}`);
    
    // Variable para almacenar el tipo de asistencia (PRESENTE/TARDANZA) para usar en notificaciones
    let tipoAsistenciaParaNotificacion = null;

    // Verificar registro existente
    const asistenciaExistente = await query(
      `SELECT id, tipo_registro, hora_entrada, hora_salida, fecha
       FROM asistencia_registros
       WHERE usuario_id = ? AND colegio_id = ? AND fecha = ? AND anio = ?
       ORDER BY id DESC
       LIMIT 1`,
      [usuario_id, colegio_id, fechaHoy, anio_activo]
    );

    console.log(`📋 [ASISTENCIA] Registrando ${tipo_registro} para usuario ${usuario_id} (tipo: ${tipo_usuario}) en fecha ${fechaHoy}`);
    if (asistenciaExistente.length > 0) {
      console.log(`📋 [ASISTENCIA] Registro existente encontrado:`, {
        id: asistenciaExistente[0].id,
        tipo_registro: asistenciaExistente[0].tipo_registro,
        hora_entrada: asistenciaExistente[0].hora_entrada,
        hora_salida: asistenciaExistente[0].hora_salida
      });
    } else {
      console.log(`📋 [ASISTENCIA] No hay registro existente para hoy - creando nuevo`);
    }

    let resultado;

    if (asistenciaExistente.length > 0) {
      const registro = asistenciaExistente[0];
      
      // CASO 1: Intentar registrar ENTRADA cuando ya existe una entrada HOY
      if (tipo_registro === 'ENTRADA' && registro.hora_entrada) {
        console.log(`❌ [ASISTENCIA] Ya existe una entrada registrada hoy para este usuario`);
        return res.status(400).json({ 
          error: 'Ya existe un registro de entrada para hoy. No se puede registrar otra entrada.' 
        });
      }
      
      // CASO 2: Intentar registrar SALIDA cuando ya existe entrada pero NO salida (CORRECTO - actualizar)
      if (tipo_registro === 'SALIDA' && registro.hora_entrada && !registro.hora_salida) {
        console.log(`✅ [ASISTENCIA] Actualizando registro existente: agregando salida`);
        await execute(
          `UPDATE asistencia_registros
           SET hora_salida = ?, tipo_registro = 'ENTRADA_SALIDA', actualizado_por = ?, fecha_actualizacion = NOW()
           WHERE id = ?`,
          [horaActual, asistencia_usuario_id, registro.id]
        );
        resultado = { id: registro.id, tipo: 'SALIDA', hora: horaActual };
        
        // Actualizar hora_salida en matriculas_asistencias si es ALUMNO
        if (tipo_usuario === 'ALUMNO') {
          try {
            const matricula = await query(
              `SELECT m.id as matricula_id
               FROM matriculas m
               INNER JOIN grupos g ON g.id = m.grupo_id
               WHERE m.alumno_id = (SELECT alumno_id FROM usuarios WHERE id = ?)
                 AND m.colegio_id = ? AND g.anio = ?
                 AND (m.estado = 0)
               LIMIT 1`,
              [usuario_id, colegio_id, anio_activo]
            );
            
            if (matricula.length > 0) {
              await execute(
                `UPDATE matriculas_asistencias 
                 SET hora_salida = ?
                 WHERE matricula_id = ? AND fecha = ?`,
                [horaActual, matricula[0].matricula_id, fechaHoy]
              );
              console.log(`✅ [ASISTENCIA] Actualizada hora_salida en matriculas_asistencias`);
            }
          } catch (error) {
            console.error(`❌ [ASISTENCIA] Error actualizando hora_salida:`, error);
          }
        }
      } 
      // CASO 3: Intentar registrar SALIDA cuando ya tiene entrada Y salida
      else if (tipo_registro === 'SALIDA' && registro.hora_entrada && registro.hora_salida) {
        console.log(`❌ [ASISTENCIA] Ya existe entrada y salida registradas hoy para este usuario`);
        return res.status(400).json({ 
          error: 'Ya existe un registro completo (entrada y salida) para hoy.' 
        });
      }
      // CASO 4: Cualquier otro caso (no debería pasar)
      else {
        console.log(`❌ [ASISTENCIA] Estado de registro inválido:`, registro);
        return res.status(400).json({ error: 'Ya existe un registro de este tipo para hoy' });
      }
    } else {
      // No hay registro existente HOY
      // CASO 5: Registrar ENTRADA (primera vez hoy) - PERMITIDO
      if (tipo_registro === 'ENTRADA') {
        console.log(`✅ [ASISTENCIA] Creando nuevo registro de ENTRADA`);
        const insertResult = await execute(
          `INSERT INTO asistencia_registros 
           (usuario_id, colegio_id, anio, fecha, tipo_registro, hora_entrada, creado_por, fecha_creacion)
           VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
          [usuario_id, colegio_id, anio_activo, fechaHoy, tipo_registro, horaActual, asistencia_usuario_id]
        );
        resultado = { id: insertResult.insertId, tipo: 'ENTRADA', hora: horaActual };
        
        // Si es ALUMNO, determinar tipo de asistencia (PRESENTE/TARDANZA) y crear registro en matriculas_asistencias
        if (tipo_usuario === 'ALUMNO') {
          try {
            // Obtener matrícula del alumno con nivel
            const matricula = await query(
              `SELECT m.id as matricula_id, g.nivel_id
               FROM matriculas m
               INNER JOIN grupos g ON g.id = m.grupo_id
               WHERE m.alumno_id = (SELECT alumno_id FROM usuarios WHERE id = ?)
                 AND m.colegio_id = ? AND g.anio = ?
                 AND (m.estado = 0)
               LIMIT 1`,
              [usuario_id, colegio_id, anio_activo]
            );
            
            if (matricula.length > 0) {
              // Obtener hora de entrada y tolerancia configuradas del nivel
              const nivel = await query(
                `SELECT hora_entrada, tolerancia_minutos FROM niveles WHERE id = ? AND colegio_id = ?`,
                [matricula[0].nivel_id, colegio_id]
              );
              
              const horaEntradaConfigurada = nivel.length > 0 && nivel[0].hora_entrada 
                ? nivel[0].hora_entrada 
                : '08:00:00'; // Hora por defecto
              
              // Tolerancia en minutos (por defecto 5 minutos si no está configurada)
              const toleranciaMinutos = nivel.length > 0 && nivel[0].tolerancia_minutos !== null
                ? nivel[0].tolerancia_minutos
                : 5; // Tolerancia por defecto: 5 minutos
              
              // Comparar hora actual con hora configurada
              const horaActualMoment = moment(horaActual, 'HH:mm:ss');
              const horaConfiguradaMoment = moment(horaEntradaConfigurada, 'HH:mm:ss');
              const minutosDiferencia = horaActualMoment.diff(horaConfiguradaMoment, 'minutes');
              
              // Determinar tipo: PRESENTE si llega antes o hasta la tolerancia configurada, TARDANZA si llega después
              tipoAsistenciaParaNotificacion = minutosDiferencia <= toleranciaMinutos ? 'PRESENTE' : 'TARDANZA';
              
              console.log(`📋 [ASISTENCIA] Alumno - Hora configurada: ${horaEntradaConfigurada}, Tolerancia: ${toleranciaMinutos} min, Hora real: ${horaActual}, Diferencia: ${minutosDiferencia} min, Tipo: ${tipoAsistenciaParaNotificacion}`);
              
              // Crear o actualizar registro en matriculas_asistencias
              const asistenciaExistente = await query(
                `SELECT id FROM matriculas_asistencias 
                 WHERE matricula_id = ? AND fecha = ?`,
                [matricula[0].matricula_id, fechaHoy]
              );
              
              if (asistenciaExistente.length > 0) {
                // Actualizar registro existente
                await execute(
                  `UPDATE matriculas_asistencias 
                   SET tipo = ?, hora_entrada = ?, created_at = NOW()
                   WHERE id = ?`,
                  [tipoAsistenciaParaNotificacion, horaActual, asistenciaExistente[0].id]
                );
                console.log(`✅ [ASISTENCIA] Actualizado registro en matriculas_asistencias: ${tipoAsistenciaParaNotificacion}`);
              } else {
                // Crear nuevo registro
                await execute(
                  `INSERT INTO matriculas_asistencias 
                   (matricula_id, fecha, tipo, hora_entrada, created_at)
                   VALUES (?, ?, ?, ?, NOW())`,
                  [matricula[0].matricula_id, fechaHoy, tipoAsistenciaParaNotificacion, horaActual]
                );
                console.log(`✅ [ASISTENCIA] Creado registro en matriculas_asistencias: ${tipoAsistenciaParaNotificacion}`);
              }
            }
          } catch (error) {
            console.error(`❌ [ASISTENCIA] Error procesando asistencia en matriculas_asistencias:`, error);
            // No fallar el registro principal si falla esto
          }
        }
      } 
      // CASO 6: Intentar registrar SALIDA sin entrada previa - RECHAZAR
      else {
        console.log(`❌ [ASISTENCIA] No se puede registrar salida sin entrada previa`);
        return res.status(400).json({ error: 'No se puede registrar salida sin entrada previa' });
      }
    }

    // Obtener datos del usuario para notificaciones
    let datosUsuario = null;
    console.log(`📋 [ASISTENCIA] Obteniendo datos del usuario para notificaciones...`);
    
    if (tipo_usuario === 'ALUMNO') {
      console.log(`📋 [ASISTENCIA] Buscando datos de ALUMNO con usuario_id: ${usuario_id}`);
      const alumno = await query(
        `SELECT a.id, a.nombres, a.apellido_paterno, a.apellido_materno, u.id as usuario_id
         FROM alumnos a
         INNER JOIN usuarios u ON u.alumno_id = a.id
         WHERE u.id = ? AND u.colegio_id = ?`,
        [usuario_id, colegio_id]
      );
      console.log(`📋 [ASISTENCIA] Resultado búsqueda alumno: ${alumno.length} registros encontrados`);
      if (alumno.length > 0) {
        datosUsuario = {
          ...alumno[0],
          nombre_completo: `${alumno[0].nombres} ${alumno[0].apellido_paterno} ${alumno[0].apellido_materno}`.trim()
        };
        console.log(`✅ [ASISTENCIA] Datos de alumno obtenidos: ${datosUsuario.nombre_completo} (ID: ${datosUsuario.id})`);
      } else {
        console.log(`⚠️ [ASISTENCIA] No se encontró alumno con usuario_id: ${usuario_id}`);
      }
    } else {
      console.log(`📋 [ASISTENCIA] Buscando datos de DOCENTE con usuario_id: ${usuario_id}`);
      const docente = await query(
        `SELECT p.id, p.nombres, p.apellidos, p.email, u.id as usuario_id
         FROM personal p
         INNER JOIN usuarios u ON u.personal_id = p.id
         WHERE u.id = ? AND u.colegio_id = ?`,
        [usuario_id, colegio_id]
      );
      console.log(`📋 [ASISTENCIA] Resultado búsqueda docente: ${docente.length} registros encontrados`);
      if (docente.length > 0) {
        datosUsuario = {
          ...docente[0],
          nombre_completo: `${docente[0].nombres} ${docente[0].apellidos}`.trim()
        };
        console.log(`✅ [ASISTENCIA] Datos de docente obtenidos: ${datosUsuario.nombre_completo} (ID: ${datosUsuario.id})`);
      } else {
        console.log(`⚠️ [ASISTENCIA] No se encontró docente con usuario_id: ${usuario_id}`);
      }
    }

    // Enviar notificaciones según el tipo de usuario
    console.log(`📧 [ASISTENCIA] Verificando notificaciones para tipo_usuario: ${tipo_usuario}, datosUsuario:`, datosUsuario ? 'existe' : 'null');
    
    // Obtener nombre del colegio (se usa tanto para ALUMNO como DOCENTE)
    const colegio = await query(
      `SELECT nombre FROM colegios WHERE id = ?`,
      [colegio_id]
    );
    const colegioNombre = colegio.length > 0 ? colegio[0].nombre : 'Vanguard Schools';
    const fechaFormateada = moment().tz('America/Lima').format('DD/MM/YYYY');
    const horaFormateada = moment().tz('America/Lima').format('HH:mm');
    
    // ========== NOTIFICACIONES PARA ALUMNO ==========
    if (tipo_usuario === 'ALUMNO' && datosUsuario) {
      console.log(`📧 [ASISTENCIA] Iniciando proceso de notificaciones para alumno: ${datosUsuario.nombre_completo}, tipo_registro: ${tipo_registro}`);
      try {
        // Obtener apoderados del alumno
        const apoderados = await query(
          `SELECT DISTINCT ap.id, ap.email, ap.nombres, ap.apellido_paterno, ap.apellido_materno, ap.nro_documento
           FROM apoderados ap
           INNER JOIN familias f ON f.apoderado_id = ap.id
           WHERE f.alumno_id = ? AND ap.colegio_id = ? AND ap.email != '' AND ap.email IS NOT NULL`,
          [datosUsuario.id, colegio_id]
        );
        
        console.log(`📧 [ASISTENCIA] Encontrados ${apoderados.length} apoderados con email para el alumno`);

        // Obtener suscripciones push de los apoderados
        // IMPORTANTE: También incluir docentes que son apoderados (mismo nro_documento)
        const apoderadoIds = apoderados.map(a => a.id);
        const apoderadoDnis = apoderados.map(a => a.nro_documento).filter(dni => dni); // Obtener DNI de apoderados
        
        let subscriptions = [];
        if (apoderadoIds.length > 0 || apoderadoDnis.length > 0) {
          let usuarioIds = [];
          
          // 1. Obtener usuarios con apoderado_id (caso normal: apoderado con usuario tipo APODERADO)
          if (apoderadoIds.length > 0) {
            const usuariosApoderados = await query(
              `SELECT u.id FROM usuarios u 
               WHERE u.apoderado_id IN (${apoderadoIds.map(() => '?').join(',')}) 
                 AND u.colegio_id = ? AND u.estado = 'ACTIVO'`,
              [...apoderadoIds, colegio_id]
            );
            usuarioIds.push(...usuariosApoderados.map(u => u.id));
          }
          
          // 2. Obtener usuarios DOCENTE que también son apoderados (mismo nro_documento)
          if (apoderadoDnis.length > 0) {
            const usuariosDocentesApoderados = await query(
              `SELECT DISTINCT u.id 
               FROM usuarios u
               INNER JOIN personal p ON p.id = u.personal_id
               WHERE u.colegio_id = ? 
                 AND u.estado = 'ACTIVO'
                 AND u.tipo = 'DOCENTE'
                 AND (p.nro_documento IN (${apoderadoDnis.map(() => '?').join(',')}) 
                      OR u.usuario IN (${apoderadoDnis.map(() => '?').join(',')}))`,
              [colegio_id, ...apoderadoDnis, ...apoderadoDnis]
            );
            usuarioIds.push(...usuariosDocentesApoderados.map(u => u.id));
            console.log(`📱 [ASISTENCIA] Encontrados ${usuariosDocentesApoderados.length} usuarios DOCENTE que también son apoderados`);
          }
          
          // Eliminar duplicados
          usuarioIds = [...new Set(usuarioIds)];
          
          if (usuarioIds.length > 0) {
            console.log(`📱 [ASISTENCIA] Buscando suscripciones push para ${usuarioIds.length} usuarios (apoderados + docentes-apoderados)`);
            const subscriptionsData = await query(
              `SELECT usuario_id, endpoint, p256dh, auth 
               FROM push_subscriptions 
               WHERE usuario_id IN (${usuarioIds.map(() => '?').join(',')}) 
                 AND colegio_id = ? AND (activo = 1 OR activo IS NULL)`,
              [...usuarioIds, colegio_id]
            );
            
            subscriptions = subscriptionsData.map(sub => ({
              usuario_id: sub.usuario_id,
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth
              }
            }));
            
            console.log(`📱 [ASISTENCIA] Encontradas ${subscriptions.length} suscripciones push para ${apoderados.length} apoderados (incluyendo docentes que son apoderados)`);
          } else {
            console.log(`⚠️ [ASISTENCIA] No se encontraron usuarios (ni apoderados ni docentes-apoderados) para las suscripciones push`);
          }
        }

        // Preparar payload de notificación para APODERADOS
        console.log(`📧 [ASISTENCIA] Preparando notificaciones para tipo_registro: ${tipo_registro}`);
        const mensajeConfig = mensajesConfig.asistencia.alumno[tipo_registro.toLowerCase()];
        if (!mensajeConfig) {
          console.error(`❌ [ASISTENCIA] No se encontró configuración de mensaje para tipo_registro: ${tipo_registro}`);
        }
        let contextoAlumnoNotificacion = null;
        try {
          const ctxRows = await query(
            `SELECT
               TRIM(CONCAT(COALESCE(a.nombres,''), ' ', COALESCE(a.apellido_paterno,''), ' ', COALESCE(a.apellido_materno,''))) AS alumno_nombre,
               g.grado,
               g.seccion,
               COALESCE(n.nombre, '') AS nivel_nombre
             FROM alumnos a
             LEFT JOIN matriculas m ON m.alumno_id = a.id AND m.colegio_id = a.colegio_id AND (m.estado = 0)
             LEFT JOIN grupos g ON g.id = m.grupo_id AND g.anio = ?
             LEFT JOIN niveles n ON n.id = g.nivel_id
             WHERE a.id = ? AND a.colegio_id = ?
             ORDER BY (g.id IS NULL) ASC, m.fecha_registro DESC
             LIMIT 1`,
            [anio_activo, datosUsuario.id, colegio_id]
          );
          contextoAlumnoNotificacion = ctxRows && ctxRows[0] ? ctxRows[0] : null;
        } catch (ctxErr) {
          console.error('❌ [ASISTENCIA] Error obteniendo contexto alumno/grupo:', ctxErr);
        }

        let tituloNotificacion = mensajeConfig?.titulo || `Asistencia ${tipo_registro}`;
        const palabraClave = tipo_registro === 'ENTRADA'
          ? (tipoAsistenciaParaNotificacion === 'TARDANZA' ? 'TARDANZA' : 'ASISTIÓ')
          : 'SALIDA';
        tituloNotificacion = `${palabraClave} - ${tituloNotificacion}`;

        let mensajeNotificacion = mensajeConfig?.mensaje_corto
          ? mensajeConfig.mensaje_corto
              .replace('{nombreAlumno}', datosUsuario.nombre_completo)
              .replace('{hora}', horaFormateada)
              .replace('{fecha}', fechaFormateada)
          : `${datosUsuario.nombre_completo} registró ${tipo_registro.toLowerCase()} a las ${horaFormateada} el ${fechaFormateada}`;
        
        // Si es ENTRADA y tenemos el tipo de asistencia (PRESENTE/TARDANZA), agregarlo al mensaje
        if (tipo_registro === 'ENTRADA' && tipoAsistenciaParaNotificacion) {
          const tipoTexto = tipoAsistenciaParaNotificacion === 'PRESENTE' ? 'Presente' : 'Tardanza';
          mensajeNotificacion += ` Estado: ${tipoTexto}.`;
        }

        mensajeNotificacion = construirMensajeFamiliaConAlumnoYGrupo(
          mensajeNotificacion,
          contextoAlumnoNotificacion
        );

        const avisoVestimenta =
          tipo_registro === 'ENTRADA' && tieneDescuentoPresentacion(descuentosPresentacion)
            ? buildAvisoVestimenta({
                nombreAlumno: datosUsuario.nombre_completo,
                fechaFormateada,
                horaFormateada,
                contextoAlumno: contextoAlumnoNotificacion,
              })
            : null;
        
        console.log(`📧 [ASISTENCIA] Título notificación: ${tituloNotificacion}`);
        console.log(`📧 [ASISTENCIA] Mensaje notificación: ${mensajeNotificacion}`);
        if (avisoVestimenta) {
          console.log(`👔 [VESTIMENTA] Aviso aparte: ${avisoVestimenta.titulo}`);
        }

        const idsPushTipos = [...new Set((subscriptions || []).map((s) => parseInt(s.usuario_id, 10)))];
        let tipoPorUsuarioAsistenciaPush = new Map();
        if (idsPushTipos.length > 0) {
          const trPush = await query(
            `SELECT id, tipo FROM usuarios WHERE id IN (${idsPushTipos.map(() => '?').join(',')}) AND colegio_id = ?`,
            [...idsPushTipos, colegio_id]
          );
          tipoPorUsuarioAsistenciaPush = new Map((trPush || []).map((r) => [parseInt(r.id, 10), r.tipo]));
        }

        // Crear notificaciones en la BD para los apoderados (incluyendo docentes que son apoderados)
        if (apoderados.length > 0) {
          try {
            let todosUsuarioIds = [];
            
            // 1. Obtener usuarios con apoderado_id (caso normal: apoderado con usuario tipo APODERADO)
            const apoderadoIds = apoderados.map(a => a.id);
            if (apoderadoIds.length > 0) {
              const usuariosApoderados = await query(
                `SELECT id FROM usuarios 
                 WHERE apoderado_id IN (${apoderadoIds.map(() => '?').join(',')}) 
                   AND colegio_id = ? AND estado = 'ACTIVO'`,
                [...apoderadoIds, colegio_id]
              );
              todosUsuarioIds.push(...usuariosApoderados.map(u => u.id));
            }
            
            // 2. Obtener usuarios DOCENTE que también son apoderados (mismo nro_documento)
            const apoderadoDnis = apoderados.map(a => a.nro_documento).filter(dni => dni);
            if (apoderadoDnis.length > 0) {
              const usuariosDocentesApoderados = await query(
                `SELECT DISTINCT u.id 
                 FROM usuarios u
                 INNER JOIN personal p ON p.id = u.personal_id
                 WHERE u.colegio_id = ? 
                   AND u.estado = 'ACTIVO'
                   AND u.tipo = 'DOCENTE'
                   AND (p.nro_documento IN (${apoderadoDnis.map(() => '?').join(',')}) 
                        OR u.usuario IN (${apoderadoDnis.map(() => '?').join(',')}))`,
                [colegio_id, ...apoderadoDnis, ...apoderadoDnis]
              );
              todosUsuarioIds.push(...usuariosDocentesApoderados.map(u => u.id));
              console.log(`📋 [ASISTENCIA] Encontrados ${usuariosDocentesApoderados.length} usuarios DOCENTE que también son apoderados para notificaciones en BD`);
            }
            
            // Eliminar duplicados
            todosUsuarioIds = [...new Set(todosUsuarioIds)];

            const phTipo = todosUsuarioIds.map(() => '?').join(',');
            const tiposDestRows = await query(
              `SELECT id, tipo FROM usuarios WHERE id IN (${phTipo}) AND colegio_id = ?`,
              [...todosUsuarioIds.map((x) => parseInt(x, 10)), colegio_id]
            );
            const tipoPorDestAsistencia = new Map(
              (tiposDestRows || []).map((r) => [parseInt(r.id, 10), r.tipo])
            );
            
            // Crear notificaciones para todos los usuarios encontrados
            for (const usuarioId of todosUsuarioIds) {
              try {
                const uidNum = parseInt(usuarioId, 10);
                const tipoDest = tipoPorDestAsistencia.get(uidNum) || 'APODERADO';
                const urlDestinoAsist = urlPortalHijoPorTipoUsuario(tipoDest, datosUsuario.id);
                await insertNotificacionUsuario(execute, {
                  usuario_id: asistencia_usuario_id,
                  destinatario_id: usuarioId,
                  asunto: tituloNotificacion,
                  contenido: mensajeNotificacion,
                  estado: 'ENVIADO',
                  accion_tipo: 'asistencia_alumno',
                  accion_payload: {
                    alumno_id: datosUsuario.id,
                    tipo_registro,
                  },
                  url_destino: urlDestinoAsist
                });
                console.log(`✅ [ASISTENCIA] Notificación creada en BD para usuario ID: ${usuarioId}`);

                if (avisoVestimenta) {
                  await insertNotificacionUsuario(execute, {
                    usuario_id: asistencia_usuario_id,
                    destinatario_id: usuarioId,
                    asunto: avisoVestimenta.titulo,
                    contenido: avisoVestimenta.contenido,
                    estado: 'ENVIADO',
                    accion_tipo: 'presentacion_vestimenta',
                    accion_payload: {
                      alumno_id: datosUsuario.id,
                      puntos: -1,
                      motivo: 'PRESENTACION',
                    },
                    url_destino: urlDestinoAsist,
                  });
                  console.log(`✅ [VESTIMENTA] Notificación aparte creada para usuario ID: ${usuarioId}`);
                }
              } catch (error) {
                console.error(`❌ [ASISTENCIA] Error creando notificación para usuario ${usuarioId}:`, error);
              }
            }
            
            console.log(`✅ [ASISTENCIA] ${todosUsuarioIds.length} notificaciones creadas en BD (apoderados + docentes-apoderados) para tipo_registro: ${tipo_registro}`);
            console.log(`📋 [ASISTENCIA] Usuarios que recibirán notificación:`, todosUsuarioIds);
          } catch (error) {
            console.error(`❌ [ASISTENCIA] Error creando notificaciones en BD para apoderados (tipo_registro: ${tipo_registro}):`, error);
          }
        } else {
          console.log(`⚠️ [ASISTENCIA] No se encontraron apoderados para crear notificaciones (tipo_registro: ${tipo_registro})`);
        }

        // Una sola ejecución por escaneo: solo ENTRADA envía correo a apoderados; SALIDA y todo lo demás solo push.
        setImmediate(async () => {
          // 1) Correos: SOLO en ENTRADA de alumnos (no en SALIDA; ~500 alumnos = no superar límite Gmail)
          if (tipo_registro === 'ENTRADA' && isEmailEnvioHabilitado()) {
            try {
              const apoderadosConEmail = (apoderados || []).filter(ap => ap && ap.email && String(ap.email).trim());
              if (apoderadosConEmail.length > 0) {
                console.log(`📧 [ASISTENCIA] Enviando correos (solo ENTRADA) a ${apoderadosConEmail.length} apoderado(s)...`);
                const promesasCorreos = apoderadosConEmail.map(async (apoderado) => {
                const email = String(apoderado.email).trim();
                try {
                  const resultadoCorreo = await enviarCorreoAsistencia(email, {
                    nombreAlumno: datosUsuario.nombre_completo,
                    hora: horaFormateada,
                    fecha: fechaFormateada,
                    tipo: tipo_registro,
                    colegioNombre,
                    esDocente: false,
                    tipoAsistencia: tipo_registro === 'ENTRADA' ? tipoAsistenciaParaNotificacion : null,
                    descuentosPresentacion: []
                  });
                  if (avisoVestimenta) {
                    try {
                      await enviarCorreoHtml(
                        email,
                        avisoVestimenta.titulo,
                        htmlCorreoVestimenta({
                          nombreAlumno: datosUsuario.nombre_completo,
                          fecha: fechaFormateada,
                          hora: horaFormateada,
                          colegioNombre,
                          mensaje: avisoVestimenta.contenido,
                        }),
                        colegioNombre,
                        'ASISTENCIA'
                      );
                      console.log(`✅ [VESTIMENTA] Correo aparte enviado a ${email}`);
                    } catch (errV) {
                      console.error(`❌ [VESTIMENTA] Correo a ${email}:`, errV.message);
                    }
                  }
                  if (resultadoCorreo.success) {
                    console.log(`✅ [ASISTENCIA] Correo enviado a ${email}`);
                    return { ok: true, email };
                  }
                  if (resultadoCorreo.skipped) {
                    return { ok: false, email, skipped: true };
                  }
                  console.error(`❌ [ASISTENCIA] Correo fallido a ${email}:`, resultadoCorreo.error);
                  return { ok: false, email, error: resultadoCorreo.error };
                } catch (error) {
                  console.error(`❌ [ASISTENCIA] Excepción enviando a ${email}:`, error.message);
                  return { ok: false, email, error: error.message };
                }
              });
              const resultados = await Promise.all(promesasCorreos);
              const enviados = resultados.filter(r => r.ok).length;
              const fallidos = resultados.filter(r => !r.ok && !r.skipped).length;
              console.log(`📧 [ASISTENCIA] Correos: ${enviados} enviados, ${fallidos} fallidos`);
              } else {
                console.log(`⚠️ [ASISTENCIA] No hay apoderados con email válido (total: ${(apoderados || []).length})`);
              }
            } catch (error) {
              console.error(`❌ [ASISTENCIA] Error en envío de correos (push se enviará igual):`, error.message);
            }
          } else if (tipo_registro === 'SALIDA') {
            console.log(`📧 [ASISTENCIA] SALIDA: solo notificaciones push (sin correo)`);
          }

          // 2) Push: siempre intentar (ENTRADA y SALIDA)
          try {
            if (subscriptions && subscriptions.length > 0) {
              console.log(`📱 [ASISTENCIA] Enviando ${subscriptions.length} notificación(es) push...`);
              const pushItemsAsist = subscriptions.map((sub) => {
                const uid = parseInt(sub.usuario_id, 10);
                const tipoD = tipoPorUsuarioAsistenciaPush.get(uid) || 'APODERADO';
                const url = urlPortalHijoPorTipoUsuario(tipoD, datosUsuario.id);
                return {
                  subscription: { endpoint: sub.endpoint, keys: sub.keys },
                  payload: {
                    title: tituloNotificacion,
                    body: mensajeNotificacion,
                    icon: '/icons/icon-192x192.png',
                    badge: '/icons/icon-192x192.png',
                    vibrate: [200, 100, 200],
                    tag: `asistencia-${tipo_registro}-${datosUsuario.id}`,
                    data: {
                      url,
                      tipo: 'asistencia',
                      alumno_id: datosUsuario.id
                    }
                  }
                };
              });
              enviarPushNotificacionesIndividuales(pushItemsAsist)
                .then(async (resultadosPush) => {
                  const exitosas = resultadosPush.filter(r => r.resultado && r.resultado.success).length;
                  const fallidas = resultadosPush.filter(r => !r.resultado || !r.resultado.success).length;
                  console.log(`✅ [ASISTENCIA] Push: ${exitosas} exitosas, ${fallidas} fallidas`);
                  if (fallidas > 0) {
                    console.log(`❌ [ASISTENCIA] Errores push:`, resultadosPush.filter(r => !r.resultado || !r.resultado.success).map(r => r.resultado?.error || 'Error desconocido'));
                  }
                  // Marcar suscripciones expiradas (410/404) como inactivas para no seguir intentando
                  const expiradas = resultadosPush.filter(r => r.resultado && r.resultado.expired && r.subscription && r.subscription.endpoint);
                  if (expiradas.length > 0) {
                    try {
                      for (const { subscription } of expiradas) {
                        await execute('UPDATE push_subscriptions SET activo = 0 WHERE endpoint = ?', [subscription.endpoint]);
                      }
                      console.log(`📱 [ASISTENCIA] ${expiradas.length} suscripción(es) marcadas como inactivas (expiradas)`);
                    } catch (e) {
                      console.error(`❌ [ASISTENCIA] Error marcando suscripciones inactivas:`, e.message);
                    }
                  }

                  if (avisoVestimenta && subscriptions.length > 0) {
                    const pushItemsVest = subscriptions.map((sub) => {
                      const uid = parseInt(sub.usuario_id, 10);
                      const tipoD = tipoPorUsuarioAsistenciaPush.get(uid) || 'APODERADO';
                      const url = urlPortalHijoPorTipoUsuario(tipoD, datosUsuario.id);
                      return {
                        subscription: { endpoint: sub.endpoint, keys: sub.keys },
                        payload: {
                          title: avisoVestimenta.titulo,
                          body: avisoVestimenta.contenido,
                          icon: '/icons/icon-192x192.png',
                          badge: '/icons/icon-192x192.png',
                          vibrate: [200, 100, 200, 100, 200],
                          tag: `vestimenta-${datosUsuario.id}-${fechaHoy}`,
                          data: {
                            url,
                            tipo: 'presentacion_vestimenta',
                            alumno_id: datosUsuario.id,
                          },
                        },
                      };
                    });
                    try {
                      const rV = await enviarPushNotificacionesIndividuales(pushItemsVest);
                      const okV = rV.filter((r) => r.resultado && r.resultado.success).length;
                      console.log(`✅ [VESTIMENTA] Push aparte: ${okV}/${rV.length}`);
                    } catch (ePushV) {
                      console.error('❌ [VESTIMENTA] Push:', ePushV.message);
                    }
                  }
                })
                .catch(err => console.error(`❌ [ASISTENCIA] Error envío push:`, err));
            } else {
              console.log(`⚠️ [ASISTENCIA] No hay suscripciones push activas`);
            }
          } catch (error) {
            console.error(`❌ [ASISTENCIA] Error preparando push:`, error.message);
          }
        });
      } catch (error) {
        console.error(`❌ [ASISTENCIA] Error preparando notificaciones de ALUMNO:`, error);
        // No fallar el registro si fallan las notificaciones
      }
    }
    
    // ========== NOTIFICACIONES PARA DOCENTE ==========
    if (tipo_usuario === 'DOCENTE' && datosUsuario) {
      console.log(`📧 [ASISTENCIA] Iniciando proceso de notificaciones para docente: ${datosUsuario.nombre_completo}`);
      try {
        // Obtener suscripciones push del docente
        const subscriptionsDocente = await query(
          `SELECT endpoint, p256dh, auth 
           FROM push_subscriptions 
           WHERE usuario_id = ? 
             AND colegio_id = ? AND (activo = 1 OR activo IS NULL)`,
          [usuario_id, colegio_id]
        );
        
        const subscriptions = subscriptionsDocente.map(sub => ({
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth
          }
        }));
        
        console.log(`📱 [ASISTENCIA] Encontradas ${subscriptions.length} suscripciones push para el docente`);

        // Preparar payload de notificación para DOCENTE
        const mensajeConfigDocente = mensajesConfig.docente[tipo_registro.toLowerCase()];
        const tituloNotificacionDocente = mensajeConfigDocente.titulo;
        const mensajeNotificacionDocente = mensajeConfigDocente.mensaje_corto
          .replace('{hora}', horaFormateada)
          .replace('{fecha}', fechaFormateada);

        // Crear notificación en la BD para el docente
        try {
          await insertNotificacionUsuario(execute, {
            usuario_id: asistencia_usuario_id,
            destinatario_id: usuario_id,
            asunto: tituloNotificacionDocente,
            contenido: mensajeNotificacionDocente,
            estado: 'ENVIADO',
            accion_tipo: 'asistencia_docente',
            accion_payload: { tipo_registro, personal_id: datosUsuario.id },
            url_destino: '/docente/dashboard'
          });
          console.log(`✅ [ASISTENCIA] Notificación creada en BD para docente ID: ${usuario_id}`);
        } catch (error) {
          console.error(`❌ [ASISTENCIA] Error creando notificación en BD para docente:`, error);
        }

        const payloadPushDocente = {
          title: tituloNotificacionDocente,
          body: mensajeNotificacionDocente,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-192x192.png',
          vibrate: [200, 100, 200],
          tag: `asistencia-docente-${tipo_registro}-${datosUsuario.id}`,
          data: {
            url: '/docente/dashboard',
            tipo: 'asistencia_docente',
            docente_id: datosUsuario.id
          }
        };

        // Asistencia personal/docente: solo notificaciones push (sin correo)
        setImmediate(async () => {
          try {
            // Enviar push notifications al docente
            if (subscriptions.length > 0) {
              console.log(`📱 [ASISTENCIA] Enviando ${subscriptions.length} notificaciones push al docente (asíncrono)...`);
              console.log(`📱 [ASISTENCIA] Payload docente:`, JSON.stringify(payloadPushDocente, null, 2));
              
              // No esperar a que terminen, solo iniciar el proceso
              const pushItemsDoc = subscriptions.map((sub) => ({
                subscription: { endpoint: sub.endpoint, keys: sub.keys },
                payload: payloadPushDocente
              }));
              enviarPushNotificacionesIndividuales(pushItemsDoc)
                .then(resultadosPush => {
                  const exitosas = resultadosPush.filter(r => r.resultado && r.resultado.success).length;
                  const fallidas = resultadosPush.filter(r => !r.resultado || !r.resultado.success).length;
                  console.log(`✅ [ASISTENCIA] Push notifications docente: ${exitosas} exitosas, ${fallidas} fallidas`);
                  if (fallidas > 0) {
                    console.log(`❌ [ASISTENCIA] Errores en push notifications docente:`, 
                      resultadosPush.filter(r => !r.resultado || !r.resultado.success).map(r => r.resultado?.error || 'Error desconocido')
                    );
                  }
                })
                .catch(err => {
                  console.error(`❌ [ASISTENCIA] Error en envío de push notifications docente:`, err);
                });
            } else {
              console.log(`⚠️ [ASISTENCIA] No hay suscripciones push activas para el docente`);
            }
          } catch (error) {
            console.error(`❌ [ASISTENCIA] Error en bloque de notificaciones docente (asíncrono):`, error);
            console.error(`❌ [ASISTENCIA] Stack trace:`, error.stack);
          }
        });
      } catch (error) {
        console.error(`❌ [ASISTENCIA] Error preparando notificaciones de DOCENTE:`, error);
        // No fallar el registro si fallan las notificaciones
      }
    }
    
    // Si no es ALUMNO ni DOCENTE, no enviar notificaciones
    if (tipo_usuario !== 'ALUMNO' && tipo_usuario !== 'DOCENTE') {
      console.log(`⚠️ [ASISTENCIA] No se enviarán notificaciones: tipo_usuario=${tipo_usuario}, datosUsuario=${datosUsuario ? 'existe' : 'null'}`);
    }

    // Descuentos por presentación escolar (solo alumnos, solo al registrar ENTRADA nueva vinculada a un id de asistencia)
    if (
      tipo_usuario === 'ALUMNO' &&
      tipo_registro === 'ENTRADA' &&
      descuentosPresentacion.length > 0 &&
      resultado &&
      resultado.tipo === 'ENTRADA' &&
      resultado.id
    ) {
      try {
        // Espejo en incidencias (mismo control de conducta) — sin segunda notificación
        let matriculaIdEspejo = null;
        let anioGrupoEspejo = anio_activo;
        let workerIdEspejo = 0;
        try {
          const matRows = await query(
            `SELECT m.id AS matricula_id, g.anio AS anio_grupo
             FROM usuarios u
             INNER JOIN matriculas m ON m.alumno_id = u.alumno_id AND m.colegio_id = u.colegio_id AND (m.estado = 0)
             INNER JOIN grupos g ON g.id = m.grupo_id AND g.anio = ?
             WHERE u.id = ? AND u.colegio_id = ?
             ORDER BY m.id DESC LIMIT 1`,
            [anio_activo, usuario_id, colegio_id]
          );
          if (matRows?.length) {
            matriculaIdEspejo = matRows[0].matricula_id;
            anioGrupoEspejo = matRows[0].anio_grupo || anio_activo;
          }
          const w = await query(
            `SELECT personal_id FROM usuarios WHERE id = ? LIMIT 1`,
            [asistencia_usuario_id]
          );
          workerIdEspejo = w?.[0]?.personal_id || 0;
        } catch (_) {
          /* ignore */
        }

        for (const motivo of descuentosPresentacion) {
          const ins = await execute(
            `INSERT INTO presentacion_escolar_descuentos
             (colegio_id, anio, alumno_usuario_id, asistencia_registro_id, motivo, puntos, fecha, hora, registrado_por_usuario_id, created_at)
             VALUES (?, ?, ?, ?, ?, -1, ?, ?, ?, NOW())`,
            [
              colegio_id,
              anio_activo,
              usuario_id,
              resultado.id,
              motivo,
              fechaHoy,
              horaActual,
              asistencia_usuario_id
            ]
          );
          if (matriculaIdEspejo) {
            try {
              await asegurarIncidenciaVestimenta(query, execute, {
                matriculaId: matriculaIdEspejo,
              workerId: workerIdEspejo || null,
                fechaYmd: fechaHoy,
                hora: horaActual,
                motivo,
                descuentoId: ins.insertId,
              });
            } catch (errOne) {
              console.error('❌ [ASISTENCIA] Espejo incidencia vestimenta:', errOne.message);
            }
          }
        }
        console.log(
          `✅ [ASISTENCIA] Registrados ${descuentosPresentacion.length} descuento(s) presentación escolar para usuario ${usuario_id}`
        );

        if (matriculaIdEspejo) {
          try {
            const rangos = await fetchRangosCiclosParsed(query, colegio_id);
            const ciclo = cicloQueContieneFecha(rangos, anioGrupoEspejo, fechaHoy);
            await sincronizarConductaMatriculaBimestre(query, execute, {
              matriculaId: matriculaIdEspejo,
              colegio_id,
              anioEscolar: anioGrupoEspejo,
              ciclo,
            });
          } catch (errSync) {
            console.error('❌ [ASISTENCIA] Sync conducta vestimenta:', errSync.message);
          }
        }
      } catch (errDesc) {
        console.error('❌ [ASISTENCIA] Error guardando descuentos presentación escolar:', errDesc);
      }
    }

    // Responder INMEDIATAMENTE sin esperar las notificaciones
    res.json({
      success: true,
      registro: resultado,
      usuario: datosUsuario,
      mensaje: tipo_registro === 'ENTRADA' 
        ? `Entrada registrada a las ${horaActual}`
        : `Salida registrada a las ${horaActual}`
    });
  } catch (error) {
    console.error('Error registrando asistencia:', error);
    res.status(500).json({ error: 'Error al registrar asistencia' });
  }
});

/**
 * POST /api/asistencia/buscar
 * Buscar usuario manualmente (DNI, nombres, apellidos)
 */
router.post('/buscar', async (req, res) => {
  try {
    const { busqueda } = req.body;
    const { colegio_id } = req.user;

    if (!busqueda || busqueda.trim().length < 2) {
      return res.status(400).json({ error: 'Búsqueda debe tener al menos 2 caracteres' });
    }

    const terminoBusqueda = `%${busqueda.trim()}%`;

    // Buscar en alumnos
    const alumnos = await query(
      `SELECT DISTINCT u.id, u.tipo, a.id as alumno_id, a.nombres, a.apellido_paterno, a.apellido_materno,
              a.nro_documento, CONCAT(a.nombres, ' ', a.apellido_paterno, ' ', a.apellido_materno) as nombre_completo
       FROM usuarios u
       INNER JOIN alumnos a ON a.id = u.alumno_id
       WHERE u.colegio_id = ? AND u.estado = 'ACTIVO'
         AND (
           a.nro_documento LIKE ? OR
           a.nombres LIKE ? OR
           a.apellido_paterno LIKE ? OR
           a.apellido_materno LIKE ? OR
           CONCAT(a.nombres, ' ', a.apellido_paterno, ' ', a.apellido_materno) LIKE ?
         )
       LIMIT 10`,
      [colegio_id, terminoBusqueda, terminoBusqueda, terminoBusqueda, terminoBusqueda, terminoBusqueda]
    );

    // Buscar en docentes
    const docentes = await query(
      `SELECT DISTINCT u.id, u.tipo, p.id as personal_id, p.nombres, p.apellidos,
              u.usuario as nro_documento, CONCAT(p.nombres, ' ', p.apellidos) as nombre_completo
       FROM usuarios u
       INNER JOIN personal p ON p.id = u.personal_id
       WHERE u.colegio_id = ? AND u.estado = 'ACTIVO'
         AND (
           u.usuario LIKE ? OR
           p.nombres LIKE ? OR
           p.apellidos LIKE ? OR
           CONCAT(p.nombres, ' ', p.apellidos) LIKE ?
         )
       LIMIT 10`,
      [colegio_id, terminoBusqueda, terminoBusqueda, terminoBusqueda, terminoBusqueda]
    );

    const resultados = [
      ...alumnos.map(a => ({
        usuario_id: a.id,
        tipo: 'ALUMNO',
        nombres: a.nombres,
        apellidos: `${a.apellido_paterno || ''} ${a.apellido_materno || ''}`.trim(),
        nombre_completo: a.nombre_completo,
        nro_documento: a.nro_documento
      })),
      ...docentes.map(d => ({
        usuario_id: d.id,
        tipo: 'DOCENTE',
        nombres: d.nombres,
        apellidos: d.apellidos || '',
        nombre_completo: d.nombre_completo,
        nro_documento: d.nro_documento
      }))
    ];

    res.json({
      success: true,
      resultados: resultados.slice(0, 10) // Máximo 10 resultados
    });
  } catch (error) {
    console.error('Error buscando usuario:', error);
    res.status(500).json({ error: 'Error al buscar usuario' });
  }
});

module.exports = router;

