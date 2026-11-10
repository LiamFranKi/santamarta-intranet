function mapRow(row) {
  return {
    activo: Number(row?.activo) === 1,
    imagen_ruta: String(row?.imagen_ruta || '').trim(),
    enlace: String(row?.enlace || '').trim(),
    updated_at: row?.updated_at || null,
  };
}

function sinTabla(e) {
  return e && (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146);
}

async function leerAvisoInicio(queryFn) {
  try {
    const rows = await queryFn(
      `SELECT activo, imagen_ruta, enlace, updated_at FROM web_aviso_inicio WHERE id = 1 LIMIT 1`
    );
    if (!rows?.[0]) return { ...mapRow(null), source: 'default' };
    return { ...mapRow(rows[0]), source: 'mysql' };
  } catch (e) {
    if (sinTabla(e)) {
      return { ...mapRow(null), source: 'sin_tabla', necesita_migracion_aviso: true };
    }
    throw e;
  }
}

function enlaceSeguro(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  if (s.startsWith('/') && !s.startsWith('//') && !s.includes('..')) return s.slice(0, 500);
  let url;
  try {
    url = new URL(s);
  } catch {
    const err = new Error('El enlace debe empezar con https:// o ser una ruta de la web, por ejemplo /admision.');
    err.status = 400;
    throw err;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    const err = new Error('El enlace debe usar http o https.');
    err.status = 400;
    throw err;
  }
  return url.toString().slice(0, 500);
}

function esRutaAvisoSubida(ruta) {
  return String(ruta || '').startsWith('/aviso/');
}

async function guardarAvisoInicio(executeFn, queryFn, { activo, enlace }) {
  const current = await leerAvisoInicio(queryFn);
  if (current.necesita_migracion_aviso) {
    const err = new Error('Falta ejecutar la migración 129 (aviso de inicio).');
    err.status = 503;
    err.payload = current;
    throw err;
  }
  const nextEnlace = enlace === undefined ? current.enlace : enlaceSeguro(enlace);
  const nextActivo = activo === undefined ? (current.activo ? 1 : 0) : activo ? 1 : 0;
  await executeFn(
    `INSERT INTO web_aviso_inicio (id, activo, imagen_ruta, enlace)
     VALUES (1, ?, ?, ?)
     ON DUPLICATE KEY UPDATE activo = VALUES(activo), enlace = VALUES(enlace)`,
    [nextActivo, current.imagen_ruta || '', nextEnlace]
  );
  return leerAvisoInicio(queryFn);
}

async function guardarImagenAviso(executeFn, queryFn, { ruta, removeOld }) {
  const current = await leerAvisoInicio(queryFn);
  if (current.necesita_migracion_aviso) {
    const err = new Error('Falta ejecutar la migración 129 (aviso de inicio).');
    err.status = 503;
    err.payload = current;
    throw err;
  }
  const next = String(ruta || '').trim();
  if (!esRutaAvisoSubida(next)) {
    const err = new Error('Ruta de imagen inválida.');
    err.status = 400;
    throw err;
  }
  await executeFn(
    `INSERT INTO web_aviso_inicio (id, activo, imagen_ruta, enlace)
     VALUES (1, ?, ?, ?)
     ON DUPLICATE KEY UPDATE imagen_ruta = VALUES(imagen_ruta)`,
    [current.activo ? 1 : 0, next, current.enlace || '']
  );
  if (removeOld && esRutaAvisoSubida(current.imagen_ruta) && current.imagen_ruta !== next) {
    removeOld(current.imagen_ruta);
  }
  return leerAvisoInicio(queryFn);
}

module.exports = {
  leerAvisoInicio,
  guardarAvisoInicio,
  guardarImagenAviso,
  esRutaAvisoSubida,
};
