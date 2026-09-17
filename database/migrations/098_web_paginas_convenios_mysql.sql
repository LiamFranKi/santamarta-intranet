-- Página Convenios de la web (textos, logos, fotos y PDF).
-- phpMyAdmin → SQL → pegar y Continuar.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `web_paginas_convenios` (
  `id` TINYINT UNSIGNED NOT NULL,
  `titulo` VARCHAR(120) NOT NULL DEFAULT 'Convenios',
  `subtitulo` VARCHAR(255) NOT NULL DEFAULT 'Alianzas estratégicas para una educación integral',
  `intro` TEXT NULL,
  `cta_texto` VARCHAR(255) NOT NULL DEFAULT '¿Interesado en nuestros convenios? Contáctanos para más información sobre cómo participar en estos programas.',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `web_paginas_convenios` (`id`, `titulo`, `subtitulo`, `intro`, `cta_texto`)
VALUES (
  1,
  'Convenios',
  'Alianzas estratégicas para una educación integral',
  'Trabajamos con instituciones reconocidas para ofrecer programas de excelencia que complementan nuestra formación académica.',
  '¿Interesado en nuestros convenios? Contáctanos para más información sobre cómo participar en estos programas.'
);

CREATE TABLE IF NOT EXISTS `web_paginas_convenio_items` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(120) NOT NULL,
  `descripcion` VARCHAR(400) NOT NULL DEFAULT '',
  `beneficios` TEXT NULL,
  `color` VARCHAR(80) NOT NULL DEFAULT 'from-green-500 to-emerald-500',
  `logo_ruta` VARCHAR(255) NOT NULL DEFAULT '',
  `imagen_ruta` VARCHAR(255) NOT NULL DEFAULT '',
  `pdf_ruta` VARCHAR(255) NOT NULL DEFAULT '',
  `orden` INT NOT NULL DEFAULT 1,
  `activo` TINYINT(1) NOT NULL DEFAULT 1,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_convenio_items_orden` (`activo`, `orden`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `web_paginas_convenio_items`
  (`id`, `nombre`, `descripcion`, `beneficios`, `color`, `logo_ruta`, `imagen_ruta`, `pdf_ruta`, `orden`, `activo`)
VALUES
  (
    1,
    'Cambridge (Inglés)',
    'Programa de inglés certificado por Cambridge Assessment English',
    'Certificación internacional reconocida\nMetodología comunicativa\nPreparación para exámenes Cambridge\nDocentes certificados',
    'from-green-500 to-emerald-500',
    '',
    '',
    '/documentos/ConvenioCambridge.pdf',
    1,
    1
  ),
  (
    2,
    'AquaXtreme (Natación)',
    'Programa de natación y desarrollo acuático',
    'Instalaciones modernas\nInstructores certificados\nDesarrollo físico integral\nSeguridad y supervisión constante',
    'from-cyan-500 to-blue-500',
    '',
    '',
    '/documentos/ConvenioAquaxtreme.pdf',
    2,
    1
  ),
  (
    3,
    'Valley (Robótica)',
    'Programa de robótica y tecnología educativa',
    'Pensamiento computacional\nProyectos prácticos\nCompetencias y concursos\nPreparación para el futuro tecnológico',
    'from-purple-500 to-pink-500',
    '',
    '',
    '/documentos/ConvenioValley.pdf',
    3,
    1
  );
