-- ============================================================
-- TABLA: asistencia_registros
-- Descripción: Registra las entradas y salidas de alumnos y docentes
-- ============================================================

CREATE TABLE IF NOT EXISTS `asistencia_registros` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `usuario_id` int(11) NOT NULL COMMENT 'ID del usuario (alumno o docente)',
  `colegio_id` int(11) NOT NULL,
  `anio` int(11) NOT NULL COMMENT 'Año académico',
  `fecha` date NOT NULL,
  `tipo_registro` enum('ENTRADA','SALIDA','ENTRADA_SALIDA') NOT NULL DEFAULT 'ENTRADA',
  `hora_entrada` time DEFAULT NULL,
  `hora_salida` time DEFAULT NULL,
  `creado_por` int(11) DEFAULT NULL COMMENT 'ID del usuario ASISTENCIA que registró',
  `actualizado_por` int(11) DEFAULT NULL COMMENT 'ID del usuario ASISTENCIA que actualizó',
  `fecha_creacion` datetime DEFAULT CURRENT_TIMESTAMP,
  `fecha_actualizacion` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_usuario_fecha` (`usuario_id`, `fecha`, `anio`),
  KEY `idx_colegio_fecha` (`colegio_id`, `fecha`),
  KEY `idx_anio` (`anio`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Registros de asistencia de alumnos y docentes';

