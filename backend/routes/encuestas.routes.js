/**
 * Encuestas intranet: audiencias múltiples, tipos vanguard-like, respuestas por usuario.
 * Identidad y grado se toman del JWT / matrícula; no se pide nombre ni grado en el formulario.
 */
const express = require('express');
const router = express.Router();
const { query, execute, getAnioActivo } = require('../utils/mysql');
const { authenticateToken } = require('../middleware/auth');
const {
  notificarEncuestaActivada,
  notificarAdminsEncuestaActivada,
  notificarAdminsEncuestaRespondida,
  obtenerNombreMostrarUsuario
} = require('../services/encuestasNotificacionService');

const ADMIN_TYPES = new Set(['ADMINISTRADOR', 'PROMOTORIA']);

function requireAdminOrPromotoria(req, res, next) {
  if (!req.user || !ADMIN_TYPES.has(req.user.tipo)) {
    return res.status(403).json({ error: 'No autorizado' });
  }
  next();
}

/** Audiencia: filas encuestas_audiencias */
function usuarioCoincideAudiencia(user, audiencias) {
  if (!audiencias || audiencias.length === 0) return false;
  if (audiencias.some((a) => a.tipo === 'TODOS')) return true;
  if (audiencias.some((a) => a.tipo === user.tipo)) return true;
  if (user.tipo === 'PSICOLOGA' && audiencias.some((a) => a.tipo === 'DOCENTE')) return true;
  return false;
}

async function cargarGruposIds(encuestaId) {
  const rows = await query(`SELECT grupo_id FROM encuestas_grupos WHERE encuesta_id = ?`, [encuestaId]);
  return (rows || []).map((r) => Number(r.grupo_id)).filter(Boolean);
}

/** Grupos del usuario en el año activo. Admin/promotoría: todos=true (bypass de filtro por grupo). */
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
  if ((tipo === 'DOCENTE' || tipo === 'PSICOLOGA') && user.personal_id) {
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

function usuarioCoincideAlcanceGrupos(user, encuestaGrupoIds, ug) {
  if (!encuestaGrupoIds || encuestaGrupoIds.length === 0) return true;
  const tipo = String(user.tipo || '').toUpperCase();
  if (tipo === 'ADMINISTRADOR' || tipo === 'PROMOTORIA') return true;
  if (ug.todos) return true;
  const setE = new Set(encuestaGrupoIds);
  return ug.ids.some((g) => setE.has(g));
}

async function usuarioPuedeVerEncuesta(user, colegio_id, encuestaId, audiencias) {
  if (!usuarioCoincideAudiencia(user, audiencias)) return false;
  const gids = await cargarGruposIds(encuestaId);
  if (!gids.length) return true;
  const anio = await getAnioActivo(colegio_id);
  const ug = await obtenerGruposUsuario(user, colegio_id, anio);
  return usuarioCoincideAlcanceGrupos(user, gids, ug);
}

function htmlTieneContenido(html) {
  const s = String(html || '');
  if (!s.trim()) return false;
  if (/<img\b/i.test(s)) return true;
  const text = s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 0;
}

function normalizarAlcanceGrupos(raw, gruposIds) {
  const ids = [...new Set((gruposIds || []).map((g) => parseInt(g, 10)).filter(Boolean))];
  let alcance = String(raw || 'TODOS').toUpperCase();
  if (alcance !== 'GRUPOS' && alcance !== 'TODOS') alcance = 'TODOS';
  if (ids.length > 0) alcance = 'GRUPOS';
  if (alcance === 'TODOS') return { alcance: 'TODOS', grupos: [] };
  return { alcance: 'GRUPOS', grupos: ids };
}

async function guardarGruposEncuesta(encuestaId, alcance, grupos) {
  await execute(`DELETE FROM encuestas_grupos WHERE encuesta_id = ?`, [encuestaId]);
  await execute(`UPDATE encuestas SET alcance_grupos = ? WHERE id = ?`, [alcance, encuestaId]);
  if (alcance === 'GRUPOS') {
    for (const gid of grupos) {
      await execute(`INSERT INTO encuestas_grupos (encuesta_id, grupo_id) VALUES (?, ?)`, [encuestaId, gid]);
    }
  }
}

function encuestaVigente(enc) {
  if (!enc || String(enc.estado).toUpperCase() !== 'ACTIVO') return false;
  const today = new Date();
  const d0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (enc.fecha_inicio) {
    const fi = new Date(enc.fecha_inicio);
    const a = new Date(fi.getFullYear(), fi.getMonth(), fi.getDate());
    if (d0 < a) return false;
  }
  if (enc.fecha_fin) {
    const ff = new Date(enc.fecha_fin);
    const b = new Date(ff.getFullYear(), ff.getMonth(), ff.getDate());
    if (d0 > b) return false;
  }
  return true;
}

async function cargarAudiencias(encuestaId) {
  return query(
    `SELECT id, encuesta_id, tipo FROM encuestas_audiencias WHERE encuesta_id = ? ORDER BY tipo`,
    [encuestaId]
  );
}

async function getGradoSnapshot(alumnoId, colegioId, anio) {
  if (!alumnoId || !anio) return { grado_snapshot: null, nivel_snapshot: null };
  const rows = await query(
    `SELECT n.nombre AS nivel_nombre, g.grado, g.seccion
     FROM matriculas m
     INNER JOIN grupos g ON g.id = m.grupo_id
     INNER JOIN niveles n ON n.id = g.nivel_id
     WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ?
       AND (m.estado = 0)
     LIMIT 1`,
    [alumnoId, colegioId, anio]
  );
  if (!rows || !rows.length) return { grado_snapshot: null, nivel_snapshot: null };
  const r = rows[0];
  const grado = [r.grado, r.seccion].filter(Boolean).join(' ').trim();
  return {
    grado_snapshot: grado || null,
    nivel_snapshot: r.nivel_nombre || null
  };
}

/** Etiqueta estable para agrupar stats/historial (grado + nivel). */
function etiquetaGrupoRespuesta(grado, nivel) {
  const g = String(grado || '').trim();
  const n = String(nivel || '').trim();
  if (g && n) return `${g} - ${n}`;
  if (g) return g;
  if (n) return n;
  return 'Sin grupo';
}

/**
 * Agrupa todos los apoderados en un solo bucket (un apoderado puede tener hijos en varios grados).
 * Alumnos / otros roles siguen por grado · nivel.
 */
function etiquetaGrupoPorRol(rol, grado, nivel) {
  if (String(rol || '').toUpperCase() === 'APODERADO') return 'Apoderados';
  return etiquetaGrupoRespuesta(grado, nivel);
}

/**
 * Snapshot al responder: alumno por matrícula; apoderado por hijos del año activo.
 * @returns {{ alumno_id: number|null, grado_snapshot: string|null, nivel_snapshot: string|null }}
 */
async function getSnapshotRespondiente(user, colegioId, anio) {
  const tipo = String(user.tipo || '').toUpperCase();
  if (user.alumno_id) {
    const snap = await getGradoSnapshot(user.alumno_id, colegioId, anio);
    return { alumno_id: user.alumno_id, ...snap };
  }
  if (tipo === 'APODERADO' && user.apoderado_id) {
    const rows = await query(
      `SELECT DISTINCT m.alumno_id, n.nombre AS nivel_nombre, g.grado, g.seccion
       FROM familias f
       INNER JOIN matriculas m ON m.alumno_id = f.alumno_id AND m.colegio_id = ?
       INNER JOIN grupos g ON g.id = m.grupo_id AND g.anio = ?
       LEFT JOIN niveles n ON n.id = g.nivel_id
       WHERE f.apoderado_id = ? AND (m.estado = 0)
       ORDER BY g.grado, g.seccion`,
      [colegioId, anio, user.apoderado_id]
    );
    if (!rows || !rows.length) {
      return { alumno_id: null, grado_snapshot: null, nivel_snapshot: null };
    }
    if (rows.length === 1) {
      const r = rows[0];
      const grado = [r.grado, r.seccion].filter(Boolean).join(' ').trim();
      return {
        alumno_id: r.alumno_id,
        grado_snapshot: grado || null,
        nivel_snapshot: r.nivel_nombre || null
      };
    }
    const grados = [
      ...new Set(
        rows
          .map((r) => [r.grado, r.seccion].filter(Boolean).join(' ').trim())
          .filter(Boolean)
      )
    ];
    const niveles = [...new Set(rows.map((r) => r.nivel_nombre).filter(Boolean))];
    return {
      alumno_id: rows[0].alumno_id,
      grado_snapshot: grados.join(', ') || null,
      nivel_snapshot: niveles.join(', ') || null
    };
  }
  return { alumno_id: null, grado_snapshot: null, nivel_snapshot: null };
}

async function enriquecerGrupoHistorialFilas(filas, colegioId) {
  const anio = await getAnioActivo(colegioId);
  const needUserIds = [
    ...new Set(
      (filas || [])
        .filter(
          (f) =>
            !String(f.grado_snapshot || '').trim() &&
            String(f.rol_respondiente || f.usuario_tipo || '').toUpperCase() === 'APODERADO' &&
            f.usuario_id
        )
        .map((f) => Number(f.usuario_id))
    )
  ];

  const snapByUsuario = new Map();
  if (needUserIds.length) {
    const ph = needUserIds.map(() => '?').join(',');
    const urows = await query(
      `SELECT id, apoderado_id FROM usuarios WHERE colegio_id = ? AND id IN (${ph}) AND apoderado_id IS NOT NULL`,
      [colegioId, ...needUserIds]
    );
    for (const u of urows || []) {
      const snap = await getSnapshotRespondiente(
        { tipo: 'APODERADO', apoderado_id: u.apoderado_id },
        colegioId,
        anio
      );
      snapByUsuario.set(Number(u.id), snap);
    }
  }

  return (filas || []).map((f) => {
    let grado = f.grado_snapshot;
    let nivel = f.nivel_snapshot;
    if ((!grado || !String(grado).trim()) && snapByUsuario.has(Number(f.usuario_id))) {
      const snap = snapByUsuario.get(Number(f.usuario_id));
      grado = snap.grado_snapshot || grado;
      nivel = snap.nivel_snapshot || nivel;
    }
    return {
      ...f,
      grado_snapshot: grado,
      nivel_snapshot: nivel,
      grupo_etiqueta: etiquetaGrupoPorRol(f.rol_respondiente || f.usuario_tipo, grado, nivel)
    };
  });
}

async function construirResultadosPreguntas(encuestaId, respuestaIds) {
  const preguntas = await query(
    `SELECT * FROM encuestas_preguntas WHERE encuesta_id = ? ORDER BY orden ASC, id ASC`,
    [encuestaId]
  );
  const resultadosPreguntas = [];
  const ids = Array.isArray(respuestaIds) ? respuestaIds.map((x) => Number(x)).filter(Boolean) : null;
  if (ids && ids.length === 0) {
    for (const p of preguntas || []) {
      const tipo = p.tipo_interfaz || mapLegacyTipo(p.tipo_respuesta);
      resultadosPreguntas.push({
        pregunta_id: p.id,
        orden: p.orden,
        texto_pregunta: p.descripcion,
        tipo_respuesta: tipo,
        datos: tipo === 'escala' ? { distribucion: {}, promedio: null, total: 0 } : tipo === 'texto_corto' || tipo === 'texto_largo' ? { muestras: [] } : {}
      });
    }
    return resultadosPreguntas;
  }

  const ph = ids && ids.length ? ids.map(() => '?').join(',') : null;
  const filterR = ph ? ` AND r.id IN (${ph})` : '';
  const paramsExtra = ph ? ids : [];

  for (const p of preguntas || []) {
    const tipo = p.tipo_interfaz || mapLegacyTipo(p.tipo_respuesta);
    const item = {
      pregunta_id: p.id,
      orden: p.orden,
      texto_pregunta: p.descripcion,
      tipo_respuesta: tipo,
      datos: {}
    };

    if (tipo === 'marcar' || tipo === 'lista') {
      const det = await query(
        `SELECT d.opciones_json FROM encuestas_respuestas_detalle d
         INNER JOIN encuestas_respuestas r ON r.id = d.respuesta_id
         WHERE d.pregunta_id = ? AND r.encuesta_id = ? AND d.opciones_json IS NOT NULL${filterR}`,
        [p.id, encuestaId, ...paramsExtra]
      );
      const conteo = {};
      for (const row of det || []) {
        let arr = row.opciones_json;
        if (typeof arr === 'string') {
          try {
            arr = JSON.parse(arr);
          } catch {
            arr = [];
          }
        }
        if (!Array.isArray(arr)) arr = arr ? [arr] : [];
        arr.forEach((op) => {
          const k = String(op);
          conteo[k] = (conteo[k] || 0) + 1;
        });
      }
      item.datos = conteo;
    } else if (tipo === 'escala') {
      const det = await query(
        `SELECT d.valor_numerico, COUNT(*) AS c
         FROM encuestas_respuestas_detalle d
         INNER JOIN encuestas_respuestas r ON r.id = d.respuesta_id
         WHERE d.pregunta_id = ? AND r.encuesta_id = ? AND d.valor_numerico IS NOT NULL${filterR}
         GROUP BY d.valor_numerico ORDER BY d.valor_numerico`,
        [p.id, encuestaId, ...paramsExtra]
      );
      const dist = {};
      let suma = 0;
      let n = 0;
      for (const row of det || []) {
        const v = Number(row.valor_numerico);
        dist[v] = Number(row.c);
        suma += v * Number(row.c);
        n += Number(row.c);
      }
      item.datos = { distribucion: dist, promedio: n > 0 ? Math.round((suma / n) * 100) / 100 : null, total: n };
    } else if (tipo === 'texto_corto' || tipo === 'texto_largo') {
      const det = await query(
        `SELECT d.texto_respuesta FROM encuestas_respuestas_detalle d
         INNER JOIN encuestas_respuestas r ON r.id = d.respuesta_id
         WHERE d.pregunta_id = ? AND r.encuesta_id = ? AND d.texto_respuesta IS NOT NULL AND TRIM(d.texto_respuesta) <> ''${filterR}
         ORDER BY d.id DESC LIMIT 3000`,
        [p.id, encuestaId, ...paramsExtra]
      );
      item.datos = { muestras: (det || []).map((x) => x.texto_respuesta) };
    } else {
      item.datos = {};
    }
    resultadosPreguntas.push(item);
  }
  return resultadosPreguntas;
}

function parseOpciones(row) {
  let o = row.opciones_json;
  if (o == null) return null;
  if (typeof o === 'string') {
    try {
      o = JSON.parse(o);
    } catch {
      return null;
    }
  }
  return o;
}

function normalizarPreguntaPublica(row) {
  let opciones = parseOpciones(row);
  const tipo = row.tipo_interfaz || mapLegacyTipo(row.tipo_respuesta);
  if ((tipo === 'marcar' || tipo === 'lista') && (!opciones || !opciones.opciones)) {
    opciones = { opciones: [], multiple: false };
  }
  return {
    id: row.id,
    encuesta_id: row.encuesta_id,
    orden: row.orden,
    texto_pregunta: row.descripcion,
    descripcion: row.descripcion,
    subtitulo: row.subtitulo || '',
    tipo_respuesta: tipo,
    tipo_interfaz: tipo,
    obligatoria: row.obligatoria !== 0 && row.obligatoria !== false,
    opciones: opciones || {}
  };
}

function mapLegacyTipo(tr) {
  const t = String(tr || '').toUpperCase();
  if (t === 'ALTERNATIVAS') return 'marcar';
  if (t === 'TEXTO') return 'texto_largo';
  if (t === 'TITULO') return 'titulo';
  return 'texto_corto';
}

/** Primera encuesta activa pendiente para mostrar modal (una por encuesta vía encuestas_modal_visto). */
async function buscarEncuestaModalPendiente(user, colegio_id) {
  const uid = user.usuario_id;
  const rows = await query(
    `SELECT e.* FROM encuestas e
     WHERE e.colegio_id = ? AND e.estado = 'ACTIVO'
       AND (e.fecha_inicio IS NULL OR DATE(e.fecha_inicio) <= CURDATE())
       AND (e.fecha_fin IS NULL OR DATE(e.fecha_fin) >= CURDATE())
       AND NOT EXISTS (
         SELECT 1 FROM encuestas_respuestas r WHERE r.encuesta_id = e.id AND r.usuario_id = ?
       )
       AND NOT EXISTS (
         SELECT 1 FROM encuestas_modal_visto m WHERE m.encuesta_id = e.id AND m.usuario_id = ?
       )
     ORDER BY e.id DESC`,
    [colegio_id, uid, uid]
  );
  for (const e of rows || []) {
    if (!encuestaVigente(e)) continue;
    const aud = await cargarAudiencias(e.id);
    if (await usuarioPuedeVerEncuesta(user, colegio_id, e.id, aud)) {
      return {
        id: e.id,
        titulo: e.titulo,
        descripcion: e.descripcion || null
      };
    }
  }
  return null;
}

// ---------- Admin ----------

router.get('/admin/lista', authenticateToken, requireAdminOrPromotoria, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const rows = await query(
      `SELECT e.*,
              (SELECT COUNT(*) FROM encuestas_respuestas r WHERE r.encuesta_id = e.id) AS total_respuestas
       FROM encuestas e
       WHERE e.colegio_id = ?
       ORDER BY e.id DESC`,
      [colegio_id]
    );
    const out = [];
    for (const e of rows || []) {
      const aud = await cargarAudiencias(e.id);
      const grupos = await cargarGruposIds(e.id);
      out.push({
        ...e,
        audiencias: aud.map((a) => a.tipo),
        grupos,
        alcance_grupos: String(e.alcance_grupos || 'TODOS').toUpperCase() === 'GRUPOS' || grupos.length ? 'GRUPOS' : 'TODOS'
      });
    }
    res.json({ success: true, encuestas: out });
  } catch (err) {
    console.error('[encuestas] admin lista', err);
    res.status(500).json({ error: 'Error al listar encuestas' });
  }
});

router.get('/admin/:id/estadisticas', authenticateToken, requireAdminOrPromotoria, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const grupoFiltro = req.query.grupo != null ? String(req.query.grupo).trim() : '';
    const enc = await query(`SELECT * FROM encuestas WHERE id = ? AND colegio_id = ? LIMIT 1`, [id, colegio_id]);
    if (!enc || !enc.length) return res.status(404).json({ error: 'No encontrada' });

    const todas = await query(
      `SELECT id, rol_respondiente, grado_snapshot, nivel_snapshot FROM encuestas_respuestas WHERE encuesta_id = ?`,
      [id]
    );

    const enriquecidas = (todas || []).map((r) => ({
      ...r,
      grupo_etiqueta: etiquetaGrupoPorRol(r.rol_respondiente, r.grado_snapshot, r.nivel_snapshot)
    }));

    const totalGeneral = enriquecidas.length;
    const porGrupoMap = new Map();
    for (const r of enriquecidas) {
      const k = r.grupo_etiqueta;
      porGrupoMap.set(k, (porGrupoMap.get(k) || 0) + 1);
    }
    const porGrupo = [...porGrupoMap.entries()]
      .map(([etiqueta, c]) => ({ etiqueta, c }))
      .sort((a, b) => {
        if (a.etiqueta === 'Apoderados') return -1;
        if (b.etiqueta === 'Apoderados') return 1;
        return b.c - a.c || a.etiqueta.localeCompare(b.etiqueta, 'es');
      });

    const scope =
      grupoFiltro && grupoFiltro !== '__TODOS__' && grupoFiltro !== 'TODOS'
        ? enriquecidas.filter((r) => r.grupo_etiqueta === grupoFiltro)
        : enriquecidas;
    const filtrado = !!(grupoFiltro && grupoFiltro !== '__TODOS__' && grupoFiltro !== 'TODOS');
    const respuestaIds = scope.map((r) => r.id);
    const totalRespuestas = scope.length;

    const porRolMap = new Map();
    for (const r of scope) {
      const rol = r.rol_respondiente || 'OTRO';
      porRolMap.set(rol, (porRolMap.get(rol) || 0) + 1);
    }
    const porRol = [...porRolMap.entries()].map(([rol_respondiente, c]) => ({ rol_respondiente, c }));

    const resultadosPreguntas = await construirResultadosPreguntas(id, filtrado ? respuestaIds : null);

    res.json({
      success: true,
      encuesta: enc[0],
      totalGeneral,
      totalRespuestas,
      grupoSeleccionado: grupoFiltro && grupoFiltro !== '__TODOS__' ? grupoFiltro : null,
      porGrupo,
      porRol,
      resultadosPreguntas
    });
  } catch (err) {
    console.error('[encuestas] estadisticas', err);
    res.status(500).json({ error: 'Error al cargar estadísticas' });
  }
});

/** Vista previa del formulario (admin): sin comprobar audiencia ni “ya respondió”. */
router.get('/admin/:id/vista-previa', authenticateToken, requireAdminOrPromotoria, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const enc = await query(`SELECT * FROM encuestas WHERE id = ? AND colegio_id = ? LIMIT 1`, [id, colegio_id]);
    if (!enc || !enc.length) return res.status(404).json({ error: 'Encuesta no encontrada' });
    const e = enc[0];
    const preg = await query(
      `SELECT * FROM encuestas_preguntas WHERE encuesta_id = ? ORDER BY orden ASC, id ASC`,
      [id]
    );
    const preguntas = (preg || []).map(normalizarPreguntaPublica);
    res.json({
      success: true,
      preview: true,
      encuesta: {
        id: e.id,
        titulo: e.titulo,
        descripcion: e.descripcion,
        mensaje_agradecimiento: e.mensaje_agradecimiento
      },
      preguntas,
      usuario_contexto: { tipo: 'ADMIN', etiqueta: 'Vista previa (no se guarda)' }
    });
  } catch (err) {
    console.error('[encuestas] vista-previa', err);
    res.status(500).json({ error: 'Error al cargar vista previa' });
  }
});

/** Listado de quién respondió (admin). */
router.get('/admin/:id/historial', authenticateToken, requireAdminOrPromotoria, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const encuestaId = parseInt(req.params.id, 10);
    const enc = await query(`SELECT id, titulo FROM encuestas WHERE id = ? AND colegio_id = ? LIMIT 1`, [
      encuestaId,
      colegio_id
    ]);
    if (!enc || !enc.length) return res.status(404).json({ error: 'No encontrada' });

    const filasRaw = await query(
      `SELECT r.id AS respuesta_id, r.usuario_id, r.rol_respondiente, r.fecha_respuesta,
              r.grado_snapshot, r.nivel_snapshot, u.usuario AS usuario_login, u.tipo AS usuario_tipo,
              COALESCE(
                NULLIF(TRIM(CONCAT(COALESCE(a.nombres,''), ' ', COALESCE(a.apellido_paterno,''), ' ', COALESCE(a.apellido_materno,''))), ''),
                NULLIF(TRIM(CONCAT(COALESCE(p.nombres,''), ' ', COALESCE(p.apellidos,''))), ''),
                NULLIF(TRIM(CONCAT(COALESCE(ap.nombres,''), ' ', COALESCE(ap.apellido_paterno,''), ' ', COALESCE(ap.apellido_materno,''))), ''),
                u.usuario
              ) AS nombre_mostrar
       FROM encuestas_respuestas r
       INNER JOIN usuarios u ON u.id = r.usuario_id
       LEFT JOIN alumnos a ON a.id = u.alumno_id
       LEFT JOIN personal p ON p.id = u.personal_id
       LEFT JOIN apoderados ap ON ap.id = u.apoderado_id
       WHERE r.encuesta_id = ?
       ORDER BY r.fecha_respuesta DESC`,
      [encuestaId]
    );

    const filas = await enriquecerGrupoHistorialFilas(filasRaw || [], colegio_id);

    const porGrupoMap = new Map();
    for (const f of filas) {
      const k = f.grupo_etiqueta || 'Sin grupo';
      porGrupoMap.set(k, (porGrupoMap.get(k) || 0) + 1);
    }
    const porGrupo = [...porGrupoMap.entries()]
      .map(([etiqueta, c]) => ({ etiqueta, c }))
      .sort((a, b) => {
        if (a.etiqueta === 'Apoderados') return -1;
        if (b.etiqueta === 'Apoderados') return 1;
        return b.c - a.c || a.etiqueta.localeCompare(b.etiqueta, 'es');
      });

    res.json({
      success: true,
      encuesta: enc[0],
      filas,
      porGrupo,
      total: filas.length
    });
  } catch (err) {
    console.error('[encuestas] historial', err);
    res.status(500).json({ error: 'Error al cargar historial' });
  }
});

/** Detalle de una respuesta concreta (pregunta → texto legible). */
router.get('/admin/:id/respuestas/:respuestaId', authenticateToken, requireAdminOrPromotoria, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const encuestaId = parseInt(req.params.id, 10);
    const respuestaId = parseInt(req.params.respuestaId, 10);

    const rcheck = await query(
      `SELECT r.id, r.usuario_id, r.rol_respondiente, r.fecha_respuesta, r.grado_snapshot, r.nivel_snapshot
       FROM encuestas_respuestas r
       INNER JOIN encuestas e ON e.id = r.encuesta_id AND e.colegio_id = ?
       WHERE r.id = ? AND r.encuesta_id = ?`,
      [colegio_id, respuestaId, encuestaId]
    );
    if (!rcheck || !rcheck.length) return res.status(404).json({ error: 'Respuesta no encontrada' });
    const resp = rcheck[0];

    const nombreRows = await query(
      `SELECT COALESCE(
          NULLIF(TRIM(CONCAT(COALESCE(a.nombres,''), ' ', COALESCE(a.apellido_paterno,''), ' ', COALESCE(a.apellido_materno,''))), ''),
          NULLIF(TRIM(CONCAT(COALESCE(p.nombres,''), ' ', COALESCE(p.apellidos,''))), ''),
          NULLIF(TRIM(CONCAT(COALESCE(ap.nombres,''), ' ', COALESCE(ap.apellido_paterno,''), ' ', COALESCE(ap.apellido_materno,''))), ''),
          u.usuario
        ) AS nombre_mostrar, u.usuario AS usuario_login, u.tipo AS usuario_tipo
       FROM usuarios u
       LEFT JOIN alumnos a ON a.id = u.alumno_id
       LEFT JOIN personal p ON p.id = u.personal_id
       LEFT JOIN apoderados ap ON ap.id = u.apoderado_id
       WHERE u.id = ?
       LIMIT 1`,
      [resp.usuario_id]
    );
    const nombreMostrar = nombreRows && nombreRows[0] ? nombreRows[0].nombre_mostrar : 'Usuario';

    const det = await query(
      `SELECT d.pregunta_id, d.texto_respuesta, d.valor_numerico, d.opciones_json,
              pr.descripcion AS pregunta_texto, pr.orden, pr.subtitulo,
              pr.tipo_interfaz, pr.tipo_respuesta
       FROM encuestas_respuestas_detalle d
       INNER JOIN encuestas_preguntas pr ON pr.id = d.pregunta_id
       WHERE d.respuesta_id = ?
       ORDER BY pr.orden ASC, pr.id ASC`,
      [respuestaId]
    );

    const items = (det || []).map((row) => {
      const ti = row.tipo_interfaz || mapLegacyTipo(row.tipo_respuesta);
      let respuestaLegible = '';
      if (ti === 'titulo') {
        respuestaLegible = '—';
      } else if (ti === 'texto_corto' || ti === 'texto_largo') {
        respuestaLegible = row.texto_respuesta != null ? String(row.texto_respuesta) : '';
      } else if (ti === 'escala') {
        respuestaLegible = row.valor_numerico != null ? String(row.valor_numerico) : '—';
      } else if (ti === 'marcar' || ti === 'lista') {
        let arr = row.opciones_json;
        if (typeof arr === 'string') {
          try {
            arr = JSON.parse(arr);
          } catch {
            arr = [];
          }
        }
        if (!Array.isArray(arr)) arr = arr ? [arr] : [];
        respuestaLegible = arr.length ? arr.join(', ') : '—';
      } else {
        respuestaLegible = row.texto_respuesta != null ? String(row.texto_respuesta) : '—';
      }
      return {
        pregunta_id: row.pregunta_id,
        orden: row.orden,
        texto_pregunta: row.pregunta_texto,
        subtitulo: row.subtitulo || '',
        tipo_interfaz: ti,
        respuesta_legible: respuestaLegible
      };
    });

    res.json({
      success: true,
      respuesta: {
        id: resp.id,
        usuario_id: resp.usuario_id,
        nombre_mostrar: nombreMostrar,
        usuario_login: nombreRows && nombreRows[0] ? nombreRows[0].usuario_login : '',
        usuario_tipo: nombreRows && nombreRows[0] ? nombreRows[0].usuario_tipo : '',
        rol_respondiente: resp.rol_respondiente,
        fecha_respuesta: resp.fecha_respuesta,
        grado_snapshot: resp.grado_snapshot,
        nivel_snapshot: resp.nivel_snapshot
      },
      items
    });
  } catch (err) {
    console.error('[encuestas] admin respuesta detalle', err);
    res.status(500).json({ error: 'Error al cargar el detalle' });
  }
});

router.get('/admin/:id', authenticateToken, requireAdminOrPromotoria, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const enc = await query(`SELECT * FROM encuestas WHERE id = ? AND colegio_id = ? LIMIT 1`, [id, colegio_id]);
    if (!enc || !enc.length) return res.status(404).json({ error: 'Encuesta no encontrada' });
    const preg = await query(
      `SELECT * FROM encuestas_preguntas WHERE encuesta_id = ? ORDER BY orden ASC, id ASC`,
      [id]
    );
    const audiencias = await cargarAudiencias(id);
    const grupos = await cargarGruposIds(id);
    const preguntas = (preg || []).map((p) => ({
      id: p.id,
      orden: p.orden,
      texto_pregunta: p.descripcion,
      subtitulo: p.subtitulo || '',
      tipo_interfaz: p.tipo_interfaz || mapLegacyTipo(p.tipo_respuesta),
      tipo_respuesta: p.tipo_respuesta,
      obligatoria: p.obligatoria !== 0 && p.obligatoria !== false,
      opciones: parseOpciones(p) || {}
    }));
    const alcance =
      String(enc[0].alcance_grupos || 'TODOS').toUpperCase() === 'GRUPOS' || grupos.length ? 'GRUPOS' : 'TODOS';
    res.json({
      success: true,
      encuesta: { ...enc[0], alcance_grupos: alcance },
      preguntas,
      audiencias: audiencias.map((a) => a.tipo),
      grupos,
      alcance_grupos: alcance
    });
  } catch (err) {
    console.error('[encuestas] admin get', err);
    res.status(500).json({ error: 'Error al cargar encuesta' });
  }
});

router.post('/admin', authenticateToken, requireAdminOrPromotoria, async (req, res) => {
  try {
    const { colegio_id, usuario_id, personal_id } = req.user;
    const {
      titulo,
      descripcion,
      audiencias = [],
      fecha_inicio,
      fecha_fin,
      mensaje_agradecimiento,
      categoria_metrica,
      estado = 'ACTIVO',
      preguntas = [],
      alcance_grupos,
      grupos = []
    } = req.body;

    if (!titulo || !String(titulo).trim()) {
      return res.status(400).json({ error: 'Título requerido' });
    }
    const audienciasLimpias = (audiencias || []).filter((t) => t && t !== 'PERSONAL');
    if (!Array.isArray(audienciasLimpias) || audienciasLimpias.length === 0) {
      return res.status(400).json({ error: 'Selecciona al menos una audiencia' });
    }
    if (!Array.isArray(preguntas) || preguntas.length === 0) {
      return res.status(400).json({ error: 'Agrega al menos una pregunta' });
    }

    const alcanceNorm = normalizarAlcanceGrupos(alcance_grupos, grupos);
    if (alcanceNorm.alcance === 'GRUPOS' && alcanceNorm.grupos.length === 0) {
      return res.status(400).json({ error: 'Selecciona al menos un grupo o elige cobertura Todos' });
    }

    const tipoLegacy = audienciasLimpias[0] || 'APODERADO';
    const msg = mensaje_agradecimiento || '¡Gracias por tu participación!';
    const desc = descripcion || null;
    const fi = fecha_inicio || null;
    const ff = fecha_fin || null;
    const cat = categoria_metrica || null;
    const pers = personal_id || null;
    const est = String(estado || 'ACTIVO').toUpperCase();
    if (est !== 'ACTIVO' && est !== 'INACTIVO') {
      return res.status(400).json({ error: 'Estado debe ser ACTIVO o INACTIVO' });
    }

    const ins = await execute(
      `INSERT INTO encuestas (colegio_id, personal_id, titulo, estado, tipo, descripcion, fecha_inicio, fecha_fin, mensaje_agradecimiento, categoria_metrica, modelo_encuesta, alcance_grupos)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 2, ?)`,
      [colegio_id, pers, String(titulo).trim(), est, tipoLegacy, desc, fi, ff, msg, cat, alcanceNorm.alcance]
    );
    const encuestaId = ins.insertId;

    for (const t of new Set(audienciasLimpias)) {
      await execute(`INSERT INTO encuestas_audiencias (encuesta_id, tipo) VALUES (?, ?)`, [encuestaId, t]);
    }

    await guardarGruposEncuesta(encuestaId, alcanceNorm.alcance, alcanceNorm.grupos);

    let orden = 1;
    for (const p of preguntas) {
      const ti = p.tipo_interfaz || 'texto_corto';
      const text = String(p.texto_pregunta || p.descripcion || '');
      if (ti !== 'titulo' && !htmlTieneContenido(text)) continue;
      const opc = p.opciones != null ? JSON.stringify(p.opciones) : null;
      const subt = p.subtitulo ? String(p.subtitulo) : null;
      const oblig = p.obligatoria !== false ? 1 : 0;
      const tr = ti === 'titulo' ? 'TITULO' : ti === 'marcar' || ti === 'lista' ? 'ALTERNATIVAS' : 'TEXTO';
      await execute(
        `INSERT INTO encuestas_preguntas (encuesta_id, descripcion, orden, tipo_respuesta, tipo_interfaz, opciones_json, obligatoria, subtitulo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [encuestaId, text || ' ', orden, tr, ti, opc, oblig, subt]
      );
      orden += 1;
    }

    res.json({ success: true, encuesta_id: encuestaId });

    if (est === 'ACTIVO') {
      setImmediate(() => {
        const tituloTrim = String(titulo).trim();
        Promise.all([cargarAudiencias(encuestaId), cargarGruposIds(encuestaId), getAnioActivo(colegio_id)])
          .then(([aud, gids, anio]) =>
            notificarEncuestaActivada({
              colegio_id,
              encuesta_id: encuestaId,
              titulo: tituloTrim,
              usuario_id_emisor: usuario_id,
              audiencias: aud,
              grupo_ids: gids,
              anio
            })
          )
          .then(() =>
            notificarAdminsEncuestaActivada({
              colegio_id,
              encuesta_id: encuestaId,
              titulo: tituloTrim,
              usuario_id_emisor: usuario_id
            })
          )
          .catch((err) => console.error('[encuestas] notif activación (create)', err));
      });
    }
  } catch (err) {
    console.error('[encuestas] admin create', err);
    res.status(500).json({ error: err.message || 'Error al crear encuesta' });
  }
});

router.put('/admin/:id', authenticateToken, requireAdminOrPromotoria, async (req, res) => {
  try {
    const { colegio_id, usuario_id: usuarioIdAdmin } = req.user;
    const id = parseInt(req.params.id, 10);
    const enc = await query(`SELECT * FROM encuestas WHERE id = ? AND colegio_id = ? LIMIT 1`, [id, colegio_id]);
    if (!enc || !enc.length) return res.status(404).json({ error: 'Encuesta no encontrada' });
    const cur = enc[0];
    const oldEstado = String(cur.estado || '').toUpperCase();

    const cnt = await query(`SELECT COUNT(*) AS c FROM encuestas_respuestas WHERE encuesta_id = ?`, [id]);
    const tiene = cnt && cnt[0] && Number(cnt[0].c) > 0;

    const {
      titulo,
      descripcion,
      audiencias,
      fecha_inicio,
      fecha_fin,
      mensaje_agradecimiento,
      categoria_metrica,
      estado,
      preguntas,
      alcance_grupos,
      grupos
    } = req.body;

    if (tiene && Array.isArray(preguntas) && preguntas.length > 0) {
      return res.status(409).json({
        error: 'Ya hay respuestas: no se pueden editar las preguntas. Solo metadatos.'
      });
    }

    const v = (x, fallback) => (x !== undefined ? x : fallback);
    let estadoFinal = v(estado, cur.estado) ?? 'ACTIVO';
    estadoFinal = String(estadoFinal).toUpperCase();
    if (estadoFinal !== 'ACTIVO' && estadoFinal !== 'INACTIVO') {
      return res.status(400).json({ error: 'Estado debe ser ACTIVO o INACTIVO' });
    }

    let alcanceNorm = null;
    if (!tiene && (alcance_grupos !== undefined || grupos !== undefined)) {
      alcanceNorm = normalizarAlcanceGrupos(
        alcance_grupos !== undefined ? alcance_grupos : cur.alcance_grupos,
        Array.isArray(grupos) ? grupos : []
      );
      if (alcanceNorm.alcance === 'GRUPOS' && alcanceNorm.grupos.length === 0) {
        return res.status(400).json({ error: 'Selecciona al menos un grupo o elige cobertura Todos' });
      }
    }

    await execute(
      `UPDATE encuestas SET titulo = ?, descripcion = ?, fecha_inicio = ?, fecha_fin = ?, mensaje_agradecimiento = ?, categoria_metrica = ?, estado = ?
       WHERE id = ? AND colegio_id = ?`,
      [
        titulo != null ? String(titulo).trim() : cur.titulo,
        v(descripcion, cur.descripcion) ?? null,
        v(fecha_inicio, cur.fecha_inicio) ?? null,
        v(fecha_fin, cur.fecha_fin) ?? null,
        v(mensaje_agradecimiento, cur.mensaje_agradecimiento) ?? null,
        v(categoria_metrica, cur.categoria_metrica) ?? null,
        estadoFinal,
        id,
        colegio_id
      ]
    );

    if (!tiene && Array.isArray(audiencias) && audiencias.length) {
      const audLimpias = audiencias.filter((t) => t && t !== 'PERSONAL');
      if (audLimpias.length) {
        await execute(`DELETE FROM encuestas_audiencias WHERE encuesta_id = ?`, [id]);
        for (const t of new Set(audLimpias)) {
          await execute(`INSERT INTO encuestas_audiencias (encuesta_id, tipo) VALUES (?, ?)`, [id, t]);
        }
        await execute(`UPDATE encuestas SET tipo = ? WHERE id = ?`, [audLimpias[0], id]);
      }
    }

    if (alcanceNorm) {
      await guardarGruposEncuesta(id, alcanceNorm.alcance, alcanceNorm.grupos);
    }

    if (!tiene && Array.isArray(preguntas)) {
      await execute(`DELETE FROM encuestas_preguntas WHERE encuesta_id = ?`, [id]);
      let orden = 1;
      for (const p of preguntas) {
        const ti = p.tipo_interfaz || 'texto_corto';
        const text = String(p.texto_pregunta || p.descripcion || '');
        if (ti !== 'titulo' && !htmlTieneContenido(text)) continue;
        const opc = p.opciones != null ? JSON.stringify(p.opciones) : null;
        const subt = p.subtitulo ? String(p.subtitulo) : null;
        const oblig = p.obligatoria !== false ? 1 : 0;
        const tr = ti === 'titulo' ? 'TITULO' : ti === 'marcar' || ti === 'lista' ? 'ALTERNATIVAS' : 'TEXTO';
        await execute(
          `INSERT INTO encuestas_preguntas (encuesta_id, descripcion, orden, tipo_respuesta, tipo_interfaz, opciones_json, obligatoria, subtitulo)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, text || ' ', orden, tr, ti, opc, oblig, subt]
        );
        orden += 1;
      }
    }

    const newEstado = estadoFinal;
    if (newEstado === 'ACTIVO' && oldEstado !== 'ACTIVO') {
      setImmediate(() => {
        const tituloN = titulo != null ? String(titulo).trim() : cur.titulo;
        Promise.all([cargarAudiencias(id), cargarGruposIds(id), getAnioActivo(colegio_id)])
          .then(([aud, gids, anio]) =>
            notificarEncuestaActivada({
              colegio_id,
              encuesta_id: id,
              titulo: tituloN,
              usuario_id_emisor: usuarioIdAdmin,
              audiencias: aud,
              grupo_ids: gids,
              anio
            })
          )
          .then(() =>
            notificarAdminsEncuestaActivada({
              colegio_id,
              encuesta_id: id,
              titulo: tituloN,
              usuario_id_emisor: usuarioIdAdmin
            })
          )
          .catch((err) => console.error('[encuestas] notif activación (update)', err));
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[encuestas] admin put', err);
    res.status(500).json({ error: err.message || 'Error al actualizar' });
  }
});

router.delete('/admin/:id', authenticateToken, requireAdminOrPromotoria, async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const enc = await query(`SELECT id FROM encuestas WHERE id = ? AND colegio_id = ? LIMIT 1`, [id, colegio_id]);
    if (!enc || !enc.length) return res.status(404).json({ error: 'No encontrada' });

    await execute(
      `DELETE d FROM encuestas_respuestas_detalle d
       INNER JOIN encuestas_respuestas r ON r.id = d.respuesta_id
       WHERE r.encuesta_id = ?`,
      [id]
    );
    await execute(`DELETE FROM encuestas_respuestas WHERE encuesta_id = ?`, [id]);
    await execute(`DELETE FROM encuestas_modal_visto WHERE encuesta_id = ?`, [id]);
    await execute(`DELETE FROM encuestas_audiencias WHERE encuesta_id = ?`, [id]);
    await execute(`DELETE FROM encuestas_grupos WHERE encuesta_id = ?`, [id]);
    await execute(`DELETE FROM encuestas_preguntas WHERE encuesta_id = ?`, [id]);
    const r = await execute(`DELETE FROM encuestas WHERE id = ? AND colegio_id = ?`, [id, colegio_id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'No encontrada' });
    res.json({ success: true });
  } catch (err) {
    console.error('[encuestas] admin delete', err);
    res.status(500).json({ error: err.message || 'Error al eliminar' });
  }
});

// ---------- Usuario autenticado ----------

router.get('/modal-pendiente', authenticateToken, async (req, res) => {
  try {
    const enc = await buscarEncuestaModalPendiente(req.user, req.user.colegio_id);
    res.json({ success: true, encuesta: enc });
  } catch (err) {
    console.error('[encuestas] modal-pendiente', err);
    res.json({ success: true, encuesta: null });
  }
});

router.post('/modal-visto/:encuestaId', authenticateToken, async (req, res) => {
  try {
    const eid = parseInt(req.params.encuestaId, 10);
    const { colegio_id, usuario_id } = req.user;
    if (!eid) return res.status(400).json({ error: 'ID inválido' });
    await execute(
      `INSERT IGNORE INTO encuestas_modal_visto (usuario_id, encuesta_id, colegio_id) VALUES (?, ?, ?)`,
      [usuario_id, eid, colegio_id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[encuestas] modal-visto', err);
    res.status(500).json({ error: 'No se pudo registrar' });
  }
});

router.get('/mis-disponibles', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    const { colegio_id } = user;
    const anio = await getAnioActivo(colegio_id);
    const rows = await query(
      `SELECT e.id, e.titulo, e.descripcion, e.fecha_inicio, e.fecha_fin, e.mensaje_agradecimiento, e.categoria_metrica, e.estado
       FROM encuestas e
       WHERE e.colegio_id = ? AND e.estado = 'ACTIVO'
       ORDER BY e.id DESC`,
      [colegio_id]
    );
    const out = [];
    for (const e of rows || []) {
      if (!encuestaVigente(e)) continue;
      const aud = await cargarAudiencias(e.id);
      if (!(await usuarioPuedeVerEncuesta(user, colegio_id, e.id, aud))) continue;
      const ya = await query(
        `SELECT id FROM encuestas_respuestas WHERE encuesta_id = ? AND usuario_id = ? LIMIT 1`,
        [e.id, user.usuario_id]
      );
      out.push({
        ...e,
        ya_respondio: !!(ya && ya.length),
        audiencias: aud.map((a) => a.tipo)
      });
    }
    res.json({ success: true, encuestas: out, anio_activo: anio });
  } catch (err) {
    console.error('[encuestas] mis-disponibles', err);
    res.status(500).json({ error: 'Error al listar encuestas' });
  }
});

router.get('/contestar/:id', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    const { colegio_id } = user;
    const id = parseInt(req.params.id, 10);
    const enc = await query(`SELECT * FROM encuestas WHERE id = ? AND colegio_id = ? LIMIT 1`, [id, colegio_id]);
    if (!enc || !enc.length) return res.status(404).json({ error: 'Encuesta no encontrada' });
    const e = enc[0];
    if (!encuestaVigente(e) || String(e.estado).toUpperCase() !== 'ACTIVO') {
      return res.status(400).json({ error: 'Encuesta no disponible' });
    }
    const aud = await cargarAudiencias(id);
    if (!(await usuarioPuedeVerEncuesta(user, colegio_id, id, aud))) {
      return res.status(403).json({ error: 'No está dirigida a tu perfil o grupo' });
    }
    const ya = await query(
      `SELECT id FROM encuestas_respuestas WHERE encuesta_id = ? AND usuario_id = ? LIMIT 1`,
      [id, user.usuario_id]
    );
    if (ya && ya.length) {
      return res.status(400).json({ error: 'Ya respondiste esta encuesta', ya_respondio: true });
    }
    const preg = await query(
      `SELECT * FROM encuestas_preguntas WHERE encuesta_id = ? ORDER BY orden ASC, id ASC`,
      [id]
    );
    const preguntas = (preg || []).map(normalizarPreguntaPublica);
    res.json({
      success: true,
      encuesta: {
        id: e.id,
        titulo: e.titulo,
        descripcion: e.descripcion,
        mensaje_agradecimiento: e.mensaje_agradecimiento
      },
      preguntas,
      usuario_contexto: {
        tipo: user.tipo,
        etiqueta: user.tipo
      }
    });
  } catch (err) {
    console.error('[encuestas] contestar get', err);
    res.status(500).json({ error: 'Error al cargar encuesta' });
  }
});

router.post('/contestar/:id', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    const { colegio_id, usuario_id, tipo, alumno_id } = user;
    const id = parseInt(req.params.id, 10);
    const { respuestas: bodyRespuestas } = req.body;

    const enc = await query(`SELECT * FROM encuestas WHERE id = ? AND colegio_id = ? LIMIT 1`, [id, colegio_id]);
    if (!enc || !enc.length) return res.status(404).json({ error: 'Encuesta no encontrada' });
    const e = enc[0];
    if (!encuestaVigente(e) || String(e.estado).toUpperCase() !== 'ACTIVO') {
      return res.status(400).json({ error: 'Encuesta no disponible' });
    }
    const aud = await cargarAudiencias(id);
    if (!(await usuarioPuedeVerEncuesta(user, colegio_id, id, aud))) {
      return res.status(403).json({ error: 'No está dirigida a tu perfil o grupo' });
    }

    const ya = await query(`SELECT id FROM encuestas_respuestas WHERE encuesta_id = ? AND usuario_id = ? LIMIT 1`, [
      id,
      usuario_id
    ]);
    if (ya && ya.length) {
      return res.status(400).json({ error: 'Ya respondiste esta encuesta' });
    }

    const preguntas = await query(
      `SELECT * FROM encuestas_preguntas WHERE encuesta_id = ? ORDER BY orden ASC, id ASC`,
      [id]
    );
    const byId = new Map((preguntas || []).map((p) => [p.id, p]));

    const anio = await getAnioActivo(colegio_id);
    const snap = await getSnapshotRespondiente(user, colegio_id, anio);

    const mapR = {};
    if (Array.isArray(bodyRespuestas)) {
      for (const r of bodyRespuestas) {
        if (r && r.pregunta_id != null) mapR[Number(r.pregunta_id)] = r;
      }
    }

    for (const p of preguntas || []) {
      const ti = p.tipo_interfaz || mapLegacyTipo(p.tipo_respuesta);
      if (ti === 'titulo') continue;
      const oblig = p.obligatoria !== 0 && p.obligatoria !== false;
      const rr = mapR[p.id];
      if (!oblig) continue;
      if (!rr) {
        return res.status(400).json({ error: `Falta respuesta obligatoria (pregunta ${p.orden})` });
      }
      const ok = validarRespuestaItem(ti, rr, p);
      if (!ok.valid) return res.status(400).json({ error: ok.mensaje || 'Respuesta inválida' });
    }

    const insR = await execute(
      `INSERT INTO encuestas_respuestas (encuesta_id, colegio_id, usuario_id, rol_respondiente, alumno_id, grado_snapshot, nivel_snapshot)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        colegio_id,
        usuario_id,
        tipo,
        snap.alumno_id || alumno_id || null,
        snap.grado_snapshot,
        snap.nivel_snapshot
      ]
    );
    const respuestaId = insR.insertId;

    for (const p of preguntas || []) {
      const ti = p.tipo_interfaz || mapLegacyTipo(p.tipo_respuesta);
      if (ti === 'titulo') continue;
      const rr = mapR[p.id];
      if (!rr && !(p.obligatoria !== 0 && p.obligatoria !== false)) continue;
      if (!rr) continue;

      let texto = null;
      let valorNum = null;
      let opcJson = null;
      if (ti === 'texto_corto' || ti === 'texto_largo') {
        texto = rr.texto != null ? String(rr.texto) : '';
      } else if (ti === 'escala') {
        valorNum = rr.valor_numerico != null ? parseInt(rr.valor_numerico, 10) : null;
      } else if (ti === 'marcar' || ti === 'lista') {
        opcJson = JSON.stringify(rr.opciones_seleccionadas != null ? rr.opciones_seleccionadas : []);
      }

      await execute(
        `INSERT INTO encuestas_respuestas_detalle (respuesta_id, pregunta_id, texto_respuesta, valor_numerico, opciones_json)
         VALUES (?, ?, ?, ?, ?)`,
        [respuestaId, p.id, texto, valorNum, opcJson]
      );
    }

    try {
      await execute(
        `INSERT IGNORE INTO encuestas_modal_visto (usuario_id, encuesta_id, colegio_id) VALUES (?, ?, ?)`,
        [usuario_id, id, colegio_id]
      );
    } catch (e) {
      /* tabla opcional hasta migración */
    }

    setImmediate(() => {
      obtenerNombreMostrarUsuario(usuario_id)
        .then((nombre) =>
          notificarAdminsEncuestaRespondida({
            colegio_id,
            encuesta_id: id,
            titulo: e.titulo,
            usuario_respondedor_id: usuario_id,
            nombre_respondedor: nombre
          })
        )
        .catch((err) => console.error('[encuestas] notif respondida admin', err));
    });

    res.json({ success: true, respuesta_id: respuestaId });
  } catch (err) {
    console.error('[encuestas] contestar post', err);
    res.status(500).json({ error: err.message || 'Error al guardar' });
  }
});

function validarRespuestaItem(ti, rr, p) {
  if (ti === 'texto_corto' || ti === 'texto_largo') {
    const t = rr.texto != null ? String(rr.texto).trim() : '';
    if (!t) return { valid: false, mensaje: 'Texto requerido' };
    const max = (parseOpciones(p) || {}).max_length || (ti === 'texto_corto' ? 200 : 2000);
    if (t.length > max) return { valid: false, mensaje: 'Texto demasiado largo' };
    return { valid: true };
  }
  if (ti === 'escala') {
    const n = rr.valor_numerico != null ? parseInt(rr.valor_numerico, 10) : NaN;
    const op = parseOpciones(p) || {};
    const min = Number.isFinite(Number(op.min)) ? Number(op.min) : 1;
    const max = Number.isFinite(Number(op.max)) ? Number(op.max) : 5;
    if (!Number.isFinite(n) || n < min || n > max) return { valid: false, mensaje: 'Valor de escala inválido' };
    return { valid: true };
  }
  if (ti === 'marcar' || ti === 'lista') {
    let arr = rr.opciones_seleccionadas;
    if (!Array.isArray(arr)) {
      if (arr == null || arr === '') arr = [];
      else arr = [arr];
    }
    const op = parseOpciones(p) || {};
    const opts = op.opciones || [];
    if (ti === 'lista' && arr.length !== 1) return { valid: false, mensaje: 'Selecciona una opción' };
    if (ti === 'marcar' && !(op.multiple === true || op.multiple === 1) && arr.length > 1) {
      return { valid: false, mensaje: 'Una sola opción' };
    }
    if (arr.length === 0) return { valid: false, mensaje: 'Selecciona al menos una opción' };
    for (const a of arr) {
      if (!opts.includes(a)) return { valid: false, mensaje: 'Opción no válida' };
    }
    return { valid: true };
  }
  return { valid: true };
}

module.exports = router;
