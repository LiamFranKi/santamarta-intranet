/**
 * Fechas para JSON SUNAT / facturación: valores desde MySQL (string o Date) → YYYY-MM-DD.
 * Vencimiento de mensualidades alineado a `pensiones_vencimiento` + misma lógica que apoderado.routes.
 */
const phpSerialize = require('php-serialize');

/**
 * @param {string|Date|null|undefined} value
 * @returns {string} '' o YYYY-MM-DD
 */
function formatDateYyyyMmDd(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string') {
    const s = value.trim();
    if (s === '0000-00-00' || s.startsWith('0000-00-00')) return '';
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const pe = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (pe) return `${pe[3]}-${pe[2]}-${pe[1]}`;
    return '';
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const mo = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${mo}-${d}`;
  }
  const s = String(value);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

function parsePensionesVencimiento(raw) {
  if (raw == null || raw === '') return {};
  const pensionesVencimientoStr = raw;
  let vencimientosPensiones = {};
  try {
    let contenidoDeserializar = pensionesVencimientoStr;
    try {
      contenidoDeserializar = Buffer.from(String(pensionesVencimientoStr), 'base64').toString('utf-8');
    } catch {
      // no es base64 válido; se usa el string tal cual
    }
    const vencimientosDeserializados = phpSerialize.unserialize(contenidoDeserializar);
    vencimientosPensiones = vencimientosDeserializados || {};
  } catch {
    try {
      let t = String(pensionesVencimientoStr).trim();
      if (!t.startsWith('{')) {
        try {
          const dec = Buffer.from(t, 'base64').toString('utf-8').trim();
          if (dec.startsWith('{')) t = dec;
        } catch {
          /* ignore */
        }
      }
      if (t.startsWith('{')) {
        vencimientosPensiones = JSON.parse(t);
      }
    } catch {
      vencimientosPensiones = {};
    }
  }
  return vencimientosPensiones && typeof vencimientosPensiones === 'object' ? vencimientosPensiones : {};
}

/**
 * @param {number} nroPension
 * @param {number} anio
 * @param {number} inicioPensiones
 * @param {Record<string, unknown>} vencimientosPensiones
 * @returns {string} dd-mm-yyyy
 */
function calcularFechaVencimientoDdMmYyyy(nroPension, anio, inicioPensiones, vencimientosPensiones) {
  const map = vencimientosPensiones || {};
  let vencimiento = map[nroPension];
  if (vencimiento == null || vencimiento === '') {
    vencimiento = map[String(nroPension)];
  }

  if (!vencimiento || vencimiento === '') {
    const mesPension = nroPension + 2;
    const ultimoDia = new Date(anio, mesPension, 0).getDate();
    return `${ultimoDia}-${String(mesPension).padStart(2, '0')}-${anio}`;
  }

  const partes = String(vencimiento).trim().split('-');
  if (partes.length === 1) {
    const mesPension = nroPension + 2;
    return `${partes[0].padStart(2, '0')}-${String(mesPension).padStart(2, '0')}-${anio}`;
  }
  if (partes.length === 2) {
    return `${partes[0].padStart(2, '0')}-${partes[1].padStart(2, '0')}-${anio}`;
  }
  let añoFinal = partes[2];
  if (String(añoFinal).length === 2) {
    añoFinal = String(anio);
  }
  return `${partes[0].padStart(2, '0')}-${partes[1].padStart(2, '0')}-${añoFinal}`;
}

/**
 * dd-mm-yyyy → yyyy-mm-dd
 * @param {string} ddMmYyyy
 */
function ddMmYyyyToYyyyMmDd(ddMmYyyy) {
  const partes = String(ddMmYyyy).trim().split('-');
  if (partes.length !== 3) return '';
  const [dia, mes, anio] = partes;
  let y = String(anio).trim();
  if (y.length === 2) y = `20${y}`;
  if (!/^\d{4}$/.test(y)) return '';
  return `${y}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/**
 * Fecha de vencimiento para boleta (IDE.fechaVencimiento), alineada al legacy PHP cuando aplica.
 * @param {object} imp Fila de getAdminImpresionPayload (pago_tipo, nro_pago, grupo_anio, inicio_pensiones, pensiones_vencimiento, …)
 */
function resolveFechaVencimientoBoletaJson(imp) {
  const tipo = Number(imp.pago_tipo);
  const nroPago = Number(imp.nro_pago);
  const anioGrupo = imp.grupo_anio != null ? parseInt(imp.grupo_anio, 10) : NaN;
  const inicioPensiones = parseInt(imp.inicio_pensiones != null ? imp.inicio_pensiones : 1, 10) || 1;

  if (tipo === 1 && Number.isFinite(nroPago) && nroPago > 0 && Number.isFinite(anioGrupo) && anioGrupo > 0) {
    const map = parsePensionesVencimiento(imp.pensiones_vencimiento);
    const ddMmYyyy = calcularFechaVencimientoDdMmYyyy(nroPago, anioGrupo, inicioPensiones, map);
    const iso = ddMmYyyyToYyyyMmDd(ddMmYyyy);
    if (iso) return iso;
  }

  const fc = formatDateYyyyMmDd(imp.fecha_cancelado);
  if (fc) return fc;
  return formatDateYyyyMmDd(imp.fecha_impresion);
}

module.exports = {
  formatDateYyyyMmDd,
  parsePensionesVencimiento,
  calcularFechaVencimientoDdMmYyyy,
  ddMmYyyyToYyyyMmDd,
  resolveFechaVencimientoBoletaJson,
};
