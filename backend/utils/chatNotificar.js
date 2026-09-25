/**
 * Campanita + push al recibir un mensaje de Chat Vanguard.
 * Una fila sin leer por persona y conversación: si siguen escribiendo, se actualiza
 * esa fila (no se llena la bandeja). El push sale solo cuando aparece el aviso nuevo.
 */
const { query, execute } = require('./mysql');
const { fechaHoraMySQLLima } = require('./fechaHoraLima');
const { insertNotificacionUsuario } = require('./notificacionInsert');
const { invalidarBandejaUsuarios } = require('./notificacionesBandeja');
const { enviarPushNotificacionesIndividuales } = require('../services/pushNotificationService');
const { destinatariosDeSala } = require('./chatVanguard');

async function notificarMensajeChat({ sala, texto, remitenteId, remitenteNombre }) {
  if (!sala?.id) return;
  let dest = await destinatariosDeSala(sala, remitenteId);
  if (!dest.length) return;
  try {
    const phP = dest.map(() => '?').join(',');
    const leyendo = await query(
      `SELECT usuario_id FROM chat_presencia
       WHERE sala_id = ? AND usuario_id IN (${phP})
         AND visto_at >= DATE_SUB(?, INTERVAL 20 SECOND)`,
      [sala.id, ...dest, fechaHoraMySQLLima()]
    );
    const dentro = new Set(leyendo.map((r) => Number(r.usuario_id)));
    dest = dest.filter((id) => !dentro.has(id));
  } catch (e) {
    if (e.code !== 'ER_NO_SUCH_TABLE') console.warn('[chat] presencia:', e.message);
  }
  if (!dest.length) return;
  try {
    const phS = dest.map(() => '?').join(',');
    const enApp = await query(
      `SELECT DISTINCT usuario_id FROM chat_sesion
       WHERE usuario_id IN (${phS})
         AND visto_at >= DATE_SUB(?, INTERVAL 25 SECOND)`,
      [...dest, fechaHoraMySQLLima()]
    );
    const dentroApp = new Set(enApp.map((r) => Number(r.usuario_id)));
    dest = dest.filter((id) => !dentroApp.has(id));
  } catch (e) {
    if (e.code !== 'ER_NO_SUCH_TABLE') console.warn('[chat] sesion:', e.message);
  }
  if (!dest.length) return;

  const nombre = String(remitenteNombre || 'Alguien').trim() || 'Alguien';
  const asunto = sala.tipo === 'dm' ? `Mensaje de ${nombre}` : `Chat · ${sala.titulo}`;
  const linea = `${nombre}: ${String(texto || '').replace(/\s+/g, ' ').trim()}`.slice(0, 220);
  const url = `/chat?sala=${sala.id}`;
  const payload = { sala_id: Number(sala.id) };
  const ahora = fechaHoraMySQLLima();
  const ph = dest.map(() => '?').join(',');

  let existentes = [];
  try {
    existentes = await query(
      `SELECT id, destinatario_id FROM notificaciones
       WHERE para = 'USUARIO' AND accion_tipo = 'chat_vanguard'
         AND COALESCE(leida, 0) = 0
         AND destinatario_id IN (${ph})
         AND JSON_UNQUOTE(JSON_EXTRACT(accion_payload, '$.sala_id')) = ?
       ORDER BY id DESC`,
      [...dest, String(sala.id)]
    );
  } catch (e) {
    console.warn('[chat] aviso previo:', e.message);
  }

  const ya = new Map();
  existentes.forEach((r) => {
    const id = Number(r.destinatario_id);
    if (!ya.has(id)) ya.set(id, r.id);
  });

  const nuevos = [];
  for (const uid of dest) {
    const prev = ya.get(uid);
    if (prev) {
      await execute(
        `UPDATE notificaciones SET asunto = ?, contenido = ?, fecha_hora = ? WHERE id = ?`,
        [asunto, linea, ahora, prev]
      );
    } else {
      await insertNotificacionUsuario(execute, {
        usuario_id: remitenteId,
        destinatario_id: uid,
        asunto,
        contenido: linea,
        accion_tipo: 'chat_vanguard',
        accion_payload: payload,
        url_destino: url,
      });
      nuevos.push(uid);
    }
  }

  invalidarBandejaUsuarios(dest);
  if (!nuevos.length) return;

  const phN = nuevos.map(() => '?').join(',');
  let subs = [];
  try {
    subs = await query(
      `SELECT usuario_id, endpoint, p256dh, auth FROM push_subscriptions
       WHERE usuario_id IN (${phN}) AND colegio_id = ? AND (activo = 1 OR activo IS NULL)`,
      [...nuevos, sala.colegio_id]
    );
  } catch {
    subs = [];
  }
  if (!subs.length) return;

  const body = linea.length > 110 ? `${linea.slice(0, 107)}…` : linea;
  const items = subs.map((sub) => ({
    subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    payload: {
      title: asunto,
      body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      tag: `chat-vanguard-${sala.id}-${sub.usuario_id}`,
      data: { url, tipo: 'chat_vanguard', sala_id: sala.id },
    },
  }));
  enviarPushNotificacionesIndividuales(items).catch((err) =>
    console.warn('[chat] push:', err.message)
  );
}

async function marcarAvisosChatLeidos(usuarioId, salaId) {
  if (!usuarioId || !salaId) return;
  try {
    await execute(
      `UPDATE notificaciones SET leida = 1
       WHERE para = 'USUARIO' AND destinatario_id = ?
         AND accion_tipo = 'chat_vanguard' AND COALESCE(leida, 0) = 0
         AND JSON_UNQUOTE(JSON_EXTRACT(accion_payload, '$.sala_id')) = ?`,
      [usuarioId, String(salaId)]
    );
    invalidarBandejaUsuarios([usuarioId]);
  } catch (e) {
    console.warn('[chat] marcar avisos:', e.message);
  }
}

module.exports = { notificarMensajeChat, marcarAvisosChatLeidos };
