export const PUSH_ENDPOINT_STORAGE_KEY = 'intranet_push_endpoint';

const CLAVES_SESION = [
  'token',
  'user',
  'anio_consulta_apoderado',
  'comunicados_leidos',
  PUSH_ENDPOINT_STORAGE_KEY,
];

function quitarClavesPrefijo(storage, prefijos) {
  if (!storage) return;
  const quitar = [];
  for (let i = 0; i < storage.length; i += 1) {
    const k = storage.key(i);
    if (k && prefijos.some((p) => k.startsWith(p))) quitar.push(k);
  }
  quitar.forEach((k) => storage.removeItem(k));
}

/** Token, usuario, push de este PC y vistos de comunicados de la sesión. */
export function limpiarStorageSesion() {
  CLAVES_SESION.forEach((k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  });
  const prefijos = ['comunicado_home_', 'cumpleanos_bienvenida_'];
  try {
    quitarClavesPrefijo(localStorage, prefijos);
  } catch {
    /* ignore */
  }
  try {
    quitarClavesPrefijo(sessionStorage, prefijos);
  } catch {
    /* ignore */
  }
}
