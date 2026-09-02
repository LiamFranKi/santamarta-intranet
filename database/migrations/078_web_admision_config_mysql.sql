-- Campaña de admisión (año + piezas de la web pública).
-- Una sola fila (id = 1). La intranet la edita; la web lee GET /api/public/admision-config.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `web_admision_config` (
  `id` TINYINT UNSIGNED NOT NULL,
  `anio` SMALLINT UNSIGNED NOT NULL DEFAULT 2027,
  `banner_flotante` TINYINT(1) NOT NULL DEFAULT 1,
  `chip_hero` TINYINT(1) NOT NULL DEFAULT 1,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `web_admision_config` (`id`, `anio`, `banner_flotante`, `chip_hero`)
VALUES (1, 2027, 1, 1);
