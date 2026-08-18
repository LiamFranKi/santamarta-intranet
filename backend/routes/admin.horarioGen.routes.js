/**
 * Módulo PILOTO — Generación de horarios (aislado).
 * Prefijo tablas: horario_gen_*
 * NO lee/escribe grupos_horarios (horario legacy del sistema).
 */
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { query, execute } = require('../utils/mysql');

router.use(authenticateToken);
router.use((req, res, next) => {
  if (req.user?.tipo === 'ADMINISTRADOR') return next();
  return res.status(403).json({ error: 'Solo el administrador puede usar Generar Horarios (piloto).' });
});

const TIPOS_BLOQUE = new Set(['CLASS', 'BREAK', 'LUNCH', 'ACTIVITY']);

function colegio(req) {
  return req.user.colegio_id;
}

function parseId(raw) {
  const id = parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function parseAnio(raw, fallback) {
  const n = parseInt(raw, 10);
  if (Number.isFinite(n) && n >= 2000 && n <= 2100) return n;
  return fallback;
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

function normalizeTime(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(s)) return s.length === 5 ? `${s}:00` : s;
  return null;
}

async function anioActivoColegio(cid) {
  const rows = await query('SELECT anio_activo FROM colegios WHERE id = ? LIMIT 1', [cid]);
  return parseInt(rows?.[0]?.anio_activo || new Date().getFullYear(), 10);
}

async function assertConfigOwned(configId, cid) {
  const rows = await query(
    `SELECT * FROM horario_gen_config WHERE id = ? AND colegio_id = ? LIMIT 1`,
    [configId, cid]
  );
  return rows?.[0] || null;
}

// ─── Meta (años + niveles existentes) ───────────────────────────────────────

router.get('/meta', async (req, res) => {
  try {
    const cid = colegio(req);
    const anioActivo = await anioActivoColegio(cid);

    const niveles = await query(
      `SELECT id, nombre FROM niveles WHERE colegio_id = ? ORDER BY id ASC`,
      [cid]
    );

    let anios = [];
    try {
      const fromGrupos = await query(
        `SELECT DISTINCT anio AS anio FROM grupos WHERE anio IS NOT NULL ORDER BY anio DESC`
      );
      anios = (fromGrupos || []).map((r) => Number(r.anio)).filter((n) => Number.isFinite(n));
    } catch {
      anios = [];
    }

    try {
      const fromCfg = await query(
        `SELECT DISTINCT anio FROM horario_gen_config WHERE colegio_id = ? ORDER BY anio DESC`,
        [cid]
      );
      for (const r of fromCfg || []) {
        const a = Number(r.anio);
        if (Number.isFinite(a) && !anios.includes(a)) anios.push(a);
      }
    } catch {
      /* tablas aún no creadas */
    }

    if (!anios.includes(anioActivo)) anios.unshift(anioActivo);
    anios = [...new Set(anios)].sort((a, b) => b - a);

    res.json({
      anio_activo: anioActivo,
      anios,
      niveles: niveles || [],
      modulo: 'horario_gen',
      aviso: 'Módulo piloto aislado. No modifica grupos_horarios ni el horario actual del sistema.',
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al cargar meta.' });
  }
});

// ─── Configs por año ────────────────────────────────────────────────────────

router.get('/configs', async (req, res) => {
  try {
    const cid = colegio(req);
    const anioActivo = await anioActivoColegio(cid);
    const anio = parseAnio(req.query.anio, anioActivo);

    const rows = await query(
      `SELECT c.*, n.nombre AS nivel_nombre,
              (SELECT COUNT(*) FROM horario_gen_bloques b WHERE b.config_id = c.id) AS total_bloques
       FROM horario_gen_config c
       LEFT JOIN niveles n ON n.id = c.nivel_id
       WHERE c.colegio_id = ? AND c.anio = ?
       ORDER BY n.id ASC, c.id ASC`,
      [cid, anio]
    );
    res.json({ anio, configs: (rows || []).map(mapActivo) });
  } catch (e) {
    const msg = String(e.message || '');
    if (msg.includes("doesn't exist") || e.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({
        error: 'Faltan tablas horario_gen_*. Ejecute sql/horario_gen_modulo.sql en phpMyAdmin.',
        code: 'TABLES_MISSING',
      });
    }
    res.status(500).json({ error: e.message || 'Error al listar configs.' });
  }
});

router.post('/configs', async (req, res) => {
  try {
    const cid = colegio(req);
    const anioActivo = await anioActivoColegio(cid);
    const b = req.body || {};
    const anio = parseAnio(b.anio, anioActivo);
    const nivel_id = parseId(b.nivel_id);
    if (!nivel_id) return res.status(400).json({ error: 'nivel_id obligatorio' });

    const nv = await query(`SELECT id, nombre FROM niveles WHERE id = ? AND colegio_id = ?`, [nivel_id, cid]);
    if (!nv?.length) return res.status(400).json({ error: 'Nivel no existe en este colegio' });

    const nombre = String(b.nombre || nv[0].nombre || '').trim() || nv[0].nombre;
    const hora_ingreso = normalizeTime(b.hora_ingreso);
    const hora_salida = normalizeTime(b.hora_salida);
    const dias_semana = String(b.dias_semana || '1,2,3,4,5').trim();
    const activo = toBool01(b.activo, 1);
    const notas = b.notas != null ? String(b.notas) : null;

    const r = await execute(
      `INSERT INTO horario_gen_config
        (colegio_id, anio, nivel_id, nombre, hora_ingreso, hora_salida, dias_semana, activo, notas)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [cid, anio, nivel_id, nombre, hora_ingreso, hora_salida, dias_semana, activo, notas]
    );
    const rows = await query(`SELECT * FROM horario_gen_config WHERE id = ?`, [r.insertId]);
    res.status(201).json({ config: mapActivo(rows[0]) });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe configuración para ese año y nivel' });
    }
    if (e.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({
        error: 'Faltan tablas horario_gen_*. Ejecute sql/horario_gen_modulo.sql en phpMyAdmin.',
        code: 'TABLES_MISSING',
      });
    }
    res.status(500).json({ error: e.message || 'Error al crear config.' });
  }
});

router.put('/configs/:id', async (req, res) => {
  try {
    const cid = colegio(req);
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const cur = await assertConfigOwned(id, cid);
    if (!cur) return res.status(404).json({ error: 'Config no encontrada' });

    const b = req.body || {};
    const nombre = String(b.nombre != null ? b.nombre : cur.nombre || '').trim();
    const hora_ingreso = normalizeTime(b.hora_ingreso !== undefined ? b.hora_ingreso : cur.hora_ingreso);
    const hora_salida = normalizeTime(b.hora_salida !== undefined ? b.hora_salida : cur.hora_salida);
    const dias_semana = String(b.dias_semana != null ? b.dias_semana : cur.dias_semana || '1,2,3,4,5').trim();
    const activo = b.activo !== undefined ? toBool01(b.activo, 1) : toBool01(cur.activo, 1);
    const notas = b.notas !== undefined ? (b.notas == null ? null : String(b.notas)) : cur.notas;

    await execute(
      `UPDATE horario_gen_config
       SET nombre = ?, hora_ingreso = ?, hora_salida = ?, dias_semana = ?, activo = ?, notas = ?
       WHERE id = ? AND colegio_id = ?`,
      [nombre, hora_ingreso, hora_salida, dias_semana, activo, notas, id, cid]
    );
    const rows = await query(`SELECT * FROM horario_gen_config WHERE id = ?`, [id]);
    res.json({ config: mapActivo(rows[0]) });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al actualizar config.' });
  }
});

router.delete('/configs/:id', async (req, res) => {
  try {
    const cid = colegio(req);
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const cur = await assertConfigOwned(id, cid);
    if (!cur) return res.status(404).json({ error: 'Config no encontrada' });

    // CASCADE borra bloques propios del piloto; no toca grupos_horarios
    const r = await execute(`DELETE FROM horario_gen_config WHERE id = ? AND colegio_id = ?`, [id, cid]);
    if (!r?.affectedRows) return res.status(404).json({ error: 'Config no encontrada' });
    res.json({ message: 'Configuración eliminada (solo tablas piloto).' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al eliminar config.' });
  }
});

// ─── Bloques ────────────────────────────────────────────────────────────────

router.get('/configs/:id/bloques', async (req, res) => {
  try {
    const cid = colegio(req);
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const cur = await assertConfigOwned(id, cid);
    if (!cur) return res.status(404).json({ error: 'Config no encontrada' });

    const rows = await query(
      `SELECT * FROM horario_gen_bloques WHERE config_id = ? ORDER BY orden ASC, id ASC`,
      [id]
    );
    res.json({ config: mapActivo(cur), bloques: (rows || []).map(mapActivo) });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al listar bloques.' });
  }
});

router.post('/configs/:id/bloques', async (req, res) => {
  try {
    const cid = colegio(req);
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const cur = await assertConfigOwned(id, cid);
    if (!cur) return res.status(404).json({ error: 'Config no encontrada' });

    const b = req.body || {};
    const nombre = String(b.nombre || '').trim();
    const hora_inicio = normalizeTime(b.hora_inicio);
    const hora_fin = normalizeTime(b.hora_fin);
    const tipo = String(b.tipo || 'CLASS').toUpperCase();
    if (!nombre) return res.status(400).json({ error: 'Nombre obligatorio' });
    if (!hora_inicio || !hora_fin) return res.status(400).json({ error: 'Hora inicio/fin obligatorias' });
    if (!TIPOS_BLOQUE.has(tipo)) return res.status(400).json({ error: 'Tipo inválido' });
    if (hora_fin <= hora_inicio) return res.status(400).json({ error: 'hora_fin debe ser mayor que hora_inicio' });

    let orden = Number.isFinite(Number(b.orden)) ? Number(b.orden) : null;
    if (orden == null) {
      const max = await query(
        `SELECT COALESCE(MAX(orden), 0) AS m FROM horario_gen_bloques WHERE config_id = ?`,
        [id]
      );
      orden = Number(max?.[0]?.m || 0) + 1;
    }
    const activo = toBool01(b.activo, 1);

    const r = await execute(
      `INSERT INTO horario_gen_bloques (config_id, nombre, hora_inicio, hora_fin, tipo, orden, activo)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, nombre, hora_inicio, hora_fin, tipo, orden, activo]
    );
    const rows = await query(`SELECT * FROM horario_gen_bloques WHERE id = ?`, [r.insertId]);
    res.status(201).json({ bloque: mapActivo(rows[0]) });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al crear bloque.' });
  }
});

router.put('/bloques/:bloqueId', async (req, res) => {
  try {
    const cid = colegio(req);
    const bloqueId = parseId(req.params.bloqueId);
    if (!bloqueId) return res.status(400).json({ error: 'ID inválido' });

    const rows = await query(
      `SELECT b.*, c.colegio_id
       FROM horario_gen_bloques b
       INNER JOIN horario_gen_config c ON c.id = b.config_id
       WHERE b.id = ? LIMIT 1`,
      [bloqueId]
    );
    if (!rows?.length || Number(rows[0].colegio_id) !== Number(cid)) {
      return res.status(404).json({ error: 'Bloque no encontrado' });
    }
    const cur = rows[0];
    const b = req.body || {};
    const nombre = String(b.nombre != null ? b.nombre : cur.nombre).trim();
    const hora_inicio = normalizeTime(b.hora_inicio !== undefined ? b.hora_inicio : cur.hora_inicio);
    const hora_fin = normalizeTime(b.hora_fin !== undefined ? b.hora_fin : cur.hora_fin);
    const tipo = String(b.tipo != null ? b.tipo : cur.tipo).toUpperCase();
    if (!nombre || !hora_inicio || !hora_fin) return res.status(400).json({ error: 'Datos incompletos' });
    if (!TIPOS_BLOQUE.has(tipo)) return res.status(400).json({ error: 'Tipo inválido' });
    if (hora_fin <= hora_inicio) return res.status(400).json({ error: 'hora_fin debe ser mayor que hora_inicio' });

    await execute(
      `UPDATE horario_gen_bloques
       SET nombre = ?, hora_inicio = ?, hora_fin = ?, tipo = ?, orden = ?, activo = ?
       WHERE id = ?`,
      [
        nombre,
        hora_inicio,
        hora_fin,
        tipo,
        Number.isFinite(Number(b.orden)) ? Number(b.orden) : cur.orden,
        b.activo !== undefined ? toBool01(b.activo, 1) : toBool01(cur.activo, 1),
        bloqueId,
      ]
    );
    const updated = await query(`SELECT * FROM horario_gen_bloques WHERE id = ?`, [bloqueId]);
    res.json({ bloque: mapActivo(updated[0]) });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al actualizar bloque.' });
  }
});

router.delete('/bloques/:bloqueId', async (req, res) => {
  try {
    const cid = colegio(req);
    const bloqueId = parseId(req.params.bloqueId);
    if (!bloqueId) return res.status(400).json({ error: 'ID inválido' });

    const rows = await query(
      `SELECT b.id, c.colegio_id
       FROM horario_gen_bloques b
       INNER JOIN horario_gen_config c ON c.id = b.config_id
       WHERE b.id = ? LIMIT 1`,
      [bloqueId]
    );
    if (!rows?.length || Number(rows[0].colegio_id) !== Number(cid)) {
      return res.status(404).json({ error: 'Bloque no encontrado' });
    }

    try {
      await execute(`DELETE FROM horario_gen_bloques WHERE id = ?`, [bloqueId]);
    } catch (e) {
      if (e.code === 'ER_ROW_IS_REFERENCED_2' || e.errno === 1451) {
        return res.status(409).json({
          error: 'No se puede eliminar: el bloque está usado en una versión piloto. Desactívelo.',
        });
      }
      throw e;
    }
    res.json({ message: 'Bloque eliminado' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al eliminar bloque.' });
  }
});

/** Seed rápido de bloques típicos (no toca horario legacy) */
router.post('/configs/:id/bloques/seed-secundaria', async (req, res) => {
  try {
    const cid = colegio(req);
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const cur = await assertConfigOwned(id, cid);
    if (!cur) return res.status(404).json({ error: 'Config no encontrada' });

    const existing = await query(`SELECT COUNT(*) AS n FROM horario_gen_bloques WHERE config_id = ?`, [id]);
    if (Number(existing?.[0]?.n || 0) > 0) {
      return res.status(409).json({ error: 'Ya hay bloques. Elimínelos antes de usar el seed.' });
    }

    const seed = [
      ['Bloque 1', '07:40:00', '08:20:00', 'CLASS', 1],
      ['Bloque 2', '08:20:00', '09:00:00', 'CLASS', 2],
      ['Recreo', '09:00:00', '09:20:00', 'BREAK', 3],
      ['Bloque 3', '09:20:00', '10:00:00', 'CLASS', 4],
      ['Bloque 4', '10:00:00', '10:40:00', 'CLASS', 5],
      ['Recreo', '10:40:00', '11:00:00', 'BREAK', 6],
      ['Bloque 5', '11:00:00', '11:40:00', 'CLASS', 7],
      ['Bloque 6', '11:40:00', '12:20:00', 'CLASS', 8],
      ['Almuerzo', '12:20:00', '13:00:00', 'LUNCH', 9],
      ['Bloque 7', '13:00:00', '13:40:00', 'CLASS', 10],
    ];

    for (const [nombre, hi, hf, tipo, orden] of seed) {
      await execute(
        `INSERT INTO horario_gen_bloques (config_id, nombre, hora_inicio, hora_fin, tipo, orden, activo)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [id, nombre, hi, hf, tipo, orden]
      );
    }

    const rows = await query(
      `SELECT * FROM horario_gen_bloques WHERE config_id = ? ORDER BY orden ASC, id ASC`,
      [id]
    );
    res.status(201).json({ bloques: (rows || []).map(mapActivo), message: 'Seed secundario aplicado (piloto).' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error en seed.' });
  }
});

module.exports = router;
