/**
 * Conducta por ítem (directa, sin promedio de casilleros).
 * Rige desde el bimestre 4 de 2026 y en todos los años siguientes.
 * Los bimestres 1, 2 y 3 de 2026, y todo lo anterior, no se recalculan aquí.
 */
const { query, execute } = require('./mysql');
const { insertNotificacionUsuario } = require('./notificacionInsert');
const { fechaHoraMySQLLima } = require('./fechaHoraLima');

const ANIO_INICIO = 2026;
const CICLO_INICIO = 4;
const NOTA_INICIAL_DEFAULT = 20;
const NOTA_MINIMA_DEFAULT = 0;
const AVISO_UMBRAL_DEFAULT = 12;
const AVISO_TEXTO_DEFAULT = 'Su hijo ya está en el límite de la conducta ({nota}). Conviene revisar las faltas del bimestre y conversar con el tutor.';

const GRUPOS = ['leve', 'grave', 'muy_grave', 'presentacion', 'puntualidad'];
const LABEL_GRUPO = {
  leve: 'Faltas leves',
  grave: 'Faltas graves',
  muy_grave: 'Faltas muy graves',
  presentacion: 'Presentación personal',
  puntualidad: 'Puntualidad',
};

const SEMILLA = [
  ['leve', 'L-01', 'Olvidar el QR o el carné de asistencia', 0.25, 1, 1, 0, 0],
  ['leve', 'L-02', 'Conversar, distraer o generar desorden durante clases, formación o actividades institucionales', 0.25, 2, 0, 0, 0],
  ['leve', 'L-03', 'No presentar tareas, trabajos o materiales en los plazos establecidos', 0.50, 3, 0, 0, 0],
  ['leve', 'L-04', 'Permanecer en pasillos, patios, escaleras u otros ambientes sin autorización', 0.25, 4, 0, 0, 0],
  ['leve', 'L-05', 'Comer, masticar chicle o usar kiosco/cafetería en horario de clase sin permiso', 0.50, 5, 0, 0, 0],
  ['leve', 'L-06', 'Dejar papeles, desperdicios o no cuidar el orden y limpieza del aula o instalaciones', 0.50, 6, 0, 0, 0],
  ['leve', 'L-07', 'No cumplir encargos, indicaciones o responsabilidades asignadas por docentes o tutores', 0.50, 7, 0, 0, 0],
  ['leve', 'L-08', 'Realizar bromas, apodos o burlas que no constituyan agresión grave', 0.50, 8, 0, 0, 0],
  ['grave', 'G-01', 'Faltar el respeto a docentes, autoridades, personal, compañeros o padres de familia', 2.00, 1, 0, 0, 0],
  ['grave', 'G-02', 'Desobedecer indicaciones del personal educativo o negarse a cumplir medidas formativas', 1.50, 2, 0, 0, 0],
  ['grave', 'G-03', 'Agredir verbalmente, insultar, amenazar, calumniar o intimidar a cualquier miembro de la comunidad educativa', 3.00, 3, 0, 0, 0],
  ['grave', 'G-04', 'Fomentar peleas, enfrentamientos, juegos peligrosos o conductas que afecten la seguridad', 3.00, 4, 0, 0, 0],
  ['grave', 'G-05', 'Evadirse del aula, salir sin autorización o abandonar la institución', 3.00, 5, 0, 0, 0],
  ['grave', 'G-06', 'Dañar mobiliario, equipos, paredes, servicios higiénicos, materiales o infraestructura', 3.50, 6, 0, 0, 0],
  ['grave', 'G-07', 'Apropiarse, sustraer, esconder o dañar pertenencias de otros', 3.50, 7, 0, 0, 0],
  ['grave', 'G-08', 'Falsificar firmas, documentos, calificaciones o brindar información falsa', 3.50, 8, 0, 0, 0],
  ['grave', 'G-09', 'Portar celulares, relojes inteligentes, objetos de valor o artículos no autorizados que afecten la convivencia o el desarrollo escolar', 3.00, 9, 0, 0, 0],
  ['grave', 'G-10', 'Usar el nombre, uniforme o distintivos institucionales en actos no autorizados que afecten la imagen institucional', 3.50, 10, 0, 0, 0],
  ['grave', 'G-11', 'Incumplir más de 4 veces las normas de presentación personal', 3.00, 11, 0, 0, 0],
  ['grave', 'G-12', 'Tener más de 4 tardanzas, sin justificación', 3.00, 12, 0, 0, 0],
  ['grave', 'G-13', 'Generar discordias o provocar a sus compañeros', 2.00, 13, 0, 0, 0],
  ['grave', 'G-14', 'Plagiar en evaluaciones o copiar trabajos de compañeros', 3.50, 14, 0, 0, 0],
  ['grave', 'G-15', 'Faltar el respeto a símbolos patrios, héroes y distintivos institucionales, conforme al Reglamento', 4.00, 15, 0, 0, 0],
  ['muy_grave', 'MG-01', 'Agresión física, violencia escolar, hostigamiento, bullying o actos que afecten la integridad emocional o física', 7.00, 1, 0, 0, 0],
  ['muy_grave', 'MG-02', 'Portar, consumir o presentarse bajo efectos de alcohol, tabaco, drogas u otras sustancias prohibidas', 6.00, 2, 0, 0, 0],
  ['muy_grave', 'MG-03', 'Portar armas, objetos punzocortantes, contundentes, pirotécnicos o elementos que puedan causar daño', 7.00, 3, 0, 0, 0],
  ['muy_grave', 'MG-04', 'Participar en robo, pandillaje, lesiones, actos contra la moral o conductas antisociales dentro o fuera de la institución', 6.00, 4, 0, 0, 0],
  ['muy_grave', 'MG-05', 'Portar, exhibir o difundir material pornográfico, violento o inadecuado', 8.00, 5, 0, 0, 0],
  ['muy_grave', 'MG-06', 'Extraer, divulgar o manipular documentos confidenciales de la institución', 6.00, 6, 0, 0, 0],
  ['muy_grave', 'MG-07', 'Reincidir en más de 3 faltas graves pese a compromisos, citaciones, orientación psicológica o medidas previas', 6.50, 7, 0, 0, 0],
  ['muy_grave', 'MG-08', 'Dirigirse a lugares de diversión vistiendo uniforme o buzo y/o ejecutar actos que afecten la imagen institucional', 6.00, 8, 0, 0, 0],
  ['muy_grave', 'MG-09', 'Firmar o hacer firmar documentos a favor o en contra del personal, en los términos del Reglamento', 6.00, 9, 0, 0, 0],
  ['presentacion', 'P-01', 'Uniforme incompleto (falta una prenda reglamentaria)', 0.25, 1, 0, 1, 0],
  ['presentacion', 'P-02', 'Uniforme usado incorrectamente o fuera de las pautas establecidas', 0.25, 2, 0, 0, 0],
  ['presentacion', 'P-03', 'Uniforme alterado, con prendas o accesorios no autorizados', 0.25, 3, 0, 0, 0],
  ['presentacion', 'P-04', 'Uso de accesorios, maquillaje, cosméticos o uñas pintadas no permitidos por las normas institucionales', 0.25, 4, 0, 0, 0],
  ['presentacion', 'P-05', 'Cabello tinturado, largo, suelto o desordenado, cuando contravenga las pautas institucionales comunicadas', 0.50, 5, 0, 0, 0],
  ['puntualidad', 'PU-01', 'Llegada tarde al inicio de la jornada escolar, sin justificación válida', 0.30, 1, 0, 0, 1],
  ['puntualidad', 'PU-02', 'Llegada tarde a clase, formación o actividad programada, sin autorización', 0.25, 2, 0, 0, 0],
  ['puntualidad', 'PU-03', 'Regreso tardío del recreo o cambio de hora, sin causa válida', 0.25, 3, 0, 0, 0],
  ['puntualidad', 'PU-04', 'Incumplimiento de un horario o citación interna previamente comunicada, sin justificación', 0.25, 4, 0, 0, 0],
];

let tablasListas = false;

function usaConductaNueva(anio, ciclo) {
  const y = parseInt(anio, 10) || 0;
  const c = parseInt(ciclo, 10) || 0;
  if (y > ANIO_INICIO) return true;
  return y === ANIO_INICIO && c >= CICLO_INICIO;
}

function redondear2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

function notaTexto(n) {
  return redondear2(n).toFixed(2);
}

function addDaysYmd(ymd, days) {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function bloquesDelBimestre(desde, hasta) {
  const ymd = (v) => {
    try {
      const n = legacy().toFechaYmd(v);
      if (n) return n;
    } catch (_) { /* fecha ya viene en texto */ }
    return String(v || '').slice(0, 10);
  };
  const ini = ymd(desde);
  const fin = ymd(hasta);
  if (!ini || !fin) return [{ desde: ini, hasta: fin }, null];
  const fin1 = addDaysYmd(ini, 27);
  if (fin1 >= fin) return [{ desde: ini, hasta: fin }, null];
  return [
    { desde: ini, hasta: fin1 },
    { desde: addDaysYmd(fin1, 1), hasta: fin },
  ];
}

function notaDesdeSuma(suma, inicial, minima) {
  const base = redondear2(inicial);
  const piso = Math.max(0, redondear2(minima));
  const n = redondear2(base - redondear2(suma));
  return redondear2(Math.max(piso, Math.min(base, n)));
}

function promedioDos(a, b, redondear) {
  const promedio = redondear2((redondear2(a) + redondear2(b)) / 2);
  if (!redondear) return promedio;
  return Math.round(promedio);
}

function textoNota(n, entero) {
  const x = redondear2(n);
  if (entero && Math.abs(x - Math.round(x)) < 1e-6) return String(Math.round(x));
  return x.toFixed(2);
}

function legacy() {
  return require('./conductaIncidenciasBimestre');
}

async function asegurarTablas() {
  if (tablasListas) return;
  await execute(`CREATE TABLE IF NOT EXISTS conducta_items (
    id INT NOT NULL AUTO_INCREMENT,
    grupo ENUM('leve','grave','muy_grave','presentacion','puntualidad') NOT NULL,
    codigo VARCHAR(20) NOT NULL,
    nombre VARCHAR(600) NOT NULL,
    descuento DECIMAL(6,2) NOT NULL DEFAULT 0.25,
    orden INT NOT NULL DEFAULT 0,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    es_olvido_qr TINYINT(1) NOT NULL DEFAULT 0,
    es_ingreso_vestimenta TINYINT(1) NOT NULL DEFAULT 0,
    es_ingreso_tardanza TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_conducta_items_codigo (codigo)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await execute(`CREATE TABLE IF NOT EXISTS conducta_registros (
    id INT NOT NULL AUTO_INCREMENT,
    colegio_id INT NOT NULL,
    matricula_id INT NOT NULL,
    item_id INT NULL,
    grupo VARCHAR(20) NOT NULL,
    codigo VARCHAR(20) NOT NULL,
    nombre VARCHAR(600) NOT NULL,
    descuento DECIMAL(6,2) NOT NULL,
    fecha DATE NOT NULL,
    hora TIME NULL,
    anio INT NOT NULL,
    ciclo INT NOT NULL,
    origen VARCHAR(30) NOT NULL DEFAULT 'manual',
    registrado_por_usuario_id INT NULL,
    enrollment_incident_id INT NULL,
    presentacion_descuento_id INT NULL,
    asistencia_id INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_cond_reg_mat_fecha (matricula_id, fecha),
    KEY idx_cond_reg_colegio (colegio_id, anio, ciclo)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await execute(`CREATE TABLE IF NOT EXISTS conducta_avisos_limite (
    id INT NOT NULL AUTO_INCREMENT,
    matricula_id INT NOT NULL,
    anio INT NOT NULL,
    ciclo INT NOT NULL,
    nota DECIMAL(6,2) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_cond_aviso (matricula_id, anio, ciclo)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const n = await query(`SELECT COUNT(*) AS c FROM conducta_items`);
  if (!parseInt(n?.[0]?.c, 10)) {
    for (const row of SEMILLA) {
      await execute(
        `INSERT INTO conducta_items
         (grupo, codigo, nombre, descuento, orden, es_olvido_qr, es_ingreso_vestimenta, es_ingreso_tardanza)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        row
      );
    }
  }
  const claves = [
    ['conducta_nota_inicial', String(NOTA_INICIAL_DEFAULT)],
    ['conducta_nota_minima', String(NOTA_MINIMA_DEFAULT)],
    ['conducta_aviso_umbral', String(AVISO_UMBRAL_DEFAULT)],
    ['conducta_aviso_texto', AVISO_TEXTO_DEFAULT],
    ['conducta_redondear_promedio', '0'],
  ];
  for (const [clave, valor] of claves) {
    const ya = await query(`SELECT id FROM config WHERE clave = ? LIMIT 1`, [clave]);
    if (!ya?.length) {
      await execute(`INSERT INTO config (clave, valor) VALUES (?, ?)`, [clave, valor]);
    }
  }
  tablasListas = true;
}

function filaItem(r) {
  return {
    id: r.id,
    grupo: r.grupo,
    codigo: r.codigo,
    nombre: r.nombre,
    descuento: redondear2(r.descuento),
    orden: r.orden,
    activo: !!Number(r.activo),
    es_olvido_qr: !!Number(r.es_olvido_qr),
    es_ingreso_vestimenta: !!Number(r.es_ingreso_vestimenta),
    es_ingreso_tardanza: !!Number(r.es_ingreso_tardanza),
  };
}

async function leerAjustes() {
  await asegurarTablas();
  const rows = await query(
    `SELECT clave, valor FROM config
     WHERE clave IN ('conducta_nota_inicial','conducta_nota_minima','conducta_aviso_umbral','conducta_aviso_texto','conducta_redondear_promedio')`
  );
  const map = {};
  (rows || []).forEach((r) => { map[r.clave] = r.valor; });
  let inicial = redondear2(map.conducta_nota_inicial ?? NOTA_INICIAL_DEFAULT);
  let minima = redondear2(map.conducta_nota_minima ?? NOTA_MINIMA_DEFAULT);
  if (inicial < 0) inicial = 0;
  if (inicial > 20) inicial = 20;
  if (minima < 0) minima = 0;
  if (minima > inicial) minima = inicial;
  let umbral = redondear2(map.conducta_aviso_umbral ?? AVISO_UMBRAL_DEFAULT);
  if (umbral < 0) umbral = 0;
  if (umbral > inicial) umbral = inicial;
  return {
    nota_inicial: inicial,
    nota_minima: minima,
    aviso_umbral: umbral,
    aviso_texto: String(map.conducta_aviso_texto || AVISO_TEXTO_DEFAULT),
    redondear_promedio: map.conducta_redondear_promedio === '1' || map.conducta_redondear_promedio === 'true',
    anio_inicio: ANIO_INICIO,
    ciclo_inicio: CICLO_INICIO,
  };
}

async function guardarAjustes(body) {
  await asegurarTablas();
  const actual = await leerAjustes();
  let inicial = body.nota_inicial != null ? redondear2(body.nota_inicial) : actual.nota_inicial;
  let minima = body.nota_minima != null ? redondear2(body.nota_minima) : actual.nota_minima;
  let umbral = body.aviso_umbral != null ? redondear2(body.aviso_umbral) : actual.aviso_umbral;
  const texto = body.aviso_texto != null ? String(body.aviso_texto).trim() : actual.aviso_texto;
  const redondear = body.redondear_promedio != null
    ? !!body.redondear_promedio
    : !!actual.redondear_promedio;
  if (inicial < 0 || inicial > 20) throw new Error('La nota de partida debe estar entre 0 y 20');
  if (minima < 0 || minima > inicial) throw new Error('La nota mínima no puede ser negativa ni mayor que la de partida');
  if (umbral < 0 || umbral > inicial) throw new Error('El aviso debe estar entre 0 y la nota de partida');
  if (!texto) throw new Error('Escribe el texto del aviso');
  const pares = [
    ['conducta_nota_inicial', notaTexto(inicial)],
    ['conducta_nota_minima', notaTexto(minima)],
    ['conducta_aviso_umbral', notaTexto(umbral)],
    ['conducta_aviso_texto', texto],
    ['conducta_redondear_promedio', redondear ? '1' : '0'],
  ];
  for (const [clave, valor] of pares) {
    const ya = await query(`SELECT id FROM config WHERE clave = ? LIMIT 1`, [clave]);
    if (ya?.length) await execute(`UPDATE config SET valor = ? WHERE clave = ?`, [valor, clave]);
    else await execute(`INSERT INTO config (clave, valor) VALUES (?, ?)`, [clave, valor]);
  }
  return leerAjustes();
}

async function listarItems({ soloActivos = false } = {}) {
  await asegurarTablas();
  const rows = await query(
    `SELECT * FROM conducta_items ${soloActivos ? 'WHERE activo = 1' : ''} ORDER BY FIELD(grupo,'leve','grave','muy_grave','presentacion','puntualidad'), orden ASC, codigo ASC`
  );
  return (rows || []).map(filaItem);
}

async function catalogoAgrupado(soloActivos = false) {
  const items = await listarItems({ soloActivos });
  const ajustes = await leerAjustes();
  const grupos = GRUPOS.map((id) => ({
    id,
    label: LABEL_GRUPO[id],
    items: items.filter((it) => it.grupo === id),
  }));
  return { grupos, ajustes, items };
}

function normalizarCodigo(codigo) {
  return String(codigo || '').trim().toUpperCase().replace(/\s+/g, '');
}

async function limpiarRol(campo, exceptoId) {
  await execute(
    `UPDATE conducta_items SET ${campo} = 0 WHERE id <> ?`,
    [exceptoId || 0]
  );
}

async function crearItem(body) {
  await asegurarTablas();
  const grupo = String(body.grupo || '');
  if (!GRUPOS.includes(grupo)) throw new Error('Elige el grupo del ítem');
  const codigo = normalizarCodigo(body.codigo);
  const nombre = String(body.nombre || '').trim();
  const descuento = redondear2(body.descuento);
  if (!codigo || codigo.length > 20) throw new Error('El código es obligatorio');
  if (!nombre) throw new Error('El nombre es obligatorio');
  if (!(descuento >= 0)) throw new Error('El descuento no puede ser negativo');
  const ordenRow = await query(
    `SELECT COALESCE(MAX(orden), 0) + 1 AS n FROM conducta_items WHERE grupo = ?`,
    [grupo]
  );
  const orden = parseInt(body.orden, 10) || ordenRow?.[0]?.n || 1;
  const flags = {
    es_olvido_qr: body.es_olvido_qr ? 1 : 0,
    es_ingreso_vestimenta: body.es_ingreso_vestimenta ? 1 : 0,
    es_ingreso_tardanza: body.es_ingreso_tardanza ? 1 : 0,
  };
  const ins = await execute(
    `INSERT INTO conducta_items (grupo, codigo, nombre, descuento, orden, activo, es_olvido_qr, es_ingreso_vestimenta, es_ingreso_tardanza)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    [grupo, codigo, nombre, descuento, orden, flags.es_olvido_qr, flags.es_ingreso_vestimenta, flags.es_ingreso_tardanza]
  );
  if (flags.es_olvido_qr) await limpiarRol('es_olvido_qr', ins.insertId);
  if (flags.es_ingreso_vestimenta) await limpiarRol('es_ingreso_vestimenta', ins.insertId);
  if (flags.es_ingreso_tardanza) await limpiarRol('es_ingreso_tardanza', ins.insertId);
  const rows = await query(`SELECT * FROM conducta_items WHERE id = ?`, [ins.insertId]);
  return filaItem(rows[0]);
}

async function actualizarItem(id, body) {
  await asegurarTablas();
  const rows = await query(`SELECT * FROM conducta_items WHERE id = ?`, [id]);
  if (!rows?.length) throw new Error('Ítem no encontrado');
  const actual = rows[0];
  const grupo = body.grupo != null ? String(body.grupo) : actual.grupo;
  if (!GRUPOS.includes(grupo)) throw new Error('Grupo no válido');
  const codigo = body.codigo != null ? normalizarCodigo(body.codigo) : actual.codigo;
  const nombre = body.nombre != null ? String(body.nombre).trim() : actual.nombre;
  const descuento = body.descuento != null ? redondear2(body.descuento) : redondear2(actual.descuento);
  const orden = body.orden != null ? parseInt(body.orden, 10) || actual.orden : actual.orden;
  const activo = body.activo != null ? (body.activo ? 1 : 0) : actual.activo;
  if (!codigo || !nombre) throw new Error('Código y nombre son obligatorios');
  if (!(descuento >= 0)) throw new Error('El descuento no puede ser negativo');
  const flags = {
    es_olvido_qr: body.es_olvido_qr != null ? (body.es_olvido_qr ? 1 : 0) : actual.es_olvido_qr,
    es_ingreso_vestimenta: body.es_ingreso_vestimenta != null ? (body.es_ingreso_vestimenta ? 1 : 0) : actual.es_ingreso_vestimenta,
    es_ingreso_tardanza: body.es_ingreso_tardanza != null ? (body.es_ingreso_tardanza ? 1 : 0) : actual.es_ingreso_tardanza,
  };
  await execute(
    `UPDATE conducta_items
     SET grupo = ?, codigo = ?, nombre = ?, descuento = ?, orden = ?, activo = ?,
         es_olvido_qr = ?, es_ingreso_vestimenta = ?, es_ingreso_tardanza = ?
     WHERE id = ?`,
    [grupo, codigo, nombre, descuento, orden, activo, flags.es_olvido_qr, flags.es_ingreso_vestimenta, flags.es_ingreso_tardanza, id]
  );
  if (flags.es_olvido_qr) await limpiarRol('es_olvido_qr', id);
  if (flags.es_ingreso_vestimenta) await limpiarRol('es_ingreso_vestimenta', id);
  if (flags.es_ingreso_tardanza) await limpiarRol('es_ingreso_tardanza', id);
  const out = await query(`SELECT * FROM conducta_items WHERE id = ?`, [id]);
  return filaItem(out[0]);
}

async function eliminarItem(id) {
  await asegurarTablas();
  const usado = await query(`SELECT id FROM conducta_registros WHERE item_id = ? LIMIT 1`, [id]);
  if (usado?.length) {
    await execute(`UPDATE conducta_items SET activo = 0 WHERE id = ?`, [id]);
    return { archivado: true };
  }
  await execute(`DELETE FROM conducta_items WHERE id = ?`, [id]);
  return { archivado: false };
}

async function itemPorRol(campo) {
  await asegurarTablas();
  const rows = await query(
    `SELECT * FROM conducta_items WHERE ${campo} = 1 AND activo = 1 ORDER BY id ASC LIMIT 1`
  );
  return rows?.[0] ? filaItem(rows[0]) : null;
}

async function cicloDeFecha(colegioId, anio, fechaYmd) {
  const { fetchRangosCiclosParsed } = require('./libretaResumenBimestres');
  const { cicloQueContieneFecha, obtenerRangoBimestre } = legacy();
  const rangos = await fetchRangosCiclosParsed(query, colegioId);
  const ciclo = cicloQueContieneFecha(rangos, anio, fechaYmd) || 1;
  const rango = await obtenerRangoBimestre(query, colegioId, ciclo, anio);
  return { ciclo, rango, nueva: usaConductaNueva(anio, ciclo) };
}

async function regimenHoy(colegioId, anio) {
  const hoy = fechaHoraMySQLLima().slice(0, 10);
  return cicloDeFecha(colegioId, anio, hoy);
}

function origenDeGrupo(grupo, item) {
  if (item?.es_olvido_qr) return 'olvido_qr';
  if (grupo === 'presentacion') return 'vestimenta';
  if (grupo === 'puntualidad') return 'tardanza';
  return 'incidencia';
}

function etiquetaGrupo(grupo, item) {
  if (item?.es_olvido_qr) return 'Olvidar QR';
  if (grupo === 'leve') return 'Falta leve';
  if (grupo === 'grave') return 'Falta grave';
  if (grupo === 'muy_grave') return 'Falta muy grave';
  if (grupo === 'presentacion') return 'Vestimenta';
  if (grupo === 'puntualidad') return 'Tardanza';
  return 'Conducta';
}

async function persistirNotaNueva(matriculaId, ciclo, notas) {
  const {
    ASIGNATURA_CONDUCTA,
    ASIGNATURA_CONDUCTA_INCIDENCIAS,
    ASIGNATURA_CONDUCTA_PRESENTACION,
    ASIGNATURA_CONDUCTA_TARDANZAS,
    ASIGNATURA_CONDUCTA_OLVIDO_QR,
    IDS_NOTAS_CONDUCTA,
  } = legacy();
  const pares = [
    [ASIGNATURA_CONDUCTA, textoNota(notas.final, notas.redondeado)],
    [ASIGNATURA_CONDUCTA_INCIDENCIAS, textoNota(notas.mes1, false)],
    [ASIGNATURA_CONDUCTA_PRESENTACION, textoNota(notas.mes2, false)],
    [ASIGNATURA_CONDUCTA_TARDANZAS, textoNota(notas.final, notas.redondeado)],
    [ASIGNATURA_CONDUCTA_OLVIDO_QR, textoNota(notas.final, notas.redondeado)],
  ];
  const ph = IDS_NOTAS_CONDUCTA.map(() => '?').join(',');
  await execute(
    `DELETE FROM promedios WHERE matricula_id = ? AND ciclo = ? AND asignatura_id IN (${ph})`,
    [matriculaId, ciclo, ...IDS_NOTAS_CONDUCTA]
  );
  const values = [];
  const params = [];
  pares.forEach(([aid, nota]) => {
    values.push('(?, ?, ?, ?)');
    params.push(matriculaId, aid, ciclo, nota);
  });
  await execute(
    `INSERT INTO promedios (matricula_id, asignatura_id, ciclo, promedio) VALUES ${values.join(',')}`,
    params
  );
}

async function calcularMatriculaEnRango(matriculaId, rango, ajustes) {
  const bloques = bloquesDelBimestre(rango.desde, rango.hasta);
  const notasMes = [];
  const sumas = [];
  for (const bloque of bloques) {
    if (!bloque) {
      notasMes.push(ajustes.nota_inicial);
      sumas.push(0);
      continue;
    }
    const rows = await query(
      `SELECT COALESCE(SUM(descuento), 0) AS s
       FROM conducta_registros
       WHERE matricula_id = ? AND fecha BETWEEN ? AND ?`,
      [matriculaId, bloque.desde, bloque.hasta]
    );
    const suma = redondear2(rows?.[0]?.s || 0);
    sumas.push(suma);
    notasMes.push(notaDesdeSuma(suma, ajustes.nota_inicial, ajustes.nota_minima));
  }
  const mes1 = notasMes[0];
  const mes2 = notasMes[1];
  return {
    mes1,
    mes2,
    final: promedioDos(mes1, mes2, ajustes.redondear_promedio),
    redondeado: !!ajustes.redondear_promedio,
    descontado1: sumas[0],
    descontado2: sumas[1],
    bloques,
  };
}

async function revisarAvisoLimite({
  matriculaId, colegioId, anio, ciclo, nota, usuarioId, alumnoId,
}) {
  const ajustes = await leerAjustes();
  if (nota > ajustes.aviso_umbral + 1e-9) return;
  const ya = await query(
    `SELECT id FROM conducta_avisos_limite WHERE matricula_id = ? AND anio = ? AND ciclo = ? LIMIT 1`,
    [matriculaId, anio, ciclo]
  );
  if (ya?.length) return;
  await execute(
    `INSERT INTO conducta_avisos_limite (matricula_id, anio, ciclo, nota) VALUES (?, ?, ?, ?)`,
    [matriculaId, anio, ciclo, nota]
  );
  const texto = ajustes.aviso_texto.replace(/\{nota\}/g, notaTexto(nota));
  if (!alumnoId) return;
  try {
    const { crearNotificacionesApoderados } = require('../routes/docente.routes');
    await crearNotificacionesApoderados({
      alumno_id: alumnoId,
      usuario_id: usuarioId || 0,
      colegio_id: colegioId,
      anio_activo: anio,
      tituloNotificacion: 'Límite de conducta',
      mensajeNotificacion: texto,
      tipoNotificacion: 'conducta_limite',
      dataExtra: { ciclo, nota: notaTexto(nota) },
    });
  } catch (e) {
    console.warn('[conducta] aviso límite:', e.message);
  }
}

async function respaldarIngresosSinCatalogo(matriculaId, anio) {
  await asegurarTablas();
  const alumno = await alumnoDeMatricula(matriculaId);
  if (!alumno?.colegio_id) return;
  const colegioId = alumno.colegio_id;
  const { ASSIGNMENT_ID_TUTORIA, ASSIGNMENT_ID_VESTIMENTA, toFechaYmd } = legacy();
  const tard = await query(
    `SELECT ma.id, ma.fecha, ma.hora_entrada
     FROM matriculas_asistencias ma
     WHERE ma.matricula_id = ? AND ma.tipo = 'TARDANZA'
       AND NOT EXISTS (SELECT 1 FROM conducta_registros r WHERE r.asistencia_id = ma.id)`,
    [matriculaId]
  );
  const itemTard = await itemPorRol('es_ingreso_tardanza');
  for (const t of tard || []) {
    const fecha = toFechaYmd(t.fecha);
    if (!fecha || !itemTard) continue;
    const info = await cicloDeFecha(colegioId, anio, fecha);
    if (!info.nueva) continue;
    await registrarItemEnMatricula({
      matriculaId,
      colegioId,
      anio,
      item: itemTard,
      fecha,
      hora: t.hora_entrada ? String(t.hora_entrada).slice(0, 8) : null,
      origen: 'ingreso',
      assignmentId: ASSIGNMENT_ID_TUTORIA,
      asistenciaId: t.id,
      avisar: false,
      omitirSync: true,
    });
  }
  let peds = [];
  try {
    peds = await query(
      `SELECT ped.id, ped.fecha, ped.hora, ped.motivo
       FROM presentacion_escolar_descuentos ped
       INNER JOIN usuarios ua ON ua.id = ped.alumno_usuario_id AND ua.colegio_id = ped.colegio_id
       INNER JOIN matriculas m ON m.id = ? AND m.alumno_id = ua.alumno_id AND m.colegio_id = ped.colegio_id
       WHERE NOT EXISTS (SELECT 1 FROM conducta_registros r WHERE r.presentacion_descuento_id = ped.id)`,
      [matriculaId]
    );
  } catch (e) {
    peds = [];
  }
  for (const p of peds || []) {
    const fecha = toFechaYmd(p.fecha);
    if (!fecha) continue;
    const info = await cicloDeFecha(colegioId, anio, fecha);
    if (!info.nueva) continue;
    const olvido = String(p.motivo || '').trim().toUpperCase() === 'OLVIDO_QR';
    const item = await itemPorRol(olvido ? 'es_olvido_qr' : 'es_ingreso_vestimenta');
    if (!item) continue;
    await registrarItemEnMatricula({
      matriculaId,
      colegioId,
      anio,
      item,
      fecha,
      hora: p.hora ? String(p.hora).slice(0, 8) : null,
      origen: 'ingreso',
      assignmentId: ASSIGNMENT_ID_VESTIMENTA,
      pedId: p.id,
      avisar: false,
      omitirSync: true,
    });
  }
}

async function sincronizarConductaNueva(queryFn, executeFn, opts) {
  const q = queryFn || query;
  const ex = executeFn || execute;
  await asegurarTablas();
  const anio = parseInt(opts.anioEscolar, 10);
  const ciclo = parseInt(opts.ciclo, 10);
  if (!usaConductaNueva(anio, ciclo)) return null;
  try {
    await respaldarIngresosSinCatalogo(opts.matriculaId, anio);
  } catch (eBack) {
    console.warn('[conducta] respaldar ingresos:', eBack.message);
  }
  const { obtenerRangoBimestre } = legacy();
  const rango = opts.rango || await obtenerRangoBimestre(q, opts.colegio_id, ciclo, anio);
  const ajustes = await leerAjustes();
  const calc = await calcularMatriculaEnRango(opts.matriculaId, rango, ajustes);
  await persistirNotaNueva(opts.matriculaId, rango.ciclo || ciclo, calc);
  if (opts.avisar !== false && opts.alumnoId) {
    await revisarAvisoLimite({
      matriculaId: opts.matriculaId,
      colegioId: opts.colegio_id,
      anio,
      ciclo: rango.ciclo || ciclo,
      nota: Math.min(calc.mes1, calc.mes2, calc.final),
      usuarioId: opts.usuarioId,
      alumnoId: opts.alumnoId,
    });
  }
  return {
    modo: 'nueva',
    nota: textoNota(calc.final, calc.redondeado),
    notas: {
      final: textoNota(calc.final, calc.redondeado),
      mes1: textoNota(calc.mes1, false),
      mes2: textoNota(calc.mes2, false),
      redondeado: !!calc.redondeado,
    },
    ...rango,
  };
}

async function recalcularCicloNuevo(colegioId, anio, ciclo) {
  if (!usaConductaNueva(anio, ciclo)) return 0;
  await asegurarTablas();
  const { obtenerRangoBimestre } = legacy();
  const rango = await obtenerRangoBimestre(query, colegioId, ciclo, anio);
  const mats = await query(
    `SELECT m.id AS matricula_id
     FROM matriculas m
     INNER JOIN grupos g ON g.id = m.grupo_id
     WHERE m.colegio_id = ? AND g.anio = ? AND (m.estado = 0)`,
    [colegioId, anio]
  );
  const ajustes = await leerAjustes();
  let n = 0;
  for (const m of mats || []) {
    const calc = await calcularMatriculaEnRango(m.matricula_id, rango, ajustes);
    await persistirNotaNueva(m.matricula_id, ciclo, calc);
    n += 1;
  }
  return n;
}

async function alumnoDeMatricula(matriculaId) {
  const rows = await query(
    `SELECT a.id AS alumno_id,
            TRIM(CONCAT(COALESCE(a.nombres,''), ' ', COALESCE(a.apellido_paterno,''), ' ', COALESCE(a.apellido_materno,''))) AS nombre,
            g.id AS grupo_id, g.tutor_id, g.tutor_id_2, g.colegio_id, g.anio
     FROM matriculas m
     INNER JOIN alumnos a ON a.id = m.alumno_id
     INNER JOIN grupos g ON g.id = m.grupo_id
     WHERE m.id = ? LIMIT 1`,
    [matriculaId]
  );
  return rows?.[0] || null;
}

async function avisarTutor(alumno, titulo, mensaje, usuarioId) {
  if (!alumno) return;
  const ids = [alumno.tutor_id, alumno.tutor_id_2].map((x) => parseInt(x, 10)).filter((x) => x > 0);
  if (!ids.length) return;
  const ph = ids.map(() => '?').join(',');
  const usuarios = await query(
    `SELECT id FROM usuarios WHERE personal_id IN (${ph}) AND colegio_id = ? AND estado = 'ACTIVO'`,
    [...ids, alumno.colegio_id]
  );
  for (const u of usuarios || []) {
    if (usuarioId && Number(u.id) === Number(usuarioId)) continue;
    try {
      await insertNotificacionUsuario(execute, {
        usuario_id: usuarioId || u.id,
        destinatario_id: u.id,
        asunto: titulo,
        contenido: mensaje,
        estado: 'NO ENVIADO',
        accion_tipo: 'conducta_item',
        url_destino: '/docente/tutoria',
      });
    } catch (e) {
      console.warn('[conducta] aviso tutor:', e.message);
    }
  }
}

async function avisarFamiliaYTutor({ alumno, titulo, mensaje, usuarioId, tipo, dataExtra }) {
  if (!alumno?.alumno_id) return;
  try {
    const { crearNotificacionesApoderados } = require('../routes/docente.routes');
    await crearNotificacionesApoderados({
      alumno_id: alumno.alumno_id,
      usuario_id: usuarioId || 0,
      colegio_id: alumno.colegio_id,
      anio_activo: alumno.anio,
      tituloNotificacion: titulo,
      mensajeNotificacion: mensaje,
      tipoNotificacion: tipo || 'conducta_item',
      dataExtra: dataExtra || {},
    });
  } catch (e) {
    console.warn('[conducta] aviso familia:', e.message);
  }
  await avisarTutor(alumno, titulo, mensaje, usuarioId);
}

async function insertarRegistro({
  colegioId, matriculaId, item, fecha, hora, anio, ciclo, origen,
  usuarioId, incidentId, pedId, asistenciaId,
}) {
  await execute(
    `INSERT INTO conducta_registros
     (colegio_id, matricula_id, item_id, grupo, codigo, nombre, descuento, fecha, hora, anio, ciclo, origen,
      registrado_por_usuario_id, enrollment_incident_id, presentacion_descuento_id, asistencia_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      colegioId, matriculaId, item.id, item.grupo, item.codigo, item.nombre, item.descuento,
      fecha, hora || null, anio, ciclo, origen || 'manual',
      usuarioId || null, incidentId || null, pedId || null, asistenciaId || null,
      fechaHoraMySQLLima(),
    ]
  );
}

async function registrarItemEnMatricula({
  matriculaId, colegioId, anio, item, fecha, hora, origen, usuarioId,
  workerId, assignmentId, incidentIdExistente, pedId, asistenciaId, avisar = true, omitirSync = false,
}) {
  await asegurarTablas();
  const info = await cicloDeFecha(colegioId, anio, fecha);
  if (!info.nueva) return { aplicada: false, motivo: 'regimen_anterior' };
  const alumno = await alumnoDeMatricula(matriculaId);
  let incidentId = incidentIdExistente || null;
  if (!incidentId && assignmentId != null) {
    const desc = `${item.codigo} · ${item.nombre} (−${notaTexto(item.descuento)})`;
    const now = fechaHoraMySQLLima();
    const ins = await execute(
      `INSERT INTO enrollment_incidents
       (enrollment_id, assignment_id, worker_id, type, points, description, created_at, updated_at)
       VALUES (?, ?, ?, 1, 0, ?, ?, ?)`,
      [matriculaId, assignmentId, workerId || 0, desc, now, now]
    );
    incidentId = ins.insertId;
  }
  await insertarRegistro({
    colegioId,
    matriculaId,
    item,
    fecha,
    hora,
    anio,
    ciclo: info.ciclo,
    origen,
    usuarioId,
    incidentId,
    pedId,
    asistenciaId,
  });
  const sync = omitirSync ? null : await sincronizarConductaNueva(query, execute, {
    matriculaId,
    colegio_id: colegioId,
    anioEscolar: anio,
    ciclo: info.ciclo,
    rango: info.rango,
    alumnoId: alumno?.alumno_id,
    usuarioId,
  });
  if (avisar && alumno) {
    const titulo = etiquetaGrupo(item.grupo, item);
    const mensaje = `${alumno.nombre}: ${item.codigo} ${item.nombre}. Se restaron ${notaTexto(item.descuento)} puntos de conducta.`;
    await avisarFamiliaYTutor({
      alumno,
      titulo,
      mensaje,
      usuarioId,
      tipo: 'conducta_item',
      dataExtra: { codigo: item.codigo, descuento: notaTexto(item.descuento), ciclo: info.ciclo },
    });
  }
  return { aplicada: true, incidentId, nota: sync?.nota, codigo: item.codigo };
}

async function buscarAlumnosDocente({ colegioId, anio, personalId, texto }) {
  const q = String(texto || '').trim();
  if (q.length < 2 || !personalId) return [];
  const like = `%${q.replace(/[%_]/g, '')}%`;
  const rows = await query(
    `SELECT DISTINCT m.id AS matricula_id,
            TRIM(CONCAT(COALESCE(a.apellido_paterno,''), ' ', COALESCE(a.apellido_materno,''), ' ', COALESCE(a.nombres,''))) AS nombre,
            a.nro_documento AS dni,
            g.grado, g.seccion, COALESCE(n.nombre, '') AS nivel
     FROM matriculas m
     INNER JOIN alumnos a ON a.id = m.alumno_id
     INNER JOIN grupos g ON g.id = m.grupo_id
     LEFT JOIN niveles n ON n.id = g.nivel_id
     WHERE m.colegio_id = ? AND g.anio = ? AND (m.estado = 0)
       AND (
         g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)
         OR EXISTS (
           SELECT 1 FROM asignaturas asig
           WHERE asig.grupo_id = g.id AND asig.personal_id = ? AND asig.colegio_id = m.colegio_id AND asig.id > 0
         )
       )
       AND (
         a.nro_documento LIKE ?
         OR a.nombres LIKE ?
         OR a.apellido_paterno LIKE ?
         OR a.apellido_materno LIKE ?
         OR CONCAT(a.apellido_paterno, ' ', a.apellido_materno, ' ', a.nombres) LIKE ?
       )
     ORDER BY a.apellido_paterno, a.apellido_materno, a.nombres
     LIMIT 20`,
    [colegioId, anio, personalId, personalId, personalId, like, like, like, like, like]
  );
  return (rows || []).map((r) => ({
    matricula_id: r.matricula_id,
    nombre: r.nombre,
    dni: r.dni || '',
    grado: r.grado != null ? String(r.grado) : '',
    seccion: r.seccion || '',
    nivel: r.nivel || '',
  }));
}

async function registrarRapido({ colegioId, anio, personalId, usuarioId, matriculaId, itemId }) {
  const acceso = await query(
    `SELECT m.id,
            CASE WHEN g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?) THEN 1 ELSE 0 END AS es_tutor,
            (SELECT asig.id FROM asignaturas asig
             WHERE asig.grupo_id = g.id AND asig.personal_id = ? AND asig.colegio_id = m.colegio_id AND asig.id > 0
             ORDER BY asig.id LIMIT 1) AS asignatura_id
     FROM matriculas m
     INNER JOIN grupos g ON g.id = m.grupo_id
     WHERE m.id = ? AND m.colegio_id = ? AND g.anio = ? AND (m.estado = 0)
     LIMIT 1`,
    [personalId, personalId, personalId, matriculaId, colegioId, anio]
  );
  const row = acceso?.[0];
  if (!row || (!Number(row.es_tutor) && !row.asignatura_id)) {
    const err = new Error('No puedes registrar conducta de este alumno');
    err.status = 403;
    throw err;
  }
  const { ASSIGNMENT_ID_TUTORIA } = legacy();
  return registrarManual({
    matriculaId,
    colegioId,
    anio,
    itemId,
    usuarioId,
    workerId: personalId,
    assignmentId: Number(row.es_tutor) ? ASSIGNMENT_ID_TUTORIA : row.asignatura_id,
  });
}

async function registrarManual({
  matriculaId, colegioId, anio, itemId, usuarioId, workerId, assignmentId,
}) {
  await asegurarTablas();
  const rows = await query(`SELECT * FROM conducta_items WHERE id = ? AND activo = 1 LIMIT 1`, [itemId]);
  if (!rows?.length) {
    const err = new Error('El ítem no está disponible');
    err.status = 400;
    throw err;
  }
  const item = filaItem(rows[0]);
  const hoy = fechaHoraMySQLLima();
  const fecha = hoy.slice(0, 10);
  const hora = hoy.slice(11, 19);
  const out = await registrarItemEnMatricula({
    matriculaId,
    colegioId,
    anio,
    item,
    fecha,
    hora,
    origen: 'manual',
    usuarioId,
    workerId,
    assignmentId,
  });
  if (!out.aplicada) {
    const err = new Error('Este bimestre conserva la conducta anterior. Escribe la descripción como hasta ahora.');
    err.status = 400;
    throw err;
  }
  return out;
}

async function registrarRolEscaneo({
  matriculaId, colegioId, anio, fecha, hora, rol, usuarioId, pedId, asistenciaId, workerId,
}) {
  const campo = rol === 'olvido_qr'
    ? 'es_olvido_qr'
    : rol === 'vestimenta'
      ? 'es_ingreso_vestimenta'
      : 'es_ingreso_tardanza';
  const item = await itemPorRol(campo);
  if (!item) {
    console.warn(`[conducta] No hay ítem activo para ${rol}`);
    return { aplicada: false };
  }
  let asistenciaVinculo = asistenciaId || null;
  if (!asistenciaVinculo && rol === 'tardanza') {
    const asis = await query(
      `SELECT id FROM matriculas_asistencias WHERE matricula_id = ? AND fecha = ? LIMIT 1`,
      [matriculaId, fecha]
    );
    asistenciaVinculo = asis?.[0]?.id || null;
  }
  const { ASSIGNMENT_ID_VESTIMENTA, ASSIGNMENT_ID_TUTORIA } = legacy();
  return registrarItemEnMatricula({
    matriculaId,
    colegioId,
    anio,
    item,
    fecha,
    hora,
    origen: 'ingreso',
    usuarioId,
    workerId,
    assignmentId: rol === 'tardanza' ? ASSIGNMENT_ID_TUTORIA : ASSIGNMENT_ID_VESTIMENTA,
    pedId,
    asistenciaId: asistenciaVinculo,
    avisar: true,
  });
}

async function borrarRegistroVinculado(campo, id) {
  const permitidos = ['enrollment_incident_id', 'presentacion_descuento_id', 'asistencia_id'];
  if (!permitidos.includes(campo)) return;
  try {
    await asegurarTablas();
    await execute(`DELETE FROM conducta_registros WHERE ${campo} = ?`, [id]);
  } catch (e) {
    console.warn('[conducta] borrar registro:', e.message);
  }
}

async function accesoMatriculaDocente({ colegioId, anio, personalId, matriculaId }) {
  const acceso = await query(
    `SELECT m.id
     FROM matriculas m
     INNER JOIN grupos g ON g.id = m.grupo_id
     WHERE m.id = ? AND m.colegio_id = ? AND g.anio = ? AND (m.estado = 0)
       AND (
         g.tutor_id = ? OR (COALESCE(g.tutor_id_2, 0) > 0 AND g.tutor_id_2 = ?)
         OR EXISTS (
           SELECT 1 FROM asignaturas asig
           WHERE asig.grupo_id = g.id AND asig.personal_id = ? AND asig.colegio_id = m.colegio_id AND asig.id > 0
         )
       )
     LIMIT 1`,
    [matriculaId, colegioId, anio, personalId, personalId, personalId]
  );
  return acceso?.[0] || null;
}

function filaRegistroVista(r) {
  const ymd = legacy().toFechaYmd(r.fecha) || String(r.fecha || '').slice(0, 10);
  const hora = r.hora ? String(r.hora).slice(0, 5) : '';
  return {
    id: r.id,
    grupo: r.grupo,
    etiqueta: etiquetaGrupo(r.grupo, r),
    codigo: r.codigo,
    nombre: r.nombre,
    descuento: notaTexto(r.descuento),
    fecha: ymd,
    hora,
    ciclo: r.ciclo,
    origen: r.origen || 'manual',
  };
}

async function listarRegistrosDocente({ colegioId, anio, personalId, matriculaId }) {
  const acceso = await accesoMatriculaDocente({ colegioId, anio, personalId, matriculaId });
  if (!acceso) {
    const err = new Error('No puedes ver la conducta de este alumno');
    err.status = 403;
    throw err;
  }
  await asegurarTablas();
  const rows = await query(
    `SELECT r.*, COALESCE(i.es_olvido_qr, 0) AS es_olvido_qr
     FROM conducta_registros r
     LEFT JOIN conducta_items i ON i.id = r.item_id
     WHERE r.matricula_id = ? AND r.colegio_id = ? AND r.anio = ?
     ORDER BY r.fecha DESC, r.hora DESC, r.id DESC`,
    [matriculaId, colegioId, anio]
  );
  return (rows || []).map(filaRegistroVista);
}

async function limpiarEspejosRegistro(row) {
  if (!row) return;
  if (row.presentacion_descuento_id) {
    try {
      await execute(`DELETE FROM presentacion_escolar_descuentos WHERE id = ?`, [row.presentacion_descuento_id]);
    } catch (e) {
      console.warn('[conducta] quitar presentación:', e.message);
    }
  }
  if (row.asistencia_id) {
    try {
      await execute(
        `UPDATE matriculas_asistencias SET tipo = 'PRESENTE' WHERE id = ? AND tipo = 'TARDANZA'`,
        [row.asistencia_id]
      );
    } catch (e) {
      console.warn('[conducta] corregir tardanza:', e.message);
    }
  }
  if (row.enrollment_incident_id) {
    try {
      await execute(`DELETE FROM enrollment_incidents WHERE id = ? AND type = 1`, [row.enrollment_incident_id]);
    } catch (e) {
      console.warn('[conducta] quitar incidencia:', e.message);
    }
  }
  await execute(`DELETE FROM conducta_registros WHERE id = ?`, [row.id]);
}

async function sincronizarTrasBorrar(row) {
  const { sincronizarConductaMatriculaBimestre } = require('./conductaIncidenciasBimestre');
  return sincronizarConductaMatriculaBimestre(query, execute, {
    matriculaId: row.matricula_id,
    colegio_id: row.colegio_id,
    anioEscolar: row.anio,
    ciclo: row.ciclo,
  });
}

async function eliminarRegistroDocente({ registroId, colegioId, anio, personalId }) {
  await asegurarTablas();
  const rows = await query(
    `SELECT * FROM conducta_registros WHERE id = ? AND colegio_id = ? LIMIT 1`,
    [registroId, colegioId]
  );
  const row = rows?.[0];
  if (!row) {
    const err = new Error('Ese registro ya no está');
    err.status = 404;
    throw err;
  }
  const acceso = await accesoMatriculaDocente({
    colegioId, anio, personalId, matriculaId: row.matricula_id,
  });
  if (!acceso) {
    const err = new Error('No puedes quitar la conducta de este alumno');
    err.status = 403;
    throw err;
  }
  await limpiarEspejosRegistro(row);
  const sync = await sincronizarTrasBorrar(row);
  return { nota: sync?.nota ?? null, codigo: row.codigo };
}

async function prepararBorradoIncidente(incidentId) {
  const id = parseInt(incidentId, 10);
  if (!id) return;
  try {
    await asegurarTablas();
  } catch (e) {
    return;
  }
  const rows = await query(
    `SELECT * FROM conducta_registros WHERE enrollment_incident_id = ? LIMIT 1`,
    [id]
  );
  if (!rows?.length) return;
  const row = rows[0];
  row.enrollment_incident_id = null;
  await limpiarEspejosRegistro(row);
}

async function detalleLibreta(matriculaId, colegioId, anio) {
  try {
    await asegurarTablas();
  } catch (e) {
    return [];
  }
  const { obtenerRangoBimestre } = legacy();
  const ajustes = await leerAjustes();
  const hojas = [];
  for (let c = 1; c <= 4; c += 1) {
    if (!usaConductaNueva(anio, c)) continue;
    const rango = await obtenerRangoBimestre(query, colegioId, c, anio);
    const calc = await calcularMatriculaEnRango(matriculaId, rango, ajustes);
    const regs = await query(
      `SELECT fecha, hora, codigo, nombre, grupo, descuento
       FROM conducta_registros
       WHERE matricula_id = ? AND anio = ? AND ciclo = ?
       ORDER BY fecha ASC, hora ASC, id ASC`,
      [matriculaId, anio, c]
    );
    hojas.push({
      ciclo: c,
      desde: rango.desde,
      hasta: rango.hasta,
      nota_mes_1: textoNota(calc.mes1, false),
      nota_mes_2: textoNota(calc.mes2, false),
      nota_final: textoNota(calc.final, calc.redondeado),
      descontado_1: notaTexto(calc.descontado1),
      descontado_2: notaTexto(calc.descontado2),
      registros: (regs || []).map((r) => ({
        fecha: legacy().toFechaYmd(r.fecha) || String(r.fecha).slice(0, 10),
        hora: r.hora ? String(r.hora).slice(0, 5) : '',
        codigo: r.codigo,
        nombre: r.nombre,
        grupo: r.grupo,
        descuento: notaTexto(r.descuento),
      })),
    });
  }
  return hojas;
}

async function aplicarEnBimestres(bimestres, { matriculaId, anio }) {
  if (!Array.isArray(bimestres) || !matriculaId) return bimestres;
  try {
    await respaldarIngresosSinCatalogo(matriculaId, anio);
  } catch (eBack) {
    console.warn('[conducta] respaldar ingresos:', eBack.message);
  }
  let vinculados = { inc: new Set(), ped: new Set(), tard: new Set() };
  let registros = [];
  try {
    await asegurarTablas();
    registros = await query(
      `SELECT r.*, COALESCE(i.es_olvido_qr, 0) AS es_olvido_qr
       FROM conducta_registros r
       LEFT JOIN conducta_items i ON i.id = r.item_id
       WHERE r.matricula_id = ? AND r.anio = ?
       ORDER BY r.fecha DESC, r.id DESC`,
      [matriculaId, anio]
    ) || [];
    registros.forEach((r) => {
      if (r.enrollment_incident_id) vinculados.inc.add(Number(r.enrollment_incident_id));
      if (r.presentacion_descuento_id) vinculados.ped.add(Number(r.presentacion_descuento_id));
      if (r.asistencia_id) vinculados.tard.add(Number(r.asistencia_id));
    });
  } catch (e) {
    return bimestres;
  }
  const ajustes = await leerAjustes();
  for (const b of bimestres) {
    if (!usaConductaNueva(anio, b.ciclo)) continue;
    const propios = registros.filter((r) => Number(r.ciclo) === Number(b.ciclo));
    const itemsNuevos = propios.map((r) => ({
      id: `cat-${r.id}`,
      description: `${r.codigo} · ${r.nombre}`,
      created_at: (() => {
        const ymd = legacy().toFechaYmd(r.fecha) || String(r.fecha).slice(0, 10);
        return r.hora ? `${ymd} ${String(r.hora).slice(0, 8)}` : ymd;
      })(),
      docente_nombre: 'Registro',
      curso_nombre: etiquetaGrupo(r.grupo, r),
      origen: origenDeGrupo(r.grupo, r),
      descuento: notaTexto(r.descuento),
      codigo: r.codigo,
      ciclo: b.ciclo,
    }));
    const viejos = (b.incidencias || []).filter((it) => {
      const id = String(it.id || '');
      const n = parseInt(id.split('-')[1], 10);
      if (id.startsWith('inc-') && vinculados.inc.has(n)) return false;
      if (id.startsWith('ped-') && vinculados.ped.has(n)) return false;
      if (id.startsWith('tard-') && vinculados.tard.has(n)) return false;
      return true;
    });
    const rango = { desde: b.fecha_desde, hasta: b.fecha_hasta };
    const calc = (rango.desde && rango.hasta)
      ? await calcularMatriculaEnRango(matriculaId, rango, ajustes)
      : { mes1: ajustes.nota_inicial, mes2: ajustes.nota_inicial, final: ajustes.nota_inicial, descontado1: 0, descontado2: 0, redondeado: !!ajustes.redondear_promedio };
    b.modo = 'nueva';
    b.nota_mes_1 = notaTexto(calc.mes1);
    b.nota_mes_2 = notaTexto(calc.mes2);
    b.nota_conducta = textoNota(calc.final, calc.redondeado);
    b.descontado_1 = notaTexto(calc.descontado1);
    b.descontado_2 = notaTexto(calc.descontado2);
    b.nota_incidencias = null;
    b.nota_presentacion = null;
    b.nota_tardanzas = null;
    b.nota_olvido_qr = null;
    b.incidencias = [...itemsNuevos, ...viejos];
    b.total = b.incidencias.length;
    try {
      await persistirNotaNueva(matriculaId, b.ciclo, calc);
    } catch (ePers) {
      console.warn('[conducta] persistir vista:', ePers.message);
    }
  }
  return bimestres;
}

module.exports = {
  ANIO_INICIO,
  CICLO_INICIO,
  GRUPOS,
  LABEL_GRUPO,
  usaConductaNueva,
  bloquesDelBimestre,
  notaDesdeSuma,
  promedioDos,
  asegurarTablas,
  leerAjustes,
  guardarAjustes,
  listarItems,
  catalogoAgrupado,
  crearItem,
  actualizarItem,
  eliminarItem,
  regimenHoy,
  sincronizarConductaNueva,
  recalcularCicloNuevo,
  registrarManual,
  registrarRapido,
  buscarAlumnosDocente,
  registrarRolEscaneo,
  borrarRegistroVinculado,
  listarRegistrosDocente,
  eliminarRegistroDocente,
  prepararBorradoIncidente,
  detalleLibreta,
  aplicarEnBimestres,
  avisarTutor,
};
