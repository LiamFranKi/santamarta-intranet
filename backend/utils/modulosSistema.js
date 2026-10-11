/**
 * Catálogo de módulos. `defecto` es lo que se ve si nadie guardó un interruptor.
 * Los que ya estaban ocultos en el menú nacen apagados.
 */
const { query, execute } = require('./mysql');

const MODULOS = [
  { clave: 'sgoi', grupo: 'General', nombre: 'Gestión operativa', defecto: true },
  { clave: 'agenda', grupo: 'General', nombre: 'Agenda interna', defecto: true },
  { clave: 'mis-asistencias', grupo: 'General', nombre: 'Mis asistencias', defecto: true },
  { clave: 'institucional', grupo: 'General', nombre: 'Institucional', defecto: true },
  { clave: 'matriculas', grupo: 'General', nombre: 'Matrículas', defecto: true },
  { clave: 'psicologia', grupo: 'General', nombre: 'Psicología', defecto: true },
  { clave: 'auditoria', grupo: 'General', nombre: 'Auditoría', defecto: true },
  { clave: 'biblioteca', grupo: 'General', nombre: 'Biblioteca', defecto: true },
  { clave: 'kiosco', grupo: 'General', nombre: 'Kiosco cafetín', defecto: false },
  { clave: 'comunicaciones.chat', grupo: 'General', nombre: 'Chat', defecto: false },

  { clave: 'usuarios.personal', grupo: 'Usuarios', nombre: 'Personal', defecto: true },
  { clave: 'usuarios.alumnos', grupo: 'Usuarios', nombre: 'Alumnos', defecto: true },
  { clave: 'usuarios.apoderados', grupo: 'Usuarios', nombre: 'Apoderados', defecto: true },

  { clave: 'academico.cneb', grupo: 'Académico', nombre: 'CNEB', defecto: true },
  { clave: 'academico.cneb-ia', grupo: 'Académico', nombre: 'IA en sesiones CNEB', defecto: false },
  { clave: 'academico.niveles', grupo: 'Académico', nombre: 'Niveles', defecto: true },
  { clave: 'academico.grados', grupo: 'Académico', nombre: 'Grados', defecto: true },
  { clave: 'academico.cursos', grupo: 'Académico', nombre: 'Cursos', defecto: true },
  { clave: 'academico.asignaturas', grupo: 'Académico', nombre: 'Asignaturas', defecto: true },
  { clave: 'academico.areas', grupo: 'Académico', nombre: 'Áreas', defecto: true },
  { clave: 'academico.gamificacion', grupo: 'Académico', nombre: 'Gamificación', defecto: true },
  { clave: 'academico.horario-gen', grupo: 'Académico', nombre: 'Generar horarios', defecto: false },

  { clave: 'herramientas.documentos', grupo: 'Herramientas', nombre: 'Documentos', defecto: true },
  { clave: 'herramientas.examenes', grupo: 'Herramientas', nombre: 'Exámenes', defecto: true },
  { clave: 'herramientas.encuestas', grupo: 'Herramientas', nombre: 'Encuestas', defecto: true },
  { clave: 'herramientas.elecciones', grupo: 'Herramientas', nombre: 'Elecciones', defecto: true },
  { clave: 'herramientas.vocabularios', grupo: 'Herramientas', nombre: 'Vocabularios', defecto: true },
  { clave: 'herramientas.fichas', grupo: 'Herramientas', nombre: 'Fichas IA', defecto: true },
  { clave: 'herramientas.supervision', grupo: 'Herramientas', nombre: 'Supervisión', defecto: true },
  { clave: 'herramientas.tardanzas', grupo: 'Herramientas', nombre: 'Tardanzas', defecto: true },
  { clave: 'herramientas.reuniones', grupo: 'Herramientas', nombre: 'Reuniones', defecto: true },
  { clave: 'herramientas.vanguarcito', grupo: 'Herramientas', nombre: 'Vanguarcito', defecto: false },

  { clave: 'comunicaciones.publicaciones', grupo: 'Comunicaciones', nombre: 'Publicaciones', defecto: true },
  { clave: 'comunicaciones.conexiones', grupo: 'Comunicaciones', nombre: 'Conexiones', defecto: true },
  { clave: 'comunicaciones.comunicados', grupo: 'Comunicaciones', nombre: 'Comunicados', defecto: true },
  { clave: 'comunicaciones.actividades', grupo: 'Comunicaciones', nombre: 'Actividades', defecto: true },
  { clave: 'comunicaciones.eventos', grupo: 'Comunicaciones', nombre: 'Eventos', defecto: true },
  { clave: 'comunicaciones.notificaciones', grupo: 'Comunicaciones', nombre: 'Notificaciones', defecto: true },

  { clave: 'pagos.escolares', grupo: 'Pagos y facturas', nombre: 'Pagos escolares', defecto: true },
  { clave: 'pagos.productos', grupo: 'Pagos y facturas', nombre: 'Productos', defecto: true },
  { clave: 'pagos.ventas', grupo: 'Pagos y facturas', nombre: 'Ventas', defecto: true },
  { clave: 'pagos.compras', grupo: 'Pagos y facturas', nombre: 'Compras', defecto: true },
  { clave: 'pagos.caja', grupo: 'Pagos y facturas', nombre: 'Caja chica', defecto: true },

  { clave: 'reportes.general', grupo: 'Reportes', nombre: 'General', defecto: true },
  { clave: 'reportes.temas', grupo: 'Reportes', nombre: 'Temas', defecto: true },
  { clave: 'reportes.notas', grupo: 'Reportes', nombre: 'Notas', defecto: true },
  { clave: 'reportes.deudores', grupo: 'Reportes', nombre: 'Deudores', defecto: true },
  { clave: 'reportes.asistencias', grupo: 'Reportes', nombre: 'Asistencias', defecto: false },
  { clave: 'reportes.estadisticas', grupo: 'Reportes', nombre: 'Estadísticas', defecto: false },
  { clave: 'reportes.incidencias', grupo: 'Reportes', nombre: 'Incidencias', defecto: false },

  { clave: 'web.reclamos', grupo: 'Web', nombre: 'Reclamos', defecto: true },
  { clave: 'web.sugerencias', grupo: 'Web', nombre: 'Sugerencias', defecto: true },
  { clave: 'web.contacto', grupo: 'Web', nombre: 'Contacto', defecto: true },
  { clave: 'web.visitas', grupo: 'Web', nombre: 'Visitas', defecto: true },
  { clave: 'web.trabaja', grupo: 'Web', nombre: 'Trabaja con nosotros', defecto: true },
  { clave: 'web.admision', grupo: 'Web', nombre: 'Admisión', defecto: true },
  { clave: 'web.matricula', grupo: 'Web', nombre: 'Matrícula', defecto: true },
  { clave: 'web.calendarizacion', grupo: 'Web', nombre: 'Calendarización', defecto: true },
  { clave: 'web.faqs', grupo: 'Web', nombre: 'Preguntas frecuentes', defecto: true },
  { clave: 'web.utiles', grupo: 'Web', nombre: 'Lista de útiles', defecto: true },
  { clave: 'web.documentos', grupo: 'Web', nombre: 'Documentos', defecto: true },
  { clave: 'web.paginas', grupo: 'Web', nombre: 'Páginas', defecto: true },

  { clave: 'config.general', grupo: 'Configuración', nombre: 'General', defecto: true },
  { clave: 'config.recaudo', grupo: 'Configuración', nombre: 'Recaudo', defecto: true },
  { clave: 'config.anio', grupo: 'Configuración', nombre: 'Año académico', defecto: true },
  { clave: 'config.pagos', grupo: 'Configuración', nombre: 'Pagos', defecto: true },
  { clave: 'config.notas', grupo: 'Configuración', nombre: 'Notas', defecto: true },
  { clave: 'config.facturacion', grupo: 'Configuración', nombre: 'Facturación', defecto: true },
  { clave: 'config.tutoria', grupo: 'Configuración', nombre: 'Tutoría', defecto: true },
  { clave: 'config.cajero', grupo: 'Configuración', nombre: 'Cajero', defecto: true },
  { clave: 'config.biblioteca', grupo: 'Configuración', nombre: 'Biblioteca', defecto: true },
  { clave: 'config.cumpleanos', grupo: 'Configuración', nombre: 'Cumpleaños', defecto: true },
  { clave: 'config.indicadores', grupo: 'Configuración', nombre: 'Indicadores', defecto: true },
];

const POR_CLAVE = new Map(MODULOS.map((m) => [m.clave, m]));

function estadosDeFabrica() {
  const out = {};
  for (const m of MODULOS) out[m.clave] = m.defecto !== false;
  return out;
}

async function leerEstados() {
  const estados = estadosDeFabrica();
  try {
    const rows = await query(`SELECT clave, activo FROM modulos_sistema`);
    for (const row of rows || []) {
      const clave = String(row.clave || '');
      if (!POR_CLAVE.has(clave)) continue;
      estados[clave] = Number(row.activo) === 1;
    }
  } catch (e) {
    const msg = String(e?.message || '');
    if (e?.code === 'ER_NO_SUCH_TABLE' || /modulos_sistema/i.test(msg)) return estados;
    console.error('[modulos] lectura:', msg);
    return estados;
  }
  return estados;
}

async function moduloActivo(clave) {
  const estados = await leerEstados();
  if (!Object.prototype.hasOwnProperty.call(estados, clave)) return true;
  return !!estados[clave];
}

async function guardarEstado(clave, activo) {
  if (!POR_CLAVE.has(clave)) {
    const err = new Error('Módulo desconocido');
    err.status = 400;
    throw err;
  }
  const flag = activo ? 1 : 0;
  await execute(
    `INSERT INTO modulos_sistema (clave, activo) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE activo = VALUES(activo)`,
    [clave, flag]
  );
  return flag === 1;
}

module.exports = {
  MODULOS,
  leerEstados,
  moduloActivo,
  guardarEstado,
};
