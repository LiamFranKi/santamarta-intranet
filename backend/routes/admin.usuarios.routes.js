/**
 * CRUD de usuarios para administrador: equipo (personal + perfiles), alumnos, apoderados.
 * Montaje: /api/admin/usuarios
 * Autenticación: solo ADMINISTRADOR.
 * Convención: usuario y contraseña inicial = DNI (password en BD como SHA1).
 */
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const phpSerialize = require('php-serialize');
const router = express.Router();
const { query, execute } = require('../utils/mysql');
const { authenticateToken } = require('../middleware/auth');

/** Valores del ENUM `usuarios.tipo` en MySQL (orden de negocio). */
const TIPOS_ENUM_USUARIO = [
  'ADMINISTRADOR',
  'DIRECTOR',
  'ALUMNO',
  'APODERADO',
  'DOCENTE',
  'AUXILIAR',
  'SECRETARIA',
  'CAJERO',
  'ENFERMERA',
  'PROMOTORIA',
  'COORDINADOR',
  'PSICOLOGA',
  'ASISTENCIA',
  'CONTADOR',
  'TUTOR',
  'MANTENIMIENTO',
];

/**
 * Perfiles asignables en el módulo Personal (tabla `personal` + usuario).
 * ALUMNO y APODERADO no se eligen aquí: se gestionan en sus propios módulos.
 */
const TIPOS_PERSONAL = TIPOS_ENUM_USUARIO.filter((t) => t !== 'ALUMNO' && t !== 'APODERADO');
const TIPOS_PERSONAL_SET = new Set(TIPOS_PERSONAL);

function sha1Password(plain) {
  return crypto.createHash('sha1').update(String(plain), 'utf8').digest('hex');
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Usuario no autenticado' });
  }
  if (req.user.tipo !== 'ADMINISTRADOR') {
    return res.status(403).json({ error: 'Solo administradores pueden gestionar usuarios' });
  }
  next();
}

router.use(authenticateToken);
router.use(requireAdmin);

const personalFotoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = '/home/vanguard/nuevo.vanguardschools.edu.pe/Static/Image/Fotos';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '.jpg';
    const safe = ext.toLowerCase().replace(/[^.a-z0-9]/g, '');
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safe}`);
  },
});

const uploadUsuarioFoto = multer({
  storage: personalFotoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if ((file.mimetype || '').startsWith('image/')) return cb(null, true);
    cb(new Error('Solo se permiten imágenes'));
  },
});

function parsePageLimit(req) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, Math.max(5, parseInt(req.query.limit, 10) || 50));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

const getBimestreActual = () => {
  const m = new Date().getMonth() + 1;
  return Math.min(4, Math.max(1, Math.ceil(m / 3)));
};

const getBimestreActualFromConfig = async (colegio_id, anio_activo) => {
  try {
    const rows = await query(
      'SELECT rangos_ciclos_notas FROM colegios WHERE id = ? LIMIT 1',
      [colegio_id]
    );
    if (!rows || rows.length === 0 || !rows[0].rangos_ciclos_notas) return getBimestreActual();

    let rangos = {};
    try {
      rangos = phpSerialize.unserialize(rows[0].rangos_ciclos_notas) || {};
    } catch (e) {
      try {
        rangos = JSON.parse(rows[0].rangos_ciclos_notas) || {};
      } catch (e2) {
        return getBimestreActual();
      }
    }

    const anio = parseInt(anio_activo, 10) || new Date().getFullYear();
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const parseDdMm = (str) => {
      if (!str || typeof str !== 'string') return null;
      const parts = str.trim().split('-');
      if (parts.length < 2) return null;
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (Number.isNaN(d) || Number.isNaN(m) || m < 1 || m > 12) return null;
      return new Date(anio, m - 1, d);
    };

    for (let ciclo = 1; ciclo <= 4; ciclo += 1) {
      const key = ciclo.toString();
      const r = rangos[key] || rangos[ciclo];
      if (!r || !r.inicio || !r.final) continue;
      const inicioDate = parseDdMm(r.inicio);
      const finalDate = parseDdMm(r.final);
      if (!inicioDate || !finalDate) continue;
      inicioDate.setHours(0, 0, 0, 0);
      finalDate.setHours(23, 59, 59, 999);
      if (hoy >= inicioDate && hoy <= finalDate) return ciclo;
    }
  } catch (err) {
    console.warn('getBimestreActualFromConfig admin:', err.message);
  }
  return getBimestreActual();
};

function getAvatarBaseUrlForReq(req) {
  if (process.env.NODE_ENV !== 'production') {
    return 'http://localhost:5000/api/static/avatars';
  }
  const host = req.get('x-forwarded-host') || req.get('host');
  let protocol = req.get('x-forwarded-proto') || req.protocol;
  if (!protocol || protocol === 'http') protocol = 'https';
  if (host) return `${protocol}://${host}/api/static/avatars`;
  const fallback = process.env.API_PUBLIC_URL || process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
  return fallback.replace(/\/$/, '') + '/api/static/avatars';
}

async function usuarioLibre(colegioId, usuarioLogin, excludeUsuarioId = null) {
  const sql = excludeUsuarioId
    ? 'SELECT id FROM usuarios WHERE colegio_id = ? AND usuario = ? AND id != ? LIMIT 1'
    : 'SELECT id FROM usuarios WHERE colegio_id = ? AND usuario = ? LIMIT 1';
  const params = excludeUsuarioId
    ? [colegioId, usuarioLogin, excludeUsuarioId]
    : [colegioId, usuarioLogin];
  const rows = await query(sql, params);
  return rows.length === 0;
}

/**
 * JOIN optimizado para resolver usuario de apoderado:
 * 1) prioriza vínculo directo por apoderado_id
 * 2) fallback a cuenta de personal/docente con mismo DNI
 * Evita OR/TRIM en el JOIN principal para mejorar uso de índices.
 */
const SQL_JOIN_USUARIO_APODERADO_OPT = `
  LEFT JOIN (
    SELECT colegio_id, apoderado_id, MIN(id) AS usuario_id
    FROM usuarios
    WHERE apoderado_id > 0
    GROUP BY colegio_id, apoderado_id
  ) ua_idx ON ua_idx.colegio_id = ap.colegio_id AND ua_idx.apoderado_id = ap.id
  LEFT JOIN usuarios u_ap ON u_ap.id = ua_idx.usuario_id
  LEFT JOIN (
    SELECT colegio_id, usuario, MIN(id) AS usuario_id
    FROM usuarios
    WHERE personal_id > 0
    GROUP BY colegio_id, usuario
  ) up_idx ON up_idx.colegio_id = ap.colegio_id AND up_idx.usuario = ap.nro_documento
  LEFT JOIN usuarios u_per ON u_per.id = up_idx.usuario_id
`;

/**
 * Fila `usuarios` para una ficha apoderado: primero por apoderado_id, luego personal con mismo DNI.
 */
async function resolverUsuarioFilaParaApoderado(colegioId, apoderadoId) {
  const linked = await query(
    'SELECT id, tipo, estado, usuario, personal_id, apoderado_id FROM usuarios WHERE colegio_id = ? AND apoderado_id = ? LIMIT 1',
    [colegioId, apoderadoId]
  );
  if (linked.length) {
    return linked[0];
  }
  const apRows = await query(
    'SELECT nro_documento FROM apoderados WHERE id = ? AND colegio_id = ? LIMIT 1',
    [apoderadoId, colegioId]
  );
  if (!apRows.length) {
    return null;
  }
  const dni = String(apRows[0].nro_documento || '').trim();
  const staff = await query(
    `SELECT id, tipo, estado, usuario, personal_id, apoderado_id FROM usuarios
     WHERE colegio_id = ? AND TRIM(usuario) = ? AND personal_id > 0
     LIMIT 1`,
    [colegioId, dni]
  );
  return staff[0] || null;
}

// ——— Equipo (tabla personal + usuarios) ———

router.get('/equipo/tipos', (req, res) => {
  res.json({ tipos: TIPOS_PERSONAL });
});

router.get('/equipo', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const { page, limit, offset } = parsePageLimit(req);
    const search = (req.query.search || '').trim();
    const perfil = (req.query.perfil || '').trim().toUpperCase();

    const whereParts = ['p.colegio_id = ?'];
    const params = [colegio_id];

    if (search) {
      const like = `%${search.replace(/%/g, '')}%`;
      whereParts.push(
        '(CONCAT(TRIM(p.apellidos), ", ", TRIM(p.nombres)) LIKE ? OR CONCAT(TRIM(p.nombres), " ", TRIM(p.apellidos)) LIKE ? OR p.nro_documento LIKE ? OR p.email LIKE ?)'
      );
      params.push(like, like, like, like);
    }

    if (perfil && TIPOS_PERSONAL_SET.has(perfil)) {
      whereParts.push(
        `EXISTS (
          SELECT 1
          FROM usuarios ux
          WHERE ux.personal_id = p.id
            AND ux.colegio_id = p.colegio_id
            AND ux.tipo = ?
        )`
      );
      params.push(perfil);
    }

    const whereSql = whereParts.join(' AND ');

    const countRows = await query(`SELECT COUNT(*) AS total FROM personal p WHERE ${whereSql}`, params);
    const total = countRows[0]?.total ?? 0;

    const listParams = [...params];
    const filtroPerfilRepresentativo =
      perfil && TIPOS_PERSONAL_SET.has(perfil) ? 'AND uu.tipo = ?' : '';
    if (filtroPerfilRepresentativo) {
      listParams.push(perfil);
    }
    listParams.push(limit, offset);
    const rows = await query(
      `SELECT p.id, p.nombres, p.apellidos, p.nro_documento, p.email, p.telefono_celular, p.cargo,
              p.foto, p.fecha_nacimiento,
              u.id AS usuario_id, u.tipo AS usuario_tipo, u.estado AS usuario_estado, u.usuario AS login_usuario
       FROM personal p
       LEFT JOIN usuarios u ON u.id = (
         SELECT uu.id
         FROM usuarios uu
         WHERE uu.personal_id = p.id
           AND uu.colegio_id = p.colegio_id
           ${filtroPerfilRepresentativo}
         ORDER BY (uu.estado = 'ACTIVO') DESC, uu.id ASC
         LIMIT 1
       )
       WHERE ${whereSql}
       ORDER BY p.apellidos ASC, p.nombres ASC
       LIMIT ? OFFSET ?`,
      listParams
    );

    res.json({ data: rows, total, page, limit });
  } catch (e) {
    console.error('GET /admin/usuarios/equipo', e);
    res.status(500).json({ error: e.message || 'Error al listar equipo' });
  }
});

router.get('/equipo/:personalId', async (req, res) => {
  try {
    const { colegio_id, anio_activo } = req.user;
    const personalId = parseInt(req.params.personalId, 10);
    if (!personalId) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const rows = await query(
      `SELECT p.*, u.id AS usuario_id, u.tipo AS usuario_tipo, u.estado AS usuario_estado, u.usuario AS login_usuario
       FROM personal p
       LEFT JOIN usuarios u ON u.personal_id = p.id AND u.colegio_id = p.colegio_id
       WHERE p.id = ? AND p.colegio_id = ?
       LIMIT 1`,
      [personalId, colegio_id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'No encontrado' });
    }
    const cursosRows = await query(
      `SELECT DISTINCT c.nombre AS curso, g.anio, g.grado, g.seccion, n.nombre AS nivel
       FROM asignaturas a
       INNER JOIN cursos c ON c.id = a.curso_id
       INNER JOIN grupos g ON g.id = a.grupo_id
       LEFT JOIN niveles n ON n.id = g.nivel_id
       WHERE a.personal_id = ? AND a.colegio_id = ? AND g.anio = ?
       ORDER BY g.anio DESC, n.nombre ASC, g.grado ASC, g.seccion ASC, c.nombre ASC`,
      [personalId, colegio_id, anio_activo]
    );

    const tutoriaRows = await query(
      `SELECT g.id, g.anio, g.grado, g.seccion, n.nombre AS nivel
       FROM grupos g
       LEFT JOIN niveles n ON n.id = g.nivel_id
       WHERE g.tutor_id = ? AND g.colegio_id = ? AND g.anio = ?
       ORDER BY g.grado ASC, g.seccion ASC
       LIMIT 1`,
      [personalId, colegio_id, anio_activo]
    );

    const gruposMap = new Map();
    const cursosSet = new Set();
    for (const r of cursosRows) {
      const grupoTexto = `${r.nivel || ''} ${r.grado ? `${r.grado}°` : ''} ${r.seccion || ''} - ${r.anio || ''}`
        .replace(/\s+/g, ' ')
        .trim();
      if (grupoTexto) {
        gruposMap.set(grupoTexto, grupoTexto);
      }
      if (r.curso) {
        cursosSet.add(String(r.curso).trim());
      }
    }

    res.json({
      ...rows[0],
      grupos_cargo: Array.from(gruposMap.values()),
      cursos_ensena: Array.from(cursosSet.values()),
      tutoria: tutoriaRows[0]
        ? `${tutoriaRows[0].nivel || ''} ${tutoriaRows[0].grado ? `${tutoriaRows[0].grado}°` : ''} ${tutoriaRows[0].seccion || ''} - ${tutoriaRows[0].anio || ''}`
            .replace(/\s+/g, ' ')
            .trim()
        : '',
    });
  } catch (e) {
      console.error('GET /admin/usuarios/equipo/:id', e);
      res.status(500).json({ error: e.message || 'Error al obtener registro' });
  }
});

/** Valores por defecto para columnas obligatorias de `personal` (compat. legado PHP). */
function defaultsNuevoPersonal(colegioId, body) {
  const hoy = new Date().toISOString().slice(0, 10);
  return {
    colegio_id: colegioId,
    sexo: 0,
    telefono_fijo: body.telefono_fijo != null ? String(body.telefono_fijo) : '',
    telefono_celular: body.telefono_celular != null ? String(body.telefono_celular) : '',
    linea_celular: 0,
    direccion: body.direccion != null ? String(body.direccion) : '',
    foto: '',
    nombres: String(body.nombres || '').trim(),
    apellidos: String(body.apellidos || '').trim(),
    tipo_documento: parseInt(body.tipo_documento, 10) || 1,
    nro_documento: String(body.nro_documento || '').trim(),
    grado_instruccion: 0,
    profesion: body.profesion != null ? String(body.profesion) : '',
    cargo: body.cargo != null ? String(body.cargo) : '',
    email: String(body.email || '').trim(),
    fecha_nacimiento: body.fecha_nacimiento || '2000-01-01',
    pais_nacimiento_id: 0,
    estado_civil: 0,
    tipo_contrato: 0,
    observaciones: '',
    departamento_nacimiento_id: 0,
    provincia_nacimiento_id: 0,
    distrito_nacimiento_id: 0,
    domicilio_pais_id: 0,
    domicilio_departamento_id: 0,
    domicilio_provincia_id: 0,
    domicilio_distrito_id: 0,
    fecha_ingreso: body.fecha_ingreso || hoy,
    hora_entrada: '08:00:00',
    hora_salida: '17:00:00',
    resena: '',
    mostrar_app: 'NO',
    link_aula: '',
  };
}

async function insertUsuarioPersonal(colegioId, personalId, dni, tipo) {
  const exists = await query(
    'SELECT id FROM usuarios WHERE colegio_id = ? AND personal_id = ? LIMIT 1',
    [colegioId, personalId]
  );
  if (exists.length) {
    const err = new Error('El personal ya tiene usuario vinculado');
    err.code = 'PERSONAL_USUARIO_DUPLICADO';
    throw err;
  }
  const pwd = sha1Password(dni);
  const result = await execute(
    `INSERT INTO usuarios (
       colegio_id, alumno_id, personal_id, apoderado_id, usuario, password, tipo, estado,
       ms_email, ms_access_token, ms_refresh_token, ms_id_token, auth_token, permisos,
       cambiar_password, app_terminos_aceptados, cambiar_datos
     ) VALUES (?, 0, ?, 0, ?, ?, ?, 'ACTIVO', '', '', '', '', '', '', 'NO', 'NO', 'SI')`,
    [colegioId, personalId, dni, pwd, tipo]
  );
  return result.insertId;
}

router.post('/equipo', uploadUsuarioFoto.single('foto'), async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const tipo = String(req.body.tipo || '').toUpperCase();
    if (!TIPOS_PERSONAL_SET.has(tipo)) {
      return res.status(400).json({ error: 'Tipo de usuario no válido para personal' });
    }
    const d = defaultsNuevoPersonal(colegio_id, req.body);
    if (req.file?.filename) {
      d.foto = req.file.filename;
    }
    if (!d.nombres || !d.apellidos || !d.nro_documento) {
      return res.status(400).json({ error: 'Nombres, apellidos y DNI son obligatorios' });
    }

    const ocupado = await query(
      'SELECT id FROM personal WHERE colegio_id = ? AND nro_documento = ? LIMIT 1',
      [colegio_id, d.nro_documento]
    );
    if (ocupado.length) {
      return res.status(409).json({ error: 'Ya existe personal con ese DNI' });
    }
    if (!(await usuarioLibre(colegio_id, d.nro_documento))) {
      return res.status(409).json({ error: 'Ya existe un usuario con ese DNI' });
    }

    await execute(
      `INSERT INTO personal (
        colegio_id, sexo, telefono_fijo, telefono_celular, linea_celular, direccion, foto,
        nombres, apellidos, tipo_documento, nro_documento, grado_instruccion, profesion, cargo, email,
        fecha_nacimiento, pais_nacimiento_id, estado_civil, tipo_contrato, observaciones,
        departamento_nacimiento_id, provincia_nacimiento_id, distrito_nacimiento_id,
        domicilio_pais_id, domicilio_departamento_id, domicilio_provincia_id, domicilio_distrito_id,
        fecha_ingreso, hora_entrada, hora_salida, resena, mostrar_app, link_aula
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        d.colegio_id,
        d.sexo,
        d.telefono_fijo,
        d.telefono_celular,
        d.linea_celular,
        d.direccion,
        d.foto,
        d.nombres,
        d.apellidos,
        d.tipo_documento,
        d.nro_documento,
        d.grado_instruccion,
        d.profesion,
        d.cargo,
        d.email,
        d.fecha_nacimiento,
        d.pais_nacimiento_id,
        d.estado_civil,
        d.tipo_contrato,
        d.observaciones,
        d.departamento_nacimiento_id,
        d.provincia_nacimiento_id,
        d.distrito_nacimiento_id,
        d.domicilio_pais_id,
        d.domicilio_departamento_id,
        d.domicilio_provincia_id,
        d.domicilio_distrito_id,
        d.fecha_ingreso,
        d.hora_entrada,
        d.hora_salida,
        d.resena,
        d.mostrar_app,
        d.link_aula,
      ]
    );

    const [last] = await query(
      'SELECT id FROM personal WHERE colegio_id = ? AND nro_documento = ? ORDER BY id DESC LIMIT 1',
      [colegio_id, d.nro_documento]
    );
    const personalId = last?.id;
    if (!personalId) {
      return res.status(500).json({ error: 'No se pudo obtener el personal creado' });
    }

    const usuarioId = await insertUsuarioPersonal(colegio_id, personalId, d.nro_documento, tipo);
    res.status(201).json({ personal_id: personalId, usuario_id: usuarioId });
  } catch (e) {
    console.error('POST /admin/usuarios/equipo', e);
    if (e.code === 'PERSONAL_USUARIO_DUPLICADO') {
      return res.status(409).json({ error: 'Este personal ya tiene un usuario vinculado' });
    }
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'DNI o usuario duplicado' });
    }
    res.status(500).json({ error: e.message || 'Error al crear personal' });
  }
});

router.put('/equipo/:personalId', async (req, res) => {
  try {
    const { colegio_id, usuario_id: adminUsuarioId } = req.user;
    const personalId = parseInt(req.params.personalId, 10);
    if (!personalId) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const exist = await query(
      'SELECT id, nro_documento FROM personal WHERE id = ? AND colegio_id = ? LIMIT 1',
      [personalId, colegio_id]
    );
    if (!exist.length) {
      return res.status(404).json({ error: 'No encontrado' });
    }

    const urows = await query(
      'SELECT id, usuario, tipo FROM usuarios WHERE personal_id = ? AND colegio_id = ? LIMIT 1',
      [personalId, colegio_id]
    );
    const usuarioRow = urows[0];

    const nombres = req.body.nombres != null ? String(req.body.nombres).trim() : null;
    const apellidos = req.body.apellidos != null ? String(req.body.apellidos).trim() : null;
    const email = req.body.email != null ? String(req.body.email).trim() : null;
    const telefono_celular = req.body.telefono_celular != null ? String(req.body.telefono_celular) : null;
    const cargo = req.body.cargo != null ? String(req.body.cargo) : null;
    const fecha_nacimiento = req.body.fecha_nacimiento != null ? String(req.body.fecha_nacimiento).slice(0, 10) : null;
    const nro_documento = req.body.nro_documento != null ? String(req.body.nro_documento).trim() : null;

    if (nro_documento && nro_documento !== exist[0].nro_documento) {
      const dupP = await query(
        'SELECT id FROM personal WHERE colegio_id = ? AND nro_documento = ? AND id != ? LIMIT 1',
        [colegio_id, nro_documento, personalId]
      );
      if (dupP.length) {
        return res.status(409).json({ error: 'Otro registro ya usa ese DNI' });
      }
      if (!(await usuarioLibre(colegio_id, nro_documento, usuarioRow?.id))) {
        return res.status(409).json({ error: 'El DNI ya está en uso como usuario' });
      }
    }

    const sets = [];
    const params = [];
    if (nombres != null) {
      sets.push('nombres = ?');
      params.push(nombres);
    }
    if (apellidos != null) {
      sets.push('apellidos = ?');
      params.push(apellidos);
    }
    if (email != null) {
      sets.push('email = ?');
      params.push(email);
    }
    if (telefono_celular != null) {
      sets.push('telefono_celular = ?');
      params.push(telefono_celular);
    }
    if (cargo != null) {
      sets.push('cargo = ?');
      params.push(cargo);
    }
    if (fecha_nacimiento != null) {
      sets.push('fecha_nacimiento = ?');
      params.push(fecha_nacimiento);
    }
    if (nro_documento != null) {
      sets.push('nro_documento = ?');
      params.push(nro_documento);
    }

    if (sets.length) {
      params.push(personalId, colegio_id);
      await execute(`UPDATE personal SET ${sets.join(', ')} WHERE id = ? AND colegio_id = ?`, params);
    }

    const nuevoDoc = nro_documento != null ? nro_documento : exist[0].nro_documento;

    if (usuarioRow) {
      const nuevoTipo = req.body.tipo != null ? String(req.body.tipo).toUpperCase() : null;
      const nuevoEstado = req.body.usuario_estado != null ? String(req.body.usuario_estado).toUpperCase() : null;

      if (nuevoTipo != null) {
        if (!TIPOS_PERSONAL_SET.has(nuevoTipo)) {
          return res.status(400).json({ error: 'Tipo no válido' });
        }
        await execute('UPDATE usuarios SET tipo = ? WHERE id = ? AND colegio_id = ?', [
          nuevoTipo,
          usuarioRow.id,
          colegio_id,
        ]);
      }

      if (nuevoEstado === 'ACTIVO' || nuevoEstado === 'INACTIVO') {
        if (parseInt(usuarioRow.id, 10) === parseInt(adminUsuarioId, 10) && nuevoEstado === 'INACTIVO') {
          return res.status(400).json({ error: 'No puede desactivar su propio usuario' });
        }
        await execute('UPDATE usuarios SET estado = ? WHERE id = ? AND colegio_id = ?', [
          nuevoEstado,
          usuarioRow.id,
          colegio_id,
        ]);
      }

      if (nro_documento != null && nro_documento !== usuarioRow.usuario) {
        await execute('UPDATE usuarios SET usuario = ? WHERE id = ? AND colegio_id = ?', [
          nuevoDoc,
          usuarioRow.id,
          colegio_id,
        ]);
      }
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('PUT /admin/usuarios/equipo/:id', e);
    res.status(500).json({ error: e.message || 'Error al actualizar' });
  }
});

router.put('/equipo/:personalId/foto', uploadUsuarioFoto.single('foto'), async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const personalId = parseInt(req.params.personalId, 10);
    if (!personalId) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Debe adjuntar una imagen' });
    }

    const exist = await query('SELECT id FROM personal WHERE id = ? AND colegio_id = ? LIMIT 1', [personalId, colegio_id]);
    if (!exist.length) {
      return res.status(404).json({ error: 'No encontrado' });
    }

    await execute('UPDATE personal SET foto = ? WHERE id = ? AND colegio_id = ?', [req.file.filename, personalId, colegio_id]);
    res.json({ ok: true, foto: req.file.filename });
  } catch (e) {
    console.error('PUT /admin/usuarios/equipo/:personalId/foto', e);
    res.status(500).json({ error: e.message || 'Error al actualizar foto' });
  }
});

router.post('/equipo/:personalId/acceso', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const personalId = parseInt(req.params.personalId, 10);
    const tipo = String(req.body.tipo || 'DOCENTE').toUpperCase();
    if (!TIPOS_PERSONAL_SET.has(tipo)) {
      return res.status(400).json({ error: 'Tipo no válido' });
    }

    const prow = await query(
      'SELECT id, nro_documento FROM personal WHERE id = ? AND colegio_id = ? LIMIT 1',
      [personalId, colegio_id]
    );
    if (!prow.length) {
      return res.status(404).json({ error: 'Personal no encontrado' });
    }
    const tiene = await query(
      'SELECT id FROM usuarios WHERE personal_id = ? AND colegio_id = ? LIMIT 1',
      [personalId, colegio_id]
    );
    if (tiene.length) {
      return res.status(409).json({ error: 'Este personal ya tiene acceso' });
    }
    const dni = prow[0].nro_documento;
    if (!(await usuarioLibre(colegio_id, dni))) {
      return res.status(409).json({ error: 'El DNI ya está registrado como otro usuario' });
    }
    const usuarioId = await insertUsuarioPersonal(colegio_id, personalId, dni, tipo);
    res.status(201).json({ usuario_id: usuarioId });
  } catch (e) {
    console.error('POST acceso equipo', e);
    if (e.code === 'PERSONAL_USUARIO_DUPLICADO') {
      return res.status(409).json({ error: 'Este personal ya tiene un usuario vinculado' });
    }
    res.status(500).json({ error: e.message || 'Error al crear acceso' });
  }
});

router.post('/equipo/:personalId/reset-password', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const personalId = parseInt(req.params.personalId, 10);
    const urows = await query(
      `SELECT u.id, p.nro_documento
       FROM usuarios u
       INNER JOIN personal p ON p.id = u.personal_id AND p.colegio_id = u.colegio_id
       WHERE u.personal_id = ? AND u.colegio_id = ? LIMIT 1`,
      [personalId, colegio_id]
    );
    if (!urows.length) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    const pwd = sha1Password(urows[0].nro_documento);
    await execute('UPDATE usuarios SET password = ?, cambiar_password = ? WHERE id = ? AND colegio_id = ?', [
      pwd,
      'NO',
      urows[0].id,
      colegio_id,
    ]);
    res.json({ ok: true });
  } catch (e) {
    console.error('reset-password equipo', e);
    res.status(500).json({ error: e.message || 'Error al restablecer' });
  }
});

router.post('/equipo/:personalId/password', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const personalId = parseInt(req.params.personalId, 10);
    const password = String(req.body.password || '').trim();
    if (!personalId) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres' });
    }
    const urows = await query(
      'SELECT id FROM usuarios WHERE personal_id = ? AND colegio_id = ? LIMIT 1',
      [personalId, colegio_id]
    );
    if (!urows.length) {
      return res.status(404).json({ error: 'Usuario no encontrado para este personal' });
    }
    const pwd = sha1Password(password);
    await execute('UPDATE usuarios SET password = ?, cambiar_password = ? WHERE id = ? AND colegio_id = ?', [
      pwd,
      'NO',
      urows[0].id,
      colegio_id,
    ]);
    res.json({ ok: true });
  } catch (e) {
    console.error('password equipo', e);
    res.status(500).json({ error: e.message || 'Error al cambiar contraseña' });
  }
});

router.get('/equipo/:personalId/horario', async (req, res) => {
  try {
    const { colegio_id, anio_activo } = req.user;
    const personalId = parseInt(req.params.personalId, 10);
    if (!personalId) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const prow = await query(
      'SELECT id, nombres, apellidos FROM personal WHERE id = ? AND colegio_id = ? LIMIT 1',
      [personalId, colegio_id]
    );
    if (!prow.length) {
      return res.status(404).json({ error: 'Personal no encontrado' });
    }

    const aniosDisponibles = await query(
      `SELECT DISTINCT gh.anio
       FROM grupos_horarios gh
       LEFT JOIN asignaturas a ON a.id = gh.asignatura_id
       LEFT JOIN grupos g ON g.id = a.grupo_id
       WHERE (a.personal_id = ? OR gh.personal_id = ?)
       ORDER BY gh.anio DESC`,
      [personalId, personalId]
    );

    if (!aniosDisponibles || !aniosDisponibles.length) {
      return res.json({ horario: [], docente: prow[0] });
    }

    const anioActivoInt = parseInt(anio_activo, 10);
    const existeAnioActivo = aniosDisponibles.some((row) => parseInt(row.anio, 10) === anioActivoInt);
    const anioUsar = existeAnioActivo ? anioActivoInt : parseInt(aniosDisponibles[0].anio, 10);

    const horarioCrudo = await query(
      `SELECT 
         gh.id,
         gh.dia,
         gh.hora_inicio,
         gh.hora_final,
         gh.anio,
         c.nombre        AS curso_nombre,
         gh.descripcion  AS descripcion,
         g.grado,
         g.seccion,
         n.nombre        AS nivel_nombre
       FROM grupos_horarios gh
       LEFT JOIN asignaturas a ON a.id = gh.asignatura_id
       LEFT JOIN grupos g      ON g.id = COALESCE(a.grupo_id, gh.grupo_id)
       LEFT JOIN niveles n     ON n.id = g.nivel_id
       LEFT JOIN cursos c      ON c.id = a.curso_id
       WHERE gh.anio = ?
         AND (a.personal_id = ? OR gh.personal_id = ?)
       ORDER BY gh.dia, 
         TIME(STR_TO_DATE(gh.hora_inicio, '%l:%i %p')),
         COALESCE(TIME(STR_TO_DATE(gh.hora_inicio, '%H:%i:%s')), TIME(STR_TO_DATE(gh.hora_inicio, '%H:%i')))`,
      [anioUsar, personalId, personalId]
    );

    const horario = (horarioCrudo || []).map((row) => {
      const gradoTexto = row.grado ? `${row.grado}°` : '';
      let grupo = `${row.nivel_nombre || ''} ${gradoTexto} ${row.seccion || ''}`.trim();
      if (row.anio) {
        grupo = `${grupo} - ${row.anio}`.trim();
      }
      return {
        id: row.id,
        dia: typeof row.dia === 'number' ? row.dia : parseInt(row.dia || 0, 10),
        inicio: row.hora_inicio,
        fin: row.hora_final,
        titulo: row.curso_nombre || row.descripcion || '—',
        grupo,
      };
    });

    res.json({
      docente: prow[0],
      horario,
      anio: anioUsar,
    });
  } catch (e) {
    console.error('horario equipo', e);
    res.status(500).json({ error: e.message || 'Error al obtener horario' });
  }
});

router.delete('/equipo/:personalId', async (req, res) => {
  try {
    const { colegio_id, usuario_id: adminUsuarioId } = req.user;
    const personalId = parseInt(req.params.personalId, 10);
    if (!personalId) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const prow = await query(
      'SELECT id, nro_documento FROM personal WHERE id = ? AND colegio_id = ? LIMIT 1',
      [personalId, colegio_id]
    );
    if (!prow.length) {
      return res.status(404).json({ error: 'Personal no encontrado' });
    }

    const asignaturas = await query(
      'SELECT COUNT(*) AS n FROM asignaturas WHERE personal_id = ?',
      [personalId]
    );
    if ((asignaturas[0]?.n || 0) > 0) {
      return res.status(409).json({
        error: 'No se puede eliminar: este personal tiene cursos/asignaturas asignados.',
      });
    }

    const horarios = await query(
      'SELECT COUNT(*) AS n FROM grupos_horarios WHERE personal_id = ?',
      [personalId]
    );
    if ((horarios[0]?.n || 0) > 0) {
      return res.status(409).json({
        error: 'No se puede eliminar: este personal tiene horarios registrados.',
      });
    }

    const urows = await query(
      'SELECT id FROM usuarios WHERE personal_id = ? AND colegio_id = ?',
      [personalId, colegio_id]
    );
    for (const u of urows) {
      if (parseInt(u.id, 10) === parseInt(adminUsuarioId, 10)) {
        return res.status(400).json({ error: 'No puede eliminar su propio usuario.' });
      }
      await execute('DELETE FROM usuarios WHERE id = ? AND colegio_id = ?', [u.id, colegio_id]);
    }

    await execute('DELETE FROM personal WHERE id = ? AND colegio_id = ?', [personalId, colegio_id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE equipo', e);
    res.status(500).json({ error: e.message || 'Error al eliminar personal' });
  }
});

// ——— Alumnos ———

const ALUMNO_DEFAULTS = {
  estado_civil: 0,
  tipo_documento: 1,
  pais_nacimiento_id: 0,
  departamento_nacimiento_id: 0,
  provincia_nacimiento_id: 0,
  distrito_nacimiento_id: 0,
  sexo: 0,
  foto: '',
  observaciones: '',
  nro_hermanos: 0,
  lugar_hermanos: 0,
  religion: 0,
  lengua_materna: 0,
  segunda_lengua: 0,
  codigo: '',
  discapacidad: '',
  domicilio: '',
  estado_nacimiento: 0,
  observaciones_nacimiento: '',
  actividades_nacimiento: '',
  controles_peso_talla: '',
  otros_controles: '',
  alergias: '',
  experiencias_traumaticas: '',
  tipo_sangre: 0,
  enfermedades_sufridas: '',
  vacunas: '',
  trabajos: '',
  foto_dni: '',
  registro_desde: 'SISTEMA',
  seguro_id: 0,
};

router.get('/alumnos', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const { page, limit, offset } = parsePageLimit(req);
    const search = (req.query.search || '').trim();

    const whereParts = ['a.colegio_id = ?'];
    const params = [colegio_id];
    if (search) {
      const like = `%${search.replace(/%/g, '')}%`;
      whereParts.push(
        '(a.nro_documento LIKE ? OR a.nombres LIKE ? OR a.apellido_paterno LIKE ? OR a.apellido_materno LIKE ?)'
      );
      params.push(like, like, like, like);
    }
    const whereSql = whereParts.join(' AND ');

    const countRows = await query(
      `SELECT COUNT(*) AS total FROM alumnos a WHERE ${whereSql}`,
      params
    );
    const total = countRows[0]?.total ?? 0;

    const rows = await query(
      `SELECT a.id, a.nombres, a.apellido_paterno, a.apellido_materno, a.nro_documento, a.fecha_nacimiento, a.foto, a.email,
              u.id AS usuario_id, u.usuario AS login_usuario, u.estado AS usuario_estado
       FROM alumnos a
       LEFT JOIN usuarios u ON u.alumno_id = a.id AND u.colegio_id = a.colegio_id AND u.tipo = 'ALUMNO'
       WHERE ${whereSql}
       ORDER BY a.apellido_paterno, a.apellido_materno, a.nombres
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    res.json({ data: rows, total, page, limit });
  } catch (e) {
    console.error('GET alumnos admin', e);
    res.status(500).json({ error: e.message || 'Error al listar alumnos' });
  }
});

router.get('/alumnos/:id', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const rows = await query(
      `SELECT a.*,
              u.id AS usuario_id, u.usuario AS login_usuario, u.estado AS usuario_estado, u.tipo AS usuario_tipo
       FROM alumnos a
       LEFT JOIN usuarios u ON u.alumno_id = a.id AND u.colegio_id = a.colegio_id AND u.tipo = 'ALUMNO'
       WHERE a.id = ? AND a.colegio_id = ?
       LIMIT 1`,
      [id, colegio_id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'No encontrado' });
    }
    const alumno = rows[0];

    let avatar_asignado_url = null;
    try {
      const bimestre = await getBimestreActualFromConfig(colegio_id, req.user?.anio_activo);
      const sexoAv = alumno.sexo !== null && alumno.sexo !== undefined ? alumno.sexo : 0;
      let bases = await query(
        'SELECT id, imagen_base FROM avatar_bases WHERE bimestre = ? AND sexo = ? LIMIT 1',
        [bimestre, sexoAv]
      );
      if (!bases.length) {
        bases = await query('SELECT id, imagen_base FROM avatar_bases WHERE bimestre = ? LIMIT 1', [bimestre]);
      }
      if (bases.length > 0) {
        const base = bases[0];
        const equipado = await query(
          'SELECT accesorio_id FROM alumno_avatar_equipado WHERE student_id = ? AND avatar_base_id = ? LIMIT 1',
          [id, base.id]
        );
        const accesorioId = equipado[0]?.accesorio_id;
        const baseUrl = getAvatarBaseUrlForReq(req);
        if (accesorioId) {
          const acc = await query('SELECT imagen_combinada FROM avatar_accesorios WHERE id = ? LIMIT 1', [accesorioId]);
          if (acc.length > 0 && acc[0].imagen_combinada) {
            avatar_asignado_url = `${baseUrl}/${acc[0].imagen_combinada}`;
          }
        }
        if (!avatar_asignado_url && base.imagen_base) {
          avatar_asignado_url = `${baseUrl}/${base.imagen_base}`;
        }
      }
    } catch (e) {
      const msg = String(e.message || '').toLowerCase();
      const esTablaFaltante = msg.includes("doesn't exist") || msg.includes('avatar_bases') || msg.includes('avatar_accesorios') || msg.includes('alumno_avatar_equipado');
      if (!esTablaFaltante) {
        console.warn('GET alumno admin avatar:', e.message);
      }
    }

    res.json({ ...alumno, avatar_asignado_url });
  } catch (e) {
    console.error('GET alumno admin', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.post('/alumnos', uploadUsuarioFoto.single('foto'), async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const ap = String(req.body.apellido_paterno || '').trim();
    const am = String(req.body.apellido_materno || '').trim();
    const nom = String(req.body.nombres || '').trim();
    const doc = String(req.body.nro_documento || '').trim();
    const fn = req.body.fecha_nacimiento || '2000-01-01';
    if (!ap || !nom || !doc) {
      return res.status(400).json({ error: 'Apellido paterno, nombres y DNI son obligatorios' });
    }

    const dup = await query(
      'SELECT id FROM alumnos WHERE colegio_id = ? AND nro_documento = ? LIMIT 1',
      [colegio_id, doc]
    );
    if (dup.length) {
      return res.status(409).json({ error: 'Ya existe un alumno con ese DNI' });
    }
    if (!(await usuarioLibre(colegio_id, doc))) {
      return res.status(409).json({ error: 'El DNI ya está en uso como usuario' });
    }

    const email = String(req.body.email || '').trim();
    const foto = req.file?.filename || ALUMNO_DEFAULTS.foto;
    const hoy = new Date().toISOString().slice(0, 10);

    await execute(
      `INSERT INTO alumnos (
        colegio_id, apellido_paterno, apellido_materno, nombres, estado_civil, tipo_documento, nro_documento, fecha_nacimiento,
        pais_nacimiento_id, departamento_nacimiento_id, provincia_nacimiento_id, distrito_nacimiento_id,
        sexo, email, foto, fecha_inscripcion, observaciones, nro_hermanos, lugar_hermanos, religion, lengua_materna, segunda_lengua,
        codigo, discapacidad, domicilio, estado_nacimiento, observaciones_nacimiento, actividades_nacimiento, controles_peso_talla,
        otros_controles, alergias, experiencias_traumaticas, tipo_sangre, enfermedades_sufridas, vacunas, trabajos, foto_dni, registro_desde, seguro_id
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        colegio_id,
        ap,
        am,
        nom,
        ALUMNO_DEFAULTS.estado_civil,
        ALUMNO_DEFAULTS.tipo_documento,
        doc,
        fn.slice(0, 10),
        ALUMNO_DEFAULTS.pais_nacimiento_id,
        ALUMNO_DEFAULTS.departamento_nacimiento_id,
        ALUMNO_DEFAULTS.provincia_nacimiento_id,
        ALUMNO_DEFAULTS.distrito_nacimiento_id,
        ALUMNO_DEFAULTS.sexo,
        email,
        foto,
        hoy,
        ALUMNO_DEFAULTS.observaciones,
        ALUMNO_DEFAULTS.nro_hermanos,
        ALUMNO_DEFAULTS.lugar_hermanos,
        ALUMNO_DEFAULTS.religion,
        ALUMNO_DEFAULTS.lengua_materna,
        ALUMNO_DEFAULTS.segunda_lengua,
        ALUMNO_DEFAULTS.codigo,
        ALUMNO_DEFAULTS.discapacidad,
        ALUMNO_DEFAULTS.domicilio,
        ALUMNO_DEFAULTS.estado_nacimiento,
        ALUMNO_DEFAULTS.observaciones_nacimiento,
        ALUMNO_DEFAULTS.actividades_nacimiento,
        ALUMNO_DEFAULTS.controles_peso_talla,
        ALUMNO_DEFAULTS.otros_controles,
        ALUMNO_DEFAULTS.alergias,
        ALUMNO_DEFAULTS.experiencias_traumaticas,
        ALUMNO_DEFAULTS.tipo_sangre,
        ALUMNO_DEFAULTS.enfermedades_sufridas,
        ALUMNO_DEFAULTS.vacunas,
        ALUMNO_DEFAULTS.trabajos,
        ALUMNO_DEFAULTS.foto_dni,
        ALUMNO_DEFAULTS.registro_desde,
        ALUMNO_DEFAULTS.seguro_id,
      ]
    );

    const [last] = await query(
      'SELECT id FROM alumnos WHERE colegio_id = ? AND nro_documento = ? ORDER BY id DESC LIMIT 1',
      [colegio_id, doc]
    );
    const alumnoId = last?.id;
    if (!alumnoId) {
      return res.status(500).json({ error: 'No se pudo obtener el alumno creado' });
    }

    const pwd = sha1Password(doc);
    await execute(
      `INSERT INTO usuarios (
         colegio_id, alumno_id, personal_id, apoderado_id, usuario, password, tipo, estado,
         ms_email, ms_access_token, ms_refresh_token, ms_id_token, auth_token, permisos,
         cambiar_password, app_terminos_aceptados, cambiar_datos
       ) VALUES (?, ?, 0, 0, ?, ?, 'ALUMNO', 'ACTIVO', '', '', '', '', '', '', 'NO', 'NO', 'SI')`,
      [colegio_id, alumnoId, doc, pwd]
    );

    res.status(201).json({ alumno_id: alumnoId });
  } catch (e) {
    console.error('POST alumno admin', e);
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'DNI duplicado' });
    }
    res.status(500).json({ error: e.message || 'Error al crear alumno' });
  }
});

router.put('/alumnos/:id', async (req, res) => {
  try {
    const { colegio_id, usuario_id: adminUsuarioId } = req.user;
    const id = parseInt(req.params.id, 10);
    const exist = await query(
      'SELECT id, nro_documento FROM alumnos WHERE id = ? AND colegio_id = ? LIMIT 1',
      [id, colegio_id]
    );
    if (!exist.length) {
      return res.status(404).json({ error: 'No encontrado' });
    }

    const urows = await query(
      "SELECT id, usuario FROM usuarios WHERE alumno_id = ? AND colegio_id = ? AND tipo = 'ALUMNO' LIMIT 1",
      [id, colegio_id]
    );
    const uAl = urows[0];

    const ap = req.body.apellido_paterno != null ? String(req.body.apellido_paterno).trim() : null;
    const am = req.body.apellido_materno != null ? String(req.body.apellido_materno).trim() : null;
    const nom = req.body.nombres != null ? String(req.body.nombres).trim() : null;
    const doc = req.body.nro_documento != null ? String(req.body.nro_documento).trim() : null;
    const fn = req.body.fecha_nacimiento != null ? String(req.body.fecha_nacimiento).slice(0, 10) : null;
    const email = req.body.email != null ? String(req.body.email).trim() : null;
    const usuario_estado = req.body.usuario_estado != null ? String(req.body.usuario_estado).toUpperCase() : null;

    if (doc && doc !== exist[0].nro_documento) {
      const dup = await query(
        'SELECT id FROM alumnos WHERE colegio_id = ? AND nro_documento = ? AND id != ? LIMIT 1',
        [colegio_id, doc, id]
      );
      if (dup.length) {
        return res.status(409).json({ error: 'Otro alumno ya usa ese DNI' });
      }
      if (!(await usuarioLibre(colegio_id, doc, uAl?.id))) {
        return res.status(409).json({ error: 'El DNI ya está en uso como usuario' });
      }
    }

    const sets = [];
    const params = [];
    if (ap != null) {
      sets.push('apellido_paterno = ?');
      params.push(ap);
    }
    if (am != null) {
      sets.push('apellido_materno = ?');
      params.push(am);
    }
    if (nom != null) {
      sets.push('nombres = ?');
      params.push(nom);
    }
    if (doc != null) {
      sets.push('nro_documento = ?');
      params.push(doc);
    }
    if (fn != null) {
      sets.push('fecha_nacimiento = ?');
      params.push(fn);
    }
    if (email != null) {
      sets.push('email = ?');
      params.push(email);
    }
    if (sets.length) {
      params.push(id, colegio_id);
      await execute(`UPDATE alumnos SET ${sets.join(', ')} WHERE id = ? AND colegio_id = ?`, params);
    }

    const nuevoDoc = doc != null ? doc : exist[0].nro_documento;
    if (uAl && doc != null && doc !== uAl.usuario) {
      await execute('UPDATE usuarios SET usuario = ? WHERE id = ? AND colegio_id = ?', [nuevoDoc, uAl.id, colegio_id]);
    }

    if (uAl && (usuario_estado === 'ACTIVO' || usuario_estado === 'INACTIVO')) {
      if (parseInt(uAl.id, 10) === parseInt(adminUsuarioId, 10) && usuario_estado === 'INACTIVO') {
        return res.status(400).json({ error: 'No puede desactivar su propio usuario' });
      }
      await execute('UPDATE usuarios SET estado = ? WHERE id = ? AND colegio_id = ?', [
        usuario_estado,
        uAl.id,
        colegio_id,
      ]);
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('PUT alumno admin', e);
    res.status(500).json({ error: e.message || 'Error al actualizar alumno' });
  }
});

router.put('/alumnos/:id/foto', uploadUsuarioFoto.single('foto'), async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    if (!id) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Debe adjuntar una imagen' });
    }

    const exist = await query('SELECT id FROM alumnos WHERE id = ? AND colegio_id = ? LIMIT 1', [id, colegio_id]);
    if (!exist.length) {
      return res.status(404).json({ error: 'No encontrado' });
    }

    await execute('UPDATE alumnos SET foto = ? WHERE id = ? AND colegio_id = ?', [req.file.filename, id, colegio_id]);
    res.json({ ok: true, foto: req.file.filename });
  } catch (e) {
    console.error('PUT /admin/usuarios/alumnos/:id/foto', e);
    res.status(500).json({ error: e.message || 'Error al actualizar foto' });
  }
});

router.post('/alumnos/:id/reset-password', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const rows = await query(
      `SELECT u.id, a.nro_documento
       FROM usuarios u
       INNER JOIN alumnos a ON a.id = u.alumno_id AND a.colegio_id = u.colegio_id
       WHERE u.alumno_id = ? AND u.colegio_id = ? AND u.tipo = 'ALUMNO' LIMIT 1`,
      [id, colegio_id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Usuario alumno no encontrado' });
    }
    const pwd = sha1Password(rows[0].nro_documento);
    await execute('UPDATE usuarios SET password = ?, cambiar_password = ? WHERE id = ? AND colegio_id = ?', [
      pwd,
      'NO',
      rows[0].id,
      colegio_id,
    ]);
    res.json({ ok: true });
  } catch (e) {
    console.error('reset alumno pwd', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.post('/alumnos/:id/password', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const password = String(req.body.password || '').trim();
    if (!id) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres' });
    }
    const rows = await query(
      `SELECT u.id
       FROM usuarios u
       WHERE u.alumno_id = ? AND u.colegio_id = ? AND u.tipo = 'ALUMNO'
       LIMIT 1`,
      [id, colegio_id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Usuario alumno no encontrado' });
    }
    const pwd = sha1Password(password);
    await execute('UPDATE usuarios SET password = ?, cambiar_password = ? WHERE id = ? AND colegio_id = ?', [
      pwd,
      'NO',
      rows[0].id,
      colegio_id,
    ]);
    res.json({ ok: true });
  } catch (e) {
    console.error('password alumno', e);
    res.status(500).json({ error: e.message || 'Error al cambiar contraseña' });
  }
});

router.post('/alumnos/:id/acceso', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const arows = await query(
      'SELECT id, nro_documento FROM alumnos WHERE id = ? AND colegio_id = ? LIMIT 1',
      [id, colegio_id]
    );
    if (!arows.length) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }
    const tiene = await query(
      "SELECT id FROM usuarios WHERE alumno_id = ? AND colegio_id = ? AND tipo = 'ALUMNO' LIMIT 1",
      [id, colegio_id]
    );
    if (tiene.length) {
      return res.status(409).json({ error: 'El alumno ya tiene usuario' });
    }
    const dni = arows[0].nro_documento;
    if (!(await usuarioLibre(colegio_id, dni))) {
      return res.status(409).json({ error: 'El DNI ya está en uso' });
    }
    const pwd = sha1Password(dni);
    await execute(
      `INSERT INTO usuarios (
         colegio_id, alumno_id, personal_id, apoderado_id, usuario, password, tipo, estado,
         ms_email, ms_access_token, ms_refresh_token, ms_id_token, auth_token, permisos,
         cambiar_password, app_terminos_aceptados, cambiar_datos
       ) VALUES (?, ?, 0, 0, ?, ?, 'ALUMNO', 'ACTIVO', '', '', '', '', '', '', 'NO', 'NO', 'SI')`,
      [colegio_id, id, dni, pwd]
    );
    res.status(201).json({ ok: true });
  } catch (e) {
    console.error('POST alumno acceso', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.get('/alumnos/:id/apoderados', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const ok = await query('SELECT id FROM alumnos WHERE id = ? AND colegio_id = ? LIMIT 1', [id, colegio_id]);
    if (!ok.length) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }
    const rows = await query(
      `SELECT ap.id, ap.nombres, ap.apellido_paterno, ap.apellido_materno, ap.nro_documento,
              ap.email, ap.telefono_celular, ap.parentesco,
              u.id AS usuario_id, u.estado AS usuario_estado
       FROM familias f
       INNER JOIN apoderados ap ON ap.id = f.apoderado_id AND ap.colegio_id = ?
       LEFT JOIN usuarios u ON u.apoderado_id = ap.id AND u.colegio_id = ap.colegio_id
       WHERE f.alumno_id = ?
       ORDER BY ap.apellido_paterno, ap.apellido_materno, ap.nombres`,
      [colegio_id, id]
    );
    res.json({ data: rows });
  } catch (e) {
    console.error('GET alumno apoderados admin', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.get('/alumnos/:id/hermanos', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const ok = await query('SELECT id FROM alumnos WHERE id = ? AND colegio_id = ? LIMIT 1', [id, colegio_id]);
    if (!ok.length) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }
    const rows = await query(
      `SELECT DISTINCT
          s.id,
          s.nombres,
          s.apellido_paterno,
          s.apellido_materno,
          s.nro_documento,
          g.anio,
          g.grado,
          g.seccion,
          n.nombre AS nivel_nombre
       FROM familias f0
       INNER JOIN familias f ON f.apoderado_id = f0.apoderado_id AND f.alumno_id <> f0.alumno_id
       INNER JOIN alumnos s ON s.id = f.alumno_id AND s.colegio_id = ?
       LEFT JOIN matriculas m ON m.id = (
         SELECT m2.id
         FROM matriculas m2
         INNER JOIN grupos g2 ON g2.id = m2.grupo_id AND g2.colegio_id = m2.colegio_id
         WHERE m2.alumno_id = s.id AND m2.colegio_id = s.colegio_id
         ORDER BY (m2.estado = 0 OR m2.estado = 4) DESC, g2.anio DESC, m2.id DESC
         LIMIT 1
       )
       LEFT JOIN grupos g ON g.id = m.grupo_id AND g.colegio_id = s.colegio_id
       LEFT JOIN niveles n ON n.id = g.nivel_id
       WHERE f0.alumno_id = ?
       ORDER BY s.apellido_paterno, s.apellido_materno, s.nombres`,
      [colegio_id, id]
    );
    res.json({ data: rows });
  } catch (e) {
    console.error('GET alumno hermanos admin', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.get('/alumnos/:id/matriculas', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const ok = await query('SELECT id FROM alumnos WHERE id = ? AND colegio_id = ? LIMIT 1', [id, colegio_id]);
    if (!ok.length) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }
    const rows = await query(
      `SELECT m.id AS matricula_id, m.estado, m.costo_id,
              g.anio, g.grado, g.seccion, n.nombre AS nivel_nombre
       FROM matriculas m
       INNER JOIN grupos g ON g.id = m.grupo_id AND g.colegio_id = m.colegio_id
       LEFT JOIN niveles n ON n.id = g.nivel_id
       WHERE m.alumno_id = ? AND m.colegio_id = ?
       ORDER BY g.anio DESC, g.grado ASC, g.seccion ASC`,
      [id, colegio_id]
    );
    res.json({ data: rows });
  } catch (e) {
    console.error('GET alumno matriculas admin', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.get('/alumnos/:id/pagos', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const ok = await query('SELECT id FROM alumnos WHERE id = ? AND colegio_id = ? LIMIT 1', [id, colegio_id]);
    if (!ok.length) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }
    const rows = await query(
      `SELECT p.id, p.matricula_id, p.nro_pago, p.monto, p.mora, p.fecha_hora, p.tipo, p.descripcion,
              p.estado_pago, p.forma_pago, p.estado AS pago_registro_estado,
              g.anio, g.grado, g.seccion
       FROM pagos p
       INNER JOIN matriculas m ON m.id = p.matricula_id AND m.colegio_id = p.colegio_id
       INNER JOIN grupos g ON g.id = m.grupo_id AND g.colegio_id = m.colegio_id
       WHERE m.alumno_id = ? AND m.colegio_id = ?
       ORDER BY g.anio DESC, p.tipo ASC, p.nro_pago ASC, p.id ASC
       LIMIT 500`,
      [id, colegio_id]
    );
    res.json({ data: rows });
  } catch (e) {
    console.error('GET alumno pagos admin', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.delete('/alumnos/:id', async (req, res) => {
  try {
    const { colegio_id, usuario_id: adminUsuarioId } = req.user;
    const id = parseInt(req.params.id, 10);
    const arows = await query(
      'SELECT id FROM alumnos WHERE id = ? AND colegio_id = ? LIMIT 1',
      [id, colegio_id]
    );
    if (!arows.length) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }
    const [mc] = await query(
      'SELECT COUNT(*) AS n FROM matriculas WHERE alumno_id = ? AND colegio_id = ?',
      [id, colegio_id]
    );
    if ((mc?.n || 0) > 0) {
      return res.status(409).json({
        error:
          'No se puede eliminar: el alumno tiene matrículas registradas. Retírelo o anule matrículas desde el sistema académico si aplica.',
      });
    }
    const uAl = await query(
      "SELECT id FROM usuarios WHERE alumno_id = ? AND colegio_id = ? AND tipo = 'ALUMNO'",
      [id, colegio_id]
    );
    for (const u of uAl) {
      if (parseInt(u.id, 10) === parseInt(adminUsuarioId, 10)) {
        return res.status(400).json({ error: 'No puede eliminar su propio usuario vinculado a este alumno.' });
      }
      await execute('DELETE FROM usuarios WHERE id = ? AND colegio_id = ?', [u.id, colegio_id]);
    }
    await execute('DELETE FROM familias WHERE alumno_id = ?', [id]);
    await execute('DELETE FROM alumnos WHERE id = ? AND colegio_id = ?', [id, colegio_id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE alumno admin', e);
    res.status(500).json({ error: e.message || 'Error al eliminar alumno' });
  }
});

// ——— Apoderados ———

/**
 * GET /personal-por-dni?dni=
 * Datos de `personal` para precargar alta de apoderado (mismo DNI en todo el colegio).
 */
router.get('/personal-por-dni', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const dni = String(req.query.dni || '').trim();
    if (!dni) {
      return res.status(400).json({ error: 'Indique el DNI' });
    }
    const rows = await query(
      `SELECT id, nombres, apellidos, nro_documento, email, telefono_celular, fecha_nacimiento
       FROM personal WHERE colegio_id = ? AND TRIM(nro_documento) = ? LIMIT 1`,
      [colegio_id, dni]
    );
    if (!rows.length) {
      return res.json({ encontrado: false });
    }
    const p = rows[0];
    const apParts = String(p.apellidos || '').trim().split(/\s+/).filter(Boolean);
    res.json({
      encontrado: true,
      personal_id: p.id,
      nombres: p.nombres || '',
      apellido_paterno: apParts[0] || '',
      apellido_materno: apParts.slice(1).join(' ') || '',
      nro_documento: String(p.nro_documento || '').trim(),
      email: p.email || '',
      telefono_celular: p.telefono_celular || '',
      fecha_nacimiento: p.fecha_nacimiento ? String(p.fecha_nacimiento).slice(0, 10) : '1985-01-01',
    });
  } catch (e) {
    console.error('GET personal-por-dni', e);
    res.status(500).json({ error: e.message || 'Error al buscar personal' });
  }
});

router.get('/apoderados', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const { page, limit, offset } = parsePageLimit(req);
    const search = (req.query.search || '').trim();

    const whereParts = ['ap.colegio_id = ?'];
    const params = [colegio_id];
    if (search) {
      const like = `%${search.replace(/%/g, '')}%`;
      whereParts.push(
        '(ap.nro_documento LIKE ? OR ap.nombres LIKE ? OR ap.apellido_paterno LIKE ? OR ap.apellido_materno LIKE ?)'
      );
      params.push(like, like, like, like);
    }
    const whereSql = whereParts.join(' AND ');

    const countRows = await query(`SELECT COUNT(*) AS total FROM apoderados ap WHERE ${whereSql}`, params);
    const total = countRows[0]?.total ?? 0;

    const rows = await query(
      `SELECT ap.id, ap.nombres, ap.apellido_paterno, ap.apellido_materno, ap.nro_documento, ap.parentesco, ap.email, ap.telefono_celular,
              COALESCE(u_ap.id, u_per.id) AS usuario_id,
              COALESCE(u_ap.usuario, u_per.usuario) AS login_usuario,
              COALESCE(u_ap.estado, u_per.estado) AS usuario_estado,
              COALESCE(u_ap.tipo, u_per.tipo) AS usuario_tipo
       FROM apoderados ap
       ${SQL_JOIN_USUARIO_APODERADO_OPT}
       WHERE ${whereSql}
       ORDER BY ap.apellido_paterno, ap.apellido_materno, ap.nombres
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    res.json({ data: rows, total, page, limit });
  } catch (e) {
    console.error('GET apoderados admin', e);
    res.status(500).json({ error: e.message || 'Error al listar apoderados' });
  }
});

router.get('/apoderados/:id', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const rows = await query(
      `SELECT ap.*,
              COALESCE(u_ap.id, u_per.id) AS usuario_id,
              COALESCE(u_ap.usuario, u_per.usuario) AS login_usuario,
              COALESCE(u_ap.estado, u_per.estado) AS usuario_estado,
              COALESCE(u_ap.tipo, u_per.tipo) AS usuario_tipo
       FROM apoderados ap
       ${SQL_JOIN_USUARIO_APODERADO_OPT}
       WHERE ap.id = ? AND ap.colegio_id = ?
       LIMIT 1`,
      [id, colegio_id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'No encontrado' });
    }
    res.json(rows[0]);
  } catch (e) {
    console.error('GET apoderado admin', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.post('/apoderados', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const nom = String(req.body.nombres || '').trim();
    const ap = String(req.body.apellido_paterno || '').trim();
    const am = String(req.body.apellido_materno || '').trim();
    const doc = String(req.body.nro_documento || '').trim();
    const fn = req.body.fecha_nacimiento || '1980-01-01';
    if (!nom || !ap || !doc) {
      return res.status(400).json({ error: 'Nombres, apellido paterno y DNI son obligatorios' });
    }

    const dup = await query(
      'SELECT id FROM apoderados WHERE colegio_id = ? AND nro_documento = ? LIMIT 1',
      [colegio_id, doc]
    );
    if (dup.length) {
      return res.status(409).json({ error: 'Ya existe apoderado con ese DNI' });
    }

    const email = String(req.body.email || '').trim();
    const tel = String(req.body.telefono_celular || '').trim();
    const parentesco = parseInt(req.body.parentesco, 10) || 1;

    await execute(
      `INSERT INTO apoderados (
        colegio_id, nombres, apellido_paterno, apellido_materno, vive, tipo_documento, nro_documento, estado_civil,
        telefono_fijo, telefono_celular, direccion, centro_trabajo_direccion, grado_instruccion, ocupacion, parentesco,
        vive_con_estudiante, fecha_nacimiento, pais_nacimiento_id, email, firma_digital
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        colegio_id,
        nom,
        ap,
        am,
        'SI',
        1,
        doc,
        0,
        '',
        tel,
        '',
        '',
        0,
        '',
        parentesco,
        'SI',
        fn.slice(0, 10),
        0,
        email,
        '',
      ]
    );

    const [last] = await query(
      'SELECT id FROM apoderados WHERE colegio_id = ? AND nro_documento = ? ORDER BY id DESC LIMIT 1',
      [colegio_id, doc]
    );
    const apoderadoId = last?.id;
    if (!apoderadoId) {
      return res.status(500).json({ error: 'No se pudo crear apoderado' });
    }

    const existU = await query(
      'SELECT id, tipo, personal_id, apoderado_id, alumno_id FROM usuarios WHERE colegio_id = ? AND TRIM(usuario) = ? LIMIT 1',
      [colegio_id, doc]
    );

    if (!existU.length) {
      const pwd = sha1Password(doc);
      await execute(
        `INSERT INTO usuarios (
           colegio_id, alumno_id, personal_id, apoderado_id, usuario, password, tipo, estado,
           ms_email, ms_access_token, ms_refresh_token, ms_id_token, auth_token, permisos,
           cambiar_password, app_terminos_aceptados, cambiar_datos
         ) VALUES (?, 0, 0, ?, ?, ?, 'APODERADO', 'ACTIVO', '', '', '', '', '', '', 'NO', 'NO', 'SI')`,
        [colegio_id, apoderadoId, doc, pwd]
      );
      return res.status(201).json({
        apoderado_id: apoderadoId,
        usuario_compartido: false,
      });
    }

    const u = existU[0];
    const pid = parseInt(u.personal_id, 10) || 0;
    const aid = parseInt(u.apoderado_id, 10) || 0;
    const alumnoId = parseInt(u.alumno_id, 10) || 0;

    if (alumnoId > 0) {
      return res.status(409).json({ error: 'Este DNI ya está en uso como alumno' });
    }

    if (u.tipo === 'APODERADO' && pid === 0) {
      return res.status(409).json({
        error: 'Ya existe un usuario solo apoderado con este DNI. No se puede duplicar.',
      });
    }

    if (pid > 0) {
      if (aid > 0 && aid !== apoderadoId) {
        return res.status(409).json({
          error: 'Este usuario de personal ya está vinculado a otra ficha de apoderado.',
        });
      }
      await execute('UPDATE usuarios SET apoderado_id = ? WHERE id = ? AND colegio_id = ?', [
        apoderadoId,
        u.id,
        colegio_id,
      ]);
      return res.status(201).json({
        apoderado_id: apoderadoId,
        usuario_compartido: true,
        usuario_tipo: u.tipo,
        mensaje:
          'Ficha de apoderado creada. El mismo DNI usa la cuenta de personal/docente; no se creó un segundo usuario.',
      });
    }

    return res.status(409).json({ error: 'El DNI ya está en uso en otra cuenta del sistema' });
  } catch (e) {
    console.error('POST apoderado admin', e);
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Duplicado' });
    }
    res.status(500).json({ error: e.message || 'Error al crear apoderado' });
  }
});

router.put('/apoderados/:id', async (req, res) => {
  try {
    const { colegio_id, usuario_id: adminUsuarioId } = req.user;
    const id = parseInt(req.params.id, 10);
    const exist = await query(
      'SELECT id, nro_documento FROM apoderados WHERE id = ? AND colegio_id = ? LIMIT 1',
      [id, colegio_id]
    );
    if (!exist.length) {
      return res.status(404).json({ error: 'No encontrado' });
    }

    const uAp = await resolverUsuarioFilaParaApoderado(colegio_id, id);

    const nom = req.body.nombres != null ? String(req.body.nombres).trim() : null;
    const ap = req.body.apellido_paterno != null ? String(req.body.apellido_paterno).trim() : null;
    const am = req.body.apellido_materno != null ? String(req.body.apellido_materno).trim() : null;
    const doc = req.body.nro_documento != null ? String(req.body.nro_documento).trim() : null;
    const email = req.body.email != null ? String(req.body.email).trim() : null;
    const tel = req.body.telefono_celular != null ? String(req.body.telefono_celular) : null;
    const parentesco = req.body.parentesco != null ? parseInt(req.body.parentesco, 10) : null;
    const usuario_estado = req.body.usuario_estado != null ? String(req.body.usuario_estado).toUpperCase() : null;

    if (doc && doc !== exist[0].nro_documento) {
      const dup = await query(
        'SELECT id FROM apoderados WHERE colegio_id = ? AND nro_documento = ? AND id != ? LIMIT 1',
        [colegio_id, doc, id]
      );
      if (dup.length) {
        return res.status(409).json({ error: 'Otro apoderado usa ese DNI' });
      }
      if (!(await usuarioLibre(colegio_id, doc, uAp?.id))) {
        return res.status(409).json({ error: 'El DNI ya está en uso' });
      }
    }

    const sets = [];
    const params = [];
    if (nom != null) {
      sets.push('nombres = ?');
      params.push(nom);
    }
    if (ap != null) {
      sets.push('apellido_paterno = ?');
      params.push(ap);
    }
    if (am != null) {
      sets.push('apellido_materno = ?');
      params.push(am);
    }
    if (doc != null) {
      sets.push('nro_documento = ?');
      params.push(doc);
    }
    if (email != null) {
      sets.push('email = ?');
      params.push(email);
    }
    if (tel != null) {
      sets.push('telefono_celular = ?');
      params.push(tel);
    }
    if (parentesco != null && !Number.isNaN(parentesco)) {
      sets.push('parentesco = ?');
      params.push(parentesco);
    }
    if (sets.length) {
      params.push(id, colegio_id);
      await execute(`UPDATE apoderados SET ${sets.join(', ')} WHERE id = ? AND colegio_id = ?`, params);
    }

    const nuevoDoc = doc != null ? doc : exist[0].nro_documento;
    if (uAp) {
      if (doc != null && doc !== uAp.usuario) {
        await execute('UPDATE usuarios SET usuario = ? WHERE id = ? AND colegio_id = ?', [nuevoDoc, uAp.id, colegio_id]);
      }
      if (usuario_estado === 'ACTIVO' || usuario_estado === 'INACTIVO') {
        if (parseInt(uAp.id, 10) === parseInt(adminUsuarioId, 10) && usuario_estado === 'INACTIVO') {
          return res.status(400).json({ error: 'No puede desactivar su propio usuario' });
        }
        await execute('UPDATE usuarios SET estado = ? WHERE id = ? AND colegio_id = ?', [
          usuario_estado,
          uAp.id,
          colegio_id,
        ]);
      }
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('PUT apoderado admin', e);
    res.status(500).json({ error: e.message || 'Error al actualizar' });
  }
});

router.post('/apoderados/:id/reset-password', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const urow = await resolverUsuarioFilaParaApoderado(colegio_id, id);
    if (!urow || !urow.id) {
      return res.status(404).json({ error: 'Usuario no encontrado para este apoderado' });
    }
    const apRows = await query('SELECT nro_documento FROM apoderados WHERE id = ? AND colegio_id = ? LIMIT 1', [
      id,
      colegio_id,
    ]);
    const dni = String(apRows[0]?.nro_documento || '').trim();
    if (!dni) {
      return res.status(404).json({ error: 'Apoderado no encontrado' });
    }
    const pwd = sha1Password(dni);
    await execute('UPDATE usuarios SET password = ?, cambiar_password = ? WHERE id = ? AND colegio_id = ?', [
      pwd,
      'NO',
      urow.id,
      colegio_id,
    ]);
    res.json({ ok: true });
  } catch (e) {
    console.error('reset apoderado pwd', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.post('/apoderados/:id/acceso', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const id = parseInt(req.params.id, 10);
    const arows = await query('SELECT id, nro_documento FROM apoderados WHERE id = ? AND colegio_id = ? LIMIT 1', [
      id,
      colegio_id,
    ]);
    if (!arows.length) {
      return res.status(404).json({ error: 'No encontrado' });
    }
    const dni = String(arows[0].nro_documento || '').trim();

    const uLinked = await query(
      'SELECT id FROM usuarios WHERE colegio_id = ? AND apoderado_id = ? LIMIT 1',
      [colegio_id, id]
    );
    if (uLinked.length) {
      return res.status(409).json({ error: 'Ya tiene acceso vinculado (apoderado_id)' });
    }

    const urow = await resolverUsuarioFilaParaApoderado(colegio_id, id);
    if (urow && urow.id) {
      const aid = parseInt(urow.apoderado_id, 10) || 0;
      if (aid > 0 && aid !== id) {
        return res.status(409).json({ error: 'El usuario con este DNI ya está vinculado a otro apoderado' });
      }
      await execute('UPDATE usuarios SET apoderado_id = ? WHERE id = ? AND colegio_id = ?', [id, urow.id, colegio_id]);
      return res.status(201).json({ ok: true, usuario_compartido: true });
    }

    if (!(await usuarioLibre(colegio_id, dni))) {
      return res.status(409).json({ error: 'DNI en uso' });
    }
    const pwd = sha1Password(dni);
    await execute(
      `INSERT INTO usuarios (
         colegio_id, alumno_id, personal_id, apoderado_id, usuario, password, tipo, estado,
         ms_email, ms_access_token, ms_refresh_token, ms_id_token, auth_token, permisos,
         cambiar_password, app_terminos_aceptados, cambiar_datos
       ) VALUES (?, 0, 0, ?, ?, ?, 'APODERADO', 'ACTIVO', '', '', '', '', '', '', 'NO', 'NO', 'SI')`,
      [colegio_id, id, dni, pwd]
    );
    res.status(201).json({ ok: true, usuario_compartido: false });
  } catch (e) {
    console.error('POST apoderado acceso', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

module.exports = router;
