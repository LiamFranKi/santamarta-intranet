export function etiquetaGrado(nivel, grado) {
  const n = Number(grado);
  if (!Number.isFinite(n)) return String(grado ?? '');
  if (nivel === 'INICIAL') return `${n} años`;
  return `${n}.º grado`;
}

export function etiquetaAula(g) {
  if (!g) return '';
  const gr = g.grado != null ? String(g.grado) : '';
  const sec = String(g.seccion || '').trim();
  return [gr, sec].filter(Boolean).join(' ') || `Aula ${g.id}`;
}

export function gradosDe(grupos) {
  const map = new Map();
  (grupos || []).forEach((g) => {
    if (g?.grado == null || g.grado === '') return;
    map.set(String(g.grado), g.grado);
  });
  return [...map.values()].sort((a, b) => Number(a) - Number(b));
}

export function aulasDe(grupos, grado) {
  if (grado == null || grado === '') return [];
  return (grupos || []).filter((g) => String(g.grado) === String(grado));
}

export function claveCurso(s) {
  if (s?.asignatura_id) return `a:${s.asignatura_id}`;
  if (s?.area_id) return `r:${s.area_id}`;
  return 'taller';
}

export function nombreCurso(s) {
  return s?.asignatura_nombre || s?.area_nombre || 'Taller interno';
}

export function cursosDe(sesiones) {
  const map = new Map();
  (sesiones || []).forEach((s) => {
    const id = claveCurso(s);
    if (!map.has(id)) map.set(id, nombreCurso(s));
  });
  return [...map.entries()]
    .map(([id, nombre]) => ({ id, nombre }))
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
}

export function areaIdDeCurso(cursoSel, sesiones) {
  if (String(cursoSel).startsWith('r:')) return String(cursoSel).slice(2);
  const s = (sesiones || []).find((x) => x?.area_id);
  return s?.area_id != null ? String(s.area_id) : '';
}

export function asignaturaIdDeCurso(cursoSel, sesiones) {
  if (String(cursoSel).startsWith('a:')) return String(cursoSel).slice(2);
  const s = (sesiones || []).find((x) => x?.asignatura_id);
  return s?.asignatura_id != null ? String(s.asignatura_id) : '';
}

export async function textoErrorDescarga(e) {
  const data = e?.response?.data;
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    try {
      const text = await data.text();
      try {
        const json = JSON.parse(text);
        if (json?.error) return String(json.error);
      } catch {
        const limpio = String(text || '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (limpio && limpio.length < 240) return limpio;
      }
    } catch {
      /* el cuerpo no se pudo leer */
    }
  }
  if (data && typeof data === 'object' && data.error) return String(data.error);
  return e?.message || 'No se pudo descargar.';
}
