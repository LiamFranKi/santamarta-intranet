-- Migración 092: Piloto CNEB Inicial (catálogo oficial + mapeo de cursos del colegio)
-- NO altera cursos, areas, asignaturas, libreta_inicial_* ni notas.
-- El catálogo nacional se siembra desde backend/data/cnebInicialCatalogo.js (idempotente).

CREATE TABLE IF NOT EXISTS `cneb_areas` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `codigo` VARCHAR(40) NOT NULL,
  `nombre` VARCHAR(160) NOT NULL,
  `nivel_cneb` VARCHAR(20) NOT NULL DEFAULT 'INICIAL',
  `ciclo` VARCHAR(8) NOT NULL DEFAULT 'II',
  `tipo` ENUM('curricular','religion','transversal') NOT NULL DEFAULT 'curricular',
  `descripcion` VARCHAR(400) NULL,
  `orden` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `fuente` VARCHAR(255) NULL,
  `activo` TINYINT(1) NOT NULL DEFAULT 1,
  `creado_en` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cneb_area_codigo_nivel` (`codigo`, `nivel_cneb`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cneb_competencias` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `area_id` INT UNSIGNED NOT NULL,
  `codigo` VARCHAR(40) NOT NULL,
  `nombre` VARCHAR(400) NOT NULL,
  `estandar_ciclo` TEXT NULL,
  `orden` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `activo` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cneb_comp_area_codigo` (`area_id`, `codigo`),
  KEY `idx_cneb_comp_area` (`area_id`),
  CONSTRAINT `fk_cneb_comp_area` FOREIGN KEY (`area_id`) REFERENCES `cneb_areas` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cneb_capacidades` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `competencia_id` INT UNSIGNED NOT NULL,
  `nombre` VARCHAR(255) NOT NULL,
  `orden` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_cneb_cap_comp` (`competencia_id`),
  CONSTRAINT `fk_cneb_cap_comp` FOREIGN KEY (`competencia_id`) REFERENCES `cneb_competencias` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cneb_desempenos` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `competencia_id` INT UNSIGNED NOT NULL,
  `edad` TINYINT UNSIGNED NOT NULL COMMENT '3, 4 o 5 años (ciclo II)',
  `texto` TEXT NOT NULL,
  `orden` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_cneb_des_comp_edad` (`competencia_id`, `edad`),
  CONSTRAINT `fk_cneb_des_comp` FOREIGN KEY (`competencia_id`) REFERENCES `cneb_competencias` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cneb_curso_mapa` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `colegio_id` INT NOT NULL,
  `curso_id` INT NOT NULL,
  `tipo` ENUM('principal','complementario') NOT NULL DEFAULT 'principal',
  `area_id` INT UNSIGNED NULL COMMENT 'Área CNEB si es principal',
  `actualizado_en` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cneb_mapa_colegio_curso` (`colegio_id`, `curso_id`),
  KEY `idx_cneb_mapa_area` (`area_id`),
  CONSTRAINT `fk_cneb_mapa_area` FOREIGN KEY (`area_id`) REFERENCES `cneb_areas` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
