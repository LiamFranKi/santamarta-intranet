-- Captura de Yape de un pedido del kiosco. No marca el pedido como pagado.
-- Si la columna ya existe, este paso no cambia nada.

SET @db = DATABASE();

SET @q = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'kiosco_pedidos' AND COLUMN_NAME = 'comprobante_url') = 0,
  'ALTER TABLE kiosco_pedidos ADD COLUMN comprobante_url VARCHAR(500) NOT NULL DEFAULT '''' AFTER nota',
  'SELECT 1'
));
PREPARE stmt FROM @q;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
