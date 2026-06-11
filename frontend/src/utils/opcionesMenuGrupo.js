import { esNivelInicial } from './esNivelInicial';

export const OPCION_VER_LIBRETAS = { key: 'ver_libretas', label: 'Ver Libretas', icon: '📄' };
export const OPCION_REGISTRO_NOTAS = { key: 'registro_notas', label: 'Registro de Notas', icon: '📚' };

const CLAVES_BLOQUE_NOTAS_ADMIN = new Set(['registro_notas', 'ver_libretas']);

/**
 * Inserta el bloque de notas/libretas en el menú Opciones de Admin → Grados.
 */
export function opcionesGrupoMenuParaFila(grupo, opcionesBase) {
  const lista = opcionesBase || [];
  const incluyeNotas = lista.some((op) => op.key === 'registro_notas');
  if (!incluyeNotas) return lista;

  const inicial = esNivelInicial(grupo);
  const sinBloqueNotas = lista.filter((op) => !CLAVES_BLOQUE_NOTAS_ADMIN.has(op.key));
  const idxQr = sinBloqueNotas.findIndex((op) => op.key === 'imprimir_qr');
  const insertAt = idxQr >= 0 ? idxQr + 1 : sinBloqueNotas.length;
  const bloqueNotas = inicial
    ? [OPCION_VER_LIBRETAS]
    : [OPCION_REGISTRO_NOTAS, OPCION_VER_LIBRETAS];
  return [...sinBloqueNotas.slice(0, insertAt), ...bloqueNotas, ...sinBloqueNotas.slice(insertAt)];
}

/**
 * Menú Opciones de Tutoría / Tutoría General por grupo.
 */
export function buildOpcionesTutoriaGrupo(grupo, { soloLectura = false } = {}) {
  const inicial = esNivelInicial(grupo);
  const base = [
    { id: 'lista-alumnos', label: 'Lista de Alumnos', icon: '📋' },
    { id: 'cursos-asignados', label: 'Cursos Asignados', icon: '📚' },
    { id: 'ver-horario', label: 'Ver Horario', icon: '📅' },
    { id: 'ver-nomina', label: 'Ver Nómina', icon: '📄' },
    { id: 'orden-merito', label: 'Orden de Mérito', icon: '🏆' },
  ];

  const bloqueNotas = inicial
    ? [{ id: 'ver-libretas', label: 'Ver Libretas', icon: '📄' }]
    : [
        { id: 'notas-asistencia', label: 'Ver Notas', icon: '📊' },
        { id: 'ver-libretas', label: 'Ver Libretas', icon: '📄' },
      ];

  const resto = [
    { id: 'conexiones-familiares', label: 'Conexiones Familiares', icon: '✉️' },
    {
      id: 'registrar-asistencia',
      label: soloLectura ? 'Ver Asistencias' : 'Asistencias',
      icon: '✅',
    },
    {
      id: 'apreciaciones-recomendaciones',
      label: soloLectura ? 'Ver Recomendaciones' : 'Recomendaciones',
      icon: '💬',
    },
    {
      id: 'registrar-conducta',
      label: soloLectura ? 'Ver Conducta' : 'Registrar Conducta',
      icon: '📝',
    },
    { id: 'deudores', label: 'Deudores', icon: '💰' },
  ];

  return [...base, ...bloqueNotas, ...resto];
}
