-- Evidencias del aula virtual (fotos y PDF por asignatura/bimestre).
-- Aplicar en MySQL (phpMyAdmin o CLI).

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `asignaturas_evidencias` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `asignatura_id` INT UNSIGNED NOT NULL,
  `trabajador_id` INT UNSIGNED DEFAULT NULL,
  `colegio_id` INT UNSIGNED DEFAULT NULL,
  `titulo` VARCHAR(200) NOT NULL,
  `archivo` VARCHAR(255) NOT NULL,
  `tipo` VARCHAR(16) NOT NULL DEFAULT 'imagen',
  `ciclo` TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `fecha_hora` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_evidencias_asig_ciclo` (`asignatura_id`, `ciclo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
