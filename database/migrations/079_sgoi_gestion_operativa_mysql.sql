-- Gestión operativa (SGOI). No reutiliza tareas/actividades/incidencias académicas.
-- Aplicar en MySQL (phpMyAdmin o CLI). Una vez por colegio basta: el área Sistemas se crea al primer uso.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `sgoi_areas` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `colegio_id` INT UNSIGNED NOT NULL,
  `nombre` VARCHAR(80) NOT NULL,
  `slug` VARCHAR(40) NOT NULL,
  `activo` TINYINT(1) NOT NULL DEFAULT 1,
  `orden` SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sgoi_areas_colegio_slug` (`colegio_id`, `slug`),
  KEY `idx_sgoi_areas_colegio_activo` (`colegio_id`, `activo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sgoi_miembros` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `colegio_id` INT UNSIGNED NOT NULL,
  `area_id` INT UNSIGNED NOT NULL,
  `personal_id` INT UNSIGNED NOT NULL,
  `activo` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sgoi_miembros_colegio_personal` (`colegio_id`, `personal_id`),
  KEY `idx_sgoi_miembros_area` (`area_id`, `activo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sgoi_pendientes` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `colegio_id` INT UNSIGNED NOT NULL,
  `area_id` INT UNSIGNED DEFAULT NULL,
  `usuario_id` INT UNSIGNED NOT NULL,
  `origen` VARCHAR(16) NOT NULL DEFAULT 'MANUAL',
  `origen_id` INT UNSIGNED DEFAULT NULL,
  `titulo` VARCHAR(200) NOT NULL,
  `descripcion` TEXT,
  `prioridad` VARCHAR(16) NOT NULL DEFAULT 'NORMAL',
  `estado` VARCHAR(16) NOT NULL DEFAULT 'ABIERTO',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `cerrado_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_sgoi_pend_colegio_estado` (`colegio_id`, `estado`),
  KEY `idx_sgoi_pend_usuario` (`usuario_id`, `estado`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sgoi_casos` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `colegio_id` INT UNSIGNED NOT NULL,
  `area_id` INT UNSIGNED DEFAULT NULL,
  `usuario_id` INT UNSIGNED NOT NULL,
  `personal_id` INT UNSIGNED DEFAULT NULL,
  `pendiente_id` INT UNSIGNED DEFAULT NULL,
  `codigo` VARCHAR(24) NOT NULL,
  `titulo` VARCHAR(200) NOT NULL DEFAULT 'Caso en atención',
  `nota` TEXT,
  `prioridad` VARCHAR(16) NOT NULL DEFAULT 'NORMAL',
  `estado` VARCHAR(16) NOT NULL DEFAULT 'EN_CURSO',
  `inicio_at` DATETIME NOT NULL,
  `fin_at` DATETIME DEFAULT NULL,
  `duracion_seg` INT UNSIGNED NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sgoi_casos_codigo` (`colegio_id`, `codigo`),
  KEY `idx_sgoi_casos_colegio_estado` (`colegio_id`, `estado`),
  KEY `idx_sgoi_casos_usuario_inicio` (`usuario_id`, `inicio_at`),
  KEY `idx_sgoi_casos_activo` (`colegio_id`, `usuario_id`, `estado`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sgoi_trabajos` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `colegio_id` INT UNSIGNED NOT NULL,
  `area_id` INT UNSIGNED DEFAULT NULL,
  `usuario_id` INT UNSIGNED NOT NULL,
  `personal_id` INT UNSIGNED DEFAULT NULL,
  `pendiente_id` INT UNSIGNED DEFAULT NULL,
  `codigo` VARCHAR(24) NOT NULL,
  `tipo` VARCHAR(24) NOT NULL DEFAULT 'DESARROLLO',
  `titulo` VARCHAR(200) NOT NULL DEFAULT 'Trabajo en curso',
  `nota` TEXT,
  `estado` VARCHAR(16) NOT NULL DEFAULT 'EN_CURSO',
  `inicio_at` DATETIME NOT NULL,
  `fin_at` DATETIME DEFAULT NULL,
  `duracion_seg` INT UNSIGNED NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sgoi_trabajos_codigo` (`colegio_id`, `codigo`),
  KEY `idx_sgoi_trab_colegio_estado` (`colegio_id`, `estado`),
  KEY `idx_sgoi_trab_usuario_inicio` (`usuario_id`, `inicio_at`),
  KEY `idx_sgoi_trab_activo` (`colegio_id`, `usuario_id`, `estado`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sgoi_seguimientos` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `colegio_id` INT UNSIGNED NOT NULL,
  `entidad` VARCHAR(16) NOT NULL,
  `entidad_id` INT UNSIGNED NOT NULL,
  `usuario_id` INT UNSIGNED NOT NULL,
  `texto` TEXT NOT NULL,
  `fecha_hora` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_sgoi_seg_entidad` (`colegio_id`, `entidad`, `entidad_id`),
  KEY `idx_sgoi_seg_fecha` (`fecha_hora`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
