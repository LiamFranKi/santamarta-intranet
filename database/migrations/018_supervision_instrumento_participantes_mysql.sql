-- Participantes asociados a una supervisión (rúbrica) concreta: personal que forma parte / seguimiento.
-- Ejecutar en la misma base MySQL que el intranet.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `supervision_instrumento_participantes` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `colegio_id` INT NOT NULL,
  `instrumento_id` INT UNSIGNED NOT NULL,
  `usuario_id` INT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sup_part_inst_usr` (`colegio_id`, `instrumento_id`, `usuario_id`),
  KEY `idx_sup_part_inst` (`instrumento_id`),
  CONSTRAINT `fk_sup_part_inst` FOREIGN KEY (`instrumento_id`) REFERENCES `supervision_instrumentos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
