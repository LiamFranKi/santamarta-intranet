-- Banner principal de la portada (foto grande al abrir vanguardschools.com).
-- phpMyAdmin → SQL → pegar y Continuar.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `web_paginas_inicio` (
  `id` TINYINT UNSIGNED NOT NULL,
  `banner_ruta` VARCHAR(255) NOT NULL DEFAULT '/FONDOBANNER.jpg'
    COMMENT 'Foto grande del hero de la portada',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `web_paginas_inicio` (`id`, `banner_ruta`)
VALUES (1, '/FONDOBANNER.jpg');
