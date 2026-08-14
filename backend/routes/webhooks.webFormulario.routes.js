/**
 * Webhook interno: la web pública (web-vanguard) avisa a la intranet
 * cuando se registra un formulario, para notificar ADMINISTRADORES.
 *
 * POST /api/webhooks/web-formulario
 * Auth: header X-Web-Formulario-Token o ?token=  (= WEB_FORMULARIO_WEBHOOK_SECRET)
 *
 * Canales: reclamo | queja | sugerencia | contacto | visita | trabaja | admision
 */
const express = require('express');
const router = express.Router();
const {
  notificarAdminsWebFormulario,
  normalizeCanal,
  CANAL_META,
} = require('../services/webFormularioNotificacionService');
const { DEFAULT_COLEGIO_ID } = require('../utils/defaultColegio');

function expectedSecret() {
  return String(process.env.WEB_FORMULARIO_WEBHOOK_SECRET || '').trim();
}

function assertAuth(req, res) {
  const expected = expectedSecret();
  if (!expected) {
    res.status(503).json({ error: 'WEB_FORMULARIO_WEBHOOK_SECRET no configurado en la intranet.' });
    return false;
  }
  const got =
    String(req.headers['x-web-formulario-token'] || '').trim() ||
    String(req.query?.token || '').trim() ||
    (String(req.headers.authorization || '').toLowerCase().startsWith('bearer ')
      ? String(req.headers.authorization).slice(7).trim()
      : '');
  if (!got || got !== expected) {
    res.status(401).json({ error: 'No autorizado.' });
    return false;
  }
  return true;
}

router.post('/web-formulario', async (req, res) => {
  if (!assertAuth(req, res)) return;

  try {
    const body = req.body || {};
    const canal = normalizeCanal(body.canal || body.tipo_canal, body.tipo);

    if (!CANAL_META[canal]) {
      return res.status(400).json({
        error:
          'canal inválido (use reclamo, queja, sugerencia, contacto, visita, trabaja o admision).',
      });
    }

    const nombre = String(
      body.nombre ||
        body.nombres_apoderado ||
        [body.nombres_estudiante, body.apellidos_estudiante].filter(Boolean).join(' ') ||
        ''
    ).trim();
    if (!nombre) {
      return res.status(400).json({ error: 'nombre es obligatorio.' });
    }

    const result = await notificarAdminsWebFormulario({
      canal,
      tipo: body.tipo || canal,
      id: body.id != null ? parseInt(body.id, 10) : null,
      nombre,
      email: body.email || body.email_apoderado,
      telefono: body.telefono || body.telefono_apoderado,
      resumen: body.resumen || body.mensaje || body.detalle || body.asunto || body.puesto || '',
      numero: body.numero,
      colegioId: body.colegio_id ? parseInt(body.colegio_id, 10) : DEFAULT_COLEGIO_ID,
    });

    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('[webhooks/web-formulario]', e);
    res.status(500).json({ error: e.message || 'Error al notificar.' });
  }
});

module.exports = router;
