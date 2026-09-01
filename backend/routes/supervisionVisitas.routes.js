const { query, execute } = require('../utils/mysql');
const { fechaHoraMySQLLima } = require('../utils/fechaHoraLima');
const { listarPersonalColegio, nombreSqlUsuario } = require('../utils/reunionesHelper');
const {
  checklistParaTipo,
  tablaVisitasExiste,
  notificarPersonasVisita,
} = require('../utils/supervisionVisitasHelper');

function uidDe(req) {
  return Number(req.user.usuario_id || req.user.id);
}

function parseChecklist(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const j = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

function personaEnVisita(personas, uid) {
  return (personas || []).find((p) => Number(p.usuario_id) === uid) || null;
}

/** El supervisado de ESTA visita no dirige el registro, aunque sea supervisor del módulo. */
function puedeDirigirVisita(visita, req, yo) {
  if (yo && yo.rol === 'SUPERVISADO') return false;
  const uid = uidDe(req);
  return !!(
    req.supervision?.isAdmin ||
    req.supervision?.isSupervisor ||
    Number(visita.creador_usuario_id) === uid ||
    (yo && yo.rol === 'SUPERVISOR')
  );
}

function normalizarChecklistItems(raw) {
  return parseChecklist(raw)
    .map((i, idx) => {
      const label = String(i.label || '').trim().slice(0, 240);
      if (!label) return null;
      const keyRaw = String(i.key || '').trim().slice(0, 80);
      return {
        key: keyRaw || `item-${idx + 1}`,
        label,
        marcado: !!i.marcado,
        nota: String(i.nota || '').slice(0, 4000),
      };
    })
    .filter(Boolean);
}

async function obtenerVisita(id, colegio_id) {
  const rows = await query(
    `SELECT v.*,
            DATE_FORMAT(v.fecha, '%Y-%m-%d') AS fecha,
            TIME_FORMAT(v.hora_inicio, '%H:%i') AS hora_inicio,
            TIME_FORMAT(v.hora_fin, '%H:%i') AS hora_fin,
            DATE_FORMAT(v.cerrada_en, '%Y-%m-%d %H:%i:%s') AS cerrada_en
     FROM supervision_visitas v
     WHERE v.id = ? AND v.colegio_id = ?
     LIMIT 1`,
    [id, colegio_id]
  );
  return rows && rows[0] ? rows[0] : null;
}

async function personasDe(visitaId) {
  const nom = nombreSqlUsuario();
  return query(
    `SELECT vp.id, vp.usuario_id, vp.rol, vp.comentario, vp.firma_data,
            vp.firma_data IS NOT NULL AND vp.firma_data <> '' AS tiene_firma,
            DATE_FORMAT(vp.firmado_en, '%Y-%m-%d %H:%i:%s') AS firmado_en,
            ${nom} AS nombre, u.tipo
     FROM supervision_visita_personas vp
     INNER JOIN usuarios u ON u.id = vp.usuario_id
     LEFT JOIN alumnos a ON a.id = u.alumno_id
     LEFT JOIN personal p ON p.id = u.personal_id
     LEFT JOIN apoderados ap ON ap.id = u.apoderado_id
     WHERE vp.visita_id = ?
     ORDER BY vp.rol ASC, vp.id ASC`,
    [visitaId]
  );
}

async function payloadVisita(visita, req) {
  const personas = await personasDe(visita.id);
  const uid = uidDe(req);
  const yo = personaEnVisita(personas, uid);
  const puedeDirigir = puedeDirigirVisita(visita, req, yo);
  const cerrada = visita.estado === 'CERRADA' || visita.estado === 'CANCELADA';
  return {
    visita: {
      ...visita,
      checklist: parseChecklist(visita.checklist_json),
    },
    personas: (personas || []).map((p) => ({
      ...p,
      firma_data: puedeDirigir || Number(p.usuario_id) === uid ? p.firma_data : undefined,
      tiene_firma: !!p.tiene_firma,
    })),
    mi_participacion: yo
      ? {
          ...yo,
          firma_data: undefined,
          tiene_firma: !!yo.tiene_firma,
        }
      : null,
    permisos: {
      puede_editar: puedeDirigir && !cerrada,
      puede_cerrar: puedeDirigir && visita.estado !== 'CERRADA' && visita.estado !== 'CANCELADA',
      puede_comentar: !!(yo && yo.rol === 'SUPERVISADO') && !cerrada,
      puede_firmar: !!(yo && yo.rol === 'SUPERVISADO') && !cerrada && !yo.firmado_en && !yo.tiene_firma,
      ya_firmo: !!(yo && (yo.firmado_en || yo.tiene_firma)),
      es_supervisado: !!(yo && yo.rol === 'SUPERVISADO'),
      es_supervisor: puedeDirigir,
    },
  };
}

function puedeVer(visita, req, personas) {
  const uid = uidDe(req);
  if (req.supervision?.isAdmin || req.supervision?.isSupervisor) return true;
  if (Number(visita.creador_usuario_id) === uid) return true;
  return (personas || []).some((p) => Number(p.usuario_id) === uid);
}

module.exports = function mountVisitas(router, { requireAdmin, requireAdminOrSupervisor }) {
  router.get('/personal', requireAdminOrSupervisor, async (req, res) => {
    try {
      const personal = await listarPersonalColegio(query, req.user.colegio_id);
      res.json({ personal });
    } catch (e) {
      console.error('[supervision] personal', e);
      res.status(500).json({ error: 'Error al listar el personal' });
    }
  });

  router.get('/visitas', async (req, res) => {
    try {
      if (!(await tablaVisitasExiste(query))) {
        return res.json({ visitas: [] });
      }
      const { colegio_id } = req.user;
      const uid = uidDe(req);
      const puedeVerTodas = req.supervision?.isAdmin || req.supervision?.isSupervisor;
      let sql = `
        SELECT v.id, v.titulo, v.tipo, v.lugar, v.estado, v.creador_usuario_id,
               DATE_FORMAT(v.fecha, '%Y-%m-%d') AS fecha,
               TIME_FORMAT(v.hora_inicio, '%H:%i') AS hora_inicio,
               TIME_FORMAT(v.hora_fin, '%H:%i') AS hora_fin,
               (SELECT COUNT(*) FROM supervision_visita_personas p WHERE p.visita_id = v.id AND p.rol = 'SUPERVISADO') AS total_supervisados,
               (SELECT GROUP_CONCAT(TRIM(CONCAT(COALESCE(pe.nombres,''), ' ', COALESCE(pe.apellidos,''))) ORDER BY pe.apellidos SEPARATOR ', ')
                  FROM supervision_visita_personas sp
                  INNER JOIN usuarios u ON u.id = sp.usuario_id
                  LEFT JOIN personal pe ON pe.id = u.personal_id
                 WHERE sp.visita_id = v.id AND sp.rol = 'SUPERVISADO') AS nombres_supervisados
        FROM supervision_visitas v
        WHERE v.colegio_id = ?
      `;
      const params = [colegio_id];
      if (!puedeVerTodas) {
        sql += ` AND (v.creador_usuario_id = ? OR EXISTS (
          SELECT 1 FROM supervision_visita_personas p WHERE p.visita_id = v.id AND p.usuario_id = ?
        ))`;
        params.push(uid, uid);
      }
      sql += ` ORDER BY v.fecha DESC, v.hora_inicio DESC LIMIT 250`;
      const visitas = await query(sql, params);
      res.json({ visitas: visitas || [] });
    } catch (e) {
      if (e && (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146)) {
        return res.json({ visitas: [] });
      }
      console.error('[supervision] listar visitas', e);
      res.status(500).json({ error: 'Error al listar supervisiones' });
    }
  });

  router.get('/visitas/:id', async (req, res) => {
    try {
      const visita = await obtenerVisita(req.params.id, req.user.colegio_id);
      if (!visita) return res.status(404).json({ error: 'Supervisión no encontrada' });
      const personas = await personasDe(visita.id);
      if (!puedeVer(visita, req, personas)) {
        return res.status(403).json({ error: 'No autorizado' });
      }
      res.json(await payloadVisita(visita, req));
    } catch (e) {
      console.error('[supervision] detalle visita', e);
      res.status(500).json({ error: 'Error al abrir la supervisión' });
    }
  });

  router.post('/visitas', requireAdminOrSupervisor, async (req, res) => {
    try {
      const { colegio_id, anio_activo } = req.user;
      const uid = uidDe(req);
      const titulo = String(req.body.titulo || '').trim();
      const fecha = String(req.body.fecha || '').slice(0, 10);
      const tipo = String(req.body.tipo || 'DOCENTE').toUpperCase();
      if (!titulo || !fecha) {
        return res.status(400).json({ error: 'Completa el título y la fecha.' });
      }
      if (!['DOCENTE', 'TUTOR', 'MANTENIMIENTO', 'OTRO'].includes(tipo)) {
        return res.status(400).json({ error: 'Tipo de supervisión no válido.' });
      }
      const ids = Array.isArray(req.body.supervisados)
        ? [...new Set(req.body.supervisados.map((x) => Number(x.usuario_id || x)).filter((n) => n > 0))]
        : [];
      if (!ids.length) {
        return res.status(400).json({ error: 'Elige al menos una persona a supervisar.' });
      }
      const ahora = fechaHoraMySQLLima();
      const anio = parseInt(anio_activo || fecha.slice(0, 4), 10);
      const checklist = JSON.stringify(checklistParaTipo(tipo));
      const result = await execute(
        `INSERT INTO supervision_visitas
          (colegio_id, anio, creador_usuario_id, titulo, tipo, fecha, hora_inicio, hora_fin, lugar, estado, checklist_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PROGRAMADA', ?, ?, ?)`,
        [
          colegio_id,
          anio,
          uid,
          titulo.slice(0, 255),
          tipo,
          fecha,
          req.body.hora_inicio || null,
          req.body.hora_fin || null,
          String(req.body.lugar || '').slice(0, 255) || null,
          checklist,
          ahora,
          ahora,
        ]
      );
      const id = result.insertId;
      await execute(
        `INSERT INTO supervision_visita_personas (visita_id, usuario_id, rol) VALUES (?, ?, 'SUPERVISOR')`,
        [id, uid]
      );
      for (const sid of ids) {
        if (sid === uid) continue;
        try {
          await execute(
            `INSERT INTO supervision_visita_personas (visita_id, usuario_id, rol) VALUES (?, ?, 'SUPERVISADO')`,
            [id, sid]
          );
        } catch (e) {
          if (!(e && e.code === 'ER_DUP_ENTRY')) throw e;
        }
      }
      const visita = await obtenerVisita(id, colegio_id);
      await notificarPersonasVisita({
        queryFn: query,
        executeFn: execute,
        colegio_id,
        visita,
        emisor_usuario_id: uid,
        asunto: 'Supervisión programada',
        contenido: `«${visita.titulo}» el ${visita.fecha}${visita.hora_inicio ? ` a las ${visita.hora_inicio}` : ''}. Entra para ver el aviso.`,
        tagSuffix: 'programada',
      });
      res.json(await payloadVisita(visita, req));
    } catch (e) {
      if (e && (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146)) {
        return res.status(503).json({ error: 'Falta ejecutar la migración 075 de supervisión (visitas).' });
      }
      console.error('[supervision] crear visita', e);
      res.status(500).json({ error: 'Error al programar la supervisión' });
    }
  });

  router.patch('/visitas/:id', requireAdminOrSupervisor, async (req, res) => {
    try {
      const visita = await obtenerVisita(req.params.id, req.user.colegio_id);
      if (!visita) return res.status(404).json({ error: 'Supervisión no encontrada' });
      if (visita.estado === 'CERRADA' || visita.estado === 'CANCELADA') {
        return res.status(400).json({ error: 'La supervisión ya está cerrada.' });
      }
      const uid = uidDe(req);
      const personas = await personasDe(visita.id);
      const yo = personaEnVisita(personas, uid);
      if (!puedeDirigirVisita(visita, req, yo)) {
        return res.status(403).json({ error: 'Solo el supervisor puede editar el registro de observación.' });
      }
      const campos = [];
      const vals = [];
      if (req.body.titulo != null) {
        campos.push('titulo = ?');
        vals.push(String(req.body.titulo).trim().slice(0, 255));
      }
      if (req.body.lugar != null) {
        campos.push('lugar = ?');
        vals.push(String(req.body.lugar).slice(0, 255) || null);
      }
      if (req.body.observaciones != null) {
        campos.push('observaciones = ?');
        vals.push(String(req.body.observaciones).slice(0, 8000));
      }
      if (req.body.acuerdos != null) {
        campos.push('acuerdos = ?');
        vals.push(String(req.body.acuerdos).slice(0, 8000));
      }
      if (req.body.checklist != null) {
        const items = normalizarChecklistItems(req.body.checklist);
        campos.push('checklist_json = ?');
        vals.push(JSON.stringify(items));
        if (visita.estado === 'PROGRAMADA') {
          campos.push("estado = 'EN_CURSO'");
        }
      }
      if (!campos.length) {
        return res.json(await payloadVisita(visita, req));
      }
      campos.push('updated_at = ?');
      vals.push(fechaHoraMySQLLima(), visita.id, req.user.colegio_id);
      await execute(
        `UPDATE supervision_visitas SET ${campos.join(', ')} WHERE id = ? AND colegio_id = ?`,
        vals
      );
      const actual = await obtenerVisita(visita.id, req.user.colegio_id);
      if (req.body.acuerdos != null && String(req.body.acuerdos).trim()) {
        await notificarPersonasVisita({
          queryFn: query,
          executeFn: execute,
          colegio_id: req.user.colegio_id,
          visita: actual,
          emisor_usuario_id: uid,
          asunto: 'Acuerdos de la supervisión',
          contenido: `Hay acuerdos en «${actual.titulo}». Entra para leerlos, escribir tu alcance y firmar.`,
          tagSuffix: 'acuerdos',
        });
      }
      res.json(await payloadVisita(actual, req));
    } catch (e) {
      console.error('[supervision] patch visita', e);
      res.status(500).json({ error: 'Error al guardar la supervisión' });
    }
  });

  router.post('/visitas/:id/comentario', async (req, res) => {
    try {
      const visita = await obtenerVisita(req.params.id, req.user.colegio_id);
      if (!visita) return res.status(404).json({ error: 'Supervisión no encontrada' });
      if (visita.estado === 'CERRADA' || visita.estado === 'CANCELADA') {
        return res.status(400).json({ error: 'La supervisión ya está cerrada.' });
      }
      const uid = uidDe(req);
      const rows = await query(
        `SELECT id FROM supervision_visita_personas WHERE visita_id = ? AND usuario_id = ? AND rol = 'SUPERVISADO' LIMIT 1`,
        [visita.id, uid]
      );
      if (!rows || !rows[0]) return res.status(403).json({ error: 'Solo la persona supervisada puede escribir su alcance.' });
      await execute(
        `UPDATE supervision_visita_personas SET comentario = ? WHERE id = ?`,
        [String(req.body.comentario || '').slice(0, 4000), rows[0].id]
      );
      const actual = await obtenerVisita(visita.id, req.user.colegio_id);
      res.json(await payloadVisita(actual, req));
    } catch (e) {
      console.error('[supervision] comentario', e);
      res.status(500).json({ error: 'Error al guardar el comentario' });
    }
  });

  router.post('/visitas/:id/firmar', async (req, res) => {
    try {
      const visita = await obtenerVisita(req.params.id, req.user.colegio_id);
      if (!visita) return res.status(404).json({ error: 'Supervisión no encontrada' });
      if (visita.estado === 'CERRADA' || visita.estado === 'CANCELADA') {
        return res.status(400).json({ error: 'La supervisión ya está cerrada.' });
      }
      const uid = uidDe(req);
      const rows = await query(
        `SELECT id, firmado_en FROM supervision_visita_personas WHERE visita_id = ? AND usuario_id = ? AND rol = 'SUPERVISADO' LIMIT 1`,
        [visita.id, uid]
      );
      if (!rows || !rows[0]) return res.status(403).json({ error: 'Solo la persona supervisada puede firmar.' });
      if (rows[0].firmado_en) {
        return res.status(400).json({ error: 'Ya firmaste esta supervisión.' });
      }
      const firma = String(req.body.firma_data || '');
      if (!/^data:image\/(png|jpeg);base64,/.test(firma) || firma.length < 80 || firma.length > 400000) {
        return res.status(400).json({ error: 'Dibuja tu firma en el recuadro.' });
      }
      await execute(
        `UPDATE supervision_visita_personas SET firma_data = ?, firmado_en = ? WHERE id = ?`,
        [firma, fechaHoraMySQLLima(), rows[0].id]
      );
      const actual = await obtenerVisita(visita.id, req.user.colegio_id);
      res.json(await payloadVisita(actual, req));
    } catch (e) {
      console.error('[supervision] firmar', e);
      res.status(500).json({ error: 'Error al guardar la firma' });
    }
  });

  router.post('/visitas/:id/cerrar', requireAdminOrSupervisor, async (req, res) => {
    try {
      const visita = await obtenerVisita(req.params.id, req.user.colegio_id);
      if (!visita) return res.status(404).json({ error: 'Supervisión no encontrada' });
      if (visita.estado === 'CERRADA') {
        return res.json(await payloadVisita(visita, req));
      }
      const uid = uidDe(req);
      const personas = await personasDe(visita.id);
      const yo = personaEnVisita(personas, uid);
      if (!puedeDirigirVisita(visita, req, yo)) {
        return res.status(403).json({ error: 'Solo el supervisor puede cerrar la supervisión.' });
      }
      const ahora = fechaHoraMySQLLima();
      await execute(
        `UPDATE supervision_visitas SET estado = 'CERRADA', cerrada_en = ?, cerrada_por = ?, updated_at = ? WHERE id = ?`,
        [ahora, uid, ahora, visita.id]
      );
      const actual = await obtenerVisita(visita.id, req.user.colegio_id);
      await notificarPersonasVisita({
        queryFn: query,
        executeFn: execute,
        colegio_id: req.user.colegio_id,
        visita: actual,
        emisor_usuario_id: uid,
        asunto: 'Supervisión cerrada',
        contenido: `«${actual.titulo}» fue cerrada. Ya no se puede firmar ni agregar comentarios.`,
        tagSuffix: 'cerrada',
      });
      res.json(await payloadVisita(actual, req));
    } catch (e) {
      console.error('[supervision] cerrar visita', e);
      res.status(500).json({ error: 'Error al cerrar la supervisión' });
    }
  });

  router.delete('/visitas/:id', requireAdmin, async (req, res) => {
    try {
      const r = await execute(`DELETE FROM supervision_visitas WHERE id = ? AND colegio_id = ?`, [
        req.params.id,
        req.user.colegio_id,
      ]);
      if (!r.affectedRows) return res.status(404).json({ error: 'No encontrada' });
      res.json({ ok: true });
    } catch (e) {
      console.error('[supervision] borrar visita', e);
      res.status(500).json({ error: 'Error al eliminar' });
    }
  });
};
