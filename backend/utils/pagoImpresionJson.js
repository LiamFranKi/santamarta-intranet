/**
 * JSON SUNAT legacy para boletas y notas de débito (compartido boletear + admin impresiones).
 */
const { query } = require('./mysql');
const { formatDateYyyyMmDd, resolveFechaVencimientoBoletaJson } = require('./fechaFacturacionJson');

function isSqlUnknownColumnError(e) {
  const code = e && e.code;
  const errno = e && e.errno;
  const msg = String((e && e.message) || '');
  return code === 'ER_BAD_FIELD_ERROR' || errno === 1054 || msg.includes('Unknown column');
}

function isSqlSchemaMismatchError(e) {
  if (isSqlUnknownColumnError(e)) return true;
  const code = e && e.code;
  const errno = e && e.errno;
  const msg = String((e && e.message) || '');
  return (
    code === 'ER_NO_SUCH_TABLE' ||
    errno === 1146 ||
    msg.includes("doesn't exist") ||
    msg.includes('Unknown table')
  );
}

function toFixed2(v) {
  return Number(parseFloat(v || 0)).toFixed(2);
}

function legacyTipoDocumentoFacturacion(alumnoTipoDocumento, nroDocumento) {
  const idx = Number(alumnoTipoDocumento);
  if (idx === 0) return '1';
  if (idx === 1) return '7';
  if (idx === 5) return '4';
  const dniLike = String(nroDocumento || '').trim().length === 8;
  return dniLike ? '1' : '0';
}

function legacySerieConPrefijo(impSerie, prefijoBoleta) {
  const pref = String(prefijoBoleta || '').trim();
  const serie3 = String(impSerie || '0').padStart(3, '0');
  if (!pref) return serie3;
  if (pref === 'B') return `${pref}${serie3}`;
  const serie2 = String(impSerie || '0').padStart(2, '0');
  return `${pref}${serie2}`;
}

function legacyNumeroImpresion(impNumero) {
  return String(impNumero || '0').padStart(8, '0');
}

function legacyPagoDescripcion(imp) {
  const tipo = Number(imp.pago_tipo);
  const nivel = String(imp.nivel_nombre || '').toUpperCase();
  const grado = imp.grado != null ? `${imp.grado}°` : '';
  const seccion = String(imp.seccion || '').trim();
  const grupoShort = [nivel, grado, seccion].filter(Boolean).join(' ').trim();
  if (tipo === 0) return `MATRÍCULA${grupoShort ? ` - ${grupoShort}` : ''}`;
  if (tipo === 1) return `MENSUALIDAD ${Number(imp.nro_pago || 0)}${grupoShort ? ` - ${grupoShort}` : ''}`;
  return String(imp.descripcion || 'OTRO');
}

async function getAdminImpresionPayload({ colegio_id, pagoId, impresionId }) {
  const params = [impresionId, pagoId, colegio_id];
  const baseFrom = `
     FROM impresiones i
     INNER JOIN pagos p ON p.id = i.pago_id
     INNER JOIN matriculas m ON m.id = p.matricula_id
     INNER JOIN alumnos a ON a.id = m.alumno_id
     LEFT JOIN grupos g ON g.id = m.grupo_id
     LEFT JOIN niveles n ON n.id = g.nivel_id`;
  const colegioSelects = [
    `c.ruc, c.razon_social, c.nombre_empresa, c.pensiones_vencimiento`,
    `c.ruc, c.razon_social, c.nombre AS nombre_empresa, c.pensiones_vencimiento`,
    `c.ruc, c.razon_social, CAST(NULL AS CHAR) AS nombre_empresa, c.pensiones_vencimiento`,
    `c.ruc, c.razon_social, c.nombre AS nombre_empresa, CAST(NULL AS CHAR) AS pensiones_vencimiento`,
  ];
  const variants = [
    { joinSede: true, alumnoTipo: true, inicioPensiones: true },
    { joinSede: false, alumnoTipo: true, inicioPensiones: true },
    { joinSede: false, alumnoTipo: false, inicioPensiones: true },
    { joinSede: false, alumnoTipo: false, inicioPensiones: false },
  ];
  let lastSchemaErr = null;
  for (const colegioSel of colegioSelects) {
    for (const v of variants) {
      const alumnoDoc = v.alumnoTipo
        ? `a.tipo_documento AS alumno_tipo_documento`
        : `CAST(0 AS SIGNED) AS alumno_tipo_documento`;
      const inicioPen = v.inicioPensiones ? `c.inicio_pensiones,` : `NULL AS inicio_pensiones,`;
      const sedeSelect = v.joinSede
        ? `s.prefijo_boleta, s.direccion AS sede_direccion, s.codigo_sunat,`
        : `NULL AS prefijo_boleta, NULL AS sede_direccion, NULL AS codigo_sunat,`;
      const sedeJoin = v.joinSede ? `LEFT JOIN sedes s ON s.id = g.sede_id` : '';
      const sql = `SELECT i.id, i.pago_id, i.tipo, i.tipo_documento, i.serie, i.numero, i.estado, i.fecha_impresion, i.hora_impresion,
            i.fecha_anulado, i.numero_anulado,
            p.monto, p.mora, p.fecha_cancelado, p.estado_pago, p.nro_pago, p.tipo AS pago_tipo, p.descripcion,
            a.id AS alumno_id, a.nombres, a.apellido_paterno, a.apellido_materno, a.nro_documento, ${alumnoDoc},
            ${colegioSel},
            ${inicioPen}
            ${sedeSelect}
            g.anio AS grupo_anio,
            g.grado, g.seccion, n.nombre AS nivel_nombre
     ${baseFrom}
     ${sedeJoin}
     LEFT JOIN colegios c ON c.id = p.colegio_id
     WHERE i.id = ? AND i.pago_id = ? AND p.colegio_id = ?
     LIMIT 1`;
      try {
        const rows = await query(sql, params);
        return rows?.[0] || null;
      } catch (e) {
        if (!isSqlSchemaMismatchError(e)) throw e;
        lastSchemaErr = e;
      }
    }
  }
  if (lastSchemaErr) throw lastSchemaErr;
  return null;
}

async function getActivePagoBoletaImpresion(pagoId) {
  const rows = await query(
    `SELECT id, serie, numero, fecha_impresion
     FROM impresiones
     WHERE pago_id = ? AND estado = 'ACTIVO' AND tipo = 'PAGO' AND tipo_documento = 'BOLETA'
     ORDER BY id DESC
     LIMIT 1`,
    [pagoId]
  );
  return rows?.[0] || null;
}

function buildLegacyJsonBoletaFromImpresion(imp) {
  const serie = legacySerieConPrefijo(imp.serie, imp.prefijo_boleta);
  const numero = legacyNumeroImpresion(imp.numero);
  const numeroDocAdq = String(imp.nro_documento || '').trim();
  const razonAlumno = `${imp.apellido_paterno || ''} ${imp.apellido_materno || ''} ${imp.nombres || ''}`
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
  const fechaEmision = formatDateYyyyMmDd(imp.fecha_impresion);
  const fechaVenc = resolveFechaVencimientoBoletaJson(imp) || fechaEmision;
  const monto = toFixed2(imp.monto);
  const descripcion = legacyPagoDescripcion(imp);
  const json = {
    boleta: {
      IDE: {
        numeracion: `${serie}-${numero}`,
        fechaEmision,
        codTipoDocumento: '03',
        tipoMoneda: 'PEN',
        fechaVencimiento: fechaVenc,
      },
      EMI: {
        tipoDocId: '6',
        numeroDocId: String(imp.ruc || ''),
        razonSocial: String(imp.razon_social || imp.nombre_empresa || ''),
        direccion: String(imp.sede_direccion || ''),
        codigoAsigSUNAT: String(imp.codigo_sunat || ''),
      },
      REC: {
        tipoDocId: legacyTipoDocumentoFacturacion(imp.alumno_tipo_documento, numeroDocAdq),
        numeroDocId: numeroDocAdq,
        razonSocial: razonAlumno,
      },
      CAB: {
        inafectas: { codigo: '1002', totalVentas: monto },
        totalImpuestos: [{ idImpuesto: '9998', montoImpuesto: '0.00' }],
        importeTotal: monto,
        tipoOperacion: '0101',
        leyenda: [{ codigo: '1000', descripcion: `SON ${monto} SOLES` }],
        montoTotalImpuestos: '0.00',
      },
      DET: [
        {
          numeroItem: '001',
          descripcionProducto: descripcion,
          cantidadItems: '1.00',
          unidad: 'NIU',
          valorUnitario: monto,
          precioVentaUnitario: monto,
          totalImpuestos: [
            {
              idImpuesto: '9998',
              montoImpuesto: '0.00',
              tipoAfectacion: '30',
              montoBase: monto,
              porcentaje: '0.00',
            },
          ],
          valorVenta: monto,
          montoTotalImpuestos: '0.00',
        },
      ],
    },
  };
  return {
    nombre: `${imp.ruc}-03-${serie}-${numero}.json`,
    contenido: json,
  };
}

function buildLegacyJsonNotaDebitoFromImpresion(imp, boletaActiva) {
  const numeroDocAdq = String(imp.nro_documento || '').trim();
  const razonAlumno = `${imp.apellido_paterno || ''} ${imp.apellido_materno || ''} ${imp.nombres || ''}`
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
  const mora = toFixed2(imp.mora);
  const serieBoleta = legacySerieConPrefijo(boletaActiva?.serie || 0, imp.prefijo_boleta);
  const nroBoleta = legacyNumeroImpresion(boletaActiva?.numero || 0);
  const serieNd = `BND${parseInt(String(imp.serie || '0'), 10)}`;
  const nroNd = legacyNumeroImpresion(imp.numero);
  const fechaEmision = formatDateYyyyMmDd(imp.fecha_cancelado);
  const json = {
    notaDebito: {
      IDE: {
        numeracion: `${serieNd}-${nroNd}`,
        fechaEmision,
        tipoMoneda: 'PEN',
      },
      EMI: {
        tipoDocId: '6',
        numeroDocId: String(imp.ruc || ''),
        razonSocial: String(imp.razon_social || imp.nombre_empresa || ''),
        direccion: String(imp.sede_direccion || ''),
        codigoAsigSUNAT: String(imp.codigo_sunat || ''),
      },
      REC: {
        tipoDocId: legacyTipoDocumentoFacturacion(imp.alumno_tipo_documento, numeroDocAdq),
        numeroDocId: numeroDocAdq,
        razonSocial: razonAlumno,
      },
      DRF: [
        {
          tipoDocRelacionado: '03',
          numeroDocRelacionado: `${serieBoleta}-${nroBoleta}`,
          codigoMotivo: '03',
          descripcionMotivo: 'PENALIDAD POR ATRASO DE PAGO',
        },
      ],
      CAB: {
        inafectas: { codigo: '1002', totalVentas: mora },
        totalImpuestos: [{ idImpuesto: '9998', montoImpuesto: '0.00' }],
        importeTotal: mora,
        tipoOperacion: '0101',
        leyenda: [{ codigo: '1000', descripcion: `SON ${mora} SOLES` }],
        montoTotalImpuestos: '0.00',
      },
      DET: [
        {
          numeroItem: '001',
          descripcionProducto: `PENALIDAD - ${legacyPagoDescripcion(imp)}`,
          cantidadItems: '1.00',
          unidad: 'NIU',
          valorUnitario: mora,
          precioVentaUnitario: mora,
          totalImpuestos: [
            {
              idImpuesto: '9998',
              montoImpuesto: '0.00',
              tipoAfectacion: '30',
              montoBase: mora,
              porcentaje: '0.00',
            },
          ],
          valorVenta: mora,
          montoTotalImpuestos: '0.00',
        },
      ],
    },
  };
  return {
    nombre: `${imp.ruc}-08-${serieNd}-${nroNd}.json`,
    contenido: json,
  };
}

/** Boleta de mora (tipo_documento BOLETA en impresión MORA) — legacy getBoletaMoraFromImpresionId */
function buildLegacyJsonBoletaMoraFromImpresion(imp, boletaActiva) {
  const numeroDocAdq = String(imp.nro_documento || '').trim();
  const razonAlumno = `${imp.apellido_paterno || ''} ${imp.apellido_materno || ''} ${imp.nombres || ''}`
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
  const mora = toFixed2(imp.mora);
  const serieBoleta = legacySerieConPrefijo(boletaActiva?.serie || 0, imp.prefijo_boleta);
  const nroBoleta = legacyNumeroImpresion(boletaActiva?.numero || 0);
  const serieMora = legacySerieConPrefijo(imp.serie, imp.prefijo_boleta);
  const numeroMora = legacyNumeroImpresion(imp.numero);
  const fechaEmision = formatDateYyyyMmDd(imp.fecha_cancelado);
  const fechaVenc = formatDateYyyyMmDd(imp.fecha_impresion);
  const json = {
    boleta: {
      IDE: {
        numeracion: `${serieMora}-${numeroMora}`,
        fechaEmision,
        codTipoDocumento: '03',
        tipoMoneda: 'PEN',
        fechaVencimiento: fechaVenc,
      },
      EMI: {
        tipoDocId: '6',
        numeroDocId: String(imp.ruc || ''),
        razonSocial: String(imp.razon_social || imp.nombre_empresa || ''),
        direccion: String(imp.sede_direccion || ''),
        codigoAsigSUNAT: String(imp.codigo_sunat || ''),
      },
      REC: {
        tipoDocId: legacyTipoDocumentoFacturacion(imp.alumno_tipo_documento, numeroDocAdq),
        numeroDocId: numeroDocAdq,
        razonSocial: razonAlumno,
      },
      CAB: {
        inafectas: { codigo: '1002', totalVentas: mora },
        totalImpuestos: [{ idImpuesto: '9998', montoImpuesto: '0.00' }],
        importeTotal: mora,
        tipoOperacion: '0101',
        leyenda: [{ codigo: '1000', descripcion: `SON ${mora} SOLES` }],
        montoTotalImpuestos: '0.00',
      },
      DET: [
        {
          numeroItem: '001',
          descripcionProducto: `PENALIDAD POR ATRASO DE PAGO - ${serieBoleta}-${nroBoleta}`,
          cantidadItems: '1.00',
          unidad: 'NIU',
          valorUnitario: mora,
          precioVentaUnitario: mora,
          totalImpuestos: [
            {
              idImpuesto: '9998',
              montoImpuesto: '0.00',
              tipoAfectacion: '30',
              montoBase: mora,
              porcentaje: '0.00',
            },
          ],
          valorVenta: mora,
          montoTotalImpuestos: '0.00',
        },
      ],
    },
  };
  return {
    nombre: `${imp.ruc}-03-${serieMora}-${numeroMora}.json`,
    contenido: json,
  };
}

module.exports = {
  getAdminImpresionPayload,
  getActivePagoBoletaImpresion,
  buildLegacyJsonBoletaFromImpresion,
  buildLegacyJsonNotaDebitoFromImpresion,
  buildLegacyJsonBoletaMoraFromImpresion,
};
