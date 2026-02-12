-- ============================================================
-- SQL PARA EJECUTAR MANUALMENTE EN phpMyAdmin
-- Configuración de Asistencia: Agregar hora_entrada a niveles
-- ============================================================

-- PASO 1: Agregar campo hora_entrada a niveles
ALTER TABLE `niveles` 
ADD COLUMN `hora_entrada` time DEFAULT '08:00:00' COMMENT 'Hora de entrada para este nivel';

-- PASO 2: Crear tabla matriculas_asistencias si no existe
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

-- PASO 3: Configurar horas de entrada por nivel (AJUSTAR SEGÚN TU COLEGIO)
-- Ejemplo: PRIMARIA entra a las 07:20, INICIAL a las 08:00
-- UPDATE `niveles` SET `hora_entrada` = '07:20:00' WHERE `nombre` LIKE '%PRIMARIA%' OR `abreviatura` = 'PRIM';
-- UPDATE `niveles` SET `hora_entrada` = '08:00:00' WHERE `nombre` LIKE '%INICIAL%' OR `abreviatura` = 'INIC';
-- UPDATE `niveles` SET `hora_entrada` = '07:30:00' WHERE `nombre` LIKE '%SECUNDARIA%' OR `abreviatura` = 'SEC';

