const { query, execute } = require('./mysql');
const { fechaHoraMySQLLima } = require('./fechaHoraLima');

let limitesListos = null;

function asegurarLimites() {
  if (!limitesListos) {
    limitesListos = (async () => {
      const cols = [
        ['limite_dia_activo', 'ALTER TABLE kiosco_config ADD COLUMN limite_dia_activo TINYINT(1) NOT NULL DEFAULT 0'],
        ['limite_dia_monto', 'ALTER TABLE kiosco_config ADD COLUMN limite_dia_monto DECIMAL(10,2) NOT NULL DEFAULT 0'],
        ['limite_general_activo', 'ALTER TABLE kiosco_config ADD COLUMN limite_general_activo TINYINT(1) NOT NULL DEFAULT 0'],
        ['limite_general_monto', 'ALTER TABLE kiosco_config ADD COLUMN limite_general_monto DECIMAL(10,2) NOT NULL DEFAULT 0'],
        ['limite_general_desde', 'ALTER TABLE kiosco_config ADD COLUMN limite_general_desde DATETIME NULL'],
      ];
      for (const [col, ddl] of cols) {
        const rows = await query(
          `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kiosco_config' AND COLUMN_NAME = ?`,
          [col]
        );
        if (!Number(rows?.[0]?.n)) await execute(ddl);
      }
      await execute(
        `CREATE TABLE IF NOT EXISTS kiosco_limite_hijo (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          colegio_id INT NOT NULL,
          alumno_id INT NOT NULL,
          dia_activo TINYINT(1) NOT NULL DEFAULT 0,
          dia_monto DECIMAL(10,2) NOT NULL DEFAULT 0,
          general_activo TINYINT(1) NOT NULL DEFAULT 0,
          general_monto DECIMAL(10,2) NOT NULL DEFAULT 0,
          general_desde DATETIME NULL,
          actualizado_en DATETIME NULL,
          UNIQUE KEY uq_kiosco_limite_hijo (colegio_id, alumno_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      );
    })().catch((e) => {
      limitesListos = null;
      throw e;
    });
  }
  return limitesListos;
}

function soles(valor) {
  return Math.round((Number(valor) || 0) * 100) / 100;
}

function pasa(ya, suma, tope) {
  return Math.round((Number(ya) + Number(suma)) * 100) > Math.round(Number(tope) * 100);
}

function fechaSql(valor) {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) return valor.toISOString().slice(0, 10);
  const m = String(valor || '').match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

function horaSql(valor) {
  if (!valor) return null;
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    const y = valor.getFullYear();
    const m = String(valor.getMonth() + 1).padStart(2, '0');
    const d = String(valor.getDate()).padStart(2, '0');
    const hh = String(valor.getHours()).padStart(2, '0');
    const mm = String(valor.getMinutes()).padStart(2, '0');
    const ss = String(valor.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
  }
  const s = String(valor).replace('T', ' ').slice(0, 19);
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s) ? s : null;
}

async function sumaFiado(colegioId, { alumnoId, clienteUsuarioId, fecha, desde }) {
  const params = [colegioId];
  let quien = '';
  if (alumnoId) {
    quien = 'AND alumno_id = ?';
    params.push(alumnoId);
  } else if (clienteUsuarioId) {
    quien = 'AND cliente_usuario_id = ? AND (alumno_id IS NULL OR alumno_id = 0)';
    params.push(clienteUsuarioId);
  } else {
    return 0;
  }
  let extra = '';
  if (fecha) {
    extra += ' AND fecha_consumo = ?';
    params.push(fecha);
  }
  if (desde) {
    extra += ' AND creado_en >= ?';
    params.push(desde);
  }
  const [row] = await query(
    `SELECT COALESCE(SUM(total), 0) AS deuda
     FROM kiosco_pedidos
     WHERE colegio_id = ? ${quien}
       AND pago = 'fiado' AND estado IN ('aceptado','entregado') ${extra}`,
    params
  );
  return soles(row?.deuda);
}

async function limiteHijo(colegioId, alumnoId) {
  if (!alumnoId) return null;
  const [row] = await query(
    `SELECT dia_activo, dia_monto, general_activo, general_monto,
            DATE_FORMAT(general_desde, '%Y-%m-%d %H:%i:%s') AS general_desde
     FROM kiosco_limite_hijo WHERE colegio_id = ? AND alumno_id = ? LIMIT 1`,
    [colegioId, alumnoId]
  );
  if (!row) {
    return { dia_activo: false, dia_monto: 0, general_activo: false, general_monto: 0, general_desde: null };
  }
  return {
    dia_activo: Number(row.dia_activo) === 1,
    dia_monto: soles(row.dia_monto),
    general_activo: Number(row.general_activo) === 1,
    general_monto: soles(row.general_monto),
    general_desde: horaSql(row.general_desde),
  };
}

function txt(n) {
  return `S/ ${soles(n).toFixed(2)}`;
}

async function revisarCupoFiado({ colegioId, config, alumnoId, clienteUsuarioId, fecha, monto }) {
  const suma = soles(monto);
  if (!(suma > 0)) return '';
  const quien = { alumnoId: alumnoId || null, clienteUsuarioId: alumnoId ? null : (clienteUsuarioId || null) };

  if (config?.limite_activo && pasa(0, suma, config.limite_monto)) {
    return `No se puede fiar. Este pedido es de ${txt(suma)} y el colegio permite fiar hasta ${txt(config.limite_monto)} por pedido. Si se paga ahora, sí entra.`;
  }

  const papa = await limiteHijo(colegioId, alumnoId);
  const debeDia = await sumaFiado(colegioId, { ...quien, fecha });

  if (papa?.dia_activo && pasa(debeDia, suma, papa.dia_monto)) {
    return `No se puede fiar. El papá dejó un tope de ${txt(papa.dia_monto)} por día y este día ya debe ${txt(debeDia)}. Este pedido es de ${txt(suma)}. Cuando se pague el fiado, el cupo se libera.`;
  }
  if (config?.limite_dia_activo && pasa(debeDia, suma, config.limite_dia_monto)) {
    return `No se puede fiar. El colegio permite deber hasta ${txt(config.limite_dia_monto)} por día y este día ya debe ${txt(debeDia)}. Este pedido es de ${txt(suma)}. Cuando se pague el fiado, el cupo se libera.`;
  }

  if (papa?.general_activo) {
    const debe = await sumaFiado(colegioId, { ...quien, desde: papa.general_desde });
    if (pasa(debe, suma, papa.general_monto)) {
      return `No se puede fiar. El papá dejó un tope general de ${txt(papa.general_monto)} y ya debe ${txt(debe)}. Este pedido es de ${txt(suma)}. Cuando se pague el fiado, el cupo se libera.`;
    }
  }
  if (config?.limite_general_activo) {
    const debe = await sumaFiado(colegioId, { ...quien, desde: horaSql(config.limite_general_desde) });
    if (pasa(debe, suma, config.limite_general_monto)) {
      return `No se puede fiar. El colegio permite deber hasta ${txt(config.limite_general_monto)} en total y ya debe ${txt(debe)}. Este pedido es de ${txt(suma)}. Cuando se pague el fiado, el cupo se libera.`;
    }
  }
  return '';
}

async function resumenCupo(colegioId, config, { alumnoId, clienteUsuarioId, fecha }) {
  const quien = { alumnoId: alumnoId || null, clienteUsuarioId: alumnoId ? null : (clienteUsuarioId || null) };
  const papa = alumnoId ? await limiteHijo(colegioId, alumnoId) : null;
  const debeDia = await sumaFiado(colegioId, { ...quien, fecha });
  const debeGeneralColegio = config?.limite_general_activo
    ? await sumaFiado(colegioId, { ...quien, desde: horaSql(config.limite_general_desde) })
    : 0;
  const debeGeneralPapa = papa?.general_activo
    ? await sumaFiado(colegioId, { ...quien, desde: papa.general_desde })
    : 0;
  return {
    fecha,
    debe_dia: debeDia,
    debe_general_colegio: debeGeneralColegio,
    debe_general_papa: debeGeneralPapa,
    colegio: {
      pedido_activo: !!config?.limite_activo,
      pedido_monto: soles(config?.limite_monto),
      dia_activo: !!config?.limite_dia_activo,
      dia_monto: soles(config?.limite_dia_monto),
      general_activo: !!config?.limite_general_activo,
      general_monto: soles(config?.limite_general_monto),
    },
    papa: papa
      ? {
        dia_activo: papa.dia_activo,
        dia_monto: papa.dia_monto,
        general_activo: papa.general_activo,
        general_monto: papa.general_monto,
      }
      : null,
  };
}

async function guardarLimiteHijo(colegioId, alumnoId, body) {
  const previa = await limiteHijo(colegioId, alumnoId);
  const diaActivo = !!body?.dia_activo;
  const generalActivo = !!body?.general_activo;
  let desde = previa?.general_desde || null;
  if (generalActivo && !previa?.general_activo) desde = fechaHoraMySQLLima();
  if (!generalActivo) desde = null;
  const ahora = fechaHoraMySQLLima();
  await execute(
    `INSERT INTO kiosco_limite_hijo
      (colegio_id, alumno_id, dia_activo, dia_monto, general_activo, general_monto, general_desde, actualizado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      dia_activo = VALUES(dia_activo), dia_monto = VALUES(dia_monto),
      general_activo = VALUES(general_activo), general_monto = VALUES(general_monto),
      general_desde = VALUES(general_desde), actualizado_en = VALUES(actualizado_en)`,
    [
      colegioId,
      alumnoId,
      diaActivo ? 1 : 0,
      soles(body?.dia_monto),
      generalActivo ? 1 : 0,
      soles(body?.general_monto),
      desde,
      ahora,
    ]
  );
}

module.exports = {
  asegurarLimites,
  fechaSql,
  revisarCupoFiado,
  resumenCupo,
  guardarLimiteHijo,
  horaSql,
};
