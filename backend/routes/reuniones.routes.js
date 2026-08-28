/**
 * Reuniones institucionales: convocatoria, acta, asistencia el mismo día al abrir,
 * enlace externo de videollamada (Meet/Zoom/etc.). No crea sala en el sistema.
 */
const express = require('express');
const path = require('path');
const multer = require('multer');
const router = express.Router();
const { query, execute, getAnioActivo } = require('../utils/mysql');
const { authenticateToken } = require('../middleware/auth');
const { staticFsSubdir } = require('../utils/staticStorage');
const { urlArchivoMensajeStatic } = require('../utils/mensajesHtml');
const { fechaHoraMySQLLima, fechaMySQLLima } = require('../utils/fechaHoraLima');
const {
  esGestorReuniones,
  esHoyLima,
  fechaYmd,
  normalizarHora,
  normalizarEnlaceVideollamada,
  tablaReunionesExiste,
  puedeVerReunion,
  obtenerReunion,
  listarParticipantes,
  asegurarConvocante,
  insertarParticipantes,
  usuariosGrupoPorAudiencia,
  resolverUsuarioPersonal,
  buscarParticipantesReunion,
  notificarParticipantesReunion,
  puedeDirigirReunion,
  sanitizarHtmlReunion,
} = require('../utils/reunionesHelper');

router.use(authenticateToken);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      try {
        cb(null, staticFsSubdir('Archivos'));
      } catch (e) {
        cb(e);
      }
    },
    filename: (req, file, cb) => {
      const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, `reunion-${unique}${path.extname(file.originalname || '')}`);
    },
  }),
  limits: { fileSize: 12 * 1024 * 1024 },
});

async function requireTablas(req, res, next) {
  try {
    if (!(await tablaReunionesExiste(query))) {
      return res.status(503).json({
        error: 'El módulo de reuniones no está instalado. Ejecute la migración 070_reuniones_mysql.sql.',
      });
    }
    next();
  } catch (e) {
    console.error('[reuniones] tablas', e);
    return res.status(500).json({ error: 'Error al verificar reuniones' });
  }
}

router.use(requireTablas);

function uidDe(req) {
  return req.user.usuario_id ?? req.user.id;
}

async function anioDe(req) {
  if (req.user.anio_activo) return req.user.anio_activo;
  return getAnioActivo(req.user.colegio_id);
}

function requireGestor(req, res, next) {
  if (!esGestorReuniones(req.user?.tipo)) {
    return res.status(403).json({ error: 'Solo administración puede crear o gestionar reuniones.' });
  }
  next();
}

function validarCamposCuerpo(body, { convocando } = {}) {
  const titulo = String(body.titulo || '').trim();
  if (!titulo) return { error: 'Indica un título para la reunión.' };
  if (titulo.length > 255) return { error: 'El título es demasiado largo.' };
  const fecha = fechaYmd(body.fecha);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: 'Fecha inválida.' };
  const hora_inicio = normalizarHora(body.hora_inicio);
  if (!hora_inicio) return { error: 'Hora de inicio inválida.' };
  const hora_fin = body.hora_fin ? normalizarHora(body.hora_fin) : null;
  if (body.hora_fin && !hora_fin) return { error: 'Hora de fin inválida.' };
  const modalidadRaw = String(body.modalidad || 'PRESENCIAL').toUpperCase();
  const modalidad = ['PRESENCIAL', 'VIRTUAL', 'HIBRIDA'].includes(modalidadRaw) ? modalidadRaw : 'PRESENCIAL';
  const lugar = String(body.lugar || '').trim().slice(0, 255) || null;
  const enlace = normalizarEnlaceVideollamada(body.enlace_videollamada);
  if (body.enlace_videollamada && String(body.enlace_videollamada).trim() && !enlace) {
    return { error: 'El enlace de videollamada debe ser una URL http(s) (Meet, Zoom, Teams, etc.).' };
  }
  if (convocando && (modalidad === 'VIRTUAL' || modalidad === 'HIBRIDA') && !enlace) {
    return { error: 'Para una reunión virtual o híbrida indica el enlace de Meet, Zoom u otra sala externa.' };
  }
  return {
    titulo,
    descripcion: sanitizarHtmlReunion(body.descripcion),
    fecha,
    hora_inicio,
    hora_fin,
    modalidad,
    lugar,
    enlace_videollamada: enlace,
  };
}

async function resolverInvitados(req, invitados, grupos) {
  const anio = await anioDe(req);
  const ids = [];
  (Array.isArray(invitados) ? invitados : []).forEach((x) => {
    const id = parseInt(x && typeof x === 'object' ? x.usuario_id : x, 10);
    if (Number.isInteger(id) && id > 0) ids.push(id);
  });
  for (const g of Array.isArray(grupos) ? grupos : []) {
    const gid = parseInt(g && typeof g === 'object' ? g.grupo_id : g, 10);
    if (!Number.isInteger(gid) || gid <= 0) continue;
    const rows = await usuariosGrupoPorAudiencia(query, req.user.colegio_id, anio, gid, g);
    (rows || []).forEach((a) => ids.push(a.id));
  }
  return [...new Set(ids)];
}

async function aplicarResponsableAbrir(req, reunionId) {
  if (!Object.prototype.hasOwnProperty.call(req.body || {}, 'abrir_usuario_id')) return;
  const raw = req.body.abrir_usuario_id;
  if (raw == null || raw === '' || raw === 0 || raw === '0') {
    await execute(`UPDATE reuniones SET abrir_usuario_id = NULL WHERE id = ?`, [reunionId]);
    return;
  }
  const u = await resolverUsuarioPersonal(query, req.user.colegio_id, raw);
  if (!u) {
    const err = new Error('Quien abre la reunión debe ser personal del colegio (docente o administrativo).');
    err.status = 400;
    throw err;
  }
  await execute(`UPDATE reuniones SET abrir_usuario_id = ? WHERE id = ?`, [u.id, reunionId]);
  await insertarParticipantes(execute, query, reunionId, req.user.colegio_id, [u.id]);
}

async function payloadReunion(reunion, req) {
  const participantes = await listarParticipantes(query, reunion.id);
  const archivosRows = await query(
    `SELECT id, nombre_original, nombre_archivo, mime_type, tamano, subido_por,
            DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
     FROM reuniones_archivos WHERE reunion_id = ? ORDER BY id ASC`,
    [reunion.id]
  );
  const archivos = (archivosRows || []).map((a) => ({
    ...a,
    url: urlArchivoMensajeStatic(a.nombre_archivo),
  }));
  const uid = Number(uidDe(req));
  const yo = (participantes || []).find((p) => Number(p.usuario_id) === uid) || null;
  const esGestor = esGestorReuniones(req.user.tipo);
  const esCreador = Number(reunion.creador_usuario_id) === uid;
  const puedeDirigir = puedeDirigirReunion(reunion, uid, req.user.tipo);
  const hoy = esHoyLima(reunion.fecha);
  const puedeAbrir = puedeDirigir && reunion.estado === 'CONVOCADA' && hoy;
  const puedeAsistir =
    !!yo &&
    reunion.estado === 'EN_CURSO' &&
    hoy &&
    yo.asistencia === 'PENDIENTE';
  let abrir = null;
  if (reunion.abrir_usuario_id) {
    const resp = await resolverUsuarioPersonal(query, req.user.colegio_id, reunion.abrir_usuario_id);
    if (resp) abrir = { usuario_id: resp.id, nombre: resp.nombre, tipo: resp.tipo };
  }
  return {
    reunion,
    participantes,
    archivos,
    abrir,
    permisos: {
      es_gestor: esGestor,
      es_creador: esCreador,
      es_responsable_abrir: !!(reunion.abrir_usuario_id && Number(reunion.abrir_usuario_id) === uid),
      puede_editar: (esGestor || esCreador) && ['BORRADOR', 'CONVOCADA'].includes(reunion.estado),
      puede_convocar: (esGestor || esCreador) && reunion.estado === 'BORRADOR',
      puede_abrir: puedeAbrir,
      puede_cerrar: puedeDirigir && reunion.estado === 'EN_CURSO',
      puede_cancelar: (esGestor || esCreador) && ['BORRADOR', 'CONVOCADA'].includes(reunion.estado),
      puede_acta: puedeDirigir && ['EN_CURSO', 'CERRADA'].includes(reunion.estado),
      puede_asistir: puedeAsistir,
      puede_marcar_asistencia: puedeDirigir && reunion.estado === 'EN_CURSO' && hoy,
      puede_archivos: puedeDirigir,
      asistencia_solo_hoy: true,
      es_hoy: hoy,
    },
    mi_participacion: yo,
  };
}

router.get('/buscar-participantes', requireGestor, async (req, res) => {
  try {
    const anio_activo = await anioDe(req);
    const resultados = await buscarParticipantesReunion(query, {
      colegio_id: req.user.colegio_id,
      anio_activo,
      q: req.query.q,
      solo: req.query.solo,
    });
    res.json({ resultados });
  } catch (e) {
    console.error('[reuniones] buscar', e);
    res.status(500).json({ error: 'Error al buscar participantes' });
  }
});

router.get('/', async (req, res) => {
  try {
    const { colegio_id, tipo } = req.user;
    const usuario_id = uidDe(req);
    const gestor = esGestorReuniones(tipo);
    const filtro = String(req.query.filtro || 'todas');
    const hoy = fechaMySQLLima();
    let sql = `
      SELECT r.id, r.titulo, r.modalidad, r.lugar, r.estado, r.creador_usuario_id,
             DATE_FORMAT(r.fecha, '%Y-%m-%d') AS fecha,
             TIME_FORMAT(r.hora_inicio, '%H:%i') AS hora_inicio,
             TIME_FORMAT(r.hora_fin, '%H:%i') AS hora_fin,
             (SELECT COUNT(*) FROM reuniones_participantes p WHERE p.reunion_id = r.id) AS total_invitados,
             (SELECT COUNT(*) FROM reuniones_participantes p WHERE p.reunion_id = r.id AND p.asistencia = 'ASISTIO') AS total_asistieron
      FROM reuniones r
      WHERE r.colegio_id = ?
    `;
    const params = [colegio_id];
    if (!gestor) {
      sql += ` AND (r.creador_usuario_id = ? OR r.abrir_usuario_id = ? OR EXISTS (
        SELECT 1 FROM reuniones_participantes p WHERE p.reunion_id = r.id AND p.usuario_id = ?
      )) AND r.estado <> 'BORRADOR'`;
      params.push(usuario_id, usuario_id, usuario_id);
    }
    if (filtro === 'proximas') {
      sql += ` AND r.fecha >= ? AND r.estado IN ('BORRADOR','CONVOCADA','EN_CURSO')`;
      params.push(hoy);
    } else if (filtro === 'hoy') {
      sql += ` AND r.fecha = ? AND r.estado IN ('CONVOCADA','EN_CURSO')`;
      params.push(hoy);
    } else if (filtro === 'pasadas') {
      sql += ` AND (r.fecha < ? OR r.estado IN ('CERRADA','CANCELADA'))`;
      params.push(hoy);
    }
    sql += ` ORDER BY r.fecha DESC, r.hora_inicio DESC LIMIT 200`;
    const reuniones = await query(sql, params);
    res.json({ reuniones: reuniones || [], es_gestor: gestor });
  } catch (e) {
    console.error('[reuniones] listar', e);
    res.status(500).json({ error: 'Error al listar reuniones' });
  }
});

router.post('/', requireGestor, async (req, res) => {
  try {
    const convocar = !!req.body.convocar;
    const campos = validarCamposCuerpo(req.body, { convocando: convocar });
    if (campos.error) return res.status(400).json({ error: campos.error });
    const { colegio_id, tipo } = req.user;
    const usuario_id = uidDe(req);
    const ahora = fechaHoraMySQLLima();
    const estado = convocar ? 'CONVOCADA' : 'BORRADOR';
    const result = await execute(
      `INSERT INTO reuniones
        (colegio_id, creador_usuario_id, abrir_usuario_id, titulo, descripcion, fecha, hora_inicio, hora_fin,
         modalidad, lugar, enlace_videollamada, estado, created_at, updated_at)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        colegio_id,
        usuario_id,
        campos.titulo,
        campos.descripcion,
        campos.fecha,
        campos.hora_inicio,
        campos.hora_fin,
        campos.modalidad,
        campos.lugar,
        campos.enlace_videollamada,
        estado,
        ahora,
        ahora,
      ]
    );
    const id = result.insertId;
    await asegurarConvocante(execute, query, id, usuario_id, tipo);
    try {
      await aplicarResponsableAbrir(req, id);
    } catch (e) {
      if (e.status === 400) return res.status(400).json({ error: e.message });
      throw e;
    }
    const invitadosIds = await resolverInvitados(req, req.body.invitados, req.body.grupos);
    await insertarParticipantes(execute, query, id, colegio_id, invitadosIds);
    const reunion = await obtenerReunion(query, id, colegio_id);
    if (convocar) {
      await notificarParticipantesReunion({
        colegio_id,
        reunion,
        emisor_usuario_id: usuario_id,
        asunto: 'Convocatoria a reunión',
        contenido: `Te convocan a «${campos.titulo}» el ${campos.fecha} a las ${String(campos.hora_inicio).slice(0, 5)}.`,
        tagSuffix: 'convocatoria',
      });
    }
    const payload = await payloadReunion(reunion, req);
    res.status(201).json(payload);
  } catch (e) {
    console.error('[reuniones] crear', e);
    res.status(500).json({ error: 'Error al crear la reunión' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    if (!/^\d+$/.test(String(req.params.id))) {
      return res.status(404).json({ error: 'Reunión no encontrada' });
    }
    const reunion = await obtenerReunion(query, req.params.id, req.user.colegio_id);
    if (!reunion) return res.status(404).json({ error: 'Reunión no encontrada' });
    const ok = await puedeVerReunion(query, reunion, uidDe(req), req.user.tipo);
    if (!ok) return res.status(403).json({ error: 'No estás convocado a esta reunión.' });
    res.json(await payloadReunion(reunion, req));
  } catch (e) {
    console.error('[reuniones] detalle', e);
    res.status(500).json({ error: 'Error al obtener la reunión' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const reunion = await obtenerReunion(query, req.params.id, req.user.colegio_id);
    if (!reunion) return res.status(404).json({ error: 'Reunión no encontrada' });
    const esCreador = Number(reunion.creador_usuario_id) === Number(uidDe(req));
    if (!esGestorReuniones(req.user.tipo) && !esCreador) {
      return res.status(403).json({ error: 'No puedes editar esta reunión.' });
    }
    if (!['BORRADOR', 'CONVOCADA'].includes(reunion.estado)) {
      return res.status(400).json({ error: 'Solo se puede editar una reunión en borrador o convocada.' });
    }
    const campos = validarCamposCuerpo({ ...reunion, ...req.body }, { convocando: reunion.estado === 'CONVOCADA' });
    if (campos.error) return res.status(400).json({ error: campos.error });
    await execute(
      `UPDATE reuniones SET titulo = ?, descripcion = ?, fecha = ?, hora_inicio = ?, hora_fin = ?,
         modalidad = ?, lugar = ?, enlace_videollamada = ?, updated_at = ?
       WHERE id = ? AND colegio_id = ?`,
      [
        campos.titulo,
        campos.descripcion,
        campos.fecha,
        campos.hora_inicio,
        campos.hora_fin,
        campos.modalidad,
        campos.lugar,
        campos.enlace_videollamada,
        fechaHoraMySQLLima(),
        reunion.id,
        req.user.colegio_id,
      ]
    );
    try {
      await aplicarResponsableAbrir(req, reunion.id);
    } catch (e) {
      if (e.status === 400) return res.status(400).json({ error: e.message });
      throw e;
    }
    if (Array.isArray(req.body.invitados) || Array.isArray(req.body.grupos)) {
      const prev = new Set((await listarParticipantes(query, reunion.id)).map((p) => Number(p.usuario_id)));
      const invitadosIds = await resolverInvitados(req, req.body.invitados, req.body.grupos);
      await insertarParticipantes(execute, query, reunion.id, req.user.colegio_id, invitadosIds);
      if (reunion.estado === 'CONVOCADA') {
        const ahoraParts = await listarParticipantes(query, reunion.id);
        const nuevos = ahoraParts.map((p) => Number(p.usuario_id)).filter((id) => !prev.has(id));
        if (nuevos.length) {
          const actualTmp = await obtenerReunion(query, reunion.id, req.user.colegio_id);
          await notificarParticipantesReunion({
            colegio_id: req.user.colegio_id,
            reunion: actualTmp,
            emisor_usuario_id: uidDe(req),
            asunto: 'Convocatoria a reunión',
            contenido: `Te convocan a «${actualTmp.titulo}» el ${actualTmp.fecha} a las ${String(actualTmp.hora_inicio || '').slice(0, 5)}.`,
            tagSuffix: 'convocatoria',
            soloUsuarioIds: nuevos,
          });
        }
      }
    }
    const actual = await obtenerReunion(query, reunion.id, req.user.colegio_id);
    res.json(await payloadReunion(actual, req));
  } catch (e) {
    console.error('[reuniones] patch', e);
    res.status(500).json({ error: 'Error al actualizar la reunión' });
  }
});

router.post('/:id/convocar', async (req, res) => {
  try {
    const reunion = await obtenerReunion(query, req.params.id, req.user.colegio_id);
    if (!reunion) return res.status(404).json({ error: 'Reunión no encontrada' });
    const esCreador = Number(reunion.creador_usuario_id) === Number(uidDe(req));
    if (!esGestorReuniones(req.user.tipo) && !esCreador) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    if (reunion.estado !== 'BORRADOR') {
      return res.status(400).json({ error: 'Solo un borrador se puede convocar.' });
    }
    const campos = validarCamposCuerpo(reunion, { convocando: true });
    if (campos.error) return res.status(400).json({ error: campos.error });
    await execute(
      `UPDATE reuniones SET estado = 'CONVOCADA', updated_at = ? WHERE id = ?`,
      [fechaHoraMySQLLima(), reunion.id]
    );
    const actual = await obtenerReunion(query, reunion.id, req.user.colegio_id);
    await notificarParticipantesReunion({
      colegio_id: req.user.colegio_id,
      reunion: actual,
      emisor_usuario_id: uidDe(req),
      asunto: 'Convocatoria a reunión',
      contenido: `Te convocan a «${actual.titulo}» el ${actual.fecha} a las ${String(actual.hora_inicio || '').slice(0, 5)}.`,
      tagSuffix: 'convocatoria',
    });
    res.json(await payloadReunion(actual, req));
  } catch (e) {
    console.error('[reuniones] convocar', e);
    res.status(500).json({ error: 'Error al convocar' });
  }
});

router.post('/:id/abrir', async (req, res) => {
  try {
    const reunion = await obtenerReunion(query, req.params.id, req.user.colegio_id);
    if (!reunion) return res.status(404).json({ error: 'Reunión no encontrada' });
    if (!puedeDirigirReunion(reunion, uidDe(req), req.user.tipo)) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    if (reunion.estado !== 'CONVOCADA') {
      return res.status(400).json({ error: 'Solo se abre una reunión ya convocada.' });
    }
    if (!esHoyLima(reunion.fecha)) {
      return res.status(400).json({
        error: 'La reunión se abre el mismo día programado. La asistencia también se registra solo ese día.',
      });
    }
    const ahora = fechaHoraMySQLLima();
    await execute(
      `UPDATE reuniones SET estado = 'EN_CURSO', iniciada_en = ?, updated_at = ? WHERE id = ?`,
      [ahora, ahora, reunion.id]
    );
    await execute(
      `UPDATE reuniones_participantes SET asistencia = 'ASISTIO', asistencia_en = ?
       WHERE reunion_id = ? AND usuario_id = ? AND asistencia = 'PENDIENTE'`,
      [ahora, reunion.id, uidDe(req)]
    );
    const actual = await obtenerReunion(query, reunion.id, req.user.colegio_id);
    await notificarParticipantesReunion({
      colegio_id: req.user.colegio_id,
      reunion: actual,
      emisor_usuario_id: uidDe(req),
      asunto: 'La reunión ya comenzó',
      contenido: `«${actual.titulo}» está en curso. Confirma tu asistencia (ASISTÍ) hoy.`,
      tagSuffix: 'abierta',
    });
    res.json(await payloadReunion(actual, req));
  } catch (e) {
    console.error('[reuniones] abrir', e);
    res.status(500).json({ error: 'Error al abrir la reunión' });
  }
});

router.post('/:id/cerrar', async (req, res) => {
  try {
    const reunion = await obtenerReunion(query, req.params.id, req.user.colegio_id);
    if (!reunion) return res.status(404).json({ error: 'Reunión no encontrada' });
    if (!puedeDirigirReunion(reunion, uidDe(req), req.user.tipo)) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    if (reunion.estado !== 'EN_CURSO') {
      return res.status(400).json({ error: 'La reunión no está en curso.' });
    }
    const ahora = fechaHoraMySQLLima();
    await execute(
      `UPDATE reuniones_participantes SET asistencia = 'AUSENTE'
       WHERE reunion_id = ? AND asistencia = 'PENDIENTE'`,
      [reunion.id]
    );
    await execute(
      `UPDATE reuniones SET estado = 'CERRADA', cerrada_en = ?, updated_at = ? WHERE id = ?`,
      [ahora, ahora, reunion.id]
    );
    const actual = await obtenerReunion(query, reunion.id, req.user.colegio_id);
    res.json(await payloadReunion(actual, req));
  } catch (e) {
    console.error('[reuniones] cerrar', e);
    res.status(500).json({ error: 'Error al cerrar la reunión' });
  }
});

router.post('/:id/cancelar', async (req, res) => {
  try {
    const reunion = await obtenerReunion(query, req.params.id, req.user.colegio_id);
    if (!reunion) return res.status(404).json({ error: 'Reunión no encontrada' });
    const esCreador = Number(reunion.creador_usuario_id) === Number(uidDe(req));
    if (!esGestorReuniones(req.user.tipo) && !esCreador) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    if (!['BORRADOR', 'CONVOCADA'].includes(reunion.estado)) {
      return res.status(400).json({ error: 'No se puede cancelar en este estado.' });
    }
    await execute(
      `UPDATE reuniones SET estado = 'CANCELADA', updated_at = ? WHERE id = ?`,
      [fechaHoraMySQLLima(), reunion.id]
    );
    const actual = await obtenerReunion(query, reunion.id, req.user.colegio_id);
    if (reunion.estado === 'CONVOCADA') {
      await notificarParticipantesReunion({
        colegio_id: req.user.colegio_id,
        reunion: actual,
        emisor_usuario_id: uidDe(req),
        asunto: 'Reunión cancelada',
        contenido: `Se canceló «${actual.titulo}» (${actual.fecha}).`,
        tagSuffix: 'cancelada',
      });
    }
    res.json(await payloadReunion(actual, req));
  } catch (e) {
    console.error('[reuniones] cancelar', e);
    res.status(500).json({ error: 'Error al cancelar' });
  }
});

router.patch('/:id/acta', async (req, res) => {
  try {
    const reunion = await obtenerReunion(query, req.params.id, req.user.colegio_id);
    if (!reunion) return res.status(404).json({ error: 'Reunión no encontrada' });
    if (!puedeDirigirReunion(reunion, uidDe(req), req.user.tipo)) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    if (!['EN_CURSO', 'CERRADA'].includes(reunion.estado)) {
      return res.status(400).json({ error: 'El acta se redacta al abrir o al cerrar la reunión.' });
    }
    await execute(
      `UPDATE reuniones SET acta = ?, acuerdos = ?, updated_at = ? WHERE id = ?`,
      [
        req.body.acta != null ? sanitizarHtmlReunion(req.body.acta) : reunion.acta,
        req.body.acuerdos != null ? sanitizarHtmlReunion(req.body.acuerdos) : reunion.acuerdos,
        fechaHoraMySQLLima(),
        reunion.id,
      ]
    );
    const actual = await obtenerReunion(query, reunion.id, req.user.colegio_id);
    res.json(await payloadReunion(actual, req));
  } catch (e) {
    console.error('[reuniones] acta', e);
    res.status(500).json({ error: 'Error al guardar el acta' });
  }
});

router.post('/:id/asistencia', async (req, res) => {
  try {
    const reunion = await obtenerReunion(query, req.params.id, req.user.colegio_id);
    if (!reunion) return res.status(404).json({ error: 'Reunión no encontrada' });
    if (reunion.estado !== 'EN_CURSO') {
      return res.status(400).json({ error: 'La asistencia se registra cuando el organizador abre la reunión.' });
    }
    if (!esHoyLima(reunion.fecha)) {
      return res.status(400).json({ error: 'La asistencia solo se registra el mismo día de la reunión.' });
    }
    const uid = Number(uidDe(req));
    const targetId = req.body.usuario_id != null ? parseInt(req.body.usuario_id, 10) : uid;
    const puedeDirigir = puedeDirigirReunion(reunion, uid, req.user.tipo);
    if (targetId !== uid && !puedeDirigir) {
      return res.status(403).json({ error: 'Solo puedes marcar tu propia asistencia.' });
    }
    const valorRaw = String(req.body.asistencia || 'ASISTIO').toUpperCase();
    const valor = ['ASISTIO', 'AUSENTE', 'JUSTIFICADO', 'PENDIENTE'].includes(valorRaw) ? valorRaw : 'ASISTIO';
    if (targetId === uid && valor !== 'ASISTIO' && !puedeDirigir) {
      return res.status(400).json({ error: 'Usa ASISTÍ para confirmar tu presencia.' });
    }
    const part = await query(
      `SELECT id FROM reuniones_participantes WHERE reunion_id = ? AND usuario_id = ? LIMIT 1`,
      [reunion.id, targetId]
    );
    if (!part || !part.length) {
      return res.status(403).json({ error: 'No estás en la lista de convocados.' });
    }
    const ahora = fechaHoraMySQLLima();
    await execute(
      `UPDATE reuniones_participantes SET asistencia = ?, asistencia_en = ? WHERE reunion_id = ? AND usuario_id = ?`,
      [valor, valor === 'PENDIENTE' ? null : ahora, reunion.id, targetId]
    );
    const actual = await obtenerReunion(query, reunion.id, req.user.colegio_id);
    res.json(await payloadReunion(actual, req));
  } catch (e) {
    console.error('[reuniones] asistencia', e);
    res.status(500).json({ error: 'Error al registrar asistencia' });
  }
});

router.delete('/:id/participantes/:usuarioId', requireGestor, async (req, res) => {
  try {
    const reunion = await obtenerReunion(query, req.params.id, req.user.colegio_id);
    if (!reunion) return res.status(404).json({ error: 'Reunión no encontrada' });
    if (!['BORRADOR', 'CONVOCADA'].includes(reunion.estado)) {
      return res.status(400).json({ error: 'No se puede quitar convocados en este estado.' });
    }
    const uid = parseInt(req.params.usuarioId, 10);
    if (uid === Number(reunion.creador_usuario_id)) {
      return res.status(400).json({ error: 'No se puede quitar al convocante.' });
    }
    await execute(`DELETE FROM reuniones_participantes WHERE reunion_id = ? AND usuario_id = ?`, [reunion.id, uid]);
    const actual = await obtenerReunion(query, reunion.id, req.user.colegio_id);
    res.json(await payloadReunion(actual, req));
  } catch (e) {
    console.error('[reuniones] quitar', e);
    res.status(500).json({ error: 'Error al quitar participante' });
  }
});

router.post('/:id/archivos', upload.single('archivo'), async (req, res) => {
  try {
    const reunion = await obtenerReunion(query, req.params.id, req.user.colegio_id);
    if (!reunion) return res.status(404).json({ error: 'Reunión no encontrada' });
    if (!puedeDirigirReunion(reunion, uidDe(req), req.user.tipo)) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    if (!req.file) return res.status(400).json({ error: 'Adjunta un archivo.' });
    await execute(
      `INSERT INTO reuniones_archivos
        (reunion_id, nombre_original, nombre_archivo, mime_type, tamano, subido_por, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        reunion.id,
        String(req.file.originalname || 'archivo').slice(0, 255),
        req.file.filename,
        req.file.mimetype || null,
        req.file.size || null,
        uidDe(req),
        fechaHoraMySQLLima(),
      ]
    );
    const actual = await obtenerReunion(query, reunion.id, req.user.colegio_id);
    res.json(await payloadReunion(actual, req));
  } catch (e) {
    console.error('[reuniones] archivo', e);
    res.status(500).json({ error: 'Error al subir el archivo' });
  }
});

router.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'El archivo supera 12 MB.' });
  }
  next(err);
});

module.exports = router;
