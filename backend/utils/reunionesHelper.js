/**
 * Reuniones institucionales: helpers de fecha Lima, visibilidad, calendario
 * (sin INSERT en `actividades`) y notificaciones.
 */
const { query: queryDefault, execute: executeDefault } = require('./mysql');
const { fechaMySQLLima, fechaHoraMySQLLima } = require('./fechaHoraLima');
const { insertNotificacionUsuario } = require('./notificacionInsert');
const { enviarPushNotificacionesIndividuales } = require('../services/pushNotificationService');

const ESTADOS_VISIBLES_CALENDARIO = ['CONVOCADA', 'EN_CURSO', 'CERRADA'];
const TIPOS_GESTOR = new Set(['ADMINISTRADOR', 'PROMOTORIA', 'SECRETARIA', 'PSICOLOGA']);

function esGestorReuniones(tipo) {
  return TIPOS_GESTOR.has(String(tipo || '').toUpperCase());
}

function puedeDirigirReunion(reunion, usuario_id, tipo) {
  if (!reunion) return false;
  const uid = Number(usuario_id);
  if (esGestorReuniones(tipo)) return true;
  if (Number(reunion.creador_usuario_id) === uid) return true;
  if (reunion.abrir_usuario_id && Number(reunion.abrir_usuario_id) === uid) return true;
  return false;
}

function sanitizarHtmlReunion(html) {
  if (html == null) return null;
  let s = String(html);
  s = s.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
  s = s.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  const texto = s.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim();
  if (!texto && !/<img/i.test(s)) return null;
  return s;
}

function urlReunionPorTipo(tipo, reunionId) {
  const id = reunionId != null ? String(reunionId) : '';
  const t = String(tipo || '').toUpperCase();
  let base = '/admin/herramientas/reuniones';
  if (t === 'ALUMNO') base = '/alumno/reuniones';
  else if (t === 'APODERADO') base = '/apoderado/reuniones';
  else if (t === 'DOCENTE') base = '/docente/herramientas/reuniones';
  return id ? `${base}/${id}` : base;
}

function fechaYmd(val) {
  if (!val) return '';
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return fechaMySQLLima(val);
  }
  return String(val).slice(0, 10);
}

function esHoyLima(fechaVal) {
  return fechaYmd(fechaVal) === fechaMySQLLima();
}

function normalizarHora(val) {
  const s = String(val || '').trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  return null;
}

function normalizarEnlaceVideollamada(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (s.length > 500) return null;
  if (!/^https?:\/\//i.test(s)) return null;
  if (/^javascript:/i.test(s) || /\s/.test(s)) return null;
  return s;
}

async function tablaReunionesExiste(queryFn = queryDefault) {
  try {
    await queryFn('SELECT 1 FROM reuniones LIMIT 1');
    return true;
  } catch (e) {
    if (e && (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146)) return false;
    throw e;
  }
}

function nombreSqlUsuario() {
  return `COALESCE(
    NULLIF(TRIM(CONCAT(COALESCE(a.nombres,''), ' ', COALESCE(a.apellido_paterno,''), ' ', COALESCE(a.apellido_materno,''))), ''),
    NULLIF(TRIM(CONCAT(COALESCE(p.nombres,''), ' ', COALESCE(p.apellidos,''))), ''),
    NULLIF(TRIM(CONCAT(COALESCE(ap.nombres,''), ' ', COALESCE(ap.apellido_paterno,''), ' ', COALESCE(ap.apellido_materno,''))), ''),
    u.usuario,
    CONCAT('Usuario ', u.id)
  )`;
}

async function puedeVerReunion(queryFn, reunion, usuario_id, tipo) {
  if (!reunion) return false;
  if (puedeDirigirReunion(reunion, usuario_id, tipo)) return true;
  const rows = await queryFn(
    `SELECT id FROM reuniones_participantes WHERE reunion_id = ? AND usuario_id = ? LIMIT 1`,
    [reunion.id, usuario_id]
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function obtenerReunion(queryFn, reunionId, colegio_id) {
  const rows = await queryFn(
    `SELECT r.*,
            DATE_FORMAT(r.fecha, '%Y-%m-%d') AS fecha,
            TIME_FORMAT(r.hora_inicio, '%H:%i:%s') AS hora_inicio,
            TIME_FORMAT(r.hora_fin, '%H:%i:%s') AS hora_fin,
            DATE_FORMAT(r.iniciada_en, '%Y-%m-%d %H:%i:%s') AS iniciada_en,
            DATE_FORMAT(r.cerrada_en, '%Y-%m-%d %H:%i:%s') AS cerrada_en,
            DATE_FORMAT(r.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
            DATE_FORMAT(r.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
     FROM reuniones r
     WHERE r.id = ? AND r.colegio_id = ?
     LIMIT 1`,
    [reunionId, colegio_id]
  );
  return rows && rows[0] ? rows[0] : null;
}

async function listarParticipantes(queryFn, reunionId, { incluirFirmas } = {}) {
  const nombre = nombreSqlUsuario();
  const firmaCols = incluirFirmas
    ? `, DATE_FORMAT(rp.firmado_en, '%Y-%m-%d %H:%i:%s') AS firmado_en,
       rp.firma_data,
       (rp.firma_data IS NOT NULL AND rp.firma_data <> '') AS tiene_firma`
    : `, DATE_FORMAT(rp.firmado_en, '%Y-%m-%d %H:%i:%s') AS firmado_en,
       (rp.firma_data IS NOT NULL AND rp.firma_data <> '') AS tiene_firma`;
  const sql = `SELECT rp.id, rp.reunion_id, rp.usuario_id, rp.tipo, rp.rol, rp.asistencia,
            DATE_FORMAT(rp.asistencia_en, '%Y-%m-%d %H:%i:%s') AS asistencia_en
            ${firmaCols},
            ${nombre} AS nombre,
            COALESCE(a.foto, p.foto) AS foto
     FROM reuniones_participantes rp
     INNER JOIN usuarios u ON u.id = rp.usuario_id
     LEFT JOIN alumnos a ON a.id = u.alumno_id
     LEFT JOIN personal p ON p.id = u.personal_id
     LEFT JOIN apoderados ap ON ap.id = u.apoderado_id
     WHERE rp.reunion_id = ?
     ORDER BY rp.rol ASC, nombre ASC`;
  try {
    return await queryFn(sql, [reunionId]);
  } catch (e) {
    if (e && (e.code === 'ER_BAD_FIELD_ERROR' || e.errno === 1054)) {
      return queryFn(
        `SELECT rp.id, rp.reunion_id, rp.usuario_id, rp.tipo, rp.rol, rp.asistencia,
                DATE_FORMAT(rp.asistencia_en, '%Y-%m-%d %H:%i:%s') AS asistencia_en,
                ${nombre} AS nombre,
                COALESCE(a.foto, p.foto) AS foto
         FROM reuniones_participantes rp
         INNER JOIN usuarios u ON u.id = rp.usuario_id
         LEFT JOIN alumnos a ON a.id = u.alumno_id
         LEFT JOIN personal p ON p.id = u.personal_id
         LEFT JOIN apoderados ap ON ap.id = u.apoderado_id
         WHERE rp.reunion_id = ?
         ORDER BY rp.rol ASC, nombre ASC`,
        [reunionId]
      );
    }
    throw e;
  }
}

async function asegurarConvocante(executeFn, queryFn, reunionId, usuarioId, tipo) {
  const exist = await queryFn(
    `SELECT id FROM reuniones_participantes WHERE reunion_id = ? AND usuario_id = ? LIMIT 1`,
    [reunionId, usuarioId]
  );
  if (exist && exist.length) {
    await executeFn(
      `UPDATE reuniones_participantes SET rol = 'CONVOCANTE', tipo = ? WHERE id = ?`,
      [tipo || 'ADMINISTRADOR', exist[0].id]
    );
    return;
  }
  await executeFn(
    `INSERT INTO reuniones_participantes (reunion_id, usuario_id, tipo, rol, asistencia)
     VALUES (?, ?, ?, 'CONVOCANTE', 'PENDIENTE')`,
    [reunionId, usuarioId, tipo || 'ADMINISTRADOR']
  );
}

async function insertarParticipantes(executeFn, queryFn, reunionId, colegioId, invitados) {
  const lista = Array.isArray(invitados) ? invitados : [];
  const ids = [...new Set(lista.map((x) => parseInt(x.usuario_id || x, 10)).filter((n) => Number.isInteger(n) && n > 0))];
  if (!ids.length) return { agregados: 0 };
  const ph = ids.map(() => '?').join(',');
  const users = await queryFn(
    `SELECT id, tipo FROM usuarios WHERE colegio_id = ? AND id IN (${ph}) AND (estado = 'ACTIVO' OR estado IS NULL)`,
    [colegioId, ...ids]
  );
  let agregados = 0;
  for (const u of users || []) {
    try {
      const r = await executeFn(
        `INSERT IGNORE INTO reuniones_participantes (reunion_id, usuario_id, tipo, rol, asistencia)
         VALUES (?, ?, ?, 'INVITADO', 'PENDIENTE')`,
        [reunionId, u.id, u.tipo || 'INVITADO']
      );
      if (r && r.affectedRows) agregados += 1;
    } catch (e) {
      console.warn('[reuniones] insert participante', u.id, e.message);
    }
  }
  return { agregados };
}

async function usuariosGrupoPorAudiencia(queryFn, colegioId, anioActivo, grupoId, audiencias) {
  const aud = audienciasDeGrupo(audiencias);
  const ids = [];
  if (aud.alumnos) {
    const rows = await queryFn(
      `SELECT DISTINCT u.id, u.tipo
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       INNER JOIN usuarios u ON u.alumno_id = m.alumno_id AND u.estado = 'ACTIVO'
       WHERE m.grupo_id = ? AND m.colegio_id = ? AND g.anio = ? AND (m.estado = 0)`,
      [grupoId, colegioId, anioActivo]
    );
    (rows || []).forEach((r) => ids.push(r));
  }
  if (aud.apoderados) {
    const rows = await queryFn(
      `SELECT DISTINCT u.id, u.tipo
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       INNER JOIN familias f ON f.alumno_id = m.alumno_id
       INNER JOIN usuarios u ON u.apoderado_id = f.apoderado_id AND u.estado = 'ACTIVO'
       WHERE m.grupo_id = ? AND m.colegio_id = ? AND g.anio = ? AND (m.estado = 0)`,
      [grupoId, colegioId, anioActivo]
    );
    (rows || []).forEach((r) => ids.push(r));
  }
  if (aud.docentes) {
    const rows = await queryFn(
      `SELECT DISTINCT u.id, u.tipo
       FROM usuarios u
       INNER JOIN personal p ON p.id = u.personal_id
       WHERE u.colegio_id = ? AND u.estado = 'ACTIVO'
         AND p.id IN (
           SELECT a.personal_id FROM asignaturas a
           WHERE a.grupo_id = ? AND a.colegio_id = ? AND a.personal_id IS NOT NULL
           UNION
           SELECT g.tutor_id FROM grupos g
           WHERE g.id = ? AND g.tutor_id IS NOT NULL AND g.tutor_id > 0
           UNION
           SELECT g.tutor_id_2 FROM grupos g
           WHERE g.id = ? AND COALESCE(g.tutor_id_2, 0) > 0
         )`,
      [colegioId, grupoId, colegioId, grupoId, grupoId]
    );
    (rows || []).forEach((r) => ids.push(r));
  }
  return ids;
}

function audienciasDeGrupo(g) {
  const a = g && typeof g === 'object' ? g : {};
  const flag = (v) => v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
  const alumnos = flag(a.alumnos);
  const apoderados = flag(a.apoderados);
  const docentes = flag(a.docentes);
  if (alumnos || apoderados || docentes) return { alumnos, apoderados, docentes };
  return { alumnos: true, apoderados: false, docentes: false };
}

async function usuariosGrupoAlumnos(queryFn, colegioId, anioActivo, grupoId) {
  return usuariosGrupoPorAudiencia(queryFn, colegioId, anioActivo, grupoId, { alumnos: true });
}

async function resolverUsuarioPersonal(queryFn, colegioId, usuarioId) {
  const id = parseInt(usuarioId, 10);
  if (!Number.isInteger(id) || id <= 0) return null;
  const rows = await queryFn(
    `SELECT u.id, u.tipo,
            TRIM(CONCAT(COALESCE(p.nombres,''), ' ', COALESCE(p.apellidos,''))) AS nombre
     FROM usuarios u
     INNER JOIN personal p ON p.id = u.personal_id
     WHERE u.id = ? AND u.colegio_id = ? AND (u.estado = 'ACTIVO' OR u.estado IS NULL)
     LIMIT 1`,
    [id, colegioId]
  );
  return rows && rows[0] ? rows[0] : null;
}

async function buscarParticipantesReunion(queryFn, { colegio_id, anio_activo, q, solo }) {
  const term = String(q || '').trim();
  if (term.length < 2) return [];
  const searchTerm = `%${term}%`;
  const resultados = [];
  const soloPersonal = String(solo || '').toLowerCase() === 'personal';

  if (!soloPersonal) {
  const alumnos = await queryFn(
    `SELECT DISTINCT u.id as usuario_id,
            CONCAT(a.nombres, ' ', a.apellido_paterno, ' ', COALESCE(a.apellido_materno,'')) as nombre_completo,
            'ALUMNO' as tipo,
            CONCAT(g.grado, '° ', g.seccion, ' - ', n.nombre) as info_adicional
     FROM alumnos a
     INNER JOIN usuarios u ON u.alumno_id = a.id AND u.estado = 'ACTIVO'
     INNER JOIN matriculas m ON m.alumno_id = a.id
     INNER JOIN grupos g ON g.id = m.grupo_id
     INNER JOIN niveles n ON n.id = g.nivel_id
     WHERE a.colegio_id = ?
       AND g.anio = ?
       AND (m.estado = 0)
       AND (
         a.nombres LIKE ? OR a.apellido_paterno LIKE ? OR a.apellido_materno LIKE ? OR
         CONCAT(a.nombres, ' ', a.apellido_paterno, ' ', COALESCE(a.apellido_materno,'')) LIKE ?
       )
     LIMIT 20`,
    [colegio_id, anio_activo, searchTerm, searchTerm, searchTerm, searchTerm]
  );
  (alumnos || []).forEach((al) => {
    resultados.push({
      usuario_id: al.usuario_id,
      nombre_completo: String(al.nombre_completo || '').trim(),
      tipo: 'ALUMNO',
      info_adicional: al.info_adicional,
    });
  });

  const apoderados = await queryFn(
    `SELECT DISTINCT u.id as usuario_id,
            CONCAT(ap.nombres, ' ', ap.apellido_paterno, ' ', COALESCE(ap.apellido_materno,'')) as nombre_completo,
            'APODERADO' as tipo,
            CONCAT('Apoderado de: ', a.nombres, ' ', a.apellido_paterno) as info_adicional
     FROM apoderados ap
     INNER JOIN usuarios u ON u.apoderado_id = ap.id AND u.estado = 'ACTIVO'
     INNER JOIN familias f ON f.apoderado_id = ap.id
     INNER JOIN alumnos a ON a.id = f.alumno_id
     WHERE ap.colegio_id = ?
       AND (
         ap.nombres LIKE ? OR ap.apellido_paterno LIKE ? OR ap.apellido_materno LIKE ? OR
         CONCAT(ap.nombres, ' ', ap.apellido_paterno, ' ', COALESCE(ap.apellido_materno,'')) LIKE ?
       )
     LIMIT 20`,
    [colegio_id, searchTerm, searchTerm, searchTerm, searchTerm]
  );
  (apoderados || []).forEach((ap) => {
    resultados.push({
      usuario_id: ap.usuario_id,
      nombre_completo: String(ap.nombre_completo || '').trim(),
      tipo: 'APODERADO',
      info_adicional: ap.info_adicional,
    });
  });
  }

  const personal = await queryFn(
    `SELECT DISTINCT u.id as usuario_id,
            CONCAT(p.nombres, ' ', p.apellidos) as nombre_completo,
            u.tipo as tipo,
            COALESCE(NULLIF(TRIM(p.cargo), ''), u.tipo, 'Personal') as info_adicional
     FROM personal p
     INNER JOIN usuarios u ON u.personal_id = p.id AND u.estado = 'ACTIVO'
     WHERE p.colegio_id = ?
       AND (
         p.nombres LIKE ? OR p.apellidos LIKE ? OR
         CONCAT(p.nombres, ' ', p.apellidos) LIKE ?
       )
     LIMIT 25`,
    [colegio_id, searchTerm, searchTerm, searchTerm]
  );
  (personal || []).forEach((p) => {
    resultados.push({
      usuario_id: p.usuario_id,
      nombre_completo: String(p.nombre_completo || '').trim(),
      tipo: p.tipo || 'PERSONAL',
      info_adicional: p.info_adicional,
    });
  });

  if (!soloPersonal) {
  const grupos = await queryFn(
    `SELECT g.id as grupo_id,
            CONCAT(g.grado, '° ', g.seccion, ' - ', n.nombre) as nombre_completo,
            CONCAT(COUNT(DISTINCT m.alumno_id), ' alumnos') as info_adicional
     FROM grupos g
     INNER JOIN niveles n ON n.id = g.nivel_id
     INNER JOIN matriculas m ON m.grupo_id = g.id AND (m.estado = 0)
     WHERE g.colegio_id = ?
       AND g.anio = ?
       AND (CONCAT(g.grado, '° ', g.seccion) LIKE ? OR n.nombre LIKE ?)
     GROUP BY g.id, g.grado, g.seccion, n.nombre
     LIMIT 8`,
    [colegio_id, anio_activo, searchTerm, searchTerm]
  );
  (grupos || []).forEach((g) => {
    resultados.push({
      grupo_id: g.grupo_id,
      nombre_completo: String(g.nombre_completo || ''),
      tipo: 'GRUPO',
      info_adicional: String(g.info_adicional || ''),
    });
  });
  }

  return resultados.slice(0, 50);
}

function reunionAActividad(r) {
  const fecha = fechaYmd(r.fecha);
  const hi = normalizarHora(r.hora_inicio) || '00:00:00';
  const hf = normalizarHora(r.hora_fin) || hi;
  const lugar =
    r.modalidad === 'VIRTUAL'
      ? 'Videollamada (enlace externo)'
      : r.lugar || (r.modalidad === 'HIBRIDA' ? 'Presencial / virtual' : 'Presencial');
  return {
    id: `reunion-${r.id}`,
    reunion_id: r.id,
    tipo: 'reunion',
    descripcion: `Reunión: ${r.titulo || 'Sin título'}`,
    lugar,
    detalles: String(r.descripcion || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 280),
    fecha_inicio: `${fecha} ${hi}`,
    fecha_fin: `${fecha} ${hf}`,
    fecha_evento: fecha,
    modalidad: r.modalidad,
    estado_reunion: r.estado,
  };
}

async function listarReunionesComoActividades(queryFn, opts) {
  const { colegio_id, usuario_id, anio, mes, fecha, soloFuturas } = opts || {};
  if (!colegio_id || !usuario_id) return [];
  try {
    if (!(await tablaReunionesExiste(queryFn))) return [];
  } catch (e) {
    return [];
  }
  const añoFiltro = anio ? parseInt(anio, 10) : new Date().getFullYear();
  const rows = await queryFn(
    `SELECT r.id, r.titulo, r.descripcion, r.lugar, r.modalidad, r.estado,
            DATE_FORMAT(r.fecha, '%Y-%m-%d') AS fecha,
            TIME_FORMAT(r.hora_inicio, '%H:%i:%s') AS hora_inicio,
            TIME_FORMAT(r.hora_fin, '%H:%i:%s') AS hora_fin
     FROM reuniones r
     WHERE r.colegio_id = ?
       AND YEAR(r.fecha) = ?
       AND r.estado IN ('CONVOCADA','EN_CURSO','CERRADA')
       AND (
         r.creador_usuario_id = ?
         OR EXISTS (
           SELECT 1 FROM reuniones_participantes p
           WHERE p.reunion_id = r.id AND p.usuario_id = ?
         )
       )
     ORDER BY r.fecha ASC, r.hora_inicio ASC`,
    [colegio_id, añoFiltro, usuario_id, usuario_id]
  );
  let list = (rows || []).map(reunionAActividad);
  if (mes) {
    const mesNum = parseInt(mes, 10);
    if (mesNum >= 1 && mesNum <= 12) {
      list = list.filter((a) => {
        const m = parseInt(String(a.fecha_inicio || '').slice(5, 7), 10);
        return m === mesNum;
      });
    }
  }
  if (fecha) {
    const f = fechaYmd(fecha);
    list = list.filter((a) => fechaYmd(a.fecha_inicio) === f);
  }
  if (soloFuturas) {
    const hoy = fechaMySQLLima();
    list = list.filter((a) => fechaYmd(a.fecha_inicio) >= hoy);
  }
  return list;
}

async function mezclarReunionesEnActividades(queryFn, actividades, opts) {
  try {
    const extra = await listarReunionesComoActividades(queryFn, opts);
    const merged = [...(actividades || []), ...extra];
    merged.sort((a, b) => String(a.fecha_inicio || '').localeCompare(String(b.fecha_inicio || '')));
    if (opts && opts.limite) return merged.slice(0, opts.limite);
    return merged;
  } catch (e) {
    console.warn('[reuniones] calendario', e.message);
    return actividades || [];
  }
}

async function notificarParticipantesReunion({
  queryFn = queryDefault,
  executeFn = executeDefault,
  colegio_id,
  reunion,
  emisor_usuario_id,
  asunto,
  contenido,
  tagSuffix = 'convocatoria',
  soloUsuarioIds = null,
}) {
  const parts = await queryFn(
    `SELECT rp.usuario_id, u.tipo
     FROM reuniones_participantes rp
     INNER JOIN usuarios u ON u.id = rp.usuario_id
     WHERE rp.reunion_id = ?`,
    [reunion.id]
  );
  const dest = (parts || []).filter((p) => Number(p.usuario_id) !== Number(emisor_usuario_id));
  const filtrados = Array.isArray(soloUsuarioIds) && soloUsuarioIds.length
    ? dest.filter((p) => soloUsuarioIds.map(Number).includes(Number(p.usuario_id)))
    : dest;
  if (!filtrados.length) return;

  for (const d of filtrados) {
    const url = urlReunionPorTipo(d.tipo, reunion.id);
    try {
      await insertNotificacionUsuario(executeFn, {
        usuario_id: emisor_usuario_id,
        destinatario_id: d.usuario_id,
        asunto,
        contenido,
        estado: 'ENVIADO',
        accion_tipo: 'reunion',
        accion_payload: { reunion_id: reunion.id },
        url_destino: url,
      });
    } catch (e) {
      console.warn('[reuniones] notif', d.usuario_id, e.message);
    }
  }

  const ids = filtrados.map((d) => d.usuario_id);
  const ph = ids.map(() => '?').join(',');
  let subsData = [];
  try {
    subsData = await queryFn(
      `SELECT usuario_id, endpoint, p256dh, auth FROM push_subscriptions
       WHERE usuario_id IN (${ph}) AND colegio_id = ? AND (activo = 1 OR activo IS NULL)`,
      [...ids, colegio_id]
    );
  } catch (e) {
    console.warn('[reuniones] push subs', e.message);
    return;
  }
  if (!subsData || !subsData.length) return;

  const tipoPorId = new Map(filtrados.map((d) => [Number(d.usuario_id), d.tipo]));
  const tituloSafe = String(reunion.titulo || 'Reunión').trim() || 'Reunión';
  const pushItems = subsData.map((sub) => {
    const tipo = tipoPorId.get(Number(sub.usuario_id));
    const url = urlReunionPorTipo(tipo, reunion.id);
    return {
      subscription: {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      payload: {
        title: asunto || 'Reunión',
        body: String(contenido || tituloSafe).substring(0, 110),
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-192x192.png',
        vibrate: [150, 80, 150],
        tag: `reunion-${reunion.id}-${tagSuffix}`,
        data: { url, tipo: 'reunion', reunion_id: reunion.id },
      },
    };
  });
  enviarPushNotificacionesIndividuales(pushItems).catch((err) =>
    console.error('[reuniones] push', err.message)
  );
}

module.exports = {
  ESTADOS_VISIBLES_CALENDARIO,
  esGestorReuniones,
  urlReunionPorTipo,
  fechaYmd,
  esHoyLima,
  normalizarHora,
  normalizarEnlaceVideollamada,
  puedeDirigirReunion,
  sanitizarHtmlReunion,
  tablaReunionesExiste,
  puedeVerReunion,
  obtenerReunion,
  listarParticipantes,
  asegurarConvocante,
  insertarParticipantes,
  usuariosGrupoAlumnos,
  usuariosGrupoPorAudiencia,
  audienciasDeGrupo,
  resolverUsuarioPersonal,
  buscarParticipantesReunion,
  listarReunionesComoActividades,
  mezclarReunionesEnActividades,
  notificarParticipantesReunion,
  fechaHoraMySQLLima,
  nombreSqlUsuario,
};
