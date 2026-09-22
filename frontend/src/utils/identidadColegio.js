/**
 * Título del colegio (libretas, reportes) y marca del menú (Texto Intranet).
 * Los lee de /api/colegio/1, que ya es público.
 */
import api from '../services/api';

let cache = null;
let pending = null;

async function cargar() {
  if (cache) return cache;
  if (pending) return pending;
  pending = api
    .get('/colegio/1')
    .then(({ data }) => {
      cache = {
        titulo: String(data?.nombre_intranet || data?.nombre || 'Vanguard Schools').trim() || 'Vanguard Schools',
        marca: String(data?.texto_intranet || '').trim() || 'VanguardNet',
      };
      return cache;
    })
    .catch(() => {
      cache = { titulo: 'Vanguard Schools', marca: 'VanguardNet' };
      return cache;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

export async function obtenerTituloColegio() {
  const id = await cargar();
  return id.titulo;
}

export async function obtenerMarcaIntranet() {
  const id = await cargar();
  return id.marca;
}

export function invalidarIdentidadColegio() {
  cache = null;
  pending = null;
}
