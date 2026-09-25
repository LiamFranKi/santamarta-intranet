/** Mismos interruptores que el backend. Si no hay dato guardado, se usa `defecto`. */
export const MODULOS = [
  { clave: 'sgoi', grupo: 'General', nombre: 'Gestión operativa', defecto: true, rutas: ['/admin/gestion-operativa'] },
  { clave: 'agenda', grupo: 'General', nombre: 'Agenda interna', defecto: true, rutas: ['/agenda-interna'] },
  { clave: 'mis-asistencias', grupo: 'General', nombre: 'Mis asistencias', defecto: true, rutas: [] },
  { clave: 'institucional', grupo: 'General', nombre: 'Institucional', defecto: true, rutas: ['/admin/institucional'] },
  { clave: 'matriculas', grupo: 'General', nombre: 'Matrículas', defecto: true, rutas: ['/admin/matriculas'] },
  { clave: 'psicologia', grupo: 'General', nombre: 'Psicología', defecto: true, rutas: ['/admin/psicologa-dashboard', '/admin/psicologia', '/docente/psicologia', '/apoderado/psicologia'] },
  { clave: 'auditoria', grupo: 'General', nombre: 'Auditoría', defecto: true, rutas: ['/admin/auditoria'] },
  { clave: 'biblioteca', grupo: 'General', nombre: 'Biblioteca', defecto: true, rutas: ['/biblioteca'] },

  { clave: 'usuarios.personal', grupo: 'Usuarios', nombre: 'Personal', defecto: true, rutas: ['/admin/usuarios/equipo'] },
  { clave: 'usuarios.alumnos', grupo: 'Usuarios', nombre: 'Alumnos', defecto: true, rutas: ['/admin/usuarios/alumnos'] },
  { clave: 'usuarios.apoderados', grupo: 'Usuarios', nombre: 'Apoderados', defecto: true, rutas: ['/admin/usuarios/apoderados'] },

  { clave: 'academico.cneb', grupo: 'Académico', nombre: 'CNEB', defecto: true, rutas: ['/admin/cneb', '/docente/cneb'] },
  { clave: 'academico.cneb-ia', grupo: 'Académico', nombre: 'IA en sesiones CNEB', defecto: false, rutas: [] },
  { clave: 'academico.niveles', grupo: 'Académico', nombre: 'Niveles', defecto: true, rutas: ['/admin/academico/niveles'] },
  { clave: 'academico.grados', grupo: 'Académico', nombre: 'Grados', defecto: true, rutas: ['/admin/academico/grados'] },
  { clave: 'academico.cursos', grupo: 'Académico', nombre: 'Cursos', defecto: true, rutas: ['/admin/academico/cursos'] },
  { clave: 'academico.asignaturas', grupo: 'Académico', nombre: 'Asignaturas', defecto: true, rutas: ['/admin/academico/asignaturas'] },
  { clave: 'academico.areas', grupo: 'Académico', nombre: 'Áreas', defecto: true, rutas: ['/admin/academico/areas'] },
  { clave: 'academico.gamificacion', grupo: 'Académico', nombre: 'Gamificación', defecto: true, rutas: ['/admin/avatares', '/alumno/avatar'] },
  { clave: 'academico.horario-gen', grupo: 'Académico', nombre: 'Generar horarios', defecto: false, rutas: ['/admin/horario-gen'] },

  { clave: 'herramientas.documentos', grupo: 'Herramientas', nombre: 'Documentos', defecto: true, rutas: ['/admin/documentos-gestion', '/docente/herramientas/documentos', '/alumno/herramientas/documentos', '/apoderado/documentos'] },
  { clave: 'herramientas.examenes', grupo: 'Herramientas', nombre: 'Exámenes', defecto: true, rutas: ['/admin/herramientas/examenes', '/docente/herramientas/examenes', '/herramientas-examenes'] },
  { clave: 'herramientas.encuestas', grupo: 'Herramientas', nombre: 'Encuestas', defecto: true, rutas: ['/admin/herramientas/encuestas', '/docente/herramientas/encuestas', '/encuestas'] },
  { clave: 'herramientas.elecciones', grupo: 'Herramientas', nombre: 'Elecciones', defecto: true, rutas: ['/admin/herramientas/elecciones', '/elecciones-campana', '/alumno/elecciones'] },
  { clave: 'herramientas.vocabularios', grupo: 'Herramientas', nombre: 'Vocabularios', defecto: true, rutas: ['/admin/herramientas/vocabularios', '/docente/herramientas/vocabularios', '/alumno/vocabularios'] },
  { clave: 'herramientas.fichas', grupo: 'Herramientas', nombre: 'Fichas IA', defecto: true, rutas: ['/admin/herramientas/disenador-fichas', '/docente/herramientas/disenador-fichas'] },
  { clave: 'herramientas.supervision', grupo: 'Herramientas', nombre: 'Supervisión', defecto: true, rutas: ['/admin/herramientas/supervision', '/docente/herramientas/supervision'] },
  { clave: 'herramientas.tardanzas', grupo: 'Herramientas', nombre: 'Tardanzas', defecto: true, rutas: ['/admin/herramientas/tardanzas'] },
  { clave: 'herramientas.reuniones', grupo: 'Herramientas', nombre: 'Reuniones', defecto: true, rutas: ['/admin/herramientas/reuniones', '/docente/herramientas/reuniones', '/alumno/reuniones', '/apoderado/reuniones'] },
  { clave: 'herramientas.vanguarcito', grupo: 'Herramientas', nombre: 'Vanguarcito', defecto: false, rutas: ['/admin/vanguarcito'] },

  { clave: 'comunicaciones.publicaciones', grupo: 'Comunicaciones', nombre: 'Publicaciones', defecto: true, rutas: ['/admin/comunicaciones/publicaciones'] },
  { clave: 'comunicaciones.conexiones', grupo: 'Comunicaciones', nombre: 'Conexiones', defecto: true, rutas: ['/admin/comunicaciones/conexiones', '/docente/conexiones'] },
  { clave: 'comunicaciones.comunicados', grupo: 'Comunicaciones', nombre: 'Comunicados', defecto: true, rutas: ['/admin/comunicaciones/comunicados', '/docente/comunicados', '/alumno/comunicados', '/apoderado/comunicados'] },
  { clave: 'comunicaciones.actividades', grupo: 'Comunicaciones', nombre: 'Actividades', defecto: true, rutas: ['/admin/comunicaciones/actividades', '/docente/actividades', '/alumno/actividades', '/apoderado/actividades'] },
  { clave: 'comunicaciones.eventos', grupo: 'Comunicaciones', nombre: 'Eventos', defecto: true, rutas: ['/admin/comunicaciones/eventos'] },
  { clave: 'comunicaciones.notificaciones', grupo: 'Comunicaciones', nombre: 'Notificaciones', defecto: true, rutas: ['/admin/comunicaciones/notificaciones'] },
  { clave: 'comunicaciones.chat', grupo: 'Comunicaciones', nombre: 'Chat Vanguard', defecto: false, rutas: ['/chat', '/admin/comunicaciones/chat-vanguard'] },

  { clave: 'pagos.escolares', grupo: 'Pagos y facturas', nombre: 'Pagos escolares', defecto: true, rutas: ['/admin/pagos-facturas/buscar-pagos'] },
  { clave: 'pagos.productos', grupo: 'Pagos y facturas', nombre: 'Productos', defecto: true, rutas: ['/admin/pagos-facturas/productos'] },
  { clave: 'pagos.ventas', grupo: 'Pagos y facturas', nombre: 'Ventas', defecto: true, rutas: ['/admin/pagos-facturas/ventas'] },
  { clave: 'pagos.compras', grupo: 'Pagos y facturas', nombre: 'Compras', defecto: true, rutas: ['/admin/pagos-facturas/compras'] },
  { clave: 'pagos.caja', grupo: 'Pagos y facturas', nombre: 'Caja chica', defecto: true, rutas: ['/admin/pagos-facturas/caja-chica'] },

  { clave: 'reportes.general', grupo: 'Reportes', nombre: 'General', defecto: true, rutas: ['/admin/reportes/general'] },
  { clave: 'reportes.temas', grupo: 'Reportes', nombre: 'Temas', defecto: true, rutas: ['/admin/reportes/temas'] },
  { clave: 'reportes.notas', grupo: 'Reportes', nombre: 'Notas', defecto: true, rutas: ['/admin/reportes/notas'] },
  { clave: 'reportes.deudores', grupo: 'Reportes', nombre: 'Deudores', defecto: true, rutas: ['/admin/reportes/deudores'] },
  { clave: 'reportes.asistencias', grupo: 'Reportes', nombre: 'Asistencias', defecto: false, rutas: ['/admin/reportes/asistencias'] },
  { clave: 'reportes.estadisticas', grupo: 'Reportes', nombre: 'Estadísticas', defecto: false, rutas: ['/admin/reportes/estadisticas', '/admin/estadisticas'] },
  { clave: 'reportes.incidencias', grupo: 'Reportes', nombre: 'Incidencias', defecto: false, rutas: ['/admin/reportes/incidencias'] },

  { clave: 'web.reclamos', grupo: 'Web', nombre: 'Reclamos', defecto: true, rutas: [] },
  { clave: 'web.sugerencias', grupo: 'Web', nombre: 'Sugerencias', defecto: true, rutas: [] },
  { clave: 'web.contacto', grupo: 'Web', nombre: 'Contacto', defecto: true, rutas: [] },
  { clave: 'web.visitas', grupo: 'Web', nombre: 'Visitas', defecto: true, rutas: [] },
  { clave: 'web.trabaja', grupo: 'Web', nombre: 'Trabaja con nosotros', defecto: true, rutas: [] },
  { clave: 'web.admision', grupo: 'Web', nombre: 'Admisión', defecto: true, rutas: [] },
  { clave: 'web.matricula', grupo: 'Web', nombre: 'Matrícula', defecto: true, rutas: [] },
  { clave: 'web.calendarizacion', grupo: 'Web', nombre: 'Calendarización', defecto: true, rutas: [] },
  { clave: 'web.faqs', grupo: 'Web', nombre: 'Preguntas frecuentes', defecto: true, rutas: [] },
  { clave: 'web.utiles', grupo: 'Web', nombre: 'Lista de útiles', defecto: true, rutas: [] },
  { clave: 'web.documentos', grupo: 'Web', nombre: 'Documentos', defecto: true, rutas: [] },
  { clave: 'web.paginas', grupo: 'Web', nombre: 'Páginas', defecto: true, rutas: [] },

  { clave: 'config.general', grupo: 'Configuración', nombre: 'General', defecto: true, rutas: [] },
  { clave: 'config.recaudo', grupo: 'Configuración', nombre: 'Recaudo', defecto: true, rutas: [] },
  { clave: 'config.anio', grupo: 'Configuración', nombre: 'Año académico', defecto: true, rutas: [] },
  { clave: 'config.pagos', grupo: 'Configuración', nombre: 'Pagos', defecto: true, rutas: [] },
  { clave: 'config.notas', grupo: 'Configuración', nombre: 'Notas', defecto: true, rutas: [] },
  { clave: 'config.facturacion', grupo: 'Configuración', nombre: 'Facturación', defecto: true, rutas: [] },
  { clave: 'config.tutoria', grupo: 'Configuración', nombre: 'Tutoría', defecto: true, rutas: [] },
  { clave: 'config.cajero', grupo: 'Configuración', nombre: 'Cajero', defecto: true, rutas: [] },
  { clave: 'config.biblioteca', grupo: 'Configuración', nombre: 'Biblioteca', defecto: true, rutas: [] },
  { clave: 'config.cumpleanos', grupo: 'Configuración', nombre: 'Cumpleaños', defecto: true, rutas: ['/admin/config/cumpleanos'] },
  { clave: 'config.indicadores', grupo: 'Configuración', nombre: 'Indicadores', defecto: true, rutas: ['/admin/config/indicadores'] },
];

const FABRICA = Object.fromEntries(MODULOS.map((m) => [m.clave, m.defecto !== false]));

export const CLAVES_WEB = MODULOS.filter((m) => m.clave.startsWith('web.')).map((m) => m.clave);
export const CLAVES_CONFIG_PAGINA = [
  'config.general',
  'config.recaudo',
  'config.anio',
  'config.pagos',
  'config.notas',
  'config.facturacion',
  'config.tutoria',
  'config.cajero',
  'config.biblioteca',
];

const RUTAS = MODULOS
  .flatMap((m) => (m.rutas || []).map((ruta) => ({ ruta, clave: m.clave })))
  .sort((a, b) => b.ruta.length - a.ruta.length);

export function estadosDeFabrica() {
  return { ...FABRICA };
}

export function claveDeRuta(pathname) {
  const path = String(pathname || '').split('?')[0];
  if (!path || path === '/admin/modulos') return null;
  if (path === '/admin/config/cumpleanos' || path.startsWith('/admin/config/cumpleanos/')) return 'config.cumpleanos';
  if (path === '/admin/config/indicadores' || path.startsWith('/admin/config/indicadores/')) return 'config.indicadores';
  if (path === '/admin/config' || path.startsWith('/admin/config/')) return 'config.pagina';
  if (path === '/admin/comunicaciones/web' || path.startsWith('/admin/comunicaciones/web/')) return 'web.pagina';
  for (const item of RUTAS) {
    if (path === item.ruta || path.startsWith(`${item.ruta}/`)) return item.clave;
  }
  return null;
}

export function inicioPorTipo(tipo) {
  if (tipo === 'ALUMNO') return '/alumno/dashboard';
  if (tipo === 'APODERADO') return '/apoderado/dashboard';
  if (tipo === 'DOCENTE' || tipo === 'DIRECTOR' || tipo === 'COORDINADOR' || tipo === 'CONTADOR') return '/docente/dashboard';
  if (tipo === 'PSICOLOGA') return '/admin/psicologa-dashboard';
  if (tipo === 'PROMOTORIA') return '/promotoria/dashboard';
  if (tipo === 'ASISTENCIA') return '/asistencia/escaneo';
  return '/admin/dashboard';
}
