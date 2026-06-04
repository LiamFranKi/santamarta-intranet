/**
 * Datos JSON para generar el PDF de boleta de pago (misma forma que GET apoderado/docente).
 * @param {import('../utils/mysql').query} query
 */

const ERR_NO_IMPRESION = 'NO TIENE IMPRESION DE BOLETA';

/**
 * @param {number} colegio_id
 * @param {number} pagoIdNum
 * @param {{ type: 'apoderado', apoderado_id: number } | { type: 'admin', alumno_id: number, matricula_id: number }} ctx
 * @returns {Promise<{ ok: true, data: object } | { ok: false, status: number, error: string }>}
 */
async function getBoletaPdfJsonForPago(query, colegio_id, pagoIdNum, ctx) {
  let pagoInfo;
  if (ctx.type === 'apoderado') {
    pagoInfo = await query(
      `SELECT p.*, m.alumno_id, g.anio
       FROM pagos p
       INNER JOIN matriculas m ON m.id = p.matricula_id
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE p.id = ? AND p.colegio_id = ? AND p.estado = 'ACTIVO'`,
      [pagoIdNum, colegio_id]
    );
    if (!pagoInfo || pagoInfo.length === 0) {
      return { ok: false, status: 404, error: 'Pago no encontrado' };
    }
    const pago = pagoInfo[0];
    const esHijo = await query(
      `SELECT COUNT(*) as count
       FROM apoderados ap
       INNER JOIN familias f ON f.apoderado_id = ap.id
       INNER JOIN alumnos a ON a.id = f.alumno_id
       WHERE ap.id = ?
         AND a.id = ?
         AND a.colegio_id = ?`,
      [ctx.apoderado_id, pago.alumno_id, colegio_id]
    );
    if (!esHijo || esHijo.length === 0 || esHijo[0].count === 0) {
      return { ok: false, status: 403, error: 'No tienes permisos para ver esta boleta.' };
    }
  } else {
    pagoInfo = await query(
      `SELECT p.*, m.alumno_id, g.anio
       FROM pagos p
       INNER JOIN matriculas m ON m.id = p.matricula_id
       INNER JOIN grupos g ON g.id = m.grupo_id
       WHERE p.id = ? AND p.colegio_id = ? AND p.matricula_id = ? AND m.alumno_id = ?`,
      [pagoIdNum, colegio_id, ctx.matricula_id, ctx.alumno_id]
    );
    if (!pagoInfo || pagoInfo.length === 0) {
      return { ok: false, status: 404, error: 'Pago no encontrado' };
    }
  }

  const pago = pagoInfo[0];

  const impresion = await query(
    `SELECT id, numero, serie, fecha_impresion, impreso
     FROM impresiones
     WHERE pago_id = ? AND tipo = 'PAGO' AND tipo_documento = 'BOLETA'
     ORDER BY id DESC
     LIMIT 1`,
    [pagoIdNum]
  );

  if (!impresion || impresion.length === 0) {
    return { ok: false, status: 400, error: ERR_NO_IMPRESION };
  }

  const alumno = await query(
    `SELECT a.nombres, a.apellido_paterno, a.apellido_materno, a.nro_documento as dni
     FROM alumnos a
     WHERE a.id = ? AND a.colegio_id = ?`,
    [pago.alumno_id, colegio_id]
  );

  if (!alumno || alumno.length === 0) {
    return { ok: false, status: 404, error: 'Alumno no encontrado' };
  }

  const facturacionData = await query(`SELECT ruc, razon_social, direccion FROM colegios WHERE id = ? LIMIT 1`, [
    colegio_id,
  ]);

  const configLogo = await query(`SELECT valor FROM config WHERE clave = 'boleta_logo' LIMIT 1`);

  const facturacion = facturacionData.length > 0 ? facturacionData[0] : {};
  const logoFileName = configLogo.length > 0 ? configLogo[0].valor : null;

  let logoUrl = null;
  if (logoFileName) {
    const phpSystemUrl = process.env.PHP_SYSTEM_URL || 'https://sistema.vanguardschools.edu.pe';
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) {
      logoUrl = `${phpSystemUrl}/Static/Archivos/${logoFileName}`;
    } else {
      logoUrl = `http://localhost:5000/Static/Archivos/${logoFileName}`;
    }
  }

  let descripcionPago = '';
  if (pago.tipo === 0) {
    descripcionPago = `MATRÍCULA ${pago.anio || new Date().getFullYear()}`;
  } else if (pago.tipo === 1) {
    const colegioConfig = await query(
      `SELECT ciclo_pensiones, inicio_pensiones FROM colegios WHERE id = ? LIMIT 1`,
      [colegio_id]
    );
    const cicloPensiones = colegioConfig.length > 0 ? colegioConfig[0].ciclo_pensiones : null;
    const inicioPensiones = colegioConfig.length > 0 ? colegioConfig[0].inicio_pensiones || 1 : 1;

    if (cicloPensiones === 0 || cicloPensiones === '0') {
      const MESES = [
        'Enero',
        'Febrero',
        'Marzo',
        'Abril',
        'Mayo',
        'Junio',
        'Julio',
        'Agosto',
        'Setiembre',
        'Octubre',
        'Noviembre',
        'Diciembre',
      ];
      const indiceMes = pago.nro_pago + inicioPensiones - 1;
      if (indiceMes >= 0 && indiceMes < MESES.length) {
        descripcionPago = `MENSUALIDAD ${MESES[indiceMes].toUpperCase()}`;
      } else {
        descripcionPago = `MENSUALIDAD ${pago.nro_pago}`;
      }
    } else {
      descripcionPago = `MENSUALIDAD ${pago.nro_pago}`;
    }
  } else if (pago.tipo === 3) {
    descripcionPago = `COMEDOR ${pago.nro_pago}`;
  } else {
    descripcionPago = pago.descripcion || 'OTRO';
  }

  const imp = impresion[0];
  const data = {
    pago: {
      id: pago.id,
      tipo: pago.tipo,
      tipo_descripcion: descripcionPago,
      monto: parseFloat(pago.monto) || 0,
      mora: parseFloat(pago.mora) || 0,
      total: parseFloat(pago.monto) + parseFloat(pago.mora || 0),
      fecha_hora: pago.fecha_hora,
      fecha_cancelado: pago.fecha_cancelado,
      estado_pago: pago.estado_pago,
      boleta_numero: imp.numero,
      boleta_serie: imp.serie,
      boleta_fecha_impresion: imp.fecha_impresion,
    },
    alumno: {
      nombres: alumno[0].nombres,
      apellido_paterno: alumno[0].apellido_paterno,
      apellido_materno: alumno[0].apellido_materno,
      nombre_completo: `${alumno[0].apellido_paterno || ''} ${alumno[0].apellido_materno || ''}, ${alumno[0].nombres || ''}`
        .trim()
        .replace(/^,\s*|,\s*$/g, ''),
      dni: alumno[0].dni,
    },
    boleta: {
      numero: imp.numero,
      serie: imp.serie,
      serie_numero: `${String(imp.serie).padStart(3, '0')}-${String(imp.numero).padStart(7, '0')}`,
    },
    facturacion: {
      razon_social: facturacion.razon_social || 'Vanguard Schools',
      ruc: facturacion.ruc || '',
      direccion: facturacion.direccion || '',
      logo_url: logoUrl,
    },
  };

  return { ok: true, data };
}

module.exports = { getBoletaPdfJsonForPago, ERR_NO_IMPRESION };
