/**
 * Inscripción / nueva matrícula (wizard admin).
 * Montaje: /api/admin/usuarios
 */
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { query, execute, mysqlReadPool } = require('../utils/mysql');
const { authenticateToken } = require('../middleware/auth');

function sha1Password(plain) {
  return crypto.createHash('sha1').update(String(plain), 'utf8').digest('hex');
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Usuario no autenticado' });
  if (req.user.tipo !== 'ADMINISTRADOR') return res.status(403).json({ error: 'Solo administradores' });
  next();
}

router.use(authenticateToken);
router.use(requireAdmin);

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

const FECHA_HORA_PENDIENTE_DB = '1970-01-01 00:00:00';
const FECHA_CANCELADO_PENDIENTE_DB = '1970-01-01';

async function usuarioLibre(colegioId, usuarioLogin, excludeUsuarioId = null) {
  const u = String(usuarioLogin || '').trim();
  if (!u) return false;
  const rows = await query(
    `SELECT id FROM usuarios WHERE colegio_id = ? AND TRIM(usuario) = ? ${excludeUsuarioId ? 'AND id != ?' : ''} LIMIT 1`,
    excludeUsuarioId ? [colegioId, u, excludeUsuarioId] : [colegioId, u]
  );
  return !rows.length;
}

async function resolverPersonalIdPago(colegio_id, reqUser) {
  let personal_id = reqUser.personal_id && Number(reqUser.personal_id) > 0 ? Number(reqUser.personal_id) : null;
  if (personal_id) {
    const pr = await query('SELECT id FROM personal WHERE id = ? AND colegio_id = ? LIMIT 1', [personal_id, colegio_id]);
    if (!pr.length) personal_id = null;
  }
  if (!personal_id) {
    const pr2 = await query('SELECT id FROM personal WHERE colegio_id = ? ORDER BY id ASC LIMIT 1', [colegio_id]);
    personal_id = pr2[0]?.id || null;
  }
  return personal_id;
}

/**
 * Catálogo para el formulario: grupos, costos, config pensión del colegio, año sugerido.
 */
router.get('/inscripcion-matricula/catalogo', async (req, res) => {
  try {
    const { colegio_id } = req.user;
    const anioQ = req.query.anio != null && String(req.query.anio).trim() !== '' ? parseInt(req.query.anio, 10) : null;
    const anioActivo = Number.isFinite(anioQ) ? anioQ : new Date().getFullYear();

    const [colegioRow] = await query(
      `SELECT ciclo_pensiones, inicio_pensiones, total_pensiones, anio_activo
       FROM colegios WHERE id = ? LIMIT 1`,
      [colegio_id]
    );
    const grupos = await query(
      `SELECT g.id, g.anio, g.grado, g.seccion, g.nivel_id, n.nombre AS nivel_nombre, t.nombre AS turno_nombre
       FROM grupos g
       LEFT JOIN niveles n ON n.id = g.nivel_id
       LEFT JOIN turnos t ON t.id = g.turno_id
       WHERE g.colegio_id = ? AND g.anio = ?
       ORDER BY g.grado ASC, g.seccion ASC`,
      [colegio_id, anioActivo]
    );
    const costos = await query(
      'SELECT id, matricula, pension, descripcion, tipo FROM costos WHERE colegio_id = ? ORDER BY tipo DESC, id DESC',
      [colegio_id]
    );

    res.json({
      anio_sugerido: anioActivo,
      colegio_pensiones: {
        ciclo_pensiones: colegioRow?.ciclo_pensiones ?? null,
        inicio_pensiones: parseInt(colegioRow?.inicio_pensiones || 1, 10),
        total_pensiones: parseInt(colegioRow?.total_pensiones || 10, 10),
      },
      grupos: grupos || [],
      costos: costos || [],
    });
  } catch (e) {
    console.error('GET inscripcion-matricula/catalogo', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

async function insertPagoPendienteConn(conn, {
  colegio_id,
  matriculaId,
  nro_pago,
  tipo,
  monto,
  descripcion,
  personal_id,
  withObservaciones,
}) {
  const cols = [
    'colegio_id',
    'matricula_id',
    'nro_pago',
    'monto',
    'mora',
    'fecha_hora',
    'tipo',
    'descripcion',
    ...(withObservaciones ? ['observaciones'] : []),
    'estado_pago',
    'fecha_cancelado',
    'forma_pago',
    'tipo_tarjeta',
    'lugar_pago',
    'comision_tarjeta',
    'personal_id',
    'estado',
  ];
  const placeholders = cols.map(() => '?').join(', ');
  const vals = [
    colegio_id,
    matriculaId,
    nro_pago,
    monto,
    0,
    FECHA_HORA_PENDIENTE_DB,
    tipo,
    descripcion,
    ...(withObservaciones ? [''] : []),
    'PENDIENTE',
    FECHA_CANCELADO_PENDIENTE_DB,
    'EFECTIVO',
    '',
    'CAJA',
    0,
    personal_id,
    'ACTIVO',
  ];
  await conn.execute(`INSERT INTO pagos (${cols.join(', ')}) VALUES (${placeholders})`, vals);
}

/**
 * Crea fila en `costos` tipo PERSONAL (legado PHP: costo_id = -1). Devuelve el id insertado.
 */
async function insertCostoPersonalizado(conn, { colegio_id, descripcion, matricula, pension, agenda }) {
  const desc = String(descripcion || 'Costo Personalizado').slice(0, 255);
  const mat = Number(matricula);
  const pen = Number(pension);
  const ag = agenda != null && agenda !== '' ? Number(agenda) : 0;
  try {
    const [r] = await conn.execute(
      `INSERT INTO costos (colegio_id, descripcion, matricula, pension, agenda, tipo) VALUES (?, ?, ?, ?, ?, 'PERSONAL')`,
      [colegio_id, desc, mat, pen, Number.isFinite(ag) ? ag : 0]
    );
    return r.insertId;
  } catch (e) {
    const [r2] = await conn.execute(
      `INSERT INTO costos (colegio_id, descripcion, matricula, pension, tipo) VALUES (?, ?, ?, ?, 'PERSONAL')`,
      [colegio_id, desc, mat, pen]
    );
    return r2.insertId;
  }
}

/**
 * Alta atómica: alumno (nuevo o existente), apoderados vinculados, matrícula, líneas de pago pensión (PENDIENTE)
 * y opcionalmente pago de matrícula (PENDIENTE).
 */
router.post('/inscripcion-matricula', async (req, res) => {
  const conn = await mysqlReadPool.getConnection();
  try {
    const { colegio_id } = req.user;
    const b = req.body || {};

    const alumnoIn = b.alumno || {};
    const esAlumnoNuevo = !!alumnoIn.es_nuevo;
    let alumnoId = parseInt(alumnoIn.id, 10);
    const dniAl = String(alumnoIn.nro_documento || '').trim();
    const ap = String(alumnoIn.apellido_paterno || '').trim();
    const am = String(alumnoIn.apellido_materno || '').trim();
    const nom = String(alumnoIn.nombres || '').trim();
    const emailAl = String(alumnoIn.email || '').trim();
    const fn = String(alumnoIn.fecha_nacimiento || '2000-01-01').slice(0, 10);
    let sexoAl = parseInt(alumnoIn.sexo, 10);
    if (Number.isNaN(sexoAl)) sexoAl = ALUMNO_DEFAULTS.sexo;
    const domicilioAl = String(alumnoIn.domicilio || '').trim();
    const fechaInscripcion = String(alumnoIn.fecha_inscripcion || '').slice(0, 10);
    const hoy = new Date().toISOString().slice(0, 10);
    const fechaIns = /^\d{4}-\d{2}-\d{2}$/.test(fechaInscripcion) ? fechaInscripcion : hoy;

    const grupoId = parseInt(b.grupo_id, 10);
    const costoModo = String(b.costo_modo || 'personalizado').toLowerCase() === 'tarifario' ? 'tarifario' : 'personalizado';
    const estadoMat = parseInt(b.estado_matricula, 10);
    const fr = String(b.fecha_registro || hoy).slice(0, 10);
    const modalidad = String(b.modalidad || 'PRESENCIAL').trim().slice(0, 80) || 'PRESENCIAL';
    const registrarLineaPagoMatricula = !!b.registrar_linea_pago_matricula;

    let montoMatricula;
    let montoPension;
    /** Id de costo: tarifario existente o fila PERSONAL recién creada en la transacción. */
    let costoIdParaMatricula;
    /** Agenda opcional solo en modo personalizado (columna `costos.agenda` en BD). */
    let agendaParaCosto = 0;

    if (!dniAl || !ap || !nom) {
      return res.status(400).json({ error: 'DNI, apellido paterno y nombres del alumno son obligatorios' });
    }
    if (!Number.isFinite(grupoId)) {
      return res.status(400).json({ error: 'Seleccione un grupo' });
    }
    if (![0, 1, 2, 3, 4].includes(estadoMat)) {
      return res.status(400).json({ error: 'Estado de matrícula no válido' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fr)) {
      return res.status(400).json({ error: 'Fecha de registro inválida' });
    }

    const gOk = await query('SELECT id FROM grupos WHERE id = ? AND colegio_id = ? LIMIT 1', [grupoId, colegio_id]);
    if (!gOk.length) return res.status(400).json({ error: 'Grupo no válido' });

    if (costoModo === 'tarifario') {
      const costoId = parseInt(b.costo_id, 10);
      if (!Number.isFinite(costoId)) {
        return res.status(400).json({ error: 'Seleccione una tarifa del colegio o use montos personalizados' });
      }
      const cOk = await query('SELECT id, matricula, pension FROM costos WHERE id = ? AND colegio_id = ? LIMIT 1', [
        costoId,
        colegio_id,
      ]);
      if (!cOk.length) return res.status(400).json({ error: 'El costo seleccionado no es válido' });
      montoMatricula = parseFloat(cOk[0].matricula) || 0;
      montoPension = parseFloat(cOk[0].pension) || 0;
      costoIdParaMatricula = costoId;
      if (montoPension <= 0) {
        return res.status(400).json({ error: 'La pensión del costo elegido debe ser mayor a 0 para generar las cuotas' });
      }
    } else {
      const cp = b.costo_personalizado || {};
      montoMatricula = parseFloat(cp.matricula);
      montoPension = parseFloat(cp.pension);
      const ag = cp.agenda != null && cp.agenda !== '' ? parseFloat(cp.agenda) : 0;
      agendaParaCosto = Number.isFinite(ag) && ag >= 0 ? ag : 0;
      if (!Number.isFinite(montoMatricula) || montoMatricula < 0) {
        return res.status(400).json({ error: 'Indique un monto de matrícula válido (≥ 0)' });
      }
      if (!Number.isFinite(montoPension) || montoPension < 0) {
        return res.status(400).json({ error: 'Indique un monto de pensión mensual válido (≥ 0)' });
      }
      if (montoPension <= 0) {
        return res.status(400).json({
          error: 'El monto de pensión mensual debe ser mayor a 0 para generar las cuotas del año.',
        });
      }
      costoIdParaMatricula = null;
    }

    const [cfg] = await query(
      `SELECT ciclo_pensiones, inicio_pensiones, total_pensiones FROM colegios WHERE id = ? LIMIT 1`,
      [colegio_id]
    );
    const totalPensiones = cfg ? parseInt(cfg.total_pensiones || 10, 10) : 10;

    const personal_id = await resolverPersonalIdPago(colegio_id, req.user);
    if (!personal_id) {
      return res.status(400).json({
        error:
          'No hay personal en el colegio para asociar los pagos. Registre al menos un trabajador en el equipo.',
      });
    }

    const apoderadosIn = Array.isArray(b.apoderados) ? b.apoderados : [];
    if (!apoderadosIn.length) {
      return res.status(400).json({ error: 'Agregue al menos un apoderado (padre/madre u otro).' });
    }

    await conn.beginTransaction();

    if (esAlumnoNuevo) {
      const dup = await query(
        'SELECT id FROM alumnos WHERE colegio_id = ? AND TRIM(nro_documento) = ? LIMIT 1',
        [colegio_id, dniAl]
      );
      if (dup.length) {
        await conn.rollback();
        return res.status(409).json({ error: 'Ya existe un alumno con ese DNI. Use buscar y cargar datos.' });
      }
      if (!(await usuarioLibre(colegio_id, dniAl))) {
        await conn.rollback();
        return res.status(409).json({ error: 'El DNI ya está en uso como usuario' });
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
          ALUMNO_DEFAULTS.tipo_documento,
          dniAl,
          fn,
          ALUMNO_DEFAULTS.pais_nacimiento_id,
          ALUMNO_DEFAULTS.departamento_nacimiento_id,
          ALUMNO_DEFAULTS.provincia_nacimiento_id,
          ALUMNO_DEFAULTS.distrito_nacimiento_id,
          sexoAl,
          emailAl,
          ALUMNO_DEFAULTS.foto,
          fechaIns,
          ALUMNO_DEFAULTS.observaciones,
          ALUMNO_DEFAULTS.nro_hermanos,
          ALUMNO_DEFAULTS.lugar_hermanos,
          ALUMNO_DEFAULTS.religion,
          ALUMNO_DEFAULTS.lengua_materna,
          ALUMNO_DEFAULTS.segunda_lengua,
          dniAl,
          ALUMNO_DEFAULTS.discapacidad,
          domicilioAl || ALUMNO_DEFAULTS.domicilio,
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
      const [rLast] = await conn.execute(
        'SELECT id FROM alumnos WHERE colegio_id = ? AND TRIM(nro_documento) = ? ORDER BY id DESC LIMIT 1',
        [colegio_id, dniAl]
      );
      alumnoId = rLast[0]?.id;
      if (!alumnoId) throw new Error('No se pudo obtener el alumno creado');

      const pwd = sha1Password(dniAl);
      await conn.execute(
        `INSERT INTO usuarios (
         colegio_id, alumno_id, personal_id, apoderado_id, usuario, password, tipo, estado,
         ms_email, ms_access_token, ms_refresh_token, ms_id_token, auth_token, permisos,
         cambiar_password, app_terminos_aceptados, cambiar_datos
       ) VALUES (?, ?, 0, 0, ?, ?, 'ALUMNO', 'ACTIVO', '', '', '', '', '', '', 'NO', 'NO', 'SI')`,
        [colegio_id, alumnoId, dniAl, pwd]
      );
    } else {
      if (!Number.isFinite(alumnoId)) {
        await conn.rollback();
        return res.status(400).json({ error: 'Indique el alumno existente o cree uno nuevo' });
      }
      const ex = await query('SELECT id FROM alumnos WHERE id = ? AND colegio_id = ? LIMIT 1', [alumnoId, colegio_id]);
      if (!ex.length) {
        await conn.rollback();
        return res.status(404).json({ error: 'Alumno no encontrado' });
      }
      await conn.execute(
        `UPDATE alumnos SET apellido_paterno = ?, apellido_materno = ?, nombres = ?, email = ?, fecha_nacimiento = ?, sexo = ?, domicilio = COALESCE(NULLIF(?, ''), domicilio), fecha_inscripcion = ?
         WHERE id = ? AND colegio_id = ?`,
        [ap, am, nom, emailAl, fn, sexoAl, domicilioAl, fechaIns, alumnoId, colegio_id]
      );
    }

    if (costoModo === 'personalizado') {
      const nombreCompleto = `${ap} ${am} ${nom}`.replace(/\s+/g, ' ').trim();
      costoIdParaMatricula = await insertCostoPersonalizado(conn, {
        colegio_id,
        descripcion: `Costo Personalizado - ${nombreCompleto}`,
        matricula: montoMatricula,
        pension: montoPension,
        agenda: agendaParaCosto,
      });
      if (!costoIdParaMatricula) {
        await conn.rollback();
        return res.status(500).json({ error: 'No se pudo crear el costo personalizado' });
      }
    }

    for (const apItem of apoderadosIn) {
      const dniAp = String(apItem.nro_documento || '').trim();
      let parentesco = parseInt(apItem.parentesco, 10);
      if (Number.isNaN(parentesco) || parentesco < 1 || parentesco > 4) parentesco = 1;
      if (!dniAp) {
        await conn.rollback();
        return res.status(400).json({ error: 'Cada apoderado debe tener DNI' });
      }

      let [apRows] = await conn.execute(
        'SELECT id FROM apoderados WHERE colegio_id = ? AND TRIM(nro_documento) = ? LIMIT 1',
        [colegio_id, dniAp]
      );
      let apoderadoId = apRows[0]?.id;

      if (!apoderadoId) {
        if (!apItem.crear_si_no_existe) {
          await conn.rollback();
          return res.status(400).json({ error: `No existe apoderado con DNI ${dniAp}. Marque crear nuevo o registre antes.` });
        }
        const nNom = String(apItem.nombres || '').trim();
        const nAp = String(apItem.apellido_paterno || '').trim();
        const nAm = String(apItem.apellido_materno || '').trim();
        if (!nNom || !nAp) {
          await conn.rollback();
          return res.status(400).json({ error: `Complete nombres y apellido paterno del apoderado (${dniAp})` });
        }
        const fnAp = String(apItem.fecha_nacimiento || '1980-01-01').slice(0, 10);
        const emailAp = String(apItem.email || '').trim();
        const telAp = String(apItem.telefono_celular || '').trim();

        await conn.execute(
          `INSERT INTO apoderados (
        colegio_id, nombres, apellido_paterno, apellido_materno, vive, tipo_documento, nro_documento, estado_civil,
        telefono_fijo, telefono_celular, direccion, centro_trabajo_direccion, grado_instruccion, ocupacion, parentesco,
        vive_con_estudiante, fecha_nacimiento, pais_nacimiento_id, email, foto, firma_digital
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            colegio_id,
            nNom,
            nAp,
            nAm,
            'SI',
            1,
            dniAp,
            0,
            '',
            telAp,
            '',
            '',
            0,
            '',
            parentesco,
            'SI',
            fnAp,
            0,
            emailAp,
            null,
            '',
          ]
        );
        const [lastAp] = await conn.execute(
          'SELECT id FROM apoderados WHERE colegio_id = ? AND TRIM(nro_documento) = ? ORDER BY id DESC LIMIT 1',
          [colegio_id, dniAp]
        );
        apoderadoId = lastAp[0]?.id;
        if (!apoderadoId) throw new Error('Error creando apoderado');

        const [existU] = await conn.execute(
          'SELECT id, tipo, personal_id, apoderado_id, alumno_id FROM usuarios WHERE colegio_id = ? AND TRIM(usuario) = ? LIMIT 1',
          [colegio_id, dniAp]
        );
        if (!existU.length) {
          const pwd = sha1Password(dniAp);
          await conn.execute(
            `INSERT INTO usuarios (
           colegio_id, alumno_id, personal_id, apoderado_id, usuario, password, tipo, estado,
           ms_email, ms_access_token, ms_refresh_token, ms_id_token, auth_token, permisos,
           cambiar_password, app_terminos_aceptados, cambiar_datos
         ) VALUES (?, 0, 0, ?, ?, ?, 'APODERADO', 'ACTIVO', '', '', '', '', '', '', 'NO', 'NO', 'SI')`,
            [colegio_id, apoderadoId, dniAp, pwd]
          );
        }
      } else {
        await conn.execute('UPDATE apoderados SET parentesco = ? WHERE id = ? AND colegio_id = ?', [
          parentesco,
          apoderadoId,
          colegio_id,
        ]);
      }

      const [dupF] = await conn.execute(
        'SELECT 1 FROM familias WHERE alumno_id = ? AND apoderado_id = ? LIMIT 1',
        [alumnoId, apoderadoId]
      );
      if (!dupF.length) {
        await conn.execute('INSERT INTO familias (alumno_id, apoderado_id) VALUES (?, ?)', [alumnoId, apoderadoId]);
      }
    }

    let matriculaId;
    try {
      const [insM] = await conn.execute(
        `INSERT INTO matriculas (colegio_id, alumno_id, grupo_id, costo_id, fecha_registro, estado, ocultar, descontar, modalidad)
         VALUES (?, ?, ?, ?, ?, ?, 'NO', 'SI', ?)`,
        [colegio_id, alumnoId, grupoId, costoIdParaMatricula, fr, estadoMat, modalidad]
      );
      matriculaId = insM.insertId;
    } catch (e1) {
      try {
        const [insM2] = await conn.execute(
          `INSERT INTO matriculas (colegio_id, alumno_id, grupo_id, costo_id, fecha_registro, estado, modalidad)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [colegio_id, alumnoId, grupoId, costoIdParaMatricula, fr, estadoMat, modalidad]
        );
        matriculaId = insM2.insertId;
      } catch (e2) {
        console.error('INSERT matriculas inscripcion', e1, e2);
        throw e2;
      }
    }

    if (!matriculaId) throw new Error('No se pudo crear la matrícula');

    let withObs = true;
    const insertPensionMes = async (mes) => {
      try {
        await insertPagoPendienteConn(conn, {
          colegio_id,
          matriculaId,
          nro_pago: mes,
          tipo: 1,
          monto: montoPension,
          descripcion: '',
          personal_id,
          withObservaciones: withObs,
        });
      } catch (e) {
        if (withObs) {
          withObs = false;
          await insertPagoPendienteConn(conn, {
            colegio_id,
            matriculaId,
            nro_pago: mes,
            tipo: 1,
            monto: montoPension,
            descripcion: '',
            personal_id,
            withObservaciones: false,
          });
        } else throw e;
      }
    };

    for (let mes = 1; mes <= totalPensiones; mes += 1) {
      await insertPensionMes(mes);
    }

    if (registrarLineaPagoMatricula && montoMatricula > 0) {
      try {
        await insertPagoPendienteConn(conn, {
          colegio_id,
          matriculaId,
          nro_pago: 0,
          tipo: 0,
          monto: montoMatricula,
          descripcion: 'MATRÍCULA',
          personal_id,
          withObservaciones: withObs,
        });
      } catch (e) {
        await insertPagoPendienteConn(conn, {
          colegio_id,
          matriculaId,
          nro_pago: 0,
          tipo: 0,
          monto: montoMatricula,
          descripcion: 'MATRÍCULA',
          personal_id,
          withObservaciones: false,
        });
      }
    }

    await conn.commit();
    res.status(201).json({
      ok: true,
      alumno_id: alumnoId,
      matricula_id: matriculaId,
      mensaje:
        'Inscripción registrada. Se generaron las pensiones del año en estado pendiente' +
        (registrarLineaPagoMatricula ? ' y la línea de pago de matrícula.' : '.'),
    });
  } catch (e) {
    try {
      await conn.rollback();
    } catch (r) {
      /* ignore */
    }
    console.error('POST inscripcion-matricula', e);
    res.status(500).json({ error: e.message || 'Error al registrar inscripción' });
  } finally {
    conn.release();
  }
});

module.exports = router;
