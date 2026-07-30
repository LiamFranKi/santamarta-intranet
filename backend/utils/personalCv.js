/**
 * CV de personal: estudios, idiomas, experiencia, documentos PDF.
 * Sueldo NO va aquí (solo admin equipo).
 */
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { query, execute } = require('./mysql');

const PERSONAL_CV_ROOT = path.join(__dirname, '../uploads/personal-cv');

const NIVELES_IDIOMA = new Set(['BASICO', 'INTERMEDIO', 'AVANZADO', 'NATIVO']);
const TIPOS_DOC = new Set(['TITULO', 'CERTIFICADO', 'OTRO']);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function dirPersonalCv(colegioId) {
  const dir = path.join(PERSONAL_CV_ROOT, String(colegioId));
  ensureDir(dir);
  return dir;
}

function urlPersonalDocPublic(colegioId, filename) {
  const name = String(filename || '').replace(/^\/+/, '');
  const pathPart = `/uploads/personal-cv/${colegioId}/${name}`;
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

function fileFilterPdf(req, file, cb) {
  const ok =
    file.mimetype === 'application/pdf' ||
    /\.pdf$/i.test(file.originalname || '');
  if (ok) return cb(null, true);
  cb(new Error('Solo se permiten archivos PDF'));
}

function createUploadPersonalCv(colegioIdResolver) {
  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        try {
          const colegioId = colegioIdResolver(req);
          cb(null, dirPersonalCv(colegioId));
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
        cb(null, `pcv-${unique}-${base}.pdf`);
      }
    }),
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: fileFilterPdf
  });
}

async function resolvePersonalIdFromUser(req) {
  const { usuario_id, colegio_id, personal_id } = req.user || {};
  if (personal_id) return parseInt(personal_id, 10);
  const rows = await query(
    `SELECT personal_id FROM usuarios WHERE id = ? AND colegio_id = ? AND personal_id > 0 LIMIT 1`,
    [usuario_id, colegio_id]
  );
  return rows[0]?.personal_id ? parseInt(rows[0].personal_id, 10) : 0;
}

async function assertPersonalEnColegio(personalId, colegioId) {
  const rows = await query(
    'SELECT id FROM personal WHERE id = ? AND colegio_id = ? LIMIT 1',
    [personalId, colegioId]
  );
  return rows.length > 0;
}

async function getCvCompleto(personalId, colegioId) {
  const [estudios, idiomas, experiencia, documentos] = await Promise.all([
    query(
      `SELECT id, nivel, institucion, carrera, anio_inicio, anio_fin, en_curso, orden
       FROM personal_estudios
       WHERE personal_id = ? AND colegio_id = ?
       ORDER BY orden ASC, id ASC`,
      [personalId, colegioId]
    ),
    query(
      `SELECT id, idioma, nivel, orden
       FROM personal_idiomas
       WHERE personal_id = ? AND colegio_id = ?
       ORDER BY orden ASC, id ASC`,
      [personalId, colegioId]
    ),
    query(
      `SELECT id, empresa, cargo, fecha_inicio, fecha_fin, actual, descripcion, orden
       FROM personal_experiencia
       WHERE personal_id = ? AND colegio_id = ?
       ORDER BY orden ASC, id ASC`,
      [personalId, colegioId]
    ),
    query(
      `SELECT id, tipo, titulo, archivo_servidor, mime_type, tamano_bytes, created_at
       FROM personal_documentos
       WHERE personal_id = ? AND colegio_id = ?
       ORDER BY id DESC`,
      [personalId, colegioId]
    )
  ]);

  return {
    estudios: estudios || [],
    idiomas: idiomas || [],
    experiencia: experiencia || [],
    documentos: (documentos || []).map((d) => ({
      ...d,
      url: urlPersonalDocPublic(colegioId, d.archivo_servidor)
    }))
  };
}

function normalizeEstudiosList(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .map((item, idx) => ({
      nivel: String(item.nivel || '').trim().slice(0, 80),
      institucion: String(item.institucion || '').trim().slice(0, 255),
      carrera: item.carrera != null ? String(item.carrera).trim().slice(0, 255) : null,
      anio_inicio: item.anio_inicio ? parseInt(item.anio_inicio, 10) || null : null,
      anio_fin: item.anio_fin ? parseInt(item.anio_fin, 10) || null : null,
      en_curso: item.en_curso ? 1 : 0,
      orden: idx
    }))
    .filter((x) => x.institucion || x.nivel || x.carrera);
}

function normalizeIdiomasList(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .map((item, idx) => {
      const nivel = String(item.nivel || 'BASICO').toUpperCase();
      return {
        idioma: String(item.idioma || '').trim().slice(0, 120),
        nivel: NIVELES_IDIOMA.has(nivel) ? nivel : 'BASICO',
        orden: idx
      };
    })
    .filter((x) => x.idioma);
}

function normalizeExperienciaList(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .map((item, idx) => ({
      empresa: String(item.empresa || '').trim().slice(0, 255),
      cargo: item.cargo != null ? String(item.cargo).trim().slice(0, 255) : null,
      fecha_inicio: item.fecha_inicio ? String(item.fecha_inicio).slice(0, 10) : null,
      fecha_fin: item.fecha_fin ? String(item.fecha_fin).slice(0, 10) : null,
      actual: item.actual ? 1 : 0,
      descripcion: item.descripcion != null ? String(item.descripcion).trim() : null,
      orden: idx
    }))
    .filter((x) => x.empresa || x.cargo);
}

async function replaceEstudios(personalId, colegioId, list) {
  await execute(
    'DELETE FROM personal_estudios WHERE personal_id = ? AND colegio_id = ?',
    [personalId, colegioId]
  );
  const items = normalizeEstudiosList(list);
  for (const it of items) {
    await execute(
      `INSERT INTO personal_estudios
        (personal_id, colegio_id, nivel, institucion, carrera, anio_inicio, anio_fin, en_curso, orden)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        personalId,
        colegioId,
        it.nivel,
        it.institucion,
        it.carrera,
        it.anio_inicio,
        it.anio_fin,
        it.en_curso,
        it.orden
      ]
    );
  }
  return items.length;
}

async function replaceIdiomas(personalId, colegioId, list) {
  await execute(
    'DELETE FROM personal_idiomas WHERE personal_id = ? AND colegio_id = ?',
    [personalId, colegioId]
  );
  const items = normalizeIdiomasList(list);
  for (const it of items) {
    await execute(
      `INSERT INTO personal_idiomas (personal_id, colegio_id, idioma, nivel, orden)
       VALUES (?,?,?,?,?)`,
      [personalId, colegioId, it.idioma, it.nivel, it.orden]
    );
  }
  return items.length;
}

async function replaceExperiencia(personalId, colegioId, list) {
  await execute(
    'DELETE FROM personal_experiencia WHERE personal_id = ? AND colegio_id = ?',
    [personalId, colegioId]
  );
  const items = normalizeExperienciaList(list);
  for (const it of items) {
    await execute(
      `INSERT INTO personal_experiencia
        (personal_id, colegio_id, empresa, cargo, fecha_inicio, fecha_fin, actual, descripcion, orden)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        personalId,
        colegioId,
        it.empresa,
        it.cargo,
        it.fecha_inicio,
        it.actual ? null : it.fecha_fin,
        it.actual,
        it.descripcion,
        it.orden
      ]
    );
  }
  return items.length;
}

async function insertDocumento(personalId, colegioId, meta, file, usuarioId) {
  const tipoRaw = String(meta.tipo || 'OTRO').toUpperCase();
  const tipo = TIPOS_DOC.has(tipoRaw) ? tipoRaw : 'OTRO';
  const titulo = String(meta.titulo || file.originalname || 'Documento').trim().slice(0, 255);
  await execute(
    `INSERT INTO personal_documentos
      (personal_id, colegio_id, tipo, titulo, archivo_servidor, mime_type, tamano_bytes, subido_por_usuario_id)
     VALUES (?,?,?,?,?,?,?,?)`,
    [
      personalId,
      colegioId,
      tipo,
      titulo,
      file.filename,
      file.mimetype || 'application/pdf',
      file.size || null,
      usuarioId || null
    ]
  );
  const [row] = await query(
    `SELECT id, tipo, titulo, archivo_servidor, mime_type, tamano_bytes, created_at
     FROM personal_documentos
     WHERE personal_id = ? AND colegio_id = ? AND archivo_servidor = ?
     ORDER BY id DESC LIMIT 1`,
    [personalId, colegioId, file.filename]
  );
  return {
    ...row,
    url: urlPersonalDocPublic(colegioId, row.archivo_servidor)
  };
}

async function deleteDocumento(docId, personalId, colegioId) {
  const rows = await query(
    `SELECT id, archivo_servidor FROM personal_documentos
     WHERE id = ? AND personal_id = ? AND colegio_id = ? LIMIT 1`,
    [docId, personalId, colegioId]
  );
  if (!rows.length) return false;
  const filePath = path.join(dirPersonalCv(colegioId), rows[0].archivo_servidor);
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (_) {
      /* ignore */
    }
  }
  await execute('DELETE FROM personal_documentos WHERE id = ? AND colegio_id = ?', [
    docId,
    colegioId
  ]);
  return true;
}

/**
 * Monta rutas /perfil/cv* en un router (docente o admin self-service).
 */
function mountSelfServiceCvRoutes(router) {
  const upload = createUploadPersonalCv((req) => req.user.colegio_id);

  router.get('/perfil/cv', async (req, res) => {
    try {
      const { colegio_id } = req.user;
      const personalId = await resolvePersonalIdFromUser(req);
      if (!personalId) {
        return res.status(404).json({ error: 'Personal no encontrado' });
      }
      const cv = await getCvCompleto(personalId, colegio_id);
      res.json(cv);
    } catch (e) {
      console.error('GET /perfil/cv', e);
      res.status(500).json({ error: e.message || 'Error al cargar CV' });
    }
  });

  router.put('/perfil/cv/estudios', async (req, res) => {
    try {
      const { colegio_id } = req.user;
      const personalId = await resolvePersonalIdFromUser(req);
      if (!personalId) return res.status(404).json({ error: 'Personal no encontrado' });
      await replaceEstudios(personalId, colegio_id, req.body?.estudios || req.body);
      const cv = await getCvCompleto(personalId, colegio_id);
      res.json({ ok: true, estudios: cv.estudios });
    } catch (e) {
      console.error('PUT /perfil/cv/estudios', e);
      res.status(500).json({ error: e.message || 'Error al guardar estudios' });
    }
  });

  router.put('/perfil/cv/idiomas', async (req, res) => {
    try {
      const { colegio_id } = req.user;
      const personalId = await resolvePersonalIdFromUser(req);
      if (!personalId) return res.status(404).json({ error: 'Personal no encontrado' });
      await replaceIdiomas(personalId, colegio_id, req.body?.idiomas || req.body);
      const cv = await getCvCompleto(personalId, colegio_id);
      res.json({ ok: true, idiomas: cv.idiomas });
    } catch (e) {
      console.error('PUT /perfil/cv/idiomas', e);
      res.status(500).json({ error: e.message || 'Error al guardar idiomas' });
    }
  });

  router.put('/perfil/cv/experiencia', async (req, res) => {
    try {
      const { colegio_id } = req.user;
      const personalId = await resolvePersonalIdFromUser(req);
      if (!personalId) return res.status(404).json({ error: 'Personal no encontrado' });
      await replaceExperiencia(personalId, colegio_id, req.body?.experiencia || req.body);
      const cv = await getCvCompleto(personalId, colegio_id);
      res.json({ ok: true, experiencia: cv.experiencia });
    } catch (e) {
      console.error('PUT /perfil/cv/experiencia', e);
      res.status(500).json({ error: e.message || 'Error al guardar experiencia' });
    }
  });

  router.post('/perfil/cv/documentos', upload.single('archivo'), async (req, res) => {
    try {
      const { colegio_id, usuario_id } = req.user;
      const personalId = await resolvePersonalIdFromUser(req);
      if (!personalId) return res.status(404).json({ error: 'Personal no encontrado' });
      if (!req.file) return res.status(400).json({ error: 'Archivo PDF requerido' });
      const doc = await insertDocumento(
        personalId,
        colegio_id,
        { tipo: req.body.tipo, titulo: req.body.titulo },
        req.file,
        usuario_id
      );
      res.status(201).json(doc);
    } catch (e) {
      console.error('POST /perfil/cv/documentos', e);
      res.status(500).json({ error: e.message || 'Error al subir documento' });
    }
  });

  router.delete('/perfil/cv/documentos/:id', async (req, res) => {
    try {
      const { colegio_id } = req.user;
      const personalId = await resolvePersonalIdFromUser(req);
      if (!personalId) return res.status(404).json({ error: 'Personal no encontrado' });
      const docId = parseInt(req.params.id, 10);
      if (!docId) return res.status(400).json({ error: 'ID inválido' });
      const ok = await deleteDocumento(docId, personalId, colegio_id);
      if (!ok) return res.status(404).json({ error: 'Documento no encontrado' });
      res.json({ ok: true });
    } catch (e) {
      console.error('DELETE /perfil/cv/documentos/:id', e);
      res.status(500).json({ error: e.message || 'Error al eliminar documento' });
    }
  });
}

/**
 * Monta rutas /equipo/:personalId/cv* en router admin usuarios.
 */
function mountAdminEquipoCvRoutes(router) {
  const upload = createUploadPersonalCv((req) => req.user.colegio_id);

  async function resolveTarget(req, res) {
    const { colegio_id } = req.user;
    const personalId = parseInt(req.params.personalId, 10);
    if (!personalId) {
      res.status(400).json({ error: 'ID inválido' });
      return null;
    }
    if (!(await assertPersonalEnColegio(personalId, colegio_id))) {
      res.status(404).json({ error: 'Personal no encontrado' });
      return null;
    }
    return { personalId, colegioId: colegio_id };
  }

  router.get('/equipo/:personalId/cv', async (req, res) => {
    try {
      const t = await resolveTarget(req, res);
      if (!t) return;
      res.json(await getCvCompleto(t.personalId, t.colegioId));
    } catch (e) {
      console.error('GET equipo cv', e);
      res.status(500).json({ error: e.message || 'Error al cargar CV' });
    }
  });

  router.put('/equipo/:personalId/cv/estudios', async (req, res) => {
    try {
      const t = await resolveTarget(req, res);
      if (!t) return;
      await replaceEstudios(t.personalId, t.colegioId, req.body?.estudios || req.body);
      const cv = await getCvCompleto(t.personalId, t.colegioId);
      res.json({ ok: true, estudios: cv.estudios });
    } catch (e) {
      console.error('PUT equipo cv estudios', e);
      res.status(500).json({ error: e.message || 'Error al guardar estudios' });
    }
  });

  router.put('/equipo/:personalId/cv/idiomas', async (req, res) => {
    try {
      const t = await resolveTarget(req, res);
      if (!t) return;
      await replaceIdiomas(t.personalId, t.colegioId, req.body?.idiomas || req.body);
      const cv = await getCvCompleto(t.personalId, t.colegioId);
      res.json({ ok: true, idiomas: cv.idiomas });
    } catch (e) {
      console.error('PUT equipo cv idiomas', e);
      res.status(500).json({ error: e.message || 'Error al guardar idiomas' });
    }
  });

  router.put('/equipo/:personalId/cv/experiencia', async (req, res) => {
    try {
      const t = await resolveTarget(req, res);
      if (!t) return;
      await replaceExperiencia(t.personalId, t.colegioId, req.body?.experiencia || req.body);
      const cv = await getCvCompleto(t.personalId, t.colegioId);
      res.json({ ok: true, experiencia: cv.experiencia });
    } catch (e) {
      console.error('PUT equipo cv experiencia', e);
      res.status(500).json({ error: e.message || 'Error al guardar experiencia' });
    }
  });

  router.post(
    '/equipo/:personalId/cv/documentos',
    upload.single('archivo'),
    async (req, res) => {
      try {
        const t = await resolveTarget(req, res);
        if (!t) return;
        if (!req.file) return res.status(400).json({ error: 'Archivo PDF requerido' });
        const doc = await insertDocumento(
          t.personalId,
          t.colegioId,
          { tipo: req.body.tipo, titulo: req.body.titulo },
          req.file,
          req.user.usuario_id
        );
        res.status(201).json(doc);
      } catch (e) {
        console.error('POST equipo cv documentos', e);
        res.status(500).json({ error: e.message || 'Error al subir documento' });
      }
    }
  );

  router.delete('/equipo/:personalId/cv/documentos/:id', async (req, res) => {
    try {
      const t = await resolveTarget(req, res);
      if (!t) return;
      const docId = parseInt(req.params.id, 10);
      if (!docId) return res.status(400).json({ error: 'ID inválido' });
      const ok = await deleteDocumento(docId, t.personalId, t.colegioId);
      if (!ok) return res.status(404).json({ error: 'Documento no encontrado' });
      res.json({ ok: true });
    } catch (e) {
      console.error('DELETE equipo cv documentos', e);
      res.status(500).json({ error: e.message || 'Error al eliminar documento' });
    }
  });
}

function parseSueldo(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(String(value).replace(',', '.'));
  if (Number.isNaN(n) || n < 0) return undefined; // inválido
  return Math.round(n * 100) / 100;
}

module.exports = {
  mountSelfServiceCvRoutes,
  mountAdminEquipoCvRoutes,
  getCvCompleto,
  parseSueldo,
  urlPersonalDocPublic
};
