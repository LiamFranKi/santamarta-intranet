/** Estado de ventana horaria usando los ISO que envía la API (se recalcula en cliente). */
export function votacionHorarioAbiertoCliente(cd) {
  if (!cd) return true;
  const now = Date.now();
  if (cd.votacion_iso_inicio) {
    const t = new Date(cd.votacion_iso_inicio).getTime();
    if (now < t) return false;
  }
  if (cd.votacion_iso_fin) {
    const t = new Date(cd.votacion_iso_fin).getTime();
    if (now > t) return false;
  }
  return true;
}

export function msRestantesHasta(iso, nowMs) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return nowMs < t ? t - nowMs : 0;
}

export function formatearDuracion(ms) {
  if (ms == null || ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0 || d > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  parts.push(`${sec}s`);
  return parts.join(' ');
}

/** Partes para UI tipo “Faltan 2 días · 03:12:08” (actualizar cada segundo). */
export function partesCuentaRegresiva(ms) {
  if (ms == null || ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  const dias = Math.floor(s / 86400);
  const horas = Math.floor((s % 86400) / 3600);
  const minutos = Math.floor((s % 3600) / 60);
  const segundos = s % 60;
  return { dias, horas, minutos, segundos };
}

export function textoCuentaRegresivaUrna(ms) {
  const p = partesCuentaRegresiva(ms);
  if (!p) return null;
  const { dias, horas, minutos, segundos } = p;
  const hh = String(horas).padStart(2, '0');
  const mm = String(minutos).padStart(2, '0');
  const ss = String(segundos).padStart(2, '0');
  if (dias > 0) {
    const dTxt = dias === 1 ? '1 día' : `${dias} días`;
    return { linea: `Faltan ${dTxt} · ${hh}:${mm}:${ss}`, dias, hh, mm, ss };
  }
  return { linea: `Faltan ${hh}:${mm}:${ss}`, dias: 0, hh, mm, ss };
}
