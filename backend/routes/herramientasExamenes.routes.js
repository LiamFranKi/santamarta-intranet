/**
 * Exámenes de Herramientas: audiencias, alcance por grupos, modo PRACTICA/CALIFICADO/MIXTO,
 * preguntas con puntaje, intentos y corrección auto + manual (respuesta corta).
 *
 * Columnas JSON (opciones_json, borrador_json, respuesta_json): enlazar con `?` el string que
 * devuelve JSON.stringify(...) — mismo criterio que el aula del docente en docente.routes.js
 * (p. ej. datos_adicionales en INSERT/UPDATE de asignaturas_examenes_preguntas: solo placeholders).
 * No usar CAST(? AS JSON) en prepared statements: en MariaDB suele fallar con ER_PARSE_ERROR 1064.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const router = express.Router();
const { query, execute, getAnioActivo } = require('../utils/mysql');
const { authenticateToken } = require('../middleware/auth');
const { urlArchivoMensajeStatic } = require('../utils/mensajesHtml');
const {
  notificarExamenHerramientasActivado,
  notificarAdminsExamenActivado,
  notificarUsuarioExamenEnviado,
  notificarAdminsExamenCompletado,
  notificarUsuarioExamenRevisadoCalificado,
  obtenerNombreMostrarUsuario
} = require('../services/herramientasExamenesNotificacionService');

/** Misma carpeta pública que mensajes / aula virtual (Static/Archivos). */
const hexEditorImagenStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const primary = '/home/vanguard/intranet2026/backend/Static/Archivos';
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

const fileFilterHexPdf = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = String(file.mimetype || '').toLowerCase();
  if (ext === '.pdf' && (mime === 'application/pdf' || mime === 'application/x-pdf' || mime === '')) {
    return cb(null, true);
  }
  if (ext === '.pdf') return cb(null, true);
  cb(new Error('Solo se permiten archivos PDF'));
};

/** PDFs de contexto HEX → sistema nuevo (backend/uploads), NO Static del PHP legacy. */
const HEX_PDF_UPLOAD_DIR = path.join(__dirname, '../uploads/hex-examenes');
if (!fs.existsSync(HEX_PDF_UPLOAD_DIR)) {
  fs.mkdirSync(HEX_PDF_UPLOAD_DIR, { recursive: true });
}

function urlHexPdfPublic(filename) {
  const name = String(filename || '').replace(/^\/+/, '');
  const pathPart = `/uploads/hex-examenes/${name}`;
  const base = String(
    process.env.UPLOADS_PUBLIC_URL ||
      process.env.FRONTEND_URL ||
      process.env.API_PUBLIC_URL ||
      ''
  )
    .replace(/\/$/, '')
    .replace(/\/api$/i, '');
  if (base && !/localhost|127\.0\.0\.1/i.test(base)) {
    return `${base}${pathPart}`;
  }
  return pathPart;
}

const uploadHexEditorPdf = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      if (!fs.existsSync(HEX_PDF_UPLOAD_DIR)) {
        fs.mkdirSync(HEX_PDF_UPLOAD_DIR, { recursive: true });
      }
      cb(null, HEX_PDF_UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const safe = String(file.originalname || 'documento.pdf')
        .replace(/[^a-zA-Z0-9._-]+/g, '_')
        .slice(0, 80);
      const base = path.basename(safe, path.extname(safe)) || 'documento';
      cb(null, `hex-pdf-${uniqueSuffix}-${base}.pdf`);
    }
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: fileFilterHexPdf
});

function normalizarBloqueArchivos(raw) {
  let arr = raw;
  if (typeof arr === 'string') {
    try {
      arr = JSON.parse(arr);
    } catch {
      arr = [];
    }
  }
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    let url = String(item.url || '').trim().slice(0, 500);
    const nombre = String(item.nombre || 'Documento.pdf').trim().slice(0, 200) || 'Documento.pdf';
    if (!url) continue;
    // Si quedó una URL legacy Static/sistema, no la reescribimos: hay que volver a subir el PDF.
    out.push({
      nombre,
      url,
      size: item.size != null ? Number(item.size) || null : null
    });
    if (out.length >= 20) break;
  }
  return out;
}

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

/** Listado y detalle de exámenes “docente” también para psicología (solo lectura en UI). */
function requireDocenteOPsicologa(req, res, next) {
  if (!req.user) {
    return res.status(403).json({ error: 'No autorizado' });
  }
  const t = String(req.user.tipo || '').toUpperCase();
  if (t === 'DOCENTE' || t === 'PSICOLOGA' || t === 'COORDINADOR') {
    return next();
  }
  return res.status(403).json({ error: 'Solo docentes' });
}

function uid(req) {
  if (!req?.user) return undefined;
  return req.user.usuario_id ?? req.user.id;
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

/** Para Próximos Eventos: ACTIVO y no vencido (sí incluye los que aún no inician). */
function examenVisibleProximos(ex) {
  if (!ex || String(ex.estado).toUpperCase() !== 'ACTIVO') return false;
  const today = new Date();
  const d0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
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
         AND (m.estado = 0)`,
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
       WHERE (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?))
         AND g.colegio_id = ? AND g.anio = ?`,
      [user.personal_id, user.personal_id, colegio_id, anio]
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
       WHERE f.apoderado_id = ? AND (m.estado = 0)`,
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

function scheduleHexActivacionNotifs({ colegio_id, examenId, titulo, usuarioId }) {
  setImmediate(async () => {
    try {
      const anio = await getAnioActivo(colegio_id);
      const audRows = await cargarAudiencias(examenId);
      const gids = await cargarGruposIds(examenId);
      await notificarExamenHerramientasActivado({
        colegio_id,
        examen_id: examenId,
        titulo,
        usuario_id_emisor: usuarioId,
        audiencias: audRows,
        grupo_ids: gids,
        anio
      });
      await notificarAdminsExamenActivado({
        colegio_id,
        examen_id: examenId,
        titulo,
        usuario_id_emisor: usuarioId
      });
    } catch (err) {
      console.error('[hex] notif activación', err);
    }
  });
}

/** Primera fila para modal tipo encuesta: activo, en audiencia/grupo, sin intento finalizado, sin marcar modal. */
async function buscarExamenHexModalPendiente(user, colegio_id) {
  const uident = user.usuario_id || user.id;
  const rows = await query(
    `SELECT e.* FROM herramientas_examenes e
     WHERE e.colegio_id = ? AND e.estado = 'ACTIVO'
       AND (e.fecha_inicio IS NULL OR DATE(e.fecha_inicio) <= CURDATE())
       AND (e.fecha_fin IS NULL OR DATE(e.fecha_fin) >= CURDATE())
       AND NOT EXISTS (
         SELECT 1 FROM herramientas_examenes_intentos i
         WHERE i.examen_id = e.id AND i.usuario_id = ? AND i.estado IN ('ENVIADO','CALIFICADO')
       )
       AND NOT EXISTS (
         SELECT 1 FROM herramientas_examenes_modal_visto m WHERE m.examen_id = e.id AND m.usuario_id = ?
       )
     ORDER BY e.id DESC`,
    [colegio_id, uident, uident]
  );
  for (const e of rows || []) {
    if (!examenVigente(e)) continue;
    try {
      if (await puedeVerExamen(user, colegio_id, e)) {
        return {
          id: e.id,
          titulo: e.titulo,
          descripcion: e.descripcion || null
        };
      }
    } catch (err) {
      console.warn('[hex] modal-pendiente fila', e.id, err.message);
    }
  }
  return null;
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
      : null,
    bloque_archivos_json: (() => {
      const list = normalizarBloqueArchivos(body.bloque_archivos ?? body.bloque_archivos_json);
      return list.length ? JSON.stringify(list) : null;
    })()
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
  if (tipo === 'RESPUESTA_CORTA' || tipo === 'COMPROMISO') {
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
    calificar_manualmente: row.calificar_manualmente === 1 || row.calificar_manualmente === true,
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
    calificar_manualmente: row.calificar_manualmente === 1 || row.calificar_manualmente === true,
    obligatoria: row.obligatoria !== 0 && row.obligatoria !== false,
    orden: row.orden
  };
}

function hexEsInformativo(row) {
  return row?.solo_informativo === 1 || row?.solo_informativo === true;
}

function hexEsCompromiso(row) {
  return String(row?.tipo || '').toUpperCase() === 'COMPROMISO';
}

/** Firma PNG data URL razonable (pad ~400x150). */
function hexFirmaDataUrlValida(s) {
  if (typeof s !== 'string') return false;
  if (!s.startsWith('data:image/png')) return false;
  if (s.length < 80 || s.length > 350000) return false;
  return true;
}

function hexEsCalificarManual(row) {
  if (hexEsInformativo(row)) return false;
  if (hexEsCompromiso(row)) return false;
  if (row?.calificar_manualmente === 1 || row?.calificar_manualmente === true) return true;
  const tipo = String(row?.tipo || '').toUpperCase();
  if (tipo === 'RESPUESTA_CORTA') return true;
  if (tipo === 'ALTERNATIVAS') {
    const o = typeof row?.opciones_json === 'string' ? parseJsonSafe(row.opciones_json) : row?.opciones_json;
    return !(o && typeof o.correcta === 'number');
  }
  if (tipo === 'VERDADERO_FALSO') {
    const o = typeof row?.opciones_json === 'string' ? parseJsonSafe(row.opciones_json) : row?.opciones_json;
    // Si viene flag explícito en JSON (sin clave correcta) — raro; preferimos columna
    return o && Object.prototype.hasOwnProperty.call(o, 'correcta') === false;
  }
  return false;
}

/** GENERAL → puntos_correcta del examen; INDIVIDUAL → puntos de la pregunta (fila). */
function puntosBasePorPregunta(ex, row) {
  const tipoP = String(ex.tipo_puntaje || 'GENERAL').toUpperCase();
  if (tipoP === 'GENERAL') {
    return Math.max(0, Number(ex.puntos_correcta) || 0);
  }
  return Math.max(0, Number(row.puntos) || 0);
}

function puntajeMaximoPregunta(ex, row) {
  if (hexEsCompromiso(row)) return 0;
  const exModo = String(ex.modo || 'MIXTO').toUpperCase();
  const base = puntosBasePorPregunta(ex, row);
  const inf = row.solo_informativo === 1 || row.solo_informativo === true;
  if (exModo === 'PRACTICA') return base;
  if (exModo === 'CALIFICADO') return inf ? 0 : base;
  return inf ? 0 : base;
}

function puntajeMaximoExamen(ex, preguntasRows) {
  let s = 0;
  for (const p of preguntasRows || []) {
    s += puntajeMaximoPregunta(ex, p);
  }
  return s;
}

/** Coherente con aula (AlumnoExamen): orden ALEATORIO baraja preguntas y alternativas por intento. */
function hexShuffleArray(arr) {
  const a = [...(arr || [])];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function hexOrdenAleatorio(ex) {
  return String(ex?.orden_preguntas || '')
    .toUpperCase()
    .trim() === 'ALEATORIO';
}

/** Elige preguntas del intento: si ALEATORIO baraja antes; aplica preguntas_max. */
function hexSeleccionarPreguntasParaIntento(ex, preguntasRows) {
  const aleatorio = hexOrdenAleatorio(ex);
  const maxP = Math.max(1, parseInt(ex?.preguntas_max, 10) || 1);
  let list = [...(preguntasRows || [])];
  if (aleatorio) {
    list = hexShuffleArray(list);
  }
  if (list.length > maxP) {
    list = list.slice(0, maxP);
  }
  return list;
}

function hexShuffleAlternativasRow(row) {
  const tipo = String(row.tipo || '').toUpperCase();
  if (tipo !== 'ALTERNATIVAS') return row;
  const o = parseJsonSafe(row.opciones_json);
  if (!o || !Array.isArray(o.opciones) || o.opciones.length < 2) return row;
  const n = o.opciones.length;
  const perm = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const newOpciones = perm.map((idx) => o.opciones[idx]);
  const newO = { ...o, opciones: newOpciones };
  if (typeof o.correcta === 'number') {
    newO.correcta = perm.indexOf(o.correcta);
  } else {
    delete newO.correcta;
  }
  return { ...row, opciones_json: JSON.stringify(newO) };
}

/** Baraja alternativas solo si el examen está en modo ALEATORIO (comportamiento aula). */
function hexAplicarAlternativasSiAleatorio(ex, row) {
  if (!hexOrdenAleatorio(ex)) return row;
  return hexShuffleAlternativasRow(row);
}

function hexBuildPresMeta(rowsShown) {
  const orden_ids = (rowsShown || []).map((r) => Number(r.id));
  const opciones_por_id = {};
  for (const r of rowsShown || []) {
    const tipo = String(r.tipo || '').toUpperCase();
    if (tipo === 'ALTERNATIVAS') {
      const o = parseJsonSafe(r.opciones_json);
      if (o) opciones_por_id[r.id] = o;
    }
  }
  return { v: 1, orden_ids, opciones_por_id };
}

function hexPreguntasDesdePresMeta(allRowsFromDb, meta) {
  if (!meta || !Array.isArray(meta.orden_ids) || meta.orden_ids.length === 0) return null;
  const map = new Map((allRowsFromDb || []).map((r) => [Number(r.id), r]));
  const opPorId = meta.opciones_por_id || {};
  const out = [];
  for (const rawId of meta.orden_ids) {
    const id = Number(rawId);
    const base = map.get(id);
    if (!base) continue;
    let row = { ...base };
    const ovl = opPorId[id] ?? opPorId[String(id)];
    if (ovl && typeof ovl === 'object') {
      row = { ...row, opciones_json: JSON.stringify(ovl) };
    }
    out.push(row);
  }
  return out;
}

function hexMergeBorradorPreservarMeta(prevJson, incomingBorrador) {
  const prev = parseJsonSafe(prevJson) || {};
  const inc = incomingBorrador && typeof incomingBorrador === 'object' ? incomingBorrador : {};
  const next = { ...prev, ...inc };
  if (prev._hex_pres) next._hex_pres = prev._hex_pres;
  return next;
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
         WHERE (g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?))
         AND g.colegio_id = ? AND g.anio = ?`,
        [personal_id, personal_id, colegio_id, anio]
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

/** Modal tipo encuesta: primera fila pendiente para el usuario autenticado. */
router.get('/modal-pendiente', authenticateToken, async (req, res) => {
  try {
    const ex = await buscarExamenHexModalPendiente(req.user, req.user.colegio_id);
    res.json({ success: true, examen: ex });
  } catch (err) {
    console.error('[hex] modal-pendiente', err);
    res.json({ success: true, examen: null });
  }
});

router.post('/modal-visto/:examenId', authenticateToken, async (req, res) => {
  try {
    const eid = parseInt(req.params.examenId, 10);
    const { colegio_id, usuario_id } = req.user;
    if (!eid) return res.status(400).json({ error: 'ID inválido' });
    await execute(
      `INSERT IGNORE INTO herramientas_examenes_modal_visto (usuario_id, examen_id, colegio_id) VALUES (?, ?, ?)`,
      [usuario_id, eid, colegio_id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[hex] modal-visto', err);
    res.status(500).json({ error: 'No se pudo registrar' });
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

/** Docente ya no gestiona exámenes institucionales (solo administración). */
router.post('/docente/subir-imagen', authenticateToken, requireDocente, (req, res) => {
  res.status(403).json({
    error: 'La creación y edición de exámenes de herramientas es solo para administración.'
  });
});

/**
 * POST /api/herramientas-examenes/admin/subir-pdf
 * PDF de referencia para el contexto del examen.
 */
router.post(
  '/admin/subir-pdf',
  authenticateToken,
  requireAdminOrPromotoria,
  (req, res, next) => {
    uploadHexEditorPdf.single('archivo')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || 'Archivo no válido' });
      next();
    });
  },
  (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No se envió el PDF' });
      const nombre =
        String(req.body?.nombre || req.file.originalname || 'Documento.pdf')
          .trim()
          .slice(0, 200) || 'Documento.pdf';
      res.json({
        url: urlHexPdfPublic(req.file.filename),
        nombre,
        size: req.file.size || null
      });
    } catch (e) {
      console.error('[hex] admin subir-pdf', e);
      res.status(500).json({ error: 'Error al subir PDF' });
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
    const pregAll = await query(
      `SELECT * FROM herramientas_examenes_preguntas WHERE examen_id = ? ORDER BY orden ASC, id ASC`,
      [id]
    );
    const sel = hexSeleccionarPreguntasParaIntento(ex, pregAll);
    const mostradas = (sel || []).map((r) => hexAplicarAlternativasSiAleatorio(ex, { ...r }));
    res.json({
      success: true,
      examen: {
        id: ex.id,
        titulo: ex.titulo,
        descripcion: ex.descripcion,
        mensaje_agradecimiento: ex.mensaje_agradecimiento,
        modo: ex.modo,
        intentos_max: ex.intentos_max,
        tipo_puntaje: ex.tipo_puntaje,
        puntos_correcta: ex.puntos_correcta,
        bloque_contenido: ex.bloque_contenido,
        bloque_imagen_url: ex.bloque_imagen_url,
        bloque_archivos: normalizarBloqueArchivos(ex.bloque_archivos_json)
      },
      preguntas: (mostradas || []).map(preguntaPublicaSinClaves),
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
    if (!ADMIN_TYPES.has(req.user.tipo)) return res.status(403).json({ error: 'No autorizado' });
    const pregAll = await query(
      `SELECT * FROM herramientas_examenes_preguntas WHERE examen_id = ? ORDER BY orden ASC, id ASC`,
      [id]
    );
    const sel = hexSeleccionarPreguntasParaIntento(ex, pregAll);
    const mostradas = (sel || []).map((r) => hexAplicarAlternativasSiAleatorio(ex, { ...r }));
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
        tipo_puntaje: ex.tipo_puntaje,
        puntos_correcta: ex.puntos_correcta,
        bloque_contenido: ex.bloque_contenido,
        bloque_imagen_url: ex.bloque_imagen_url,
        bloque_archivos: normalizarBloqueArchivos(ex.bloque_archivos_json)
      },
      preguntas: (mostradas || []).map(preguntaPublicaSinClaves),
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

  let oldEstado = null;
  if (!opts.insert && opts.examenId) {
    const pr = await query(`SELECT estado FROM herramientas_examenes WHERE id = ? AND colegio_id = ? LIMIT 1`, [
      opts.examenId,
      colegio_id
    ]);
    oldEstado = pr[0] ? String(pr[0].estado).toUpperCase() : null;
  }

  let examenId = opts.examenId;
  if (opts.insert) {
    const ins = await execute(
      `INSERT INTO herramientas_examenes
       (colegio_id, creador_usuario_id, titulo, descripcion, estado, modo, fecha_inicio, fecha_fin, mensaje_agradecimiento, intentos_max, mostrar_nota, escala_max,
        tiempo_minutos, tipo_puntaje, puntos_correcta, penalizar_incorrecta, penalizacion_incorrecta, orden_preguntas, preguntas_max, bloque_contenido, bloque_imagen_url, bloque_archivos_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        params.bloque_imagen_url,
        params.bloque_archivos_json
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
         tiempo_minutos=?, tipo_puntaje=?, puntos_correcta=?, penalizar_incorrecta=?, penalizacion_incorrecta=?, orden_preguntas=?, preguntas_max=?, bloque_contenido=?, bloque_imagen_url=?, bloque_archivos_json=?
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
          params.bloque_archivos_json,
          examenId,
          colegio_id
        ]
      );
      if (params.estado === 'ACTIVO' && oldEstado !== 'ACTIVO') {
        scheduleHexActivacionNotifs({ colegio_id, examenId, titulo: params.titulo, usuarioId });
      }
      return res.json({ success: true, id: examenId, soloMetadatos: true });
    }
    await execute(
      `UPDATE herramientas_examenes SET titulo=?, descripcion=?, estado=?, modo=?, fecha_inicio=?, fecha_fin=?, mensaje_agradecimiento=?, intentos_max=?, mostrar_nota=?, escala_max=?,
       tiempo_minutos=?, tipo_puntaje=?, puntos_correcta=?, penalizar_incorrecta=?, penalizacion_incorrecta=?, orden_preguntas=?, preguntas_max=?, bloque_contenido=?, bloque_imagen_url=?, bloque_archivos_json=?
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
        params.bloque_archivos_json,
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
  /* Inserción de preguntas: modelo distinto al aula (docente usa tabla de alternativas por fila);
   * aquí todo va en opciones_json. El guardado SQL debe seguir el patrón docente para JSON: ? + string. */
  for (const p of plist) {
    const texto = String(p.texto || '');
    const tipo = String(p.tipo || 'ALTERNATIVAS').toUpperCase();
    if (!textoPreguntaNoVacio(texto)) continue;
    if (!['ALTERNATIVAS', 'VERDADERO_FALSO', 'RESPUESTA_CORTA', 'COMPROMISO'].includes(tipo)) continue;
    const esCompromiso = tipo === 'COMPROMISO';
    const puntos = hexEsInformativo(p) || esCompromiso ? 0 : Math.max(0, Number(p.puntos) || 0);
    const soloInf = esCompromiso ? 0 : p.solo_informativo ? 1 : 0;
    const calManual =
      soloInf || esCompromiso || String(tipo).toUpperCase() === 'RESPUESTA_CORTA'
        ? 0
        : p.calificar_manualmente
          ? 1
          : 0;
    const oblig = soloInf ? 0 : esCompromiso ? 1 : p.obligatoria !== false ? 1 : 0;
    let opciones_json = JSON.stringify(p.opciones || {});
    if (tipo === 'ALTERNATIVAS') {
      const op = p.opciones || {};
      const opts = Array.isArray(op.opciones) ? op.opciones : ['A', 'B', 'C', 'D'];
      const payload = { opciones: opts };
      if (typeof op.correcta === 'number' && !Number.isNaN(op.correcta)) {
        payload.correcta = op.correcta;
      }
      opciones_json = JSON.stringify(payload);
    }
    if (tipo === 'VERDADERO_FALSO') {
      const op = p.opciones || {};
      if (calManual && op.correcta !== true && op.correcta !== false) {
        opciones_json = JSON.stringify({});
      } else if (calManual) {
        opciones_json = JSON.stringify({ correcta: op.correcta === false ? false : true });
      } else {
        opciones_json = JSON.stringify({ correcta: op.correcta === false ? false : true });
      }
    }
    if (tipo === 'RESPUESTA_CORTA' || tipo === 'COMPROMISO') {
      opciones_json = JSON.stringify({});
    }
    await execute(
      `INSERT INTO herramientas_examenes_preguntas (examen_id, orden, texto, tipo, opciones_json, puntos, solo_informativo, calificar_manualmente, obligatoria)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [examenId, ord, texto, tipo, opciones_json, puntos, soloInf, calManual, oblig]
    );
    ord += 1;
  }

  if (params.estado === 'ACTIVO' && (opts.insert || oldEstado !== 'ACTIVO')) {
    scheduleHexActivacionNotifs({ colegio_id, examenId, titulo: params.titulo, usuarioId });
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
    try {
      await execute(`DELETE FROM herramientas_examenes_modal_visto WHERE examen_id = ?`, [id]);
    } catch (e) {
      if (e && String(e.code) !== 'ER_NO_SUCH_TABLE') console.warn('[hex] delete modal_visto', e.message);
    }
    await execute(`DELETE FROM herramientas_examenes WHERE id = ? AND colegio_id = ?`, [id, colegio_id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[hex] admin delete', err);
    res.status(500).json({ error: 'Error al eliminar' });
  }
});

// ---------- Docente: deshabilitado (gestión solo administración) ----------

router.get('/docente/lista', authenticateToken, requireDocenteOPsicologa, (req, res) => {
  res.status(403).json({
    error: 'La creación y gestión de exámenes de herramientas es solo para administración.'
  });
});

router.get('/docente/:id', authenticateToken, requireDocenteOPsicologa, (req, res) => {
  res.status(403).json({
    error: 'La creación y gestión de exámenes de herramientas es solo para administración.'
  });
});

router.post('/docente', authenticateToken, requireDocente, (req, res) => {
  res.status(403).json({
    error: 'La creación y gestión de exámenes de herramientas es solo para administración.'
  });
});

router.put('/docente/:id', authenticateToken, requireDocente, (req, res) => {
  res.status(403).json({
    error: 'La creación y gestión de exámenes de herramientas es solo para administración.'
  });
});

router.delete('/docente/:id', authenticateToken, requireDocente, (req, res) => {
  res.status(403).json({
    error: 'La creación y gestión de exámenes de herramientas es solo para administración.'
  });
});

function hexTextoPlanoPreview(html, maxLen = 100) {
  const t = String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return '(sin texto)';
  return t.length > maxLen ? `${t.slice(0, maxLen)}…` : t;
}

/** @returns {true|false|null} null = no autoevaluable (texto, manual, informativo, sin clave) */
function hexEvaluarCorrectitud(tipo, opciones_json, respuesta_json, rowMeta = null) {
  if (rowMeta && hexEsInformativo(rowMeta)) return null;
  if (rowMeta && hexEsCompromiso(rowMeta)) return null;
  if (rowMeta && hexEsCalificarManual(rowMeta)) return null;
  const tipoU = String(tipo || '').toUpperCase();
  if (tipoU === 'COMPROMISO') return null;
  const o = parseJsonSafe(opciones_json) || {};
  let r = respuesta_json;
  if (typeof r === 'string') r = parseJsonSafe(r) || {};
  if (tipoU === 'ALTERNATIVAS') {
    if (r == null || r.indice == null || typeof o.correcta !== 'number') return null;
    return Number(r.indice) === Number(o.correcta);
  }
  if (tipoU === 'VERDADERO_FALSO') {
    if (!Object.prototype.hasOwnProperty.call(o, 'correcta')) return null;
    const correcta = o.correcta === false ? false : true;
    if (r == null || (r.valor !== true && r.valor !== false)) return null;
    return r.valor === correcta;
  }
  return null;
}

function hexConstruirEstadisticasAgregadas(preguntasRows, lineasRows, intentosRows, puntajeMaxExamen) {
  const pregMap = new Map((preguntasRows || []).map((p) => [p.id, p]));
  const byPreg = new Map();
  for (const p of preguntasRows || []) {
    byPreg.set(p.id, {
      pregunta_id: p.id,
      orden: p.orden,
      tipo: String(p.tipo || '').toUpperCase(),
      texto_preview: hexTextoPlanoPreview(p.texto, 90),
      n: 0,
      correctas: 0,
      incorrectas: 0,
      pendientes_revision: 0,
      texto_calificadas: 0,
      suma_puntos_texto: 0
    });
  }

  for (const L of lineasRows || []) {
    const pid = L.pregunta_id;
    const st = byPreg.get(pid);
    if (!st) continue;
    st.n += 1;
    const tipo = String(L.pregunta_tipo || L.tipo || '').toUpperCase();
    const opc = L.pregunta_opciones != null ? L.pregunta_opciones : L.opciones_json;
    const meta = pregMap.get(pid) || {
      tipo,
      opciones_json: opc,
      solo_informativo: L.pregunta_solo_informativo,
      calificar_manualmente: L.pregunta_calificar_manualmente,
      puntos: L.pregunta_puntos
    };
    if (hexEsInformativo(meta)) continue;
    const ok = hexEvaluarCorrectitud(tipo, opc, L.respuesta_json, meta);
    if (ok === true) st.correctas += 1;
    else if (ok === false) st.incorrectas += 1;
    else {
      const req = L.requiere_revision === 1 || L.requiere_revision === true;
      if (req) st.pendientes_revision += 1;
      else {
        st.texto_calificadas += 1;
        st.suma_puntos_texto += Number(L.puntos_otorgados) || 0;
      }
    }
  }

  const preguntasResumen = [];
  for (const st of byPreg.values()) {
    const autoTotal = st.correctas + st.incorrectas;
    let porcentaje_acierto = null;
    if (autoTotal > 0) {
      porcentaje_acierto = Math.round((100 * st.correctas) / autoTotal);
    }
    const promedio_texto =
      st.texto_calificadas > 0
        ? Math.round((100 * st.suma_puntos_texto) / st.texto_calificadas) / 100
        : null;
    preguntasResumen.push({
      ...st,
      porcentaje_acierto,
      promedio_puntos_texto: promedio_texto
    });
  }
  preguntasResumen.sort((a, b) => (a.orden || 0) - (b.orden || 0));

  const masEquivocadas = [...preguntasResumen]
    .filter((p) => p.porcentaje_acierto != null && p.correctas + p.incorrectas > 0)
    .sort((a, b) => (a.porcentaje_acierto ?? 100) - (b.porcentaje_acierto ?? 100))
    .slice(0, 8);
  const mejorRespondidas = [...preguntasResumen]
    .filter((p) => p.porcentaje_acierto != null && p.correctas + p.incorrectas > 0)
    .sort((a, b) => (b.porcentaje_acierto ?? 0) - (a.porcentaje_acierto ?? 0))
    .slice(0, 8);

  const buckets = [0, 0, 0, 0];
  const puntajes = [];
  for (const row of intentosRows || []) {
    if (row.puntaje_obtenido == null) continue;
    const max = Number(row.puntaje_max_snapshot) || puntajeMaxExamen || 1;
    const obt = Number(row.puntaje_obtenido);
    if (Number.isNaN(obt)) continue;
    puntajes.push(obt);
    const ratio = max > 0 ? Math.max(0, Math.min(1, obt / max)) : 0;
    const idx = ratio < 0.25 ? 0 : ratio < 0.5 ? 1 : ratio < 0.75 ? 2 : 3;
    buckets[idx] += 1;
  }
  puntajes.sort((a, b) => a - b);
  const nP = puntajes.length;
  const promedio =
    nP > 0 ? Math.round((100 * puntajes.reduce((s, x) => s + x, 0)) / nP) / 100 : null;
  let mediana = null;
  if (nP > 0) {
    mediana =
      nP % 2 === 1
        ? puntajes[(nP - 1) / 2]
        : (puntajes[nP / 2 - 1] + puntajes[nP / 2]) / 2;
    mediana = Math.round(mediana * 100) / 100;
  }

  return {
    distribucion_rangos: {
      labels: ['0–25%', '25–50%', '50–75%', '75–100%'],
      counts: buckets,
      descripcion: 'Respecto al puntaje máximo de cada intento'
    },
    promedio_puntaje: promedio,
    mediana_puntaje: mediana,
    n_con_puntaje: nP,
    preguntas_resumen: preguntasResumen,
    mas_equivocadas: masEquivocadas,
    mejor_respondidas: mejorRespondidas
  };
}

// ---------- Estadísticas (admin / promotoría) ----------

async function puedeGestionarEstadisticas(req, examenId) {
  const { colegio_id } = req.user;
  const ex = await assertExamenColegio(examenId, colegio_id);
  if (!ex) return null;
  if (ADMIN_TYPES.has(req.user.tipo)) return ex;
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
              u.usuario AS login_usuario,
              COALESCE(
                NULLIF(TRIM(CONCAT(COALESCE(a.nombres,''), ' ', COALESCE(a.apellido_paterno,''), ' ', COALESCE(a.apellido_materno,''))), ''),
                NULLIF(TRIM(CONCAT(COALESCE(p.nombres,''), ' ', COALESCE(p.apellidos,''))), ''),
                NULLIF(TRIM(CONCAT(COALESCE(ap.nombres,''), ' ', COALESCE(ap.apellido_paterno,''), ' ', COALESCE(ap.apellido_materno,''))), ''),
                u.usuario
              ) AS nombre_mostrar
       FROM herramientas_examenes_intentos i
       LEFT JOIN usuarios u ON u.id = i.usuario_id
       LEFT JOIN alumnos a ON a.id = u.alumno_id
       LEFT JOIN personal p ON p.id = u.personal_id
       LEFT JOIN apoderados ap ON ap.id = u.apoderado_id
       WHERE i.examen_id = ? AND i.estado IN ('ENVIADO','CALIFICADO')
       ORDER BY i.puntaje_obtenido IS NULL, i.puntaje_obtenido DESC, i.fecha_envio DESC, i.id DESC
       LIMIT 500`,
      [id]
    );

    const preguntas = await query(
      `SELECT id, texto, tipo, puntos, solo_informativo FROM herramientas_examenes_preguntas WHERE examen_id = ? ORDER BY orden`,
      [id]
    );
    const puntajeMaxCfg = puntajeMaximoExamen(ex, preguntas || []);

    const lineasAgg = await query(
      `SELECT d.pregunta_id, d.respuesta_json, d.puntos_otorgados, d.requiere_revision,
              p.tipo AS pregunta_tipo, p.opciones_json AS pregunta_opciones, p.orden, p.texto
       FROM herramientas_examenes_respuestas_linea d
       INNER JOIN herramientas_examenes_intentos i ON i.id = d.intento_id
       INNER JOIN herramientas_examenes_preguntas p ON p.id = d.pregunta_id
       WHERE i.examen_id = ? AND i.estado IN ('ENVIADO','CALIFICADO')`,
      [id]
    );

    const estadisticas_agregadas = hexConstruirEstadisticasAgregadas(
      preguntas || [],
      lineasAgg || [],
      intentos || [],
      puntajeMaxCfg
    );

    res.json({
      success: true,
      examen: {
        id: ex.id,
        titulo: ex.titulo,
        modo: ex.modo,
        tipo_puntaje: ex.tipo_puntaje,
        puntos_correcta: ex.puntos_correcta
      },
      puntaje_max_examen: puntajeMaxCfg,
      totalIntentos: total[0]?.c || 0,
      pendientesRevision: pendientes[0]?.c || 0,
      intentos: intentos || [],
      preguntas: preguntas || [],
      estadisticas_agregadas
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
      `SELECT d.*, p.texto AS pregunta_texto, p.tipo AS pregunta_tipo, p.opciones_json AS pregunta_opciones,
              p.solo_informativo AS pregunta_solo_informativo, p.calificar_manualmente AS pregunta_calificar_manualmente, p.puntos AS pregunta_puntos
       FROM herramientas_examenes_respuestas_linea d
       INNER JOIN herramientas_examenes_preguntas p ON p.id = d.pregunta_id
       WHERE d.intento_id = ?
       ORDER BY p.orden`,
      [intentoId]
    );
    res.json({
      success: true,
      intento: ir[0],
      lineas: lineas || [],
      examen: {
        modo: ex.modo,
        tipo_puntaje: ex.tipo_puntaje,
        puntos_correcta: ex.puntos_correcta
      }
    });
  } catch (err) {
    console.error('[hex] intento detalle', err);
    res.status(500).json({ error: 'Error' });
  }
});

/** Elimina un intento enviado/calificado y sus respuestas (CASCADE). El usuario puede volver a intentar según intentos_max. */
router.delete('/gestion/:id/intento/:intentoId', authenticateToken, async (req, res) => {
  try {
    const examenId = parseInt(req.params.id, 10);
    const intentoId = parseInt(req.params.intentoId, 10);
    const { colegio_id } = req.user;
    const ex = await puedeGestionarEstadisticas(req, examenId);
    if (!ex) return res.status(403).json({ error: 'No autorizado' });

    const result = await execute(
      `DELETE FROM herramientas_examenes_intentos
       WHERE id = ? AND examen_id = ? AND colegio_id = ? AND estado IN ('ENVIADO','CALIFICADO')`,
      [intentoId, examenId, colegio_id]
    );
    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Intento no encontrado o no se puede eliminar' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[hex] eliminar intento gestión', err);
    res.status(500).json({ error: 'Error al eliminar el intento' });
  }
});

router.put('/gestion/:id/intento/:intentoId/revision', authenticateToken, async (req, res) => {
  try {
    const examenId = parseInt(req.params.id, 10);
    const intentoId = parseInt(req.params.intentoId, 10);
    const ex = await puedeGestionarEstadisticas(req, examenId);
    if (!ex) return res.status(403).json({ error: 'No autorizado' });

    const antesRows = await query(
      `SELECT estado, usuario_id FROM herramientas_examenes_intentos WHERE id = ? AND examen_id = ? LIMIT 1`,
      [intentoId, examenId]
    );
    const estadoAntes = antesRows && antesRows[0] ? String(antesRows[0].estado) : null;
    const usuarioParticipante = antesRows && antesRows[0] ? antesRows[0].usuario_id : null;

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
    const preguntasEx = await query(
      `SELECT * FROM herramientas_examenes_preguntas WHERE examen_id = ? ORDER BY orden ASC, id ASC`,
      [examenId]
    );
    const maxSnap = puntajeMaximoExamen(ex, preguntasEx || []);
    await execute(
      `UPDATE herramientas_examenes_intentos SET puntaje_obtenido = ?, estado = ?, puntaje_max_snapshot = ? WHERE id = ?`,
      [sum[0]?.s ?? 0, nuevoEstado, maxSnap, intentoId]
    );

    const puntajeFinal = sum[0]?.s ?? 0;
    if (
      estadoAntes === 'ENVIADO' &&
      nuevoEstado === 'CALIFICADO' &&
      usuarioParticipante &&
      Number(usuarioParticipante) > 0
    ) {
      const { colegio_id } = req.user;
      setImmediate(() => {
        notificarUsuarioExamenRevisadoCalificado({
          colegio_id,
          usuario_id_dest: Number(usuarioParticipante),
          examen_id: examenId,
          titulo: ex.titulo,
          puntaje_obtenido: puntajeFinal,
          puntaje_max: maxSnap,
          mostrar_nota: ex.mostrar_nota
        }).catch((e) => console.error('[hex] notif revisado', e));
      });
    }

    res.json({ success: true, puntaje_obtenido: puntajeFinal, estado: nuevoEstado });
  } catch (err) {
    console.error('[hex] revision', err);
    res.status(500).json({ error: 'Error al guardar revisión' });
  }
});

/** Recalcula puntos de líneas autoevaluables y totales según configuración actual del examen (útil tras cambiar GENERAL/puntos_correcta). */
router.post('/gestion/:id/recalcular-puntos', authenticateToken, async (req, res) => {
  try {
    const examenId = parseInt(req.params.id, 10);
    const ex = await puedeGestionarEstadisticas(req, examenId);
    if (!ex) return res.status(403).json({ error: 'No autorizado' });
    const preguntas = await query(
      `SELECT * FROM herramientas_examenes_preguntas WHERE examen_id = ? ORDER BY orden ASC, id ASC`,
      [examenId]
    );
    const mapP = new Map((preguntas || []).map((p) => [p.id, p]));
    const intentosRows = await query(
      `SELECT id FROM herramientas_examenes_intentos WHERE examen_id = ? AND estado IN ('ENVIADO','CALIFICADO')`,
      [examenId]
    );
    let n = 0;
    for (const it of intentosRows || []) {
      const intentoId = it.id;
      const lineas = await query(`SELECT * FROM herramientas_examenes_respuestas_linea WHERE intento_id = ?`, [intentoId]);
      for (const d of lineas || []) {
        const p = mapP.get(d.pregunta_id);
        if (!p) continue;
        const tipo = String(p.tipo || '').toUpperCase();
        const rj = parseJsonSafe(d.respuesta_json) || {};
        const o = parseJsonSafe(p.opciones_json) || {};
        const maxLocal = puntajeMaximoPregunta(ex, p);
        let pts = 0;
        if (tipo === 'ALTERNATIVAS') {
          const ok = typeof o.correcta === 'number' && rj && Number(rj.indice) === Number(o.correcta);
          pts = ok ? maxLocal : 0;
        } else if (tipo === 'VERDADERO_FALSO') {
          const ok = rj && (rj.valor === true || rj.valor === false) && rj.valor === !!o.correcta;
          pts = ok ? maxLocal : 0;
        } else if (tipo === 'RESPUESTA_CORTA') {
          if (d.requiere_revision === 1 || d.requiere_revision === true) pts = 0;
          else pts = d.puntos_otorgados != null ? Number(d.puntos_otorgados) : 0;
        }
        await execute(
          `UPDATE herramientas_examenes_respuestas_linea SET puntos_otorgados = ? WHERE id = ? AND intento_id = ?`,
          [pts, d.id, intentoId]
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
      const maxSnap = puntajeMaximoExamen(ex, preguntas || []);
      await execute(
        `UPDATE herramientas_examenes_intentos SET puntaje_obtenido = ?, puntaje_max_snapshot = ?, estado = ? WHERE id = ?`,
        [sum[0]?.s ?? 0, maxSnap, nuevoEstado, intentoId]
      );
      n += 1;
    }
    res.json({ success: true, intentos_actualizados: n, puntaje_max_examen: puntajeMaximoExamen(ex, preguntas || []) });
  } catch (err) {
    console.error('[hex] recalcular-puntos', err);
    res.status(500).json({ error: 'Error al recalcular' });
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
      if (!examenVisibleProximos(e)) continue;
      if (!(await puedeVerExamen(user, colegio_id, e))) continue;
      const aud = await cargarAudiencias(e.id);
      const vigenteAhora = examenVigente(e);
      const intentosHechos = await query(
        `SELECT COUNT(*) AS c FROM herramientas_examenes_intentos WHERE examen_id = ? AND usuario_id = ? AND estado IN ('ENVIADO','CALIFICADO')`,
        [e.id, uid(req)]
      );
      const maxI = e.intentos_max || 1;
      const puedeOtro = vigenteAhora && (intentosHechos[0]?.c || 0) < maxI;
      const ult = await query(
        `SELECT id, estado, puntaje_obtenido, puntaje_max_snapshot, fecha_envio
         FROM herramientas_examenes_intentos
         WHERE examen_id = ? AND usuario_id = ? AND estado IN ('ENVIADO','CALIFICADO')
         ORDER BY fecha_envio DESC, id DESC
         LIMIT 1`,
        [e.id, uid(req)]
      );
      const urow = ult && ult[0] ? ult[0] : null;
      out.push({
        id: e.id,
        titulo: e.titulo,
        descripcion: e.descripcion,
        modo: e.modo,
        fecha_inicio: e.fecha_inicio || null,
        fecha_fin: e.fecha_fin || null,
        vigente_ahora: vigenteAhora,
        intentos_max: maxI,
        intentos_usados: intentosHechos[0]?.c || 0,
        puede_intentar: puedeOtro,
        audiencias: aud.map((a) => a.tipo),
        mostrar_nota: e.mostrar_nota || 'AL_ENVIAR',
        escala_max: e.escala_max,
        ultimo_intento: urow
          ? {
              id: urow.id,
              estado: urow.estado,
              puntaje_obtenido: urow.puntaje_obtenido,
              puntaje_max_snapshot: urow.puntaje_max_snapshot,
              fecha_envio: urow.fecha_envio
            }
          : null
      });
    }
    res.json({ success: true, examenes: out, anio_activo: anio });
  } catch (err) {
    console.error('[hex] mis-disponibles', err);
    res.status(500).json({ error: 'Error al listar' });
  }
});

/** Último intento enviado/calificado del usuario: detalle para ver respuestas y corrección (solo lectura). */
router.get('/mi-resultado/:examenId', authenticateToken, async (req, res) => {
  try {
    const examenId = parseInt(req.params.examenId, 10);
    const user = req.user;
    const { colegio_id } = user;
    const ex = await assertExamenColegio(examenId, colegio_id);
    if (!ex) return res.status(404).json({ error: 'No encontrado' });
    if (!(await puedeVerExamen(user, colegio_id, ex))) return res.status(403).json({ error: 'No autorizado' });

    const ir = await query(
      `SELECT * FROM herramientas_examenes_intentos
       WHERE examen_id = ? AND usuario_id = ? AND estado IN ('ENVIADO','CALIFICADO')
       ORDER BY fecha_envio DESC, id DESC
       LIMIT 1`,
      [examenId, uid(req)]
    );
    if (!ir || !ir[0]) return res.status(404).json({ error: 'No hay resultado aún' });

    const intentoId = ir[0].id;
    const lineas = await query(
      `SELECT d.*, p.texto AS pregunta_texto, p.tipo AS pregunta_tipo, p.opciones_json AS pregunta_opciones,
              p.solo_informativo AS pregunta_solo_informativo, p.calificar_manualmente AS pregunta_calificar_manualmente, p.puntos AS pregunta_puntos
       FROM herramientas_examenes_respuestas_linea d
       INNER JOIN herramientas_examenes_preguntas p ON p.id = d.pregunta_id
       WHERE d.intento_id = ?
       ORDER BY p.orden`,
      [intentoId]
    );
    res.json({
      success: true,
      intento: ir[0],
      lineas: lineas || [],
      examen: {
        id: ex.id,
        titulo: ex.titulo,
        modo: ex.modo,
        tipo_puntaje: ex.tipo_puntaje,
        puntos_correcta: ex.puntos_correcta,
        mostrar_nota: ex.mostrar_nota
      }
    });
  } catch (err) {
    console.error('[hex] mi-resultado', err);
    res.status(500).json({ error: 'Error' });
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
      [examenId, uid(req)]
    );
    if (enCurso && enCurso[0]) {
      const pregAll = await query(
        `SELECT * FROM herramientas_examenes_preguntas WHERE examen_id = ? ORDER BY orden ASC, id ASC`,
        [examenId]
      );
      const borrador = parseJsonSafe(enCurso[0].borrador_json);
      let filas = hexPreguntasDesdePresMeta(pregAll, borrador?._hex_pres);
      if (!filas || filas.length === 0) {
        filas = pregAll || [];
      }
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
          bloque_imagen_url: ex.bloque_imagen_url,
          bloque_archivos: normalizarBloqueArchivos(ex.bloque_archivos_json)
        },
        preguntas: (filas || []).map(preguntaPublicaSinClaves)
      });
    }

    const hechos = await query(
      `SELECT COUNT(*) AS c FROM herramientas_examenes_intentos WHERE examen_id = ? AND usuario_id = ? AND estado IN ('ENVIADO','CALIFICADO')`,
      [examenId, uid(req)]
    );
    if ((hechos[0]?.c || 0) >= (ex.intentos_max || 1)) {
      return res.status(400).json({ error: 'Agotaste los intentos permitidos' });
    }

    const n = (hechos[0]?.c || 0) + 1;
    const ins = await execute(
      `INSERT INTO herramientas_examenes_intentos
       (examen_id, colegio_id, usuario_id, rol_respondiente, alumno_id, numero_intento, estado, borrador_json)
       VALUES (?, ?, ?, ?, ?, ?, 'EN_CURSO', NULL)`,
      [examenId, colegio_id, uid(req), tipo, alumno_id || null, n]
    );
    const intentoId = ins.insertId;
    const pregAll = await query(
      `SELECT * FROM herramientas_examenes_preguntas WHERE examen_id = ? ORDER BY orden ASC, id ASC`,
      [examenId]
    );
    const seleccionadas = hexSeleccionarPreguntasParaIntento(ex, pregAll);
    const mostradas = seleccionadas.map((r) => hexAplicarAlternativasSiAleatorio(ex, { ...r }));
    const meta = hexBuildPresMeta(mostradas);
    await execute(`UPDATE herramientas_examenes_intentos SET borrador_json = ? WHERE id = ?`, [
      JSON.stringify({ _hex_pres: meta }),
      intentoId
    ]);
    const row = await query(`SELECT * FROM herramientas_examenes_intentos WHERE id = ?`, [intentoId]);
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
        bloque_imagen_url: ex.bloque_imagen_url,
        bloque_archivos: normalizarBloqueArchivos(ex.bloque_archivos_json)
      },
      preguntas: (mostradas || []).map(preguntaPublicaSinClaves)
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
    if (Number(ir[0].usuario_id) !== Number(uid(req))) return res.status(403).json({ error: 'No autorizado' });
    if (ir[0].estado !== 'EN_CURSO') return res.status(400).json({ error: 'Este intento ya fue enviado' });
    const merged = hexMergeBorradorPreservarMeta(ir[0].borrador_json, borrador);
    await execute(`UPDATE herramientas_examenes_intentos SET borrador_json = ? WHERE id = ?`, [
      JSON.stringify(merged),
      intentoId
    ]);
    res.json({ success: true });
  } catch (err) {
    console.error('[hex] borrador', err);
    res.status(500).json({ error: 'Error al guardar borrador' });
  }
});

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
    if (Number(ir[0].usuario_id) !== Number(uid(req))) return res.status(403).json({ error: 'No autorizado' });
    if (ir[0].estado !== 'EN_CURSO') return res.status(400).json({ error: 'Este intento ya fue enviado' });

    const examenId = ir[0].examen_id;
    const ex = await assertExamenColegio(examenId, colegio_id);
    if (!examenVigente(ex)) return res.status(400).json({ error: 'Examen cerrado' });

    const borradorInt = parseJsonSafe(ir[0].borrador_json) || {};
    const allPreguntasDb = await query(
      `SELECT * FROM herramientas_examenes_preguntas WHERE examen_id = ? ORDER BY orden ASC, id ASC`,
      [examenId]
    );
    let preguntas = hexPreguntasDesdePresMeta(allPreguntasDb, borradorInt._hex_pres);
    if (!preguntas || preguntas.length === 0) {
      preguntas = allPreguntasDb || [];
    }
    const mapR = {};
    if (Array.isArray(respuestas)) {
      for (const r of respuestas) {
        if (r && r.pregunta_id != null) mapR[Number(r.pregunta_id)] = r;
      }
    }

    for (const p of preguntas || []) {
      if (hexEsInformativo(p)) continue;
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
      } else if (tipo === 'COMPROMISO') {
        if (rr.aceptado !== true) {
          return res.status(400).json({ error: 'Debe aceptar la declaración de compromiso' });
        }
        if (!hexFirmaDataUrlValida(rr.firma_data_url)) {
          return res.status(400).json({ error: 'Debe firmar en el recuadro de firma' });
        }
      }
    }

    let puntajeMax = 0;
    for (const p of preguntas || []) {
      puntajeMax += puntajeMaximoPregunta(ex, p);
    }

    await execute(`DELETE FROM herramientas_examenes_respuestas_linea WHERE intento_id = ?`, [intentoId]);

    let puntajeParcial = 0;
    let necesitaRevision = false;

    for (const p of preguntas || []) {
      const tipo = String(p.tipo || '').toUpperCase();
      const rr = mapR[p.id];
      const o = parseJsonSafe(p.opciones_json) || {};
      const maxLocal = puntajeMaximoPregunta(ex, p);
      let pts = null;
      let reqRev = false;
      let rj = {};

      if (hexEsInformativo(p)) {
        continue;
      }

      if (tipo === 'COMPROMISO') {
        rj = {
          aceptado: rr?.aceptado === true,
          firma_data_url: hexFirmaDataUrlValida(rr?.firma_data_url) ? rr.firma_data_url : null
        };
        pts = 0;
        reqRev = false;
      } else if (hexEsCalificarManual(p) || tipo === 'RESPUESTA_CORTA') {
        if (tipo === 'ALTERNATIVAS') rj = { indice: rr?.indice };
        else if (tipo === 'VERDADERO_FALSO') rj = { valor: rr?.valor };
        else rj = { texto: rr?.texto ?? '' };
        reqRev = maxLocal > 0;
        pts = 0;
        if (reqRev) necesitaRevision = true;
      } else if (tipo === 'ALTERNATIVAS') {
        rj = { indice: rr?.indice };
        const ok = typeof o.correcta === 'number' && rr && Number(rr.indice) === Number(o.correcta);
        pts = ok ? maxLocal : 0;
        puntajeParcial += pts;
      } else if (tipo === 'VERDADERO_FALSO') {
        rj = { valor: rr?.valor };
        const ok =
          Object.prototype.hasOwnProperty.call(o, 'correcta') &&
          rr &&
          (rr.valor === true || rr.valor === false) &&
          rr.valor === !!o.correcta;
        pts = ok ? maxLocal : 0;
        puntajeParcial += pts;
      }

      await execute(
        `INSERT INTO herramientas_examenes_respuestas_linea (intento_id, pregunta_id, respuesta_json, puntos_otorgados, requiere_revision, comentario_docente)
         VALUES (?, ?, ?, ?, ?, NULL)`,
        [intentoId, p.id, JSON.stringify(rj), pts, reqRev ? 1 : 0]
      );
    }

    const estadoFinal = necesitaRevision ? 'ENVIADO' : 'CALIFICADO';
    await execute(
      `UPDATE herramientas_examenes_intentos SET estado = ?, fecha_envio = NOW(), puntaje_obtenido = ?, puntaje_max_snapshot = ?, borrador_json = NULL WHERE id = ?`,
      [estadoFinal, puntajeParcial, puntajeMax, intentoId]
    );

    const uidRespond = uid(req);
    const tituloEx = ex.titulo || 'Examen';
    const mostrarN = ex.mostrar_nota || 'AL_ENVIAR';
    setImmediate(async () => {
      try {
        const nombre = await obtenerNombreMostrarUsuario(uidRespond);
        await notificarUsuarioExamenEnviado({
          colegio_id,
          usuario_id_dest: uidRespond,
          examen_id: examenId,
          titulo: tituloEx,
          puntaje_obtenido: puntajeParcial,
          puntaje_max: puntajeMax,
          mostrar_nota: mostrarN,
          estado_intento: estadoFinal
        });
        await notificarAdminsExamenCompletado({
          colegio_id,
          examen_id: examenId,
          titulo: tituloEx,
          usuario_respondedor_id: uidRespond,
          nombre_respondedor: nombre,
          puntaje_obtenido: puntajeParcial,
          puntaje_max: puntajeMax,
          estado_intento: estadoFinal
        });
      } catch (nerr) {
        console.error('[hex] notif enviar', nerr);
      }
    });

    res.json({
      success: true,
      estado: estadoFinal,
      puntaje_obtenido: puntajeParcial,
      puntaje_max: puntajeMax,
      mostrar_nota: ex.mostrar_nota || 'AL_ENVIAR',
      requiere_revision_docente: necesitaRevision,
      mensaje: ex.mensaje_agradecimiento || 'Gracias por tu participación.'
    });
  } catch (err) {
    console.error('[hex] enviar', err);
    res.status(500).json({ error: 'Error al enviar respuestas' });
  }
});

module.exports = router;
