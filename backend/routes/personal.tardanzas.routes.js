/**
 * Tardanzas del mes para el personal autenticado (cualquier tipo de usuario con ficha).
 */
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  calcularTardanzasMesPersonal,
  calcTardanza,
  formatHoraDisplay,
  DESCUENTO_POR_MINUTO,
  MESES_ES,
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
      const { minutos_tardanza: minutosTardanza, descuento } = calcTardanza(
        horaEntradaConfigurada,
        registro.hora_entrada
      );
      totalMinutosTardanza += minutosTardanza;
      const fechaStr = registro.fecha instanceof Date
        ? registro.fecha.toISOString().slice(0, 10)
        : String(registro.fecha).slice(0, 10);
      return {
        fecha: fechaStr,
        hora_entrada_real: horaEntradaConfigurada,
        hora_entrada_real_fmt: formatHoraDisplay(horaEntradaConfigurada),
        hora_marcacion: registro.hora_entrada,
        hora_marcacion_fmt: formatHoraDisplay(registro.hora_entrada),
        minutos_tardanza: minutosTardanza,
        descuento,
      };
    });

    const totalDescuento = Math.round(totalMinutosTardanza * DESCUENTO_POR_MINUTO * 100) / 100;

    res.json({
      asistencias: asistenciasConCalculos,
      total_minutos_tardanza: totalMinutosTardanza,
      total_descuento: totalDescuento,
      hora_entrada_configurada: horaEntradaConfigurada,
      hora_entrada_configurada_fmt: formatHoraDisplay(horaEntradaConfigurada),
      mes: mesInt,
      anio: anioInt,
      mes_nombre: MESES_ES[mesInt - 1] || `Mes ${mesInt}`,
      tarifa_por_minuto: DESCUENTO_POR_MINUTO,
    });
  } catch (e) {
    console.error('[personal/tardanzas/asistencias]', e);
    res.status(500).json({ error: e.message || 'Error al obtener asistencias.' });
  }
});

module.exports = router;
