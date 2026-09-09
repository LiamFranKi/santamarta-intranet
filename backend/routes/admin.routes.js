const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { query, execute } = require('../utils/mysql');
const { mergeObservacionesTutor } = require('../utils/tutorDeudoresService');
const {
  enviarNotificacionBroadcast,
  ensureTablaNotificacionesEnvios,
  tituloCompleto,
  ICONOS_PERMITIDOS,
} = require('../services/notificacionesBroadcastService');
const { authenticateToken } = require('../middleware/auth');
const { registrarAccion } = require('../utils/auditoria');
const { fechaHoraMySQLLima } = require('../utils/fechaHoraLima');
const { sqlFiltroAnioPago } = require('../utils/pagoFechaHora');
const { normalizarUrlsImagenesEnHtml } = require('../utils/mensajesHtml');
const { listarPensionesVencidasHastaHoy } = require('../utils/deudaPensiones');
const { mountSelfServiceCvRoutes } = require('../utils/personalCv');
const {
  guardarReglaConducta,
  textoReglaConducta,
  normalizarReglaConducta,
  REGLA_CONDUCTA_DEFAULT,
} = require('../utils/reglaConducta');
const { recalcularConductaColegioAnio } = require('../utils/conductaIncidenciasBimestre');
const {
  obtenerConfigEstructura,
  guardarConfigEstructura,
  aplicarEstructuraColegio,
} = require('../utils/aulaEstructuraTemas');

const ANIO_PAGO_SQL = sqlFiltroAnioPago('p');
const phpSerialize = require('php-serialize');

const personalStorageAdmin = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = '/home/vanguard/intranet2026/backend/Static/Image/Fotos';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `personal-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});
const fileFilterPersonalAdmin = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/i;
  const extOk = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimeOk = file.mimetype && file.mimetype.startsWith('image/');
  if (extOk && mimeOk) return cb(null, true);
  cb(new Error('Solo se permiten imágenes'));
};
const uploadPersonalAdmin = multer({
  storage: personalStorageAdmin,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: fileFilterPersonalAdmin
});

// Configurar multer para subir archivos de configuración
const configStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Guardar en Static/Image/Fondos/ del sistema PHP (compartido con ambos sistemas)
    const uploadPath = '/home/vanguard/intranet2026/backend/Static/Image/Fondos';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `config-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const fileFilterConfig = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  
  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Solo se permiten archivos de imagen (JPG, PNG)'));
  }
};

const uploadConfig = multer({
  storage: configStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: fileFilterConfig
});

/** PDFs — Documento De Gestión (admin) */
const gestionDocsDir = path.join(__dirname, '../uploads/gestion-documentos');
const gestionDocsStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(gestionDocsDir)) {
      fs.mkdirSync(gestionDocsDir, { recursive: true });
    }
    cb(null, gestionDocsDir);
  },
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').toLowerCase();
    const safe = ext === '.pdf' ? ext : '.pdf';
    cb(null, `gd-${Date.now()}-${Math.round(Math.random() * 1e9)}${safe}`);
  }
});
const gestionDocsFileFilter = (req, file, cb) => {
  const ext = (path.extname(file.originalname) || '').toLowerCase();
  if (file.mimetype === 'application/pdf' && ext === '.pdf') {
    return cb(null, true);
  }
  cb(new Error('Solo se permiten archivos PDF'));
};
const uploadGestionDocumento = multer({
  storage: gestionDocsStorage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: gestionDocsFileFilter
});

/** PDFs — módulo Institucional (solo administradores; carpeta dedicada) */
const institucionalDocsDir = path.join(__dirname, '../uploads/institucional-documentos');
const institucionalDocsStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(institucionalDocsDir)) {
      fs.mkdirSync(institucionalDocsDir, { recursive: true });
    }
    cb(null, institucionalDocsDir);
  },
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').toLowerCase();
    const safe = ext === '.pdf' ? ext : '.pdf';
    cb(null, `inst-${Date.now()}-${Math.round(Math.random() * 1e9)}${safe}`);
  }
});
const institucionalDocsFileFilter = (req, file, cb) => {
  const ext = (path.extname(file.originalname) || '').toLowerCase();
  if (file.mimetype === 'application/pdf' && ext === '.pdf') {
    return cb(null, true);
  }
  cb(new Error('Solo se permiten archivos PDF'));
};
const uploadInstitucionalDocumento = multer({
  storage: institucionalDocsStorage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: institucionalDocsFileFilter
});

const ETIQUETAS_PERFIL_GESTION = {
  TODOS: 'Todos los perfiles',
  ADMINISTRADOR: 'Administrador',
  PROMOTORIA: 'Promotoría',
  DOCENTE: 'Docente',
  ALUMNO: 'Alumno',
  APODERADO: 'Apoderado',
  ASISTENCIA: 'Asistencia',
  PSICOLOGIA: 'Psicología',
  PSICOLOGO: 'Psicólogo'
};
function etiquetaPerfilGestion(codigo) {
  if (!codigo) return '';
  if (ETIQUETAS_PERFIL_GESTION[codigo]) return ETIQUETAS_PERFIL_GESTION[codigo];
  return String(codigo)
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

// Autenticación: ADMINISTRADOR en todas las rutas; PROMOTORIA solo en dashboard y estadísticas de pagos (mismo panel que admin)
router.use(authenticateToken);
router.use((req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Usuario no autenticado' });
  }
  if (req.user.tipo === 'ADMINISTRADOR') {
    return next();
  }
  if (req.user.tipo === 'PROMOTORIA') {
    const p = req.path || '';
    const permitidasPromotoria = [
      '/dashboard',
      '/estadisticas/kpis',
      '/estadisticas/deudas-por-nivel',
      '/estadisticas/deudas-por-aula',
      '/estadisticas/deudas-por-aula/alumnos',
      '/estadisticas/deudores-lista'
    ];
    const permitidasPorPrefijo = ['/notificaciones', '/perfil', '/conexiones', '/eventos'];
    if (
      permitidasPromotoria.includes(p) ||
      permitidasPorPrefijo.some((prefix) => p === prefix || p.startsWith(`${prefix}/`))
    ) {
      return next();
    }
  }
  if (req.user.tipo === 'PSICOLOGA') {
    const p = req.path || '';
    const prefijosPsicologa = ['/notificaciones', '/perfil', '/conexiones', '/eventos'];
    if (prefijosPsicologa.some((prefix) => p === prefix || p.startsWith(`${prefix}/`))) {
      return next();
    }
  }
  if (req.user.tipo === 'COORDINADOR') {
    const { coordinadorPuedeAdminCore } = require('../utils/coordinadorAcceso');
    if (coordinadorPuedeAdminCore(req.path || '', req.method)) {
      return next();
    }
  }
  return res.status(403).json({
    error: 'No tienes permisos para acceder a este recurso'
  });
});

/** Rutas que deben ser exclusivas de ADMINISTRADOR (p. ej. Institucional; Promotoría no entra aunque use /api/admin). */
function requireSoloAdministrador(req, res, next) {
  if (req.user?.tipo !== 'ADMINISTRADOR') {
    return res.status(403).json({
      error: 'Solo el perfil Administrador puede acceder a este módulo.'
    });
  }
  next();
}

function requireAdminOCoordinadorGetInstitucional(req, res, next) {
  if (req.user?.tipo === 'ADMINISTRADOR') return next();
  if (req.user?.tipo === 'COORDINADOR') return next();
  return res.status(403).json({
    error: 'Solo el perfil Administrador puede acceder a este módulo.'
  });
}

function buildArchivoUrlAdmin(nombreArchivo) {
  const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) return `${phpSystemUrl}/Static/Archivos/${nombreArchivo}`;
  return `http://localhost:5000/Static/Archivos/${nombreArchivo}`;
}

/**
 * Adjuntos de un envío de conexiones/mensajes.
 * Si existe `mensaje_referencia_id` (mensajes_grupos tras migración 033), se usa ese mensaje RECIBIDO;
 * si no, fallback por remitente + fecha (menos fiable si hay varios mensajes el mismo segundo).
 */
async function obtenerAdjuntosPorRemitenteFecha(remitenteId, fechaHora, mensajeReferenciaId) {
  const mapArchivos = (archivosRows) =>
    (archivosRows || []).map((a) => ({
      id: a.id,
      nombre_archivo: a.nombre_archivo || a.archivo || 'Adjunto',
      archivo: a.archivo,
      archivo_url: buildArchivoUrlAdmin(a.archivo)
    }));

  if (mensajeReferenciaId) {
    try {
      const archivosRows = await query(
        `SELECT id, nombre_archivo, archivo
         FROM mensajes_archivos
         WHERE mensaje_id = ?`,
        [mensajeReferenciaId]
      );
      return mapArchivos(archivosRows);
    } catch (e) {
      console.warn('⚠️ [ADMIN CONEXIONES] Error adjuntos por mensaje_referencia_id:', e?.message);
    }
  }

  if (!remitenteId || !fechaHora) return [];
  try {
    const mensajesMatch = await query(
      `SELECT id
       FROM mensajes
       WHERE remitente_id = ? AND fecha_hora = ?
       ORDER BY id DESC
       LIMIT 1`,
      [remitenteId, fechaHora]
    );
    if (!mensajesMatch.length) return [];

    const archivosRows = await query(
      `SELECT id, nombre_archivo, archivo
       FROM mensajes_archivos
       WHERE mensaje_id = ?`,
      [mensajesMatch[0].id]
    );

    return mapArchivos(archivosRows);
  } catch (e) {
    console.warn('⚠️ [ADMIN CONEXIONES] Error obteniendo adjuntos del envío:', e?.message);
    return [];
  }
}

/**
 * GET /api/admin/dashboard
 * Estadísticas para el administrador (año activo).
 * Matrículas solo Regular (0): presupuesto = tarifa (matrícula + N pensiones); ingresos = SUM(monto) cobrado.
 * Si se pasa a Retirado/Traslado/Irregular, la matrícula sale del año y los totales se actualizan.
 */
router.get('/dashboard', async (req, res) => {
  try {
    const { colegio_id } = req.user;

    const [colegio] = await query(
      'SELECT anio_activo, total_pensiones, moneda, inicio_pensiones FROM colegios WHERE id = ? LIMIT 1',
      [colegio_id]
    );
    const anioActivo = parseInt(colegio?.anio_activo || new Date().getFullYear(), 10);
    const totalPensiones = parseInt(colegio?.total_pensiones || 10);
    const moneda = colegio?.moneda || 'S/';

    // Matrículas del año activo con estado Regular (incluye alumnos aún sin pagar matrícula)
    const matriculasPagadas = await query(
      `SELECT m.id, m.alumno_id, c.pension, c.matricula
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       INNER JOIN costos c ON c.id = m.costo_id
       WHERE m.colegio_id = ? AND g.anio = ? AND (m.estado = 0)`,
      [colegio_id, anioActivo]
    );
    const matIdsPagadas = (matriculasPagadas || []).map(m => m.id);
    const alumnoIdsPagados = [...new Set((matriculasPagadas || []).map(m => m.alumno_id))];

    // Total Grados (grupos del año activo)
    const [rGrados] = await query(
      'SELECT COUNT(*) as total FROM grupos WHERE colegio_id = ? AND anio = ?',
      [colegio_id, anioActivo]
    );

    // Total Trabajadores
    const [rTrabajadores] = await query(
      'SELECT COUNT(*) as total FROM personal WHERE colegio_id = ?',
      [colegio_id]
    );

    // Total Alumnos: con matrícula Regular en el año activo
    const totalAlumnos = alumnoIdsPagados.length;

    // Total Apoderados: padres de esos alumnos
    let totalApoderados = 0;
    if (alumnoIdsPagados.length > 0) {
      const ph = alumnoIdsPagados.map(() => '?').join(',');
      const [rAp] = await query(
        `SELECT COUNT(DISTINCT f.apoderado_id) as total
         FROM familias f
         WHERE f.alumno_id IN (${ph})`,
        alumnoIdsPagados
      );
      totalApoderados = rAp?.total ?? 0;
    }

    // Presupuesto Anual (año activo): matrícula + N pensiones por cada matrícula activa
    let presupuestoAnual = 0;
    for (const mat of matriculasPagadas || []) {
      const pension = parseFloat(mat.pension || 0);
      const matriculaCosto = parseFloat(mat.matricula || 0);
      presupuestoAnual += matriculaCosto + (pension * totalPensiones);
    }

    // Ingresos (solo monto tarifario). Mora aparte en total_mora_recaudada (no se suma a ingresos).
    let totalIngresos = 0;
    let totalMoraRecaudada = 0;
    if (matIdsPagadas.length > 0) {
      const ph = matIdsPagadas.map(() => '?').join(',');
      const [rIngresos] = await query(
        `SELECT
           COALESCE(SUM(p.monto), 0) AS total_ingresos,
           COALESCE(SUM(COALESCE(p.mora, 0)), 0) AS total_mora
         FROM pagos p
         WHERE p.colegio_id = ? AND p.estado = 'ACTIVO' AND p.estado_pago = 'CANCELADO'
           AND p.matricula_id IN (${ph})`,
        [colegio_id, ...matIdsPagadas]
      );
      totalIngresos = parseFloat(rIngresos?.total_ingresos || 0);
      totalMoraRecaudada = parseFloat(rIngresos?.total_mora || 0);
    }

    const totalDeuda = Math.max(0, presupuestoAnual - totalIngresos);

    // Deudas Anteriores: años >= 2025 y < año activo, solo lo no pagado
    const matriculasAnteriores = await query(
      `SELECT m.id, c.pension, c.matricula, g.anio
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       INNER JOIN costos c ON c.id = m.costo_id
       WHERE m.colegio_id = ? AND g.anio >= 2025 AND g.anio < ? AND (m.estado = 0)`,
      [colegio_id, anioActivo]
    );
    let deudasAnteriores = 0;
    for (const mat of matriculasAnteriores || []) {
      const pagosCancelados = await query(
        `SELECT COALESCE(SUM(p.monto), 0) as pagado
         FROM pagos p
         WHERE p.matricula_id = ? AND p.colegio_id = ? AND p.estado = 'ACTIVO' AND p.estado_pago = 'CANCELADO'`,
        [mat.id, colegio_id]
      );
      const pension = parseFloat(mat.pension || 0);
      const matriculaCosto = parseFloat(mat.matricula || 0);
      const totalPagar = matriculaCosto + (pension * totalPensiones);
      const pagado = parseFloat((pagosCancelados && pagosCancelados[0]?.pagado) || 0);
      deudasAnteriores += Math.max(0, totalPagar - pagado);
    }

    res.json({
      total_grados: rGrados?.total ?? 0,
      total_trabajadores: rTrabajadores?.total ?? 0,
      total_alumnos: totalAlumnos,
      total_apoderados: totalApoderados,
      presupuesto_anual: presupuestoAnual,
      total_ingresos: totalIngresos,
      total_mora_recaudada: totalMoraRecaudada,
      total_deuda: totalDeuda,
      deudas_anteriores: deudasAnteriores,
      moneda,
      anio_activo: anioActivo
    });
  } catch (error) {
    console.error('Error dashboard admin:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

/**
 * GET /api/admin/estadisticas/kpis
 * KPIs para la página Estadísticas (pagos/pensiones). Opcional: ?anio=2026
 * Pagado / total_cobrado: solo SUM(monto); la mora no entra en estos totales.
 */
router.get('/estadisticas/kpis', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const anioParam = parseInt(req.query.anio, 10);
    const [colegio] = await query(
      'SELECT anio_activo, total_pensiones, moneda, inicio_pensiones FROM colegios WHERE id = ? LIMIT 1',
      [colegio_id]
    );
    const anio = !isNaN(anioParam) && anioParam > 0 ? anioParam : parseInt(colegio?.anio_activo || new Date().getFullYear(), 10);
    const totalPensiones = parseInt(colegio?.total_pensiones || 10);
    const moneda = colegio?.moneda || 'S/';

    // Matrículas del año: solo Regular (0)
    const matriculasPagadas = await query(
      `SELECT m.id, m.alumno_id, c.pension, c.matricula
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       INNER JOIN costos c ON c.id = m.costo_id
       WHERE m.colegio_id = ? AND g.anio = ? AND (m.estado = 0)`,
      [colegio_id, anio]
    );
    const matIdsPagadas = (matriculasPagadas || []).map(m => m.id);
    const alumnosTotal = [...new Set((matriculasPagadas || []).map(m => m.alumno_id))].length;

    // Presupuesto anual (matrícula + pensiones por alumno)
    let presupuestoAnual = 0;
    let totalMatriculaEsperado = 0;
    const esperadoPensionPorTipo = {};
    for (const mat of matriculasPagadas || []) {
      const matriculaCosto = parseFloat(mat.matricula || 0);
      const pensionCosto = parseFloat(mat.pension || 0);
      presupuestoAnual += matriculaCosto + (pensionCosto * totalPensiones);
      totalMatriculaEsperado += matriculaCosto;

      // Distribuir pensiones esperadas por tipo de pago (1..totalPensiones)
      for (let i = 1; i <= totalPensiones; i += 1) {
        esperadoPensionPorTipo[i] = (esperadoPensionPorTipo[i] || 0) + pensionCosto;
      }
    }

    // Total cobrado (ingresos) del año para esas matrículas
    let totalCobrado = 0;
    let pagadoPorTipo = {};
    if (matIdsPagadas.length > 0) {
      const ph = matIdsPagadas.map(() => '?').join(',');

      // Matrícula: considerar pagos sin filtrar por año (algunos se pagan el año anterior)
      const [rIngMat] = await query(
        `SELECT COALESCE(SUM(p.monto), 0) as total
         FROM pagos p
         WHERE p.colegio_id = ? AND p.estado = 'ACTIVO' AND p.estado_pago = 'CANCELADO'
           AND p.matricula_id IN (${ph}) AND p.tipo = 0`,
        [colegio_id, ...matIdsPagadas]
      );

      // Pensiones: solo pagos del año consultado (ciclos de pensiones)
      const [rIngPens] = await query(
        `SELECT COALESCE(SUM(p.monto), 0) as total
         FROM pagos p
         WHERE p.colegio_id = ? AND p.estado = 'ACTIVO' AND p.estado_pago = 'CANCELADO'
           AND p.matricula_id IN (${ph}) AND p.tipo > 0 AND ${ANIO_PAGO_SQL}`,
        [colegio_id, ...matIdsPagadas, anio, anio]
      );

      totalCobrado = parseFloat(rIngMat?.total || 0) + parseFloat(rIngPens?.total || 0);

      // Pagado por tipo:
      // - tipo = 0 (matrícula): sin filtro por año
      // - tipo > 0 (pensiones): solo pagos del año consultado
      pagadoPorTipo = {};

      const pagosMatricula = await query(
        `SELECT p.tipo, COALESCE(SUM(p.monto), 0) as total
         FROM pagos p
         WHERE p.colegio_id = ? AND p.estado = 'ACTIVO' AND p.estado_pago = 'CANCELADO'
           AND p.matricula_id IN (${ph}) AND p.tipo = 0
         GROUP BY p.tipo`,
        [colegio_id, ...matIdsPagadas]
      );
      (pagosMatricula || []).forEach((row) => {
        pagadoPorTipo[row.tipo] = parseFloat(row.total || 0);
      });

      // Pensiones: en la BD son tipo=1 y el mes viene en nro_pago (1=primera pensión, 2=segunda, …)
      const pagosPensiones = await query(
        `SELECT p.tipo, p.nro_pago, COALESCE(SUM(p.monto), 0) as total
         FROM pagos p
         WHERE p.colegio_id = ? AND p.estado = 'ACTIVO' AND p.estado_pago = 'CANCELADO'
           AND p.matricula_id IN (${ph}) AND p.tipo = 1 AND p.nro_pago >= 1 AND p.nro_pago <= ? AND ${ANIO_PAGO_SQL}
         GROUP BY p.tipo, p.nro_pago`,
        [colegio_id, ...matIdsPagadas, totalPensiones, anio, anio]
      );
      (pagosPensiones || []).forEach((row) => {
        const idx = parseInt(row.nro_pago, 10);
        if (idx >= 1 && idx <= totalPensiones) {
          pagadoPorTipo[idx] = parseFloat(row.total || 0);
        }
      });
    }

    // Mapa pagos por matrícula y concepto (misma lógica que detalle por alumno) para saldo = Σ max(0, tarifa − pagado)
    const pagosPorMatricula = {};
    if (matIdsPagadas.length > 0) {
      const phDet = matIdsPagadas.map(() => '?').join(',');
      const detRows = await query(
        `SELECT p.matricula_id, p.tipo, COALESCE(p.nro_pago, 0) AS nro_pago,
         COALESCE(SUM(p.monto), 0) AS total
         FROM pagos p
         WHERE p.colegio_id = ? AND p.estado = 'ACTIVO' AND p.estado_pago = 'CANCELADO'
           AND p.matricula_id IN (${phDet})
           AND (p.tipo = 0 OR (p.tipo = 1 AND p.nro_pago >= 1 AND p.nro_pago <= ? AND ${ANIO_PAGO_SQL}))
         GROUP BY p.matricula_id, p.tipo, p.nro_pago`,
        [colegio_id, ...matIdsPagadas, totalPensiones, anio, anio]
      );
      (detRows || []).forEach((row) => {
        const mid = row.matricula_id;
        if (!pagosPorMatricula[mid]) pagosPorMatricula[mid] = { t0: 0, pens: {} };
        const t = parseInt(row.tipo, 10);
        const tot = parseFloat(row.total || 0);
        if (t === 0) pagosPorMatricula[mid].t0 = tot;
        else if (t === 1) {
          const np = parseInt(row.nro_pago, 10);
          if (np >= 1 && np <= totalPensiones) pagosPorMatricula[mid].pens[np] = tot;
        }
      });
    }

    const totalDeuda = Math.max(0, presupuestoAnual - totalCobrado);

    // Cantidad de deudores: matrículas que aún deben (lo pagado < lo esperado) — una sola consulta
    let cantidadDeudores = 0;
    if (matIdsPagadas.length > 0) {
      const ph = matIdsPagadas.map(() => '?').join(',');
      const pagadoPorMatricula = await query(
        `SELECT p.matricula_id, COALESCE(SUM(p.monto), 0) as pagado
         FROM pagos p
         WHERE p.colegio_id = ? AND p.estado = 'ACTIVO' AND p.estado_pago = 'CANCELADO'
           AND p.matricula_id IN (${ph})
         GROUP BY p.matricula_id`,
        [colegio_id, ...matIdsPagadas]
      );
      const mapPagado = {};
      (pagadoPorMatricula || []).forEach(row => { mapPagado[row.matricula_id] = parseFloat(row.pagado || 0); });
      for (const mat of matriculasPagadas || []) {
        const pagado = mapPagado[mat.id] || 0;
        const esperado = parseFloat(mat.matricula || 0) + (parseFloat(mat.pension || 0) * totalPensiones);
        if (pagado < esperado) cantidadDeudores += 1;
      }
    }
    const alumnosAlDia = Math.max(0, alumnosTotal - cantidadDeudores);

    // Desglose por concepto (Matrícula + meses de pensión)
    const nombresMes = [
      '',
      'Enero',
      'Febrero',
      'Marzo',
      'Abril',
      'Mayo',
      'Junio',
      'Julio',
      'Agosto',
      'Septiembre',
      'Octubre',
      'Noviembre',
      'Diciembre'
    ];

    const conceptos = [];
    // Matrícula — saldo pendiente = suma por alumno de max(0, tarifa − pagado monto)
    const pagadoMatricula = pagadoPorTipo[0] || 0;
    let saldoMatriculaSum = 0;
    for (const mat of matriculasPagadas || []) {
      const pm = pagosPorMatricula[mat.id] || { t0: 0, pens: {} };
      const esp = parseFloat(mat.matricula || 0);
      saldoMatriculaSum += Math.max(0, esp - pm.t0);
    }
    conceptos.push({
      tipo: 0,
      concepto: 'Matrícula',
      total_pagar: totalMatriculaEsperado,
      pagado: pagadoMatricula,
      deuda: saldoMatriculaSum
    });

    // Meses de pensión: index 1..totalPensiones mapeado a Marzo..Diciembre
    for (let i = 1; i <= totalPensiones; i += 1) {
      const indiceMesCalendario = 2 + i; // i=1 -> 3 (Marzo), i=10 -> 12 (Diciembre)
      if (indiceMesCalendario > 12) continue;
      const nombreMes = nombresMes[indiceMesCalendario] || `Mes ${i}`;
      const totalMes = esperadoPensionPorTipo[i] || 0;
      const pagadoMes = pagadoPorTipo[i] || 0;
      let saldoMesSum = 0;
      for (const mat of matriculasPagadas || []) {
        const pm = pagosPorMatricula[mat.id] || { t0: 0, pens: {} };
        const esp = parseFloat(mat.pension || 0);
        const pag = pm.pens[i] || 0;
        saldoMesSum += Math.max(0, esp - pag);
      }
      conceptos.push({
        tipo: i,
        concepto: nombreMes,
        total_pagar: totalMes,
        pagado: pagadoMes,
        deuda: saldoMesSum
      });
    }

    res.json({
      anio,
      moneda,
      total_cobrado: totalCobrado,
      total_deuda: totalDeuda,
      presupuesto_anual: presupuestoAnual,
      alumnos_total: alumnosTotal,
      alumnos_al_dia: alumnosAlDia,
      cantidad_deudores: cantidadDeudores,
      conceptos
    });
  } catch (error) {
    console.error('Error estadísticas KPIs:', error);
    res.status(500).json({ error: 'Error al obtener KPIs de estadísticas' });
  }
});

/**
 * GET /api/admin/estadisticas/deudas-por-nivel
 * Saldo vencido por nivel + alumnos al día / con deuda, según fechas de vencimiento
 * de pensiones (hasta hoy, sin tolerancia, sin matrícula ni meses futuros).
 */
router.get('/estadisticas/deudas-por-nivel', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const anioParam = parseInt(req.query.anio, 10);
    const [colegio] = await query(
      `SELECT anio_activo, total_pensiones, moneda, inicio_pensiones, pensiones_vencimiento
       FROM colegios WHERE id = ? LIMIT 1`,
      [colegio_id]
    );
    const anio = !isNaN(anioParam) && anioParam > 0
      ? anioParam
      : parseInt(colegio?.anio_activo || new Date().getFullYear(), 10);
    const totalPensiones = parseInt(colegio?.total_pensiones || 10, 10);
    const inicioPensiones = parseInt(colegio?.inicio_pensiones || 2, 10);
    const moneda = colegio?.moneda || 'S/';

    const { nros: pensionesVencidas, fechas: fechasVencimiento } = listarPensionesVencidasHastaHoy({
      anio,
      totalPensiones,
      inicioPensiones,
      pensionesVencimientoRaw: colegio?.pensiones_vencimiento,
    });

    const matriculas = await query(
      `SELECT m.id, c.pension, n.id AS nivel_id, n.nombre AS nivel_nombre
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       INNER JOIN costos c ON c.id = m.costo_id
       WHERE m.colegio_id = ? AND g.anio = ? AND (m.estado = 0)
       ORDER BY n.nombre ASC`,
      [colegio_id, anio]
    );

    const matIds = (matriculas || []).map((m) => m.id);
    const pagosPorMatricula = {};
    if (matIds.length > 0 && pensionesVencidas.length > 0) {
      const ph = matIds.map(() => '?').join(',');
      const phNros = pensionesVencidas.map(() => '?').join(',');
      const detRows = await query(
        `SELECT p.matricula_id, p.nro_pago, COALESCE(SUM(p.monto), 0) AS total
         FROM pagos p
         WHERE p.colegio_id = ? AND p.estado = 'ACTIVO' AND p.estado_pago = 'CANCELADO'
           AND p.matricula_id IN (${ph})
           AND p.tipo = 1 AND p.nro_pago IN (${phNros})
           AND ${ANIO_PAGO_SQL}
         GROUP BY p.matricula_id, p.nro_pago`,
        [colegio_id, ...matIds, ...pensionesVencidas, anio, anio]
      );
      (detRows || []).forEach((row) => {
        const mid = row.matricula_id;
        if (!pagosPorMatricula[mid]) pagosPorMatricula[mid] = {};
        const np = parseInt(row.nro_pago, 10);
        if (pensionesVencidas.includes(np)) {
          pagosPorMatricula[mid][np] = parseFloat(row.total || 0);
        }
      });
    }

    const porNivel = {};
    let cantidadDeudores = 0;
    const alumnosTotal = (matriculas || []).length;

    for (const mat of matriculas || []) {
      const nivelId = mat.nivel_id;
      if (!porNivel[nivelId]) {
        porNivel[nivelId] = {
          nivel_id: nivelId,
          nivel: mat.nivel_nombre || 'Sin nivel',
          tarifa: 0,
          pagado: 0,
          saldo: 0,
          alumnos: 0,
          deudores: 0,
        };
      }
      const espPen = parseFloat(mat.pension || 0);
      const pm = pagosPorMatricula[mat.id] || {};
      let tarifa = 0;
      let pagado = 0;
      let saldo = 0;
      for (const i of pensionesVencidas) {
        tarifa += espPen;
        const pag = pm[i] || 0;
        pagado += Math.min(pag, espPen);
        saldo += Math.max(0, espPen - pag);
      }
      const esDeudor = saldo > 0.009;
      if (esDeudor) {
        cantidadDeudores += 1;
        porNivel[nivelId].deudores += 1;
      }
      porNivel[nivelId].tarifa += tarifa;
      porNivel[nivelId].pagado += pagado;
      porNivel[nivelId].saldo += saldo;
      porNivel[nivelId].alumnos += 1;
    }

    const alumnosAlDia = Math.max(0, alumnosTotal - cantidadDeudores);

    const niveles = Object.values(porNivel)
      .map((n) => ({
        ...n,
        tarifa: Math.round(n.tarifa * 100) / 100,
        pagado: Math.round(n.pagado * 100) / 100,
        saldo: Math.round(n.saldo * 100) / 100,
      }))
      .sort((a, b) => b.saldo - a.saldo);

    res.json({
      anio,
      moneda,
      criterio: 'pensiones_vencidas_hasta_hoy',
      pensiones_vencidas: pensionesVencidas,
      fechas_vencimiento: fechasVencimiento,
      alumnos_total: alumnosTotal,
      alumnos_al_dia: alumnosAlDia,
      cantidad_deudores: cantidadDeudores,
      niveles,
    });
  } catch (error) {
    console.error('Error estadísticas deudas-por-nivel:', error);
    res.status(500).json({ error: 'Error al obtener deudas por nivel' });
  }
});

/**
 * GET /api/admin/estadisticas/deudas-por-aula
 * Saldo pendiente por aula (grupo) para un concepto. Query: tipo (0=matrícula, 1..N=nro_pago pensión), anio
 * Respuesta: aulas ordenadas por saldo descendente (mayor deuda primero).
 */
router.get('/estadisticas/deudas-por-aula', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const tipoParam = parseInt(req.query.tipo, 10);
    const anioParam = parseInt(req.query.anio, 10);

    const [colegio] = await query(
      'SELECT anio_activo, total_pensiones, moneda FROM colegios WHERE id = ? LIMIT 1',
      [colegio_id]
    );
    const anio = !isNaN(anioParam) && anioParam > 0 ? anioParam : parseInt(colegio?.anio_activo || new Date().getFullYear(), 10);
    const totalPensiones = parseInt(colegio?.total_pensiones || 10);

    if (isNaN(tipoParam) || tipoParam < 0) {
      return res.status(400).json({ error: 'Parámetro tipo requerido (0=matrícula, 1..N=mes pensión)' });
    }

    // Grupos del año con nivel (para etiqueta Aula)
    const gruposAnio = await query(
      `SELECT g.id, g.grado, g.seccion, g.anio, n.nombre as nivel_nombre
       FROM grupos g
       INNER JOIN niveles n ON n.id = g.nivel_id
       WHERE g.colegio_id = ? AND g.anio = ?`,
      [colegio_id, anio]
    );
    if (!gruposAnio || gruposAnio.length === 0) {
      return res.json({ anio, moneda: colegio?.moneda || 'S/', aulas: [] });
    }

    if (tipoParam === 0) {
      // Matrícula: saldo por aula = Σ por alumno max(0, tarifa − pagado monto tipo 0)
      const porGrupo = await query(
        `SELECT m.grupo_id,
           SUM(c.matricula) AS deuda_total,
           SUM(COALESCE(pg.pagado_mat, 0)) AS pagado,
           SUM(GREATEST(0, c.matricula - COALESCE(pg.pagado_mat, 0))) AS saldo
         FROM matriculas m
         INNER JOIN grupos g ON g.id = m.grupo_id
         INNER JOIN costos c ON c.id = m.costo_id
         LEFT JOIN (
           SELECT p.matricula_id, SUM(p.monto) AS pagado_mat
           FROM pagos p
           WHERE p.colegio_id = ? AND p.estado = 'ACTIVO' AND p.estado_pago = 'CANCELADO' AND p.tipo = 0
           GROUP BY p.matricula_id
         ) pg ON pg.matricula_id = m.id
         WHERE m.colegio_id = ? AND g.anio = ? AND (m.estado = 0)
           AND EXISTS (
             SELECT 1 FROM pagos p2
             WHERE p2.matricula_id = m.id AND p2.colegio_id = ? AND p2.estado = 'ACTIVO'
               AND p2.tipo = 0 AND p2.estado_pago = 'CANCELADO'
           )
         GROUP BY m.grupo_id`,
        [colegio_id, colegio_id, anio, colegio_id]
      );
      const mapGrupo = {};
      (porGrupo || []).forEach((r) => {
        mapGrupo[r.grupo_id] = {
          deuda_total: parseFloat(r.deuda_total || 0),
          pagado: parseFloat(r.pagado || 0),
          saldo: parseFloat(r.saldo || 0)
        };
      });
      const aulas = gruposAnio.map((g) => {
        const row = mapGrupo[g.id];
        const deudaTotal = row?.deuda_total || 0;
        const pagado = row?.pagado || 0;
        const saldo = row?.saldo || 0;
        const aula = `${(g.nivel_nombre || '').toUpperCase()} - ${g.grado}° ${g.seccion || ''} - ${g.anio}`.trim();
        return { grupo_id: g.id, aula, deuda_total: deudaTotal, pagado, saldo };
      });
      aulas.sort((a, b) => (b.saldo - a.saldo));
      return res.json({ anio, moneda: colegio?.moneda || 'S/', concepto_tipo: 0, concepto: 'Matrícula', aulas });
    }

    // Pensión (tipo 1..totalPensiones = nro_pago)
    const nroPago = tipoParam;
    if (nroPago < 1 || nroPago > totalPensiones) {
      return res.json({ anio, moneda: colegio?.moneda || 'S/', concepto_tipo: nroPago, aulas: [] });
    }

    const porGrupoPension = await query(
      `SELECT m.grupo_id,
         SUM(c.pension) AS deuda_total,
         SUM(COALESCE(pg.pagado_pens, 0)) AS pagado,
         SUM(GREATEST(0, c.pension - COALESCE(pg.pagado_pens, 0))) AS saldo
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       INNER JOIN costos c ON c.id = m.costo_id
       LEFT JOIN (
         SELECT p.matricula_id, SUM(p.monto) AS pagado_pens
         FROM pagos p
         WHERE p.colegio_id = ? AND p.estado = 'ACTIVO' AND p.estado_pago = 'CANCELADO'
           AND p.tipo = 1 AND p.nro_pago = ? AND ${ANIO_PAGO_SQL}
         GROUP BY p.matricula_id
       ) pg ON pg.matricula_id = m.id
       WHERE m.colegio_id = ? AND g.anio = ? AND (m.estado = 0)
         AND EXISTS (
           SELECT 1 FROM pagos p2
           WHERE p2.matricula_id = m.id AND p2.colegio_id = ? AND p2.estado = 'ACTIVO'
             AND p2.tipo = 0 AND p2.estado_pago = 'CANCELADO'
         )
       GROUP BY m.grupo_id`,
      [colegio_id, nroPago, anio, anio, colegio_id, anio, colegio_id]
    );

    const nombresMes = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const indiceMes = 2 + nroPago;
    const nombreMes = indiceMes <= 12 ? (nombresMes[indiceMes] || `Mes ${nroPago}`) : `Mes ${nroPago}`;

    const mapGrupoPens = {};
    (porGrupoPension || []).forEach((r) => {
      mapGrupoPens[r.grupo_id] = {
        deuda_total: parseFloat(r.deuda_total || 0),
        pagado: parseFloat(r.pagado || 0),
        saldo: parseFloat(r.saldo || 0)
      };
    });

    const aulas = gruposAnio.map((g) => {
      const row = mapGrupoPens[g.id];
      const deudaTotal = row?.deuda_total || 0;
      const pagado = row?.pagado || 0;
      const saldo = row?.saldo || 0;
      const aula = `${(g.nivel_nombre || '').toUpperCase()} - ${g.grado}° ${g.seccion || ''} - ${g.anio}`.trim();
      return { grupo_id: g.id, aula, deuda_total: deudaTotal, pagado, saldo };
    });
    aulas.sort((a, b) => (b.saldo - a.saldo));
    return res.json({ anio, moneda: colegio?.moneda || 'S/', concepto_tipo: nroPago, concepto: nombreMes, aulas });
  } catch (error) {
    console.error('Error deudas por aula:', error);
    res.status(500).json({ error: 'Error al obtener deudas por aula' });
  }
});

/**
 * GET /api/admin/estadisticas/deudas-por-aula/alumnos
 * Alumnos de un grupo con deuda/pagado/saldo para un concepto. Query: tipo, anio, grupo_id
 * Respuesta: alumnos ordenados por saldo descendente (mayor a menor).
 */
router.get('/estadisticas/deudas-por-aula/alumnos', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const tipoParam = parseInt(req.query.tipo, 10);
    const anioParam = parseInt(req.query.anio, 10);
    const grupoId = parseInt(req.query.grupo_id, 10);

    if (!grupoId || isNaN(tipoParam) || tipoParam < 0) {
      return res.status(400).json({ error: 'Parámetros tipo y grupo_id requeridos' });
    }

    const [colegio] = await query(
      'SELECT anio_activo, total_pensiones, moneda FROM colegios WHERE id = ? LIMIT 1',
      [colegio_id]
    );
    const anio = !isNaN(anioParam) && anioParam > 0 ? anioParam : parseInt(colegio?.anio_activo || new Date().getFullYear(), 10);
    const totalPensiones = parseInt(colegio?.total_pensiones || 10);

    const nombreAlumno = (a) => [a.apellido_paterno, a.apellido_materno, a.nombres].filter(Boolean).join(' ').trim() || '—';

    if (tipoParam === 0) {
      const rows = await query(
        `SELECT m.id as matricula_id, m.alumno_id,
         a.nombres, a.apellido_paterno, a.apellido_materno,
         c.matricula as deuda_total,
         (SELECT COALESCE(SUM(p.monto), 0)
          FROM pagos p
          WHERE p.matricula_id = m.id AND p.colegio_id = ? AND p.estado = 'ACTIVO'
            AND p.estado_pago = 'CANCELADO' AND p.tipo = 0) as pagado
         FROM matriculas m
         INNER JOIN costos c ON c.id = m.costo_id
         INNER JOIN alumnos a ON a.id = m.alumno_id
         WHERE m.grupo_id = ? AND m.colegio_id = ? AND (m.estado = 0)
           AND EXISTS (
             SELECT 1 FROM pagos p
             WHERE p.matricula_id = m.id AND p.colegio_id = ? AND p.estado = 'ACTIVO'
               AND p.tipo = 0 AND p.estado_pago = 'CANCELADO'
           )`,
        [colegio_id, grupoId, colegio_id, colegio_id]
      );
      const alumnos = (rows || []).map(r => {
        const deudaTotal = parseFloat(r.deuda_total) || 0;
        const pagado = parseFloat(r.pagado) || 0;
        const saldo = Math.max(0, deudaTotal - pagado);
        return {
          alumno_id: r.alumno_id,
          nombre: nombreAlumno(r),
          deuda_total: deudaTotal,
          pagado,
          saldo
        };
      });
      alumnos.sort((a, b) => (b.saldo - a.saldo));
      return res.json({ anio, moneda: colegio?.moneda || 'S/', concepto: 'Matrícula', grupo_id: grupoId, alumnos });
    }

    const nroPago = tipoParam;
    if (nroPago < 1 || nroPago > totalPensiones) {
      return res.json({ anio, moneda: colegio?.moneda || 'S/', concepto: `Mes ${nroPago}`, grupo_id: grupoId, alumnos: [] });
    }

    const rows = await query(
      `SELECT m.id as matricula_id, m.alumno_id,
       a.nombres, a.apellido_paterno, a.apellido_materno,
       c.pension as deuda_total,
       (SELECT COALESCE(SUM(p.monto), 0)
        FROM pagos p
        WHERE p.matricula_id = m.id AND p.colegio_id = ? AND p.estado = 'ACTIVO'
          AND p.estado_pago = 'CANCELADO' AND p.tipo = 1 AND p.nro_pago = ? AND ${ANIO_PAGO_SQL}) as pagado
       FROM matriculas m
       INNER JOIN costos c ON c.id = m.costo_id
       INNER JOIN alumnos a ON a.id = m.alumno_id
       WHERE m.grupo_id = ? AND m.colegio_id = ? AND (m.estado = 0)
         AND EXISTS (
           SELECT 1 FROM pagos p
           WHERE p.matricula_id = m.id AND p.colegio_id = ? AND p.estado = 'ACTIVO'
             AND p.tipo = 0 AND p.estado_pago = 'CANCELADO'
         )`,
      [colegio_id, nroPago, anio, anio, grupoId, colegio_id, colegio_id]
    );
    const nombresMes = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const nombreMes = (2 + nroPago) <= 12 ? (nombresMes[2 + nroPago] || `Mes ${nroPago}`) : `Mes ${nroPago}`;
    const alumnos = (rows || []).map(r => {
      const deudaTotal = parseFloat(r.deuda_total) || 0;
      const pagado = parseFloat(r.pagado) || 0;
      const saldo = Math.max(0, deudaTotal - pagado);
      return {
        alumno_id: r.alumno_id,
        nombre: nombreAlumno(r),
        deuda_total: deudaTotal,
        pagado,
        saldo
      };
    });
    alumnos.sort((a, b) => (b.saldo - a.saldo));
    return res.json({ anio, moneda: colegio?.moneda || 'S/', concepto: nombreMes, grupo_id: grupoId, alumnos });
  } catch (error) {
    console.error('Error deudas por aula alumnos:', error);
    res.status(500).json({ error: 'Error al obtener alumnos del grupo' });
  }
});

/**
 * GET /api/admin/estadisticas/deudores-lista
 * Lista de deudores del colegio (año + concepto) con grado y teléfono de apoderado, para reporte/PDF.
 * Query: anio (opcional), tipo: 0=matrícula, 1..N=nro pensión, todos=saldo total pendiente (todos los conceptos).
 * Query opcional: grupo_id (id de aula/grupo del año lectivo) para filtrar solo ese grado.
 */
router.get('/estadisticas/deudores-lista', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const anioParam = parseInt(req.query.anio, 10);
    const tipoRaw = req.query.tipo;
    const grupoIdQ =
      req.query.grupo_id != null && String(req.query.grupo_id).trim() !== ''
        ? parseInt(req.query.grupo_id, 10)
        : null;

    const [colegio] = await query(
      `SELECT anio_activo, total_pensiones, moneda, titulo_intranet, razon_social
       FROM colegios WHERE id = ? LIMIT 1`,
      [colegio_id]
    );
    const anio = !isNaN(anioParam) && anioParam > 0 ? anioParam : parseInt(colegio?.anio_activo || new Date().getFullYear(), 10);
    const totalPensiones = parseInt(colegio?.total_pensiones || 10);
    const moneda = colegio?.moneda || 'S/';
    const colegioNombre = (colegio?.razon_social || colegio?.titulo_intranet || 'Colegio').trim();

    const useGrupoFilter = Number.isFinite(grupoIdQ) && grupoIdQ > 0;
    if (useGrupoFilter) {
      const gRows = await query(
        `SELECT id FROM grupos WHERE id = ? AND colegio_id = ? AND anio = ? LIMIT 1`,
        [grupoIdQ, colegio_id, anio]
      );
      if (!gRows || gRows.length === 0) {
        return res.status(400).json({
          error: 'El grado seleccionado no es válido para el año lectivo o no pertenece a este colegio.'
        });
      }
    }

    const grupoAndSql = useGrupoFilter ? ' AND g.id = ?' : '';
    const baseMatriculaParams = () => {
      const p = [colegio_id, anio];
      if (useGrupoFilter) p.push(grupoIdQ);
      p.push(colegio_id);
      return p;
    };

    const nombreAlumno = (r) =>
      [r.apellido_paterno, r.apellido_materno, r.nombres].filter(Boolean).join(' ').trim() || '—';
    const etiquetaGrado = (r) => {
      const sec = (r.seccion || '').toString().trim();
      const g = r.grado != null && r.grado !== '' ? `${r.grado}°` : '';
      return [g, sec].filter(Boolean).join(' ') || '—';
    };
    const tituloAgrupacion = (r) =>
      `${String(r.nivel_nombre || '').toUpperCase()} — ${r.grado}° grado`;

    const sortFilas = (a, b) => {
      const nid = (parseInt(a.nivel_id, 10) || 0) - (parseInt(b.nivel_id, 10) || 0);
      if (nid !== 0) return nid;
      const gd = (parseInt(a.grado, 10) || 0) - (parseInt(b.grado, 10) || 0);
      if (gd !== 0) return gd;
      const sec = String(a.seccion || '').localeCompare(String(b.seccion || ''), 'es', { sensitivity: 'base' });
      if (sec !== 0) return sec;
      const ap = String(a.apellido_paterno || '').localeCompare(String(b.apellido_paterno || ''), 'es', { sensitivity: 'base' });
      if (ap !== 0) return ap;
      const am = String(a.apellido_materno || '').localeCompare(String(b.apellido_materno || ''), 'es', { sensitivity: 'base' });
      if (am !== 0) return am;
      return String(a.nombres || '').localeCompare(String(b.nombres || ''), 'es', { sensitivity: 'base' });
    };

    const sortFilasLuegoConcepto = (a, b) => {
      const base = sortFilas(a, b);
      if (base !== 0) return base;
      return (parseInt(a.concepto_orden, 10) || 0) - (parseInt(b.concepto_orden, 10) || 0);
    };

    const nombresMesPension = [
      '',
      'Enero',
      'Febrero',
      'Marzo',
      'Abril',
      'Mayo',
      'Junio',
      'Julio',
      'Agosto',
      'Septiembre',
      'Octubre',
      'Noviembre',
      'Diciembre'
    ];

    const etiquetaConceptoPension = (nroPago) => {
      const indiceMes = 2 + nroPago;
      const nom =
        indiceMes <= 12 ? nombresMesPension[indiceMes] || `Mes ${nroPago}` : `Mes ${nroPago}`;
      return `Mensualidad ${nom}`;
    };

    const telefonosPorAlumno = async (alumnoIds) => {
      const map = {};
      const uniq = [...new Set((alumnoIds || []).filter((id) => id != null))];
      if (uniq.length === 0) return map;
      const ph = uniq.map(() => '?').join(',');
      const trows = await query(
        `SELECT f.alumno_id, f.id AS familia_id,
            COALESCE(NULLIF(TRIM(ap.telefono_celular), ''), NULLIF(TRIM(ap.telefono_fijo), ''), '') AS telefono
         FROM familias f
         INNER JOIN apoderados ap ON ap.id = f.apoderado_id AND ap.colegio_id = ?
         WHERE f.alumno_id IN (${ph})
         ORDER BY f.alumno_id ASC, f.id ASC`,
        [colegio_id, ...uniq]
      );
      for (const tr of trows || []) {
        const aid = tr.alumno_id;
        const tel = String(tr.telefono || '').trim();
        if (map[aid] == null || map[aid] === '') map[aid] = tel;
      }
      return map;
    };

    const baseMatriculasSql = `
      FROM matriculas m
      INNER JOIN grupos g ON g.id = m.grupo_id
      INNER JOIN niveles n ON n.id = g.nivel_id
      INNER JOIN costos c ON c.id = m.costo_id
      INNER JOIN alumnos a ON a.id = m.alumno_id
      WHERE m.colegio_id = ? AND g.anio = ?${grupoAndSql} AND (m.estado = 0)
        AND EXISTS (
          SELECT 1 FROM pagos p
          WHERE p.matricula_id = m.id AND p.colegio_id = ? AND p.estado = 'ACTIVO'
            AND p.tipo = 0 AND p.estado_pago = 'CANCELADO'
        )`;

    const todos = String(tipoRaw || '').toLowerCase() === 'todos';

    if (todos) {
      const nombreConcepto = 'Todos los conceptos (saldo total pendiente)';
      const matRows = await query(
        `SELECT m.id AS matricula_id, m.alumno_id, m.grupo_id,
            a.nombres, a.apellido_paterno, a.apellido_materno,
            g.grado, g.seccion, n.nombre AS nivel_nombre, n.id AS nivel_id,
            c.matricula AS costo_matricula, c.pension AS costo_pension
         ${baseMatriculasSql}`,
        baseMatriculaParams()
      );
      if (!matRows || matRows.length === 0) {
        return res.json({
          colegio_nombre: colegioNombre,
          anio,
          moneda,
          concepto: nombreConcepto,
          total_alumnos_unicos: 0,
          filas: []
        });
      }
      const matIds = matRows.map((r) => r.matricula_id);
      const ph = matIds.map(() => '?').join(',');
      const detRows = await query(
        `SELECT p.matricula_id, p.tipo, COALESCE(p.nro_pago, 0) AS nro_pago,
            COALESCE(SUM(p.monto), 0) AS total
         FROM pagos p
         WHERE p.colegio_id = ? AND p.estado = 'ACTIVO' AND p.estado_pago = 'CANCELADO'
           AND p.matricula_id IN (${ph})
           AND (p.tipo = 0 OR (p.tipo = 1 AND p.nro_pago >= 1 AND p.nro_pago <= ? AND ${ANIO_PAGO_SQL}))
         GROUP BY p.matricula_id, p.tipo, p.nro_pago`,
        [colegio_id, ...matIds, totalPensiones, anio, anio]
      );
      const pagosPorMatricula = {};
      for (const row of detRows || []) {
        const mid = row.matricula_id;
        if (!pagosPorMatricula[mid]) pagosPorMatricula[mid] = { t0: 0, pens: {} };
        const t = parseInt(row.tipo, 10);
        const tot = parseFloat(row.total || 0);
        if (t === 0) pagosPorMatricula[mid].t0 = tot;
        else if (t === 1) {
          const np = parseInt(row.nro_pago, 10);
          if (np >= 1 && np <= totalPensiones) pagosPorMatricula[mid].pens[np] = tot;
        }
      }

      const filasRaw = [];
      for (const mr of matRows) {
        const pm = pagosPorMatricula[mr.matricula_id] || { t0: 0, pens: {} };
        const costoMat = parseFloat(mr.costo_matricula) || 0;
        const costoPens = parseFloat(mr.costo_pension) || 0;

        const saldoMat = Math.max(0, costoMat - pm.t0);
        if (saldoMat > 0.004) {
          filasRaw.push({
            matricula_id: mr.matricula_id,
            alumno_id: mr.alumno_id,
            nombre: nombreAlumno(mr),
            grado_etiqueta: etiquetaGrado(mr),
            nivel_nombre: mr.nivel_nombre || '',
            grado_agrupacion_key: `${mr.nivel_id}|${mr.grado}`,
            grado_agrupacion_titulo: tituloAgrupacion(mr),
            nivel_id: mr.nivel_id,
            grado: mr.grado,
            seccion: mr.seccion,
            monto: Math.round(saldoMat * 100) / 100,
            concepto: 'Matrícula',
            concepto_orden: 0,
            tipo_concepto: 0,
            nro_concepto: 0,
            apellido_paterno: mr.apellido_paterno,
            apellido_materno: mr.apellido_materno,
            nombres: mr.nombres
          });
        }

        for (let i = 1; i <= totalPensiones; i += 1) {
          const pag = pm.pens[i] || 0;
          const saldoP = Math.max(0, costoPens - pag);
          if (saldoP > 0.004) {
            filasRaw.push({
              matricula_id: mr.matricula_id,
              alumno_id: mr.alumno_id,
              nombre: nombreAlumno(mr),
              grado_etiqueta: etiquetaGrado(mr),
              nivel_nombre: mr.nivel_nombre || '',
              grado_agrupacion_key: `${mr.nivel_id}|${mr.grado}`,
              grado_agrupacion_titulo: tituloAgrupacion(mr),
              nivel_id: mr.nivel_id,
              grado: mr.grado,
              seccion: mr.seccion,
              monto: Math.round(saldoP * 100) / 100,
              concepto: etiquetaConceptoPension(i),
              concepto_orden: i,
              tipo_concepto: 1,
              nro_concepto: i,
              apellido_paterno: mr.apellido_paterno,
              apellido_materno: mr.apellido_materno,
              nombres: mr.nombres
            });
          }
        }
      }
      filasRaw.sort(sortFilasLuegoConcepto);
      const telMap = await telefonosPorAlumno(filasRaw.map((f) => f.alumno_id));
      let filas = filasRaw.map((f) => {
        const { concepto_orden, ...rest } = f;
        return {
          ...rest,
          telefono_apoderado: telMap[f.alumno_id] || ''
        };
      });
      const merged = await mergeObservacionesTutor(query, colegio_id, filas);
      filas = merged.map(({ tipo_concepto: _tc, nro_concepto: _nc, observaciones, ...r }) => ({
        ...r,
        detalle: observaciones != null ? String(observaciones) : ''
      }));
      const idsAlumno = new Set((filasRaw || []).map((f) => f.alumno_id));
      return res.json({
        colegio_nombre: colegioNombre,
        anio,
        moneda,
        concepto: nombreConcepto,
        total_alumnos_unicos: idsAlumno.size,
        filas
      });
    }

    const tipoParam = parseInt(tipoRaw, 10);
    if (isNaN(tipoParam) || tipoParam < 0) {
      return res.status(400).json({
        error: 'Parámetro tipo inválido (0=matrícula, 1..N=pensión, o todos)'
      });
    }

    let conceptoNombre = 'Matrícula';
    let rows;

    if (tipoParam === 0) {
      rows = await query(
        `SELECT m.id AS matricula_id, m.alumno_id, m.grupo_id,
            a.nombres, a.apellido_paterno, a.apellido_materno,
            g.grado, g.seccion, n.nombre AS nivel_nombre, n.id AS nivel_id,
            c.matricula AS tarifa,
            COALESCE((
              SELECT SUM(p.monto) FROM pagos p
              WHERE p.matricula_id = m.id AND p.colegio_id = ? AND p.estado = 'ACTIVO'
                AND p.estado_pago = 'CANCELADO' AND p.tipo = 0
            ), 0) AS pagado
         ${baseMatriculasSql}`,
        [colegio_id, ...baseMatriculaParams()]
      );
    } else {
      const nroPago = tipoParam;
      if (nroPago < 1 || nroPago > totalPensiones) {
        return res.json({
          colegio_nombre: colegioNombre,
          anio,
          moneda,
          concepto: `Mes ${nroPago}`,
          total_alumnos_unicos: 0,
          filas: []
        });
      }
      const nombresMes = [
        '',
        'Enero',
        'Febrero',
        'Marzo',
        'Abril',
        'Mayo',
        'Junio',
        'Julio',
        'Agosto',
        'Septiembre',
        'Octubre',
        'Noviembre',
        'Diciembre'
      ];
      const indiceMes = 2 + nroPago;
      conceptoNombre =
        indiceMes <= 12 ? nombresMes[indiceMes] || `Mes ${nroPago}` : `Mes ${nroPago}`;
      rows = await query(
        `SELECT m.id AS matricula_id, m.alumno_id, m.grupo_id,
            a.nombres, a.apellido_paterno, a.apellido_materno,
            g.grado, g.seccion, n.nombre AS nivel_nombre, n.id AS nivel_id,
            c.pension AS tarifa,
            COALESCE((
              SELECT SUM(p.monto) FROM pagos p
              WHERE p.matricula_id = m.id AND p.colegio_id = ? AND p.estado = 'ACTIVO'
                AND p.estado_pago = 'CANCELADO' AND p.tipo = 1 AND p.nro_pago = ? AND ${ANIO_PAGO_SQL}
            ), 0) AS pagado
         ${baseMatriculasSql}`,
        [colegio_id, nroPago, anio, anio, ...baseMatriculaParams()]
      );
    }

    const etiquetaFilaUnica =
      tipoParam === 0 ? 'Matrícula' : `Mensualidad ${conceptoNombre}`;

    const filasRaw = (rows || [])
      .map((r) => {
        const tarifa = parseFloat(r.tarifa) || 0;
        const pagado = parseFloat(r.pagado) || 0;
        const saldo = Math.max(0, tarifa - pagado);
        return {
          matricula_id: r.matricula_id,
          alumno_id: r.alumno_id,
          nombre: nombreAlumno(r),
          grado_etiqueta: etiquetaGrado(r),
          nivel_nombre: r.nivel_nombre || '',
          grado_agrupacion_key: `${r.nivel_id}|${r.grado}`,
          grado_agrupacion_titulo: tituloAgrupacion(r),
          nivel_id: r.nivel_id,
          grado: r.grado,
          seccion: r.seccion,
          monto: Math.round(saldo * 100) / 100,
          concepto: etiquetaFilaUnica,
          tipo_concepto: tipoParam === 0 ? 0 : 1,
          nro_concepto: tipoParam === 0 ? 0 : tipoParam,
          apellido_paterno: r.apellido_paterno,
          apellido_materno: r.apellido_materno,
          nombres: r.nombres,
          _saldo: saldo
        };
      })
      .filter((f) => f._saldo > 0.004);
    filasRaw.sort(sortFilas);
    const telMap = await telefonosPorAlumno(filasRaw.map((f) => f.alumno_id));
    let filas = filasRaw.map(({ _saldo, ...f }) => ({
      ...f,
      telefono_apoderado: telMap[f.alumno_id] || ''
    }));
    const merged = await mergeObservacionesTutor(query, colegio_id, filas);
    filas = merged.map(({ tipo_concepto: _tc, nro_concepto: _nc, observaciones, ...r }) => ({
      ...r,
      detalle: observaciones != null ? String(observaciones) : ''
    }));
    const idsAlumno = new Set(filas.map((f) => f.alumno_id));

    return res.json({
      colegio_nombre: colegioNombre,
      anio,
      moneda,
      concepto: tipoParam === 0 ? 'Matrícula' : conceptoNombre,
      total_alumnos_unicos: idsAlumno.size,
      filas
    });
  } catch (error) {
    console.error('Error lista deudores:', error);
    res.status(500).json({ error: 'Error al obtener la lista de deudores' });
  }
});

/**
 * GET /api/admin/configuracion
 * Obtener configuración del colegio
 */
router.get('/configuracion', async (req, res) => {
  try {
    const { colegio_id } = req.user;

    // Obtener datos del colegio
    const colegio = await query(
      `SELECT 
        titulo_intranet,
        codigo_modular,
        resolucion_creacion,
        ugel_codigo,
        ugel_nombre,
        anio_activo,
        anio_matriculas,
        ciclo_pensiones,
        inicio_pensiones,
        total_pensiones,
        moneda,
        monto_adicional,
        ciclo_notas,
        inicio_notas,
        total_notas,
        rangos_ciclos_notas,
        rangos_mensajes,
        rangos_letras_primaria,
        pensiones_vencimiento,
        dias_tolerancia,
        ruc,
        razon_social,
        direccion,
        comision_tarjeta_debito,
        comision_tarjeta_credito,
        clave_bloques,
        bloquear_deudores,
        bloquear_deudores_hasta_mes
      FROM colegios 
      WHERE id = ?`,
      [colegio_id]
    );

    if (colegio.length === 0) {
      return res.status(404).json({ error: 'Colegio no encontrado' });
    }

    const colegioData = colegio[0];

    // Debug: verificar valores numéricos de la base de datos
    console.log('=== DEBUG inicio_pensiones ===');
    console.log('Tipo de dato:', typeof colegioData.inicio_pensiones);
    console.log('Valor raw:', colegioData.inicio_pensiones);
    console.log('Valor como número:', Number(colegioData.inicio_pensiones));
    console.log('Valor parseado:', parseInt(colegioData.inicio_pensiones, 10));

    // Debug: verificar qué se está recibiendo de la base de datos
    console.log('=== DEBUG rangos_letras_primaria ===');
    console.log('Tipo de dato:', typeof colegioData.rangos_letras_primaria);
    console.log('Valor raw:', colegioData.rangos_letras_primaria);
    console.log('Es null?', colegioData.rangos_letras_primaria === null);
    console.log('Es undefined?', colegioData.rangos_letras_primaria === undefined);
    console.log('Es string vacío?', colegioData.rangos_letras_primaria === '');
    console.log('Longitud:', colegioData.rangos_letras_primaria ? colegioData.rangos_letras_primaria.length : 'N/A');

    // Obtener configuraciones adicionales de la tabla config
    // Nota: La tabla config no tiene colegio_id, es global
    const configs = await query(
      `SELECT clave, valor FROM config`
    );

    const configMap = {};
    configs.forEach(c => {
      configMap[c.clave] = c.valor;
    });

    // Deserializar campos serializados
    let rangosMensajes = [];
    if (colegioData.rangos_mensajes) {
      try {
        const deserialized = phpSerialize.unserialize(Buffer.from(colegioData.rangos_mensajes, 'base64'));
        rangosMensajes = Array.isArray(deserialized) ? deserialized : [];
      } catch (e) {
        console.warn('Error deserializando rangos_mensajes:', e);
      }
    }

    let rangosLetrasPrimaria = [];
    if (colegioData.rangos_letras_primaria && colegioData.rangos_letras_primaria !== '' && colegioData.rangos_letras_primaria !== null) {
      try {
        // El campo es TEXT en MySQL, así que viene como string
        // El sistema PHP guarda como base64_encode(serialize(...))
        // Necesitamos decodificar base64 y luego deserializar
        const base64String = colegioData.rangos_letras_primaria;
        const buffer = Buffer.from(base64String, 'base64');
        const deserialized = phpSerialize.unserialize(buffer);
        
        // PHP puede deserializar arrays asociativos como objetos en JavaScript
        // Necesitamos convertir el objeto a array si es necesario
        if (Array.isArray(deserialized)) {
          rangosLetrasPrimaria = deserialized;
        } else if (typeof deserialized === 'object' && deserialized !== null) {
          // Convertir objeto a array (puede tener claves numéricas)
          rangosLetrasPrimaria = Object.values(deserialized);
          console.log('⚠️ Convertido de objeto a array');
        } else {
          console.warn('⚠️ rangos_letras_primaria deserializado pero no es array ni objeto:', typeof deserialized);
          rangosLetrasPrimaria = [];
        }
        
        console.log('✅ rangos_letras_primaria deserializado exitosamente');
        console.log('Cantidad de rangos:', rangosLetrasPrimaria.length);
        console.log('Datos:', JSON.stringify(rangosLetrasPrimaria, null, 2));
      } catch (e) {
        console.error('❌ Error deserializando rangos_letras_primaria:', e.message);
        console.error('Stack:', e.stack);
        console.log('Valor original (primeros 200 chars):', 
          typeof colegioData.rangos_letras_primaria === 'string' 
            ? colegioData.rangos_letras_primaria.substring(0, 200) 
            : 'No es string');
      }
    } else {
      console.log('⚠️ rangos_letras_primaria está vacío, null o undefined');
    }

    let rangosCiclosNotas = {};
    if (colegioData.rangos_ciclos_notas) {
      try {
        // rangos_ciclos_notas está serializado con PHP serialize(), no JSON
        const deserialized = phpSerialize.unserialize(colegioData.rangos_ciclos_notas);
        rangosCiclosNotas = deserialized || {};
      } catch (e) {
        console.warn('Error deserializando rangos_ciclos_notas:', e);
        // Intentar como JSON por si acaso
        try {
          rangosCiclosNotas = JSON.parse(colegioData.rangos_ciclos_notas);
        } catch (e2) {
          console.warn('Error parseando rangos_ciclos_notas como JSON:', e2);
        }
      }
    }

    let pensionesVencimiento = {};
    if (colegioData.pensiones_vencimiento) {
      try {
        const deserialized = phpSerialize.unserialize(Buffer.from(colegioData.pensiones_vencimiento, 'base64'));
        pensionesVencimiento = deserialized || {};
      } catch (e) {
        console.warn('Error deserializando pensiones_vencimiento:', e);
      }
    }

    // Construir URLs de imágenes
    const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
    const isProduction = process.env.NODE_ENV === 'production';
    const baseUrl = isProduction ? phpSystemUrl : 'http://localhost:5000';

    // Asegurar que inicio_pensiones e inicio_notas sean números explícitamente
    const inicioPensionesNum = Number(colegioData.inicio_pensiones) || 1;
    const inicioNotasNum = Number(colegioData.inicio_notas) || 1;
    
    console.log('=== VALORES FINALES ENVIADOS AL FRONTEND ===');
    console.log('inicio_pensiones:', inicioPensionesNum, 'tipo:', typeof inicioPensionesNum);
    console.log('inicio_notas:', inicioNotasNum, 'tipo:', typeof inicioNotasNum);
    
    // Separar colegioData para evitar sobrescribir valores
    const { inicio_pensiones: _, inicio_notas: __, ...restColegioData } = colegioData;
    
    res.json({
      ...restColegioData,
      inicio_pensiones: inicioPensionesNum, // Forzar como número
      inicio_notas: inicioNotasNum, // Forzar como número
      rangos_mensajes: rangosMensajes,
      rangos_letras_primaria: rangosLetrasPrimaria,
      rangos_ciclos_notas: rangosCiclosNotas,
      pensiones_vencimiento: pensionesVencimiento,
      texto_intranet: configMap['texto_intranet'] || '',
      titulo_formulario_matricula: configMap['titulo_formulario_matricula'] || '',
      recaudo_nro_sucursal: configMap['recaudo_nro_sucursal'] || '',
      recaudo_nro_cuenta: configMap['recaudo_nro_cuenta'] || '',
      recaudo_razon_social: configMap['recaudo_razon_social'] || '',
      email_notificacion_matricula_online: configMap['email_notificacion_matricula_online'] || '',
      remitente_emails: configMap['remitente_emails'] || '',
      email_matricula_apoderado: configMap['email_matricula_apoderado'] || '',
      email_matricula_interno: configMap['email_matricula_interno'] || '',
      email_matricula_interno_asunto: configMap['email_matricula_interno_asunto'] || '',
      link_consulta_facturas: configMap['link_consulta_facturas'] || '',
      show_birthday_window: configMap['show_birthday_window'] || 'NO',
      cumpleanos_plantilla_push: configMap['cumpleanos_plantilla_push'] || '',
      cumpleanos_plantilla_ventana: configMap['cumpleanos_plantilla_ventana'] || '',
      cumpleanos_plantilla_correo_asunto: configMap['cumpleanos_plantilla_correo_asunto'] || '',
      cumpleanos_plantilla_correo_cuerpo: configMap['cumpleanos_plantilla_correo_cuerpo'] || '',
      cumpleanos_plantilla_mensaje_sistema: configMap['cumpleanos_plantilla_mensaje_sistema'] || '',
      enable_enrollment_form: configMap['enable_enrollment_form'] || 'NO',
      login_fondo: colegioData.login_background ? `${baseUrl}/Static/Image/Fondos/${colegioData.login_background}` : null,
      libreta_logo: configMap['libreta_logo'] ? `${baseUrl}/Static/Image/Fondos/${configMap['libreta_logo']}` : null,
      libreta_fondo: configMap['libreta_fondo'] ? `${baseUrl}/Static/Image/Fondos/${configMap['libreta_fondo']}` : null,
      boleta_logo: configMap['boleta_logo'] ? `${baseUrl}/Static/Archivos/${configMap['boleta_logo']}` : null,
      regla_conducta: (() => {
        try {
          if (configMap.regla_conducta) {
            const parsed = typeof configMap.regla_conducta === 'string'
              ? JSON.parse(configMap.regla_conducta)
              : configMap.regla_conducta;
            return normalizarReglaConducta(parsed);
          }
        } catch (_) { /* defaults */ }
        return { ...REGLA_CONDUCTA_DEFAULT };
      })(),
    });
  } catch (error) {
    console.error('Error obteniendo configuración:', error);
    res.status(500).json({ error: 'Error al obtener configuración' });
  }
});

async function anioActivoColegio(colegioId) {
  const rows = await query(`SELECT anio_activo FROM colegios WHERE id = ? LIMIT 1`, [colegioId]);
  return parseInt(rows[0]?.anio_activo, 10) || 0;
}

/**
 * GET /api/admin/configuracion/estructura-temas
 */
router.get('/configuracion/estructura-temas', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const anio = await anioActivoColegio(colegio_id);
    if (!anio) return res.status(400).json({ error: 'No hay año activo configurado' });
    const estructura = await obtenerConfigEstructura(colegio_id, anio);
    res.json({ estructura });
  } catch (error) {
    console.error('Error obteniendo estructura de temas:', error);
    res.status(500).json({ error: 'Error al obtener la estructura de temas' });
  }
});

/**
 * PUT /api/admin/configuracion/estructura-temas
 */
router.put('/configuracion/estructura-temas', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const anio = await anioActivoColegio(colegio_id);
    if (!anio) return res.status(400).json({ error: 'No hay año activo configurado' });
    const estructura = await guardarConfigEstructura(colegio_id, anio, req.body || {});
    res.json({ success: true, estructura });
  } catch (error) {
    console.error('Error guardando estructura de temas:', error);
    const msg = error.code === 'ER_NO_SUCH_TABLE'
      ? 'Falta aplicar la migración 083_aula_estructura_temas_mysql.sql'
      : 'Error al guardar la estructura de temas';
    res.status(500).json({ error: msg });
  }
});

/**
 * POST /api/admin/configuracion/estructura-temas/aplicar
 * Completa huecos vacíos en todas las asignaturas del año activo. No pisa archivos.
 */
router.post('/configuracion/estructura-temas/aplicar', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const anio = await anioActivoColegio(colegio_id);
    if (!anio) return res.status(400).json({ error: 'No hay año activo configurado' });
    const resultado = await aplicarEstructuraColegio({ colegioId: colegio_id, anio });
    res.json({ success: true, ...resultado });
  } catch (error) {
    console.error('Error aplicando estructura de temas:', error);
    if (error.code === 'ESTRUCTURA_NO_MIGRADA' || error.code === 'ER_NO_SUCH_TABLE') {
      return res.status(400).json({ error: 'Falta aplicar la migración 083_aula_estructura_temas_mysql.sql' });
    }
    res.status(500).json({ error: 'Error al aplicar la estructura' });
  }
});

/**
 * PUT /api/admin/configuracion
 * Guardar configuración del colegio
 */
router.put('/configuracion', uploadConfig.fields([
  { name: 'login_fondo', maxCount: 1 },
  { name: 'libreta_logo', maxCount: 1 },
  { name: 'libreta_fondo', maxCount: 1 },
  { name: 'boleta_logo', maxCount: 1 }
]), async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const body = req.body;

    // Preparar datos para actualizar en colegios
    const updateFields = [];
    const updateValues = [];

    // Campos directos de colegios
    const colegioFields = [
      'titulo_intranet', 'codigo_modular', 'resolucion_creacion', 'ugel_codigo', 'ugel_nombre',
      'anio_activo', 'anio_matriculas', 'ciclo_pensiones', 'inicio_pensiones', 'total_pensiones',
      'moneda', 'monto_adicional', 'ciclo_notas', 'inicio_notas', 'total_notas',
      'dias_tolerancia', 'ruc', 'razon_social', 'direccion',
      'comision_tarjeta_debito', 'comision_tarjeta_credito', 'clave_bloques', 'bloquear_deudores',
      'bloquear_deudores_hasta_mes'
    ];

    colegioFields.forEach(field => {
      if (body[field] !== undefined) {
        let value = body[field];

        if (field === 'bloquear_deudores_hasta_mes') {
          if (value === '' || value === null || value === 'null' || value === undefined) {
            value = null;
          } else {
            const numValue = parseInt(value, 10);
            value = !Number.isNaN(numValue) && numValue >= 0 && numValue <= 11 ? numValue : null;
          }
        } else {
          // Campos numéricos que deben ser números
          const numericFields = ['inicio_pensiones', 'inicio_notas', 'total_pensiones', 'total_notas', 
                                'ciclo_pensiones', 'ciclo_notas', 'monto_adicional', 'dias_tolerancia',
                                'comision_tarjeta_debito', 'comision_tarjeta_credito', 'anio_activo', 'anio_matriculas'];
          
          if (numericFields.includes(field)) {
            // Convertir a número explícitamente
            const numValue = Number(value);
            if (!isNaN(numValue)) {
              value = numValue;
              console.log(`🔧 Campo numérico ${field}: valor recibido "${body[field]}", convertido a ${value} (tipo: ${typeof value})`);
            } else {
              console.warn(`⚠️ Campo numérico ${field}: valor "${body[field]}" no es un número válido, usando valor original`);
            }
          }
        }
        
        updateFields.push(`${field} = ?`);
        updateValues.push(value);
      }
    });
    
    // Debug: verificar valores de inicio_pensiones e inicio_notas antes de guardar
    if (body.inicio_pensiones !== undefined) {
      console.log('=== DEBUG GUARDAR inicio_pensiones ===');
      console.log('Valor recibido en body:', body.inicio_pensiones, 'tipo:', typeof body.inicio_pensiones);
      const fieldIndex = updateFields.findIndex(f => f.includes('inicio_pensiones'));
      if (fieldIndex >= 0) {
        const finalValue = updateValues[fieldIndex];
        console.log('Valor final que se guardará:', finalValue, 'tipo:', typeof finalValue);
        console.log('Mes correspondiente:', ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][finalValue - 1] || 'INVÁLIDO');
      }
    }
    if (body.inicio_notas !== undefined) {
      console.log('=== DEBUG GUARDAR inicio_notas ===');
      console.log('Valor recibido en body:', body.inicio_notas, 'tipo:', typeof body.inicio_notas);
      const fieldIndex = updateFields.findIndex(f => f.includes('inicio_notas'));
      if (fieldIndex >= 0) {
        const finalValue = updateValues[fieldIndex];
        console.log('Valor final que se guardará:', finalValue, 'tipo:', typeof finalValue);
        console.log('Mes correspondiente:', ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][finalValue - 1] || 'INVÁLIDO');
      }
    }

    // Serializar rangos_ciclos_notas (PHP serialize, no JSON)
    if (body.rangos_ciclos_notas) {
      let rangosData = body.rangos_ciclos_notas;
      // Si viene como string JSON, parsearlo primero
      if (typeof rangosData === 'string') {
        try {
          rangosData = JSON.parse(rangosData);
        } catch (e) {
          console.warn('Error parseando rangos_ciclos_notas del body:', e);
        }
      }
      const serialized = phpSerialize.serialize(rangosData);
      updateFields.push('rangos_ciclos_notas = ?');
      updateValues.push(serialized);
    }

    // Serializar rangos_mensajes
    if (body.rangos_mensajes) {
      let rangosMensajesData = body.rangos_mensajes;
      // Si viene como string JSON, parsearlo primero
      if (typeof rangosMensajesData === 'string') {
        try {
          rangosMensajesData = JSON.parse(rangosMensajesData);
        } catch (e) {
          console.warn('Error parseando rangos_mensajes del body:', e);
        }
      }
      const serialized = phpSerialize.serialize(rangosMensajesData);
      updateFields.push('rangos_mensajes = ?');
      updateValues.push(Buffer.from(serialized).toString('base64'));
    }

    // Serializar rangos_letras_primaria
    if (body.rangos_letras_primaria) {
      let rangosLetrasData = body.rangos_letras_primaria;
      // Si viene como string JSON, parsearlo primero
      if (typeof rangosLetrasData === 'string') {
        try {
          rangosLetrasData = JSON.parse(rangosLetrasData);
        } catch (e) {
          console.warn('Error parseando rangos_letras_primaria del body:', e);
        }
      }
      const serialized = phpSerialize.serialize(rangosLetrasData);
      updateFields.push('rangos_letras_primaria = ?');
      updateValues.push(Buffer.from(serialized).toString('base64'));
    }

    // Serializar pensiones_vencimiento
    if (body.pensiones_vencimiento) {
      let pensionesData = body.pensiones_vencimiento;
      // Si viene como string JSON, parsearlo primero
      if (typeof pensionesData === 'string') {
        try {
          pensionesData = JSON.parse(pensionesData);
        } catch (e) {
          console.warn('Error parseando pensiones_vencimiento del body:', e);
        }
      }
      const serialized = phpSerialize.serialize(pensionesData);
      updateFields.push('pensiones_vencimiento = ?');
      updateValues.push(Buffer.from(serialized).toString('base64'));
    }

    // Manejar archivos subidos
    if (req.files) {
      if (req.files.login_fondo && req.files.login_fondo[0]) {
        updateFields.push('login_background = ?');
        updateValues.push(req.files.login_fondo[0].filename);
      }
    }

    // Actualizar colegio
    if (updateFields.length > 0) {
      updateValues.push(colegio_id);
      await execute(
        `UPDATE colegios SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );
    }

    // Actualizar tabla config
    const configFields = [
      'texto_intranet', 'titulo_formulario_matricula', 'recaudo_nro_sucursal',
      'recaudo_nro_cuenta', 'recaudo_razon_social', 'email_notificacion_matricula_online',
      'remitente_emails', 'email_matricula_apoderado', 'email_matricula_interno', 'email_matricula_interno_asunto', 'link_consulta_facturas',
      'show_birthday_window',
      'cumpleanos_plantilla_push',
      'cumpleanos_plantilla_ventana',
      'cumpleanos_plantilla_correo_asunto',
      'cumpleanos_plantilla_correo_cuerpo',
      'cumpleanos_plantilla_mensaje_sistema',
      'enable_enrollment_form'
    ];

    for (const field of configFields) {
      if (body[field] !== undefined) {
        let valor = body[field];
        if (field === 'email_matricula_apoderado' && valor != null) {
          valor = normalizarUrlsImagenesEnHtml(String(valor));
        }
        if (field === 'email_matricula_interno' && valor != null) {
          valor = normalizarUrlsImagenesEnHtml(String(valor));
        }
        // Verificar si existe
        const existing = await query(
          `SELECT id FROM config WHERE clave = ?`,
          [field]
        );

        if (existing.length > 0) {
          await execute(
            `UPDATE config SET valor = ? WHERE clave = ?`,
            [valor, field]
          );
        } else {
          await execute(
            `INSERT INTO config (clave, valor) VALUES (?, ?)`,
            [field, valor]
          );
        }
      }
    }

    // Manejar archivos de config
    if (req.files) {
      if (req.files.libreta_logo && req.files.libreta_logo[0]) {
        const existing = await query(`SELECT id FROM config WHERE clave = 'libreta_logo'`);
        if (existing.length > 0) {
          await execute(`UPDATE config SET valor = ? WHERE clave = 'libreta_logo'`, [req.files.libreta_logo[0].filename]);
        } else {
          await execute(`INSERT INTO config (clave, valor) VALUES ('libreta_logo', ?)`, [req.files.libreta_logo[0].filename]);
        }
      }

      if (req.files.libreta_fondo && req.files.libreta_fondo[0]) {
        const existing = await query(`SELECT id FROM config WHERE clave = 'libreta_fondo'`);
        if (existing.length > 0) {
          await execute(`UPDATE config SET valor = ? WHERE clave = 'libreta_fondo'`, [req.files.libreta_fondo[0].filename]);
        } else {
          await execute(`INSERT INTO config (clave, valor) VALUES ('libreta_fondo', ?)`, [req.files.libreta_fondo[0].filename]);
        }
      }

      if (req.files.boleta_logo && req.files.boleta_logo[0]) {
        const boletaLogoPath = '/home/vanguard/intranet2026/backend/Static/Archivos';
        if (!fs.existsSync(boletaLogoPath)) {
          fs.mkdirSync(boletaLogoPath, { recursive: true });
        }
        const boletaLogoFile = path.join(boletaLogoPath, req.files.boleta_logo[0].filename);
        fs.renameSync(req.files.boleta_logo[0].path, boletaLogoFile);

        const existing = await query(`SELECT id FROM config WHERE clave = 'boleta_logo'`);
        if (existing.length > 0) {
          await execute(`UPDATE config SET valor = ? WHERE clave = 'boleta_logo'`, [req.files.boleta_logo[0].filename]);
        } else {
          await execute(`INSERT INTO config (clave, valor) VALUES ('boleta_logo', ?)`, [req.files.boleta_logo[0].filename]);
        }
      }
    }

    let conductaRecalc = null;
    if (body.regla_conducta !== undefined) {
      let rawRegla = body.regla_conducta;
      if (typeof rawRegla === 'string') {
        try {
          rawRegla = JSON.parse(rawRegla);
        } catch {
          rawRegla = {};
        }
      }
      const reglaGuardada = await guardarReglaConducta(query, execute, rawRegla);
      try {
        const anioRows = await query(`SELECT anio_activo FROM colegios WHERE id = ? LIMIT 1`, [colegio_id]);
        const anio = anioRows?.[0]?.anio_activo || new Date().getFullYear();
        conductaRecalc = await recalcularConductaColegioAnio(query, execute, {
          colegio_id,
          anio,
        });
        conductaRecalc.anio = anio;
        conductaRecalc.texto_regla = textoReglaConducta(reglaGuardada);
      } catch (eRecalc) {
        console.error('[config] recálculo conducta:', eRecalc);
        conductaRecalc = {
          error: eRecalc.message || 'No se pudieron recalcular las notas',
          regla: reglaGuardada,
        };
      }
    }

    res.json({
      success: true,
      message: 'Configuración guardada correctamente',
      conducta_recalculada: conductaRecalc,
    });
  } catch (error) {
    console.error('Error guardando configuración:', error);
    res.status(500).json({ error: 'Error al guardar configuración' });
  }
});

/**
 * POST /api/admin/configuracion/reiniciar-accesos
 * Reiniciar accesos de alumnos y apoderados
 */
// --- Avatares por bimestre (avatar_bases, avatar_accesorios) ---
const avatarsDir = path.join(__dirname, '..', 'Static', 'Image', 'Avatars');
try {
  if (!fs.existsSync(avatarsDir)) {
    fs.mkdirSync(avatarsDir, { recursive: true });
  }
} catch (e) {
  console.warn('No se pudo crear carpeta Avatars:', e.message);
}

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir, { recursive: true });
    cb(null, avatarsDir);
  },
  filename: (req, file, cb) => {
    const safe = (file.originalname || 'img').replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `avatar-${Date.now()}-${safe}`);
  }
});
const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB (ilustraciones/PNG de avatares pueden ser pesados)
  fileFilter: (req, file, cb) => {
    const ok = /\.(png|jpg|jpeg)$/i.test(file.originalname || '') && /image\/(png|jpeg|jpg)/.test(file.mimetype);
    if (ok) cb(null, true);
    else cb(new Error('Solo imágenes PNG/JPG'));
  }
});

const uploadAvatarDosImagenes = multer({
  storage: avatarStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(png|jpg|jpeg)$/i.test(file.originalname || '') && /image\/(png|jpeg|jpg)/.test(file.mimetype);
    if (ok) cb(null, true);
    else cb(new Error('Solo imágenes PNG/JPG'));
  }
}).fields([{ name: 'imagen_accesorio', maxCount: 1 }, { name: 'imagen_combinada', maxCount: 1 }]);

/** URL base para imágenes de avatares: usar ruta /api/static/avatars (siempre llega al Node que tiene los archivos) */
function getAvataresBaseUrl(req) {
  if (process.env.NODE_ENV !== 'production') {
    return 'http://localhost:5000/api/static/avatars';
  }
  const host = req.get('x-forwarded-host') || req.get('host');
  let protocol = req.get('x-forwarded-proto') || req.protocol;
  if (!protocol || protocol === 'http') protocol = 'https';
  if (host) return `${protocol}://${host}/api/static/avatars`;
  const fallback = process.env.API_PUBLIC_URL || process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
  return fallback.replace(/\/$/, '') + '/api/static/avatars';
}

/** GET /api/admin/avatares/bases - Listar todas las bases */
router.get('/avatares/bases', async (req, res) => {
  try {
    const bases = await query('SELECT * FROM avatar_bases ORDER BY bimestre, sexo, orden, id');
    const baseUrl = getAvataresBaseUrl(req);
    const list = (bases || []).map(b => ({
      ...b,
      imagen_base_url: b.imagen_base ? `${baseUrl}/${b.imagen_base}` : null
    }));
    res.json({ bases: list });
  } catch (err) {
    if (err.message && (err.message.includes("doesn't exist") || err.message.includes('avatar_bases'))) {
      return res.json({ bases: [] });
    }
    console.error('Error listando avatar_bases:', err);
    res.status(500).json({ error: 'Error al listar avatares base' });
  }
});

/** POST /api/admin/avatares/bases - Crear base (opcional: imagen_base en multipart) */
router.post('/avatares/bases', uploadAvatar.single('imagen_base'), async (req, res) => {
  try {
    const { bimestre, sexo, nombre, descripcion, historia, orden } = req.body || {};
    const bim = parseInt(bimestre, 10);
    const sx = parseInt(sexo, 10);
    if (![1, 2, 3, 4].includes(bim)) return res.status(400).json({ error: 'Bimestre debe ser 1, 2, 3 o 4' });
    if (![0, 1].includes(sx)) return res.status(400).json({ error: 'Sexo: 0=Femenino, 1=Masculino' });
    const imagen_base = (req.file && req.file.filename) ? req.file.filename : (req.body.imagen_base || '');
    const ord = parseInt(orden, 10) || 0;
    const now = fechaHoraMySQLLima();
    await execute(
      `INSERT INTO avatar_bases (bimestre, sexo, nombre, descripcion, historia, imagen_base, orden, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [bim, sx, (nombre || '').trim(), (descripcion || '').trim(), (historia || '').trim(), imagen_base, ord, now, now]
    );
    const inserted = await query('SELECT * FROM avatar_bases ORDER BY id DESC LIMIT 1');
    res.status(201).json({ base: inserted[0] });
  } catch (err) {
    console.error('Error creando avatar base:', err);
    res.status(500).json({ error: err.message || 'Error al crear avatar base' });
  }
});

/** PUT /api/admin/avatares/bases/:id - Actualizar base */
router.put('/avatares/bases/:id', uploadAvatar.single('imagen_base'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { bimestre, sexo, nombre, descripcion, historia, orden } = req.body || {};
    const existing = await query('SELECT * FROM avatar_bases WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Avatar base no encontrado' });
    const row = existing[0];
    const imagen_base = (req.file && req.file.filename) ? req.file.filename : (req.body.imagen_base !== undefined ? req.body.imagen_base : row.imagen_base);
    const bim = bimestre !== undefined ? parseInt(bimestre, 10) : row.bimestre;
    const sx = sexo !== undefined ? parseInt(sexo, 10) : row.sexo;
    const nombre_ = nombre !== undefined ? String(nombre).trim() : row.nombre;
    const descripcion_ = descripcion !== undefined ? String(descripcion).trim() : row.descripcion;
    const historia_ = historia !== undefined ? String(historia).trim() : row.historia;
    const ord = orden !== undefined ? parseInt(orden, 10) : row.orden;
    const now = fechaHoraMySQLLima();
    await execute(
      `UPDATE avatar_bases SET bimestre=?, sexo=?, nombre=?, descripcion=?, historia=?, imagen_base=?, orden=?, updated_at=? WHERE id=?`,
      [bim, sx, nombre_, descripcion_, historia_, imagen_base, ord, now, id]
    );
    const updated = await query('SELECT * FROM avatar_bases WHERE id = ?', [id]);
    res.json({ base: updated[0] });
  } catch (err) {
    console.error('Error actualizando avatar base:', err);
    res.status(500).json({ error: err.message || 'Error al actualizar' });
  }
});

/** DELETE /api/admin/avatares/bases/:id */
router.delete('/avatares/bases/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await execute('DELETE FROM avatar_bases WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error eliminando avatar base:', err);
    res.status(500).json({ error: err.message || 'Error al eliminar' });
  }
});

/** GET /api/admin/avatares/bases/:baseId/accesorios */
router.get('/avatares/bases/:baseId/accesorios', async (req, res) => {
  try {
    const baseId = parseInt(req.params.baseId, 10);
    const accesorios = await query('SELECT * FROM avatar_accesorios WHERE avatar_base_id = ? ORDER BY orden, id', [baseId]);
    const baseUrl = getAvataresBaseUrl(req);
    const list = (accesorios || []).map(a => ({
      ...a,
      imagen_accesorio_url: a.imagen_accesorio ? `${baseUrl}/${a.imagen_accesorio}` : null,
      imagen_combinada_url: a.imagen_combinada ? `${baseUrl}/${a.imagen_combinada}` : null
    }));
    res.json({ accesorios: list });
  } catch (err) {
    if (err.message && (err.message.includes("doesn't exist") || err.message.includes('avatar_accesorios'))) {
      return res.json({ accesorios: [] });
    }
    console.error('Error listando accesorios:', err);
    res.status(500).json({ error: 'Error al listar accesorios' });
  }
});

/** POST /api/admin/avatares/bases/:baseId/accesorios - Crear accesorio (imagen_accesorio = solo accesorio; imagen_combinada = personaje + accesorio) */
router.post('/avatares/bases/:baseId/accesorios', uploadAvatarDosImagenes, async (req, res) => {
  try {
    const baseId = parseInt(req.params.baseId, 10);
    const { nombre, descripcion, puntuacion_requerida, orden } = req.body || {};
    const files = req.files || {};
    const imagen_accesorio = (files.imagen_accesorio && files.imagen_accesorio[0] && files.imagen_accesorio[0].filename) ? files.imagen_accesorio[0].filename : (req.body.imagen_accesorio || '');
    const imagen_combinada = (files.imagen_combinada && files.imagen_combinada[0] && files.imagen_combinada[0].filename) ? files.imagen_combinada[0].filename : (req.body.imagen_combinada || '');
    const puntos = parseInt(puntuacion_requerida, 10) || 0;
    const ord = parseInt(orden, 10) || 0;
    const now = fechaHoraMySQLLima();
    await execute(
      `INSERT INTO avatar_accesorios (avatar_base_id, nombre, descripcion, puntuacion_requerida, imagen_accesorio, imagen_combinada, orden, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [baseId, (nombre || '').trim(), (descripcion || '').trim(), puntos, imagen_accesorio, imagen_combinada, ord, now, now]
    );
    const inserted = await query('SELECT * FROM avatar_accesorios ORDER BY id DESC LIMIT 1');
    res.status(201).json({ accesorio: inserted[0] });
  } catch (err) {
    console.error('Error creando accesorio:', err);
    res.status(500).json({ error: err.message || 'Error al crear accesorio' });
  }
});

/** PUT /api/admin/avatares/accesorios/:id */
router.put('/avatares/accesorios/:id', uploadAvatarDosImagenes, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { nombre, descripcion, puntuacion_requerida, orden } = req.body || {};
    const existing = await query('SELECT * FROM avatar_accesorios WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Accesorio no encontrado' });
    const row = existing[0];
    const files = req.files || {};
    const imagen_accesorio = (files.imagen_accesorio && files.imagen_accesorio[0] && files.imagen_accesorio[0].filename) ? files.imagen_accesorio[0].filename : (req.body.imagen_accesorio !== undefined ? req.body.imagen_accesorio : (row.imagen_accesorio || ''));
    const imagen_combinada = (files.imagen_combinada && files.imagen_combinada[0] && files.imagen_combinada[0].filename) ? files.imagen_combinada[0].filename : (req.body.imagen_combinada !== undefined ? req.body.imagen_combinada : row.imagen_combinada);
    const nombre_ = nombre !== undefined ? String(nombre).trim() : row.nombre;
    const descripcion_ = descripcion !== undefined ? String(descripcion).trim() : row.descripcion;
    const puntos = puntuacion_requerida !== undefined ? parseInt(puntuacion_requerida, 10) : row.puntuacion_requerida;
    const ord = orden !== undefined ? parseInt(orden, 10) : row.orden;
    const now = fechaHoraMySQLLima();
    await execute(
      `UPDATE avatar_accesorios SET nombre=?, descripcion=?, puntuacion_requerida=?, imagen_accesorio=?, imagen_combinada=?, orden=?, updated_at=? WHERE id=?`,
      [nombre_, descripcion_, puntos, imagen_accesorio, imagen_combinada, ord, now, id]
    );
    const updated = await query('SELECT * FROM avatar_accesorios WHERE id = ?', [id]);
    res.json({ accesorio: updated[0] });
  } catch (err) {
    console.error('Error actualizando accesorio:', err);
    res.status(500).json({ error: err.message || 'Error al actualizar' });
  }
});

/** DELETE /api/admin/avatares/accesorios/:id */
router.delete('/avatares/accesorios/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await execute('DELETE FROM avatar_accesorios WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error eliminando accesorio:', err);
    res.status(500).json({ error: err.message || 'Error al eliminar' });
  }
});

function sha1Password(plain) {
  return crypto.createHash('sha1').update(String(plain || '')).digest('hex');
}

/**
 * POST /api/admin/configuracion/reiniciar-accesos
 * Reinicia contraseñas al DNI (SHA1, igual que login) — excepto administradores.
 */
router.post('/configuracion/reiniciar-accesos', async (req, res) => {
  try {
    const { colegio_id, usuario_id } = req.user;
    const stats = { alumnos: 0, apoderados: 0, personal: 0, omitidos: 0 };

    const alumnos = await query(
      `SELECT u.id, a.nro_documento
       FROM usuarios u
       INNER JOIN alumnos a ON a.id = u.alumno_id AND a.colegio_id = u.colegio_id
       WHERE u.colegio_id = ? AND u.tipo = 'ALUMNO' AND u.estado = 'ACTIVO'`,
      [colegio_id]
    );
    for (const row of alumnos) {
      const dni = String(row.nro_documento || '').trim();
      if (!dni) {
        stats.omitidos += 1;
        continue;
      }
      await execute(
        `UPDATE usuarios SET password = ?, cambiar_password = 'NO' WHERE id = ? AND colegio_id = ?`,
        [sha1Password(dni), row.id, colegio_id]
      );
      stats.alumnos += 1;
    }

    const apoderados = await query(
      `SELECT u.id, ap.nro_documento
       FROM usuarios u
       INNER JOIN apoderados ap ON ap.id = u.apoderado_id AND ap.colegio_id = u.colegio_id
       WHERE u.colegio_id = ? AND u.tipo = 'APODERADO' AND u.estado = 'ACTIVO'`,
      [colegio_id]
    );
    for (const row of apoderados) {
      const dni = String(row.nro_documento || '').trim();
      if (!dni) {
        stats.omitidos += 1;
        continue;
      }
      await execute(
        `UPDATE usuarios SET password = ?, cambiar_password = 'NO' WHERE id = ? AND colegio_id = ?`,
        [sha1Password(dni), row.id, colegio_id]
      );
      stats.apoderados += 1;
    }

    const personal = await query(
      `SELECT u.id, p.nro_documento
       FROM usuarios u
       INNER JOIN personal p ON p.id = u.personal_id AND p.colegio_id = u.colegio_id
       WHERE u.colegio_id = ? AND u.personal_id > 0 AND u.tipo != 'ADMINISTRADOR' AND u.estado = 'ACTIVO'`,
      [colegio_id]
    );
    for (const row of personal) {
      const dni = String(row.nro_documento || '').trim();
      if (!dni) {
        stats.omitidos += 1;
        continue;
      }
      await execute(
        `UPDATE usuarios SET password = ?, cambiar_password = 'NO' WHERE id = ? AND colegio_id = ?`,
        [sha1Password(dni), row.id, colegio_id]
      );
      stats.personal += 1;
    }

    try {
      const { bumpTokenVersionColegio } = require('../utils/tokenVersion');
      await bumpTokenVersionColegio(execute, colegio_id);
    } catch (e) {
      console.warn('[reiniciar-accesos] bumpTokenVersionColegio:', e.message);
    }

    registrarAccion({
      usuario_id,
      colegio_id,
      tipo_usuario: req.user?.tipo || 'ADMINISTRADOR',
      accion: 'REINICIAR_ACCESOS',
      modulo: 'Configuración',
      entidad: 'usuarios',
      descripcion: `Reinició contraseñas masivas. Alumnos: ${stats.alumnos}, Apoderados: ${stats.apoderados}, Personal: ${stats.personal}, Sin DNI: ${stats.omitidos}`,
      url: req.originalUrl,
      metodo_http: req.method,
      resultado: 'EXITOSO',
    }).catch((err) => console.error('auditoría reiniciar-accesos', err));

    res.json({
      success: true,
      message: 'Accesos reiniciados correctamente (contraseña = DNI). Todas las sesiones fueron cerradas.',
      stats,
      sesiones_cerradas: true,
    });
  } catch (error) {
    console.error('Error reiniciando accesos:', error);
    res.status(500).json({ error: 'Error al reiniciar accesos' });
  }
});

// ========== Documento De Gestión (PDFs por categoría y perfil) ==========

router.get('/gestion-documentos/perfiles-tipos', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const base = [
      'TODOS',
      'ADMINISTRADOR',
      'PROMOTORIA',
      'DOCENTE',
      'ALUMNO',
      'APODERADO',
      'ASISTENCIA'
    ];
    const rows = await query(
      `SELECT DISTINCT TRIM(tipo) as tipo FROM usuarios 
       WHERE colegio_id = ? AND tipo IS NOT NULL AND TRIM(tipo) != ''`,
      [colegio_id]
    );
    const set = new Set([...base, ...rows.map((r) => r.tipo)]);
    const list = Array.from(set).sort((a, b) => {
      if (a === 'TODOS') return -1;
      if (b === 'TODOS') return 1;
      return String(a).localeCompare(String(b), 'es');
    });
    res.json({
      perfiles: list.map((value) => ({ value, label: etiquetaPerfilGestion(value) }))
    });
  } catch (err) {
    console.error('perfiles-tipos gestión documentos:', err);
    res.status(500).json({ error: 'Error al cargar perfiles' });
  }
});

router.get('/gestion-documentos/categorias', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const categorias = await query(
      `SELECT id, nombre, descripcion, orden, activo, created_at
       FROM gestion_documentos_categorias
       WHERE colegio_id = ?
       ORDER BY orden ASC, nombre ASC`,
      [colegio_id]
    );
    res.json({ categorias: categorias || [] });
  } catch (err) {
    console.error('list categorías gestión documentos:', err);
    res.status(500).json({ error: err.message || 'Error al listar categorías' });
  }
});

router.post('/gestion-documentos/categorias', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const { nombre, descripcion = '', orden = 0 } = req.body || {};
    if (!nombre || !String(nombre).trim()) {
      return res.status(400).json({ error: 'El nombre es obligatorio' });
    }
    const r = await execute(
      `INSERT INTO gestion_documentos_categorias (colegio_id, nombre, descripcion, orden, activo)
       VALUES (?, ?, ?, ?, 1)`,
      [colegio_id, String(nombre).trim(), String(descripcion || '').trim(), parseInt(orden, 10) || 0]
    );
    res.status(201).json({ success: true, id: r.insertId });
  } catch (err) {
    console.error('create categoría gestión documentos:', err);
    res.status(500).json({ error: err.message || 'Error al crear categoría' });
  }
});

router.put('/gestion-documentos/categorias/:id', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const { nombre, descripcion, orden, activo } = req.body || {};
    const rows = await query(
      `SELECT * FROM gestion_documentos_categorias WHERE id = ? AND colegio_id = ?`,
      [id, colegio_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Categoría no encontrada' });
    const cur = rows[0];
    const nNombre = nombre != null ? String(nombre).trim() : cur.nombre;
    const nDesc = descripcion !== undefined ? String(descripcion) : cur.descripcion;
    const nOrden = orden != null ? parseInt(orden, 10) : cur.orden;
    const nActivo = activo != null ? (activo ? 1 : 0) : cur.activo;
    await execute(
      `UPDATE gestion_documentos_categorias SET nombre = ?, descripcion = ?, orden = ?, activo = ?
       WHERE id = ? AND colegio_id = ?`,
      [nNombre, nDesc, nOrden, nActivo, id, colegio_id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('update categoría gestión documentos:', err);
    res.status(500).json({ error: err.message || 'Error al actualizar categoría' });
  }
});

router.delete('/gestion-documentos/categorias/:id', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const [cnt] = await query(
      `SELECT COUNT(*) as c FROM gestion_documentos WHERE categoria_id = ? AND colegio_id = ?`,
      [id, colegio_id]
    );
    if ((cnt?.c || 0) > 0) {
      return res.status(400).json({
        error: 'Hay documentos en esta categoría. Reasígnelos o elimínelos antes.'
      });
    }
    const r = await execute(
      `DELETE FROM gestion_documentos_categorias WHERE id = ? AND colegio_id = ?`,
      [id, colegio_id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'Categoría no encontrada' });
    res.json({ success: true });
  } catch (err) {
    console.error('delete categoría gestión documentos:', err);
    res.status(500).json({ error: err.message || 'Error al eliminar categoría' });
  }
});

router.get('/gestion-documentos', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const { categoria_id, perfil_destino } = req.query;
    let sql = `
      SELECT d.id, d.titulo, d.nombre_archivo_original, d.ruta_almacenamiento, d.perfil_destino,
             d.fecha_publicacion, d.created_at, d.activo,
             c.id as categoria_id, c.nombre as categoria_nombre, c.orden as categoria_orden
      FROM gestion_documentos d
      INNER JOIN gestion_documentos_categorias c ON c.id = d.categoria_id AND c.colegio_id = d.colegio_id
      WHERE d.colegio_id = ?
    `;
    const params = [colegio_id];
    if (categoria_id) {
      sql += ' AND d.categoria_id = ?';
      params.push(parseInt(categoria_id, 10));
    }
    if (perfil_destino && String(perfil_destino).trim()) {
      sql += ' AND d.perfil_destino = ?';
      params.push(String(perfil_destino).trim());
    }
    sql += ' ORDER BY c.orden ASC, d.created_at DESC';
    const documentos = await query(sql, params);
    const list = (documentos || []).map((d) => ({
      ...d,
      archivo_url: `/uploads/${d.ruta_almacenamiento}`
    }));
    res.json({ documentos: list });
  } catch (err) {
    console.error('list gestión documentos:', err);
    res.status(500).json({ error: err.message || 'Error al listar documentos' });
  }
});

router.post('/gestion-documentos', uploadGestionDocumento.single('archivo'), async (req, res) => {
  try {
    const { colegio_id, usuario_id } = req.user;
    if (!req.file) {
      return res.status(400).json({ error: 'Debe subir un archivo PDF' });
    }
    const categoria_id = parseInt(req.body.categoria_id, 10);
    const titulo = (req.body.titulo || '').trim();
    const perfil_destino = (req.body.perfil_destino || 'DOCENTE').trim();
    const fecha_publicacion = req.body.fecha_publicacion || null;
    if (!categoria_id || !titulo) {
      if (req.file.path) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'Categoría y título son obligatorios' });
    }
    const cat = await query(
      `SELECT id FROM gestion_documentos_categorias WHERE id = ? AND colegio_id = ?`,
      [categoria_id, colegio_id]
    );
    if (!cat.length) {
      if (req.file.path) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'Categoría no válida' });
    }
    const relPath = `gestion-documentos/${req.file.filename}`;
    await execute(
      `INSERT INTO gestion_documentos
       (colegio_id, categoria_id, titulo, nombre_archivo_original, ruta_almacenamiento, perfil_destino, fecha_publicacion, subido_por_usuario_id, activo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        colegio_id,
        categoria_id,
        titulo,
        req.file.originalname,
        relPath,
        perfil_destino,
        fecha_publicacion || null,
        usuario_id
      ]
    );
    res.status(201).json({ success: true });
  } catch (err) {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    console.error('create gestión documento:', err);
    res.status(500).json({ error: err.message || 'Error al guardar documento' });
  }
});

router.put('/gestion-documentos/:id', uploadGestionDocumento.single('archivo'), async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const rows = await query(
      `SELECT * FROM gestion_documentos WHERE id = ? AND colegio_id = ?`,
      [id, colegio_id]
    );
    if (!rows.length) {
      if (req.file?.path) fs.unlink(req.file.path, () => {});
      return res.status(404).json({ error: 'Documento no encontrado' });
    }
    const cur = rows[0];
    let ruta = cur.ruta_almacenamiento;
    let nombreOrig = cur.nombre_archivo_original;
    if (req.file) {
      const oldAbs = path.join(__dirname, '../uploads', cur.ruta_almacenamiento);
      if (fs.existsSync(oldAbs)) {
        try {
          fs.unlinkSync(oldAbs);
        } catch (e) {
          console.warn('No se pudo borrar PDF anterior:', e.message);
        }
      }
      ruta = `gestion-documentos/${req.file.filename}`;
      nombreOrig = req.file.originalname;
    }
    const titulo = req.body.titulo != null ? String(req.body.titulo).trim() : cur.titulo;
    const categoria_id =
      req.body.categoria_id != null ? parseInt(req.body.categoria_id, 10) : cur.categoria_id;
    const perfil_destino =
      req.body.perfil_destino != null ? String(req.body.perfil_destino).trim() : cur.perfil_destino;
    const fecha_publicacion =
      req.body.fecha_publicacion !== undefined ? req.body.fecha_publicacion || null : cur.fecha_publicacion;
    const cat = await query(
      `SELECT id FROM gestion_documentos_categorias WHERE id = ? AND colegio_id = ?`,
      [categoria_id, colegio_id]
    );
    if (!cat.length) {
      if (req.file?.path) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'Categoría no válida' });
    }
    await execute(
      `UPDATE gestion_documentos SET
         titulo = ?, categoria_id = ?, nombre_archivo_original = ?, ruta_almacenamiento = ?,
         perfil_destino = ?, fecha_publicacion = ?
       WHERE id = ? AND colegio_id = ?`,
      [titulo, categoria_id, nombreOrig, ruta, perfil_destino, fecha_publicacion, id, colegio_id]
    );
    res.json({ success: true });
  } catch (err) {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    console.error('update gestión documento:', err);
    res.status(500).json({ error: err.message || 'Error al actualizar documento' });
  }
});

router.delete('/gestion-documentos/:id', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const rows = await query(
      `SELECT ruta_almacenamiento FROM gestion_documentos WHERE id = ? AND colegio_id = ?`,
      [id, colegio_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Documento no encontrado' });
    const abs = path.join(__dirname, '../uploads', rows[0].ruta_almacenamiento);
    await execute(`DELETE FROM gestion_documentos WHERE id = ? AND colegio_id = ?`, [id, colegio_id]);
    if (fs.existsSync(abs)) {
      try {
        fs.unlinkSync(abs);
      } catch (e) {
        console.warn('unlink pdf:', e.message);
      }
    }
    res.json({ success: true });
  } catch (err) {
    console.error('delete gestión documento:', err);
    res.status(500).json({ error: err.message || 'Error al eliminar documento' });
  }
});

// ========== Institucional (PDFs por categoría; solo ADMINISTRADOR) ==========
// Notificaciones por fecha de vencimiento: definir en otro trabajo; destinatarios solo ADMINISTRADOR.

router.get('/institucional/categorias', requireAdminOCoordinadorGetInstitucional, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const excluirMatricula =
      String(req.query.excluir_matricula || '').trim() === '1' ||
      String(req.query.excluir_matricula || '').toLowerCase() === 'true';
    let categorias = await query(
      `SELECT id, nombre, descripcion, orden, activo, created_at
       FROM institucional_categorias
       WHERE colegio_id = ?
       ORDER BY orden ASC, nombre ASC`,
      [colegio_id]
    );
    if (excluirMatricula) {
      categorias = (categorias || []).filter((c) => {
        const n = String(c.nombre || '')
          .toUpperCase()
          .trim();
        return !(n.includes('MATRICUL') || n === 'MATRICULA');
      });
    }
    res.json({ categorias: categorias || [] });
  } catch (err) {
    console.error('list categorías institucional:', err);
    res.status(500).json({ error: err.message || 'Error al listar categorías' });
  }
});

router.post('/institucional/categorias', requireSoloAdministrador, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const { nombre, descripcion = '', orden = 0 } = req.body || {};
    if (!nombre || !String(nombre).trim()) {
      return res.status(400).json({ error: 'El nombre es obligatorio' });
    }
    const r = await execute(
      `INSERT INTO institucional_categorias (colegio_id, nombre, descripcion, orden, activo)
       VALUES (?, ?, ?, ?, 1)`,
      [colegio_id, String(nombre).trim(), String(descripcion || '').trim(), parseInt(orden, 10) || 0]
    );
    res.status(201).json({ success: true, id: r.insertId });
  } catch (err) {
    console.error('create categoría institucional:', err);
    res.status(500).json({ error: err.message || 'Error al crear categoría' });
  }
});

router.put('/institucional/categorias/:id', requireSoloAdministrador, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const { nombre, descripcion, orden, activo } = req.body || {};
    const rows = await query(
      `SELECT * FROM institucional_categorias WHERE id = ? AND colegio_id = ?`,
      [id, colegio_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Categoría no encontrada' });
    const cur = rows[0];
    const nNombre = nombre != null ? String(nombre).trim() : cur.nombre;
    const nDesc = descripcion !== undefined ? String(descripcion) : cur.descripcion;
    const nOrden = orden != null ? parseInt(orden, 10) : cur.orden;
    const nActivo = activo != null ? (activo ? 1 : 0) : cur.activo;
    await execute(
      `UPDATE institucional_categorias SET nombre = ?, descripcion = ?, orden = ?, activo = ?
       WHERE id = ? AND colegio_id = ?`,
      [nNombre, nDesc, nOrden, nActivo, id, colegio_id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('update categoría institucional:', err);
    res.status(500).json({ error: err.message || 'Error al actualizar categoría' });
  }
});

router.delete('/institucional/categorias/:id', requireSoloAdministrador, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const [cnt] = await query(
      `SELECT COUNT(*) as c FROM institucional_documentos WHERE categoria_id = ? AND colegio_id = ?`,
      [id, colegio_id]
    );
    if ((cnt?.c || 0) > 0) {
      return res.status(400).json({
        error: 'Hay documentos en esta categoría. Reasígnelos o elimínelos antes.'
      });
    }
    const r = await execute(
      `DELETE FROM institucional_categorias WHERE id = ? AND colegio_id = ?`,
      [id, colegio_id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'Categoría no encontrada' });
    res.json({ success: true });
  } catch (err) {
    console.error('delete categoría institucional:', err);
    res.status(500).json({ error: err.message || 'Error al eliminar categoría' });
  }
});

router.get('/institucional/documentos', requireAdminOCoordinadorGetInstitucional, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const { categoria_id } = req.query;
    const excluirMatricula =
      String(req.query.excluir_matricula || '').trim() === '1' ||
      String(req.query.excluir_matricula || '').toLowerCase() === 'true';
    let sql = `
      SELECT d.id, d.titulo, d.nombre_archivo_original, d.ruta_almacenamiento,
             d.fecha_publicacion, d.fecha_vencimiento, d.created_at, d.activo,
             c.id as categoria_id, c.nombre as categoria_nombre, c.orden as categoria_orden
      FROM institucional_documentos d
      INNER JOIN institucional_categorias c ON c.id = d.categoria_id AND c.colegio_id = d.colegio_id
      WHERE d.colegio_id = ?
    `;
    const params = [colegio_id];
    if (categoria_id) {
      sql += ' AND d.categoria_id = ?';
      params.push(parseInt(categoria_id, 10));
    }
    if (excluirMatricula) {
      sql += ` AND NOT (
        UPPER(TRIM(c.nombre)) LIKE '%MATRICUL%' OR UPPER(TRIM(c.nombre)) = 'MATRICULA'
      )`;
    }
    sql += ' ORDER BY c.orden ASC, d.created_at DESC';
    const documentos = await query(sql, params);
    const list = (documentos || []).map((d) => ({
      ...d,
      archivo_url: `/uploads/${d.ruta_almacenamiento}`
    }));
    res.json({ documentos: list });
  } catch (err) {
    console.error('list institucional documentos:', err);
    res.status(500).json({ error: err.message || 'Error al listar documentos' });
  }
});

router.post(
  '/institucional/documentos',
  requireSoloAdministrador,
  uploadInstitucionalDocumento.single('archivo'),
  async (req, res) => {
    try {
      const { colegio_id, usuario_id } = req.user;
      if (!req.file) {
        return res.status(400).json({ error: 'Debe subir un archivo PDF' });
      }
      const categoria_id = parseInt(req.body.categoria_id, 10);
      const titulo = (req.body.titulo || '').trim();
      const fecha_publicacion = req.body.fecha_publicacion || null;
      const fecha_vencimiento = req.body.fecha_vencimiento || null;
      if (!categoria_id || !titulo) {
        if (req.file.path) fs.unlink(req.file.path, () => {});
        return res.status(400).json({ error: 'Categoría y título son obligatorios' });
      }
      const cat = await query(
        `SELECT id FROM institucional_categorias WHERE id = ? AND colegio_id = ?`,
        [categoria_id, colegio_id]
      );
      if (!cat.length) {
        if (req.file.path) fs.unlink(req.file.path, () => {});
        return res.status(400).json({ error: 'Categoría no válida' });
      }
      const relPath = `institucional-documentos/${req.file.filename}`;
      await execute(
        `INSERT INTO institucional_documentos
         (colegio_id, categoria_id, titulo, nombre_archivo_original, ruta_almacenamiento, fecha_publicacion, fecha_vencimiento, subido_por_usuario_id, activo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          colegio_id,
          categoria_id,
          titulo,
          req.file.originalname,
          relPath,
          fecha_publicacion || null,
          fecha_vencimiento || null,
          usuario_id
        ]
      );
      res.status(201).json({ success: true });
    } catch (err) {
      if (req.file?.path) fs.unlink(req.file.path, () => {});
      console.error('create institucional documento:', err);
      res.status(500).json({ error: err.message || 'Error al guardar documento' });
    }
  }
);

router.put(
  '/institucional/documentos/:id',
  requireSoloAdministrador,
  uploadInstitucionalDocumento.single('archivo'),
  async (req, res) => {
    try {
      const { colegio_id } = req.user;
      const id = parseInt(req.params.id, 10);
      const rows = await query(
        `SELECT * FROM institucional_documentos WHERE id = ? AND colegio_id = ?`,
        [id, colegio_id]
      );
      if (!rows.length) {
        if (req.file?.path) fs.unlink(req.file.path, () => {});
        return res.status(404).json({ error: 'Documento no encontrado' });
      }
      const cur = rows[0];
      let ruta = cur.ruta_almacenamiento;
      let nombreOrig = cur.nombre_archivo_original;
      if (req.file) {
        const oldAbs = path.join(__dirname, '../uploads', cur.ruta_almacenamiento);
        if (fs.existsSync(oldAbs)) {
          try {
            fs.unlinkSync(oldAbs);
          } catch (e) {
            console.warn('No se pudo borrar PDF anterior (institucional):', e.message);
          }
        }
        ruta = `institucional-documentos/${req.file.filename}`;
        nombreOrig = req.file.originalname;
      }
      const titulo = req.body.titulo != null ? String(req.body.titulo).trim() : cur.titulo;
      const categoria_id =
        req.body.categoria_id != null ? parseInt(req.body.categoria_id, 10) : cur.categoria_id;
      const fecha_publicacion =
        req.body.fecha_publicacion !== undefined ? req.body.fecha_publicacion || null : cur.fecha_publicacion;
      const fecha_vencimiento =
        req.body.fecha_vencimiento !== undefined ? req.body.fecha_vencimiento || null : cur.fecha_vencimiento;
      const cat = await query(
        `SELECT id FROM institucional_categorias WHERE id = ? AND colegio_id = ?`,
        [categoria_id, colegio_id]
      );
      if (!cat.length) {
        if (req.file?.path) fs.unlink(req.file.path, () => {});
        return res.status(400).json({ error: 'Categoría no válida' });
      }
      await execute(
        `UPDATE institucional_documentos SET
         titulo = ?, categoria_id = ?, nombre_archivo_original = ?, ruta_almacenamiento = ?,
         fecha_publicacion = ?, fecha_vencimiento = ?
       WHERE id = ? AND colegio_id = ?`,
        [titulo, categoria_id, nombreOrig, ruta, fecha_publicacion, fecha_vencimiento, id, colegio_id]
      );
      res.json({ success: true });
    } catch (err) {
      if (req.file?.path) fs.unlink(req.file.path, () => {});
      console.error('update institucional documento:', err);
      res.status(500).json({ error: err.message || 'Error al actualizar documento' });
    }
  }
);

router.delete('/institucional/documentos/:id', requireSoloAdministrador, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const rows = await query(
      `SELECT ruta_almacenamiento FROM institucional_documentos WHERE id = ? AND colegio_id = ?`,
      [id, colegio_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Documento no encontrado' });
    const abs = path.join(__dirname, '../uploads', rows[0].ruta_almacenamiento);
    await execute(`DELETE FROM institucional_documentos WHERE id = ? AND colegio_id = ?`, [id, colegio_id]);
    if (fs.existsSync(abs)) {
      try {
        fs.unlinkSync(abs);
      } catch (e) {
        console.warn('unlink pdf institucional:', e.message);
      }
    }
    res.json({ success: true });
  } catch (err) {
    console.error('delete institucional documento:', err);
    res.status(500).json({ error: err.message || 'Error al eliminar documento' });
  }
});

/**
 * GET /api/admin/notificaciones
 * Misma lógica que docente: notificaciones para el usuario (TODOS o destinatario)
 */
router.get('/notificaciones', async (req, res) => {
  try {
    const { usuario_id } = req.user;
    const notificaciones = await query(
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
    const parsePayload = (raw) => {
      if (raw == null || raw === '') return null;
      if (typeof raw === 'object') return raw;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    };
    const notificacionesMapeadas = (notificaciones || []).map((n) => ({
      id: n.id,
      titulo: n.titulo || n.asunto || 'Notificación del sistema',
      mensaje: n.mensaje || n.contenido || '',
      fecha_hora: n.fecha_hora,
      estado: n.leida === 1 || n.leida === true ? 'LEIDO' : 'NO_LEIDO',
      tipo_origen: n.tipo_origen || 'NOTIFICACION',
      accion_tipo: n.accion_tipo || null,
      accion_payload: parsePayload(n.accion_payload),
      url_destino: n.url_destino || null,
      destinatario_id: n.destinatario_id
    }));
    res.json({ notificaciones: notificacionesMapeadas });
  } catch (error) {
    console.error('Error obteniendo notificaciones (admin):', error);
    res.status(500).json({ error: 'Error al obtener notificaciones' });
  }
});

router.put('/notificaciones/:id/marcar-leido', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario_id } = req.user;
    const notif = await query(
      `SELECT id FROM notificaciones 
       WHERE id = ? AND (para = 'TODOS' OR (para = 'USUARIO' AND destinatario_id = ?))`,
      [id, usuario_id]
    );
    if (notif.length === 0) {
      return res.status(404).json({ error: 'Notificación no encontrada' });
    }
    await execute(`UPDATE notificaciones SET leida = 1 WHERE id = ?`, [id]);
    res.json({ success: true, message: 'Notificación marcada como leída' });
  } catch (error) {
    console.error('Error marcando notificación (admin):', error);
    res.status(500).json({ error: 'Error al marcar como leída' });
  }
});

/**
 * Clave temporal estable para deduplicar historial Conexiones.
 * mysql2 suele devolver fecha_hora como Date: String(date).slice(0,19) rompe (corta "Wed Apr 16...").
 */
function normalizarFechaHoraClaveHistorial(val) {
  if (val == null || val === '') return '';
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    const y = val.getFullYear();
    const mo = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    const h = String(val.getHours()).padStart(2, '0');
    const mi = String(val.getMinutes()).padStart(2, '0');
    const s = String(val.getSeconds()).padStart(2, '0');
    return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
  }
  const str = String(val).trim().replace('T', ' ');
  const m = str.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
  if (m) return `${m[1]} ${m[2]}`;
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const mo = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    const h = String(parsed.getHours()).padStart(2, '0');
    const mi = String(parsed.getMinutes()).padStart(2, '0');
    const sec = String(parsed.getSeconds()).padStart(2, '0');
    return `${y}-${mo}-${d} ${h}:${mi}:${sec}`;
  }
  return str.length > 19 ? str.slice(0, 19) : str;
}

/**
 * GET /api/admin/conexiones
 * Historial de Conexiones (1 fila por envío), con filtros por personal, grupo y fechas.
 */
router.get('/conexiones', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const { personal_id, grupo_id, fecha_desde, fecha_hasta } = req.query || {};

    let conexionesModernas = [];
    let conexionesLegacy = [];
    try {
      const where = ['ce.colegio_id = ?'];
      const params = [colegio_id];
      if (personal_id) {
        where.push('ce.remitente_id = ?');
        params.push(personal_id);
      }
      if (fecha_desde) {
        where.push('ce.fecha_hora >= ?');
        params.push(`${fecha_desde} 00:00:00`);
      }
      if (fecha_hasta) {
        where.push('ce.fecha_hora <= ?');
        params.push(`${fecha_hasta} 23:59:59`);
      }
      const rows = await query(
        `SELECT
           ce.id,
           DATE_FORMAT(ce.fecha_hora, '%Y-%m-%d %H:%i:%s') as fecha_hora,
           ce.asunto,
           ce.mensaje,
           ce.alcance,
           ce.perfil_destino,
           ce.grupos_json,
           ce.remitente_id as personal_id,
           COALESCE(CONCAT(p.nombres, ' ', p.apellidos), u.usuario, 'Personal') as personal
         FROM conexiones_envios ce
         LEFT JOIN usuarios u ON u.id = ce.remitente_id
         LEFT JOIN personal p ON p.id = u.personal_id
         WHERE ${where.join(' AND ')}
         ORDER BY ce.fecha_hora DESC, ce.id DESC
         LIMIT 800`,
        params
      );
      const allGroupIds = new Set();
      const parsed = (rows || []).map((r) => {
        let ids = [];
        try {
          ids = JSON.parse(r.grupos_json || '[]');
          if (!Array.isArray(ids)) ids = [];
        } catch {
          ids = [];
        }
        ids.forEach((id) => {
          const n = parseInt(id, 10);
          if (!isNaN(n) && n > 0) allGroupIds.add(n);
        });
        return { ...r, _grupo_ids: ids };
      });
      let gruposMap = {};
      if (allGroupIds.size > 0) {
        const ids = Array.from(allGroupIds);
        const rowsG = await query(
          `SELECT g.id, n.nombre as nivel, g.grado, g.seccion
           FROM grupos g
           INNER JOIN niveles n ON n.id = g.nivel_id
           WHERE g.id IN (${ids.map(() => '?').join(',')}) AND g.colegio_id = ?`,
          [...ids, colegio_id]
        );
        (rowsG || []).forEach((g) => {
          gruposMap[g.id] = `${g.grado}° ${g.seccion} ${g.nivel}`.trim();
        });
      }
      conexionesModernas = parsed.map((r) => {
        const gruposIds = (r._grupo_ids || []).map((x) => parseInt(x, 10)).filter((n) => !isNaN(n) && n > 0);
        const gruposTexto = gruposIds.length
          ? gruposIds.map((id) => gruposMap[id] || `Grupo ${id}`).join(', ')
          : 'TODOS';
        return {
          id: r.id,
          source: 'conexiones_envios',
          fecha_hora: r.fecha_hora,
          personal: r.personal || 'Personal',
          personal_id: r.personal_id,
          asunto: r.asunto || 'Sin asunto',
          alcance: r.alcance || 'GRUPOS',
          perfil_destino: r.perfil_destino || 'TODOS',
          grupos_ids: gruposIds,
          grupo: gruposTexto,
          mensaje: r.mensaje || ''
        };
      });
    } catch (e1) {
      // fallback legacy debajo
      if (!(e1 && (e1.code === 'ER_NO_SUCH_TABLE' || String(e1.message || '').includes('conexiones_envios')))) {
        throw e1;
      }
    }

    // Legacy (mensajes_grupos): se mezcla con conexiones_envios para ver histórico completo
    try {
      const whereLegacy = ['(u.colegio_id = ? OR g.colegio_id = ?)'];
      const paramsLegacy = [colegio_id, colegio_id];
      if (personal_id) {
        whereLegacy.push('mg.remitente_id = ?');
        paramsLegacy.push(personal_id);
      }
      if (grupo_id) {
        whereLegacy.push('mg.grupo_id = ?');
        paramsLegacy.push(grupo_id);
      }
      if (fecha_desde) {
        whereLegacy.push('mg.fecha_hora >= ?');
        paramsLegacy.push(`${fecha_desde} 00:00:00`);
      }
      if (fecha_hasta) {
        whereLegacy.push('mg.fecha_hora <= ?');
        paramsLegacy.push(`${fecha_hasta} 23:59:59`);
      }
      const rowsLegacy = await query(
        `SELECT
           mg.id,
           DATE_FORMAT(mg.fecha_hora, '%Y-%m-%d %H:%i:%s') as fecha_hora,
           mg.asunto,
           mg.mensaje,
           mg.grupo_id,
           mg.remitente_id as personal_id,
           COALESCE(CONCAT(p.nombres, ' ', p.apellidos), u.usuario, 'Personal') as personal,
           n.nombre as nivel,
           g.grado,
           g.seccion
         FROM mensajes_grupos mg
         LEFT JOIN usuarios u ON u.id = mg.remitente_id
         LEFT JOIN personal p ON p.id = u.personal_id
         LEFT JOIN grupos g ON g.id = mg.grupo_id
         LEFT JOIN niveles n ON n.id = g.nivel_id
         WHERE ${whereLegacy.join(' AND ')}
         ORDER BY mg.fecha_hora DESC, mg.id DESC
         LIMIT 500`,
        paramsLegacy
      );
      conexionesLegacy = (rowsLegacy || []).map((r) => ({
        id: r.id,
        source: 'mensajes_grupos',
        fecha_hora: r.fecha_hora,
        personal: r.personal,
        personal_id: r.personal_id,
        asunto: r.asunto || 'Sin asunto',
        alcance: 'GRUPOS',
        perfil_destino: 'TODOS',
        grupos_ids: [r.grupo_id],
        grupo: [r.grado != null ? `${r.grado}°` : '', r.seccion || '', r.nivel || ''].filter(Boolean).join(' ').trim(),
        mensaje: r.mensaje || ''
      }));
    } catch (eLegacy) {
      if (!(eLegacy && (eLegacy.code === 'ER_NO_SUCH_TABLE' || String(eLegacy.message || '').includes('mensajes_grupos')))) {
        throw eLegacy;
      }
    }

    const normAsuntoConexionKey = (a) =>
      String(a || '')
        .replace(/<[^>]*>/g, '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();

    const claveHistorialConexion = (personalId, fechaHora, asunto, grupoId) => {
      const ts = normalizarFechaHoraClaveHistorial(fechaHora);
      const subj = normAsuntoConexionKey(asunto);
      const pid = parseInt(personalId, 10) || 0;
      const gid = parseInt(grupoId, 10) || 0;
      return `${pid}|${ts}|${subj}|${gid}`;
    };

    /**
     * Clave para una fila de lista: con grupos → remitente + instante + asunto + ids (legacy TODOS vs modern APODERADOS unifica).
     * Sin grupos (alcance colegio) → se añade alcance y perfil para no fusionar dos envíos globales distintos.
     */
    const claveFilaListaConexiones = (row) => {
      const ts = normalizarFechaHoraClaveHistorial(row.fecha_hora);
      const sub = normAsuntoConexionKey(row.asunto);
      const pid = parseInt(row.personal_id, 10) || 0;
      const gids = (Array.isArray(row.grupos_ids) ? row.grupos_ids : [])
        .map((x) => parseInt(x, 10))
        .filter((n) => !isNaN(n) && n > 0)
        .sort((a, b) => a - b)
        .join(',');
      if (gids) {
        return `${pid}|${ts}|${sub}|${gids}`;
      }
      const perf = String(row.perfil_destino || '').toUpperCase();
      const alc = String(row.alcance || '').toUpperCase();
      return `${pid}|${ts}|${sub}||${alc}|${perf}`;
    };

    const clavesCubiertasPorModerno = new Set();
    for (const m of conexionesModernas) {
      for (const gid of m.grupos_ids || []) {
        const n = parseInt(gid, 10);
        if (!isNaN(n) && n > 0) {
          clavesCubiertasPorModerno.add(
            claveHistorialConexion(m.personal_id, m.fecha_hora, m.asunto, n)
          );
        }
      }
    }

    const conexionesLegacySinDuplicar = (conexionesLegacy || []).filter((L) => {
      if (!clavesCubiertasPorModerno.size) return true;
      const gid = Array.isArray(L.grupos_ids) ? L.grupos_ids[0] : null;
      if (gid == null) return true;
      const key = claveHistorialConexion(L.personal_id, L.fecha_hora, L.asunto, gid);
      return !clavesCubiertasPorModerno.has(key);
    });

    const conexionesOrdenadas = [...conexionesModernas, ...conexionesLegacySinDuplicar].sort((a, b) => {
      const da = new Date(a.fecha_hora || 0).getTime();
      const db = new Date(b.fecha_hora || 0).getTime();
      if (db !== da) return db - da;
      return (b.id || 0) - (a.id || 0);
    });

    const perfilMasEspecifico = (a, b) => {
      const ta = String(a?.perfil_destino || 'TODOS').toUpperCase();
      const tb = String(b?.perfil_destino || 'TODOS').toUpperCase();
      if (ta === 'TODOS' && tb !== 'TODOS') return b;
      if (tb === 'TODOS' && ta !== 'TODOS') return a;
      return (parseInt(b.id, 10) || 0) > (parseInt(a.id, 10) || 0) ? b : a;
    };

    const unicosPorClaveLista = new Map();
    for (const row of conexionesOrdenadas) {
      const k = claveFilaListaConexiones(row);
      const prev = unicosPorClaveLista.get(k);
      if (!prev) {
        unicosPorClaveLista.set(k, row);
        continue;
      }
      let mejor = prev;
      if (prev.source === 'mensajes_grupos' && row.source === 'conexiones_envios') {
        mejor = row;
      } else if (row.source === 'mensajes_grupos' && prev.source === 'conexiones_envios') {
        mejor = prev;
      } else if (prev.source === 'conexiones_envios' && row.source === 'conexiones_envios') {
        mejor = perfilMasEspecifico(prev, row);
      } else if (prev.source === 'mensajes_grupos' && row.source === 'mensajes_grupos') {
        mejor = (parseInt(row.id, 10) || 0) > (parseInt(prev.id, 10) || 0) ? row : prev;
      }
      unicosPorClaveLista.set(k, mejor);
    }

    const conexiones = Array.from(unicosPorClaveLista.values()).sort((a, b) => {
      const da = new Date(a.fecha_hora || 0).getTime();
      const db = new Date(b.fecha_hora || 0).getTime();
      if (db !== da) return db - da;
      return (b.id || 0) - (a.id || 0);
    });

    const groupFilter = parseInt(grupo_id, 10);
    const filtradas = !isNaN(groupFilter) && groupFilter > 0
      ? conexiones.filter((c) => Array.isArray(c.grupos_ids) && c.grupos_ids.includes(groupFilter))
      : conexiones;
    res.json({ conexiones: filtradas });
  } catch (error) {
    if (error && (error.code === 'ER_NO_SUCH_TABLE' || String(error.message || '').includes('mensajes_grupos'))) {
      return res.json({ conexiones: [] });
    }
    console.error('Error obteniendo conexiones (admin):', error);
    res.status(500).json({ error: 'Error al obtener conexiones familiares' });
  }
});

router.get('/conexiones/:id', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const { id } = req.params;

    try {
      const rows = await query(
        `SELECT
           ce.id,
           ce.fecha_hora,
           ce.asunto,
           ce.mensaje,
           ce.alcance,
           ce.perfil_destino,
           ce.grupos_json,
           ce.remitente_id,
           COALESCE(CONCAT(p.nombres, ' ', p.apellidos), u.usuario, 'Personal') as personal
         FROM conexiones_envios ce
         LEFT JOIN usuarios u ON u.id = ce.remitente_id
         LEFT JOIN personal p ON p.id = u.personal_id
         WHERE ce.id = ? AND ce.colegio_id = ?
         LIMIT 1`,
        [id, colegio_id]
      );
      if (rows.length > 0) {
        const r = rows[0];
        let gruposIds = [];
        try {
          gruposIds = JSON.parse(r.grupos_json || '[]');
          if (!Array.isArray(gruposIds)) gruposIds = [];
        } catch {
          gruposIds = [];
        }
        let grupo = 'TODOS';
        if (gruposIds.length > 0) {
          const ids = gruposIds.map((x) => parseInt(x, 10)).filter((n) => !isNaN(n) && n > 0);
          if (ids.length > 0) {
            const rowsG = await query(
              `SELECT g.id, n.nombre as nivel, g.grado, g.seccion
               FROM grupos g
               INNER JOIN niveles n ON n.id = g.nivel_id
               WHERE g.id IN (${ids.map(() => '?').join(',')}) AND g.colegio_id = ?`,
              [...ids, colegio_id]
            );
            const mapG = {};
            (rowsG || []).forEach((g) => { mapG[g.id] = `${g.grado}° ${g.seccion} ${g.nivel}`.trim(); });
            grupo = ids.map((gid) => mapG[gid] || `Grupo ${gid}`).join(', ');
          }
        }
        return res.json({
          conexion: {
            id: r.id,
            fecha_hora: r.fecha_hora,
            personal: r.personal || 'Personal',
            asunto: r.asunto || 'Sin asunto',
            alcance: r.alcance || 'GRUPOS',
            perfil_destino: r.perfil_destino || 'TODOS',
            grupo,
            mensaje: r.mensaje || '',
            archivos: await obtenerAdjuntosPorRemitenteFecha(r.remitente_id, r.fecha_hora)
          }
        });
      }
    } catch (e1) {
      if (!(e1 && (e1.code === 'ER_NO_SUCH_TABLE' || String(e1.message || '').includes('conexiones_envios')))) {
        throw e1;
      }
    }

    const rows = await query(
      `SELECT
         mg.id,
         mg.fecha_hora,
         mg.asunto,
         mg.mensaje,
         mg.remitente_id,
         mg.mensaje_referencia_id,
         COALESCE(CONCAT(p.nombres, ' ', p.apellidos), u.usuario, 'Personal') as personal,
         n.nombre as nivel,
         g.grado,
         g.seccion
       FROM mensajes_grupos mg
       LEFT JOIN usuarios u ON u.id = mg.remitente_id
       LEFT JOIN personal p ON p.id = u.personal_id
       LEFT JOIN grupos g ON g.id = mg.grupo_id
       LEFT JOIN niveles n ON n.id = g.nivel_id
       WHERE mg.id = ? AND (u.colegio_id = ? OR g.colegio_id = ?)
       LIMIT 1`,
      [id, colegio_id, colegio_id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Conexión no encontrada' });
    }
    const r = rows[0];
    const grupo = [r.grado != null ? `${r.grado}°` : '', r.seccion || '', r.nivel || '']
      .filter(Boolean)
      .join(' ')
      .trim();
    res.json({
      conexion: {
        id: r.id,
        fecha_hora: r.fecha_hora,
        personal: r.personal || 'Personal',
        asunto: r.asunto || 'Sin asunto',
        alcance: 'GRUPOS',
        perfil_destino: 'TODOS',
        grupo,
        mensaje: r.mensaje || '',
        archivos: await obtenerAdjuntosPorRemitenteFecha(r.remitente_id, r.fecha_hora, r.mensaje_referencia_id)
      }
    });
  } catch (error) {
    if (error && (error.code === 'ER_NO_SUCH_TABLE' || String(error.message || '').includes('mensajes_grupos'))) {
      return res.status(404).json({ error: 'Conexiones no disponibles' });
    }
    console.error('Error obteniendo detalle de conexión (admin):', error);
    res.status(500).json({ error: 'Error al obtener detalle de conexión' });
  }
});

/**
 * DELETE /api/admin/conexiones/:id?source=conexiones_envios|mensajes_grupos
 * Borra el historial y marca borrado='SI' en TODOS los mensajes de ese envío (todas las bandejas).
 */
router.delete('/conexiones/:id', async (req, res) => {
  try {
    if (req.user?.tipo !== 'ADMINISTRADOR') {
      return res.status(403).json({ error: 'Solo el administrador puede eliminar envíos para todos.' });
    }
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const source = String(req.query.source || req.body?.source || 'conexiones_envios').trim();
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    let remitenteId = null;
    let fechaHora = null;
    let asunto = null;

    if (source === 'mensajes_grupos') {
      const [row] = await query(
        `SELECT mg.id, mg.remitente_id, mg.fecha_hora, mg.asunto
         FROM mensajes_grupos mg
         LEFT JOIN usuarios u ON u.id = mg.remitente_id
         LEFT JOIN grupos g ON g.id = mg.grupo_id
         WHERE mg.id = ? AND (u.colegio_id = ? OR g.colegio_id = ?)
         LIMIT 1`,
        [id, colegio_id, colegio_id]
      );
      if (!row) return res.status(404).json({ error: 'Envío no encontrado' });
      remitenteId = row.remitente_id;
      fechaHora = row.fecha_hora;
      asunto = row.asunto;
    } else {
      const [row] = await query(
        `SELECT id, remitente_id, fecha_hora, asunto
         FROM conexiones_envios
         WHERE id = ? AND colegio_id = ?
         LIMIT 1`,
        [id, colegio_id]
      );
      if (!row) {
        // Fallback: a veces el id es de mensajes_grupos aunque source diga moderno
        const [leg] = await query(
          `SELECT mg.id, mg.remitente_id, mg.fecha_hora, mg.asunto
           FROM mensajes_grupos mg
           LEFT JOIN usuarios u ON u.id = mg.remitente_id
           LEFT JOIN grupos g ON g.id = mg.grupo_id
           WHERE mg.id = ? AND (u.colegio_id = ? OR g.colegio_id = ?)
           LIMIT 1`,
          [id, colegio_id, colegio_id]
        );
        if (!leg) return res.status(404).json({ error: 'Envío no encontrado' });
        remitenteId = leg.remitente_id;
        fechaHora = leg.fecha_hora;
        asunto = leg.asunto;
      } else {
        remitenteId = row.remitente_id;
        fechaHora = row.fecha_hora;
        asunto = row.asunto;
      }
    }

    const resultMsg = await execute(
      `UPDATE mensajes m
       INNER JOIN usuarios u ON u.id = m.remitente_id AND u.colegio_id = ?
       SET m.borrado = 'SI'
       WHERE m.remitente_id = ?
         AND m.asunto = ?
         AND DATE_FORMAT(m.fecha_hora, '%Y-%m-%d %H:%i:%s') = DATE_FORMAT(?, '%Y-%m-%d %H:%i:%s')
         AND m.borrado = 'NO'`,
      [colegio_id, remitenteId, asunto, fechaHora]
    );
    const mensajesBorrados = resultMsg?.affectedRows ?? 0;

    let histBorrados = 0;
    try {
      const r1 = await execute(
        `DELETE FROM conexiones_envios
         WHERE colegio_id = ?
           AND remitente_id = ?
           AND asunto = ?
           AND DATE_FORMAT(fecha_hora, '%Y-%m-%d %H:%i:%s') = DATE_FORMAT(?, '%Y-%m-%d %H:%i:%s')`,
        [colegio_id, remitenteId, asunto, fechaHora]
      );
      histBorrados += r1?.affectedRows ?? 0;
    } catch {
      /* tabla puede no existir */
    }
    try {
      const r2 = await execute(
        `DELETE mg FROM mensajes_grupos mg
         LEFT JOIN usuarios u ON u.id = mg.remitente_id
         LEFT JOIN grupos g ON g.id = mg.grupo_id
         WHERE mg.remitente_id = ?
           AND mg.asunto = ?
           AND DATE_FORMAT(mg.fecha_hora, '%Y-%m-%d %H:%i:%s') = DATE_FORMAT(?, '%Y-%m-%d %H:%i:%s')
           AND (u.colegio_id = ? OR g.colegio_id = ?)`,
        [remitenteId, asunto, fechaHora, colegio_id, colegio_id]
      );
      histBorrados += r2?.affectedRows ?? 0;
    } catch {
      /* ignore */
    }

    registrarAccion({
      usuario_id: req.user.usuario_id || req.user.id,
      colegio_id,
      tipo_usuario: 'ADMINISTRADOR',
      accion: 'ELIMINAR',
      modulo: 'CONEXIONES',
      entidad: 'conexion_envio',
      entidad_id: id,
      descripcion: `Admin borró conexión para todos (asunto: "${String(asunto || '').slice(0, 80)}", mensajes: ${mensajesBorrados})`,
      url: req.originalUrl,
      metodo_http: req.method,
      ip_address: req.ip || req.connection?.remoteAddress,
      user_agent: req.get('user-agent'),
      resultado: 'EXITOSO',
    }).catch(() => {});
    req.skipAudit = true;

    res.json({
      ok: true,
      message: `Envío eliminado para todos (${mensajesBorrados} mensaje(s) de bandeja).`,
      mensajes_borrados: mensajesBorrados,
      historial_borrado: histBorrados,
    });
  } catch (error) {
    console.error('Error eliminando conexión (admin):', error);
    res.status(500).json({ error: 'Error al eliminar el envío para todos' });
  }
});

/**
 * GET /api/admin/perfil — datos de personal vinculado al usuario administrador
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
      return res.status(404).json({
        error: 'No hay ficha de personal vinculada a este usuario. Contacte al soporte técnico.'
      });
    }
    const docente = personal[0];
    let fotoUrl = null;
    if (docente.foto && docente.foto !== '') {
      const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
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
      foto: fotoUrl,
      cargo: docente.cargo,
      profesion: docente.profesion,
      fecha_nacimiento: docente.fecha_nacimiento,
      fecha_ingreso: docente.fecha_ingreso,
      hora_entrada: docente.hora_entrada,
      hora_salida: docente.hora_salida
    });
  } catch (error) {
    console.error('Error obteniendo perfil admin:', error);
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
});

router.put('/perfil', uploadPersonalAdmin.single('foto'), async (req, res) => {
  try {
    const { usuario_id, colegio_id } = req.user;
    const { nombres, apellidos, email, telefono_fijo, telefono_celular, direccion, fecha_nacimiento } = req.body;
    const personal = await query(
      `SELECT p.* FROM personal p
       INNER JOIN usuarios u ON u.personal_id = p.id
       WHERE u.id = ? AND u.colegio_id = ?`,
      [usuario_id, colegio_id]
    );
    if (personal.length === 0) {
      return res.status(404).json({ error: 'Personal no encontrado' });
    }
    const docente = personal[0];
    let fotoPath = docente.foto;
    if (req.file) {
      if (docente.foto && docente.foto !== '') {
        const oldFotoPath = `/home/vanguard/intranet2026/backend/Static/Image/Fotos/${path.basename(docente.foto)}`;
        if (fs.existsSync(oldFotoPath)) {
          try {
            fs.unlinkSync(oldFotoPath);
          } catch (e) {
            /* ignore */
          }
        }
      }
      fotoPath = req.file.filename;
    }
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
    const personalActualizado = await query(
      `SELECT p.*, u.usuario as dni
       FROM personal p
       INNER JOIN usuarios u ON u.personal_id = p.id
       WHERE u.id = ? AND u.colegio_id = ?`,
      [usuario_id, colegio_id]
    );
    const row = personalActualizado[0] || {};
    let fotoUrlResp = null;
    if (row.foto && row.foto !== '') {
      const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
      const isProduction = process.env.NODE_ENV === 'production';
      fotoUrlResp = isProduction
        ? `${phpSystemUrl}/Static/Image/Fotos/${row.foto}`
        : `http://localhost:5000/Static/Image/Fotos/${row.foto}`;
    }
    const perfilPayload = {
      id: row.id,
      nombres: row.nombres,
      apellidos: row.apellidos,
      dni: row.dni,
      email: row.email,
      telefono_fijo: row.telefono_fijo,
      telefono_celular: row.telefono_celular,
      direccion: row.direccion,
      foto: fotoUrlResp,
      fecha_nacimiento: row.fecha_nacimiento
    };
    res.json({
      success: true,
      message: 'Perfil actualizado correctamente',
      perfil: perfilPayload,
      docente: perfilPayload
    });
  } catch (error) {
    console.error('Error actualizando perfil admin:', error);
    res.status(500).json({ error: 'Error al actualizar perfil' });
  }
});

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
    const usuarios = await query(`SELECT u.id, u.password, u.colegio_id FROM usuarios u WHERE u.id = ?`, [usuario_id]);
    if (usuarios.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    const usuarioDB = usuarios[0];
    const passwordHashActual = crypto.createHash('sha1').update(password_actual).digest('hex');
    if (usuarioDB.password !== passwordHashActual) {
      return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    }
    const passwordHashNueva = crypto.createHash('sha1').update(password_nueva).digest('hex');
    registrarAccion({
      usuario_id,
      colegio_id: usuarioDB.colegio_id,
      tipo_usuario: 'ADMINISTRADOR',
      accion: 'CAMBIAR_PASSWORD',
      modulo: 'PERFIL',
      entidad: 'usuario',
      entidad_id: usuario_id,
      descripcion: 'Cambió su contraseña (admin)',
      url: req.originalUrl,
      metodo_http: req.method,
      ip_address: req.ip || req.connection?.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: null,
      datos_nuevos: null,
      resultado: 'EXITOSO'
    });
    await execute(`UPDATE usuarios SET password = ? WHERE id = ?`, [passwordHashNueva, usuario_id]);
    try {
      const { bumpTokenVersion } = require('../utils/tokenVersion');
      await bumpTokenVersion(execute, usuario_id);
    } catch (e) {
      console.warn('[admin/perfil/password] bumpTokenVersion:', e.message);
    }
    req.skipAudit = true;
    res.json({
      success: true,
      message: 'Contraseña actualizada correctamente. Vuelva a iniciar sesión.',
      requiere_relogin: true,
    });
  } catch (error) {
    console.error('Error cambiando contraseña admin:', error);
    res.status(500).json({ error: 'Error al cambiar la contraseña' });
  }
});

/** CV personal (estudios, idiomas, experiencia, PDFs). Sin sueldo. */
mountSelfServiceCvRoutes(router);

/**
 * GET /api/admin/notificaciones-envios
 * Historial de envíos masivos manuales (campanita + push).
 */
router.get('/notificaciones/envios', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const { remitente_id, grupo_id, fecha_desde, fecha_hasta } = req.query || {};
    await ensureTablaNotificacionesEnvios(execute);

    const where = ['ne.colegio_id = ?'];
    const params = [colegio_id];
    if (remitente_id) {
      where.push('ne.remitente_id = ?');
      params.push(remitente_id);
    }
    if (fecha_desde) {
      where.push('ne.fecha_hora >= ?');
      params.push(`${fecha_desde} 00:00:00`);
    }
    if (fecha_hasta) {
      where.push('ne.fecha_hora <= ?');
      params.push(`${fecha_hasta} 23:59:59`);
    }

    const rows = await query(
      `SELECT
         ne.id,
         DATE_FORMAT(ne.fecha_hora, '%Y-%m-%d %H:%i:%s') AS fecha_hora,
         ne.icono_emoji,
         ne.titulo,
         ne.mensaje,
         ne.alcance,
         ne.perfil_destino,
         ne.grupos_json,
         ne.total_destinatarios,
         ne.total_campanita,
         ne.total_push_enviados,
         ne.remitente_id,
         COALESCE(CONCAT(p.nombres, ' ', p.apellidos), u.usuario, 'Administrador') AS remitente
       FROM notificaciones_envios ne
       LEFT JOIN usuarios u ON u.id = ne.remitente_id
       LEFT JOIN personal p ON p.id = u.personal_id
       WHERE ${where.join(' AND ')}
       ORDER BY ne.fecha_hora DESC, ne.id DESC
       LIMIT 500`,
      params
    );

    const allGroupIds = new Set();
    const parsed = (rows || []).map((r) => {
      let ids = [];
      try {
        ids = JSON.parse(r.grupos_json || '[]');
        if (!Array.isArray(ids)) ids = [];
      } catch {
        ids = [];
      }
      ids.forEach((id) => {
        const n = parseInt(id, 10);
        if (!isNaN(n) && n > 0) allGroupIds.add(n);
      });
      return { ...r, _grupo_ids: ids };
    });

    let gruposMap = {};
    if (allGroupIds.size > 0) {
      const ids = Array.from(allGroupIds);
      const rowsG = await query(
        `SELECT g.id, n.nombre AS nivel, g.grado, g.seccion
         FROM grupos g
         INNER JOIN niveles n ON n.id = g.nivel_id
         WHERE g.id IN (${ids.map(() => '?').join(',')}) AND g.colegio_id = ?`,
        [...ids, colegio_id]
      );
      (rowsG || []).forEach((g) => {
        gruposMap[g.id] = `${g.grado}° ${g.seccion} ${g.nivel}`.trim();
      });
    }

    const filtroGrupoNum = parseInt(grupo_id, 10);
    let envios = parsed.map((r) => {
      const gruposIds = (r._grupo_ids || []).map((x) => parseInt(x, 10)).filter((n) => !isNaN(n) && n > 0);
      const gruposTexto = gruposIds.length
        ? gruposIds.map((id) => gruposMap[id] || `Grupo ${id}`).join(', ')
        : String(r.alcance || '').toUpperCase() === 'TODOS'
          ? 'Todo el colegio'
          : '—';
      return {
        id: r.id,
        fecha_hora: r.fecha_hora,
        remitente: r.remitente,
        remitente_id: r.remitente_id,
        icono_emoji: r.icono_emoji || '',
        titulo: tituloCompleto(r.icono_emoji, r.titulo),
        titulo_texto: r.titulo,
        mensaje: r.mensaje,
        alcance: r.alcance || 'GRUPOS',
        perfil_destino: r.perfil_destino || 'TODOS',
        grupos_ids: gruposIds,
        grupo: gruposTexto,
        total_destinatarios: r.total_destinatarios || 0,
        total_campanita: r.total_campanita || 0,
        total_push_enviados: r.total_push_enviados || 0,
      };
    });

    if (Number.isFinite(filtroGrupoNum) && filtroGrupoNum > 0) {
      envios = envios.filter((e) => e.grupos_ids.includes(filtroGrupoNum));
    }

    res.json({ envios, iconos_permitidos: ICONOS_PERMITIDOS.filter(Boolean) });
  } catch (error) {
    console.error('Error listando notificaciones-envios:', error);
    res.status(500).json({ error: error.message || 'Error al cargar historial' });
  }
});

router.get('/notificaciones/envios/:id', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });
    await ensureTablaNotificacionesEnvios(execute);

    const rows = await query(
      `SELECT
         ne.*,
         DATE_FORMAT(ne.fecha_hora, '%Y-%m-%d %H:%i:%s') AS fecha_hora_fmt,
         COALESCE(CONCAT(p.nombres, ' ', p.apellidos), u.usuario, 'Administrador') AS remitente
       FROM notificaciones_envios ne
       LEFT JOIN usuarios u ON u.id = ne.remitente_id
       LEFT JOIN personal p ON p.id = u.personal_id
       WHERE ne.id = ? AND ne.colegio_id = ? LIMIT 1`,
      [id, colegio_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Envío no encontrado' });

    const r = rows[0];
    let gruposIds = [];
    try {
      gruposIds = JSON.parse(r.grupos_json || '[]');
      if (!Array.isArray(gruposIds)) gruposIds = [];
    } catch {
      gruposIds = [];
    }
    let grupoTexto = 'Todo el colegio';
    if (gruposIds.length > 0) {
      const ids = gruposIds.map((x) => parseInt(x, 10)).filter((n) => !isNaN(n) && n > 0);
      if (ids.length) {
        const rowsG = await query(
          `SELECT g.id, n.nombre AS nivel, g.grado, g.seccion
           FROM grupos g INNER JOIN niveles n ON n.id = g.nivel_id
           WHERE g.id IN (${ids.map(() => '?').join(',')}) AND g.colegio_id = ?`,
          [...ids, colegio_id]
        );
        grupoTexto = (rowsG || [])
          .map((g) => `${g.grado}° ${g.seccion} ${g.nivel}`.trim())
          .join(', ');
      }
    }

    res.json({
      envio: {
        id: r.id,
        fecha_hora: r.fecha_hora_fmt || r.fecha_hora,
        remitente: r.remitente,
        icono_emoji: r.icono_emoji || '',
        titulo: tituloCompleto(r.icono_emoji, r.titulo),
        titulo_texto: r.titulo,
        mensaje: r.mensaje,
        alcance: r.alcance,
        perfil_destino: r.perfil_destino,
        grupo: grupoTexto,
        total_destinatarios: r.total_destinatarios,
        total_campanita: r.total_campanita,
        total_push_enviados: r.total_push_enviados,
      },
    });
  } catch (error) {
    console.error('Error detalle notificaciones-envios:', error);
    res.status(500).json({ error: error.message || 'Error al cargar detalle' });
  }
});

router.post('/notificaciones/envios', async (req, res) => {
  try {
    const { colegio_id, usuario_id } = req.user;
    const { titulo, icono_emoji, mensaje, alcance, perfil_destino, grupos_ids } = req.body || {};

    let gruposArray = grupos_ids;
    if (typeof gruposArray === 'string') {
      try {
        gruposArray = JSON.parse(gruposArray);
      } catch {
        gruposArray = [];
      }
    }
    if (!Array.isArray(gruposArray)) gruposArray = [];

    const resultado = await enviarNotificacionBroadcast({
      query,
      execute,
      colegio_id,
      remitente_id: usuario_id,
      titulo,
      icono_emoji,
      mensaje,
      alcance: alcance === 'grupos' ? 'grupos' : 'todos',
      perfil_destino: perfil_destino || 'todos',
      grupos_ids: gruposArray.map((x) => parseInt(x, 10)).filter((n) => !isNaN(n) && n > 0),
    });

    res.json({
      success: true,
      message: `Notificación enviada a ${resultado.total_destinatarios} destinatario(s)`,
      envio_id: resultado.envioId,
      total_destinatarios: resultado.total_destinatarios,
      total_campanita: resultado.total_campanita,
    });
  } catch (error) {
    console.error('Error enviando notificación masiva:', error);
    res.status(400).json({ error: error.message || 'No se pudo enviar la notificación' });
  }
});

// ========== Tutoría General (solo ADMINISTRADOR) ==========

router.get('/tutoria-general/personal', requireSoloAdministrador, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const rows = await query(
      `SELECT t.id, t.personal_id, t.activo, t.created_at,
              p.nombres, p.apellidos, p.nro_documento,
              u.id AS usuario_id, u.usuario AS dni
       FROM tutoria_general_personal t
       INNER JOIN personal p ON p.id = t.personal_id AND p.colegio_id = t.colegio_id
       LEFT JOIN usuarios u ON u.personal_id = p.id AND u.colegio_id = t.colegio_id AND u.estado = 'ACTIVO'
       WHERE t.colegio_id = ? AND t.activo = 1
       ORDER BY p.apellidos, p.nombres`,
      [colegio_id]
    );
    res.json({ personal: rows || [] });
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({
        error: 'Ejecute la migración 055_tutoria_general_personal_mysql.sql en la base de datos.'
      });
    }
    console.error('[admin] list tutoria-general personal', e);
    res.status(500).json({ error: 'Error al listar tutoras generales' });
  }
});

router.get('/tutoria-general/personal-candidatos', requireSoloAdministrador, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const q = (req.query.q || '').trim();
    // Un solo usuario por personal (evita duplicados si hay varias cuentas activas).
    let sql = `SELECT p.id AS personal_id, p.nombres, p.apellidos, p.nro_documento,
                      u.id AS usuario_id, u.usuario AS dni, u.tipo
               FROM personal p
               INNER JOIN usuarios u ON u.id = (
                 SELECT u2.id FROM usuarios u2
                 WHERE u2.personal_id = p.id AND u2.colegio_id = p.colegio_id AND u2.estado = 'ACTIVO'
                 ORDER BY u2.id ASC
                 LIMIT 1
               )
               WHERE p.colegio_id = ?`;
    const params = [colegio_id];
    if (q) {
      sql += ` AND (
        p.nombres LIKE ? OR p.apellidos LIKE ? OR p.nro_documento LIKE ?
        OR EXISTS (
          SELECT 1 FROM usuarios u3
          WHERE u3.personal_id = p.id AND u3.colegio_id = p.colegio_id AND u3.estado = 'ACTIVO'
            AND u3.usuario LIKE ?
        )
      )`;
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }
    sql += ` ORDER BY p.apellidos, p.nombres LIMIT 80`;
    const rows = await query(sql, params);
    res.json({ personal: rows || [] });
  } catch (e) {
    console.error('[admin] tutoria-general candidatos', e);
    res.status(500).json({ error: 'Error al buscar personal' });
  }
});

router.post('/tutoria-general/personal', requireSoloAdministrador, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const personalId = parseInt(req.body.personal_id, 10);
    if (!personalId) return res.status(400).json({ error: 'personal_id es requerido' });
    const prow = await query(
      `SELECT id FROM personal WHERE id = ? AND colegio_id = ? LIMIT 1`,
      [personalId, colegio_id]
    );
    if (!prow.length) return res.status(404).json({ error: 'Personal no encontrado en este colegio' });
    await execute(
      `INSERT INTO tutoria_general_personal (colegio_id, personal_id, activo)
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE activo = 1`,
      [colegio_id, personalId]
    );
    res.json({ success: true });
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({
        error: 'Ejecute la migración 055_tutoria_general_personal_mysql.sql en la base de datos.'
      });
    }
    console.error('[admin] add tutoria-general personal', e);
    res.status(500).json({ error: 'Error al asignar tutora general' });
  }
});

router.delete('/tutoria-general/personal/:id', requireSoloAdministrador, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const r = await execute(
      `DELETE FROM tutoria_general_personal WHERE id = ? AND colegio_id = ?`,
      [id, colegio_id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'Registro no encontrado' });
    res.json({ success: true });
  } catch (e) {
    console.error('[admin] delete tutoria-general personal', e);
    res.status(500).json({ error: 'Error al quitar tutora general' });
  }
});

// ========== Cajero Caja Chica (solo ADMINISTRADOR) ==========

router.get('/caja-chica-cajeros/personal', requireSoloAdministrador, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const rows = await query(
      `SELECT t.id, t.personal_id, t.activo, t.created_at,
              p.nombres, p.apellidos, p.nro_documento,
              u.id AS usuario_id, u.usuario AS dni, u.tipo AS usuario_tipo
       FROM caja_chica_cajeros t
       INNER JOIN personal p ON p.id = t.personal_id AND p.colegio_id = t.colegio_id
       LEFT JOIN usuarios u ON u.personal_id = p.id AND u.colegio_id = t.colegio_id AND u.estado = 'ACTIVO'
       WHERE t.colegio_id = ? AND t.activo = 1
       ORDER BY p.apellidos, p.nombres`,
      [colegio_id]
    );
    res.json({ personal: rows || [] });
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({
        error: 'Ejecute la migración 062_caja_chica_cajeros_mysql.sql en la base de datos.'
      });
    }
    console.error('[admin] list caja-chica-cajeros', e);
    res.status(500).json({ error: 'Error al listar cajeros' });
  }
});

router.get('/caja-chica-cajeros/personal-candidatos', requireSoloAdministrador, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const q = (req.query.q || '').trim();
    // Un solo usuario por personal (evita duplicados si hay varias cuentas activas).
    let sql = `SELECT p.id AS personal_id, p.nombres, p.apellidos, p.nro_documento,
                      u.id AS usuario_id, u.usuario AS dni, u.tipo
               FROM personal p
               INNER JOIN usuarios u ON u.id = (
                 SELECT u2.id FROM usuarios u2
                 WHERE u2.personal_id = p.id AND u2.colegio_id = p.colegio_id AND u2.estado = 'ACTIVO'
                 ORDER BY u2.id ASC
                 LIMIT 1
               )
               WHERE p.colegio_id = ?`;
    const params = [colegio_id];
    if (q) {
      sql += ` AND (
        p.nombres LIKE ? OR p.apellidos LIKE ? OR p.nro_documento LIKE ?
        OR EXISTS (
          SELECT 1 FROM usuarios u3
          WHERE u3.personal_id = p.id AND u3.colegio_id = p.colegio_id AND u3.estado = 'ACTIVO'
            AND u3.usuario LIKE ?
        )
      )`;
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }
    sql += ` ORDER BY p.apellidos, p.nombres LIMIT 80`;
    const rows = await query(sql, params);
    res.json({ personal: rows || [] });
  } catch (e) {
    console.error('[admin] caja-chica-cajeros candidatos', e);
    res.status(500).json({ error: 'Error al buscar personal' });
  }
});

router.post('/caja-chica-cajeros/personal', requireSoloAdministrador, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const personalId = parseInt(req.body.personal_id, 10);
    if (!personalId) return res.status(400).json({ error: 'personal_id es requerido' });
    const prow = await query(
      `SELECT id FROM personal WHERE id = ? AND colegio_id = ? LIMIT 1`,
      [personalId, colegio_id]
    );
    if (!prow.length) return res.status(404).json({ error: 'Personal no encontrado en este colegio' });
    await execute(
      `INSERT INTO caja_chica_cajeros (colegio_id, personal_id, activo)
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE activo = 1`,
      [colegio_id, personalId]
    );
    res.json({ success: true });
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({
        error: 'Ejecute la migración 062_caja_chica_cajeros_mysql.sql en la base de datos.'
      });
    }
    console.error('[admin] add caja-chica-cajeros', e);
    res.status(500).json({ error: 'Error al asignar cajero' });
  }
});

router.delete('/caja-chica-cajeros/personal/:id', requireSoloAdministrador, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const r = await execute(
      `DELETE FROM caja_chica_cajeros WHERE id = ? AND colegio_id = ?`,
      [id, colegio_id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'Registro no encontrado' });
    res.json({ success: true });
  } catch (e) {
    console.error('[admin] delete caja-chica-cajeros', e);
    res.status(500).json({ error: 'Error al quitar cajero' });
  }
});

module.exports = router;

