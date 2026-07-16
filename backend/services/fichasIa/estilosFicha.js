/**
 * Estilos de ficha (plantillas de maquetación + prompt Vanguarcito).
 */
const ESTILOS = {
  general: {
    codigo: 'general',
    plantillaCodigo: 'vanguard_guia_practica',
    archivo: 'plantilla-vanguard-guia-practica.hbs',
    nombre: 'Guía + Práctica (infografía tipada)',
    descripcion: 'Hoja 1: guía de 7 bloques. Hoja 2: ficha de aplicación tipada (I–VII).',
  },
  matematica: {
    codigo: 'matematica',
    plantillaCodigo: 'vanguard_matematica',
    archivo: 'plantilla-vanguard-matematica.hbs',
    nombre: 'Matemática / Números',
    descripcion: 'Mínimo 10 ejercicios: operaciones, problemas y completar (en esta ficha).',
  },
};

const PATRON_MATEMATICA =
  /matem|n[uú]mer|numeraci|aritm|álgebra|algebra|geometr|razonamiento\s*matem|estad[ií]stica|medida|fracci|decimal|porcentaje/i;

function listarEstilosFicha() {
  return Object.values(ESTILOS).map((e) => ({
    codigo: e.codigo,
    nombre: e.nombre,
    descripcion: e.descripcion,
    plantilla_codigo: e.plantillaCodigo,
  }));
}

function detectarEstiloPorTexto(area, cursoNombre) {
  const texto = `${area || ''} ${cursoNombre || ''}`;
  return PATRON_MATEMATICA.test(texto) ? 'matematica' : 'general';
}

function resolverEstiloFicha(valorUsuario, area, cursoNombre) {
  const v = String(valorUsuario || '').trim().toLowerCase();
  if (v === 'matematica' || v === 'matemática') return 'matematica';
  if (v === 'general') return 'general';
  if (v === 'auto' || !v) return detectarEstiloPorTexto(area, cursoNombre);
  return ESTILOS[v] ? v : 'general';
}

function metaEstilo(codigoEstilo) {
  return ESTILOS[codigoEstilo] || ESTILOS.general;
}

function esEstiloMatematica(codigoEstilo) {
  return codigoEstilo === 'matematica';
}

function esPlantillaMatematica(codigoOArchivo) {
  const s = String(codigoOArchivo || '');
  return s === 'vanguard_matematica' || /plantilla-vanguard-matematica/i.test(s);
}

module.exports = {
  ESTILOS,
  listarEstilosFicha,
  detectarEstiloPorTexto,
  resolverEstiloFicha,
  metaEstilo,
  esEstiloMatematica,
  esPlantillaMatematica,
};
