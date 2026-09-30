/**
 * Deep link desde push/campanita hacia Hijos a cargo (modales que ya existen).
 * Query: ?abrir=incidencias|asistencias&hijo=<alumno_id>&item=<inc-123|ped-4|tard-9>
 */
import { dashboardPorTipoUsuario } from './notificacionNavigate';

export function parseHijosDeepLinkSearch(search) {
  const raw = String(search || '');
  const qs = raw.startsWith('?') ? raw.slice(1) : raw;
  const sp = new URLSearchParams(qs);
  const abrir = String(sp.get('abrir') || '').toLowerCase();
  const hijoId = parseInt(sp.get('hijo') || '', 10);
  const item = String(sp.get('item') || '').trim();
  if (!['incidencias', 'asistencias'].includes(abrir)) return null;
  if (!Number.isFinite(hijoId) || hijoId <= 0) return null;
  return { abrir, hijoId, item: item || null };
}

export function hijoDeListaPorId(hijos, alumnoId) {
  const id = Number(alumnoId);
  return (hijos || []).find((h) => Number(h.id) === id || Number(h.alumno_id) === id) || null;
}

export function incidenciaCoincideItem(inc, item) {
  if (!item || inc == null) return false;
  const s = String(item);
  const id = String(inc.id ?? '');
  if (!id) return false;
  if (id === s) return true;
  if (id === `inc-${s}` || id === `ped-${s}` || id === `tard-${s}`) return true;
  if (s === `inc-${id}` || s === `ped-${id}` || s === `tard-${id}`) return true;
  const strip = (v) => String(v).replace(/^(inc|ped|tard)-/, '');
  return strip(id) === strip(s);
}

export function cicloBimestreDeItem(bimestres, item) {
  if (!item || !Array.isArray(bimestres)) return null;
  const bim = bimestres.find((b) => (b.incidencias || []).some((i) => incidenciaCoincideItem(i, item)));
  return bim != null ? Number(bim.ciclo) : null;
}

/** Evita open-redirect: solo rutas internas relativas. */
export function safeNextPath(raw) {
  if (raw == null || raw === '') return null;
  let s = String(raw).trim();
  try {
    s = decodeURIComponent(s);
  } catch {
    /* ya decodificado */
  }
  if (!s.startsWith('/') || s.startsWith('//') || /[a-z]+:\/\//i.test(s)) return null;
  if (s.length > 400) return null;
  return s;
}

export function rutaPostLoginSegunRol(tipo, nextRaw) {
  const next = safeNextPath(nextRaw);
  const t = String(tipo || '').toUpperCase();
  const dashByTipo = {
    APODERADO: '/apoderado/dashboard',
    DOCENTE: '/docente/dashboard',
    ALUMNO: '/alumno/dashboard',
    ADMINISTRADOR: '/admin/dashboard',
    SECRETARIA: '/admin/dashboard',
    PSICOLOGA: '/admin/psicologa-dashboard',
    PROMOTORIA: '/promotoria/dashboard',
    ASISTENCIA: '/asistencia/escaneo',
    KIOSCO: '/kiosco',
    COORDINADOR: '/docente/dashboard',
    DIRECTOR: '/docente/dashboard',
    CONTADOR: '/docente/dashboard',
  };
  const dash = dashByTipo[t] || dashboardPorTipoUsuario(tipo);
  if (!next) return dash;
  const prefixes = {
    APODERADO: '/apoderado/',
    DOCENTE: '/docente/',
    ALUMNO: '/alumno/',
    ADMINISTRADOR: '/admin/',
    SECRETARIA: '/admin/',
    PSICOLOGA: '/admin/',
    PROMOTORIA: '/promotoria/',
    ASISTENCIA: '/asistencia/',
    KIOSCO: '/kiosco/',
    COORDINADOR: '/admin/',
    DIRECTOR: '/admin/',
    CONTADOR: '/admin/',
  };
  const p = prefixes[t];
  if (!p) return dash;
  const base = p.slice(0, -1);
  if (next === base || next.startsWith(p) || next.startsWith(`${base}?`) || next.startsWith(`${base}#`)) {
    return next;
  }
  if (t === 'COORDINADOR' || t === 'DIRECTOR' || t === 'CONTADOR') {
    if (
      next.startsWith('/docente/')
      || next.startsWith('/encuestas')
      || next.startsWith('/herramientas-examenes')
      || next.startsWith('/elecciones-campana')
    ) {
      return next;
    }
  }
  return dash;
}

export async function aplicarDeepLinkHijos({
  search,
  hijos,
  loading,
  navigate,
  pathname,
  handleVerIncidencias,
  handleVerAsistencias,
  consumedRef,
}) {
  if (!consumedRef) return;
  const parsed = parseHijosDeepLinkSearch(search);
  if (!parsed) {
    consumedRef.current = false;
    return;
  }
  if (consumedRef.current) return;
  if (loading) return;
  consumedRef.current = true;
  const hijo = hijoDeListaPorId(hijos, parsed.hijoId);
  try {
    if (hijo) {
      if (parsed.abrir === 'incidencias' && typeof handleVerIncidencias === 'function') {
        await handleVerIncidencias(hijo, { highlightId: parsed.item });
      } else if (parsed.abrir === 'asistencias' && typeof handleVerAsistencias === 'function') {
        await handleVerAsistencias(hijo);
      }
    }
  } finally {
    if (typeof navigate === 'function' && pathname) {
      navigate(pathname, { replace: true });
    }
  }
}
