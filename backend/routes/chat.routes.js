/**
 * Chat Vanguard — salas de aula, personal y 1 a 1.
 */
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { query, execute } = require('../utils/mysql');
const { fechaHoraMySQLLima } = require('../utils/fechaHoraLima');
const {
  uidDe,
  esStaff,
  requireModuloChat,
  aulasDeUsuario,
  tituloAula,
  asegurarSala,
  puedenDm,
  puedeVerSala,
  nombreSqlUsuario,
  joinPersonaUsuario,
} = require('../utils/chatVanguard');
const { notificarMensajeChat, marcarAvisosChatLeidos } = require('../utils/chatNotificar');

router.use(authenticateToken);
router.use(requireModuloChat);

function tablaFalta(e) {
  return e && (e.code === 'ER_NO_SUCH_TABLE' || /doesn't exist|no existe/i.test(String(e.message || '')));
}

function errorChat(res, e, fallback) {
  console.error('[chat]', fallback, e.message);
  if (tablaFalta(e)) {
    return res.status(503).json({ error: 'Falta ejecutar la migración 109_chat_vanguard_mysql.sql en phpMyAdmin.' });
  }
  return res.status(500).json({ error: fallback });
}

async function filtrarOcultas(salas, usuarioId) {
  const lista = salas || [];
  if (!lista.length) return lista;
  try {
    const rows = await query(
      `SELECT o.sala_id, o.hasta_id,
              (SELECT MAX(m.id) FROM chat_mensajes m WHERE m.sala_id = o.sala_id) AS max_id
       FROM chat_ocultas o
       WHERE o.usuario_id = ?`,
      [usuarioId]
    );
    const oculto = new Map(rows.map((r) => [Number(r.sala_id), r]));
    return lista.filter((s) => {
      if (s.tipo !== 'dm') return true;
      const o = oculto.get(Number(s.id));
      if (!o) return true;
      const maxId = Number(o.max_id) || 0;
      return maxId > Number(o.hasta_id || 0);
    });
  } catch (e) {
    if (e.code !== 'ER_NO_SUCH_TABLE') console.warn('[chat] ocultas:', e.message);
    return lista;
  }
}

function mapSala(s, extra = {}) {
  return {
    id: s.id,
    tipo: s.tipo,
    clave: s.clave,
    grupo_id: s.grupo_id,
    titulo: s.titulo,
    ...extra,
  };
}

async function extrasDeSalas(salaIds, usuarioId) {
  const ids = (salaIds || []).filter(Boolean);
  const ultimos = {};
  const noLeidos = {};
  if (!ids.length) return { ultimos, noLeidos };
  const ph = ids.map(() => '?').join(',');
  const last = await query(
    `SELECT m.sala_id, m.texto, m.created_at
     FROM chat_mensajes m
     INNER JOIN (
       SELECT sala_id, MAX(id) AS max_id FROM chat_mensajes WHERE sala_id IN (${ph}) GROUP BY sala_id
     ) t ON t.sala_id = m.sala_id AND t.max_id = m.id`,
    ids
  );
  last.forEach((r) => { ultimos[r.sala_id] = r; });
  const unread = await query(
    `SELECT m.sala_id, COUNT(*) AS n
     FROM chat_mensajes m
     LEFT JOIN chat_lecturas l ON l.sala_id = m.sala_id AND l.usuario_id = ?
     WHERE m.sala_id IN (${ph}) AND m.id > IFNULL(l.last_id, 0)
     GROUP BY m.sala_id`,
    [usuarioId, ...ids]
  );
  unread.forEach((r) => { noLeidos[r.sala_id] = Number(r.n || 0); });
  return { ultimos, noLeidos };
}

router.get('/salas', async (req, res) => {
  try {
    const yo = uidDe(req);
    const cid = req.user.colegio_id;
    const crudas = [];

    if (esStaff(req.user.tipo)) {
      crudas.push(await asegurarSala({
        colegioId: cid,
        tipo: 'personal',
        clave: 'personal',
        titulo: 'Personal del colegio',
      }));
    }

    const aulas = await aulasDeUsuario(req);
    for (const g of aulas) {
      crudas.push(await asegurarSala({
        colegioId: cid,
        tipo: 'aula',
        clave: `aula:${g.id}`,
        titulo: tituloAula(g),
        grupoId: g.id,
      }));
    }

    const dms = await query(
      `SELECT s.*,
              ${nombreSqlUsuario()} AS otro_nombre,
              u.tipo AS otro_tipo
       FROM chat_salas s
       INNER JOIN usuarios u ON u.id = IF(s.user_a_id = ?, s.user_b_id, s.user_a_id)
       ${joinPersonaUsuario()}
       WHERE s.colegio_id = ? AND s.tipo = 'dm'
         AND (s.user_a_id = ? OR s.user_b_id = ?)
       ORDER BY s.id DESC`,
      [yo, cid, yo, yo]
    );
    crudas.push(...(await filtrarOcultas(dms, yo)));

    const { ultimos, noLeidos } = await extrasDeSalas(crudas.map((s) => s.id), yo);
    const lista = crudas.map((s) => {
      const ult = ultimos[s.id];
      const esDm = s.tipo === 'dm';
      return mapSala(s, {
        subtitulo: esDm
          ? etiquetaTipo(s.otro_tipo)
          : s.tipo === 'personal'
            ? 'Docentes y administración'
            : 'Aula · alumnos, padres y personal',
        otro_nombre: s.otro_nombre,
        titulo: esDm ? (s.otro_nombre || s.titulo) : s.titulo,
        no_leidos: noLeidos[s.id] || 0,
        ultimo: ult?.texto || '',
        ultimo_at: ult?.created_at || null,
      });
    });

    lista.sort((a, b) => {
      const ta = a.ultimo_at ? new Date(a.ultimo_at).getTime() : 0;
      const tb = b.ultimo_at ? new Date(b.ultimo_at).getTime() : 0;
      if (tb !== ta) return tb - ta;
      if (a.tipo === 'personal' && b.tipo !== 'personal') return -1;
      if (b.tipo === 'personal' && a.tipo !== 'personal') return 1;
      return String(a.titulo).localeCompare(String(b.titulo), 'es');
    });

    res.json({ yo, tipo: req.user.tipo, salas: lista });
  } catch (e) {
    return errorChat(res, e, 'No se pudieron cargar las conversaciones.');
  }
});

router.post('/pulso', async (req, res) => {
  try {
    const yo = uidDe(req);
    const tab = String(req.body?.tab_id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
    if (!tab) return res.status(400).json({ error: 'Falta la pestaña.' });
    const ahora = fechaHoraMySQLLima();
    await execute(
      `INSERT INTO chat_sesion (usuario_id, tab_id, visto_at) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE visto_at = VALUES(visto_at)`,
      [yo, tab, ahora]
    );
    execute(
      `DELETE FROM chat_sesion WHERE usuario_id = ? AND visto_at < DATE_SUB(?, INTERVAL 2 MINUTE)`,
      [yo, ahora]
    ).catch(() => {});
    res.json({ ok: true });
  } catch (e) {
    return errorChat(res, e, 'No se pudo registrar la sesión.');
  }
});

router.post('/ausente', async (req, res) => {
  try {
    const yo = uidDe(req);
    const tab = String(req.body?.tab_id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
    if (!tab) return res.json({ ok: true });
    await execute(`DELETE FROM chat_sesion WHERE usuario_id = ? AND tab_id = ?`, [yo, tab]);
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') return res.json({ ok: true });
    return errorChat(res, e, 'No se pudo cerrar la sesión del chat.');
  }
});

router.get('/aviso', async (req, res) => {
  try {
    const yo = uidDe(req);
    const cid = req.user.colegio_id;
    const staff = esStaff(req.user.tipo);
    const params = [cid];
    let vis = `(s.tipo = 'dm' AND (s.user_a_id = ? OR s.user_b_id = ?))`;
    params.push(yo, yo);
    if (staff) {
      vis += ` OR s.tipo = 'personal' OR s.tipo = 'aula'`;
    } else {
      const aulas = await aulasDeUsuario(req);
      const gids = aulas.map((g) => Number(g.id)).filter(Boolean);
      if (gids.length) {
        vis += ` OR (s.tipo = 'aula' AND s.grupo_id IN (${gids.map(() => '?').join(',')}))`;
        params.push(...gids);
      }
    }
    const salas = await query(
      `SELECT s.id, s.tipo, s.titulo, s.user_a_id, s.user_b_id
       FROM chat_salas s
       WHERE s.colegio_id = ? AND (${vis})`,
      params
    );
    const visibles = await filtrarOcultas(salas, yo);
    if (!visibles.length) return res.json({ no_leidos: 0, salas: [] });

    const dmIds = visibles.filter((s) => s.tipo === 'dm').flatMap((s) => {
      const otro = Number(s.user_a_id) === yo ? Number(s.user_b_id) : Number(s.user_a_id);
      return otro ? [otro] : [];
    });
    const nombres = {};
    if (dmIds.length) {
      const unicos = [...new Set(dmIds)];
      const rows = await query(
        `SELECT u.id, ${nombreSqlUsuario()} AS nombre
         FROM usuarios u ${joinPersonaUsuario()}
         WHERE u.id IN (${unicos.map(() => '?').join(',')})`,
        unicos
      );
      rows.forEach((r) => { nombres[r.id] = r.nombre; });
    }

    const { ultimos, noLeidos } = await extrasDeSalas(visibles.map((s) => s.id), yo);
    const lista = visibles.map((s) => {
      const ult = ultimos[s.id];
      const otro = s.tipo === 'dm'
        ? (Number(s.user_a_id) === yo ? Number(s.user_b_id) : Number(s.user_a_id))
        : 0;
      return {
        id: s.id,
        tipo: s.tipo,
        titulo: s.tipo === 'dm' ? (nombres[otro] || s.titulo) : s.titulo,
        ultimo: ult?.texto || '',
        ultimo_at: ult?.created_at || null,
        no_leidos: noLeidos[s.id] || 0,
      };
    });
    lista.sort((a, b) => {
      const ta = a.ultimo_at ? new Date(a.ultimo_at).getTime() : 0;
      const tb = b.ultimo_at ? new Date(b.ultimo_at).getTime() : 0;
      if ((b.no_leidos > 0) !== (a.no_leidos > 0)) return b.no_leidos > 0 ? 1 : -1;
      return tb - ta;
    });
    const total = lista.reduce((n, s) => n + (s.no_leidos || 0), 0);
    res.json({ no_leidos: total, salas: lista.slice(0, 6) });
  } catch (e) {
    return errorChat(res, e, 'No se pudo consultar el chat.');
  }
});

function etiquetaTipo(tipo) {
  const t = String(tipo || '').toUpperCase();
  if (t === 'ALUMNO') return 'Alumno';
  if (t === 'APODERADO') return 'Apoderado';
  if (t === 'DOCENTE') return 'Docente';
  if (t === 'ADMINISTRADOR') return 'Administración';
  if (t === 'PSICOLOGA') return 'Psicología';
  if (t === 'COORDINADOR') return 'Coordinación';
  if (t === 'DIRECTOR') return 'Dirección';
  if (t === 'SECRETARIA') return 'Secretaría';
  if (t === 'CONTADOR') return 'Contabilidad';
  if (t === 'PROMOTORIA') return 'Promotoría';
  return 'Personal';
}

router.get('/salas/:id/mensajes', async (req, res) => {
  try {
    const yo = uidDe(req);
    const salaId = parseInt(req.params.id, 10);
    const after = parseInt(req.query.after_id, 10) || 0;
    const salas = await query(`SELECT * FROM chat_salas WHERE id = ? LIMIT 1`, [salaId]);
    const sala = salas[0];
    if (!(await puedeVerSala(req, sala))) {
      return res.status(404).json({ error: 'Conversación no encontrada.' });
    }
    execute(
      `INSERT INTO chat_presencia (sala_id, usuario_id, visto_at) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE visto_at = VALUES(visto_at)`,
      [salaId, yo, fechaHoraMySQLLima()]
    ).catch(() => {});
    const msgs = await query(
      `SELECT m.id, m.usuario_id, m.texto, m.created_at,
              ${nombreSqlUsuario()} AS nombre, u.tipo
       FROM chat_mensajes m
       INNER JOIN usuarios u ON u.id = m.usuario_id
       ${joinPersonaUsuario()}
       WHERE m.sala_id = ? AND m.id > ?
       ORDER BY m.id ASC
       LIMIT 200`,
      [salaId, after]
    );
    if (!after) {
      marcarAvisosChatLeidos(yo, salaId).catch(() => {});
      const maxId = msgs.length ? msgs[msgs.length - 1].id : 0;
      if (maxId) {
        await execute(
          `INSERT INTO chat_lecturas (sala_id, usuario_id, last_id) VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE last_id = GREATEST(last_id, VALUES(last_id))`,
          [salaId, yo, maxId]
        );
      }
    } else if (msgs.length) {
      const maxId = msgs[msgs.length - 1].id;
      await execute(
        `INSERT INTO chat_lecturas (sala_id, usuario_id, last_id) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE last_id = GREATEST(last_id, VALUES(last_id))`,
        [salaId, yo, maxId]
      );
    }
    res.json({
      sala: mapSala(sala),
      mensajes: msgs.map((m) => ({
        id: m.id,
        usuario_id: m.usuario_id,
        nombre: m.nombre,
        tipo: m.tipo,
        texto: m.texto,
        created_at: m.created_at,
        mio: Number(m.usuario_id) === yo,
      })),
    });
  } catch (e) {
    return errorChat(res, e, 'No se pudieron cargar los mensajes.');
  }
});

router.post('/salas/:id/mensajes', async (req, res) => {
  try {
    const yo = uidDe(req);
    const salaId = parseInt(req.params.id, 10);
    const texto = String(req.body?.texto || '').trim();
    if (!texto) return res.status(400).json({ error: 'Escriba un mensaje.' });
    if (texto.length > 2000) return res.status(400).json({ error: 'El mensaje es demasiado largo.' });
    const salas = await query(`SELECT * FROM chat_salas WHERE id = ? LIMIT 1`, [salaId]);
    const sala = salas[0];
    if (!(await puedeVerSala(req, sala))) {
      return res.status(404).json({ error: 'Conversación no encontrada.' });
    }
    const r = await execute(
      `INSERT INTO chat_mensajes (sala_id, usuario_id, texto, created_at) VALUES (?, ?, ?, ?)`,
      [salaId, yo, texto, fechaHoraMySQLLima()]
    );
    await execute(
      `INSERT INTO chat_lecturas (sala_id, usuario_id, last_id) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE last_id = VALUES(last_id)`,
      [salaId, yo, r.insertId]
    );
    const rows = await query(
      `SELECT m.id, m.usuario_id, m.texto, m.created_at,
              ${nombreSqlUsuario()} AS nombre, u.tipo
       FROM chat_mensajes m
       INNER JOIN usuarios u ON u.id = m.usuario_id
       ${joinPersonaUsuario()}
       WHERE m.id = ?`,
      [r.insertId]
    );
    const m = rows[0];
    notificarMensajeChat({
      sala,
      texto,
      remitenteId: yo,
      remitenteNombre: m?.nombre,
    }).catch((err) => console.warn('[chat] notificar:', err.message));
    res.json({
      mensaje: {
        id: m.id,
        usuario_id: m.usuario_id,
        nombre: m.nombre,
        tipo: m.tipo,
        texto: m.texto,
        created_at: m.created_at,
        mio: true,
      },
    });
  } catch (e) {
    return errorChat(res, e, 'No se pudo enviar el mensaje.');
  }
});

router.delete('/salas/:id', async (req, res) => {
  try {
    const yo = uidDe(req);
    const salaId = parseInt(req.params.id, 10);
    const salas = await query(`SELECT * FROM chat_salas WHERE id = ? LIMIT 1`, [salaId]);
    const sala = salas[0];
    if (!sala || sala.tipo !== 'dm' || !(await puedeVerSala(req, sala))) {
      return res.status(404).json({ error: 'Solo puede borrar un chat privado.' });
    }
    const max = await query(`SELECT IFNULL(MAX(id), 0) AS n FROM chat_mensajes WHERE sala_id = ?`, [salaId]);
    await execute(
      `INSERT INTO chat_ocultas (sala_id, usuario_id, hasta_id) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE hasta_id = VALUES(hasta_id)`,
      [salaId, yo, Number(max[0]?.n) || 0]
    );
    res.json({ ok: true });
  } catch (e) {
    return errorChat(res, e, 'No se pudo borrar la conversación.');
  }
});

router.post('/dm', async (req, res) => {
  try {
    const yo = uidDe(req);
    const otro = parseInt(req.body?.usuario_id, 10);
    if (!(await puedenDm(req, otro))) {
      return res.status(403).json({ error: 'No puede iniciar un chat con esa persona.' });
    }
    const a = Math.min(yo, otro);
    const b = Math.max(yo, otro);
    const persona = await query(
      `SELECT ${nombreSqlUsuario()} AS nombre FROM usuarios u ${joinPersonaUsuario()} WHERE u.id = ?`,
      [otro]
    );
    const sala = await asegurarSala({
      colegioId: req.user.colegio_id,
      tipo: 'dm',
      clave: `dm:${a}_${b}`,
      titulo: persona[0]?.nombre || 'Chat privado',
      userA: a,
      userB: b,
    });
    res.json({ sala: mapSala(sala, { titulo: persona[0]?.nombre || sala.titulo }) });
  } catch (e) {
    return errorChat(res, e, 'No se pudo abrir el chat.');
  }
});

router.get('/contactos', async (req, res) => {
  try {
    const yo = uidDe(req);
    const cid = req.user.colegio_id;
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ contactos: [] });
    const like = `%${q.replace(/[%_\\]/g, '')}%`;

    const params = [cid, like, like, like, like, like, like, like, yo];
    let filtroExtra = '';

    if (!esStaff(req.user.tipo)) {
      const aulas = await aulasDeUsuario(req);
      const gids = aulas.map((g) => g.id);
      if (!gids.length) {
        filtroExtra = ` AND u.tipo NOT IN ('ALUMNO','APODERADO')`;
      } else {
        const ph = gids.map(() => '?').join(',');
        filtroExtra = `
          AND (
            u.tipo NOT IN ('ALUMNO','APODERADO')
            OR (u.tipo = 'ALUMNO' AND u.alumno_id IN (
              SELECT m.alumno_id FROM matriculas m
              WHERE m.colegio_id = ? AND m.estado = 0 AND m.grupo_id IN (${ph})
            ))
            OR (u.tipo = 'APODERADO' AND u.apoderado_id IN (
              SELECT f.apoderado_id FROM familias f
              INNER JOIN matriculas m ON m.alumno_id = f.alumno_id AND m.colegio_id = ? AND m.estado = 0
              WHERE m.grupo_id IN (${ph})
            ))
          )`;
        params.push(cid, ...gids, cid, ...gids);
      }
    }

    const rows = await query(
      `SELECT u.id, u.tipo, ${nombreSqlUsuario()} AS nombre
       FROM usuarios u
       ${joinPersonaUsuario()}
       WHERE u.colegio_id = ? AND u.estado = 'ACTIVO'
         AND u.tipo <> 'ASISTENCIA'
         AND (
           a.nombres LIKE ? OR a.apellido_paterno LIKE ? OR a.apellido_materno LIKE ?
           OR ap.nombres LIKE ? OR p.nombres LIKE ? OR p.apellidos LIKE ?
           OR u.usuario LIKE ?
         )
         AND u.id <> ?
         ${filtroExtra}
       ORDER BY nombre
       LIMIT 25`,
      params
    );

    res.json({
      contactos: rows.map((r) => ({
        id: r.id,
        nombre: r.nombre,
        tipo: r.tipo,
        etiqueta: etiquetaTipo(r.tipo),
      })),
    });
  } catch (e) {
    return errorChat(res, e, 'No se pudieron buscar contactos.');
  }
});

module.exports = router;
