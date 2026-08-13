/**
 * Admin — contención de seguridad: cerrar sesiones y borrar mensajes (cascada).
 */
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { query, execute } = require('../utils/mysql');
const { bumpTokenVersionColegio } = require('../utils/tokenVersion');
const { registrarAccion } = require('../utils/auditoria');

router.use(authenticateToken);
router.use((req, res, next) => {
  if (req.user?.tipo === 'ADMINISTRADOR') return next();
  return res.status(403).json({ error: 'Solo el administrador puede usar estas acciones de seguridad.' });
});

/**
 * POST /api/admin/seguridad/cerrar-sesiones
 * Body: { usuario_id?: number } — si omite, cierra TODAS las sesiones del colegio.
 */
router.post('/cerrar-sesiones', async (req, res) => {
  try {
    const colegioId = req.user.colegio_id;
    const rawUid = req.body?.usuario_id;
    const usuarioId =
      rawUid != null && String(rawUid).trim() !== ''
        ? parseInt(rawUid, 10)
        : null;

    if (usuarioId != null && !Number.isFinite(usuarioId)) {
      return res.status(400).json({ error: 'usuario_id inválido' });
    }

    const ok = await bumpTokenVersionColegio(execute, colegioId, usuarioId);
    if (!ok) {
      return res.status(503).json({
        error:
          'Falta la columna token_version. Ejecute la migración 068_usuarios_token_version_mysql.sql en MySQL.',
      });
    }

    registrarAccion({
      usuario_id: req.user.usuario_id || req.user.id,
      colegio_id: colegioId,
      tipo_usuario: 'ADMINISTRADOR',
      accion: 'CERRAR_SESIONES',
      modulo: 'SEGURIDAD',
      entidad: 'usuario',
      entidad_id: usuarioId || null,
      descripcion: usuarioId
        ? `Forzó cierre de sesión del usuario ${usuarioId}`
        : 'Forzó cierre de sesión de TODOS los usuarios del colegio',
      url: req.originalUrl,
      metodo_http: req.method,
      ip_address: req.ip || req.connection?.remoteAddress,
      user_agent: req.get('user-agent'),
      resultado: 'EXITOSO',
    });
    req.skipAudit = true;

    res.json({
      ok: true,
      message: usuarioId
        ? 'Sesiones de ese usuario cerradas. Deberá volver a iniciar sesión.'
        : 'Todas las sesiones del colegio fueron cerradas. Todos deberán volver a iniciar sesión (incluido usted).',
      alcance: usuarioId ? 'usuario' : 'colegio',
      usuario_id: usuarioId,
    });
  } catch (e) {
    console.error('[admin/seguridad/cerrar-sesiones]', e);
    res.status(500).json({ error: e.message || 'Error al cerrar sesiones' });
  }
});

/**
 * Soft-delete de un envío completo: el mensaje indicado + todos los
 * ENVIADO/RECIBIDO del mismo remitente, misma fecha_hora y mismo asunto.
 * DELETE /api/admin/seguridad/mensajes/:mensajeId
 */
router.delete('/mensajes/:mensajeId', async (req, res) => {
  try {
    const colegioId = req.user.colegio_id;
    const mensajeId = parseInt(req.params.mensajeId, 10);
    if (!Number.isFinite(mensajeId)) {
      return res.status(400).json({ error: 'ID de mensaje inválido' });
    }

    const [msg] = await query(
      `SELECT m.id, m.remitente_id, m.destinatario_id, m.asunto, m.mensaje, m.fecha_hora, m.tipo, m.borrado
       FROM mensajes m
       INNER JOIN usuarios u ON u.id = m.remitente_id AND u.colegio_id = ?
       WHERE m.id = ?
       LIMIT 1`,
      [colegioId, mensajeId]
    );

    if (!msg) {
      return res.status(404).json({ error: 'Mensaje no encontrado en este colegio.' });
    }

    const result = await execute(
      `UPDATE mensajes m
       INNER JOIN usuarios u ON u.id = m.remitente_id AND u.colegio_id = ?
       SET m.borrado = 'SI'
       WHERE m.remitente_id = ?
         AND m.fecha_hora = ?
         AND m.asunto = ?
         AND m.borrado = 'NO'`,
      [colegioId, msg.remitente_id, msg.fecha_hora, msg.asunto]
    );

    // Historial conexiones / grupos del mismo envío
    try {
      await execute(
        `DELETE FROM mensajes_grupos
         WHERE remitente_id = ? AND fecha_hora = ? AND asunto = ?`,
        [msg.remitente_id, msg.fecha_hora, msg.asunto]
      );
    } catch {
      /* tabla puede no existir o no aplicar */
    }

    // Notificaciones de campanita ligadas a ese mensaje (si las hay)
    try {
      await execute(
        `UPDATE notificaciones
         SET estado = 'ELIMINADO'
         WHERE accion_tipo LIKE 'mensaje%'
           AND (
             accion_payload LIKE ?
             OR accion_payload LIKE ?
           )`,
        [`%"mensaje_id":${mensajeId}%`, `%"mensaje_id": ${mensajeId}%`]
      );
    } catch {
      /* ignore */
    }

    const afectados = result?.affectedRows ?? 0;

    registrarAccion({
      usuario_id: req.user.usuario_id || req.user.id,
      colegio_id: colegioId,
      tipo_usuario: 'ADMINISTRADOR',
      accion: 'ELIMINAR',
      modulo: 'MENSAJES',
      entidad: 'mensaje_envio',
      entidad_id: mensajeId,
      descripcion: `Admin borró envío completo (asunto: "${String(msg.asunto || '').slice(0, 80)}", filas: ${afectados})`,
      url: req.originalUrl,
      metodo_http: req.method,
      ip_address: req.ip || req.connection?.remoteAddress,
      user_agent: req.get('user-agent'),
      datos_anteriores: JSON.stringify({
        mensaje_id: msg.id,
        remitente_id: msg.remitente_id,
        asunto: msg.asunto,
        fecha_hora: msg.fecha_hora,
      }),
      resultado: 'EXITOSO',
    });
    req.skipAudit = true;

    res.json({
      ok: true,
      message: `Envío eliminado para todos (${afectados} registro(s) de bandeja).`,
      eliminados: afectados,
      mensaje_id: mensajeId,
    });
  } catch (e) {
    console.error('[admin/seguridad/mensajes DELETE]', e);
    res.status(500).json({ error: e.message || 'Error al eliminar el mensaje' });
  }
});

/**
 * POST /api/admin/seguridad/mensajes/borrar-lote
 * Body: { mensaje_ids: number[] } — cada id dispara borrado en cascada del envío.
 */
router.post('/mensajes/borrar-lote', async (req, res) => {
  try {
    const colegioId = req.user.colegio_id;
    const raw = req.body?.mensaje_ids || req.body?.mensajesIds || [];
    const ids = [...new Set((Array.isArray(raw) ? raw : []).map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n > 0))];
    if (!ids.length) {
      return res.status(400).json({ error: 'Envíe mensaje_ids con al menos un id.' });
    }

    let total = 0;
    const detalle = [];

    for (const mensajeId of ids) {
      const [msg] = await query(
        `SELECT m.id, m.remitente_id, m.asunto, m.fecha_hora
         FROM mensajes m
         INNER JOIN usuarios u ON u.id = m.remitente_id AND u.colegio_id = ?
         WHERE m.id = ?
         LIMIT 1`,
        [colegioId, mensajeId]
      );
      if (!msg) {
        detalle.push({ mensaje_id: mensajeId, ok: false, reason: 'no_encontrado' });
        continue;
      }
      const result = await execute(
        `UPDATE mensajes m
         INNER JOIN usuarios u ON u.id = m.remitente_id AND u.colegio_id = ?
         SET m.borrado = 'SI'
         WHERE m.remitente_id = ?
           AND m.fecha_hora = ?
           AND m.asunto = ?
           AND m.borrado = 'NO'`,
        [colegioId, msg.remitente_id, msg.fecha_hora, msg.asunto]
      );
      const n = result?.affectedRows ?? 0;
      total += n;
      detalle.push({ mensaje_id: mensajeId, ok: true, eliminados: n });
    }

    registrarAccion({
      usuario_id: req.user.usuario_id || req.user.id,
      colegio_id: colegioId,
      tipo_usuario: 'ADMINISTRADOR',
      accion: 'ELIMINAR',
      modulo: 'MENSAJES',
      entidad: 'mensaje_envio_lote',
      descripcion: `Admin borró lote de envíos (${ids.length} ids, ${total} filas)`,
      url: req.originalUrl,
      metodo_http: req.method,
      ip_address: req.ip || req.connection?.remoteAddress,
      user_agent: req.get('user-agent'),
      resultado: 'EXITOSO',
    });
    req.skipAudit = true;

    res.json({
      ok: true,
      message: `Eliminados ${total} registro(s) de bandeja en cascada.`,
      eliminados: total,
      detalle,
    });
  } catch (e) {
    console.error('[admin/seguridad/mensajes/borrar-lote]', e);
    res.status(500).json({ error: e.message || 'Error al eliminar mensajes' });
  }
});

module.exports = router;
