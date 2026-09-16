-- Migración 096: ficha de trabajo del estudiante en la sesión CNEB.
-- No altera notas ni libreta.

SET @db := DATABASE();
SET @ex := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'cneb_sesiones' AND COLUMN_NAME = 'ficha_estudiante'
);
SET @sql := IF(
  @ex = 0,
  'ALTER TABLE `cneb_sesiones` ADD COLUMN `ficha_estudiante` TEXT NULL AFTER `proposito`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
