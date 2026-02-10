const express = require('express');
const router = express.Router();
const { query, execute } = require('../utils/mysql');
const { authenticateToken } = require('../middleware/auth');
const moment = require('moment-timezone');
const { enviarCorreoAsistencia } = require('../services/emailService');
const { enviarPushNotificationMultiple } = require('../services/pushNotificationService');
const mensajesConfig = require('../config/mensajes.json');

// Todas las rutas requieren autenticación y ser ASISTENCIA o ADMINISTRADOR
router.use(authenticateToken);

router.use((req, res, next) => {
  if (req.user.tipo !== 'ASISTENCIA' && req.user.tipo !== 'ADMINISTRADOR') {
    return res.status(403).json({ error: 'Acceso denegado. Solo usuarios ASISTENCIA pueden acceder.' });
  }
  next();
});

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
    // Si no cumple estas condiciones, SIEMPRE es ENTRADA (incluso si ayer no se escaneó salida)
    let tipoRegistro = 'ENTRADA';
    if (asistenciaHoy.length > 0) {
      const registro = asistenciaHoy[0];
      // Verificar que el registro sea del día de HOY (no de ayer)
      const fechaRegistro = moment(registro.fecha).format('YYYY-MM-DD');
      if (fechaRegistro === fechaHoy && registro.hora_entrada && !registro.hora_salida) {
        tipoRegistro = 'SALIDA';
      }
      // Si el registro es de otro día, siempre es ENTRADA
    }

    res.json({
      success: true,
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
router.post('/registrar', async (req, res) => {
  try {
    const { usuario_id, tipo_usuario, tipo_registro } = req.body;
    const { colegio_id, anio_activo, usuario_id: asistencia_usuario_id } = req.user;

    if (!usuario_id || !tipo_usuario || !tipo_registro) {
      return res.status(400).json({ error: 'Datos incompletos' });
    }

    if (!['ENTRADA', 'SALIDA'].includes(tipo_registro)) {
      return res.status(400).json({ error: 'Tipo de registro inválido' });
    }

    const fechaHoy = moment().tz('America/Lima').format('YYYY-MM-DD');
    const horaActual = moment().tz('America/Lima').format('HH:mm:ss');

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
      console.log(`📧 [ASISTENCIA] Iniciando proceso de notificaciones para alumno: ${datosUsuario.nombre_completo}`);
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
              `SELECT endpoint, p256dh, auth 
               FROM push_subscriptions 
               WHERE usuario_id IN (${usuarioIds.map(() => '?').join(',')}) 
                 AND colegio_id = ? AND (activo = 1 OR activo IS NULL)`,
              [...usuarioIds, colegio_id]
            );
            
            subscriptions = subscriptionsData.map(sub => ({
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
        const mensajeConfig = mensajesConfig.asistencia[tipo_registro.toLowerCase()];
        const tituloNotificacion = mensajeConfig.titulo;
        const mensajeNotificacion = mensajeConfig.mensaje_corto
          .replace('{nombreAlumno}', datosUsuario.nombre_completo)
          .replace('{hora}', horaFormateada)
          .replace('{fecha}', fechaFormateada);

        const payloadPush = {
          title: tituloNotificacion,
          body: mensajeNotificacion,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-192x192.png',
          vibrate: [200, 100, 200],
          tag: `asistencia-${tipo_registro}-${datosUsuario.id}`,
          data: {
            url: '/alumno/dashboard',
            tipo: 'asistencia',
            alumno_id: datosUsuario.id
          }
        };

        // Enviar notificaciones de forma ASÍNCRONA (sin bloquear la respuesta)
        // Esto permite que el usuario reciba la respuesta inmediatamente
        setImmediate(async () => {
          try {
            // Enviar correos a apoderados en paralelo
            if (apoderados.length > 0) {
              console.log(`📧 [ASISTENCIA] Enviando correos a ${apoderados.length} apoderados (asíncrono)...`);
              const promesasCorreos = apoderados
                .filter(ap => ap.email)
                .map(async (apoderado) => {
                  try {
                    console.log(`📧 [ASISTENCIA] Enviando correo a: ${apoderado.email}`);
                    const resultadoCorreo = await enviarCorreoAsistencia(apoderado.email, {
                      nombreAlumno: datosUsuario.nombre_completo,
                      hora: horaFormateada,
                      fecha: fechaFormateada,
                      tipo: tipo_registro,
                      colegioNombre
                    });
                    if (resultadoCorreo.success) {
                      console.log(`✅ [ASISTENCIA] Correo enviado exitosamente a ${apoderado.email}`);
                    } else {
                      console.error(`❌ [ASISTENCIA] Error enviando correo a ${apoderado.email}:`, resultadoCorreo.error);
                    }
                  } catch (error) {
                    console.error(`❌ [ASISTENCIA] Excepción al enviar correo a ${apoderado.email}:`, error.message);
                  }
                });
              
              // No esperar a que terminen, solo iniciar el proceso
              Promise.all(promesasCorreos).catch(err => {
                console.error(`❌ [ASISTENCIA] Error en envío de correos:`, err);
              });
            } else {
              console.log(`⚠️ [ASISTENCIA] No se encontraron apoderados con email para este alumno`);
            }

            // Enviar push notifications en paralelo (ya optimizado en el servicio)
            if (subscriptions.length > 0) {
              console.log(`📱 [ASISTENCIA] Enviando ${subscriptions.length} notificaciones push (asíncrono)...`);
              console.log(`📱 [ASISTENCIA] Payload:`, JSON.stringify(payloadPush, null, 2));
              
              // No esperar a que terminen, solo iniciar el proceso
              enviarPushNotificationMultiple(subscriptions, payloadPush)
                .then(resultadosPush => {
                  const exitosas = resultadosPush.filter(r => r.resultado && r.resultado.success).length;
                  const fallidas = resultadosPush.filter(r => !r.resultado || !r.resultado.success).length;
                  console.log(`✅ [ASISTENCIA] Push notifications: ${exitosas} exitosas, ${fallidas} fallidas`);
                  if (fallidas > 0) {
                    console.log(`❌ [ASISTENCIA] Errores en push notifications:`, 
                      resultadosPush.filter(r => !r.resultado || !r.resultado.success).map(r => r.resultado?.error || 'Error desconocido')
                    );
                  }
                })
                .catch(err => {
                  console.error(`❌ [ASISTENCIA] Error en envío de push notifications:`, err);
                });
            } else {
              console.log(`⚠️ [ASISTENCIA] No hay suscripciones push activas para enviar notificaciones`);
            }
          } catch (error) {
            console.error(`❌ [ASISTENCIA] Error en bloque de notificaciones (asíncrono):`, error);
            console.error(`❌ [ASISTENCIA] Stack trace:`, error.stack);
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

        // Enviar notificaciones de forma ASÍNCRONA (sin bloquear la respuesta)
        setImmediate(async () => {
          try {
            // Enviar correo al docente si tiene email
            if (datosUsuario.email && datosUsuario.email.trim() !== '') {
              console.log(`📧 [ASISTENCIA] Enviando correo al docente: ${datosUsuario.email}`);
              enviarCorreoAsistencia(datosUsuario.email, {
                nombreAlumno: datosUsuario.nombre_completo, // Reutilizamos el campo para el nombre del docente
                hora: horaFormateada,
                fecha: fechaFormateada,
                tipo: tipo_registro,
                colegioNombre,
                esDocente: true // Indicar que es un correo para docente
              })
                .then(resultadoCorreo => {
                  if (resultadoCorreo.success) {
                    console.log(`✅ [ASISTENCIA] Correo enviado exitosamente al docente ${datosUsuario.email}`);
                  } else {
                    console.error(`❌ [ASISTENCIA] Error enviando correo al docente ${datosUsuario.email}:`, resultadoCorreo.error);
                  }
                })
                .catch(error => {
                  console.error(`❌ [ASISTENCIA] Excepción al enviar correo al docente ${datosUsuario.email}:`, error.message);
                });
            } else {
              console.log(`⚠️ [ASISTENCIA] Docente ${datosUsuario.nombre_completo} no tiene email configurado`);
            }

            // Enviar push notifications al docente
            if (subscriptions.length > 0) {
              console.log(`📱 [ASISTENCIA] Enviando ${subscriptions.length} notificaciones push al docente (asíncrono)...`);
              console.log(`📱 [ASISTENCIA] Payload docente:`, JSON.stringify(payloadPushDocente, null, 2));
              
              // No esperar a que terminen, solo iniciar el proceso
              enviarPushNotificationMultiple(subscriptions, payloadPushDocente)
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

