-- Horario esqueleto SGOI: plantilla semanal + franjas de un día (sin tocar la plantilla al editar “solo hoy”).

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `sgoi_plantilla_bloques` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `colegio_id` INT UNSIGNED NOT NULL,
  `usuario_id` INT UNSIGNED NOT NULL,
  `weekday` TINYINT UNSIGNED NOT NULL COMMENT '1=lunes … 7=domingo',
  `hora_ini` TIME NOT NULL,
  `hora_fin` TIME NOT NULL,
  `titulo` VARCHAR(160) NOT NULL,
  `tipo` VARCHAR(24) NOT NULL DEFAULT 'DESARROLLO',
  `orden` SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sgoi_plt_user_day` (`colegio_id`, `usuario_id`, `weekday`, `hora_ini`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sgoi_dia_bloques` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `colegio_id` INT UNSIGNED NOT NULL,
  `usuario_id` INT UNSIGNED NOT NULL,
  `fecha` DATE NOT NULL,
  `hora_ini` TIME NOT NULL,
  `hora_fin` TIME NOT NULL,
  `titulo` VARCHAR(160) NOT NULL,
  `tipo` VARCHAR(24) NOT NULL DEFAULT 'DESARROLLO',
  `plantilla_id` INT UNSIGNED DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sgoi_dia_user_fecha` (`colegio_id`, `usuario_id`, `fecha`, `hora_ini`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
