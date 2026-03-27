/**
 * CRUD de usuarios para administrador: equipo (personal + perfiles), alumnos, apoderados.
 * Montaje: /api/admin/usuarios
 * Autenticación: solo ADMINISTRADOR.
 * Convención: usuario y contraseña inicial = DNI (password en BD como SHA1).
 */
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { query, execute } = require('../utils/mysql');
const { authenticateToken } = require('../middleware/auth');

const TIPOS_EQUIPO = [
  'ADMINISTRADOR',
  'DIRECTOR',
  'DOCENTE',
  'AUXILIAR',
  'SECRETARIA',
  'CAJERO',
  'ENFERMERA',
  'PROMOTORIA',
  'COORDINADOR',
  'PSICOLOGA',
  'PERSONALIZADO',
  'ASISTENCIA',
  'CONTADOR',
  'TUTOR',
  'MANTENIMIENTO',
];
const TIPOS_EQUIPO_SET = new Set(TIPOS_EQUIPO);

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

function parsePageLimit(req) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, Math.max(5, parseInt(req.query.limit, 10) || 50));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
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

// ——— Equipo (tabla personal + usuarios) ———

router.get('/equipo/tipos', (req, res) => {
  res.json({ tipos: TIPOS_EQUIPO });
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

    if (perfil && TIPOS_EQUIPO_SET.has(perfil)) {
      whereParts.push('u.tipo = ?');
      params.push(perfil);
    }

    const whereSql = whereParts.join(' AND ');

    const countRows = await query(
      `SELECT COUNT(*) AS total
       FROM personal p
       LEFT JOIN usuarios u ON u.personal_id = p.id AND u.colegio_id = p.colegio_id
       WHERE ${whereSql}`,
      params
    );
    const total = countRows[0]?.total ?? 0;

    const listParams = [...params, limit, offset];
    const rows = await query(
      `SELECT p.id, p.nombres, p.apellidos, p.nro_documento, p.email, p.telefono_celular, p.cargo,
              p.foto, p.fecha_nacimiento,
              u.id AS usuario_id, u.tipo AS usuario_tipo, u.estado AS usuario_estado, u.usuario AS login_usuario
       FROM personal p
       LEFT JOIN usuarios u ON u.personal_id = p.id AND u.colegio_id = p.colegio_id
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
    const { colegio_id } = req.user;
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
    res.json(rows[0]);
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

router.post('/equipo', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const tipo = String(req.body.tipo || '').toUpperCase();
    if (!TIPOS_EQUIPO_SET.has(tipo)) {
      return res.status(400).json({ error: 'Tipo de usuario no válido para personal' });
    }
    const d = defaultsNuevoPersonal(colegio_id, req.body);
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
        if (!TIPOS_EQUIPO_SET.has(nuevoTipo)) {
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

router.post('/equipo/:personalId/acceso', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const personalId = parseInt(req.params.personalId, 10);
    const tipo = String(req.body.tipo || 'DOCENTE').toUpperCase();
    if (!TIPOS_EQUIPO_SET.has(tipo)) {
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
    res.json(rows[0]);
  } catch (e) {
    console.error('GET alumno admin', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

router.post('/alumnos', async (req, res) => {
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
        ALUMNO_DEFAULTS.foto,
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

// ——— Apoderados ———

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
              u.id AS usuario_id, u.usuario AS login_usuario, u.estado AS usuario_estado
       FROM apoderados ap
       LEFT JOIN usuarios u ON u.apoderado_id = ap.id AND u.colegio_id = ap.colegio_id AND u.tipo = 'APODERADO'
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
      `SELECT ap.*, u.id AS usuario_id, u.usuario AS login_usuario, u.estado AS usuario_estado
       FROM apoderados ap
       LEFT JOIN usuarios u ON u.apoderado_id = ap.id AND u.colegio_id = ap.colegio_id AND u.tipo = 'APODERADO'
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
    if (!(await usuarioLibre(colegio_id, doc))) {
      return res.status(409).json({ error: 'El DNI ya está en uso como usuario' });
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

    const pwd = sha1Password(doc);
    await execute(
      `INSERT INTO usuarios (
         colegio_id, alumno_id, personal_id, apoderado_id, usuario, password, tipo, estado,
         ms_email, ms_access_token, ms_refresh_token, ms_id_token, auth_token, permisos,
         cambiar_password, app_terminos_aceptados, cambiar_datos
       ) VALUES (?, 0, 0, ?, ?, ?, 'APODERADO', 'ACTIVO', '', '', '', '', '', '', 'NO', 'NO', 'SI')`,
      [colegio_id, apoderadoId, doc, pwd]
    );

    res.status(201).json({ apoderado_id: apoderadoId });
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

    const urows = await query(
      "SELECT id, usuario FROM usuarios WHERE apoderado_id = ? AND colegio_id = ? AND tipo = 'APODERADO' LIMIT 1",
      [id, colegio_id]
    );
    const uAp = urows[0];

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
    const rows = await query(
      `SELECT u.id, ap.nro_documento
       FROM usuarios u
       INNER JOIN apoderados ap ON ap.id = u.apoderado_id AND ap.colegio_id = u.colegio_id
       WHERE u.apoderado_id = ? AND u.colegio_id = ? AND u.tipo = 'APODERADO' LIMIT 1`,
      [id, colegio_id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
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
    const tiene = await query(
      "SELECT id FROM usuarios WHERE apoderado_id = ? AND colegio_id = ? AND tipo = 'APODERADO' LIMIT 1",
      [id, colegio_id]
    );
    if (tiene.length) {
      return res.status(409).json({ error: 'Ya tiene acceso' });
    }
    const dni = arows[0].nro_documento;
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
    res.status(201).json({ ok: true });
  } catch (e) {
    console.error('POST apoderado acceso', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

module.exports = router;
