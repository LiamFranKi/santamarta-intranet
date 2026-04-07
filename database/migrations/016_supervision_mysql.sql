-- Módulo SUPERVISIÓN: instrumentos (rúbricas), preguntas, niveles, rangos, cierre, supervisores y evaluaciones.
-- Ejecutar en la misma base MySQL que usa el intranet (colegios, grupos, usuarios, personal, asignaturas).

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `supervision_instrumentos` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `colegio_id` INT NOT NULL,
  `anio` INT NULL COMMENT 'NULL = visible en cualquier año activo',
  `titulo` VARCHAR(255) NOT NULL,
  `descripcion` TEXT NULL,
  `activo` TINYINT(1) NOT NULL DEFAULT 1,
  `cierre_usa_global` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=usa campos globales del colegio; 0=campos propios del instrumento',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sup_inst_colegio_activo` (`colegio_id`, `activo`),
  KEY `idx_sup_inst_anio` (`colegio_id`, `anio`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `supervision_preguntas` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `instrumento_id` INT UNSIGNED NOT NULL,
  `orden` INT NOT NULL DEFAULT 0,
  `titulo` VARCHAR(500) NOT NULL,
  `texto_ayuda` TEXT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_sup_preg_inst` (`instrumento_id`, `orden`),
  CONSTRAINT `fk_sup_preg_inst` FOREIGN KEY (`instrumento_id`) REFERENCES `supervision_instrumentos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `supervision_pregunta_niveles` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `pregunta_id` INT UNSIGNED NOT NULL,
  `orden` INT NOT NULL DEFAULT 0,
  `valor_numerico` DECIMAL(10,2) NOT NULL COMMENT 'Puntaje que aporta elegir este nivel',
  `etiqueta` VARCHAR(120) NULL COMMENT 'Ej. Bajo, Medio, Alto',
  `descripcion` TEXT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_sup_nivel_preg` (`pregunta_id`, `orden`),
  CONSTRAINT `fk_sup_nivel_preg` FOREIGN KEY (`pregunta_id`) REFERENCES `supervision_preguntas` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `supervision_rangos_resultado` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `instrumento_id` INT UNSIGNED NOT NULL,
  `orden` INT NOT NULL DEFAULT 0,
  `puntaje_min` DECIMAL(10,2) NOT NULL,
  `puntaje_max` DECIMAL(10,2) NOT NULL,
  `etiqueta` VARCHAR(200) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_sup_rango_inst` (`instrumento_id`, `orden`),
  CONSTRAINT `fk_sup_rango_inst` FOREIGN KEY (`instrumento_id`) REFERENCES `supervision_instrumentos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `supervision_campos_cierre` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `colegio_id` INT NOT NULL,
  `instrumento_id` INT UNSIGNED NULL COMMENT 'NULL = plantilla global del colegio',
  `orden` INT NOT NULL DEFAULT 0,
  `etiqueta` VARCHAR(200) NOT NULL,
  `requerido` TINYINT(1) NOT NULL DEFAULT 0,
  `tipo` ENUM('texto','textarea') NOT NULL DEFAULT 'textarea',
  PRIMARY KEY (`id`),
  KEY `idx_sup_cierre_colegio` (`colegio_id`, `instrumento_id`, `orden`),
  CONSTRAINT `fk_sup_cierre_inst` FOREIGN KEY (`instrumento_id`) REFERENCES `supervision_instrumentos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `supervision_supervisores` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `colegio_id` INT NOT NULL,
  `usuario_id` INT NOT NULL,
  `activo` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sup_sup_colegio_usuario` (`colegio_id`, `usuario_id`),
  KEY `idx_sup_sup_usuario` (`usuario_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `supervision_evaluaciones` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `instrumento_id` INT UNSIGNED NOT NULL,
  `colegio_id` INT NOT NULL,
  `anio` INT NOT NULL,
  `grupo_id` INT NOT NULL,
  `personal_id_evaluado` INT NOT NULL,
  `usuario_id_evaluador` INT NOT NULL,
  `fecha_evaluacion` DATE NOT NULL,
  `puntaje_total` DECIMAL(10,2) NOT NULL,
  `resultado_etiqueta` VARCHAR(200) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sup_eval_colegio_fecha` (`colegio_id`, `fecha_evaluacion`),
  KEY `idx_sup_eval_personal` (`colegio_id`, `personal_id_evaluado`),
  KEY `idx_sup_eval_inst` (`instrumento_id`),
  CONSTRAINT `fk_sup_eval_inst` FOREIGN KEY (`instrumento_id`) REFERENCES `supervision_instrumentos` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `supervision_evaluacion_detalle` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `evaluacion_id` INT UNSIGNED NOT NULL,
  `pregunta_id` INT UNSIGNED NOT NULL,
  `nivel_id` INT UNSIGNED NOT NULL,
  `puntaje` DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sup_eval_det` (`evaluacion_id`, `pregunta_id`),
  KEY `idx_sup_eval_det_eval` (`evaluacion_id`),
  CONSTRAINT `fk_sup_evaldet_eval` FOREIGN KEY (`evaluacion_id`) REFERENCES `supervision_evaluaciones` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sup_evaldet_nivel` FOREIGN KEY (`nivel_id`) REFERENCES `supervision_pregunta_niveles` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `supervision_evaluacion_observaciones` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `evaluacion_id` INT UNSIGNED NOT NULL,
  `campo_cierre_id` INT UNSIGNED NULL COMMENT 'Referencia opcional; la etiqueta se guarda en snapshot',
  `etiqueta_snapshot` VARCHAR(200) NOT NULL,
  `valor` TEXT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_sup_eval_obs_eval` (`evaluacion_id`),
  CONSTRAINT `fk_sup_evalobs_eval` FOREIGN KEY (`evaluacion_id`) REFERENCES `supervision_evaluaciones` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
