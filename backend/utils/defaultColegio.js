/**
 * Institución única en despliegues no multi-colegio.
 * Sede física por defecto (tabla `sedes`, p. ej. San Martín id=1).
 */
const DEFAULT_COLEGIO_ID = parseInt(process.env.DEFAULT_COLEGIO_ID || '1', 10);
const DEFAULT_SEDE_ID = parseInt(process.env.DEFAULT_SEDE_ID || '1', 10);

module.exports = { DEFAULT_COLEGIO_ID, DEFAULT_SEDE_ID };
