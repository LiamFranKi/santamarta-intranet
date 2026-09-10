const { query, execute } = require('./mysql');
const { fechaHoraMySQLLima } = require('./fechaHoraLima');

const MAX_TEMAS_BIMESTRE = 20;
const BIMESTRES = [1, 2, 3, 4];
/** Solo 2026: B1–B3 ya se dictaron; no mostrar ni volver a sembrar huecos vacíos. */
const ANIO_OCULTAR_HUECOS_BIM_CERRADOS = 2026;

function toActivo01(v, fallback = 1) {
  if (Buffer.isBuffer(v)) return v.length && v[0] ? 1 : 0;
  if (v === true || v === 1 || v === '1' || v === 'SI' || v === 'si' || v === 'true') return 1;
  if (v === false || v === 0 || v === '0' || v === 'NO' || v === 'no' || v === 'false') return 0;
  return fallback;
}

function ocultarHuecosPendientes({ ciclo, anio, estructuraActiva }) {
  if (estructuraActiva === false || estructuraActiva === 0) return true;
  const a = parseInt(anio, 10);
  const c = parseInt(ciclo, 10);
  return a === ANIO_OCULTAR_HUECOS_BIM_CERRADOS && c >= 1 && c <= 3;
}

let _colsCache = null;
let _activoColCache = null;

async function archivosTieneEstructuraCols() {
  if (_colsCache != null) return _colsCache;
  try {
    const rows = await query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'asignaturas_archivos'
         AND COLUMN_NAME IN ('item_tipo', 'item_numero')`
    );
    _colsCache = (rows || []).length >= 2;
  } catch (e) {
    _colsCache = false;
  }
  return _colsCache;
}

function clampCantidad(n) {
  const v = parseInt(n, 10);
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.min(MAX_TEMAS_BIMESTRE, v);
}

function normalizarConfigBody(body = {}) {
  return {
    temas_b1: clampCantidad(body.temas_b1),
    temas_b2: clampCantidad(body.temas_b2),
    temas_b3: clampCantidad(body.temas_b3),
    temas_b4: clampCantidad(body.temas_b4),
    activo: toActivo01(body.activo, 1),
  };
}

function cantidadParaCiclo(cfg, ciclo) {
  const c = parseInt(ciclo, 10);
  if (c === 1) return clampCantidad(cfg.temas_b1);
  if (c === 2) return clampCantidad(cfg.temas_b2);
  if (c === 3) return clampCantidad(cfg.temas_b3);
  if (c === 4) return clampCantidad(cfg.temas_b4);
  return 0;
}

function prefijoItem(tipo, numero) {
  const t = String(tipo || '').toUpperCase() === 'FICHA' ? 'Ficha' : 'Tema';
  return `${t} ${parseInt(numero, 10)}`;
}

function extraerSufijoNombre(tipo, numero, nombreLibre) {
  const prefijo = prefijoItem(tipo, numero);
  const raw = String(nombreLibre || '').trim();
  if (!raw) return '';
  if (raw.toLowerCase().startsWith(prefijo.toLowerCase())) {
    return raw.slice(prefijo.length).replace(/^\s*[—\-:]\s*/, '').trim();
  }
  return raw;
}

function componerNombreEstructura(tipo, numero, nombreLibre) {
  const prefijo = prefijoItem(tipo, numero);
  const sufijo = extraerSufijoNombre(tipo, numero, nombreLibre);
  return sufijo ? `${prefijo} — ${sufijo}` : prefijo;
}

function esTemaPendiente(row) {
  if (!row) return true;
  const archivoVacio = !row.archivo || String(row.archivo).trim() === '';
  const enlaceVacio = !row.enlace || String(row.enlace).trim() === '';
  return archivoVacio && enlaceVacio;
}

function clasificarFila(row) {
  const tipoCol = row.item_tipo ? String(row.item_tipo).toUpperCase() : '';
  const numCol = parseInt(row.item_numero, 10);
  if ((tipoCol === 'TEMA' || tipoCol === 'FICHA') && Number.isFinite(numCol) && numCol > 0) {
    return { tipo: tipoCol, numero: numCol };
  }
  const nombre = String(row.nombre || '').trim();
  const m = /^(tema|ficha)\s*(\d+)/i.exec(nombre);
  if (m) {
    return {
      tipo: m[1].toUpperCase() === 'FICHA' ? 'FICHA' : 'TEMA',
      numero: parseInt(m[2], 10),
    };
  }
  return { tipo: 'TEMA', numero: null, sinNumero: true };
}

function ocupacionPorTipo(rows) {
  const usadosTema = new Set();
  const usadosFicha = new Set();
  let extrasTema = 0;
  for (const row of rows || []) {
    const c = clasificarFila(row);
    if (c.tipo === 'FICHA') {
      if (c.numero) usadosFicha.add(c.numero);
    } else if (c.numero) {
      usadosTema.add(c.numero);
    } else {
      extrasTema += 1;
    }
  }
  let cursor = 1;
  for (let i = 0; i < extrasTema; i += 1) {
    while (usadosTema.has(cursor)) cursor += 1;
    usadosTema.add(cursor);
    cursor += 1;
  }
  return { usadosTema, usadosFicha };
}

async function tablaTieneActivo() {
  if (_activoColCache != null) return _activoColCache;
  try {
    const rows = await query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'aula_estructura_temas'
         AND COLUMN_NAME = 'activo'`
    );
    _activoColCache = (rows || []).length > 0;
  } catch {
    _activoColCache = false;
  }
  return _activoColCache;
}

async function obtenerConfigEstructura(colegioId, anio) {
  const vacio = {
    temas_b1: 0,
    temas_b2: 0,
    temas_b3: 0,
    temas_b4: 0,
    activo: 1,
    anio: parseInt(anio, 10) || 0,
  };
  try {
    const conActivo = await tablaTieneActivo();
    const rows = await query(
      conActivo
        ? `SELECT temas_b1, temas_b2, temas_b3, temas_b4, activo, anio
           FROM aula_estructura_temas
           WHERE colegio_id = ? AND anio = ?
           LIMIT 1`
        : `SELECT temas_b1, temas_b2, temas_b3, temas_b4, anio
           FROM aula_estructura_temas
           WHERE colegio_id = ? AND anio = ?
           LIMIT 1`,
      [colegioId, anio]
    );
    if (!rows.length) return vacio;
    return {
      temas_b1: clampCantidad(rows[0].temas_b1),
      temas_b2: clampCantidad(rows[0].temas_b2),
      temas_b3: clampCantidad(rows[0].temas_b3),
      temas_b4: clampCantidad(rows[0].temas_b4),
      activo: conActivo ? toActivo01(rows[0].activo, 1) : 1,
      anio: parseInt(rows[0].anio, 10) || vacio.anio,
    };
  } catch (e) {
    if (e && e.code === 'ER_NO_SUCH_TABLE') return vacio;
    throw e;
  }
}

async function guardarConfigEstructura(colegioId, anio, body) {
  const cfg = normalizarConfigBody(body);
  const conActivo = await tablaTieneActivo();
  if (!conActivo && cfg.activo === 0) {
    const err = new Error('Falta aplicar la migración 086_aula_estructura_temas_activo_mysql.sql');
    err.code = 'ESTRUCTURA_ACTIVO_NO_MIGRADA';
    throw err;
  }
  if (conActivo) {
    await execute(
      `INSERT INTO aula_estructura_temas (colegio_id, anio, temas_b1, temas_b2, temas_b3, temas_b4, activo)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         temas_b1 = VALUES(temas_b1),
         temas_b2 = VALUES(temas_b2),
         temas_b3 = VALUES(temas_b3),
         temas_b4 = VALUES(temas_b4),
         activo = VALUES(activo)`,
      [colegioId, anio, cfg.temas_b1, cfg.temas_b2, cfg.temas_b3, cfg.temas_b4, cfg.activo]
    );
  } else {
    await execute(
      `INSERT INTO aula_estructura_temas (colegio_id, anio, temas_b1, temas_b2, temas_b3, temas_b4)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         temas_b1 = VALUES(temas_b1),
         temas_b2 = VALUES(temas_b2),
         temas_b3 = VALUES(temas_b3),
         temas_b4 = VALUES(temas_b4)`,
      [colegioId, anio, cfg.temas_b1, cfg.temas_b2, cfg.temas_b3, cfg.temas_b4]
    );
  }
  return { ...cfg, anio, activo: conActivo ? cfg.activo : 1 };
}

async function insertarHueco({ asignaturaId, trabajadorId, ciclo, tipo, numero }) {
  const nombre = prefijoItem(tipo, numero);
  const orden = numero * 2 - (tipo === 'TEMA' ? 1 : 0);
  await execute(
    `INSERT INTO asignaturas_archivos
      (asignatura_id, trabajador_id, nombre, archivo, visto, fecha_hora, ciclo, enlace, orden, item_tipo, item_numero)
     VALUES (?, ?, ?, '', '', ?, ?, '', ?, ?, ?)`,
    [
      asignaturaId,
      trabajadorId || 0,
      nombre,
      fechaHoraMySQLLima(),
      ciclo,
      orden,
      tipo,
      numero,
    ]
  );
}

async function completarHuecosCiclo({ asignaturaId, trabajadorId, ciclo, cantidad, anio }) {
  if (ocultarHuecosPendientes({ ciclo, anio })) return 0;
  const n = clampCantidad(cantidad);
  if (n <= 0) return 0;
  const tieneCols = await archivosTieneEstructuraCols();
  if (!tieneCols) {
    const err = new Error('Falta la migración 083 (columnas item_tipo / item_numero).');
    err.code = 'ESTRUCTURA_NO_MIGRADA';
    throw err;
  }
  const rows = await query(
    `SELECT id, nombre, archivo, enlace, item_tipo, item_numero
     FROM asignaturas_archivos
     WHERE asignatura_id = ? AND ciclo = ?`,
    [asignaturaId, ciclo]
  );
  const { usadosTema, usadosFicha } = ocupacionPorTipo(rows);
  let creados = 0;
  for (let i = 1; i <= n; i += 1) {
    if (!usadosTema.has(i)) {
      await insertarHueco({ asignaturaId, trabajadorId, ciclo, tipo: 'TEMA', numero: i });
      usadosTema.add(i);
      creados += 1;
    }
    if (!usadosFicha.has(i)) {
      await insertarHueco({ asignaturaId, trabajadorId, ciclo, tipo: 'FICHA', numero: i });
      usadosFicha.add(i);
      creados += 1;
    }
  }
  return creados;
}

async function sembrarEstructuraAsignatura({ asignaturaId, colegioId, trabajadorId, anio }) {
  const tieneCols = await archivosTieneEstructuraCols();
  if (!tieneCols) return 0;
  let anioUsar = parseInt(anio, 10);
  if (!anioUsar) {
    const [g] = await query(
      `SELECT g.anio FROM asignaturas a
       INNER JOIN grupos g ON g.id = a.grupo_id
       WHERE a.id = ? LIMIT 1`,
      [asignaturaId]
    );
    anioUsar = parseInt(g?.anio, 10) || 0;
  }
  if (!anioUsar) return 0;
  const cfg = await obtenerConfigEstructura(colegioId, anioUsar);
  if (!cfg.activo) return 0;
  let total = 0;
  for (const ciclo of BIMESTRES) {
    total += await completarHuecosCiclo({
      asignaturaId,
      trabajadorId,
      ciclo,
      cantidad: cantidadParaCiclo(cfg, ciclo),
      anio: anioUsar,
    });
  }
  return total;
}

async function aplicarEstructuraColegio({ colegioId, anio }) {
  const tieneCols = await archivosTieneEstructuraCols();
  if (!tieneCols) {
    const err = new Error('Falta la migración 083 (columnas item_tipo / item_numero).');
    err.code = 'ESTRUCTURA_NO_MIGRADA';
    throw err;
  }
  const cfg = await obtenerConfigEstructura(colegioId, anio);
  if (!cfg.activo) {
    return {
      asignaturas: 0,
      creados: 0,
      mensaje: 'La estructura de temas está desactivada. Actívela y guarde para generar huecos.',
    };
  }
  const suma = BIMESTRES.reduce((acc, c) => acc + cantidadParaCiclo(cfg, c), 0);
  if (suma <= 0) {
    return { asignaturas: 0, creados: 0, mensaje: 'Guarde primero cuántos temas van en cada bimestre.' };
  }
  const asignaturas = await query(
    `SELECT a.id, a.personal_id
     FROM asignaturas a
     INNER JOIN grupos g ON g.id = a.grupo_id
     WHERE a.colegio_id = ? AND g.anio = ?`,
    [colegioId, anio]
  );
  let creados = 0;
  for (const a of asignaturas || []) {
    creados += await sembrarEstructuraAsignatura({
      asignaturaId: a.id,
      colegioId,
      trabajadorId: a.personal_id,
      anio,
    });
  }
  return {
    asignaturas: (asignaturas || []).length,
    creados,
    mensaje: creados
      ? `Se crearon ${creados} fila(s) vacía(s) en ${(asignaturas || []).length} asignatura(s). No se tocó lo ya subido.`
      : `No faltaba nada: las ${(asignaturas || []).length} asignatura(s) ya cubren la estructura.`,
  };
}

async function asegurarFichaHermana({ asignaturaId, trabajadorId, ciclo, numero, anio, colegioId }) {
  if (ocultarHuecosPendientes({ ciclo, anio })) return;
  let colegio = parseInt(colegioId, 10);
  if (!colegio && asignaturaId) {
    const [asig] = await query(
      `SELECT colegio_id FROM asignaturas WHERE id = ? LIMIT 1`,
      [asignaturaId]
    );
    colegio = parseInt(asig?.colegio_id, 10) || 0;
  }
  if (colegio && anio) {
    const cfg = await obtenerConfigEstructura(colegio, anio);
    if (!cfg.activo) return;
  }
  const tieneCols = await archivosTieneEstructuraCols();
  if (!tieneCols) return;
  const n = parseInt(numero, 10);
  if (!Number.isFinite(n) || n <= 0) return;
  const existe = await query(
    `SELECT id FROM asignaturas_archivos
     WHERE asignatura_id = ? AND ciclo = ? AND item_tipo = 'FICHA' AND item_numero = ?
     LIMIT 1`,
    [asignaturaId, ciclo, n]
  );
  if (existe.length) return;
  const porNombre = await query(
    `SELECT id FROM asignaturas_archivos
     WHERE asignatura_id = ? AND ciclo = ? AND nombre LIKE ?
     LIMIT 1`,
    [asignaturaId, ciclo, `Ficha ${n}%`]
  );
  if (porNombre.length) return;
  await insertarHueco({ asignaturaId, trabajadorId, ciclo, tipo: 'FICHA', numero: n });
}

module.exports = {
  MAX_TEMAS_BIMESTRE,
  BIMESTRES,
  archivosTieneEstructuraCols,
  clampCantidad,
  toActivo01,
  normalizarConfigBody,
  cantidadParaCiclo,
  prefijoItem,
  extraerSufijoNombre,
  componerNombreEstructura,
  esTemaPendiente,
  ANIO_OCULTAR_HUECOS_BIM_CERRADOS,
  ocultarHuecosPendientes,
  clasificarFila,
  obtenerConfigEstructura,
  guardarConfigEstructura,
  completarHuecosCiclo,
  sembrarEstructuraAsignatura,
  aplicarEstructuraColegio,
  asegurarFichaHermana,
};
