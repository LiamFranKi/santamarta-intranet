/**
 * Bandeja de campanita: dos SELECT cortos (índice por destinatario / para)
 * en lugar de UNION o OR, que escanean notificaciones y saturan el pool.
 */
const SELECT_BANDEJA = `n.id,
         n.asunto as titulo,
         n.contenido as mensaje,
         n.fecha_hora,
         n.estado,
         COALESCE(n.leida, 0) as leida,
         n.accion_tipo,
         n.accion_payload,
         n.url_destino,
         n.destinatario_id,
         'NOTIFICACION' as tipo_origen`;

function ordenarBandeja(rows) {
  const seen = new Set();
  const merged = [];
  for (const row of rows || []) {
    const id = Number(row.id);
    if (!Number.isFinite(id) || seen.has(id)) continue;
    seen.add(id);
    merged.push(row);
  }
  merged.sort((a, b) => {
    const ta = new Date(a.fecha_hora).getTime() || 0;
    const tb = new Date(b.fecha_hora).getTime() || 0;
    if (tb !== ta) return tb - ta;
    return (Number(b.id) || 0) - (Number(a.id) || 0);
  });
  return merged.slice(0, 30);
}

async function fetchNotificacionesBandeja(query, destinatarioIds) {
  const ids = [
    ...new Set(
      (Array.isArray(destinatarioIds) ? destinatarioIds : [destinatarioIds])
        .map((id) => parseInt(id, 10))
        .filter((n) => Number.isFinite(n) && n > 0)
    )
  ];

  const todosSql = `SELECT ${SELECT_BANDEJA}
      FROM notificaciones n
      WHERE n.para = 'TODOS'
      ORDER BY n.id DESC
      LIMIT 30`;

  if (!ids.length) {
    return ordenarBandeja(await query(todosSql));
  }

  const ph = ids.map(() => '?').join(',');
  const [propias, todos] = await Promise.all([
    query(
      `SELECT ${SELECT_BANDEJA}
       FROM notificaciones n
       WHERE n.para = 'USUARIO' AND n.destinatario_id IN (${ph})
       ORDER BY n.id DESC
       LIMIT 30`,
      ids
    ),
    query(todosSql)
  ]);
  return ordenarBandeja([...(propias || []), ...(todos || [])]);
}

module.exports = { fetchNotificacionesBandeja };
