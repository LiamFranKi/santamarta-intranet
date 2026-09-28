/**
 * CNEB del docente: solo aulas donde dicta o es tutor.
 * No toca notas, libreta ni tipo_calificacion.
 */
const express = require('express');
const router = express.Router();
const { query, execute, getAnioActivo } = require('../utils/mysql');
const { authenticateToken } = require('../middleware/auth');
const { NIVELES, arbolCatalogo } = require('../utils/cnebCatalogoSeed');
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
  excelAuxiliarSesionBuffer,
} = require('../utils/cnebAuxiliar');
const { informePdfBuffer, libretaPdfBuffer, sesionPdfBuffer } = require('../utils/cnebPdfs');
const { contextoAulaCneb, listarSesionesAula } = require('../utils/cnebAulaAsignatura');
const { piarActivosDelGrupo, varsGenerarSesionIa } = require('../utils/cnebPiarAula');
const { listarUnidades, generarLoteSesiones, nivelOk } = require('../utils/cnebLoteSesiones');
const { esPaqueteCoordinador } = require('../utils/coordinadorAcceso');
const { esTutoriaGeneralUsuario } = require('../utils/tutoriaGrupoAcceso');

router.use(authenticateToken);
router.use((req, res, next) => {
  const tipo = req.user?.tipo;
  if (tipo === 'DOCENTE' || esStaffCneb(tipo)) return next();
  return res.status(403).json({ error: 'Sin permiso para CNEB del aula.' });
});

function esStaffCneb(tipo) {
  const t = String(tipo || '').toUpperCase();
  return t === 'ADMINISTRADOR' || t === 'PROMOTORIA' || esPaqueteCoordinador(t);
}

function esStaffReq(req) {
  return esStaffCneb(req.user?.tipo);
}

function likeNivelSql(nivel) {
  if (nivel === 'INICIAL') return '%INICIAL%';
  if (nivel === 'PRIMARIA') return '%PRIMARIA%';
  return '%SECUNDARIA%';
}

function colegio(req) {
  const n = Number(req.user?.colegio_id);
  return Number.isFinite(n) ? n : null;
}

function personalId(req) {
  const n = Number(req.user?.personal_id);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseNivel(raw) {
  const n = String(raw || 'INICIAL').toUpperCase();
  return NIVELES.includes(n) ? n : null;
}

function nivelDesdeNombre(nombre) {
  const u = String(nombre || '').toUpperCase();
  if (u.includes('SECUNDARIA')) return 'SECUNDARIA';
  if (u.includes('PRIMARIA')) return 'PRIMARIA';
  if (u.includes('INICIAL')) return 'INICIAL';
  return null;
}

async function gruposDelDocente(cid, pid, anio) {
  return query(
    `SELECT DISTINCT g.id, g.grado, g.seccion, g.anio, n.nombre AS nivel_nombre
     FROM grupos g
     INNER JOIN niveles n ON n.id = g.nivel_id AND n.colegio_id = g.colegio_id
     WHERE g.colegio_id = ? AND g.anio = ?
       AND (
         EXISTS (
           SELECT 1 FROM asignaturas a
           WHERE a.grupo_id = g.id AND a.personal_id = ? AND a.colegio_id = ?
         )
         OR g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)
       )
     ORDER BY n.nombre ASC, g.grado ASC, g.seccion ASC`,
    [cid, anio, pid, cid, pid, pid]
  );
}

async function idsPermitidos(cid, pid, anio) {
  const grupos = await gruposDelDocente(cid, pid, anio);
  return new Set((grupos || []).map((g) => Number(g.id)));
}

async function puedeVerGrupo(req, grupoId) {
  if (!grupoId) return true;
  if (esStaffReq(req)) return true;
  const cid = colegio(req);
  const pid = personalId(req);
  const anio = (await getAnioActivo(cid)) || new Date().getFullYear();
  if (pid && (await idsPermitidos(cid, pid, anio)).has(Number(grupoId))) return true;
  if (await esTutoriaGeneralUsuario(req)) {
    const [g] = await query(
      `SELECT id FROM grupos WHERE id = ? AND colegio_id = ? AND anio = ? LIMIT 1`,
      [grupoId, cid, anio]
    );
    return Boolean(g);
  }
  return false;
}

async function puedeEscribirGrupo(req, grupoId) {
  if (!grupoId) return true;
  if (esStaffReq(req)) return true;
  const cid = colegio(req);
  const pid = personalId(req);
  if (!pid) return false;
  const anio = (await getAnioActivo(cid)) || new Date().getFullYear();
  return (await idsPermitidos(cid, pid, anio)).has(Number(grupoId));
}

async function gateGrupo(req, res, grupoId, { escribir = false } = {}) {
  const ok = escribir ? await puedeEscribirGrupo(req, grupoId) : await puedeVerGrupo(req, grupoId);
  if (!ok) {
    res.status(403).json({
      error: escribir ? 'Solo puede armar sesiones de sus aulas.' : 'Esa aula no es suya.',
    });
    return false;
  }
  return true;
}

function faltaPersonal(req) {
  return !esStaffReq(req) && !personalId(req);
}

async function gruposNivelStaff(cid, anio, nivel) {
  return query(
    `SELECT g.id, g.grado, g.seccion, g.anio, n.nombre AS nivel_nombre
     FROM grupos g
     INNER JOIN niveles n ON n.id = g.nivel_id AND n.colegio_id = g.colegio_id
     WHERE g.colegio_id = ? AND g.anio = ? AND UPPER(n.nombre) LIKE ?
     ORDER BY g.grado ASC, g.seccion ASC`,
    [cid, anio, likeNivelSql(nivel)]
  );
}

async function sesionPermitida(req, sesionId) {
  const cid = colegio(req);
  const ses = await cargarSesion(cid, sesionId);
  if (!ses) return null;
  if (ses.grupo_id && !(await puedeVerGrupo(req, ses.grupo_id))) return null;
  return ses;
}

router.get('/inicio', async (req, res) => {
  try {
    const cid = colegio(req);
    const pid = personalId(req);
    if (!cid || !pid) return res.status(400).json({ error: 'Docente sin colegio o ficha de personal.' });
    const anio = (await getAnioActivo(cid)) || new Date().getFullYear();
    const grupos = await gruposDelDocente(cid, pid, anio);
    let bimestre = 4;
    try {
      const [uso] = await query(
        `SELECT bimestre FROM cneb_uso_colegio WHERE colegio_id = ? AND anio = ? LIMIT 1`,
        [cid, anio]
      );
      if (uso?.bimestre) bimestre = Number(uso.bimestre);
    } catch (e) {
      if (e.code !== 'ER_NO_SUCH_TABLE') throw e;
    }
    res.json({
      anio,
      bimestre,
      grupos: (grupos || []).map((g) => ({
        ...g,
        nivel_cneb: nivelDesdeNombre(g.nivel_nombre),
      })),
    });
  } catch (e) {
    console.error('[docente/cneb/inicio]', e);
    res.status(500).json({ error: e.message || 'No se pudo abrir CNEB.' });
  }
});

router.get('/catalogo', async (req, res) => {
  try {
    const nivel = parseNivel(req.query.nivel);
    if (!nivel) return res.status(400).json({ error: 'Indique el nivel.' });
    res.json(await arbolCatalogo(nivel));
  } catch (e) {
    console.error('[docente/cneb/catalogo]', e);
    res.status(500).json({ error: e.message || 'No se pudo cargar el catálogo.' });
  }
});

router.get('/sesiones/meta', async (req, res) => {
  try {
    const cid = colegio(req);
    const pid = personalId(req);
    const nivel = parseNivel(req.query.nivel);
    if (!cid || !nivel) return res.status(400).json({ error: 'Faltan datos.' });
    if (faltaPersonal(req)) return res.status(400).json({ error: 'Faltan datos.' });
    const anio = (await getAnioActivo(cid)) || new Date().getFullYear();
    const grupos = esStaffReq(req)
      ? await gruposNivelStaff(cid, anio, nivel)
      : (await gruposDelDocente(cid, pid, anio)).filter((g) =>
          String(g.nivel_nombre || '')
            .toUpperCase()
            .includes(nivel === 'INICIAL' ? 'INICIAL' : nivel)
        );
    res.json({ anio, grupos });
  } catch (e) {
    console.error('[docente/cneb/sesiones/meta]', e);
    res.status(500).json({ error: e.message || 'No se pudieron cargar las aulas.' });
  }
});

router.get('/aula-piar', async (req, res) => {
  try {
    const cid = colegio(req);
    const grupoId = parseInt(req.query.grupo_id, 10);
    if (!cid || !Number.isFinite(grupoId)) return res.status(400).json({ error: 'Indique el aula.' });
    if (faltaPersonal(req)) return res.status(400).json({ error: 'Indique el aula.' });
    const anio = (await getAnioActivo(cid)) || new Date().getFullYear();
    if (!(await gateGrupo(req, res, grupoId))) return;
    const estudiantes = await piarActivosDelGrupo(cid, anio, grupoId);
    res.json({ anio, grupo_id: grupoId, estudiantes });
  } catch (e) {
    console.error('[docente/cneb/aula-piar]', e);
    res.status(500).json({ error: e.message || 'No se pudo cargar el PIAR del aula.' });
  }
});

router.get('/aula/:asignaturaId', async (req, res) => {
  try {
    const cid = colegio(req);
    const asignaturaId = parseInt(req.params.asignaturaId, 10);
    if (!cid || !asignaturaId) return res.status(400).json({ error: 'Faltan datos.' });
    if (faltaPersonal(req)) return res.status(400).json({ error: 'Faltan datos.' });
    const ctx = await contextoAulaCneb(cid, asignaturaId);
    if (!ctx) return res.status(404).json({ error: 'Asignatura no encontrada.' });
    if (!(await gateGrupo(req, res, ctx.grupo_id))) return;
    const sesiones = ctx.es_cneb ? await listarSesionesAula(cid, ctx, req.query.bimestre) : [];
    let areas = [];
    if (ctx.es_cneb) {
      try {
        const arbol = await arbolCatalogo(ctx.nivel_cneb || 'INICIAL');
        areas = arbol.areas || [];
      } catch {
        areas = [];
      }
    }
    res.json({ ...ctx, sesiones, areas });
  } catch (e) {
    console.error('[docente/cneb/aula]', e);
    res.status(500).json({ error: e.message || 'No se pudo abrir el aula CNEB.' });
  }
});

router.get('/sesiones', async (req, res) => {
  try {
    const cid = colegio(req);
    const pid = personalId(req);
    const nivel = parseNivel(req.query.nivel);
    if (!cid || !nivel) return res.status(400).json({ error: 'Faltan datos.' });
    if (faltaPersonal(req)) return res.status(400).json({ error: 'Faltan datos.' });
    const anio = (await getAnioActivo(cid)) || new Date().getFullYear();
    const filtro = esStaffReq(req)
      ? { nivel, anio, bimestre: req.query.bimestre }
      : { nivel, anio, grupoIds: [...(await idsPermitidos(cid, pid, anio))], bimestre: req.query.bimestre };
    const rows = await listarSesiones(cid, filtro);
    res.json({ anio, sesiones: rows || [] });
  } catch (e) {
    console.error('[docente/cneb/sesiones]', e);
    const msg =
      e.code === 'ER_NO_SUCH_TABLE'
        ? 'Falta aplicar la migración 094_cneb_sesiones_mysql.sql'
        : e.message || 'No se pudieron listar las sesiones.';
    res.status(500).json({ error: msg });
  }
});

router.get('/sesiones/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const ses = await sesionPermitida(req, id);
    if (!ses) return res.status(404).json({ error: 'Sesión no encontrada.' });
    res.json({ sesion: ses });
  } catch (e) {
    console.error('[docente/cneb/sesiones/:id]', e);
    res.status(500).json({ error: e.message || 'No se pudo abrir la sesión.' });
  }
});

router.post('/sesiones', async (req, res) => {
  try {
    const cid = colegio(req);
    const nivel = parseNivel(req.body?.nivel || req.body?.nivel_cneb);
    if (!cid || !nivel) return res.status(400).json({ error: 'Faltan datos.' });
    if (faltaPersonal(req)) return res.status(400).json({ error: 'Faltan datos.' });
    const body = leerCuerpoSesion(req.body, nivel);
    if (!body.titulo) return res.status(400).json({ error: 'El título de la sesión es obligatorio.' });
    if (body.suma !== body.duracion_min) {
      return res.status(400).json({
        error: `Los minutos de inicio, desarrollo y cierre deben sumar ${body.duracion_min} (ahora ${body.suma}).`,
      });
    }
    if (!(await gateGrupo(req, res, body.grupo_id, { escribir: true }))) return;
    const sesion = await insertarSesion(cid, req.user?.usuario_id || req.user?.id, body);
    res.json({ success: true, id: sesion.id, sesion });
  } catch (e) {
    console.error('[docente/cneb/sesiones POST]', e);
    res.status(500).json({ error: e.message || 'No se pudo crear la sesión.' });
  }
});

router.put('/sesiones/:id', async (req, res) => {
  try {
    const cid = colegio(req);
    const id = parseInt(req.params.id, 10);
    const ex = await cargarSesion(cid, id);
    if (!ex) return res.status(404).json({ error: 'Sesión no encontrada.' });
    if (!(await gateGrupo(req, res, ex.grupo_id, { escribir: true }))) return;
    const body = leerCuerpoSesion(req.body, ex.nivel_cneb);
    if (!body.titulo) return res.status(400).json({ error: 'El título de la sesión es obligatorio.' });
    if (body.suma !== body.duracion_min) {
      return res.status(400).json({
        error: `Los minutos de inicio, desarrollo y cierre deben sumar ${body.duracion_min} (ahora ${body.suma}).`,
      });
    }
    if (!(await gateGrupo(req, res, body.grupo_id, { escribir: true }))) return;
    const sesion = await actualizarSesion(cid, id, body);
    res.json({ success: true, sesion });
  } catch (e) {
    console.error('[docente/cneb/sesiones PUT]', e);
    res.status(500).json({ error: e.message || 'No se pudo guardar la sesión.' });
  }
});

router.delete('/sesiones/:id', async (req, res) => {
  try {
    const cid = colegio(req);
    const id = parseInt(req.params.id, 10);
    const ex = await cargarSesion(cid, id);
    if (!ex) return res.status(404).json({ error: 'Sesión no encontrada.' });
    if (!(await gateGrupo(req, res, ex.grupo_id, { escribir: true }))) return;
    await eliminarSesion(cid, id);
    res.json({ success: true });
  } catch (e) {
    console.error('[docente/cneb/sesiones DELETE]', e);
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
    console.error('[docente/cneb/borrador]', e);
    res.status(500).json({ error: e.message || 'No se pudo armar el borrador.' });
  }
});

router.post('/sesiones/generar-ia', async (req, res) => {
  try {
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
      if (e.code !== 'ER_NO_SUCH_TABLE') console.warn('[docente cneb ia log]', e.message);
    }
    res.json({ borrador: result.borrador, modelo: result.modelo, via: 'ia' });
  } catch (e) {
    console.error('[docente/cneb/generar-ia]', e);
    res.status(500).json({ error: e.message || 'No se pudo generar con IA.' });
  }
});

router.get('/unidades', async (req, res) => {
  try {
    const cid = colegio(req);
    const nivel = nivelOk(req.query.nivel);
    if (!cid || !nivel) return res.status(400).json({ error: 'Indique el nivel.' });
    res.json(await listarUnidades(cid, nivel, req.query.bimestre));
  } catch (e) {
    console.error('[docente/cneb/unidades]', e);
    res.status(500).json({
      error: e.code === 'ER_NO_SUCH_TABLE'
        ? 'Falta aplicar la migración 115_cneb_unidades_mysql.sql'
        : e.message || 'No se pudieron cargar las unidades.',
    });
  }
});

router.post('/sesiones/generar-lote', async (req, res) => {
  try {
    if (!(await moduloActivo('academico.cneb-ia'))) {
      return res.status(403).json({ error: 'La IA de sesiones CNEB está apagada.' });
    }
    const cid = colegio(req);
    const grupoId = parseInt(req.body?.grupo_id, 10);
    if (grupoId && !(await puedeEscribirGrupo(req, grupoId))) {
      return res.status(403).json({ error: 'Solo puede armar sesiones de sus aulas.' });
    }
    const out = await generarLoteSesiones(cid, req.user?.usuario_id || req.user?.id || null, req.body || {});
    res.json({ success: true, ...out });
  } catch (e) {
    console.error('[docente/cneb/generar-lote]', e);
    res.status(e.status || 500).json({ error: e.message || 'No se pudieron generar las sesiones.' });
  }
});

router.get('/auxiliar/:sesionId/excel', async (req, res) => {
  try {
    const cid = colegio(req);
    const sesionId = parseInt(req.params.sesionId, 10);
    const ses = await cargarSesion(cid, sesionId);
    if (!ses) return res.status(404).json({ error: 'Sesión no encontrada.' });
    if (!(await gateGrupo(req, res, ses.grupo_id))) return;
    const out = await excelAuxiliarSesionBuffer(cid, sesionId);
    if (!out) return res.status(404).json({ error: 'Sesión no encontrada.' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
    res.send(Buffer.from(out.buffer));
  } catch (e) {
    console.error('[docente/cneb/auxiliar excel]', e);
    res.status(500).json({ error: e.message || 'No se pudo descargar el auxiliar.' });
  }
});

router.get('/auxiliar/:sesionId', async (req, res) => {
  try {
    const cid = colegio(req);
    const sesionId = parseInt(req.params.sesionId, 10);
    const ses = await cargarSesion(cid, sesionId);
    if (!ses) return res.status(404).json({ error: 'Sesión no encontrada.' });
    if (!(await gateGrupo(req, res, ses.grupo_id))) return;
    const data = await cargarAuxiliar(cid, sesionId);
    res.json(data);
  } catch (e) {
    console.error('[docente/cneb/auxiliar GET]', e);
    res.status(500).json({ error: e.message || 'No se pudo cargar el auxiliar.' });
  }
});

router.put('/auxiliar/:sesionId', async (req, res) => {
  try {
    const cid = colegio(req);
    const sesionId = parseInt(req.params.sesionId, 10);
    const ses = await cargarSesion(cid, sesionId);
    if (!ses) return res.status(404).json({ error: 'Sesión no encontrada.' });
    if (!(await gateGrupo(req, res, ses.grupo_id, { escribir: true }))) return;
    const out = await guardarAuxiliar(cid, sesionId, req.body?.filas || []);
    if (!out.ok) return res.status(404).json({ error: out.error });
    res.json({ success: true, guardados: out.guardados });
  } catch (e) {
    console.error('[docente/cneb/auxiliar PUT]', e);
    res.status(500).json({ error: e.message || 'No se pudo guardar el auxiliar.' });
  }
});

router.get('/corte', async (req, res) => {
  try {
    const cid = colegio(req);
    const nivel = parseNivel(req.query.nivel);
    const grupoId = parseInt(req.query.grupo_id, 10);
    const bimestre = Math.min(4, Math.max(1, parseInt(req.query.bimestre, 10) || 4));
    if (!cid || !nivel || !grupoId) return res.status(400).json({ error: 'Indique nivel y aula.' });
    if (faltaPersonal(req)) return res.status(400).json({ error: 'Indique nivel y aula.' });
    if (!(await gateGrupo(req, res, grupoId))) return;
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
    console.error('[docente/cneb/corte GET]', e);
    res.status(500).json({ error: e.message || 'No se pudo cargar el corte.' });
  }
});

router.put('/corte', async (req, res) => {
  try {
    const cid = colegio(req);
    const anio = (await getAnioActivo(cid)) || new Date().getFullYear();
    const bimestre = Math.min(4, Math.max(1, parseInt(req.body?.bimestre, 10) || 4));
    const grupoId = parseInt(req.body?.grupo_id, 10);
    if (!(await gateGrupo(req, res, grupoId, { escribir: true }))) return;
    const out = await guardarCorte(cid, { anio, bimestre, items: req.body?.items || [] });
    res.json({ success: true, ...out });
  } catch (e) {
    console.error('[docente/cneb/corte PUT]', e);
    res.status(500).json({ error: e.message || 'No se pudo guardar el corte.' });
  }
});

router.get('/export/siagie.xlsx', async (req, res) => {
  try {
    const cid = colegio(req);
    const nivel = parseNivel(req.query.nivel);
    const grupoId = parseInt(req.query.grupo_id, 10);
    const bimestre = Math.min(4, Math.max(1, parseInt(req.query.bimestre, 10) || 4));
    if (!cid || !nivel || !grupoId) return res.status(400).json({ error: 'Indique nivel y aula.' });
    if (faltaPersonal(req)) return res.status(400).json({ error: 'Indique nivel y aula.' });
    const anio = (await getAnioActivo(cid)) || new Date().getFullYear();
    if (!(await gateGrupo(req, res, grupoId))) return;
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
    console.error('[docente/cneb/export]', e);
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
    if (faltaPersonal(req)) return res.status(400).json({ error: 'Indique nivel y aula.' });
    const anio = (await getAnioActivo(cid)) || new Date().getFullYear();
    if (!(await gateGrupo(req, res, grupoId))) return;
    const data = await cargarConsolidado(cid, { anio, bimestre, grupoId, nivel });
    res.json(data);
  } catch (e) {
    console.error('[docente/cneb/consolidado GET]', e);
    res.status(500).json({ error: e.message || 'No se pudo cargar el consolidado.' });
  }
});

router.put('/consolidado', async (req, res) => {
  try {
    const cid = colegio(req);
    const anio = (await getAnioActivo(cid)) || new Date().getFullYear();
    const bimestre = Math.min(4, Math.max(1, parseInt(req.body?.bimestre, 10) || 4));
    const grupoId = parseInt(req.body?.grupo_id, 10);
    if (!(await gateGrupo(req, res, grupoId, { escribir: true }))) return;
    const out = await guardarConsolidado(cid, {
      anio,
      bimestre,
      filasCotejo: req.body?.filas_cotejo || [],
      itemsCorte: req.body?.items_corte || [],
    });
    res.json({ success: true, ...out });
  } catch (e) {
    console.error('[docente/cneb/consolidado PUT]', e);
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
    if (faltaPersonal(req)) return res.status(400).json({ error: 'Indique nivel y aula.' });
    const anio = (await getAnioActivo(cid)) || new Date().getFullYear();
    if (!(await gateGrupo(req, res, grupoId))) return;
    const { buffer, filename } = await excelConsolidadoBuffer(cid, {
      anio,
      bimestre,
      grupoId,
      nivel,
      grupoLabel: req.query.grupo_label || '',
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(buffer));
  } catch (e) {
    console.error('[docente/cneb/export consolidado]', e);
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
    if (faltaPersonal(req)) return res.status(400).json({ error: 'Indique nivel y aula.' });
    const anio = (await getAnioActivo(cid)) || new Date().getFullYear();
    if (!(await gateGrupo(req, res, grupoId))) return;
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
    console.error('[docente/cneb/informe]', e);
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
    if (faltaPersonal(req)) return res.status(400).json({ error: 'Indique nivel y aula.' });
    const anio = (await getAnioActivo(cid)) || new Date().getFullYear();
    if (!(await gateGrupo(req, res, grupoId))) return;
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
    console.error('[docente/cneb/libreta]', e);
    res.status(500).json({ error: e.message || 'No se pudo generar la libreta.' });
  }
});

router.get('/sesiones/:id/pdf', async (req, res) => {
  try {
    const cid = colegio(req);
    const id = parseInt(req.params.id, 10);
    const ses = await cargarSesion(cid, id);
    if (!ses) return res.status(404).json({ error: 'Sesión no encontrada.' });
    if (!(await gateGrupo(req, res, ses.grupo_id))) return;
    const out = await sesionPdfBuffer(cid, id, {
      parte: req.query?.parte,
      formato: req.query?.formato,
    });
    if (!out) return res.status(404).json({ error: 'Sesión no encontrada.' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
    res.send(Buffer.from(out.buffer));
  } catch (e) {
    console.error('[docente/cneb/sesion pdf]', e);
    res.status(500).json({ error: e.message || 'No se pudo generar el PDF de la sesión.' });
  }
});

module.exports = router;
