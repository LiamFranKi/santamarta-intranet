const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { query, execute } = require('../utils/mysql');
const { authenticateToken } = require('../middleware/auth');
const { registrarAccion } = require('../utils/auditoria');
const phpSerialize = require('php-serialize');

const personalStorageAdmin = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = '/home/vanguard/nuevo.vanguardschools.edu.pe/Static/Image/Fotos';
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
    const uploadPath = '/home/vanguard/nuevo.vanguardschools.edu.pe/Static/Image/Fondos';
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
      '/estadisticas/deudas-por-aula',
      '/estadisticas/deudas-por-aula/alumnos'
    ];
    const permitidasPorPrefijo = ['/notificaciones', '/perfil', '/conexiones'];
    if (
      permitidasPromotoria.includes(p) ||
      permitidasPorPrefijo.some((prefix) => p === prefix || p.startsWith(`${prefix}/`))
    ) {
      return next();
    }
  }
  return res.status(403).json({
    error: 'No tienes permisos para acceder a este recurso'
  });
});

/**
 * GET /api/admin/dashboard
 * Estadísticas para el dashboard del administrador (año activo)
 * Total Alumnos/Apoderados: solo los que han pagado matrícula y NO están retirados.
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

    // Matrículas del año activo: pagaron matrícula, NO retirados (estado 0 o 4)
    const matriculasPagadas = await query(
      `SELECT m.id, m.alumno_id, c.pension, c.matricula
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       INNER JOIN costos c ON c.id = m.costo_id
       WHERE m.colegio_id = ? AND g.anio = ? AND (m.estado = 0 OR m.estado = 4)
         AND EXISTS (
           SELECT 1 FROM pagos p
           WHERE p.matricula_id = m.id AND p.colegio_id = ? AND p.estado = 'ACTIVO'
             AND p.tipo = 0 AND p.estado_pago = 'CANCELADO'
         )`,
      [colegio_id, anioActivo, colegio_id]
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

    // Total Alumnos: solo con matrícula pagada y no retirados
    const totalAlumnos = alumnoIdsPagados.length;

    // Total Apoderados: padres de alumnos matriculados y pagados del año actual
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

    // Presupuesto Anual (año activo): matrícula + 10 pensiones por cada alumno pagado
    let presupuestoAnual = 0;
    for (const mat of matriculasPagadas || []) {
      const pension = parseFloat(mat.pension || 0);
      const matriculaCosto = parseFloat(mat.matricula || 0);
      presupuestoAnual += matriculaCosto + (pension * totalPensiones);
    }

    // Total Ingresos (año activo): todo lo ya pagado (matrículas + pensiones) de alumnos pagados
    let totalIngresos = 0;
    if (matIdsPagadas.length > 0) {
      const ph = matIdsPagadas.map(() => '?').join(',');
      const [rIngresos] = await query(
        `SELECT COALESCE(SUM(p.monto + COALESCE(p.mora, 0)), 0) as total
         FROM pagos p
         WHERE p.colegio_id = ? AND p.estado = 'ACTIVO' AND p.estado_pago = 'CANCELADO'
           AND p.matricula_id IN (${ph})`,
        [colegio_id, ...matIdsPagadas]
      );
      totalIngresos = parseFloat(rIngresos?.total || 0);
    }

    // Total Deuda (año activo): Presupuesto - Ingresos
    const totalDeuda = Math.max(0, presupuestoAnual - totalIngresos);

    // Deudas Anteriores: años >= 2025 y < año activo, solo lo no pagado
    const matriculasAnteriores = await query(
      `SELECT m.id, c.pension, c.matricula, g.anio
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       INNER JOIN costos c ON c.id = m.costo_id
       WHERE m.colegio_id = ? AND g.anio >= 2025 AND g.anio < ? AND (m.estado = 0 OR m.estado = 4)`,
      [colegio_id, anioActivo]
    );
    let deudasAnteriores = 0;
    for (const mat of matriculasAnteriores || []) {
      const pagosCancelados = await query(
        `SELECT COALESCE(SUM(p.monto + COALESCE(p.mora, 0)), 0) as pagado
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

    // Matrículas del año: pagaron matrícula, no retirados
    const matriculasPagadas = await query(
      `SELECT m.id, m.alumno_id, c.pension, c.matricula
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       INNER JOIN costos c ON c.id = m.costo_id
       WHERE m.colegio_id = ? AND g.anio = ? AND (m.estado = 0 OR m.estado = 4)
         AND EXISTS (
           SELECT 1 FROM pagos p
           WHERE p.matricula_id = m.id AND p.colegio_id = ? AND p.estado = 'ACTIVO'
             AND p.tipo = 0 AND p.estado_pago = 'CANCELADO'
         )`,
      [colegio_id, anio, colegio_id]
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
        `SELECT COALESCE(SUM(p.monto + COALESCE(p.mora, 0)), 0) as total
         FROM pagos p
         WHERE p.colegio_id = ? AND p.estado = 'ACTIVO' AND p.estado_pago = 'CANCELADO'
           AND p.matricula_id IN (${ph}) AND p.tipo = 0`,
        [colegio_id, ...matIdsPagadas]
      );

      // Pensiones: solo pagos del año consultado (ciclos de pensiones)
      const [rIngPens] = await query(
        `SELECT COALESCE(SUM(p.monto + COALESCE(p.mora, 0)), 0) as total
         FROM pagos p
         WHERE p.colegio_id = ? AND p.estado = 'ACTIVO' AND p.estado_pago = 'CANCELADO'
           AND p.matricula_id IN (${ph}) AND p.tipo > 0 AND YEAR(p.fecha_hora) = ?`,
        [colegio_id, ...matIdsPagadas, anio]
      );

      totalCobrado = parseFloat(rIngMat?.total || 0) + parseFloat(rIngPens?.total || 0);

      // Pagado por tipo:
      // - tipo = 0 (matrícula): sin filtro por año
      // - tipo > 0 (pensiones): solo pagos del año consultado
      pagadoPorTipo = {};

      const pagosMatricula = await query(
        `SELECT p.tipo, COALESCE(SUM(p.monto + COALESCE(p.mora, 0)), 0) as total
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
        `SELECT p.tipo, p.nro_pago, COALESCE(SUM(p.monto + COALESCE(p.mora, 0)), 0) as total
         FROM pagos p
         WHERE p.colegio_id = ? AND p.estado = 'ACTIVO' AND p.estado_pago = 'CANCELADO'
           AND p.matricula_id IN (${ph}) AND p.tipo = 1 AND p.nro_pago >= 1 AND p.nro_pago <= ? AND YEAR(p.fecha_hora) = ?
         GROUP BY p.tipo, p.nro_pago`,
        [colegio_id, ...matIdsPagadas, totalPensiones, anio]
      );
      (pagosPensiones || []).forEach((row) => {
        const idx = parseInt(row.nro_pago, 10);
        if (idx >= 1 && idx <= totalPensiones) {
          pagadoPorTipo[idx] = parseFloat(row.total || 0);
        }
      });
    }

    const totalDeuda = Math.max(0, presupuestoAnual - totalCobrado);

    // Cantidad de deudores: matrículas que aún deben (lo pagado < lo esperado) — una sola consulta
    let cantidadDeudores = 0;
    if (matIdsPagadas.length > 0) {
      const ph = matIdsPagadas.map(() => '?').join(',');
      const pagadoPorMatricula = await query(
        `SELECT p.matricula_id, COALESCE(SUM(p.monto + COALESCE(p.mora, 0)), 0) as pagado
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
    // Matrícula
    const pagadoMatricula = pagadoPorTipo[0] || 0;
    conceptos.push({
      tipo: 0,
      concepto: 'Matrícula',
      total_pagar: totalMatriculaEsperado,
      pagado: pagadoMatricula,
      deuda: Math.max(0, totalMatriculaEsperado - pagadoMatricula)
    });

    // Meses de pensión: index 1..totalPensiones mapeado a Marzo..Diciembre
    for (let i = 1; i <= totalPensiones; i += 1) {
      const indiceMesCalendario = 2 + i; // i=1 -> 3 (Marzo), i=10 -> 12 (Diciembre)
      if (indiceMesCalendario > 12) continue;
      const nombreMes = nombresMes[indiceMesCalendario] || `Mes ${i}`;
      const totalMes = esperadoPensionPorTipo[i] || 0;
      const pagadoMes = pagadoPorTipo[i] || 0;
      conceptos.push({
        tipo: i,
        concepto: nombreMes,
        total_pagar: totalMes,
        pagado: pagadoMes,
        deuda: Math.max(0, totalMes - pagadoMes)
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

    const grupoIds = gruposAnio.map(g => g.id);
    const ph = grupoIds.map(() => '?').join(',');

    if (tipoParam === 0) {
      // Matrícula: total esperado por grupo (solo matrículas que ya pagaron matrícula) y lo pagado
      const esperadoPorGrupo = await query(
        `SELECT m.grupo_id, SUM(c.matricula) as total_esperado
         FROM matriculas m
         INNER JOIN grupos g ON g.id = m.grupo_id
         INNER JOIN costos c ON c.id = m.costo_id
         WHERE m.colegio_id = ? AND g.anio = ? AND (m.estado = 0 OR m.estado = 4)
           AND EXISTS (
             SELECT 1 FROM pagos p
             WHERE p.matricula_id = m.id AND p.colegio_id = ? AND p.estado = 'ACTIVO'
               AND p.tipo = 0 AND p.estado_pago = 'CANCELADO'
           )
         GROUP BY m.grupo_id`,
        [colegio_id, anio, colegio_id]
      );
      const pagadoPorGrupo = await query(
        `SELECT m.grupo_id, COALESCE(SUM(p.monto + COALESCE(p.mora, 0)), 0) as pagado
         FROM pagos p
         INNER JOIN matriculas m ON m.id = p.matricula_id
         WHERE p.colegio_id = ? AND p.estado = 'ACTIVO' AND p.estado_pago = 'CANCELADO' AND p.tipo = 0
           AND m.grupo_id IN (${ph})
         GROUP BY m.grupo_id`,
        [colegio_id, ...grupoIds]
      );

      const mapEsperado = {};
      (esperadoPorGrupo || []).forEach(r => { mapEsperado[r.grupo_id] = parseFloat(r.total_esperado || 0); });
      const mapPagado = {};
      (pagadoPorGrupo || []).forEach(r => { mapPagado[r.grupo_id] = parseFloat(r.pagado || 0); });

      const aulas = gruposAnio.map(g => {
        const deudaTotal = mapEsperado[g.id] || 0;
        const pagado = mapPagado[g.id] || 0;
        const saldo = Math.max(0, deudaTotal - pagado);
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

    const esperadoPension = await query(
      `SELECT m.grupo_id, SUM(c.pension) as total_esperado
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       INNER JOIN costos c ON c.id = m.costo_id
       WHERE m.colegio_id = ? AND g.anio = ? AND (m.estado = 0 OR m.estado = 4)
         AND EXISTS (
           SELECT 1 FROM pagos p
           WHERE p.matricula_id = m.id AND p.colegio_id = ? AND p.estado = 'ACTIVO'
             AND p.tipo = 0 AND p.estado_pago = 'CANCELADO'
         )
       GROUP BY m.grupo_id`,
      [colegio_id, anio, colegio_id]
    );
    const pagadoPension = await query(
      `SELECT m.grupo_id, COALESCE(SUM(p.monto + COALESCE(p.mora, 0)), 0) as pagado
       FROM pagos p
       INNER JOIN matriculas m ON m.id = p.matricula_id
       WHERE p.colegio_id = ? AND p.estado = 'ACTIVO' AND p.estado_pago = 'CANCELADO'
         AND p.tipo = 1 AND p.nro_pago = ? AND YEAR(p.fecha_hora) = ?
         AND m.grupo_id IN (${ph})
       GROUP BY m.grupo_id`,
      [colegio_id, nroPago, anio, ...grupoIds]
    );

    const nombresMes = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const indiceMes = 2 + nroPago;
    const nombreMes = indiceMes <= 12 ? (nombresMes[indiceMes] || `Mes ${nroPago}`) : `Mes ${nroPago}`;

    const mapEsperado = {};
    (esperadoPension || []).forEach(r => { mapEsperado[r.grupo_id] = parseFloat(r.total_esperado || 0); });
    const mapPagado = {};
    (pagadoPension || []).forEach(r => { mapPagado[r.grupo_id] = parseFloat(r.pagado || 0); });

    const aulas = gruposAnio.map(g => {
      const deudaTotal = mapEsperado[g.id] || 0;
      const pagado = mapPagado[g.id] || 0;
      const saldo = Math.max(0, deudaTotal - pagado);
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
         (SELECT COALESCE(SUM(p.monto + COALESCE(p.mora, 0)), 0)
          FROM pagos p
          WHERE p.matricula_id = m.id AND p.colegio_id = ? AND p.estado = 'ACTIVO'
            AND p.estado_pago = 'CANCELADO' AND p.tipo = 0) as pagado
         FROM matriculas m
         INNER JOIN costos c ON c.id = m.costo_id
         INNER JOIN alumnos a ON a.id = m.alumno_id
         WHERE m.grupo_id = ? AND m.colegio_id = ? AND (m.estado = 0 OR m.estado = 4)
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
       (SELECT COALESCE(SUM(p.monto + COALESCE(p.mora, 0)), 0)
        FROM pagos p
        WHERE p.matricula_id = m.id AND p.colegio_id = ? AND p.estado = 'ACTIVO'
          AND p.estado_pago = 'CANCELADO' AND p.tipo = 1 AND p.nro_pago = ? AND YEAR(p.fecha_hora) = ?) as pagado
       FROM matriculas m
       INNER JOIN costos c ON c.id = m.costo_id
       INNER JOIN alumnos a ON a.id = m.alumno_id
       WHERE m.grupo_id = ? AND m.colegio_id = ? AND (m.estado = 0 OR m.estado = 4)
         AND EXISTS (
           SELECT 1 FROM pagos p
           WHERE p.matricula_id = m.id AND p.colegio_id = ? AND p.estado = 'ACTIVO'
             AND p.tipo = 0 AND p.estado_pago = 'CANCELADO'
         )`,
      [colegio_id, nroPago, anio, grupoId, colegio_id, colegio_id]
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
        bloquear_deudores
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
    const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://nuevo.vanguardschools.edu.pe';
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
      link_consulta_facturas: configMap['link_consulta_facturas'] || '',
      show_birthday_window: configMap['show_birthday_window'] || 'NO',
      enable_enrollment_form: configMap['enable_enrollment_form'] || 'NO',
      login_fondo: colegioData.login_background ? `${baseUrl}/Static/Image/Fondos/${colegioData.login_background}` : null,
      libreta_logo: configMap['libreta_logo'] ? `${baseUrl}/Static/Image/Fondos/${configMap['libreta_logo']}` : null,
      libreta_fondo: configMap['libreta_fondo'] ? `${baseUrl}/Static/Image/Fondos/${configMap['libreta_fondo']}` : null,
      boleta_logo: configMap['boleta_logo'] ? `${baseUrl}/Static/Archivos/${configMap['boleta_logo']}` : null
    });
  } catch (error) {
    console.error('Error obteniendo configuración:', error);
    res.status(500).json({ error: 'Error al obtener configuración' });
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
      'comision_tarjeta_debito', 'comision_tarjeta_credito', 'clave_bloques', 'bloquear_deudores'
    ];

    colegioFields.forEach(field => {
      if (body[field] !== undefined) {
        let value = body[field];
        
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
      'remitente_emails', 'email_matricula_apoderado', 'link_consulta_facturas',
      'show_birthday_window', 'enable_enrollment_form'
    ];

    for (const field of configFields) {
      if (body[field] !== undefined) {
        // Verificar si existe
        const existing = await query(
          `SELECT id FROM config WHERE clave = ?`,
          [field]
        );

        if (existing.length > 0) {
          await execute(
            `UPDATE config SET valor = ? WHERE clave = ?`,
            [body[field], field]
          );
        } else {
          await execute(
            `INSERT INTO config (clave, valor) VALUES (?, ?)`,
            [field, body[field]]
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
        const boletaLogoPath = '/home/vanguard/nuevo.vanguardschools.edu.pe/Static/Archivos';
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

    res.json({ success: true, message: 'Configuración guardada correctamente' });
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
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
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
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
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
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
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
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
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

/**
 * POST /api/admin/configuracion/reiniciar-accesos
 * Reiniciar accesos de alumnos y apoderados
 */
router.post('/configuracion/reiniciar-accesos', async (req, res) => {
  try {
    const { colegio_id } = req.user;

    // Obtener todos los alumnos del colegio
    const alumnos = await query(
      `SELECT a.id FROM alumnos a
       INNER JOIN usuarios u ON u.alumno_id = a.id
       WHERE u.colegio_id = ?`,
      [colegio_id]
    );

    // Resetear contraseñas de alumnos (a su DNI)
    for (const alumno of alumnos) {
      const usuario = await query(
        `SELECT usuario FROM usuarios WHERE alumno_id = ? AND colegio_id = ? LIMIT 1`,
        [alumno.id, colegio_id]
      );
      if (usuario.length > 0) {
        const dni = usuario[0].usuario;
        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash(dni, 10);
        await execute(
          `UPDATE usuarios SET password = ? WHERE alumno_id = ? AND colegio_id = ?`,
          [hashedPassword, alumno.id, colegio_id]
        );
      }
    }

    // Obtener todos los apoderados del colegio
    const apoderados = await query(
      `SELECT ap.id FROM apoderados ap
       INNER JOIN usuarios u ON u.apoderado_id = ap.id
       WHERE u.colegio_id = ?`,
      [colegio_id]
    );

    // Resetear contraseñas de apoderados (a su DNI)
    for (const apoderado of apoderados) {
      const usuario = await query(
        `SELECT usuario FROM usuarios WHERE apoderado_id = ? AND colegio_id = ? LIMIT 1`,
        [apoderado.id, colegio_id]
      );
      if (usuario.length > 0) {
        const dni = usuario[0].usuario;
        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash(dni, 10);
        await execute(
          `UPDATE usuarios SET password = ? WHERE apoderado_id = ? AND colegio_id = ?`,
          [hashedPassword, apoderado.id, colegio_id]
        );
      }
    }

    res.json({ success: true, message: 'Accesos reiniciados correctamente' });
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
 * GET /api/admin/conexiones
 * Historial de Conexiones (1 fila por envío), con filtros por personal, grupo y fechas.
 */
router.get('/conexiones', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const { personal_id, grupo_id, fecha_desde, fecha_hasta } = req.query || {};

    let conexiones = [];
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
           ce.fecha_hora,
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
      conexiones = parsed.map((r) => {
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

    // Fallback legacy (mensajes_grupos) para envíos antiguos
    if (conexiones.length === 0) {
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
           mg.fecha_hora,
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
      conexiones = (rowsLegacy || []).map((r) => ({
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
    }

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
            mensaje: r.mensaje || ''
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
        mensaje: r.mensaje || ''
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
        const oldFotoPath = `/home/vanguard/nuevo.vanguardschools.edu.pe/Static/Image/Fotos/${path.basename(docente.foto)}`;
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
      const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://nuevo.vanguardschools.edu.pe';
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
    req.skipAudit = true;
    res.json({ success: true, message: 'Contraseña actualizada correctamente' });
  } catch (error) {
    console.error('Error cambiando contraseña admin:', error);
    res.status(500).json({ error: 'Error al cambiar la contraseña' });
  }
});

module.exports = router;

