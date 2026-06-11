/**
 * Tardanzas del mes para el personal autenticado (cualquier tipo de usuario con ficha).
 */
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  calcularTardanzasMesPersonal,
  calcTardanza,
  DESCUENTO_POR_MINUTO,
} = require('../utils/adminTardanzasHuellero');

router.use(authenticateToken);

/** GET /api/personal/tardanzas/mi-mes */
router.get('/mi-mes', async (req, res) => {
  try {
    const { query } = require('../utils/mysql');
    const usuarioId = req.user?.usuario_id || req.user?.id;
    const colegioId = req.user?.colegio_id;
    const anioActivo = req.user?.anio_activo;

    if (!usuarioId) {
      return res.json({ tiene_personal: false });
    }

    const [usuario] = await query(
      `SELECT u.id, u.personal_id, p.hora_entrada
       FROM usuarios u
       LEFT JOIN personal p ON p.id = u.personal_id AND p.colegio_id = u.colegio_id
       WHERE u.id = ? AND u.colegio_id = ?
       LIMIT 1`,
      [usuarioId, colegioId]
    );

    if (!usuario?.personal_id) {
      return res.json({ tiene_personal: false });
    }

    const tardanzaMes = await calcularTardanzasMesPersonal(query, {
      usuario_id: usuarioId,
      colegio_id: colegioId,
      anio_activo: anioActivo,
      hora_entrada_config: usuario.hora_entrada,
    });

    res.json({
      tiene_personal: true,
      ...tardanzaMes,
    });
  } catch (e) {
    console.error('[personal/tardanzas/mi-mes]', e);
    res.status(500).json({ error: e.message || 'Error al calcular tardanzas del mes.' });
  }
});

/** GET /api/personal/tardanzas/asistencias?mes=&anio= */
router.get('/asistencias', async (req, res) => {
  try {
    const { query } = require('../utils/mysql');
    const usuarioId = req.user?.usuario_id || req.user?.id;
    const colegioId = req.user?.colegio_id;
    const anioActivo = req.user?.anio_activo;
    const { mes, anio } = req.query;

    if (!usuarioId) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    const mesInt = mes ? parseInt(mes, 10) : new Date().getMonth() + 1;
    const anioInt = anio ? parseInt(anio, 10) : new Date().getFullYear();

    if (mesInt < 1 || mesInt > 12) {
      return res.status(400).json({ error: 'Mes inválido' });
    }

    const [usuario] = await query(
      `SELECT u.id, u.personal_id, p.hora_entrada
       FROM usuarios u
       LEFT JOIN personal p ON p.id = u.personal_id AND p.colegio_id = u.colegio_id
       WHERE u.id = ? AND u.colegio_id = ? AND u.estado = 'ACTIVO'
       LIMIT 1`,
      [usuarioId, colegioId]
    );

    if (!usuario?.personal_id) {
      return res.status(404).json({ error: 'No tiene ficha de personal vinculada' });
    }

    const horaEntradaConfigurada = usuario.hora_entrada;

    const registrosAsistencia = await query(
      `SELECT ar.fecha, ar.hora_entrada, ar.hora_salida, ar.tipo_registro
       FROM asistencia_registros ar
       WHERE ar.usuario_id = ?
         AND ar.colegio_id = ?
         AND ar.anio = ?
         AND YEAR(ar.fecha) = ?
         AND MONTH(ar.fecha) = ?
         AND ar.hora_entrada IS NOT NULL
         AND (ar.tipo_registro = 'ENTRADA' OR ar.tipo_registro = 'ENTRADA_SALIDA')
       ORDER BY ar.fecha DESC, ar.hora_entrada DESC`,
      [usuarioId, colegioId, anioActivo, anioInt, mesInt]
    );

    let totalMinutosTardanza = 0;
    const asistenciasConCalculos = (registrosAsistencia || []).map((registro) => {
      const { minutos_tardanza: minutosTardanza } = calcTardanza(
        horaEntradaConfigurada,
        registro.hora_entrada
      );
      totalMinutosTardanza += minutosTardanza;
      return {
        ...registro,
        minutos_tardanza: minutosTardanza,
      };
    });

    const totalDescuento = Math.round(totalMinutosTardanza * DESCUENTO_POR_MINUTO * 100) / 100;

    res.json({
      asistencias: asistenciasConCalculos,
      total_minutos_tardanza: totalMinutosTardanza,
      total_descuento: totalDescuento,
      hora_entrada_configurada: horaEntradaConfigurada,
      mes: mesInt,
      anio: anioInt,
    });
  } catch (e) {
    console.error('[personal/tardanzas/asistencias]', e);
    res.status(500).json({ error: e.message || 'Error al obtener asistencias.' });
  }
});

module.exports = router;
