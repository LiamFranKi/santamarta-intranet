/**
 * Webhook público Hikvision + endpoints admin de estado.
 * POST /api/biometrico/hikvision/eventos?token=...
 */
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  uploadAny,
  assertWebhookAuth,
  webhookTokenConfigured,
  ingestHikvisionPayload,
  buildBodyFromRequest,
  listRecentEvents,
  deleteEventosOmitidos,
  webhookPublicUrl,
} = require('../utils/biometricoHikvision');
const { DEFAULT_COLEGIO_ID } = require('../utils/defaultColegio');

function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || req.ip || req.socket?.remoteAddress || null;
}

async function handleEventPost(req, res) {
  try {
    assertWebhookAuth(req);

    const body = buildBodyFromRequest(req);
    const rawBody = req.rawBody || null;

    console.log('[biometrico] POST', {
      ct: req.headers['content-type'],
      keys: Object.keys(body || {}),
      files: (req.files || []).map((f) => f.fieldname),
      hasRaw: !!rawBody,
    });

    const result = await ingestHikvisionPayload(body, {
      ip: clientIp(req),
      colegioId: process.env.BIOMETRICO_COLEGIO_ID || DEFAULT_COLEGIO_ID,
      rawBody,
    });

    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    console.error('[biometrico] webhook', e.message);
    return res.status(e.status || 500).json({ ok: false, error: e.message || 'Error' });
  }
}

/** Health / prueba de conectividad del terminal */
router.get('/hikvision/eventos', (req, res) => {
  try {
    assertWebhookAuth(req);
    res.status(200).json({
      ok: true,
      service: 'biometrico-hikvision',
      message: 'Webhook activo. Configure el dispositivo para POST AccessControllerEvent aquí.',
      tz: 'America/Lima',
    });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, error: e.message });
  }
});

router.post('/hikvision/eventos', (req, res) => {
  uploadAny(req, res, (err) => {
    if (err) {
      console.error('[biometrico] multer', err.message);
      return res.status(400).json({ ok: false, error: 'Payload inválido' });
    }
    return handleEventPost(req, res);
  });
});

/** Admin: estado del webhook + URL para pegar en el dispositivo */
router.get('/admin/estado', authenticateToken, async (req, res) => {
  try {
    if (req.user?.tipo !== 'ADMINISTRADOR') {
      return res.status(403).json({ error: 'Solo administrador' });
    }
    const tokenOk = !!webhookTokenConfigured();
    const events = await listRecentEvents(req.user.colegio_id, 40).catch((e) => {
      if (String(e.message || '').includes('biometrico_eventos_log')) return null;
      throw e;
    });
    res.json({
      webhook_configurado: tokenOk,
      webhook_url: tokenOk ? webhookPublicUrl(req) : null,
      webhook_url_hint: tokenOk
        ? 'Pegue esta URL en el huellero: Configuration → Network → Network Service → HTTP(S) → HTTP Listening.'
        : 'Defina BIOMETRICO_WEBHOOK_TOKEN y BIOMETRICO_PUBLIC_URL=https://sistema.vanguardschools.edu.pe en backend/.env y reinicie PM2.',
      migracion_pendiente: events === null,
      eventos: events || [],
      mapeo:
        'Prioridad: personal.codigo_biometrico = employeeNo del terminal. Si está vacío, se usa DNI. Si no, nombre. Zona horaria: Lima (UTC-5).',
      tz: 'America/Lima',
    });
  } catch (e) {
    console.error('[biometrico/admin/estado]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.get('/admin/eventos', authenticateToken, async (req, res) => {
  try {
    if (req.user?.tipo !== 'ADMINISTRADOR') {
      return res.status(403).json({ error: 'Solo administrador' });
    }
    const rows = await listRecentEvents(req.user.colegio_id, req.query.limit || 50);
    res.json({ eventos: rows });
  } catch (e) {
    if (String(e.message || '').includes('biometrico_eventos_log')) {
      return res.status(503).json({
        error: 'Ejecute la migración 067_biometrico_hikvision_mysql.sql en MySQL.',
      });
    }
    console.error('[biometrico/admin/eventos]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

/** DELETE omitidos del log (no borra marcaciones de asistencia). */
router.delete('/admin/eventos/omitidos', authenticateToken, async (req, res) => {
  try {
    if (req.user?.tipo !== 'ADMINISTRADOR') {
      return res.status(403).json({ error: 'Solo administrador' });
    }
    const out = await deleteEventosOmitidos(req.user.colegio_id);
    res.json({ ok: true, ...out });
  } catch (e) {
    console.error('[biometrico/admin/eventos/omitidos]', e);
    res.status(500).json({ error: e.message || 'Error al borrar' });
  }
});

module.exports = router;
