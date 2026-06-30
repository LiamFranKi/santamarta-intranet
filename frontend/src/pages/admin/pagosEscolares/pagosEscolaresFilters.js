/** Grados según nivel (mismo criterio que reportes general). */
export function gradosParaNivel(nivel) {
  if (!nivel) return [];
  const gminRaw = nivel.grado_minimo;
  const gmaxRaw = nivel.grado_maximo;
  const gmin = gminRaw !== undefined && gminRaw !== null && gminRaw !== '' ? Number(gminRaw) : NaN;
  const gmax = gmaxRaw !== undefined && gmaxRaw !== null && gmaxRaw !== '' ? Number(gmaxRaw) : NaN;
  if (Number.isFinite(gmin) && Number.isFinite(gmax) && gmax >= gmin) {
    return Array.from({ length: gmax - gmin + 1 }, (_, i) => gmin + i);
  }
  const name = String(nivel.nombre || '').toLowerCase();
  if (name.includes('inicial')) return [1, 2, 3, 4, 5];
  if (name.includes('primaria')) return [1, 2, 3, 4, 5, 6];
  if (name.includes('secundaria')) return [1, 2, 3, 4, 5];
  return [1, 2, 3, 4, 5, 6];
}

export function etiquetaGradoOpcion(nivel, grado) {
  const n = String(nivel?.nombre || '').toLowerCase();
  if (n.includes('inicial')) return `${grado} Años`;
  return `${grado}°`;
}

export const SECCIONES_OPCIONES = ['UNICA', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export const PAGOS_ESCOLARES_TABS = [
  { id: 'buscar', label: 'Buscar alumnos' },
  { id: 'bcp', label: 'Importar / Exportar BCP' },
  { id: 'boletear', label: 'Boletear pagos' },
];

export function tabPagosFromSearchParams(searchParams) {
  const t = String(searchParams.get('tab') || 'buscar').toLowerCase();
  if (t === 'historial') return 'bcp';
  return PAGOS_ESCOLARES_TABS.some((x) => x.id === t) ? t : 'buscar';
}
