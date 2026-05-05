/**
 * Elecciones escolares (alcaldía): configuración por colegio, campaña/plancha y urna (voto único por usuario).
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { query, execute, getAnioActivo } = require('../utils/mysql');
const { authenticateToken, requireUserType } = require('../middleware/auth');

const STAFF_TYPES = new Set(['ADMINISTRADOR', 'SECRETARIA', 'PROMOTORIA']);

function requireStaff(req, res, next) {
  if (!req.user || !STAFF_TYPES.has(req.user.tipo)) {
    return res.status(403).json({ error: 'No autorizado' });
  }
  next();
}

const eleccionesDir = path.join(__dirname, '..', 'uploads', 'elecciones');
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(eleccionesDir, { recursive: true });
    cb(null, eleccionesDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safe = /\.(jpg|jpeg|png|gif|webp)$/i.test(ext) ? ext : '.jpg';
    cb(null, `el-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${safe}`);
  }
});

const imageFilter = (req, file, cb) => {
  const ok =
    file.mimetype &&
    (file.mimetype.startsWith('image/') || ['image/jpg', 'image/pjpeg'].includes(file.mimetype));
  if (!ok) return cb(new Error('Solo se permiten imágenes'));
  cb(null, true);
};

const uploadImg = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: imageFilter
});

function diskUrl(req, rel) {
  if (!rel) return null;
  const host = req.get('host');
  const proto = req.protocol || 'http';
  return `${proto}://${host}/uploads/${String(rel).replace(/^\/+/, '')}`;
}

function parseGrupoIds(raw) {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw.map((n) => parseInt(n, 10)).filter((n) => !Number.isNaN(n));
  if (typeof raw === 'string') {
    try {
      const j = JSON.parse(raw);
      return parseGrupoIds(j);
    } catch {
      return [];
    }
  }
  return [];
}

function jsonGrupoIdsForDb(arr) {
  if (!arr || !Array.isArray(arr) || arr.length === 0) return null;
  return JSON.stringify(arr.map((n) => parseInt(n, 10)).filter((n) => !Number.isNaN(n)));
}

async function getProcesoAdmin(colegioId, procesoId) {
  const rows = await query(
    `SELECT * FROM elecciones_proceso WHERE id = ? AND colegio_id = ? LIMIT 1`,
    [procesoId, colegioId]
  );
  return rows[0] || null;
}

function serializeProceso(row) {
  if (!row) return null;
  return {
    ...row,
    grupo_ids: parseGrupoIds(row.grupo_ids),
    perfiles_voto: parsePerfilesVoto(row),
    grados_voto: parseGradosVotoLista(row)
  };
}

function ahoraEnMs() {
  return Date.now();
}

function votacionAbiertaPorFechas(row) {
  if (!row.votacion_inicio && !row.votacion_fin) return true;
  const now = ahoraEnMs();
  if (row.votacion_inicio) {
    const t = new Date(row.votacion_inicio).getTime();
    if (now < t) return false;
  }
  if (row.votacion_fin) {
    const t = new Date(row.votacion_fin).getTime();
    if (now > t) return false;
  }
  return true;
}

/** Información para UI (cuenta regresiva hacia ventana de votación). */
function payloadCountdownUrna(procesoRow) {
  const now = Date.now();
  let ms_hasta_apertura = null;
  let ms_hasta_cierre = null;
  if (procesoRow.votacion_inicio) {
    const t = new Date(procesoRow.votacion_inicio).getTime();
    ms_hasta_apertura = now < t ? t - now : 0;
  }
  if (procesoRow.votacion_fin) {
    const t = new Date(procesoRow.votacion_fin).getTime();
    ms_hasta_cierre = now < t ? t - now : 0;
  }
  const ventanaAbierta = votacionAbiertaPorFechas(procesoRow);
  return {
    ventana_horaria_abierta: ventanaAbierta,
    ms_hasta_apertura: ms_hasta_apertura,
    ms_hasta_cierre: ms_hasta_cierre,
    votacion_iso_inicio: procesoRow.votacion_inicio ? new Date(procesoRow.votacion_inicio).toISOString() : null,
    votacion_iso_fin: procesoRow.votacion_fin ? new Date(procesoRow.votacion_fin).toISOString() : null
  };
}

async function matriculaContextoAlumno(alumnoId, colegioId, anio) {
  if (!alumnoId || !anio) return null;
  const rows = await query(
    `SELECT m.id AS matricula_id, m.grupo_id, g.grado, g.seccion, n.nombre AS nivel_nombre
     FROM matriculas m
     INNER JOIN grupos g ON g.id = m.grupo_id
     INNER JOIN niveles n ON n.id = g.nivel_id
     WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ? AND (m.estado = 0)
     LIMIT 1`,
    [alumnoId, colegioId, anio]
  );
  return rows[0] || null;
}

function fotoUrlAlumnoSistema(fotoNombre) {
  if (!fotoNombre || String(fotoNombre).trim() === '') return null;
  const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://nuevo.vanguardschools.edu.pe';
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    return `${phpSystemUrl}/Static/Image/Fotos/${fotoNombre}`;
  }
  return `http://localhost:5000/Static/Image/Fotos/${fotoNombre}`;
}

function parsePerfilesVoto(procesoRow) {
  const raw = procesoRow?.perfiles_voto;
  if (raw == null) return ['ALUMNO'];
  let arr;
  if (Array.isArray(raw)) arr = raw;
  else if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw);
    } catch {
      return ['ALUMNO'];
    }
  } else {
    return ['ALUMNO'];
  }
  const permitidos = new Set(['ALUMNO', 'APODERADO', 'DOCENTE']);
  const out = arr
    .map((x) => String(x || '').toUpperCase().trim())
    .filter((x) => permitidos.has(x));
  return out.length ? out : ['ALUMNO'];
}

function parseGradosVotoLista(procesoRow) {
  const raw = procesoRow?.grados_voto;
  if (raw == null) return null;
  let arr;
  if (Array.isArray(raw)) arr = raw;
  else if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw);
    } catch {
      return null;
    }
  } else {
    return null;
  }
  const nums = arr.map((n) => parseInt(n, 10)).filter((n) => !Number.isNaN(n));
  return nums.length ? nums : null;
}

function jsonPerfilesForDb(arr) {
  if (!arr || !Array.isArray(arr) || arr.length === 0) return JSON.stringify(['ALUMNO']);
  const permitidos = new Set(['ALUMNO', 'APODERADO', 'DOCENTE']);
  const out = [...new Set(arr.map((x) => String(x || '').toUpperCase()).filter((x) => permitidos.has(x)))];
  return JSON.stringify(out.length ? out : ['ALUMNO']);
}

function jsonGradosVotoForDb(arr) {
  if (!arr || !Array.isArray(arr) || arr.length === 0) return null;
  const nums = arr.map((n) => parseInt(n, 10)).filter((n) => !Number.isNaN(n));
  return nums.length ? JSON.stringify(nums) : null;
}

/** Convocatoria por grado y grupo (alumno o hijo de apoderado). */
function puedeParticiparProceso(procesoRow, ctx) {
  if (!ctx) {
    return { ok: false, codigo: 'SIN_MATRICULA', mensaje: 'No hay matrícula activa aplicable para este año lectivo.' };
  }
  const gNum = ctx.grado != null ? Number(ctx.grado) : null;
  const gradosEsp = parseGradosVotoLista(procesoRow);
  if (gradosEsp && gradosEsp.length > 0) {
    if (gNum == null || !gradosEsp.includes(gNum)) {
      return { ok: false, codigo: 'GRADO', mensaje: 'El grado no está autorizado para participar en este proceso.' };
    }
  } else {
    if (procesoRow.grado_min != null && gNum != null && gNum < Number(procesoRow.grado_min)) {
      return { ok: false, codigo: 'GRADO', mensaje: 'Tu grado no está convocado a esta elección.' };
    }
    if (procesoRow.grado_max != null && gNum != null && gNum > Number(procesoRow.grado_max)) {
      return { ok: false, codigo: 'GRADO', mensaje: 'Tu grado no está convocado a esta elección.' };
    }
  }
  const ids = parseGrupoIds(procesoRow.grupo_ids);
  if (ids && ids.length > 0) {
    const gid = Number(ctx.grupo_id);
    if (!ids.includes(gid)) {
      return { ok: false, codigo: 'GRUPO', mensaje: 'Tu aula no está convocada a esta elección.' };
    }
  }
  return { ok: true };
}

async function elegibilidadVotanteUsuario(req, procesoRow, colegioId, anio) {
  const tipo = String(req.user?.tipo || '').toUpperCase();
  const perfiles = parsePerfilesVoto(procesoRow);
  if (!tipo || !perfiles.includes(tipo)) {
    return {
      ok: false,
      codigo: 'PERFIL',
      mensaje: 'Tu perfil de usuario no está habilitado para este proceso electoral.',
      contextoMatricula: null
    };
  }
  if (tipo === 'ALUMNO') {
    const ctx = await matriculaContextoAlumno(req.user.alumno_id, colegioId, anio);
    const part = puedeParticiparProceso(procesoRow, ctx);
    return { ...part, contextoMatricula: ctx };
  }
  if (tipo === 'APODERADO') {
    const apId = req.user.apoderado_id;
    if (!apId || !anio) {
      return {
        ok: false,
        codigo: 'SIN_DATOS',
        mensaje: 'No se encontró información de apoderado.',
        contextoMatricula: null
      };
    }
    const hijosRows = await query(
      `SELECT m.grupo_id, g.grado, g.seccion
       FROM familias f
       INNER JOIN alumnos a ON a.id = f.alumno_id AND a.colegio_id = ?
       INNER JOIN matriculas m ON m.alumno_id = a.id AND m.colegio_id = a.colegio_id AND (m.estado = 0)
       INNER JOIN grupos g ON g.id = m.grupo_id AND g.anio = ?
       WHERE f.apoderado_id = ?`,
      [colegioId, anio, apId]
    );
    if (!hijosRows || hijosRows.length === 0) {
      return {
        ok: false,
        codigo: 'SIN_MATRICULA',
        mensaje: 'No hay hijos con matrícula activa este año.',
        contextoMatricula: null
      };
    }
    for (const h of hijosRows) {
      const part = puedeParticiparProceso(procesoRow, {
        grupo_id: h.grupo_id,
        grado: h.grado,
        seccion: h.seccion
      });
      if (part.ok) {
        return { ok: true, codigo: null, mensaje: null, contextoMatricula: h };
      }
    }
    return {
      ok: false,
      codigo: 'CONVOCATORIA',
      mensaje: 'Ninguno de tus hijos está en los grados o aulas convocados.',
      contextoMatricula: null
    };
  }
  if (tipo === 'DOCENTE') {
    return { ok: true, codigo: null, mensaje: null, contextoMatricula: null };
  }
  return {
    ok: false,
    codigo: 'PERFIL',
    mensaje: 'Perfil no disponible para votación.',
    contextoMatricula: null
  };
}

/** Nombre visible y foto: alumno enlazado o campos legacy + upload propio lista. Requires JOIN aliases cal_nom,cal_app,cal_apm,cal_foto */
function mapAlcaldeListaPublic(req, listaRow) {
  let nombreCompleto = '';
  if (listaRow.alcalde_alumno_id && listaRow.cal_nom) {
    nombreCompleto = [listaRow.cal_nom, listaRow.cal_app, listaRow.cal_apm].filter(Boolean).join(' ').trim();
  }
  if (!nombreCompleto) {
    nombreCompleto = [listaRow.alcalde_nombres, listaRow.alcalde_apellidos].filter(Boolean).join(' ').trim();
  }
  let fotoUrl = null;
  if (listaRow.alcalde_alumno_id && listaRow.cal_foto) {
    fotoUrl = fotoUrlAlumnoSistema(listaRow.cal_foto);
  }
  if (!fotoUrl) fotoUrl = diskUrl(req, listaRow.alcalde_foto_path);
  return {
    nombres: listaRow.cal_nom || listaRow.alcalde_nombres,
    apellidos:
      listaRow.cal_nom
        ? [listaRow.cal_app, listaRow.cal_apm].filter(Boolean).join(' ').trim()
        : listaRow.alcalde_apellidos,
    nombre_completo: nombreCompleto || listaRow.nombre_lista,
    foto_url: fotoUrl,
    alumno_id: listaRow.alcalde_alumno_id || null
  };
}

/** JOIN alumno opcional en query: aliases alu_nom,alu_app,alu_apm,alu_foto */
function mapMiembroPublic(req, row) {
  const desdeAlumno =
    row.alumno_id && row.alu_nom
      ? [row.alu_nom, row.alu_app, row.alu_apm].filter(Boolean).join(' ').trim()
      : null;
  const nombreCompleto = desdeAlumno || [row.nombres, row.apellidos].filter(Boolean).join(' ').trim();
  let fotoUrl = diskUrl(req, row.foto_path);
  if ((!fotoUrl || String(fotoUrl).trim() === '') && row.alu_foto) {
    fotoUrl = fotoUrlAlumnoSistema(row.alu_foto);
  }
  return {
    cargo: row.cargo_nombre,
    nombres: row.alu_nom || row.nombres,
    apellidos: row.alumno_id && row.alu_nom ? [row.alu_app, row.alu_apm].filter(Boolean).join(' ').trim() : row.apellidos,
    nombre_completo: nombreCompleto,
    foto_url: fotoUrl,
    alumno_id: row.alumno_id || null
  };
}

function procesoVisibleAlumno(estado) {
  return estado === 'CAMPAÑA' || estado === 'VOTACION' || estado === 'CERRADA';
}

/** Grupos del año (admin/promotoría/secretaría) para convocatoria por aula — sin depender de permisos de catálogo académico. */
router.get('/admin/meta-grupos', authenticateToken, requireStaff, async (req, res) => {
  try {
    const colegioId = req.user.colegio_id;
    let anio = req.query.anio != null ? parseInt(req.query.anio, 10) : null;
    if (!Number.isFinite(anio)) {
      anio = await getAnioActivo(colegioId);
    }
    if (!anio) {
      return res.status(400).json({ error: 'No se pudo determinar el año lectivo' });
    }
    const rows = await query(
      `SELECT g.id, g.grado, g.seccion, g.anio, n.nombre AS nivel_nombre
       FROM grupos g
       INNER JOIN niveles n ON n.id = g.nivel_id
       WHERE g.colegio_id = ? AND g.anio = ?
       ORDER BY n.id ASC, g.grado ASC, g.seccion ASC`,
      [colegioId, anio]
    );
    res.json({ anio, grupos: rows || [] });
  } catch (e) {
    console.error('[elecciones] meta-grupos:', e);
    res.status(500).json({ error: 'No se pudieron cargar los grupos' });
  }
});

/** Búsqueda de alumnos por DNI (usuario) o por nombre/apellidos — para alcaldesa y plancha */
router.get('/admin/meta-alumnos', authenticateToken, requireStaff, async (req, res) => {
  try {
    const colegioId = req.user.colegio_id;
    const q = String(req.query.q || '').trim();
    const anio =
      req.query.anio != null && String(req.query.anio).trim() !== ''
        ? parseInt(req.query.anio, 10)
        : await getAnioActivo(colegioId);
    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Escribe al menos 2 caracteres (DNI o nombre)' });
    }
    const limit = Math.min(parseInt(req.query.limit, 10) || 24, 50);
    const like = `%${q}%`;
    const soloDigitos = /^\d+$/.test(q.replace(/\s/g, ''));
    const needle = soloDigitos ? q.replace(/\s/g, '') : q;

    let sql;
    let params;
    if (soloDigitos) {
      sql = `SELECT DISTINCT a.id, a.nombres, a.apellido_paterno, a.apellido_materno, a.nro_documento AS dni,
                g.grado, g.seccion, n.nombre AS nivel_nombre
         FROM alumnos a
         LEFT JOIN matriculas m ON m.alumno_id = a.id AND m.colegio_id = a.colegio_id AND (m.estado = 0)
         LEFT JOIN grupos g ON g.id = m.grupo_id AND g.anio = ?
         LEFT JOIN niveles n ON n.id = g.nivel_id
         WHERE a.colegio_id = ? AND a.nro_documento LIKE ?
         ORDER BY a.apellido_paterno ASC, a.apellido_materno ASC
         LIMIT ?`;
      params = [Number.isFinite(anio) ? anio : 2026, colegioId, `%${needle}%`, limit];
    } else {
      sql = `SELECT DISTINCT a.id, a.nombres, a.apellido_paterno, a.apellido_materno, a.nro_documento AS dni,
                g.grado, g.seccion, n.nombre AS nivel_nombre
         FROM alumnos a
         LEFT JOIN matriculas m ON m.alumno_id = a.id AND m.colegio_id = a.colegio_id AND (m.estado = 0)
         LEFT JOIN grupos g ON g.id = m.grupo_id AND g.anio = ?
         LEFT JOIN niveles n ON n.id = g.nivel_id
         WHERE a.colegio_id = ? AND (
           CONCAT(a.nombres,' ',a.apellido_paterno,' ',a.apellido_materno) LIKE ?
           OR a.apellido_paterno LIKE ? OR a.apellido_materno LIKE ? OR a.nombres LIKE ?
         )
         ORDER BY a.apellido_paterno ASC, a.apellido_materno ASC
         LIMIT ?`;
      params = [Number.isFinite(anio) ? anio : 2026, colegioId, like, like, like, like, limit];
    }
    const rows = await query(sql, params);
    res.json({
      alumnos: (rows || []).map((r) => ({
        id: r.id,
        dni: r.dni,
        nombres: r.nombres,
        apellido_paterno: r.apellido_paterno,
        apellido_materno: r.apellido_materno,
        nombre_completo:
          `${r.apellido_paterno || ''} ${r.apellido_materno || ''} ${r.nombres || ''}`.trim().replace(/\s+/g, ' '),
        etiqueta_grupo:
          [r.grado != null ? `${r.grado}°` : null, r.seccion, r.nivel_nombre].filter(Boolean).join(' · ') || null,
        foto_url: null
      }))
    });
  } catch (e) {
    console.error('[elecciones] meta-alumnos:', e);
    res.status(500).json({ error: 'No se pudieron buscar alumnos' });
  }
});

// --- Admin: procesos ---
router.get('/admin/procesos', authenticateToken, requireStaff, async (req, res) => {
  try {
    const colegioId = req.user.colegio_id;
    const rows = await query(
      `SELECT id, titulo, descripcion, estado, modalidad, grado_min, grado_max, grupo_ids, perfiles_voto, grados_voto,
              votacion_inicio, votacion_fin, created_at, updated_at
       FROM elecciones_proceso
       WHERE colegio_id = ?
       ORDER BY id DESC`,
      [colegioId]
    );
    res.json({
      procesos: rows.map(serializeProceso)
    });
  } catch (e) {
    console.error('[elecciones] admin list:', e);
    res.status(500).json({ error: 'No se pudieron cargar los procesos' });
  }
});

router.post('/admin/procesos', authenticateToken, requireStaff, async (req, res) => {
  try {
    const colegioId = req.user.colegio_id;
    const {
      titulo,
      descripcion,
      estado,
      modalidad,
      grado_min,
      grado_max,
      grupo_ids,
      votacion_inicio,
      votacion_fin,
      perfiles_voto,
      grados_voto
    } = req.body || {};
    if (!titulo || String(titulo).trim().length === 0) {
      return res.status(400).json({ error: 'El título es obligatorio' });
    }
    const st = estado && ['BORRADOR', 'CAMPAÑA', 'VOTACION', 'CERRADA'].includes(estado) ? estado : 'BORRADOR';
    const md = modalidad && ['VIRTUAL', 'PRESENCIAL', 'MIXTO'].includes(modalidad) ? modalidad : 'VIRTUAL';
    const gmin = grado_min === '' || grado_min == null ? null : parseInt(grado_min, 10);
    const gmax = grado_max === '' || grado_max == null ? null : parseInt(grado_max, 10);
    const gj = jsonGrupoIdsForDb(grupo_ids);
    const pj = jsonPerfilesForDb(perfiles_voto);
    const gvj = jsonGradosVotoForDb(grados_voto);
    const r = await execute(
      `INSERT INTO elecciones_proceso
        (colegio_id, titulo, descripcion, estado, modalidad, grado_min, grado_max, grupo_ids, perfiles_voto, grados_voto, votacion_inicio, votacion_fin)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        colegioId,
        String(titulo).trim(),
        descripcion ? String(descripcion).trim() : null,
        st,
        md,
        Number.isNaN(gmin) ? null : gmin,
        Number.isNaN(gmax) ? null : gmax,
        gj,
        pj,
        gvj,
        votacion_inicio || null,
        votacion_fin || null
      ]
    );
    const id = r.insertId;
    res.status(201).json({ id, message: 'Proceso creado' });
  } catch (e) {
    console.error('[elecciones] create proceso:', e);
    res.status(500).json({ error: 'No se pudo crear el proceso' });
  }
});

router.get('/admin/procesos/:id', authenticateToken, requireStaff, async (req, res) => {
  try {
    const row = await getProcesoAdmin(req.user.colegio_id, req.params.id);
    if (!row) return res.status(404).json({ error: 'Proceso no encontrado' });
    res.json({ proceso: serializeProceso(row) });
  } catch (e) {
    console.error('[elecciones] get proceso:', e);
    res.status(500).json({ error: 'Error al cargar' });
  }
});

router.put('/admin/procesos/:id', authenticateToken, requireStaff, async (req, res) => {
  try {
    const procesoId = parseInt(req.params.id, 10);
    const row = await getProcesoAdmin(req.user.colegio_id, procesoId);
    if (!row) return res.status(404).json({ error: 'Proceso no encontrado' });

    const {
      titulo,
      descripcion,
      estado,
      modalidad,
      grado_min,
      grado_max,
      grupo_ids,
      votacion_inicio,
      votacion_fin,
      perfiles_voto,
      grados_voto
    } = req.body || {};

    const st = estado && ['BORRADOR', 'CAMPAÑA', 'VOTACION', 'CERRADA'].includes(estado) ? estado : row.estado;
    const md = modalidad && ['VIRTUAL', 'PRESENCIAL', 'MIXTO'].includes(modalidad) ? modalidad : row.modalidad;
    const gmin = grado_min === '' || grado_min == null ? null : parseInt(grado_min, 10);
    const gmax = grado_max === '' || grado_max == null ? null : parseInt(grado_max, 10);
    const gj = grupo_ids !== undefined ? jsonGrupoIdsForDb(grupo_ids) : row.grupo_ids;
    let pjFinal = row.perfiles_voto;
    if (perfiles_voto !== undefined) pjFinal = jsonPerfilesForDb(perfiles_voto);
    let gvFinal = row.grados_voto;
    if (grados_voto !== undefined) gvFinal = jsonGradosVotoForDb(grados_voto);

    await execute(
      `UPDATE elecciones_proceso SET
        titulo = COALESCE(?, titulo),
        descripcion = ?,
        estado = ?,
        modalidad = ?,
        grado_min = ?,
        grado_max = ?,
        grupo_ids = ?,
        perfiles_voto = ?,
        grados_voto = ?,
        votacion_inicio = ?,
        votacion_fin = ?
       WHERE id = ? AND colegio_id = ?`,
      [
        titulo != null ? String(titulo).trim() : row.titulo,
        descripcion !== undefined ? (descripcion ? String(descripcion).trim() : null) : row.descripcion,
        st,
        md,
        Number.isNaN(gmin) ? null : gmin,
        Number.isNaN(gmax) ? null : gmax,
        gj !== undefined ? gj : row.grupo_ids,
        pjFinal,
        gvFinal,
        votacion_inicio !== undefined ? votacion_inicio || null : row.votacion_inicio,
        votacion_fin !== undefined ? votacion_fin || null : row.votacion_fin,
        procesoId,
        req.user.colegio_id
      ]
    );
    res.json({ message: 'Guardado' });
  } catch (e) {
    console.error('[elecciones] put proceso:', e);
    res.status(500).json({ error: 'No se pudo guardar' });
  }
});

router.delete('/admin/procesos/:id', authenticateToken, requireStaff, async (req, res) => {
  try {
    const procesoId = parseInt(req.params.id, 10);
    const r = await execute(`DELETE FROM elecciones_proceso WHERE id = ? AND colegio_id = ?`, [
      procesoId,
      req.user.colegio_id
    ]);
    if (!r.affectedRows) return res.status(404).json({ error: 'No encontrado' });
    res.json({ message: 'Eliminado' });
  } catch (e) {
    console.error('[elecciones] delete proceso:', e);
    res.status(500).json({ error: 'No se pudo eliminar (¿hay votos registrados?).' });
  }
});

router.get('/admin/procesos/:id/resultados', authenticateToken, requireStaff, async (req, res) => {
  try {
    const procesoId = parseInt(req.params.id, 10);
    const row = await getProcesoAdmin(req.user.colegio_id, procesoId);
    if (!row) return res.status(404).json({ error: 'Proceso no encontrado' });

    const totales = await query(
      `SELECT l.id AS lista_id, l.nombre_lista, COUNT(v.id) AS votos
       FROM elecciones_lista l
       LEFT JOIN elecciones_voto v ON v.lista_id = l.id AND v.proceso_id = l.proceso_id
       WHERE l.proceso_id = ? AND l.estado = 'PUBLICADA'
       GROUP BY l.id, l.nombre_lista
       ORDER BY votos DESC, l.orden_sort ASC, l.id ASC`,
      [procesoId]
    );
    const participacion = await query(
      `SELECT COUNT(*) AS total FROM elecciones_voto WHERE proceso_id = ?`,
      [procesoId]
    );
    res.json({
      totales,
      votos_registrados: participacion[0]?.total || 0
    });
  } catch (e) {
    console.error('[elecciones] resultados:', e);
    res.status(500).json({ error: 'No se pudieron cargar resultados' });
  }
});

// --- Admin: cargos ---
router.get('/admin/procesos/:id/cargos', authenticateToken, requireStaff, async (req, res) => {
  try {
    const procesoId = parseInt(req.params.id, 10);
    const row = await getProcesoAdmin(req.user.colegio_id, procesoId);
    if (!row) return res.status(404).json({ error: 'Proceso no encontrado' });
    const cargos = await query(
      `SELECT id, proceso_id, nombre, orden_sort FROM elecciones_cargo WHERE proceso_id = ? ORDER BY orden_sort ASC, id ASC`,
      [procesoId]
    );
    res.json({ cargos });
  } catch (e) {
    console.error('[elecciones] cargos list:', e);
    res.status(500).json({ error: 'Error al cargar cargos' });
  }
});

router.post('/admin/procesos/:id/cargos', authenticateToken, requireStaff, async (req, res) => {
  try {
    const procesoId = parseInt(req.params.id, 10);
    const row = await getProcesoAdmin(req.user.colegio_id, procesoId);
    if (!row) return res.status(404).json({ error: 'Proceso no encontrado' });
    const { nombre, orden_sort } = req.body || {};
    if (!nombre || String(nombre).trim().length === 0) {
      return res.status(400).json({ error: 'Nombre del cargo requerido' });
    }
    const ord =
      orden_sort != null && !Number.isNaN(parseInt(orden_sort, 10))
        ? parseInt(orden_sort, 10)
        : (await query(
            `SELECT COALESCE(MAX(orden_sort),0)+1 AS n FROM elecciones_cargo WHERE proceso_id = ?`,
            [procesoId]
          ))[0]?.n || 1;
    const r = await execute(
      `INSERT INTO elecciones_cargo (proceso_id, nombre, orden_sort) VALUES (?,?,?)`,
      [procesoId, String(nombre).trim(), ord]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe un cargo con ese nombre en este proceso.' });
    }
    console.error('[elecciones] cargo create:', e);
    res.status(500).json({ error: 'No se pudo crear el cargo' });
  }
});

router.delete('/admin/cargos/:cargoId', authenticateToken, requireStaff, async (req, res) => {
  try {
    const cargoId = parseInt(req.params.cargoId, 10);
    const rows = await query(
      `SELECT c.id FROM elecciones_cargo c
       INNER JOIN elecciones_proceso p ON p.id = c.proceso_id
       WHERE c.id = ? AND p.colegio_id = ? LIMIT 1`,
      [cargoId, req.user.colegio_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Cargo no encontrado' });
    try {
      await execute(`DELETE FROM elecciones_cargo WHERE id = ?`, [cargoId]);
    } catch (delErr) {
      if (delErr.code === 'ER_ROW_IS_REFERENCED_2' || delErr.errno === 1451) {
        return res.status(400).json({ error: 'No se puede borrar: hay miembros de plancha usando este cargo.' });
      }
      throw delErr;
    }
    res.json({ message: 'Cargo eliminado' });
  } catch (e) {
    console.error('[elecciones] cargo delete:', e);
    res.status(500).json({ error: 'Error al eliminar' });
  }
});

// --- Admin: listas ---
router.get('/admin/procesos/:id/listas', authenticateToken, requireStaff, async (req, res) => {
  try {
    const procesoId = parseInt(req.params.id, 10);
    const row = await getProcesoAdmin(req.user.colegio_id, procesoId);
    if (!row) return res.status(404).json({ error: 'Proceso no encontrado' });
    const cid = req.user.colegio_id;
    const listas = await query(
      `SELECT l.*,
        aa.nombres AS cal_nom, aa.apellido_paterno AS cal_app, aa.apellido_materno AS cal_apm, aa.foto AS cal_foto
       FROM elecciones_lista l
       INNER JOIN elecciones_proceso p ON p.id = l.proceso_id AND p.colegio_id = ?
       LEFT JOIN alumnos aa ON aa.id = l.alcalde_alumno_id AND aa.colegio_id = ?
       WHERE l.proceso_id = ?
       ORDER BY l.orden_sort ASC, l.id ASC`,
      [cid, cid, procesoId]
    );
    res.json({
      listas: listas.map((L) => {
        const al = mapAlcaldeListaPublic(req, L);
        return {
          ...L,
          logo_url: diskUrl(req, L.logo_path),
          alcalde_foto_url: al.foto_url,
          alcalde_nombre_mostrar: al.nombre_completo
        };
      })
    });
  } catch (e) {
    console.error('[elecciones] listas:', e);
    res.status(500).json({ error: 'Error al cargar listas' });
  }
});

router.post('/admin/procesos/:id/listas', authenticateToken, requireStaff, async (req, res) => {
  try {
    const procesoId = parseInt(req.params.id, 10);
    const row = await getProcesoAdmin(req.user.colegio_id, procesoId);
    if (!row) return res.status(404).json({ error: 'Proceso no encontrado' });
    const {
      nombre_lista,
      eslogan,
      color_primario,
      color_secundario,
      alcalde_nombres,
      alcalde_apellidos,
      alcalde_alumno_id,
      estado,
      orden_sort
    } = req.body || {};
    if (!nombre_lista || String(nombre_lista).trim().length === 0) {
      return res.status(400).json({ error: 'Nombre de la lista es obligatorio' });
    }
    const est = estado === 'PUBLICADA' ? 'PUBLICADA' : 'BORRADOR';
    const ord =
      orden_sort != null && !Number.isNaN(parseInt(orden_sort, 10))
        ? parseInt(orden_sort, 10)
        : (await query(
            `SELECT COALESCE(MAX(orden_sort),0)+1 AS n FROM elecciones_lista WHERE proceso_id = ?`,
            [procesoId]
          ))[0]?.n || 1;
    let alcaldeAlu = alcalde_alumno_id != null && String(alcalde_alumno_id).trim() !== '' ? parseInt(alcalde_alumno_id, 10) : null;
    if (Number.isNaN(alcaldeAlu)) alcaldeAlu = null;
    if (alcaldeAlu) {
      const ex = await query(
        `SELECT id FROM alumnos WHERE id = ? AND colegio_id = ? LIMIT 1`,
        [alcaldeAlu, req.user.colegio_id]
      );
      if (!ex.length) alcaldeAlu = null;
    }
    const r = await execute(
      `INSERT INTO elecciones_lista
        (proceso_id, nombre_lista, eslogan, color_primario, color_secundario, alcalde_alumno_id, alcalde_nombres, alcalde_apellidos, estado, orden_sort)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        procesoId,
        String(nombre_lista).trim(),
        eslogan ? String(eslogan).trim() : null,
        (color_primario && String(color_primario).trim()) || '#4f46e5',
        (color_secundario && String(color_secundario).trim()) || '#0ea5e9',
        alcaldeAlu,
        alcalde_nombres != null ? String(alcalde_nombres).trim() : '',
        alcalde_apellidos != null ? String(alcalde_apellidos).trim() : '',
        est,
        ord
      ]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    console.error('[elecciones] lista create:', e);
    res.status(500).json({ error: 'No se pudo crear la lista' });
  }
});

router.put('/admin/listas/:listaId', authenticateToken, requireStaff, async (req, res) => {
  try {
    const listaId = parseInt(req.params.listaId, 10);
    const rows = await query(
      `SELECT l.* FROM elecciones_lista l
       INNER JOIN elecciones_proceso p ON p.id = l.proceso_id
       WHERE l.id = ? AND p.colegio_id = ? LIMIT 1`,
      [listaId, req.user.colegio_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Lista no encontrada' });
    const L = rows[0];
    const b = req.body || {};
    let nuevaAlcaldeAlu = L.alcalde_alumno_id;
    if (b.alcalde_alumno_id !== undefined) {
      const raw = String(b.alcalde_alumno_id ?? '').trim();
      nuevaAlcaldeAlu = raw === '' || raw === '0' ? null : parseInt(raw, 10);
      if (!Number.isFinite(nuevaAlcaldeAlu) || nuevaAlcaldeAlu <= 0) nuevaAlcaldeAlu = null;
    }
    if (nuevaAlcaldeAlu) {
      const ex = await query(
        `SELECT id FROM alumnos WHERE id = ? AND colegio_id = ? LIMIT 1`,
        [nuevaAlcaldeAlu, req.user.colegio_id]
      );
      if (!ex.length) return res.status(400).json({ error: 'Alumno-alcalde no válido para este colegio' });
    }

    await execute(
      `UPDATE elecciones_lista SET
        nombre_lista = COALESCE(?, nombre_lista),
        eslogan = ?,
        color_primario = COALESCE(?, color_primario),
        color_secundario = COALESCE(?, color_secundario),
        alcalde_alumno_id = ?,
        alcalde_nombres = COALESCE(?, alcalde_nombres),
        alcalde_apellidos = COALESCE(?, alcalde_apellidos),
        estado = COALESCE(?, estado),
        orden_sort = COALESCE(?, orden_sort)
       WHERE id = ?`,
      [
        b.nombre_lista != null ? String(b.nombre_lista).trim() : L.nombre_lista,
        b.eslogan !== undefined ? (b.eslogan ? String(b.eslogan).trim() : null) : L.eslogan,
        b.color_primario != null ? String(b.color_primario).trim() : L.color_primario,
        b.color_secundario != null ? String(b.color_secundario).trim() : L.color_secundario,
        nuevaAlcaldeAlu,
        b.alcalde_nombres != null ? String(b.alcalde_nombres).trim() : L.alcalde_nombres,
        b.alcalde_apellidos != null ? String(b.alcalde_apellidos).trim() : L.alcalde_apellidos,
        b.estado && ['BORRADOR', 'PUBLICADA'].includes(b.estado) ? b.estado : L.estado,
        b.orden_sort != null && !Number.isNaN(parseInt(b.orden_sort, 10))
          ? parseInt(b.orden_sort, 10)
          : L.orden_sort,
        listaId
      ]
    );
    res.json({ message: 'Lista actualizada' });
  } catch (e) {
    console.error('[elecciones] lista put:', e);
    res.status(500).json({ error: 'No se pudo guardar' });
  }
});

router.delete('/admin/listas/:listaId', authenticateToken, requireStaff, async (req, res) => {
  try {
    const listaId = parseInt(req.params.listaId, 10);
    const rows = await query(
      `SELECT l.id FROM elecciones_lista l
       INNER JOIN elecciones_proceso p ON p.id = l.proceso_id
       WHERE l.id = ? AND p.colegio_id = ? LIMIT 1`,
      [listaId, req.user.colegio_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Lista no encontrada' });
    await execute(`DELETE FROM elecciones_lista WHERE id = ?`, [listaId]);
    res.json({ message: 'Lista eliminada' });
  } catch (e) {
    console.error('[elecciones] lista delete:', e);
    res.status(500).json({ error: 'No se pudo eliminar (¿hay votos?).' });
  }
});

router.post(
  '/admin/listas/:listaId/logo',
  authenticateToken,
  requireStaff,
  uploadImg.single('logo'),
  async (req, res) => {
    try {
      const listaId = parseInt(req.params.listaId, 10);
      const rows = await query(
        `SELECT l.id, l.logo_path FROM elecciones_lista l
         INNER JOIN elecciones_proceso p ON p.id = l.proceso_id
         WHERE l.id = ? AND p.colegio_id = ? LIMIT 1`,
        [listaId, req.user.colegio_id]
      );
      if (!rows.length) return res.status(404).json({ error: 'Lista no encontrada' });
      if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });
      const rel = `elecciones/${req.file.filename}`;
      if (rows[0].logo_path) {
        const oldPath = path.join(__dirname, '..', 'uploads', rows[0].logo_path);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      await execute(`UPDATE elecciones_lista SET logo_path = ? WHERE id = ?`, [rel, listaId]);
      res.json({ logo_path: rel, logo_url: diskUrl(req, rel) });
    } catch (e) {
      console.error('[elecciones] logo:', e);
      res.status(500).json({ error: 'Error al subir logo' });
    }
  }
);

router.post(
  '/admin/listas/:listaId/foto-alcalde',
  authenticateToken,
  requireStaff,
  uploadImg.single('foto'),
  async (req, res) => {
    try {
      const listaId = parseInt(req.params.listaId, 10);
      const rows = await query(
        `SELECT l.id, l.alcalde_foto_path FROM elecciones_lista l
         INNER JOIN elecciones_proceso p ON p.id = l.proceso_id
         WHERE l.id = ? AND p.colegio_id = ? LIMIT 1`,
        [listaId, req.user.colegio_id]
      );
      if (!rows.length) return res.status(404).json({ error: 'Lista no encontrada' });
      if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });
      const rel = `elecciones/${req.file.filename}`;
      if (rows[0].alcalde_foto_path) {
        const oldPath = path.join(__dirname, '..', 'uploads', rows[0].alcalde_foto_path);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      await execute(`UPDATE elecciones_lista SET alcalde_foto_path = ? WHERE id = ?`, [rel, listaId]);
      res.json({ alcalde_foto_path: rel, alcalde_foto_url: diskUrl(req, rel) });
    } catch (e) {
      console.error('[elecciones] foto alcalde:', e);
      res.status(500).json({ error: 'Error al subir foto' });
    }
  }
);

// --- Miembros (plancha sin alcalde; alcalde va en la lista) ---
router.get('/admin/listas/:listaId/miembros', authenticateToken, requireStaff, async (req, res) => {
  try {
    const listaId = parseInt(req.params.listaId, 10);
    const ok = await query(
      `SELECT l.id FROM elecciones_lista l
       INNER JOIN elecciones_proceso p ON p.id = l.proceso_id
       WHERE l.id = ? AND p.colegio_id = ? LIMIT 1`,
      [listaId, req.user.colegio_id]
    );
    if (!ok.length) return res.status(404).json({ error: 'Lista no encontrada' });
    const miembros = await query(
      `SELECT m.*, c.nombre AS cargo_nombre,
        ma.nombres AS alu_nom, ma.apellido_paterno AS alu_app, ma.apellido_materno AS alu_apm, ma.foto AS alu_foto
       FROM elecciones_miembro m
       INNER JOIN elecciones_cargo c ON c.id = m.cargo_id
       LEFT JOIN alumnos ma ON ma.id = m.alumno_id AND ma.colegio_id = ?
       WHERE m.lista_id = ?
       ORDER BY m.orden_sort ASC, m.id ASC`,
      [req.user.colegio_id, listaId]
    );
    res.json({ miembros });
  } catch (e) {
    console.error('[elecciones] miembros:', e);
    res.status(500).json({ error: 'Error al cargar miembros' });
  }
});

router.post('/admin/listas/:listaId/miembros', authenticateToken, requireStaff, async (req, res) => {
  try {
    const listaId = parseInt(req.params.listaId, 10);
    const rows = await query(
      `SELECT l.proceso_id FROM elecciones_lista l
       INNER JOIN elecciones_proceso p ON p.id = l.proceso_id
       WHERE l.id = ? AND p.colegio_id = ? LIMIT 1`,
      [listaId, req.user.colegio_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Lista no encontrada' });
    const { cargo_id, nombres, apellidos, orden_sort, alumno_id } = req.body || {};
    const cid = parseInt(cargo_id, 10);
    if (!cid) {
      return res.status(400).json({ error: 'cargo_id es obligatorio' });
    }
    let alumnoIdNorm =
      alumno_id != null && String(alumno_id).trim() !== '' ? parseInt(alumno_id, 10) : null;
    if (!Number.isFinite(alumnoIdNorm) || alumnoIdNorm <= 0) alumnoIdNorm = null;
    let nombresF = nombres != null ? String(nombres).trim() : '';
    let apellidosF = apellidos != null ? String(apellidos).trim() : '';
    if (alumnoIdNorm) {
      const al = await query(
        `SELECT nombres, apellido_paterno, apellido_materno FROM alumnos WHERE id = ? AND colegio_id = ? LIMIT 1`,
        [alumnoIdNorm, req.user.colegio_id]
      );
      if (!al.length) return res.status(400).json({ error: 'Alumno no válido' });
      nombresF = al[0].nombres || '';
      apellidosF = [al[0].apellido_paterno, al[0].apellido_materno].filter(Boolean).join(' ').trim();
    }
    if (!nombresF || !apellidosF) {
      return res.status(400).json({ error: 'Indica alumno enlazado o nombres y apellidos' });
    }
    const cargoOk = await query(
      `SELECT id FROM elecciones_cargo WHERE id = ? AND proceso_id = ? LIMIT 1`,
      [cid, rows[0].proceso_id]
    );
    if (!cargoOk.length) return res.status(400).json({ error: 'Cargo no válido para este proceso' });
    const ord =
      orden_sort != null && !Number.isNaN(parseInt(orden_sort, 10))
        ? parseInt(orden_sort, 10)
        : (await query(
            `SELECT COALESCE(MAX(orden_sort),0)+1 AS n FROM elecciones_miembro WHERE lista_id = ?`,
            [listaId]
          ))[0]?.n || 1;
    const r = await execute(
      `INSERT INTO elecciones_miembro (lista_id, cargo_id, alumno_id, nombres, apellidos, orden_sort) VALUES (?,?,?,?,?,?)`,
      [listaId, cid, alumnoIdNorm, nombresF, apellidosF, ord]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    console.error('[elecciones] miembro create:', e);
    res.status(500).json({ error: 'No se pudo agregar el miembro' });
  }
});

router.put('/admin/miembros/:miembroId', authenticateToken, requireStaff, async (req, res) => {
  try {
    const miembroId = parseInt(req.params.miembroId, 10);
    const rows = await query(
      `SELECT m.* FROM elecciones_miembro m
       INNER JOIN elecciones_lista l ON l.id = m.lista_id
       INNER JOIN elecciones_proceso p ON p.id = l.proceso_id
       WHERE m.id = ? AND p.colegio_id = ? LIMIT 1`,
      [miembroId, req.user.colegio_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Miembro no encontrado' });
    const M = rows[0];
    const b = req.body || {};
    let cargoId = M.cargo_id;
    if (b.cargo_id != null) {
      const cid = parseInt(b.cargo_id, 10);
      const cargoOk = await query(
        `SELECT c.id FROM elecciones_cargo c
         INNER JOIN elecciones_lista l ON l.proceso_id = c.proceso_id
         WHERE c.id = ? AND l.id = ? LIMIT 1`,
        [cid, M.lista_id]
      );
      if (!cargoOk.length) return res.status(400).json({ error: 'Cargo no válido' });
      cargoId = cid;
    }
    let finalAl = M.alumno_id;
    if (b.alumno_id !== undefined) {
      const raw = String(b.alumno_id ?? '').trim();
      finalAl = raw === '' ? null : parseInt(raw, 10);
      if (!Number.isFinite(finalAl) || finalAl <= 0) finalAl = null;
    }

    let nombresF = M.nombres;
    let apellidosF = M.apellidos;
    if (finalAl) {
      const al = await query(
        `SELECT nombres, apellido_paterno, apellido_materno FROM alumnos WHERE id = ? AND colegio_id = ? LIMIT 1`,
        [finalAl, req.user.colegio_id]
      );
      if (!al.length) return res.status(400).json({ error: 'Alumno no válido' });
      nombresF = al[0].nombres || '';
      apellidosF = [al[0].apellido_paterno, al[0].apellido_materno].filter(Boolean).join(' ').trim();
    } else {
      if (b.nombres != null) nombresF = String(b.nombres).trim();
      if (b.apellidos != null) apellidosF = String(b.apellidos).trim();
    }

    const ordVal =
      b.orden_sort != null && !Number.isNaN(parseInt(b.orden_sort, 10)) ? parseInt(b.orden_sort, 10) : M.orden_sort;

    await execute(
      `UPDATE elecciones_miembro SET cargo_id = ?, alumno_id = ?, nombres = ?, apellidos = ?, orden_sort = ? WHERE id = ?`,
      [cargoId, finalAl, nombresF, apellidosF, ordVal, miembroId]
    );
    res.json({ message: 'Miembro actualizado' });
  } catch (e) {
    console.error('[elecciones] miembro put:', e);
    res.status(500).json({ error: 'No se pudo guardar' });
  }
});

router.delete('/admin/miembros/:miembroId', authenticateToken, requireStaff, async (req, res) => {
  try {
    const miembroId = parseInt(req.params.miembroId, 10);
    const rows = await query(
      `SELECT m.id, m.foto_path FROM elecciones_miembro m
       INNER JOIN elecciones_lista l ON l.id = m.lista_id
       INNER JOIN elecciones_proceso p ON p.id = l.proceso_id
       WHERE m.id = ? AND p.colegio_id = ? LIMIT 1`,
      [miembroId, req.user.colegio_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    if (rows[0].foto_path) {
      const fp = path.join(__dirname, '..', 'uploads', rows[0].foto_path);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    await execute(`DELETE FROM elecciones_miembro WHERE id = ?`, [miembroId]);
    res.json({ message: 'Eliminado' });
  } catch (e) {
    console.error('[elecciones] miembro delete:', e);
    res.status(500).json({ error: 'Error al eliminar' });
  }
});

router.post(
  '/admin/miembros/:miembroId/foto',
  authenticateToken,
  requireStaff,
  uploadImg.single('foto'),
  async (req, res) => {
    try {
      const miembroId = parseInt(req.params.miembroId, 10);
      const rows = await query(
        `SELECT m.id, m.foto_path FROM elecciones_miembro m
         INNER JOIN elecciones_lista l ON l.id = m.lista_id
         INNER JOIN elecciones_proceso p ON p.id = l.proceso_id
         WHERE m.id = ? AND p.colegio_id = ? LIMIT 1`,
        [miembroId, req.user.colegio_id]
      );
      if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
      if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });
      const rel = `elecciones/${req.file.filename}`;
      if (rows[0].foto_path) {
        const oldPath = path.join(__dirname, '..', 'uploads', rows[0].foto_path);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      await execute(`UPDATE elecciones_miembro SET foto_path = ? WHERE id = ?`, [rel, miembroId]);
      res.json({ foto_path: rel, foto_url: diskUrl(req, rel) });
    } catch (e) {
      console.error('[elecciones] miembro foto:', e);
      res.status(500).json({ error: 'Error al subir foto' });
    }
  }
);

router.get('/admin/listas/:listaId/propuestas', authenticateToken, requireStaff, async (req, res) => {
  try {
    const listaId = parseInt(req.params.listaId, 10);
    const ok = await query(
      `SELECT l.id FROM elecciones_lista l
       INNER JOIN elecciones_proceso p ON p.id = l.proceso_id
       WHERE l.id = ? AND p.colegio_id = ? LIMIT 1`,
      [listaId, req.user.colegio_id]
    );
    if (!ok.length) return res.status(404).json({ error: 'Lista no encontrada' });
    const props = await query(
      `SELECT * FROM elecciones_propuesta WHERE lista_id = ? ORDER BY orden_sort ASC, id ASC`,
      [listaId]
    );
    res.json({ propuestas: props });
  } catch (e) {
    console.error('[elecciones] propuestas:', e);
    res.status(500).json({ error: 'Error' });
  }
});

router.post('/admin/listas/:listaId/propuestas', authenticateToken, requireStaff, async (req, res) => {
  try {
    const listaId = parseInt(req.params.listaId, 10);
    const ok = await query(
      `SELECT l.id FROM elecciones_lista l
       INNER JOIN elecciones_proceso p ON p.id = l.proceso_id
       WHERE l.id = ? AND p.colegio_id = ? LIMIT 1`,
      [listaId, req.user.colegio_id]
    );
    if (!ok.length) return res.status(404).json({ error: 'Lista no encontrada' });
    const { titulo, cuerpo, orden_sort } = req.body || {};
    if (!titulo || !cuerpo) return res.status(400).json({ error: 'Título y cuerpo requeridos' });
    const ord =
      orden_sort != null && !Number.isNaN(parseInt(orden_sort, 10))
        ? parseInt(orden_sort, 10)
        : (await query(
            `SELECT COALESCE(MAX(orden_sort),0)+1 AS n FROM elecciones_propuesta WHERE lista_id = ?`,
            [listaId]
          ))[0]?.n || 1;
    const r = await execute(
      `INSERT INTO elecciones_propuesta (lista_id, titulo, cuerpo, orden_sort) VALUES (?,?,?,?)`,
      [listaId, String(titulo).trim(), String(cuerpo).trim(), ord]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    console.error('[elecciones] propuesta create:', e);
    res.status(500).json({ error: 'No se pudo crear' });
  }
});

router.put('/admin/propuestas/:propId', authenticateToken, requireStaff, async (req, res) => {
  try {
    const propId = parseInt(req.params.propId, 10);
    const rows = await query(
      `SELECT pr.* FROM elecciones_propuesta pr
       INNER JOIN elecciones_lista l ON l.id = pr.lista_id
       INNER JOIN elecciones_proceso p ON p.id = l.proceso_id
       WHERE pr.id = ? AND p.colegio_id = ? LIMIT 1`,
      [propId, req.user.colegio_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'No encontrada' });
    const P = rows[0];
    const b = req.body || {};
    await execute(
      `UPDATE elecciones_propuesta SET
        titulo = COALESCE(?, titulo),
        cuerpo = COALESCE(?, cuerpo),
        orden_sort = COALESCE(?, orden_sort)
       WHERE id = ?`,
      [
        b.titulo != null ? String(b.titulo).trim() : P.titulo,
        b.cuerpo != null ? String(b.cuerpo).trim() : P.cuerpo,
        b.orden_sort != null ? parseInt(b.orden_sort, 10) : P.orden_sort,
        propId
      ]
    );
    res.json({ message: 'OK' });
  } catch (e) {
    console.error('[elecciones] propuesta put:', e);
    res.status(500).json({ error: 'Error al guardar' });
  }
});

router.delete('/admin/propuestas/:propId', authenticateToken, requireStaff, async (req, res) => {
  try {
    const propId = parseInt(req.params.propId, 10);
    const rows = await query(
      `SELECT pr.id FROM elecciones_propuesta pr
       INNER JOIN elecciones_lista l ON l.id = pr.lista_id
       INNER JOIN elecciones_proceso p ON p.id = l.proceso_id
       WHERE pr.id = ? AND p.colegio_id = ? LIMIT 1`,
      [propId, req.user.colegio_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'No encontrada' });
    await execute(`DELETE FROM elecciones_propuesta WHERE id = ?`, [propId]);
    res.json({ message: 'Eliminada' });
  } catch (e) {
    console.error('[elecciones] propuesta del:', e);
    res.status(500).json({ error: 'Error' });
  }
});

router.get('/admin/listas/:listaId/redes', authenticateToken, requireStaff, async (req, res) => {
  try {
    const listaId = parseInt(req.params.listaId, 10);
    const ok = await query(
      `SELECT l.id FROM elecciones_lista l
       INNER JOIN elecciones_proceso p ON p.id = l.proceso_id
       WHERE l.id = ? AND p.colegio_id = ? LIMIT 1`,
      [listaId, req.user.colegio_id]
    );
    if (!ok.length) return res.status(404).json({ error: 'Lista no encontrada' });
    const redes = await query(
      `SELECT * FROM elecciones_red_social WHERE lista_id = ? ORDER BY orden_sort ASC, id ASC`,
      [listaId]
    );
    res.json({ redes });
  } catch (e) {
    console.error('[elecciones] redes:', e);
    res.status(500).json({ error: 'Error' });
  }
});

router.post('/admin/listas/:listaId/redes', authenticateToken, requireStaff, async (req, res) => {
  try {
    const listaId = parseInt(req.params.listaId, 10);
    const ok = await query(
      `SELECT l.id FROM elecciones_lista l
       INNER JOIN elecciones_proceso p ON p.id = l.proceso_id
       WHERE l.id = ? AND p.colegio_id = ? LIMIT 1`,
      [listaId, req.user.colegio_id]
    );
    if (!ok.length) return res.status(404).json({ error: 'Lista no encontrada' });
    const { tipo, titulo, url, orden_sort } = req.body || {};
    if (!url) return res.status(400).json({ error: 'URL requerida' });
    const ord =
      orden_sort != null && !Number.isNaN(parseInt(orden_sort, 10))
        ? parseInt(orden_sort, 10)
        : (await query(
            `SELECT COALESCE(MAX(orden_sort),0)+1 AS n FROM elecciones_red_social WHERE lista_id = ?`,
            [listaId]
          ))[0]?.n || 1;
    const r = await execute(
      `INSERT INTO elecciones_red_social (lista_id, tipo, titulo, url, orden_sort) VALUES (?,?,?,?,?)`,
      [listaId, (tipo && String(tipo).trim()) || 'LINK', titulo ? String(titulo).trim() : null, String(url).trim(), ord]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    console.error('[elecciones] red create:', e);
    res.status(500).json({ error: 'No se pudo guardar' });
  }
});

router.delete('/admin/redes/:redId', authenticateToken, requireStaff, async (req, res) => {
  try {
    const redId = parseInt(req.params.redId, 10);
    const rows = await query(
      `SELECT r.id FROM elecciones_red_social r
       INNER JOIN elecciones_lista l ON l.id = r.lista_id
       INNER JOIN elecciones_proceso p ON p.id = l.proceso_id
       WHERE r.id = ? AND p.colegio_id = ? LIMIT 1`,
      [redId, req.user.colegio_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    await execute(`DELETE FROM elecciones_red_social WHERE id = ?`, [redId]);
    res.json({ message: 'Eliminado' });
  } catch (e) {
    console.error('[elecciones] red del:', e);
    res.status(500).json({ error: 'Error' });
  }
});

async function fetchListasPublicasMaps(req, colegioId, procesoId) {
  const listasRows = await query(
    `SELECT l.*,
      aa.nombres AS cal_nom, aa.apellido_paterno AS cal_app, aa.apellido_materno AS cal_apm, aa.foto AS cal_foto
     FROM elecciones_lista l
     INNER JOIN elecciones_proceso p ON p.id = l.proceso_id AND p.colegio_id = ?
     LEFT JOIN alumnos aa ON aa.id = l.alcalde_alumno_id AND aa.colegio_id = ?
     WHERE l.proceso_id = ? AND l.estado = 'PUBLICADA'
     ORDER BY l.orden_sort ASC, l.id ASC`,
    [colegioId, colegioId, procesoId]
  );
  return listasRows.map((L) => {
    const al = mapAlcaldeListaPublic(req, L);
    return {
      id: L.id,
      nombre_lista: L.nombre_lista,
      eslogan: L.eslogan,
      color_primario: L.color_primario,
      color_secundario: L.color_secundario,
      logo_url: diskUrl(req, L.logo_path),
      alcalde_nombre_completo: al.nombre_completo,
      alcalde_foto_url: al.foto_url,
      alcalde_alumno_id: L.alcalde_alumno_id || null
    };
  });
}

async function handlerEleccionesProcesosLista(req, res) {
  try {
    const colegioId = req.user.colegio_id;
    const rows = await query(
      `SELECT * FROM elecciones_proceso
       WHERE colegio_id = ? AND estado IN ('CAMPAÑA','VOTACION','CERRADA')
       ORDER BY id DESC`,
      [colegioId]
    );
    const anio = await getAnioActivo(colegioId);
    const out = [];
    for (const row of rows) {
      const eleg = await elegibilidadVotanteUsuario(req, row, colegioId, anio);
      const cd = payloadCountdownUrna(row);
      out.push({
        ...serializeProceso(row),
        /** Ver ficha del proceso y postulantes (cualquier usuario intranet autenticado). */
        puede_ver: true,
        /** Convocatoria para emitir voto (perfil + grados/aulas del proceso). */
        puede_participar: eleg.ok,
        motivo_bloqueo: eleg.ok ? null : eleg.mensaje,
        votacion_abierta: row.estado === 'VOTACION' && cd.ventana_horaria_abierta,
        puede_votar_ahora:
          eleg.ok &&
          row.estado === 'VOTACION' &&
          cd.ventana_horaria_abierta,
        countdown_urna: cd,
        ya_voto: false
      });
    }
    if (out.length) {
      const ids = out.map((o) => o.id);
      const ph = ids.map(() => '?').join(',');
      const votos = await query(
        `SELECT proceso_id FROM elecciones_voto WHERE usuario_id = ? AND proceso_id IN (${ph})`,
        [req.user.usuario_id, ...ids]
      );
      const setV = new Set(votos.map((v) => v.proceso_id));
      out.forEach((o) => {
        o.ya_voto = setV.has(o.id);
      });
    }
    res.json({ procesos: out, anio_activo: anio, perfil_usuario: req.user.tipo });
  } catch (e) {
    console.error('[elecciones] lista procesos votante:', e);
    res.status(500).json({ error: 'Error al cargar elecciones' });
  }
}

async function handlerEleccionesProcesoDetalle(req, res) {
  try {
    const procesoId = parseInt(req.params.id, 10);
    const colegioId = req.user.colegio_id;
    const rows = await query(`SELECT * FROM elecciones_proceso WHERE id = ? AND colegio_id = ? LIMIT 1`, [
      procesoId,
      colegioId
    ]);
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    const proceso = rows[0];
    if (!procesoVisibleAlumno(proceso.estado)) {
      return res.status(403).json({ error: 'Este proceso no está disponible' });
    }
    const anio = await getAnioActivo(colegioId);
    const eleg = await elegibilidadVotanteUsuario(req, proceso, colegioId, anio);
    const [votoRow] = await query(
      `SELECT lista_id FROM elecciones_voto WHERE proceso_id = ? AND usuario_id = ? LIMIT 1`,
      [procesoId, req.user.usuario_id]
    );
    const cd = payloadCountdownUrna(proceso);
    const listas = await fetchListasPublicasMaps(req, colegioId, procesoId);
    res.json({
      proceso: serializeProceso(proceso),
      puede_participar: eleg.ok,
      motivo_bloqueo: eleg.ok ? null : eleg.mensaje,
      votacion_abierta: proceso.estado === 'VOTACION' && cd.ventana_horaria_abierta,
      puede_votar_ahora:
        eleg.ok && proceso.estado === 'VOTACION' && cd.ventana_horaria_abierta,
      countdown_urna: cd,
      ya_voto: !!votoRow,
      lista_votada_id: votoRow ? votoRow.lista_id : null,
      listas
    });
  } catch (e) {
    console.error('[elecciones] proceso detalle votante:', e);
    res.status(500).json({ error: 'Error al cargar' });
  }
}

async function handlerEleccionesLanding(req, res) {
  try {
    const procesoId = parseInt(req.params.id, 10);
    const listaId = parseInt(req.params.listaId, 10);
    const colegioId = req.user.colegio_id;
    const [proceso] = await query(`SELECT * FROM elecciones_proceso WHERE id = ? AND colegio_id = ? LIMIT 1`, [
      procesoId,
      colegioId
    ]);
    if (!proceso) return res.status(404).json({ error: 'Proceso no encontrado' });
    if (!procesoVisibleAlumno(proceso.estado)) {
      return res.status(403).json({ error: 'No disponible' });
    }
    const listasRow = await query(
      `SELECT l.*,
        aa.nombres AS cal_nom, aa.apellido_paterno AS cal_app, aa.apellido_materno AS cal_apm, aa.foto AS cal_foto
       FROM elecciones_lista l
       INNER JOIN elecciones_proceso p ON p.id = l.proceso_id AND p.colegio_id = ?
       LEFT JOIN alumnos aa ON aa.id = l.alcalde_alumno_id AND aa.colegio_id = ?
       WHERE l.id = ? AND l.proceso_id = ? AND l.estado = 'PUBLICADA' LIMIT 1`,
      [colegioId, colegioId, listaId, procesoId]
    );
    if (!listasRow.length) return res.status(404).json({ error: 'Lista no encontrada' });
    const listaJoin = listasRow[0];
    const anio = await getAnioActivo(colegioId);
    const eleg = await elegibilidadVotanteUsuario(req, proceso, colegioId, anio);
    const miembrosRows = await query(
      `SELECT m.*, c.nombre AS cargo_nombre,
        ma.nombres AS alu_nom, ma.apellido_paterno AS alu_app, ma.apellido_materno AS alu_apm, ma.foto AS alu_foto
       FROM elecciones_miembro m
       INNER JOIN elecciones_cargo c ON c.id = m.cargo_id
       LEFT JOIN alumnos ma ON ma.id = m.alumno_id AND ma.colegio_id = ?
       WHERE m.lista_id = ?
       ORDER BY m.orden_sort ASC, m.id ASC`,
      [colegioId, listaId]
    );
    const propuestas = await query(
      `SELECT id, titulo, cuerpo, orden_sort FROM elecciones_propuesta WHERE lista_id = ? ORDER BY orden_sort ASC, id ASC`,
      [listaId]
    );
    const redes = await query(
      `SELECT id, tipo, titulo, url, orden_sort FROM elecciones_red_social WHERE lista_id = ? ORDER BY orden_sort ASC, id ASC`,
      [listaId]
    );
    const alcaldeMapped = mapAlcaldeListaPublic(req, listaJoin);
    const cd = payloadCountdownUrna(proceso);
    const [votoRow] = await query(
      `SELECT lista_id FROM elecciones_voto WHERE proceso_id = ? AND usuario_id = ? LIMIT 1`,
      [procesoId, req.user.usuario_id]
    );
    res.json({
      proceso: {
        id: proceso.id,
        titulo: proceso.titulo,
        estado: proceso.estado
      },
      lista: {
        id: listaJoin.id,
        nombre_lista: listaJoin.nombre_lista,
        eslogan: listaJoin.eslogan,
        color_primario: listaJoin.color_primario,
        color_secundario: listaJoin.color_secundario,
        logo_url: diskUrl(req, listaJoin.logo_path),
        alcalde: alcaldeMapped
      },
      plancha: miembrosRows.map((m) => mapMiembroPublic(req, m)),
      propuestas,
      redes,
      puede_participar: eleg.ok,
      motivo_bloqueo: eleg.ok ? null : eleg.mensaje,
      votacion_abierta: proceso.estado === 'VOTACION' && cd.ventana_horaria_abierta,
      puede_votar_ahora: eleg.ok && proceso.estado === 'VOTACION' && cd.ventana_horaria_abierta,
      ya_voto: !!votoRow,
      countdown_urna: cd
    });
  } catch (e) {
    console.error('[elecciones] landing votante:', e);
    res.status(500).json({ error: 'Error al cargar la candidatura' });
  }
}

async function handlerEleccionesUrna(req, res) {
  try {
    const procesoId = parseInt(req.params.id, 10);
    const colegioId = req.user.colegio_id;
    const [proceso] = await query(`SELECT * FROM elecciones_proceso WHERE id = ? AND colegio_id = ? LIMIT 1`, [
      procesoId,
      colegioId
    ]);
    if (!proceso) return res.status(404).json({ error: 'No encontrado' });
    if (proceso.estado !== 'VOTACION') {
      return res.status(403).json({ error: 'La votación no está abierta', codigo: 'NO_VOTACION' });
    }
    if (!votacionAbiertaPorFechas(proceso)) {
      return res.status(403).json({ error: 'Fuera del horario de votación', codigo: 'FUERA_DE_FECHA' });
    }
    const anio = await getAnioActivo(colegioId);
    const eleg = await elegibilidadVotanteUsuario(req, proceso, colegioId, anio);
    if (!eleg.ok) {
      return res.status(403).json({ error: eleg.mensaje, codigo: eleg.codigo });
    }
    const [votoRow] = await query(`SELECT id FROM elecciones_voto WHERE proceso_id = ? AND usuario_id = ? LIMIT 1`, [
      procesoId,
      req.user.usuario_id
    ]);
    const listasRows = await query(
      `SELECT l.*,
        aa.nombres AS cal_nom, aa.apellido_paterno AS cal_app, aa.apellido_materno AS cal_apm, aa.foto AS cal_foto
       FROM elecciones_lista l
       INNER JOIN elecciones_proceso p ON p.id = l.proceso_id AND p.colegio_id = ?
       LEFT JOIN alumnos aa ON aa.id = l.alcalde_alumno_id AND aa.colegio_id = ?
       WHERE l.proceso_id = ? AND l.estado = 'PUBLICADA'
       ORDER BY l.orden_sort ASC, l.id ASC`,
      [colegioId, colegioId, procesoId]
    );
    res.json({
      proceso: { id: proceso.id, titulo: proceso.titulo },
      ya_voto: !!votoRow,
      opciones: listasRows.map((L) => {
        const al = mapAlcaldeListaPublic(req, L);
        return {
          lista_id: L.id,
          nombre_lista: L.nombre_lista,
          logo_url: diskUrl(req, L.logo_path),
          alcalde_nombre_completo: al.nombre_completo,
          alcalde_foto_url: al.foto_url,
          color_primario: L.color_primario
        };
      }),
      countdown_urna: payloadCountdownUrna(proceso)
    });
  } catch (e) {
    console.error('[elecciones] urna votante:', e);
    res.status(500).json({ error: 'Error al cargar la urna' });
  }
}

async function handlerEleccionesVoto(req, res) {
  try {
    const procesoId = parseInt(req.params.id, 10);
    const listaId = parseInt((req.body || {}).lista_id, 10);
    if (!listaId) return res.status(400).json({ error: 'Debes elegir una lista' });

    const colegioId = req.user.colegio_id;
    const [proceso] = await query(`SELECT * FROM elecciones_proceso WHERE id = ? AND colegio_id = ? LIMIT 1`, [
      procesoId,
      colegioId
    ]);
    if (!proceso) return res.status(404).json({ error: 'Proceso no encontrado' });
    if (proceso.estado !== 'VOTACION') {
      return res.status(403).json({ error: 'La votación no está abierta' });
    }
    if (!votacionAbiertaPorFechas(proceso)) {
      return res.status(403).json({ error: 'Fuera del horario de votación' });
    }
    const anio = await getAnioActivo(colegioId);
    const eleg = await elegibilidadVotanteUsuario(req, proceso, colegioId, anio);
    if (!eleg.ok) {
      return res.status(403).json({ error: eleg.mensaje });
    }
    const [lista] = await query(
      `SELECT id FROM elecciones_lista WHERE id = ? AND proceso_id = ? AND estado = 'PUBLICADA' LIMIT 1`,
      [listaId, procesoId]
    );
    if (!lista) return res.status(400).json({ error: 'Lista no válida' });

    const ctxSnap = eleg.contextoMatricula;
    const tipoV = String(req.user.tipo || '').toUpperCase();

    const insertFallbackSinTipo = async () =>
      execute(
        `INSERT INTO elecciones_voto
          (proceso_id, colegio_id, usuario_id, alumno_id, lista_id, grupo_id_snap, grado_snap)
         VALUES (?,?,?,?,?,?,?)`,
        [
          procesoId,
          colegioId,
          req.user.usuario_id,
          req.user.alumno_id || null,
          listaId,
          ctxSnap ? ctxSnap.grupo_id : null,
          ctxSnap && ctxSnap.grado != null ? Number(ctxSnap.grado) : null
        ]
      );

    try {
      await execute(
        `INSERT INTO elecciones_voto
          (proceso_id, colegio_id, usuario_id, votante_tipo, alumno_id, lista_id, grupo_id_snap, grado_snap)
         VALUES (?,?,?,?,?,?,?,?)`,
        [
          procesoId,
          colegioId,
          req.user.usuario_id,
          tipoV,
          req.user.alumno_id || null,
          listaId,
          ctxSnap ? ctxSnap.grupo_id : null,
          ctxSnap && ctxSnap.grado != null ? Number(ctxSnap.grado) : null
        ]
      );
    } catch (insErr) {
      if (insErr.code === 'ER_BAD_FIELD_ERROR' || insErr.errno === 1054) {
        try {
          await insertFallbackSinTipo();
        } catch (e2) {
          if (e2.code === 'ER_DUP_ENTRY' || e2.errno === 1062) {
            return res.status(409).json({ error: 'Ya registraste tu voto en este proceso.' });
          }
          throw e2;
        }
      } else if (insErr.code === 'ER_DUP_ENTRY' || insErr.errno === 1062) {
        return res.status(409).json({ error: 'Ya registraste tu voto en este proceso.' });
      } else throw insErr;
    }
    res.status(201).json({ message: 'Voto registrado. ¡Gracias por participar!' });
  } catch (e) {
    console.error('[elecciones] voto:', e);
    res.status(500).json({ error: 'No se pudo registrar el voto' });
  }
}

// --- Portal electoral (usuarios intranet según proceso.perfiles_voto) ---
router.get('/portal/procesos', authenticateToken, handlerEleccionesProcesosLista);
router.get('/portal/procesos/:id', authenticateToken, handlerEleccionesProcesoDetalle);
router.get('/portal/procesos/:id/listas/:listaId', authenticateToken, handlerEleccionesLanding);
router.get('/portal/procesos/:id/urna', authenticateToken, handlerEleccionesUrna);
router.post('/portal/procesos/:id/voto', authenticateToken, handlerEleccionesVoto);

// --- Compatibilidad alumno ---
router.get('/alumno/procesos', authenticateToken, requireUserType('ALUMNO'), handlerEleccionesProcesosLista);
router.get('/alumno/procesos/:id', authenticateToken, requireUserType('ALUMNO'), handlerEleccionesProcesoDetalle);
router.get('/alumno/procesos/:id/listas/:listaId', authenticateToken, requireUserType('ALUMNO'), handlerEleccionesLanding);
router.get('/alumno/procesos/:id/urna', authenticateToken, requireUserType('ALUMNO'), handlerEleccionesUrna);
router.post('/alumno/procesos/:id/voto', authenticateToken, requireUserType('ALUMNO'), handlerEleccionesVoto);

module.exports = router;
