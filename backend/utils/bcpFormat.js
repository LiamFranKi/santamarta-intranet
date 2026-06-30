/**
 * Formato plano BCP (CREP export / CDPG import) — posiciones fijas del legacy PHP.
 */

const MESES_BCP = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

function sanearStringNombre(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function padLeft(str, len, ch = ' ') {
  const s = String(str ?? '');
  if (s.length >= len) return s.slice(0, len);
  return ch.repeat(len - s.length) + s;
}

function padRight(str, len, ch = ' ') {
  const s = String(str ?? '');
  if (s.length >= len) return s.slice(0, len);
  return s + ch.repeat(len - s.length);
}

/** Parte decimal como 2 dígitos (legacy number_format + regex). */
function decimalPart(monto) {
  const n = Number(monto);
  if (!Number.isFinite(n)) return '00';
  const frac = Math.round((n - Math.trunc(n)) * 100);
  return String(frac).padStart(2, '0');
}

function parseFechaArchivoYmd(raw8) {
  const s = String(raw8 || '').trim();
  if (!/^\d{8}$/.test(s)) return null;
  const y = s.slice(0, 4);
  const m = s.slice(4, 6);
  const d = s.slice(6, 8);
  const iso = `${y}-${m}-${d}`;
  const dt = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return null;
  return iso;
}

function toYmdFromDateInput(fecha) {
  const s = String(fecha || '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}${m[2]}${m[3]}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${mo}${day}`;
}

function toYmdFromVencimiento(fechaVencimiento) {
  const s = String(fechaVencimiento || '').trim();
  const parts = s.split('-');
  if (parts.length === 3) {
    const [dd, mm, yyyy] = parts;
    if (dd.length <= 2 && mm.length <= 2 && yyyy.length === 4) {
      return `${yyyy}${mm.padStart(2, '0')}${dd.padStart(2, '0')}`;
    }
    if (yyyy.length === 4 && mm.length <= 2 && dd.length <= 2) {
      return `${yyyy}${mm.padStart(2, '0')}${dd.padStart(2, '0')}`;
    }
  }
  return toYmdFromDateInput(s);
}

/**
 * Parseo posicional CDPG (legacy getImportDetails).
 * @returns {{ ok: true, data: object } | { ok: false, error: string }}
 */
function parseCdpgLine(line, lineNum) {
  const raw = String(line ?? '').replace(/\r?\n$/, '');
  if (!raw.trim()) {
    return { ok: false, error: `Línea ${lineNum}: vacía` };
  }
  if (raw.length < 130) {
    return { ok: false, error: `Línea ${lineNum}: longitud insuficiente (${raw.length} caracteres, mínimo 130)` };
  }

  const dni = raw.substr(27, 8).trim();
  const matricula_id = parseInt(raw.substr(35, 6), 10);
  const nro_pago = parseInt(raw.substr(41, 3), 10);
  const fechaRaw = raw.substr(57, 8);
  const fecha = parseFechaArchivoYmd(fechaRaw);
  const nro_movimiento = raw.substr(124, 6).trim();

  const importe_origen = parseFloat(`${raw.substr(73, 13)}.${raw.substr(86, 2)}`);
  const importe_total = parseFloat(`${raw.substr(103, 13)}.${raw.substr(116, 2)}`);

  if (!Number.isFinite(matricula_id) || matricula_id <= 0) {
    return { ok: false, error: `Línea ${lineNum}: matrícula inválida (${raw.substr(35, 6)})` };
  }
  if (!Number.isFinite(nro_pago) && raw.substr(41, 3).trim() === '') {
    return { ok: false, error: `Línea ${lineNum}: nro_pago inválido` };
  }
  if (!fecha) {
    return { ok: false, error: `Línea ${lineNum}: fecha inválida (${fechaRaw})` };
  }
  if (!Number.isFinite(importe_origen) || !Number.isFinite(importe_total)) {
    return { ok: false, error: `Línea ${lineNum}: importe inválido` };
  }

  return {
    ok: true,
    data: {
      dni,
      matricula_id,
      nro_pago: Number.isFinite(nro_pago) ? nro_pago : 0,
      fecha,
      nro_movimiento,
      importe_origen,
      importe_total,
      importe_mora: importe_total - importe_origen,
    },
  };
}

function buildIdentifier(matricula, nroPagoExport, dni) {
  const dni8 = padRight(String(dni || '').slice(0, 8), 8, ' ');
  const id = dni8 + padLeft(String(matricula.id), 6, '0') + padLeft(String(nroPagoExport), 3, '0');
  return padRight(id, 30, ' ').slice(0, 30);
}

function buildCrepDetailLine(recaudo, matricula, payload, fechaArchivoYmd, tipoActualizacion) {
  const dni = String(matricula.nro_documento || '').slice(0, 8);
  const nombreRaw = sanearStringNombre(
    [matricula.apellido_paterno, matricula.apellido_materno, matricula.nombres].filter(Boolean).join(' ')
  ).toUpperCase();

  let line = 'DD';
  line += recaudo.nro_sucursal;
  line += '0';
  line += recaudo.nro_cuenta;
  line += padLeft(dni, 14, '0');
  line += padRight(nombreRaw.slice(0, 40), 40, ' ');
  line += buildIdentifier(matricula, payload.nro_pago, dni);
  line += fechaArchivoYmd;
  line += toYmdFromVencimiento(payload.fecha_vencimiento) || fechaArchivoYmd;

  const monto = Number(payload.monto) || 0;
  line += padLeft(String(Math.trunc(monto)), 13, '0');
  line += decimalPart(monto);
  line += padLeft('0', 13, '0');
  line += '00';
  line += padLeft(String(Math.trunc(monto)), 7, '0');
  line += decimalPart(monto);
  line += String(tipoActualizacion || 'A').slice(0, 1);
  const desc = String(payload.descripcion || '').replace(/\s+/g, '').slice(0, 20);
  line += padLeft(desc, 20, ' ');
  line += padLeft(String(matricula.nro_documento || '').slice(0, 16), 16, '0');
  line += ' '.repeat(61);

  return { line, monto };
}

function buildCrepHeader(recaudo, fechaArchivoYmd, detailLines, tipoDocumento) {
  let montoTotal = 0;
  detailLines.forEach((d) => {
    montoTotal += d.monto;
  });

  let line = 'CC';
  line += recaudo.nro_sucursal;
  line += '0';
  line += recaudo.nro_cuenta;
  line += 'C';
  line += padRight(String(recaudo.razon_social || '').slice(0, 40), 40, ' ');
  line += fechaArchivoYmd;
  line += padLeft(String(detailLines.length), 9, '0');
  line += padLeft(String(Math.trunc(montoTotal)), 13, '0');
  const frac = montoTotal - Math.trunc(montoTotal);
  line += decimalPart(frac > 0 ? frac : 0);
  line += String(tipoDocumento || 'A').slice(0, 1);
  line += ' '.repeat(6 + 157);
  return line;
}

function nombreMesPension(nroPago, inicioPensiones) {
  const idx = nroPago + inicioPensiones - 1;
  if (idx >= 0 && idx < MESES_BCP.length) return MESES_BCP[idx];
  return `Mes ${nroPago}`;
}

module.exports = {
  MESES_BCP,
  sanearStringNombre,
  parseCdpgLine,
  buildCrepDetailLine,
  buildCrepHeader,
  toYmdFromDateInput,
  nombreMesPension,
};
