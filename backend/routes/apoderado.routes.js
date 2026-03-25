const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query, execute, getAnioActivo } = require('../utils/mysql');
const { authenticateToken, requireUserType } = require('../middleware/auth');
const { enviarPushNotificacionesIndividuales } = require('../services/pushNotificationService');
const { insertNotificacionUsuario } = require('../utils/notificacionInsert');
const { enviarCorreoNotificacion } = require('../services/emailService');
const phpSerialize = require('php-serialize');
const {
  obtenerContextoAlumnoGrupoParaMensaje,
  enriquecerMensajeApoderadoADocente
} = require('../utils/mensajesHijoDocenteContexto');
const { fechaHoraMySQLLima } = require('../utils/fechaHoraLima');

// Configurar multer para subir archivos de mensajes
const mensajesStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = '/home/vanguard/nuevo.vanguardschools.edu.pe/Static/Archivos';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `mensaje-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const fileFilterMensajes = (req, file, cb) => {
  cb(null, true);
};

const uploadMensajes = multer({
  storage: mensajesStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: fileFilterMensajes
});

// Configurar multer para subir fotos de perfil
const personalStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = '/home/vanguard/nuevo.vanguardschools.edu.pe/Static/Image/Fotos';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `apoderado-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  
  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Solo se permiten imágenes (JPEG, JPG, PNG, GIF, WEBP)'));
  }
};

const uploadPersonal = multer({
  storage: personalStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: fileFilter
});

// Configurar multer para fotos de alumnos (editar datos del hijo)
const alumnoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = '/home/vanguard/nuevo.vanguardschools.edu.pe/Static/Image/Fotos';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `alumno-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const uploadAlumnoHijo = multer({
  storage: alumnoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: fileFilter
});

// Todas las rutas requieren autenticación y ser APODERADO
router.use(authenticateToken);
router.use(requireUserType('APODERADO'));

/**
 * GET /api/apoderado/dashboard
 * Obtener datos del dashboard del apoderado
 */
router.get('/dashboard', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo } = req.user;
    
    console.log('📊 [APODERADO DASHBOARD] Iniciando carga para usuario:', usuario_id, 'colegio:', colegio_id, 'año:', anio_activo);

    // Obtener datos del apoderado
    let apoderado = [];
    try {
      apoderado = await query(
        `SELECT ap.*, u.tipo as tipo_usuario
         FROM apoderados ap
         INNER JOIN usuarios u ON u.apoderado_id = ap.id
         WHERE u.id = ? AND u.colegio_id = ? AND u.estado = 'ACTIVO'`,
        [usuario_id, colegio_id]
      );
    } catch (error) {
      console.error('❌ [APODERADO DASHBOARD] Error obteniendo datos del apoderado:', error);
      return res.status(500).json({ error: 'Error al obtener datos del apoderado', details: error.message });
    }

    if (apoderado.length === 0) {
      console.warn('⚠️ [APODERADO DASHBOARD] Apoderado no encontrado para usuario:', usuario_id);
      return res.status(404).json({ error: 'Apoderado no encontrado' });
    }

    const apoderadoData = apoderado[0];
    console.log('✅ [APODERADO DASHBOARD] Apoderado encontrado:', apoderadoData.id);

    // Obtener hijos del apoderado
    const hijos = await query(
      `SELECT DISTINCT
              a.id,
              a.nombres,
              a.apellido_paterno,
              a.apellido_materno,
              a.nro_documento as dni,
              a.foto,
              g.grado,
              g.seccion,
              n.nombre as nivel_nombre,
              t.nombre as turno_nombre,
              m.id as matricula_id
       FROM apoderados ap
       INNER JOIN familias f ON f.apoderado_id = ap.id
       INNER JOIN alumnos a ON a.id = f.alumno_id
       INNER JOIN matriculas m ON m.alumno_id = a.id
       INNER JOIN grupos g ON g.id = m.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN turnos t ON t.id = g.turno_id
       WHERE ap.id = ? 
         AND ap.colegio_id = ?
         AND m.colegio_id = ?
         AND (m.estado = 0 OR m.estado = 4)
         AND g.anio = ?
       ORDER BY n.nombre, g.grado, g.seccion, a.apellido_paterno, a.apellido_materno, a.nombres`,
      [apoderadoData.id, colegio_id, colegio_id, anio_activo]
    );

    // Estadísticas
    const totalHijos = hijos.length;
    
    // Contar total de cursos de todos los hijos
    const totalCursos = await query(
      `SELECT COUNT(DISTINCT a.id) as total
       FROM apoderados ap
       INNER JOIN familias f ON f.apoderado_id = ap.id
       INNER JOIN alumnos al ON al.id = f.alumno_id
       INNER JOIN matriculas m ON m.alumno_id = al.id
       INNER JOIN grupos g ON g.id = m.grupo_id
       INNER JOIN asignaturas a ON a.grupo_id = g.id
       WHERE ap.id = ? 
         AND ap.colegio_id = ?
         AND m.colegio_id = ?
         AND (m.estado = 0 OR m.estado = 4)
         AND g.anio = ?`,
      [apoderadoData.id, colegio_id, colegio_id, anio_activo]
    );

    // Contar total de matrículas de todos los hijos (debe ser igual a totalHijos ya que cada hijo tiene una matrícula en el año activo)
    // Usar totalHijos directamente ya que la consulta de hijos ya filtra por matrículas activas del año actual
    const totalMatriculas = [{ total: totalHijos }];

    // Contar mensajes no leídos
    const mensajesNoLeidos = await query(
      `SELECT COUNT(*) as total
       FROM mensajes m
       WHERE m.destinatario_id = ? 
         AND m.estado = 'NO_LEIDO' 
         AND m.tipo = 'RECIBIDO'
         AND m.borrado = 'NO'`,
      [usuario_id]
    );

    // Obtener IDs de todos los hijos
    const hijosIds = hijos.map(h => h.id);

    // Próximos exámenes (de todos los hijos)
    const proximosExamenes = hijosIds.length > 0 ? await query(
      `SELECT ae.*,
              COALESCE(ae.titulo, 'Examen') as titulo,
              c.nombre as asignatura_nombre,
              a.id as asignatura_id,
              g.grado,
              g.seccion,
              n.nombre as nivel_nombre,
              CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre,
              DATE(ae.fecha_desde) as fecha_evento,
              al.id as alumno_id,
              CONCAT(al.nombres, ' ', al.apellido_paterno) as alumno_nombre
       FROM asignaturas_examenes ae
       INNER JOIN asignaturas a ON a.id = ae.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN cursos c ON c.id = a.curso_id
       INNER JOIN personal p ON p.id = a.personal_id
       INNER JOIN matriculas m ON m.grupo_id = g.id
       INNER JOIN alumnos al ON al.id = m.alumno_id
       WHERE al.id IN (${hijosIds.map(() => '?').join(',')})
         AND a.colegio_id = ? 
         AND g.anio = ?
         AND (m.estado = 0 OR m.estado = 4)
         AND DATE(ae.fecha_desde) >= CURDATE()
       ORDER BY COALESCE(ae.fecha_desde, '9999-12-31') ASC
       LIMIT 20`,
      [...hijosIds, colegio_id, anio_activo]
    ) : [];

    // Próximas tareas (de todos los hijos)
    const proximasTareas = hijosIds.length > 0 ? await query(
      `SELECT t.*,
              t.titulo,
              c.nombre as asignatura_nombre,
              a.id as asignatura_id,
              g.grado,
              g.seccion,
              n.nombre as nivel_nombre,
              CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre,
              DATE(t.fecha_entrega) as fecha_evento,
              al.id as alumno_id,
              CONCAT(al.nombres, ' ', al.apellido_paterno) as alumno_nombre
       FROM asignaturas_tareas t
       INNER JOIN asignaturas a ON a.id = t.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN cursos c ON c.id = a.curso_id
       INNER JOIN personal p ON p.id = a.personal_id
       INNER JOIN matriculas m ON m.grupo_id = g.id
       INNER JOIN alumnos al ON al.id = m.alumno_id
       WHERE al.id IN (${hijosIds.map(() => '?').join(',')})
         AND a.colegio_id = ? 
         AND g.anio = ?
         AND (m.estado = 0 OR m.estado = 4)
         AND DATE(t.fecha_entrega) >= DATE(NOW())
       ORDER BY t.fecha_entrega ASC
       LIMIT 20`,
      [...hijosIds, colegio_id, anio_activo]
    ) : [];

    // Actividades próximas
    const añoActual = new Date().getFullYear();
    const actividades = await query(
      `SELECT a.*,
              DATE(a.fecha_inicio) as fecha_evento
       FROM actividades a
       WHERE a.colegio_id = ?
       AND YEAR(a.fecha_inicio) = ?
       AND DATE(a.fecha_inicio) >= DATE(NOW())
       ORDER BY a.fecha_inicio ASC
       LIMIT 10`,
      [colegio_id, añoActual]
    );

    // Obtener comunicado con show_in_home activo
    const comunicadoHome = await query(
      `SELECT c.*
       FROM comunicados c
       WHERE c.colegio_id = ? AND c.estado = 'ACTIVO' AND c.show_in_home = 1
       ORDER BY c.fecha_hora DESC
       LIMIT 1`,
      [colegio_id]
    );

    // Construir URL del archivo del comunicado si existe
    let comunicadoHomeData = null;
    if (comunicadoHome.length > 0) {
      const com = comunicadoHome[0];
      let archivoUrl = null;
      
      if (com.archivo && com.archivo.trim() !== '') {
        const nombreArchivo = com.archivo.trim();
        const esSistemaNuevo = nombreArchivo.startsWith('/uploads/comunicados/') || 
                               nombreArchivo.startsWith('uploads/comunicados/');
        const isProduction = process.env.NODE_ENV === 'production';
        const dominioBase = 'https://nuevo.vanguardschools.edu.pe';
        
        if (esSistemaNuevo) {
          archivoUrl = isProduction
            ? `https://nuevo.vanguardschools.edu.pe${nombreArchivo.startsWith('/') ? nombreArchivo : '/' + nombreArchivo}`
            : `http://localhost:5000${nombreArchivo.startsWith('/') ? nombreArchivo : '/' + nombreArchivo}`;
        } else {
          if (nombreArchivo.startsWith('/Static/')) {
            archivoUrl = `${dominioBase}${nombreArchivo}`;
          } else if (nombreArchivo.startsWith('Static/')) {
            archivoUrl = `${dominioBase}/${nombreArchivo}`;
          } else {
            archivoUrl = `${dominioBase}/Static/Archivos/${nombreArchivo}`;
          }
        }
      }
      
      comunicadoHomeData = {
        ...com,
        archivo_url: archivoUrl
      };
    }

    // Construir URL de foto
    let fotoUrl = null;
    if (apoderadoData.foto && apoderadoData.foto !== '') {
      const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://nuevo.vanguardschools.edu.pe';
      const isProduction = process.env.NODE_ENV === 'production';
      if (isProduction) {
        fotoUrl = `${phpSystemUrl}/Static/Image/Fotos/${apoderadoData.foto}`;
      } else {
        fotoUrl = `http://localhost:5000/Static/Image/Fotos/${apoderadoData.foto}`;
      }
    }

    const responseData = {
      apoderado: {
        id: apoderadoData.id,
        nombres: apoderadoData.nombres || 'Apoderado',
        apellido_paterno: apoderadoData.apellido_paterno || '',
        apellido_materno: apoderadoData.apellido_materno || '',
        foto: fotoUrl
      },
      estadisticas: {
        totalHijos: totalHijos,
        totalCursos: totalCursos[0]?.total || 0,
        totalMatriculas: totalMatriculas[0]?.total || 0,
        mensajesNoLeidos: mensajesNoLeidos[0]?.total || 0
      },
      proximosExamenes: proximosExamenes || [],
      proximasTareas: proximasTareas || [],
      proximasActividades: actividades || [],
      comunicadoHome: comunicadoHomeData
    };
    
    console.log('✅ [APODERADO DASHBOARD] Datos cargados exitosamente:', {
      estadisticas: responseData.estadisticas,
      examenes: responseData.proximosExamenes.length,
      tareas: responseData.proximasTareas.length,
      actividades: responseData.proximasActividades.length
    });
    
    res.json(responseData);
  } catch (error) {
    console.error('❌ [APODERADO DASHBOARD] Error general:', error);
    console.error('❌ [APODERADO DASHBOARD] Stack:', error.stack);
    res.status(500).json({ 
      error: 'Error al obtener datos del dashboard',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/apoderado/hijos
 * Obtener lista de hijos del apoderado
 */
router.get('/hijos', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo } = req.user;

    // Obtener datos del apoderado
    const apoderado = await query(
      `SELECT ap.id
       FROM apoderados ap
       INNER JOIN usuarios u ON u.apoderado_id = ap.id
       WHERE u.id = ? AND u.colegio_id = ? AND u.estado = 'ACTIVO'`,
      [usuario_id, colegio_id]
    );

    if (apoderado.length === 0) {
      return res.status(404).json({ error: 'Apoderado no encontrado' });
    }

    const apoderadoData = apoderado[0];

    // Obtener hijos del apoderado
    const hijos = await query(
      `SELECT DISTINCT
              a.id,
              a.nombres,
              a.apellido_paterno,
              a.apellido_materno,
              a.nro_documento as dni,
              a.foto,
              g.grado,
              g.seccion,
              n.nombre as nivel_nombre,
              t.nombre as turno_nombre,
              m.id as matricula_id
       FROM apoderados ap
       INNER JOIN familias f ON f.apoderado_id = ap.id
       INNER JOIN alumnos a ON a.id = f.alumno_id
       INNER JOIN matriculas m ON m.alumno_id = a.id
       INNER JOIN grupos g ON g.id = m.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN turnos t ON t.id = g.turno_id
       WHERE ap.id = ? 
         AND ap.colegio_id = ?
         AND m.colegio_id = ?
         AND (m.estado = 0 OR m.estado = 4)
         AND g.anio = ?
       ORDER BY n.nombre, g.grado, g.seccion, a.apellido_paterno, a.apellido_materno, a.nombres`,
      [apoderadoData.id, colegio_id, colegio_id, anio_activo]
    );

    // Construir URLs de fotos
    const hijosConFotos = hijos.map(hijo => {
      let fotoUrl = null;
      if (hijo.foto && hijo.foto !== '') {
        const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://nuevo.vanguardschools.edu.pe';
        const isProduction = process.env.NODE_ENV === 'production';
        if (isProduction) {
          fotoUrl = `${phpSystemUrl}/Static/Image/Fotos/${hijo.foto}`;
        } else {
          fotoUrl = `http://localhost:5000/Static/Image/Fotos/${hijo.foto}`;
        }
      }
      return {
        ...hijo,
        foto: fotoUrl
      };
    });

    res.json({
      hijos: hijosConFotos
    });
  } catch (error) {
    console.error('Error obteniendo hijos:', error);
    res.status(500).json({ error: 'Error al obtener hijos' });
  }
});

/**
 * GET /api/apoderado/perfil
 * Obtener perfil del apoderado
 */
router.get('/perfil', async (req, res) => {
  try {
    const { usuario_id, colegio_id } = req.user;

    const apoderado = await query(
      `SELECT ap.*, u.usuario as dni, ap.nro_documento
       FROM apoderados ap
       INNER JOIN usuarios u ON u.apoderado_id = ap.id
       WHERE u.id = ? AND u.colegio_id = ? AND u.estado = 'ACTIVO'`,
      [usuario_id, colegio_id]
    );

    if (apoderado.length === 0) {
      return res.status(404).json({ error: 'Apoderado no encontrado' });
    }

    const apoderadoData = apoderado[0];

    res.json({
      ...apoderadoData,
      nro_documento: apoderadoData.nro_documento || apoderadoData.dni
    });
  } catch (error) {
    console.error('Error obteniendo perfil:', error);
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
});

/**
 * PUT /api/apoderado/perfil
 * Actualizar perfil del apoderado
 */
router.put('/perfil', async (req, res) => {
  try {
    const { usuario_id, colegio_id } = req.user;
    const { nombres, apellido_paterno, apellido_materno, estado_civil, telefono_celular, direccion, fecha_nacimiento, email } = req.body;

    // Obtener apoderado_id
    const apoderado = await query(
      `SELECT ap.id
       FROM apoderados ap
       INNER JOIN usuarios u ON u.apoderado_id = ap.id
       WHERE u.id = ? AND u.colegio_id = ? AND u.estado = 'ACTIVO'`,
      [usuario_id, colegio_id]
    );

    if (apoderado.length === 0) {
      return res.status(404).json({ error: 'Apoderado no encontrado' });
    }

    const apoderadoId = apoderado[0].id;

    // Actualizar datos
    const updateFields = [];
    const updateValues = [];

    if (nombres !== undefined && nombres !== '') {
      updateFields.push('nombres = ?');
      updateValues.push(nombres);
    }

    if (apellido_paterno !== undefined && apellido_paterno !== '') {
      updateFields.push('apellido_paterno = ?');
      updateValues.push(apellido_paterno);
    }

    if (apellido_materno !== undefined) {
      updateFields.push('apellido_materno = ?');
      updateValues.push(apellido_materno);
    }

    if (estado_civil !== undefined && estado_civil !== null && estado_civil !== '') {
      updateFields.push('estado_civil = ?');
      updateValues.push(parseInt(estado_civil));
    }

    if (telefono_celular !== undefined) {
      updateFields.push('telefono_celular = ?');
      updateValues.push(telefono_celular);
    }

    if (direccion !== undefined) {
      updateFields.push('direccion = ?');
      updateValues.push(direccion);
    }

    if (fecha_nacimiento !== undefined && fecha_nacimiento !== '') {
      updateFields.push('fecha_nacimiento = ?');
      updateValues.push(fecha_nacimiento);
    }

    if (email !== undefined && email !== '') {
      updateFields.push('email = ?');
      updateValues.push(email);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    updateValues.push(apoderadoId);
    updateValues.push(colegio_id);

    await execute(
      `UPDATE apoderados 
       SET ${updateFields.join(', ')}
       WHERE id = ? AND colegio_id = ?`,
      updateValues
    );

    // Obtener apoderado actualizado
    const apoderadoActualizado = await query(
      `SELECT ap.*, u.usuario as dni, ap.nro_documento
       FROM apoderados ap
       INNER JOIN usuarios u ON u.apoderado_id = ap.id
       WHERE ap.id = ? AND ap.colegio_id = ?`,
      [apoderadoId, colegio_id]
    );

    res.json({
      ...apoderadoActualizado[0],
      nro_documento: apoderadoActualizado[0].nro_documento || apoderadoActualizado[0].dni
    });
  } catch (error) {
    console.error('Error actualizando perfil:', error);
    res.status(500).json({ error: 'Error al actualizar perfil' });
  }
});

/**
 * PUT /api/apoderado/perfil/password
 * Cambiar contraseña del apoderado
 */
router.put('/perfil/password', async (req, res) => {
  try {
    const { usuario_id } = req.user;
    const { password_actual, password_nueva } = req.body;

    if (!password_actual || !password_nueva) {
      return res.status(400).json({ error: 'Contraseña actual y nueva son requeridas' });
    }

    // Verificar contraseña actual
    const usuario = await query(
      `SELECT u.*
       FROM usuarios u
       WHERE u.id = ? AND u.estado = 'ACTIVO'`,
      [usuario_id]
    );

    if (usuario.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const bcrypt = require('bcrypt');
    const passwordValida = await bcrypt.compare(password_actual, usuario[0].password);

    if (!passwordValida) {
      return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    }

    // Hashear nueva contraseña
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password_nueva, saltRounds);

    // Actualizar contraseña
    await execute(
      `UPDATE usuarios 
       SET password = ?
       WHERE id = ?`,
      [passwordHash, usuario_id]
    );

    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (error) {
    console.error('Error cambiando contraseña:', error);
    res.status(500).json({ error: 'Error al cambiar contraseña' });
  }
});

/**
 * GET /api/apoderado/comunicados
 * Obtener comunicados (solo lectura, generados por admin)
 */
router.get('/comunicados', async (req, res) => {
  try {
    const { colegio_id, anio_activo } = req.user;
    const { page = 1, limit = 12, search = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let querySql = `
      SELECT c.*
       FROM comunicados c
       WHERE c.colegio_id = ? AND YEAR(c.fecha_hora) = ? AND c.estado = 'ACTIVO'
    `;
    const params = [colegio_id, anio_activo];

    if (search && search.trim() !== '') {
      querySql += ` AND (c.descripcion LIKE ? OR c.contenido LIKE ?)`;
      const searchPattern = `%${search.trim()}%`;
      params.push(searchPattern, searchPattern);
    }

    const countQuery = querySql.replace('SELECT c.*', 'SELECT COUNT(*) as total');
    const countResult = await query(countQuery, params);
    const total = countResult[0]?.total || 0;

    querySql += ` ORDER BY c.fecha_hora DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);

    const comunicados = await query(querySql, params);

    // Construir URLs de archivos
    const fs = require('fs');
    const staticArchivosPath = '/home/vanguard/nuevo.vanguardschools.edu.pe/Static/Archivos';
    
    const comunicadosConUrls = (comunicados || []).map(com => {
      let archivoUrl = null;
      let archivoExiste = false;
      
      if (com.archivo && com.archivo.trim() !== '') {
        let nombreArchivo = com.archivo.trim();
        const isProduction = process.env.NODE_ENV === 'production';
        
        const esSistemaNuevo = nombreArchivo.startsWith('/uploads/comunicados/') || 
                               nombreArchivo.startsWith('uploads/comunicados/');
        
        if (esSistemaNuevo) {
          if (nombreArchivo.startsWith('/uploads/')) {
            archivoUrl = isProduction
              ? `https://nuevo.vanguardschools.edu.pe${nombreArchivo}`
              : `http://localhost:5000${nombreArchivo}`;
          } else {
            archivoUrl = isProduction
              ? `https://nuevo.vanguardschools.edu.pe/${nombreArchivo}`
              : `http://localhost:5000/${nombreArchivo}`;
          }
        } else {
          const dominioBase = 'https://nuevo.vanguardschools.edu.pe';
          if (nombreArchivo.startsWith('/Static/')) {
            archivoUrl = `${dominioBase}${nombreArchivo}`;
          } else if (nombreArchivo.startsWith('Static/')) {
            archivoUrl = `${dominioBase}/${nombreArchivo}`;
          } else {
            archivoUrl = `${dominioBase}/Static/Archivos/${nombreArchivo}`;
          }
        }
      }

      return {
        ...com,
        archivo_url: archivoUrl
      };
    });

    res.json({
      comunicados: comunicadosConUrls,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error obteniendo comunicados:', error);
    res.status(500).json({ error: 'Error al obtener comunicados' });
  }
});

/**
 * GET /api/apoderado/actividades
 * Obtener actividades del año
 */
router.get('/actividades', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const { anio } = req.query;
    const añoFiltro = anio ? parseInt(anio) : new Date().getFullYear();

    const actividades = await query(
      `SELECT a.*
       FROM actividades a
       WHERE a.colegio_id = ?
       AND YEAR(a.fecha_inicio) = ?
       ORDER BY a.fecha_inicio ASC`,
      [colegio_id, añoFiltro]
    );

    res.json({
      actividades: actividades || [],
      anio: añoFiltro
    });
  } catch (error) {
    console.error('Error obteniendo actividades:', error);
    res.status(500).json({ error: 'Error al obtener actividades' });
  }
});

/**
 * GET /api/apoderado/notificaciones
 * Obtener notificaciones del apoderado (incluye notificaciones de sus hijos)
 */
router.get('/notificaciones', async (req, res) => {
  try {
    const { usuario_id, colegio_id, apoderado_id } = req.user;

    // Obtener usuario_id de todos los hijos del apoderado
    const hijosUsuarios = await query(
      `SELECT DISTINCT u.id as usuario_id
       FROM alumnos a
       INNER JOIN familias f ON f.alumno_id = a.id
       INNER JOIN usuarios u ON u.alumno_id = a.id
       WHERE f.apoderado_id = ?
         AND a.colegio_id = ?
         AND u.colegio_id = ?
         AND u.estado = 'ACTIVO'`,
      [apoderado_id, colegio_id, colegio_id]
    );

    const hijosUsuarioIds = hijosUsuarios.map(h => h.usuario_id);
    const todosDestinatariosIds = [usuario_id, ...hijosUsuarioIds];

    // Obtener notificaciones para el apoderado Y para sus hijos
    // NOTA: La tabla notificaciones NO tiene colegio_id, solo filtra por para y destinatario_id
    let notificaciones = [];
    
    if (todosDestinatariosIds.length > 0) {
      const placeholders = todosDestinatariosIds.map(() => '?').join(',');
      notificaciones = await query(
        `SELECT 
           n.id,
           n.asunto as titulo,
           n.contenido as mensaje,
           n.fecha_hora,
           n.estado,
           COALESCE(n.leida, 0) as leida,
           n.accion_tipo,
           n.accion_payload,
           n.url_destino,
           n.destinatario_id,
           'NOTIFICACION' as tipo_origen
         FROM notificaciones n
         WHERE (n.para = 'TODOS' OR (n.para = 'USUARIO' AND n.destinatario_id IN (${placeholders})))
         ORDER BY n.fecha_hora DESC
         LIMIT 30`,
        todosDestinatariosIds
      );
    } else {
      // Si no tiene hijos, solo mostrar notificaciones directas al apoderado
      notificaciones = await query(
        `SELECT 
           n.id,
           n.asunto as titulo,
           n.contenido as mensaje,
           n.fecha_hora,
           n.estado,
           COALESCE(n.leida, 0) as leida,
           n.accion_tipo,
           n.accion_payload,
           n.url_destino,
           n.destinatario_id,
           'NOTIFICACION' as tipo_origen
         FROM notificaciones n
         WHERE (n.para = 'TODOS' OR (n.para = 'USUARIO' AND n.destinatario_id = ?))
         ORDER BY n.fecha_hora DESC
         LIMIT 30`,
        [usuario_id]
      );
    }

    const parsePayloadAp = (raw) => {
      if (raw == null || raw === '') return null;
      if (typeof raw === 'object') return raw;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    };

    // Mapear campos para compatibilidad con el frontend
    const notificacionesMapeadas = (notificaciones || []).map(n => ({
      id: n.id,
      titulo: n.titulo || 'Notificación del sistema',
      mensaje: n.mensaje || n.contenido || '',
      fecha_hora: n.fecha_hora,
      estado: (n.leida === 1 || n.leida === true) ? 'LEIDO' : 'NO_LEIDO',
      tipo_origen: n.tipo_origen || 'NOTIFICACION',
      accion_tipo: n.accion_tipo || null,
      accion_payload: parsePayloadAp(n.accion_payload),
      url_destino: n.url_destino || null,
      destinatario_id: n.destinatario_id
    }));

    res.json({ notificaciones: notificacionesMapeadas });
  } catch (error) {
    console.error('Error obteniendo notificaciones:', error);
    res.status(500).json({ error: 'Error al obtener notificaciones' });
  }
});

/**
 * PUT /api/apoderado/notificaciones/:id/marcar-leido
 * Marcar notificación como leída
 */
router.put('/notificaciones/:id/marcar-leido', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario_id, apoderado_id, colegio_id } = req.user;

    const hijosUsuarios = await query(
      `SELECT DISTINCT u.id as usuario_id FROM alumnos a
       INNER JOIN familias f ON f.alumno_id = a.id
       INNER JOIN usuarios u ON u.alumno_id = a.id
       WHERE f.apoderado_id = ? AND a.colegio_id = ? AND u.colegio_id = ? AND u.estado = 'ACTIVO'`,
      [apoderado_id, colegio_id, colegio_id]
    );
    const hijosIds = hijosUsuarios.map(h => h.usuario_id);
    const todosIds = [usuario_id, ...hijosIds];
    const placeholders = todosIds.map(() => '?').join(',');

    const notif = await query(
      `SELECT id FROM notificaciones 
       WHERE id = ? AND (para = 'TODOS' OR (para = 'USUARIO' AND destinatario_id IN (${placeholders})))`,
      [id, ...todosIds]
    );
    if (notif.length === 0) {
      return res.status(404).json({ error: 'Notificación no encontrada' });
    }

    await execute(`UPDATE notificaciones SET leida = 1 WHERE id = ?`, [id]);
    res.json({ success: true, message: 'Notificación marcada como leída' });
  } catch (error) {
    console.error('Error marcando notificación como leída:', error);
    res.status(500).json({ error: 'Error al marcar como leída' });
  }
});

/**
 * Helper: Verificar que el apoderado tiene permisos sobre el hijo y obtener usuario_id del hijo
 */
async function verificarHijoYUsuarioApoderado(req, hijoId) {
  const { colegio_id, apoderado_id } = req.user;
  
  if (!hijoId || isNaN(parseInt(hijoId))) {
    throw new Error('ID de alumno inválido');
  }

  const hijoIdNum = parseInt(hijoId);

  if (!apoderado_id) {
    throw new Error('Información de usuario incompleta. No se encontró apoderado_id.');
  }

  // Verificar que el alumno es hijo del apoderado
  const esHijo = await query(
    `SELECT COUNT(*) as count
     FROM apoderados ap
     INNER JOIN familias f ON f.apoderado_id = ap.id
     INNER JOIN alumnos a ON a.id = f.alumno_id
     WHERE ap.id = ?
       AND a.id = ?
       AND a.colegio_id = ?`,
    [apoderado_id, hijoIdNum, colegio_id]
  );

  if (!esHijo || esHijo.length === 0 || esHijo[0].count === 0) {
    throw new Error('No tienes permisos. El alumno no está registrado como tu hijo.');
  }

  // Obtener usuario_id del hijo
  const usuarioHijo = await query(
    `SELECT u.id as usuario_id, a.id as alumno_id
     FROM alumnos a
     INNER JOIN usuarios u ON u.alumno_id = a.id AND u.estado = 'ACTIVO'
     WHERE a.id = ? AND a.colegio_id = ?`,
    [hijoIdNum, colegio_id]
  );

  if (!usuarioHijo || usuarioHijo.length === 0) {
    throw new Error('El alumno no tiene un usuario activo.');
  }

  return {
    hijoId: hijoIdNum,
    usuarioIdHijo: usuarioHijo[0].usuario_id,
    alumnoId: usuarioHijo[0].alumno_id
  };
}

/**
 * Verifica que el alumno es hijo del apoderado (sin exigir que el alumno tenga usuario activo).
 */
async function verificarSoloVinculoApoderadoAlumno(req, hijoId) {
  const { colegio_id, apoderado_id } = req.user;
  if (!hijoId || isNaN(parseInt(hijoId))) {
    throw new Error('ID de alumno inválido');
  }
  const hijoIdNum = parseInt(hijoId, 10);
  if (!apoderado_id) {
    throw new Error('Información de usuario incompleta. No se encontró apoderado_id.');
  }
  const esHijo = await query(
    `SELECT COUNT(*) as count
     FROM apoderados ap
     INNER JOIN familias f ON f.apoderado_id = ap.id
     INNER JOIN alumnos a ON a.id = f.alumno_id
     WHERE ap.id = ?
       AND a.id = ?
       AND a.colegio_id = ?`,
    [apoderado_id, hijoIdNum, colegio_id]
  );
  if (!esHijo || esHijo.length === 0 || esHijo[0].count === 0) {
    throw new Error('No tienes permisos. El alumno no está registrado como tu hijo.');
  }
  return { hijoIdNum };
}

/**
 * GET /api/apoderado/hijos/:hijoId/cursos
 * Obtener cursos asignados del hijo
 */
router.get('/hijos/:hijoId/cursos', async (req, res) => {
  try {
    const { hijoId } = req.params;
    const { colegio_id, apoderado_id, anio_activo } = req.user;

    if (!hijoId || isNaN(parseInt(hijoId))) {
      return res.status(400).json({ error: 'ID de alumno inválido' });
    }

    const hijoIdNum = parseInt(hijoId);

    if (!apoderado_id) {
      return res.status(400).json({ error: 'Información de usuario incompleta.' });
    }

    // Verificar que el alumno es hijo del apoderado
    const esHijo = await query(
      `SELECT COUNT(*) as count
       FROM apoderados ap
       INNER JOIN familias f ON f.apoderado_id = ap.id
       INNER JOIN alumnos a ON a.id = f.alumno_id
       WHERE ap.id = ?
         AND a.id = ?
         AND a.colegio_id = ?`,
      [apoderado_id, hijoIdNum, colegio_id]
    );

    if (!esHijo || esHijo.length === 0 || esHijo[0].count === 0) {
      return res.status(403).json({ error: 'No tienes permisos para ver estos cursos.' });
    }

    // Obtener matrícula actual del alumno
    const matricula = await query(
      `SELECT m.*, m.grupo_id
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0 OR m.estado = 4)
       LIMIT 1`,
      [hijoIdNum, colegio_id, anio_activo]
    );

    const matriculaData = matricula.length > 0 ? matricula[0] : null;
    const grupoId = matriculaData ? matriculaData.grupo_id : null;

    if (!grupoId) {
      return res.json({ cursos: [] });
    }

    // Obtener asignaturas (cursos) del alumno
    const cursos = await query(
      `SELECT DISTINCT
              a.id as asignatura_id,
              c.id as curso_id,
              c.nombre as curso_nombre,
              c.imagen as curso_imagen,
              CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre,
              p.id as docente_id,
              p.foto as docente_foto,
              (SELECT u.id FROM usuarios u 
               WHERE u.personal_id = p.id AND u.estado = 'ACTIVO' 
               LIMIT 1) as docente_usuario_id,
              a.aula_virtual as link_aula_virtual
       FROM asignaturas a
       INNER JOIN cursos c ON c.id = a.curso_id
       INNER JOIN personal p ON p.id = a.personal_id
       WHERE a.grupo_id = ? AND a.colegio_id = ?
       ORDER BY c.nombre ASC`,
      [grupoId, colegio_id]
    );

    // Construir URLs de imágenes
    const cursosConImagenes = cursos.map(curso => {
      let cursoImagenUrl = null;
      if (curso.curso_imagen && curso.curso_imagen !== '') {
        const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://nuevo.vanguardschools.edu.pe';
        const isProduction = process.env.NODE_ENV === 'production';
        if (isProduction) {
          cursoImagenUrl = `${phpSystemUrl}/Static/Image/Cursos/${curso.curso_imagen}`;
        } else {
          cursoImagenUrl = `http://localhost:5000/Static/Image/Cursos/${curso.curso_imagen}`;
        }
      }
      
      // Construir URL de foto del docente
      let docenteFotoUrl = null;
      if (curso.docente_foto && curso.docente_foto !== '') {
        const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://nuevo.vanguardschools.edu.pe';
        const isProduction = process.env.NODE_ENV === 'production';
        if (isProduction) {
          docenteFotoUrl = `${phpSystemUrl}/Static/Image/Fotos/${curso.docente_foto}`;
        } else {
          docenteFotoUrl = `http://localhost:5000/Static/Image/Fotos/${curso.docente_foto}`;
        }
      }
      
      return {
        ...curso,
        curso_imagen_url: cursoImagenUrl,
        docente_foto_url: docenteFotoUrl,
        docente_usuario_id: curso.docente_usuario_id
      };
    });

    res.json({ cursos: cursosConImagenes });
  } catch (error) {
    console.error('Error obteniendo cursos:', error);
    res.status(500).json({ error: 'Error al obtener cursos', details: error.message });
  }
});

/**
 * GET /api/apoderado/hijos/:hijoId/horario
 * Obtener horario del hijo
 */
router.get('/hijos/:hijoId/horario', async (req, res) => {
  try {
    const { hijoId } = req.params;
    const { colegio_id, apoderado_id, anio_activo } = req.user;

    if (!hijoId || isNaN(parseInt(hijoId))) {
      return res.status(400).json({ error: 'ID de alumno inválido' });
    }

    const hijoIdNum = parseInt(hijoId);

    if (!apoderado_id) {
      return res.status(400).json({ error: 'Información de usuario incompleta.' });
    }

    // Verificar que el alumno es hijo del apoderado
    const esHijo = await query(
      `SELECT COUNT(*) as count
       FROM apoderados ap
       INNER JOIN familias f ON f.apoderado_id = ap.id
       INNER JOIN alumnos a ON a.id = f.alumno_id
       WHERE ap.id = ?
         AND a.id = ?
         AND a.colegio_id = ?`,
      [apoderado_id, hijoIdNum, colegio_id]
    );

    if (!esHijo || esHijo.length === 0 || esHijo[0].count === 0) {
      return res.status(403).json({ error: 'No tienes permisos para ver este horario.' });
    }

    // Obtener matrícula actual del alumno
    const matricula = await query(
      `SELECT m.grupo_id FROM matriculas m 
       INNER JOIN grupos g ON g.id = m.grupo_id 
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0 OR m.estado = 4) 
       LIMIT 1`,
      [hijoIdNum, colegio_id, anio_activo]
    );

    if (matricula.length === 0) {
      return res.json({ horario: [] });
    }

    const grupoId = matricula[0].grupo_id;
    const anioActivoInt = parseInt(anio_activo);

    // Obtener horario del grupo
    const horarioCrudo = await query(
      `SELECT 
         gh.id,
         gh.dia,
         gh.hora_inicio,
         gh.hora_final,
         gh.anio,
         c.nombre AS curso_nombre,
         gh.descripcion AS descripcion,
         g.grado,
         g.seccion,
         n.nombre AS nivel_nombre,
         CONCAT(p.nombres, ' ', p.apellidos) AS docente_nombre
       FROM grupos_horarios gh
       LEFT JOIN asignaturas a ON a.id = gh.asignatura_id AND a.colegio_id = ?
       LEFT JOIN grupos g ON g.id = COALESCE(a.grupo_id, gh.grupo_id)
       LEFT JOIN niveles n ON n.id = g.nivel_id
       LEFT JOIN cursos c ON c.id = a.curso_id
       LEFT JOIN personal p ON p.id = COALESCE(a.personal_id, gh.personal_id)
       WHERE gh.anio = ? 
         AND (
           (a.grupo_id = ? AND a.colegio_id = ?) 
           OR 
           (gh.grupo_id = ? AND a.id IS NULL)
         )
       ORDER BY gh.dia, 
         TIME(STR_TO_DATE(gh.hora_inicio, '%l:%i %p')),
         COALESCE(TIME(STR_TO_DATE(gh.hora_inicio, '%H:%i:%s')), TIME(STR_TO_DATE(gh.hora_inicio, '%H:%i')))`,
      [colegio_id, anioActivoInt, grupoId, colegio_id, grupoId]
    );

    // Mapear a un formato estándar
    const horario = (horarioCrudo || []).map((row) => {
      const titulo = row.curso_nombre || row.descripcion || '';
      const grupoTexto = row.nivel_nombre && row.grado && row.seccion
        ? `${row.nivel_nombre} - ${row.grado}° ${row.seccion}`
        : '';

      return {
        id: row.id,
        dia: typeof row.dia === 'number' ? row.dia : parseInt(row.dia || 0, 10),
        inicio: row.hora_inicio,
        fin: row.hora_final,
        anio: row.anio,
        titulo,
        grupo: grupoTexto,
        docente_nombre: row.docente_nombre || ''
      };
    });

    res.json({ horario });
  } catch (error) {
    console.error('Error obteniendo horario:', error);
    res.status(500).json({ error: 'Error al obtener horario', details: error.message });
  }
});

/**
 * GET /api/apoderado/hijos/:hijoId/incidencias
 * Obtener todas las incidencias del hijo
 */
router.get('/hijos/:hijoId/incidencias', async (req, res) => {
  try {
    const { hijoId } = req.params;
    const { colegio_id, apoderado_id, anio_activo } = req.user;

    if (!hijoId || isNaN(parseInt(hijoId))) {
      return res.status(400).json({ error: 'ID de alumno inválido' });
    }

    const hijoIdNum = parseInt(hijoId);

    if (!apoderado_id) {
      return res.status(400).json({ error: 'Información de usuario incompleta.' });
    }

    // Verificar que el alumno es hijo del apoderado
    const esHijo = await query(
      `SELECT COUNT(*) as count
       FROM apoderados ap
       INNER JOIN familias f ON f.apoderado_id = ap.id
       INNER JOIN alumnos a ON a.id = f.alumno_id
       WHERE ap.id = ?
         AND a.id = ?
         AND a.colegio_id = ?`,
      [apoderado_id, hijoIdNum, colegio_id]
    );

    if (!esHijo || esHijo.length === 0 || esHijo[0].count === 0) {
      return res.status(403).json({ error: 'No tienes permisos para ver estas incidencias.' });
    }

    // Obtener matrícula del alumno
    const matricula = await query(
      `SELECT m.id FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0 OR m.estado = 4)
       LIMIT 1`,
      [hijoIdNum, colegio_id, anio_activo]
    );

    if (!matricula || matricula.length === 0) {
      return res.json({ incidencias: [] });
    }

    const matriculaId = matricula[0].id;

    // Obtener todas las incidencias del alumno (type = 1)
    const incidencias = await query(
      `SELECT ei.id, ei.points, ei.description, ei.created_at, ei.worker_id, ei.assignment_id,
              CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre,
              c.nombre as curso_nombre
       FROM enrollment_incidents ei
       INNER JOIN matriculas m ON m.id = ei.enrollment_id
       INNER JOIN grupos g ON g.id = m.grupo_id
       LEFT JOIN personal p ON p.id = ei.worker_id
       LEFT JOIN asignaturas a ON a.id = ei.assignment_id
       LEFT JOIN cursos c ON c.id = a.curso_id
       WHERE ei.enrollment_id = ? 
         AND ei.type = 1
         AND g.anio = ?
       ORDER BY ei.created_at DESC`,
      [matriculaId, anio_activo]
    );

    res.json({ incidencias: incidencias || [] });
  } catch (error) {
    console.error('Error obteniendo incidencias:', error);
    res.status(500).json({ error: 'Error al obtener incidencias', details: error.message });
  }
});

/**
 * GET /api/apoderado/hijos/:hijoId/estrellas
 * Obtener todas las estrellas del hijo
 */
router.get('/hijos/:hijoId/estrellas', async (req, res) => {
  try {
    const { hijoId } = req.params;
    const { colegio_id, apoderado_id, anio_activo } = req.user;

    if (!hijoId || isNaN(parseInt(hijoId))) {
      return res.status(400).json({ error: 'ID de alumno inválido' });
    }

    const hijoIdNum = parseInt(hijoId);

    if (!apoderado_id) {
      return res.status(400).json({ error: 'Información de usuario incompleta.' });
    }

    // Verificar que el alumno es hijo del apoderado
    const esHijo = await query(
      `SELECT COUNT(*) as count
       FROM apoderados ap
       INNER JOIN familias f ON f.apoderado_id = ap.id
       INNER JOIN alumnos a ON a.id = f.alumno_id
       WHERE ap.id = ?
         AND a.id = ?
         AND a.colegio_id = ?`,
      [apoderado_id, hijoIdNum, colegio_id]
    );

    if (!esHijo || esHijo.length === 0 || esHijo[0].count === 0) {
      return res.status(403).json({ error: 'No tienes permisos para ver estas estrellas.' });
    }

    // Obtener matrícula del alumno
    const matricula = await query(
      `SELECT m.id FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0 OR m.estado = 4)
       LIMIT 1`,
      [hijoIdNum, colegio_id, anio_activo]
    );

    if (!matricula || matricula.length === 0) {
      return res.json({
        estrellas: [],
        total_estrellas: 0
      });
    }

    const matriculaId = matricula[0].id;

    // Obtener todas las estrellas del alumno (type = 2)
    const estrellas = await query(
      `SELECT ei.id, ei.points, ei.description, ei.created_at, ei.worker_id, ei.assignment_id,
              CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre,
              c.nombre as curso_nombre
       FROM enrollment_incidents ei
       INNER JOIN matriculas m ON m.id = ei.enrollment_id
       INNER JOIN grupos g ON g.id = m.grupo_id
       LEFT JOIN personal p ON p.id = ei.worker_id
       LEFT JOIN asignaturas a ON a.id = ei.assignment_id
       LEFT JOIN cursos c ON c.id = a.curso_id
       WHERE ei.enrollment_id = ? 
         AND ei.type = 2
         AND g.anio = ?
       ORDER BY ei.created_at DESC`,
      [matriculaId, anio_activo]
    );

    // Calcular total de estrellas
    const totalEstrellas = estrellas.reduce((sum, e) => sum + (e.points || 0), 0);

    res.json({
      estrellas: estrellas || [],
      total_estrellas: totalEstrellas
    });
  } catch (error) {
    console.error('Error obteniendo estrellas:', error);
    res.status(500).json({ error: 'Error al obtener estrellas', details: error.message });
  }
});

/**
 * GET /api/apoderado/hijos/:hijoId/asistencias
 * Obtener todas las asistencias del hijo
 */
router.get('/hijos/:hijoId/asistencias', async (req, res) => {
  try {
    const { hijoId } = req.params;
    const { colegio_id, apoderado_id, anio_activo } = req.user;

    if (!hijoId || isNaN(parseInt(hijoId))) {
      return res.status(400).json({ error: 'ID de alumno inválido' });
    }

    const hijoIdNum = parseInt(hijoId);

    if (!apoderado_id) {
      return res.status(400).json({ error: 'Información de usuario incompleta.' });
    }

    // Verificar que el alumno es hijo del apoderado
    const esHijo = await query(
      `SELECT COUNT(*) as count
       FROM apoderados ap
       INNER JOIN familias f ON f.apoderado_id = ap.id
       INNER JOIN alumnos a ON a.id = f.alumno_id
       WHERE ap.id = ?
         AND a.id = ?
         AND a.colegio_id = ?`,
      [apoderado_id, hijoIdNum, colegio_id]
    );

    if (!esHijo || esHijo.length === 0 || esHijo[0].count === 0) {
      return res.status(403).json({ error: 'No tienes permisos para ver estas asistencias.' });
    }

    // Obtener matrícula del alumno
    const matricula = await query(
      `SELECT m.id FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0 OR m.estado = 4)
       LIMIT 1`,
      [hijoIdNum, colegio_id, anio_activo]
    );

    if (!matricula || matricula.length === 0) {
      return res.json({
        asistencias: [],
        total_presentes: 0,
        total_tardanzas: 0,
        total_faltas: 0
      });
    }

    const matriculaId = matricula[0].id;

    // Obtener todas las asistencias del alumno
    const asistencias = await query(
      `SELECT ma.id, ma.fecha, ma.tipo, ma.hora_entrada, ma.hora_salida, ma.created_at
       FROM matriculas_asistencias ma
       WHERE ma.matricula_id = ?
       ORDER BY ma.fecha DESC`,
      [matriculaId]
    );

    // Calcular estadísticas
    const totalPresentes = asistencias.filter(a => a.tipo === 'PRESENTE' || a.tipo === 'TARDANZA_JUSTIFICADA').length;
    const totalTardanzas = asistencias.filter(a => a.tipo === 'TARDANZA' || a.tipo === 'TARDANZA_JUSTIFICADA').length;
    const totalFaltas = asistencias.filter(a => a.tipo === 'FALTA' || a.tipo === 'FALTA_JUSTIFICADA').length;

    res.json({
      asistencias: asistencias || [],
      total_presentes: totalPresentes,
      total_tardanzas: totalTardanzas,
      total_faltas: totalFaltas
    });
  } catch (error) {
    console.error('Error obteniendo asistencias:', error);
    res.status(500).json({ error: 'Error al obtener asistencias', details: error.message });
  }
});

/**
 * GET /api/apoderado/hijos/:hijoId/qr
 * Obtener datos para QR del hijo
 */
router.get('/hijos/:hijoId/qr', async (req, res) => {
  try {
    const { hijoId } = req.params;
    const { colegio_id, apoderado_id, anio_activo } = req.user;

    if (!hijoId || isNaN(parseInt(hijoId))) {
      return res.status(400).json({ error: 'ID de alumno inválido' });
    }

    const hijoIdNum = parseInt(hijoId);

    if (!apoderado_id) {
      return res.status(400).json({ error: 'Información de usuario incompleta.' });
    }

    // Verificar que el alumno es hijo del apoderado
    const esHijo = await query(
      `SELECT COUNT(*) as count
       FROM apoderados ap
       INNER JOIN familias f ON f.apoderado_id = ap.id
       INNER JOIN alumnos a ON a.id = f.alumno_id
       WHERE ap.id = ?
         AND a.id = ?
         AND a.colegio_id = ?`,
      [apoderado_id, hijoIdNum, colegio_id]
    );

    if (!esHijo || esHijo.length === 0 || esHijo[0].count === 0) {
      return res.status(403).json({ error: 'No tienes permisos para ver este QR.' });
    }

    // Obtener datos del alumno (incl. foto para carnet QR)
    const alumno = await query(
      `SELECT a.id, a.nombres, a.apellido_paterno, a.apellido_materno, a.foto, u.usuario as nro_documento
       FROM alumnos a
       LEFT JOIN usuarios u ON u.alumno_id = a.id AND u.colegio_id = a.colegio_id AND u.estado = 'ACTIVO'
       WHERE a.id = ? AND a.colegio_id = ?`,
      [hijoIdNum, colegio_id]
    );

    if (!alumno || alumno.length === 0) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }

    const alumnoData = alumno[0];

    // Obtener matrícula actual del alumno
    const matricula = await query(
      `SELECT m.*, 
              g.grado, 
              g.seccion,
              n.nombre as nivel_nombre
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0 OR m.estado = 4)
       LIMIT 1`,
      [alumnoData.id, colegio_id, anio_activo]
    );

    // Obtener nombre del colegio
    const colegio = await query(
      `SELECT nombre FROM colegios WHERE id = ?`,
      [colegio_id]
    );

    const colegioNombre = colegio.length > 0 ? colegio[0].nombre : 'Vanguard Schools';
    const matriculaData = matricula.length > 0 ? matricula[0] : null;

    // Datos del apoderado (para carnet: Apoderado, Celular, Dirección)
    const apoderadoInfo = await query(
      `SELECT CONCAT(ap.nombres, ' ', ap.apellido_paterno, ' ', ap.apellido_materno) as nombre_completo,
              ap.telefono_celular,
              ap.direccion
       FROM apoderados ap
       WHERE ap.id = ? AND ap.colegio_id = ?`,
      [apoderado_id, colegio_id]
    );
    const apoderadoData = apoderadoInfo && apoderadoInfo.length > 0 ? apoderadoInfo[0] : null;
    const apoderado_nombre = apoderadoData ? (apoderadoData.nombre_completo || '').trim() : '';
    const apoderado_celular = apoderadoData ? (apoderadoData.telefono_celular || '').trim() : '';
    const direccion = apoderadoData ? (apoderadoData.direccion || '').trim() : '';

    // Construir texto del grupo
    let grupoTexto = '';
    if (matriculaData) {
      const gradoTexto = matriculaData.grado ? `${matriculaData.grado}°` : '';
      grupoTexto = `${matriculaData.nivel_nombre || ''} ${gradoTexto} ${matriculaData.seccion || ''}`.trim();
    }

    // Generar código QR
    const qrData = alumnoData.nro_documento || `ALUMNO-${alumnoData.id}`;

    // Foto y logo en base64 para el carnet (evita CORS; el backend lee desde disco)
    let foto_url = null;
    let foto_base64 = null;
    if (alumnoData.foto && alumnoData.foto.trim() !== '') {
      const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://nuevo.vanguardschools.edu.pe';
      const isProduction = process.env.NODE_ENV === 'production';
      foto_url = isProduction
        ? `${phpSystemUrl}/Static/Image/Fotos/${alumnoData.foto}`
        : `http://localhost:5000/Static/Image/Fotos/${alumnoData.foto}`;
      const baseFotosPath = process.env.STATIC_FOTOS_PATH || path.join(__dirname, '..', 'Static', 'Image', 'Fotos');
      let fotoPath = path.join(baseFotosPath, path.basename(alumnoData.foto));
      if (!fs.existsSync(fotoPath) && process.env.NODE_ENV === 'production') {
        fotoPath = path.join('/home/vanguard/nuevo.vanguardschools.edu.pe/Static/Image/Fotos', path.basename(alumnoData.foto));
      }
      try {
        if (fs.existsSync(fotoPath)) {
          const buf = fs.readFileSync(fotoPath);
          const ext = (path.extname(alumnoData.foto) || '').toLowerCase();
          const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
          foto_base64 = `data:${mime};base64,${buf.toString('base64')}`;
        }
      } catch (e) { /* ignorar */ }
    }

    let logo_url = null;
    let logo_base64 = null;
    const configLogo = await query(`SELECT valor FROM config WHERE clave = 'boleta_logo' LIMIT 1`);
    if (configLogo && configLogo.length > 0 && configLogo[0].valor) {
      const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://nuevo.vanguardschools.edu.pe';
      const isProduction = process.env.NODE_ENV === 'production';
      logo_url = isProduction
        ? `${phpSystemUrl}/Static/Archivos/${configLogo[0].valor}`
        : `http://localhost:5000/Static/Archivos/${configLogo[0].valor}`;
      const baseArchivosPath = process.env.STATIC_ARCHIVOS_PATH || path.join(__dirname, '..', 'Static', 'Archivos');
      let logoPath = path.join(baseArchivosPath, path.basename(configLogo[0].valor));
      if (!fs.existsSync(logoPath) && process.env.NODE_ENV === 'production') {
        logoPath = path.join('/home/vanguard/nuevo.vanguardschools.edu.pe/Static/Archivos', path.basename(configLogo[0].valor));
      }
      try {
        if (fs.existsSync(logoPath)) {
          const buf = fs.readFileSync(logoPath);
          const ext = (path.extname(configLogo[0].valor) || '').toLowerCase();
          const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
          logo_base64 = `data:${mime};base64,${buf.toString('base64')}`;
        }
      } catch (e) { /* ignorar */ }
    }

    res.json({
      nombres: alumnoData.nombres || '',
      apellido_paterno: alumnoData.apellido_paterno || '',
      apellido_materno: alumnoData.apellido_materno || '',
      nombre_completo: `${alumnoData.nombres || ''} ${alumnoData.apellido_paterno || ''} ${alumnoData.apellido_materno || ''}`.trim(),
      grupo: grupoTexto,
      colegio_nombre: colegioNombre,
      anio: anio_activo,
      qr_data: qrData,
      nro_documento: alumnoData.nro_documento || '',
      foto_url,
      foto_base64,
      logo_url,
      logo_base64,
      apoderado_nombre,
      apoderado_celular,
      direccion
    });
  } catch (error) {
    console.error('Error obteniendo datos para QR:', error);
    res.status(500).json({ error: 'Error al obtener datos para QR', details: error.message });
  }
});

/**
 * GET /api/apoderado/hijos/:hijoId/pagos
 * Obtener pagos del hijo agrupados por matrícula/año
 */
router.get('/hijos/:hijoId/pagos', async (req, res) => {
  try {
    const { hijoId } = req.params;
    const { colegio_id, apoderado_id, anio_activo } = req.user;

    if (!hijoId || isNaN(parseInt(hijoId))) {
      return res.status(400).json({ error: 'ID de alumno inválido' });
    }

    const hijoIdNum = parseInt(hijoId);

    if (!apoderado_id) {
      return res.status(400).json({ error: 'Información de usuario incompleta.' });
    }

    // Verificar que el alumno es hijo del apoderado
    const esHijo = await query(
      `SELECT COUNT(*) as count
       FROM apoderados ap
       INNER JOIN familias f ON f.apoderado_id = ap.id
       INNER JOIN alumnos a ON a.id = f.alumno_id
       WHERE ap.id = ?
         AND a.id = ?
         AND a.colegio_id = ?`,
      [apoderado_id, hijoIdNum, colegio_id]
    );

    if (!esHijo || esHijo.length === 0 || esHijo[0].count === 0) {
      return res.status(403).json({ error: 'No tienes permisos para ver estos pagos.' });
    }

    // Obtener todas las matrículas del alumno
    const matriculas = await query(
      `SELECT m.id as matricula_id, m.alumno_id, g.anio, g.grado, g.seccion, n.nombre as nivel_nombre
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       WHERE m.alumno_id = ? AND m.colegio_id = ?
       AND (m.estado = 0 OR m.estado = 4)
       ORDER BY g.anio DESC, g.grado ASC`,
      [hijoIdNum, colegio_id]
    );

    if (!matriculas || matriculas.length === 0) {
      return res.json({ matriculas: [] });
    }

    // Obtener configuración del colegio para calcular meses y fechas de vencimiento
    const colegioConfig = await query(
      `SELECT ciclo_pensiones, inicio_pensiones, pensiones_vencimiento, dias_tolerancia, anio_activo FROM colegios WHERE id = ? LIMIT 1`,
      [colegio_id]
    );

    const cicloPensiones = colegioConfig && colegioConfig.length > 0 ? colegioConfig[0].ciclo_pensiones : null;
    const inicioPensiones = colegioConfig && colegioConfig.length > 0 ? (colegioConfig[0].inicio_pensiones || 1) : 1;
    const anioActivo = colegioConfig && colegioConfig.length > 0 ? (colegioConfig[0].anio_activo || new Date().getFullYear()) : new Date().getFullYear();
    const pensionesVencimientoStr = colegioConfig && colegioConfig.length > 0 ? colegioConfig[0].pensiones_vencimiento : null;
    const diasTolerancia = colegioConfig && colegioConfig.length > 0 ? parseInt(colegioConfig[0].dias_tolerancia || 0) : 0;
    
    // Configuración de mora: S/. 1.00 por día
    const moraPorDia = 1.00;

    // Parsear pensiones_vencimiento (formato PHP serialize en base64)
    let vencimientosPensiones = {};
    if (pensionesVencimientoStr) {
      try {
        // El contenido viene en base64, primero decodificarlo
        let contenidoDeserializar = pensionesVencimientoStr;
        
        // Intentar decodificar base64 primero
        try {
          contenidoDeserializar = Buffer.from(pensionesVencimientoStr, 'base64').toString('utf-8');
        } catch (base64Error) {
          // Si no es base64, usar el string directamente
          console.log('No es base64, usando string directamente');
        }
        
        // Intentar deserializar
        const vencimientosDeserializados = phpSerialize.unserialize(contenidoDeserializar);
        vencimientosPensiones = vencimientosDeserializados || {};
      } catch (error) {
        console.error('Error deserializando pensiones_vencimiento:', error);
        try {
          if (typeof pensionesVencimientoStr === 'string' && pensionesVencimientoStr.startsWith('{')) {
            vencimientosPensiones = JSON.parse(pensionesVencimientoStr);
          } else {
            vencimientosPensiones = {};
          }
        } catch (jsonError) {
          vencimientosPensiones = {};
        }
      }
    }

    // Función para calcular fecha de vencimiento
    const calcularFechaVencimiento = (nroPension, anio, inicioPensiones) => {
      let vencimiento = vencimientosPensiones[nroPension];
      
      if (!vencimiento || vencimiento === '') {
        const mesPension = nroPension + 2;
        const ultimoDia = new Date(anio, mesPension, 0).getDate();
        return `${ultimoDia}-${String(mesPension).padStart(2, '0')}-${anio}`;
      }

      const partes = String(vencimiento).trim().split('-');
      
      if (partes.length === 1) {
        const mesPension = nroPension + 2;
        return `${partes[0].padStart(2, '0')}-${String(mesPension).padStart(2, '0')}-${anio}`;
      } else if (partes.length === 2) {
        return `${partes[0].padStart(2, '0')}-${partes[1].padStart(2, '0')}-${anio}`;
      } else {
        let añoFinal = partes[2];
        if (añoFinal.length === 2) {
          añoFinal = String(anio);
        }
        return `${partes[0].padStart(2, '0')}-${partes[1].padStart(2, '0')}-${añoFinal}`;
      }
    };

    const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    const getMesPension = (nroPago) => {
      if (cicloPensiones === 0 || cicloPensiones === '0') {
        const indiceMes = nroPago + inicioPensiones - 1;
        if (indiceMes >= 0 && indiceMes < MESES.length) {
          return MESES[indiceMes];
        }
      }
      return null;
    };

    // Obtener total_pensiones del colegio
    const colegioTotalPensiones = await query(
      `SELECT total_pensiones FROM colegios WHERE id = ? LIMIT 1`,
      [colegio_id]
    );
    const numPensiones = colegioTotalPensiones && colegioTotalPensiones.length > 0 
      ? parseInt(colegioTotalPensiones[0].total_pensiones || 10) 
      : 10;

    // Para cada matrícula, obtener sus pagos
    const matriculasConPagos = await Promise.all(
      matriculas.map(async (matricula) => {
        // Obtener el costo de la matrícula
        const costoInfo = await query(
          `SELECT c.pension, c.matricula 
           FROM matriculas m
           INNER JOIN costos c ON c.id = m.costo_id
           WHERE m.id = ? AND m.colegio_id = ? LIMIT 1`,
          [matricula.matricula_id, colegio_id]
        );

        // Obtener pagos existentes de esta matrícula
        const pagosExistentes = await query(
          `SELECT p.id, p.nro_pago, p.monto, p.mora, p.fecha_hora, p.tipo, p.descripcion, 
                  p.estado_pago, p.fecha_cancelado, p.nro_movimiento_banco, p.nro_movimiento_importado,
                  p.forma_pago, p.lugar_pago
           FROM pagos p
           WHERE p.matricula_id = ? AND p.estado = 'ACTIVO' AND p.colegio_id = ?
           ORDER BY p.tipo ASC, p.nro_pago ASC`,
          [matricula.matricula_id, colegio_id]
        );

        // Crear lista completa de pagos
        const pagosCompletos = [];
        const pension = costoInfo && costoInfo.length > 0 ? parseFloat(costoInfo[0].pension || 0) : 0;
        const matriculaCosto = costoInfo && costoInfo.length > 0 ? parseFloat(costoInfo[0].matricula || 0) : 0;

        // 1. Matrícula (tipo = 0)
        const matriculaPago = pagosExistentes.find(p => p.tipo === 0);
        if (matriculaPago) {
          pagosCompletos.push(matriculaPago);
        } else {
          pagosCompletos.push({
            id: null,
            nro_pago: 0,
            monto: matriculaCosto,
            mora: 0,
            fecha_hora: null,
            tipo: 0,
            descripcion: '',
            estado_pago: 'PENDIENTE',
            fecha_cancelado: null,
            nro_movimiento_banco: null,
            nro_movimiento_importado: null,
            forma_pago: null,
            lugar_pago: null
          });
        }

        // 2. Pensiones (tipo = 1, nro_pago de 1 a numPensiones)
        for (let i = 1; i <= numPensiones; i++) {
          const pensionPago = pagosExistentes.find(p => p.tipo === 1 && p.nro_pago === i);
          if (pensionPago) {
            pagosCompletos.push(pensionPago);
          } else {
            pagosCompletos.push({
              id: null,
              nro_pago: i,
              monto: pension,
              mora: 0,
              fecha_hora: null,
              tipo: 1,
              descripcion: '',
              estado_pago: 'PENDIENTE',
              fecha_cancelado: null,
              nro_movimiento_banco: null,
              nro_movimiento_importado: null,
              forma_pago: null,
              lugar_pago: null
            });
          }
        }

        // Para cada pago, calcular fecha de vencimiento y mora
        const pagosConBoleta = await Promise.all(
          pagosCompletos.map(async (pago) => {
            let impresion = null;
            if (pago.id) {
              impresion = await query(
                `SELECT id, numero, serie, fecha_impresion, impreso
                 FROM impresiones
                 WHERE pago_id = ? AND tipo = 'PAGO' AND tipo_documento = 'BOLETA' AND estado = 'ACTIVO'
                 ORDER BY id DESC
                 LIMIT 1`,
                [pago.id]
              );
            }

            let tipoDescripcion = '';
            if (pago.tipo === 0) {
              tipoDescripcion = `MATRÍCULA ${matricula.anio}`;
            } else if (pago.tipo === 1) {
              const mesNombre = getMesPension(pago.nro_pago);
              if (mesNombre) {
                tipoDescripcion = `MENSUALIDAD ${mesNombre.toUpperCase()}`;
              } else {
                tipoDescripcion = `MENSUALIDAD ${pago.nro_pago}`;
              }
            } else if (pago.tipo === 3) {
              const mesNombre = getMesPension(pago.nro_pago);
              if (mesNombre) {
                tipoDescripcion = `COMEDOR ${mesNombre.toUpperCase()}`;
              } else {
                tipoDescripcion = `COMEDOR ${pago.nro_pago}`;
              }
            } else {
              tipoDescripcion = pago.descripcion || `OTRO`;
            }

            // Calcular fecha de vencimiento y mora
            let fechaVencimiento = null;
            let fechaVencimientoFormateada = null;
            let huboMora = false;
            let diasMora = 0;
            let montoMoraCalculado = 0;

            if (pago.tipo === 1 && pago.nro_pago && pago.nro_pago > 0) {
              try {
                const fechaVencimientoStr = calcularFechaVencimiento(pago.nro_pago, matricula.anio, inicioPensiones);
                const partesFecha = fechaVencimientoStr.split('-');
                if (partesFecha.length === 3) {
                  fechaVencimiento = new Date(
                    parseInt(partesFecha[2]),
                    parseInt(partesFecha[1]) - 1,
                    parseInt(partesFecha[0])
                  );
                  
                  fechaVencimientoFormateada = fechaVencimiento.toLocaleDateString('es-PE', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit'
                  });

                  const fechaLimite = new Date(fechaVencimiento);
                  fechaLimite.setDate(fechaLimite.getDate() + diasTolerancia);
                  fechaLimite.setHours(23, 59, 59, 999);

                  if (pago.estado_pago === 'CANCELADO' && pago.fecha_cancelado) {
                    const fechaCancelado = new Date(pago.fecha_cancelado);
                    fechaCancelado.setHours(0, 0, 0, 0);
                    
                    if (fechaCancelado > fechaLimite) {
                      huboMora = true;
                      const diffTime = fechaCancelado - fechaLimite;
                      diasMora = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    }
                  } else if (pago.estado_pago === 'PENDIENTE') {
                    const fechaActual = new Date();
                    fechaActual.setHours(0, 0, 0, 0);
                    
                    if (fechaActual > fechaLimite) {
                      huboMora = true;
                      const diffTime = fechaActual - fechaLimite;
                      diasMora = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    }
                  }
                  
                  if (huboMora && diasMora > 0) {
                    montoMoraCalculado = diasMora * moraPorDia;
                  }
                }
              } catch (error) {
                console.error(`Error calculando fecha de vencimiento para pago ${pago.id}:`, error);
              }
            }

            const montoMoraFinal = pago.mora && parseFloat(pago.mora) > 0 
              ? parseFloat(pago.mora) 
              : montoMoraCalculado;

            return {
              ...pago,
              tipo_descripcion: tipoDescripcion,
              total: parseFloat(pago.monto) + montoMoraFinal,
              fecha_vencimiento: fechaVencimiento ? fechaVencimiento.toISOString().split('T')[0] : null,
              fecha_vencimiento_formateada: fechaVencimientoFormateada,
              hubo_mora: huboMora,
              dias_mora: diasMora,
              mora_calculada: montoMoraCalculado,
              mora_final: montoMoraFinal,
              boleta: impresion && impresion.length > 0 ? {
                numero: impresion[0].numero,
                serie: impresion[0].serie,
                serie_numero: `${String(impresion[0].serie).padStart(3, '0')}-${String(impresion[0].numero).padStart(7, '0')}`,
                fecha_impresion: impresion[0].fecha_impresion,
                impreso: impresion[0].impreso
              } : null
            };
          })
        );

        const totalPagar = matriculaCosto + (pension * numPensiones);
        const totalPagado = pagosConBoleta
          .filter(p => p.estado_pago === 'CANCELADO' && (p.tipo === 0 || p.tipo === 1))
          .reduce((sum, p) => sum + parseFloat(p.monto) + parseFloat(p.mora || 0), 0);
        
        const totalPendiente = totalPagar - totalPagado;

        return {
          ...matricula,
          pagos: pagosConBoleta,
          total_pagar: totalPagar,
          total_pagado: totalPagado,
          total_pendiente: totalPendiente
        };
      })
    );

    res.json({ matriculas: matriculasConPagos });
  } catch (error) {
    console.error('Error obteniendo pagos:', error);
    res.status(500).json({ error: 'Error al obtener pagos', details: error.message });
  }
});

/**
 * GET /api/apoderado/pagos/:pagoId/boleta
 * Obtener datos para generar boleta PDF
 */
router.get('/pagos/:pagoId/boleta', async (req, res) => {
  try {
    const { pagoId } = req.params;
    const { colegio_id, apoderado_id } = req.user;

    if (!pagoId || isNaN(parseInt(pagoId))) {
      return res.status(400).json({ error: 'ID de pago inválido' });
    }

    const pagoIdNum = parseInt(pagoId);

    if (!apoderado_id) {
      return res.status(400).json({ error: 'Información de usuario incompleta.' });
    }

    // Obtener pago con información del alumno
    const pagoInfo = await query(
      `SELECT p.*, m.alumno_id, g.anio
       FROM pagos p
       INNER JOIN matriculas m ON m.id = p.matricula_id
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE p.id = ? AND p.colegio_id = ? AND p.estado = 'ACTIVO'`,
      [pagoIdNum, colegio_id]
    );

    if (!pagoInfo || pagoInfo.length === 0) {
      return res.status(404).json({ error: 'Pago no encontrado' });
    }

    const pago = pagoInfo[0];

    // Verificar que el alumno es hijo del apoderado
    const esHijo = await query(
      `SELECT COUNT(*) as count
       FROM apoderados ap
       INNER JOIN familias f ON f.apoderado_id = ap.id
       INNER JOIN alumnos a ON a.id = f.alumno_id
       WHERE ap.id = ?
         AND a.id = ?
         AND a.colegio_id = ?`,
      [apoderado_id, pago.alumno_id, colegio_id]
    );

    if (!esHijo || esHijo.length === 0 || esHijo[0].count === 0) {
      return res.status(403).json({ error: 'No tienes permisos para ver esta boleta.' });
    }

    // Obtener datos del alumno
    const alumno = await query(
      `SELECT a.nombres, a.apellido_paterno, a.apellido_materno, a.nro_documento as dni
       FROM alumnos a
       WHERE a.id = ? AND a.colegio_id = ?`,
      [pago.alumno_id, colegio_id]
    );

    if (!alumno || alumno.length === 0) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }

    // Obtener impresión (boleta)
    const impresion = await query(
      `SELECT id, numero, serie, fecha_impresion, impreso
       FROM impresiones
       WHERE pago_id = ? AND tipo = 'PAGO' AND tipo_documento = 'BOLETA' AND estado = 'ACTIVO'
       ORDER BY id DESC
       LIMIT 1`,
      [pagoIdNum]
    );

    // Obtener datos de facturación del colegio
    const facturacionData = await query(
      `SELECT ruc, razon_social, direccion FROM colegios WHERE id = ? LIMIT 1`,
      [colegio_id]
    );

    // Obtener logo de boleta de la tabla config
    const configLogo = await query(
      `SELECT valor FROM config WHERE clave = 'boleta_logo' LIMIT 1`
    );

    const facturacion = facturacionData.length > 0 ? facturacionData[0] : {};
    const logoFileName = configLogo.length > 0 ? configLogo[0].valor : null;

    // Construir URL del logo si existe
    let logoUrl = null;
    if (logoFileName) {
      const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://nuevo.vanguardschools.edu.pe';
      const isProduction = process.env.NODE_ENV === 'production';
      if (isProduction) {
        logoUrl = `${phpSystemUrl}/Static/Archivos/${logoFileName}`;
      } else {
        logoUrl = `http://localhost:5000/Static/Archivos/${logoFileName}`;
      }
    }

    // Determinar descripción del pago
    let descripcionPago = '';
    if (pago.tipo === 0) {
      descripcionPago = `MATRÍCULA ${pago.anio || new Date().getFullYear()}`;
    } else if (pago.tipo === 1) {
      // Obtener mes de pensión
      const colegioConfig = await query(
        `SELECT ciclo_pensiones, inicio_pensiones FROM colegios WHERE id = ? LIMIT 1`,
        [colegio_id]
      );
      const cicloPensiones = colegioConfig.length > 0 ? colegioConfig[0].ciclo_pensiones : null;
      const inicioPensiones = colegioConfig.length > 0 ? (colegioConfig[0].inicio_pensiones || 1) : 1;
      
      if (cicloPensiones === 0 || cicloPensiones === '0') {
        const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const indiceMes = pago.nro_pago + inicioPensiones - 1;
        if (indiceMes >= 0 && indiceMes < MESES.length) {
          descripcionPago = `MENSUALIDAD ${MESES[indiceMes].toUpperCase()}`;
        } else {
          descripcionPago = `MENSUALIDAD ${pago.nro_pago}`;
        }
      } else {
        descripcionPago = `MENSUALIDAD ${pago.nro_pago}`;
      }
    } else if (pago.tipo === 3) {
      descripcionPago = `COMEDOR ${pago.nro_pago}`;
    } else {
      descripcionPago = pago.descripcion || 'OTRO';
    }

    res.json({
      pago: {
        id: pago.id,
        tipo: pago.tipo,
        tipo_descripcion: descripcionPago,
        monto: parseFloat(pago.monto) || 0,
        mora: parseFloat(pago.mora) || 0,
        total: parseFloat(pago.monto) + parseFloat(pago.mora || 0),
        fecha_hora: pago.fecha_hora,
        fecha_cancelado: pago.fecha_cancelado,
        estado_pago: pago.estado_pago,
        boleta_numero: impresion && impresion.length > 0 ? impresion[0].numero : null,
        boleta_serie: impresion && impresion.length > 0 ? impresion[0].serie : null,
        boleta_fecha_impresion: impresion && impresion.length > 0 ? impresion[0].fecha_impresion : null
      },
      alumno: {
        nombres: alumno[0].nombres,
        apellido_paterno: alumno[0].apellido_paterno,
        apellido_materno: alumno[0].apellido_materno,
        nombre_completo: `${alumno[0].apellido_paterno || ''} ${alumno[0].apellido_materno || ''}, ${alumno[0].nombres || ''}`.trim().replace(/^,\s*|,\s*$/g, ''),
        dni: alumno[0].dni
      },
      boleta: impresion && impresion.length > 0 ? {
        numero: impresion[0].numero,
        serie: impresion[0].serie,
        serie_numero: `${String(impresion[0].serie).padStart(3, '0')}-${String(impresion[0].numero).padStart(7, '0')}`
      } : null,
      facturacion: {
        razon_social: facturacion.razon_social || 'Vanguard Schools',
        ruc: facturacion.ruc || '',
        direccion: facturacion.direccion || '',
        logo_url: logoUrl
      }
    });
  } catch (error) {
    console.error('Error obteniendo datos de boleta:', error);
    res.status(500).json({ error: 'Error al obtener datos de boleta', details: error.message });
  }
});

/**
 * GET /api/apoderado/hijos/:hijoId/notas-detalladas
 * Obtener todas las notas detalladas del hijo agrupadas por curso
 */
router.get('/hijos/:hijoId/notas-detalladas', async (req, res) => {
  try {
    const { hijoId } = req.params;
    const { colegio_id, apoderado_id, anio_activo } = req.user;

    if (!hijoId || isNaN(parseInt(hijoId))) {
      return res.status(400).json({ error: 'ID de alumno inválido' });
    }

    const hijoIdNum = parseInt(hijoId);

    if (!apoderado_id) {
      return res.status(400).json({ error: 'Información de usuario incompleta.' });
    }

    // Verificar que el alumno es hijo del apoderado
    const esHijo = await query(
      `SELECT COUNT(*) as count
       FROM apoderados ap
       INNER JOIN familias f ON f.apoderado_id = ap.id
       INNER JOIN alumnos a ON a.id = f.alumno_id
       WHERE ap.id = ?
         AND a.id = ?
         AND a.colegio_id = ?`,
      [apoderado_id, hijoIdNum, colegio_id]
    );

    if (!esHijo || esHijo.length === 0 || esHijo[0].count === 0) {
      return res.status(403).json({ error: 'No tienes permisos para ver estas notas.' });
    }

    // Obtener matrícula actual del alumno
    const matricula = await query(
      `SELECT m.id as matricula_id, m.grupo_id
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0 OR m.estado = 4)
       LIMIT 1`,
      [hijoIdNum, colegio_id, anio_activo]
    );

    if (!matricula || matricula.length === 0) {
      return res.json({ asignaturas: [] });
    }

    const matriculaId = matricula[0].matricula_id;
    const grupoId = matricula[0].grupo_id;

    // Obtener todas las asignaturas del grupo
    const asignaturas = await query(
      `SELECT DISTINCT
              a.id as asignatura_id,
              c.id as curso_id,
              c.nombre as curso_nombre,
              g.nivel_id,
              n.tipo_calificacion,
              n.tipo_calificacion_final,
              n.nota_aprobatoria,
              n.nota_maxima,
              n.nota_minima,
              c.peso_examen_mensual,
              c.examen_mensual
       FROM asignaturas a
       INNER JOIN cursos c ON c.id = a.curso_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       WHERE a.grupo_id = ? AND a.colegio_id = ?
       ORDER BY c.nombre ASC`,
      [grupoId, colegio_id]
    );

    // Función auxiliar para deserializar notas detalladas (igual que en docente.routes.js)
    const deserializarNotasDetalles = (dataString) => {
      if (!dataString || dataString === '') {
        return {};
      }

      try {
        // Intentar deserializar directamente
        try {
          const deserialized = phpSerialize.unserialize(dataString);
          return deserialized || {};
        } catch (e) {
          // Si falla, intentar decodificar base64 primero
          try {
            const decoded = Buffer.from(dataString, 'base64').toString('utf-8');
            const deserialized = phpSerialize.unserialize(decoded);
            return deserialized || {};
          } catch (e2) {
            console.warn('Error deserializando notas_detalles:', e2);
            return {};
          }
        }
      } catch (error) {
        console.warn('Error deserializando notas_detalles:', error);
        return {};
      }
    };

    // Para cada asignatura, obtener las notas detalladas (igual que en docente.routes.js)
    const asignaturasConNotas = await Promise.all(
      asignaturas.map(async (asignatura) => {
        // Obtener criterios de la asignatura
        const criterios = await query(
          `SELECT * FROM asignaturas_criterios
           WHERE asignatura_id = ? AND colegio_id = ?
           ORDER BY orden ASC`,
          [asignatura.asignatura_id, colegio_id]
        );

        // Obtener todos los indicadores
        const criterioIds = criterios.map(c => c.id);
        let todosIndicadores = [];
        if (criterioIds.length > 0) {
          todosIndicadores = await query(
            `SELECT * FROM asignaturas_indicadores
             WHERE criterio_id IN (${criterioIds.map(() => '?').join(',')})
             ORDER BY criterio_id ASC, id ASC`,
            criterioIds
          );
        }

        // Agrupar indicadores por criterio
        const indicadoresPorCriterio = {};
        todosIndicadores.forEach(indicador => {
          if (!indicadoresPorCriterio[indicador.criterio_id]) {
            indicadoresPorCriterio[indicador.criterio_id] = [];
          }
          indicadoresPorCriterio[indicador.criterio_id].push(indicador);
        });

        // Agregar indicadores a cada criterio
        const criteriosConIndicadores = criterios.map(criterio => ({
          ...criterio,
          indicadores: indicadoresPorCriterio[criterio.id] || []
        }));

        // Obtener todas las notas detalladas
        const todasNotasDetalles = await query(
          `SELECT ciclo, data FROM notas_detalles
           WHERE matricula_id = ? AND asignatura_id = ? AND ciclo IN (1, 2, 3, 4)`,
          [matriculaId, asignatura.asignatura_id]
        );

        // Obtener todas las notas de criterios (usar tabla 'notas', no 'notas_criterios')
        const todasNotasCriterios = await query(
          `SELECT criterio_id, nota, ciclo
           FROM notas n
           WHERE n.matricula_id = ? AND n.asignatura_id = ? AND n.ciclo IN (1, 2, 3, 4)`,
          [matriculaId, asignatura.asignatura_id]
        );

        // Obtener todos los exámenes mensuales
        let todasExamenesMensuales = [];
        if (asignatura.examen_mensual === 'SI') {
          todasExamenesMensuales = await query(
            `SELECT nro, nota, ciclo FROM notas_examen_mensual
             WHERE matricula_id = ? AND asignatura_id = ? AND ciclo IN (1, 2, 3, 4)
             ORDER BY ciclo ASC, nro ASC`,
            [matriculaId, asignatura.asignatura_id]
          );
        }

        // Obtener todos los promedios finales
        const todosPromedios = await query(
          `SELECT promedio, ciclo FROM promedios
           WHERE matricula_id = ? AND asignatura_id = ? AND ciclo IN (1, 2, 3, 4)`,
          [matriculaId, asignatura.asignatura_id]
        );

        // Organizar datos por ciclo
        const notasDetalladas = {};
        for (let ciclo = 1; ciclo <= 4; ciclo++) {
          // Obtener notas detalladas del ciclo
          const notaDetalle = todasNotasDetalles.find(nd => nd.ciclo === ciclo);
          if (notaDetalle && notaDetalle.data) {
            notasDetalladas[ciclo] = deserializarNotasDetalles(notaDetalle.data);
          } else {
            notasDetalladas[ciclo] = {};
          }

          // Crear mapa de notas por criterio para este ciclo
          const notasMap = {};
          todasNotasCriterios
            .filter(n => n.ciclo === ciclo)
            .forEach(nota => {
              notasMap[nota.criterio_id] = nota.nota;
            });

          // Agregar notas de criterios a cada criterio
          criteriosConIndicadores.forEach(criterio => {
            if (!criterio.notas) criterio.notas = {};
            criterio.notas[ciclo] = notasMap[criterio.id] || null;
          });

          // Agregar exámenes mensuales del ciclo
          if (asignatura.examen_mensual === 'SI') {
            const examenesCiclo = todasExamenesMensuales.filter(e => e.ciclo === ciclo);
            if (examenesCiclo.length > 0) {
              if (!notasDetalladas[ciclo].examen_mensual) {
                notasDetalladas[ciclo].examen_mensual = {};
              }
              examenesCiclo.forEach(examen => {
                notasDetalladas[ciclo].examen_mensual[examen.nro] = examen.nota;
              });
            }
          }

          // Agregar promedio final del ciclo
          const promedioCiclo = todosPromedios.find(p => p.ciclo === ciclo);
          notasDetalladas[ciclo].promedio_final = promedioCiclo ? promedioCiclo.promedio : null;
        }

        return {
          asignatura_id: asignatura.asignatura_id,
          curso_id: asignatura.curso_id,
          curso_nombre: asignatura.curso_nombre,
          nivel: {
            tipo_calificacion: asignatura.tipo_calificacion,
            tipo_calificacion_final: asignatura.tipo_calificacion_final,
            nota_aprobatoria: asignatura.nota_aprobatoria,
            nota_maxima: asignatura.nota_maxima,
            nota_minima: asignatura.nota_minima
          },
          examen_mensual: asignatura.examen_mensual === 'SI',
          peso_examen_mensual: asignatura.peso_examen_mensual || 0,
          criterios: criteriosConIndicadores,
          notas: notasDetalladas
        };
      })
    );

    // Obtener información del alumno
    const alumno = await query(
      `SELECT id, nombres, apellido_paterno, apellido_materno,
              CONCAT(apellido_paterno, ' ', apellido_materno, ', ', nombres) as nombre_completo
       FROM alumnos
       WHERE id = ?`,
      [hijoIdNum]
    );

    res.json({
      alumno: alumno[0] || null,
      asignaturas: asignaturasConNotas
    });
  } catch (error) {
    console.error('Error obteniendo notas detalladas:', error);
    res.status(500).json({ error: 'Error al obtener notas detalladas', details: error.message });
  }
});

/**
 * GET /api/apoderado/hijos/:hijoId/libreta-anios
 * Lista de años en que el hijo tiene matrícula (para selector de libreta por año)
 */
router.get('/hijos/:hijoId/libreta-anios', async (req, res) => {
  try {
    const { hijoId } = req.params;
    const { colegio_id, apoderado_id } = req.user;

    if (!hijoId || isNaN(parseInt(hijoId))) {
      return res.status(400).json({ error: 'ID de alumno inválido' });
    }

    const hijoIdNum = parseInt(hijoId);
    if (!apoderado_id) {
      return res.status(400).json({ error: 'Información de usuario incompleta.' });
    }

    const esHijo = await query(
      `SELECT COUNT(*) as count FROM apoderados ap
       INNER JOIN familias f ON f.apoderado_id = ap.id
       INNER JOIN alumnos a ON a.id = f.alumno_id
       WHERE ap.id = ? AND a.id = ? AND a.colegio_id = ?`,
      [apoderado_id, hijoIdNum, colegio_id]
    );
    if (!esHijo || esHijo.length === 0 || esHijo[0].count === 0) {
      return res.status(403).json({ error: 'No tienes permisos.' });
    }

    const rows = await query(
      `SELECT g.anio FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND (m.estado = 0 OR m.estado = 4)
       ORDER BY g.anio DESC`,
      [hijoIdNum, colegio_id]
    );
    const anios = (rows || []).map(r => r.anio).filter(Boolean);
    return res.json({ anios });
  } catch (error) {
    console.error('Error listando años libreta:', error);
    return res.status(500).json({ error: 'Error al obtener años' });
  }
});

/**
 * GET /api/apoderado/hijos/:hijoId/libreta
 * Obtener libreta de notas del hijo (ciclo=bimestre, anio=opcional; si no se envía anio usa año activo)
 */
router.get('/hijos/:hijoId/libreta', async (req, res) => {
  try {
    const { hijoId } = req.params;
    const ciclo = Math.max(1, Math.min(4, parseInt(req.query.ciclo) || 1));
    const anioParam = req.query.anio ? parseInt(req.query.anio, 10) : null;
    const { colegio_id, apoderado_id, anio_activo } = req.user;
    const anio = (anioParam && anioParam > 0) ? anioParam : anio_activo;

    if (!hijoId || isNaN(parseInt(hijoId))) {
      return res.status(400).json({ error: 'ID de alumno inválido' });
    }

    const hijoIdNum = parseInt(hijoId);

    if (!apoderado_id) {
      return res.status(400).json({ error: 'Información de usuario incompleta.' });
    }

    // Verificar que el alumno es hijo del apoderado
    const esHijo = await query(
      `SELECT COUNT(*) as count
       FROM apoderados ap
       INNER JOIN familias f ON f.apoderado_id = ap.id
       INNER JOIN alumnos a ON a.id = f.alumno_id
       WHERE ap.id = ?
         AND a.id = ?
         AND a.colegio_id = ?`,
      [apoderado_id, hijoIdNum, colegio_id]
    );

    if (!esHijo || esHijo.length === 0 || esHijo[0].count === 0) {
      return res.status(403).json({ error: 'No tienes permisos para ver esta libreta.' });
    }

    // Obtener matrícula del alumno para el año indicado (anio activo o año seleccionado)
    const matricula = await query(
      `SELECT m.id as matricula_id, m.grupo_id, m.alumno_id
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0 OR m.estado = 4)
       LIMIT 1`,
      [hijoIdNum, colegio_id, anio]
    );

    if (!matricula || matricula.length === 0) {
      return res.json({ 
        alumno: null,
        asignaturas: [],
        resumen: null
      });
    }

    const matriculaId = matricula[0].matricula_id;
    const grupoId = matricula[0].grupo_id;

    // Obtener información del alumno y grupo (incluye tipo_calificacion para INICIAL cualitativa)
    const alumnoInfo = await query(
      `SELECT 
              a.id,
              a.nombres,
              a.apellido_paterno,
              a.apellido_materno,
              CONCAT(a.apellido_paterno, ' ', a.apellido_materno, ', ', a.nombres) as nombre_completo,
              u.usuario as codigo,
              g.grado,
              g.seccion,
              n.nombre as nivel_nombre,
              n.tipo_calificacion,
              t.nombre as turno_nombre,
              g.anio,
              CONCAT(p_tutor.nombres, ' ', p_tutor.apellidos) as tutor_nombre
       FROM alumnos a
       INNER JOIN matriculas m ON m.alumno_id = a.id
       INNER JOIN grupos g ON g.id = m.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN turnos t ON t.id = g.turno_id
       LEFT JOIN usuarios u ON u.alumno_id = a.id AND u.colegio_id = ? AND u.estado = 'ACTIVO'
       LEFT JOIN personal p_tutor ON p_tutor.id = g.tutor_id AND p_tutor.colegio_id = ?
       WHERE m.id = ? AND m.colegio_id = ?`,
      [colegio_id, colegio_id, matriculaId, colegio_id]
    );

    if (!alumnoInfo || alumnoInfo.length === 0) {
      return res.status(404).json({ error: 'No se encontró información del alumno' });
    }

    const alumno = alumnoInfo[0];
    const esCualitativa = alumno.tipo_calificacion === 0 || (alumno.nivel_nombre || '').toUpperCase().includes('INICIAL');

    // Obtener título de la intranet
    const colegioInfo = await query(
      `SELECT titulo_intranet FROM colegios WHERE id = ? LIMIT 1`,
      [colegio_id]
    );
    const tituloIntranet = (colegioInfo && colegioInfo.length > 0 && colegioInfo[0].titulo_intranet) 
      ? colegioInfo[0].titulo_intranet 
      : 'INTRANET VANGUARD SCHOOLS';

    // === LIBRETA CUALITATIVA (INICIAL) ===
    if (esCualitativa) {
      const asignaturasCual = await query(
        `SELECT a.id as asignatura_id, c.id as curso_id, c.nombre as curso_nombre
         FROM asignaturas a
         INNER JOIN cursos c ON c.id = a.curso_id
         WHERE a.grupo_id = ? AND a.colegio_id = ?
         ORDER BY c.nombre ASC`,
        [grupoId, colegio_id]
      );

      const deserializarNotasDetallesLibreta = (dataString) => {
        if (!dataString || dataString === '') return {};
        try {
          try { return phpSerialize.unserialize(dataString) || {}; } catch (e) {
            const decoded = Buffer.from(dataString, 'base64').toString('binary');
            return phpSerialize.unserialize(decoded) || {};
          }
        } catch (err) { return {}; }
      };

      const cursosCualitativos = await Promise.all(asignaturasCual.map(async (asig) => {
        const criterios = await query(
          `SELECT * FROM asignaturas_criterios WHERE asignatura_id = ? AND colegio_id = ? ORDER BY orden ASC`,
          [asig.asignatura_id, colegio_id]
        );
        const criterioIds = criterios.map(c => c.id);
        let indicadores = [];
        if (criterioIds.length > 0) {
          indicadores = await query(
            `SELECT * FROM asignaturas_indicadores WHERE criterio_id IN (${criterioIds.map(() => '?').join(',')}) ORDER BY criterio_id, id`,
            criterioIds
          );
        }
        const indicadoresPorCriterio = {};
        indicadores.forEach(ind => {
          if (!indicadoresPorCriterio[ind.criterio_id]) indicadoresPorCriterio[ind.criterio_id] = [];
          indicadoresPorCriterio[ind.criterio_id].push(ind);
        });

        const todasNotasCriterios = await query(
          `SELECT criterio_id, nota, ciclo FROM notas WHERE matricula_id = ? AND asignatura_id = ? AND ciclo IN (1,2,3,4)`,
          [matriculaId, asig.asignatura_id]
        );
        const notasCriterioMap = {};
        todasNotasCriterios.forEach(n => {
          if (!notasCriterioMap[n.criterio_id]) notasCriterioMap[n.criterio_id] = {};
          notasCriterioMap[n.criterio_id][n.ciclo] = n.nota;
        });

        const todasNotasDet = await query(
          `SELECT ciclo, data FROM notas_detalles WHERE matricula_id = ? AND asignatura_id = ? AND ciclo IN (1,2,3,4)`,
          [matriculaId, asig.asignatura_id]
        );
        const notasDetMap = {};
        todasNotasDet.forEach(nd => {
          notasDetMap[nd.ciclo] = deserializarNotasDetallesLibreta(nd.data);
        });

        let explicacionesIndicadores = [];
        try {
          explicacionesIndicadores = await query(
            `SELECT indicador_id, explicacion FROM notas_detalle_explicaciones_indicadores
             WHERE asignatura_id = ? AND matricula_id = ? AND ciclo = ? AND colegio_id = ?`,
            [asig.asignatura_id, matriculaId, ciclo, colegio_id]
          ) || [];
        } catch (e) { /* ignore */ }
        const explIndMap = {};
        explicacionesIndicadores.forEach(e => { explIndMap[e.indicador_id] = (e.explicacion || '').trim(); });

        const promediosAsig = await query(
          `SELECT ciclo, promedio FROM promedios WHERE matricula_id = ? AND asignatura_id = ? AND ciclo IN (1,2,3,4)`,
          [matriculaId, asig.asignatura_id]
        );
        const promediosMap = {};
        promediosAsig.forEach(p => { promediosMap[p.ciclo] = p.promedio; });

        const criteriosConNotas = criterios.map(cr => {
          const indicadoresCr = indicadoresPorCriterio[cr.id] || [];
          const indicadoresConNotas = indicadoresCr.map(ind => {
            const notasB = {};
            for (let cic = 1; cic <= 4; cic++) {
              const data = notasDetMap[cic] || {};
              const porCriterio = (data[cr.id] || data[String(cr.id)]) || {};
              const arr = porCriterio[ind.id] || porCriterio[String(ind.id)] || [];
              notasB[`nota_b${cic}`] = Array.isArray(arr) && arr.length > 0 ? (arr[0] != null ? String(arr[0]) : null) : null;
            }
            const explicacionCiclo = explIndMap[ind.id] || '';
            return { id: ind.id, descripcion: ind.descripcion, explicacion: explicacionCiclo, ...notasB };
          });
          const notasCriterio = notasCriterioMap[cr.id] || {};
          const nota_b1 = notasCriterio[1] != null ? String(notasCriterio[1]) : null;
          const nota_b2 = notasCriterio[2] != null ? String(notasCriterio[2]) : null;
          const nota_b3 = notasCriterio[3] != null ? String(notasCriterio[3]) : null;
          const nota_b4 = notasCriterio[4] != null ? String(notasCriterio[4]) : null;
          return {
            id: cr.id,
            descripcion: cr.descripcion,
            abreviatura: cr.abreviatura,
            indicadores: indicadoresConNotas,
            nota_b1, nota_b2, nota_b3, nota_b4
          };
        });

        return {
          asignatura_id: asig.asignatura_id,
          curso_id: asig.curso_id,
          curso_nombre: asig.curso_nombre,
          criterios: criteriosConNotas,
          promedio_b1: promediosMap[1] != null ? String(promediosMap[1]) : null,
          promedio_b2: promediosMap[2] != null ? String(promediosMap[2]) : null,
          promedio_b3: promediosMap[3] != null ? String(promediosMap[3]) : null,
          promedio_b4: promediosMap[4] != null ? String(promediosMap[4]) : null,
          promedio_final: null
        };
      }));

      let recomendacionesTexto = '';
      const matriculaRow = await query(`SELECT recomendaciones FROM matriculas WHERE id = ?`, [matriculaId]);
      if (matriculaRow && matriculaRow[0] && matriculaRow[0].recomendaciones) {
        try {
          const decoded = Buffer.from(matriculaRow[0].recomendaciones, 'base64').toString('binary');
          const deserialized = phpSerialize.unserialize(decoded);
          if (deserialized && typeof deserialized === 'object' && deserialized[ciclo] && deserialized[ciclo].descripcion) {
            recomendacionesTexto = String(deserialized[ciclo].descripcion).trim();
          }
        } catch (e) { /* ignore */ }
      }

      const conductaProm = await query(
        `SELECT ciclo, promedio FROM promedios WHERE matricula_id = ? AND asignatura_id = -101 AND ciclo IN (1,2,3,4)`,
        [matriculaId]
      );
      const conductaMap = {};
      conductaProm.forEach(p => { conductaMap[p.ciclo] = p.promedio; });

      const inasistenciasB1 = await obtenerInasistencias(matriculaId, 1, anio_activo);
      const inasistenciasB2 = await obtenerInasistencias(matriculaId, 2, anio_activo);
      const inasistenciasB3 = await obtenerInasistencias(matriculaId, 3, anio_activo);
      const inasistenciasB4 = await obtenerInasistencias(matriculaId, 4, anio_activo);
      const tardanzasB1 = await obtenerTardanzas(matriculaId, 1, anio_activo);
      const tardanzasB2 = await obtenerTardanzas(matriculaId, 2, anio_activo);
      const tardanzasB3 = await obtenerTardanzas(matriculaId, 3, anio_activo);
      const tardanzasB4 = await obtenerTardanzas(matriculaId, 4, anio_activo);

      // Detalle de notas: explicaciones del docente por curso (bimestre seleccionado)
      let detalle_notas_cual = [];
      try {
        const detalleNotasRowsCual = await query(
          `SELECT a.id as asignatura_id, c.nombre as curso_nombre,
                  CONCAT(COALESCE(p.nombres,''), ' ', COALESCE(p.apellidos,'')) as docente_nombre,
                  pr.promedio,
                  nde.explicacion
           FROM asignaturas a
           INNER JOIN cursos c ON c.id = a.curso_id
           LEFT JOIN personal p ON p.id = a.personal_id
           LEFT JOIN promedios pr ON pr.asignatura_id = a.id AND pr.matricula_id = ? AND pr.ciclo = ?
           LEFT JOIN notas_detalle_explicaciones nde ON nde.asignatura_id = a.id AND nde.matricula_id = ? AND nde.ciclo = ? AND nde.colegio_id = ?
           WHERE a.grupo_id = ? AND a.colegio_id = ? AND a.id > 0
           ORDER BY c.nombre ASC`,
          [matriculaId, ciclo, matriculaId, ciclo, colegio_id, grupoId, colegio_id]
        );
        detalle_notas_cual = (detalleNotasRowsCual || []).map(r => ({
          curso_nombre: r.curso_nombre || '-',
          docente_nombre: (r.docente_nombre || '').trim() || '-',
          promedio: r.promedio != null && r.promedio !== '' ? r.promedio : '-',
          explicacion: (r.explicacion || '').trim() || ''
        }));
      } catch (e) {
        console.error('[LIBRETA-INICIAL] Error al obtener detalle_notas:', e.message);
      }

      const resumenCual = {
        cantidad_cursos: { b1: cursosCualitativos.length, b2: cursosCualitativos.length, b3: cursosCualitativos.length, b4: cursosCualitativos.length },
        suma_notas: { b1: null, b2: null, b3: null, b4: null },
        promedio: { b1: null, b2: null, b3: null, b4: null, final: null },
        promedio_conducta: {
          b1: conductaMap[1] != null ? conductaMap[1] : '20',
          b2: conductaMap[2] != null ? conductaMap[2] : '20',
          b3: conductaMap[3] != null ? conductaMap[3] : '20',
          b4: conductaMap[4] != null ? conductaMap[4] : '20'
        },
        orden_merito: { b1: null, b2: null, b3: null, b4: null },
        inasistencias: { b1: inasistenciasB1, b2: inasistenciasB2, b3: inasistenciasB3, b4: inasistenciasB4 },
        tardanzas: { b1: tardanzasB1, b2: tardanzasB2, b3: tardanzasB3, b4: tardanzasB4 }
      };

      return res.json({
        alumno: {
          id: alumno.id,
          nombre_completo: alumno.nombre_completo,
          codigo: alumno.codigo,
          grado: alumno.grado,
          seccion: alumno.seccion,
          nivel_nombre: alumno.nivel_nombre,
          turno_nombre: alumno.turno_nombre,
          anio: alumno.anio,
          tutor_nombre: alumno.tutor_nombre
        },
        titulo_intranet: tituloIntranet,
        es_cualitativa: true,
        cursos_cualitativos: cursosCualitativos,
        areas: [],
        asignaturas_sin_area: [],
        resumen: resumenCual,
        recomendaciones: recomendacionesTexto,
        ciclo,
        detalle_notas: detalle_notas_cual
      });
    }

    // === LIBRETA CUANTITATIVA (PRIMARIA / SECUNDARIA) ===
    // Obtener todas las asignaturas del grupo, agrupadas por área
    const areas = await query(
      `SELECT DISTINCT ar.id as area_id, ar.nombre as area_nombre
       FROM areas ar
       INNER JOIN areas_cursos ac ON ac.area_id = ar.id
       INNER JOIN cursos c ON c.id = ac.curso_id
       INNER JOIN asignaturas a ON a.curso_id = c.id
       WHERE a.grupo_id = ? AND a.colegio_id = ? AND ar.colegio_id = ?
       ORDER BY ar.nombre ASC`,
      [grupoId, colegio_id, colegio_id]
    );

    // Obtener todas las asignaturas
    const asignaturas = await query(
      `SELECT 
              a.id as asignatura_id,
              c.id as curso_id,
              c.nombre as curso_nombre,
              ar.id as area_id,
              ar.nombre as area_nombre
       FROM asignaturas a
       INNER JOIN cursos c ON c.id = a.curso_id
       LEFT JOIN areas_cursos ac ON ac.curso_id = c.id
       LEFT JOIN areas ar ON ar.id = ac.area_id AND ar.colegio_id = ?
       WHERE a.grupo_id = ? AND a.colegio_id = ?
       ORDER BY ar.nombre ASC, c.nombre ASC`,
      [colegio_id, grupoId, colegio_id]
    );

    // Obtener todos los promedios por bimestre
    const todosPromedios = await query(
      `SELECT asignatura_id, ciclo, promedio
       FROM promedios
       WHERE matricula_id = ? AND ciclo IN (1, 2, 3, 4)
       ORDER BY asignatura_id ASC, ciclo ASC`,
      [matriculaId]
    );

    // Organizar promedios por asignatura (incluye conducta: asignatura_id = -101)
    const promediosPorAsignatura = {};
    todosPromedios.forEach(p => {
      if (!promediosPorAsignatura[p.asignatura_id]) {
        promediosPorAsignatura[p.asignatura_id] = {};
      }
      promediosPorAsignatura[p.asignatura_id][p.ciclo] = p.promedio;
    });

    // Promedio conducta (asignatura_id = -101), default 20
    const conductaProm = promediosPorAsignatura[-101] || {};
    const promedioConductaB1 = (conductaProm[1] !== null && conductaProm[1] !== '' && conductaProm[1] !== '-') ? conductaProm[1] : '20';
    const promedioConductaB2 = (conductaProm[2] !== null && conductaProm[2] !== '' && conductaProm[2] !== '-') ? conductaProm[2] : '20';
    const promedioConductaB3 = (conductaProm[3] !== null && conductaProm[3] !== '' && conductaProm[3] !== '-') ? conductaProm[3] : '20';
    const promedioConductaB4 = (conductaProm[4] !== null && conductaProm[4] !== '' && conductaProm[4] !== '-') ? conductaProm[4] : '20';

    // Recomendaciones: solo la del bimestre seleccionado (sin prefijo "Bimestre X:")
    let recomendacionesTexto = '';
    const matriculaRow = await query(`SELECT recomendaciones FROM matriculas WHERE id = ?`, [matriculaId]);
    if (matriculaRow && matriculaRow[0] && matriculaRow[0].recomendaciones) {
      try {
        const decoded = Buffer.from(matriculaRow[0].recomendaciones, 'base64').toString('binary');
        const deserialized = phpSerialize.unserialize(decoded);
        if (deserialized && typeof deserialized === 'object' && deserialized[ciclo] && deserialized[ciclo].descripcion) {
          recomendacionesTexto = String(deserialized[ciclo].descripcion).trim();
        }
      } catch (e) { /* ignore */ }
    }

    // Agrupar asignaturas por área y calcular promedios
    const areasConAsignaturas = [];
    const asignaturasSinArea = [];

    areas.forEach(area => {
      const asignaturasArea = asignaturas.filter(a => a.area_id === area.area_id);
      if (asignaturasArea.length > 0) {
        const asignaturasConPromedios = asignaturasArea.map(asignatura => {
          const promedios = promediosPorAsignatura[asignatura.asignatura_id] || {};
          const promedioB1 = promedios[1] || null;
          const promedioB2 = promedios[2] || null;
          const promedioB3 = promedios[3] || null;
          const promedioB4 = promedios[4] || null;
          
          // Calcular promedio final
          let promedioFinal = null;
          const promediosValidos = [promedioB1, promedioB2, promedioB3, promedioB4].filter(p => p !== null && p !== '' && p !== '-');
          if (promediosValidos.length > 0) {
            const suma = promediosValidos.reduce((sum, p) => {
              const num = parseFloat(p);
              return sum + (isNaN(num) ? 0 : num);
            }, 0);
            promedioFinal = Math.round(suma / promediosValidos.length);
          }

          return {
            asignatura_id: asignatura.asignatura_id,
            curso_id: asignatura.curso_id,
            curso_nombre: asignatura.curso_nombre,
            promedio_b1: promedioB1,
            promedio_b2: promedioB2,
            promedio_b3: promedioB3,
            promedio_b4: promedioB4,
            promedio_final: promedioFinal
          };
        });

        // Calcular promedio del área por bimestre
        const calcularPromedioArea = (asignaturas, campo) => {
          const promediosValidos = asignaturas
            .map(a => a[campo])
            .filter(p => p !== null && p !== '' && p !== '-');
          if (promediosValidos.length === 0) return null;
          const suma = promediosValidos.reduce((sum, p) => {
            const num = parseFloat(p);
            return sum + (isNaN(num) ? 0 : num);
          }, 0);
          return Math.round(suma / promediosValidos.length);
        };

        const promedioAreaB1 = calcularPromedioArea(asignaturasConPromedios, 'promedio_b1');
        const promedioAreaB2 = calcularPromedioArea(asignaturasConPromedios, 'promedio_b2');
        const promedioAreaB3 = calcularPromedioArea(asignaturasConPromedios, 'promedio_b3');
        const promedioAreaB4 = calcularPromedioArea(asignaturasConPromedios, 'promedio_b4');
        const promedioAreaFinal = calcularPromedioArea(asignaturasConPromedios, 'promedio_final');

        areasConAsignaturas.push({
          area_id: area.area_id,
          area_nombre: area.area_nombre,
          promedio_b1: promedioAreaB1,
          promedio_b2: promedioAreaB2,
          promedio_b3: promedioAreaB3,
          promedio_b4: promedioAreaB4,
          promedio_final: promedioAreaFinal,
          asignaturas: asignaturasConPromedios
        });
      }
    });

    // Asignaturas sin área
    const asignaturasSinAreaList = asignaturas.filter(a => !a.area_id);
    if (asignaturasSinAreaList.length > 0) {
      asignaturasSinArea.push(...asignaturasSinAreaList.map(asignatura => {
        const promedios = promediosPorAsignatura[asignatura.asignatura_id] || {};
        const promedioB1 = promedios[1] || null;
        const promedioB2 = promedios[2] || null;
        const promedioB3 = promedios[3] || null;
        const promedioB4 = promedios[4] || null;
        
        let promedioFinal = null;
        const promediosValidos = [promedioB1, promedioB2, promedioB3, promedioB4].filter(p => p !== null && p !== '' && p !== '-');
        if (promediosValidos.length > 0) {
          const suma = promediosValidos.reduce((sum, p) => {
            const num = parseFloat(p);
            return sum + (isNaN(num) ? 0 : num);
          }, 0);
          promedioFinal = Math.round(suma / promediosValidos.length);
        }

        return {
          asignatura_id: asignatura.asignatura_id,
          curso_id: asignatura.curso_id,
          curso_nombre: asignatura.curso_nombre,
          promedio_b1: promedioB1,
          promedio_b2: promedioB2,
          promedio_b3: promedioB3,
          promedio_b4: promedioB4,
          promedio_final: promedioFinal
        };
      }));
    }

    // Calcular cuadro resumen (igual que en docente.routes.js)
    const totalCursos = asignaturas.length;
    const cantidadCursosB1 = asignaturas.filter(a => {
      const promedios = promediosPorAsignatura[a.asignatura_id] || {};
      return promedios[1] !== null && promedios[1] !== '' && promedios[1] !== '-';
    }).length;
    const cantidadCursosB2 = asignaturas.filter(a => {
      const promedios = promediosPorAsignatura[a.asignatura_id] || {};
      return promedios[2] !== null && promedios[2] !== '' && promedios[2] !== '-';
    }).length;
    const cantidadCursosB3 = asignaturas.filter(a => {
      const promedios = promediosPorAsignatura[a.asignatura_id] || {};
      return promedios[3] !== null && promedios[3] !== '' && promedios[3] !== '-';
    }).length;
    const cantidadCursosB4 = asignaturas.filter(a => {
      const promedios = promediosPorAsignatura[a.asignatura_id] || {};
      return promedios[4] !== null && promedios[4] !== '' && promedios[4] !== '-';
    }).length;

    // Suma de notas por bimestre
    const sumaNotasB1 = asignaturas.reduce((sum, a) => {
      const promedios = promediosPorAsignatura[a.asignatura_id] || {};
      const p = promedios[1];
      if (p !== null && p !== '' && p !== '-') {
        const num = parseFloat(p);
        return sum + (isNaN(num) ? 0 : num);
      }
      return sum;
    }, 0);
    const sumaNotasB2 = asignaturas.reduce((sum, a) => {
      const promedios = promediosPorAsignatura[a.asignatura_id] || {};
      const p = promedios[2];
      if (p !== null && p !== '' && p !== '-') {
        const num = parseFloat(p);
        return sum + (isNaN(num) ? 0 : num);
      }
      return sum;
    }, 0);
    const sumaNotasB3 = asignaturas.reduce((sum, a) => {
      const promedios = promediosPorAsignatura[a.asignatura_id] || {};
      const p = promedios[3];
      if (p !== null && p !== '' && p !== '-') {
        const num = parseFloat(p);
        return sum + (isNaN(num) ? 0 : num);
      }
      return sum;
    }, 0);
    const sumaNotasB4 = asignaturas.reduce((sum, a) => {
      const promedios = promediosPorAsignatura[a.asignatura_id] || {};
      const p = promedios[4];
      if (p !== null && p !== '' && p !== '-') {
        const num = parseFloat(p);
        return sum + (isNaN(num) ? 0 : num);
      }
      return sum;
    }, 0);

    // Promedio general por bimestre
    const promedioGeneralB1 = cantidadCursosB1 > 0 ? Math.round(sumaNotasB1 / cantidadCursosB1) : null;
    const promedioGeneralB2 = cantidadCursosB2 > 0 ? Math.round(sumaNotasB2 / cantidadCursosB2) : null;
    const promedioGeneralB3 = cantidadCursosB3 > 0 ? Math.round(sumaNotasB3 / cantidadCursosB3) : null;
    const promedioGeneralB4 = cantidadCursosB4 > 0 ? Math.round(sumaNotasB4 / cantidadCursosB4) : null;
    const promedioGeneralFinal = [promedioGeneralB1, promedioGeneralB2, promedioGeneralB3, promedioGeneralB4]
      .filter(p => p !== null).length > 0
      ? Math.round(([promedioGeneralB1, promedioGeneralB2, promedioGeneralB3, promedioGeneralB4]
          .filter(p => p !== null)
          .reduce((sum, p) => sum + p, 0)) / [promedioGeneralB1, promedioGeneralB2, promedioGeneralB3, promedioGeneralB4]
          .filter(p => p !== null).length)
      : null;

    // Promedio conducta final = promedio de los 4 bimestres
    const conductaVals = [promedioConductaB1, promedioConductaB2, promedioConductaB3, promedioConductaB4]
      .filter(v => v != null && v !== '' && v !== '-').map(v => parseFloat(v));
    const promedioConductaFinal = conductaVals.length > 0 ? Math.round(conductaVals.reduce((a, b) => a + b, 0) / conductaVals.length) : null;

    // Orden de mérito: ranking por promedio general por bimestre (todos los alumnos del grupo)
    const asignaturasIds = asignaturas.map(a => a.asignatura_id).filter(id => id !== -101);
    const ordenMeritoResult = await obtenerOrdenMerito(grupoId, matriculaId, asignaturasIds);
    const ordenMerito = ordenMeritoResult.puestos;
    const ordenMeritoDetalle = ordenMeritoResult.detalle || { b1: [], b2: [], b3: [], b4: [] };

    // Inasistencias y tardanzas (usar datos de asistencia)
    const inasistenciasB1 = await obtenerInasistencias(matriculaId, 1, anio_activo);
    const inasistenciasB2 = await obtenerInasistencias(matriculaId, 2, anio_activo);
    const inasistenciasB3 = await obtenerInasistencias(matriculaId, 3, anio_activo);
    const inasistenciasB4 = await obtenerInasistencias(matriculaId, 4, anio_activo);

    const tardanzasB1 = await obtenerTardanzas(matriculaId, 1, anio_activo);
    const tardanzasB2 = await obtenerTardanzas(matriculaId, 2, anio_activo);
    const tardanzasB3 = await obtenerTardanzas(matriculaId, 3, anio_activo);
    const tardanzasB4 = await obtenerTardanzas(matriculaId, 4, anio_activo);

    // Detalle de notas: explicaciones del docente por curso (para el bimestre seleccionado)
    const detalleNotasRows = await query(
      `SELECT a.id as asignatura_id, c.nombre as curso_nombre,
              CONCAT(COALESCE(p.nombres,''), ' ', COALESCE(p.apellidos,'')) as docente_nombre,
              pr.promedio,
              nde.explicacion
       FROM asignaturas a
       INNER JOIN cursos c ON c.id = a.curso_id
       LEFT JOIN personal p ON p.id = a.personal_id
       LEFT JOIN promedios pr ON pr.asignatura_id = a.id AND pr.matricula_id = ? AND pr.ciclo = ?
       LEFT JOIN notas_detalle_explicaciones nde ON nde.asignatura_id = a.id AND nde.matricula_id = ? AND nde.ciclo = ? AND nde.colegio_id = ?
       WHERE a.grupo_id = ? AND a.colegio_id = ? AND a.id > 0
       ORDER BY c.nombre ASC`,
      [matriculaId, ciclo, matriculaId, ciclo, colegio_id, grupoId, colegio_id]
    );
    const detalle_notas = (detalleNotasRows || []).map(r => ({
      curso_nombre: r.curso_nombre || '-',
      docente_nombre: (r.docente_nombre || '').trim() || '-',
      promedio: r.promedio != null && r.promedio !== '' ? r.promedio : '-',
      explicacion: (r.explicacion || '').trim() || ''
    }));

    const resumen = {
      cantidad_cursos: {
        b1: cantidadCursosB1,
        b2: cantidadCursosB2,
        b3: cantidadCursosB3,
        b4: cantidadCursosB4
      },
      suma_notas: {
        b1: sumaNotasB1 > 0 ? sumaNotasB1 : null,
        b2: sumaNotasB2 > 0 ? sumaNotasB2 : null,
        b3: sumaNotasB3 > 0 ? sumaNotasB3 : null,
        b4: sumaNotasB4 > 0 ? sumaNotasB4 : null
      },
      promedio: {
        b1: promedioGeneralB1,
        b2: promedioGeneralB2,
        b3: promedioGeneralB3,
        b4: promedioGeneralB4,
        final: promedioGeneralFinal
      },
      promedio_conducta: {
        b1: promedioConductaB1,
        b2: promedioConductaB2,
        b3: promedioConductaB3,
        b4: promedioConductaB4,
        final: promedioConductaFinal
      },
      orden_merito: {
        b1: ordenMerito.b1,
        b2: ordenMerito.b2,
        b3: ordenMerito.b3,
        b4: ordenMerito.b4
      },
      orden_merito_detalle: ordenMeritoDetalle,
      inasistencias: {
        b1: inasistenciasB1,
        b2: inasistenciasB2,
        b3: inasistenciasB3,
        b4: inasistenciasB4
      },
      tardanzas: {
        b1: tardanzasB1,
        b2: tardanzasB2,
        b3: tardanzasB3,
        b4: tardanzasB4
      }
    };

    res.json({
      alumno: {
        id: alumno.id,
        nombre_completo: alumno.nombre_completo,
        codigo: alumno.codigo,
        grado: alumno.grado,
        seccion: alumno.seccion,
        nivel_nombre: alumno.nivel_nombre,
        turno_nombre: alumno.turno_nombre,
        anio: alumno.anio,
        tutor_nombre: alumno.tutor_nombre
      },
      titulo_intranet: tituloIntranet,
      es_cualitativa: false,
      areas: areasConAsignaturas,
      asignaturas_sin_area: asignaturasSinArea,
      resumen,
      recomendaciones: recomendacionesTexto,
      ciclo,
      detalle_notas
    });
  } catch (error) {
    console.error('Error obteniendo libreta:', error);
    res.status(500).json({ error: 'Error al obtener libreta', details: error.message });
  }
});

// Función auxiliar para obtener inasistencias por bimestre
async function obtenerInasistencias(matriculaId, ciclo, anio) {
  try {
    // Obtener rango de fechas del bimestre (esto se puede obtener de configuración)
    // Por ahora contamos todas las faltas del año
    const faltas = await query(
      `SELECT COUNT(*) as total
       FROM matriculas_asistencias ma
       INNER JOIN matriculas m ON m.id = ma.matricula_id
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE ma.matricula_id = ? 
         AND ma.tipo = 'FALTA'
         AND g.anio = ?`,
      [matriculaId, anio]
    );
    return faltas.length > 0 ? faltas[0].total : 0;
  } catch (error) {
    console.error('Error obteniendo inasistencias:', error);
    return 0;
  }
}

// Función auxiliar para obtener tardanzas por bimestre
async function obtenerTardanzas(matriculaId, ciclo, anio) {
  try {
    const tardanzas = await query(
      `SELECT COUNT(*) as total
       FROM matriculas_asistencias ma
       INNER JOIN matriculas m ON m.id = ma.matricula_id
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE ma.matricula_id = ? 
         AND ma.tipo = 'TARDANZA'
         AND g.anio = ?`,
      [matriculaId, anio]
    );
    return tardanzas.length > 0 ? tardanzas[0].total : 0;
  } catch (error) {
    console.error('Error obteniendo tardanzas:', error);
    return 0;
  }
}

// Función auxiliar para calcular orden de mérito por bimestre (ranking por promedio general del grupo)
// Retorna { puestos: { b1, b2, b3, b4 }, detalle: { b1: [{ apellido_paterno, apellido_materno, nombres, promedio, puesto }], ... } }
async function obtenerOrdenMerito(grupoId, matriculaId, asignaturasIds) {
  try {
    if (!asignaturasIds || asignaturasIds.length === 0) {
      return { puestos: { b1: null, b2: null, b3: null, b4: null }, detalle: { b1: [], b2: [], b3: [], b4: [] } };
    }
    const ids = asignaturasIds.filter(id => id !== -101 && id != null);
    if (ids.length === 0) {
      return { puestos: { b1: null, b2: null, b3: null, b4: null }, detalle: { b1: [], b2: [], b3: [], b4: [] } };
    }

    const placeholders = ids.map(() => '?').join(',');
    const puestos = { b1: null, b2: null, b3: null, b4: null };
    const detalle = { b1: [], b2: [], b3: [], b4: [] };
    const matIdNum = parseInt(matriculaId, 10);

    // Matrículas del grupo con nombres de alumnos
    const matriculasGrupo = await query(
      `SELECT m.id as matricula_id, a.apellido_paterno, a.apellido_materno, a.nombres
       FROM matriculas m
       INNER JOIN alumnos a ON a.id = m.alumno_id
       WHERE m.grupo_id = ? AND (m.estado = 0 OR m.estado = 4)`,
      [grupoId]
    );
    const matriculaIds = (matriculasGrupo || []).map(m => m.matricula_id);
    if (matriculaIds.length === 0) return { puestos, detalle };

    const mapNombres = {};
    (matriculasGrupo || []).forEach(m => {
      mapNombres[m.matricula_id] = {
        apellido_paterno: m.apellido_paterno || '',
        apellido_materno: m.apellido_materno || '',
        nombres: m.nombres || ''
      };
    });

    const matPlaceholders = matriculaIds.map(() => '?').join(',');

    for (let ciclo = 1; ciclo <= 4; ciclo++) {
      const promedios = await query(
        `SELECT p.matricula_id, p.asignatura_id, p.promedio
         FROM promedios p
         WHERE p.matricula_id IN (${matPlaceholders})
           AND p.asignatura_id IN (${placeholders})
           AND p.ciclo = ?`,
        [...matriculaIds, ...ids, ciclo]
      );

      const sumaPorMatricula = {};
      const countPorMatricula = {};
      (promedios || []).forEach(row => {
        const mid = row.matricula_id;
        if (!sumaPorMatricula[mid]) { sumaPorMatricula[mid] = 0; countPorMatricula[mid] = 0; }
        const n = parseFloat(row.promedio);
        if (!isNaN(n)) { sumaPorMatricula[mid] += n; countPorMatricula[mid]++; }
      });

      const promedioGeneral = Object.keys(sumaPorMatricula).map(matId => ({
        matricula_id: parseInt(matId, 10),
        promedio: countPorMatricula[matId] > 0 ? sumaPorMatricula[matId] / countPorMatricula[matId] : 0
      }));
      promedioGeneral.sort((a, b) => b.promedio - a.promedio);

      const pos = promedioGeneral.findIndex(p => p.matricula_id === matIdNum);
      if (pos >= 0) puestos[`b${ciclo}`] = `Puesto ${String(pos + 1).padStart(2, '0')}`;

      detalle[`b${ciclo}`] = promedioGeneral.map((p, idx) => {
        const nom = mapNombres[p.matricula_id] || {};
        return {
          apellido_paterno: nom.apellido_paterno,
          apellido_materno: nom.apellido_materno,
          nombres: nom.nombres,
          promedio: Math.round(p.promedio * 100) / 100,
          puesto: idx + 1
        };
      });
    }
    return { puestos, detalle };
  } catch (error) {
    console.error('Error obteniendo orden de mérito:', error);
    return { puestos: { b1: null, b2: null, b3: null, b4: null }, detalle: { b1: [], b2: [], b3: [], b4: [] } };
  }
}

/**
 * POST /api/apoderado/hijos/:hijoId/mensajes/enviar
 * Enviar mensaje al docente: remitente = apoderado; asunto y cuerpo incluyen referencia al alumno/grado/sección/nivel.
 */
router.post('/hijos/:hijoId/mensajes/enviar', uploadMensajes.array('archivos', 10), async (req, res) => {
  try {
    const { hijoId } = req.params;
    const { destinatarios, asunto, mensaje } = req.body;
    const { colegio_id, anio_activo, usuario_id: usuarioIdApoderado } = req.user;

    if (!usuarioIdApoderado) {
      return res.status(400).json({ error: 'No se pudo identificar al usuario apoderado.' });
    }

    await verificarSoloVinculoApoderadoAlumno(req, hijoId);
    const hijoIdNum = parseInt(hijoId, 10);

    const destinatariosArray = typeof destinatarios === 'string' ? JSON.parse(destinatarios) : destinatarios;

    if (!destinatariosArray || destinatariosArray.length === 0) {
      return res.status(400).json({ error: 'Debe seleccionar al menos un destinatario' });
    }

    if (!asunto || !mensaje) {
      return res.status(400).json({ error: 'Asunto y mensaje son requeridos' });
    }

    const ctxAlumno = await obtenerContextoAlumnoGrupoParaMensaje(colegio_id, anio_activo, hijoIdNum);
    const { asuntoFinal, mensajeFinal } = enriquecerMensajeApoderadoADocente({
      asuntoOriginal: asunto,
      mensajeOriginal: mensaje,
      ctx: ctxAlumno
    });

    // Responder inmediatamente
    res.json({
      success: true,
      message: 'Mensaje Enviado',
      procesando: false
    });

    // Procesar en segundo plano
    setImmediate(async () => {
      try {
        const fechaHora = fechaHoraMySQLLima();
        let mensajesInsertados = 0;
        const mensajesIds = [];
        const campanaApoderadoMensajes = [];

        for (const destinatarioId of destinatariosArray) {
          try {
            // Remitente = apoderado (ENVIADO y RECIBIDO guardan el mismo remitente real)
            const resultEnviado = await execute(
              `INSERT INTO mensajes (remitente_id, destinatario_id, asunto, mensaje, fecha_hora, estado, tipo, borrado, favorito)
               VALUES (?, ?, ?, ?, ?, 'NO_LEIDO', 'ENVIADO', 'NO', 'NO')`,
              [usuarioIdApoderado, destinatarioId, asuntoFinal, mensajeFinal, fechaHora]
            );

            const resultRecibido = await execute(
              `INSERT INTO mensajes (remitente_id, destinatario_id, asunto, mensaje, fecha_hora, estado, tipo, borrado, favorito)
               VALUES (?, ?, ?, ?, ?, 'NO_LEIDO', 'RECIBIDO', 'NO', 'NO')`,
              [usuarioIdApoderado, destinatarioId, asuntoFinal, mensajeFinal, fechaHora]
            );

            mensajesIds.push(resultEnviado.insertId, resultRecibido.insertId);
            mensajesInsertados += 2;
            campanaApoderadoMensajes.push({
              destinatarioId: parseInt(destinatarioId, 10),
              mensajeRecibidoId: resultRecibido.insertId
            });
          } catch (error) {
            console.error(`Error insertando mensaje para destinatario ${destinatarioId}:`, error);
          }
        }

        // Guardar archivos adjuntos si existen
        if (req.files && req.files.length > 0) {
          for (const file of req.files) {
            try {
              for (const mensajeId of mensajesIds) {
                await execute(
                  `INSERT INTO mensajes_archivos (mensaje_id, nombre_archivo, archivo)
                   VALUES (?, ?, ?)`,
                  [mensajeId, file.originalname, file.filename]
                );
              }
            } catch (error) {
              console.error(`Error guardando archivo ${file.originalname}:`, error);
            }
          }
        }

        let mapTipoApodMensajes = new Map();
        try {
          if (campanaApoderadoMensajes.length > 0 && req.user?.colegio_id) {
            const idsC = [...new Set(campanaApoderadoMensajes.map((c) => c.destinatarioId))];
            const tiposC = await query(
              `SELECT id, tipo FROM usuarios WHERE id IN (${idsC.map(() => '?').join(',')}) AND colegio_id = ?`,
              [...idsC, req.user.colegio_id]
            );
            mapTipoApodMensajes = new Map((tiposC || []).map((r) => [parseInt(r.id, 10), r.tipo]));
            const contenidoBell = `Mensaje de apoderado/familia: "${(asuntoFinal || 'Sin asunto').substring(0, 150)}".`;
            for (const row of campanaApoderadoMensajes) {
              const td = mapTipoApodMensajes.get(row.destinatarioId) || 'DOCENTE';
              let urlDest = '/docente/mensajes';
              if (td === 'APODERADO') urlDest = '/apoderado/mensajes';
              else if (td === 'ALUMNO') urlDest = '/alumno/mensajes';
              try {
                await insertNotificacionUsuario(execute, {
                  usuario_id: usuarioIdApoderado,
                  destinatario_id: row.destinatarioId,
                  asunto: 'Nuevo mensaje (apoderado)',
                  contenido: contenidoBell,
                  estado: 'ENVIADO',
                  accion_tipo: 'mensaje_nuevo',
                  accion_payload: { mensaje_id: row.mensajeRecibidoId, hijo_id: hijoIdNum },
                  url_destino: urlDest
                });
              } catch (bellErr) {
                console.warn('[MENSAJES APODERADO] Campanita:', bellErr.message);
              }
            }
          }
        } catch (bellErr2) {
          console.warn('[MENSAJES APODERADO] Notificaciones in-app:', bellErr2.message);
        }

        // Push notifications a destinatarios
        try {
          if (destinatariosArray.length > 0 && req.user?.colegio_id) {
            const subsData = await query(
              `SELECT usuario_id, endpoint, p256dh, auth FROM push_subscriptions
               WHERE usuario_id IN (${destinatariosArray.map(() => '?').join(',')})
                 AND colegio_id = ? AND (activo = 1 OR activo IS NULL)`,
              [...destinatariosArray.map(id => parseInt(id)), req.user.colegio_id]
            );
            if ((subsData || []).length > 0) {
              const asuntoCorto = (asuntoFinal || 'Sin asunto').substring(0, 80);
              const pushItemsAp = (subsData || []).map((sub) => {
                const uid = parseInt(sub.usuario_id, 10);
                const td = mapTipoApodMensajes.get(uid) || 'DOCENTE';
                let urlPush = '/docente/mensajes';
                if (td === 'APODERADO') urlPush = '/apoderado/mensajes';
                else if (td === 'ALUMNO') urlPush = '/alumno/mensajes';
                return {
                  subscription: {
                    endpoint: sub.endpoint,
                    keys: { p256dh: sub.p256dh, auth: sub.auth }
                  },
                  payload: {
                    title: 'Nuevo mensaje (apoderado)',
                    body: asuntoCorto,
                    icon: '/icons/icon-192x192.png',
                    badge: '/icons/icon-192x192.png',
                    vibrate: [200, 100, 200],
                    tag: `mensaje-${Date.now()}`,
                    data: { url: urlPush, tipo: 'mensaje' }
                  }
                };
              });
              enviarPushNotificacionesIndividuales(pushItemsAp).catch((err) =>
                console.error('❌ [MENSAJES] Error push:', err)
              );
            }
          }
        } catch (pushErr) {
          console.error('❌ [MENSAJES] Error push:', pushErr);
        }

        console.log('✅ Mensaje al docente enviado por apoderado (con referencia al alumno)');
      } catch (bgError) {
        console.error('Error en procesamiento en segundo plano:', bgError);
      }
    });
  } catch (error) {
    console.error('Error enviando mensaje:', error);
    res.status(500).json({ error: error.message || 'Error al enviar mensaje' });
  }
});

/**
 * POST /api/apoderado/hijos/:hijoId/mensajes/subir-imagen
 * Subir imagen desde el editor de texto enriquecido (en nombre del hijo)
 */
router.post('/hijos/:hijoId/mensajes/subir-imagen', uploadMensajes.single('imagen'), async (req, res) => {
  try {
    const { hijoId } = req.params;
    
    // Verificar permisos
    await verificarHijoYUsuarioApoderado(req, hijoId);

    if (!req.file) {
      return res.status(400).json({ error: 'No se proporcionó ninguna imagen' });
    }

    const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://nuevo.vanguardschools.edu.pe';
    const isProduction = process.env.NODE_ENV === 'production';
    
    let imagenUrl;
    if (isProduction) {
      imagenUrl = `${phpSystemUrl}/Static/Archivos/${req.file.filename}`;
    } else {
      imagenUrl = `http://localhost:5000/Static/Archivos/${req.file.filename}`;
    }
    
    res.json({ url: imagenUrl });
  } catch (error) {
    console.error('Error subiendo imagen:', error);
    res.status(500).json({ error: error.message || 'Error al subir la imagen' });
  }
});

/**
 * Middleware para verificar que las rutas proxy solo permitan GET (solo lectura)
 */
const soloLecturaProxy = (req, res, next) => {
  if (req.method !== 'GET') {
    return res.status(403).json({ 
      error: 'Solo lectura permitida. Los apoderados solo pueden ver el contenido, no realizar acciones.' 
    });
  }
  next();
};

/**
 * GET /api/apoderado/hijos/:hijoId/aula-virtual/tareas
 * Obtener tareas del aula virtual (solo lectura)
 */
router.get('/hijos/:hijoId/aula-virtual/tareas', soloLecturaProxy, async (req, res) => {
  try {
    const { hijoId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const { asignatura_id, ciclo } = req.query;

    if (!asignatura_id) {
      return res.status(400).json({ error: 'asignatura_id es requerido' });
    }

    const { alumnoId } = await verificarHijoYUsuarioApoderado(req, hijoId);
    const cicloFiltro = ciclo ? parseInt(ciclo) : 1;

    // Verificar acceso del hijo a la asignatura
    const asignatura = await query(
      `SELECT a.*, g.id as grupo_id
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN matriculas m ON m.grupo_id = g.id
       WHERE a.id = ? AND m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0 OR m.estado = 4)
       LIMIT 1`,
      [asignatura_id, alumnoId, colegio_id, anio_activo]
    );

    if (asignatura.length === 0) {
      return res.status(403).json({ error: 'El alumno no tiene acceso a esta asignatura' });
    }

    // Obtener tareas (ordenadas según el orden de creación - id ASC)
    const tareas = await query(
      `SELECT t.*, 
              CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre
       FROM asignaturas_tareas t
       INNER JOIN personal p ON p.id = t.trabajador_id
       WHERE t.asignatura_id = ? AND t.ciclo = ?
       ORDER BY t.id ASC`,
      [asignatura_id, cicloFiltro]
    );

    // Construir URLs de archivos
    const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://nuevo.vanguardschools.edu.pe';
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const tareasConArchivos = await Promise.all(tareas.map(async (tarea) => {
      const archivos = await query(
        `SELECT * FROM asignaturas_tareas_archivos WHERE tarea_id = ?`,
        [tarea.id]
      );

      const archivosConUrls = archivos.map(archivo => {
        let archivoUrl = null;
        if (archivo.archivo && archivo.archivo !== '') {
          if (archivo.archivo.startsWith('http')) {
            archivoUrl = archivo.archivo.replace(/https?:\/\/(www\.)?vanguardschools\.edu\.pe/gi, phpSystemUrl);
          } else if (archivo.archivo.startsWith('/Static/')) {
            const nombreArchivo = archivo.archivo.replace(/^\/Static\/Archivos\//, '');
            archivoUrl = isDevelopment
              ? `http://localhost:5000/Static/Archivos/${nombreArchivo}`
              : `${phpSystemUrl}/Static/Archivos/${nombreArchivo}`;
          } else {
            archivoUrl = isDevelopment
              ? `http://localhost:5000/Static/Archivos/${archivo.archivo}`
              : `${phpSystemUrl}/Static/Archivos/${archivo.archivo}`;
          }
        }
        return {
          ...archivo,
          archivo_url: archivoUrl
        };
      });

      let enlaceUrl = null;
      if (tarea.enlace && tarea.enlace !== '') {
        enlaceUrl = tarea.enlace.trim();
      }

      return {
        ...tarea,
        archivos: archivosConUrls,
        enlace_url: enlaceUrl
      };
    }));

    res.json({ tareas: tareasConArchivos });
  } catch (error) {
    console.error('Error obteniendo tareas:', error);
    res.status(500).json({ error: error.message || 'Error al obtener tareas' });
  }
});

/**
 * GET /api/apoderado/hijos/:hijoId/aula-virtual/tareas/:tareaId
 * Obtener detalles de una tarea específica (solo lectura)
 */
router.get('/hijos/:hijoId/aula-virtual/tareas/:tareaId', soloLecturaProxy, async (req, res) => {
  try {
    const { hijoId, tareaId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const { asignatura_id } = req.query;

    if (!asignatura_id) {
      return res.status(400).json({ error: 'asignatura_id es requerido' });
    }

    const { alumnoId } = await verificarHijoYUsuarioApoderado(req, hijoId);

    // Verificar acceso del hijo a la asignatura
    const asignatura = await query(
      `SELECT a.* FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN matriculas m ON m.grupo_id = g.id
       WHERE a.id = ? AND m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0 OR m.estado = 4)
       LIMIT 1`,
      [asignatura_id, alumnoId, colegio_id, anio_activo]
    );

    if (asignatura.length === 0) {
      return res.status(403).json({ error: 'El alumno no tiene acceso a esta asignatura' });
    }

    // Obtener tarea
    const tareas = await query(
      `SELECT t.*, 
              CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre
       FROM asignaturas_tareas t
       INNER JOIN personal p ON p.id = t.trabajador_id
       WHERE t.id = ? AND t.asignatura_id = ?`,
      [tareaId, asignatura_id]
    );

    if (tareas.length === 0) {
      return res.status(404).json({ error: 'Tarea no encontrada' });
    }

    const tarea = tareas[0];

    // Obtener archivos
    const archivos = await query(
      `SELECT * FROM asignaturas_tareas_archivos WHERE tarea_id = ?`,
      [tareaId]
    );

    // Construir URLs de archivos
    const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://nuevo.vanguardschools.edu.pe';
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const archivosConUrls = archivos.map(archivo => {
      let archivoUrl = null;
      if (archivo.archivo && archivo.archivo !== '') {
        if (archivo.archivo.startsWith('http')) {
          archivoUrl = archivo.archivo.replace(/https?:\/\/(www\.)?vanguardschools\.edu\.pe/gi, phpSystemUrl);
        } else if (archivo.archivo.startsWith('/Static/')) {
          const nombreArchivo = archivo.archivo.replace(/^\/Static\/Archivos\//, '');
          archivoUrl = isDevelopment
            ? `http://localhost:5000/Static/Archivos/${nombreArchivo}`
            : `${phpSystemUrl}/Static/Archivos/${nombreArchivo}`;
        } else {
          archivoUrl = isDevelopment
            ? `http://localhost:5000/Static/Archivos/${archivo.archivo}`
            : `${phpSystemUrl}/Static/Archivos/${archivo.archivo}`;
        }
      }
      return {
        ...archivo,
        archivo_url: archivoUrl
      };
    });

    let enlaceUrl = null;
    if (tarea.enlace && tarea.enlace !== '') {
      enlaceUrl = tarea.enlace.trim();
    }

    res.json({
      ...tarea,
      archivos: archivosConUrls,
      enlace_url: enlaceUrl
    });
  } catch (error) {
    console.error('Error obteniendo tarea:', error);
    res.status(500).json({ error: error.message || 'Error al obtener tarea' });
  }
});

/**
 * GET /api/apoderado/hijos/:hijoId/aula-virtual/examenes
 * Obtener exámenes del aula virtual (solo lectura)
 */
router.get('/hijos/:hijoId/aula-virtual/examenes', soloLecturaProxy, async (req, res) => {
  try {
    const { hijoId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const { asignatura_id } = req.query;

    if (!asignatura_id) {
      return res.status(400).json({ error: 'asignatura_id es requerido' });
    }

    const { alumnoId } = await verificarHijoYUsuarioApoderado(req, hijoId);

    // Verificar acceso del hijo a la asignatura
    const asignatura = await query(
      `SELECT a.* FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN matriculas m ON m.grupo_id = g.id
       WHERE a.id = ? AND m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0 OR m.estado = 4)
       LIMIT 1`,
      [asignatura_id, alumnoId, colegio_id, anio_activo]
    );

    if (asignatura.length === 0) {
      return res.status(403).json({ error: 'El alumno no tiene acceso a esta asignatura' });
    }

    const { ciclo: cicloExamen } = req.query;
    const cicloFiltroExamen = cicloExamen ? parseInt(cicloExamen) : 1;

    // Obtener exámenes (ordenados según el orden de creación - id ASC)
    const examenes = await query(
      `SELECT ae.*,
              (SELECT COUNT(*) FROM asignaturas_examenes_preguntas WHERE examen_id = ae.id) as total_preguntas
       FROM asignaturas_examenes ae
       WHERE ae.asignatura_id = ? AND ae.ciclo = ?
       ORDER BY ae.id ASC`,
      [asignatura_id, cicloFiltroExamen]
    );

    res.json({ examenes: examenes || [] });
  } catch (error) {
    console.error('Error obteniendo exámenes:', error);
    res.status(500).json({ error: error.message || 'Error al obtener exámenes' });
  }
});

/**
 * GET /api/apoderado/hijos/:hijoId/aula-virtual/examenes/:examenId/resultado
 * Obtener resultado de un examen (solo lectura)
 */
router.get('/hijos/:hijoId/aula-virtual/examenes/:examenId/resultado', soloLecturaProxy, async (req, res) => {
  try {
    const { hijoId, examenId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const { asignatura_id } = req.query;

    if (!asignatura_id) {
      return res.status(400).json({ error: 'asignatura_id es requerido' });
    }

    const { alumnoId, usuarioIdHijo } = await verificarHijoYUsuarioApoderado(req, hijoId);

    // Verificar acceso del hijo a la asignatura
    const asignatura = await query(
      `SELECT a.* FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN matriculas m ON m.grupo_id = g.id
       WHERE a.id = ? AND m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0 OR m.estado = 4)
       LIMIT 1`,
      [asignatura_id, alumnoId, colegio_id, anio_activo]
    );

    if (asignatura.length === 0) {
      return res.status(403).json({ error: 'El alumno no tiene acceso a esta asignatura' });
    }

    // Obtener resultado del examen
    const resultados = await query(
      `SELECT er.*, ae.titulo as examen_titulo
       FROM examenes_resultados er
       INNER JOIN asignaturas_examenes ae ON ae.id = er.examen_id
       WHERE er.examen_id = ? AND er.usuario_id = ?`,
      [examenId, usuarioIdHijo]
    );

    if (resultados.length === 0) {
      return res.json({ resultado: null });
    }

    res.json({ resultado: resultados[0] });
  } catch (error) {
    console.error('Error obteniendo resultado de examen:', error);
    res.status(500).json({ error: error.message || 'Error al obtener resultado' });
  }
});

/**
 * GET /api/apoderado/hijos/:hijoId/aula-virtual/examenes/:examenId/resultado/detalles
 * Obtener detalles del resultado de un examen (solo lectura)
 */
router.get('/hijos/:hijoId/aula-virtual/examenes/:examenId/resultado/detalles', soloLecturaProxy, async (req, res) => {
  try {
    const { hijoId, examenId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const { asignatura_id } = req.query;

    if (!asignatura_id) {
      return res.status(400).json({ error: 'asignatura_id es requerido' });
    }

    const { alumnoId, usuarioIdHijo } = await verificarHijoYUsuarioApoderado(req, hijoId);

    // Verificar acceso del hijo a la asignatura
    const asignatura = await query(
      `SELECT a.* FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN matriculas m ON m.grupo_id = g.id
       WHERE a.id = ? AND m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0 OR m.estado = 4)
       LIMIT 1`,
      [asignatura_id, alumnoId, colegio_id, anio_activo]
    );

    if (asignatura.length === 0) {
      return res.status(403).json({ error: 'El alumno no tiene acceso a esta asignatura' });
    }

    // Obtener resultado
    const resultados = await query(
      `SELECT er.* FROM examenes_resultados er
       WHERE er.examen_id = ? AND er.usuario_id = ?`,
      [examenId, usuarioIdHijo]
    );

    if (resultados.length === 0) {
      return res.json({ detalles: [] });
    }

    const resultado = resultados[0];

    // Obtener detalles de las respuestas
    const detalles = await query(
      `SELECT erd.*, aep.pregunta, aep.tipo_pregunta, aep.puntos
       FROM examenes_resultados_detalles erd
       INNER JOIN asignaturas_examenes_preguntas aep ON aep.id = erd.pregunta_id
       WHERE erd.resultado_id = ?
       ORDER BY erd.pregunta_id ASC`,
      [resultado.id]
    );

    res.json({ detalles: detalles || [] });
  } catch (error) {
    console.error('Error obteniendo detalles del resultado:', error);
    res.status(500).json({ error: error.message || 'Error al obtener detalles' });
  }
});

/**
 * GET /api/apoderado/hijos/:hijoId/aula-virtual/archivos
 * Obtener archivos del aula virtual (solo lectura)
 */
router.get('/hijos/:hijoId/aula-virtual/archivos', soloLecturaProxy, async (req, res) => {
  try {
    const { hijoId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const { asignatura_id } = req.query;

    if (!asignatura_id) {
      return res.status(400).json({ error: 'asignatura_id es requerido' });
    }

    const { alumnoId } = await verificarHijoYUsuarioApoderado(req, hijoId);

    // Verificar acceso del hijo a la asignatura
    const asignatura = await query(
      `SELECT a.* FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN matriculas m ON m.grupo_id = g.id
       WHERE a.id = ? AND m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0 OR m.estado = 4)
       LIMIT 1`,
      [asignatura_id, alumnoId, colegio_id, anio_activo]
    );

    if (asignatura.length === 0) {
      return res.status(403).json({ error: 'El alumno no tiene acceso a esta asignatura' });
    }

    const { ciclo } = req.query;
    const cicloFiltro = ciclo ? parseInt(ciclo) : 1;

    // Obtener archivos (ordenados según el orden establecido por el docente)
    const archivos = await query(
      `SELECT aa.*, 
              CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre
       FROM asignaturas_archivos aa
       LEFT JOIN personal p ON p.id = aa.trabajador_id
       WHERE aa.asignatura_id = ? AND aa.ciclo = ?
       ORDER BY aa.orden ASC, aa.id ASC`,
      [asignatura_id, cicloFiltro]
    );

    // Construir URLs
    const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://nuevo.vanguardschools.edu.pe';
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const archivosConUrls = archivos.map(archivo => {
      let archivoUrl = null;
      if (archivo.archivo && archivo.archivo !== '') {
        if (archivo.archivo.startsWith('http')) {
          archivoUrl = archivo.archivo.replace(/https?:\/\/(www\.)?vanguardschools\.edu\.pe/gi, phpSystemUrl);
        } else if (archivo.archivo.startsWith('/Static/')) {
          const nombreArchivo = archivo.archivo.replace(/^\/Static\/Archivos\//, '');
          archivoUrl = isDevelopment
            ? `http://localhost:5000/Static/Archivos/${nombreArchivo}`
            : `${phpSystemUrl}/Static/Archivos/${nombreArchivo}`;
        } else {
          archivoUrl = isDevelopment
            ? `http://localhost:5000/Static/Archivos/${archivo.archivo}`
            : `${phpSystemUrl}/Static/Archivos/${archivo.archivo}`;
        }
      }
      return {
        ...archivo,
        archivo_url: archivoUrl
      };
    });

    res.json({ archivos: archivosConUrls || [] });
  } catch (error) {
    console.error('Error obteniendo archivos:', error);
    res.status(500).json({ error: error.message || 'Error al obtener archivos' });
  }
});

/**
 * GET /api/apoderado/hijos/:hijoId/aula-virtual/videos
 * Obtener videos del aula virtual (solo lectura)
 */
router.get('/hijos/:hijoId/aula-virtual/videos', soloLecturaProxy, async (req, res) => {
  try {
    const { hijoId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const { asignatura_id } = req.query;

    if (!asignatura_id) {
      return res.status(400).json({ error: 'asignatura_id es requerido' });
    }

    const { alumnoId } = await verificarHijoYUsuarioApoderado(req, hijoId);

    // Verificar acceso del hijo a la asignatura
    const asignatura = await query(
      `SELECT a.* FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN matriculas m ON m.grupo_id = g.id
       WHERE a.id = ? AND m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0 OR m.estado = 4)
       LIMIT 1`,
      [asignatura_id, alumnoId, colegio_id, anio_activo]
    );

    if (asignatura.length === 0) {
      return res.status(403).json({ error: 'El alumno no tiene acceso a esta asignatura' });
    }

    const { ciclo: cicloVideo } = req.query;
    const cicloFiltroVideo = cicloVideo ? parseInt(cicloVideo) : 1;

    // Obtener videos (ordenados según el orden de creación - id ASC)
    const videos = await query(
      `SELECT av.*, 
              CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre
       FROM asignaturas_videos av
       LEFT JOIN personal p ON p.id = av.trabajador_id
       WHERE av.asignatura_id = ? AND av.ciclo = ?
       ORDER BY av.id ASC`,
      [asignatura_id, cicloFiltroVideo]
    );

    res.json({ videos: videos || [] });
  } catch (error) {
    console.error('Error obteniendo videos:', error);
    res.status(500).json({ error: error.message || 'Error al obtener videos' });
  }
});

/**
 * GET /api/apoderado/hijos/:hijoId/aula-virtual/enlaces
 * Obtener enlaces del aula virtual (solo lectura)
 */
router.get('/hijos/:hijoId/aula-virtual/enlaces', soloLecturaProxy, async (req, res) => {
  try {
    const { hijoId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const { asignatura_id } = req.query;

    if (!asignatura_id) {
      return res.status(400).json({ error: 'asignatura_id es requerido' });
    }

    const { alumnoId } = await verificarHijoYUsuarioApoderado(req, hijoId);

    // Verificar acceso del hijo a la asignatura
    const asignatura = await query(
      `SELECT a.* FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN matriculas m ON m.grupo_id = g.id
       WHERE a.id = ? AND m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0 OR m.estado = 4)
       LIMIT 1`,
      [asignatura_id, alumnoId, colegio_id, anio_activo]
    );

    if (asignatura.length === 0) {
      return res.status(403).json({ error: 'El alumno no tiene acceso a esta asignatura' });
    }

    // Obtener enlaces
    const enlaces = await query(
      `SELECT ae.*, 
              CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre
       FROM asignaturas_enlaces ae
       LEFT JOIN personal p ON p.id = ae.trabajador_id
       WHERE ae.asignatura_id = ?
       ORDER BY ae.id DESC`,
      [asignatura_id]
    );

    res.json({ enlaces: enlaces || [] });
  } catch (error) {
    console.error('Error obteniendo enlaces:', error);
    res.status(500).json({ error: error.message || 'Error al obtener enlaces' });
  }
});

/**
 * GET /api/apoderado/hijos/:hijoId/aula-virtual/:asignaturaId
 * Obtener información del aula virtual del hijo (solo lectura)
 */
router.get('/hijos/:hijoId/aula-virtual/:asignaturaId', async (req, res) => {
  try {
    const { hijoId, asignaturaId } = req.params;
    const { colegio_id, anio_activo } = req.user;

    // Verificar permisos y obtener datos del hijo
    const { alumnoId } = await verificarHijoYUsuarioApoderado(req, hijoId);

    // Verificar que el hijo tiene acceso a esta asignatura
    const asignatura = await query(
      `SELECT a.*, g.id as grupo_id, c.nombre as curso_nombre,
              g.grado, g.seccion, n.nombre as nivel_nombre,
              CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN cursos c ON c.id = a.curso_id
       INNER JOIN personal p ON p.id = a.personal_id
       INNER JOIN matriculas m ON m.grupo_id = g.id
       WHERE a.id = ? AND m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0 OR m.estado = 4)
       LIMIT 1`,
      [asignaturaId, alumnoId, colegio_id, anio_activo]
    );

    if (asignatura.length === 0) {
      return res.status(403).json({ error: 'El alumno no tiene acceso a esta asignatura' });
    }

    const asignaturaData = asignatura[0];

    res.json({
      asignatura: {
        id: asignaturaData.id,
        curso_nombre: asignaturaData.curso_nombre,
        grado: asignaturaData.grado,
        seccion: asignaturaData.seccion,
        nivel_nombre: asignaturaData.nivel_nombre,
        docente_nombre: asignaturaData.docente_nombre || 'Docente',
        aula_virtual: asignaturaData.aula_virtual || '',
        habilitar_aula: asignaturaData.habilitar_aula || 'NO'
      },
      alumno_id: alumnoId
    });
  } catch (error) {
    console.error('Error obteniendo aula virtual:', error);
    res.status(500).json({ error: error.message || 'Error al obtener aula virtual' });
  }
});

/**
 * GET /api/apoderado/publicaciones
 * Obtener publicaciones (solo las de TODOS y las de los grupos de sus hijos)
 */
router.get('/publicaciones', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, apoderado_id } = req.user;

    // Obtener todos los grupos de los hijos del apoderado
    // La relación entre alumnos y apoderados se hace a través de la tabla 'familias'
    const hijosGrupos = await query(
      `SELECT DISTINCT m.grupo_id
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       INNER JOIN alumnos a ON a.id = m.alumno_id
       INNER JOIN familias f ON f.alumno_id = a.id
       WHERE f.apoderado_id = ? AND m.colegio_id = ? AND g.anio = ?
       AND (m.estado = 0 OR m.estado = 4)`,
      [apoderado_id, colegio_id, anio_activo]
    );

    const gruposIds = hijosGrupos.map(hg => hg.grupo_id);

    // Obtener publicaciones: solo las de TODOS y las de los grupos de sus hijos
    let publicaciones = [];
    try {
      if (gruposIds.length > 0) {
        // Construir condiciones para LIKE (buscar cada grupoId en privacidad)
        const condicionesGrupos = gruposIds.map(grupoId => 
          `(p.privacidad LIKE ? OR p.privacidad LIKE ? OR p.privacidad LIKE ? OR p.privacidad = ?)`
        ).join(' OR ');
        
        const params = [colegio_id];
        gruposIds.forEach(grupoId => {
          // Medio, primero, último en lista CSV, o único grupo
          params.push(`%,${grupoId},%`, `${grupoId},%`, `%,${grupoId}`, String(grupoId));
        });

        publicaciones = await query(
          `SELECT p.*,
                  u.usuario as autor_usuario,
                  u.id as autor_id,
                  u.tipo as autor_tipo,
                  COALESCE(
                    CONCAT(pers.nombres, ' ', pers.apellidos),
                    CONCAT(al.nombres, ' ', al.apellido_paterno, ' ', al.apellido_materno),
                    u.usuario
                  ) as autor_nombre_completo,
                  COALESCE(pers.foto, al.foto) as autor_foto
           FROM publicaciones p
           LEFT JOIN usuarios u ON u.id = p.usuario_id
           LEFT JOIN personal pers ON pers.id = u.personal_id
           LEFT JOIN alumnos al ON al.id = u.alumno_id
           WHERE p.colegio_id = ?
           AND (p.privacidad = '-1' OR p.privacidad = '' OR p.privacidad IS NULL 
                OR ${condicionesGrupos})
           ORDER BY p.fecha_hora DESC
           LIMIT 50`,
          params
        );
      } else {
        // Si no tiene hijos con grupos, solo mostrar publicaciones de TODOS
        publicaciones = await query(
          `SELECT p.*,
                  u.usuario as autor_usuario,
                  u.id as autor_id,
                  u.tipo as autor_tipo,
                  COALESCE(
                    CONCAT(pers.nombres, ' ', pers.apellidos),
                    CONCAT(al.nombres, ' ', al.apellido_paterno, ' ', al.apellido_materno),
                    u.usuario
                  ) as autor_nombre_completo,
                  COALESCE(pers.foto, al.foto) as autor_foto
           FROM publicaciones p
           LEFT JOIN usuarios u ON u.id = p.usuario_id
           LEFT JOIN personal pers ON pers.id = u.personal_id
           LEFT JOIN alumnos al ON al.id = u.alumno_id
           WHERE p.colegio_id = ?
           AND (p.privacidad = '-1' OR p.privacidad = '' OR p.privacidad IS NULL)
           ORDER BY p.fecha_hora DESC
           LIMIT 50`,
          [colegio_id]
        );
      }
    } catch (error) {
      console.error('Error obteniendo publicaciones:', error);
      publicaciones = [];
    }

    // Obtener todos los grupos del colegio para mapear IDs a nombres
    const gruposMap = {};
    try {
      const grupos = await query(
        `SELECT g.id, n.nombre as nivel_nombre, g.grado, g.seccion
         FROM grupos g
         INNER JOIN niveles n ON n.id = g.nivel_id
         WHERE g.colegio_id = ? AND g.anio = ?`,
        [colegio_id, anio_activo]
      );
      grupos.forEach(g => {
        gruposMap[g.id] = `${g.nivel_nombre} ${g.grado}° ${g.seccion}`;
      });
    } catch (error) {
      console.warn('Error obteniendo grupos para mapeo:', error);
    }

    // Procesar publicaciones (igual que alumno)
    const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://nuevo.vanguardschools.edu.pe';
    const frontendUrl = process.env.FRONTEND_URL || 'https://sistema.vanguardschools.edu.pe';
    const isProduction = process.env.NODE_ENV === 'production';

    const publicacionesProcesadas = publicaciones.map(pub => {
      // Decodificar imágenes
      let images = [];
      if (pub.images && pub.images.trim() !== '') {
        try {
          const decoded = Buffer.from(pub.images, 'base64').toString('utf-8');
          const deserialized = phpSerialize.unserialize(decoded);
          if (Array.isArray(deserialized)) {
            images = deserialized.map(img => {
              if (img.startsWith('http')) {
                return img;
              } else if (img.startsWith('/Static/')) {
                return `${phpSystemUrl}${img}`;
              } else {
                return `${phpSystemUrl}/Static/Image/Publicaciones/${img}`;
              }
            });
          }
        } catch (error) {
          console.warn('Error decodificando imágenes de publicación:', error);
        }
      }

      // Decodificar archivos
      let archivos = [];
      if (pub.archivos && pub.archivos.trim() !== '') {
        try {
          let decoded = pub.archivos;
          try {
            const base64Decoded = Buffer.from(pub.archivos, 'base64').toString('utf-8');
            if (base64Decoded.startsWith('a:')) {
              decoded = base64Decoded;
            }
          } catch (e) {
            decoded = pub.archivos;
          }
          
          if (decoded.startsWith('a:')) {
            const regex = /s:\d+:"([^"]+)"/g;
            let match;
            while ((match = regex.exec(decoded)) !== null) {
              archivos.push(match[1]);
            }
          }
        } catch (error) {
          console.warn('Error decodificando archivos de publicación:', error);
        }
      }

      // Construir URL completa de la foto del autor
      let autorFotoUrl = null;
      if (pub.autor_foto && pub.autor_foto !== '') {
        if (pub.autor_foto.startsWith('http')) {
          autorFotoUrl = pub.autor_foto;
        } else if (pub.autor_foto.startsWith('/uploads/')) {
          if (isProduction) {
            autorFotoUrl = `${frontendUrl}${pub.autor_foto}`;
          } else {
            autorFotoUrl = `http://localhost:5000${pub.autor_foto}`;
          }
        } else {
          const esPersonal = pub.autor_tipo === 'DOCENTE' || pub.autor_tipo === 'DIRECTOR' || pub.autor_tipo === 'ADMINISTRADOR';
          if (isProduction) {
            autorFotoUrl = `${phpSystemUrl}/Static/Image/Fotos/${pub.autor_foto}`;
          } else {
            const uploadPath = esPersonal ? 'uploads/personal' : 'uploads/alumnos';
            autorFotoUrl = `http://localhost:5000/${uploadPath}/${pub.autor_foto}`;
          }
        }
      }

      // Procesar grupos
      let gruposNombres = [];
      if (pub.privacidad && pub.privacidad !== '' && pub.privacidad !== '-1' && pub.privacidad !== '-2') {
        const grupoIds = pub.privacidad.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id) && id > 0);
        gruposNombres = grupoIds.map(id => gruposMap[id] || `Grupo ${id}`).filter(Boolean);
      }
      
      // Determinar compartir_con basado en privacidad
      let compartirCon = 'TODOS';
      if (pub.privacidad === '-2') {
        compartirCon = 'PERSONAL';
      } else if (pub.privacidad && pub.privacidad !== '' && pub.privacidad !== '-1' && pub.privacidad !== '-2') {
        compartirCon = 'GRUPO';
      }

      return {
        id: pub.id,
        contenido: pub.contenido || '',
        images: images,
        archivos: archivos,
        compartir_con: compartirCon,
        grupos: gruposNombres,
        fecha_hora: pub.fecha_hora,
        para_texto: compartirCon === 'TODOS' ? 'Todos' : (gruposNombres.length > 0 ? gruposNombres.join(', ') : 'Grupos específicos'),
        autor_id: pub.autor_id,
        autor_usuario: pub.autor_usuario,
        autor_nombre_completo: pub.autor_nombre_completo || pub.autor_usuario || 'Usuario',
        autor_foto_url: autorFotoUrl,
        autor_tipo: pub.autor_tipo,
        autor: {
          id: pub.autor_id,
          usuario: pub.autor_usuario,
          nombre_completo: pub.autor_nombre_completo || pub.autor_usuario || 'Usuario',
          foto: autorFotoUrl,
          tipo: pub.autor_tipo
        }
      };
    });

    res.json({ publicaciones: publicacionesProcesadas || [] });
  } catch (error) {
    console.error('Error obteniendo publicaciones:', error);
    res.status(500).json({ error: 'Error al obtener publicaciones' });
  }
});

/**
 * GET /api/apoderado/mensajes/recibidos
 * Obtener mensajes recibidos con información completa del remitente
 */
router.get('/mensajes/recibidos', async (req, res) => {
  try {
    console.log('📥 [APODERADO MENSAJES] GET /mensajes/recibidos - Iniciando');
    const { usuario_id, colegio_id } = req.user;
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const anioFiltro = req.query.anio ? parseInt(req.query.anio) : null;
    
    let querySQL = `SELECT m.*, 
              CASE
                WHEN p.id IS NOT NULL THEN CONCAT(p.nombres, ' ', p.apellidos)
                WHEN a.id IS NOT NULL THEN CONCAT(a.nombres, ' ', a.apellido_paterno, ' ', a.apellido_materno)
                WHEN ap.id IS NOT NULL THEN CONCAT(ap.nombres, ' ', ap.apellido_paterno, ' ', ap.apellido_materno)
                ELSE 'Usuario desconocido'
              END as remitente_nombre_completo,
              u1.tipo as remitente_tipo,
              u1.usuario as remitente_usuario
       FROM mensajes m
       INNER JOIN usuarios u1 ON u1.id = m.remitente_id
       LEFT JOIN personal p ON p.id = u1.personal_id
       LEFT JOIN alumnos a ON a.id = u1.alumno_id
       LEFT JOIN apoderados ap ON ap.id = u1.apoderado_id
       WHERE m.destinatario_id = ? 
         AND m.tipo = 'RECIBIDO'
         AND m.borrado = 'NO'`;
    
    const queryParams = [usuario_id];
    
    if (anioFiltro) {
      querySQL += ` AND YEAR(m.fecha_hora) = ?`;
      queryParams.push(anioFiltro);
    }
    
    querySQL += ` ORDER BY m.fecha_hora DESC LIMIT ? OFFSET ?`;
    queryParams.push(parseInt(limit), offset);
    
    const mensajes = await query(querySQL, queryParams);

    // Obtener archivos adjuntos para cada mensaje
    const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://nuevo.vanguardschools.edu.pe';
    const isProduction = process.env.NODE_ENV === 'production';
    
    for (const mensaje of mensajes) {
      const archivos = await query(
        `SELECT id, nombre_archivo, archivo
         FROM mensajes_archivos
         WHERE mensaje_id = ?`,
        [mensaje.id]
      );
      
      mensaje.archivos = (archivos || []).map(archivo => {
        let archivoUrl;
        if (isProduction) {
          archivoUrl = `${phpSystemUrl}/Static/Archivos/${archivo.archivo}`;
        } else {
          archivoUrl = `http://localhost:5000/Static/Archivos/${archivo.archivo}`;
        }
        return {
          ...archivo,
          archivo_url: archivoUrl
        };
      });
    }

    // Contar total
    let countSQL = `SELECT COUNT(*) as count
       FROM mensajes m
       WHERE m.destinatario_id = ? 
         AND m.tipo = 'RECIBIDO'
         AND m.borrado = 'NO'`;
    const countParams = [usuario_id];
    
    if (anioFiltro) {
      countSQL += ` AND YEAR(m.fecha_hora) = ?`;
      countParams.push(anioFiltro);
    }
    
    const total = await query(countSQL, countParams);

    res.json({ 
      mensajes: mensajes || [],
      pagination: {
        total: total[0]?.count || 0,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil((total[0]?.count || 0) / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error obteniendo mensajes recibidos:', error);
    res.status(500).json({ error: 'Error al obtener mensajes recibidos' });
  }
});

/**
 * GET /api/apoderado/mensajes/enviados
 * Obtener mensajes enviados con información completa del destinatario
 */
router.get('/mensajes/enviados', async (req, res) => {
  try {
    const { usuario_id, colegio_id } = req.user;
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const anioFiltro = req.query.anio ? parseInt(req.query.anio) : null;
    
    let querySQL = `SELECT m.*,
              CASE
                WHEN p.id IS NOT NULL THEN CONCAT(p.nombres, ' ', p.apellidos)
                WHEN a.id IS NOT NULL THEN CONCAT(a.nombres, ' ', a.apellido_paterno, ' ', a.apellido_materno)
                WHEN ap.id IS NOT NULL THEN CONCAT(ap.nombres, ' ', ap.apellido_paterno, ' ', ap.apellido_materno)
                ELSE 'Usuario desconocido'
              END as destinatario_nombre_completo,
              u2.tipo as destinatario_tipo,
              u2.usuario as destinatario_usuario
       FROM mensajes m
       INNER JOIN usuarios u2 ON u2.id = m.destinatario_id
       LEFT JOIN personal p ON p.id = u2.personal_id
       LEFT JOIN alumnos a ON a.id = u2.alumno_id
       LEFT JOIN apoderados ap ON ap.id = u2.apoderado_id
       WHERE m.remitente_id = ? 
         AND m.tipo = 'ENVIADO'
         AND m.borrado = 'NO'`;
    
    const queryParams = [usuario_id];
    
    if (anioFiltro) {
      querySQL += ` AND YEAR(m.fecha_hora) = ?`;
      queryParams.push(anioFiltro);
    }
    
    querySQL += ` ORDER BY m.fecha_hora DESC LIMIT ? OFFSET ?`;
    queryParams.push(parseInt(limit), offset);
    
    const mensajes = await query(querySQL, queryParams);

    // Obtener archivos adjuntos para cada mensaje
    const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://nuevo.vanguardschools.edu.pe';
    const isProduction = process.env.NODE_ENV === 'production';
    
    for (const mensaje of mensajes) {
      const archivos = await query(
        `SELECT id, nombre_archivo, archivo
         FROM mensajes_archivos
         WHERE mensaje_id = ?`,
        [mensaje.id]
      );
      
      mensaje.archivos = (archivos || []).map(archivo => {
        let archivoUrl;
        if (isProduction) {
          archivoUrl = `${phpSystemUrl}/Static/Archivos/${archivo.archivo}`;
        } else {
          archivoUrl = `http://localhost:5000/Static/Archivos/${archivo.archivo}`;
        }
        return {
          ...archivo,
          archivo_url: archivoUrl
        };
      });
    }

    // Contar total
    let countSQL = `SELECT COUNT(*) as count
       FROM mensajes m
       WHERE m.remitente_id = ? 
         AND m.tipo = 'ENVIADO'
         AND m.borrado = 'NO'`;
    const countParams = [usuario_id];
    
    if (anioFiltro) {
      countSQL += ` AND YEAR(m.fecha_hora) = ?`;
      countParams.push(anioFiltro);
    }
    
    const total = await query(countSQL, countParams);

    res.json({ 
      mensajes: mensajes || [],
      pagination: {
        total: total[0]?.count || 0,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil((total[0]?.count || 0) / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error obteniendo mensajes enviados:', error);
    res.status(500).json({ error: 'Error al obtener mensajes enviados' });
  }
});

/**
 * GET /api/apoderado/mensajes/buscar-destinatarios
 * Buscar destinatarios (docentes, personal administrativo, alumnos, otros apoderados)
 */
router.get('/mensajes/buscar-destinatarios', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const { q = '' } = req.query;

    if (!q || q.trim().length < 2) {
      return res.json({ resultados: [] });
    }

    const searchTerm = `%${q.trim()}%`;
    const resultados = [];

    // Buscar personal (docentes, directores, administradores)
    const personal = await query(
      `SELECT DISTINCT u.id as usuario_id,
              CONCAT(p.nombres, ' ', p.apellidos) as nombre_completo,
              u.tipo as tipo,
              p.cargo as info_adicional
       FROM personal p
       INNER JOIN usuarios u ON u.personal_id = p.id AND u.estado = 'ACTIVO'
       WHERE p.colegio_id = ?
         AND (p.nombres LIKE ? OR p.apellidos LIKE ? OR u.usuario LIKE ?)
       ORDER BY p.nombres, p.apellidos
       LIMIT 20`,
      [colegio_id, searchTerm, searchTerm, searchTerm]
    );

    personal.forEach(p => {
      resultados.push({
        usuario_id: p.usuario_id,
        nombre_completo: p.nombre_completo,
        tipo: p.tipo,
        info_adicional: p.info_adicional || p.tipo
      });
    });

    // Buscar alumnos (del año activo)
    const { anio_activo } = req.user;
    const alumnos = await query(
      `SELECT DISTINCT u.id as usuario_id,
              CONCAT(a.nombres, ' ', a.apellido_paterno, ' ', a.apellido_materno) as nombre_completo,
              'ALUMNO' as tipo,
              CONCAT(g.grado, '° ', g.seccion, ' - ', n.nombre) as info_adicional,
              a.foto
       FROM alumnos a
       INNER JOIN usuarios u ON u.alumno_id = a.id AND u.estado = 'ACTIVO'
       INNER JOIN matriculas m ON m.alumno_id = a.id
       INNER JOIN grupos g ON g.id = m.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       WHERE a.colegio_id = ?
         AND g.anio = ?
         AND (m.estado = 0 OR m.estado = 4)
         AND (
           a.nombres LIKE ? OR
           a.apellido_paterno LIKE ? OR
           a.apellido_materno LIKE ? OR
           CONCAT(a.nombres, ' ', a.apellido_paterno, ' ', a.apellido_materno) LIKE ?
         )
       ORDER BY a.apellido_paterno, a.apellido_materno, a.nombres
       LIMIT 20`,
      [colegio_id, anio_activo, searchTerm, searchTerm, searchTerm, searchTerm]
    );

    alumnos.forEach(a => {
      resultados.push({
        usuario_id: a.usuario_id,
        nombre_completo: a.nombre_completo.trim(),
        tipo: a.tipo,
        info_adicional: a.info_adicional,
        foto: a.foto
      });
    });

    // Buscar otros apoderados
    const apoderados = await query(
      `SELECT DISTINCT u.id as usuario_id,
              CONCAT(ap.nombres, ' ', ap.apellido_paterno, ' ', ap.apellido_materno) as nombre_completo,
              u.tipo as tipo,
              'Apoderado' as info_adicional
       FROM apoderados ap
       INNER JOIN usuarios u ON u.apoderado_id = ap.id AND u.estado = 'ACTIVO'
       WHERE ap.colegio_id = ?
         AND (ap.nombres LIKE ? OR ap.apellido_paterno LIKE ? OR ap.apellido_materno LIKE ? OR u.usuario LIKE ?)
       ORDER BY ap.nombres, ap.apellido_paterno
       LIMIT 20`,
      [colegio_id, searchTerm, searchTerm, searchTerm, searchTerm]
    );

    apoderados.forEach(ap => {
      resultados.push({
        usuario_id: ap.usuario_id,
        nombre_completo: ap.nombre_completo,
        tipo: ap.tipo,
        info_adicional: ap.info_adicional
      });
    });

    res.json({ resultados: resultados.slice(0, 20) });
  } catch (error) {
    console.error('Error buscando destinatarios:', error);
    res.status(500).json({ error: 'Error al buscar destinatarios' });
  }
});

/**
 * POST /api/apoderado/mensajes/subir-imagen
 * Subir imagen desde el editor de texto enriquecido
 */
router.post('/mensajes/subir-imagen', uploadMensajes.single('imagen'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se proporcionó ninguna imagen' });
    }

    const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://nuevo.vanguardschools.edu.pe';
    const isProduction = process.env.NODE_ENV === 'production';
    
    let imagenUrl;
    if (isProduction) {
      imagenUrl = `${phpSystemUrl}/Static/Archivos/${req.file.filename}`;
    } else {
      imagenUrl = `http://localhost:5000/Static/Archivos/${req.file.filename}`;
    }
    
    res.json({ url: imagenUrl });
  } catch (error) {
    console.error('Error subiendo imagen:', error);
    res.status(500).json({ error: 'Error al subir la imagen' });
  }
});

/**
 * POST /api/apoderado/mensajes/enviar
 * Enviar mensaje
 */
router.post('/mensajes/enviar', uploadMensajes.array('archivos', 10), async (req, res) => {
  try {
    const { usuario_id, colegio_id } = req.user;
    const { destinatarios, grupos, asunto, mensaje } = req.body;

    const destinatariosArray = typeof destinatarios === 'string' ? JSON.parse(destinatarios) : destinatarios;
    const gruposArray = typeof grupos === 'string' ? JSON.parse(grupos || '[]') : (grupos || []);

    if ((!destinatariosArray || destinatariosArray.length === 0) && (!gruposArray || gruposArray.length === 0)) {
      return res.status(400).json({ error: 'Debe seleccionar al menos un destinatario o grupo' });
    }

    if (!asunto || !mensaje) {
      return res.status(400).json({ error: 'Asunto y mensaje son requeridos' });
    }

    // Responder inmediatamente
    res.json({
      success: true,
      message: 'Mensaje Enviado',
      procesando: false
    });

    // Procesar en segundo plano
    setImmediate(async () => {
      try {
        const fechaHora = fechaHoraMySQLLima();
        let mensajesInsertados = 0;
        const mensajesIds = [];
        let alumnosEnGrupos = 0;
        let destinatariosDirectos = 0;

        // Obtener alumnos de los grupos seleccionados
        const alumnosGrupos = new Set();
        if (gruposArray && gruposArray.length > 0) {
          const gruposIds = gruposArray.map(g => parseInt(g)).filter(g => !isNaN(g) && g > 0);
          if (gruposIds.length > 0) {
            const alumnos = await query(
              `SELECT DISTINCT u.id as usuario_id
               FROM matriculas m
               INNER JOIN alumnos a ON a.id = m.alumno_id
               INNER JOIN usuarios u ON u.alumno_id = a.id AND u.estado = 'ACTIVO'
               WHERE m.grupo_id IN (${gruposIds.map(() => '?').join(',')})
                 AND m.anio = (SELECT anio FROM colegios WHERE id = ?)`,
              [...gruposIds, colegio_id]
            );
            alumnos.forEach(a => alumnosGrupos.add(a.usuario_id));
            alumnosEnGrupos = alumnos.length;
          }
        }

        // Combinar destinatarios directos y de grupos
        const todosDestinatarios = new Set();
        if (destinatariosArray && destinatariosArray.length > 0) {
          destinatariosArray.forEach(d => todosDestinatarios.add(parseInt(d)));
          destinatariosDirectos = destinatariosArray.length;
        }
        alumnosGrupos.forEach(a => todosDestinatarios.add(a));

        const campanaApoderadoGeneral = [];
        for (const destinatarioId of todosDestinatarios) {
          try {
            // Mensaje para el remitente (tipo ENVIADO)
            const resultEnviado = await execute(
              `INSERT INTO mensajes (remitente_id, destinatario_id, asunto, mensaje, fecha_hora, estado, tipo, borrado, favorito)
               VALUES (?, ?, ?, ?, ?, 'NO_LEIDO', 'ENVIADO', 'NO', 'NO')`,
              [usuario_id, destinatarioId, asunto, mensaje, fechaHora]
            );

            // Mensaje para el destinatario (tipo RECIBIDO)
            const resultRecibido = await execute(
              `INSERT INTO mensajes (remitente_id, destinatario_id, asunto, mensaje, fecha_hora, estado, tipo, borrado, favorito)
               VALUES (?, ?, ?, ?, ?, 'NO_LEIDO', 'RECIBIDO', 'NO', 'NO')`,
              [usuario_id, destinatarioId, asunto, mensaje, fechaHora]
            );

            mensajesIds.push(resultEnviado.insertId, resultRecibido.insertId);
            mensajesInsertados += 2;
            campanaApoderadoGeneral.push({
              destinatarioId: parseInt(destinatarioId, 10),
              mensajeRecibidoId: resultRecibido.insertId
            });
          } catch (error) {
            console.error(`Error insertando mensaje para destinatario ${destinatarioId}:`, error);
          }
        }

        // Guardar archivos adjuntos si existen
        if (req.files && req.files.length > 0) {
          for (const file of req.files) {
            try {
              for (const mensajeId of mensajesIds) {
                await execute(
                  `INSERT INTO mensajes_archivos (mensaje_id, nombre_archivo, archivo)
                   VALUES (?, ?, ?)`,
                  [mensajeId, file.originalname, file.filename]
                );
              }
            } catch (error) {
              console.error(`Error guardando archivo ${file.originalname}:`, error);
            }
          }
        }

        const allDestIdsTipos = Array.from(todosDestinatarios).map((id) => parseInt(id, 10));
        let mapTipoApoderadoGeneral = new Map();
        if (allDestIdsTipos.length > 0) {
          const tiposAll = await query(
            `SELECT id, tipo FROM usuarios WHERE id IN (${allDestIdsTipos.map(() => '?').join(',')}) AND colegio_id = ?`,
            [...allDestIdsTipos, colegio_id]
          );
          mapTipoApoderadoGeneral = new Map((tiposAll || []).map((r) => [parseInt(r.id, 10), r.tipo]));
        }
        try {
          if (campanaApoderadoGeneral.length > 0) {
            const contenidoBell = `Nuevo mensaje (apoderado): "${(asunto || 'Sin asunto').substring(0, 150)}".`;
            for (const row of campanaApoderadoGeneral) {
              const td = mapTipoApoderadoGeneral.get(row.destinatarioId) || 'DOCENTE';
              let urlDest = '/docente/mensajes';
              if (td === 'APODERADO') urlDest = '/apoderado/mensajes';
              else if (td === 'ALUMNO') urlDest = '/alumno/mensajes';
              try {
                await insertNotificacionUsuario(execute, {
                  usuario_id,
                  destinatario_id: row.destinatarioId,
                  asunto: 'Nuevo mensaje (apoderado)',
                  contenido: contenidoBell,
                  estado: 'ENVIADO',
                  accion_tipo: 'mensaje_nuevo',
                  accion_payload: { mensaje_id: row.mensajeRecibidoId },
                  url_destino: urlDest
                });
              } catch (bellErr) {
                console.warn(`[MENSAJES APODERADO GENERAL] Campanita dest ${row.destinatarioId}:`, bellErr.message);
              }
            }
          }
        } catch (bellErr2) {
          console.warn('[MENSAJES APODERADO GENERAL] Notificaciones in-app:', bellErr2.message);
        }

        // Push notifications a destinatarios (alumnos, apoderados, docentes)
        try {
          const destIds = Array.from(todosDestinatarios);
          if (destIds.length > 0) {
            const subsData = await query(
              `SELECT usuario_id, endpoint, p256dh, auth FROM push_subscriptions
               WHERE usuario_id IN (${destIds.map(() => '?').join(',')})
                 AND colegio_id = ? AND (activo = 1 OR activo IS NULL)`,
              [...destIds, colegio_id]
            );
            if ((subsData || []).length > 0) {
              const asuntoCorto = (asunto || 'Sin asunto').substring(0, 60);
              const pushItemsGen = (subsData || []).map((sub) => {
                const uid = parseInt(sub.usuario_id, 10);
                const td = mapTipoApoderadoGeneral.get(uid) || 'DOCENTE';
                let urlPush = '/docente/mensajes';
                if (td === 'APODERADO') urlPush = '/apoderado/mensajes';
                else if (td === 'ALUMNO') urlPush = '/alumno/mensajes';
                return {
                  subscription: {
                    endpoint: sub.endpoint,
                    keys: { p256dh: sub.p256dh, auth: sub.auth }
                  },
                  payload: {
                    title: 'Nuevo mensaje',
                    body: asuntoCorto,
                    icon: '/icons/icon-192x192.png',
                    badge: '/icons/icon-192x192.png',
                    vibrate: [200, 100, 200],
                    tag: `mensaje-${Date.now()}`,
                    data: { url: urlPush, tipo: 'mensaje' }
                  }
                };
              });
              enviarPushNotificacionesIndividuales(pushItemsGen).catch((err) =>
                console.error('❌ [MENSAJES] Error push:', err)
              );
            }
          }
        } catch (pushErr) {
          console.error('❌ [MENSAJES] Error push:', pushErr);
        }

        // Correo solo a apoderados y docentes (cuenta MENSAJES). No a alumnos.
        try {
          const destIds = Array.from(todosDestinatarios);
          if (destIds.length > 0) {
            const usuariosConEmail = await query(
              `SELECT u.id, u.tipo, COALESCE(ap.email, p.email) as email
               FROM usuarios u
               LEFT JOIN apoderados ap ON ap.id = u.apoderado_id
               LEFT JOIN personal p ON p.id = u.personal_id
               WHERE u.id IN (${destIds.map(() => '?').join(',')})
                 AND u.colegio_id = ?
                 AND (u.tipo = 'APODERADO' OR u.tipo = 'DOCENTE')
                 AND COALESCE(ap.email, p.email) IS NOT NULL
                 AND TRIM(COALESCE(ap.email, p.email)) != ''`,
              [...destIds, colegio_id]
            );
            const emailsUnicos = new Map();
            (usuariosConEmail || []).forEach(u => {
              const email = (u.email || '').toLowerCase().trim();
              if (email && email.includes('@') && !emailsUnicos.has(email)) emailsUnicos.set(email, u.email);
            });
            const colegioInfo = await query(`SELECT nombre FROM colegios WHERE id = ?`, [colegio_id]);
            const colegioNombre = colegioInfo.length > 0 ? colegioInfo[0].nombre : 'Vanguard Schools';
            const tituloNotif = 'Nuevo mensaje';
            const contenidoNotif = `Tiene un nuevo mensaje: "${(asunto || 'Sin asunto').substring(0, 150)}". Ingrese a Mensajes para ver el contenido.`;
            for (const email of emailsUnicos.values()) {
              enviarCorreoNotificacion(email, tituloNotif, contenidoNotif, colegioNombre, 'MENSAJES')
                .catch(err => console.warn(`❌ [MENSAJES] Error correo a ${email}:`, err.message));
            }
            if (emailsUnicos.size > 0) {
              console.log(`📧 [MENSAJES] Apoderado envió: correos a ${emailsUnicos.size} apoderado(s)/docente(s) (cuenta MENSAJES)`);
            }
          }
        } catch (emailErr) {
          console.warn('❌ [MENSAJES] Error enviando correos:', emailErr.message);
        }

        console.log('✅ Mensaje enviado exitosamente');
      } catch (bgError) {
        console.error('Error en procesamiento en segundo plano:', bgError);
      }
    });
  } catch (error) {
    console.error('Error enviando mensaje:', error);
    res.status(500).json({ error: 'Error al enviar mensaje' });
  }
});

/**
 * PUT /api/apoderado/mensajes/:mensajeId/marcar-leido
 * Marcar un mensaje como leído
 */
router.put('/mensajes/:mensajeId/marcar-leido', async (req, res) => {
  try {
    const { mensajeId } = req.params;
    const { usuario_id } = req.user;

    const mensaje = await query(
      `SELECT id, estado FROM mensajes 
       WHERE id = ? AND destinatario_id = ? AND tipo = 'RECIBIDO' AND borrado = 'NO'`,
      [mensajeId, usuario_id]
    );

    if (mensaje.length === 0) {
      return res.status(404).json({ error: 'Mensaje no encontrado' });
    }

    if (mensaje[0].estado === 'LEIDO') {
      return res.json({ success: true, message: 'Mensaje ya estaba marcado como leído' });
    }

    await execute(
      `UPDATE mensajes SET estado = 'LEIDO' WHERE id = ?`,
      [mensajeId]
    );

    res.json({ success: true, message: 'Mensaje marcado como leído' });
  } catch (error) {
    console.error('Error marcando mensaje como leído:', error);
    res.status(500).json({ error: 'Error al marcar mensaje como leído' });
  }
});

/**
 * GET /api/apoderado/mensajes/anios-disponibles
 * Obtener lista de años disponibles en mensajes
 */
router.get('/mensajes/anios-disponibles', async (req, res) => {
  try {
    console.log('📥 [APODERADO MENSAJES] GET /mensajes/anios-disponibles - Iniciando');
    const { usuario_id } = req.user;

    const aniosRecibidos = await query(
      `SELECT DISTINCT YEAR(fecha_hora) as anio
       FROM mensajes
       WHERE destinatario_id = ? 
         AND tipo = 'RECIBIDO'
         AND borrado = 'NO'
       ORDER BY anio DESC`,
      [usuario_id]
    );

    const aniosEnviados = await query(
      `SELECT DISTINCT YEAR(fecha_hora) as anio
       FROM mensajes
       WHERE remitente_id = ? 
         AND tipo = 'ENVIADO'
         AND borrado = 'NO'
       ORDER BY anio DESC`,
      [usuario_id]
    );

    const todosAnios = new Set();
    aniosRecibidos.forEach(r => todosAnios.add(r.anio));
    aniosEnviados.forEach(r => todosAnios.add(r.anio));

    const aniosArray = Array.from(todosAnios).sort((a, b) => b - a);

    res.json({ anios: aniosArray });
  } catch (error) {
    console.error('Error obteniendo años disponibles:', error);
    res.status(500).json({ error: 'Error al obtener años disponibles' });
  }
});

/**
 * DELETE /api/apoderado/mensajes
 * Eliminar múltiples mensajes
 */
router.delete('/mensajes', async (req, res) => {
  try {
    const { usuario_id } = req.user;
    const { mensajesIds } = req.body;

    if (!mensajesIds || !Array.isArray(mensajesIds) || mensajesIds.length === 0) {
      return res.status(400).json({ error: 'Debe proporcionar al menos un ID de mensaje' });
    }

    const placeholders = mensajesIds.map(() => '?').join(',');
    const mensajes = await query(
      `SELECT id, remitente_id, destinatario_id, tipo 
       FROM mensajes 
       WHERE id IN (${placeholders}) AND borrado = 'NO'`,
      mensajesIds
    );

    if (mensajes.length === 0) {
      return res.status(404).json({ error: 'No se encontraron mensajes válidos' });
    }

    const mensajesAEliminar = mensajes.filter(m => 
      (m.tipo === 'ENVIADO' && m.remitente_id === usuario_id) ||
      (m.tipo === 'RECIBIDO' && m.destinatario_id === usuario_id)
    );

    if (mensajesAEliminar.length === 0) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar estos mensajes' });
    }

    const idsAEliminar = mensajesAEliminar.map(m => m.id);
    const placeholdersEliminar = idsAEliminar.map(() => '?').join(',');

    await execute(
      `UPDATE mensajes SET borrado = 'SI' WHERE id IN (${placeholdersEliminar})`,
      idsAEliminar
    );

    res.json({ 
      success: true, 
      message: `${idsAEliminar.length} mensaje(s) eliminado(s) correctamente`,
      eliminados: idsAEliminar.length
    });
  } catch (error) {
    console.error('Error eliminando mensajes:', error);
    res.status(500).json({ error: 'Error al eliminar mensajes' });
  }
});

/**
 * GET /api/apoderado/hijos/:hijoId/datos
 * Obtener datos completos de un hijo para editar
 */
router.get('/hijos/:hijoId/datos', async (req, res) => {
  try {
    const { hijoId } = req.params;
    const { colegio_id, apoderado_id } = req.user;

    if (!hijoId || isNaN(parseInt(hijoId))) {
      return res.status(400).json({ error: 'ID de alumno inválido' });
    }

    const hijoIdNum = parseInt(hijoId);

    if (!apoderado_id) {
      return res.status(400).json({ error: 'Información de usuario incompleta. No se encontró apoderado_id.' });
    }

    // Verificar que el alumno es hijo del apoderado
    const esHijo = await query(
      `SELECT COUNT(*) as count
       FROM familias f
       INNER JOIN alumnos a ON a.id = f.alumno_id
       WHERE f.apoderado_id = ?
         AND a.id = ?
         AND a.colegio_id = ?`,
      [apoderado_id, hijoIdNum, colegio_id]
    );

    if (!esHijo || esHijo.length === 0 || esHijo[0].count === 0) {
      return res.status(403).json({ error: 'No tienes permisos para ver estos datos. El alumno no está registrado como tu hijo.' });
    }

    // Obtener datos del alumno
    const alumno = await query(
      `SELECT a.*, u.usuario as nro_documento
       FROM alumnos a
       LEFT JOIN usuarios u ON u.alumno_id = a.id AND u.colegio_id = a.colegio_id
       WHERE a.id = ? AND a.colegio_id = ?`,
      [hijoIdNum, colegio_id]
    );

    if (!alumno || alumno.length === 0) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }

    const alumnoData = alumno[0];
    res.json({
      id: alumnoData.id,
      nombres: alumnoData.nombres,
      apellido_paterno: alumnoData.apellido_paterno,
      apellido_materno: alumnoData.apellido_materno,
      email: alumnoData.email,
      sexo: alumnoData.sexo,
      fecha_nacimiento: alumnoData.fecha_nacimiento,
      foto: alumnoData.foto,
      nro_documento: alumnoData.nro_documento
    });
  } catch (error) {
    console.error('Error obteniendo datos del hijo:', error);
    res.status(500).json({ error: 'Error al obtener datos del alumno', details: error.message });
  }
});

/**
 * PUT /api/apoderado/hijos/:hijoId/datos
 * Actualizar datos de un hijo
 */
router.put('/hijos/:hijoId/datos', uploadAlumnoHijo.single('foto'), async (req, res) => {
  try {
    const { hijoId } = req.params;
    const { colegio_id, apoderado_id } = req.user;
    const { nombres, apellido_paterno, apellido_materno, email, sexo, fecha_nacimiento } = req.body;

    if (!hijoId || isNaN(parseInt(hijoId))) {
      return res.status(400).json({ error: 'ID de alumno inválido' });
    }

    const hijoIdNum = parseInt(hijoId);

    if (!apoderado_id) {
      return res.status(400).json({ error: 'Información de usuario incompleta. No se encontró apoderado_id.' });
    }

    // Verificar que el alumno es hijo del apoderado
    const esHijo = await query(
      `SELECT COUNT(*) as count
       FROM familias f
       INNER JOIN alumnos a ON a.id = f.alumno_id
       WHERE f.apoderado_id = ?
         AND a.id = ?
         AND a.colegio_id = ?`,
      [apoderado_id, hijoIdNum, colegio_id]
    );

    if (!esHijo || esHijo.length === 0 || esHijo[0].count === 0) {
      return res.status(403).json({ error: 'No tienes permisos para editar estos datos. El alumno no está registrado como tu hijo.' });
    }

    // Obtener datos actuales del alumno
    const alumno = await query(
      `SELECT id, nombres, apellido_paterno, apellido_materno, email, sexo, foto, fecha_nacimiento
       FROM alumnos
       WHERE id = ? AND colegio_id = ?`,
      [hijoIdNum, colegio_id]
    );

    if (!alumno || alumno.length === 0) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }

    const alumnoData = alumno[0];
    let fotoPath = alumnoData.foto;

    // Si se subió una nueva foto
    if (req.file) {
      if (alumnoData.foto && alumnoData.foto !== '') {
        const oldFotoPath = `/home/vanguard/nuevo.vanguardschools.edu.pe/Static/Image/Fotos/${path.basename(alumnoData.foto)}`;
        if (fs.existsSync(oldFotoPath)) {
          fs.unlinkSync(oldFotoPath);
        }
      }
      fotoPath = req.file.filename;
    }

    let emailFinal = null;
    if (email !== undefined && email !== null && email.trim() !== '') {
      emailFinal = email.trim();
    } else if (alumnoData.email) {
      emailFinal = alumnoData.email;
    }

    let fechaFinal = null;
    if (fecha_nacimiento && fecha_nacimiento.trim() !== '') {
      fechaFinal = fecha_nacimiento.trim();
    } else if (alumnoData.fecha_nacimiento) {
      fechaFinal = alumnoData.fecha_nacimiento;
    }

    await execute(
      `UPDATE alumnos SET
        nombres = ?,
        apellido_paterno = ?,
        apellido_materno = ?,
        email = ?,
        sexo = ?,
        foto = ?,
        fecha_nacimiento = ?
      WHERE id = ? AND colegio_id = ?`,
      [
        nombres || alumnoData.nombres,
        apellido_paterno || alumnoData.apellido_paterno,
        apellido_materno || alumnoData.apellido_materno,
        emailFinal,
        sexo !== undefined ? sexo : (alumnoData.sexo !== undefined ? alumnoData.sexo : null),
        fotoPath,
        fechaFinal,
        hijoIdNum,
        colegio_id
      ]
    );

    const alumnoActualizado = await query(
      `SELECT a.*, u.usuario as nro_documento
       FROM alumnos a
       LEFT JOIN usuarios u ON u.alumno_id = a.id AND u.colegio_id = a.colegio_id
       WHERE a.id = ? AND a.colegio_id = ?`,
      [hijoIdNum, colegio_id]
    );

    res.json({
      message: 'Datos actualizados correctamente',
      alumno: alumnoActualizado[0]
    });
  } catch (error) {
    console.error('Error actualizando datos del hijo:', error);
    res.status(500).json({ error: 'Error al actualizar datos del alumno', details: error.message });
  }
});

/**
 * POST /api/apoderado/hijos/:hijoId/reiniciar-contrasena
 * Reiniciar contraseña de un hijo
 * Establece la contraseña del alumno a su DNI
 */
router.post('/hijos/:hijoId/reiniciar-contrasena', async (req, res) => {
  try {
    const { hijoId } = req.params;
    const { colegio_id, usuario_id, apoderado_id } = req.user;

    console.log(`\n🔵 ========== [APODERADO-REINICIAR-PASSWORD] NUEVA PETICIÓN ==========`);
    console.log(`📋 [APODERADO-REINICIAR-PASSWORD] hijoId recibido: ${hijoId}`);
    console.log(`📋 [APODERADO-REINICIAR-PASSWORD] Usuario: usuario_id=${usuario_id}, apoderado_id=${apoderado_id}, colegio_id=${colegio_id}`);

    // Validar que hijoId sea un número válido
    if (!hijoId || isNaN(parseInt(hijoId))) {
      console.error(`❌ [APODERADO-REINICIAR-PASSWORD] Error: hijoId inválido: ${hijoId}`);
      return res.status(400).json({ error: 'ID de alumno inválido' });
    }

    const hijoIdNum = parseInt(hijoId);

    if (!apoderado_id) {
      console.error('❌ [APODERADO-REINICIAR-PASSWORD] Error: apoderado_id no encontrado en req.user');
      return res.status(400).json({ error: 'Información de usuario incompleta. No se encontró apoderado_id.' });
    }

    // Verificar que el alumno es hijo del apoderado
    const esHijo = await query(
      `SELECT COUNT(*) as count
       FROM familias f
       INNER JOIN alumnos a ON a.id = f.alumno_id
       WHERE f.apoderado_id = ?
         AND a.id = ?
         AND a.colegio_id = ?`,
      [apoderado_id, hijoIdNum, colegio_id]
    );

    if (!esHijo || esHijo.length === 0 || esHijo[0].count === 0) {
      console.error(`❌ [APODERADO-REINICIAR-PASSWORD] Error: El alumno ${hijoIdNum} no es hijo del apoderado`);
      return res.status(403).json({ error: 'No tienes permisos para realizar esta acción. El alumno no está registrado como tu hijo.' });
    }

    // Obtener el DNI del alumno (usuario.usuario es el DNI)
    const usuarioAlumno = await query(
      `SELECT u.id as usuario_id, u.usuario as dni
       FROM usuarios u
       WHERE u.alumno_id = ? AND u.colegio_id = ? AND u.estado = 'ACTIVO'
       LIMIT 1`,
      [hijoIdNum, colegio_id]
    );

    if (!usuarioAlumno || usuarioAlumno.length === 0) {
      console.error(`❌ [APODERADO-REINICIAR-PASSWORD] Error: No se encontró usuario del alumno`);
      return res.status(404).json({ error: 'No se encontró el usuario del alumno' });
    }

    const dniAlumno = usuarioAlumno[0].dni;
    const usuarioIdAlumno = usuarioAlumno[0].usuario_id;

    if (!dniAlumno) {
      console.error(`❌ [APODERADO-REINICIAR-PASSWORD] Error: El alumno no tiene DNI registrado`);
      return res.status(400).json({ error: 'El alumno no tiene DNI registrado' });
    }

    // Generar hash SHA1 del DNI (igual que el sistema usa)
    const crypto = require('crypto');
    const passwordHash = crypto.createHash('sha1').update(String(dniAlumno)).digest('hex');

    // Actualizar contraseña del alumno
    await execute(
      `UPDATE usuarios SET password = ? WHERE id = ? AND alumno_id = ? AND colegio_id = ?`,
      [passwordHash, usuarioIdAlumno, hijoIdNum, colegio_id]
    );

    console.log(`✅ [APODERADO-REINICIAR-PASSWORD] Contraseña reiniciada exitosamente para hijoId: ${hijoIdNum}, DNI: ${dniAlumno}`);
    console.log(`🔵 ========== [APODERADO-REINICIAR-PASSWORD] FIN DE PETICIÓN ==========\n`);

    res.json({
      success: true,
      message: 'Se volvió a poner el DNI del estudiante como contraseña'
    });
  } catch (error) {
    console.error('❌ [APODERADO-REINICIAR-PASSWORD] Error reiniciando contraseña:', error);
    console.error('❌ [APODERADO-REINICIAR-PASSWORD] Stack trace:', error.stack);
    console.error(`🔵 ========== [APODERADO-REINICIAR-PASSWORD] FIN DE PETICIÓN (ERROR) ==========\n`);
    res.status(500).json({ error: 'Error al reiniciar la contraseña', details: error.message });
  }
});

// Exportar router
module.exports = router;

