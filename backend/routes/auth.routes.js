const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const phpSerialize = require('php-serialize');
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
    // Validar que anioActivo esté definido
    if (!anioActivo || isNaN(anioActivo)) {
      console.error(`[VERIFICAR DEUDAS] anioActivo inválido: ${anioActivo}`);
      return false;
    }
    
    // Validar que usuario tenga los campos necesarios
    if (!usuario || !usuario.id || !usuario.colegio_id) {
      console.error(`[VERIFICAR DEUDAS] Usuario inválido:`, usuario);
      return false;
    }
    
    console.log(`[VERIFICAR DEUDAS] Iniciando verificación para usuario ID: ${usuario.id}, tipo: ${usuario.tipo}, colegio_id: ${usuario.colegio_id}, anioActivo: ${anioActivo}`);
    
    // Obtener configuración del colegio
    const colegios = await query(
      `SELECT bloquear_deudores, dias_tolerancia, pensiones_vencimiento, inicio_pensiones, anio_activo
       FROM colegios WHERE id = ?`,
      [usuario.colegio_id]
    );

    console.log(`[VERIFICAR DEUDAS] Configuración del colegio:`, {
      bloquear_deudores: colegios.length > 0 ? colegios[0].bloquear_deudores : 'NO ENCONTRADO',
      dias_tolerancia: colegios.length > 0 ? colegios[0].dias_tolerancia : null,
      inicio_pensiones: colegios.length > 0 ? colegios[0].inicio_pensiones : null
    });

    if (colegios.length === 0 || colegios[0].bloquear_deudores !== 'SI') {
      console.log(`[VERIFICAR DEUDAS] No se bloquea deudores - colegios.length: ${colegios.length}, bloquear_deudores: ${colegios.length > 0 ? colegios[0].bloquear_deudores : 'N/A'}`);
      return false; // No bloquea deudores
    }

    // Verificar para ALUMNOS, APODERADOS y DOCENTES que también son APODERADOS
    if (usuario.tipo !== 'ALUMNO' && usuario.tipo !== 'APODERADO' && usuario.tipo !== 'DOCENTE') {
      console.log(`[VERIFICAR DEUDAS] Tipo de usuario no aplica para verificación: ${usuario.tipo}`);
      return false;
    }
    
    console.log(`[VERIFICAR DEUDAS] Tipo de usuario válido: ${usuario.tipo}`);

    const colegio = colegios[0];
    const diasTolerancia = colegio.dias_tolerancia || 0;
    
    // Deserializar pensiones_vencimiento (está en base64 + serialize de PHP)
    let vencimientosPensiones = {};
    if (colegio.pensiones_vencimiento && colegio.pensiones_vencimiento !== '') {
      try {
        // Usar php-serialize igual que en admin.routes.js
        const deserialized = phpSerialize.unserialize(Buffer.from(colegio.pensiones_vencimiento, 'base64'));
        vencimientosPensiones = deserialized || {};
        console.log(`[VERIFICAR DEUDAS] pensiones_vencimiento deserializado:`, JSON.stringify(vencimientosPensiones, null, 2));
        console.log(`[VERIFICAR DEUDAS] Claves en vencimientosPensiones:`, Object.keys(vencimientosPensiones));
        console.log(`[VERIFICAR DEUDAS] Total pensiones configuradas:`, Object.keys(vencimientosPensiones).length);
      } catch (e) {
        console.warn('[VERIFICAR DEUDAS] No se pudo deserializar pensiones_vencimiento:', e.message);
        console.warn('[VERIFICAR DEUDAS] Stack:', e.stack);
        vencimientosPensiones = {};
      }
    } else {
      console.log(`[VERIFICAR DEUDAS] pensiones_vencimiento está vacío o no existe`);
    }

    // Calcular número de pensión que debería estar pagada
    // IMPORTANTE: La fórmula debe considerar inicio_pensiones
    // Si inicio_pensiones = 2 (Marzo), entonces:
    //   - nro_pago = 1 corresponde a Marzo (mes 3)
    //   - nro_pago = 2 corresponde a Abril (mes 4)
    // Fórmula: nroPago = currentMonth - inicio_pensiones
    // Ejemplo: Si estamos en Marzo (mes 3) e inicio_pensiones = 2:
    //   nroPago = 3 - 2 = 1 (debería verificar la pensión 1, que es Marzo)
    // Ejemplo: Si estamos en Febrero (mes 2) e inicio_pensiones = 2:
    //   nroPago = 2 - 2 = 0 (aún no hay pensiones vencidas)
    // NOTA: Aunque nroPago = 0, debemos verificar TODAS las pensiones configuradas
    // porque pueden tener fechas de vencimiento anteriores al mes actual
    const currentMonth = new Date().getMonth() + 1; // 1-12
    const inicioPensiones = colegio.inicio_pensiones || 2; // Por defecto 2 (Marzo)
    const nroPago = currentMonth - inicioPensiones; // Pensión que debería estar pagada

    console.log(`[VERIFICAR DEUDAS] Mes actual: ${currentMonth}, inicio_pensiones: ${inicioPensiones}, nroPago calculado: ${nroPago}, anioActivo: ${anioActivo}`);

    // NO retornar false si nroPago <= 0, porque las pensiones pueden tener fechas de vencimiento configuradas
    // que son anteriores al mes actual (ej: pensión de marzo con vencimiento 31-01)
    // En su lugar, verificaremos todas las pensiones que tengan configuración de vencimiento

    // Función auxiliar para calcular fecha de vencimiento
    // IMPORTANTE: Las claves en pensiones_vencimiento son:
    //   -1 = Matrícula
    //   1 = Primera pensión (Marzo si inicio_pensiones = 2)
    //   2 = Segunda pensión (Abril), etc.
    // Lógica del sistema anterior (Matricula.php línea 566-574):
    //   - Si vencimiento tiene 1 parte (solo día): fecha = "dd-(nroPension+2)-anio"
    //   - Si vencimiento tiene 2 partes (día-mes): fecha = "dd-mm-anio"
    //   - Si vencimiento tiene 3 partes (día-mes-año): fecha = "dd-mm-yyyy"
    const calcularFechaVencimiento = (nroPension, anio, inicioPensiones) => {
      let vencimiento = vencimientosPensiones[nroPension];
      
      console.log(`[VERIFICAR DEUDAS] calcularFechaVencimiento: nroPension=${nroPension}, vencimiento configurado="${vencimiento || 'NO'}"`);
      
      if (!vencimiento || vencimiento === '') {
        // Si no hay configuración específica, usar el último día del mes correspondiente
        // Fórmula del sistema anterior: mes = nroPension + 2 (pero esto parece incorrecto)
        // Mejor usar: mes = inicio_pensiones + nroPension - 1
        // Pero según el sistema anterior línea 569: mes = nroPension + 2
        const mesPension = nroPension + 2; // Según sistema anterior
        const ultimoDia = new Date(anio, mesPension, 0).getDate();
        const fechaCalculada = `${ultimoDia}-${String(mesPension).padStart(2, '0')}-${anio}`;
        console.log(`[VERIFICAR DEUDAS] No hay vencimiento configurado, usando último día del mes: ${fechaCalculada}`);
        return fechaCalculada;
      }

      // Parsear el formato de vencimiento (puede ser: "dd", "dd-mm", o "dd-mm-yyyy")
      const partes = String(vencimiento).trim().split('-');
      
      if (partes.length === 1) {
        // Solo día: "31" -> según sistema anterior: fecha = "dd-(nroPension+2)-anio"
        const mesPension = nroPension + 2; // Según sistema anterior línea 569
        const fechaCalculada = `${partes[0].padStart(2, '0')}-${String(mesPension).padStart(2, '0')}-${anio}`;
        console.log(`[VERIFICAR DEUDAS] Solo día configurado (${partes[0]}), fecha calculada: ${fechaCalculada}`);
        return fechaCalculada;
      } else if (partes.length === 2) {
        // Día-mes: "31-01" -> según sistema anterior: fecha = "dd-mm-anio"
        const fechaCalculada = `${partes[0].padStart(2, '0')}-${partes[1].padStart(2, '0')}-${anio}`;
        console.log(`[VERIFICAR DEUDAS] Día-mes configurado (${vencimiento}), fecha calculada: ${fechaCalculada}`);
        return fechaCalculada;
      } else {
        // Día-mes-año: puede ser "31-01-2026" o "31-01-20" (año con 2 dígitos)
        let añoFinal = partes[2];
        // Si el año tiene solo 2 dígitos, usar el año del contexto (anio) para evitar problemas
        // El sistema anterior guarda años con 2 dígitos, pero debemos usar el año activo
        if (añoFinal.length === 2) {
          // Usar el año del contexto (anio) en lugar de interpretar el año de 2 dígitos
          añoFinal = String(anio);
          console.log(`[VERIFICAR DEUDAS] Año de 2 dígitos detectado (${partes[2]}), usando año del contexto: ${añoFinal}`);
        }
        const fechaCalculada = `${partes[0].padStart(2, '0')}-${partes[1].padStart(2, '0')}-${añoFinal}`;
        console.log(`[VERIFICAR DEUDAS] Fecha completa configurada (${vencimiento}), fecha final: ${fechaCalculada}`);
        return fechaCalculada;
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

      // Verificar todas las pensiones que tengan configuración de vencimiento
      // O si nroPago > 0, verificar desde 1 hasta nroPago
      // Esto permite detectar pensiones con fechas de vencimiento anteriores al mes actual
      const pensionesAVerificar = nroPago > 0 
        ? Array.from({ length: nroPago }, (_, i) => i + 1)
        : Object.keys(vencimientosPensiones)
            .map(k => parseInt(k))
            .filter(k => k > 0 && !isNaN(k)); // Solo pensiones (excluir -1 que es matrícula)

      console.log(`[VERIFICAR DEUDAS] nroPago: ${nroPago}, vencimientosPensiones keys:`, Object.keys(vencimientosPensiones));
      console.log(`[VERIFICAR DEUDAS] pensionesAVerificar calculado (ALUMNO):`, pensionesAVerificar);
      console.log(`[VERIFICAR DEUDAS] Total pensiones a verificar (ALUMNO): ${pensionesAVerificar.length}`);

      if (pensionesAVerificar.length === 0) {
        console.log(`[VERIFICAR DEUDAS] ⚠️ No hay pensiones para verificar (ALUMNO)`);
        console.log(`[VERIFICAR DEUDAS] ⚠️ nroPago: ${nroPago}, vencimientosPensiones vacío: ${Object.keys(vencimientosPensiones).length === 0}`);
        return false;
      }

      // Verificar cada pensión
      for (const i of pensionesAVerificar) {
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

      // Verificar todas las pensiones que tengan configuración de vencimiento
      // O si nroPago > 0, verificar desde 1 hasta nroPago
      console.log(`[VERIFICAR DEUDAS] nroPago: ${nroPago}, vencimientosPensiones keys:`, Object.keys(vencimientosPensiones));
      const pensionesAVerificar = nroPago > 0 
        ? Array.from({ length: nroPago }, (_, i) => i + 1)
        : Object.keys(vencimientosPensiones)
            .map(k => parseInt(k))
            .filter(k => k > 0 && !isNaN(k)); // Solo pensiones (excluir -1 que es matrícula)

      console.log(`[VERIFICAR DEUDAS] pensionesAVerificar calculado (APODERADO):`, pensionesAVerificar);
      console.log(`[VERIFICAR DEUDAS] Total pensiones a verificar (APODERADO): ${pensionesAVerificar.length}`);

      if (pensionesAVerificar.length === 0) {
        console.log(`[VERIFICAR DEUDAS] ⚠️ No hay pensiones para verificar (APODERADO)`);
        console.log(`[VERIFICAR DEUDAS] ⚠️ nroPago: ${nroPago}, vencimientosPensiones vacío: ${Object.keys(vencimientosPensiones).length === 0}`);
        return false;
      }

      // Verificar deudas de cada hijo
      for (const matricula of matriculasHijos) {
        for (const i of pensionesAVerificar) {
          // Validar que i sea un número válido
          if (!i || isNaN(i) || i <= 0) {
            console.warn(`[VERIFICAR DEUDAS] Saltando pensión inválida: ${i}`);
            continue;
          }
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
      console.log(`[VERIFICAR DEUDAS] Verificando deudas para DOCENTE ID: ${usuario.id}`);
      
      // Obtener DNI del docente desde la tabla personal
      const docenteData = await query(
        `SELECT p.nro_documento, p.id as personal_id
         FROM personal p
         INNER JOIN usuarios u ON u.personal_id = p.id
         WHERE u.id = ? AND u.colegio_id = ? AND u.estado = 'ACTIVO'
         LIMIT 1`,
        [usuario.id, usuario.colegio_id]
      );

      console.log(`[VERIFICAR DEUDAS] Docente data encontrada: ${docenteData.length > 0 ? 'SÍ' : 'NO'}`);

      if (docenteData.length === 0) {
        console.log(`[VERIFICAR DEUDAS] No se encontró el docente en tabla personal`);
        return false; // No se encontró el docente
      }

      const docenteDni = docenteData[0].nro_documento;
      console.log(`[VERIFICAR DEUDAS] DNI del docente: ${docenteDni || 'NO TIENE'}`);
      
      if (!docenteDni) {
        console.log(`[VERIFICAR DEUDAS] Docente no tiene DNI registrado`);
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

      console.log(`[VERIFICAR DEUDAS] Apoderado encontrado con mismo DNI: ${apoderadoData.length > 0 ? 'SÍ' : 'NO'}`);

      if (apoderadoData.length === 0) {
        console.log(`[VERIFICAR DEUDAS] El docente no es apoderado (no hay registro en tabla apoderados con ese DNI)`);
        return false; // El docente no es apoderado
      }

      const apoderadoId = apoderadoData[0].apoderado_id;
      console.log(`[VERIFICAR DEUDAS] Apoderado ID encontrado: ${apoderadoId}`);

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

      console.log(`[VERIFICAR DEUDAS] Matrículas de hijos encontradas: ${matriculasHijos.length}`);

      if (matriculasHijos.length === 0) {
        console.log(`[VERIFICAR DEUDAS] No hay hijos con matrícula activa para el docente-apoderado`);
        return false; // No hay hijos con matrícula activa
      }

      const inicioPensiones = colegio.inicio_pensiones || 2;
      console.log(`[VERIFICAR DEUDAS] Inicio pensiones: ${inicioPensiones}, nroPago: ${nroPago}`);

      // Verificar todas las pensiones que tengan configuración de vencimiento
      // O si nroPago > 0, verificar desde 1 hasta nroPago
      console.log(`[VERIFICAR DEUDAS] nroPago: ${nroPago}, vencimientosPensiones keys:`, Object.keys(vencimientosPensiones));
      const pensionesAVerificar = nroPago > 0 
        ? Array.from({ length: nroPago }, (_, i) => i + 1)
        : Object.keys(vencimientosPensiones)
            .map(k => parseInt(k))
            .filter(k => k > 0 && !isNaN(k)); // Solo pensiones (excluir -1 que es matrícula)

      console.log(`[VERIFICAR DEUDAS] pensionesAVerificar calculado (DOCENTE/APODERADO):`, pensionesAVerificar);
      console.log(`[VERIFICAR DEUDAS] Total pensiones a verificar (DOCENTE/APODERADO): ${pensionesAVerificar.length}`);

      if (pensionesAVerificar.length === 0) {
        console.log(`[VERIFICAR DEUDAS] ⚠️ No hay pensiones para verificar (DOCENTE/APODERADO)`);
        console.log(`[VERIFICAR DEUDAS] ⚠️ nroPago: ${nroPago}, vencimientosPensiones vacío: ${Object.keys(vencimientosPensiones).length === 0}`);
        return false;
      }

      // Verificar deudas de cada hijo
      for (const matricula of matriculasHijos) {
        console.log(`[VERIFICAR DEUDAS] Verificando matrícula ID: ${matricula.id} del hijo (DOCENTE/APODERADO)`);
        for (const i of pensionesAVerificar) {
          // Validar que i sea un número válido
          if (!i || isNaN(i) || i <= 0) {
            console.warn(`[VERIFICAR DEUDAS] Saltando pensión inválida: ${i}`);
            continue;
          }
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

          console.log(`[VERIFICAR DEUDAS] Pensión ${i} (DOCENTE/APODERADO): fechaVencimiento=${fechaVencimientoStr}, fechaLimite=${fechaLimite.toISOString()}, fechaActual=${fechaActual.toISOString()}, ¿vencida?=${fechaActual > fechaLimite}`);

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

            console.log(`[VERIFICAR DEUDAS] Pensión ${i} (DOCENTE/APODERADO): pagos cancelados = ${pagosCancelados[0].total}`);

            if (pagosCancelados[0].total === 0) {
              console.log(`[VERIFICAR DEUDAS] ✅ DEUDA DETECTADA (DOCENTE/APODERADO): Pensión ${i} vencida y sin pago cancelado para matrícula ${matricula.id}`);
              return true; // Al menos un hijo tiene deuda
            }
          }
        }
      }

      console.log(`[VERIFICAR DEUDAS] Ningún hijo tiene deudas (DOCENTE/APODERADO)`);
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
    console.log(`[ENDPOINT VERIFICAR-DEUDAS] ========== INICIO ==========`);
    console.log(`[ENDPOINT VERIFICAR-DEUDAS] req.user completo:`, req.user);
    
    // El token JWT tiene 'usuario_id', no 'id'
    const user = {
      id: req.user.usuario_id || req.user.id, // Intentar ambos campos
      tipo: req.user.tipo,
      colegio_id: req.user.colegio_id,
      anio_activo: req.user.anio_activo,
      alumno_id: req.user.alumno_id,
      personal_id: req.user.personal_id,
      apoderado_id: req.user.apoderado_id
    };
    
    console.log(`[ENDPOINT VERIFICAR-DEUDAS] Usuario normalizado:`, user);
    console.log(`[ENDPOINT VERIFICAR-DEUDAS] Llamado por usuario ID: ${user.id}, tipo: ${user.tipo}`);
    
    const anioActivo = req.user.anio_activo || new Date().getFullYear();
    
    console.log(`[ENDPOINT VERIFICAR-DEUDAS] anioActivo: ${anioActivo}`);
    console.log(`[ENDPOINT VERIFICAR-DEUDAS] Llamando a verificarDeudas...`);
    
    const tieneDeudas = await verificarDeudas(user, anioActivo);
    
    console.log(`[ENDPOINT VERIFICAR-DEUDAS] ========== RESULTADO ==========`);
    console.log(`[ENDPOINT VERIFICAR-DEUDAS] tieneDeudas retornado: ${tieneDeudas}`);
    console.log(`[ENDPOINT VERIFICAR-DEUDAS] Tipo de tieneDeudas: ${typeof tieneDeudas}`);
    console.log(`[ENDPOINT VERIFICAR-DEUDAS] =============================`);
    
    res.json({
      tiene_deudas: tieneDeudas,
      bloqueado: tieneDeudas
    });
  } catch (error) {
    console.error('[ENDPOINT VERIFICAR-DEUDAS] ========== ERROR ==========');
    console.error('[ENDPOINT VERIFICAR-DEUDAS] Error verificando deudas en endpoint:', error);
    console.error('[ENDPOINT VERIFICAR-DEUDAS] Error message:', error.message);
    console.error('[ENDPOINT VERIFICAR-DEUDAS] Stack:', error.stack);
    console.error('[ENDPOINT VERIFICAR-DEUDAS] ===========================');
    res.status(500).json({ error: 'Error al verificar deudas', tiene_deudas: false, bloqueado: false });
  }
});

// Endpoint de diagnóstico para verificar deudas de un alumno por DNI
router.get('/diagnostico-deudas/:dni', authenticateToken, async (req, res) => {
  try {
    const { dni } = req.params;
    const { colegio_id, anio_activo } = req.user;
    
    console.log(`[DIAGNOSTICO] Verificando deudas para DNI: ${dni}, Colegio: ${colegio_id}, Año: ${anio_activo}`);
    
    // Obtener configuración del colegio
    const colegios = await query(
      `SELECT bloquear_deudores, dias_tolerancia, pensiones_vencimiento, inicio_pensiones, ciclo_pensiones
       FROM colegios WHERE id = ?`,
      [colegio_id]
    );
    
    if (colegios.length === 0) {
      return res.json({ error: 'Colegio no encontrado' });
    }
    
    const colegio = colegios[0];
    const diasTolerancia = colegio.dias_tolerancia || 0;
    const inicioPensiones = colegio.inicio_pensiones || 2;
    const cicloPensiones = colegio.ciclo_pensiones || 0;
    
    // Deserializar pensiones_vencimiento
    let vencimientosPensiones = {};
    if (colegio.pensiones_vencimiento && colegio.pensiones_vencimiento !== '') {
      try {
        const deserialized = phpSerialize.unserialize(Buffer.from(colegio.pensiones_vencimiento, 'base64'));
        vencimientosPensiones = deserialized || {};
        console.log(`[DIAGNOSTICO] pensiones_vencimiento deserializado:`, JSON.stringify(vencimientosPensiones, null, 2));
      } catch (e) {
        console.warn('[DIAGNOSTICO] Error deserializando pensiones_vencimiento:', e.message);
      }
    } else {
      console.log(`[DIAGNOSTICO] pensiones_vencimiento está vacío o no existe`);
    }
    
    // Buscar alumno por DNI
    const alumnos = await query(
      `SELECT a.id, a.nombres, a.apellido_paterno, a.apellido_materno, a.nro_documento
       FROM alumnos a
       WHERE a.nro_documento = ? AND a.colegio_id = ?`,
      [dni, colegio_id]
    );
    
    if (alumnos.length === 0) {
      return res.json({ error: 'Alumno no encontrado con ese DNI' });
    }
    
    const alumno = alumnos[0];
    
    // Obtener matrículas activas
    const matriculas = await query(
      `SELECT m.id, m.grupo_id, g.anio
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND m.estado = 0 AND g.anio = ?`,
      [alumno.id, colegio_id, anio_activo]
    );
    
    if (matriculas.length === 0) {
      return res.json({ error: 'No hay matrícula activa para este alumno' });
    }
    
    const matricula = matriculas[0];
    
    // Calcular número de pensión que debería estar pagada
    // IMPORTANTE: La fórmula debe considerar inicio_pensiones
    // Si inicio_pensiones = 2 (Marzo), entonces:
    //   - nro_pago = 1 corresponde a Marzo (mes 3)
    //   - nro_pago = 2 corresponde a Abril (mes 4)
    // Fórmula: nroPago = currentMonth - inicio_pensiones
    // NOTA: Aunque nroPago <= 0, verificaremos TODAS las pensiones configuradas
    // porque pueden tener fechas de vencimiento anteriores al mes actual
    const currentMonth = new Date().getMonth() + 1; // 1-12
    const nroPago = currentMonth - inicioPensiones; // Pensión que debería estar pagada
    
    console.log(`[DIAGNOSTICO] Mes actual: ${currentMonth}, inicio_pensiones: ${inicioPensiones}, nroPago calculado: ${nroPago}`);
    console.log(`[DIAGNOSTICO] Configuración: diasTolerancia=${diasTolerancia}, inicioPensiones=${inicioPensiones}`);
    console.log(`[DIAGNOSTICO] Pensiones configuradas en vencimientos:`, Object.keys(vencimientosPensiones).map(k => `nro_pago=${k}`).join(', '));
    
    // Función para calcular fecha de vencimiento (igual que en verificarDeudas)
    const calcularFechaVencimiento = (nroPension, anio, inicioPensiones) => {
      let vencimiento = vencimientosPensiones[nroPension];
      
      console.log(`[DIAGNOSTICO] calcularFechaVencimiento: nroPension=${nroPension}, vencimiento configurado="${vencimiento || 'NO'}"`);
      
      if (!vencimiento || vencimiento === '') {
        const mesPension = nroPension + 2;
        const ultimoDia = new Date(anio, mesPension, 0).getDate();
        const fechaCalculada = `${ultimoDia}-${String(mesPension).padStart(2, '0')}-${anio}`;
        console.log(`[DIAGNOSTICO] No hay vencimiento configurado, usando último día del mes: ${fechaCalculada}`);
        return fechaCalculada;
      }
      
      const partes = String(vencimiento).trim().split('-');
      console.log(`[DIAGNOSTICO] Partes del vencimiento:`, partes);
      
      if (partes.length === 1) {
        const mesPension = nroPension + 2;
        const fechaCalculada = `${partes[0].padStart(2, '0')}-${String(mesPension).padStart(2, '0')}-${anio}`;
        console.log(`[DIAGNOSTICO] Solo día configurado (${partes[0]}), fecha calculada: ${fechaCalculada}`);
        return fechaCalculada;
      } else if (partes.length === 2) {
        const fechaCalculada = `${partes[0].padStart(2, '0')}-${partes[1].padStart(2, '0')}-${anio}`;
        console.log(`[DIAGNOSTICO] Día-mes configurado (${vencimiento}), fecha calculada: ${fechaCalculada}`);
        return fechaCalculada;
      } else {
        // Día-mes-año: puede ser "31-01-2026" o "31-01-20" (año con 2 dígitos)
        let añoFinal = partes[2];
        // Si el año tiene solo 2 dígitos, usar el año del contexto (anio)
        if (añoFinal.length === 2) {
          añoFinal = String(anio);
          console.log(`[DIAGNOSTICO] Año de 2 dígitos detectado (${partes[2]}), usando año del contexto: ${añoFinal}`);
        }
        const fechaCalculada = `${partes[0].padStart(2, '0')}-${partes[1].padStart(2, '0')}-${añoFinal}`;
        console.log(`[DIAGNOSTICO] Fecha completa configurada (${vencimiento}), fecha final: ${fechaCalculada}`);
        return fechaCalculada;
      }
    };
    
    // Verificar todas las pensiones que tengan configuración de vencimiento
    // O si nroPago > 0, verificar desde 1 hasta nroPago
    const pensionesAVerificar = nroPago > 0 
      ? Array.from({ length: nroPago }, (_, i) => i + 1)
      : Object.keys(vencimientosPensiones)
          .map(k => parseInt(k))
          .filter(k => k > 0 && !isNaN(k)); // Solo pensiones (excluir -1 que es matrícula)

    console.log(`[DIAGNOSTICO] Pensiones a verificar:`, pensionesAVerificar);

    // Verificar cada pensión
    const detallesPensiones = [];
    const fechaActual = new Date();
    fechaActual.setHours(0, 0, 0, 0);
    
    for (const i of pensionesAVerificar) {
      const fechaVencimientoStr = calcularFechaVencimiento(i, anio_activo, inicioPensiones);
      const partesFecha = fechaVencimientoStr.split('-');
      const fechaVencimiento = new Date(
        parseInt(partesFecha[2]),
        parseInt(partesFecha[1]) - 1,
        parseInt(partesFecha[0])
      );
      
      const fechaLimite = new Date(fechaVencimiento);
      fechaLimite.setDate(fechaLimite.getDate() + diasTolerancia);
      fechaLimite.setHours(23, 59, 59, 999);
      
      // Verificar pagos cancelados
      const pagosCancelados = await query(
        `SELECT COUNT(*) as total, GROUP_CONCAT(p.id) as pago_ids
         FROM pagos p
         WHERE p.matricula_id = ?
           AND p.tipo = 1
           AND p.nro_pago = ?
           AND p.estado_pago = 'CANCELADO'
           AND p.estado = 'ACTIVO'`,
        [matricula.id, i]
      );
      
      const tienePago = pagosCancelados[0].total > 0;
      const estaVencida = fechaActual > fechaLimite;
      const tieneDeuda = estaVencida && !tienePago;
      
      console.log(`[DIAGNOSTICO] Pensión ${i}:`);
      console.log(`  - Fecha vencimiento configurada: ${fechaVencimientoStr}`);
      console.log(`  - Fecha vencimiento Date: ${fechaVencimiento.toISOString()}`);
      console.log(`  - Días tolerancia: ${diasTolerancia}`);
      console.log(`  - Fecha límite (vencimiento + tolerancia): ${fechaLimite.toISOString()}`);
      console.log(`  - Fecha actual: ${fechaActual.toISOString()}`);
      console.log(`  - ¿Está vencida? (fechaActual > fechaLimite): ${estaVencida}`);
      console.log(`  - ¿Tiene pago cancelado?: ${tienePago} (total: ${pagosCancelados[0].total})`);
      console.log(`  - ¿Tiene deuda? (vencida && !tienePago): ${tieneDeuda}`);
      
      detallesPensiones.push({
        nro_pension: i,
        fecha_vencimiento: fechaVencimientoStr,
        fecha_vencimiento_iso: fechaVencimiento.toISOString(),
        fecha_limite: fechaLimite.toISOString(),
        fecha_actual: fechaActual.toISOString(),
        dias_tolerancia: diasTolerancia,
        esta_vencida: estaVencida,
        tiene_pago: tienePago,
        tiene_deuda: tieneDeuda,
        pago_ids: pagosCancelados[0].pago_ids || null
      });
    }
    
    const tieneDeudas = detallesPensiones.some(p => p.tiene_deuda);
    
    console.log(`[DIAGNOSTICO] ========== RESUMEN FINAL ==========`);
    console.log(`[DIAGNOSTICO] Total pensiones verificadas: ${detallesPensiones.length}`);
    console.log(`[DIAGNOSTICO] Pensiones con deuda: ${detallesPensiones.filter(p => p.tiene_deuda).length}`);
    console.log(`[DIAGNOSTICO] ¿Tiene deudas?: ${tieneDeudas}`);
    console.log(`[DIAGNOSTICO] ¿Debe bloquear?: ${colegio.bloquear_deudores === 'SI' && tieneDeudas}`);
    console.log(`[DIAGNOSTICO] ====================================`);
    
    res.json({
      alumno: {
        id: alumno.id,
        nombre_completo: `${alumno.nombres} ${alumno.apellido_paterno} ${alumno.apellido_materno}`,
        dni: alumno.nro_documento
      },
      matricula: {
        id: matricula.id,
        anio: matricula.anio
      },
      configuracion: {
        bloquear_deudores: colegio.bloquear_deudores,
        dias_tolerancia: diasTolerancia,
        inicio_pensiones: inicioPensiones,
        ciclo_pensiones: cicloPensiones,
        pensiones_vencimiento: vencimientosPensiones
      },
      calculos: {
        mes_actual: currentMonth,
        nro_pago_verificar: nroPago,
        fecha_actual: fechaActual.toISOString()
      },
      pensiones: detallesPensiones,
      resultado: {
        tiene_deudas: tieneDeudas,
        debe_bloquear: colegio.bloquear_deudores === 'SI' && tieneDeudas
      }
    });
  } catch (error) {
    console.error('[DIAGNOSTICO] Error:', error);
    res.status(500).json({ error: 'Error en diagnóstico', details: error.message });
  }
});

module.exports = router;

