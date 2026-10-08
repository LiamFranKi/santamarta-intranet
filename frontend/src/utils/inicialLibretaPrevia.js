/** En 2026 Inicial sigue con la libreta de indicadores del aula. Desde 2027, cualitativo = CNEB. */
export const ANIO_INICIAL_LIBRETA_PREVIA = 2026;

export function esInicialLibretaPrevia(anio, nivelNombre) {
  return Number(anio) === ANIO_INICIAL_LIBRETA_PREVIA
    && String(nivelNombre || '').toUpperCase().includes('INICIAL');
}
