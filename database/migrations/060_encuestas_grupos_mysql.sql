-- Encuestas: alcance por grupos (TODOS = todo el colegio; GRUPOS = solo grupos seleccionados).
-- Compatible con encuestas existentes (DEFAULT 'TODOS').

ALTER TABLE encuestas
  ADD COLUMN alcance_grupos VARCHAR(16) NOT NULL DEFAULT 'TODOS'
  COMMENT 'TODOS | GRUPOS';

CREATE TABLE IF NOT EXISTS encuestas_grupos (
  id INT(11) NOT NULL AUTO_INCREMENT,
  encuesta_id INT(11) NOT NULL,
  grupo_id INT(11) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_encuesta_grupo (encuesta_id, grupo_id),
  KEY idx_encuesta (encuesta_id),
  KEY idx_grupo (grupo_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
