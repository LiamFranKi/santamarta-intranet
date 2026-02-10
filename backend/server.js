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
    // Excluir health check del rate limiting
    return req.path === '/api/health';
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

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

// Rutas del colegio
const colegioRoutes = require('./routes/colegio.routes');
app.use('/api/colegio', colegioRoutes);

// Rutas de autenticación
const authRoutes = require('./routes/auth.routes');
app.use('/api/auth', authRoutes);

// Rutas de auditoría
const auditoriaRoutes = require('./routes/auditoria.routes');
app.use('/api/auditoria', auditoriaRoutes);

// Rutas de docente
const docenteRoutes = require('./routes/docente.routes');
const alumnoRoutes = require('./routes/alumno.routes');
const asistenciaRoutes = require('./routes/asistencia.routes');

// Rutas de push notifications
const pushRoutes = require('./routes/push.routes');

// Rutas de administrador
const adminRoutes = require('./routes/admin.routes');
app.use('/api/docente', docenteRoutes);
app.use('/api/alumno', alumnoRoutes);
app.use('/api/asistencia', asistenciaRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/admin', adminRoutes);

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
});
