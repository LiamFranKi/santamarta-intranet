-- Chat interno solo entre participantes de la reunión.
CREATE TABLE IF NOT EXISTS reuniones_chat (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  reunion_id INT UNSIGNED NOT NULL,
  usuario_id INT NOT NULL,
  mensaje TEXT NULL,
  nombre_original VARCHAR(255) NULL,
  nombre_archivo VARCHAR(255) NULL,
  mime_type VARCHAR(120) NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_rc_reunion (reunion_id),
  CONSTRAINT fk_rc_reunion FOREIGN KEY (reunion_id) REFERENCES reuniones (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
