-- Nota del docente para regenerar una sesión sin cambiar el prompt madre.

SET @db := DATABASE();

SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'cneb_sesiones' AND COLUMN_NAME = 'indicacion_ia'
);
SET @sql := IF(@existe = 0,
  'ALTER TABLE `cneb_sesiones` ADD COLUMN `indicacion_ia` VARCHAR(800) NULL',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
