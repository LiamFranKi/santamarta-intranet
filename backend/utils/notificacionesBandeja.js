/**
 * Bandeja de campanita: evita OR (para=TODOS OR destinatario) que no usa índice
 * y puede escanear toda la tabla notificaciones.
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

async function fetchNotificacionesBandeja(query, destinatarioIds) {
  const ids = [
    ...new Set(
      (Array.isArray(destinatarioIds) ? destinatarioIds : [destinatarioIds])
        .map((id) => parseInt(id, 10))
        .filter((n) => Number.isFinite(n) && n > 0)
    )
  ];

  const todosSql = `(
      SELECT ${SELECT_BANDEJA}
      FROM notificaciones n
      WHERE n.para = 'TODOS'
      ORDER BY n.id DESC
      LIMIT 30
    )`;

  if (!ids.length) {
    return query(`${todosSql} ORDER BY fecha_hora DESC, id DESC LIMIT 30`);
  }

  const ph = ids.map(() => '?').join(',');
  return query(
    `(
      SELECT ${SELECT_BANDEJA}
      FROM notificaciones n
      WHERE n.para = 'USUARIO' AND n.destinatario_id IN (${ph})
      ORDER BY n.id DESC
      LIMIT 30
    )
    UNION ALL
    ${todosSql}
    ORDER BY fecha_hora DESC, id DESC
    LIMIT 30`,
    ids
  );
}

module.exports = { fetchNotificacionesBandeja };
