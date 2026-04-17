/**
 * Eventos institucionales: admin CRUD + API pública por token (QR) para asistencia de apoderados.
 */
const express = require('express');
const crypto = require('crypto');
const { query, execute } = require('../utils/mysql');
const { authenticateToken, requireUserType } = require('../middleware/auth');
const { fechaHoraMySQLLima } = require('../utils/fechaHoraLima');
const { insertNotificacionUsuario } = require('../utils/notificacionInsert');

const router = express.Router();

function generarToken() {
  return crypto.randomBytes(32).toString('hex');
}

/** --- Rutas públicas (sin JWT): montadas en /api/public/eventos --- */

const publicRouter = express.Router();

publicRouter.get('/:token', async (req, res) => {
  try {
    const { token } = req.params;
    if (!token || token.length < 32) return res.status(400).json({ error: 'Token inválido' });

    const ev = await query(
      `SELECT e.id, e.colegio_id, e.titulo, e.descripcion, e.fecha_evento, e.hora_inicio, e.hora_fin,
              e.lugar, e.responsable, e.expositor, e.aviso_texto, e.programa_texto, e.materiales_texto, e.estado
       FROM eventos_institucionales e
       WHERE e.token_publico = ? LIMIT 1`,
      [token]
    );
    if (!ev.length) return res.status(404).json({ error: 'Evento no encontrado' });
    const row = ev[0];
    if (row.estado !== 'ACTIVO') {
      return res.status(403).json({ error: 'Este evento no está disponible para registro' });
    }

    const grupos = await query(
      `SELECT g.id, g.grado, g.seccion, g.anio, n.nombre AS nivel_nombre, NULL AS curso_nombre
       FROM eventos_institucionales_grupos eg
       INNER JOIN grupos g ON g.id = eg.grupo_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       WHERE eg.evento_id = ?
       ORDER BY n.nombre, g.grado, g.seccion`,
      [row.id]
    );

    res.json({
      evento: {
        titulo: row.titulo,
        descripcion: row.descripcion,
        fecha_evento: row.fecha_evento,
        hora_inicio: row.hora_inicio,
        hora_fin: row.hora_fin,
        lugar: row.lugar,
        responsable: row.responsable,
        expositor: row.expositor,
        aviso_texto: row.aviso_texto,
        programa_texto: row.programa_texto,
        materiales_texto: row.materiales_texto
      },
      grupos: grupos || []
    });
  } catch (e) {
    console.error('[eventos public GET]', e);
    res.status(500).json({ error: e.message || 'Error al cargar evento' });
  }
});

publicRouter.get('/:token/grupos/:grupoId/alumnos', async (req, res) => {
  try {
    const { token, grupoId } = req.params;
    const gid = parseInt(grupoId, 10);
    if (!token || Number.isNaN(gid)) return res.status(400).json({ error: 'Parámetros inválidos' });

    const ev = await query(
      `SELECT e.id, e.colegio_id, e.estado FROM eventos_institucionales e WHERE e.token_publico = ? LIMIT 1`,
      [token]
    );
    if (!ev.length) return res.status(404).json({ error: 'Evento no encontrado' });
    if (ev[0].estado !== 'ACTIVO') return res.status(403).json({ error: 'Evento no disponible' });

    const okGrupo = await query(
      `SELECT 1 FROM eventos_institucionales_grupos WHERE evento_id = ? AND grupo_id = ? LIMIT 1`,
      [ev[0].id, gid]
    );
    if (!okGrupo.length) return res.status(403).json({ error: 'Grupo no pertenece a este evento' });

    const alumnos = await query(
      `SELECT DISTINCT a.id, a.nombres, a.apellido_paterno, a.apellido_materno, a.foto, a.nro_documento
       FROM matriculas m
       INNER JOIN alumnos a ON a.id = m.alumno_id
       WHERE m.grupo_id = ? AND m.colegio_id = ? AND (m.estado = 0 OR m.estado = 4)
       ORDER BY a.apellido_paterno, a.apellido_materno, a.nombres`,
      [gid, ev[0].colegio_id]
    );

    res.json({ alumnos: alumnos || [] });
  } catch (e) {
    console.error('[eventos public alumnos]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

publicRouter.get('/:token/alumnos/:alumnoId/apoderados', async (req, res) => {
  try {
    const { token, alumnoId } = req.params;
    const aid = parseInt(alumnoId, 10);
    if (!token || Number.isNaN(aid)) return res.status(400).json({ error: 'Parámetros inválidos' });

    const ev = await query(
      `SELECT e.id, e.colegio_id, e.estado FROM eventos_institucionales e WHERE e.token_publico = ? LIMIT 1`,
      [token]
    );
    if (!ev.length) return res.status(404).json({ error: 'Evento no encontrado' });
    if (ev[0].estado !== 'ACTIVO') return res.status(403).json({ error: 'Evento no disponible' });

    const enGrupoEvento = await query(
      `SELECT m.grupo_id
       FROM matriculas m
       INNER JOIN eventos_institucionales_grupos eg ON eg.grupo_id = m.grupo_id AND eg.evento_id = ?
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND (m.estado = 0 OR m.estado = 4)
       LIMIT 1`,
      [ev[0].id, aid, ev[0].colegio_id]
    );
    if (!enGrupoEvento.length) return res.status(403).json({ error: 'El alumno no está en los grupos de este evento' });

    const apoderados = await query(
      `SELECT ap.id, ap.nombres, ap.apellido_paterno, ap.apellido_materno, ap.foto, ap.telefono_celular, ap.email
       FROM familias f
       INNER JOIN apoderados ap ON ap.id = f.apoderado_id AND ap.colegio_id = ?
       WHERE f.alumno_id = ?
       ORDER BY ap.apellido_paterno, ap.apellido_materno, ap.nombres`,
      [ev[0].colegio_id, aid]
    );

    const yaMarco = await query(
      `SELECT apoderado_id FROM eventos_institucionales_asistencias WHERE evento_id = ? AND alumno_id = ?`,
      [ev[0].id, aid]
    );
    const marcados = new Set((yaMarco || []).map((r) => r.apoderado_id));

    res.json({
      apoderados: (apoderados || []).map((a) => ({
        ...a,
        ya_asistio: marcados.has(a.id)
      }))
    });
  } catch (e) {
    console.error('[eventos public apoderados]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

publicRouter.post('/:token/asistencia', async (req, res) => {
  try {
    const { token } = req.params;
    const { alumno_id, apoderado_id } = req.body || {};
    const aid = parseInt(alumno_id, 10);
    const apid = parseInt(apoderado_id, 10);
    if (!token || !aid || !apid) return res.status(400).json({ error: 'Datos incompletos' });

    const ev = await query(
      `SELECT e.id, e.colegio_id, e.titulo, e.estado FROM eventos_institucionales e WHERE e.token_publico = ? LIMIT 1`,
      [token]
    );
    if (!ev.length) return res.status(404).json({ error: 'Evento no encontrado' });
    if (ev[0].estado !== 'ACTIVO') return res.status(403).json({ error: 'Evento no disponible' });

    const eventoId = ev[0].id;
    const colegio_id = ev[0].colegio_id;

    const vinculo = await query(
      `SELECT 1 FROM familias f
       INNER JOIN matriculas m ON m.alumno_id = f.alumno_id
       INNER JOIN eventos_institucionales_grupos eg ON eg.grupo_id = m.grupo_id AND eg.evento_id = ?
       WHERE f.alumno_id = ? AND f.apoderado_id = ? AND m.colegio_id = ? AND (m.estado = 0 OR m.estado = 4)
       LIMIT 1`,
      [eventoId, aid, apid, colegio_id]
    );
    if (!vinculo.length) return res.status(403).json({ error: 'No se puede registrar esta asistencia' });

    const apoderadoRow = await query(
      `SELECT nombres, apellido_paterno, apellido_materno, foto FROM apoderados WHERE id = ? AND colegio_id = ? LIMIT 1`,
      [apid, colegio_id]
    );
    if (!apoderadoRow.length) return res.status(404).json({ error: 'Apoderado no encontrado' });

    try {
      await execute(
        `INSERT INTO eventos_institucionales_asistencias (evento_id, alumno_id, apoderado_id, marcado_en)
         VALUES (?, ?, ?, ?)`,
        [eventoId, aid, apid, fechaHoraMySQLLima()]
      );
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Ya registraste tu asistencia para este hijo en este evento' });
      }
      throw err;
    }

    const usuariosAp = await query(
      `SELECT id FROM usuarios WHERE apoderado_id = ? AND colegio_id = ? AND estado = 'ACTIVO' LIMIT 1`,
      [apid, colegio_id]
    );
    if (usuariosAp.length) {
      const uid = usuariosAp[0].id;
      const nombre = [apoderadoRow[0].nombres, apoderadoRow[0].apellido_paterno, apoderadoRow[0].apellido_materno]
        .filter(Boolean)
        .join(' ')
        .trim();
      try {
        await insertNotificacionUsuario(execute, {
          usuario_id: uid,
          destinatario_id: uid,
          asunto: `Asistencia registrada: ${ev[0].titulo}`,
          contenido: `Tu asistencia al evento "${ev[0].titulo}" ha sido registrada correctamente.`,
          estado: 'ENVIADO',
          accion_tipo: 'evento_institucional_asistencia',
          accion_payload: { evento_id: eventoId, alumno_id: aid, apoderado_id: apid },
          url_destino: '/apoderado/dashboard'
        });
      } catch (ne) {
        console.warn('[eventos] notificación asistencia:', ne.message);
      }
    }

    res.json({
      success: true,
      apoderado: {
        nombres: apoderadoRow[0].nombres,
        apellido_paterno: apoderadoRow[0].apellido_paterno,
        apellido_materno: apoderadoRow[0].apellido_materno,
        foto: apoderadoRow[0].foto
      }
    });
  } catch (e) {
    console.error('[eventos public asistencia]', e);
    res.status(500).json({ error: e.message || 'Error al registrar' });
  }
});

publicRouter.post('/:token/visitante', async (req, res) => {
  try {
    const { token } = req.params;
    const { alumno_id, nombre_completo, telefono, correo, parentesco } = req.body || {};
    const nombre = String(nombre_completo || '').trim();
    if (!token || !nombre) return res.status(400).json({ error: 'Nombre completo es obligatorio' });

    const ev = await query(
      `SELECT e.id, e.estado FROM eventos_institucionales e WHERE e.token_publico = ? LIMIT 1`,
      [token]
    );
    if (!ev.length) return res.status(404).json({ error: 'Evento no encontrado' });
    if (ev[0].estado !== 'ACTIVO') return res.status(403).json({ error: 'Evento no disponible' });

    let alumnoIdNull = null;
    if (alumno_id != null && alumno_id !== '') {
      const a = parseInt(alumno_id, 10);
      if (!Number.isNaN(a)) {
        const check = await query(
          `SELECT 1 FROM matriculas m
           INNER JOIN eventos_institucionales_grupos eg ON eg.grupo_id = m.grupo_id AND eg.evento_id = ?
           WHERE m.alumno_id = ? LIMIT 1`,
          [ev[0].id, a]
        );
        if (check.length) alumnoIdNull = a;
      }
    }

    await execute(
      `INSERT INTO eventos_institucionales_visitantes
       (evento_id, alumno_id, nombre_completo, telefono, correo, parentesco, marcado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        ev[0].id,
        alumnoIdNull,
        nombre,
        telefono ? String(telefono).trim() : null,
        correo ? String(correo).trim() : null,
        parentesco ? String(parentesco).trim() : null,
        fechaHoraMySQLLima()
      ]
    );

    res.json({ success: true });
  } catch (e) {
    console.error('[eventos public visitante]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

/** --- Admin: mismo router con prefijo /api/admin/eventos --- */

router.use(authenticateToken);
router.use(requireUserType('ADMINISTRADOR', 'PROMOTORIA'));

/** Listar grupos del año (antes de /:id) */
router.get('/grupos-disponibles', async (req, res) => {
  try {
    const { colegio_id, anio_activo } = req.user;
    const anio = anio_activo || new Date().getFullYear();
    const grupos = await query(
      `SELECT g.id, g.grado, g.seccion, g.anio, n.nombre AS nivel_nombre, NULL AS curso_nombre
       FROM grupos g
       INNER JOIN niveles n ON n.id = g.nivel_id
       WHERE g.colegio_id = ? AND g.anio = ?
       ORDER BY n.nombre, g.grado, g.seccion`,
      [colegio_id, anio]
    );
    res.json({ grupos: grupos || [] });
  } catch (e) {
    console.error('[eventos admin grupos]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const rows = await query(
      `SELECT id, titulo, fecha_evento, lugar, estado, token_publico, created_at
       FROM eventos_institucionales
       WHERE colegio_id = ?
       ORDER BY created_at DESC`,
      [colegio_id]
    );
    res.json({ eventos: rows || [] });
  } catch (e) {
    console.error('[eventos admin list]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

/** Express 5 / path-to-regexp v8: no usar /:id(\\d+); validar en handler */
function parseEventoIdParam(req) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) return null;
  return id;
}

router.get('/:id', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseEventoIdParam(req);
    if (id == null) return res.status(400).json({ error: 'ID inválido' });
    const rows = await query(
      `SELECT * FROM eventos_institucionales WHERE id = ? AND colegio_id = ? LIMIT 1`,
      [id, colegio_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    const grupos = await query(
      `SELECT grupo_id FROM eventos_institucionales_grupos WHERE evento_id = ?`,
      [id]
    );
    res.json({
      evento: rows[0],
      grupo_ids: (grupos || []).map((g) => g.grupo_id)
    });
  } catch (e) {
    console.error('[eventos admin get]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const b = req.body || {};
    const titulo = String(b.titulo || '').trim();
    if (!titulo) return res.status(400).json({ error: 'Título es obligatorio' });

    const grupoIds = Array.isArray(b.grupo_ids) ? b.grupo_ids.map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n)) : [];
    const token = generarToken();

    const result = await execute(
      `INSERT INTO eventos_institucionales
       (colegio_id, titulo, descripcion, fecha_evento, hora_inicio, hora_fin, lugar, responsable, expositor,
        aviso_texto, programa_texto, materiales_texto, estado, token_publico)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        colegio_id,
        titulo,
        b.descripcion || null,
        b.fecha_evento || null,
        b.hora_inicio || null,
        b.hora_fin || null,
        b.lugar || null,
        b.responsable || null,
        b.expositor || null,
        b.aviso_texto || null,
        b.programa_texto || null,
        b.materiales_texto || null,
        b.estado === 'ACTIVO' || b.estado === 'CERRADO' ? b.estado : 'BORRADOR',
        token
      ]
    );
    const eventoId = result.insertId;

    for (const gid of grupoIds) {
      await execute(`INSERT INTO eventos_institucionales_grupos (evento_id, grupo_id) VALUES (?, ?)`, [eventoId, gid]);
    }

    res.status(201).json({ id: eventoId, token_publico: token });
  } catch (e) {
    console.error('[eventos admin create]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseEventoIdParam(req);
    if (id == null) return res.status(400).json({ error: 'ID inválido' });
    const b = req.body || {};

    const cur = await query(`SELECT id FROM eventos_institucionales WHERE id = ? AND colegio_id = ?`, [id, colegio_id]);
    if (!cur.length) return res.status(404).json({ error: 'No encontrado' });

    await execute(
      `UPDATE eventos_institucionales SET
        titulo = ?,
        descripcion = ?,
        fecha_evento = ?,
        hora_inicio = ?,
        hora_fin = ?,
        lugar = ?,
        responsable = ?,
        expositor = ?,
        aviso_texto = ?,
        programa_texto = ?,
        materiales_texto = ?,
        estado = ?
       WHERE id = ? AND colegio_id = ?`,
      [
        String(b.titulo || '').trim() || 'Evento',
        b.descripcion !== undefined ? b.descripcion : null,
        b.fecha_evento !== undefined ? b.fecha_evento : null,
        b.hora_inicio !== undefined ? b.hora_inicio : null,
        b.hora_fin !== undefined ? b.hora_fin : null,
        b.lugar !== undefined ? b.lugar : null,
        b.responsable !== undefined ? b.responsable : null,
        b.expositor !== undefined ? b.expositor : null,
        b.aviso_texto !== undefined ? b.aviso_texto : null,
        b.programa_texto !== undefined ? b.programa_texto : null,
        b.materiales_texto !== undefined ? b.materiales_texto : null,
        ['BORRADOR', 'ACTIVO', 'CERRADO'].includes(b.estado) ? b.estado : 'BORRADOR',
        id,
        colegio_id
      ]
    );

    if (Array.isArray(b.grupo_ids)) {
      await execute(`DELETE FROM eventos_institucionales_grupos WHERE evento_id = ?`, [id]);
      for (const gid of b.grupo_ids.map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n))) {
        await execute(`INSERT INTO eventos_institucionales_grupos (evento_id, grupo_id) VALUES (?, ?)`, [id, gid]);
      }
    }

    res.json({ success: true });
  } catch (e) {
    console.error('[eventos admin put]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseEventoIdParam(req);
    if (id == null) return res.status(400).json({ error: 'ID inválido' });
    const r = await execute(`DELETE FROM eventos_institucionales WHERE id = ? AND colegio_id = ?`, [id, colegio_id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'No encontrado' });
    res.json({ success: true });
  } catch (e) {
    console.error('[eventos admin delete]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

module.exports = router;
module.exports.publicEventosRouter = publicRouter;
