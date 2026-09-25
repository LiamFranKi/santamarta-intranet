/**
 * Matrícula online pública — sistema.vanguard (sin login).
 * Montaje: /api/public/matricula-online
 */
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const router = express.Router();
const { query, mysqlReadPool } = require('../utils/mysql');
const { DEFAULT_COLEGIO_ID, DEFAULT_SEDE_ID } = require('../utils/defaultColegio');
const { ensureGrupoConn } = require('../utils/matriculaGrupoCosto');
const { MATRICULA_ESTADO } = require('../utils/matriculaEstados');
const { SEGURO_OPCIONES, esSeguroIdValido } = require('../utils/seguroOpciones');
const { enviarEmailsMatriculaOnline, gradoLabel } = require('../utils/matriculaOnlineEmail');
const { staticFsSubdir, getPublicStaticBaseUrl } = require('../utils/staticStorage');
const { fechaMySQLLima } = require('../utils/fechaHoraLima');

function resolverAniosMatricula(colegio) {
  const anioMatriculas = parseInt(colegio?.anio_matriculas, 10);
  const anioDisplay =
    Number.isFinite(anioMatriculas) && anioMatriculas > 0 ? anioMatriculas : new Date().getFullYear();
  return { anioDisplay, anioSistema: anioDisplay + 1 };
}

function gradosValidos(nivelNombre) {
  const n = String(nivelNombre || '').toUpperCase();
  if (n.includes('INICIAL')) return [3, 4, 5];
  if (n.includes('SECUND')) return [1, 2, 3, 4, 5];
  return [1, 2, 3, 4, 5, 6];
}

const TIPOS_DOCUMENTO = [
  { id: 0, label: 'DNI' },
  { id: 1, label: 'Pasaporte' },
  { id: 2, label: 'Partida de Nacimiento' },
  { id: 3, label: 'Libreta Electoral' },
  { id: 4, label: 'Libreta Militar' },
  { id: 5, label: 'Carnet de Extranjeria' },
  { id: 6, label: 'Licencia de Conducir' },
  { id: 7, label: 'Tarjeta de Seguro' },
  { id: 8, label: 'Otro' },
];

function tipoDocumentoValido(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0 || n > 8) return 0;
  return n;
}

const ALUMNO_DEFAULTS = {
  estado_civil: 0,
  tipo_documento: 0,
  pais_nacimiento_id: 0,
  departamento_nacimiento_id: 0,
  provincia_nacimiento_id: 0,
  distrito_nacimiento_id: 0,
  foto: '',
  observaciones: '',
  nro_hermanos: 0,
  lugar_hermanos: 0,
  religion: 0,
  lengua_materna: 0,
  segunda_lengua: 0,
  discapacidad: '',
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
};

const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'foto_dni') {
      cb(null, staticFsSubdir('Documentos'));
    } else {
      cb(null, staticFsSubdir('Archivos'));
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '') || (file.fieldname === 'firma' ? '.png' : '.jpg');
    const prefix = file.fieldname === 'foto_dni' ? 'matricula-dni' : 'matricula-firma';
    cb(null, `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
  },
});

const uploadMatricula = multer({
  storage: uploadStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(jpeg|jpg|png|webp|gif)$/i.test(file.mimetype || '');
    if (!ok) return cb(new Error('Solo se permiten imágenes (JPG, PNG)'));
    cb(null, true);
  },
});

async function loadConfigMatricula() {
  const colegio_id = DEFAULT_COLEGIO_ID;
  const [colegio] = await query(
    `SELECT id, titulo_intranet, anio_matriculas FROM colegios WHERE id = ? LIMIT 1`,
    [colegio_id]
  );
  const configRows = await query(
    `SELECT clave, valor FROM config WHERE clave IN (
      'enable_enrollment_form', 'titulo_formulario_matricula', 'remitente_emails',
      'email_notificacion_matricula_online', 'email_matricula_apoderado',
      'email_matricula_interno', 'email_matricula_interno_asunto',
      'matricula_online_personal_ids', 'matricula_fondo'
    )`
  );
  const configMap = {};
  for (const r of configRows || []) {
    configMap[r.clave] = r.valor;
  }
  return { colegio_id, colegio: colegio || {}, configMap };
}

async function resolverTurnoMananaConn(conn, colegio_id) {
  let [rows] = await conn.execute(
    `SELECT id FROM turnos WHERE colegio_id = ? AND (
      UPPER(TRIM(nombre)) LIKE '%MAÑANA%' OR UPPER(TRIM(nombre)) LIKE '%MANANA%'
    ) ORDER BY id ASC LIMIT 1`,
    [colegio_id]
  );
  if (!rows.length) {
    [rows] = await conn.execute(
      `SELECT id FROM turnos WHERE (
        UPPER(TRIM(nombre)) LIKE '%MAÑANA%' OR UPPER(TRIM(nombre)) LIKE '%MANANA%'
      ) ORDER BY id ASC LIMIT 1`
    );
  }
  if (!rows.length) {
    const err = new Error('Turno MAÑANA no está configurado en el sistema. Contacte al colegio.');
    err.status = 503;
    throw err;
  }
  return rows[0].id;
}

async function documentosMatricula(colegio_id) {
  const docs = await query(
    `SELECT d.id, d.titulo, d.ruta_almacenamiento, d.nombre_archivo_original
     FROM institucional_documentos d
     INNER JOIN institucional_categorias c ON c.id = d.categoria_id AND c.colegio_id = d.colegio_id
     WHERE d.colegio_id = ? AND d.activo = 1
       AND (UPPER(TRIM(c.nombre)) LIKE '%MATRICUL%' OR UPPER(TRIM(c.nombre)) = 'MATRICULA')
     ORDER BY c.orden ASC, d.created_at ASC`,
    [colegio_id]
  );
  return (docs || []).map((d) => ({
    id: d.id,
    titulo: d.titulo,
    archivo_url: `/uploads/${d.ruta_almacenamiento}`,
    nombre_archivo_original: d.nombre_archivo_original,
  }));
}

async function ultimoCostoIdAlumno(conn, alumnoId, colegio_id) {
  const [rows] = await conn.execute(
    `SELECT m.costo_id FROM matriculas m
     WHERE m.alumno_id = ? AND m.colegio_id = ? AND m.costo_id IS NOT NULL AND m.costo_id > 0
     ORDER BY m.fecha_registro DESC, m.id DESC LIMIT 1`,
    [alumnoId, colegio_id]
  );
  const cid = rows[0]?.costo_id;
  return cid != null && Number(cid) > 0 ? Number(cid) : 0;
}

async function matriculaDuplicadaAnio(conn, alumnoId, colegio_id, anio) {
  const [rows] = await conn.execute(
    `SELECT m.id FROM matriculas m
     INNER JOIN grupos g ON g.id = m.grupo_id AND g.colegio_id = m.colegio_id
     WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ?
     LIMIT 1`,
    [alumnoId, colegio_id, anio]
  );
  return rows.length > 0;
}

/**
 * GET / — catálogo público (formulario habilitado, niveles, documentos, seguros).
 */
router.get('/', async (req, res) => {
  try {
    const { colegio_id, colegio, configMap } = await loadConfigMatricula();
    const habilitado = String(configMap.enable_enrollment_form || 'NO').trim().toUpperCase() === 'SI';
    const { anioDisplay } = resolverAniosMatricula(colegio);

    const niveles = await query('SELECT id, nombre FROM niveles WHERE colegio_id = ? ORDER BY id ASC', [colegio_id]);
    const documentos = habilitado ? await documentosMatricula(colegio_id) : [];

    res.json({
      habilitado,
      titulo: configMap.titulo_formulario_matricula || 'Matrícula online',
      fondo_url: configMap.matricula_fondo
        ? `${getPublicStaticBaseUrl()}/Static/Image/Fondos/${configMap.matricula_fondo}`
        : null,
      colegio_nombre: colegio.titulo_intranet || configMap.remitente_emails || 'Vanguard Schools',
      /** Año Matrículas de configuración (visible en formulario y correos). */
      anio_matricula: anioDisplay,
      niveles: niveles || [],
      documentos,
      seguros: SEGURO_OPCIONES,
      tipos_documento: TIPOS_DOCUMENTO,
      url_publica: 'https://sistema.vanguardschools.edu.pe/matricula_online',
      parentesco: [
        { id: 1, label: 'Padre / tutor' },
        { id: 2, label: 'Madre' },
        { id: 3, label: 'Hermano / otro familiar' },
        { id: 4, label: 'Otro apoderado' },
      ],
    });
  } catch (e) {
    console.error('[matricula-online GET]', e);
    res.status(500).json({ error: e.message || 'Error al cargar formulario' });
  }
});

function fechaFormulario(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

function filaAlumno(row) {
  if (!row) return null;
  return {
    tipo_documento: tipoDocumentoValido(row.tipo_documento),
    nro_documento: String(row.nro_documento || '').trim(),
    apellido_paterno: row.apellido_paterno || '',
    apellido_materno: row.apellido_materno || '',
    nombres: row.nombres || '',
    sexo: (() => {
      const s = parseInt(row.sexo, 10);
      if (s === 0 || s === 1) return s;
      if (s === 2) return 0;
      return '';
    })(),
    fecha_nacimiento: fechaFormulario(row.fecha_nacimiento),
    email: row.email || '',
    domicilio: row.domicilio || '',
    seguro_id: row.seguro_id ? String(row.seguro_id) : '',
  };
}

function siguientePostulacion(nivelNombre, grado) {
  const n = String(nivelNombre || '').toUpperCase();
  const g = parseInt(grado, 10);
  if (!Number.isFinite(g)) return null;
  if (n.includes('INICIAL')) {
    if (g === 3) return { clave: 'INICIAL', grado: 4 };
    if (g === 4) return { clave: 'INICIAL', grado: 5 };
    if (g === 5) return { clave: 'PRIMARIA', grado: 1 };
  }
  if (n.includes('PRIM')) {
    if (g >= 1 && g <= 5) return { clave: 'PRIMARIA', grado: g + 1 };
    if (g === 6) return { clave: 'SECUNDARIA', grado: 1 };
  }
  if (n.includes('SECUND')) {
    if (g >= 1 && g <= 4) return { clave: 'SECUNDARIA', grado: g + 1 };
  }
  return null;
}

function nivelPorClave(niveles, clave) {
  return (niveles || []).find((nv) => {
    const nombre = String(nv.nombre || '').toUpperCase();
    if (clave === 'INICIAL') return nombre.includes('INICIAL');
    if (clave === 'PRIMARIA') return nombre.includes('PRIM');
    if (clave === 'SECUNDARIA') return nombre.includes('SECUND');
    return false;
  });
}

function filaApoderado(row) {
  if (!row) return null;
  let parentesco = parseInt(row.parentesco, 10);
  if (!Number.isFinite(parentesco) || parentesco < 1 || parentesco > 4) parentesco = 1;
  return {
    tipo_documento: tipoDocumentoValido(row.tipo_documento),
    nro_documento: String(row.nro_documento || '').trim(),
    apellido_paterno: row.apellido_paterno || '',
    apellido_materno: row.apellido_materno || '',
    nombres: row.nombres || '',
    parentesco,
    fecha_nacimiento: fechaFormulario(row.fecha_nacimiento),
    email: row.email || '',
    telefono_celular: row.telefono_celular || '',
    direccion: row.direccion || '',
  };
}

/**
 * GET /dni/:numero — busca en la base del colegio (alumnos y apoderados ya registrados).
 * No consulta RENIEC. Si no existe, el formulario se llena a mano.
 */
router.get('/dni/:numero', async (req, res) => {
  const numero = String(req.params.numero || '').trim();
  if (numero.length < 6 || numero.length > 20) {
    return res.json({ encontrado: false });
  }
  try {
    const colegio_id = DEFAULT_COLEGIO_ID;
    const [alumno] = await query(
      `SELECT id, tipo_documento, nro_documento, apellido_paterno, apellido_materno, nombres,
              sexo, email, domicilio, fecha_nacimiento, seguro_id
       FROM alumnos
       WHERE colegio_id = ? AND TRIM(nro_documento) = ?
       LIMIT 1`,
      [colegio_id, numero]
    );
    let apoderado = null;
    if (alumno) {
      const [ap] = await query(
        `SELECT ap.tipo_documento, ap.nro_documento, ap.apellido_paterno, ap.apellido_materno, ap.nombres,
                ap.email, ap.telefono_celular, ap.direccion, ap.parentesco, ap.fecha_nacimiento
         FROM familias f
         INNER JOIN apoderados ap ON ap.id = f.apoderado_id AND ap.colegio_id = ?
         WHERE f.alumno_id = ?
         ORDER BY ap.parentesco ASC, ap.id ASC
         LIMIT 1`,
        [colegio_id, alumno.id]
      );
      apoderado = ap || null;
    }
    let postulacion = null;
    if (alumno) {
      const [ultima] = await query(
        `SELECT g.grado, n.nombre AS nivel_nombre
         FROM matriculas m
         INNER JOIN grupos g ON g.id = m.grupo_id
         INNER JOIN niveles n ON n.id = g.nivel_id
         WHERE m.alumno_id = ? AND m.colegio_id = ? AND m.estado NOT IN (2, 3)
         ORDER BY g.anio DESC, m.id DESC
         LIMIT 1`,
        [alumno.id, colegio_id]
      );
      if (ultima) {
        const sig = siguientePostulacion(ultima.nivel_nombre, ultima.grado);
        const niveles = await query(
          'SELECT id, nombre FROM niveles WHERE colegio_id = ? ORDER BY id ASC',
          [colegio_id]
        );
        const nivel = sig ? nivelPorClave(niveles, sig.clave) : null;
        if (nivel) postulacion = { nivel_id: nivel.id, grado: sig.grado };
      }
    }
    if (!apoderado) {
      const [apDirecto] = await query(
        `SELECT tipo_documento, nro_documento, apellido_paterno, apellido_materno, nombres,
                email, telefono_celular, direccion, parentesco, fecha_nacimiento
         FROM apoderados
         WHERE colegio_id = ? AND TRIM(nro_documento) = ?
         LIMIT 1`,
        [colegio_id, numero]
      );
      apoderado = apDirecto || null;
    }
    if (!alumno && !apoderado) {
      return res.json({ encontrado: false });
    }
    return res.json({
      encontrado: true,
      alumno: filaAlumno(alumno),
      apoderado: filaApoderado(apoderado),
      postulacion,
    });
  } catch (e) {
    console.error('[matricula-online dni]', e);
    return res.json({ encontrado: false });
  }
});

/**
 * POST / — registrar matrícula online (multipart: payload JSON + foto_dni + firma).
 */
router.post('/', uploadMatricula.fields([{ name: 'foto_dni', maxCount: 1 }, { name: 'firma', maxCount: 1 }]), async (req, res) => {
  const colegio_id = DEFAULT_COLEGIO_ID;

  try {
    const { colegio, configMap } = await loadConfigMatricula();
    if (String(configMap.enable_enrollment_form || 'NO').trim().toUpperCase() !== 'SI') {
      return res.status(403).json({ error: 'El formulario de matrícula online no está habilitado.' });
    }

    let payload = {};
    try {
      payload = JSON.parse(req.body.payload || '{}');
    } catch {
      return res.status(400).json({ error: 'Datos del formulario inválidos' });
    }

    const alumnoIn = payload.alumno || {};
    const apoderadoIn = payload.apoderado || {};
    const docsAceptados = Array.isArray(payload.documentos_aceptados) ? payload.documentos_aceptados : [];

    const dniAl = String(alumnoIn.nro_documento || '').trim();
    const ap = String(alumnoIn.apellido_paterno || '').trim();
    const am = String(alumnoIn.apellido_materno || '').trim();
    const nom = String(alumnoIn.nombres || '').trim();
    const fn = String(alumnoIn.fecha_nacimiento || '').slice(0, 10);
    const sexoAl = parseInt(alumnoIn.sexo, 10);
    const emailAl = String(alumnoIn.email || '').trim();
    const domicilioAl = String(alumnoIn.domicilio || '').trim();
    const tipoDocAl = tipoDocumentoValido(alumnoIn.tipo_documento);
    const seguroId = parseInt(alumnoIn.seguro_id, 10);
    const nivelId = parseInt(payload.nivel_id, 10);
    const grado = parseInt(payload.grado, 10);

    const dniAp = String(apoderadoIn.nro_documento || '').trim();
    const apAp = String(apoderadoIn.apellido_paterno || '').trim();
    const amAp = String(apoderadoIn.apellido_materno || '').trim();
    const nomAp = String(apoderadoIn.nombres || '').trim();
    const emailAp = String(apoderadoIn.email || '').trim();
    const telAp = String(apoderadoIn.telefono_celular || '').trim();
    const dirAp = String(apoderadoIn.direccion || '').trim();
    const tipoDocAp = tipoDocumentoValido(apoderadoIn.tipo_documento);
    const fnAp = String(apoderadoIn.fecha_nacimiento || '').slice(0, 10);
    let parentesco = parseInt(apoderadoIn.parentesco, 10);
    if (Number.isNaN(parentesco) || parentesco < 1 || parentesco > 4) parentesco = 1;

    const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
    const fechaOk = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '').slice(0, 10));

    if (!dniAl) return res.status(400).json({ error: 'Indique el DNI / código del alumno.' });
    if (!ap) return res.status(400).json({ error: 'Indique el apellido paterno del alumno.' });
    if (!am) return res.status(400).json({ error: 'Indique el apellido materno del alumno.' });
    if (!nom) return res.status(400).json({ error: 'Indique los nombres del alumno.' });
    if (!fechaOk(fn)) return res.status(400).json({ error: 'Indique la fecha de nacimiento del alumno.' });
    if (sexoAl !== 0 && sexoAl !== 1) {
      return res.status(400).json({ error: 'Seleccione el sexo del alumno.' });
    }
    if (!esSeguroIdValido(seguroId)) {
      return res.status(400).json({ error: 'Seleccione el tipo de seguro del alumno.' });
    }
    if (!emailAl) return res.status(400).json({ error: 'Indique el correo electrónico del alumno.' });
    if (!emailOk(emailAl)) return res.status(400).json({ error: 'Correo electrónico del alumno no válido.' });
    if (!domicilioAl) return res.status(400).json({ error: 'Indique el domicilio del alumno.' });
    if (!Number.isFinite(nivelId) || !Number.isFinite(grado)) {
      return res.status(400).json({ error: 'Seleccione nivel y grado a postular.' });
    }
    if (!dniAp) return res.status(400).json({ error: 'Indique el DNI del apoderado.' });
    if (!apAp) return res.status(400).json({ error: 'Indique el apellido paterno del apoderado.' });
    if (!amAp) return res.status(400).json({ error: 'Indique el apellido materno del apoderado.' });
    if (!nomAp) return res.status(400).json({ error: 'Indique los nombres del apoderado.' });
    if (!fechaOk(fnAp)) return res.status(400).json({ error: 'Indique la fecha de nacimiento del apoderado.' });
    if (!emailAp) return res.status(400).json({ error: 'Indique el correo del apoderado.' });
    if (!emailOk(emailAp)) return res.status(400).json({ error: 'Correo del apoderado no válido.' });
    if (!telAp) return res.status(400).json({ error: 'Indique el teléfono celular del apoderado.' });
    if (!dirAp) return res.status(400).json({ error: 'Indique la dirección del apoderado.' });
    if (!req.files?.foto_dni?.[0]) {
      return res.status(400).json({ error: 'Debe adjuntar la foto del DNI del alumno.' });
    }
    if (!req.files?.firma?.[0]) {
      return res.status(400).json({ error: 'Debe firmar en el recuadro de firma.' });
    }

    const documentosReq = await documentosMatricula(colegio_id);
    const idsReq = new Set(documentosReq.map((d) => d.id));
    const idsAcept = new Set(docsAceptados.map((id) => parseInt(id, 10)).filter((n) => Number.isFinite(n)));
    for (const id of idsReq) {
      if (!idsAcept.has(id)) {
        return res.status(400).json({ error: 'Debe aceptar todos los documentos institucionales.' });
      }
    }

    const { anioDisplay, anioSistema } = resolverAniosMatricula(colegio);
    const hoy = fechaMySQLLima();
    const fotoDniFile = req.files.foto_dni[0].filename;
    const firmaFile = req.files.firma[0].filename;

    const [nivelRow] = await query('SELECT nombre FROM niveles WHERE id = ? AND colegio_id = ? LIMIT 1', [
      nivelId,
      colegio_id,
    ]);
    if (!nivelRow) {
      return res.status(400).json({ error: 'Nivel no válido.' });
    }
    if (!gradosValidos(nivelRow.nombre).includes(grado)) {
      return res.status(400).json({ error: 'Grado no válido para el nivel seleccionado.' });
    }

    const conn = await mysqlReadPool.getConnection();
    let matriculaId;
    let alumnoId;
    let alumnoEsNuevo = false;

    try {
      await conn.beginTransaction();

      const turnoId = await resolverTurnoMananaConn(conn, colegio_id);

      const [exAl] = await conn.execute(
        'SELECT id FROM alumnos WHERE colegio_id = ? AND TRIM(nro_documento) = ? LIMIT 1',
        [colegio_id, dniAl]
      );

      let costoIdParaMatricula = 0;

      if (exAl.length) {
        alumnoId = exAl[0].id;
        costoIdParaMatricula = await ultimoCostoIdAlumno(conn, alumnoId, colegio_id);
        await conn.execute(
          `UPDATE alumnos SET
            apellido_paterno = ?, apellido_materno = ?, nombres = ?, sexo = ?, email = ?,
            domicilio = ?, fecha_nacimiento = ?, foto_dni = ?, seguro_id = ?, tipo_documento = ?
           WHERE id = ? AND colegio_id = ?`,
          [ap, am, nom, sexoAl, emailAl, domicilioAl, fn, fotoDniFile, seguroId, tipoDocAl, alumnoId, colegio_id]
        );

        const [uAl] = await conn.execute(
          `SELECT id FROM usuarios WHERE colegio_id = ? AND alumno_id = ? AND tipo = 'ALUMNO' LIMIT 1`,
          [colegio_id, alumnoId]
        );
        if (!uAl.length && (await usuarioLibreConn(conn, colegio_id, dniAl))) {
          const pwd = sha1Password(dniAl);
          await conn.execute(
            `INSERT INTO usuarios (
               colegio_id, alumno_id, personal_id, apoderado_id, usuario, password, tipo, estado,
               ms_email, ms_access_token, ms_refresh_token, ms_id_token, auth_token, permisos,
               cambiar_password, app_terminos_aceptados, cambiar_datos
             ) VALUES (?, ?, 0, 0, ?, ?, 'ALUMNO', 'INACTIVO', '', '', '', '', '', '', 'NO', 'NO', 'SI')`,
            [colegio_id, alumnoId, dniAl, pwd]
          );
        }
      } else {
        alumnoEsNuevo = true;
        if (!(await usuarioLibreConn(conn, colegio_id, dniAl))) {
          await conn.rollback();
          return res.status(409).json({ error: 'El DNI del alumno ya está en uso como usuario.' });
        }

        await conn.execute(
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
            tipoDocAl,
            dniAl,
            fn,
            ALUMNO_DEFAULTS.pais_nacimiento_id,
            ALUMNO_DEFAULTS.departamento_nacimiento_id,
            ALUMNO_DEFAULTS.provincia_nacimiento_id,
            ALUMNO_DEFAULTS.distrito_nacimiento_id,
            sexoAl,
            emailAl,
            ALUMNO_DEFAULTS.foto,
            hoy,
            ALUMNO_DEFAULTS.observaciones,
            ALUMNO_DEFAULTS.nro_hermanos,
            ALUMNO_DEFAULTS.lugar_hermanos,
            ALUMNO_DEFAULTS.religion,
            ALUMNO_DEFAULTS.lengua_materna,
            ALUMNO_DEFAULTS.segunda_lengua,
            dniAl,
            ALUMNO_DEFAULTS.discapacidad,
            domicilioAl,
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
            fotoDniFile,
            'ONLINE',
            seguroId,
          ]
        );
        const [rLast] = await conn.execute(
          'SELECT id FROM alumnos WHERE colegio_id = ? AND TRIM(nro_documento) = ? ORDER BY id DESC LIMIT 1',
          [colegio_id, dniAl]
        );
        alumnoId = rLast[0]?.id;
        if (!alumnoId) throw new Error('No se pudo crear el alumno');

        const pwd = sha1Password(dniAl);
        await conn.execute(
          `INSERT INTO usuarios (
             colegio_id, alumno_id, personal_id, apoderado_id, usuario, password, tipo, estado,
             ms_email, ms_access_token, ms_refresh_token, ms_id_token, auth_token, permisos,
             cambiar_password, app_terminos_aceptados, cambiar_datos
           ) VALUES (?, ?, 0, 0, ?, ?, 'ALUMNO', 'INACTIVO', '', '', '', '', '', '', 'NO', 'NO', 'SI')`,
          [colegio_id, alumnoId, dniAl, pwd]
        );
      }

      if (await matriculaDuplicadaAnio(conn, alumnoId, colegio_id, anioSistema)) {
        await conn.rollback();
        return res.status(409).json({
          error: `Este alumno ya tiene una solicitud de matrícula registrada para el año ${anioDisplay}.`,
          codigo: 'MATRICULA_DUPLICADA_ANIO',
        });
      }

      const grupoId = await ensureGrupoConn(conn, {
        colegio_id,
        anio: anioSistema,
        nivel_id: nivelId,
        grado,
        seccion: 'UNICA',
        turno_id: turnoId,
        sede_id: DEFAULT_SEDE_ID,
      });

      let apoderadoId;
      const [apRows] = await conn.execute(
        'SELECT id FROM apoderados WHERE colegio_id = ? AND TRIM(nro_documento) = ? LIMIT 1',
        [colegio_id, dniAp]
      );

      if (apRows.length) {
        apoderadoId = apRows[0].id;
        await conn.execute(
          `UPDATE apoderados SET
            nombres = ?, apellido_paterno = ?, apellido_materno = ?, email = ?,
            telefono_celular = ?, direccion = ?, tipo_documento = ?, parentesco = ?, firma_digital = ?
           WHERE id = ? AND colegio_id = ?`,
          [nomAp, apAp, amAp, emailAp, telAp, dirAp, tipoDocAp, parentesco, firmaFile, apoderadoId, colegio_id]
        );
      } else {
        await conn.execute(
          `INSERT INTO apoderados (
            colegio_id, nombres, apellido_paterno, apellido_materno, vive, tipo_documento, nro_documento, estado_civil,
            telefono_fijo, telefono_celular, direccion, centro_trabajo_direccion, grado_instruccion, ocupacion, parentesco,
            vive_con_estudiante, fecha_nacimiento, pais_nacimiento_id, email, foto, firma_digital
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            colegio_id,
            nomAp,
            apAp,
            amAp,
            'SI',
            tipoDocAp,
            dniAp,
            0,
            '',
            telAp,
            dirAp,
            '',
            0,
            '',
            parentesco,
            'SI',
            fnAp,
            0,
            emailAp,
            null,
            firmaFile,
          ]
        );
        const [lastAp] = await conn.execute(
          'SELECT id FROM apoderados WHERE colegio_id = ? AND TRIM(nro_documento) = ? ORDER BY id DESC LIMIT 1',
          [colegio_id, dniAp]
        );
        apoderadoId = lastAp[0]?.id;
        if (!apoderadoId) throw new Error('No se pudo crear el apoderado');

        const [existU] = await conn.execute(
          'SELECT id FROM usuarios WHERE colegio_id = ? AND TRIM(usuario) = ? LIMIT 1',
          [colegio_id, dniAp]
        );
        if (!existU.length) {
          const pwdAp = sha1Password(dniAp);
          await conn.execute(
            `INSERT INTO usuarios (
               colegio_id, alumno_id, personal_id, apoderado_id, usuario, password, tipo, estado,
               ms_email, ms_access_token, ms_refresh_token, ms_id_token, auth_token, permisos,
               cambiar_password, app_terminos_aceptados, cambiar_datos
             ) VALUES (?, 0, 0, ?, ?, ?, 'APODERADO', 'ACTIVO', '', '', '', '', '', '', 'NO', 'NO', 'SI')`,
            [colegio_id, apoderadoId, dniAp, pwdAp]
          );
        }
      }

      const [dupF] = await conn.execute(
        'SELECT 1 FROM familias WHERE alumno_id = ? AND apoderado_id = ? LIMIT 1',
        [alumnoId, apoderadoId]
      );
      if (!dupF.length) {
        await conn.execute('INSERT INTO familias (alumno_id, apoderado_id) VALUES (?, ?)', [alumnoId, apoderadoId]);
      }

      const estadoMat = MATRICULA_ESTADO.TEMPORAL;
      const costoInsert = costoIdParaMatricula > 0 ? costoIdParaMatricula : null;

      try {
        const [insM] = await conn.execute(
          `INSERT INTO matriculas (colegio_id, alumno_id, grupo_id, costo_id, fecha_registro, estado, ocultar, descontar, modalidad)
           VALUES (?, ?, ?, ?, ?, ?, 'NO', 'SI', 'PRESENCIAL')`,
          [colegio_id, alumnoId, grupoId, costoInsert, hoy, estadoMat]
        );
        matriculaId = insM.insertId;
      } catch (e1) {
        const [insM2] = await conn.execute(
          `INSERT INTO matriculas (colegio_id, alumno_id, grupo_id, costo_id, fecha_registro, estado, modalidad)
           VALUES (?, ?, ?, ?, ?, ?, 'PRESENCIAL')`,
          [colegio_id, alumnoId, grupoId, costoInsert, hoy, estadoMat]
        );
        matriculaId = insM2.insertId;
      }

      if (!matriculaId) throw new Error('No se pudo crear la matrícula');

      await conn.execute(
        `UPDATE usuarios SET estado = 'INACTIVO' WHERE alumno_id = ? AND colegio_id = ? AND tipo = 'ALUMNO'`,
        [alumnoId, colegio_id]
      );

      await conn.commit();

      const documentosAceptados = documentosReq.filter((d) => idsAcept.has(d.id));

      enviarEmailsMatriculaOnline({
        config: configMap,
        ctx: {
          alumno: {
            nombres: nom,
            apellido_paterno: ap,
            apellido_materno: am,
            nro_documento: dniAl,
            seguro_id: seguroId,
            domicilio: domicilioAl,
          },
          apoderado: {
            nombres: nomAp,
            apellido_paterno: apAp,
            apellido_materno: amAp,
            nro_documento: dniAp,
            email: emailAp,
            telefono_celular: telAp,
          },
          nivelNombre: nivelRow.nombre,
          grado,
          anioMatricula: anioDisplay,
          fechaRegistro: hoy,
          colegioNombre: colegio.titulo_intranet || configMap.remitente_emails,
          documentosAceptados,
        },
        fotoDniFilename: fotoDniFile,
        firmaFilename: firmaFile,
      }).catch((errEmail) => console.error('[matricula-online email]', errEmail));

      res.status(201).json({
        ok: true,
        matricula_id: matriculaId,
        alumno_id: alumnoId,
        alumno_nuevo: alumnoEsNuevo,
        anio_matricula: anioDisplay,
        grado_label: gradoLabel(nivelRow.nombre, grado),
        mensaje: 'Matrícula online registrada correctamente. Revise su correo electrónico.',
      });
    } catch (e) {
      try {
        await conn.rollback();
      } catch {
        /* ignore */
      }
      throw e;
    } finally {
      conn.release();
    }
  } catch (e) {
    console.error('[matricula-online POST]', e);
    if (e instanceof multer.MulterError) {
      return res.status(400).json({ error: 'Archivo demasiado grande o inválido (máx. 8 MB).' });
    }
    const st = Number(e.status) >= 400 && Number(e.status) < 600 ? Number(e.status) : 500;
    res.status(st).json({ error: e.message || 'Error al registrar matrícula online' });
  }
});

async function usuarioLibreConn(conn, colegioId, usuarioLogin) {
  const u = String(usuarioLogin || '').trim();
  if (!u) return false;
  const [rows] = await conn.execute(
    'SELECT id FROM usuarios WHERE colegio_id = ? AND TRIM(usuario) = ? LIMIT 1',
    [colegioId, u]
  );
  return !rows.length;
}

module.exports = router;
