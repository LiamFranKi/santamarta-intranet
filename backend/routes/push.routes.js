const express = require('express');
const router = express.Router();
const { query, execute } = require('../utils/mysql');
const { authenticateToken } = require('../middleware/auth');
const { enviarPushNotification, enviarPushNotificationMultiple } = require('../services/pushNotificationService');

/**
 * POST /api/push/subscribe
 * Suscribir usuario a notificaciones push
 */
router.post('/subscribe', authenticateToken, async (req, res) => {
  try {
    const { subscription } = req.body;
    const { usuario_id, colegio_id } = req.user;

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Subscription inválida' });
    }

    // Verificar si ya existe una suscripción con este endpoint
    const existente = await query(
      `SELECT id FROM push_subscriptions WHERE endpoint = ? LIMIT 1`,
      [subscription.endpoint]
    );

    if (existente.length > 0) {
      // Actualizar suscripción existente
      await execute(
        `UPDATE push_subscriptions 
         SET usuario_id = ?, colegio_id = ?, p256dh = ?, auth = ?, user_agent = ?, activo = 1, fecha_actualizacion = NOW()
         WHERE endpoint = ?`,
        [
          usuario_id,
          colegio_id,
          subscription.keys.p256dh,
          subscription.keys.auth,
          req.headers['user-agent'],
          subscription.endpoint
        ]
      );
    } else {
      // Crear nueva suscripción
      await execute(
        `INSERT INTO push_subscriptions (usuario_id, colegio_id, endpoint, p256dh, auth, user_agent, fecha_creacion)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [
          usuario_id,
          colegio_id,
          subscription.endpoint,
          subscription.keys.p256dh,
          subscription.keys.auth,
          req.headers['user-agent']
        ]
      );
    }

    res.json({ success: true, message: 'Suscripción registrada correctamente' });
  } catch (error) {
    console.error('Error registrando suscripción push:', error);
    res.status(500).json({ error: 'Error al registrar suscripción' });
  }
});

/**
 * POST /api/push/unsubscribe
 * Desuscribir usuario de notificaciones push
 */
router.post('/unsubscribe', authenticateToken, async (req, res) => {
  try {
    const { endpoint } = req.body;
    const { usuario_id } = req.user;

    if (!endpoint) {
      return res.status(400).json({ error: 'Endpoint requerido' });
    }

    await execute(
      `UPDATE push_subscriptions SET activo = 0, fecha_actualizacion = NOW() 
       WHERE endpoint = ? AND usuario_id = ?`,
      [endpoint, usuario_id]
    );

    res.json({ success: true, message: 'Desuscripción exitosa' });
  } catch (error) {
    console.error('Error desuscribiendo push:', error);
    res.status(500).json({ error: 'Error al desuscribir' });
  }
});

/**
 * POST /api/push/unsubscribe-all
 * Marcar todas las suscripciones del usuario como inactivas (cuando no hay subscription local)
 */
router.post('/unsubscribe-all', authenticateToken, async (req, res) => {
  try {
    const { usuario_id } = req.user;
    await execute(
      `UPDATE push_subscriptions SET activo = 0, fecha_actualizacion = NOW() 
       WHERE usuario_id = ?`,
      [usuario_id]
    );
    res.json({ success: true, message: 'Desuscripción exitosa' });
  } catch (error) {
    console.error('Error desuscribiendo push (all):', error);
    res.status(500).json({ error: 'Error al desuscribir' });
  }
});

/**
 * GET /api/push/public-key
 * Obtener la clave pública VAPID para suscripción
 */
router.get('/public-key', (req, res) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return res.status(500).json({ error: 'VAPID public key no configurada' });
  }
  res.json({ publicKey });
});

module.exports = router;

