function to01(v) {
  if (Buffer.isBuffer(v)) return v.length && v[0] ? 1 : 0;
  if (v && typeof v === 'object' && Array.isArray(v.data)) return v.data[0] ? 1 : 0;
  if (v === true || v === 1 || v === '1' || v === 'true') return 1;
  if (v === false || v === 0 || v === '0' || v === 'false') return 0;
  return 0;
}

function parseAnio(raw, fallback = 2027) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 2020 && n <= 2100 ? n : fallback;
}

function payloadBase(row, extra = {}) {
  const anio = parseAnio(row?.anio);
  return {
    anio,
    bannerFlotante: !!to01(row?.banner_flotante),
    chipHero: !!to01(row?.chip_hero),
    etiquetaBoton: `Admisión ${anio}`,
    tituloPagina: `Admisión y Ratificación ${anio}`,
    textoBanner: `Ya abrió Admisión ${anio}`,
    textoChip: `Inscripciones abiertas ${anio}`,
    textoChipSub: 'Cupos limitados · Inicial, Primaria y Secundaria',
    rutaFormulario: '/admision',
    ...extra,
  };
}

async function leerAdmisionConfig(queryFn) {
  try {
    const rows = await queryFn(
      `SELECT anio, banner_flotante, chip_hero FROM web_admision_config WHERE id = 1 LIMIT 1`
    );
    if (!rows?.[0]) {
      return payloadBase({ anio: 2027, banner_flotante: 0, chip_hero: 0 }, { source: 'default' });
    }
    return payloadBase(rows[0], { source: 'mysql' });
  } catch (e) {
    if (e && (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146)) {
      return payloadBase({ anio: 2027, banner_flotante: 0, chip_hero: 0 }, {
        source: 'sin_tabla',
        necesita_migracion: true,
      });
    }
    throw e;
  }
}

async function guardarAdmisionConfig(executeFn, queryFn, body) {
  const anio = parseAnio(body?.anio);
  const banner = to01(body?.banner_flotante ?? body?.bannerFlotante, 0);
  const chip = to01(body?.chip_hero ?? body?.chipHero, 0);
  await executeFn(
    `INSERT INTO web_admision_config (id, anio, banner_flotante, chip_hero)
     VALUES (1, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       anio = VALUES(anio),
       banner_flotante = VALUES(banner_flotante),
       chip_hero = VALUES(chip_hero)`,
    [anio, banner, chip]
  );
  return leerAdmisionConfig(queryFn);
}

module.exports = {
  to01,
  parseAnio,
  leerAdmisionConfig,
  guardarAdmisionConfig,
};
