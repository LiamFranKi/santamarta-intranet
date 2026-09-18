/**
 * Audiencias de exámenes de herramientas.
 * TODOS = comunidad completa (alumnos, familias y personal).
 * TODO_PERSONAL = trabajadores (sin alumnos ni apoderados).
 */

const TIPOS_PERSONAL = [
  'ADMINISTRADOR',
  'DIRECTOR',
  'DOCENTE',
  'AUXILIAR',
  'SECRETARIA',
  'CAJERO',
  'ENFERMERA',
  'PROMOTORIA',
  'COORDINADOR',
  'PSICOLOGA',
  'ASISTENCIA',
  'CONTADOR',
  'TUTOR',
  'MANTENIMIENTO'
];

const TIPOS_PERSONAL_SET = new Set(TIPOS_PERSONAL);

const AUDIENCIAS_ESPECIALES = new Set(['TODOS', 'TODO_PERSONAL', 'ALUMNO', 'APODERADO']);

function esTipoPersonal(tipo) {
  return TIPOS_PERSONAL_SET.has(String(tipo || '').toUpperCase());
}

function normalizarAudiencias(list) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    const t = String(raw || '').toUpperCase().trim();
    if (!t || seen.has(t)) continue;
    if (!AUDIENCIAS_ESPECIALES.has(t) && !TIPOS_PERSONAL_SET.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function audienciaTiposDeFila(audiencias) {
  const list = Array.isArray(audiencias) ? audiencias : [];
  return list.map((a) => String(typeof a === 'object' ? a.tipo : a || '').toUpperCase()).filter(Boolean);
}

function usuarioCoincideAudienciaHex(user, audiencias) {
  if (!audiencias || audiencias.length === 0) return false;
  const types = new Set(audienciaTiposDeFila(audiencias));
  const tipo = String(user?.tipo || '').toUpperCase();
  if (types.has('TODOS')) return true;
  if (types.has('TODO_PERSONAL') && esTipoPersonal(tipo)) return true;
  if (types.has(tipo)) return true;
  return false;
}

/** Personal que no es docente: el alcance por aula no los excluye. */
function personalOmiteFiltroAulas(tipo, audiencias) {
  const t = String(tipo || '').toUpperCase();
  if (!esTipoPersonal(t)) return false;
  if (t === 'ADMINISTRADOR' || t === 'PROMOTORIA') return true;
  if (t !== 'DOCENTE') return true;
  const types = new Set(audienciaTiposDeFila(audiencias));
  return types.has('TODO_PERSONAL') || types.has('TODOS');
}

function tiposPersonalParaNotificar(typeSet) {
  if (typeSet.has('TODOS') || typeSet.has('TODO_PERSONAL')) {
    return [...TIPOS_PERSONAL];
  }
  return TIPOS_PERSONAL.filter((t) => typeSet.has(t));
}

/** Slugs de envío (conexiones / notificaciones). `docentes` se mantiene en plural por compatibilidad. */
function perfilesEnviarAPermitidos() {
  return [
    'apoderados',
    'alumnos',
    'docentes',
    'todos',
    'todo_personal',
    'apoderados_alumnos',
    ...TIPOS_PERSONAL.map((t) => t.toLowerCase()).filter((s) => s !== 'docente')
  ];
}

function normalizarEnviarAHex(value) {
  const v = String(value || 'todos').toLowerCase().trim();
  return perfilesEnviarAPermitidos().includes(v) ? v : 'todos';
}

function tipoUsuarioDesdeEnviarA(enviarA) {
  const v = String(enviarA || '').toLowerCase().trim();
  if (v === 'alumnos') return 'ALUMNO';
  if (v === 'apoderados') return 'APODERADO';
  if (v === 'docentes' || v === 'docente') return 'DOCENTE';
  if (v === 'todo_personal') return 'TODO_PERSONAL';
  if (v === 'todos' || v === 'apoderados_alumnos' || !v) return null;
  const upper = v.toUpperCase();
  return TIPOS_PERSONAL_SET.has(upper) ? upper : null;
}

function esEnviarACargoPersonal(enviarA) {
  const t = tipoUsuarioDesdeEnviarA(enviarA);
  return !!(t && t !== 'TODO_PERSONAL' && esTipoPersonal(t));
}

function enviarAOmiteFiltroAulas(enviarA) {
  const v = String(enviarA || '').toLowerCase();
  if (v === 'todo_personal') return true;
  const t = tipoUsuarioDesdeEnviarA(v);
  return !!(t && esTipoPersonal(t) && t !== 'DOCENTE');
}

function documentoVisibleParaTipo(perfilDestino, tipoUsuario) {
  const p = String(perfilDestino || '').toUpperCase();
  const t = String(tipoUsuario || '').toUpperCase();
  if (p === 'TODOS') return true;
  if (p === t) return true;
  if (p === 'TODO_PERSONAL' && esTipoPersonal(t)) return true;
  return false;
}

module.exports = {
  TIPOS_PERSONAL,
  esTipoPersonal,
  normalizarAudiencias,
  usuarioCoincideAudienciaHex,
  personalOmiteFiltroAulas,
  tiposPersonalParaNotificar,
  perfilesEnviarAPermitidos,
  normalizarEnviarAHex,
  tipoUsuarioDesdeEnviarA,
  esEnviarACargoPersonal,
  enviarAOmiteFiltroAulas,
  documentoVisibleParaTipo
};
