-- ============================================================
-- MIGRACIÓN: Configuración de Asistencia
-- Descripción: Agrega hora_entrada a niveles y crea tabla matriculas_asistencias
-- NOTA: Este archivo está obsoleto. Usar 004_asistencia_configuracion_MANUAL.sql
-- ============================================================

-- OBSOLETO: Ahora se usa hora_entrada en niveles, no en turnos

-- Crear tabla matriculas_asistencias si no existe
CREATE TABLE IF NOT EXISTS `matriculas_asistencias` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `matricula_id` int(11) NOT NULL COMMENT 'ID de la matrícula del alumno',
  `fecha` date NOT NULL COMMENT 'Fecha de la asistencia',
  `tipo` enum('PRESENTE','TARDANZA','TARDANZA_JUSTIFICADA','FALTA','FALTA_JUSTIFICADA') NOT NULL DEFAULT 'PRESENTE',
  `hora_entrada` time DEFAULT NULL COMMENT 'Hora de entrada registrada',
  `hora_salida` time DEFAULT NULL COMMENT 'Hora de salida registrada',
  `observaciones` text DEFAULT NULL COMMENT 'Observaciones adicionales',
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_matricula_fecha` (`matricula_id`, `fecha`),
  KEY `idx_fecha` (`fecha`),
  KEY `idx_matricula` (`matricula_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Asistencia global de alumnos (no por asignatura)';

