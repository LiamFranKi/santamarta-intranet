const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { query, getAnioActivo } = require('../utils/mysql');
const { getColegioData } = require('../utils/colegio');
const { registrarAccion } = require('../utils/auditoria');
const { authenticateToken } = require('../middleware/auth');

/**
 * POST /api/auth/login
 * Login con DNI y password
 */
router.post('/login', async (req, res) => {
  try {
    const { usuario, password } = req.body;

    if (!usuario || !password) {
      return res.status(400).json({ 
        error: 'Usuario y contraseña son requeridos' 
      });
    }

    // Buscar usuario en MySQL
    // Estructura real según vanguard_intranet_2.sql:
    // - alumnos: apellido_paterno, apellido_materno, nombres
    // - personal: nombres, apellidos (un solo campo)
    const usuarios = await query(
      `SELECT u.*, 
              a.nombres as alumno_nombres, 
              a.apellido_paterno as alumno_apellido_paterno,
              a.apellido_materno as alumno_apellido_materno,
              p.nombres as personal_nombres,
              p.apellidos as personal_apellidos,
              p.foto as personal_foto
       FROM usuarios u
       LEFT JOIN alumnos a ON a.id = u.alumno_id
       LEFT JOIN personal p ON p.id = u.personal_id
       WHERE u.usuario = ? AND u.estado = 'ACTIVO'`,
      [usuario]
    );

    if (usuarios.length === 0) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    const usuarioDB = usuarios[0];

    // Validar password (SHA1 como en PHP)
    const passwordHash = crypto.createHash('sha1').update(password).digest('hex');
    
    if (usuarioDB.password !== passwordHash) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    // Obtener año activo
    const anioActivo = await getAnioActivo(usuarioDB.colegio_id);
    if (!anioActivo) {
      return res.status(500).json({ 
        error: 'No se pudo obtener el año activo del colegio' 
      });
    }

    // Verificar deudas (si aplica)
    const tieneDeudas = await verificarDeudas(usuarioDB, anioActivo);
    
    if (tieneDeudas) {
      return res.status(403).json({ 
        error: 'Acceso bloqueado por deudas pendientes',
        tieneDeudas: true
      });
    }

    // Obtener datos del colegio
    const colegioData = await getColegioData(usuarioDB.colegio_id);

    // Generar token JWT
    const token = jwt.sign(
      {
        usuario_id: usuarioDB.id,
        colegio_id: usuarioDB.colegio_id,
        tipo: usuarioDB.tipo,
        alumno_id: usuarioDB.alumno_id,
        personal_id: usuarioDB.personal_id,
        apoderado_id: usuarioDB.apoderado_id,
        anio_activo: anioActivo
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    // Preparar datos del usuario para el frontend
    // Mapear nombres y apellidos según la estructura real de la base de datos
    let nombres = '';
    let apellidos = '';
    
    // Si es alumno: tiene apellido_paterno, apellido_materno separados
    if (usuarioDB.alumno_id && usuarioDB.alumno_nombres) {
      nombres = usuarioDB.alumno_nombres || '';
      apellidos = (usuarioDB.alumno_apellido_paterno || '') + 
                  (usuarioDB.alumno_apellido_materno ? ' ' + usuarioDB.alumno_apellido_materno : '');
    } 
    // Si es personal/docente: tiene apellidos (un solo campo)
    else if (usuarioDB.personal_id && usuarioDB.personal_nombres) {
      nombres = usuarioDB.personal_nombres || '';
      apellidos = usuarioDB.personal_apellidos || '';
    }
    
    // Construir URL de la foto según el entorno (igual que en /docente/perfil y /alumno/perfil)
    let fotoUrl = null;
    let fotoNombre = null;
    
    // Obtener foto según el tipo de usuario
    if (usuarioDB.alumno_id) {
      // Es alumno: obtener foto de la tabla alumnos
      const alumnos = await query(
        `SELECT foto FROM alumnos WHERE id = ?`,
        [usuarioDB.alumno_id]
      );
      if (alumnos.length > 0 && alumnos[0].foto) {
        fotoNombre = alumnos[0].foto;
      }
    } else if (usuarioDB.personal_id && usuarioDB.personal_foto) {
      // Es personal/docente
      fotoNombre = usuarioDB.personal_foto;
    }
    
    if (fotoNombre && fotoNombre !== '') {
      const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://nuevo.vanguardschools.edu.pe';
      const isProduction = process.env.NODE_ENV === 'production';
      if (isProduction) {
        // En producción: usar la URL completa del servidor PHP
        fotoUrl = `${phpSystemUrl}/Static/Image/Fotos/${fotoNombre}`;
      } else {
        // En desarrollo: usar la ruta local de Node.js
        fotoUrl = `http://localhost:5000/Static/Image/Fotos/${fotoNombre}`;
      }
    }
    
    const userData = {
      id: usuarioDB.id,
      usuario: usuarioDB.usuario,
      tipo: usuarioDB.tipo,
      colegio_id: usuarioDB.colegio_id,
      anio_activo: anioActivo,
      nombres: nombres.trim() || usuarioDB.usuario,
      apellidos: apellidos.trim(),
      foto: fotoUrl, // URL completa en lugar de solo el nombre
      foto_nombre: fotoNombre || null, // Nombre del archivo para referencia
      colegio: colegioData
    };

    // Registrar login exitoso en auditoría
    registrarAccion({
      usuario_id: usuarioDB.id,
      colegio_id: usuarioDB.colegio_id,
      tipo_usuario: usuarioDB.tipo,
      accion: 'LOGIN',
      modulo: 'AUTENTICACION',
      descripcion: 'Inicio de sesión exitoso',
      url: req.originalUrl,
      metodo_http: 'POST',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      resultado: 'EXITOSO',
    }).catch(err => console.error('Error registrando login:', err));

    res.json({
      success: true,
      token,
      user: userData
    });

  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * GET /api/auth/me
 * Obtener información del usuario autenticado
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    // El middleware authenticateToken ya agregó req.user
    const { usuario_id, colegio_id, anio_activo } = req.user;

    // Obtener datos actualizados del usuario
    // Estructura real según vanguard_intranet_2.sql:
    // - alumnos: apellido_paterno, apellido_materno, nombres
    // - personal: nombres, apellidos (un solo campo)
    const usuarios = await query(
      `SELECT u.*, 
              a.nombres as alumno_nombres, 
              a.apellido_paterno as alumno_apellido_paterno,
              a.apellido_materno as alumno_apellido_materno,
              p.nombres as personal_nombres,
              p.apellidos as personal_apellidos,
              p.foto as personal_foto
       FROM usuarios u
       LEFT JOIN alumnos a ON a.id = u.alumno_id
       LEFT JOIN personal p ON p.id = u.personal_id
       WHERE u.id = ? AND u.estado = 'ACTIVO'`,
      [usuario_id]
    );

    if (usuarios.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const usuarioDB = usuarios[0];
    const colegioData = await getColegioData(colegio_id);

    // Mapear nombres y apellidos según la estructura real de la base de datos
    let nombres = '';
    let apellidos = '';
    
    // Si es alumno: tiene apellido_paterno, apellido_materno separados
    if (usuarioDB.alumno_id && usuarioDB.alumno_nombres) {
      nombres = usuarioDB.alumno_nombres || '';
      apellidos = (usuarioDB.alumno_apellido_paterno || '') + 
                  (usuarioDB.alumno_apellido_materno ? ' ' + usuarioDB.alumno_apellido_materno : '');
    } 
    // Si es personal/docente: tiene apellidos (un solo campo)
    else if (usuarioDB.personal_id && usuarioDB.personal_nombres) {
      nombres = usuarioDB.personal_nombres || '';
      apellidos = usuarioDB.personal_apellidos || '';
    }

    // Construir URL de la foto según el entorno (igual que en /docente/perfil y /alumno/perfil)
    let fotoUrl = null;
    let fotoNombre = null;
    
    // Obtener foto según el tipo de usuario
    if (usuarioDB.alumno_id) {
      // Es alumno: obtener foto de la tabla alumnos
      const alumnos = await query(
        `SELECT foto FROM alumnos WHERE id = ?`,
        [usuarioDB.alumno_id]
      );
      if (alumnos.length > 0 && alumnos[0].foto) {
        fotoNombre = alumnos[0].foto;
      }
    } else if (usuarioDB.personal_id && usuarioDB.personal_foto) {
      // Es personal/docente
      fotoNombre = usuarioDB.personal_foto;
    }
    
    if (fotoNombre && fotoNombre !== '') {
      const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://nuevo.vanguardschools.edu.pe';
      const isProduction = process.env.NODE_ENV === 'production';
      if (isProduction) {
        // En producción: usar la URL completa del servidor PHP
        fotoUrl = `${phpSystemUrl}/Static/Image/Fotos/${fotoNombre}`;
      } else {
        // En desarrollo: usar la ruta local de Node.js
        fotoUrl = `http://localhost:5000/Static/Image/Fotos/${fotoNombre}`;
      }
    }

    const userData = {
      id: usuarioDB.id,
      usuario: usuarioDB.usuario,
      tipo: usuarioDB.tipo,
      colegio_id: usuarioDB.colegio_id,
      anio_activo: anio_activo,
      nombres: nombres.trim() || usuarioDB.usuario,
      apellidos: apellidos.trim(),
      foto: fotoUrl, // URL completa en lugar de solo el nombre
      foto_nombre: fotoNombre || null, // Nombre del archivo para referencia
      colegio: colegioData
    };

    res.json({ user: userData });

  } catch (error) {
    console.error('Error obteniendo usuario:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * Función auxiliar para verificar deudas
 * Considera: bloquear_deudores, dias_tolerancia, y fechas de vencimiento de pensiones
 */
async function verificarDeudas(usuario, anioActivo) {
  try {
    // Obtener configuración del colegio
    const colegios = await query(
      `SELECT bloquear_deudores, dias_tolerancia, pensiones_vencimiento, inicio_pensiones, anio_activo
       FROM colegios WHERE id = ?`,
      [usuario.colegio_id]
    );

    if (colegios.length === 0 || colegios[0].bloquear_deudores !== 'SI') {
      return false; // No bloquea deudores
    }

    // Verificar para ALUMNOS, APODERADOS y DOCENTES que también son APODERADOS
    if (usuario.tipo !== 'ALUMNO' && usuario.tipo !== 'APODERADO' && usuario.tipo !== 'DOCENTE') {
      return false;
    }

    const colegio = colegios[0];
    const diasTolerancia = colegio.dias_tolerancia || 0;
    
    // Deserializar pensiones_vencimiento (está en base64 + serialize de PHP)
    let vencimientosPensiones = {};
    if (colegio.pensiones_vencimiento && colegio.pensiones_vencimiento !== '') {
      try {
        const decoded = Buffer.from(colegio.pensiones_vencimiento, 'base64').toString('utf-8');
        
        // El formato serialize de PHP para arrays es: a:N:{i:key1;s:len:"value1";i:key2;s:len:"value2";}
        // Ejemplo: a:2:{i:1;s:5:"31-03";i:2;s:5:"30-04";}
        if (decoded.startsWith('a:')) {
          // Parsear formato serialize de PHP manualmente
          const regex = /i:(\d+);s:\d+:"([^"]+)"/g;
          let match;
          while ((match = regex.exec(decoded)) !== null) {
            const key = parseInt(match[1]);
            const value = match[2];
            vencimientosPensiones[key] = value;
          }
        } else {
          // Intentar como JSON (por si acaso)
          try {
            vencimientosPensiones = JSON.parse(decoded);
          } catch (e) {
            vencimientosPensiones = {};
          }
        }
      } catch (e) {
        console.warn('No se pudo deserializar pensiones_vencimiento:', e.message);
        vencimientosPensiones = {};
      }
    }

    // Calcular número de pensión que debería estar pagada (mes actual - 2)
    const currentMonth = new Date().getMonth() + 1; // 1-12
    const nroPago = currentMonth - 2; // Pensión que debería estar pagada

    if (nroPago <= 0) {
      return false; // Aún no hay pensiones vencidas
    }

    // Función auxiliar para calcular fecha de vencimiento
    const calcularFechaVencimiento = (nroPension, anio, inicioPensiones) => {
      let vencimiento = vencimientosPensiones[nroPension];
      
      if (!vencimiento) {
        // Si no hay configuración específica, usar el último día del mes correspondiente
        const mesPension = inicioPensiones + nroPension;
        const ultimoDia = new Date(anio, mesPension, 0).getDate();
        return `${ultimoDia}-${String(mesPension).padStart(2, '0')}-${anio}`;
      }

      // Parsear el formato de vencimiento (puede ser: "dd", "dd-mm", o "dd-mm-yyyy")
      const partes = String(vencimiento).split('-');
      
      if (partes.length === 1) {
        // Solo día: "31" -> se asume mes = inicio_pensiones + nroPension
        const mesPension = inicioPensiones + nroPension;
        return `${partes[0].padStart(2, '0')}-${String(mesPension).padStart(2, '0')}-${anio}`;
      } else if (partes.length === 2) {
        // Día-mes: "31-03" -> se asume año = anio
        return `${partes[0].padStart(2, '0')}-${partes[1].padStart(2, '0')}-${anio}`;
      } else {
        // Día-mes-año: "31-03-2025"
        return vencimiento;
      }
    };

    // Verificar deudas para ALUMNO
    if (usuario.tipo === 'ALUMNO') {
      // Obtener matrícula activa del alumno
      const matriculas = await query(
        `SELECT m.id, m.grupo_id, g.anio
         FROM matriculas m
         INNER JOIN grupos g ON g.id = m.grupo_id
         WHERE m.alumno_id = ? AND m.colegio_id = ? AND m.estado = 0 AND g.anio = ?
         LIMIT 1`,
        [usuario.alumno_id, usuario.colegio_id, anioActivo]
      );

      if (matriculas.length === 0) {
        return false; // No hay matrícula activa
      }

      const matricula = matriculas[0];
      const inicioPensiones = colegio.inicio_pensiones || 2; // Por defecto mes 2 (marzo)

      // Verificar cada pensión desde 1 hasta nroPago
      for (let i = 1; i <= nroPago; i++) {
        const fechaVencimientoStr = calcularFechaVencimiento(i, anioActivo, inicioPensiones);
        
        // Convertir dd-mm-yyyy a Date correctamente
        const partesFecha = fechaVencimientoStr.split('-');
        const fechaVencimiento = new Date(
          parseInt(partesFecha[2]), // año
          parseInt(partesFecha[1]) - 1, // mes (0-indexed)
          parseInt(partesFecha[0]) // día
        );
        
        // Aplicar días de tolerancia
        const fechaLimite = new Date(fechaVencimiento);
        fechaLimite.setDate(fechaLimite.getDate() + diasTolerancia);
        
        const fechaActual = new Date();
        fechaActual.setHours(0, 0, 0, 0);
        fechaLimite.setHours(23, 59, 59, 999);

        // Debug logging
        console.log(`[VERIFICAR DEUDAS] Pensión ${i}:`);
        console.log(`  Fecha vencimiento configurada: ${fechaVencimientoStr}`);
        console.log(`  Fecha vencimiento Date: ${fechaVencimiento.toISOString()}`);
        console.log(`  Días tolerancia: ${diasTolerancia}`);
        console.log(`  Fecha límite (vencimiento + tolerancia): ${fechaLimite.toISOString()}`);
        console.log(`  Fecha actual: ${fechaActual.toISOString()}`);
        console.log(`  ¿Fecha actual > fecha límite?: ${fechaActual > fechaLimite}`);

        // Verificar si la fecha actual supera el límite (vencimiento + tolerancia)
        if (fechaActual > fechaLimite) {
          // Verificar si NO tiene pago cancelado para esta pensión
          const pagosCancelados = await query(
            `SELECT COUNT(*) as total
             FROM pagos p
             WHERE p.matricula_id = ?
               AND p.tipo = 1
               AND p.nro_pago = ?
               AND p.estado_pago = 'CANCELADO'
               AND p.estado = 'ACTIVO'`,
            [matricula.id, i]
          );

          console.log(`  Pagos cancelados para pensión ${i}: ${pagosCancelados[0].total}`);

          if (pagosCancelados[0].total === 0) {
            // Tiene deuda: la pensión está vencida (considerando tolerancia) y no está cancelada
            console.log(`  ✅ DEUDA DETECTADA: Pensión ${i} vencida y sin pago cancelado`);
            return true;
          }
        }
      }

      return false; // No tiene deudas
    }

    // Verificar deudas para APODERADO (hijos)
    if (usuario.tipo === 'APODERADO') {
      // Obtener matrículas activas de los hijos
      const matriculasHijos = await query(
        `SELECT m.id, m.grupo_id, g.anio
         FROM matriculas m
         INNER JOIN alumnos a ON a.id = m.alumno_id
         INNER JOIN familias f ON f.alumno_id = a.id
         INNER JOIN grupos g ON g.id = m.grupo_id
         WHERE f.apoderado_id = ? AND m.colegio_id = ? AND m.estado = 0 AND g.anio = ?`,
        [usuario.apoderado_id, usuario.colegio_id, anioActivo]
      );

      if (matriculasHijos.length === 0) {
        return false; // No hay hijos con matrícula activa
      }

      const inicioPensiones = colegio.inicio_pensiones || 2;

      // Verificar deudas de cada hijo
      for (const matricula of matriculasHijos) {
        for (let i = 1; i <= nroPago; i++) {
          const fechaVencimientoStr = calcularFechaVencimiento(i, anioActivo, inicioPensiones);
          
          // Convertir dd-mm-yyyy a Date correctamente
          const partesFecha = fechaVencimientoStr.split('-');
          const fechaVencimiento = new Date(
            parseInt(partesFecha[2]), // año
            parseInt(partesFecha[1]) - 1, // mes (0-indexed)
            parseInt(partesFecha[0]) // día
          );
          
          const fechaLimite = new Date(fechaVencimiento);
          fechaLimite.setDate(fechaLimite.getDate() + diasTolerancia);
          
          const fechaActual = new Date();
          fechaActual.setHours(0, 0, 0, 0);
          fechaLimite.setHours(23, 59, 59, 999);

          if (fechaActual > fechaLimite) {
            const pagosCancelados = await query(
              `SELECT COUNT(*) as total
               FROM pagos p
               WHERE p.matricula_id = ?
                 AND p.tipo = 1
                 AND p.nro_pago = ?
                 AND p.estado_pago = 'CANCELADO'
                 AND p.estado = 'ACTIVO'`,
              [matricula.id, i]
            );

            if (pagosCancelados[0].total === 0) {
              return true; // Al menos un hijo tiene deuda
            }
          }
        }
      }

      return false; // Ningún hijo tiene deudas
    }

    // Verificar deudas para DOCENTE que también es APODERADO
    if (usuario.tipo === 'DOCENTE') {
      // Obtener DNI del docente desde la tabla personal
      const docenteData = await query(
        `SELECT p.nro_documento, p.id as personal_id
         FROM personal p
         INNER JOIN usuarios u ON u.personal_id = p.id
         WHERE u.id = ? AND u.colegio_id = ? AND u.estado = 'ACTIVO'
         LIMIT 1`,
        [usuario.id, usuario.colegio_id]
      );

      if (docenteData.length === 0) {
        return false; // No se encontró el docente
      }

      const docenteDni = docenteData[0].nro_documento;
      if (!docenteDni) {
        return false; // No tiene DNI registrado
      }

      // Buscar si el docente es apoderado (mismo DNI en tabla apoderados)
      const apoderadoData = await query(
        `SELECT ap.id as apoderado_id
         FROM apoderados ap
         WHERE ap.nro_documento = ? AND ap.colegio_id = ? AND ap.estado = 'ACTIVO'
         LIMIT 1`,
        [docenteDni, usuario.colegio_id]
      );

      if (apoderadoData.length === 0) {
        return false; // El docente no es apoderado
      }

      const apoderadoId = apoderadoData[0].apoderado_id;

      // Obtener matrículas activas de los hijos del docente-apoderado
      const matriculasHijos = await query(
        `SELECT m.id, m.grupo_id, g.anio
         FROM matriculas m
         INNER JOIN alumnos a ON a.id = m.alumno_id
         INNER JOIN familias f ON f.alumno_id = a.id
         INNER JOIN grupos g ON g.id = m.grupo_id
         WHERE f.apoderado_id = ? AND m.colegio_id = ? AND m.estado = 0 AND g.anio = ?`,
        [apoderadoId, usuario.colegio_id, anioActivo]
      );

      if (matriculasHijos.length === 0) {
        return false; // No hay hijos con matrícula activa
      }

      const inicioPensiones = colegio.inicio_pensiones || 2;

      // Verificar deudas de cada hijo
      for (const matricula of matriculasHijos) {
        for (let i = 1; i <= nroPago; i++) {
          const fechaVencimientoStr = calcularFechaVencimiento(i, anioActivo, inicioPensiones);
          
          // Convertir dd-mm-yyyy a Date correctamente
          const partesFecha = fechaVencimientoStr.split('-');
          const fechaVencimiento = new Date(
            parseInt(partesFecha[2]), // año
            parseInt(partesFecha[1]) - 1, // mes (0-indexed)
            parseInt(partesFecha[0]) // día
          );
          
          const fechaLimite = new Date(fechaVencimiento);
          fechaLimite.setDate(fechaLimite.getDate() + diasTolerancia);
          
          const fechaActual = new Date();
          fechaActual.setHours(0, 0, 0, 0);
          fechaLimite.setHours(23, 59, 59, 999);

          if (fechaActual > fechaLimite) {
            const pagosCancelados = await query(
              `SELECT COUNT(*) as total
               FROM pagos p
               WHERE p.matricula_id = ?
                 AND p.tipo = 1
                 AND p.nro_pago = ?
                 AND p.estado_pago = 'CANCELADO'
                 AND p.estado = 'ACTIVO'`,
              [matricula.id, i]
            );

            if (pagosCancelados[0].total === 0) {
              return true; // Al menos un hijo tiene deuda
            }
          }
        }
      }

      return false; // Ningún hijo tiene deudas
    }

    return false;
  } catch (error) {
    console.error('Error verificando deudas:', error);
    return false; // En caso de error, permitir acceso
  }
}

/**
 * GET /api/auth/verificar-deudas
 * Endpoint para verificar si el usuario actual tiene deudas bloqueadas
 */
router.get('/verificar-deudas', authenticateToken, async (req, res) => {
  try {
    const { user } = req;
    const anioActivo = req.user.anio_activo || new Date().getFullYear();
    
    const tieneDeudas = await verificarDeudas(user, anioActivo);
    
    res.json({
      tiene_deudas: tieneDeudas,
      bloqueado: tieneDeudas
    });
  } catch (error) {
    console.error('Error verificando deudas en endpoint:', error);
    res.status(500).json({ error: 'Error al verificar deudas', tiene_deudas: false, bloqueado: false });
  }
});

module.exports = router;

