-- Cupo de fiado del kiosco: por pedido, por día y general.
-- El papá guarda el cupo de su hijo en kiosco_limite_hijo.
-- Si una columna ya existe, ese paso no cambia nada.

CREATE TABLE IF NOT EXISTS kiosco_limite_hijo (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  colegio_id INT NOT NULL,
  alumno_id INT NOT NULL,
  dia_activo TINYINT(1) NOT NULL DEFAULT 0,
  dia_monto DECIMAL(10,2) NOT NULL DEFAULT 0,
  general_activo TINYINT(1) NOT NULL DEFAULT 0,
  general_monto DECIMAL(10,2) NOT NULL DEFAULT 0,
  general_desde DATETIME NULL,
  actualizado_en DATETIME NULL,
  UNIQUE KEY uq_kiosco_limite_hijo (colegio_id, alumno_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @db = DATABASE();

SET @q = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'kiosco_config' AND COLUMN_NAME = 'limite_dia_activo') = 0,
  'ALTER TABLE kiosco_config ADD COLUMN limite_dia_activo TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'));
PREPARE stmt FROM @q; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @q = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'kiosco_config' AND COLUMN_NAME = 'limite_dia_monto') = 0,
  'ALTER TABLE kiosco_config ADD COLUMN limite_dia_monto DECIMAL(10,2) NOT NULL DEFAULT 0',
  'SELECT 1'));
PREPARE stmt FROM @q; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @q = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'kiosco_config' AND COLUMN_NAME = 'limite_general_activo') = 0,
  'ALTER TABLE kiosco_config ADD COLUMN limite_general_activo TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'));
PREPARE stmt FROM @q; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @q = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'kiosco_config' AND COLUMN_NAME = 'limite_general_monto') = 0,
  'ALTER TABLE kiosco_config ADD COLUMN limite_general_monto DECIMAL(10,2) NOT NULL DEFAULT 0',
  'SELECT 1'));
PREPARE stmt FROM @q; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @q = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'kiosco_config' AND COLUMN_NAME = 'limite_general_desde') = 0,
  'ALTER TABLE kiosco_config ADD COLUMN limite_general_desde DATETIME NULL',
  'SELECT 1'));
PREPARE stmt FROM @q; EXECUTE stmt; DEALLOCATE PREPARE stmt;
