/**
 * Envío masivo manual: campanita (tabla notificaciones) + push PWA.
 * Misma lógica de destinatarios que Conexiones / mensajes enviar.
 */
const { insertNotificacionUsuario } = require('../utils/notificacionInsert');
const { urlDashboardPorTipoUsuario } = require('../utils/notificacionUrls');
const { enviarPushNotificacionesIndividuales } = require('./pushNotificationService');
const { fechaHoraMySQLLima } = require('../utils/fechaHoraLima');
const { fetchUsuariosTutoresGrupos } = require('../utils/grupoTutores');

const TIPOS_PERSONAL = ['ADMINISTRADOR', 'SECRETARIA', 'PROMOTORIA', 'PSICOLOGA', 'DOCENTE', 'ASISTENCIA'];

const ICONOS_PERMITIDOS = new Set([
  '',
  '🔔',
  '📢',
  '⚠️',
  '❗',
  '📅',
  '✅',
  '🎉',
  '📌',
  '🏫',
  'ℹ️',
  '📚',
  '💰',
  '❤️',
  '⭐',
  '🚨',
  '📝',
  '🗳️',
  '🎂',
  '💡',
]);

function truncarTexto(s, max) {
  const t = String(s || '').trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 3) + '...';
}

function normalizarPerfilDestino(raw) {
  const k = String(raw || 'todos').toLowerCase();
  if (k === 'alumnos') return 'ALUMNOS';
  if (k === 'docentes') return 'DOCENTES';
  if (k === 'apoderados') return 'APODERADOS';
  if (k === 'todo_personal') return 'TODO_PERSONAL';
  return 'TODOS';
}

function tituloCompleto(iconoEmoji, titulo) {
  const t = String(titulo || '').trim();
  const icon = ICONOS_PERMITIDOS.has(iconoEmoji) ? String(iconoEmoji || '').trim() : '';
  if (!icon) return t;
  if (t.startsWith(icon)) return t;
  return `${icon} ${t}`.trim();
}

function sanitizarIcono(raw) {
  const icon = String(raw || '').trim();
  return ICONOS_PERMITIDOS.has(icon) ? icon : '';
}

/**
 * @returns {Promise<number[]>} usuario_id destinatarios únicos (sin remitente)
 */
async function resolverDestinatariosBroadcast(query, params) {
  const {
    colegio_id,
    remitente_id,
    alcance,
    perfilDestino,
    gruposIds = [],
  } = params;

  const enviarATipo = String(perfilDestino || 'todos').toLowerCase();
  const alcanceEnvio = alcance === 'grupos' ? 'grupos' : 'todos';
  const gruposArray = (gruposIds || [])
    .map((x) => parseInt(x, 10))
    .filter((n) => !isNaN(n) && n > 0);

  const usuariosDestinatarios = [];

  if (alcanceEnvio === 'todos') {
    let usuariosGlobales = [];
    if (enviarATipo === 'alumnos') {
      usuariosGlobales = await query(
        `SELECT id AS usuario_id FROM usuarios
         WHERE colegio_id = ? AND estado = 'ACTIVO' AND tipo = 'ALUMNO'`,
        [colegio_id]
      );
    } else if (enviarATipo === 'apoderados') {
      usuariosGlobales = await query(
        `SELECT id AS usuario_id FROM usuarios
         WHERE colegio_id = ? AND estado = 'ACTIVO' AND tipo = 'APODERADO'`,
        [colegio_id]
      );
    } else if (enviarATipo === 'docentes') {
      usuariosGlobales = await query(
        `SELECT id AS usuario_id FROM usuarios
         WHERE colegio_id = ? AND estado = 'ACTIVO' AND tipo = 'DOCENTE'`,
        [colegio_id]
      );
    } else if (enviarATipo === 'todo_personal') {
      const ph = TIPOS_PERSONAL.map(() => '?').join(',');
      usuariosGlobales = await query(
        `SELECT id AS usuario_id FROM usuarios
         WHERE colegio_id = ? AND estado = 'ACTIVO' AND tipo IN (${ph})`,
        [colegio_id, ...TIPOS_PERSONAL]
      );
    } else {
      usuariosGlobales = await query(
        `SELECT id AS usuario_id FROM usuarios
         WHERE colegio_id = ? AND estado = 'ACTIVO'`,
        [colegio_id]
      );
    }
    (usuariosGlobales || []).forEach((u) => {
      if (!usuariosDestinatarios.includes(u.usuario_id)) {
        usuariosDestinatarios.push(u.usuario_id);
      }
    });
  }

  if (gruposArray.length > 0) {
    if (enviarATipo === 'todos' || enviarATipo === 'alumnos') {
      const alumnosGrupos = await query(
        `SELECT DISTINCT u.id AS usuario_id
         FROM grupos g
         INNER JOIN matriculas m ON m.grupo_id = g.id AND (m.estado = 0)
         INNER JOIN alumnos a ON a.id = m.alumno_id
         INNER JOIN usuarios u ON u.alumno_id = a.id AND u.estado = 'ACTIVO'
         WHERE g.id IN (${gruposArray.map(() => '?').join(',')}) AND g.colegio_id = ?`,
        [...gruposArray, colegio_id]
      );
      (alumnosGrupos || []).forEach((al) => {
        if (!usuariosDestinatarios.includes(al.usuario_id)) {
          usuariosDestinatarios.push(al.usuario_id);
        }
      });
    }

    if (enviarATipo === 'todos' || enviarATipo === 'apoderados') {
      const apoderadosGrupo = await query(
        `SELECT DISTINCT u.id AS usuario_id, ap.nro_documento
         FROM grupos g
         INNER JOIN matriculas m ON m.grupo_id = g.id AND (m.estado = 0)
         INNER JOIN alumnos a ON a.id = m.alumno_id
         INNER JOIN familias f ON f.alumno_id = a.id
         INNER JOIN apoderados ap ON ap.id = f.apoderado_id AND ap.colegio_id = ?
         INNER JOIN usuarios u ON u.apoderado_id = ap.id AND u.colegio_id = ? AND u.estado = 'ACTIVO'
         WHERE g.id IN (${gruposArray.map(() => '?').join(',')})`,
        [colegio_id, colegio_id, ...gruposArray]
      );
      const apoderadoDnis = [];
      for (const ap of apoderadosGrupo || []) {
        if (!usuariosDestinatarios.includes(ap.usuario_id)) {
          usuariosDestinatarios.push(ap.usuario_id);
        }
        if (ap.nro_documento) apoderadoDnis.push(ap.nro_documento);
      }
      if (apoderadoDnis.length > 0) {
        const docentesApoderados = await query(
          `SELECT DISTINCT u.id AS usuario_id
           FROM usuarios u
           INNER JOIN personal p ON p.id = u.personal_id
           WHERE u.colegio_id = ? AND u.estado = 'ACTIVO' AND u.tipo = 'DOCENTE'
             AND p.nro_documento IN (${apoderadoDnis.map(() => '?').join(',')})`,
          [colegio_id, ...apoderadoDnis]
        );
        (docentesApoderados || []).forEach((d) => {
          if (!usuariosDestinatarios.includes(d.usuario_id)) {
            usuariosDestinatarios.push(d.usuario_id);
          }
        });
      }
    }

    if (enviarATipo === 'todos' || enviarATipo === 'docentes') {
      const docentesGrupo = await query(
        `SELECT DISTINCT u.id AS usuario_id
         FROM asignaturas a
         INNER JOIN usuarios u ON u.personal_id = a.personal_id
         WHERE a.grupo_id IN (${gruposArray.map(() => '?').join(',')})
           AND a.colegio_id = ? AND u.colegio_id = ? AND u.estado = 'ACTIVO' AND u.tipo = 'DOCENTE'`,
        [...gruposArray, colegio_id, colegio_id]
      );
      (docentesGrupo || []).forEach((d) => {
        if (!usuariosDestinatarios.includes(d.usuario_id)) {
          usuariosDestinatarios.push(d.usuario_id);
        }
      });

      const tutoresGrupo = await fetchUsuariosTutoresGrupos(query, colegio_id, gruposArray);
      (tutoresGrupo || []).forEach((d) => {
        if (!usuariosDestinatarios.includes(d.usuario_id)) {
          usuariosDestinatarios.push(d.usuario_id);
        }
      });
    }

    if (enviarATipo === 'todo_personal') {
      const ph = TIPOS_PERSONAL.map(() => '?').join(',');
      const staffRows = await query(
        `SELECT id AS usuario_id FROM usuarios
         WHERE colegio_id = ? AND estado = 'ACTIVO' AND tipo IN (${ph})`,
        [colegio_id, ...TIPOS_PERSONAL]
      );
      (staffRows || []).forEach((u) => {
        if (!usuariosDestinatarios.includes(u.usuario_id)) {
          usuariosDestinatarios.push(u.usuario_id);
        }
      });
    }
  }

  const remitenteNum = parseInt(remitente_id, 10);
  return Array.from(
    new Set(
      usuariosDestinatarios
        .map((id) => parseInt(id, 10))
        .filter((id) => !isNaN(id) && id > 0 && id !== remitenteNum)
    )
  );
}

async function ensureTablaNotificacionesEnvios(execute) {
  await execute(
    `CREATE TABLE IF NOT EXISTS notificaciones_envios (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      colegio_id INT UNSIGNED NOT NULL,
      remitente_id INT UNSIGNED NOT NULL,
      fecha_hora DATETIME NOT NULL,
      icono_emoji VARCHAR(16) NULL DEFAULT NULL,
      titulo VARCHAR(200) NOT NULL,
      mensaje TEXT NOT NULL,
      alcance VARCHAR(20) NOT NULL,
      perfil_destino VARCHAR(30) NOT NULL,
      grupos_json LONGTEXT NULL,
      total_destinatarios INT UNSIGNED NOT NULL DEFAULT 0,
      total_campanita INT UNSIGNED NOT NULL DEFAULT 0,
      total_push_enviados INT UNSIGNED NOT NULL DEFAULT 0,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_notif_envios_colegio_fecha (colegio_id, fecha_hora),
      KEY idx_notif_envios_remitente (remitente_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
}

/**
 * @returns {Promise<{ envioId: number, total_destinatarios: number, total_campanita: number }>}
 */
async function enviarNotificacionBroadcast(ctx) {
  const { query, execute, colegio_id, remitente_id, titulo, icono_emoji, mensaje, alcance, perfil_destino, grupos_ids } =
    ctx;

  const tituloLimpio = String(titulo || '').trim();
  const mensajeLimpio = String(mensaje || '').trim();
  if (!tituloLimpio) throw new Error('Indique el título');
  if (!mensajeLimpio) throw new Error('Indique el mensaje');
  if (tituloLimpio.length > 120) throw new Error('El título no puede superar 120 caracteres');
  if (mensajeLimpio.length > 2000) throw new Error('El mensaje no puede superar 2000 caracteres');

  const icono = sanitizarIcono(icono_emoji);
  const tituloFinal = tituloCompleto(icono, tituloLimpio);
  const alcanceNorm = alcance === 'grupos' ? 'GRUPOS' : 'TODOS';
  const perfilNorm = normalizarPerfilDestino(perfil_destino);

  if (alcanceNorm === 'GRUPOS' && (!grupos_ids || grupos_ids.length === 0)) {
    throw new Error('Seleccione al menos un grupo');
  }

  const destinatariosIds = await resolverDestinatariosBroadcast(query, {
    colegio_id,
    remitente_id,
    alcance: alcanceNorm === 'GRUPOS' ? 'grupos' : 'todos',
    perfilDestino: perfil_destino,
    gruposIds: grupos_ids,
  });

  if (destinatariosIds.length === 0) {
    throw new Error('No hay destinatarios activos con los filtros seleccionados');
  }

  await ensureTablaNotificacionesEnvios(execute);
  const fechaHora = fechaHoraMySQLLima();
  const gruposJson = JSON.stringify(grupos_ids || []);

  const ins = await execute(
    `INSERT INTO notificaciones_envios (
      colegio_id, remitente_id, fecha_hora, icono_emoji, titulo, mensaje,
      alcance, perfil_destino, grupos_json, total_destinatarios
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      colegio_id,
      remitente_id,
      fechaHora,
      icono || null,
      tituloLimpio,
      mensajeLimpio,
      alcanceNorm,
      perfilNorm,
      gruposJson,
      destinatariosIds.length,
    ]
  );
  const envioId = ins?.insertId;

  const usuariosRows = await query(
    `SELECT id, tipo FROM usuarios WHERE id IN (${destinatariosIds.map(() => '?').join(',')})`,
    destinatariosIds
  );
  const tipoPorUsuario = new Map((usuariosRows || []).map((u) => [parseInt(u.id, 10), u.tipo]));

  const pushTitulo = truncarTexto(tituloFinal, 80);
  const pushCuerpo = truncarTexto(mensajeLimpio, 450);

  let totalCampanita = 0;
  for (const destId of destinatariosIds) {
    try {
      const tipoU = tipoPorUsuario.get(destId) || 'DOCENTE';
      await insertNotificacionUsuario(execute, {
        usuario_id: remitente_id,
        destinatario_id: destId,
        asunto: tituloFinal,
        contenido: mensajeLimpio,
        estado: 'NO ENVIADO',
        accion_tipo: 'aviso_manual',
        accion_payload: { envio_id: envioId },
        url_destino: urlDashboardPorTipoUsuario(tipoU),
      });
      totalCampanita += 1;
    } catch (e) {
      console.warn(`📢 [NOTIF-ENVIO] Campanita usuario ${destId}:`, e.message);
    }
  }

  if (envioId) {
    await execute(`UPDATE notificaciones_envios SET total_campanita = ? WHERE id = ?`, [
      totalCampanita,
      envioId,
    ]);
  }

  const subsData = await query(
    `SELECT usuario_id, endpoint, p256dh, auth FROM push_subscriptions
     WHERE usuario_id IN (${destinatariosIds.map(() => '?').join(',')})
       AND colegio_id = ? AND (activo = 1 OR activo IS NULL)`,
    [...destinatariosIds, colegio_id]
  );

  if ((subsData || []).length > 0) {
    const pushItems = (subsData || []).map((sub) => {
      const uid = parseInt(sub.usuario_id, 10);
      const tipoU = tipoPorUsuario.get(uid) || 'DOCENTE';
      return {
        subscription: {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload: {
          title: pushTitulo,
          body: pushCuerpo,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-192x192.png',
          vibrate: [200, 100, 200],
          tag: `aviso-manual-${envioId}-${uid}`,
          data: {
            url: urlDashboardPorTipoUsuario(tipoU),
            tipo: 'aviso_manual',
            envio_id: envioId,
          },
        },
      };
    });

    enviarPushNotificacionesIndividuales(pushItems)
      .then(async (resultados) => {
        const ok = resultados.filter((r) => r.resultado && r.resultado.success).length;
        if (envioId) {
          try {
            await execute(`UPDATE notificaciones_envios SET total_push_enviados = ? WHERE id = ?`, [
              ok,
              envioId,
            ]);
          } catch (updErr) {
            console.warn('[NOTIF-ENVIO] No se pudo actualizar total_push:', updErr.message);
          }
        }
        console.log(`📱 [NOTIF-ENVIO] Push envío ${envioId}: ${ok}/${pushItems.length} ok`);
      })
      .catch((err) => console.error('❌ [NOTIF-ENVIO] Error push:', err));
  }

  return {
    envioId,
    total_destinatarios: destinatariosIds.length,
    total_campanita: totalCampanita,
  };
}

module.exports = {
  ICONOS_PERMITIDOS: Array.from(ICONOS_PERMITIDOS).filter(Boolean),
  sanitizarIcono,
  tituloCompleto,
  resolverDestinatariosBroadcast,
  ensureTablaNotificacionesEnvios,
  enviarNotificacionBroadcast,
};
