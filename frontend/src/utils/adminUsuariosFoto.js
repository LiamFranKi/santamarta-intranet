/** URL de foto alumnos/personal (Static compartido con PHP), mismo criterio que DashboardLayout */

export function fotoUsuarioAdmin(foto) {
  if (!foto) return null;
  const nombre = String(foto).trim();
  if (!nombre) return null;
  if (nombre.startsWith('http')) return nombre;
  if (nombre.startsWith('/')) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}${nombre}`;
  }
  const host = window.location.hostname || '';
  const phpSystemUrl = 'https://nuevo.vanguardschools.edu.pe';
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  if (isLocal) {
    return `http://localhost:5000/Static/Image/Fotos/${nombre}`;
  }
  return `${phpSystemUrl}/Static/Image/Fotos/${nombre}`;
}
