// Cargar variables de entorno desde .env en el directorio backend
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
// Configurar zona horaria a Lima, Perú (UTC-5)
process.env.TZ = 'America/Lima';

// Verificar y mostrar información de zona horaria
const ahora = new Date();
const zonaHoraria = Intl.DateTimeFormat().resolvedOptions().timeZone;
const offset = ahora.getTimezoneOffset();
const offsetHoras = -offset / 60; // Convertir minutos a horas (negativo porque getTimezoneOffset retorna el offset opuesto)

console.log('🕐 Configuración de Zona Horaria:');
console.log(`   Zona horaria configurada: ${process.env.TZ}`);
console.log(`   Zona horaria del sistema: ${zonaHoraria}`);
console.log(`   Offset UTC: ${offsetHoras >= 0 ? '+' : ''}${offsetHoras}:00`);
console.log(`   Fecha y hora actual: ${ahora.toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'full', timeStyle: 'long' })}`);
console.log(`   ISO String: ${ahora.toISOString()}`);

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const fs = require('fs');

const app = express();

// Evita caídas silenciosas / reinicios PM2 sin pista en log
process.on('unhandledRejection', (reason) => {
  console.error('[process] unhandledRejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[process] uncaughtException:', err);
  process.exit(1);
});

// Leer puerto del archivo o usar default
let PORT = process.env.PORT || 5000;
try {
  const portFile = path.join(__dirname, '.port');
  if (fs.existsSync(portFile)) {
    PORT = parseInt(fs.readFileSync(portFile, 'utf8'));
  }
} catch (error) {
  console.log('Usando puerto por defecto:', PORT);
}

// Rate limiting - Configuración más permisiva
const isDevelopment = process.env.NODE_ENV !== 'production';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: isDevelopment ? 1000 : 1000, // Aumentado a 1000 requests en producción (era 200)
  message: 'Too many requests, please try again later.',
  standardHeaders: true, // Retorna rate limit info en headers `RateLimit-*`
  legacyHeaders: false, // Desactiva headers `X-RateLimit-*`
  // Usar keyGenerator personalizado para identificar usuarios únicos
  // Si hay token de autenticación, usar el usuario_id del token
  // Si no, usar la IP real del cliente (no la del proxy)
  keyGenerator: (req) => {
    // Intentar obtener el token del header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const jwt = require('jsonwebtoken');
        const decoded = jwt.decode(token);
        if (decoded && decoded.usuario_id) {
          // Usar usuario_id como clave única para rate limiting
          return `user_${decoded.usuario_id}`;
        }
      } catch (error) {
        // Si falla decodificar, continuar con IP
      }
    }
    // Si no hay token o falla, usar IP real del cliente
    // Express con trust proxy debería obtener la IP real del header X-Forwarded-For
    // Usar ipKeyGenerator helper para manejar IPv6 correctamente
    return ipKeyGenerator(req);
  },
  skip: (req) => {
    // Excluir health check y webhook del huellero (ráfagas de marcación)
    const u = String(req.originalUrl || req.url || '');
    return u.startsWith('/api/health') || u.startsWith('/api/biometrico/hikvision');
  }
});

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" } // Permitir cargar recursos desde otros orígenes
}));

// Configurar CORS para permitir múltiples orígenes
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'https://sistema.vanguardschools.edu.pe',
  'http://sistema.vanguardschools.edu.pe',
  'https://intranet.vanguardschools.com',
  'http://intranet.vanguardschools.com'
];

if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

app.use(cors({
  origin: function (origin, callback) {
    // Permitir requests sin origin (como mobile apps o curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      // En desarrollo, permitir cualquier origen localhost
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        callback(null, true);
      } else {
        callback(new Error('No permitido por CORS'));
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buf) => {
    // Captura cruda para webhook Hikvision (multipart/JSON a veces llega raro)
    if (buf?.length && String(req.originalUrl || '').includes('/api/biometrico/')) {
      req.rawBody = buf.toString('utf8');
    }
  },
}));
app.use(express.urlencoded({
  extended: true,
  limit: '10mb',
  verify: (req, _res, buf) => {
    if (buf?.length && String(req.originalUrl || '').includes('/api/biometrico/') && !req.rawBody) {
      req.rawBody = buf.toString('utf8');
    }
  },
}));

// Configurar trust proxy DESPUÉS de los middlewares básicos
// Esto es necesario cuando el backend está detrás de un proxy reverso (Apache)
// Configurar para confiar en el proxy y obtener la IP real del cliente
app.set('trust proxy', true); // Cambiado a true para obtener IPs reales de los clientes

// Servir archivos estáticos ANTES del rate limiter (no deben estar limitados)
// Servir archivos estáticos (logos, assets) con headers CORS
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets'), {
  setHeaders: (res, path) => {
    // Permitir CORS para archivos estáticos
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET');
    res.set('Cache-Control', 'public, max-age=31536000'); // Cache por 1 año
  }
}));

// Servir archivos subidos (fotos de personal, publicaciones, archivos, etc.)
// IMPORTANTE: La ruta debe coincidir con donde se guardan los archivos
// Los archivos se guardan en backend/uploads/ pero el servidor está en backend/
// Por lo tanto, la ruta correcta es backend/uploads/
const uploadsPath = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
  // Crear subdirectorios necesarios
      fs.mkdirSync(path.join(uploadsPath, 'mensajes'), { recursive: true });
      fs.mkdirSync(path.join(uploadsPath, 'personal'), { recursive: true });
      fs.mkdirSync(path.join(uploadsPath, 'publicaciones'), { recursive: true });
      fs.mkdirSync(path.join(uploadsPath, 'comunicados'), { recursive: true }); // Para comunicados del sistema nuevo
      fs.mkdirSync(path.join(uploadsPath, 'aula-virtual'), { recursive: true }); // Para archivos del aula virtual
      fs.mkdirSync(path.join(uploadsPath, 'gestion-documentos'), { recursive: true }); // PDFs Documento De Gestión
      fs.mkdirSync(path.join(uploadsPath, 'vocabularios'), { recursive: true }); // PDFs vocabularios (herramientas)
      fs.mkdirSync(path.join(uploadsPath, 'hex-examenes'), { recursive: true }); // PDFs contexto exámenes HEX
      fs.mkdirSync(path.join(uploadsPath, 'elecciones'), { recursive: true }); // Logos y fotos elecciones escolares
      fs.mkdirSync(path.join(uploadsPath, 'fichas-ia', 'origen'), { recursive: true });
      fs.mkdirSync(path.join(uploadsPath, 'fichas-ia', 'generados'), { recursive: true });
      fs.mkdirSync(path.join(uploadsPath, 'fichas-ia', 'trabajo'), { recursive: true });
    }
const gestionDocsUploadPath = path.join(uploadsPath, 'gestion-documentos');
if (!fs.existsSync(gestionDocsUploadPath)) {
  fs.mkdirSync(gestionDocsUploadPath, { recursive: true });
}

app.use('/uploads', express.static(uploadsPath, {
  setHeaders: (res, filePath) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET');
    res.set('Cache-Control', 'public, max-age=86400'); // Cache por 1 día
    // Asegurar que los archivos se sirvan correctamente
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.pdf') {
      res.set('Content-Type', 'application/pdf');
    } else if (ext === '.doc' || ext === '.docx') {
      res.set('Content-Type', 'application/msword');
    } else if (ext === '.xls' || ext === '.xlsx') {
      res.set('Content-Type', 'application/vnd.ms-excel');
    } else if (ext === '.ppt' || ext === '.pptx') {
      res.set('Content-Type', 'application/vnd.ms-powerpoint');
    }
  }
}));

// Servir carpeta Static (Avatares, Fotos, Archivos compartidos con sistema PHP)
const { resolveStaticFsRoot } = require('./utils/staticStorage');
const staticPath = resolveStaticFsRoot();
if (fs.existsSync(staticPath)) {
  console.log(`📁 Sirviendo /Static desde: ${staticPath}`);
  app.use('/Static', express.static(staticPath, {
    setHeaders: (res) => {
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Cache-Control', 'public, max-age=86400');
    }
  }));
}

// Aplicar rate limiter solo a rutas de API (después de archivos estáticos)
app.use('/api', limiter);

// Middleware de auditoría (registra todas las acciones)
const middlewareAuditoria = require('./middleware/auditoria');
app.use(middlewareAuditoria);

// Routes
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Aula Virtual API',
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

// Servir avatares modulares desde backend/Static/Image/Avatars (ruta /api/static/avatars siempre llega a Node)
app.get('/api/static/avatars/:filename', (req, res) => {
  const filename = req.params.filename || '';
  if (!filename || !/^[a-zA-Z0-9_\-\u00C0-\u024F\u1E00-\u1EFF.]+\.(png|jpg|jpeg)$/i.test(filename)) {
    return res.status(400).json({ error: 'Nombre de archivo no válido' });
  }
  const avatarsPath = path.join(__dirname, 'Static', 'Image', 'Avatars', filename);
  if (!fs.existsSync(avatarsPath)) {
    return res.status(404).json({ error: 'Archivo no encontrado' });
  }
  const ext = path.extname(filename).toLowerCase();
  res.type(ext === '.png' ? 'image/png' : 'image/jpeg');
  res.sendFile(avatarsPath);
});

// Rutas del colegio
const colegioRoutes = require('./routes/colegio.routes');
app.use('/api/colegio', colegioRoutes);

// Rutas de autenticación
const authRoutes = require('./routes/auth.routes');
app.use('/api/auth', authRoutes);

// Rutas de auditoría
const auditoriaRoutes = require('./routes/auditoria.routes');
app.use('/api/auditoria', auditoriaRoutes);

// Middleware de logging para todas las peticiones (solo para debugging)
app.use('/api/docente', (req, res, next) => {
  if (req.path.includes('/hijos/') && req.path.includes('/datos')) {
    console.log(`📋 [SERVER] Petición recibida: ${req.method} ${req.path}`);
    console.log(`📋 [SERVER] Query params:`, req.query);
    console.log(`📋 [SERVER] Params:`, req.params);
    if (req.method === 'PUT' || req.method === 'POST') {
      console.log(`📋 [SERVER] Body keys:`, Object.keys(req.body || {}));
    }
  }
  next();
});

// Rutas de docente
const docenteRoutes = require('./routes/docente.routes');
const alumnoRoutes = require('./routes/alumno.routes');
const asistenciaRoutes = require('./routes/asistencia.routes');

// Rutas de push notifications
const pushRoutes = require('./routes/push.routes');

// Rutas de administrador
const adminRoutes = require('./routes/admin.routes');
const adminAcademicoRoutes = require('./routes/admin.academico.routes');
const adminIndicadoresPlantillasRoutes = require('./routes/admin.indicadores-plantillas.routes');
const adminReportesRoutes = require('./routes/admin.reportes.routes');
const adminUsuariosRoutes = require('./routes/admin.usuarios.routes');
const adminInscripcionMatriculaRoutes = require('./routes/admin.inscripcion-matricula.routes');
const matriculaOnlineRoutes = require('./routes/matriculaOnline.routes');
const adminPsicologiaRoutes = require('./routes/admin.psicologia.routes');
const eventosRoutes = require('./routes/eventos.routes');

// Rutas de apoderado
const apoderadoRoutes = require('./routes/apoderado.routes');

// Rutas de promotoría
const promotoriaRoutes = require('./routes/promotoria.routes');

// Rutas de cumpleaños (widget flotante en dashboards)
const cumpleanosRoutes = require('./routes/cumpleanos.routes');
const supervisionRoutes = require('./routes/supervision.routes');
const encuestasRoutes = require('./routes/encuestas.routes');
const herramientasExamenesRoutes = require('./routes/herramientasExamenes.routes');
const vocabulariosRoutes = require('./routes/vocabularios.routes');
const eleccionesRoutes = require('./routes/elecciones.routes');
const fichasIaRoutes = require('./routes/fichasIa.routes');

const docentePsicologiaRoutes = require('./routes/docente.psicologia.routes');
const { mountTutoriaGeneral } = require('./routes/tutoriaGeneral.mount');
app.use('/api/docente/psicologia', docentePsicologiaRoutes);
mountTutoriaGeneral(app, docenteRoutes);
app.use('/api/docente', docenteRoutes);
const libretaInicialGrupoRoutes = require('./routes/libretaInicialGrupo.routes');
app.use('/api/docente', libretaInicialGrupoRoutes);
app.use('/api/alumno', alumnoRoutes);
app.use('/api/asistencia', asistenciaRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/admin/usuarios', adminUsuariosRoutes);
app.use('/api/admin/usuarios', adminInscripcionMatriculaRoutes);
const adminPagosRoutes = require('./routes/admin.pagos.routes');
const adminFacturacionRoutes = require('./routes/admin.facturacion.routes');
app.use('/api/admin/pagos', adminPagosRoutes);
app.use('/api/admin/facturacion', adminFacturacionRoutes);
app.use('/api/admin/academico', adminAcademicoRoutes);
app.use('/api/admin/indicadores-plantillas', adminIndicadoresPlantillasRoutes);
app.use('/api/admin/reportes', adminReportesRoutes);
const adminReportesNotasRoutes = require('./routes/admin.reportes.notas.routes');
app.use('/api/admin/reportes/notas', adminReportesNotasRoutes);
const adminReportesGeneralRoutes = require('./routes/admin.reportes.general.routes');
app.use('/api/admin/reportes/general', adminReportesGeneralRoutes);
const adminTardanzasRoutes = require('./routes/admin.tardanzas.routes');
app.use('/api/admin/tardanzas', adminTardanzasRoutes);
const adminReclamosSugerenciasRoutes = require('./routes/admin.reclamosSugerencias.routes');
app.use('/api/admin/reclamos-sugerencias', adminReclamosSugerenciasRoutes);
const adminCalendarizacionRoutes = require('./routes/admin.calendarizacion.routes');
app.use('/api/admin/calendarizacion', adminCalendarizacionRoutes);
const adminFaqsRoutes = require('./routes/admin.faqs.routes');
app.use('/api/admin/faqs', adminFaqsRoutes);
const adminUtilesRoutes = require('./routes/admin.utiles.routes');
app.use('/api/admin/utiles', adminUtilesRoutes);
const adminDocumentosWebRoutes = require('./routes/admin.documentosWeb.routes');
app.use('/api/admin/documentos-web', adminDocumentosWebRoutes);
const adminHorarioGenRoutes = require('./routes/admin.horarioGen.routes');
app.use('/api/admin/horario-gen', adminHorarioGenRoutes);
const adminSeguridadRoutes = require('./routes/admin.seguridad.routes');
app.use('/api/admin/seguridad', adminSeguridadRoutes);
const webhooksWebFormularioRoutes = require('./routes/webhooks.webFormulario.routes');
app.use('/api/webhooks', webhooksWebFormularioRoutes);
const personalTardanzasRoutes = require('./routes/personal.tardanzas.routes');
app.use('/api/personal/tardanzas', personalTardanzasRoutes);
const biometricoRoutes = require('./routes/biometrico.routes');
app.use('/api/biometrico', biometricoRoutes);
app.use('/api/admin/psicologia', adminPsicologiaRoutes);
/* Eventos antes que /api/admin: si no, admin.routes bloquea PSICOLOGA/Promotoría antes de llegar a eventos.routes */
app.use('/api/public/eventos', eventosRoutes.publicEventosRouter);
app.use('/api/public/matricula-online', matriculaOnlineRoutes);
app.use('/api/public', require('./routes/public.visitasConfig.routes'));
app.use('/api/public', require('./routes/public.utiles.routes'));
app.use('/api/admin/eventos', eventosRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/apoderado', apoderadoRoutes);
app.use('/api/promotoria', promotoriaRoutes);
app.use('/api/cumpleanos', cumpleanosRoutes);
const comunicadosHomeRoutes = require('./routes/comunicadosHome.routes');
app.use('/api/comunicados', comunicadosHomeRoutes);
app.use('/api/supervision', supervisionRoutes);
app.use('/api/encuestas', encuestasRoutes);
app.use('/api/herramientas-examenes', herramientasExamenesRoutes);
app.use('/api/vocabularios', vocabulariosRoutes);
app.use('/api/elecciones', eleccionesRoutes);
app.use('/api/fichas-ia', fichasIaRoutes);
const reunionesRoutes = require('./routes/reuniones.routes');
app.use('/api/reuniones', reunionesRoutes);

// Rutas de prueba (solo desarrollo)
if (process.env.NODE_ENV === 'development') {
  const testRoutes = require('./routes/test.routes');
  app.use('/api/test', testRoutes);
}

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n✅ Servidor corriendo en puerto ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`📡 Health: http://localhost:${PORT}/api/health\n`);
  
  // Iniciar verificación automática de tareas por vencer
  // Se ejecuta al iniciar el servidor y luego cada 24 horas (una vez al día)
  const iniciarVerificacionTareas = () => {
    try {
      // Importar la función de verificación directamente
      const { verificarTareasPorVencer, verificarTareasVencidasSinEntrega } = require('./routes/docente.routes');
      
      // Ejecutar inmediatamente al iniciar (después de 60 segundos para que el servidor y BD estén listos)
      setTimeout(async () => {
        try {
          console.log('📅 [AUTO-VERIFICACION] Iniciando primera verificación de tareas por vencer...');
          await verificarTareasPorVencer();
          console.log('📅 [AUTO-VERIFICACION] Verificando tareas vencidas sin entrega...');
          await verificarTareasVencidasSinEntrega();
        } catch (e) {
          console.error('❌ [AUTO-VERIFICACION] Error en primera ejecución:', e);
        }
      }, 60000); // 60 segundos después de iniciar
      
      // Ejecutar cada 24 horas (86400000 ms = 24 horas)
      setInterval(async () => {
        try {
          console.log('📅 [AUTO-VERIFICACION] Ejecutando verificación periódica de tareas por vencer...');
          await verificarTareasPorVencer();
          console.log('📅 [AUTO-VERIFICACION] Verificando tareas vencidas sin entrega...');
          await verificarTareasVencidasSinEntrega();
        } catch (e) {
          console.error('❌ [AUTO-VERIFICACION] Error en ejecución periódica:', e);
        }
      }, 24 * 60 * 60 * 1000); // Cada 24 horas
      
      console.log('📅 [AUTO-VERIFICACION] Sistema de verificación automática configurado:');
      console.log('   - Primera ejecución: 60 segundos después de iniciar');
      console.log('   - Ejecuciones periódicas: cada 24 horas');
    } catch (error) {
      console.error('❌ [AUTO-VERIFICACION] Error configurando verificación automática:', error);
    }
  };
  
  // Iniciar verificación automática (siempre activa, en desarrollo y producción)
  iniciarVerificacionTareas();

  // Notificaciones push de cumpleaños del día (una vez al día)
  const iniciarCumpleanosPush = () => {
    try {
      const { enviarNotificacionesCumpleanos } = require('./services/cumpleanosPushService');
      setTimeout(async () => {
        try {
          console.log('🎂 [CUMPLEANOS-PUSH] Ejecutando notificaciones de cumpleaños del día...');
          await enviarNotificacionesCumpleanos();
        } catch (e) {
          console.error('❌ [CUMPLEANOS-PUSH] Error en primera ejecución:', e);
        }
      }, 120000); // 2 min después de iniciar
      setInterval(async () => {
        try {
          console.log('🎂 [CUMPLEANOS-PUSH] Ejecutando notificaciones de cumpleaños del día...');
          await enviarNotificacionesCumpleanos();
        } catch (e) {
          console.error('❌ [CUMPLEANOS-PUSH] Error en ejecución periódica:', e);
        }
      }, 24 * 60 * 60 * 1000); // cada 24 horas
      console.log('🎂 [CUMPLEANOS-PUSH] Programado: primera ejecución en 2 min, luego cada 24 h');
    } catch (error) {
      console.error('❌ [CUMPLEANOS-PUSH] Error configurando:', error);
    }
  };
  iniciarCumpleanosPush();

  // Documentos institucionales: avisos por fecha de vencimiento (solo administradores; campanita + push)
  const iniciarInstitucionalVencimiento = () => {
    try {
      const { ejecutarNotificacionesInstitucionalVencimiento } = require('./services/institucionalVencimientoNotificacionService');
      setTimeout(async () => {
        try {
          console.log('📋 [INSTITUCIONAL-VENC] Primera verificación de vencimientos...');
          await ejecutarNotificacionesInstitucionalVencimiento();
        } catch (e) {
          console.error('❌ [INSTITUCIONAL-VENC] Error en primera ejecución:', e);
        }
      }, 100000);
      setInterval(async () => {
        try {
          console.log('📋 [INSTITUCIONAL-VENC] Verificación periódica (cada 24 h)...');
          await ejecutarNotificacionesInstitucionalVencimiento();
        } catch (e) {
          console.error('❌ [INSTITUCIONAL-VENC] Error en ejecución periódica:', e);
        }
      }, 24 * 60 * 60 * 1000);
      console.log('📋 [INSTITUCIONAL-VENC] Programado: primera ejecución ~100 s, luego cada 24 h (zona Lima).');
    } catch (error) {
      console.error('❌ [INSTITUCIONAL-VENC] Error configurando:', error);
    }
  };
  iniciarInstitucionalVencimiento();

  // Examenes: cerrar intentos ACTIVO vencidos / examen cerrado y notificar apoderados pendientes
  const iniciarCierreExamenesPendientes = () => {
    try {
      const { verificarExamenesIntentosPendientes } = require('./routes/docente.routes');
      setTimeout(async () => {
        try {
          console.log('📝 [EXAMEN-CIERRE-AUTO] Primera verificación de intentos pendientes...');
          await verificarExamenesIntentosPendientes();
        } catch (e) {
          console.error('❌ [EXAMEN-CIERRE-AUTO] Error en primera ejecución:', e);
        }
      }, 90000);
      setInterval(async () => {
        try {
          await verificarExamenesIntentosPendientes();
        } catch (e) {
          console.error('❌ [EXAMEN-CIERRE-AUTO] Error en ejecución periódica:', e);
        }
      }, 2 * 60 * 1000);
      console.log('📝 [EXAMEN-CIERRE-AUTO] Programado: primera ejecución ~90 s, luego cada 2 min');
    } catch (error) {
      console.error('❌ [EXAMEN-CIERRE-AUTO] Error configurando:', error);
    }
  };
  iniciarCierreExamenesPendientes();

  // Clases: avisar al docente a la hora exacta de inicio (horario publicado)
  const iniciarAvisosInicioClase = () => {
    try {
      const { ejecutarNotificacionesInicioClase } = require('./services/claseInicioNotificacionService');
      const correr = async (etiqueta) => {
        try {
          await ejecutarNotificacionesInicioClase();
        } catch (e) {
          console.error(`❌ [CLASE-INICIO] Error (${etiqueta}):`, e);
        }
      };
      setTimeout(() => correr('primera'), 75000);
      setInterval(() => correr('periodica'), 60 * 1000);
      console.log('🔔 [CLASE-INICIO] Programado: primera ~75 s, luego cada 1 min (hora exacta Lima)');
    } catch (error) {
      console.error('❌ [CLASE-INICIO] Error configurando:', error);
    }
  };
  iniciarAvisosInicioClase();

  const iniciarRecordatorioReuniones = () => {
    try {
      const { enviarRecordatoriosReunionesHoy } = require('./services/reunionesRecordatorioService');
      const correr = async (etiqueta) => {
        try {
          const r = await enviarRecordatoriosReunionesHoy();
          if (r && r.enviadas) {
            console.log(`📅 [REUNIONES] Recordatorios del día (${etiqueta}): ${r.enviadas}`);
          }
        } catch (e) {
          console.error(`❌ [REUNIONES] Error recordatorio (${etiqueta}):`, e);
        }
      };
      setTimeout(() => correr('primera'), 180000);
      setInterval(() => correr('periodica'), 60 * 60 * 1000);
      console.log('📅 [REUNIONES] Recordatorio del día: primera ~3 min, luego cada 1 h');
    } catch (error) {
      console.error('❌ [REUNIONES] Error configurando recordatorio:', error);
    }
  };
  iniciarRecordatorioReuniones();
});
