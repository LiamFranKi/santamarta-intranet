-- Supervisión de personal: visitas programadas (Plan B).
-- No toca rúbricas / instrumentos (016); se reutilizan si se reactivan en UI.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `supervision_visitas` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `colegio_id` INT NOT NULL,
  `anio` INT NULL,
  `creador_usuario_id` INT NOT NULL,
  `titulo` VARCHAR(255) NOT NULL,
  `tipo` ENUM('DOCENTE','TUTOR','MANTENIMIENTO','OTRO') NOT NULL DEFAULT 'DOCENTE',
  `fecha` DATE NOT NULL,
  `hora_inicio` TIME NULL,
  `hora_fin` TIME NULL,
  `lugar` VARCHAR(255) NULL,
  `estado` ENUM('PROGRAMADA','EN_CURSO','CERRADA','CANCELADA') NOT NULL DEFAULT 'PROGRAMADA',
  `checklist_json` MEDIUMTEXT NULL,
  `observaciones` TEXT NULL,
  `acuerdos` TEXT NULL,
  `cerrada_en` DATETIME NULL,
  `cerrada_por` INT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sup_vis_colegio_fecha` (`colegio_id`, `fecha`),
  KEY `idx_sup_vis_estado` (`colegio_id`, `estado`),
  KEY `idx_sup_vis_creador` (`creador_usuario_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `supervision_visita_personas` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `visita_id` INT UNSIGNED NOT NULL,
  `usuario_id` INT NOT NULL,
  `rol` ENUM('SUPERVISOR','SUPERVISADO') NOT NULL,
  `comentario` TEXT NULL,
  `firma_data` MEDIUMTEXT NULL,
  `firmado_en` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sup_vis_persona` (`visita_id`, `usuario_id`),
  KEY `idx_sup_vis_per_usuario` (`usuario_id`),
  CONSTRAINT `fk_sup_vis_per_visita` FOREIGN KEY (`visita_id`) REFERENCES `supervision_visitas` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
