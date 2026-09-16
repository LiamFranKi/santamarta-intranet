-- Migración 095: registro auxiliar, corte cualitativo, prompt e historial IA.
-- No altera notas vigentes ni libreta_inicial_*.

CREATE TABLE IF NOT EXISTS `cneb_ajustes` (
  `colegio_id` INT NOT NULL,
  `prompt_sesion` LONGTEXT NULL,
  `actualizado_en` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`colegio_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cneb_ia_trabajos` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `colegio_id` INT NOT NULL,
  `sesion_id` INT UNSIGNED NULL,
  `proveedor` VARCHAR(32) NOT NULL DEFAULT 'gemini',
  `modelo` VARCHAR(64) NULL,
  `prompt_usado` LONGTEXT NULL,
  `json_respuesta` LONGTEXT NULL,
  `error_texto` VARCHAR(500) NULL,
  `tokens_entrada` INT NULL,
  `tokens_salida` INT NULL,
  `creado_por` INT NULL,
  `creado_en` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cneb_ia_colegio` (`colegio_id`, `creado_en`),
  KEY `idx_cneb_ia_sesion` (`sesion_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cneb_cotejo_valores` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `sesion_id` INT UNSIGNED NOT NULL,
  `cotejo_id` INT UNSIGNED NOT NULL,
  `matricula_id` INT NOT NULL,
  `logro` ENUM('si','en_proceso','no') NOT NULL DEFAULT 'en_proceso',
  `observacion` VARCHAR(400) NULL,
  `actualizado_en` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cneb_cotejo_val` (`sesion_id`, `cotejo_id`, `matricula_id`),
  KEY `idx_cneb_cotejo_mat` (`matricula_id`),
  CONSTRAINT `fk_cneb_cotval_ses` FOREIGN KEY (`sesion_id`) REFERENCES `cneb_sesiones` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cneb_cotval_item` FOREIGN KEY (`cotejo_id`) REFERENCES `cneb_sesion_cotejo` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cneb_periodo_competencia` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `colegio_id` INT NOT NULL,
  `anio` SMALLINT NOT NULL,
  `bimestre` TINYINT NOT NULL,
  `matricula_id` INT NOT NULL,
  `competencia_id` INT UNSIGNED NOT NULL,
  `letra` ENUM('AD','A','B','C') NULL,
  `conclusion` TEXT NULL,
  `actualizado_en` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cneb_periodo_comp` (`colegio_id`, `anio`, `bimestre`, `matricula_id`, `competencia_id`),
  KEY `idx_cneb_periodo_mat` (`matricula_id`),
  CONSTRAINT `fk_cneb_per_comp` FOREIGN KEY (`competencia_id`) REFERENCES `cneb_competencias` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
