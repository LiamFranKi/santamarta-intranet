/**
 * Reportes administrativos (aula virtual — temas y contenidos).
 * ADMINISTRADOR, PROMOTORÍA y COORDINADOR.
 */
const express = require('express');
const router = express.Router();
const { query } = require('../utils/mysql');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);
router.use((req, res, next) => {
  const t = req.user?.tipo;
  if (t === 'ADMINISTRADOR' || t === 'PROMOTORIA' || t === 'COORDINADOR') return next();
  return res.status(403).json({ error: 'No autorizado para reportes administrativos.' });
});

function colegioId(req) {
  return req.user.colegio_id;
}

function buildArchivoUrl(raw) {
  if (!raw || String(raw).trim() === '') return null;
  const s = String(raw).trim();
  const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
  const isDevelopment = process.env.NODE_ENV !== 'production';
  if (/^https?:\/\//i.test(s)) {
    return s
      .replace(/https?:\/\/(www\.)?vanguardschools\.edu\.pe/gi, phpSystemUrl).replace(/https?:\/\/nuevo\.vanguardschools\.edu\.pe/gi, phpSystemUrl)
      .replace(/vanguardschools\.com\/static/gi, `${phpSystemUrl}/Static`)
      .replace(/vanguardschools\.com\/Static/gi, `${phpSystemUrl}/Static`);
  }
  if (s.startsWith('/Static/')) {
    const nombre = s.replace(/^\/Static\/Archivos\//, '');
    return isDevelopment
      ? `http://localhost:5000/Static/Archivos/${nombre}`
      : `${phpSystemUrl}/Static/Archivos/${nombre}`;
  }
  if (s.startsWith('/uploads/')) {
    return isDevelopment ? `http://localhost:5000${s}` : `${phpSystemUrl}${s}`;
  }
  return isDevelopment
    ? `http://localhost:5000/Static/Archivos/${s}`
    : `${phpSystemUrl}/Static/Archivos/${s}`;
}

/** @param {number} cid @param {number} anio */
async function anioActivo(cid, anioQ) {
  if (Number.isFinite(anioQ)) return anioQ;
  const [cRow] = await query('SELECT anio_activo FROM colegios WHERE id = ? LIMIT 1', [cid]);
  return parseInt(cRow?.anio_activo || new Date().getFullYear(), 10);
}

/**
 * GET /api/admin/reportes/aula-temas/meta
 * `grados` = grupos del año (nivel · grado · sección), orden: Inicial, Primaria, Secundaria.
 */
router.get('/aula-temas/meta', async (req, res) => {
  try {
    const cid = colegioId(req);
    const anio = await anioActivo(cid, req.query.anio != null ? parseInt(req.query.anio, 10) : null);
    const rows = await query(
      `SELECT g.id AS grupo_id,
              g.nivel_id,
              g.grado,
              g.seccion,
              n.nombre AS nivel_nombre
       FROM grupos g
       INNER JOIN niveles n ON n.id = g.nivel_id AND n.colegio_id = g.colegio_id
       WHERE g.colegio_id = ? AND g.anio = ?
       ORDER BY
         CASE
           WHEN LOWER(TRIM(COALESCE(n.nombre, ''))) LIKE '%inicial%' THEN 1
           WHEN LOWER(TRIM(COALESCE(n.nombre, ''))) LIKE '%primaria%' THEN 2
           WHEN LOWER(TRIM(COALESCE(n.nombre, ''))) LIKE '%secundaria%' THEN 3
           ELSE 4
         END ASC,
         n.id ASC,
         CAST(g.grado AS UNSIGNED) ASC,
         g.grado ASC,
         g.seccion ASC`,
      [cid, anio]
    );
    const docentes = await query(
      `SELECT p.id,
              TRIM(CONCAT(COALESCE(p.apellidos,''), ' ', COALESCE(p.nombres,''))) AS nombre
       FROM personal p
       INNER JOIN usuarios u ON u.personal_id = p.id AND u.colegio_id = ? AND u.estado = 'ACTIVO' AND u.tipo = 'DOCENTE'
       ORDER BY p.apellidos, p.nombres`,
      [cid]
    );
    res.json({
      anio,
      grados: (rows || []).map((r) => {
        const sec = String(r.seccion ?? '').trim();
        return {
          key: String(r.grupo_id),
          grupo_id: r.grupo_id,
          nivel_id: r.nivel_id,
          grado: r.grado,
          seccion: r.seccion,
          label: `${r.nivel_nombre || 'Nivel'} · ${r.grado}° · Sec. ${sec || '—'}`,
        };
      }),
      docentes: docentes || [],
    });
  } catch (e) {
    console.error('[admin/reportes/aula-temas/meta]', e);
    res.status(500).json({ error: e.message || 'Error al cargar catálogos' });
  }
});

/**
 * GET /api/admin/reportes/aula-temas/cursos-por-grado?grupo_id=
 */
router.get('/aula-temas/cursos-por-grado', async (req, res) => {
  try {
    const cid = colegioId(req);
    const anio = await anioActivo(cid, req.query.anio != null ? parseInt(req.query.anio, 10) : null);
    const grupoId = parseInt(req.query.grupo_id, 10);
    if (!Number.isFinite(grupoId)) {
      return res.status(400).json({ error: 'grupo_id es requerido' });
    }
    const rows = await query(
      `SELECT DISTINCT c.id, c.nombre
       FROM asignaturas a
       INNER JOIN cursos c ON c.id = a.curso_id AND c.colegio_id = ?
       INNER JOIN grupos g ON g.id = a.grupo_id AND g.colegio_id = ?
       WHERE a.colegio_id = ?
         AND g.anio = ?
         AND g.id = ?
       ORDER BY c.nombre ASC`,
      [cid, cid, cid, anio, grupoId]
    );
    res.json({ cursos: rows || [] });
  } catch (e) {
    console.error('[admin/reportes/aula-temas/cursos-por-grado]', e);
    res.status(500).json({ error: e.message || 'Error al listar cursos' });
  }
});

/**
 * GET /api/admin/reportes/aula-temas/docentes-por-grado?grupo_id=
 */
router.get('/aula-temas/docentes-por-grado', async (req, res) => {
  try {
    const cid = colegioId(req);
    const anio = await anioActivo(cid, req.query.anio != null ? parseInt(req.query.anio, 10) : null);
    const grupoId = parseInt(req.query.grupo_id, 10);
    if (!Number.isFinite(grupoId)) {
      return res.status(400).json({ error: 'grupo_id es requerido' });
    }
    const rows = await query(
      `SELECT DISTINCT p.id,
              TRIM(CONCAT(COALESCE(p.apellidos,''), ' ', COALESCE(p.nombres,''))) AS nombre
       FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id AND g.colegio_id = ?
       INNER JOIN personal p ON p.id = a.personal_id
       WHERE a.colegio_id = ?
         AND g.anio = ?
         AND g.id = ?
       ORDER BY p.apellidos, p.nombres`,
      [cid, cid, anio, grupoId]
    );
    res.json({ docentes: rows || [] });
  } catch (e) {
    console.error('[admin/reportes/aula-temas/docentes-por-grado]', e);
    res.status(500).json({ error: e.message || 'Error al listar docentes' });
  }
});

/**
 * GET /api/admin/reportes/aula-temas/contenido
 * Query: ciclo, modo=grado_curso|grado_docente|docente, grupo_id (primeros dos modos), curso_id, personal_id, anio (opcional)
 */
router.get('/aula-temas/contenido', async (req, res) => {
  try {
    const cid = colegioId(req);
    const anio = await anioActivo(cid, req.query.anio != null ? parseInt(req.query.anio, 10) : null);
    const ciclo = Math.min(4, Math.max(1, parseInt(req.query.ciclo, 10) || 1));
    const modo = String(req.query.modo || '').trim();

    let sql = `
      SELECT a.id AS asignatura_id,
             a.personal_id,
             c.nombre AS curso_nombre,
             g.grado,
             g.seccion,
             g.id AS grupo_id,
             n.nombre AS nivel_nombre,
             TRIM(CONCAT(COALESCE(p.apellidos,''), ' ', COALESCE(p.nombres,''))) AS docente_nombre
      FROM asignaturas a
      INNER JOIN cursos c ON c.id = a.curso_id AND c.colegio_id = ?
      INNER JOIN grupos g ON g.id = a.grupo_id AND g.colegio_id = ?
      INNER JOIN niveles n ON n.id = g.nivel_id AND n.colegio_id = ?
      INNER JOIN personal p ON p.id = a.personal_id
      WHERE a.colegio_id = ? AND g.anio = ?
    `;
    const params = [cid, cid, cid, cid, anio];

    if (modo === 'grado_curso') {
      const grupoId = parseInt(req.query.grupo_id, 10);
      const cursoId = parseInt(req.query.curso_id, 10);
      if (!Number.isFinite(grupoId) || !Number.isFinite(cursoId)) {
        return res.status(400).json({ error: 'grupo_id y curso_id son requeridos' });
      }
      sql += ` AND g.id = ? AND a.curso_id = ?`;
      params.push(grupoId, cursoId);
    } else if (modo === 'grado_docente') {
      const grupoId = parseInt(req.query.grupo_id, 10);
      const personalId = parseInt(req.query.personal_id, 10);
      if (!Number.isFinite(grupoId) || !Number.isFinite(personalId)) {
        return res.status(400).json({ error: 'grupo_id y personal_id son requeridos' });
      }
      sql += ` AND g.id = ? AND a.personal_id = ?`;
      params.push(grupoId, personalId);
    } else if (modo === 'docente') {
      const personalId = parseInt(req.query.personal_id, 10);
      if (!Number.isFinite(personalId)) {
        return res.status(400).json({ error: 'personal_id es requerido' });
      }
      sql += ` AND a.personal_id = ?`;
      params.push(personalId);
    } else {
      return res.status(400).json({ error: 'modo inválido' });
    }

    sql += ` ORDER BY n.nombre, g.grado, g.seccion, c.nombre`;

    const asignRows = await query(sql, params);
    const ids = (asignRows || []).map((r) => r.asignatura_id);
    if (ids.length === 0) {
      return res.json({ ciclo, anio, bloques: [] });
    }
    const inList = ids.map(() => '?').join(',');

    const [
      archivos,
      sesiones,
      tareas,
      videos,
      enlaces,
      examenes,
      temasLegacy,
    ] = await Promise.all([
      query(
        `SELECT * FROM asignaturas_archivos
         WHERE asignatura_id IN (${inList}) AND ciclo = ?
         ORDER BY asignatura_id, orden ASC, id ASC`,
        [...ids, ciclo]
      ),
      query(
        `SELECT s.*, aa.nombre AS tema_nombre_ref
         FROM asignaturas_sesion_pdf s
         INNER JOIN asignaturas_archivos aa ON aa.id = s.tema_id AND aa.asignatura_id = s.asignatura_id
         WHERE s.asignatura_id IN (${inList}) AND s.ciclo = ?
         ORDER BY s.asignatura_id, s.id ASC`,
        [...ids, ciclo]
      ),
      query(
        `SELECT t.*, CONCAT(p.nombres, ' ', p.apellidos) AS docente_tarea_nombre
         FROM asignaturas_tareas t
         INNER JOIN personal p ON p.id = t.trabajador_id
         WHERE t.asignatura_id IN (${inList}) AND t.ciclo = ?
         ORDER BY t.asignatura_id, t.id ASC`,
        [...ids, ciclo]
      ),
      query(
        `SELECT * FROM asignaturas_videos
         WHERE asignatura_id IN (${inList}) AND ciclo = ?
         ORDER BY asignatura_id, id ASC`,
        [...ids, ciclo]
      ),
      query(
        `SELECT * FROM asignaturas_enlaces
         WHERE asignatura_id IN (${inList}) AND ciclo = ?
         ORDER BY asignatura_id, id ASC`,
        [...ids, ciclo]
      ),
      query(
        `SELECT id, asignatura_id, titulo, ciclo, estado FROM asignaturas_examenes
         WHERE asignatura_id IN (${inList}) AND ciclo = ?
         ORDER BY asignatura_id, id ASC`,
        [...ids, ciclo]
      ),
      query(
        `SELECT * FROM asignaturas_temas
         WHERE asignatura_id IN (${inList})
         ORDER BY asignatura_id, fecha DESC, id DESC`,
        ids
      ),
    ]);

    const tareaIds = (tareas || []).map((t) => t.id);
    let tareaArchivos = [];
    if (tareaIds.length > 0) {
      const ti = tareaIds.map(() => '?').join(',');
      tareaArchivos = await query(
        `SELECT * FROM asignaturas_tareas_archivos WHERE tarea_id IN (${ti})`,
        tareaIds
      );
    }
    const archivosPorTarea = {};
    (tareaArchivos || []).forEach((a) => {
      if (!archivosPorTarea[a.tarea_id]) archivosPorTarea[a.tarea_id] = [];
      archivosPorTarea[a.tarea_id].push({
        ...a,
        archivo_url: buildArchivoUrl(a.archivo),
      });
    });

    const sesionesMapped = (sesiones || []).map((s) => {
      let archivoUrl = null;
      if (s.archivo && s.archivo !== '') {
        const nombre = s.archivo.startsWith('/Static/Archivos/')
          ? s.archivo.replace(/^\/Static\/Archivos\//, '')
          : s.archivo;
        archivoUrl = buildArchivoUrl(nombre);
      }
      return {
        tipo: 'sesion',
        id: s.id,
        asignatura_id: s.asignatura_id,
        titulo: s.titulo || s.tema_nombre_ref,
        descripcion: s.descripcion || '',
        url: archivoUrl,
        tema_nombre: s.tema_nombre_ref,
      };
    });

    const archivosMapped = (archivos || []).map((row) => {
      const url = row.enlace && String(row.enlace).trim() !== ''
        ? row.enlace
        : buildArchivoUrl(row.archivo);
      return {
        tipo: 'tema_interactivo',
        id: row.id,
        asignatura_id: row.asignatura_id,
        titulo: row.nombre,
        url,
        extra: row.archivo ? 'archivo' : '',
      };
    });

    const tareasMapped = (tareas || []).map((t) => {
      const adj = archivosPorTarea[t.id] || [];
      const firstUrl = adj[0]?.archivo_url || (t.enlace && String(t.enlace).trim() !== '' ? t.enlace : null);
      return {
        tipo: 'tarea',
        id: t.id,
        asignatura_id: t.asignatura_id,
        titulo: t.titulo,
        url: firstUrl,
        archivos: adj,
        enlace: t.enlace || null,
      };
    });

    const videosMapped = (videos || []).map((v) => ({
      tipo: 'video',
      id: v.id,
      asignatura_id: v.asignatura_id,
      titulo: v.descripcion || 'Video',
      url: v.enlace && String(v.enlace).trim() !== '' ? v.enlace : null,
    }));

    const enlacesMapped = (enlaces || []).map((e) => ({
      tipo: 'enlace',
      id: e.id,
      asignatura_id: e.asignatura_id,
      titulo: e.descripcion || 'Enlace',
      url: e.enlace || null,
    }));

    const examenesMapped = (examenes || []).map((ex) => ({
      tipo: 'examen_aula',
      id: ex.id,
      asignatura_id: ex.asignatura_id,
      titulo: ex.titulo || 'Examen',
      url: null,
      estado: ex.estado,
    }));

    const temasLegacyMapped = (temasLegacy || []).map((t) => {
      const url =
        t.enlace && String(t.enlace).trim() !== ''
          ? t.enlace
          : buildArchivoUrl(t.archivo);
      return {
        tipo: 'tema_legacy',
        id: t.id,
        asignatura_id: t.asignatura_id,
        titulo: t.nombre || t.titulo || 'Tema',
        url,
        sin_bimestre: true,
      };
    });

    const porAsignatura = {};
    const pushItems = (list) => {
      list.forEach((it) => {
        const aid = it.asignatura_id;
        if (!porAsignatura[aid]) porAsignatura[aid] = [];
        porAsignatura[aid].push(it);
      });
    };
    pushItems(archivosMapped);
    pushItems(sesionesMapped);
    pushItems(tareasMapped);
    pushItems(videosMapped);
    pushItems(enlacesMapped);
    pushItems(examenesMapped);
    pushItems(temasLegacyMapped);

    const bloques = (asignRows || []).map((row) => ({
      ...row,
      aula_url: `/docente/cursos/${row.asignatura_id}/aula`,
      items: porAsignatura[row.asignatura_id] || [],
    }));

    res.json({ ciclo, anio, modo, bloques });
  } catch (e) {
    console.error('[admin/reportes/aula-temas/contenido]', e);
    res.status(500).json({ error: e.message || 'Error al cargar contenido' });
  }
});

module.exports = router;
