const TIPO_SUPERADMIN = 'SUPERADMINISTRADOR';

export function esSuperadmin(tipo) {
  return String(tipo || '').toUpperCase() === TIPO_SUPERADMIN;
}

/** En la sesión y la UI opera como Administrador; el tipo real no se expone. */
export function tipoSesionPublico(tipo) {
  return esSuperadmin(tipo) ? 'ADMINISTRADOR' : tipo;
}

export function normalizarUsuarioSesion(userData) {
  if (!userData || typeof userData !== 'object') return userData;
  return { ...userData, tipo: tipoSesionPublico(userData.tipo) };
}
