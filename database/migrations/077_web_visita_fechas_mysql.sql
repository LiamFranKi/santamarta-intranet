-- Visitas guiadas: fechas concretas además de “todos los martes/jueves”.
-- modo_fechas = semana  → igual que hoy (días de la semana a futuro).
-- modo_fechas = lista   → solo las fechas de web_visita_fechas (activas y posteriores a hoy).

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `web_visita_config` (
  `id` TINYINT UNSIGNED NOT NULL,
  `modo_fechas` VARCHAR(16) NOT NULL DEFAULT 'semana' COMMENT 'semana | lista',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `web_visita_config` (`id`, `modo_fechas`) VALUES (1, 'semana');

CREATE TABLE IF NOT EXISTS `web_visita_fechas` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `fecha` DATE NOT NULL,
  `activo` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_web_visita_fecha` (`fecha`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
