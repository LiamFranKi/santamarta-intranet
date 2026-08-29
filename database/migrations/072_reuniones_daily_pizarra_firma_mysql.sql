-- Daily (sala embebida), pizarra colaborativa y firma de sesión.
-- video_proveedor reserva LIVEKIT para más adelante (aún no se usa).
-- Idempotente.

SET @db := DATABASE();

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'reuniones' AND COLUMN_NAME = 'video_proveedor'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE reuniones ADD COLUMN video_proveedor VARCHAR(20) NOT NULL DEFAULT ''DAILY'' AFTER enlace_videollamada',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'reuniones' AND COLUMN_NAME = 'daily_room_name'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE reuniones ADD COLUMN daily_room_name VARCHAR(120) NULL AFTER video_proveedor',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'reuniones' AND COLUMN_NAME = 'pizarra_json'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE reuniones ADD COLUMN pizarra_json MEDIUMTEXT NULL AFTER acuerdos',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'reuniones' AND COLUMN_NAME = 'pizarra_imagen'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE reuniones ADD COLUMN pizarra_imagen VARCHAR(255) NULL AFTER pizarra_json',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'reuniones' AND COLUMN_NAME = 'pizarra_updated_at'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE reuniones ADD COLUMN pizarra_updated_at DATETIME NULL AFTER pizarra_imagen',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'reuniones_participantes' AND COLUMN_NAME = 'firmado_en'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE reuniones_participantes ADD COLUMN firmado_en DATETIME NULL AFTER asistencia_en',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'reuniones_participantes' AND COLUMN_NAME = 'firma_data'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE reuniones_participantes ADD COLUMN firma_data MEDIUMTEXT NULL AFTER firmado_en',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
