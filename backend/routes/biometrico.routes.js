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
  simularMarcacionHoy,
  getLastWebhook,
  buildBodyFromRequest,
  listRecentEvents,
  listMarcacionesAsistencia,
  deleteEventosOmitidos,
  deleteAsistenciaEntradaHoy,
  webhookPublicUrl,
  hoyLimaISO,
  nowLima,
} = require('../utils/biometricoHikvision');
const { query } = require('../utils/mysql');
const { DEFAULT_COLEGIO_ID } = require('../utils/defaultColegio');

function eventFiltersFromQuery(q = {}) {
  const hoy = hoyLimaISO();
  const desde = q.desde != null && String(q.desde).trim() !== '' ? String(q.desde).slice(0, 10) : hoy;
  const hasta = q.hasta != null && String(q.hasta).trim() !== '' ? String(q.hasta).slice(0, 10) : hoy;
  return {
    personalId: q.personal_id || q.personalId || '',
    desde,
    hasta,
    limit: q.limit || 100,
  };
}

function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || req.ip || req.socket?.remoteAddress || null;
}

async function handleEventPost(req, res) {
  const ip = clientIp(req);
  try {
    assertWebhookAuth(req);

    const body = buildBodyFromRequest(req);
    const rawBody = req.rawBody || null;

    const result = await ingestHikvisionPayload(body, {
      ip,
      colegioId: process.env.BIOMETRICO_COLEGIO_ID || DEFAULT_COLEGIO_ID,
      rawBody,
    });

    // Heartbeat / histórico / reenvíos: no inundar pm2 (BIOMETRICO_DEBUG=1 para ver todo).
    const reason = result?.reason || result?.action || 'ok';
    const silent = [
      'no_employee',
      'historico',
      'unparsed',
      'ya_procesado',
      'kept_between',
    ].includes(reason);
    if (!silent || process.env.BIOMETRICO_DEBUG === '1') {
      console.log(
        '[biometrico] recv',
        reason,
        result?.employeeNo || '-',
        result?.name || '-',
        result?.fecha || '-',
        result?.hora || '-',
        ip || '-'
      );
    }

    return res.status(200).json({ ok: true, ack: true, reason: result?.reason || result?.action || 'ok' });
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
    const filters = eventFiltersFromQuery(req.query);
    const listaBio = await listMarcacionesAsistencia(req.user.colegio_id, {
      ...filters,
      limit: 200,
    });
    const marcaciones = listaBio?.filas || [];
    // Solo para detectar si falta migración 067 (tabla log); la UI usa marcaciones.
    const eventsProbe = await listRecentEvents(req.user.colegio_id, { ...filters, limit: 1 }).catch((e) => {
      if (String(e.message || '').includes('biometrico_eventos_log')) return null;
      throw e;
    });
    const last = getLastWebhook();
    const lima = nowLima();
    const appliedOk = [
      'insertado',
      'actualizado_entrada',
      'actualizado_salida',
      'actualizado',
    ].includes(last.reason) || ['insertado', 'actualizado_entrada', 'actualizado_salida'].includes(last.action);
    res.json({
      webhook_configurado: tokenOk,
      webhook_url: tokenOk ? webhookPublicUrl(req) : null,
      webhook_url_hint: tokenOk
        ? 'Pegue esta URL en el huellero: Configuration → Network → Network Service → HTTP(S) → HTTP Listening.'
        : 'Defina BIOMETRICO_WEBHOOK_TOKEN y BIOMETRICO_PUBLIC_URL=https://sistema.vanguardschools.edu.pe en backend/.env y reinicie PM2.',
      migracion_pendiente: eventsProbe === null,
      marcaciones,
      eventos: marcaciones,
      total_descuento: listaBio?.total_descuento ?? 0,
      total_minutos: listaBio?.total_minutos ?? 0,
      total_registros: listaBio?.total_registros ?? marcaciones.length,
      tarifa_por_minuto: listaBio?.tarifa_por_minuto ?? null,
      formula_descuento: listaBio?.formula_descuento || 'sueldo / 30 / 8 / 60',
      filtros: { ...filters, hoy: hoyLimaISO() },
      ultimo_contacto: last,
      servidor_ahora: { fecha: lima.fecha, hora: lima.hora },
      diagnostico:
        !last.at
          ? 'Aún no llegó ningún POST del huellero a este proceso (HTTP Listening apagado, URL/token mal, o PM2 reiniciado hace poco).'
          : last.reason === 'historico'
            ? `El huellero SÍ está enviando, pero con fecha de dispositivo ${last.fecha || '—'} (hoy servidor: ${lima.fecha}). Corrija fecha/NTP del terminal.`
            : last.reason === 'no_employee'
              ? 'Llegan heartbeats/puerta sin persona. Marque con huella/cara para enviar un evento con empleado.'
              : last.reason === 'no_match'
                ? 'Llegó una marcación de hoy pero no coincidió con personal. Revise nombre/DNI/código biométrico.'
                : last.reason === 'actualizado_salida'
                  ? 'Última marcación guardada como salida (se actualiza con la más tardía).'
                  : appliedOk
                    ? 'Última marcación aplicada correctamente.'
                    : `Último motivo: ${last.reason || last.action || '—'}.`,
      mapeo:
        '1ª marcación del día = entrada (se mantiene la más temprana). Marcaciones siguientes = salida (siempre la última/más tardía). El historial del huellero no se guarda.',
      tz: 'America/Lima',
    });
  } catch (e) {
    console.error('[biometrico/admin/estado]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

/** Simula marcación de hoy del admin logueado (o personal_id del body) para probar el backend. */
router.post('/admin/probar-marcacion', authenticateToken, async (req, res) => {
  try {
    if (req.user?.tipo !== 'ADMINISTRADOR') {
      return res.status(403).json({ error: 'Solo administrador' });
    }
    const colegioId = req.user.colegio_id;
    let personalId = parseInt(req.body?.personal_id || req.body?.personalId || 0, 10) || null;

    let row;
    if (personalId) {
      const rows = await query(
        `SELECT p.id as personal_id, p.nombres, p.apellidos, p.nro_documento, p.codigo_biometrico, u.id as usuario_id
         FROM personal p
         LEFT JOIN usuarios u ON u.personal_id = p.id AND u.estado = 'ACTIVO'
         WHERE p.id = ? AND p.colegio_id = ?
         LIMIT 1`,
        [personalId, colegioId]
      );
      row = rows[0];
    } else {
      const rows = await query(
        `SELECT p.id as personal_id, p.nombres, p.apellidos, p.nro_documento, p.codigo_biometrico, u.id as usuario_id
         FROM usuarios u
         INNER JOIN personal p ON p.id = u.personal_id
         WHERE u.id = ? AND p.colegio_id = ?
         LIMIT 1`,
        [req.user.id, colegioId]
      );
      row = rows[0];
    }

    if (!row?.personal_id) {
      return res.status(400).json({
        error:
          'No hay personal vinculado a este admin. Envíe personal_id en el body o asocie su usuario a un registro de personal.',
      });
    }
    if (!row.usuario_id) {
      return res.status(400).json({ error: 'Ese personal no tiene usuario ACTIVO; no se puede marcar asistencia.' });
    }

    const employeeNo =
      String(row.codigo_biometrico || '').trim() ||
      String(row.nro_documento || '').trim() ||
      String(row.personal_id);
    const name = `${row.apellidos || ''} ${row.nombres || ''}`.trim();

    const result = await simularMarcacionHoy({
      colegioId,
      employeeNo,
      name,
      ip: 'admin-probar',
    });

    res.json({
      ok: true,
      prueba: true,
      personal_id: row.personal_id,
      employeeNo,
      name,
      resultado: result,
      mensaje:
        result.action === 'insertado'
          ? 'Entrada de prueba OK (1ª marcación del día).'
          : result.action === 'actualizado_salida'
            ? 'Salida de prueba OK (se actualizó la hora de salida).'
            : result.action === 'actualizado_entrada'
              ? 'Entrada actualizada (llegó una hora más temprana).'
              : result.reason === 'ya_procesado' || result.action === 'ya_procesado'
                ? 'Misma hora ya registrada (prueba OK del pipeline).'
                : `Prueba respondió: ${result.reason || result.action || 'sin detalle'}`,
    });
  } catch (e) {
    console.error('[biometrico/admin/probar-marcacion]', e);
    res.status(500).json({ error: e.message || 'Error en prueba' });
  }
});

router.get('/admin/eventos', authenticateToken, async (req, res) => {
  try {
    if (req.user?.tipo !== 'ADMINISTRADOR') {
      return res.status(403).json({ error: 'Solo administrador' });
    }
    const filters = eventFiltersFromQuery(req.query);
    const rows = await listRecentEvents(req.user.colegio_id, filters);
    res.json({ eventos: rows, filtros: { ...filters, hoy: hoyLimaISO() } });
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

/** Emergencia: borra ENTRADAS de asistencia del día (limpiar flood histórico mal aplicado). */
router.delete('/admin/asistencia-hoy', authenticateToken, async (req, res) => {
  try {
    if (req.user?.tipo !== 'ADMINISTRADOR') {
      return res.status(403).json({ error: 'Solo administrador' });
    }
    const out = await deleteAsistenciaEntradaHoy(req.user.colegio_id);
    res.json({ ok: true, ...out });
  } catch (e) {
    console.error('[biometrico/admin/asistencia-hoy]', e);
    res.status(500).json({ error: e.message || 'Error al borrar asistencia de hoy' });
  }
});

module.exports = router;
