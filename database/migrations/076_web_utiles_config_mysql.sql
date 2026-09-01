-- Interruptor global: permitir o bloquear TODAS las descargas de listas de útiles en la web pública.
-- La intranet guarda el flag; GET /api/public/utiles lo expone para web-vanguard.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `web_utiles_config` (
  `id` TINYINT UNSIGNED NOT NULL,
  `descargas_habilitadas` TINYINT(1) NOT NULL DEFAULT 0,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `web_utiles_config` (`id`, `descargas_habilitadas`) VALUES (1, 0);
