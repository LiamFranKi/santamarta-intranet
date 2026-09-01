const { fechaMySQLLima } = require('./fechaHoraLima');
const { insertNotificacionUsuario } = require('./notificacionInsert');
const { enviarPushNotificacionesIndividuales } = require('../services/pushNotificationService');

const CHECKLIST_POR_TIPO = {
  DOCENTE: [
    { key: 'puntualidad', label: 'Puntualidad y presencia' },
    { key: 'clima', label: 'Clima del aula y trato a los estudiantes' },
    { key: 'planificacion', label: 'Planificación y desarrollo de la sesión' },
    { key: 'materiales', label: 'Uso de materiales y recursos' },
    { key: 'convivencia', label: 'Normas y convivencia' },
  ],
  TUTOR: [
    { key: 'seguimiento', label: 'Seguimiento a estudiantes' },
    { key: 'familias', label: 'Comunicación con familias' },
    { key: 'convivencia', label: 'Clima y convivencia del aula' },
    { key: 'registros', label: 'Registros y evidencias de tutoría' },
  ],
  MANTENIMIENTO: [
    { key: 'orden', label: 'Orden y limpieza de zonas' },
    { key: 'epp', label: 'Uso de implementos de seguridad' },
    { key: 'puntualidad', label: 'Puntualidad y cumplimiento' },
    { key: 'equipos', label: 'Cuidado de equipos e instalaciones' },
  ],
  OTRO: [
    { key: 'puntualidad', label: 'Puntualidad' },
    { key: 'cumplimiento', label: 'Cumplimiento de funciones' },
    { key: 'actitud', label: 'Actitud y trato' },
  ],
};

function checklistParaTipo(tipo) {
  const base = CHECKLIST_POR_TIPO[String(tipo || 'OTRO').toUpperCase()] || CHECKLIST_POR_TIPO.OTRO;
  return base.map((i) => ({ key: i.key, label: i.label, marcado: false, nota: '' }));
}

function urlVisitaPorTipo(tipoUsuario, visitaId) {
  const t = String(tipoUsuario || '').toUpperCase();
  if (t === 'DOCENTE') return `/docente/herramientas/supervision?visita=${visitaId}`;
  return `/admin/herramientas/supervision?visita=${visitaId}`;
}

function ymd(val) {
  return String(val || '').slice(0, 10);
}

function normalizarHora(val) {
  const s = String(val || '').trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  return '08:00:00';
}

async function tablaVisitasExiste(queryFn) {
  try {
    await queryFn('SELECT 1 FROM supervision_visitas LIMIT 1');
    return true;
  } catch (e) {
    if (e && (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146)) return false;
    throw e;
  }
}

function visitaAActividad(v) {
  const fecha = ymd(v.fecha);
  const hi = normalizarHora(v.hora_inicio);
  const hf = v.hora_fin ? normalizarHora(v.hora_fin) : hi;
  return {
    id: `supervision-${v.id}`,
    supervision_visita_id: v.id,
    tipo: 'supervision',
    descripcion: `Supervisión: ${v.titulo || 'Sin título'}`,
    lugar: v.lugar || '',
    detalles: String(v.acuerdos || v.observaciones || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 280),
    fecha_inicio: `${fecha} ${hi}`,
    fecha_fin: `${fecha} ${hf}`,
    fecha_evento: fecha,
    estado_supervision: v.estado,
  };
}

async function listarVisitasComoActividades(queryFn, opts) {
  const { colegio_id, usuario_id, anio, mes, fecha, soloFuturas } = opts || {};
  if (!colegio_id || !usuario_id) return [];
  try {
    if (!(await tablaVisitasExiste(queryFn))) return [];
  } catch {
    return [];
  }
  const añoFiltro = anio ? parseInt(anio, 10) : new Date().getFullYear();
  const rows = await queryFn(
    `SELECT v.id, v.titulo, v.lugar, v.estado, v.observaciones, v.acuerdos,
            DATE_FORMAT(v.fecha, '%Y-%m-%d') AS fecha,
            TIME_FORMAT(v.hora_inicio, '%H:%i:%s') AS hora_inicio,
            TIME_FORMAT(v.hora_fin, '%H:%i:%s') AS hora_fin
     FROM supervision_visitas v
     WHERE v.colegio_id = ?
       AND YEAR(v.fecha) = ?
       AND v.estado IN ('PROGRAMADA','EN_CURSO','CERRADA')
       AND (
         v.creador_usuario_id = ?
         OR EXISTS (
           SELECT 1 FROM supervision_visita_personas p
           WHERE p.visita_id = v.id AND p.usuario_id = ?
         )
         OR EXISTS (
           SELECT 1 FROM supervision_supervisores s
           WHERE s.colegio_id = v.colegio_id AND s.usuario_id = ? AND s.activo = 1
         )
         OR EXISTS (
           SELECT 1 FROM usuarios ua
           WHERE ua.id = ? AND ua.tipo = 'ADMINISTRADOR' AND ua.colegio_id = v.colegio_id
         )
       )
     ORDER BY v.fecha ASC, v.hora_inicio ASC`,
    [colegio_id, añoFiltro, usuario_id, usuario_id, usuario_id, usuario_id]
  );
  let list = (rows || []).map(visitaAActividad);
  if (mes) {
    const mesNum = parseInt(mes, 10);
    if (mesNum >= 1 && mesNum <= 12) {
      list = list.filter((a) => parseInt(String(a.fecha_inicio || '').slice(5, 7), 10) === mesNum);
    }
  }
  if (fecha) {
    const f = ymd(fecha);
    list = list.filter((a) => ymd(a.fecha_inicio) === f);
  }
  if (soloFuturas) {
    const hoy = fechaMySQLLima();
    list = list.filter((a) => ymd(a.fecha_inicio) >= hoy);
  }
  return list;
}

async function mezclarSupervisionVisitasEnActividades(queryFn, actividades, opts) {
  try {
    const extra = await listarVisitasComoActividades(queryFn, opts);
    const merged = [...(actividades || []), ...extra];
    merged.sort((a, b) => String(a.fecha_inicio || '').localeCompare(String(b.fecha_inicio || '')));
    if (opts && opts.limite) return merged.slice(0, opts.limite);
    return merged;
  } catch (e) {
    console.warn('[supervision] calendario', e.message);
    return actividades || [];
  }
}

async function notificarPersonasVisita({
  queryFn,
  executeFn,
  colegio_id,
  visita,
  emisor_usuario_id,
  asunto,
  contenido,
  tagSuffix = 'programada',
  soloUsuarioIds = null,
}) {
  const parts = await queryFn(
    `SELECT p.usuario_id, u.tipo
     FROM supervision_visita_personas p
     INNER JOIN usuarios u ON u.id = p.usuario_id
     WHERE p.visita_id = ?`,
    [visita.id]
  );
  let dest = (parts || []).filter((p) => Number(p.usuario_id) !== Number(emisor_usuario_id));
  if (Array.isArray(soloUsuarioIds) && soloUsuarioIds.length) {
    dest = dest.filter((p) => soloUsuarioIds.map(Number).includes(Number(p.usuario_id)));
  }
  if (!dest.length) return;

  for (const d of dest) {
    const url = urlVisitaPorTipo(d.tipo, visita.id);
    try {
      await insertNotificacionUsuario(executeFn, {
        usuario_id: emisor_usuario_id,
        destinatario_id: d.usuario_id,
        asunto,
        contenido,
        estado: 'ENVIADO',
        accion_tipo: 'supervision_visita',
        accion_payload: { visita_id: visita.id, estado: visita.estado },
        url_destino: url,
      });
    } catch (e) {
      console.warn('[supervision] notif', d.usuario_id, e.message);
    }
  }

  const ids = dest.map((d) => d.usuario_id);
  const ph = ids.map(() => '?').join(',');
  let subsData = [];
  try {
    subsData = await queryFn(
      `SELECT usuario_id, endpoint, p256dh, auth FROM push_subscriptions
       WHERE usuario_id IN (${ph}) AND colegio_id = ? AND (activo = 1 OR activo IS NULL)`,
      [...ids, colegio_id]
    );
  } catch {
    return;
  }
  if (!subsData || !subsData.length) return;
  const tipoPorId = new Map(dest.map((d) => [Number(d.usuario_id), d.tipo]));
  const pushItems = subsData.map((sub) => {
    const tipo = tipoPorId.get(Number(sub.usuario_id));
    const url = urlVisitaPorTipo(tipo, visita.id);
    return {
      subscription: {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      payload: {
        title: asunto || 'Supervisión',
        body: String(contenido || visita.titulo || 'Supervisión').substring(0, 110),
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-192x192.png',
        vibrate: [150, 80, 150],
        tag: `supervision-${visita.id}-${tagSuffix}`,
        data: { url, tipo: 'supervision', visita_id: visita.id },
      },
    };
  });
  enviarPushNotificacionesIndividuales(pushItems).catch((err) =>
    console.error('[supervision] push', err.message)
  );
}

module.exports = {
  CHECKLIST_POR_TIPO,
  checklistParaTipo,
  urlVisitaPorTipo,
  tablaVisitasExiste,
  listarVisitasComoActividades,
  mezclarSupervisionVisitasEnActividades,
  notificarPersonasVisita,
};
