-- Registro de que el usuario ya vio el aviso modal de una encuesta (una vez por encuesta).
CREATE TABLE IF NOT EXISTS encuestas_modal_visto (
  id INT(11) NOT NULL AUTO_INCREMENT,
  usuario_id INT(11) NOT NULL,
  encuesta_id INT(11) NOT NULL,
  colegio_id INT(11) NOT NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_usuario_encuesta (usuario_id, encuesta_id),
  KEY idx_usuario (usuario_id),
  KEY idx_encuesta (encuesta_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
