-- Interruptor de estructura de temas: 1 = generar huecos (comportamiento actual), 0 = aula en blanco.
-- No pisa temas_b1..b4 ni archivos ya subidos.

SET NAMES utf8mb4;

SET @db := DATABASE();
SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'aula_estructura_temas'
    AND COLUMN_NAME = 'activo'
);
SET @sql := IF(
  @existe = 0,
  'ALTER TABLE `aula_estructura_temas` ADD COLUMN `activo` TINYINT(1) NOT NULL DEFAULT 1 AFTER `temas_b4`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
