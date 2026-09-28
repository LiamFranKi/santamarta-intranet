-- Texto de teoría del tema, aparte de la ficha de trabajo.
-- El estudiante lo lee (o el docente se lo lee). No es la hoja para dibujar.

SET @db := DATABASE();
SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'cneb_sesiones' AND COLUMN_NAME = 'material_teoria'
);
SET @sql := IF(@existe = 0,
  'ALTER TABLE `cneb_sesiones` ADD COLUMN `material_teoria` MEDIUMTEXT NULL AFTER `ficha_estudiante`',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
