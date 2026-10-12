/**
 * Permisos de entrada del personal.
 * Un permiso solo afloja: si la hora propia ya es más tarde, se queda esa.
 * El individual gana sobre el general del mismo día.
 */
const { query, execute } = require('./mysql');

const ALCANCES = ['TODOS', 'DOCENTES', 'PERSONAL', 'INDIVIDUAL'];

let tablaLista = null;

function asegurarTabla() {
  if (!tablaLista) {
    tablaLista = execute(
      `CREATE TABLE IF NOT EXISTS personal_permisos_entrada (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        colegio_id INT NOT NULL,
        alcance ENUM('TODOS','DOCENTES','PERSONAL','INDIVIDUAL') NOT NULL,
        personal_id INT NULL,
        fecha_desde DATE NOT NULL,
        fecha_hasta DATE NOT NULL,
        hora_entrada TIME NOT NULL,
        hora_salida TIME NULL,
        nombre VARCHAR(120) NOT NULL DEFAULT '',
        activo TINYINT(1) NOT NULL DEFAULT 1,
        KEY idx_permiso_entrada_colegio (colegio_id, fecha_desde, fecha_hasta)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    ).catch((e) => {
      tablaLista = null;
      throw e;
    });
  }
  return tablaLista;
}

function fechaISO(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const m = String(v).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

function minutosHora(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.getHours() * 60 + v.getMinutes();
  }
  const m = String(v).trim().match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (Number.isNaN(h) || Number.isNaN(min)) return null;
  return h * 60 + min;
}

function horaDeMinutos(min) {
  if (min == null || !Number.isFinite(min)) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

function esDocente(tipo) {
  return String(tipo || '').toUpperCase() === 'DOCENTE';
}

function audienciasSeCruzan(a, b) {
  if (a === 'INDIVIDUAL' || b === 'INDIVIDUAL') return false;
  if (a === 'TODOS' || b === 'TODOS') return true;
  return a === b;
}

function aplicaAudiencia(permiso, tipoUsuario) {
  if (permiso.alcance === 'TODOS') return true;
  if (permiso.alcance === 'DOCENTES') return esDocente(tipoUsuario);
  if (permiso.alcance === 'PERSONAL') return !!tipoUsuario && !esDocente(tipoUsuario);
  return false;
}

function normalizarFila(row) {
  if (!row) return null;
  return {
    id: row.id,
    colegio_id: row.colegio_id,
    alcance: row.alcance,
    personal_id: row.personal_id || null,
    personal_nombre: row.personal_nombre || '',
    fecha_desde: fechaISO(row.fecha_desde),
    fecha_hasta: fechaISO(row.fecha_hasta),
    hora_entrada: String(row.hora_entrada || '').slice(0, 5),
    hora_salida: row.hora_salida ? String(row.hora_salida).slice(0, 5) : '',
    nombre: row.nombre || '',
    activo: Number(row.activo) === 1,
  };
}

function validarPayload(body) {
  const alcance = String(body?.alcance || '').toUpperCase();
  if (!ALCANCES.includes(alcance)) {
    return { error: 'Elija a quién aplica el permiso.' };
  }
  const desde = fechaISO(body?.fecha_desde);
  const hasta = fechaISO(body?.fecha_hasta);
  if (!desde || !hasta) return { error: 'Indique desde qué día hasta qué día.' };
  if (desde > hasta) return { error: 'La fecha inicial no puede ser posterior a la final.' };
  const hora = minutosHora(body?.hora_entrada);
  if (hora == null) return { error: 'Indique la hora de entrada del permiso.' };
  const personalId = parseInt(body?.personal_id, 10);
  if (alcance === 'INDIVIDUAL' && !(personalId > 0)) {
    return { error: 'Elija a la persona del permiso.' };
  }
  const salida = body?.hora_salida ? minutosHora(body.hora_salida) : null;
  if (body?.hora_salida && salida == null) return { error: 'La hora de salida no es válida.' };
  return {
    alcance,
    desde,
    hasta,
    horaEntrada: horaDeMinutos(hora),
    horaSalida: salida == null ? null : horaDeMinutos(salida),
    personalId: alcance === 'INDIVIDUAL' ? personalId : null,
    nombre: String(body?.nombre || '').trim().slice(0, 120),
    activo: body?.activo === false || body?.activo === 0 ? 0 : 1,
  };
}

async function cargarPermisos(queryFn, colegioId) {
  await asegurarTabla();
  const rows = await queryFn(
    `SELECT pe.id, pe.colegio_id, pe.alcance, pe.personal_id,
            DATE_FORMAT(pe.fecha_desde, '%Y-%m-%d') AS fecha_desde,
            DATE_FORMAT(pe.fecha_hasta, '%Y-%m-%d') AS fecha_hasta,
            TIME_FORMAT(pe.hora_entrada, '%H:%i') AS hora_entrada,
            TIME_FORMAT(pe.hora_salida, '%H:%i') AS hora_salida,
            pe.nombre, pe.activo,
            TRIM(CONCAT(COALESCE(p.apellidos, ''), ', ', COALESCE(p.nombres, ''))) AS personal_nombre
     FROM personal_permisos_entrada pe
     LEFT JOIN personal p ON p.id = pe.personal_id AND p.colegio_id = pe.colegio_id
     WHERE pe.colegio_id = ? AND pe.activo = 1
     ORDER BY pe.fecha_desde ASC, pe.id ASC`,
    [colegioId]
  );
  return (rows || []).map(normalizarFila);
}

function seCruzan(aDesde, aHasta, bDesde, bHasta) {
  return aDesde <= bHasta && bDesde <= aHasta;
}

async function hayCruce(queryFn, colegioId, datos, exceptoId) {
  const rows = await queryFn(
    `SELECT id, alcance, personal_id,
            DATE_FORMAT(fecha_desde, '%Y-%m-%d') AS fecha_desde,
            DATE_FORMAT(fecha_hasta, '%Y-%m-%d') AS fecha_hasta
     FROM personal_permisos_entrada
     WHERE colegio_id = ? AND activo = 1`,
    [colegioId]
  );
  for (const row of rows || []) {
    if (exceptoId && Number(row.id) === Number(exceptoId)) continue;
    if (!seCruzan(datos.desde, datos.hasta, row.fecha_desde, row.fecha_hasta)) continue;
    if (datos.alcance === 'INDIVIDUAL') {
      if (row.alcance === 'INDIVIDUAL' && Number(row.personal_id) === Number(datos.personalId)) {
        return 'Esa persona ya tiene un permiso en esas fechas.';
      }
      continue;
    }
    if (audienciasSeCruzan(datos.alcance, row.alcance)) {
      return 'Ya hay un permiso general que cubre a ese grupo en esas fechas.';
    }
  }
  return '';
}

function elegirPermiso(permisos, { fecha, personalId, tipoUsuario }) {
  const dia = fechaISO(fecha);
  const pid = parseInt(personalId, 10);
  const delDia = (permisos || []).filter((p) => p.activo && dia && dia >= p.fecha_desde && dia <= p.fecha_hasta);
  const individuales = delDia.filter((p) => p.alcance === 'INDIVIDUAL' && Number(p.personal_id) === pid);
  if (individuales.length) {
    return individuales.sort((a, b) => minutosHora(b.hora_entrada) - minutosHora(a.hora_entrada))[0];
  }
  const generales = delDia.filter((p) => p.alcance !== 'INDIVIDUAL' && aplicaAudiencia(p, tipoUsuario));
  if (!generales.length) return null;
  return generales.sort((a, b) => minutosHora(b.hora_entrada) - minutosHora(a.hora_entrada))[0];
}

/**
 * Hora con la que se decide la tardanza ese día.
 * horaPropia: la de la ficha. permisos: lista ya cargada del colegio.
 */
function resolverHoraEntrada({ horaPropia, fecha, personalId, tipoUsuario, permisos }) {
  const propiaMin = minutosHora(horaPropia);
  const permiso = elegirPermiso(permisos, { fecha, personalId, tipoUsuario });
  if (!permiso) {
    return { horaUsada: horaPropia, permiso: null, aflojo: false };
  }
  const permMin = minutosHora(permiso.hora_entrada);
  if (propiaMin == null) {
    return { horaUsada: `${permiso.hora_entrada}:00`, permiso, aflojo: true };
  }
  if (permMin == null || permMin <= propiaMin) {
    return { horaUsada: horaPropia, permiso, aflojo: false };
  }
  return { horaUsada: `${permiso.hora_entrada}:00`, permiso, aflojo: true };
}

async function listarPermisos(colegioId) {
  await asegurarTabla();
  const rows = await query(
    `SELECT pe.id, pe.colegio_id, pe.alcance, pe.personal_id,
            DATE_FORMAT(pe.fecha_desde, '%Y-%m-%d') AS fecha_desde,
            DATE_FORMAT(pe.fecha_hasta, '%Y-%m-%d') AS fecha_hasta,
            TIME_FORMAT(pe.hora_entrada, '%H:%i') AS hora_entrada,
            TIME_FORMAT(pe.hora_salida, '%H:%i') AS hora_salida,
            pe.nombre, pe.activo,
            TRIM(CONCAT(COALESCE(p.apellidos, ''), ', ', COALESCE(p.nombres, ''))) AS personal_nombre
     FROM personal_permisos_entrada pe
     LEFT JOIN personal p ON p.id = pe.personal_id AND p.colegio_id = pe.colegio_id
     WHERE pe.colegio_id = ?
     ORDER BY pe.activo DESC, pe.fecha_desde DESC, pe.id DESC`,
    [colegioId]
  );
  return (rows || []).map(normalizarFila);
}

async function guardarPermiso(colegioId, body, id) {
  const datos = validarPayload(body);
  if (datos.error) {
    const err = new Error(datos.error);
    err.status = 400;
    throw err;
  }
  await asegurarTabla();
  if (datos.activo) {
    const cruce = await hayCruce(query, colegioId, datos, id);
    if (cruce) {
      const err = new Error(cruce);
      err.status = 400;
      throw err;
    }
  }
  if (id) {
    const propio = await query(
      'SELECT id FROM personal_permisos_entrada WHERE id = ? AND colegio_id = ? LIMIT 1',
      [id, colegioId]
    );
    if (!propio.length) {
      const err = new Error('No se encontró el permiso.');
      err.status = 404;
      throw err;
    }
    await execute(
      `UPDATE personal_permisos_entrada
       SET alcance = ?, personal_id = ?, fecha_desde = ?, fecha_hasta = ?,
           hora_entrada = ?, hora_salida = ?, nombre = ?, activo = ?
       WHERE id = ? AND colegio_id = ?`,
      [
        datos.alcance, datos.personalId, datos.desde, datos.hasta,
        datos.horaEntrada, datos.horaSalida, datos.nombre, datos.activo,
        id, colegioId,
      ]
    );
    return id;
  }
  const ins = await execute(
    `INSERT INTO personal_permisos_entrada
      (colegio_id, alcance, personal_id, fecha_desde, fecha_hasta, hora_entrada, hora_salida, nombre, activo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      colegioId, datos.alcance, datos.personalId, datos.desde, datos.hasta,
      datos.horaEntrada, datos.horaSalida, datos.nombre, datos.activo,
    ]
  );
  return ins.insertId;
}

async function borrarPermiso(colegioId, id) {
  await asegurarTabla();
  const r = await execute(
    'DELETE FROM personal_permisos_entrada WHERE id = ? AND colegio_id = ?',
    [id, colegioId]
  );
  return Number(r?.affectedRows) > 0;
}

function etiquetaPermiso(permiso) {
  if (!permiso) return '';
  const hora = String(permiso.hora_entrada || '').slice(0, 5);
  if (permiso.alcance === 'INDIVIDUAL') {
    return permiso.nombre
      ? `Permiso personal «${permiso.nombre}» hasta las ${hora}`
      : `Permiso personal hasta las ${hora}`;
  }
  const grupo = permiso.alcance === 'DOCENTES'
    ? 'docentes'
    : permiso.alcance === 'PERSONAL'
      ? 'personal administrativo'
      : 'todo el personal';
  const base = permiso.nombre
    ? `Permiso «${permiso.nombre}» (${grupo}) hasta las ${hora}`
    : `Permiso general de ${grupo} hasta las ${hora}`;
  return base;
}

module.exports = {
  ALCANCES,
  asegurarTabla,
  fechaISO,
  cargarPermisos,
  validarPayload,
  hayCruce,
  resolverHoraEntrada,
  etiquetaPermiso,
  normalizarFila,
  listarPermisos,
  guardarPermiso,
  borrarPermiso,
};
