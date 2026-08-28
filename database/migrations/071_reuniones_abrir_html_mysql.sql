-- Quien puede abrir la reunión (personal delegado) + acta/acuerdos/agenda en HTML (Quill).
-- Idempotente: si 070 ya traía abrir_usuario_id, solo ensancha las columnas de texto.

SET @db := DATABASE();
SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'reuniones' AND COLUMN_NAME = 'abrir_usuario_id'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE reuniones ADD COLUMN abrir_usuario_id INT NULL AFTER creador_usuario_id, ADD KEY idx_reuniones_abrir (abrir_usuario_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ALTER TABLE reuniones
  MODIFY COLUMN descripcion MEDIUMTEXT NULL,
  MODIFY COLUMN acta MEDIUMTEXT NULL,
  MODIFY COLUMN acuerdos MEDIUMTEXT NULL;
