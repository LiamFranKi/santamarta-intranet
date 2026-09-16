-- Migración 097: evidencia del aula ligada a una sesión CNEB.
-- No altera notas ni libreta.

SET @db := DATABASE();
SET @ex := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'asignaturas_evidencias' AND COLUMN_NAME = 'cneb_sesion_id'
);
SET @sql := IF(
  @ex = 0,
  'ALTER TABLE `asignaturas_evidencias` ADD COLUMN `cneb_sesion_id` INT UNSIGNED NULL AFTER `ciclo`, ADD KEY `idx_evidencias_cneb_sesion` (`cneb_sesion_id`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
