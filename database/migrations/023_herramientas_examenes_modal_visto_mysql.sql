-- Registro de que el usuario ya vio el aviso modal de un examen de herramientas (una vez por examen).
-- Ejecutar UNA VEZ en vanguard_intranet tras 022.

CREATE TABLE IF NOT EXISTS herramientas_examenes_modal_visto (
  id INT(11) NOT NULL AUTO_INCREMENT,
  usuario_id INT(11) NOT NULL,
  examen_id INT(11) NOT NULL,
  colegio_id INT(11) NOT NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_hex_modal_usuario_examen (usuario_id, examen_id),
  KEY idx_hex_modal_usuario (usuario_id),
  KEY idx_hex_modal_examen (examen_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
