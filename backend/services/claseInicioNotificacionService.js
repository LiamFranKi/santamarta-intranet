/**
 * Aviso a docentes cuando empieza una clase (horario publicado en grupos_horarios).
 * Solo a la hora exacta (minuto Lima). Sin preferencias on/off por ahora.
 */
const moment = require('moment-timezone');
const { query, execute } = require('../utils/mysql');
const { insertNotificacionUsuario } = require('../utils/notificacionInsert');
const { enviarPushNotificationMultiple } = require('./pushNotificationService');
const { tryInsertPushCronDedup, fechaLimaYmd } = require('../utils/pushCronDedup');

const ZONA = 'America/Lima';

const DIA_NOMBRE = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
};

function normalizeDiaToNumber(dia) {
  const s = String(dia || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const map = {
    lunes: 1,
    martes: 2,
    miercoles: 3,
    jueves: 4,
    viernes: 5,
  };
  if (map[s]) return map[s];
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
}

/** Devuelve HH:mm en 24h o null */
function normalizeHoraToHhMm(hora) {
  const raw = String(hora || '').trim();
  if (!raw) return null;
  const ampm = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const m = ampm[2];
    const ap = ampm[3].toUpperCase();
    if (ap === 'PM' && h < 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${m}`;
  }
  const m24 = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!m24) return null;
  return `${String(parseInt(m24[1], 10)).padStart(2, '0')}:${m24[2]}`;
}

function esTextoRecreoAlmuerzo(txt) {
  const d = String(txt || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!d) return false;
  return d === 'recreo' || d === 'almuerzo' || d.startsWith('recreo') || d.startsWith('almuerzo');
}

function labelAula(nivelNombre, grado, seccion) {
  const partes = [];
  if (nivelNombre) partes.push(String(nivelNombre).trim());
  if (grado != null && grado !== '') {
    const g = Number(grado);
    if (/inicial/i.test(String(nivelNombre || ''))) partes.push(`${grado} Años`);
    else if (Number.isFinite(g) && g > 0) partes.push(`${g}º`);
    else partes.push(String(grado));
  }
  if (seccion) partes.push(String(seccion).trim());
  return partes.filter(Boolean).join(' · ') || 'aula';
}

/**
 * Ejecutar cada ~1 minuto. Notifica clases cuyo hora_inicio coincide con el minuto actual (Lima).
 */
async function ejecutarNotificacionesInicioClase() {
  const now = moment.tz(ZONA);
  const dow = now.isoWeekday(); // 1=Lun … 7=Dom
  if (dow > 5) {
    return { skipped: 'fin_de_semana', enviados: 0 };
  }

  const hhmm = now.format('HH:mm');
  const fecha = fechaLimaYmd();

  let rows;
  try {
    const diaNum = String(dow);
    const diaNom = (DIA_NOMBRE[dow] || '').toLowerCase();
    const diaNomSin = diaNom.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    rows = await query(
      `SELECT
         gh.id AS horario_id,
         gh.dia,
         gh.hora_inicio,
         gh.hora_final,
         gh.descripcion,
         gh.anio,
         COALESCE(NULLIF(gh.personal_id, 0), a.personal_id) AS personal_id,
         c.nombre AS curso_real,
         g.grado,
         g.seccion,
         n.nombre AS nivel_nombre,
         u.id AS usuario_id,
         u.colegio_id
       FROM grupos_horarios gh
       LEFT JOIN asignaturas a ON a.id = gh.asignatura_id AND a.id > 0
       LEFT JOIN grupos g ON g.id = COALESCE(NULLIF(gh.grupo_id, 0), a.grupo_id)
       LEFT JOIN niveles n ON n.id = g.nivel_id
       LEFT JOIN cursos c ON c.id = a.curso_id
       INNER JOIN colegios col
         ON col.id = COALESCE(g.colegio_id, a.colegio_id)
        AND CAST(col.anio_activo AS UNSIGNED) = CAST(gh.anio AS UNSIGNED)
       INNER JOIN usuarios u
         ON u.personal_id = COALESCE(NULLIF(gh.personal_id, 0), a.personal_id)
        AND u.colegio_id = col.id
        AND u.tipo = 'DOCENTE'
        AND (u.estado = 'ACTIVO' OR u.estado IS NULL)
       WHERE COALESCE(NULLIF(gh.personal_id, 0), a.personal_id) IS NOT NULL
         AND COALESCE(NULLIF(gh.personal_id, 0), a.personal_id) > 0
         AND (
           CAST(gh.dia AS CHAR) = ?
           OR LOWER(TRIM(CAST(gh.dia AS CHAR))) IN (?, ?)
         )`,
      [diaNum, diaNom, diaNomSin]
    );
  } catch (e) {
    console.error('🔔 [CLASE-INICIO] Error consultando grupos_horarios:', e.message);
    return { error: e.message, enviados: 0 };
  }

  const candidatos = (rows || []).filter((r) => {
    if (normalizeDiaToNumber(r.dia) !== dow) return false;
    if (normalizeHoraToHhMm(r.hora_inicio) !== hhmm) return false;
    // Recreo/almuerzo publicado sin curso real
    if (!r.curso_real && esTextoRecreoAlmuerzo(r.descripcion)) return false;
    return true;
  });

  if (!candidatos.length) {
    return { hhmm, dia: dow, candidatos: 0, enviados: 0, campanita: 0 };
  }

  let campanita = 0;
  let pushOk = 0;

  for (const r of candidatos) {
    const usuarioId = Number(r.usuario_id);
    const horarioId = Number(r.horario_id);
    if (!usuarioId || !horarioId) continue;

    const dedupKey = `${horarioId}:${usuarioId}`;
    const first = await tryInsertPushCronDedup('clase_inicio', dedupKey, fecha);
    if (!first) continue;

    const curso = String(r.curso_real || r.descripcion || 'Clase').trim() || 'Clase';
    const aula = labelAula(r.nivel_nombre, r.grado, r.seccion);
    const horaTxt = normalizeHoraToHhMm(r.hora_inicio) || String(r.hora_inicio || '');
    const asunto = 'Tienes clase ahora';
    const contenido = `${curso} · ${aula} · ${horaTxt}`;
    const urlDestino = '/docente/dashboard';

    try {
      await insertNotificacionUsuario(execute, {
        usuario_id: usuarioId,
        destinatario_id: usuarioId,
        asunto,
        contenido,
        estado: 'NO ENVIADO',
        accion_tipo: 'clase_inicio',
        accion_payload: {
          tipo: 'clase_inicio',
          horario_id: horarioId,
          curso,
          aula,
          hora: horaTxt,
        },
        url_destino: urlDestino,
      });
      campanita += 1;
    } catch (bellErr) {
      console.error(`🔔 [CLASE-INICIO] Campanita usuario ${usuarioId}:`, bellErr.message);
    }

    try {
      const subs = await query(
        `SELECT endpoint, p256dh, auth FROM push_subscriptions
         WHERE usuario_id = ? AND colegio_id = ? AND (activo = 1 OR activo IS NULL)`,
        [usuarioId, r.colegio_id]
      );
      if (!subs?.length) continue;

      const subscriptions = subs.map((sub) => ({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      }));
      const payload = {
        title: asunto,
        body: contenido,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-192x192.png',
        vibrate: [200, 100, 200],
        tag: `clase-inicio-${fecha}-${horarioId}-${usuarioId}`,
        data: { url: urlDestino, tipo: 'clase_inicio', horario_id: horarioId },
      };
      const resultados = await enviarPushNotificationMultiple(subscriptions, payload);
      const exitosas = resultados.filter((x) => x.resultado && x.resultado.success).length;
      pushOk += exitosas;
      for (const { resultado, subscription } of resultados) {
        if (resultado?.expired && subscription?.endpoint) {
          await execute('UPDATE push_subscriptions SET activo = 0 WHERE endpoint = ?', [
            subscription.endpoint,
          ]);
        }
      }
    } catch (pushErr) {
      console.error(`🔔 [CLASE-INICIO] Push usuario ${usuarioId}:`, pushErr.message);
    }
  }

  console.log(
    `🔔 [CLASE-INICIO] ${DIA_NOMBRE[dow] || dow} ${hhmm} · candidatos=${candidatos.length} · campanita=${campanita} · push=${pushOk}`
  );
  return { hhmm, dia: dow, candidatos: candidatos.length, campanita, enviados: pushOk };
}

module.exports = {
  ejecutarNotificacionesInicioClase,
  normalizeDiaToNumber,
  normalizeHoraToHhMm,
};
