-- Inversión pública por nivel (páginas /niveles/* de web-vanguard).
-- Un monto por nivel: todas las tarjetas de grado de ese nivel muestran el mismo precio.
-- Una sola fila (id = 1). La intranet la edita; la web lee MySQL (o GET /api/public/paginas-niveles).

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `web_paginas_niveles` (
  `id` TINYINT UNSIGNED NOT NULL,
  `monto_inicial` DECIMAL(10,2) NOT NULL DEFAULT 510.00,
  `monto_primaria` DECIMAL(10,2) NOT NULL DEFAULT 510.00,
  `monto_secundaria` DECIMAL(10,2) NOT NULL DEFAULT 530.00,
  `descuento_hermano` DECIMAL(10,2) NOT NULL DEFAULT 20.00,
  `texto_linea` VARCHAR(80) NOT NULL DEFAULT 'Matrícula y Pensión',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `web_paginas_niveles`
  (`id`, `monto_inicial`, `monto_primaria`, `monto_secundaria`, `descuento_hermano`, `texto_linea`)
VALUES (1, 510.00, 510.00, 530.00, 20.00, 'Matrícula y Pensión');
