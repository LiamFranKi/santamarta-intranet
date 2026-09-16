-- Migración 094: sesiones CNEB (inicio / desarrollo / cierre + cotejo).
-- No altera temas del aula virtual, libreta ni notas.

CREATE TABLE IF NOT EXISTS `cneb_sesiones` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `colegio_id` INT NOT NULL,
  `anio` SMALLINT NOT NULL,
  `nivel_cneb` VARCHAR(20) NOT NULL,
  `grupo_id` INT NULL,
  `asignatura_id` INT NULL,
  `area_id` INT UNSIGNED NULL,
  `competencia_id` INT UNSIGNED NULL,
  `titulo` VARCHAR(220) NOT NULL,
  `proposito` TEXT NULL,
  `duracion_min` SMALLINT UNSIGNED NOT NULL DEFAULT 60,
  `corte` TINYINT UNSIGNED NULL COMMENT 'Edad 3-5 (Inicial) o grado 1-6/1-5',
  `fecha_sesion` DATE NULL,
  `estado` ENUM('borrador','aprobada') NOT NULL DEFAULT 'borrador',
  `creado_por` INT NULL,
  `creado_en` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cneb_ses_colegio_nivel` (`colegio_id`, `nivel_cneb`, `anio`),
  KEY `idx_cneb_ses_grupo` (`grupo_id`),
  KEY `idx_cneb_ses_area` (`area_id`),
  CONSTRAINT `fk_cneb_ses_area` FOREIGN KEY (`area_id`) REFERENCES `cneb_areas` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_cneb_ses_comp` FOREIGN KEY (`competencia_id`) REFERENCES `cneb_competencias` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cneb_sesion_desempenos` (
  `sesion_id` INT UNSIGNED NOT NULL,
  `desempeno_id` INT UNSIGNED NOT NULL,
  PRIMARY KEY (`sesion_id`, `desempeno_id`),
  KEY `idx_cneb_sesdes_des` (`desempeno_id`),
  CONSTRAINT `fk_cneb_sesdes_ses` FOREIGN KEY (`sesion_id`) REFERENCES `cneb_sesiones` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cneb_sesdes_des` FOREIGN KEY (`desempeno_id`) REFERENCES `cneb_desempenos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cneb_sesion_momentos` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `sesion_id` INT UNSIGNED NOT NULL,
  `tipo` ENUM('inicio','desarrollo','cierre') NOT NULL,
  `minutos` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `contenido` TEXT NULL,
  `orden` TINYINT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cneb_ses_momento` (`sesion_id`, `tipo`),
  CONSTRAINT `fk_cneb_sesmom_ses` FOREIGN KEY (`sesion_id`) REFERENCES `cneb_sesiones` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cneb_sesion_cotejo` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `sesion_id` INT UNSIGNED NOT NULL,
  `desempeno_id` INT UNSIGNED NULL,
  `item` TEXT NOT NULL,
  `orden` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_cneb_sescot_ses` (`sesion_id`),
  CONSTRAINT `fk_cneb_sescot_ses` FOREIGN KEY (`sesion_id`) REFERENCES `cneb_sesiones` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cneb_sescot_des` FOREIGN KEY (`desempeno_id`) REFERENCES `cneb_desempenos` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
