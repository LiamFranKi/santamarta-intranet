const TIPOS_VER = ['ADMINISTRADOR', 'COORDINADOR', 'PROMOTORIA', 'DIRECTOR', 'DOCENTE'];
const TIPOS_GESTIONAR = ['ADMINISTRADOR', 'COORDINADOR', 'PROMOTORIA', 'DIRECTOR'];

const TIPOS_EVENTO = [
  { codigo: 'MANTENIMIENTO', etiqueta: 'Mantenimiento', icono: '🧹', color: '#0d9488', hint: 'Fumigación, limpieza, obras' },
  { codigo: 'REUNION', etiqueta: 'Reunión', icono: '🤝', color: '#4f46e5', hint: 'Juntas internas' },
  { codigo: 'PLAZO', etiqueta: 'Plazo', icono: '⏳', color: '#d97706', hint: 'Vence un trámite o entrega' },
  { codigo: 'INSPECCION', etiqueta: 'Inspección', icono: '🔎', color: '#e11d48', hint: 'Visitas, auditorías' },
  { codigo: 'OPERATIVO', etiqueta: 'Operativo', icono: '📋', color: '#0284c7', hint: 'Avisos del día a día' },
  { codigo: 'OTRO', etiqueta: 'Otro', icono: '📌', color: '#64748b', hint: 'Lo que no encaja arriba' },
];

const AVISO_DIAS_PERMITIDOS = [10, 7, 5, 3, 1, 0];
const ROLES_AVISO_PERMITIDOS = TIPOS_VER;

function tipoUpper(tipo) {
  return String(tipo || '').toUpperCase();
}

function puedeVerAgendaInterna(tipo) {
  return TIPOS_VER.includes(tipoUpper(tipo));
}

function puedeGestionarAgendaInterna(tipo) {
  return TIPOS_GESTIONAR.includes(tipoUpper(tipo));
}

function parseListaCsv(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseAvisoDias(raw) {
  const set = new Set(
    parseListaCsv(raw)
      .map((n) => parseInt(n, 10))
      .filter((n) => AVISO_DIAS_PERMITIDOS.includes(n))
  );
  return [...set].sort((a, b) => b - a);
}

function parseAvisosRoles(raw) {
  const set = new Set(
    parseListaCsv(raw)
      .map(tipoUpper)
      .filter((t) => ROLES_AVISO_PERMITIDOS.includes(t))
  );
  return ROLES_AVISO_PERMITIDOS.filter((t) => set.has(t));
}

function serializarAvisoDias(arr) {
  const list = parseAvisoDias(Array.isArray(arr) ? arr.join(',') : arr);
  return (list.length ? list : [7, 3, 1, 0]).join(',');
}

function serializarAvisosRoles(arr) {
  const list = parseAvisosRoles(Array.isArray(arr) ? arr.join(',') : arr);
  return (list.length ? list : ROLES_AVISO_PERMITIDOS).join(',');
}

function tipoEventoMeta(codigo) {
  const c = String(codigo || '').toUpperCase();
  return TIPOS_EVENTO.find((t) => t.codigo === c) || TIPOS_EVENTO[TIPOS_EVENTO.length - 1];
}

function ymdDeValor(raw) {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    // DATE de MySQL suele llegar como medianoche UTC del día calendario.
    return raw.toISOString().slice(0, 10);
  }
  const s = String(raw || '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function diasHasta(fechaFinYmd, hoyYmd) {
  const a = ymdDeValor(fechaFinYmd);
  const b = ymdDeValor(hoyYmd);
  if (!a || !b) return null;
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const fin = Date.UTC(ay, am - 1, ad);
  const hoy = Date.UTC(by, bm - 1, bd);
  return Math.round((fin - hoy) / 86400000);
}

function urgenciaDeDias(dias, estado) {
  if (String(estado || '').toUpperCase() === 'HECHO') return 'hecho';
  if (String(estado || '').toUpperCase() === 'CANCELADO') return 'cancelado';
  if (dias == null) return 'ok';
  if (dias < 0) return 'vencido';
  if (dias === 0) return 'hoy';
  if (dias <= 3) return 'proximo';
  return 'ok';
}

function sanitizarTexto(valor, max) {
  const t = String(valor || '').trim();
  if (!t) return '';
  return t.slice(0, max);
}

function tableMissing(err) {
  const msg = String(err?.message || err?.sqlMessage || '');
  return (
    err?.code === 'ER_NO_SUCH_TABLE' ||
    err?.errno === 1146 ||
    msg.includes('agenda_interna_eventos') ||
    msg.includes("doesn't exist")
  );
}

module.exports = {
  TIPOS_VER,
  TIPOS_GESTIONAR,
  TIPOS_EVENTO,
  AVISO_DIAS_PERMITIDOS,
  ROLES_AVISO_PERMITIDOS,
  puedeVerAgendaInterna,
  puedeGestionarAgendaInterna,
  parseAvisoDias,
  parseAvisosRoles,
  serializarAvisoDias,
  serializarAvisosRoles,
  tipoEventoMeta,
  ymdDeValor,
  diasHasta,
  urgenciaDeDias,
  sanitizarTexto,
  tableMissing,
};
