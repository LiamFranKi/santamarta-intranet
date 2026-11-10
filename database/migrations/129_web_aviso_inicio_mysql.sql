-- Aviso emergente de la portada (imagen con X al abrir la web).
-- phpMyAdmin → SQL → pegar y Continuar.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `web_aviso_inicio` (
  `id` TINYINT UNSIGNED NOT NULL,
  `activo` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = se muestra al entrar a la web',
  `imagen_ruta` VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'Ruta pública, ej. /aviso/aviso-1.jpg',
  `enlace` VARCHAR(500) NOT NULL DEFAULT '' COMMENT 'Opcional. https:// o ruta / de la web',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `web_aviso_inicio` (`id`, `activo`, `imagen_ruta`, `enlace`)
VALUES (1, 0, '', '');
