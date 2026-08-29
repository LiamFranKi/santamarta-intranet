-- El anfitrión puede permitir que los convocados editen el acta (por defecto solo ven).
SET @db := DATABASE();
SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'reuniones' AND COLUMN_NAME = 'acta_editable'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE reuniones ADD COLUMN acta_editable TINYINT(1) NOT NULL DEFAULT 0 AFTER acuerdos',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
