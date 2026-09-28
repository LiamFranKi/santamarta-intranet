-- Archivo propio del maestro para la teoría o la ficha.
-- Si está vacío, el PDF lo arma el sistema a partir del texto de la IA.

SET @db := DATABASE();

SET @existe_t := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'cneb_sesiones' AND COLUMN_NAME = 'archivo_teoria'
);
SET @sql_t := IF(@existe_t = 0,
  'ALTER TABLE `cneb_sesiones` ADD COLUMN `archivo_teoria` VARCHAR(180) NULL AFTER `material_teoria`',
  'SELECT 1');
PREPARE stmt FROM @sql_t;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @existe_f := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'cneb_sesiones' AND COLUMN_NAME = 'archivo_ficha'
);
SET @sql_f := IF(@existe_f = 0,
  'ALTER TABLE `cneb_sesiones` ADD COLUMN `archivo_ficha` VARCHAR(180) NULL AFTER `archivo_teoria`',
  'SELECT 1');
PREPARE stmt FROM @sql_f;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
