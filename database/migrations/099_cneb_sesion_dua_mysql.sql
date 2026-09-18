-- Migración 099: DUA de la sesión CNEB (evidencia de diseño inclusivo del aula).
-- No altera notas, corte AD/A/B/C, SIAGIE ni tablas PIAR.

SET @db := DATABASE();
SET @ex := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'cneb_sesiones' AND COLUMN_NAME = 'dua_json'
);
SET @sql := IF(
  @ex = 0,
  'ALTER TABLE `cneb_sesiones` ADD COLUMN `dua_json` JSON NULL AFTER `ficha_estudiante`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
