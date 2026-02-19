const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query, execute, getAnioActivo } = require('../utils/mysql');
const { authenticateToken, requireUserType } = require('../middleware/auth');
const { enviarPushNotificationMultiple } = require('../services/pushNotificationService');
const phpSerialize = require('php-serialize');

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

    // Contar total de matrículas de todos los hijos
    const totalMatriculas = await query(
      `SELECT COUNT(DISTINCT g.anio) as total
       FROM apoderados ap
       INNER JOIN familias f ON f.apoderado_id = ap.id
       INNER JOIN alumnos al ON al.id = f.alumno_id
       INNER JOIN matriculas m ON m.alumno_id = al.id
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE ap.id = ? 
         AND ap.colegio_id = ?
         AND m.colegio_id = ?`,
      [apoderadoData.id, colegio_id, colegio_id]
    );

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
      `SELECT ap.*, u.usuario as dni
       FROM apoderados ap
       INNER JOIN usuarios u ON u.apoderado_id = ap.id
       WHERE u.id = ? AND u.colegio_id = ? AND u.estado = 'ACTIVO'`,
      [usuario_id, colegio_id]
    );

    if (apoderado.length === 0) {
      return res.status(404).json({ error: 'Apoderado no encontrado' });
    }

    const apoderadoData = apoderado[0];

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

    res.json({
      ...apoderadoData,
      foto: fotoUrl
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
router.put('/perfil', uploadPersonal.single('foto'), async (req, res) => {
  try {
    const { usuario_id, colegio_id } = req.user;
    const { email, sexo, fecha_nacimiento } = req.body;

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

    if (email !== undefined) {
      updateFields.push('email = ?');
      updateValues.push(email);
    }

    if (sexo !== undefined && sexo !== '') {
      updateFields.push('sexo = ?');
      updateValues.push(sexo);
    }

    if (fecha_nacimiento !== undefined && fecha_nacimiento !== '') {
      updateFields.push('fecha_nacimiento = ?');
      updateValues.push(fecha_nacimiento);
    }

    // Si hay foto nueva, actualizarla
    if (req.file) {
      const nombreArchivo = req.file.filename;
      updateFields.push('foto = ?');
      updateValues.push(nombreArchivo);
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
      `SELECT ap.*, u.usuario as dni
       FROM apoderados ap
       INNER JOIN usuarios u ON u.apoderado_id = ap.id
       WHERE ap.id = ? AND ap.colegio_id = ?`,
      [apoderadoId, colegio_id]
    );

    // Construir URL de foto
    let fotoUrl = null;
    if (apoderadoActualizado[0].foto && apoderadoActualizado[0].foto !== '') {
      const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://nuevo.vanguardschools.edu.pe';
      const isProduction = process.env.NODE_ENV === 'production';
      if (isProduction) {
        fotoUrl = `${phpSystemUrl}/Static/Image/Fotos/${apoderadoActualizado[0].foto}`;
      } else {
        fotoUrl = `http://localhost:5000/Static/Image/Fotos/${apoderadoActualizado[0].foto}`;
      }
    }

    res.json({
      ...apoderadoActualizado[0],
      foto: fotoUrl
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
       WHERE c.colegio_id = ? AND YEAR(c.fecha_hora) = ?
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

    // Obtener datos del alumno
    const alumno = await query(
      `SELECT a.id, a.nombres, a.apellido_paterno, a.apellido_materno, u.usuario as nro_documento
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

    // Construir texto del grupo
    let grupoTexto = '';
    if (matriculaData) {
      const gradoTexto = matriculaData.grado ? `${matriculaData.grado}°` : '';
      grupoTexto = `${matriculaData.nivel_nombre || ''} ${gradoTexto} ${matriculaData.seccion || ''}`.trim();
    }

    // Generar código QR
    const qrData = alumnoData.nro_documento || `ALUMNO-${alumnoData.id}`;

    res.json({
      nombres: alumnoData.nombres || '',
      apellido_paterno: alumnoData.apellido_paterno || '',
      apellido_materno: alumnoData.apellido_materno || '',
      nombre_completo: `${alumnoData.nombres || ''} ${alumnoData.apellido_paterno || ''} ${alumnoData.apellido_materno || ''}`.trim(),
      grupo: grupoTexto,
      colegio_nombre: colegioNombre,
      anio: anio_activo,
      qr_data: qrData,
      nro_documento: alumnoData.nro_documento || ''
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

    // Obtener datos del colegio para facturación
    const colegio = await query(
      `SELECT razon_social, ruc, logo FROM colegios WHERE id = ? LIMIT 1`,
      [colegio_id]
    );

    const colegioData = colegio.length > 0 ? colegio[0] : null;

    // Construir URL del logo
    let logoUrl = null;
    if (colegioData && colegioData.logo) {
      const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://nuevo.vanguardschools.edu.pe';
      const isProduction = process.env.NODE_ENV === 'production';
      if (isProduction) {
        logoUrl = `${phpSystemUrl}/Static/Image/Logos/${colegioData.logo}`;
      } else {
        logoUrl = `http://localhost:5000/Static/Image/Logos/${colegioData.logo}`;
      }
    }

    res.json({
      pago: {
        id: pago.id,
        monto: pago.monto,
        mora: pago.mora || 0,
        fecha_hora: pago.fecha_hora,
        fecha_cancelado: pago.fecha_cancelado,
        estado_pago: pago.estado_pago,
        tipo: pago.tipo,
        nro_pago: pago.nro_pago
      },
      alumno: {
        nombres: alumno[0].nombres,
        apellido_paterno: alumno[0].apellido_paterno,
        apellido_materno: alumno[0].apellido_materno,
        dni: alumno[0].dni
      },
      boleta: impresion && impresion.length > 0 ? {
        numero: impresion[0].numero,
        serie: impresion[0].serie,
        serie_numero: `${String(impresion[0].serie).padStart(3, '0')}-${String(impresion[0].numero).padStart(7, '0')}`
      } : null,
      colegio: {
        razon_social: colegioData?.razon_social || 'Vanguard Schools',
        ruc: colegioData?.ruc || '',
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

    // Para cada asignatura, obtener las notas detalladas
    const asignaturasConNotas = await Promise.all(
      asignaturas.map(async (asignatura) => {
        // Obtener promedios por ciclo
        const promedios = await query(
          `SELECT ciclo, promedio
           FROM promedios
           WHERE matricula_id = ? AND asignatura_id = ? AND ciclo IN (1, 2, 3, 4)
           ORDER BY ciclo ASC`,
          [matriculaId, asignatura.asignatura_id]
        );

        // Obtener notas detalladas por criterio y ciclo
        const notasDetalladas = await query(
          `SELECT nc.ciclo, nc.criterio, nc.nota
           FROM notas_criterios nc
           WHERE nc.matricula_id = ? AND nc.asignatura_id = ?
           ORDER BY nc.ciclo ASC, nc.criterio ASC`,
          [matriculaId, asignatura.asignatura_id]
        );

        // Organizar notas por ciclo
        const notasPorCiclo = {};
        notasDetalladas.forEach(nota => {
          if (!notasPorCiclo[nota.ciclo]) {
            notasPorCiclo[nota.ciclo] = {};
          }
          notasPorCiclo[nota.ciclo][nota.criterio] = nota.nota;
        });

        // Organizar promedios por ciclo
        const promediosPorCiclo = {};
        promedios.forEach(p => {
          promediosPorCiclo[p.ciclo] = p.promedio;
        });

        return {
          asignatura_id: asignatura.asignatura_id,
          curso_id: asignatura.curso_id,
          curso_nombre: asignatura.curso_nombre,
          notas: notasPorCiclo,
          promedios: promediosPorCiclo,
          promedio_final: promediosPorCiclo[4] || null
        };
      })
    );

    res.json({ asignaturas: asignaturasConNotas });
  } catch (error) {
    console.error('Error obteniendo notas detalladas:', error);
    res.status(500).json({ error: 'Error al obtener notas detalladas', details: error.message });
  }
});

/**
 * GET /api/apoderado/hijos/:hijoId/libreta
 * Obtener libreta de notas del hijo
 */
router.get('/hijos/:hijoId/libreta', async (req, res) => {
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
      return res.status(403).json({ error: 'No tienes permisos para ver esta libreta.' });
    }

    // Obtener matrícula actual del alumno
    const matricula = await query(
      `SELECT m.id as matricula_id, m.grupo_id, m.alumno_id
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0 OR m.estado = 4)
       LIMIT 1`,
      [hijoIdNum, colegio_id, anio_activo]
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

    // Obtener información del alumno y grupo
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

    // Obtener título de la intranet
    const colegioInfo = await query(
      `SELECT titulo_intranet FROM colegios WHERE id = ? LIMIT 1`,
      [colegio_id]
    );
    const tituloIntranet = (colegioInfo && colegioInfo.length > 0 && colegioInfo[0].titulo_intranet) 
      ? colegioInfo[0].titulo_intranet 
      : 'INTRANET VANGUARD SCHOOLS';

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

    // Organizar promedios por asignatura
    const promediosPorAsignatura = {};
    todosPromedios.forEach(p => {
      if (!promediosPorAsignatura[p.asignatura_id]) {
        promediosPorAsignatura[p.asignatura_id] = {};
      }
      promediosPorAsignatura[p.asignatura_id][p.ciclo] = p.promedio;
    });

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

        areasConAsignaturas.push({
          area_id: area.area_id,
          area_nombre: area.area_nombre,
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

    // Calcular resumen general
    const todasAsignaturas = [...areasConAsignaturas.flatMap(a => a.asignaturas), ...asignaturasSinArea];
    const promediosFinales = todasAsignaturas
      .map(a => a.promedio_final)
      .filter(p => p !== null && p !== '' && p !== '-');
    
    let promedioGeneral = null;
    if (promediosFinales.length > 0) {
      const suma = promediosFinales.reduce((sum, p) => sum + parseFloat(p), 0);
      promedioGeneral = Math.round(suma / promediosFinales.length);
    }

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
      areas: areasConAsignaturas,
      asignaturas_sin_area: asignaturasSinArea,
      resumen: {
        promedio_general: promedioGeneral,
        total_asignaturas: todasAsignaturas.length
      }
    });
  } catch (error) {
    console.error('Error obteniendo libreta:', error);
    res.status(500).json({ error: 'Error al obtener libreta', details: error.message });
  }
});

/**
 * POST /api/apoderado/hijos/:hijoId/mensajes/enviar
 * Enviar mensaje en nombre del hijo
 */
router.post('/hijos/:hijoId/mensajes/enviar', uploadMensajes.array('archivos', 10), async (req, res) => {
  try {
    const { hijoId } = req.params;
    const { destinatarios, asunto, mensaje } = req.body;

    // Verificar permisos y obtener usuario_id del hijo
    const { usuarioIdHijo } = await verificarHijoYUsuarioApoderado(req, hijoId);

    const destinatariosArray = typeof destinatarios === 'string' ? JSON.parse(destinatarios) : destinatarios;

    if (!destinatariosArray || destinatariosArray.length === 0) {
      return res.status(400).json({ error: 'Debe seleccionar al menos un destinatario' });
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
        const fechaHora = new Date().toISOString().slice(0, 19).replace('T', ' ');
        let mensajesInsertados = 0;
        const mensajesIds = [];

        for (const destinatarioId of destinatariosArray) {
          try {
            // Mensaje para el remitente (tipo ENVIADO)
            const resultEnviado = await execute(
              `INSERT INTO mensajes (remitente_id, destinatario_id, asunto, mensaje, fecha_hora, estado, tipo, borrado, favorito)
               VALUES (?, ?, ?, ?, ?, 'NO_LEIDO', 'ENVIADO', 'NO', 'NO')`,
              [usuarioIdHijo, destinatarioId, asunto, mensaje, fechaHora]
            );

            // Mensaje para el destinatario (tipo RECIBIDO)
            const resultRecibido = await execute(
              `INSERT INTO mensajes (remitente_id, destinatario_id, asunto, mensaje, fecha_hora, estado, tipo, borrado, favorito)
               VALUES (?, ?, ?, ?, ?, 'NO_LEIDO', 'RECIBIDO', 'NO', 'NO')`,
              [usuarioIdHijo, destinatarioId, asunto, mensaje, fechaHora]
            );

            mensajesIds.push(resultEnviado.insertId, resultRecibido.insertId);
            mensajesInsertados += 2;
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

        console.log('✅ Mensaje enviado exitosamente en nombre del hijo');
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

    // Obtener tareas
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

    // Obtener exámenes
    const examenes = await query(
      `SELECT ae.*,
              (SELECT COUNT(*) FROM asignaturas_examenes_preguntas WHERE examen_id = ae.id) as total_preguntas
       FROM asignaturas_examenes ae
       WHERE ae.asignatura_id = ?
       ORDER BY ae.fecha_desde ASC`,
      [asignatura_id]
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

    // Obtener archivos
    const archivos = await query(
      `SELECT aa.*, 
              CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre
       FROM asignaturas_archivos aa
       LEFT JOIN personal p ON p.id = aa.trabajador_id
       WHERE aa.asignatura_id = ?
       ORDER BY aa.id DESC`,
      [asignatura_id]
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

    // Obtener videos
    const videos = await query(
      `SELECT av.*, 
              CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre
       FROM asignaturas_videos av
       LEFT JOIN personal p ON p.id = av.trabajador_id
       WHERE av.asignatura_id = ?
       ORDER BY av.id DESC`,
      [asignatura_id]
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
          `(p.privacidad LIKE ? OR p.privacidad LIKE ? OR p.privacidad = ?)`
        ).join(' OR ');
        
        const params = [colegio_id];
        gruposIds.forEach(grupoId => {
          params.push(`%,${grupoId},%`, `${grupoId},%`, String(grupoId));
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

// Reutilizar endpoints de mensajes de alumno (misma lógica)
// Los mensajes funcionan igual para apoderados
const alumnoMensajesRoutes = require('./alumno.routes');

// Exportar router
module.exports = router;

