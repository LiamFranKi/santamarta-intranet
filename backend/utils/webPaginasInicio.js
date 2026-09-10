const FALLBACK = '/FONDOBANNER.jpg';

function mapRow(row) {
  return {
    banner_ruta: String(row?.banner_ruta || FALLBACK).trim() || FALLBACK,
    updated_at: row?.updated_at || null,
  };
}

async function leerBannerInicio(queryFn) {
  try {
    const rows = await queryFn(
      `SELECT banner_ruta, updated_at FROM web_paginas_inicio WHERE id = 1 LIMIT 1`
    );
    if (!rows?.[0]) {
      return { ...mapRow(null), source: 'default' };
    }
    return { ...mapRow(rows[0]), source: 'mysql' };
  } catch (e) {
    if (e && (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146)) {
      return { ...mapRow(null), source: 'sin_tabla', necesita_migracion_inicio: true };
    }
    throw e;
  }
}

function esRutaInicioSubida(ruta) {
  return String(ruta || '').startsWith('/inicio/');
}

async function guardarBannerInicio(executeFn, queryFn, { ruta, removeOld }) {
  const current = await leerBannerInicio(queryFn);
  if (current.necesita_migracion_inicio) {
    throw Object.assign(new Error('Falta ejecutar la migración 090 (banner del inicio).'), {
      status: 503,
      payload: current,
    });
  }
  const next = String(ruta || '').trim() || FALLBACK;
  await executeFn(
    `INSERT INTO web_paginas_inicio (id, banner_ruta) VALUES (1, ?)
     ON DUPLICATE KEY UPDATE banner_ruta = VALUES(banner_ruta)`,
    [next]
  );
  if (removeOld && esRutaInicioSubida(current.banner_ruta) && current.banner_ruta !== next) {
    removeOld(current.banner_ruta);
  }
  return leerBannerInicio(queryFn);
}

module.exports = {
  FALLBACK,
  leerBannerInicio,
  guardarBannerInicio,
  esRutaInicioSubida,
};
