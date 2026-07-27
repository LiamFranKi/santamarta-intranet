/**
 * Convierte exámenes de Herramientas (mis-disponibles) en ítems de Próximos Eventos.
 * Sin fecha_inicio/fin: usa "hoy" para que aparezcan mientras el examen esté ACTIVO.
 */
export function mapHexExamenesToEventos(examenes, { crearFechaLima, getHoyLima }) {
  const list = Array.isArray(examenes) ? examenes : [];
  const hoy = typeof getHoyLima === 'function' ? getHoyLima() : new Date();
  const out = [];

  for (const e of list) {
    if (!e || e.id == null) continue;
    const fi = e.fecha_inicio ? crearFechaLima(e.fecha_inicio) : null;
    const ff = e.fecha_fin ? crearFechaLima(e.fecha_fin) : null;
    // Fecha a mostrar: inicio, si no fin, si no hoy
    const fecha = fi || ff || hoy;
    if (!fecha) continue;
    out.push({
      ...e,
      id: e.id,
      titulo: e.titulo || 'Evaluación',
      descripcion: e.descripcion || '',
      tipo: 'hex_examen',
      origen: 'herramientas',
      fecha,
      fecha_inicio: e.fecha_inicio || null,
      fecha_fin: e.fecha_fin || null,
      asignatura_nombre: 'Herramientas'
    });
  }
  return out;
}
