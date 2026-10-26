/**
 * Inscripción / nueva matrícula (wizard admin).
 * Montaje: /api/admin/usuarios
 */
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { query, execute, mysqlReadPool } = require('../utils/mysql');
const { ensureGrupoConn, insertCostoPersonalizado } = require('../utils/matriculaGrupoCosto');
const { authenticateToken } = require('../middleware/auth');
const { DEFAULT_COLEGIO_ID, DEFAULT_SEDE_ID } = require('../utils/defaultColegio');
const { fechaMySQLLima } = require('../utils/fechaHoraLima');
const { etiquetaSeguro } = require('../utils/seguroOpciones');
const { joinStaticFs } = require('../utils/staticStorage');

function sha1Password(plain) {
  return crypto.createHash('sha1').update(String(plain), 'utf8').digest('hex');
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Usuario no autenticado' });
  if (req.user.tipo === 'ADMINISTRADOR' || req.user.tipo === 'COORDINADOR' || req.user.tipo === 'DIRECTOR' || req.user.tipo === 'CONTADOR') return next();
  return res.status(403).json({ error: 'Solo administradores' });
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

const { insertPagoPendienteConn, resolverPersonalIdPago } = require('../utils/pagoPendienteInsert');

async function usuarioLibre(colegioId, usuarioLogin, excludeUsuarioId = null) {
  const u = String(usuarioLogin || '').trim();
  if (!u) return false;
  const rows = await query(
    `SELECT id FROM usuarios WHERE colegio_id = ? AND TRIM(usuario) = ? ${excludeUsuarioId ? 'AND id != ?' : ''} LIMIT 1`,
    excludeUsuarioId ? [colegioId, u, excludeUsuarioId] : [colegioId, u]
  );
  return !rows.length;
}

/**
 * Catálogo para el formulario: grupos, costos, config pensión del colegio, año sugerido.
 */
router.get('/inscripcion-matricula/catalogo', async (req, res) => {
  try {
    const anioQ = req.query.anio != null && String(req.query.anio).trim() !== '' ? parseInt(req.query.anio, 10) : null;
    const anioActivo = Number.isFinite(anioQ) ? anioQ : new Date().getFullYear();

    const colegio_id = DEFAULT_COLEGIO_ID;
    const sedeQ = req.query.sede_id != null && String(req.query.sede_id).trim() !== '' ? parseInt(req.query.sede_id, 10) : NaN;
    const sedeFiltro = Number.isFinite(sedeQ) && sedeQ > 0 ? sedeQ : DEFAULT_SEDE_ID;

    let sedesLista = [];
    try {
      sedesLista = await query(
        'SELECT id, nombre FROM sedes WHERE colegio_id = ? ORDER BY id ASC',
        [colegio_id]
      );
    } catch (e) {
      if (String(e.code || e.message || '').includes('sedes') || e.code === 'ER_NO_SUCH_TABLE') {
        sedesLista = [];
      } else {
        throw e;
      }
    }

    const [colegioRow] = await query(
      `SELECT ciclo_pensiones, inicio_pensiones, total_pensiones, anio_activo
       FROM colegios WHERE id = ? LIMIT 1`,
      [colegio_id]
    );
    let grupos = [];
    try {
      grupos = await query(
        `SELECT g.id, g.anio, g.grado, g.seccion, g.nivel_id, g.sede_id, n.nombre AS nivel_nombre, t.nombre AS turno_nombre
         FROM grupos g
         LEFT JOIN niveles n ON n.id = g.nivel_id
         LEFT JOIN turnos t ON t.id = g.turno_id
         WHERE g.colegio_id = ? AND g.anio = ? AND g.sede_id = ?
         ORDER BY g.grado ASC, g.seccion ASC`,
        [colegio_id, anioActivo, sedeFiltro]
      );
    } catch (eG) {
      if (String(eG.message || '').includes('sede_id') || eG.code === 'ER_BAD_FIELD_ERROR') {
        grupos = await query(
          `SELECT g.id, g.anio, g.grado, g.seccion, g.nivel_id, n.nombre AS nivel_nombre, t.nombre AS turno_nombre
           FROM grupos g
           LEFT JOIN niveles n ON n.id = g.nivel_id
           LEFT JOIN turnos t ON t.id = g.turno_id
           WHERE g.colegio_id = ? AND g.anio = ?
           ORDER BY g.grado ASC, g.seccion ASC`,
          [colegio_id, anioActivo]
        );
      } else {
        throw eG;
      }
    }
    const costos = await query(
      `SELECT id, matricula, pension, descripcion, tipo FROM costos
       WHERE colegio_id = ? AND UPPER(TRIM(COALESCE(tipo, ''))) = 'GENERAL'
       ORDER BY id DESC`,
      [colegio_id]
    );

    const niveles = await query('SELECT id, nombre FROM niveles WHERE colegio_id = ? ORDER BY id ASC', [colegio_id]);

    let turnos = [];
    try {
      turnos = await query('SELECT id, nombre FROM turnos WHERE colegio_id = ? ORDER BY nombre ASC', [colegio_id]);
    } catch (e1) {
      try {
        turnos = await query('SELECT id, nombre FROM turnos ORDER BY nombre ASC');
      } catch (e2) {
        turnos = [];
      }
    }

    res.json({
      needs_colegio: false,
      colegio_catalogo_id: colegio_id,
      /** Sede física usada para filtrar grupos del catálogo y para matricular. */
      sede_catalogo_id: sedeFiltro,
      anio_sugerido: anioActivo,
      colegio_pensiones: {
        ciclo_pensiones: colegioRow?.ciclo_pensiones ?? null,
        inicio_pensiones: parseInt(colegioRow?.inicio_pensiones || 1, 10),
        total_pensiones: parseInt(colegioRow?.total_pensiones || 10, 10),
      },
      grupos: grupos || [],
      /** Solo tipo GENERAL (tarifa predeterminada del colegio). */
      costos: costos || [],
      niveles: niveles || [],
      turnos: turnos || [],
      /** Sedes reales (tabla `sedes`), no `colegios`. */
      sedes: sedesLista || [],
    });
  } catch (e) {
    console.error('GET inscripcion-matricula/catalogo', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

/**
 * Alta atómica: solo alumno nuevo, apoderados (crear o vincular), matrícula, pagos.
 * Grupo: por nivel/grado/sección/turno/año; si no existe se crea (sin tutor).
 */
router.post('/inscripcion-matricula', async (req, res) => {
  const b = req.body || {};
  const colegio_id = DEFAULT_COLEGIO_ID;

  const conn = await mysqlReadPool.getConnection();
  try {
    const alumnoIn = b.alumno || {};
    let alumnoId;
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
    const hoy = fechaMySQLLima();
    const fechaIns = /^\d{4}-\d{2}-\d{2}$/.test(fechaInscripcion) ? fechaInscripcion : hoy;

    const ub = b.ubicacion_grupo || b.ubicacion || {};
    const nivelIdUb = parseInt(ub.nivel_id, 10);
    const gradoUb = parseInt(ub.grado, 10);
    const seccionUb = String(ub.seccion || '').trim();
    const turnoIdUb = parseInt(ub.turno_id, 10);
    const anioUb = parseInt(ub.anio, 10);
    /** JSON.stringify(NaN) → null en el cliente; aceptar raíz y anidar; fallback sede por defecto. */
    let sedeIdUb = DEFAULT_SEDE_ID;
    const rawSede = [ub.sede_id, b.sede_id].find((v) => v != null && v !== '');
    if (rawSede != null && rawSede !== '') {
      const p = parseInt(String(rawSede), 10);
      if (Number.isFinite(p) && p > 0) sedeIdUb = p;
    }

    const costoModo = String(b.costo_modo || 'personalizado').toLowerCase() === 'tarifario' ? 'tarifario' : 'personalizado';
    const estadoMat = parseInt(b.estado_matricula, 10);
    const fr = String(b.fecha_registro || hoy).slice(0, 10);
    const modalidad = String(b.modalidad || 'PRESENCIAL').trim().slice(0, 80) || 'PRESENCIAL';
    const registrarLineaPagoMatricula = !!b.registrar_linea_pago_matricula;

    let montoMatricula;
    let montoPension;
    let costoIdParaMatricula;
    let agendaParaCosto = 0;

    if (!dniAl || !ap || !nom) {
      return res.status(400).json({ error: 'DNI, apellido paterno y nombres del alumno son obligatorios' });
    }
    if (![0, 1, 2, 3, 4].includes(estadoMat)) {
      return res.status(400).json({ error: 'Estado de matrícula no válido' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fr)) {
      return res.status(400).json({ error: 'Fecha de registro inválida' });
    }
    if (!Number.isFinite(nivelIdUb) || !Number.isFinite(gradoUb) || !Number.isFinite(turnoIdUb) || !Number.isFinite(anioUb)) {
      return res.status(400).json({ error: 'Complete nivel, grado, sección, turno y año académico' });
    }
    if (!String(seccionUb || '').trim()) {
      return res.status(400).json({ error: 'Indique la sección (letra del grupo)' });
    }

    const exAlPorDni = await query(
      'SELECT id FROM alumnos WHERE colegio_id = ? AND TRIM(nro_documento) = ? LIMIT 1',
      [colegio_id, dniAl]
    );
    if (exAlPorDni.length) {
      return res.status(409).json({
        error:
          'Este código de alumno (DNI) ya existe en el sistema. Búsquelo en Alumnos y use «Registrar nueva matrícula» desde el historial.',
        codigo: 'ALUMNO_YA_EXISTE',
      });
    }

    if (costoModo === 'tarifario') {
      const costoId = parseInt(b.costo_id, 10);
      if (!Number.isFinite(costoId)) {
        return res.status(400).json({ error: 'Seleccione una tarifa GENERAL del colegio o use montos personalizados' });
      }
      const cOk = await query(
        `SELECT id, matricula, pension FROM costos WHERE id = ? AND colegio_id = ? AND UPPER(TRIM(COALESCE(tipo, ''))) = 'GENERAL' LIMIT 1`,
        [costoId, colegio_id]
      );
      if (!cOk.length) return res.status(400).json({ error: 'El costo seleccionado no es una tarifa GENERAL válida' });
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

    const dup = await query('SELECT id FROM alumnos WHERE colegio_id = ? AND TRIM(nro_documento) = ? LIMIT 1', [colegio_id, dniAl]);
    if (dup.length) {
      await conn.rollback();
      return res.status(409).json({
        error:
          'Este código de alumno (DNI) ya existe en el sistema. Búsquelo en Alumnos y use «Registrar nueva matrícula» desde el historial.',
        codigo: 'ALUMNO_YA_EXISTE',
      });
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

    let grupoId;
    try {
      grupoId = await ensureGrupoConn(conn, {
        colegio_id,
        anio: anioUb,
        nivel_id: nivelIdUb,
        grado: gradoUb,
        seccion: seccionUb,
        turno_id: turnoIdUb,
        sede_id: sedeIdUb,
      });
    } catch (eg) {
      await conn.rollback();
      const st = eg.status && Number(eg.status) >= 400 && Number(eg.status) < 500 ? Number(eg.status) : 400;
      return res.status(st).json({ error: eg.message || 'No se pudo definir el grupo' });
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

    // Solo Regular (0) mantiene cuotas pendientes de esta matrícula; cualquier otro estado limpia pendientes.
    if (estadoMat !== 0) {
      await conn.execute(
        `DELETE FROM pagos
         WHERE matricula_id = ? AND colegio_id = ?
           AND UPPER(TRIM(estado)) = 'ACTIVO'
           AND UPPER(TRIM(estado_pago)) = 'PENDIENTE'`,
        [matriculaId, colegio_id]
      );
    }
    const [cntRegRowsIns] = await conn.execute(
      `SELECT COUNT(*) AS n FROM matriculas WHERE alumno_id = ? AND colegio_id = ? AND estado = 0`,
      [alumnoId, colegio_id]
    );
    const tieneMatriculaActivaAulaIns = Number(cntRegRowsIns[0]?.n || 0) > 0;
    await conn.execute(
      `UPDATE usuarios SET estado = ? WHERE alumno_id = ? AND colegio_id = ? AND tipo = 'ALUMNO'`,
      [tieneMatriculaActivaAulaIns ? 'ACTIVO' : 'INACTIVO', alumnoId, colegio_id]
    );

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
    const st = Number(e.status) >= 400 && Number(e.status) < 600 ? Number(e.status) : 500;
    res.status(st).json({ error: e.message || 'Error al registrar inscripción' });
  } finally {
    conn.release();
  }
});

/**
 * Nueva matrícula para un alumno que ya existe (sin crear alumno ni apoderados).
 * POST /api/admin/usuarios/alumnos/:alumnoId/inscripcion-matricula
 * Body: mismo bloque que inscripción (ubicacion_grupo, costo_modo, costo_id | costo_personalizado, estado_matricula, fecha_registro, modalidad, registrar_linea_pago_matricula, sede_id opcional en raíz).
 */
router.post('/alumnos/:alumnoId/inscripcion-matricula', async (req, res) => {
  const colegio_id = DEFAULT_COLEGIO_ID;
  const alumnoId = parseInt(req.params.alumnoId, 10);
  if (!Number.isFinite(alumnoId) || alumnoId <= 0) {
    return res.status(400).json({ error: 'ID de alumno inválido' });
  }

  const b = req.body || {};
  const ub = b.ubicacion_grupo || b.ubicacion || {};
  const nivelIdUb = parseInt(ub.nivel_id, 10);
  const gradoUb = parseInt(ub.grado, 10);
  const seccionUb = String(ub.seccion || '').trim();
  const turnoIdUb = parseInt(ub.turno_id, 10);
  const anioUb = parseInt(ub.anio, 10);
  let sedeIdUb = DEFAULT_SEDE_ID;
  const rawSede = [ub.sede_id, b.sede_id].find((v) => v != null && v !== '');
  if (rawSede != null && rawSede !== '') {
    const p = parseInt(String(rawSede), 10);
    if (Number.isFinite(p) && p > 0) sedeIdUb = p;
  }

  const costoModo = String(b.costo_modo || 'personalizado').toLowerCase() === 'tarifario' ? 'tarifario' : 'personalizado';
  const estadoMat = parseInt(b.estado_matricula, 10);
  const hoy = fechaMySQLLima();
  const fr = String(b.fecha_registro || hoy).slice(0, 10);
  const modalidad = String(b.modalidad || 'PRESENCIAL').trim().slice(0, 80) || 'PRESENCIAL';
  const registrarLineaPagoMatricula = !!b.registrar_linea_pago_matricula;

  if (![0, 1, 2, 3, 4].includes(estadoMat)) {
    return res.status(400).json({ error: 'Estado de matrícula no válido' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fr)) {
    return res.status(400).json({ error: 'Fecha de registro inválida' });
  }
  if (!Number.isFinite(nivelIdUb) || !Number.isFinite(gradoUb) || !Number.isFinite(turnoIdUb) || !Number.isFinite(anioUb)) {
    return res.status(400).json({ error: 'Complete nivel, grado, sección, turno y año académico' });
  }
  if (!String(seccionUb || '').trim()) {
    return res.status(400).json({ error: 'Indique la sección (letra del grupo)' });
  }

  let montoMatricula;
  let montoPension;
  let costoIdParaMatricula;
  let agendaParaCosto = 0;

  if (costoModo === 'tarifario') {
    const costoId = parseInt(b.costo_id, 10);
    if (!Number.isFinite(costoId)) {
      return res.status(400).json({ error: 'Seleccione una tarifa GENERAL del colegio o use montos personalizados' });
    }
    const cOk = await query(
      `SELECT id, matricula, pension FROM costos WHERE id = ? AND colegio_id = ? AND UPPER(TRIM(COALESCE(tipo, ''))) = 'GENERAL' LIMIT 1`,
      [costoId, colegio_id]
    );
    if (!cOk.length) return res.status(400).json({ error: 'El costo seleccionado no es una tarifa GENERAL válida' });
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

  const alRows = await query(
    'SELECT id, apellido_paterno, apellido_materno, nombres FROM alumnos WHERE id = ? AND colegio_id = ? LIMIT 1',
    [alumnoId, colegio_id]
  );
  if (!alRows.length) {
    return res.status(404).json({ error: 'Alumno no encontrado' });
  }

  const dupMat = await query(
    `SELECT m.id FROM matriculas m
     INNER JOIN grupos g ON g.id = m.grupo_id AND g.colegio_id = m.colegio_id
     WHERE m.alumno_id = ? AND m.colegio_id = ? AND g.anio = ?
     LIMIT 1`,
    [alumnoId, colegio_id, anioUb]
  );
  if (dupMat.length) {
    return res.status(409).json({
      error: 'Este alumno ya tiene una matrícula registrada para ese año académico.',
      codigo: 'MATRICULA_DUPLICADA_ANIO',
    });
  }

  const personal_id = await resolverPersonalIdPago(colegio_id, req.user);
  if (!personal_id) {
    return res.status(400).json({
      error:
        'No hay personal en el colegio para asociar los pagos. Registre al menos un trabajador en el equipo.',
    });
  }

  const conn = await mysqlReadPool.getConnection();
  try {
    await conn.beginTransaction();

    let grupoId;
    try {
      grupoId = await ensureGrupoConn(conn, {
        colegio_id,
        anio: anioUb,
        nivel_id: nivelIdUb,
        grado: gradoUb,
        seccion: seccionUb,
        turno_id: turnoIdUb,
        sede_id: sedeIdUb,
      });
    } catch (eg) {
      await conn.rollback();
      const st = eg.status && Number(eg.status) >= 400 && Number(eg.status) < 500 ? Number(eg.status) : 400;
      return res.status(st).json({ error: eg.message || 'No se pudo definir el grupo' });
    }

    if (costoModo === 'personalizado') {
      const al = alRows[0];
      const nombreCompleto = `${al.apellido_paterno || ''} ${al.apellido_materno || ''} ${al.nombres || ''}`.replace(/\s+/g, ' ').trim();
      costoIdParaMatricula = await insertCostoPersonalizado(conn, {
        colegio_id,
        descripcion: `Costo Personalizado - ${nombreCompleto || `Alumno #${alumnoId}`}`,
        matricula: montoMatricula,
        pension: montoPension,
        agenda: agendaParaCosto,
      });
      if (!costoIdParaMatricula) {
        await conn.rollback();
        return res.status(500).json({ error: 'No se pudo crear el costo personalizado' });
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
        await conn.rollback();
        console.error('INSERT matriculas alumno existente', e1, e2);
        return res.status(500).json({ error: e2.message || 'No se pudo crear la matrícula' });
      }
    }

    if (!matriculaId) {
      await conn.rollback();
      return res.status(500).json({ error: 'No se pudo crear la matrícula' });
    }

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

    /** Solo Regular (0): sin limpieza de pendientes. Cualquier otro estado elimina cuotas pendientes de esta matrícula. */
    if (estadoMat !== 0) {
      await conn.execute(
        `DELETE FROM pagos
         WHERE matricula_id = ? AND colegio_id = ?
           AND UPPER(TRIM(estado)) = 'ACTIVO'
           AND UPPER(TRIM(estado_pago)) = 'PENDIENTE'`,
        [matriculaId, colegio_id]
      );
    }
    const [cntRegRows] = await conn.execute(
      `SELECT COUNT(*) AS n FROM matriculas WHERE alumno_id = ? AND colegio_id = ? AND estado = 0`,
      [alumnoId, colegio_id]
    );
    const tieneMatriculaActivaAula = Number(cntRegRows[0]?.n || 0) > 0;
    await conn.execute(
      `UPDATE usuarios SET estado = ? WHERE alumno_id = ? AND colegio_id = ? AND tipo = 'ALUMNO'`,
      [tieneMatriculaActivaAula ? 'ACTIVO' : 'INACTIVO', alumnoId, colegio_id]
    );

    await conn.commit();
    res.status(201).json({
      ok: true,
      alumno_id: alumnoId,
      matricula_id: matriculaId,
      mensaje:
        'Matrícula registrada. Se generaron las pensiones del año en estado pendiente' +
        (registrarLineaPagoMatricula ? ' y la línea de pago de matrícula.' : '.'),
    });
  } catch (e) {
    try {
      await conn.rollback();
    } catch (r) {
      /* ignore */
    }
    console.error('POST alumnos/:alumnoId/inscripcion-matricula', e);
    const st = Number(e.status) >= 400 && Number(e.status) < 600 ? Number(e.status) : 500;
    res.status(st).json({ error: e.message || 'Error al registrar matrícula' });
  } finally {
    conn.release();
  }
});

const PARENTESCO_MATRICULA = {
  1: 'Padre',
  2: 'Madre',
  3: 'Tutor',
  4: 'Apoderado',
};

const TIPOS_DOCUMENTO_MATRICULA = {
  0: 'DNI',
  1: 'Pasaporte',
  2: 'Partida de Nacimiento',
  3: 'Libreta Electoral',
  4: 'Libreta Militar',
  5: 'Carnet de Extranjería',
  6: 'Licencia de Conducir',
  7: 'Tarjeta de Seguro',
  8: 'Otro',
};

const ESTADOS_MATRICULA_TXT = ['Regular', 'Irregular', 'Retirado', 'Traslado', 'Temporal'];

function nombreMatriculaArchivo(filename) {
  const name = path.basename(String(filename || '').trim());
  if (!name || !/^matricula-(firma|dni)-[\w.\-]+$/i.test(name)) return null;
  return name;
}

function rutaMatriculaArchivo(filename) {
  const name = nombreMatriculaArchivo(filename);
  if (!name) return null;
  const carpetas = name.toLowerCase().startsWith('matricula-dni')
    ? ['Documentos', 'Archivos']
    : ['Archivos', 'Documentos'];
  for (const carpeta of carpetas) {
    const full = joinStaticFs(carpeta, name);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

router.get('/inscripcion-matricula/archivo', (req, res) => {
  const full = rutaMatriculaArchivo(req.query.nombre);
  if (!full) return res.status(404).end();
  res.set('Cache-Control', 'private, max-age=300');
  res.sendFile(full);
});

function fechaLatina(val) {
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    const y = val.getUTCFullYear();
    const mo = String(val.getUTCMonth() + 1).padStart(2, '0');
    const d = String(val.getUTCDate()).padStart(2, '0');
    return `${d}/${mo}/${y}`;
  }
  const s = String(val || '').slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function etiquetaGrado(nivelNombre, grado) {
  const g = parseInt(grado, 10);
  if (!Number.isFinite(g)) return '';
  if (String(nivelNombre || '').toUpperCase().includes('INICIAL')) return `${g} años`;
  return `${g}°`;
}

/**
 * Matrículas enviadas por el padre en el formulario online (con firma).
 * El formulario no guarda el nombre de cada documento: si la fila existe,
 * el padre marcó todos los checks, porque el envío se rechaza si falta uno.
 */
router.get('/inscripcion-matricula/con-firma', async (req, res) => {
  try {
    const colegioId = req.user.colegio_id || DEFAULT_COLEGIO_ID;
    const anio = parseInt(req.query.anio, 10);
    const nivelId = parseInt(req.query.nivel_id, 10);
    const grado = parseInt(req.query.grado, 10);
    const dni = String(req.query.dni || '').replace(/\s/g, '');
    const buscar = String(req.query.buscar || '') === '1';

    const aniosRows = await query(
      `SELECT DISTINCT anio FROM grupos WHERE colegio_id = ? AND anio > 2000 ORDER BY anio DESC`,
      [colegioId]
    );
    const anios = [...new Set((aniosRows || []).map((r) => Number(r.anio)).filter((n) => Number.isFinite(n)))];

    const niveles = await query(
      `SELECT id, nombre FROM niveles WHERE colegio_id = ? ORDER BY nombre`,
      [colegioId]
    );

    if (!buscar) {
      return res.json({ anios, niveles: niveles || [], data: [] });
    }
    if (!Number.isFinite(anio) && !dni) {
      return res.status(400).json({ error: 'Indique el año o el DNI del alumno.' });
    }

    const where = ['m.colegio_id = ?'];
    const params = [colegioId];
    if (Number.isFinite(anio)) {
      where.push('g.anio = ?');
      params.push(anio);
    }
    if (dni) {
      where.push(`REPLACE(TRIM(a.nro_documento), ' ', '') = ?`);
      params.push(dni);
    }
    if (Number.isFinite(nivelId) && nivelId > 0) {
      where.push('g.nivel_id = ?');
      params.push(nivelId);
    }
    if (Number.isFinite(grado)) {
      where.push('g.grado = ?');
      params.push(grado);
    }
    where.push(`(
      a.registro_desde = 'ONLINE'
      OR a.foto_dni LIKE 'matricula-dni%'
      OR ap.firma_digital LIKE 'matricula-firma%'
    )`);

    const rows = await query(
      `SELECT m.id AS matricula_id,
              DATE_FORMAT(m.fecha_registro, '%Y-%m-%d') AS fecha_registro,
              m.estado,
              a.nombres, a.apellido_paterno, a.apellido_materno, a.nro_documento,
              DATE_FORMAT(a.fecha_nacimiento, '%Y-%m-%d') AS fecha_nacimiento,
              a.sexo, a.email AS alumno_email, a.domicilio,
              a.seguro_id, a.tipo_documento, a.foto_dni, a.registro_desde,
              n.nombre AS nivel_nombre, g.grado, g.anio, g.seccion,
              ap.nombres AS ap_nombres, ap.apellido_paterno AS ap_paterno, ap.apellido_materno AS ap_materno,
              ap.nro_documento AS ap_documento, ap.email AS ap_email, ap.telefono_celular AS ap_celular,
              ap.direccion AS ap_direccion, ap.parentesco,
              DATE_FORMAT(ap.fecha_nacimiento, '%Y-%m-%d') AS ap_nacimiento,
              ap.firma_digital
       FROM matriculas m
       INNER JOIN alumnos a ON a.id = m.alumno_id AND a.colegio_id = m.colegio_id
       INNER JOIN grupos g ON g.id = m.grupo_id AND g.colegio_id = m.colegio_id
       INNER JOIN niveles n ON n.id = g.nivel_id
       LEFT JOIN apoderados ap ON ap.colegio_id = m.colegio_id AND ap.id = (
           SELECT ap2.id
           FROM familias f2
           INNER JOIN apoderados ap2 ON ap2.id = f2.apoderado_id AND ap2.colegio_id = m.colegio_id
           WHERE f2.alumno_id = a.id
           ORDER BY (ap2.firma_digital LIKE 'matricula-firma%') DESC, f2.id ASC
           LIMIT 1
         )
       WHERE ${where.join(' AND ')}
       ORDER BY n.nombre, g.grado, a.apellido_paterno, a.apellido_materno, a.nombres, m.id`,
      params
    );

    const data = (rows || []).map((r) => {
      const estadoN = Number(r.estado);
      return {
        matricula_id: r.matricula_id,
        fecha: fechaLatina(r.fecha_registro),
        estado: ESTADOS_MATRICULA_TXT[estadoN] || `Cód. ${r.estado}`,
        anio: r.anio,
        nivel: r.nivel_nombre || '',
        grado: etiquetaGrado(r.nivel_nombre, r.grado),
        seccion: r.seccion || '',
        alumno: {
          documento: r.nro_documento || '',
          tipo_documento: TIPOS_DOCUMENTO_MATRICULA[Number(r.tipo_documento)] || 'DNI',
          apellido_paterno: r.apellido_paterno || '',
          apellido_materno: r.apellido_materno || '',
          nombres: r.nombres || '',
          nacimiento: fechaLatina(r.fecha_nacimiento),
          sexo: r.sexo == null || r.sexo === '' ? '' : Number(r.sexo) === 1 ? 'Femenino' : 'Masculino',
          email: r.alumno_email || '',
          domicilio: r.domicilio || '',
          seguro: etiquetaSeguro(r.seguro_id),
          foto_dni_archivo: nombreMatriculaArchivo(r.foto_dni),
        },
        apoderado: {
          parentesco: PARENTESCO_MATRICULA[Number(r.parentesco)] || '',
          documento: r.ap_documento || '',
          apellido_paterno: r.ap_paterno || '',
          apellido_materno: r.ap_materno || '',
          nombres: r.ap_nombres || '',
          nacimiento: fechaLatina(r.ap_nacimiento),
          email: r.ap_email || '',
          celular: r.ap_celular || '',
          direccion: r.ap_direccion || '',
          firma_archivo: nombreMatriculaArchivo(r.firma_digital),
        },
        documentos_aceptados: true,
      };
    });

    res.json({ anios, niveles: niveles || [], data });
  } catch (e) {
    console.error('GET inscripcion-matricula/con-firma', e);
    res.status(500).json({ error: e.message || 'No se pudo cargar el reporte' });
  }
});

module.exports = router;
