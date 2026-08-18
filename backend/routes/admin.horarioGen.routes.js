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

function isAnioValido(n) {
  const a = Number(n);
  return Number.isFinite(a) && a >= 2000 && a <= 2100;
}

const DIAS_SEMANA = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
];

const ESTADOS_DISP = new Set([
  'AVAILABLE',
  'UNAVAILABLE',
  'AVAILABLE_UNTIL',
  'AVAILABLE_FROM',
  'CUSTOM_INTERVAL',
]);

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
  const raw = parseInt(rows?.[0]?.anio_activo || new Date().getFullYear(), 10);
  return isAnioValido(raw) ? raw : new Date().getFullYear();
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
      // Solo años lectivos reales (en grupos a veces hay basura: IDs, typos)
      const fromGrupos = await query(
        `SELECT DISTINCT anio AS anio
         FROM grupos
         WHERE anio IS NOT NULL AND anio BETWEEN 2000 AND 2100
         ORDER BY anio DESC`
      );
      anios = (fromGrupos || []).map((r) => Number(r.anio)).filter(isAnioValido);
    } catch {
      anios = [];
    }

    try {
      const fromCfg = await query(
        `SELECT DISTINCT anio FROM horario_gen_config
         WHERE colegio_id = ? AND anio BETWEEN 2000 AND 2100
         ORDER BY anio DESC`,
        [cid]
      );
      for (const r of fromCfg || []) {
        const a = Number(r.anio);
        if (isAnioValido(a) && !anios.includes(a)) anios.push(a);
      }
    } catch {
      /* tablas aún no creadas */
    }

    const anioOk = isAnioValido(anioActivo) ? anioActivo : new Date().getFullYear();
    if (!anios.includes(anioOk)) anios.unshift(anioOk);
    anios = [...new Set(anios.filter(isAnioValido))].sort((a, b) => b - a);

    let docentes = [];
    try {
      docentes = await query(
        `SELECT p.id,
                TRIM(CONCAT(COALESCE(p.apellidos,''), ' ', COALESCE(p.nombres,''))) AS nombre
         FROM personal p
         INNER JOIN usuarios u ON u.personal_id = p.id AND u.colegio_id = ? AND u.estado = 'ACTIVO' AND u.tipo = 'DOCENTE'
         ORDER BY p.apellidos, p.nombres`,
        [cid]
      );
    } catch {
      docentes = [];
    }

    res.json({
      anio_activo: anioOk,
      anios,
      niveles: niveles || [],
      docentes: docentes || [],
      dias_semana: DIAS_SEMANA,
      estados_disponibilidad: [
        { value: 'AVAILABLE', label: 'Disponible' },
        { value: 'UNAVAILABLE', label: 'No disponible' },
        { value: 'AVAILABLE_UNTIL', label: 'Disponible hasta' },
        { value: 'AVAILABLE_FROM', label: 'Disponible desde' },
        { value: 'CUSTOM_INTERVAL', label: 'Intervalo' },
      ],
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

// ─── Disponibilidad docente (fase 2) ────────────────────────────────────────

router.get('/disponibilidad', async (req, res) => {
  try {
    const cid = colegio(req);
    const anioActivo = await anioActivoColegio(cid);
    const anio = parseAnio(req.query.anio, anioActivo);
    const personalId = parseId(req.query.personal_id);

    if (!personalId) {
      // Resumen: docentes con al menos un registro este año
      const rows = await query(
        `SELECT d.personal_id,
                TRIM(CONCAT(COALESCE(p.apellidos,''), ' ', COALESCE(p.nombres,''))) AS nombre,
                COUNT(*) AS dias_configurados,
                SUM(CASE WHEN d.estado = 'UNAVAILABLE' THEN 1 ELSE 0 END) AS dias_no_disponibles
         FROM horario_gen_disponibilidad d
         LEFT JOIN personal p ON p.id = d.personal_id
         WHERE d.colegio_id = ? AND d.anio = ?
         GROUP BY d.personal_id, p.apellidos, p.nombres
         ORDER BY p.apellidos, p.nombres`,
        [cid, anio]
      );
      return res.json({ anio, resumen: rows || [] });
    }

    const rows = await query(
      `SELECT * FROM horario_gen_disponibilidad
       WHERE colegio_id = ? AND anio = ? AND personal_id = ?
       ORDER BY dia_semana ASC, id ASC`,
      [cid, anio, personalId]
    );

    // Completar L-V aunque no existan filas
    const byDia = new Map((rows || []).map((r) => [Number(r.dia_semana), r]));
    const semana = DIAS_SEMANA.map((d) => {
      const cur = byDia.get(d.value);
      if (cur) return cur;
      return {
        id: null,
        colegio_id: cid,
        anio,
        personal_id: personalId,
        dia_semana: d.value,
        estado: 'AVAILABLE',
        hora_desde: '07:40:00',
        hora_hasta: '15:00:00',
        notas: null,
      };
    });

    res.json({ anio, personal_id: personalId, dias: semana });
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({
        error: 'Faltan tablas horario_gen_*. Ejecute sql/horario_gen_modulo.sql en phpMyAdmin.',
        code: 'TABLES_MISSING',
      });
    }
    res.status(500).json({ error: e.message || 'Error al cargar disponibilidad.' });
  }
});

/**
 * Reemplaza la semana L-V de un docente para un año.
 * Body: { anio, personal_id, dias: [{ dia_semana, estado, hora_desde, hora_hasta, notas }] }
 */
router.put('/disponibilidad', async (req, res) => {
  try {
    const cid = colegio(req);
    const anioActivo = await anioActivoColegio(cid);
    const b = req.body || {};
    const anio = parseAnio(b.anio, anioActivo);
    const personalId = parseId(b.personal_id);
    if (!personalId) return res.status(400).json({ error: 'personal_id obligatorio' });

    const p = await query(`SELECT id FROM personal WHERE id = ? AND colegio_id = ? LIMIT 1`, [personalId, cid]);
    if (!p?.length) return res.status(400).json({ error: 'Docente no existe en este colegio' });

    const diasIn = Array.isArray(b.dias) ? b.dias : [];
    if (!diasIn.length) return res.status(400).json({ error: 'dias[] obligatorio' });

    const cleaned = [];
    for (const d of diasIn) {
      const dia = parseInt(d.dia_semana, 10);
      if (!Number.isFinite(dia) || dia < 1 || dia > 5) {
        return res.status(400).json({ error: `día inválido: ${d.dia_semana}` });
      }
      const estado = String(d.estado || 'AVAILABLE').toUpperCase();
      if (!ESTADOS_DISP.has(estado)) {
        return res.status(400).json({ error: `estado inválido: ${d.estado}` });
      }
      let hora_desde = normalizeTime(d.hora_desde);
      let hora_hasta = normalizeTime(d.hora_hasta);

      if (estado === 'UNAVAILABLE') {
        hora_desde = null;
        hora_hasta = null;
      } else if (estado === 'AVAILABLE' || estado === 'CUSTOM_INTERVAL') {
        if (!hora_desde || !hora_hasta) {
          return res.status(400).json({ error: `${DIAS_SEMANA.find((x) => x.value === dia)?.label || dia}: indique desde y hasta` });
        }
        if (hora_hasta <= hora_desde) {
          return res.status(400).json({ error: `${DIAS_SEMANA.find((x) => x.value === dia)?.label || dia}: hasta debe ser mayor que desde` });
        }
      } else if (estado === 'AVAILABLE_UNTIL') {
        if (!hora_hasta) return res.status(400).json({ error: 'AVAILABLE_UNTIL requiere hora_hasta' });
        hora_desde = null;
      } else if (estado === 'AVAILABLE_FROM') {
        if (!hora_desde) return res.status(400).json({ error: 'AVAILABLE_FROM requiere hora_desde' });
        hora_hasta = null;
      }

      cleaned.push({
        dia_semana: dia,
        estado,
        hora_desde,
        hora_hasta,
        notas: d.notas != null ? String(d.notas).slice(0, 255) : null,
      });
    }

    // Reemplazo L-V (no borra sábado/domingo si existieran)
    await execute(
      `DELETE FROM horario_gen_disponibilidad
       WHERE colegio_id = ? AND anio = ? AND personal_id = ? AND dia_semana BETWEEN 1 AND 5`,
      [cid, anio, personalId]
    );

    for (const d of cleaned) {
      await execute(
        `INSERT INTO horario_gen_disponibilidad
          (colegio_id, anio, personal_id, dia_semana, estado, hora_desde, hora_hasta, notas)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [cid, anio, personalId, d.dia_semana, d.estado, d.hora_desde, d.hora_hasta, d.notas]
      );
    }

    const rows = await query(
      `SELECT * FROM horario_gen_disponibilidad
       WHERE colegio_id = ? AND anio = ? AND personal_id = ?
       ORDER BY dia_semana ASC`,
      [cid, anio, personalId]
    );
    res.json({ message: 'Disponibilidad guardada', anio, personal_id: personalId, dias: rows || [] });
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({
        error: 'Faltan tablas horario_gen_*. Ejecute sql/horario_gen_modulo.sql en phpMyAdmin.',
        code: 'TABLES_MISSING',
      });
    }
    res.status(500).json({ error: e.message || 'Error al guardar disponibilidad.' });
  }
});

router.delete('/disponibilidad', async (req, res) => {
  try {
    const cid = colegio(req);
    const anioActivo = await anioActivoColegio(cid);
    const anio = parseAnio(req.query.anio, anioActivo);
    const personalId = parseId(req.query.personal_id);
    if (!personalId) return res.status(400).json({ error: 'personal_id obligatorio' });

    await execute(
      `DELETE FROM horario_gen_disponibilidad WHERE colegio_id = ? AND anio = ? AND personal_id = ?`,
      [cid, anio, personalId]
    );
    res.json({ message: 'Disponibilidad eliminada (solo piloto).' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al eliminar disponibilidad.' });
  }
});

// ─── Carga semanal (fase 3) ─────────────────────────────────────────────────

router.get('/grupos', async (req, res) => {
  try {
    const cid = colegio(req);
    const anioActivo = await anioActivoColegio(cid);
    const anio = parseAnio(req.query.anio, anioActivo);
    const nivelId = parseId(req.query.nivel_id);

    let sql = `
      SELECT g.id, g.grado, g.seccion, g.nivel_id, g.anio,
             n.nombre AS nivel_nombre
      FROM grupos g
      INNER JOIN niveles n ON n.id = g.nivel_id
      WHERE g.colegio_id = ? AND g.anio = ?
    `;
    const params = [cid, anio];
    if (nivelId) {
      sql += ' AND g.nivel_id = ?';
      params.push(nivelId);
    }
    sql += ' ORDER BY n.nombre, g.grado, g.seccion';
    const rows = await query(sql, params);
    res.json({ anio, grupos: rows || [] });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al listar grupos.' });
  }
});

router.get('/carga', async (req, res) => {
  try {
    const cid = colegio(req);
    const anioActivo = await anioActivoColegio(cid);
    const anio = parseAnio(req.query.anio, anioActivo);
    const grupoId = parseId(req.query.grupo_id);
    const nivelId = parseId(req.query.nivel_id);

    let sql = `
      SELECT c.*,
             cur.nombre AS curso_nombre,
             g.grado, g.seccion, g.nivel_id,
             n.nombre AS nivel_nombre,
             TRIM(CONCAT(COALESCE(p.apellidos,''), ' ', COALESCE(p.nombres,''))) AS docente_nombre
      FROM horario_gen_carga c
      INNER JOIN grupos g ON g.id = c.grupo_id
      LEFT JOIN niveles n ON n.id = g.nivel_id
      LEFT JOIN cursos cur ON cur.id = c.curso_id
      LEFT JOIN personal p ON p.id = c.personal_id
      WHERE c.colegio_id = ? AND c.anio = ?
    `;
    const params = [cid, anio];
    if (grupoId) {
      sql += ' AND c.grupo_id = ?';
      params.push(grupoId);
    }
    if (nivelId) {
      sql += ' AND g.nivel_id = ?';
      params.push(nivelId);
    }
    sql += ' ORDER BY n.nombre, g.grado, g.seccion, cur.nombre, c.id';

    const rows = await query(sql, params);
    const mapped = (rows || []).map((r) => ({
      ...mapActivo(r),
      grupo_label: `${r.nivel_nombre || ''} ${r.grado ?? ''}${r.seccion ? ` ${r.seccion}` : ''}`.trim(),
    }));
    res.json({ anio, cargas: mapped });
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({
        error: 'Faltan tablas horario_gen_*. Ejecute sql/horario_gen_modulo.sql en phpMyAdmin.',
        code: 'TABLES_MISSING',
      });
    }
    res.status(500).json({ error: e.message || 'Error al listar carga.' });
  }
});

router.post('/carga', async (req, res) => {
  try {
    const cid = colegio(req);
    const anioActivo = await anioActivoColegio(cid);
    const b = req.body || {};
    const anio = parseAnio(b.anio, anioActivo);
    const grupo_id = parseId(b.grupo_id);
    if (!grupo_id) return res.status(400).json({ error: 'grupo_id obligatorio' });

    const g = await query(`SELECT id FROM grupos WHERE id = ? AND colegio_id = ? AND anio = ?`, [
      grupo_id,
      cid,
      anio,
    ]);
    if (!g?.length) return res.status(400).json({ error: 'Grupo no existe en ese año' });

    const curso_id = parseId(b.curso_id);
    const asignatura_id = parseId(b.asignatura_id);
    const personal_id = parseId(b.personal_id);
    const bloques = Math.max(1, parseInt(b.bloques_semanales, 10) || 1);
    const minC = Math.max(1, parseInt(b.bloques_consecutivos_min, 10) || 1);
    const maxC = Math.max(minC, parseInt(b.bloques_consecutivos_max, 10) || 2);
    const color = b.color != null ? String(b.color).slice(0, 20) : null;
    const activo = toBool01(b.activo, 1);

    const r = await execute(
      `INSERT INTO horario_gen_carga
        (colegio_id, anio, grupo_id, curso_id, asignatura_id, personal_id,
         bloques_semanales, bloques_consecutivos_min, bloques_consecutivos_max, color, activo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [cid, anio, grupo_id, curso_id, asignatura_id, personal_id, bloques, minC, maxC, color, activo]
    );
    const rows = await query(`SELECT * FROM horario_gen_carga WHERE id = ?`, [r.insertId]);
    res.status(201).json({ carga: mapActivo(rows[0]) });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al crear carga.' });
  }
});

router.put('/carga/:id', async (req, res) => {
  try {
    const cid = colegio(req);
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const curRows = await query(`SELECT * FROM horario_gen_carga WHERE id = ? AND colegio_id = ?`, [id, cid]);
    if (!curRows?.length) return res.status(404).json({ error: 'Carga no encontrada' });
    const cur = curRows[0];
    const b = req.body || {};

    const bloques = Number.isFinite(Number(b.bloques_semanales))
      ? Math.max(1, Number(b.bloques_semanales))
      : cur.bloques_semanales;
    const minC = Number.isFinite(Number(b.bloques_consecutivos_min))
      ? Math.max(1, Number(b.bloques_consecutivos_min))
      : cur.bloques_consecutivos_min;
    const maxC = Number.isFinite(Number(b.bloques_consecutivos_max))
      ? Math.max(minC, Number(b.bloques_consecutivos_max))
      : Math.max(minC, cur.bloques_consecutivos_max);
    const personal_id =
      b.personal_id !== undefined ? parseId(b.personal_id) : cur.personal_id;
    const color = b.color !== undefined ? (b.color ? String(b.color).slice(0, 20) : null) : cur.color;
    const activo = b.activo !== undefined ? toBool01(b.activo, 1) : toBool01(cur.activo, 1);

    await execute(
      `UPDATE horario_gen_carga
       SET personal_id = ?, bloques_semanales = ?, bloques_consecutivos_min = ?,
           bloques_consecutivos_max = ?, color = ?, activo = ?
       WHERE id = ? AND colegio_id = ?`,
      [personal_id, bloques, minC, maxC, color, activo, id, cid]
    );
    const updated = await query(`SELECT * FROM horario_gen_carga WHERE id = ?`, [id]);
    res.json({ carga: mapActivo(updated[0]) });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al actualizar carga.' });
  }
});

router.delete('/carga/:id', async (req, res) => {
  try {
    const cid = colegio(req);
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const r = await execute(`DELETE FROM horario_gen_carga WHERE id = ? AND colegio_id = ?`, [id, cid]);
    if (!r?.affectedRows) return res.status(404).json({ error: 'Carga no encontrada' });
    res.json({ message: 'Carga eliminada (solo piloto).' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al eliminar carga.' });
  }
});

/**
 * Importa desde asignaturas del año (docente+curso+grupo ya existentes).
 * No duplica si ya hay fila con mismo asignatura_id.
 * Body: { anio, nivel_id?, grupo_id?, bloques_default? }
 */
router.post('/carga/importar-asignaturas', async (req, res) => {
  try {
    const cid = colegio(req);
    const anioActivo = await anioActivoColegio(cid);
    const b = req.body || {};
    const anio = parseAnio(b.anio, anioActivo);
    const nivelId = parseId(b.nivel_id);
    const grupoId = parseId(b.grupo_id);
    const bloquesDefault = Math.max(1, parseInt(b.bloques_default, 10) || 2);

    let sql = `
      SELECT a.id AS asignatura_id, a.grupo_id, a.curso_id, a.personal_id
      FROM asignaturas a
      INNER JOIN grupos g ON g.id = a.grupo_id
      WHERE a.colegio_id = ? AND g.anio = ?
    `;
    const params = [cid, anio];
    if (grupoId) {
      sql += ' AND a.grupo_id = ?';
      params.push(grupoId);
    }
    if (nivelId) {
      sql += ' AND g.nivel_id = ?';
      params.push(nivelId);
    }

    const asigs = await query(sql, params);
    let creadas = 0;
    let omitidas = 0;

    for (const a of asigs || []) {
      const exists = await query(
        `SELECT id FROM horario_gen_carga
         WHERE colegio_id = ? AND anio = ? AND asignatura_id = ? LIMIT 1`,
        [cid, anio, a.asignatura_id]
      );
      if (exists?.length) {
        omitidas += 1;
        continue;
      }
      await execute(
        `INSERT INTO horario_gen_carga
          (colegio_id, anio, grupo_id, curso_id, asignatura_id, personal_id,
           bloques_semanales, bloques_consecutivos_min, bloques_consecutivos_max, activo)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, 2, 1)`,
        [cid, anio, a.grupo_id, a.curso_id, a.asignatura_id, a.personal_id, bloquesDefault]
      );
      creadas += 1;
    }

    res.json({
      message: 'Importación completada',
      anio,
      creadas,
      omitidas,
      total_asignaturas: (asigs || []).length,
      bloques_default: bloquesDefault,
    });
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({
        error: 'Faltan tablas horario_gen_*. Ejecute sql/horario_gen_modulo.sql en phpMyAdmin.',
        code: 'TABLES_MISSING',
      });
    }
    res.status(500).json({ error: e.message || 'Error al importar carga.' });
  }
});

module.exports = router;
