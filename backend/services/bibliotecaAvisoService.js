/**
 * Avisos de préstamo: un día antes, el mismo día y el día después si no devolvió.
 * Si es alumno, también se avisa a sus apoderados.
 */
const { query, execute } = require('../utils/mysql');
const { insertNotificacionUsuario } = require('../utils/notificacionInsert');
const { enviarPushNotificacionesIndividuales } = require('./pushNotificationService');
const { moduloActivo } = require('../utils/modulosSistema');
const { hoyLima, sumarDias } = require('../utils/biblioteca');

const URL_DESTINO = '/biblioteca';

async function usuariosAlumno(alumnoId, colegioId) {
  if (!alumnoId) return [];
  return query(
    `SELECT id FROM usuarios
     WHERE alumno_id = ? AND colegio_id = ? AND estado = 'ACTIVO'`,
    [alumnoId, colegioId]
  );
}

async function usuariosPersonal(personalId, colegioId) {
  if (!personalId) return [];
  return query(
    `SELECT id FROM usuarios
     WHERE personal_id = ? AND colegio_id = ? AND estado = 'ACTIVO'`,
    [personalId, colegioId]
  );
}

async function usuariosApoderadosDeAlumno(alumnoId, colegioId) {
  if (!alumnoId) return [];
  return query(
    `SELECT DISTINCT u.id
     FROM familias f
     INNER JOIN usuarios u ON u.apoderado_id = f.apoderado_id
       AND u.colegio_id = ? AND u.estado = 'ACTIVO'
     WHERE f.alumno_id = ?`,
    [colegioId, alumnoId]
  );
}

async function destinatariosPrestamo(mov) {
  const ids = new Set();
  if (mov.solicitante_tipo === 'PERSONAL') {
    (await usuariosPersonal(mov.personal_id, mov.colegio_id)).forEach((r) => ids.add(r.id));
  }
  if (mov.alumno_id) {
    (await usuariosAlumno(mov.alumno_id, mov.colegio_id)).forEach((r) => ids.add(r.id));
    (await usuariosApoderadosDeAlumno(mov.alumno_id, mov.colegio_id)).forEach((r) => ids.add(r.id));
  }
  if (mov.apoderado_id) {
    const ap = await query(
      `SELECT id FROM usuarios WHERE apoderado_id = ? AND colegio_id = ? AND estado = 'ACTIVO'`,
      [mov.apoderado_id, mov.colegio_id]
    );
    ap.forEach((r) => ids.add(r.id));
  }
  return [...ids];
}

function textoAviso(tipo, titulo, fechaVence) {
  const libro = titulo || 'el libro';
  if (tipo === 'ANTES') {
    return {
      asunto: 'Biblioteca: el préstamo vence mañana',
      contenido: `📖 «${libro}» vence mañana (${fechaVence}). Recuerde devolverlo en biblioteca.`,
    };
  }
  if (tipo === 'DIA') {
    return {
      asunto: 'Biblioteca: el préstamo vence hoy',
      contenido: `📖 «${libro}» vence hoy (${fechaVence}). Por favor devuélvalo en biblioteca.`,
    };
  }
  return {
    asunto: 'Biblioteca: préstamo vencido',
    contenido: `📖 «${libro}» venció el ${fechaVence} y aún no se devolvió. Regularice el préstamo en biblioteca.`,
  };
}

async function notificarUsuarios(usuarioIds, colegioId, asunto, contenido, tag) {
  for (const uid of usuarioIds) {
    try {
      await insertNotificacionUsuario(execute, {
        para: 'USUARIO',
        usuario_id: 0,
        destinatario_id: uid,
        asunto,
        contenido,
        estado: 'NO ENVIADO',
        accion_tipo: 'BIBLIOTECA',
        url_destino: URL_DESTINO,
      });
    } catch (e) {
      console.error('[biblioteca-aviso] notificacion', uid, e.message);
    }
  }
  if (!usuarioIds.length) return;
  try {
    const ph = usuarioIds.map(() => '?').join(',');
    const subs = await query(
      `SELECT usuario_id, endpoint, p256dh, auth FROM push_subscriptions
       WHERE usuario_id IN (${ph}) AND colegio_id = ? AND (activo = 1 OR activo IS NULL)`,
      [...usuarioIds, colegioId]
    );
    if (!subs?.length) return;
    const bodyPush = contenido.length > 110 ? `${contenido.slice(0, 107)}…` : contenido;
    await enviarPushNotificacionesIndividuales(
      subs.map((sub) => ({
        subscription: {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload: {
          title: asunto,
          body: bodyPush,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-192x192.png',
          tag,
          data: { url: URL_DESTINO, tipo: 'biblioteca' },
        },
      }))
    );
  } catch (e) {
    console.error('[biblioteca-aviso] push', e.message);
  }
}

async function ejecutarAvisosBiblioteca() {
  try {
    await query('SELECT 1 FROM biblioteca_movimientos LIMIT 1');
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') return { skipped: true };
    throw e;
  }
  if (!(await moduloActivo('biblioteca'))) return { skipped: true };
  const hoy = hoyLima();
  const manana = sumarDias(hoy, 1);
  const ayer = sumarDias(hoy, -1);

  const fases = [
    { tipo: 'ANTES', fecha: manana },
    { tipo: 'DIA', fecha: hoy },
    { tipo: 'DESPUES', fecha: ayer },
  ];

  let enviados = 0;
  for (const fase of fases) {
    const rows = await query(
      `SELECT m.id, m.colegio_id, m.solicitante_tipo, m.alumno_id, m.personal_id, m.apoderado_id,
              m.fecha_vencimiento, l.titulo
       FROM biblioteca_movimientos m
       INNER JOIN biblioteca_libros l ON l.id = m.libro_id
       WHERE m.estado = 'PRESTADO'
         AND m.fecha_vencimiento = ?
         AND NOT EXISTS (
           SELECT 1 FROM biblioteca_avisos a
           WHERE a.movimiento_id = m.id AND a.tipo = ?
         )`,
      [fase.fecha, fase.tipo]
    );
    for (const mov of rows || []) {
      const dest = await destinatariosPrestamo(mov);
      if (!dest.length) continue;
      const txt = textoAviso(fase.tipo, mov.titulo, mov.fecha_vencimiento);
      await notificarUsuarios(
        dest,
        mov.colegio_id,
        txt.asunto,
        txt.contenido,
        `bib-${mov.id}-${fase.tipo}`
      );
      try {
        await execute(
          `INSERT IGNORE INTO biblioteca_avisos (colegio_id, movimiento_id, tipo, enviado_en)
           VALUES (?, ?, ?, NOW())`,
          [mov.colegio_id, mov.id, fase.tipo]
        );
        enviados += 1;
      } catch (e) {
        if (e.code !== 'ER_DUP_ENTRY') console.error('[biblioteca-aviso] dedup', e.message);
      }
    }
  }
  return { enviados };
}

module.exports = { ejecutarAvisosBiblioteca };
