/**
 * Extra de ficha alumno: salud (columnas existentes), contactos emergencia, documentos PDF.
 */
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { query, execute } = require('./mysql');

const ALUMNO_DOCS_ROOT = path.join(__dirname, '../uploads/alumno-docs');
const TIPOS_DOC = new Set(['VACUNA', 'CERTIFICADO_MEDICO', 'OTRO']);

/** Índices alineados a uso típico en ficha (0 = no especificado). */
const TIPO_SANGRE_LABELS = {
  0: 'No especificado',
  1: 'A+',
  2: 'A-',
  3: 'B+',
  4: 'B-',
  5: 'AB+',
  6: 'AB-',
  7: 'O+',
  8: 'O-'
};

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function dirAlumnoDocs(colegioId) {
  const dir = path.join(ALUMNO_DOCS_ROOT, String(colegioId));
  ensureDir(dir);
  return dir;
}

function urlAlumnoDocPublic(colegioId, filename) {
  const name = String(filename || '').replace(/^\/+/, '');
  const pathPart = `/uploads/alumno-docs/${colegioId}/${name}`;
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

function pickSaludFields(row) {
  if (!row) return {};
  const tipo = row.tipo_sangre != null ? parseInt(row.tipo_sangre, 10) : 0;
  return {
    alergias: row.alergias || '',
    vacunas: row.vacunas || '',
    tipo_sangre: Number.isFinite(tipo) ? tipo : 0,
    tipo_sangre_label: TIPO_SANGRE_LABELS[tipo] || TIPO_SANGRE_LABELS[0],
    enfermedades_sufridas: row.enfermedades_sufridas || '',
    otros_controles: row.otros_controles || '',
    experiencias_traumaticas: row.experiencias_traumaticas || ''
  };
}

function normalizeSaludBody(body, current) {
  const out = {};
  if (body.alergias !== undefined) out.alergias = String(body.alergias || '');
  else out.alergias = current.alergias || '';
  if (body.vacunas !== undefined) out.vacunas = String(body.vacunas || '');
  else out.vacunas = current.vacunas || '';
  if (body.enfermedades_sufridas !== undefined) {
    out.enfermedades_sufridas = String(body.enfermedades_sufridas || '');
  } else out.enfermedades_sufridas = current.enfermedades_sufridas || '';
  if (body.otros_controles !== undefined) {
    out.otros_controles = String(body.otros_controles || '');
  } else out.otros_controles = current.otros_controles || '';
  if (body.experiencias_traumaticas !== undefined) {
    out.experiencias_traumaticas = String(body.experiencias_traumaticas || '');
  } else out.experiencias_traumaticas = current.experiencias_traumaticas || '';
  if (body.tipo_sangre !== undefined && body.tipo_sangre !== null && body.tipo_sangre !== '') {
    const n = parseInt(body.tipo_sangre, 10);
    out.tipo_sangre = Number.isFinite(n) && n >= 0 && n <= 8 ? n : 0;
  } else {
    out.tipo_sangre = current.tipo_sangre != null ? parseInt(current.tipo_sangre, 10) || 0 : 0;
  }
  return out;
}

async function listContactos(alumnoId, colegioId) {
  return query(
    `SELECT id, nombres, parentesco, telefono, email, es_principal, orden
     FROM alumno_contactos_emergencia
     WHERE alumno_id = ? AND colegio_id = ?
     ORDER BY es_principal DESC, orden ASC, id ASC`,
    [alumnoId, colegioId]
  );
}

function normalizeContactos(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .map((item, idx) => ({
      nombres: String(item.nombres || '').trim().slice(0, 255),
      parentesco: item.parentesco != null ? String(item.parentesco).trim().slice(0, 120) : null,
      telefono: item.telefono != null ? String(item.telefono).trim().slice(0, 60) : null,
      email: item.email != null ? String(item.email).trim().slice(0, 180) : null,
      es_principal: item.es_principal ? 1 : 0,
      orden: idx
    }))
    .filter((x) => x.nombres || x.telefono);
}

async function replaceContactos(alumnoId, colegioId, list) {
  await execute(
    'DELETE FROM alumno_contactos_emergencia WHERE alumno_id = ? AND colegio_id = ?',
    [alumnoId, colegioId]
  );
  const items = normalizeContactos(list);
  for (const it of items) {
    await execute(
      `INSERT INTO alumno_contactos_emergencia
        (alumno_id, colegio_id, nombres, parentesco, telefono, email, es_principal, orden)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        alumnoId,
        colegioId,
        it.nombres,
        it.parentesco,
        it.telefono,
        it.email,
        it.es_principal,
        it.orden
      ]
    );
  }
  return listContactos(alumnoId, colegioId);
}

async function listDocumentos(alumnoId, colegioId) {
  const rows = await query(
    `SELECT id, tipo, titulo, archivo_servidor, mime_type, tamano_bytes, created_at
     FROM alumno_documentos
     WHERE alumno_id = ? AND colegio_id = ?
     ORDER BY id DESC`,
    [alumnoId, colegioId]
  );
  return (rows || []).map((d) => ({
    ...d,
    url: urlAlumnoDocPublic(colegioId, d.archivo_servidor)
  }));
}

function createUploadAlumnoDocs() {
  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        try {
          cb(null, dirAlumnoDocs(req.user.colegio_id));
        } catch (e) {
          cb(e);
        }
      },
      filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const safe = String(file.originalname || 'documento.pdf')
          .replace(/[^a-zA-Z0-9._-]+/g, '_')
          .slice(0, 80);
        const base = path.basename(safe, path.extname(safe)) || 'documento';
        cb(null, `adoc-${unique}-${base}.pdf`);
      }
    }),
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const ok =
        file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname || '');
      if (ok) return cb(null, true);
      cb(new Error('Solo se permiten archivos PDF'));
    }
  });
}

async function insertDocumento(alumnoId, colegioId, meta, file, usuarioId) {
  const tipoRaw = String(meta.tipo || 'VACUNA').toUpperCase();
  const tipo = TIPOS_DOC.has(tipoRaw) ? tipoRaw : 'VACUNA';
  const titulo = String(meta.titulo || file.originalname || 'Documento').trim().slice(0, 255);
  await execute(
    `INSERT INTO alumno_documentos
      (alumno_id, colegio_id, tipo, titulo, archivo_servidor, mime_type, tamano_bytes, subido_por_usuario_id)
     VALUES (?,?,?,?,?,?,?,?)`,
    [
      alumnoId,
      colegioId,
      tipo,
      titulo,
      file.filename,
      file.mimetype || 'application/pdf',
      file.size || null,
      usuarioId || null
    ]
  );
  const docs = await listDocumentos(alumnoId, colegioId);
  return docs[0];
}

async function deleteDocumento(docId, alumnoId, colegioId) {
  const rows = await query(
    `SELECT id, archivo_servidor FROM alumno_documentos
     WHERE id = ? AND alumno_id = ? AND colegio_id = ? LIMIT 1`,
    [docId, alumnoId, colegioId]
  );
  if (!rows.length) return false;
  const filePath = path.join(dirAlumnoDocs(colegioId), rows[0].archivo_servidor);
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (_) {
      /* ignore */
    }
  }
  await execute('DELETE FROM alumno_documentos WHERE id = ? AND colegio_id = ?', [
    docId,
    colegioId
  ]);
  return true;
}

async function resolveAlumnoIdFromUser(req) {
  const { usuario_id, colegio_id, alumno_id } = req.user || {};
  if (alumno_id) return parseInt(alumno_id, 10);
  const rows = await query(
    `SELECT alumno_id FROM usuarios WHERE id = ? AND colegio_id = ? AND alumno_id > 0 LIMIT 1`,
    [usuario_id, colegio_id]
  );
  return rows[0]?.alumno_id ? parseInt(rows[0].alumno_id, 10) : 0;
}

function mountAlumnoPerfilExtraRoutes(router) {
  const upload = createUploadAlumnoDocs();

  router.get('/perfil/contactos-emergencia', async (req, res) => {
    try {
      const { colegio_id } = req.user;
      const alumnoId = await resolveAlumnoIdFromUser(req);
      if (!alumnoId) return res.status(404).json({ error: 'Alumno no encontrado' });
      res.json({ contactos: await listContactos(alumnoId, colegio_id) });
    } catch (e) {
      console.error('GET contactos emergencia', e);
      res.status(500).json({ error: e.message || 'Error al cargar contactos' });
    }
  });

  router.put('/perfil/contactos-emergencia', async (req, res) => {
    try {
      const { colegio_id } = req.user;
      const alumnoId = await resolveAlumnoIdFromUser(req);
      if (!alumnoId) return res.status(404).json({ error: 'Alumno no encontrado' });
      const contactos = await replaceContactos(
        alumnoId,
        colegio_id,
        req.body?.contactos || req.body
      );
      res.json({ ok: true, contactos });
    } catch (e) {
      console.error('PUT contactos emergencia', e);
      res.status(500).json({ error: e.message || 'Error al guardar contactos' });
    }
  });

  router.get('/perfil/documentos', async (req, res) => {
    try {
      const { colegio_id } = req.user;
      const alumnoId = await resolveAlumnoIdFromUser(req);
      if (!alumnoId) return res.status(404).json({ error: 'Alumno no encontrado' });
      res.json({ documentos: await listDocumentos(alumnoId, colegio_id) });
    } catch (e) {
      console.error('GET alumno documentos', e);
      res.status(500).json({ error: e.message || 'Error al cargar documentos' });
    }
  });

  router.post('/perfil/documentos', upload.single('archivo'), async (req, res) => {
    try {
      const { colegio_id, usuario_id } = req.user;
      const alumnoId = await resolveAlumnoIdFromUser(req);
      if (!alumnoId) return res.status(404).json({ error: 'Alumno no encontrado' });
      if (!req.file) return res.status(400).json({ error: 'Archivo PDF requerido' });
      const doc = await insertDocumento(
        alumnoId,
        colegio_id,
        { tipo: req.body.tipo, titulo: req.body.titulo },
        req.file,
        usuario_id
      );
      res.status(201).json(doc);
    } catch (e) {
      console.error('POST alumno documentos', e);
      res.status(500).json({ error: e.message || 'Error al subir documento' });
    }
  });

  router.delete('/perfil/documentos/:id', async (req, res) => {
    try {
      const { colegio_id } = req.user;
      const alumnoId = await resolveAlumnoIdFromUser(req);
      if (!alumnoId) return res.status(404).json({ error: 'Alumno no encontrado' });
      const docId = parseInt(req.params.id, 10);
      if (!docId) return res.status(400).json({ error: 'ID inválido' });
      const ok = await deleteDocumento(docId, alumnoId, colegio_id);
      if (!ok) return res.status(404).json({ error: 'Documento no encontrado' });
      res.json({ ok: true });
    } catch (e) {
      console.error('DELETE alumno documentos', e);
      res.status(500).json({ error: e.message || 'Error al eliminar' });
    }
  });
}

async function applySaludUpdate(alumnoId, colegioId, body, currentRow) {
  const salud = normalizeSaludBody(body, currentRow || {});
  await execute(
    `UPDATE alumnos SET
      alergias = ?,
      vacunas = ?,
      tipo_sangre = ?,
      enfermedades_sufridas = ?,
      otros_controles = ?,
      experiencias_traumaticas = ?
     WHERE id = ? AND colegio_id = ?`,
    [
      salud.alergias,
      salud.vacunas,
      salud.tipo_sangre,
      salud.enfermedades_sufridas,
      salud.otros_controles,
      salud.experiencias_traumaticas,
      alumnoId,
      colegioId
    ]
  );
  return salud;
}

/**
 * Rutas de contactos/docs por alumnoId (admin o apoderado/docente-hijo).
 * @param {import('express').Router} router
 * @param {{ pathPrefix: string, paramName?: string, assertAccess: (req, alumnoId) => Promise<boolean|string> }} opts
 * assertAccess: true ok; false → 403; string → mensaje 403/404
 */
function mountAlumnoFichaByIdRoutes(router, opts) {
  const pathPrefix = opts.pathPrefix;
  const paramName = opts.paramName || 'id';
  const assertAccess = opts.assertAccess;
  const upload = createUploadAlumnoDocs();

  async function resolveTarget(req, res) {
    const alumnoId = parseInt(req.params[paramName], 10);
    if (!alumnoId) {
      res.status(400).json({ error: 'ID inválido' });
      return null;
    }
    const access = await assertAccess(req, alumnoId);
    if (access === false) {
      res.status(403).json({ error: 'No autorizado' });
      return null;
    }
    if (typeof access === 'string') {
      res.status(403).json({ error: access });
      return null;
    }
    return { alumnoId, colegioId: req.user.colegio_id };
  }

  router.get(`${pathPrefix}/:${paramName}/contactos-emergencia`, async (req, res) => {
    try {
      const t = await resolveTarget(req, res);
      if (!t) return;
      res.json({ contactos: await listContactos(t.alumnoId, t.colegioId) });
    } catch (e) {
      console.error('GET contactos by id', e);
      res.status(500).json({ error: e.message || 'Error al cargar contactos' });
    }
  });

  router.put(`${pathPrefix}/:${paramName}/contactos-emergencia`, async (req, res) => {
    try {
      const t = await resolveTarget(req, res);
      if (!t) return;
      const contactos = await replaceContactos(
        t.alumnoId,
        t.colegioId,
        req.body?.contactos || req.body
      );
      res.json({ ok: true, contactos });
    } catch (e) {
      console.error('PUT contactos by id', e);
      res.status(500).json({ error: e.message || 'Error al guardar contactos' });
    }
  });

  router.get(`${pathPrefix}/:${paramName}/documentos`, async (req, res) => {
    try {
      const t = await resolveTarget(req, res);
      if (!t) return;
      res.json({ documentos: await listDocumentos(t.alumnoId, t.colegioId) });
    } catch (e) {
      console.error('GET documentos by id', e);
      res.status(500).json({ error: e.message || 'Error al cargar documentos' });
    }
  });

  router.post(
    `${pathPrefix}/:${paramName}/documentos`,
    upload.single('archivo'),
    async (req, res) => {
      try {
        const t = await resolveTarget(req, res);
        if (!t) return;
        if (!req.file) return res.status(400).json({ error: 'Archivo PDF requerido' });
        const doc = await insertDocumento(
          t.alumnoId,
          t.colegioId,
          { tipo: req.body.tipo, titulo: req.body.titulo },
          req.file,
          req.user.usuario_id
        );
        res.status(201).json(doc);
      } catch (e) {
        console.error('POST documentos by id', e);
        res.status(500).json({ error: e.message || 'Error al subir documento' });
      }
    }
  );

  router.delete(`${pathPrefix}/:${paramName}/documentos/:docId`, async (req, res) => {
    try {
      const t = await resolveTarget(req, res);
      if (!t) return;
      const docId = parseInt(req.params.docId, 10);
      if (!docId) return res.status(400).json({ error: 'ID inválido' });
      const ok = await deleteDocumento(docId, t.alumnoId, t.colegioId);
      if (!ok) return res.status(404).json({ error: 'Documento no encontrado' });
      res.json({ ok: true });
    } catch (e) {
      console.error('DELETE documentos by id', e);
      res.status(500).json({ error: e.message || 'Error al eliminar' });
    }
  });
}

module.exports = {
  pickSaludFields,
  normalizeSaludBody,
  applySaludUpdate,
  TIPO_SANGRE_LABELS,
  mountAlumnoPerfilExtraRoutes,
  mountAlumnoFichaByIdRoutes,
  listContactos,
  listDocumentos,
  replaceContactos
};
