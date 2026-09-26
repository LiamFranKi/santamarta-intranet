-- Unidad madre del bimestre (CNEB). No borra sesiones ni notas.
-- La sesión guarda su propia copia en cneb_sesiones.unidad: si el maestro la cambia, no altera la unidad madre.

CREATE TABLE IF NOT EXISTS `cneb_unidades` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `colegio_id` INT NOT NULL,
  `anio` SMALLINT NOT NULL,
  `nivel_cneb` VARCHAR(20) NOT NULL,
  `bimestre` TINYINT UNSIGNED NOT NULL,
  `nombre` VARCHAR(220) NOT NULL,
  `orden` SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_cneb_uni_nivel` (`colegio_id`, `anio`, `nivel_cneb`, `bimestre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @db := DATABASE();
SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'cneb_sesiones' AND COLUMN_NAME = 'unidad'
);
SET @sql := IF(@existe = 0,
  'ALTER TABLE `cneb_sesiones` ADD COLUMN `unidad` VARCHAR(220) NULL AFTER `titulo`',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
