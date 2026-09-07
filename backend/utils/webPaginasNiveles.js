const FALLBACK = {
  monto_inicial: 510,
  monto_primaria: 510,
  monto_secundaria: 530,
  descuento_hermano: 20,
  texto_linea: 'Matrícula y Pensión',
};

function toMonto(raw, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 99999.99) return fallback;
  return Math.round(n * 100) / 100;
}

function payloadBase(row, extra = {}) {
  return {
    monto_inicial: toMonto(row?.monto_inicial, FALLBACK.monto_inicial),
    monto_primaria: toMonto(row?.monto_primaria, FALLBACK.monto_primaria),
    monto_secundaria: toMonto(row?.monto_secundaria, FALLBACK.monto_secundaria),
    descuento_hermano: toMonto(row?.descuento_hermano, FALLBACK.descuento_hermano),
    texto_linea: String(row?.texto_linea || FALLBACK.texto_linea).trim() || FALLBACK.texto_linea,
    ...extra,
  };
}

async function leerPaginasNiveles(queryFn) {
  try {
    const rows = await queryFn(
      `SELECT monto_inicial, monto_primaria, monto_secundaria, descuento_hermano, texto_linea, updated_at
       FROM web_paginas_niveles WHERE id = 1 LIMIT 1`
    );
    if (!rows?.[0]) {
      return payloadBase(FALLBACK, { source: 'default' });
    }
    return payloadBase(rows[0], { source: 'mysql', updated_at: rows[0].updated_at || null });
  } catch (e) {
    if (e && (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146)) {
      return payloadBase(FALLBACK, { source: 'sin_tabla', necesita_migracion: true });
    }
    throw e;
  }
}

async function guardarPaginasNiveles(executeFn, queryFn, body) {
  const data = payloadBase(body);
  await executeFn(
    `INSERT INTO web_paginas_niveles
       (id, monto_inicial, monto_primaria, monto_secundaria, descuento_hermano, texto_linea)
     VALUES (1, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       monto_inicial = VALUES(monto_inicial),
       monto_primaria = VALUES(monto_primaria),
       monto_secundaria = VALUES(monto_secundaria),
       descuento_hermano = VALUES(descuento_hermano),
       texto_linea = VALUES(texto_linea)`,
    [
      data.monto_inicial,
      data.monto_primaria,
      data.monto_secundaria,
      data.descuento_hermano,
      data.texto_linea,
    ]
  );
  return leerPaginasNiveles(queryFn);
}

module.exports = {
  FALLBACK,
  toMonto,
  leerPaginasNiveles,
  guardarPaginasNiveles,
};
