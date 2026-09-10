const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const phpSerialize = require('php-serialize');
const { query, getAnioActivo } = require('../utils/mysql');
const { getColegioData } = require('../utils/colegio');
const { registrarAccion } = require('../utils/auditoria');
const { authenticateToken } = require('../middleware/auth');
const { calcularPensionesAVerificar } = require('../utils/deudaPensiones');
const { urlStaticFotos } = require('../utils/staticStorage');
const { verificarMatriculaPortalLogin, MENSAJE_SIN_MATRICULA, sqlExistePagoMatriculaCancelado } = require('../utils/matriculaAnioActivo');
const { deudasLog, deudasWarn, deudasError, deudasInfo } = require('../utils/deudasLogger');
const { tipoSesionPublico } = require('../utils/superadminOculto');

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
              p.foto as personal_foto,
              ap.nombres as apoderado_nombres,
              ap.apellido_paterno as apoderado_apellido_paterno,
              ap.apellido_materno as apoderado_apellido_materno
       FROM usuarios u
       LEFT JOIN alumnos a ON a.id = u.alumno_id
       LEFT JOIN personal p ON p.id = u.personal_id
       LEFT JOIN apoderados ap ON ap.id = u.apoderado_id
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

    const accesoMatricula = await verificarMatriculaPortalLogin(query, usuarioDB, anioActivo);
    if (!accesoMatricula.permitido) {
      return res.status(403).json({
        error: accesoMatricula.mensaje || MENSAJE_SIN_MATRICULA,
        code: 'SIN_MATRICULA_ACTIVA'
      });
    }

    // Verificar deudas en login: solo ALUMNO y APODERADO (el docente no pierde acceso laboral)
    const tieneDeudas = await verificarDeudas(usuarioDB, anioActivo, { contexto: 'login' });
    
    if (tieneDeudas) {
      // Mensaje genérico: no revelar bloqueo por pensiones/deudas al usuario final
      return res.status(403).json({
        error: 'Problemas con el servidor, se está solucionando.'
      });
    }

    // Obtener datos del colegio
    const colegioData = await getColegioData(usuarioDB.colegio_id);

    // Versión de sesión (invalidar JWT al cambiar password / forzar cierre)
    const tokenVersion = Number.isFinite(parseInt(usuarioDB.token_version, 10))
      ? parseInt(usuarioDB.token_version, 10)
      : 1;
    const tipoPublico = tipoSesionPublico(usuarioDB.tipo);

    // Generar token JWT
    const token = jwt.sign(
      {
        usuario_id: usuarioDB.id,
        colegio_id: usuarioDB.colegio_id,
        tipo: tipoPublico,
        alumno_id: usuarioDB.alumno_id,
        personal_id: usuarioDB.personal_id,
        apoderado_id: usuarioDB.apoderado_id,
        anio_activo: anioActivo,
        tv: tokenVersion,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    // Preparar datos del usuario para el frontend
    // Mapear nombres y apellidos según la estructura real de la base de datos
    let nombres = '';
    let apellidos = '';
    let apellido_paterno = '';
    let apellido_materno = '';
    
    // Si es alumno: tiene apellido_paterno, apellido_materno separados
    if (usuarioDB.alumno_id && usuarioDB.alumno_nombres) {
      nombres = usuarioDB.alumno_nombres || '';
      apellido_paterno = usuarioDB.alumno_apellido_paterno || '';
      apellido_materno = usuarioDB.alumno_apellido_materno || '';
      apellidos = (apellido_paterno || '') + (apellido_materno ? ' ' + apellido_materno : '');
    } 
    // Si es personal/docente: tiene apellidos (un solo campo)
    else if (usuarioDB.personal_id && usuarioDB.personal_nombres) {
      nombres = usuarioDB.personal_nombres || '';
      apellidos = usuarioDB.personal_apellidos || '';
    }
    // Si es apoderado: tiene apellido_paterno y apellido_materno separados (igual que alumnos)
    else if (usuarioDB.apoderado_id && usuarioDB.apoderado_nombres) {
      nombres = usuarioDB.apoderado_nombres || '';
      apellido_paterno = usuarioDB.apoderado_apellido_paterno || '';
      apellido_materno = usuarioDB.apoderado_apellido_materno || '';
      apellidos = (apellido_paterno || '') + (apellido_materno ? ' ' + apellido_materno : '');
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
    // Los apoderados no tienen columna 'foto' en la tabla apoderados
    // Por lo tanto, no se puede obtener foto para apoderados
    
    if (fotoNombre && fotoNombre !== '') {
      const isProduction = process.env.NODE_ENV === 'production';
      fotoUrl = isProduction
        ? urlStaticFotos(fotoNombre)
        : `http://localhost:5000/Static/Image/Fotos/${fotoNombre}`;
    }
    
    const userData = {
      id: usuarioDB.id,
      usuario: usuarioDB.usuario,
      tipo: tipoPublico,
      colegio_id: usuarioDB.colegio_id,
      anio_activo: anioActivo,
      nombres: nombres.trim() || usuarioDB.usuario,
      apellidos: apellidos.trim(),
      // Campos separados para alumnos y apoderados
      apellido_paterno: apellido_paterno || null,
      apellido_materno: apellido_materno || null,
      foto: fotoUrl, // URL completa en lugar de solo el nombre
      foto_nombre: fotoNombre || null, // Nombre del archivo para referencia
      colegio: colegioData,
      personal_id: usuarioDB.personal_id ?? null,
      alumno_id: usuarioDB.alumno_id ?? null,
      apoderado_id: usuarioDB.apoderado_id ?? null
    };

    // Registrar login exitoso en auditoría
    registrarAccion({
      usuario_id: usuarioDB.id,
      colegio_id: usuarioDB.colegio_id,
      tipo_usuario: tipoPublico,
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
    // - apoderados: apellido_paterno, apellido_materno, nombres
    const usuarios = await query(
      `SELECT u.*, 
              a.nombres as alumno_nombres, 
              a.apellido_paterno as alumno_apellido_paterno,
              a.apellido_materno as alumno_apellido_materno,
              p.nombres as personal_nombres,
              p.apellidos as personal_apellidos,
              p.foto as personal_foto,
              ap.nombres as apoderado_nombres,
              ap.apellido_paterno as apoderado_apellido_paterno,
              ap.apellido_materno as apoderado_apellido_materno
       FROM usuarios u
       LEFT JOIN alumnos a ON a.id = u.alumno_id
       LEFT JOIN personal p ON p.id = u.personal_id
       LEFT JOIN apoderados ap ON ap.id = u.apoderado_id
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
    let apellido_paterno = '';
    let apellido_materno = '';
    
    // Si es alumno: tiene apellido_paterno, apellido_materno separados
    if (usuarioDB.alumno_id && usuarioDB.alumno_nombres) {
      nombres = usuarioDB.alumno_nombres || '';
      apellido_paterno = usuarioDB.alumno_apellido_paterno || '';
      apellido_materno = usuarioDB.alumno_apellido_materno || '';
      apellidos = (apellido_paterno || '') + (apellido_materno ? ' ' + apellido_materno : '');
    } 
    // Si es personal/docente: tiene apellidos (un solo campo)
    else if (usuarioDB.personal_id && usuarioDB.personal_nombres) {
      nombres = usuarioDB.personal_nombres || '';
      apellidos = usuarioDB.personal_apellidos || '';
    }
    // Si es apoderado: tiene apellido_paterno y apellido_materno separados (igual que alumnos)
    else if (usuarioDB.apoderado_id) {
      // Obtener datos del apoderado
      const apoderados = await query(
        `SELECT nombres, apellido_paterno, apellido_materno 
         FROM apoderados 
         WHERE id = ?`,
        [usuarioDB.apoderado_id]
      );
      if (apoderados.length > 0) {
        nombres = apoderados[0].nombres || '';
        apellido_paterno = apoderados[0].apellido_paterno || '';
        apellido_materno = apoderados[0].apellido_materno || '';
        apellidos = (apellido_paterno || '') + (apellido_materno ? ' ' + apellido_materno : '');
      }
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
      const isProduction = process.env.NODE_ENV === 'production';
      fotoUrl = isProduction
        ? urlStaticFotos(fotoNombre)
        : `http://localhost:5000/Static/Image/Fotos/${fotoNombre}`;
    }

    const userData = {
      id: usuarioDB.id,
      usuario: usuarioDB.usuario,
      tipo: tipoSesionPublico(usuarioDB.tipo),
      colegio_id: usuarioDB.colegio_id,
      anio_activo: anio_activo,
      nombres: nombres.trim() || usuarioDB.usuario,
      apellidos: apellidos.trim(),
      // Campos separados para alumnos y apoderados
      apellido_paterno: apellido_paterno || null,
      apellido_materno: apellido_materno || null,
      foto: fotoUrl, // URL completa en lugar de solo el nombre
      foto_nombre: fotoNombre || null, // Nombre del archivo para referencia
      colegio: colegioData,
      personal_id: usuarioDB.personal_id ?? null,
      alumno_id: usuarioDB.alumno_id ?? null,
      apoderado_id: usuarioDB.apoderado_id ?? null
    };

    res.json({ user: userData });

  } catch (error) {
    console.error('Error obteniendo usuario:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * Función auxiliar para verificar deudas (solo aplica si colegios.bloquear_deudores === 'SI').
 * Con NO: no bloquea login ni submenús; con SI: usa dias_tolerancia y pensiones_vencimiento.
 * @param {object} [opciones]
 * @param {'login'|'sesion'} [opciones.contexto='sesion'] — en login solo bloquea ALUMNO/APODERADO;
 *   en sesión el DOCENTE con hijos en deuda puede marcar restricciones en vista apoderado (p. ej. notas).
 */
async function verificarDeudas(usuario, anioActivo, opciones = {}) {
  const contexto = opciones.contexto === 'login' ? 'login' : 'sesion';
  try {
    // Validar que anioActivo esté definido
    if (!anioActivo || isNaN(anioActivo)) {
      deudasError(`anioActivo inválido: ${anioActivo}`);
      return false;
    }
    
    // Validar que usuario tenga los campos necesarios
    if (!usuario || !usuario.id || !usuario.colegio_id) {
      deudasError('Usuario inválido:', usuario);
      return false;
    }
    
    deudasLog(
      `Iniciando verificación para usuario ID: ${usuario.id}, tipo: ${usuario.tipo}, contexto: ${contexto}, colegio_id: ${usuario.colegio_id}, anioActivo: ${anioActivo}`
    );
    
    // Obtener configuración del colegio
    const colegios = await query(
      `SELECT bloquear_deudores, bloquear_deudores_hasta_mes, dias_tolerancia, pensiones_vencimiento, inicio_pensiones, anio_activo
       FROM colegios WHERE id = ?`,
      [usuario.colegio_id]
    );

    deudasLog(` Configuración del colegio:`, {
      bloquear_deudores: colegios.length > 0 ? colegios[0].bloquear_deudores : 'NO ENCONTRADO',
      dias_tolerancia: colegios.length > 0 ? colegios[0].dias_tolerancia : null,
      inicio_pensiones: colegios.length > 0 ? colegios[0].inicio_pensiones : null
    });

    if (colegios.length === 0) {
      deudasLog(` ⚠️ No se encontró configuración del colegio`);
      return false; // No hay configuración del colegio
    }

    // Solo si "Bloquear deudores" = SI se aplica vencimientos + tolerancia (login y /verificar-deudas).
    // Si es NO (u otro valor), no hay restricción por pensiones.
    const bloquearDeudoresActivo =
      String(colegios[0].bloquear_deudores || '').trim().toUpperCase() === 'SI';
    if (!bloquearDeudoresActivo) {
      deudasLog(
        `bloquear_deudores=${colegios[0].bloquear_deudores} → sin verificación de deuda por configuración`
      );
      return false;
    }

    deudasLog(` Continuando verificación de deudas vencidas (bloquear_deudores: SI)`);

    const tiposEnLogin = ['ALUMNO', 'APODERADO'];
    const tiposEnSesion = ['ALUMNO', 'APODERADO', 'DOCENTE'];
    const tiposPermitidos = contexto === 'login' ? tiposEnLogin : tiposEnSesion;

    if (!tiposPermitidos.includes(usuario.tipo)) {
      deudasLog(
        `Tipo ${usuario.tipo} no aplica en contexto ${contexto} (permitidos: ${tiposPermitidos.join(', ')})`
      );
      return false;
    }

    deudasLog(` Tipo de usuario válido: ${usuario.tipo}`);

    const colegio = colegios[0];
    const diasTolerancia = colegio.dias_tolerancia || 0;
    
    // Deserializar pensiones_vencimiento (está en base64 + serialize de PHP)
    let vencimientosPensiones = {};
    if (colegio.pensiones_vencimiento && colegio.pensiones_vencimiento !== '') {
      try {
        // Decodificar base64 primero, luego deserializar
        const decoded = Buffer.from(colegio.pensiones_vencimiento, 'base64').toString('utf-8');
        const deserialized = phpSerialize.unserialize(decoded);
        vencimientosPensiones = deserialized || {};
        deudasLog(` pensiones_vencimiento deserializado:`, JSON.stringify(vencimientosPensiones, null, 2));
        deudasLog(` Claves en vencimientosPensiones:`, Object.keys(vencimientosPensiones));
        deudasLog(` Total pensiones configuradas:`, Object.keys(vencimientosPensiones).length);
      } catch (e) {
        deudasWarn(' No se pudo deserializar pensiones_vencimiento:', e.message);
        deudasWarn(' Stack:', e.stack);
        vencimientosPensiones = {};
      }
    } else {
      deudasLog(` pensiones_vencimiento está vacío o no existe`);
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

    deudasLog(` Mes actual: ${currentMonth}, inicio_pensiones: ${inicioPensiones}, nroPago calculado: ${nroPago}, anioActivo: ${anioActivo}`);

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
      
      deudasLog(` calcularFechaVencimiento: nroPension=${nroPension}, vencimiento configurado="${vencimiento || 'NO'}"`);
      
      if (!vencimiento || vencimiento === '') {
        // Si no hay configuración específica, usar el último día del mes correspondiente
        // Fórmula del sistema anterior: mes = nroPension + 2 (pero esto parece incorrecto)
        // Mejor usar: mes = inicio_pensiones + nroPension - 1
        // Pero según el sistema anterior línea 569: mes = nroPension + 2
        const mesPension = nroPension + 2; // Según sistema anterior
        const ultimoDia = new Date(anio, mesPension, 0).getDate();
        const fechaCalculada = `${ultimoDia}-${String(mesPension).padStart(2, '0')}-${anio}`;
        deudasLog(` No hay vencimiento configurado, usando último día del mes: ${fechaCalculada}`);
        return fechaCalculada;
      }

      // Parsear el formato de vencimiento (puede ser: "dd", "dd-mm", o "dd-mm-yyyy")
      const partes = String(vencimiento).trim().split('-');
      
      if (partes.length === 1) {
        // Solo día: "31" -> según sistema anterior: fecha = "dd-(nroPension+2)-anio"
        const mesPension = nroPension + 2; // Según sistema anterior línea 569
        const fechaCalculada = `${partes[0].padStart(2, '0')}-${String(mesPension).padStart(2, '0')}-${anio}`;
        deudasLog(` Solo día configurado (${partes[0]}), fecha calculada: ${fechaCalculada}`);
        return fechaCalculada;
      } else if (partes.length === 2) {
        // Día-mes: "31-01" -> según sistema anterior: fecha = "dd-mm-anio"
        const fechaCalculada = `${partes[0].padStart(2, '0')}-${partes[1].padStart(2, '0')}-${anio}`;
        deudasLog(` Día-mes configurado (${vencimiento}), fecha calculada: ${fechaCalculada}`);
        return fechaCalculada;
      } else {
        // Día-mes-año: puede ser "31-01-2026" o "31-01-20" (año con 2 dígitos)
        let añoFinal = partes[2];
        // Si el año tiene solo 2 dígitos, usar el año del contexto (anio) para evitar problemas
        // El sistema anterior guarda años con 2 dígitos, pero debemos usar el año activo
        if (añoFinal.length === 2) {
          // Usar el año del contexto (anio) en lugar de interpretar el año de 2 dígitos
          añoFinal = String(anio);
          deudasLog(` Año de 2 dígitos detectado (${partes[2]}), usando año del contexto: ${añoFinal}`);
        }
        const fechaCalculada = `${partes[0].padStart(2, '0')}-${partes[1].padStart(2, '0')}-${añoFinal}`;
        deudasLog(` Fecha completa configurada (${vencimiento}), fecha final: ${fechaCalculada}`);
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
         WHERE m.alumno_id = ? AND m.colegio_id = ? AND (m.estado = 0) AND g.anio = ?
           AND ${sqlExistePagoMatriculaCancelado('m')}
         LIMIT 1`,
        [usuario.alumno_id, usuario.colegio_id, anioActivo]
      );

      if (matriculas.length === 0) {
        return false; // No hay matrícula activa pagada
      }

      const matricula = matriculas[0];
      const inicioPensiones = colegio.inicio_pensiones || 2; // Por defecto mes 2 (marzo)

      // Verificar todas las pensiones que tengan configuración de vencimiento
      // O si nroPago > 0, verificar desde 1 hasta nroPago
      // Esto permite detectar pensiones con fechas de vencimiento anteriores al mes actual
      const pensionesAVerificar = calcularPensionesAVerificar({
        nroPago,
        vencimientosPensiones,
        bloquearDeudoresHastaMes: colegio.bloquear_deudores_hasta_mes,
        inicioPensiones,
      });

      deudasLog(` nroPago: ${nroPago}, bloquear_deudores_hasta_mes: ${colegio.bloquear_deudores_hasta_mes ?? 'NULL'}, vencimientosPensiones keys:`, Object.keys(vencimientosPensiones));
      deudasLog(` pensionesAVerificar calculado (ALUMNO):`, pensionesAVerificar);
      deudasLog(` Total pensiones a verificar (ALUMNO): ${pensionesAVerificar.length}`);

      if (pensionesAVerificar.length === 0) {
        deudasLog(` ⚠️ No hay pensiones para verificar (ALUMNO)`);
        deudasLog(` ⚠️ nroPago: ${nroPago}, vencimientosPensiones vacío: ${Object.keys(vencimientosPensiones).length === 0}`);
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
        deudasLog(` Pensión ${i}:`);
        deudasLog(`  Fecha vencimiento configurada: ${fechaVencimientoStr}`);
        deudasLog(`  Fecha vencimiento Date: ${fechaVencimiento.toISOString()}`);
        deudasLog(`  Días tolerancia: ${diasTolerancia}`);
        deudasLog(`  Fecha límite (vencimiento + tolerancia): ${fechaLimite.toISOString()}`);
        deudasLog(`  Fecha actual: ${fechaActual.toISOString()}`);
        deudasLog(`  ¿Fecha actual > fecha límite?: ${fechaActual > fechaLimite}`);

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

          deudasLog(`  Pagos cancelados para pensión ${i}: ${pagosCancelados[0].total}`);

          if (pagosCancelados[0].total === 0) {
            // Tiene deuda: la pensión está vencida (considerando tolerancia) y no está cancelada
            deudasInfo(`DEUDA: pensión ${i} vencida sin pago cancelado (alumno ${usuario.alumno_id}, matrícula ${matricula.id})`);
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
         WHERE f.apoderado_id = ? AND m.colegio_id = ? AND a.colegio_id = ?
           AND (m.estado = 0) AND g.anio = ?
           AND ${sqlExistePagoMatriculaCancelado('m')}`,
        [usuario.apoderado_id, usuario.colegio_id, usuario.colegio_id, anioActivo]
      );

      if (matriculasHijos.length === 0) {
        return false; // No hay hijos con matrícula activa pagada
      }

      const inicioPensiones = colegio.inicio_pensiones || 2;

      // Verificar todas las pensiones que tengan configuración de vencimiento
      // O si nroPago > 0, verificar desde 1 hasta nroPago
      deudasLog(` nroPago: ${nroPago}, vencimientosPensiones keys:`, Object.keys(vencimientosPensiones));
      const pensionesAVerificar = calcularPensionesAVerificar({
        nroPago,
        vencimientosPensiones,
        bloquearDeudoresHastaMes: colegio.bloquear_deudores_hasta_mes,
        inicioPensiones,
      });

      deudasLog(` pensionesAVerificar calculado (APODERADO):`, pensionesAVerificar);
      deudasLog(` Total pensiones a verificar (APODERADO): ${pensionesAVerificar.length}`);

      if (pensionesAVerificar.length === 0) {
        deudasLog(` ⚠️ No hay pensiones para verificar (APODERADO)`);
        deudasLog(` ⚠️ nroPago: ${nroPago}, vencimientosPensiones vacío: ${Object.keys(vencimientosPensiones).length === 0}`);
        return false;
      }

      // Verificar deudas de cada hijo
      for (const matricula of matriculasHijos) {
        for (const i of pensionesAVerificar) {
          // Validar que i sea un número válido
          if (!i || isNaN(i) || i <= 0) {
            deudasWarn(` Saltando pensión inválida: ${i}`);
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
              deudasInfo(
                `DEUDA: pensión ${i} vencida sin pago (apoderado ${usuario.apoderado_id}, matrícula ${matricula.id})`
              );
              return true; // Al menos un hijo tiene deuda
            }
          }
        }
      }

      return false; // Ningún hijo tiene deudas
    }

    // Sesión: docente con mismo DNI en apoderados — restricciones en vista hijos (no bloquea login)
    if (usuario.tipo === 'DOCENTE' && contexto === 'sesion') {
      try {
        // Asegurar que tenemos usuario_id (puede venir como id o usuario_id)
        const docenteUsuarioId = usuario.usuario_id || usuario.id;
        deudasLog(` Verificando deudas para DOCENTE ID: ${docenteUsuarioId}`);
        deudasLog(` Usuario objeto completo:`, JSON.stringify(usuario, null, 2));
        
        if (!docenteUsuarioId) {
          deudasError('No se encontró usuario_id en el objeto usuario');
          return false;
        }
        
        // Obtener DNI del docente desde la tabla personal
        deudasLog(` 🔍 Buscando DNI del docente en tabla personal...`);
        const docenteData = await query(
          `SELECT p.nro_documento, p.id as personal_id
           FROM personal p
           INNER JOIN usuarios u ON u.personal_id = p.id
           WHERE u.id = ? AND u.colegio_id = ? AND u.estado = 'ACTIVO'
           LIMIT 1`,
          [docenteUsuarioId, usuario.colegio_id]
        );

        deudasLog(` Docente data encontrada: ${docenteData.length > 0 ? 'SÍ' : 'NO'}`);

        if (docenteData.length === 0) {
          deudasLog(` ⚠️ No se encontró el docente en tabla personal`);
          return false; // No se encontró el docente
        }

        const docenteDni = docenteData[0].nro_documento;
        deudasLog(` DNI del docente: ${docenteDni || 'NO TIENE'}`);
        
        if (!docenteDni) {
          deudasLog(` ⚠️ Docente no tiene DNI registrado`);
          return false; // No tiene DNI registrado
        }

        // Buscar si el docente es apoderado (mismo DNI en tabla apoderados)
        deudasLog(` 🔍 Buscando si el docente es apoderado (DNI: ${docenteDni})...`);
        const apoderadoData = await query(
          `SELECT ap.id as apoderado_id
           FROM apoderados ap
           WHERE ap.nro_documento = ? AND ap.colegio_id = ?
           LIMIT 1`,
          [docenteDni, usuario.colegio_id]
        );

        deudasLog(` Apoderado encontrado con mismo DNI: ${apoderadoData.length > 0 ? 'SÍ' : 'NO'}`);
        if (apoderadoData.length > 0) {
          deudasLog(` Apoderado ID: ${apoderadoData[0].apoderado_id}`);
        }

        if (apoderadoData.length === 0) {
          deudasLog(` ⚠️ El docente no es apoderado (no hay registro en tabla apoderados con ese DNI)`);
          return false; // El docente no es apoderado
        }

      const apoderadoId = apoderadoData[0].apoderado_id;
      deudasLog(` ✅ Apoderado ID encontrado: ${apoderadoId}`);

      // Obtener matrículas activas de los hijos del docente-apoderado
      deudasLog(` Buscando matrículas para apoderado_id: ${apoderadoId}, colegio_id: ${usuario.colegio_id}, anio: ${anioActivo}`);
      const matriculasHijos = await query(
        `SELECT m.id, m.grupo_id, g.anio
         FROM matriculas m
         INNER JOIN alumnos a ON a.id = m.alumno_id
         INNER JOIN familias f ON f.alumno_id = a.id
         INNER JOIN grupos g ON g.id = m.grupo_id
         WHERE f.apoderado_id = ? AND m.colegio_id = ? AND a.colegio_id = ?
           AND (m.estado = 0) AND g.anio = ?
           AND ${sqlExistePagoMatriculaCancelado('m')}`,
        [apoderadoId, usuario.colegio_id, usuario.colegio_id, anioActivo]
      );

      deudasLog(` ✅ Matrículas de hijos encontradas: ${matriculasHijos.length}`);
      if (matriculasHijos.length > 0) {
        deudasLog(` IDs de matrículas:`, matriculasHijos.map(m => m.id));
      }

      if (matriculasHijos.length === 0) {
        deudasLog(` ⚠️ No hay hijos con matrícula activa para el docente-apoderado`);
        return false; // No hay hijos con matrícula activa
      }

      const inicioPensiones = colegio.inicio_pensiones || 2;
      deudasLog(` Inicio pensiones: ${inicioPensiones}, nroPago: ${nroPago}`);

      // Verificar todas las pensiones que tengan configuración de vencimiento
      // O si nroPago > 0, verificar desde 1 hasta nroPago
      deudasLog(` nroPago: ${nroPago}, vencimientosPensiones keys:`, Object.keys(vencimientosPensiones));
      const pensionesAVerificar = calcularPensionesAVerificar({
        nroPago,
        vencimientosPensiones,
        bloquearDeudoresHastaMes: colegio.bloquear_deudores_hasta_mes,
        inicioPensiones,
      });

      deudasLog(` pensionesAVerificar calculado (DOCENTE/APODERADO):`, pensionesAVerificar);
      deudasLog(` Total pensiones a verificar (DOCENTE/APODERADO): ${pensionesAVerificar.length}`);

      if (pensionesAVerificar.length === 0) {
        deudasLog(` ⚠️ No hay pensiones para verificar (DOCENTE/APODERADO)`);
        deudasLog(` ⚠️ nroPago: ${nroPago}, vencimientosPensiones vacío: ${Object.keys(vencimientosPensiones).length === 0}`);
        return false;
      }

      // Verificar deudas de cada hijo
      for (const matricula of matriculasHijos) {
        deudasLog(` Verificando matrícula ID: ${matricula.id} del hijo (DOCENTE/APODERADO)`);
        for (const i of pensionesAVerificar) {
          // Validar que i sea un número válido
          if (!i || isNaN(i) || i <= 0) {
            deudasWarn(` Saltando pensión inválida: ${i}`);
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

          deudasLog(` Pensión ${i} (DOCENTE/APODERADO): fechaVencimiento=${fechaVencimientoStr}, fechaLimite=${fechaLimite.toISOString()}, fechaActual=${fechaActual.toISOString()}, ¿vencida?=${fechaActual > fechaLimite}`);

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

            deudasLog(` Pensión ${i} (DOCENTE/APODERADO): pagos cancelados = ${pagosCancelados[0].total}`);

            if (pagosCancelados[0].total === 0) {
              deudasInfo(
                `DEUDA: pensión ${i} vencida sin pago (docente-apoderado, matrícula ${matricula.id})`
              );
              return true; // Al menos un hijo tiene deuda
            }
          }
        }
      }

        deudasLog(` Ningún hijo tiene deudas (DOCENTE/APODERADO)`);
        return false; // Ningún hijo tiene deudas
      } catch (error) {
        deudasError('Error en verificación DOCENTE/APODERADO:', error);
        deudasError('Stack:', error.stack);
        return false; // En caso de error, permitir acceso
      }
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
    deudasLog('ENDPOINT /verificar-deudas — inicio', { userId: req.user?.usuario_id || req.user?.id, tipo: req.user?.tipo });
    
    // El token JWT tiene 'usuario_id', no 'id'
    const user = {
      id: req.user.usuario_id || req.user.id, // Intentar ambos campos
      usuario_id: req.user.usuario_id || req.user.id, // CRÍTICO: verificarDeudas necesita usuario_id
      tipo: req.user.tipo,
      colegio_id: req.user.colegio_id,
      anio_activo: req.user.anio_activo,
      alumno_id: req.user.alumno_id || 0,
      personal_id: req.user.personal_id || 0,
      apoderado_id: req.user.apoderado_id || 0
    };
    
    const anioActivo = req.user.anio_activo || new Date().getFullYear();
    
    const tieneDeudas = await verificarDeudas(user, anioActivo);
    
    deudasLog('ENDPOINT /verificar-deudas — resultado:', tieneDeudas);
    
    res.json({
      tiene_deudas: tieneDeudas,
      bloqueado: tieneDeudas
    });
  } catch (error) {
    deudasError('ENDPOINT /verificar-deudas — error:', error);
    res.status(500).json({
      error: 'Problemas con el servidor, se está solucionando.',
      tiene_deudas: false,
      bloqueado: false
    });
  }
});

// Endpoint de diagnóstico para verificar deudas de un alumno por DNI
router.get('/diagnostico-deudas/:dni', authenticateToken, async (req, res) => {
  try {
    const { dni } = req.params;
    const { colegio_id, anio_activo } = req.user;
    
    deudasLog(`[DIAGNOSTICO] Verificando deudas para DNI: ${dni}, Colegio: ${colegio_id}, Año: ${anio_activo}`);
    
    // Obtener configuración del colegio
    const colegios = await query(
      `SELECT bloquear_deudores, bloquear_deudores_hasta_mes, dias_tolerancia, pensiones_vencimiento, inicio_pensiones, ciclo_pensiones
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
        // Decodificar base64 primero, luego deserializar
        const decoded = Buffer.from(colegio.pensiones_vencimiento, 'base64').toString('utf-8');
        const deserialized = phpSerialize.unserialize(decoded);
        vencimientosPensiones = deserialized || {};
        deudasLog(`[DIAGNOSTICO] pensiones_vencimiento deserializado:`, JSON.stringify(vencimientosPensiones, null, 2));
      } catch (e) {
        deudasWarn('[DIAGNOSTICO] Error deserializando pensiones_vencimiento:', e.message);
      }
    } else {
      deudasLog(`[DIAGNOSTICO] pensiones_vencimiento está vacío o no existe`);
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
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND (m.estado = 0) AND g.anio = ?`,
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
    
    deudasLog(`[DIAGNOSTICO] Mes actual: ${currentMonth}, inicio_pensiones: ${inicioPensiones}, nroPago calculado: ${nroPago}`);
    deudasLog(`[DIAGNOSTICO] Configuración: diasTolerancia=${diasTolerancia}, inicioPensiones=${inicioPensiones}`);
    deudasLog(`[DIAGNOSTICO] Pensiones configuradas en vencimientos:`, Object.keys(vencimientosPensiones).map(k => `nro_pago=${k}`).join(', '));
    
    // Función para calcular fecha de vencimiento (igual que en verificarDeudas)
    const calcularFechaVencimiento = (nroPension, anio, inicioPensiones) => {
      let vencimiento = vencimientosPensiones[nroPension];
      
      deudasLog(`[DIAGNOSTICO] calcularFechaVencimiento: nroPension=${nroPension}, vencimiento configurado="${vencimiento || 'NO'}"`);
      
      if (!vencimiento || vencimiento === '') {
        const mesPension = nroPension + 2;
        const ultimoDia = new Date(anio, mesPension, 0).getDate();
        const fechaCalculada = `${ultimoDia}-${String(mesPension).padStart(2, '0')}-${anio}`;
        deudasLog(`[DIAGNOSTICO] No hay vencimiento configurado, usando último día del mes: ${fechaCalculada}`);
        return fechaCalculada;
      }
      
      const partes = String(vencimiento).trim().split('-');
      deudasLog(`[DIAGNOSTICO] Partes del vencimiento:`, partes);
      
      if (partes.length === 1) {
        const mesPension = nroPension + 2;
        const fechaCalculada = `${partes[0].padStart(2, '0')}-${String(mesPension).padStart(2, '0')}-${anio}`;
        deudasLog(`[DIAGNOSTICO] Solo día configurado (${partes[0]}), fecha calculada: ${fechaCalculada}`);
        return fechaCalculada;
      } else if (partes.length === 2) {
        const fechaCalculada = `${partes[0].padStart(2, '0')}-${partes[1].padStart(2, '0')}-${anio}`;
        deudasLog(`[DIAGNOSTICO] Día-mes configurado (${vencimiento}), fecha calculada: ${fechaCalculada}`);
        return fechaCalculada;
      } else {
        // Día-mes-año: puede ser "31-01-2026" o "31-01-20" (año con 2 dígitos)
        let añoFinal = partes[2];
        // Si el año tiene solo 2 dígitos, usar el año del contexto (anio)
        if (añoFinal.length === 2) {
          añoFinal = String(anio);
          deudasLog(`[DIAGNOSTICO] Año de 2 dígitos detectado (${partes[2]}), usando año del contexto: ${añoFinal}`);
        }
        const fechaCalculada = `${partes[0].padStart(2, '0')}-${partes[1].padStart(2, '0')}-${añoFinal}`;
        deudasLog(`[DIAGNOSTICO] Fecha completa configurada (${vencimiento}), fecha final: ${fechaCalculada}`);
        return fechaCalculada;
      }
    };
    
    // Verificar todas las pensiones que tengan configuración de vencimiento
    // O si nroPago > 0, verificar desde 1 hasta nroPago
    const pensionesAVerificar = calcularPensionesAVerificar({
      nroPago,
      vencimientosPensiones,
      bloquearDeudoresHastaMes: colegio.bloquear_deudores_hasta_mes,
      inicioPensiones,
    });

    deudasLog(`[DIAGNOSTICO] bloquear_deudores_hasta_mes: ${colegio.bloquear_deudores_hasta_mes ?? 'NULL'}`);
    deudasLog(`[DIAGNOSTICO] Pensiones a verificar:`, pensionesAVerificar);

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
      
      deudasLog(`[DIAGNOSTICO] Pensión ${i}:`);
      deudasLog(`  - Fecha vencimiento configurada: ${fechaVencimientoStr}`);
      deudasLog(`  - Fecha vencimiento Date: ${fechaVencimiento.toISOString()}`);
      deudasLog(`  - Días tolerancia: ${diasTolerancia}`);
      deudasLog(`  - Fecha límite (vencimiento + tolerancia): ${fechaLimite.toISOString()}`);
      deudasLog(`  - Fecha actual: ${fechaActual.toISOString()}`);
      deudasLog(`  - ¿Está vencida? (fechaActual > fechaLimite): ${estaVencida}`);
      deudasLog(`  - ¿Tiene pago cancelado?: ${tienePago} (total: ${pagosCancelados[0].total})`);
      deudasLog(`  - ¿Tiene deuda? (vencida && !tienePago): ${tieneDeuda}`);
      
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
    
    deudasLog(`[DIAGNOSTICO] ========== RESUMEN FINAL ==========`);
    deudasLog(`[DIAGNOSTICO] Total pensiones verificadas: ${detallesPensiones.length}`);
    deudasLog(`[DIAGNOSTICO] Pensiones con deuda: ${detallesPensiones.filter(p => p.tiene_deuda).length}`);
    deudasLog(`[DIAGNOSTICO] ¿Tiene deudas?: ${tieneDeudas}`);
    deudasLog(`[DIAGNOSTICO] ¿Debe bloquear?: ${colegio.bloquear_deudores === 'SI' && tieneDeudas}`);
    deudasLog(`[DIAGNOSTICO] ====================================`);
    
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
        bloquear_deudores_hasta_mes: colegio.bloquear_deudores_hasta_mes,
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

