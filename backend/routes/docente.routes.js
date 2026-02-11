const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query, execute, getAnioActivo } = require('../utils/mysql');
const PDFDocument = require('pdfkit');
const { authenticateToken, requireUserType } = require('../middleware/auth');
const { registrarAccion } = require('../utils/auditoria');
const { uploadToPHPServer } = require('../utils/ftpUpload');
const { enviarPushNotificationMultiple } = require('../services/pushNotificationService');

/**
 * Función auxiliar para crear notificaciones de Aula Virtual
 * @param {Object} params - Parámetros de la notificación
 * @param {number} params.asignatura_id - ID de la asignatura
 * @param {string} params.tipo - Tipo de contenido: 'tema', 'tarea', 'examen', 'video', 'enlace'
 * @param {string} params.nombre - Nombre/título del contenido
 * @param {number} params.usuario_id - ID del usuario que crea (docente)
 * @param {number} params.colegio_id - ID del colegio
 * @param {number} params.anio_activo - Año activo
 * @param {string} params.docente_nombre - Nombre del docente (opcional, se obtiene si no se proporciona)
 * @param {string} params.fecha_entrega - Fecha de entrega (solo para tareas)
 * @param {number} params.entidad_id - ID de la entidad creada (tema/tarea/examen/video/enlace)
 */
async function crearNotificacionesAulaVirtual(params) {
  const { asignatura_id, tipo, nombre, usuario_id, colegio_id, anio_activo, docente_nombre, fecha_entrega, entidad_id } = params;
  
  try {
    console.log(`📚 [AULA VIRTUAL] Iniciando notificaciones para ${tipo}: "${nombre}"`);
    
    // Obtener información de la asignatura (grupo y curso)
    const asignaturaInfo = await query(
      `SELECT a.grupo_id, a.curso_id, c.nombre as curso_nombre,
              CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre_completo
       FROM asignaturas a
       INNER JOIN cursos c ON c.id = a.curso_id
       INNER JOIN personal p ON p.id = a.personal_id
       WHERE a.id = ? AND a.colegio_id = ?`,
      [asignatura_id, colegio_id]
    );
    
    if (asignaturaInfo.length === 0) {
      console.error(`❌ [AULA VIRTUAL] Asignatura ${asignatura_id} no encontrada`);
      return;
    }
    
    const { grupo_id, curso_nombre, docente_nombre_completo } = asignaturaInfo[0];
    const nombreDocente = docente_nombre || docente_nombre_completo || 'Un docente';
    
    // Preparar título y mensaje según el tipo
    let tituloNotificacion = '';
    let mensajeNotificacion = '';
    
    switch (tipo) {
      case 'tema':
        tituloNotificacion = 'Nuevo Tema';
        mensajeNotificacion = `Curso: ${curso_nombre} - Tema: ${nombre} - Docente: ${nombreDocente}`;
        break;
      case 'tarea':
        tituloNotificacion = 'Nueva Tarea';
        const fechaEntregaTexto = fecha_entrega ? ` - Fecha de entrega: ${fecha_entrega}` : '';
        mensajeNotificacion = `Curso: ${curso_nombre} - Docente: ${nombreDocente}${fechaEntregaTexto}`;
        break;
      case 'examen':
        tituloNotificacion = 'Nuevo Examen';
        mensajeNotificacion = `Curso: ${curso_nombre} - Docente: ${nombreDocente}`;
        break;
      case 'video':
        tituloNotificacion = 'Nuevo Video';
        mensajeNotificacion = `Curso: ${curso_nombre} - Docente: ${nombreDocente}`;
        break;
      case 'enlace':
        tituloNotificacion = 'Nuevo Enlace de Ayuda';
        mensajeNotificacion = `Curso: ${curso_nombre} - Docente: ${nombreDocente}`;
        break;
      default:
        tituloNotificacion = 'Nueva Actividad';
        mensajeNotificacion = `Curso: ${curso_nombre} - Docente: ${nombreDocente}`;
    }
    
    // Obtener alumnos del grupo
    const alumnos = await query(
      `SELECT DISTINCT a.id as alumno_id, u.id as usuario_id
       FROM alumnos a
       INNER JOIN matriculas m ON m.alumno_id = a.id
       INNER JOIN usuarios u ON u.alumno_id = a.id
       WHERE m.grupo_id = ? 
         AND m.colegio_id = ?
         AND (m.estado = 0 OR m.estado = 4)
         AND u.colegio_id = ?
         AND u.estado = 'ACTIVO'`,
      [grupo_id, colegio_id, colegio_id]
    );
    
    const alumnoIds = alumnos.map(a => a.alumno_id);
    const alumnoUsuarioIds = alumnos.map(a => a.usuario_id);
    
    // Obtener apoderados de esos alumnos
    let apoderadoUsuarioIds = [];
    if (alumnoIds.length > 0) {
      const apoderados = await query(
        `SELECT DISTINCT u.id as usuario_id, ap.nro_documento
         FROM apoderados ap
         INNER JOIN familias f ON f.apoderado_id = ap.id
         INNER JOIN usuarios u ON u.apoderado_id = ap.id
         WHERE f.alumno_id IN (${alumnoIds.map(() => '?').join(',')})
           AND ap.colegio_id = ?
           AND u.colegio_id = ?
           AND u.estado = 'ACTIVO'`,
        [...alumnoIds, colegio_id, colegio_id]
      );
      apoderadoUsuarioIds = apoderados.map(a => a.usuario_id);
      
      // Obtener DNI de apoderados para buscar docentes-apoderados
      const apoderadoDnis = apoderados.map(a => a.nro_documento).filter(dni => dni);
      
      if (apoderadoDnis.length > 0) {
        // Obtener usuarios DOCENTE que también son apoderados (mismo nro_documento)
        const docentesApoderados = await query(
          `SELECT DISTINCT u.id 
           FROM usuarios u
           INNER JOIN personal p ON p.id = u.personal_id
           WHERE u.colegio_id = ? 
             AND u.estado = 'ACTIVO'
             AND u.tipo = 'DOCENTE'
             AND (p.nro_documento IN (${apoderadoDnis.map(() => '?').join(',')}) 
                  OR u.usuario IN (${apoderadoDnis.map(() => '?').join(',')}))
             AND u.id NOT IN (${[...alumnoUsuarioIds, ...apoderadoUsuarioIds].map(() => '?').join(',')})`, // Evitar duplicados
          [colegio_id, ...apoderadoDnis, ...apoderadoDnis, ...alumnoUsuarioIds, ...apoderadoUsuarioIds]
        );
        
        const docentesApoderadosIds = docentesApoderados.map(u => u.id);
        apoderadoUsuarioIds = [...apoderadoUsuarioIds, ...docentesApoderadosIds];
        
        if (docentesApoderadosIds.length > 0) {
          console.log(`📚 [AULA VIRTUAL] Encontrados ${docentesApoderadosIds.length} docentes que también son apoderados`);
        }
      }
    }
    
    // Combinar todos los destinatarios (alumnos + apoderados + docentes-apoderados)
    const todosDestinatarios = [...new Set([...alumnoUsuarioIds, ...apoderadoUsuarioIds])];
    
    console.log(`📚 [AULA VIRTUAL] Encontrados ${todosDestinatarios.length} destinatarios (${alumnoUsuarioIds.length} alumnos, ${apoderadoUsuarioIds.length} apoderados incluyendo docentes)`);
    
    // Crear notificaciones en la BD
    if (todosDestinatarios.length > 0) {
      for (const destinatarioId of todosDestinatarios) {
        try {
          await execute(
            `INSERT INTO notificaciones 
             (para, usuario_id, destinatario_id, asunto, contenido, fecha_hora, estado)
             VALUES ('USUARIO', ?, ?, ?, ?, NOW(), 'NO ENVIADO')`,
            [
              usuario_id, // Usuario que crea (docente)
              destinatarioId, // Destinatario
              tituloNotificacion, // TÍTULO (asunto)
              mensajeNotificacion // MENSAJE (contenido)
            ]
          );
        } catch (error) {
          console.error(`❌ [AULA VIRTUAL] Error creando notificación para usuario ${destinatarioId}:`, error);
        }
      }
      
      console.log(`✅ [AULA VIRTUAL] ${todosDestinatarios.length} notificaciones creadas en BD`);
      
      // Enviar push notifications
      if (todosDestinatarios.length > 0) {
        const subscriptionsData = await query(
          `SELECT endpoint, p256dh, auth 
           FROM push_subscriptions 
           WHERE usuario_id IN (${todosDestinatarios.map(() => '?').join(',')}) 
             AND colegio_id = ? AND (activo = 1 OR activo IS NULL)`,
          [...todosDestinatarios, colegio_id]
        );
        
        const subscriptions = subscriptionsData.map(sub => ({
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth
          }
        }));
        
        if (subscriptions.length > 0) {
          const payloadPush = {
            title: tituloNotificacion,
            body: mensajeNotificacion,
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-192x192.png',
            vibrate: [200, 100, 200],
            tag: `aula-virtual-${tipo}-${entidad_id || Date.now()}`,
            data: {
              url: '/alumno/dashboard',
              tipo: `aula_virtual_${tipo}`,
              asignatura_id: asignatura_id,
              entidad_id: entidad_id
            }
          };
          
          console.log(`📱 [AULA VIRTUAL] Enviando ${subscriptions.length} push notifications...`);
          
          enviarPushNotificationMultiple(subscriptions, payloadPush)
            .then(resultadosPush => {
              const exitosas = resultadosPush.filter(r => r.resultado && r.resultado.success).length;
              const fallidas = resultadosPush.filter(r => !r.resultado || !r.resultado.success).length;
              console.log(`✅ [AULA VIRTUAL] Push notifications: ${exitosas} exitosas, ${fallidas} fallidas`);
            })
            .catch(err => {
              console.error(`❌ [AULA VIRTUAL] Error en envío de push notifications:`, err);
            });
        } else {
          console.log('⚠️ [AULA VIRTUAL] No hay suscripciones push activas para enviar notificaciones');
        }
      }
    } else {
      console.log('⚠️ [AULA VIRTUAL] No se encontraron destinatarios para notificar');
    }
  } catch (error) {
    console.error(`❌ [AULA VIRTUAL] Error en proceso de notificaciones:`, error);
    console.error(`❌ [AULA VIRTUAL] Stack:`, error.stack);
  }
}

// Configurar multer para subir fotos de personal
const personalStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Guardar en Static/Image/Fotos/ del sistema PHP (compartido con ambos sistemas)
    const uploadPath = '/home/vanguard/nuevo.vanguardschools.edu.pe/Static/Image/Fotos';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `personal-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

// Configurar multer para subir imágenes de publicaciones
const publicacionesStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../../backend/uploads/publicaciones');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `publicacion-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

// Configurar multer para subir archivos de publicaciones
const archivosStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../../backend/uploads/archivos');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `archivo-${uniqueSuffix}${path.extname(file.originalname)}`);
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
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: fileFilter
});

const uploadPublicaciones = multer({
  storage: publicacionesStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: fileFilter
});

const fileFilterArchivos = (req, file, cb) => {
  const allowedTypes = /pdf|doc|docx|xls|xlsx|ppt|pptx|txt|zip|rar/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  
  if (extname) {
    return cb(null, true);
  } else {
    cb(new Error('Tipo de archivo no permitido. Solo se permiten: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, ZIP, RAR'));
  }
};

const uploadArchivos = multer({
  storage: archivosStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: fileFilterArchivos
});

// Configurar multer para subir archivos del aula virtual (temas, tareas, exámenes)
const aulaVirtualStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Guardar en Static/Archivos/ del sistema PHP (compartido con ambos sistemas)
    const uploadPath = '/home/vanguard/nuevo.vanguardschools.edu.pe/Static/Archivos';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `aula-virtual-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const fileFilterAulaVirtual = (req, file, cb) => {
  const allowedTypes = /pdf/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = file.mimetype === 'application/pdf';
  
  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Solo se permiten archivos PDF'));
  }
};

const uploadAulaVirtual = multer({
  storage: aulaVirtualStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: fileFilterAulaVirtual
});

// Configurar multer para subir archivos de mensajes
const mensajesStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Guardar en Static/Archivos/ del sistema PHP (compartido con ambos sistemas)
    // Si es imagen, podría ir a Static/Image/Mensajes/, pero por simplicidad usamos Archivos
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
  // Permitir cualquier tipo de archivo para mensajes
  cb(null, true);
};

const uploadMensajes = multer({
  storage: mensajesStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB por archivo
  fileFilter: fileFilterMensajes
});

// Todas las rutas requieren autenticación y ser DOCENTE o ADMINISTRADOR
router.use(authenticateToken);
// Permitir DOCENTE y ADMINISTRADOR en todas las rutas
router.use((req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Usuario no autenticado' });
  }
  if (req.user.tipo !== 'DOCENTE' && req.user.tipo !== 'ADMINISTRADOR') {
    return res.status(403).json({ 
      error: 'No tienes permisos para acceder a este recurso' 
    });
  }
  next();
});

/**
 * GET /api/docente/dashboard
 * Obtener datos del dashboard del docente
 */
router.get('/dashboard', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo } = req.user;

    // Obtener datos del personal/docente
    const personal = await query(
      `SELECT p.*, u.tipo as tipo_usuario
       FROM personal p
       INNER JOIN usuarios u ON u.personal_id = p.id
       WHERE u.id = ? AND u.colegio_id = ? AND u.estado = 'ACTIVO'`,
      [usuario_id, colegio_id]
    );

    if (personal.length === 0) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    const docente = personal[0];

    // Contar grupos asignados (grupos distintos donde el docente tiene asignaturas)
    const gruposAsignados = await query(
      `SELECT COUNT(DISTINCT g.id) as total
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [docente.id, colegio_id, anio_activo]
    );

    // Contar cursos asignados
    // asignaturas tiene grupo_id directamente, no area_curso_id. El año viene de grupos.anio
    const cursosAsignados = await query(
      `SELECT COUNT(DISTINCT a.id) as total
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [docente.id, colegio_id, anio_activo]
    );

    // Contar estudiantes totales
    const estudiantes = await query(
      `SELECT COUNT(DISTINCT m.alumno_id) as total
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN matriculas m ON m.grupo_id = g.id
       WHERE a.personal_id = ? AND a.colegio_id = ? AND g.anio = ? 
       AND m.estado = 0`,
      [docente.id, colegio_id, anio_activo]
    );

    // Próximos exámenes (todos los futuros, sin límite de días)
    // asignaturas_examenes tiene fecha_desde, fecha_hasta, hora_desde, hora_hasta (NO tiene fecha_inicio)
    // asignaturas_examenes SÍ tiene asignatura_id y titulo (NO tiene descripcion)
    // IMPORTANTE: Comparar solo fechas (sin hora) para incluir eventos de hoy
    // Usar DATE() en ambos lados para comparar solo fechas
    const proximosExamenes = await query(
      `SELECT ae.*, 
              COALESCE(ae.titulo, 'Examen') as titulo,
              c.nombre as asignatura_nombre, 
              g.grado, 
              g.seccion, 
              n.nombre as nivel_nombre,
              CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre,
              DATE(ae.fecha_desde) as fecha_evento
       FROM asignaturas_examenes ae
       INNER JOIN asignaturas a ON a.id = ae.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN cursos c ON c.id = a.curso_id
       INNER JOIN personal p ON p.id = a.personal_id
       WHERE a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?
       AND DATE(ae.fecha_desde) >= DATE(NOW())
       ORDER BY ae.fecha_desde ASC`,
      [docente.id, colegio_id, anio_activo]
    );

    // Próximas tareas (todas las futuras, sin límite de días)
    // asignaturas_tareas tiene titulo, descripcion, fecha_entrega (NO fecha_fin)
    // IMPORTANTE: Comparar solo fechas (sin hora) para incluir eventos de hoy
    // Usar DATE() en ambos lados para comparar solo fechas
    const proximasTareas = await query(
      `SELECT t.*, 
              t.titulo,
              c.nombre as asignatura_nombre, 
              g.grado, 
              g.seccion,
              n.nombre as nivel_nombre,
              CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre,
              DATE(t.fecha_entrega) as fecha_evento
       FROM asignaturas_tareas t
       INNER JOIN asignaturas a ON a.id = t.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN cursos c ON c.id = a.curso_id
       INNER JOIN personal p ON p.id = a.personal_id
       WHERE a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?
       AND DATE(t.fecha_entrega) >= DATE(NOW())
       ORDER BY t.fecha_entrega ASC`,
      [docente.id, colegio_id, anio_activo]
    );

    // Actividades próximas (solo futuras del año actual, no año activo)
    // IMPORTANTE: Filtrar por AÑO ACTUAL del sistema (no año activo) y comparar solo fechas (sin hora) para incluir eventos de hoy
    // Usar DATE() en ambos lados para comparar solo fechas
    const añoActual = new Date().getFullYear();
    const actividades = await query(
      `SELECT a.*,
              DATE(a.fecha_inicio) as fecha_evento
       FROM actividades a
       WHERE a.colegio_id = ?
       AND YEAR(a.fecha_inicio) = ?
       AND DATE(a.fecha_inicio) >= DATE(NOW())
       ORDER BY a.fecha_inicio ASC`,
      [colegio_id, añoActual]
    );

    console.log(`📅 Dashboard - Actividades del año actual ${añoActual} (futuras):`, actividades.length);
    if (actividades.length > 0) {
      console.log('📅 Dashboard - Primeras actividades:', actividades.slice(0, 3).map(a => ({
        id: a.id,
        descripcion: a.descripcion,
        fecha_inicio: a.fecha_inicio,
        fecha_evento: a.fecha_evento
      })));
    }

    // Contar mensajes no leídos del docente
    const mensajesNoLeidos = await query(
      `SELECT COUNT(*) as total
       FROM mensajes m
       WHERE m.destinatario_id = ?
         AND m.tipo = 'RECIBIDO'
         AND m.estado = 'NO_LEIDO'
         AND m.borrado = 'NO'`,
      [usuario_id]
    );

    // Obtener comunicado con show_in_home activo (más reciente)
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

    // Verificar roles adicionales (apoderado y tutor)
    // Verificar si es apoderado (tiene hijos estudiando en el colegio)
    const esApoderado = await query(
      `SELECT COUNT(DISTINCT f.alumno_id) as total_hijos
       FROM apoderados ap
       INNER JOIN familias f ON f.apoderado_id = ap.id
       INNER JOIN alumnos a ON a.id = f.alumno_id
       INNER JOIN matriculas m ON m.alumno_id = a.id
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE ap.colegio_id = ? 
         AND ap.nro_documento = (
           SELECT p.nro_documento 
           FROM personal p 
           WHERE p.id = ? AND p.colegio_id = ?
         )
         AND m.colegio_id = ?
         AND (m.estado = 0 OR m.estado = 4)
         AND g.anio = ?`,
      [colegio_id, docente.id, colegio_id, colegio_id, anio_activo]
    );

    const tieneHijos = (esApoderado[0]?.total_hijos || 0) > 0;

    // Verificar si es tutor
    const gruposTutor = await query(
      `SELECT g.*, n.nombre as nivel_nombre, t.nombre as turno_nombre
       FROM grupos g
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN turnos t ON t.id = g.turno_id
       WHERE g.tutor_id = ? AND g.colegio_id = ? AND g.anio = ?`,
      [docente.id, colegio_id, anio_activo]
    );

    const esTutor = gruposTutor.length > 0;

    // Construir nombre completo
    const nombreCompleto = `${docente.nombres || ''} ${docente.apellidos || ''}`.trim();
    
    // Construir URL de foto
    let fotoUrl = null;
    if (docente.foto && docente.foto !== '') {
      // Fotos se guardan en Static/Image/Fotos/ (compartido con sistema PHP)
      // IMPORTANTE: Usar el mismo dominio del sistema PHP para servir fotos (igual que publicaciones)
      const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://nuevo.vanguardschools.edu.pe';
      const isProduction = process.env.NODE_ENV === 'production';
      if (isProduction) {
        fotoUrl = `${phpSystemUrl}/Static/Image/Fotos/${docente.foto}`;
      } else {
        fotoUrl = `http://localhost:5000/Static/Image/Fotos/${docente.foto}`;
      }
    }

    res.json({
      docente: {
        id: docente.id,
        nombres: nombreCompleto || docente.nombres || 'Docente',
        apellidos: docente.apellidos || '',
        foto: fotoUrl,
        email: docente.email || ''
      },
      rolesAdicionales: {
        es_apoderado: tieneHijos,
        es_tutor: esTutor
      },
      estadisticas: {
        gruposAsignados: gruposAsignados[0]?.total || 0,
        cursosAsignados: cursosAsignados[0]?.total || 0,
        estudiantes: estudiantes[0]?.total || 0,
        mensajesNoLeidos: mensajesNoLeidos[0]?.total || 0,
        descuentoMesActual: 0 // Por ahora 0, se implementará después
      },
      proximosExamenes: proximosExamenes || [],
      proximasTareas: proximasTareas || [],
      actividades: actividades || [],
      comunicadoHome: comunicadoHomeData
    });
  } catch (error) {
    console.error('Error en dashboard docente:', error);
    res.status(500).json({ error: 'Error al obtener datos del dashboard' });
  }
});

/**
 * GET /api/docente/perfil
 * Obtener perfil del docente
 */
router.get('/perfil', async (req, res) => {
  try {
    const { usuario_id, colegio_id } = req.user;

    const personal = await query(
      `SELECT p.*, u.tipo as tipo_usuario, u.usuario as dni
       FROM personal p
       INNER JOIN usuarios u ON u.personal_id = p.id
       WHERE u.id = ? AND u.colegio_id = ? AND u.estado = 'ACTIVO'`,
      [usuario_id, colegio_id]
    );

    if (personal.length === 0) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    const docente = personal[0];

    // Construir URL de foto
    let fotoUrl = null;
    if (docente.foto && docente.foto !== '') {
      // Fotos se guardan en Static/Image/Fotos/ (compartido con sistema PHP)
      // IMPORTANTE: Usar el mismo dominio del sistema PHP para servir fotos (igual que publicaciones)
      const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://nuevo.vanguardschools.edu.pe';
      const isProduction = process.env.NODE_ENV === 'production';
      if (isProduction) {
        fotoUrl = `${phpSystemUrl}/Static/Image/Fotos/${docente.foto}`;
      } else {
        fotoUrl = `http://localhost:5000/Static/Image/Fotos/${docente.foto}`;
      }
    }

    res.json({
      id: docente.id,
      nombres: docente.nombres,
      apellidos: docente.apellidos,
      dni: docente.dni,
      email: docente.email,
      telefono_fijo: docente.telefono_fijo,
      telefono_celular: docente.telefono_celular,
      direccion: docente.direccion,
      foto: fotoUrl, // URL completa en lugar de solo el nombre
      cargo: docente.cargo,
      profesion: docente.profesion,
      fecha_nacimiento: docente.fecha_nacimiento,
      fecha_ingreso: docente.fecha_ingreso,
      hora_entrada: docente.hora_entrada,
      hora_salida: docente.hora_salida
    });
  } catch (error) {
    console.error('Error obteniendo perfil:', error);
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
});

/**
 * GET /api/docente/qr
 * Obtener datos del docente para generar QR (fotocheck)
 */
router.get('/qr', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo } = req.user;

    // Obtener datos del docente
    const personal = await query(
      `SELECT p.id, p.nombres, p.apellidos, p.fecha_nacimiento, u.usuario as nro_documento
       FROM personal p
       INNER JOIN usuarios u ON u.personal_id = p.id
       WHERE u.id = ? AND u.colegio_id = ? AND u.estado = 'ACTIVO'`,
      [usuario_id, colegio_id]
    );

    if (personal.length === 0) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    const docenteData = personal[0];

    // Obtener nombre del colegio
    const colegio = await query(
      `SELECT nombre FROM colegios WHERE id = ?`,
      [colegio_id]
    );

    const colegioNombre = colegio.length > 0 ? colegio[0].nombre : 'Vanguard Schools';

    // Generar código QR (puede ser el DNI o un ID único)
    const qrData = docenteData.nro_documento || `DOCENTE-${docenteData.id}`;

    // Formatear fecha de nacimiento
    let fechaNacimientoFormateada = '';
    if (docenteData.fecha_nacimiento) {
      const fecha = new Date(docenteData.fecha_nacimiento);
      if (!isNaN(fecha.getTime())) {
        fechaNacimientoFormateada = fecha.toLocaleDateString('es-PE', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      }
    }

    // Separar nombres y apellidos
    const nombres = docenteData.nombres || '';
    const apellidos = docenteData.apellidos || '';

    res.json({
      nombres: nombres,
      apellidos: apellidos,
      nombre_completo: `${nombres} ${apellidos}`.trim(),
      fecha_nacimiento: fechaNacimientoFormateada,
      colegio_nombre: colegioNombre,
      anio: anio_activo,
      qr_data: qrData,
      nro_documento: docenteData.nro_documento || ''
    });
  } catch (error) {
    console.error('Error obteniendo datos para QR:', error);
    res.status(500).json({ error: 'Error al obtener datos para QR' });
  }
});

/**
 * PUT /api/docente/perfil
 * Actualizar perfil del docente (incluyendo foto)
 */
router.put('/perfil', uploadPersonal.single('foto'), async (req, res) => {
  try {
    const { usuario_id, colegio_id } = req.user;
    const { nombres, apellidos, email, telefono_fijo, telefono_celular, direccion, fecha_nacimiento } = req.body;

    // Obtener docente actual
    const personal = await query(
      `SELECT p.* FROM personal p
       INNER JOIN usuarios u ON u.personal_id = p.id
       WHERE u.id = ? AND u.colegio_id = ?`,
      [usuario_id, colegio_id]
    );

    if (personal.length === 0) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    const docente = personal[0];
    
    // Guardar datos anteriores para auditoría
    const datosAnteriores = {
      nombres: docente.nombres,
      apellidos: docente.apellidos,
      email: docente.email,
      telefono_fijo: docente.telefono_fijo,
      telefono_celular: docente.telefono_celular,
      direccion: docente.direccion,
      fecha_nacimiento: docente.fecha_nacimiento,
      foto: docente.foto
    };
    
    let fotoPath = docente.foto;

    // Si se subió una nueva foto
    if (req.file) {
      // Eliminar foto anterior si existe
      if (docente.foto && docente.foto !== '') {
        // Eliminar foto anterior si existe (puede estar en Static/Image/Fotos/ o en uploads/personal/ por compatibilidad)
        const oldFotoPathStatic = `/home/vanguard/nuevo.vanguardschools.edu.pe/Static/Image/Fotos/${path.basename(docente.foto)}`;
        const oldFotoPath = oldFotoPathStatic;
        if (fs.existsSync(oldFotoPath)) {
          fs.unlinkSync(oldFotoPath);
        }
      }
      
      // Guardar nueva foto - solo el nombre del archivo, no la ruta completa
      fotoPath = req.file.filename;
    }

    // ACTUALIZAR DATOS EN LA BASE DE DATOS
    await execute(
      `UPDATE personal SET
        nombres = ?,
        apellidos = ?,
        email = ?,
        telefono_fijo = ?,
        telefono_celular = ?,
        direccion = ?,
        foto = ?,
        fecha_nacimiento = ?
      WHERE id = ?`,
      [
        nombres || docente.nombres,
        apellidos || docente.apellidos,
        email || docente.email,
        telefono_fijo || docente.telefono_fijo,
        telefono_celular || docente.telefono_celular,
        direccion || docente.direccion,
        fotoPath,
        fecha_nacimiento || docente.fecha_nacimiento,
        docente.id
      ]
    );

    // Preparar datos nuevos para auditoría
    const datosNuevos = {
      nombres: nombres || docente.nombres,
      apellidos: apellidos || docente.apellidos,
      email: email || docente.email,
      telefono_fijo: telefono_fijo || docente.telefono_fijo,
      telefono_celular: telefono_celular || docente.telefono_celular,
      direccion: direccion || docente.direccion,
      fecha_nacimiento: fecha_nacimiento || docente.fecha_nacimiento,
      foto: fotoPath
    };

    // Registrar auditoría ANTES de actualizar
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'EDITAR',
      modulo: 'PERFIL',
      entidad: 'personal',
      entidad_id: docente.id,
      descripcion: `Actualizó perfil: ${datosNuevos.nombres} ${datosNuevos.apellidos}`,
      url: req.originalUrl,
      metodo_http: req.method,
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(datosAnteriores),
      datos_nuevos: JSON.stringify(datosNuevos),
      resultado: 'EXITOSO'
    });

    // ACTUALIZAR DATOS EN LA BASE DE DATOS
    await execute(
      `UPDATE personal SET
        nombres = ?,
        apellidos = ?,
        email = ?,
        telefono_fijo = ?,
        telefono_celular = ?,
        direccion = ?,
        foto = ?,
        fecha_nacimiento = ?
      WHERE id = ?`,
      [
        nombres || docente.nombres,
        apellidos || docente.apellidos,
        email || docente.email,
        telefono_fijo || docente.telefono_fijo,
        telefono_celular || docente.telefono_celular,
        direccion || docente.direccion,
        fotoPath,
        fecha_nacimiento || docente.fecha_nacimiento,
        docente.id
      ]
    );

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    // Obtener el perfil completo actualizado para devolverlo
    const personalActualizado = await query(
      `SELECT p.*, u.tipo as tipo_usuario, u.usuario as dni
       FROM personal p
       INNER JOIN usuarios u ON u.personal_id = p.id
       WHERE u.id = ? AND u.colegio_id = ? AND u.estado = 'ACTIVO'`,
      [usuario_id, colegio_id]
    );

    const docenteActualizado = personalActualizado[0];

    // Construir URL de foto desde la BD actualizada
    let fotoUrl = null;
    const fotoEnBD = docenteActualizado.foto;
    if (fotoEnBD && fotoEnBD !== '') {
      const isProduction = process.env.NODE_ENV === 'production';
      // Si ya es una ruta completa (empieza con /uploads/), construir URL completa
      if (fotoEnBD.startsWith('/uploads/')) {
        if (isProduction) {
          fotoUrl = `https://vanguardschools.edu.pe${fotoEnBD}`;
        } else {
          fotoUrl = `http://localhost:5000${fotoEnBD}`;
        }
      } else if (fotoEnBD.startsWith('http')) {
        // Si ya es una URL completa, usarla directamente
        fotoUrl = fotoEnBD;
      } else {
        // Es solo el nombre del archivo
        // Usar el dominio del sistema PHP para servir fotos (igual que publicaciones)
        const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://nuevo.vanguardschools.edu.pe';
        if (isProduction) {
          fotoUrl = `${phpSystemUrl}/Static/Image/Fotos/${fotoEnBD}`;
        } else {
          fotoUrl = `http://localhost:5000/Static/Image/Fotos/${fotoEnBD}`;
        }
      }
    }

    res.json({
      success: true,
      message: 'Perfil actualizado correctamente',
      docente: {
        id: docenteActualizado.id,
        nombres: docenteActualizado.nombres,
        apellidos: docenteActualizado.apellidos,
        dni: docenteActualizado.dni,
        email: docenteActualizado.email,
        telefono_fijo: docenteActualizado.telefono_fijo,
        telefono_celular: docenteActualizado.telefono_celular,
        direccion: docenteActualizado.direccion,
        foto: fotoUrl,
        cargo: docenteActualizado.cargo,
        profesion: docenteActualizado.profesion,
        fecha_nacimiento: docenteActualizado.fecha_nacimiento,
        fecha_ingreso: docenteActualizado.fecha_ingreso,
        hora_entrada: docenteActualizado.hora_entrada,
        hora_salida: docenteActualizado.hora_salida
      },
      // También devolver el perfil completo para que el frontend pueda actualizar el estado
      perfil: {
        id: docenteActualizado.id,
        nombres: docenteActualizado.nombres,
        apellidos: docenteActualizado.apellidos,
        dni: docenteActualizado.dni,
        email: docenteActualizado.email,
        telefono_fijo: docenteActualizado.telefono_fijo,
        telefono_celular: docenteActualizado.telefono_celular,
        direccion: docenteActualizado.direccion,
        foto: fotoUrl,
        cargo: docenteActualizado.cargo,
        profesion: docenteActualizado.profesion,
        fecha_nacimiento: docenteActualizado.fecha_nacimiento,
        fecha_ingreso: docenteActualizado.fecha_ingreso,
        hora_entrada: docenteActualizado.hora_entrada,
        hora_salida: docenteActualizado.hora_salida
      }
    });
  } catch (error) {
    console.error('Error actualizando perfil:', error);
    res.status(500).json({ error: 'Error al actualizar perfil' });
  }
});

/**
 * PUT /api/docente/perfil/password
 * Cambiar contraseña del docente
 */
router.put('/perfil/password', async (req, res) => {
  try {
    const { usuario_id } = req.user;
    const { password_actual, password_nueva } = req.body;

    if (!password_actual || !password_nueva) {
      return res.status(400).json({ error: 'Contraseña actual y nueva son requeridas' });
    }

    if (password_nueva.length < 6) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
    }

    // Obtener usuario actual
    const usuarios = await query(
      `SELECT u.id, u.password, u.tipo, u.colegio_id FROM usuarios u WHERE u.id = ?`,
      [usuario_id]
    );

    if (usuarios.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const usuarioDB = usuarios[0];

    // Validar contraseña actual (SHA1 como en PHP)
    const crypto = require('crypto');
    const passwordHashActual = crypto.createHash('sha1').update(password_actual).digest('hex');
    
    if (usuarioDB.password !== passwordHashActual) {
      return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    }

    // Generar hash de la nueva contraseña
    const passwordHashNueva = crypto.createHash('sha1').update(password_nueva).digest('hex');

    // Actualizar contraseña en la base de datos
    // Registrar auditoría ANTES de cambiar contraseña
    registrarAccion({
      usuario_id,
      colegio_id: usuarioDB.colegio_id,
      tipo_usuario: usuarioDB.tipo,
      accion: 'CAMBIAR_PASSWORD',
      modulo: 'PERFIL',
      entidad: 'usuario',
      entidad_id: usuario_id,
      descripcion: 'Cambió su contraseña',
      url: req.originalUrl,
      metodo_http: req.method,
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: null,
      datos_nuevos: null,
      resultado: 'EXITOSO'
    });

    await execute(
      `UPDATE usuarios SET password = ? WHERE id = ?`,
      [passwordHashNueva, usuario_id]
    );

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    res.json({ 
      success: true, 
      message: 'Contraseña actualizada correctamente' 
    });
  } catch (error) {
    console.error('Error cambiando contraseña:', error);
    res.status(500).json({ error: 'Error al cambiar la contraseña' });
  }
});

/**
 * GET /api/docente/tiene-asignaciones
 * Verificar si el docente tiene grupos y cursos asignados
 */
router.get('/tiene-asignaciones', async (req, res) => {
  try {
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;
    
    if (!personalId) {
      return res.json({ tiene_grupos: false, tiene_cursos: false });
    }

    // Verificar si tiene grupos asignados
    const gruposAsignados = await query(
      `SELECT COUNT(DISTINCT g.id) as total
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [personalId, colegio_id, anio_activo]
    );

    // Verificar si tiene cursos asignados
    const cursosAsignados = await query(
      `SELECT COUNT(DISTINCT a.id) as total
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [personalId, colegio_id, anio_activo]
    );

    const tieneGrupos = (gruposAsignados[0]?.total || 0) > 0;
    const tieneCursos = (cursosAsignados[0]?.total || 0) > 0;

    res.json({ 
      tiene_grupos: tieneGrupos,
      tiene_cursos: tieneCursos
    });
  } catch (error) {
    console.error('Error verificando asignaciones:', error);
    res.json({ tiene_grupos: false, tiene_cursos: false });
  }
});

/**
 * GET /api/docente/grupos
 * Obtener grupos asignados al docente
 */
router.get('/grupos', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo } = req.user;

    // Obtener personal_id del token
    const personalId = req.user.personal_id;
    
    if (!personalId) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    // Obtener grupos asignados con conteo de alumnos
    // asignaturas tiene grupo_id directamente, no area_curso_id
    // El conteo de alumnos se hace igual que en el sistema anterior: estado = 0 OR estado = 4
    const grupos = await query(
      `SELECT DISTINCT g.*, 
              n.nombre as nivel_nombre, 
              t.nombre as turno_nombre,
              (SELECT COUNT(*) 
               FROM matriculas m 
               WHERE m.grupo_id = g.id 
               AND m.colegio_id = ? 
               AND (m.estado = 0 OR m.estado = 4)) as total_alumnos
       FROM grupos g
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN turnos t ON t.id = g.turno_id
       INNER JOIN asignaturas a ON a.grupo_id = g.id
       WHERE a.personal_id = ? AND g.colegio_id = ? AND g.anio = ?
       ORDER BY n.nombre, g.grado, g.seccion`,
      [colegio_id, personalId, colegio_id, anio_activo]
    );

    res.json({ grupos: grupos || [] });
  } catch (error) {
    console.error('Error obteniendo grupos:', error);
    res.status(500).json({ error: 'Error al obtener grupos asignados' });
  }
});

/**
 * GET /api/docente/grupos/:grupoId/alumnos
 * Obtener lista de alumnos de un grupo
 */
router.get('/grupos/:grupoId/alumnos', async (req, res) => {
  try {
    const { grupoId } = req.params;
    const { colegio_id, anio_activo } = req.user;

    // Validar parámetros
    if (!grupoId) {
      return res.status(400).json({ error: 'ID de grupo es requerido' });
    }
    if (!colegio_id) {
      return res.status(400).json({ error: 'ID de colegio es requerido' });
    }
    if (!anio_activo) {
      return res.status(400).json({ error: 'Año académico es requerido' });
    }

    // Verificar que el docente tiene acceso a este grupo
    const personalId = req.user.personal_id;
    
    if (!personalId) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    const tieneAcceso = await query(
      `SELECT COUNT(*) as count
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.personal_id = ? AND a.grupo_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [personalId, grupoId, colegio_id, anio_activo]
    );

    if (!tieneAcceso || tieneAcceso.length === 0 || tieneAcceso[0].count === 0) {
      return res.status(403).json({ error: 'No tienes acceso a este grupo' });
    }

    // Obtener alumnos del grupo con fecha de nacimiento y teléfono (del alumno o apoderado)
    // Los alumnos se relacionan con apoderados a través de la tabla familias
    // Usar subconsulta para obtener un solo teléfono por alumno y evitar duplicados
    const alumnos = await query(
      `SELECT DISTINCT
              a.*, 
              m.id as matricula_id,
              m.fecha_registro, 
              m.estado as estado_matricula,
              a.fecha_nacimiento,
              COALESCE(
                (SELECT ap2.telefono_celular 
                 FROM familias f2 
                 INNER JOIN apoderados ap2 ON ap2.id = f2.apoderado_id 
                 WHERE f2.alumno_id = a.id 
                 AND ap2.telefono_celular IS NOT NULL 
                 AND ap2.telefono_celular != '' 
                 LIMIT 1),
                (SELECT ap3.telefono_fijo 
                 FROM familias f3 
                 INNER JOIN apoderados ap3 ON ap3.id = f3.apoderado_id 
                 WHERE f3.alumno_id = a.id 
                 AND ap3.telefono_fijo IS NOT NULL 
                 AND ap3.telefono_fijo != '' 
                 LIMIT 1),
                'N/A'
              ) as telefono
       FROM alumnos a
       INNER JOIN matriculas m ON m.alumno_id = a.id
       WHERE m.grupo_id = ? AND m.colegio_id = ? AND m.estado = 0
       ORDER BY a.apellido_paterno, a.apellido_materno, a.nombres`,
      [grupoId, colegio_id]
    );

    res.json({ alumnos: alumnos || [] });
  } catch (error) {
    console.error('Error obteniendo alumnos:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({ error: 'Error al obtener lista de alumnos' });
  }
});

/**
 * GET /api/docente/alumnos/:alumnoId/info
 * Obtener información completa del alumno con historial de matrículas
 */
router.get('/alumnos/:alumnoId/info', async (req, res) => {
  try {
    const { alumnoId } = req.params;
    const { colegio_id, anio_activo } = req.user;

    // Obtener información del alumno
    const alumno = await query(
      `SELECT a.*, 
              p.nombre as pais_nacimiento_nombre
       FROM alumnos a
       LEFT JOIN paises p ON p.id = a.pais_nacimiento_id
       WHERE a.id = ? AND a.colegio_id = ?`,
      [alumnoId, colegio_id]
    );

    if (!alumno || alumno.length === 0) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }

    // Obtener apoderados (padre y madre)
    const apoderados = await query(
      `SELECT ap.*, 
              f.alumno_id,
              CASE 
                WHEN ap.parentesco = 0 THEN 'Padre'
                WHEN ap.parentesco = 1 THEN 'Madre'
                ELSE 'Otro'
              END as parentesco_nombre
       FROM apoderados ap
       INNER JOIN familias f ON f.apoderado_id = ap.id
       WHERE f.alumno_id = ? AND ap.colegio_id = ?
       AND ap.parentesco IN (0, 1)
       ORDER BY ap.parentesco ASC`,
      [alumnoId, colegio_id]
    );

    // Separar padre y madre
    const padre = apoderados.find(a => a.parentesco === 0) || null;
    const madre = apoderados.find(a => a.parentesco === 1) || null;

    // Obtener nivel actual del alumno (desde la matrícula actual)
    const nivelActual = await query(
      `SELECT n.id as nivel_id, 
              n.nombre as nivel_nombre,
              g.grado,
              g.seccion
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? 
       AND (m.estado = 0 OR m.estado = 4)
       LIMIT 1`,
      [alumnoId, colegio_id, anio_activo]
    );

    // Obtener avatar actual del alumno según su sexo y nivel
    // IMPORTANTE: 
    // - Alumnos: sexo = 0 es Masculino, sexo = 1 es Femenino
    // - Avatares: sexo = 0 es Femenino, sexo = 1 es Masculino (opuesto)
    // Si alumno es masculino (sexo=0), buscar avatar con sexo=1
    // Si alumno es femenino (sexo=1), buscar avatar con sexo=0
    const sexoAlumno = alumno[0].sexo;
    const sexoAvatarBuscado = sexoAlumno === 0 ? 1 : (sexoAlumno === 1 ? 0 : null);
    const nivelId = nivelActual && nivelActual.length > 0 ? nivelActual[0].nivel_id : null;
    
    // Buscar avatar del alumno con el sexo correcto
    // IMPORTANTE: asi.level es el nivel del avatar (1, 2, 3...), no el nivel_id de la tabla niveles
    let avatarAlumno = [];
    if (sexoAvatarBuscado !== null) {
      // Buscar avatar con sexo correcto del alumno
      avatarAlumno = await query(
        `SELECT asi.*, 
                ass.created_at as fecha_compra,
                ass.student_id
         FROM avatar_shop_sales ass
         INNER JOIN avatar_shop_items asi ON asi.id = ass.item_id
         WHERE ass.student_id = ? 
         AND (asi.sexo = ? OR asi.sexo IS NULL)
         ORDER BY asi.level DESC, ass.created_at DESC
         LIMIT 1`,
        [alumnoId, sexoAvatarBuscado]
      );
    } else {
      // Si no tiene sexo definido, buscar cualquier avatar
      avatarAlumno = await query(
        `SELECT asi.*, 
                ass.created_at as fecha_compra,
                ass.student_id
         FROM avatar_shop_sales ass
         INNER JOIN avatar_shop_items asi ON asi.id = ass.item_id
         WHERE ass.student_id = ?
         ORDER BY asi.level DESC, ass.created_at DESC
         LIMIT 1`,
        [alumnoId]
      );
    }

    // Obtener historial de matrículas agrupado por nivel
    const matriculas = await query(
      `SELECT m.id, m.grupo_id, m.fecha_registro, m.estado,
              g.grado, g.seccion, g.anio,
              n.id as nivel_id, n.nombre as nivel_nombre,
              t.nombre as turno_nombre
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       LEFT JOIN turnos t ON t.id = g.turno_id
       WHERE m.alumno_id = ? AND m.colegio_id = ?
       ORDER BY n.id, g.anio DESC, g.grado, g.seccion`,
      [alumnoId, colegio_id]
    );

    // Obtener la matrícula actual del año activo (si existe) para el QR
    const matriculaActual = await query(
      `SELECT m.id
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? AND (m.estado = 0 OR m.estado = 4)
       LIMIT 1`,
      [alumnoId, colegio_id, anio_activo]
    );

    // Agrupar matrículas por nivel
    const matriculasPorNivel = {};
    matriculas.forEach(matricula => {
      if (!matriculasPorNivel[matricula.nivel_id]) {
        matriculasPorNivel[matricula.nivel_id] = {
          nivel_id: matricula.nivel_id,
          nivel_nombre: matricula.nivel_nombre,
          matriculas: []
        };
      }
      matriculasPorNivel[matricula.nivel_id].matriculas.push({
        id: matricula.id,
        grado: matricula.grado,
        seccion: matricula.seccion,
        anio: matricula.anio,
        turno_nombre: matricula.turno_nombre,
        fecha_registro: matricula.fecha_registro,
        estado: matricula.estado
      });
    });

    // Construir URL de la foto del alumno
    let fotoUrl = null;
    if (alumno[0].foto) {
      // Fotos se guardan en Static/Image/Fotos/ (compartido con sistema PHP)
      // IMPORTANTE: Usar el mismo dominio del sistema PHP para servir fotos (igual que publicaciones)
      // Por defecto usar PHP_SYSTEM_URL (o fallback), solo usar localhost si estamos explícitamente en desarrollo
      const isDevelopment = process.env.NODE_ENV !== 'production' && !process.env.PHP_SYSTEM_URL;
      if (isDevelopment) {
        fotoUrl = `http://localhost:5000/Static/Image/Fotos/${alumno[0].foto}`;
      } else {
        const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://nuevo.vanguardschools.edu.pe';
        fotoUrl = `${phpSystemUrl}/Static/Image/Fotos/${alumno[0].foto}`;
      }
    }

    // Construir URL del avatar del alumno
    let avatarUrl = null;
    if (avatarAlumno && avatarAlumno.length > 0) {
      // Avatares se guardan en Static/Image/Avatars/ (compartido con sistema PHP)
      // IMPORTANTE: Usar el mismo dominio del sistema PHP para servir avatares
      // Por defecto usar PHP_SYSTEM_URL (o fallback), solo usar localhost si estamos explícitamente en desarrollo
      const isDevelopment = process.env.NODE_ENV !== 'production' && !process.env.PHP_SYSTEM_URL;
      if (avatarAlumno[0].image) {
        if (isDevelopment) {
          avatarUrl = `http://localhost:5000/Static/Image/Avatars/${avatarAlumno[0].image}`;
        } else {
          const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://nuevo.vanguardschools.edu.pe';
          avatarUrl = `${phpSystemUrl}/Static/Image/Avatars/${avatarAlumno[0].image}`;
        }
      }
    }

    // Generar hash SHA1 del matricula_id para el QR (igual que sistema anterior)
    const crypto = require('crypto');
    const matriculaId = matriculaActual && matriculaActual.length > 0 ? matriculaActual[0].id : null;
    const qrCode = matriculaId ? crypto.createHash('sha1').update(String(matriculaId)).digest('hex') : null;

    // Contar estrellas del alumno (sumar niveles de todos los avatares comprados)
    const estrellasTotal = avatarAlumno && avatarAlumno.length > 0 
      ? avatarAlumno[0].level || 0 
      : 0;

    res.json({
      alumno: {
        ...alumno[0],
        foto_url: fotoUrl,
        avatar: avatarAlumno && avatarAlumno.length > 0 ? {
          id: avatarAlumno[0].id,
          name: avatarAlumno[0].name,
          description: avatarAlumno[0].description,
          level: avatarAlumno[0].level,
          image: avatarAlumno[0].image,
          image_url: avatarUrl,
          fecha_compra: avatarAlumno[0].fecha_compra
        } : null,
        nivel_actual: nivelActual && nivelActual.length > 0 ? {
          nivel_id: nivelActual[0].nivel_id,
          nivel_nombre: nivelActual[0].nivel_nombre,
          grado: nivelActual[0].grado,
          seccion: nivelActual[0].seccion
        } : null,
        estrellas: estrellasTotal
      },
      apoderados: {
        padre: padre ? {
          nombres: padre.nombres,
          apellido_paterno: padre.apellido_paterno,
          apellido_materno: padre.apellido_materno,
          nro_documento: padre.nro_documento,
          telefono_fijo: padre.telefono_fijo,
          telefono_celular: padre.telefono_celular,
          email: padre.email,
          direccion: padre.direccion,
          ocupacion: padre.ocupacion,
          centro_trabajo_direccion: padre.centro_trabajo_direccion
        } : null,
        madre: madre ? {
          nombres: madre.nombres,
          apellido_paterno: madre.apellido_paterno,
          apellido_materno: madre.apellido_materno,
          nro_documento: madre.nro_documento,
          telefono_fijo: madre.telefono_fijo,
          telefono_celular: madre.telefono_celular,
          email: madre.email,
          direccion: madre.direccion,
          ocupacion: madre.ocupacion,
          centro_trabajo_direccion: madre.centro_trabajo_direccion
        } : null
      },
      matriculas_por_nivel: Object.values(matriculasPorNivel),
      matricula_actual_id: matriculaId,
      qr_code: qrCode
    });
  } catch (error) {
    console.error('Error obteniendo información del alumno:', error);
    res.status(500).json({ error: 'Error al obtener información del alumno' });
  }
});

/**
 * GET /api/docente/cursos
 * Obtener cursos asignados al docente
 */
router.get('/cursos', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo } = req.user;

    // Obtener personal_id del token
    const personalId = req.user.personal_id;
    
    if (!personalId) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    // Obtener cursos asignados
    // asignaturas tiene grupo_id directamente, no area_curso_id
    const cursos = await query(
      `SELECT a.*, c.nombre as curso_nombre, c.imagen as curso_imagen, 
              g.grado, g.seccion, g.anio, 
              n.nombre as nivel_nombre, t.nombre as turno_nombre
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN cursos c ON c.id = a.curso_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN turnos t ON t.id = g.turno_id
       WHERE a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?
       ORDER BY n.nombre, g.grado, g.seccion, c.nombre`,
      [personalId, colegio_id, anio_activo]
    );

    // Construir URLs completas para las imágenes de cursos
    // Según el modelo anterior, las imágenes están en /Static/Archivos/
    const cursosConImagenes = cursos.map(curso => {
      let cursoImagenUrl = null;
      if (curso.curso_imagen && curso.curso_imagen !== '') {
        const isProduction = process.env.NODE_ENV === 'production';
        
        // Si ya es una URL completa, usarla directamente
        if (curso.curso_imagen.startsWith('http')) {
          cursoImagenUrl = curso.curso_imagen;
        } else if (curso.curso_imagen.startsWith('/Static/')) {
          // Ruta del sistema anterior
          if (isProduction) {
            cursoImagenUrl = `https://vanguardschools.edu.pe${curso.curso_imagen}`;
          } else {
            cursoImagenUrl = `http://localhost:5000${curso.curso_imagen}`;
          }
        } else {
          // Solo el nombre del archivo, construir ruta completa en /Static/Archivos/
          if (isProduction) {
            cursoImagenUrl = `https://vanguardschools.edu.pe/Static/Archivos/${curso.curso_imagen}`;
          } else {
            cursoImagenUrl = `http://localhost:5000/Static/Archivos/${curso.curso_imagen}`;
          }
        }
      }
      
      return {
        ...curso,
        curso_imagen_url: cursoImagenUrl
      };
    });

    res.json({ cursos: cursosConImagenes || [] });
  } catch (error) {
    console.error('Error obteniendo cursos:', error);
    res.status(500).json({ error: 'Error al obtener cursos asignados' });
  }
});

/**
 * GET /api/docente/cursos/:cursoId/alumnos
 * Obtener lista de alumnos de un curso (asignatura) con conteo de estrellas
 */
router.get('/cursos/:cursoId/alumnos', async (req, res) => {
  try {
    const { cursoId } = req.params;
    const { colegio_id, anio_activo } = req.user;

    // Validar parámetros
    if (!cursoId) {
      return res.status(400).json({ error: 'ID de curso es requerido' });
    }

    // Obtener personal_id del token
    const personalId = req.user.personal_id;
    
    if (!personalId) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    // Verificar que el docente tiene acceso a este curso (asignatura)
    const asignatura = await query(
      `SELECT a.*, g.id as grupo_id, g.grado, g.seccion, g.anio,
              n.nombre as nivel_nombre, t.nombre as turno_nombre,
              c.nombre as curso_nombre
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN turnos t ON t.id = g.turno_id
       INNER JOIN cursos c ON c.id = a.curso_id
       WHERE a.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [cursoId, personalId, colegio_id, anio_activo]
    );

    if (!asignatura || asignatura.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a este curso' });
    }

    const cursoInfo = asignatura[0];

    // Obtener alumnos del grupo con conteo de estrellas e incidencias
    // IMPORTANTE: Las estrellas e incidencias se calculan solo del año activo y del curso específico
    // Las estrellas se calculan sumando los puntos de enrollment_incidents (type = 2)
    // Las incidencias se cuentan de enrollment_incidents (type = 1)
    // Usamos subconsultas correlacionadas para evitar duplicación por productos cartesianos de JOINs
    // El promedio final se calcula como el promedio de TODOS los bimestres que tengan notas registradas
    const alumnos = await query(
      `SELECT a.id, 
              a.nombres,
              a.apellido_paterno,
              a.apellido_materno,
              CONCAT(a.apellido_paterno, ' ', a.apellido_materno, ', ', a.nombres) as nombre_completo,
              m.id as matricula_id,
              (SELECT COALESCE(SUM(ei.points), 0)
               FROM enrollment_incidents ei
               INNER JOIN matriculas m_ei ON m_ei.id = ei.enrollment_id
               INNER JOIN grupos g_ei ON g_ei.id = m_ei.grupo_id
               WHERE ei.enrollment_id = m.id 
                 AND ei.type = 2 
                 AND ei.assignment_id = ?
                 AND g_ei.anio = ?) as total_estrellas,
              (SELECT COUNT(DISTINCT ei.id)
               FROM enrollment_incidents ei
               INNER JOIN matriculas m_ei ON m_ei.id = ei.enrollment_id
               INNER JOIN grupos g_ei ON g_ei.id = m_ei.grupo_id
               WHERE ei.enrollment_id = m.id 
                 AND ei.type = 1 
                 AND ei.assignment_id = ?
                 AND g_ei.anio = ?) as total_incidencias,
              (SELECT CASE 
                 WHEN COUNT(*) > 0 THEN 
                   ROUND(AVG(CAST(p.promedio AS DECIMAL(5,2))), 0)
                 ELSE NULL
               END
               FROM promedios p 
               WHERE p.matricula_id = m.id 
                 AND p.asignatura_id = ?
                 AND p.promedio IS NOT NULL
                 AND p.promedio != ''
                 AND p.promedio != '-'
                 AND p.promedio REGEXP '^[0-9]+\.?[0-9]*$') as promedio_final
       FROM alumnos a
       INNER JOIN matriculas m ON m.alumno_id = a.id
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.grupo_id = ? 
         AND m.colegio_id = ? 
         AND (m.estado = 0 OR m.estado = 4)
         AND g.anio = ?
       ORDER BY a.apellido_paterno, a.apellido_materno, a.nombres`,
      [cursoInfo.id, anio_activo, cursoInfo.id, anio_activo, cursoInfo.id, cursoInfo.grupo_id, colegio_id, anio_activo]
    );

    res.json({ 
      alumnos: alumnos || [],
      curso: {
        id: cursoInfo.id,
        curso_nombre: cursoInfo.curso_nombre,
        grado: cursoInfo.grado,
        seccion: cursoInfo.seccion,
        nivel_nombre: cursoInfo.nivel_nombre,
        turno_nombre: cursoInfo.turno_nombre,
        grupo_id: cursoInfo.grupo_id
      }
    });
  } catch (error) {
    console.error('Error obteniendo alumnos del curso:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({ error: 'Error al obtener lista de alumnos del curso' });
  }
});

/**
 * GET /api/docente/cursos/:cursoId/alumnos/:alumnoId/estrellas
 * Obtener historial de estrellas de un alumno
 */
router.get('/cursos/:cursoId/alumnos/:alumnoId/estrellas', async (req, res) => {
  try {
    const { cursoId, alumnoId } = req.params;
    const { colegio_id, anio_activo, personal_id } = req.user;

    if (!personal_id) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    // Verificar acceso al curso
    const asignatura = await query(
      `SELECT a.* FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [cursoId, personal_id, colegio_id, anio_activo]
    );

    if (!asignatura || asignatura.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a este curso' });
    }

    // Obtener matrícula del alumno en el grupo del curso
    // IMPORTANTE: Verificar que la matrícula pertenezca al año activo
    const matricula = await query(
      `SELECT m.id FROM matriculas m
       INNER JOIN asignaturas a ON a.grupo_id = m.grupo_id
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? 
         AND a.id = ? 
         AND m.colegio_id = ? 
         AND (m.estado = 0 OR m.estado = 4)
         AND g.anio = ?`,
      [alumnoId, cursoId, colegio_id, anio_activo]
    );

    if (!matricula || matricula.length === 0) {
      return res.status(404).json({ error: 'Alumno no encontrado en este curso para el año activo' });
    }

    const matriculaId = matricula[0].id;

    // Obtener historial de estrellas (type = 2 según el sistema anterior)
    // IMPORTANTE: Filtrar solo estrellas del año activo
    // Incluir información del docente que dio las estrellas
    const estrellas = await query(
      `SELECT ei.id, ei.points, ei.description, ei.created_at, ei.worker_id,
              CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre,
              CASE WHEN ei.worker_id = ? THEN 1 ELSE 0 END as puede_eliminar
       FROM enrollment_incidents ei
       INNER JOIN matriculas m ON m.id = ei.enrollment_id
       INNER JOIN grupos g ON g.id = m.grupo_id
       LEFT JOIN personal p ON p.id = ei.worker_id
       WHERE ei.enrollment_id = ? 
         AND ei.assignment_id = ? 
         AND ei.type = 2
         AND g.anio = ?
       ORDER BY ei.created_at DESC`,
      [personal_id, matriculaId, cursoId, anio_activo]
    );

    // Calcular total de estrellas
    const totalEstrellas = estrellas.reduce((sum, e) => sum + (e.points || 0), 0);

    res.json({
      estrellas: estrellas || [],
      total_estrellas: totalEstrellas,
      matricula_id: matriculaId
    });
  } catch (error) {
    console.error('Error obteniendo estrellas:', error);
    res.status(500).json({ error: 'Error al obtener historial de estrellas' });
  }
});

/**
 * POST /api/docente/cursos/:cursoId/alumnos/:alumnoId/estrellas
 * Dar estrellas a un alumno
 */
router.post('/cursos/:cursoId/alumnos/:alumnoId/estrellas', async (req, res) => {
  try {
    const { cursoId, alumnoId } = req.params;
    const { colegio_id, anio_activo, personal_id } = req.user;
    const { points, description } = req.body;

    if (!personal_id) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    // Validar datos
    if (!points || points <= 0) {
      return res.status(400).json({ error: 'La cantidad de estrellas debe ser mayor a 0' });
    }

    if (!description || description.trim() === '') {
      return res.status(400).json({ error: 'La descripción es requerida' });
    }

    // Verificar acceso al curso
    const asignatura = await query(
      `SELECT a.* FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [cursoId, personal_id, colegio_id, anio_activo]
    );

    if (!asignatura || asignatura.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a este curso' });
    }

    // Obtener matrícula del alumno
    // IMPORTANTE: Verificar que la matrícula pertenezca al año activo
    const matricula = await query(
      `SELECT m.id FROM matriculas m
       INNER JOIN asignaturas a ON a.grupo_id = m.grupo_id
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? 
         AND a.id = ? 
         AND m.colegio_id = ? 
         AND (m.estado = 0 OR m.estado = 4)
         AND g.anio = ?`,
      [alumnoId, cursoId, colegio_id, anio_activo]
    );

    if (!matricula || matricula.length === 0) {
      return res.status(404).json({ error: 'Alumno no encontrado en este curso para el año activo' });
    }

    const matriculaId = matricula[0].id;

    // Crear registro de estrellas
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const result = await execute(
      `INSERT INTO enrollment_incidents 
       (enrollment_id, assignment_id, worker_id, type, points, description, created_at, updated_at)
       VALUES (?, ?, ?, 2, ?, ?, ?, ?)`,
      [matriculaId, cursoId, personal_id, points, description.trim(), now, now]
    );

    // Registrar auditoría ANTES de responder
    registrarAccion({
      usuario_id: req.user.usuario_id,
      colegio_id: colegio_id,
      tipo_usuario: 'DOCENTE',
      accion: 'CREAR',
      modulo: 'ESTRELLAS',
      entidad: 'enrollment_incidents',
      entidad_id: result.insertId,
      descripcion: `Dio ${points} estrella(s) al alumno ID ${alumnoId} en el curso ID ${cursoId}`,
      url: req.originalUrl,
      metodo_http: 'POST',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      resultado: 'EXITOSO'
    });

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    res.json({
      success: true,
      message: `${points} estrella(s) asignada(s) correctamente`,
      incident_id: result.insertId
    });
  } catch (error) {
    console.error('Error dando estrellas:', error);
    res.status(500).json({ error: 'Error al asignar estrellas' });
  }
});

/**
 * DELETE /api/docente/cursos/:cursoId/alumnos/:alumnoId/estrellas/:incidentId
 * Eliminar estrellas (solo las que el docente actual dio)
 */
router.delete('/cursos/:cursoId/alumnos/:alumnoId/estrellas/:incidentId', async (req, res) => {
  try {
    const { cursoId, alumnoId, incidentId } = req.params;
    const { colegio_id, anio_activo, personal_id } = req.user;

    if (!personal_id) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    // Verificar que el incidente existe y pertenece al docente actual
    // IMPORTANTE: Verificar que pertenezca al año activo
    const incidente = await query(
      `SELECT ei.* FROM enrollment_incidents ei
       INNER JOIN matriculas m ON m.id = ei.enrollment_id
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE ei.id = ? 
         AND ei.worker_id = ? 
         AND ei.type = 2
         AND g.anio = ?`,
      [incidentId, personal_id, anio_activo]
    );

    if (!incidente || incidente.length === 0) {
      return res.status(403).json({ 
        error: 'No puedes eliminar estas estrellas. Solo puedes eliminar las que tú mismo diste del año activo.' 
      });
    }

    // Eliminar el incidente
    await execute(
      `DELETE FROM enrollment_incidents WHERE id = ?`,
      [incidentId]
    );

    // Registrar auditoría ANTES de eliminar
    registrarAccion({
      usuario_id: req.user.usuario_id,
      colegio_id: colegio_id,
      tipo_usuario: 'DOCENTE',
      accion: 'ELIMINAR',
      modulo: 'ESTRELLAS',
      entidad: 'enrollment_incidents',
      entidad_id: incidentId,
      descripcion: `Eliminó ${incidente[0].points} estrella(s) del alumno ID ${alumnoId}`,
      url: req.originalUrl,
      metodo_http: 'DELETE',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(incidente[0]),
      datos_nuevos: JSON.stringify({}),
      resultado: 'EXITOSO'
    });

    // Eliminar el incidente
    await execute(
      `DELETE FROM enrollment_incidents WHERE id = ?`,
      [incidentId]
    );

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    res.json({
      success: true,
      message: 'Estrellas eliminadas correctamente'
    });
  } catch (error) {
    console.error('Error eliminando estrellas:', error);
    res.status(500).json({ error: 'Error al eliminar estrellas' });
  }
});

/**
 * GET /api/docente/cursos/:cursoId/alumnos/:alumnoId/incidencias
 * Obtener historial de incidencias de un alumno
 */
router.get('/cursos/:cursoId/alumnos/:alumnoId/incidencias', async (req, res) => {
  try {
    const { cursoId, alumnoId } = req.params;
    const { colegio_id, anio_activo, personal_id } = req.user;

    if (!personal_id) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    // Verificar acceso al curso
    const asignatura = await query(
      `SELECT a.* FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [cursoId, personal_id, colegio_id, anio_activo]
    );

    if (!asignatura || asignatura.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a este curso' });
    }

    // Obtener matrícula del alumno en el grupo del curso
    // IMPORTANTE: Verificar que la matrícula pertenezca al año activo
    const matricula = await query(
      `SELECT m.id FROM matriculas m
       INNER JOIN asignaturas a ON a.grupo_id = m.grupo_id
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? 
         AND a.id = ? 
         AND m.colegio_id = ? 
         AND (m.estado = 0 OR m.estado = 4)
         AND g.anio = ?`,
      [alumnoId, cursoId, colegio_id, anio_activo]
    );

    if (!matricula || matricula.length === 0) {
      return res.status(404).json({ error: 'Alumno no encontrado en este curso para el año activo' });
    }

    const matriculaId = matricula[0].id;

    // Obtener historial de incidencias (type = 1 según el sistema anterior)
    // IMPORTANTE: 
    // - Filtrar solo incidencias del año activo
    // - Mostrar TODAS las incidencias del alumno sin filtrar por curso (assignment_id)
    // - Incluir información del docente que registró la incidencia y el curso donde se registró
    const incidencias = await query(
      `SELECT ei.id, ei.description, ei.created_at, ei.worker_id, ei.assignment_id,
              CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre,
              c.nombre as curso_nombre,
              CASE WHEN ei.worker_id = ? THEN 1 ELSE 0 END as puede_eliminar
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
      [personal_id, matriculaId, anio_activo]
    );

    res.json({
      incidencias: incidencias || [],
      total_incidencias: incidencias.length,
      matricula_id: matriculaId
    });
  } catch (error) {
    console.error('Error obteniendo incidencias:', error);
    res.status(500).json({ error: 'Error al obtener historial de incidencias' });
  }
});

/**
 * POST /api/docente/cursos/:cursoId/alumnos/:alumnoId/incidencias
 * Registrar una incidencia para un alumno
 */
router.post('/cursos/:cursoId/alumnos/:alumnoId/incidencias', async (req, res) => {
  try {
    const { cursoId, alumnoId } = req.params;
    const { colegio_id, anio_activo, personal_id } = req.user;
    const { description } = req.body;

    if (!personal_id) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    // Validar datos
    if (!description || description.trim() === '') {
      return res.status(400).json({ error: 'La descripción es requerida' });
    }

    // Verificar acceso al curso
    const asignatura = await query(
      `SELECT a.* FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [cursoId, personal_id, colegio_id, anio_activo]
    );

    if (!asignatura || asignatura.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a este curso' });
    }

    // Obtener matrícula del alumno
    // IMPORTANTE: Verificar que la matrícula pertenezca al año activo
    const matricula = await query(
      `SELECT m.id FROM matriculas m
       INNER JOIN asignaturas a ON a.grupo_id = m.grupo_id
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? 
         AND a.id = ? 
         AND m.colegio_id = ? 
         AND (m.estado = 0 OR m.estado = 4)
         AND g.anio = ?`,
      [alumnoId, cursoId, colegio_id, anio_activo]
    );

    if (!matricula || matricula.length === 0) {
      return res.status(404).json({ error: 'Alumno no encontrado en este curso para el año activo' });
    }

    const matriculaId = matricula[0].id;

    // Crear registro de incidencia (type = 1, points = 0)
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const result = await execute(
      `INSERT INTO enrollment_incidents 
       (enrollment_id, assignment_id, worker_id, type, points, description, created_at, updated_at)
       VALUES (?, ?, ?, 1, 0, ?, ?, ?)`,
      [matriculaId, cursoId, personal_id, description.trim(), now, now]
    );

    // Registrar auditoría ANTES de responder
    registrarAccion({
      usuario_id: req.user.usuario_id,
      colegio_id: colegio_id,
      tipo_usuario: 'DOCENTE',
      accion: 'CREAR',
      modulo: 'INCIDENCIAS',
      entidad: 'enrollment_incidents',
      entidad_id: result.insertId,
      descripcion: `Registró una incidencia para el alumno ID ${alumnoId} en el curso ID ${cursoId}`,
      url: req.originalUrl,
      metodo_http: 'POST',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      resultado: 'EXITOSO'
    });

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    res.json({
      success: true,
      message: 'Incidencia registrada correctamente',
      incident_id: result.insertId
    });
  } catch (error) {
    console.error('Error registrando incidencia:', error);
    res.status(500).json({ error: 'Error al registrar la incidencia' });
  }
});

/**
 * DELETE /api/docente/cursos/:cursoId/alumnos/:alumnoId/incidencias/:incidentId
 * Eliminar incidencia (solo las que el docente actual registró)
 */
router.delete('/cursos/:cursoId/alumnos/:alumnoId/incidencias/:incidentId', async (req, res) => {
  try {
    const { cursoId, alumnoId, incidentId } = req.params;
    const { colegio_id, anio_activo, personal_id } = req.user;

    if (!personal_id) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    // Verificar que el incidente existe y pertenece al docente actual
    // IMPORTANTE: Verificar que pertenezca al año activo
    const incidente = await query(
      `SELECT ei.* FROM enrollment_incidents ei
       INNER JOIN matriculas m ON m.id = ei.enrollment_id
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE ei.id = ? 
         AND ei.worker_id = ? 
         AND ei.type = 1
         AND g.anio = ?`,
      [incidentId, personal_id, anio_activo]
    );

    if (!incidente || incidente.length === 0) {
      return res.status(403).json({ 
        error: 'No puedes eliminar esta incidencia. Solo puedes eliminar las que tú mismo registraste del año activo.' 
      });
    }

    // Eliminar el incidente
    await execute(
      `DELETE FROM enrollment_incidents WHERE id = ?`,
      [incidentId]
    );

    // Registrar auditoría ANTES de eliminar
    registrarAccion({
      usuario_id: req.user.usuario_id,
      colegio_id: colegio_id,
      tipo_usuario: 'DOCENTE',
      accion: 'ELIMINAR',
      modulo: 'INCIDENCIAS',
      entidad: 'enrollment_incidents',
      entidad_id: incidentId,
      descripcion: `Eliminó una incidencia del alumno ID ${alumnoId}`,
      url: req.originalUrl,
      metodo_http: 'DELETE',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(incidente[0]),
      datos_nuevos: JSON.stringify({}),
      resultado: 'EXITOSO'
    });

    // Eliminar el incidente
    await execute(
      `DELETE FROM enrollment_incidents WHERE id = ?`,
      [incidentId]
    );

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    res.json({
      success: true,
      message: 'Incidencia eliminada correctamente'
    });
  } catch (error) {
    console.error('Error eliminando incidencia:', error);
    res.status(500).json({ error: 'Error al eliminar la incidencia' });
  }
});

/**
 * Función auxiliar para deserializar datos de notas_detalles
 * El campo data viene serializado en formato PHP: serialize(array)
 */
function deserializarNotasDetalles(dataString) {
  if (!dataString || dataString === '') {
    return {};
  }

  try {
    const phpSerialize = require('php-serialize');
    
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
}

/**
 * GET /api/docente/cursos/:cursoId/alumnos/:alumnoId/notas-detalladas
 * Obtener notas detalladas de un alumno para un curso específico
 */
router.get('/cursos/:cursoId/alumnos/:alumnoId/notas-detalladas', async (req, res) => {
  try {
    const { colegio_id, anio_activo, personal_id } = req.user;
    const { cursoId, alumnoId } = req.params;

    // Validar que el curso pertenece al docente
    const asignatura = await query(
      `SELECT a.*, g.anio, g.nivel_id, n.tipo_calificacion, n.tipo_calificacion_final,
              n.nota_aprobatoria, n.nota_maxima, n.nota_minima, c.nombre as curso_nombre,
              c.peso_examen_mensual, c.examen_mensual
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN cursos c ON c.id = a.curso_id
       WHERE a.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [cursoId, personal_id, colegio_id, anio_activo]
    );

    if (asignatura.length === 0) {
      return res.status(404).json({ error: 'Curso no encontrado o no asignado' });
    }

    const cursoInfo = asignatura[0];

    // Obtener matrícula del alumno
    const matricula = await query(
      `SELECT m.id, m.alumno_id, m.grupo_id
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.grupo_id = ? AND m.colegio_id = ? 
         AND g.anio = ? AND (m.estado = 0 OR m.estado = 4)`,
      [alumnoId, cursoInfo.grupo_id, colegio_id, anio_activo]
    );

    if (matricula.length === 0) {
      return res.status(404).json({ error: 'Alumno no encontrado en este grupo' });
    }

    const matriculaId = matricula[0].id;

    // Obtener criterios de la asignatura (para todos los ciclos o ciclo específico)
    const criterios = await query(
      `SELECT * FROM asignaturas_criterios
       WHERE asignatura_id = ? AND colegio_id = ?
       ORDER BY orden ASC`,
      [cursoId, colegio_id]
    );

    // Obtener todos los indicadores de una vez (optimización)
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

    // Obtener todas las notas detalladas de una vez (optimización)
    const todasNotasDetalles = await query(
      `SELECT ciclo, data FROM notas_detalles
       WHERE matricula_id = ? AND asignatura_id = ? AND ciclo IN (1, 2, 3, 4)`,
      [matriculaId, cursoId]
    );

    // Obtener todas las notas de criterios de una vez (optimización)
    const todasNotasCriterios = await query(
      `SELECT criterio_id, nota, ciclo
       FROM notas n
       WHERE n.matricula_id = ? AND n.asignatura_id = ? AND n.ciclo IN (1, 2, 3, 4)`,
      [matriculaId, cursoId]
    );

    // Obtener todos los exámenes mensuales de una vez (optimización)
    let todasExamenesMensuales = [];
    if (cursoInfo.examen_mensual === 'SI') {
      todasExamenesMensuales = await query(
        `SELECT nro, nota, ciclo FROM notas_examen_mensual
         WHERE matricula_id = ? AND asignatura_id = ? AND ciclo IN (1, 2, 3, 4)
         ORDER BY ciclo ASC, nro ASC`,
        [matriculaId, cursoId]
      );
    }

    // Obtener todos los promedios finales de una vez (optimización)
    const todosPromedios = await query(
      `SELECT promedio, ciclo FROM promedios
       WHERE matricula_id = ? AND asignatura_id = ? AND ciclo IN (1, 2, 3, 4)`,
      [matriculaId, cursoId]
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
      if (cursoInfo.examen_mensual === 'SI') {
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

    // Obtener información del alumno
    const alumno = await query(
      `SELECT id, nombres, apellido_paterno, apellido_materno,
              CONCAT(apellido_paterno, ' ', apellido_materno, ', ', nombres) as nombre_completo
       FROM alumnos
       WHERE id = ?`,
      [alumnoId]
    );

    res.json({
      alumno: alumno[0] || null,
      curso: {
        id: cursoInfo.id,
        nombre: cursoInfo.curso_nombre,
        grupo_id: cursoInfo.grupo_id,
        nivel: {
          tipo_calificacion: cursoInfo.tipo_calificacion, // 0 = Cualitativa, 1 = Cuantitativa
          tipo_calificacion_final: cursoInfo.tipo_calificacion_final, // 0 = Promedio, 1 = Porcentaje
          nota_aprobatoria: cursoInfo.nota_aprobatoria,
          nota_maxima: cursoInfo.nota_maxima,
          nota_minima: cursoInfo.nota_minima
        },
        examen_mensual: cursoInfo.examen_mensual === 'SI',
        peso_examen_mensual: cursoInfo.peso_examen_mensual || 0
      },
      criterios: criteriosConIndicadores,
      notas: notasDetalladas
    });
  } catch (error) {
    console.error('Error obteniendo notas detalladas:', error);
    res.status(500).json({ error: 'Error al obtener notas detalladas' });
  }
});

/**
 * GET /api/docente/cursos/:cursoId/notas
 * Obtener todos los alumnos del curso con sus notas para un ciclo específico
 */
router.get('/cursos/:cursoId/notas', async (req, res) => {
  try {
    const { cursoId } = req.params;
    const { colegio_id, anio_activo, personal_id } = req.user;
    const { ciclo = 1 } = req.query; // Ciclo por defecto: 1

    if (!personal_id) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    if (!cursoId) {
      return res.status(400).json({ error: 'ID de curso es requerido' });
    }

    const cicloInt = parseInt(ciclo);

    // Verificar que el docente tiene acceso a este curso
    const asignatura = await query(
      `SELECT a.*, g.id as grupo_id, g.grado, g.seccion, g.anio, g.nivel_id,
              n.nombre as nivel_nombre, n.tipo_calificacion, n.tipo_calificacion_final,
              n.nota_aprobatoria, n.nota_maxima, n.nota_minima,
              c.nombre as curso_nombre, c.peso_examen_mensual, c.examen_mensual
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN cursos c ON c.id = a.curso_id
       WHERE a.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [cursoId, personal_id, colegio_id, anio_activo]
    );

    if (!asignatura || asignatura.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a este curso' });
    }

    const cursoInfo = asignatura[0];

    // Obtener criterios del curso para este ciclo (ciclo = 0 significa todos los ciclos)
    const criterios = await query(
      `SELECT * FROM asignaturas_criterios
       WHERE asignatura_id = ? AND colegio_id = ? AND (ciclo = ? OR ciclo = 0)
       ORDER BY orden ASC`,
      [cursoId, colegio_id, cicloInt]
    );

    // Obtener indicadores para todos los criterios
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

    // Obtener alumnos del grupo
    const alumnos = await query(
      `SELECT a.id as alumno_id,
              a.nombres,
              a.apellido_paterno,
              a.apellido_materno,
              CONCAT(a.apellido_paterno, ' ', a.apellido_materno, ', ', a.nombres) as nombre_completo,
              m.id as matricula_id
       FROM alumnos a
       INNER JOIN matriculas m ON m.alumno_id = a.id
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.grupo_id = ? 
         AND m.colegio_id = ? 
         AND (m.estado = 0 OR m.estado = 4)
         AND g.anio = ?
       ORDER BY a.apellido_paterno, a.apellido_materno, a.nombres`,
      [cursoInfo.grupo_id, colegio_id, anio_activo]
    );

    // Obtener todas las notas detalladas de todos los alumnos
    const matriculaIds = alumnos.map(a => a.matricula_id);
    let todasNotasDetalles = [];
    if (matriculaIds.length > 0) {
      todasNotasDetalles = await query(
        `SELECT matricula_id, data FROM notas_detalles
         WHERE asignatura_id = ? AND matricula_id IN (${matriculaIds.map(() => '?').join(',')}) AND ciclo = ?`,
        [cursoId, ...matriculaIds, cicloInt]
      );
    }

    // Obtener todas las notas de criterios
    let todasNotasCriterios = [];
    if (matriculaIds.length > 0) {
      todasNotasCriterios = await query(
        `SELECT matricula_id, criterio_id, nota FROM notas
         WHERE asignatura_id = ? AND matricula_id IN (${matriculaIds.map(() => '?').join(',')}) AND ciclo = ?`,
        [cursoId, ...matriculaIds, cicloInt]
      );
    }

    // Obtener todos los exámenes mensuales
    let todasExamenesMensuales = [];
    if (cursoInfo.examen_mensual === 'SI' && matriculaIds.length > 0) {
      todasExamenesMensuales = await query(
        `SELECT matricula_id, nro, nota FROM notas_examen_mensual
         WHERE asignatura_id = ? AND matricula_id IN (${matriculaIds.map(() => '?').join(',')}) AND ciclo = ?
         ORDER BY matricula_id ASC, nro ASC`,
        [cursoId, ...matriculaIds, cicloInt]
      );
    }

    // Obtener todos los promedios finales
    let todosPromedios = [];
    if (matriculaIds.length > 0) {
      todosPromedios = await query(
        `SELECT matricula_id, promedio FROM promedios
         WHERE asignatura_id = ? AND matricula_id IN (${matriculaIds.map(() => '?').join(',')}) AND ciclo = ?`,
        [cursoId, ...matriculaIds, cicloInt]
      );
    }

    // Organizar datos por alumno
    const alumnosConNotas = alumnos.map((alumno, index) => {
      const matriculaId = alumno.matricula_id;

      // Obtener notas detalladas del alumno
      const notaDetalle = todasNotasDetalles.find(nd => nd.matricula_id === matriculaId);
      let notasDetalladas = {};
      if (notaDetalle && notaDetalle.data) {
        notasDetalladas = deserializarNotasDetalles(notaDetalle.data);
      }

      // Obtener notas de criterios del alumno
      const notasCriterios = todasNotasCriterios.filter(n => n.matricula_id === matriculaId);
      const notasMap = {};
      notasCriterios.forEach(nota => {
        notasMap[nota.criterio_id] = nota.nota;
      });

      // Obtener exámenes mensuales del alumno
      const examenesAlumno = todasExamenesMensuales.filter(e => e.matricula_id === matriculaId);
      const examenesMap = {};
      examenesAlumno.forEach(examen => {
        examenesMap[examen.nro] = examen.nota;
      });

      // Obtener promedio final del alumno
      const promedioAlumno = todosPromedios.find(p => p.matricula_id === matriculaId);
      const promedioFinal = promedioAlumno ? promedioAlumno.promedio : null;

      return {
        ...alumno,
        numero: index + 1,
        notas_detalladas: notasDetalladas,
        notas_criterios: notasMap,
        examenes_mensuales: examenesMap,
        promedio_final: promedioFinal
      };
    });

    res.json({
      curso: {
        id: cursoInfo.id,
        curso_nombre: cursoInfo.curso_nombre,
        grado: cursoInfo.grado,
        seccion: cursoInfo.seccion,
        nivel_nombre: cursoInfo.nivel_nombre,
        grupo_id: cursoInfo.grupo_id,
        nivel: {
          tipo_calificacion: cursoInfo.tipo_calificacion,
          tipo_calificacion_final: cursoInfo.tipo_calificacion_final,
          nota_aprobatoria: cursoInfo.nota_aprobatoria,
          nota_maxima: cursoInfo.nota_maxima,
          nota_minima: cursoInfo.nota_minima
        },
        examen_mensual: cursoInfo.examen_mensual === 'SI',
        peso_examen_mensual: cursoInfo.peso_examen_mensual || 0
      },
      criterios: criteriosConIndicadores,
      alumnos: alumnosConNotas,
      ciclo: cicloInt
    });
  } catch (error) {
    console.error('Error obteniendo notas del curso:', error);
    res.status(500).json({ error: 'Error al obtener notas del curso' });
  }
});

/**
 * POST /api/docente/cursos/:cursoId/notas
 * Guardar notas de todos los alumnos del curso para un ciclo específico
 */
router.post('/cursos/:cursoId/notas', async (req, res) => {
  try {
    const { cursoId } = req.params;
    const { colegio_id, anio_activo, usuario_id, personal_id } = req.user;
    const { ciclo, notas } = req.body; // notas: { matricula_id: { criterio_id: { indicador_id: [notas...] } } }

    if (!personal_id) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    if (!cursoId || !ciclo || !notas) {
      return res.status(400).json({ error: 'Datos incompletos' });
    }

    const cicloInt = parseInt(ciclo);

    // Verificar que el docente tiene acceso a este curso
    const asignatura = await query(
      `SELECT a.*, g.id as grupo_id, g.nivel_id, n.tipo_calificacion,
              c.peso_examen_mensual, c.examen_mensual
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN cursos c ON c.id = a.curso_id
       WHERE a.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [cursoId, personal_id, colegio_id, anio_activo]
    );

    if (!asignatura || asignatura.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a este curso' });
    }

    const cursoInfo = asignatura[0];

    // Obtener criterios del curso
    const criterios = await query(
      `SELECT * FROM asignaturas_criterios
       WHERE asignatura_id = ? AND colegio_id = ? AND (ciclo = ? OR ciclo = 0)
       ORDER BY orden ASC`,
      [cursoId, colegio_id, cicloInt]
    );

    // Obtener indicadores
    const criterioIds = criterios.map(c => c.id);
    let todosIndicadores = [];
    if (criterioIds.length > 0) {
      todosIndicadores = await query(
        `SELECT * FROM asignaturas_indicadores
         WHERE criterio_id IN (${criterioIds.map(() => '?').join(',')})`,
        criterioIds
      );
    }

    const phpSerialize = require('php-serialize');

    // Preparar arrays para operaciones en batch
    const insertsNotasDetalles = [];
    const deletesNotasDetalles = [];
    const insertsNotas = [];
    const deletesNotas = [];
    const insertsExamenesMensuales = [];
    const deletesExamenesMensuales = [];
    const insertsPromedios = [];
    const deletesPromedios = [];
    
    // Mapa para calcular promedios finales después
    const promediosCriteriosPorAlumno = {}; // { matricula_id: { criterio_id: nota } }

    // Procesar notas de cada alumno (solo cálculos, sin queries)
    for (const matriculaId in notas) {
      const matriculaIdInt = parseInt(matriculaId);
      const notasAlumno = notas[matriculaId];

      // Construir estructura de datos para notas_detalles
      const dataNotas = {};
      const promediosCriterios = {};

      for (const criterio of criterios) {
        const criterioId = criterio.id;
        const notasCriterio = notasAlumno[criterioId];

        if (!notasCriterio) continue;

        // Obtener indicadores de este criterio
        const indicadoresCriterio = todosIndicadores.filter(i => i.criterio_id === criterioId);

        if (indicadoresCriterio.length > 0) {
          // Hay indicadores: calcular promedio de cada indicador, luego promedio de criterio
          dataNotas[criterioId] = {};
          const promediosIndicadores = [];

          for (const indicador of indicadoresCriterio) {
            const indicadorId = indicador.id;
            const notasIndicador = notasCriterio[indicadorId];

            if (!notasIndicador || !Array.isArray(notasIndicador)) continue;

            // Filtrar notas válidas (no vacías)
            const notasValidas = notasIndicador
              .map(n => {
                const nota = parseFloat(n);
                return isNaN(nota) ? null : nota;
              })
              .filter(n => n !== null);

            if (notasValidas.length > 0) {
              dataNotas[criterioId][indicadorId] = notasIndicador;

              // Calcular promedio del indicador
              const promedioIndicador = Math.round(
                notasValidas.reduce((sum, n) => sum + n, 0) / notasValidas.length
              );
              promediosIndicadores.push(promedioIndicador);
            }
          }

          // Calcular promedio del criterio (promedio de los promedios de indicadores)
          if (promediosIndicadores.length > 0) {
            const promedioCriterio = Math.round(
              promediosIndicadores.reduce((sum, p) => sum + p, 0) / promediosIndicadores.length
            );
            promediosCriterios[criterioId] = promedioCriterio.toString();
          }
        } else {
          // No hay indicadores: la nota se ingresa directamente
          const notaDirecta = notasCriterio.directa || notasCriterio[0];
          if (notaDirecta && notaDirecta !== '') {
            const nota = parseFloat(notaDirecta);
            if (!isNaN(nota)) {
              promediosCriterios[criterioId] = Math.round(nota).toString();
            }
          }
        }
      }

      // Guardar para cálculo de promedios finales
      promediosCriteriosPorAlumno[matriculaIdInt] = promediosCriterios;

      // Preparar DELETE e INSERT para notas_detalles
      deletesNotasDetalles.push([cursoId, matriculaIdInt, cicloInt]);
      const dataSerializado = phpSerialize.serialize(dataNotas);
      insertsNotasDetalles.push([cursoId, matriculaIdInt, cicloInt, dataSerializado]);

      // Preparar DELETE e INSERT para notas de criterios
      for (const criterioId in promediosCriterios) {
        const notaCriterio = promediosCriterios[criterioId];
        deletesNotas.push([matriculaIdInt, criterioId, cursoId, cicloInt]);
        insertsNotas.push([matriculaIdInt, criterioId, cicloInt, cursoId, notaCriterio]);
      }

      // Preparar DELETE e INSERT para exámenes mensuales
      if (cursoInfo.examen_mensual === 'SI' && notasAlumno.examen_mensual) {
        const examenes = notasAlumno.examen_mensual;
        deletesExamenesMensuales.push([matriculaIdInt, cursoId, cicloInt]);
        
        for (const nro in examenes) {
          const notaExamen = parseFloat(examenes[nro]);
          if (!isNaN(notaExamen)) {
            insertsExamenesMensuales.push([matriculaIdInt, cursoId, cicloInt, parseInt(nro), notaExamen]);
          }
        }
      }

      // Preparar DELETE para promedios (INSERT se hará después de calcular)
      deletesPromedios.push([matriculaIdInt, cursoId, cicloInt]);
    }

    // Ejecutar DELETE en batch
    if (deletesNotasDetalles.length > 0) {
      const matriculaIds = [...new Set(deletesNotasDetalles.map(d => d[1]))];
      await execute(
        `DELETE FROM notas_detalles
         WHERE asignatura_id = ? AND ciclo = ? AND matricula_id IN (${matriculaIds.map(() => '?').join(',')})`,
        [cursoId, cicloInt, ...matriculaIds]
      );
    }

    if (deletesNotas.length > 0) {
      const matriculaIds = [...new Set(deletesNotas.map(d => d[0]))];
      await execute(
        `DELETE FROM notas
         WHERE asignatura_id = ? AND ciclo = ? AND matricula_id IN (${matriculaIds.map(() => '?').join(',')})`,
        [cursoId, cicloInt, ...matriculaIds]
      );
    }

    if (deletesExamenesMensuales.length > 0) {
      const matriculaIds = [...new Set(deletesExamenesMensuales.map(d => d[0]))];
      await execute(
        `DELETE FROM notas_examen_mensual
         WHERE asignatura_id = ? AND ciclo = ? AND matricula_id IN (${matriculaIds.map(() => '?').join(',')})`,
        [cursoId, cicloInt, ...matriculaIds]
      );
    }

    if (deletesPromedios.length > 0) {
      const matriculaIds = [...new Set(deletesPromedios.map(d => d[0]))];
      await execute(
        `DELETE FROM promedios
         WHERE asignatura_id = ? AND ciclo = ? AND matricula_id IN (${matriculaIds.map(() => '?').join(',')})`,
        [cursoId, cicloInt, ...matriculaIds]
      );
    }

    // Ejecutar INSERT en batch
    if (insertsNotasDetalles.length > 0) {
      const values = insertsNotasDetalles.map(() => '(?, ?, ?, ?)').join(', ');
      const params = insertsNotasDetalles.flat();
      await execute(
        `INSERT INTO notas_detalles (asignatura_id, matricula_id, ciclo, data) VALUES ${values}`,
        params
      );
    }

    if (insertsNotas.length > 0) {
      const values = insertsNotas.map(() => '(?, ?, ?, ?, ?)').join(', ');
      const params = insertsNotas.flat();
      await execute(
        `INSERT INTO notas (matricula_id, criterio_id, ciclo, asignatura_id, nota) VALUES ${values}`,
        params
      );
    }

    if (insertsExamenesMensuales.length > 0) {
      const values = insertsExamenesMensuales.map(() => '(?, ?, ?, ?, ?)').join(', ');
      const params = insertsExamenesMensuales.flat();
      await execute(
        `INSERT INTO notas_examen_mensual (matricula_id, asignatura_id, ciclo, nro, nota) VALUES ${values}`,
        params
      );
    }

    // Calcular y guardar promedios finales en batch
    const matriculaIds = Object.keys(promediosCriteriosPorAlumno).map(id => parseInt(id));
    
    if (matriculaIds.length > 0) {
      // Obtener todas las notas de criterios de una vez
      const todasNotasFinales = await query(
        `SELECT n.matricula_id, n.criterio_id, n.nota, ac.peso
         FROM notas n
         INNER JOIN asignaturas_criterios ac ON ac.id = n.criterio_id
         WHERE n.asignatura_id = ? AND n.ciclo = ? AND n.matricula_id IN (${matriculaIds.map(() => '?').join(',')})`,
        [cursoId, cicloInt, ...matriculaIds]
      );

      // Obtener todos los exámenes mensuales de una vez
      let todasExamenesMensuales = [];
      if (cursoInfo.examen_mensual === 'SI') {
        todasExamenesMensuales = await query(
          `SELECT matricula_id, nro, nota FROM notas_examen_mensual
           WHERE asignatura_id = ? AND ciclo = ? AND matricula_id IN (${matriculaIds.map(() => '?').join(',')})
           ORDER BY matricula_id ASC, nro ASC`,
          [cursoId, cicloInt, ...matriculaIds]
        );
      }

      // Agrupar notas por matricula_id
      const notasPorAlumno = {};
      todasNotasFinales.forEach(row => {
        if (!notasPorAlumno[row.matricula_id]) {
          notasPorAlumno[row.matricula_id] = [];
        }
        notasPorAlumno[row.matricula_id].push(row);
      });

      // Agrupar exámenes por matricula_id
      const examenesPorAlumno = {};
      todasExamenesMensuales.forEach(row => {
        if (!examenesPorAlumno[row.matricula_id]) {
          examenesPorAlumno[row.matricula_id] = [];
        }
        examenesPorAlumno[row.matricula_id].push(row);
      });

      // Calcular promedios finales para cada alumno
      for (const matriculaIdInt of matriculaIds) {
        const notasFinales = notasPorAlumno[matriculaIdInt] || [];
        let promedioFinal = null;

        if (notasFinales.length > 0) {
          if (cursoInfo.tipo_calificacion_final === 1) {
            // Porcentual: sumar (nota × peso / 100)
            let sumaPonderada = 0;
            let sumaPesos = 0;

            for (const notaRow of notasFinales) {
              const nota = parseFloat(notaRow.nota);
              const peso = parseFloat(notaRow.peso) || 0;
              
              if (!isNaN(nota) && peso > 0) {
                sumaPonderada += (nota * peso / 100);
                sumaPesos += peso;
              }
            }

            if (sumaPesos > 0) {
              if (Math.abs(sumaPesos - 100) < 0.01) {
                promedioFinal = Math.round(sumaPonderada);
              } else {
                promedioFinal = Math.round((sumaPonderada / sumaPesos) * 100);
              }
            }
          } else {
            // Promedio simple
            const notasValidas = notasFinales
              .map(n => parseFloat(n.nota))
              .filter(n => !isNaN(n));

            if (notasValidas.length > 0) {
              promedioFinal = Math.round(
                notasValidas.reduce((sum, n) => sum + n, 0) / notasValidas.length
              );
            }
          }

          // Agregar examen mensual si aplica
          if (cursoInfo.examen_mensual === 'SI' && promedioFinal !== null) {
            const examenesAlumno = examenesPorAlumno[matriculaIdInt] || [];
            if (examenesAlumno.length > 0) {
              const notasExamenes = examenesAlumno.map(e => parseFloat(e.nota)).filter(n => !isNaN(n));
              if (notasExamenes.length > 0) {
                const promedioExamen = Math.round(
                  notasExamenes.reduce((sum, n) => sum + n, 0) / notasExamenes.length
                );
                const pesoExamen = cursoInfo.peso_examen_mensual || 0;
                if (pesoExamen > 0) {
                  promedioFinal = Math.round(
                    promedioFinal * (100 - pesoExamen) / 100 + promedioExamen * pesoExamen / 100
                  );
                } else {
                  promedioFinal = Math.round((promedioFinal + promedioExamen) / 2);
                }
              }
            }
          }
        }

        // Agregar a inserts de promedios
        if (promedioFinal !== null) {
          insertsPromedios.push([matriculaIdInt, cursoId, cicloInt, promedioFinal.toString()]);
        }
      }

      // Insertar promedios en batch
      if (insertsPromedios.length > 0) {
        const values = insertsPromedios.map(() => '(?, ?, ?, ?)').join(', ');
        const params = insertsPromedios.flat();
        await execute(
          `INSERT INTO promedios (matricula_id, asignatura_id, ciclo, promedio) VALUES ${values}`,
          params
        );
      }
    }

    // Registrar auditoría ANTES de responder
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'REGISTRAR_NOTAS',
      modulo: 'CURSOS',
      entidad: 'notas',
      entidad_id: cursoId,
      descripcion: `Registró notas del curso ID: ${cursoId} para el ciclo ${cicloInt} (${Object.keys(notas).length} alumno(s))`,
      url: req.originalUrl,
      metodo_http: 'POST',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: null,
      datos_nuevos: JSON.stringify({ ciclo: cicloInt, total_alumnos: Object.keys(notas).length }),
      resultado: 'EXITOSO'
    });

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    res.json({
      success: true,
      message: 'Notas guardadas correctamente'
    });
  } catch (error) {
    console.error('Error guardando notas:', error);
    res.status(500).json({ error: 'Error al guardar notas' });
  }
});

/**
 * GET /api/docente/horario
 * Obtener horario del docente
 */
router.get('/horario', async (req, res) => {
  try {
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;

    if (!personalId) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    // =============================
    // Obtener horario del docente
    // Basado en la lógica de imprimir_horario_docente del sistema anterior,
    // usando la tabla grupos_horarios + asignaturas + grupos + niveles + cursos
    // =============================

    const anioActivoInt = parseInt(anio_activo);

    // Ver qué años de grupos_horarios hay para este docente
    const aniosDisponibles = await query(
      `SELECT DISTINCT gh.anio
       FROM grupos_horarios gh
       LEFT JOIN asignaturas a ON a.id = gh.asignatura_id
       LEFT JOIN grupos g ON g.id = a.grupo_id
       WHERE (a.personal_id = ? OR gh.personal_id = ?)
       ORDER BY gh.anio DESC`,
      [personalId, personalId]
    );

    if (!aniosDisponibles || aniosDisponibles.length === 0) {
      console.log('📅 No se encontraron registros en grupos_horarios para este docente.');
      return res.json({ horario: [] });
    }

    // Usar primero el año activo si existe en grupos_horarios, si no, el más reciente disponible
    let anioUsar = anioActivoInt;
    const existeAnioActivo = aniosDisponibles.some((row) => parseInt(row.anio) === anioActivoInt);
    if (!existeAnioActivo) {
      anioUsar = parseInt(aniosDisponibles[0].anio);
    }

    console.log(
      `📅 Años disponibles en grupos_horarios para este docente:`,
      aniosDisponibles.map((a) => a.anio)
    );
    console.log(`📅 Usando año para horario docente: ${anioUsar}`);

    // Traer todas las filas de horario con curso y grupo ya resueltos
    // Incluye horarios con asignaturas Y horarios manuales (recreos, talleres, etc.)
    // Los horarios manuales tienen descripcion pero pueden no tener asignatura_id válido
    const horarioCrudo = await query(
      `SELECT 
         gh.id,
         gh.dia,
         gh.hora_inicio,
         gh.hora_final,
         gh.anio,
         c.nombre        AS curso_nombre,
         gh.descripcion  AS descripcion,
         g.grado,
         g.seccion,
         n.nombre        AS nivel_nombre
       FROM grupos_horarios gh
       LEFT JOIN asignaturas a ON a.id = gh.asignatura_id
       LEFT JOIN grupos g      ON g.id = COALESCE(a.grupo_id, gh.grupo_id)
       LEFT JOIN niveles n     ON n.id = g.nivel_id
       LEFT JOIN cursos c      ON c.id = a.curso_id
       WHERE gh.anio = ?
         AND (a.personal_id = ? OR gh.personal_id = ?)
       ORDER BY gh.dia, STR_TO_DATE(gh.hora_inicio, '%l:%i %p')`,
      [anioUsar, personalId, personalId]
    );

    console.log(`📅 Filas de horario crudo encontradas: ${horarioCrudo ? horarioCrudo.length : 0}`);
    if (horarioCrudo && horarioCrudo.length > 0) {
      console.log('📅 Primera fila de horario crudo:', horarioCrudo[0]);
    }

    // Mapear a un formato estándar para el frontend
    const horario = (horarioCrudo || []).map((row) => {
      // Texto del grupo: NIVEL - X° SECCION - AÑO (igual al PDF)
      let grupoTexto = '';
      if (row.nivel_nombre || row.grado || row.seccion) {
        const gradoTexto = row.grado ? `${row.grado}°` : '';
        grupoTexto = `${row.nivel_nombre || ''} ${gradoTexto} ${row.seccion || ''}`.trim();
        if (row.anio) {
          grupoTexto = `${grupoTexto} - ${row.anio}`;
        }
      }

      const titulo = row.curso_nombre || row.descripcion || '';

      return {
        id: row.id,
        dia: typeof row.dia === 'number' ? row.dia : parseInt(row.dia || 0, 10),
        inicio: row.hora_inicio,
        fin: row.hora_final,
        anio: row.anio,
        titulo,
        grupo: grupoTexto
      };
    });

    res.json({ horario });
  } catch (error) {
    console.error('Error obteniendo horario:', error);
    res.status(500).json({ error: 'Error al obtener horario' });
  }
});

/**
 * GET /api/docente/cursos/:cursoId/horario
 * Obtener horario de un curso específico
 */
router.get('/cursos/:cursoId/horario', async (req, res) => {
  try {
    const { cursoId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;

    if (!personalId) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    if (!cursoId) {
      return res.status(400).json({ error: 'ID de curso es requerido' });
    }

    // Verificar que el docente tiene acceso a este curso (asignatura)
    const asignatura = await query(
      `SELECT a.*, c.id as curso_id, c.nombre as curso_nombre,
              g.id as grupo_id, g.grado, g.seccion, g.anio,
              n.nombre as nivel_nombre
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN cursos c ON c.id = a.curso_id
       WHERE a.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [cursoId, personalId, colegio_id, anio_activo]
    );

    if (!asignatura || asignatura.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a este curso' });
    }

    const cursoInfo = asignatura[0];
    const anioActivoInt = parseInt(anio_activo);

    // Obtener horario específico de este curso
    const horarioCrudo = await query(
      `SELECT 
         gh.id,
         gh.dia,
         gh.hora_inicio,
         gh.hora_final,
         gh.anio,
         c.nombre        AS curso_nombre,
         gh.descripcion  AS descripcion,
         g.grado,
         g.seccion,
         n.nombre        AS nivel_nombre
       FROM grupos_horarios gh
       LEFT JOIN asignaturas a ON a.id = gh.asignatura_id
       LEFT JOIN grupos g      ON g.id = a.grupo_id
       LEFT JOIN niveles n     ON n.id = g.nivel_id
       LEFT JOIN cursos c      ON c.id = a.curso_id
       WHERE gh.anio = ?
         AND a.id = ?
         AND (a.personal_id = ? OR gh.personal_id = ?)
       ORDER BY gh.dia, STR_TO_DATE(gh.hora_inicio, '%l:%i %p')`,
      [anioActivoInt, cursoId, personalId, personalId]
    );

    // Mapear a un formato estándar para el frontend
    const horario = (horarioCrudo || []).map((row) => {
      // Texto del grupo: NIVEL - X° SECCION - AÑO
      let grupoTexto = '';
      if (row.nivel_nombre || row.grado || row.seccion) {
        const gradoTexto = row.grado ? `${row.grado}°` : '';
        grupoTexto = `${row.nivel_nombre || ''} ${gradoTexto} ${row.seccion || ''}`.trim();
        if (row.anio) {
          grupoTexto = `${grupoTexto} - ${row.anio}`;
        }
      }

      const titulo = row.curso_nombre || row.descripcion || '';

      return {
        id: row.id,
        dia: typeof row.dia === 'number' ? row.dia : parseInt(row.dia || 0, 10),
        inicio: row.hora_inicio,
        fin: row.hora_final,
        anio: row.anio,
        titulo,
        grupo: grupoTexto
      };
    });

    res.json({ 
      horario,
      curso: {
        id: cursoInfo.id,
        curso_nombre: cursoInfo.curso_nombre,
        grado: cursoInfo.grado,
        seccion: cursoInfo.seccion,
        nivel_nombre: cursoInfo.nivel_nombre,
        grupo_id: cursoInfo.grupo_id
      }
    });
  } catch (error) {
    console.error('Error obteniendo horario del curso:', error);
    res.status(500).json({ error: 'Error al obtener horario del curso' });
  }
});

/**
 * GET /api/docente/cursos/:cursoId/aula-virtual
 * Obtener link del aula virtual de un curso
 */
router.get('/cursos/:cursoId/aula-virtual', async (req, res) => {
  try {
    const { cursoId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;

    if (!personalId) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    if (!cursoId) {
      return res.status(400).json({ error: 'ID de curso es requerido' });
    }

    // Verificar que el docente tiene acceso a este curso (asignatura)
    const asignatura = await query(
      `SELECT a.id, a.aula_virtual, a.habilitar_aula,
              c.nombre as curso_nombre,
              g.grado, g.seccion,
              n.nombre as nivel_nombre
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN cursos c ON c.id = a.curso_id
       WHERE a.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [cursoId, personalId, colegio_id, anio_activo]
    );

    if (!asignatura || asignatura.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a este curso' });
    }

    const cursoInfo = asignatura[0];

    res.json({ 
      aula_virtual: cursoInfo.aula_virtual || '',
      habilitar_aula: cursoInfo.habilitar_aula || 'NO',
      curso: {
        id: cursoInfo.id,
        curso_nombre: cursoInfo.curso_nombre,
        grado: cursoInfo.grado,
        seccion: cursoInfo.seccion,
        nivel_nombre: cursoInfo.nivel_nombre
      }
    });
  } catch (error) {
    console.error('Error obteniendo link del aula virtual:', error);
    res.status(500).json({ error: 'Error al obtener link del aula virtual' });
  }
});

/**
 * PUT /api/docente/cursos/:cursoId/aula-virtual
 * Actualizar link del aula virtual de un curso
 */
// GET: Obtener datos para copiar contenido (otras secciones y contenido disponible)
router.get('/cursos/:cursoId/copiar-contenido', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { cursoId } = req.params;

    // Verificar que el curso pertenece al docente
    const curso = await query(
      `SELECT a.*, c.nombre as curso_nombre, g.grado, g.seccion, g.nivel_id, g.anio
       FROM asignaturas a
       INNER JOIN cursos c ON c.id = a.curso_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [cursoId, personal_id, colegio_id, anio_activo]
    );

    if (curso.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a este curso' });
    }

    const cursoInfo = curso[0];

    // Obtener otras asignaturas del mismo curso, mismo grado, mismo año (pero diferente sección)
    const otrasAsignaturas = await query(
      `SELECT a.id, a.curso_id, c.nombre as curso_nombre, g.grado, g.seccion, g.turno_id, t.nombre as turno_nombre
       FROM asignaturas a
       INNER JOIN cursos c ON c.id = a.curso_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       LEFT JOIN turnos t ON t.id = g.turno_id
       WHERE a.id != ? 
         AND a.curso_id = ? 
         AND a.personal_id = ?
         AND a.colegio_id = ?
         AND g.anio = ?
         AND g.grado = ?
       ORDER BY g.seccion ASC`,
      [cursoId, cursoInfo.curso_id, personal_id, colegio_id, anio_activo, cursoInfo.grado]
    );

    // Obtener todos los temas (archivos) de la asignatura actual
    const temas = await query(
      `SELECT id, nombre, ciclo, orden FROM asignaturas_archivos
       WHERE asignatura_id = ?
       ORDER BY ciclo ASC, orden ASC`,
      [cursoId]
    );

    // Obtener todas las tareas de la asignatura actual
    const tareas = await query(
      `SELECT id, titulo, ciclo FROM asignaturas_tareas
       WHERE asignatura_id = ?
       ORDER BY ciclo ASC, id ASC`,
      [cursoId]
    );

    // Obtener todos los exámenes de la asignatura actual
    const examenes = await query(
      `SELECT id, titulo, ciclo FROM asignaturas_examenes
       WHERE asignatura_id = ?
       ORDER BY ciclo ASC, id ASC`,
      [cursoId]
    );

    // Obtener todos los videos de la asignatura actual
    const videos = await query(
      `SELECT id, descripcion, ciclo FROM asignaturas_videos
       WHERE asignatura_id = ?
       ORDER BY ciclo ASC, id ASC`,
      [cursoId]
    );

    // Obtener todos los enlaces de la asignatura actual
    const enlaces = await query(
      `SELECT id, descripcion, ciclo FROM asignaturas_enlaces
       WHERE asignatura_id = ?
       ORDER BY ciclo ASC, id ASC`,
      [cursoId]
    );

    res.json({
      otrasAsignaturas: otrasAsignaturas.map(a => ({
        id: a.id,
        nombre: `${a.curso_nombre} - ${a.grado}° ${a.seccion} - ${a.turno_nombre || ''}`
      })),
      temas: temas.map(t => ({
        id: t.id,
        nombre: `B${t.ciclo} - ${t.nombre}`
      })),
      tareas: tareas.map(t => ({
        id: t.id,
        nombre: `B${t.ciclo} - ${t.titulo}`
      })),
      examenes: examenes.map(e => ({
        id: e.id,
        nombre: `B${e.ciclo} - ${e.titulo}`
      })),
      videos: videos.map(v => ({
        id: v.id,
        nombre: `B${v.ciclo} - ${v.descripcion}`
      })),
      enlaces: enlaces.map(e => ({
        id: e.id,
        nombre: `B${e.ciclo} - ${e.descripcion}`
      }))
    });
  } catch (error) {
    console.error('Error obteniendo datos para copiar contenido:', error);
    res.status(500).json({ error: 'Error al obtener datos para copiar contenido' });
  }
});

// POST: Ejecutar copia de contenido
router.post('/cursos/:cursoId/copiar-contenido', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { cursoId } = req.params;
    const { asignatura_destino_id, temas_id, tareas_id, examenes_id, videos_id, enlaces_id } = req.body;

    if (!asignatura_destino_id) {
      return res.status(400).json({ error: 'Debe seleccionar una asignatura destino' });
    }

    // Verificar que ambas asignaturas pertenecen al docente
    const asignaturaOrigen = await query(
      `SELECT a.* FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [cursoId, personal_id, colegio_id, anio_activo]
    );

    const asignaturaDestino = await query(
      `SELECT a.* FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [asignatura_destino_id, personal_id, colegio_id, anio_activo]
    );

    if (asignaturaOrigen.length === 0 || asignaturaDestino.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a una o ambas asignaturas' });
    }

    let copiados = {
      temas: 0,
      tareas: 0,
      examenes: 0,
      videos: 0,
      enlaces: 0
    };

    // Copiar temas (archivos)
    if (temas_id && temas_id.length > 0) {
      for (const temaId of temas_id) {
        const tema = await query(
          `SELECT * FROM asignaturas_archivos WHERE id = ? AND asignatura_id = ?`,
          [temaId, cursoId]
        );

        if (tema.length > 0) {
          await execute(
            `INSERT INTO asignaturas_archivos (asignatura_id, trabajador_id, nombre, archivo, fecha_hora, ciclo, orden)
             VALUES (?, ?, ?, ?, NOW(), ?, ?)`,
            [
              asignatura_destino_id,
              tema[0].trabajador_id,
              tema[0].nombre,
              tema[0].archivo,
              tema[0].ciclo,
              tema[0].orden
            ]
          );
          copiados.temas++;
        }
      }
    }

    // Copiar tareas (con sus archivos)
    if (tareas_id && tareas_id.length > 0) {
      for (const tareaId of tareas_id) {
        const tarea = await query(
          `SELECT * FROM asignaturas_tareas WHERE id = ? AND asignatura_id = ?`,
          [tareaId, cursoId]
        );

        if (tarea.length > 0) {
          const resultado = await execute(
            `INSERT INTO asignaturas_tareas (titulo, descripcion, fecha_hora, fecha_entrega, trabajador_id, asignatura_id, ciclo)
             VALUES (?, ?, NOW(), ?, ?, ?, ?)`,
            [
              tarea[0].titulo,
              tarea[0].descripcion,
              tarea[0].fecha_entrega,
              tarea[0].trabajador_id,
              asignatura_destino_id,
              tarea[0].ciclo
            ]
          );

          const nuevaTareaId = resultado.insertId;

          // Copiar archivos de la tarea
          const archivosTarea = await query(
            `SELECT * FROM asignaturas_tareas_archivos WHERE tarea_id = ?`,
            [tareaId]
          );

          for (const archivo of archivosTarea) {
            await execute(
              `INSERT INTO asignaturas_tareas_archivos (tarea_id, nombre, archivo)
               VALUES (?, ?, ?)`,
              [nuevaTareaId, archivo.nombre, archivo.archivo]
            );
          }

          copiados.tareas++;
        }
      }
    }

    // Copiar exámenes (con preguntas y alternativas)
    if (examenes_id && examenes_id.length > 0) {
      for (const examenId of examenes_id) {
        const examen = await query(
          `SELECT * FROM asignaturas_examenes WHERE id = ? AND asignatura_id = ?`,
          [examenId, cursoId]
        );

        if (examen.length > 0) {
          const examenData = examen[0];
          const resultado = await execute(
            `INSERT INTO asignaturas_examenes (
              trabajador_id, titulo, tipo, archivo_pdf, fecha_desde, fecha_hasta, hora_desde, hora_hasta,
              asignatura_id, ciclo, preguntas_max, tipo_puntaje, puntos_correcta, penalizar_incorrecta,
              penalizacion_incorrecta, tiempo, intentos, estado, orden_preguntas
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              examenData.trabajador_id,
              examenData.titulo,
              examenData.tipo,
              examenData.archivo_pdf,
              examenData.fecha_desde,
              examenData.fecha_hasta,
              examenData.hora_desde,
              examenData.hora_hasta,
              asignatura_destino_id,
              examenData.ciclo,
              examenData.preguntas_max,
              examenData.tipo_puntaje,
              examenData.puntos_correcta,
              examenData.penalizar_incorrecta,
              examenData.penalizacion_incorrecta,
              examenData.tiempo,
              examenData.intentos,
              examenData.estado,
              examenData.orden_preguntas
            ]
          );

          const nuevoExamenId = resultado.insertId;

          // Copiar preguntas
          const preguntas = await query(
            `SELECT * FROM asignaturas_examenes_preguntas WHERE examen_id = ? ORDER BY orden ASC`,
            [examenId]
          );

          // Mapeo global de IDs antiguos a nuevos para alternativas (para actualizar par_id)
          const mapeoAlternativasGlobal = {}; // { alternativa_id_antigua: alternativa_id_nueva }

          for (const pregunta of preguntas) {
            const resultadoPregunta = await execute(
              `INSERT INTO asignaturas_examenes_preguntas (
                examen_id, descripcion, puntos, orden, tipo, imagen_puzzle, datos_adicionales
              ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                nuevoExamenId,
                pregunta.descripcion,
                pregunta.puntos,
                pregunta.orden,
                pregunta.tipo,
                pregunta.imagen_puzzle,
                pregunta.datos_adicionales
              ]
            );

            const nuevaPreguntaId = resultadoPregunta.insertId;

            // Copiar alternativas
            const alternativas = await query(
              `SELECT * FROM asignaturas_examenes_preguntas_alternativas WHERE pregunta_id = ? ORDER BY id ASC`,
              [pregunta.id]
            );

            for (const alternativa of alternativas) {
              const resultadoAlternativa = await execute(
                `INSERT INTO asignaturas_examenes_preguntas_alternativas (
                  pregunta_id, descripcion, correcta, orden_posicion, par_id, zona_drop
                ) VALUES (?, ?, ?, ?, ?, ?)`,
                [
                  nuevaPreguntaId,
                  alternativa.descripcion,
                  alternativa.correcta,
                  alternativa.orden_posicion,
                  null, // Temporalmente null, se actualizará después
                  alternativa.zona_drop
                ]
              );

              // Guardar mapeo de ID antiguo a nuevo
              mapeoAlternativasGlobal[alternativa.id] = resultadoAlternativa.insertId;
            }
          }

          // Actualizar par_id de las alternativas copiadas
          for (const pregunta of preguntas) {
            const alternativas = await query(
              `SELECT * FROM asignaturas_examenes_preguntas_alternativas WHERE pregunta_id = ? ORDER BY id ASC`,
              [pregunta.id]
            );

            const nuevasPreguntas = await query(
              `SELECT id FROM asignaturas_examenes_preguntas WHERE examen_id = ? ORDER BY orden ASC`,
              [nuevoExamenId]
            );

            // Encontrar el índice de la pregunta actual
            const preguntaIndex = preguntas.findIndex(p => p.id === pregunta.id);
            const nuevaPreguntaId = nuevasPreguntas[preguntaIndex].id;

            const nuevasAlternativas = await query(
              `SELECT id FROM asignaturas_examenes_preguntas_alternativas WHERE pregunta_id = ? ORDER BY id ASC`,
              [nuevaPreguntaId]
            );

            for (let i = 0; i < alternativas.length; i++) {
              const alternativa = alternativas[i];
              const nuevaAlternativaId = nuevasAlternativas[i].id;

              if (alternativa.par_id && mapeoAlternativasGlobal[alternativa.par_id]) {
                const nuevoParId = mapeoAlternativasGlobal[alternativa.par_id];
                await execute(
                  `UPDATE asignaturas_examenes_preguntas_alternativas SET par_id = ? WHERE id = ?`,
                  [nuevoParId, nuevaAlternativaId]
                );
              }
            }
          }

          copiados.examenes++;
        }
      }
    }

    // Copiar videos
    if (videos_id && videos_id.length > 0) {
      for (const videoId of videos_id) {
        const video = await query(
          `SELECT * FROM asignaturas_videos WHERE id = ? AND asignatura_id = ?`,
          [videoId, cursoId]
        );

        if (video.length > 0) {
          await execute(
            `INSERT INTO asignaturas_videos (asignatura_id, trabajador_id, descripcion, enlace, ciclo, fecha_hora)
             VALUES (?, ?, ?, ?, ?, NOW())`,
            [
              asignatura_destino_id,
              video[0].trabajador_id,
              video[0].descripcion,
              video[0].enlace,
              video[0].ciclo
            ]
          );
          copiados.videos++;
        }
      }
    }

    // Copiar enlaces
    if (enlaces_id && enlaces_id.length > 0) {
      for (const enlaceId of enlaces_id) {
        const enlace = await query(
          `SELECT * FROM asignaturas_enlaces WHERE id = ? AND asignatura_id = ?`,
          [enlaceId, cursoId]
        );

        if (enlace.length > 0) {
          await execute(
            `INSERT INTO asignaturas_enlaces (asignatura_id, trabajador_id, descripcion, enlace, ciclo, fecha_hora)
             VALUES (?, ?, ?, ?, ?, NOW())`,
            [
              asignatura_destino_id,
              enlace[0].trabajador_id,
              enlace[0].descripcion,
              enlace[0].enlace,
              enlace[0].ciclo
            ]
          );
          copiados.enlaces++;
        }
      }
    }

    // Registrar auditoría
    req.skipAudit = true;
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: 'DOCENTE',
      accion: 'COPIAR',
      modulo: 'Cursos Asignados',
      entidad: 'Contenido Aula Virtual',
      entidad_id: cursoId,
      descripcion: `Copió contenido de asignatura (ID: ${cursoId}) a asignatura (ID: ${asignatura_destino_id}). Temas: ${copiados.temas}, Tareas: ${copiados.tareas}, Exámenes: ${copiados.examenes}, Videos: ${copiados.videos}, Enlaces: ${copiados.enlaces}`,
      url: req.originalUrl,
      metodo_http: req.method,
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
      datos_anteriores: null,
      datos_nuevos: JSON.stringify({ asignatura_destino_id, copiados }),
      resultado: 'EXITOSO'
    }).catch(err => console.error('Error en auditoría:', err));

    res.json({
      success: true,
      message: 'Contenido copiado correctamente',
      copiados: copiados
    });
  } catch (error) {
    console.error('Error copiando contenido:', error);
    res.status(500).json({ error: 'Error al copiar contenido' });
  }
});

router.put('/cursos/:cursoId/aula-virtual', async (req, res) => {
  try {
    const { cursoId } = req.params;
    const { colegio_id, anio_activo, usuario_id } = req.user;
    const personalId = req.user.personal_id;
    const { aula_virtual, habilitar_aula } = req.body;

    if (!personalId) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    if (!cursoId) {
      return res.status(400).json({ error: 'ID de curso es requerido' });
    }

    // Validar habilitar_aula
    if (habilitar_aula !== undefined && habilitar_aula !== 'SI' && habilitar_aula !== 'NO') {
      return res.status(400).json({ error: 'habilitar_aula debe ser "SI" o "NO"' });
    }

    // Verificar que el docente tiene acceso a este curso (asignatura)
    const asignatura = await query(
      `SELECT a.* FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [cursoId, personalId, colegio_id, anio_activo]
    );

    if (!asignatura || asignatura.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a este curso' });
    }

    // Construir query de actualización
    const updates = [];
    const params = [];

    if (aula_virtual !== undefined) {
      updates.push('a.aula_virtual = ?');
      params.push(aula_virtual || ''); // Permitir guardar en blanco
    }

    if (habilitar_aula !== undefined) {
      updates.push('a.habilitar_aula = ?');
      params.push(habilitar_aula);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    params.push(cursoId, personalId, colegio_id, anio_activo);

    // Preparar datos nuevos para auditoría
    const datosNuevos = {
      aula_virtual: aula_virtual || '',
      habilitar_aula: habilitar_aula
    };

    // Registrar auditoría ANTES de actualizar
    registrarAccion({
      usuario_id: usuario_id,
      colegio_id: colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'ACTUALIZAR_AULA_VIRTUAL',
      modulo: 'CURSOS',
      entidad: 'asignaturas',
      entidad_id: cursoId,
      descripcion: `Actualizó link del aula virtual del curso ID: ${cursoId}`,
      url: req.originalUrl,
      metodo_http: 'PUT',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(asignatura[0]),
      datos_nuevos: JSON.stringify(datosNuevos),
      resultado: 'EXITOSO'
    });

    // Actualizar asignatura (usar alias 'a' para las columnas en SET)
    await execute(
      `UPDATE asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       SET ${updates.join(', ')}
       WHERE a.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      params
    );

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    // Obtener datos actualizados
    const asignaturaActualizada = await query(
      `SELECT a.aula_virtual, a.habilitar_aula,
              c.nombre as curso_nombre,
              g.grado, g.seccion,
              n.nombre as nivel_nombre
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN cursos c ON c.id = a.curso_id
       WHERE a.id = ?`,
      [cursoId]
    );

    res.json({ 
      success: true,
      message: 'Link del aula virtual actualizado correctamente',
      aula_virtual: asignaturaActualizada[0]?.aula_virtual || '',
      habilitar_aula: asignaturaActualizada[0]?.habilitar_aula || 'NO',
      curso: {
        id: cursoId,
        curso_nombre: asignaturaActualizada[0]?.curso_nombre,
        grado: asignaturaActualizada[0]?.grado,
        seccion: asignaturaActualizada[0]?.seccion,
        nivel_nombre: asignaturaActualizada[0]?.nivel_nombre
      }
    });
  } catch (error) {
    console.error('Error actualizando link del aula virtual:', error);
    res.status(500).json({ error: 'Error al actualizar link del aula virtual' });
  }
});

/**
 * GET /api/docente/tutoria
 * Verificar si el docente es tutor y obtener TODOS los grupos donde es tutor
 */
router.get('/tutoria', async (req, res) => {
  try {
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;

    if (!personalId) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    // Obtener TODOS los grupos donde es tutor
    const gruposTutor = await query(
      `SELECT g.*, n.nombre as nivel_nombre, t.nombre as turno_nombre,
              (SELECT COUNT(*) 
               FROM matriculas m 
               WHERE m.grupo_id = g.id 
               AND m.colegio_id = ? 
               AND (m.estado = 0 OR m.estado = 4)) as total_alumnos
       FROM grupos g
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN turnos t ON t.id = g.turno_id
       WHERE g.tutor_id = ? AND g.colegio_id = ? AND g.anio = ?
       ORDER BY n.nombre, g.grado, g.seccion`,
      [colegio_id, personalId, colegio_id, anio_activo]
    );

    res.json({
      es_tutor: gruposTutor.length > 0,
      grupos: gruposTutor || []
    });
  } catch (error) {
    console.error('Error verificando tutoría:', error);
    res.status(500).json({ error: 'Error al verificar tutoría' });
  }
});

/**
 * GET /api/docente/tutoria/grupos/:grupoId/alumnos
 * Obtener alumnos de un grupo específico del tutor
 */
router.get('/tutoria/grupos/:grupoId/alumnos', async (req, res) => {
  try {
    const { grupoId } = req.params;
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;

    if (!personalId) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    // Verificar que el docente es tutor de este grupo
    const grupoTutor = await query(
      `SELECT g.*, n.nombre as nivel_nombre, t.nombre as turno_nombre
       FROM grupos g
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN turnos t ON t.id = g.turno_id
       WHERE g.id = ? AND g.tutor_id = ? AND g.colegio_id = ? AND g.anio = ?`,
      [grupoId, personalId, colegio_id, anio_activo]
    );

    if (grupoTutor.length === 0) {
      return res.status(403).json({ error: 'No eres tutor de este grupo' });
    }

    const grupo = grupoTutor[0];

    // Obtener alumnos del grupo
    const alumnos = await query(
      `SELECT DISTINCT
              a.*, 
              m.id as matricula_id,
              m.fecha_registro, 
              m.estado as estado_matricula,
              a.fecha_nacimiento,
              COALESCE(
                (SELECT ap2.telefono_celular 
                 FROM familias f2 
                 INNER JOIN apoderados ap2 ON ap2.id = f2.apoderado_id 
                 WHERE f2.alumno_id = a.id 
                 AND ap2.telefono_celular IS NOT NULL 
                 AND ap2.telefono_celular != '' 
                 LIMIT 1),
                (SELECT ap3.telefono_fijo 
                 FROM familias f3 
                 INNER JOIN apoderados ap3 ON ap3.id = f3.apoderado_id 
                 WHERE f3.alumno_id = a.id 
                 AND ap3.telefono_fijo IS NOT NULL 
                 AND ap3.telefono_fijo != '' 
                 LIMIT 1),
                'N/A'
              ) as telefono
       FROM alumnos a
       INNER JOIN matriculas m ON m.alumno_id = a.id
       WHERE m.grupo_id = ? AND m.colegio_id = ? AND m.estado = 0
       ORDER BY a.apellido_paterno, a.apellido_materno, a.nombres`,
      [grupo.id, colegio_id]
    );

    // Construir URLs de fotos
    const alumnosConFotos = alumnos.map(alumno => {
      let fotoUrl = null;
      if (alumno.foto && alumno.foto !== '') {
        const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://nuevo.vanguardschools.edu.pe';
        const isProduction = process.env.NODE_ENV === 'production';
        if (isProduction) {
          fotoUrl = `${phpSystemUrl}/Static/Image/Fotos/${alumno.foto}`;
        } else {
          fotoUrl = `http://localhost:5000/Static/Image/Fotos/${alumno.foto}`;
        }
      }
      return { ...alumno, foto: fotoUrl };
    });

    res.json({
      grupo: grupo,
      alumnos: alumnosConFotos || []
    });
  } catch (error) {
    console.error('Error obteniendo alumnos del tutor:', error);
    res.status(500).json({ error: 'Error al obtener alumnos del tutor' });
  }
});

/**
 * GET /api/docente/roles-adicionales
 * Verificar roles adicionales del docente (apoderado y tutor)
 */
router.get('/roles-adicionales', async (req, res) => {
  try {
    const { colegio_id, anio_activo } = req.user;
    const personalId = req.user.personal_id;

    if (!personalId) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    // Verificar si es apoderado (tiene hijos estudiando en el colegio)
    // Buscar si el personal tiene un registro en apoderados y tiene hijos (familias)
    // Primero obtener el nro_documento del personal
    let tieneHijos = false;
    let hijos = [];
    
    try {
      const personalData = await query(
        `SELECT nro_documento FROM personal WHERE id = ? AND colegio_id = ? LIMIT 1`,
        [personalId, colegio_id]
      );

      if (personalData && personalData.length > 0 && personalData[0].nro_documento) {
        const nroDocumento = personalData[0].nro_documento;
        
        // Buscar si existe un apoderado con ese nro_documento que tenga hijos
        const esApoderado = await query(
          `SELECT COUNT(DISTINCT f.alumno_id) as total_hijos
           FROM apoderados ap
           INNER JOIN familias f ON f.apoderado_id = ap.id
           INNER JOIN alumnos a ON a.id = f.alumno_id
           INNER JOIN matriculas m ON m.alumno_id = a.id
           INNER JOIN grupos g ON g.id = m.grupo_id
           WHERE ap.colegio_id = ? 
             AND ap.nro_documento = ?
             AND m.colegio_id = ?
             AND (m.estado = 0 OR m.estado = 4)
             AND g.anio = ?`,
          [colegio_id, nroDocumento, colegio_id, anio_activo]
        );

        tieneHijos = (esApoderado[0]?.total_hijos || 0) > 0;
      }
    } catch (error) {
      console.error('Error verificando si es apoderado:', error);
      // Continuar sin fallar, simplemente no será apoderado
      tieneHijos = false;
    }

    // Obtener lista de hijos si es apoderado
    if (tieneHijos) {
      try {
        const personalData = await query(
          `SELECT nro_documento FROM personal WHERE id = ? AND colegio_id = ? LIMIT 1`,
          [personalId, colegio_id]
        );

        if (personalData && personalData.length > 0 && personalData[0].nro_documento) {
          const nroDocumento = personalData[0].nro_documento;
          
          hijos = await query(
            `SELECT DISTINCT
                    a.id,
                    a.nombres,
                    a.apellido_paterno,
                    a.apellido_materno,
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
             WHERE ap.colegio_id = ? 
               AND ap.nro_documento = ?
               AND m.colegio_id = ?
               AND (m.estado = 0 OR m.estado = 4)
               AND g.anio = ?
             ORDER BY n.nombre, g.grado, g.seccion, a.apellido_paterno, a.apellido_materno, a.nombres`,
            [colegio_id, nroDocumento, colegio_id, anio_activo]
          );
        }
      } catch (error) {
        console.error('Error obteniendo lista de hijos:', error);
        hijos = [];
      }
    }

    // Verificar si es tutor
    const gruposTutor = await query(
      `SELECT g.*, n.nombre as nivel_nombre, t.nombre as turno_nombre
       FROM grupos g
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN turnos t ON t.id = g.turno_id
       WHERE g.tutor_id = ? AND g.colegio_id = ? AND g.anio = ?`,
      [personalId, colegio_id, anio_activo]
    );

    const esTutor = gruposTutor.length > 0;

    res.json({
      es_apoderado: tieneHijos,
      es_tutor: esTutor,
      hijos: hijos || [],
      grupo_tutor: esTutor ? gruposTutor[0] : null
    });
  } catch (error) {
    console.error('Error verificando roles adicionales:', error);
    res.status(500).json({ error: 'Error al verificar roles adicionales' });
  }
});

/**
 * GET /api/docente/hijos/:hijoId/datos
 * Obtener datos completos de un hijo para editar
 */
router.get('/hijos/:hijoId/datos', authenticateToken, requireUserType(['DOCENTE']), async (req, res) => {
  try {
    const { hijoId } = req.params;
    const { colegio_id, usuario_id, personal_id } = req.user;

    // Verificar que el docente es apoderado del alumno
    const personalData = await query(
      `SELECT nro_documento FROM personal WHERE id = ? AND colegio_id = ? LIMIT 1`,
      [personal_id, colegio_id]
    );

    if (!personalData || personalData.length === 0 || !personalData[0].nro_documento) {
      return res.status(403).json({ error: 'No tienes permisos para ver estos datos' });
    }

    const nroDocumento = personalData[0].nro_documento;

    // Verificar que el alumno es hijo del docente
    const esHijo = await query(
      `SELECT COUNT(*) as count
       FROM apoderados ap
       INNER JOIN familias f ON f.apoderado_id = ap.id
       INNER JOIN alumnos a ON a.id = f.alumno_id
       WHERE ap.colegio_id = ?
         AND ap.nro_documento = ?
         AND a.id = ?
         AND a.colegio_id = ?`,
      [colegio_id, nroDocumento, hijoId, colegio_id]
    );

    if (!esHijo || esHijo.length === 0 || esHijo[0].count === 0) {
      return res.status(403).json({ error: 'No tienes permisos para ver estos datos' });
    }

    // Obtener datos del alumno
    const alumno = await query(
      `SELECT a.*, u.usuario as nro_documento
       FROM alumnos a
       LEFT JOIN usuarios u ON u.alumno_id = a.id AND u.colegio_id = a.colegio_id
       WHERE a.id = ? AND a.colegio_id = ?`,
      [hijoId, colegio_id]
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
    res.status(500).json({ error: 'Error al obtener datos del alumno' });
  }
});

/**
 * PUT /api/docente/hijos/:hijoId/datos
 * Actualizar datos de un hijo (solo si es apoderado)
 */
// Configurar multer para fotos de alumnos
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

const fileFilterAlumno = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  
  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Solo se permiten imágenes (JPEG, JPG, PNG, GIF, WEBP)'));
  }
};

const uploadAlumnoHijo = multer({
  storage: alumnoStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: fileFilterAlumno
});

router.put('/hijos/:hijoId/datos', authenticateToken, requireUserType(['DOCENTE']), uploadAlumnoHijo.single('foto'), async (req, res) => {
  try {
    const { hijoId } = req.params;
    const { colegio_id, personal_id } = req.user;
    const { nombres, apellido_paterno, apellido_materno, email, sexo, fecha_nacimiento } = req.body;

    // Verificar que el docente es apoderado del alumno
    const personalData = await query(
      `SELECT nro_documento FROM personal WHERE id = ? AND colegio_id = ? LIMIT 1`,
      [personal_id, colegio_id]
    );

    if (!personalData || personalData.length === 0 || !personalData[0].nro_documento) {
      return res.status(403).json({ error: 'No tienes permisos para editar estos datos' });
    }

    const nroDocumento = personalData[0].nro_documento;

    // Verificar que el alumno es hijo del docente
    const esHijo = await query(
      `SELECT COUNT(*) as count
       FROM apoderados ap
       INNER JOIN familias f ON f.apoderado_id = ap.id
       INNER JOIN alumnos a ON a.id = f.alumno_id
       WHERE ap.colegio_id = ?
         AND ap.nro_documento = ?
         AND a.id = ?
         AND a.colegio_id = ?`,
      [colegio_id, nroDocumento, hijoId, colegio_id]
    );

    if (!esHijo || esHijo.length === 0 || esHijo[0].count === 0) {
      return res.status(403).json({ error: 'No tienes permisos para editar estos datos' });
    }

    // Obtener alumno actual
    const alumno = await query(
      `SELECT * FROM alumnos WHERE id = ? AND colegio_id = ?`,
      [hijoId, colegio_id]
    );

    if (!alumno || alumno.length === 0) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }

    const alumnoData = alumno[0];
    let fotoPath = alumnoData.foto;

    // Si se subió una nueva foto
    if (req.file) {
      // Eliminar foto anterior si existe
      if (alumnoData.foto && alumnoData.foto !== '') {
        const oldFotoPath = `/home/vanguard/nuevo.vanguardschools.edu.pe/Static/Image/Fotos/${path.basename(alumnoData.foto)}`;
        if (fs.existsSync(oldFotoPath)) {
          fs.unlinkSync(oldFotoPath);
        }
      }
      
      // Guardar nueva foto - solo el nombre del archivo
      fotoPath = req.file.filename;
    }

    // Actualizar datos
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
        email || alumnoData.email || null,
        sexo !== undefined ? sexo : (alumnoData.sexo !== undefined ? alumnoData.sexo : null),
        fotoPath,
        fecha_nacimiento || alumnoData.fecha_nacimiento || null,
        hijoId,
        colegio_id
      ]
    );

    // Obtener datos actualizados
    const alumnoActualizado = await query(
      `SELECT a.*, u.usuario as nro_documento
       FROM alumnos a
       LEFT JOIN usuarios u ON u.alumno_id = a.id AND u.colegio_id = a.colegio_id
       WHERE a.id = ? AND a.colegio_id = ?`,
      [hijoId, colegio_id]
    );

    res.json({
      message: 'Datos actualizados correctamente',
      alumno: alumnoActualizado[0]
    });
  } catch (error) {
    console.error('Error actualizando datos del hijo:', error);
    res.status(500).json({ error: 'Error al actualizar datos del alumno' });
  }
});

/**
 * POST /api/docente/comunicados
 * Crear nuevo comunicado (solo ADMINISTRADOR puede crear)
 */
const uploadComunicado = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      // Guardar en Static/Archivos/ del sistema PHP (compartido)
      const uploadPath = '/home/vanguard/nuevo.vanguardschools.edu.pe/Static/Archivos';
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, `comunicado-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf|doc|docx|xls|xlsx|ppt|pptx|txt|zip|rar|jpg|jpeg|png|gif/i;
    if (allowedTypes.test(path.extname(file.originalname))) {
      return cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido'));
    }
  }
});

router.post('/comunicados', uploadComunicado.single('archivo'), async (req, res) => {
  try {
    const { usuario_id, colegio_id } = req.user;
    
    // Solo administradores pueden crear comunicados
    if (req.user.tipo !== 'ADMINISTRADOR') {
      return res.status(403).json({ error: 'Solo los administradores pueden crear comunicados' });
    }

    const { descripcion, contenido, tipo, privacidad, show_in_home } = req.body;

    if (!descripcion) {
      return res.status(400).json({ error: 'La descripción es requerida' });
    }

    let archivoPath = '';
    if (req.file) {
      // Guardar ruta como /Static/Archivos/ (compartido con sistema PHP)
      archivoPath = `/Static/Archivos/${req.file.filename}`;
    }

    const tipoComunicado = tipo || (archivoPath ? 'ARCHIVO' : 'TEXTO');
    const fechaHora = new Date().toISOString().slice(0, 19).replace('T', ' ');

    // Insertar comunicado
    const result = await execute(
      `INSERT INTO comunicados (colegio_id, descripcion, contenido, archivo, privacidad, fecha_hora, tipo, estado, show_in_home)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVO', ?)`,
      [colegio_id, descripcion, contenido || '', archivoPath, privacidad || '', fechaHora, tipoComunicado, show_in_home ? 1 : 0]
    );

    // Registrar auditoría
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: 'ADMINISTRADOR',
      accion: 'CREAR',
      modulo: 'COMUNICADOS',
      entidad: 'comunicado',
      entidad_id: result.insertId,
      descripcion: `Creó comunicado: ${descripcion}`,
      url: req.originalUrl,
      metodo_http: 'POST',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_nuevos: JSON.stringify({ descripcion, contenido, tipo: tipoComunicado, archivo: archivoPath }),
      resultado: 'EXITOSO'
    }).catch(err => console.error('Error registrando comunicado:', err));

    req.skipAudit = true;

    res.json({
      success: true,
      message: 'Comunicado creado correctamente',
      comunicado: {
        id: result.insertId,
        descripcion,
        contenido,
        archivo: archivoPath,
        tipo: tipoComunicado,
        fecha_hora: fechaHora
      }
    });
  } catch (error) {
    console.error('Error creando comunicado:', error);
    res.status(500).json({ error: 'Error al crear comunicado' });
  }
});

/**
 * PUT /api/docente/comunicados/:id
 * Actualizar comunicado (solo ADMINISTRADOR)
 */
router.put('/comunicados/:id', uploadComunicado.single('archivo'), async (req, res) => {
  try {
    const { usuario_id, colegio_id } = req.user;
    
    if (req.user.tipo !== 'ADMINISTRADOR') {
      return res.status(403).json({ error: 'Solo los administradores pueden editar comunicados' });
    }

    const { id } = req.params;
    const { descripcion, contenido, tipo, privacidad, show_in_home } = req.body;

    // Verificar que el comunicado existe
    const comunicados = await query(
      `SELECT * FROM comunicados WHERE id = ? AND colegio_id = ?`,
      [id, colegio_id]
    );

    if (comunicados.length === 0) {
      return res.status(404).json({ error: 'Comunicado no encontrado' });
    }

    let archivoPath = comunicados[0].archivo || '';
    if (req.file) {
      archivoPath = `/Static/Archivos/${req.file.filename}`;
    }

    const tipoComunicado = tipo || (archivoPath ? 'ARCHIVO' : 'TEXTO');

    // Actualizar comunicado
    await execute(
      `UPDATE comunicados 
       SET descripcion = ?, contenido = ?, archivo = ?, privacidad = ?, tipo = ?, show_in_home = ?
       WHERE id = ? AND colegio_id = ?`,
      [descripcion, contenido || '', archivoPath, privacidad || '', tipoComunicado, show_in_home ? 1 : 0, id, colegio_id]
    );

    // Registrar auditoría
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: 'ADMINISTRADOR',
      accion: 'ACTUALIZAR',
      modulo: 'COMUNICADOS',
      entidad: 'comunicado',
      entidad_id: parseInt(id),
      descripcion: `Actualizó comunicado: ${descripcion}`,
      url: req.originalUrl,
      metodo_http: 'PUT',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(comunicados[0]),
      datos_nuevos: JSON.stringify({ descripcion, contenido, tipo: tipoComunicado, archivo: archivoPath }),
      resultado: 'EXITOSO'
    }).catch(err => console.error('Error registrando comunicado:', err));

    req.skipAudit = true;

    res.json({
      success: true,
      message: 'Comunicado actualizado correctamente'
    });
  } catch (error) {
    console.error('Error actualizando comunicado:', error);
    res.status(500).json({ error: 'Error al actualizar comunicado' });
  }
});

/**
 * DELETE /api/docente/comunicados/:id
 * Eliminar comunicado (solo ADMINISTRADOR)
 */
router.delete('/comunicados/:id', async (req, res) => {
  try {
    const { usuario_id, colegio_id } = req.user;
    
    if (req.user.tipo !== 'ADMINISTRADOR') {
      return res.status(403).json({ error: 'Solo los administradores pueden eliminar comunicados' });
    }

    const { id } = req.params;

    // Verificar que el comunicado existe
    const comunicados = await query(
      `SELECT * FROM comunicados WHERE id = ? AND colegio_id = ?`,
      [id, colegio_id]
    );

    if (comunicados.length === 0) {
      return res.status(404).json({ error: 'Comunicado no encontrado' });
    }

    // Eliminar comunicado
    await execute(
      `DELETE FROM comunicados WHERE id = ? AND colegio_id = ?`,
      [id, colegio_id]
    );

    // Registrar auditoría
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: 'ADMINISTRADOR',
      accion: 'ELIMINAR',
      modulo: 'COMUNICADOS',
      entidad: 'comunicado',
      entidad_id: parseInt(id),
      descripcion: `Eliminó comunicado: ${comunicados[0].descripcion}`,
      url: req.originalUrl,
      metodo_http: 'DELETE',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(comunicados[0]),
      datos_nuevos: null,
      resultado: 'EXITOSO'
    }).catch(err => console.error('Error registrando comunicado:', err));

    req.skipAudit = true;

    res.json({
      success: true,
      message: 'Comunicado eliminado correctamente'
    });
  } catch (error) {
    console.error('Error eliminando comunicado:', error);
    res.status(500).json({ error: 'Error al eliminar comunicado' });
  }
});

/**
 * GET /api/docente/comunicados
 * Obtener comunicados (solo lectura, generados por admin)
 */
router.get('/comunicados', async (req, res) => {
  try {
    const { colegio_id, anio_activo, tipo } = req.user;
    const { page = 1, limit = 12, search = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Construir query base
    // - Todos los usuarios (excepto admin): mostrar activos e inactivos del año activo
    // - Administrador: mostrar todos los años (activos e inactivos)
    let querySql = `
      SELECT c.*
       FROM comunicados c
       WHERE c.colegio_id = ?
    `;
    const params = [colegio_id];

    // Si NO es administrador, filtrar por año activo
    if (tipo !== 'ADMINISTRADOR') {
      querySql += ` AND YEAR(c.fecha_hora) = ?`;
      params.push(anio_activo);
    }
    // Nota: No filtramos por estado, mostramos activos e inactivos

    // Agregar búsqueda si existe
    if (search && search.trim() !== '') {
      querySql += ` AND (c.descripcion LIKE ? OR c.contenido LIKE ?)`;
      const searchPattern = `%${search.trim()}%`;
      params.push(searchPattern, searchPattern);
    }

    // Obtener total para paginación
    const countQuery = querySql.replace('SELECT c.*', 'SELECT COUNT(*) as total');
    const countResult = await query(countQuery, params);
    const total = countResult[0]?.total || 0;

    // Agregar ordenamiento y límites
    querySql += ` ORDER BY c.fecha_hora DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);

    const comunicados = await query(querySql, params);

    // Construir URLs de archivos
    // IMPORTANTE: Los comunicados pueden venir de dos sistemas:
    // 1. Sistema PHP anterior: archivos en /Static/Archivos/
    // 2. Sistema nuevo (React/Node.js): archivos en /uploads/comunicados/
    // El backend detecta automáticamente el origen y construye la URL correcta
    const fs = require('fs');
    const path = require('path');
    const staticArchivosPath = '/home/vanguard/nuevo.vanguardschools.edu.pe/Static/Archivos';
    
    const comunicadosConUrls = (comunicados || []).map(com => {
      let archivoUrl = null;
      let archivoExiste = false;
      
      if (com.archivo && com.archivo.trim() !== '') {
        let nombreArchivo = com.archivo.trim();
        const isProduction = process.env.NODE_ENV === 'production';
        
        // DETECTAR ORIGEN DEL ARCHIVO:
        // Si empieza con /uploads/comunicados/ → Es del sistema nuevo (React/Node.js)
        const esSistemaNuevo = nombreArchivo.startsWith('/uploads/comunicados/') || 
                               nombreArchivo.startsWith('uploads/comunicados/');
        
        if (esSistemaNuevo) {
          // SISTEMA NUEVO: Archivo en /uploads/comunicados/
          // Construir URL desde el servidor Node.js
          if (nombreArchivo.startsWith('/uploads/')) {
            // Ya tiene la ruta completa relativa
            if (isProduction) {
              // En producción, usar el mismo dominio del backend
              archivoUrl = `https://nuevo.vanguardschools.edu.pe${nombreArchivo}`;
            } else {
              // En desarrollo, usar localhost:5000
              archivoUrl = `http://localhost:5000${nombreArchivo}`;
            }
          } else {
            // Agregar la barra inicial si falta
            archivoUrl = isProduction
              ? `https://nuevo.vanguardschools.edu.pe/${nombreArchivo}`
              : `http://localhost:5000/${nombreArchivo}`;
          }
          // Para sistema nuevo, verificar en backend/uploads/comunicados/
          const uploadsPath = path.join(__dirname, '../../uploads/comunicados', nombreArchivo.replace(/^\/?uploads\/comunicados\//, ''));
          archivoExiste = fs.existsSync(uploadsPath);
          console.log(`📄 Comunicado ID ${com.id} (SISTEMA NUEVO): ${com.archivo} -> ${archivoUrl} ${archivoExiste ? '✅' : '❌ NO EXISTE'}`);
        } else {
          // SISTEMA ANTERIOR (PHP): Archivo en /Static/Archivos/
          // Usar el subdominio correcto: nuevo.vanguardschools.edu.pe
          const dominioBase = 'https://nuevo.vanguardschools.edu.pe';
          
          // Extraer solo el nombre del archivo para verificar existencia
          let nombreArchivoLimpio = nombreArchivo;
          if (nombreArchivo.startsWith('http://') || nombreArchivo.startsWith('https://')) {
            // Extraer nombre del archivo de la URL
            nombreArchivoLimpio = nombreArchivo.split('/').pop();
          } else if (nombreArchivo.startsWith('/Static/Archivos/')) {
            nombreArchivoLimpio = nombreArchivo.replace('/Static/Archivos/', '');
          } else if (nombreArchivo.startsWith('Static/Archivos/')) {
            nombreArchivoLimpio = nombreArchivo.replace('Static/Archivos/', '');
          } else if (nombreArchivo.startsWith('/Static/')) {
            nombreArchivoLimpio = nombreArchivo.replace('/Static/', '');
          } else if (nombreArchivo.startsWith('Static/')) {
            nombreArchivoLimpio = nombreArchivo.replace('Static/', '');
          }
          nombreArchivoLimpio = nombreArchivoLimpio.replace(/^\/+/, '');
          
          // Si ya es una URL completa, validar y corregir si es necesario
          if (nombreArchivo.startsWith('http://') || nombreArchivo.startsWith('https://')) {
            // Corregir errores comunes en URLs existentes
            archivoUrl = nombreArchivo
              .replace(/https?:\/\/(www\.)?vanguardschools\.edu\.pe/gi, dominioBase)
              .replace(/vanguardschools\.comstatic/gi, `${dominioBase}/Static`)
              .replace(/vanguardschools\.com\/static/gi, `${dominioBase}/Static`)
              .replace(/vanguardschools\.com\/Static/gi, `${dominioBase}/Static`)
              .replace(/([^:]\/)\/+/g, '$1'); // Limpiar múltiples barras
          }
          // Si empieza con /Static/, construir URL completa
          else if (nombreArchivo.startsWith('/Static/')) {
            archivoUrl = `${dominioBase}${nombreArchivo}`;
          }
          // Si empieza con Static/ (sin barra inicial), agregar la barra
          else if (nombreArchivo.startsWith('Static/')) {
            archivoUrl = `${dominioBase}/${nombreArchivo}`;
          }
          // Si es solo el nombre del archivo, construir ruta completa
          else {
            // Limpiar barras iniciales y construir URL correcta
            nombreArchivo = nombreArchivo.replace(/^\/+/, '');
            archivoUrl = `${dominioBase}/Static/Archivos/${nombreArchivo}`;
          }
          
          // Verificar si el archivo existe físicamente (solo para logging, no para bloquear)
          const archivoPath = path.join(staticArchivosPath, nombreArchivoLimpio);
          archivoExiste = fs.existsSync(archivoPath);
          
          // Siempre devolver la URL aunque el archivo no exista físicamente
          // (el archivo puede estar en otra ubicación o el sistema PHP puede manejarlo)
          console.log(`📄 Comunicado ID ${com.id} (SISTEMA ANTERIOR): ${com.archivo} -> ${archivoUrl} ${archivoExiste ? '✅' : '⚠️ NO VERIFICADO (archivo: ${nombreArchivoLimpio})'}`);
        }
      }

      return {
        ...com,
        archivo_url: archivoUrl, // Siempre devolver la URL (el sistema PHP puede manejarla aunque no exista físicamente)
        archivo_existe: archivoExiste // Información adicional para debugging
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
 * POST /api/docente/actividades
 * Crear nueva actividad (solo ADMINISTRADOR puede crear)
 */
router.post('/actividades', async (req, res) => {
  try {
    const { usuario_id, colegio_id } = req.user;
    
    // Solo administradores pueden crear actividades
    if (req.user.tipo !== 'ADMINISTRADOR') {
      return res.status(403).json({ error: 'Solo los administradores pueden crear actividades' });
    }

    const { descripcion, lugar, detalles, fecha_inicio, fecha_fin } = req.body;

    if (!descripcion || !fecha_inicio) {
      return res.status(400).json({ error: 'Descripción y fecha de inicio son requeridas' });
    }

    // Las fechas vienen en formato "YYYY-MM-DD HH:mm:ss" (hora local)
    // Usarlas directamente sin conversión UTC para preservar la hora local
    let fechaInicioStr = fecha_inicio;
    let fechaFinStr = fecha_fin || fecha_inicio;

    // Validar formato de fecha (debe ser "YYYY-MM-DD HH:mm:ss")
    const fechaRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
    if (!fechaRegex.test(fechaInicioStr)) {
      return res.status(400).json({ error: 'Formato de fecha de inicio inválido. Debe ser YYYY-MM-DD HH:mm:ss' });
    }
    if (fechaFinStr && !fechaRegex.test(fechaFinStr)) {
      return res.status(400).json({ error: 'Formato de fecha de fin inválido. Debe ser YYYY-MM-DD HH:mm:ss' });
    }

    // Validar que las fechas sean lógicas
    const fechaInicioObj = new Date(fechaInicioStr.replace(' ', 'T'));
    const fechaFinObj = new Date(fechaFinStr.replace(' ', 'T'));

    if (isNaN(fechaInicioObj.getTime())) {
      return res.status(400).json({ error: 'Fecha de inicio inválida' });
    }

    if (fechaFinObj < fechaInicioObj) {
      return res.status(400).json({ error: 'La fecha de fin no puede ser anterior a la fecha de inicio' });
    }

    // Insertar actividad
    const result = await execute(
      `INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [colegio_id, descripcion, lugar || '', detalles || '', fechaInicioStr, fechaFinStr, usuario_id]
    );

    // Registrar auditoría
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: 'ADMINISTRADOR',
      accion: 'CREAR',
      modulo: 'ACTIVIDADES',
      entidad: 'actividad',
      entidad_id: result.insertId,
      descripcion: `Creó actividad: ${descripcion}`,
      url: req.originalUrl,
      metodo_http: 'POST',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_nuevos: JSON.stringify({ descripcion, lugar, detalles, fecha_inicio, fecha_fin }),
      resultado: 'EXITOSO'
    }).catch(err => console.error('Error registrando actividad:', err));

    req.skipAudit = true;

    res.json({
      success: true,
      message: 'Actividad creada correctamente',
      actividad: {
        id: result.insertId,
        descripcion,
        lugar,
        detalles,
        fecha_inicio: fechaInicioStr,
        fecha_fin: fechaFinStr
      }
    });
  } catch (error) {
    console.error('Error creando actividad:', error);
    res.status(500).json({ error: 'Error al crear actividad' });
  }
});

/**
 * PUT /api/docente/actividades/:id
 * Actualizar actividad (solo ADMINISTRADOR)
 */
router.put('/actividades/:id', async (req, res) => {
  try {
    const { usuario_id, colegio_id } = req.user;
    
    if (req.user.tipo !== 'ADMINISTRADOR') {
      return res.status(403).json({ error: 'Solo los administradores pueden editar actividades' });
    }

    const { id } = req.params;
    const { descripcion, lugar, detalles, fecha_inicio, fecha_fin } = req.body;

    if (!descripcion || !fecha_inicio) {
      return res.status(400).json({ error: 'Descripción y fecha de inicio son requeridas' });
    }

    // Verificar que la actividad existe y pertenece al colegio
    const actividades = await query(
      `SELECT * FROM actividades WHERE id = ? AND colegio_id = ?`,
      [id, colegio_id]
    );

    if (actividades.length === 0) {
      return res.status(404).json({ error: 'Actividad no encontrada' });
    }

    // Las fechas vienen en formato "YYYY-MM-DD HH:mm:ss" (hora local)
    // Usarlas directamente sin conversión UTC para preservar la hora local
    let fechaInicioStr = fecha_inicio;
    let fechaFinStr = fecha_fin || fecha_inicio;

    // Validar formato de fecha (debe ser "YYYY-MM-DD HH:mm:ss")
    const fechaRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
    if (!fechaRegex.test(fechaInicioStr)) {
      return res.status(400).json({ error: 'Formato de fecha de inicio inválido. Debe ser YYYY-MM-DD HH:mm:ss' });
    }
    if (fechaFinStr && !fechaRegex.test(fechaFinStr)) {
      return res.status(400).json({ error: 'Formato de fecha de fin inválido. Debe ser YYYY-MM-DD HH:mm:ss' });
    }

    // Validar que las fechas sean lógicas
    const fechaInicioObj = new Date(fechaInicioStr.replace(' ', 'T'));
    const fechaFinObj = new Date(fechaFinStr.replace(' ', 'T'));

    if (isNaN(fechaInicioObj.getTime())) {
      return res.status(400).json({ error: 'Fecha de inicio inválida' });
    }

    if (fechaFinObj < fechaInicioObj) {
      return res.status(400).json({ error: 'La fecha de fin no puede ser anterior a la fecha de inicio' });
    }

    // Actualizar actividad
    await execute(
      `UPDATE actividades 
       SET descripcion = ?, lugar = ?, detalles = ?, fecha_inicio = ?, fecha_fin = ?
       WHERE id = ? AND colegio_id = ?`,
      [descripcion, lugar || '', detalles || '', fechaInicioStr, fechaFinStr, id, colegio_id]
    );

    // Registrar auditoría
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: 'ADMINISTRADOR',
      accion: 'ACTUALIZAR',
      modulo: 'ACTIVIDADES',
      entidad: 'actividad',
      entidad_id: parseInt(id),
      descripcion: `Actualizó actividad: ${descripcion}`,
      url: req.originalUrl,
      metodo_http: 'PUT',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(actividades[0]),
      datos_nuevos: JSON.stringify({ descripcion, lugar, detalles, fecha_inicio, fecha_fin }),
      resultado: 'EXITOSO'
    }).catch(err => console.error('Error registrando actividad:', err));

    req.skipAudit = true;

    res.json({
      success: true,
      message: 'Actividad actualizada correctamente'
    });
  } catch (error) {
    console.error('Error actualizando actividad:', error);
    res.status(500).json({ error: 'Error al actualizar actividad' });
  }
});

/**
 * DELETE /api/docente/actividades/:id
 * Eliminar actividad (solo ADMINISTRADOR)
 */
router.delete('/actividades/:id', async (req, res) => {
  try {
    const { usuario_id, colegio_id } = req.user;
    
    if (req.user.tipo !== 'ADMINISTRADOR') {
      return res.status(403).json({ error: 'Solo los administradores pueden eliminar actividades' });
    }

    const { id } = req.params;

    // Verificar que la actividad existe
    const actividades = await query(
      `SELECT * FROM actividades WHERE id = ? AND colegio_id = ?`,
      [id, colegio_id]
    );

    if (actividades.length === 0) {
      return res.status(404).json({ error: 'Actividad no encontrada' });
    }

    // Eliminar actividad
    await execute(
      `DELETE FROM actividades WHERE id = ? AND colegio_id = ?`,
      [id, colegio_id]
    );

    // Registrar auditoría
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: 'ADMINISTRADOR',
      accion: 'ELIMINAR',
      modulo: 'ACTIVIDADES',
      entidad: 'actividad',
      entidad_id: parseInt(id),
      descripcion: `Eliminó actividad: ${actividades[0].descripcion}`,
      url: req.originalUrl,
      metodo_http: 'DELETE',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(actividades[0]),
      datos_nuevos: null,
      resultado: 'EXITOSO'
    }).catch(err => console.error('Error registrando actividad:', err));

    req.skipAudit = true;

    res.json({
      success: true,
      message: 'Actividad eliminada correctamente'
    });
  } catch (error) {
    console.error('Error eliminando actividad:', error);
    res.status(500).json({ error: 'Error al eliminar actividad' });
  }
});

/**
 * GET /api/docente/actividades
 * Obtener actividades del calendario (solo lectura)
 * IMPORTANTE: Para el menú Actividades, muestra TODAS las actividades del año actual (pasadas y futuras)
 * Para el CalendarioWidget, puede mostrar todas sin restricción si no se pasa parámetro de año
 */
router.get('/actividades', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const { fecha, mes, anio } = req.query;

    // Si no se especifica año, usar año actual (para el menú Actividades)
    // Si se especifica año, usar ese año (para el calendario que puede navegar entre años)
    const añoFiltro = anio ? parseInt(anio) : new Date().getFullYear();

    let querySql = `
      SELECT a.*
      FROM actividades a
      WHERE a.colegio_id = ?
        AND YEAR(a.fecha_inicio) = ?
    `;
    const params = [colegio_id, añoFiltro];

    // Si se pasa mes (1-12), filtrar por ese mes
    if (mes) {
      const mesNum = parseInt(mes);
      if (mesNum >= 1 && mesNum <= 12) {
        querySql += ` AND MONTH(a.fecha_inicio) = ?`;
        params.push(mesNum);
      }
    }

    // Si se pasa fecha, filtrar solo las que incluyen ese día en su rango
    if (fecha) {
      // Filtrar actividades que incluyen esta fecha en su rango
      // La fecha puede estar entre fecha_inicio y fecha_fin
      querySql += ` AND DATE(?) BETWEEN DATE(a.fecha_inicio) AND COALESCE(DATE(a.fecha_fin), DATE(a.fecha_inicio))`;
      params.push(fecha);
    }

    querySql += ` ORDER BY a.fecha_inicio ASC, a.fecha_fin ASC`;

    const actividades = await query(querySql, params);

    console.log(`📅 Actividades del año ${añoFiltro}${mes ? `, mes ${mes}` : ''}:`, actividades.length);

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
 * GET /api/docente/mensajes/recibidos
 * Obtener mensajes recibidos con información completa del remitente
 */
router.get('/mensajes/recibidos', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo } = req.user;
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Obtener año del query si existe, sino mostrar todos
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
    
    // Agregar filtro por año solo si se especifica
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
      // Construir URLs completas para los archivos
        // IMPORTANTE: Los archivos se guardan en Static/Archivos/ (compartido con sistema PHP)
        // Se sirven desde Apache mediante el Alias /Static
      mensaje.archivos = (archivos || []).map(archivo => {
        // Construir URL completa usando PHP_SYSTEM_URL para que se sirva desde el sistema PHP compartido
        let archivoUrl;
        if (isProduction) {
          archivoUrl = `${phpSystemUrl}/Static/Archivos/${archivo.archivo}`;
        } else {
          archivoUrl = `http://localhost:5000/Static/Archivos/${archivo.archivo}`;
        }
        return {
          ...archivo,
          archivo_url: archivoUrl // URL completa
        };
      });
    }

    // Contar total con mismo filtro de año
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
 * GET /api/docente/mensajes/enviados
 * Obtener mensajes enviados con información completa del destinatario
 */
router.get('/mensajes/enviados', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo } = req.user;
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Obtener año del query si existe, sino mostrar todos
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
    
    // Agregar filtro por año solo si se especifica
    if (anioFiltro) {
      querySQL += ` AND YEAR(m.fecha_hora) = ?`;
      queryParams.push(anioFiltro);
    }
    
    querySQL += ` ORDER BY m.fecha_hora DESC LIMIT ? OFFSET ?`;
    queryParams.push(parseInt(limit), offset);
    
    const mensajes = await query(querySQL, queryParams);

    // Obtener archivos adjuntos para cada mensaje
    for (const mensaje of mensajes) {
      const archivos = await query(
        `SELECT id, nombre_archivo, archivo
         FROM mensajes_archivos
         WHERE mensaje_id = ?`,
        [mensaje.id]
      );
      // Construir URLs completas para los archivos
        // IMPORTANTE: Los archivos se guardan en Static/Archivos/ (compartido con sistema PHP)
        // Se sirven desde Apache mediante el Alias /Static
      const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://nuevo.vanguardschools.edu.pe';
      const isProduction = process.env.NODE_ENV === 'production';
      
      mensaje.archivos = (archivos || []).map(archivo => {
        // Construir URL completa usando PHP_SYSTEM_URL para que se sirva desde el sistema PHP compartido
        let archivoUrl;
        if (isProduction) {
          archivoUrl = `${phpSystemUrl}/Static/Archivos/${archivo.archivo}`;
        } else {
          archivoUrl = `http://localhost:5000/Static/Archivos/${archivo.archivo}`;
        }
        return {
          ...archivo,
          archivo_url: archivoUrl // URL completa
        };
      });
      // Debug: verificar archivos para mensajes enviados
      if (archivos && archivos.length > 0) {
        console.log(`📎 [MENSAJES ENVIADOS] Mensaje ID ${mensaje.id} (asunto: "${mensaje.asunto}") tiene ${archivos.length} archivo(s):`, archivos.map(a => a.nombre_archivo || a.archivo));
      } else {
        console.log(`⚠️ [MENSAJES ENVIADOS] Mensaje ID ${mensaje.id} (asunto: "${mensaje.asunto}") NO tiene archivos`);
      }
    }

    // Contar total con mismo filtro de año
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
 * GET /api/docente/mensajes/buscar-destinatarios
 * Buscar destinatarios (alumnos, apoderados, grupos, personal) con búsqueda automática
 */
router.get('/mensajes/buscar-destinatarios', async (req, res) => {
  try {
    const { colegio_id, anio_activo } = req.user;
    const { q = '' } = req.query;

    if (!q || q.trim().length < 2) {
      return res.json({ resultados: [] });
    }

    const searchTerm = `%${q.trim()}%`;
    const resultados = [];

    // Buscar alumnos (del año activo)
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
         AND m.estado = 0
         AND (
           a.nombres LIKE ? OR
           a.apellido_paterno LIKE ? OR
           a.apellido_materno LIKE ? OR
           CONCAT(a.nombres, ' ', a.apellido_paterno, ' ', a.apellido_materno) LIKE ?
         )
       LIMIT 20`,
      [colegio_id, anio_activo, searchTerm, searchTerm, searchTerm, searchTerm]
    );

    alumnos.forEach(al => {
      resultados.push({
        usuario_id: al.usuario_id,
        nombre_completo: al.nombre_completo.trim(),
        tipo: al.tipo,
        info_adicional: al.info_adicional,
        foto: al.foto
      });
    });

    // Buscar apoderados
    const apoderados = await query(
      `SELECT DISTINCT u.id as usuario_id,
              CONCAT(ap.nombres, ' ', ap.apellido_paterno, ' ', ap.apellido_materno) as nombre_completo,
              'APODERADO' as tipo,
              CONCAT('Padre/Madre de: ', a.nombres, ' ', a.apellido_paterno) as info_adicional,
              '' as foto
       FROM apoderados ap
       INNER JOIN usuarios u ON u.apoderado_id = ap.id AND u.estado = 'ACTIVO'
       INNER JOIN familias f ON f.apoderado_id = ap.id
       INNER JOIN alumnos a ON a.id = f.alumno_id
       WHERE ap.colegio_id = ?
         AND (
           ap.nombres LIKE ? OR
           ap.apellido_paterno LIKE ? OR
           ap.apellido_materno LIKE ? OR
           CONCAT(ap.nombres, ' ', ap.apellido_paterno, ' ', ap.apellido_materno) LIKE ?
         )
       LIMIT 20`,
      [colegio_id, searchTerm, searchTerm, searchTerm, searchTerm]
    );

    apoderados.forEach(ap => {
      resultados.push({
        usuario_id: ap.usuario_id,
        nombre_completo: ap.nombre_completo.trim(),
        tipo: ap.tipo,
        info_adicional: ap.info_adicional,
        foto: ap.foto
      });
    });

    // Buscar personal/docentes
    const personal = await query(
      `SELECT DISTINCT u.id as usuario_id,
              CONCAT(p.nombres, ' ', p.apellidos) as nombre_completo,
              'PERSONAL' as tipo,
              'Docente/Personal' as info_adicional,
              p.foto
       FROM personal p
       INNER JOIN usuarios u ON u.personal_id = p.id AND u.estado = 'ACTIVO'
       WHERE p.colegio_id = ?
         AND (
           p.nombres LIKE ? OR
           p.apellidos LIKE ? OR
           CONCAT(p.nombres, ' ', p.apellidos) LIKE ?
         )
       LIMIT 20`,
      [colegio_id, searchTerm, searchTerm, searchTerm]
    );

    personal.forEach(p => {
      resultados.push({
        usuario_id: p.usuario_id,
        nombre_completo: p.nombre_completo.trim(),
        tipo: p.tipo,
        info_adicional: p.info_adicional,
        foto: p.foto
      });
    });

    // Buscar grupos (para enviar a todos los alumnos del grupo)
    const grupos = await query(
      `SELECT g.id as grupo_id,
              CONCAT(g.grado, '° ', g.seccion, ' - ', n.nombre) as nombre_completo,
              'GRUPO' as tipo,
              CONCAT(COUNT(DISTINCT m.alumno_id), ' alumnos') as info_adicional,
              '' as foto
       FROM grupos g
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN matriculas m ON m.grupo_id = g.id AND m.estado = 0
       WHERE g.colegio_id = ?
         AND g.anio = ?
         AND (
           CONCAT(g.grado, '° ', g.seccion) LIKE ? OR
           n.nombre LIKE ?
         )
       GROUP BY g.id, g.grado, g.seccion, n.nombre
       LIMIT 10`,
      [colegio_id, anio_activo, searchTerm, searchTerm]
    );

    grupos.forEach(g => {
      resultados.push({
        grupo_id: g.grupo_id,
        nombre_completo: String(g.nombre_completo || ''),
        tipo: String(g.tipo || 'GRUPO'),
        info_adicional: String(g.info_adicional || '0 alumnos'),
        foto: String(g.foto || '')
      });
    });

    res.json({ resultados: resultados.slice(0, 50) });
  } catch (error) {
    console.error('Error buscando destinatarios:', error);
    res.status(500).json({ error: 'Error al buscar destinatarios' });
  }
});

/**
 * GET /api/docente/mensajes/alumno/:alumnoId/usuario
 * Obtener usuario_id asociado a un alumnoId para envío de mensajes
 */
router.get('/mensajes/alumno/:alumnoId/usuario', async (req, res) => {
  try {
    const { alumnoId } = req.params;
    const { colegio_id } = req.user;

    if (!alumnoId) {
      return res.status(400).json({ error: 'ID de alumno es requerido' });
    }

    // Obtener usuario_id del alumno
    const usuario = await query(
      `SELECT u.id as usuario_id,
              CONCAT(a.nombres, ' ', a.apellido_paterno, ' ', a.apellido_materno) as nombre_completo,
              a.id as alumno_id
       FROM alumnos a
       INNER JOIN usuarios u ON u.alumno_id = a.id AND u.estado = 'ACTIVO'
       WHERE a.id = ? AND a.colegio_id = ?`,
      [alumnoId, colegio_id]
    );

    if (!usuario || usuario.length === 0) {
      return res.status(404).json({ error: 'Alumno no encontrado o sin usuario activo' });
    }

    res.json({ usuario: usuario[0] });
  } catch (error) {
    console.error('Error obteniendo usuario del alumno:', error);
    res.status(500).json({ error: 'Error al obtener usuario del alumno' });
  }
});

/**
 * POST /api/docente/mensajes/subir-imagen
 * Subir imagen desde el editor de texto enriquecido
 */
router.post('/mensajes/subir-imagen', uploadMensajes.single('imagen'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se proporcionó ninguna imagen' });
    }

    // Construir URL completa usando PHP_SYSTEM_URL para que la imagen se sirva desde el sistema PHP compartido
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
 * POST /api/docente/mensajes/enviar
 * Enviar mensaje (soporta múltiples destinatarios y grupos, archivos adjuntos y texto enriquecido)
 */
router.post('/mensajes/enviar', uploadMensajes.array('archivos', 10), async (req, res) => {
  try {
    console.log('📨 [ENVIAR MENSAJE] Inicio de procesamiento -', new Date().toISOString());
    const { usuario_id, colegio_id } = req.user;
    const { destinatarios, grupos, asunto, mensaje } = req.body;

    // Parsear destinatarios y grupos si vienen como string JSON
    const destinatariosArray = typeof destinatarios === 'string' ? JSON.parse(destinatarios) : destinatarios;
    const gruposArray = typeof grupos === 'string' ? JSON.parse(grupos) : grupos;

    if ((!destinatariosArray || destinatariosArray.length === 0) && (!gruposArray || gruposArray.length === 0)) {
      return res.status(400).json({ error: 'Debe seleccionar al menos un destinatario o grupo' });
    }

    if (!asunto || !mensaje) {
      return res.status(400).json({ error: 'Asunto y mensaje son requeridos' });
    }

    // Responder inmediatamente al cliente
    res.json({
      success: true,
      message: 'Mensaje Enviado',
      procesando: false
    });

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    // Continuar el procesamiento en segundo plano
    setImmediate(async () => {
      try {
        // Obtener todos los usuarios destinatarios
        const usuariosDestinatarios = [];

        // Agregar destinatarios directos
        if (destinatariosArray && destinatariosArray.length > 0) {
          usuariosDestinatarios.push(...destinatariosArray);
        }

        // Si hay grupos, obtener todos los alumnos de esos grupos
        let totalAlumnosGrupos = 0;
        if (gruposArray && gruposArray.length > 0) {
          const alumnosGrupos = await query(
            `SELECT DISTINCT u.id as usuario_id
             FROM grupos g
             INNER JOIN matriculas m ON m.grupo_id = g.id AND m.estado = 0
             INNER JOIN alumnos a ON a.id = m.alumno_id
             INNER JOIN usuarios u ON u.alumno_id = a.id AND u.estado = 'ACTIVO'
             WHERE g.id IN (${gruposArray.map(() => '?').join(',')})
               AND g.colegio_id = ?`,
            [...gruposArray, colegio_id]
          );

          totalAlumnosGrupos = alumnosGrupos.length;
          alumnosGrupos.forEach(al => {
            if (!usuariosDestinatarios.includes(al.usuario_id)) {
              usuariosDestinatarios.push(al.usuario_id);
            }
          });
        }

        // Crear un mensaje para cada destinatario
        const fechaHora = new Date().toISOString().slice(0, 19).replace('T', ' ');
        let mensajesInsertados = 0;
        const mensajesIds = []; // Para asociar archivos

        // Insertar mensajes en la base de datos
        console.log(`📨 [ENVIAR MENSAJE] Procesando ${usuariosDestinatarios.length} destinatario(s)`);
        for (const destinatarioId of usuariosDestinatarios) {
          try {
            // Mensaje para el remitente (tipo ENVIADO)
            const resultEnviado = await execute(
              `INSERT INTO mensajes (remitente_id, destinatario_id, asunto, mensaje, fecha_hora, estado, tipo, borrado, favorito)
               VALUES (?, ?, ?, ?, ?, 'NO_LEIDO', 'ENVIADO', 'NO', 'NO')`,
              [usuario_id, destinatarioId, asunto, mensaje, fechaHora]
            );
            console.log(`📨 [ENVIAR MENSAJE] Mensaje ENVIADO creado - ID: ${resultEnviado.insertId}, destinatario: ${destinatarioId}`);

            // Mensaje para el destinatario (tipo RECIBIDO)
            const resultRecibido = await execute(
              `INSERT INTO mensajes (remitente_id, destinatario_id, asunto, mensaje, fecha_hora, estado, tipo, borrado, favorito)
               VALUES (?, ?, ?, ?, ?, 'NO_LEIDO', 'RECIBIDO', 'NO', 'NO')`,
              [usuario_id, destinatarioId, asunto, mensaje, fechaHora]
            );
            console.log(`📨 [ENVIAR MENSAJE] Mensaje RECIBIDO creado - ID: ${resultRecibido.insertId}, destinatario: ${destinatarioId}`);

            mensajesIds.push(resultEnviado.insertId, resultRecibido.insertId);
            mensajesInsertados += 2;
          } catch (error) {
            console.error(`Error insertando mensaje para destinatario ${destinatarioId}:`, error);
            // Continuar con los demás destinatarios aunque uno falle
          }
        }

        // Guardar archivos adjuntos si existen
        // IMPORTANTE: Los archivos se guardan en Static/Archivos/ (compartido con sistema PHP)
        // Se sirven desde Apache mediante el Alias /Static
        if (req.files && req.files.length > 0) {
          console.log(`📎 [ENVIAR MENSAJE] Procesando ${req.files.length} archivo(s) para ${mensajesIds.length} mensaje(s)`);
          console.log(`📎 [ENVIAR MENSAJE] IDs de mensajes a asociar archivos:`, mensajesIds);
          for (const file of req.files) {
            try {
              // Insertar archivo para cada mensaje creado
              // El archivo ya está guardado en backend/uploads/mensajes/ por multer
              for (const mensajeId of mensajesIds) {
                await execute(
                  `INSERT INTO mensajes_archivos (mensaje_id, nombre_archivo, archivo)
                   VALUES (?, ?, ?)`,
                  [mensajeId, file.originalname, file.filename]
                );
                console.log(`📎 [ENVIAR MENSAJE] Archivo insertado - mensaje_id: ${mensajeId}, archivo: ${file.filename}, nombre: ${file.originalname}`);
              }
            } catch (error) {
              console.error(`❌ [ENVIAR MENSAJE] Error guardando archivo ${file.originalname}:`, error);
              // Continuar con los demás archivos aunque uno falle
            }
          }
          console.log(`📎 [ENVIAR MENSAJE] Total de archivos procesados: ${req.files.length} archivo(s) × ${mensajesIds.length} mensaje(s) = ${req.files.length * mensajesIds.length} registros en mensajes_archivos`);
        } else {
          console.log(`📎 [ENVIAR MENSAJE] No hay archivos adjuntos en la solicitud`);
        }

        // Registrar en auditoría (con formato correcto)
        try {
          let descripcionAuditoria = `Envió mensaje a ${usuariosDestinatarios.length} destinatario(s)`;
          if (gruposArray && gruposArray.length > 0) {
            descripcionAuditoria += ` (${gruposArray.length} grupo(s) con ${totalAlumnosGrupos} alumno(s))`;
          }
          if (destinatariosArray && destinatariosArray.length > 0) {
            descripcionAuditoria += ` y ${destinatariosArray.length} destinatario(s) directo(s)`;
          }
          if (req.files && req.files.length > 0) {
            descripcionAuditoria += ` con ${req.files.length} archivo(s) adjunto(s)`;
          }
          
          registrarAccion({
            usuario_id: usuario_id,
            colegio_id: colegio_id,
            tipo_usuario: req.user.tipo || 'DOCENTE',
            accion: 'ENVIAR_MENSAJE',
            modulo: 'MENSAJES',
            entidad: 'mensajes',
            descripcion: descripcionAuditoria,
            datos_nuevos: {
              asunto: asunto,
              total_destinatarios: usuariosDestinatarios.length,
              grupos_seleccionados: gruposArray?.length || 0,
              alumnos_en_grupos: totalAlumnosGrupos,
              destinatarios_directos: destinatariosArray?.length || 0,
              archivos_adjuntos: req.files?.length || 0
            },
            resultado: mensajesInsertados > 0 ? 'EXITOSO' : 'ERROR'
          });
        } catch (auditError) {
          console.error('Error en auditoría (no crítico):', auditError);
        }

        if (mensajesInsertados === 0) {
          console.error('No se pudieron insertar los mensajes');
          return;
        }

        let mensajeRespuesta = `Mensaje enviado a ${usuariosDestinatarios.length} destinatario(s)`;
        if (gruposArray && gruposArray.length > 0) {
          mensajeRespuesta += ` (${gruposArray.length} grupo(s) con ${totalAlumnosGrupos} alumno(s))`;
        }
        if (destinatariosArray && destinatariosArray.length > 0) {
          mensajeRespuesta += ` y ${destinatariosArray.length} destinatario(s) directo(s)`;
        }

        console.log('✅ Mensaje enviado exitosamente:', mensajeRespuesta);
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
 * DELETE /api/docente/mensajes/:mensajeId
 * Eliminar mensaje (marcar como borrado)
 */
router.delete('/mensajes/:mensajeId', async (req, res) => {
  try {
    const { usuario_id, colegio_id } = req.user;
    const { mensajeId } = req.params;

    // Verificar que el mensaje pertenece al usuario
    const mensaje = await query(
      `SELECT id, remitente_id, destinatario_id, tipo 
       FROM mensajes 
       WHERE id = ? AND borrado = 'NO'`,
      [mensajeId]
    );

    if (mensaje.length === 0) {
      return res.status(404).json({ error: 'Mensaje no encontrado' });
    }

    const mensajeData = mensaje[0];
    
    // Solo el remitente puede eliminar mensajes ENVIADOS
    // Solo el destinatario puede eliminar mensajes RECIBIDOS
    const puedeEliminar = 
      (mensajeData.tipo === 'ENVIADO' && mensajeData.remitente_id === usuario_id) ||
      (mensajeData.tipo === 'RECIBIDO' && mensajeData.destinatario_id === usuario_id);

    if (!puedeEliminar) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar este mensaje' });
    }

    // Obtener información completa del mensaje antes de eliminarlo
    const mensajeCompleto = await query(
      `SELECT * FROM mensajes WHERE id = ?`,
      [mensajeId]
    );

    // Registrar auditoría ANTES de eliminar
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'ELIMINAR',
      modulo: 'MENSAJES',
      entidad: 'mensaje',
      entidad_id: parseInt(mensajeId),
      descripcion: `Eliminó mensaje${mensajeCompleto.length > 0 && mensajeCompleto[0].asunto ? `: "${mensajeCompleto[0].asunto}"` : ''} (ID: ${mensajeId})`,
      url: req.originalUrl,
      metodo_http: req.method,
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: mensajeCompleto.length > 0 ? JSON.stringify(mensajeCompleto[0]) : null,
      datos_nuevos: JSON.stringify({}),
      resultado: 'EXITOSO'
    });

    // Marcar como borrado (soft delete)
    await execute(
      `UPDATE mensajes SET borrado = 'SI' WHERE id = ?`,
      [mensajeId]
    );

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    res.json({ success: true, message: 'Mensaje eliminado correctamente' });
  } catch (error) {
    console.error('Error eliminando mensaje:', error);
    res.status(500).json({ error: 'Error al eliminar mensaje' });
  }
});

/**
 * PUT /api/docente/mensajes/:mensajeId/marcar-leido
 * Marcar un mensaje como leído
 */
router.put('/mensajes/:mensajeId/marcar-leido', async (req, res) => {
  try {
    const { mensajeId } = req.params;
    const { usuario_id } = req.user;

    // Verificar que el mensaje existe y pertenece al usuario
    const mensaje = await query(
      `SELECT * FROM mensajes 
       WHERE id = ? AND destinatario_id = ? AND tipo = 'RECIBIDO' AND borrado = 'NO'`,
      [mensajeId, usuario_id]
    );

    if (mensaje.length === 0) {
      return res.status(404).json({ error: 'Mensaje no encontrado' });
    }

    // Si ya está leído, no hacer nada
    if (mensaje[0].estado === 'LEIDO') {
      return res.json({ success: true, message: 'Mensaje ya estaba marcado como leído' });
    }

    // Marcar como leído
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
 * DELETE /api/docente/mensajes
 * Eliminar múltiples mensajes
 */
router.delete('/mensajes', async (req, res) => {
  try {
    const { usuario_id, colegio_id } = req.user;
    const { mensajesIds } = req.body; // Array de IDs

    if (!mensajesIds || !Array.isArray(mensajesIds) || mensajesIds.length === 0) {
      return res.status(400).json({ error: 'Debe proporcionar al menos un ID de mensaje' });
    }

    // Verificar que todos los mensajes pertenecen al usuario
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

    // Filtrar solo los mensajes que el usuario puede eliminar
    const mensajesAEliminar = mensajes.filter(m => 
      (m.tipo === 'ENVIADO' && m.remitente_id === usuario_id) ||
      (m.tipo === 'RECIBIDO' && m.destinatario_id === usuario_id)
    );

    if (mensajesAEliminar.length === 0) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar estos mensajes' });
    }

    const idsAEliminar = mensajesAEliminar.map(m => m.id);
    const placeholdersEliminar = idsAEliminar.map(() => '?').join(',');

    // Marcar como borrado (soft delete)
    await execute(
      `UPDATE mensajes SET borrado = 'SI' WHERE id IN (${placeholdersEliminar})`,
      idsAEliminar
    );

    // Registrar auditoría ANTES de eliminar
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'ELIMINAR',
      modulo: 'MENSAJES',
      entidad: 'mensaje',
      entidad_id: null,
      descripcion: `Eliminó ${idsAEliminar.length} mensaje(s)`,
      url: req.originalUrl,
      metodo_http: req.method,
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: null,
      datos_nuevos: JSON.stringify({ mensajes_eliminados: idsAEliminar.length, ids: idsAEliminar }),
      resultado: 'EXITOSO'
    });

    await execute(
      `UPDATE mensajes SET borrado = 'SI' WHERE id IN (${placeholdersEliminar})`,
      idsAEliminar
    );

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

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
 * GET /api/docente/mensajes/anios-disponibles
 * Obtener lista de años disponibles en mensajes (recibidos y enviados)
 */
router.get('/mensajes/anios-disponibles', async (req, res) => {
  try {
    const { usuario_id } = req.user;

    // Obtener años únicos de mensajes recibidos y enviados
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

    // Combinar y obtener años únicos
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
 * GET /api/docente/notificaciones
 * Obtener notificaciones (solo lectura, generadas por admin)
 */
router.get('/notificaciones', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo } = req.user;

    // Obtener notificaciones para el docente
    // NOTA: Las asistencias se guardan en asistencia_registros, pero las notificaciones
    // se crean automáticamente en la tabla notificaciones cuando se registra asistencia.
    // Aquí solo mostramos las notificaciones de la tabla notificaciones.
    const notificaciones = await query(
      `SELECT 
         n.id,
         n.asunto as titulo,
         n.contenido as mensaje,
         n.fecha_hora,
         n.estado,
         'NOTIFICACION' as tipo_origen
       FROM notificaciones n
       WHERE (n.para = 'TODOS' OR (n.para = 'USUARIO' AND n.destinatario_id = ?))
       ORDER BY n.fecha_hora DESC
       LIMIT 30`,
      [usuario_id]
    );

    // Mapear campos para compatibilidad con el frontend
    const notificacionesMapeadas = (notificaciones || []).map(n => ({
      id: n.id,
      titulo: n.titulo || n.asunto || 'Notificación del sistema', // SIEMPRE debe tener título
      mensaje: n.mensaje || n.contenido || '',
      fecha_hora: n.fecha_hora,
      estado: n.estado === 'NO ENVIADO' ? 'NO_LEIDO' : (n.estado === 'ENVIADO' ? 'LEIDO' : n.estado || 'NO_LEIDO'),
      tipo_origen: n.tipo_origen || 'NOTIFICACION'
    }));

    res.json({ notificaciones: notificacionesMapeadas });
  } catch (error) {
    console.error('Error obteniendo notificaciones:', error);
    res.status(500).json({ error: 'Error al obtener notificaciones' });
  }
});

/**
 * Función auxiliar para decodificar imágenes de publicaciones
 * Las imágenes vienen como base64_encode(serialize(array)) desde PHP
 */
function decodePublicacionImages(imagesString) {
  if (!imagesString || imagesString === '') {
    return [];
  }

  try {
    // Decodificar base64
    const decoded = Buffer.from(imagesString, 'base64').toString('utf-8');
    
    // El formato serialize de PHP para arrays es: a:N:{i:key1;s:len:"value1";i:key2;s:len:"value2";}
    // Ejemplo: a:2:{i:0;s:25:"/Static/Image/Publicaciones/img1.jpg";i:1;s:25:"/Static/Image/Publicaciones/img2.jpg";}
    if (decoded.startsWith('a:')) {
      const imagenes = [];
      // Extraer todas las rutas de imágenes del formato serialize
      const regex = /s:\d+:"([^"]+)"/g;
      let match;
      while ((match = regex.exec(decoded)) !== null) {
        const ruta = match[1];
        // Convertir ruta relativa a URL completa
        if (ruta.startsWith('/Static/')) {
          const isProduction = process.env.NODE_ENV === 'production';
          if (isProduction) {
            // Usar el dominio del sistema PHP (nuevo.vanguardschools.edu.pe)
            imagenes.push(`https://nuevo.vanguardschools.edu.pe${ruta}`);
          } else {
            // En desarrollo, las imágenes están en el servidor PHP
            imagenes.push(`http://localhost:5000${ruta}`);
          }
        } else if (ruta.startsWith('/uploads/')) {
          // Rutas de uploads del backend Node.js
          const isProduction = process.env.NODE_ENV === 'production';
          if (isProduction) {
            // Usar el dominio del nuevo sistema React
            const frontendUrl = process.env.FRONTEND_URL || 'https://sistema.vanguardschools.edu.pe';
            imagenes.push(`${frontendUrl}${ruta}`);
          } else {
            imagenes.push(`http://localhost:5000${ruta}`);
          }
        } else {
          // Si ya es una URL completa, normalizarla
          if (ruta.startsWith('http')) {
            // Reemplazar dominio antiguo por el correcto
            let normalized = ruta.replace(/https?:\/\/vanguardschools\.edu\.pe\/Static/g, 'https://nuevo.vanguardschools.edu.pe/Static');
            normalized = normalized.replace(/https?:\/\/vanguardschools\.edu\.pe\/uploads/g, (match) => {
              const frontendUrl = process.env.FRONTEND_URL || 'https://sistema.vanguardschools.edu.pe';
              return match.replace('https://vanguardschools.edu.pe', frontendUrl);
            });
            imagenes.push(normalized);
        } else {
          // Si ya es una URL completa o ruta relativa, usarla tal cual
          imagenes.push(ruta);
          }
        }
      }
      return imagenes;
    } else {
      // Intentar como JSON (por si acaso)
      try {
        const parsed = JSON.parse(decoded);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch (e) {
        // Si no es JSON, tratar como string simple
        return [imagesString];
      }
    }
  } catch (error) {
    console.warn('Error decodificando imágenes de publicación:', error);
    return [];
  }
}

/**
 * GET /api/docente/publicaciones
 * Obtener publicaciones (feed tipo Facebook)
 */
router.get('/publicaciones', async (req, res) => {
  try {
    const { colegio_id } = req.user;

    // Obtener publicaciones con nombre completo del autor y foto
    // publicaciones NO tiene estado ni autor_id. Tiene usuario_id y fecha_hora
    const publicaciones = await query(
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
       ORDER BY p.fecha_hora DESC
       LIMIT 50`,
      [colegio_id]
    );

    // Obtener todos los grupos del colegio para mapear IDs a nombres
    const gruposMap = {};
    try {
      const grupos = await query(
        `SELECT g.id, n.nombre as nivel_nombre, g.grado, g.seccion
         FROM grupos g
         INNER JOIN niveles n ON n.id = g.nivel_id
         WHERE g.colegio_id = ?`,
        [colegio_id]
      );
      grupos.forEach(grupo => {
        gruposMap[grupo.id] = `${grupo.nivel_nombre} ${grupo.grado}° ${grupo.seccion}`;
      });
    } catch (error) {
      console.warn('Error obteniendo grupos para publicaciones:', error);
    }

    // Decodificar imágenes y archivos de cada publicación
    const publicacionesConImagenes = publicaciones.map(pub => {
      // Decodificar privacidad (puede ser "TODOS", "-1", "-2", o IDs de grupos separados por comas)
      let paraTexto = 'Todos';
      if (pub.privacidad && pub.privacidad !== '' && pub.privacidad !== '-1') {
        if (pub.privacidad === '-2') {
          paraTexto = 'Personal Administrativo';
        } else {
          // Es una lista de IDs de grupos separados por comas
          const grupoIds = pub.privacidad.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id) && id > 0);
          if (grupoIds.length > 0) {
            // Obtener nombres de los grupos desde el mapa
            const nombresGrupos = grupoIds
              .map(id => gruposMap[id])
              .filter(nombre => nombre); // Filtrar grupos que no se encontraron
            
            if (nombresGrupos.length > 0) {
              if (nombresGrupos.length === 1) {
                paraTexto = nombresGrupos[0];
              } else {
                paraTexto = nombresGrupos.join(', ');
              }
            } else {
              paraTexto = grupoIds.length === 1 ? '1 Grupo' : `${grupoIds.length} Grupos`;
            }
          }
        }
      }

      // Decodificar archivos (similar a imágenes)
      let archivos = [];
      if (pub.archivos && pub.archivos !== '') {
        try {
          const decoded = Buffer.from(pub.archivos, 'base64').toString('utf-8');
          if (decoded.startsWith('a:')) {
            const regex = /s:\d+:"([^"]+)"/g;
            let match;
            while ((match = regex.exec(decoded)) !== null) {
              archivos.push(match[1]);
            }
          }
        } catch (e) {
          console.warn('Error decodificando archivos:', e);
        }
      }

      const imagenesDecodificadas = decodePublicacionImages(pub.images);
      console.log(`📰 Publicación ID ${pub.id}: ${imagenesDecodificadas.length} imagen(es) decodificada(s)`, imagenesDecodificadas);
      
      // Construir URL completa de la foto del autor
      let autorFotoUrl = null;
      if (pub.autor_foto && pub.autor_foto !== '') {
        const isProduction = process.env.NODE_ENV === 'production';
        
        // Si ya es una URL completa, usarla directamente
        if (pub.autor_foto.startsWith('http')) {
          autorFotoUrl = pub.autor_foto;
        } else if (pub.autor_foto.startsWith('/uploads/')) {
          // Si ya tiene la ruta /uploads/, construir URL completa
          if (isProduction) {
            const frontendUrl = process.env.FRONTEND_URL || 'https://sistema.vanguardschools.edu.pe';
            autorFotoUrl = `${frontendUrl}${pub.autor_foto}`;
          } else {
            autorFotoUrl = `http://localhost:5000${pub.autor_foto}`;
          }
        } else {
          // Es solo el nombre del archivo, determinar si es personal o alumno según el tipo de usuario
          const esPersonal = pub.autor_tipo === 'DOCENTE' || pub.autor_tipo === 'DIRECTOR' || pub.autor_tipo === 'ADMINISTRADOR';
          
          if (isProduction) {
            // Usar el dominio del sistema PHP (nuevo.vanguardschools.edu.pe)
            autorFotoUrl = `https://nuevo.vanguardschools.edu.pe/Static/Image/Fotos/${pub.autor_foto}`;
          } else {
            // En desarrollo, usar la ruta de uploads según el tipo
            const uploadPath = esPersonal ? 'uploads/personal' : 'uploads/alumnos';
            autorFotoUrl = `http://localhost:5000/${uploadPath}/${pub.autor_foto}`;
          }
        }
      }

      return {
        ...pub,
        images: imagenesDecodificadas,
        archivos: archivos,
        para_texto: paraTexto,
        autor_foto_url: autorFotoUrl
      };
    });

    res.json({ publicaciones: publicacionesConImagenes || [] });
  } catch (error) {
    console.error('Error obteniendo publicaciones:', error);
    res.status(500).json({ error: 'Error al obtener publicaciones' });
  }
});

/**
 * POST /api/docente/publicaciones
 * Crear publicación (tipo Facebook)
 */
// Configurar multer para aceptar tanto imágenes como archivos
// Guardar directamente en /Static/ del sistema PHP (compartido con ambos sistemas)
const uploadPublicacionesCompleto = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const isImage = /jpeg|jpg|png|gif|webp/i.test(path.extname(file.originalname)) || file.mimetype.startsWith('image/');
      if (isImage) {
        // Guardar en Static/Image/Publicaciones/ del sistema PHP
        const uploadPath = '/home/vanguard/nuevo.vanguardschools.edu.pe/Static/Image/Publicaciones';
        if (!fs.existsSync(uploadPath)) {
          fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
      } else {
        // Guardar en Static/Archivos/ del sistema PHP
        const uploadPath = '/home/vanguard/nuevo.vanguardschools.edu.pe/Static/Archivos';
        if (!fs.existsSync(uploadPath)) {
          fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
      }
    },
    filename: (req, file, cb) => {
      const isImage = /jpeg|jpg|png|gif|webp/i.test(path.extname(file.originalname)) || file.mimetype.startsWith('image/');
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      if (isImage) {
        cb(null, `publicacion-${uniqueSuffix}${path.extname(file.originalname)}`);
      } else {
        cb(null, `archivo-${uniqueSuffix}${path.extname(file.originalname)}`);
      }
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    // Permitir imágenes y archivos
    const isImage = /jpeg|jpg|png|gif|webp/i.test(path.extname(file.originalname)) || file.mimetype.startsWith('image/');
    const isFile = /pdf|doc|docx|xls|xlsx|ppt|pptx|txt|zip|rar/i.test(path.extname(file.originalname));
    
    if (isImage || isFile) {
      return cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido'));
    }
  }
});

router.post('/publicaciones', uploadPublicacionesCompleto.fields([
  { name: 'imagen', maxCount: 1 },
  { name: 'archivo', maxCount: 1 }
]), async (req, res) => {
  try {
    const { usuario_id, colegio_id } = req.user;
    const { contenido, compartir_con, grupos_ids } = req.body; // compartir_con: 'todos' o 'grupos', grupos_ids: array de IDs

    if (!contenido) {
      return res.status(400).json({ error: 'El contenido es requerido' });
    }

    let imagenPath = '';
    if (req.files && req.files.imagen && req.files.imagen[0]) {
      // Guardar ruta como /Static/Image/Publicaciones/ (compartido con sistema PHP)
      imagenPath = `/Static/Image/Publicaciones/${req.files.imagen[0].filename}`;
    }

    let archivoPath = '';
    if (req.files && req.files.archivo && req.files.archivo[0]) {
      // Verificar si el archivo es realmente un archivo (no imagen)
      const isImage = /jpeg|jpg|png|gif|webp/i.test(path.extname(req.files.archivo[0].originalname)) || 
                      req.files.archivo[0].mimetype.startsWith('image/');
      if (!isImage) {
        // IMPORTANTE: Guardar solo el nombre del archivo (como el sistema PHP)
        // El sistema PHP guarda solo el nombre, no la ruta completa
        archivoPath = req.files.archivo[0].filename;
        
        // Verificar que el archivo se guardó correctamente
        const archivoCompleto = path.join('/home/vanguard/nuevo.vanguardschools.edu.pe/Static/Archivos', archivoPath);
        if (fs.existsSync(archivoCompleto)) {
          const stats = fs.statSync(archivoCompleto);
          console.log('✅ Archivo guardado correctamente:', {
            nombre: archivoPath,
            tamaño: stats.size,
            ruta: archivoCompleto
          });
        } else {
          console.error('❌ Error: Archivo no encontrado después de guardar:', archivoCompleto);
        }
      } else {
        // Si es una imagen pero viene en el campo "archivo", tratarla como imagen
        if (!imagenPath) {
          imagenPath = `/Static/Image/Publicaciones/${req.files.archivo[0].filename}`;
        }
      }
    }

    // Preparar privacidad según compartir_con
    let privacidad = '-1'; // -1 = Todos por defecto
    if (compartir_con === 'grupos' && grupos_ids) {
      const gruposArray = typeof grupos_ids === 'string' ? JSON.parse(grupos_ids) : grupos_ids;
      if (gruposArray.length > 0) {
        privacidad = gruposArray.join(',');
      }
    }

    // Preparar imágenes (serializar como PHP: base64_encode(serialize(array)))
    // IMPORTANTE: Usar php-serialize para garantizar formato EXACTO igual al sistema PHP
    const phpSerialize = require('php-serialize');
    let imagesSerialized = '';
    if (imagenPath) {
      console.log('📸 Guardando imagen:', imagenPath);
      const imagesArray = [imagenPath];
      // Usar php-serialize para serializar exactamente como PHP
      const serialized = phpSerialize.serialize(imagesArray);
      imagesSerialized = Buffer.from(serialized).toString('base64');
      console.log('✅ Imagen serializada:', {
        ruta: imagenPath,
        serializado: serialized.substring(0, 100) + '...',
        base64: imagesSerialized.substring(0, 50) + '...'
      });
    } else {
      console.log('⚠️ No hay imagen para guardar');
    }

    // Preparar archivos (serializar como PHP: base64_encode(serialize(array)))
    // IMPORTANTE: Usar php-serialize para garantizar formato EXACTO igual al sistema PHP
    let archivosSerialized = '';
    if (archivoPath) {
      const archivosArray = [archivoPath];
      // Usar php-serialize para serializar exactamente como PHP
      const serialized = phpSerialize.serialize(archivosArray);
      archivosSerialized = Buffer.from(serialized).toString('base64');
    }

    // Insertar publicación en MySQL
    // La tabla publicaciones tiene: id, colegio_id, usuario_id, contenido, tipo_video, video_id, images, archivos, privacidad, fecha_hora
    const fechaHora = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const result = await execute(
      `INSERT INTO publicaciones 
       (colegio_id, usuario_id, contenido, tipo_video, video_id, images, archivos, privacidad, fecha_hora)
       VALUES (?, ?, ?, '', '', ?, ?, ?, ?)`,
      [colegio_id, usuario_id, contenido, imagesSerialized, archivosSerialized, privacidad, fechaHora]
    );

    // Registrar auditoría ANTES de responder
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'CREAR',
      modulo: 'PUBLICACIONES',
      entidad: 'publicacion',
      entidad_id: result.insertId,
      descripcion: `Creó publicación ID: ${result.insertId}`,
      url: req.originalUrl,
      metodo_http: 'POST',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: null,
      datos_nuevos: JSON.stringify({ contenido, compartir_con, grupos_ids, imagen: imagenPath, archivo: archivoPath }),
      resultado: 'EXITOSO'
    });

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    // Guardar el ID de la publicación para usar en notificaciones
    const publicacionId = result.insertId;

    // ========== CREAR NOTIFICACIONES PARA LA PUBLICACIÓN ==========
    // Hacer esto de forma asíncrona para no bloquear la respuesta
    setImmediate(async () => {
      try {
        console.log('📢 [PUBLICACIONES] Iniciando creación de notificaciones...');
        
        // Obtener nombre del docente que crea la publicación
        const docenteInfo = await query(
          `SELECT CONCAT(p.nombres, ' ', p.apellidos) as nombre_completo
           FROM personal p
           INNER JOIN usuarios u ON u.personal_id = p.id
           WHERE u.id = ? AND u.colegio_id = ? LIMIT 1`,
          [usuario_id, colegio_id]
        );
        
        const nombreDocente = docenteInfo.length > 0 ? docenteInfo[0].nombre_completo : 'Un docente';
        
        // Preparar título y mensaje de la notificación
        const tituloNotificacion = 'Nueva Publicación';
        // Limpiar HTML del contenido para el mensaje (solo primeros 200 caracteres)
        const contenidoLimpio = contenido.replace(/<[^>]*>/g, '').trim();
        const mensajeCorto = contenidoLimpio.length > 200 
          ? contenidoLimpio.substring(0, 200) + '...' 
          : contenidoLimpio;
        const mensajeNotificacion = `${nombreDocente} ha publicado: "${mensajeCorto}"`;

        let destinatarios = [];

        if (compartir_con === 'todos') {
          // Obtener TODOS los usuarios activos del colegio
          console.log('📢 [PUBLICACIONES] Creando notificaciones para TODOS los usuarios');
          
          const todosUsuarios = await query(
            `SELECT DISTINCT u.id, u.tipo
             FROM usuarios u
             WHERE u.colegio_id = ? AND u.estado = 'ACTIVO'`,
            [colegio_id]
          );
          
          destinatarios = todosUsuarios.map(u => ({
            usuario_id: u.id,
            tipo: u.tipo
          }));
          
          console.log(`📢 [PUBLICACIONES] Encontrados ${destinatarios.length} usuarios para notificar (TODOS)`);
        } else if (compartir_con === 'grupos' && grupos_ids) {
          // Obtener destinatarios de los grupos específicos
          console.log('📢 [PUBLICACIONES] Creando notificaciones para grupos específicos');
          
          const gruposArray = typeof grupos_ids === 'string' ? JSON.parse(grupos_ids) : grupos_ids;
          
          if (gruposArray.length > 0) {
            // 1. Obtener alumnos de los grupos
            const alumnosGrupos = await query(
              `SELECT DISTINCT u.id, u.tipo, a.id as alumno_id
               FROM alumnos a
               INNER JOIN matriculas m ON m.alumno_id = a.id
               INNER JOIN usuarios u ON u.alumno_id = a.id
               WHERE m.grupo_id IN (${gruposArray.map(() => '?').join(',')})
                 AND m.colegio_id = ?
                 AND (m.estado = 0 OR m.estado = 4)
                 AND u.colegio_id = ?
                 AND u.estado = 'ACTIVO'`,
              [...gruposArray, colegio_id, colegio_id]
            );
            
            // 2. Obtener apoderados de esos alumnos
            const alumnoIds = alumnosGrupos.map(a => a.alumno_id);
            let apoderadosIds = [];
            if (alumnoIds.length > 0) {
              const apoderadosData = await query(
                `SELECT DISTINCT u.id, u.tipo
                 FROM apoderados ap
                 INNER JOIN familias f ON f.apoderado_id = ap.id
                 INNER JOIN usuarios u ON u.apoderado_id = ap.id
                 WHERE f.alumno_id IN (${alumnoIds.map(() => '?').join(',')})
                   AND ap.colegio_id = ?
                   AND u.colegio_id = ?
                   AND u.estado = 'ACTIVO'`,
                [...alumnoIds, colegio_id, colegio_id]
              );
              apoderadosIds = apoderadosData.map(a => ({ usuario_id: a.id, tipo: a.tipo }));
            }
            
            // 3. Obtener docentes que enseñan en esos grupos (a través de asignaturas)
            const docentesGrupos = await query(
              `SELECT DISTINCT u.id, u.tipo
               FROM asignaturas a
               INNER JOIN usuarios u ON u.personal_id = a.personal_id
               WHERE a.grupo_id IN (${gruposArray.map(() => '?').join(',')})
                 AND a.colegio_id = ?
                 AND u.colegio_id = ?
                 AND u.estado = 'ACTIVO'`,
              [...gruposArray, colegio_id, colegio_id]
            );
            
            // Combinar todos los destinatarios
            destinatarios = [
              ...alumnosGrupos.map(a => ({ usuario_id: a.id, tipo: a.tipo })),
              ...apoderadosIds,
              ...docentesGrupos.map(d => ({ usuario_id: d.id, tipo: d.tipo }))
            ];
            
            // Eliminar duplicados
            const uniqueDestinatarios = [];
            const seenIds = new Set();
            for (const dest of destinatarios) {
              if (!seenIds.has(dest.usuario_id)) {
                seenIds.add(dest.usuario_id);
                uniqueDestinatarios.push(dest);
              }
            }
            destinatarios = uniqueDestinatarios;
            
            console.log(`📢 [PUBLICACIONES] Encontrados ${destinatarios.length} usuarios para notificar (grupos: ${gruposArray.join(', ')})`);
          }
        }

        // Crear notificaciones en la BD para cada destinatario
        if (destinatarios.length > 0) {
          console.log(`📢 [PUBLICACIONES] Creando ${destinatarios.length} notificaciones en la BD...`);
          
          for (const destinatario of destinatarios) {
            try {
              await execute(
                `INSERT INTO notificaciones 
                 (para, usuario_id, destinatario_id, asunto, contenido, fecha_hora, estado)
                 VALUES ('USUARIO', ?, ?, ?, ?, NOW(), 'NO ENVIADO')`,
                [
                  usuario_id, // Usuario que crea (docente)
                  destinatario.usuario_id, // Destinatario
                  tituloNotificacion, // TÍTULO (asunto)
                  mensajeNotificacion // MENSAJE (contenido)
                ]
              );
            } catch (error) {
              console.error(`❌ [PUBLICACIONES] Error creando notificación para usuario ${destinatario.usuario_id}:`, error);
            }
          }
          
          console.log(`✅ [PUBLICACIONES] ${destinatarios.length} notificaciones creadas exitosamente`);
          
          // ========== ENVIAR PUSH NOTIFICATIONS ==========
          try {
            // Obtener suscripciones push de todos los destinatarios
            const usuarioIds = destinatarios.map(d => d.usuario_id);
            
            if (usuarioIds.length > 0) {
              // Obtener suscripciones push de usuarios directos
              const subscriptionsData = await query(
                `SELECT endpoint, p256dh, auth 
                 FROM push_subscriptions 
                 WHERE usuario_id IN (${usuarioIds.map(() => '?').join(',')}) 
                   AND colegio_id = ? AND (activo = 1 OR activo IS NULL)`,
                [...usuarioIds, colegio_id]
              );
              
              let subscriptions = subscriptionsData.map(sub => ({
                endpoint: sub.endpoint,
                keys: {
                  p256dh: sub.p256dh,
                  auth: sub.auth
                }
              }));
              
              // Si es para grupos específicos, también incluir docentes que son apoderados
              if (compartir_con === 'grupos' && grupos_ids) {
                const gruposArray = typeof grupos_ids === 'string' ? JSON.parse(grupos_ids) : grupos_ids;
                
                if (gruposArray.length > 0) {
                  // Obtener alumnos de los grupos
                  const alumnosGrupos = await query(
                    `SELECT DISTINCT a.id as alumno_id
                     FROM alumnos a
                     INNER JOIN matriculas m ON m.alumno_id = a.id
                     WHERE m.grupo_id IN (${gruposArray.map(() => '?').join(',')})
                       AND m.colegio_id = ?
                       AND (m.estado = 0 OR m.estado = 4)`,
                    [...gruposArray, colegio_id]
                  );
                  
                  const alumnoIds = alumnosGrupos.map(a => a.alumno_id);
                  
                  if (alumnoIds.length > 0) {
                    // Obtener apoderados de esos alumnos
                    const apoderados = await query(
                      `SELECT DISTINCT ap.nro_documento
                       FROM apoderados ap
                       INNER JOIN familias f ON f.apoderado_id = ap.id
                       WHERE f.alumno_id IN (${alumnoIds.map(() => '?').join(',')})
                         AND ap.colegio_id = ?
                         AND ap.nro_documento IS NOT NULL
                         AND ap.nro_documento != ''`,
                      [...alumnoIds, colegio_id]
                    );
                    
                    const apoderadoDnis = apoderados.map(a => a.nro_documento).filter(dni => dni);
                    
                    if (apoderadoDnis.length > 0) {
                      // Obtener usuarios DOCENTE que también son apoderados (mismo nro_documento)
                      const usuariosDocentesApoderados = await query(
                        `SELECT DISTINCT u.id 
                         FROM usuarios u
                         INNER JOIN personal p ON p.id = u.personal_id
                         WHERE u.colegio_id = ? 
                           AND u.estado = 'ACTIVO'
                           AND u.tipo = 'DOCENTE'
                           AND (p.nro_documento IN (${apoderadoDnis.map(() => '?').join(',')}) 
                                OR u.usuario IN (${apoderadoDnis.map(() => '?').join(',')}))
                           AND u.id NOT IN (${usuarioIds.map(() => '?').join(',')})`, // Evitar duplicados
                        [colegio_id, ...apoderadoDnis, ...apoderadoDnis, ...usuarioIds]
                      );
                      
                      const docentesApoderadosIds = usuariosDocentesApoderados.map(u => u.id);
                      
                      if (docentesApoderadosIds.length > 0) {
                        console.log(`📱 [PUBLICACIONES] Encontrados ${docentesApoderadosIds.length} docentes que también son apoderados`);
                        
                        // Obtener suscripciones push de estos docentes-apoderados
                        const subscriptionsDocentesApoderados = await query(
                          `SELECT endpoint, p256dh, auth 
                           FROM push_subscriptions 
                           WHERE usuario_id IN (${docentesApoderadosIds.map(() => '?').join(',')}) 
                             AND colegio_id = ? AND (activo = 1 OR activo IS NULL)`,
                          [...docentesApoderadosIds, colegio_id]
                        );
                        
                        const subscriptionsAdicionales = subscriptionsDocentesApoderados.map(sub => ({
                          endpoint: sub.endpoint,
                          keys: {
                            p256dh: sub.p256dh,
                            auth: sub.auth
                          }
                        }));
                        
                        subscriptions = [...subscriptions, ...subscriptionsAdicionales];
                        console.log(`📱 [PUBLICACIONES] Agregadas ${subscriptionsAdicionales.length} suscripciones push de docentes-apoderados`);
                      }
                    }
                  }
                }
              }
              
              // Enviar push notifications
              if (subscriptions.length > 0) {
                const { enviarPushNotificationMultiple } = require('../services/pushNotificationService');
                
                const payloadPush = {
                  title: tituloNotificacion,
                  body: mensajeNotificacion,
                  icon: '/icons/icon-192x192.png',
                  badge: '/icons/icon-192x192.png',
                  vibrate: [200, 100, 200],
                  tag: `publicacion-${publicacionId}`,
                  data: {
                    url: '/docente/dashboard', // URL genérica, se puede ajustar según destinatario
                    tipo: 'publicacion',
                    publicacion_id: publicacionId
                  }
                };
                
                console.log(`📱 [PUBLICACIONES] Enviando ${subscriptions.length} push notifications...`);
                
                enviarPushNotificationMultiple(subscriptions, payloadPush)
                  .then(resultadosPush => {
                    const exitosas = resultadosPush.filter(r => r.resultado && r.resultado.success).length;
                    const fallidas = resultadosPush.filter(r => !r.resultado || !r.resultado.success).length;
                    console.log(`✅ [PUBLICACIONES] Push notifications: ${exitosas} exitosas, ${fallidas} fallidas`);
                    if (fallidas > 0) {
                      console.log(`❌ [PUBLICACIONES] Errores en push notifications:`, 
                        resultadosPush.filter(r => !r.resultado || !r.resultado.success).map(r => r.resultado?.error || 'Error desconocido')
                      );
                    }
                  })
                  .catch(err => {
                    console.error(`❌ [PUBLICACIONES] Error en envío de push notifications:`, err);
                  });
              } else {
                console.log('⚠️ [PUBLICACIONES] No hay suscripciones push activas para enviar notificaciones');
              }
            }
          } catch (error) {
            console.error('❌ [PUBLICACIONES] Error enviando push notifications:', error);
            // No fallar el proceso si hay error en push notifications
          }
        } else {
          console.log('⚠️ [PUBLICACIONES] No se encontraron destinatarios para notificar');
        }
      } catch (error) {
        console.error('❌ [PUBLICACIONES] Error en proceso de notificaciones:', error);
        console.error('❌ [PUBLICACIONES] Stack:', error.stack);
      }
    });

    res.json({
      success: true,
      message: 'Publicación creada correctamente',
      publicacion: {
        id: result.insertId,
        contenido,
        compartir_con,
        grupos_ids: grupos_ids ? (typeof grupos_ids === 'string' ? JSON.parse(grupos_ids) : grupos_ids) : [],
        imagen: imagenPath,
        archivo: archivoPath
      }
    });
  } catch (error) {
    console.error('Error creando publicación:', error);
    res.status(500).json({ error: 'Error al crear publicación' });
  }
});

/**
 * DELETE /api/docente/publicaciones/:publicacionId
 * Eliminar publicación (solo el autor puede eliminar)
 */
router.delete('/publicaciones/:publicacionId', async (req, res) => {
  try {
    const { usuario_id, colegio_id } = req.user;
    const { publicacionId } = req.params;

    // Verificar que la publicación existe y pertenece al usuario
    const publicaciones = await query(
      `SELECT p.* FROM publicaciones p
       WHERE p.id = ? AND p.usuario_id = ? AND p.colegio_id = ?`,
      [publicacionId, usuario_id, colegio_id]
    );

    if (publicaciones.length === 0) {
      return res.status(404).json({ error: 'Publicación no encontrada o no tienes permiso para eliminarla' });
    }

    const publicacion = publicaciones[0];

    // Registrar auditoría ANTES de eliminar
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'ELIMINAR',
      modulo: 'PUBLICACIONES',
      entidad: 'publicacion',
      entidad_id: parseInt(publicacionId),
      descripcion: `Eliminó publicación ID: ${publicacionId}`,
      url: req.originalUrl,
      metodo_http: 'DELETE',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(publicacion),
      datos_nuevos: JSON.stringify({}),
      resultado: 'EXITOSO'
    });

    // Eliminar publicación de MySQL
    await execute(
      `DELETE FROM publicaciones WHERE id = ? AND usuario_id = ? AND colegio_id = ?`,
      [publicacionId, usuario_id, colegio_id]
    );

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    res.json({
      success: true,
      message: 'Publicación eliminada correctamente'
    });
  } catch (error) {
    console.error('Error eliminando publicación:', error);
    res.status(500).json({ error: 'Error al eliminar publicación' });
  }
});

/**
 * ============================================
 * AULA VIRTUAL - ENDPOINTS
 * ============================================
 */

/**
 * GET /api/docente/aula-virtual/config
 * Obtener configuración del aula virtual (total_notas del colegio)
 */
router.get('/aula-virtual/config', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    
    const colegio = await query(
      `SELECT total_notas FROM colegios WHERE id = ?`,
      [colegio_id]
    );

    if (colegio.length === 0) {
      return res.status(404).json({ error: 'Colegio no encontrado' });
    }

    res.json({ 
      total_notas: colegio[0].total_notas || 4 // Por defecto 4 bimestres
    });
  } catch (error) {
    console.error('Error obteniendo configuración:', error);
    res.status(500).json({ error: 'Error al obtener configuración' });
  }
});

/**
 * GET /api/docente/aula-virtual/temas
 * Obtener temas de una asignatura (filtrados por ciclo/bimestre)
 */
router.get('/aula-virtual/temas', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo } = req.user;
    const { asignatura_id, ciclo } = req.query;

    if (!asignatura_id) {
      return res.status(400).json({ error: 'asignatura_id es requerido' });
    }

    // Si no se proporciona ciclo, usar 1 por defecto
    const cicloFiltro = ciclo ? parseInt(ciclo) : 1;

    // Verificar que el docente tiene acceso a esta asignatura
    const asignatura = await query(
      `SELECT a.* FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [asignatura_id, req.user.personal_id, colegio_id, anio_activo]
    );

    if (asignatura.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a esta asignatura' });
    }

    // Obtener temas de la asignatura (asignaturas_temas NO tiene ciclo, se muestra todos)
    const temas = await query(
      `SELECT * FROM asignaturas_temas
       WHERE asignatura_id = ?
       ORDER BY fecha DESC, id DESC`,
      [asignatura_id]
    );

    res.json({ temas: temas || [] });
  } catch (error) {
    console.error('Error obteniendo temas:', error);
    res.status(500).json({ error: 'Error al obtener temas' });
  }
});

/**
 * GET /api/docente/aula-virtual/tareas
 * Obtener tareas de una asignatura (filtradas por ciclo/bimestre)
 */
router.get('/aula-virtual/tareas', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo } = req.user;
    const { asignatura_id, ciclo } = req.query;

    if (!asignatura_id) {
      return res.status(400).json({ error: 'asignatura_id es requerido' });
    }

    // Si no se proporciona ciclo, usar 1 por defecto
    const cicloFiltro = ciclo ? parseInt(ciclo) : 1;

    // Verificar que el docente tiene acceso a esta asignatura
    const asignatura = await query(
      `SELECT a.* FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [asignatura_id, req.user.personal_id, colegio_id, anio_activo]
    );

    if (asignatura.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a esta asignatura' });
    }

    // Obtener tareas de la asignatura filtradas por ciclo con información del docente
    const tareas = await query(
      `SELECT t.*, 
              CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre
       FROM asignaturas_tareas t
       INNER JOIN personal p ON p.id = t.trabajador_id
       WHERE t.asignatura_id = ? AND t.ciclo = ?
       ORDER BY t.id ASC`,
      [asignatura_id, cicloFiltro]
    );

    // Obtener archivos de cada tarea y construir URLs
    const isProduction = process.env.NODE_ENV === 'production';
    const tareasConArchivos = await Promise.all(tareas.map(async (tarea) => {
      // Obtener archivos de la tarea desde asignaturas_tareas_archivos
      const archivos = await query(
        `SELECT * FROM asignaturas_tareas_archivos WHERE tarea_id = ?`,
        [tarea.id]
      );

      // Construir URLs para los archivos (usando PHP_SYSTEM_URL para compatibilidad con sistema anterior)
      // IMPORTANTE: El sistema PHP guarda solo el nombre del archivo en la BD
      // Debemos construir la URL completa agregando /Static/Archivos/ al inicio
      const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://nuevo.vanguardschools.edu.pe';
      const isDevelopment = process.env.NODE_ENV !== 'production';
      const archivosConUrls = archivos.map(archivo => {
        let archivoUrl = null;
        if (archivo.archivo && archivo.archivo !== '') {
          if (archivo.archivo.startsWith('http')) {
            // Ya es una URL completa, validar y corregir dominio si es necesario
            archivoUrl = archivo.archivo
              .replace(/https?:\/\/(www\.)?vanguardschools\.edu\.pe/gi, phpSystemUrl)
              .replace(/vanguardschools\.comstatic/gi, `${phpSystemUrl}/Static`)
              .replace(/vanguardschools\.com\/static/gi, `${phpSystemUrl}/Static`)
              .replace(/vanguardschools\.com\/Static/gi, `${phpSystemUrl}/Static`);
          } else if (archivo.archivo.startsWith('/Static/')) {
            // Ruta completa con /Static/ (formato antiguo de nuestro sistema, corregir)
            // Extraer solo el nombre del archivo y construir URL correcta
            const nombreArchivo = archivo.archivo.replace(/^\/Static\/Archivos\//, '');
            archivoUrl = isDevelopment
              ? `http://localhost:5000/Static/Archivos/${nombreArchivo}`
              : `${phpSystemUrl}/Static/Archivos/${nombreArchivo}`;
            console.log('📄 [AULA VIRTUAL TAREA] Corrigiendo ruta duplicada:', {
              id: archivo.id,
              ruta_original: archivo.archivo,
              nombre_extraido: nombreArchivo,
              url_final: archivoUrl
            });
          } else if (archivo.archivo.startsWith('/uploads/')) {
            // Ruta relativa desde /uploads/ (formato antiguo, migrar a /Static/Archivos/)
            archivoUrl = isDevelopment
              ? `http://localhost:5000${archivo.archivo}`
              : `${phpSystemUrl}${archivo.archivo}`;
          } else {
            // Solo el nombre del archivo (formato correcto del sistema PHP)
            // Construir URL completa agregando /Static/Archivos/
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

      return {
        ...tarea,
        archivos: archivosConUrls,
        enlace_url: tarea.enlace || null
      };
    }));

    res.json({ tareas: tareasConArchivos || [] });
  } catch (error) {
    console.error('Error obteniendo tareas:', error);
    res.status(500).json({ error: 'Error al obtener tareas' });
  }
});

/**
 * POST /api/docente/aula-virtual/tareas
 * Crear una nueva tarea
 */
router.post('/aula-virtual/tareas', uploadAulaVirtual.single('archivo'), async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { asignatura_id, titulo, descripcion, fecha_entrega, ciclo, enlace } = req.body;

    if (!asignatura_id || !titulo || !fecha_entrega || !ciclo) {
      return res.status(400).json({ error: 'asignatura_id, titulo, fecha_entrega y ciclo son requeridos' });
    }

    if (!req.file && !enlace) {
      return res.status(400).json({ error: 'Debe proporcionar al menos un archivo o una URL' });
    }

    // Verificar que el docente tiene acceso a esta asignatura
    const asignatura = await query(
      `SELECT a.* FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [asignatura_id, personal_id, colegio_id, anio_activo]
    );

    if (asignatura.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a esta asignatura' });
    }

    // IMPORTANTE: Guardar solo el nombre del archivo (como hace el sistema PHP anterior)
    // El sistema PHP construye la URL agregando /Static/Archivos/ al inicio
    // Si guardamos la ruta completa, se duplicaría: /Static/Archivos//Static/Archivos/...
    let archivoPath = '';
    if (req.file) {
      // Guardar solo el nombre del archivo (igual que el sistema PHP)
      archivoPath = req.file.filename;
      console.log('📄 [AULA VIRTUAL TAREA] Archivo guardado:', {
        filename: req.file.filename,
        originalname: req.file.originalname,
        path: archivoPath, // Solo el nombre
        size: req.file.size,
        nota: 'Guardado solo el nombre del archivo (compatible con sistema PHP)'
      });
    }

    // Preparar datos para auditoría
    const datosNuevos = { titulo, descripcion, fecha_entrega, ciclo, archivo: archivoPath, enlace };

    // Registrar auditoría ANTES de crear
    const ahora = new Date();
    const fecha = ahora.toISOString().split('T')[0];
    const hora = ahora.toTimeString().split(' ')[0];
    
    const auditoriaResult = await execute(
      `INSERT INTO auditoria_logs (
        usuario_id, colegio_id, tipo_usuario, accion, modulo, entidad, entidad_id,
        descripcion, url, metodo_http, ip_address, user_agent,
        datos_anteriores, datos_nuevos, resultado, mensaje_error, duracion_ms,
        fecha_hora, fecha, hora
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        usuario_id,
        colegio_id,
        req.user.tipo || 'DOCENTE',
        'CREAR',
        'AULA_VIRTUAL',
        'tarea',
        null, // Temporalmente null, se actualizará después
        `Creó tarea: "${titulo}"`,
        req.originalUrl,
        'POST',
        req.ip || req.connection.remoteAddress,
        req.get('user-agent'),
        null,
        JSON.stringify(datosNuevos),
        'EXITOSO',
        null,
        null,
        ahora,
        fecha,
        hora,
      ]
    );

    // Insertar la nueva tarea
    const fechaHora = ahora.toISOString().slice(0, 19).replace('T', ' ');
    const result = await execute(
      `INSERT INTO asignaturas_tareas 
       (titulo, descripcion, fecha_hora, fecha_entrega, trabajador_id, asignatura_id, entregas, visto, archivos, ciclo, enlace)
       VALUES (?, ?, ?, ?, ?, ?, '', '', '', ?, ?)`,
      [
        titulo,
        descripcion || '',
        fechaHora,
        fecha_entrega,
        personal_id,
        asignatura_id,
        parseInt(ciclo),
        enlace || ''
      ]
    );

    // Actualizar auditoría con el ID de la tarea
    await execute(
      `UPDATE auditoria_logs SET entidad_id = ? WHERE id = ?`,
      [result.insertId, auditoriaResult.insertId]
    );

    // Si hay archivo, insertarlo en asignaturas_tareas_archivos (igual que en Temas)
    if (req.file && archivoPath) {
      await execute(
        `INSERT INTO asignaturas_tareas_archivos (tarea_id, nombre, archivo)
         VALUES (?, ?, ?)`,
        [result.insertId, req.file.originalname, archivoPath]
      );
      console.log('📄 [AULA VIRTUAL TAREA] Archivo insertado en BD:', {
        tarea_id: result.insertId,
        nombre: req.file.originalname,
        archivo: archivoPath
      });
    }

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    // Crear notificaciones de forma asíncrona
    setImmediate(async () => {
      await crearNotificacionesAulaVirtual({
        asignatura_id,
        tipo: 'tarea',
        nombre: titulo,
        usuario_id,
        colegio_id,
        anio_activo,
        fecha_entrega: fecha_entrega,
        entidad_id: result.insertId
      });
    });

    res.json({ 
      message: 'Tarea creada correctamente',
      id: result.insertId 
    });
  } catch (error) {
    console.error('Error creando tarea:', error);
    res.status(500).json({ error: 'Error al crear la tarea' });
  }
});

/**
 * PUT /api/docente/aula-virtual/tareas/:id
 * Actualizar una tarea
 */
router.put('/aula-virtual/tareas/:id', uploadAulaVirtual.single('archivo'), async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { id } = req.params;
    const { asignatura_id, titulo, descripcion, fecha_entrega, ciclo, enlace } = req.body;

    if (!titulo || !fecha_entrega || !ciclo) {
      return res.status(400).json({ error: 'titulo, fecha_entrega y ciclo son requeridos' });
    }

    // Verificar que la tarea existe y pertenece a una asignatura del docente
    const tarea = await query(
      `SELECT t.* FROM asignaturas_tareas t
       INNER JOIN asignaturas a ON a.id = t.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE t.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [id, personal_id, colegio_id, anio_activo]
    );

    if (tarea.length === 0) {
      return res.status(404).json({ error: 'Tarea no encontrada o sin permisos' });
    }

    const tareaActual = tarea[0];
    let archivoPath = null;

    // Si se subió un nuevo archivo, actualizar (guardar solo el nombre del archivo, como el sistema PHP)
    if (req.file) {
      // IMPORTANTE: Guardar solo el nombre del archivo (como hace el sistema PHP anterior)
      archivoPath = req.file.filename;
      console.log('📄 [AULA VIRTUAL TAREA] Archivo actualizado:', {
        filename: req.file.filename,
        originalname: req.file.originalname,
        path: archivoPath, // Solo el nombre
        size: req.file.size,
        nota: 'Guardado solo el nombre del archivo (compatible con sistema PHP)'
      });
    }

    // Si no hay archivo nuevo y no hay enlace, verificar que haya al menos uno existente
    if (!req.file && !enlace) {
      // Verificar si hay archivos existentes
      const archivosExistentes = await query(
        `SELECT * FROM asignaturas_tareas_archivos WHERE tarea_id = ?`,
        [id]
      );
      if (archivosExistentes.length === 0 && !tareaActual.enlace) {
        return res.status(400).json({ error: 'Debe proporcionar al menos un archivo o una URL' });
      }
    }

    // Preparar datos nuevos para auditoría
    const datosNuevos = { titulo, descripcion, fecha_entrega, ciclo, archivo: archivoPath, enlace };

    // Registrar auditoría ANTES de actualizar
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'EDITAR',
      modulo: 'AULA_VIRTUAL',
      entidad: 'tarea',
      entidad_id: parseInt(id),
      descripcion: `Editó tarea: "${tareaActual.titulo}" (ID: ${id})`,
      url: req.originalUrl,
      metodo_http: 'PUT',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(tareaActual),
      datos_nuevos: JSON.stringify(datosNuevos),
      resultado: 'EXITOSO'
    });

    // Actualizar la tarea
    await execute(
      `UPDATE asignaturas_tareas 
       SET titulo = ?, descripcion = ?, fecha_entrega = ?, ciclo = ?, enlace = ?
       WHERE id = ?`,
      [
        titulo,
        descripcion || '',
        fecha_entrega,
        parseInt(ciclo),
        enlace || '',
        id
      ]
    );

    // Si hay archivo nuevo, actualizar o insertar en asignaturas_tareas_archivos
    if (req.file && archivoPath) {
      // Eliminar archivos antiguos de esta tarea
      await execute(
        `DELETE FROM asignaturas_tareas_archivos WHERE tarea_id = ?`,
        [id]
      );
      
      // Insertar el nuevo archivo
      await execute(
        `INSERT INTO asignaturas_tareas_archivos (tarea_id, nombre, archivo)
         VALUES (?, ?, ?)`,
        [id, req.file.originalname, archivoPath]
      );
      console.log('📄 [AULA VIRTUAL TAREA] Archivo actualizado en BD:', {
        tarea_id: id,
        nombre: req.file.originalname,
        archivo: archivoPath
      });
    }

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    res.json({ message: 'Tarea actualizada correctamente' });
  } catch (error) {
    console.error('Error actualizando tarea:', error);
    res.status(500).json({ error: 'Error al actualizar la tarea' });
  }
});

/**
 * DELETE /api/docente/aula-virtual/tareas/:id
 * Eliminar una tarea
 */
router.delete('/aula-virtual/tareas/:id', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { id } = req.params;

    // Verificar que la tarea existe y pertenece a una asignatura del docente
    const tarea = await query(
      `SELECT t.* FROM asignaturas_tareas t
       INNER JOIN asignaturas a ON a.id = t.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE t.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [id, personal_id, colegio_id, anio_activo]
    );

    if (tarea.length === 0) {
      return res.status(404).json({ error: 'Tarea no encontrada o sin permisos' });
    }

    const tareaActual = tarea[0];

    // Registrar auditoría ANTES de eliminar
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'ELIMINAR',
      modulo: 'AULA_VIRTUAL',
      entidad: 'tarea',
      entidad_id: parseInt(id),
      descripcion: `Eliminó tarea: "${tareaActual.titulo}" (ID: ${id})`,
      url: req.originalUrl,
      metodo_http: 'DELETE',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(tareaActual),
      datos_nuevos: JSON.stringify({}),
      resultado: 'EXITOSO'
    });

    // Eliminar archivos asociados primero
    await execute(
      `DELETE FROM asignaturas_tareas_archivos WHERE tarea_id = ?`,
      [id]
    );

    // Eliminar la tarea
    await execute(
      `DELETE FROM asignaturas_tareas WHERE id = ?`,
      [id]
    );

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    res.json({ message: 'Tarea eliminada correctamente' });
  } catch (error) {
    console.error('Error eliminando tarea:', error);
    res.status(500).json({ error: 'Error al eliminar la tarea' });
  }
});

/**
 * GET /api/docente/aula-virtual/tareas/:tareaId/entregas
 * Obtener lista de alumnos con entregas, visto, y notas para una tarea
 */
router.get('/aula-virtual/tareas/:tareaId/entregas', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { tareaId } = req.params;

    // Verificar que la tarea existe y pertenece a una asignatura del docente
    const tarea = await query(
      `SELECT t.*, a.grupo_id, g.grado, g.seccion, g.id as grupo_id_real, c.nombre as curso_nombre
       FROM asignaturas_tareas t
       INNER JOIN asignaturas a ON a.id = t.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN cursos c ON c.id = a.curso_id
       WHERE t.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [tareaId, personal_id, colegio_id, anio_activo]
    );

    if (tarea.length === 0) {
      return res.status(404).json({ error: 'Tarea no encontrada o sin permisos' });
    }

    const tareaInfo = tarea[0];
    const grupoId = tareaInfo.grupo_id_real || tareaInfo.grupo_id;

    // Obtener alumnos del grupo
    const alumnos = await query(
      `SELECT a.id as alumno_id,
              a.nombres,
              a.apellido_paterno,
              a.apellido_materno,
              CONCAT(a.apellido_paterno, ' ', a.apellido_materno, ', ', a.nombres) as nombre_completo,
              m.id as matricula_id
       FROM alumnos a
       INNER JOIN matriculas m ON m.alumno_id = a.id
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.grupo_id = ? 
         AND m.colegio_id = ? 
         AND (m.estado = 0 OR m.estado = 4)
         AND g.anio = ?
       ORDER BY a.apellido_paterno, a.apellido_materno, a.nombres`,
      [grupoId, colegio_id, anio_activo]
    );

    // Obtener entregas de alumnos (URLs que subieron)
    const entregas = await query(
      `SELECT * FROM asignaturas_tareas_entregas
       WHERE tarea_id = ? AND tipo = 'ALUMNO'
       ORDER BY fecha_hora DESC`,
      [tareaId]
    );

    // Obtener notas de alumnos
    const notas = await query(
      `SELECT * FROM asignaturas_tareas_notas
       WHERE tarea_id = ?`,
      [tareaId]
    );

    // Deserializar campo "visto" (formato PHP serialized)
    // IMPORTANTE: El sistema PHP guarda un array de alumno_id, no un objeto
    let vistos = [];
    try {
      if (tareaInfo.visto && tareaInfo.visto !== '') {
        const phpSerialize = require('php-serialize');
        const deserialized = phpSerialize.unserialize(tareaInfo.visto);
        // Asegurar que sea un array
        vistos = Array.isArray(deserialized) ? deserialized : [];
      }
    } catch (error) {
      console.warn('Error deserializando campo visto:', error);
      vistos = [];
    }

    // Agrupar entregas por alumno_id
    const entregasPorAlumno = {};
    entregas.forEach(entrega => {
      if (!entregasPorAlumno[entrega.alumno_id]) {
        entregasPorAlumno[entrega.alumno_id] = [];
      }
      entregasPorAlumno[entrega.alumno_id].push({
        id: entrega.id,
        url: entrega.url,
        nombre: entrega.nombre,
        fecha_hora: entrega.fecha_hora
      });
    });

    // Crear mapa de notas por matricula_id
    const notasPorMatricula = {};
    notas.forEach(nota => {
      notasPorMatricula[nota.matricula_id] = nota.nota;
    });

    // Combinar datos
    // IMPORTANTE: El sistema PHP guarda alumno_id en el campo visto, no matricula_id
    const alumnosConDatos = alumnos.map((alumno, index) => {
      const entregasAlumno = entregasPorAlumno[alumno.alumno_id] || [];
      const nota = notasPorMatricula[alumno.matricula_id] || '';
      // El campo visto contiene un array de alumno_id (no matricula_id)
      const visto = Array.isArray(vistos) && vistos.includes(alumno.alumno_id) ? 'SI' : 'NO';

      return {
        numero: index + 1,
        alumno_id: alumno.alumno_id,
        matricula_id: alumno.matricula_id,
        nombre_completo: alumno.nombre_completo,
        nota: nota,
        visto: visto,
        archivos: entregasAlumno
      };
    });

    res.json({
      alumnos: alumnosConDatos,
      tarea: {
        id: tareaInfo.id,
        titulo: tareaInfo.titulo,
        curso_nombre: tareaInfo.curso_nombre,
        grado: tareaInfo.grado,
        seccion: tareaInfo.seccion
      }
    });
  } catch (error) {
    console.error('Error obteniendo entregas:', error);
    res.status(500).json({ error: 'Error al obtener entregas' });
  }
});

/**
 * POST /api/docente/aula-virtual/tareas/:tareaId/marcar-visto
 * Marcar una tarea como vista por un alumno (igual que sistema PHP setView)
 * Esta ruta puede ser llamada por alumnos cuando ven los detalles de una tarea
 */
router.post('/aula-virtual/tareas/:tareaId/marcar-visto', async (req, res) => {
  try {
    const { tareaId } = req.params;
    const { alumno_id } = req.user; // El alumno_id viene del token JWT

    if (!alumno_id) {
      return res.status(400).json({ error: 'alumno_id es requerido' });
    }

    // Obtener la tarea actual
    const tarea = await query(
      `SELECT * FROM asignaturas_tareas WHERE id = ?`,
      [tareaId]
    );

    if (tarea.length === 0) {
      return res.status(404).json({ error: 'Tarea no encontrada' });
    }

    const tareaActual = tarea[0];

    // Deserializar campo "visto" (formato PHP serialized)
    // El sistema PHP guarda un array de alumno_id
    let vistos = [];
    try {
      if (tareaActual.visto && tareaActual.visto !== '') {
        const phpSerialize = require('php-serialize');
        const deserialized = phpSerialize.unserialize(tareaActual.visto);
        vistos = Array.isArray(deserialized) ? deserialized : [];
      }
    } catch (error) {
      console.warn('Error deserializando campo visto:', error);
      vistos = [];
    }

    // Si el alumno_id no está en el array, agregarlo (igual que sistema PHP)
    if (!vistos.includes(alumno_id)) {
      vistos.push(alumno_id);
      
      // Serializar el array actualizado
      const phpSerialize = require('php-serialize');
      const vistoSerializado = phpSerialize.serialize(vistos);

      // Actualizar el campo visto en la BD
      await execute(
        `UPDATE asignaturas_tareas SET visto = ? WHERE id = ?`,
        [vistoSerializado, tareaId]
      );

      console.log('✅ [TAREA VISTO] Alumno marcó tarea como vista:', {
        tarea_id: tareaId,
        alumno_id: alumno_id,
        vistos_actualizados: vistos
      });
    }

    res.json({ 
      success: true, 
      message: 'Tarea marcada como vista',
      visto: true
    });
  } catch (error) {
    console.error('Error marcando tarea como vista:', error);
    res.status(500).json({ error: 'Error al marcar tarea como vista' });
  }
});

/**
 * PUT /api/docente/aula-virtual/tareas/:tareaId/entregas/:matriculaId/nota
 * Guardar o actualizar la nota de un alumno para una tarea
 */
router.put('/aula-virtual/tareas/:tareaId/entregas/:matriculaId/nota', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { tareaId, matriculaId } = req.params;
    const { nota } = req.body;

    // Verificar que la tarea existe y pertenece a una asignatura del docente
    const tarea = await query(
      `SELECT t.*, a.grupo_id FROM asignaturas_tareas t
       INNER JOIN asignaturas a ON a.id = t.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE t.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [tareaId, personal_id, colegio_id, anio_activo]
    );

    if (tarea.length === 0) {
      return res.status(404).json({ error: 'Tarea no encontrada o sin permisos' });
    }

    const grupoIdTarea = tarea[0].grupo_id;

    // Verificar que la matrícula existe y pertenece al grupo de la tarea
    const matricula = await query(
      `SELECT m.* FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.id = ? AND m.grupo_id = ? AND m.colegio_id = ? AND g.anio = ?`,
      [matriculaId, grupoIdTarea, colegio_id, anio_activo]
    );

    if (matricula.length === 0) {
      return res.status(404).json({ error: 'Matrícula no encontrada' });
    }

    // Eliminar nota existente si hay
    await execute(
      `DELETE FROM asignaturas_tareas_notas 
       WHERE tarea_id = ? AND matricula_id = ?`,
      [tareaId, matriculaId]
    );

    // Si la nota no está vacía, insertarla
    if (nota && nota.trim() !== '') {
      await execute(
        `INSERT INTO asignaturas_tareas_notas (tarea_id, matricula_id, nota)
         VALUES (?, ?, ?)`,
        [tareaId, matriculaId, nota.trim()]
      );
    }

    // Obtener información de la tarea para la descripción
    const tareaInfo = tarea[0];

    // Registrar auditoría ANTES de guardar
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: nota && nota.trim() !== '' ? 'CREAR' : 'ELIMINAR',
      modulo: 'AULA_VIRTUAL',
      entidad: 'tarea_nota',
      entidad_id: null,
      descripcion: `${nota && nota.trim() !== '' ? 'Asignó' : 'Eliminó'} nota${nota && nota.trim() !== '' ? `: ${nota}` : ''} para tarea "${tareaInfo.titulo}" (ID: ${tareaId})`,
      url: req.originalUrl,
      metodo_http: 'PUT',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: null,
      datos_nuevos: JSON.stringify({ tarea_id: tareaId, matricula_id: matriculaId, nota }),
      resultado: 'EXITOSO'
    });

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    res.json({ message: 'Nota guardada correctamente' });
  } catch (error) {
    console.error('Error guardando nota:', error);
    res.status(500).json({ error: 'Error al guardar la nota' });
  }
});

/**
 * GET /api/docente/aula-virtual/tareas/:tareaId/asignar-registro
 * Obtener información para asignar tarea a registro (criterios e indicadores)
 */
router.get('/aula-virtual/tareas/:tareaId/asignar-registro', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { tareaId } = req.params;

    // Verificar que la tarea existe y pertenece a una asignatura del docente
    const tarea = await query(
      `SELECT t.*, a.id as asignatura_id, a.grupo_id, g.grado, g.seccion, c.nombre as curso_nombre
       FROM asignaturas_tareas t
       INNER JOIN asignaturas a ON a.id = t.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN cursos c ON c.id = a.curso_id
       WHERE t.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [tareaId, personal_id, colegio_id, anio_activo]
    );

    if (tarea.length === 0) {
      return res.status(404).json({ error: 'Tarea no encontrada o sin permisos' });
    }

    const tareaInfo = tarea[0];
    const ciclo = tareaInfo.ciclo;

    // Obtener criterios de la asignatura para este ciclo (ciclo = 0 significa todos los ciclos)
    const criterios = await query(
      `SELECT * FROM asignaturas_criterios
       WHERE asignatura_id = ? AND colegio_id = ? AND (ciclo = ? OR ciclo = 0)
       ORDER BY orden ASC, id ASC`,
      [tareaInfo.asignatura_id, colegio_id, ciclo]
    );

    // Obtener indicadores para cada criterio
    const criteriosConIndicadores = await Promise.all(criterios.map(async (criterio) => {
      const indicadores = await query(
        `SELECT * FROM asignaturas_indicadores
         WHERE criterio_id = ?
         ORDER BY id ASC`,
        [criterio.id]
      );
      return {
        ...criterio,
        indicadores: indicadores || []
      };
    }));

    res.json({
      tarea: {
        id: tareaInfo.id,
        titulo: tareaInfo.titulo,
        curso_nombre: tareaInfo.curso_nombre,
        grado: tareaInfo.grado,
        seccion: tareaInfo.seccion,
        ciclo: ciclo
      },
      asignatura_id: tareaInfo.asignatura_id,
      criterios: criteriosConIndicadores
    });
  } catch (error) {
    console.error('Error obteniendo datos para asignar registro:', error);
    res.status(500).json({ error: 'Error al obtener datos para asignar registro' });
  }
});

/**
 * POST /api/docente/aula-virtual/tareas/:tareaId/asignar-registro
 * Asignar notas de tarea al registro general de notas
 */
router.post('/aula-virtual/tareas/:tareaId/asignar-registro', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { tareaId } = req.params;
    const { criterio_id, cuadro } = req.body;

    if (!criterio_id || cuadro === undefined || cuadro === null) {
      return res.status(400).json({ error: 'criterio_id y cuadro son requeridos' });
    }

    // Verificar que la tarea existe y pertenece a una asignatura del docente
    const tarea = await query(
      `SELECT t.*, a.id as asignatura_id, a.grupo_id FROM asignaturas_tareas t
       INNER JOIN asignaturas a ON a.id = t.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE t.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [tareaId, personal_id, colegio_id, anio_activo]
    );

    if (tarea.length === 0) {
      return res.status(404).json({ error: 'Tarea no encontrada o sin permisos' });
    }

    const tareaInfo = tarea[0];
    const asignaturaId = tareaInfo.asignatura_id;
    const ciclo = tareaInfo.ciclo;
    const grupoId = tareaInfo.grupo_id;

    // Parsear criterio_id (formato: "criterio_id_indicador_id")
    const ids = criterio_id.split('_');
    if (ids.length !== 2) {
      return res.status(400).json({ error: 'Formato de criterio_id inválido' });
    }
    const criterioId = parseInt(ids[0]);
    const indicadorId = parseInt(ids[1]);
    const cuadroIndex = parseInt(cuadro); // El cuadro viene como índice (0-based)

    // Obtener todas las matrículas del grupo
    const matriculas = await query(
      `SELECT m.id as matricula_id FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.grupo_id = ? AND m.colegio_id = ? AND (m.estado = 0 OR m.estado = 4) AND g.anio = ?`,
      [grupoId, colegio_id, anio_activo]
    );

    // Obtener todas las notas de la tarea
    const notasTarea = await query(
      `SELECT * FROM asignaturas_tareas_notas WHERE tarea_id = ?`,
      [tareaId]
    );

    // Crear mapa de notas por matricula_id
    const notasPorMatricula = {};
    notasTarea.forEach(nota => {
      notasPorMatricula[nota.matricula_id] = nota.nota;
    });

    const phpSerialize = require('php-serialize');

    // Procesar cada matrícula
    for (const matricula of matriculas) {
      const matriculaId = matricula.matricula_id;
      const notaTarea = notasPorMatricula[matriculaId];

      // Si no hay nota para esta matrícula, continuar
      if (!notaTarea || notaTarea.trim() === '') {
        continue;
      }

      // Obtener o crear Nota_Detalle
      let detalles = await query(
        `SELECT * FROM notas_detalles
         WHERE matricula_id = ? AND asignatura_id = ? AND ciclo = ?`,
        [matriculaId, asignaturaId, ciclo]
      );

      let datosDetalles = {};
      if (detalles.length > 0) {
        try {
          datosDetalles = phpSerialize.unserialize(detalles[0].data) || {};
        } catch (error) {
          console.warn('Error deserializando notas_detalles:', error);
          datosDetalles = {};
        }
      }

      // Inicializar estructura si no existe
      if (!datosDetalles[criterioId]) {
        datosDetalles[criterioId] = {};
      }
      if (!datosDetalles[criterioId][indicadorId]) {
        datosDetalles[criterioId][indicadorId] = {};
      }

      // Asignar la nota en la posición del cuadro
      datosDetalles[criterioId][indicadorId][cuadroIndex] = notaTarea;

      // Serializar y guardar
      const dataSerializada = phpSerialize.serialize(datosDetalles);

      if (detalles.length > 0) {
        // Actualizar existente
        await execute(
          `UPDATE notas_detalles SET data = ? WHERE id = ?`,
          [dataSerializada, detalles[0].id]
        );
      } else {
        // Crear nuevo
        await execute(
          `INSERT INTO notas_detalles (matricula_id, asignatura_id, ciclo, data)
           VALUES (?, ?, ?, ?)`,
          [matriculaId, asignaturaId, ciclo, dataSerializada]
        );
      }
    }

    // Recalcular promedios de criterios y promedio final (similar a DocenteCursos)
    // Esto se puede hacer llamando a la misma lógica que se usa al guardar notas
    // Por ahora, solo guardamos los detalles y el sistema recalculará cuando se abra el registro

    // Registrar auditoría ANTES de responder (tareaInfo ya está declarado arriba)
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'ACTUALIZAR',
      modulo: 'AULA_VIRTUAL',
      entidad: 'notas_detalles',
      entidad_id: null,
      descripcion: `Asignó notas de tarea "${tareaInfo.titulo}" (ID: ${tareaId}) al registro - Criterio: ${criterioId}, Indicador: ${indicadorId}, Cuadro: ${cuadroIndex}`,
      url: req.originalUrl,
      metodo_http: 'POST',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: null,
      datos_nuevos: JSON.stringify({ tarea_id: tareaId, criterio_id, indicador_id: indicadorId, cuadro: cuadroIndex }),
      resultado: 'EXITOSO'
    });

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    res.json({ message: 'Notas asignadas al registro correctamente' });
  } catch (error) {
    console.error('Error asignando notas al registro:', error);
    res.status(500).json({ error: 'Error al asignar notas al registro' });
  }
});

/**
 * GET /api/docente/aula-virtual/examenes/:examenId/asignar-registro
 * Obtener información para asignar examen a registro (criterios e indicadores)
 */
router.get('/aula-virtual/examenes/:examenId/asignar-registro', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { examenId } = req.params;

    // Verificar que el examen existe y pertenece a una asignatura del docente
    const examen = await query(
      `SELECT ae.*, a.id as asignatura_id, a.grupo_id, g.grado, g.seccion, c.nombre as curso_nombre
       FROM asignaturas_examenes ae
       INNER JOIN asignaturas a ON a.id = ae.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN cursos c ON c.id = a.curso_id
       WHERE ae.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [examenId, personal_id, colegio_id, anio_activo]
    );

    if (examen.length === 0) {
      return res.status(404).json({ error: 'Examen no encontrado o sin permisos' });
    }

    const examenInfo = examen[0];
    const ciclo = examenInfo.ciclo;

    // Obtener criterios de la asignatura para este ciclo (ciclo = 0 significa todos los ciclos)
    const criterios = await query(
      `SELECT * FROM asignaturas_criterios
       WHERE asignatura_id = ? AND colegio_id = ? AND (ciclo = ? OR ciclo = 0)
       ORDER BY orden ASC, id ASC`,
      [examenInfo.asignatura_id, colegio_id, ciclo]
    );

    // Obtener indicadores para cada criterio
    const criteriosConIndicadores = await Promise.all(criterios.map(async (criterio) => {
      const indicadores = await query(
        `SELECT * FROM asignaturas_indicadores
         WHERE criterio_id = ?
         ORDER BY id ASC`,
        [criterio.id]
      );
      return {
        ...criterio,
        indicadores: indicadores || []
      };
    }));

    res.json({
      examen: {
        id: examenInfo.id,
        titulo: examenInfo.titulo,
        curso_nombre: examenInfo.curso_nombre,
        grado: examenInfo.grado,
        seccion: examenInfo.seccion,
        ciclo: ciclo
      },
      asignatura_id: examenInfo.asignatura_id,
      criterios: criteriosConIndicadores
    });
  } catch (error) {
    console.error('Error obteniendo datos para asignar registro:', error);
    res.status(500).json({ error: 'Error al obtener datos para asignar registro' });
  }
});

/**
 * POST /api/docente/aula-virtual/examenes/:examenId/asignar-registro
 * Asignar notas de examen al registro general de notas
 */
router.post('/aula-virtual/examenes/:examenId/asignar-registro', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { examenId } = req.params;
    const { criterio_id, cuadro } = req.body;

    if (!criterio_id || cuadro === undefined || cuadro === null) {
      return res.status(400).json({ error: 'criterio_id y cuadro son requeridos' });
    }

    // Verificar que el examen existe y pertenece a una asignatura del docente
    const examen = await query(
      `SELECT ae.*, a.id as asignatura_id, a.grupo_id FROM asignaturas_examenes ae
       INNER JOIN asignaturas a ON a.id = ae.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE ae.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [examenId, personal_id, colegio_id, anio_activo]
    );

    if (examen.length === 0) {
      return res.status(404).json({ error: 'Examen no encontrado o sin permisos' });
    }

    const examenInfo = examen[0];
    const asignaturaId = examenInfo.asignatura_id;
    const ciclo = examenInfo.ciclo;
    const grupoId = examenInfo.grupo_id;

    // Parsear criterio_id (formato: "criterio_id_indicador_id")
    const ids = criterio_id.split('_');
    if (ids.length !== 2) {
      return res.status(400).json({ error: 'Formato de criterio_id inválido' });
    }
    const criterioId = parseInt(ids[0]);
    const indicadorId = parseInt(ids[1]);
    const cuadroIndex = parseInt(cuadro); // El cuadro viene como índice (0-based)

    // Obtener todas las matrículas del grupo
    const matriculas = await query(
      `SELECT m.id as matricula_id FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.grupo_id = ? AND m.colegio_id = ? AND (m.estado = 0 OR m.estado = 4) AND g.anio = ?`,
      [grupoId, colegio_id, anio_activo]
    );

    // Obtener el mejor puntaje de cada alumno para este examen
    // El mejor puntaje es el mayor puntaje de todas las pruebas del alumno
    const mejoresPuntajes = await query(
      `SELECT 
        aep.matricula_id,
        MAX(aep.puntaje) as mejor_puntaje
       FROM asignaturas_examenes_pruebas aep
       WHERE aep.examen_id = ?
       GROUP BY aep.matricula_id`,
      [examenId]
    );

    // Crear mapa de mejores puntajes por matricula_id
    const puntajesPorMatricula = {};
    mejoresPuntajes.forEach(resultado => {
      puntajesPorMatricula[resultado.matricula_id] = resultado.mejor_puntaje;
    });

    const phpSerialize = require('php-serialize');

    // Procesar cada matrícula
    for (const matricula of matriculas) {
      const matriculaId = matricula.matricula_id;
      const mejorPuntaje = puntajesPorMatricula[matriculaId];

      // Si no hay puntaje para esta matrícula, continuar
      if (!mejorPuntaje || mejorPuntaje === null || mejorPuntaje === undefined) {
        continue;
      }

      // Limitar el puntaje entre 0 y 20 (como en el sistema)
      let puntajeFinal = parseFloat(mejorPuntaje);
      if (puntajeFinal < 0) puntajeFinal = 0;
      if (puntajeFinal > 20) puntajeFinal = 20;

      // Obtener o crear Nota_Detalle
      let detalles = await query(
        `SELECT * FROM notas_detalles
         WHERE matricula_id = ? AND asignatura_id = ? AND ciclo = ?`,
        [matriculaId, asignaturaId, ciclo]
      );

      let datosDetalles = {};
      if (detalles.length > 0) {
        try {
          datosDetalles = phpSerialize.unserialize(detalles[0].data) || {};
        } catch (error) {
          console.warn('Error deserializando notas_detalles:', error);
          datosDetalles = {};
        }
      }

      // Inicializar estructura si no existe
      if (!datosDetalles[criterioId]) {
        datosDetalles[criterioId] = {};
      }
      if (!datosDetalles[criterioId][indicadorId]) {
        datosDetalles[criterioId][indicadorId] = {};
      }

      // Asignar el puntaje en la posición del cuadro
      datosDetalles[criterioId][indicadorId][cuadroIndex] = puntajeFinal.toString();

      // Serializar y guardar
      const dataSerializada = phpSerialize.serialize(datosDetalles);

      if (detalles.length > 0) {
        // Actualizar existente
        await execute(
          `UPDATE notas_detalles SET data = ? WHERE id = ?`,
          [dataSerializada, detalles[0].id]
        );
      } else {
        // Crear nuevo
        await execute(
          `INSERT INTO notas_detalles (matricula_id, asignatura_id, ciclo, data)
           VALUES (?, ?, ?, ?)`,
          [matriculaId, asignaturaId, ciclo, dataSerializada]
        );
      }
    }

    // Registrar auditoría ANTES de responder
    req.skipAudit = true;
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'ACTUALIZAR',
      modulo: 'AULA_VIRTUAL',
      entidad: 'notas_detalles',
      entidad_id: null,
      descripcion: `Asignó notas de examen "${examenInfo.titulo}" (ID: ${examenId}) al registro - Criterio: ${criterioId}, Indicador: ${indicadorId}, Cuadro: ${cuadroIndex}`,
      url: req.originalUrl,
      metodo_http: 'POST',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: null,
      datos_nuevos: JSON.stringify({ examen_id: examenId, criterio_id, indicador_id: indicadorId, cuadro: cuadroIndex }),
      resultado: 'EXITOSO'
    }).catch(err => console.error('Error en auditoría:', err));

    res.json({ message: 'Notas asignadas al registro correctamente' });
  } catch (error) {
    console.error('Error asignando notas al registro:', error);
    res.status(500).json({ error: 'Error al asignar notas al registro' });
  }
});

/**
 * GET /api/docente/aula-virtual/examenes
 * Obtener exámenes de una asignatura (filtrados por ciclo/bimestre)
 */
router.get('/aula-virtual/examenes', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo } = req.user;
    const { asignatura_id, ciclo } = req.query;

    if (!asignatura_id) {
      return res.status(400).json({ error: 'asignatura_id es requerido' });
    }

    // Si no se proporciona ciclo, usar 1 por defecto
    const cicloFiltro = ciclo ? parseInt(ciclo) : 1;

    // Verificar que el docente tiene acceso a esta asignatura
    const asignatura = await query(
      `SELECT a.* FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [asignatura_id, req.user.personal_id, colegio_id, anio_activo]
    );

    if (asignatura.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a esta asignatura' });
    }

    // Obtener exámenes de la asignatura filtrados por ciclo con conteo de preguntas
    // IMPORTANTE: Habilitar automáticamente exámenes cuando llega la fecha/hora de inicio
    // Usar CONVERT_TZ para trabajar con zona horaria de Lima (UTC-5)
    const examenes = await query(
      `SELECT ae.*, 
              COUNT(DISTINCT ep.id) as total_preguntas
       FROM asignaturas_examenes ae
       LEFT JOIN asignaturas_examenes_preguntas ep ON ep.examen_id = ae.id
       WHERE ae.asignatura_id = ? AND ae.ciclo = ?
       GROUP BY ae.id
       ORDER BY ae.id ASC`,
      [asignatura_id, cicloFiltro]
    );

    // Habilitar automáticamente exámenes que llegaron a su fecha/hora de inicio
    // Solo si tienen fecha_desde y hora_desde válidas (no 0000-00-00)
    // Usar moment-timezone para obtener la hora actual en Lima de forma precisa
    const moment = require('moment-timezone');
    const ahoraLima = moment.tz('America/Lima');
    const fechaActual = ahoraLima.format('YYYY-MM-DD');
    const horaActual = ahoraLima.format('HH:mm');
    const fechaHoraActual = ahoraLima.format('YYYY-MM-DD HH:mm:ss');

    for (const examen of examenes) {
      try {
        // Convertir fecha_desde a string si es necesario (puede venir como Date object desde MySQL)
        let fechaDesdeStr = '';
        if (examen.fecha_desde) {
          if (typeof examen.fecha_desde === 'string') {
            // Validar que no sea una fecha inválida de MySQL (0000-00-00)
            if (examen.fecha_desde !== '0000-00-00' && examen.fecha_desde !== '0000-00-00 00:00:00') {
              fechaDesdeStr = examen.fecha_desde.split(' ')[0]; // Solo la fecha, sin hora
            }
          } else if (examen.fecha_desde instanceof Date) {
            // Verificar que la fecha sea válida antes de convertir
            if (!isNaN(examen.fecha_desde.getTime())) {
              fechaDesdeStr = examen.fecha_desde.toISOString().split('T')[0];
            }
            // Si la fecha es inválida, simplemente no procesar este examen (fechaDesdeStr queda vacío)
          } else {
            // Intentar convertir a string
            const fechaStr = String(examen.fecha_desde);
            if (fechaStr !== '0000-00-00' && fechaStr !== '0000-00-00 00:00:00') {
              fechaDesdeStr = fechaStr.split(' ')[0];
            }
          }
        }

        // Convertir hora_desde a string si es necesario
        let horaDesdeStr = '';
        if (examen.hora_desde) {
          if (typeof examen.hora_desde === 'string') {
            horaDesdeStr = examen.hora_desde;
          } else {
            horaDesdeStr = String(examen.hora_desde);
          }
        }

        // Solo procesar si el examen está INACTIVO y tiene fecha/hora válidas (no 0000-00-00)
        if (examen.estado === 'INACTIVO' && 
            fechaDesdeStr && 
            fechaDesdeStr !== '0000-00-00' && 
            fechaDesdeStr !== '0000-00-00 00:00:00' &&
            fechaDesdeStr.trim() !== '' &&
            horaDesdeStr && 
            horaDesdeStr !== '00:00:00' &&
            horaDesdeStr.trim() !== '') {
          
          // Construir fecha/hora de inicio y fin del examen
          const fechaInicio = fechaDesdeStr.split(' ')[0].trim(); // Solo la fecha
          const horaInicio = horaDesdeStr.substring(0, 5); // HH:MM
          
          // Obtener fecha/hora de fin
          let fechaHastaStr = '';
          let horaHastaStr = '';
          if (examen.fecha_hasta) {
            if (typeof examen.fecha_hasta === 'string') {
              // Validar que no sea una fecha inválida de MySQL (0000-00-00)
              if (examen.fecha_hasta !== '0000-00-00' && examen.fecha_hasta !== '0000-00-00 00:00:00') {
                fechaHastaStr = examen.fecha_hasta.split(' ')[0]; // Solo la fecha, sin hora
              }
            } else if (examen.fecha_hasta instanceof Date) {
              // Verificar que la fecha sea válida antes de convertir
              if (!isNaN(examen.fecha_hasta.getTime())) {
                fechaHastaStr = examen.fecha_hasta.toISOString().split('T')[0];
              }
              // Si la fecha es inválida, simplemente no procesar (fechaHastaStr queda vacío)
            } else {
              const fechaStr = String(examen.fecha_hasta);
              if (fechaStr !== '0000-00-00' && fechaStr !== '0000-00-00 00:00:00') {
                fechaHastaStr = fechaStr.split(' ')[0];
              }
            }
          }
          if (examen.hora_hasta) {
            if (typeof examen.hora_hasta === 'string') {
              horaHastaStr = examen.hora_hasta;
            } else {
              horaHastaStr = String(examen.hora_hasta);
            }
          }
          
          const fechaFin = fechaHastaStr.split(' ')[0].trim();
          const horaFin = horaHastaStr.substring(0, 5);
          
          // Validar que las fechas sean válidas (no 0000-00-00)
          if (fechaInicio === '0000-00-00' || fechaInicio === '' || fechaFin === '0000-00-00' || fechaFin === '') {
            continue; // Saltar este examen
          }
          
          // Comparar fecha y hora usando moment-timezone para precisión
          // IMPORTANTE: Usar zona horaria de Lima para la comparación
          const fechaInicioMoment = moment.tz(`${fechaInicio} ${horaInicio}:00`, 'YYYY-MM-DD HH:mm:ss', 'America/Lima');
          const fechaFinMoment = moment.tz(`${fechaFin} ${horaFin}:00`, 'YYYY-MM-DD HH:mm:ss', 'America/Lima');
          
          // Validar que las fechas sean válidas
          if (!fechaInicioMoment.isValid() || !fechaFinMoment.isValid()) {
            console.warn(`⚠️ Fecha inválida para examen ${examen.id}: fecha_desde=${fechaDesdeStr}, hora_desde=${horaDesdeStr}, fecha_hasta=${fechaHastaStr}, hora_hasta=${horaHastaStr}`);
            continue;
          }
          
          // IMPORTANTE: Solo habilitar si estamos DENTRO del rango de fechas/horas
          // - La fecha/hora de inicio ya pasó (al menos 1 minuto)
          // - La fecha/hora de fin aún no ha llegado
          const diferenciaInicioMs = ahoraLima.diff(fechaInicioMoment, 'milliseconds');
          const diferenciaFinMs = fechaFinMoment.diff(ahoraLima, 'milliseconds');
          
          // Log para debugging
          console.log(`🔍 [DEBUG] Examen ${examen.id} "${examen.titulo}":`, {
            fechaInicio: fechaInicioMoment.format('YYYY-MM-DD HH:mm:ss'),
            fechaFin: fechaFinMoment.format('YYYY-MM-DD HH:mm:ss'),
            ahora: ahoraLima.format('YYYY-MM-DD HH:mm:ss'),
            diferenciaInicioMs: diferenciaInicioMs,
            diferenciaFinMs: diferenciaFinMs,
            diferenciaInicioMin: (diferenciaInicioMs / 60000).toFixed(2),
            diferenciaFinMin: (diferenciaFinMs / 60000).toFixed(2)
          });
          
          // Solo habilitar si:
          // 1. Pasó al menos 1 minuto desde la fecha/hora de inicio (diferenciaInicioMs >= 60000)
          // 2. Aún no ha llegado la fecha/hora de fin (diferenciaFinMs > 0)
          if (diferenciaInicioMs >= 60000 && diferenciaFinMs > 0) {
            try {
              await execute(
                `UPDATE asignaturas_examenes SET estado = 'ACTIVO' WHERE id = ?`,
                [examen.id]
              );
              console.log(`✅ Examen "${examen.titulo}" (ID: ${examen.id}) habilitado automáticamente (dentro del rango: ${fechaInicio} ${horaInicio} - ${fechaFin} ${horaFin}, ahora: ${fechaActual} ${horaActual})`);
              examen.estado = 'ACTIVO'; // Actualizar en el objeto para la respuesta
            } catch (error) {
              console.error(`Error habilitando examen ${examen.id}:`, error);
            }
          } else if (diferenciaInicioMs < 0) {
            // La fecha/hora de inicio es futura
            console.log(`⏳ Examen "${examen.titulo}" (ID: ${examen.id}) aún no inicia. Faltan ${Math.abs(diferenciaInicioMs / 60000).toFixed(1)} minutos`);
          } else if (diferenciaFinMs <= 0) {
            // La fecha/hora de fin ya pasó, desactivar el examen
            if (examen.estado === 'ACTIVO') {
              try {
                await execute(
                  `UPDATE asignaturas_examenes SET estado = 'INACTIVO' WHERE id = ?`,
                  [examen.id]
                );
                console.log(`⏰ Examen "${examen.titulo}" (ID: ${examen.id}) desactivado automáticamente (fecha/hora fin ya pasó: ${fechaFin} ${horaFin})`);
                examen.estado = 'INACTIVO'; // Actualizar en el objeto para la respuesta
              } catch (error) {
                console.error(`Error desactivando examen ${examen.id}:`, error);
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error procesando examen ${examen.id} para habilitación automática:`, error);
        // Continuar con el siguiente examen en lugar de fallar todo
      }
    }

    // Construir URLs completas para los archivos PDF (usando PHP_SYSTEM_URL para compatibilidad con sistema anterior)
    const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://nuevo.vanguardschools.edu.pe';
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const examenesConUrls = examenes.map(examen => {
      let archivoPdfUrl = null;
      
      if (examen.archivo_pdf && examen.archivo_pdf !== '') {
        if (examen.archivo_pdf.startsWith('http')) {
          // Ya es una URL completa, validar y corregir dominio si es necesario
          archivoPdfUrl = examen.archivo_pdf
            .replace(/https?:\/\/(www\.)?vanguardschools\.edu\.pe/gi, phpSystemUrl)
            .replace(/vanguardschools\.comstatic/gi, `${phpSystemUrl}/Static`)
            .replace(/vanguardschools\.com\/static/gi, `${phpSystemUrl}/Static`)
            .replace(/vanguardschools\.com\/Static/gi, `${phpSystemUrl}/Static`);
        } else if (examen.archivo_pdf.startsWith('/uploads/')) {
          // Ruta relativa desde /uploads/ (formato antiguo, migrar a /Static/Archivos/)
          archivoPdfUrl = isDevelopment
            ? `http://localhost:5000${examen.archivo_pdf}`
            : `${phpSystemUrl}${examen.archivo_pdf}`;
        } else if (examen.archivo_pdf.startsWith('/Static/')) {
          // Ruta del sistema compartido (correcto)
          archivoPdfUrl = isDevelopment
            ? `http://localhost:5000${examen.archivo_pdf}`
            : `${phpSystemUrl}${examen.archivo_pdf}`;
        } else {
          // Solo el nombre del archivo (compatibilidad con sistema antiguo)
          archivoPdfUrl = isDevelopment
            ? `http://localhost:5000/Static/Archivos/${examen.archivo_pdf}`
            : `${phpSystemUrl}/Static/Archivos/${examen.archivo_pdf}`;
        }
      }
      
      return {
        ...examen,
        archivo_pdf_url: archivoPdfUrl
      };
    });

    res.json({ examenes: examenesConUrls || [] });
  } catch (error) {
    console.error('Error obteniendo exámenes:', error);
    res.status(500).json({ error: 'Error al obtener exámenes' });
  }
});

/**
 * POST /api/docente/aula-virtual/examenes
 * Crear un nuevo examen
 */
router.post('/aula-virtual/examenes', uploadAulaVirtual.single('archivo_pdf'), async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { 
      asignatura_id, 
      titulo, 
      tipo, 
      tipo_puntaje, 
      puntos_correcta, 
      penalizar_incorrecta, 
      penalizacion_incorrecta, 
      tiempo, 
      intentos, 
      orden_preguntas, 
      preguntas_max, 
      ciclo,
      estado,
      habilitar_fecha_hora,
      fecha_desde,
      fecha_hasta,
      hora_desde,
      hora_hasta
    } = req.body;

    if (!asignatura_id || !titulo || !tipo || !ciclo || !estado) {
      return res.status(400).json({ error: 'asignatura_id, titulo, tipo, ciclo y estado son requeridos' });
    }

    // Si es PDF, debe tener archivo
    if (tipo === 'PDF' && !req.file) {
      return res.status(400).json({ error: 'Debe subir un archivo PDF para exámenes tipo PDF' });
    }

    // Si es VIRTUAL, validar campos requeridos
    if (tipo === 'VIRTUAL') {
      if (!tipo_puntaje || !tiempo) {
        return res.status(400).json({ error: 'tipo_puntaje y tiempo son requeridos para exámenes virtuales' });
      }
      // Si es GENERAL, también requiere puntos_correcta
      if (tipo_puntaje === 'GENERAL' && (!puntos_correcta || parseFloat(puntos_correcta) <= 0)) {
        return res.status(400).json({ error: 'puntos_correcta es requerido cuando tipo_puntaje es GENERAL' });
      }
    }

    // Verificar que el docente tiene acceso a esta asignatura
    const asignatura = await query(
      `SELECT a.* FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [asignatura_id, personal_id, colegio_id, anio_activo]
    );

    if (asignatura.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a esta asignatura' });
    }

    // Preparar valores para fecha y hora
    // Las columnas fecha_desde, fecha_hasta, hora_desde, hora_hasta son NOT NULL en la BD
    // Si no se habilita fecha y hora, usar valores por defecto (fecha actual y horas por defecto)
    let fechaDesde, fechaHasta, horaDesde, horaHasta;

    if (habilitar_fecha_hora === 'SI' || habilitar_fecha_hora === true) {
      // Si está habilitado, validar que los valores estén presentes
      if (!fecha_desde || !fecha_hasta || !hora_desde || !hora_hasta) {
        return res.status(400).json({ error: 'Si habilita fecha y hora, debe proporcionar fecha_desde, fecha_hasta, hora_desde y hora_hasta' });
      }
      fechaDesde = fecha_desde;
      fechaHasta = fecha_hasta;
      horaDesde = hora_desde;
      horaHasta = hora_hasta;
      
      // IMPORTANTE: Si se configuran fechas/horas, el estado debe ser INACTIVO automáticamente
      // El examen solo se activará automáticamente cuando esté dentro del rango de fechas/horas
      if (estado === 'ACTIVO') {
        console.log(`⚠️ Examen con fecha/hora configurada: forzando estado a INACTIVO (se activará automáticamente cuando llegue la hora)`);
        estado = 'INACTIVO';
      }
    } else {
      // Si no está habilitado, usar valores por defecto específicos
      fechaDesde = '0000-00-00';
      fechaHasta = '0000-00-00';
      horaDesde = '00:00:00';
      horaHasta = '00:00:00';
    }

    // Preparar archivo PDF si existe
    // IMPORTANTE: Guardar solo el nombre del archivo (compatible con sistema PHP)
    // El sistema PHP guarda solo el nombre: $archivo['new_name']
    let archivoPdf = '';
    if (req.file) {
      archivoPdf = req.file.filename; // Solo el nombre del archivo, sin ruta
      console.log('📄 [AULA VIRTUAL EXAMEN PDF] Archivo guardado (solo nombre):', {
        filename: req.file.filename,
        originalname: req.file.originalname,
        path_en_bd: archivoPdf, // Esto es lo que se guarda en la BD
        size: req.file.size
      });
    }

    // Valores por defecto para campos opcionales
    const tipoPuntaje = tipo === 'VIRTUAL' ? (tipo_puntaje || 'INDIVIDUAL') : 'INDIVIDUAL';
    // Si es INDIVIDUAL, usar 0 (el puntaje se asigna en cada pregunta)
    // Si es GENERAL, usar el valor proporcionado o 1.0 por defecto
    const puntosCorrecta = tipo === 'VIRTUAL' 
      ? (tipo_puntaje === 'GENERAL' ? (parseFloat(puntos_correcta) || 1.0) : 0.0)
      : 1.0;
    const penalizarIncorrecta = tipo === 'VIRTUAL' ? (penalizar_incorrecta || 'NO') : 'NO';
    const penalizacionIncorrecta = tipo === 'VIRTUAL' ? (parseFloat(penalizacion_incorrecta) || 0.0) : 0.0;
    const tiempoExamen = tipo === 'VIRTUAL' ? (parseInt(tiempo) || 60) : 0;
    const intentosExamen = tipo === 'VIRTUAL' ? (parseInt(intentos) || 1) : 1;
    const ordenPreguntas = tipo === 'VIRTUAL' ? (orden_preguntas || 'PREDETERMINADO') : 'PREDETERMINADO';
    const preguntasMax = tipo === 'VIRTUAL' ? (parseInt(preguntas_max) || 1) : 1;

    // Preparar datos nuevos para auditoría
    const datosNuevos = {
      titulo,
      tipo,
      tipo_puntaje: tipoPuntaje,
      puntos_correcta: puntosCorrecta,
      penalizar_incorrecta: penalizarIncorrecta,
      penalizacion_incorrecta: penalizacionIncorrecta,
      tiempo: tiempoExamen,
      intentos: intentosExamen,
      estado,
      orden_preguntas: ordenPreguntas,
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
      hora_desde: horaDesde,
      hora_hasta: horaHasta,
      ciclo: parseInt(ciclo),
      preguntas_max: preguntasMax,
      archivo_pdf: archivoPdf
    };

    // Registrar acción en auditoría ANTES de crear el examen
    // Usaremos null para entidad_id temporalmente y lo actualizaremos después
    const ahora = new Date();
    const fecha = ahora.toISOString().split('T')[0];
    const hora = ahora.toTimeString().split(' ')[0];
    
    const auditoriaResult = await execute(
      `INSERT INTO auditoria_logs (
        usuario_id, colegio_id, tipo_usuario, accion, modulo, entidad, entidad_id,
        descripcion, url, metodo_http, ip_address, user_agent,
        datos_anteriores, datos_nuevos, resultado, mensaje_error, duracion_ms,
        fecha_hora, fecha, hora
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        usuario_id,
        colegio_id,
        req.user.tipo || 'DOCENTE',
        'CREAR',
        'AULA_VIRTUAL',
        'examen',
        null, // Temporalmente null, se actualizará después
        `Creó examen: "${titulo}" (${tipo})`,
        req.originalUrl,
        'POST',
        req.ip || req.connection.remoteAddress,
        req.get('user-agent'),
        null,
        JSON.stringify(datosNuevos),
        'EXITOSO',
        null,
        null,
        ahora,
        fecha,
        hora,
      ]
    );

    // Insertar el examen
    const result = await execute(
      `INSERT INTO asignaturas_examenes 
       (trabajador_id, titulo, tipo_puntaje, puntos_correcta, penalizar_incorrecta, penalizacion_incorrecta, 
        tiempo, intentos, estado, orden_preguntas, fecha_desde, fecha_hasta, hora_desde, hora_hasta, 
        asignatura_id, ciclo, preguntas_max, tipo, archivo_pdf)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        personal_id,
        titulo,
        tipoPuntaje,
        puntosCorrecta,
        penalizarIncorrecta,
        penalizacionIncorrecta,
        tiempoExamen,
        intentosExamen,
        estado,
        ordenPreguntas,
        fechaDesde,
        fechaHasta,
        horaDesde,
        horaHasta,
        asignatura_id,
        parseInt(ciclo),
        preguntasMax,
        tipo,
        archivoPdf
      ]
    );

    // Actualizar el registro de auditoría con el ID del examen creado
    await execute(
      `UPDATE auditoria_logs SET entidad_id = ? WHERE id = ?`,
      [result.insertId, auditoriaResult.insertId]
    );

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;
    
    // Crear notificaciones de forma asíncrona
    setImmediate(async () => {
      await crearNotificacionesAulaVirtual({
        asignatura_id,
        tipo: 'examen',
        nombre: titulo,
        usuario_id,
        colegio_id,
        anio_activo,
        entidad_id: result.insertId
      });
    });
    
    res.json({ 
      success: true, 
      message: 'Examen creado correctamente',
      examen_id: result.insertId 
    });
  } catch (error) {
    console.error('Error creando examen:', error);
    res.status(500).json({ error: 'Error al crear examen' });
  }
});

/**
 * PUT /api/docente/aula-virtual/examenes/:examenId
 * Actualizar un examen existente
 */
router.put('/aula-virtual/examenes/:examenId', uploadAulaVirtual.single('archivo_pdf'), async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { examenId } = req.params;
    const { 
      titulo, 
      tipo, 
      tipo_puntaje, 
      puntos_correcta, 
      penalizar_incorrecta, 
      penalizacion_incorrecta, 
      tiempo, 
      intentos, 
      orden_preguntas, 
      preguntas_max, 
      ciclo,
      estado,
      habilitar_fecha_hora,
      fecha_desde,
      fecha_hasta,
      hora_desde,
      hora_hasta
    } = req.body;

    if (!titulo || !tipo || !ciclo || !estado) {
      return res.status(400).json({ error: 'titulo, tipo, ciclo y estado son requeridos' });
    }

    // Verificar que el examen existe y pertenece a una asignatura del docente
    const examen = await query(
      `SELECT ae.* FROM asignaturas_examenes ae
       INNER JOIN asignaturas a ON a.id = ae.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE ae.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [examenId, personal_id, colegio_id, anio_activo]
    );

    if (examen.length === 0) {
      return res.status(404).json({ error: 'Examen no encontrado o sin permisos' });
    }

    // Si es PDF y se sube un nuevo archivo, validar
    if (tipo === 'PDF' && !req.file && !examen[0].archivo_pdf) {
      return res.status(400).json({ error: 'Debe subir un archivo PDF para exámenes tipo PDF' });
    }

    // Si es VIRTUAL, validar campos requeridos
    if (tipo === 'VIRTUAL') {
      if (!tipo_puntaje || !tiempo) {
        return res.status(400).json({ error: 'tipo_puntaje y tiempo son requeridos para exámenes virtuales' });
      }
      // Si es GENERAL, también requiere puntos_correcta
      if (tipo_puntaje === 'GENERAL' && (!puntos_correcta || parseFloat(puntos_correcta) <= 0)) {
        return res.status(400).json({ error: 'puntos_correcta es requerido cuando tipo_puntaje es GENERAL' });
      }
    }

    // Preparar valores para fecha y hora
    let fechaDesde, fechaHasta, horaDesde, horaHasta;

    if (habilitar_fecha_hora === 'SI' || habilitar_fecha_hora === true) {
      // Si está habilitado, validar que los valores estén presentes
      if (!fecha_desde || !fecha_hasta || !hora_desde || !hora_hasta) {
        return res.status(400).json({ error: 'Si habilita fecha y hora, debe proporcionar fecha_desde, fecha_hasta, hora_desde y hora_hasta' });
      }
      fechaDesde = fecha_desde;
      fechaHasta = fecha_hasta;
      horaDesde = hora_desde;
      horaHasta = hora_hasta;
      
      // IMPORTANTE: Si se configuran fechas/horas, el estado debe ser INACTIVO automáticamente
      // El examen solo se activará automáticamente cuando esté dentro del rango de fechas/horas
      if (estado === 'ACTIVO') {
        console.log(`⚠️ Examen con fecha/hora configurada: forzando estado a INACTIVO (se activará automáticamente cuando llegue la hora)`);
        estado = 'INACTIVO';
      }
    } else {
      // Si no está habilitado, usar valores por defecto específicos
      fechaDesde = '0000-00-00';
      fechaHasta = '0000-00-00';
      horaDesde = '00:00:00';
      horaHasta = '00:00:00';
    }

    // Preparar archivo PDF si existe
    let archivoPdf = examen[0].archivo_pdf; // Mantener el archivo existente por defecto
    if (req.file) {
      // IMPORTANTE: Guardar solo el nombre del archivo (compatible con sistema PHP)
      archivoPdf = req.file.filename; // Solo el nombre del archivo, sin ruta
      console.log('📄 [AULA VIRTUAL EXAMEN PDF] Archivo actualizado (solo nombre):', {
        filename: req.file.filename,
        originalname: req.file.originalname,
        path_en_bd: archivoPdf,
        size: req.file.size
      });
      // TODO: Eliminar archivo anterior si existe
    }

    // Valores por defecto para campos opcionales
    const tipoPuntaje = tipo === 'VIRTUAL' ? (tipo_puntaje || 'INDIVIDUAL') : 'INDIVIDUAL';
    const puntosCorrecta = tipo === 'VIRTUAL' 
      ? (tipo_puntaje === 'GENERAL' ? (parseFloat(puntos_correcta) || 1.0) : 0.0)
      : 1.0;
    const penalizarIncorrecta = tipo === 'VIRTUAL' ? (penalizar_incorrecta || 'NO') : 'NO';
    const penalizacionIncorrecta = tipo === 'VIRTUAL' ? (parseFloat(penalizacion_incorrecta) || 0.0) : 0.0;
    const tiempoExamen = tipo === 'VIRTUAL' ? (parseInt(tiempo) || 60) : 0;
    const intentosExamen = tipo === 'VIRTUAL' ? (parseInt(intentos) || 1) : 1;
    const ordenPreguntas = tipo === 'VIRTUAL' ? (orden_preguntas || 'PREDETERMINADO') : 'PREDETERMINADO';
    const preguntasMax = tipo === 'VIRTUAL' ? (parseInt(preguntas_max) || 1) : 1;

    // Preparar datos nuevos para auditoría
    const datosNuevos = {
      titulo,
      tipo,
      tipo_puntaje: tipoPuntaje,
      puntos_correcta: puntosCorrecta,
      penalizar_incorrecta: penalizarIncorrecta,
      penalizacion_incorrecta: penalizacionIncorrecta,
      tiempo: tiempoExamen,
      intentos: intentosExamen,
      estado,
      orden_preguntas: ordenPreguntas,
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
      hora_desde: horaDesde,
      hora_hasta: horaHasta,
      ciclo: parseInt(ciclo),
      preguntas_max: preguntasMax,
      archivo_pdf: archivoPdf
    };

    // Registrar acción en auditoría ANTES de actualizar
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'EDITAR',
      modulo: 'AULA_VIRTUAL',
      entidad: 'examen',
      entidad_id: parseInt(examenId),
      descripcion: `Editó examen: "${examen[0].titulo}" (ID: ${examenId})`,
      url: req.originalUrl,
      metodo_http: 'PUT',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(examen[0]),
      datos_nuevos: JSON.stringify(datosNuevos),
      resultado: 'EXITOSO'
    });

    // Actualizar el examen
    await execute(
      `UPDATE asignaturas_examenes 
       SET titulo = ?, tipo_puntaje = ?, puntos_correcta = ?, penalizar_incorrecta = ?, 
           penalizacion_incorrecta = ?, tiempo = ?, intentos = ?, estado = ?, 
           orden_preguntas = ?, fecha_desde = ?, fecha_hasta = ?, hora_desde = ?, 
           hora_hasta = ?, ciclo = ?, preguntas_max = ?, tipo = ?, archivo_pdf = ?
       WHERE id = ?`,
      [
        titulo,
        tipoPuntaje,
        puntosCorrecta,
        penalizarIncorrecta,
        penalizacionIncorrecta,
        tiempoExamen,
        intentosExamen,
        estado,
        ordenPreguntas,
        fechaDesde,
        fechaHasta,
        horaDesde,
        horaHasta,
        parseInt(ciclo),
        preguntasMax,
        tipo,
        archivoPdf,
        examenId
      ]
    );

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;
    
    res.json({ 
      success: true, 
      message: 'Examen actualizado correctamente'
    });
  } catch (error) {
    console.error('Error actualizando examen:', error);
    res.status(500).json({ error: 'Error al actualizar examen' });
  }
});

/**
 * PUT /api/docente/aula-virtual/examenes/:examenId/estado
 * Cambiar estado de un examen (ACTIVO/INACTIVO)
 */
router.put('/aula-virtual/examenes/:examenId/estado', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { examenId } = req.params;
    const { estado } = req.body; // 'ACTIVO' o 'INACTIVO'

    if (!estado || !['ACTIVO', 'INACTIVO'].includes(estado)) {
      return res.status(400).json({ error: 'Estado inválido. Debe ser ACTIVO o INACTIVO' });
    }

    // Verificar que el examen existe y pertenece a una asignatura del docente
    const examen = await query(
      `SELECT ae.* FROM asignaturas_examenes ae
       INNER JOIN asignaturas a ON a.id = ae.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE ae.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [examenId, personal_id, colegio_id, anio_activo]
    );

    if (examen.length === 0) {
      return res.status(404).json({ error: 'Examen no encontrado o sin permisos' });
    }

    const examenActual = examen[0];

    // Registrar acción en auditoría ANTES de actualizar
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'ACTUALIZAR',
      modulo: 'AULA_VIRTUAL',
      entidad: 'examen',
      entidad_id: parseInt(examenId),
      descripcion: `${estado === 'ACTIVO' ? 'Habilitó' : 'Deshabilitó'} examen: "${examenActual.titulo}" (ID: ${examenId})`,
      url: req.originalUrl,
      metodo_http: 'PUT',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify({ estado: examenActual.estado, titulo: examenActual.titulo }),
      datos_nuevos: JSON.stringify({ estado, titulo: examenActual.titulo }),
      resultado: 'EXITOSO'
    });

    // Actualizar estado
    await execute(
      `UPDATE asignaturas_examenes SET estado = ? WHERE id = ?`,
      [estado, examenId]
    );

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;
    
    // Si se activa el examen, enviar notificaciones a alumnos y apoderados
    if (estado === 'ACTIVO') {
      setImmediate(async () => {
        try {
          // Obtener información del examen y asignatura
          const examenInfo = await query(
            `SELECT ae.*, a.grupo_id, a.curso_id, c.nombre as curso_nombre,
                    CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre_completo
             FROM asignaturas_examenes ae
             INNER JOIN asignaturas a ON a.id = ae.asignatura_id
             INNER JOIN cursos c ON c.id = a.curso_id
             INNER JOIN personal p ON p.id = a.personal_id
             WHERE ae.id = ?`,
            [examenId]
          );
          
          if (examenInfo.length > 0) {
            const { grupo_id, curso_nombre, docente_nombre_completo, titulo } = examenInfo[0];
            
            // Obtener alumnos del grupo
            const alumnos = await query(
              `SELECT DISTINCT a.id as alumno_id, u.id as usuario_id
               FROM alumnos a
               INNER JOIN matriculas m ON m.alumno_id = a.id
               INNER JOIN usuarios u ON u.alumno_id = a.id
               WHERE m.grupo_id = ? 
                 AND m.colegio_id = ?
                 AND (m.estado = 0 OR m.estado = 4)
                 AND u.colegio_id = ?
                 AND u.estado = 'ACTIVO'`,
              [grupo_id, colegio_id, colegio_id]
            );
            
            const alumnoIds = alumnos.map(a => a.alumno_id);
            const alumnoUsuarioIds = alumnos.map(a => a.usuario_id);
            
            // Obtener apoderados de esos alumnos
            let apoderadoUsuarioIds = [];
            if (alumnoIds.length > 0) {
              const apoderados = await query(
                `SELECT DISTINCT u.id as usuario_id, ap.nro_documento
                 FROM apoderados ap
                 INNER JOIN familias f ON f.apoderado_id = ap.id
                 INNER JOIN usuarios u ON u.apoderado_id = ap.id
                 WHERE f.alumno_id IN (${alumnoIds.map(() => '?').join(',')})
                   AND ap.colegio_id = ?
                   AND u.colegio_id = ?
                   AND u.estado = 'ACTIVO'`,
                [...alumnoIds, colegio_id, colegio_id]
              );
              apoderadoUsuarioIds = apoderados.map(a => a.usuario_id);
              
              // Obtener DNI de apoderados para buscar docentes-apoderados
              const apoderadoDnis = apoderados.map(a => a.nro_documento).filter(dni => dni);
              
              if (apoderadoDnis.length > 0) {
                // Obtener usuarios DOCENTE que también son apoderados (mismo nro_documento)
                const docentesApoderados = await query(
                  `SELECT DISTINCT u.id 
                   FROM usuarios u
                   INNER JOIN personal p ON p.id = u.personal_id
                   WHERE u.colegio_id = ? 
                     AND u.estado = 'ACTIVO'
                     AND u.tipo = 'DOCENTE'
                     AND (p.nro_documento IN (${apoderadoDnis.map(() => '?').join(',')}) 
                          OR u.usuario IN (${apoderadoDnis.map(() => '?').join(',')}))
                     AND u.id NOT IN (${[...alumnoUsuarioIds, ...apoderadoUsuarioIds].map(() => '?').join(',')})`,
                  [colegio_id, ...apoderadoDnis, ...apoderadoDnis, ...alumnoUsuarioIds, ...apoderadoUsuarioIds]
                );
                
                const docentesApoderadosIds = docentesApoderados.map(u => u.id);
                apoderadoUsuarioIds = [...apoderadoUsuarioIds, ...docentesApoderadosIds];
                
                if (docentesApoderadosIds.length > 0) {
                  console.log(`📚 [EXAMEN ACTIVADO] Encontrados ${docentesApoderadosIds.length} docentes que también son apoderados`);
                }
              }
            }
            
            // Combinar todos los destinatarios
            const todosDestinatarios = [...new Set([...alumnoUsuarioIds, ...apoderadoUsuarioIds])];
            
            console.log(`📚 [EXAMEN ACTIVADO] Enviando notificaciones a ${todosDestinatarios.length} destinatarios (${alumnoUsuarioIds.length} alumnos, ${apoderadoUsuarioIds.length} apoderados incluyendo docentes)`);
            
            // Preparar notificación
            const tituloNotificacion = 'Examen Activado';
            const mensajeNotificacion = `Examen: "${titulo}" - Curso: ${curso_nombre} - Docente: ${docente_nombre_completo}`;
            
            // Crear notificaciones en la BD
            if (todosDestinatarios.length > 0) {
              for (const destinatarioId of todosDestinatarios) {
                try {
                  await execute(
                    `INSERT INTO notificaciones 
                     (para, usuario_id, destinatario_id, asunto, contenido, fecha_hora, estado)
                     VALUES ('USUARIO', ?, ?, ?, ?, NOW(), 'NO ENVIADO')`,
                    [
                      usuario_id, // Usuario que activa (docente)
                      destinatarioId, // Destinatario
                      tituloNotificacion, // TÍTULO (asunto)
                      mensajeNotificacion // MENSAJE (contenido)
                    ]
                  );
                } catch (error) {
                  console.error(`❌ [EXAMEN ACTIVADO] Error creando notificación para usuario ${destinatarioId}:`, error);
                }
              }
              
              console.log(`✅ [EXAMEN ACTIVADO] ${todosDestinatarios.length} notificaciones creadas en BD`);
              
              // Enviar push notifications
              const subscriptionsData = await query(
                `SELECT endpoint, p256dh, auth 
                 FROM push_subscriptions 
                 WHERE usuario_id IN (${todosDestinatarios.map(() => '?').join(',')}) 
                   AND colegio_id = ? AND (activo = 1 OR activo IS NULL)`,
                [...todosDestinatarios, colegio_id]
              );
              
              const subscriptions = subscriptionsData.map(sub => ({
                endpoint: sub.endpoint,
                keys: {
                  p256dh: sub.p256dh,
                  auth: sub.auth
                }
              }));
              
              if (subscriptions.length > 0) {
                const payloadPush = {
                  title: tituloNotificacion,
                  body: mensajeNotificacion,
                  icon: '/icons/icon-192x192.png',
                  badge: '/icons/icon-192x192.png',
                  vibrate: [200, 100, 200],
                  tag: `examen-activado-${examenId}`,
                  data: {
                    url: '/alumno/dashboard',
                    tipo: 'examen_activado',
                    examen_id: parseInt(examenId)
                  }
                };
                
                console.log(`📱 [EXAMEN ACTIVADO] Enviando ${subscriptions.length} push notifications...`);
                
                enviarPushNotificationMultiple(subscriptions, payloadPush)
                  .then(resultadosPush => {
                    const exitosas = resultadosPush.filter(r => r.resultado && r.resultado.success).length;
                    const fallidas = resultadosPush.filter(r => !r.resultado || !r.resultado.success).length;
                    console.log(`✅ [EXAMEN ACTIVADO] Push notifications: ${exitosas} exitosas, ${fallidas} fallidas`);
                  })
                  .catch(err => {
                    console.error(`❌ [EXAMEN ACTIVADO] Error en envío de push notifications:`, err);
                  });
              } else {
                console.log('⚠️ [EXAMEN ACTIVADO] No hay suscripciones push activas para enviar notificaciones');
              }
            }
          }
        } catch (error) {
          console.error(`❌ [EXAMEN ACTIVADO] Error en proceso de notificaciones:`, error);
        }
      });
    }
    
    res.json({ 
      success: true, 
      message: `Examen ${estado === 'ACTIVO' ? 'habilitado' : 'deshabilitado'} correctamente`,
      estado
    });
  } catch (error) {
    console.error('Error cambiando estado del examen:', error);
    res.status(500).json({ error: 'Error al cambiar estado del examen' });
  }
});

/**
 * GET /api/docente/aula-virtual/examenes/:examenId/resultados
 * Obtener resultados de un examen
 */
router.get('/aula-virtual/examenes/:examenId/resultados', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { examenId } = req.params;

    // Verificar que el docente tiene acceso a este examen
    const examen = await query(
      `SELECT ae.* FROM asignaturas_examenes ae
       INNER JOIN asignaturas a ON a.id = ae.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE ae.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [examenId, personal_id, colegio_id, anio_activo]
    );

    if (examen.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a este examen' });
    }

    // Obtener el grupo_id del examen para listar todos los alumnos
    const examenInfo = examen[0];
    const asignatura = await query(
      `SELECT a.grupo_id FROM asignaturas a WHERE a.id = ?`,
      [examenInfo.asignatura_id]
    );
    
    if (asignatura.length === 0) {
      return res.status(404).json({ error: 'Asignatura no encontrada' });
    }
    
    const grupoId = asignatura[0].grupo_id;

    // Obtener TODOS los alumnos del grupo con LEFT JOIN a resultados
    // Si no tienen resultado, devolver NULL para mostrar "-" en el frontend
    const resultados = await query(
      `SELECT 
        COALESCE(aep.id, NULL) as resultado_id,
        m.id as matricula_id,
        COALESCE(aep.fecha_hora, NULL) as fecha_hora,
        aep.puntaje as puntaje,
        aep.correctas as correctas,
        aep.incorrectas as incorrectas,
        COALESCE(aep.estado, NULL) as estado,
        CONCAT(a.apellido_paterno, ' ', a.apellido_materno, ', ', a.nombres) as nombre_completo,
        a.nombres,
        a.apellido_paterno,
        a.apellido_materno
       FROM alumnos a
       INNER JOIN matriculas m ON m.alumno_id = a.id
       LEFT JOIN asignaturas_examenes_pruebas aep ON aep.matricula_id = m.id AND aep.examen_id = ?
       WHERE m.grupo_id = ? 
         AND m.colegio_id = ?
         AND (m.estado = 0 OR m.estado = 4)
       ORDER BY a.apellido_paterno, a.apellido_materno, a.nombres ASC`,
      [examenId, grupoId, colegio_id]
    );

    res.json({ 
      examen: examen[0],
      resultados: resultados || []
    });
  } catch (error) {
    console.error('Error obteniendo resultados del examen:', error);
    res.status(500).json({ error: 'Error al obtener resultados del examen' });
  }
});

/**
 * GET /api/docente/aula-virtual/resultados/:resultadoId/detalles
 * Obtener detalles completos de un resultado de examen (preguntas y respuestas)
 */
router.get('/aula-virtual/resultados/:resultadoId/detalles', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { resultadoId } = req.params;

    // Obtener el resultado con información del examen y alumno
    const resultado = await query(
      `SELECT 
        aep.*,
        ae.titulo as examen_titulo,
        ae.tipo_puntaje,
        ae.puntos_correcta,
        CONCAT(a.apellido_paterno, ' ', a.apellido_materno, ', ', a.nombres) as nombre_completo
       FROM asignaturas_examenes_pruebas aep
       INNER JOIN asignaturas_examenes ae ON ae.id = aep.examen_id
       INNER JOIN asignaturas a_asig ON a_asig.id = ae.asignatura_id
       INNER JOIN grupos g ON g.id = a_asig.grupo_id
       INNER JOIN matriculas m ON m.id = aep.matricula_id
       INNER JOIN alumnos a ON a.id = m.alumno_id
       WHERE aep.id = ? AND a_asig.personal_id = ? AND a_asig.colegio_id = ? AND g.anio = ?`,
      [resultadoId, personal_id, colegio_id, anio_activo]
    );

    if (resultado.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a este resultado' });
    }

    const resultadoInfo = resultado[0];
    const examenId = resultadoInfo.examen_id;

    // IMPORTANTE: Obtener solo las preguntas que realmente vio el alumno
    // El campo 'preguntas' puede estar en formato PHP serialize (base64) o JSON
    let preguntaIds = [];
    try {
      if (resultadoInfo.preguntas && resultadoInfo.preguntas.trim() !== '') {
        // Intentar primero como JSON (formato nuevo)
        try {
          preguntaIds = JSON.parse(resultadoInfo.preguntas);
          if (!Array.isArray(preguntaIds)) {
            preguntaIds = [];
          }
        } catch (jsonError) {
          // Si falla JSON, intentar como PHP serialize (formato antiguo)
          try {
            const phpSerialize = require('php-serialize');
            // Decodificar base64 primero (formato PHP: base64_encode(serialize(array)))
            const decoded = Buffer.from(resultadoInfo.preguntas, 'base64').toString('utf-8');
            // Deserializar el array PHP
            preguntaIds = phpSerialize.unserialize(decoded) || [];
            // Asegurar que sea un array
            if (!Array.isArray(preguntaIds)) {
              preguntaIds = [];
            }
          } catch (phpError) {
            console.warn('Error deserializando preguntas (ni JSON ni PHP serialize):', phpError);
            preguntaIds = [];
          }
        }
      }
    } catch (error) {
      console.warn('Error deserializando preguntas del resultado:', error);
      preguntaIds = [];
    }

    // Si no hay preguntas guardadas, obtener todas las preguntas del examen (compatibilidad con resultados antiguos)
    let preguntas = [];
    if (preguntaIds.length > 0) {
      // Obtener solo las preguntas que vio el alumno, en el orden en que se guardaron
      const placeholders = preguntaIds.map(() => '?').join(',');
      preguntas = await query(
        `SELECT 
          aep.*,
          GROUP_CONCAT(
            CONCAT(aepa.id, ':', aepa.descripcion, ':', aepa.correcta, ':', COALESCE(aepa.orden_posicion, ''), ':', COALESCE(aepa.par_id, ''), ':', COALESCE(aepa.zona_drop, ''))
            ORDER BY aepa.id ASC
            SEPARATOR '||'
          ) as alternativas_raw
         FROM asignaturas_examenes_preguntas aep
         LEFT JOIN asignaturas_examenes_preguntas_alternativas aepa ON aepa.pregunta_id = aep.id
         WHERE aep.examen_id = ? AND aep.id IN (${placeholders})
         GROUP BY aep.id
         ORDER BY FIELD(aep.id, ${placeholders})`,
        [examenId, ...preguntaIds, ...preguntaIds]
      );
    } else {
      // Fallback: si no hay preguntas guardadas, obtener todas (para resultados antiguos)
      console.warn('⚠️ Resultado sin preguntas guardadas, mostrando todas las preguntas del examen');
      preguntas = await query(
        `SELECT 
          aep.*,
          GROUP_CONCAT(
            CONCAT(aepa.id, ':', aepa.descripcion, ':', aepa.correcta, ':', COALESCE(aepa.orden_posicion, ''), ':', COALESCE(aepa.par_id, ''), ':', COALESCE(aepa.zona_drop, ''))
            ORDER BY aepa.id ASC
            SEPARATOR '||'
          ) as alternativas_raw
         FROM asignaturas_examenes_preguntas aep
         LEFT JOIN asignaturas_examenes_preguntas_alternativas aepa ON aepa.pregunta_id = aep.id
         WHERE aep.examen_id = ?
         GROUP BY aep.id
         ORDER BY aep.orden ASC`,
        [examenId]
      );
    }

    // Procesar alternativas para cada pregunta
    const preguntasConAlternativas = preguntas.map(pregunta => {
      const alternativas = [];
      if (pregunta.alternativas_raw) {
        const altArray = pregunta.alternativas_raw.split('||');
        altArray.forEach(altStr => {
          // Formato: id:descripcion:correcta:orden_posicion:par_id:zona_drop
          const parts = altStr.split(':');
          alternativas.push({
            id: parseInt(parts[0]) || 0,
            descripcion: parts[1] || '',
            correcta: parts[2] || 'NO',
            orden_posicion: parts[3] ? parseInt(parts[3]) : null,
            par_id: parts[4] ? parseInt(parts[4]) : null,
            zona_drop: parts[5] || null
          });
        });
      }
      return {
        ...pregunta,
        alternativas
      };
    });

    // Parsear respuestas del alumno
    // El sistema nuevo usa JSON, pero el antiguo usaba PHP serialize (base64)
    // Intentar primero JSON, luego PHP serialize para compatibilidad
    let respuestasAlumno = {};
    try {
      if (resultadoInfo.respuestas && resultadoInfo.respuestas.trim() !== '') {
        // Intentar primero como JSON (formato nuevo)
        try {
          respuestasAlumno = JSON.parse(resultadoInfo.respuestas);
        } catch (jsonError) {
          // Si falla JSON, intentar como PHP serialize (formato antiguo)
          try {
            const phpSerialize = require('php-serialize');
            // Decodificar base64 primero
            const decoded = Buffer.from(resultadoInfo.respuestas, 'base64').toString('utf-8');
            // Deserializar el array PHP
            respuestasAlumno = phpSerialize.unserialize(decoded) || {};
          } catch (phpError) {
            console.warn('Error parseando respuestas (ni JSON ni PHP serialize):', phpError);
            respuestasAlumno = {};
          }
        }
        
        // Asegurar que las claves sean strings para comparación consistente
        const respuestasNormalizadas = {};
        Object.keys(respuestasAlumno).forEach(key => {
          respuestasNormalizadas[key.toString()] = respuestasAlumno[key];
        });
        respuestasAlumno = respuestasNormalizadas;
      }
    } catch (parseError) {
      console.error('Error parseando respuestas del alumno:', parseError);
      console.error('Respuestas raw:', resultadoInfo.respuestas);
      // Si falla, respuestasAlumno queda como objeto vacío
      respuestasAlumno = {};
    }

    res.json({
      resultado: resultadoInfo,
      preguntas: preguntasConAlternativas,
      respuestas: respuestasAlumno
    });
    } catch (error) {
      console.error('Error obteniendo detalles del resultado:', error);
      res.status(500).json({ error: 'Error al obtener detalles del resultado' });
    }
  });

/**
 * DELETE /api/docente/aula-virtual/resultados/:resultadoId
 * Borrar un resultado de examen (permite que el alumno vuelva a dar el examen)
 */
router.delete('/aula-virtual/resultados/:resultadoId', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { resultadoId } = req.params;

    // Verificar que el resultado existe y el docente tiene acceso
    const resultado = await query(
      `SELECT 
        aep.*,
        ae.titulo as examen_titulo,
        CONCAT(a.apellido_paterno, ' ', a.apellido_materno, ', ', a.nombres) as nombre_completo
       FROM asignaturas_examenes_pruebas aep
       INNER JOIN asignaturas_examenes ae ON ae.id = aep.examen_id
       INNER JOIN asignaturas a_asig ON a_asig.id = ae.asignatura_id
       INNER JOIN grupos g ON g.id = a_asig.grupo_id
       INNER JOIN matriculas m ON m.id = aep.matricula_id
       INNER JOIN alumnos a ON a.id = m.alumno_id
       WHERE aep.id = ? AND a_asig.personal_id = ? AND a_asig.colegio_id = ? AND g.anio = ?`,
      [resultadoId, personal_id, colegio_id, anio_activo]
    );

    if (resultado.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a este resultado' });
    }

    const resultadoInfo = resultado[0];

    // Registrar auditoría ANTES de eliminar
    req.skipAudit = true;
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: 'DOCENTE',
      accion: 'DELETE',
      modulo: 'Aula Virtual',
      entidad: 'Resultado de Examen',
      entidad_id: resultadoId,
      descripcion: `Resultado eliminado del examen "${resultadoInfo.examen_titulo}" del alumno ${resultadoInfo.nombre_completo}. El alumno podrá volver a dar el examen si tiene intentos disponibles.`,
      url: req.originalUrl,
      metodo_http: req.method,
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
      datos_anteriores: {
        examen_id: resultadoInfo.examen_id,
        matricula_id: resultadoInfo.matricula_id,
        puntaje: resultadoInfo.puntaje,
        correctas: resultadoInfo.correctas,
        incorrectas: resultadoInfo.incorrectas,
        estado: resultadoInfo.estado
      },
      datos_nuevos: null,
      resultado: 'EXITOSO'
    }).catch(err => console.error('Error en auditoría:', err));

    // Eliminar el resultado
    await execute(
      `DELETE FROM asignaturas_examenes_pruebas WHERE id = ?`,
      [resultadoId]
    );

    res.json({ 
      success: true,
      message: 'Resultado eliminado correctamente. El alumno podrá volver a dar el examen si tiene intentos disponibles.'
    });
  } catch (error) {
    console.error('Error eliminando resultado del examen:', error);
    res.status(500).json({ error: 'Error al eliminar el resultado del examen' });
  }
});

/**
 * DELETE /api/docente/aula-virtual/examenes/:examenId/resultados/todos
 * Eliminar todos los resultados de un examen (permite que todos los alumnos vuelvan a dar el examen)
 */
router.delete('/aula-virtual/examenes/:examenId/resultados/todos', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { examenId } = req.params;

    // Verificar que el examen existe y el docente tiene acceso
    const examen = await query(
      `SELECT 
        ae.*,
        a.grupo_id,
        c.nombre as curso_nombre,
        g.grado,
        g.seccion,
        n.nombre as nivel_nombre
       FROM asignaturas_examenes ae
       INNER JOIN asignaturas a ON a.id = ae.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN cursos c ON c.id = a.curso_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       WHERE ae.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [examenId, personal_id, colegio_id, anio_activo]
    );

    if (examen.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a este examen' });
    }

    const examenInfo = examen[0];

    // Obtener todos los resultados del examen para auditoría
    const resultados = await query(
      `SELECT 
        aep.id,
        aep.matricula_id,
        aep.puntaje,
        aep.correctas,
        aep.incorrectas,
        aep.estado,
        CONCAT(a.apellido_paterno, ' ', a.apellido_materno, ', ', a.nombres) as nombre_completo
       FROM asignaturas_examenes_pruebas aep
       INNER JOIN matriculas m ON m.id = aep.matricula_id
       INNER JOIN alumnos a ON a.id = m.alumno_id
       WHERE aep.examen_id = ?`,
      [examenId]
    );

    const totalResultados = resultados.length;

    // Registrar auditoría ANTES de eliminar
    req.skipAudit = true;
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: 'DOCENTE',
      accion: 'DELETE',
      modulo: 'Aula Virtual',
      entidad: 'Resultados de Examen (Todos)',
      entidad_id: examenId,
      descripcion: `Se eliminaron todos los resultados (${totalResultados}) del examen "${examenInfo.titulo}". Los alumnos podrán volver a dar el examen si tienen intentos disponibles.`,
      url: req.originalUrl,
      metodo_http: req.method,
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
      datos_anteriores: {
        examen_id: examenId,
        total_resultados: totalResultados,
        resultados: resultados.map(r => ({
          id: r.id,
          matricula_id: r.matricula_id,
          nombre_completo: r.nombre_completo,
          puntaje: r.puntaje,
          correctas: r.correctas,
          incorrectas: r.incorrectas
        }))
      },
      datos_nuevos: null,
      resultado: 'EXITOSO'
    }).catch(err => console.error('Error en auditoría:', err));

    // Eliminar todos los resultados del examen
    await execute(
      `DELETE FROM asignaturas_examenes_pruebas WHERE examen_id = ?`,
      [examenId]
    );

    res.json({ 
      success: true,
      message: `Se eliminaron ${totalResultados} resultado(s) correctamente. Los alumnos podrán volver a dar el examen si tienen intentos disponibles.`,
      total_eliminados: totalResultados
    });
  } catch (error) {
    console.error('Error eliminando todos los resultados del examen:', error);
    res.status(500).json({ error: 'Error al eliminar los resultados del examen' });
  }
});

/**
 * POST /api/docente/aula-virtual/examenes/:examenId/calificar
 * Recalcular calificaciones de todos los alumnos que han dado el examen
 * Toma en cuenta las respuestas del alumno y los parámetros actuales del examen
 */
router.post('/aula-virtual/examenes/:examenId/calificar', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { examenId } = req.params;

    // Verificar que el examen existe y el docente tiene acceso
    const examen = await query(
      `SELECT ae.* FROM asignaturas_examenes ae
       INNER JOIN asignaturas a ON a.id = ae.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE ae.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [examenId, personal_id, colegio_id, anio_activo]
    );

    if (examen.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a este examen' });
    }

    const examenInfo = examen[0];

    // Obtener todas las pruebas (resultados) del examen
    const pruebas = await query(
      `SELECT * FROM asignaturas_examenes_pruebas WHERE examen_id = ?`,
      [examenId]
    );

    if (pruebas.length === 0) {
      return res.json({ 
        success: true,
        message: 'No hay resultados para recalificar',
        recalificados: 0
      });
    }

    // Obtener todas las preguntas del examen con sus alternativas
    const preguntas = await query(
      `SELECT 
        aep.*,
        GROUP_CONCAT(
          CONCAT(aepa.id, ':', aepa.descripcion, ':', aepa.correcta, ':', COALESCE(aepa.orden_posicion, ''), ':', COALESCE(aepa.par_id, ''), ':', COALESCE(aepa.zona_drop, ''))
          ORDER BY aepa.id ASC
          SEPARATOR '||'
        ) as alternativas_raw
       FROM asignaturas_examenes_preguntas aep
       LEFT JOIN asignaturas_examenes_preguntas_alternativas aepa ON aepa.pregunta_id = aep.id
       WHERE aep.examen_id = ?
       GROUP BY aep.id
       ORDER BY aep.orden ASC`,
      [examenId]
    );

    // Procesar preguntas con alternativas
    const preguntasConAlternativas = preguntas.map(pregunta => {
      const alternativas = [];
      if (pregunta.alternativas_raw) {
        const altArray = pregunta.alternativas_raw.split('||');
        altArray.forEach(altStr => {
          const [id, descripcion, correcta, orden_posicion, par_id, zona_drop] = altStr.split(':');
          alternativas.push({
            id: parseInt(id),
            descripcion: descripcion || '',
            correcta: correcta || 'NO',
            orden_posicion: orden_posicion ? parseInt(orden_posicion) : null,
            par_id: par_id ? parseInt(par_id) : null,
            zona_drop: zona_drop || null
          });
        });
      }
      return {
        ...pregunta,
        alternativas
      };
    });

    const phpSerialize = require('php-serialize');
    let recalificados = 0;
    let errores = 0;

    // Recalificar cada prueba
    for (const prueba of pruebas) {
      try {
        // IMPORTANTE: Obtener solo las preguntas que realmente vio el alumno
        // El campo 'preguntas' contiene un array serializado (base64) con los IDs de las preguntas mostradas
        let preguntaIds = [];
        try {
          if (prueba.preguntas && prueba.preguntas.trim() !== '') {
            // Decodificar base64 primero (formato PHP: base64_encode(serialize(array)))
            const decoded = Buffer.from(prueba.preguntas, 'base64').toString('utf-8');
            // Deserializar el array PHP
            preguntaIds = phpSerialize.unserialize(decoded) || [];
            // Asegurar que sea un array
            if (!Array.isArray(preguntaIds)) {
              preguntaIds = [];
            }
          }
        } catch (error) {
          console.warn(`Error deserializando preguntas de prueba ${prueba.id}:`, error);
          preguntaIds = [];
        }

        // Filtrar preguntas: solo las que vio el alumno
        // Si no hay preguntas guardadas (resultados antiguos), usar todas como fallback
        const preguntasAValuar = preguntaIds.length > 0
          ? preguntasConAlternativas.filter(p => preguntaIds.includes(p.id))
          : preguntasConAlternativas; // Fallback para resultados antiguos

        // Parsear respuestas del alumno
        let respuestasAlumno = {};
        if (prueba.respuestas && prueba.respuestas.trim() !== '') {
          try {
            // Intentar primero como JSON (formato nuevo)
            try {
              respuestasAlumno = JSON.parse(prueba.respuestas) || {};
            } catch (jsonError) {
              // Si falla JSON, intentar deserializar desde base64 (formato PHP antiguo)
              const decoded = Buffer.from(prueba.respuestas, 'base64').toString('utf-8');
              respuestasAlumno = phpSerialize.unserialize(decoded) || {};
            }
            // Normalizar claves a strings
            const respuestasNormalizadas = {};
            Object.keys(respuestasAlumno).forEach(key => {
              respuestasNormalizadas[key.toString()] = respuestasAlumno[key];
            });
            respuestasAlumno = respuestasNormalizadas;
          } catch (parseError) {
            console.error(`Error parseando respuestas de prueba ${prueba.id}:`, parseError);
            respuestasAlumno = {};
          }
        }

        // Calcular puntaje usando la misma lógica que finalizar examen
        // IMPORTANTE: Solo evaluar las preguntas que realmente vio el alumno
        const puntosCorrecta = parseFloat(examenInfo.puntos_correcta) || 0;
        const tipoPuntaje = examenInfo.tipo_puntaje;
        let puntosObtenidos = 0;
        let correctas = 0;
        let incorrectas = 0;

        for (const pregunta of preguntasAValuar) {
          const respuestaAlumno = respuestasAlumno[pregunta.id.toString()];
          let esCorrecta = false;
          let puntosPregunta = 0;
          const alternativas = pregunta.alternativas || [];

          // Evaluar según el tipo de pregunta (misma lógica que finalizar examen)
          switch (pregunta.tipo) {
            case 'ALTERNATIVAS':
              if (respuestaAlumno !== null && respuestaAlumno !== undefined && respuestaAlumno !== '') {
                const alternativaId = typeof respuestaAlumno === 'number' ? respuestaAlumno : parseInt(respuestaAlumno);
                const alternativaMarcada = alternativas.find(alt => {
                  const altIdComp = typeof alt.id === 'number' ? alt.id : parseInt(alt.id);
                  return altIdComp === alternativaId;
                });
                
                if (alternativaMarcada && alternativaMarcada.correcta === 'SI') {
                  esCorrecta = true;
                  puntosPregunta = tipoPuntaje === 'GENERAL' 
                    ? puntosCorrecta
                    : (parseFloat(pregunta.puntos) || 0);
                } else if (examenInfo.penalizar_incorrecta === 'SI') {
                  puntosPregunta = -(parseFloat(examenInfo.penalizacion_incorrecta) || 0);
                }
              }
              break;

            case 'VERDADERO_FALSO':
              if (respuestaAlumno !== null && respuestaAlumno !== undefined && respuestaAlumno !== '') {
                if (typeof respuestaAlumno === 'number') {
                  const alternativaMarcada = alternativas.find(alt => {
                    const altIdComp = typeof alt.id === 'number' ? alt.id : parseInt(alt.id);
                    return altIdComp === respuestaAlumno;
                  });
                  
                  if (alternativaMarcada && alternativaMarcada.correcta === 'SI') {
                    esCorrecta = true;
                    puntosPregunta = tipoPuntaje === 'GENERAL' 
                      ? puntosCorrecta
                      : (parseFloat(pregunta.puntos) || 0);
                  } else if (examenInfo.penalizar_incorrecta === 'SI') {
                    puntosPregunta = -(parseFloat(examenInfo.penalizacion_incorrecta) || 0);
                  }
                } else {
                  const respuestaTexto = String(respuestaAlumno).trim().toLowerCase();
                  const alternativaMarcada = alternativas.find(alt => {
                    if (!alt.descripcion) return false;
                    const desc = alt.descripcion.replace(/<[^>]*>/g, '').trim().toLowerCase();
                    return (respuestaTexto === 'verdadero' && desc.includes('verdadero')) ||
                           (respuestaTexto === 'falso' && desc.includes('falso'));
                  });
                  
                  if (alternativaMarcada && alternativaMarcada.correcta === 'SI') {
                    esCorrecta = true;
                    puntosPregunta = tipoPuntaje === 'GENERAL' 
                      ? puntosCorrecta
                      : (parseFloat(pregunta.puntos) || 0);
                  } else if (examenInfo.penalizar_incorrecta === 'SI') {
                    puntosPregunta = -(parseFloat(examenInfo.penalizacion_incorrecta) || 0);
                  }
                }
              }
              break;

            case 'COMPLETAR':
              if (respuestaAlumno && typeof respuestaAlumno === 'object') {
                const respuestasCompletar = Object.values(respuestaAlumno)
                  .map(r => String(r).trim().toLowerCase())
                  .filter(r => r);
                
                const descripcionLimpia = pregunta.descripcion ? pregunta.descripcion.replace(/<[^>]*>/g, '') : '';
                const respuestasCorrectas = [];
                const regex = /\[\[([^\]]+)\]\]/g;
                let match;
                while ((match = regex.exec(descripcionLimpia)) !== null) {
                  const respuesta = match[1].trim().toLowerCase();
                  if (respuesta) {
                    respuestasCorrectas.push(respuesta);
                  }
                }
                
                let todasCorrectas = false;
                if (respuestasCompletar.length > 0 && respuestasCorrectas.length > 0) {
                  if (respuestasCompletar.length === respuestasCorrectas.length) {
                    todasCorrectas = respuestasCompletar.every(resp => 
                      respuestasCorrectas.includes(resp)
                    );
                  }
                }
                
                if (todasCorrectas) {
                  esCorrecta = true;
                  puntosPregunta = tipoPuntaje === 'GENERAL' 
                    ? puntosCorrecta
                    : (parseFloat(pregunta.puntos) || 0);
                } else if (examenInfo.penalizar_incorrecta === 'SI' && respuestasCompletar.length > 0) {
                  puntosPregunta = -(parseFloat(examenInfo.penalizacion_incorrecta) || 0);
                }
              }
              break;

            case 'ORDENAR':
              if (respuestaAlumno && Array.isArray(respuestaAlumno) && respuestaAlumno.length > 0) {
                const alternativasConOrden = alternativas.filter(alt => alt.orden_posicion !== null && alt.orden_posicion !== undefined);
                let ordenCorrecto = true;
                if (respuestaAlumno.length === alternativasConOrden.length) {
                  for (let i = 0; i < respuestaAlumno.length; i++) {
                    const altId = parseInt(respuestaAlumno[i]);
                    const alternativa = alternativas.find(alt => {
                      const altIdComp = typeof alt.id === 'number' ? alt.id : parseInt(alt.id);
                      return altIdComp === altId;
                    });
                    
                    if (!alternativa) {
                      ordenCorrecto = false;
                      break;
                    }
                    
                    const ordenEsperado = typeof alternativa.orden_posicion === 'number' 
                      ? alternativa.orden_posicion 
                      : parseInt(alternativa.orden_posicion);
                    
                    if (ordenEsperado !== (i + 1)) {
                      ordenCorrecto = false;
                      break;
                    }
                  }
                } else {
                  ordenCorrecto = false;
                }
                
                if (ordenCorrecto) {
                  esCorrecta = true;
                  puntosPregunta = tipoPuntaje === 'GENERAL' 
                    ? puntosCorrecta
                    : (parseFloat(pregunta.puntos) || 0);
                } else if (examenInfo.penalizar_incorrecta === 'SI' && respuestaAlumno.length > 0) {
                  puntosPregunta = -(parseFloat(examenInfo.penalizacion_incorrecta) || 0);
                }
              }
              break;

            case 'EMPAREJAR':
              if (respuestaAlumno && typeof respuestaAlumno === 'object' && Object.keys(respuestaAlumno).length > 0) {
                const alternativasConPar = alternativas.filter(alt => alt.par_id !== null && alt.par_id !== undefined);
                let todosParesCorrectos = true;
                let paresVerificados = 0;
                
                for (const [altId, parId] of Object.entries(respuestaAlumno)) {
                  const altIdNum = parseInt(altId);
                  const parIdNum = parseInt(parId);
                  const alternativa = alternativas.find(alt => {
                    const altIdComp = typeof alt.id === 'number' ? alt.id : parseInt(alt.id);
                    return altIdComp === altIdNum;
                  });
                  
                  if (!alternativa) {
                    todosParesCorrectos = false;
                    break;
                  }
                  
                  const parEsperado = alternativa.par_id ? (typeof alternativa.par_id === 'number' ? alternativa.par_id : parseInt(alternativa.par_id)) : null;
                  
                  if (!parEsperado || parIdNum !== parEsperado) {
                    todosParesCorrectos = false;
                    break;
                  }
                  
                  paresVerificados++;
                }
                
                if (todosParesCorrectos && paresVerificados === alternativasConPar.length) {
                  esCorrecta = true;
                  puntosPregunta = tipoPuntaje === 'GENERAL' 
                    ? puntosCorrecta
                    : (parseFloat(pregunta.puntos) || 0);
                } else if (examenInfo.penalizar_incorrecta === 'SI' && Object.keys(respuestaAlumno).length > 0) {
                  puntosPregunta = -(parseFloat(examenInfo.penalizacion_incorrecta) || 0);
                }
              }
              break;

            case 'ARRASTRAR_Y_SOLTAR':
              if (respuestaAlumno && typeof respuestaAlumno === 'object' && Object.keys(respuestaAlumno).length > 0) {
                const alternativasConZona = alternativas.filter(alt => alt.zona_drop && alt.zona_drop.trim() !== '');
                let todasZonasCorrectas = true;
                let zonasVerificadas = 0;
                
                for (const [altId, zonaValue] of Object.entries(respuestaAlumno)) {
                  const altIdNum = parseInt(altId);
                  const alternativa = alternativas.find(alt => {
                    const altIdComp = typeof alt.id === 'number' ? alt.id : parseInt(alt.id);
                    return altIdComp === altIdNum;
                  });
                  
                  if (!alternativa) {
                    todasZonasCorrectas = false;
                    break;
                  }
                  
                  let zonaAlumno;
                  if (typeof zonaValue === 'string') {
                    zonaAlumno = zonaValue.trim().toLowerCase();
                  } else if (typeof zonaValue === 'object' && zonaValue !== null && zonaValue.zona) {
                    zonaAlumno = String(zonaValue.zona).trim().toLowerCase();
                  } else {
                    todasZonasCorrectas = false;
                    break;
                  }
                  
                  const zonaEsperada = alternativa.zona_drop ? alternativa.zona_drop.trim().toLowerCase() : null;
                  
                  if (!zonaEsperada || zonaAlumno !== zonaEsperada) {
                    todasZonasCorrectas = false;
                    break;
                  }
                  
                  zonasVerificadas++;
                }
                
                if (todasZonasCorrectas && zonasVerificadas === alternativasConZona.length) {
                  esCorrecta = true;
                  puntosPregunta = tipoPuntaje === 'GENERAL' 
                    ? puntosCorrecta
                    : (parseFloat(pregunta.puntos) || 0);
                } else if (examenInfo.penalizar_incorrecta === 'SI' && Object.keys(respuestaAlumno).length > 0) {
                  puntosPregunta = -(parseFloat(examenInfo.penalizacion_incorrecta) || 0);
                }
              }
              break;

            case 'RESPUESTA_CORTA':
              if (respuestaAlumno) {
                const respuestaNormalizada = String(respuestaAlumno).trim().toLowerCase();
                const alternativaCorrecta = alternativas.find(alt => alt.correcta === 'SI');
                if (alternativaCorrecta) {
                  const correctaNormalizada = alternativaCorrecta.descripcion.replace(/<[^>]*>/g, '').trim().toLowerCase();
                  if (respuestaNormalizada === correctaNormalizada) {
                    esCorrecta = true;
                    puntosPregunta = tipoPuntaje === 'GENERAL' 
                      ? puntosCorrecta
                      : (parseFloat(pregunta.puntos) || 0);
                  } else if (examenInfo.penalizar_incorrecta === 'SI') {
                    puntosPregunta = -(parseFloat(examenInfo.penalizacion_incorrecta) || 0);
                  }
                }
              }
              break;
          }

          puntosObtenidos += puntosPregunta;
          
          const tieneRespuesta = respuestaAlumno !== null && 
                                   respuestaAlumno !== undefined && 
                                   respuestaAlumno !== '' &&
                                   !(typeof respuestaAlumno === 'object' && Object.keys(respuestaAlumno).length === 0) &&
                                   !(Array.isArray(respuestaAlumno) && respuestaAlumno.length === 0);
          
          if (esCorrecta) {
            correctas++;
          } else if (tieneRespuesta) {
            incorrectas++;
          }
        }

        // Limitar puntaje mínimo a 0
        if (puntosObtenidos < 0) puntosObtenidos = 0;
        
        // Redondear puntos obtenidos a entero
        const puntaje = Math.round(puntosObtenidos);

        // Actualizar la prueba
        await execute(
          `UPDATE asignaturas_examenes_pruebas 
           SET puntaje = ?, correctas = ?, incorrectas = ?
           WHERE id = ?`,
          [puntaje, correctas, incorrectas, prueba.id]
        );
        
        console.log(`✅ Recalificado prueba ${prueba.id}: puntaje=${puntaje}, correctas=${correctas}, incorrectas=${incorrectas}`);

        recalificados++;
      } catch (error) {
        console.error(`Error recalificando prueba ${prueba.id}:`, error);
        errores++;
      }
    }

    // Registrar auditoría
    req.skipAudit = true;
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: 'DOCENTE',
      accion: 'RECALIFICAR',
      modulo: 'Aula Virtual',
      entidad: 'Examen',
      entidad_id: examenId,
      descripcion: `Recalificó examen "${examenInfo.titulo}". ${recalificados} resultado(s) actualizado(s)${errores > 0 ? `, ${errores} error(es)` : ''}`,
      url: req.originalUrl,
      metodo_http: req.method,
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
      datos_anteriores: null,
      datos_nuevos: {
        examen_id: examenId,
        total_pruebas: pruebas.length,
        recalificados: recalificados,
        errores: errores
      },
      resultado: errores === 0 ? 'EXITOSO' : 'PARCIAL'
    }).catch(err => console.error('Error en auditoría:', err));

    res.json({ 
      success: true,
      message: errores === 0 
        ? `Se recalificaron ${recalificados} resultado(s) correctamente.`
        : `Se recalificaron ${recalificados} resultado(s). ${errores} error(es) encontrado(s).`,
      recalificados: recalificados,
      errores: errores,
      total: pruebas.length
    });
  } catch (error) {
    console.error('Error recalificando examen:', error);
    res.status(500).json({ error: 'Error al recalificar el examen' });
  }
});

/**
 * GET /api/docente/aula-virtual/examenes/:examenId/resultados/pdf
 * Generar PDF con los resultados del examen
 */
router.get('/aula-virtual/examenes/:examenId/resultados/pdf', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { examenId } = req.params;

    // Verificar que el examen existe y el docente tiene acceso
    // Incluir información de curso, grado y nivel
    const examen = await query(
      `SELECT 
        ae.*,
        a.grupo_id,
        c.nombre as curso_nombre,
        g.grado,
        g.seccion,
        n.nombre as nivel_nombre
       FROM asignaturas_examenes ae
       INNER JOIN asignaturas a ON a.id = ae.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       INNER JOIN cursos c ON c.id = a.curso_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       WHERE ae.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [examenId, personal_id, colegio_id, anio_activo]
    );

    if (examen.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a este examen' });
    }

    const examenInfo = examen[0];
    const grupoId = examenInfo.grupo_id;
    
    if (!grupoId) {
      return res.status(404).json({ error: 'Asignatura no encontrada' });
    }

    // Obtener resultados
    const resultados = await query(
      `SELECT 
        COALESCE(aep.id, NULL) as resultado_id,
        m.id as matricula_id,
        COALESCE(aep.fecha_hora, NULL) as fecha_hora,
        aep.puntaje as puntaje,
        aep.correctas as correctas,
        aep.incorrectas as incorrectas,
        COALESCE(aep.estado, NULL) as estado,
        CONCAT(a.apellido_paterno, ' ', a.apellido_materno, ', ', a.nombres) as nombre_completo,
        a.nombres,
        a.apellido_paterno,
        a.apellido_materno
       FROM alumnos a
       INNER JOIN matriculas m ON m.alumno_id = a.id
       LEFT JOIN asignaturas_examenes_pruebas aep ON aep.matricula_id = m.id AND aep.examen_id = ?
       WHERE m.grupo_id = ? 
         AND m.colegio_id = ?
         AND (m.estado = 0 OR m.estado = 4)
       ORDER BY a.apellido_paterno, a.apellido_materno, a.nombres ASC`,
      [examenId, grupoId, colegio_id]
    );

    // Calcular puntos por respuesta correcta
    const puntosPorRespuesta = examenInfo.tipo_puntaje === 'GENERAL' ? (examenInfo.puntos_correcta || 0) : 0;

    // Crear PDF
    const doc = new PDFDocument({ 
      size: 'A4',
      margin: 50,
      layout: 'portrait'
    });

    // Configurar headers para descarga
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Resultados_${examenInfo.titulo.replace(/[^a-z0-9]/gi, '_')}.pdf"`);

    // Pipe PDF a la respuesta
    doc.pipe(res);

    // Colores
    const colorHeader = '#667eea';
    const colorHeaderEnd = '#764ba2';
    const colorText = '#1f2937';
    const colorGray = '#6b7280';
    const colorGreen = '#10b981';
    const colorRed = '#ef4444';
    const colorBg = '#f3f4f6';

    // Header con gradiente (simulado con múltiples rectángulos)
    for (let i = 0; i < 80; i++) {
      const ratio = i / 80;
      const r = Math.floor(parseInt(colorHeader.slice(1, 3), 16) * (1 - ratio) + parseInt(colorHeaderEnd.slice(1, 3), 16) * ratio);
      const g = Math.floor(parseInt(colorHeader.slice(3, 5), 16) * (1 - ratio) + parseInt(colorHeaderEnd.slice(3, 5), 16) * ratio);
      const b = Math.floor(parseInt(colorHeader.slice(5, 7), 16) * (1 - ratio) + parseInt(colorHeaderEnd.slice(5, 7), 16) * ratio);
      const color = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      doc.rect(0, i, 595, 1).fill(color);
    }
    
    // Título del header (sin emoji para evitar problemas de codificación)
    doc.fontSize(20)
       .fillColor('white')
       .font('Helvetica-Bold')
       .text('RESULTADOS', 50, 25, { align: 'left' });
    
    // Construir título completo: Examen - Curso - Grado - Nivel - Bimestre
    const gradoTexto = examenInfo.grado ? `${examenInfo.grado}°` : '';
    const seccionTexto = examenInfo.seccion || '';
    const gradoSeccion = `${gradoTexto} ${seccionTexto}`.trim();
    const bimestreTexto = examenInfo.ciclo ? `Bimestre ${examenInfo.ciclo}` : '';
    const tituloCompleto = `${examenInfo.titulo} - ${examenInfo.curso_nombre || ''} - ${gradoSeccion} - ${examenInfo.nivel_nombre || ''}${bimestreTexto ? ` - ${bimestreTexto}` : ''}`.replace(/\s+/g, ' ').trim();
    
    doc.fontSize(14)
       .fillColor('white')
       .font('Helvetica')
       .text(tituloCompleto, 50, 50, { align: 'left', width: 495 });

    let yPos = 120;

    // Información del examen
    doc.rect(50, yPos, 495, 40)
       .fill(colorBg)
       .stroke();
    
    doc.fontSize(11)
       .fillColor(colorText)
       .font('Helvetica-Bold')
       .text('EXAMEN:', 60, yPos + 10);
    
    doc.font('Helvetica')
       .text(examenInfo.titulo, 130, yPos + 10);
    
    if (examenInfo.tipo_puntaje === 'GENERAL') {
      doc.font('Helvetica-Bold')
         .text('PUNTAJE POR RESPUESTA CORRECTA:', 60, yPos + 25);
      
      doc.font('Helvetica')
         .text(`${puntosPorRespuesta} Punto(s)`, 280, yPos + 25);
    }

    yPos += 70;

    // Tabla de resultados
    const tableTop = yPos;
    const itemHeight = 25;
    const tableLeft = 50;
    const tableWidth = 495;
    
    // Encabezado de tabla con gradiente (simulado)
    for (let i = 0; i < itemHeight; i++) {
      const ratio = i / itemHeight;
      const r = Math.floor(parseInt(colorHeader.slice(1, 3), 16) * (1 - ratio) + parseInt(colorHeaderEnd.slice(1, 3), 16) * ratio);
      const g = Math.floor(parseInt(colorHeader.slice(3, 5), 16) * (1 - ratio) + parseInt(colorHeaderEnd.slice(3, 5), 16) * ratio);
      const b = Math.floor(parseInt(colorHeader.slice(5, 7), 16) * (1 - ratio) + parseInt(colorHeaderEnd.slice(5, 7), 16) * ratio);
      const color = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      doc.rect(tableLeft, tableTop + i, tableWidth, 1).fill(color);
    }
    doc.rect(tableLeft, tableTop, tableWidth, itemHeight).stroke();
    
    // Columnas del encabezado
    const colWidths = [40, 250, 70, 70, 70];
    const headers = ['N°', 'APELLIDOS Y NOMBRES', 'PUNTAJE', 'CORRECTAS', 'INCORRECTAS'];
    let xPos = tableLeft;
    
    doc.fillColor('white')
       .font('Helvetica-Bold');
    
    headers.forEach((header, index) => {
      const align = index === 0 ? 'center' : (index === 1 ? 'left' : 'center');
      // Usar fuente más pequeña para CORRECTAS e INCORRECTAS
      const fontSize = (index === 3 || index === 4) ? 8 : 10;
      doc.fontSize(fontSize)
         .text(header, xPos + 5, tableTop + (index === 3 || index === 4 ? 10 : 8), { 
           width: colWidths[index] - 10, 
           align: align 
         });
      xPos += colWidths[index];
    });

    yPos = tableTop + itemHeight;

    // Filas de datos
    resultados.forEach((resultado, index) => {
      const tieneResultado = resultado.resultado_id !== null && resultado.resultado_id !== undefined;
      
      // Fondo alternado para filas
      if (index % 2 === 0) {
        doc.rect(tableLeft, yPos, tableWidth, itemHeight)
           .fill('#f9fafb')
           .stroke();
      } else {
        doc.rect(tableLeft, yPos, tableWidth, itemHeight)
           .fill('white')
           .stroke();
      }

      xPos = tableLeft;
      doc.fontSize(9)
         .fillColor(colorText)
         .font('Helvetica');

      // N°
      doc.text((index + 1).toString(), xPos + 5, yPos + 8, { 
        width: colWidths[0] - 10, 
        align: 'center' 
      });
      xPos += colWidths[0];

      // Nombre
      doc.text(resultado.nombre_completo, xPos + 5, yPos + 8, { 
        width: colWidths[1] - 10, 
        align: 'left' 
      });
      xPos += colWidths[1];

      // Puntaje
      const puntajeText = tieneResultado ? resultado.puntaje.toString() : '-';
      doc.fillColor(tieneResultado ? colorText : colorGray)
         .font('Helvetica-Bold')
         .text(puntajeText, xPos + 5, yPos + 8, { 
           width: colWidths[2] - 10, 
           align: 'center' 
         });
      xPos += colWidths[2];

      // Correctas
      const correctasText = tieneResultado ? resultado.correctas.toString() : '-';
      doc.fillColor(tieneResultado ? colorGreen : colorGray)
         .text(correctasText, xPos + 5, yPos + 8, { 
           width: colWidths[3] - 10, 
           align: 'center' 
         });
      xPos += colWidths[3];

      // Incorrectas
      const incorrectasText = tieneResultado ? resultado.incorrectas.toString() : '-';
      doc.fillColor(tieneResultado ? colorRed : colorGray)
         .text(incorrectasText, xPos + 5, yPos + 8, { 
           width: colWidths[4] - 10, 
           align: 'center' 
         });

      yPos += itemHeight;

      // Nueva página si es necesario (dejando espacio para el footer)
      if (yPos > 720) {
        doc.addPage();
        yPos = 50;
      }
    });

    // Pie de página (justo después de la tabla, sin espacio extra)
    const totalConResultado = resultados.filter(r => r.resultado_id !== null).length;
    const totalSinResultado = resultados.length - totalConResultado;
    
    // Asegurar que el footer esté en la misma página que la última fila
    if (yPos > 720) {
      // Si no cabe, mover a nueva página
      doc.addPage();
      yPos = 50;
    }
    
    yPos += 10; // Pequeño espacio después de la tabla
    
    doc.fontSize(9)
       .fillColor(colorGray)
       .font('Helvetica')
       .text(`Total de alumnos: ${resultados.length} | Con resultado: ${totalConResultado} | Sin resultado: ${totalSinResultado}`, 
             50, yPos, { align: 'center', width: 495 });

    // Finalizar PDF
    doc.end();

  } catch (error) {
    console.error('Error generando PDF de resultados:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error al generar el PDF' });
    }
  }
});

/**
 * DELETE /api/docente/aula-virtual/examenes/:examenId
 * Eliminar un examen (con cascada: alternativas -> preguntas -> examen)
 */
router.delete('/aula-virtual/examenes/:examenId', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { examenId } = req.params;

    // Verificar que el examen existe y pertenece a una asignatura del docente
    const examen = await query(
      `SELECT ae.* FROM asignaturas_examenes ae
       INNER JOIN asignaturas a ON a.id = ae.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE ae.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [examenId, personal_id, colegio_id, anio_activo]
    );

    if (examen.length === 0) {
      return res.status(404).json({ error: 'Examen no encontrado o sin permisos' });
    }

    const examenActual = examen[0];

    // Obtener todas las preguntas del examen para la auditoría
    const preguntas = await query(
      `SELECT id FROM asignaturas_examenes_preguntas WHERE examen_id = ?`,
      [examenId]
    );

    // Registrar acción en auditoría ANTES de eliminar
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'ELIMINAR',
      modulo: 'AULA_VIRTUAL',
      entidad: 'examen',
      entidad_id: parseInt(examenId),
      descripcion: `Eliminó examen: "${examenActual.titulo}" (ID: ${examenId}) con ${preguntas.length} pregunta(s) y sus alternativas`,
      url: req.originalUrl,
      metodo_http: 'DELETE',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(examenActual),
      datos_nuevos: JSON.stringify({}),
      resultado: 'EXITOSO'
    });

    // Eliminar alternativas de cada pregunta (cascada)
    for (const pregunta of preguntas) {
      await execute(
        `DELETE FROM asignaturas_examenes_preguntas_alternativas WHERE pregunta_id = ?`,
        [pregunta.id]
      );
    }

    // Eliminar preguntas del examen
    await execute(
      `DELETE FROM asignaturas_examenes_preguntas WHERE examen_id = ?`,
      [examenId]
    );

    // Eliminar el examen
    await execute(
      `DELETE FROM asignaturas_examenes WHERE id = ?`,
      [examenId]
    );

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;
    
    res.json({ 
      success: true, 
      message: 'Examen eliminado correctamente'
    });
  } catch (error) {
    console.error('Error eliminando examen:', error);
    res.status(500).json({ error: 'Error al eliminar examen' });
  }
});

/**
 * GET /api/docente/aula-virtual/archivos
 * Obtener archivos/temas interactivos de una asignatura (filtrados por ciclo/bimestre)
 */
router.get('/aula-virtual/archivos', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo } = req.user;
    const { asignatura_id, ciclo } = req.query;

    if (!asignatura_id) {
      return res.status(400).json({ error: 'asignatura_id es requerido' });
    }

    // Si no se proporciona ciclo, usar 1 por defecto
    const cicloFiltro = ciclo ? parseInt(ciclo) : 1;

    // Verificar que el docente tiene acceso a esta asignatura
    const asignatura = await query(
      `SELECT a.* FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [asignatura_id, req.user.personal_id, colegio_id, anio_activo]
    );

    if (asignatura.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a esta asignatura' });
    }

    // Obtener archivos de la asignatura filtrados por ciclo
    const archivos = await query(
      `SELECT * FROM asignaturas_archivos
       WHERE asignatura_id = ? AND ciclo = ?
       ORDER BY id ASC`,
      [asignatura_id, cicloFiltro]
    );

    // Construir URLs completas para los archivos (usando PHP_SYSTEM_URL para compatibilidad con sistema anterior)
    // IMPORTANTE: El sistema PHP guarda solo el nombre del archivo en la BD
    // Debemos construir la URL completa agregando /Static/Archivos/ al inicio
    const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://nuevo.vanguardschools.edu.pe';
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const archivosConUrls = archivos.map(archivo => {
      let archivoUrl = null;
      let enlaceUrl = null;

      if (archivo.archivo && archivo.archivo !== '') {
        if (archivo.archivo.startsWith('http')) {
          // Ya es una URL completa, validar y corregir dominio si es necesario
          archivoUrl = archivo.archivo
            .replace(/https?:\/\/(www\.)?vanguardschools\.edu\.pe/gi, phpSystemUrl)
            .replace(/vanguardschools\.comstatic/gi, `${phpSystemUrl}/Static`)
            .replace(/vanguardschools\.com\/static/gi, `${phpSystemUrl}/Static`)
            .replace(/vanguardschools\.com\/Static/gi, `${phpSystemUrl}/Static`);
        } else if (archivo.archivo.startsWith('/Static/')) {
          // Ruta completa con /Static/ (formato antiguo de nuestro sistema, corregir)
          // Extraer solo el nombre del archivo y construir URL correcta
          const nombreArchivo = archivo.archivo.replace(/^\/Static\/Archivos\//, '');
          archivoUrl = isDevelopment
            ? `http://localhost:5000/Static/Archivos/${nombreArchivo}`
            : `${phpSystemUrl}/Static/Archivos/${nombreArchivo}`;
          console.log('📄 [AULA VIRTUAL TEMA] Corrigiendo ruta duplicada:', {
            id: archivo.id,
            ruta_original: archivo.archivo,
            nombre_extraido: nombreArchivo,
            url_final: archivoUrl
          });
        } else if (archivo.archivo.startsWith('/uploads/')) {
          // Ruta relativa desde /uploads/ (formato antiguo, migrar a /Static/Archivos/)
          archivoUrl = isDevelopment
            ? `http://localhost:5000${archivo.archivo}`
            : `${phpSystemUrl}${archivo.archivo}`;
        } else {
          // Solo el nombre del archivo (formato correcto del sistema PHP)
          // Construir URL completa agregando /Static/Archivos/
          archivoUrl = isDevelopment
            ? `http://localhost:5000/Static/Archivos/${archivo.archivo}`
            : `${phpSystemUrl}/Static/Archivos/${archivo.archivo}`;
        }
      }

      if (archivo.enlace && archivo.enlace !== '') {
        // IMPORTANTE: Devolver el enlace tal cual está en la BD (sin normalizar)
        // El sistema PHP muestra el enlace directamente desde la BD
        // Si normalizamos aquí, puede causar problemas en el sistema PHP
        enlaceUrl = archivo.enlace.trim();
      }

      return {
        ...archivo,
        archivo_url: archivoUrl,
        enlace_url: enlaceUrl
      };
    });

    res.json({ archivos: archivosConUrls || [] });
  } catch (error) {
    console.error('Error obteniendo archivos:', error);
    res.status(500).json({ error: 'Error al obtener archivos' });
  }
});

/**
 * PUT /api/docente/aula-virtual/archivos/ordenar
 * Actualizar el orden de los temas
 * IMPORTANTE: Esta ruta debe estar ANTES de /aula-virtual/archivos/:id
 */
router.put('/aula-virtual/archivos/ordenar', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { asignatura_id, ciclo, ordenes } = req.body;

    console.log('Datos recibidos para ordenar:', { asignatura_id, ciclo, ordenes, tipo_ciclo: typeof ciclo });

    if (!asignatura_id || ciclo === undefined || ciclo === null || !ordenes || !Array.isArray(ordenes)) {
      return res.status(400).json({ 
        error: 'asignatura_id, ciclo y ordenes (array) son requeridos',
        recibido: { asignatura_id, ciclo, ordenes: Array.isArray(ordenes) ? ordenes.length : 'no es array' }
      });
    }

    if (ordenes.length === 0) {
      return res.status(400).json({ error: 'El array de ordenes no puede estar vacío' });
    }

    // Asegurar que ciclo sea un número
    const cicloNum = parseInt(ciclo);
    if (isNaN(cicloNum)) {
      return res.status(400).json({ error: 'ciclo debe ser un número válido' });
    }

    // Verificar que el docente tiene acceso a esta asignatura
    const asignatura = await query(
      `SELECT a.* FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [asignatura_id, personal_id, colegio_id, anio_activo]
    );

    if (asignatura.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a esta asignatura' });
    }

    // Validar que cada ordenItem tenga id y orden
    for (const ordenItem of ordenes) {
      if (!ordenItem.id || ordenItem.orden === undefined || ordenItem.orden === null) {
        return res.status(400).json({ 
          error: 'Cada elemento de ordenes debe tener id y orden',
          item_invalido: ordenItem
        });
      }
    }

    // Verificar que todos los archivos existan y pertenezcan a esta asignatura y ciclo
    const archivosIds = ordenes.map(item => parseInt(item.id));
    const archivosExistentes = await query(
      `SELECT id FROM asignaturas_archivos 
       WHERE id IN (${archivosIds.map(() => '?').join(',')}) 
       AND asignatura_id = ? AND ciclo = ?`,
      [...archivosIds, parseInt(asignatura_id), cicloNum]
    );

    if (archivosExistentes.length !== archivosIds.length) {
      const idsExistentes = archivosExistentes.map(a => a.id);
      const idsFaltantes = archivosIds.filter(id => !idsExistentes.includes(id));
      return res.status(400).json({ 
        error: 'Algunos archivos no existen o no pertenecen a esta asignatura/ciclo',
        ids_faltantes: idsFaltantes,
        ids_enviados: archivosIds,
        ids_encontrados: idsExistentes
      });
    }

    // Actualizar el orden de cada tema en una transacción
    try {
      for (const ordenItem of ordenes) {
        const resultado = await execute(
          `UPDATE asignaturas_archivos 
           SET orden = ? 
           WHERE id = ? AND asignatura_id = ? AND ciclo = ?`,
          [parseInt(ordenItem.orden), parseInt(ordenItem.id), parseInt(asignatura_id), cicloNum]
        );
        
        if (resultado.affectedRows === 0) {
          console.warn(`No se actualizó el archivo ${ordenItem.id} - puede que no pertenezca al ciclo ${cicloNum}`);
        }
      }
    } catch (error) {
      console.error('Error actualizando orden individual:', error);
      throw error;
    }

    // Registrar auditoría ANTES de actualizar
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'ACTUALIZAR',
      modulo: 'AULA_VIRTUAL',
      entidad: 'archivo',
      entidad_id: null,
      descripcion: `Reordenó ${ordenes.length} tema(s) en ciclo ${cicloNum}`,
      url: req.originalUrl,
      metodo_http: 'PUT',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: null,
      datos_nuevos: JSON.stringify({ accion: 'REORDENAR', ordenes }),
      resultado: 'EXITOSO'
    });

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    res.json({ message: 'Orden actualizado correctamente' });
  } catch (error) {
    console.error('Error actualizando orden:', error);
    res.status(500).json({ error: 'Error al actualizar el orden' });
  }
});

/**
 * POST /api/docente/aula-virtual/archivos
 * Crear un nuevo tema interactivo (archivo)
 */
router.post('/aula-virtual/archivos', uploadAulaVirtual.single('archivo'), async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { asignatura_id, nombre, enlace, ciclo } = req.body;

    if (!asignatura_id || !nombre) {
      return res.status(400).json({ error: 'asignatura_id y nombre son requeridos' });
    }

    if (!req.file && !enlace) {
      return res.status(400).json({ error: 'Debe proporcionar al menos un archivo o una URL' });
    }

    // Verificar que el docente tiene acceso a esta asignatura
    const asignatura = await query(
      `SELECT a.* FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [asignatura_id, personal_id, colegio_id, anio_activo]
    );

    if (asignatura.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a esta asignatura' });
    }

    // Obtener el máximo orden para este ciclo
    const maxOrden = await query(
      `SELECT COALESCE(MAX(orden), 0) as max_orden FROM asignaturas_archivos
       WHERE asignatura_id = ? AND ciclo = ?`,
      [asignatura_id, ciclo || 1]
    );

    const nuevoOrden = (maxOrden[0]?.max_orden || 0) + 1;

    // IMPORTANTE: Guardar solo el nombre del archivo (como hace el sistema PHP anterior)
    // El sistema PHP construye la URL agregando /Static/Archivos/ al inicio
    // Si guardamos la ruta completa, se duplicaría: /Static/Archivos//Static/Archivos/...
    let archivoPath = '';
    if (req.file) {
      // Guardar solo el nombre del archivo (igual que el sistema PHP)
      archivoPath = req.file.filename;
      console.log('📄 [AULA VIRTUAL TEMA] Archivo guardado:', {
        filename: req.file.filename,
        originalname: req.file.originalname,
        path: archivoPath, // Solo el nombre
        size: req.file.size,
        nota: 'Guardado solo el nombre del archivo (compatible con sistema PHP)'
      });
    }

    // IMPORTANTE: Guardar el enlace tal cual (sin normalizar) para compatibilidad con sistema PHP
    // El sistema PHP muestra el enlace directamente desde la BD, igual que en "Enlaces"
    // Si normalizamos aquí, puede causar problemas en el sistema PHP
    const enlaceFinal = (enlace && enlace.trim() !== '') ? enlace.trim() : '';

    // Preparar datos para auditoría
    const datosNuevos = { nombre, ciclo: ciclo || 1, archivo: archivoPath, enlace: enlaceFinal };

    // Registrar auditoría ANTES de crear
    const ahora = new Date();
    const fecha = ahora.toISOString().split('T')[0];
    const hora = ahora.toTimeString().split(' ')[0];
    
    const auditoriaResult = await execute(
      `INSERT INTO auditoria_logs (
        usuario_id, colegio_id, tipo_usuario, accion, modulo, entidad, entidad_id,
        descripcion, url, metodo_http, ip_address, user_agent,
        datos_anteriores, datos_nuevos, resultado, mensaje_error, duracion_ms,
        fecha_hora, fecha, hora
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        usuario_id,
        colegio_id,
        req.user.tipo || 'DOCENTE',
        'CREAR',
        'AULA_VIRTUAL',
        'archivo',
        null, // Temporalmente null, se actualizará después
        `Creó tema: "${nombre}"`,
        req.originalUrl,
        'POST',
        req.ip || req.connection.remoteAddress,
        req.get('user-agent'),
        null,
        JSON.stringify(datosNuevos),
        'EXITOSO',
        null,
        null,
        ahora,
        fecha,
        hora,
      ]
    );

    // Insertar el nuevo tema
    const result = await execute(
      `INSERT INTO asignaturas_archivos 
       (asignatura_id, trabajador_id, nombre, archivo, visto, fecha_hora, ciclo, enlace, orden)
       VALUES (?, ?, ?, ?, '', NOW(), ?, ?, ?)`,
      [
        asignatura_id,
        personal_id,
        nombre,
        archivoPath,
        ciclo || 1,
        enlaceFinal,
        nuevoOrden
      ]
    );

    // Actualizar auditoría con el ID del tema
    await execute(
      `UPDATE auditoria_logs SET entidad_id = ? WHERE id = ?`,
      [result.insertId, auditoriaResult.insertId]
    );

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    // Crear notificaciones de forma asíncrona
    setImmediate(async () => {
      await crearNotificacionesAulaVirtual({
        asignatura_id,
        tipo: 'tema',
        nombre: nombre,
        usuario_id,
        colegio_id,
        anio_activo,
        entidad_id: result.insertId
      });
    });

    res.json({ 
      message: 'Tema creado correctamente',
      id: result.insertId 
    });
  } catch (error) {
    console.error('Error creando tema:', error);
    res.status(500).json({ error: 'Error al crear el tema' });
  }
});

/**
 * PUT /api/docente/aula-virtual/archivos/:id
 * Actualizar un tema interactivo
 */
router.put('/aula-virtual/archivos/:id', uploadAulaVirtual.single('archivo'), async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { id } = req.params;
    const { asignatura_id, nombre, enlace, ciclo } = req.body;

    if (!nombre) {
      return res.status(400).json({ error: 'nombre es requerido' });
    }

    // Verificar que el tema existe y pertenece a una asignatura del docente
    const tema = await query(
      `SELECT aa.* FROM asignaturas_archivos aa
       INNER JOIN asignaturas a ON a.id = aa.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE aa.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [id, personal_id, colegio_id, anio_activo]
    );

    if (tema.length === 0) {
      return res.status(404).json({ error: 'Tema no encontrado o sin permisos' });
    }

    const temaActual = tema[0];
    let archivoPath = temaActual.archivo;

    // Si se subió un nuevo archivo, actualizar (guardar solo el nombre del archivo, como el sistema PHP)
    if (req.file) {
      // IMPORTANTE: Guardar solo el nombre del archivo (como hace el sistema PHP anterior)
      // El sistema PHP construye la URL agregando /Static/Archivos/ al inicio
      archivoPath = req.file.filename;
      console.log('📄 [AULA VIRTUAL TEMA] Archivo actualizado:', {
        filename: req.file.filename,
        originalname: req.file.originalname,
        path: archivoPath, // Solo el nombre
        size: req.file.size,
        nota: 'Guardado solo el nombre del archivo (compatible con sistema PHP)'
      });
    }

    // Si no hay archivo nuevo y no hay enlace, mantener el archivo existente
    if (!req.file && !enlace && !temaActual.archivo && !temaActual.enlace) {
      return res.status(400).json({ error: 'Debe proporcionar al menos un archivo o una URL' });
    }

    // IMPORTANTE: Guardar el enlace tal cual (sin normalizar) para compatibilidad con sistema PHP
    // El sistema PHP muestra el enlace directamente desde la BD, igual que en "Enlaces"
    // Si normalizamos aquí, puede causar problemas en el sistema PHP
    let enlaceFinal = temaActual.enlace || ''; // Mantener el existente por defecto
    if (enlace && enlace.trim() !== '') {
      enlaceFinal = enlace.trim(); // Guardar tal cual, sin normalizar
    }

    // Preparar datos nuevos para auditoría
    const datosNuevos = { nombre, ciclo: ciclo || temaActual.ciclo, archivo: archivoPath, enlace: enlaceFinal };

    // Registrar auditoría ANTES de actualizar
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'EDITAR',
      modulo: 'AULA_VIRTUAL',
      entidad: 'archivo',
      entidad_id: parseInt(id),
      descripcion: `Editó tema: "${temaActual.nombre}" (ID: ${id})`,
      url: req.originalUrl,
      metodo_http: 'PUT',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(temaActual),
      datos_nuevos: JSON.stringify(datosNuevos),
      resultado: 'EXITOSO'
    });

    // Actualizar el tema
    await execute(
      `UPDATE asignaturas_archivos 
       SET nombre = ?, archivo = ?, enlace = ?, ciclo = ?
       WHERE id = ?`,
      [
        nombre,
        archivoPath,
        enlaceFinal,
        ciclo || temaActual.ciclo,
        id
      ]
    );

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    res.json({ message: 'Tema actualizado correctamente' });
  } catch (error) {
    console.error('Error actualizando tema:', error);
    res.status(500).json({ error: 'Error al actualizar el tema' });
  }
});

/**
 * DELETE /api/docente/aula-virtual/archivos/:id
 * Eliminar un tema interactivo
 */
router.delete('/aula-virtual/archivos/:id', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { id } = req.params;

    // Verificar que el tema existe y pertenece a una asignatura del docente
    const tema = await query(
      `SELECT aa.* FROM asignaturas_archivos aa
       INNER JOIN asignaturas a ON a.id = aa.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE aa.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [id, personal_id, colegio_id, anio_activo]
    );

    if (tema.length === 0) {
      return res.status(404).json({ error: 'Tema no encontrado o sin permisos' });
    }

    const temaActual = tema[0];

    // Registrar auditoría ANTES de eliminar
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'ELIMINAR',
      modulo: 'AULA_VIRTUAL',
      entidad: 'archivo',
      entidad_id: parseInt(id),
      descripcion: `Eliminó tema: "${temaActual.nombre}" (ID: ${id})`,
      url: req.originalUrl,
      metodo_http: 'DELETE',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(temaActual),
      datos_nuevos: JSON.stringify({}),
      resultado: 'EXITOSO'
    });

    // Eliminar el tema
    await execute(
      `DELETE FROM asignaturas_archivos WHERE id = ?`,
      [id]
    );

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    res.json({ message: 'Tema eliminado correctamente' });
  } catch (error) {
    console.error('Error eliminando tema:', error);
    res.status(500).json({ error: 'Error al eliminar el tema' });
  }
});

/**
 * GET /api/docente/aula-virtual/videos
 * Obtener videos de una asignatura (filtrados por ciclo/bimestre)
 */
router.get('/aula-virtual/videos', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo } = req.user;
    const { asignatura_id, ciclo } = req.query;

    if (!asignatura_id) {
      return res.status(400).json({ error: 'asignatura_id es requerido' });
    }

    // Si no se proporciona ciclo, usar 1 por defecto
    const cicloFiltro = ciclo ? parseInt(ciclo) : 1;

    // Verificar que el docente tiene acceso a esta asignatura
    const asignatura = await query(
      `SELECT a.* FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [asignatura_id, req.user.personal_id, colegio_id, anio_activo]
    );

    if (asignatura.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a esta asignatura' });
    }

    // Obtener videos de la asignatura filtrados por ciclo
    const videos = await query(
      `SELECT * FROM asignaturas_videos
       WHERE asignatura_id = ? AND ciclo = ?
       ORDER BY id ASC`,
      [asignatura_id, cicloFiltro]
    );

    res.json({ videos: videos || [] });
  } catch (error) {
    console.error('Error obteniendo videos:', error);
    res.status(500).json({ error: 'Error al obtener videos' });
  }
});

/**
 * GET /api/docente/aula-virtual/enlaces
 * Obtener enlaces de ayuda de una asignatura (filtrados por ciclo/bimestre)
 */
router.get('/aula-virtual/enlaces', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo } = req.user;
    const { asignatura_id, ciclo } = req.query;

    if (!asignatura_id) {
      return res.status(400).json({ error: 'asignatura_id es requerido' });
    }

    // Si no se proporciona ciclo, usar 1 por defecto
    const cicloFiltro = ciclo ? parseInt(ciclo) : 1;

    // Verificar que el docente tiene acceso a esta asignatura
    const asignatura = await query(
      `SELECT a.* FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [asignatura_id, req.user.personal_id, colegio_id, anio_activo]
    );

    if (asignatura.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a esta asignatura' });
    }

    // Obtener enlaces de la asignatura filtrados por ciclo
    const enlaces = await query(
      `SELECT * FROM asignaturas_enlaces
       WHERE asignatura_id = ? AND ciclo = ?
       ORDER BY id ASC`,
      [asignatura_id, cicloFiltro]
    );

    res.json({ enlaces: enlaces || [] });
  } catch (error) {
    console.error('Error obteniendo enlaces:', error);
    res.status(500).json({ error: 'Error al obtener enlaces' });
  }
});

/**
 * POST /api/docente/aula-virtual/videos
 * Crear un nuevo video
 */
router.post('/aula-virtual/videos', async (req, res) => {
  try {
    const { usuario_id, colegio_id, personal_id, anio_activo } = req.user;
    const { asignatura_id, descripcion, enlace, ciclo } = req.body;

    console.log('📹 [VIDEO] Datos recibidos:', { asignatura_id, descripcion, enlace, ciclo });
    console.log('📹 [VIDEO] Usuario:', { usuario_id, colegio_id, personal_id, anio_activo });

    if (!asignatura_id || !descripcion || !enlace || !ciclo) {
      return res.status(400).json({ error: 'asignatura_id, descripcion, enlace y ciclo son requeridos' });
    }

    if (!personal_id) {
      console.error('❌ [VIDEO] personal_id no está disponible en req.user');
      return res.status(403).json({ error: 'Error de autenticación: personal_id no disponible' });
    }

    // Verificar que el docente tiene acceso a esta asignatura
    const asignatura = await query(
      `SELECT a.* FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [asignatura_id, personal_id, colegio_id, anio_activo]
    );

    console.log('📹 [VIDEO] Asignatura encontrada:', asignatura.length > 0 ? 'Sí' : 'No');

    if (asignatura.length === 0) {
      // Intentar obtener más información para debug
      const asignaturaInfo = await query(
        `SELECT a.*, a.personal_id as asignatura_personal_id, g.anio as grupo_anio
         FROM asignaturas a
         INNER JOIN grupos g ON g.id = a.grupo_id
         WHERE a.id = ?`,
        [asignatura_id]
      );
      
      console.error('❌ [VIDEO] No se encontró asignatura con:', { 
        asignatura_id, 
        personal_id, 
        colegio_id, 
        anio_activo,
        asignatura_info: asignaturaInfo.length > 0 ? {
          asignatura_personal_id: asignaturaInfo[0].asignatura_personal_id,
          grupo_anio: asignaturaInfo[0].grupo_anio,
          asignatura_colegio_id: asignaturaInfo[0].colegio_id
        } : 'Asignatura no existe'
      });
      
      return res.status(403).json({ 
        error: 'No tienes acceso a esta asignatura',
        debug: asignaturaInfo.length > 0 ? {
          asignatura_personal_id: asignaturaInfo[0].asignatura_personal_id,
          grupo_anio: asignaturaInfo[0].grupo_anio,
          personal_id_usuario: personal_id,
          anio_activo: anio_activo
        } : 'Asignatura no encontrada'
      });
    }

    // Preparar datos para auditoría
    const datosNuevos = { asignatura_id, descripcion, enlace, ciclo };

    // Registrar auditoría ANTES de crear
    const ahora = new Date();
    const fecha = ahora.toISOString().split('T')[0];
    const hora = ahora.toTimeString().split(' ')[0];
    
    const auditoriaResult = await execute(
      `INSERT INTO auditoria_logs (
        usuario_id, colegio_id, tipo_usuario, accion, modulo, entidad, entidad_id,
        descripcion, url, metodo_http, ip_address, user_agent,
        datos_anteriores, datos_nuevos, resultado, mensaje_error, duracion_ms,
        fecha_hora, fecha, hora
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        usuario_id,
        colegio_id,
        'DOCENTE',
        'CREAR',
        'AULA_VIRTUAL',
        'video',
        null, // Temporalmente null, se actualizará después
        `Creó video: "${descripcion}"`,
        req.originalUrl,
        'POST',
        req.ip || req.connection.remoteAddress,
        req.get('user-agent'),
        null,
        JSON.stringify(datosNuevos),
        'EXITOSO',
        null,
        null,
        ahora,
        fecha,
        hora,
      ]
    );

    // Insertar video
    const result = await execute(
      `INSERT INTO asignaturas_videos (asignatura_id, descripcion, enlace, trabajador_id, fecha_hora, ciclo)
       VALUES (?, ?, ?, ?, NOW(), ?)`,
      [asignatura_id, descripcion, enlace, personal_id, ciclo]
    );

    // Actualizar auditoría con el ID del video
    await execute(
      `UPDATE auditoria_logs SET entidad_id = ? WHERE id = ?`,
      [result.insertId, auditoriaResult.insertId]
    );

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    // Crear notificaciones de forma asíncrona
    setImmediate(async () => {
      await crearNotificacionesAulaVirtual({
        asignatura_id,
        tipo: 'video',
        nombre: descripcion,
        usuario_id,
        colegio_id,
        anio_activo,
        entidad_id: result.insertId
      });
    });

    res.json({ 
      success: true, 
      message: 'Video creado correctamente',
      video_id: result.insertId 
    });
  } catch (error) {
    console.error('Error creando video:', error);
    res.status(500).json({ error: 'Error al crear video' });
  }
});

/**
 * PUT /api/docente/aula-virtual/videos/:videoId
 * Actualizar un video
 */
router.put('/aula-virtual/videos/:videoId', async (req, res) => {
  try {
    const { usuario_id, colegio_id, personal_id, anio_activo } = req.user;
    const { videoId } = req.params;
    const { descripcion, enlace, ciclo } = req.body;

    if (!descripcion || !enlace || !ciclo) {
      return res.status(400).json({ error: 'descripcion, enlace y ciclo son requeridos' });
    }

    // Obtener video actual
    const videoActual = await query(
      `SELECT av.*, a.personal_id, a.colegio_id, g.anio
       FROM asignaturas_videos av
       INNER JOIN asignaturas a ON a.id = av.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE av.id = ?`,
      [videoId]
    );

    if (videoActual.length === 0) {
      return res.status(404).json({ error: 'Video no encontrado' });
    }

    // Verificar que el docente tiene acceso
    if (videoActual[0].personal_id !== personal_id || 
        videoActual[0].colegio_id !== colegio_id || 
        videoActual[0].anio !== anio_activo) {
      return res.status(403).json({ error: 'No tienes acceso a este video' });
    }

    // Preparar datos nuevos para auditoría
    const datosNuevos = { descripcion, enlace, ciclo };

    // Registrar auditoría ANTES de actualizar
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: 'DOCENTE',
      accion: 'EDITAR',
      modulo: 'AULA_VIRTUAL',
      entidad: 'video',
      entidad_id: parseInt(videoId),
      descripcion: `Editó video: "${videoActual[0].descripcion}" (ID: ${videoId})`,
      url: req.originalUrl,
      metodo_http: 'PUT',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(videoActual[0]),
      datos_nuevos: JSON.stringify(datosNuevos),
      resultado: 'EXITOSO'
    });

    // Actualizar video
    await execute(
      `UPDATE asignaturas_videos 
       SET descripcion = ?, enlace = ?, ciclo = ?
       WHERE id = ?`,
      [descripcion, enlace, ciclo, videoId]
    );

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    res.json({ success: true, message: 'Video actualizado correctamente' });
  } catch (error) {
    console.error('Error actualizando video:', error);
    res.status(500).json({ error: 'Error al actualizar video' });
  }
});

/**
 * DELETE /api/docente/aula-virtual/videos/:videoId
 * Eliminar un video
 */
router.delete('/aula-virtual/videos/:videoId', async (req, res) => {
  try {
    const { usuario_id, colegio_id, personal_id, anio_activo } = req.user;
    const { videoId } = req.params;

    // Obtener video actual
    const videoActual = await query(
      `SELECT av.*, a.personal_id, a.colegio_id, g.anio
       FROM asignaturas_videos av
       INNER JOIN asignaturas a ON a.id = av.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE av.id = ?`,
      [videoId]
    );

    if (videoActual.length === 0) {
      return res.status(404).json({ error: 'Video no encontrado' });
    }

    // Verificar que el docente tiene acceso
    if (videoActual[0].personal_id !== personal_id || 
        videoActual[0].colegio_id !== colegio_id || 
        videoActual[0].anio !== anio_activo) {
      return res.status(403).json({ error: 'No tienes acceso a este video' });
    }

    // Registrar auditoría ANTES de eliminar
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: 'DOCENTE',
      accion: 'ELIMINAR',
      modulo: 'AULA_VIRTUAL',
      entidad: 'video',
      entidad_id: parseInt(videoId),
      descripcion: `Eliminó video: "${videoActual[0].descripcion}" (ID: ${videoId})`,
      url: req.originalUrl,
      metodo_http: 'DELETE',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(videoActual[0]),
      datos_nuevos: JSON.stringify({}),
      resultado: 'EXITOSO'
    });

    // Eliminar video
    await execute(
      `DELETE FROM asignaturas_videos WHERE id = ?`,
      [videoId]
    );

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    res.json({ success: true, message: 'Video eliminado correctamente' });
  } catch (error) {
    console.error('Error eliminando video:', error);
    res.status(500).json({ error: 'Error al eliminar video' });
  }
});

/**
 * POST /api/docente/aula-virtual/enlaces
 * Crear un nuevo enlace de ayuda
 */
router.post('/aula-virtual/enlaces', async (req, res) => {
  try {
    const { usuario_id, colegio_id, personal_id, anio_activo } = req.user;
    const { asignatura_id, descripcion, enlace, ciclo } = req.body;

    console.log('🔗 [ENLACE] Datos recibidos:', { asignatura_id, descripcion, enlace, ciclo });
    console.log('🔗 [ENLACE] Usuario:', { usuario_id, colegio_id, personal_id, anio_activo });

    if (!asignatura_id || !descripcion || !enlace || !ciclo) {
      return res.status(400).json({ error: 'asignatura_id, descripcion, enlace y ciclo son requeridos' });
    }

    if (!personal_id) {
      console.error('❌ [ENLACE] personal_id no está disponible en req.user');
      return res.status(403).json({ error: 'Error de autenticación: personal_id no disponible' });
    }

    // Verificar que el docente tiene acceso a esta asignatura
    const asignatura = await query(
      `SELECT a.* FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [asignatura_id, personal_id, colegio_id, anio_activo]
    );

    console.log('🔗 [ENLACE] Asignatura encontrada:', asignatura.length > 0 ? 'Sí' : 'No');

    if (asignatura.length === 0) {
      // Intentar obtener más información para debug
      const asignaturaInfo = await query(
        `SELECT a.*, a.personal_id as asignatura_personal_id, g.anio as grupo_anio
         FROM asignaturas a
         INNER JOIN grupos g ON g.id = a.grupo_id
         WHERE a.id = ?`,
        [asignatura_id]
      );
      
      console.error('❌ [ENLACE] No se encontró asignatura con:', { 
        asignatura_id, 
        personal_id, 
        colegio_id, 
        anio_activo,
        asignatura_info: asignaturaInfo.length > 0 ? {
          asignatura_personal_id: asignaturaInfo[0].asignatura_personal_id,
          grupo_anio: asignaturaInfo[0].grupo_anio,
          asignatura_colegio_id: asignaturaInfo[0].colegio_id
        } : 'Asignatura no existe'
      });
      
      return res.status(403).json({ 
        error: 'No tienes acceso a esta asignatura',
        debug: asignaturaInfo.length > 0 ? {
          asignatura_personal_id: asignaturaInfo[0].asignatura_personal_id,
          grupo_anio: asignaturaInfo[0].grupo_anio,
          personal_id_usuario: personal_id,
          anio_activo: anio_activo
        } : 'Asignatura no encontrada'
      });
    }

    // Preparar datos para auditoría
    const datosNuevos = { asignatura_id, descripcion, enlace, ciclo };

    // Registrar auditoría ANTES de crear
    const ahora = new Date();
    const fecha = ahora.toISOString().split('T')[0];
    const hora = ahora.toTimeString().split(' ')[0];
    
    const auditoriaResult = await execute(
      `INSERT INTO auditoria_logs (
        usuario_id, colegio_id, tipo_usuario, accion, modulo, entidad, entidad_id,
        descripcion, url, metodo_http, ip_address, user_agent,
        datos_anteriores, datos_nuevos, resultado, mensaje_error, duracion_ms,
        fecha_hora, fecha, hora
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        usuario_id,
        colegio_id,
        'DOCENTE',
        'CREAR',
        'AULA_VIRTUAL',
        'enlace',
        null, // Temporalmente null, se actualizará después
        `Creó enlace: "${descripcion}"`,
        req.originalUrl,
        'POST',
        req.ip || req.connection.remoteAddress,
        req.get('user-agent'),
        null,
        JSON.stringify(datosNuevos),
        'EXITOSO',
        null,
        null,
        ahora,
        fecha,
        hora,
      ]
    );

    // Insertar enlace
    const result = await execute(
      `INSERT INTO asignaturas_enlaces (asignatura_id, descripcion, enlace, trabajador_id, fecha_hora, ciclo)
       VALUES (?, ?, ?, ?, NOW(), ?)`,
      [asignatura_id, descripcion, enlace, personal_id, ciclo]
    );

    // Actualizar auditoría con el ID del enlace
    await execute(
      `UPDATE auditoria_logs SET entidad_id = ? WHERE id = ?`,
      [result.insertId, auditoriaResult.insertId]
    );

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    // Crear notificaciones de forma asíncrona
    setImmediate(async () => {
      await crearNotificacionesAulaVirtual({
        asignatura_id,
        tipo: 'enlace',
        nombre: descripcion,
        usuario_id,
        colegio_id,
        anio_activo,
        entidad_id: result.insertId
      });
    });

    res.json({ 
      success: true, 
      message: 'Enlace creado correctamente',
      enlace_id: result.insertId 
    });
  } catch (error) {
    console.error('Error creando enlace:', error);
    res.status(500).json({ error: 'Error al crear enlace' });
  }
});

/**
 * PUT /api/docente/aula-virtual/enlaces/:enlaceId
 * Actualizar un enlace de ayuda
 */
router.put('/aula-virtual/enlaces/:enlaceId', async (req, res) => {
  try {
    const { usuario_id, colegio_id, personal_id, anio_activo } = req.user;
    const { enlaceId } = req.params;
    const { descripcion, enlace, ciclo } = req.body;

    if (!descripcion || !enlace || !ciclo) {
      return res.status(400).json({ error: 'descripcion, enlace y ciclo son requeridos' });
    }

    // Obtener enlace actual
    const enlaceActual = await query(
      `SELECT ae.*, a.personal_id, a.colegio_id, g.anio
       FROM asignaturas_enlaces ae
       INNER JOIN asignaturas a ON a.id = ae.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE ae.id = ?`,
      [enlaceId]
    );

    if (enlaceActual.length === 0) {
      return res.status(404).json({ error: 'Enlace no encontrado' });
    }

    // Verificar que el docente tiene acceso
    if (enlaceActual[0].personal_id !== personal_id || 
        enlaceActual[0].colegio_id !== colegio_id || 
        enlaceActual[0].anio !== anio_activo) {
      return res.status(403).json({ error: 'No tienes acceso a este enlace' });
    }

    // Preparar datos nuevos para auditoría
    const datosNuevos = { descripcion, enlace, ciclo };

    // Registrar auditoría ANTES de actualizar
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: 'DOCENTE',
      accion: 'EDITAR',
      modulo: 'AULA_VIRTUAL',
      entidad: 'enlace',
      entidad_id: parseInt(enlaceId),
      descripcion: `Editó enlace: "${enlaceActual[0].descripcion}" (ID: ${enlaceId})`,
      url: req.originalUrl,
      metodo_http: 'PUT',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(enlaceActual[0]),
      datos_nuevos: JSON.stringify(datosNuevos),
      resultado: 'EXITOSO'
    });

    // Actualizar enlace
    await execute(
      `UPDATE asignaturas_enlaces 
       SET descripcion = ?, enlace = ?, ciclo = ?
       WHERE id = ?`,
      [descripcion, enlace, ciclo, enlaceId]
    );

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    res.json({ success: true, message: 'Enlace actualizado correctamente' });
  } catch (error) {
    console.error('Error actualizando enlace:', error);
    res.status(500).json({ error: 'Error al actualizar enlace' });
  }
});

/**
 * DELETE /api/docente/aula-virtual/enlaces/:enlaceId
 * Eliminar un enlace de ayuda
 */
router.delete('/aula-virtual/enlaces/:enlaceId', async (req, res) => {
  try {
    const { usuario_id, colegio_id, personal_id, anio_activo } = req.user;
    const { enlaceId } = req.params;

    // Obtener enlace actual
    const enlaceActual = await query(
      `SELECT ae.*, a.personal_id, a.colegio_id, g.anio
       FROM asignaturas_enlaces ae
       INNER JOIN asignaturas a ON a.id = ae.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE ae.id = ?`,
      [enlaceId]
    );

    if (enlaceActual.length === 0) {
      return res.status(404).json({ error: 'Enlace no encontrado' });
    }

    // Verificar que el docente tiene acceso
    if (enlaceActual[0].personal_id !== personal_id || 
        enlaceActual[0].colegio_id !== colegio_id || 
        enlaceActual[0].anio !== anio_activo) {
      return res.status(403).json({ error: 'No tienes acceso a este enlace' });
    }

    // Registrar auditoría ANTES de eliminar
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: 'DOCENTE',
      accion: 'ELIMINAR',
      modulo: 'AULA_VIRTUAL',
      entidad: 'enlace',
      entidad_id: parseInt(enlaceId),
      descripcion: `Eliminó enlace: "${enlaceActual[0].descripcion}" (ID: ${enlaceId})`,
      url: req.originalUrl,
      metodo_http: 'DELETE',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(enlaceActual[0]),
      datos_nuevos: JSON.stringify({}),
      resultado: 'EXITOSO'
    });

    // Eliminar enlace
    await execute(
      `DELETE FROM asignaturas_enlaces WHERE id = ?`,
      [enlaceId]
    );

    // Marcar para que el middleware no registre automáticamente
    req.skipAudit = true;

    res.json({ success: true, message: 'Enlace eliminado correctamente' });
  } catch (error) {
    console.error('Error eliminando enlace:', error);
    res.status(500).json({ error: 'Error al eliminar enlace' });
  }
});

/**
 * POST /api/docente/actividades/importar-calendario
 * Importar actividades desde calendarizacion.json a la base de datos
 * Solo para administradores o docentes autorizados
 */
router.post('/actividades/importar-calendario', async (req, res) => {
  try {
    const { usuario_id, colegio_id } = req.user;
    const fs = require('fs');
    const path = require('path');

    // Ruta al archivo JSON
    const jsonPath = path.join(__dirname, '../../../calendarizacion.json');

    // Verificar que el archivo existe
    if (!fs.existsSync(jsonPath)) {
      return res.status(404).json({ error: 'Archivo calendarizacion.json no encontrado' });
    }

    // Leer el archivo JSON
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const año = jsonData.año || 2026;
    const meses = jsonData.meses || {};

    console.log(`📅 Iniciando importación de actividades para el año ${año}`);

    let actividadesInsertadas = 0;
    let actividadesConError = 0;
    const errores = [];

    // Procesar cada mes
    for (const [mesNum, mesData] of Object.entries(meses)) {
      const mes = parseInt(mesNum);
      const eventos = mesData.eventos || [];

      console.log(`📅 Procesando mes ${mes} (${mesData.nombre}): ${eventos.length} eventos`);

      // Procesar cada evento del mes
      for (const evento of eventos) {
        try {
          let fechaInicio, fechaFin;
          const descripcion = evento.texto || '';
          const lugar = 'Colegio Vanguard';
          const detalles = evento.tipo || '';

          // Determinar fechas según si tiene día único o rango
          if (evento.dia) {
            // Evento de un solo día
            fechaInicio = new Date(año, mes - 1, evento.dia, 0, 0, 0);
            fechaFin = new Date(año, mes - 1, evento.dia, 23, 59, 59);
          } else if (evento.rango && evento.rango.inicio && evento.rango.fin) {
            // Evento con rango de días
            fechaInicio = new Date(año, mes - 1, evento.rango.inicio, 0, 0, 0);
            fechaFin = new Date(año, mes - 1, evento.rango.fin, 23, 59, 59);
          } else {
            // Si no tiene ni día ni rango válido, saltar
            console.warn(`⚠️ Evento sin fecha válida: ${descripcion}`);
            actividadesConError++;
            errores.push({
              evento: descripcion,
              error: 'No tiene día ni rango válido'
            });
            continue;
          }

          // Validar que las fechas sean válidas
          if (isNaN(fechaInicio.getTime()) || isNaN(fechaFin.getTime())) {
            console.warn(`⚠️ Fecha inválida para evento: ${descripcion}`);
            actividadesConError++;
            errores.push({
              evento: descripcion,
              error: 'Fecha inválida'
            });
            continue;
          }

          // Formatear fechas para MySQL (YYYY-MM-DD HH:mm:ss)
          const fechaInicioStr = fechaInicio.toISOString().slice(0, 19).replace('T', ' ');
          const fechaFinStr = fechaFin.toISOString().slice(0, 19).replace('T', ' ');

          // Verificar si ya existe una actividad similar (evitar duplicados)
          const actividadesExistentes = await query(
            `SELECT id FROM actividades 
             WHERE colegio_id = ? 
             AND descripcion = ? 
             AND DATE(fecha_inicio) = DATE(?) 
             AND DATE(fecha_fin) = DATE(?)`,
            [colegio_id, descripcion, fechaInicioStr, fechaFinStr]
          );

          if (actividadesExistentes.length > 0) {
            console.log(`⏭️ Actividad ya existe, saltando: ${descripcion} (${fechaInicioStr})`);
            continue;
          }

          // Insertar actividad en la base de datos
          await execute(
            `INSERT INTO actividades (colegio_id, descripcion, lugar, detalles, fecha_inicio, fecha_fin, usuario_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [colegio_id, descripcion, lugar, detalles, fechaInicioStr, fechaFinStr, usuario_id]
          );

          actividadesInsertadas++;
          console.log(`✅ Actividad insertada: ${descripcion} (${fechaInicioStr} - ${fechaFinStr})`);

        } catch (error) {
          console.error(`❌ Error procesando evento:`, error);
          actividadesConError++;
          errores.push({
            evento: evento.texto || 'Desconocido',
            error: error.message
          });
        }
      }
    }

    // Registrar acción en auditoría
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'IMPORTAR',
      modulo: 'ACTIVIDADES',
      entidad: 'actividades',
      entidad_id: null,
      descripcion: `Importación de actividades desde calendarizacion.json - ${actividadesInsertadas} insertadas`,
      url: req.originalUrl,
      metodo_http: req.method,
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_nuevos: {
        año,
        actividades_insertadas: actividadesInsertadas,
        actividades_con_error: actividadesConError
      },
      resultado: actividadesConError === 0 ? 'EXITOSO' : 'PARCIAL'
    });

    res.json({
      success: true,
      message: `Importación completada: ${actividadesInsertadas} actividades insertadas`,
      año,
      actividades_insertadas: actividadesInsertadas,
      actividades_con_error: actividadesConError,
      errores: errores.length > 0 ? errores : undefined
    });

  } catch (error) {
    console.error('Error importando actividades:', error);
    res.status(500).json({ 
      error: 'Error al importar actividades',
      detalles: error.message 
    });
  }
});

/**
 * ============================================================
 * ENDPOINTS PARA PREGUNTAS Y ALTERNATIVAS DE EXÁMENES
 * ============================================================
 */

/**
 * GET /api/docente/aula-virtual/examenes/:examenId/preguntas
 * Obtener todas las preguntas de un examen
 */
router.get('/aula-virtual/examenes/:examenId/preguntas', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { examenId } = req.params;

    // Verificar que el examen existe y pertenece al docente
    const examen = await query(
      `SELECT ae.*, a.personal_id, a.colegio_id, g.anio 
       FROM asignaturas_examenes ae
       INNER JOIN asignaturas a ON a.id = ae.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE ae.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [examenId, personal_id, colegio_id, anio_activo]
    );

    if (examen.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a este examen' });
    }

    // Obtener preguntas ordenadas por orden
    const preguntas = await query(
      `SELECT * FROM asignaturas_examenes_preguntas 
       WHERE examen_id = ? 
       ORDER BY orden ASC, id ASC`,
      [examenId]
    );

    res.json({ preguntas: preguntas || [] });
  } catch (error) {
    console.error('Error obteniendo preguntas:', error);
    res.status(500).json({ error: 'Error al obtener preguntas' });
  }
});

/**
 * POST /api/docente/aula-virtual/examenes/:examenId/preguntas
 * Crear una nueva pregunta
 */
router.post('/aula-virtual/examenes/:examenId/preguntas', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { examenId } = req.params;
    const { descripcion, tipo, puntos, datos_adicionales } = req.body;

    if (!descripcion || !tipo) {
      return res.status(400).json({ error: 'descripcion y tipo son requeridos' });
    }

    // Verificar que el examen existe y pertenece al docente
    const examen = await query(
      `SELECT ae.*, a.personal_id, a.colegio_id, g.anio 
       FROM asignaturas_examenes ae
       INNER JOIN asignaturas a ON a.id = ae.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE ae.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [examenId, personal_id, colegio_id, anio_activo]
    );

    if (examen.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a este examen' });
    }

    // Obtener el siguiente orden
    const ultimaPregunta = await query(
      `SELECT MAX(orden) as max_orden FROM asignaturas_examenes_preguntas WHERE examen_id = ?`,
      [examenId]
    );
    const siguienteOrden = (ultimaPregunta[0]?.max_orden || 0) + 1;

    // Si el tipo de puntaje es INDIVIDUAL, puntos es requerido
    const puntosFinal = examen[0].tipo_puntaje === 'INDIVIDUAL' 
      ? (parseFloat(puntos) || 0) 
      : 0;

    // Preparar datos adicionales como JSON
    const datosAdicionalesJson = datos_adicionales ? JSON.stringify(datos_adicionales) : null;

    // Insertar pregunta
    const result = await execute(
      `INSERT INTO asignaturas_examenes_preguntas 
       (examen_id, descripcion, puntos, orden, tipo, imagen_puzzle, datos_adicionales)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        examenId,
        descripcion,
        puntosFinal,
        siguienteOrden,
        tipo,
        '', // imagen_puzzle por defecto vacío
        datosAdicionalesJson
      ]
    );

    // Registrar auditoría
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'CREAR',
      modulo: 'AULA_VIRTUAL',
      entidad: 'pregunta',
      entidad_id: result.insertId,
      descripcion: `Creó pregunta tipo ${tipo} para examen ID: ${examenId}`,
      url: req.originalUrl,
      metodo_http: 'POST',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_nuevos: JSON.stringify({ descripcion, tipo, puntos: puntosFinal }),
      resultado: 'EXITOSO'
    });

    req.skipAudit = true;

    res.json({ 
      success: true, 
      message: 'Pregunta creada correctamente',
      pregunta_id: result.insertId 
    });
  } catch (error) {
    console.error('Error creando pregunta:', error);
    res.status(500).json({ error: 'Error al crear pregunta' });
  }
});

/**
 * PUT /api/docente/aula-virtual/preguntas/:preguntaId
 * Actualizar una pregunta existente
 */
router.put('/aula-virtual/preguntas/:preguntaId', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { preguntaId } = req.params;
    const { descripcion, tipo, puntos, orden, datos_adicionales } = req.body;

    // Verificar que la pregunta existe y pertenece al docente
    const pregunta = await query(
      `SELECT ep.*, ae.asignatura_id, a.personal_id, a.colegio_id, g.anio
       FROM asignaturas_examenes_preguntas ep
       INNER JOIN asignaturas_examenes ae ON ae.id = ep.examen_id
       INNER JOIN asignaturas a ON a.id = ae.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE ep.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [preguntaId, personal_id, colegio_id, anio_activo]
    );

    if (pregunta.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a esta pregunta' });
    }

    // Obtener examen para verificar tipo_puntaje
    const examen = await query(
      `SELECT tipo_puntaje FROM asignaturas_examenes WHERE id = ?`,
      [pregunta[0].examen_id]
    );

    const puntosFinal = examen[0]?.tipo_puntaje === 'INDIVIDUAL' 
      ? (parseFloat(puntos) || pregunta[0].puntos) 
      : pregunta[0].puntos;

    // Preparar datos adicionales como JSON
    const datosAdicionalesJson = datos_adicionales ? JSON.stringify(datos_adicionales) : null;

    // Datos anteriores para auditoría
    const datosAnteriores = {
      descripcion: pregunta[0].descripcion,
      tipo: pregunta[0].tipo,
      puntos: pregunta[0].puntos,
      orden: pregunta[0].orden
    };

    // Actualizar pregunta
    await execute(
      `UPDATE asignaturas_examenes_preguntas 
       SET descripcion = ?, tipo = ?, puntos = ?, orden = ?, datos_adicionales = ?
       WHERE id = ?`,
      [
        descripcion || pregunta[0].descripcion,
        tipo || pregunta[0].tipo,
        puntosFinal,
        orden !== undefined ? parseInt(orden) : pregunta[0].orden,
        datosAdicionalesJson,
        preguntaId
      ]
    );

    // Registrar auditoría
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'EDITAR',
      modulo: 'AULA_VIRTUAL',
      entidad: 'pregunta',
      entidad_id: parseInt(preguntaId),
      descripcion: `Editó pregunta tipo ${tipo || pregunta[0].tipo} (ID: ${preguntaId})`,
      url: req.originalUrl,
      metodo_http: 'PUT',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(datosAnteriores),
      datos_nuevos: JSON.stringify({ descripcion, tipo, puntos: puntosFinal, orden }),
      resultado: 'EXITOSO'
    });

    req.skipAudit = true;

    res.json({ 
      success: true, 
      message: 'Pregunta actualizada correctamente'
    });
  } catch (error) {
    console.error('Error actualizando pregunta:', error);
    res.status(500).json({ error: 'Error al actualizar pregunta' });
  }
});

/**
 * DELETE /api/docente/aula-virtual/preguntas/:preguntaId
 * Eliminar una pregunta y sus alternativas
 */
router.delete('/aula-virtual/preguntas/:preguntaId', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { preguntaId } = req.params;

    // Verificar que la pregunta existe y pertenece al docente
    const pregunta = await query(
      `SELECT ep.*, ae.asignatura_id, a.personal_id, a.colegio_id, g.anio
       FROM asignaturas_examenes_preguntas ep
       INNER JOIN asignaturas_examenes ae ON ae.id = ep.examen_id
       INNER JOIN asignaturas a ON a.id = ae.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE ep.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [preguntaId, personal_id, colegio_id, anio_activo]
    );

    if (pregunta.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a esta pregunta' });
    }

    // Obtener alternativas para auditoría
    const alternativas = await query(
      `SELECT COUNT(*) as total FROM asignaturas_examenes_preguntas_alternativas WHERE pregunta_id = ?`,
      [preguntaId]
    );

    // Registrar auditoría ANTES de eliminar
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'ELIMINAR',
      modulo: 'AULA_VIRTUAL',
      entidad: 'pregunta',
      entidad_id: parseInt(preguntaId),
      descripcion: `Eliminó pregunta tipo ${pregunta[0].tipo} (ID: ${preguntaId}) con ${alternativas[0]?.total || 0} alternativa(s)`,
      url: req.originalUrl,
      metodo_http: 'DELETE',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(pregunta[0]),
      datos_nuevos: JSON.stringify({}),
      resultado: 'EXITOSO'
    });

    // Eliminar alternativas primero (cascada)
    await execute(
      `DELETE FROM asignaturas_examenes_preguntas_alternativas WHERE pregunta_id = ?`,
      [preguntaId]
    );

    // Eliminar pregunta
    await execute(
      `DELETE FROM asignaturas_examenes_preguntas WHERE id = ?`,
      [preguntaId]
    );

    req.skipAudit = true;

    res.json({ 
      success: true, 
      message: 'Pregunta eliminada correctamente'
    });
  } catch (error) {
    console.error('Error eliminando pregunta:', error);
    res.status(500).json({ error: 'Error al eliminar pregunta' });
  }
});

/**
 * GET /api/docente/aula-virtual/preguntas/:preguntaId/alternativas
 * Obtener todas las alternativas de una pregunta
 */
router.get('/aula-virtual/preguntas/:preguntaId/alternativas', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { preguntaId } = req.params;

    // Verificar que la pregunta existe y pertenece al docente
    const pregunta = await query(
      `SELECT ep.*, ae.asignatura_id, a.personal_id, a.colegio_id, g.anio
       FROM asignaturas_examenes_preguntas ep
       INNER JOIN asignaturas_examenes ae ON ae.id = ep.examen_id
       INNER JOIN asignaturas a ON a.id = ae.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE ep.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [preguntaId, personal_id, colegio_id, anio_activo]
    );

    if (pregunta.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a esta pregunta' });
    }

    // Obtener alternativas
    const alternativas = await query(
      `SELECT * FROM asignaturas_examenes_preguntas_alternativas 
       WHERE pregunta_id = ? 
       ORDER BY id ASC`,
      [preguntaId]
    );

    res.json({ alternativas: alternativas || [] });
  } catch (error) {
    console.error('Error obteniendo alternativas:', error);
    res.status(500).json({ error: 'Error al obtener alternativas' });
  }
});

/**
 * POST /api/docente/aula-virtual/preguntas/:preguntaId/alternativas
 * Crear una nueva alternativa
 */
router.post('/aula-virtual/preguntas/:preguntaId/alternativas', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { preguntaId } = req.params;
    const { descripcion, correcta, orden_posicion, par_id, zona_drop } = req.body;

    if (!descripcion) {
      return res.status(400).json({ error: 'descripcion es requerido' });
    }

    // Verificar que la pregunta existe y pertenece al docente
    const pregunta = await query(
      `SELECT ep.*, ae.asignatura_id, a.personal_id, a.colegio_id, g.anio
       FROM asignaturas_examenes_preguntas ep
       INNER JOIN asignaturas_examenes ae ON ae.id = ep.examen_id
       INNER JOIN asignaturas a ON a.id = ae.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE ep.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [preguntaId, personal_id, colegio_id, anio_activo]
    );

    if (pregunta.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a esta pregunta' });
    }

    // Insertar alternativa
    const result = await execute(
      `INSERT INTO asignaturas_examenes_preguntas_alternativas 
       (pregunta_id, descripcion, correcta, orden_posicion, par_id, zona_drop)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        preguntaId,
        descripcion,
        correcta === true || correcta === 'SI' ? 'SI' : 'NO',
        orden_posicion || null,
        par_id || null,
        zona_drop || null
      ]
    );

    // Registrar auditoría
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'CREAR',
      modulo: 'AULA_VIRTUAL',
      entidad: 'alternativa',
      entidad_id: result.insertId,
      descripcion: `Creó alternativa para pregunta ID: ${preguntaId}`,
      url: req.originalUrl,
      metodo_http: 'POST',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_nuevos: JSON.stringify({ descripcion, correcta }),
      resultado: 'EXITOSO'
    });

    req.skipAudit = true;

    res.json({ 
      success: true, 
      message: 'Alternativa creada correctamente',
      alternativa_id: result.insertId 
    });
  } catch (error) {
    console.error('Error creando alternativa:', error);
    res.status(500).json({ error: 'Error al crear alternativa' });
  }
});

/**
 * PUT /api/docente/aula-virtual/alternativas/:alternativaId
 * Actualizar una alternativa existente
 */
router.put('/aula-virtual/alternativas/:alternativaId', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { alternativaId } = req.params;
    const { descripcion, correcta, orden_posicion, par_id, zona_drop } = req.body;

    // Verificar que la alternativa existe y pertenece al docente
    const alternativa = await query(
      `SELECT aa.*, ep.examen_id, ae.asignatura_id, a.personal_id, a.colegio_id, g.anio
       FROM asignaturas_examenes_preguntas_alternativas aa
       INNER JOIN asignaturas_examenes_preguntas ep ON ep.id = aa.pregunta_id
       INNER JOIN asignaturas_examenes ae ON ae.id = ep.examen_id
       INNER JOIN asignaturas a ON a.id = ae.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE aa.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [alternativaId, personal_id, colegio_id, anio_activo]
    );

    if (alternativa.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a esta alternativa' });
    }

    // Datos anteriores para auditoría
    const datosAnteriores = {
      descripcion: alternativa[0].descripcion,
      correcta: alternativa[0].correcta
    };

    // Actualizar alternativa
    await execute(
      `UPDATE asignaturas_examenes_preguntas_alternativas 
       SET descripcion = ?, correcta = ?, orden_posicion = ?, par_id = ?, zona_drop = ?
       WHERE id = ?`,
      [
        descripcion || alternativa[0].descripcion,
        correcta !== undefined ? (correcta === true || correcta === 'SI' ? 'SI' : 'NO') : alternativa[0].correcta,
        orden_posicion !== undefined ? orden_posicion : alternativa[0].orden_posicion,
        par_id !== undefined ? par_id : alternativa[0].par_id,
        zona_drop !== undefined ? zona_drop : alternativa[0].zona_drop,
        alternativaId
      ]
    );

    // Registrar auditoría
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'EDITAR',
      modulo: 'AULA_VIRTUAL',
      entidad: 'alternativa',
      entidad_id: parseInt(alternativaId),
      descripcion: `Editó alternativa (ID: ${alternativaId}) de pregunta ID: ${alternativa[0].pregunta_id}`,
      url: req.originalUrl,
      metodo_http: 'PUT',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(datosAnteriores),
      datos_nuevos: JSON.stringify({ descripcion, correcta }),
      resultado: 'EXITOSO'
    });

    req.skipAudit = true;

    res.json({ 
      success: true, 
      message: 'Alternativa actualizada correctamente'
    });
  } catch (error) {
    console.error('Error actualizando alternativa:', error);
    res.status(500).json({ error: 'Error al actualizar alternativa' });
  }
});

/**
 * DELETE /api/docente/aula-virtual/alternativas/:alternativaId
 * Eliminar una alternativa
 */
router.delete('/aula-virtual/alternativas/:alternativaId', async (req, res) => {
  try {
    const { usuario_id, colegio_id, anio_activo, personal_id } = req.user;
    const { alternativaId } = req.params;

    // Verificar que la alternativa existe y pertenece al docente
    const alternativa = await query(
      `SELECT aa.*, ep.examen_id, ae.asignatura_id, a.personal_id, a.colegio_id, g.anio
       FROM asignaturas_examenes_preguntas_alternativas aa
       INNER JOIN asignaturas_examenes_preguntas ep ON ep.id = aa.pregunta_id
       INNER JOIN asignaturas_examenes ae ON ae.id = ep.examen_id
       INNER JOIN asignaturas a ON a.id = ae.asignatura_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE aa.id = ? AND a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?`,
      [alternativaId, personal_id, colegio_id, anio_activo]
    );

    if (alternativa.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a esta alternativa' });
    }

    // Registrar auditoría ANTES de eliminar
    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user.tipo || 'DOCENTE',
      accion: 'ELIMINAR',
      modulo: 'AULA_VIRTUAL',
      entidad: 'alternativa',
      entidad_id: parseInt(alternativaId),
      descripcion: `Eliminó alternativa (ID: ${alternativaId}) de pregunta ID: ${alternativa[0].pregunta_id}`,
      url: req.originalUrl,
      metodo_http: 'DELETE',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify(alternativa[0]),
      datos_nuevos: JSON.stringify({}),
      resultado: 'EXITOSO'
    });

    // Eliminar alternativa
    await execute(
      `DELETE FROM asignaturas_examenes_preguntas_alternativas WHERE id = ?`,
      [alternativaId]
    );

    req.skipAudit = true;

    res.json({ 
      success: true, 
      message: 'Alternativa eliminada correctamente'
    });
  } catch (error) {
    console.error('Error eliminando alternativa:', error);
    res.status(500).json({ error: 'Error al eliminar alternativa' });
  }
});

/**
 * Función para verificar y enviar notificaciones de tareas por vencer
 * Se ejecuta periódicamente para notificar a alumnos y apoderados
 */
async function verificarTareasPorVencer() {
  try {
    console.log('📅 [TAREAS POR VENCER] Iniciando verificación de tareas...');
    
    const moment = require('moment-timezone');
    const ahoraLima = moment.tz('America/Lima');
    const fechaActual = ahoraLima.format('YYYY-MM-DD');
    
    // Obtener todas las tareas activas con fecha de entrega en los próximos 3 días o hoy
    // Obtener año activo de cada colegio para filtrar correctamente
    const colegios = await query(
      `SELECT id, anio_activo FROM colegios WHERE estado = 'ACTIVO'`,
      []
    );
    
    let tareasPorVencer = [];
    
    // Para cada colegio, obtener tareas del año activo
    for (const colegio of colegios) {
      const anioActivo = colegio.anio_activo || new Date().getFullYear();
      
      const tareasColegio = await query(
        `SELECT t.*, 
                a.grupo_id, a.curso_id, a.colegio_id, a.personal_id,
                c.nombre as curso_nombre,
                CONCAT(p.nombres, ' ', p.apellidos) as docente_nombre_completo,
                g.anio
         FROM asignaturas_tareas t
         INNER JOIN asignaturas a ON a.id = t.asignatura_id
         INNER JOIN cursos c ON c.id = a.curso_id
         INNER JOIN personal p ON p.id = a.personal_id
         INNER JOIN grupos g ON g.id = a.grupo_id
         WHERE DATE(t.fecha_entrega) >= DATE(NOW())
           AND DATE(t.fecha_entrega) <= DATE(DATE_ADD(NOW(), INTERVAL 3 DAY))
           AND a.colegio_id = ?
           AND g.anio = ?
         ORDER BY t.fecha_entrega ASC`,
        [colegio.id, anioActivo]
      );
      
      tareasPorVencer = [...tareasPorVencer, ...tareasColegio];
    }
    
    if (tareasPorVencer.length === 0) {
      console.log('📅 [TAREAS POR VENCER] No hay tareas por vencer en los próximos 3 días');
      return;
    }
    
    console.log(`📅 [TAREAS POR VENCER] Encontradas ${tareasPorVencer.length} tareas por verificar`);
    
    // Procesar cada tarea
    for (const tarea of tareasPorVencer) {
      try {
        const fechaEntrega = moment.tz(tarea.fecha_entrega, 'America/Lima');
        const diasRestantes = fechaEntrega.diff(ahoraLima, 'days');
        
        // Determinar qué tipo de notificación enviar
        let tipoNotificacion = null;
        let mensajeNotificacion = '';
        
        if (diasRestantes === 0) {
          // Se vence hoy
          tipoNotificacion = 'HOY';
          mensajeNotificacion = `⚠️ La tarea "${tarea.titulo}" se vence HOY - Curso: ${tarea.curso_nombre}`;
        } else if (diasRestantes === 1) {
          // Falta 1 día
          tipoNotificacion = '1_DIA';
          mensajeNotificacion = `⏰ La tarea "${tarea.titulo}" se vence MAÑANA - Curso: ${tarea.curso_nombre}`;
        } else if (diasRestantes === 2) {
          // Faltan 2 días
          tipoNotificacion = '2_DIAS';
          mensajeNotificacion = `📅 La tarea "${tarea.titulo}" se vence en 2 DÍAS - Curso: ${tarea.curso_nombre}`;
        } else if (diasRestantes === 3) {
          // Faltan 3 días
          tipoNotificacion = '3_DIAS';
          mensajeNotificacion = `📅 La tarea "${tarea.titulo}" se vence en 3 DÍAS - Curso: ${tarea.curso_nombre}`;
        }
        
        // Si no corresponde a ninguna notificación, saltar
        if (!tipoNotificacion) {
          continue;
        }
        
        // Verificar si ya se envió esta notificación (evitar duplicados)
        const notificacionExistente = await query(
          `SELECT id FROM notificaciones 
           WHERE para = 'USUARIO' 
             AND asunto LIKE ?
             AND contenido LIKE ?
             AND DATE(fecha_hora) = DATE(NOW())
           LIMIT 1`,
          [`%${tipoNotificacion}%`, `%${tarea.titulo}%`]
        );
        
        if (notificacionExistente.length > 0) {
          console.log(`📅 [TAREAS POR VENCER] Notificación ya enviada hoy para tarea "${tarea.titulo}" (${tipoNotificacion})`);
          continue;
        }
        
        // Obtener alumnos del grupo
        const alumnos = await query(
          `SELECT DISTINCT a.id as alumno_id, u.id as usuario_id
           FROM alumnos a
           INNER JOIN matriculas m ON m.alumno_id = a.id
           INNER JOIN usuarios u ON u.alumno_id = a.id
           WHERE m.grupo_id = ? 
             AND m.colegio_id = ?
             AND (m.estado = 0 OR m.estado = 4)
             AND u.colegio_id = ?
             AND u.estado = 'ACTIVO'`,
          [tarea.grupo_id, tarea.colegio_id, tarea.colegio_id]
        );
        
        // Obtener alumnos que YA entregaron la tarea (tienen entrega en asignaturas_tareas_entregas)
        const alumnosConEntrega = await query(
          `SELECT DISTINCT alumno_id 
           FROM asignaturas_tareas_entregas 
           WHERE tarea_id = ?`,
          [tarea.id]
        );
        
        const alumnosConEntregaIds = alumnosConEntrega.map(e => e.alumno_id);
        
        // Filtrar alumnos: solo los que NO han entregado
        const alumnosPendientes = alumnos.filter(a => !alumnosConEntregaIds.includes(a.alumno_id));
        
        const alumnoIds = alumnosPendientes.map(a => a.alumno_id);
        const alumnoUsuarioIds = alumnosPendientes.map(a => a.usuario_id);
        
        console.log(`📅 [TAREAS POR VENCER] Tarea "${tarea.titulo}": ${alumnos.length} alumnos totales, ${alumnosConEntregaIds.length} ya entregaron, ${alumnoIds.length} pendientes`);
        
        // Obtener apoderados de esos alumnos
        let apoderadoUsuarioIds = [];
        if (alumnoIds.length > 0) {
          const apoderados = await query(
            `SELECT DISTINCT u.id as usuario_id, ap.nro_documento
             FROM apoderados ap
             INNER JOIN familias f ON f.apoderado_id = ap.id
             INNER JOIN usuarios u ON u.apoderado_id = ap.id
             WHERE f.alumno_id IN (${alumnoIds.map(() => '?').join(',')})
               AND ap.colegio_id = ?
               AND u.colegio_id = ?
               AND u.estado = 'ACTIVO'`,
            [...alumnoIds, tarea.colegio_id, tarea.colegio_id]
          );
          apoderadoUsuarioIds = apoderados.map(a => a.usuario_id);
          
          // Obtener DNI de apoderados para buscar docentes-apoderados
          const apoderadoDnis = apoderados.map(a => a.nro_documento).filter(dni => dni);
          
          if (apoderadoDnis.length > 0) {
            // Obtener usuarios DOCENTE que también son apoderados
            const docentesApoderados = await query(
              `SELECT DISTINCT u.id 
               FROM usuarios u
               INNER JOIN personal p ON p.id = u.personal_id
               WHERE u.colegio_id = ? 
                 AND u.estado = 'ACTIVO'
                 AND u.tipo = 'DOCENTE'
                 AND (p.nro_documento IN (${apoderadoDnis.map(() => '?').join(',')}) 
                      OR u.usuario IN (${apoderadoDnis.map(() => '?').join(',')}))
                 AND u.id NOT IN (${[...alumnoUsuarioIds, ...apoderadoUsuarioIds].map(() => '?').join(',')})`,
              [tarea.colegio_id, ...apoderadoDnis, ...apoderadoDnis, ...alumnoUsuarioIds, ...apoderadoUsuarioIds]
            );
            
            const docentesApoderadosIds = docentesApoderados.map(u => u.id);
            apoderadoUsuarioIds = [...apoderadoUsuarioIds, ...docentesApoderadosIds];
          }
        }
        
        // Combinar todos los destinatarios
        const todosDestinatarios = [...new Set([...alumnoUsuarioIds, ...apoderadoUsuarioIds])];
        
        if (todosDestinatarios.length === 0) {
          console.log(`⚠️ [TAREAS POR VENCER] No se encontraron destinatarios para tarea "${tarea.titulo}"`);
          continue;
        }
        
        // Preparar título de notificación
        let tituloNotificacion = '';
        if (tipoNotificacion === 'HOY') {
          tituloNotificacion = '⚠️ Tarea se vence HOY';
        } else if (tipoNotificacion === '1_DIA') {
          tituloNotificacion = '⏰ Tarea se vence MAÑANA';
        } else if (tipoNotificacion === '2_DIAS') {
          tituloNotificacion = '📅 Tarea se vence en 2 DÍAS';
        } else if (tipoNotificacion === '3_DIAS') {
          tituloNotificacion = '📅 Tarea se vence en 3 DÍAS';
        }
        
        console.log(`📅 [TAREAS POR VENCER] Enviando notificaciones para tarea "${tarea.titulo}" (${tipoNotificacion}) a ${todosDestinatarios.length} destinatarios`);
        
        // Crear notificaciones en la BD
        for (const destinatarioId of todosDestinatarios) {
          try {
            await execute(
              `INSERT INTO notificaciones 
               (para, usuario_id, destinatario_id, asunto, contenido, fecha_hora, estado)
               VALUES ('USUARIO', ?, ?, ?, ?, NOW(), 'NO ENVIADO')`,
              [
                tarea.personal_id, // Usuario que crea (docente)
                destinatarioId, // Destinatario
                tituloNotificacion, // TÍTULO (asunto)
                mensajeNotificacion // MENSAJE (contenido)
              ]
            );
          } catch (error) {
            console.error(`❌ [TAREAS POR VENCER] Error creando notificación para usuario ${destinatarioId}:`, error);
          }
        }
        
        console.log(`✅ [TAREAS POR VENCER] ${todosDestinatarios.length} notificaciones creadas para tarea "${tarea.titulo}"`);
        
        // Enviar push notifications
        const subscriptionsData = await query(
          `SELECT endpoint, p256dh, auth 
           FROM push_subscriptions 
           WHERE usuario_id IN (${todosDestinatarios.map(() => '?').join(',')}) 
             AND colegio_id = ? AND (activo = 1 OR activo IS NULL)`,
          [...todosDestinatarios, tarea.colegio_id]
        );
        
        const subscriptions = subscriptionsData.map(sub => ({
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth
          }
        }));
        
        if (subscriptions.length > 0) {
          const payloadPush = {
            title: tituloNotificacion,
            body: mensajeNotificacion,
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-192x192.png',
            vibrate: [200, 100, 200],
            tag: `tarea-por-vencer-${tarea.id}-${tipoNotificacion}`,
            data: {
              url: '/alumno/dashboard',
              tipo: 'tarea_por_vencer',
              tarea_id: tarea.id,
              dias_restantes: diasRestantes
            }
          };
          
          enviarPushNotificationMultiple(subscriptions, payloadPush)
            .then(resultadosPush => {
              const exitosas = resultadosPush.filter(r => r.resultado && r.resultado.success).length;
              const fallidas = resultadosPush.filter(r => !r.resultado || !r.resultado.success).length;
              console.log(`✅ [TAREAS POR VENCER] Push notifications para "${tarea.titulo}": ${exitosas} exitosas, ${fallidas} fallidas`);
            })
            .catch(err => {
              console.error(`❌ [TAREAS POR VENCER] Error en envío de push notifications:`, err);
            });
        }
      } catch (error) {
        console.error(`❌ [TAREAS POR VENCER] Error procesando tarea ${tarea.id}:`, error);
      }
    }
    
    console.log('✅ [TAREAS POR VENCER] Verificación completada');
  } catch (error) {
    console.error('❌ [TAREAS POR VENCER] Error en verificación:', error);
  }
}

/**
 * GET /api/docente/tareas/verificar-vencimiento
 * Endpoint para verificar y enviar notificaciones de tareas por vencer
 * Se puede llamar periódicamente (cron job) o manualmente
 */
router.get('/tareas/verificar-vencimiento', async (req, res) => {
  try {
    // Ejecutar verificación de forma asíncrona
    setImmediate(async () => {
      await verificarTareasPorVencer();
    });
    
    res.json({ 
      success: true, 
      message: 'Verificación de tareas por vencer iniciada' 
    });
  } catch (error) {
    console.error('Error iniciando verificación de tareas:', error);
    res.status(500).json({ error: 'Error al iniciar verificación' });
  }
});

// Exportar la función para uso interno (verificación automática)
module.exports = router;
module.exports.verificarTareasPorVencer = verificarTareasPorVencer;

