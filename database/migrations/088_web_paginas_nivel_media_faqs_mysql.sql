-- Banners editables de páginas de niveles + FAQs por nivel.
-- phpMyAdmin → SQL → pegar y Continuar. (No repetir si ya se ejecutó.)

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `web_paginas_nivel_media` (
  `nivel` ENUM('inicial','primaria','secundaria') NOT NULL,
  `home_ruta` VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'Foto de la tarjeta en el INICIO (portada)',
  `hero_ruta` VARCHAR(255) NOT NULL DEFAULT '',
  `campus1_titulo` VARCHAR(80) NOT NULL DEFAULT '',
  `campus1_texto` VARCHAR(220) NOT NULL DEFAULT '',
  `campus1_ruta` VARCHAR(255) NOT NULL DEFAULT '',
  `campus2_titulo` VARCHAR(80) NOT NULL DEFAULT '',
  `campus2_texto` VARCHAR(220) NOT NULL DEFAULT '',
  `campus2_ruta` VARCHAR(255) NOT NULL DEFAULT '',
  `campus3_titulo` VARCHAR(80) NOT NULL DEFAULT '',
  `campus3_texto` VARCHAR(220) NOT NULL DEFAULT '',
  `campus3_ruta` VARCHAR(255) NOT NULL DEFAULT '',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`nivel`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `web_paginas_nivel_media` (
  `nivel`, `home_ruta`, `hero_ruta`,
  `campus1_titulo`, `campus1_texto`, `campus1_ruta`,
  `campus2_titulo`, `campus2_texto`, `campus2_ruta`,
  `campus3_titulo`, `campus3_texto`, `campus3_ruta`
) VALUES
(
  'inicial', '/inicial.jpeg', '/inicial.jpeg',
  'Piscina patera temperada', 'Natación desde inicial, con agua temperada y seguridad.', '/inicial.jpeg',
  'Canchas de grass sintético', 'Dos canchas profesionales (una techada) para el juego motor.', '/FONDOBANNER.jpg',
  'Campus de 7 500 m²', 'Infraestructura antisísmica, aulas amplias y libros COREFO incluidos.', '/primaria.jpeg'
),
(
  'primaria', '/primaria.jpeg', '/primaria.jpeg',
  'Piscinas temperadas', 'Semiolímpica y patera: natación como parte de la formación.', '/FONDOBANNER.jpg',
  '2 canchas sintéticas', 'Deporte de alto nivel en un campus de más de 7 500 m².', '/primaria.jpeg',
  'Lab de cómputo', 'Tecnología, intranet y app para familias. Exámenes y tareas virtuales.', '/secundaria.jpeg'
),
(
  'secundaria', '/secundaria.jpeg', '/secundaria.jpeg',
  'Piscina semiolímpica', 'Natación en instalaciones temperadas, nivel competencia y salud.', '/FONDOBANNER.jpg',
  'Canchas profesionales', 'Dos grass sintéticos (uno techado) para fútbol, vóley y más.', '/primaria.jpeg',
  'Tecnología e intranet', 'Tablets, libros digitales, exámenes en línea y app para la familia.', '/secundaria.jpeg'
);

-- todos = las 3 páginas de nivel + la página general de FAQs
-- inicial | primaria | secundaria = solo esa página de nivel (+ la general)
ALTER TABLE `web_faqs`
  ADD COLUMN `pagina_nivel` VARCHAR(20) NOT NULL DEFAULT 'todos'
    COMMENT 'todos | inicial | primaria | secundaria' AFTER `activo`;
