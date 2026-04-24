/**
 * Códigos numéricos de `matriculas.estado` (columna entera en MySQL).
 * Alineado al sistema anterior: Main/Models/TraitConstants.php → $ESTADOS_MATRICULA
 *   ['REGULAR','IRREGULAR','RETIRADO','TRASLADO','TEMPORAL']  (índices 0..4)
 *
 * **Política del intranet:** listas, login, asistencia, notas, psicología y demás flujos
 * solo consideran matrícula **REGULAR = 0**. Los demás estados (incl. Temporal = 4) no
 * habilitan acceso ni aparición en conteos operativos.
 */
const MATRICULA_ESTADO = {
  REGULAR: 0,
  IRREGULAR: 1,
  RETIRADO: 2,
  TRASLADO: 3,
  TEMPORAL: 4
};

/** Igual que matrícula regular sola (compatibilidad con código que importaba «operativos»). */
const MATRICULA_ESTADOS_OPERATIVOS = [MATRICULA_ESTADO.REGULAR];

const ESTADOS_MATRICULA_ETIQUETAS = ['Regular', 'Irregular', 'Retirado', 'Traslado', 'Temporal'];

/**
 * Solo **Regular** (0) — condición estándar en SQL para matrícula válida en todo el sistema.
 * @param {string} alias Alias de tabla, p. ej. 'm' → `(m.estado = 0)`
 */
function sqlMatriculaEstadoSoloRegular(alias = 'm') {
  const a = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(String(alias)) ? String(alias) : 'm';
  return `(${a}.estado = ${MATRICULA_ESTADO.REGULAR})`;
}

/**
 * @deprecated Mismo criterio que `sqlMatriculaEstadoSoloRegular` (solo REGULAR).
 * Se mantiene el nombre para imports existentes.
 */
function sqlMatriculaEstadoOperativo(alias = 'm') {
  return sqlMatriculaEstadoSoloRegular(alias);
}

function etiquetaEstadoMatricula(estado) {
  const e = Number(estado);
  if (Number.isFinite(e) && e >= 0 && e < ESTADOS_MATRICULA_ETIQUETAS.length) {
    return ESTADOS_MATRICULA_ETIQUETAS[e];
  }
  return `Cód. ${estado}`;
}

module.exports = {
  MATRICULA_ESTADO,
  MATRICULA_ESTADOS_OPERATIVOS,
  ESTADOS_MATRICULA_ETIQUETAS,
  sqlMatriculaEstadoSoloRegular,
  sqlMatriculaEstadoOperativo,
  etiquetaEstadoMatricula
};
