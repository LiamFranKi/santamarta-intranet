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
  listRecentEvents,
  webhookPublicUrl,
} = require('../utils/biometricoHikvision');
const { DEFAULT_COLEGIO_ID } = require('../utils/defaultColegio');

function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || req.ip || req.socket?.remoteAddress || null;
}

function parseBodyMaybeText(req) {
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length) {
    return req.body;
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch {
      return { raw: req.body };
    }
  }
  return req.body || {};
}

/** Health / prueba de conectividad del terminal (algunos firmware hacen GET). */
router.get('/hikvision/eventos', (req, res) => {
  try {
    assertWebhookAuth(req);
    res.status(200).json({
      ok: true,
      service: 'biometrico-hikvision',
      message: 'Webhook activo. Configure el dispositivo para POST AccessControllerEvent aquí.',
    });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, error: e.message });
  }
});

/**
 * Receptor de eventos del huellero (sin JWT; autenticado por token).
 * Acepta JSON y multipart/form-data.
 */
router.post('/hikvision/eventos', (req, res) => {
  uploadAny(req, res, async (err) => {
    if (err) {
      console.error('[biometrico] multer', err.message);
      return res.status(400).json({ ok: false, error: 'Payload inválido' });
    }
    try {
      assertWebhookAuth(req);

      let body = parseBodyMaybeText(req);
      // Si multipart trajo campos string JSON, merge
      if (req.files?.length) {
        for (const f of req.files) {
          if (f.fieldname && f.buffer) {
            const asText = f.buffer.toString('utf8');
            const parsed = (() => {
              try {
                return JSON.parse(asText);
              } catch {
                return null;
              }
            })();
            if (parsed) {
              body = { ...body, [f.fieldname]: parsed, AccessControllerEvent: parsed.AccessControllerEvent || parsed };
            } else {
              body = { ...body, [f.fieldname]: asText };
            }
          }
        }
      }

      const result = await ingestHikvisionPayload(body, {
        ip: clientIp(req),
        colegioId: process.env.BIOMETRICO_COLEGIO_ID || DEFAULT_COLEGIO_ID,
      });

      // Hikvision espera 200; no fallar el device por OMITIDO
      return res.status(200).json({ ok: true, ...result });
    } catch (e) {
      console.error('[biometrico] webhook', e.message);
      return res.status(e.status || 500).json({ ok: false, error: e.message || 'Error' });
    }
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
        ? 'Pegue esta URL en el huellero: Configuración → Red → Notificación avanzada / Monitoreo HTTP (Listening Host).'
        : 'Defina BIOMETRICO_WEBHOOK_TOKEN y BIOMETRICO_PUBLIC_URL en backend/.env y reinicie PM2.',
      migracion_pendiente: events === null,
      eventos: events || [],
      mapeo:
        'Prioridad: personal.codigo_biometrico = employeeNo del terminal. Si está vacío, se usa DNI. Si no, nombre.',
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

module.exports = router;
