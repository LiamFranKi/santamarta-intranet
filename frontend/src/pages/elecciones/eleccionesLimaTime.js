/** Hora de votación: siempre America/Lima (UTC−05, sin horario de verano). */

export const LIMA_IANA = 'America/Lima';

export function limaDatetimeLocalToApiIso(localStr) {
  if (!localStr || String(localStr).length < 16) return null;
  const s = String(localStr).slice(0, 16);
  return `${s}:00-05:00`;
}

function isoOrDateToLimaDatetimeLocal(val) {
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: LIMA_IANA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(d);
  const g = (t) => parts.find((p) => p.type === t)?.value || '00';
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`;
}

/** Convierte respuesta API (ISO o MySQL naive) a valor para input datetime-local en Lima. */
export function apiVotacionToLimaDatetimeLocal(val) {
  if (!val) return '';
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}/.test(s) && !/[zZ]$/.test(s) && !/[+-]\d{2}:\d{2}$/.test(s)) {
    const iso = `${s.replace(' ', 'T').slice(0, 19)}-05:00`;
    return isoOrDateToLimaDatetimeLocal(iso);
  }
  return isoOrDateToLimaDatetimeLocal(s);
}
