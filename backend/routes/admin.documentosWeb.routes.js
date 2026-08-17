/**
 * Admin — Documentos de interés (web pública).
 * Tablas: web_documentos_categorias, web_documentos
 * PDFs: WEB_VANGUARD_ROOT/public/documentos/ → ruta /documentos/...
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { authenticateToken } = require('../middleware/auth');
const { query, execute } = require('../utils/mysql');
const {
  ensureWebPublicDir,
  sanitizePdfBasename,
  saveWebPublicPdf,
  removeWebPublicFileIfSafe,
  resolveWebVanguardRoot,
} = require('../utils/webVanguardFiles');

router.use(authenticateToken);
router.use((req, res, next) => {
  if (req.user?.tipo === 'ADMINISTRADOR') return next();
  return res.status(403).json({ error: 'Solo el administrador puede gestionar los documentos de interés.' });
});

const uploadPdf = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.join(os.tmpdir(), 'intranet-web-documentos');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      cb(null, `${Date.now()}-${sanitizePdfBasename(file.originalname)}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === 'application/pdf' ||
      String(file.originalname || '')
        .toLowerCase()
        .endsWith('.pdf');
    cb(ok ? null : new Error('Solo se permiten PDF'), ok);
  },
  limits: { fileSize: 30 * 1024 * 1024 },
});

function parseId(raw) {
  const id = parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function toBool01(v, fallback = 1) {
  if (Buffer.isBuffer(v)) return v.length && v[0] ? 1 : 0;
  if (v && typeof v === 'object' && Array.isArray(v.data)) return v.data[0] ? 1 : 0;
  if (v === true || v === 1 || v === '1' || v === 'true') return 1;
  if (v === false || v === 0 || v === '0' || v === 'false') return 0;
  return fallback;
}

function mapActivo(row) {
  if (!row) return row;
  return { ...row, activo: toBool01(row.activo, 0) };
}

function slugify(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function applyPdfUpload(req, body) {
  if (!req.file) return null;
  const destName = String(body.archivo || req.file.originalname || '').trim();
  return saveWebPublicPdf({
    subdir: 'documentos',
    publicPrefix: 'documentos',
    originalName: req.file.originalname,
    destName,
    tempPath: req.file.path,
  });
}

router.get('/meta', (_req, res) => {
  res.json({
    webRoot: resolveWebVanguardRoot(),
    pdfDir: ensureWebPublicDir('documentos'),
  });
});

// ─── Categorías ─────────────────────────────────────────────────────────────

router.get('/categorias', async (_req, res) => {
  try {
    const rows = await query(
      `SELECT c.id, c.codigo, c.etiqueta, c.orden, c.activo,
              (SELECT COUNT(*) FROM web_documentos d WHERE d.categoria_id = c.id) AS total_docs
       FROM web_documentos_categorias c
       ORDER BY c.orden ASC, c.id ASC`
    );
    res.json({ categorias: (rows || []).map(mapActivo) });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al listar categorías.' });
  }
});

router.post('/categorias', async (req, res) => {
  try {
    const b = req.body || {};
    const codigo = slugify(b.codigo || b.etiqueta);
    const etiqueta = String(b.etiqueta || '').trim();
    if (!codigo || !etiqueta) return res.status(400).json({ error: 'Código y etiqueta obligatorios' });
    const orden = Number.isFinite(Number(b.orden)) ? Number(b.orden) : 0;
    const activo = toBool01(b.activo, 1);
    const r = await execute(
      `INSERT INTO web_documentos_categorias (codigo, etiqueta, orden, activo) VALUES (?, ?, ?, ?)`,
      [codigo, etiqueta, orden, activo]
    );
    const rows = await query(`SELECT * FROM web_documentos_categorias WHERE id = ?`, [r.insertId]);
    res.status(201).json({ categoria: mapActivo(rows[0]) });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ese código ya existe' });
    res.status(500).json({ error: e.message || 'Error al crear categoría.' });
  }
});

router.put('/categorias/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const exists = await query(`SELECT id FROM web_documentos_categorias WHERE id = ?`, [id]);
    if (!exists?.length) return res.status(404).json({ error: 'Categoría no encontrada' });

    const b = req.body || {};
    const codigo = slugify(b.codigo);
    const etiqueta = String(b.etiqueta || '').trim();
    if (!codigo || !etiqueta) return res.status(400).json({ error: 'Código y etiqueta obligatorios' });

    await execute(
      `UPDATE web_documentos_categorias SET codigo = ?, etiqueta = ?, orden = ?, activo = ? WHERE id = ?`,
      [codigo, etiqueta, Number.isFinite(Number(b.orden)) ? Number(b.orden) : 0, toBool01(b.activo, 1), id]
    );
    const updated = await query(`SELECT * FROM web_documentos_categorias WHERE id = ?`, [id]);
    res.json({ categoria: mapActivo(updated[0]) });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ese código ya existe' });
    res.status(500).json({ error: e.message || 'Error al actualizar categoría.' });
  }
});

router.delete('/categorias/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const count = await query(`SELECT COUNT(*) AS n FROM web_documentos WHERE categoria_id = ?`, [id]);
    if (Number(count?.[0]?.n || 0) > 0) {
      return res.status(409).json({
        error: 'No se puede eliminar: tiene documentos asociados. Desactívela en su lugar.',
      });
    }
    const r = await execute(`DELETE FROM web_documentos_categorias WHERE id = ?`, [id]);
    if (!r?.affectedRows) return res.status(404).json({ error: 'Categoría no encontrada' });
    res.json({ message: 'Categoría eliminada' });
  } catch (e) {
    if (e.code === 'ER_ROW_IS_REFERENCED_2' || e.errno === 1451) {
      return res.status(409).json({
        error: 'No se puede eliminar: tiene documentos asociados. Desactívela en su lugar.',
      });
    }
    res.status(500).json({ error: e.message || 'Error al eliminar categoría.' });
  }
});

// ─── Documentos ─────────────────────────────────────────────────────────────

router.get('/items', async (req, res) => {
  try {
    const params = [];
    let sql = `
      SELECT d.id, d.categoria_id, d.codigo, d.nombre, d.tipo, d.archivo, d.ruta, d.orden, d.activo,
             c.codigo AS categoria_codigo, c.etiqueta AS categoria_etiqueta, c.orden AS categoria_orden
      FROM web_documentos d
      INNER JOIN web_documentos_categorias c ON c.id = d.categoria_id
      WHERE 1=1
    `;
    if (req.query.categoria_id) {
      const cid = parseId(req.query.categoria_id);
      if (cid) {
        sql += ' AND d.categoria_id = ?';
        params.push(cid);
      }
    }
    if (req.query.q && String(req.query.q).trim()) {
      const like = `%${String(req.query.q).trim()}%`;
      sql += ' AND (d.nombre LIKE ? OR d.codigo LIKE ? OR d.archivo LIKE ?)';
      params.push(like, like, like);
    }
    sql += ' ORDER BY c.orden ASC, d.orden ASC, d.id ASC';
    const rows = await query(sql, params);
    res.json({ documentos: (rows || []).map(mapActivo) });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al listar documentos.' });
  }
});

router.post('/items', uploadPdf.single('pdf'), async (req, res) => {
  try {
    const b = req.body || {};
    const categoria_id = parseId(b.categoria_id);
    const codigo = slugify(b.codigo || b.nombre);
    const nombre = String(b.nombre || '').trim();
    const tipo = String(b.tipo || 'PDF').trim() || 'PDF';
    if (!categoria_id) return res.status(400).json({ error: 'Categoría obligatoria' });
    if (!codigo || !nombre) return res.status(400).json({ error: 'Código y nombre obligatorios' });

    const cat = await query(`SELECT id FROM web_documentos_categorias WHERE id = ?`, [categoria_id]);
    if (!cat?.length) return res.status(400).json({ error: 'Categoría no existe' });

    let archivo = String(b.archivo || '').trim();
    let ruta = String(b.ruta || '').trim();
    const uploaded = applyPdfUpload(req, b);
    if (uploaded) {
      archivo = uploaded.archivo;
      ruta = uploaded.ruta;
    }
    if (!archivo || !ruta) {
      return res.status(400).json({ error: 'Suba un PDF o indique archivo y ruta (/documentos/...)' });
    }
    if (!ruta.startsWith('/documentos/')) ruta = `/documentos/${path.basename(ruta)}`;

    const orden = Number.isFinite(Number(b.orden)) ? Number(b.orden) : 0;
    const activo = toBool01(b.activo, 1);
    const r = await execute(
      `INSERT INTO web_documentos (categoria_id, codigo, nombre, tipo, archivo, ruta, orden, activo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [categoria_id, codigo, nombre, tipo, archivo, ruta, orden, activo]
    );
    const rows = await query(`SELECT * FROM web_documentos WHERE id = ?`, [r.insertId]);
    res.status(201).json({ documento: mapActivo(rows[0]) });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ese código ya existe' });
    res.status(500).json({ error: e.message || 'Error al crear documento.' });
  }
});

router.put('/items/:id', uploadPdf.single('pdf'), async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const curRows = await query(`SELECT * FROM web_documentos WHERE id = ?`, [id]);
    if (!curRows?.length) return res.status(404).json({ error: 'Documento no encontrado' });
    const cur = curRows[0];

    const b = req.body || {};
    const categoria_id = parseId(b.categoria_id) || cur.categoria_id;
    const codigo = slugify(b.codigo || cur.codigo);
    const nombre = String(b.nombre || cur.nombre || '').trim();
    const tipo = String(b.tipo || cur.tipo || 'PDF').trim() || 'PDF';
    if (!codigo || !nombre) return res.status(400).json({ error: 'Código y nombre obligatorios' });

    let archivo = String(b.archivo || cur.archivo || '').trim();
    let ruta = String(b.ruta || cur.ruta || '').trim();
    const uploaded = applyPdfUpload(req, { ...b, archivo: b.archivo || archivo });
    if (uploaded) {
      if (cur.ruta && cur.ruta !== uploaded.ruta) removeWebPublicFileIfSafe(cur.ruta);
      archivo = uploaded.archivo;
      ruta = uploaded.ruta;
    }
    if (!ruta.startsWith('/documentos/')) ruta = `/documentos/${path.basename(ruta)}`;

    await execute(
      `UPDATE web_documentos
       SET categoria_id = ?, codigo = ?, nombre = ?, tipo = ?, archivo = ?, ruta = ?, orden = ?, activo = ?
       WHERE id = ?`,
      [
        categoria_id,
        codigo,
        nombre,
        tipo,
        archivo,
        ruta,
        Number.isFinite(Number(b.orden)) ? Number(b.orden) : cur.orden,
        toBool01(b.activo, toBool01(cur.activo, 1)),
        id,
      ]
    );
    const updated = await query(`SELECT * FROM web_documentos WHERE id = ?`, [id]);
    res.json({ documento: mapActivo(updated[0]) });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ese código ya existe' });
    res.status(500).json({ error: e.message || 'Error al actualizar documento.' });
  }
});

router.delete('/items/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const rows = await query(`SELECT ruta FROM web_documentos WHERE id = ?`, [id]);
    const r = await execute(`DELETE FROM web_documentos WHERE id = ?`, [id]);
    if (!r?.affectedRows) return res.status(404).json({ error: 'Documento no encontrado' });
    if (rows?.[0]?.ruta) removeWebPublicFileIfSafe(rows[0].ruta);
    res.json({ message: 'Documento eliminado' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al eliminar documento.' });
  }
});

router.get('/preview', async (_req, res) => {
  try {
    const cats = await query(
      `SELECT id, codigo, etiqueta, orden, activo FROM web_documentos_categorias WHERE activo = 1 ORDER BY orden ASC, id ASC`
    );
    const docs = await query(
      `SELECT id, categoria_id, codigo, nombre, tipo, archivo, ruta, orden, activo
       FROM web_documentos WHERE activo = 1 ORDER BY orden ASC, id ASC`
    );
    const grupos = (cats || []).map((c) => ({
      ...mapActivo(c),
      documentos: (docs || []).filter((d) => Number(d.categoria_id) === Number(c.id)).map(mapActivo),
    }));
    res.json({ grupos, webRoot: resolveWebVanguardRoot() });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al generar vista previa.' });
  }
});

module.exports = router;
