/**
 * Apertura de un colegio en una base vacía, y carga posterior del padrón.
 * No borra un colegio que ya existe. El padrón solo agrega; un DNI repetido se omite.
 */
const crypto = require('crypto');
const ExcelJS = require('exceljs');
const { query, mysqlReadPool } = require('./mysql');
const { fechaMySQLLima } = require('./fechaHoraLima');

const PERFILES = new Set([
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
  'CONTADOR',
  'TUTOR',
  'MANTENIMIENTO',
]);

const NIVELES_BASE = {
  INICIAL: { grado_minimo: 3, grado_maximo: 5, tipo_calificacion: 0, tolerancia_minutos: 15 },
  PRIMARIA: { grado_minimo: 1, grado_maximo: 6, tipo_calificacion: 1, tolerancia_minutos: 10 },
  SECUNDARIA: { grado_minimo: 1, grado_maximo: 5, tipo_calificacion: 1, tolerancia_minutos: 10 },
};

function sha1(plain) {
  return crypto.createHash('sha1').update(String(plain), 'utf8').digest('hex');
}

function norm(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function textoCelda(v) {
  if (v == null) return '';
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text || '').join('').trim();
    if (v.text != null) return String(v.text).trim();
    if (v.result != null) return textoCelda(v.result);
  }
  return String(v).trim();
}

function claveInstalacionOk(dada) {
  const espera = String(process.env.APERTURA_CLAVE || '');
  if (espera.length < 8) return 'falta';
  const a = Buffer.from(String(dada || ''), 'utf8');
  const b = Buffer.from(espera, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return 'mala';
  return 'ok';
}

async function contarColegios() {
  const [row] = await query('SELECT COUNT(*) AS n FROM colegios');
  return Number(row?.n) || 0;
}

async function estadoPublico() {
  const n = await contarColegios();
  const faltaClave = String(process.env.APERTURA_CLAVE || '').length < 8;
  return {
    necesita_instalacion: n === 0,
    clave_configurada: !faltaClave,
  };
}

async function columnas(conn, table) {
  const [rows] = await conn.execute(
    `SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return new Set((rows || []).map((r) => r.c));
}

function primerEnum(columnType) {
  const m = String(columnType || '').match(/^enum\((.*)\)$/i);
  if (!m) return '';
  const first = (m[1].split(',')[0] || '').trim();
  return first.replace(/^'/, '').replace(/'$/, '').replace(/''/g, "'");
}

async function insertar(conn, table, data) {
  const [meta] = await conn.execute(
    `SELECT COLUMN_NAME AS c, IS_NULLABLE AS nulo, COLUMN_DEFAULT AS def, DATA_TYPE AS tipo, COLUMN_TYPE AS ctype, EXTRA AS extra
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  const existentes = new Set((meta || []).map((col) => col.c));
  const full = {};
  Object.keys(data).forEach((k) => {
    if (existentes.has(k) && data[k] !== undefined) full[k] = data[k];
  });
  for (const col of meta || []) {
    if (String(col.extra || '').includes('auto_increment')) continue;
    if (full[col.c] !== undefined) continue;
    if (col.nulo === 'YES' || col.def != null) continue;
    const tipo = String(col.tipo);
    if (['int', 'bigint', 'decimal', 'float', 'double', 'tinyint', 'smallint', 'mediumint'].includes(tipo)) full[col.c] = 0;
    else if (tipo === 'date') full[col.c] = fechaMySQLLima();
    else if (tipo === 'datetime' || tipo === 'timestamp') full[col.c] = `${fechaMySQLLima()} 00:00:00`;
    else if (tipo === 'enum') full[col.c] = primerEnum(col.ctype);
    else full[col.c] = '';
  }
  const keys = Object.keys(full);
  if (!keys.length) {
    const err = new Error(`La tabla ${table} no aceptó ningún dato.`);
    err.status = 500;
    throw err;
  }
  const [r] = await conn.execute(
    `INSERT INTO \`${table}\` (${keys.map((k) => `\`${k}\``).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
    keys.map((k) => full[k])
  );
  return r.insertId;
}

async function upsertConfig(conn, clave, valor) {
  const [ex] = await conn.execute('SELECT clave FROM config WHERE clave = ? LIMIT 1', [clave]);
  if (ex.length) {
    await conn.execute('UPDATE config SET valor = ? WHERE clave = ?', [String(valor ?? ''), clave]);
  } else {
    await conn.execute('INSERT INTO config (clave, valor) VALUES (?, ?)', [clave, String(valor ?? '')]);
  }
}

function entero(v, fallback) {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

function dinero(v) {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function dniOk(v) {
  const s = String(v || '').trim();
  return s.length >= 6 && s.length <= 15 ? s : '';
}

function parentescoDe(v) {
  const t = norm(v);
  if (t === '1' || t === 'padre' || t === 'papa') return 1;
  if (t === '2' || t === 'madre' || t === 'mama') return 2;
  if (t === '4' || t === 'otro') return 4;
  return 3;
}

function sexoDe(v) {
  const t = norm(v);
  if (t === 'm' || t === '1' || t === 'masculino' || t === 'hombre') return 1;
  return 0;
}

function nivelClave(nombre) {
  const t = norm(nombre);
  if (t.includes('inicial')) return 'INICIAL';
  if (t.includes('primaria')) return 'PRIMARIA';
  if (t.includes('secundaria')) return 'SECUNDARIA';
  return '';
}

function hoja(wb, ...nombres) {
  const want = new Set(nombres.map(norm));
  return wb.worksheets.find((w) => want.has(norm(w.name))) || null;
}

function filasHoja(ws) {
  if (!ws) return [];
  const header = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    header[col] = norm(textoCelda(cell.value));
  });
  const out = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const obj = { _fila: n };
    let vacia = true;
    header.forEach((h, col) => {
      if (!h) return;
      const val = textoCelda(row.getCell(col).value);
      if (val) vacia = false;
      obj[h] = val;
    });
    if (!vacia) out.push(obj);
  });
  return out;
}

function leerPadron(buffer) {
  return (async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    return {
      aulas: filasHoja(hoja(wb, 'aulas', 'grupos')),
      personal: filasHoja(hoja(wb, 'personal')),
      alumnos: filasHoja(hoja(wb, 'alumnos')),
      apoderados: filasHoja(hoja(wb, 'apoderados')),
      vinculos: filasHoja(hoja(wb, 'vinculos', 'vinculos')),
      matriculas: filasHoja(hoja(wb, 'matriculas')),
    };
  })();
}

function tomar(row, ...keys) {
  for (const k of keys) {
    if (row[k]) return row[k];
  }
  return '';
}

async function revisarPadron(colegioId, hojas) {
  const errores = [];
  const push = (hojaNombre, fila, texto) => {
    if (errores.length < 80) errores.push({ hoja: hojaNombre, fila, texto });
  };
  const aulas = [];
  const personal = [];
  const alumnos = [];
  const apoderados = [];
  const vinculos = [];
  const matriculas = [];
  const vistos = { personal: new Set(), alumnos: new Set(), apoderados: new Set() };

  const niveles = await query('SELECT id, nombre FROM niveles WHERE colegio_id = ?', [colegioId]);
  const nivelPorClave = new Map();
  (niveles || []).forEach((n) => {
    const c = nivelClave(n.nombre);
    if (c) nivelPorClave.set(c, n);
  });

  (hojas.aulas || []).forEach((r) => {
    const clave = nivelClave(tomar(r, 'nivel'));
    const grado = entero(tomar(r, 'grado'), NaN);
    const seccion = String(tomar(r, 'seccion') || '').trim().toUpperCase();
    if (!clave || !nivelPorClave.has(clave)) {
      push('Aulas', r._fila, 'El nivel debe ser Inicial, Primaria o Secundaria, y tiene que existir en el colegio.');
      return;
    }
    if (!Number.isFinite(grado) || !seccion) {
      push('Aulas', r._fila, 'Faltan grado o sección.');
      return;
    }
    aulas.push({
      sede: tomar(r, 'sede') || 'Principal',
      turno: tomar(r, 'turno') || 'Mañana',
      anio: entero(tomar(r, 'anio'), 0),
      nivelId: nivelPorClave.get(clave).id,
      nivel: clave,
      grado,
      seccion,
    });
  });

  (hojas.personal || []).forEach((r) => {
    const dni = dniOk(tomar(r, 'dni', 'nro_documento', 'documento'));
    const nombres = tomar(r, 'nombres', 'nombre');
    const apellidos = tomar(r, 'apellidos', 'apellido');
    const perfil = String(tomar(r, 'perfil', 'tipo') || 'DOCENTE').toUpperCase();
    if (!dni || !nombres || !apellidos) {
      push('Personal', r._fila, 'DNI, nombres y apellidos son obligatorios.');
      return;
    }
    if (!PERFILES.has(perfil)) {
      push('Personal', r._fila, `El perfil ${perfil} no se puede crear desde el padrón.`);
      return;
    }
    if (vistos.personal.has(dni)) {
      push('Personal', r._fila, `El DNI ${dni} está repetido en la hoja.`);
      return;
    }
    vistos.personal.add(dni);
    personal.push({
      dni,
      nombres,
      apellidos,
      correo: tomar(r, 'correo', 'email'),
      cargo: tomar(r, 'cargo') || perfil,
      perfil,
    });
  });

  (hojas.alumnos || []).forEach((r) => {
    const dni = dniOk(tomar(r, 'dni', 'nro_documento', 'documento'));
    const nombres = tomar(r, 'nombres', 'nombre');
    const ap = tomar(r, 'apellido_paterno', 'apellido');
    if (!dni || !nombres || !ap) {
      push('Alumnos', r._fila, 'DNI, nombres y apellido paterno son obligatorios.');
      return;
    }
    if (vistos.alumnos.has(dni)) {
      push('Alumnos', r._fila, `El DNI ${dni} está repetido en la hoja.`);
      return;
    }
    vistos.alumnos.add(dni);
    alumnos.push({
      dni,
      nombres,
      apellido_paterno: ap,
      apellido_materno: tomar(r, 'apellido_materno'),
      sexo: sexoDe(tomar(r, 'sexo')),
      fecha_nacimiento: tomar(r, 'fecha_nacimiento') || '2015-01-01',
    });
  });

  (hojas.apoderados || []).forEach((r) => {
    const dni = dniOk(tomar(r, 'dni', 'nro_documento', 'documento'));
    const nombres = tomar(r, 'nombres', 'nombre');
    const ap = tomar(r, 'apellido_paterno', 'apellido');
    if (!dni || !nombres || !ap) {
      push('Apoderados', r._fila, 'DNI, nombres y apellido paterno son obligatorios.');
      return;
    }
    if (vistos.apoderados.has(dni)) {
      push('Apoderados', r._fila, `El DNI ${dni} está repetido en la hoja.`);
      return;
    }
    vistos.apoderados.add(dni);
    apoderados.push({
      dni,
      nombres,
      apellido_paterno: ap,
      apellido_materno: tomar(r, 'apellido_materno'),
      celular: tomar(r, 'celular', 'telefono', 'telefono_celular'),
      correo: tomar(r, 'correo', 'email'),
      parentesco: parentescoDe(tomar(r, 'parentesco')),
    });
  });

  const alumnosArchivo = new Set(alumnos.map((a) => a.dni));
  const apoderadosArchivo = new Set(apoderados.map((a) => a.dni));
  for (const r of hojas.vinculos || []) {
    const da = dniOk(tomar(r, 'dni_alumno', 'alumno', 'dni_del_alumno'));
    const dp = dniOk(tomar(r, 'dni_apoderado', 'apoderado', 'dni_del_apoderado'));
    if (!da || !dp) {
      push('Vinculos', r._fila, 'Faltan el DNI del alumno o el del apoderado.');
      continue;
    }
    if (!alumnosArchivo.has(da)) {
      const [yaAl] = await query('SELECT id FROM alumnos WHERE colegio_id = ? AND nro_documento = ? LIMIT 1', [colegioId, da]);
      if (!yaAl) {
        push('Vinculos', r._fila, `El alumno ${da} no está en la hoja ni en el colegio.`);
        continue;
      }
    }
    if (!apoderadosArchivo.has(dp)) {
      const [yaAp] = await query('SELECT id FROM apoderados WHERE colegio_id = ? AND nro_documento = ? LIMIT 1', [colegioId, dp]);
      if (!yaAp) {
        push('Vinculos', r._fila, `El apoderado ${dp} no está en la hoja ni en el colegio.`);
        continue;
      }
    }
    vinculos.push({ dni_alumno: da, dni_apoderado: dp });
  }

  for (const r of hojas.matriculas || []) {
    const dni = dniOk(tomar(r, 'dni_alumno', 'dni', 'alumno'));
    const clave = nivelClave(tomar(r, 'nivel'));
    const grado = entero(tomar(r, 'grado'), NaN);
    const seccion = String(tomar(r, 'seccion') || '').trim().toUpperCase();
    if (!dni || !clave || !Number.isFinite(grado) || !seccion) {
      push('Matriculas', r._fila, 'Hacen falta DNI del alumno, nivel, grado y sección.');
      continue;
    }
    if (!nivelPorClave.has(clave)) {
      push('Matriculas', r._fila, 'Ese nivel no existe en el colegio.');
      continue;
    }
    if (!alumnosArchivo.has(dni)) {
      const [yaAl] = await query('SELECT id FROM alumnos WHERE colegio_id = ? AND nro_documento = ? LIMIT 1', [colegioId, dni]);
      if (!yaAl) {
        push('Matriculas', r._fila, `El alumno ${dni} no está en la hoja ni en el colegio.`);
        continue;
      }
    }
    matriculas.push({
      dni,
      nivelId: nivelPorClave.get(clave).id,
      nivel: clave,
      grado,
      seccion,
      sede: tomar(r, 'sede') || 'Principal',
      turno: tomar(r, 'turno') || 'Mañana',
      anio: entero(tomar(r, 'anio'), 0),
      matricula: dinero(tomar(r, 'matricula')),
      pension: dinero(tomar(r, 'pension')),
      agenda: dinero(tomar(r, 'agenda')),
    });
  }

  const total = aulas.length + personal.length + alumnos.length + apoderados.length + vinculos.length + matriculas.length;
  if (!total) errores.unshift({ hoja: 'Archivo', fila: 0, texto: 'El Excel no trae filas para cargar.' });
  if (total > 8000) errores.unshift({ hoja: 'Archivo', fila: 0, texto: 'El archivo pasa de 8000 filas. Divídalo.' });

  return {
    resumen: {
      aulas: aulas.length,
      personal: personal.length,
      alumnos: alumnos.length,
      apoderados: apoderados.length,
      vinculos: vinculos.length,
      matriculas: matriculas.length,
    },
    errores,
    plan: { aulas, personal, alumnos, apoderados, vinculos, matriculas },
  };
}

async function buscarId(conn, sql, params) {
  const [rows] = await conn.execute(sql, params);
  return rows[0]?.id || null;
}

async function asegurarSede(conn, colegioId, nombre) {
  const nom = String(nombre || 'Principal').trim().slice(0, 120) || 'Principal';
  const id = await buscarId(
    conn,
    'SELECT id FROM sedes WHERE colegio_id = ? AND UPPER(TRIM(nombre)) = UPPER(?) LIMIT 1',
    [colegioId, nom]
  );
  if (id) return id;
  return insertar(conn, 'sedes', { colegio_id: colegioId, nombre: nom });
}

async function asegurarTurno(conn, colegioId, nombre) {
  const nom = String(nombre || 'Mañana').trim().slice(0, 80) || 'Mañana';
  const cols = await columnas(conn, 'turnos');
  if (cols.has('colegio_id')) {
    const id = await buscarId(
      conn,
      'SELECT id FROM turnos WHERE colegio_id = ? AND UPPER(TRIM(nombre)) = UPPER(?) LIMIT 1',
      [colegioId, nom]
    );
    if (id) return id;
    return insertar(conn, 'turnos', { colegio_id: colegioId, nombre: nom });
  }
  const id = await buscarId(
    conn,
    'SELECT id FROM turnos WHERE UPPER(TRIM(nombre)) = UPPER(?) LIMIT 1',
    [nom]
  );
  if (id) return id;
  return insertar(conn, 'turnos', { nombre: nom });
}

async function asegurarGrupo(conn, colegioId, aula, anioDef) {
  const anio = aula.anio > 2000 ? aula.anio : anioDef;
  const sedeId = await asegurarSede(conn, colegioId, aula.sede);
  const turnoId = await asegurarTurno(conn, colegioId, aula.turno);
  const id = await buscarId(
    conn,
    `SELECT id FROM grupos
     WHERE colegio_id = ? AND anio = ? AND nivel_id = ? AND grado = ?
       AND UPPER(TRIM(seccion)) = ? AND turno_id = ? AND sede_id = ?
     LIMIT 1`,
    [colegioId, anio, aula.nivelId, aula.grado, aula.seccion, turnoId, sedeId]
  );
  if (id) return id;
  const cols = await columnas(conn, 'grupos');
  const fila = {
    colegio_id: colegioId,
    anio,
    nivel_id: aula.nivelId,
    grado: aula.grado,
    seccion: aula.seccion,
    turno_id: turnoId,
    sede_id: sedeId,
  };
  if (cols.has('tutor_id')) {
    const [meta] = await conn.execute(
      `SELECT IS_NULLABLE AS n FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'grupos' AND COLUMN_NAME = 'tutor_id' LIMIT 1`
    );
    fila.tutor_id = meta[0]?.n === 'YES' ? null : 0;
  }
  return insertar(conn, 'grupos', fila);
}

async function crearUsuario(conn, data) {
  return insertar(conn, 'usuarios', {
    colegio_id: data.colegioId,
    alumno_id: data.alumnoId || 0,
    personal_id: data.personalId || 0,
    apoderado_id: data.apoderadoId || 0,
    usuario: data.usuario,
    password: data.password,
    tipo: data.tipo,
    estado: 'ACTIVO',
    ms_email: '',
    ms_access_token: '',
    ms_refresh_token: '',
    ms_id_token: '',
    auth_token: '',
    permisos: '',
    cambiar_password: data.cambiar || 'NO',
    app_terminos_aceptados: 'NO',
    cambiar_datos: 'SI',
  });
}

async function aplicarPlan(conn, colegioId, anio, plan) {
  const hoy = fechaMySQLLima();
  const omitidos = [];
  const creados = { aulas: 0, personal: 0, alumnos: 0, apoderados: 0, vinculos: 0, matriculas: 0 };
  const alumnoId = new Map();
  const apoderadoId = new Map();

  for (const aula of plan.aulas) {
    const antes = await buscarId(
      conn,
      `SELECT g.id FROM grupos g
       INNER JOIN sedes s ON s.id = g.sede_id
       INNER JOIN turnos t ON t.id = g.turno_id
       WHERE g.colegio_id = ? AND g.anio = ? AND g.nivel_id = ? AND g.grado = ?
         AND UPPER(TRIM(g.seccion)) = ? AND UPPER(TRIM(s.nombre)) = UPPER(?) AND UPPER(TRIM(t.nombre)) = UPPER(?)
       LIMIT 1`,
      [colegioId, aula.anio > 2000 ? aula.anio : anio, aula.nivelId, aula.grado, aula.seccion, aula.sede, aula.turno]
    );
    await asegurarGrupo(conn, colegioId, aula, anio);
    if (!antes) creados.aulas += 1;
  }

  for (const p of plan.personal) {
    const ya = await buscarId(conn, 'SELECT id FROM personal WHERE colegio_id = ? AND nro_documento = ? LIMIT 1', [colegioId, p.dni]);
    if (ya) {
      omitidos.push(`Personal ${p.dni} ya existía.`);
      continue;
    }
    const usuarioYa = await buscarId(conn, 'SELECT id FROM usuarios WHERE colegio_id = ? AND usuario = ? LIMIT 1', [colegioId, p.dni]);
    if (usuarioYa) {
      omitidos.push(`El DNI ${p.dni} ya es un usuario. No se creó como personal.`);
      continue;
    }
    const personalId = await insertar(conn, 'personal', {
      colegio_id: colegioId,
      sexo: 0,
      telefono_fijo: '',
      telefono_celular: '',
      linea_celular: 0,
      direccion: '',
      foto: '',
      nombres: p.nombres,
      apellidos: p.apellidos,
      tipo_documento: 1,
      nro_documento: p.dni,
      grado_instruccion: 0,
      profesion: '',
      cargo: p.cargo,
      email: p.correo,
      fecha_nacimiento: '1990-01-01',
      pais_nacimiento_id: 0,
      estado_civil: 0,
      tipo_contrato: 0,
      observaciones: 'Apertura',
      departamento_nacimiento_id: 0,
      provincia_nacimiento_id: 0,
      distrito_nacimiento_id: 0,
      domicilio_pais_id: 0,
      domicilio_departamento_id: 0,
      domicilio_provincia_id: 0,
      domicilio_distrito_id: 0,
      fecha_ingreso: hoy,
      hora_entrada: '08:00:00',
      hora_salida: '17:00:00',
      resena: '',
      mostrar_app: 'NO',
      link_aula: '',
    });
    const libre = await buscarId(conn, 'SELECT id FROM usuarios WHERE colegio_id = ? AND usuario = ? LIMIT 1', [colegioId, p.dni]);
    if (!libre) {
      await crearUsuario(conn, {
        colegioId,
        personalId,
        usuario: p.dni,
        password: sha1(p.dni),
        tipo: p.perfil,
        cambiar: 'SI',
      });
    }
    creados.personal += 1;
  }

  for (const a of plan.alumnos) {
    const ya = await buscarId(conn, 'SELECT id FROM alumnos WHERE colegio_id = ? AND nro_documento = ? LIMIT 1', [colegioId, a.dni]);
    if (ya) {
      alumnoId.set(a.dni, ya);
      omitidos.push(`Alumno ${a.dni} ya existía.`);
      continue;
    }
    const id = await insertar(conn, 'alumnos', {
      colegio_id: colegioId,
      apellido_paterno: a.apellido_paterno,
      apellido_materno: a.apellido_materno,
      nombres: a.nombres,
      estado_civil: 0,
      tipo_documento: 1,
      nro_documento: a.dni,
      fecha_nacimiento: String(a.fecha_nacimiento).slice(0, 10),
      pais_nacimiento_id: 0,
      departamento_nacimiento_id: 0,
      provincia_nacimiento_id: 0,
      distrito_nacimiento_id: 0,
      sexo: a.sexo,
      email: '',
      foto: '',
      fecha_inscripcion: hoy,
      observaciones: 'Apertura',
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
    });
    alumnoId.set(a.dni, id);
    const libre = await buscarId(conn, 'SELECT id FROM usuarios WHERE colegio_id = ? AND usuario = ? LIMIT 1', [colegioId, a.dni]);
    if (!libre) {
      await crearUsuario(conn, {
        colegioId,
        alumnoId: id,
        usuario: a.dni,
        password: sha1(a.dni),
        tipo: 'ALUMNO',
        cambiar: 'NO',
      });
    }
    creados.alumnos += 1;
  }

  for (const a of plan.apoderados) {
    const ya = await buscarId(conn, 'SELECT id FROM apoderados WHERE colegio_id = ? AND nro_documento = ? LIMIT 1', [colegioId, a.dni]);
    if (ya) {
      apoderadoId.set(a.dni, ya);
      omitidos.push(`Apoderado ${a.dni} ya existía.`);
      continue;
    }
    const id = await insertar(conn, 'apoderados', {
      colegio_id: colegioId,
      nombres: a.nombres,
      apellido_paterno: a.apellido_paterno,
      apellido_materno: a.apellido_materno,
      vive: 'SI',
      tipo_documento: 1,
      nro_documento: a.dni,
      estado_civil: 0,
      telefono_fijo: '',
      telefono_celular: a.celular,
      direccion: '',
      centro_trabajo_direccion: '',
      grado_instruccion: 0,
      ocupacion: '',
      parentesco: a.parentesco,
      vive_con_estudiante: 'SI',
      fecha_nacimiento: '1980-01-01',
      pais_nacimiento_id: 0,
      email: a.correo,
      foto: null,
      firma_digital: '',
    });
    apoderadoId.set(a.dni, id);
    const libre = await buscarId(conn, 'SELECT id FROM usuarios WHERE colegio_id = ? AND usuario = ? LIMIT 1', [colegioId, a.dni]);
    if (!libre) {
      await crearUsuario(conn, {
        colegioId,
        apoderadoId: id,
        usuario: a.dni,
        password: sha1(a.dni),
        tipo: 'APODERADO',
        cambiar: 'NO',
      });
    }
    creados.apoderados += 1;
  }

  for (const v of plan.vinculos) {
    let aid = alumnoId.get(v.dni_alumno);
    if (!aid) aid = await buscarId(conn, 'SELECT id FROM alumnos WHERE colegio_id = ? AND nro_documento = ? LIMIT 1', [colegioId, v.dni_alumno]);
    let pid = apoderadoId.get(v.dni_apoderado);
    if (!pid) pid = await buscarId(conn, 'SELECT id FROM apoderados WHERE colegio_id = ? AND nro_documento = ? LIMIT 1', [colegioId, v.dni_apoderado]);
    if (!aid || !pid) {
      const err = new Error(`No se encontró el alumno ${v.dni_alumno} o el apoderado ${v.dni_apoderado} para el vínculo.`);
      err.status = 400;
      throw err;
    }
    const ya = await buscarId(conn, 'SELECT alumno_id AS id FROM familias WHERE alumno_id = ? AND apoderado_id = ? LIMIT 1', [aid, pid]);
    if (ya) continue;
    await conn.execute('INSERT INTO familias (alumno_id, apoderado_id) VALUES (?, ?)', [aid, pid]);
    creados.vinculos += 1;
  }

  for (const m of plan.matriculas) {
    let aid = alumnoId.get(m.dni);
    if (!aid) aid = await buscarId(conn, 'SELECT id FROM alumnos WHERE colegio_id = ? AND nro_documento = ? LIMIT 1', [colegioId, m.dni]);
    if (!aid) {
      const err = new Error(`La matrícula del DNI ${m.dni} no tiene alumno cargado.`);
      err.status = 400;
      throw err;
    }
    const grupoId = await asegurarGrupo(conn, colegioId, m, anio);
    const ya = await buscarId(
      conn,
      `SELECT id FROM matriculas WHERE colegio_id = ? AND alumno_id = ? AND grupo_id = ? AND estado NOT IN (2, 3) LIMIT 1`,
      [colegioId, aid, grupoId]
    );
    if (ya) {
      omitidos.push(`El alumno ${m.dni} ya está en esa aula.`);
      continue;
    }
    const costoId = await insertar(conn, 'costos', {
      colegio_id: colegioId,
      descripcion: `Apertura ${m.nivel} ${m.grado} ${m.seccion}`.slice(0, 255),
      matricula: m.matricula,
      pension: m.pension,
      agenda: m.agenda,
      tipo: 'PERSONAL',
    });
    const filaMat = {
      colegio_id: colegioId,
      alumno_id: aid,
      grupo_id: grupoId,
      costo_id: costoId,
      fecha_registro: hoy,
      estado: 0,
      modalidad: 'PRESENCIAL',
      ocultar: 'NO',
      descontar: 'SI',
    };
    await insertar(conn, 'matriculas', filaMat);
    creados.matriculas += 1;
  }

  return { creados, omitidos: omitidos.slice(0, 40) };
}

async function conTransaccion(trabajo) {
  const conn = await mysqlReadPool.getConnection();
  try {
    await conn.beginTransaction();
    const out = await trabajo(conn);
    await conn.commit();
    return out;
  } catch (e) {
    try { await conn.rollback(); } catch (_) { /* ya cerrada */ }
    throw e;
  } finally {
    conn.release();
  }
}

async function cargarPadron(colegioId, buffer, aplicar) {
  const hojas = await leerPadron(buffer);
  const rev = await revisarPadron(colegioId, hojas);
  if (rev.errores.length || !aplicar) {
    return { ok: rev.errores.length === 0, ...rev, aplicado: false };
  }
  const [col] = await query('SELECT anio_activo FROM colegios WHERE id = ? LIMIT 1', [colegioId]);
  const anio = entero(col?.anio_activo, new Date().getFullYear());
  const resultado = await conTransaccion((conn) => aplicarPlan(conn, colegioId, anio, rev.plan));
  return { ok: true, resumen: rev.resumen, errores: [], aplicado: true, ...resultado };
}

function validarPersona(p, etiqueta) {
  const dni = dniOk(p?.dni);
  const nombres = String(p?.nombres || '').trim();
  const apellidos = String(p?.apellidos || '').trim();
  const password = String(p?.password || '');
  if (!dni) return `El DNI de ${etiqueta} no es válido.`;
  if (!nombres || !apellidos) return `Faltan nombres o apellidos de ${etiqueta}.`;
  if (password.length < 8) return `La clave de ${etiqueta} debe tener al menos 8 caracteres.`;
  return '';
}

async function instalarColegio(body) {
  if (await contarColegios() > 0) {
    const err = new Error('Esta base ya tiene un colegio. No se crea otro.');
    err.status = 409;
    throw err;
  }
  const clave = claveInstalacionOk(body?.clave);
  if (clave === 'falta') {
    const err = new Error('En el servidor falta APERTURA_CLAVE, de al menos 8 caracteres. Agréguela y reinicie el proceso.');
    err.status = 503;
    throw err;
  }
  if (clave !== 'ok') {
    const err = new Error('La clave de instalación no coincide.');
    err.status = 403;
    throw err;
  }
  const c = body?.colegio || {};
  const nombre = String(c.nombre || '').trim();
  if (nombre.length < 3) {
    const err = new Error('Escriba el nombre del colegio.');
    err.status = 400;
    throw err;
  }
  const anio = entero(c.anio_activo, 0);
  if (anio < 2020 || anio > 2100) {
    const err = new Error('El año activo no es válido.');
    err.status = 400;
    throw err;
  }
  const nivelesPedidos = Array.isArray(body?.niveles) ? body.niveles : [];
  const niveles = nivelesPedidos
    .map((n) => {
      const claveN = nivelClave(n?.nombre);
      if (!claveN || !NIVELES_BASE[claveN]) return null;
      const base = NIVELES_BASE[claveN];
      const tipo = claveN === 'INICIAL' ? 0 : (entero(n?.tipo_calificacion, base.tipo_calificacion) === 0 ? 0 : 1);
      return { nombre: claveN, ...base, tipo_calificacion: tipo };
    })
    .filter(Boolean);
  if (!niveles.length) {
    const err = new Error('Elija al menos un nivel.');
    err.status = 400;
    throw err;
  }
  const errSuper = validarPersona(body?.superadmin, 'quien instala');
  const errAdmin = validarPersona(body?.administrador, 'el administrador del colegio');
  if (errSuper || errAdmin) {
    const err = new Error(errSuper || errAdmin);
    err.status = 400;
    throw err;
  }
  if (dniOk(body.superadmin.dni) === dniOk(body.administrador.dni)) {
    const err = new Error('El super administrador y el administrador del colegio deben tener DNI distintos.');
    err.status = 400;
    throw err;
  }

  const conn = await mysqlReadPool.getConnection();
  try {
    const [lock] = await conn.execute(`SELECT GET_LOCK('apertura_colegio', 15) AS l`);
    if (Number(lock[0]?.l) !== 1) {
      const err = new Error('Otra apertura está en curso. Espere un momento.');
      err.status = 409;
      throw err;
    }
    await conn.beginTransaction();
    const [cuenta] = await conn.execute('SELECT COUNT(*) AS n FROM colegios');
    if (Number(cuenta[0]?.n) > 0) {
      const err = new Error('Esta base ya tiene un colegio. No se crea otro.');
      err.status = 409;
      throw err;
    }
    const colegioId = await insertar(conn, 'colegios', {
      nombre,
      alias: nombre.slice(0, 100),
      estado: 'ACTIVO',
      fecha_registro: fechaMySQLLima(),
      titulo_intranet: String(c.titulo_intranet || nombre).trim(),
      anio_activo: anio,
      anio_matriculas: entero(c.anio_matriculas, anio),
      bloquear_deudores: 'NO',
      dias_tolerancia: entero(c.dias_tolerancia, 5),
      ciclo_pensiones: entero(c.ciclo_pensiones, 4),
      inicio_pensiones: entero(c.inicio_pensiones, 3),
      total_pensiones: entero(c.total_pensiones, 10),
      ciclo_notas: entero(c.ciclo_notas, 4),
      inicio_notas: entero(c.inicio_notas, 1),
      total_notas: entero(c.total_notas, 4),
      moneda: 'S/',
      ruc: String(c.ruc || '').trim(),
      razon_social: String(c.razon_social || nombre).trim(),
      direccion: String(c.direccion || '').trim(),
      codigo_modular: String(c.codigo_modular || '').trim(),
      resolucion_creacion: String(c.resolucion_creacion || '').trim(),
      ugel_codigo: String(c.ugel_codigo || '').trim(),
      ugel_nombre: String(c.ugel_nombre || '').trim(),
      monto_adicional: 0,
    });
    for (const n of niveles) {
      await insertar(conn, 'niveles', { colegio_id: colegioId, ...n });
    }
    await asegurarSede(conn, colegioId, 'Principal');
    await asegurarTurno(conn, colegioId, 'Mañana');

    const crearPersona = async (p, tipo) => {
      const personalId = await insertar(conn, 'personal', {
        colegio_id: colegioId,
        sexo: 0,
        telefono_fijo: '',
        telefono_celular: '',
        linea_celular: 0,
        direccion: '',
        foto: '',
        nombres: String(p.nombres).trim(),
        apellidos: String(p.apellidos).trim(),
        tipo_documento: 1,
        nro_documento: dniOk(p.dni),
        grado_instruccion: 0,
        profesion: '',
        cargo: tipo === 'SUPERADMINISTRADOR' ? 'Super administrador' : 'Administrador',
        email: String(p.email || '').trim(),
        fecha_nacimiento: '1990-01-01',
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
        fecha_ingreso: fechaMySQLLima(),
        hora_entrada: '08:00:00',
        hora_salida: '17:00:00',
        resena: '',
        mostrar_app: 'NO',
        link_aula: '',
      });
      await crearUsuario(conn, {
        colegioId,
        personalId,
        usuario: dniOk(p.dni),
        password: sha1(p.password),
        tipo,
        cambiar: 'SI',
      });
    };
    await crearPersona(body.superadmin, 'SUPERADMINISTRADOR');
    await crearPersona(body.administrador, 'ADMINISTRADOR');

    const cfg = {
      telefono_colegio: c.telefono,
      correo_contacto: c.correo,
      direccion_contacto: c.direccion,
      recaudo_nro_sucursal: c.recaudo_nro_sucursal,
      recaudo_nro_cuenta: c.recaudo_nro_cuenta,
      recaudo_razon_social: c.recaudo_razon_social,
      apertura_completada: 'SI',
    };
    for (const [k, v] of Object.entries(cfg)) {
      if (v == null || String(v).trim() === '') continue;
      await upsertConfig(conn, k, v);
    }
    await upsertConfig(conn, 'apertura_completada', 'SI');
    await conn.commit();
    return { colegio_id: colegioId, usuario_superadmin: dniOk(body.superadmin.dni) };
  } catch (e) {
    try { await conn.rollback(); } catch (_) { /* sin transacción */ }
    throw e;
  } finally {
    try { await conn.execute(`SELECT RELEASE_LOCK('apertura_colegio')`); } catch (_) { /* lock ya suelto */ }
    conn.release();
  }
}

async function plantillaBuffer() {
  const wb = new ExcelJS.Workbook();
  const hojaNueva = (nombre, columnasHoja) => {
    const ws = wb.addWorksheet(nombre);
    ws.addRow(columnasHoja);
    ws.getRow(1).font = { bold: true };
    columnasHoja.forEach((_, i) => { ws.getColumn(i + 1).width = 22; });
  };
  hojaNueva('Aulas', ['sede', 'nivel', 'grado', 'seccion', 'turno', 'anio']);
  hojaNueva('Personal', ['dni', 'nombres', 'apellidos', 'correo', 'cargo', 'perfil']);
  hojaNueva('Alumnos', ['dni', 'apellido_paterno', 'apellido_materno', 'nombres', 'sexo', 'fecha_nacimiento']);
  hojaNueva('Apoderados', ['dni', 'apellido_paterno', 'apellido_materno', 'nombres', 'celular', 'correo', 'parentesco']);
  hojaNueva('Vinculos', ['dni_alumno', 'dni_apoderado']);
  hojaNueva('Matriculas', ['dni_alumno', 'nivel', 'grado', 'seccion', 'matricula', 'pension', 'agenda']);
  const ayuda = wb.addWorksheet('Instrucciones');
  ayuda.getColumn(1).width = 110;
  [
    'Ejemplo de aula: Principal, Primaria, 1, A, Mañana, 2026.',
    'Ejemplo de alumno: DNI, apellido paterno, apellido materno, nombres, M o F, 2016-04-12.',
    'Un DNI que ya existe se omite. No se borra nada del colegio.',
    'Nivel: Inicial, Primaria o Secundaria. El nivel tiene que estar creado en la apertura.',
    'Perfil del personal: DOCENTE, AUXILIAR, SECRETARIA, CAJERO, DIRECTOR, COORDINADOR, PSICOLOGA, ENFERMERA, PROMOTORIA, CONTADOR, TUTOR, MANTENIMIENTO o ADMINISTRADOR.',
    'La clave inicial del personal, del alumno y del apoderado es su DNI. Al entrar se les puede pedir cambiarla.',
    'Sexo: M o F. Parentesco: Padre, Madre, Apoderado u Otro.',
    'Los cursos del aula se crean después, en Académico. Este archivo no trae notas ni deudas.',
  ].forEach((t) => ayuda.addRow([t]));
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

module.exports = {
  estadoPublico,
  instalarColegio,
  cargarPadron,
  plantillaBuffer,
  contarColegios,
};
