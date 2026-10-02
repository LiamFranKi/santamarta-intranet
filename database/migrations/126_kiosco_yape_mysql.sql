-- Número y QR de Yape del kiosco. El papá los ve al pagar.
-- Si la columna ya existe, ese paso no cambia nada.

SET @db = DATABASE();

SET @q = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'kiosco_config' AND COLUMN_NAME = 'yape_numero') = 0,
  'ALTER TABLE kiosco_config ADD COLUMN yape_numero VARCHAR(20) NOT NULL DEFAULT ''''',
  'SELECT 1'
));
PREPARE stmt FROM @q;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @q = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'kiosco_config' AND COLUMN_NAME = 'yape_qr_url') = 0,
  'ALTER TABLE kiosco_config ADD COLUMN yape_qr_url VARCHAR(500) NOT NULL DEFAULT ''''',
  'SELECT 1'
));
PREPARE stmt FROM @q;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
