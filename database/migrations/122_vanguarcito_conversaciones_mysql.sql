-- Cada chat de la mascota queda en su propia conversación.
-- Lo ya escrito pasa a un chat llamado con la primera pregunta.

CREATE TABLE IF NOT EXISTS vanguarcito_conversacion (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  colegio_id INT NOT NULL,
  usuario_id INT NOT NULL,
  titulo VARCHAR(120) NOT NULL DEFAULT 'Chat',
  creado_en DATETIME NOT NULL,
  actualizado_en DATETIME NOT NULL,
  KEY idx_vg_conv (colegio_id, usuario_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @db := DATABASE();
SET @c := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'vanguarcito_mensaje' AND COLUMN_NAME = 'conversacion_id'
);
SET @sql := IF(@c = 0,
  'ALTER TABLE vanguarcito_mensaje ADD COLUMN conversacion_id INT NULL, ADD KEY idx_vanguarcito_conv (conversacion_id, id)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
