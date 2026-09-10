const express = require('express');
const router = express.Router();
const { query } = require('../utils/mysql');
const { authenticateToken, requireUserType } = require('../middleware/auth');
const { sqlPersonalSinSuperadmin } = require('../utils/superadminOculto');

router.use(authenticateToken);
router.use(requireUserType('PROMOTORIA'));

/**
 * GET /api/promotoria/dashboard
 * Estadísticas financieras y académicas para Promotoría (año activo).
 * Ingresos y gráfico por mes: solo SUM(monto). total_mora_recaudada aparte (no suma a ingresos).
 * Matriculados pagados / sin pagar: mismos criterios que antes.
 */
router.get('/dashboard', async (req, res) => {
  try {
    const { colegio_id } = req.user;

    const [colegio] = await query(
      'SELECT anio_activo, total_pensiones, moneda FROM colegios WHERE id = ? LIMIT 1',
      [colegio_id]
    );
    const anioActivo = parseInt(colegio?.anio_activo || new Date().getFullYear(), 10);
    const totalPensiones = parseInt(colegio?.total_pensiones || 10);
    const moneda = colegio?.moneda || 'S/';

    // Matrículas del año activo, solo Regular (estado = 0)
    const matriculasActivas = await query(
      `SELECT m.id, m.alumno_id, m.grupo_id, c.pension, c.matricula, g.grado, g.seccion, n.nombre as nivel_nombre
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       INNER JOIN costos c ON c.id = m.costo_id
       LEFT JOIN niveles n ON n.id = g.nivel_id
       WHERE m.colegio_id = ? AND g.anio = ? AND (m.estado = 0)`,
      [colegio_id, anioActivo]
    );

    const matIds = (matriculasActivas || []).map(m => m.id);
    const matIdsForQuery = matIds.length ? matIds : [0];

    // Matriculados que YA PAGARON matrícula (pago tipo=0, CANCELADO)
    const matriculasPagadas = await query(
      `SELECT DISTINCT p.matricula_id
       FROM pagos p
       WHERE p.matricula_id IN (${matIdsForQuery.map(() => '?').join(',')})
         AND p.colegio_id = ? AND p.estado = 'ACTIVO' AND p.tipo = 0 AND p.estado_pago = 'CANCELADO'`,
      [...matIdsForQuery, colegio_id]
    );
    const matIdsPagadas = new Set((matriculasPagadas || []).map(r => r.matricula_id));
    const alumnoIdsPagados = [...new Set(
      (matriculasActivas || []).filter(m => matIdsPagadas.has(m.id)).map(m => m.alumno_id)
    )];

    // Matriculados SIN PAGAR matrícula (inscritos pero no tienen pago tipo=0 CANCELADO)
    const matriculasSinPagar = (matriculasActivas || []).filter(m => !matIdsPagadas.has(m.id));
    const totalMatriculadosSinPagar = matriculasSinPagar.length;
    const alumnoIdsSinPagar = [...new Set(matriculasSinPagar.map(m => m.alumno_id))];

    const matriculasPagadasList = (matriculasActivas || []).filter(m => matIdsPagadas.has(m.id));

    // Total Grados
    const [rGrados] = await query(
      'SELECT COUNT(*) as total FROM grupos WHERE colegio_id = ? AND anio = ?',
      [colegio_id, anioActivo]
    );

    // Total Trabajadores
    const [rTrabajadores] = await query(
      `SELECT COUNT(*) as total FROM personal p
       WHERE p.colegio_id = ? AND ${sqlPersonalSinSuperadmin('p')}`,
      [colegio_id]
    );

    const totalAlumnos = alumnoIdsPagados.length;
    let totalApoderados = 0;
    if (alumnoIdsPagados.length > 0) {
      const ph = alumnoIdsPagados.map(() => '?').join(',');
      const [rAp] = await query(
        `SELECT COUNT(DISTINCT f.apoderado_id) as total FROM familias f WHERE f.alumno_id IN (${ph})`,
        alumnoIdsPagados
      );
      totalApoderados = rAp?.total ?? 0;
    }

    // Presupuesto Anual (matrícula + pensiones por alumno pagado)
    let presupuestoAnual = 0;
    for (const mat of matriculasPagadasList) {
      const pension = parseFloat(mat.pension || 0);
      const matriculaCosto = parseFloat(mat.matricula || 0);
      presupuestoAnual += matriculaCosto + pension * totalPensiones;
    }

    let totalIngresos = 0;
    let totalMoraRecaudada = 0;
    if (matriculasPagadasList.length > 0) {
      const matIdsP = matriculasPagadasList.map(m => m.id);
      const ph = matIdsP.map(() => '?').join(',');
      const [rIngresos] = await query(
        `SELECT
           COALESCE(SUM(p.monto), 0) AS total_ingresos,
           COALESCE(SUM(COALESCE(p.mora, 0)), 0) AS total_mora
         FROM pagos p
         WHERE p.colegio_id = ? AND p.estado = 'ACTIVO' AND p.estado_pago = 'CANCELADO'
           AND p.matricula_id IN (${ph})`,
        [colegio_id, ...matIdsP]
      );
      totalIngresos = parseFloat(rIngresos?.total_ingresos || 0);
      totalMoraRecaudada = parseFloat(rIngresos?.total_mora || 0);
    }

    const totalDeuda = Math.max(0, presupuestoAnual - totalIngresos);

    // Deudas anteriores
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
      const [rPagos] = await query(
        `SELECT COALESCE(SUM(p.monto), 0) as pagado
         FROM pagos p
         WHERE p.matricula_id = ? AND p.colegio_id = ? AND p.estado = 'ACTIVO' AND p.estado_pago = 'CANCELADO'`,
        [mat.id, colegio_id]
      );
      const pension = parseFloat(mat.pension || 0);
      const matriculaCosto = parseFloat(mat.matricula || 0);
      const totalPagar = matriculaCosto + pension * totalPensiones;
      const pagado = parseFloat((rPagos && rPagos[0]?.pagado) || 0);
      deudasAnteriores += Math.max(0, totalPagar - pagado);
    }

    // Datos para gráficos: ingresos por mes (últimos 6 meses)
    const ingresosPorMes = await query(
      `SELECT DATE_FORMAT(p.fecha_hora, '%Y-%m') as mes, COALESCE(SUM(p.monto), 0) as total
       FROM pagos p
       INNER JOIN matriculas m ON m.id = p.matricula_id
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE p.colegio_id = ? AND p.estado = 'ACTIVO' AND p.estado_pago = 'CANCELADO'
         AND g.anio = ? AND p.fecha_hora >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
       GROUP BY DATE_FORMAT(p.fecha_hora, '%Y-%m')
       ORDER BY mes ASC`,
      [colegio_id, anioActivo]
    );

    // Alumnos por nivel (solo matriculados pagados)
    const alumnosPorNivel = [];
    if (matriculasPagadasList.length > 0) {
      const porNivel = {};
      for (const m of matriculasPagadasList) {
        const niv = m.nivel_nombre || 'Sin nivel';
        porNivel[niv] = (porNivel[niv] || 0) + 1;
      }
      alumnosPorNivel.push(...Object.entries(porNivel).map(([nombre, total]) => ({ nombre, total })));
    }

    res.json({
      total_grados: rGrados?.total ?? 0,
      total_trabajadores: rTrabajadores?.total ?? 0,
      total_alumnos: totalAlumnos,
      total_apoderados: totalApoderados,
      matriculados_sin_pagar: totalMatriculadosSinPagar,
      presupuesto_anual: presupuestoAnual,
      total_ingresos: totalIngresos,
      total_mora_recaudada: totalMoraRecaudada,
      total_deuda: totalDeuda,
      deudas_anteriores: deudasAnteriores,
      moneda,
      anio_activo: anioActivo,
      ingresos_por_mes: ingresosPorMes || [],
      alumnos_por_nivel: alumnosPorNivel
    });
  } catch (error) {
    console.error('Error dashboard promotoria:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

module.exports = router;
