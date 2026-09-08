-- Estructura de temas/fichas del aula virtual (plantilla por bimestre + columnas en archivos).
-- Aplicar en MySQL (phpMyAdmin o CLI). No pisa contenido ya subido.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `aula_estructura_temas` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `colegio_id` INT UNSIGNED NOT NULL,
  `anio` INT NOT NULL,
  `temas_b1` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `temas_b2` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `temas_b3` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `temas_b4` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_aula_est_colegio_anio` (`colegio_id`, `anio`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @db := DATABASE();
SET @existe_tipo := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'asignaturas_archivos' AND COLUMN_NAME = 'item_tipo'
);
SET @sql_tipo := IF(
  @existe_tipo = 0,
  'ALTER TABLE `asignaturas_archivos` ADD COLUMN `item_tipo` VARCHAR(8) NULL DEFAULT NULL, ADD COLUMN `item_numero` SMALLINT UNSIGNED NULL DEFAULT NULL, ADD KEY `idx_asig_arch_tipo_num` (`asignatura_id`, `ciclo`, `item_tipo`, `item_numero`)',
  'SELECT 1'
);
PREPARE stmt_tipo FROM @sql_tipo;
EXECUTE stmt_tipo;
DEALLOCATE PREPARE stmt_tipo;
