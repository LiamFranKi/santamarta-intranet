/**
 * Encuestas intranet: audiencias múltiples, tipos vanguard-like, respuestas por usuario.
 * Identidad y grado se toman del JWT / matrícula; no se pide nombre ni grado en el formulario.
 */
const express = require('express');
const router = express.Router();
const { query, execute, getAnioActivo } = require('../utils/mysql');
const { authenticateToken } = require('../middleware/auth');
const { notificarEncuestaActivada } = require('../services/encuestasNotificacionService');

const ADMIN_TYPES = new Set(['ADMINISTRADOR', 'PROMOTORIA']);

function requireAdminOrPromotoria(req, res, next) {
  if (!req.user || !ADMIN_TYPES.has(req.user.tipo)) {
    return res.status(403).json({ error: 'No autorizado' });
  }
  next();
}

/** Audiencia: filas encuestas_audiencias */
function usuarioCoincideAudiencia(user, audiencias) {
  if (!audiencias || audiencias.length === 0) return false;
  if (audiencias.some((a) => a.tipo === 'TODOS')) return true;
  if (audiencias.some((a) => a.tipo === user.tipo)) return true;
  if (audiencias.some((a) => a.tipo === 'PERSONAL') && user.personal_id) return true;
  return false;
}

function encuestaVigente(enc) {
  if (!enc || String(enc.estado).toUpperCase() !== 'ACTIVO') return false;
  const today = new Date();
  const d0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (enc.fecha_inicio) {
    const fi = new Date(enc.fecha_inicio);
    const a = new Date(fi.getFullYear(), fi.getMonth(), fi.getDate());
    if (d0 < a) return false;
  }
  if (enc.fecha_fin) {
    const ff = new Date(enc.fecha_fin);
    const b = new Date(ff.getFullYear(), ff.getMonth(), ff.getDate());
    if (d0 > b) return false;
  }
  return true;
}

async function cargarAudiencias(encuestaId) {
  return query(
    `SELECT id, encuesta_id, tipo FROM encuestas_audiencias WHERE encuesta_id = ? ORDER BY tipo`,
    [encuestaId]
  );
}

async function getGradoSnapshot(alumnoId, colegioId, anio) {
  if (!alumnoId || !anio) return { grado_snapshot: null, nivel_snapshot: null };
  const rows = await query(
    `SELECT n.nombre AS nivel_nombre, g.grado, g.seccion
     FROM matriculas m
     INNER JOIN grupos g ON g.id = m.grupo_id
     INNER JOIN niveles n ON n.id = g.nivel_id
     WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ?
       AND (m.estado = 0 OR m.estado = 4)
     LIMIT 1`,
    [alumnoId, colegioId, anio]
  );
  if (!rows || !rows.length) return { grado_snapshot: null, nivel_snapshot: null };
  const r = rows[0];
  const grado = [r.grado, r.seccion].filter(Boolean).join(' ').trim();
  return {
    grado_snapshot: grado || null,
    nivel_snapshot: r.nivel_nombre || null
  };
}

function parseOpciones(row) {
  let o = row.opciones_json;
  if (o == null) return null;
  if (typeof o === 'string') {
    try {
      o = JSON.parse(o);
    } catch {
      return null;
    }
  }
  return o;
}

function normalizarPreguntaPublica(row) {
  let opciones = parseOpciones(row);
  const tipo = row.tipo_interfaz || mapLegacyTipo(row.tipo_respuesta);
  if ((tipo === 'marcar' || tipo === 'lista') && (!opciones || !opciones.opciones)) {
    opciones = { opciones: [], multiple: false };
  }
  return {
    id: row.id,
    encuesta_id: row.encuesta_id,
    orden: row.orden,
    texto_pregunta: row.descripcion,
    descripcion: row.descripcion,
    subtitulo: row.subtitulo || '',
    tipo_respuesta: tipo,
    tipo_interfaz: tipo,
    obligatoria: row.obligatoria !== 0 && row.obligatoria !== false,
    opciones: opciones || {}
  };
}

function mapLegacyTipo(tr) {
  const t = String(tr || '').toUpperCase();
  if (t === 'ALTERNATIVAS') return 'marcar';
  if (t === 'TEXTO') return 'texto_largo';
  if (t === 'TITULO') return 'titulo';
  return 'texto_corto';
}

/** Primera encuesta activa pendiente para mostrar modal (una por encuesta vía encuestas_modal_visto). */
async function buscarEncuestaModalPendiente(user, colegio_id) {
  const uid = user.usuario_id;
  const rows = await query(
    `SELECT e.* FROM encuestas e
     WHERE e.colegio_id = ? AND e.estado = 'ACTIVO'
       AND (e.fecha_inicio IS NULL OR DATE(e.fecha_inicio) <= CURDATE())
       AND (e.fecha_fin IS NULL OR DATE(e.fecha_fin) >= CURDATE())
       AND NOT EXISTS (
         SELECT 1 FROM encuestas_respuestas r WHERE r.encuesta_id = e.id AND r.usuario_id = ?
       )
       AND NOT EXISTS (
         SELECT 1 FROM encuestas_modal_visto m WHERE m.encuesta_id = e.id AND m.usuario_id = ?
       )
     ORDER BY e.id DESC`,
    [colegio_id, uid, uid]
  );
  for (const e of rows || []) {
    if (!encuestaVigente(e)) continue;
    const aud = await cargarAudiencias(e.id);
    if (usuarioCoincideAudiencia(user, aud)) {
      return {
        id: e.id,
        titulo: e.titulo,
        descripcion: e.descripcion || null
      };
    }
  }
  return null;
}

// ---------- Admin ----------

router.get('/admin/lista', authenticateToken, requireAdminOrPromotoria, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const rows = await query(
      `SELECT e.*,
              (SELECT COUNT(*) FROM encuestas_respuestas r WHERE r.encuesta_id = e.id) AS total_respuestas
       FROM encuestas e
       WHERE e.colegio_id = ?
       ORDER BY e.id DESC`,
      [colegio_id]
    );
    const out = [];
    for (const e of rows || []) {
      const aud = await cargarAudiencias(e.id);
      out.push({ ...e, audiencias: aud.map((a) => a.tipo) });
    }
    res.json({ success: true, encuestas: out });
  } catch (err) {
    console.error('[encuestas] admin lista', err);
    res.status(500).json({ error: 'Error al listar encuestas' });
  }
});

router.get('/admin/:id/estadisticas', authenticateToken, requireAdminOrPromotoria, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const enc = await query(`SELECT * FROM encuestas WHERE id = ? AND colegio_id = ? LIMIT 1`, [id, colegio_id]);
    if (!enc || !enc.length) return res.status(404).json({ error: 'No encontrada' });

    const totalR = await query(`SELECT COUNT(*) AS c FROM encuestas_respuestas WHERE encuesta_id = ?`, [id]);
    const totalRespuestas = totalR && totalR[0] ? Number(totalR[0].c) : 0;

    const porRol = await query(
      `SELECT rol_respondiente, COUNT(*) AS c FROM encuestas_respuestas WHERE encuesta_id = ? GROUP BY rol_respondiente`,
      [id]
    );

    const preguntas = await query(
      `SELECT * FROM encuestas_preguntas WHERE encuesta_id = ? ORDER BY orden ASC, id ASC`,
      [id]
    );

    const resultadosPreguntas = [];
    for (const p of preguntas || []) {
      const tipo = p.tipo_interfaz || mapLegacyTipo(p.tipo_respuesta);
      const item = {
        pregunta_id: p.id,
        orden: p.orden,
        texto_pregunta: p.descripcion,
        tipo_respuesta: tipo,
        datos: {}
      };

      if (tipo === 'marcar' || tipo === 'lista') {
        const det = await query(
          `SELECT d.opciones_json FROM encuestas_respuestas_detalle d
           INNER JOIN encuestas_respuestas r ON r.id = d.respuesta_id
           WHERE d.pregunta_id = ? AND r.encuesta_id = ? AND d.opciones_json IS NOT NULL`,
          [p.id, id]
        );
        const conteo = {};
        for (const row of det || []) {
          let arr = row.opciones_json;
          if (typeof arr === 'string') {
            try {
              arr = JSON.parse(arr);
            } catch {
              arr = [];
            }
          }
          if (!Array.isArray(arr)) arr = arr ? [arr] : [];
          arr.forEach((op) => {
            const k = String(op);
            conteo[k] = (conteo[k] || 0) + 1;
          });
        }
        item.datos = conteo;
      } else if (tipo === 'escala') {
        const det = await query(
          `SELECT d.valor_numerico, COUNT(*) AS c
           FROM encuestas_respuestas_detalle d
           INNER JOIN encuestas_respuestas r ON r.id = d.respuesta_id
           WHERE d.pregunta_id = ? AND r.encuesta_id = ? AND d.valor_numerico IS NOT NULL
           GROUP BY d.valor_numerico ORDER BY d.valor_numerico`,
          [p.id, id]
        );
        const dist = {};
        let suma = 0;
        let n = 0;
        for (const row of det || []) {
          const v = Number(row.valor_numerico);
          dist[v] = Number(row.c);
          suma += v * Number(row.c);
          n += Number(row.c);
        }
        item.datos = { distribucion: dist, promedio: n > 0 ? Math.round((suma / n) * 100) / 100 : null, total: n };
      } else if (tipo === 'texto_corto' || tipo === 'texto_largo') {
        const det = await query(
          `SELECT d.texto_respuesta FROM encuestas_respuestas_detalle d
           INNER JOIN encuestas_respuestas r ON r.id = d.respuesta_id
           WHERE d.pregunta_id = ? AND r.encuesta_id = ? AND d.texto_respuesta IS NOT NULL AND TRIM(d.texto_respuesta) <> ''
           ORDER BY d.id DESC LIMIT 200`,
          [p.id, id]
        );
        item.datos = { muestras: (det || []).map((x) => x.texto_respuesta) };
      } else {
        item.datos = {};
      }
      resultadosPreguntas.push(item);
    }

    res.json({
      success: true,
      encuesta: enc[0],
      totalRespuestas,
      porRol: porRol || [],
      resultadosPreguntas
    });
  } catch (err) {
    console.error('[encuestas] estadisticas', err);
    res.status(500).json({ error: 'Error al cargar estadísticas' });
  }
});

router.get('/admin/:id', authenticateToken, requireAdminOrPromotoria, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const enc = await query(`SELECT * FROM encuestas WHERE id = ? AND colegio_id = ? LIMIT 1`, [id, colegio_id]);
    if (!enc || !enc.length) return res.status(404).json({ error: 'Encuesta no encontrada' });
    const preg = await query(
      `SELECT * FROM encuestas_preguntas WHERE encuesta_id = ? ORDER BY orden ASC, id ASC`,
      [id]
    );
    const audiencias = await cargarAudiencias(id);
    const preguntas = (preg || []).map((p) => ({
      id: p.id,
      orden: p.orden,
      texto_pregunta: p.descripcion,
      subtitulo: p.subtitulo || '',
      tipo_interfaz: p.tipo_interfaz || mapLegacyTipo(p.tipo_respuesta),
      tipo_respuesta: p.tipo_respuesta,
      obligatoria: p.obligatoria !== 0 && p.obligatoria !== false,
      opciones: parseOpciones(p) || {}
    }));
    res.json({
      success: true,
      encuesta: enc[0],
      preguntas,
      audiencias: audiencias.map((a) => a.tipo)
    });
  } catch (err) {
    console.error('[encuestas] admin get', err);
    res.status(500).json({ error: 'Error al cargar encuesta' });
  }
});

router.post('/admin', authenticateToken, requireAdminOrPromotoria, async (req, res) => {
  try {
    const { colegio_id, usuario_id, personal_id } = req.user;
    const {
      titulo,
      descripcion,
      audiencias = [],
      fecha_inicio,
      fecha_fin,
      mensaje_agradecimiento,
      categoria_metrica,
      estado = 'ACTIVO',
      preguntas = []
    } = req.body;

    if (!titulo || !String(titulo).trim()) {
      return res.status(400).json({ error: 'Título requerido' });
    }
    if (!Array.isArray(audiencias) || audiencias.length === 0) {
      return res.status(400).json({ error: 'Selecciona al menos una audiencia' });
    }
    if (!Array.isArray(preguntas) || preguntas.length === 0) {
      return res.status(400).json({ error: 'Agrega al menos una pregunta' });
    }

    const tipoLegacy = audiencias[0] || 'APODERADO';
    const msg = mensaje_agradecimiento || '¡Gracias por tu participación!';
    const desc = descripcion || null;
    const fi = fecha_inicio || null;
    const ff = fecha_fin || null;
    const cat = categoria_metrica || null;
    const pers = personal_id || null;

    const ins = await execute(
      `INSERT INTO encuestas (colegio_id, personal_id, titulo, estado, tipo, descripcion, fecha_inicio, fecha_fin, mensaje_agradecimiento, categoria_metrica, modelo_encuesta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 2)`,
      [colegio_id, pers, String(titulo).trim(), estado, tipoLegacy, desc, fi, ff, msg, cat]
    );
    const encuestaId = ins.insertId;

    for (const t of new Set(audiencias)) {
      await execute(`INSERT INTO encuestas_audiencias (encuesta_id, tipo) VALUES (?, ?)`, [encuestaId, t]);
    }

    let orden = 1;
    for (const p of preguntas) {
      const ti = p.tipo_interfaz || 'texto_corto';
      const text = String(p.texto_pregunta || p.descripcion || '').trim();
      if (ti !== 'titulo' && !text) continue;
      const opc = p.opciones != null ? JSON.stringify(p.opciones) : null;
      const subt = p.subtitulo ? String(p.subtitulo) : null;
      const oblig = p.obligatoria !== false ? 1 : 0;
      const tr = ti === 'titulo' ? 'TITULO' : ti === 'marcar' || ti === 'lista' ? 'ALTERNATIVAS' : 'TEXTO';
      await execute(
        `INSERT INTO encuestas_preguntas (encuesta_id, descripcion, orden, tipo_respuesta, tipo_interfaz, opciones_json, obligatoria, subtitulo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [encuestaId, text || ' ', orden, tr, ti, opc, oblig, subt]
      );
      orden += 1;
    }

    res.json({ success: true, encuesta_id: encuestaId });

    if (String(estado).toUpperCase() === 'ACTIVO') {
      setImmediate(() => {
        cargarAudiencias(encuestaId)
          .then((aud) =>
            notificarEncuestaActivada({
              colegio_id,
              encuesta_id: encuestaId,
              titulo: String(titulo).trim(),
              usuario_id_emisor: usuario_id,
              audiencias: aud
            })
          )
          .catch((err) => console.error('[encuestas] notif activación (create)', err));
      });
    }
  } catch (err) {
    console.error('[encuestas] admin create', err);
    res.status(500).json({ error: err.message || 'Error al crear encuesta' });
  }
});

router.put('/admin/:id', authenticateToken, requireAdminOrPromotoria, async (req, res) => {
  try {
    const { colegio_id, usuario_id: usuarioIdAdmin } = req.user;
    const id = parseInt(req.params.id, 10);
    const enc = await query(`SELECT * FROM encuestas WHERE id = ? AND colegio_id = ? LIMIT 1`, [id, colegio_id]);
    if (!enc || !enc.length) return res.status(404).json({ error: 'Encuesta no encontrada' });
    const cur = enc[0];
    const oldEstado = String(cur.estado || '').toUpperCase();

    const cnt = await query(`SELECT COUNT(*) AS c FROM encuestas_respuestas WHERE encuesta_id = ?`, [id]);
    const tiene = cnt && cnt[0] && Number(cnt[0].c) > 0;

    const {
      titulo,
      descripcion,
      audiencias,
      fecha_inicio,
      fecha_fin,
      mensaje_agradecimiento,
      categoria_metrica,
      estado,
      preguntas
    } = req.body;

    if (tiene && Array.isArray(preguntas) && preguntas.length > 0) {
      return res.status(409).json({
        error: 'Ya hay respuestas: no se pueden editar las preguntas. Solo metadatos.'
      });
    }

    const v = (x, fallback) => (x !== undefined ? x : fallback);
    await execute(
      `UPDATE encuestas SET titulo = ?, descripcion = ?, fecha_inicio = ?, fecha_fin = ?, mensaje_agradecimiento = ?, categoria_metrica = ?, estado = ?
       WHERE id = ? AND colegio_id = ?`,
      [
        titulo != null ? String(titulo).trim() : cur.titulo,
        v(descripcion, cur.descripcion) ?? null,
        v(fecha_inicio, cur.fecha_inicio) ?? null,
        v(fecha_fin, cur.fecha_fin) ?? null,
        v(mensaje_agradecimiento, cur.mensaje_agradecimiento) ?? null,
        v(categoria_metrica, cur.categoria_metrica) ?? null,
        v(estado, cur.estado) ?? 'ACTIVO',
        id,
        colegio_id
      ]
    );

    if (!tiene && Array.isArray(audiencias) && audiencias.length) {
      await execute(`DELETE FROM encuestas_audiencias WHERE encuesta_id = ?`, [id]);
      for (const t of new Set(audiencias)) {
        await execute(`INSERT INTO encuestas_audiencias (encuesta_id, tipo) VALUES (?, ?)`, [id, t]);
      }
      await execute(`UPDATE encuestas SET tipo = ? WHERE id = ?`, [audiencias[0], id]);
    }

    if (!tiene && Array.isArray(preguntas)) {
      await execute(`DELETE FROM encuestas_preguntas WHERE encuesta_id = ?`, [id]);
      let orden = 1;
      for (const p of preguntas) {
        const ti = p.tipo_interfaz || 'texto_corto';
        const text = String(p.texto_pregunta || p.descripcion || '').trim();
        if (ti !== 'titulo' && !text) continue;
        const opc = p.opciones != null ? JSON.stringify(p.opciones) : null;
        const subt = p.subtitulo ? String(p.subtitulo) : null;
        const oblig = p.obligatoria !== false ? 1 : 0;
        const tr = ti === 'titulo' ? 'TITULO' : ti === 'marcar' || ti === 'lista' ? 'ALTERNATIVAS' : 'TEXTO';
        await execute(
          `INSERT INTO encuestas_preguntas (encuesta_id, descripcion, orden, tipo_respuesta, tipo_interfaz, opciones_json, obligatoria, subtitulo)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, text || ' ', orden, tr, ti, opc, oblig, subt]
        );
        orden += 1;
      }
    }

    const newEstado = String((estado !== undefined ? estado : cur.estado) || '').toUpperCase();
    if (newEstado === 'ACTIVO' && oldEstado !== 'ACTIVO') {
      setImmediate(() => {
        cargarAudiencias(id)
          .then((aud) =>
            notificarEncuestaActivada({
              colegio_id,
              encuesta_id: id,
              titulo: titulo != null ? String(titulo).trim() : cur.titulo,
              usuario_id_emisor: usuarioIdAdmin,
              audiencias: aud
            })
          )
          .catch((err) => console.error('[encuestas] notif activación (update)', err));
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[encuestas] admin put', err);
    res.status(500).json({ error: err.message || 'Error al actualizar' });
  }
});

router.delete('/admin/:id', authenticateToken, requireAdminOrPromotoria, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const r = await execute(`UPDATE encuestas SET estado = 'INACTIVO' WHERE id = ? AND colegio_id = ?`, [id, colegio_id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'No encontrada' });
    res.json({ success: true });
  } catch (err) {
    console.error('[encuestas] admin delete', err);
    res.status(500).json({ error: 'Error al desactivar' });
  }
});

// ---------- Usuario autenticado ----------

router.get('/modal-pendiente', authenticateToken, async (req, res) => {
  try {
    const enc = await buscarEncuestaModalPendiente(req.user, req.user.colegio_id);
    res.json({ success: true, encuesta: enc });
  } catch (err) {
    console.error('[encuestas] modal-pendiente', err);
    res.json({ success: true, encuesta: null });
  }
});

router.post('/modal-visto/:encuestaId', authenticateToken, async (req, res) => {
  try {
    const eid = parseInt(req.params.encuestaId, 10);
    const { colegio_id, usuario_id } = req.user;
    if (!eid) return res.status(400).json({ error: 'ID inválido' });
    await execute(
      `INSERT IGNORE INTO encuestas_modal_visto (usuario_id, encuesta_id, colegio_id) VALUES (?, ?, ?)`,
      [usuario_id, eid, colegio_id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[encuestas] modal-visto', err);
    res.status(500).json({ error: 'No se pudo registrar' });
  }
});

router.get('/mis-disponibles', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    const { colegio_id } = user;
    const anio = await getAnioActivo(colegio_id);
    const rows = await query(
      `SELECT e.id, e.titulo, e.descripcion, e.fecha_inicio, e.fecha_fin, e.mensaje_agradecimiento, e.categoria_metrica, e.estado
       FROM encuestas e
       WHERE e.colegio_id = ? AND e.estado = 'ACTIVO'
       ORDER BY e.id DESC`,
      [colegio_id]
    );
    const out = [];
    for (const e of rows || []) {
      if (!encuestaVigente(e)) continue;
      const aud = await cargarAudiencias(e.id);
      if (!usuarioCoincideAudiencia(user, aud)) continue;
      const ya = await query(
        `SELECT id FROM encuestas_respuestas WHERE encuesta_id = ? AND usuario_id = ? LIMIT 1`,
        [e.id, user.usuario_id]
      );
      out.push({
        ...e,
        ya_respondio: !!(ya && ya.length),
        audiencias: aud.map((a) => a.tipo)
      });
    }
    res.json({ success: true, encuestas: out, anio_activo: anio });
  } catch (err) {
    console.error('[encuestas] mis-disponibles', err);
    res.status(500).json({ error: 'Error al listar encuestas' });
  }
});

router.get('/contestar/:id', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    const { colegio_id } = user;
    const id = parseInt(req.params.id, 10);
    const enc = await query(`SELECT * FROM encuestas WHERE id = ? AND colegio_id = ? LIMIT 1`, [id, colegio_id]);
    if (!enc || !enc.length) return res.status(404).json({ error: 'Encuesta no encontrada' });
    const e = enc[0];
    if (!encuestaVigente(e) || String(e.estado).toUpperCase() !== 'ACTIVO') {
      return res.status(400).json({ error: 'Encuesta no disponible' });
    }
    const aud = await cargarAudiencias(id);
    if (!usuarioCoincideAudiencia(user, aud)) {
      return res.status(403).json({ error: 'No está dirigida a tu perfil' });
    }
    const ya = await query(
      `SELECT id FROM encuestas_respuestas WHERE encuesta_id = ? AND usuario_id = ? LIMIT 1`,
      [id, user.usuario_id]
    );
    if (ya && ya.length) {
      return res.status(400).json({ error: 'Ya respondiste esta encuesta', ya_respondio: true });
    }
    const preg = await query(
      `SELECT * FROM encuestas_preguntas WHERE encuesta_id = ? ORDER BY orden ASC, id ASC`,
      [id]
    );
    const preguntas = (preg || []).map(normalizarPreguntaPublica);
    res.json({
      success: true,
      encuesta: {
        id: e.id,
        titulo: e.titulo,
        descripcion: e.descripcion,
        mensaje_agradecimiento: e.mensaje_agradecimiento
      },
      preguntas,
      usuario_contexto: {
        tipo: user.tipo,
        etiqueta: user.tipo
      }
    });
  } catch (err) {
    console.error('[encuestas] contestar get', err);
    res.status(500).json({ error: 'Error al cargar encuesta' });
  }
});

router.post('/contestar/:id', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    const { colegio_id, usuario_id, tipo, alumno_id } = user;
    const id = parseInt(req.params.id, 10);
    const { respuestas: bodyRespuestas } = req.body;

    const enc = await query(`SELECT * FROM encuestas WHERE id = ? AND colegio_id = ? LIMIT 1`, [id, colegio_id]);
    if (!enc || !enc.length) return res.status(404).json({ error: 'Encuesta no encontrada' });
    const e = enc[0];
    if (!encuestaVigente(e) || String(e.estado).toUpperCase() !== 'ACTIVO') {
      return res.status(400).json({ error: 'Encuesta no disponible' });
    }
    const aud = await cargarAudiencias(id);
    if (!usuarioCoincideAudiencia(user, aud)) {
      return res.status(403).json({ error: 'No está dirigida a tu perfil' });
    }

    const ya = await query(`SELECT id FROM encuestas_respuestas WHERE encuesta_id = ? AND usuario_id = ? LIMIT 1`, [
      id,
      usuario_id
    ]);
    if (ya && ya.length) {
      return res.status(400).json({ error: 'Ya respondiste esta encuesta' });
    }

    const preguntas = await query(
      `SELECT * FROM encuestas_preguntas WHERE encuesta_id = ? ORDER BY orden ASC, id ASC`,
      [id]
    );
    const byId = new Map((preguntas || []).map((p) => [p.id, p]));

    const anio = await getAnioActivo(colegio_id);
    const snap = await getGradoSnapshot(alumno_id, colegio_id, anio);

    const mapR = {};
    if (Array.isArray(bodyRespuestas)) {
      for (const r of bodyRespuestas) {
        if (r && r.pregunta_id != null) mapR[Number(r.pregunta_id)] = r;
      }
    }

    for (const p of preguntas || []) {
      const ti = p.tipo_interfaz || mapLegacyTipo(p.tipo_respuesta);
      if (ti === 'titulo') continue;
      const oblig = p.obligatoria !== 0 && p.obligatoria !== false;
      const rr = mapR[p.id];
      if (!oblig) continue;
      if (!rr) {
        return res.status(400).json({ error: `Falta respuesta obligatoria (pregunta ${p.orden})` });
      }
      const ok = validarRespuestaItem(ti, rr, p);
      if (!ok.valid) return res.status(400).json({ error: ok.mensaje || 'Respuesta inválida' });
    }

    const insR = await execute(
      `INSERT INTO encuestas_respuestas (encuesta_id, colegio_id, usuario_id, rol_respondiente, alumno_id, grado_snapshot, nivel_snapshot)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        colegio_id,
        usuario_id,
        tipo,
        alumno_id || null,
        snap.grado_snapshot,
        snap.nivel_snapshot
      ]
    );
    const respuestaId = insR.insertId;

    for (const p of preguntas || []) {
      const ti = p.tipo_interfaz || mapLegacyTipo(p.tipo_respuesta);
      if (ti === 'titulo') continue;
      const rr = mapR[p.id];
      if (!rr && !(p.obligatoria !== 0 && p.obligatoria !== false)) continue;
      if (!rr) continue;

      let texto = null;
      let valorNum = null;
      let opcJson = null;
      if (ti === 'texto_corto' || ti === 'texto_largo') {
        texto = rr.texto != null ? String(rr.texto) : '';
      } else if (ti === 'escala') {
        valorNum = rr.valor_numerico != null ? parseInt(rr.valor_numerico, 10) : null;
      } else if (ti === 'marcar' || ti === 'lista') {
        opcJson = JSON.stringify(rr.opciones_seleccionadas != null ? rr.opciones_seleccionadas : []);
      }

      await execute(
        `INSERT INTO encuestas_respuestas_detalle (respuesta_id, pregunta_id, texto_respuesta, valor_numerico, opciones_json)
         VALUES (?, ?, ?, ?, ?)`,
        [respuestaId, p.id, texto, valorNum, opcJson]
      );
    }

    try {
      await execute(
        `INSERT IGNORE INTO encuestas_modal_visto (usuario_id, encuesta_id, colegio_id) VALUES (?, ?, ?)`,
        [usuario_id, id, colegio_id]
      );
    } catch (e) {
      /* tabla opcional hasta migración */
    }

    res.json({ success: true, respuesta_id: respuestaId });
  } catch (err) {
    console.error('[encuestas] contestar post', err);
    res.status(500).json({ error: err.message || 'Error al guardar' });
  }
});

function validarRespuestaItem(ti, rr, p) {
  if (ti === 'texto_corto' || ti === 'texto_largo') {
    const t = rr.texto != null ? String(rr.texto).trim() : '';
    if (!t) return { valid: false, mensaje: 'Texto requerido' };
    const max = (parseOpciones(p) || {}).max_length || (ti === 'texto_corto' ? 200 : 2000);
    if (t.length > max) return { valid: false, mensaje: 'Texto demasiado largo' };
    return { valid: true };
  }
  if (ti === 'escala') {
    const n = rr.valor_numerico != null ? parseInt(rr.valor_numerico, 10) : NaN;
    const op = parseOpciones(p) || {};
    const min = Number.isFinite(Number(op.min)) ? Number(op.min) : 1;
    const max = Number.isFinite(Number(op.max)) ? Number(op.max) : 5;
    if (!Number.isFinite(n) || n < min || n > max) return { valid: false, mensaje: 'Valor de escala inválido' };
    return { valid: true };
  }
  if (ti === 'marcar' || ti === 'lista') {
    let arr = rr.opciones_seleccionadas;
    if (!Array.isArray(arr)) {
      if (arr == null || arr === '') arr = [];
      else arr = [arr];
    }
    const op = parseOpciones(p) || {};
    const opts = op.opciones || [];
    if (ti === 'lista' && arr.length !== 1) return { valid: false, mensaje: 'Selecciona una opción' };
    if (ti === 'marcar' && !(op.multiple === true || op.multiple === 1) && arr.length > 1) {
      return { valid: false, mensaje: 'Una sola opción' };
    }
    if (arr.length === 0) return { valid: false, mensaje: 'Selecciona al menos una opción' };
    for (const a of arr) {
      if (!opts.includes(a)) return { valid: false, mensaje: 'Opción no válida' };
    }
    return { valid: true };
  }
  return { valid: true };
}

module.exports = router;
