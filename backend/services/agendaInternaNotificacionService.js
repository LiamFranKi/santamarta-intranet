/**
 * Avisos de Agenda interna: creación + cuenta regresiva (campanita + push).
 * Destinatarios: roles elegidos en el evento (admin, coordinador, promotoría, dirección, docente).
 */
const moment = require('moment-timezone');
const { query, execute } = require('../utils/mysql');
const { insertNotificacionUsuario } = require('../utils/notificacionInsert');
const { enviarPushNotificacionesIndividuales } = require('./pushNotificationService');
const { fechaHoraMySQLLima } = require('../utils/fechaHoraLima');
const {
  parseAvisoDias,
  parseAvisosRoles,
  tipoEventoMeta,
  ymdDeValor,
  diasHasta,
  tableMissing,
} = require('../utils/agendaInterna');

const ZONA = 'America/Lima';
const URL_DESTINO = '/agenda-interna';

function faseParaDiasRestantes(daysUntil, avisoDias) {
  if (daysUntil === -1) return 'VENCIDO';
  if (daysUntil === 0 && avisoDias.includes(0)) return 'HOY';
  if (daysUntil > 0 && avisoDias.includes(daysUntil)) return `ANTES_${daysUntil}`;
  return null;
}

function fmtFechaPe(ymd) {
  const s = ymdDeValor(ymd);
  if (!s) return '';
  const m = moment.tz(s, 'YYYY-MM-DD', ZONA);
  try {
    return m.toDate().toLocaleDateString('es-PE', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return m.format('DD/MM/YYYY');
  }
}

function textoAsuntoYContenido(evento, fase) {
  const meta = tipoEventoMeta(evento.tipo);
  const nombre = String(evento.titulo || 'Aviso').trim() || 'Aviso';
  const fechaTxt = fmtFechaPe(evento.fecha_fin);
  const etiqueta = meta.etiqueta;

  switch (fase) {
    case 'CREACION':
      return {
        asunto: `Agenda interna: ${nombre}`,
        contenido: `${meta.icono} ${etiqueta}: «${nombre}». Fecha: ${fechaTxt}. Abre Agenda interna para ver el detalle.`,
      };
    case 'ANTES_10':
      return {
        asunto: 'Agenda interna: faltan 10 días',
        contenido: `${meta.icono} «${nombre}» vence el ${fechaTxt}. Quedan 10 días.`,
      };
    case 'ANTES_7':
      return {
        asunto: 'Agenda interna: faltan 7 días',
        contenido: `${meta.icono} «${nombre}» vence el ${fechaTxt}. Quedan 7 días.`,
      };
    case 'ANTES_5':
      return {
        asunto: 'Agenda interna: faltan 5 días',
        contenido: `${meta.icono} «${nombre}» vence el ${fechaTxt}. Quedan 5 días.`,
      };
    case 'ANTES_3':
      return {
        asunto: 'Agenda interna: faltan 3 días',
        contenido: `${meta.icono} «${nombre}» vence el ${fechaTxt}. Quedan 3 días.`,
      };
    case 'ANTES_1':
      return {
        asunto: 'Agenda interna: vence mañana',
        contenido: `${meta.icono} «${nombre}» vence el ${fechaTxt}. Falta 1 día.`,
      };
    case 'HOY':
      return {
        asunto: 'Agenda interna: vence hoy',
        contenido: `${meta.icono} «${nombre}» vence hoy (${fechaTxt}).`,
      };
    case 'VENCIDO':
      return {
        asunto: 'Agenda interna: vencido',
        contenido: `${meta.icono} «${nombre}» venció ayer (${fechaTxt}). Márcalo como hecho o actualiza la fecha.`,
      };
    default:
      return {
        asunto: 'Agenda interna',
        contenido: `${meta.icono} «${nombre}». Fecha: ${fechaTxt}.`,
      };
  }
}

function tituloPushCorto(fase, titulo) {
  const corto = String(titulo || 'Aviso').trim().slice(0, 42);
  const map = {
    CREACION: `Agenda: ${corto}`,
    ANTES_10: 'Agenda: 10 días',
    ANTES_7: 'Agenda: 7 días',
    ANTES_5: 'Agenda: 5 días',
    ANTES_3: 'Agenda: 3 días',
    ANTES_1: 'Agenda: vence mañana',
    HOY: 'Agenda: vence hoy',
    VENCIDO: 'Agenda: vencido',
  };
  return map[fase] || 'Agenda interna';
}

async function yaRegistradoEnvio(eventoId, fase) {
  const rows = await query(
    `SELECT 1 FROM agenda_interna_notif_log WHERE evento_id = ? AND fase = ? LIMIT 1`,
    [eventoId, fase]
  );
  return rows && rows.length > 0;
}

async function registrarEnvio(eventoId, fase) {
  await execute(
    `INSERT INTO agenda_interna_notif_log (evento_id, fase, enviado_en) VALUES (?, ?, ?)`,
    [eventoId, fase, fechaHoraMySQLLima()]
  );
}

async function idsDestinatarios(colegioId, roles) {
  const list = parseAvisosRoles(roles);
  if (!list.length) return [];
  const ph = list.map(() => '?').join(',');
  const rows = await query(
    `SELECT id FROM usuarios
     WHERE colegio_id = ?
       AND tipo IN (${ph})
       AND (estado = 'ACTIVO' OR estado IS NULL)`,
    [colegioId, ...list]
  );
  return [...new Set((rows || []).map((r) => parseInt(r.id, 10)).filter(Boolean))];
}

async function enviarFaseEvento(evento, fase) {
  const eventoId = parseInt(evento.id, 10);
  if (!eventoId || !fase) return { enviados: 0 };

  if (await yaRegistradoEnvio(eventoId, fase)) {
    return { enviados: 0, omitido: true };
  }

  const destIds = await idsDestinatarios(evento.colegio_id, evento.avisos_roles);
  if (!destIds.length) {
    try {
      await registrarEnvio(eventoId, fase);
    } catch (_) {
      /* ignore */
    }
    return { enviados: 0 };
  }

  const emisorId = parseInt(evento.creado_por, 10) || destIds[0];
  const { asunto, contenido } = textoAsuntoYContenido(evento, fase);
  const urlDestino = `${URL_DESTINO}?id=${eventoId}`;
  const fechaStr = ymdDeValor(evento.fecha_fin);

  for (const did of destIds) {
    try {
      await insertNotificacionUsuario(execute, {
        usuario_id: emisorId,
        destinatario_id: did,
        asunto,
        contenido,
        estado: 'ENVIADO',
        accion_tipo: 'agenda_interna',
        accion_payload: {
          evento_id: eventoId,
          fase,
          fecha_fin: fechaStr,
        },
        url_destino: urlDestino,
      });
    } catch (e) {
      console.warn(`📅 [AGENDA-INTERNA] Campanita usuario ${did}:`, e.message);
    }
  }

  try {
    await registrarEnvio(eventoId, fase);
  } catch (e) {
    if (e?.code !== 'ER_DUP_ENTRY' && e?.errno !== 1062) {
      console.warn('📅 [AGENDA-INTERNA] No se pudo registrar envío en log:', e.message);
    }
  }

  const ph = destIds.map(() => '?').join(',');
  let subsData = [];
  try {
    subsData = await query(
      `SELECT usuario_id, endpoint, p256dh, auth FROM push_subscriptions
       WHERE usuario_id IN (${ph}) AND colegio_id = ? AND (activo = 1 OR activo IS NULL)`,
      [...destIds, evento.colegio_id]
    );
  } catch {
    subsData = [];
  }

  if (subsData && subsData.length > 0) {
    const bodyPush = contenido.length > 110 ? `${contenido.slice(0, 107)}…` : contenido;
    const pushItems = subsData.map((sub) => ({
      subscription: {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      payload: {
        title: tituloPushCorto(fase, evento.titulo),
        body: bodyPush,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-192x192.png',
        vibrate: [120, 60, 120],
        tag: `agenda-int-${eventoId}-${fase}-${fechaStr}`,
        data: {
          url: urlDestino,
          tipo: 'agenda_interna',
          evento_id: eventoId,
          fase,
        },
      },
    }));
    enviarPushNotificacionesIndividuales(pushItems).catch((err) =>
      console.warn('📅 [AGENDA-INTERNA] Push:', err.message)
    );
  }

  return { enviados: destIds.length };
}

async function notificarCreacionAgendaInterna(evento) {
  try {
    return await enviarFaseEvento(evento, 'CREACION');
  } catch (e) {
    console.warn('📅 [AGENDA-INTERNA] Error aviso creación:', e.message);
    return { enviados: 0, error: e.message };
  }
}

let warnedSinTabla = false;

async function ejecutarNotificacionesAgendaInterna() {
  try {
    await query('SELECT 1 FROM agenda_interna_eventos LIMIT 1', []);
  } catch (e) {
    if (tableMissing(e)) {
      if (!warnedSinTabla) {
        console.warn(
          '📅 [AGENDA-INTERNA] Ejecute la migración 085 (agenda_interna_eventos). Avisos desactivados hasta entonces.'
        );
        warnedSinTabla = true;
      }
      return;
    }
    throw e;
  }

  const hoy = moment.tz(ZONA).startOf('day');
  const hoyYmd = hoy.format('YYYY-MM-DD');

  let eventos;
  try {
    eventos = await query(
      `SELECT id, colegio_id, titulo, descripcion, tipo, fecha_inicio, fecha_fin, estado,
              aviso_dias, avisos_roles, creado_por
       FROM agenda_interna_eventos
       WHERE estado = 'PENDIENTE'`,
      []
    );
  } catch (e) {
    if (tableMissing(e)) return;
    throw e;
  }

  if (!eventos || eventos.length === 0) return;

  let procesados = 0;
  for (const ev of eventos) {
    const avisoDias = parseAvisoDias(ev.aviso_dias);
    if (!avisoDias.includes(0)) avisoDias.push(0);
    const daysUntil = diasHasta(ev.fecha_fin, hoyYmd);
    if (daysUntil == null) continue;
    const fase = faseParaDiasRestantes(daysUntil, avisoDias);
    if (!fase) continue;
    const r = await enviarFaseEvento(ev, fase);
    if (r && r.enviados > 0) procesados += 1;
  }

  if (procesados > 0) {
    console.log(
      `📅 [AGENDA-INTERNA] Avisos nuevos para ${procesados} evento(s). Fecha Lima: ${hoyYmd}`
    );
  }
}

module.exports = {
  notificarCreacionAgendaInterna,
  ejecutarNotificacionesAgendaInterna,
  faseParaDiasRestantes,
};
