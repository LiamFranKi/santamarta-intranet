const FALLBACK_PAGINA = {
  titulo: 'Convenios',
  subtitulo: 'Alianzas estratégicas para una educación integral',
  intro:
    'Trabajamos con instituciones reconocidas para ofrecer programas de excelencia que complementan nuestra formación académica.',
  cta_texto:
    '¿Interesado en nuestros convenios? Contáctanos para más información sobre cómo participar en estos programas.',
};

const FALLBACK_ITEMS = [
  {
    id: 1,
    nombre: 'Cambridge (Inglés)',
    descripcion: 'Programa de inglés certificado por Cambridge Assessment English',
    beneficios:
      'Certificación internacional reconocida\nMetodología comunicativa\nPreparación para exámenes Cambridge\nDocentes certificados',
    color: 'from-green-500 to-emerald-500',
    logo_ruta: '',
    imagen_ruta: '',
    pdf_ruta: '/documentos/ConvenioCambridge.pdf',
    orden: 1,
    activo: 1,
  },
  {
    id: 2,
    nombre: 'AquaXtreme (Natación)',
    descripcion: 'Programa de natación y desarrollo acuático',
    beneficios:
      'Instalaciones modernas\nInstructores certificados\nDesarrollo físico integral\nSeguridad y supervisión constante',
    color: 'from-cyan-500 to-blue-500',
    logo_ruta: '',
    imagen_ruta: '',
    pdf_ruta: '/documentos/ConvenioAquaxtreme.pdf',
    orden: 2,
    activo: 1,
  },
  {
    id: 3,
    nombre: 'Valley (Robótica)',
    descripcion: 'Programa de robótica y tecnología educativa',
    beneficios:
      'Pensamiento computacional\nProyectos prácticos\nCompetencias y concursos\nPreparación para el futuro tecnológico',
    color: 'from-purple-500 to-pink-500',
    logo_ruta: '',
    imagen_ruta: '',
    pdf_ruta: '/documentos/ConvenioValley.pdf',
    orden: 3,
    activo: 1,
  },
];

const COLORES = new Set([
  'from-green-500 to-emerald-500',
  'from-cyan-500 to-blue-500',
  'from-purple-500 to-pink-500',
  'from-amber-500 to-orange-500',
  'from-sky-500 to-indigo-600',
  'from-rose-500 to-pink-600',
  'from-slate-700 to-slate-900',
]);

function sinTabla(e) {
  return Boolean(e && (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146));
}

function txt(v, max, fallback = '') {
  const s = String(v ?? '').trim();
  if (!s) return fallback;
  return s.slice(0, max);
}

function toActivo(v) {
  return v === true || v === 1 || v === '1' || Number(v) === 1 ? 1 : 0;
}

function toOrden(v, fallback = 1) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1 || n > 999) return fallback;
  return Math.round(n);
}

function mapItem(row) {
  return {
    id: Number(row.id),
    nombre: String(row.nombre || '').trim(),
    descripcion: String(row.descripcion || '').trim(),
    beneficios: String(row.beneficios || ''),
    color: COLORES.has(String(row.color || ''))
      ? String(row.color)
      : 'from-green-500 to-emerald-500',
    logo_ruta: String(row.logo_ruta || '').trim(),
    imagen_ruta: String(row.imagen_ruta || '').trim(),
    pdf_ruta: String(row.pdf_ruta || '').trim(),
    orden: toOrden(row.orden, 1),
    activo: toActivo(row.activo),
    updated_at: row.updated_at || null,
  };
}

function mapPagina(row) {
  return {
    titulo: txt(row?.titulo, 120, FALLBACK_PAGINA.titulo) || FALLBACK_PAGINA.titulo,
    subtitulo: txt(row?.subtitulo, 255, FALLBACK_PAGINA.subtitulo) || FALLBACK_PAGINA.subtitulo,
    intro: txt(row?.intro, 800, FALLBACK_PAGINA.intro),
    cta_texto: txt(row?.cta_texto, 255, FALLBACK_PAGINA.cta_texto) || FALLBACK_PAGINA.cta_texto,
    updated_at: row?.updated_at || null,
  };
}

function payloadVacio(extra = {}) {
  return {
    ...FALLBACK_PAGINA,
    items: FALLBACK_ITEMS.map(mapItem),
    ...extra,
  };
}

async function leerConvenios(queryFn) {
  try {
    const paginas = await queryFn(
      `SELECT titulo, subtitulo, intro, cta_texto, updated_at
       FROM web_paginas_convenios WHERE id = 1 LIMIT 1`
    );
    const items = await queryFn(
      `SELECT id, nombre, descripcion, beneficios, color, logo_ruta, imagen_ruta, pdf_ruta, orden, activo, updated_at
       FROM web_paginas_convenio_items
       ORDER BY orden ASC, id ASC`
    );
    return {
      ...mapPagina(paginas?.[0] || FALLBACK_PAGINA),
      items: (items || []).map(mapItem),
      source: paginas?.[0] ? 'mysql' : 'default',
    };
  } catch (e) {
    if (sinTabla(e)) {
      return payloadVacio({ source: 'sin_tabla', necesita_migracion_convenios: true });
    }
    throw e;
  }
}

async function guardarPagina(executeFn, queryFn, body) {
  const data = mapPagina(body);
  await executeFn(
    `INSERT INTO web_paginas_convenios (id, titulo, subtitulo, intro, cta_texto)
     VALUES (1, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       titulo = VALUES(titulo),
       subtitulo = VALUES(subtitulo),
       intro = VALUES(intro),
       cta_texto = VALUES(cta_texto)`,
    [data.titulo, data.subtitulo, data.intro, data.cta_texto]
  );
  return leerConvenios(queryFn);
}

async function leerItem(queryFn, id) {
  const rows = await queryFn(
    `SELECT id, nombre, descripcion, beneficios, color, logo_ruta, imagen_ruta, pdf_ruta, orden, activo, updated_at
     FROM web_paginas_convenio_items WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows?.[0] ? mapItem(rows[0]) : null;
}

async function crearItem(executeFn, queryFn, body) {
  const current = await leerConvenios(queryFn);
  if (current.necesita_migracion_convenios) {
    throw Object.assign(new Error('Falta ejecutar la migración 098 (página Convenios).'), {
      status: 503,
      payload: current,
    });
  }
  const orden = toOrden(body?.orden, (current.items?.length || 0) + 1);
  const result = await executeFn(
    `INSERT INTO web_paginas_convenio_items
       (nombre, descripcion, beneficios, color, orden, activo)
     VALUES (?, ?, ?, ?, ?, 1)`,
    [
      txt(body?.nombre, 120, 'Nuevo convenio') || 'Nuevo convenio',
      txt(body?.descripcion, 400),
      txt(body?.beneficios, 2000),
      COLORES.has(String(body?.color || '')) ? body.color : 'from-green-500 to-emerald-500',
      orden,
    ]
  );
  const id = Number(result?.insertId || 0);
  const item = id ? await leerItem(queryFn, id) : null;
  return { item, ...(await leerConvenios(queryFn)) };
}

async function guardarItem(executeFn, queryFn, id, body) {
  const current = await leerItem(queryFn, id);
  if (!current) {
    throw Object.assign(new Error('Convenio no encontrado'), { status: 404 });
  }
  await executeFn(
    `UPDATE web_paginas_convenio_items
     SET nombre = ?, descripcion = ?, beneficios = ?, color = ?, orden = ?, activo = ?
     WHERE id = ?`,
    [
      txt(body?.nombre, 120, current.nombre) || current.nombre,
      txt(body?.descripcion, 400, current.descripcion),
      String(body?.beneficios ?? current.beneficios).slice(0, 2000),
      COLORES.has(String(body?.color || '')) ? body.color : current.color,
      toOrden(body?.orden, current.orden),
      toActivo(body?.activo === undefined ? current.activo : body.activo),
      id,
    ]
  );
  return { item: await leerItem(queryFn, id), ...(await leerConvenios(queryFn)) };
}

function esRutaConvenioSubida(ruta) {
  return String(ruta || '').startsWith('/convenios/');
}

async function guardarRutaCampo(executeFn, queryFn, { id, campo, ruta, removeOld }) {
  if (!['logo_ruta', 'imagen_ruta', 'pdf_ruta'].includes(campo)) {
    throw Object.assign(new Error('Campo de archivo inválido'), { status: 400 });
  }
  const current = await leerItem(queryFn, id);
  if (!current) {
    throw Object.assign(new Error('Convenio no encontrado'), { status: 404 });
  }
  const next = String(ruta || '').trim();
  await executeFn(`UPDATE web_paginas_convenio_items SET ${campo} = ? WHERE id = ?`, [next, id]);
  const prev = current[campo];
  if (removeOld && esRutaConvenioSubida(prev) && prev !== next) {
    removeOld(prev);
  }
  return { item: await leerItem(queryFn, id), ...(await leerConvenios(queryFn)) };
}

async function eliminarItem(executeFn, queryFn, id, removeOld) {
  const current = await leerItem(queryFn, id);
  if (!current) {
    throw Object.assign(new Error('Convenio no encontrado'), { status: 404 });
  }
  await executeFn(`DELETE FROM web_paginas_convenio_items WHERE id = ?`, [id]);
  if (removeOld) {
    if (esRutaConvenioSubida(current.logo_ruta)) removeOld(current.logo_ruta);
    if (esRutaConvenioSubida(current.imagen_ruta)) removeOld(current.imagen_ruta);
    if (esRutaConvenioSubida(current.pdf_ruta)) removeOld(current.pdf_ruta);
  }
  return leerConvenios(queryFn);
}

module.exports = {
  FALLBACK_PAGINA,
  FALLBACK_ITEMS,
  COLORES: [...COLORES],
  leerConvenios,
  guardarPagina,
  crearItem,
  guardarItem,
  guardarRutaCampo,
  eliminarItem,
  esRutaConvenioSubida,
};
