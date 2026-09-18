/** Audiencias del editor / chips de exámenes de herramientas. */

export const HEX_AUD_TODOS = 'TODOS';
export const HEX_AUD_PERSONAL = 'TODO_PERSONAL';

export const HEX_TIPOS_PERSONAL = [
  { value: 'DOCENTE', label: 'Docentes' },
  { value: 'DIRECTOR', label: 'Directores' },
  { value: 'COORDINADOR', label: 'Coordinadores' },
  { value: 'CONTADOR', label: 'Contadores' },
  { value: 'ADMINISTRADOR', label: 'Administradores' },
  { value: 'PROMOTORIA', label: 'Promotoría' },
  { value: 'PSICOLOGA', label: 'Psicóloga' },
  { value: 'SECRETARIA', label: 'Secretaría' },
  { value: 'AUXILIAR', label: 'Auxiliares' },
  { value: 'CAJERO', label: 'Cajeros' },
  { value: 'ENFERMERA', label: 'Enfermería' },
  { value: 'ASISTENCIA', label: 'Asistencia' },
  { value: 'TUTOR', label: 'Tutores' },
  { value: 'MANTENIMIENTO', label: 'Mantenimiento' }
];

export const HEX_AUDIENCIAS = [
  { value: 'ALUMNO', label: 'Alumnos', grupo: 'comunidad' },
  { value: 'APODERADO', label: 'Apoderados', grupo: 'comunidad' },
  { value: HEX_AUD_PERSONAL, label: 'Todo el personal', grupo: 'personal-clave' },
  ...HEX_TIPOS_PERSONAL.map((a) => ({ ...a, grupo: 'personal' })),
  { value: HEX_AUD_TODOS, label: 'Todos los usuarios', grupo: 'comunidad-extra' }
];

export const HEX_AUD_LABEL = {
  ALUMNO: 'Alumnos',
  APODERADO: 'Apoderados',
  TODOS: 'Todos los usuarios',
  TODO_PERSONAL: 'Todo el personal',
  ...Object.fromEntries(HEX_TIPOS_PERSONAL.map((a) => [a.value, a.label]))
};

export function labelAudienciaHex(codigo) {
  const k = String(codigo || '').toUpperCase();
  return HEX_AUD_LABEL[k] || k;
}

/** Etiqueta para historial de Conexiones / notificaciones (guarda ALUMNOS, DOCENTES, etc.). */
export function labelPerfilDestinoEnvio(codigo) {
  const k = String(codigo || '').toUpperCase();
  if (k === 'ALUMNOS') return 'Alumnos';
  if (k === 'DOCENTES') return 'Docentes';
  if (k === 'APODERADOS') return 'Apoderados';
  if (k === 'TODOS') return 'Todos los perfiles';
  if (k === 'APODERADOS_ALUMNOS') return 'Apoderados y alumnos';
  return labelAudienciaHex(k);
}

export function slugEnviarADesdeTipo(tipoUpper) {
  const t = String(tipoUpper || '').toUpperCase();
  if (t === 'DOCENTE') return 'docentes';
  if (t === 'ALUMNO') return 'alumnos';
  if (t === 'APODERADO') return 'apoderados';
  if (t === 'TODO_PERSONAL') return 'todo_personal';
  return t.toLowerCase();
}

/** Radios de Conexiones / notificaciones: comunidad + todo el personal + cada cargo. */
export const PERFILES_ENVIO_COMUNIDAD = [
  { value: 'todos', label: 'Apoderados y alumnos' },
  { value: 'alumnos', label: 'Alumnos' },
  { value: 'apoderados', label: 'Apoderados' }
];

export const PERFILES_ENVIO_PERSONAL = [
  { value: 'todo_personal', label: 'Todo el personal', clave: true },
  ...HEX_TIPOS_PERSONAL.map((a) => ({
    value: slugEnviarADesdeTipo(a.value),
    label: a.label
  }))
];

export const PERFILES_ENVIO_NOTIF_COMUNIDAD = [
  { value: 'todos', label: 'Todos' },
  { value: 'alumnos', label: 'Alumnos' },
  { value: 'apoderados', label: 'Apoderados' }
];

export function esPerfilStaffSinAulas(perfilDestino) {
  const v = String(perfilDestino || '').toLowerCase();
  if (v === 'todo_personal') return true;
  if (v === 'docentes' || v === 'docente') return false;
  if (v === 'alumnos' || v === 'apoderados' || v === 'todos' || v === 'apoderados_alumnos') return false;
  return HEX_TIPOS_PERSONAL.some((a) => a.value.toLowerCase() === v);
}
