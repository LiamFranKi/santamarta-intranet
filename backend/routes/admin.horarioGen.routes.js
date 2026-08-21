/**
 * Módulo PILOTO — Generación de horarios (aislado).
 * Prefijo tablas: horario_gen_*
 * Solo escribe en grupos_horarios al publicar (opt-in: POST /versiones/:id/vincular).
 */
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { query, execute } = require('../utils/mysql');
const { colorForCurso } = require('../utils/horarioGenColors');

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

/** Inicial: "3 Años"; Primaria/Secundaria: "3º" (paridad con legacy Grupo::getGrado). */
function formatGradoLabel(nivelNombre, grado) {
  if (grado === null || grado === undefined || grado === '') return '';
  if (Number(grado) === -1) return 'Avanzada';
  if (/inicial/i.test(String(nivelNombre || ''))) return `${grado} Años`;
  return `${grado}º`;
}

function formatGrupoLabel(nivelNombre, grado, seccion) {
  return [nivelNombre, formatGradoLabel(nivelNombre, grado), seccion]
    .filter((x) => x !== null && x !== undefined && String(x).trim() !== '')
    .join(' · ');
}

const DIA_NOMBRE = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miercoles',
  4: 'Jueves',
  5: 'Viernes',
};

function toAmPmTime(t) {
  const m = String(t || '')
    .trim()
    .match(/^(\d{1,2}):(\d{2})/);
  if (!m) return String(t || '').slice(0, 8);
  let h = Number(m[1]);
  const min = m[2];
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${min} ${ampm}`;
}

function toHhMm(t) {
  const s = String(t || '').trim();
  if (/^\d{1,2}:\d{2}/.test(s)) return s.slice(0, 5);
  return s;
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
      // DISTINCT: un personal puede tener más de un usuario DOCENTE activo
      docentes = await query(
        `SELECT DISTINCT p.id,
                TRIM(CONCAT(COALESCE(p.apellidos,''), ' ', COALESCE(p.nombres,''))) AS nombre
         FROM personal p
         INNER JOIN usuarios u
           ON u.personal_id = p.id
          AND u.colegio_id = ?
          AND u.estado = 'ACTIVO'
          AND u.tipo = 'DOCENTE'
         WHERE p.colegio_id = ?
         ORDER BY p.apellidos, p.nombres`,
        [cid, cid]
      );
    } catch {
      try {
        docentes = await query(
          `SELECT DISTINCT p.id,
                  TRIM(CONCAT(COALESCE(p.apellidos,''), ' ', COALESCE(p.nombres,''))) AS nombre
           FROM personal p
           INNER JOIN usuarios u
             ON u.personal_id = p.id
            AND u.colegio_id = ?
            AND u.estado = 'ACTIVO'
            AND u.tipo = 'DOCENTE'
           ORDER BY p.apellidos, p.nombres`,
          [cid]
        );
      } catch {
        docentes = [];
      }
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
    res.json({
      anio,
      grupos: (rows || []).map((g) => ({
        ...g,
        grado_label: formatGradoLabel(g.nivel_nombre, g.grado),
        label: formatGrupoLabel(g.nivel_nombre, g.grado, g.seccion),
      })),
    });
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
      grupo_label: formatGrupoLabel(r.nivel_nombre, r.grado, r.seccion),
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
    const minC = Math.max(1, parseInt(b.bloques_consecutivos_min, 10) || 2);
    const maxC = Math.max(minC, parseInt(b.bloques_consecutivos_max, 10) || 2);
    const color = b.color != null ? String(b.color).slice(0, 20) : null;
    const activo = toBool01(b.activo, 1);
    const no_partir = toBool01(b.no_partir, 0);

    const r = await execute(
      `INSERT INTO horario_gen_carga
        (colegio_id, anio, grupo_id, curso_id, asignatura_id, personal_id,
         bloques_semanales, bloques_consecutivos_min, bloques_consecutivos_max, no_partir, color, activo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [cid, anio, grupo_id, curso_id, asignatura_id, personal_id, bloques, minC, maxC, no_partir, color, activo]
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
    const no_partir =
      b.no_partir !== undefined ? toBool01(b.no_partir, 0) : toBool01(cur.no_partir, 0);

    await execute(
      `UPDATE horario_gen_carga
       SET personal_id = ?, bloques_semanales = ?, bloques_consecutivos_min = ?,
           bloques_consecutivos_max = ?, no_partir = ?, color = ?, activo = ?
       WHERE id = ? AND colegio_id = ?`,
      [personal_id, bloques, minC, maxC, no_partir, color, activo, id, cid]
    );
    const updated = await query(`SELECT * FROM horario_gen_carga WHERE id = ?`, [id]);
    res.json({ carga: mapActivo(updated[0]) });
  } catch (e) {
    if (e.code === 'ER_BAD_FIELD_ERROR' || String(e.message || '').includes('no_partir')) {
      return res.status(503).json({
        error:
          'Falta la columna no_partir. En phpMyAdmin ejecute sql/horario_gen_carga_no_partir.sql',
        code: 'MIGRATION_REQUIRED',
      });
    }
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
 * Copia solo Horas + Horas seguidas entre grupos (NO docentes).
 * Empareja por curso_id; si falta, por nombre de curso (normalizado).
 * Body: { anio, grupo_origen_id, grupo_destino_ids: number[] }
 */
router.post('/carga/copiar-horas', async (req, res) => {
  try {
    const cid = colegio(req);
    const anioActivo = await anioActivoColegio(cid);
    const b = req.body || {};
    const anio = parseAnio(b.anio, anioActivo);
    const origenId = parseId(b.grupo_origen_id);
    let destinos = [];
    if (Array.isArray(b.grupo_destino_ids)) {
      destinos = b.grupo_destino_ids.map((x) => parseId(x)).filter(Boolean);
    } else if (parseId(b.grupo_destino_id)) {
      destinos = [parseId(b.grupo_destino_id)];
    }
    destinos = [...new Set(destinos)].filter((id) => id && id !== origenId);

    if (!origenId) return res.status(400).json({ error: 'grupo_origen_id obligatorio' });
    if (!destinos.length) {
      return res.status(400).json({ error: 'Indique al menos un grupo destino distinto al origen.' });
    }

    const origenRows = await query(
      `SELECT c.id, c.curso_id, c.bloques_semanales, c.bloques_consecutivos_min, c.bloques_consecutivos_max,
              COALESCE(c.no_partir, 0) AS no_partir,
              LOWER(TRIM(COALESCE(cur.nombre, ''))) AS curso_key
       FROM horario_gen_carga c
       LEFT JOIN cursos cur ON cur.id = c.curso_id
       WHERE c.colegio_id = ? AND c.anio = ? AND c.grupo_id = ? AND c.activo = 1`,
      [cid, anio, origenId]
    );
    if (!origenRows?.length) {
      return res.status(400).json({
        error: 'El grupo origen no tiene carga activa para copiar.',
      });
    }

    const byCursoId = new Map();
    const byNombre = new Map();
    for (const o of origenRows) {
      if (o.curso_id) byCursoId.set(Number(o.curso_id), o);
      if (o.curso_key) byNombre.set(o.curso_key, o);
    }

    let actualizadas = 0;
    let sinMatch = 0;
    const porDestino = [];

    for (const destId of destinos) {
      const destRows = await query(
        `SELECT c.id, c.curso_id, c.bloques_semanales, c.bloques_consecutivos_min, c.bloques_consecutivos_max,
                LOWER(TRIM(COALESCE(cur.nombre, ''))) AS curso_key,
                cur.nombre AS curso_nombre
         FROM horario_gen_carga c
         LEFT JOIN cursos cur ON cur.id = c.curso_id
         WHERE c.colegio_id = ? AND c.anio = ? AND c.grupo_id = ?`,
        [cid, anio, destId]
      );
      let upd = 0;
      let miss = 0;
      for (const d of destRows || []) {
        const src =
          (d.curso_id && byCursoId.get(Number(d.curso_id))) ||
          (d.curso_key && byNombre.get(d.curso_key)) ||
          null;
        if (!src) {
          miss += 1;
          continue;
        }
        const minC = Math.max(1, Number(src.bloques_consecutivos_min) || 1);
        const maxC = Math.max(minC, Number(src.bloques_consecutivos_max) || minC);
        const horas = Math.max(1, Number(src.bloques_semanales) || 1);
        const noPartir = toBool01(src.no_partir, 0);
        await execute(
          `UPDATE horario_gen_carga
           SET bloques_semanales = ?, bloques_consecutivos_min = ?, bloques_consecutivos_max = ?, no_partir = ?
           WHERE id = ? AND colegio_id = ?`,
          [horas, minC, maxC, noPartir, d.id, cid]
        );
        upd += 1;
      }
      actualizadas += upd;
      sinMatch += miss;
      porDestino.push({ grupo_id: destId, actualizadas: upd, sin_match: miss });
    }

    res.json({
      message: 'Horas copiadas (docentes sin cambios)',
      anio,
      grupo_origen_id: origenId,
      actualizadas,
      sin_match: sinMatch,
      destinos: porDestino,
    });
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({
        error: 'Faltan tablas horario_gen_*. Ejecute sql/horario_gen_modulo.sql en phpMyAdmin.',
        code: 'TABLES_MISSING',
      });
    }
    res.status(500).json({ error: e.message || 'Error al copiar horas.' });
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
      SELECT a.id AS asignatura_id, a.grupo_id, a.curso_id, a.personal_id,
             cur.nombre AS curso_nombre
      FROM asignaturas a
      INNER JOIN grupos g ON g.id = a.grupo_id
      LEFT JOIN cursos cur ON cur.id = a.curso_id
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
      const color = colorForCurso(a.curso_nombre);
      await execute(
        `INSERT INTO horario_gen_carga
          (colegio_id, anio, grupo_id, curso_id, asignatura_id, personal_id,
           bloques_semanales, bloques_consecutivos_min, bloques_consecutivos_max, no_partir, color, activo)
         VALUES (?, ?, ?, ?, ?, ?, ?, 2, 2, 0, ?, 1)`,
        [cid, anio, a.grupo_id, a.curso_id, a.asignatura_id, a.personal_id, bloquesDefault, color]
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

// ─── Editor / versiones (fase 4) ────────────────────────────────────────────

const { validatePlacement } = require('../utils/horarioGenValidation');

async function assertVersionOwned(versionId, cid) {
  const rows = await query(
    `SELECT * FROM horario_gen_versiones WHERE id = ? AND colegio_id = ? LIMIT 1`,
    [versionId, cid]
  );
  return rows?.[0] || null;
}

router.get('/versiones', async (req, res) => {
  try {
    const cid = colegio(req);
    const anioActivo = await anioActivoColegio(cid);
    const anio = parseAnio(req.query.anio, anioActivo);
    const nivelId = parseId(req.query.nivel_id);

    let sql = `
      SELECT v.*, n.nombre AS nivel_nombre,
             (SELECT COUNT(*) FROM horario_gen_entradas e WHERE e.version_id = v.id) AS total_entradas
      FROM horario_gen_versiones v
      LEFT JOIN niveles n ON n.id = v.nivel_id
      WHERE v.colegio_id = ? AND v.anio = ?
    `;
    const params = [cid, anio];
    if (nivelId) {
      sql += ' AND v.nivel_id = ?';
      params.push(nivelId);
    }
    sql += ' ORDER BY v.updated_at DESC, v.id DESC';
    const rows = await query(sql, params);
    res.json({ anio, versiones: rows || [] });
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({
        error: 'Faltan tablas horario_gen_*. Ejecute sql/horario_gen_modulo.sql en phpMyAdmin.',
        code: 'TABLES_MISSING',
      });
    }
    res.status(500).json({ error: e.message || 'Error al listar versiones.' });
  }
});

router.post('/versiones', async (req, res) => {
  try {
    const cid = colegio(req);
    const anioActivo = await anioActivoColegio(cid);
    const b = req.body || {};
    const anio = parseAnio(b.anio, anioActivo);
    const nivel_id = parseId(b.nivel_id);
    if (!nivel_id) return res.status(400).json({ error: 'nivel_id obligatorio' });

    let config_id = parseId(b.config_id);
    if (!config_id) {
      const cfg = await query(
        `SELECT id FROM horario_gen_config WHERE colegio_id = ? AND anio = ? AND nivel_id = ? LIMIT 1`,
        [cid, anio, nivel_id]
      );
      config_id = cfg?.[0]?.id || null;
    }
    if (!config_id) {
      return res.status(400).json({
        error: 'No hay configuración de bloques para ese nivel/año. Créalos en la pestaña Configuración.',
      });
    }

    const allBloques = await query(
      `SELECT id, nombre, activo, tipo FROM horario_gen_bloques WHERE config_id = ?`,
      [config_id]
    );
    let activos = (allBloques || []).filter((b) => toBool01(b.activo, 0) === 1);
    if (!activos.length && (allBloques || []).length > 0) {
      // Bloques existen pero marcados inactivos (a veces por BIT/TINYINT) → reactivar
      await execute(`UPDATE horario_gen_bloques SET activo = 1 WHERE config_id = ?`, [config_id]);
      activos = allBloques;
    }
    if (!activos.length) {
      const nvName = (
        await query(`SELECT nombre FROM niveles WHERE id = ? LIMIT 1`, [nivel_id])
      )?.[0]?.nombre;
      return res.status(400).json({
        error: `El nivel ${nvName || ''} no tiene bloques horarios (1ª hora, recreo, etc.). Ve a «1. Configuración», elige ese nivel y agrega bloques (o Seed ejemplo). La pestaña Carga semanal no crea bloques de hora.`,
        code: 'NO_BLOQUES',
      });
    }

    const nv = await query(`SELECT nombre FROM niveles WHERE id = ? AND colegio_id = ?`, [nivel_id, cid]);
    const nombre =
      String(b.nombre || '').trim() ||
      `Horario · ${nv?.[0]?.nombre || nivel_id} · ${anio}`;

    const r = await execute(
      `INSERT INTO horario_gen_versiones
        (colegio_id, anio, nivel_id, config_id, nombre, estado, created_by)
       VALUES (?, ?, ?, ?, ?, 'DRAFT', ?)`,
      [cid, anio, nivel_id, config_id, nombre, req.user?.id || null]
    );
    const rows = await query(`SELECT * FROM horario_gen_versiones WHERE id = ?`, [r.insertId]);
    res.status(201).json({ version: rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al crear versión.' });
  }
});

/**
 * Un solo horario de trabajo por nivel/año (sin elegir borradores).
 * Reutiliza el mejor existente o crea uno vacío con el esqueleto de bloques.
 */
router.post('/versiones/asegurar', async (req, res) => {
  try {
    const cid = colegio(req);
    const anioActivo = await anioActivoColegio(cid);
    const b = req.body || {};
    const anio = parseAnio(b.anio, anioActivo);
    const nivel_id = parseId(b.nivel_id);
    if (!nivel_id) return res.status(400).json({ error: 'nivel_id obligatorio' });

    const { rankEstadoVersion } = require('../utils/horarioGenTeacherBusy');
    const rows = await query(
      `SELECT v.*, n.nombre AS nivel_nombre,
              (SELECT COUNT(*) FROM horario_gen_entradas e WHERE e.version_id = v.id) AS total_entradas
       FROM horario_gen_versiones v
       LEFT JOIN niveles n ON n.id = v.nivel_id
       WHERE v.colegio_id = ? AND v.anio = ? AND v.nivel_id = ? AND v.estado <> 'ARCHIVED'
       ORDER BY v.updated_at DESC, v.id DESC`,
      [cid, anio, nivel_id]
    );

    let best = null;
    for (const v of rows || []) {
      if (!best) {
        best = v;
        continue;
      }
      const rNew = rankEstadoVersion(v.estado);
      const rOld = rankEstadoVersion(best.estado);
      if (rNew > rOld) best = v;
      else if (rNew === rOld && Number(v.total_entradas) > Number(best.total_entradas)) best = v;
    }

    if (best) {
      // Archivar otros borradores del mismo nivel para no acumular
      for (const v of rows || []) {
        if (Number(v.id) === Number(best.id)) continue;
        if (String(v.estado).toUpperCase() === 'PUBLISHED') continue;
        await execute(
          `UPDATE horario_gen_versiones SET estado = 'ARCHIVED', updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND colegio_id = ? AND estado <> 'PUBLISHED'`,
          [v.id, cid]
        );
      }
      return res.json({ version: best, created: false });
    }

    // Crear usando la misma lógica de POST /versiones
    const cfg = await query(
      `SELECT id FROM horario_gen_config WHERE colegio_id = ? AND anio = ? AND nivel_id = ? LIMIT 1`,
      [cid, anio, nivel_id]
    );
    const config_id = cfg?.[0]?.id || null;
    if (!config_id) {
      return res.status(400).json({
        error: 'No hay configuración de bloques para ese nivel/año. Créalos en la pestaña Configuración.',
        code: 'NO_CONFIG',
      });
    }
    const allBloques = await query(
      `SELECT id, nombre, activo, tipo FROM horario_gen_bloques WHERE config_id = ?`,
      [config_id]
    );
    let activos = (allBloques || []).filter((x) => toBool01(x.activo, 0) === 1);
    if (!activos.length && (allBloques || []).length > 0) {
      await execute(`UPDATE horario_gen_bloques SET activo = 1 WHERE config_id = ?`, [config_id]);
      activos = allBloques;
    }
    if (!activos.length) {
      return res.status(400).json({
        error: 'El nivel no tiene bloques horarios. Ve a «1. Configuración» y agrega horas.',
        code: 'NO_BLOQUES',
      });
    }
    const nv = await query(`SELECT nombre FROM niveles WHERE id = ? AND colegio_id = ?`, [nivel_id, cid]);
    const nombre = `Horario · ${nv?.[0]?.nombre || nivel_id} · ${anio}`;
    const r = await execute(
      `INSERT INTO horario_gen_versiones
        (colegio_id, anio, nivel_id, config_id, nombre, estado, created_by)
       VALUES (?, ?, ?, ?, ?, 'DRAFT', ?)`,
      [cid, anio, nivel_id, config_id, nombre, req.user?.id || null]
    );
    const created = await query(`SELECT * FROM horario_gen_versiones WHERE id = ?`, [r.insertId]);
    res.status(201).json({ version: created[0], created: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al asegurar horario.' });
  }
});

/** Limpia solo las clases de un grupo en el horario del nivel (no borra el esqueleto). */
router.delete('/entradas/grupo', async (req, res) => {
  try {
    const cid = colegio(req);
    const versionId = parseId(req.query.version_id);
    const grupoId = parseId(req.query.grupo_id);
    if (!versionId || !grupoId) {
      return res.status(400).json({ error: 'version_id y grupo_id obligatorios' });
    }
    const ver = await assertVersionOwned(versionId, cid);
    if (!ver) return res.status(404).json({ error: 'Horario no encontrado' });
    const r = await execute(
      `DELETE FROM horario_gen_entradas
       WHERE version_id = ? AND grupo_id = ? AND locked = 0`,
      [versionId, grupoId]
    );
    res.json({
      message: 'Horario del grupo limpiado (celdas bloqueadas se mantienen).',
      eliminadas: r.affectedRows || 0,
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al limpiar grupo.' });
  }
});

router.delete('/versiones/:id', async (req, res) => {
  try {
    const cid = colegio(req);
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const ver = await assertVersionOwned(id, cid);
    if (!ver) return res.status(404).json({ error: 'Versión no encontrada' });
    if (ver.estado === 'PUBLISHED') {
      return res.status(409).json({ error: 'No se puede borrar una versión publicada (piloto). Archívela primero.' });
    }
    await execute(`DELETE FROM horario_gen_versiones WHERE id = ? AND colegio_id = ?`, [id, cid]);
    res.json({ message: 'Versión eliminada (entradas en cascada). No tocó grupos_horarios.' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al eliminar versión.' });
  }
});

/** Tablero del editor para un grupo */
router.get('/editor', async (req, res) => {
  try {
    const cid = colegio(req);
    const versionId = parseId(req.query.version_id);
    const grupoId = parseId(req.query.grupo_id);
    if (!versionId || !grupoId) {
      return res.status(400).json({ error: 'version_id y grupo_id obligatorios' });
    }

    const ver = await assertVersionOwned(versionId, cid);
    if (!ver) return res.status(404).json({ error: 'Versión no encontrada' });

    const grupoRows = await query(
      `SELECT g.id, g.grado, g.seccion, g.nivel_id, g.anio, n.nombre AS nivel_nombre
       FROM grupos g
       INNER JOIN niveles n ON n.id = g.nivel_id
       WHERE g.id = ? AND g.colegio_id = ? LIMIT 1`,
      [grupoId, cid]
    );
    if (!grupoRows?.length) return res.status(404).json({ error: 'Grupo no encontrado' });
    const grupo = grupoRows[0];

    if (ver.nivel_id && Number(ver.nivel_id) !== Number(grupo.nivel_id)) {
      return res.status(400).json({ error: 'El grupo no pertenece al nivel de esta versión.' });
    }

    const bloques = await query(
      `SELECT * FROM horario_gen_bloques
       WHERE config_id = ? AND activo = 1
       ORDER BY orden ASC, id ASC`,
      [ver.config_id]
    );

    const entradas = await query(
      `SELECT e.*,
              COALESCE(cur.nombre, e.texto_libre) AS curso_nombre,
              TRIM(CONCAT(COALESCE(p.apellidos,''), ' ', COALESCE(p.nombres,''))) AS docente_nombre,
              cg.bloques_semanales, cg.color AS carga_color,
              COALESCE(e.personal_id, cg.personal_id) AS personal_id_efectivo
       FROM horario_gen_entradas e
       LEFT JOIN cursos cur ON cur.id = e.curso_id
       LEFT JOIN horario_gen_carga cg ON cg.id = e.carga_id
       LEFT JOIN personal p ON p.id = COALESCE(e.personal_id, cg.personal_id)
       WHERE e.version_id = ? AND e.grupo_id = ?
       ORDER BY e.dia_semana, e.bloque_id`,
      [versionId, grupoId]
    );

    const cargas = await query(
      `SELECT c.*,
              cur.nombre AS curso_nombre,
              TRIM(CONCAT(COALESCE(p.apellidos,''), ' ', COALESCE(p.nombres,''))) AS docente_nombre,
              (SELECT COUNT(*) FROM horario_gen_entradas e
               WHERE e.version_id = ? AND e.carga_id = c.id) AS colocados
       FROM horario_gen_carga c
       LEFT JOIN cursos cur ON cur.id = c.curso_id
       LEFT JOIN personal p ON p.id = c.personal_id
       WHERE c.colegio_id = ? AND c.anio = ? AND c.grupo_id = ? AND c.activo = 1
       ORDER BY cur.nombre`,
      [versionId, cid, ver.anio, grupoId]
    );

    const pendientes = (cargas || []).map((c) => ({
      ...mapActivo(c),
      colocados: Number(c.colocados || 0),
      faltan: Math.max(0, Number(c.bloques_semanales || 0) - Number(c.colocados || 0)),
    }));

    res.json({
      version: ver,
      grupo,
      bloques: (bloques || []).map(mapActivo),
      entradas: (entradas || []).map((e) => ({ ...e, locked: toBool01(e.locked, 0) })),
      cargas: pendientes,
      dias: DIAS_SEMANA,
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al cargar editor.' });
  }
});

router.post('/validate-placement', async (req, res) => {
  try {
    const cid = colegio(req);
    const b = req.body || {};
    const result = await validatePlacement({
      colegioId: cid,
      versionId: parseId(b.version_id),
      diaSemana: parseInt(b.dia_semana, 10),
      bloqueId: parseId(b.bloque_id),
      grupoId: parseId(b.grupo_id),
      cargaId: parseId(b.carga_id),
      excludeEntradaId: parseId(b.exclude_entrada_id),
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al validar.' });
  }
});

router.post('/entradas', async (req, res) => {
  try {
    const cid = colegio(req);
    const b = req.body || {};
    const versionId = parseId(b.version_id);
    const dia = parseInt(b.dia_semana, 10);
    const bloqueId = parseId(b.bloque_id);
    const grupoId = parseId(b.grupo_id);
    const cargaId = parseId(b.carga_id);
    const textoLibre = String(b.texto_libre || '').trim() || null;

    const result = await validatePlacement({
      colegioId: cid,
      versionId,
      diaSemana: dia,
      bloqueId,
      grupoId,
      cargaId,
      textoLibre,
    });
    if (!result.valid) {
      return res.status(409).json({ error: result.errors.join(' '), ...result });
    }

    let curso_id = null;
    let asignatura_id = null;
    let personal_id = null;
    let carga_id = null;
    let texto_libre = null;

    if (textoLibre && !cargaId) {
      texto_libre = textoLibre.slice(0, 120);
    } else {
      const cargaRows = await query(`SELECT * FROM horario_gen_carga WHERE id = ? AND colegio_id = ?`, [
        cargaId,
        cid,
      ]);
      const carga = cargaRows[0];
      curso_id = carga.curso_id || null;
      asignatura_id = carga.asignatura_id || null;
      personal_id = carga.personal_id || null;
      carga_id = cargaId;
    }

    const r = await execute(
      `INSERT INTO horario_gen_entradas
        (version_id, bloque_id, dia_semana, grupo_id, curso_id, asignatura_id, personal_id, carga_id, texto_libre, locked)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [versionId, bloqueId, dia, grupoId, curso_id, asignatura_id, personal_id, carga_id, texto_libre]
    );
    const rows = await query(`SELECT * FROM horario_gen_entradas WHERE id = ?`, [r.insertId]);
    res.status(201).json({ entrada: rows[0], warnings: result.warnings });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ese bloque ya está ocupado para el grupo.' });
    }
    if (e.code === 'ER_BAD_FIELD_ERROR' || String(e.message || '').includes('texto_libre')) {
      return res.status(503).json({
        error:
          'Falta la columna texto_libre. En phpMyAdmin ejecute el ALTER al final de sql/horario_gen_modulo.sql',
        code: 'MIGRATION_REQUIRED',
      });
    }
    res.status(500).json({ error: e.message || 'Error al colocar clase.' });
  }
});

router.put('/entradas/:id', async (req, res) => {
  try {
    const cid = colegio(req);
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const curRows = await query(
      `SELECT e.*, v.colegio_id
       FROM horario_gen_entradas e
       INNER JOIN horario_gen_versiones v ON v.id = e.version_id
       WHERE e.id = ? LIMIT 1`,
      [id]
    );
    if (!curRows?.length || Number(curRows[0].colegio_id) !== Number(cid)) {
      return res.status(404).json({ error: 'Entrada no encontrada' });
    }
    const cur = curRows[0];
    if (toBool01(cur.locked, 0)) {
      return res.status(409).json({ error: 'La clase está bloqueada. Desbloquéela para moverla.' });
    }

    const b = req.body || {};
    const dia = parseInt(b.dia_semana != null ? b.dia_semana : cur.dia_semana, 10);
    const bloqueId = parseId(b.bloque_id) || cur.bloque_id;
    const cargaId = cur.carga_id;
    const textoLibre = cur.texto_libre || null;

    const result = await validatePlacement({
      colegioId: cid,
      versionId: cur.version_id,
      diaSemana: dia,
      bloqueId,
      grupoId: cur.grupo_id,
      cargaId,
      textoLibre: !cargaId ? textoLibre : null,
      excludeEntradaId: id,
    });
    if (!result.valid) {
      return res.status(409).json({ error: result.errors.join(' '), ...result });
    }

    await execute(
      `UPDATE horario_gen_entradas SET dia_semana = ?, bloque_id = ? WHERE id = ?`,
      [dia, bloqueId, id]
    );
    const updated = await query(`SELECT * FROM horario_gen_entradas WHERE id = ?`, [id]);
    res.json({ entrada: updated[0], warnings: result.warnings });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ese bloque ya está ocupado para el grupo.' });
    }
    res.status(500).json({ error: e.message || 'Error al mover clase.' });
  }
});

router.patch('/entradas/:id/lock', async (req, res) => {
  try {
    const cid = colegio(req);
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const curRows = await query(
      `SELECT e.id, v.colegio_id FROM horario_gen_entradas e
       INNER JOIN horario_gen_versiones v ON v.id = e.version_id WHERE e.id = ? LIMIT 1`,
      [id]
    );
    if (!curRows?.length || Number(curRows[0].colegio_id) !== Number(cid)) {
      return res.status(404).json({ error: 'Entrada no encontrada' });
    }
    const locked = toBool01(req.body?.locked, 1);
    await execute(`UPDATE horario_gen_entradas SET locked = ? WHERE id = ?`, [locked, id]);
    res.json({ message: locked ? 'Bloqueada' : 'Desbloqueada', locked });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al bloquear.' });
  }
});

router.delete('/entradas/:id', async (req, res) => {
  try {
    const cid = colegio(req);
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const curRows = await query(
      `SELECT e.*, v.colegio_id FROM horario_gen_entradas e
       INNER JOIN horario_gen_versiones v ON v.id = e.version_id WHERE e.id = ? LIMIT 1`,
      [id]
    );
    if (!curRows?.length || Number(curRows[0].colegio_id) !== Number(cid)) {
      return res.status(404).json({ error: 'Entrada no encontrada' });
    }
    if (toBool01(curRows[0].locked, 0)) {
      return res.status(409).json({ error: 'La clase está bloqueada.' });
    }
    await execute(`DELETE FROM horario_gen_entradas WHERE id = ?`, [id]);
    res.json({ message: 'Clase quitada del horario piloto.' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al eliminar entrada.' });
  }
});

// ─── Solver automático (fase 5) ─────────────────────────────────────────────

const {
  solveInMemory,
  loadSolverContext,
  persistPlacements,
} = require('../utils/horarioGenSolver');

router.post('/solver/generar', async (req, res) => {
  const cid = colegio(req);
  let runId = null;
  try {
    const anioActivo = await anioActivoColegio(cid);
    const b = req.body || {};
    const anio = parseAnio(b.anio, anioActivo);
    const nivel_id = parseId(b.nivel_id);
    if (!nivel_id) return res.status(400).json({ error: 'nivel_id obligatorio' });

    const maxAlt = Math.min(3, Math.max(1, parseInt(b.max_alternatives, 10) || 1));
    const seedBase = Number.isFinite(Number(b.seed)) ? Number(b.seed) : Date.now() % 100000;
    let grupoIds = null;
    if (Array.isArray(b.grupo_ids) && b.grupo_ids.length) {
      grupoIds = [...new Set(b.grupo_ids.map((x) => parseId(x)).filter(Boolean))];
    }
    const soloGrupos = Boolean(grupoIds?.length);
    const reuseVersionId = parseId(b.version_id);

    const runIns = await execute(
      `INSERT INTO horario_gen_runs
        (colegio_id, anio, version_id, estado, progreso, mensaje, created_by, started_at)
       VALUES (?, ?, NULL, 'ANALYZING', 5, 'Analizando carga y disponibilidad…', ?, NOW())`,
      [cid, anio, req.user?.id || null]
    );
    runId = runIns.insertId;

    // Contexto completo del nivel (bloques); las cargas se filtran si es solo un grupo
    const ctxAll = await loadSolverContext({
      colegioId: cid,
      anio,
      nivelId: nivel_id,
      grupoIds: null,
    });
    const cargasSolve = soloGrupos
      ? (ctxAll.cargas || []).filter((c) => grupoIds.includes(Number(c.grupo_id)))
      : ctxAll.cargas || [];

    await execute(
      `UPDATE horario_gen_runs SET estado = 'SOLVING', progreso = 25, mensaje = ? WHERE id = ?`,
      [`Resolviendo ${cargasSolve.length} cargas…`, runId]
    );

    const nv = await query(`SELECT nombre FROM niveles WHERE id = ?`, [nivel_id]);
    const nivelNombre = nv?.[0]?.nombre || `Nivel ${nivel_id}`;

    let alcanceLabel = nivelNombre;
    if (soloGrupos) {
      const gs = await query(
        `SELECT g.grado, g.seccion, n.nombre AS nivel_nombre
         FROM grupos g
         LEFT JOIN niveles n ON n.id = g.nivel_id
         WHERE g.id IN (${grupoIds.map(() => '?').join(',')})`,
        grupoIds
      );
      alcanceLabel = (gs || [])
        .map((g) => formatGrupoLabel(g.nivel_nombre, g.grado, g.seccion))
        .join(', ') || `${nivelNombre} (grupos)`;
    }

    if (!cargasSolve.length) {
      await execute(
        `UPDATE horario_gen_runs SET estado = 'FAILED', progreso = 100, mensaje = ?, finished_at = NOW() WHERE id = ?`,
        [
          soloGrupos
            ? 'Ese grupo no tiene carga semanal. Impórtala en «3. Carga semanal».'
            : 'No hay carga semanal para ese nivel. Impórtala en «3. Carga semanal».',
          runId,
        ]
      );
      return res.status(400).json({
        error: soloGrupos
          ? 'Ese grupo no tiene carga semanal activa. Ve a «3. Carga semanal» e importa asignaturas.'
          : 'No hay carga semanal para ese nivel. Ve a «3. Carga semanal» e importa asignaturas.',
        code: 'NO_CARGA',
      });
    }

    let lockedPlacements = [];
    let targetVersionId = null;
    if (reuseVersionId) {
      const ver = await assertVersionOwned(reuseVersionId, cid);
      if (!ver) {
        return res.status(404).json({ error: 'Versión a reutilizar no encontrada' });
      }
      if (Number(ver.nivel_id) !== Number(nivel_id) || Number(ver.anio) !== Number(anio)) {
        return res.status(400).json({
          error: 'El horario no pertenece a este nivel/año.',
        });
      }
      targetVersionId = reuseVersionId;

      // Celdas 🔒 + (si solo un grupo) el resto de aulas ya armadas → no chocar docentes
      let lockSql = `
        SELECT e.dia_semana AS dia, e.bloque_id, e.grupo_id, e.curso_id, e.asignatura_id,
               COALESCE(e.personal_id, cg.personal_id) AS personal_id, e.carga_id, e.locked
        FROM horario_gen_entradas e
        LEFT JOIN horario_gen_carga cg ON cg.id = e.carga_id
        WHERE e.version_id = ?
      `;
      const lockParams = [reuseVersionId];
      if (soloGrupos) {
        lockSql += ` AND (e.locked = 1 OR e.grupo_id NOT IN (${grupoIds.map(() => '?').join(',')}))`;
        lockParams.push(...grupoIds);
      } else {
        lockSql += ' AND e.locked = 1';
      }
      const lockedRows = await query(lockSql, lockParams);
      lockedPlacements = (lockedRows || []).map((p) => ({
        dia: Number(p.dia),
        bloque_id: Number(p.bloque_id),
        grupo_id: Number(p.grupo_id),
        curso_id: p.curso_id || null,
        asignatura_id: p.asignatura_id || null,
        personal_id: p.personal_id ? Number(p.personal_id) : null,
        carga_id: p.carga_id ? Number(p.carga_id) : null,
      }));
    }

    const { loadExternalTeacherIntervals } = require('../utils/horarioGenTeacherBusy');
    const externalTeacherIntervals = await loadExternalTeacherIntervals({
      colegioId: cid,
      anio,
      excludeNivelId: nivel_id,
    });

    const alternatives = [];
    const seedsTried = [];

    for (let i = 0; i < maxAlt; i += 1) {
      const seed = seedBase + i * 97;
      seedsTried.push(seed);

      let versionId = targetVersionId;
      if (!versionId) {
        const verIns = await execute(
          `INSERT INTO horario_gen_versiones
            (colegio_id, anio, nivel_id, config_id, nombre, estado, created_by)
           VALUES (?, ?, ?, ?, ?, 'DRAFT', ?)`,
          [
            cid,
            anio,
            nivel_id,
            ctxAll.config.id,
            `Horario · ${alcanceLabel} · ${anio}`,
            req.user?.id || null,
          ]
        );
        versionId = verIns.insertId;
      }

      const result = solveInMemory({
        cargas: cargasSolve,
        classBlocks: ctxAll.classBlocks,
        allBlocksSorted: ctxAll.allBlocksSorted,
        dispByTeacherDay: ctxAll.dispByTeacherDay,
        lockedPlacements,
        externalTeacherIntervals,
        seed,
        docentesNombres: ctxAll.docentesNombres,
      });

      const inserted = await persistPlacements(versionId, result.placements, {
        onlyGrupoIds: soloGrupos ? grupoIds : null,
      });
      await execute(`UPDATE horario_gen_versiones SET score = ? WHERE id = ?`, [
        result.score,
        versionId,
      ]);

      alternatives.push({
        version_id: versionId,
        nombre: soloGrupos ? `Generado · ${alcanceLabel}` : 'Generado · nivel',
        ok: result.ok,
        score: result.score,
        placed: result.placed,
        total: result.total,
        inserted,
        nodes: result.nodes,
        unplaced: result.unplaced,
        diagnostico: result.diagnostico,
        seed,
        alcance: soloGrupos ? 'grupo' : 'nivel',
      });

      if (targetVersionId || maxAlt === 1) break;
    }

    alternatives.sort((a, b) => {
      if (a.ok !== b.ok) return a.ok ? -1 : 1;
      return (b.score || 0) - (a.score || 0);
    });

    const best = alternatives[0];
    const allFailed = alternatives.every((a) => !a.ok);
    const diagnostico = {
      semillas: seedsTried,
      mejor: best
        ? {
            version_id: best.version_id,
            score: best.score,
            placed: best.placed,
            total: best.total,
            ok: best.ok,
          }
        : null,
      causas: best?.diagnostico?.causas || [],
      sugerencias: best?.diagnostico?.sugerencias || [],
      unplaced: best?.unplaced || [],
      alternativas: alternatives.map((a) => ({
        version_id: a.version_id,
        score: a.score,
        ok: a.ok,
        placed: a.placed,
        total: a.total,
      })),
    };

    await execute(
      `UPDATE horario_gen_runs
       SET version_id = ?, estado = ?, progreso = 100, mensaje = ?, diagnostico_json = ?, finished_at = NOW()
       WHERE id = ?`,
      [
        best?.version_id || null,
        allFailed ? 'FAILED' : 'COMPLETE',
        allFailed
          ? `Sin solución completa (${best?.placed || 0}/${best?.total || 0}). Revise diagnóstico.`
          : `Listo: ${best.placed}/${best.total} bloques · score ${best.score}%`,
        JSON.stringify(diagnostico),
        runId,
      ]
    );

    res.json({
      run_id: runId,
      anio,
      nivel_id,
      estado: allFailed ? 'FAILED' : 'COMPLETE',
      best,
      alternatives,
      diagnostico,
      aviso: 'Resultados solo en horario_gen_*. No se modificó grupos_horarios.',
    });
  } catch (e) {
    if (runId) {
      try {
        await execute(
          `UPDATE horario_gen_runs
           SET estado = 'FAILED', progreso = 100, mensaje = ?, finished_at = NOW()
           WHERE id = ?`,
          [String(e.message || 'Error').slice(0, 500), runId]
        );
      } catch {
        /* ignore */
      }
    }
    if (e.code === 'NO_CONFIG' || e.code === 'NO_BLOQUES' || e.code === 'ER_NO_SUCH_TABLE') {
      return res.status(400).json({ error: e.message, code: e.code });
    }
    res.status(500).json({ error: e.message || 'Error en el solver.' });
  }
});

router.get('/solver/runs', async (req, res) => {
  try {
    const cid = colegio(req);
    const anioActivo = await anioActivoColegio(cid);
    const anio = parseAnio(req.query.anio, anioActivo);
    const rows = await query(
      `SELECT * FROM horario_gen_runs
       WHERE colegio_id = ? AND anio = ?
       ORDER BY id DESC LIMIT 20`,
      [cid, anio]
    );
    res.json({
      anio,
      runs: (rows || []).map((r) => ({
        ...r,
        diagnostico: r.diagnostico_json
          ? (() => {
              try {
                return JSON.parse(r.diagnostico_json);
              } catch {
                return null;
              }
            })()
          : null,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al listar runs.' });
  }
});

router.get('/solver/runs/:id', async (req, res) => {
  try {
    const cid = colegio(req);
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const rows = await query(
      `SELECT * FROM horario_gen_runs WHERE id = ? AND colegio_id = ? LIMIT 1`,
      [id, cid]
    );
    if (!rows?.length) return res.status(404).json({ error: 'Run no encontrado' });
    const r = rows[0];
    let diagnostico = null;
    try {
      diagnostico = r.diagnostico_json ? JSON.parse(r.diagnostico_json) : null;
    } catch {
      diagnostico = null;
    }
    res.json({ run: { ...r, diagnostico } });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al obtener run.' });
  }
});

/** Eliminar una generación: borra el run y el borrador asociado (si no está publicado). */
router.delete('/solver/runs/:id', async (req, res) => {
  try {
    const cid = colegio(req);
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const rows = await query(
      `SELECT * FROM horario_gen_runs WHERE id = ? AND colegio_id = ? LIMIT 1`,
      [id, cid]
    );
    if (!rows?.length) return res.status(404).json({ error: 'Ejecución no encontrada' });
    const run = rows[0];

    let versionBorrada = false;
    const versionIds = new Set();
    if (run.version_id) versionIds.add(Number(run.version_id));
    try {
      const diag = run.diagnostico_json ? JSON.parse(run.diagnostico_json) : null;
      for (const a of diag?.alternativas || []) {
        if (a?.version_id) versionIds.add(Number(a.version_id));
      }
      if (diag?.mejor?.version_id) versionIds.add(Number(diag.mejor.version_id));
    } catch {
      /* ignore */
    }

    for (const versionId of versionIds) {
      const ver = await assertVersionOwned(versionId, cid);
      if (!ver) continue;
      if (ver.estado === 'PUBLISHED') {
        return res.status(409).json({
          error:
            'Hay un borrador de esta generación ya publicado como principal. No se puede borrar desde aquí.',
        });
      }
      await execute(`DELETE FROM horario_gen_versiones WHERE id = ? AND colegio_id = ?`, [
        versionId,
        cid,
      ]);
      versionBorrada = true;
    }

    await execute(`DELETE FROM horario_gen_runs WHERE id = ? AND colegio_id = ?`, [id, cid]);

    res.json({
      message: versionBorrada
        ? 'Generación y borrador(es) eliminados.'
        : 'Ejecución eliminada.',
      version_borrada: versionBorrada,
      versiones_eliminadas: [...versionIds],
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al eliminar generación.' });
  }
});

// ─── Vista final / resultado (fase 6 — preview antes de vincular) ───────────

/**
 * PDF docentes del año completo (mezcla Inicial/Primaria/Secundaria).
 * Por cada nivel toma la mejor versión (PUBLISHED > APPROVED > REVIEW > DRAFT).
 * Unifica franjas por hora_inicio/hora_fin/tipo para una sola grilla.
 */
router.get('/pdf-docentes', async (req, res) => {
  try {
    const cid = colegio(req);
    const anioActivo = await anioActivoColegio(cid);
    const anio = parseAnio(req.query.anio, anioActivo);

    const versiones = await query(
      `SELECT v.*, n.nombre AS nivel_nombre,
              (SELECT COUNT(*) FROM horario_gen_entradas e WHERE e.version_id = v.id) AS total_entradas
       FROM horario_gen_versiones v
       LEFT JOIN niveles n ON n.id = v.nivel_id
       WHERE v.colegio_id = ? AND v.anio = ? AND v.estado <> 'ARCHIVED'
       ORDER BY v.updated_at DESC, v.id DESC`,
      [cid, anio]
    );

    const rankEstado = (est) => {
      const e = String(est || '').toUpperCase();
      if (e === 'PUBLISHED') return 4;
      if (e === 'APPROVED') return 3;
      if (e === 'REVIEW') return 2;
      if (e === 'DRAFT') return 1;
      return 0;
    };

    const bestByNivel = new Map();
    for (const v of versiones || []) {
      if (!Number(v.total_entradas || 0)) continue;
      const key = v.nivel_id != null ? Number(v.nivel_id) : `cfg-${v.config_id}`;
      const prev = bestByNivel.get(key);
      if (!prev) {
        bestByNivel.set(key, v);
        continue;
      }
      const rNew = rankEstado(v.estado);
      const rOld = rankEstado(prev.estado);
      if (rNew > rOld) bestByNivel.set(key, v);
      else if (rNew === rOld && Number(v.total_entradas) > Number(prev.total_entradas)) {
        bestByNivel.set(key, v);
      }
    }

    const chosen = [...bestByNivel.values()];
    if (!chosen.length) {
      return res.json({
        anio,
        bloques: [],
        docentes: [],
        versiones_usadas: [],
        aviso: 'No hay versiones con clases para este año.',
      });
    }

    const versionIds = chosen.map((v) => Number(v.id));
    const placeholders = versionIds.map(() => '?').join(',');

    const bloquesRaw = await query(
      `SELECT b.*, v.id AS version_id, v.nivel_id, v.config_id
       FROM horario_gen_bloques b
       INNER JOIN horario_gen_versiones v ON v.config_id = b.config_id
       WHERE v.id IN (${placeholders}) AND b.activo = 1
       ORDER BY b.hora_inicio ASC, b.orden ASC, b.id ASC`,
      versionIds
    );

    const slotMap = new Map();
    for (const b of bloquesRaw || []) {
      const hi = toHhMm(b.hora_inicio);
      const hf = toHhMm(b.hora_fin);
      const key = `${hi}|${hf}|${String(b.tipo || 'CLASS').toUpperCase()}`;
      if (!slotMap.has(key)) {
        slotMap.set(key, {
          key,
          hora_inicio: hi || b.hora_inicio,
          hora_fin: hf || b.hora_fin,
          tipo: String(b.tipo || 'CLASS').toUpperCase(),
          nombre: b.nombre || hi,
          orden: Number(b.orden) || 0,
          source_ids: [Number(b.id)],
        });
      } else {
        slotMap.get(key).source_ids.push(Number(b.id));
      }
    }

    const bloquesUnificados = [...slotMap.values()]
      .sort((a, b) => {
        const ta = String(a.hora_inicio || '');
        const tb = String(b.hora_inicio || '');
        if (ta !== tb) return ta.localeCompare(tb);
        return (a.orden || 0) - (b.orden || 0);
      })
      .map((slot, idx) => ({
        id: idx + 1,
        nombre: slot.nombre,
        hora_inicio: slot.hora_inicio,
        hora_fin: slot.hora_fin,
        tipo: slot.tipo,
        orden: idx + 1,
        activo: 1,
        source_ids: slot.source_ids,
      }));

    const bloqueIdBySource = new Map();
    for (const u of bloquesUnificados) {
      for (const sid of u.source_ids) bloqueIdBySource.set(sid, u.id);
    }

    const entradas = await query(
      `SELECT e.*,
              COALESCE(cur.nombre, e.texto_libre) AS curso_nombre,
              g.grado, g.seccion, g.nivel_id,
              n.nombre AS nivel_nombre,
              TRIM(CONCAT(COALESCE(p.apellidos,''), ' ', COALESCE(p.nombres,''))) AS docente_nombre,
              cg.color AS carga_color, cg.bloques_semanales,
              e.version_id
       FROM horario_gen_entradas e
       INNER JOIN grupos g ON g.id = e.grupo_id
       LEFT JOIN niveles n ON n.id = g.nivel_id
       LEFT JOIN cursos cur ON cur.id = e.curso_id
       LEFT JOIN personal p ON p.id = e.personal_id
       LEFT JOIN horario_gen_carga cg ON cg.id = e.carga_id
       WHERE e.version_id IN (${placeholders})
       ORDER BY n.nombre, g.grado, g.seccion, e.dia_semana, e.bloque_id`,
      versionIds
    );

    const byDocente = new Map();
    for (const e of entradas || []) {
      const pid = e.personal_id ? Number(e.personal_id) : 0;
      if (!pid) continue;
      const mappedBloque = bloqueIdBySource.get(Number(e.bloque_id));
      if (!mappedBloque) continue;
      if (!byDocente.has(pid)) {
        byDocente.set(pid, {
          personal_id: pid,
          nombre: e.docente_nombre || 'Sin docente',
          entradas: [],
        });
      }
      byDocente.get(pid).entradas.push({
        ...e,
        bloque_id: mappedBloque,
        locked: toBool01(e.locked, 0),
        grupo_label: formatGrupoLabel(e.nivel_nombre, e.grado, e.seccion),
        carga_color: e.carga_color || null,
      });
    }

    res.json({
      anio,
      bloques: bloquesUnificados,
      docentes: [...byDocente.values()].sort((a, b) =>
        String(a.nombre).localeCompare(String(b.nombre), 'es')
      ),
      versiones_usadas: chosen.map((v) => ({
        id: v.id,
        nivel_id: v.nivel_id,
        nivel_nombre: v.nivel_nombre,
        estado: v.estado,
        nombre: v.nombre,
        total_entradas: Number(v.total_entradas || 0),
      })),
      aviso:
        'Incluye la mejor versión de cada nivel del año (Inicial, Primaria, Secundaria, etc.).',
    });
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({
        error: 'Faltan tablas horario_gen_*. Ejecute sql/horario_gen_modulo.sql en phpMyAdmin.',
        code: 'TABLES_MISSING',
      });
    }
    res.status(500).json({ error: e.message || 'Error al cargar PDF docentes.' });
  }
});

router.get('/vista-final', async (req, res) => {
  try {
    const cid = colegio(req);
    const versionId = parseId(req.query.version_id);
    if (!versionId) return res.status(400).json({ error: 'version_id obligatorio' });

    const ver = await assertVersionOwned(versionId, cid);
    if (!ver) return res.status(404).json({ error: 'Versión no encontrada' });

    const bloques = await query(
      `SELECT * FROM horario_gen_bloques
       WHERE config_id = ? AND activo = 1
       ORDER BY orden ASC, id ASC`,
      [ver.config_id]
    );

    const entradas = await query(
      `SELECT e.*,
              COALESCE(cur.nombre, e.texto_libre) AS curso_nombre,
              g.grado, g.seccion, g.nivel_id,
              n.nombre AS nivel_nombre,
              TRIM(CONCAT(COALESCE(p.apellidos,''), ' ', COALESCE(p.nombres,''))) AS docente_nombre,
              cg.color AS carga_color, cg.bloques_semanales
       FROM horario_gen_entradas e
       INNER JOIN grupos g ON g.id = e.grupo_id
       LEFT JOIN niveles n ON n.id = g.nivel_id
       LEFT JOIN cursos cur ON cur.id = e.curso_id
       LEFT JOIN personal p ON p.id = e.personal_id
       LEFT JOIN horario_gen_carga cg ON cg.id = e.carga_id
       WHERE e.version_id = ?
       ORDER BY n.nombre, g.grado, g.seccion, e.dia_semana, e.bloque_id`,
      [versionId]
    );

    const byGrupo = new Map();
    const byDocente = new Map();

    for (const e of entradas || []) {
      const gid = Number(e.grupo_id);
      if (!byGrupo.has(gid)) {
        byGrupo.set(gid, {
          grupo_id: gid,
          label: formatGrupoLabel(e.nivel_nombre, e.grado, e.seccion),
          grado: e.grado,
          seccion: e.seccion,
          nivel_nombre: e.nivel_nombre,
          entradas: [],
        });
      }
      byGrupo.get(gid).entradas.push({
        ...e,
        locked: toBool01(e.locked, 0),
      });

      const pid = e.personal_id ? Number(e.personal_id) : 0;
      const dkey = pid || `sin-${e.id}`;
      if (!byDocente.has(dkey)) {
        byDocente.set(dkey, {
          personal_id: pid || null,
          nombre: e.docente_nombre || 'Sin docente',
          entradas: [],
        });
      }
      byDocente.get(dkey).entradas.push({
        ...e,
        locked: toBool01(e.locked, 0),
        grupo_label: formatGrupoLabel(e.nivel_nombre, e.grado, e.seccion),
      });
    }

    // Carga esperada vs colocada
    let cargaSql = `
      SELECT c.id, c.grupo_id, c.bloques_semanales, c.personal_id,
             cur.nombre AS curso_nombre,
             g.grado, g.seccion, n.nombre AS nivel_nombre
      FROM horario_gen_carga c
      INNER JOIN grupos g ON g.id = c.grupo_id
      LEFT JOIN niveles n ON n.id = g.nivel_id
      LEFT JOIN cursos cur ON cur.id = c.curso_id
      WHERE c.colegio_id = ? AND c.anio = ? AND c.activo = 1
    `;
    const cargaParams = [cid, ver.anio];
    if (ver.nivel_id) {
      cargaSql += ' AND g.nivel_id = ?';
      cargaParams.push(ver.nivel_id);
    }
    const cargas = await query(cargaSql, cargaParams);
    let totalEsperado = 0;
    let totalColocado = 0;
    const pendientes = [];
    for (const c of cargas || []) {
      const need = Number(c.bloques_semanales || 0);
      totalEsperado += need;
      const n = (entradas || []).filter((e) => Number(e.carga_id) === Number(c.id)).length;
      totalColocado += n;
      if (n < need) {
        pendientes.push({
          carga_id: c.id,
          curso: c.curso_nombre,
          grupo: formatGrupoLabel(c.nivel_nombre, c.grado, c.seccion),
          colocados: n,
          necesarios: need,
          faltan: need - n,
        });
      }
    }

    const nivelRows = ver.nivel_id
      ? await query(`SELECT nombre FROM niveles WHERE id = ? LIMIT 1`, [ver.nivel_id])
      : [];

    res.json({
      version: {
        ...ver,
        nivel_nombre: nivelRows?.[0]?.nombre || null,
      },
      bloques: (bloques || []).map(mapActivo),
      dias: DIAS_SEMANA,
      grupos: [...byGrupo.values()],
      docentes: [...byDocente.values()].sort((a, b) =>
        String(a.nombre).localeCompare(String(b.nombre), 'es')
      ),
      resumen: {
        total_entradas: (entradas || []).length,
        total_grupos: byGrupo.size,
        total_docentes: [...byDocente.keys()].filter((k) => !String(k).startsWith('sin-')).length,
        bloques_esperados: totalEsperado,
        bloques_colocados: totalColocado,
        completitud_pct:
          totalEsperado > 0 ? Math.round((totalColocado / totalEsperado) * 100) : 0,
        pendientes,
      },
      aviso:
        'Vista previa del piloto. Aún NO está vinculado a grupos_horarios (docentes/alumnos del sistema).',
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al cargar vista final.' });
  }
});

const ESTADOS_VERSION = new Set(['DRAFT', 'REVIEW', 'APPROVED', 'ARCHIVED']);

router.patch('/versiones/:id/estado', async (req, res) => {
  try {
    const cid = colegio(req);
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const ver = await assertVersionOwned(id, cid);
    if (!ver) return res.status(404).json({ error: 'Versión no encontrada' });

    const estado = String(req.body?.estado || '').toUpperCase();
    if (!ESTADOS_VERSION.has(estado)) {
      return res.status(400).json({
        error: 'Estado inválido. Use DRAFT, REVIEW, APPROVED o ARCHIVED. Para horario principal use Publicar.',
      });
    }

    await execute(
      `UPDATE horario_gen_versiones SET estado = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND colegio_id = ?`,
      [estado, id, cid]
    );
    const rows = await query(`SELECT * FROM horario_gen_versiones WHERE id = ?`, [id]);
    res.json({
      version: rows[0],
      message:
        estado === 'APPROVED'
          ? 'Aprobada. Ya puedes publicarla como horario principal (docentes/alumnos).'
          : `Estado actualizado a ${estado}`,
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al cambiar estado.' });
  }
});

/**
 * Publicar borrador → horario principal del sistema (grupos_horarios).
 * Opt-in explícito: requiere confirmar = "PUBLICAR".
 * Opcional: grupo_id para publicar solo un aula (ej. Inicial 3 Años).
 */
router.post('/versiones/:id/vincular', async (req, res) => {
  try {
    const cid = colegio(req);
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const ver = await assertVersionOwned(id, cid);
    if (!ver) return res.status(404).json({ error: 'Versión no encontrada' });

    const confirmar = String(req.body?.confirmar || '').trim().toUpperCase();
    if (confirmar !== 'PUBLICAR') {
      return res.status(400).json({
        error: 'Para publicar como horario principal envíe confirmar: "PUBLICAR".',
      });
    }

    const onlyGrupoId = parseId(req.body?.grupo_id);

    const entradas = await query(
      `SELECT e.*,
              b.hora_inicio, b.hora_fin, b.tipo AS bloque_tipo, b.nombre AS bloque_nombre,
              COALESCE(cur.nombre, e.texto_libre) AS curso_nombre,
              g.grado, g.seccion, n.nombre AS nivel_nombre
       FROM horario_gen_entradas e
       INNER JOIN horario_gen_bloques b ON b.id = e.bloque_id
       INNER JOIN grupos g ON g.id = e.grupo_id
       LEFT JOIN niveles n ON n.id = g.nivel_id
       LEFT JOIN cursos cur ON cur.id = e.curso_id
       WHERE e.version_id = ?
         ${onlyGrupoId ? 'AND e.grupo_id = ?' : ''}`,
      onlyGrupoId ? [id, onlyGrupoId] : [id]
    );

    if (!entradas?.length) {
      return res.status(400).json({
        error: onlyGrupoId
          ? 'Ese grupo no tiene clases en este borrador. Colócalas en el Editor primero.'
          : 'El borrador no tiene clases. Completa el Editor o genera con el Solver.',
      });
    }

    const grupoIds = [...new Set(entradas.map((e) => Number(e.grupo_id)))];

    // Formato legacy según datos ya existentes del año
    const samples = await query(
      `SELECT dia, hora_inicio FROM grupos_horarios WHERE anio = ? LIMIT 40`,
      [ver.anio]
    );
    const useDayNames = (samples || []).some((s) => /lunes|martes|miercoles|miércoles|jueves|viernes/i.test(String(s.dia || '')));
    const useAmPm = (samples || []).some((s) => /AM|PM/i.test(String(s.hora_inicio || '')));

    const formatDia = (n) => {
      const d = Number(n);
      if (useDayNames) return DIA_NOMBRE[d] || String(d);
      return d;
    };
    const formatHora = (t) => (useAmPm ? toAmPmTime(t) : toHhMm(t));

    // Reemplazar horario actual de esos grupos en el año
    const ph = grupoIds.map(() => '?').join(',');
    await execute(
      `DELETE gh FROM grupos_horarios gh
       LEFT JOIN asignaturas a ON a.id = gh.asignatura_id
       WHERE gh.anio = ?
         AND (gh.grupo_id IN (${ph}) OR a.grupo_id IN (${ph}))`,
      [ver.anio, ...grupoIds, ...grupoIds]
    );

    let insertados = 0;

    // Clases
    for (const e of entradas) {
      const dia = formatDia(e.dia_semana);
      const hora_inicio = formatHora(e.hora_inicio);
      const hora_final = formatHora(e.hora_fin);
      const descripcion = e.texto_libre || e.curso_nombre || e.bloque_nombre || 'Clase';
      await execute(
        `INSERT INTO grupos_horarios
           (grupo_id, asignatura_id, personal_id, dia, hora_inicio, hora_final, descripcion, tipo, anio)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'GRUPO', ?)`,
        [
          Number(e.grupo_id),
          e.texto_libre ? 0 : e.asignatura_id ? Number(e.asignatura_id) : 0,
          e.personal_id ? Number(e.personal_id) : 0,
          dia,
          hora_inicio,
          hora_final,
          descripcion,
          ver.anio,
        ]
      );
      insertados += 1;
    }

    // Recreos / almuerzos de la config (para que se vean en el horario publicado)
    if (ver.config_id) {
      const bloquesBreak = await query(
        `SELECT * FROM horario_gen_bloques
         WHERE config_id = ? AND activo = 1 AND tipo IN ('BREAK','LUNCH')
         ORDER BY orden ASC, id ASC`,
        [ver.config_id]
      );
      for (const gid of grupoIds) {
        for (const b of bloquesBreak || []) {
          const desc = b.tipo === 'LUNCH' ? 'Almuerzo' : 'Recreo';
          for (const d of [1, 2, 3, 4, 5]) {
            await execute(
              `INSERT INTO grupos_horarios
                 (grupo_id, asignatura_id, personal_id, dia, hora_inicio, hora_final, descripcion, tipo, anio)
               VALUES (?, 0, 0, ?, ?, ?, ?, 'GRUPO', ?)`,
              [gid, formatDia(d), formatHora(b.hora_inicio), formatHora(b.hora_fin), desc, ver.anio]
            );
            insertados += 1;
          }
        }
      }
    }

    // Otras versiones PUBLISHED del mismo nivel/año → ARCHIVED
    await execute(
      `UPDATE horario_gen_versiones
       SET estado = 'ARCHIVED', updated_at = CURRENT_TIMESTAMP
       WHERE colegio_id = ? AND anio = ? AND nivel_id = ? AND id <> ? AND estado = 'PUBLISHED'`,
      [cid, ver.anio, ver.nivel_id, id]
    );

    await execute(
      `UPDATE horario_gen_versiones
       SET estado = 'PUBLISHED', published_at = NOW(), updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND colegio_id = ?`,
      [id, cid]
    );

    const gruposLabels = [
      ...new Map(
        entradas.map((e) => [
          Number(e.grupo_id),
          formatGrupoLabel(e.nivel_nombre, e.grado, e.seccion),
        ])
      ).values(),
    ];

    res.json({
      ok: true,
      version_id: id,
      estado: 'PUBLISHED',
      grupos: gruposLabels,
      filas_insertadas: insertados,
      message: onlyGrupoId
        ? `Horario principal actualizado para ${gruposLabels[0] || 'el grupo'}. Ya lo ven docentes/alumnos.`
        : `Horario principal publicado (${gruposLabels.length} grupo(s)). Ya lo ven docentes/alumnos.`,
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al publicar horario principal.' });
  }
});

module.exports = router;
