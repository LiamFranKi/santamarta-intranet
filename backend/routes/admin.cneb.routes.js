/**
 * CNEB único: catálogo por nivel + mapeo de cursos + uso en bimestre de prueba.
 * La casilla de uso y el tipo del nivel van juntos: cualitativo marca CNEB, cuantitativo lo quita.
 * No borra notas ni sesiones.
 */
const express = require('express');
const router = express.Router();
const { query, execute, getAnioActivo } = require('../utils/mysql');
const { authenticateToken } = require('../middleware/auth');
const { esPaqueteAcademico } = require('../utils/coordinadorAcceso');
const {
  NIVELES,
  asegurarCatalogos,
  sembrarCatalogosTodos,
  contarTodos,
  fuenteDe,
  arbolCatalogo,
} = require('../utils/cnebCatalogoSeed');
const { armarBorrador } = require('../utils/cnebSesionBorrador');
const { generarSesionConIa, PROMPT_SESION_DEFAULT } = require('../utils/cnebGeminiSesion');
const { moduloActivo } = require('../utils/modulosSistema');
const {
  parseIntOrNull,
  leerCuerpoSesion,
  cargarSesion,
  insertarSesion,
  actualizarSesion,
  eliminarSesion,
  listarSesiones,
} = require('../utils/cnebSesionStore');
const {
  cargarAuxiliar,
  guardarAuxiliar,
  cargarCorte,
  guardarCorte,
  cargarConsolidado,
  guardarConsolidado,
  excelSiagieBuffer,
  excelConsolidadoBuffer,
} = require('../utils/cnebAuxiliar');
const { informePdfBuffer, libretaPdfBuffer, sesionPdfBuffer } = require('../utils/cnebPdfs');
const { piarActivosDelGrupo, varsGenerarSesionIa } = require('../utils/cnebPiarAula');
const { tiposPorNivelCneb } = require('../utils/cnebTipoNivel');

router.use(authenticateToken);
router.use((req, res, next) => {
  const tipo = req.user?.tipo;
  if (tipo === 'ADMINISTRADOR' || esPaqueteAcademico(tipo)) return next();
  return res.status(403).json({ error: 'Sin permiso para el módulo CNEB.' });
});

function colegio(req) {
  const n = Number(req.user?.colegio_id);
  return Number.isFinite(n) ? n : null;
}

function puedeEscribir(tipo) {
  return tipo === 'ADMINISTRADOR' || esPaqueteAcademico(tipo);
}

function parseNivel(raw) {
  const n = String(raw || 'INICIAL').toUpperCase();
  return NIVELES.includes(n) ? n : null;
}

function likeNivelSql(nivel) {
  if (nivel === 'PRIMARIA') return '%PRIMARIA%';
  if (nivel === 'SECUNDARIA') return '%SECUNDARIA%';
  return '%INICIAL%';
}

function normalizarNombre(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const HINTS_COMPLEMENTARIO = [
  'natacion',
  'finanza',
  'futbol',
  'danza',
  'ballet',
  'karate',
  'taller',
  'robotica',
  'ajedrez',
  'coro',
];

const HINTS_COMPLEMENTARIO_INICIAL = ['ingles', 'english', 'computo', 'computacion'];

const HINTS_AREA = [
  { codigo: 'PS', keys: ['personal social', 'psicosocial', 'identidad'] },
  { codigo: 'DPCC', keys: ['ciudadania', 'civica', 'desarrollo personal', 'tutoria'] },
  { codigo: 'CS', keys: ['ciencias sociales', 'historia', 'geografia'] },
  { codigo: 'REL', keys: ['religion', 'religiosa', 'catequesis'] },
  { codigo: 'PSI', keys: ['psicomot'] },
  { codigo: 'EF', keys: ['educacion fisica', 'ed fisica', 'motricidad'] },
  { codigo: 'ARTE', keys: ['arte', 'cultura', 'musica'] },
  { codigo: 'COM', keys: ['comunicacion', 'lenguaje', 'castellano'] },
  { codigo: 'ING', keys: ['ingles', 'english'] },
  { codigo: 'MAT', keys: ['matematic', 'logico'] },
  { codigo: 'CYT', keys: ['ciencia', 'tecnolog', 'exploracion'] },
  { codigo: 'EPT', keys: ['trabajo', 'emprend', 'ept'] },
  { codigo: 'TIC', keys: ['tic', 'informatica', 'virtual'] },
];

function hintsAreaNivel(nivel) {
  if (nivel !== 'INICIAL') return HINTS_AREA;
  return HINTS_AREA.map((h) => {
    if (h.codigo === 'PSI') {
      return {
        ...h,
        keys: [...h.keys, 'educacion fisica', 'ed fisica', 'motricidad', 'deporte'],
      };
    }
    if (h.codigo === 'EF') return { ...h, keys: [] };
    return h;
  });
}

function sugerirParaCurso(nombreCurso, areas, nivel) {
  const n = ` ${normalizarNombre(nombreCurso)} `;
  const extraIni = nivel === 'INICIAL' ? HINTS_COMPLEMENTARIO_INICIAL : [];
  if ([...HINTS_COMPLEMENTARIO, ...extraIni].some((h) => n.includes(h))) {
    return { tipo: 'complementario', area_id: null, area_codigo: null, area_nombre: null };
  }
  for (const hint of hintsAreaNivel(nivel)) {
    if (hint.keys.some((k) => n.includes(k))) {
      const area = (areas || []).find((a) => a.codigo === hint.codigo);
      if (area) {
        return {
          tipo: 'principal',
          area_id: area.id,
          area_codigo: area.codigo,
          area_nombre: area.nombre,
        };
      }
    }
  }
  return { tipo: 'principal', area_id: null, area_codigo: null, area_nombre: null };
}

async function leerUso(cid, anio) {
  try {
    const rows = await query(
      `SELECT nivel_cneb, activo, bimestre FROM cneb_uso_colegio
       WHERE colegio_id = ? AND anio = ?`,
      [cid, anio]
    );
    const by = new Map((rows || []).map((r) => [String(r.nivel_cneb).toUpperCase(), r]));
    const bimestre = Number(rows?.[0]?.bimestre || 4);
    const tipos = await tiposPorNivelCneb(cid);
    return {
      anio,
      bimestre,
      niveles: NIVELES.map((n) => ({
        nivel: n,
        activo: Number(by.get(n)?.activo || 0) === 1,
        cualitativo: tipos[n] === true,
      })),
    };
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR') {
      return {
        anio,
        bimestre: 4,
        niveles: NIVELES.map((n) => ({ nivel: n, activo: n === 'INICIAL' })),
        pendiente_migracion: true,
      };
    }
    throw e;
  }
}

router.get('/resumen', async (req, res) => {
  try {
    const cid = colegio(req);
    if (!cid) return res.status(400).json({ error: 'Usuario sin colegio.' });
    await asegurarCatalogos();
    const anio = (await getAnioActivo(cid)) || new Date().getFullYear();
    const [catalogo, uso] = await Promise.all([contarTodos(), leerUso(cid, anio)]);
    res.json({
      piloto: true,
      niveles: NIVELES,
      fuente_por_nivel: {
        INICIAL: fuenteDe('INICIAL'),
        PRIMARIA: fuenteDe('PRIMARIA'),
        SECUNDARIA: fuenteDe('SECUNDARIA'),
      },
      catalogo,
      uso,
      aviso:
        'El modo del año se elige en Niveles. Aquí solo se prueba un bimestre, sin cambiar ese modo.',
    });
  } catch (e) {
    console.error('[cneb/resumen]', e);
    res.status(500).json({ error: e.message || 'No se pudo cargar el resumen.' });
  }
});

router.put('/uso', async (req, res) => {
  try {
    if (!puedeEscribir(req.user?.tipo)) {
      return res.status(403).json({ error: 'Sin permiso para guardar el uso CNEB.' });
    }
    const cid = colegio(req);
    if (!cid) return res.status(400).json({ error: 'Usuario sin colegio.' });
    const anio = (await getAnioActivo(cid)) || new Date().getFullYear();
    const bimestre = Math.min(4, Math.max(1, parseInt(req.body?.bimestre, 10) || 4));
    const activos = req.body?.niveles || {};
    for (const n of NIVELES) {
      const activo = activos[n] === true || activos[n] === 1 || activos[n] === '1' ? 1 : 0;
      await execute(
        `INSERT INTO cneb_uso_colegio (colegio_id, anio, bimestre, nivel_cneb, activo)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE bimestre = VALUES(bimestre), activo = VALUES(activo)`,
        [cid, anio, bimestre, n, activo]
      );
    }
    res.json({ success: true, uso: await leerUso(cid, anio) });
  } catch (e) {
    console.error('[cneb/uso]', e);
    const msg =
      e.code === 'ER_NO_SUCH_TABLE'
        ? 'Falta aplicar la migración 093_cneb_uso_niveles_mysql.sql'
        : e.message || 'No se pudo guardar el uso.';
    res.status(500).json({ error: msg });
  }
});

router.get('/catalogo', async (req, res) => {
  try {
    const nivel = parseNivel(req.query.nivel);
    if (!nivel) return res.status(400).json({ error: 'Indique nivel: INICIAL, PRIMARIA o SECUNDARIA.' });
    res.json(await arbolCatalogo(nivel));
  } catch (e) {
    console.error('[cneb/catalogo]', e);
    res.status(500).json({ error: e.message || 'No se pudo cargar el catálogo CNEB.' });
  }
});

router.post('/catalogo/sembrar', async (req, res) => {
  try {
    if (req.user?.tipo !== 'ADMINISTRADOR') {
      return res.status(403).json({ error: 'Solo el administrador puede resembrar el catálogo.' });
    }
    const result = await sembrarCatalogosTodos();
    res.json(result);
  } catch (e) {
    console.error('[cneb/catalogo/sembrar]', e);
    res.status(500).json({ error: e.message || 'No se pudo sembrar el catálogo.' });
  }
});

router.get('/cursos', async (req, res) => {
  try {
    const cid = colegio(req);
    if (!cid) return res.status(400).json({ error: 'Usuario sin colegio.' });
    const nivel = parseNivel(req.query.nivel);
    if (!nivel) return res.status(400).json({ error: 'Indique nivel: INICIAL, PRIMARIA o SECUNDARIA.' });
    await asegurarCatalogos();

    const areas = await query(
      `SELECT id, codigo, nombre, tipo FROM cneb_areas
       WHERE nivel_cneb = ? AND activo = 1
       ORDER BY orden ASC, nombre ASC`,
      [nivel]
    );

    const cursos = await query(
      `SELECT c.id, c.nombre, c.abreviatura, c.nivel_id, n.nombre AS nivel_nombre
       FROM cursos c
       INNER JOIN niveles n ON n.id = c.nivel_id AND n.colegio_id = c.colegio_id
       WHERE c.colegio_id = ?
         AND UPPER(n.nombre) LIKE ?
       ORDER BY c.nombre ASC`,
      [cid, likeNivelSql(nivel)]
    );

    const mapas = await query(
      `SELECT curso_id, tipo, area_id FROM cneb_curso_mapa WHERE colegio_id = ?`,
      [cid]
    );
    const mapaBy = new Map((mapas || []).map((m) => [Number(m.curso_id), m]));
    const areaIdsNivel = new Set((areas || []).map((a) => Number(a.id)));

    const items = (cursos || []).map((c) => {
      const guardado = mapaBy.get(Number(c.id));
      const areaOk = guardado?.area_id != null && areaIdsNivel.has(Number(guardado.area_id));
      const sugerencia = sugerirParaCurso(c.nombre, areas, nivel);
      return {
        id: c.id,
        nombre: c.nombre,
        abreviatura: c.abreviatura,
        nivel_id: c.nivel_id,
        nivel_nombre: c.nivel_nombre,
        tipo: guardado?.tipo || null,
        area_id: areaOk ? Number(guardado.area_id) : null,
        sugerencia,
        mapeado: Boolean(guardado),
      };
    });

    res.json({ nivel, areas, cursos: items });
  } catch (e) {
    console.error('[cneb/cursos]', e);
    res.status(500).json({ error: e.message || 'No se pudieron listar los cursos.' });
  }
});

router.put('/cursos/mapa', async (req, res) => {
  try {
    if (!puedeEscribir(req.user?.tipo)) {
      return res.status(403).json({ error: 'Sin permiso para guardar el mapeo.' });
    }
    const cid = colegio(req);
    if (!cid) return res.status(400).json({ error: 'Usuario sin colegio.' });
    const nivel = parseNivel(req.body?.nivel);
    if (!nivel) return res.status(400).json({ error: 'Indique el nivel a guardar.' });
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ error: 'No hay cursos para guardar.' });

    const areas = await query(
      `SELECT id FROM cneb_areas WHERE nivel_cneb = ? AND activo = 1`,
      [nivel]
    );
    const areaIds = new Set((areas || []).map((a) => Number(a.id)));

    const cursosOk = await query(
      `SELECT c.id FROM cursos c
       INNER JOIN niveles n ON n.id = c.nivel_id AND n.colegio_id = c.colegio_id
       WHERE c.colegio_id = ?
         AND UPPER(n.nombre) LIKE ?`,
      [cid, likeNivelSql(nivel)]
    );
    const cursoIds = new Set((cursosOk || []).map((c) => Number(c.id)));

    let guardados = 0;
    for (const raw of items) {
      const cursoId = parseInt(raw.curso_id, 10);
      if (!cursoIds.has(cursoId)) continue;
      const tipo = String(raw.tipo || '') === 'complementario' ? 'complementario' : 'principal';
      let areaId = raw.area_id != null && raw.area_id !== '' ? parseInt(raw.area_id, 10) : null;
      if (tipo === 'complementario') areaId = null;
      if (areaId != null && !areaIds.has(areaId)) areaId = null;

      await execute(
        `INSERT INTO cneb_curso_mapa (colegio_id, curso_id, tipo, area_id)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE tipo = VALUES(tipo), area_id = VALUES(area_id)`,
        [cid, cursoId, tipo, areaId]
      );
      guardados += 1;
    }

    res.json({ success: true, nivel, guardados });
  } catch (e) {
    console.error('[cneb/cursos/mapa]', e);
    res.status(500).json({ error: e.message || 'No se pudo guardar el mapeo.' });
  }
});

router.get('/sesiones/meta', async (req, res) => {
  try {
    const cid = colegio(req);
    if (!cid) return res.status(400).json({ error: 'Usuario sin colegio.' });
    const nivel = parseNivel(req.query.nivel);
    if (!nivel) return res.status(400).json({ error: 'Indique el nivel.' });
    const anio = (await getAnioActivo(cid)) || new Date().getFullYear();
    const grupos = await query(
      `SELECT g.id, g.grado, g.seccion, g.anio, n.nombre AS nivel_nombre
       FROM grupos g
       INNER JOIN niveles n ON n.id = g.nivel_id AND n.colegio_id = g.colegio_id
       WHERE g.colegio_id = ? AND g.anio = ? AND UPPER(n.nombre) LIKE ?
       ORDER BY g.grado ASC, g.seccion ASC`,
      [cid, anio, likeNivelSql(nivel)]
    );
    res.json({ anio, grupos: grupos || [] });
  } catch (e) {
    console.error('[cneb/sesiones/meta]', e);
    res.status(500).json({ error: e.message || 'No se pudieron cargar las aulas.' });
  }
});

router.get('/aula-piar', async (req, res) => {
  try {
    const cid = colegio(req);
    const grupoId = parseInt(req.query.grupo_id, 10);
    if (!cid || !Number.isFinite(grupoId)) return res.status(400).json({ error: 'Indique el aula.' });
    const anio = (await getAnioActivo(cid)) || new Date().getFullYear();
    const estudiantes = await piarActivosDelGrupo(cid, anio, grupoId);
    res.json({ anio, grupo_id: grupoId, estudiantes });
  } catch (e) {
    console.error('[cneb/aula-piar]', e);
    res.status(500).json({ error: e.message || 'No se pudo cargar el PIAR del aula.' });
  }
});

router.get('/sesiones', async (req, res) => {
  try {
    const cid = colegio(req);
    if (!cid) return res.status(400).json({ error: 'Usuario sin colegio.' });
    const nivel = parseNivel(req.query.nivel);
    if (!nivel) return res.status(400).json({ error: 'Indique el nivel.' });
    const anio = (await getAnioActivo(cid)) || new Date().getFullYear();
    const rows = await listarSesiones(cid, { nivel, anio });
    res.json({ anio, sesiones: rows || [] });
  } catch (e) {
    console.error('[cneb/sesiones]', e);
    const msg =
      e.code === 'ER_NO_SUCH_TABLE'
        ? 'Falta aplicar la migración 094_cneb_sesiones_mysql.sql'
        : e.message || 'No se pudieron listar las sesiones.';
    res.status(500).json({ error: msg });
  }
});

router.get('/sesiones/:id', async (req, res) => {
  try {
    const cid = colegio(req);
    const id = parseInt(req.params.id, 10);
    if (!cid || !id) return res.status(400).json({ error: 'Datos inválidos.' });
    const ses = await cargarSesion(cid, id);
    if (!ses) return res.status(404).json({ error: 'Sesión no encontrada.' });
    res.json({ sesion: ses });
  } catch (e) {
    console.error('[cneb/sesiones/:id]', e);
    res.status(500).json({ error: e.message || 'No se pudo abrir la sesión.' });
  }
});

router.post('/sesiones', async (req, res) => {
  try {
    if (!puedeEscribir(req.user?.tipo)) return res.status(403).json({ error: 'Sin permiso.' });
    const cid = colegio(req);
    const nivel = parseNivel(req.body?.nivel || req.body?.nivel_cneb);
    if (!cid || !nivel) return res.status(400).json({ error: 'Indique colegio y nivel.' });
    const body = leerCuerpoSesion(req.body, nivel);
    if (!body.titulo) return res.status(400).json({ error: 'El título de la sesión es obligatorio.' });
    if (body.suma !== body.duracion_min) {
      return res.status(400).json({
        error: `Los minutos de inicio, desarrollo y cierre deben sumar ${body.duracion_min} (ahora ${body.suma}).`,
      });
    }
    const sesion = await insertarSesion(cid, req.user?.usuario_id || req.user?.id, body);
    res.json({ success: true, id: sesion.id, sesion });
  } catch (e) {
    console.error('[cneb/sesiones POST]', e);
    const msg =
      e.code === 'ER_NO_SUCH_TABLE'
        ? 'Falta aplicar la migración 094_cneb_sesiones_mysql.sql'
        : e.message || 'No se pudo crear la sesión.';
    res.status(500).json({ error: msg });
  }
});

router.put('/sesiones/:id', async (req, res) => {
  try {
    if (!puedeEscribir(req.user?.tipo)) return res.status(403).json({ error: 'Sin permiso.' });
    const cid = colegio(req);
    const id = parseInt(req.params.id, 10);
    if (!cid || !id) return res.status(400).json({ error: 'Datos inválidos.' });
    const [ex] = await query('SELECT id, nivel_cneb FROM cneb_sesiones WHERE id = ? AND colegio_id = ?', [id, cid]);
    if (!ex) return res.status(404).json({ error: 'Sesión no encontrada.' });
    const body = leerCuerpoSesion(req.body, ex.nivel_cneb);
    if (!body.titulo) return res.status(400).json({ error: 'El título de la sesión es obligatorio.' });
    if (body.suma !== body.duracion_min) {
      return res.status(400).json({
        error: `Los minutos de inicio, desarrollo y cierre deben sumar ${body.duracion_min} (ahora ${body.suma}).`,
      });
    }
    const sesion = await actualizarSesion(cid, id, body);
    res.json({ success: true, sesion });
  } catch (e) {
    console.error('[cneb/sesiones PUT]', e);
    res.status(500).json({ error: e.message || 'No se pudo guardar la sesión.' });
  }
});

router.delete('/sesiones/:id', async (req, res) => {
  try {
    if (!puedeEscribir(req.user?.tipo)) return res.status(403).json({ error: 'Sin permiso.' });
    const cid = colegio(req);
    const id = parseInt(req.params.id, 10);
    const n = await eliminarSesion(cid, id);
    if (!n) return res.status(404).json({ error: 'Sesión no encontrada.' });
    res.json({ success: true });
  } catch (e) {
    console.error('[cneb/sesiones DELETE]', e);
    res.status(500).json({ error: e.message || 'No se pudo eliminar.' });
  }
});

router.post('/sesiones/borrador', async (req, res) => {
  try {
    const duracion = Math.min(180, Math.max(20, parseInt(req.body?.duracion_min, 10) || 60));
    const desempenos = Array.isArray(req.body?.desempenos_texto) ? req.body.desempenos_texto : [];
    const draft = armarBorrador({
      titulo: req.body?.titulo,
      proposito: req.body?.proposito,
      competencia: req.body?.competencia_nombre,
      desempenos,
      duracionMin: duracion,
      corteLabel: req.body?.corte_label,
    });
    res.json({ borrador: draft });
  } catch (e) {
    console.error('[cneb/sesiones/borrador]', e);
    res.status(500).json({ error: e.message || 'No se pudo armar el borrador.' });
  }
});

router.get('/prompt', async (req, res) => {
  try {
    const cid = colegio(req);
    let texto = PROMPT_SESION_DEFAULT;
    try {
      const [row] = await query('SELECT prompt_sesion FROM cneb_ajustes WHERE colegio_id = ? LIMIT 1', [cid]);
      if (row?.prompt_sesion) texto = row.prompt_sesion;
    } catch (e) {
      if (e.code !== 'ER_NO_SUCH_TABLE') throw e;
    }
    res.json({ prompt: texto, es_default: texto === PROMPT_SESION_DEFAULT, prompt_default: PROMPT_SESION_DEFAULT });
  } catch (e) {
    console.error('[cneb/prompt GET]', e);
    res.status(500).json({ error: e.message || 'No se pudo leer el prompt.' });
  }
});

router.put('/prompt', async (req, res) => {
  try {
    if (!puedeEscribir(req.user?.tipo)) return res.status(403).json({ error: 'Sin permiso.' });
    const cid = colegio(req);
    const texto = String(req.body?.prompt || '').trim() || PROMPT_SESION_DEFAULT;
    await execute(
      `INSERT INTO cneb_ajustes (colegio_id, prompt_sesion) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE prompt_sesion = VALUES(prompt_sesion)`,
      [cid, texto]
    );
    res.json({ success: true });
  } catch (e) {
    console.error('[cneb/prompt PUT]', e);
    const msg =
      e.code === 'ER_NO_SUCH_TABLE'
        ? 'Falta aplicar la migración 095_cneb_auxiliar_corte_ia_mysql.sql'
        : e.message || 'No se pudo guardar el prompt.';
    res.status(500).json({ error: msg });
  }
});

router.post('/sesiones/generar-ia', async (req, res) => {
  try {
    if (!puedeEscribir(req.user?.tipo)) return res.status(403).json({ error: 'Sin permiso.' });
    if (!(await moduloActivo('academico.cneb-ia'))) {
      return res.status(403).json({ error: 'La IA de sesiones CNEB está apagada.' });
    }
    const cid = colegio(req);
    const duracion = Math.min(180, Math.max(20, parseInt(req.body?.duracion_min, 10) || 60));
    const anio = (await getAnioActivo(cid)) || new Date().getFullYear();
    let plantilla = PROMPT_SESION_DEFAULT;
    try {
      const [row] = await query('SELECT prompt_sesion FROM cneb_ajustes WHERE colegio_id = ? LIMIT 1', [cid]);
      if (row?.prompt_sesion) plantilla = row.prompt_sesion;
    } catch (e) {
      if (e.code !== 'ER_NO_SUCH_TABLE') throw e;
    }
    const result = await generarSesionConIa({
      plantilla,
      duracionMin: duracion,
      vars: await varsGenerarSesionIa(cid, req.body || {}, anio),
    });
    try {
      await execute(
        `INSERT INTO cneb_ia_trabajos
          (colegio_id, sesion_id, proveedor, modelo, prompt_usado, json_respuesta, tokens_entrada, tokens_salida, creado_por)
         VALUES (?, ?, 'gemini', ?, ?, ?, ?, ?, ?)`,
        [
          cid,
          parseIntOrNull(req.body?.sesion_id),
          result.modelo,
          result.prompt,
          JSON.stringify(result.borrador),
          result.tokens_entrada,
          result.tokens_salida,
          req.user?.usuario_id || req.user?.id || null,
        ]
      );
    } catch (e) {
      if (e.code !== 'ER_NO_SUCH_TABLE') console.warn('[cneb ia log]', e.message);
    }
    res.json({ borrador: result.borrador, modelo: result.modelo, via: 'ia' });
  } catch (e) {
    console.error('[cneb/sesiones/generar-ia]', e);
    res.status(500).json({ error: e.message || 'No se pudo generar con IA.' });
  }
});

router.get('/auxiliar/:sesionId', async (req, res) => {
  try {
    const cid = colegio(req);
    const sesionId = parseInt(req.params.sesionId, 10);
    const data = await cargarAuxiliar(cid, sesionId);
    if (!data) return res.status(404).json({ error: 'Sesión no encontrada.' });
    res.json(data);
  } catch (e) {
    console.error('[cneb/auxiliar GET]', e);
    res.status(500).json({ error: e.message || 'No se pudo cargar el auxiliar.' });
  }
});

router.put('/auxiliar/:sesionId', async (req, res) => {
  try {
    if (!puedeEscribir(req.user?.tipo)) return res.status(403).json({ error: 'Sin permiso.' });
    const cid = colegio(req);
    const sesionId = parseInt(req.params.sesionId, 10);
    const out = await guardarAuxiliar(cid, sesionId, req.body?.filas || []);
    if (!out.ok) return res.status(404).json({ error: out.error });
    res.json({ success: true, guardados: out.guardados });
  } catch (e) {
    console.error('[cneb/auxiliar PUT]', e);
    const msg =
      e.code === 'ER_NO_SUCH_TABLE'
        ? 'Falta aplicar la migración 095_cneb_auxiliar_corte_ia_mysql.sql'
        : e.message || 'No se pudo guardar el auxiliar.';
    res.status(500).json({ error: msg });
  }
});

router.get('/corte', async (req, res) => {
  try {
    const cid = colegio(req);
    const nivel = parseNivel(req.query.nivel);
    const grupoId = parseInt(req.query.grupo_id, 10);
    const bimestre = Math.min(4, Math.max(1, parseInt(req.query.bimestre, 10) || 4));
    if (!cid || !nivel || !grupoId) return res.status(400).json({ error: 'Indique nivel y aula.' });
    const anio = (await getAnioActivo(cid)) || new Date().getFullYear();
    const data = await cargarCorte(cid, {
      anio,
      bimestre,
      grupoId,
      nivel,
      areaId: req.query.area_id,
      asignaturaId: req.query.asignatura_id,
      sesionId: req.query.sesion_id,
    });
    res.json({ anio, bimestre, ...data });
  } catch (e) {
    console.error('[cneb/corte GET]', e);
    res.status(500).json({ error: e.message || 'No se pudo cargar el corte.' });
  }
});

router.put('/corte', async (req, res) => {
  try {
    if (!puedeEscribir(req.user?.tipo)) return res.status(403).json({ error: 'Sin permiso.' });
    const cid = colegio(req);
    const anio = (await getAnioActivo(cid)) || new Date().getFullYear();
    const bimestre = Math.min(4, Math.max(1, parseInt(req.body?.bimestre, 10) || 4));
    const out = await guardarCorte(cid, { anio, bimestre, items: req.body?.items || [] });
    res.json({ success: true, ...out });
  } catch (e) {
    console.error('[cneb/corte PUT]', e);
    const msg =
      e.code === 'ER_NO_SUCH_TABLE'
        ? 'Falta aplicar la migración 095_cneb_auxiliar_corte_ia_mysql.sql'
        : e.message || 'No se pudo guardar el corte.';
    res.status(500).json({ error: msg });
  }
});

router.get('/export/siagie.xlsx', async (req, res) => {
  try {
    const cid = colegio(req);
    const nivel = parseNivel(req.query.nivel);
    const grupoId = parseInt(req.query.grupo_id, 10);
    const bimestre = Math.min(4, Math.max(1, parseInt(req.query.bimestre, 10) || 4));
    if (!cid || !nivel || !grupoId) return res.status(400).json({ error: 'Indique nivel y aula.' });
    const anio = (await getAnioActivo(cid)) || new Date().getFullYear();
    const { buffer, filename } = await excelSiagieBuffer(cid, {
      anio,
      bimestre,
      grupoId,
      nivel,
      grupoLabel: req.query.grupo_label || '',
      areaId: req.query.area_id,
      asignaturaId: req.query.asignatura_id,
      sesionId: req.query.sesion_id,
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(buffer));
  } catch (e) {
    console.error('[cneb/export/siagie]', e);
    res.status(500).json({ error: e.message || 'No se pudo generar el Excel.' });
  }
});

router.get('/consolidado', async (req, res) => {
  try {
    const cid = colegio(req);
    const nivel = parseNivel(req.query.nivel);
    const grupoId = parseInt(req.query.grupo_id, 10);
    const bimestre = Math.min(4, Math.max(1, parseInt(req.query.bimestre, 10) || 4));
    if (!cid || !nivel || !grupoId) return res.status(400).json({ error: 'Indique nivel y aula.' });
    const anio = (await getAnioActivo(cid)) || new Date().getFullYear();
    const data = await cargarConsolidado(cid, { anio, bimestre, grupoId, nivel });
    res.json(data);
  } catch (e) {
    console.error('[cneb/consolidado GET]', e);
    res.status(500).json({ error: e.message || 'No se pudo cargar el consolidado.' });
  }
});

router.put('/consolidado', async (req, res) => {
  try {
    if (!puedeEscribir(req.user?.tipo)) return res.status(403).json({ error: 'Sin permiso.' });
    const cid = colegio(req);
    const anio = (await getAnioActivo(cid)) || new Date().getFullYear();
    const bimestre = Math.min(4, Math.max(1, parseInt(req.body?.bimestre, 10) || 4));
    const out = await guardarConsolidado(cid, {
      anio,
      bimestre,
      filasCotejo: req.body?.filas_cotejo || [],
      itemsCorte: req.body?.items_corte || [],
    });
    res.json({ success: true, ...out });
  } catch (e) {
    console.error('[cneb/consolidado PUT]', e);
    res.status(500).json({ error: e.message || 'No se pudo guardar el consolidado.' });
  }
});

router.get('/export/consolidado.xlsx', async (req, res) => {
  try {
    const cid = colegio(req);
    const nivel = parseNivel(req.query.nivel);
    const grupoId = parseInt(req.query.grupo_id, 10);
    const bimestre = Math.min(4, Math.max(1, parseInt(req.query.bimestre, 10) || 4));
    if (!cid || !nivel || !grupoId) return res.status(400).json({ error: 'Indique nivel y aula.' });
    const anio = (await getAnioActivo(cid)) || new Date().getFullYear();
    const { buffer, filename } = await excelConsolidadoBuffer(cid, {
      anio,
      bimestre,
      grupoId,
      nivel,
      grupoLabel: req.query.grupo_label || '',
      areaId: req.query.area_id,
      asignaturaId: req.query.asignatura_id,
      sesionId: req.query.sesion_id,
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(buffer));
  } catch (e) {
    console.error('[cneb/export/consolidado]', e);
    res.status(500).json({ error: e.message || 'No se pudo generar el Excel del consolidado.' });
  }
});

router.get('/export/informe.pdf', async (req, res) => {
  try {
    const cid = colegio(req);
    const nivel = parseNivel(req.query.nivel);
    const grupoId = parseInt(req.query.grupo_id, 10);
    const bimestre = Math.min(4, Math.max(1, parseInt(req.query.bimestre, 10) || 4));
    const matriculaId = parseIntOrNull(req.query.matricula_id);
    if (!cid || !nivel || !grupoId) return res.status(400).json({ error: 'Indique nivel y aula.' });
    const anio = (await getAnioActivo(cid)) || new Date().getFullYear();
    const { buffer, filename } = await informePdfBuffer(cid, {
      anio,
      bimestre,
      grupoId,
      nivel,
      matriculaId,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(buffer));
  } catch (e) {
    console.error('[cneb/export/informe]', e);
    res.status(500).json({ error: e.message || 'No se pudo generar el informe.' });
  }
});

router.get('/export/libreta.pdf', async (req, res) => {
  try {
    const cid = colegio(req);
    const nivel = parseNivel(req.query.nivel);
    const grupoId = parseInt(req.query.grupo_id, 10);
    const bimestre = Math.min(4, Math.max(1, parseInt(req.query.bimestre, 10) || 4));
    const matriculaId = parseIntOrNull(req.query.matricula_id);
    if (!cid || !nivel || !grupoId) return res.status(400).json({ error: 'Indique nivel y aula.' });
    const anio = (await getAnioActivo(cid)) || new Date().getFullYear();
    const { buffer, filename } = await libretaPdfBuffer(cid, {
      anio,
      bimestre,
      grupoId,
      nivel,
      matriculaId,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(buffer));
  } catch (e) {
    console.error('[cneb/export/libreta]', e);
    res.status(500).json({ error: e.message || 'No se pudo generar la libreta.' });
  }
});

router.get('/sesiones/:id/pdf', async (req, res) => {
  try {
    const cid = colegio(req);
    const id = parseInt(req.params.id, 10);
    if (!cid || !id) return res.status(400).json({ error: 'Datos inválidos.' });
    const out = await sesionPdfBuffer(cid, id, {
      parte: req.query?.parte,
      formato: req.query?.formato,
    });
    if (!out) return res.status(404).json({ error: 'Sesión no encontrada.' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
    res.send(Buffer.from(out.buffer));
  } catch (e) {
    console.error('[cneb/sesiones pdf]', e);
    res.status(500).json({ error: e.message || 'No se pudo generar el PDF de la sesión.' });
  }
});

module.exports = router;
