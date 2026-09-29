-- Cupo diario del chat y el historial de mensajes.
-- El administrador no tiene límite. El apoderado no usa este chat.

SET @db := DATABASE();

SET @c1 := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'mascota_colegio' AND COLUMN_NAME = 'preguntas_alumno'
);
SET @sql := IF(@c1 = 0,
  'ALTER TABLE mascota_colegio ADD COLUMN preguntas_alumno INT NOT NULL DEFAULT 3',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c2 := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'mascota_colegio' AND COLUMN_NAME = 'preguntas_docente'
);
SET @sql := IF(@c2 = 0,
  'ALTER TABLE mascota_colegio ADD COLUMN preguntas_docente INT NOT NULL DEFAULT 5',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c3 := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'mascota_colegio' AND COLUMN_NAME = 'preguntas_personal'
);
SET @sql := IF(@c3 = 0,
  'ALTER TABLE mascota_colegio ADD COLUMN preguntas_personal INT NOT NULL DEFAULT 6',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS vanguarcito_uso (
  colegio_id INT NOT NULL,
  usuario_id INT NOT NULL,
  fecha DATE NOT NULL,
  usadas INT NOT NULL DEFAULT 0,
  PRIMARY KEY (colegio_id, usuario_id, fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS vanguarcito_mensaje (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  colegio_id INT NOT NULL,
  usuario_id INT NOT NULL,
  rol VARCHAR(12) NOT NULL,
  texto MEDIUMTEXT NOT NULL,
  creado_en DATETIME NOT NULL,
  KEY idx_vanguarcito_msg (colegio_id, usuario_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
