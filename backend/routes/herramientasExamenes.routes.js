/**
 * Exámenes de Herramientas: audiencias, alcance por grupos, modo PRACTICA/CALIFICADO/MIXTO,
 * preguntas con puntaje, intentos y corrección auto + manual (respuesta corta).
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const router = express.Router();
const { query, execute, getAnioActivo } = require('../utils/mysql');
const { authenticateToken } = require('../middleware/auth');
const { urlArchivoMensajeStatic } = require('../utils/mensajesHtml');

/** Misma carpeta pública que mensajes / aula virtual (Static/Archivos). */
const hexEditorImagenStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const primary = '/home/vanguard/nuevo.vanguardschools.edu.pe/Static/Archivos';
    const fallback = path.join(__dirname, '../uploads/archivos');
    let dir = primary;
    try {
      if (!fs.existsSync(primary)) dir = fallback;
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch (e) {
      dir = fallback;
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `hex-editor-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const fileFilterHexImagen = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const allowedExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  if (allowedExt.includes(ext) && file.mimetype && file.mimetype.startsWith('image/')) return cb(null, true);
  cb(new Error('Solo imágenes (jpg, png, gif, webp)'));
};

const uploadHexEditorImagen = multer({
  storage: hexEditorImagenStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: fileFilterHexImagen
});

const ADMIN_TYPES = new Set(['ADMINISTRADOR', 'PROMOTORIA']);

function requireAdminOrPromotoria(req, res, next) {
  if (!req.user || !ADMIN_TYPES.has(req.user.tipo)) {
    return res.status(403).json({ error: 'No autorizado' });
  }
  next();
}

function requireDocente(req, res, next) {
  if (!req.user || String(req.user.tipo).toUpperCase() !== 'DOCENTE') {
    return res.status(403).json({ error: 'Solo docentes' });
  }
  next();
}

function uid(req) {
  return req.user.usuario_id || req.user.id;
}

function usuarioCoincideAudiencia(user, audiencias) {
  if (!audiencias || audiencias.length === 0) return false;
  if (audiencias.some((a) => a.tipo === 'TODOS')) return true;
  if (audiencias.some((a) => a.tipo === user.tipo)) return true;
  return false;
}

function examenVigente(ex) {
  if (!ex || String(ex.estado).toUpperCase() !== 'ACTIVO') return false;
  const today = new Date();
  const d0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (ex.fecha_inicio) {
    const fi = new Date(ex.fecha_inicio);
    const a = new Date(fi.getFullYear(), fi.getMonth(), fi.getDate());
    if (d0 < a) return false;
  }
  if (ex.fecha_fin) {
    const ff = new Date(ex.fecha_fin);
    const b = new Date(ff.getFullYear(), ff.getMonth(), ff.getDate());
    if (d0 > b) return false;
  }
  return true;
}

async function cargarAudiencias(examenId) {
  return query(
    `SELECT id, examen_id, tipo FROM herramientas_examenes_audiencias WHERE examen_id = ? ORDER BY tipo`,
    [examenId]
  );
}

async function cargarGruposIds(examenId) {
  const rows = await query(
    `SELECT grupo_id FROM herramientas_examenes_grupos WHERE examen_id = ?`,
    [examenId]
  );
  return (rows || []).map((r) => Number(r.grupo_id));
}

/** Grupos del usuario en el año activo (vacío si no aplica). Admin/promotoría: bypass con todos=true */
async function obtenerGruposUsuario(user, colegio_id, anio) {
  const tipo = String(user.tipo || '').toUpperCase();
  if (tipo === 'ADMINISTRADOR' || tipo === 'PROMOTORIA') {
    return { todos: true, ids: [] };
  }
  if (tipo === 'ALUMNO' && user.alumno_id) {
    const r = await query(
      `SELECT m.grupo_id FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ?
         AND (m.estado = 0 OR m.estado = 4)`,
      [user.alumno_id, colegio_id, anio]
    );
    return { todos: false, ids: [...new Set((r || []).map((x) => Number(x.grupo_id)))] };
  }
  if (tipo === 'DOCENTE' && user.personal_id) {
    const asig = await query(
      `SELECT DISTINCT g.id AS grupo_id FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.personal_id = ? AND g.colegio_id = ? AND g.anio = ?`,
      [user.personal_id, colegio_id, anio]
    );
    const tut = await query(
      `SELECT g.id AS grupo_id FROM grupos g
       WHERE g.tutor_id = ? AND g.colegio_id = ? AND g.anio = ?`,
      [user.personal_id, colegio_id, anio]
    );
    const ids = [...new Set([...(asig || []), ...(tut || [])].map((x) => Number(x.grupo_id)))];
    return { todos: false, ids };
  }
  if (tipo === 'APODERADO' && user.apoderado_id) {
    const r = await query(
      `SELECT DISTINCT g.id AS grupo_id
       FROM familias f
       INNER JOIN alumnos al ON al.id = f.alumno_id
       INNER JOIN matriculas m ON m.alumno_id = al.id AND m.colegio_id = ?
       INNER JOIN grupos g ON g.id = m.grupo_id AND g.anio = ?
       WHERE f.apoderado_id = ? AND (m.estado = 0 OR m.estado = 4)`,
      [colegio_id, anio, user.apoderado_id]
    );
    return { todos: false, ids: [...new Set((r || []).map((x) => Number(x.grupo_id)))] };
  }
  return { todos: false, ids: [] };
}

function usuarioCoincideAlcanceGrupos(user, examGrupoIds, ug) {
  if (!examGrupoIds || examGrupoIds.length === 0) return true;
  const tipo = String(user.tipo || '').toUpperCase();
  if (tipo === 'ADMINISTRADOR' || tipo === 'PROMOTORIA') return true;
  if (ug.todos) return true;
  const setE = new Set(examGrupoIds);
  return ug.ids.some((g) => setE.has(g));
}

async function puedeVerExamen(user, colegio_id, examenRow) {
  const anio = await getAnioActivo(colegio_id);
  const aud = await cargarAudiencias(examenRow.id);
  if (!usuarioCoincideAudiencia(user, aud)) return false;
  const gids = await cargarGruposIds(examenRow.id);
  const ug = await obtenerGruposUsuario(user, colegio_id, anio);
  return usuarioCoincideAlcanceGrupos(user, gids, ug);
}

function parseJsonSafe(v) {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

/** Texto visible de una pregunta HTML (Quill) — validación mínima */
function textoPreguntaNoVacio(html) {
  const t = String(html || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
  return t.length > 0;
}

function examenParamsExtendidos(body) {
  const tipoP = body.tipo_puntaje === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'GENERAL';
  const puntosC =
    tipoP === 'INDIVIDUAL'
      ? null
      : body.puntos_correcta != null
        ? Number(body.puntos_correcta)
        : 1;
  return {
    tiempo_minutos: Math.min(600, Math.max(1, parseInt(body.tiempo_minutos, 10) || 60)),
    tipo_puntaje: tipoP,
    puntos_correcta: puntosC,
    penalizar_incorrecta: body.penalizar_incorrecta === 'SI' ? 'SI' : 'NO',
    penalizacion_incorrecta: Math.max(0, Number(body.penalizacion_incorrecta) || 0),
    orden_preguntas: body.orden_preguntas === 'ALEATORIO' ? 'ALEATORIO' : 'PREDETERMINADO',
    preguntas_max: Math.max(1, parseInt(body.preguntas_max, 10) || 1),
    bloque_contenido:
      body.bloque_contenido != null && String(body.bloque_contenido).trim()
        ? String(body.bloque_contenido)
        : null,
    bloque_imagen_url: body.bloque_imagen_url != null && String(body.bloque_imagen_url).trim()
      ? String(body.bloque_imagen_url).trim().slice(0, 500)
      : null
  };
}

function preguntaPublicaSinClaves(row) {
  const o = parseJsonSafe(row.opciones_json);
  const tipo = String(row.tipo || '').toUpperCase();
  let opcionesPublica = o;
  if (tipo === 'ALTERNATIVAS' && o && Array.isArray(o.opciones)) {
    opcionesPublica = { opciones: o.opciones };
  }
  if (tipo === 'VERDADERO_FALSO') {
    opcionesPublica = { vf: true };
  }
  if (tipo === 'RESPUESTA_CORTA') {
    opcionesPublica = {};
  }
  return {
    id: row.id,
    examen_id: row.examen_id,
    orden: row.orden,
    texto: row.texto,
    tipo,
    opciones: opcionesPublica || {},
    puntos: Number(row.puntos),
    solo_informativo: row.solo_informativo === 1 || row.solo_informativo === true,
    obligatoria: row.obligatoria !== 0 && row.obligatoria !== false
  };
}

function preguntaEditor(row) {
  const o = parseJsonSafe(row.opciones_json) || {};
  return {
    id: row.id,
    texto: row.texto,
    tipo: String(row.tipo || '').toUpperCase(),
    opciones: o,
    puntos: Number(row.puntos),
    solo_informativo: row.solo_informativo === 1 || row.solo_informativo === true,
    obligatoria: row.obligatoria !== 0 && row.obligatoria !== false,
    orden: row.orden
  };
}

async function assertExamenColegio(examenId, colegio_id) {
  const rows = await query(`SELECT * FROM herramientas_examenes WHERE id = ? AND colegio_id = ? LIMIT 1`, [
    examenId,
    colegio_id
  ]);
  return rows && rows[0] ? rows[0] : null;
}

/** Grupos del año para editor (admin: todos; docente: los suyos). */
router.get('/meta/grupos', authenticateToken, async (req, res) => {
  try {
    const { colegio_id, anio_activo, tipo, personal_id } = req.user;
    const anio = anio_activo || (await getAnioActivo(colegio_id));
    if (ADMIN_TYPES.has(tipo)) {
      const grupos = await query(
        `SELECT g.id, g.grado, g.seccion, n.nombre AS nivel_nombre
         FROM grupos g
         INNER JOIN niveles n ON n.id = g.nivel_id
         WHERE g.colegio_id = ? AND g.anio = ?
         ORDER BY n.id, g.grado, g.seccion`,
        [colegio_id, anio]
      );
      return res.json({ success: true, grupos: grupos || [] });
    }
    if (String(tipo).toUpperCase() === 'DOCENTE' && personal_id) {
      const asig = await query(
        `SELECT DISTINCT g.id, g.grado, g.seccion, n.nombre AS nivel_nombre
         FROM grupos g
         INNER JOIN niveles n ON n.id = g.nivel_id
         INNER JOIN asignaturas a ON a.grupo_id = g.id
         WHERE a.personal_id = ? AND g.colegio_id = ? AND g.anio = ?`,
        [personal_id, colegio_id, anio]
      );
      const tut = await query(
        `SELECT g.id, g.grado, g.seccion, n.nombre AS nivel_nombre
         FROM grupos g
         INNER JOIN niveles n ON n.id = g.nivel_id
         WHERE g.tutor_id = ? AND g.colegio_id = ? AND g.anio = ?`,
        [personal_id, colegio_id, anio]
      );
      const map = new Map();
      for (const g of [...(asig || []), ...(tut || [])]) {
        map.set(g.id, g);
      }
      return res.json({ success: true, grupos: [...map.values()] });
    }
    return res.status(403).json({ error: 'Solo administración o docentes pueden listar grupos aquí' });
  } catch (err) {
    console.error('[hex] meta grupos', err);
    res.status(500).json({ error: 'Error al cargar grupos' });
  }
});

/**
 * POST /api/herramientas-examenes/admin/subir-imagen
 * Imagen para editor Quill o contexto del examen (misma URL pública que mensajes).
 */
router.post(
  '/admin/subir-imagen',
  authenticateToken,
  requireAdminOrPromotoria,
  (req, res, next) => {
    uploadHexEditorImagen.single('imagen')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || 'Archivo no válido' });
      next();
    });
  },
  (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No se envió imagen' });
      res.json({ url: urlArchivoMensajeStatic(req.file.filename) });
    } catch (e) {
      console.error('[hex] admin subir-imagen', e);
      res.status(500).json({ error: 'Error al subir' });
    }
  }
);

router.post(
  '/docente/subir-imagen',
  authenticateToken,
  requireDocente,
  (req, res, next) => {
    uploadHexEditorImagen.single('imagen')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || 'Archivo no válido' });
      next();
    });
  },
  (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No se envió imagen' });
      res.json({ url: urlArchivoMensajeStatic(req.file.filename) });
    } catch (e) {
      console.error('[hex] docente subir-imagen', e);
      res.status(500).json({ error: 'Error al subir' });
    }
  }
);

// ---------- Admin ----------

router.get('/admin/lista', authenticateToken, requireAdminOrPromotoria, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const rows = await query(
      `SELECT e.*,
        (SELECT COUNT(*) FROM herramientas_examenes_intentos i WHERE i.examen_id = e.id AND i.estado IN ('ENVIADO','CALIFICADO')) AS total_intentos
       FROM herramientas_examenes e
       WHERE e.colegio_id = ?
       ORDER BY e.id DESC`,
      [colegio_id]
    );
    const out = [];
    for (const e of rows || []) {
      const aud = await cargarAudiencias(e.id);
      const gids = await cargarGruposIds(e.id);
      out.push({
        ...e,
        audiencias: aud.map((a) => a.tipo),
        grupos_count: gids.length
      });
    }
    res.json({ success: true, examenes: out });
  } catch (err) {
    console.error('[hex] admin lista', err);
    res.status(500).json({ error: 'Error al listar exámenes' });
  }
});

router.get('/admin/:id', authenticateToken, requireAdminOrPromotoria, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { colegio_id } = req.user;
    const ex = await assertExamenColegio(id, colegio_id);
    if (!ex) return res.status(404).json({ error: 'No encontrado' });
    const aud = await cargarAudiencias(id);
    const gids = await cargarGruposIds(id);
    const preg = await query(
      `SELECT * FROM herramientas_examenes_preguntas WHERE examen_id = ? ORDER BY orden ASC, id ASC`,
      [id]
    );
    const cntI = await query(
      `SELECT COUNT(*) AS c FROM herramientas_examenes_intentos WHERE examen_id = ? AND estado IN ('ENVIADO','CALIFICADO')`,
      [id]
    );
    res.json({
      success: true,
      examen: ex,
      audiencias: aud.map((a) => a.tipo),
      grupo_ids: gids,
      preguntas: (preg || []).map(preguntaEditor),
      tiene_intentos_finalizados: (cntI[0]?.c || 0) > 0
    });
  } catch (err) {
    console.error('[hex] admin get', err);
    res.status(500).json({ error: 'Error al cargar' });
  }
});

router.get('/admin/:id/vista-previa', authenticateToken, requireAdminOrPromotoria, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { colegio_id } = req.user;
    const ex = await assertExamenColegio(id, colegio_id);
    if (!ex) return res.status(404).json({ error: 'No encontrado' });
    const preg = await query(
      `SELECT * FROM herramientas_examenes_preguntas WHERE examen_id = ? ORDER BY orden ASC, id ASC`,
      [id]
    );
    res.json({
      success: true,
      examen: {
        id: ex.id,
        titulo: ex.titulo,
        descripcion: ex.descripcion,
        mensaje_agradecimiento: ex.mensaje_agradecimiento,
        modo: ex.modo,
        intentos_max: ex.intentos_max,
        bloque_contenido: ex.bloque_contenido,
        bloque_imagen_url: ex.bloque_imagen_url
      },
      preguntas: (preg || []).map(preguntaPublicaSinClaves),
      usuario_contexto: { etiqueta: 'Vista previa' }
    });
  } catch (err) {
    console.error('[hex] vista-previa', err);
    res.status(500).json({ error: 'Error' });
  }
});

/** Vista previa sin respuestas correctas: admin/promotoría o docente creador. */
router.get('/preview/:id', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { colegio_id } = req.user;
    const ex = await assertExamenColegio(id, colegio_id);
    if (!ex) return res.status(404).json({ error: 'No encontrado' });
    const okAdmin = ADMIN_TYPES.has(req.user.tipo);
    const okDocente =
      String(req.user.tipo).toUpperCase() === 'DOCENTE' && Number(ex.creador_usuario_id) === Number(uid(req));
    if (!okAdmin && !okDocente) return res.status(403).json({ error: 'No autorizado' });
    const preg = await query(
      `SELECT * FROM herramientas_examenes_preguntas WHERE examen_id = ? ORDER BY orden ASC, id ASC`,
      [id]
    );
    res.json({
      success: true,
      preview: true,
      examen: {
        id: ex.id,
        titulo: ex.titulo,
        descripcion: ex.descripcion,
        mensaje_agradecimiento: ex.mensaje_agradecimiento,
        modo: ex.modo,
        intentos_max: ex.intentos_max,
        bloque_contenido: ex.bloque_contenido,
        bloque_imagen_url: ex.bloque_imagen_url
      },
      preguntas: (preg || []).map(preguntaPublicaSinClaves),
      usuario_contexto: { etiqueta: 'Vista previa' }
    });
  } catch (err) {
    console.error('[hex] preview', err);
    res.status(500).json({ error: 'Error' });
  }
});

async function guardarExamenCompleto(req, res, opts) {
  const { colegio_id } = req.user;
  const usuarioId = uid(req);
  const body = req.body || {};
  const {
    titulo,
    descripcion,
    estado,
    modo,
    fecha_inicio,
    fecha_fin,
    mensaje_agradecimiento,
    intentos_max,
    mostrar_nota,
    escala_max,
    audiencias,
    grupo_ids,
    preguntas
  } = body;

  if (!titulo || !String(titulo).trim()) {
    return res.status(400).json({ error: 'El título es obligatorio' });
  }
  const audLimpias = Array.isArray(audiencias) ? [...new Set(audiencias.map((a) => String(a).toUpperCase()))] : [];
  if (audLimpias.length === 0) {
    return res.status(400).json({ error: 'Selecciona al menos una audiencia' });
  }

  const ext = examenParamsExtendidos(body);

  const params = {
    titulo: String(titulo).trim(),
    descripcion: descripcion || null,
    estado: estado === 'ACTIVO' || estado === 'CERRADO' ? estado : 'BORRADOR',
    modo: ['PRACTICA', 'CALIFICADO', 'MIXTO'].includes(modo) ? modo : 'MIXTO',
    fecha_inicio: fecha_inicio || null,
    fecha_fin: fecha_fin || null,
    mensaje_agradecimiento: mensaje_agradecimiento || null,
    intentos_max: Math.min(20, Math.max(1, parseInt(intentos_max, 10) || 1)),
    mostrar_nota: ['NO', 'AL_ENVIAR', 'TRAS_REVISION'].includes(mostrar_nota) ? mostrar_nota : 'AL_ENVIAR',
    escala_max: escala_max != null ? Number(escala_max) : 100,
    ...ext
  };

  let examenId = opts.examenId;
  if (opts.insert) {
    const ins = await execute(
      `INSERT INTO herramientas_examenes
       (colegio_id, creador_usuario_id, titulo, descripcion, estado, modo, fecha_inicio, fecha_fin, mensaje_agradecimiento, intentos_max, mostrar_nota, escala_max,
        tiempo_minutos, tipo_puntaje, puntos_correcta, penalizar_incorrecta, penalizacion_incorrecta, orden_preguntas, preguntas_max, bloque_contenido, bloque_imagen_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        colegio_id,
        usuarioId,
        params.titulo,
        params.descripcion,
        params.estado,
        params.modo,
        params.fecha_inicio,
        params.fecha_fin,
        params.mensaje_agradecimiento,
        params.intentos_max,
        params.mostrar_nota,
        params.escala_max,
        params.tiempo_minutos,
        params.tipo_puntaje,
        params.puntos_correcta,
        params.penalizar_incorrecta,
        params.penalizacion_incorrecta,
        params.orden_preguntas,
        params.preguntas_max,
        params.bloque_contenido,
        params.bloque_imagen_url
      ]
    );
    examenId = ins.insertId;
  } else {
    const cnt = await query(
      `SELECT COUNT(*) AS c FROM herramientas_examenes_intentos WHERE examen_id = ? AND estado IN ('ENVIADO','CALIFICADO')`,
      [examenId]
    );
    const tieneIntentos = (cnt[0]?.c || 0) > 0;
    if (tieneIntentos) {
      await execute(
        `UPDATE herramientas_examenes SET titulo=?, descripcion=?, fecha_inicio=?, fecha_fin=?, mensaje_agradecimiento=?, estado=?, intentos_max=?, mostrar_nota=?, escala_max=?,
         tiempo_minutos=?, tipo_puntaje=?, puntos_correcta=?, penalizar_incorrecta=?, penalizacion_incorrecta=?, orden_preguntas=?, preguntas_max=?, bloque_contenido=?, bloque_imagen_url=?
         WHERE id=? AND colegio_id=?`,
        [
          params.titulo,
          params.descripcion,
          params.fecha_inicio,
          params.fecha_fin,
          params.mensaje_agradecimiento,
          params.estado,
          params.intentos_max,
          params.mostrar_nota,
          params.escala_max,
          params.tiempo_minutos,
          params.tipo_puntaje,
          params.puntos_correcta,
          params.penalizar_incorrecta,
          params.penalizacion_incorrecta,
          params.orden_preguntas,
          params.preguntas_max,
          params.bloque_contenido,
          params.bloque_imagen_url,
          examenId,
          colegio_id
        ]
      );
      return res.json({ success: true, id: examenId, soloMetadatos: true });
    }
    await execute(
      `UPDATE herramientas_examenes SET titulo=?, descripcion=?, estado=?, modo=?, fecha_inicio=?, fecha_fin=?, mensaje_agradecimiento=?, intentos_max=?, mostrar_nota=?, escala_max=?,
       tiempo_minutos=?, tipo_puntaje=?, puntos_correcta=?, penalizar_incorrecta=?, penalizacion_incorrecta=?, orden_preguntas=?, preguntas_max=?, bloque_contenido=?, bloque_imagen_url=?
       WHERE id=? AND colegio_id=?`,
      [
        params.titulo,
        params.descripcion,
        params.estado,
        params.modo,
        params.fecha_inicio,
        params.fecha_fin,
        params.mensaje_agradecimiento,
        params.intentos_max,
        params.mostrar_nota,
        params.escala_max,
        params.tiempo_minutos,
        params.tipo_puntaje,
        params.puntos_correcta,
        params.penalizar_incorrecta,
        params.penalizacion_incorrecta,
        params.orden_preguntas,
        params.preguntas_max,
        params.bloque_contenido,
        params.bloque_imagen_url,
        examenId,
        colegio_id
      ]
    );
  }

  await execute(`DELETE FROM herramientas_examenes_audiencias WHERE examen_id = ?`, [examenId]);
  for (const t of audLimpias) {
    await execute(`INSERT INTO herramientas_examenes_audiencias (examen_id, tipo) VALUES (?, ?)`, [examenId, t]);
  }

  await execute(`DELETE FROM herramientas_examenes_grupos WHERE examen_id = ?`, [examenId]);
  const gRaw = Array.isArray(grupo_ids) ? grupo_ids : [];
  for (const gid of gRaw) {
    const g = parseInt(gid, 10);
    if (g) await execute(`INSERT INTO herramientas_examenes_grupos (examen_id, grupo_id) VALUES (?, ?)`, [examenId, g]);
  }

  await execute(`DELETE FROM herramientas_examenes_preguntas WHERE examen_id = ?`, [examenId]);
  const plist = Array.isArray(preguntas) ? preguntas : [];
  let ord = 1;
  for (const p of plist) {
    const texto = String(p.texto || '');
    const tipo = String(p.tipo || 'ALTERNATIVAS').toUpperCase();
    if (!textoPreguntaNoVacio(texto)) continue;
    if (!['ALTERNATIVAS', 'VERDADERO_FALSO', 'RESPUESTA_CORTA'].includes(tipo)) continue;
    const puntos = Math.max(0, Number(p.puntos) || 0);
    const soloInf = p.solo_informativo ? 1 : 0;
    const oblig = p.obligatoria !== false ? 1 : 0;
    let opciones_json = JSON.stringify(p.opciones || {});
    if (tipo === 'ALTERNATIVAS') {
      const op = p.opciones || {};
      const opts = Array.isArray(op.opciones) ? op.opciones : ['A', 'B', 'C', 'D'];
      const correcta = typeof op.correcta === 'number' ? op.correcta : 0;
      opciones_json = JSON.stringify({ opciones: opts, correcta });
    }
    if (tipo === 'VERDADERO_FALSO') {
      const op = p.opciones || {};
      opciones_json = JSON.stringify({ correcta: op.correcta === false ? false : true });
    }
    if (tipo === 'RESPUESTA_CORTA') {
      opciones_json = JSON.stringify({});
    }
    await execute(
      `INSERT INTO herramientas_examenes_preguntas (examen_id, orden, texto, tipo, opciones_json, puntos, solo_informativo, obligatoria)
       VALUES (?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?)`,
      [examenId, ord, texto, tipo, opciones_json, puntos, soloInf, oblig]
    );
    ord += 1;
  }

  res.json({ success: true, id: examenId });
}

router.post('/admin', authenticateToken, requireAdminOrPromotoria, async (req, res) => {
  try {
    await guardarExamenCompleto(req, res, { insert: true });
  } catch (err) {
    console.error('[hex] admin create', err);
    res.status(500).json({ error: 'Error al crear' });
  }
});

router.put('/admin/:id', authenticateToken, requireAdminOrPromotoria, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { colegio_id } = req.user;
    const ex = await assertExamenColegio(id, colegio_id);
    if (!ex) return res.status(404).json({ error: 'No encontrado' });
    await guardarExamenCompleto(req, res, { insert: false, examenId: id });
  } catch (err) {
    console.error('[hex] admin put', err);
    res.status(500).json({ error: 'Error al guardar' });
  }
});

router.delete('/admin/:id', authenticateToken, requireAdminOrPromotoria, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { colegio_id } = req.user;
    const ex = await assertExamenColegio(id, colegio_id);
    if (!ex) return res.status(404).json({ error: 'No encontrado' });
    await execute(`DELETE FROM herramientas_examenes WHERE id = ? AND colegio_id = ?`, [id, colegio_id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[hex] admin delete', err);
    res.status(500).json({ error: 'Error al eliminar' });
  }
});

// ---------- Docente (solo propios) ----------

router.get('/docente/lista', authenticateToken, requireDocente, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const u = uid(req);
    const rows = await query(
      `SELECT e.*,
        (SELECT COUNT(*) FROM herramientas_examenes_intentos i WHERE i.examen_id = e.id AND i.estado IN ('ENVIADO','CALIFICADO')) AS total_intentos
       FROM herramientas_examenes e
       WHERE e.colegio_id = ? AND e.creador_usuario_id = ?
       ORDER BY e.id DESC`,
      [colegio_id, u]
    );
    const out = [];
    for (const e of rows || []) {
      const aud = await cargarAudiencias(e.id);
      const gids = await cargarGruposIds(e.id);
      out.push({ ...e, audiencias: aud.map((a) => a.tipo), grupos_count: gids.length });
    }
    res.json({ success: true, examenes: out });
  } catch (err) {
    console.error('[hex] docente lista', err);
    res.status(500).json({ error: 'Error al listar' });
  }
});

router.get('/docente/:id', authenticateToken, requireDocente, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { colegio_id } = req.user;
    const u = uid(req);
    const ex = await assertExamenColegio(id, colegio_id);
    if (!ex || Number(ex.creador_usuario_id) !== Number(u)) return res.status(404).json({ error: 'No encontrado' });
    const aud = await cargarAudiencias(id);
    const gids = await cargarGruposIds(id);
    const preg = await query(
      `SELECT * FROM herramientas_examenes_preguntas WHERE examen_id = ? ORDER BY orden ASC, id ASC`,
      [id]
    );
    const cntI = await query(
      `SELECT COUNT(*) AS c FROM herramientas_examenes_intentos WHERE examen_id = ? AND estado IN ('ENVIADO','CALIFICADO')`,
      [id]
    );
    res.json({
      success: true,
      examen: ex,
      audiencias: aud.map((a) => a.tipo),
      grupo_ids: gids,
      preguntas: (preg || []).map(preguntaEditor),
      tiene_intentos_finalizados: (cntI[0]?.c || 0) > 0
    });
  } catch (err) {
    console.error('[hex] docente get', err);
    res.status(500).json({ error: 'Error al cargar' });
  }
});

router.post('/docente', authenticateToken, requireDocente, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const usuarioId = uid(req);
    const body = req.body || {};
    if (!body.titulo || !String(body.titulo).trim()) {
      return res.status(400).json({ error: 'El título es obligatorio' });
    }
    const audLimpias = Array.isArray(body.audiencias) ? [...new Set(body.audiencias.map((a) => String(a).toUpperCase()))] : [];
    if (audLimpias.length === 0) return res.status(400).json({ error: 'Selecciona al menos una audiencia' });

    const ext = examenParamsExtendidos(body);
    const params = {
      titulo: String(body.titulo).trim(),
      descripcion: body.descripcion || null,
      estado: body.estado === 'ACTIVO' || body.estado === 'CERRADO' ? body.estado : 'BORRADOR',
      modo: ['PRACTICA', 'CALIFICADO', 'MIXTO'].includes(body.modo) ? body.modo : 'MIXTO',
      fecha_inicio: body.fecha_inicio || null,
      fecha_fin: body.fecha_fin || null,
      mensaje_agradecimiento: body.mensaje_agradecimiento || null,
      intentos_max: Math.min(20, Math.max(1, parseInt(body.intentos_max, 10) || 1)),
      mostrar_nota: ['NO', 'AL_ENVIAR', 'TRAS_REVISION'].includes(body.mostrar_nota) ? body.mostrar_nota : 'AL_ENVIAR',
      escala_max: body.escala_max != null ? Number(body.escala_max) : 100,
      ...ext
    };

    const ins = await execute(
      `INSERT INTO herramientas_examenes
       (colegio_id, creador_usuario_id, titulo, descripcion, estado, modo, fecha_inicio, fecha_fin, mensaje_agradecimiento, intentos_max, mostrar_nota, escala_max,
        tiempo_minutos, tipo_puntaje, puntos_correcta, penalizar_incorrecta, penalizacion_incorrecta, orden_preguntas, preguntas_max, bloque_contenido, bloque_imagen_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        colegio_id,
        usuarioId,
        params.titulo,
        params.descripcion,
        params.estado,
        params.modo,
        params.fecha_inicio,
        params.fecha_fin,
        params.mensaje_agradecimiento,
        params.intentos_max,
        params.mostrar_nota,
        params.escala_max,
        params.tiempo_minutos,
        params.tipo_puntaje,
        params.puntos_correcta,
        params.penalizar_incorrecta,
        params.penalizacion_incorrecta,
        params.orden_preguntas,
        params.preguntas_max,
        params.bloque_contenido,
        params.bloque_imagen_url
      ]
    );
    const examenId = ins.insertId;
    for (const t of audLimpias) {
      await execute(`INSERT INTO herramientas_examenes_audiencias (examen_id, tipo) VALUES (?, ?)`, [examenId, t]);
    }
    const gRaw = Array.isArray(body.grupo_ids) ? body.grupo_ids : [];
    for (const gid of gRaw) {
      const g = parseInt(gid, 10);
      if (g) await execute(`INSERT INTO herramientas_examenes_grupos (examen_id, grupo_id) VALUES (?, ?)`, [examenId, g]);
    }
    const plist = Array.isArray(body.preguntas) ? body.preguntas : [];
    let ord = 1;
    for (const p of plist) {
      const texto = String(p.texto || '');
      const tipo = String(p.tipo || 'ALTERNATIVAS').toUpperCase();
      if (!textoPreguntaNoVacio(texto)) continue;
      if (!['ALTERNATIVAS', 'VERDADERO_FALSO', 'RESPUESTA_CORTA'].includes(tipo)) continue;
      const puntos = Math.max(0, Number(p.puntos) || 0);
      const soloInf = p.solo_informativo ? 1 : 0;
      const oblig = p.obligatoria !== false ? 1 : 0;
      let opciones_json = '{}';
      if (tipo === 'ALTERNATIVAS') {
        const op = p.opciones || {};
        const opts = Array.isArray(op.opciones) ? op.opciones : ['A', 'B', 'C', 'D'];
        const correcta = typeof op.correcta === 'number' ? op.correcta : 0;
        opciones_json = JSON.stringify({ opciones: opts, correcta });
      } else if (tipo === 'VERDADERO_FALSO') {
        const op = p.opciones || {};
        opciones_json = JSON.stringify({ correcta: op.correcta === false ? false : true });
      } else {
        opciones_json = JSON.stringify({});
      }
      await execute(
        `INSERT INTO herramientas_examenes_preguntas (examen_id, orden, texto, tipo, opciones_json, puntos, solo_informativo, obligatoria)
         VALUES (?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?)`,
        [examenId, ord, texto, tipo, opciones_json, puntos, soloInf, oblig]
      );
      ord += 1;
    }
    res.json({ success: true, id: examenId });
  } catch (err) {
    console.error('[hex] docente create', err);
    res.status(500).json({ error: 'Error al crear' });
  }
});

router.put('/docente/:id', authenticateToken, requireDocente, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { colegio_id } = req.user;
    const u = uid(req);
    const ex = await assertExamenColegio(id, colegio_id);
    if (!ex || Number(ex.creador_usuario_id) !== Number(u)) return res.status(404).json({ error: 'No encontrado' });
    req.user._hexDocenteId = id;
    await guardarExamenCompleto(req, res, { insert: false, examenId: id });
  } catch (err) {
    console.error('[hex] docente put', err);
    res.status(500).json({ error: 'Error al guardar' });
  }
});

router.delete('/docente/:id', authenticateToken, requireDocente, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { colegio_id } = req.user;
    const u = uid(req);
    const ex = await assertExamenColegio(id, colegio_id);
    if (!ex || Number(ex.creador_usuario_id) !== Number(u)) return res.status(404).json({ error: 'No encontrado' });
    await execute(`DELETE FROM herramientas_examenes WHERE id = ? AND colegio_id = ?`, [id, colegio_id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[hex] docente delete', err);
    res.status(500).json({ error: 'Error al eliminar' });
  }
});

// ---------- Estadísticas (admin o docente dueño) ----------

async function puedeGestionarEstadisticas(req, examenId) {
  const { colegio_id } = req.user;
  const ex = await assertExamenColegio(examenId, colegio_id);
  if (!ex) return null;
  if (ADMIN_TYPES.has(req.user.tipo)) return ex;
  if (String(req.user.tipo).toUpperCase() === 'DOCENTE' && Number(ex.creador_usuario_id) === Number(uid(req))) return ex;
  return null;
}

router.get('/gestion/:id/estadisticas', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const ex = await puedeGestionarEstadisticas(req, id);
    if (!ex) return res.status(403).json({ error: 'No autorizado' });

    const total = await query(
      `SELECT COUNT(*) AS c FROM herramientas_examenes_intentos WHERE examen_id = ? AND estado IN ('ENVIADO','CALIFICADO')`,
      [id]
    );
    const pendientes = await query(
      `SELECT COUNT(*) AS c FROM herramientas_examenes_intentos WHERE examen_id = ? AND estado = 'ENVIADO'`,
      [id]
    );
    const intentos = await query(
      `SELECT i.id, i.usuario_id, i.rol_respondiente, i.numero_intento, i.estado, i.puntaje_obtenido, i.puntaje_max_snapshot, i.fecha_envio,
              u.usuario AS login_usuario
       FROM herramientas_examenes_intentos i
       LEFT JOIN usuarios u ON u.id = i.usuario_id
       WHERE i.examen_id = ? AND i.estado IN ('ENVIADO','CALIFICADO')
       ORDER BY i.fecha_envio DESC, i.id DESC
       LIMIT 500`,
      [id]
    );

    const preguntas = await query(
      `SELECT id, texto, tipo, puntos FROM herramientas_examenes_preguntas WHERE examen_id = ? ORDER BY orden`,
      [id]
    );

    res.json({
      success: true,
      examen: { id: ex.id, titulo: ex.titulo, modo: ex.modo },
      totalIntentos: total[0]?.c || 0,
      pendientesRevision: pendientes[0]?.c || 0,
      intentos: intentos || [],
      preguntas: preguntas || []
    });
  } catch (err) {
    console.error('[hex] estadisticas', err);
    res.status(500).json({ error: 'Error' });
  }
});

router.get('/gestion/:id/intento/:intentoId', authenticateToken, async (req, res) => {
  try {
    const examenId = parseInt(req.params.id, 10);
    const intentoId = parseInt(req.params.intentoId, 10);
    const ex = await puedeGestionarEstadisticas(req, examenId);
    if (!ex) return res.status(403).json({ error: 'No autorizado' });

    const ir = await query(
      `SELECT * FROM herramientas_examenes_intentos WHERE id = ? AND examen_id = ? LIMIT 1`,
      [intentoId, examenId]
    );
    if (!ir || !ir[0]) return res.status(404).json({ error: 'Intento no encontrado' });
    const lineas = await query(
      `SELECT d.*, p.texto AS pregunta_texto, p.tipo AS pregunta_tipo, p.opciones_json AS pregunta_opciones
       FROM herramientas_examenes_respuestas_linea d
       INNER JOIN herramientas_examenes_preguntas p ON p.id = d.pregunta_id
       WHERE d.intento_id = ?
       ORDER BY p.orden`,
      [intentoId]
    );
    res.json({ success: true, intento: ir[0], lineas: lineas || [] });
  } catch (err) {
    console.error('[hex] intento detalle', err);
    res.status(500).json({ error: 'Error' });
  }
});

router.put('/gestion/:id/intento/:intentoId/revision', authenticateToken, async (req, res) => {
  try {
    const examenId = parseInt(req.params.id, 10);
    const intentoId = parseInt(req.params.intentoId, 10);
    const ex = await puedeGestionarEstadisticas(req, examenId);
    if (!ex) return res.status(403).json({ error: 'No autorizado' });

    const { lineas } = req.body || {};
    if (!Array.isArray(lineas)) return res.status(400).json({ error: 'lineas inválido' });

    for (const L of lineas) {
      const lid = parseInt(L.linea_id, 10);
      const pts = L.puntos_otorgados != null ? Number(L.puntos_otorgados) : null;
      const com = L.comentario_docente != null ? String(L.comentario_docente) : null;
      await execute(
        `UPDATE herramientas_examenes_respuestas_linea SET puntos_otorgados = ?, comentario_docente = ?, requiere_revision = 0 WHERE id = ? AND intento_id = ?`,
        [pts, com, lid, intentoId]
      );
    }

    const sum = await query(
      `SELECT COALESCE(SUM(puntos_otorgados),0) AS s FROM herramientas_examenes_respuestas_linea WHERE intento_id = ?`,
      [intentoId]
    );
    const pend = await query(
      `SELECT COUNT(*) AS c FROM herramientas_examenes_respuestas_linea WHERE intento_id = ? AND requiere_revision = 1`,
      [intentoId]
    );
    const nuevoEstado = pend[0]?.c > 0 ? 'ENVIADO' : 'CALIFICADO';
    await execute(
      `UPDATE herramientas_examenes_intentos SET puntaje_obtenido = ?, estado = ? WHERE id = ?`,
      [sum[0]?.s ?? 0, nuevoEstado, intentoId]
    );

    res.json({ success: true, puntaje_obtenido: sum[0]?.s ?? 0, estado: nuevoEstado });
  } catch (err) {
    console.error('[hex] revision', err);
    res.status(500).json({ error: 'Error al guardar revisión' });
  }
});

// ---------- Usuario: listado y realizar ----------

router.get('/mis-disponibles', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    const { colegio_id } = user;
    const anio = await getAnioActivo(colegio_id);
    const rows = await query(
      `SELECT * FROM herramientas_examenes WHERE colegio_id = ? AND estado = 'ACTIVO' ORDER BY id DESC`,
      [colegio_id]
    );
    const out = [];
    for (const e of rows || []) {
      if (!examenVigente(e)) continue;
      if (!(await puedeVerExamen(user, colegio_id, e))) continue;
      const aud = await cargarAudiencias(e.id);
      const intentosHechos = await query(
        `SELECT COUNT(*) AS c FROM herramientas_examenes_intentos WHERE examen_id = ? AND usuario_id = ? AND estado IN ('ENVIADO','CALIFICADO')`,
        [e.id, uid(user)]
      );
      const maxI = e.intentos_max || 1;
      const puedeOtro = (intentosHechos[0]?.c || 0) < maxI;
      out.push({
        id: e.id,
        titulo: e.titulo,
        descripcion: e.descripcion,
        modo: e.modo,
        intentos_max: maxI,
        intentos_usados: intentosHechos[0]?.c || 0,
        puede_intentar: puedeOtro,
        audiencias: aud.map((a) => a.tipo)
      });
    }
    res.json({ success: true, examenes: out, anio_activo: anio });
  } catch (err) {
    console.error('[hex] mis-disponibles', err);
    res.status(500).json({ error: 'Error al listar' });
  }
});

router.post('/realizar/:examenId/iniciar', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    const { colegio_id, tipo, alumno_id } = user;
    const examenId = parseInt(req.params.examenId, 10);
    const ex = await assertExamenColegio(examenId, colegio_id);
    if (!ex || !examenVigente(ex)) return res.status(400).json({ error: 'Examen no disponible' });
    if (!(await puedeVerExamen(user, colegio_id, ex))) return res.status(403).json({ error: 'No tienes acceso a este examen' });

    const enCurso = await query(
      `SELECT * FROM herramientas_examenes_intentos WHERE examen_id = ? AND usuario_id = ? AND estado = 'EN_CURSO' ORDER BY id DESC LIMIT 1`,
      [examenId, uid(user)]
    );
    if (enCurso && enCurso[0]) {
      const preg = await query(
        `SELECT * FROM herramientas_examenes_preguntas WHERE examen_id = ? ORDER BY orden ASC, id ASC`,
        [examenId]
      );
      return res.json({
        success: true,
        intento: enCurso[0],
        examen: {
          id: ex.id,
          titulo: ex.titulo,
          descripcion: ex.descripcion,
          modo: ex.modo,
          mensaje_agradecimiento: ex.mensaje_agradecimiento,
          intentos_max: ex.intentos_max,
          mostrar_nota: ex.mostrar_nota,
          escala_max: ex.escala_max,
          tiempo_minutos: ex.tiempo_minutos,
          tipo_puntaje: ex.tipo_puntaje,
          puntos_correcta: ex.puntos_correcta,
          bloque_contenido: ex.bloque_contenido,
          bloque_imagen_url: ex.bloque_imagen_url
        },
        preguntas: (preg || []).map(preguntaPublicaSinClaves)
      });
    }

    const hechos = await query(
      `SELECT COUNT(*) AS c FROM herramientas_examenes_intentos WHERE examen_id = ? AND usuario_id = ? AND estado IN ('ENVIADO','CALIFICADO')`,
      [examenId, uid(user)]
    );
    if ((hechos[0]?.c || 0) >= (ex.intentos_max || 1)) {
      return res.status(400).json({ error: 'Agotaste los intentos permitidos' });
    }

    const n = (hechos[0]?.c || 0) + 1;
    const ins = await execute(
      `INSERT INTO herramientas_examenes_intentos
       (examen_id, colegio_id, usuario_id, rol_respondiente, alumno_id, numero_intento, estado, borrador_json)
       VALUES (?, ?, ?, ?, ?, ?, 'EN_CURSO', NULL)`,
      [examenId, colegio_id, uid(user), tipo, alumno_id || null, n]
    );
    const intentoId = ins.insertId;
    const row = await query(`SELECT * FROM herramientas_examenes_intentos WHERE id = ?`, [intentoId]);
    const preg = await query(
      `SELECT * FROM herramientas_examenes_preguntas WHERE examen_id = ? ORDER BY orden ASC, id ASC`,
      [examenId]
    );
    res.json({
      success: true,
      intento: row[0],
      examen: {
        id: ex.id,
        titulo: ex.titulo,
        descripcion: ex.descripcion,
        modo: ex.modo,
        mensaje_agradecimiento: ex.mensaje_agradecimiento,
        intentos_max: ex.intentos_max,
        mostrar_nota: ex.mostrar_nota,
        escala_max: ex.escala_max,
        tiempo_minutos: ex.tiempo_minutos,
        tipo_puntaje: ex.tipo_puntaje,
        puntos_correcta: ex.puntos_correcta,
        bloque_contenido: ex.bloque_contenido,
        bloque_imagen_url: ex.bloque_imagen_url
      },
      preguntas: (preg || []).map(preguntaPublicaSinClaves)
    });
  } catch (err) {
    console.error('[hex] iniciar', err);
    res.status(500).json({ error: 'Error al iniciar' });
  }
});

router.put('/intento/:intentoId/borrador', authenticateToken, async (req, res) => {
  try {
    const intentoId = parseInt(req.params.intentoId, 10);
    const user = req.user;
    const { colegio_id } = user;
    const { borrador } = req.body || {};
    const ir = await query(
      `SELECT i.*, e.colegio_id AS ec FROM herramientas_examenes_intentos i
       INNER JOIN herramientas_examenes e ON e.id = i.examen_id
       WHERE i.id = ? LIMIT 1`,
      [intentoId]
    );
    if (!ir || !ir[0] || Number(ir[0].colegio_id) !== Number(colegio_id)) return res.status(404).json({ error: 'No encontrado' });
    if (Number(ir[0].usuario_id) !== Number(uid(user))) return res.status(403).json({ error: 'No autorizado' });
    if (ir[0].estado !== 'EN_CURSO') return res.status(400).json({ error: 'Este intento ya fue enviado' });
    await execute(`UPDATE herramientas_examenes_intentos SET borrador_json = CAST(? AS JSON) WHERE id = ?`, [
      JSON.stringify(borrador || {}),
      intentoId
    ]);
    res.json({ success: true });
  } catch (err) {
    console.error('[hex] borrador', err);
    res.status(500).json({ error: 'Error al guardar borrador' });
  }
});

function puntajeMaximoPregunta(exModo, row) {
  const inf = row.solo_informativo === 1 || row.solo_informativo === true;
  if (exModo === 'PRACTICA') return Number(row.puntos) || 0;
  if (exModo === 'CALIFICADO') return inf ? 0 : Number(row.puntos) || 0;
  /* MIXTO */
  return inf ? 0 : Number(row.puntos) || 0;
}

router.post('/intento/:intentoId/enviar', authenticateToken, async (req, res) => {
  try {
    const intentoId = parseInt(req.params.intentoId, 10);
    const user = req.user;
    const { colegio_id } = user;
    const { respuestas } = req.body || {};

    const ir = await query(
      `SELECT i.*, e.modo AS ex_modo, e.mostrar_nota, e.titulo FROM herramientas_examenes_intentos i
       INNER JOIN herramientas_examenes e ON e.id = i.examen_id
       WHERE i.id = ? LIMIT 1`,
      [intentoId]
    );
    if (!ir || !ir[0] || Number(ir[0].colegio_id) !== Number(colegio_id)) return res.status(404).json({ error: 'No encontrado' });
    if (Number(ir[0].usuario_id) !== Number(uid(user))) return res.status(403).json({ error: 'No autorizado' });
    if (ir[0].estado !== 'EN_CURSO') return res.status(400).json({ error: 'Este intento ya fue enviado' });

    const examenId = ir[0].examen_id;
    const ex = await assertExamenColegio(examenId, colegio_id);
    if (!examenVigente(ex)) return res.status(400).json({ error: 'Examen cerrado' });

    const preguntas = await query(
      `SELECT * FROM herramientas_examenes_preguntas WHERE examen_id = ? ORDER BY orden ASC, id ASC`,
      [examenId]
    );
    const mapR = {};
    if (Array.isArray(respuestas)) {
      for (const r of respuestas) {
        if (r && r.pregunta_id != null) mapR[Number(r.pregunta_id)] = r;
      }
    }

    for (const p of preguntas || []) {
      const oblig = p.obligatoria !== 0 && p.obligatoria !== false;
      if (!oblig) continue;
      const rr = mapR[p.id];
      const tipo = String(p.tipo || '').toUpperCase();
      if (!rr) return res.status(400).json({ error: `Falta respuesta obligatoria (pregunta ${p.orden})` });
      if (tipo === 'ALTERNATIVAS') {
        if (rr.indice == null) return res.status(400).json({ error: 'Selecciona una alternativa' });
      } else if (tipo === 'VERDADERO_FALSO') {
        if (rr.valor !== true && rr.valor !== false) return res.status(400).json({ error: 'Marca verdadero o falso' });
      } else if (tipo === 'RESPUESTA_CORTA') {
        if (!String(rr.texto || '').trim()) return res.status(400).json({ error: 'Completa la respuesta corta' });
      }
    }

    let puntajeMax = 0;
    for (const p of preguntas || []) {
      puntajeMax += puntajeMaximoPregunta(ex.modo, p);
    }

    await execute(`DELETE FROM herramientas_examenes_respuestas_linea WHERE intento_id = ?`, [intentoId]);

    let puntajeParcial = 0;
    let necesitaRevision = false;

    for (const p of preguntas || []) {
      const tipo = String(p.tipo || '').toUpperCase();
      const rr = mapR[p.id];
      const o = parseJsonSafe(p.opciones_json) || {};
      const maxLocal = puntajeMaximoPregunta(ex.modo, p);
      let pts = null;
      let reqRev = false;
      let rj = {};

      if (tipo === 'ALTERNATIVAS') {
        rj = { indice: rr?.indice };
        const ok = typeof o.correcta === 'number' && rr && Number(rr.indice) === Number(o.correcta);
        pts = ok ? maxLocal : 0;
        puntajeParcial += pts;
      } else if (tipo === 'VERDADERO_FALSO') {
        rj = { valor: rr?.valor };
        const ok = rr && (rr.valor === true || rr.valor === false) && rr.valor === !!o.correcta;
        pts = ok ? maxLocal : 0;
        puntajeParcial += pts;
      } else if (tipo === 'RESPUESTA_CORTA') {
        rj = { texto: rr?.texto ?? '' };
        reqRev = maxLocal > 0;
        if (!reqRev) pts = 0;
        else {
          necesitaRevision = true;
          pts = 0;
        }
      }

      await execute(
        `INSERT INTO herramientas_examenes_respuestas_linea (intento_id, pregunta_id, respuesta_json, puntos_otorgados, requiere_revision, comentario_docente)
         VALUES (?, ?, CAST(? AS JSON), ?, ?, NULL)`,
        [intentoId, p.id, JSON.stringify(rj), pts, reqRev ? 1 : 0]
      );
    }

    const estadoFinal = necesitaRevision ? 'ENVIADO' : 'CALIFICADO';
    await execute(
      `UPDATE herramientas_examenes_intentos SET estado = ?, fecha_envio = NOW(), puntaje_obtenido = ?, puntaje_max_snapshot = ?, borrador_json = NULL WHERE id = ?`,
      [estadoFinal, puntajeParcial, puntajeMax, intentoId]
    );

    res.json({
      success: true,
      estado: estadoFinal,
      puntaje_obtenido: puntajeParcial,
      puntaje_max: puntajeMax,
      requiere_revision_docente: necesitaRevision,
      mensaje: ex.mensaje_agradecimiento || 'Gracias por tu participación.'
    });
  } catch (err) {
    console.error('[hex] enviar', err);
    res.status(500).json({ error: 'Error al enviar respuestas' });
  }
});

module.exports = router;
