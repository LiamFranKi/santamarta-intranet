-- =============================================================================
-- MIGRACIÓN 015: notas_detalle_explicaciones_indicadores
-- =============================================================================
--
-- Propósito:
--   Tabla para almacenar las explicaciones del docente por INDICADOR en el
--   nivel INICIAL (cualitativo). Cada indicador de un curso puede tener su
--   propia explicación para el apoderado.
--
-- Diferencia con notas_detalle_explicaciones:
--   - notas_detalle_explicaciones  → Cuantitativa (1 explicación por curso)
--   - notas_detalle_explicaciones_indicadores → Cualitativa (1 explicación por indicador)
--
-- Relación:
--   asignaturas → asignaturas_criterios → asignaturas_indicadores
--   Cada indicador puede tener nota (promedio) y explicación por alumno/bimestre.
--
-- =============================================================================

CREATE TABLE IF NOT EXISTS `notas_detalle_explicaciones_indicadores` (
  `id`                      int(11)       NOT NULL AUTO_INCREMENT,
  `asignatura_id`           int(11)       NOT NULL COMMENT 'ID del curso/asignatura',
  `indicador_id`            int(11)       NOT NULL COMMENT 'ID del indicador (asignaturas_indicadores)',
  `matricula_id`            int(11)       NOT NULL COMMENT 'ID de matrícula del alumno',
  `ciclo`                   tinyint(1)    NOT NULL COMMENT '1, 2, 3 o 4 = bimestre',
  `nota`                    varchar(50)   DEFAULT NULL COMMENT 'Promedio/valor del indicador (ej: A, B, 15)',
  `explicacion`             text          DEFAULT NULL COMMENT 'Explicación para el apoderado',
  `colegio_id`              int(11)       NOT NULL,
  `created_at`              datetime      DEFAULT CURRENT_TIMESTAMP,
  `updated_at`              datetime      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_asig_ind_mat_ciclo` (`asignatura_id`, `indicador_id`, `matricula_id`, `ciclo`),
  KEY `idx_ndei_asignatura` (`asignatura_id`),
  KEY `idx_ndei_indicador` (`indicador_id`),
  KEY `idx_ndei_matricula` (`matricula_id`),
  KEY `idx_ndei_ciclo` (`ciclo`),
  KEY `idx_ndei_colegio` (`colegio_id`)
) ENGINE=InnoDB 
  DEFAULT CHARSET=utf8mb4 
  COLLATE=utf8mb4_general_ci
  COMMENT='Explicaciones del docente por indicador (nivel INICIAL cualitativo)';
